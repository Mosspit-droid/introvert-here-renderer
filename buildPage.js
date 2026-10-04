'use strict';

/**
 * Builds the single self-contained HTML page that gets loaded into a real
 * browser (via Playwright) and recorded as video. This is the whole point
 * of this renderer: because a genuine browser lays out and paints this
 * page, the text always comes out at the font size and position the CSS
 * actually says — there's no black-box renderer silently rescaling it
 * depending on how many lines of text there are (the bug that broke the
 * Shotstack version of this pipeline).
 *
 * Structure of the finished video, matching the design Barry's pipeline
 * was already using before the switch:
 *   1. A background image (e.g. the Canva-exported artwork) is shown full
 *      frame. On top of it, the gag text types itself on, one character
 *      at a time, matching the box position/typography from the original
 *      design (511x648 box, left-aligned so the first letter's position
 *      is fixed and each line grows rightward as it's typed, Montserrat
 *      Regular 400 50px, 120% line height, -0.04em letter spacing).
 *   2. Once the text has finished typing and held briefly, the view cuts
 *      to a sequence of product photos, each shown for its own duration
 *      with a slow zoom-out effect, one after another.
 *
 * @param {Object} spec
 * @param {string[]} spec.textLines - The gag text, one entry per line, in
 *   the order they should appear (top to bottom). Blank lines should be
 *   passed as empty strings "" (rendered as a non-breaking space so the
 *   line still takes up vertical space, matching the original behaviour).
 * @param {string} spec.backgroundImageUrl - Full-frame image shown behind
 *   the animated text.
 * @param {{url: string, durationMs: number}[]} spec.productImages - The
 *   photos shown after the text sequence, each with how long (in
 *   milliseconds) it should be held on screen.
 * @param {number} [spec.charIntervalMs=85.5] - Milliseconds between each
 *   character appearing during the typing animation. Defaults to the
 *   pacing from the original design (~0.0855s/char).
 * @param {number} [spec.holdAfterTypingMs=500] - How long to hold the
 *   fully-typed text on screen before cutting to the product photos.
 * @param {number} [spec.outputWidth=1080]
 * @param {number} [spec.outputHeight=1080]
 * @returns {{html: string, totalDurationMs: number}}
 */
function buildPage(spec) {
  const {
    textLines,
    backgroundImageUrl,
    productImages,
    charIntervalMs = 85.5,
    holdAfterTypingMs = 500,
    outputWidth = 1080,
    outputHeight = 1080,
  } = spec;

  if (!Array.isArray(textLines) || textLines.length === 0) {
    throw new Error('textLines must be a non-empty array of strings');
  }
  if (!backgroundImageUrl) {
    throw new Error('backgroundImageUrl is required');
  }
  if (!Array.isArray(productImages) || productImages.length === 0) {
    throw new Error('productImages must be a non-empty array of {url, durationMs}');
  }

  // Total characters across all lines decides how long the typing phase
  // takes. Blank lines contribute 0 characters (they're already visible
  // as a spacer from the start), matching the original template.
  const totalChars = textLines.reduce((sum, line) => sum + line.length, 0);
  const typingDurationMs = totalChars * charIntervalMs;
  const textPhaseDurationMs = typingDurationMs + holdAfterTypingMs;

  const productPhaseDurationMs = productImages.reduce(
    (sum, img) => sum + Number(img.durationMs || 0),
    0
  );

  const totalDurationMs = textPhaseDurationMs + productPhaseDurationMs;

  // Pass the whole timing spec into the page as JSON; the in-page script
  // drives the actual animation off of it so the two stay in sync.
  const clientSpec = {
    textLines,
    backgroundImageUrl,
    productImages: productImages.map((img) => ({
      url: img.url,
      durationMs: Number(img.durationMs || 0),
    })),
    charIntervalMs,
    holdAfterTypingMs,
    textPhaseDurationMs,
  };

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${outputWidth}px;
    height: ${outputHeight}px;
    background: #000000;
    overflow: hidden;
  }
  .stage {
    position: relative;
    width: ${outputWidth}px;
    height: ${outputHeight}px;
    background: #000000;
  }
  .bg-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1);
  }
  .bg-image.active {
    opacity: 1;
  }
  .bg-image.zooming {
    animation: zoomOut linear forwards;
  }
  @keyframes zoomOut {
    from { transform: scale(1.15); }
    to   { transform: scale(1.0); }
  }
  .textbox {
    position: absolute;
    left: 285px;
    top: 404px;
    width: 511px;
    text-align: left;
  }
  .textbox div {
    display: block;
    width: 100%;
    white-space: nowrap;
    font-family: 'Montserrat', sans-serif;
    font-weight: 400;
    font-size: 50px;
    line-height: 120%;
    letter-spacing: -0.04em;
    color: rgba(255, 255, 255, 1);
  }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&display=swap" rel="stylesheet">
</head>
<body>
  <div class="stage" id="stage">
    <div class="textbox" id="textbox"></div>
  </div>
<script>
(function () {
  const SPEC = ${JSON.stringify(clientSpec)};
  const stage = document.getElementById('stage');
  const textbox = document.getElementById('textbox');

  function makeImageEl(url) {
    const img = document.createElement('img');
    img.className = 'bg-image';
    img.src = url;
    stage.insertBefore(img, textbox);
    return img;
  }

  function renderTextAtCharCount(revealed) {
    let remaining = revealed;
    const divs = SPEC.textLines.map((line) => {
      if (line.length === 0) {
        return '&nbsp;';
      }
      if (remaining <= 0) {
        return '&nbsp;';
      }
      const take = Math.min(remaining, line.length);
      remaining -= take;
      const shown = line.slice(0, take);
      return take > 0 ? shown : '&nbsp;';
    });
    textbox.innerHTML = divs.map((d) => '<div>' + d + '</div>').join('');
  }

  async function waitForImageLoad(img) {
    if (img.complete) {
      if (img.naturalWidth === 0) {
        console.error('[image] FAILED TO LOAD (already complete, naturalWidth=0): ' + img.src);
      }
      return;
    }
    await new Promise((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => {
        console.error('[image] FAILED TO LOAD: ' + img.src);
        resolve();
      }, { once: true });
    });
  }

  async function run() {
    // Wait for the web font to actually be ready before we start typing,
    // so the very first frame is already using Montserrat Regular, not a
    // fallback font that then swaps mid-recording.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }

    const bg = makeImageEl(SPEC.backgroundImageUrl);
    await waitForImageLoad(bg);
    bg.classList.add('active');

    const totalChars = SPEC.textLines.reduce((s, l) => s + l.length, 0);
    let revealed = 0;
    renderTextAtCharCount(0);

    await new Promise((resolve) => {
      if (totalChars === 0) { resolve(); return; }
      const interval = setInterval(() => {
        revealed += 1;
        renderTextAtCharCount(revealed);
        if (revealed >= totalChars) {
          clearInterval(interval);
          resolve();
        }
      }, SPEC.charIntervalMs);
    });

    await new Promise((r) => setTimeout(r, SPEC.holdAfterTypingMs));

    // Cut to the product photo sequence.
    bg.classList.remove('active');
    textbox.style.display = 'none';

    for (const product of SPEC.productImages) {
      const img = makeImageEl(product.url);
      await waitForImageLoad(img);
      img.style.animationDuration = product.durationMs + 'ms';
      img.classList.add('active', 'zooming');
      await new Promise((r) => setTimeout(r, product.durationMs));
      img.classList.remove('active');
    }

    window.__DONE__ = true;
  }

  run();
})();
</script>
</body>
</html>`;

  return { html, totalDurationMs };
}

module.exports = { buildPage };
