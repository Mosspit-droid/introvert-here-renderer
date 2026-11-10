# Introvert Here agent team

Started 10 Nov 2026 at Barry's request. Every agent reads, in this order:
1. `docs/agents/STANDING_RULES.md` (Barry's rules; they override anything else)
2. `docs/MOSSPIT_STUDIOS_PLAN.md` (where everything stands)
3. its own playbook below

| Agent | Playbook | Runs | Touches live systems? |
|---|---|---|---|
| Coordinator | `coordinator.md` | On demand + regular digest | Only to carry out what Barry approved |
| Canva | `canva.md` | Per project, in a session Barry starts (needs the Canva connector) | Canva edits only after Barry approves the preview |
| Printify | `printify.md` | Per project + weekly health check | Drafts freely; publishing, deleting, orders only with Barry's OK |
| Etsy | `etsy.md` | Weekly audit | No. Reports; changes go through Barry |
| Watchtower | `watchtower.md` | Weekly (Mondays, scheduled task) | No. Briefings and proposals only |
| Finance | `finance.md` | Monthly (proposed: first week of each month, from December) | No. Read-only |

## How work flows
- Barry sets a job (in a session, or later via the approvals app Inbox).
- Specialists do the work and write results to the repo (`docs/<agent>/...`).
- Questions for Barry go to ONE place (until the Inbox page exists: the end of the agent's report, plus a phone notification), batched, plain English, each one standalone with a recommended answer.
- Anything that changes something live waits for Barry's yes.

## Saving credits
- Scripts for repetitive work, agents for judgement. Work out a method once, write it as a script in the repo, then run it over everything (example: `shop/uk/make_pilot.py`).
- Weekly or monthly, not daily. One digest, not many messages.
- If nothing changed, say so in one line and stop.
- Keep big reads small: fetch only what the task needs.
