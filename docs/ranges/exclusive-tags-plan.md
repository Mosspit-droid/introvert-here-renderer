# Plan: tags for the EXCLUSIVE. (EX) topical range in the tag engine

Received 15 Nov 2026 from the EXCLUSIVE. workshop thread, via Barry. That thread must not touch the approvals app; the app side (and wiring it into the builder's create-now path) is done in the main app thread.

Status on 15 Nov: not started. EX doesn't exist in Core yet: no GAGS rows, PRODUCT_RULES rows or Etsy section, and no Canva templates confirmed. Start once the range itself is set up.

## How the 13 tag slots work for EX
- **Slots 1–5 (gag level):** same mechanism as now. Needs a new TAG_POOL pool for EX's gag category (e.g. TOPICAL): 1 anchor plus enough flavour phrases (e.g. topical humour, satire gift, news joke tee, current events, funny news shirt). Check POOL_CAPACITY against the planned 2–4 EX gags a month.
- **Slots 6–10 (product tags):** add PRODUCT_TAGS_FLAT rows for EXCLUSIVE. / T-SHIRT: graphic tee, news humour tee, satire tshirt, topical t shirt, introvert gift.
- **Slots 11–12:** TOPIC tags. These replace the seasonal pair for EX.
- **Slot 13 (stem):** unchanged (TITLE_STEM / STEM_TAG, 1–4 words, 20 characters max).

## Topic tags (slots 11–12)
- Barry types two topic tags on the create-now screen. They're stored in GAGS CUSTOM_TAG_12 and CUSTOM_TAG_13.
- For COLLECTION = EXCLUSIVE., the engine accepts them as typed instead of requiring a SEASON_POOL match. They're still checked:
  - 20 characters max
  - letters, numbers and spaces; ' and - only inside words
  - no duplicate of another slot (ignoring case)
- If a topic tag is blank or invalid, it falls back to the FALLBACK pool and shows an amber note.
- **Trademark guard:** a new TAG_BLOCKLIST table of brand, event, show and celebrity names that are strictly enforced (eurovision, olympics, fifa, world cup, wimbledon, love island, strictly, disney, marvel, big pop stars and so on).
  - A topic tag, stem or title containing a blocked word is refused with "Trademark: use a generic phrase instead".
  - A warning on capitalised names would be a nice extra.
- Topic tags are left out of the overlap score and TagCap.

## Freezing
- EX can't wait for the 08:00 freeze. When Barry approves a create-now gag, freeze its tag set straight away (the same logic as make/freeze.js, for that one gag), then build.
- The final 13-tag check in Make before Printify and Etsy stays as it is.

## After 6 weeks
- If the listing switched off: nothing to do.
- If it sold and stays live: swap slots 11–12 for seasonal or fallback phrases through the existing seasonal refresh (make/season_refresh.js), and update LISTING_TAGS.
- If the gag is promoted to a permanent range: it gets that range's normal tags.

## Approvals app
- **Create-now screen:**
  - two Topic tag fields, each with a live character count and checks
  - blocklist errors shown inline
  - a preview of all 13 tags before the approve tap
- **Settings:** edit the TOPICAL pool and the blocklist.

## Done when
- A dry-run EX build shows 5 gag + 5 product + 2 topic + stem tags, all valid and unique.
- A blocked word is refused.
- A blank topic falls back, with a note.
- The tag set freezes on approval without waiting for 08:00.
- A sold EX listing gets its topic tags swapped at the 6-week check.
