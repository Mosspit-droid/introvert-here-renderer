# Canva agent

Runs in sessions Barry starts (needs the Canva connector). Every edit is previewed and saved only after Barry approves.

## Jobs
1. **Audit:** list Barry's projects and pages, with sizes. Compare each print page with Printify's print areas (`docs/shop/COUNTRY_FULFILMENT.md`, Printify catalogue API). Flag text boxes and logos that are off-centre, off-size or not matching the print standard (the logo width equals the smallest print area across territories). Report first.
2. **Naming:** propose logical page names that match Core's MOCKUP_PAGES naming (e.g. `IH_01_TS_THUMBNAIL`, `OS_07_HD_MAROON`). Colour photos end with the colour word (BLACK, DARK_HEATHER, NAVY, MAROON, FOREST_GREEN, DARK_CHOCOLATE) so the shop picks them up.
3. **Brand templates:** convert agreed designs to brand templates, keeping autofill labels the automation uses.
4. **Print files:** when a new country shape is needed, add a page at the exact pixel size and place the artwork at the same physical size, centred.

## Known facts
- Archived templates: folder ARCHIVE (FAHUVs8FBYw), `OLD_A001`…`OLD_S001`. Logo kit folder FAHadS3v8sM.
- The live automation reads Canva project codes from Core PRODUCT_RULES (`CANVA_PROJECT_CODE`, `CANVA_PRINT_PROJECT_CODE`). Don't rename or move those designs without updating Core, with Barry's OK.
- Canva and etsystatic hosts are blocked from the sandbox; use the Canva tools (read-design gives page thumbnails).

## Never
- Save edits without Barry's approval of the preview.
- Use generic stock mockups in place of Barry's own.

## Page naming convention (from Barry's OTS T-shirt brand template EAHajluNhMY, 10 Nov 2026)
`{RANGE}_{NN}_{GARMENT}_{SCENE}_{COLOUR}`, NN = page position (01, 02...). Each scene is followed by its colour pages (main colour first, e.g. MAROON, FOREST_GREEN, DARK_CHOCOLATE). Story scenes interleave: SETUP_MAROON, PAYOFF_MAROON, SETUP_FOREST_GREEN, PAYOFF_FOREST_GREEN... Single pages without colour: VARIANTS, SIZE_GUIDE, RANGE, AGM.
T-shirt scenes: THUMBNAIL, GIFT, HANGING, VARIANTS, CLOSEUP, SETUP, PAYOFF, FOLDED, SIZE_GUIDE, RANGE, AGM.
Sweatshirt (OTS, 11 Nov): THUMBNAIL_MAROON (1 page), GIFT, CLOSEUP, ARMCHAIR, VARIANTS, SETUP/PAYOFF pairs, FLATLAY, SIZE_GUIDE, RANGE, AGM. Lying-flat shots are FLATLAY (Barry).

## What the Canva API can do for colour pages (tested 10 Nov 2026 on a throwaway copy)
- Read every page's name and which photo is on it (read-design with a transaction).
- Swap a page's photo; a wired GAG_TEXT box keeps its wiring and font.
- Add a new page WITH a name, put a photo on it and the logo at the exact position/angle/opacity.
- Duplicate a page (merge-designs insert_pages from the same design): wiring and font kept, but the copy keeps the original page's name. Pages can't be renamed afterwards.
- A gag-text box created from scratch can be wired, but its font can't be set (comes out in Canva's default), so text pages must be duplicates of Barry's wired pages.
- The listing builder ignores Canva page names; it uses page order plus Core MOCKUP_PAGES (POSITION -> PAGE_NAME).

## Permissions (11 Nov 2026)
Barry added `.claude/settings.json`: Canva reading, editing, copying, page merging/reordering, uploads, folders and exports run without asking in new sessions. Still asks: publishing a brand template, autofill. Rule stays: work on copies in Claude's folders, never overwrite or delete Barry's originals.

## Off The Shelf print templates (done 11 Nov 2026)
Published H001-K001; IDs and details in `docs/canva/OTS_BRAND_TEMPLATES.md`.
- How: copy the IH template, Barry unlocks the logo (padlock), swap the picture (update_fill), make the box taller (resize + position), then crop_media back to the IH image box so the logo sits exactly where IH's does.
- API limits found: a locked layer can't have its picture replaced, moved, resized or deleted; template pages are locked against adding layers; uploads to canva.com are blocked from the sandbox (use assets already in Canva). OTS logos in Canva: wide MAHaUanyvaU, stacked MAHaUa_Csv8.
- Barry wants alignment exact, however slight the difference. Barry has said to go ahead without per-edit approval on this job; publishing still prompts him.
- Throwaway copies, safe to delete: DAHakQL4H1E (PC tee), DAHakTwFHys, DAHakRlfNUE, DAHakSSBck0, DAHakYngobQ, DAHakWrnWmg, DAHaka3i6yI, DAHakp-exhg, DAHakgv6_r8 (OTS mockup copies), DAHakfzcxeA (PC hoodie).

- Check page names against a fresh copy of the template before writing MOCKUP_PAGES; Barry edits templates and a stale read put the T-shirt rows one page out (fixed 11 Nov).

## Adding colour pages to IH, SHHH. and PER CONTRACT mockup templates (future job, Barry 11 Nov)
Adding pages moves the page numbers, so every range done must also update Core in the same sitting:
- MOCKUP_PAGES: POSITION = the live Canva page number of each page sent to Etsy (re-read a fresh copy of the template first; max 19 pages per listing, plus the Printify shot).
- PRODUCT_RULES VIDEO_SLOT1/2_POSITION: the Etsy image numbers of the serious/setup and funny/payoff pages (= their place in the MOCKUP_PAGES list + 1, since the Printify shot is image 2).
- Do the template republish and the Core update together, between daily builds (the builder runs about 08:00), otherwise the next listing gets the wrong photos. Back up Core first.
- Colours per range (Barry 11 Nov): IH main Black, variant Dark Heather (all garments). PER CONTRACT main Navy; T-shirt variants Black + Charcoal (Charcoal only because Dark Heather isn't on Printify Choice tees); long sleeve/sweatshirt/hoodie variants Black + Dark Heather. SHHH. is Dark Heather only (no variants). OTS Maroon + Forest Green + Dark Chocolate.

## Colour pages for IH / PER CONTRACT: overnight attempt 11 Nov (stopped)
- Photo route works: Barry allowed www.canva.com (uploads) and export-download.canva.com (exports) on the Default environment. To get a raw photo without overlays: put the photo asset on a blank page in a scratch design, commit, export. Scratch design: DAHakvmTsoU ("CLAUDE WORK - raw photo exports"). Working copies renamed "CLAUDE WORK - ..." (DAHaknoUBhA IH tee, DAHakilcI6Q PC tee).
- Black -> Dark Heather with `shop/mockups/dark_recolour.py` (GrabCut cut-out + target brightness + synthetic heather speckle): colour looks right, but the hanger got recoloured, edges were ragged and collar/seam detail flattened. Not good enough to publish. Black photos hold too little detail; better routes: Barry's own Dark Heather photos (some exist: IH_08_TS_GREY, IH sweatshirt DARK_HEATHER pages), or an AI image edit of the blank photo (uses Canva's AI limit, ask first).
- Navy -> Black (PC) not tested: Canva edits on the scratch design were declined at that point, so work stopped.
- Session safety check prompts Barry on some Canva edits even on renamed copies; overnight unattended Canva work isn't reliable in this kind of session.

## IH T-shirt mockups rebuilt by Barry (11 Nov): Core updated
- A002 (EAHXKA4EqCs) now 18 pages: thumbnail/gift/hanging/closeup in Black + Dark Heather, variants (9), setup/payoff Black (10, 11) and Dark Heather (12, 13), flatlay Black/DH (14, 15), AGM 16, size guide 17, brand 18.
- MOCKUP_PAGES IH T-SHIRT: 12 rows, same rule as OTS (both thumbnails, Black of each scene, variants, AGM, size guide, brand): pages 1, 2, 3, 5, 7, 9, 10, 11, 14, 16, 17, 18. PRODUCT_RULES IH T-SHIRT VIDEO_SLOT1/2 = 8, 9. Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-11_before_IH_TS_pages.xlsx.
- Page-name typos (page 9, pages 14/15) fixed by Barry 11 Nov; Canva names now match Core.

## Lead colour cycles by gag number (builder change, 11 Nov, Barry approved)
- Make builder 7896436, modules 700 (new builds) and 711 (artwork / "Update mockups" path): HERO_COLOURS is a list per range, in the same order as that range's THUMBNAIL pages in MOCKUP_PAGES: IH Black, Dark Heather; SHHH. Dark Heather; PER CONTRACT Navy; OFF THE SHELF Maroon, Forest Green, Dark Chocolate. Lead colour = list[(gag number - 1) % length] (gag number from the product code, e.g. IH-00014 -> 14 -> Dark Heather). The plain Printify shot (photo 2) uses that colour.
- New module 7200 (main path, after 51) and module 716 (artwork path): sort pages by position, put the THUMBNAIL page whose name ends with the lead colour first, keep everything else in order, rank by list order. Only the thumbnails swap places, so video slots are unchanged.
- When Barry adds colours to a range: add its THUMBNAIL_<COLOUR> pages to MOCKUP_PAGES and the colour (Printify name) to HERO_COLOURS in both 700 and 711, in the same order. The cycle is (gag number - 1) mod the number of colours, so 1 colour = always that colour, 3 colours = 1st, 2nd, 3rd, 1st... PER CONTRACT needs per-garment lists (T-shirt: Navy, Black, Charcoal; other garments: Navy, Black, Dark Heather): add a "PER CONTRACT|T-SHIRT" style key when its colours arrive.
- Backdating live listings: rerun their mockups through the artwork path (the planned "Update mockups" amend, AMENDMENT_REQUIRED_ARTWORK). Deterministic, so a rebuild matches what a new build would give. Live IH T-shirt listings would also switch to Barry's new 18-page suite. Needs Barry's go-ahead; small batches.
- Checks scheduled 12 and 13 Nov 09:00 (one odd, one even gag). Pre-change blueprint: Make version history (and session scratchpad make/bp2_7896436.json).
- Old-photo tidy-up (11 Nov, Barry approved): in the builder's artwork path, after the new photos upload (273) and before "Restore original Etsy state" (274): 7301 GET listing images, 7302 works out photos not uploaded in this run (only if every expected page uploaded and never all photos), 7303-7305 delete them one by one (Etsy DELETE /shops/65435151/listings/{id}/images/{image_id}; a failed delete is ignored, not fatal). Videos untouched. Not yet run on a live listing: check the first "Update mockups" result.
- Barry's rule (11 Nov): other threads also edit the Make builder and the approvals app. Don't change the approvals app from a Canva thread at all, and don't change or roll back the Make builder unless you've read the current scenario in full first: old saved blueprints would overwrite newer work.

## IH long-sleeve mockups rebuilt by Barry (11 Nov): Core updated
- B002 (EAHZzRX2MUY) 18 pages, same layout as the IH T-shirt. MOCKUP_PAGES IH LONG-SLEEVE: pages 1, 2, 3, 5, 7, 9, 10, 11, 14, 16, 17, 18; VIDEO_SLOT1/2 = 8, 9. Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-11_before_IH_LS_pages.xlsx.
- Canva discrepancies (page 4 and 15-18 names, stray off-page gag text on page 14) fixed by Barry 11 Nov and re-checked: names now match Core.

## IH sweatshirt mockups rebuilt by Barry (11 Nov): Core updated
- C002 (EAHZzIcSycs) 18 pages. MOCKUP_PAGES IH SWEATSHIRT: pages 1, 2, 3, 5, 7, 9, 10, 11, 14, 16, 17, 18; VIDEO_SLOT1/2 = 8, 9. Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-11_before_IH_SW_pages.xlsx.
- Checked with Barry: pages 14/15 gag-text box extending below the page and page 10's older background are intentional; page 8 renamed IH_08_SW_CLOSEUP_DARK_HEATHER (dark heather collar close-up), verified 11 Nov. All overlays locked.

## IH hoodie mockups rebuilt by Barry (11 Nov): Core updated
- D002 (EAHVuIUaE1M) 23 pages. Two hoodie gags: story 1 = pages 12 (setup Black), 13 (setup Dark Heather), 14 (payoff, shared by both colours because the hoodie isn't in it; no gag text); story 2 = pages 15-18 (setup/payoff Black, Dark Heather, with gag text). MOCKUP_PAGES IH HOODIE (15 rows): pages 1, 2, 3, 5 (hanging back), 7 (hanging front), 9, 11 (variants), 12, 14 (story 1), 15, 16 (story 2), 19, 21, 22, 23. VIDEO_SLOT1/2 = 11, 12 (story 2 Black). Etsy allows 2 videos: story 1 could be a second video later (LISTING_REGISTRY has VIDEO2_* columns). Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-11_before_IH_HD_pages.xlsx.
- Re-checked 11 Nov 21:46: hidden logos removed, page 6 edge fixed, page 17 layering fixed (logo opacity 0.39 vs 0.64 elsewhere). Pages 12/14 (story 1) added to Etsy 11 Nov (backup before_IH_HD_story2).

## SHHH. T-shirt mockups rebuilt by Barry (12 Nov): Core updated
- P002 (EAHX6ptv4mU) 11 pages, one colour (Dark Heather), no colour words in names. MOCKUP_PAGES SH T-SHIRT: all 11 pages (thumbnail, gift, hanging, closeup, setup 1, payoff 1, setup 2, payoff 2, AGM, size guide, brand). VIDEO_SLOT1/2 = 6, 7 (story 1, as before). Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_SH_TS_pages.xlsx.
- Reported: gag text unlocked on pages 1, 3, 5; closeup (page 4) logo unlocked and running off the right/bottom edge; setup 1 vs payoff 1 overlays differ in size and grouping; page 10 uses a different logo asset.
- 12 Nov: made SH tee setup 1 (page 5) and payoff 1 (page 6) overlays identical at Barry's request via create-brand-template-draft + edit + publish (template ID unchanged, EAHX6ptv4mU): logo 610.6 x 199.4, gag text box 576.4 wide at 43 pt, same logo-to-text spacing; payoff keeps its own position and -1.87 degree tilt. The API can't lock layers: Barry re-locks.

### SHHH. long sleeve rebuild (12 Nov 2026)
- Template EAHZzYBgHiY (Q002_SH_LONG-SLEEVE_MOCKUPS), 11 pages. Core MOCKUP_PAGES rows 64–74 now SH_01_LS_THUMBNAIL … SH_11_LS_BRAND (positions 1–11), using the names the pages should have.
- PRODUCT_RULES AU7:AV7 = 6, 7 (video on setup 1 / payoff 1).
- Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_SH_LS_pages.xlsx.
- Template discrepancies at the time: page 8 titled SH_07_LS_SETUP_2 (should be SH_08_LS_PAYOFF_2); pages 9–11 titled SH_08/09/10 (one behind); overlays on setup/payoff pairs not identical; logo/text opacity differs between pages; page 6 left unlocked.
- 12 Nov: Barry fixed names and photo. Balanced the overlays by eye at his request: pair 1 left as is (sizes look right for how far away he stands); payoff 2 (page 8) logo and text made about 6% bigger, top edge kept where it was, because she stands closer than in setup 2. Text on pages 7 and 8 set to 80% (Barry's standard). Published, ID unchanged. Page 1 text is still 64% (locked).

### SHHH. sweatshirt rebuild (12 Nov 2026)
- Template EAHZzqbkUro (R002_SH_SWEATSHIRT_MOCKUPS), 11 pages: THUMBNAIL, GIFT, HANGING, CLOSEUP, SETUP_1, PAYOFF_1 (back view, no overlay), SETUP_2, PAYOFF_2, AGM, SIZE_GUIDE, BRAND. Core MOCKUP_PAGES rows 75–85, PRODUCT_RULES AU8:AV8 = 6, 7. Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_SH_SW_pages.xlsx.
- Reported: overlays all at 64% (page 2's logo at 61%), not the 80% standard; gag text unlocked on pages 1 and 3. Pair 2 sizes look balanced by eye.

### SHHH. hoodie rebuild (12 Nov 2026)
- Template EAHX6iqxDIo (S002_SH_HOODIE_MOCKUPS), 11 pages: THUMBNAIL, GIFT, HANGING, FLATLAY, SETUP_1, PAYOFF_1, SETUP_2, PAYOFF_2, AGM, SIZE_GUIDE, BRAND. Setups show the small front chest logo; payoffs show the back print with the gag. Core MOCKUP_PAGES rows 86–96, PRODUCT_RULES AU9:AV9 = 6, 7. Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_SH_HD_pages.xlsx.
- Checked by eye: front logos (pages 5, 7) and back prints (pages 6, 8) are in proportion to the body in both pairs. Every overlay shows at 80%. Only the page 5 chest logo is unlocked.
- 12 Nov 09:00 check: IH-00014 hoodie built with Dark Heather lead (gag 14, even) and thumbnails in the right order; couldn't see the Printify shot's colour (i.etsystatic.com blocked). Builder ran about every 8 min overnight (~270 ops each); reported to Barry, not touched.

### PER CONTRACT T-shirt rebuild (12 Nov 2026)
- Template EAHZzseGrIk (L002_PC_T-SHIRT_MOCKUPS), 25 pages: each scene in Navy, Dark Heather, Black (thumbnail 1–3, gift 4–6, hanging 7–9), variants 10, closeup 11–13, setup/payoff pairs 14/15 Navy, 16/17 DH, 18/19 Black, folded 20–22, AGM 23, size guide 24, brand 25. Note: Dark Heather replaces Charcoal on the tee.
- Core MOCKUP_PAGES PC T-SHIRT (rows 97–109, same rule as IH: all thumbnails, Navy of each scene, variants, AGM, size guide, brand): pages 1, 2, 3, 4, 7, 10, 11, 14, 15, 20, 23, 24, 25. VIDEO_SLOT1/2 = 9, 10 (PRODUCT_RULES AU10:AV10). Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_PC_TS_pages.xlsx.
- Reported: page names 2/3 say PC_02_PC_/PC_03_PC_ (Core uses _TS_), page 21 "DARK HEATHER" has a space; gag text unlocked on 21, 22; payoff overlay looks ~10% big next to setup by eye; Charcoal -> Dark Heather change vs the earlier tee rule.
- 12 Nov: Barry fixed names and locks and unlocked the payoffs. Made the payoff groups (pages 15, 17, 19) 9% smaller (top and centre kept, wrap unchanged), so they match the setups by eye. Published, ID unchanged. Barry re-locks.

### PER CONTRACT long-sleeve rebuild (12 Nov 2026)
- Template EAHZzusW5X8 (M002_PC_LONG-SLEEVE_MOCKUPS), 25 pages, same layout as the PC tee (Navy/Dark Heather/Black). Core MOCKUP_PAGES PC LONG-SLEEVE rows 110–122: pages 1, 2, 3, 4, 7, 10, 11, 14, 15, 20, 23, 24, 25; VIDEO_SLOT1/2 = 9, 10 (AU11:AV11). Backup: 001A_INTROVERT_HERE_CORE_BACKUP_2026-11-12_before_PC_LS_pages.xlsx.
- Setup/payoff (station in the rain) use the same overlay size and position, and he's framed the same in both, so no change was needed (draft opened, then cancelled). Reported: overlay groups unlocked on pages 1–3, 14, 16, 18, 19, 20, 21; the size guide logo uses a different image (MAHZTmLLC_0) from the PC tee's.
