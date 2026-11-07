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
      if (pathname === "/api/gag-result" && method === "POST") return await gagResult(request, env, ctx, url);

      if (pathname === "/login" && method === "POST") return await login(request, env);
      if (pathname === "/logout") return logout();

      const authed = await isAuthed(request, env);
      if (pathname === "/" && method === "GET") {
        return authed ? await page(env) : loginPage(url.searchParams.has("wrong"));
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
      if (pathname === "/api/gags-refresh" && method === "POST") return await gagsRefresh(env);
      if (pathname === "/api/gag-save" && method === "POST") return await gagSave(request, env);
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
    ctx.waitUntil(notify(env, url.origin, item.product + " is live", "Live on Etsy and posted to Pinterest, Instagram and Facebook.", "white_check_mark"));
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

async function notify(env, origin, title, body, tag) {
  if (!env.NTFY_TOPIC) return;
  try {
    const res = await fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), {
      method: "POST",
      headers: { Title: ascii(title), Click: origin + "/", Tags: tag },
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
:root{--bg:#f6f5f2;--card:#fff;--text:#1d1d1b;--muted:#6b6a66;--line:#e4e2dc;--accent:#2f6b4f;--accent-text:#fff;--warn:#9a3b2e;--warn-bg:#fbeeea;--ok:#2f6b4f;--ok-bg:#e9f3ed}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#21211f;--text:#eeede9;--muted:#a3a29c;--line:#34332f;--accent:#4f9e77;--accent-text:#0f1a14;--warn:#e08b7d;--warn-bg:#3a2420;--ok:#7cc29c;--ok-bg:#1d2f25}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
h1{font-size:22px;margin:0}
h2{font-size:15px;color:var(--muted);font-weight:600;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.04em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.code{font-weight:700;font-size:18px}
.title{margin:4px 0 2px}
.meta{color:var(--muted);font-size:14px}
video{display:block;width:100%;aspect-ratio:1/1;background:#000;border-radius:10px;margin:12px 0}
.caption{font-size:14px;background:var(--bg);border-radius:8px;padding:8px 10px;margin:8px 0;white-space:pre-wrap}
.caption b{display:block;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.links a{flex:1 1 120px;text-align:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px;color:var(--text);text-decoration:none;font-weight:600;font-size:15px}
.btn-main{display:block;width:100%;text-align:center;padding:15px;border-radius:10px;background:var(--accent);color:var(--accent-text);font-weight:700;font-size:17px;text-decoration:none;border:0;cursor:pointer}
.btn-alt{display:block;width:100%;text-align:center;padding:12px;margin-top:10px;border-radius:10px;background:none;color:var(--warn);border:1px solid var(--warn);font-weight:600;font-size:16px;cursor:pointer}
.link-btn{background:none;border:0;color:var(--muted);font-size:14px;padding:10px 0 0;text-decoration:underline;cursor:pointer}
.done{opacity:.75}
.badge{display:inline-block;font-size:13px;font-weight:600;padding:3px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
.status{border-radius:10px;padding:10px 12px;margin-top:10px;font-size:15px}
.status.ok{background:var(--ok-bg);color:var(--ok)}
.status.bad{background:var(--warn-bg);color:var(--warn)}
.status.wait{background:var(--bg);color:var(--muted)}
.alert{border-left:4px solid var(--warn)}
.alert .body{white-space:pre-wrap;font-size:14px;margin-top:6px}
.empty{text-align:center;color:var(--muted);padding:40px 12px}
.small{font-size:14px;color:var(--muted)}
.btn{padding:9px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-size:15px;text-decoration:none}
input[type=password]{width:100%;padding:13px;font-size:17px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);margin:10px 0 14px}
.err{color:var(--warn)}
`;

function shell(body) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Mosspit Approvals</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function loginPage(wrong) {
  return shell(`
<header><h1>Mosspit Approvals</h1></header>
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
<header><h1>Waiting for review${pending.length ? ` (${pending.length})` : ""}</h1>
<div style="display:flex;gap:8px"><a class="btn" href="/gags">✍ Gags</a><a class="btn" href="/">Refresh</a></div></header>
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
  const listing = safeUrl(i.listingUrl);
  const oneDrive = safeUrl(i.videoUrl);
  const player = i.hasVideo
    ? `<video controls playsinline preload="metadata" src="/video/${encodeURIComponent(i.row)}/${encodeURIComponent(i.code)}"></video>`
    : "";
  return `
<div class="card" data-row="${esc(i.row)}" data-code="${esc(i.code)}" data-product="${esc(i.product)}">
  <div class="code">${esc(i.product)}</div>
  ${i.title ? `<div class="title">${esc(i.title)}</div>` : ""}
  <div class="meta">Rendered ${esc(when(i.receivedAt))}</div>
  ${player}
  ${captionBlock(i)}
  <div class="links">
    ${listing ? `<a href="${esc(listing)}" target="_blank" rel="noopener">Open listing</a>` : ""}
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
<div class="card ${i.status === "rejected" ? "" : "done"}" data-row="${esc(i.row)}" data-code="${esc(i.code)}" data-product="${esc(i.product)}">
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
    text: String(d.text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, ""), stem: str(d.stem), tag12: str(d.tag12), tag13: str(d.tag13),
    d1: str(d.d1), d2: str(d.d2), d3: str(d.d3), d4: str(d.d4),
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
<header><h1>Gags</h1><div style="display:flex;gap:8px"><a class="btn" href="/">← Approvals</a><button class="btn" id="refresh" type="button">Refresh from Core</button></div></header>
<div class="small" id="synced">${g ? "Core read " + esc(when(g.at)) : "Not read from Core yet - tap Refresh from Core."}</div>
<div class="tabs" style="display:flex;gap:8px;margin:16px 0 4px">
  <button class="btn tab" data-tab="new" type="button" style="font-weight:700">New gag</button>
  <button class="btn tab" data-tab="edit" type="button">Edit unreleased</button>
</div>
<div id="pick" class="card" style="display:none;margin-top:10px">
  <input id="search" placeholder="Search by ID, text or title stem…" style="width:100%;padding:11px;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">
  <div id="results" style="margin-top:8px;max-height:320px;overflow:auto"></div>
</div>
<form id="form" class="card" style="margin-top:10px;display:grid;gap:14px">
  <div id="slot" class="status wait">Choose a collection.</div>
  <label><b>Collection</b><select id="collection" required></select></label>
  <div class="gagrow">
    <label style="flex:1 1 320px"><b>Gag</b> <span class="small">(press Enter for a new line, exactly as it should appear)</span>
      <textarea id="text" rows="9" required spellcheck="true"></textarea></label>
    <div style="flex:1 1 300px"><b>Preview</b> <span class="small">(12 × 9 grid of capital Ws, like Canva and the video)</span>
      <div id="stage"><div id="pbox"></div></div><div id="pwarn"></div></div>
  </div>
  <label><b>Gag category</b><select id="category" required></select></label>
  <label><b>Title stem</b><input id="stem" required maxlength="60"><span class="small" id="stemnote"></span></label>
  <div class="two"><label><b>Custom tag 12</b><input id="tag12" value="birthday gift"></label><label><b>Custom tag 13</b><input id="tag13" value="treat yourself"></label></div>
  <div><b>Release dates</b>
    <div class="four">
      <label>T-shirt<input type="date" id="d1" required></label><label>Long-sleeve<input type="date" id="d2" required></label>
      <label>Sweatshirt<input type="date" id="d3" required></label><label>Hoodie<input type="date" id="d4" required></label>
    </div></div>
  <button class="btn-main" type="submit" id="save">Save to Core</button>
</form>
${savesHtml}
<style>
  select,input:not([type=checkbox]),textarea{display:block;width:100%;margin-top:6px;padding:11px;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-family:inherit}
  textarea{font-family:'Montserrat',sans-serif;line-height:1.35;resize:vertical}
  .gagrow{display:flex;gap:14px;flex-wrap:wrap}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .four{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:6px}
  #stage{margin-top:6px;background:#1b1b1a;border-radius:10px;padding:14px;overflow:hidden}
  #pbox{transform-origin:top left;color:#fff;font-family:'Montserrat',sans-serif;font-weight:400;line-height:1.2;letter-spacing:-0.04em;text-align:right;outline:1px dashed rgba(255,255,255,.25)}
  #pbox div{white-space:nowrap}
  #pbox .over{color:#ff9a8a}
  .result{padding:10px;border-top:1px solid var(--line);cursor:pointer}
  .result:hover{background:var(--bg)}
</style>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&display=swap" rel="stylesheet">
<script>
const G = ${JSON.stringify(g || null).replace(/</g, "\\u003c")};
${GAGS_SCRIPT}</script>`);
}

// Page script for /gags, kept verbatim (String.raw) so backslashes like \n survive.
const GAGS_SCRIPT = String.raw`const BOX = { "INTROVERT HERE…": 509, "SHHH.": 505, "PER CONTRACT": 543 };
const $ = (id) => document.getElementById(id);
let mode = "new", editing = null;

function opts(sel, items, placeholder) {
  sel.innerHTML = '<option value="">' + placeholder + '</option>' + items.map((x) => '<option>' + x.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</option>').join('');
}
if (G) { opts($("collection"), G.collections, "Choose…"); opts($("category"), G.categories, "Choose…"); }

function setDates(ds) { ["d1","d2","d3","d4"].forEach((k, i) => { $(k).value = (ds && ds[i]) || ""; }); }

function slotInfo() {
  if (mode === "edit") { $("slot").className = "status wait"; $("slot").textContent = editing ? "Editing " + editing.id + " (not built yet). Saving updates its row in Core." : "Pick a gag to edit above."; return; }
  const c = $("collection").value, pc = G && G.perCollection[c];
  if (!c || !pc) { $("slot").className = "status wait"; $("slot").textContent = "Choose a collection."; return; }
  const n = pc.next;
  $("slot").className = "status ok";
  $("slot").textContent = n.mode === "fill"
    ? "Will fill prepared row " + n.id + " (" + pc.emptyLeft + " empty " + pc.prefix + " row" + (pc.emptyLeft === 1 ? "" : "s") + " left). Its dates are filled in below."
    : "No empty " + (pc.prefix || "") + " rows left - will add a new row at the bottom as " + n.id + ", dated the day after the latest date in Core.";
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

// ----- tabs / edit picker -----
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.tab; editing = null;
  document.querySelectorAll('.tab').forEach((x) => x.style.fontWeight = x === b ? 700 : 400);
  $("pick").style.display = mode === "edit" ? "block" : "none";
  $("collection").disabled = mode === "edit";
  $("form").reset(); $("tag12").value = "birthday gift"; $("tag13").value = "treat yourself";
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
    $("stem").value = editing.stem; $("tag12").value = editing.tag12; $("tag13").value = editing.tag13; setDates(editing.dates);
    slotInfo(); preview(); stemNote(); $("form").scrollIntoView({ behavior: "smooth" });
  }));
}
$("search").addEventListener("input", search);

// ----- save -----
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let action, gagId = "";
  if (mode === "edit") { if (!editing) { alert("Pick a gag to edit first."); return; } action = "edit"; gagId = editing.id; }
  else { const pc = G && G.perCollection[$("collection").value]; if (!pc) { alert("Choose a collection."); return; } action = pc.next.mode; gagId = pc.next.mode === "fill" ? pc.next.id : ""; }
  if ($("pwarn").querySelector('.bad') && !confirm("The preview shows a problem with the line breaks. Save anyway?")) return;
  const body = { action, gagId, collection: $("collection").value, category: $("category").value, text: $("text").value, stem: $("stem").value,
    tag12: $("tag12").value, tag13: $("tag13").value, d1: $("d1").value, d2: $("d2").value, d3: $("d3").value, d4: $("d4").value };
  $("save").disabled = true; $("save").textContent = "Sending to Core…";
  const res = await fetch('/api/gag-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { alert(out.error || "Couldn't save."); $("save").disabled = false; $("save").textContent = "Save to Core"; return; }
  location.reload();
});

// ----- refresh + auto-update -----
$("refresh").addEventListener('click', async () => {
  $("refresh").disabled = true; $("refresh").textContent = "Reading Core…";
  const r = await fetch('/api/gags-refresh', { method: 'POST' }); if (!r.ok) { alert((await r.json().catch(()=>({}))).error || 'Refresh failed'); }
});
let last = null;
setInterval(async () => {
  try {
    const s = await (await fetch('/api/gags-state')).json(); const sig = JSON.stringify(s);
    if (last === null) { last = sig; return; }
    const typing = document.activeElement && ["TEXTAREA","INPUT","SELECT"].includes(document.activeElement.tagName) && $("text").value;
    if (sig !== last && !typing) location.reload();
  } catch (e) {}
}, 5000);
slotInfo();
`;
