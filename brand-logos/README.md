# Brand logos

Sharp, rebuilt logos (4500 × 1500, see-through background), made by script so they can be
tweaked and re-exported at any time instead of being edited in Canva from flattened images.

Off the shelf: `node build.js <this folder>` makes the flat versions; `node build.js <this folder> metal`
makes the gold-leaf / brushed-silver versions for video backgrounds. Needs Playwright (Chromium)
and loads Montserrat and Libre Baskerville from Google Fonts.

Main collections (Introvert Here, SHHH., PER CONTRACT., EXCLUSIVE., IN PERSON.):
`node main-collections/build-all.js main-collections` makes all ten (wide + stacked). Add a name prefix as a
second argument to make just one range, e.g. `shhh` or `exclusive`.

- All have a see-through panel except EXCLUSIVE., which is a filled tabloid masthead: white lettering and
  figure on red (#D9141B), a thin white border inside the red frame, and the EXCLUSIVE. tag (`tag-ex.png`).
- IN PERSON. has a blue (#4A8FE7) frame and the "HELLO, I'M IN PERSON." name badge (`tag-ip.png`, finished
  artwork with its own tilt and shadow; stripes darkened to #2259B8 so they stand off the frame).
- The EXCLUSIVE. and IN PERSON. figures (`fig-ex.png`, `fig-ip.png`) are centred between the inside edge of
  the frame (EXCLUSIVE.: of the white border) and the N.
- The same four logos are in Canva, Z001_IH_SH_DESIGN_ASSETS pages 9–12.

Find Your Range graphic (2000 x 2500, six ranges in a 2 x 3 grid): `node find-your-range/build.js find-your-range`. Wording lives at the top of build.js.
