'use strict';

/**
 * One-off diagnostic job: fetches a single URL exactly the way
 * fetchAsDataUri() in render-once.js does (same User-Agent, same
 * redirect-following), but instead of building a data URI it reports
 * what actually came back - status code(s), headers, byte length, and
 * whether the bytes look like a valid PNG - as JSON POSTed to a
 * callback URL. This exists purely to isolate why the Y003 background
 * image fetch is failing in the real render pipeline while product
 * image fetches (plain Etsy CDN URLs) succeed, without needing to run
 * a full render or read GitHub Actions job logs.
 *
 * Required environment variables:
 *   TARGET_URL   - the URL to fetch and report on
 *   CALLBACK_URL - URL to POST the resulting diagnostic JSON to
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetchDiagnostics(targetUrl, redirectChain) {
  redirectChain = redirectChain || [];
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(targetUrl);
    } catch (err) {
      reject(new Error('Invalid URL: ' + targetUrl + ' (' + err.message + ')'));
      return;
    }
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const requestOptions = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const req = lib.get(url, requestOptions, (res) => {
      const hop = {
        url: targetUrl,
        statusCode: res.statusCode,
        headers: res.headers,
      };

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(fetchDiagnostics(nextUrl, redirectChain.concat([hop])));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const first64 = buffer.subarray(0, 64).toString('hex');
        const first64Ascii = buffer.subarray(0, 64).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
        const pngMagic = '89504e470d0a1a0a';
        const looksLikePng = buffer.length >= 8 && buffer.subarray(0, 8).toString('hex') === pngMagic;
        resolve({
          redirectChain: redirectChain.concat([hop]),
          finalUrl: targetUrl,
          finalStatusCode: res.statusCode,
          finalHeaders: res.headers,
          byteLength: buffer.length,
          first64Hex: first64,
          first64Ascii: first64Ascii,
          looksLikePng: looksLikePng,
        });
      });
      res.on('error', (err) => reject(err));
    });
    req.on('error', (err) => reject(err));
    // Explicit timeout so a hung connection reports back instead of
    // leaving us guessing why the job never POSTed anything.
    req.setTimeout(20000, () => {
      req.destroy(new Error('Request timed out after 20s'));
    });
  });
}

async function postJson(callbackUrl, payload) {
  const url = new URL(callbackUrl);
  const body = Buffer.from(JSON.stringify(payload, null, 2));
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
          'Content-Type': 'application/json',
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
          resolve();
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const targetUrl = process.env.TARGET_URL;
  const callbackUrl = process.env.CALLBACK_URL;

  if (!targetUrl) throw new Error('TARGET_URL environment variable is required');
  if (!callbackUrl) throw new Error('CALLBACK_URL environment variable is required');

  console.log('[diagnose-fetch] fetching:', targetUrl);

  let result;
  try {
    result = await fetchDiagnostics(targetUrl);
    console.log('[diagnose-fetch] success:', JSON.stringify(result, null, 2));
  } catch (err) {
    result = { error: String((err && err.stack) || err) };
    console.error('[diagnose-fetch] failed:', err);
  }

  await postJson(callbackUrl, result);
}

main().then(
  () => {
    console.log('[diagnose-fetch] done');
    process.exit(0);
  },
  (err) => {
    console.error('[diagnose-fetch] fatal:', err);
    process.exit(1);
  }
);
