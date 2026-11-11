// Mosspit approvals: a small page that lists videos waiting for review.
//
// How it works:
//  - "Finish Listing After Video Render" (Make) POSTs each finished render to
//    /api/pending, including the video file itself (protected by INGEST_SECRET).
//  - The page (protected by APP_PASSWORD) lists pending items with the video
//    playing inline. "Approve" is a plain link to the existing Make approve
//    webhook, unchanged.
//  - "Reject" and "Make new video" call the Make action webhook (MAKE_ACTION_HOOK),
//    which checks the row in Core before changing anything.
//  - The Approve scenario reports its result to /api/result (authenticated by the
//    item's own approval code); other Make scenarios send warnings to /api/alert.
//  - Phone notifications go through ntfy if NTFY_TOPIC is set.
//
// Settings (Cloudflare → Worker → Settings → Variables and Secrets):
//  APP_PASSWORD      password for the page
//  INGEST_SECRET     shared code Make sends in the X-Ingest-Secret header
//  MAKE_ACTION_HOOK  URL of the Make "Approvals App: Reject / Make New Video" webhook
//  NTFY_TOPIC        optional: ntfy topic name for push notifications
// Storage: KV namespace bound as PENDING.

const APPROVE_HOOK = "https://hook.eu1.make.com/hshng2qp4tavhlct3m7mgvys0pf7pymd";
const COOKIE = "mosspit_auth";
const ITEMS_KEY = "items";
const ALERTS_KEY = "alerts";
const KEEP_HANDLED_DAYS = 7;
const KEEP_VIDEO_SECONDS = 14 * 86400;
const MAX_ALERTS = 30;

export default {
  // Every 5 minutes: while listing updates are running (or just saved), re-read Core so the Update listings page stays current.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(amendWatch(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // Called by Make
      if (pathname === "/api/pending" && method === "POST") return await ingest(request, env, ctx, url);
      if (pathname === "/api/alert" && method === "POST") return await alert(request, env, ctx, url);
      if (pathname === "/api/result" && method === "POST") return await result(request, env, ctx, url);
      if (pathname === "/api/daily" && method === "POST") return await daily(request, env, ctx, url);
      if (pathname === "/api/gags-sync" && method === "POST") return await gagsSync(request, env);
      if (pathname === "/api/tags-sync" && method === "POST") return await tagsSync(request, env);
      if (pathname === "/api/gag-result" && method === "POST") return await gagResult(request, env, ctx, url);
      if (pathname === "/api/stats" && method === "POST") return await statsIngest(request, env);
      if (pathname === "/api/pricing-sync" && method === "POST") return await pricingSync(request, env);
      if (pathname === "/api/amend-sync" && method === "POST") return await amendSync(request, env);
      if (pathname === "/api/debug" && method === "POST") {
        // Drop-box for Make test runs: stores the posted text so it can be read back from KV ("debug"). Not shown in the app.
        if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
        await env.PENDING.put("debug", JSON.stringify({ at: new Date().toISOString(), text: (await request.text()).slice(0, 5000000) }));
        return json({ ok: true });
      }

      if (pathname.startsWith("/assets/") && method === "GET") return await asset(env, pathname.slice(8));
      if (pathname === "/manifest.webmanifest") return manifest();
      if (pathname === "/links.webmanifest") return linksManifest();
      if (pathname === "/api/links-sync" && method === "POST") return await linksSync(request, env);
      if (pathname === "/login" && method === "POST") return await login(request, env);
      if (pathname === "/logout") return logout();

      const authed = await isAuthed(request, env);
      if (pathname === "/" && method === "GET") {
        return authed ? await dashboardPage(env) : loginPage(url.searchParams.has("wrong"));
      }
      if (pathname === "/approvals" && method === "GET") {
        return authed ? await page(env) : redirect("/");
      }
      if (pathname === "/alerts" && method === "GET") {
        return authed ? await alertsPage(env) : redirect("/");
      }
      if (pathname === "/orders" && method === "GET") {
        return authed ? await ordersPage(env) : redirect("/");
      }
      if (pathname === "/links" && method === "GET") {
        return authed ? await linksPage(env) : loginPage(false);
      }
      if (pathname === "/amend.js" && method === "GET") {
        return authed ? new Response(AMEND_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" } }) : json({ error: "not signed in" }, 401);
      }
      if (pathname === "/amend" && method === "GET") {
        return authed ? await amendPage(env) : redirect("/");
      }
      if ((pathname === "/tools" || pathname === "/check") && method === "GET") {
        return authed ? await toolsPage(env) : redirect("/");
      }
      if (pathname === "/pricing" && method === "GET") {
        return authed ? await pricingPage(env) : redirect("/");
      }
      if (pathname === "/stats" && method === "GET") {
        return authed ? await statsPage(env, url) : redirect("/");
      }
      if (pathname === "/tags" && method === "GET") {
        return authed ? await tagsPage(env) : redirect("/");
      }
      if (pathname === "/gags" && method === "GET") {
        return authed ? await gagsPage(env) : redirect("/");
      }
      if (!authed) return json({ error: "not signed in" }, 401);

      if (pathname.startsWith("/video/") && method === "GET") return await video(request, env, pathname);
      if (pathname === "/api/state" && method === "GET") return await state(env);
      if (pathname === "/api/mark" && method === "POST") return await mark(request, env);
      if (pathname === "/api/reject" && method === "POST") return await makeAction(request, env, "reject");
      if (pathname === "/api/rerender" && method === "POST") return await makeAction(request, env, "rerender");
      if (pathname === "/api/dismiss-alert" && method === "POST") return await dismissAlert(request, env);
      if (pathname === "/api/gags-state" && method === "GET") return await gagsState(env);
      if (pathname === "/api/gags-data" && method === "GET") return json((await env.PENDING.get("gags", "json")) || null);
      if (pathname === "/api/gags-refresh" && method === "POST") return await gagsRefresh(env);
      if (pathname === "/api/tags-data" && method === "GET") return json((await env.PENDING.get("tags", "json")) || null);
      if (pathname === "/api/tags-refresh" && method === "POST") return await tagsHook(env, { action: "tags-sync" });
      if (pathname === "/api/tags-save" && method === "POST") return await tagsSave(request, env);
      if (pathname === "/api/gag-save" && method === "POST") return await gagSave(request, env);
      if (pathname === "/api/spell" && method === "POST") return await spell(request, env);
      if (pathname === "/api/pricing-save" && method === "POST") return await pricingSave(request, env);
      if (pathname === "/api/shop-keys" && method === "POST") return await shopKeys(request, env);
      if (pathname === "/api/shop-order-send" && method === "POST") return await shopOrderSend(request, env);
      if (pathname === "/api/tool-run" && method === "POST") return await toolRun(request, env);
      if (pathname === "/api/amend-apply" && method === "POST") return await amendApply(request, env);
      if (pathname === "/api/amend-refresh" && method === "POST") return await amendRefresh(env);
      if (pathname === "/api/amend-data" && method === "GET") return json((await env.PENDING.get("amend", "json")) || null);
      if (pathname === "/api/pricing-refresh" && method === "POST") return await pricingRefresh(env);
      if (pathname === "/api/pricing-state" && method === "GET") return json((await env.PENDING.get("pricing", "json")) || null);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response("Something went wrong: " + err.message, { status: 500 });
    }
  },
};

// ---------- storage ----------

async function loadItems(env) {
  const items = (await env.PENDING.get(ITEMS_KEY, "json")) || {};
  const cutoff = Date.now() - KEEP_HANDLED_DAYS * 864e5;
  for (const [row, item] of Object.entries(items)) {
    if (item.status !== "pending" && (item.updatedAt || 0) < cutoff) delete items[row];
  }
  return items;
}
const saveItems = (env, items) => env.PENDING.put(ITEMS_KEY, JSON.stringify(items));

async function loadAlerts(env) {
  const cutoff = Date.now() - KEEP_HANDLED_DAYS * 864e5;
  return ((await env.PENDING.get(ALERTS_KEY, "json")) || []).filter((a) => a.at > cutoff);
}
const saveAlerts = (env, alerts) => env.PENDING.put(ALERTS_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS)));

const videoKey = (row, code) => `video:${row}:${code}`;

// ---------- Make → worker ----------

function checkSecret(request, env) {
  return !!env.INGEST_SECRET && safeEqual(request.headers.get("X-Ingest-Secret") || "", env.INGEST_SECRET);
}

async function ingest(request, env, ctx, url) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await readBody(request);
  const missing = ["row", "product", "code", "file"].filter((k) => !str(data[k]));
  if (missing.length) return json({ error: "missing " + missing.join(", ") }, 400);

  const row = str(data.row);
  const code = str(data.code);
  const items = await loadItems(env);
  const now = Date.now();

  let hasVideo = false;
  if (data.video && typeof data.video === "object" && typeof data.video.arrayBuffer === "function") {
    const buf = await data.video.arrayBuffer();
    if (buf.byteLength > 0 && buf.byteLength < 24 * 1024 * 1024) {
      await env.PENDING.put(videoKey(row, code), buf, { expirationTtl: KEEP_VIDEO_SECONDS });
      hasVideo = true;
    }
  }

  // A newer render for the same row replaces the older one (its code is the live one).
  items[row] = {
    row,
    product: str(data.product),
    code,
    file: str(data.file),
    videoUrl: str(data.videoUrl),
    title: str(data.title),
    listingUrl: str(data.listingUrl),
    caption: str(data.caption),
    hasVideo,
    status: "pending",
    receivedAt: now,
    updatedAt: now,
  };
  await saveItems(env, items);

  const item = items[row];
  ctx.waitUntil(notify(env, url.origin, item.product + " is ready for review", item.title || "A new video is waiting for your approval.", "clapper"));
  return json({ ok: true, hasVideo });
}

async function alert(request, env, ctx, url) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await readBody(request);
  const title = str(data.title) || "Make warning";
  const alerts = await loadAlerts(env);
  alerts.unshift({
    id: crypto.randomUUID(),
    at: Date.now(),
    title,
    body: str(data.body),
    link: str(data.link),
    source: str(data.source),
  });
  await saveAlerts(env, alerts);
  ctx.waitUntil(notify(env, url.origin, title, str(data.body).slice(0, 200) || "Open the app for details.", "warning"));
  return json({ ok: true });
}

// Sent by the Approve scenario. Authenticated by matching the row's approval code.
async function result(request, env, ctx, url) {
  const data = await readBody(request);
  const row = str(data.row);
  const code = str(data.code);
  const items = await loadItems(env);
  const item = items[row];
  if (!item || !code || item.code !== code) return json({ ok: true, ignored: true });

  const ok = str(data.outcome) === "posted";
  item.status = "approved";
  item.result = { ok, step: str(data.step), message: str(data.message).slice(0, 500), at: Date.now() };
  item.updatedAt = Date.now();
  await saveItems(env, items);

  if (ok) {
    ctx.waitUntil(notify(env, url.origin, item.product + " is live", "Live on Etsy and posted to Pinterest, Instagram and Facebook.", "white_check_mark", "low"));
  } else {
    ctx.waitUntil(notify(env, url.origin, item.product + ": approval FAILED" + (item.result.step ? " at " + item.result.step : ""), item.result.message || "Open the app for details.", "x"));
  }
  return json({ ok: true });
}

// Daily summary from the Make "Approvals App: Daily Checks" scenario.
// Make sends raw facts; this works out what's new and raises alerts.
const MAKE_TEAM_URL = "https://eu1.make.com/2110125";

async function daily(request, env, ctx, url) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = (await request.json()) || {};
  const today = str(data.today) || new Date().toISOString().slice(0, 10);
  const st = (await env.PENDING.get("daily-state", "json")) || { errors: {}, dlq: {}, sent: {} };
  const fresh = [];
  const dayMs = 864e5;
  const todayMs = Date.parse(today + "T00:00:00Z");

  // 1. Connections expiring within 7 days (or expired in the last 2 days).
  for (const c of data.connections || []) {
    if (!c.expire) continue;
    const exp = Date.parse(c.expire);
    if (!Number.isFinite(exp)) continue;
    const daysLeft = Math.ceil((exp - Date.now()) / dayMs);
    if (daysLeft > 7 || daysLeft < -2) continue;
    if (Array.isArray(c.usedBy) && c.usedBy.length === 0) continue; // not used by any scenario
    const key = `conn:${c.id}:${String(c.expire).slice(0, 10)}`;
    if (st.sent[key]) continue;
    st.sent[key] = today;
    const when = new Date(exp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
    fresh.push({
      title: daysLeft >= 0 ? `Make connection expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${c.label || "connection"}` : `Make connection has EXPIRED: ${c.label || "connection"}`,
      body: `"${c.name}" (connection ID ${c.id}) ${daysLeft >= 0 ? "expires" : "expired"} on ${when}.` +
        (Array.isArray(c.usedBy) && c.usedBy.length ? `\nUsed by: ${c.usedBy.join(", ")}.` : "") +
        `\nOpen the link, find this connection by name and tap Reauthorize - or ask Claude to renew it for you.`,
      link: `${MAKE_TEAM_URL}/connections`,
      source: "Daily check",
    });
  }

  // 2. Scenarios with new errors, and stuck (incomplete) runs.
  const firstRun = !st.baselineDone;
  for (const s of data.scenarios || []) {
    const id = String(s.id);
    const errors = Number(s.errors) || 0;
    const dlq = Number(s.dlq) || 0;
    const prevErr = st.errors[id];
    if (!firstRun && prevErr !== undefined && errors > prevErr) {
      const n = errors - prevErr;
      fresh.push({
        title: `Make scenario failed ${n} time${n === 1 ? "" : "s"}: ${s.name}`,
        body: `"${s.name}" has had ${n} failed run${n === 1 ? "" : "s"} since the last daily check. Open it to see what went wrong.`,
        link: `${MAKE_TEAM_URL}/scenarios/${id}/logs`,
        source: "Daily check",
      });
    }
    const prevDlq = st.dlq[id];
    if (dlq > 0 && (prevDlq === undefined || dlq > prevDlq)) {
      fresh.push({
        title: `${dlq} stuck run${dlq === 1 ? "" : "s"} in: ${s.name}`,
        body: `Make is holding ${dlq} run${dlq === 1 ? "" : "s"} of "${s.name}" that failed part-way and were never finished (incomplete executions). They may need retrying or deleting.`,
        link: `${MAKE_TEAM_URL}/scenarios/${id}`,
        source: "Daily check",
      });
    }
    st.errors[id] = errors;
    st.dlq[id] = dlq;
  }
  st.baselineDone = true;

  // 3. Release runway per collection.
  for (const r of data.runway || []) {
    if (!r.lastDate) continue;
    const daysLeft = Math.round((Date.parse(r.lastDate + "T00:00:00Z") - todayMs) / dayMs);
    if (daysLeft >= 7) continue;
    const key = `runway:${r.collection}:${r.lastDate}`;
    if (st.sent[key]) continue;
    st.sent[key] = today;
    fresh.push({
      title: `${r.collection}: releases run out ${daysLeft <= 0 ? "today" : "in " + daysLeft + " day" + (daysLeft === 1 ? "" : "s")}`,
      body: `The last scheduled ${r.collection} release in GAGS is on ${r.lastDate}. Add more gags (with release dates) to keep listings going out.`,
      link: "",
      source: "Daily check",
    });
  }

  // Forget old "already sent" markers after 60 days.
  for (const [k, d] of Object.entries(st.sent)) if (todayMs - Date.parse(d + "T00:00:00Z") > 60 * dayMs) delete st.sent[k];
  await env.PENDING.put("daily-state", JSON.stringify(st));

  await env.PENDING.put("daily", JSON.stringify({
    at: Date.now(),
    today,
    upcoming: (data.upcoming || []).slice(0, 200),
    runway: data.runway || [],
  }));

  if (fresh.length) {
    const alerts = await loadAlerts(env);
    for (const a of fresh.reverse()) alerts.unshift({ id: crypto.randomUUID(), at: Date.now(), ...a });
    await saveAlerts(env, alerts);
    ctx.waitUntil((async () => {
      for (const a of fresh) await notify(env, url.origin, a.title, a.body.slice(0, 200), "warning");
    })());
  }
  return json({ ok: true, alerts: fresh.length });
}

// priority: "high" = needs Barry (sound + pop-up); "low" = for information only (silent, no buzz).
async function notify(env, origin, title, body, tag, priority = "high") {
  if (!env.NTFY_TOPIC) return;
  try {
    const res = await fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), {
      method: "POST",
      headers: { Title: ascii(title), Click: origin + "/", Tags: tag, Priority: priority },
      body,
    });
    if (!res.ok) console.error("ntfy failed", res.status, await res.text());
  } catch (err) {
    console.error("ntfy error", err);
  }
}

// ---------- page actions ----------

async function mark(request, env) {
  const data = await readBody(request);
  const row = str(data.row);
  const status = data.status === "approved" ? "approved" : "removed";
  const items = await loadItems(env);
  const item = items[row];
  if (item && (!data.code || item.code === str(data.code))) {
    item.status = status;
    if (status === "approved") item.approvedAt = Date.now();
    item.updatedAt = Date.now();
    await saveItems(env, items);
  }
  return json({ ok: true });
}

async function makeAction(request, env, action) {
  if (!env.MAKE_ACTION_HOOK) return json({ error: "MAKE_ACTION_HOOK is not set" }, 500);
  const data = await readBody(request);
  const items = await loadItems(env);
  const item = items[str(data.row)];
  if (!item || item.code !== str(data.code)) return json({ error: "That item has changed - refresh the page." }, 409);
  if (action === "reject" && item.status !== "pending") return json({ error: "Only items waiting for review can be rejected." }, 409);
  if (action === "rerender" && item.status !== "rejected") return json({ error: "Only rejected items can be re-made." }, 409);

  const hook = new URL(env.MAKE_ACTION_HOOK);
  hook.searchParams.set("action", action);
  hook.searchParams.set("row", item.row);
  hook.searchParams.set("product", item.product);
  hook.searchParams.set("code", item.code);
  const res = await fetch(hook.toString(), { method: "GET" });
  if (!res.ok) return json({ error: "Make didn't accept the request (" + res.status + "). Nothing was changed." }, 502);

  item.status = action === "reject" ? "rejected" : "rerendering";
  item.updatedAt = Date.now();
  await saveItems(env, items);
  return json({ ok: true });
}

async function dismissAlert(request, env) {
  const data = await readBody(request);
  const alerts = (await loadAlerts(env)).filter((a) => a.id !== str(data.id));
  await saveAlerts(env, alerts);
  return json({ ok: true });
}

// Lets the page notice when something has changed and refresh itself.
async function state(env) {
  const items = await loadItems(env);
  const alerts = await loadAlerts(env);
  const sig = JSON.stringify([
    Object.values(items).map((i) => [i.row, i.code, i.status, i.result && i.result.at]),
    alerts.map((a) => a.id),
  ]);
  return json({ sig });
}

// Serves a stored video, with Range support (iPhone/iPad Safari needs it).
async function video(request, env, pathname) {
  const [, , row, code] = pathname.split("/");
  const buf = await env.PENDING.get(videoKey(decodeURIComponent(row || ""), decodeURIComponent(code || "")), "arrayBuffer");
  if (!buf) return new Response("Video not found", { status: 404 });
  const size = buf.byteLength;
  const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = request.headers.get("Range");
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
    let end = m[1] === "" || m[2] === "" ? size - 1 : Number(m[2]);
    end = Math.min(end, size - 1);
    if (start > end || start < 0) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(buf, { headers: { ...headers, "Content-Length": String(size) } });
}

// ---------- auth ----------

async function authToken(env) {
  const bytes = new TextEncoder().encode("mosspit-approvals:" + env.APP_PASSWORD);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAuthed(request, env) {
  if (!env.APP_PASSWORD) return false;
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([a-f0-9]+)"));
  return !!match && safeEqual(match[1], await authToken(env));
}

async function login(request, env) {
  const data = await readBody(request);
  if (!env.APP_PASSWORD || !safeEqual(str(data.password), env.APP_PASSWORD)) return redirect("/?wrong");
  const token = await authToken(env);
  return redirect("/", `${COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
}

function logout() {
  return redirect("/", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

// ---------- helpers ----------

async function readBody(request) {
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) return (await request.json()) || {};
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const out = {};
    for (const [k, v] of form.entries()) out[k] = v;
    return out;
  }
  return {};
}

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : typeof v === "object" ? "" : String(v).trim());

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const ascii = (s) => s.replace(/[^\x20-\x7E]/g, "-");

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function redirect(location, cookie) {
  const headers = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const safeUrl = (s) => (/^https?:\/\//i.test(s || "") ? s : "");

function approveUrl(item) {
  const q = (v) => encodeURIComponent(v);
  return `${APPROVE_HOOK}?code=${q(item.code)}&row=${q(item.row)}&product=${q(item.product)}&file=${q(item.file)}`;
}

function when(ms) {
  return new Date(ms).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ---------- HTML ----------

// Studio look (Nov 2026): concrete wall, glass panels framed like the logo "screens", Montserrat display type,
// Inter for reading, IBM Plex Mono for codes, chunky rounded icons. Range colours come from the logos.
const STYLE = `
:root{--wall:#0b0b0a;--card:rgba(13,13,12,.80);--card2:rgba(26,26,24,.86);--field:rgba(0,0,0,.38);--line:rgba(255,255,255,.13);--frame:#f2f0eb;
  --text:#f2f0eb;--muted:#a7a399;--dim:#6f6c65;--accent:#f2f0eb;
  --go:#7cc39a;--go-text:#08160e;--warn:#e8907f;--warn-bg:rgba(150,50,40,.26);--ok:#8fd0ab;--ok-bg:rgba(60,140,95,.2);--info:#a8c3e6;
  --ih:#f2f0eb;--sh:#a8cea8;--pc:#d6473e;--os:#c9a434;
  --display:"Montserrat",system-ui,sans-serif;--body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --r:18px;--bgimg:url(/assets/bg-ih.jpg);color-scheme:dark}
body[data-coll=SH]{--accent:var(--sh);--bgimg:url(/assets/bg-sh.jpg)}
body[data-coll=PC]{--accent:#e0574a;--bgimg:url(/assets/bg-pc.jpg)}
body[data-coll=OS]{--accent:var(--os);--bgimg:url(/assets/bg-os.jpg)}
*{box-sizing:border-box}
html{background:var(--wall);overflow-x:clip}
body{margin:0;min-height:100vh;color:var(--text);font:15px/1.5 var(--body);overflow-x:clip;
  background:linear-gradient(rgba(6,6,6,.35),rgba(6,6,6,.78)),var(--bgimg) center/cover fixed var(--wall);transition:background .4s}
main{max-width:1120px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-right,0px)) 120px max(16px,env(safe-area-inset-left,0px))}
a{color:inherit}
:focus-visible{outline:2px solid var(--frame);outline-offset:3px}
/* top bar */
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:calc(12px + env(safe-area-inset-top,0px)) 0 12px;margin-bottom:6px}
.topbar::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:100vw;transform:translateX(-50%);background:linear-gradient(rgba(8,8,8,.94),rgba(8,8,8,.7));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line);z-index:-1}
.topbar .home{display:block;line-height:0}
.topbar .home img{height:40px;width:auto}
.topbar .sp{flex:1}
.topbar .when{font:600 12px var(--body);color:var(--muted);text-align:right;line-height:1.3}
.topbar .when b{display:block;color:var(--text);font:800 12px var(--display);letter-spacing:.14em;text-transform:uppercase}
.iconbtn{position:relative;width:48px;height:48px;border-radius:14px;border:2px solid var(--line);background:var(--card);display:grid;place-items:center;color:var(--text);text-decoration:none;flex:none}
.iconbtn svg{width:26px;height:26px}
.iconbtn .n{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;border-radius:11px;background:var(--warn);color:#1a0d0a;font:800 12px var(--display);display:grid;place-items:center;padding:0 6px}
.pagehead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 18px}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font:700 12px var(--display);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;min-height:40px}
.back svg{width:18px;height:18px}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.brand{display:flex;flex-direction:column;gap:2px;min-width:0}
.logo{display:none}
.actions{display:flex;gap:8px;flex-wrap:wrap}
h1{font:900 clamp(26px,4.6vw,40px)/1.05 var(--display);letter-spacing:.04em;text-transform:uppercase;margin:0;text-wrap:balance}
h2{font:800 12px var(--display);color:var(--muted);margin:30px 0 12px;text-transform:uppercase;letter-spacing:.2em;display:flex;align-items:center;gap:12px}
h2::after{content:"";flex:1;height:1px;background:var(--line)}
h3{font-family:var(--display)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.card[data-coll=IH]{border-top:3px solid var(--ih)}.card[data-coll=SH]{border-top:3px solid var(--sh)}.card[data-coll=PC]{border-top:3px solid var(--pc)}.card[data-coll=OS]{border-top:3px solid var(--os)}
.frame{border:2.5px solid var(--frame);border-radius:var(--r);padding:5px}
.frame>.card{border:0;border-radius:calc(var(--r) - 6px)}
.code{font:600 15px var(--mono);letter-spacing:0}
.title{margin:4px 0 2px;font:800 18px/1.25 var(--display)}
.meta{color:var(--muted);font-size:14px}
video{display:block;width:100%;aspect-ratio:1/1;background:#000;border-radius:12px;margin:12px 0}
.caption{font-size:14px;background:var(--field);border-radius:12px;padding:10px 12px;margin:8px 0;white-space:pre-wrap}
.caption b{display:block;font:800 11px var(--display);color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:2px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.links a{flex:1 1 120px;display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 12px;border:1.5px solid var(--line);border-radius:12px;color:var(--text);text-decoration:none;font:700 13px var(--display);letter-spacing:.08em;text-transform:uppercase;background:var(--field)}
.btn-main{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;text-align:center;padding:0 18px;border-radius:14px;background:var(--go);color:var(--go-text);font:800 15px var(--display);letter-spacing:.1em;text-transform:uppercase;text-decoration:none;border:2.5px solid var(--go);cursor:pointer}
.btn-main:disabled{opacity:.45;cursor:not-allowed}
.btn-alt{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin-top:10px;border-radius:14px;background:none;color:var(--warn);border:2px solid var(--warn);font:800 14px var(--display);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.link-btn{background:none;border:0;color:var(--muted);font:600 14px var(--body);padding:10px 0 0;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.done{opacity:.75}
.badge{display:inline-block;font:600 12px var(--body);padding:4px 10px;border-radius:99px;border:1px solid var(--line);color:var(--muted);background:rgba(255,255,255,.03)}
.status{border-radius:12px;padding:12px 14px;margin-top:10px;font-size:15px}
.status.ok{background:var(--ok-bg);color:var(--ok)}
.status.bad{background:var(--warn-bg);color:var(--warn)}
.status.wait{background:var(--field);color:var(--muted)}
.alert{border-left:4px solid var(--warn)}
.alert .body{white-space:pre-wrap;font-size:14px;margin-top:6px}
.empty{text-align:center;color:var(--muted);padding:44px 12px}
.empty svg{width:46px;height:46px;display:block;margin:0 auto 10px;color:var(--dim)}
.small{font-size:14px;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 16px;border:2px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);font:800 13px var(--display);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;cursor:pointer;backdrop-filter:blur(6px)}
.btn:hover{border-color:var(--frame)}
.btn svg,.btn-main svg,.btn-alt svg{width:20px;height:20px;flex:none}
.btn:disabled{opacity:.45;cursor:not-allowed}
input,textarea,select{font-family:var(--body)}
input[type=password]{width:100%;min-height:52px;padding:0 14px;font:17px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);margin:10px 0 14px}
.err{color:var(--warn)}
/* dashboard */
.needs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.needs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:480px){.needs{grid-template-columns:1fr}}
.need{display:flex;align-items:center;gap:14px;padding:16px;border-radius:var(--r);background:var(--card2);border:1px solid var(--line);text-decoration:none;color:var(--text);min-height:86px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.need .big{font:900 34px/1 var(--display);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.need .t{display:block;font:700 15px var(--display);letter-spacing:.02em}
.need .s{display:block;font-size:13px;color:var(--muted)}
.need.hot{border-color:var(--frame);box-shadow:inset 0 0 0 1px var(--frame)}
.need.warn .big{color:var(--warn)}
.need.run .big{color:var(--info)}
.need.quiet .big{color:var(--dim)}
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.tiles .tile{grid-column:span 1}.tiles .tile.primary{grid-column:span 3}
@media (max-width:900px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.tiles .tile.primary{grid-column:span 3}}
@media (max-width:560px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.tiles .tile.primary{grid-column:span 2}}
.tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:16px;min-height:150px;border-radius:var(--r);border:2px solid rgba(242,240,235,.5);background:var(--card);color:var(--text);text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:border-color .15s,transform .15s}
.tile:hover{border-color:var(--frame);transform:translateY(-2px)}
.tile .ic{width:48px;height:48px;border-radius:13px;background:var(--frame);color:#0d0d0c;display:grid;place-items:center}
.tile .ic svg{width:28px;height:28px}
.tile .nm{font:800 15px var(--display);letter-spacing:.08em;text-transform:uppercase}
.tile .st{font-size:13px;color:var(--muted);margin-top:auto}
.tile .st b{color:var(--text);font-weight:600}
.tile .dots{position:absolute;right:14px;top:16px;display:flex;gap:5px;padding:5px 8px;border:1.5px solid rgba(242,240,235,.4);border-radius:99px}
.tile .dots i{width:5px;height:5px;border-radius:50%;background:rgba(242,240,235,.55)}
.tile.primary{border-color:var(--frame);border-width:2.5px;min-height:170px}
.tile.primary .nm{font-size:18px}
.ranges{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.ranges{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:420px){.ranges{grid-template-columns:1fr}}
.rng{padding:16px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px;text-decoration:none;color:var(--text);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rng img{width:100%;max-width:240px;height:auto;display:block}
.rng .row{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px}
.rng .row b{color:var(--text);font:700 13px var(--display);letter-spacing:.04em}
.rng .row b.low{color:var(--warn)}
.rbar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.rbar i{display:block;height:100%;border-radius:99px}
.foot{font:500 12px var(--mono);color:var(--dim);text-align:center;margin:36px 0 0}
/* bottom bar (phones) */
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:none;background:rgba(8,8,8,.95);border-top:1px solid var(--line);padding:8px max(10px,env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.tabbar .in{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:560px;margin:0 auto}
.tabbar a{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;min-height:58px;border-radius:12px;color:var(--muted);font:700 10px var(--display);letter-spacing:.1em;text-transform:uppercase;text-decoration:none}
.tabbar a svg{width:26px;height:26px}
.tabbar a.on{color:var(--text);background:rgba(255,255,255,.07)}
.tabbar a .n{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;border-radius:9px;background:var(--warn);color:#1a0d0a;font:800 10px var(--display);display:grid;place-items:center;padding:0 5px}
/* more sheet */
.sheet{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.6);display:none;align-items:flex-end}
.sheet.open{display:flex}
.sheet .pane{width:100%;background:#141413;border-top:2px solid var(--frame);border-radius:20px 20px 0 0;padding:18px max(16px,env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sheet .pane a{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 6px;border:1.5px solid var(--line);border-radius:14px;text-decoration:none;color:var(--text);font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase}
.sheet .pane a svg{width:28px;height:28px}
/* toast */
.toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);z-index:50;background:var(--frame);color:#0d0d0c;font:800 13px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:14px 20px;border-radius:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:calc(100vw - 32px);text-align:center}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast.bad{background:var(--warn)}
@media (min-width:761px){.toast{bottom:28px}}
@media (max-width:760px){
  .tabbar{display:block}
  .topbar .when{display:none}
  .topbar .home img{height:34px}
  .grid{grid-template-columns:1fr}
  .card{padding:15px}
  .actions{width:100%}
  .actions .btn{flex:1}
}
@media (prefers-reduced-motion:reduce){.tile,.toast,body{transition:none}.tile:hover{transform:none}}
`;

// Icon set: chunky rounded strokes and solid shapes, same weight as the logo pictograms.
const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-approve" viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="19" rx="4" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M13 10.5v8l7-4z" fill="currentColor"/><path d="M10 28h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></symbol>
<symbol id="i-gags" viewBox="0 0 32 32"><path d="M6 6h20a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="11" cy="14.5" r="1.9" fill="currentColor"/><circle cx="16" cy="14.5" r="1.9" fill="currentColor"/><circle cx="21" cy="14.5" r="1.9" fill="currentColor"/></symbol>
<symbol id="i-update" viewBox="0 0 32 32"><path d="M5 9a3 3 0 0 1 3-3h9M27 16v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M22.5 4.5l5 5L16 21l-6 1 1-6z" fill="currentColor"/></symbol>
<symbol id="i-tags" viewBox="0 0 32 32"><path d="M4 6v9.5L17.5 29 29 17.5 15.5 4H6a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="10.5" cy="10.5" r="2.4" fill="currentColor"/></symbol>
<symbol id="i-price" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M19.5 10.5c-.6-1.4-1.9-2-3.4-2-2.2 0-3.6 1.6-3.6 3.6V22M10.5 16.5h7M10.5 22.5h11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></symbol>
<symbol id="i-orders" viewBox="0 0 32 32"><path d="M4 10l12-5 12 5v13l-12 5-12-5z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M4 10l12 5 12-5M16 15v13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></symbol>
<symbol id="i-stats" viewBox="0 0 32 32"><rect x="5" y="16" width="5.5" height="11" rx="2" fill="currentColor"/><rect x="13.25" y="9" width="5.5" height="18" rx="2" fill="currentColor"/><rect x="21.5" y="4" width="5.5" height="23" rx="2" fill="currentColor"/></symbol>
<symbol id="i-tools" viewBox="0 0 32 32"><path d="M20.5 4.5a6.5 6.5 0 0 0-6.2 8.4L4.8 22.4a2.6 2.6 0 0 0 3.7 3.7l9.5-9.5a6.5 6.5 0 0 0 8.4-6.2l-3.9 3.9-4.2-1-1-4.2z" fill="currentColor"/></symbol>
<symbol id="i-links" viewBox="0 0 32 32"><path d="M13.5 18.5a5 5 0 0 0 7 0l4.5-4.5a5 5 0 0 0-7-7l-1.5 1.5M18.5 13.5a5 5 0 0 0-7 0L7 18a5 5 0 0 0 7 7l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></symbol>
<symbol id="i-bell" viewBox="0 0 32 32"><path d="M8 22V14a8 8 0 0 1 16 0v8l2.5 3h-21z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M13 28h6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></symbol>
<symbol id="i-home" viewBox="0 0 32 32"><path d="M5 14L16 5l11 9v11a2 2 0 0 1-2 2h-6v-7h-6v7H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></symbol>
<symbol id="i-more" viewBox="0 0 32 32"><circle cx="8" cy="16" r="2.6" fill="currentColor"/><circle cx="16" cy="16" r="2.6" fill="currentColor"/><circle cx="24" cy="16" r="2.6" fill="currentColor"/></symbol>
<symbol id="i-sync" viewBox="0 0 32 32"><path d="M26 13.5A10.5 10.5 0 0 0 7.2 9.2M6 18.5a10.5 10.5 0 0 0 18.8 4.3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M6.5 4v6h6M25.5 28v-6h-6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-back" viewBox="0 0 32 32"><path d="M19 7l-9 9 9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-check" viewBox="0 0 32 32"><path d="M7 16.5l6 6L25 10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-person" viewBox="0 0 32 32"><circle cx="16" cy="6" r="4" fill="currentColor"/><rect x="11.5" y="11.5" width="9" height="11" rx="3" fill="currentColor"/><rect x="11.5" y="18" width="3.8" height="12" rx="1.9" fill="currentColor"/><rect x="16.7" y="18" width="3.8" height="12" rx="1.9" fill="currentColor"/></symbol>
</defs></svg>`;
const icon = (id, cls = "") => `<svg${cls ? ` class="${cls}"` : ""}><use href="#i-${id}"/></svg>`;

const NAV_TABS = [["/", "home", "Home"], ["/approvals", "approve", "Approve"], ["/gags", "gags", "Gags"], ["/amend", "update", "Update"]];
const NAV_MORE = [["/tags", "tags", "Tags"], ["/orders", "orders", "Orders"], ["/stats", "stats", "Stats"], ["/pricing", "price", "Pricing"], ["/check", "check", "Check Core"], ["/links", "links", "Links"], ["/alerts", "bell", "Alerts"]];

function shell(body, manifestUrl = "/manifest.webmanifest") {
  const tabs = NAV_TABS.map(([href, ic, label]) => `<a href="${href}" data-tab="${href}">${icon(ic)}${label}</a>`).join("");
  const more = NAV_MORE.map(([href, ic, label]) => `<a href="${href}">${icon(ic)}${label}</a>`).join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0b0b0a">
<link rel="manifest" href="${manifestUrl}">
<link rel="icon" href="/assets/icon3-192.png">
<link rel="apple-touch-icon" href="/assets/icon3-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<title>Introvert Here Studio</title><style>${STYLE}</style></head>
<body data-coll="IH">${ICONS}<main>${body}</main>
<nav class="tabbar" aria-label="Main"><div class="in">${tabs}<a href="#more" id="moreBtn">${icon("more")}More</a></div></nav>
<div class="sheet" id="sheet"><div class="pane">${more}</div></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function () {
  var p = location.pathname, on = null;
  document.querySelectorAll(".tabbar [data-tab]").forEach(function (a) { var t = a.dataset.tab; if (t === p || (t !== "/" && p.indexOf(t) === 0)) on = a; });
  if (on) on.classList.add("on"); else if (p !== "/") document.getElementById("moreBtn").classList.add("on");
  var sh = document.getElementById("sheet");
  document.getElementById("moreBtn").addEventListener("click", function (e) { e.preventDefault(); sh.classList.add("open"); });
  sh.addEventListener("click", function (e) { if (e.target === sh) sh.classList.remove("open"); });
  var n = document.body.dataset.alerts; if (n && Number(n) > 0) { var b = document.querySelector('.tabbar [data-tab="/"]'); }
  window.toast = function (msg, bad) { var t = document.getElementById("toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(window.__tt); window.__tt = setTimeout(function () { t.className = "toast"; }, 2600); };
})();
</script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const collOf = (code) => (/^(IH|SH|PC|OS)-/.exec(String(code || "")) || [, "IH"])[1];
const TOP_PAGES = ["/", "/approvals", "/gags", "/tags", "/stats", "/pricing", "/orders", "/amend", "/tools", "/check", "/links", "/alerts"];
function topBar() {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  return `<div class="topbar"><a class="home" href="/" aria-label="Dashboard"><img id="logo" src="/assets/brand-ih-wide.png" alt="Introvert Here"></a><div class="sp"></div>
<div class="when"><b>Studio</b>${esc(today)}</div><a class="iconbtn" href="/alerts" aria-label="Alerts">${icon("bell")}</a></div>`;
}
// Page header. Links to other app pages are dropped (the dashboard and bottom bar do that now); page buttons stay.
function brandHeader(title, actions = "") {
  const kept = String(actions || "").replace(/<a class="btn" href="(\/[a-z-]*)"[^>]*>[\s\S]*?<\/a>/g, (m, href) => (TOP_PAGES.includes(href) ? "" : m));
  return `${topBar()}<header class="pagehead"><div class="brand"><a class="back" href="/">${icon("back")}Dashboard</a><h1>${title}</h1></div>${kept.trim() ? `<div class="actions">${kept}</div>` : ""}</header>`;
}

function loginPage(wrong) {
  return shell(`
${topBar()}
<header class="pagehead"><div class="brand"><h1>Sign in</h1></div></header>
<form class="frame" method="post" action="/login" style="max-width:440px"><div class="card">
  <label for="pw"><b>Password</b></label>
  <input id="pw" type="password" name="password" autocomplete="current-password" autofocus required>
  ${wrong ? `<p class="err">That password didn't match.</p>` : ""}
  <button class="btn-main" type="submit">Sign in</button>
</div></form>`);
}

// ---------- dashboard ----------
const DASH_RANGES = [["IH", "INTROVERT HERE…", "Introvert Here", "--ih"], ["SH", "SHHH.", "SHHH.", "--sh"], ["PC", "PER CONTRACT", "Per Contract", "--pc"], ["OS", "OFF THE SHELF", "Off The Shelf", "--os"]];
async function dashboardPage(env) {
  const [items, alerts, amend, daily, gags, tags, stats, pricing, orders] = await Promise.all([
    loadItems(env), loadAlerts(env), env.PENDING.get("amend", "json"), env.PENDING.get("daily", "json"), env.PENDING.get("gags", "json"),
    env.PENDING.get("tags", "json"), env.PENDING.get("stats", "json"), env.PENDING.get("pricing", "json"), env.PENDING.get("shop:orders", "json")]);
  const pending = Object.values(items).filter((i) => i.status === "pending");
  const oldest = pending.reduce((a, i) => Math.min(a, i.receivedAt || Infinity), Infinity);
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + " min" : m < 2880 ? Math.round(m / 60) + " hours" : Math.round(m / 1440) + " days"; };
  const busy = (amend && amend.gags || []).filter((g) => /^AMENDMENT_REQUIRED/.test(g.status));
  const toSend = (orders || []).filter((o) => o.status === "on-hold" || o.status === "failed");
  const tagsToApprove = (tags && tags.items || []).filter((t) => !t.approved).length;
  const liveListings = (amend && amend.gags || []).reduce((a, g) => a + g.live.length, 0);
  const views = (stats && stats.listings || []).reduce((a, l) => a + (Number(l.views) || 0), 0);
  const next = (daily && daily.upcoming || []).find((u) => !u.built);
  const thisYear = new Date().getUTCFullYear();
  const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: Number(iso.slice(0, 4)) !== thisYear ? "numeric" : undefined, timeZone: "UTC" });
  const need = (cls, n, t, s, href) => `<a class="need ${n ? cls : "quiet"}" href="${href}"><span class="big">${n}</span><span><span class="t">${t}</span><span class="s">${s}</span></span></a>`;
  const tile = (href, ic, nm, st, primary) => `<a class="tile${primary ? " primary" : ""}" href="${href}"><span class="ic">${icon(ic)}</span><span class="nm">${nm}</span><span class="st">${st}</span>${primary ? '<span class="dots"><i></i><i></i><i></i></span>' : ""}</a>`;
  const todayMs = Date.parse(((daily && daily.today) || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  const ranges = DASH_RANGES.map(([code, coll, name, colour]) => {
    const live = (amend && amend.gags || []).filter((g) => g.id.startsWith(code + "-")).length;
    const r = (daily && daily.runway || []).find((x) => x.collection === coll);
    const left = r && r.lastDate ? Math.round((Date.parse(r.lastDate + "T00:00:00Z") - todayMs) / 864e5) : null;
    const pct = left === null ? 0 : Math.max(3, Math.min(100, Math.round(left / 28 * 100)));
    const low = left !== null && left < 7;
    return `<a class="rng" href="/gags"><img src="/assets/brand-${code.toLowerCase()}-stacked.png" alt="${esc(name)}" loading="lazy">
<div class="rbar" title="Releases planned ahead (full = 4 weeks or more)"><i style="width:${pct}%;background:${low ? "var(--warn)" : `var(${colour})`}"></i></div>
<div class="row"><span>Live gags</span><b>${live}</b></div>
<div class="row"><span>Releases planned until</span><b class="${low ? "low" : ""}">${r && r.lastDate ? esc(dayName(r.lastDate)) : "Nothing planned"}</b></div></a>`;
  }).join("");
  const tee = pricing && pricing.prices && pricing.prices["T-SHIRT"];
  return shell(`
${topBar()}
<h2>Needs you</h2>
<div class="needs">
  ${need("hot", pending.length, "Videos to approve", pending.length ? "Oldest waiting " + ago(oldest) : "All caught up", "/approvals")}
  ${need("warn", alerts.length, "Alerts", alerts.length ? esc(alerts[0].title).slice(0, 60) : "Nothing to look at", "/alerts")}
  ${need("run", busy.length, "Updates running", busy.length ? esc(busy.slice(0, 2).map((g) => g.stem || g.id).join(", ")) + (busy.length > 2 ? " and " + (busy.length - 2) + " more" : "") : "None running", "/amend")}
  ${need("warn", toSend.length, "Orders to send", toSend.length ? "Waiting for you" : "All caught up", "/orders")}
</div>
<h2>Studio</h2>
<div class="tiles">
  ${tile("/approvals", "approve", "Approvals", pending.length ? `<b>${pending.length} video${pending.length === 1 ? "" : "s"}</b> waiting · approve to go live and post` : "Nothing waiting · new videos appear here", true)}
  ${tile("/gags", "gags", "Gags", `<b>${gags && gags.all ? gags.all.length : "—"}</b> written${next ? " · next release " + esc(dayName(next.date)) : ""} · write, edit and check`, true)}
  ${tile("/amend", "update", "Update listings", `<b>${liveListings || "—"}</b> live listings`)}
  ${tile("/tags", "tags", "Tags", tagsToApprove ? `<b>${tagsToApprove}</b> to approve` : "All approved")}
  ${tile("/orders", "orders", "Orders", `<b>${toSend.length}</b> to send · ${(orders || []).length} in total`)}
  ${tile("/stats", "stats", "Stats", `<b>${views.toLocaleString("en-GB")}</b> listing views`)}
  ${tile("/pricing", "price", "Pricing", tee ? `T-shirt <b>£${Number(tee.price).toFixed(2)}</b>` : "Prices and margins")}
  ${tile("/links", "links", "Links", "Key addresses")}
</div>
<h2>Ranges</h2>
<div class="ranges">${ranges}</div>
<p class="foot">Release plan updated ${daily ? esc(when(daily.at)) : "—"} · <a href="/logout">Sign out</a></p>
<script>setTimeout(function () { location.reload(); }, 120000);</script>`);
}

async function alertsPage(env) {
  const alerts = await loadAlerts(env);
  return shell(`
${brandHeader("Alerts" + (alerts.length ? ` (${alerts.length})` : ""), alerts.length > 1 ? `<button class="btn" id="dismissAll" type="button">Dismiss all</button>` : "")}
${alerts.length ? `<div class="grid">${alerts.map(alertCard).join("")}</div>` : `<div class="card empty">${icon("person")}Nothing needs you. Alerts from Make and the daily checks appear here.</div>`}
<p class="small" style="margin-top:24px">Alerts are cleared after ${KEEP_HANDLED_DAYS} days.</p>
<script>
async function dismiss(id) { await fetch("/api/dismiss-alert", { method: "POST", body: new URLSearchParams({ id: id }) }); }
document.querySelectorAll("[data-dismiss]").forEach(function (b) { b.addEventListener("click", async function () { await dismiss(b.dataset.dismiss); b.closest(".card").remove(); toast("Dismissed"); }); });
var all = document.getElementById("dismissAll");
if (all) all.addEventListener("click", async function () { all.disabled = true; for (const b of document.querySelectorAll("[data-dismiss]")) { await dismiss(b.dataset.dismiss); b.closest(".card").remove(); } toast("All dismissed"); });
</script>`);
}

async function page(env) {
  const items = Object.values(await loadItems(env));
  const alerts = await loadAlerts(env);
  const pending = items.filter((i) => i.status === "pending").sort((a, b) => b.receivedAt - a.receivedAt);
  const handled = items.filter((i) => i.status !== "pending").sort((a, b) => b.updatedAt - a.updatedAt);

  const pendingHtml = pending.length
    ? `<div class="grid">${pending.map(pendingCard).join("")}</div>`
    : `<div class="card empty">${icon("approve")}Nothing waiting for review. New videos appear here.</div>`;
  const alertsHtml = alerts.length ? `<h2>Alerts</h2><div class="grid">${alerts.map(alertCard).join("")}</div>` : "";
  const comingHtml = comingUp(await env.PENDING.get("daily", "json"));
  const handledHtml = handled.length ? `<h2>Recently handled</h2><div class="grid">${handled.map(handledCard).join("")}</div>` : "";

  return shell(`
${brandHeader("Approvals" + (pending.length ? ` (${pending.length})` : ""), `<a class="btn" href="/gags">✍ Gags</a><a class="btn" href="/tags">🏷 Tags</a><a class="btn" href="/stats">📈 Stats</a><a class="btn" href="/pricing">£ Pricing</a><a class="btn" href="/orders">🛒 Orders</a><a class="btn" href="/amend">✏ Update listings</a><a class="btn" href="/tools">🛠 Tools</a><a class="btn" href="/links">🔗 Links</a><a class="btn" href="/approvals">Refresh</a>`)}
${pendingHtml}
${alertsHtml}
${comingHtml}
${handledHtml}
<p class="small" style="margin-top:32px">Handled items and alerts are cleared after ${KEEP_HANDLED_DAYS} days. <a href="/logout" style="color:inherit">Sign out</a></p>
<script>
async function post(path, data){
  const res = await fetch(path, {method:'POST', body:new URLSearchParams(data), keepalive:true});
  let out = {}; try { out = await res.json(); } catch(e) {}
  if (!res.ok) throw new Error(out.error || ('Error ' + res.status));
  return out;
}
const cardData = el => { const c = el.closest('.card'); return {card:c, row:c.dataset.row, code:c.dataset.code, product:c.dataset.product}; };

document.querySelectorAll('[data-approve]').forEach(a => a.addEventListener('click', e => {
  const d = cardData(a);
  if (!confirm('Approve ' + d.product + '?\\n\\nThis attaches the video, publishes the listing live and posts to Pinterest, Instagram and Facebook.')) { e.preventDefault(); return; }
  post('/api/mark', {row:d.row, code:d.code, status:'approved'}).catch(()=>{});
  d.card.classList.add('done');
  a.outerHTML = '<div class="status wait">Approval sent. The result will appear here.</div>';
}));
document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
  const d = cardData(b);
  if (!confirm('Reject ' + d.product + '?\\n\\nThe approval link stops working and the row is marked REJECTED in Core, so no new video is made until you tap "Make new video".')) return;
  b.disabled = true; b.textContent = 'Rejecting…';
  try { await post('/api/reject', d); location.reload(); } catch (err) { alert(err.message); b.disabled = false; b.textContent = 'Reject'; }
}));
document.querySelectorAll('[data-rerender]').forEach(b => b.addEventListener('click', async () => {
  const d = cardData(b);
  if (!confirm('Make a new video for ' + d.product + ' now?\\n\\nIt uses whatever is in Core and on the Etsy listing right now.')) return;
  b.disabled = true; b.textContent = 'Starting…';
  try { await post('/api/rerender', d); location.reload(); } catch (err) { alert(err.message); b.disabled = false; b.textContent = 'Make new video'; }
}));
document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
  const d = cardData(b);
  if (!confirm('Hide ' + d.product + ' from this list? Nothing changes in Core or on Etsy.')) return;
  await post('/api/mark', {row:d.row, code:d.code, status:'removed'}).catch(()=>{});
  location.reload();
}));
document.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', async () => {
  await post('/api/dismiss-alert', {id: b.dataset.dismiss}).catch(()=>{});
  b.closest('.card').remove();
}));

// Refresh by itself when something changes, unless a video is playing.
let sig = null;
setInterval(async () => {
  try {
    const s = (await (await fetch('/api/state')).json()).sig;
    if (sig === null) { sig = s; return; }
    const playing = [...document.querySelectorAll('video')].some(v => !v.paused);
    if (s !== sig && !playing) location.reload();
  } catch (e) {}
}, 20000);
</script>`);
}

function captionBlock(i) {
  return i.caption ? `<div class="caption"><b>Instagram caption</b>${esc(i.caption)}</div>` : "";
}

function pendingCard(i) {
  // Not yet approved = not live, so open the listing in Shop Manager's editor rather than the public page.
  const listingId = (/\/listing\/(\d+)/.exec(String(i.listingUrl || "")) || [])[1];
  const listing = listingId ? `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}` : safeUrl(i.listingUrl);
  const oneDrive = safeUrl(i.videoUrl);
  const player = i.hasVideo
    ? `<video controls playsinline preload="metadata" src="/video/${encodeURIComponent(i.row)}/${encodeURIComponent(i.code)}"></video>`
    : "";
  return `
<div class="card" data-coll="${collOf(i.product)}" data-row="${esc(i.row)}" data-code="${esc(i.code)}" data-product="${esc(i.product)}">
  <div class="code">${esc(i.product)}</div>
  ${i.title ? `<div class="title">${esc(i.title)}</div>` : ""}
  <div class="meta">Rendered ${esc(when(i.receivedAt))}</div>
  ${player}
  ${captionBlock(i)}
  <div class="links">
    ${listing ? `<a href="${esc(listing)}" target="_blank" rel="noopener">${listingId ? "Edit in Shop Manager" : "Open listing"}</a>` : ""}
    ${oneDrive ? `<a href="${esc(oneDrive)}" target="_blank" rel="noopener">${i.hasVideo ? "Video in OneDrive" : "▶ Watch video"}</a>` : ""}
  </div>
  <a class="btn-main" data-approve href="${esc(approveUrl(i))}" target="_blank" rel="noopener">Approve</a>
  <button class="btn-alt" data-reject type="button">Reject</button>
  <button class="link-btn" data-remove type="button">Hide from list</button>
</div>`;
}

function handledCard(i) {
  let status = "";
  let action = "";
  if (i.status === "approved") {
    if (!i.result) status = `<div class="status wait">Approved ${esc(when(i.approvedAt || i.updatedAt))}. Waiting for the result from Make…</div>`;
    else if (i.result.ok) status = `<div class="status ok">✓ Live on Etsy and posted to Pinterest, Instagram and Facebook (${esc(when(i.result.at))})</div>`;
    else status = `<div class="status bad"><b>Failed${i.result.step ? " at " + esc(i.result.step) : ""}</b>${i.result.message ? "<br>" + esc(i.result.message) : ""}</div>`;
  } else if (i.status === "rejected") {
    status = `<div class="status bad">Rejected ${esc(when(i.updatedAt))}. Marked REJECTED in Core, so no new video will be made until you ask for one.</div>`;
    action = `<button class="btn-main" style="margin-top:10px" data-rerender type="button">Make new video</button>`;
  } else if (i.status === "rerendering") {
    status = `<div class="status wait">New video requested ${esc(when(i.updatedAt))}. It'll appear at the top when it's ready (usually a few minutes).</div>`;
  } else {
    status = `<div class="status wait">Hidden ${esc(when(i.updatedAt))}</div>`;
  }
  return `
<div class="card ${i.status === "rejected" ? "" : "done"}" data-coll="${collOf(i.product)}" data-row="${esc(i.row)}" data-code="${esc(i.code)}" data-product="${esc(i.product)}">
  <div class="code">${esc(i.product)}</div>
  ${i.title ? `<div class="title">${esc(i.title)}</div>` : ""}
  ${status}
  ${action}
</div>`;
}

const TYPE_NAMES = { "T-SHIRT": "T-shirt", "LONG-SLEEVE": "Long-sleeve", SWEATSHIRT: "Sweatshirt", HOODIE: "Hoodie" };

function comingUp(d) {
  if (!d) return "";
  const byDate = {};
  for (const u of d.upcoming || []) (byDate[u.date] = byDate[u.date] || []).push(u);
  const dates = Object.keys(byDate).sort();
  const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const rows = dates.map((date) => {
    const groups = {};
    for (const u of byDate[date]) (groups[u.gag] = groups[u.gag] || { title: u.title, items: [] }).items.push(u);
    const lines = Object.entries(groups).map(([gag, g]) =>
      `<div>${esc(gag)} <span class="small">${esc(g.title)}</span><br>${g.items.map((u) =>
        `<span class="badge"${u.built ? ' style="color:var(--ok);border-color:var(--ok)"' : ""}>${esc(TYPE_NAMES[u.type] || u.type)}${u.built ? " ✓" : ""}</span>`).join(" ")}</div>`).join("");
    return `<div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--line)"><div style="min-width:92px;font-weight:600">${esc(dayName(date))}${date === d.today ? '<br><span class="small">today</span>' : ""}</div><div style="display:grid;gap:8px">${lines}</div></div>`;
  }).join("");
  const todayMs = Date.parse(d.today + "T00:00:00Z");
  const runway = (d.runway || []).map((r) => {
    const left = r.lastDate ? Math.round((Date.parse(r.lastDate + "T00:00:00Z") - todayMs) / 864e5) : null;
    const low = left !== null && left < 7;
    return `<span class="badge"${low ? ' style="color:var(--warn);border-color:var(--warn)"' : ""}>${esc(r.collection)}: until ${esc(r.lastDate ? dayName(r.lastDate) : "nothing scheduled")}</span>`;
  }).join(" ");
  return `<h2>Coming up (next 7 days)</h2>
<div class="card">
  ${rows || '<div class="small">Nothing scheduled in the next 7 days.</div>'}
  <div style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><div class="small" style="margin-bottom:6px">Releases scheduled up to (✓ = listing already built):</div>${runway}</div>
  <div class="small" style="margin-top:8px">Updated daily at 09:15 (last: ${esc(when(d.at))}).</div>
</div>`;
}

function alertCard(a) {
  const link = safeUrl(a.link);
  return `
<div class="card alert">
  <div class="code" style="font-size:16px">${esc(a.title)}</div>
  <div class="meta">${esc(when(a.at))}${a.source ? " · " + esc(a.source) : ""}</div>
  ${a.body ? `<div class="body">${esc(a.body)}</div>` : ""}
  ${link ? `<div class="links"><a href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>` : ""}
  <button class="link-btn" data-dismiss="${esc(a.id)}" type="button">Dismiss</button>
</div>`;
}


// ---------- Gag writing ----------
// Make "Approvals App: Gags Sync" posts a summary of GAGS to /api/gags-sync.
// Saving calls the Make "Approvals App: Save Gag" webhook (MAKE_GAG_HOOK), which
// re-checks the sheet, writes the row, and reports back to /api/gag-result.

const SAVES_KEY = "gag-saves";

async function gagsSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await request.json();
  data.receivedAt = Date.now();
  await env.PENDING.put("gags", JSON.stringify(data));
  return json({ ok: true });
}

async function loadSaves(env) {
  const cutoff = Date.now() - KEEP_HANDLED_DAYS * 864e5;
  return ((await env.PENDING.get(SAVES_KEY, "json")) || []).filter((x) => x.at > cutoff);
}

async function gagResult(request, env, ctx, url) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await readBody(request);
  const saves = await loadSaves(env);
  const sv = saves.find((x) => x.ref === str(data.ref));
  const ok = str(data.ok) === "true";
  if (sv) {
    sv.status = ok ? "ok" : "failed";
    sv.message = str(data.message);
    if (str(data.gagId)) sv.gagId = str(data.gagId);
    sv.doneAt = Date.now();
    await env.PENDING.put(SAVES_KEY, JSON.stringify(saves));
  }
  if (!ok) ctx.waitUntil(notify(env, url.origin, "Gag NOT saved" + (str(data.gagId) ? ": " + str(data.gagId) : ""), str(data.message) || "Open the app for details.", "x"));
  return json({ ok: true });
}

async function gagsState(env) {
  const g = (await env.PENDING.get("gags", "json")) || null;
  const saves = await loadSaves(env);
  return json({ syncedAt: g ? g.at : null, saves: saves.map((x) => [x.ref, x.status]) });
}

async function gagsRefresh(env) {
  if (!env.MAKE_GAGSYNC_HOOK) return json({ error: "MAKE_GAGSYNC_HOOK is not set" }, 500);
  const res = await fetch(env.MAKE_GAGSYNC_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "refresh" }) });
  if (!res.ok) return json({ error: "Make didn't accept the refresh (" + res.status + ")" }, 502);
  return json({ ok: true });
}

async function gagSave(request, env) {
  if (!env.MAKE_GAG_HOOK) return json({ error: "MAKE_GAG_HOOK is not set" }, 500);
  const d = await request.json();
  const action = str(d.action);
  if (!["fill", "append", "edit"].includes(action)) return json({ error: "Unknown action" }, 400);
  const body = {
    ref: crypto.randomUUID(), action, gagId: str(d.gagId), collection: str(d.collection), category: str(d.category),
    text: String(d.text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, ""), stem: str(d.stem), tag12: "auto", tag13: "auto", // seasonal tags: always rotated by the tag engine (Barry, 10 Nov 2026)
    d1: str(d.d1), d2: str(d.d2), d3: str(d.d3), d4: str(d.d4), datesFromSlot: d.datesFromSlot ? "true" : "false",
  };
  if (!body.text || !body.collection || !body.category || !body.stem || ![body.d1, body.d2, body.d3, body.d4].every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
    return json({ error: "Please fill in the gag, collection, category, title stem and all four dates." }, 400);
  }
  const res = await fetch(env.MAKE_GAG_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept the save (" + res.status + "). Nothing was written." }, 502);
  const saves = await loadSaves(env);
  saves.unshift({ ref: body.ref, action, gagId: body.gagId, stem: body.stem, text: body.text, status: "pending", at: Date.now() });
  await env.PENDING.put(SAVES_KEY, JSON.stringify(saves.slice(0, 50)));
  return json({ ok: true, ref: body.ref });
}

async function gagsPage(env) {
  const g = await env.PENDING.get("gags", "json");
  const saves = await loadSaves(env);
  const savesHtml = saves.length ? `<h3 class="sideh">Recent saves</h3><div class="saves">${saves.slice(0, 8).map((x) => {
    const cls = x.status === "ok" ? "ok" : x.status === "failed" ? "bad" : "wait";
    const label = x.status === "ok" ? "✓ " + esc(x.message || "Saved to Core") : x.status === "failed" ? "<b>Not saved</b><br>" + esc(x.message || "") : "Saving to Core…";
    return `<div class="sv"><div class="svt"><b>${esc(x.stem || "")}</b><span>${esc(when(x.at))}</span></div><div class="status ${cls}">${label}</div></div>`;
  }).join("")}</div>` : "";
  return shell(`
${brandHeader("Gags", `<a class="btn link" href="/check">${icon("check")}Check for problems</a><button class="btn" id="refresh" type="button">${icon("sync")}Sync to Core</button>`)}
<div class="small" id="synced">${g ? "Core read " + esc(when(g.at)) : "Not read from Core yet. Tap Sync to Core."}</div>
<div class="gwrap"><div class="gmain">
<div class="tabs" style="display:flex;gap:8px;margin:16px 0 4px">
  <button class="btn tab on" data-tab="new" type="button">New gag</button>
  <button class="btn tab" data-tab="edit" type="button">Edit unreleased</button>
</div>
<div id="pick" class="card" style="display:none;margin-top:10px">
  <input id="search" placeholder="Search by ID, text or title stem…" style="width:100%;padding:11px;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">
  <div id="results" style="margin-top:8px;max-height:320px;overflow:auto"></div>
</div>
<form id="form" class="card" style="margin-top:10px;display:grid;gap:14px">
  <label><b>Collection</b><select id="collection" required></select></label>
  <div id="slot" class="small" style="display:none;margin-top:-6px"></div>
  <label><b>Gag</b> <span class="small">(press Enter for a new line, exactly as it should appear)</span>
      <textarea id="text" rows="9" required spellcheck="true"></textarea></label>
  <label><b>Gag category</b><select id="category" required></select></label>
  <label><b>Title stem</b><input id="stem" required maxlength="60" autocapitalize="words" autocomplete="off"><span class="small" id="stemnote"></span></label><div id="stemspell"></div>
  <input type="hidden" id="tag12" value="auto"><input type="hidden" id="tag13" value="auto">
  <div style="display:flex;gap:10px"><button class="btn-main" type="submit" id="save" style="flex:1">Save to Core</button><button class="btn" type="button" id="clear">Clear</button></div>
  <div><b>Release dates</b>
    <div class="four">
      <label>T-shirt<input type="date" id="d1" required></label><label>Long-sleeve<input type="date" id="d2" required></label>
      <label>Sweatshirt<input type="date" id="d3" required></label><label>Hoodie<input type="date" id="d4" required></label>
    </div></div>
</form>
</div>
<aside class="gside">
  <div class="frame"><div class="card"><h3 class="sideh">Preview</h3><div id="stage"><div id="pbox"></div></div><div id="pwarn"></div><div id="spell"></div>
  <p class="small" style="margin:10px 0 0">How the gag sits on the print, at the range's print width.</p></div></div>
  ${savesHtml ? `<div class="card" style="margin-top:14px">${savesHtml}</div>` : ""}
</aside></div>
<style>
  .gwrap{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;align-items:start;margin-top:10px}
  .gside{position:sticky;top:90px;display:flex;flex-direction:column}
  .sideh{margin:0 0 10px;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
  .saves{display:flex;flex-direction:column;gap:10px}
  .sv{border-top:1px solid var(--line);padding-top:10px}.sv:first-child{border-top:0;padding-top:0}
  .svt{display:flex;justify-content:space-between;gap:8px;font-size:14px}.svt span{color:var(--muted);font-size:12px;white-space:nowrap}
  .sv .status{margin-top:6px;padding:8px 10px;font-size:13px}
  #refresh.busy svg{animation:spin 1s linear infinite}
  @media (max-width:820px){.gwrap{grid-template-columns:1fr}.gside{position:static;order:-1}}
  select,input:not([type=checkbox]),textarea{display:block;width:100%;margin-top:6px;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);font-family:'Montserrat',sans-serif}
  select option{background:#1c1c1b;color:var(--text)}
  .tab.on{background:var(--accent);color:#141413;border-color:var(--accent)}
  #stage{background:rgba(0,0,0,.55)!important}
  @media (max-width:700px){.two{grid-template-columns:1fr}.four{grid-template-columns:1fr 1fr}.gagrow{flex-direction:column}}
  textarea{font-family:'Montserrat',sans-serif;line-height:1.35;resize:vertical}
  .gagrow{display:flex;gap:14px;flex-wrap:wrap}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:6px}
  #stage{margin-top:6px;background:#1b1b1a;border-radius:10px;padding:14px;overflow:hidden;position:relative;width:100%;min-height:60px}
  .gagrow > *{min-width:0}
  #pbox{position:absolute;left:14px;top:14px;transform-origin:top left;color:#fff;font-family:'Montserrat',sans-serif;font-weight:400;line-height:1.2;letter-spacing:-0.04em;text-align:right;outline:1px dashed rgba(255,255,255,.25)}
  #pbox div{white-space:nowrap}
  #pbox .over{color:#ff9a8a}
  .result{padding:10px;border-top:1px solid var(--line);cursor:pointer}
  .result:hover{background:var(--bg)}
  .cornerbtn{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:25;width:56px;height:56px;border-radius:16px;border:2px solid var(--frame);background:var(--card);color:var(--text);font-size:26px;line-height:1;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5)}
  @media (max-width:760px){.cornerbtn{bottom:calc(86px + env(safe-area-inset-bottom,0px))}}
  .cornerbtn svg{width:28px;height:28px;display:block;margin:auto}
  .cornerbtn.busy{animation:spin 1s linear infinite;opacity:.7}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&display=swap" rel="stylesheet">
<script>
let G = ${JSON.stringify(g || null).replace(/</g, "\\u003c")};
${GAGS_SCRIPT}</script>`);
}

// Page script for /gags, kept verbatim (String.raw) so backslashes like \n survive.
const GAGS_SCRIPT = String.raw`const BOX = { "INTROVERT HERE…": 509, "SHHH.": 505, "PER CONTRACT": 543, "OFF THE SHELF": 509 }; // OTS width is a placeholder until the first OTS print file is measured
const $ = (id) => document.getElementById(id);
let mode = "new", editing = null;

function opts(sel, items, placeholder) {
  sel.innerHTML = '<option value="">' + placeholder + '</option>' + items.map((x) => '<option>' + x.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</option>').join('');
}
if (G) { opts($("collection"), G.collections, "Choose…"); opts($("category"), G.categories, "Choose…"); }

let datesTouched = false;
function setDates(ds) { ["d1","d2","d3","d4"].forEach((k, i) => { $(k).value = (ds && ds[i]) || ""; }); datesTouched = false; }
["d1","d2","d3","d4"].forEach((k) => $(k).addEventListener("input", () => { datesTouched = true; }));

const CODE = { "INTROVERT HERE\u2026": "IH", "SHHH.": "SH", "PER CONTRACT": "PC", "OFF THE SHELF": "OS" };
function setLook(coll) {
  const c = CODE[coll] || "IH";
  document.body.dataset.coll = c;
  const logo = document.getElementById("logo"); if (logo) logo.src = "/assets/brand-" + c.toLowerCase() + "-wide.png";
}
function note(text, cls) { const el = $("slot"); el.style.display = text ? "block" : "none"; el.className = cls || "small"; el.textContent = text || ""; }
function slotInfo() {
  setLook($("collection").value);
  if (mode === "edit") { note(editing ? "Editing " + editing.id + " (not built yet). Saving updates its row in Core." : "", "small"); return; }
  const c = $("collection").value, pc = G && G.perCollection[c];
  if (!c || !pc) { note(""); return; }
  const n = pc.next;
  note(n.mode === "fill"
    ? "Fills prepared row " + n.id + " (" + pc.emptyLeft + " empty " + pc.prefix + " row" + (pc.emptyLeft === 1 ? "" : "s") + " left) \u2014 its dates are filled in below."
    : "No empty " + (pc.prefix || "") + " rows left \u2014 adds a new row at the bottom as " + n.id + ", dated the day after the latest date in Core.", "small");
  setDates(n.dates);
}
$("collection").addEventListener("change", () => { slotInfo(); preview(); });

// ----- live preview -----
let wAt100 = null;
function measureW() {
  const m = document.createElement('span');
  m.style.cssText = "position:absolute;left:-9999px;white-space:nowrap;font-family:Montserrat,sans-serif;font-weight:400;font-size:100px;letter-spacing:-0.04em";
  m.textContent = "WWWWWWWWWWWW"; document.body.appendChild(m); wAt100 = m.getBoundingClientRect().width; m.remove();
}
function preview() {
  if (!wAt100) return;
  const width = BOX[$("collection").value] || 509;
  const fs = width / wAt100 * 100;
  const box = $("pbox"); box.style.width = width + "px"; box.style.fontSize = fs.toFixed(2) + "px";
  const lines = $("text").value.replace(/\r/g, "").split("\n");
  box.innerHTML = lines.map((l) => '<div>' + (l ? l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/ /g,'&nbsp;') : '&nbsp;') + '</div>').join('');
  const over = [];
  [...box.children].forEach((d, i) => { const w = d.scrollWidth; if (w > width + 0.5) { d.classList.add('over'); over.push(i + 1); } });
  const stage = $("stage"); const scale = Math.min(1, (stage.clientWidth - 28) / width);
  box.style.transform = "scale(" + scale + ")"; stage.style.height = (box.scrollHeight * scale + 28) + "px";
  const warn = [];
  if (over.length) warn.push("Line" + (over.length > 1 ? "s " : " ") + over.join(", ") + (over.length > 1 ? " are" : " is") + " wider than 12 capital Ws and will wrap.");
  if (lines.length > 9) warn.push("That's " + lines.length + " lines - the grid holds 9.");
  if (lines.join("").trim() && !/^\s*(\.\.\.|\u2026)/.test($("text").value)) warn.push("It doesn't start with an ellipsis (... or \u2026).");
  $("pwarn").innerHTML = warn.length ? '<div class="status bad">' + warn.join("<br>") + '</div>' : (lines.join("").trim() ? '<div class="status ok">Fits the grid.</div>' : "");
}
$("text").addEventListener("input", preview);
window.addEventListener("resize", preview);
(document.fonts ? document.fonts.load("400 100px 'Montserrat'", "W") : Promise.resolve()).then(() => { measureW(); preview(); });

// ----- title stem note -----
function stemNote() {
  const s = $("stem").value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s) { $("stemnote").textContent = ""; return; }
  if (s.length <= 20) { $("stemnote").textContent = "Etsy tag: “" + s + "”"; return; }
  const longest = s.split(" ").reduce((a, b) => b.length > a.length ? b : a, "");
  $("stemnote").textContent = "Too long for a tag (" + s.length + "/20) - the tag will be “" + longest.slice(0, 20) + "”";
}
$("stem").addEventListener("input", stemNote);
// After a save the page reloads; land back at the top, ready for the next gag.
try { if (sessionStorage.getItem("gagTop")) { sessionStorage.removeItem("gagTop"); window.scrollTo(0, 0); addEventListener("load", () => window.scrollTo(0, 0)); if ("scrollRestoration" in history) history.scrollRestoration = "auto"; } } catch (e) {}
// ----- auto-formatting -----
// Gag text: capitals, except anything between *asterisks* and a letter straight after a number (e.g. 1960s).
function capsGag(t) {
  return t.split(/(\*[^*\n]*\*|\*[^*\n]*(?=\n|$))/).map((part) => /^\*[^*\n]*(\*|$)/.test(part) ? part : part.replace(/[a-z]/g, (ch, i, all) => (i > 0 && /\d/.test(all[i - 1]) ? ch : ch.toUpperCase()))).join("");
}
// Title stem: an all-capitals stem becomes Proper Case (a single short word like FOMO is left alone);
// otherwise just make sure every word starts with a capital.
function properStem(t) {
  const s = t.replace(/\s+/g, " ");
  const allCaps = /[A-Z]/.test(s) && !/[a-z]/.test(s);
  const words = s.trim().split(" ");
  if (allCaps && !(words.length === 1 && words[0].length <= 4)) {
    return s.toLowerCase().replace(/(^|[\s\-\/("'“])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  // a first word stuck in capitals (e.g. "HELLO There"), 5+ letters so short acronyms like FOMO stay
  const fixed = /[a-z]/.test(s) ? s.replace(/^(\s*)([A-Z]{5,})(?=[\s\-\/]|$)/, (m, a, w) => a + w[0] + w.slice(1).toLowerCase()) : s;
  return fixed.replace(/(^|[\s\-\/("'“])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
$("text").addEventListener("input", () => {
  const el = $("text"), v = el.value, f = capsGag(v);
  if (f !== v && f.length === v.length) { const a = el.selectionStart, b = el.selectionEnd; el.value = f; el.setSelectionRange(a, b); preview(); }
});
$("stem").addEventListener("change", () => { $("stem").value = properStem($("stem").value).trim(); stemNote(); });
// As you type: capitalise the first letter of each word (same length, so the cursor stays put).
$("stem").addEventListener("input", () => {
  const el = $("stem"), v = el.value;
  if (/[A-Z]/.test(v) && !/[a-z]/.test(v)) return; // typing in capitals: tidied when you leave the box
  const f = v.replace(/^([A-Z]{5,})(?=\s)/, (m, w) => w[0] + w.slice(1).toLowerCase()).replace(/(^|[\s\-\/("'\u201c])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  if (f !== v) { const a = el.selectionStart, b = el.selectionEnd; el.value = f; el.setSelectionRange(a, b); stemNote(); }
});


// ----- spelling & grammar -----
const escH = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function spellBox(el, matches, label) {
  if (!matches) { el.innerHTML = ""; return; }
  if (!matches.length) { el.innerHTML = label === "gag" ? '<div class="status ok">No spelling or grammar problems found.</div>' : ""; return; }
  el.innerHTML = '<div class="status bad">' + matches.map((m) =>
    m.kind + ': \u201c' + escH(m.word) + '\u201d' + (m.suggestions.length ? ' \u2014 did you mean \u201c' + m.suggestions.map(escH).join('\u201d / \u201c') + '\u201d?' : '') +
    (m.kind === "Grammar" && m.message ? ' <span style="opacity:.8">(' + escH(m.message) + ')</span>' : '')).join('<br>') + '</div>';
}
const timers = {};
function checkLater(id, outId, label) {
  clearTimeout(timers[id]);
  timers[id] = setTimeout(async () => {
    const text = $(id).value;
    if (!text.trim()) { spellBox($(outId), null); return; }
    $(outId).innerHTML = '<div class="small" style="margin-top:8px">Checking spelling and grammar\u2026</div>';
    try {
      const r = await (await fetch('/api/spell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).json();
      if ($(id).value !== text) return;
      if (r.unavailable) { $(outId).innerHTML = '<div class="small" style="margin-top:8px">Spell check isn\u2019t available right now.</div>'; return; }
      spellBox($(outId), r.matches, label);
    } catch (e) { $(outId).innerHTML = ""; }
  }, 1200);
}
$("text").addEventListener("input", () => checkLater("text", "spell", "gag"));
$("stem").addEventListener("input", () => checkLater("stem", "stemspell", "stem"));

// ----- tabs / edit picker -----
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.tab; editing = null;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
  $("pick").style.display = mode === "edit" ? "block" : "none";
  $("collection").disabled = mode === "edit";
  $("form").reset(); $("tag12").value = "auto"; $("tag13").value = "auto";
  slotInfo(); preview(); stemNote(); if (mode === "edit") search();
}));
function search() {
  const q = $("search").value.toLowerCase().trim();
  const all = ((G && G.editable) || []).filter((e) => !q || (e.id + " " + e.text + " " + e.stem + " " + e.category).toLowerCase().includes(q));
  const list = all.slice(0, 150);
  $("results").innerHTML = '<div class="small" style="padding:6px 10px">' + (all.length > list.length ? "Showing " + list.length + " of " + all.length + " - type in the search box to narrow it down." : all.length + " match" + (all.length === 1 ? "" : "es")) + '</div>' + list.map((e) => '<div class="result" data-id="' + e.id + '"><b>' + e.id + '</b> ' + (e.stem || '').replace(/</g,'&lt;') + '<div class="small">' + e.text.replace(/</g,'&lt;').replace(/\n/g, ' / ') + '</div></div>').join('') || '<div class="small" style="padding:10px">No matches.</div>';
  document.querySelectorAll('.result').forEach((r) => r.addEventListener('click', () => {
    editing = G.editable.find((e) => e.id === r.dataset.id);
    $("collection").value = editing.collection; $("category").value = editing.category; $("text").value = editing.text;
    $("stem").value = editing.stem; setDates(editing.dates);
    slotInfo(); preview(); stemNote(); checkLater("text", "spell", "gag"); checkLater("stem", "stemspell", "stem"); $("form").scrollIntoView({ behavior: "smooth" });
  }));
}
$("search").addEventListener("input", search);

// ----- save -----
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let action, gagId = "";
  if (mode === "edit") { if (!editing) { alert("Pick a gag to edit first."); return; } action = "edit"; gagId = editing.id; }
  let datesFromSlot = false;
  if (mode !== "edit") { const pc = G && G.perCollection[$("collection").value]; if (!pc) { alert("Choose a collection."); return; } action = pc.next.mode; gagId = pc.next.mode === "fill" ? pc.next.id : "";
    datesFromSlot = !datesTouched && ["d1","d2","d3","d4"].every((k, i) => $(k).value === (pc.next.dates[i] || "")); }
  $("text").value = capsGag($("text").value); $("stem").value = properStem($("stem").value).trim();
  if ($("pwarn").querySelector('.bad') && !confirm("The preview shows a problem with the line breaks. Save anyway?")) return;
  const body = { action, gagId, collection: $("collection").value, category: $("category").value, text: $("text").value, stem: $("stem").value,
    tag12: $("tag12").value, tag13: $("tag13").value, d1: $("d1").value, d2: $("d2").value, d3: $("d3").value, d4: $("d4").value, datesFromSlot };
  $("save").disabled = true; $("save").textContent = "Sending to Core…";
  const res = await fetch('/api/gag-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { alert(out.error || "Couldn't save."); $("save").disabled = false; $("save").textContent = "Save to Core"; return; }
  try { sessionStorage.setItem("gagTop", "1"); } catch (e) {}
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0); location.reload();
});

// ----- refresh + auto-update -----
$("refresh").addEventListener('click', async () => {
  const b = $("refresh"); if (b.classList.contains("busy")) return;
  b.classList.add("busy"); $("synced").textContent = "Syncing to Core… (about a minute)";
  setTimeout(() => b.classList.remove("busy"), 90000);
  const r = await fetch('/api/gags-refresh', { method: 'POST' }); if (!r.ok) { b.classList.remove("busy"); alert((await r.json().catch(()=>({}))).error || 'Refresh failed'); }
});
$("clear").addEventListener('click', () => {
  if ($("text").value.trim() && !confirm("Clear every field?")) return;
  ["text","stem","d1","d2","d3","d4","search"].forEach((k) => { if ($(k)) $(k).value = ""; });
  $("collection").value = ""; $("category").value = "";
  editing = null; datesTouched = false;
  ["stemnote","spell","stemspell","pwarn"].forEach((k) => { if ($(k)) $(k).textContent = ""; });
  slotInfo(); preview(); $("text").focus();
});
let last = null;
setInterval(async () => {
  try {
    const s = await (await fetch('/api/gags-state')).json(); const sig = JSON.stringify(s);
    if (last === null) { last = sig; return; }
    const typing = document.activeElement && ["TEXTAREA","INPUT","SELECT"].includes(document.activeElement.tagName) && $("text").value;
    if (sig !== last && !typing) location.reload();
    else if (sig !== last && typing) {
      // Core changed while you're typing: pick up the new row info without reloading the page.
      const fresh = await (await fetch('/api/gags-data')).json();
      if (fresh) { G = fresh; last = sig; if (mode !== "edit") { const keep = datesTouched ? ["d1","d2","d3","d4"].map((k) => $(k).value) : null; slotInfo(); if (keep) { ["d1","d2","d3","d4"].forEach((k, i) => $(k).value = keep[i]); datesTouched = true; } } }
    }
  } catch (e) {}
}, 5000);
slotInfo();
`;

// ---------- brand assets ----------
const ASSET_TYPES = { jpg: "image/jpeg", png: "image/png" };
async function asset(env, name) {
  if (!/^[a-z0-9-]+\.(jpg|png)$/.test(name)) return new Response("Not found", { status: 404 });
  const buf = await env.PENDING.get("asset:" + name, "arrayBuffer");
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(buf, { headers: { "Content-Type": ASSET_TYPES[name.split(".").pop()], "Cache-Control": "public, max-age=604800" } });
}
function manifest() {
  return new Response(JSON.stringify({
    name: "Introvert Here", short_name: "Introvert Here", start_url: "/", display: "standalone",
    background_color: "#121211", theme_color: "#121211",
    icons: [{ src: "/assets/icon3-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/icon3-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
    shortcuts: [{ name: "Links", short_name: "Links", url: "/links", icons: [{ src: "/assets/icon3-192.png", sizes: "192x192" }] }],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}

// ---------- Links (Core sheet LINKS, table LINKS_TABLE) ----------
// A copy of the table is kept in KV "links" ({at, rows:[{name,address,what}]}), sent by
// tools/sync_links.py (or any Make scenario) to /api/links-sync with the app secret.
// The page has its own manifest so it can sit on the home screen as a separate "IH Links" icon.
function linksManifest() {
  return new Response(JSON.stringify({
    id: "/links", name: "IH Links", short_name: "IH Links", start_url: "/links", scope: "/links", display: "standalone",
    background_color: "#121211", theme_color: "#121211",
    icons: [{ src: "/assets/icon3-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/icon3-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
async function linksSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const d = (await request.json()) || {};
  const rows = (Array.isArray(d.rows) ? d.rows : []).map((r) => ({ name: str(r.name), address: str(r.address), what: str(r.what) }))
    .filter((r) => r.name && /^https?:\/\//.test(r.address)).slice(0, 100);
  await env.PENDING.put("links", JSON.stringify({ at: Date.now(), rows }));
  return json({ ok: true, rows: rows.length });
}
// Quick buttons: each service's own mark, drawn in the app's white, chunky style, with its brand colour as a strip.
const BRAND_LINKS = [
  ["Etsy", "https://www.etsy.com/your/shops/me/dashboard", "#F1641E", '<path d="M9.5 6.5h13l.5 5h-1.6c-.6-2.2-1.4-3-3.6-3h-3.6v7h3.2c1.5 0 2-.6 2.3-2.2h1.5v6.3h-1.5c-.3-1.7-.8-2.3-2.3-2.3h-3.2v6.4c0 1.4.5 2 2.1 2h2.3c2 0 3.1-1 4-3.6h1.5l-.6 5.4H9.5v-1.4c1.6-.2 2-.6 2-2.2V10c0-1.6-.4-2-2-2.2z" fill="currentColor"/>'],
  ["Printify", "https://printify.com/app/store/products", "#39B75D", '<path d="M9 27V8.5c0-1.4 1.1-2.5 2.5-2.5H17a7.5 7.5 0 0 1 0 15h-3.6V27z" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/>'],
  ["Canva", "https://www.canva.com/projects", "#7D2AE8", '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20.5 12.2c-.7-1.4-2-2.2-3.6-2.2-3.2 0-5.4 2.8-5.4 6.2 0 3 1.8 5.3 4.6 5.3 1.9 0 3.4-.9 4.4-2.4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'],
  ["Make", "https://eu1.make.com/2110125/scenarios", "#6D00CC", '<rect x="5" y="8" width="4.6" height="17" rx="1.6" transform="skewX(-14)" fill="currentColor"/><rect x="13" y="8" width="4.6" height="17" rx="1.6" transform="skewX(-14)" fill="currentColor"/><rect x="21" y="8" width="4.6" height="17" rx="1.6" transform="skewX(-14)" fill="currentColor"/>'],
  ["Facebook", "https://www.facebook.com/1396268276895585", "#1877F2", '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M17.6 28.5V18h3.2l.5-3.6h-3.7v-2.3c0-1 .4-1.8 1.9-1.8h1.9V7.2a24 24 0 0 0-2.8-.2c-2.8 0-4.6 1.7-4.6 4.8v2.6h-3V18h3v10.5" fill="currentColor"/>'],
  ["Instagram", "https://www.instagram.com/introverthere.shop/", "#E1306C", '<rect x="4.5" y="4.5" width="23" height="23" rx="7" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="16" cy="16" r="5.4" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="22.6" cy="9.4" r="1.7" fill="currentColor"/>'],
  ["Pinterest", "https://www.pinterest.com/introverthereshop/", "#E60023", '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M14.2 27.6l2.4-9.4M13.6 19.4c-1.4-.7-2-2.2-2-3.8 0-3 2.4-5.4 5.6-5.4 2.9 0 4.8 2 4.8 4.6 0 3.2-1.8 5.6-4.3 5.6-1.3 0-2.2-1-1.9-2.2l1-3.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'],
];
async function linksPage(env) {
  const d = (await env.PENDING.get("links", "json")) || { rows: [] };
  const list = d.rows.length ? d.rows.map((r) => `<a class="lk" href="${esc(r.address)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b><span>${esc(r.what)}</span><small>${esc(r.address.replace(/^https?:\/\//, ""))}</small></a>`).join("")
    : `<p class="small">No links yet.</p>`;
  const quick = BRAND_LINKS.map(([name, url, colour, svg]) => `<a class="qk" href="${url}" target="_blank" rel="noopener" style="--b:${colour}"><svg viewBox="0 0 32 32" aria-hidden="true">${svg}</svg><span>${name}</span></a>`).join("");
  return shell(`
<style>
.lwrap{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
.lks{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.lk{display:block;padding:16px 18px;border:1px solid var(--line);border-radius:var(--r);background:var(--card);color:var(--text);text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.lk:hover{border-color:var(--frame)}
.lk b{display:block;font:800 17px var(--display);margin-bottom:4px}
.lk span{display:block;font-size:14px;color:var(--muted)}
.lk small{display:block;margin-top:8px;font:500 12px var(--mono);color:var(--muted);word-break:break-all}
.qside{position:sticky;top:90px}
.qside h3{margin:0 0 10px;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.qks{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qk{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:104px;padding:14px 8px 18px;border:2px solid rgba(242,240,235,.5);border-radius:16px;background:var(--card);color:var(--text);text-decoration:none;font:800 12px var(--display);letter-spacing:.1em;text-transform:uppercase;overflow:hidden}
.qk:hover{border-color:var(--frame)}
.qk svg{width:38px;height:38px}
.qk::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:var(--b)}
@media (max-width:860px){.lwrap{grid-template-columns:1fr}.qside{position:static;order:-1}.qks{grid-template-columns:repeat(4,1fr)}}
@media (max-width:480px){.qks{grid-template-columns:repeat(3,1fr)}}
</style>
${brandHeader("Links")}
<div class="lwrap">
  <div><div class="lks">${list}</div><p class="small" style="margin-top:14px">From the LINKS tab in Core${d.at ? " · updated " + esc(when(d.at)) : ""}.</p></div>
  <aside class="qside frame"><div class="card"><h3>Open</h3><div class="qks">${quick}</div></div></aside>
</div>`, "/links.webmanifest");
}

// ---------- spelling & grammar (LanguageTool, British English) ----------
// Gags are written in capitals, which spell checkers skip, so we check a
// sentence-case copy (same length, so positions still line up).
const LT_OFF = ["UPPERCASE_SENTENCE_START", "WHITESPACE_RULE", "ELLIPSIS", "EN_QUOTES", "DASH_RULE", "PUNCTUATION_PARAGRAPH_END",
  "COMMA_PARENTHESIS_WHITESPACE", "DOUBLE_PUNCTUATION", "MORFOLOGIK_RULE_EN_US", "EN_UNPAIRED_QUOTES", "EN_UNPAIRED_BRACKETS", "ENGLISH_WORD_REPEAT_RULE", "ENGLISH_WORD_REPEAT_BEGINNING_RULE"];
function sentenceCase(t) {
  let s = String(t).toLowerCase();
  s = s.replace(/(^\s*|[.!?…]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  s = s.replace(/\bi\b/g, "I");
  return s;
}
async function spell(request, env) {
  const d = await request.json().catch(() => ({}));
  const text = String(d.text || "").slice(0, 3000);
  if (!text.trim()) return json({ matches: [] });
  const form = new URLSearchParams({ text: sentenceCase(text), language: "en-GB", disabledRules: LT_OFF.join(",") });
  let res;
  try { res = await fetch("https://api.languagetool.org/v2/check", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } }); }
  catch (e) { return json({ unavailable: true }); }
  if (!res.ok) return json({ unavailable: true, status: res.status });
  const out = await res.json();
  const matches = (out.matches || []).map((m) => {
    const orig = text.substr(m.offset, m.length);
    const caps = orig && orig === orig.toUpperCase() && /[A-Z]/.test(orig);
    return {
      offset: m.offset, length: m.length, word: orig,
      kind: (m.rule && m.rule.issueType) === "misspelling" ? "Spelling" : "Grammar",
      message: m.shortMessage || m.message,
      suggestions: (m.replacements || []).slice(0, 3).map((r) => (caps ? r.value.toUpperCase() : r.value)),
    };
  });
  return json({ matches });
}


// ---------- stats (views, favourites, sales) ----------
// The noon Make check ("Reconcile Core LISTING_REGISTRY vs Etsy") posts a fresh copy once a day.
// A small daily history of views/favourites per listing is kept so the page can show the last 7 days.

const HIST_DAYS = 60;

async function statsIngest(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = (await request.json()) || {};
  if (!Array.isArray(data.listings)) return json({ error: "no listings" }, 400);
  data.at = data.at || new Date().toISOString();
  await env.PENDING.put("stats", JSON.stringify(data));
  const day = new Date(data.at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const hist = (await env.PENDING.get("stats-hist", "json")) || {};
  hist[day] = Object.fromEntries(data.listings.filter((l) => l.listingId).map((l) => [l.code, [l.views || 0, l.favs || 0]]));
  const keep = Object.keys(hist).sort().slice(-HIST_DAYS);
  const trimmed = Object.fromEntries(keep.map((k) => [k, hist[k]]));
  await env.PENDING.put("stats-hist", JSON.stringify(trimmed));
  return json({ ok: true, listings: data.listings.length, days: keep.length });
}

const TYPE_LABEL = { "T-SHIRT": "T-shirt", "LONG-SLEEVE": "Long-sleeve", "SWEATSHIRT": "Sweatshirt", "HOODIE": "Hoodie" };
const COLL_LABEL = { IH: "Introvert Here", SH: "SHHH", PC: "Per Contract", OS: "Off The Shelf" };
const gagOf = (code) => String(code || "").split("-").slice(0, 2).join("-");
const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2);

async function statsPage(env, url) {
  const st = await env.PENDING.get("stats", "json");
  const hist = (await env.PENDING.get("stats-hist", "json")) || {};
  const planner = await env.PENDING.get("planner-stats", "json");
  const nav = `<a class="btn" href="/">← Approvals</a><a class="btn" href="/gags">✍ Gags</a>`;
  if (!st) {
    return shell(`${brandHeader("Stats", nav)}<div class="card empty">No stats yet. They arrive with the daily Etsy check at 12:00.</div>`);
  }
  const live = st.listings.filter((l) => l.listingId);
  const days = Object.keys(hist).sort();
  const today = days[days.length - 1];
  // Oldest snapshot that is at least 7 days back, else the oldest we have.
  const base = days.filter((d) => d <= addDays(today, -7)).pop() || days[0];
  const baseDays = base && today ? Math.round((Date.parse(today) - Date.parse(base)) / 864e5) : 0;
  const recent = (code, i) => (base && base !== today && hist[base][code] ? (hist[today][code] || [0, 0])[i] - hist[base][code][i] : null);

  // Sales per product code and per gag
  const sold = {}; let revenue = 0, units = 0;
  for (const o of st.orders || []) {
    units += o.qty; revenue += o.price * o.qty;
    if (o.code) sold[o.code] = (sold[o.code] || 0) + o.qty;
  }

  // Group by gag
  const gags = {};
  for (const l of live) {
    const id = gagOf(l.code);
    const g = (gags[id] ||= { id, stem: l.stem, coll: collOf(l.code), views: 0, favs: 0, recent: 0, hasRecent: false, sales: 0, items: [] });
    g.views += l.views; g.favs += l.favs; g.sales += sold[l.code] || 0;
    const r = recent(l.code, 0);
    if (r != null) { g.recent += r; g.hasRecent = true; }
    g.items.push(l);
  }
  const sortBy = ["views", "recent", "favs", "sales"].includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "views";
  const list = Object.values(gags).sort((a, b) => b[sortBy] - a[sortBy] || b.views - a.views);

  const tot = (k) => live.reduce((n, l) => n + (l[k] || 0), 0);
  const totRecent = live.reduce((n, l) => n + (recent(l.code, 0) || 0), 0);
  const tile = (label, value, sub = "") => `<div class="card tile"><div class="tv">${value}</div><div class="tl">${label}</div>${sub ? `<div class="small">${sub}</div>` : ""}</div>`;

  const group = (keyFn, labelFn) => {
    const m = {};
    for (const l of live) {
      const k = keyFn(l);
      const x = (m[k] ||= { k, n: 0, views: 0, favs: 0, sales: 0 });
      x.n++; x.views += l.views; x.favs += l.favs; x.sales += sold[l.code] || 0;
    }
    return Object.values(m).sort((a, b) => b.views - a.views).map((x) =>
      `<div class="srow"><div class="sname">${esc(labelFn(x.k))}<div class="small">${x.n} listing${x.n === 1 ? "" : "s"}</div></div><div class="snum">${x.views}<span>views</span></div><div class="snum">${x.favs}<span>favs</span></div><div class="snum">${x.sales}<span>sold</span></div></div>`).join("");
  };

  const sortBtn = (k, label) => `<a class="btn${sortBy === k ? " on" : ""}" href="/stats?sort=${k}">${label}</a>`;
  const gagRows = list.map((g) => `
<details class="srow-wrap" data-coll="${g.coll}">
  <summary class="srow"><div class="sname"><b>${esc(g.stem || g.id)}</b><div class="small">${esc(g.id)} · ${esc(COLL_LABEL[g.coll] || g.coll)}</div></div>
    <div class="snum">${g.views}<span>views</span></div>
    <div class="snum">${g.hasRecent ? (g.recent > 0 ? "+" : "") + g.recent : "–"}<span>${baseDays ? baseDays + " days" : "recent"}</span></div>
    <div class="snum">${g.favs}<span>favs</span></div>
    <div class="snum${g.sales ? " hot" : ""}">${g.sales}<span>sold</span></div></summary>
  <div class="sub">${g.items.sort((a, b) => b.views - a.views).map((l) => `<div class="srow small2"><div class="sname"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(TYPE_LABEL[l.type] || l.type)}</a>${l.state && l.state !== "active" ? ` <span class="badge">${esc(l.state)}</span>` : ""}</div><div class="snum">${l.views}<span>views</span></div><div class="snum">${recent(l.code, 0) ?? "–"}<span>recent</span></div><div class="snum">${l.favs}<span>favs</span></div><div class="snum">${sold[l.code] || 0}<span>sold</span></div></div>`).join("")}</div>
</details>`).join("");

  const ordersHtml = (st.orders || []).length ? (st.orders || []).slice().sort((a, b) => (b.date > a.date ? 1 : -1)).map((o) =>
    `<div class="srow"><div class="sname"><b>${esc(o.title)}</b><div class="small">${esc(o.variant)} · ${esc(o.date)}${o.status ? " · " + esc(o.status.replace(/-|_/g, " ")) : ""}</div></div><div class="snum">${money(o.price * o.qty)}<span>sale</span></div><div class="snum">${money(o.cost)}<span>Printify</span></div></div>`).join("")
    : `<div class="small">No orders yet.</div>`;

  return shell(`
<style>
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.tile{padding:14px 16px}.tv{font-size:28px;font-weight:700}.tl{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);font-weight:700}
.list{padding:6px 14px}
.srow{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);list-style:none;cursor:default}
.srow-wrap:last-child>.srow,.list>.srow:last-child{border-bottom:0}
summary.srow{cursor:pointer}summary.srow::-webkit-details-marker{display:none}
.srow-wrap{border-left:4px solid transparent;padding-left:8px;margin-left:-8px}
.srow-wrap[data-coll=IH]{border-left-color:#d8d3c8}.srow-wrap[data-coll=SH]{border-left-color:#9fd4b1}.srow-wrap[data-coll=PC]{border-left-color:#e0574a}.srow-wrap[data-coll=OS]{border-left-color:#d4a94a}
.sname{flex:1;min-width:0;overflow-wrap:anywhere}
.snum{width:62px;text-align:right;font-weight:700;font-size:17px;flex-shrink:0}
.snum span{display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.snum.hot{color:var(--ok)}
.sub{background:var(--field);border-radius:10px;padding:0 10px;margin:0 0 10px}
.small2{font-size:14px}.small2 .snum{font-size:15px}
.btn.on{background:var(--accent);color:#111}
.sorts{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px}
@media (max-width:700px){.snum{width:50px;font-size:15px}.tv{font-size:24px}.tiles{grid-template-columns:repeat(2,1fr)}}
</style>
${brandHeader("Stats", nav)}
<div class="small">From Etsy and Printify, updated daily at 12:00. Last update ${esc(when(Date.parse(st.at)))}.${baseDays ? "" : " The “recent” column fills in once a few days of history have built up."}</div>
<h2>Shop totals</h2>
<div class="tiles">
${tile("Listings", live.length)}
${tile("Views", tot("views"), baseDays ? `${totRecent >= 0 ? "+" : ""}${totRecent} in the last ${baseDays} days` : "")}
${tile("Favourites", tot("favs"))}
${tile("Items sold", units)}
${tile("Sales", money(revenue))}
</div>
${plannerStatsHtml(planner, tile)}
<h2>By gag</h2>
<div class="sorts">${sortBtn("views", "Most views")}${sortBtn("recent", "Most views lately")}${sortBtn("favs", "Most favourites")}${sortBtn("sales", "Most sold")}</div>
<div class="card list">${gagRows || `<div class="small">Nothing live yet.</div>`}</div>
<p class="small">Tap a gag to see each garment.</p>
<h2>By collection</h2>
<div class="card list">${group((l) => collOf(l.code), (k) => COLL_LABEL[k] || k)}</div>
<h2>By garment</h2>
<div class="card list">${group((l) => l.type, (k) => TYPE_LABEL[k] || k)}</div>
<h2>Orders</h2>
<div class="card list">${ordersHtml}</div>
`);
}

function addDays(day, n) {
  const d = new Date(Date.parse(day + "T12:00:00Z") + n * 864e5);
  return d.toISOString().slice(0, 10);
}


// ---------- pricing ----------
// Make ("Approvals App — Pricing") posts the current prices (PRODUCT_RULES) and the cost table + fee settings
// (PRICING sheet in Core) to /api/pricing-sync. The page recalculates profit as you type; Save sends the new
// prices back through Make, which writes Core and (optionally) re-prices every live listing.

async function pricingSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await request.json();
  data.receivedAt = Date.now();
  await env.PENDING.put("pricing", JSON.stringify(data));
  return json({ ok: true });
}
async function pricingRefresh(env) {
  if (!env.MAKE_PRICING_HOOK) return json({ error: "MAKE_PRICING_HOOK is not set" }, 500);
  const res = await fetch(env.MAKE_PRICING_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
  return res.ok ? json({ ok: true }) : json({ error: "Make didn't accept the refresh (" + res.status + ")" }, 502);
}
async function pricingSave(request, env) {
  if (!env.MAKE_PRICING_HOOK) return json({ error: "MAKE_PRICING_HOOK is not set" }, 500);
  const d = await request.json();
  const types = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
  const prices = {};
  for (const t of types) {
    const x = (d.prices || {})[t] || {};
    const price = Number(x.price), x2 = Number(x.x2), x3 = Number(x.x3);
    if (!(price > 5 && price < 500) || !(x2 >= 0 && x2 < 50) || !(x3 >= 0 && x3 < 50)) return json({ error: "Check the prices for " + t.toLowerCase() + "." }, 400);
    prices[t] = { price: Math.round(price * 100) / 100, x2: Math.round(x2 * 100) / 100, x3: Math.round(x3 * 100) / 100 };
  }
  const st = d.settings || {};
  const settings = { target: Number(st.target), rate: Number(st.rate), card: Number(st.card) };
  if (!(settings.target >= 0 && settings.target < 100) || !(settings.rate > 0.5 && settings.rate < 3) || !(settings.card >= 0 && settings.card < 0.2)) return json({ error: "Check the settings." }, 400);
  const body = { action: "save", prices: JSON.stringify(prices), settings: JSON.stringify(settings), reprice: d.reprice ? "true" : "false" };
  const res = await fetch(env.MAKE_PRICING_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept the save (" + res.status + "). Nothing was changed." }, 502);
  const cur = (await env.PENDING.get("pricing", "json")) || {};
  cur.pendingSave = { at: Date.now(), reprice: !!d.reprice };
  await env.PENDING.put("pricing", JSON.stringify(cur));
  return json({ ok: true });
}

// Live exchange rates for the Pricing page calculator (free daily feed, kept for 6 hours).
async function fxRates(env) {
  const c = await env.PENDING.get("fx", "json");
  if (c && Date.now() - c.at < 6 * 3600e3) return c;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/GBP");
    const j = await r.json();
    if (j && j.result === "success" && j.rates) {
      const keep = ["GBP", "USD", "EUR", "CAD", "AUD"];
      const out = { at: Date.now(), updated: j.time_last_update_utc || "", rates: Object.fromEntries(keep.map((k) => [k, j.rates[k]])) };
      await env.PENDING.put("fx", JSON.stringify(out));
      return out;
    }
  } catch (e) {}
  return c || null;
}

async function pricingPage(env) {
  const fx = await fxRates(env);
  const data = await env.PENDING.get("pricing", "json");
  const nav = `<a class="btn" href="/">← Approvals</a><a class="btn" href="/stats">📈 Stats</a><button class="btn" id="refresh" type="button">${icon("sync")}Sync to Core</button>`;
  return shell(`
<style>
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.pcard h3{margin:0 0 10px;font-size:18px}
.prow{display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap}
.prow label{flex:1;min-width:120px;font-size:14px;color:var(--muted)}
.prow input{width:110px;padding:9px 10px;font:600 16px Montserrat;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text);text-align:right}
table.pt{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
table.pt th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-align:right;padding:6px 4px;font-weight:600}
table.pt th:first-child,table.pt td:first-child{text-align:left}
table.pt td{padding:7px 4px;text-align:right;border-top:1px solid var(--line);font-weight:600}
.good{color:var(--ok)}.meh{color:#e7c27b}.bad{color:var(--warn)}
.small2{font-size:13px;color:var(--muted)}
</style>
${brandHeader("Pricing", nav)}
<div class="frame" style="margin-bottom:18px"><div class="card">
  <h3 style="margin:0 0 4px;font:800 16px var(--display);letter-spacing:.06em;text-transform:uppercase">Currency calculator</h3>
  <p class="small" style="margin:0 0 12px">Type an amount in any box and the others work it out.${fx ? " Rates from " + esc(new Date(fx.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })) + "." : " Rates aren't available right now."}</p>
  <div class="fxg">${[["GBP", "£", "UK"], ["USD", "$", "US"], ["EUR", "€", "Europe"], ["CAD", "C$", "Canada"], ["AUD", "A$", "Australia"]].map(([c, sym, where]) => `<label class="fx"><span>${c} <small>${where}</small></span><div><b>${sym}</b><input inputmode="decimal" data-cur="${c}" placeholder="0.00"></div></label>`).join("")}</div>
</div></div>
<style>
.fxg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.fx{display:flex;flex-direction:column;gap:6px;font:800 12px var(--display);letter-spacing:.1em;color:var(--muted)}
.fx small{font:500 11px var(--body);letter-spacing:0;color:var(--dim)}
.fx div{display:flex;align-items:center;gap:6px;border:1.5px solid var(--line);border-radius:12px;background:var(--field);padding:0 12px;min-height:56px}
.fx div:focus-within{border-color:var(--frame)}
.fx b{font:700 16px var(--display);color:var(--muted)}
.fx input{flex:1;min-width:0;border:0;background:none;color:var(--text);font:700 20px var(--display);outline:none;font-variant-numeric:tabular-nums}
@media (max-width:760px){.fxg{grid-template-columns:repeat(2,minmax(0,1fr))}.fxg label:first-child{grid-column:1/-1}}
</style>
<script>
(function () {
  var R = ${JSON.stringify(fx ? fx.rates : null)};
  var boxes = document.querySelectorAll("[data-cur]");
  if (!R) { boxes.forEach(function (b) { b.disabled = true; }); return; }
  boxes.forEach(function (b) { b.addEventListener("input", function () {
    var v = parseFloat(String(b.value).replace(/[^0-9.]/g, ""));
    var gbp = isFinite(v) ? v / R[b.dataset.cur] : NaN;
    boxes.forEach(function (o) { if (o !== b) o.value = isFinite(gbp) ? (gbp * R[o.dataset.cur]).toFixed(2) : ""; });
  }); });
})();
</script>
<div class="small" id="synced"></div>
<div id="app"></div>
<script>
let D = ${JSON.stringify(data || null)};
const $ = (id) => document.getElementById(id);
const TYPES = [["T-SHIRT","T-shirt"],["LONG-SLEEVE","Long-sleeve"],["SWEATSHIRT","Sweatshirt"],["HOODIE","Hoodie"]];
const money = (n) => (n < 0 ? "−£" : "£") + Math.abs(n).toFixed(2);
function cls(p, target){ return p >= target - 0.005 ? "good" : (p >= target / 2 ? "meh" : "bad"); }
function render() {
  if (!D || !D.garments) { $("app").innerHTML = '<div class="card empty">No pricing data yet. Tap “Sync to Core”.</div>'; return; }
  const s = D.settings;
  $("synced").textContent = "Core read " + new Date(D.receivedAt).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) + (D.pendingSave ? " · saving…" : "") + (D.lastSave ? " · last saved " + D.lastSave : "");
  let html = '<div class="card" style="margin:14px 0"><h3 style="margin:0 0 6px">Settings</h3>' +
    '<div class="prow"><label>Profit you want per item (£)</label><input id="s_target" type="number" step="0.5" value="' + s.target + '"></div>' +
    '<div class="prow"><label>US dollars per £1 (Printify bills in dollars)</label><input id="s_rate" type="number" step="0.01" value="' + s.rate + '"></div>' +
    '<div class="prow"><label>Card foreign-currency fee (0.03 = 3%)</label><input id="s_card" type="number" step="0.005" value="' + s.card + '"></div>' +
    '<div class="small2">Etsy fees (6.5% + 4% + 20p + 0.48% + renewal, plus 20% VAT) and Printify\\'s 20% VAT on UK orders are included. Prices apply to all three collections.</div></div>';
  html += '<div class="pgrid">';
  for (const [t, name] of TYPES) {
    const g = D.garments[t], r = D.prices[t];
    html += '<div class="card pcard" data-t="' + t + '"><h3>' + name + '</h3>' +
      '<div class="prow"><label>Price, sizes S–XL (£)</label><input class="pin" data-k="price" type="number" step="0.01" value="' + r.price + '"></div>' +
      '<div class="prow"><label>Extra for 2XL (£)</label><input class="pin" data-k="x2" type="number" step="0.5" value="' + r.x2 + '"></div>' +
      '<div class="prow"><label>Extra for 3XL and up (£)</label><input class="pin" data-k="x3" type="number" step="0.5" value="' + r.x3 + '"></div>' +
      '<table class="pt"><thead><tr><th>Size</th><th>Price</th><th>Profit UK</th><th>Profit US</th><th>£' + '<span class="tgt"></span> price</th></tr></thead><tbody></tbody></table>' +
      '<button class="link-btn usefloor" type="button">Use the prices that hit my target</button></div>';
  }
  html += '</div><div class="card" style="margin-top:16px"><label style="display:flex;gap:10px;align-items:center;font-size:15px"><input id="reprice" type="checkbox" checked style="width:20px;height:20px"> Also update the prices on all live Etsy listings now</label>' +
    '<button class="btn-main" id="save" type="button" style="margin-top:12px">Save prices</button><div id="msg" class="small" style="margin-top:8px"></div></div>';
  $("app").innerHTML = html;
  document.querySelectorAll("input").forEach((i) => i.addEventListener("input", calc));
  document.querySelectorAll(".usefloor").forEach((b) => b.addEventListener("click", () => useFloor(b.closest(".pcard"))));
  $("save").addEventListener("click", save);
  calc();
}
function settings() { return Object.assign({}, D.settings, { target: +$("s_target").value, rate: +$("s_rate").value, card: +$("s_card").value }); }
function numbers(card) { const v = {}; card.querySelectorAll(".pin").forEach((i) => v[i.dataset.k] = +i.value); return v; }
function rowsFor(t, v, s) {
  const g = D.garments[t];
  const pct = s.txn + s.procPct + s.reg, fixed = s.procFixed + s.renew;
  return [["S–XL", 0], ["2XL", v.x2], ["3XL", v.x3]].map(([size, extra]) => {
    const c = g[size]; if (!c) return null;
    const P = v.price + extra;
    const fees = (1 + s.vatFees) * (pct * P + fixed);
    const uk = (c.cost + c.shipUK) / s.rate * (1 + s.card) * (1 + s.vatUK);
    const us = (c.cost + c.shipUS) / s.rate * (1 + s.card);
    const floor = (s.target + uk + (1 + s.vatFees) * fixed) / (1 - (1 + s.vatFees) * pct);
    return { size, P, pUK: P - fees - uk, pUS: P - fees - us, floor: Math.ceil(floor) - 0.01, extra };
  }).filter(Boolean);
}
function calc() {
  const s = settings();
  document.querySelectorAll(".tgt").forEach((e) => e.textContent = s.target);
  document.querySelectorAll(".pcard").forEach((card) => {
    const rows = rowsFor(card.dataset.t, numbers(card), s);
    card.querySelector("tbody").innerHTML = rows.map((r) => '<tr><td>' + r.size + '</td><td>' + money(r.P) + '</td><td class="' + cls(r.pUK, s.target) + '">' + money(r.pUK) + '</td><td class="' + cls(r.pUS, s.target) + '">' + money(r.pUS) + '</td><td>' + money(r.floor) + '</td></tr>').join("");
  });
}
function useFloor(card) {
  const rows = rowsFor(card.dataset.t, numbers(card), settings());
  const base = rows[0].floor;
  card.querySelector('[data-k=price]').value = base.toFixed(2);
  if (rows[1]) card.querySelector('[data-k=x2]').value = Math.max(0, Math.ceil(rows[1].floor - base)).toFixed(2);
  if (rows[2]) card.querySelector('[data-k=x3]').value = Math.max(0, Math.ceil(rows[2].floor - base)).toFixed(2);
  calc();
}
async function save() {
  const prices = {}; document.querySelectorAll(".pcard").forEach((c) => prices[c.dataset.t] = numbers(c));
  const reprice = $("reprice").checked;
  if (reprice && !confirm("Save these prices and update all live Etsy listings now?")) return;
  $("save").disabled = true; $("msg").textContent = "Saving…";
  const r = await fetch("/api/pricing-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prices, settings: settings(), reprice }) });
  const j = await r.json().catch(() => ({}));
  $("save").disabled = false;
  $("msg").textContent = r.ok ? (reprice ? "Saved to Core. Live listings are being updated now (a few minutes); you'll get an alert when it's done." : "Saved to Core. New listings will use these prices.") : (j.error || "Something went wrong.");
  if (r.ok) setTimeout(poll, 8000);
}
async function poll() { const r = await fetch("/api/pricing-state"); if (r.ok) { const d = await r.json(); if (d && (!D || d.receivedAt !== D.receivedAt)) { D = d; render(); return; } } setTimeout(poll, 8000); }
$("refresh").addEventListener("click", async () => { $("refresh").disabled = true; $("refresh").textContent = "Syncing…"; await fetch("/api/pricing-refresh", { method: "POST" }); setTimeout(poll, 6000); });
render();
</script>`);
}


// ---------- tools ----------
// Buttons for the Make tools (each has its own webhook), plus a "Check Core" scan that runs in the browser
// on the gag list the Gags sync keeps in KV.

const TOOLS = {
  print:   { hook: "MAKE_TOOL_PRINT_HOOK",   name: "Refresh print files" },
  reprice: { hook: "MAKE_TOOL_REPRICE_HOOK", name: "Re-price listings" },
};
async function toolRun(request, env) {
  const d = await request.json();
  const t = TOOLS[d.tool];
  if (!t) return json({ error: "Unknown tool" }, 400);
  const url = env[t.hook];
  if (!url) return json({ error: t.hook + " is not set" }, 500);
  const collections = String(d.collections || "").split(",").filter((c) => ["IH", "SH", "PC", "OS"].includes(c)).join(",");
  const only = String(d.only || "").toUpperCase().split(/[\s,]+/).filter((c) => /^[A-Z]{2}-\d{5}-[A-Z-]+$/.test(c)).join(",");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collections, only }) });
  if (!res.ok) return json({ error: "Make didn't accept it (" + res.status + ")" }, 502);
  const runs = (await env.PENDING.get("tool-runs", "json")) || {};
  runs[d.tool] = { at: Date.now(), scope: only || collections || "all" };
  await env.PENDING.put("tool-runs", JSON.stringify(runs));
  return json({ ok: true });
}

async function toolsPage(env) {
  const runs = (await env.PENDING.get("tool-runs", "json")) || {};
  const last = (k) => runs[k] ? "Last started " + esc(when(runs[k].at)) + " (" + esc(runs[k].scope) + ")" : "Not run from the app yet";
  const scope = (k, withOS) => `<div class="prow"><label>Which listings</label><select class="tsel" data-k="${k}">
    <option value="">All collections</option><option value="IH">Introvert Here</option><option value="SH">SHHH.</option><option value="PC">Per Contract</option><option value="OS">Off The Shelf</option></select></div>
    <div class="prow"><label>Or just these product codes (optional)</label><input class="tonly" data-k="${k}" placeholder="e.g. IH-00002-HOODIE"></div>`;
  return shell(`
<style>
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.prow{display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap}
.prow label{flex:1;min-width:140px;font-size:14px;color:var(--muted)}
.prow select,.prow input{flex:1;min-width:160px;padding:9px 10px;font:15px Montserrat;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text)}
.tcard h3{margin:0 0 6px;font-size:18px}
.tcard p{margin:0 0 8px;font-size:14px;color:var(--muted)}
.issue{border-top:1px solid var(--line);padding:9px 0;font-size:14px;white-space:pre-wrap}
.issue b{display:block;font-size:13px;color:var(--accent);margin-bottom:2px}
</style>
${brandHeader("Check Core", `<button class="btn" id="scanRefresh" type="button">${icon("sync")}Sync to Core</button>`)}
<div class="frame" style="max-width:860px"><div class="card tcard">
  <h3>Check the gags for problems</h3>
  <p>Looks through every written gag for duplicates, very similar gags, title stems with stray spaces or line breaks, gags missing the opening "...", and custom tags over Etsy's 20 characters. Instant and free.</p>
  <button class="btn-main" id="scan" type="button">${icon("check")}Check now</button>
  <div id="scanOut" class="small" style="margin-top:12px"></div>
</div></div>
<script>
const $ = (id) => document.getElementById(id);
document.querySelectorAll(".trun").forEach((b) => b.addEventListener("click", async () => {
  const card = b.closest("[data-tool]"), tool = card.dataset.tool;
  const sel = card.querySelector(".tsel"), only = card.querySelector(".tonly");
  const collections = sel ? sel.value : "", codes = only ? only.value.trim() : "";
  const what = codes ? codes : (collections ? sel.options[sel.selectedIndex].text : "ALL listings");
  if (!confirm("Run “" + card.querySelector("h3").textContent + "” on " + what + "?")) return;
  b.disabled = true; card.querySelector(".tmsg").textContent = "Starting…";
  const r = await fetch("/api/tool-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, collections, only: codes }) });
  const j = await r.json().catch(() => ({}));
  b.disabled = false;
  card.querySelector(".tmsg").textContent = r.ok ? "Started. You'll get an alert on the Approvals page when it's done." : (j.error || "Something went wrong.");
}));
const norm = (t) => String(t || "").toUpperCase().replace(/…/g, " ").replace(/[^A-Z0-9' ]+/g, " ").replace(/\\s+/g, " ").trim();
function bigrams(s) { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; }
function dice(a, b) { let inter = 0, na = 0, nb = 0; a.forEach((v) => na += v); b.forEach((v) => nb += v); a.forEach((v, k) => { if (b.has(k)) inter += Math.min(v, b.get(k)); }); return na + nb ? 2 * inter / (na + nb) : 0; }
async function scan() {
  const out = $("scanOut"); out.textContent = "Checking…";
  const r = await fetch("/api/gags-data"); const g = r.ok ? await r.json() : null;
  if (!g || !g.all) { out.innerHTML = "The app hasn't got the full gag list yet. Tap “Sync to Core”, wait a minute, then check again."; return; }
  const all = g.all, issues = [];
  const by = (f) => { const m = {}; all.forEach((x) => { const k = f(x); if (k) (m[k] = m[k] || []).push(x.id); }); return Object.entries(m).filter(([, v]) => v.length > 1); };
  by((x) => x.id).forEach(([k, v]) => issues.push(["Same gag ID used twice", k + " (" + v.length + " rows)"]));
  by((x) => norm(x.text)).forEach(([, v]) => issues.push(["Identical gag text", v.join(", ")]));
  by((x) => String(x.stem).trim().toLowerCase()).forEach(([k, v]) => issues.push(["Same title stem", "“" + k + "”: " + v.join(", ")]));
  all.forEach((x) => {
    const s = String(x.stem || "");
    if (/[\\r\\n\\t]/.test(s)) issues.push(["Line break in title stem", x.id + " (row " + x.row + "): " + JSON.stringify(s)]);
    else if (/^\\s|\\s$|\\s{2,}/.test(s)) issues.push(["Stray spaces in title stem", x.id + " (row " + x.row + "): “" + s + "”"]);
    if (!/^\\s*(\\.\\.\\.|…)/.test(x.text)) issues.push(["Missing the opening ...", x.id + " (row " + x.row + ")"]);
    [x.t12, x.t13].forEach((t) => { if (t && String(t).trim().length > 20) issues.push(["Custom tag over 20 characters", x.id + ": “" + t + "”"]); });
  });
  const B = all.map((x) => ({ id: x.id, n: norm(x.text), t: x.text }));
  B.forEach((x) => x.bg = bigrams(x.n));
  const sim = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j]; if (a.n === b.n) continue;
    if (Math.abs(a.n.length - b.n.length) > 0.5 * Math.max(a.n.length, b.n.length)) continue;
    const d = dice(a.bg, b.bg); if (d >= 0.72) sim.push([d, a, b]);
  }
  sim.sort((p, q) => q[0] - p[0]).slice(0, 15).forEach(([d, a, b]) => issues.push(["Very similar gags (" + Math.round(d * 100) + "% alike)", a.id + ": " + a.t.replace(/\\n+/g, " ") + "\\n" + b.id + ": " + b.t.replace(/\\n+/g, " ")]));
  const head = "Checked " + all.length + " written gags (Core read " + new Date(g.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "). ";
  out.innerHTML = issues.length ? head + issues.length + " thing" + (issues.length === 1 ? "" : "s") + " to look at:" + issues.map(([t, d]) => '<div class="issue"><b>' + t + '</b>' + d.replace(/[<&]/g, (c) => c === "<" ? "&lt;" : "&amp;") + '</div>').join("") : head + "No problems found. ✓";
}
$("scan").addEventListener("click", scan);
$("scanRefresh").addEventListener("click", async () => { $("scanOut").textContent = "Syncing to Core… check again in about a minute."; await fetch("/api/gags-refresh", { method: "POST" }); toast("Syncing to Core"); });
</script>`);
}

// ---------- Update live listings ----------
// Make "Tool — Amend live listings (app)" (MAKE_TOOL_RANGE_HOOK) does two jobs:
//  {action:"state"}  reads Core (live gags, PRODUCT_RULES, COLOUR_PROFILES) + Printify colours and posts them to /api/amend-sync;
//  {action:"apply", ops} writes the given Core cells, waits 5 minutes, then starts the listing builder,
//  which works through every gag flagged with an AMENDMENT_REQUIRED… status, one gag at a time.
// The page is a 4-step flow: Where (listings) → What → Details → Check. Every pick maps to ONE gag status:
//   print → REPRINT (new print, then text+colours, then mockups, then a new video)
//   supplier / colours / text+mockups → COLOURS (text + colours, then mockups)
//   text only → AMEND;  mockups only → ARTWORK
// AMEND_ONLY (GAGS column N) limits a gag's update to the ticked garments; the builder clears it when done.

const AMEND_XL = "/v1.0/drives/b!ndnYRjl_sE21BKMMz_r6PMo1voTJfixLpQRKuPki-i9EoHVOO8R9TbWVCCuU0ua6/items/01R3POCZGZPJY6UCRSEJD3MBADE4GJ24YQ/workbook";
const AMEND_COLL = { IH: "INTROVERT HERE…", SH: "SHHH.", PC: "PER CONTRACT", OS: "OFF THE SHELF" };
const AMEND_GARMENTS = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
const AMEND_WHAT = ["supplier", "print", "mockups", "colours", "titles", "descriptions", "tags"];
const AMEND_RULE_COLS = { suffix: "TITLE_SUFFIX", intro: "COLLECTION_INTRO", features: "PRODUCT_FEATURES", audience: "AUDIENCE_TEXT", closing: "CLOSING_TEXT", bp: "PRINTIFY_BLUEPRINT_ID", provider: "PRINTIFY_PROVIDER_ID" };
const AMEND_TAG_COLS = ["PRODUCT_TAG_09", "PRODUCT_TAG_10", "PRODUCT_TAG_11", "PRODUCT_TAG_12", "PRODUCT_TAG_13"];
const amendCell = (table, col, row, value) => ({ url: `${AMEND_XL}/tables/${table}/columns/${col}/dataBodyRange/cell(row=${Number(row)},column=0)`, value: String(value) });

async function amendSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await request.json();
  data.at = Date.now();
  await env.PENDING.put("amend", JSON.stringify(data));
  return json({ ok: true });
}

async function amendHook(env, body) {
  const url = env.MAKE_TOOL_RANGE_HOOK;
  if (!url) return json({ error: "MAKE_TOOL_RANGE_HOOK is not set" }, 500);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept it (" + res.status + "). Nothing was changed." }, 502);
  return null;
}

// Re-read Core about every 10 minutes while any gag is still updating, and once more after the last one finishes.
async function amendWatch(env) {
  await env.PENDING.put("amend-tick", String(Date.now()));
  const S = await env.PENDING.get("amend", "json");
  if (!S) return;
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  const w = (await env.PENDING.get("amend-watch", "json")) || {};
  const now = Date.now();
  const busy = S.gags.some((g) => /^AMENDMENT_REQUIRED/.test(g.status));
  const justSaved = log[0] && now - log[0].at < 20 * 60000;
  if (!busy && !justSaved) return;
  if (w.last && now - w.last < 9 * 60000) return;
  await env.PENDING.put("amend-watch", JSON.stringify({ last: now }));
  await amendHook(env, { action: "state" });
}

async function amendRefresh(env) {
  return (await amendHook(env, { action: "state" })) || json({ ok: true });
}

async function amendApply(request, env) {
  try { return await amendApply2(request, env); } catch (e) { return json({ error: String(e.message || e) }, 400); }
}
async function amendApply2(request, env) {
  const d = await request.json();
  const S = await env.PENDING.get("amend", "json");
  if (!S) throw new Error("The page hasn't read Core yet. Tap Sync to Core and try again in a minute.");
  const what = new Set((Array.isArray(d.what) ? d.what : []).filter((w) => AMEND_WHAT.includes(w)));
  if (!what.size) throw new Error("Pick what to change.");
  // listings -> gags with garment lists
  const byGag = {};
  for (const l of Array.isArray(d.listings) ? d.listings : []) {
    const g = S.gags.find((x) => x.id === String(l.gag || ""));
    const t = String(l.garment || "");
    if (!g || !g.live.includes(t)) throw new Error("One of the picked listings isn't live any more. Sync to Core and try again.");
    (byGag[g.id] = byGag[g.id] || new Set()).add(t);
  }
  const gagIds = Object.keys(byGag);
  if (!gagIds.length) throw new Error("Pick at least one listing.");
  const combos = new Set();                                   // "IH|T-SHIRT" pairs covered by the pick
  gagIds.forEach((id) => byGag[id].forEach((t) => combos.add(id.slice(0, 2) + "|" + t)));
  const ops = [];
  // single-gag fields
  if (typeof d.stem === "string" || typeof d.text === "string") {
    if (gagIds.length !== 1) throw new Error("The title stem and gag text can only be changed on one gag at a time.");
    const g = S.gags.find((x) => x.id === gagIds[0]);
    const stem = typeof d.stem === "string" ? d.stem.replace(/\s+/g, " ").trim() : g.stem;
    const text = typeof d.text === "string" ? d.text.replace(/\r/g, "").trim() : g.text;
    if (stem !== g.stem) { if (!what.has("titles")) throw new Error("Tick Titles to change the title stem."); if (!stem) throw new Error("The title stem can't be empty."); ops.push(amendCell("GAGS_TABLE", "TITLE_STEM", g.row, stem)); g.stem = stem; }
    if (text !== g.text) { if (!what.has("print")) throw new Error("Changing the gag text changes the print, so tick Print template too."); if (!text) throw new Error("The gag text can't be empty."); ops.push(amendCell("GAGS_TABLE", "GAG_TEXT", g.row, text)); g.text = text; }
  }
  // range + garment text, tags, supplier
  for (const [rowStr, e] of Object.entries(d.rules || {})) {
    const r = S.rules.find((x) => x.row === Number(rowStr));
    const code = r && Object.keys(AMEND_COLL).find((k) => AMEND_COLL[k] === r.coll);
    if (!r || !combos.has(code + "|" + r.type)) throw new Error("A text change was for a range or garment you didn't pick.");
    const allow = { suffix: "titles", intro: "descriptions", features: "descriptions", audience: "descriptions", closing: "descriptions", bp: "supplier", provider: "supplier" };
    for (const [k, col] of Object.entries(AMEND_RULE_COLS)) {
      if (typeof e[k] !== "string" || !what.has(allow[k])) continue;
      const v = e[k].trim();
      if ((k === "bp" || k === "provider") && !/^\d+$/.test(v)) throw new Error("Blueprint and provider must be Printify ID numbers.");
      if (v !== String(r[k] ?? "")) { ops.push(amendCell("PRODUCT_RULES", col, r.row, v)); r[k] = v; }
    }
    if (Array.isArray(e.tags) && what.has("tags")) {
      const t = e.tags.map((s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase());
      if (t.length !== 5 || t.some((s) => !s || s.length > 20)) throw new Error("Each garment needs 5 product tags, 20 characters max.");
      t.forEach((s, i) => { if (s !== String(r.tags[i] ?? "")) ops.push(amendCell("PRODUCT_RULES", AMEND_TAG_COLS[i], r.row, s)); });
      r.tags = t;
    }
  }
  // colours per range
  if (what.has("colours")) {
    const avail = new Set(Object.values(S.colours || {}).flat());
    for (const [code, list] of Object.entries(d.colours || {})) {
      const coll = AMEND_COLL[code];
      if (!coll || ![...combos].some((c) => c.startsWith(code + "|"))) throw new Error("A colour change was for a range you didn't pick.");
      const names = [...new Set(S.rules.filter((r) => r.coll === coll).map((r) => r.profile))];
      if (names.length !== 1) throw new Error("This range's garments use different colour profiles; ask Claude to sort that first.");
      const prof = S.profiles.find((p) => p.name === names[0]);
      if (!prof) throw new Error("Colour profile " + names[0] + " isn't in COLOUR_PROFILES.");
      if (S.rules.some((r) => r.profile === prof.name && r.coll !== coll)) throw new Error("Another range shares this colour profile; ask Claude to split it first.");
      const want = (Array.isArray(list) ? list : []).map(String).filter((c) => avail.has(c));
      if (!want.length) throw new Error("Pick at least one colour for each range.");
      if (want.join(", ") !== prof.colours) { ops.push(amendCell("COLOUR_PROFILES_TABLE", "REAL_COLOURS", prof.row, want.join(", "))); prof.colours = want.join(", "); }
    }
  }
  const text = what.has("titles") || what.has("descriptions") || what.has("tags");
  const status = what.has("print") ? "AMENDMENT_REQUIRED_REPRINT"
    : what.has("supplier") || what.has("colours") || (text && what.has("mockups")) ? "AMENDMENT_REQUIRED_COLOURS"
    : text ? "AMENDMENT_REQUIRED" : "AMENDMENT_REQUIRED_ARTWORK";
  for (const id of gagIds) {
    const g = S.gags.find((x) => x.id === id);
    const pick = byGag[id];
    const only = g.live.every((t) => pick.has(t)) ? "" : AMEND_GARMENTS.filter((t) => pick.has(t)).join("|");
    if (only && !S.hasOnly) throw new Error("Core's GAGS table has no AMEND_ONLY column, so it can only update all garments of a gag.");
    if (S.hasOnly && (only || g.only)) { ops.push(amendCell("GAGS_TABLE", "AMEND_ONLY", g.row, only)); g.only = only; }
    ops.push(amendCell("GAGS_TABLE", "STATUS", g.row, status)); g.status = status;
  }
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "300", run: "yes" });
  if (err) return err;
  await env.PENDING.put("amend", JSON.stringify(S));
  const n = gagIds.reduce((a, id) => a + byGag[id].size, 0);
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  log.unshift({ at: Date.now(), what: [...what], listings: n, gags: gagIds });
  await env.PENDING.put("amend-log", JSON.stringify(log.slice(0, 20)));
  return json({ ok: true, gags: gagIds.length, listings: n });
}

async function amendPage(env) {
  const S = (await env.PENDING.get("amend", "json")) || null;
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  const data = JSON.stringify({ S, log }).replace(/</g, "\\u003c");
  return shell(`
<style>
.aw{max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:110px}
.steps{display:flex;gap:6px;flex-wrap:wrap}
.steps span{font-size:13px;padding:6px 12px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
.steps span.on{background:var(--accent);color:#141413;border-color:var(--accent);font-weight:600}
.steps span.done{color:var(--text)}
.q{font-size:18px;font-weight:600;margin:0 0 4px}
.hint{color:var(--muted);font-size:13px;margin:4px 0}
.seg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}
.seg button{font:600 15px Montserrat;padding:14px 8px;border-radius:12px;border:1px solid var(--line);background:var(--field);color:var(--text);cursor:pointer}
.seg button small{display:block;font-weight:400;font-size:12px;color:var(--muted);margin-top:3px}
.seg button.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.tick{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--field);cursor:pointer;min-width:0}
.tick input,.li input,.rt input{width:20px;height:20px;accent-color:var(--go);flex:none}
.tick .lbl,.li .lbl{flex:1;min-width:0}
.tick small,.li small{display:block;color:var(--muted);font-size:12px}
.g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:8px}
.col{display:flex;flex-direction:column;gap:8px}
.rt{overflow-x:auto}.rt table{border-collapse:collapse;width:100%;min-width:520px}
.rt th,.rt td{padding:10px 6px;border-bottom:1px solid var(--line);text-align:center;font-size:14px}
.rt th:first-child,.rt td:first-child{text-align:left}
.rt th button{background:none;border:0;color:var(--muted);font:600 12px Montserrat;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.crumbs{display:flex;gap:6px;flex-wrap:wrap;font-size:14px;color:var(--muted);margin:6px 0}
.crumbs button{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}
.list{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.li{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--line);background:var(--field)}
.li:last-child{border-bottom:0}
.drill{background:none;border:1px solid var(--line);color:var(--text);border-radius:10px;padding:7px 12px;font:600 13px Montserrat;cursor:pointer;white-space:nowrap}
.pill{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--accent);color:var(--accent);margin-left:6px;white-space:nowrap}
.inp,.f input,.f textarea,.f select{width:100%;box-sizing:border-box;padding:10px 12px;font:15px Montserrat;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text)}
.f{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);margin:6px 0}
.f textarea{min-height:72px;resize:vertical}
.copy{align-self:flex-start;background:none;border:0;color:var(--accent);font:13px Montserrat;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}
.sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.sw label{display:flex;align-items:center;gap:8px;font-size:14px;padding:6px 8px;border-radius:10px;border:1px solid var(--line);background:var(--field);color:var(--text)}
.sec{border-top:1px solid var(--line);padding-top:10px;margin-top:6px}
.sec h3{margin:0 0 4px;font-size:15px}
.sum{font-size:16px;line-height:1.5}.sum b{color:var(--accent)}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chips span{font-size:12px;padding:3px 9px;border-radius:99px;background:var(--field);border:1px solid var(--line)}
.okbox{border:1px solid var(--go);border-radius:12px;padding:14px;background:var(--ok-bg)}
.errbox{border:1px solid var(--warn);border-radius:12px;padding:12px;background:var(--warn-bg)}
.abar{position:fixed;left:0;right:0;bottom:0;z-index:5;background:rgba(18,18,17,.96);border-top:1px solid var(--line);padding:12px max(16px,env(safe-area-inset-right,0px)) calc(12px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
.abar .in{max-width:780px;margin:0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.abar .count{flex:1;min-width:140px;font-size:14px;color:var(--muted)}.abar .count b{color:var(--text);font-size:16px}
.abtn{padding:11px 16px;border-radius:12px;border:1px solid var(--line);background:var(--field);color:var(--text);font:600 15px Montserrat;cursor:pointer}
.abtn.go{background:var(--go);color:var(--go-text);border-color:var(--go)}
.abtn:disabled{opacity:.4;cursor:not-allowed}
.abtn.ghost{background:none}
@media (max-width:480px){.seg{grid-template-columns:1fr}}
@media (max-width:760px){.abar{bottom:calc(74px + env(safe-area-inset-bottom,0px));padding-bottom:12px}.aw{padding-bottom:200px}
  .abar .in{display:grid;grid-template-columns:auto auto 1fr;gap:8px}.abar .count{grid-column:1/-1;min-width:0}}
.abtn{min-height:52px;font:800 13px var(--display);letter-spacing:.08em;text-transform:uppercase;border-width:2px;border-radius:14px}
.abtn.go{border-color:var(--go)}
</style>
${brandHeader("Update listings", `<a class="btn" href="/">← Approvals</a><a class="btn" href="/tools">🛠 Tools</a><button class="btn" id="reread" type="button">${icon("sync")}Sync to Core</button>`)}
<div class="aw">
  <div class="steps" id="steps"></div>
  <div class="card" id="view"></div>
  <div class="card"><h3 style="margin:0 0 6px;font-size:16px">Recent updates</h3><div class="small" id="log"></div><p class="small" id="readAt" style="margin:8px 0 0"></p></div>
</div>
<div class="abar"><div class="in">
  <div class="count" id="count"></div>
  <button class="abtn ghost" id="reset" type="button">Start over</button>
  <button class="abtn" id="back" type="button">Back</button>
  <button class="abtn go" id="next" type="button">Next</button>
</div></div>
<script id="amend-data" type="application/json">${data}</script>
<script src="/amend.js"></script>`);
}

const AMEND_JS = String.raw`
var D = JSON.parse(document.getElementById("amend-data").textContent);
var S0 = D.S, LOG = D.log || [];
var RANGES = [["IH","Introvert Here","INTROVERT HERE…"],["SH","SHHH.","SHHH."],["PC","Per Contract","PER CONTRACT"],["OS","Off The Shelf","OFF THE SHELF"]];
var GARM = [["T-SHIRT","T-shirt","T-shirts"],["LONG-SLEEVE","Long sleeve","Long sleeves"],["SWEATSHIRT","Sweatshirt","Sweatshirts"],["HOODIE","Hoodie","Hoodies"]];
var WHAT = [
  ["supplier","Supplier","Record a new Printify provider or garment model (do the swap in Printify first with Replace), then refresh colours and mockups"],
  ["print","Print template","New print file from the gag text and the current Canva print template; also refreshes mockups and the video"],
  ["mockups","Mockup photos","Re-export the Canva mockup pages onto the listings"],
  ["colours","Colours","Add or take away colours"],
  ["titles","Titles","The title ending for a range and garment, or one gag's title stem"],
  ["descriptions","Descriptions","Intro, features, who it's for, closing text"],
  ["tags","Product tags","The 5 product tags for a range and garment"]];
var STAT = { AMENDMENT_REQUIRED:"Updating", AMENDMENT_REQUIRED_ARTWORK:"Updating mockups", AMENDMENT_REQUIRED_REPRINT:"Updating print", AMENDMENT_REQUIRED_COLOURS:"Updating" };
function gName(t) { for (var i = 0; i < GARM.length; i++) if (GARM[i][0] === t) return GARM[i][1]; return t; }
function rName(c) { for (var i = 0; i < RANGES.length; i++) if (RANGES[i][0] === c) return RANGES[i][1]; return c; }
function rColl(c) { for (var i = 0; i < RANGES.length; i++) if (RANGES[i][0] === c) return RANGES[i][2]; return c; }
function $(id) { return document.getElementById(id); }
function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
var A;  // all choices; Start over resets it
function fresh() { A = { step:0, scope:null, sel:{}, drill:[], q:"", what:{}, stem:null, text:null, rules:{}, colours:{}, cur:{}, done:null, err:"" }; }
fresh();
var ALL = [];
if (S0) S0.gags.forEach(function (g) { g.live.forEach(function (t) { ALL.push(g.id + "|" + t); }); });
function keys(f) { return ALL.filter(f); }
function selKeys() { return Object.keys(A.sel); }
function setMany(ks, on) { ks.forEach(function (k) { if (on) A.sel[k] = 1; else delete A.sel[k]; }); }
function st(ks) { var n = 0; ks.forEach(function (k) { if (A.sel[k]) n++; }); return !ks.length ? "na" : n === 0 ? "none" : n === ks.length ? "all" : "some"; }
function box(ks, tag) { var s = st(ks); return '<input type="checkbox" data-k="' + h(tag) + '"' + (s === "all" ? " checked" : "") + (s === "some" ? ' data-mixed="1"' : "") + (s === "na" ? " disabled" : "") + '>'; }
function gagOf(id) { for (var i = 0; i < S0.gags.length; i++) if (S0.gags[i].id === id) return S0.gags[i]; }
function busy(g) { return /^AMENDMENT_REQUIRED/.test(g.status) ? '<span class="pill">' + (STAT[g.status] || "Updating") + "</span>" : ""; }
function combos() { var m = {}; selKeys().forEach(function (k) { var p = k.split("|"); m[p[0].slice(0, 2) + "|" + p[1]] = 1; }); return Object.keys(m).sort(); }
function ruleFor(code, t) { var c = rColl(code); for (var i = 0; i < S0.rules.length; i++) if (S0.rules[i].coll === c && S0.rules[i].type === t) return S0.rules[i]; }
function single() { var g = {}; selKeys().forEach(function (k) { g[k.split("|")[0]] = 1; }); var ids = Object.keys(g); return ids.length === 1 ? gagOf(ids[0]) : null; }
function whatOn() { return WHAT.filter(function (w) { return A.what[w[0]]; }).map(function (w) { return w[0]; }); }

var STEPS = ["Where", "What", "Details", "Check"];
function render() {
  if (!S0) { $("view").innerHTML = "The page hasn't read Core yet. Tap <b>Sync to Core</b> and give it a minute."; $("count").textContent = ""; return; }
  $("steps").innerHTML = STEPS.map(function (s, i) { return '<span class="' + (i === A.step ? "on" : i < A.step ? "done" : "") + '">' + (i + 1) + ". " + s + "</span>"; }).join("");
  [where, what, details, check][A.step]();
  Array.prototype.forEach.call(document.querySelectorAll("input[data-mixed]"), function (i) { i.indeterminate = true; });
  var n = selKeys().length, w = whatOn();
  $("count").innerHTML = A.done ? "Saved" : "<b>" + n + "</b> listing" + (n === 1 ? "" : "s") + (w.length ? " · " + w.length + " change" + (w.length === 1 ? "" : "s") : "");
  $("back").hidden = A.step === 0 || !!A.done;
  $("next").hidden = A.step >= 3;
  $("next").disabled = (A.step === 0 && !n) || (A.step === 1 && !w.length);
  $("log").innerHTML = LOG.length ? LOG.map(function (l) { return h(new Date(l.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })) + " · " + h(Array.isArray(l.what) ? l.what.join(", ") : (l.what || "")) + " · " + (l.listings ? l.listings + " listing" + (l.listings === 1 ? "" : "s") : h(l.scope || "")); }).join("<br>") : "None yet.";
  $("readAt").textContent = "Core read " + new Date(S0.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
}

function where() {
  var b = '<p class="q">Which listings?</p><div class="seg">' + [["global","Everything","Every range"],["range","By range","Ranges and garments"],["listing","By listing","Drill down to a gag"]].map(function (x) { return '<button type="button" data-scope="' + x[0] + '" class="' + (A.scope === x[0] ? "on" : "") + '">' + x[1] + "<small>" + x[2] + "</small></button>"; }).join("") + "</div>";
  if (!A.scope) b += '<p class="hint">Pick one to start. Nothing is ticked until you tick it.</p>';
  if (A.scope === "global") b += '<p class="hint">Every live listing in every range, for the garments you tick.</p><div class="g2">' + GARM.map(function (g) { var ks = keys(function (k) { return k.split("|")[1] === g[0]; }); return '<label class="tick">' + box(ks, "garm:" + g[0]) + '<span class="lbl">All ' + g[2] + "<small>" + ks.length + " listings</small></span></label>"; }).join("") + "</div>";
  if (A.scope === "range") b += '<p class="hint">Tick a box for one range and garment, a range name for the whole range, or a column heading for that garment in every range.</p><div class="rt"><table><thead><tr><th></th>' + GARM.map(function (g) { return '<th><button type="button" data-colpick="' + g[0] + '">' + g[2] + "</button></th>"; }).join("") + "</tr></thead><tbody>" +
    RANGES.map(function (r) { var rk = keys(function (k) { return k.indexOf(r[0] + "-") === 0; });
      return '<tr><td><label style="display:flex;align-items:center;gap:8px">' + box(rk, "range:" + r[0]) + h(r[1]) + (rk.length ? "" : ' <span class="small">(none live)</span>') + "</label></td>" + GARM.map(function (g) { return "<td>" + box(rk.filter(function (k) { return k.split("|")[1] === g[0]; }), "rg:" + r[0] + ":" + g[0]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  if (A.scope === "listing") b += drill();
  $("view").innerHTML = b;
}
function drill() {
  var r = A.drill[0], gid = A.drill[1];
  var c = '<div class="crumbs"><button type="button" data-crumb="0">All ranges</button>' + (r ? " › " + (gid ? '<button type="button" data-crumb="1">' + h(rName(r)) + "</button>" : h(rName(r))) : "") + (gid ? " › " + h(gagOf(gid).stem) : "") + "</div>";
  if (!r) return c + '<div class="list">' + RANGES.map(function (x) { var ks = keys(function (k) { return k.indexOf(x[0] + "-") === 0; }); var n = S0.gags.filter(function (g) { return g.id.indexOf(x[0] + "-") === 0; }).length;
    return '<div class="li">' + box(ks, "range:" + x[0]) + '<span class="lbl">' + h(x[1]) + "<small>" + n + " gags · " + ks.length + " listings</small></span>" + (n ? '<button class="drill" type="button" data-drill="' + x[0] + '">Open ›</button>' : "") + "</div>"; }).join("") + "</div>";
  if (!gid) { var gs = S0.gags.filter(function (g) { return g.id.indexOf(r + "-") === 0 && (!A.q || (g.stem + " " + g.id).toLowerCase().indexOf(A.q.toLowerCase()) >= 0); });
    return c + '<input class="inp" id="q" placeholder="Search gags" value="' + h(A.q) + '"><div class="list" style="margin-top:8px">' + gs.map(function (g) { return '<div class="li">' + box(g.live.map(function (t) { return g.id + "|" + t; }), "gag:" + g.id) + '<span class="lbl">' + h(g.stem) + busy(g) + "<small>" + g.id + " · " + g.live.map(gName).join(", ") + '</small></span><button class="drill" type="button" data-drill="' + g.id + '">Edit ›</button></div>'; }).join("") + "</div>"; }
  var g = gagOf(gid);
  return c + '<p class="hint">Tick the listings to update. You can change the title stem and gag text in step 3.</p><div class="g2">' + g.live.map(function (t) { return '<label class="tick">' + box([g.id + "|" + t], "one:" + g.id + "|" + t) + '<span class="lbl">' + gName(t) + "<small>" + g.id + "-" + t + "</small></span></label>"; }).join("") + "</div>";
}

function what() {
  $("view").innerHTML = '<p class="q">What do you want to change?</p><p class="hint">Tick as many as you like. They run together, in the right order.</p><div class="col">' +
    WHAT.map(function (w) { return '<label class="tick"><input type="checkbox" data-what="' + w[0] + '"' + (A.what[w[0]] ? " checked" : "") + '><span class="lbl">' + w[1] + "<small>" + w[2] + "</small></span></label>"; }).join("") + "</div>";
}

function pickerFor(kind, list, label) {   // list of ids; A.cur[kind] = selected id
  if (!A.cur[kind] || list.indexOf(A.cur[kind]) < 0) A.cur[kind] = list[0];
  if (list.length < 2) return "";
  return '<label class="f">' + label + '<select data-cur="' + kind + '">' + list.map(function (id) { var p = id.split("|"); return '<option value="' + id + '"' + (id === A.cur[kind] ? " selected" : "") + ">" + h(rName(p[0]) + (p[1] ? " · " + gName(p[1]) : "")) + "</option>"; }).join("") + "</select></label>";
}
function rv(row, k, def) { var d = A.rules[row]; return d && d[k] != null ? d[k] : def; }
function details() {
  var one = single(), cb = combos(), out = '<p class="q">Details</p>', any = false;
  function sec(title, body) { any = true; out += '<div class="sec"><h3>' + title + "</h3>" + body + "</div>"; }
  if (A.what.print) sec("Print template", one ? '<label class="f">Gag text (goes on the print)<textarea data-one="text">' + h(A.text != null ? A.text : one.text) + "</textarea></label>" : '<p class="hint">Each listing\'s print is remade from its gag text and the current Canva print template. Nothing to fill in.</p>');
  if (A.what.mockups) sec("Mockup photos", '<p class="hint">Re-exported from the current Canva mockup templates. Nothing to fill in.</p>');
  if (A.what.titles && one) sec("Title stem", '<label class="f">' + h(one.id) + '<input data-one="stem" value="' + h(A.stem != null ? A.stem : one.stem) + '"></label><p class="hint">To change the title ending for the whole range instead, go back and pick By range.</p>');
  var ruleKinds = [];
  if (A.what.titles && !one) ruleKinds.push("titles");
  if (A.what.descriptions) ruleKinds.push("descriptions");
  if (A.what.tags) ruleKinds.push("tags");
  if (A.what.supplier) ruleKinds.push("supplier");
  if (ruleKinds.length) {
    var b = pickerFor("rule", cb, "Editing the text for") ;
    var p = A.cur.rule.split("|"), r = ruleFor(p[0], p[1]);
    if (one && (A.what.descriptions || A.what.tags)) b += '<p class="hint">Descriptions and product tags are shared by every ' + h(rName(p[0])) + " " + h(gName(p[1]).toLowerCase()) + ' listing, so this changes those too, but only the listings you picked are updated now.</p>';
    function fld(k, label, ta) { var v = rv(r.row, k, r[k]); return '<label class="f">' + label + (ta ? '<textarea data-rule="' + r.row + '" data-rk="' + k + '">' + h(v) + "</textarea>" : '<input data-rule="' + r.row + '" data-rk="' + k + '" value="' + h(v) + '">') + "</label>" + (cb.length > 1 ? '<button class="copy" type="button" data-copy="' + k + '">Use this for all ' + cb.length + " picked range/garment combinations</button>" : ""); }
    if (ruleKinds.indexOf("titles") >= 0) b += fld("suffix", "Title ending (after the stem)");
    if (ruleKinds.indexOf("descriptions") >= 0) b += fld("intro", "Range intro", 1) + fld("features", "Product features", 1) + fld("audience", "Who it's for", 1) + fld("closing", "Closing text (put legal or compliance wording here)", 1);
    if (ruleKinds.indexOf("tags") >= 0) { var tg = rv(r.row, "tags", r.tags); b += '<label class="f">Product tags (5, 20 characters max)</label><div class="g2">' + [0,1,2,3,4].map(function (i) { return '<input class="inp" maxlength="20" data-rule="' + r.row + '" data-tag="' + i + '" value="' + h(tg[i]) + '">'; }).join("") + "</div>" + (cb.length > 1 ? '<button class="copy" type="button" data-copy="tags">Use these tags for all ' + cb.length + " picked combinations</button>" : ""); }
    if (ruleKinds.indexOf("supplier") >= 0) b += '<p class="hint">Do the swap in Printify first (My products › Replace), then record the new IDs here. Now: ' + h(r.bpName || "blueprint") + " (blueprint " + h(r.bp) + ", provider " + h(r.provider) + ").</p>" + fld("bp", "Printify blueprint ID (garment model)") + fld("provider", "Printify provider ID");
    sec(ruleKinds.length === 1 && ruleKinds[0] === "supplier" ? "Supplier" : "Range text", b);
  }
  if (A.what.colours) {
    var rs = []; cb.forEach(function (c) { var x = c.split("|")[0]; if (rs.indexOf(x) < 0) rs.push(x); });
    var cb2 = pickerFor("col", rs, "Colours for");
    var code = A.cur.col, rules = S0.rules.filter(function (r) { return r.coll === rColl(code); });
    var prof = S0.profiles.filter(function (p) { return rules[0] && p.name === rules[0].profile; })[0];
    var have = A.colours[code] || String(prof ? prof.colours : "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var avail = {}; rules.forEach(function (r) { (S0.colours[r.bp] || []).forEach(function (c) { (avail[c] = avail[c] || []).push(gName(r.type)); }); });
    var list = Object.keys(avail).sort(function (a, b) { return (have.indexOf(b) >= 0) - (have.indexOf(a) >= 0) || a.localeCompare(b); });
    cb2 += '<p class="hint">Ticked colours are on every ' + h(rName(code)) + ' listing. Untick to remove, tick to add. Garments that don\'t offer a colour are skipped. Main colour: ' + h(rules[0] ? rules[0].primary : "") + ".</p><div class=\"sw\">" +
      list.map(function (c) { return '<label><input type="checkbox" data-colour="' + h(c) + '"' + (have.indexOf(c) >= 0 ? " checked" : "") + ">" + h(c) + (avail[c].length < rules.length ? ' <small style="color:var(--muted)">(' + h(avail[c].join(", ")) + ")</small>" : "") + "</label>"; }).join("") + "</div>";
    sec("Colours", cb2);
  }
  if (!any) out += '<p class="hint">Nothing to fill in. Tap Next.</p>';
  $("view").innerHTML = out;
}

function check() {
  var ks = selKeys(), gs = {}, rs = {}, ts = {};
  ks.forEach(function (k) { var p = k.split("|"); gs[p[0]] = 1; rs[rName(p[0].slice(0, 2))] = 1; ts[gName(p[1])] = 1; });
  var w = WHAT.filter(function (x) { return A.what[x[0]]; }).map(function (x) { return x[1].toLowerCase(); });
  var n = ks.length, ng = Object.keys(gs).length;
  var per = A.what.print ? 2.5 : (A.what.mockups || A.what.colours || A.what.supplier) ? 1.5 : 0.5;
  var mins = Math.max(5, Math.round(n * per) + 5);
  if (A.done) { $("view").innerHTML = '<div class="okbox"><p class="q">Saved to Core</p><p class="hint" style="color:var(--text)">Etsy starts updating in about 5 minutes: ' + A.done.listings + " listing" + (A.done.listings === 1 ? "" : "s") + " across " + A.done.gags + " gag" + (A.done.gags === 1 ? "" : "s") + ". Each gag shows as updating in the By listing view until it's finished. You'll get an alert if anything fails.</p></div>"; return; }
  $("view").innerHTML = '<p class="q">Check and confirm</p><p class="sum">Change <b>' + h(w.join(", ")) + "</b> on <b>" + n + " listing" + (n === 1 ? "" : "s") + "</b> (" + ng + " gag" + (ng === 1 ? "" : "s") + ") in " + h(Object.keys(rs).join(", ")) + '.</p><div class="chips">' + Object.keys(ts).map(function (t) { return "<span>" + h(t) + "</span>"; }).join("") + "</div>" +
    '<p class="hint">Saved to Core straight away. Etsy starts updating 5 minutes later and takes roughly ' + (mins >= 90 ? Math.round(mins / 6) / 10 + " hours" : mins + " minutes") + ". Listings stay live throughout." + (A.what.print ? " New videos come to the Approvals page for you to approve; approving re-posts them to social." : "") + "</p>" +
    (A.err ? '<div class="errbox">' + h(A.err) + "</div>" : "") +
    '<div class="okbox" style="margin-top:10px"><b>Ready?</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="abtn go" type="button" id="go">Confirm and start</button></div></div>';
  $("go").onclick = submit;
}
function submit() {
  var body = { listings: selKeys().map(function (k) { var p = k.split("|"); return { gag: p[0], garment: p[1] }; }), what: whatOn(), rules: A.rules, colours: {} };
  var one = single();
  if (one && A.stem != null) body.stem = A.stem;
  if (one && A.text != null) body.text = A.text;
  if (A.what.colours) { var rs = {}; combos().forEach(function (c) { rs[c.split("|")[0]] = 1; }); Object.keys(rs).forEach(function (code) { if (A.colours[code]) body.colours[code] = A.colours[code]; else { var rules = S0.rules.filter(function (r) { return r.coll === rColl(code); }); var p = S0.profiles.filter(function (x) { return rules[0] && x.name === rules[0].profile; })[0]; body.colours[code] = String(p ? p.colours : "").split(",").map(function (s) { return s.trim(); }).filter(Boolean); } }); }
  $("go").disabled = true; $("go").textContent = "Saving…";
  fetch("/api/amend-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); }).then(function (x) {
    if (x[0]) { A.done = x[1]; A.err = ""; LOG.unshift({ at: Date.now(), what: whatOn(), listings: x[1].listings }); } else A.err = x[1].error || "Something went wrong.";
    render();
  }).catch(function () { A.err = "Couldn't reach the app. Check your connection and try again."; render(); });
}

document.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.scope) { A.scope = t.dataset.scope; A.drill = []; render(); }
  if (t.dataset.colpick) { var ks = keys(function (k) { return k.split("|")[1] === t.dataset.colpick; }); setMany(ks, st(ks) !== "all"); render(); }
  if (t.dataset.drill) { A.drill.push(t.dataset.drill); A.q = ""; render(); }
  if (t.dataset.crumb) { A.drill = A.drill.slice(0, Number(t.dataset.crumb)); render(); }
  if (t.dataset.copy) {
    var p = A.cur.rule.split("|"), src = ruleFor(p[0], p[1]), k = t.dataset.copy;
    var v = rv(src.row, k, src[k]);
    combos().forEach(function (c) { var q = c.split("|"), r = ruleFor(q[0], q[1]); if (r) { A.rules[r.row] = A.rules[r.row] || {}; A.rules[r.row][k] = Array.isArray(v) ? v.slice() : v; } });
    t.textContent = "Copied to all " + combos().length + " ✓";
  }
});
document.addEventListener("change", function (e) {
  var el = e.target;
  if (el.dataset.k) {
    var p = el.dataset.k.split(":"), kind = p[0], a = p[1], b = p[2], ks;
    if (kind === "garm") ks = keys(function (k) { return k.split("|")[1] === a; });
    else if (kind === "range") ks = keys(function (k) { return k.indexOf(a + "-") === 0; });
    else if (kind === "rg") ks = keys(function (k) { return k.indexOf(a + "-") === 0 && k.split("|")[1] === b; });
    else if (kind === "gag") ks = keys(function (k) { return k.indexOf(a + "|") === 0; });
    else ks = [el.dataset.k.slice(4)];
    setMany(ks, el.checked); render();
  }
  if (el.dataset.what) { if (el.checked) A.what[el.dataset.what] = 1; else delete A.what[el.dataset.what]; render(); }
  if (el.dataset.cur) { A.cur[el.dataset.cur] = el.value; render(); }
  if (el.dataset.colour) { A.colours[A.cur.col] = Array.prototype.map.call(document.querySelectorAll("[data-colour]:checked"), function (i) { return i.dataset.colour; }); }
});
document.addEventListener("input", function (e) {
  var el = e.target;
  if (el.id === "q") { A.q = el.value; var pos = el.selectionStart; render(); var q = $("q"); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (el.dataset.one) A[el.dataset.one] = el.value;
  if (el.dataset.rule) { var row = el.dataset.rule; A.rules[row] = A.rules[row] || {};
    if (el.dataset.rk) A.rules[row][el.dataset.rk] = el.value;
    if (el.dataset.tag != null) { var r = S0.rules.filter(function (x) { return String(x.row) === row; })[0]; var tg = (A.rules[row].tags || r.tags).slice(); tg[Number(el.dataset.tag)] = el.value; A.rules[row].tags = tg; } }
});
$("next").onclick = function () { A.step++; A.err = ""; render(); window.scrollTo(0, 0); };
$("back").onclick = function () { A.step--; A.err = ""; render(); window.scrollTo(0, 0); };
$("reset").onclick = function () { fresh(); render(); window.scrollTo(0, 0); };
// While anything is updating, check every minute for a fresh read of Core and show it.
setInterval(function () {
  if (!S0 || !S0.gags.some(function (g) { return /^AMENDMENT_REQUIRED/.test(g.status); }) && !(LOG[0] && Date.now() - LOG[0].at < 20 * 60000)) return;
  fetch("/api/amend-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || d.at === S0.at) return;
    S0 = d; ALL = []; S0.gags.forEach(function (g) { g.live.forEach(function (t) { ALL.push(g.id + "|" + t); }); });
    Object.keys(A.sel).forEach(function (k) { if (ALL.indexOf(k) < 0) delete A.sel[k]; });
    var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && A.step === 2;
    if (!typing) render();
  });
}, 60000);
$("reread").onclick = function () {
  var b = $("reread"); b.disabled = true; b.textContent = "Syncing…";
  var at = S0 ? S0.at : 0;
  fetch("/api/amend-refresh", { method: "POST" }).then(function () {
    (function poll() { fetch("/api/amend-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.at !== at) location.reload(); else setTimeout(poll, 5000); }); })();
  });
};
render();
`;

// ---------- Tags ----------
// Make "Approvals App: Gags Sync" (action "tags-…") reads Core's GAG_TAGS and posts a short summary to /api/tags-sync.
// Saving from the page sends {action:"tags-save", …} to the same webhook; Make writes GAG_TAGS, waits for Excel, then re-syncs.
// Nothing here freezes tags or touches Etsy: freezing happens at the 08:00 build, once the builder is switched over.

async function tagsSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await request.json();
  data.receivedAt = Date.now();
  await env.PENDING.put("tags", JSON.stringify(data));
  return json({ ok: true });
}

async function tagsHook(env, body) {
  if (!env.MAKE_GAGSYNC_HOOK) return json({ error: "MAKE_GAGSYNC_HOOK is not set" }, 500);
  const res = await fetch(env.MAKE_GAGSYNC_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept that (" + res.status + "). Nothing was changed." }, 502);
  return json({ ok: true });
}

async function tagsSave(request, env) {
  const d = await request.json();
  const gagId = str(d.gagId);
  if (!/^(IH|SH|PC|OS)-\d{5}$/.test(gagId)) return json({ error: "Unknown gag" }, 400);
  if (d.regenerate) return tagsHook(env, { action: "tags-save", gagId, regenerate: "true" });
  const tags = String(d.override || "").split("|").map((s) => s.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
  if (tags.length && tags.length !== 5) return json({ error: "Your own tags need exactly 5 (you have " + tags.length + ")." }, 400);
  return tagsHook(env, { action: "tags-save", gagId, stemTag: str(d.stemTag).slice(0, 60), approved: d.approved ? "true" : "false", override: tags.join("|"), regenerate: "false" });
}

async function tagsPage(env) {
  const nav = `<a class="btn" href="/">← Approvals</a><a class="btn" href="/gags">✍ Gags</a><button class="btn" id="refresh" type="button">${icon("sync")}Sync to Core</button>`;
  return shell(`
${brandHeader("Tags", nav)}
<style>
.tcounts{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.tcount{padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.06);cursor:pointer;border:2px solid transparent}
.tcount.on{border-color:currentColor}.tcount b{font-size:22px;display:block}
.tcard{margin:0 0 14px}.tcard h3{margin:0 0 4px;font-size:16px}
.gagtext{white-space:pre-wrap;opacity:.85;margin:6px 0 10px;font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.chip{padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.1);font-size:13px}
.chip.stem{background:#3a3220}.chip.seas{background:#1f3326}.chip.bad{background:#5a1f1f}
.tstat{padding:8px 10px;border-radius:8px;margin:8px 0;font-size:14px}
.tstat.ok{background:#1f3a26}.tstat.wait{background:#3a3320}.tstat.bad{background:#4a1f1f}
.trow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.tcard input[type=text]{width:100%;box-sizing:border-box;padding:8px;font-size:15px}
.hint{font-size:13px;opacity:.8;margin:4px 0}.hint.bad{color:#ff8a8a;opacity:1}
.edit{display:none;margin-top:10px}.edit.open{display:block}
details summary{cursor:pointer;font-size:13px;opacity:.8}
</style>
<div class="small" id="synced">Loading…</div>
<div class="small" id="msg"></div>
<div class="tcounts" id="counts"></div>
<div class="trow" style="margin-bottom:12px"><button class="btn" id="approveAll" type="button">Approve all ready (0)</button></div>
<div id="list"></div>
<p class="small" style="margin-top:28px">Shows gags due in the next 60 days. Approving doesn't send anything to Etsy: the tags are locked in when the garment is built. Listings already live on Etsy are never changed from here.</p>
<script>
const $ = (id) => document.getElementById(id);
const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MAX = 20, OK = /^[a-z0-9][a-z0-9 '\\-]*$/;
let D = null, filter = 'need', waiting = 0;
const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
function kind(it) {
  const s = String(it.status || '');
  if (s.startsWith('READY') || s.startsWith('APPROVED')) return 'ready';
  if (s.includes('awaiting approval')) return 'need';
  return 'problem';
}
function plain(it) {
  const s = String(it.status || '');
  if (s.startsWith('READY')) return 'Locked in. Nothing to do.';
  if (s.startsWith('APPROVED')) return 'Approved. Tags lock in when it is built.';
  if (s.includes('awaiting approval')) return 'Looks fine. Check the tags and press Approve.';
  if (s.startsWith('HOLD – stem')) return 'The title stem tag is a problem: ' + (it.stemProblem || s.slice(13)) + '. Type a shorter one below (20 characters max).';
  if (s.startsWith('HOLD – your tags')) return 'Your own tags: ' + s.slice(19) + '.';
  if (s.includes('gag-level')) return 'Not enough unused tag phrases for this type. Use "Edit tags" to type 5 of your own.';
  if (s.includes('seasonal')) return 'Not enough seasonal or gift tags. Tell Claude - this needs a pool fix.';
  if (s.includes('product tags')) return 'A product tag breaks Etsy rules. Tell Claude.';
  if (s.includes('frozen set incomplete')) return 'Locked set is incomplete. Press Regenerate.';
  return s;
}
function checkTag(t) {
  if (!t) return 'empty tag';
  if (t.length > MAX) return '"' + t + '" is ' + t.length + ' characters (max ' + MAX + ')';
  if (!OK.test(t)) return '"' + t + '" has a character Etsy won\\'t take';
  return '';
}
function card(it) {
  const k = kind(it), cls = k === 'ready' ? 'ok' : k === 'need' ? 'wait' : 'bad';
  const prod = (D.prod[it.coll + '|' + it.garments[0]] || []);
  const ov = it.override ? String(it.override).split('|') : null;
  const band = it.band && it.band !== 'OK' && it.band !== '' ? '<div class="hint">Overlap with another gag: ' + E(it.overlap) + ' shared tags (' + E(it.band) + '). Just a heads-up, it won\\'t stop anything.' + (it.overlapDetail ? ' ' + E(it.overlapDetail) : '') + '</div>' : '';
  const locked = it.frozen;
  const pool = (D.pool[it.type] || []).map(p => p.t);
  return '<div class="card tcard" data-id="' + E(it.id) + '">' +
    '<h3>' + E(it.id) + ' · ' + E(it.type) + '</h3><div class="meta">Next due ' + E(fmt(it.due)) + ' (' + E(it.garments[0].toLowerCase()) + ')' + (it.live ? ' · some garments already live' : '') + '</div>' +
    '<div class="gagtext">' + E(it.text) + '</div>' +
    '<div class="tstat ' + cls + '">' + E(plain(it)) + '</div>' +
    '<div class="chips">' + (it.stem ? '<span class="chip stem" title="Title stem tag">' + E(it.stem) + '</span>' : '<span class="chip bad">no stem tag</span>') +
      it.gag5.map(t => '<span class="chip" title="Gag tag">' + E(t) + '</span>').join('') +
      it.seas2.map(t => '<span class="chip seas" title="Seasonal / gift tag">' + E(t) + '</span>').join('') + '</div>' +
    '<details><summary>+ ' + prod.length + ' product tags (same for every ' + E(it.garments[0].toLowerCase()) + ')</summary><div class="chips">' + prod.map(t => '<span class="chip">' + E(t) + '</span>').join('') + '</div></details>' +
    band +
    (locked ? '<div class="trow">' + (it.live ? '' : '<button class="btn" data-act="regen" type="button">Regenerate</button>') + '</div>' :
    '<div style="margin-top:10px"><label class="hint">Title stem tag (shown as tag 13)</label>' +
      '<input type="text" class="stemIn" maxlength="40" value="' + E(it.stemTag || it.stem || '') + '" placeholder="' + E(it.stem || '') + '"><div class="hint stemHint"></div></div>' +
    '<div class="edit' + (ov ? ' open' : '') + '"><label class="hint">Your own 5 gag tags, one per box (leave all empty to use the suggestions)</label>' +
      [0,1,2,3,4].map(i => '<input type="text" class="ovIn" list="pool-' + E(it.id) + '" maxlength="30" value="' + E(ov ? ov[i] || '' : '') + '" placeholder="' + E(it.gag5[i] || '') + '" style="margin:3px 0">').join('') +
      '<datalist id="pool-' + E(it.id) + '">' + pool.map(t => '<option value="' + E(t) + '">').join('') + '</datalist><div class="hint ovHint"></div></div>' +
    '<div class="trow"><button class="btn-main" data-act="approve" type="button"' + (it.approved ? '>Save changes' : '>Approve') + '</button>' +
      '<button class="btn" data-act="edit" type="button">' + (ov ? 'Hide my tags' : 'Edit tags') + '</button>' +
      (it.approved ? '<button class="btn" data-act="unapprove" type="button">Un-approve</button>' : '') + '</div>') +
    '</div>';
}
function validate(c) {
  let bad = '';
  const s = c.querySelector('.stemIn'); if (s) { const v = s.value.trim().toLowerCase().replace(/\\s+/g, ' '); const e = v ? checkTag(v) : ''; c.querySelector('.stemHint').textContent = e || (v ? v.length + ' / ' + MAX + ' characters' : 'Leave empty to use the suggestion'); c.querySelector('.stemHint').className = 'hint stemHint' + (e ? ' bad' : ''); bad = bad || e; }
  const ins = [...c.querySelectorAll('.ovIn')], vals = ins.map(i => i.value.trim().toLowerCase().replace(/\\s+/g, ' ')).filter(Boolean);
  let e = '';
  if (vals.length && c.querySelector('.edit').classList.contains('open')) {
    if (vals.length !== 5) e = 'Fill in all 5 (you have ' + vals.length + '), or empty them all';
    else e = vals.map(checkTag).find(Boolean) || (new Set(vals).size < 5 ? 'A tag is repeated' : '');
  }
  const h = c.querySelector('.ovHint'); if (h) { h.textContent = e; h.className = 'hint ovHint' + (e ? ' bad' : ''); }
  bad = bad || e;
  const b = c.querySelector('[data-act=approve]'); if (b) b.disabled = !!bad;
  return !bad;
}
function render() {
  if (!D) { $('synced').textContent = 'Not read from Core yet. Tap Sync to Core (takes about a minute).'; return; }
  $('synced').textContent = 'Core read ' + new Date(D.at).toLocaleString('en-GB', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  const n = {need:0, ready:0, problem:0}; D.items.forEach(it => n[kind(it)]++);
  $('counts').innerHTML = [['need','Needs you'],['problem','Problem'],['ready','Ready'],['all','All']].map(([k, l]) => '<div class="tcount' + (filter === k ? ' on' : '') + '" data-f="' + k + '"><b>' + (k === 'all' ? D.items.length : n[k]) + '</b>' + l + '</div>').join('');
  $('approveAll').textContent = 'Approve all ready (' + n.need + ')'; $('approveAll').disabled = !n.need;
  const show = D.items.filter(it => filter === 'all' || kind(it) === filter);
  $('list').innerHTML = show.length ? show.map(card).join('') : '<div class="card empty">Nothing here.</div>';
  document.querySelectorAll('.tcard').forEach(validate);
}
async function load() { const r = await fetch('/api/tags-data'); D = r.ok ? await r.json() : null; render(); return D; }
async function waitForSync(since, note) {
  $('msg').textContent = note + ' Writing to Core and re-reading - about a minute…';
  waiting++;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const r = await fetch('/api/tags-data'); const d = r.ok ? await r.json() : null;
    if (d && d.receivedAt > since) { waiting--; D = d; render(); $('msg').textContent = d.msg ? '✓ ' + d.msg : '✓ Up to date'; return; }
  }
  waiting--; $('msg').textContent = 'Core is taking a while. Tap Sync to Core in a minute.';
}
async function send(body, note) {
  const since = D ? D.receivedAt || 0 : 0;
  const r = await fetch('/api/tags-save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const o = await r.json().catch(() => ({}));
  if (!r.ok) { alert(o.error || 'Failed'); return; }
  waitForSync(since, note);
}
$('counts').addEventListener('click', e => { const t = e.target.closest('.tcount'); if (t) { filter = t.dataset.f; render(); } });
$('list').addEventListener('input', e => { const c = e.target.closest('.tcard'); if (c) validate(c); });
$('list').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const c = b.closest('.tcard'), id = c.dataset.id, it = D.items.find(x => x.id === id), act = b.dataset.act;
  if (act === 'edit') { const ed = c.querySelector('.edit'); ed.classList.toggle('open'); b.textContent = ed.classList.contains('open') ? 'Hide my tags' : 'Edit tags'; validate(c); return; }
  if (act === 'regen') { if (confirm('Throw away the locked tags for ' + id + ' and get fresh suggestions?')) { b.disabled = true; send({gagId:id, regenerate:true}, 'Regenerating ' + id + '.'); } return; }
  if (!validate(c)) return;
  const stem = c.querySelector('.stemIn').value.trim().toLowerCase().replace(/\\s+/g, ' ');
  const open = c.querySelector('.edit').classList.contains('open');
  const ov = open ? [...c.querySelectorAll('.ovIn')].map(i => i.value.trim().toLowerCase().replace(/\\s+/g, ' ')).filter(Boolean).join('|') : '';
  b.disabled = true; b.textContent = 'Saving…';
  send({gagId:id, stemTag: stem === it.stem && !it.stemTag ? '' : stem, override: ov, approved: act !== 'unapprove'}, (act === 'unapprove' ? 'Un-approving ' : 'Saving ') + id + '.');
});
$('approveAll').addEventListener('click', async () => {
  const ready = D.items.filter(it => kind(it) === 'need');
  if (!ready.length || !confirm('Approve ' + ready.length + ' gag(s) with their suggested tags?')) return;
  $('approveAll').disabled = true;
  const since = D.receivedAt || 0;
  for (const it of ready) {
    await fetch('/api/tags-save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({gagId: it.id, stemTag: it.stemTag || '', override: it.override || '', approved: true})});
    $('msg').textContent = 'Sent ' + it.id + '…';
    await new Promise(r => setTimeout(r, 1500));
  }
  waitForSync(since, 'Approved ' + ready.length + '.');
});
$('refresh').addEventListener('click', async () => {
  const since = D ? D.receivedAt || 0 : 0;
  const r = await fetch('/api/tags-refresh', {method:'POST'}); if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Refresh failed'); return; }
  waitForSync(since, '');
});
load().then(d => { if (!d || Date.now() - (d.receivedAt || 0) > 12 * 3600e3) $('refresh').click(); });
</script>`);
}


// ---------- Phrase planner visits ----------
// The free Phrase Field Planner (tag-checker.mosspit.workers.dev) counts page loads into KV "planner-stats".
function plannerStatsHtml(st, tile) {
  const days = st && st.days ? st.days : {};
  const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const sum = (from) => { const out = { v: 0, phone: 0, ref: {}, c: {} };
    for (const [d, x] of Object.entries(days)) { if (d < from) continue; out.v += x.v; out.phone += x.phone;
      for (const [k, n] of Object.entries(x.ref || {})) out.ref[k] = (out.ref[k] || 0) + n;
      for (const [k, n] of Object.entries(x.c || {})) out.c[k] = (out.c[k] || 0) + n; }
    return out; };
  const today = sum(iso(0)), week = sum(iso(6)), month = sum(iso(29));
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${esc(k === "direct" ? "typed in / app / unknown" : k)}: ${v}`).join("<br>") || "none yet";
  const pct = month.v ? Math.round((100 * month.phone) / month.v) + "% on phones" : "";
  return `<h2>Tag checker (free tool)</h2>
<div class="small"><a href="https://tag-checker.mosspit.workers.dev" target="_blank" rel="noopener" style="color:inherit">tag-checker.mosspit.workers.dev</a>. Page visits, counted anonymously (no cookies). Bots are left out.</div>
<div class="tiles">
${tile("Today", today.v)}
${tile("Last 7 days", week.v)}
${tile("Last 30 days", month.v, pct)}
</div>
<div class="card" style="margin-top:10px"><b>Where visitors came from (30 days)</b><div class="small" style="margin-top:6px">${top(month.ref, 8)}</div>
<b style="display:block;margin-top:10px">Countries (30 days)</b><div class="small" style="margin-top:6px">${top(month.c, 6)}</div></div>`;
}


// ---------- Shop orders (introverthere.com) ----------
// The shop worker ("introvert-here-shop") records each paid checkout in KV "shop:orders" and places a Printify order
// that waits on hold. This page lists them, lets Barry send one to production, and holds the shop's two keys
// (Stripe secret key, Printify token) in KV namespace SECRETS. Keys are write-only from here: only the last 4
// characters are ever shown.

async function shopKeys(request, env) {
  if (!env.SECRETS) return json({ error: "Key store not connected" }, 500);
  const d = await request.json().catch(() => ({}));
  const saved = [];
  const sk = str(d.stripe_secret_key);
  if (sk) {
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{20,}$/.test(sk)) return json({ error: "That doesn't look like a Stripe secret key. It should start sk_test_, sk_live_, rk_test_ or rk_live_." }, 400);
    await env.SECRETS.put("stripe_secret_key", sk); saved.push("Stripe");
  }
  const pt = str(d.printify_token);
  if (pt) {
    if (pt.length < 40 || /\s/.test(pt)) return json({ error: "That doesn't look like a Printify token (it's a long code with no spaces)." }, 400);
    await env.SECRETS.put("printify_token", pt); saved.push("Printify");
  }
  if (!saved.length) return json({ error: "Nothing to save." }, 400);
  return json({ ok: true, saved });
}

async function shopOrderSend(request, env) {
  const d = await request.json().catch(() => ({}));
  const session = str(d.session);
  const rec = await env.PENDING.get("shop:order:" + session, "json");
  if (!rec || !rec.printifyOrder) return json({ error: "No Printify order for that sale." }, 400);
  const token = env.SECRETS && (await env.SECRETS.get("printify_token"));
  if (!token) return json({ error: "Printify token not saved yet." }, 400);
  const res = await fetch(`https://api.printify.com/v1/shops/27154106/orders/${rec.printifyOrder}/send_to_production.json`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "User-Agent": "IntrovertHereShop/1.0" } });
  if (!res.ok) return json({ error: "Printify said no (" + res.status + "): " + (await res.text()).slice(0, 200) }, 502);
  rec.status = "sent-to-production"; rec.sentAt = Date.now();
  await env.PENDING.put("shop:order:" + session, JSON.stringify(rec));
  const list = (await env.PENDING.get("shop:orders", "json")) || [];
  const i = list.findIndex((x) => x.session === session); if (i >= 0) list[i] = rec;
  await env.PENDING.put("shop:orders", JSON.stringify(list));
  return json({ ok: true });
}

async function ordersPage(env) {
  const orders = (await env.PENDING.get("shop:orders", "json")) || [];
  const last4 = async (k) => { const v = env.SECRETS && (await env.SECRETS.get(k)); return v ? "saved ✓ (…" + esc(v.slice(-4)) + ", " + (/_live_/.test(v) ? "LIVE" : /_test_/.test(v) ? "test" : "") + ")" : "not saved yet"; };
  const stripeState = await last4("stripe_secret_key");
  const pState = env.SECRETS && (await env.SECRETS.get("printify_token")) ? "saved ✓" : "not saved yet";
  const gbp = (p) => (p == null ? "" : "£" + (p / 100).toFixed(2));
  const label = { "on-hold": ["wait", "Waiting for you: send to Printify"], "sent-to-production": ["ok", "Sent to Printify for printing"], "test-not-sent": ["ok", "Test payment (not sent to Printify)"], failed: ["bad", "NOT placed: needs you"], processing: ["wait", "Processing…"] };
  const rows = orders.map((o) => {
    const [cls, txt] = label[o.status] || ["wait", o.status];
    return `<div class="card"><div class="meta">${esc(when(o.at))}${o.livemode ? "" : " · TEST"}</div>
<div class="code" style="font-size:16px">${esc(o.name || "")} · ${gbp(o.total)}</div>
<div class="small">${(o.items || []).map((i) => `${i.quantity} × ${esc(i.name)}`).join("<br>")}</div>
<div class="small">${esc(o.address || "")}${o.email ? " · " + esc(o.email) : ""}</div>
<div class="status ${cls}">${esc(txt)}${o.error ? "<br>" + esc(o.error) : ""}</div>
${o.status === "on-hold" ? `<button class="btn-main" data-send="${esc(o.session)}" type="button">Send to Printify</button>` : ""}
${o.printifyOrder ? `<div class="small"><a href="https://printify.com/app/order/${esc(o.printifyOrder)}" target="_blank" rel="noopener" style="color:inherit">Open in Printify</a></div>` : ""}</div>`;
  }).join("");
  return shell(`
${brandHeader("Shop orders", `<a class="btn" href="/">← Approvals</a><a class="btn" href="/stats">📈 Stats</a>`)}
<p class="small">Orders from your own shop (introverthere.com). Each paid order is placed with Printify on hold; press Send to Printify to have it printed. Test payments are never sent.</p>
${rows ? `<div class="grid">${rows}</div>` : `<div class="card empty">No shop orders yet.</div>`}
<h2>Shop keys</h2>
<div class="card" style="max-width:560px">
<p class="small">These let the shop take payments and place Printify orders. Paste a key and press Save. You can save one at a time. Each box empties after saving; the key is stored privately and this page only ever shows its last 4 characters.</p>
<label><b>Stripe secret key</b> <span class="small">${stripeState}</span></label>
<textarea id="sk" rows="2" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" style="width:100%;font-family:monospace;font-size:13px" placeholder="sk_test_… (or sk_live_… when going live)"></textarea>
<label style="margin-top:12px;display:block"><b>Printify API token</b> <span class="small">${pState}</span></label>
<textarea id="pt" rows="4" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" style="width:100%;font-family:monospace;font-size:13px" placeholder="Printify token (a long code)"></textarea>
<button id="savekeys" class="btn-main" type="button">Save keys</button>
<p id="keymsg" class="small"></p></div>
<script>
document.getElementById('savekeys').addEventListener('click', async function(){
  var m=document.getElementById('keymsg'); m.textContent='Saving…';
  var r=await fetch('/api/shop-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stripe_secret_key:document.getElementById('sk').value.replace(/\\s+/g,''),printify_token:document.getElementById('pt').value.replace(/\\s+/g,'')})});
  document.getElementById('sk').value='';document.getElementById('pt').value='';
  var o=await r.json().catch(function(){return{}}); if(r.ok){m.textContent='Saved: '+o.saved.join(' and ')+'.'; setTimeout(function(){location.reload()},900)} else m.textContent=o.error||'Could not save.';
});
document.addEventListener('click', async function(e){ var s=e.target.dataset&&e.target.dataset.send; if(!s) return;
  if(!confirm('Send this order to Printify for printing? Printify will charge you for it.')) return;
  e.target.disabled=true; e.target.textContent='Sending…';
  var r=await fetch('/api/shop-order-send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})});
  var o=await r.json().catch(function(){return{}}); if(r.ok) location.reload(); else { alert(o.error||'Failed'); e.target.disabled=false; e.target.textContent='Send to Printify'; }
});
</script>`);
}
