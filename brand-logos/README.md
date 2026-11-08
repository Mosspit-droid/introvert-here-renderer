# Brand logos

Sharp, rebuilt logos (4500 × 1500, see-through background), made by script so they can be
tweaked and re-exported at any time instead of being edited in Canva from flattened images.

Off the shelf: `node build.js <this folder>` makes the flat versions; `node build.js <this folder> metal`
makes the gold-leaf / brushed-silver versions for video backgrounds. Needs Playwright (Chromium)
and loads Montserrat and Libre Baskerville from Google Fonts.

Main collections (Introvert Here, SHHH., PER CONTRACT.): `node main-collections/build-all.js main-collections`
makes all six (wide + stacked) with a see-through panel. Add a name prefix as a second argument to make
just one, e.g. `shhh`.

Find Your Range graphic (2000 x 2000): `node find-your-range/build.js find-your-range`. Wording lives at the top of build.js.
