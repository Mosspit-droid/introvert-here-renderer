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
