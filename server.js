'use strict';

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { chromium } = require('playwright');
const { buildPage } = require('./buildPage');

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3000;

// Simple shared-secret auth so this endpoint isn't wide open on the
// public internet once deployed. Set RENDER_API_KEY in the hosting
// platform's environment variables, and have Make send the same value
// in an "x-api-key" header. If RENDER_API_KEY isn't set, auth is
// skipped (useful only for local testing - do NOT deploy without it).
function checkAuth(req, res, next) {
  const expected = process.env.RENDER_API_KEY;
  if (!expected) return next();
  const got = req.header('x-api-key');
  if (got !== expected) {
    return res.status(401).json({ success: false, error: 'Invalid or missing x-api-key header' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptimeSeconds: process.uptime() });
});

/**
 * POST /render
 * Body:
 * {
 *   "textLines": ["… EXCUSE THE SIGH.", "YOU CAUGHT ME OFF GUARD."],
 *   "backgroundImageUrl": "https://...",
 *   "productImages": [
 *     { "url": "https://...", "durationMs": 1700 },
 *     { "url": "https://...", "durationMs": 1700 }
 *   ],
 *   "charIntervalMs": 85.5,       // optional
 *   "holdAfterTypingMs": 500,     // optional
 *   "fps": 24,                    // optional
 *   "width": 1080,                // optional
 *   "height": 1080                // optional
 * }
 *
 * Response: the finished video, streamed back directly as
 * Content-Type: video/mp4. Make's HTTP module can save this response
 * body straight to a file (the same way it already handles binary
 * downloads elsewhere in this pipeline).
 */
app.post('/render', checkAuth, async (req, res) => {
  const jobId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `render-${jobId}`);
  let browser;

  try {
    const {
      textLines,
      backgroundImageUrl,
      productImages,
      charIntervalMs,
      holdAfterTypingMs,
      fps = 24,
      width = 1080,
      height = 1080,
    } = req.body || {};

    const { html, totalDurationMs } = buildPage({
      textLines,
      backgroundImageUrl,
      productImages,
      charIntervalMs,
      holdAfterTypingMs,
      outputWidth: width,
      outputHeight: height,
    });

    await fsp.mkdir(workDir, { recursive: true });

    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: {
        dir: workDir,
        size: { width, height },
      },
    });

    const page = await context.newPage();

    // Surface in-page console errors/exceptions in our own logs, since
    // there's no other way to see what happened inside the recorded
    // page if something goes wrong.
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[page console] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.error('[page error]', err);
    });

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });

    // Give the animation a generous safety margin over its own
    // computed duration in case image loads are slow.
    const safetyTimeoutMs = totalDurationMs + 15000;
    await page.waitForFunction('window.__DONE__ === true', null, {
      timeout: safetyTimeoutMs,
    });

    // Closing the page/context is what finalizes the recorded video
    // file to disk.
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
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawVideoPath,
      '-r', String(fps),
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      finalMp4Path,
    ]);

    const stat = await fsp.stat(finalMp4Path);

    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'inline; filename="render.mp4"');

    const readStream = fs.createReadStream(finalMp4Path);
    readStream.pipe(res);
    readStream.on('close', () => {
      // Best-effort cleanup; don't block the response on this.
      fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });
    readStream.on('error', (err) => {
      console.error('[stream error]', err);
      fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err) {
    console.error('[render error]', err);
    try {
      if (browser) await browser.close();
    } catch (e) {
      // ignore
    }
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Renderer listening on port ${PORT}`);
});
