# Handover: In Person (IP) print templates and standard size guides

Written 17 Nov 2026. The Canva edit tool (edit-design-v2) returned "tool not found" in the earlier session, so this job was
moved to a fresh session. Read `docs/ranges/in-person-core-pending.md` and `docs/agents/canva.md` first.

## Job 1: four IP print templates, copied from Per Contract (Barry's choice)
Barry's rules: work on copies in Claude's Canva folder ("OTS print templates (Claude working copies)", folder id `FAHakYrx_Fk`);
never edit or delete his originals; publishing a brand template needs his OK (Canva asks him).

| Garment | Per Contract source (brand template) | Suggested IP name |
|---|---|---|
| T-shirt | `EAHZzMnH_-o` L001_PC_T-SHIRT_TEMPLATES | T001_IP_T-SHIRT_TEMPLATES |
| Long-sleeve | `EAHZzNwMyjw` M001_PC_LONG-SLEEVE_TEMPLATES | U001_IP_LONG-SLEEVE_TEMPLATES |
| Sweatshirt | `EAHZzbDgLIw` N001_PC_SWEATSHIRT_TEMPLATES | V001_IP_SWEATSHIRT_TEMPLATES |
| Hoodie | `EAHZzpAcqKo` O001_PC_HOODIE_TEMPLATES (front + back) | W001_IP_HOODIE_TEMPLATES |

Done already:
- In Person wide logo uploaded to Canva: media id `MAHbN5SI7TQ` (from `brand-logos/main-collections/in-person-wide.png`, 4500 × 1500).
- Working copies in folder `FAHakYrx_Fk` (made from the PC brand templates, not yet edited): T-shirt `DAHbN79bvuE`,
  long-sleeve `DAHbNy5UdDo`, sweatshirt `DAHbNwzpSHI`, hoodie `DAHbNzBczJw` (page 1 front chest logo, page 2 back).
- In Person stacked logo uploaded (for the hoodie front): media id `MAHbN--mFDE`.
- 17 Nov (second session): edit-design works now. But the logo in the copies is padlocked: swap, crop, delete and adding a
  layer are all refused ("locked"). Waiting for Barry to click the padlock on the logo in each of the four copies
  (same as the OTS job). Note: brand template ids need create-design-from-brand-template, not copy-design.

What the PC T-shirt template contains (page 3951 × 4919, black background):
- GAG_TEXT text box (autofill field `GAG_TEXT`, locked), top 1000, left 250, 3440 wide.
- The logo: a rect (top 0, left 182, 3590 × 963.02) filled with the PC wide logo image, cropped with
  imageBox top -258, left -39.86, 3669.73 × 1221.02.

The swap: both wide logos were built by the same script at 4500 × 1500, so the IP logo fits the same crop. Either replace the
rect's image fill with `MAHbN5SI7TQ` keeping the same imageBox, or remove the rect and `add_image` the IP logo at
top -258, left 142.135, 3669.73 × 1223.24 (the transparent top strip falls off the page). The IP badge reaches lower than the
PC tag (alpha bottom 1462 vs 1349 of 1500) but still sits inside the visible area.

Check each of the other three templates' structure first; the hoodie has a front (small chest logo, probably the stacked logo:
upload `brand-logos/main-collections/in-person-stacked.png` if so) and a back. Then for each garment:
1. copy → swap logo → keep GAG_TEXT field as is;
2. test-fill a copy with "… I'M ALEX. WE'VE MET SIX TIMES." and show Barry the result next to the PC original;
3. only after Barry's OK, publish as brand templates with the names above;
4. add the new ids as CANVA_PRINT_PROJECT_CODE to `docs/ranges/in-person-core-pending.md` (per garment) for the other thread.

## Job 2: standard size guides for every range (Barry asked; cm and inches)
- One layout for all 6 ranges × their garments (about 22 images), built by script in the repo (like `brand-logos/`), so they
  can be regenerated. Same as now: 4500 × 4500 mockup page.
- Varies only by range logo + accent colour and garment silhouette/measurements.
- Rows = sizes actually sold (S–3XL today; no XS/4XL/5XL). Columns: chest width, body length, sleeve length (no sleeve row
  for hoodies), each in cm and inches. Same wording and footer on all ("Please check the size guide before ordering. All items
  are made to order especially for you.").
- Measurements from the Gildan size tables for 5000 (tee), 2400 (long-sleeve), 18000 (sweatshirt), 18500 (hoodie); confirm
  them against Printify's product size tables before use. Current guides disagree with each other.
- Show Barry a preview sheet first. Swapping them into the mockup brand templates means editing published templates
  (asks Barry each time) and changes pages Core counts on, so do it range by range with his OK.
