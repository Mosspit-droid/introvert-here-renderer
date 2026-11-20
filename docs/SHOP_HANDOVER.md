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

### Catalogue: `shop/build_catalog.py`
- Joins Core `LISTING_REGISTRY` (STATUS = LIVE) + `PRODUCT_RULES`, Printify products (variants, prices, order codes)
  and Etsy listing photos into `shop:catalog`.
- **It's a manual, one-off build and is out of date**: 22 designs (IH 14, PC 5, SH 3), built around 10 Nov.
  Off The Shelf, Exclusive and In Person aren't in it, nor anything listed since.
- `MAIN_COLOUR` per range: IH Black, SH Dark Heather, PC Navy, OS Maroon.

### Mockups: `shop/mockups/` (see its README)
- Printify mockups are recoloured/composited onto each range's background (`run_all.py`, `compose.py`,
  `recolour.py`). The sandbox can't reach Printify's image host, so `mirror-worker/` copies images into KV first.

### UK printing pilot: `shop/uk/make_pilot.py`
- A draft UK-printed tee (Print Clever, provider 72) at the same physical print size as the Etsy Printify Choice tee
  (print y 0.482). Idea: UK shop orders printed in the UK. Not rolled out.
- Note: all In Person garments use **Printify Choice (provider 99)**, which routes to the nearest printer itself.

### Stripe
- Only tested in **test mode**: one test order on record (`test-not-sent`). Live keys not yet saved.

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
1. **Keep the catalogue current automatically**: rebuild after each new listing, price change or deactivation
   (the app keeps deactivated gags in KV `listing-off`), instead of the manual build. Likely a scheduled job in the
   approvals app or a step at the end of the builder.
2. **Add the missing ranges**: Off The Shelf (needs its mockup backgrounds), Exclusive, and In Person. In Person needs a
   name box at checkout and a one-off Printify order like the approvals app's In Person flow (`ipoPlace`: Canva print
   via Make 8665996, then Printify order with `print_areas`), not the Etsy product's variant.
3. **Prices**: Core prices are before VAT (Etsy adds 20%). Decide the shop's prices: match Etsy's VAT-inclusive
   prices ending in .99 (In Person adds exactly £3 after VAT).
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
