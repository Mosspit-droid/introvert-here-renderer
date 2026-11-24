# Social agent (Canva + socials), proposed 10 Nov 2026

Plans and prepares social content beyond the automatic launch posts. Needs the Canva connector, so the Canva part runs in sessions Barry starts; planning and captions can run anywhere.

## Already automatic (don't duplicate)
When Barry approves a listing, Make scenario 7783647 publishes it on Etsy and posts the listing video as a Pinterest pin, Instagram reel and Facebook reel, then sets SOCIAL_STATUS = POSTED in Core. Make is at its 16-scenario limit, so new posting automations need a free slot or another route.

## Engine plan (11 Nov)
Full plan: `docs/social/ENGINE.md`; site launch: `docs/social/launch-campaign.md`. Barry decided: post through **Postiz**, approve in the approvals app (new 📣 Social page), 3–4 posts a week.

## Platforms
All of them (Barry, 10 Nov): Instagram, Facebook, Pinterest, TikTok, Threads, and others as useful. Posting route (decided 11 Nov): Postiz, after approval in the approvals app. Canva Content Planner was ruled out because Claude can't trigger it and it posts one item at a time.

## Jobs
1. **Content calendar** (`docs/social/calendar.md`): a rolling 4-week plan mixing launch posts (automatic), range promos (one per collection, in its look: concrete / wood / navy fabric / red leather), seasonal (Christmas gifting, Introvert Day 2 Jan, Black Friday), the Tag Checker tool, meet-the-team characters, and behind-the-scenes. Rotate collections so none is neglected.
2. **Posts in Canva:** build from Barry's brand templates (autofill gag text, collection logo, range background). Barry's own imagery only; no stock mockups. Square 1080x1080 and vertical 1080x1920 versions.
3. **Captions:** plain, dry, on-brand. IH: deadpan; SHHH.: gentle, not jokey; PER CONTRACT: office satire; OFF THE SHELF: bookish escapism. Short, with 3-8 relevant hashtags, and a link to the listing or shop.
4. ~~**Meet-the-team characters:**~~ Dropped 24 Nov: those were an Etsy About-page joke. **Hoodini is the mascot.** keep a character sheet per character (name, look, outfit, colours, personality, catchphrase) in `docs/social/characters.md`, so every image stays consistent across ChatGPT, Canva and anything else.
5. **Rotation tracker:** what's been posted where and when, so designs and collections get even exposure (the deferred "social-content rotation tracker").

## Approval
Everything is prepared as a pack (image/video + caption + where and when) and waits for Barry's OK. Posting is manual or via the existing automation until a posting route is agreed (options: free a Make slot; a scheduling service such as Postiz, which needs its own account).

## Never
- Post anything without Barry's approval. Use generic stock mockups. Reply to or message anyone on Barry's behalf.
