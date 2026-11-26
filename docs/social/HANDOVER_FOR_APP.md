# Social thread → app thread handover (26 Nov 2026)

From the social media thread (branch `ccr-9ff76dc6-xbuj66`, draft PR #1). Barry wants everything social to end up in
his Introvert Here app, the approvals app (`approvals-app/worker.js`). Full detail is in `docs/social/launch-campaign.md`.
The original engine plan is in `docs/social/ENGINE.md`, and the plan Barry reads is the Claude Doc "Introvert Here social media plan".

## What exists now (all live accounts, all Barry's)

| Thing | State | Details |
| --- | --- | --- |
| 7 social channels | Set up 25 Nov, all with Hoodini avatar and bio "Everything you need to be left the hell alone." | Instagram, Facebook Page, Pinterest, Threads, TikTok (`introverthere.shop`), YouTube (`@introverthereshop`, on introverthereshop@gmail.com), Bluesky (`introverthereshop.bsky.social`) |
| Postiz | Connected to Claude as a claude.ai connector (OAuth, no API key); free trial | Channel ids are in `launch-campaign.md` under "Postiz". Claude schedules posts there after Barry approves |
| Etsy Ads | Running since 25 Nov at US$1/day; review around 25 Dec | Offsite Ads opted out (fee would exceed the ~£4 margin) |
| MailerLite | Account "Introvert Here" (Google login introverthereshop@gmail.com); 14-day trial, then free (250 subscribers) | Group "Newsletter"; embedded form "Noticeboard signup", double opt-in. Share URL https://preview.mailerlite.io/forms/2825119/205147270196233966/share |
| fal.ai | Pay-as-you-go AI video (~$0.35 a clip); key saved on the Claude environment | About $7 of Barry's $10 left |
| Content made | In `social/launch/` | Door teaser; "Meet Hoodini" short (Canva doorbell clip + split line + umbrella end card); umbrella end card (reusable, `out/endcard-final.mp4`); excuse card design (`social/launch/mock/excusecard2.html`); profile images in `social/profiles/` |

## Decisions Barry made

- Goal: steady sales. Barry approves **one weekly batch**. Nothing is posted without his OK.
- **Hoodini** is the mascot (Meet the Team dropped). **Never signpost the Hoodini hunt.**
- Weekly mix: 1 Hoodini short (AI, 2 tries max), "This week's excuse" (from Barry's 100 excuses in the repo), gag typewriter reels (existing renderer, **without** the product photos at the end), Spot the Introvert.
- Main channels: TikTok, Instagram, Pinterest. The other four get copies.
- Turn **off** the automatic listing videos to Instagram/Facebook (Make 7783647), but **Exclusives keep posting immediately**, and should also go to TikTok/Threads/Bluesky/YouTube via Postiz the moment they're approved. Not done yet: needs Barry's OK and a Make change.
- Newsletter: first look at each Exclusive + 5% off for joining; monthly; drafted by Claude, approved by Barry.

## What the app could add (for Barry and the app thread to decide)

1. **📣 Social page:** the weekly batch: each post's video/image, caption, channels and time, with Approve / Change / Drop. On approve, it schedules through Postiz. Design notes in `docs/social/ENGINE.md` ("Approvals in the app").
2. **Stats:** weekly numbers per channel (Postiz analytics), Etsy Ads spend/clicks/orders, and newsletter subscribers. One line each.
3. **Exclusive → everywhere:** when an Exclusive is approved, also send it to Postiz for the other channels.
4. **Newsletter:** subscriber count; the monthly draft to approve.

## Waiting on other threads / Barry

- **Site thread:** embed the MailerLite form on the Escape Room Newsletter noticeboard; change the privacy page (it currently promises no marketing emails); create a 5% Stripe promo code for new subscribers.
- **Business postal address** (being sorted in another thread): needed for the site's legal pages and the newsletter footer.
- **Launch day and time** (aiming Saturday 28 Nov; 12:00 and 19:30 don't suit Barry).
- On launch day, switch all channel links to introverthere.com. TikTok display name can change to "Introvert Here" from 2 Dec.

## Working with Barry

- One step at a time, short messages, screenshots welcome. He gets overwhelmed by long lists.
- Don't suggest wrapping up unless he says so.
