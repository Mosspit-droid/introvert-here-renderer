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
- Rows = sizes actually sold (S–3XL today; no XS/4XL/5XL). Columns: chest width, body length, sleeve length (hoodies too: Barry
  never asked to drop the hoodie sleeve; that note was wrong), each in cm and inches. Same wording and footer on all ("Please check the size guide before ordering. All items
  are made to order especially for you.").
- Measurements from the Gildan size tables for 5000 (tee), 2400 (long-sleeve), 18000 (sweatshirt), 18500 (hoodie); confirm
  them against Printify's product size tables before use. Current guides disagree with each other.
- Show Barry a preview sheet first. Swapping them into the mockup brand templates means editing published templates
  (asks Barry each time) and changes pages Core counts on, so do it range by range with his OK.

### Job 2 progress (18 Nov)
- 18 Nov: Barry said no to the first look; restyled like Find Your Range (dark header, rounded range-colour cards, letter-spaced caps) with stacked logos.
- Built `size-guides/build.js` + `size-guides/measurements.json` (all numbers in one file, inches laid flat; cm worked out).
  `node size-guides/build.js [RANGE] [garment]` writes `size-guides/out/<RANGE>_<garment>.png` (4500 x 4500, git-ignored).
  21 guides: 5 ranges x 4 garments + Exclusive. T-shirt only (Barry, 18 Nov; matches the topical brief and the Find Your Range graphic).
- Measurements are Gildan spec-sheet figures, NOT yet confirmed against Printify: printify.com was added to the environment's
  allowed hosts (Barry approved) but still didn't resolve in this session; raw page download was refused by the safety check.
  Each image carries a yellow "PREVIEW · MEASUREMENTS TO CONFIRM" tag until `status` in measurements.json is "CONFIRMED".
- Sleeve length is measured from the centre back of the neck (Gildan's method). The old guides used centre-back numbers but
  said "from the shoulder seam": fixed in the wording.
- Nothing changed in Canva. Next: Barry reviews the preview, measurements confirmed, then swap into mockup templates range by
  range with his OK (size guide page numbers are in in-person-core-pending.md / canva.md per template).
- Next session: check every number in size-guides/measurements.json against Printify's size tables (printify.com is now in
  the environment's allowed hosts), set "status": "CONFIRMED", rerun build.js (the yellow tag disappears), show Barry, then
  swap into the mockup templates range by range with his OK.
- 18 Nov (later): printify.com now reachable by curl, but its product pages are an app shell; the size table comes from
  printify.com/product-catalog-service/api/v2/blueprints/<id>/size-guide, and calling that was refused by the session's
  safety check (needs Barry's permission rule, or Barry sends screenshots of each garment's Printify "Size guide" tab).
  Shop products' descriptions carry no size table. Cross-checked so far (web, spec-sheet copies): 2400 chest 18-28 and
  length 28-33 match; 18000 sleeve S 33.5 / M 34.5 match. Still unconfirmed: tee sleeve, rest of 18000, 18500, 2400 sleeve.
- 18 Nov: Barry sent Printify size-chart screenshots. Long-sleeve (2400), sweatshirt (18000), hoodie (18500) confirmed and
  entered (2400 sleeve is shoulder-seam 25-27.5 in; 18000/18500 sleeve is centre-back; tolerance 1 in for 2400, 1.5 in for
  18000/18500). His tee screenshot was a Comfort Colors 1717, but the shop's tees are Gildan 5000 (blueprint 6): tee still
  TO CONFIRM. Printify also lists an 18500 sleeve (33.5-38.5 centre back); left off per Barry's spec.
- 18 Nov: Gildan 5000 confirmed from Barry's screenshot (sleeve 15.1-22.4 in centre back, tolerance 1.5 in). Hoodie sleeve
  column added (Barry: he never said no sleeve column for hoodies). All four garments now confirmed; no yellow tags.

### Swapping the size guides into the mockup templates (18 Nov)
- All 21 guides uploaded to Canva. Media ids: IP tee MAHbON6LiYI, LS MAHbOHxtGlY, SW MAHbOA1qlEs, HD MAHbOHrg1yc;
  IH MAHbOHfy5G4 / MAHbOIZDjX0 / MAHbODxguzg / MAHbOFlNmd8; SH MAHbOO9nvGQ / MAHbOLnxuEE / MAHbOI-__0A / MAHbOK5kYkM;
  PC MAHbOHCjL8c / MAHbODEENr4 / MAHbODiOwOw / MAHbOGvtnDg; OS MAHbOInf8fE / MAHbOLo6okM / MAHbOGutycA / MAHbOEdN5yg;
  EX tee MAHbOKOmOms. All uploaded after the final measurements.
- Size guide page per template: IH A/B/C 17, IH D 22; SH P/Q/R/S 10; PC L/M/N/O 24; OS H/I/J/K 24 (not 23: 23 is AGM);
  EX E002 8; IP T 24, U 17, V 24, W 27. Each page = full-page picture + (most) a separate logo on top.
  Swap = update_fill the full-page picture, crop to 0,0,4500,4500, delete the logo overlay (new guide has its own logo).
  Page count unchanged, so Core MOCKUP_PAGES / video slots don't change.
- Done in draft (not published): IP sweatshirt V002 draft DAHbOHI6TWU (page had no logo overlay, picture not locked).
- Blocked: in the other 20 templates the size-guide picture (and logo) is padlocked. Barry to unlock on each size-guide
  page: the background picture and the logo. Then re-open drafts and swap; publish range by range with his OK.
- 18 Nov (after Barry unlocked): size guides + Find Your Range page swapped and PUBLISHED (ids unchanged) in:
  IH A/B/C/D, SH P/Q/R/S, PC L/N, OS H/I/J/K, IP T/V (V's size guide went live when Barry's unlock published it).
  Range page only (size guide still locked): PC O002 (page 24 picture), EX E002 (page 8 picture).
  Not done at all (old logo overlay still padlocked on the size-guide page; swapping would leave two logos):
  PC M002 page 24, IP U002 page 17, IP W002 page 27. Their range pages are pending too.
- Range page = last page (IH 18 / D 23, SH 11, PC 25, OS 25, EX 10, IP T/V 25, U 18, W 28). New graphic media
  MAHbORKcUs0 = brand-logos/find-your-range/find-your-range-4500.png (build.js now takes an optional size argument:
  `node brand-logos/find-your-range/build.js brand-logos/find-your-range 4500`). Older templates had the 4-range version.
- Note: unlocking inside a brand-template draft publishes it. So only leave drafts in a state that's safe to go live.
- 18 Nov ~01:55: last five finished and published (PC M002, IP U002, IP W002: logo overlay removed by Barry, guide +
  range swapped; PC O002 and EX E002: Barry deleted the old size-guide picture, so the new guide was inserted as a new
  full-page image). **Job 2 done: all 21 mockup templates have the new size guide and the six-range page.**
- 18 Nov ~02:10: Barry reordered E002 to AGM (8) -> size guide (9) -> range (10). Core MOCKUP_PAGES synced (backup
  001A_INTROVERT_HERE_CORE_BACKUP_2026-11-18_before_EX_OS_page_names.xlsx): D292:D293 = EX_08_TS_AGM, EX_09_TS_SIZE_GUIDE;
  OFF THE SHELF had the same stale order (Core said 23 size guide / 24 range / 25 AGM, templates are 23 AGM / 24 size
  guide / 25 range), fixed in D159:D161, D172:D174, D185:D187, D198:D200. Positions unchanged, so video slots unaffected.
  Core is reached via Make tool 7446858 with path `graph:/v1.0/me/drive/items/01R3POCZGZPJY6UCRSEJD3MBADE4GJ24YQ/workbook/...`.
- Noticed, not touched: MOCKUP_PAGES rows 201-284 again hold the other-colour pages for PC LS/SW/HD and all OTS
  (Barry had these deleted on 12 Nov because they push listings past Etsy's 20 photos). Asked Barry.

### Core: full colour set of mockup pages (18 Nov 2026)

Barry: Core should hold every page, because his own website (replacing Etsy) will show the full set for whichever colour a customer picks, and it reads from Core.

- Backup first: `001A_INTROVERT_HERE_CORE_BACKUP_2026-11-18_before_colour_pages.xlsx` (same folder).
- Added 38 rows to the MOCKUP_PAGES table (sheet rows 295–332), names copied exactly from the Canva page titles:
  - IH tee / long-sleeve / sweatshirt: the Dark Heather pages 4, 6, 8, 12, 13, 15.
  - IH hoodie: Dark Heather pages 4, 6, 8, 10, 13, 17, 18, 20.
  - PC tee: Dark Heather and Black pages 5, 6, 8, 9, 12, 13, 16–19, 21, 22 (PC long-sleeve, sweatshirt and hoodie already had theirs).
- IP rows are still left for the In Person Core thread (`in-person-core-pending.md`).
- Checked with `docs/tagging/make/mockup_rank.js` before writing: the Etsy photo count is unchanged for every garment and colour. Black-led (PC: Navy-led) listings get exactly the same photos as before. A Dark Heather-led (or PC Black-led) listing now shows its photos in its own colour rather than Black/Navy, the same way PC long-sleeve/sweat/hoodie and Off the Shelf already worked.
- `IH_14_HD_PAYOFF` (no colour) is correct: checked the picture, it shows the friend at the window and an empty chair, no hoodie, so it is shared by both colours. Left as is in Canva and Core.
- IH tee page 9 is titled `IH_TS_VARIANTS` in Canva (Core has `IH_09_TS_VARIANTS`). Page names can't be changed through the Canva API, Barry renamed it by hand (18 Nov).
- 18 Nov: Barry asked for the In Person rows too: all 96 IP pages added to MOCKUP_PAGES (rows 333–428, COLLECTION `IN PERSON`).
  Details, backup name and the four Canva name typos are in `in-person-core-pending.md`.
