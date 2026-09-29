# introvert-here-renderer

A self-hosted replacement for the Shotstack render step in the gag-text
video pipeline. It builds the exact same kind of video (a typewriter-style
text reveal over a background image, followed by a sequence of product
photos with a zoom-out effect) but does it by loading a real page in a
real browser (via Playwright) and recording it, instead of sending a JSON
spec to a third-party black-box renderer.

Why this exists: Shotstack was silently shrinking the text's font size
depending on how many lines of text were in the gag (see project history
for the full investigation), and that behaviour couldn't be tracked down
or worked around reliably. A real browser lays out CSS the way the CSS
actually says, regardless of how many lines of text there are - so this
class of bug simply can't happen here.

## Files

- `server.js` - the Express server. Exposes `POST /render`.
- `buildPage.js` - builds the self-contained HTML/CSS/JS page that gets
  loaded into the browser and recorded. All the animation timing and
  layout logic lives here.
- `Dockerfile` - based on Playwright's official image (already has the
  right browser build installed), with `ffmpeg` added on top.

## Important: this code has not been run yet

This project was written without the ability to install or run Playwright
locally. Every line has been written carefully against Playwright's
documented API, but it has not been executed even once before being
deployed here. All real testing happens on Render, since Render's build
servers have normal internet access. Expect to spend a first pass finding
and fixing any teething issues - that's expected, not a sign anything is
wrong with the approach.

## What `POST /render` expects

```json
{
  "textLines": [
    "… EXCUSE THE SIGH.",
    "YOU CAUGHT ME OFF GUARD."
  ],
  "backgroundImageUrl": "https://example.com/background.png",
  "productImages": [
    { "url": "https://example.com/product1.jpg", "durationMs": 1700 },
    { "url": "https://example.com/product2.jpg", "durationMs": 1700 },
    { "url": "https://example.com/product3.jpg", "durationMs": 1700 },
    { "url": "https://example.com/product4.jpg", "durationMs": 1700 }
  ]
}
