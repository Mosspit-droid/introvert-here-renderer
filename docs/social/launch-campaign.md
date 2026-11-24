# Site launch campaign (planned 24 Nov 2026 with Barry)

Based on `docs/social/site-launch-brief.md` (branch ccr-2e2fbc93-uwhyvw). The site goes live **Mon 30 Nov**.
**Nothing is posted without Barry's OK.**

## Decisions (24 Nov)
- **Posting:** Postiz, set up now. Barry opens the account and connects the platforms. For launch week, each post is shown to Barry as a preview here in chat; once he says OK, Claude schedules it in Postiz. The 📣 Social page in the approvals app (`ENGINE.md`) comes in December and replaces the chat step.
- **Text:** the brief's lines are drafts. The rest is drafted in Hoodini's reluctant voice. Barry rewrites anything before approving.
- **Platforms:** Instagram (feed, stories, reels), Facebook, Pinterest, TikTok, Threads, Bluesky.
- **Extras:** Christmas deadline reminders; ongoing series after launch week; launch video recorded automatically from the live site.
- **No Black Friday post.**
- **Meet the Team is dropped** (Barry, 24 Nov): those images were a joke for the Etsy About page. **Hoodini is the company mascot** and the face of the socials from now on.
- **Launch post: Mon 30 Nov at 19:30, not 12:00.** Barry is at work during the day. The launch video is recorded on Sunday 29 Nov from the finished site and approved that evening. On Monday morning, once the site is live, a quick check confirms nothing has changed, and then Postiz posts it at 19:30.

## How it's automated
1. Each post type is a builder page in `social/launch/` (site palette, Hoodini cut-outs, Montserrat). It renders 4:5, 9:16 and 2:3 stills plus a short vertical video. No Canva AI credits used.
2. Series content comes straight from the site: the 40 excuses, the 10 Spot the Introvert paintings, and products from `google-products.xml`.
3. Launch video: on Sun 29 Nov, Playwright records the finished site (gate → room → Excuse Generator), and Hoodini walks across at the end. Barry approves it that evening. It's scheduled for Mon 19:30, after a quick morning check that the live site matches. The footage shows the site only, never the preview address.
4. Claude shows each post as a preview. Barry says OK. Claude schedules it in Postiz for every platform it suits.
5. After launch: the product feed is added as a catalogue in Pinterest and in Meta Commerce Manager. Claude walks Barry through it step by step.

## Calendar

Times are 19:30 UK unless noted. "Video" = 9:16 for Reels, TikTok and Stories. "Still" = 4:5 for the feed, Threads and Bluesky, and 2:3 for Pinterest.

| Date | Post | Format | Link |
|---|---|---|---|
| Thu 26 Nov | **Teaser 1:** Hoodini's nose round a lit doorway. "Something's coming. Please don't make a fuss." (**built**, `01-teaser-door.html`) | still + 7 s video | none |
| Sat 28 Nov | **Teaser 2:** the warning gate. "We built a room to get away from people. You're not invited. Fine. Monday." | still + video | none |
| Mon 30 Nov (19:30) | **Launch:** "It's live. Please don't visit." Site recording plus Hoodini walk-on | video + still | introverthere.com |
| Tue 1 Dec | **Excuse Generator:** three excuses as a carousel (Barry picks the three). "Get yours." | carousel + video | /uk/escape-room/… |
| Wed 2 Dec | **Gift guide:** order by 12 Dec (long sleeves by 5 Dec) | still/carousel from the product feed | /uk/gifts |
| Thu 3 Dec | **Aunt Doris:** the hug picture. "She's at every party. Can you escape?" Plus a story: long sleeves by Saturday | still + story | Aunt Doris page |
| Sat 5 Dec | Story only: last day for long sleeves (the Hoodini hunt post is dropped; see Rules) | story | /uk/gifts |
| Mon 7 Dec | **Spot the Introvert #1:** one painting, answer the next day in the comments and stories | still | Spot the Introvert |
| Wed 9 Dec | **Christmas:** three days left to order | still | /uk/gifts |
| Fri 11 Dec | **Christmas:** last orders tomorrow | still + story | /uk/gifts |
| Sat 12 Dec | Story only: last orders today | story | /uk/gifts |
| Mid-Dec | **Escape From Christmas**, if it's ready | tbc | tbc |

From 14 Dec, two series posts a week: **Spot the Introvert** (Mondays) and **Excuse of the week** (Thursdays), plus **Vote on the next gag** now and then.

## Hoodini, the mascot (ongoing ideas)
Cut-outs: stand, walk, peek, sit, wave, head, silhouette (`brand-logos/mascot/`). Ideas to develop after launch week:
- **Hoodini vs the world:** short, relatable introvert moments (the doorbell, the office party, "quick call?"), each a still plus a short animation built from the cut-outs.
- **Reluctant announcements:** Hoodini fronting every launch or offer, as if he'd rather not.
- **Seasonal:** Christmas parties, New Year, Introvert Day (2 Jan).
- **Animation:** moving cut-outs now (free). Later, Canva AI video using the cut-outs as the reference, if a test clip is worth the AI allowance. A flat cartoon stays more consistent than the old photoreal team images.

## Short-form video (tested 24 Nov)
- **Canva AI video works for Hoodini.** Test "The doorbell" (10 s, 9:16, 720p; Canva asset VAHb3JudKAQ). Barry: "looks fantastic". References uploaded to Canva: Hoodini sitting `MAHb3KrV8G8`, standing `MAHb3MYPIM8` (cut-outs scaled up 4× on a cream background).
- How it was made: `create-video`, guide `generic`, Hoodini as the presenter reference, the stand pose as a detail reference. The room was described in words. Ambience only (chime, rustle, lamp click), no music, and no lettering.
- **Finishing step:** download the clip, then add Barry's line, the logo and an end card in the renderer. Needs `media.canva.com` (added to the environment's allowed hosts on 24 Nov). The first download attempt was blocked by the session's permission check, so Barry needs to allow it.
- **First short: "Meet Hoodini"** (Hoodini's first appearance). Line from Barry: "Meet Hoodini. He'd rather you didn't." Claude's suggestion: split it, with "Meet Hoodini." over the opening as the hook and "He'd rather you didn't." when the lamp goes off. **Barry chose the split version.** End card (`social/launch/endcard.html`): a spotlight snaps on, Hoodini stands lit, then shuffles back out of the beam into the dark. The light stays on the empty spot, then the logo and introverthere.com appear. Post it the week after launch, as the first "Hoodini vs the world". The caption must not mention the hunt.
- Each new AI clip needs Barry's OK, because it uses the Canva AI allowance.

## Rules
- No preview link before 30 Nov. Teasers carry no link.
- **Never signpost the Hoodini hunt** (Barry, 24 Nov): no hints that he's hiding on the site, no "seven times", nothing. People find him for themselves. It's more rewarding, and it may get people talking online.
- The gag launch posts from Make (Etsy video to Instagram, Facebook and Pinterest) carry on as they are. Pointing them at the site instead of Etsy is Barry's call, later.

## Barry's steps
1. **Postiz:** open an account, and connect Instagram, the Facebook Page, Threads, Pinterest, TikTok and Bluesky. This is a paid service (monthly fee), so it needs Barry's OK to spend.
2. **Postiz API key:** Postiz settings → Public API → copy the key. Claude then shows a secure form to paste it into. Never paste it in chat.
3. **After launch:** add the product feed in Pinterest (catalogue) and Meta Commerce Manager, with Claude guiding each step.
