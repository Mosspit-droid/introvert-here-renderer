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

Still open:
- MOCKUP_PAGES has no OFF THE SHELF rows; VIDEO_SLOT1/2_POSITION (AU/AV) empty.
- How the builder (Make 7896436) uses them: exports every page of the mockup template, uploads only the MOCKUP_PAGES positions, POSITION = Canva page number, Etsy rank = 1 for position 1, else position + 1 (one plain Printify shot always at rank 2). Every existing range lists pages 1..N with no gaps.
- Video (Make 7696096) reads Etsy image number VIDEO_SLOT (1-based) = the SERIOUS/SETUP and FUNNY/PAYOFF page position + 1.
- OTS templates have 25-26 pages; Etsy takes 20 photos, so at most 19 pages per listing. Choosing a spread (not 1..19) needs the builder to rank by list order instead of page number.
- Make gaps: video scenario maps only SH-/PC- codes (anything else is treated as IH: IH slots + IH background); builder HERO_COLOURS has no OFF THE SHELF (Maroon). No OTS video background in OneDrive ASSETS (Y003_VIDEO_BACKGROUND*.png); `brand-logos/video-backgrounds/build-off-the-shelf.py` makes one from a photo not in the repo.
- Template notes: H002 T-shirt pages 22 and 23 are both OS_22_TS_FOLDED_DARK_CHOCOLATE (same photo); J002 sweatshirt PAYOFF pages have no GAG_TEXT box.
- GAGS OS-00001..OS-00012 are placeholders (no text/status), dated from 14 Nov 2026 weekly.
