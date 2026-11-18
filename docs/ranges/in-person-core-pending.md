# In Person (IP): Core and Make entries waiting to be added

Collected 16–17 Nov 2026 in the personalised-range session, for Barry to post to the thread that edits Core and Make
once all four garments' mockup suites are published. Nothing here has been written to Core or Make yet.

## Colours (agreed with Barry)
- Grey follows exactly the same rule as the other ranges, plus Navy and Purple. No Black.
- Purple is left off the long-sleeve: no UK or EU printer carries Purple on the Gildan 2400.
- COLOUR_PROFILES rows to add:
  - `APPAREL_DARKHEATHER_NAVY_PURPLE` = `Dark Heather, Charcoal, Navy, Purple` (T-shirt, sweatshirt, hoodie)
  - `APPAREL_DARKHEATHER_NAVY` = `Dark Heather, Charcoal, Navy` (long-sleeve)
- Suggested Etsy colours: PRIMARY_COLOUR Purple, SECONDARY_COLOUR Gray (long-sleeve: Blue, Gray).
- Note: the app's "Update colours" screen needs one profile per range, so IP colour changes would be per garment.

## Video slot rule
Slot = the page's place in the MOCKUP_PAGES list + 1 (the Printify photo is Etsy image 2).

## T-shirt: T002_IP_T-SHIRT_MOCKUPS
- CANVA_PROJECT_CODE: `EAHbHc0Z3HY` (25 pages, field GAG_TEXT)
- CANVA_PRINT_PROJECT_CODE: `EAHbONKmDlE` (T001_IP_T-SHIRT_TEMPLATES, published 18 Nov, field GAG_TEXT)
- Layout: thumbnails 1–3 (Purple, Navy, Dark Heather), gift 4–6, hanging 7–9, close-up 10–12, all colours 13,
  barbecue setup/payoff 14–15 Purple, 16–17 Navy, 18–19 Dark Heather, flat lay 20–22, AGM 23, size guide 24, Find Your Range 25.
- MOCKUP_PAGES IP T-SHIRT (13 rows): 1, 2, 3, 4, 7, 10, 13, 14, 15, 20, 23, 24, 25
- VIDEO_SLOT1 / VIDEO_SLOT2: 9, 10
- Barry to check: stray cut-off logo bar top right of page 13; AGM page 23 uses the plain IH banner.

## Long-sleeve: U002_IP_LONG-SLEEVE_MOCKUPS
- CANVA_PROJECT_CODE: `EAHbKl-Q9Fs` (18 pages, field GAG_TEXT)
- CANVA_PRINT_PROJECT_CODE: `EAHbOA9jtWY` (U001_IP_LONG-SLEEVE_TEMPLATES, published 18 Nov, field GAG_TEXT)
- Layout: thumbnails 1–2 (Navy, Dark Heather), gift 3–4, hanging 5–6, close-up 7–8, both colours 9,
  hallway setup/payoff 10–11 Navy, 12–13 Dark Heather, flat lay 14–15, AGM 16, size guide 17, Find Your Range 18.
- MOCKUP_PAGES IP LONG-SLEEVE (12 rows): 1, 2, 3, 5, 7, 9, 10, 11, 14, 16, 17, 18
- VIDEO_SLOT1 / VIDEO_SLOT2: 8, 9
- Barry to check: size guide page 17 lists XS–5XL; listings sell S–3XL.

## Sweatshirt: V002_IP_SWEATSHIRT_MOCKUPS
- CANVA_PROJECT_CODE: `EAHbN_jcGPo` (25 pages, field GAG_TEXT)
- CANVA_PRINT_PROJECT_CODE: `EAHbOLz49-A` (V001_IP_SWEATSHIRT_TEMPLATES, published 18 Nov, field GAG_TEXT)
- Layout (same as the T-shirt): thumbnails 1–3 (Purple, Navy, Dark Heather), gift 4–6, hanging 7–9, close-up 10–12,
  all colours 13, zoo setup/payoff 14–15 Purple, 16–17 Navy, 18–19 Dark Heather, flat lay 20–22, AGM 23, size guide 24,
  Find Your Range 25.
- MOCKUP_PAGES IP SWEATSHIRT (13 rows): 1, 2, 3, 4, 7, 10, 13, 14, 15, 20, 23, 24, 25
- VIDEO_SLOT1 / VIDEO_SLOT2: 9, 10

## Hoodie: W002_IP_HOODIE_MOCKUPS
- CANVA_PROJECT_CODE: `EAHbNZPGdsw` (28 pages, field GAG_TEXT; print is FRONT_BACK: small chest logo front, gag on the back)
- CANVA_PRINT_PROJECT_CODE: `EAHbOHG0JQE` (W001_IP_HOODIE_TEMPLATES, published 18 Nov, page 1 front chest logo, page 2 back with GAG_TEXT)
- Layout: back thumbnails 1–3 (Purple, Navy, Dark Heather), gift box (front) 4–6, hanging front 7–9, hanging back 10–12,
  hood close-up 13–15, all colours 16, aquarium setup/payoff 17–18 Purple, 19–20 Navy, 21–22 Dark Heather,
  folded front 23–25, AGM 26, size guide 27, Find Your Range 28.
- MOCKUP_PAGES IP HOODIE (14 rows): 1, 2, 3, 4, 7, 10, 13, 16, 17, 18, 23, 26, 27, 28
- VIDEO_SLOT1 / VIDEO_SLOT2: 10, 11
- Checked with Barry: size guide S–3XL stays as is; page framing fine.

## Make (photo modules 700 and 711)
- HERO_COLOURS for IP, in page order: Purple, Navy, Dark Heather.
- The long-sleeve has no Purple pages: Purple must fall back to Navy there (or the long-sleeve gets its own list),
  otherwise a third of IP long-sleeve listings get a lead colour with no photos.

## Video (Make 7696096 and the renderer)
- Module 18 maps product-code prefixes to collections (SH-, PC-, OS-, and EX- since 16 Nov); anything else is treated as
  INTROVERT HERE…. It needs an `IP-` entry mapping to IP's COLLECTION name, or IP videos look up the wrong rows.
- The renderer uses `backgrounds/<code>.jpg` (code = first 2 letters of the collection). `backgrounds/IP.jpg` is made
  (17 Nov, Barry chose slate blue): slate-blue painted panelling, In Person stacked logo, same size/position as the others.
  Make sends the product code's first two letters (as for OS.jpg, EX.jpg), so IP- codes pick up IP.jpg.
  Rebuild with `brand-logos/video-backgrounds/build-in-person.py`. Live once this branch is merged into main.

## Global Fulfillment points (from a check of UK and EU printers' catalogues, 16 Nov)
1. Navy 3XL on sweatshirts and hoodies is carried as widely as Black 3XL (UK 2/3, EU 2/2). "3XL in Black only" also removes
   Navy 3XL from Per Contract and would from IP; it could be "Black or Navy".
2. Long-sleeves have almost no local printers even in Dark Heather L (UK 0/2, EU 1/2), across all ranges.
3. Charcoal is still in the IH, SHHH and PC colour profiles. On 15 Nov Charcoal was switched off on all 22 live Choice tees
   in Printify and Etsy. If the builder enables every listed colour, new tees and any "Update colours" run will switch it
   back on. Undecided who owns the grey rule.

## Test fills
Claude's working folder in Canva ("OTS print templates (Claude working copies)"): "CLAUDE WORK - IP T-shirt template test fill",
"CLAUDE WORK - IP long-sleeve template test fill", "CLAUDE WORK - IP hoodie template test fill", "CLAUDE WORK - IP sweatshirt template test fill". Safe to delete.
