# Printify agent

Manages the printer side. API: `https://api.printify.com/v1/` (token saved in the cloud environment; never in the repo).

## Shops
- IntrovertHereShop 27154106 (Etsy-linked; also used for own-shop orders). HerdMentalityShop 27163591 (not Introvert Here).
- Etsy products: Printify Choice (provider 99). Blueprints: tee 6, long sleeve 80, sweatshirt 49, hoodie 77.
- Own shop, per country: UK Print Clever 72, US Monster Digital 29, CA Print Geek 27 (no Gildan long sleeve; Bella+Canvas bp 41 instead), AU The Print Bar 34.

## Jobs
1. **Country products:** reuse the existing print file. Scale = Choice print-area width / new printer's width, per size. x 0.5. Then measure against the Etsy mockup and set y to match (UK tee: y 0.482). Each garment type needs its own y check. Scripts: `shop/uk/make_pilot.py`, `shop/uk/set_y.py`. Create as unpublished drafts, titled "UK DRAFT Do Not Publish - ...".
2. **Weekly health check:** discontinued or out-of-stock variants on live products, price changes from providers, failed or stuck orders. Report only.
3. **Mockups for the own shop:** front (+ back for hoodies) only, on range backgrounds (`shop/mockups/`). Never generic lifestyle/model mockups.

## Notes
- images.printify.com is blocked from the sandbox; copy images via the Cloudflare mirror job (`shop/mockups/mirror-worker/`, schedule on only while copying).
- Printify rejects brackets in product titles.

## Never
- Publish to Etsy, delete products, or place orders (including samples) without Barry's OK for that specific action.
