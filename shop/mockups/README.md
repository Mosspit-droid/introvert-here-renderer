# Mockups on range backgrounds

The shop shows Printify's mockups (front, plus back for hoodies) on each range's background instead of white.

When products or colours change:
1. Rebuild the catalogue (`build_catalog.py`) so it knows the current Printify mockup addresses.
2. Put the list of addresses in KV `mirror:list` (`[{k: "mirror:<sha1(url)[:16]>", u: url}]`) and deploy `mirror-worker/`
   with its every-minute schedule. It copies 20 images a minute into KV (the build sandbox can't reach Printify's
   image host; Cloudflare can). Watch `mirror:status`; clear the schedule when `done == total`.
3. Download the `mirror:*` images, run `python3 run_all.py <catalog.json> <raw folder> <out folder>`.
4. Upload `<out>/<key>.jpg` to KV as `shop:m-<key>.jpg` and copy `processed.json` next to the catalogue inputs.
5. Rebuild the catalogue again: mockups now point at `/m/<key>.jpg`. The build lists any mockup still on white.

Textures live in `textures/` (copies of the shop backgrounds). `compose.py` explains the method.
