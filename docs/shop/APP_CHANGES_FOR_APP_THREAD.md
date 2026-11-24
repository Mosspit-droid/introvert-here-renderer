# Shop thread → app thread: what the shop work changed in the approvals app (20 Nov 2026)

Written for the thread that owns `approvals-app/`. Barry wants the app to stay the one place he runs Introvert Here
from, so these changes are meant to stay in the app, but **you own that code**: restructure, rename or move any of
it as you see fit. Barry has also made decisions with you about how the site and Etsy relate that the shop thread
has not been told; where anything below contradicts those, his decisions win.

## Where it is

- Branch `ccr-2e2fbc93-uwhyvw`, draft PR #8 on `Mosspit-droid/introvert-here-renderer`.
- **Nothing in the app is deployed.** The live `mosspit-approvals` worker is still exactly `main` as it was on
  19 Nov (checked by rebuilding `main` and comparing with the deployed script).
- The branch was cut from `c153b71`. `main` has moved since (for example `05d4c3a`), so expect to merge or re-apply.
- App diff against the branch point: `approvals-app/worker.js` +183 −1, `approvals-app/wrangler.toml` +5.
  See it with `git diff origin/main...origin/ccr-2e2fbc93-uwhyvw -- approvals-app`.

## The seven edits to `approvals-app/worker.js`

1. **`scheduled()`**: one added line, `ctx.waitUntil(shopCatalogTick(env).catch(() => {}))`.
2. **Route** `POST /api/shop-catalog-check` (in the logged-in block, beside `/api/shop-keys`): runs
   `shopCatalogRun(env, { force: true })` and returns its summary.
3. **`listingStateOp`**: after a gag is deactivated or reactivated, `await scKick(env)` so the shop follows within
   five minutes.
4. **`ipBuildDraft`**: the Etsy name-box instructions now read `"Up to 12 letters, printed in capitals."` (was
   "printed exactly as you type it"; the app has always upper-cased the name). The four live In Person listings were
   already changed on Etsy by hand on 20 Nov with Barry's OK. Their personalization `question_id`s changed as a result;
   nothing in the app reads those ids.
5. **`ordersPage`**: a "Shop catalogue" card (`shopCatalogCard`) above "Shop keys".
6. **`ordersPage` script**: a click handler for the card's "Check now" button (`#sccheck`).
7. **A new section at the end of the file**, "Shop catalogue: kept in step with Etsy by itself": constants `SC`,
   `SC_COLL`, `SC_GARMENTS`, `SC_MAIN`, `SC_PHOTO`, `SC_SIZES`; helpers `scPhotoColour`, `scAnyColour`, `scSlug`,
   `scKick`, `scPrintifyProduct`, `scFromPrintify`, `scGallery`; and `shopCatalogTick`, `shopCatalogRun`,
   `shopCatalogCard`.

`approvals-app/wrangler.toml` gains an R2 binding: `PHOTOS` → bucket `introvert-here-shop-photos`. The app code does
not use it yet; it is there for the automatic photo pick-up described under "Not built yet".

## What the catalogue builder does

It replaces the one-off `shop/build_catalog.py`. It writes KV `shop:catalog`, which the shop worker
(`introvert-here-shop`) serves.

- **Every 6 hours**, after an `scKick`, or on "Check now": reads Core `LISTING_REGISTRY_TABLE` (rows with
  STATUS = LIVE), `PRODUCT_RULES` (PRODUCT_FEATURES) and `MOCKUP_PAGES` through `coreTable`, and Etsy's active
  listings with photos through `etsyTool` (`/shops/{shop}/listings?state=active&includes=Images`, paged by 100).
  That is 4 Make runs per refresh.
- **Every 30 minutes**: re-reads 12 Printify products (new garments first, then the longest unchecked) for enabled
  sizes, colours and prices. It calls Printify directly with `SECRETS.printify_token`, falling back to `pfyTool`.
- **Prices** (Barry's decision, 20 Nov): the shop is about 20% cheaper than Etsy. Etsy shows a UK buyer Core's price
  plus 20% VAT and keeps that VAT; the shop has only Stripe's fee and Barry is not VAT-registered. Base prices are
  the constant `SC_PRICE`: T-shirt £25.99, long sleeve £29.99, sweatshirt £37.99, hoodie £47.99. Bigger sizes keep
  Etsy's surcharge in pounds, less £1 where it is £4 or more (`scSitePrice`); In Person adds £3. These would
  sit better on the app's Pricing page than in a constant.
- **Photos**: for a garment listed in KV `shop:photos`, the gallery is that garment's full Canva mockup set, named
  and colour-tagged by `MOCKUP_PAGES` (POSITION = page number; PAGE_NAME ends in the colour). Otherwise it falls
  back to the Etsy photos. No Printify pictures are used.
- **Lead colour**: the shop has no "main colour" per range (Barry, 20 Nov). Each product's tile and first-shown
  colour is cycled per gag the way the listing builder picks an Etsy listing's lead colour: the range's THUMBNAIL
  pages in `MOCKUP_PAGES` order, (gag number − 1) mod how many there are, skipping a colour that isn't on sale.
- **Safety**: a failed read keeps the existing catalogue and retries in 30 minutes; an empty result never replaces a
  working catalogue.
- **In Person is skipped** by the builder (rows with COLLECTION = IN PERSON), because those garments have no
  Printify product.
- KV keys it owns: `shop:catalog`, `shop:catalog-state`, `shop:catalog-photos`. It reads `shop:photos`.

It was run locally against live Core, Etsy and Printify (read-only): 26 designs, 93 garments, no problems.

## Things outside the app that the app thread should know exist

- **Make scenario 8698322, "Introvert Here: Tool — Canva Lookup"** (new, 20 Nov): a generic `canva:makeApiCall`
  tool on connection 8880982, built like the Printify and Etsy tools (inputs `path`, `method`, `header`, `body`;
  outputs `data`, `statusCode`). One operation per call. The connection lacks the `folder:write` scope, so the
  "move to a folder, delete the folder" trick fails with `missing_scope`; the mockup preview scenario's own binning
  step may be failing for the same reason.
- **R2 bucket `introvert-here-shop-photos`**: `p/<code>/<NN>.jpg` (1600px), `<NN>t.jpg` (600px), and for In Person
  `b<NN>.jpg` (the same photo with the gag text left off). KV `shop:photos` = `{code: {n, at, design}}`.
  All 97 garments are stored (93 live + 4 In Person), 1,903 photos, filled by `shop/photos/store.py` run from the
  shop thread's sandbox.
- **Preview shop**: worker `introvert-here-shop-preview`, reading KV `shop:catalog-preview`. Barry reviews
  everything there first. The real shop worker is unchanged.
- **Canva**: every listing build or mockup refresh leaves another "MOCKUPS <code>" design behind (846 found across
  105 codes). The shop always uses the newest. Barry has a to-do to tidy these.

## Not built yet: what the shop still needs from the app

1. **In Person in the catalogue builder.** The preview's four In Person garments were assembled by hand
   (`shop/photos/inperson_preview.py`): sizes, colours and prices from the Etsy listing inventory (price × 1.2, which
   already includes the £3 name charge), plus `personal: {max, text, sample}` and, per photo, `live` (text box
   position) and `base` (text-free photo) for the live name preview.
2. **In Person shop orders into the existing In Person queue** (`ipoNew` and friends) instead of a held Printify
   order. The shop will send the name with the order. Name rules agreed with Barry: capitals, up to 12 characters,
   letters (including accented), spaces, hyphens and apostrophes; no digits or symbols.
3. **Automatic photo pick-up for new listings**: any LIVE garment missing from `shop:photos` should have its
   newest "MOCKUPS <code>" design exported through scenario 8698322 and stored in R2 (2 operations per garment, plus
   a second, smaller export for the thumbnails, since a Worker cannot resize pictures).
4. **Refresh a garment's shop photos when its mockups are regenerated.** Found today: the Exclusive tee's stored
   set predates a change to its brand template, so the shop (and probably Etsy) shows the old size guide.
5. **`scKick` from more places**: listing built, price change saved, mockups updated.
6. **Two wording changes on the shop** agreed with Barry and not yet written: personalised items are excluded from
   change-of-mind returns, and a mixed basket (In Person plus other items) arrives as two parcels.

## Request from Barry (20 Nov, evening): site-only builds, so the site launches ahead of Etsy

Barry's decisions: the site releases **ahead of Etsy**; the starting line-up follows the **schedule order** (not gag
numbers); In Person is built **for the site first**; launch **as soon as it is ready**.

**What the shop needs from the builder: a "build for the site, hold Etsy back" mode.** For a given product code it
makes everything a listing build makes *except* the Etsy listing: the print file, the Printify product (in shop
27154106, not published to Etsy) and the Canva "MOCKUPS <code>" design. The Etsy listing is then created on the gag's
existing Etsy date, reusing that Printify product and mockup design rather than making new ones.

**How the shop finds site-only products.** Today the catalogue builder takes registry rows with STATUS = LIVE and
requires the listing to be active on Etsy. It needs a way to tell "built for the site, not on Etsy yet": for example
a registry STATUS such as `SITE_ONLY` (or a `SITE_LIVE` date column) with PRINTIFY_PRODUCT_ID filled and
ETSY_LISTING_ID empty. Your call how to record it; tell the shop thread and the catalogue builder will follow. With no
Etsy listing there are no Etsy photos to fall back on, so the garment's Canva set must be stored in R2 (the automatic
photo pick-up, item 3 above) before it can show.

**The starting line-up (132 products + Exclusive tees), and what has to be built early (36):**

| Range | Gags | To build early for the site |
|---|---|---|
| Introvert Here | 1–15, then IH-00017 (Etsy 30 Nov–3 Dec) | IH-00017 ×4 |
| SHHH. | 1–4 | SH-00003 sweatshirt + hoodie (Etsy 22, 29 Nov); SH-00004 ×4 (Etsy 6–27 Dec) |
| Per Contract | 1–5 (all live) | none |
| Off The Shelf | OS-00067, OS-00008, OS-00002, OS-00004 | the garments of OS-00067 and OS-00008 not yet out; OS-00002 ×4 (Etsy 4–12 Dec); OS-00004 ×4 (Etsy 1–9 Jan) |
| In Person | 1–4 | IP-00002, IP-00003, IP-00004 ×4 each. In Person has no Printify product, so "site-only" here means the mockups and the Core/registry entry without the Etsy listing that `ipListStart` creates |
| Exclusive | EX-00001 + up to four new tees Barry is writing | as he writes them |

Dates are from Core as read on 20 Nov at 21:20 UTC; check them again before building.

**EX-00001's size guide:** done. Barry regenerated its mockups on 20 Nov (new design `DAHbfc7CkrI`); the shop thread
re-stored the set by hand. This is the case item 4 above should handle automatically.

## Two more decisions from Barry (20 Nov, late)

1. **In Person is on a dated schedule in Core** (already done by the time this was written: read straight from
   `GAGS_TABLE` on 20 Nov at 22:46 UTC). 50 rows, one product a fortnight on Mondays, ending 1 May 2034. IP-00001 has
   no dates (it is live). IP-00002: T-shirt and long sleeve 23 Nov, sweatshirt 7 Dec, hoodie 21 Dec. IP-00003: 4 Jan
   to 15 Feb 2027. IP-00004: 1 Mar to 12 Apr 2027. Those are the Etsy dates; the site wants gags 2–4 built early.
2. **The app should keep the site updated from now on**, not the shop thread by hand: storing a garment's photos when
   it is built, re-storing them when its mockups are regenerated, and refreshing the catalogue when a listing is
   built, repriced or deactivated. Until that exists the shop thread refreshes things manually with
   `shop/photos/store.py` and a local catalogue run.

## In Person orders from the shop: what the shop worker now records (built 20 Nov, not deployed to the real shop)

When a paid checkout contains In Person lines, the shop worker (`placeOrder` in `shop/worker.js`) does **not** send
those lines to Printify. Ordinary lines in the same basket go to Printify on hold as before. The order record in KV
(`shop:order:<session>` and the `shop:orders` list) gains:

- `personal`: `[{ code, quantity, amount, name, colour, size, status: "waiting" }]`, one per In Person line. `name` has
  already passed the agreed rules server-side (`personalName`).
- `ship`: `{ name, email, phone, first_line, second_line, city, state, zip, country }`, shaped like `o.ship` in the
  app's In Person order code.
- `status`: `"in-person"` when the basket was In Person only (no Printify order exists); otherwise the usual
  `on-hold` / `sent-to-production` for the ordinary lines.

**Needed in the app:** pick these up into the In Person queue (the `ipoNew` route), using `code` to find the gag and
garment, and `colour` / `size` for the Printify variant; and set each line's `status` as it moves on. The Orders
page currently shows an unknown status as plain text, so `in-person` appears but has no button.

## 4XL and 5XL on every T-shirt (Barry, 20 Nov, late)

Barry wants 4XL and 5XL offered on all T-shirts; they do not block Printify's Global Fulfilment on the tee (it was
other garments' large sizes that did). Today only IH-00001-T-SHIRT has them switched on, because Core's
`PRODUCT_RULES` SIZES for T-shirts reads "S, M, L, XL, 2XL, 3XL". Needed: the size rule changed for T-shirts in every
range, and the live tees updated in Printify and Etsy. On IH-00001 the 4XL and 5XL are priced the same as 3XL
(Core £31.66, Etsy £37.99), and Printify's cost for them is about the same as 3XL ($13.47 against $12.91), so the
existing 3XL surcharge can simply carry over. The shop needs no change: it shows whatever sizes are switched on in
Printify and prices 4XL and 5XL as 3XL (£30.99). The tee size guides stop at 3XL and would need the two extra rows.

## Added 21 Nov: upcoming gags for the site's vote page

The Escape Room has a "Vote on the next gag" page (the jar in the room, `/uk/escape-room/vote`). It shows the next
three gags due out, so visitors can vote (Barry: "we're creating the illusion of choice"; release order doesn't change).

**What the site needs from the app:** keep KV `shop:upcoming` (namespace PENDING) current, as a JSON list, soonest first:

```json
[{ "id": "IH-00119", "coll": "IH", "title": "Karaoke", "due": "2026-11-23", "text": "... OH GOD.\n\nWHY'D IT HAVE\nTO BE KARAOKE?" }]
```

- `id`: GAG_ID. `coll`: the two-letter range. `title`: TITLE_STEM. `text`: GAG_TEXT exactly as in Core.
- `due`: the earliest of the four garment dates, as YYYY-MM-DD. Leave out gags with any garment already live.
- Skip In Person and Exclusive (no regular schedule). Five or so entries is plenty; the site drops any whose date
  has passed and shows the first three.
- Until this exists, the site uses a copy of the next three it read from Core on 21 Nov.

**Votes:** the site keeps counts in KV `shop:votes` as `{ "<the three ids joined with +>": { "<id>": count } }`.
They're never shown on the site. The app could show them to Barry if he wants.

**Discount for voters:** after voting, people are shown a 5% code (placeholder `VOTED5`; Barry to name it). It
needs creating in Stripe as a promotion code (5% off, one use per customer, 30 days) before launch, with Barry's OK,
and checkout needs to accept promotion codes.

## Added 22 Nov: Etsy reviews on the site (later, not urgent)

The site shows genuine Etsy reviews on the page of the garment they were left on (`REVIEWS` in `shop/worker.js`,
keyed by Etsy listing id; one so far, on IH-00001's hoodie). When convenient, the app could keep KV `shop:reviews`
current from Etsy's shop reviews (`/shops/65435151/reviews`) as `{ "<listing_id>": [{ "rating": 5, "text": "..." }] }`,
word for word, and the site will read it instead of its hand copy. No site-wide average until there are about ten.

## Added 22 Nov: fixes for `shop:catalog-next` before the site switches to it

1. **Prices.** `shop:catalog-next` has Etsy's VAT-inclusive prices (tee £31.99, hoodie £59.99). The site uses its
   own (option B): T-shirt £25.99, long sleeve £29.99, sweatshirt £37.99, hoodie £47.99; each size's surcharge is
   Etsy's surcharge in whole pounds, less £1 where it's £4 or more; In Person £3 more. `SC_PRICE` and
   `scSitePrice()` in `approvals-app/worker.js` do exactly this. Prices are in pence.
2. **In Person in the catalogue.** IP designs are missing. Each IP garment needs, as well as the usual fields:
   - `personal: { max: 12, text: <GAG_TEXT with [NAME] where the name goes>, sample: <a sample name> }`
     (samples used so far: T-shirt SAM, long sleeve ALEX, sweatshirt CHARLIE, hoodie JORDAN).
   - On each photo that has a name preview: `live: { x, y, w, h, s, r }` and `base: <url of the text-free copy>`.
3. **Text-free copies, now from Barry's Canva designs.** Barry has added `_BLANK` pages to the In Person designs: a
   copy of each front-on page with the text box deleted, titled like its partner plus `_BLANK` (e.g.
   `IP_01_TS_THUMBNAIL_PURPLE_BLANK`). Copy each to R2 as `p/<code>/b<NN>.jpg` (NN = its partner's page number), set
   the partner photo's `base` to it, and leave `_BLANK` pages out of the photo gallery. The pages:
   T-shirt and sweatshirt 01-03 (THUMBNAIL) and 07-09 (HANGING); long sleeve 01-02 and 05-06; hoodie 01-03 and
   10-12 (HANGING_BACK).
4. **Where the name goes (`live`).** Fixed per garment and photo type: the gag text box's position in Canva's 4500px
   page, divided by 45 to make percentages (x, y = top-left, w, h = box size, s = font size, r = rotation in degrees):

   | Garment | _THUMBNAIL_ | _HANGING_ (hoodie: _HANGING_BACK_) |
   |---|---|---|
   | T-shirt | 1242.755, 2086.406, 2048.485, 1249.811, 152.975, 0 | 1636.196, 1824.657, 1248.323, 761.620, 93.221, 0 |
   | Long sleeve | 1032.321, 2082.562, 1941.998, 1184.841, 145.023, 12 | 1636.196, 1824.657, 1248.323, 761.620, 93.221, 0 |
   | Sweatshirt | 1341.228, 1719.341, 1865.535, 1138.190, 139.313, -12 | 1550.755, 1932.882, 1420.934, 866.933, 106.111, 1 |
   | Hoodie | 1468.761, 1712.214, 1588.846, 969.378, 118.651, 0 | 1576.781, 2001.379, 1369.159, 835.344, 102.245, 0 |

   (From `shop/photos/inperson_preview.py`. If the text box moves in a template, these change too.) Example of the
   result: `{"x": 27.617, "y": 46.365, "w": 45.522, "h": 27.774, "s": 3.399, "r": 0}`.
5. Tell the shop thread when `shop:catalog-next` has site prices and In Person; it will then switch the preview over.

## Added 23 Nov: product videos on the site

The site's product pages now show a garment's video as the first item in the picture viewer (muted, looping) when the
catalogue has one. 99 of the 120 listings have an Etsy video; none reach the site yet.

**What the site needs from the app:**
1. Copy each garment's video into R2 bucket `introvert-here-shop-photos` as `v/<PRODUCT_CODE>.mp4` (e.g.
   `v/IH-00001-HOODIE.mp4`), plus a poster frame as `v/<PRODUCT_CODE>.jpg` (Etsy gives one: `thumbnail_url`).
   - Listed garments: Etsy's `GET /listings/<etsy id>/videos` returns `video_url` (an `.mp4` on v.etsystatic.com)
     and `thumbnail_url`. (Checked on IH-00001's hoodie, listing 4579908668.)
   - Site-only garments: copy straight from the app's video renderer output (VIDEO_FILENAME in the registry).
2. In the catalogue, on each garment with a video: `video: { url: "/v/<CODE>.mp4?v=<at>", poster: "/v/<CODE>.jpg?v=<at>" }`.
   The site serves `/v/...` from R2 with range requests (phones stream it). Re-copy when a video is regenerated.
3. Tell the shop thread when the first few are in, so it can check them on the preview.

## Added 24 Nov: no more opening mockup flash in gag videos

Barry doesn't want the 0.8-second garment flash ("teaser") that opened about half the videos. In `buildPage.js` the
teaser is now off unless a spec explicitly sets `teaser: true` (line in `pickVariant`). Changed on branch
`ccr-2e2fbc93-uwhyvw` only.

1. Make the same change wherever the renderer is deployed (Render builds from its branch; the branch above isn't merged).
2. Re-render the existing videos that open with the flash, re-upload them to Etsy (replacing the old video) and let the
   site's video copy pick up the new VIDEO_ETSY_ID. Only some videos have it: check a frame at ~0.2s (IH-00003's
   T-shirt does; IH-00001, IH-00002 and IH-00005 don't). Do it gradually; no rush before launch beyond what's easy.
