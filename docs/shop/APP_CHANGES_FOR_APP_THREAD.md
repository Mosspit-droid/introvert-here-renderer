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
- **Prices** are Printify's price × 1.2, rounded: Core's price plus VAT, the same as a UK buyer sees on Etsy
  (£26.66 → £31.99). One constant, `SC.vat`. *This is the kind of site/Etsy decision Barry may have settled
  differently with you.*
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

**Also wanted for launch:** regenerate EX-00001's mockups (its stored set predates a change to the Exclusive brand
template, so its size guide is the old one).
