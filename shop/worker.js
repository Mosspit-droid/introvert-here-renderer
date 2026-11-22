// Introvert Here shop (Cloudflare Worker "introvert-here-shop").
//
// Pages: country picker (/), UK shop (/uk), product pages (/uk/p/<slug>, one per garment), basket (/uk/basket),
//        thank-you (/uk/thanks), legal pages, "elsewhere" (sends non-UK visitors to Etsy).
// API:   POST /api/checkout       -> builds a Stripe Checkout Session from the basket (prices from the catalogue, never the browser)
//        POST /api/stripe-webhook -> verified Stripe event; on payment, places the order with Printify (left on hold
//                                    for Barry to approve while AUTO_SEND is off) and records it for the approvals app.
//
// Data:  KV (binding PENDING, shared with the approvals app)
//          shop:catalog          catalogue, kept current by the approvals app (shopCatalogRun in approvals-app/worker.js)
//          shop:orders           list of shop orders (newest first), read by the approvals app
//          shop:order:<session>  one record per paid checkout (also the "already handled" marker)
//        Keys come from KV namespace SECRETS (stripe_secret_key, printify_token), saved by Barry through the
//        approvals app. STRIPE_WEBHOOK_SECRET is a worker secret.

const PRINTIFY_SHOP = "27154106";
const SHOP_NAME = "Introvert Here";
const COLLECTIONS = {
  IH: { name: "INTROVERT HERE…", line: "Every design opens with “Introvert here…” and finishes with what someone of few words would say if they bothered. A pre-emptive strike, printed once, so it never has to be said out loud." },
  SH: { name: "SHHH.", line: "Gentle words for people who can’t always find their voice, and a quiet reminder to everyone else that struggling to say something isn’t the same as having nothing to say." },
  PC: { name: "PER CONTRACT", line: "For the team-building days, the mandatory fun and the after-work drinks you can’t get out of. Clothing for people who are contractually obliged to socialise, and not one bit more. Attendance compulsory. Enthusiasm not included." },
  OS: { name: "OFF THE SHELF", line: "For people who’d rather be somewhere else entirely: between the pages, anywhere but here. Escapism, worn proudly." },
  // Wording from Core's PRODUCT_RULES (COLLECTION_INTRO). Newspaper-paper banner, red brick page background (Barry, 20 Nov).
  // Wording from Core's COLLECTION_INTRO. Blue painted slats (Barry's picture, 20 Nov) for the banner and page background.
  IP: { name: "IN PERSON.", line: "Your name, printed, so you only have to say it once. Introductions, handled." },
  EX: { name: "EXCLUSIVE.", line: "Jokes about whatever everyone’s talking about this week, from someone who’d rather not join in. Hot off the press. Comment declined." },
};
// Mockups put on range backgrounds by the GitHub job "Shop mockups" live on the repo's shop-mockups branch.
const MOCKUP_STORE = "https://raw.githubusercontent.com/Mosspit-droid/introvert-here-renderer/shop-mockups/m/";
// One short line per range for the front page's "Find your range" cards, cut down from Barry's own range wording.
const RANGE_SHORT = { IH: "The original. What someone of few words would say, if they bothered.", SH: "Gentle words for people who can’t always find their voice.",
  PC: "Contractually obliged to socialise, and not one bit more.", OS: "For people who’d rather be between the pages.",
  IP: "Your name, printed, so you only have to say it once.", EX: "Hot off the press. Comment declined." };
const ETSY_SHOP = "https://www.etsy.com/shop/IntrovertHereShop";

let catalogCache = null, catalogAt = 0;
async function catalog(env) {
  if (!catalogCache || Date.now() - catalogAt > (isPreview(env) ? 15000 : 300000)) {
    catalogCache = (await env.PENDING.get(isPreview(env) ? "shop:catalog-preview" : "shop:catalog", "json")) || { designs: [] };
    catalogAt = Date.now();
  }
  return catalogCache;
}
const money = (p) => "£" + (p / 100).toFixed(2);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...extra } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const cookie = (req, name) => ((req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")) || [])[1];

// The preview copy (worker "introvert-here-shop-preview", wrangler.preview.toml, PREVIEW = "yes") is for Barry to look at
// changes before they reach the real shop: it reads its own catalogue (KV shop:catalog-preview), tries shop:preview:<file>
// before the real picture files, is hidden from search engines and can't take orders.
const isPreview = (env) => env.PREVIEW === "yes";
let STAMP = "";   // set per request on the preview copy (wrangler --var BUILD:"...")
export default {
  async fetch(request, env, ctx) {
    STAMP = isPreview(env) ? env.BUILD || "" : "";
    const res = await route(request, env, ctx);
    if (!isPreview(env)) return res;
    const h = new Headers(res.headers); h.set("X-Robots-Tag", "noindex, nofollow"); if (!/^image\//.test(h.get("Content-Type") || "") || !/\?v=/.test(request.url)) h.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, headers: h });
  },
  // Preview copy only (it alone has a schedule): copies pictures this build sandbox can't reach (Printify's image host)
  // into KV. Reads KV "mirror:list" ([{k, u}]) and saves each missing one under its key k.
  async scheduled(event, env, ctx) {
    if (!isPreview(env)) return;
    const list = (await env.PENDING.get("mirror:list", "json")) || [];
    for (const it of list.slice(0, 20)) {
      if (!/^mirror:[\w.-]+$/.test(it.k || "") || (await env.PENDING.get(it.k + ":ok"))) continue;
      const r = await fetch(it.u); if (!r.ok) { await env.PENDING.put(it.k + ":ok", "failed " + r.status, { expirationTtl: 600 }); continue; }
      await env.PENDING.put(it.k, await r.arrayBuffer()); await env.PENDING.put(it.k + ":ok", "1");
    }
  },
};
async function route(request, env, ctx) {
  {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/vote" && request.method === "POST") return await castVote(request, env);   // works on the preview too (its own tally)
      if (isPreview(env) && path.startsWith("/api/")) return json({ error: "This is the preview copy of the shop, so checkout is switched off." }, 403);
      if (isPreview(env) && path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
      if (path === "/api/stripe-webhook" && request.method === "POST") return await stripeWebhook(request, env, ctx);
      if (path === "/api/checkout" && request.method === "POST") return await checkout(request, env, url);
      if (path === "/country") {
        const c = url.searchParams.get("c");
        const dest = c === "GB" ? "/uk" : "/elsewhere?c=" + encodeURIComponent(c || "");
        return new Response(null, { status: 302, headers: { Location: dest, "Set-Cookie": `ih_country=${encodeURIComponent(c || "")}; Path=/; Max-Age=31536000; SameSite=Lax; Secure` } });
      }
      if (path === "/") {
        const chosen = cookie(request, "ih_country");
        if (chosen === "GB" && !url.searchParams.has("change")) return Response.redirect(url.origin + "/uk", 302);
        return html(countryPage((request.cf && request.cf.country) || "GB"));
      }
      if (path === "/elsewhere") return html(elsewherePage(url.searchParams.get("c")));
      if (path === "/uk") {   // old shop links (/uk?c=PC) still work
        if (url.searchParams.has("c") || url.searchParams.has("t")) return Response.redirect(url.origin + "/uk/shop" + url.search, 302);
        return html(frontPage(await catalog(env)));
      }
      if (path === "/uk/gifts") return html(giftsPage(await catalog(env)));
      if (path === "/uk/shop") return html(shopPage(await catalog(env), url.searchParams.get("c"), url.searchParams.get("t"), url.searchParams.get("n")));
      if (path === HUB.path) return html(hubPage());
      if (path === HUB.path + "/gate") return html(gatePage());
      if (path === HUB.path + "/look-busy") return html(lookBusyPage());
      if (path === HUB.path + "/excuses") return html(excusesPage());
      if (path === HUB.path + "/spot") return html(spotPage());
      if (path === HUB.path + "/escape-the-party") return html(partyPage());
      if (path === HUB.path + "/aunt-doris") return html(dorisPage());
      if (path === HUB.path + "/vote") return html(votePage(await upcoming(env)));
      if (path === "/uk/comfort-zone") return Response.redirect(url.origin + HUB.path, 302);   // its first name
      if (path.startsWith("/uk/p/")) {
        const cat = await catalog(env), want = path.slice(6);
        for (const d of cat.designs) for (const t of Object.keys(d.garments)) if (productSlug(d, t) === want) return html(productPage(d, t, cat));
        // Old addresses were one page per gag: send them to that gag's first garment.
        const old = cat.designs.find((x) => x.slug === want);
        if (old) return Response.redirect(url.origin + "/uk/p/" + productSlug(old, cat.garmentOrder.find((t) => old.garments[t])), 302);
        return html(page("Not found", mascotMsg("peek", "That isn’t here.", "It might have sold out, or it’s hiding. Either way, it’s not coming out.", "/uk/shop", "Back to the shop"), { noindex: true }), 404);
      }
      if (path === "/uk/basket") return html(basketPage());
      if (path === "/uk/thanks") return html(thanksPage());
      if (path === "/terms" || path === "/returns" || path === "/privacy" || path === "/contact") return html(legalPage(path.slice(1)));
      if (path === "/catalog.json") return json(await catalog(env));
      if (path === "/google-products.xml") return new Response(googleFeed(await catalog(env), url.origin), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      if (["/logo.png", "/icon.png", "/hero.jpg", "/logo-stacked.jpg", "/concrete.jpg", "/hero-SH.jpg", "/hero-PC.jpg", "/hero-OS.jpg", "/bg-SH.jpg", "/bg-PC.jpg", "/bg-OS.jpg", "/hero-EX.jpg", "/bg-EX.jpg", "/hero-IP.jpg", "/bg-IP.jpg", "/logo-wide.png", "/logo-xmas.png", "/logo-ER-wide.png", "/bg-IP2.jpg", "/bg-SH2.jpg"].includes(path) || /^\/logo-[A-Z]{2}\.png$/.test(path)) {
        const buf = (isPreview(env) && (await env.PENDING.get("shop:preview:" + path.slice(1), "arrayBuffer"))) || (await env.PENDING.get("shop:" + path.slice(1), "arrayBuffer"));
        return buf ? new Response(buf, { headers: { "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=86400" } }) : new Response("", { status: 404 });
      }
      // A garment's own Canva mockup pages (every colour): /p/<product code>/<page number>[t].jpg; "t" is the small version.
      // Kept in R2 (bucket introvert-here-shop-photos, binding PHOTOS) under the same path.
      const pp = /^\/p\/([A-Z]{2}-\d{5}-[A-Z-]+)\/(b?\d{2}t?)\.jpg$/.exec(path);   // b = the same photo with the gag text left off (In Person name preview)
      if (pp) {
        const obj = env.PHOTOS ? await env.PHOTOS.get("p/" + pp[1] + "/" + pp[2] + ".jpg") : null;
        return obj ? new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ETag: obj.httpEtag } }) : new Response("", { status: 404 });
      }
      const sp = /^\/s\/([a-z0-9-]+)\.(jpg|png)$/.exec(path);   // site pictures (door scenes, the mascot...), from R2 site/
      if (sp) {
        const obj = env.PHOTOS ? await env.PHOTOS.get("site/" + sp[1] + "." + sp[2]) : null;
        return obj ? new Response(obj.body, { headers: { "Content-Type": sp[2] === "png" ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ETag: obj.httpEtag } }) : new Response("", { status: 404 });
      }
      const mk = /^\/m\/([0-9a-f]{16})\.jpg$/.exec(path); // Printify mockups on range backgrounds (shop/mockups/)
      if (mk) {
        let buf = (isPreview(env) && (await env.PENDING.get("shop:preview:m-" + mk[1] + ".jpg", "arrayBuffer"))) || (await env.PENDING.get("shop:m-" + mk[1] + ".jpg", "arrayBuffer"));
        if (!buf) { const r = await fetch(MOCKUP_STORE + mk[1] + ".jpg", { cf: { cacheTtl: 86400, cacheEverything: true } }); if (r.ok) buf = await r.arrayBuffer(); }
        return buf ? new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } }) : new Response("", { status: 404 });
      }
      return html(page("Not found", mascotMsg("peek", "Nothing here.", "Or there is, and it’s hiding. Either way, it’s not coming out.", "/uk", "Go to the front page"), { noindex: true }), 404);
    } catch (e) {
      console.error(e);
      return html(page("Something went wrong", `<p>Sorry, something went wrong on our side. Please try again in a minute.</p>`), 500);
    }
  }
}

// ---------------- checkout ----------------

async function getSecret(env, name) {
  return (env.SECRETS && (await env.SECRETS.get(name))) || env[name.toUpperCase()] || "";
}

async function stripe(env, method, path, form) {
  const key = await getSecret(env, "stripe_secret_key");
  if (!key) throw new Error("Stripe key not set");
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method, headers: { Authorization: "Bearer " + key, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Stripe: " + (data.error && data.error.message || res.status));
  return data;
}

async function checkout(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  const cat = await catalog(env);
  const form = {};
  let n = 0;
  for (const it of items) {
    const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));
    let found = null;
    for (const d of cat.designs) for (const g of Object.values(d.garments)) if (g.code === it.code) {
      const v = g.variants.find((x) => String(x.id) === String(it.variant));
      if (v) found = { d, g, v };
    }
    if (!found) continue; // item no longer sold: quietly dropped, the basket page re-checks
    const { d, g, v } = found;
    // In Person: the buyer's name is checked again here (never trust the browser) and travels with the order.
    const pname = g.personal ? personalName(it.name, g.personal.max) : "";
    if (g.personal && !pname) return json({ error: `"${d.title}" needs a name: letters only, up to ${g.personal.max}. Please add it again from its page.` }, 400);
    const p = `line_items[${n}]`;
    form[`${p}[quantity]`] = String(qty);
    form[`${p}[price_data][currency]`] = "gbp";
    form[`${p}[price_data][unit_amount]`] = String(v.price);
    form[`${p}[price_data][product_data][name]`] = `${d.title} – ${g.label}`;
    form[`${p}[price_data][product_data][description]`] = [v.colour, v.size].filter(Boolean).join(", ") + (pname ? ` · Name: ${pname}` : "");
    const pic = ((g.mockups || []).find((m) => m.colour === v.colour) || {}).thumb || g.tile || (g.images[0] || {}).thumb;
    if (pic) form[`${p}[price_data][product_data][images][0]`] = pic.startsWith("/") ? url.origin + pic : pic; // Stripe needs a full address
    form[`${p}[price_data][product_data][metadata][code]`] = g.code;
    if (g.personal) {   // no ready-made Printify product: the approvals app makes this buyer's print and orders it
      Object.assign(form, { [`${p}[price_data][product_data][metadata][personal]`]: "yes", [`${p}[price_data][product_data][metadata][name]`]: pname,
        [`${p}[price_data][product_data][metadata][colour]`]: v.colour || "", [`${p}[price_data][product_data][metadata][size]`]: v.size || "" });
    } else {
      form[`${p}[price_data][product_data][metadata][printify_product_id]`] = g.printifyId;
      form[`${p}[price_data][product_data][metadata][printify_variant_id]`] = String(v.id);
    }
    n++;
  }
  if (!n) return json({ error: "Your basket is empty, or those items are no longer available." }, 400);
  Object.assign(form, {
    mode: "payment",
    success_url: `${url.origin}/uk/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/uk/basket`,
    locale: "en-GB",
    "shipping_address_collection[allowed_countries][0]": "GB",
    "phone_number_collection[enabled]": "true",
    "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
    "shipping_options[0][shipping_rate_data][fixed_amount][amount]": "0",
    "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "gbp",
    "shipping_options[0][shipping_rate_data][display_name]": "Free UK delivery",
    "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]": "business_day",
    "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]": "4",
    "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]": "business_day",
    "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]": "10",
    "metadata[shop]": "IH-UK",
    "payment_intent_data[metadata][shop]": "IH-UK",
  });
  if (!(await getSecret(env, "stripe_secret_key"))) return json({ error: "The shop isn't connected to Stripe yet (the Stripe key hasn't been saved in the approvals app)." }, 503);
  try {
    const session = await stripe(env, "POST", "/checkout/sessions", form);
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout couldn't be opened. Please try again in a minute." }, 502);
  }
}

// The name rules agreed with Barry (20 Nov): capitals; letters of any alphabet, spaces, hyphens and apostrophes; no
// digits or symbols; up to max characters; at least one letter. Returns "" if what was sent doesn't fit them.
function personalName(raw, max) {
  const v = String(raw || "").toUpperCase().replace(/[’`]/g, "'").replace(/ +/g, " ").trim();
  return v && v.length <= max && /^[\p{L} '\-]+$/u.test(v) && /\p{L}/u.test(v) ? v : "";
}

// ---------------- Stripe webhook ----------------

async function verifyStripe(request, secret) {
  const sig = request.headers.get("Stripe-Signature") || "";
  const raw = await request.text();
  const parts = Object.fromEntries(sig.split(",").map((kv) => kv.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const v1s = sig.split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  const t = parts.t;
  if (!t || !v1s.length || !secret) return null;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const same = (a, b) => a.length === b.length && [...a].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
  return v1s.some((v) => same(v, hex)) ? JSON.parse(raw) : null;
}

async function stripeWebhook(request, env, ctx) {
  const event = await verifyStripe(request, await getSecret(env, "stripe_webhook_secret"));
  if (!event) return new Response("bad signature", { status: 400 });
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return json({ ignored: event.type });
  const s = event.data.object;
  if (s.payment_status !== "paid") return json({ waiting: s.payment_status });
  const key = "shop:order:" + s.id;
  if (await env.PENDING.get(key)) return json({ duplicate: true });
  await env.PENDING.put(key, JSON.stringify({ status: "processing", at: Date.now() }));
  ctx.waitUntil(placeOrder(env, s.id).catch((e) => console.error(e)));
  return json({ received: true });
}

async function placeOrder(env, sessionId) {
  const key = "shop:order:" + sessionId;
  const record = { session: sessionId, at: Date.now(), status: "failed", livemode: false };
  try {
    const s = await stripe(env, "GET", `/checkout/sessions/${sessionId}?expand[]=line_items.data.price.product`);
    record.livemode = !!s.livemode;
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
    const addr = ship.address || {};
    const cust = s.customer_details || {};
    const name = String(ship.name || cust.name || "Customer").trim();
    const first = name.split(/\s+/)[0], last = name.split(/\s+/).slice(1).join(" ") || "-";
    const all = s.line_items.data.map((li) => { const m = li.price.product.metadata || {}; return {
      product_id: m.printify_product_id, variant_id: Number(m.printify_variant_id), quantity: li.quantity,
      code: m.code, name: li.description, amount: li.amount_total,
      personal: m.personal === "yes" ? { name: m.name, colour: m.colour, size: m.size } : null }; });
    // In Person lines have no ready-made Printify product. They are recorded for the approvals app's In Person queue
    // (print made with the buyer's name, checked by Barry, then ordered) and are not part of the Printify order below.
    const lines = all.filter((l) => !l.personal), personal = all.filter((l) => l.personal);
    Object.assign(record, { name, email: cust.email, total: s.amount_total,
      items: all.map(({ code, name, quantity, amount, personal: p }) => ({ code, name: p ? `${name} (${p.colour}, ${p.size}, name: ${p.name})` : name, quantity, amount })),
      address: [addr.line1, addr.line2, addr.city, addr.postal_code].filter(Boolean).join(", ") });
    if (personal.length) {
      record.personal = personal.map(({ code, quantity, amount, personal: p }) => ({ code, quantity, amount, name: p.name, colour: p.colour, size: p.size, status: "waiting" }));
      record.ship = { name, email: cust.email || "", phone: cust.phone || "", first_line: addr.line1 || "", second_line: addr.line2 || "", city: addr.city || "", state: addr.state || "", zip: addr.postal_code || "", country: addr.country || "GB" };
    }
    const order = {
      external_id: sessionId, label: "IH shop " + sessionId.slice(-8),
      line_items: lines.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity })),
      shipping_method: 1, send_shipping_notification: true,
      address_to: { first_name: first, last_name: last, email: cust.email || "", phone: cust.phone || "", country: addr.country || "GB",
        region: addr.state || "", address1: addr.line1 || "", address2: addr.line2 || "", city: addr.city || "", zip: addr.postal_code || "" },
    };
    if (!lines.length) {
      record.status = record.livemode ? "in-person" : "test-not-sent";
      record.note = record.livemode ? "In Person only: waiting in the In Person queue for the name check." : "Test payment: not sent to Printify.";
    } else if (!record.livemode && env.TEST_ORDERS_TO_PRINTIFY !== "yes") {
      record.status = "test-not-sent"; record.note = "Test payment: not sent to Printify.";
    } else {
      const token = await getSecret(env, "printify_token");
      const res = await fetch(`https://api.printify.com/v1/shops/${PRINTIFY_SHOP}/orders.json`, {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "IntrovertHereShop/1.0" },
        body: JSON.stringify(order) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.id) throw new Error("Printify: " + JSON.stringify(out).slice(0, 300));
      record.printifyOrder = out.id;
      if (env.AUTO_SEND === "yes") {
        // Normal orders go straight to print (Barry, 21 Nov: "I don't want to spend all day authorising sales"); In Person
        // items never get here: they wait in the In Person queue for his name check. If Printify refuses, the order stays
        // on hold for him to send from the app.
        const go = await fetch(`https://api.printify.com/v1/shops/${PRINTIFY_SHOP}/orders/${out.id}/send_to_production.json`, { method: "POST", headers: { Authorization: "Bearer " + token, "User-Agent": "IntrovertHereShop/1.0" } });
        if (go.ok) record.status = "sent-to-production";
        else { record.status = "on-hold"; record.note = "Couldn't send to Printify automatically (" + go.status + "): send it from the app."; }
      } else record.status = "on-hold";
    }
  } catch (e) {
    record.error = String(e.message || e).slice(0, 500);
  }
  await env.PENDING.put(key, JSON.stringify(record));
  const list = (await env.PENDING.get("shop:orders", "json")) || [];
  list.unshift(record);
  await env.PENDING.put("shop:orders", JSON.stringify(list.slice(0, 500)));
  if (env.ALERT_URL && env.INGEST_SECRET) {
    const title = record.status === "failed" ? "Shop order NOT placed – needs you" : (record.livemode ? "New shop order" : "Test shop order");
    const body = `${record.name || ""} · ${record.total != null ? money(record.total) : ""}\n${(record.items || []).map((i) => `${i.quantity} × ${i.name}`).join("\n")}\n${record.error || record.note || "Printify order " + (record.printifyOrder || "") + " (" + record.status + ")"}${record.personal ? "\nIn Person: " + record.personal.map((p) => p.name).join(", ") + " to check" : ""}`;
    await fetch(env.ALERT_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Secret": env.INGEST_SECRET }, body: JSON.stringify({ title, body, source: "Shop", link: "/orders" }) }).catch(() => {});
  }
}

// ---------------- pages ----------------

// Bump ASSET_V whenever an image in KV changes, so browsers fetch the new one instead of a saved copy.
const ASSET_V = "3";
// The header carries the wide logo on every page (Barry, 21 Nov); the stacked logos stay on the banners and tiles.
const LOGO = `/logo-wide.png?v=${ASSET_V}`;
const STYLE = `
  :root{--bg:#121211;--panel:rgba(22,22,20,.86);--line:#3b3a35;--text:#f2f0ea;--muted:#c4c0b6;--accent:#f2f0ea}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
/* Page backgrounds carry a light wash (Barry, 20 Nov) so each banner, cut from the same texture, stands apart from the wall behind it. Exclusive's paper banner needs none. */
body{margin:0;background:linear-gradient(rgba(255,255,255,.3),rgba(255,255,255,.3)),#121211 url(/concrete.jpg?v=${ASSET_V}) center top/1800px auto repeat;color:var(--text);font:16px/1.55 "Montserrat",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid var(--line);background:rgba(10,10,9,.55)}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}
header img{height:56px;width:auto;display:block;border-radius:4px}
header img.wl{height:38px;border-radius:0}
/* the Christmas logo: its frame lines up exactly with the normal logo's (--fw = the frame's width) */
header{--fw:256px}header img.wl.xm{height:auto;width:calc(var(--fw)*1.0692);max-width:none;margin:calc(var(--fw)*-.02) 0 calc(var(--fw)*-.0394) calc(var(--fw)*-.0499)}
/* In the Escape Room the header logo wears its DO NOT ENTER hanger, which dangles below the header bar. */
header{position:relative;z-index:5}header img.wl.er{height:72px;margin-bottom:-34px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
.door .badge{position:absolute;right:clamp(10px,1.6vw,22px);top:clamp(10px,1.6vw,22px);width:clamp(70px,9vw,124px);height:auto;filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))}
.door.wide .badge{width:clamp(76px,11vw,150px)}
.door.er{--fc:#fad00c}
.strap{text-align:center;font-weight:800;text-transform:uppercase;letter-spacing:.2em;font-size:clamp(13px,1.7vw,20px);margin:clamp(22px,3.4vw,44px) 0 clamp(4px,1vw,12px);text-wrap:balance}
.basket-link{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-weight:600;white-space:nowrap}
nav.top{display:flex;align-items:center;gap:clamp(10px,2.4vw,26px);font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
nav.top a{text-decoration:none;opacity:.78;white-space:nowrap}nav.top a:hover,nav.top a.on{opacity:1}nav.top a.on:not(.basket-link){border-bottom:2px solid currentColor;padding-bottom:2px}
nav.top .basket-link{opacity:1;letter-spacing:.02em;text-transform:none}
@media(max-width:520px){nav.top{font-size:12px;gap:10px;letter-spacing:.04em}header img{height:40px}header img.wl{height:auto;width:29vw;max-width:150px}header{--fw:min(29vw,150px)}header img.wl.er{height:auto;margin-bottom:-3.8vw}nav.top .basket-link{padding:5px 10px}}
/* Front page: two doors of equal weight, then a strip from each side */
.doors{display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px,2vw,22px);margin:clamp(14px,2.4vw,26px) 0 0}
.door{position:relative;display:block;overflow:hidden;border-radius:clamp(14px,1.8vw,22px);aspect-ratio:4/5;max-height:74vh;width:100%;text-decoration:none;color:#fff;background:#000;box-sizing:border-box;border:clamp(4px,.55vw,7px) solid #f2f0ea;border-bottom-width:clamp(11px,1.5vw,19px);box-shadow:0 24px 60px rgba(0,0,0,.45);isolation:isolate}
.door .fi>img.pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:transform 1.4s cubic-bezier(.2,.7,.2,1),opacity 1.6s ease}
.door .fi>img.pic.on{opacity:1}
.door .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.55) 68%,rgba(0,0,0,.9) 100%)}
.door .in{position:absolute;left:0;right:0;bottom:0;padding:clamp(18px,3vw,38px);display:flex;flex-direction:column;gap:8px}
.door .kicker{font-size:12px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;opacity:.82}
.door b{font-size:clamp(30px,4.6vw,60px);line-height:1;font-weight:800;letter-spacing:.01em;text-transform:uppercase;text-wrap:balance}
.door .say{font-size:clamp(15px,1.5vw,19px);line-height:1.45;max-width:30ch;opacity:.94}
.door .go{align-self:flex-start;margin-top:10px;display:inline-flex;align-items:center;gap:10px;background:#f2f0ea;color:#141412;font-weight:700;font-size:15px;padding:12px 20px;border-radius:999px;transition:gap .3s,background .3s}
.door .go i,.sh a i{font-style:normal;transition:transform .3s}
.door:hover .fi>img.pic{transform:scale(1.045)}.door:hover .go{gap:16px;background:#fff}
.door.wide{aspect-ratio:21/9;max-height:46vh;margin-top:clamp(14px,2.4vw,26px)}.door.wide .fi>img.pic{object-position:50% var(--fy,30%)}
.strip{margin:clamp(40px,6vw,80px) 0 0}
.xn{margin:14px 0 0;padding:10px 14px;border-radius:10px;background:#5b1316;border:1px solid #a7322d;color:#f6efe0;font-size:14px;line-height:1.4;text-align:center}.xn b{color:#fff}.xn a{color:#f6d06b;white-space:nowrap}
.xgift{display:flex;flex-direction:column;gap:4px;margin:clamp(28px,4vw,48px) 0 0;padding:18px 20px;border-radius:14px;background:linear-gradient(135deg,#5b1316,#2a3d24);border:1px solid #a7322d;color:#f6efe0;text-decoration:none}.xgift b{font-size:clamp(20px,3vw,26px);text-transform:uppercase;letter-spacing:.02em}.xgift span{color:#e9d9a0}.strip:last-of-type{margin-bottom:clamp(40px,6vw,80px)}
.sh{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:20px}
.sh h2{margin:0;font-size:clamp(18px,2.2vw,24px);font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.sh a{text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;opacity:.85}.sh a:hover{opacity:1}.sh a:hover i{transform:translateX(4px);display:inline-block}
.grid.four{grid-template-columns:repeat(4,1fr);margin:0}
.things{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.thing{display:flex;flex-direction:column;gap:8px;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:clamp(18px,2.4vw,28px);min-height:150px}
.thing b{font-size:clamp(20px,2.2vw,26px);font-weight:800;text-transform:uppercase;letter-spacing:.03em;line-height:1.1}
.thing span{color:var(--muted);line-height:1.5}.thing .tag{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--text)}
a.thing{transition:transform .3s,border-color .3s}a.thing:hover{transform:translateY(-3px);border-color:var(--text)}
.ranges{display:grid;grid-template-columns:repeat(6,1fr);gap:clamp(10px,1.4vw,18px);align-items:stretch}
.ranges a{display:flex;flex-direction:column;gap:8px;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;transition:transform .3s,border-color .3s}
.ranges a:hover{transform:translateY(-4px);border-color:var(--text)}
/* every logo sits in the same-sized box, pinned to its top, so the cards line up whatever shape the logo's tag is */
.ranges .lg{display:block;aspect-ratio:1.6;width:100%}.ranges .lg img{width:100%;height:100%;object-fit:contain;object-position:50% 0;display:block}
.ranges b{font-size:13px;line-height:1.35;min-height:2.7em;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-top:2px}.ranges span:not(.lg){font-size:13px;line-height:1.45;color:var(--muted)}
.lead{font-size:clamp(16px,1.6vw,19px);max-width:62ch;margin:clamp(18px,3vw,30px) 0}
@media(max-width:760px){.doors{grid-template-columns:1fr}.door{aspect-ratio:1/1.08;max-height:none}.door .fi>img.pic{object-position:50% 12%}.door.wide{aspect-ratio:16/10}.grid.four{grid-template-columns:1fr 1fr}.ranges{grid-template-columns:1fr 1fr}}
@media(min-width:761px) and (max-width:1000px){.ranges{grid-template-columns:repeat(3,1fr)}}
@media(prefers-reduced-motion:no-preference){.door,.strip{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}.door:nth-child(2){animation-delay:.12s}@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}}
h1{font-size:clamp(26px,5vw,40px);margin:24px 0 6px;letter-spacing:.02em;text-transform:uppercase;font-weight:800}
.hero{display:block;width:100%;height:auto;border-radius:clamp(8px,1.4vw,16px);margin:18px 0 6px;box-shadow:0 10px 30px rgba(0,0,0,.5);box-sizing:border-box;border:clamp(3px,.6vw,7px) solid var(--frame,#f2f0ea)}
h2{font-size:22px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.04em}
.muted{color:var(--muted)}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.tabs a{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;color:var(--muted)}
.tabs a.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.tabs.kinds{margin-top:-6px}.tabs.kinds a{border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin:12px 0 40px}.grid .tile[hidden]{display:none}
.more{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:-12px 0 44px}
.more>span{font-size:14px;color:var(--muted,#bdb8ad);letter-spacing:.02em;text-align:center}
.mv{display:inline-flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none;color:var(--text);-webkit-tap-highlight-color:transparent}
.mv.ret{justify-self:start}.mv.dots{justify-self:end}
.mv i{display:block;padding:8px 10px;background:var(--fc);border-radius:99px;box-shadow:0 6px 16px rgba(0,0,0,.35);transition:transform .15s}
.mv:hover i,.mv:focus-visible i{transform:translateY(-2px)}.mv:active i{transform:translateY(1px)}
.mv b{display:flex;align-items:center;justify-content:space-evenly;width:96px;height:30px;border-radius:99px;background:#1a1a18;padding:0 10px;box-sizing:border-box}
.mv em{width:14px;height:14px;border-radius:50%;background:var(--fc)}
.mv svg{width:26px;height:26px;fill:none;stroke:var(--fc);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
.mv small{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.mv.dots.busy em{animation:mvtype .9s ease-in-out infinite}.mv.dots.busy em:nth-child(2){animation-delay:.15s}.mv.dots.busy em:nth-child(3){animation-delay:.3s}
@keyframes mvtype{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
@media(max-width:520px){.mv b{width:78px;height:26px}.mv em{width:12px;height:12px}.mv small{font-size:11px;letter-spacing:.12em}.more>span{font-size:13px}}
.tile{text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.tile img{width:100%;aspect-ratio:1;object-fit:cover;background:#000}
.tile .cap{padding:10px 12px;display:flex;align-items:flex-start;gap:10px;flex:1}.tile .cap>div{flex:1;min-width:0}.tile b{display:block;font-size:15px}.tile span{color:var(--muted);font-size:14px}
.tile img.rl{width:84px;height:auto;aspect-ratio:auto;object-fit:contain;background:none;flex:none}
.tile span{display:block}
@media(max-width:520px){.grid{grid-template-columns:1fr 1fr;gap:10px}.tile .cap{padding:8px 9px;gap:6px}.tile b{font-size:14px}.tile span{font-size:13px}.tile img.rl{width:56px}}
.btn{display:inline-block;background:var(--text);color:var(--bg);border:0;border-radius:8px;padding:13px 20px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;text-align:center}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.design{display:grid;grid-template-columns:1.1fr 1fr;gap:28px;margin:20px 0 40px}.design>div{min-width:0}
.main-img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:7%;border:4px solid #f2f0ea;background:#000;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.thumbs{display:flex;gap:8px;overflow-x:auto;margin-top:10px;padding:2px}.thumbs img{width:64px;height:64px;object-fit:cover;border-radius:14px;cursor:pointer;opacity:.75;border:2px solid rgba(242,240,234,.45)}
.thumbs img.on{opacity:1;border-color:#f2f0ea;border-width:3px}
.gag{white-space:pre-line;font-weight:700;font-size:18px;letter-spacing:.03em;margin:10px 0 16px}
.label{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:16px 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1px solid var(--line);background:transparent;color:var(--text);border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer}
.chip.on{border-color:var(--text);background:var(--text);color:var(--bg)}
.stage{position:relative;container-type:inline-size;line-height:0;border-radius:7%;border:4px solid #f2f0ea;overflow:hidden;background:#000;box-shadow:0 10px 30px rgba(0,0,0,.5)}.stage .main-img{display:block;width:100%;border:0;border-radius:0;box-shadow:none}
.nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;font:400 28px/1 system-ui,sans-serif;padding:0 0 4px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.nav.prev{left:10px}.nav.next{right:10px}.nav:hover{background:rgba(0,0,0,.7)}
.count{position:absolute;right:12px;bottom:10px;background:rgba(0,0,0,.5);color:#fff;font-size:12px;line-height:1;padding:5px 8px;border-radius:999px}
.live{position:absolute;display:none;color:#fff;opacity:.8;font-weight:400;line-height:1.4;text-align:right;white-space:pre-line;text-transform:uppercase;pointer-events:none}
.pname{width:100%;max-width:340px;font:inherit;font-size:20px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--text)}
.pname::placeholder{font-weight:400;opacity:.5}
.swatch{width:34px;height:34px;border-radius:50%;border:2px solid var(--line);cursor:pointer;padding:0}.swatch.on{outline:3px solid var(--text);outline-offset:2px}
.price{font-size:26px;font-weight:800;margin:18px 0 6px}
.note{font-size:14px;color:var(--muted)}
.box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}
.row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line)}
.row img{width:64px;height:64px;object-fit:cover;border-radius:6px}
.qty{display:flex;gap:6px;align-items:center}.qty button{width:30px;height:30px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--text)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:24px 0 36px;color:var(--muted);font-size:14px}
footer a{margin-right:14px}
/* Range looks: each collection gets its own background, like the video renderer */
body.r-PC{background:linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.14)),#0d1420 url(/bg-PC.jpg?v=${ASSET_V}) center top/1800px auto repeat}
body.r-PC .muted,body.r-PC .tabs a:not(.on),body.r-OS .muted,body.r-OS .tabs a:not(.on){color:#ded9cf}
body.r-OS{background:linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.14)),#2a0c0b url(/bg-OS.jpg?v=${ASSET_V}) center top/1800px auto repeat}
/* In Person: pale oak page (Barry's picture, 20 Nov) behind the blue-slat banner. A light page, so its text is dark. */
body.r-IP{background:#e3b47e;--text:#201c17;--muted:#4f463b;--line:#a88f72;--bg:#f6ecdc;--panel:rgba(250,243,232,.9);--accent:#201c17}
body.r-IP::before{content:"";position:fixed;inset:0;z-index:-1;background:#e3b47e url(/bg-IP2.jpg?v=${ASSET_V}) center/cover no-repeat}
body.r-IP header{--text:#f2f0ea;--line:#3b3a35;color:#f2f0ea}
/* ...but its product tiles and info boxes are the same dark panels as every other range (Barry, 21 Nov) */
body.r-IP .tile,body.r-IP .box{--text:#f2f0ea;--muted:#c4c0b6;--line:#3b3a35;--panel:rgba(22,22,20,.86);color:#f2f0ea}
body.r-EX{background:#2a1410}
body.r-EX::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(rgba(12,6,5,.5),rgba(12,6,5,.5)),#2a1410 url(/bg-EX.jpg?v=${ASSET_V}) center/cover no-repeat}
body.r-EX .muted,body.r-EX .tabs a:not(.on){color:#eadfd6}
/* SHHH.: sage wall with leaf shadows (Barry's picture, 20 Nov) behind the wood banner. */
body.r-SH{background:#7b7c4b}
body.r-SH::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(rgba(30,32,14,.28),rgba(30,32,14,.28)),#7b7c4b url(/bg-SH2.jpg?v=${ASSET_V}) center/cover no-repeat}
body.r-SH .muted,body.r-SH .tabs a:not(.on){color:#f1efe2}body.r-SH{--line:#a9aa80}
.countries{display:grid;gap:10px;max-width:420px;margin:24px auto}.countries a{text-align:left}
.centre{text-align:center}
@media(max-width:760px){.design{grid-template-columns:1fr}}
/* ---- House style (Barry, 21 Nov): everything is framed like the stacked logo. A line of the frame colour round
   three sides, a fat bottom edge, rounded corners inside as well as out, and the logo's little window with three
   dots at the right of the bottom edge. --fc is the frame colour: white by default, a range's own colour on its
   pages, tiles and cards, yellow for the Escape Room. Proportions follow the logo (edge 72, bottom 179, corners 60/34). */
:root{--fc:#f2f0ea}
.door,.hero,.stagefr,.tile,.ranges a,.thing,.box,.vc{--ft:4px;--fb:15px;--fR:13px;--fr:8px;--pad:0px;position:relative;isolation:isolate;background:var(--fc);border:0;border-radius:var(--fR);
  padding:calc(var(--ft) + var(--pad)) calc(var(--ft) + var(--pad)) calc(var(--fb) + var(--pad));overflow:visible;box-sizing:border-box}
.door::after,.hero::after,.stagefr::after,.tile::after,.ranges a::after,.thing::after,.box::after,.vc::after{content:"";position:absolute;right:calc(var(--ft) + var(--fb)*.12);bottom:calc(var(--fb)*.22);height:calc(var(--fb)*.56);width:calc(var(--fb)*3.2);border-radius:99px;pointer-events:none;
  background:radial-gradient(circle at 21% 50%,var(--fc) 0,var(--fc) calc(var(--fb)*.135),transparent calc(var(--fb)*.135 + .7px)),radial-gradient(circle at 50% 50%,var(--fc) 0,var(--fc) calc(var(--fb)*.135),transparent calc(var(--fb)*.135 + .7px)),radial-gradient(circle at 79% 50%,var(--fc) 0,var(--fc) calc(var(--fb)*.135),transparent calc(var(--fb)*.135 + .7px)),#1a1a18}
/* panels with words in them: the dark inside is drawn behind the content */
.tile::before,.ranges a::before,.thing::before,.box::before,.vc::before{content:"";position:absolute;inset:var(--ft) var(--ft) var(--fb);border-radius:var(--fr);background:#1a1a18;z-index:-1}
.tile>img{border-radius:var(--fr) var(--fr) 0 0}
.ranges a{--pad:11px}.thing{--pad:clamp(14px,2vw,24px);--fc:#fad00c;--ft:5px;--fb:18px;--fR:15px;--fr:9px}.box{--pad:13px}
.ranges a:hover,a.thing:hover{border-color:transparent}
/* pictures: the frame goes round a clipped inner */
.door{--ft:clamp(5px,.62vw,8px);--fb:clamp(20px,2.7vw,34px);--fR:clamp(14px,1.8vw,22px);--fr:clamp(8px,1vw,13px);background:var(--fc)}
.door .fi{position:relative;display:block;height:100%;border-radius:var(--fr);overflow:hidden;background:#000;isolation:isolate}
.door{color:#fff;cursor:pointer}.door .hit{position:absolute;inset:0;z-index:3}
.door .xp{position:relative;z-index:4;align-self:flex-start;margin-top:2px;color:#e8e4da;font-size:13px;text-decoration:underline;text-underline-offset:4px;opacity:.9}.door .xp:hover{color:#fff;opacity:1}.door .xp i{font-style:normal}
.hero{--ft:clamp(4px,.55vw,7px);--fb:clamp(15px,2.1vw,27px);--fR:clamp(11px,1.5vw,18px);--fr:clamp(6px,.85vw,11px);display:block;width:100%;height:auto;margin:18px 0 6px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.hero img{display:block;width:100%;height:auto;border-radius:var(--fr)}
/* no dots window on the banners: each already shows the stacked logo, dots and all (Barry, 21 Nov) */
.hero::after{content:none}
.stagefr{--ft:5px;--fb:19px;--fR:18px;--fr:11px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.stagefr .stage{border:0;border-radius:var(--fr);box-shadow:none}
/* ---- the warning gate: one screen, no scrolling ---- */
html:has(body.gate){overflow:hidden}
body.gate{background:#0d0d0c;color:#f2f0ea;height:100dvh;overflow:hidden;display:flex;flex-direction:column}
body.gate footer{display:none}
body.gate main{flex:1;min-height:0;width:100%;max-width:1560px;box-sizing:border-box}
.gate{height:100%;display:flex;flex-direction:column;text-align:center;font-weight:800;text-transform:uppercase}
.tape{flex:none;height:clamp(14px,2.6vh,30px);width:100vw;margin:clamp(8px,1.4vh,16px) 0 clamp(8px,1.4vh,16px) calc(50% - 50vw);background:repeating-linear-gradient(-45deg,#f6cf0b 0 20px,#141412 20px 40px);box-shadow:0 6px 18px rgba(0,0,0,.6)}
.gtop{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
.gk{flex:1;letter-spacing:.2em;font-size:clamp(10px,1.7vh,16px);margin:0;opacity:.8;text-wrap:balance}
.tri{flex:none;width:clamp(44px,8.5vh,82px);transform:rotate(var(--r));animation:flick 9s 2s infinite}
.tri:last-child{animation-delay:6s}
.tri svg{display:block;width:100%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.6))}
.tri b{display:block;font-size:clamp(8px,1.35vh,12px);letter-spacing:.14em;color:#f6cf0b;margin-top:2px}
.gmid{flex:1;min-height:0;display:grid;grid-template-columns:1.12fr minmax(0,1.5fr) .95fr;grid-template-areas:"map hope side";align-items:center;gap:clamp(12px,2.4vw,34px);padding:clamp(6px,1.4vh,16px) 0}
/* the way in */
.hope{grid-area:hope;justify-self:center;display:block;text-decoration:none;color:#f2f0ea;background:#c8161d;border:clamp(4px,.7vh,7px) solid #141412;outline:clamp(2px,.45vh,4px) solid #f2f0ea;outline-offset:calc(-1*clamp(11px,1.9vh,19px));border-radius:clamp(10px,1.6vh,16px);
  container-type:inline-size;width:min(100%,74vh);padding:0;transform:rotate(-2deg);box-shadow:0 22px 50px rgba(0,0,0,.75);line-height:1;box-sizing:border-box}
/* the words are sized from the sign's own width, so they always fit inside it */
.hope b{display:block;font-size:15.6cqw;line-height:.98;letter-spacing:.01em;margin-top:9cqw}.hope b em{display:block;font-style:normal}
.hope span{display:block;font-size:6.2cqw;letter-spacing:.2em;margin:.6em 0 .6em}
.hope i{display:inline-block;font-style:normal;background:#f6cf0b;color:#141412;border:clamp(3px,.5vh,5px) solid #141412;border-radius:999px;padding:.34em .7em .3em;font-size:9.6cqw;white-space:nowrap;margin-bottom:9cqw;box-shadow:0 0 0 0 rgba(246,207,11,.55);animation:beckon 3.2s ease-in-out infinite}
.hope u,.gx u{text-decoration:none;display:inline-block;transition:transform .3s}
.hope:hover i,.hope:focus-visible i{background:#fff}.hope:hover u{transform:translateX(.25em)}
.hope,.alarm,.tresp,.tri{backface-visibility:hidden;-webkit-backface-visibility:hidden}
.gmap{grid-area:map;text-transform:none;transform:rotate(-4deg);filter:drop-shadow(0 14px 22px rgba(0,0,0,.7))}
.gmap svg{display:block;width:100%;height:auto;max-height:58vh}
.gside{grid-area:side;display:flex;flex-direction:column;align-items:center;gap:clamp(10px,2.2vh,24px)}
.alarm{background:#f2f0ea;color:#141412;border:clamp(3px,.55vh,5px) solid #141412;outline:3px solid #141412;outline-offset:-11px;border-radius:9px;padding:clamp(14px,2.6vh,26px) clamp(14px,1.8vw,24px);transform:rotate(4deg);box-shadow:0 14px 30px rgba(0,0,0,.7);line-height:1.08;animation:flick 11s 4s infinite}
.alarm b{display:block;font-size:min(2.9vw,5.4vh)}.alarm span{display:block;font-size:min(1.7vw,3.1vh);letter-spacing:.08em;margin-top:.5em}
.tresp{background:#f6cf0b;color:#141412;border:3px solid #141412;border-radius:7px;padding:.6em .9em;font-size:min(1.5vw,2.6vh);letter-spacing:.06em;transform:rotate(-5deg);box-shadow:0 10px 22px rgba(0,0,0,.6)}
.gbot .tri{width:clamp(34px,6.4vh,62px)}.gbot .tri:first-child{animation-delay:8s}
.gx{flex:1;margin:0;font-size:clamp(11px,1.7vh,14px);font-weight:400;text-transform:none}.gx a{color:#c4c0b6;text-decoration:underline;text-underline-offset:4px}.gx a:hover{color:#fff}
/* upright screens: the way in on top, the map and the alarmed sign side by side beneath it */
@media(max-aspect-ratio:1/1){.gmid{grid-template-columns:1.15fr 1fr;grid-template-areas:"hope hope" "map side";grid-template-rows:auto minmax(0,1fr);align-content:space-evenly}
 .hope{width:min(100%,62vh)}.hope b{font-size:9.7cqw;white-space:nowrap;margin-top:8cqw}.hope b em{display:inline}.hope span{font-size:4.5cqw;margin:.5em 0 .55em}.hope i{font-size:7.2cqw;margin-bottom:8cqw}
 .gmap svg{max-height:30vh}.alarm b{font-size:min(5vw,2.9vh)}.alarm span{font-size:min(3.2vw,1.9vh)}.tresp{font-size:min(2.9vw,1.6vh)}}
/* Slow and small: a brief dip every 9 to 11 seconds, like a faulty fitting, and a gentle glow on the way in. */
@keyframes flick{0%,91%,100%{opacity:1}92%{opacity:.55}93.5%{opacity:1}95%{opacity:.7}96%{opacity:1}}
@keyframes beckon{0%,100%{box-shadow:0 0 0 0 rgba(246,207,11,.5)}50%{box-shadow:0 0 0 .5em rgba(246,207,11,0)}}
@media(prefers-reduced-motion:reduce){.tri,.alarm,.hope i{animation:none}}
/* ---- the Excuse Generator ---- */
.thing.xq{min-height:clamp(170px,26vh,240px);justify-content:center;margin-top:clamp(18px,3vw,30px);max-width:820px}
.thing.xq p{margin:6px 0 0;font-size:clamp(22px,3.4vw,36px);line-height:1.25;font-weight:700;color:var(--text);text-wrap:balance;user-select:text;-webkit-user-select:text}
.xb{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 6px}
.mascot-msg{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;max-width:460px;margin:36px auto 48px}.mascot-msg img{width:min(190px,48vw);height:auto;margin-bottom:6px}.mascot-msg h1{margin:0}.mascot-msg p{margin:0 0 12px}
.mascot-wave{display:block;width:110px;height:auto;margin:26px auto 0}
/* Escape From Aunt Doris: the full escape room (spoof horror). */
.dz{max-width:660px;margin:0 auto}.dz .box{--fc:#fad00c;--pad:clamp(14px,3vw,22px);margin:16px 0 18px}
.dz h2{margin:2px 0 8px;font-size:clamp(20px,4.6vw,26px)}.dz p{line-height:1.5}
.dz .ttl{font-family:Creepster,Montserrat,sans-serif;font-weight:400;color:#c3161c;font-size:clamp(40px,10vw,74px);line-height:.95;letter-spacing:.02em;text-shadow:0 3px 0 #3b0507,0 0 26px rgba(195,22,28,.35);margin:24px 0 6px;text-transform:none}
.dz .chap{text-align:center;padding:30px 10px}.dz .tlogo{margin:6px auto 18px;max-width:560px}.dz .tlogo img{display:block;width:100%;height:auto}.dz .chap .pt{font-size:13px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.dz .chap h2{font-family:Creepster,Montserrat,sans-serif;font-weight:400;color:#c3161c;font-size:clamp(34px,8vw,54px);letter-spacing:.03em;text-transform:none;margin:6px 0 12px}
.dz .coo{font-style:italic;color:#e9d9a0}
.dz .step{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.dz .clues{margin:10px 0;padding-left:20px}.dz .clues li{margin:6px 0;line-height:1.45}
.dz .coats{grid-template-columns:repeat(4,1fr)}@media(max-width:520px){.dz .coats{grid-template-columns:repeat(4,1fr);gap:6px}}
.dz .say{min-height:1.5em;text-align:center;color:var(--muted);margin:4px 0}
.dz .got{display:none;margin:14px 0 4px;padding:12px 14px;border-radius:10px;background:#24231f;border-left:4px solid #fad00c}.dz .got.on{display:block}.dz .got b{color:#fad00c}
.dz .next{display:none;text-align:center}.dz .next.on{display:block}
.dz .hints p{color:#e9d9a0;font-style:italic;margin:8px 0}.dz .hints p.ans,.ep .hints p.ans{font-style:normal;font-weight:700;color:#fad00c}.hint.give{border-color:#c3161c;color:#f2b8b8}
.dz [hidden],.ep [hidden]{display:none!important}
.bnav{display:flex;justify-content:space-between;gap:10px;margin:-4px 0 6px}.bnav .btn{padding:7px 12px;font-size:13px;margin:0}.bnav .btn[hidden]{display:none}
.talk .d{background:#3a1416;border-radius:14px 14px 14px 4px;padding:11px 14px;margin:10px 0;max-width:88%}.talk .d small{display:block;color:#e8a5a7;font-size:12px;margin-bottom:3px}
.talk .opts{display:flex;flex-direction:column;gap:8px;margin:12px 0}.talk .opts button{text-align:left;font-weight:600}
.talk .me{background:#24231f;border-radius:14px 14px 4px 14px;padding:10px 14px;margin:8px 0 8px auto;max-width:80%;text-align:right}
.magnets{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;background:#e9e6df;border-radius:12px;padding:18px 10px;margin:12px 0}.magnets span{display:flex;gap:3px}.magnets i{font:800 26px/1 Montserrat,sans-serif;font-style:normal;padding:4px 6px;border-radius:5px;box-shadow:0 2px 0 rgba(0,0,0,.25)}
.note-y{background:#f6e27a;color:#2a2410;padding:10px 12px;border-radius:3px;transform:rotate(-1.5deg);max-width:300px;margin:8px auto;font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,.3)}
.playlist{background:#141412;border-radius:12px;padding:6px 0;margin:12px 0}.playlist div{display:flex;gap:12px;padding:9px 14px;border-bottom:1px solid #2a2925}.playlist div:last-child{border:0}.playlist b{color:var(--muted);width:18px;font-variant-numeric:tabular-nums}.playlist em{font-style:normal;color:var(--muted);font-size:13px;white-space:nowrap}.playlist b.pl{width:26px;height:26px;border-radius:50%;background:#fad00c;color:#141412;display:flex;align-items:center;justify-content:center;font-size:13px;flex:none}.playlist div{align-items:center}
.rounds{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}.rounds td,.rounds th{border:1px solid #3b3a35;padding:7px 8px;text-align:left}.rounds th{color:var(--muted);font-weight:700}
.photos{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.photos figure{margin:0;background:#f2efe6;color:#2a2622;border-radius:3px;padding:7px 7px 9px;box-shadow:0 3px 8px rgba(0,0,0,.35);font-size:12px;line-height:1.3}.photos figure:nth-child(odd){transform:rotate(-1.5deg)}.photos figure:nth-child(even){transform:rotate(1.2deg)}.photos b{display:flex;align-items:center;justify-content:center;aspect-ratio:1;background:#8b8172;color:#f2efe6;font-size:22px;margin-bottom:6px}.photos small{display:block;color:#6d665c;margin-top:3px}@media(max-width:520px){.photos{grid-template-columns:repeat(2,1fr)}}
.kit{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.kit span{background:#24231f;border:1px solid #3b3a35;border-radius:999px;padding:6px 12px;font-size:14px}
.sting{text-align:center}.sting .txt{margin:14px auto;text-align:left}
.dm{--k:0;display:flex;align-items:center;gap:12px;margin:10px 0 8px;padding:8px 12px;border-radius:10px;background:#24231f;transition:background .4s}
.dmf{width:86px;height:86px;flex:none;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;border-radius:8px;background:#2f2d28}
.dmf img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.dm[data-lv="0"] .dmf img{max-height:46%}.dm[data-lv="1"] .dmf img{max-height:66%}.dm[data-lv="2"] .dmf img{max-height:86%}.dm[data-lv="3"] .dmf img{max-height:none;width:118%;max-width:none;margin-bottom:-10%}
.dml{margin:0;font-size:14px;font-weight:600;line-height:1.35}.dm[data-lv="2"]{background:#33201e}.dm[data-lv="3"]{background:#4a1518}
.hug{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(24,5,7,.95)}.hug[hidden]{display:none}
.hug .in{max-width:420px;text-align:center}.hugpic{width:min(60vw,250px);margin:0 auto}.hugpic img{display:block;width:100%;height:auto;max-height:52vh;object-fit:contain;animation:hugsq 1.1s ease-in-out infinite;transform-origin:50% 90%}
.hug .ttl{font-size:clamp(60px,16vw,110px);margin:4px 0 8px}@keyframes hugsq{0%,100%{transform:scale(1)}50%{transform:scale(1.06,.96)}}
@media (prefers-reduced-motion:reduce){.hugpic img{animation:none}}
/* Escape the Party: a sample paper escape room. One puzzle at a time; each answer opens a padlock. */
.ep{max-width:640px;margin:0 auto}.ep .box{--fc:#fad00c;--pad:clamp(14px,3vw,22px);margin:16px 0 18px}
.ep h2{margin:2px 0 8px;font-size:clamp(20px,4.6vw,26px)}.ep p{line-height:1.5}
.ep .step{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.ep .clues{margin:10px 0;padding-left:20px}.ep .clues li{margin:6px 0;line-height:1.45}
.coats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.coats svg{width:100%;height:auto;display:block;background:#24231f;border-radius:10px}
.txt{background:#24231f;border-radius:14px 14px 14px 4px;padding:11px 14px;max-width:85%;margin:10px 0;line-height:1.45}.txt small{display:block;color:var(--muted);font-size:12px;margin-bottom:3px}
.lock{display:flex;flex-direction:column;align-items:center;gap:12px;margin:18px 0 6px}
.lock svg{width:74px;height:auto;overflow:visible}.lock .sh{transition:transform .5s cubic-bezier(.3,1.6,.5,1)}.lock.open .sh{transform:translateY(-16px)}
.lock.no svg{animation:lockno .45s}@keyframes lockno{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.lock form{display:flex;gap:8px;width:100%;max-width:340px}.lock input{flex:1;min-width:0;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:#141412;color:var(--text);font:700 20px Montserrat,sans-serif;letter-spacing:.18em;text-transform:uppercase;text-align:center}
.lock .btn{margin:0}.ep .say{min-height:1.5em;text-align:center;color:var(--muted);margin:4px 0}
.keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:260px;margin:12px auto}.keys b{display:flex;flex-direction:column;align-items:center;justify-content:center;height:52px;border-radius:10px;background:#24231f;font-size:20px;line-height:1}.keys b small{font-size:10px;letter-spacing:.14em;color:var(--muted);margin-top:3px;font-weight:700}
.ep .hint{margin:0}.ep .hints p{color:#e9d9a0;font-style:italic;margin:8px 0}
@media (prefers-reduced-motion:reduce){.lock .sh{transition:none}.lock.no svg{animation:none}}
/* Vote on the next gag: three cards, each the gag on its range's video background, typed out like the videos. */
.vlead{max-width:640px}
.vgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:20px 0 10px}
@media(max-width:820px){.vgrid{grid-template-columns:1fr;max-width:440px;margin-left:auto;margin-right:auto}}
.vc{--fc:#fad00c;--ft:5px;--fb:18px;--fR:15px;--fr:9px;display:flex;flex-direction:column;transition:opacity .4s,filter .4s}
.vc .art{position:relative;aspect-ratio:1;border-radius:var(--fr) var(--fr) 0 0;overflow:hidden;container-type:inline-size;background:#111}
.vc .art img{position:absolute;inset:0;width:100%;height:100%;display:block}
.vc .gt{position:absolute;left:26.48%;top:37.4%;width:47.13%;text-align:right;font-family:Montserrat,sans-serif;font-weight:400;line-height:1.2;letter-spacing:-.04em;color:#fff;font-size:calc(var(--k,3.9) * 1cqw)}
.vc .gt div{white-space:normal}.vc .gt .ch{visibility:hidden}.vc .gt .ch.on{visibility:visible}
.vc .cap{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 10px}
.vc .cap b{display:block;font-size:16px}.vc .cap span{display:block;font-size:13px;color:var(--muted)}
.vc .cap .btn{margin:0;padding:9px 16px;white-space:nowrap}
.vgrid.done .vc{--fc:#6b6a64;opacity:.55;filter:saturate(.6)}.vgrid.done .vc.mine{--fc:#fad00c;opacity:1;filter:none}
.vgrid.done .vc .btn{display:none}.vc .mine-tag{display:none;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}.vgrid.done .vc.mine .mine-tag{display:block}
.vthanks{display:none;max-width:560px;margin:8px auto 40px;text-align:center}.vthanks.on{display:block}
.vthanks h2{margin:0 0 6px}.vcode{display:inline-flex;align-items:center;gap:10px;margin:14px 0 6px;padding:10px 12px 10px 18px;border:2px dashed #fad00c;border-radius:12px;font:800 22px/1 Montserrat,sans-serif;letter-spacing:.12em}
.vcode .btn{margin:0;padding:8px 14px;font-size:13px;letter-spacing:0}
/* Spot the Introvert: a painting in a frame, with someone hiding in it. The painting gets nearly all of the screen
   (Barry, 21 Nov: "just too small"); everything else is two thin strips above it and two below. */
body.spot main{max-width:none;padding:0;margin:0}.sp [hidden]{display:none!important}
.sp{height:calc(100dvh - var(--hh,63px));min-height:420px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 8px 8px;box-sizing:border-box;background:radial-gradient(ellipse at 50% 40%,#4b4135,#1d1711 85%);color:#f6efe0;-webkit-tap-highlight-color:transparent}
.sp .tp{width:100%;max-width:560px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:0;padding:0 6px;box-sizing:border-box;font-size:13px;font-weight:700;letter-spacing:.04em}
.sp .tp a{justify-self:end;color:#f6efe0;opacity:.85}.sp .tm{font-variant-numeric:tabular-nums;color:#fad00c;font-weight:800}
.sp .br{margin:0;text-align:center;font-weight:700;font-size:clamp(14px,2vh,18px);line-height:1.25;max-width:560px;text-wrap:balance}
.sp .fw{flex:1;min-height:0;width:100%;display:flex;justify-content:center;align-items:center;container-type:size}
.sp .fr{position:relative;box-sizing:border-box;width:min(100cqw,66.6cqh);aspect-ratio:2/3;border:clamp(4px,.9cqh,12px) solid #6a421f;border-color:#8a5a2c #5e3817 #4a2b10 #7a4d24;border-radius:3px;box-shadow:0 0 0 1px #2a1808,0 0 0 2px #b08a48,0 10px 26px rgba(0,0,0,.5);overflow:hidden;cursor:crosshair;touch-action:manipulation;user-select:none}
.sp .fr>img{position:absolute;inset:0;width:100%;height:100%;display:block}
.sp .miss{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;color:#fff;font:800 20px/26px Montserrat,sans-serif;text-align:center;text-shadow:0 1px 4px #000;animation:spmiss 1s forwards}
@keyframes spmiss{0%{opacity:1;transform:scale(1.3)}100%{opacity:0;transform:scale(.8)}}
.sp .ring{position:absolute;border-radius:50%;border:4px solid #fad00c;box-shadow:0 0 0 3px rgba(20,14,6,.7),0 0 22px 6px rgba(250,208,12,.6);pointer-events:none;transform:translate(-50%,-50%)}
.sp .clue{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 200vmax rgba(10,8,5,.62)}
.sp .ms{margin:0;min-height:2.6em;display:flex;align-items:center;text-align:center;font-weight:600;font-size:clamp(14px,2vh,17px);line-height:1.3;max-width:560px;text-wrap:balance}
.sp .bt{width:100%;max-width:560px;margin:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.sp .bt .btn{margin:0;padding:9px 14px;font-size:14px;white-space:nowrap}.sp .bt .btn:disabled{opacity:.3;cursor:default}
.sp .bt #sp0{justify-self:start}.sp .bt #sn{justify-self:end}.sp .bt .mid{display:flex;gap:8px;justify-content:center}
/* The Escape Room itself: one picture of the room filling the screen, with things in it to tap. */
body.room main{max-width:none;padding:0;margin:0}
.rm{position:relative;height:calc(100dvh - var(--hh,63px));min-height:320px;overflow:hidden;background:#17120d;-webkit-tap-highlight-color:transparent}
.rm .bk{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(28px) brightness(.5)}
.rm .rv{position:absolute;display:none}.rm .rv.on{display:block}
.rm .rv>img{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
.hs{position:absolute;display:block;padding:0;margin:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;border-radius:14px;outline:0;transition:background .5s}
.hs:hover,.hs:focus-visible,.hs.lit{background:radial-gradient(ellipse at center,rgba(255,216,130,.3),rgba(255,216,130,.1) 45%,transparent 70%)}
.hs .dot{font-style:normal;position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff3d0;box-shadow:0 0 0 2px rgba(20,14,6,.55),0 0 12px 3px rgba(255,214,120,.75);pointer-events:none}
.hs .dot::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:2px solid #ffe7a6;opacity:0;animation:rmping 7.2s ease-out infinite;animation-delay:var(--d,0s)}
@keyframes rmping{0%{transform:scale(1);opacity:.9}14%{transform:scale(3.4);opacity:0}100%{transform:scale(3.4);opacity:0}}
.hs .lb{position:absolute;bottom:calc(100% + 12px);left:50%;transform:translate(-50%,4px);white-space:nowrap;padding:6px 11px;border-radius:8px;background:rgba(18,14,9,.9);border:1px solid rgba(255,231,166,.4);color:#f6efe0;font-size:13px;font-weight:700;letter-spacing:.02em;line-height:1.2;opacity:0;transition:opacity .3s,transform .3s;box-shadow:0 6px 18px rgba(0,0,0,.45)}
.hs .lb small{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#fad00c;margin-left:8px}
.hs .dot.b .lb{bottom:auto;top:calc(100% + 12px)}
.hs .dot.l .lb{left:-6px;transform:translate(0,4px)}.hs .dot.r .lb{left:auto;right:-6px;transform:translate(0,4px)}
.hs:hover .lb,.hs:focus-visible .lb,.hs.lit .lb,.rm.all .lb{opacity:1;transform:translate(-50%,0)}
.hs:hover .dot.l .lb,.hs:focus-visible .dot.l .lb,.hs.lit .dot.l .lb,.rm.all .dot.l .lb,.hs:hover .dot.r .lb,.hs:focus-visible .dot.r .lb,.hs.lit .dot.r .lb,.rm.all .dot.r .lb{transform:none}
.hs:hover,.hs:focus-visible,.hs.lit{z-index:3}
.rm .rtour{position:absolute;left:14px;bottom:14px;z-index:6;padding:9px 14px;border-radius:999px;border:1px solid rgba(255,231,166,.45);background:rgba(18,14,9,.82);color:#f6efe0;font:700 13px/1 Montserrat,sans-serif;cursor:pointer}
.rm .rmsg{position:absolute;left:50%;bottom:62px;z-index:6;transform:translate(-50%,10px);width:max-content;max-width:min(86vw,460px);padding:13px 18px;border-radius:12px;background:rgba(18,14,9,.94);border:2px solid #fad00c;border-bottom-width:5px;color:#f6efe0;font-size:15px;font-weight:600;line-height:1.4;text-align:center;text-wrap:balance;opacity:0;pointer-events:none;transition:opacity .35s,transform .35s;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.rm .rmsg.on{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion:reduce){.hs .dot::after{animation:none}.hs,.hs .lb,.rm .rmsg{transition:none}}
`;
function page(title, body, opts = {}) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${SHOP_NAME}</title><meta name="description" content="${esc(opts.desc || "Clothing for introverts, quiet people and the reluctantly sociable.")}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ""}<link rel="icon" href="/icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800${opts.font ? "&family=" + opts.font : ""}&display=swap" rel="stylesheet"><style>${STYLE}</style></head><body${opts.body ? ` class="${opts.body}"` : opts.coll && opts.coll !== "IH" ? ` class="r-${opts.coll}" style="--fc:${FRAME[opts.coll] || FRAME.IH}"` : ""}>
<header><div class="wrap"><a href="/uk">${opts.nav === "hub" ? `<img class="wl er" src="/logo-ER-wide.png?v=5" alt="${SHOP_NAME}: ${esc(HUB.name)}">` : (xmasOn() ? `<img class="wl xm" src="/logo-xmas.png?v=1" alt="${SHOP_NAME}">` : `<img class="wl" src="${LOGO}" alt="${SHOP_NAME}">`)}</a>${opts.noBasket ? "" : `<nav class="top"><a href="/uk/shop"${opts.nav === "shop" ? ' class="on"' : ""}>Shop</a><a href="${HUB.path}" data-gate${opts.nav === "hub" ? ' class="on"' : ""}>${esc(HUB.short)}</a><a class="basket-link" href="/uk/basket">Basket <span id="bc">0</span></a></nav>`}</div></header>
<main class="wrap">${opts.nav === "shop" || opts.nav === "home" || opts.coll ? (opts.noXmas ? "" : xmasNotice(false)) : ""}${body}</main>
<footer><div class="wrap"><a href="/terms">Terms</a><a href="/returns">Returns</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href="/?change=1">Change country</a>
<p>Introvert Here is a Mosspit Studios brand. Payments are handled securely by Stripe.</p>${STAMP ? `<p>Preview copy, updated ${esc(STAMP)}.</p>` : ""}</div></footer>
<script>${BASKET_JS}</script>${opts.script ? `<script>${opts.script}</script>` : ""}</body></html>`;
}
const BASKET_JS = `
// The Escape Room's warning gate: links marked data-gate go to the room itself, and a first-time visitor is sent
// through the gate instead. Going through it once (or taking an express route) is remembered on their device.
(function(){var seen=false;try{seen=!!localStorage.getItem('ih_gate')}catch(e){seen=true}
 if(!seen&&location.pathname!=='/uk/escape-room/gate')[].forEach.call(document.querySelectorAll('a[data-gate]'),function(a){a.setAttribute('href','/uk/escape-room/gate')});
 [].forEach.call(document.querySelectorAll('a[data-express]'),function(a){a.addEventListener('click',function(){try{localStorage.setItem('ih_gate','1')}catch(e){}})})})();
var B={get:function(){try{return JSON.parse(localStorage.getItem('ih_basket')||'[]')}catch(e){return[]}},
set:function(b){try{localStorage.setItem('ih_basket',JSON.stringify(b))}catch(e){}B.count()},
count:function(){var n=B.get().reduce(function(a,i){return a+i.qty},0);var el=document.getElementById('bc');if(el)el.textContent=n}};B.count();`;

function countryPage(guess) {
  const opts = [["GB", "United Kingdom"], ["US", "United States"], ["IE", "Ireland"], ["EU", "Elsewhere in Europe"], ["XX", "Somewhere else"]];
  const order = opts.slice().sort((a, b) => (b[0] === guess) - (a[0] === guess));
  return page("Choose your country", `<img class="hero" src="/hero.jpg?v=${ASSET_V}" alt="Introvert Here: quiet humour for socially exhausted people"><div class="centre"><h1>Where are we sending it?</h1>
<p class="muted">Pick your country so we can show you the right prices and delivery.</p></div>
<div class="countries">${order.map(([c, n], i) => `<a class="btn ${i ? "ghost" : ""}" href="/country?c=${c}">${n}${i ? "" : " ✓"}</a>`).join("")}</div>
<p class="centre note">We remember your choice on this device. You can change it at the bottom of any page.</p>`, { noBasket: true });
}

function elsewherePage(c) {
  return page("Buy on Etsy", `<div class="centre"><h1>We don't post there directly yet</h1>
<p>Our own shop only delivers in the UK for now. Every design is also on Etsy, which delivers to you and handles any local tax and duties.</p>
<p><a class="btn" href="${ETSY_SHOP}" rel="noopener">Shop Introvert Here on Etsy →</a></p>
<p class="note"><a href="/?change=1">Choose a different country</a></p></div>`, { noBasket: true });
}

// Each banner is framed in its range logo's own colour (Barry, 20 Nov), so it reads as a sign on the wall, not a patch of it.
const FRAME = { IH: "#f2f0ea", SH: "#a8cea8", PC: "#a7322d", OS: "#e1aa3b", EX: "#d9141b", IP: "#4a8fe7" };
function heroImg(coll) {
  if (coll && COLLECTIONS[coll] && coll !== "IH" && !COLLECTIONS[coll].plain) return `<div class="hero" style="--fc:${FRAME[coll] || FRAME.IH}"><img src="/hero-${coll}.jpg?v=${ASSET_V}" alt="${esc(COLLECTIONS[coll].name)}"></div>`;
  return `<div class="hero"><img src="/hero.jpg?v=${ASSET_V}" alt="Introvert Here: quiet humour for socially exhausted people"></div>`;
}
// The shop is product-led (Barry, 20 Nov): every garment is its own tile and its own page, and the gag is its name.
const TYPE_SLUG = { "T-SHIRT": "t-shirt", "LONG-SLEEVE": "long-sleeve", "SWEATSHIRT": "sweatshirt", "HOODIE": "hoodie" };
const TYPE_PLURAL = { "T-SHIRT": "T-shirts", "LONG-SLEEVE": "Long sleeves", "SWEATSHIRT": "Sweatshirts", "HOODIE": "Hoodies" };
function productSlug(d, t) { return d.slug.slice(0, -d.id.length) + TYPE_SLUG[t] + "-" + d.id.toLowerCase(); }
// The shop shows 24 at a time with a "Show more" button (Barry, 21 Nov), so it stays manageable as the gags pile up.
// ?n= is how many are showing; the button adds the next 24 in place and updates the address, so going back to the
// shop from a product lands on the same spot. Without scripts the button is a plain link to the bigger page.
const SHOP_BATCH = 24;
function shopPage(cat, only, type, n) {
  if (!COLLECTIONS[only]) only = null;
  if (!TYPE_SLUG[type]) type = null;
  const present = [...new Set(cat.designs.map((d) => d.coll))];
  const link = (c, t) => "/uk/shop" + (c || t ? "?" + [c && "c=" + c, t && "t=" + t].filter(Boolean).join("&") : "");
  const tabs = `<nav class="tabs"><a href="${link(null, type)}" class="${only ? "" : "on"}">All ranges</a>${Object.entries(COLLECTIONS).filter(([k]) => present.includes(k)).map(([k, c]) => `<a href="${link(k, type)}" class="${only === k ? "on" : ""}">${esc(c.name)}</a>`).join("")}</nav>`;
  const list = cat.designs.filter((d) => !only || d.coll === only);
  const types = cat.garmentOrder.filter((t) => list.some((d) => d.garments[t]));
  const kinds = `<nav class="tabs kinds"><a href="${link(only, null)}" class="${type ? "" : "on"}">Everything</a>${types.map((t) => `<a href="${link(only, t)}" class="${type === t ? "on" : ""}">${TYPE_PLURAL[t]}</a>`).join("")}</nav>`;
  const items = mixedItems(cat, list, type ? [type] : types), total = items.length;
  n = Math.min(total, Math.max(SHOP_BATCH, Math.ceil((parseInt(n, 10) || 0) / SHOP_BATCH) * SHOP_BATCH));
  const tiles = items.map((it, k) => (k < n ? tileHtml(it) : tileHtml(it).replace('<a class="tile"', '<a class="tile later" hidden'))).join("");
  const moreHref = (m) => link(only, type) + (only || type ? "&" : "?") + "n=" + m;
  // Bottom of the list (Barry, 21 Nov): on the right, the logo's three-dot window is the "Show more" button (an
  // ellipsis means there's more); on the left, "Retreat" takes you back up to the top. When everything is showing,
  // the dots go and the line says so.
  const END = "That’s everything. For now.";
  const more = total > SHOP_BATCH ? `<div class="more"><a class="mv ret" id="mret" href="#"><i><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></b></i><small>Retreat</small></a><span id="mcount">${total > n ? `${n} of ${total}` : END}</span>${total > n ? `<a class="mv dots" id="mbtn" href="${moreHref(n + SHOP_BATCH)}"><i><b><em></em><em></em><em></em></b></i><small>Show more</small></a>` : "<span></span>"}</div>` : "";
  const intro = only ? `<p class="muted">${esc(COLLECTIONS[only].line)}</p>` : `<p class="muted">Clothing for introverts, quiet people and the reluctantly sociable. Free UK delivery on everything.</p>`;
  return page(only ? COLLECTIONS[only].name : "Shop", `${heroImg(only)}<h1>${only ? esc(COLLECTIONS[only].name) : "The shop"}</h1>${intro}${tabs}${kinds}<div class="grid">${tiles || '<p class="muted">Nothing here yet.</p>'}</div>${more}`, { coll: only, nav: "shop", script: total > SHOP_BATCH ? `
(function(){var b=document.getElementById('mbtn'),c=document.getElementById('mcount'),N=${n},T=${total},B=${SHOP_BATCH},busy=false,calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(_){}
document.getElementById('mret').addEventListener('click',function(e){e.preventDefault();var t=document.querySelector('nav.tabs');scrollTo({top:t?Math.max(0,t.getBoundingClientRect().top+scrollY-12):0,behavior:calm?'auto':'smooth'})});
if(b)b.addEventListener('click',function(e){e.preventDefault();if(busy)return;busy=true;b.classList.add('busy');
 // the dots light up one after another for a moment, like someone typing, then the next 24 appear
 setTimeout(function(){var h=document.querySelectorAll('.grid .tile.later[hidden]');for(var k=0;k<B&&k<h.length;k++)h[k].hidden=false;N=Math.min(T,N+B);
  try{var u=new URL(location.href);u.searchParams.set('n',N);history.replaceState(null,'',u)}catch(_){}
  b.classList.remove('busy');busy=false;
  if(N>=T){c.textContent=${JSON.stringify(END)};var sp=document.createElement('span');b.replaceWith(sp);b=null}else{c.textContent=N+' of '+T;var u2=new URL(b.href,location.href);u2.searchParams.set('n',N+B);b.href=u2}},calm?0:900)})})();` : "" });
}
// One list per garment type, newest gag first. With several types they are dealt out in turn (tee, long sleeve,
// sweatshirt, hoodie, ...), each list starting a quarter of the way further on so neighbours are different gags.
function mixedItems(cat, list, types) {
  const per = types.map((t) => list.filter((d) => d.garments[t]).map((d) => ({ d, t })));
  if (per.length === 1) return per[0];
  const turned = per.map((l, k) => { const by = l.length ? Math.round((k * l.length) / per.length) % l.length : 0; return l.slice(by).concat(l.slice(0, by)); });
  const items = [];
  for (let i = 0; turned.some((l) => i < l.length); i++) turned.forEach((l) => { if (i < l.length) items.push(l[i]); });
  return items;
}
function tileHtml({ d, t }) {
  const g = d.garments[t], img = g.tile || (g.images[0] || {}).thumb || "";
  const varies = g.variants.some((v) => v.price !== g.priceFrom);
  return `<a class="tile" style="--fc:${FRAME[d.coll] || FRAME.IH}" href="/uk/p/${productSlug(d, t)}"><img loading="lazy" src="${esc(img)}" alt="${esc(d.title + " " + g.label)}"><div class="cap"><div><b>${esc(d.title)}</b><span>${esc(g.label)}</span><span>${varies ? "from " : ""}${money(g.priceFrom)}</span></div><img class="rl" loading="lazy" src="/logo-${d.coll}.png?v=${ASSET_V}" alt="${esc((COLLECTIONS[d.coll] || {}).name || "")}"></div></a>`;
}

// ---------------- Google Shopping product feed (/google-products.xml) ----------------
// Free product listings on Google (Barry, 22 Nov). Google Merchant Center reads this list; it's built from the
// catalogue, so every new garment appears by itself. One item per colour and size, grouped by garment; each links to
// the product page with that colour and size already chosen, so the price Google shows is the price on the page.
// In Person is left out (each one needs the buyer's name). Delivery is free in the UK.
function googleFeed(cat, origin) {
  const x = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const abs = (u) => (u && u.startsWith("/") ? origin + u : u);
  const items = [];
  for (const d of cat.designs) {
    if (d.coll === "IP") continue;
    const coll = (COLLECTIONS[d.coll] || COLLECTIONS.IH).name.replace(/[.…]+$/, "");
    const gag = String(d.text || "").replace(/^[.…\s]+/, "").replace(/\s*\n+\s*/g, " ").trim();
    for (const t of cat.garmentOrder) {
      const g = d.garments[t]; if (!g) continue;
      const desc = `“${gag}” ${g.label} from the ${coll} range by Introvert Here. ` + String(g.features || "").replace(/•\s*/g, "").replace(/\n+/g, ". ").replace(/\.\./g, ".").replace(/([^.])\s*$/, "$1.") + " Printed to order. Free UK delivery.";
      for (const v of g.variants) {
        const pics = g.images.filter((i) => i.colour === v.colour).map((i) => abs(i.url));
        const img = pics[0] || abs((g.images[0] || {}).url || g.tile);
        if (!img) continue;
        items.push(`<item><g:id>${x(g.code + "-" + v.id)}</g:id><g:item_group_id>${x(g.code)}</g:item_group_id>
<title>${x(`${d.title} ${g.label}, ${v.colour}, ${v.size}`.slice(0, 150))}</title><description>${x(desc.slice(0, 4900))}</description>
<link>${x(origin + "/uk/p/" + productSlug(d, t) + "?colour=" + encodeURIComponent(v.colour) + "&size=" + encodeURIComponent(v.size))}</link>
<g:image_link>${x(img)}</g:image_link>${pics.slice(1, 6).map((u) => `<g:additional_image_link>${x(u)}</g:additional_image_link>`).join("")}
<g:availability>in_stock</g:availability><g:price>${(v.price / 100).toFixed(2)} GBP</g:price><g:brand>Introvert Here</g:brand><g:condition>new</g:condition><g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>${t === "HOODIE" || t === "SWEATSHIRT" ? "1604" : "212"}</g:google_product_category><g:product_type>${x(coll + " > " + g.label)}</g:product_type>
<g:gender>unisex</g:gender><g:age_group>adult</g:age_group><g:color>${x(v.colour)}</g:color><g:size>${x(v.size)}</g:size><g:size_system>UK</g:size_system>
<g:shipping><g:country>GB</g:country><g:price>0.00 GBP</g:price></g:shipping></item>`);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Introvert Here</title><link>${x(origin)}/uk</link><description>Clothing for introverts, quiet people and the reluctantly sociable.</description>\n${items.join("\n")}\n</channel></rss>`;
}

// ---------------- Christmas (Barry, 22 Nov) ----------------
// The gift guide (/uk/gifts) and the order-by notice. The dates are provisional: Printify publishes no UK Christmas
// cut-offs, so they allow a week's printing and Royal Mail's last posting days for UK-printed garments, and longer for
// long sleeves, which are printed abroad. Change them here. The notice shows across the site from XMAS.from (on the
// preview always), and after the last date says it's too late. It disappears after Christmas Day.
const XMAS = { from: "2026-12-01", uk: "2026-12-12", abroad: "2026-12-05", end: "2026-12-25" };
const XMAS_FOR = [   // picked by Barry's gag codes; anything not in the catalogue is skipped. A draft for Barry.
  ["For the colleague who’d rather be on mute", ["PC-00001", "PC-00004", "PC-00003", "PC-00002", "PC-00005"]],
  ["For the friend who always cancels", ["IH-00010", "IH-00012", "IH-00014", "IH-00011", "IH-00003"]],
  ["For the one who’d rather be reading", ["OS-00008", "OS-00067"]],
  ["For the quiet one who’s had quite enough", ["IH-00015", "IH-00006", "SH-00001", "SH-00003", "IH-00001"]],
  ["For someone you love. Quietly.", ["IH-00008", "SH-00002", "IH-00004"]],
];
// The Christmas logo (brand-logos/christmas/) replaces the normal one in the header from XMAS.from to XMAS.end.
function xmasOn() { const t = new Date().toISOString().slice(0, 10); return t <= XMAS.end && (!!STAMP || t >= XMAS.from); }
function xmasDay(d) { const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; const [y, mo, da] = d.split("-").map(Number); return da + " " + m[mo - 1]; }
function xmasNotice(full) {
  const today = new Date().toISOString().slice(0, 10);
  if (today > XMAS.end || (!STAMP && today < XMAS.from)) return "";
  if (today > XMAS.uk) return `<div class="xn"><b>Too late for Christmas.</b> Perfect for avoiding New Year.</div>`;
  const ls = today > XMAS.abroad ? " Long sleeves are now too late." : full ? ` Long sleeves by <b>${xmasDay(XMAS.abroad)}</b> (they’re printed abroad).` : "";
  return `<div class="xn">Order by <b>${xmasDay(XMAS.uk)}</b> for Christmas delivery.${ls}${full ? "" : ` <a href="/uk/gifts">Gift guide →</a>`}</div>`;
}
function giftsPage(cat) {
  const by = Object.fromEntries(cat.designs.map((d) => [d.id, d]));
  const types = cat.garmentOrder;
  const pick = (list, ts, n) => mixedItems(cat, list, ts.filter((t) => list.some((d) => d.garments[t]))).slice(0, n);
  const row = (title, line, items, more) => items.length ? `<section class="strip"><div class="sh"><h2>${title}</h2>${more || ""}</div>${line ? `<p class="muted" style="margin:-8px 0 16px">${line}</p>` : ""}<div class="grid four">${items.map(tileHtml).join("")}</div></section>` : "";
  const notIP = cat.designs.filter((d) => d.coll !== "IP"), ip = cat.designs.filter((d) => d.coll === "IP");
  const fors = XMAS_FOR.map(([t, ids]) => row(t, "", pick(ids.map((i) => by[i]).filter(Boolean), types, 4))).join("");
  return page("Christmas gifts for introverts", `${xmasNotice(true)}<h1 style="margin-top:22px">Gifts for the introvert who’d rather not open them in front of you</h1>
<p class="muted lead">Clothing that says it, so they don’t have to. Free UK delivery on everything. Wrap it, hand it over, leave the room.</p>
${row("Stocking fillers", "T-shirts, from £25.99.", pick(notIP, ["T-SHIRT"], 4), `<a href="/uk/shop?t=T-SHIRT">All T-shirts <i>→</i></a>`)}
${row("Something to hide in", "Sweatshirts and hoodies. Hood up, world off.", pick(notIP, ["HOODIE", "SWEATSHIRT"], 4), `<a href="/uk/shop?t=HOODIE">All hoodies <i>→</i></a>`)}
${row("With their name on", "In Person: their name, printed, so they never have to say it again.", pick(ip, types, 4), `<a href="/uk/shop?c=IP">In Person <i>→</i></a>`)}
${fors}
<section class="strip"><div class="sh"><h2>Not sure?</h2></div><p class="muted">Every design comes in four garments and most come in several colours. Unworn items can be returned within 30 days (except personalised ones). Or let them choose: <a href="/uk/shop">send them the shop</a> and pretend it was your idea.</p></section>`, { nav: "shop", noXmas: true, desc: "Christmas gifts for introverts, quiet people and the reluctantly sociable. Free UK delivery." });
}

// ---------------- front page and the hub ----------------
// One site, two halves of equal weight (Barry, 20 Nov): the shop, and a hub for introverts (phone toys for the bus
// queue, paper escape rooms, a vote on the next gag...). The hub's name and wording are placeholders for Barry.
const HUB = { path: "/uk/escape-room", name: "The Escape Room", short: "Escape Room",   // Barry's name for it (21 Nov)
  logo: "/logo-ER.png?v=6",   // the stacked logo with its DO NOT ENTER door hanger (brand-logos/escape-room/)
  line: "Salvation lies within.", cta: "Enter",   // Barry's wording (21 Nov); "interaction distractions" is his phrase for what's inside
  things: [
    { name: "Look Busy", line: "A very important screen for your phone. Nobody interrupts a person with 3 unread messages from Work.", href: "/uk/escape-room/look-busy" },
    { name: "The Excuse Generator", line: "One tap. One watertight reason you can't make it.", href: "/uk/escape-room/excuses" },
  ] };
// The doors' pictures. Each door can hold several and fades through them, starting somewhere different on every visit.
// Site pictures (not product photos) live in R2 under site/<name>.jpg, served at /s/<name>.jpg; copies in shop/assets/site/.
// Shop door: an introvert hiding in the scenery of a shop. Hub door: someone mid-escape from a party by a ridiculous
// route. (Barry's pictures, 21 Nov; he wants one clear idea, fully committed, deadpan, dark clothes.)
const DOOR = {
  shop: ["mannequins", "clothes-rail", "jumper-shelf", "teddy-bears", "tent"].map((n) => "/s/shop-" + n + ".jpg"),   // Barry's picks
  hub: ["dog-flap", "lawn-crawl", "bathroom-window", "buffet-table", "bedsheets"].map((n) => "/s/escape-" + n + ".jpg") };   // the lengths people go to
const SITE_V = "1";
// How far down each picture the face is, for the wide banner on the hub page (which shows only a band of the picture).
const FOCUS = { "escape-dog-flap": 39, "escape-lawn-crawl": 32, "escape-bathroom-window": 2, "escape-buffet-table": 23, "escape-bedsheets": 17 };
// The pictures of one door, in a fresh order each time; only the first is loaded straight away.
function doorPics(list) {
  const a = list.slice(), by = Math.floor(Math.random() * a.length), turned = a.slice(by).concat(a.slice(0, by));
  return turned.map((u, i) => { const f = FOCUS[u.split("/").pop().replace(".jpg", "")];
    return `<img ${i ? "data-src" : "src"}="${u}?v=${SITE_V}" class="pic${i ? "" : " on"}"${f == null ? "" : ` style="--fy:${f}%"`} alt="">`; }).join("");
}
function hubCards() {
  return HUB.things.map((x) => `<${x.href ? `a href="${x.href}"` : "div"} class="thing"><span class="tag">${x.soon ? "Coming soon" : "Open"}</span><b>${esc(x.name)}</b><span>${esc(x.line)}</span></${x.href ? "a" : "div"}>`).join("");
}
function frontPage(cat) {
  const types = cat.garmentOrder.filter((t) => cat.designs.some((d) => d.garments[t]));
  const newest = mixedItems(cat, cat.designs, types).slice(0, 4).map(tileHtml).join("");
  const present = new Set(cat.designs.map((d) => d.coll));
  const ranges = Object.entries(COLLECTIONS).filter(([k]) => present.has(k)).map(([k, c]) => `<a style="--fc:${FRAME[k] || FRAME.IH}" href="/uk/shop?c=${k}"><span class="lg"><img loading="lazy" src="/logo-${k}.png?v=${ASSET_V}" alt="${esc(c.name)}"></span><b>${esc(c.name)}</b><span>${esc(RANGE_SHORT[k] || "")}</span></a>`).join("");
  const door = (href, pics, label, title, line, cta, badge, gate) => `<div class="door${badge ? " er" : ""}"><span class="fi">${doorPics(pics)}<span class="shade"></span>${badge ? `<img class="badge" src="${badge}" alt="">` : ""}<a class="hit" href="${href}"${gate ? " data-gate" : ""} aria-label="${title}"></a><span class="in"><span class="kicker">${label}</span><b>${title}</b><span class="say">${line}</span><span class="go">${cta} <i>→</i></span>${gate ? `<a class="xp" href="${href}" data-express>Express route (no flashing) <i>→</i></a>` : ""}</span></span></div>`;
  // No banner here (Barry, 21 Nov): one line of type, so the two doors are the first thing on the page.
  // The site's one-line mission statement (Barry, 21 Nov).
  return page("Everything you need to be left the hell alone", `<p class="strap">Everything you need to be left the hell alone.</p>
<section class="doors">
${door("/uk/shop", DOOR.shop, "Wear it", "The Shop", "Clothing that says it, so you don’t have to.", "Go shopping")}
${door(HUB.path, DOOR.hub, "Hide in it", esc(HUB.name), esc(HUB.line), HUB.cta, HUB.logo, true)}
</section>
${STAMP || new Date().toISOString().slice(0, 10) >= XMAS.from && new Date().toISOString().slice(0, 10) <= XMAS.end ? `<a class="xgift" href="/uk/gifts"><b>The Christmas gift guide</b><span>For the introvert who’d rather not open presents in front of you →</span></a>` : ""}
<section class="strip"><div class="sh"><h2>New in the shop</h2><a href="/uk/shop">See everything <i>→</i></a></div><div class="grid four">${newest}</div></section>
<section class="strip"><div class="sh"><h2>Interaction distractions</h2><a href="${HUB.path}" data-gate>Into ${esc(HUB.name)} <i>→</i></a></div><div class="things">${hubCards()}</div></section>
<section class="strip"><div class="sh"><h2>Find your range</h2><a href="/uk/shop">All ranges <i>→</i></a></div><div class="ranges">${ranges}</div></section>`, { nav: "home", script: DOOR_JS });
}
// Doors with more than one picture fade to the next every few seconds (the two doors out of step), unless the visitor
// has asked their device for less motion. The next picture is fetched just before it is needed.
const DOOR_JS = `
(function(){if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 [].forEach.call(document.querySelectorAll('.door'),function(d,n){var p=d.querySelectorAll('img.pic');if(p.length<2)return;var i=0;
  function load(k){var im=p[k%p.length];if(!im.src&&im.dataset.src)im.src=im.dataset.src;return im}
  function next(){var nx=load(i+1);if(!nx.complete||!nx.naturalWidth){setTimeout(next,600);return}
   p[i%p.length].classList.remove('on');i++;nx.classList.add('on');load(i+1);setTimeout(next,6500)}
  setTimeout(function(){load(1);setTimeout(next,2000)},3500+n*2200)})})();`;
// ---------------- interaction distractions ----------------
// The first two things in the Escape Room. All the wording below is a first draft for Barry to edit.

// Look Busy: a full-screen, very important-looking phone screen to stare at while someone decides not to talk to you.
// Tap anywhere for the next one. It is its own bare page (no site header), because it has to pass for the real thing
// at a glance. Everything on it is made up and generic; it copies no real app.
const BUSY = {
  mail: [["Head Office", "URGENT: re: re: fwd: re: the thing"], ["Compliance", "Action required: confirm you have seen this"], ["The Team", "Per my last email"],
    ["IT Helpdesk", "Quick question (47 attachments)"], ["Facilities", "Following up on my follow-up"], ["Calendar", "Reminder: your reminder"],
    ["Head Office", "Can you jump on a call?"], ["Finance", "FINAL_final_v7_ACTUAL.xlsx"], ["The Team", "Do you have five minutes? (It will not be five minutes)"],
    ["Compliance", "Mandatory: please acknowledge the acknowledgement"], ["Head Office", "Did you get my email about my message?"], ["Calendar", "Meeting moved. Again."]],
  chat: ["Are you free?", "Quick one", "It can’t wait", "Did you see my email?", "The one about my message", "Calling you now", "Actually, can you call me", "URGENT", "Ignore that", "No, don’t ignore that"],
  sync: ["Syncing 4,812 items", "Reconciling the figures", "Uploading the big file", "Verifying the verification", "Backing up the backup"],
};
function lookBusyPage() {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Look Busy | ${SHOP_NAME}</title><meta name="description" content="A very important screen for your phone. Nobody interrupts a person with 3 unread messages from Work."><link rel="icon" href="/icon.png">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#101114;color:#e9ebf0;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.scr{position:fixed;inset:0;display:none;flex-direction:column;padding:max(14px,env(safe-area-inset-top)) 0 0}.scr.on{display:flex}
.bar{display:flex;align-items:center;justify-content:space-between;padding:10px 18px 12px;border-bottom:1px solid #262830;font-weight:700;font-size:19px}
.bar small{font-weight:600;font-size:13px;background:#d1232b;color:#fff;border-radius:99px;padding:2px 9px;min-width:30px;text-align:center}
.x{position:fixed;left:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:9;color:#5d606b;font-size:12px;text-decoration:none;padding:8px}
.hint{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);z-index:8;background:rgba(0,0,0,.82);color:#fff;padding:10px 16px;border-radius:99px;font-size:14px;white-space:nowrap;transition:opacity .8s;pointer-events:none}
/* inbox */
#mail .list{flex:1;overflow:hidden}
.row{display:grid;grid-template-columns:10px 1fr auto;gap:2px 10px;padding:12px 18px;border-bottom:1px solid #1d1f26;animation:in .45s ease}
.row i{grid-row:1/3;align-self:center;width:9px;height:9px;border-radius:50%;background:#3d8bff}
.row b{font-size:15px}.row time{font-size:12px;color:#8b8f9c}.row span{grid-column:2/4;font-size:14px;color:#aeb2bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* progress */
#sync{align-items:center;justify-content:center;text-align:center;padding:0 9vw}
#sync h1{font-size:clamp(20px,5.6vw,30px);margin:0 0 8px}#sync p{margin:0;color:#9aa0ad}
.track{width:100%;max-width:440px;height:12px;border-radius:99px;background:#23262e;margin:26px 0 12px;overflow:hidden}.track u{display:block;height:100%;width:3%;background:#3d8bff;border-radius:99px;transition:width 1.6s ease}
#sync em{font-style:normal;font-variant-numeric:tabular-nums;font-size:34px;font-weight:700}
#sync strong{display:block;margin-top:26px;color:#f0b429;font-size:14px;letter-spacing:.08em;text-transform:uppercase}#sync small{display:block;margin-top:8px;color:#9aa0ad;font-size:13px}
/* messages */
#chat .list{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;padding:14px 16px 54px;overflow:hidden}
.bub{align-self:flex-start;max-width:78%;background:#262a35;border-radius:18px 18px 18px 5px;padding:9px 14px;font-size:16px;animation:in .35s ease}
.typing{align-self:flex-start;background:#262a35;border-radius:18px;padding:12px 14px;display:flex;gap:5px}.typing b{width:7px;height:7px;border-radius:50%;background:#8b8f9c;animation:dot 1.2s infinite}.typing b:nth-child(2){animation-delay:.2s}.typing b:nth-child(3){animation-delay:.4s}
/* on a call */
#call{align-items:center;justify-content:center;text-align:center;background:#0c1512}
#call .av{width:112px;height:112px;border-radius:50%;background:#1f3a31;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700;color:#8fd9bd;margin-bottom:22px}
#call h1{margin:0;font-size:30px}#call p{margin:6px 0 0;color:#8fb8a8}#call em{font-style:normal;font-variant-numeric:tabular-nums;font-size:22px;display:block;margin-top:18px}
#call .btns{display:flex;gap:26px;margin-top:44px}#call .btns b{width:62px;height:62px;border-radius:50%;background:#1b2622;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#a9c9bd}#call .btns b.end{background:#c8232b;color:#fff}
/* security code */
#code{align-items:center;justify-content:center;text-align:center;padding:0 8vw}
#code p{margin:0;color:#9aa0ad}#code h1{font-size:clamp(44px,15vw,84px);letter-spacing:.08em;margin:14px 0;font-variant-numeric:tabular-nums}
#code small{color:#f0b429;font-size:15px}
@keyframes in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@keyframes dot{0%,60%,100%{opacity:.3}30%{opacity:1}}
@media(prefers-reduced-motion:reduce){.row,.bub{animation:none}.typing b{animation:none;opacity:.7}.track u{transition:none}}
</style></head><body>
<section class="scr on" id="mail"><div class="bar">Inbox <small id="mc">37</small></div><div class="list" id="ml"></div></section>
<section class="scr" id="sync"><h1 id="st"></h1><p>Step 3 of 9</p><div class="track"><u id="sb"></u></div><em id="sp">3%</em><strong>Do not interrupt</strong><small>Do not switch off your device</small></section>
<section class="scr" id="chat"><div class="bar">Work <small id="cc">3</small></div><div class="list" id="cl"></div></section>
<section class="scr" id="call"><div class="av">HO</div><h1>Head Office</h1><p>On a call · muted</p><em id="ct">14:22</em><div class="btns"><b>Mute</b><b>Keypad</b><b class="end">End</b></div></section>
<section class="scr" id="code"><p>Your security code</p><h1 id="cd">482 913</h1><small>Expires in <span id="ce">0:29</span>. Do not share it. Do not look up.</small></section>
<a class="x" href="${HUB.path}">Exit</a><div class="hint" id="hint">Tap for a different excuse</div>
<script>
var D=${JSON.stringify(BUSY).replace(/</g, "\\u003c")};
function $(i){return document.getElementById(i)}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
var order=['mail','sync','chat','call','code'],at=0,timers=[];
function every(ms,f){timers.push(setInterval(f,ms))}
function stop(){timers.forEach(clearInterval);timers=[]}
function row(m,t){return '<div class="row"><i></i><b>'+m[0]+'</b><time>'+t+'</time><span>'+m[1]+'</span></div>'}
var run={
 mail:function(){var n=37,L=$('ml'),k=0;L.innerHTML=D.mail.slice(0,7).map(function(m,i){return row(m,i?i*3+' min':'now')}).join('');$('mc').textContent=n;
  every(3400,function(){k++;n++;$('mc').textContent=n;L.insertAdjacentHTML('afterbegin',row(D.mail[(6+k)%D.mail.length],'now'));if(L.children.length>12)L.lastChild.remove()})},
 sync:function(){var p=3;$('st').textContent=pick(D.sync);$('sb').style.width='3%';$('sp').textContent='3%';
  // Creeps up to 99% and stalls there for good, now and then slipping back to 98% (Barry, 21 Nov): true to life, and
  // it explains why you are still staring at it ten minutes later.
  var t=0,stuck=false;every(1700,function(){if(!stuck){p=Math.min(99,p+(99-p)*0.06+0.3);stuck=p>=99}else{t++;p=t%7===5||t%7===6?98:99}$('sb').style.width=p+'%';$('sp').textContent=Math.floor(p)+'%'})},
 chat:function(){var L=$('cl'),n=3,k=3;L.innerHTML=D.chat.slice(0,3).map(function(t){return '<div class="bub">'+t+'</div>'}).join('')+'<div class="typing"><b></b><b></b><b></b></div>';$('cc').textContent=n;
  every(3000,function(){var t=L.lastChild;t.insertAdjacentHTML('beforebegin','<div class="bub">'+D.chat[k%D.chat.length]+'</div>');k++;n++;$('cc').textContent=n;if(L.children.length>9)L.firstChild.remove()})},
 call:function(){var s=14*60+22;function show(){$('ct').textContent=Math.floor(s/60)+':'+('0'+s%60).slice(-2)}show();every(1000,function(){s++;show()})},
 code:function(){var s=29;function fresh(){var a=String(100+Math.floor(Math.random()*900)),b=String(100+Math.floor(Math.random()*900));$('cd').textContent=a+' '+b;s=29}
  fresh();every(1000,function(){s--;if(s<0)fresh();$('ce').textContent='0:'+('0'+s).slice(-2)})}
};
function show(i){stop();at=(i+order.length)%order.length;order.forEach(function(id,k){$(id).classList.toggle('on',k===at)});run[order[at]]()}
document.addEventListener('click',function(e){if(e.target.closest('.x'))return;show(at+1);$('hint').style.opacity=0});
setTimeout(function(){$('hint').style.opacity=0},3800);
show(Math.floor(Math.random()*order.length));
</script></body></html>`;
}

// The Excuse Generator: one tap, one completely absurd reason not to go.
// Barry's own (21 Nov). His rule: they must be absolutely absurd.
const EXCUSES = [
  "MY UNCLE’S HATCHING.",
  "I’M DEFROSTING THE VICAR.",
  "THE WARDROBE’S IN LABOUR.",
  "I’VE PROMISED TO WAX THE OCTOPUS.",
  "MY NAN’S GOT INTO THE WALLS AGAIN.",
  "THE BADGER’S ASKED ME TO BE HIS ALIBI.",
  "I’M TEACHING THE LOFT TO SWIM.",
  "THE PRAWNS HAVE CALLED AN EMERGENCY MEETING.",
  "MY SCARECROW NEEDS A LIFT TO WORK.",
  "I’M EXPECTING A CEASEFIRE FROM THE GEESE.",
  "THE FRIDGE HAS PICKED ME FOR JURY DUTY.",
  "I’M REHEARSING MY GRANDFATHER’S NEXT BIRTH.",
  "THE SQUID CAN’T FASTEN HER BRA.",
  "I’VE DOUBLE-BOOKED THE EXORCIST.",
  "MY SHADOW’S HAVING ITS WISDOM TEETH OUT.",
  "I’M TAKING THE LAWN FOR ITS MOT.",
  "THE FERRET’S RENEWING HIS VOWS.",
  "I’M THE DESIGNATED DRIVER FOR A SWARM OF BEES.",
  "THE BISCUIT TIN’S DEMANDING A PATERNITY TEST.",
  "I CAN’T LEAVE WHILE THE CEILING’S STILL MARINATING.",
  "I’M CREOSOTING THE HAMSTER.",
  "MY GRAN’S BEEN RECALLED.",
  "THE LLAMA’S BRIDESMAIDS HAVE PULLED OUT.",
  "I’M WAITING FOR THE PLUMBER TO BLEED THE GIRAFFE.",
  "THE SHED’S GONE BROODY.",
  "I’VE GOT TO PICK MY DAD UP FROM THE TAXIDERMIST.",
  "THE EELS NEED UNTANGLING.",
  "I’M GRAVY BOAT CAPTAIN THIS WEEK.",
  "MY KNEES HAVE FILED FOR SEPARATE CUSTODY.",
  "THE TORTOISE HAS LOCKED HERSELF OUT.",
  "I’M CHAPERONING THE MOTH TO A LAMPSHADE.",
  "MY AUNT’S COME BACK AS A TOASTER.",
  "THE GOLDFISH HAS BEEN SELECTED FOR A LINE-UP.",
  "I’M LETTING THE EXORCIST READ THE METER.",
  "THE PENGUIN’S TROUSERS NEED TAKING UP.",
  "I’M WAITING FOR MY SKELETON TO COOL.",
  "THE CUSTARD’S GOT MY PASSPORT.",
  "I’VE AGREED TO WITNESS THE BADGER’S WILL.",
  "MY OTHER GRAN’S STILL IN THE AIR FRYER.",
  "THE CARPET FITTER WON’T WORK WHILE THE FLOOR’S AWAKE.",
];
function excusesPage() {
  return page("The Excuse Generator", `<p class="label" style="margin-top:26px">${esc(HUB.name)} · Interaction distractions</p><h1 style="margin-top:4px">The Excuse Generator</h1>
<p class="muted lead" style="margin-top:8px">One tap. One watertight reason you can’t make it.</p>
<div class="thing xq"><span class="tag">Your excuse</span><p id="xt" aria-live="polite"></p></div>
<p class="xb"><button class="btn" id="xn" type="button">Give me another</button><button class="btn ghost" id="xc" type="button">Copy</button><button class="btn ghost" id="xs" type="button" hidden>Send it</button></p>
<p class="note" id="xm" style="min-height:1.5em"></p>
<p class="note"><a href="${HUB.path}">← Back to ${esc(HUB.name)}</a> · Need to look occupied as well? <a href="${HUB.path}/look-busy">Look Busy</a></p>`, { nav: "hub", desc: "One tap. One watertight reason you can't make it.", script: `
var X=${JSON.stringify(EXCUSES).replace(/</g, "\\u003c")},last=-1,cur='';
function $(i){return document.getElementById(i)}
function next(){var i;do{i=Math.floor(Math.random()*X.length)}while(i===last&&X.length>1);last=i;cur=X[i];$('xt').textContent=cur;$('xm').textContent=''}
$('xn').addEventListener('click',next);
$('xc').addEventListener('click',function(){var done=function(){$('xm').textContent='Copied. Paste it and put your phone down.'};
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(cur).then(done,function(){$('xm').textContent='Could not copy. Press and hold the excuse to copy it.'});
 else $('xm').textContent='Press and hold the excuse to copy it.'});
if(navigator.share){$('xs').hidden=false;$('xs').addEventListener('click',function(){navigator.share({text:cur}).catch(function(){})})}
next();` });
}

// ---------------- the warning gate ----------------
// The way into the Escape Room (Barry, 21 Nov): a screenful of excessive warnings, drawn here (no pictures), that fits
// the screen without scrolling. The way in is the ENTER HERE in "Abandon hope, all ye who enter here". Nothing flashes
// fast or fills the screen, it all stops for anyone whose device asks for less motion, and an "express route" link
// skips the gate altogether.
const GATE_ICON = {
  skull: '<circle cx="50" cy="52" r="15"/><rect x="41" y="60" width="18" height="11" rx="2"/><circle cx="44" cy="52" r="4.2" fill="#f6cf0b"/><circle cx="56" cy="52" r="4.2" fill="#f6cf0b"/><path d="M47 66v5M50 66v5M53 66v5" stroke="#f6cf0b" stroke-width="1.4"/><path d="M30 74l40 12M70 74L30 86" stroke="#141412" stroke-width="5" stroke-linecap="round"/>',
  rad: '<circle cx="50" cy="62" r="4.5"/>' + [0, 120, 240].map((a) => `<path transform="rotate(${a} 50 62)" d="M50 62 L39.5 43.8 A21 21 0 0 1 60.5 43.8 Z"/>`).join("") + '<circle cx="50" cy="62" r="7" fill="#f6cf0b"/><circle cx="50" cy="62" r="4"/>',
};
GATE_ICON.bolt = '<path d="M55 36L38 64h10l-5 22 19-30H51z"/>';
GATE_ICON.bang = '<rect x="46" y="38" width="8" height="30" rx="3"/><circle cx="50" cy="78" r="5"/>';
const gateTri = (icon, word, r) => `<div class="tri" style="--r:${r}deg"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8L96 92H4Z" fill="#f6cf0b" stroke="#141412" stroke-width="5" stroke-linejoin="round"/><g fill="#141412">${GATE_ICON[icon]}</g></svg>${word ? `<b>${word}</b>` : ""}</div>`;
// "Here be dragons" as a scrap of old sea chart: coast, hills, compass rose, a dotted course, and an arrow to the words.
const GATE_MAP = `<svg viewBox="0 0 360 260" role="img" aria-label="An old sea chart. An arrow points past a sea serpent to the words: Here be dragons.">
<defs><filter id="gpap" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .3  0 0 0 0 .13  0 0 0 .5 -.12"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<radialGradient id="gage" cx="50%" cy="48%" r="62%"><stop offset=".55" stop-color="#7a5524" stop-opacity="0"/><stop offset="1" stop-color="#6b4619" stop-opacity=".55"/></radialGradient>
<path id="gsheet" d="M10 16 34 9 70 15 108 8 150 14 192 9 236 15 280 8 318 14 350 10 354 50 348 92 355 134 349 176 354 216 348 250 312 254 270 248 226 254 182 247 136 254 92 248 50 254 14 249 7 212 13 168 6 126 12 82 7 44Z"/></defs>
<use href="#gsheet" fill="#e9d6a6"/><use href="#gsheet" filter="url(#gpap)"/><use href="#gsheet" fill="url(#gage)"/><use href="#gsheet" fill="none" stroke="#6b4a1f" stroke-width="2.2"/>
<g fill="none" stroke="#5b3d1c" stroke-linecap="round" stroke-linejoin="round">
<g stroke-width=".7" opacity=".4"><path d="M62 58L340 30M62 58L330 250M62 58L190 250M62 58L20 240M62 58L14 26M62 58L200 12"/></g>
<path d="M14 150c12-4 16-22 32-28 14-5 22 6 36 0 12-5 12-22 28-28 13-5 22 4 32-2 8-5 10-14 20-16" stroke-width="2.2"/>
<path d="M14 150c8 10 4 24 18 34 12 8 24 0 38 8 10 6 10 20 24 26 10 4 18 0 26 6" stroke-width="2.2"/>
<path d="M28 146c4 8 2 16 10 24M52 136c2 9 8 14 8 24M78 128c0 10 6 18 4 30M104 112c2 8-2 18 4 26" stroke-width=".8" opacity=".5"/>
<path d="M40 128l9-14 9 14M62 122l10-16 10 16M86 112l8-12 8 12M112 100l7-11 7 11" stroke-width="1.7"/>
<path d="M30 192c2-6 8-6 9 0M50 204c2-6 8-6 9 0M74 214c2-6 8-6 9 0" stroke-width="1.3" opacity=".8"/>
<path d="M44 178q22 16 48 6t50 2 40-10" stroke-dasharray="2.2 7.5" stroke-width="2.4"/>
<path d="M190 168Q198 138 220 118" stroke-width="3"/><path d="M207 117l14 0-3 14" stroke-width="3"/>
<!-- the sea serpent: a head and neck, three humps and a tail, breaking the waves -->
<g stroke-width="7"><path d="M216 222c-3-26 4-46 20-50"/><path d="M246 222q13-30 26 0"/><path d="M280 222q11-24 22 0"/><path d="M310 222q8-18 20-20"/></g>
<path d="M330 202l10-9-1 13" stroke-width="3"/>
<path d="M233 164c6-9 20-9 26-2-4 8-16 12-26 8z" fill="#5b3d1c" stroke-width="2"/>
<path d="M259 164l10-4M259 165l10 3" stroke="#a3231c" stroke-width="1.8"/>
<path d="M236 160l-4-8 8 5M243 158l-2-9 7 6" stroke-width="1.6" fill="#5b3d1c"/>
<path d="M200 226q7-6 14 0t14 0 14 0 14 0 14 0 14 0 14 0 14 0 14 0 14 0" stroke-width="1.6"/>
<path d="M214 238q7-6 14 0t14 0 14 0 14 0 14 0 14 0 14 0" stroke-width="1.3" opacity=".7"/>
<path d="M150 208q7-6 14 0t14 0M252 132q6-5 12 0t12 0M300 150q6-5 12 0t12 0" stroke-width="1.2" opacity=".6"/>
</g>
<circle cx="248" cy="165" r="1.7" fill="#e9d6a6"/>
<!-- a small ship, and the compass rose -->
<g stroke="#5b3d1c" stroke-width="1.6" stroke-linejoin="round" fill="#5b3d1c"><path d="M150 198h24l-5 8h-14z"/><path d="M162 198v-18" fill="none"/><path d="M163 181q11 6 0 14z" fill="#e9d6a6"/></g>
<g transform="translate(62 58)" stroke="#5b3d1c" stroke-width="1.5" fill="none"><circle r="23"/><circle r="17" stroke-width=".8"/><path d="M0-31L6 0 0 31-6 0Z" fill="#5b3d1c"/><path d="M-31 0L0-6 31 0 0 6Z" fill="#e9d6a6"/><path d="M-15-15L3 0-15 15M15-15L-3 0 15 15" stroke-width=".9"/></g>
<g font-family="Georgia,'Times New Roman',serif" font-style="italic" fill="#3d2810">
<text x="62" y="20" text-anchor="middle" font-size="12" font-style="normal">N</text>
<text x="34" y="196" font-size="10.5">you are here</text>
<text x="96" y="244" font-size="9.5" letter-spacing="3" opacity=".75">MARE INCOGNITVM</text>
<text x="262" y="60" text-anchor="middle" font-weight="700" font-size="25">Here be</text>
<text x="262" y="93" text-anchor="middle" font-weight="700" font-size="33" textLength="118" lengthAdjust="spacingAndGlyphs">dragons</text></g>
<path d="M38 172l9 9M47 172l-9 9" stroke="#a3231c" stroke-width="2.8" stroke-linecap="round"/>
</svg>`;
function gatePage() {
  return page("Abandon hope", `<div class="gate">
<div class="tape" aria-hidden="true"></div>
<div class="gtop">${gateTri("skull", "Danger", -7)}<p class="gk">You are approaching ${esc(HUB.name)}</p>${gateTri("rad", "Warning", 6)}</div>
<div class="gmid">
<a class="hope" id="enter" href="${HUB.path}"><b><em>Abandon</em> <em>hope</em></b><span>all ye who</span><i>Enter here <u>→</u></i></a>
<div class="gmap">${GATE_MAP}</div>
<div class="gside"><div class="alarm"><b>This door is alarmed.</b><span>So is the occupant.</span></div><div class="tresp">Trespassers will be ignored</div></div>
</div>
<div class="gtop gbot">${gateTri("bolt", "", 5)}<p class="gx"><a href="${HUB.path}" id="express">Express route (no flashing) <u>→</u></a></p>${gateTri("bang", "", -6)}</div>
<div class="tape" aria-hidden="true"></div></div>`, { nav: "hub", body: "gate", noindex: true, script: `
// remember that this visitor has been through the gate, so later visits can go straight in
[].forEach.call(document.querySelectorAll('#enter,#express'),function(a){a.addEventListener('click',function(){try{localStorage.setItem('ih_gate','1')}catch(e){}})});` });
}
// ---------------- Escape From Aunt Doris (the full paper escape room) ----------------
// Barry's title (21 Nov); made bigger (13 puzzles) for selling at £4.99. Aunt Doris (your cousin Gareth's mum) stalks you through Gareth's housewarming; what she
// wants is a hug. Every wrong answer brings her a step closer; the fourth is a hug (and 5 minutes on your time).
// Thirteen puzzles in three parts, about 35 to 50 minutes; Part One (1 to 3) is to be free. Puzzles 1 to 12 each add
// something to your kit; their first letters spell the code for your own front door at the end: DO NOT DISTURB. Progress is saved on the player's device. Doris is Barry's (brand-logos/doris/, R2 site/doris-N.png):
// frames 1 to 4 as she gets closer, doris-hug.png (her crushing the mascot) on the hug screen. The title
// is his (brand-logos/aunt-doris/, R2 site/doris-title.png). All wording is a draft for Barry.
const DZ_COATS = [["#a7322d", 1, 2, 14], ["#4d7a3a", 1, 4, 27], ["#26355c", 0, 5, 31], ["#8c8c88", 1, 3, 42], ["#26355c", 1, 4, 53], ["#111111", 1, 1, 66], ["#26355c", 1, 6, 75], ["#8c8c88", 1, 4, 89]];
const DZ_PHOTOS = [["Elf costume, howling", "Christmas, aged 2"], ["Paddling pool, giggling", "Summer, aged 3"], ["Sheep in the nativity, sobbing", "Christmas, aged 4"], ["The bowl haircut, scowling", "Spring, aged 4"],
  ["In a little suit at a wedding, in floods of tears", "Summer, aged 3"], ["Pirate at a party, grinning", "Summer, aged 4"], ["Sailor suit at the seaside, wailing", "Summer, aged 4"], ["Pumpkin costume, wailing", "Autumn, aged 4"]];
const DZ_KEYS = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", ""], ["#", ""]];
function dorisPage() {
  const lock = (ph, num) => `<div class="lock">${PARTY_LOCK}<form><input name="a" autocomplete="off" autocapitalize="characters" ${num ? 'inputmode="numeric"' : ""} placeholder="${ph}" aria-label="Your answer"><button class="btn" type="submit">Try it</button></form></div>`;
  const meter = `<div class="dm" data-lv="0"><div class="dmf"><img src="/s/doris-1.png?v=1" alt="Aunt Doris"></div><p class="dml">Aunt Doris is at the far end of the room.</p></div>`;
  const tail = `<p class="say" role="status" aria-live="polite"></p><div class="got"></div><div class="hints"></div><p style="text-align:center" class="hintp"><button class="btn ghost hint" type="button">Hint, please</button></p><p class="next"><button class="btn go" type="button">Carry on</button></p>`;
  const chap = (pt, title, body) => `<section class="box pz chap" hidden><p class="pt">${pt}</p><h2>${title}</h2>${body}<p><button class="btn go" type="button">Carry on</button></p></section>`;
  const pz = (n, title, h, body) => `<section class="box pz" data-n="${n}" hidden><p class="step">${n} of 13 · ${title}</p>${meter}<h2>${h}</h2>${body}${tail}</section>`;
  const mag = (w, cols) => `<span>${[...w].map((c, i) => `<i style="background:${cols[i % cols.length]};color:#fff">${c}</i>`).join("")}</span>`;
  const steps = [
    `<section class="box pz chap" data-intro><h1 class="tlogo"><img src="/s/doris-title.png?v=1" alt="Introvert Here: Escape From Aunt Doris" width="1200" height="662"></h1>
<p>It’s 8pm. Your cousin Gareth’s housewarming. You promised you’d show your face. Your face has been shown.</p><p>Now you need to get home. Unseen. Unchatted-to. Unhugged.</p><p class="coo">Because somewhere in this house is Gareth’s mum. Aunt Doris.</p>
<p><button class="btn go" type="button" id="start">Begin</button></p><p class="note" id="resume" hidden><button class="btn ghost" type="button" id="carry">Carry on where you left off</button></p><p class="note">Your progress is saved on this device.</p></section>`,
    chap("Part one", "She has arrived", `<p class="coo">From the hallway, a voice like a car alarm in a cardigan: “Coo-ee!”</p>`),
    pz(1, "The coat pile", "Find your coat.", `<p>Every coat in the house is heaped on the spare bed. Yours is in there somewhere.</p>
<ul class="clues"><li>It has a hood. (Hoods are for hiding in.)</li><li>It isn’t green.</li><li>It has more buttons than the red one.</li><li>It isn’t grey. Grey coats belong to Aunt Doris. Never touch Aunt Doris’s coats.</li><li>Its tag number is under 60.</li></ul>
<div class="coats">${DZ_COATS.map(partyCoat).join("")}</div>${lock("Tag number", 1)}`),
    `<section class="box pz talk" data-n="2" hidden><p class="step">2 of 13 · Cornered</p>${meter}<h2>She’s found you.</h2><p>You turn round with your coat and there she is, between you and the door. Her arms are already starting to open.</p><div id="tk"></div>${tail}</section>`,
    pz(3, "The dead phone", "Charge your phone.", `<p>Your phone is on 2%. Gareth’s chargers live in a kitchen drawer with a three-digit lock, and there’s a note stuck to it:</p>
<div class="note-y">Charger drawer! Code’s on the fridge. Sorry, the kids keep moving the letters. G x</div><p>The fridge:</p>
<div class="magnets">${mag("ENO", ["#c3161c", "#2a62c9", "#e1aa3b"])}${mag("XSI", ["#3f8a3a", "#c3161c", "#2a62c9"])}${mag("NNIE", ["#e1aa3b", "#3f8a3a", "#c3161c", "#2a62c9"])}</div>${lock("Drawer code", 1)}`),
    chap("Part two", "She’s got the photo album", `<p class="coo">Doris is asking Gareth if he’s seen you. Gareth says you were here a minute ago. Thanks, Gareth.</p><p class="coo">Then, from the conservatory: “Ooh, everyone, come and look at these!”</p>`),
    pz(4, "The photo album", "Steal the evidence.", `<p>Doris has the family album open on the coffee table and a small crowd round her. She’s working up to your baby photos, and she’s saving “the best one” for last. It’s on this page. You have one chance to slip it out while she’s pouring a sherry.</p>
<div class="photos">${DZ_PHOTOS.map(([cap, yr], i) => `<figure><b>${i + 1}</b><figcaption>${cap}<small>${yr}</small></figcaption></figure>`).join("")}</div>
<div class="txt" style="background:#3a1416"><small>Aunt Doris, to the room</small>Wait till you see this one. All dressed up, the little love, and crying their eyes out. It was the summer before they started school.</div>
<div class="txt"><small>Gareth, muttering</small>We both started school the September after we turned four. She always gets that wrong.</div>
<p>Which photo do you take?</p>${lock("Number", 1)}`),
    pz(5, "The tea round", "Make the teas.", `<p>You’re halfway to the back door when Doris spots you. “Ooh, you’re near the kettle! Be a love and do the teas.” Then she reels off the orders, and goes to find a plate for the biscuits.</p>
<div class="txt" style="background:#3a1416"><small>Aunt Doris</small>Mine’s milk and two sugars. Gareth has the same as me, he always has. Our Dave has one less than Gareth, he’s cutting down for his marathon. Uncle Mike has double whatever Dave has. And your Gran has as many as the rest of us put together, she’s ninety-four, she can do what she likes.</div>
<div class="txt"><small>Gran, from her chair</small>I can’t have sugar, I’m diabetic. She knows that. Give me sweeteners instead. However many sugars she just said for me, that many sweeteners.</div>
<div class="txt"><small>Gareth, passing</small>Dad’s off sugar too since his check-up. Same for him: sweeteners instead, the number Mum said.</div>
<p>How many sugars go on the tray, and how many sweeteners? (Sugars first, then sweeteners.)</p>${lock("Sugars, sweeteners", 1)}`),
    pz(6, "Charades", "Guess the phrase.", `<p>Uncle Mike has started a game of charades in the living room, and you’ve been put on Doris’s team. Nobody can leave until your team gets one right. Uncle Mike stands up.</p>
<ul class="clues"><li>He holds up three fingers. Three words.</li><li>First word: he holds his arm up like a branch, then flutters his fingers slowly down to the carpet.</li><li>Second word: he points at himself.</li><li>Third word: he tugs his ear. Then he takes out his wallet, hands Gareth a fiver, and wags his finger: he wants it back.</li></ul>
<div class="txt" style="background:#3a1416"><small>Aunt Doris</small>Autumn! Tree! Falling over! Paying the milkman!</div><p>What’s the phrase?</p>${lock("The phrase", 0)}`),
    pz(7, "The group photo", "Stay out of the picture.", `<p>“Family photo! Everyone in the garden!” Gareth is setting up his phone on a wall. The only way to stay out of it is to stand directly behind somebody tall enough to hide you.</p>
<ul class="clues"><li>Uncle Mike is the tallest of them all, but he’s done his back in, so he’s sitting on a chair at the front.</li><li>Gran is in a chair at the front too.</li><li>Cousin Dave is taller than Aunt Doris, and shorter than Gareth.</li><li>Doris has her heels on tonight, which make her two inches taller than Dave.</li><li>Even in heels, she’s shorter than Gareth.</li><li>Gareth sets a ten-second timer, then runs round and kneels at the front, next to Gran.</li></ul><p>Who do you stand behind?</p>${lock("Their name", 0)}`),
    pz(8, "Sam’s text", "Get your story straight.", `<p>Your phone buzzes. It’s Sam, the only friend who gets it, with your excuse for leaving. Sam’s phone has a fault: every letter comes out shifted along the alphabet by the same number of places. Sam has never fixed it. Sam signs every message.</p>
<div class="txt"><small>Sam</small>VDB WKH ERLOHU LV OHDNLQJ<br>— VDP</div><p>What’s broken at your house tonight? (One word.)</p>${lock("One word", 0)}`),
    pz(9, "The exits", "Choose your way out.", `<p>There are five ways out: the front door, the kitchen door, the garden door, the garage, and the window in the downstairs loo. Four of them are guarded:</p>
<ul class="clues"><li><b>Gareth</b> hasn’t left his sourdough starter all night. It lives by the kitchen door.</li><li><b>Cousin Dave</b> is doing calf stretches for his marathon, somewhere he can feel grass under his feet.</li><li><b>Uncle Mike</b> is standing next to his new car, waiting for someone to ask about it.</li><li><b>Aunt Doris</b> has positioned herself where she can catch everyone on their way out, and she would never, ever stand near a toilet.</li></ul><p>Which way do you go?</p>${lock("Your exit", 0)}`),
    pz(10, "The playlist", "Wait for the slow one.", `<p>When the slow song comes on, everyone pairs off in the living room and nobody watches the hall. Gareth’s speaker is showing tonight’s playlist, A to Z. Shuffle is on: the number on the right of each song is the order it will actually play in. The first song started at exactly 10:00.</p>
<div class="playlist"><div><span style="flex:1">Grab Your Partner, Don’t Grab Me</span><em>3:00</em><em>120 bpm</em><b class="pl">7</b></div><div><span style="flex:1">Hold Me Closer, Auntie</span><em>4:00</em><em>64 bpm</em><b class="pl">6</b></div><div><span style="flex:1">Let’s All Go Round Gareth’s</span><em>3:00</em><em>118 bpm</em><b class="pl">2</b></div><div><span style="flex:1">Nobody Leaves This Party</span><em>4:00</em><em>126 bpm</em><b class="pl">8</b></div><div><span style="flex:1">Oh No, It’s the Conga</span><em>5:00</em><em>132 bpm</em><b class="pl">3</b></div><div><span style="flex:1">Shots! Shots! Shots! (Doris Remix)</span><em>3:00</em><em>128 bpm</em><b class="pl">5</b></div><div><span style="flex:1">Small Talk (Extended Mix)</span><em>4:00</em><em>124 bpm</em><b class="pl">1</b></div><div><span style="flex:1">Who Brought the Ukulele?</span><em>2:00</em><em>140 bpm</em><b class="pl">4</b></div></div><p>What time does the slow song start? (Type it like 10:30.)</p>${lock("Time", 0)}`),
    chap("Part three", "Don’t look behind you", `<p class="coo">She’s checked the garden. She’s checked the loo queue. She is now checking the coats. She will notice one is missing.</p><p>Time to go.</p>`),
    pz(11, "The hallway", "Time your run.", `<p>To reach the loo window you have to cross the hall, and four people keep walking through it, exactly on these minutes:</p>
<table class="rounds"><tr><th>Who</th><th>Walks through the hall at</th></tr><tr><td>Gareth</td><td>10:00, then every 3 minutes</td></tr><tr><td>Aunt Doris</td><td>10:01, then every 4 minutes</td></tr><tr><td>Cousin Dave</td><td>10:00, then every 5 minutes</td></tr><tr><td>Pat, Gran’s carer</td><td>10:02, then every 6 minutes</td></tr></table>
<p>You need a minute while the slow song is playing when none of them is in the hall. You know when it starts. The playlist says how long it lasts.</p><p>What time do you go? (Type it like 10:30.)</p>${lock("Time", 0)}`),
    pz(12, "The back gate", "Crack the gate code.", `<p>You’re out of the window and into the garden. The back gate has a keypad. Your phone buzzes:</p>
<div class="txt"><small>Sam</small>Gate code is the word on the back of something in your pocket. Four letters. Type it on the keypad.</div>
<div class="keys" aria-hidden="true">${DZ_KEYS.map(([n, l]) => `<b>${n}<small>${l || "&nbsp;"}</small></b>`).join("")}</div>${lock("4-digit code", 1)}`),
    pz(13, "Your front door", "One last code.", `<p>The night bus drops you at the end of your road. Your street. Your door. Your own keypad.</p><p>You set this code years ago. It’s the sign you’d hang on your whole life, if you could. And tonight, you’ve been collecting it all along.</p>
<p>Your kit, in the order you got it:</p><div class="kit" id="kitlist"></div>${lock("Your code", 0)}`),
    `<section class="box pz sting" data-end hidden><p class="pt step">The end</p><h2>You’re home.</h2><p>Door locked. Kettle on. Hood up. On the handle, the sign goes up: DO NOT DISTURB. Nobody knows you’ve gone.</p><p id="won"></p>
<p>And then your phone buzzes.</p><div class="txt"><small>Aunt Doris</small>Lovely to see you!! Same time at Christmas? xx</div><h2 class="ttl" style="font-size:clamp(34px,8vw,54px)">She’ll be back.</h2>
<p style="text-align:center"><button class="btn ghost" type="button" id="again">Play again</button> <a class="btn" href="${HUB.path}">Back to the room</a></p></section>`,
  ];
  const hug = `<div class="hug" id="hug" hidden role="dialog" aria-label="Caught"><div class="in"><div class="hugpic"><img src="/s/doris-hug.png?v=1" alt="Aunt Doris, eyes shut and beaming, crushing you in a hug, your feet off the ground"></div><p class="ttl">Hug.</p><p>She holds on. And holds on. “Ooh, it’s so lovely to see you! You’ve lost weight! Have you met anyone?”</p><p>Five minutes later, she lets go.</p><p class="note">+5 minutes on your time</p><p><button class="btn" type="button" id="hugok">Back away slowly</button></p></div></div>`;
  return page("Escape From Aunt Doris", `<div class="dz">${steps.join("")}${hug}<p class="note"><a href="${HUB.path}">← Back to the room</a></p></div>`, { nav: "hub", font: "Creepster", desc: "Escape From Aunt Doris: a spoof horror escape room for people who'd rather be at home.", script: `
(function(){var $=function(q,r){return (r||document).querySelector(q)},$$=function(q,r){return [].slice.call((r||document).querySelectorAll(q))};
var S=$$('.pz'),cur=0,st={at:0,ms:0,hints:0,done:{}},t0=0;
// answers (letters and digits only), what each puzzle leaves you with, wrong-answer lines, and two hints each
var P={
1:{a:/^53$/,got:['D','Disguise','Your coat. Hood up. You are now nobody.'],no:['That coat belongs to someone who enjoys parties.','Not yours. It smells of networking.','No. Read the clues again. Quietly.'],h:['Cross out the coats with no hood, then the green one and the grey ones. The red coat has two buttons.','It’s the navy coat with a hood and four buttons: tag 53.']},
2:{got:['O','One-word answers','You’ve found the most powerful weapon there is. You will use it sparingly. In one word.'],h:['Short, closed answers. Never give her a topic, a question, or a day of the week.','Mm. It’s fine. I’ve got a bad knee. Lovely to see you too.']},
3:{a:/^169$/,got:['N','Night bus','Phone charged. The last night bus leaves at 11:04. Plenty of time. Probably.'],no:['The drawer doesn’t budge. Somewhere, Doris laughs.','Click. Nothing. The kids have a lot to answer for.','No. Unscramble the fridge.'],h:['Each group of magnets is a number with its letters jumbled up.','ONE, SIX, NINE: the code is 169.']},
4:{a:/^7$/,got:['O','Old photo','It slides out of the sleeve and into your pocket. On the back, in Doris’s handwriting, one word is underlined three times: “Wouldn’t leave the house, even then. Happiest at HOME.” Doris turns the page to find a gap. “Well, I never.”'],no:['That’s not the one. Doris is nearly at the end of her sherry.','Wrong photo. Everyone saw you take it. Put it back. Smile.','No. Doris and Gareth have told you everything you need.'],h:['Dressed up, crying, and the summer before starting school. Gareth says when school started.','Starting school the September after turning four means the summer you were four. Dressed up and crying, summer, aged 4: photo 7.']},
5:{a:/^59$/,got:['T','Tupperware','Teas done, every one right. Gareth’s partner presses a tub of leftovers into your hands as thanks. You slip out of the kitchen with it.'],no:['Gran sends hers back. “I said sweeteners.”','Uncle Mike looks at his tea, then at his belly, then at you.','No. Two numbers: sugars first, then sweeteners.'],h:['Work out everyone’s number first, then sort them into sugars and sweeteners. Gran’s number is everyone else’s added up.','Doris 2, Gareth 2, Dave 1, Mike 2, Gran 7. Mike and Gran have sweeteners: 9. Sugars: 5. Type 59.']},
6:{a:/LEAVEMEALONE/,got:['D','Distraction','“LEAVE ME ALONE!” Doris shrieks it at the top of her voice, delighted to have got one. Every head turns to her. Not one turns to you.'],no:['No. Uncle Mike does the whole thing again, slower.','Doris shouts “Bananas!” for no reason. Wrong, but so are you.','Not quite. Each mime is one word, and the ear tug means “sounds like”.'],h:['Word one is what falls from a tree. Word two is easy. Word three sounds like something you borrow and pay back.','A leaf falling: LEAVE. Pointing at himself: ME. Sounds like “a loan”: ALONE. LEAVE ME ALONE.']},
7:{a:/DORIS/,got:['I','Invisibility','Click. You’re tucked in behind Aunt Doris’s perm, the one place in the house she’ll never look. The photo will go on her mantelpiece. You won’t be in it.'],no:['Click. There you are, in the middle, mid-blink. Doris wants a copy.','Click. They weren’t standing at the back. Your whole head is showing.','No. Work out who will actually be standing at the back when the timer goes.'],h:['Mike and Gran are sitting, and Gareth will be kneeling at the front once he’s run back from the timer.','That leaves Dave and Doris standing. In heels, Doris is taller. Stand behind Aunt Doris.']},
8:{a:/^BOILER$/,got:['S','Story','Your cover story: a leaking boiler. Nobody has ever questioned a boiler.'],no:['That’s not what it says. Sam would be disappointed.','No. Work out how far the letters have moved first.','Not quite. Sam always signs off.'],h:['Sam signs every message. Compare the letters of the signature with SAM.','S became V: every letter is three places along. Move each one back three: SAY THE BOILER IS LEAKING.']},
9:{a:/LOO|WINDOW|TOILET|BATHROOM|WC|LAV/,got:['T','Toilet window','The downstairs loo window. Small, but so are your social ambitions.'],no:['Someone’s guarding that one. They’ve seen you.','Too risky. Somebody would want a chat.','No. Think about who’s standing where.'],h:['Gareth has the kitchen door, Dave the garden, Mike the garage.','Doris is at the front door saying goodbye to everyone. That leaves the downstairs loo window.']},
10:{a:/^(1017|1017PM)$/,got:['U','Unwatched hall','10:17: “Hold Me Closer, Auntie”. Everyone pairs off. Nobody is watching the hall.'],no:['That’s the conga. Somebody grabs your waist.','No. Shuffle is on: go by the play order, not the list.','Not quite. Add up the songs that play before it.'],h:['The slow song is the one with by far the lowest bpm. Shuffle is on, so use the yellow numbers, not the list.','Plays 1 to 5 are Small Talk, Gareth’s, the Conga, the Ukulele and Shots: 4 + 3 + 5 + 2 + 3 = 17 minutes. It starts at 10:17.']},
11:{a:/^(1019|19|1019PM)$/,got:['R','Run','10:19. Nobody in the hall. You run. Quietly.'],no:['Gareth walks straight into you. “Off already?”','Doris rounds the corner. You freeze. She doesn’t see you. This time.','No. List who is in the hall each minute while the slow song plays.'],h:['The slow song starts at 10:17 and lasts 4 minutes, so it plays from 10:17 to 10:21. List who is in the hall each minute.','Gareth 10:18 and 10:21, Doris 10:17 and 10:21, Dave 10:20, Pat 10:20. That leaves 10:19.']},
12:{a:/^4663$/,got:['B','Back gate','The gate clicks open. At the end of the road, the night bus is just pulling in.'],no:['The gate stays shut. The dog next door starts barking.','Beep. Wrong. Very loud beep.','No. Check your pockets. Then the letters on the keypad.'],h:['It’s the word Doris underlined on the back of the photo you took.','HOME: H is 4, O is 6, M is 6, E is 3. The code is 4663.']},
13:{a:/^DONOTDISTURB$/,no:['The door stays locked. You’re so close you can smell the teabags.','No. Look at your kit.','Not quite. Take the first letter of each thing, in order.'],h:['Take the first letter of each thing in your kit, in order.','DO NOT DISTURB.']}};
// Aunt Doris walks towards you: each wrong answer is a step closer; the fourth is a hug. Hints are free.
var DL=['Aunt Doris is at the far end of the room.','“Coo-ee!” She’s spotted you.','She’s weaving through the guests towards you.','Arms open. One more wrong move.'];
function setLv(m,lv){m.dataset.lv=lv;$('img',m).src='/s/doris-'+(lv+1)+'.png?v=1';$('.dml',m).textContent=DL[lv]}
[1,2,3,4,'hug'].forEach(function(k){new Image().src='/s/doris-'+k+'.png?v=1'});
function closer(s){var m=$('.dm',s);if(!m)return;var lv=+m.dataset.lv+1;if(lv>=4){lv=0;tick();st.ms+=300000;save();$('#hug').hidden=false;$('#hugok').focus()}setLv(m,lv)}
$('#hugok').addEventListener('click',function(){$('#hug').hidden=true});
function save(){try{localStorage.setItem('ih_doris',JSON.stringify(st))}catch(_){}}
function load(){try{return JSON.parse(localStorage.getItem('ih_doris')||'null')}catch(_){return null}}
function fmt(ms){var m=Math.floor(ms/60000),s=Math.round(ms/1000)%60;return m+' min '+s+' sec'}
function tick(){if(t0){st.ms+=Date.now()-t0;t0=Date.now()}}
function show(i){tick();cur=i;st.at=i;st.max=Math.max(st.max||0,i);save();S.forEach(function(s,k){s.hidden=k!==i});var s=S[i];var fw=$('.bnav .fw',s);if(fw)fw.hidden=i>=st.max;if(s.dataset.n&&st.done[s.dataset.n]&&!s.dataset.r)looksSolved(s);var bk=$('.bnav .bk',s);if(bk)bk.hidden=i<=1;if(i>0&&!t0)t0=Date.now();var dm=$('.dm',s);if(dm)setLv(dm,0);
 if(s.dataset.n==='2'&&!st.done['2'])talkStart();if(s.dataset.n==='13')$('#kitlist').innerHTML=['1','2','3','4','5','6','7','8','9','10','11','12'].map(function(k){return '<span>'+P[k].got[1]+'</span>'}).join('');
 if(s.hasAttribute('data-end')){st.fin=1;save();$('#won').textContent='Time: '+fmt(st.ms)+'. Hints used: '+st.hints+'.';t0=0}
 window.scrollTo(0,Math.max(0,s.getBoundingClientRect().top+scrollY-90));var inp=$('input',s);if(inp)setTimeout(function(){inp.focus({preventScroll:true})},300)}
function looksSolved(s){var n=s.dataset.n,p=P[n];s.dataset.r=1;$('.say',s).textContent='';var l=$('.lock',s);if(l)l.classList.add('open');$('.hintp',s).hidden=true;
 if(p.got){var g=$('.got',s);g.innerHTML='<b>Added to your kit: '+p.got[1]+'</b><br>'+p.got[2];g.classList.add('on')}else $('.say',s).textContent='Click. It opens.';
 if(n!=='13')$('.next',s).classList.add('on')}
function solved(s){var n=s.dataset.n;st.done[n]=1;save();looksSolved(s);if(n==='13')setTimeout(function(){show(cur+1)},900)}
// Back and Forward (Barry, 21 Nov): every screen after the first can go back, so earlier clues can be looked at again.
// Forward returns to the furthest screen reached. Solved puzzles show as solved when revisited.
S.forEach(function(s,k){if(!k||s.hasAttribute('data-end'))return;var nav=document.createElement('p');nav.className='bnav';nav.innerHTML='<button class="btn ghost bk" type="button">← Back</button><button class="btn ghost fw" type="button" hidden>Forward →</button>';s.insertBefore(nav,s.firstChild);
 $('.bk',nav).addEventListener('click',function(){show(Math.max(1,cur-1))});$('.fw',nav).addEventListener('click',function(){show(st.max)})});
$$('.go').forEach(function(b){b.addEventListener('click',function(){if(b.id==='start')fresh();show(cur+1)})});
var prev=load();if(prev&&prev.at>0&&!prev.fin){$('#resume').hidden=false;$('#carry').addEventListener('click',function(){st=prev;show(prev.at)})}
// a fresh game: forget progress and put every puzzle back as it was
function fresh(){st={at:0,ms:0,hints:0,done:{},max:0};t0=0;S.forEach(function(x){delete x.dataset.r;var l=$('.lock',x);if(l)l.classList.remove('open','no');var g=$('.got',x);if(g){g.classList.remove('on');g.innerHTML=''}var nx=$('.next',x);if(nx)nx.classList.remove('on');var hp=$('.hintp',x);if(hp)hp.hidden=false;var hs=$('.hints',x);if(hs)hs.innerHTML='';var hb=$('.hint',x);if(hb){hb.hidden=false;hb.textContent='Hint, please';hb.classList.remove('give')}var inp=$('input',x);if(inp)inp.value='';var sy=$('.say',x);if(sy)sy.textContent=''});save()}
$('#again').addEventListener('click',function(){fresh();show(0)});
S.forEach(function(s){var n=s.dataset.n;if(!n)return;var p=P[n],tries=0;
 var f=$('form',s);if(f)f.addEventListener('submit',function(e){e.preventDefault();if(st.done[n]&&$('.next.on',s))return;var v=String($('input',s).value).toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return;
  if(p.a.test(v))solved(s);else{var l=$('.lock',s);l.classList.remove('no');void l.offsetWidth;l.classList.add('no');$('.say',s).textContent=p.no[tries++%p.no.length];closer(s)}});
 $('.hint',s).addEventListener('click',function(){var used=$('.hints',s).children.length;if(used<p.h.length){var q=document.createElement('p'),last=used===p.h.length-1;q.textContent=(last?'The answer: ':'')+p.h[used++];if(last)q.className='ans';$('.hints',s).appendChild(q);st.hints++;save()}if(used>=p.h.length)this.hidden=true;else{this.textContent='Just tell me the answer';this.classList.add('give')}})});
// puzzle 2: the conversation. The right reply gives her nothing; any other reply keeps her going.
var TALK=[["Coo-ee! There you are! Still on your own, are you?",[["Mm.",1,"Doris pauses. She isn’t used to “Mm.”"],["Yes, and honestly I’m very happy.",0,"Happy? On your own? Oh, you poor thing. My neighbour’s son is single, you know. He collects lighthouses..."],["Is that a new cardigan, Doris?",0,"Ooh, do you like it? Marks and Spencer. Well. Let me tell you about the queue..."]]],
 ["And how’s work? Still doing that... computer thing?",[["Actually it’s really interesting, I’ve just started a new project—",0,"Ooh, a project! Tell me everything. Start from the beginning. Don’t leave anything out."],["What do you mean, “that computer thing”?",0,"Well, you know. Typing. Our Kevin does typing. Have I told you about our Kevin?"],["It’s fine.",1,"“Fine,” says Doris, slowly. Her eyes narrow. She’s regrouping."]]],
 ["You should come to my Zumba class! Thursday nights!",[["Maybe.",0,"Lovely! I’ll put you down. Bring a towel. And a friend. Do you have friends?"],["I’ve got a bad knee.",1,"“Oh, say no more!” Doris looks at your knee with deep sympathy. She takes a step back."],["I’d love to, but Thursdays are tricky.",0,"Wednesdays, then! There’s a Wednesday class! Silver Steppers!"]]],
 ["Well, I’d better find Gareth. Lovely to—",[["Oh, before you go, Doris...",0,"She turns back. Oh no. Oh no, she’s turned back."],["Lovely to see you too!",1,"And she’s gone. You exhale for the first time in four minutes."],["Doris, can I ask you something?",0,"“Of course, love!” She settles in. She’s cancelled all her plans. For you."]]]];
var tk=0;function talkStart(){if(st.done['2']){return}tk=0;$('#tk').innerHTML='';talkNode()}
function talkNode(){var box=$('#tk'),node=TALK[tk],d=document.createElement('div');d.className='d';d.innerHTML='<small>Aunt Doris</small>';d.appendChild(document.createTextNode(node[0]));box.appendChild(d);
 var o=document.createElement('div');o.className='opts';node[1].forEach(function(r){var b=document.createElement('button');b.className='btn ghost';b.type='button';b.textContent=r[0];b.addEventListener('click',function(){
  o.remove();var me=document.createElement('div');me.className='me';me.textContent=r[0];box.appendChild(me);var back=document.createElement('div');back.className='d';back.innerHTML='<small>Aunt Doris</small>';back.appendChild(document.createTextNode(r[2]));box.appendChild(back);
  if(r[1]){tk++;if(tk<TALK.length)setTimeout(talkNode,500);else solved(box.closest('.pz'))}else{var say=$('.say',box.closest('.pz'));say.textContent='That gave her something to work with. She edges closer.';closer(box.closest('.pz'));setTimeout(function(){box.innerHTML='';say.textContent='';tk=0;talkNode()},2200)}});o.appendChild(b)});box.appendChild(o)}
addEventListener('pagehide',function(){tick();save()});setInterval(function(){tick();save()},5000);show(0)})();` });
}

// ---------------- Escape the Party (a sample paper escape room) ----------------
// Bookshelf in the room (Barry, 21 Nov: "build the sample"). Three short puzzles; each answer opens a padlock and the
// next step. Hints come one at a time; the second hint gives the answer away. A trial to see whether paper escape
// rooms are worth doing properly (a printable version would follow). The wording is a draft for Barry.
const PARTY_COATS = [   // colour, hood, buttons, tag: only one fits all four clues (53)
  ["#a7322d", 1, 2, 14], ["#4d7a3a", 1, 4, 27], ["#26355c", 0, 5, 31], ["#8c8c88", 1, 3, 42], ["#26355c", 1, 4, 53], ["#111111", 1, 1, 66],
];
function partyCoat([col, hood, buttons, tag]) {
  const b = Array.from({ length: buttons }, (_, k) => `<circle cx="60" cy="${56 + k * (60 / Math.max(buttons, 1))}" r="3.4" fill="#e9e4d6"/>`).join("");
  return `<svg viewBox="0 0 120 150" role="img" aria-label="A coat with tag ${tag}: ${hood ? "hood" : "no hood"}, ${buttons} button${buttons === 1 ? "" : "s"}">
<path d="M60 2v7M45 13q15-11 30 0" fill="none" stroke="#9a958a" stroke-width="3" stroke-linecap="round"/>
${hood ? `<path d="M31 50Q28 16 60 13Q92 16 89 50Q75 42 60 42Q45 42 31 50z" fill="${col}" stroke="#000" stroke-opacity=".45" stroke-width="2"/><path d="M40 47Q40 25 60 23Q80 25 80 47Q70 41 60 41Q50 41 40 47z" fill="#0d0c0b" fill-opacity=".72"/><path d="M47 44l-2 12M73 44l2 12" stroke="#e9e4d6" stroke-width="2.2" stroke-linecap="round"/><circle cx="45" cy="57" r="2.4" fill="#e9e4d6"/><circle cx="75" cy="57" r="2.4" fill="#e9e4d6"/>` : ""}
<path d="M42 38l-22 14-8 60 14 4 8-44v66h52V82l8 44 14-4-8-60-22-14q-6 10-18 10t-18-10z" fill="${col}" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
<path d="M60 48v80" stroke="#000" stroke-opacity=".3" stroke-width="2"/>${b}
<g transform="translate(78 92) rotate(10)"><rect x="0" y="0" width="30" height="22" rx="3" fill="#f2f0ea"/><text x="15" y="16" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="800" font-size="13" fill="#141412">${tag}</text></g></svg>`;
}
const PARTY_LOCK = `<svg viewBox="0 0 80 96" aria-hidden="true"><path class="sh" d="M20 44V28a20 20 0 0 1 40 0v16" fill="none" stroke="#c9c4b6" stroke-width="9" stroke-linecap="round"/><rect x="6" y="40" width="68" height="52" rx="10" fill="#fad00c"/><circle cx="40" cy="62" r="7" fill="#141412"/><path d="M40 64v14" stroke="#141412" stroke-width="5" stroke-linecap="round"/></svg>`;
const PARTY_KEYS = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", ""], ["#", ""]];
function partyPage() {
  const lock = (k, ph, mode) => `<div class="lock" data-k="${k}">${PARTY_LOCK}<form><input name="a" autocomplete="off" autocapitalize="characters" ${mode === "num" ? 'inputmode="numeric"' : ""} placeholder="${ph}" aria-label="Your answer"><button class="btn" type="submit">Try it</button></form></div><p class="say" role="status" aria-live="polite"></p>`;
  const hints = `<div class="hints"></div><p style="text-align:center"><button class="btn ghost hint" type="button">Hint, please</button></p>`;
  return page("Escape the Party", `<div class="ep"><p class="label" style="margin-top:26px">${esc(HUB.name)} · Paper escape room (sample)</p><h1 style="margin-top:4px">Escape the Party</h1>
<section class="box pz" data-k="0"><p class="step">The situation</p><h2>You’re at Gareth’s housewarming.</h2>
<p>You’ve done forty minutes. You’ve admired the kitchen. You’ve heard about the boiler. That’s enough.</p>
<p>Three things stand between you and your sofa: your coat, a way out, and the code for the back gate. Nobody can see you leave.</p>
<p style="text-align:center"><button class="btn" id="go" type="button">Start sneaking</button></p></section>
<section class="box pz" data-k="1" hidden><p class="step">1 of 3 · The coat pile</p><h2>Find your coat.</h2>
<p>Every coat in the house is in a heap on the spare bed. You can’t remember which tag is yours. Luckily you remember four things about your coat:</p>
<ul class="clues"><li>It has a hood. (Obviously. Hoods are for hiding in.)</li><li>It isn’t green.</li><li>It has more buttons than the red one.</li><li>Its tag number is odd.</li></ul>
<div class="coats">${PARTY_COATS.map(partyCoat).join("")}</div><p>The tag number opens the padlock.</p>${lock(1, "Tag number", "num")}${hints}</section>
<section class="box pz" data-k="2" hidden><p class="step">2 of 3 · The way out</p><h2>Pick your exit.</h2>
<p>There are four ways out of the house: the front door, the kitchen door, the garden door, and the window in the downstairs loo. Three of them are guarded, by accident, by people who want to talk to you:</p>
<ul class="clues"><li><b>Gareth</b> wants to show you his sourdough starter. He hasn’t left it all night.</li><li><b>Dave from accounts</b> is stretching for his marathon, somewhere he can feel grass under his feet.</li><li><b>Aunt Doris</b> wants to know why you’re still single. She’s standing by an exit she can say goodbye to everyone from, and she would never loiter near a toilet.</li></ul>
<p>Which way do you go?</p>${lock(2, "Your exit", "text")}${hints}</section>
<section class="box pz" data-k="3" hidden><p class="step">3 of 3 · The back gate</p><h2>Crack the gate code.</h2>
<p>You’re out. The back gate has a keypad. Your phone buzzes:</p>
<div class="txt"><small>Sam (the only friend who gets it)</small>Gate code is where your evening was supposed to be spent. On the ____. 4 letters. Go. 🛋</div>
<div class="keys" aria-hidden="true">${PARTY_KEYS.map(([n, l]) => `<b>${n}<small>${l || "&nbsp;"}</small></b>`).join("")}</div>${lock(3, "4-digit code", "num")}${hints}</section>
<section class="box pz" data-k="4" hidden><p class="step">Escaped</p><h2>You’re out. Nobody noticed.</h2>
<p id="won"></p><p>Tomorrow you’ll text Gareth to say what a lovely evening it was. He’ll never know.</p>
<p class="note">This is a sample. If it’s fun, more are on the way: escape the office do, the wedding, the family Christmas.</p>
<p style="text-align:center"><a class="btn" href="${HUB.path}">Back to the room</a></p></section>
<p class="note"><a href="${HUB.path}">← Back to the room</a></p></div>`, { nav: "hub", desc: "Escape the Party: a short paper escape room for people who'd rather be at home.", script: `
(function(){var t0=0,$=function(q,r){return (r||document).querySelector(q)};
// answers (letters and digits only), the lines for a wrong try, and two hints each (the second gives it away)
var A={1:/^53$/,2:/LOO|WINDOW|TOILET|BATHROOM|WC|LAV/,3:/^7632$/};
var NO={1:['That coat belongs to someone who enjoys parties.','Not yours. Smells of networking.','No. Read the clues again. Quietly.'],2:['Someone’s guarding that one. They’ve seen you.','Too risky. Somebody would want a chat.','No. Think about who’s standing where.'],3:['The gate stays shut. The dog next door starts barking.','Beep. Wrong. Very loud beep.','No. Look at the letters on the keypad.']};
var H={1:['Cross out the coats without hoods first, then the green one. That leaves four. The red coat has two buttons.','It’s the navy coat with a hood and four buttons: tag 53.'],2:['Gareth won’t leave his sourdough, so he’s in the kitchen. Grass means the garden.','Doris is at the front door saying goodbye to everyone. That leaves the downstairs loo window. Type LOO.'],3:['Each number on the keypad has letters under it, like an old phone. Spell the word with numbers.','The word is SOFA: S is 7, O is 6, F is 3, A is 2. The code is 7632.']};
var tries={1:0,2:0,3:0},used={1:0,2:0,3:0};
function show(k){[].forEach.call(document.querySelectorAll('.pz'),function(s){s.hidden=+s.dataset.k!==k});var s=$('.pz[data-k="'+k+'"]');s.scrollIntoView({block:'start'});scrollBy(0,-80);var i=$('input',s);if(i)setTimeout(function(){i.focus({preventScroll:true})},300)}
function fmt(ms){var m=Math.floor(ms/60000),s=Math.round(ms/1000)%60;return m+' min '+s+' sec'}
$('#go').addEventListener('click',function(){t0=Date.now();show(1)});
[].forEach.call(document.querySelectorAll('.lock'),function(l){var k=+l.dataset.k,s=l.closest('.pz'),say=$('.say',s);
 $('form',l).addEventListener('submit',function(e){e.preventDefault();var v=String($('input',l).value).toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return;
  if(A[k].test(v)){l.classList.add('open');say.textContent='Click. It opens.';setTimeout(function(){if(k<3)show(k+1);else{$('#won').textContent='Time: '+fmt(Date.now()-t0)+'. Hints used: '+(used[1]+used[2]+used[3])+'.';show(4)}},900)}
  else{l.classList.remove('no');void l.offsetWidth;l.classList.add('no');say.textContent=NO[k][tries[k]++%NO[k].length]}});
 $('.hint',s).addEventListener('click',function(){var h=H[k];if(used[k]<h.length){var p=document.createElement('p'),last=used[k]===h.length-1;p.textContent=(last?'The answer: ':'')+h[used[k]++];if(last)p.className='ans';$('.hints',s).appendChild(p)}if(used[k]>=h.length)this.hidden=true;else{this.textContent='Just tell me the answer';this.classList.add('give')}})})})();` });
}

// ---------------- Vote on the next gag ----------------
// The jar in the room (Barry, 21 Nov). Three gags that aren't out yet, picked automatically: the next three on the
// release schedule ("we're creating the illusion of choice"), so they all come out anyway, in schedule order. Vote
// counts are kept but never shown, so the order of release can't contradict them. Each card is the gag on its range's
// video background (backgrounds/, R2 site/vid-<range in lower case>.jpg), laid out like the videos and typed out the same way.
// Voting shows a 5% discount code; the code itself is Barry's to name, and needs setting up in Stripe before launch.
// Where the gags come from: KV shop:upcoming, which the app is to keep current from Core (see the app thread's note).
// Until it does, VOTE_FALLBACK is a copy of the next three from Core's GAGS_TABLE (read 21 Nov), skipping In Person
// and Exclusive, which have no regular schedule.
const VOTE_CODE = "VOTED5";
const VOTE_FALLBACK = [
  { id: "IH-00119", coll: "IH", title: "Karaoke", due: "2026-11-23", text: "... OH GOD.\n\nWHY'D IT HAVE\nTO BE KARAOKE?" },
  { id: "IH-00017", coll: "IH", title: "I Do Overthink", due: "2026-11-30", text: "... I DO OVERTHINK.\n\nBEATS WHAT\nYOU DO." },
  { id: "OS-00002", coll: "OS", title: "Unreliable Narrator", due: "2026-12-04", text: "... I DO ENJOY A\nNOVEL WITH AN\nUNRELIABLE NARRATOR.\n\nREMINDS ME OF WHEN I\nPUT KAREN IN HER PLACE.\n\nEVERYONE CLAPPED." },
];
async function upcoming(env) {
  let list = null;
  try { list = await env.PENDING.get("shop:upcoming", "json"); } catch (_) {}
  const today = new Date().toISOString().slice(0, 10);
  list = (Array.isArray(list) && list.length ? list : VOTE_FALLBACK).filter((g) => !g.due || g.due > today);
  return (list.length >= 2 ? list : VOTE_FALLBACK).slice(0, 3);
}
async function castVote(request, env) {
  let b = {}; try { b = await request.json(); } catch (_) {}
  const list = await upcoming(env), round = list.map((g) => g.id).join("+");
  if (!list.some((g) => g.id === b.id)) return json({ ok: false }, 400);
  const key = isPreview(env) ? "shop:votes-preview" : "shop:votes", all = (await env.PENDING.get(key, "json")) || {};
  const r = (all[round] = all[round] || {}); r[b.id] = (r[b.id] || 0) + 1;
  await env.PENDING.put(key, JSON.stringify(all));
  return json({ ok: true, code: VOTE_CODE });
}
function votePage(list) {
  const round = list.map((g) => g.id).join("+");
  const card = (g) => {
    const lines = String(g.text || "").split("\n").map((l) => (l.trim() ? `<div>${[...l].map((c) => `<span class="ch">${c === " " ? " " : esc(c)}</span>`).join("")}</div>` : "<div>&nbsp;</div>")).join("");
    const c = COLLECTIONS[g.coll] || COLLECTIONS.IH;
    return `<div class="vc" data-id="${esc(g.id)}"><div class="art"><img src="/s/vid-${esc(String(g.coll).toLowerCase())}.jpg?v=1" alt="" loading="lazy"><div class="gt" aria-label="${esc(String(g.text).replace(/\n+/g, " "))}">${lines}</div></div><div class="cap"><div><b>${esc(g.title)}</b><span>${esc(c.name)}</span><em class="mine-tag">Your vote</em></div><button class="btn" type="button" data-vote="${esc(g.id)}">This one</button></div></div>`;
  };
  return page("Vote on the next gag", `<p class="label" style="margin-top:26px">${esc(HUB.name)} · The jar</p><h1 style="margin-top:4px">Vote on the next gag</h1>
<p class="muted lead vlead" style="margin-top:8px">Three new designs are on their way. Pick the one you want first. Voting is anonymous. Obviously.</p>
<div class="vgrid" id="vg">${list.map(card).join("")}</div>
<div class="vthanks" id="vt" role="status" aria-live="polite"><h2>Your vote’s in.</h2><p class="muted">We’ll let you know what’s next. As a thank you, here’s 5% off anything in the shop:</p>
<div class="vcode"><span id="vcode">${VOTE_CODE}</span><button class="btn ghost" id="vcopy" type="button">Copy</button></div><p class="note" id="vnote">One use per customer. Expires 30 days after you vote.</p></div>
<p class="note"><a href="${HUB.path}">← Back to the room</a></p>`, { nav: "hub", desc: "Vote on the next Introvert Here design.", script: `
(function(){var R=${JSON.stringify(round)},g=document.getElementById('vg'),calm=false;try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(_){}
// the text is laid out like the videos: the size at which 12 capital Ws fill the text box exactly
function fit(){var m=document.createElement('span');m.style.cssText='position:absolute;left:-9999px;white-space:nowrap;font:400 100px Montserrat,sans-serif;letter-spacing:-.04em';m.textContent='WWWWWWWWWWWW';document.body.appendChild(m);var w=m.getBoundingClientRect().width;m.remove();if(w)g.style.setProperty('--k',(47.13*100/w).toFixed(3))}
(document.fonts&&document.fonts.load?document.fonts.load('400 100px Montserrat'):Promise.resolve()).then(fit,fit);
// each card types itself out when it comes into view
function type(c){var ch=c.querySelectorAll('.ch');if(calm){[].forEach.call(ch,function(x){x.classList.add('on')});return}var i=0;(function t(){if(i<ch.length){ch[i++].classList.add('on');setTimeout(t,42)}})()}
var cards=g.querySelectorAll('.vc');if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);setTimeout(function(){type(e.target)},250)}})},{threshold:.5});[].forEach.call(cards,function(c){io.observe(c)})}else[].forEach.call(cards,type);
function done(id){g.classList.add('done');[].forEach.call(g.querySelectorAll('.ch'),function(x){x.classList.add('on')});[].forEach.call(cards,function(c){c.classList.toggle('mine',c.dataset.id===id)});document.getElementById('vt').classList.add('on')}
var prev=null;try{prev=JSON.parse(localStorage.getItem('ih_vote')||'null')}catch(_){}if(prev&&prev.round===R)done(prev.id);
g.addEventListener('click',function(e){var b=e.target.closest('[data-vote]');if(!b||g.classList.contains('done'))return;var id=b.dataset.vote;
 try{localStorage.setItem('ih_vote',JSON.stringify({round:R,id:id,at:Date.now()}))}catch(_){}done(id);
 fetch('/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}).catch(function(){});
 document.getElementById('vt').scrollIntoView({behavior:calm?'auto':'smooth',block:'center'})});
document.getElementById('vcopy').addEventListener('click',function(){var c=document.getElementById('vcode').textContent,n=document.getElementById('vnote');if(navigator.clipboard)navigator.clipboard.writeText(c).then(function(){n.textContent='Copied. Use it at checkout.'},function(){})})})();` });
}

// ---------------- Spot the Introvert ----------------
// The painting in the room (Barry, 21 Nov): tap it and you are looking at a painting with one person hiding in it.
// Find them: five paintings a game, drawn from the set (the ones you didn't get last time first), easiest first (lv). Wrong taps get a dry line: one of the scene's own for the thing
// tapped (zones, each said once), otherwise the next in its list (then the last four go round). A clue is offered
// after 20 seconds, and the best total time is remembered on the player's device.
// The paintings are Barry's (ChatGPT, oil-painting style, 1024 x 1536); R2 site/spot-<name>.jpg, copies in shop/assets/site/.
// ?all=1 plays every painting in one go (for checking them). also = other places that count as finding them.
// A scene: brief; spot = where they are [x%, y%, radius as % of the width]; found; clue + clueAt [x%, y%, radius];
// zones = [[x%, y%, w%, h%], line]; wrong = the general lines, in order. The wording is a draft for Barry to edit.
const SPOT = [
  { img: "xmas", lv: 1, alt: "A painting of a crowded Christmas party, with a heap of coats on a bench in the hall.",
    brief: "Someone at this Christmas party has had enough. Find them.", spot: [52, 49, 5],
    found: "Found. One sock. They’d like you to pretend you didn’t.", clue: "A clue, since you asked. Check the cloakroom.", clueAt: [62, 40, 24],
    zones: [[[48, 23, 30, 22], "It’s a pile of coats. Mostly."], [[88, 40, 12, 22], "That’s the fire. It’s the opposite of hiding."], [[9, 60, 30, 22], "She’s having a lovely time. Not who we’re after."]],
    wrong: ["No. They’re enjoying themselves.", "Also enjoying themselves.", "Enjoying themselves.", "It’s a party. Most of them want to be here.", "That one’s fine.", "Colder.", "No.", "They can hear you tapping, you know."] },
  { img: "wedding", lv: 2, alt: "A painting of a wedding reception in a marquee, with a cake on a table with a long cloth.",
    brief: "Someone at this wedding would rather not be. Find them.", spot: [75.5, 70.9, 5],
    found: "Found. They’ve been under there since the speeches.", clue: "A clue, since you asked. Lower than you’re looking.", clueAt: [72, 66, 24],
    zones: [[[70, 35, 16, 13], "That’s the cake. Everyone found the cake."], [[54, 49, 45, 18], "That’s a tablecloth. Have a think about tablecloths."], [[35, 5, 65, 12], "Bunting. Nobody has ever hidden in bunting."]],
    wrong: ["No. That’s a guest.", "Also a guest.", "Guest.", "There are ninety of them. Narrow it down.", "That one came for the free bar.", "No.", "Colder.", "Wrong, but they do look happy."] },
  { img: "salon", lv: 3, alt: "A painting of a candlelit party in a grand old room, with a heavy red curtain on the right.",
    brief: "Someone was told there’d be “just a few people”. Find them.", spot: [90.3, 88.9, 5.5],
    found: "Found. Nice shoes. They’re not coming out.", clue: "A clue, since you asked. Not everyone is in the room, exactly.", clueAt: [82, 82, 24],
    zones: [[[84, 0, 16, 84], "It’s a curtain. A long one. Goes all the way to the floor."], [[44, 0, 22, 17], "That’s the chandelier. Nobody’s up there. We checked."], [[23, 0, 22, 18], "That’s a painting in a painting. Eyes down."], [[3, 74, 22, 10], "Those are grapes."]],
    wrong: ["No. That one’s mid-anecdote.", "Also not hiding. Loudly not hiding.", "No.", "People who hide don’t bring a lute.", "Colder.", "Still no.", "They’re all having a marvellous time. That’s the problem.", "No."] },
  { img: "garden", lv: 4, alt: "A painting of a sunny garden party beside a glasshouse, with a clipped bush in a terracotta pot.",
    brief: "Someone said they’d “pop along for an hour”. Find them.", spot: [29.3, 40.8, 3.5],
    found: "Found. Four fingers. That’s all you’re getting.", clue: "A clue, since you asked. Somebody’s very attached to that pot.", clueAt: [30, 42, 22],
    zones: [[[19, 57.5, 8, 6], "That’s a bun. Buns aren’t hiding. Buns are just low."], [[15, 29, 17, 9], "It’s a bush. A suspiciously well-kept one."], [[50, 0, 50, 28], "That’s a glasshouse. You’d be seen from every angle."]],
    wrong: ["No. That’s a hat with a person under it.", "Another hat.", "Hat.", "It’s a garden party. Most of it is going to be hats.", "That’s a flower.", "Colder.", "No.", "Also a hat."] },
  { img: "library", lv: 5, alt: "A painting of a drinks reception in an old library, with a tall wooden cupboard among the bookshelves.",
    brief: "Someone came here for the quiet and got a drinks reception. Find them.", spot: [69.7, 26.7, 3.2],
    found: "Found. They saw you first.", clue: "A clue, since you asked. Try the furniture.", clueAt: [68, 30, 22],
    zones: [[[54, 13, 32, 38], "A cupboard. Shut. Mostly."], [[38, 15, 6, 7], "That’s a bust. He’s been ignoring people since 1840."], [[87, 17, 13, 25], "Books. The original way to avoid people."], [[6, 0, 24, 26], "That’s outside. Tempting, but no."]],
    wrong: ["No. Nobody’s reading, either.", "No.", "That one’s talking. In a library.", "Also talking.", "Colder.", "Somebody here remembers what libraries are for.", "No.", "Look for someone looking at you."] },
  { img: "feast", lv: 2, alt: "A painting of a feast in the courtyard of a grand Italian house, with an olive tree in a huge terracotta pot.",
    brief: "Someone was promised a quiet lunch. Find them.", spot: [22.6, 35.8, 4.5],
    found: "Found. One ear. They heard everything.", clue: "A clue, since you asked. Somebody’s gone green.", clueAt: [24, 32, 22],
    zones: [[[2, 8, 44, 24], "It’s an olive tree. Leafy. Very leafy."], [[10, 38, 24, 16], "That’s the pot. Look up a bit."], [[50, 79, 26, 7], "That’s the chicken."], [[84, 0, 10, 8], "That’s a bell tower. Too many stairs."]],
    wrong: ["No. That one’s mid-laugh.", "Also laughing.", "No. Loud, though.", "It’s a feast. They all came on purpose.", "Colder.", "No.", "That one’s on their third glass.", "Not them either."] },
  { img: "station", lv: 2, alt: "A painting of a crowded railway waiting room on a winter evening, with a large wicker hamper among the luggage.",
    brief: "Someone’s train is delayed and the waiting room has turned into a party. Find them.", spot: [68.2, 39, 3.5],
    found: "Found. Four fingers and a lid. They’re travelling as luggage.", clue: "A clue, since you asked. Check the luggage.", clueAt: [62, 42, 22],
    zones: [[[40, 35, 31, 16], "A hamper. Big one. Roomy."], [[0, 33, 18, 30], "That’s the stove. Warm, but no."], [[75, 13, 25, 10], "That’s the train. If only."], [[5, 87, 33, 13], "That trunk’s too small. They checked."]],
    wrong: ["No. That one’s making friends.", "Also making friends.", "Making friends.", "Strangers in a waiting room, talking. Imagine.", "Colder.", "No.", "That one’s offering round a flask.", "Not them either."] },
  { img: "fete", lv: 3, alt: "A painting of a village fête on the lawn of an old stone house, with a striped deckchair propped upright by a stall.",
    brief: "Someone was volunteered to help at the fête. Find them.", spot: [84.2, 31.8, 3.5], also: [[81.4, 37.8, 4]],
    found: "Found. They’ve been holding that deckchair up for an hour.", clue: "A clue, since you asked. Deckchairs are for sitting in. Usually.", clueAt: [82, 38, 22],
    zones: [[[72, 31, 19, 26], "It’s a deckchair. Odd way to store one."], [[85, 6, 10, 10], "That’s the church. The vicar would find you in minutes."], [[93, 34, 7, 12], "Cakes. A reasonable guess, but no."], [[16, 62, 26, 10], "That’s a teapot."]],
    wrong: ["No. They’re mingling.", "Also mingling.", "Mingling.", "It’s a fête. Mingling is most of it.", "Colder.", "No.", "That one’s judging the sponge cakes.", "Not them either."] },
  { img: "festival", lv: 3, alt: "A Japanese woodblock print of a crowded evening festival with lanterns and cherry blossom, and a tall rolled-up mat standing by a stall.",
    brief: "Someone came for the dumplings and stayed for nobody. Find them.", spot: [34.5, 57.7, 4],
    found: "Found. Sandals. That mat has never been so still.", clue: "A clue, since you asked. Not everything rolled up is just a mat.", clueAt: [35, 52, 22],
    zones: [[[29, 38, 10, 17.5], "It’s a rolled-up mat. Standing very upright, for a mat."], [[80, 2, 10, 7], "That’s the moon. Too far, even for them."], [[12, 84, 24, 8], "Those are fish. They’re not hiding. They’ve stopped."], [[76, 39, 24, 14], "A screen. Good thinking. Wrong thing to hide behind."]],
    wrong: ["No. That one’s laughing.", "Also laughing.", "Laughing.", "It’s a festival. Most of them are going to be laughing.", "Colder.", "No.", "Still no.", "Not them either."] },
  { img: "cafe", lv: 4, alt: "A painting in dots of a busy riverside café terrace, with open parasols and one closed parasol by the wall.",
    brief: "Someone agreed to “a quick coffee”. Find them.", spot: [32.9, 47.3, 3.5],
    found: "Found. One shoe. That parasol is taken.", clue: "A clue, since you asked. One of the parasols isn’t open.", clueAt: [33, 38, 22],
    zones: [[[27, 19, 9, 27], "A parasol. Closed. On a day like this."], [[88, 20, 7, 6], "That’s a boat. Good plan, wrong person."], [[37, 16, 48, 9], "Open parasols hide nobody. Think it through."], [[0, 0, 22, 13], "That’s the awning."]],
    wrong: ["No. They’re having a lovely chat.", "Also chatting.", "Chatting.", "It’s a café. Chatting is the whole idea.", "Colder.", "No.", "That one’s ordered a second coffee. Staying.", "Not them either."] },
];
function spotPage() {
  const data = SPOT.map((x) => ({ src: `/s/spot-${x.img}.jpg?v=1`, alt: x.alt, brief: x.brief, lv: x.lv, spot: x.spot, also: x.also || [], found: x.found, clue: x.clue, clueAt: x.clueAt, zones: x.zones, wrong: x.wrong }));
  return page("Spot the Introvert", `<h1 style="position:absolute;left:-9999px">Spot the Introvert</h1><div class="sp" id="sp">
<p class="tp"><span id="sc"></span><span class="tm" id="st">0:00.0</span><a href="${HUB.path}">Back to the room</a></p><p class="br" id="sb"></p>
<div class="fw"><div class="fr" id="sf"><img id="si" alt="" draggable="false"></div></div>
<p class="ms" id="sm" role="status" aria-live="polite"></p>
<p class="bt"><button class="btn ghost" id="sp0" type="button" aria-label="Previous painting">← Back</button><span class="mid"><button class="btn ghost" id="sq" type="button" hidden>Clue</button><button class="btn" id="sa" type="button" hidden>Go again</button></span><button class="btn ghost" id="sn" type="button" aria-label="Next painting">Next →</button></p></div>`, { nav: "hub", body: "spot", desc: "Spot the Introvert: someone in this painting would rather not be found. Find them.", script: `
(function(){var ALL=${JSON.stringify(data).replace(/</g, "\\u003c")},S=[],T=[],every=/[?&]all=1/.test(location.search),$=function(i){return document.getElementById(i)},fr=$('sf'),im=$('si'),i=0,t0=0,run=false,cl;
var hd=document.querySelector('header');$('sp').style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
function fmt(ms){var s=ms/1000,m=Math.floor(s/60);s-=m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)}
function clear(){[].forEach.call(fr.querySelectorAll('.ring,.clue,.miss'),function(x){x.remove()})}
function put(c,x,y,d){var e=document.createElement('div');e.className=c;e.style.left=x+'%';e.style.top=y+'%';if(d){e.style.width=d+'%';e.style.aspectRatio='1'}fr.appendChild(e);return e}
// a game is five paintings: those not in the last game first, in a random order, then sorted easiest to hardest
function deal(){var last=[];try{last=JSON.parse(localStorage.getItem('ih_spot_last')||'[]')}catch(_){}
 var ix=ALL.map(function(_,k){return k}),mix=function(a){return a.map(function(v){return[Math.random(),v]}).sort(function(a,b){return a[0]-b[0]}).map(function(v){return v[1]})};
 var pick=every?ix:mix(ix.filter(function(k){return last.indexOf(k)<0})).concat(mix(ix.filter(function(k){return last.indexOf(k)>=0}))).slice(0,5);
 if(!every){try{localStorage.setItem('ih_spot_last',JSON.stringify(pick))}catch(_){}}
 S=pick.sort(function(a,b){return ALL[a].lv-ALL[b].lv||a-b}).map(function(k){return ALL[k]});
 // what has happened on each painting so far: time spent looking, found or not, wrong taps, lines used, clue shown
 T=S.map(function(){return{t:0,done:false,n:0,used:{},clue:false,say:''}})}
function total(){return T.reduce(function(a,x){return a+x.t},0)+(run?Date.now()-t0:0)}
function left(){return T.filter(function(x){return !x.done}).length}
// Back and Next move between the paintings at any time (Barry, 21 Nov). A painting's clock only runs while it is on
// screen and its hider is still hiding, and only from when its picture has arrived.
function stop(){if(run){T[i].t+=Date.now()-t0;run=false}clearTimeout(cl)}
function go(){if(T[i].done||run)return;t0=Date.now();run=true;clearTimeout(cl);if(!T[i].clue)cl=setTimeout(function(){if(run)$('sq').hidden=false},Math.max(0,20000-T[i].t))}
function show(k){stop();i=k;var s=S[i],t=T[i];clear();$('sb').textContent=s.brief;$('sc').textContent=(i+1)+' of '+S.length;$('sp0').disabled=i===0;$('sn').disabled=i===S.length-1;
 $('sn').className='btn'+(t.done&&left()&&i<S.length-1?'':' ghost');$('sq').hidden=true;$('sa').hidden=left()>0;
 if(t.done)put('ring',s.spot[0],s.spot[1],Math.max(s.spot[2]*2.6,14));else if(t.clue)put('clue',s.clueAt[0],s.clueAt[1],s.clueAt[2]*2);
 $('sm').textContent=t.say||(t.done?s.found:'Tap where they’re hiding.');
 im.alt=s.alt;im.onload=im.onerror=go;if(im.getAttribute('src')!==s.src)im.src=s.src;if(im.complete&&im.naturalWidth)go();if(S[i+1]){new Image().src=S[i+1].src}}
fr.addEventListener('click',function(e){if(!run)return;var r=fr.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*100,y=(e.clientY-r.top)/r.height*100,s=S[i],t=T[i];
 var hit=[s.spot].concat(s.also).some(function(q){var dx=(x-q[0])*r.width/100,dy=(y-q[1])*r.height/100,rad=Math.max(q[2]*r.width/100,24);return dx*dx+dy*dy<=rad*rad});
 if(hit){stop();t.done=true;var n=left();
  if(n)t.say=s.found+(i===S.length-1?' '+n+' still hiding. Go back for them.':'');
  else{var key=every?'ih_spot_bestall':'ih_spot_best5',best=0,tot=total();try{best=+localStorage.getItem(key)||0}catch(_){}
   var rec=!best||tot<best;if(rec){try{localStorage.setItem(key,tot)}catch(_){}}
   t.say=s.found+(every?' All of them in ':' All five in ')+fmt(tot)+(rec?(best?'. A new best.':'. That’s your time to beat.'):'. Your best is '+fmt(best)+'.')}
  show(i)}
 else{var w=s.wrong,m=put('miss',x,y),line=null;m.textContent='×';setTimeout(function(){m.remove()},1000);
  s.zones.some(function(z,k){var q=z[0];if(!t.used[k]&&x>=q[0]&&x<=q[0]+q[2]&&y>=q[1]&&y<=q[1]+q[3]){t.used[k]=1;line=z[1];return true}});
  if(!line){line=t.n<w.length?w[t.n]:w[w.length-4+(t.n-w.length)%4];t.n++}t.say=line;$('sm').textContent=line}});
$('sq').addEventListener('click',function(){var c=S[i].clueAt;T[i].clue=true;T[i].say=S[i].clue;put('clue',c[0],c[1],c[2]*2);$('sm').textContent=S[i].clue;$('sq').hidden=true});
$('sp0').addEventListener('click',function(){if(i>0)show(i-1)});$('sn').addEventListener('click',function(){if(i<S.length-1)show(i+1)});
document.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'&&i>0)show(i-1);if(e.key==='ArrowRight'&&i<S.length-1)show(i+1)});
$('sa').addEventListener('click',function(){stop();deal();show(0)});
setInterval(function(){$('st').textContent=fmt(total())},100);deal();show(0)})();` });
}

// The room (Barry, 21 Nov): one picture of the cosiest room imaginable fills the screen, and the things in it are the
// way to everything in the Escape Room. Two pictures of the same room (shop/room/): a wide one and a tall one, picked
// by the shape of the screen. Places are in percent of the picture: r = the areas to tap, d = where the glowing dot
// sits, f = where its label goes (l/r = starts at the dot and runs left/right-anchored, b = below the dot).
// A thing with "soon" isn't built yet and answers with that line instead of going anywhere.
const ROOM = [
  { name: "Stealth game", soon: "The console isn’t plugged in yet. The stealth game is on its way. Come back later.",
    wide: { r: [[2.5, 67, 13.5, 14], [0.8, 16, 13, 35.5]], d: [9.6, 73.6], f: "l" }, tall: { r: [[2, 49.5, 25.5, 36.5]], d: [22.5, 76.6], f: "l" } },
  { name: "Paper escape rooms", href: HUB.path + "/aunt-doris",
    wide: { r: [[19, 44.3, 16, 31.5]], d: [27, 58] }, tall: { r: [[36.5, 36.3, 22, 13]], d: [55, 42.5], f: "r" } },
  { name: "Spot the Introvert", href: HUB.path + "/spot",
    wide: { r: [[20.5, 19, 12.2, 21]], d: [26.6, 29] }, tall: { r: [[37.3, 12.6, 20, 9.5]], d: [47.3, 15.6], f: "rb" } },
  { name: "Look Busy", href: HUB.path + "/look-busy",
    wide: { r: [[41, 46.5, 7.6, 11.5]], d: [44.8, 52.5] }, tall: { r: [[34, 49.6, 13.8, 6.8]], d: [41, 53.2] } },
  { name: "Excuse Generator", href: HUB.path + "/excuses",
    wide: { r: [[49.3, 53.5, 6.4, 9.5]], d: [52.4, 58.1], f: "b" }, tall: { r: [[50.5, 52.6, 10.5, 6]], d: [55.9, 55.6], f: "b" } },
  { name: "Newsletter", soon: "Nothing pinned up yet. The newsletter is coming. Come back later.",
    wide: { r: [[66.5, 16.5, 7.2, 26.5]], d: [70.1, 22] }, tall: { r: [[41, 23, 13.5, 11.8]], d: [47.7, 28.5], f: "r" } },
  { name: "The shop", href: "/uk/shop",
    wide: { r: [[74.4, 21, 9.6, 35.5]], d: [79, 44], f: "b" }, tall: { r: [[85, 24.5, 13, 16.5]], d: [91.5, 32], f: "rb" } },
  { name: "Vote on the next gag", href: HUB.path + "/vote",
    wide: { r: [[84.3, 23, 6.2, 13]], d: [87, 30.5], f: "r" }, tall: { r: [[86, 15.5, 10.5, 8]], d: [90.8, 19.2], f: "r" } },
  { name: "The way out", href: "/uk",
    wide: { r: [[91.2, 4, 8.8, 85]], d: [92.9, 53.5], f: "rb" }, tall: { r: [[63, 19, 23, 26.5]], d: [72, 27] } },
];
function roomView(v) {
  const spots = ROOM.map((t, i) => t[v].r.map(([x, y, w, h], k) => {
    const at = `style="left:${x}%;top:${y}%;width:${w}%;height:${h}%"`, d = t[v].d;
    const inner = k ? "" : `<i class="dot ${(t[v].f || "").split("").join(" ")}" style="left:${(((d[0] - x) / w) * 100).toFixed(1)}%;top:${(((d[1] - y) / h) * 100).toFixed(1)}%;--d:${(i * 0.9).toFixed(1)}s"><span class="lb">${esc(t.name)}${t.soon ? "<small>Soon</small>" : ""}</span></i>`;
    const more = k ? ' tabindex="-1" aria-hidden="true"' : "";
    return t.soon ? `<button type="button" class="hs" ${at} data-soon="${esc(t.soon)}"${k ? more : ` aria-label="${esc(t.name)} (coming soon)"`}>${inner}</button>` : `<a class="hs" ${at} href="${t.href}"${k ? more : ` aria-label="${esc(t.name)}"`}>${inner}</a>`;
  }).join("")).join("");
  return `<div class="rv ${v}" data-src="/s/room-${v}.jpg?v=1"><img alt="A small, warm room at dusk with rain on the window: an armchair with a blanket, a lamp, a bookshelf, a television and games console, a tablet, a phone, a noticeboard, a hoodie on a hook, a jar on a shelf, and a door with a Do Not Enter hanger." draggable="false">${spots}</div>`;
}
function hubPage() {
  return page(HUB.name, `<h1 style="position:absolute;left:-9999px">${esc(HUB.name)}</h1><div class="rm" id="rm"><div class="bk"></div>${roomView("wide")}${roomView("tall")}
<button type="button" class="rtour" id="rtour" aria-pressed="false">Show me round</button><div class="rmsg" id="rmsg" role="status" aria-live="polite"></div></div>`, { nav: "hub", body: "room", desc: HUB.name + ": " + HUB.line + " A room to get away from people.", script: `
(function(){var rm=document.getElementById('rm'),msg=document.getElementById('rmsg'),tour=document.getElementById('rtour'),cur=null,mt,calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
// Fit the picture: fill the screen where that only trims empty wall, ceiling and rug; never trim anything you can tap.
var FIT={wide:{ar:2508/1412,cx:.02,cy:.2,by:.22},tall:{ar:1412/2508,cx:.09,cy:.12,by:.4}};
function lay(){var hd=document.querySelector('header');rm.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
 var W=rm.clientWidth,H=rm.clientHeight,v=W/H<1?'tall':'wide',f=FIT[v],el=rm.querySelector('.rv.'+v);
 if(cur!==el){[].forEach.call(rm.querySelectorAll('.rv'),function(x){x.classList.toggle('on',x===el)});var im=el.querySelector('img');if(!im.getAttribute('src'))im.src=el.dataset.src;rm.querySelector('.bk').style.backgroundImage='url('+el.dataset.src+')';cur=el;lit=-1}
 var w=Math.min(Math.max(W,H*f.ar),W*(1+f.cx)),h=w/f.ar;if(h>H*(1+f.cy)){h=H*(1+f.cy);w=h*f.ar}
 el.style.width=w+'px';el.style.height=h+'px';el.style.left=(W-w)/2+'px';el.style.top=(H-h)*(h>H?f.by:.5)+'px'}
function say(t,ms){msg.textContent=t;msg.classList.add('on');clearTimeout(mt);mt=setTimeout(function(){msg.classList.remove('on')},ms||4500)}
rm.addEventListener('click',function(e){var b=e.target.closest('[data-soon]');if(b)say(b.dataset.soon)});
tour.addEventListener('click',function(){var on=rm.classList.toggle('all');tour.textContent=on?'Hide the labels':'Show me round';tour.setAttribute('aria-pressed',on)});
// The things take turns to glow and show their name, so nobody has to guess what can be tapped.
var lit=-1,busy=false;
rm.addEventListener('pointerover',function(e){if(e.pointerType==='mouse'&&e.target.closest('.hs'))busy=true});rm.addEventListener('pointerout',function(e){if(e.target.closest('.hs'))busy=false});
function turn(){if(!cur||calm||busy||rm.classList.contains('all')||document.hidden)return;var s=cur.querySelectorAll('.hs:not([tabindex])');[].forEach.call(s,function(x){x.classList.remove('lit')});lit=(lit+1)%s.length;s[lit].classList.add('lit')}
addEventListener('resize',lay);lay();setInterval(turn,2600);setTimeout(turn,1800);
setTimeout(function(){say(calm?'You’re in. Nobody knows you’re here. Press “Show me round” to see what’s what.':'You’re in. Nobody knows you’re here. Have a poke about.',5200)},700)})();` });
}

function productPage(d, type, cat) {
  const g0 = d.garments[type], name = d.title + " " + g0.label;
  const others = cat.garmentOrder.filter((t) => d.garments[t] && t !== type);
  const data = { id: d.id, title: d.title, garments: { [type]: g0 }, order: [type] };
  const coll = COLLECTIONS[d.coll] || COLLECTIONS.IH;
  const script = `
var D=${JSON.stringify(data).replace(/</g, "\\u003c")};var st={g:D.order[0],colour:null,size:null,img:0,name:''};
// In Person: the buyer's name. Letters (any alphabet's accents), spaces, hyphens and apostrophes; always capitals.
var P=D.garments[D.order[0]].personal||null;
function cleanName(v){v=String(v||'').toUpperCase().replace(/[’\`]/g,"'").replace(/[^\\p{L} '\\-]/gu,'').replace(/ +/g,' ').replace(/^ +/,'');return P?v.slice(0,P.max):v}
function nameOk(){return !P||/\\p{L}/u.test(st.name.trim())}
function $(i){return document.getElementById(i)}function money(p){return '£'+(p/100).toFixed(2)}
function G(){return D.garments[st.g]}
function colours(){var seen={},out=[];G().variants.forEach(function(v){if(!seen[v.colour]){seen[v.colour]=1;out.push(v)}});return out}
function sizes(){return G().variants.filter(function(v){return v.colour===st.colour})}
function pics(){var g=G(),c=st.colour,m=(g.mockups||[]).filter(function(x){return x.colour===c}),own=g.images.filter(function(i){return i.colour===c}),any=g.images.filter(function(i){return !i.colour});var sg=g.sizeGuide?[{url:g.sizeGuide,thumb:g.sizeGuide,alt:'Size guide'}]:[];var gen=function(i){return /_(AGM|RANGE|BRAND|PROMO)$/.test(String(i.alt||'').toUpperCase())};return (c===g.mainColour?own.concat(m):m.concat(own)).concat(any.filter(function(i){return !gen(i)}),sg,any.filter(gen))}
function variant(){return G().variants.find(function(v){return v.colour===st.colour&&v.size===st.size})}
function render(){var g=G();
 var cs=colours();if(!cs.some(function(v){return v.colour===st.colour}))st.colour=g.mainColour||cs[0].colour;
 $('colours').innerHTML=cs.map(function(v){return '<button class="swatch'+(v.colour===st.colour?' on':'')+'" title="'+v.colour+'" aria-label="'+v.colour+'" data-c="'+v.colour+'" style="background:'+(v.hex||'#888')+'"></button>'}).join('');
 $('cname').textContent=st.colour;
 var ss=sizes();if(!ss.some(function(v){return v.size===st.size}))st.size=null;
 $('sizes').innerHTML=ss.map(function(v){return '<button class="chip'+(v.size===st.size?' on':'')+'" data-s="'+v.size+'">'+v.size+'</button>'}).join('');
 var v=variant();$('price').textContent=money(v?v.price:g.priceFrom);$('add').disabled=!v||!nameOk();$('add').textContent=!nameOk()?'Type your name':v?'Add to basket':'Choose a size';
 var ps=pics();if(st.img>=ps.length)st.img=0;var cur=ps[st.img]||{},nm=st.name.trim(),lv=P&&nm&&cur.live?cur.live:null;
 // A photo with a "live" spot shows the buyer's own name: the same photo without its gag text, with the text drawn on top.
 var ov=$('live');if(lv){ov.style.cssText='left:'+lv.x+'%;top:'+lv.y+'%;width:'+lv.w+'%;'+(lv.h?'height:'+lv.h+'%;':'')+'font-size:'+lv.s+'cqw;'+(lv.r?'transform:rotate('+lv.r+'deg);':'')+'display:block';ov.textContent=P.text.replace('[NAME]',nm)}else ov.style.display='none';
 $('main').src=(lv?cur.base:cur.url)||'';$('main').alt=D.title+(ps[st.img]&&ps[st.img].colour?' in '+ps[st.img].colour:'');
 $('thumbs').innerHTML=ps.map(function(im,i){return '<img src="'+im.thumb+'" class="'+(i===st.img?'on':'')+'" data-i="'+i+'" alt="">'}).join('');
 $('count').textContent=ps.length>1?(st.img+1)+' / '+ps.length:'';$('prev').style.display=$('next').style.display=ps.length>1?'':'none';
 var on=$('thumbs').querySelector('.on');if(on&&$('thumbs').scrollWidth>$('thumbs').clientWidth)$('thumbs').scrollLeft=on.offsetLeft-$('thumbs').offsetLeft-($('thumbs').clientWidth-on.offsetWidth)/2;
 $('sg').style.display=g.sizeGuide?'':'none';$('sg').href=g.sizeGuide||'#';$('features').textContent=g.features||'';$('etsy').href=g.etsyUrl;}
document.addEventListener('click',function(e){var t=e.target;
 if(t.dataset.c){if(st.colour!==t.dataset.c)st.img=0;st.colour=t.dataset.c;render()}if(t.dataset.s){st.size=t.dataset.s;render()}if(t.dataset.i){st.img=+t.dataset.i;render()}});
// Left/right arrows, a swipe, or the keyboard's arrow keys step through the photos.
function step(d){var n=pics().length;if(n<2)return;st.img=(st.img+d+n)%n;render()}
$('prev').addEventListener('click',function(){step(-1)});$('next').addEventListener('click',function(){step(1)});
(function(){var el=document.querySelector('.stage'),x0=null,y0=0;
 el.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
 el.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1)},{passive:true})})();
document.addEventListener('keydown',function(e){if(/^(INPUT|TEXTAREA)$/.test((e.target||{}).tagName||''))return;if(e.key==='ArrowLeft')step(-1);if(e.key==='ArrowRight')step(1)});
if(P){$('pname').addEventListener('input',function(){var had=st.name;st.name=cleanName(this.value);if(this.value!==st.name)this.value=st.name;
 // the first letter typed jumps to a photo that can show the name
 if(!had.trim()&&st.name.trim()){var ps=pics(),i=ps.findIndex(function(x){return x.live});if(i>=0&&!(ps[st.img]||{}).live)st.img=i}render()})}
$('add').addEventListener('click',function(){var v=variant(),g=G();if(!v)return;var b=B.get();
 var nm=P?st.name.trim():'';var ex=b.find(function(i){return i.code===g.code&&i.variant===v.id&&(i.name||'')===nm});if(ex)ex.qty=Math.min(10,ex.qty+1);
 else b.push({code:g.code,variant:v.id,qty:1,title:D.title,garment:g.label,colour:v.colour,size:v.size,price:v.price,name:nm,img:(pics()[0]||{}).thumb||''});
 B.set(b);$('added').style.display='block';});
(function(){try{var q=new URLSearchParams(location.search),c=q.get('colour'),z=q.get('size');if(c&&G().variants.some(function(v){return v.colour===c})){st.colour=c;if(z&&G().variants.some(function(v){return v.colour===c&&v.size===z}))st.size=z}}catch(_){}})();
render();`;
  return page(name, `<div class="design"><div><div class="stagefr"><div class="stage"><img id="main" class="main-img" alt="${esc(name)}"><div id="live" class="live" aria-hidden="true"></div><button id="prev" class="nav prev" type="button" aria-label="Previous photo">‹</button><button id="next" class="nav next" type="button" aria-label="Next photo">›</button><div id="count" class="count"></div></div></div><div id="thumbs" class="thumbs"></div></div>
<div><p class="label">${esc(coll.name)} · ${esc(g0.label)}</p><h1 style="margin-top:4px">${esc(d.title)}</h1>
<div class="gag">${esc(d.text)}</div>
<div class="label">Colour: <span id="cname"></span></div><div id="colours" class="chips"></div>
<div class="label">Size <a id="sg" href="#" target="_blank" rel="noopener" class="note" style="text-transform:none;letter-spacing:0">(size guide)</a></div><div id="sizes" class="chips"></div>
${g0.personal ? `<div class="label">Your name</div><input id="pname" class="pname" maxlength="${g0.personal.max}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. ${esc(g0.personal.sample || "SAM")}">
<p class="note" style="margin-top:6px">Up to ${g0.personal.max} letters, printed in capitals. The picture is a preview: we check every name before printing, and may decline an order and refund it.</p>` : ""}
<div id="price" class="price"></div><p class="note">Free UK delivery · Printed to order, usually with you in 4–10 working days</p>
<button id="add" class="btn" style="width:100%;margin-top:10px">Choose a size</button>
<div id="added" class="box" style="display:none">Added. <a href="/uk/basket"><b>Go to basket →</b></a></div>
<div class="box"><p class="note" style="margin:0 0 8px">${esc(coll.line)}</p><p id="features" class="note" style="white-space:pre-line;margin:0"></p></div>
${others.length ? `<p class="note">Also on: ${others.map((t) => `<a href="/uk/p/${productSlug(d, t)}">${esc(d.garments[t].label)}</a>`).join(" · ")}</p>` : ""}
<p class="note">Prefer Etsy? <a id="etsy" href="#" rel="noopener">This ${esc(g0.label.toLowerCase())} on Etsy</a></p></div></div>`, { script, coll: d.coll, desc: `${name}: ${d.text.replace(/\s+/g, " ")}` });
}

// The mascot (Barry's hoodie character, brand-logos/mascot/): a short message with him in a pose, for empty or lost
// pages. The "sticker" versions (white outline) are used because most of the site is dark.
function mascotMsg(pose, title, line, href, cta) {
  return `<div class="mascot-msg"><img src="/s/mascot-${pose}-sticker.png?v=1" alt="" width="200"><h1>${title}</h1><p class="muted">${line}</p><a class="btn" href="${href}">${cta}</a></div>`;
}
function basketPage() {
  const script = `
function money(p){return '£'+(p/100).toFixed(2)}
function draw(){var b=B.get(),el=document.getElementById('list');
 if(!b.length){el.innerHTML=${JSON.stringify(mascotMsg("sit", "Your basket’s empty.", "Just him in here, and he likes it that way. You don’t have to.", "/uk/shop", "Go shopping"))};document.getElementById('pay').style.display='none';document.getElementById('total').textContent='';document.getElementById('bh').hidden=document.getElementById('bn').hidden=true;return}
 el.innerHTML=b.map(function(i,n){return '<div class="row"><img src="'+i.img+'" alt=""><div style="flex:1"><b>'+i.title+'</b><br><span class="note">'+i.garment+' · '+i.colour+' · '+i.size+(i.name?' · Name: '+i.name:'')+'</span></div><div class="qty"><button data-d="'+n+'">−</button>'+i.qty+'<button data-u="'+n+'">+</button></div><b>'+money(i.price*i.qty)+'</b></div>'}).join('');
 document.getElementById('total').textContent='Total '+money(b.reduce(function(a,i){return a+i.price*i.qty},0))+' · free UK delivery';document.getElementById('pay').style.display='';}
document.addEventListener('click',function(e){var b=B.get(),t=e.target;
 if(t.dataset.u){b[+t.dataset.u].qty=Math.min(10,b[+t.dataset.u].qty+1)}else if(t.dataset.d){var i=+t.dataset.d;b[i].qty--;if(b[i].qty<1)b.splice(i,1)}else return;B.set(b);draw()});
document.getElementById('pay').addEventListener('click',async function(){var btn=this;btn.disabled=true;btn.textContent='Opening secure checkout…';
 try{var r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:B.get().map(function(i){return{code:i.code,variant:i.variant,qty:i.qty,name:i.name||''}})})});
 var o=await r.json();if(o.url){location.href=o.url;return}alert(o.error||'Sorry, checkout is unavailable right now.')}catch(e){alert('Sorry, checkout is unavailable right now.')}
 btn.disabled=false;btn.textContent='Checkout securely';});
draw();`;
  return page("Basket", `<h1 id="bh">Your basket</h1><div id="list"></div><p id="total" class="price" style="font-size:20px"></p>
<button id="pay" class="btn" style="width:100%;max-width:420px">Checkout securely</button>
<p class="note" id="bn">You'll pay on Stripe's secure checkout page. We never see your card details.</p>`, { script, noindex: true });
}

function thanksPage() {
  return page("Thank you", `<div class="centre"><img class="mascot-wave" src="/s/mascot-wave-sticker.png?v=1" alt="" width="120"><h1>Thank you</h1><p>Your order's in. You'll get a receipt by email now, and tracking details once it's on its way, usually within 4–10 working days.</p>
<p id="ipnote" class="box" style="display:none;text-align:left"></p>
<p class="muted">We'll try not to make conversation about it.</p><p><a class="btn ghost" href="/uk/shop">Back to the shop</a></p></div>`, { script: "try{var b=B.get(),p=b.filter(function(i){return i.name}),o=b.length-p.length,n=document.getElementById('ipnote');if(p.length){n.style.display='block';n.textContent='Your In Person '+(p.length>1?'items are':'item is')+' printed with your name, which we check by hand first, so allow an extra day or two.'+(o?' It will arrive separately from the rest of your order, so expect two parcels.':'')}localStorage.removeItem('ih_basket')}catch(e){}B.count();", noindex: true });
}

function legalPage(which) {
  const ADDRESS = "Bay B52, Unit 66 Queens Court Trading Estate, Greets Green Road, West Bromwich, West Midlands, B70 9EQ";
  const EMAIL = "admin@mosspit.org";
  const pages = {
    terms: ["Terms of sale", `<p>These terms apply to orders placed on introverthere.com. The seller is Mosspit Studios (sole trader), trading as Introvert Here, ${ADDRESS}. Contact: ${EMAIL}.</p>
<p>Prices are in pounds sterling and include delivery to UK addresses. We are not VAT-registered, so no VAT is charged. Every item is printed to order by our production partner and posted directly to you, usually within 4–10 working days.</p>
<p>A contract is formed when your payment is accepted and we email your receipt. If we can't fulfil an order we'll refund you in full.</p>
<p>Nothing in these terms affects your statutory rights.</p>`],
    returns: ["Returns and refunds", `<p><b>Faulty or wrong item:</b> if your item arrives damaged, misprinted or isn't what you ordered, email ${EMAIL} within 30 days with a photo and we'll replace it or refund you in full. You won't need to send it back.</p>
<p><b>Changed your mind:</b> you have 30 days from receiving your order to change your mind (the law gives you 14; we give you 30). Tell us by email within that time, then return the item unworn within 14 days of telling us, and we'll refund the price within 14 days of receiving it. Return postage is paid by you.</p>
<p><b>Personalised items (In Person):</b> these are printed with the name you give us, so they can't be returned or refunded for a change of mind. If one arrives faulty, damaged, or with a name different from the one you typed, the faulty-item promise above applies in full.</p>
<p><b>Return address:</b> Introvert Here returns, ${ADDRESS}. Please email us first so we know to expect it.</p>`],
    privacy: ["Privacy", `<p>We collect only what we need to take payment and deliver your order: your name, email, phone number and delivery address. Payment is handled by Stripe; we never see your card details. Your delivery details are passed to our print partner (Printify) to make and post your order.</p>
<p>We keep order records for as long as the law requires for accounts. We don't sell your data, send marketing without asking, or use advertising cookies. This site stores your chosen country and basket on your own device only.</p>
<p>Controller: Mosspit Studios, ${ADDRESS}. Questions or requests: ${EMAIL}. You can also complain to the Information Commissioner's Office (ico.org.uk).</p>`],
    contact: ["Contact", `<p>Email: ${EMAIL}</p><p>Post: Mosspit Studios, ${ADDRESS}</p><p>We reply as soon as we can, usually within two working days. In writing. Obviously.</p>`],
  };
  const [title, body] = pages[which];
  return page(title, `<h1>${title}</h1><div class="box">${body}</div>`, {});
}
