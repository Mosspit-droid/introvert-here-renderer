# Brief: the Escape Room stealth game

Written 21 Nov 2026 for a separate thread to pick up. Barry owns every decision here; this is a starting point to
workshop with him, not a spec.

## Who you're working with

Barry runs Introvert Here (a Mosspit Studios brand). He isn't technical. How he likes to work:

- **Talk first, build second.** Workshop ideas back and forth, give a recommendation, wait for his say-so before building.
- **Show, don't describe.** Everything goes on a private preview first, with a link in every reply (add `?r=<hhmm>` so
  his browser doesn't show an old copy). He checks on his phone.
- **When he sends pictures, assess them first.** Don't add them to the site until he picks.
- **Plain English, short replies, no jargon.**
- **His humour is dry and absurd.** He writes a lot of the copy himself; anything you write is a draft for him to edit.

## Where the game lives

The site is a Cloudflare Worker: `shop/worker.js`. One half is the shop; the other is **The Escape Room**, a hub for
introverts, "a room to get away from people".

- `/uk/escape-room` is a full-screen picture of a cosy room. Tapping things in it opens the hub's parts (see `ROOM` in
  `shop/worker.js`).
- The **games console and TV** are the way into this game. At the moment they show "Soon" and the line "The console
  isn't plugged in yet. The stealth game is on its way. Come back later." To connect it, swap that entry's
  `soon: "..."` for `href: HUB.path + "/stealth"` (or whatever path you agree with Barry).
- Pages that already work, worth reading for the house style: `spotPage()` (Spot the Introvert),
  `lookBusyPage()`, `excusesPage()` and `gatePage()`.
- Every page is built with `page(title, body, { nav: "hub", body: "<class>", script: ... })`. The site uses the
  Montserrat font, dark backgrounds and the Escape Room yellow `#fad00c`.

## The idea so far (Barry's, to be developed with him)

A stealth game where you avoid people, not guards. You're an introvert trying to get from A to B (through an office,
a party, a supermarket, a family do) without being caught by personal-space intruders: the overly chatty colleague,
the "how ARE you?" neighbour, the person collecting for a leaving present, the relative with a story. If one spots
you, you're dragged into conversation.

He mentioned the *feel* of famous sneaking games as inspiration. **The game must be our own:** its own look,
characters, names and art. Don't copy or imitate any existing game's characters, art, music, interface or levels.

Things to workshop with him before building:
- **Top-down or side-on**, and the art style (it should sit with the rest of the Escape Room: muted, warm, a bit
  painterly; the Spot the Introvert paintings are oil-painting style).
- **Controls that work one-handed on a phone** in a bus queue (tap to move? drag? swipe?), plus keyboard on a computer.
- **How you hide:** behind pot plants, inside coat piles, pretending to be on the phone, staring at a noticeboard.
- **What getting caught looks like:** the conversation bubble that traps you, and a funny line.
- **Levels:** how many to start with, and how long each takes (aim for a minute or two).
- **Sound:** none, or off by default. People play this in public.
- **Accessibility:** no fast flashing; respect "reduce motion" settings.

## Technical guardrails

- **Keep it out of the main file.** Put the game in its own file (for example `shop/stealth.js`) and import it into
  `shop/worker.js`. Only add the route and the `ROOM` change to `worker.js`. Another thread is also editing
  `worker.js`, so keeping your changes there small avoids clashes.
- **No game engine downloads at runtime** unless Barry agrees. Plain canvas or SVG in the page is fine. External
  scripts may only come from cdnjs.cloudflare.com, cdn.jsdelivr.net, or unpkg.com, with an exact version.
- **Use your own preview, not the shared one.** The shop preview (`introvert-here-shop-preview`) is used by the
  other thread, and each deploy replaces the whole thing. Copy `shop/wrangler.preview.toml` to
  `shop/wrangler.stealth.toml`, change `name` to `introvert-here-stealth-preview`, and deploy that:

  ```
  cd shop && STAMP="$(date -u '+%-d %b, %H:%M') UTC" && CLOUDFLARE_API_TOKEN=proxy-injected \
    CLOUDFLARE_ACCOUNT_ID=82725ced954062d2cb0d30912fbd923c npx -y wrangler@3.114.0 deploy \
    -c wrangler.stealth.toml --var "BUILD:$STAMP"
  ```

  Its link will be `https://introvert-here-stealth-preview.mosspit.workers.dev/uk/escape-room/stealth`. The footer
  shows "Preview copy, updated <time>" so Barry can tell he's seeing the latest version. Cloudflare sometimes answers
  "please wait" (code 971); wait a minute and try again.
- **Test before showing Barry.** Chromium and Playwright are installed. The other thread tests by importing
  `shop/worker.js` into Node with a pretend `env` and driving it with Playwright at phone size (390 x 844) and
  desktop size (1280 x 800). Check there are no page errors and that nothing scrolls off-screen.
- **Pictures** for the site go in R2 bucket `introvert-here-shop-photos` under `site/<name>.jpg` (served at
  `/s/<name>.jpg`), with a copy in `shop/assets/site/`.

## Standing rules (from Barry, not negotiable)

- The repository `Mosspit-droid/introvert-here-renderer` is **public**. Never put secrets in chat or commits.
- **Nothing live changes without Barry's OK:** not the real shop (`introvert-here-shop`), not Etsy, Printify, Make or
  the Core workbook. No spending.
- When Barry asks to save an idea or task ("note it", "add that to the list"), add it with the Introvert Here
  to-do connector.
- Commit and push your work as you go.
