# Mosspit Studios: plan and where things stand

Owner: Barry (contact via the account on this repo). Last updated 9 Nov 2026.
Read this first in any new session. No passwords or keys belong in this file.

## The idea

**Mosspit Studios** is the umbrella for several brands Barry is building. Each brand is its own thing;
the studio ties them together. Introvert Here is the first and only live brand so far. Other projects
exist but are not developed yet (ask Barry for names before assuming anything).

## Brands

| Brand | Status | Where it lives |
|---|---|---|
| **Introvert Here** | Live. Print-on-demand clothing with dry, introvert humour | Etsy shop [IntrovertHereShop](https://www.etsy.com/shop/IntrovertHereShop) (shop id 65435151), Printify shop 27154106 |
| Other Mosspit brands | Ideas, not built yet | Not decided |

Introvert Here collections: **INTROVERT HERE…** (IH), **SHHH.** (SH), **PER CONTRACT** (PC, office humour;
black background stays), **OFF THE SHELF** (OS). Garments: T-shirt £26.99, long-sleeve £29.99,
sweatshirt £39.99, hoodie £49.99, free postage on every listing.

## Domains Barry owns

| Domain | Proposed use |
|---|---|
| **mosspit.org** | Studio home: a page listing every brand, with links |
| **mosspit.net** | Forward to mosspit.org (protects the name) |
| **introverthere.com** | Introvert Here's own site; points to the Etsy shop for now |

None of these are connected to Cloudflare yet. Connecting them (free) is the first step for any website
or custom address. The Cloudflare account already exists (it runs the apps below).

## Tools and apps already running

| What | Address | Notes |
|---|---|---|
| Approvals app | mosspit-approvals.mosspit.workers.dev | Barry's control panel: approve listings, Gags, 🏷 Tags, Stats, Pricing, Tools. Code: `approvals-app/worker.js` |
| Mosspit Tag Checker for Etsy | tag-checker.mosspit.workers.dev | Free public tool. Old address phrase-planner.mosspit.workers.dev forwards. Code: `tools/phrase-field-planner.html`, hosting in `tools/tag-checker-worker/` |

The tag checker:
- **Features:** paste a list or spreadsheet cells; checks Etsy's 13 tags, 20 characters and character rules (red); flags words shared between tags (amber); Copy All pastes all 13 into Etsy's website in one go (tested); tap-to-copy for the Etsy app.
- **Visits:** counted anonymously and shown on the approvals app's Stats page.
- **Plan:** share on r/EtsySellers and r/SideProject as an answer to tag questions, not as a launch post. Watch visits for a month before thinking about ads (UK ads mean a cookie consent banner and rewording the privacy lines).
- **Later:** move it to something like tools.mosspit.org/tag-checker once mosspit.org is on Cloudflare.

The automation behind Introvert Here (Make scenarios, Core Excel workbook, renderer) is described in
`docs/tagging/TAGGING_SPEC.md` and the repo README.

## Own shop on introverthere.com (decided 10 Nov 2026)

- **Site structure:** the shop is an **Introvert Here-branded site on introverthere.com** (shoppers looking for IH shouldn't land on the studio site). mosspit.org stays the parody studio site and links to it. Future brands get their own shop sites; all share one engine (one Stripe account, one checkout, one Orders page, one Printify connection).
- **Stripe account:** business name "Mosspit Studios" (sole trader, UK). Public name and statement descriptor: "Introvert Here" / "INTROVERT HERE". Later brands: per-sale descriptor or a second Stripe account under the same login. Started in test mode on 10 Nov.

- **Payments: Stripe** (Stripe-hosted checkout, about 1.5% + 20p per UK card), not Shopify or Etsy. Etsy stays as a second channel.
- **Flow:** customer pays on Stripe → Stripe webhook to a Cloudflare worker → worker places the Printify order directly (Printify API, not Make: Make is at its 16-scenario limit) → Printify prints, posts and emails tracking. New "Orders" page in the approvals app.
- **Country picker first:** pre-selected from Cloudflare's country hint, remembered in the browser.
  - **UK shop** (phase 1): GBP, UK-printed products, UK returns rules.
  - **US shop** (phase 2): USD, products made with a US Printify provider (US de minimis is suspended, so UK-printed parcels pick up duty). US state sales tax only applies above about $100k a year per state.
  - **Everyone else:** sent to the Etsy shop.
  - Stripe checkout is restricted to the chosen shop's country.
- **Barry's steps:** open a Stripe account (sole trader); create a Stripe key and a Printify API key and paste them into a private form in the approvals app (never in chat); connect introverthere.com to Cloudflare.
- **Tax:** Barry is **not VAT-registered** (confirmed 10 Nov): no VAT on prices or receipts. Stripe Tax off except free threshold monitoring.
- **Keys saved in the cloud environment (10 Nov):** Stripe test secret key (api.stripe.com, test sandbox acct_1UZtLkR6sm3kVsoD "Mosspit Studios sandbox") and a Printify API token (api.printify.com; sees IntrovertHereShop 27154106 and HerdMentalityShop 27163591). The shop worker will need its own copies (restricted Stripe key + Printify token) via a private form in the approvals app.
- **First build check:** whether Printify accepts API orders into the Etsy-linked shop or needs a separate API store (test by creating and cancelling an order).
- **Open decisions:** published contact address (virtual address?); how to handle 14-day change-of-mind returns (Printify doesn't take them back).
- Test everything in Stripe test mode before going live.

## Collection taglines (approved 9 Nov 2026)

- **INTROVERT HERE…** Every design opens with "Introvert here…" and finishes with what someone of few words would say if they bothered. A pre-emptive strike, printed once, so it never has to be said out loud.
- **SHHH.** Gentle words for people who can't always find their voice, and a quiet reminder to everyone else that struggling to say something isn't the same as having nothing to say. (Not humour-led: a gentle plea for understanding.)
- **PER CONTRACT** For the team-building days, the mandatory fun and the after-work drinks you can't get out of. Clothing for people who are contractually obliged to socialise, and not one bit more. Attendance compulsory. Enthusiasm not included.
- **OFF THE SHELF** For people who'd rather be somewhere else entirely: between the pages, anywhere but here. Escapism, worn proudly. (Launching soon; paraphrased movie lines may come later.)

## To do (Barry's priorities, roughly in order)

1. **Mosspit Studios logo.** Done 9 Nov: mascot **Rupert Cheek** (smug yuppie peach, "smartarse") plus a MOSSPIT STUDIOS serif wordmark and the tagline **"Purveyors of Fine Cheek"** (use the tagline versions by default). Kit in `docs/brand/mosspit-logo-kit/` (main files also in Canva folder "Mosspit Studios logo kit"), brief in `docs/brand/MOSSPIT_MASCOT_BRIEF.md`. Elspeth reference scene: "The Moss Pit" sign, dark brick, ivy, amber office glow.
2. **Studio website** on mosspit.org. Draft live at mosspit-draft.mosspit.workers.dev (source `sites/mosspit-draft/`): a parody corporate site run by Rupert (Our Brands, Our Values, Tools, The Moss Pit with an Elspeth cameo, Investor Relations: "No."). **Decision 9 Nov: no "coming soon" teasers.** Only launched brands appear; others are added when they exist.
3. **Connect the domains** to Cloudflare (walk Barry through it step by step; he's not technical).
4. **Introvert Here site** on introverthere.com (can start as a single page linking to Etsy).

## Introvert Here work in progress

- **New tag system:** built, tested, switched OFF (`TagEngine` in Core's TAG_SETTINGS). Barry decides when to switch it on. After about a week of good new builds, back-date existing listings in small batches (about 5 gags a week) after Barry approves fresh suggestions on the Tags page.
- **Deferred:** sales/profit reconciliation tracker (early December, after November's statement), and the social-content rotation tracker.

## How Barry likes to work

- Plain English, no jargon, short steps. He is not a developer.
- Don't send him to dashboards or logins he hasn't used. Find a way that works from what he already has (usually the approvals app).
- Back up before changing anything live. Test before saying it works, and say plainly when something couldn't be tested.
