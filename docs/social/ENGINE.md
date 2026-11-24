# Social engine: plan (11 Nov 2026)

Status: **plan only.** Update 24 Nov: Meet the Team is dropped, Hoodini is the mascot, and the site launch campaign comes first (`launch-campaign.md`).

Earlier status: Decisions from Barry on 11 Nov:
- Posting goes through **Postiz**. Approvals happen in the **Introvert Here approvals app**, not in Postiz or Canva.
- **3–4 posts a week**, on top of the automatic listing launch posts (Make scenario 7783647, left as it is).
- ~~Meet the Team leads the first month~~ (dropped 24 Nov).
- Plan first. Build after Barry has reviewed this.

Later decisions on 11 Nov:
- **Barry writes all the text** (image lines and captions). Agents only fit it to each platform (length, hashtags, alt text). The Writer role below is reduced to that.
- **Visuals come from prompts**, with as little involvement from Barry as possible. Barry is making clean reference shots of each character on 12 Nov (front full body on a plain background, three-quarter view, and in their usual setting with no text). Every image and clip is generated from those references so the characters stay consistent.
- **Animation:** moving stills for most posts (push-in, parallax from separated image layers, typing text), plus AI video clips (Canva `create-video`) where they're worth it. Barry is watching the Canva AI limit. (The Meet The Boss test clip is dropped. Any AI video test now uses Hoodini.)
- **Channels:** Instagram, Facebook, Threads, Pinterest, TikTok, YouTube Shorts, Bluesky to try. **No Reddit.** X and LinkedIn not for now.

## What it does

Each week the engine makes a pack of 3–4 finished posts: image, caption, platforms and time. Barry approves the pack in the approvals app. Approved posts go to Postiz and are published at their set times. Nothing is posted without Barry's OK (standing rule).

```
Planner ──► Writer ──► Art director (Canva) ──► Critic ──► 📣 Social page ──► Postiz ──► platforms
 calendar    captions    designs + exports       checks      Barry approves    schedules
                                                    ▲              │
                                                    └── redo notes ┘
```

## The agents

Agents are used only where judgement is needed. Repeated steps are scripts (standing rule: "scripts for repetitive work, agents for judgement").

| Role | Kind | Job | Reads | Writes |
|---|---|---|---|---|
| **Planner** | agent, weekly | Turns the 4-week calendar into next week's briefs. Rotates the characters and collections so none is left out. Avoids clashes with launch posts. | `calendar.md`, rotation log, launch posts due | `packs/<week>/briefs.json` |
| **Writer ("Brian")** | agent | Image text and captions in the right voice, plus 3–8 hashtags. Gives 3 options for each line and picks the best one. | `characters.md`, collection voices (below) | captions in the brief |
| **Art director** | agent with the Canva connector | Builds each post in Canva from the series template and the character art, then exports every size. | brand kit `kAHHlEC03pw`, series templates, `team/` art | Canva design + exported files |
| **Critic ("Keith")** | agent, separate from the art director | Checks each post against the checklist below. Sends weak ones back (2 tries at most), then passes it on marked "needs Barry's eye". | export, brief, checklist | pass/redo + reason |
| **Packer** | script | Bundles the pack and sends it to the approvals app. | pack folder | approvals app `/api/social-pack` |
| **Publisher** | worker code | On approval: uploads the media to Postiz and creates the scheduled post. Records the result. | approved item | Postiz post id, rotation log |

The Critic has to be a separate agent from the art director. A designer marking their own work passes too much.

### Collection voices (from `docs/agents/social.md`)
IH deadpan · SHHH. gentle, not jokey · PER CONTRACT office satire · OFF THE SHELF bookish escapism. Team posts use the house caption style: "Name. Job. Punchline."

## Approvals in the app (new 📣 Social page)

Built the same way as the existing pages (worker.js + KV `PENDING`):
- `POST /api/social-pack` (needs the ingest secret): saves the week's pack. Images go in KV, the same way listing videos already do.
- **📣 Social page:** one card per post, showing the image (swipe between sizes), caption (editable), platforms (tick boxes), date/time (editable), and buttons for **Approve**, **Redo** (with a note) and **Skip**. Plus **Approve all** for a pack Barry is happy with.
- **Approve:** the worker uploads the image to Postiz (`/public/v1/upload`), creates the post for the chosen platforms at the chosen time, and stores the Postiz post id. A phone notification (ntfy, already set up) confirms it.
- **Redo:** the note is saved. The next engine run rebuilds that post.
- **Posted / Failed:** the worker checks Postiz once a day using its existing daily run, and shows failures on the page.
- **Key:** the Postiz API key goes in the existing write-only key form (KV `SECRETS`), never in chat.

Why nothing goes to Postiz until approval: nothing exists outside the app until Barry says yes, and caption edits are easy to make before anything is sent.

## Look ("expensive")

Series template, set up once in Canva and then reused for every post:
- **Full-bleed cinematic still** of the character. Dark, moody, photoreal (the house style in `characters.md`).
- **Title card:** small caps series mark "THE TEAM · No. 03", the name large, and the job title underneath in a lighter weight. Brand kit fonts only.
- **One caption line** at most on the image. The rest goes in the post text. Lots of empty space; no badges, stickers, emoji or "SHOP NOW".
- Small Introvert Here mark in a corner. Fine grain and a slight vignette give it the same finish on every post.
- **Sizes:** 1080×1350 (Instagram/Facebook/Threads feed), 1080×1920 (stories, reels cover, TikTok), 1000×1500 (Pinterest).

**Art problem to solve first:** the eight team images have captions baked in, and there are no clean originals. My Canva tools can't run Magic Eraser or Magic Expand. Options:
1. Barry cleans the eight images once in Canva (about 2 minutes each).
2. I regenerate clean versions with Canva's image generation from the character sheets, then match them to the originals.
- Recommended: try option 2 on one character. Fall back to option 1 if it can't match the originals closely.

### Critic checklist
- Matches the character sheet (look, outfit, setting, colours).
- Text is legible on a phone at arm's length and not cut off in any size.
- Spelling, and a voice that fits the collection.
- No stock mockups and no generic Printify mockups (standing rule).
- Garments in shot are black/charcoal Introvert Here pieces. No mangled printed words on garments.
- Doesn't repeat a character or line used in the last 2 weeks (rotation log).

## Platforms

| Platform | Phase 1 (images) | Phase 2 (motion) |
|---|---|---|
| Instagram | feed 4:5 + story | Reels |
| Facebook Page | feed 4:5 | Reels |
| Threads | image + text | – |
| Pinterest | 2:3 pin → Etsy shop | video pins |
| TikTok | – (needs video) | 9:16, slow push-in on the still + caption reveal, via the repo renderer or Canva video. `DIRECT_POST` only |

YouTube Shorts and Bluesky are added too (see decisions above). No Reddit.

Default times: 19:30 UK on post days. These are settings, so they can be changed.

## Weekly run

1. **Thursday:** the engine runs. A session Barry starts, or a scheduled weekly task if the Canva connector works there (to be tested). Planner → Writer → Art director → Critic → Packer.
2. **Thursday evening:** the pack lands on 📣 Social with a phone notification.
3. **Barry approves** whenever suits him before the following Monday.
4. **Mon–Sun:** Postiz publishes. The daily check records what went out.
5. **Monthly:** a one-line performance note from Postiz analytics (what got saves/shares) goes into the next calendar.

## Build order (each step waits for Barry's OK)

1. Barry opens a Postiz account and connects Instagram, Facebook, Threads and Pinterest. He adds the Postiz API key through the app's key form.
2. Canva series template + one clean character image. Barry reviews the look.
3. Week 1 pack made by hand by the agents. Workshop it.
4. 📣 Social page + `/api/social-pack` + publisher in the approvals app (test with a Postiz draft first).
5. Packer script and the weekly run.
6. Phase 2: reels/TikTok.

## Open questions for Barry
1. **Postiz plan:** the hosted version is paid (a monthly fee). Recommended: hosted, because self-hosting means running a server. Needs your OK to spend.
2. **Which accounts:** are there Introvert Here accounts on Instagram, Facebook, Threads, Pinterest and TikTok already, and which should the engine post to? Recommended: the same accounts the launch posts use.
3. **Link while the own shop isn't live:** recommended: the Etsy shop in bio/pins, and no links in captions. The posts are for the brand, not for sales.
