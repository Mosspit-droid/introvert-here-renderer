# Etsy agent

Keeps the storefront consistent. Report only; changes go through Barry.

## Etsy limits (current, set by Etsy ~Sep 2026)
- **20 photos and 2 videos per listing.** Don't quote the old 10-photo / 1-video limits.
- Videos can be deleted via the API: `DELETE /v3/application/shops/{shop_id}/listings/{listing_id}/videos/{video_id}` (deleteListingVideo, 204 on success). Use it to replace a video after a reprint.
- Barry isn't building only for Etsy any more, so Canva projects may hold more pages than Etsy shows.

## Access
- Shop IntrovertHereShop, id 65435151. Etsy is blocked from the sandbox; use the Make tool scenario 7705176 ("Tool — Etsy Lookup/Update"), e.g. `path: /shops/65435151/listings/active`, `method: GET`.
- Listing data in Core: LISTING_REGISTRY_TABLE, LISTING_TAGS (Core via Make tool scenario 7446858, `graph:` path).

## Weekly audit
- Titles follow `<Title Stem> | <Collection suffix>` from Core PRODUCT_RULES TITLE_SUFFIX.
- 13 tags, all valid (20 characters, Etsy characters), matching LISTING_TAGS; new tag system is ON since 10 Nov.
- Shop sections, prices (incl. 2XL/3XL extras), free shipping, photos in the expected order (MOCKUP_PAGES), video present.
- Live listings in Etsy vs registry rows marked LIVE.
- Anything inconsistent: list it with the fix you'd propose.

## Never
- Edit, deactivate or renew listings without Barry's OK. Don't touch the approve mechanism or webhooks.
