# Introvert Here shop: printing in each customer's country

Status: research only (10 Nov 2026). Nothing built or changed. Decision: **no Printify Choice for the own shop**;
each country's orders go to a printer in that country.

## What Barry set up before (archived Core, Sept/Oct 2026)

Found in OneDrive: `01_IH_CORE_GO_NUTS.xlsx`, `01_IH_CORE_TWO_PAGE_BUILD.xlsx`, `01A_IH_CORE.xlsx`
(sheet LOOKUPS, tables FULFILMENT_REGIONS, FULFILMENT_RULES, PRINT_PROFILES, SIZE_PROFILES, COLOUR_PROFILES).
Regions: UK, US, CA, AU (+ WW / GLOBAL). The Core later notes "Choice POC passed; replace territory-provider expansion",
which is when everything moved to Printify Choice.

| Region | Printer (Printify id) | Tee (bp 6) | Long sleeve (bp 80) | Sweatshirt (bp 49) | Hoodie (bp 77) |
|---|---|---|---|---|---|
| UK | Print Clever (72) | ✓ | ✓ | ✓ | ✓ |
| US | Monster Digital (29) | ✓ | ✓ | ✓ | ✓ |
| CA | Print Geek (27) | ✓ | **Gildan 2400 not offered** (Bella+Canvas long sleeve bp 41 is: Print Geek, Duplium) | ✓ | ✓ |
| AU | The Print Bar (34) | ✓ | ✓ | ✓ | ✓ |

All four printers still offer these garments in Printify's catalogue today (checked 10 Nov), except Print Geek long sleeve.
Old print profiles: tee and long sleeve front only; sweatshirt and hoodie front + back.
Old colour profiles: IH and PC Black + Dark Heather; SHHH. Dark Heather only.

## Print areas (largest size per printer, pixels)

| Garment | Choice (now) | Print Clever UK | Monster Digital US | Print Geek CA | The Print Bar AU |
|---|---|---|---|---|---|
| Tee front | 3591×4472 (0.80) | 4110×4658 (0.88) | 3909×4431 (0.88) | 3283×4378 (0.75) | 4682×5291 (0.88) |
| Long sleeve front | 3791×4303 (0.88) | 4110×4658 (0.88) | 3839×4387 (0.88) | – | 4110×4658 (0.88) |
| Sweatshirt front | 3349×3824 (0.88) | 4110×4658 (0.88) | 3909×4431 (0.88) | 3839×4387 (0.88) | 4682×5291 (0.88) |
| Hoodie front | 3273×2180 (1.50) | 3909×2606 (1.50) | 4110×2740 (1.50) | 3543×2361 (1.50) | 3909×2606 (1.50) |
| Hoodie back | 3349×2791 (1.20) | 3909×4431 (0.88) | 3839×4387 (0.88) | 4110×4658 (0.88) | 3909×4431 (0.88) |

(Number in brackets = width ÷ height.) Sweatshirt backs match the same ratios as the fronts.

## Archived Canva templates (folder ARCHIVE)

`OLD_A001_IH_T-SHIRT_TEMPLATES` (5 pages), `OLD_B001…LONG-SLEEVE` (5), `OLD_C001…SWEATSHIRT` (10), `OLD_D001…HOODIE` (10),
plus the SHHH. set (`OLD_P001`–`OLD_S001`), mugs and posters. Page sizes match the printers' print-area shapes, e.g. tee pages:
3951×4919 (Choice shape), 4500×5100 ×2 (UK and US shape), 3600×4800 (CA shape), 4682×5291 (AU exact).
Hoodie pages pair fronts (1.5 wide) with backs per printer.

## What it would take

1. **Products per country.** For each design and garment, a Printify product with that country's printer. Not published to Etsy;
   the shop orders them directly. Can be created through the Printify API with the existing print files, positioned for each
   printer's print area. (Same artwork; only the shape of the print area differs.)
2. **Colours per printer.** Check that each printer stocks the colours each collection uses; pick a fallback where one doesn't
   (e.g. The Print Bar tee has no Dark Heather).
3. **Prices per country**, in local currency, set from each printer's cost + postage.
4. **Shop:** catalogue per country, country picker routes to /uk, /us, /ca, /au; Stripe checkout locked to that country;
   the webhook orders the right country's product.
5. **Proofing:** one real sample per printer before opening that country.

## Open decisions for Barry

- Countries for launch: all four, or UK first then the others one by one.
- Ireland and New Zealand: send to Etsy for now? (Ireland is in the EU, so a UK printer means customs; an EU printer brings EU paperwork.)
- Canada long sleeve: drop it in Canada, or find another Canadian printer.
- Fresh print files from the archived Canva templates, or let the automation fit the current files to each printer's print area.
- Prices per country.

## Off The Shelf colours (Barry, 10 Nov)

Maroon (main), Dark Chocolate, Forest Green. Checked 10 Nov:
- Printify Choice (Etsy): all three on all four garments.
- Print Clever UK: all three on tee, sweatshirt and hoodie; **long sleeve has no Dark Chocolate** (Maroon and Forest Green only).
- **Decision (Barry, 10 Nov):** UK site long sleeve = Maroon + Forest Green only. Reassess Dark Chocolate long sleeve when setting up other countries.
