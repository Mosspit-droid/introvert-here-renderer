# 📣 Social page in the app: how the social thread sends the weekly batch (27 Nov 2026)

From the app thread. The page is live at https://mosspit-approvals.mosspit.workers.dev/social (More → Social).
Barry sees one card per post (media, caption, channel ticks, UK time) and taps **Approve**, **Change** (with a note) or
**Drop**, or **Approve all**. Approve uploads the media to Postiz and schedules it on the ticked channels. Nothing
reaches Postiz before he approves. Tested end to end on 27 Nov (far-future Bluesky post with a picture, scheduled then
cancelled; nothing left in Postiz).

**Please stop scheduling straight into Postiz from chat** once the launch-week posts are done: send the batch to the
page instead, so Barry approves in one place.

## Sending a batch (two steps, using the Cloudflare API the session already has)

1. **Media** → R2 bucket `introvert-here-shop-photos`, key `social/<name>` (letters, digits, `.`, `_`, `-`; ending
   .mp4/.mov/.webm/.jpg/.png/.gif). Served publicly at `https://mosspit-approvals.mosspit.workers.dev/sm/<name>`, which
   is where Postiz fetches it. Use a new name for a new version (Postiz uploads are cached by name).
2. **Posts** → KV namespace `1c5342ad32504af1abd1da52c342f3ce`, key `social-pack`. Read it first and merge: keep every
   existing post whose `status` is `scheduled` or `posted`, and replace or add the rest. (Or, with the ingest secret,
   `POST /api/social-pack` does the merge for you; media via `POST /api/social-media?name=<name>` with the raw file.)

```json
{ "week": "Week of 30 Nov",
  "posts": [ {
    "id": "2026-12-01-excuse",            // unique, letters/digits/-/_
    "title": "This week's excuse",         // card heading; also TikTok title / Facebook video title
    "caption": "…",                        // one caption; trimmed automatically for Bluesky (300), Threads/Pinterest (500)
    "platforms": ["tiktok","instagram","pinterest","facebook","youtube","threads","bluesky"],
    "at": "2026-12-01T19:30:00.000Z",      // ISO (the API endpoint also accepts UK "2026-12-01T19:30")
    "media": ["excuse-0112.mp4"],          // or pictures (Bluesky max 4)
    "cover": "excuse-0112.jpg",            // needed for Pinterest videos; also YouTube thumbnail
    "link": "https://introverthere.com/…", // Pinterest link
    "ytTitle": "", "pinTitle": "",         // optional
    "ai": false,                           // true for AI clips (sets made_with_ai where the channel has it)
    "notes": "",                           // shown to Barry on the card
    "status": "pending" } ] }
```

Channel rules the page enforces (the tick is greyed out otherwise): TikTok, Instagram and Pinterest need media;
YouTube needs a video; a Pinterest video needs `cover`. Instagram posts as a normal post (a video becomes a Reel).
TikTok posts directly (public, comments on, no duet/stitch).

## Reading Barry's answers

Same KV key. `status` per post: `pending` (waiting), `scheduled` (in Postiz; `pz` holds the Postiz post ids),
`posted`, `failed` (`error` says why), `change` (`note` holds what he wants changed: rebuild it with a new id or the
same id and `status: "pending"`), `dropped`, `cancelled`. The app checks Postiz every 3 hours for posted/failed.
