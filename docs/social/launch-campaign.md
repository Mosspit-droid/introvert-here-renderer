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
- **End card brief (Barry, 24 Nov, final):** (1) Hoodini standing in view, as in the first end card; (2) a spotlight switches on with a click (not there from the start); (3) Hoodini shuffles backwards out of sight; the light stays where it is. The logo and introverthere.com go below. Barry rejected the cut-out walk/shuffle animations ("awful"). **Next attempt: animate the end card with Flora** (real video models, Hoodini as the reference image). Barry has registered with Flora. The connector still needs adding at claude.ai/customize/connectors (URL from Flora's docs, docs.flora.ai/more/mcp, which lists https://mcp.flora.ai/mcp), then a new session. The click sound and text overlay stay in the renderer (`social/launch/out/click.wav` is made with ffmpeg; see the commit history).
- **Reusable end card made in Canva (24 Nov):** Canva asset VAHb3Us6cdY, 6 s. Hoodini stands in dim light, the spotlight clunks on (Canva generated the sound), he shuffles backwards out of frame left, and the light stays on the empty spot. Finished version with the logo and introverthere.com (`social/launch/brandcard.html` overlay, fades in at 4.4 s, last frame held 1.4 s): `social/launch/out/endcard-final.mp4`, 7.45 s. **Rejected by Barry:** off-model. Canva drew a taller figure with a chin, mouth and neck under the hood, not stubby Hoodini (nose only). The doorbell clip stayed on-model because his sitting pose hides his body. Fix: a retry with a tighter brief (head reference, exact proportions, face as a black void except the nose), only with Barry's OK. Note: every final export must be `-pix_fmt yuv420p` (an xfade/overlay chain otherwise gives 4:4:4, which phones can't play). Flora is also connected now (`mcp__Flora__*`). Barry chose not to pay for it yet; use Canva unless Barry says otherwise.
- **AI video budget (24 Nov):** Canva's AI allowance covers about 2 videos a month. It was used up on 24 Nov and resets on **19 Dec**. Flora's free plan refuses video. Flora Starter ($16.20 a month, billed quarterly at $48.60) gives $18 of usage a month: about 35 MiniMax H3 Max image-to-video clips at roughly $0.48 per 6 s, or about 13 Kling v4 clips at roughly $1.30. Paying is Barry's call.
- **Meet Hoodini, current version:** the doorbell clip plus the **plain end card** (`social/launch/plaincard.html`): Barry's full-size Hoodini standing, the logo, introverthere.com. Costs nothing and is ready now. The spotlight end card waits until there's video budget (Canva after 19 Dec, or Flora Starter).
- **End card v2 (fal.ai, 24 Nov), on-model:** Seedance v1 Pro image-to-video on fal (`fal-ai/bytedance/seedance/v1/pro/image-to-video`, 720p, 6 s). Trick: video models walk forwards, not backwards, so the clip shows Hoodini walking **in** from the left facing right into the spotlight, which then switches off. It uses a start frame (`spotframe.html?x=-130`) and an end frame (`firstframe.html`) built from Barry's drawing, and is played **reversed**. The editing cuts out the light sliding in (dim 0–0.7 s held to 1.3 s, then a hard cut to 2.4 s with `click.wav`), adds a left-edge shadow so he vanishes completely, and puts the logo and URL on at 4.6 s. Output: `social/launch/out/endcard-final.mp4` (6.55 s). fal key saved on the Default environment (queue.fal.run); results download from v3.fal.media / v3b.fal.media (allowed). An earlier forward attempt had him turn and walk off forwards.
- **End card v3 (composited, 24 Nov), the method that works:** the AI animates **only Hoodini on plain green** (fal Seedance v1 Pro, start frame `out/start-green.png`: Barry's drawing small at the back left; he walks diagonally forward-right, side view, real steps). The clip is reversed, keyed and composited onto a stage I control (`stage2.html`: light off / on without beam / beam-only / logo layers). Order: dim 0–1.2 s, then `click.wav` and the spotlight snaps on and stays put. He holds, then backs away diagonally (1.25× speed); his brightness follows his distance from the light pool; the beam is layered in front once he's behind it; he fades into the dark; the logo goes on top. The script is in the session history (Python + numpy). Output `out/endcard-final.mp4`. Lessons: never force an end frame (he slides); never ask him to face camera (the model invents a face); check feet frame by frame before showing Barry.
- **End card FINAL (Barry: "as good as we're going to get", 25 Nov):** made with `social/launch/endcard_compose.py` from `out/green-side.mp4`, a fal Seedance clip of Hoodini walking straight across in side profile on green, interpolated to 60 fps (`out/gs60`) and reversed. Sequence: Barry's standing drawing dimly lit on black, then a click and the spotlight snaps on; he holds, then blends into a slow backward walk facing right, with his head anchored so it glides on a straight slightly rising line. Pitch black outside the beam: he vanishes at its edge. The stage is shifted so the beam is centred. After his exit, the logo fades in (+0.35 s), then introverthere.com (+1.15 s), both larger at the bottom (`social/launch/endtitle.html`). Output `out/endcard-final.mp4` (7.4 s). Encode with fixed lengths (`-loop 1 -t`), otherwise ffmpeg hangs.
- **Umbrella end card (Barry's concept, 25 Nov), replaces the walk-off:** Hoodini dim in the dark; click, spotlight; he looks up, pulls a navy umbrella from his hoodie pocket and pops it open (fal Seedance clip on green, `out/umbrella-green.mp4`, start frame `out/start-umbrella.png`); everything under the canopy drops into total shadow (below the line joining the canopy tips); pitch black outside the beam; logo then introverthere.com fade in inside the shadow. Script `social/launch/umbrella_compose.py`, stage `stage4.html`, titles `endtitle-umb.html`, sounds `click.wav` and `fwump.wav` (ffmpeg-made). Output `out/endcard-final.mp4` (8.9 s). The walk-off version is kept as a fallback.
- **APPROVED END CARD (Barry, 25 Nov: "Works for me"):** umbrella v2, made with `social/launch/umbrella2_compose.py` (stage `stage5.html`, titles `endtitle-umb.html`). The shadow follows the canopy's underside (a smooth curve fitted through the clean columns, so it never cuts into the canopy) and sweeps in from the right with the umbrella's left edge. The umbrella is levelled on every frame once overhead. The beam is narrower than the canopy, so only its top is lit; everything below is black; the logo then introverthere.com fade in inside the shadow. Output `social/launch/out/endcard-final.mp4` (8.9 s), joined to Meet Hoodini in `out/meet-hoodini-short.mp4` (19.2 s). Reuse this end card on every Hoodini short. fal spend for the end-card work: about $2.45 of Barry's $10.
- Flora's own agent can also publish to TikTok, Pinterest and Meta. That's a possible alternative to Postiz; compare before paying for both.
- Each new AI clip needs Barry's OK, because it uses the Canva AI allowance.

## Postiz (set up 25 Nov)
Connected to Claude as a claude.ai connector (`mcp__Postiz__*`, sign-in, no API key). Channels and Postiz ids:
- TikTok (business) introverthere.shop `cmwvyz7e30p73qd07a6hhawkr`
- Instagram Introvert Here `cmwvvxzek0nu0qd07bkxjfxsn`
- Facebook Page Introvert Here `cmwvw4ft40nrvpj07pe8pc2rb`
- Pinterest introverthereshop `cmwvvzbiu0nuaqd07hl0hqkxa`
- Threads introverthere.shop `cmwvx4iz60og1qd0755ntk11j`
- YouTube Introvert Here (@introverthereshop, on introverthereshop@gmail.com) `cmwvzpo9p0o5go307sej7ky97`
- Bluesky introverthereshop.bsky.social `cmww075070pt5qd07tw588omf`
Postiz is on a free trial: check the end date and price. **Barry gets overwhelmed by long setup lists: one step at a time.** Nothing is posted without his OK.

## Paid test (25 Nov)
- **Etsy Ads on, 25 Nov:** all listings advertised, budget meant to be US$1/day (Barry to confirm it isn't the US$5 default). Leave alone for 30 days; review around 25 Dec: views, clicks, orders. That's the honest test of whether people want the products.
- **Offsite Ads opted out, 25 Nov:** the ~15% fee would exceed the ~£4 margin per sale. (Etsy says Google Shopping placement stays free.)
- Barry is disillusioned after 8 months with little traffic. Keep scope tight: no new jobs until the test gives evidence.

## Rules
- No preview link before 30 Nov. Teasers carry no link.
- **Never signpost the Hoodini hunt** (Barry, 24 Nov): no hints that he's hiding on the site, no "seven times", nothing. People find him for themselves. It's more rewarding, and it may get people talking online.
- The gag launch posts from Make (Etsy video to Instagram, Facebook and Pinterest) carry on as they are. Pointing them at the site instead of Etsy is Barry's call, later.

## Barry's steps
1. **Postiz:** open an account, and connect Instagram, the Facebook Page, Threads, Pinterest, TikTok and Bluesky. This is a paid service (monthly fee), so it needs Barry's OK to spend.
2. **Postiz API key:** Postiz settings → Public API → copy the key. Claude then shows a secure form to paste it into. Never paste it in chat.
3. **After launch:** add the product feed in Pinterest (catalogue) and Meta Commerce Manager, with Claude guiding each step.
