# Mosspit Tag Checker for Etsy: hosting

Live at https://tag-checker.mosspit.workers.dev (Cloudflare Worker "tag-checker").
The old address https://phrase-planner.mosspit.workers.dev forwards there (worker "phrase-planner", see old-address-redirect/).

- The worker serves `tools/phrase-field-planner.html` and keeps an anonymous daily visit count
  (date, referring site, country, phone or computer; no cookies or IP addresses) in KV key `planner-stats`.
- The approvals app shows those numbers on its Stats page ("Tag checker (free tool)").
- To publish a change: run `python3 build.py` (rebuilds worker.js from the HTML; adjust the paths at the top), then `wrangler deploy` in this folder.
