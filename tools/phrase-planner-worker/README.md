# Phrase Field Planner hosting

Live at https://phrase-planner.mosspit.workers.dev (Cloudflare Worker "phrase-planner").

- The worker serves `tools/phrase-field-planner.html` and keeps an anonymous daily visit count
  (date, referring site, country, phone or computer; no cookies or IP addresses) in KV key `planner-stats`.
- The approvals app shows those numbers on its Stats page ("Phrase planner (free tool)").
- To publish a change: run `python3 build.py` (rebuilds worker.js from the HTML; adjust the paths at the top), then `wrangler deploy` here.
