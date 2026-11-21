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
      if (path === "/uk/shop") return html(shopPage(await catalog(env), url.searchParams.get("c"), url.searchParams.get("t")));
      if (path === HUB.path) return html(hubPage());
      if (path === "/uk/comfort-zone") return Response.redirect(url.origin + HUB.path, 302);   // its first name
      if (path.startsWith("/uk/p/")) {
        const cat = await catalog(env), want = path.slice(6);
        for (const d of cat.designs) for (const t of Object.keys(d.garments)) if (productSlug(d, t) === want) return html(productPage(d, t, cat));
        // Old addresses were one page per gag: send them to that gag's first garment.
        const old = cat.designs.find((x) => x.slug === want);
        if (old) return Response.redirect(url.origin + "/uk/p/" + productSlug(old, cat.garmentOrder.find((t) => old.garments[t])), 302);
        return html(page("Not found", `<p>That isn't here. <a href="/uk/shop">Back to the shop</a>.</p>`), 404);
      }
      if (path === "/uk/basket") return html(basketPage());
      if (path === "/uk/thanks") return html(thanksPage());
      if (path === "/terms" || path === "/returns" || path === "/privacy" || path === "/contact") return html(legalPage(path.slice(1)));
      if (path === "/catalog.json") return json(await catalog(env));
      if (["/logo.png", "/icon.png", "/hero.jpg", "/logo-stacked.jpg", "/concrete.jpg", "/hero-SH.jpg", "/hero-PC.jpg", "/hero-OS.jpg", "/bg-SH.jpg", "/bg-PC.jpg", "/bg-OS.jpg", "/hero-EX.jpg", "/bg-EX.jpg", "/hero-IP.jpg", "/bg-IP.jpg", "/logo-wide.png", "/logo-ER-wide.png", "/bg-IP2.jpg", "/bg-SH2.jpg"].includes(path) || /^\/logo-[A-Z]{2}\.png$/.test(path)) {
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
      const sp = /^\/s\/([a-z0-9-]+)\.jpg$/.exec(path);   // site pictures (door scenes and the like), from R2 site/
      if (sp) {
        const obj = env.PHOTOS ? await env.PHOTOS.get("site/" + sp[1] + ".jpg") : null;
        return obj ? new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ETag: obj.httpEtag } }) : new Response("", { status: 404 });
      }
      const mk = /^\/m\/([0-9a-f]{16})\.jpg$/.exec(path); // Printify mockups on range backgrounds (shop/mockups/)
      if (mk) {
        let buf = (isPreview(env) && (await env.PENDING.get("shop:preview:m-" + mk[1] + ".jpg", "arrayBuffer"))) || (await env.PENDING.get("shop:m-" + mk[1] + ".jpg", "arrayBuffer"));
        if (!buf) { const r = await fetch(MOCKUP_STORE + mk[1] + ".jpg", { cf: { cacheTtl: 86400, cacheEverything: true } }); if (r.ok) buf = await r.arrayBuffer(); }
        return buf ? new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } }) : new Response("", { status: 404 });
      }
      return html(page("Not found", `<p>Nothing here. <a href="/uk">Go to the front page</a>.</p>`), 404);
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
        await fetch(`https://api.printify.com/v1/shops/${PRINTIFY_SHOP}/orders/${out.id}/send_to_production.json`, { method: "POST", headers: { Authorization: "Bearer " + token, "User-Agent": "IntrovertHereShop/1.0" } });
        record.status = "sent-to-production";
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
/* In the Escape Room the header logo wears its DO NOT ENTER hanger, which dangles below the header bar. */
header{position:relative;z-index:5}header img.wl.er{height:72px;margin-bottom:-34px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
.door .badge{position:absolute;left:clamp(14px,2.2vw,28px);top:clamp(14px,2.2vw,28px);width:clamp(110px,16vw,210px);height:auto;filter:drop-shadow(0 8px 18px rgba(0,0,0,.55))}
.door.wide .badge{left:auto;right:clamp(14px,2.4vw,34px);top:clamp(12px,2vw,26px);width:clamp(120px,22vw,300px)}
.door.er{border:clamp(3px,.6vw,7px) solid #fad00c}
.strap{text-align:center;font-weight:800;text-transform:uppercase;letter-spacing:.2em;font-size:clamp(13px,1.7vw,20px);margin:clamp(22px,3.4vw,44px) 0 clamp(4px,1vw,12px);text-wrap:balance}
.basket-link{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-weight:600;white-space:nowrap}
nav.top{display:flex;align-items:center;gap:clamp(10px,2.4vw,26px);font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
nav.top a{text-decoration:none;opacity:.78;white-space:nowrap}nav.top a:hover,nav.top a.on{opacity:1}nav.top a.on:not(.basket-link){border-bottom:2px solid currentColor;padding-bottom:2px}
nav.top .basket-link{opacity:1;letter-spacing:.02em;text-transform:none}
@media(max-width:520px){nav.top{font-size:12px;gap:10px;letter-spacing:.04em}header img{height:40px}header img.wl{height:auto;width:29vw;max-width:150px}header img.wl.er{height:auto;margin-bottom:-3.8vw}nav.top .basket-link{padding:5px 10px}}
/* Front page: two doors of equal weight, then a strip from each side */
.doors{display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px,2vw,22px);margin:clamp(14px,2.4vw,26px) 0 0}
.door{position:relative;display:block;overflow:hidden;border-radius:clamp(14px,1.8vw,22px);aspect-ratio:4/5;max-height:74vh;width:100%;text-decoration:none;color:#fff;background:#000;border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 60px rgba(0,0,0,.45);isolation:isolate}
.door>img.pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:transform 1.4s cubic-bezier(.2,.7,.2,1),opacity 1.6s ease}
.door>img.pic.on{opacity:1}
.door .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.55) 68%,rgba(0,0,0,.9) 100%)}
.door .in{position:absolute;left:0;right:0;bottom:0;padding:clamp(18px,3vw,38px);display:flex;flex-direction:column;gap:8px}
.door .kicker{font-size:12px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;opacity:.82}
.door b{font-size:clamp(30px,4.6vw,60px);line-height:1;font-weight:800;letter-spacing:.01em;text-transform:uppercase;text-wrap:balance}
.door .say{font-size:clamp(15px,1.5vw,19px);line-height:1.45;max-width:30ch;opacity:.94}
.door .go{align-self:flex-start;margin-top:10px;display:inline-flex;align-items:center;gap:10px;background:#f2f0ea;color:#141412;font-weight:700;font-size:15px;padding:12px 20px;border-radius:999px;transition:gap .3s,background .3s}
.door .go i,.sh a i{font-style:normal;transition:transform .3s}
.door:hover>img.pic{transform:scale(1.045)}.door:hover .go{gap:16px;background:#fff}
.door.wide{aspect-ratio:21/9;max-height:46vh;margin-top:clamp(14px,2.4vw,26px)}.door.wide>img.pic{object-position:50% var(--fy,30%)}
.strip{margin:clamp(40px,6vw,80px) 0 0}.strip:last-of-type{margin-bottom:clamp(40px,6vw,80px)}
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
@media(max-width:760px){.doors{grid-template-columns:1fr}.door{aspect-ratio:1/1.08;max-height:none}.door>img.pic{object-position:50% 12%}.door.wide{aspect-ratio:16/10}.grid.four{grid-template-columns:1fr 1fr}.ranges{grid-template-columns:1fr 1fr}}
@media(min-width:761px) and (max-width:1000px){.ranges{grid-template-columns:repeat(3,1fr)}}
@media(prefers-reduced-motion:no-preference){.door,.strip{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}.door:nth-child(2){animation-delay:.12s}@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}}
h1{font-size:clamp(26px,5vw,40px);margin:24px 0 6px;letter-spacing:.02em;text-transform:uppercase;font-weight:800}
.hero{display:block;width:100%;height:auto;border-radius:clamp(8px,1.4vw,16px);margin:18px 0 6px;box-shadow:0 10px 30px rgba(0,0,0,.5);box-sizing:border-box;border:clamp(3px,.6vw,7px) solid var(--frame,#f2f0ea)}
h2{font-size:22px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.04em}
.muted{color:var(--muted)}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.tabs a{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;color:var(--muted)}
.tabs a.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.tabs.kinds{margin-top:-6px}.tabs.kinds a{border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin:12px 0 40px}
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
`;
function page(title, body, opts = {}) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${SHOP_NAME}</title><meta name="description" content="${esc(opts.desc || "Clothing for introverts, quiet people and the reluctantly sociable.")}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ""}<link rel="icon" href="/icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${STYLE}</style></head><body${opts.coll && opts.coll !== "IH" ? ` class="r-${opts.coll}"` : ""}>
<header><div class="wrap"><a href="/uk">${opts.nav === "hub" ? `<img class="wl er" src="/logo-ER-wide.png?v=${ASSET_V}" alt="${SHOP_NAME}: ${esc(HUB.name)}">` : `<img class="wl" src="${LOGO}" alt="${SHOP_NAME}">`}</a>${opts.noBasket ? "" : `<nav class="top"><a href="/uk/shop"${opts.nav === "shop" ? ' class="on"' : ""}>Shop</a><a href="${HUB.path}"${opts.nav === "hub" ? ' class="on"' : ""}>${esc(HUB.short)}</a><a class="basket-link" href="/uk/basket">Basket <span id="bc">0</span></a></nav>`}</div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap"><a href="/terms">Terms</a><a href="/returns">Returns</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href="/?change=1">Change country</a>
<p>Introvert Here is a Mosspit Studios brand. Payments are handled securely by Stripe.</p>${STAMP ? `<p>Preview copy, updated ${esc(STAMP)}.</p>` : ""}</div></footer>
<script>${BASKET_JS}</script>${opts.script ? `<script>${opts.script}</script>` : ""}</body></html>`;
}
const BASKET_JS = `
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
  if (coll && COLLECTIONS[coll] && coll !== "IH" && !COLLECTIONS[coll].plain) return `<img class="hero" style="--frame:${FRAME[coll] || FRAME.IH}" src="/hero-${coll}.jpg?v=${ASSET_V}" alt="${esc(COLLECTIONS[coll].name)}">`;
  return `<img class="hero" src="/hero.jpg?v=${ASSET_V}" alt="Introvert Here: quiet humour for socially exhausted people">`;
}
// The shop is product-led (Barry, 20 Nov): every garment is its own tile and its own page, and the gag is its name.
const TYPE_SLUG = { "T-SHIRT": "t-shirt", "LONG-SLEEVE": "long-sleeve", "SWEATSHIRT": "sweatshirt", "HOODIE": "hoodie" };
const TYPE_PLURAL = { "T-SHIRT": "T-shirts", "LONG-SLEEVE": "Long sleeves", "SWEATSHIRT": "Sweatshirts", "HOODIE": "Hoodies" };
function productSlug(d, t) { return d.slug.slice(0, -d.id.length) + TYPE_SLUG[t] + "-" + d.id.toLowerCase(); }
function shopPage(cat, only, type) {
  if (!COLLECTIONS[only]) only = null;
  if (!TYPE_SLUG[type]) type = null;
  const present = [...new Set(cat.designs.map((d) => d.coll))];
  const link = (c, t) => "/uk/shop" + (c || t ? "?" + [c && "c=" + c, t && "t=" + t].filter(Boolean).join("&") : "");
  const tabs = `<nav class="tabs"><a href="${link(null, type)}" class="${only ? "" : "on"}">All ranges</a>${Object.entries(COLLECTIONS).filter(([k]) => present.includes(k)).map(([k, c]) => `<a href="${link(k, type)}" class="${only === k ? "on" : ""}">${esc(c.name)}</a>`).join("")}</nav>`;
  const list = cat.designs.filter((d) => !only || d.coll === only);
  const types = cat.garmentOrder.filter((t) => list.some((d) => d.garments[t]));
  const kinds = `<nav class="tabs kinds"><a href="${link(only, null)}" class="${type ? "" : "on"}">Everything</a>${types.map((t) => `<a href="${link(only, t)}" class="${type === t ? "on" : ""}">${TYPE_PLURAL[t]}</a>`).join("")}</nav>`;
  const tiles = mixedItems(cat, list, type ? [type] : types).map(tileHtml).join("");
  const intro = only ? `<p class="muted">${esc(COLLECTIONS[only].line)}</p>` : `<p class="muted">Clothing for introverts, quiet people and the reluctantly sociable. Free UK delivery on everything.</p>`;
  return page(only ? COLLECTIONS[only].name : "Shop", `${heroImg(only)}<h1>${only ? esc(COLLECTIONS[only].name) : "The shop"}</h1>${intro}${tabs}${kinds}<div class="grid">${tiles || '<p class="muted">Nothing here yet.</p>'}</div>`, { coll: only, nav: "shop" });
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
  return `<a class="tile" href="/uk/p/${productSlug(d, t)}"><img loading="lazy" src="${esc(img)}" alt="${esc(d.title + " " + g.label)}"><div class="cap"><div><b>${esc(d.title)}</b><span>${esc(g.label)}</span><span>${varies ? "from " : ""}${money(g.priceFrom)}</span></div><img class="rl" loading="lazy" src="/logo-${d.coll}.png?v=${ASSET_V}" alt="${esc((COLLECTIONS[d.coll] || {}).name || "")}"></div></a>`;
}

// ---------------- front page and the hub ----------------
// One site, two halves of equal weight (Barry, 20 Nov): the shop, and a hub for introverts (phone toys for the bus
// queue, paper escape rooms, a vote on the next gag...). The hub's name and wording are placeholders for Barry.
const HUB = { path: "/uk/escape-room", name: "The Escape Room", short: "Escape Room",   // Barry's name for it (21 Nov)
  logo: "/logo-ER.png?v=4",   // the stacked logo with its DO NOT ENTER door hanger (brand-logos/escape-room/)
  line: "A room to get away from people. Interaction distractions inside.",   // "interaction distractions" is Barry's phrase for what's in here
  things: [
    { name: "Look Busy", line: "A very important screen for your phone. Nobody interrupts a person with 3 unread messages from Work.", soon: true },
    { name: "The Excuse Generator", line: "One tap. One polite, plausible reason you can't make it.", soon: true },
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
  const ranges = Object.entries(COLLECTIONS).filter(([k]) => present.has(k)).map(([k, c]) => `<a href="/uk/shop?c=${k}"><span class="lg"><img loading="lazy" src="/logo-${k}.png?v=${ASSET_V}" alt="${esc(c.name)}"></span><b>${esc(c.name)}</b><span>${esc(RANGE_SHORT[k] || "")}</span></a>`).join("");
  const door = (href, pics, label, title, line, cta, badge) => `<a class="door${badge ? " er" : ""}" href="${href}">${doorPics(pics)}<span class="shade"></span>${badge ? `<img class="badge" src="${badge}" alt="">` : ""}<span class="in"><span class="kicker">${label}</span><b>${title}</b><span class="say">${line}</span><span class="go">${cta} <i>→</i></span></span></a>`;
  // No banner here (Barry, 21 Nov): one line of type, so the two doors are the first thing on the page.
  // The site's one-line mission statement (Barry, 21 Nov).
  return page("Everything you need to be left the hell alone", `<p class="strap">Everything you need to be left the hell alone.</p>
<section class="doors">
${door("/uk/shop", DOOR.shop, "Wear it", "The Shop", "Clothing that says it, so you don’t have to.", "Go shopping")}
${door(HUB.path, DOOR.hub, "Hide in it", esc(HUB.name), esc(HUB.line), "Come in", HUB.logo)}
</section>
<section class="strip"><div class="sh"><h2>New in the shop</h2><a href="/uk/shop">See everything <i>→</i></a></div><div class="grid four">${newest}</div></section>
<section class="strip"><div class="sh"><h2>Interaction distractions</h2><a href="${HUB.path}">Into ${esc(HUB.name)} <i>→</i></a></div><div class="things">${hubCards()}</div></section>
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
function hubPage() {
  return page(HUB.name, `<a class="door wide er" href="${HUB.path}" style="pointer-events:none">${doorPics(DOOR.hub)}<span class="shade"></span><img class="badge" src="${HUB.logo}" alt=""><span class="in"><span class="kicker">Hide in it</span><b>${esc(HUB.name)}</b><span class="say">${esc(HUB.line)}</span></span></a>
<p class="muted lead">Small, quiet things for bus queues, waiting rooms and parties you couldn’t get out of. No sign-up. No chat. Nobody will ask how you are.</p>
<div class="things">${hubCards()}</div>`, { nav: "hub", desc: HUB.name + ": " + HUB.line, script: DOOR_JS });
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
render();`;
  return page(name, `<div class="design"><div><div class="stage"><img id="main" class="main-img" alt="${esc(name)}"><div id="live" class="live" aria-hidden="true"></div><button id="prev" class="nav prev" type="button" aria-label="Previous photo">‹</button><button id="next" class="nav next" type="button" aria-label="Next photo">›</button><div id="count" class="count"></div></div><div id="thumbs" class="thumbs"></div></div>
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

function basketPage() {
  const script = `
function money(p){return '£'+(p/100).toFixed(2)}
function draw(){var b=B.get(),el=document.getElementById('list');
 if(!b.length){el.innerHTML='<p class="muted">Your basket is empty. <a href="/uk/shop">Back to the shop</a>.</p>';document.getElementById('pay').style.display='none';document.getElementById('total').textContent='';return}
 el.innerHTML=b.map(function(i,n){return '<div class="row"><img src="'+i.img+'" alt=""><div style="flex:1"><b>'+i.title+'</b><br><span class="note">'+i.garment+' · '+i.colour+' · '+i.size+(i.name?' · Name: '+i.name:'')+'</span></div><div class="qty"><button data-d="'+n+'">−</button>'+i.qty+'<button data-u="'+n+'">+</button></div><b>'+money(i.price*i.qty)+'</b></div>'}).join('');
 document.getElementById('total').textContent='Total '+money(b.reduce(function(a,i){return a+i.price*i.qty},0))+' · free UK delivery';document.getElementById('pay').style.display='';}
document.addEventListener('click',function(e){var b=B.get(),t=e.target;
 if(t.dataset.u){b[+t.dataset.u].qty=Math.min(10,b[+t.dataset.u].qty+1)}else if(t.dataset.d){var i=+t.dataset.d;b[i].qty--;if(b[i].qty<1)b.splice(i,1)}else return;B.set(b);draw()});
document.getElementById('pay').addEventListener('click',async function(){var btn=this;btn.disabled=true;btn.textContent='Opening secure checkout…';
 try{var r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:B.get().map(function(i){return{code:i.code,variant:i.variant,qty:i.qty,name:i.name||''}})})});
 var o=await r.json();if(o.url){location.href=o.url;return}alert(o.error||'Sorry, checkout is unavailable right now.')}catch(e){alert('Sorry, checkout is unavailable right now.')}
 btn.disabled=false;btn.textContent='Checkout securely';});
draw();`;
  return page("Basket", `<h1>Your basket</h1><div id="list"></div><p id="total" class="price" style="font-size:20px"></p>
<button id="pay" class="btn" style="width:100%;max-width:420px">Checkout securely</button>
<p class="note">You'll pay on Stripe's secure checkout page. We never see your card details.</p>`, { script, noindex: true });
}

function thanksPage() {
  return page("Thank you", `<div class="centre"><h1>Thank you</h1><p>Your order's in. You'll get a receipt by email now, and tracking details once it's on its way, usually within 4–10 working days.</p>
<p id="ipnote" class="box" style="display:none;text-align:left"></p>
<p class="muted">We'll try not to make conversation about it.</p><p><a class="btn ghost" href="/uk/shop">Back to the shop</a></p></div>`, { script: "try{var b=B.get(),p=b.filter(function(i){return i.name}),o=b.length-p.length,n=document.getElementById('ipnote');if(p.length){n.style.display='block';n.textContent='Your In Person '+(p.length>1?'items are':'item is')+' printed with your name, which we check by hand first, so allow an extra day or two.'+(o?' It will arrive separately from the rest of your order, so expect two parcels.':'')}localStorage.removeItem('ih_basket')}catch(e){}B.count();", noindex: true });
}

function legalPage(which) {
  const ADDRESS = "11 Buchanan Court, Station Road, Dingwall, Ross-shire, IV15 9XF";
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
