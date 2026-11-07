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
 *      design (511x648 box, right-aligned so each line's right edge is
 *      fixed; the full line is laid out from the start and characters are
 *      revealed left-to-right in place, so nothing ever shifts position
 *      as it types; Montserrat Regular 400 50px, 120% line height,
 *      -0.04em letter spacing).
 *   2. Once the text has finished typing and held briefly, the view cuts
 *      to a sequence of product photos, each shown for its own duration
 *      with a slow zoom-out effect, one after another.
 *
 * @param {Object} spec
 * @param {string[]} spec.textLines - The gag text, one entry per line, in
 *   the order they should appear (top to bottom). A blank line should be
 *   an empty string "" — a line that's only whitespace (e.g. a single
 *   space, used upstream to stop a blank line being swallowed by a naive
 *   split) is also treated as blank. Either way it renders as a
 *   non-breaking space so the line still takes up vertical space,
 *   matching the original behaviour.
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
// Where the text box sits for each collection, in the 1080px frame.
// left/width are the outer edges of that collection's logo frame on its
// background image (measured from the backgrounds themselves), so the box
// runs from directly under the logo's left edge to directly under its
// right edge. top keeps the existing gap between logo and text.
const TEXT_BOX_PRESETS = {
  IH: { left: 286, width: 509, top: 404 }, // INTROVERT HERE… (Y003 background)
  SH: { left: 287, width: 505, top: 404 }, // SHHH.
  PC: { left: 265, width: 543, top: 404 }, // PER CONTRACT
};

// The text box is a grid of 12 x 9 capital Ws, the same as the Canva box
// in Core: the font size is whatever makes 12 Ws exactly fill the box.
const GRID_COLUMNS = 12;
const LINE_HEIGHT = 1.2;

function buildPage(spec) {
  const {
    textLines: rawTextLines,
    collection,
    textBox: textBoxOverride,
    backgroundImageUrl,
    productImages,
    charIntervalMs = 85.5,
    holdAfterTypingMs = 500,
    outputWidth = 1080,
    outputHeight = 1080,
  } = spec;

  const textBox =
    textBoxOverride ||
    TEXT_BOX_PRESETS[String(collection || '').toUpperCase()] ||
    TEXT_BOX_PRESETS.IH;

  if (!Array.isArray(rawTextLines) || rawTextLines.length === 0) {
    throw new Error('textLines must be a non-empty array of strings');
  }
  if (!backgroundImageUrl) {
    throw new Error('backgroundImageUrl is required');
  }
  if (!Array.isArray(productImages) || productImages.length === 0) {
    throw new Error('productImages must be a non-empty array of {url, durationMs}');
  }

  // A line that's empty, or only whitespace (e.g. a single space used
  // upstream as a stand-in for a blank line so it survives a naive
  // split), is normalised to a true blank line here.
  const textLines = rawTextLines.map((line) =>
    typeof line === 'string' && (line.trim().length === 0 || line.trim() === '[BLANKLINE]') ? '' : line
  );

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
    textBoxWidth: textBox.width,
    gridColumns: GRID_COLUMNS,
    lineHeight: LINE_HEIGHT,
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
    left: ${textBox.left}px;
    top: ${textBox.top}px;
    width: ${textBox.width}px;
    text-align: right;
    /* font-size is set by the script once the font has loaded: it's
       whatever makes 12 capital Ws exactly fill this box's width. */
    font-family: 'Montserrat', sans-serif;
    font-weight: 400;
    line-height: ${LINE_HEIGHT};
    letter-spacing: -0.04em;
    color: rgba(255, 255, 255, 1);
  }
  .textbox div {
    display: block;
    width: 100%;
    /* Like the Canva box: a line too long for the box wraps at a space
       instead of spilling past the right edge. */
    white-space: normal;
  }
  .measure {
    position: absolute;
    left: -10000px;
    top: 0;
    white-space: nowrap;
    font-family: 'Montserrat', sans-serif;
    font-weight: 400;
    font-size: 100px;
    letter-spacing: -0.04em;
  }
  .textbox .ch {
    visibility: hidden;
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

  // Build every line's FULL final text up front, one <span class="ch">
  // per character, all hidden. Because the complete line is laid out
  // from frame one, the right-aligned box's width and position never
  // change as typing proceeds — only each character's visibility toggles
  // on, left to right, already sitting exactly where it will stay.
  function renderFullLinesHidden() {
    const linesHtml = SPEC.textLines.map((line) => {
      if (line.length === 0) {
        // Explicit height (one line), rather than relying on &nbsp; plus
        // the div's own line-height - belt-and-braces against a blank-only
        // div collapsing its box in some rendering conditions.
        return '<div style="height:' + SPEC.lineHeight + 'em;">&nbsp;</div>'
      }
      // Spaces stay ordinary (breakable) spaces, so a line that's too long
      // for the box wraps there, like the Canva box. Each space still gets
      // its own span so the typing pace is unchanged.
      const chars = line
        .split('')
        .map((ch) => '<span class="ch">' + (ch === ' ' ? ' ' : escapeHtml(ch)) + '</span>')
        .join('');
      return '<div>' + chars + '</div>';
    });
    textbox.innerHTML = linesHtml.join('');
  }

  function escapeHtml(ch) {
    return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
  }

  // Font size = the size at which 12 capital Ws exactly fill the box.
  function fitFontToGrid() {
    const probe = document.createElement('span');
    probe.className = 'measure';
    probe.textContent = 'W'.repeat(SPEC.gridColumns);
    document.body.appendChild(probe);
    const widthAt100 = probe.getBoundingClientRect().width;
    probe.remove();
    const fontSize = (SPEC.textBoxWidth / widthAt100) * 100;
    textbox.style.fontSize = fontSize.toFixed(2) + 'px';
    window.__FONT_SIZE__ = fontSize;
  }

  function revealCharsUpTo(revealed) {
    const spans = textbox.querySelectorAll('.ch');
    for (let i = 0; i < spans.length; i++) {
      spans[i].style.visibility = i < revealed ? 'visible' : 'hidden';
    }
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
    if (document.fonts) {
      try { await document.fonts.load("400 100px 'Montserrat'", 'W'); } catch (e) {}
      try { await document.fonts.ready; } catch (e) {}
      if (!document.fonts.check("400 100px 'Montserrat'", 'W')) {
        console.error('[font] Montserrat did not load - text size would be wrong');
      }
    }
    fitFontToGrid();

    const bg = makeImageEl(SPEC.backgroundImageUrl);
    await waitForImageLoad(bg);
    bg.classList.add('active');

    renderFullLinesHidden();
    const totalChars = textbox.querySelectorAll('.ch').length;
    let revealed = 0;
    revealCharsUpTo(0);

    await new Promise((resolve) => {
      if (totalChars === 0) { resolve(); return; }
      const interval = setInterval(() => {
        revealed += 1;
        revealCharsUpTo(revealed);
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
