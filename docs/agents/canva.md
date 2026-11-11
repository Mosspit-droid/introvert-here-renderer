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
