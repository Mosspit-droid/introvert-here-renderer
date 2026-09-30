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

async function main() {
  const specJson = process.env.RENDER_SPEC_JSON;
  const callbackUrl = process.env.CALLBACK_URL;

  if (!specJson) {
    throw new Error('RENDER_SPEC_JSON environment variable is required');
  }
  if (!callbackUrl) {
    throw new Error('CALLBACK_URL environment variable is required');
  }

  const spec = JSON.parse(specJson);

  const jobId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `render-${jobId}`);
  await fsp.mkdir(workDir, { recursive: true });

  const {
    textLines,
    backgroundImageUrl,
    productImages,
    charIntervalMs,
    holdAfterTypingMs,
    fps = 24,
    width = 1080,
    height = 1080,
  } = spec;

  const { html, totalDurationMs } = buildPage({
    textLines,
    backgroundImageUrl,
    productImages,
    charIntervalMs,
    holdAfterTypingMs,
    outputWidth: width,
    outputHeight: height,
  });

  let browser;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: workDir, size: { width, height } },
    });

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
