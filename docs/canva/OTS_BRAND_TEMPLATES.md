# Off The Shelf brand templates (11 Nov 2026)

## Print templates (made by Claude from the Introvert Here ones)
| Code | Brand template ID | Built from | Autofill fields |
|---|---|---|---|
| H001_OS_T-SHIRT_TEMPLATES | EAHakTLlfyQ | A001 IH T-shirt | GAG_TEXT, GAG_ID |
| I001_OS_LONG-SLEEVE_TEMPLATES | EAHakS-GeT8 | B001 IH long sleeve | GAG_TEXT, GAG_ID |
| J001_OS_SWEATSHIRT_TEMPLATES | EAHakcZs6r0 | C001 IH sweatshirt | GAG_TEXT, GAG_ID |
| K001_OS_HOODIE_TEMPLATES | EAHakQiSTgE | D001 IH hoodie (front pocket + back) | GAG_TEXT, GAG_ID |

- Logo: OTS wide logo (Canva asset MAHaUanyvaU) on every front/back, OTS stacked badge (MAHaUa_Csv8) on the hoodie pocket.
- Same size, centring and height as the IH logo on each garment (identical image box; same 4500x1500 logo canvas). Only the logo box is taller so the "OFF THE SHELF." tag shows. Text boxes unchanged.
- Source designs (Claude's copies, Canva folder FAHakYrx_Fk): DAHakawp7nk, DAHakVIuajY, DAHakbBLtSk, DAHakRDvxuA. The logo layers were unlocked to make the swap; lock them again in Canva to prevent accidental moves.

## Mockup templates (made by Barry)
| Code | Brand template ID |
|---|---|
| H002_OS_T-SHIRT_MOCKUPS | EAHajluNhMY |
| I002_OS_LONG-SLEEVE_MOCKUPS | EAHaj2-TYdw |
| J002_OS_SWEATSHIRT_MOCKUPS | EAHakT2zAEU |
| K002_OS_HOODIE_MOCKUPS | EAHakaUBK8w |

## Core hookup (11 Nov 2026, Barry: "connect Off The Shelf to Core")
Backup first: `001A_INTROVERT_HERE_CORE_BACKUP_2026-11-11_before_OTS.xlsx` (OneDrive, item 01R3POCZHEYTD2GZUMOBAJIT37CDZXYJR7).

Done: PRODUCT_RULES rows 14-17 (OFF THE SHELF), columns AS CANVA_PROJECT_CODE and AT CANVA_PRINT_PROJECT_CODE = the IDs above.

Done 11 Nov (Barry approved the photo choice and the Make changes):
- PRODUCT_RULES AU/AV VIDEO_SLOT1/2 = 9, 10 for all four garments (Etsy images 9 and 10 = SETUP_MAROON and PAYOFF_MAROON).
- MOCKUP_PAGES: 52 OFF THE SHELF rows, 13 per garment, POSITION = Canva page number: thumbnails Maroon/Forest Green/Dark Chocolate (1-3), Maroon gift, Maroon closeup/hanging/armchair, variants, Maroon setup + payoff (14, 15), Maroon folded (20), size guide, range, AGM. Etsy gets 13 pages + the Printify shot. Other colour pages are for the own shop.
- Make builder 7896436: Etsy photo rank now follows list order (module 58 rank uses 56.`__IMTINDEX__`; artwork-branch module 716 sorts by position and ranks by index), so any set of template pages works. Unchanged for IH/SH/PC (their lists are 1..N). HERO_COLOURS gains "OFF THE SHELF": "Maroon" (modules 700, 711).
- Make video 7696096: module 18 maps OS- product codes to OFF THE SHELF (was treated as IH). Background comes from `backgrounds/OS.jpg`.
- Rollback: Make keeps each scenario's version history; the pre-change blueprints were also saved in the session scratchpad (not committed: they contain a webhook secret).
- Not tested end to end (no OTS gag has wording yet). First real use of the new rank formula is the next IH build; a check is scheduled for 11 Nov 09:00.

Background (how it works):
- How the builder (Make 7896436) uses them: exports every page of the mockup template, uploads only the MOCKUP_PAGES positions, POSITION = Canva page number, Etsy rank = 1 for position 1, else position + 1 (one plain Printify shot always at rank 2). Every existing range lists pages 1..N with no gaps.
- Video (Make 7696096) reads Etsy image number VIDEO_SLOT (1-based) = the SERIOUS/SETUP and FUNNY/PAYOFF page position + 1.
- OTS templates have 25-26 pages; Etsy takes 20 photos, so at most 19 pages per listing. Choosing a spread (not 1..19) needs the builder to rank by list order instead of page number.
- Video background: already done. `backgrounds/OS.jpg` is in the repo (built by `brand-logos/video-backgrounds/build-off-the-shelf.py`); `render-once.js` picks `backgrounds/<code>.jpg` from the collection code Make sends (first 2 letters of the product code), so the OneDrive background URL is ignored when a repo file exists. Check the repo, not just OneDrive.
- Template notes: H002 T-shirt pages 22 and 23 are both OS_22_TS_FOLDED_DARK_CHOCOLATE (same photo); J002 sweatshirt PAYOFF pages have no GAG_TEXT box.
- GAGS OS-00001..OS-00012 are placeholders (no text/status), dated from 14 Nov 2026 weekly.
