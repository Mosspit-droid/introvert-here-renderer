# Phrase Field Planner hosting

Live at https://phrase-planner.mosspit.workers.dev (Cloudflare Worker "phrase-planner").

To publish a change to `tools/phrase-field-planner.html`: regenerate `worker.js` from the HTML
(it embeds the page as one string) and run `wrangler deploy` in this folder.
