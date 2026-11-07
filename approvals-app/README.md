# Mosspit approvals app

The small web page Barry uses to review and approve rendered product videos.

- Live at: https://mosspit-approvals.mosspit.workers.dev (Cloudflare Workers, free plan)
- Code: `worker.js` (the whole app, server and page). Config: `wrangler.toml`.
- Storage: Cloudflare KV namespace `mosspit-approvals` (bound as `PENDING`).

## Settings (secrets, set in Cloudflare - never stored here)

| Name | What it is |
|---|---|
| `APP_PASSWORD` | Password for the page |
| `INGEST_SECRET` | Code Make sends in the `X-Ingest-Secret` header |
| `MAKE_ACTION_HOOK` | Webhook of the Make scenario "Introvert Here: Approvals App - Reject / Make New Video" |
| `NTFY_TOPIC` | ntfy topic for phone notifications |
| `MAKE_GAG_HOOK` | Webhook of "Approvals App - Save Gag" |
| `MAKE_GAGSYNC_HOOK` | Webhook of "Approvals App - Gags Sync" |

## Make scenarios that talk to it

- **Finish Listing After Video Render**: last module posts each render (with the video file and caption) to `/api/pending`.
- **Approve Listing (Go Live + Post to Social)**: reports success or the failing step to `/api/result` (authenticated by the item's approval code).
- **Detect Live Listing, Start Video Render**: "waiting on mockups" warnings go to `/api/alert`.
- **Approvals App - Reject / Make New Video**: called by the page's Reject / Make new video buttons. It re-reads the Core row and checks the product (and, for Reject, the approval code) before changing anything.

- **Approvals App - Gags Sync**: reads GAGS, GAG_CATEGORIES, LISTS and LISTING_REGISTRY and posts a summary to `/api/gags-sync` (code: `make-gags-sync-code.js`). Runs on the Gags page's Refresh button and after every save.
- **Approvals App - Save Gag**: receives a gag from the `/gags` page, re-reads GAGS to check the target row is still empty (or still unbuilt, for edits), then writes columns B-L of that row (A and M untouched) or adds a new row at the bottom, and reports to `/api/gag-result` (code: `make-save-gag-code.js`).
- **Approvals App - Daily Checks**: 09:15 daily; expiring connections, failed/stuck runs, coming-up releases (code: `make-daily-checks-code.js`).

The Approve button is a plain link to the existing approve webhook - unchanged.

## Redeploying

    npx wrangler@4 deploy   # from this folder, with a Cloudflare API token
