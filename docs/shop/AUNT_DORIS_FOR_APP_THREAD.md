# For the app thread: Escape From Aunt Doris on Etsy

From the shop thread, 28 Nov 2026. Barry wants the app to handle this listing like the others where it can. Workshop
it with him; nothing has been listed yet.

## What it is

A printable escape room (a digital download, not clothing): **Escape From Aunt Doris**. 19 puzzles, about an hour,
one player. Aunt Doris (Gareth's mum, hug-obsessed) is a different character from the team's Doris (the knitting
T-rex in `characters.md`).

There are two editions:
- **On Barry's site** (introverthere.com/uk/escape-room/aunt-doris): played online, Part One free, £4.99 to unlock.
  Live and finished. Not your concern unless Barry says otherwise.
- **For Etsy: the screen-free edition.** A 37-page A4 PDF that works like a gamebook: shuffled numbered entries, an
  Answer index at the back sends you on or to Aunt Doris, a Doris meter to tick, hints upside down at the back. No
  website, app or phone needed, and **no web address anywhere** (Etsy doesn't allow sending buyers off Etsy).

## The files (kept out of this public repository)

- The PDF: made from the preview with `node shop/doris-print/make.mjs <preview base url> out.pdf paper`
  (page `/uk/escape-room/aunt-doris/paper`, preview only; `dzPaperDoc` in `shop/worker.js`). Barry has a copy.
- Listing pictures, in this order:
  1. Main: the booklet on a mahogany table (`brand-logos/escape-room-listing/aunt-doris-main.png`).
  2. Inside pages on the same table (`aunt-doris-pages.png`).
  3. How it works (graphic; Barry has `Aunt-Doris-etsy-how-it-works.jpg`, 37 pages, "No website · No app · No phone").
  4. "Introvert Here presents" + Aunt Doris title (graphic).
  5. The AGM picture (the plain IH version, e.g. IH-00001 T-shirt mockup page 16).
  6. Find Your Range (the plain IH version, e.g. IH-00001 T-shirt mockup page 18). Not the version with the Escape
     Room strip: that one's for the site and social media only.
- The main photo is made in ChatGPT from a reusable blank scene (`brand-logos/escape-room-listing/scene-blank.png`)
  plus the cover as one flat PNG; the prompt is in `brand-logos/escape-room-listing/README.md`. Future escape rooms
  reuse the same scene.

## Questions for you and Barry

1. **Making the listing.** The app's listings go through Printify, which can't do digital downloads. Is there a route
   for a digital listing (Etsy API with listing-create scope, a Make scenario), or does Barry list it by hand?
2. **Core.** Where does a digital product live: a new collection/product type (e.g. code `ER-00001`, type
   `DIGITAL` or `BOOKLET`), so sales, stats and the registry see it? It has no Printify product, sizes or colours.
   Future escape rooms (Escape From Christmas next) would follow the same pattern.
3. **Title, description, tags.** A draft is in `docs/shop/aunt-doris-etsy-listing.md` (updated for the screen-free
   edition). Suggested title: "Escape From Aunt Doris Printable Escape Room Game Screen Free Puzzle Book for
   Introverts Funny Solo Adult Gift PDF Download". Barry wants to workshop the wording with you.
4. **Price.** Barry thinks £5.99 may be too low. Etsy printable escape rooms mostly sell for about $5 to $15
   (roughly £4 to £12), with big kits up to $20 to $40. Remember UK buyers see the price plus 20% VAT.
5. **Social.** One Spot the Introvert painting goes out weekly; the listing could get a post too (social thread).

## Rules (Barry's standing ones)

- Nothing goes live on Etsy without Barry's OK. No spending.
- The repository is public: no secrets, and the PDF itself stays out of it.
- Don't change the site's game or `shop/worker.js` without telling the shop thread.
