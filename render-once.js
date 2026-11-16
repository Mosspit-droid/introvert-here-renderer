'use strict';

/**
 * One-shot render job, meant to run inside a GitHub Actions workflow
 * instead of sitting inside an always-on web server. It does the exact
 * same work the old /render endpoint in server.js did (build the page,
 * record it with a real browser, convert to mp4) but:
 *   - reads its instructions from environment variables instead of an
 *     HTTP request body, since a GitHub Actions job is triggered with
 *     inputs, not a live HTTP connection it can reply on directly
 *   - sends the finished video onward itself, by POSTing it to a
 *     "callback" URL (a Make webhook), instead of streaming it back as
 *     an HTTP response, since there's no open connection to reply to
 *
 * Required environment variables:
 *   RENDER_SPEC_JSON - JSON string with the same shape the old /render
 *                       endpoint expected: { textLines, backgroundImageUrl,
 *                       productImages, charIntervalMs?, holdAfterTypingMs?,
 *                       fps?, width?, height? }
 *   CALLBACK_URL      - URL to POST the finished output.mp4 file to
 *                       (as multipart/form-data, field name "file")
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { chromium } = require('playwright');
const { buildPage } = require('./buildPage');

const execFileAsync = promisify(execFile);

async function uploadFile(callbackUrl, filePath) {
  const url = new URL(callbackUrl);
  const boundary = '----RenderBoundary' + crypto.randomBytes(8).toString('hex');
  const fileBuffer = await fsp.readFile(filePath);
  const filename = path.basename(filePath);

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: video/mp4\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([preamble, fileBuffer, closing]);

  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          console.log(`[callback] status=${res.statusCode} body=${data.slice(0, 500)}`);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Callback POST failed with status ${res.statusCode}: ${data.slice(0, 500)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Fetches a remote image over plain HTTP(S) and returns it as a data: URI.
//
// This exists because some image hosts (SharePoint/OneDrive "download"
// links in particular) serve their bytes with a
// `Content-Disposition: attachment` header. That header tells a real
// browser "this is a download, not something to display" - and Chromium
// honours it even for an <img> tag, firing the image's 'error' event
// instead of 'load' even though the bytes it got back are a perfectly
// valid image. A plain server-side fetch (this function) doesn't care
// about that header at all, so downloading the bytes ourselves and
// embedding them as a data: URI sidesteps the problem entirely - the
// browser never makes an HTTP request for the image, so there's no
// response header for it to react to. This also means the render no
// longer depends on any temporary/signed image URL staying valid for
// the few seconds between the page being built and the browser painting
// it.
function fetchAsDataUri(imageUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(imageUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    // Some hosts (SharePoint/OneDrive download links among them) sit
    // behind bot-mitigation that 403s a request with no (or an empty)
    // User-Agent header - Node's http(s) client sends none by default,
    // where curl and every real browser send one automatically. A
    // generic desktop-browser string is enough to get past that check.
    const requestOptions = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const req = lib.get(url, requestOptions, (res) => {
      // Follow a small number of redirects manually, since some image
      // hosts (this SharePoint link included) can issue a 301/302
      // before the final bytes.
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume(); // discard body
        resolve(fetchAsDataUri(new URL(res.headers.location, url).toString()));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Failed to fetch image (status ${res.statusCode}): ${imageUrl}`));
        return;
      }

      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        resolve(`data:${contentType};base64,${base64}`);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// Downloads backgroundImageUrl and every productImages[].url up front and
// replaces them with data: URIs, so the browser never fetches an external
// image URL directly (see fetchAsDataUri above for why).
// The video backgrounds live in this repo (backgrounds/IH.jpg etc.), so every
// collection uses the same 2026 logo size and position. If there is no file
// for a collection, the backgroundImageUrl Make sends is used instead.
function localBackground(collection) {
  const code = String(collection || '').toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const file = path.join(__dirname, 'backgrounds', `${code}.jpg`);
  if (!fs.existsSync(file)) return null;
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
}

// Optional see-through layer drawn OVER the text (backgrounds/<code>-front.png),
// e.g. the wire grille on the EXCLUSIVE. news-bill board.
function localFront(collection) {
  const code = String(collection || '').toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const file = path.join(__dirname, 'backgrounds', `${code}-front.png`);
  if (!fs.existsSync(file)) return null;
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function inlineImages(spec) {
  const local = localBackground(spec.collection);
  if (local) console.log(`[render-once] using built-in background for ${spec.collection}`);
  const backgroundImageUrl = local || (await fetchAsDataUri(spec.backgroundImageUrl));
  const frontImageUrl = localFront(spec.collection);
  if (frontImageUrl) console.log(`[render-once] using front overlay for ${spec.collection}`);

  const productImages = await Promise.all(
    (spec.productImages || []).map(async (img) => ({
      ...img,
      url: await fetchAsDataUri(img.url),
    }))
  );

  return { ...spec, backgroundImageUrl, frontImageUrl, productImages };
}

async function main() {
  const specJson = process.env.RENDER_SPEC_JSON;
  const callbackUrl = process.env.CALLBACK_URL;

  if (!specJson) {
    throw new Error('RENDER_SPEC_JSON environment variable is required');
  }
  if (!callbackUrl) {
    throw new Error('CALLBACK_URL environment variable is required');
  }

  const rawSpec = JSON.parse(specJson);

  console.log('[render-once] downloading background/product images...');
  const spec = await inlineImages(rawSpec);
  console.log('[render-once] images downloaded and inlined');

  const jobId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `render-${jobId}`);
  await fsp.mkdir(workDir, { recursive: true });

  const {
    textLines,
    backgroundImageUrl,
    frontImageUrl,
    productImages,
    charIntervalMs,
    holdAfterTypingMs,
    collection,
    textStyle,
    motion,
    teaser,
    fps = 24,
    width = 1080,
    height = 1080,
  } = spec;

  // The product code (e.g. PC-00003-HOODIE) rides along in the callback URL;
  // it picks this video's style so each garment's video looks different.
  let seed = spec.seed;
  try { seed = seed || new URL(callbackUrl).searchParams.get('product_code') || undefined; } catch (e) {}

  const { html, totalDurationMs, variant } = buildPage({
    textLines,
    backgroundImageUrl,
    frontImageUrl,
    productImages,
    charIntervalMs,
    holdAfterTypingMs,
    collection,
    seed,
    textStyle,
    motion,
    teaser,
    outputWidth: width,
    outputHeight: height,
  });

  console.log(`[render-once] ${seed || 'no product code'}: style ${JSON.stringify(variant)}`);

  let browser;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: workDir, size: { width, height } },
    });

    // The recording starts when the page opens, before anything is drawn
    // (a white then black flash). Note the time so it can be trimmed off.
    const recordingStartedAt = Date.now();
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[page console] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.error('[page error]', err);
    });

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });

    const safetyTimeoutMs = totalDurationMs + 15000;
    await page.waitForFunction('window.__DONE__ === true', null, {
      timeout: safetyTimeoutMs,
    });

    const firstFrameAt = await page.evaluate('window.__START_MS__ || 0');
    const trimSeconds = firstFrameAt ? Math.max(0, (firstFrameAt - recordingStartedAt) / 1000 + 0.08) : 0;
    console.log(`[render-once] trimming ${trimSeconds.toFixed(2)}s of blank start`);

    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();
    browser = null;

    if (!video) {
      throw new Error('Playwright did not produce a video recording for this page');
    }

    const rawVideoPath = await video.path();

    const finalMp4Path = path.join(workDir, 'output.mp4');
    const gop = fps * 2;
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', trimSeconds.toFixed(3),
      '-i', rawVideoPath,
      // Playwright's raw recording has no audio track at all. Some
      // platforms' upload validators (Etsy included, per observed
      // behaviour) reject an audio-less container even though playback
      // guides say audio isn't required - so we mux in a silent track.
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-r', String(fps),
      // Force constant frame rate output. Playwright's webm recording
      // has variable frame timing; -r alone (as an output option) is
      // supposed to resample to CFR, but -vsync cfr makes that explicit
      // and is the safer, well-documented way to guarantee it.
      '-vsync', 'cfr',
      '-vcodec', 'libx264',
      '-profile:v', 'high',
      '-level', '4.0',
      // Explicit keyframe interval (~every 2s) - some ingest validators
      // expect regular keyframes rather than an arbitrary/long GOP.
      '-g', String(gop),
      '-keyint_min', String(gop),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      finalMp4Path,
    ]);

    console.log('[render-once] video ready, uploading to callback URL...');
    await uploadFile(callbackUrl, finalMp4Path);
    console.log('[render-once] upload complete');
  } finally {
    try {
      if (browser) await browser.close();
    } catch (e) {
      // ignore
    }
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(
  () => {
    console.log('[render-once] done');
    process.exit(0);
  },
  (err) => {
    console.error('[render-once] failed:', err);
    process.exit(1);
  }
);
