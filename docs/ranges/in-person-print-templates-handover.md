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
- 17/18 Nov (second session): Barry unlocked. Logos swapped in all four working copies, renamed T001/U001/V001/W001.
  The IP badge hangs ~92 px lower than the PC tag (in page units), so GAG_TEXT was moved down to keep PC's logo-to-text gap:
  T-shirt top 1092, long-sleeve 1091.6. Sweatshirt should go to 1091.8 but its text box is still padlocked (Barry to unlock).
  Hoodie back: logo box made taller (751.8 -> 841.72, same crop) so the badge isn't clipped; text moved to top 940, giving a
  ~120 px gap like the tees (PC hoodie only has ~2 px; Barry thinks the PC hoodie text should drop too: not touched, his call).
  Hoodie front: stacked logo swapped straight in (same 1400 x 466.67 box).
  Test fills (safe to delete): DAHbNwT8pf0 (tee), DAHbNzY_ItU (long-sleeve), DAHbN41k1bk (hoodie), DAHbN55G0ws (sweatshirt,
  not filled yet: text locked). Waiting for Barry's OK before publishing.
- 18 Nov: Barry OK'd tee, long-sleeve, hoodie: published as T001 `EAHbONKmDlE`, U001 `EAHbOA9jtWY`, W001 `EAHbOHG0JQE`
  (ids in in-person-core-pending.md). Sweatshirt text dropped to 1091.8 after Barry unlocked; test fill `DAHbOKiFYrs`;
  publish after his OK.
- Barry asked to drop the text on the PC hoodie and any other hoodie that needs it. Checked all hoodie print templates'
  back pages (logo bottom to GAG_TEXT box top): IH D001 ~211, SH S001 ~114+, OTS K001 ~150, PC O001 ~2. Only PC needs it.
  Plan: PC GAG_TEXT top 750 -> 870 (same ~122 gap as IP). Brand template draft `DAHbOBcNojk`: text is padlocked there,
  waiting for Barry to unlock, then edit + publish (template id unchanged).
  That draft vanished after Barry unlocked (probably published). New draft `DAHbOMldm2Q`: text moved to 870 and saved;
  published 18 Nov with Barry's OK (id unchanged, EAHZzpAcqKo).
- 18 Nov: V001 sweatshirt published `EAHbOLz49-A`. **Job 1 done.** All four IP print template ids are in in-person-core-pending.md.

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
