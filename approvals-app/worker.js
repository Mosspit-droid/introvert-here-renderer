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
        return authed ? await page(env) : loginPage(url.searchParams.has("wrong"));
      }
      if (pathname === "/orders" && method === "GET") {
        return authed ? await ordersPage(env) : redirect("/");
      }
      if (pathname === "/links" && method === "GET") {
        return authed ? await linksPage(env) : loginPage(false);
      }
      if (pathname === "/amend" && method === "GET") {
        return authed ? await amendPage(env) : redirect("/");
      }
      if (pathname === "/tools" && method === "GET") {
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

const STYLE = `
:root{--text:#efede8;--muted:#b3afa6;--line:rgba(255,255,255,.12);--card:rgba(20,20,19,.80);--field:rgba(0,0,0,.35);
  --accent:#d8d3c8;--go:#5aa983;--go-text:#0d1a13;--warn:#e7897b;--warn-bg:rgba(150,50,40,.28);--ok:#8fd0ab;--ok-bg:rgba(60,140,95,.22);
  --bgimg:url(/assets/bg-ih.jpg)}
body[data-coll=SH]{--accent:#9fd4b1;--bgimg:url(/assets/bg-sh.jpg)}
body[data-coll=PC]{--accent:#e0574a;--bgimg:url(/assets/bg-pc.jpg)}
body[data-coll=OS]{--accent:#d4a94a;--bgimg:url(/assets/bg-os.jpg)}
*{box-sizing:border-box}
html{background:#121211}
body{margin:0;min-height:100vh;color:var(--text);font:16px/1.45 'Montserrat',-apple-system,"Segoe UI",Roboto,sans-serif;
  background:linear-gradient(rgba(8,8,8,.45),rgba(8,8,8,.72)),var(--bgimg) center/cover fixed #121211;transition:background .4s}
main{max-width:1180px;margin:0 auto;padding:22px 20px 56px}
a{color:inherit}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:20px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.logo{height:58px;width:auto;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
.actions{display:flex;gap:8px;flex-wrap:wrap}
h1{font-size:22px;margin:0;font-weight:700;letter-spacing:.01em}
h2{font-size:13px;color:var(--accent);font-weight:700;margin:30px 0 10px;text-transform:uppercase;letter-spacing:.12em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 8px 28px rgba(0,0,0,.35)}
.card[data-coll=IH]{border-left:5px solid #d8d3c8}.card[data-coll=SH]{border-left:5px solid #9fd4b1}.card[data-coll=PC]{border-left:5px solid #e0574a}.card[data-coll=OS]{border-left:5px solid #d4a94a}
.code{font-weight:700;font-size:18px;letter-spacing:.02em}
.title{margin:4px 0 2px}
.meta{color:var(--muted);font-size:14px}
video{display:block;width:100%;aspect-ratio:1/1;background:#000;border-radius:12px;margin:12px 0}
.caption{font-size:14px;background:var(--field);border-radius:10px;padding:9px 11px;margin:8px 0;white-space:pre-wrap}
.caption b{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.links a{flex:1 1 120px;text-align:center;padding:11px 12px;border:1px solid var(--line);border-radius:12px;color:var(--text);text-decoration:none;font-weight:600;font-size:15px;background:var(--field)}
.btn-main{display:block;width:100%;text-align:center;padding:15px;border-radius:12px;background:var(--go);color:var(--go-text);font:700 17px 'Montserrat',sans-serif;text-decoration:none;border:0;cursor:pointer;letter-spacing:.02em}
.btn-alt{display:block;width:100%;text-align:center;padding:13px;margin-top:10px;border-radius:12px;background:none;color:var(--warn);border:1px solid var(--warn);font:600 16px 'Montserrat',sans-serif;cursor:pointer}
.link-btn{background:none;border:0;color:var(--muted);font:14px 'Montserrat',sans-serif;padding:10px 0 0;text-decoration:underline;cursor:pointer}
.done{opacity:.8}
.badge{display:inline-block;font-size:13px;font-weight:600;padding:3px 9px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
.status{border-radius:12px;padding:11px 13px;margin-top:10px;font-size:15px}
.status.ok{background:var(--ok-bg);color:var(--ok)}
.status.bad{background:var(--warn-bg);color:var(--warn)}
.status.wait{background:var(--field);color:var(--muted)}
.alert{border-left:5px solid var(--warn)}
.alert .body{white-space:pre-wrap;font-size:14px;margin-top:6px}
.empty{text-align:center;color:var(--muted);padding:40px 12px}
.small{font-size:14px;color:var(--muted)}
.btn{display:inline-block;padding:10px 15px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);font:600 15px 'Montserrat',sans-serif;text-decoration:none;cursor:pointer;backdrop-filter:blur(6px)}
input[type=password]{width:100%;padding:13px;font:17px 'Montserrat',sans-serif;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);margin:10px 0 14px}
.err{color:var(--warn)}
/* Phone: one column, bigger targets */
@media (max-width:700px){
  main{padding:14px 12px 40px}
  .logo{height:42px}
  h1{font-size:18px}
  header{gap:10px}
  .actions{width:100%}
  .actions .btn{flex:1;text-align:center;padding:12px}
  .grid{grid-template-columns:1fr}
  .card{padding:15px}
  .btn-main{padding:17px}
}
`;

function shell(body, manifestUrl = "/manifest.webmanifest") {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#121211">
<link rel="manifest" href="${manifestUrl}">
<link rel="icon" href="/assets/icon3-192.png">
<link rel="apple-touch-icon" href="/assets/icon3-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<title>Introvert Here</title><style>${STYLE}</style></head>
<body data-coll="IH"><main>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const collOf = (code) => (/^(IH|SH|PC|OS)-/.exec(String(code || "")) || [, "IH"])[1];
function brandHeader(title, actions = "") {
  return `<header><div class="brand"><img class="logo" id="logo" src="/assets/logo-ih.jpg" alt="Introvert Here"><h1>${title}</h1></div>${actions ? `<div class="actions">${actions}</div>` : ""}</header>`;
}

function loginPage(wrong) {
  return shell(`
${brandHeader("Sign in")}
<form class="card" method="post" action="/login" style="max-width:420px">
  <label for="pw"><b>Password</b></label>
  <input id="pw" type="password" name="password" autocomplete="current-password" autofocus required>
  ${wrong ? `<p class="err">That password didn't match.</p>` : ""}
  <button class="btn-main" type="submit">Sign in</button>
</form>`);
}

async function page(env) {
  const items = Object.values(await loadItems(env));
  const alerts = await loadAlerts(env);
  const pending = items.filter((i) => i.status === "pending").sort((a, b) => b.receivedAt - a.receivedAt);
  const handled = items.filter((i) => i.status !== "pending").sort((a, b) => b.updatedAt - a.updatedAt);

  const pendingHtml = pending.length
    ? `<div class="grid">${pending.map(pendingCard).join("")}</div>`
    : `<div class="card empty">Nothing waiting for review.</div>`;
  const alertsHtml = alerts.length ? `<h2>Alerts</h2><div class="grid">${alerts.map(alertCard).join("")}</div>` : "";
  const comingHtml = comingUp(await env.PENDING.get("daily", "json"));
  const handledHtml = handled.length ? `<h2>Recently handled</h2><div class="grid">${handled.map(handledCard).join("")}</div>` : "";

  return shell(`
${brandHeader("Waiting for review" + (pending.length ? ` (${pending.length})` : ""), `<a class="btn" href="/gags">✍ Gags</a><a class="btn" href="/tags">🏷 Tags</a><a class="btn" href="/stats">📈 Stats</a><a class="btn" href="/pricing">£ Pricing</a><a class="btn" href="/orders">🛒 Orders</a><a class="btn" href="/amend">✏ Update listings</a><a class="btn" href="/tools">🛠 Tools</a><a class="btn" href="/links">🔗 Links</a><a class="btn" href="/">Refresh</a>`)}
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
  const savesHtml = saves.length ? `<h2>Recent saves</h2><div class="grid">${saves.slice(0, 12).map((x) => {
    const cls = x.status === "ok" ? "ok" : x.status === "failed" ? "bad" : "wait";
    const label = x.status === "ok" ? "✓ " + esc(x.message || "Saved to Core") : x.status === "failed" ? "<b>Not saved</b><br>" + esc(x.message || "") : "Saving to Core…";
    return `<div class="card"><div class="code" style="font-size:16px">${esc(x.stem || "")}</div><div class="meta">${esc(when(x.at))}</div><div class="status ${cls}">${label}</div></div>`;
  }).join("")}</div>` : "";
  return shell(`
${brandHeader("Gags", `<a class="btn" href="/">← Approvals</a><a class="btn" href="/stats">📈 Stats</a>`)}
<button class="cornerbtn" id="refresh" type="button" title="Get the latest from Core" aria-label="Get the latest from Core">⟳</button>
<div class="small" id="synced">${g ? "Core read " + esc(when(g.at)) : "Not read from Core yet - tap ⟳ (top right)."}</div>
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
  <div class="gagrow">
    <label style="flex:1 1 320px"><b>Gag</b> <span class="small">(press Enter for a new line, exactly as it should appear)</span>
      <textarea id="text" rows="9" required spellcheck="true"></textarea></label>
    <div style="flex:1 1 300px"><b>Preview</b>
      <div id="stage"><div id="pbox"></div></div><div id="pwarn"></div><div id="spell"></div></div>
  </div>
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
${savesHtml}
<style>
  select,input:not([type=checkbox]),textarea{display:block;width:100%;margin-top:6px;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);font-family:'Montserrat',sans-serif}
  select option{background:#1c1c1b;color:var(--text)}
  .tab.on{background:var(--accent);color:#141413;border-color:var(--accent)}
  #stage{background:rgba(0,0,0,.55)!important}
  @media (max-width:700px){.two{grid-template-columns:1fr}.four{grid-template-columns:1fr 1fr}.gagrow{flex-direction:column}}
  textarea{font-family:'Montserrat',sans-serif;line-height:1.35;resize:vertical}
  .gagrow{display:flex;gap:14px;flex-wrap:wrap}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .four{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:6px}
  #stage{margin-top:6px;background:#1b1b1a;border-radius:10px;padding:14px;overflow:hidden;position:relative;width:100%;min-height:60px}
  .gagrow > *{min-width:0}
  #pbox{position:absolute;left:14px;top:14px;transform-origin:top left;color:#fff;font-family:'Montserrat',sans-serif;font-weight:400;line-height:1.2;letter-spacing:-0.04em;text-align:right;outline:1px dashed rgba(255,255,255,.25)}
  #pbox div{white-space:nowrap}
  #pbox .over{color:#ff9a8a}
  .result{padding:10px;border-top:1px solid var(--line);cursor:pointer}
  .result:hover{background:var(--bg)}
  .cornerbtn{position:fixed;top:12px;right:12px;z-index:50;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--text);font-size:24px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
  .cornerbtn.busy{animation:spin 1s linear infinite;opacity:.7}
  @keyframes spin{to{transform:rotate(360deg)}}
  header{padding-right:56px}
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
  const logo = document.getElementById("logo"); if (logo) logo.src = "/assets/logo-" + c.toLowerCase() + ".jpg";
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
  b.classList.add("busy"); $("synced").textContent = "Reading Core… (about a minute)";
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
async function linksPage(env) {
  const d = (await env.PENDING.get("links", "json")) || { rows: [] };
  const list = d.rows.length ? d.rows.map((r) => `<a class="lk" href="${esc(r.address)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b><span>${esc(r.what)}</span><small>${esc(r.address.replace(/^https?:\/\//, ""))}</small></a>`).join("")
    : `<p class="small">No links yet.</p>`;
  return shell(`
<style>
.lks{display:grid;gap:12px;max-width:640px}
.lk{display:block;padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);text-decoration:none}
.lk b{display:block;font-size:18px;margin-bottom:4px}
.lk span{display:block;font-size:14px;color:var(--muted)}
.lk small{display:block;margin-top:6px;font-size:12px;color:var(--muted);word-break:break-all}
.lk:active{transform:scale(.99)}
</style>
${brandHeader("Links", `<a class="btn" href="/">← Approvals</a>`)}
<div class="lks">${list}</div>
<p class="small" style="margin-top:14px">From the LINKS tab in Core${d.at ? " · updated " + esc(when(d.at)) : ""}.</p>`, "/links.webmanifest");
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

async function pricingPage(env) {
  const data = await env.PENDING.get("pricing", "json");
  const nav = `<a class="btn" href="/">← Approvals</a><a class="btn" href="/stats">📈 Stats</a><button class="btn" id="refresh" type="button">Refresh from Core</button>`;
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
<div class="small" id="synced"></div>
<div id="app"></div>
<script>
let D = ${JSON.stringify(data || null)};
const $ = (id) => document.getElementById(id);
const TYPES = [["T-SHIRT","T-shirt"],["LONG-SLEEVE","Long-sleeve"],["SWEATSHIRT","Sweatshirt"],["HOODIE","Hoodie"]];
const money = (n) => (n < 0 ? "−£" : "£") + Math.abs(n).toFixed(2);
function cls(p, target){ return p >= target - 0.005 ? "good" : (p >= target / 2 ? "meh" : "bad"); }
function render() {
  if (!D || !D.garments) { $("app").innerHTML = '<div class="card empty">No pricing data yet. Tap “Refresh from Core”.</div>'; return; }
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
$("refresh").addEventListener("click", async () => { $("refresh").disabled = true; $("refresh").textContent = "Reading Core…"; await fetch("/api/pricing-refresh", { method: "POST" }); setTimeout(poll, 6000); });
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
${brandHeader("Tools", `<a class="btn" href="/">← Approvals</a><a class="btn" href="/gags">✍ Gags</a>`)}
<div class="tgrid">
 <div class="card tcard" style="grid-column:1/-1">
  <h3>Check Core for problems</h3>
  <p>Looks through every written gag for duplicates, very similar gags, title stems with stray spaces or line breaks, gags missing the opening "...", and custom tags over Etsy's 20 characters. Instant and free.</p>
  <button class="btn-main" id="scan" type="button">Check now</button>
  <button class="link-btn" id="scanRefresh" type="button">Re-read Core first (takes about a minute)</button>
  <div id="scanOut" class="small" style="margin-top:10px"></div>
 </div>
 <div class="card tcard" data-tool="print">
  <h3>Refresh print files</h3>
  <p>Remakes each listing's print file from the current print template (new logo, current gag text) and puts it on the Printify product. About 40 seconds per listing, roughly 15 credits each.</p>
  ${scope("print")}
  <button class="btn-main trun" type="button">Run</button><div class="small tmsg">${last("print")}</div>
 </div>
 <div class="card tcard">
  <h3>Update live listings</h3>
  <p>Change titles, descriptions, tags, mockups, the printed design or colours on live listings, one gag or a whole range at a time. Replaces the old Find Your Range photo swap: change the page in Canva, then use Update mockups.</p>
  <a class="btn-main" href="/amend" style="display:inline-block;text-align:center;text-decoration:none">Open</a>
 </div>
 <div class="card tcard" data-tool="reprice">
  <h3>Re-price listings</h3>
  <p>Puts the prices from the Pricing page onto live listings (keeps each listing's colours and sizes). A few seconds per listing, about 6 credits each.</p>
  <div class="prow"><label>Just these product codes (optional; blank = all)</label><input class="tonly" data-k="reprice" placeholder="e.g. SH-00002-T-SHIRT"></div>
  <button class="btn-main trun" type="button">Run</button><div class="small tmsg">${last("reprice")}</div>
 </div>
</div>
<p class="small" style="margin-top:20px">Each tool sends an alert to the Approvals page when it finishes.</p>
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
  if (!g || !g.all) { out.innerHTML = "The app hasn't got the full gag list yet. Tap “Re-read Core first”, wait a minute, then check again."; return; }
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
$("scanRefresh").addEventListener("click", async () => { $("scanOut").textContent = "Re-reading Core… check again in about a minute."; await fetch("/api/gags-refresh", { method: "POST" }); });
</script>`);
}

// ---------- Update live listings ----------
// Make "Tool — Amend live listings (app)" (MAKE_TOOL_RANGE_HOOK) does two jobs:
//  {action:"state"}  reads Core (live gags, PRODUCT_RULES, COLOUR_PROFILES) + Printify colours and posts them to /api/amend-sync;
//  {action:"apply", ops} writes the given Core cells, waits 5 minutes, then starts the listing builder,
//  which works through every gag flagged with an AMENDMENT_REQUIRED… status, one at a time.

const AMEND_XL = "/v1.0/drives/b!ndnYRjl_sE21BKMMz_r6PMo1voTJfixLpQRKuPki-i9EoHVOO8R9TbWVCCuU0ua6/items/01R3POCZGZPJY6UCRSEJD3MBADE4GJ24YQ/workbook";
const AMEND_COLL = { IH: "INTROVERT HERE…", SH: "SHHH.", PC: "PER CONTRACT", OS: "OFF THE SHELF" };
const AMEND_STATUS = { text: "AMENDMENT_REQUIRED", mockups: "AMENDMENT_REQUIRED_ARTWORK", reprint: "AMENDMENT_REQUIRED_REPRINT", colours: "AMENDMENT_REQUIRED_COLOURS" };
const AMEND_RULE_COLS = { suffix: "TITLE_SUFFIX", intro: "COLLECTION_INTRO", features: "PRODUCT_FEATURES", audience: "AUDIENCE_TEXT", closing: "CLOSING_TEXT" };
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

async function amendRefresh(env) {
  return (await amendHook(env, { action: "state" })) || json({ ok: true });
}

async function amendApply(request, env) {
  try { return await amendApply2(request, env); } catch (e) { return json({ error: String(e.message || e) }, 400); }
}
async function amendApply2(request, env) {
  const d = await request.json();
  const S = await env.PENDING.get("amend", "json");
  if (!S) return json({ error: "The page hasn't read Core yet. Tap Re-read Core and try again in a minute." }, 400);
  const action = String(d.action || "");
  if (!AMEND_STATUS[action]) return json({ error: "Unknown update" }, 400);
  const status = AMEND_STATUS[action];
  const ops = [];
  let gags = [];
  const pick = (Array.isArray(d.garments) ? d.garments : []).map(String).filter((t) => ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"].includes(t));
  if (d.kind === "gag") {
    const g = S.gags.find((x) => x.id === String(d.gagId || ""));
    if (!g) return json({ error: "That gag isn't live" }, 400);
    const stem = typeof d.stem === "string" ? d.stem.replace(/\s+/g, " ").trim() : null;
    const text = typeof d.text === "string" ? d.text.replace(/\r/g, "").trim() : null;
    if (stem !== null && stem !== g.stem) { if (!stem) return json({ error: "The title stem can't be empty" }, 400); ops.push(amendCell("GAGS_TABLE", "TITLE_STEM", g.row, stem)); g.stem = stem; }
    if (text !== null && text !== g.text) {
      if (action !== "reprint") return json({ error: "You changed the gag text, so the printed design has to change too. Use Update printed design." }, 400);
      if (!text) return json({ error: "The gag text can't be empty" }, 400);
      ops.push(amendCell("GAGS_TABLE", "GAG_TEXT", g.row, text)); g.text = text;
    }
    gags = [g];
    if (pick.length && !pick.some((t) => g.live.includes(t))) return json({ error: "Pick at least one garment" }, 400);
  } else if (d.kind === "range" || d.kind === "colours") {
    const code = String(d.coll || "");
    const coll = AMEND_COLL[code];
    if (!coll) return json({ error: "Unknown range" }, 400);
    gags = S.gags.filter((x) => x.id.startsWith(code + "-") && (!pick.length || pick.some((t) => x.live.includes(t))));
    if (!gags.length) return json({ error: "No live listings in that range" + (pick.length ? " for that garment" : "") }, 400);
    const rules = S.rules.filter((r) => r.coll === coll);
    if (d.kind === "range" && Array.isArray(d.rules)) {
      if (action !== "text") return json({ error: "Text changes go with Update text" }, 400);
      for (const e of d.rules) {
        const r = rules.find((x) => x.row === Number(e.row));
        if (!r) return json({ error: "Unknown product rule" }, 400);
        for (const [k, col] of Object.entries(AMEND_RULE_COLS)) {
          if (typeof e[k] === "string" && e[k] !== String(r[k] ?? "")) { ops.push(amendCell("PRODUCT_RULES", col, r.row, e[k])); r[k] = e[k]; }
        }
        if (Array.isArray(e.tags)) {
          const t = e.tags.map((s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase());
          if (t.length !== 5 || t.some((s) => !s || s.length > 20)) return json({ error: "Each garment needs 5 product tags, 20 characters max" }, 400);
          t.forEach((s, i) => { if (s !== String(r.tags[i] ?? "")) ops.push(amendCell("PRODUCT_RULES", AMEND_TAG_COLS[i], r.row, s)); });
          r.tags = t;
        }
      }
    }
    if (d.kind === "colours") {
      if (action !== "colours") return json({ error: "Colour changes go with Update colours" }, 400);
      const names = [...new Set(rules.map((r) => r.profile))];
      if (names.length !== 1) return json({ error: "This range's garments use different colour profiles; ask Claude to sort that first." }, 400);
      const prof = S.profiles.find((p) => p.name === names[0]);
      if (!prof) return json({ error: "Colour profile " + names[0] + " isn't in COLOUR_PROFILES" }, 400);
      if (S.rules.some((r) => r.profile === prof.name && r.coll !== coll)) return json({ error: "Another range shares this colour profile; ask Claude to split it first." }, 400);
      const avail = new Set(Object.values(S.colours || {}).flat());
      const want = (Array.isArray(d.colours) ? d.colours : []).map(String).filter((c) => avail.has(c));
      if (!want.length) return json({ error: "Pick at least one colour" }, 400);
      if (want.join(", ") !== prof.colours) { ops.push(amendCell("COLOUR_PROFILES_TABLE", "REAL_COLOURS", prof.row, want.join(", "))); prof.colours = want.join(", "); }
    }
  } else return json({ error: "Unknown request" }, 400);
  gags.forEach((g) => {
    const only = pick.length && g.live.some((t) => !pick.includes(t)) ? pick.filter((t) => g.live.includes(t)).join("|") : "";
    if (only && !S.hasOnly) throw new Error("Core's GAGS table has no AMEND_ONLY column yet, so it can only update all garments.");
    if (S.hasOnly && (only || g.only)) { ops.push(amendCell("GAGS_TABLE", "AMEND_ONLY", g.row, only)); g.only = only; }
    ops.push(amendCell("GAGS_TABLE", "STATUS", g.row, status)); g.status = status;
  });
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "300", run: "yes" });
  if (err) return err;
  await env.PENDING.put("amend", JSON.stringify(S));
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  log.unshift({ at: Date.now(), what: action, scope: (d.kind === "gag" ? gags[0].id : String(d.coll)) + (pick.length ? " (" + pick.map((t) => t.toLowerCase()).join(", ") + ")" : ""), n: gags.length });
  await env.PENDING.put("amend-log", JSON.stringify(log.slice(0, 20)));
  return json({ ok: true, gags: gags.length });
}

async function amendPage(env) {
  const S = (await env.PENDING.get("amend", "json")) || null;
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  return shell(`
<style>
.rng{margin-bottom:18px}
.rng h2{margin:0 0 4px;font-size:20px}
.row2{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.row2 .btn-main{flex:1;min-width:150px}
.gl{border-top:1px solid var(--line);padding:10px 0}
.gl .top{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.gl .nm{font-size:15px}
.gl .nm small{display:block;color:var(--muted);font-size:12px}
.pill{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--field);border:1px solid var(--line)}
.pill.busy{border-color:var(--accent);color:var(--accent)}
.ed{display:none;margin-top:8px}
.ed.open,.box.open{display:block}
.box{display:none;margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:12px}
.ed label,.box label{display:block;font-size:13px;color:var(--muted);margin:8px 0 3px}
.ed input,.ed textarea,.box input,.box textarea,.box select{width:100%;box-sizing:border-box;padding:9px 10px;font:15px Montserrat;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text)}
.box textarea,.ed textarea{min-height:70px}
.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px;margin:6px 0}
.cols label{display:flex;gap:6px;align-items:center;color:var(--text);margin:0;font-size:14px}
.cols input{width:auto}
.note{font-size:13px;color:var(--muted);margin:4px 0}
.prow2{display:flex;gap:8px;align-items:center;margin:8px 0}.prow2 select{flex:1;padding:8px 10px;font:15px Montserrat;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text)}
.msg{font-size:14px;margin-top:6px}
</style>
${brandHeader("Update live listings", `<a class="btn" href="/">← Approvals</a><a class="btn" href="/tools">🛠 Tools</a><button class="btn" id="reread" type="button">Re-read Core</button>`)}
<p class="small" id="readAt"></p>
<div class="card" style="margin-bottom:16px"><p class="note" style="margin:0">Opening Edit or Colours changes nothing; only the Update/Save buttons do, and they ask first. Cancel closes without saving.<br>Each button saves to Core straight away, then updates Etsy about 5 minutes later. Gags are done one at a time, so a whole range can take a while; you'll see each gag go back to “Live” when it's finished.<br>
<b>Update text</b>: titles, descriptions and tags. <b>Update mockups</b>: new mockup photos from Canva. <b>Update printed design</b>: new print file from the gag text, then new mockups and a new video for you to approve. <b>Update colours</b>: adds or removes colours, then new mockups.</p></div>
<div id="out"></div>
<div class="card"><h3 style="margin:0 0 6px;font-size:16px">Recent updates</h3><div class="small" id="log"></div></div>
<script>
let S = ${JSON.stringify(S).replace(/</g, "\\u003c")};
const LOG = ${JSON.stringify(log).replace(/</g, "\\u003c")};
const RANGES = [["IH","Introvert Here","INTROVERT HERE…"],["SH","SHHH.","SHHH."],["PC","Per Contract","PER CONTRACT"],["OS","Off The Shelf","OFF THE SHELF"]];
const GARM = { "T-SHIRT":"T-shirt", "LONG-SLEEVE":"Long sleeve", "SWEATSHIRT":"Sweatshirt", "HOODIE":"Hoodie" };
const STAT = { AMENDMENT_REQUIRED:"Updating text", AMENDMENT_REQUIRED_ARTWORK:"Updating mockups", AMENDMENT_REQUIRED_REPRINT:"Updating printed design", AMENDMENT_REQUIRED_COLOURS:"Updating colours", LIVE_EXISTING:"Live", FAILED:"Failed" };
const LABEL = { text:"Update text", mockups:"Update mockups", reprint:"Update printed design", colours:"Update colours" };
const $ = (id) => document.getElementById(id);
const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const busy = (s) => /^AMENDMENT_REQUIRED/.test(s);
function render() {
  if (!S) { $("out").innerHTML = '<div class="card">The page hasn\\'t read Core yet. Tap <b>Re-read Core</b> and give it a minute.</div>'; return; }
  $("readAt").textContent = "Core read " + new Date(S.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
  $("out").innerHTML = RANGES.map(([code, name, coll]) => {
    const gags = S.gags.filter((g) => g.id.startsWith(code + "-"));
    if (!gags.length) return "";
    const rules = S.rules.filter((r) => r.coll === coll);
    const prof = S.profiles.find((p) => rules[0] && p.name === rules[0].profile);
    const have = new Set(String(prof ? prof.colours : "").split(",").map((s) => s.trim()).filter(Boolean));
    const avail = {}; rules.forEach((r) => (S.colours[r.bp] || []).forEach((c) => (avail[c] = avail[c] || []).push(GARM[r.type] || r.type)));
    const allC = Object.keys(avail).sort((a, b) => (have.has(b) - have.has(a)) || a.localeCompare(b));
    const nBusy = gags.filter((g) => busy(g.status)).length;
    return '<div class="card rng" data-coll="' + code + '"><h2>' + h(name) + '</h2><div class="note">' + gags.length + ' live gag' + (gags.length === 1 ? '' : 's') + (nBusy ? ' · <b>' + nBusy + ' being updated</b>' : '') + '</div>' +
      '<div class="row2"><button class="btn" data-open="edit-' + code + '">✏ Edit all (titles, descriptions, tags)</button><button class="btn" data-open="col-' + code + '">🎨 Colours</button></div>' +
      '<div class="prow2"><label class="note">Which garments</label><select class="gsel"><option value="">All garments</option>' + rules.map((r) => '<option value="' + r.type + '">' + h(GARM[r.type] || r.type) + 's only</option>').join("") + '</select></div>' +
      '<div class="row2"><button class="btn-main" data-range="text">Update text on all</button><button class="btn-main" data-range="mockups">Update mockups on all</button><button class="btn-main" data-range="reprint">Update printed design on all</button></div>' +
      '<div class="box" id="edit-' + code + '"><label>Garment</label><select class="rsel">' + rules.map((r) => '<option value="' + r.row + '">' + h(GARM[r.type] || r.type) + '</option>').join("") + '</select><div class="rfields"></div>' +
        '<div class="row2"><button class="btn-main" data-rsave>Save and update text on all ' + gags.length + '</button><button class="btn" data-cancel>Cancel</button></div><div class="note">Saving changes the text for the garment shown here; pick another garment to edit that too (unsaved edits are kept while you switch). The garment choice above says which listings get updated.</div></div>' +
      '<div class="box" id="col-' + code + '"><div class="note">Ticked colours are on every listing in this range. Untick a colour to take it off; tick a new one to add it (Printify must sell it for that garment; garments that don\\'t offer it are skipped).</div><div class="cols">' +
        allC.map((c) => '<label><input type="checkbox" value="' + h(c) + '"' + (have.has(c) ? ' checked' : '') + '>' + h(c) + (avail[c].length < rules.length ? ' <small style="color:var(--muted)">(' + h(avail[c].join(", ")) + ' only)</small>' : '') + '</label>').join("") + '</div>' +
        '<div class="note">Main colour for this range: ' + h(rules[0] ? rules[0].primary : "") + (rules[0] && rules[0].secondary ? ', then ' + h(rules[0].secondary) : '') + '. Don\\'t untick those without telling Claude.</div>' +
        '<div class="row2"><button class="btn-main" data-colsave>Update colours on all ' + gags.length + '</button><button class="btn" data-cancel>Cancel</button></div></div>' +
      '<div class="msg rmsg"></div>' +
      gags.map((g) => '<div class="gl" data-gag="' + h(g.id) + '"><div class="top"><div class="nm">' + h(g.stem || g.id) + '<small>' + h(g.id) + ' · ' + h(g.live.map((t) => GARM[t] || t).join(", ")) + '</small></div><div><span class="pill' + (busy(g.status) ? ' busy' : '') + '">' + h(STAT[g.status] || g.status || "Live") + '</span> <button class="btn" data-edit>Edit</button></div></div>' +
        '<div class="ed"><label>Garments to update</label><div class="cols gcols">' + g.live.map((t) => '<label><input type="checkbox" value="' + t + '" checked>' + h(GARM[t] || t) + '</label>').join("") + '</div><label>Title stem</label><input class="gstem" value="' + h(g.stem) + '"><label>Gag text (changing it needs Update printed design)</label><textarea class="gtext">' + h(g.text) + '</textarea>' +
        '<div class="row2"><button class="btn-main" data-gag-act="text">Update text</button><button class="btn-main" data-gag-act="mockups">Update mockups</button><button class="btn-main" data-gag-act="reprint">Update printed design</button><button class="btn" data-cancel>Cancel</button></div><div class="msg gmsg"></div></div></div>').join("") +
      '</div>';
  }).join("");
  document.querySelectorAll(".rng").forEach(setupRange);
  $("log").innerHTML = LOG.length ? LOG.map((l) => h(new Date(l.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })) + " · " + h(LABEL[l.what] || l.what) + " · " + h(l.scope) + (l.n > 1 ? " (" + l.n + " gags)" : "")).join("<br>") : "None yet.";
}
const drafts = {};
function ruleFields(box, row) {
  const r = S.rules.find((x) => x.row === Number(row)); const dft = drafts[row] || {};
  const v = (k) => h(dft[k] != null ? dft[k] : r[k]);
  const tags = dft.tags || r.tags;
  box.querySelector(".rfields").innerHTML =
    '<label>Title ending (after the stem)</label><input data-k="suffix" value="' + v("suffix") + '"><div class="note tlen"></div>' +
    '<label>Range intro</label><textarea data-k="intro">' + v("intro") + '</textarea>' +
    '<label>Product features</label><textarea data-k="features">' + v("features") + '</textarea>' +
    '<label>Who it\\'s for</label><textarea data-k="audience">' + v("audience") + '</textarea>' +
    '<label>Closing text</label><textarea data-k="closing">' + v("closing") + '</textarea>' +
    '<label>Product tags (5, 20 characters max each)</label>' + [0,1,2,3,4].map((i) => '<input data-t="' + i + '" maxlength="20" value="' + h(tags[i]) + '" style="margin-bottom:4px">').join("");
  const upd = () => { const d = drafts[row] = drafts[row] || {}; box.querySelectorAll("[data-k]").forEach((el) => d[el.dataset.k] = el.value); d.tags = [...box.querySelectorAll("[data-t]")].map((el) => el.value);
    const longest = Math.max(0, ...S.gags.filter((g) => g.id.startsWith(box.closest(".rng").dataset.coll + "-")).map((g) => (g.stem || "").length));
    box.querySelector(".tlen").textContent = "Longest title in this range would be " + (longest + 1 + d.suffix.length) + " of Etsy's 140 characters."; };
  box.querySelectorAll("input,textarea").forEach((el) => el.addEventListener("input", upd)); upd();
}
async function send(body, msgEl, what) {
  if (!confirm(what + "\\n\\nThis saves to Core now and updates Etsy in about 5 minutes.")) return;
  msgEl.textContent = "Saving to Core…";
  const r = await fetch("/api/amend-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  msgEl.textContent = r.ok ? "Saved. Etsy updates start in about 5 minutes (" + j.gags + " gag" + (j.gags === 1 ? "" : "s") + ")." : (j.error || "Something went wrong.");
  if (r.ok) setTimeout(() => location.reload(), 2500);
}
function setupRange(card) {
  const code = card.dataset.coll, name = card.querySelector("h2").textContent, rmsg = card.querySelector(".rmsg");
  card.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => $(b.dataset.open).classList.toggle("open")));
  const eb = $("edit-" + code), sel = eb.querySelector(".rsel"), cb = $("col-" + code);
  ruleFields(eb, sel.value); sel.addEventListener("change", () => ruleFields(eb, sel.value));
  eb.querySelector("[data-cancel]").addEventListener("click", () => {   // throw away edits, close, nothing saved
    [...sel.options].forEach((o) => delete drafts[o.value]); ruleFields(eb, sel.value); eb.classList.remove("open"); rmsg.textContent = "";
  });
  const ticks = [...cb.querySelectorAll("input")].map((i) => i.checked);
  cb.querySelector("[data-cancel]").addEventListener("click", () => { cb.querySelectorAll("input").forEach((i, k) => i.checked = ticks[k]); cb.classList.remove("open"); rmsg.textContent = ""; });
  eb.querySelector("[data-rsave]").addEventListener("click", () => {
    const rules = Object.entries(drafts).filter(([row]) => S.rules.some((r) => r.row === Number(row) && r.coll === RANGES.find((x) => x[0] === code)[2])).map(([row, d]) => ({ row: Number(row), ...d }));
    send({ kind: "range", coll: code, action: "text", rules, garments: gpick() }, rmsg, "Save the " + name + " text and update text on every " + name + " listing?");
  });
  card.querySelector("[data-colsave]").addEventListener("click", () => {
    const colours = [...$("col-" + code).querySelectorAll("input:checked")].map((i) => i.value);
    send({ kind: "colours", coll: code, action: "colours", colours, garments: gpick() }, rmsg, "Set " + name + " colours to: " + colours.join(", ") + "?");
  });
  const gsel = card.querySelector(".gsel");
  const gpick = () => gsel.value ? [gsel.value] : [];
  const gname = () => gsel.value ? name + " " + gsel.options[gsel.selectedIndex].text.replace(" only", "") : "every " + name + " listing";
  card.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => send({ kind: "range", coll: code, action: b.dataset.range, garments: gpick() }, rmsg, LABEL[b.dataset.range] + " on " + gname() + "?")));
  card.querySelectorAll(".gl").forEach((row) => {
    row.querySelector("[data-edit]").addEventListener("click", () => row.querySelector(".ed").classList.toggle("open"));
    const g0 = S.gags.find((x) => x.id === row.dataset.gag);
    row.querySelector("[data-cancel]").addEventListener("click", () => { row.querySelectorAll(".gcols input").forEach((i) => i.checked = true); row.querySelector(".gstem").value = g0.stem; row.querySelector(".gtext").value = g0.text; row.querySelector(".ed").classList.remove("open"); row.querySelector(".gmsg").textContent = ""; });
    row.querySelectorAll("[data-gag-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.gagAct;
      const all = [...row.querySelectorAll(".gcols input")], on = all.filter((i) => i.checked).map((i) => i.value);
      if (!on.length) { row.querySelector(".gmsg").textContent = "Tick at least one garment."; return; }
      const garments = on.length === all.length ? [] : on;
      send({ kind: "gag", gagId: row.dataset.gag, action: act, stem: row.querySelector(".gstem").value, text: row.querySelector(".gtext").value, garments }, row.querySelector(".gmsg"), LABEL[act] + " on " + row.dataset.gag + " (" + (garments.length ? on.map((t) => GARM[t] || t).join(", ") : "all garments") + ")?");
    }));
  });
}
$("reread").addEventListener("click", async () => {
  $("reread").disabled = true; $("reread").textContent = "Reading Core…";
  const at = S ? S.at : 0; await fetch("/api/amend-refresh", { method: "POST" });
  const poll = async () => { const r = await fetch("/api/amend-data"); const d = r.ok ? await r.json() : null; if (d && d.at !== at) { location.reload(); return; } setTimeout(poll, 5000); };
  setTimeout(poll, 8000);
});
render();
</script>`);
}

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
  const nav = `<a class="btn" href="/">← Approvals</a><a class="btn" href="/gags">✍ Gags</a><button class="btn" id="refresh" type="button">Refresh from Core</button>`;
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
  if (!D) { $('synced').textContent = 'Not read from Core yet. Tap Refresh from Core (takes about a minute).'; return; }
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
  waiting--; $('msg').textContent = 'Core is taking a while. Tap Refresh from Core in a minute.';
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
