// Introvert Here shop (Cloudflare Worker "introvert-here-shop").
//
// Pages: home (/), about (/about), UK shop (/uk), range pages (/uk/r/<range>), design pages (/uk/p/<slug>), basket (/uk/basket),
//        thank-you (/uk/thanks), legal pages, country picker (/choose-country), "elsewhere" (sends non-UK visitors to Etsy),
//        robots.txt and sitemap.xml. Noindexed until INDEXING = "yes" (see wrangler.toml).
// API:   POST /api/checkout       -> builds a Stripe Checkout Session from the basket (prices from the catalogue, never the browser)
//        POST /api/stripe-webhook -> verified Stripe event; on payment, places the order with Printify (left on hold
//                                    for Barry to approve while AUTO_SEND is off) and records it for the approvals app.
//
// Data:  KV (binding PENDING, shared with the approvals app)
//          shop:catalog          catalogue built by shop/build_catalog.py
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
};
const ETSY_SHOP = "https://www.etsy.com/shop/IntrovertHereShop";
// Range pages live at /uk/r/<slug>; the old /uk?c=XX addresses redirect there.
const RANGE_SLUG = { IH: "introvert-here", SH: "shhh", PC: "per-contract", OS: "off-the-shelf" };
const rangeUrl = (k) => "/uk/r/" + RANGE_SLUG[k];

// Site settings from wrangler.toml [vars], filled in at the start of each request (env is the same for every request).
//   SITE_URL          the public address once a domain is chosen, e.g. https://introverthere.com (blank = this worker's own address)
//   INDEXING          "yes" lets search engines in; anything else keeps every page noindexed and robots.txt closed
//   CONTACT_EMAIL     support address shown on the legal and contact pages
//   BUSINESS_ADDRESS  trading address shown on the legal and contact pages
const CFG = { origin: "", index: false, email: "", address: "" };
function loadConfig(env, url) {
  CFG.origin = String(env.SITE_URL || url.origin).replace(/\/+$/, "");
  CFG.index = env.INDEXING === "yes";
  CFG.email = env.CONTACT_EMAIL || "";
  CFG.address = env.BUSINESS_ADDRESS || "";
}

let catalogCache = null, catalogAt = 0;
async function catalog(env) {
  if (!catalogCache || Date.now() - catalogAt > 300000) {
    catalogCache = (await env.PENDING.get("shop:catalog", "json")) || { designs: [] };
    catalogAt = Date.now();
  }
  return catalogCache;
}
const money = (p) => "£" + (p / 100).toFixed(2);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...extra } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const cookie = (req, name) => ((req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")) || [])[1];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    loadConfig(env, url);
    const res = await route(request, env, ctx, url);
    // Remember where the visitor seems to be (until they pick a country) so pages can offer Etsy to non-UK visitors.
    if (!cookie(request, "ih_geo") && (res.headers.get("Content-Type") || "").startsWith("text/html") && request.cf && request.cf.country) {
      const r = new Response(res.body, res);
      r.headers.append("Set-Cookie", `ih_geo=${encodeURIComponent(request.cf.country)}; Path=/; SameSite=Lax; Secure`);
      return r;
    }
    return res;
  },
};

async function route(request, env, ctx, url) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/stripe-webhook" && request.method === "POST") return await stripeWebhook(request, env, ctx);
      if (path === "/api/checkout" && request.method === "POST") return await checkout(request, env, url);
      if (path === "/country") {
        const c = url.searchParams.get("c");
        const dest = c === "GB" ? "/uk" : "/elsewhere?c=" + encodeURIComponent(c || "");
        return new Response(null, { status: 302, headers: { Location: dest, "Set-Cookie": `ih_country=${encodeURIComponent(c || "")}; Path=/; Max-Age=31536000; SameSite=Lax; Secure` } });
      }
      if (path === "/") {
        if (url.searchParams.has("change")) return Response.redirect(url.origin + "/choose-country", 302); // old footer link
        return html(homePage(await catalog(env)));
      }
      if (path === "/choose-country") return html(countryPage((request.cf && request.cf.country) || "GB"));
      if (path === "/elsewhere") return html(elsewherePage(url.searchParams.get("c")));
      if (path === "/about") return html(aboutPage(await catalog(env)));
      if (path === "/uk") {
        const c = url.searchParams.get("c");
        if (c && RANGE_SLUG[c]) return Response.redirect(url.origin + rangeUrl(c), 301);
        return html(shopPage(await catalog(env), null));
      }
      if (path.startsWith("/uk/r/")) {
        const k = Object.keys(RANGE_SLUG).find((x) => RANGE_SLUG[x] === path.slice(6));
        const cat = await catalog(env);
        return k && cat.designs.some((d) => d.coll === k) ? html(shopPage(cat, k)) : html(page("Not found", `<p>That range isn't in the shop yet. <a href="/uk">See everything</a>.</p>`, { noindex: true }), 404);
      }
      if (path.startsWith("/uk/p/")) {
        const d = (await catalog(env)).designs.find((x) => x.slug === path.slice(6));
        return d ? html(designPage(d, await catalog(env))) : html(page("Not found", `<p>That design isn't here. <a href="/uk">Back to the shop</a>.</p>`, { noindex: true }), 404);
      }
      if (path === "/uk/basket") return html(basketPage());
      if (path === "/uk/thanks") return html(thanksPage());
      if (path === "/terms" || path === "/returns" || path === "/privacy" || path === "/contact") return html(legalPage(path.slice(1)));
      if (path === "/robots.txt") return new Response(CFG.index ? `User-agent: *\nDisallow: /uk/basket\nDisallow: /uk/thanks\nDisallow: /api/\nSitemap: ${CFG.origin}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
      if (path === "/sitemap.xml") return new Response(sitemap(await catalog(env)), { headers: { "Content-Type": "application/xml" } });
      if (path === "/catalog.json") return json(await catalog(env));
      if (["/logo.png", "/icon.png", "/hero.jpg", "/logo-stacked.jpg", "/concrete.jpg", "/hero-SH.jpg", "/hero-PC.jpg", "/hero-OS.jpg", "/bg-SH.jpg", "/bg-PC.jpg", "/bg-OS.jpg"].includes(path)) {
        const buf = await env.PENDING.get("shop:" + path.slice(1), "arrayBuffer");
        return buf ? new Response(buf, { headers: { "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=86400" } }) : new Response("", { status: 404 });
      }
      const mk = /^\/m\/([0-9a-f]{16})\.jpg$/.exec(path); // Printify mockups on range backgrounds (shop/mockups/)
      if (mk) {
        const buf = await env.PENDING.get("shop:m-" + mk[1] + ".jpg", "arrayBuffer");
        return buf ? new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } }) : new Response("", { status: 404 });
      }
      return html(page("Not found", `<p>Nothing here. <a href="/uk">Go to the shop</a>.</p>`, { noindex: true }), 404);
    } catch (e) {
      console.error(e);
      return html(page("Something went wrong", `<p>Sorry, something went wrong on our side. Please try again in a minute.</p>`, { noindex: true }), 500);
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
      const v = g.variants.find((x) => x.id === Number(it.variant));
      if (v) found = { d, g, v };
    }
    if (!found) continue; // item no longer sold: quietly dropped, the basket page re-checks
    const { d, g, v } = found;
    const p = `line_items[${n}]`;
    form[`${p}[quantity]`] = String(qty);
    form[`${p}[price_data][currency]`] = "gbp";
    form[`${p}[price_data][unit_amount]`] = String(v.price);
    form[`${p}[price_data][product_data][name]`] = `${d.title} – ${g.label}`;
    form[`${p}[price_data][product_data][description]`] = [v.colour, v.size].filter(Boolean).join(", ");
    const pic = ((g.mockups || []).find((m) => m.colour === v.colour) || {}).thumb || g.tile || (g.images[0] || {}).thumb;
    if (pic) form[`${p}[price_data][product_data][images][0]`] = pic.startsWith("/") ? url.origin + pic : pic; // Stripe needs a full address
    form[`${p}[price_data][product_data][metadata][code]`] = g.code;
    form[`${p}[price_data][product_data][metadata][printify_product_id]`] = g.printifyId;
    form[`${p}[price_data][product_data][metadata][printify_variant_id]`] = String(v.id);
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
    const lines = s.line_items.data.map((li) => ({
      product_id: li.price.product.metadata.printify_product_id,
      variant_id: Number(li.price.product.metadata.printify_variant_id),
      quantity: li.quantity,
      code: li.price.product.metadata.code, name: li.description, amount: li.amount_total,
    }));
    Object.assign(record, { name, email: cust.email, total: s.amount_total, items: lines.map(({ code, name, quantity, amount }) => ({ code, name, quantity, amount })),
      address: [addr.line1, addr.line2, addr.city, addr.postal_code].filter(Boolean).join(", ") });
    const order = {
      external_id: sessionId, label: "IH shop " + sessionId.slice(-8),
      line_items: lines.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity })),
      shipping_method: 1, send_shipping_notification: true,
      address_to: { first_name: first, last_name: last, email: cust.email || "", phone: cust.phone || "", country: addr.country || "GB",
        region: addr.state || "", address1: addr.line1 || "", address2: addr.line2 || "", city: addr.city || "", zip: addr.postal_code || "" },
    };
    if (!record.livemode && env.TEST_ORDERS_TO_PRINTIFY !== "yes") {
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
    const body = `${record.name || ""} · ${record.total != null ? money(record.total) : ""}\n${(record.items || []).map((i) => `${i.quantity} × ${i.name}`).join("\n")}\n${record.error || record.note || "Printify order " + (record.printifyOrder || "") + " (" + record.status + ")"}`;
    await fetch(env.ALERT_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Secret": env.INGEST_SECRET }, body: JSON.stringify({ title, body, source: "Shop", link: "/orders" }) }).catch(() => {});
  }
}

// ---------------- pages ----------------

// Bump ASSET_V whenever an image in KV changes, so browsers fetch the new one instead of a saved copy.
const ASSET_V = "3";
const LOGO = `/logo-stacked.jpg?v=${ASSET_V}`;
const STYLE = `
  :root{--bg:#121211;--panel:rgba(22,22,20,.86);--line:#3b3a35;--text:#f2f0ea;--muted:#a9a69c;--accent:#f2f0ea}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#121211 url(/concrete.jpg?v=${ASSET_V}) center top/1800px auto repeat;color:var(--text);font:16px/1.55 "Montserrat",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid var(--line);background:rgba(10,10,9,.55)}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}
header img{height:56px;width:auto;display:block;border-radius:4px}
.basket-link{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-weight:600;white-space:nowrap}
h1{font-size:clamp(26px,5vw,40px);margin:24px 0 6px;letter-spacing:.02em;text-transform:uppercase;font-weight:800}
.hero{display:block;width:100%;height:auto;border-radius:10px;margin:18px 0 6px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
h2{font-size:22px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.04em}
.muted{color:var(--muted)}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.tabs a{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;color:var(--muted)}
.tabs a.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin:12px 0 40px}
.tile{text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.tile img{width:100%;aspect-ratio:1;object-fit:cover;background:#000}
.tile div{padding:10px 12px}.tile b{display:block;font-size:15px}.tile span{color:var(--muted);font-size:14px}
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
body.r-PC{background:#0d1420 url(/bg-PC.jpg?v=${ASSET_V}) center top/1800px auto repeat}
body.r-OS{background:#2a0c0b url(/bg-OS.jpg?v=${ASSET_V}) center top/1800px auto repeat}
body.r-SH{background:#3a2112}
body.r-SH::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(rgba(20,10,4,.42),rgba(20,10,4,.42)),#3a2112 url(/bg-SH.jpg?v=${ASSET_V}) center/cover no-repeat}
body.r-SH .muted,body.r-SH .tabs a:not(.on){color:#e4d9cc}
.countries{display:grid;gap:10px;max-width:420px;margin:24px auto}.countries a{text-align:left}
.centre{text-align:center}
nav.top{display:flex;align-items:center;gap:6px}nav.top a{text-decoration:none;padding:6px 10px;font-weight:600;color:var(--muted)}nav.top a.on,nav.top a:hover{color:var(--text)}
nav.top a.basket-link{color:var(--text);margin-left:4px;padding:6px 14px}
.geo{background:#f2f0ea;color:#121211;font-size:14px;padding:8px 0}.geo button{margin-left:6px;font:inherit;font-size:13px;background:transparent;border:1px solid #121211;border-radius:999px;padding:2px 10px;cursor:pointer}
.geo a{color:#121211}
.foot-links{display:flex;flex-wrap:wrap;gap:6px 14px}.foot-links a{margin:0}
.lede{font-size:clamp(17px,2.2vw,20px);max-width:40ch;margin:8px 0 18px}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 8px}
.ranges{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin:12px 0 8px}
.range{position:relative;display:flex;flex-direction:column;text-decoration:none;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.range img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#000}
.range div{padding:12px 14px 14px}.range b{display:block;font-size:17px;letter-spacing:.04em}.range p{margin:6px 0 8px;color:var(--muted);font-size:14px}
.range span{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.range.r-PC{background:rgba(13,20,32,.9)}.range.r-OS{background:rgba(42,12,11,.9)}.range.r-SH{background:rgba(58,33,18,.9)}
.promises{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:28px 0}
.promises div{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}.promises b{display:block}.promises span{color:var(--muted);font-size:14px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center;margin:28px 0}
.split img{width:100%;border-radius:10px;display:block}
.prose{max-width:68ch}.prose p{margin:0 0 14px}
.see-all{font-weight:700;text-decoration:none;white-space:nowrap}
.head-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
@media(max-width:760px){.design,.split{grid-template-columns:1fr}header img{height:44px}nav.top a{padding:6px 6px}}
`;
const DEFAULT_DESC = "Clothing for introverts, quiet people and the reluctantly sociable. T-shirts, sweatshirts and hoodies that say it for you. Free UK delivery.";
const abs = (u) => (u && u.startsWith("/") ? CFG.origin + u : u || "");
// opts: desc, noindex, coll (range look), path (canonical address), image (social preview), ld (structured data), noBasket, script
function page(title, body, opts = {}) {
  const fullTitle = opts.bareTitle ? title : `${title} | ${SHOP_NAME}`;
  const desc = opts.desc || DEFAULT_DESC;
  const noindex = opts.noindex || !CFG.index;
  const img = abs(opts.image || `/hero.jpg?v=${ASSET_V}`);
  const head = [
    `<title>${esc(fullTitle)}</title>`, `<meta name="description" content="${esc(desc)}">`,
    noindex ? '<meta name="robots" content="noindex">' : "",
    opts.path ? `<link rel="canonical" href="${esc(CFG.origin + opts.path)}">` : "",
    `<meta property="og:site_name" content="${SHOP_NAME}"><meta property="og:type" content="${opts.ld && opts.ld["@type"] === "Product" ? "product" : "website"}">`,
    `<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}">`,
    opts.path ? `<meta property="og:url" content="${esc(CFG.origin + opts.path)}">` : "",
    `<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#121211">`,
    opts.ld ? `<script type="application/ld+json">${JSON.stringify(opts.ld).replace(/</g, "\\u003c")}</script>` : "",
  ].join("");
  const nav = `<nav class="top" aria-label="Main"><a href="/uk"${opts.navOn === "shop" ? ' class="on"' : ""}>Shop</a><a href="/about"${opts.navOn === "about" ? ' class="on"' : ""}>About</a>${opts.noBasket ? "" : '<a class="basket-link" href="/uk/basket">Basket <span id="bc">0</span></a>'}</nav>`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${head}<link rel="icon" href="/icon.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${STYLE}</style></head><body${opts.coll && opts.coll !== "IH" ? ` class="r-${opts.coll}"` : ""}>
<div id="geo" class="geo" hidden><div class="wrap">Not in the UK? Our own shop only posts to UK addresses for now. <a href="${ETSY_SHOP}" rel="noopener"><b>Every design is on Etsy</b></a>, which delivers to you. <button type="button" id="geo-uk">I'm in the UK</button></div></div>
<header><div class="wrap"><a href="/"><img src="${LOGO}" alt="${SHOP_NAME} home"></a>${nav}</div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap"><div class="foot-links"><a href="/uk">Shop</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/returns">Returns</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href="/choose-country">Change country</a><a href="${ETSY_SHOP}" rel="noopener">Etsy</a></div>
<p>Introvert Here is a Mosspit Studios brand. Payments are handled securely by Stripe.</p></div></footer>
<script>${BASKET_JS}${GEO_JS}</script>${opts.script ? `<script>${opts.script}</script>` : ""}</body></html>`;
}
// Shows the Etsy banner to visitors who picked a non-UK country, or (until they pick) whose connection looks non-UK.
const GEO_JS = `
(function(){function ck(n){var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
var c=ck('ih_country')||ck('ih_geo'),el=document.getElementById('geo');if(c&&c!=='GB'&&el){el.hidden=false;
document.getElementById('geo-uk').onclick=function(){document.cookie='ih_country=GB; Path=/; Max-Age=31536000; SameSite=Lax; Secure';el.hidden=true}}})();`;
const BASKET_JS = `
var B={get:function(){try{return JSON.parse(localStorage.getItem('ih_basket')||'[]')}catch(e){return[]}},
set:function(b){try{localStorage.setItem('ih_basket',JSON.stringify(b))}catch(e){}B.count()},
count:function(){var n=B.get().reduce(function(a,i){return a+i.qty},0);var el=document.getElementById('bc');if(el)el.textContent=n}};B.count();`;

function countryPage(guess) {
  const opts = [["GB", "United Kingdom"], ["US", "United States"], ["IE", "Ireland"], ["EU", "Elsewhere in Europe"], ["XX", "Somewhere else"]];
  const order = opts.slice().sort((a, b) => (b[0] === guess) - (a[0] === guess));
  return page("Choose your country", `<div class="centre"><h1>Where are we sending it?</h1>
<p class="muted">Pick your country so we can show you the right prices and delivery.</p></div>
<div class="countries">${order.map(([c, n], i) => `<a class="btn ${i ? "ghost" : ""}" href="/country?c=${c}">${n}${i ? "" : " ✓"}</a>`).join("")}</div>
<p class="centre note">We remember your choice on this device. You can change it at the bottom of any page.</p>`, { noBasket: true, noindex: true });
}

function elsewherePage(c) {
  return page("Buy on Etsy", `<div class="centre"><h1>We don't post there directly yet</h1>
<p>Our own shop only delivers in the UK for now. Every design is also on Etsy, which delivers to you and handles any local tax and duties.</p>
<p><a class="btn" href="${ETSY_SHOP}" rel="noopener">Shop Introvert Here on Etsy →</a></p>
<p class="note"><a href="/choose-country">Choose a different country</a></p></div>`, { noBasket: true, noindex: true });
}

// ----- shared bits -----
function heroImg(coll) {
  if (coll && COLLECTIONS[coll] && coll !== "IH") return `<img class="hero" src="/hero-${coll}.jpg?v=${ASSET_V}" alt="${esc(COLLECTIONS[coll].name)}">`;
  return `<img class="hero" src="/hero.jpg?v=${ASSET_V}" alt="Introvert Here: quiet humour for socially exhausted people">`;
}
const garmentsOf = (d, cat) => cat.garmentOrder.map((t) => d.garments[t]).filter(Boolean);
const tileImg = (d, cat) => { const g = garmentsOf(d, cat)[0]; return g.tile || (g.images[0] || {}).thumb || ((g.mockups || [])[0] || {}).thumb || ""; };
function tile(d, cat) {
  const gs = garmentsOf(d, cat);
  const from = Math.min(...gs.map((g) => g.priceFrom));
  return `<a class="tile" href="/uk/p/${d.slug}"><img loading="lazy" src="${esc(tileImg(d, cat))}" alt="${esc(d.title)}"><div><b>${esc(d.title)}</b><span>${gs.length > 1 ? "From " : ""}${money(from)} · ${gs.map((g) => g.label).join(", ")}</span></div></a>`;
}
// Ranges that have at least one design in the shop, in the order of COLLECTIONS.
const liveRanges = (cat) => Object.keys(COLLECTIONS).filter((k) => cat.designs.some((d) => d.coll === k));
function rangeCards(cat) {
  return `<div class="ranges">${liveRanges(cat).map((k) => {
    const n = cat.designs.filter((d) => d.coll === k).length;
    const first = cat.designs.find((d) => d.coll === k);
    const img = tileImg(first, cat); // a garment from the range (the range banners have lettering that crops badly)
    return `<a class="range r-${k}" href="${rangeUrl(k)}"><img loading="lazy" src="${esc(img)}" alt=""><div><b>${esc(COLLECTIONS[k].name)}</b><p>${esc(COLLECTIONS[k].line)}</p><span>${n} design${n === 1 ? "" : "s"} →</span></div></a>`;
  }).join("")}</div>`;
}
const PROMISES = `<div class="promises"><div><b>Free UK delivery</b><span>On everything, no minimum.</span></div>
<div><b>Printed to order</b><span>Made for you and posted, usually within 4–10 working days.</span></div>
<div><b>Secure checkout</b><span>Payments by Stripe. We never see your card.</span></div>
<div><b>Faulty? Replaced.</b><span>Photo by email, no need to send it back.</span></div></div>`;
const orgLd = () => ({ "@context": "https://schema.org", "@type": "Organization", name: SHOP_NAME, url: CFG.origin + "/", logo: CFG.origin + "/icon.png", sameAs: [ETSY_SHOP], parentOrganization: { "@type": "Organization", name: "Mosspit Studios" } });

// ----- home -----
function homePage(cat) {
  const newest = cat.designs.slice(0, 8); // catalogue is newest first
  const body = `${heroImg()}
<h1>Clothing that says it for you</h1>
<p class="lede">T-shirts, long sleeves, sweatshirts and hoodies for introverts, quiet people and the reluctantly sociable. Each one carries a single line that says it for you, so you don't have to.</p>
<div class="ctas"><a class="btn" href="/uk">Shop everything</a><a class="btn ghost" href="/about">What's this about?</a></div>
${PROMISES}
<h2>The ranges</h2><p class="muted">Pick the flavour of not wanting to talk about it.</p>
${rangeCards(cat)}
<div class="head-row"><h2>New in</h2><a class="see-all" href="/uk">See all ${cat.designs.length} →</a></div>
<div class="grid">${newest.map((d) => tile(d, cat)).join("") || '<p class="muted">Nothing here yet.</p>'}</div>`;
  return page(`${SHOP_NAME}: clothing for introverts`, body, { bareTitle: true, path: "/", ld: orgLd() });
}

// ----- about -----
function aboutPage(cat) {
  const body = `<h1>About Introvert Here</h1>
<div class="split"><div class="prose">
<p><b>Some people would rather not explain themselves.</b> Introvert Here makes clothes that do the explaining for them: one line, printed once, worn as often as needed.</p>
<p>It started with a single sentence opener, “Introvert here…”, finished with whatever someone of few words would say if they could be bothered. It turned out there was a lot left unsaid. Then came the ranges for the quiet, the contractually sociable and the people who'd rather be in a book.</p>
<p>Everything is printed to order, so nothing sits in a warehouse waiting to be wanted, and it's posted straight to you.</p>
</div><img src="/hero.jpg?v=${ASSET_V}" alt="Introvert Here designs"></div>
<h2>The ranges</h2>
${rangeCards(cat)}
<h2>Who's behind it</h2>
<div class="prose"><p>Introvert Here is a Mosspit Studios brand. Mosspit Studios makes clothing for people who've sat through one meeting too many, and is a small operation that would prefer you emailed.</p>
<p><a href="/contact">Get in touch</a> (in writing, naturally), or <a href="${ETSY_SHOP}" rel="noopener">find us on Etsy</a> if you're outside the UK.</p></div>
${PROMISES}`;
  return page("About", body, { path: "/about", navOn: "about", desc: "Introvert Here makes clothing for introverts, quiet people and the reluctantly sociable. One line, printed once, so it never has to be said out loud." });
}

// ----- shop and range pages -----
function shopPage(cat, only) {
  const ranges = liveRanges(cat);
  const tabs = ranges.length > 1 ? `<nav class="tabs" aria-label="Ranges"><a href="/uk" class="${only ? "" : "on"}">All</a>${ranges.map((k) => `<a href="${rangeUrl(k)}" class="${only === k ? "on" : ""}">${esc(COLLECTIONS[k].name)}</a>`).join("")}</nav>` : "";
  const list = cat.designs.filter((d) => !only || d.coll === only);
  const intro = only ? `<p class="muted">${esc(COLLECTIONS[only].line)}</p>` : `<p class="muted">Clothing for introverts, quiet people and the reluctantly sociable. Free UK delivery on everything.</p>`;
  const name = only ? COLLECTIONS[only].name : "The shop";
  const path = only ? rangeUrl(only) : "/uk";
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name, url: CFG.origin + path,
    mainEntity: { "@type": "ItemList", itemListElement: list.map((d, i) => ({ "@type": "ListItem", position: i + 1, url: CFG.origin + "/uk/p/" + d.slug })) } };
  return page(only ? COLLECTIONS[only].name : "Shop", `${heroImg(only)}<h1>${esc(name)}</h1>${intro}${tabs}<div class="grid">${list.map((d) => tile(d, cat)).join("") || '<p class="muted">Nothing here yet.</p>'}</div>`,
    { coll: only, path, navOn: "shop", ld, image: only && only !== "IH" ? `/hero-${only}.jpg?v=${ASSET_V}` : undefined, desc: only ? `${COLLECTIONS[only].name} by Introvert Here. ${COLLECTIONS[only].line}` : undefined });
}

function designPage(d, cat) {
  const gs = cat.garmentOrder.filter((t) => d.garments[t]);
  const data = { id: d.id, title: d.title, garments: Object.fromEntries(gs.map((t) => [t, d.garments[t]])) , order: gs };
  const coll = COLLECTIONS[d.coll] || COLLECTIONS.IH;
  const script = `
var D=${JSON.stringify(data).replace(/</g, "\\u003c")};var st={g:D.order[0],colour:null,size:null,img:0};
function $(i){return document.getElementById(i)}function money(p){return '£'+(p/100).toFixed(2)}
function G(){return D.garments[st.g]}
function colours(){var seen={},out=[];G().variants.forEach(function(v){if(!seen[v.colour]){seen[v.colour]=1;out.push(v)}});return out}
function sizes(){return G().variants.filter(function(v){return v.colour===st.colour})}
function pics(){var g=G(),c=st.colour,m=(g.mockups||[]).filter(function(x){return x.colour===c}),own=g.images.filter(function(i){return i.colour===c}),any=g.images.filter(function(i){return !i.colour});return c===g.mainColour?own.concat(m,any):m.concat(own,any)}
function variant(){return G().variants.find(function(v){return v.colour===st.colour&&v.size===st.size})}
function render(){var g=G();
 $('garments').innerHTML=D.order.map(function(t){return '<button class="chip'+(t===st.g?' on':'')+'" data-g="'+t+'">'+D.garments[t].label+'</button>'}).join('');
 var cs=colours();if(!cs.some(function(v){return v.colour===st.colour}))st.colour=g.mainColour||cs[0].colour;
 $('colours').innerHTML=cs.map(function(v){return '<button class="swatch'+(v.colour===st.colour?' on':'')+'" title="'+v.colour+'" aria-label="'+v.colour+'" data-c="'+v.colour+'" style="background:'+(v.hex||'#888')+'"></button>'}).join('');
 $('cname').textContent=st.colour;
 var ss=sizes();if(!ss.some(function(v){return v.size===st.size}))st.size=null;
 $('sizes').innerHTML=ss.map(function(v){return '<button class="chip'+(v.size===st.size?' on':'')+'" data-s="'+v.size+'">'+v.size+'</button>'}).join('');
 var v=variant();$('price').textContent=money(v?v.price:g.priceFrom);$('add').disabled=!v;$('add').textContent=v?'Add to basket':'Choose a size';
 var ps=pics();if(st.img>=ps.length)st.img=0;$('main').src=(ps[st.img]||{}).url||'';$('main').alt=D.title+(ps[st.img]&&ps[st.img].colour?' in '+ps[st.img].colour:'');
 $('thumbs').innerHTML=ps.map(function(im,i){return '<img src="'+im.thumb+'" class="'+(i===st.img?'on':'')+'" data-i="'+i+'" alt="">'}).join('');
 $('sg').style.display=g.sizeGuide?'':'none';$('sg').href=g.sizeGuide||'#';$('features').textContent=g.features||'';$('etsy').href=g.etsyUrl;}
document.addEventListener('click',function(e){var t=e.target;
 if(t.dataset.g){st.g=t.dataset.g;st.img=0;render()}if(t.dataset.c){if(st.colour!==t.dataset.c)st.img=0;st.colour=t.dataset.c;render()}if(t.dataset.s){st.size=t.dataset.s;render()}if(t.dataset.i){st.img=+t.dataset.i;render()}});
$('add').addEventListener('click',function(){var v=variant(),g=G();if(!v)return;var b=B.get();
 var ex=b.find(function(i){return i.code===g.code&&i.variant===v.id});if(ex)ex.qty=Math.min(10,ex.qty+1);
 else b.push({code:g.code,variant:v.id,qty:1,title:D.title,garment:g.label,colour:v.colour,size:v.size,price:v.price,img:(pics()[0]||{}).thumb||''});
 B.set(b);$('added').style.display='block';});
render();`;
  return page(d.title, `<div class="design"><div><img id="main" class="main-img" alt="${esc(d.title)}"><div id="thumbs" class="thumbs"></div></div>
<div><p class="label"><a href="${RANGE_SLUG[d.coll] ? rangeUrl(d.coll) : "/uk"}" style="text-decoration:none">${esc(coll.name)}</a></p><h1 style="margin-top:4px">${esc(d.title)}</h1>
<div class="gag">${esc(d.text)}</div>
<div class="label">Garment</div><div id="garments" class="chips"></div>
<div class="label">Colour: <span id="cname"></span></div><div id="colours" class="chips"></div>
<div class="label">Size <a id="sg" href="#" target="_blank" rel="noopener" class="note" style="text-transform:none;letter-spacing:0">(size guide)</a></div><div id="sizes" class="chips"></div>
<div id="price" class="price"></div><p class="note">Free UK delivery · Printed to order, usually with you in 4–10 working days</p>
<button id="add" class="btn" style="width:100%;margin-top:10px">Choose a size</button>
<div id="added" class="box" style="display:none">Added. <a href="/uk/basket"><b>Go to basket →</b></a></div>
<div class="box"><p class="note" style="margin:0 0 8px">${esc(coll.line)}</p><p id="features" class="note" style="white-space:pre-line;margin:0"></p></div>
<p class="note">Prefer Etsy? <a id="etsy" href="#" rel="noopener">This design on Etsy</a></p></div></div>${moreLikeThis(d, cat)}`,
    { script, coll: d.coll, path: "/uk/p/" + d.slug, navOn: "shop", image: tileImg(d, cat), ld: productLd(d, cat), desc: `${d.title}: ${d.text.replace(/\s+/g, " ")}` });
}
function moreLikeThis(d, cat) {
  const same = cat.designs.filter((x) => x.coll === d.coll && x.id !== d.id);
  const pick = (same.length >= 4 ? same : same.concat(cat.designs.filter((x) => x.coll !== d.coll))).slice(0, 4);
  if (!pick.length) return "";
  const k = same.length >= 4 ? d.coll : null; // topped up from other ranges, so don't claim they're all this range
  return `<div class="head-row"><h2>${k ? "More " + esc((COLLECTIONS[k] || COLLECTIONS.IH).name) : "You might also like"}</h2><a class="see-all" href="${k && RANGE_SLUG[k] ? rangeUrl(k) : "/uk"}">See all →</a></div><div class="grid">${pick.map((x) => tile(x, cat)).join("")}</div>`;
}
function productLd(d, cat) {
  const gs = garmentsOf(d, cat);
  const prices = gs.flatMap((g) => g.variants.map((v) => v.price));
  const imgs = [...new Set(gs.flatMap((g) => [g.tile, ...(g.mockups || []).map((m) => m.url)]).filter(Boolean))].slice(0, 6).map(abs);
  return { "@context": "https://schema.org", "@type": "Product", name: d.title, description: d.text.replace(/\s+/g, " "), image: imgs, sku: d.id,
    brand: { "@type": "Brand", name: SHOP_NAME }, category: "Apparel & Accessories > Clothing",
    offers: { "@type": "AggregateOffer", priceCurrency: "GBP", lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: prices.length, availability: "https://schema.org/InStock", url: CFG.origin + "/uk/p/" + d.slug,
      shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "GBP" }, shippingDestination: { "@type": "DefinedRegion", addressCountry: "GB" } } } };
}
function sitemap(cat) {
  const urls = ["/", "/uk", "/about", ...liveRanges(cat).map(rangeUrl), ...cat.designs.map((d) => "/uk/p/" + d.slug), "/terms", "/returns", "/privacy", "/contact"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(CFG.origin + u)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function basketPage() {
  const script = `
function money(p){return '£'+(p/100).toFixed(2)}
function draw(){var b=B.get(),el=document.getElementById('list');
 if(!b.length){el.innerHTML='<p class="muted">Your basket is empty. <a href="/uk">Back to the shop</a>.</p>';document.getElementById('pay').style.display='none';document.getElementById('total').textContent='';return}
 el.innerHTML=b.map(function(i,n){return '<div class="row"><img src="'+i.img+'" alt=""><div style="flex:1"><b>'+i.title+'</b><br><span class="note">'+i.garment+' · '+i.colour+' · '+i.size+'</span></div><div class="qty"><button data-d="'+n+'">−</button>'+i.qty+'<button data-u="'+n+'">+</button></div><b>'+money(i.price*i.qty)+'</b></div>'}).join('');
 document.getElementById('total').textContent='Total '+money(b.reduce(function(a,i){return a+i.price*i.qty},0))+' · free UK delivery';document.getElementById('pay').style.display='';}
document.addEventListener('click',function(e){var b=B.get(),t=e.target;
 if(t.dataset.u){b[+t.dataset.u].qty=Math.min(10,b[+t.dataset.u].qty+1)}else if(t.dataset.d){var i=+t.dataset.d;b[i].qty--;if(b[i].qty<1)b.splice(i,1)}else return;B.set(b);draw()});
document.getElementById('pay').addEventListener('click',async function(){var btn=this;btn.disabled=true;btn.textContent='Opening secure checkout…';
 try{var r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:B.get().map(function(i){return{code:i.code,variant:i.variant,qty:i.qty}})})});
 var o=await r.json();if(o.url){location.href=o.url;return}alert(o.error||'Sorry, checkout is unavailable right now.')}catch(e){alert('Sorry, checkout is unavailable right now.')}
 btn.disabled=false;btn.textContent='Checkout securely';});
draw();`;
  return page("Basket", `<h1>Your basket</h1><div id="list"></div><p id="total" class="price" style="font-size:20px"></p>
<button id="pay" class="btn" style="width:100%;max-width:420px">Checkout securely</button>
<p class="note">You'll pay on Stripe's secure checkout page. We never see your card details.</p>`, { script, noindex: true });
}

function thanksPage() {
  return page("Thank you", `<div class="centre"><h1>Thank you</h1><p>Your order's in. You'll get a receipt by email now, and tracking details once it's on its way, usually within 4–10 working days.</p>
<p class="muted">We'll try not to make conversation about it.</p><p><a class="btn ghost" href="/uk">Back to the shop</a></p></div>`, { script: "try{localStorage.removeItem('ih_basket')}catch(e){}B.count();", noindex: true });
}

function legalPage(which) {
  const ADDRESS = esc(CFG.address) || "[Business address to be confirmed before launch]";
  const EMAIL = CFG.email ? `<a href="mailto:${esc(CFG.email)}">${esc(CFG.email)}</a>` : "[support email to be confirmed]";
  const SITE = CFG.index ? esc(CFG.origin.replace(/^https?:\/\//, "")) : "this website";
  const pages = {
    terms: ["Terms of sale", `<p>These terms apply to orders placed on ${SITE}. The seller is Mosspit Studios (sole trader), trading as Introvert Here, ${ADDRESS}. Contact: ${EMAIL}.</p>
<p>Prices are in pounds sterling and include delivery to UK addresses. We are not VAT-registered, so no VAT is charged. Every item is printed to order by our production partner and posted directly to you, usually within 4–10 working days.</p>
<p>A contract is formed when your payment is accepted and we email your receipt. If we can't fulfil an order we'll refund you in full.</p>
<p>Nothing in these terms affects your statutory rights.</p>`],
    returns: ["Returns and refunds", `<p><b>Faulty or wrong item:</b> if your item arrives damaged, misprinted or isn't what you ordered, email ${EMAIL} within 30 days with a photo and we'll replace it or refund you in full. You won't need to send it back.</p>
<p><b>Changed your mind:</b> under UK law you can cancel within 14 days of receiving your order. Tell us by email within that time, then return the item unworn within a further 14 days and we'll refund the price within 14 days of receiving it. Return postage is paid by you.</p>
<p>[Return address and any exceptions to be confirmed before launch.]</p>`],
    privacy: ["Privacy", `<p>We collect only what we need to take payment and deliver your order: your name, email, phone number and delivery address. Payment is handled by Stripe; we never see your card details. Your delivery details are passed to our print partner (Printify) to make and post your order.</p>
<p>We keep order records for as long as the law requires for accounts. We don't sell your data, send marketing without asking, or use advertising cookies. This site stores your chosen country and basket on your own device only.</p>
<p>Controller: Mosspit Studios, ${ADDRESS}. Questions or requests: ${EMAIL}. You can also complain to the Information Commissioner's Office (ico.org.uk).</p>`],
    contact: ["Contact", `<p>Email: ${EMAIL}</p><p>Post: Mosspit Studios, ${ADDRESS}</p><p>We reply as soon as we can, usually within two working days. In writing. Obviously.</p>`],
  };
  const [title, body] = pages[which];
  return page(title, `<h1>${title}</h1><div class="box">${body}</div>`, { path: "/" + which });
}
