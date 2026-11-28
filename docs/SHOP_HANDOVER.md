# Introvert Here shop: handover (20 Nov 2026)

Everything already built for Barry's own shop (introverthere.com), what state it's in, and what's left. Written
for the next Claude thread. Barry is non-technical: plain English, short replies, recommendations rather than
options, do the work for him.

## Standing rules (apply to all work)

- Repo `Mosspit-droid/introvert-here-renderer` must stay **public** (GitHub Actions video renders are only free
  while public).
- Never put secrets in chat or commits. Make blueprint backups go in `docs/make-backups/`, scrubbed: replace the
  `X-Ingest-Secret` header value and any `hook.eu1.make.com/...` URL.
- No live listing, Make, Core or shop changes without Barry's OK. No spending. Bulk runs need an explicit go-ahead.
- Customer replies are drafts only, signed "— Introvert Here".
- Before deploying the approvals app, syntax-check page scripts (a stray apostrophe broke the Listings page once).
- Commit trailer lines as given by the session.

## What exists

### Shop site: `shop/worker.js` (Cloudflare Worker `introvert-here-shop`, workers.dev)
- Pages: country picker (`/`), UK shop (`/uk`), design pages (`/uk/p/<slug>`), basket (`/uk/basket`),
  thank-you (`/uk/thanks`), legal pages. Non-UK visitors are sent to the Etsy shop.
- Each range has its own background, banner and tagline (Barry's wording, in `COLLECTIONS` in worker.js).
  Photos follow the chosen colour; Printify mockups are shown on the range background (see Mockups below).
- `POST /api/checkout`: builds a **Stripe Checkout** session from the basket. Prices come from the catalogue, never
  the browser.
- `POST /api/stripe-webhook`: verified Stripe event. On payment it places a **Printify order on hold** in Printify shop
  `27154106` (the same Printify shop that feeds Etsy) using the Etsy product's Printify variant IDs, records it in
  KV, and alerts the approvals app.
- `wrangler.toml` vars: `AUTO_SEND = "no"` (orders wait for Barry), `TEST_ORDERS_TO_PRINTIFY = "no"`.
  Worker secret: `STRIPE_WEBHOOK_SECRET`.
- KV (binding `PENDING`, shared with the approvals app): `shop:catalog`, `shop:orders`, `shop:order:<session>`,
  `shop:m-<key>.jpg` (composed mockups). Keys (`stripe_secret_key`, `printify_token`) live in KV namespace `SECRETS`,
  saved by Barry on the approvals app's **Orders** page (write-only form; shows last 4 characters).

### Approvals app side (`approvals-app/worker.js`)
- **Orders** page (`/orders`): In Person orders at the top, then shop orders. Each paid shop order shows with
  **Send to Printify** (calls Printify `send_to_production`). Test payments are never sent.
- Dashboard counts shop orders on hold (plus In Person orders waiting) in "Orders to send".

### Catalogue: automatic (`shopCatalogRun` in `approvals-app/worker.js`), written 20 Nov
- **Not deployed yet: waiting for Barry's OK** (deploy the approvals app and the shop worker; the new picture files
  `shop:hero-EX.jpg` and `shop:bg-EX.jpg` must be put in KV first, from `shop/assets/`). Until then the live catalogue is the old manual one (22 designs, old prices and photos).
- Joins Core `LISTING_REGISTRY` (STATUS = LIVE) + `PRODUCT_RULES`, Etsy's active listings with photos (one Make call)
  and each Printify product (direct, with the saved Printify token) into `shop:catalog`. Core + Etsy every 6 hours and
  straight after a gag is deactivated/reactivated in the app; a dozen Printify products every 30 minutes. State in
  KV `shop:catalog-state` and `shop:catalog-photos`. The Orders page has a **Shop catalogue** card with "Check now".
- A failed read keeps the old catalogue and retries in 30 minutes; an empty result never replaces a working one.
- **Prices = Core price + 20% VAT**, i.e. what a UK buyer sees on Etsy (£26.66 -> £31.99). One number: `SC.vat`.
- Ranges: IH, SH, PC, OS and Exclusive (EX, Natural tee; wording from Core's COLLECTION_INTRO; no banner/background
  of its own yet). **In Person is left out** (see What's left).
- Main colour per range (`SC_MAIN`): IH Black, SH Dark Heather, PC Navy, OS Maroon, EX Natural.
- Tested locally against live data on 20 Nov: 25 designs, 92 garments, no problems.
- `shop/build_catalog.py` is the old manual build, kept for reference only.

### Photos: each garment's full Canva set (decided 20 Nov; replaces the Printify pictures and the hourly job)
- Barry: Printify pictures are only on Etsy because of Etsy's AI rules; the shop doesn't use them. The shop shows
  **every page** of a garment's Canva "MOCKUPS <code>" design (all colours), not just the 12-13 Etsy has room for.
- Core `MOCKUP_PAGES` already lists every page (POSITION = Canva page number, PAGE_NAME ends with the colour); the
  builder's `mockup_rank.js` is what trims them for Etsy.
- Stored in **R2** bucket `introvert-here-shop-photos` (binding `PHOTOS`): `p/<code>/<NN>.jpg` (1600px) and
  `<NN>t.jpg` (600px). KV `shop:photos` = `{code: {n, at}}` lists garments that have their set. The catalogue builder
  uses those (named by MOCKUP_PAGES) and falls back to Etsy's photos for garments not stored yet.
- Photo order on a product page: that colour's pictures, shared product pictures (colour line-up), size guide, then
  the general cards (AGM, range/brand).
- **Done so far:** only OS-00067-T-SHIRT is stored (by hand, as the sample). **To do:** a Make "Canva tool" scenario
  (generic `canva:makeApiCall` on connection 8880982, like the Printify/Etsy tools), then a catch-up for every live
  garment (search designs by title, export all pages, store) and an automatic pick-up of new listings in the app.
- `shop/mockups/` (compose.py etc.) is the old Printify-on-background route, no longer used.

### Preview copy and layout (20 Nov)
- **Preview:** worker `introvert-here-shop-preview` (https://introvert-here-shop-preview.mosspit.workers.dev),
  `shop/wrangler.preview.toml`, `PREVIEW = "yes"`: own catalogue (KV `shop:catalog-preview`, uploaded by hand from a
  local builder run), tries `shop:preview:<file>` before real picture files, no checkout, hidden from search.
  Barry workshops everything here first; always give him the link.
- **Product-led:** one tile and one page per garment (`/uk/p/<title>-<garment>-<gag id>`), range tabs + product
  filters, garments dealt out in turn on the front page, range logo top right of each tile's text.
- **Exclusive:** tabloid banner (`shop/banners/make_ex.py`: masthead logo printed into newsprint, Anton headline,
  Newsreader Italic sub-heading), red brick page background (`shop/assets/bg-EX.jpg`, Barry's picture).
- Barry wants each step talked through before it is done, with previews, and the preview link in every reply.

### The Escape Room (21 Nov, preview only)
The hub half of the site, "a room to get away from people". Everything is in `shop/worker.js`; site pictures are in
R2 `site/` (copies in `shop/assets/site/`).
- `/uk/escape-room/gate`: the warning gate first-time visitors pass through (remembered on their device; "express
  route" skips it).
- `/uk/escape-room`: Barry's room picture (`room-wide`/`room-tall`, made by `shop/room/build.py`) with tappable props
  (`ROOM`). Working: phone (Excuse Generator), tablet (Look Busy), painting (Spot the Introvert), jar (vote), hoodie
  (shop), door (front page). "Soon": console and TV (stealth game, being built by another thread from
  `docs/shop/STEALTH_GAME_BRIEF.md`, on its own preview), bookshelf (paper escape rooms), noticeboard (newsletter).
- `/look-busy`, `/excuses` (Barry's 40 excuses), `/spot` (Barry's paintings, `SPOT`; five a game; `?all=1` plays
  all), `/vote` (next three scheduled gags; see the app note for `shop:upcoming`, the `shop:votes` tally and the
  one-off reward codes, see Reward codes below).
- Shop list: 24 at a time; the dots window is "Show more", "Retreat" goes back up to the tabs.

### UK printing pilot: `shop/uk/make_pilot.py`
- A draft UK-printed tee (Print Clever, provider 72) at the same physical print size as the Etsy Printify Choice tee
  (print y 0.482). Idea: UK shop orders printed in the UK. Not rolled out.
- Note: all In Person garments use **Printify Choice (provider 99)**, which routes to the nearest printer itself.

### Orders (decided 21 Nov)
- Normal orders go to Printify for printing automatically (`AUTO_SEND = "yes"` in `shop/wrangler.toml`; takes effect
  when the real shop is next deployed, i.e. launch day). In Person items wait in the In Person queue for Barry's check,
  as on Etsy. If Printify refuses the automatic send, the order stays on hold in the app with a note.
- introverthere.com is on Cloudflare (active since 21 Nov; nameservers ezra/meadow.ns.cloudflare.com at Namecheap).
  Namecheap's parking A/CNAME records were deleted; its email-forwarding MX/TXT records were kept. Not yet attached
  to the shop worker: do that on launch day (Workers > introvert-here-shop > Domains: introverthere.com and www),
  then point the Stripe webhook at introverthere.com if wanted. Site email stays admin@mosspit.org (Barry's choice).

### Visitor numbers
- Cloudflare Web Analytics is set up for introverthere.com (22 Nov) with automatic setup: Cloudflare adds the beacon
  itself once the domain is attached to the shop worker, so no code. The workers.dev preview isn't counted.

### Google Shopping (free listings)
- `/google-products.xml` is a product feed built from the catalogue (one item per colour and size, In Person left
  out). Links open the product page with that colour and size chosen (`?colour=&size=`). Launch day: Barry creates
  a free Google Merchant Center account, verifies introverthere.com, sets UK delivery free, and adds the feed URL
  `https://introverthere.com/google-products.xml` as a scheduled daily fetch.

### Catalogue switch (22 Nov)
- The preview now reads the app's catalogue, KV `shop:catalog-next` (site prices, In Person with name preview, site-only
  early builds marked `siteOnly`, no Etsy link). The real shop still reads `shop:catalog` (old) until launch day, when
  `catalog()` in `shop/worker.js` should read `shop:catalog-next` for both. `shop:catalog-preview` is the old hand-made copy.
- The app now stores In Person photos itself, including Barry's `_BLANK` Canva pages as `b<NN>.jpg`.

### The Hoodini hunt (22 Nov)
- Hoodini hides in 7 places (see `huntJs` in `shop/worker.js`; on the preview `?hoodini=all` shows every one).
- Reward codes (25 Nov, `rewardCode`): finding all 7 Hoodinis or voting makes a one-off Stripe promotion code
  (HOODINI-XXXXXX / VOTED-XXXXXX) on the 5% coupon IH5OFF (created automatically): single use, 30 days, minimum
  spend £25, max 50 a month per kind, one per internet address per month. Codes never appear in page source.
  Counts in KV `reward:<kind>:<YYYY-MM>`. The preview shows a sample code instead.

### Newsletter (25 Nov)
- Escape Room noticeboard pin "Minimal contact" opens /uk/escape-room/newsletter: Barry's MailerLite form (account
  2825119, form jF2XBx; double opt-in), repainted in site colours. After MailerLite's thank-you shows, the page fetches a
  one-off HELLO-XXXXXX code (reward kind `hello`: 5%, £25 minimum, 30 days, one use, first order only, 50 a month).
  Privacy notice covers the newsletter and MailerLite.

### Aunt Doris: pay to unlock (23 Nov)
- Part One free; then £4.99 (Stripe Checkout, metadata product=doris; the webhook skips it as a clothing order and
  records the code). Unlock codes in KV `doris:codes`; a cookie `ih_doris` keeps the device unlocked; the code works
  on other devices via "Already bought it?". Locked pages don't contain anything after Part One. Preview test code:
  PREVIEW-DORIS, or the one-tap tester link `/uk/escape-room/aunt-doris?unlock=PREVIEW-DORIS` (preview only). The clock
  pauses on the paywall.
- 25 Nov: grown from 13 to 19 puzzles after a 21-minute test run. New Part Three (10 to 15: washing-up, loo queue,
  Gareth's speech, kids' room, smokers, taxi app); the old Part Three is Part Four (16 to 19). Harder: Sam's text
  (shift grows along each word), back gate (6 digits: HOME + minutes till the bus), front door (DO NOT DISTURB GO AWAY,
  with GO AWAY picked up in the middle of the kit). The booklet PDF needs remaking before the Etsy listing. Shop checkout accepts promotion codes (the one-off reward codes).

### US, Canadian, Australian and New Zealand shops live (28 Nov 2026)
- introverthere.com/us and /ca: same pages from each country catalogue (`REGIONS`, `regionCatalog` + `regionify` in worker.js; data in `shop/us.js`, `shop/ca.js`), dollar
  prices, US-only Stripe checkout (`/api/checkout?r=us`), separate basket. Choosing United States (or a US cookie) sends
  visitors there. Printers and prices: docs/shop/COUNTRY_FULFILMENT.md.

### Launched 28 Nov 2026
- introverthere.com and www attached to `introvert-here-shop` (Workers custom domains); the shop reads `shop:catalog-next`;
  Christmas mode from 27 Nov. Live Stripe: restricted key (rk_live, full access except sensitive operations) saved in
  KV SECRETS via the app's Orders page; webhook secret rotated in Cloudflare. Stripe customer emails (successful
  payments, refunds) switched on. Tests 28 Nov: live tee order (webhook -> Printify order on hold, cancelled; refunded)
  and live Aunt Doris unlock (code issued). AUTO_SEND back to yes afterwards.
- Stripe's key verification only worked after clearing Chrome cookies and opening Gmail in the same browser.

### Launch day checklist (planned Mon 30 Nov, done 28 Nov)
1. Barry: Cloudflare, attach introverthere.com (and www) to the `introvert-here-shop` worker.
2. Barry: put the Stripe webhook's signing secret into the shop worker's `STRIPE_WEBHOOK_SECRET`; save the live
   secret key in the app's Orders page.
3. Nothing to create for discounts: reward codes are made in Stripe on demand (see below).
4. Me: `catalog()` reads `shop:catalog-next` for the real shop too; deploy the real shop (`shop/wrangler.toml`,
   AUTO_SEND=yes) from this branch. Copy KV `shop:preview:*` assets the real shop needs (logo-xmas.png, icon.png) to `shop:*`.
5. Together: a real test order (refund it), a real Aunt Doris unlock (refund it).
6. Barry: Google Merchant Center (free listings), feed `https://introverthere.com/google-products.xml`.
Final check 24 Nov: 197 pages crawled, no broken links; 77 pages checked on phone and desktop with no script
errors, missing files or sideways scrolling; checkout tested against Stripe test mode (prices, promotion codes, In
Person returns note).

### Stripe
- Only tested in **test mode**: one test order on record (`test-not-sent`). Live keys not yet saved.
- 21 Nov: Barry's **live** Stripe account is verified (sole trader, statement descriptor INTROVERT HERE, support
  email admin@mosspit.org, support/privacy/terms URLs on introverthere.com, private profile). A live webhook
  destination exists ("charming-triumph", description "Introvert Here shop orders") pointing at
  `https://introvert-here-shop.mosspit.workers.dev/api/stripe-webhook`, listening to `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`. **Launch day:** Barry puts its signing secret (whsec_...) into the
  shop worker's `STRIPE_WEBHOOK_SECRET` (Cloudflare), and his live secret key into the app's Orders page. Never in
  chat. The webhook URL may need changing to introverthere.com once the domain points at the shop.

## Make scenarios involved (team 2110125, org 8311421)
- **7896436 Build Next Listing (Core)**: creates the Printify product (module 39) in shop 27154106 and publishes to
  Etsy (module 40). This is where a "keep the shop catalogue in step" hook would go. It now has 9 temporary
  `TRACE` modules posting to the app's `/api/trace`; removal is scheduled for 22 Nov. Its two end-of-step status
  writes now go through the app (`/api/gag-status`) because Make's Excel step failed silently there.
- **7446858 Printify tool** (generic Printify and Graph/Core calls via Make), **7705176 Etsy tool** (now on Etsy
  connection 13189352, which has order scopes `transactions_r/w`).
- **8665996 In Person: print file for an order**, **8660766 In Person: mockups to Etsy**.
- **8692339 Etsy emails search**: built, not used (Etsy doesn't send Barry emails); leave off.

## What's left / decisions for the shop thread
1. ~~Keep the catalogue current automatically~~ built 20 Nov (see Catalogue above); **needs deploying**.
2. **In Person** is the one range still missing. It needs a name box at checkout and a one-off Printify order like the
   approvals app's In Person flow (`ipoPlace`: Canva print via Make 8665996, then Printify order with `print_areas`),
   not the Etsy product's variant. Exclusive could do with its own banner and background.
3. ~~Prices~~ the builder matches Etsy's VAT-inclusive prices (In Person, when added, is exactly £3 more after VAT).
4. **Go live**: domain introverthere.com pointing at the worker, Stripe live keys, legal pages checked, postage,
   decide whether `AUTO_SEND` stays off (Barry approves each order) or goes on.
5. **UK printing**: decide whether UK orders go to a UK printer (pilot above) or Printify Choice.
6. Tracking back to the buyer: Printify can email shipping notifications (`send_shipping_notification`); nothing else
   is set up for shop orders yet.

## Useful facts
- Etsy shop 65435151; Printify shop 27154106; Cloudflare account 82725ced954062d2cb0d30912fbd923c.
- Deploying a worker: `CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=<account> npx -y wrangler@3.114.0 deploy`
  from the worker's folder (the approvals app deploys from a copy at `/home/user/approval-app`).
- Make: an on-demand scenario must be started before its first run; runs with inputs use
  `POST /scenarios/{id}/run {data, responsive}`. The Make API token can't create hooks (use the MCP tool).
