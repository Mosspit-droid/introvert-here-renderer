# Introvert Here website: plan and launch checklist

Status (14 Nov 2026): brand pages built into the shop worker (`shop/worker.js`). Not on the real shop yet.
Preview (noindexed, same data as the shop): https://introvert-here-preview.mosspit.workers.dev (Cloudflare Worker "introvert-here-preview").

## What the site is now

One Cloudflare Worker, `introvert-here-shop`, serving both the brand site and the UK shop:

| Address | Page |
|---|---|
| `/` | Home: intro, four promises, range cards, newest 8 designs |
| `/about` | About Introvert Here and Mosspit Studios |
| `/uk` | Every design |
| `/uk/r/<range>` | One range: `introvert-here`, `shhh`, `per-contract`, `off-the-shelf` (old `/uk?c=XX` links redirect here) |
| `/uk/p/<slug>` | Design page, now with a link back to its range and four more designs |
| `/uk/basket`, `/uk/thanks` | Unchanged |
| `/terms`, `/returns`, `/privacy`, `/contact` | Email, address and domain now come from settings |
| `/choose-country`, `/elsewhere` | Country picker (moved off the home page) and the Etsy page |
| `/robots.txt`, `/sitemap.xml` | For search engines, once indexing is switched on |

Checkout, the Stripe webhook, Printify ordering and the approvals-app link are unchanged.

**Non-UK visitors** are no longer stopped at a country picker. Every page shows a slim banner to anyone whose
connection (or chosen country) isn't UK: "Not in the UK? … Every design is on Etsy". It has an "I'm in the UK" button.

**Ranges come from the catalogue.** A range card and range page appear only when the range has designs in the catalogue.
Off The Shelf will appear on its own once its listings are LIVE in Core and `build_catalog.py` is run again
(its colours, banner and background are already set up).

**Search engines:** every page has a description, social-preview tags and structured data (shop details,
range lists, and products with price and free UK delivery). All of it uses `SITE_URL`.

## Settings (`shop/wrangler.toml` [vars])

| Setting | Now | Set when |
|---|---|---|
| `INDEXING` | `no` (every page noindexed, robots.txt closed) | The domain is live and the legal details are filled in |
| `SITE_URL` | blank (uses the worker's own address) | The domain is chosen, e.g. `https://introverthere.com` |
| `CONTACT_EMAIL` | blank (placeholder shown) | Before launch |
| `BUSINESS_ADDRESS` | blank (placeholder shown) | Before launch |

## Open decisions and recommendations

1. **Domain.** Cloudflare has no domains on the account yet. Recommendation: an Introvert Here domain
   (e.g. introverthere.com or .co.uk) for the shop, and keep mosspit.org for Mosspit Studios as already planned.
   Check what's available before deciding. Once it's added to Cloudflare, attach it to the worker as a Custom Domain
   and set `SITE_URL`.
2. **Shop on its own, or a brand site around it.** Built: a light brand site around the shop, in one worker.
   It doesn't affect the shop, and it gives the domain a proper front page. A blog or newsletter can come later
   (the privacy page currently promises no marketing emails, so that needs changing first).
3. **Ranges.** Recommendation: launch with the three live ranges. Add Off The Shelf when its Etsy listings go live, by
   rebuilding the catalogue (no site change needed). It would be worth rebuilding the catalogue anyway: it was last built
   10 Nov and has 22 designs.

## Launch checklist

- [ ] Choose and buy the domain, add it to Cloudflare, attach it to `introvert-here-shop`
- [ ] Fill in `CONTACT_EMAIL` and `BUSINESS_ADDRESS`; the return address on `/returns` is still a placeholder in the copy
- [ ] Barry reads the About page and home page copy
- [ ] Stripe: live key saved in the approvals app; webhook pointed at `<domain>/api/stripe-webhook`
- [ ] One real order end to end (approve it in the approvals app's Orders page)
- [ ] Decide on `AUTO_SEND`
- [ ] `SITE_URL` set, then `INDEXING = "yes"`; submit `<domain>/sitemap.xml` to Google Search Console
- [ ] Point the Mosspit draft's "Visit the shop" link at the new domain instead of Etsy
