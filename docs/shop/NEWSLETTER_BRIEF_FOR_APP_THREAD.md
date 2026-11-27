# Brief for the app thread: a newsletter workspace

From the shop thread, 26 Nov 2026. Barry owns every decision here: workshop it with him before building.

## What Barry wants

A place in the app where he can put together and send the Introvert Here newsletter, so he never has to open MailerLite.
He finds MailerLite's own screens confusing and off-putting; the app should do the fiddly parts.

How he likes to work: talk first and give a recommendation, then wait for his say-so. One step at a time. Plain English,
short. He checks things on his phone. Anything you write for him is a draft for him to edit; his humour is dry and absurd.

## What already exists (built by the shop thread)

- **Sign-up form:** on the website at `/uk/escape-room/newsletter` (the "Minimal contact" pin on the Escape Room's
  noticeboard). It's MailerLite's embedded form (account `2825119`, form code `jF2XBx`), restyled in the site's colours.
  Form heading (Barry's): "Stay home. We'll come to you. First look at every Exclusive, before the news goes stale. Plus
  5% off your first order."
- **Double opt-in is off** (Barry, 25 Nov): people are subscribed straight away, with no confirmation email.
- **The 5% code** is handed out by the website, not MailerLite: after signing up, the page shows a one-off Stripe code
  `HELLO-XXXXXX` (5%, one use, 30 days, £25 minimum, first order only, at most 50 a month). The newsletter doesn't need
  to send it. See `rewardCode()` in `shop/worker.js`.
- **Privacy notice** (`/privacy`) already says: an occasional newsletter, only to people who sign up, held by MailerLite,
  unsubscribe any time.
- Product feed with every design, colour and price: `https://introverthere.com/google-products.xml` (live from 30 Nov).

## Ideas to workshop with him

- **Drafts written for him** from what's new since the last issue: new gags, Exclusives (site-first designs), the
  vote results, a new Escape Room game, Christmas order-by dates. He edits the wording or just says yes.
- **Look:** on brand (black, cream, Escape Room yellow `#fad00c`, Montserrat, the Introvert Here logo, Hoodini the mascot
  from `brand-logos/mascot/`). Short. "Occasional and quiet" is the promise.
- **How often:** his call; the form says "occasional". Maybe one issue per new Exclusive or per month.
- **Sending:** through the MailerLite API (create a campaign, set the content, send or schedule). Show him a
  preview first.

## Guardrails (Barry's standing rules)

- **Nothing is sent to subscribers without Barry's explicit OK**, every time. A test send to his own address first.
- **The MailerLite API key is a secret.** Ask for it with the secure credential form; never in chat, never in the repo
  (the repository `Mosspit-droid/introvert-here-renderer` is public). Barry makes the key in MailerLite under
  Integrations, API; walk him through it one tap at a time.
- Don't change the website's form, the 5% code or the privacy page without telling the shop thread (the shop thread
  owns `shop/worker.js`).
- No spending (MailerLite's free plan has limits; tell him before anything would need a paid plan).
- When Barry asks to save an idea ("note it", "add that to the list"), use the Introvert Here to-do connector.
