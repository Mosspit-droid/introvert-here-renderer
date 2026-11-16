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
    ctx.waitUntil(creditsCheck(env, false).catch(() => {}));
    ctx.waitUntil(reviewsCheck(env, false).catch(() => {}));
    ctx.waitUntil(quickTick(env).catch(() => {}));
    ctx.waitUntil(exTick(env).catch(() => {}));
    ctx.waitUntil(copyWatchTick(env).catch(() => {}));
    ctx.waitUntil(headlinesGet(env, false).catch(() => {}));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // Called by Make
      if (pathname === "/api/pending" && method === "POST") return await ingest(request, env, ctx, url);
      if (pathname === "/api/alert" && method === "POST") return await alert(request, env, ctx, url);
      if (pathname === "/api/lock" && method === "POST") return await lockOp(request, env);
      if (pathname === "/api/template-result" && method === "POST") return await templateResult(request, env);
      if (pathname === "/api/photo-job" && method === "GET") return checkSecret(request, env) ? json((await env.PENDING.get("photo-job", "json")) || {}) : json({ error: "bad secret" }, 403);
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
      { const m = /^\/mcp\/([A-Za-z0-9_-]{16,})\/?$/.exec(pathname); if (m) return await todoMcp(request, env, m[1]); }
      { const m = /^\/todo-api\/([A-Za-z0-9_-]{16,})(?:\/(done))?\/?$/.exec(pathname); if (m) return await todoExtApi(request, env, m[1], m[2]); }
      if (pathname === "/login" && method === "POST") return await login(request, env);
      if (pathname === "/logout") return logout();

      const authed = await isAuthed(request, env);
      if (pathname === "/" && method === "GET") {
        return authed ? await dashboardPage(env) : loginPage(url.searchParams.has("wrong"));
      }
      if (pathname === "/approvals" && method === "GET") {
        return authed ? await page(env) : redirect("/");
      }
      if (pathname.startsWith("/gag/") && method === "GET") {
        return authed ? await gagPage(env, decodeURIComponent(pathname.slice(5)).toUpperCase()) : redirect("/");
      }
      if (pathname === "/week" && method === "GET") {
        return authed ? await weekPage(env) : redirect("/");
      }
      if (pathname === "/credits" && method === "GET") {
        return authed ? await creditsPage(env) : redirect("/");
      }
      if (pathname === "/todo" && method === "GET") {
        return authed ? await todoPage(env, url.origin) : redirect("/");
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
      if (pathname === "/gagcheck.js" && method === "GET") {
        return authed ? new Response(BROWSER_SHIM + "var gagIssues = " + gagIssuesFn.toString() + ";", { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" } }) : json({ error: "not signed in" }, 401);
      }
      if (pathname === "/amend.js" && method === "GET") {
        return authed ? new Response(BROWSER_SHIM + AMEND_JS + "\n" + photoPlan.toString(), { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" } }) : json({ error: "not signed in" }, 401);
      }
      if (pathname === "/amend" && method === "GET") {
        return authed ? await amendPage(env) : redirect("/");
      }
      if (pathname === "/listings" && method === "GET") return authed ? await amendPage(env) : redirect("/");
      if (pathname === "/health" && method === "GET") return authed ? await healthPage(env) : redirect("/");
      if (pathname === "/quiet" && method === "GET") return authed ? await quietPage(env) : redirect("/");
      if (pathname === "/reviews" && method === "GET") return authed ? await reviewsPage(env) : redirect("/");
      if (pathname === "/copywatch" && method === "GET") return authed ? await copyWatchPage(env) : redirect("/");
      if (pathname === "/today" && method === "GET") return authed ? await todayPage(env) : redirect("/");
      if (pathname === "/calendar" && method === "GET") {
        return authed ? await calendarPage(env) : redirect("/");
      }
      if (pathname === "/settings" && method === "GET") {
        return authed ? await settingsPage(env, url.searchParams.get("part") || "system") : redirect("/");
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
      if (pathname === "/api/approve" && method === "POST") return await approveItem(request, env);
      if (pathname === "/api/remake" && method === "POST") return await remakeItem(request, env, ctx);
      if (pathname === "/api/reject" && method === "POST") return await makeAction(request, env, "reject");
      if (pathname === "/api/scrap" && method === "POST") return await scrapListing(request, env);
      if (pathname === "/api/rerender" && method === "POST") return await makeAction(request, env, "rerender");
      if (pathname === "/api/dismiss-alert" && method === "POST") return await dismissAlert(request, env);
      if (pathname === "/api/gags-state" && method === "GET") return await gagsState(env);
      if (pathname === "/api/gags-data" && method === "GET") { const gd = (await env.PENDING.get("gags", "json")) || null; if (gd) gd.stars = (await env.PENDING.get(STARS_KEY, "json")) || {}; return json(gd); }
      if (pathname === "/api/gags-refresh" && method === "POST") return await gagsRefresh(env);
      if (pathname === "/api/tags-data" && method === "GET") return json((await env.PENDING.get("tags", "json")) || null);
      if (pathname === "/api/tags-refresh" && method === "POST") return await tagsHook(env, { action: "tags-sync" });
      if (pathname === "/api/tags-save" && method === "POST") return await tagsSave(request, env);
      if (pathname === "/api/gag-save" && method === "POST") return await gagSave(request, env);
      if (pathname === "/api/headlines" && method === "GET") return json(await headlinesGet(env, url.searchParams.get("fresh") === "1"));
      if (pathname === "/api/gag-swap" && method === "POST") return await gagSwap(request, env);
      if (pathname === "/api/settings" && method === "POST") return await settingsSave(request, env);
      if (pathname === "/api/ideas") return await ideasApi(request, env);
      if (pathname === "/api/stars") return await starsApi(request, env);
      if (pathname === "/api/gag-target" && method === "POST") return await gagTarget(request, env);
      if (pathname === "/api/gag-clear" && method === "POST") return await gagClear(request, env);
      if (pathname === "/api/quick-list" && method === "POST") return await quickList(request, env);
      if (pathname === "/api/copywatch" && method === "POST") return await copyWatchApi(request, env);
      if (pathname === "/api/quick-dismiss" && method === "POST") { const L = ((await env.PENDING.get(QUICK_KEY, "json")) || []).filter((j) => !["done", "failed", "stuck"].includes(j.stage)); await env.PENDING.put(QUICK_KEY, JSON.stringify(L)); return json({ ok: true }); }
      if (pathname === "/api/backups" && method === "GET") return json(await backupList(env));
      if (pathname === "/api/price-test" && method === "POST") return await priceTestApi(request, env);
      if (pathname === "/api/search-data" && method === "GET") return await searchData(env);
      if (pathname === "/api/notify-test" && method === "POST") { await notify(env, url.origin, "Test from your app", "Phone notifications are working.", "bell"); return json({ ok: !!env.NTFY_TOPIC }); }
      if (pathname === "/api/dismiss" && method === "POST") { const d = await request.json().catch(() => ({})); const m = (await env.PENDING.get("dismissed", "json")) || {}; m[str(d.k).slice(0, 80)] = str(d.sig).slice(0, 200); await env.PENDING.put("dismissed", JSON.stringify(m)); return json({ ok: true }); }
      if (pathname === "/api/spell" && method === "POST") return await spell(request, env);
      if (pathname === "/api/pricing-save" && method === "POST") return await pricingSave(request, env);
      if (pathname === "/api/shop-keys" && method === "POST") return await shopKeys(request, env);
      if (pathname === "/api/shop-order-send" && method === "POST") return await shopOrderSend(request, env);
      if (pathname === "/api/tool-run" && method === "POST") return await toolRun(request, env);
      if (pathname === "/api/threads-save" && method === "POST") return await threadsSave(request, env);
      if (pathname === "/api/todo" && method === "POST") return await todoAppApi(request, env);
      if (pathname === "/api/template-check" && method === "POST") return await templateCheck(request, env);
      if (pathname === "/api/template-checks" && method === "GET") return json((await env.PENDING.get("tpl-checks", "json")) || {});
      if (pathname === "/api/stop" && method === "POST") return await stopBuilder(request, env);
      if (pathname === "/api/resume" && method === "POST") return await resumeBuilder(env);
      if (pathname === "/api/stop-state" && method === "GET") return json((await env.PENDING.get("builder-stop", "json")) || {});
      if (pathname === "/api/amend-trial" && method === "POST") return await amendTrial(request, env);
      if (pathname === "/api/credits-key" && method === "POST") return await creditsKey(request, env);
      if (pathname === "/api/credits-refresh" && method === "POST") { const out = await creditsCheck(env, true); return json(out.error ? { error: out.error } : { ok: true }); }
      if (pathname === "/api/todo-data" && method === "GET") return json(await todoLoad(env));
      if (pathname === "/api/amend-apply" && method === "POST") return await amendApply(request, env);
      if (pathname === "/api/amend-refresh" && method === "POST") return await amendRefresh(env);
      if (pathname === "/api/amend-restart" && method === "POST") return await amendRestart(env);
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

// One-at-a-time lock for self-chaining scenarios (the builder).
// take: ok unless another run holds a fresh, un-passed lock.
// pass: called just before the run starts its successor, so the successor can take it.
// free: release outright. A held lock goes stale after ttl minutes (a crashed run never blocks for long).
async function lockOp(request, env) {
  if (!checkSecret(request, env)) return new Response("Unauthorized", { status: 401 });
  const ct = request.headers.get("content-type") || "";
  const b = ct.includes("json") ? await request.json() : Object.fromEntries(await request.formData());
  const name = String(b.name || "builder").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const id = String(b.id || ""), action = String(b.action || "take");
  const ttl = Math.min(Math.max(Number(b.ttl) || 20, 1), 180) * 60e3;
  const key = "lock:" + name, now = Date.now();
  const cur = await env.PENDING.get(key, "json");
  if (action === "take") {
    if (name === "builder" && (await env.PENDING.get("builder-stop"))) return json({ ok: false, reason: "stopped by Barry" });
    if (cur && cur.id !== id && !cur.passed && now - cur.at < ttl) {
      const blocked = (await env.PENDING.get(key + ":blocked", "json")) || [];
      blocked.unshift({ id, at: now, holder: cur.id });
      await env.PENDING.put(key + ":blocked", JSON.stringify(blocked.slice(0, 20)));
      return json({ ok: false, reason: "already running", holder: cur.id, since: cur.at });
    }
    await env.PENDING.put(key, JSON.stringify({ id, at: now }));
    // Gags finished in the last 10 minutes ("ID:MODE"), so a stale read of Core can't make the next run redo one.
    const done = ((await env.PENDING.get(key + ":done", "json")) || []).filter((x) => now - x.at < 10 * 60e3);
    return json({ ok: true, recent: done.map((x) => x.job).join(",") });
  }
  if (action === "pass" || action === "free") {
    if (cur && (cur.id === id || !id)) await env.PENDING.put(key, JSON.stringify({ ...cur, passed: true, at: now }));
    const job = String(b.done || "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 60);
    if (job) { const done = ((await env.PENDING.get(key + ":done", "json")) || []).filter((x) => now - x.at < 10 * 60e3); done.push({ job, at: now }); await env.PENDING.put(key + ":done", JSON.stringify(done.slice(-30))); }
    return json({ ok: true });
  }
  return json({ ok: false, reason: "unknown action" }, 400);
}

function checkSecret(request, env) {
  const got = request.headers.get("X-Ingest-Secret") || "";   // INGEST_SECRET_NEXT is accepted too while the key is being changed
  return (!!env.INGEST_SECRET && safeEqual(got, env.INGEST_SECRET)) || (!!env.INGEST_SECRET_NEXT && safeEqual(got, env.INGEST_SECRET_NEXT));
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
  // Remember if this listing's earlier video was already posted to social, so a re-approval can skip posting again.
  const prior = items[row];
  const postedBefore = !!(prior && (prior.postedBefore || (prior.status === "approved" && prior.result && prior.result.ok)));
  items[row] = {
    postedBefore,
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
    ctx.waitUntil(notify(env, url.origin, item.product + " is live", item.social === false ? "Live on Etsy with its new video (not posted to social)." : /^EX-/.test(str(item.product)) ? "Live on Etsy and posted to Instagram and Facebook." : "Live on Etsy and posted to Pinterest, Instagram and Facebook.", "white_check_mark", "low"));
  } else {
    ctx.waitUntil(notify(env, url.origin, item.product + ": approval FAILED" + (item.result.step ? " at " + item.result.step : ""), item.result.message || "Open the app for details.", "x"));
  }
  return json({ ok: true });
}

// Daily summary from the Make "Approvals App: Daily Checks" scenario.
// Make sends raw facts; this works out what's new and raises alerts.
const MAKE_TEAM_URL = "https://eu1.make.com/2110125";

// Plain-English meaning of each Make scenario for alerts: what it does, what a failure means, what to do.
const SCENARIO_PLAIN = {
  "7896436": ["The listing builder", "builds new listings and does your updates", "the listing it was working on may be half-done, and anything queued behind it waits", "Open Alerts again tomorrow; if it repeats, ask Claude to look."],
  "7696096": ["Video start", "starts new videos rendering", "a listing may be waiting for its video", "Usually sorts itself out on the next run. If no new videos arrive, ask Claude."],
  "7687522": ["Video finish", "sends finished videos to Approvals", "a finished video may not have reached Approvals", "Check Approvals; if a video is missing, tap Remake on it, or ask Claude."],
  "7783647": ["Approve", "puts approved listings live and posts them", "an approved listing may not be live or posted yet", "Look at the listing on Etsy. If it isn't live, approve it again or ask Claude."],
  "8448188": ["Update listings helper", "reads Core for the app and saves your updates", "an update you saved may not have reached Core", "Open Update listings, tap Sync to Core and check your change is there."],
  "8451335": ["Pricing", "saves prices and updates live listings", "some listings may still have old prices", "Open Pricing and save again, or ask Claude."],
  "8438720": ["Save gag", "saves gags you write in the app", "a gag you saved may not be in Core", "Open Gags and check it's there; save it again if not."],
  "8438719": ["Gags sync", "copies your gags into the app", "the app's gag list may be out of date", "Tap Sync to Core on the Gags page."],
  "8535839": ["Nightly backup", "copies Core into the CORE_BACKUPS folder each night", "last night's backup of Core may be missing", "Nothing urgent. If it happens two nights running, ask Claude."],
  "7705176": ["Etsy tool", "a helper Claude uses to look at Etsy", "usually nothing: these are almost always Claude's own checks", "Nothing to do unless it keeps happening."],
  "7446858": ["Core tool", "a helper Claude uses to read and write Core", "usually nothing: these are almost always Claude's own checks", "Nothing to do unless it keeps happening."],
};
function whatPart(P) { return !P[1] ? "" : /^a helper/.test(P[1]) ? "This is " + P[1] + "." : "This is the part that " + P[1] + "."; }
function plainScenario(s) { const p = SCENARIO_PLAIN[String(s.id)]; return p || [String(s.name || "A Make scenario").replace(/^(Introvert Here|Mosspit Studios):\s*/, ""), "", "something may not have finished", "Open it in Make, or ask Claude to look."]; }

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
      title: daysLeft >= 0 ? `Make's login to ${c.label || "a service"} runs out in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `Make's login to ${c.label || "a service"} has run out`,
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
      const P = plainScenario(s);
      fresh.push({
        title: `${P[0]} hit ${n === 1 ? "a problem" : n + " problems"} since yesterday`,
        body: `${whatPart(P)} What it means: ${P[2]}.\nWhat to do: ${P[3]}`.trim(),
        link: `${MAKE_TEAM_URL}/scenarios/${id}/logs`,
        source: "Daily check",
      });
    }
    const prevDlq = st.dlq[id];
    if (dlq > 0 && (prevDlq === undefined || dlq > prevDlq)) {
      fresh.push({
        title: `${plainScenario(s)[0]}: ${dlq} run${dlq === 1 ? "" : "s"} stuck half-way`,
        body: `Make stopped ${dlq === 1 ? "a run" : dlq + " runs"} part-way and is holding ${dlq === 1 ? "it" : "them"}. ${whatPart(plainScenario(s))}\nWhat to do: ask Claude to check what ${dlq === 1 ? "it was" : "they were"} doing. If it's nothing important, open the link, tap Incomplete executions, tick them and Delete.`,
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

  // Release-day confirmation (Barry, 14 Nov): the 8am build should have made today's listings by now.
  const todaysRel = (data.upcoming || []).filter((u) => u.date === today);
  if (todaysRel.length && !(st.relDay === today)) {
    st.relDay = today; await env.PENDING.put("daily-state", JSON.stringify(st));
    const missing = todaysRel.filter((u) => !u.built);
    if (missing.length) fresh.push({ title: "Today's release didn't build: " + missing.map((u) => u.gag + " " + garmentName(u.type)).join(", "), body: "It was due today but isn't on Etsy yet. Check Make's Build Next Listing scenario (or ask Claude). It will build at the next run once fixed.", link: url.origin + "/calendar", source: "Release check" });
    else ctx.waitUntil(notify(env, url.origin, "Today's release is live", todaysRel.map((u) => u.gag + " " + garmentName(u.type) + (u.title ? " (" + u.title + ")" : "")).join(", "), "white_check_mark", "low"));
  }
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

// Approve from the app: calls the same Make approval link the old Approve button opened, then marks the item approved.
async function approveItem(request, env) {
  const data = await readBody(request);
  const items = await loadItems(env);
  const item = items[str(data.row)];
  if (!item || item.code !== str(data.code)) return json({ error: "That item has changed. Refresh the page." }, 409);
  if (item.status !== "pending") return json({ error: "This one has already been handled." }, 409);
  const social = str(data.social) !== "no";
  // Exclusive (Barry, 16 Nov): Instagram + Facebook only (Make skips Pinterest when ex=1), with the hashtags approved in the gag tool.
  let extra = "";
  if (/^EX-/.test(str(item.product))) {
    const M = (await env.PENDING.get(EX_META_KEY, "json")) || {}, m = M[str(item.product).replace(/-T-SHIRT$/, "")] || {};
    const tags = (m.hashtags && m.hashtags.length ? m.hashtags : ["#introverthere"]).join(" ");
    extra = "&ex=1&hashtags=" + encodeURIComponent(tags);
  }
  const res = await fetch(approveUrl(item, social) + extra, { method: "GET" });
  if (!res.ok) return json({ error: "Make didn't accept the approval (" + res.status + "). Nothing was changed." }, 502);
  item.status = "approved"; item.approvedAt = Date.now(); item.updatedAt = Date.now(); item.social = social;
  await saveItems(env, items);
  return json({ ok: true });
}

// Remake = reject, then ask for a new video once Make has marked the row REJECTED.
async function remakeItem(request, env, ctx) {
  if (!env.MAKE_ACTION_HOOK) return json({ error: "MAKE_ACTION_HOOK is not set" }, 500);
  const data = await readBody(request);
  const items = await loadItems(env);
  const item = items[str(data.row)];
  if (!item || item.code !== str(data.code)) return json({ error: "That item has changed. Refresh the page." }, 409);
  if (item.status !== "pending") return json({ error: "Only videos waiting for review can be remade." }, 409);
  const call = (action) => { const h = new URL(env.MAKE_ACTION_HOOK); h.searchParams.set("action", action); h.searchParams.set("row", item.row); h.searchParams.set("product", item.product); h.searchParams.set("code", item.code); return fetch(h.toString()); };
  const res = await call("reject");
  if (!res.ok) return json({ error: "Make didn't accept the request (" + res.status + "). Nothing was changed." }, 502);
  item.status = "rerendering"; item.updatedAt = Date.now();
  await saveItems(env, items);
  ctx.waitUntil(new Promise((r) => setTimeout(r, 20000)).then(() => call("rerender")).catch(() => {}));
  return json({ ok: true });
}

// Scrap a listing that isn't live (Barry, 16 Nov): Printify product (which also removes the Etsy draft), its Core
// registry and listing-tags rows, and the Approvals card. Optionally clears the gag (text, title, status, tags) so it
// can be rewritten in the same space - only when none of its other garments are built.
async function scrapListing(request, env) {
  const d = await readBody(request);
  const items = await loadItems(env), item = items[str(d.row)];
  if (!item || item.code !== str(d.code)) return json({ error: "That card has changed - refresh the page." }, 409);
  if (!["pending", "rejected"].includes(item.status)) return json({ error: "Only listings that haven't gone live can be scrapped here." }, 409);
  const product = str(item.product), WB = CORE_ITEM + "/workbook", regIdx = Number(item.row) - 2, done = [];
  try {
    const rr = await coreTool(env, WB + "/tables/LISTING_REGISTRY_TABLE/rows/itemAt(index=" + regIdx + ")?$select=values");
    const v = rr && rr.values && rr.values[0];
    if (!v || str(v[0]) !== product) return json({ error: "Core's registry has changed since this card was made. Nothing was deleted; ask Claude to scrap it." }, 409);
    const pid = str(v[8]).replace(/\\/g, ""), eid = str(v[6]).replace(/\D/g, "");
    if (pid) { try { await coreTool(env, "/v1/shops/27154106/products/" + pid + ".json", "DELETE"); done.push("Printify"); } catch (e) { if (!/404|not found/i.test(e.message)) throw e; } }
    if (eid) {   // normally already gone with the Printify product; this catches a draft left behind
      const token = await env.SECRETS.get("make_token");
      await fetch(MAKE_API + "/scenarios/7705176/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" }, body: JSON.stringify({ responsive: true, data: { path: "/listings/" + eid, method: "DELETE" } }) }).catch(() => {});
      done.push("Etsy");
    }
    const lt = await coreTool(env, WB + "/tables/LISTING_TAGS/columns/PRODUCT_CODE/dataBodyRange?$select=values");
    const lti = ((lt && lt.values) || []).map((x, i) => (str(x[0]) === product ? i : -1)).filter((i) => i >= 0).reverse();
    for (const i of lti) await coreTool(env, WB + "/tables/LISTING_TAGS/rows/itemAt(index=" + i + ")", "DELETE");
    await coreTool(env, WB + "/tables/LISTING_REGISTRY_TABLE/rows/itemAt(index=" + regIdx + ")", "DELETE");
    done.push("Core registry");
    // Approvals cards are keyed by registry row: everything below the deleted row moves up one.
    const out = {};
    for (const [k, it] of Object.entries(items)) { const n = Number(k); if (n === Number(item.row)) continue; if (n > Number(item.row)) { it.row = String(n - 1); out[String(n - 1)] = it; } else out[k] = it; }
    await saveItems(env, out);
    let gagMsg = "";
    if (d.clearGag) {
      const gagId = product.replace(/-(T-SHIRT|LONG-SLEEVE|SWEATSHIRT|HOODIE)$/, "");
      const reg = await coreTool(env, WB + "/tables/LISTING_REGISTRY_TABLE/columns/PRODUCT_CODE/dataBodyRange?$select=values");
      const others = ((reg && reg.values) || []).map((x) => str(x[0])).filter((c) => c.indexOf(gagId + "-") === 0);
      if (others.length) gagMsg = " The gag was kept: " + others.join(", ") + " still use it.";
      else {
        const ids = await coreTool(env, WB + "/tables/GAGS_TABLE/columns/GAG_ID/dataBodyRange?$select=values");
        const gi = ((ids && ids.values) || []).findIndex((x) => str(x[0]) === gagId);
        if (gi >= 0) {
          const ops = [];
          GAG_CLEAR_COLS.concat(["GAG_HEADER", "GAG_BODY", "GAG_FOOTER"]).forEach((c) => ops.push(amendCell("GAGS_TABLE", c, gi, "")));
          TAG_CLEAR_COLS.forEach((c) => ops.push(amendCell("GAG_TAGS", c, gi, "")));
          const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
          gagMsg = err ? " The gag couldn't be cleared - ask Claude." : " " + gagId + " is cleared; write the new version and it fills that space.";
        }
      }
      if (env.MAKE_GAGSYNC_HOOK) await fetch(env.MAKE_GAGSYNC_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "scrap" }) }).catch(() => {});
    }
    await logSetting(env, "Scrapped listing " + product + (d.clearGag ? " (gag cleared)" : ""), null);
    return json({ ok: true, message: product + " scrapped." + gagMsg });
  } catch (e) {
    return json({ error: "Scrapping stopped part-way" + (done.length ? " (done: " + done.join(", ") + ")" : "") + ": " + e.message + ". Ask Claude to finish it." }, 502);
  }
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

function approveUrl(item, social = true) {
  const q = (v) => encodeURIComponent(v);
  return `${APPROVE_HOOK}?code=${q(item.code)}&row=${q(item.row)}&product=${q(item.product)}&file=${q(item.file)}${social ? "" : "&social=no"}`;
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
input:focus-visible,textarea:focus-visible,select:focus-visible{outline-offset:0}
/* top bar */
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:calc(12px + env(safe-area-inset-top,0px)) 0 12px;margin-bottom:6px}
.topbar::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:100vw;transform:translateX(-50%);background:linear-gradient(rgba(8,8,8,.94),rgba(8,8,8,.7));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line);z-index:-1}
.topbar .home{display:block;line-height:0}
.topbar .home img{height:50px;width:auto;display:block}
.topbar .home .mark{display:none;height:44px;width:44px;border-radius:12px}
.topbar .sect{font:900 20px/1 var(--display);letter-spacing:.08em;text-transform:uppercase;padding-left:16px;border-left:2px solid var(--line);margin-left:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pagehead{align-items:center;margin:4px 0 14px}
.topbar .sp{flex:1}
.topbar .sect .short{display:none}
.stopbtn{flex:none;min-height:46px;padding:0 22px;border-radius:99px;border:2px solid #d9534f;background:rgba(217,83,79,.14);color:#ff8a85;font:900 13px var(--display);letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
.stopbtn.resume{border-color:#e6b450;background:rgba(230,180,80,.18);color:#f0c870;animation:pulse 2s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(230,180,80,.15)}}
@media (max-width:560px){.stopbtn{padding:0 14px;min-height:40px;font-size:11px}}
.stopsheet .opt{display:block;width:100%;text-align:left;padding:16px;margin-top:10px;border-radius:14px;border:1.5px solid var(--line);background:var(--field);color:var(--text);cursor:pointer;font:600 15px var(--body)}
.stopsheet .opt b{display:block;font:800 14px var(--display);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}
.stopsheet .opt.red{border-color:#d9534f}
.topbar .when{font:600 12px var(--body);color:var(--muted);text-align:right;line-height:1.3}
.topbar .when b{display:block;color:var(--text);font:800 12px var(--display);letter-spacing:.14em;text-transform:uppercase}
.iconbtn{position:relative;width:48px;height:48px;border-radius:14px;border:2px solid var(--line);background:var(--card);display:grid;place-items:center;color:var(--text);text-decoration:none;flex:none}
.iconbtn svg{width:26px;height:26px}
.iconbtn .n{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;border-radius:11px;background:var(--warn);color:#1a0d0a;font:800 12px var(--display);display:grid;place-items:center;padding:0 6px}
.pagehead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 18px}
.pagehead{position:sticky;top:var(--topbar,72px);z-index:19;margin-top:-6px;padding:10px 0}
.pagehead::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:100vw;transform:translateX(-50%);background:rgba(8,8,8,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:-1}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font:700 12px var(--display);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;min-height:40px}
.back svg{width:18px;height:18px}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.brand{display:flex;flex-direction:column;gap:2px;min-width:0}
.logo{display:none}
.actions{display:flex;gap:8px;flex-wrap:wrap}
h1{font:900 clamp(26px,4.6vw,40px)/1.05 var(--display);letter-spacing:.04em;text-transform:uppercase;margin:0;text-wrap:balance}
h2{font:800 12px var(--display);color:var(--muted);margin:30px 0 12px;text-transform:uppercase;letter-spacing:.2em;display:flex;align-items:center;gap:12px}
h2::after{content:"";flex:1;height:1px;background:var(--line)}
h2.rngh .dsync{order:2;min-height:38px;padding:0 14px;font-size:11px;letter-spacing:.12em;flex:none}h2.rngh .dsync svg{width:16px;height:16px}
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
.keybox{display:block;width:100%;margin:6px 0 14px;padding:12px;font:500 13px var(--mono);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);resize:vertical}
input[type=password]{width:100%;min-height:52px;padding:0 14px;font:17px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);margin:10px 0 14px}
.err{color:var(--warn)}
/* dashboard */
.needs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.allclear{display:flex;align-items:center;gap:14px;margin:22px 0 4px;padding:14px 18px;border-radius:var(--r);border:1px solid rgba(143,208,171,.35);background:var(--ok-bg);color:var(--ok)}
.allclear svg{width:28px;height:28px;flex:none}.allclear b{display:block;font:800 15px var(--display);color:var(--text)}.allclear span{font-size:13px}
.need{display:flex;align-items:center;gap:14px;padding:16px;border-radius:var(--r);background:var(--card2);border:1px solid var(--line);text-decoration:none;color:var(--text);min-height:86px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.need .big{font:900 34px/1 var(--display);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.need .t{display:block;font:700 15px var(--display);letter-spacing:.02em}
.need .s{display:block;font-size:13px;color:var(--muted)}
.need.hot{border-color:var(--frame);box-shadow:inset 0 0 0 1px var(--frame)}
.need.warn .big{color:var(--warn)}
.need.run .big{color:var(--info)}
.need.quiet .big{color:var(--dim)}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.tiles .tile,.tiles .tile.primary{grid-column:span 1}
.tiles .tile.tall{grid-row:span 2}
.quickbar{display:flex;align-items:center;gap:16px;padding:18px 20px;margin:0 0 12px;border-radius:var(--r);background:var(--accent);color:#141413;text-decoration:none;border:2px solid var(--accent);transition:transform .15s}
.quickbar:hover{transform:translateY(-2px)}
.quickbar .ic{width:48px;height:48px;border-radius:13px;background:#141413;color:var(--accent);display:grid;place-items:center;flex:none}.quickbar .ic svg{width:28px;height:28px}
.quickbar .nm{display:block;font:800 16px var(--display);letter-spacing:.08em;text-transform:uppercase}
.quickbar .st{display:block;font-size:13px;margin-top:3px;color:#2b2a27}
.quickbar .qgo{margin-left:auto;font:800 13px var(--display);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;padding:10px 16px;border-radius:99px;background:#141413;color:var(--accent)}
@media (max-width:560px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"cal gags" "stats gags" "appr list" "ord list" "cred tags" "set links"}
  /* Phone (Barry, 14 Nov): the tiles he uses most sit in the right-hand column, under his right thumb. */
  .tiles [data-tile="/gags"]{grid-area:gags}.tiles [data-tile="/listings"]{grid-area:list}.tiles [data-tile="/tags"]{grid-area:tags}
  .tiles [data-tile="/calendar"]{grid-area:cal}.tiles [data-tile="/stats"]{grid-area:stats}.tiles [data-tile="/approvals"]{grid-area:appr}
  .tiles [data-tile="/orders"]{grid-area:ord}.tiles [data-tile="/credits"]{grid-area:cred}.tiles [data-tile="/settings"]{grid-area:set}.tiles [data-tile="/links"]{grid-area:links}
  .tiles [data-tile="/settings"].primary:not(.hot){background:var(--card);border-color:rgba(242,240,235,.5)}.tiles [data-tile="/settings"] .dots{display:none}
  .tiles [data-tile="/links"]:not(.hot){background:#3a3a36;border-color:rgba(242,240,235,.7)}}
.tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:16px;min-height:150px;border-radius:var(--r);border:2px solid rgba(242,240,235,.5);background:var(--card);color:var(--text);text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:border-color .15s,transform .15s}
.tile:hover{border-color:var(--frame);transform:translateY(-2px)}
.tile .ic{width:48px;height:48px;border-radius:13px;background:var(--frame);color:#0d0d0c;display:grid;place-items:center}
.tile .ic svg{width:28px;height:28px}
.tile .nm{font:800 15px var(--display);letter-spacing:.08em;text-transform:uppercase}
.tile .st{font-size:13px;color:var(--muted);margin-top:auto}
.tile .st b{color:var(--text);font-weight:600}
.tile .dots{position:absolute;right:14px;top:16px;display:flex;gap:5px;padding:5px 8px;border:1.5px solid rgba(242,240,235,.4);border-radius:99px}
.tile .dots i{width:5px;height:5px;border-radius:50%;background:rgba(242,240,235,.55)}
/* Most-used tiles (the four corners): soft grey so they stand out without glare. */
.tile.primary{background:#3a3a36;border-color:rgba(242,240,235,.7);color:var(--text)}
.tile.primary:hover{border-color:var(--frame)}
.tile.primary .st{color:#c9c6bf}.tile.primary .st b{color:var(--text)}
.tile.hot{border-color:#e0605a;background:rgba(150,40,34,.32)}.tile.hot:hover{border-color:#ff8a85}
.tile.hot .ic{background:#e0605a;color:#fff}
.hotb{position:absolute;right:14px;top:14px;min-width:30px;height:30px;padding:0 9px;border-radius:99px;background:#e0605a;color:#fff;font:800 13px var(--display);display:grid;place-items:center;letter-spacing:.04em}
.need{position:relative}.nread{margin-left:auto;flex:none;min-height:38px;padding:0 14px;border-radius:99px;border:1.5px solid var(--line);background:rgba(0,0,0,.35);color:var(--text);font:800 11px var(--display);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.ranges{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.ranges{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:420px){.ranges{grid-template-columns:1fr}}
.rng{padding:16px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px;text-decoration:none;color:var(--text);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rng{position:relative}.rlbtn{position:absolute;top:10px;right:10px;min-height:34px;padding:0 12px;border-radius:99px;border:1.5px solid var(--line);background:rgba(0,0,0,.45);color:var(--text);font:800 11px var(--display);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;z-index:2}
.rng img{width:100%;max-width:240px;height:auto;display:block}
.rng .row{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px}
.rng .row b{color:var(--text);font:700 13px var(--display);letter-spacing:.04em}
.rng .row b.low{color:var(--warn)}
.rbar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.rbar i{display:block;height:100%;border-radius:99px}
.foot{font:500 12px var(--mono);color:var(--dim);text-align:center;margin:36px 0 0}
.today{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr);gap:12px}
.tdcell{text-decoration:none;color:var(--text)}.tdcell:hover{border-color:var(--frame)}
@media (max-width:620px){.today{grid-template-columns:1fr 1fr}.today .tcell:first-child{grid-column:1/-1}}
.tcell{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:6px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.tcell .tl{font:800 11px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.tcell a{color:var(--text);text-decoration:none;font-size:14px}.tcell a b{font-family:var(--display)}
.tbig{font:900 30px/1 var(--display);font-variant-numeric:tabular-nums}
.tok{color:var(--ok);font-size:12px;font-weight:600}.tno{color:var(--warn);font-size:12px;font-weight:600}
/* bottom bar (phones) */
.trialc{border:2px solid #e6b450!important}
.fabsave{position:fixed;left:max(20px,env(safe-area-inset-left,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:28;width:auto!important;min-height:62px;padding:0 30px;border-radius:99px;box-shadow:0 10px 28px rgba(0,0,0,.55)}
@media (max-width:760px){.fabsave{bottom:calc(92px + env(safe-area-inset-bottom,0px))}}
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:none;background:rgba(8,8,8,.95);border-top:1px solid var(--line);padding:8px max(10px,env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.tabbar .in{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:560px;margin:0 auto}
.tabbar a{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;min-height:58px;border-radius:12px;color:var(--muted);font:700 10px var(--display);letter-spacing:.1em;text-transform:uppercase;text-decoration:none}
.tabbar a svg{width:26px;height:26px}
.tabbar a.on{color:var(--text);background:rgba(255,255,255,.07)}
.tabbar a .n{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;border-radius:9px;background:var(--warn);color:#1a0d0a;font:800 10px var(--display);display:grid;place-items:center;padding:0 5px}
/* more sheet */
.sheet{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.6);display:none;align-items:flex-end}
.sheet.open{display:flex}
@media (min-width:761px){#sheet{justify-content:center}#sheet .pane{max-width:820px;grid-template-columns:repeat(4,1fr);border-radius:20px 20px 0 0}}
.sheet .pane{width:100%;background:#141413;border-top:2px solid var(--frame);border-radius:20px 20px 0 0;padding:18px max(16px,env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sheet .pane a{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 6px;border:1.5px solid var(--line);border-radius:14px;text-decoration:none;color:var(--text);font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase}
.sheet .pane a svg{width:28px;height:28px}
/* find a gag */
.find{align-items:flex-start}
.findpane{display:flex!important;flex-direction:column;gap:12px;max-width:760px;margin:0 auto;border-radius:0 0 20px 20px;border-top:0;border-bottom:2px solid var(--frame);padding-top:calc(16px + env(safe-area-inset-top,0px));max-height:85vh}
.findbar{display:flex;align-items:center;gap:10px}.findbar svg{width:24px;height:24px;flex:none;color:var(--muted)}
.findbar input{flex:1;min-width:0;min-height:52px;padding:0 14px;font:16px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}
.findr{overflow:auto;display:flex;flex-direction:column;gap:6px}
.sheet .pane a.fr{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:2px 12px;padding:12px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--text);background:rgba(255,255,255,.03);text-align:left;text-transform:none;letter-spacing:0;font:400 14px var(--body)}
.sheet .pane a.fr:hover{border-color:var(--frame)}
.frid{grid-row:span 2;font:500 12px var(--mono);color:var(--muted);align-self:center}
.fr b{font:700 15px var(--display)}
.rlhead,.sheet .pane .rlrow{display:grid;grid-template-columns:96px minmax(0,1fr) 128px auto;gap:12px;align-items:start}
.rlhead{font:800 11px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:0 12px 4px}
.sheet .pane .rlrow{padding:12px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--text);background:rgba(255,255,255,.03);text-transform:none;letter-spacing:0;font:400 14px var(--body)}
.rltx{white-space:pre-line;line-height:1.35;color:var(--text);text-decoration:none}.rld{font:600 13px var(--body);text-align:right}
.sheet .pane .rlrow a.rltx{display:block;border:0;padding:0;margin:0;background:none;min-height:0;font:400 14px var(--body);text-transform:none;letter-spacing:0;text-align:left;color:var(--text);box-shadow:none;border-radius:0;justify-content:flex-start}
.sheet .pane .rlacts a{min-height:0;display:inline-block}
.rlbar[hidden]{display:none!important}
.rlside{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.rlstars{display:flex;gap:2px}.rlstars button{background:none;border:0;padding:2px;font-size:20px;line-height:1;color:rgba(242,240,235,.25);cursor:pointer}.rlstars button.on{color:#f0c870}
.rlacts{display:flex;gap:6px}.rlacts a,.rlacts button{font:700 12px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--field);color:var(--text);text-decoration:none;cursor:pointer}
.rlacts .del{color:#ff9a8a;border-color:rgba(255,154,138,.4)}
.rlsort{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px;font-size:13px;color:var(--muted)}.rlsort button{font:600 13px var(--body);padding:6px 12px;border-radius:99px;border:1px solid var(--line);background:var(--field);color:var(--muted);cursor:pointer}.rlsort button.on{background:var(--accent);color:#141413;border-color:var(--accent)}
.st-live .rld{color:#7fd39a}.st-soon .rld{color:#f0c870}.st-later .rld{color:#f08a85}
@media (max-width:600px){.rlhead,.sheet .pane .rlrow{grid-template-columns:70px minmax(0,1fr)}.rld{text-align:left}.rlside{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center}}
.rlbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;margin:0 0 10px;border:1px solid var(--line);border-radius:12px;background:rgba(14,14,13,.97)}
.rlbar span{flex:1;min-width:200px;font:600 14px var(--body)}.rlbar .btn-main{width:auto;min-height:46px;padding:0 20px}
#rlist.swapping .rlrow .frid::before{content:"";display:inline-block;width:16px;height:16px;margin-right:8px;vertical-align:-3px;border:2px solid var(--muted);border-radius:5px}
#rlist.swapping .rlrow.sel{background:rgba(127,211,154,.12);border-color:#7fd39a}
#rlist.swapping .rlrow.sel .frid::before{background:#7fd39a;border-color:#7fd39a;box-shadow:inset 0 0 0 3px #111}
#rlist.swapping .rlrow.nopick{opacity:.35}#rlist.swapping .rlrow.nopick .frid::before{visibility:hidden}
#rlS.on{border-color:#7fd39a;color:#7fd39a}
.st-live{border-left:5px solid #5fbf7f!important}.st-soon{border-left:5px solid #e6b450!important}.st-later{border-left:5px solid #e0605a!important}
.stpill{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:99px;font:700 10px var(--display);letter-spacing:.06em;text-transform:uppercase;vertical-align:middle}
.st-live .stpill{background:rgba(95,191,127,.18);color:#7fd39a}.st-soon .stpill{background:rgba(230,180,80,.18);color:#f0c870}.st-later .stpill{background:rgba(224,96,90,.16);color:#f08a85}.frt{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* toast */
.toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);z-index:50;background:var(--frame);color:#0d0d0c;font:800 13px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:14px 20px;border-radius:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:calc(100vw - 32px);text-align:center}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast.bad{background:var(--warn)}
@media (min-width:761px){.toast{bottom:28px}}
@media (max-width:760px){
  .tabbar{display:block}.moretop{display:none!important}
  .topbar .when{display:none}
  .topbar .home img{height:38px}
  .topbar .sect{font-size:17px;padding-left:12px}
}
@media (max-width:560px){
  .topbar .home #logo{display:none}
  .topbar .home .mark{display:block}
  /* Phone: give the page name the room (Barry, 14 Nov) */
  .topbar{gap:8px}.topbar .sp{display:none}
  .topbar .sect{flex:1 1 auto;font-size:15px;letter-spacing:.03em;padding-left:10px}
  .topbar .sect .short{display:none}.topbar .sect .short+.full,.topbar .sect .full:has(+.short){display:none}.topbar .sect .full:has(+.short)+.short{display:inline}
  .topbar .stopbtn{padding:0 10px;letter-spacing:.06em}
  .topbar .iconbtn{width:40px;height:40px;border-radius:12px}
  .topbar .home .mark{height:40px;width:40px}
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
<symbol id="i-search" viewBox="0 0 32 32"><circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M21 21l7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></symbol>
<symbol id="i-todo" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M9.5 16.5l4 4 9-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-back" viewBox="0 0 32 32"><path d="M19 7l-9 9 9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-credits" viewBox="0 0 32 32"><path d="M5 22a11 11 0 1 1 22 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M16 22l6-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="22" r="2.4" fill="currentColor"/></symbol>
<symbol id="i-cal" viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M4 13h24M11 3.5v5M21 3.5v5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="9" y="17" width="5" height="4.5" rx="1.2" fill="currentColor"/></symbol>
<symbol id="i-check" viewBox="0 0 32 32"><path d="M7 16.5l6 6L25 10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-person" viewBox="0 0 32 32"><circle cx="16" cy="6" r="4" fill="currentColor"/><rect x="11.5" y="11.5" width="9" height="11" rx="3" fill="currentColor"/><rect x="11.5" y="18" width="3.8" height="12" rx="1.9" fill="currentColor"/><rect x="16.7" y="18" width="3.8" height="12" rx="1.9" fill="currentColor"/></symbol>
</defs></svg>`;
const icon = (id, cls = "") => `<svg${cls ? ` class="${cls}"` : ""}><use href="#i-${id}"/></svg>`;

const NAV_TABS = [["/", "home", "Home"], ["/approvals", "approve", "Approve"], ["/gags", "gags", "Gags"], ["/listings", "update", "Listings"]];
const NAV_MORE = [["/today", "home", "Today"], ["/calendar", "cal", "Calendar"], ["/health", "check", "Weekly check"], ["/settings", "tools", "Settings"], ["/reviews", "stats", "Reviews"], ["/quiet", "search", "Quiet listings"], ["/copywatch", "search", "Copy watch"], ["/todo", "todo", "To-do"], ["/tags", "tags", "Tags"], ["/orders", "orders", "Orders"], ["/stats", "stats", "Stats"], ["/credits", "credits", "Credits"], ["/check", "check", "Check for problems"], ["/links", "links", "Links"], ["/alerts", "bell", "Alerts"]];

function shell(body, manifestUrl = "/manifest.webmanifest") {
  const tabs = NAV_TABS.map(([href, ic, label]) => `<a href="${href}" data-tab="${href}">${icon(ic)}${label}</a>`).join("");
  const more = NAV_MORE.map(([href, ic, label]) => `<a href="${href}">${icon(ic)}${label}</a>`).join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
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
<div class="sheet stopsheet" id="stopSheet"><div class="pane" style="max-width:560px;margin:0 auto;display:block"><div style="font:800 18px var(--display)" id="stopT">Emergency stop</div><div class="small" id="stopB" style="margin-top:6px"></div><div id="stopOpts"></div><button class="btn" type="button" id="stopNo" style="width:100%;margin-top:12px">Never mind</button></div></div>
<div class="sheet find" id="rlist"><div class="pane findpane"><div class="findbar"><b id="rlT" style="flex:1;font:800 16px var(--display)">Gags</b><button class="btn" id="rlS" type="button">Swap</button><button class="btn" id="rlX" type="button">Close</button></div><div class="small" id="rlHelp" style="margin:0 0 8px">Green live · amber releasing within 2 weeks · red scheduled later. Tap the stars to rate a gag.</div><div id="rlBar" class="rlbar" hidden></div><div id="rlR" class="findr"></div></div></div>
<div class="sheet find" id="find"><div class="pane findpane"><div class="findbar">${icon("search")}<input id="findQ" placeholder="Find anything: a gag, page, to-do, order or listing" autocomplete="off" enterkeyhint="search"><button class="btn" id="findX" type="button">Close</button></div><div id="findR" class="findr"></div></div></div>
<script>
(function () {
  // Emergency stop button (centre of the top bar).
  (function () {
    var btn = document.getElementById("stopBtn"), sh = document.getElementById("stopSheet"); if (!btn) return;
    function post(u, b) { return fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
    function show(st) { btn.hidden = false; btn.classList.toggle("resume", !!st.at); btn.textContent = st.at ? "Stopped · Resume" : "Stop"; btn.dataset.on = st.at ? "1" : ""; }
    fetch("/api/stop-state").then(function (r) { return r.ok ? r.json() : null; }).then(function (st) { if (st) show(st); }).catch(function () {});
    function opt(cls, title, text, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "opt " + cls; b.innerHTML = "<b>" + title + "</b>" + text; b.onclick = fn; return b; }
    function close() { sh.classList.remove("open"); }
    document.getElementById("stopNo").onclick = close; sh.addEventListener("click", function (e) { if (e.target === sh) close(); });
    btn.onclick = function () {
      var o = document.getElementById("stopOpts"); o.innerHTML = "";
      if (btn.dataset.on) {
        document.getElementById("stopT").textContent = "Stopped";
        document.getElementById("stopB").textContent = "Carry on with what was queued, or throw it away. Either way the builder starts working again.";
        o.appendChild(opt("", "Resume", "Carry on with anything still queued.", function () { post("/api/resume").then(function (j) { close(); toast(j.queued ? "Resumed: carrying on with " + j.queued + " queued gag" + (j.queued === 1 ? "" : "s") : "Resumed"); show({}); }); }));
        o.appendChild(opt("red", "Cancel the queued updates, then resume", "Throw away whatever was waiting so it never happens, then switch the builder back on for normal work (like tomorrow's new listings).", function () { post("/api/stop", { mode: "cancel" }).then(function (j) { return post("/api/resume").then(function () { close(); toast("Cancelled" + (j.cleared ? " " + j.cleared + " queued gag" + (j.cleared === 1 ? "" : "s") : "") + ". Builder back on."); show({}); }); }); }));
      } else {
        document.getElementById("stopT").textContent = "Emergency stop"; document.getElementById("stopB").textContent = "Stops the listing builder before it starts anything new. If it's halfway through a gag, it finishes that one gag (up to 8 minutes) and then stops.";
        o.appendChild(opt("", "Pause", "Stop for now. Anything queued waits until you tap Resume.", function () { post("/api/stop", { mode: "pause" }).then(function () { close(); toast("Stopped. Tap Resume when you're ready."); show({ at: 1 }); }); }));
        o.appendChild(opt("red", "Pause and cancel", "Stop, and throw away the queued updates so they never happen. Changes already saved in Core (like a new title) stay.", function () { post("/api/stop", { mode: "cancel" }).then(function (j) { close(); toast("Stopped and cancelled" + (j.cleared ? " (" + j.cleared + " gag" + (j.cleared === 1 ? "" : "s") + ")" : "")); show({ at: 1 }); }); }));
      }
      sh.classList.add("open");
    };
  })();
  var p = location.pathname, on = null;
  // Freeze the "Dashboard" row just under the top bar; anything else sticky sits below both.
  function sticky() { var t = document.querySelector(".topbar"), h = document.querySelector(".pagehead");
    var th = t ? t.offsetHeight : 0, hh = h ? h.offsetHeight : 0;
    document.documentElement.style.setProperty("--topbar", th + "px"); document.documentElement.style.setProperty("--stick", (th + hh) + "px"); }
  sticky(); window.addEventListener("resize", sticky);
  document.querySelectorAll(".tabbar [data-tab]").forEach(function (a) { var t = a.dataset.tab; if (t === p || (t !== "/" && p.indexOf(t) === 0)) on = a; });
  if (on) on.classList.add("on"); else if (p !== "/") document.getElementById("moreBtn").classList.add("on");
  var sh = document.getElementById("sheet");
  document.getElementById("moreBtn").addEventListener("click", function (e) { e.preventDefault(); sh.classList.add("open"); });
  var mt = document.getElementById("moreTop"); if (mt) mt.addEventListener("click", function () { sh.classList.add("open"); });
  sh.addEventListener("click", function (e) { if (e.target === sh) sh.classList.remove("open"); });
  var n = document.body.dataset.alerts; if (n && Number(n) > 0) { var b = document.querySelector('.tabbar [data-tab="/"]'); }
  // Find a gag (search button in the top bar)
  var F = document.getElementById("find"), FQ = document.getElementById("findQ"), FR = document.getElementById("findR"), data = null, SX = null;
  function esc2(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // Live (green), releasing within 2 weeks or part-released (amber), scheduled later (red).
  function gagState(g, d) {
    if (g.status === "LIVE_EXISTING") return { c: "live", t: "Live", first: "" };
    var e = null; (d.editable || []).some(function (x) { if (x.id === g.id) { e = x; return true; } return false; });
    var ds = (e && e.dates || []).filter(Boolean).sort(), first = ds[0] || "";
    var today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    var nice = first ? new Date(first + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: first.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined }) : "No date";
    if (first && first <= soon) return { c: "soon", t: (first <= today ? "Releasing now" : "Soon · " + nice), first: first };
    return { c: "later", t: nice, first: first };
  }
  window.gagState = gagState;
  function editHref(g, d) { var ed = (d.editable || []).some(function (x) { return x.id === g.id; }); return ed ? "/gags?edit=" + encodeURIComponent(g.id) : "/gag/" + encodeURIComponent(g.id); }
  window.gagEditHref = editHref;
  function run() {
    var q = FQ.value.trim().toLowerCase();
    if (!data) { FR.innerHTML = '<p class="small">Loading…</p>'; return; }
    var cats = {}; (data.editable || []).forEach(function (e) { cats[e.id] = e.category || ""; });
    var hits = (data.all || []).filter(function (g) { return !q || (g.id + " " + g.stem + " " + g.text + " " + (cats[g.id] || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 40);
    var other = q ? (SX || []).filter(function (x) { return (x.k + " " + x.t).toLowerCase().indexOf(q) >= 0; }).slice(0, 15) : [];
    var otherHtml = other.map(function (x) { return '<a class="fr" href="' + esc2(x.h) + '"' + (x.h.indexOf("http") === 0 ? ' target="_blank" rel="noopener"' : "") + '><span class="frid">' + esc2(x.k) + "</span><b>" + esc2(x.t) + "</b></a>"; }).join("");
    if (!hits.length && otherHtml) { FR.innerHTML = otherHtml; return; }
    FR.innerHTML = (otherHtml ? otherHtml : "") + (hits.length ? hits.map(function (g) { var st = gagState(g, data); return '<a class="fr st-' + st.c + '" href="/gag/' + encodeURIComponent(g.id) + '"><span class="frid">' + esc2(g.id) + '</span><b>' + esc2(g.stem || "") + ' <span class="stpill">' + esc2(st.t) + '</span></b><span class="frt">' + esc2(String(g.text || "").replace(/\\s+/g, " ")) + '</span></a>'; }).join("") : '<p class="small">No gags match “' + esc2(FQ.value) + '”.</p>');
  }
  var fb = document.getElementById("findBtn");
  if (fb) fb.addEventListener("click", function () { F.classList.add("open"); setTimeout(function () { FQ.focus(); }, 50);
    if (!SX) fetch("/api/search-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { SX = (d && d.items) || []; run(); }).catch(function () { SX = []; });
    if (!data) fetch("/api/gags-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { data = d || { all: [] }; run(); }); else run(); });
  document.getElementById("findX").addEventListener("click", function () { F.classList.remove("open"); });
  F.addEventListener("click", function (e) { if (e.target === F) F.classList.remove("open"); });
  FQ.addEventListener("input", run);
  // Range list (button on each range card on the dashboard).
  var RL = document.getElementById("rlist");
  var rlCode = "", swapOn = false, picked = [];
  function canSwap(g) { var e = null; (data.editable || []).some(function (x) { if (x.id === g.id) { e = x; return true; } return false; });
    return !!(e && e.dates && e.dates.length === 4 && e.dates.every(Boolean)); }
  function rlNice(id) { var st = null; (data.all || []).some(function (g) { if (g.id === id) { st = gagState(g, data); return true; } return false; }); return id + " (" + (st ? st.t.replace("Soon · ", "") : "") + ")"; }
  function rlBar() { var bar = document.getElementById("rlBar"); RL.classList.toggle("swapping", swapOn); document.getElementById("rlS").classList.toggle("on", swapOn);
    document.getElementById("rlHelp").style.display = swapOn ? "none" : "";
    if (!swapOn) { bar.hidden = true; return; } bar.hidden = false;
    bar.innerHTML = picked.length < 2 ? '<span>' + (picked.length ? "Now tick the second gag." : "Tick two unreleased gags to swap their release dates.") + '</span><button class="btn" type="button" id="rlCancel">Cancel</button>'
      : '<span>Swap ' + esc2(rlNice(picked[0])) + ' ↔ ' + esc2(rlNice(picked[1])) + '?</span><button class="btn-main" type="button" id="rlGo">Swap dates</button><button class="btn" type="button" id="rlCancel">Cancel</button>';
    document.getElementById("rlCancel").onclick = function () { swapOn = false; picked = []; rlDraw(); };
    var go = document.getElementById("rlGo"); if (go) go.onclick = function () { go.disabled = true; go.textContent = "Swapping…";
      fetch("/api/gag-swap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: picked[0], b: picked[1] }) })
        .then(function (r) { return r.json().then(function (o) { return { ok: r.ok, o: o }; }); })
        .then(function (x) { if (!x.ok) { go.disabled = false; go.textContent = "Swap dates"; alert(x.o.error || "Swap failed"); return; }
          [x.o.a, x.o.b].forEach(function (n) { (data.editable || []).forEach(function (e) { if (e.id === n.id) e.dates = n.dates; }); });
          swapOn = false; picked = []; rlDraw(); if (window.toast) window.toast("Swapped. Core updates in about a minute."); })
        .catch(function () { go.disabled = false; go.textContent = "Swap dates"; alert("Couldn't reach the app. Nothing was changed."); }); }; }
  var rlSort = "date";
  function fromHref(h) { return h + (h.indexOf("?") >= 0 ? "&" : "?") + "from=" + rlCode; }
  function rlDraw() {
    var ST = data.stars || {};
    var list = (data.all || []).filter(function (g) { return g.id.indexOf(rlCode + "-") === 0 && String(g.text || "").trim(); }).map(function (g) { return { g: g, st: gagState(g, data) }; });
    list.sort(function (a, b) { var ka = a.st.c === "live" ? "0" : (a.st.first ? "1" + a.st.first : "2"), kb = b.st.c === "live" ? "0" : (b.st.first ? "1" + b.st.first : "2"); return ka < kb ? -1 : ka > kb ? 1 : (a.g.id < b.g.id ? -1 : 1); });
    if (rlSort === "stars") list.sort(function (a, b) { var x = ST[a.g.id] || 9, y = ST[b.g.id] || 9; return x - y; });   // lowest rated first; unrated last
    if (rlSort === "code") list.sort(function (a, b) { return a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0; });   // IH-00001, IH-00002… (Barry, 16 Nov)
    var today = new Date().toISOString().slice(0, 10), soon2 = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    var sortBar = '<div class="rlsort">Sort by <button type="button" data-rlsort="date" class="' + (rlSort === "date" ? "on" : "") + '">Release date</button><button type="button" data-rlsort="stars" class="' + (rlSort === "stars" ? "on" : "") + '">Lowest rated first</button><button type="button" data-rlsort="code" class="' + (rlSort === "code" ? "on" : "") + '">Code order</button></div>';
    document.getElementById("rlR").innerHTML = list.length ? sortBar + list.map(function (x) { var g = x.g, st = x.st, n = ST[g.id] || 0;
      var ed = (data.editable || []).some(function (e) { return e.id === g.id; }), canDel = ed && !(st.first && st.first <= soon2);
      var cls = "rlrow st-" + st.c + (swapOn ? (canSwap(g) ? (picked.indexOf(g.id) >= 0 ? " sel" : "") : " nopick") : "");
      var stars = '<span class="rlstars">' + [1, 2, 3, 4, 5].map(function (k) { return '<button type="button" data-rate="' + k + '" data-id="' + esc2(g.id) + '" class="' + (k <= n ? "on" : "") + '" aria-label="' + k + ' stars">★</button>'; }).join("") + "</span>";
      return '<div class="' + cls + '" data-id="' + esc2(g.id) + '"><span class="frid">' + esc2(g.id) + '</span><a class="rltx" href="' + fromHref(editHref(g, data)) + '">' + esc2(String(g.text || "")) + '</a><span class="rld">' + esc2(st.t) + '</span><span class="rlside">' + stars +
        '<span class="rlacts"><a href="' + fromHref(editHref(g, data)) + '">Edit</a>' + (canDel ? '<button type="button" class="del" data-del="' + esc2(g.id) + '">Delete</button>' : "") + "</span></span></div>"; }).join("") : '<p class="small">No gags written for this range yet.</p>';
    rlBar(); }
  function showRange(code, name) {
    rlCode = code; swapOn = false; picked = [];
    document.getElementById("rlT").textContent = name; RL.classList.add("open");
    if (data) rlDraw(); else { document.getElementById("rlR").innerHTML = '<p class="small">Loading…</p>'; fetch("/api/gags-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { data = d || { all: [] }; rlDraw(); }); }
  }
  if (RL) {
    document.getElementById("rlS").addEventListener("click", function () { if (!data) return; swapOn = !swapOn; picked = []; rlDraw(); });
    document.getElementById("rlR").addEventListener("click", function (e) {
      var sb = e.target.closest("[data-rlsort]"); if (sb) { rlSort = sb.dataset.rlsort; rlDraw(); return; }
      var rb = e.target.closest("[data-rate]"); if (rb && !swapOn) { e.preventDefault(); var id = rb.dataset.id, k = Number(rb.dataset.rate); data.stars = data.stars || {}; var nn = data.stars[id] === k ? 0 : k; if (nn) data.stars[id] = nn; else delete data.stars[id]; rlDraw();
        fetch("/api/stars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, n: nn }) }).catch(function () { alert("Couldn't save the rating."); }); return; }
      var db = e.target.closest("[data-del]"); if (db && !swapOn) { e.preventDefault(); var did = db.dataset.del; var gg = (data.all || []).filter(function (x) { return x.id === did; })[0] || {};
        if (!confirm("Delete " + did + " (" + (gg.stem || "") + ")?" + String.fromCharCode(10, 10) + "Its text, title and tags are cleared from Core. The space and its release dates stay, so the next gag you write for this range fills it.")) return;
        db.disabled = true; db.textContent = "Deleting…";
        fetch("/api/gag-clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: did }) }).then(function (r) { return r.json().then(function (o) { return { ok: r.ok, o: o }; }); })
          .then(function (x) { if (!x.ok) { alert(x.o.error || "Couldn't delete."); rlDraw(); return; } (data.all || []).forEach(function (g) { if (g.id === did) { g.text = ""; g.stem = ""; } }); data.editable = (data.editable || []).filter(function (e) { return e.id !== did; }); rlDraw(); if (window.toast) window.toast(did + " deleted. Its space is free for a new gag."); })
          .catch(function () { alert("Couldn't reach the app. Nothing was changed."); rlDraw(); }); return; }
      if (!swapOn) return; var a = e.target.closest(".rlrow"); if (!a) return; e.preventDefault();
      if (a.classList.contains("nopick")) return; var id = a.dataset.id, i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1); else { if (picked.length >= 2) picked.shift(); picked.push(id); } rlDraw(); });
  }
  document.querySelectorAll("[data-rlist]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); showRange(b.dataset.rlist, b.dataset.name); }); });
  var reopen = new URLSearchParams(location.search).get("rlist");
  if (RL && reopen) { var rb0 = document.querySelector('[data-rlist="' + reopen.replace(/[^A-Z]/g, "") + '"]'); if (rb0) setTimeout(function () { showRange(rb0.dataset.rlist, rb0.dataset.name); history.replaceState(null, "", "/"); }, 50); }
  if (RL) { document.getElementById("rlX").addEventListener("click", function () { RL.classList.remove("open"); }); RL.addEventListener("click", function (e) { if (e.target === RL) RL.classList.remove("open"); }); }
  // Sync to Core button in every page header.
  document.querySelectorAll("[data-sync]").forEach(function (b) { b.addEventListener("click", function () {
    b.disabled = true; var t = b.lastChild; t.textContent = "Syncing…";
    Promise.all([fetch("/api/gags-refresh", { method: "POST" }), fetch("/api/amend-refresh", { method: "POST" })]).then(function (r) {
      if (!r[0].ok) throw 0; if (window.toast) window.toast("Syncing to Core. Reload in about a minute to see it.");
      setTimeout(function () { b.disabled = false; t.textContent = "Sync to Core"; }, 60000);
    }).catch(function () { b.disabled = false; t.textContent = "Sync to Core"; if (window.toast) window.toast("Sync didn't start. Try again.", true); }); }); });
  // Errors that used to pop up as browser boxes now show as a red message.
  window.alert = function (m) { if (window.toast) window.toast(String(m), true); };
  window.toast = function (msg, bad) { var t = document.getElementById("toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(window.__tt); window.__tt = setTimeout(function () { t.className = "toast"; }, 2600); };
})();
</script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const collOf = (code) => (/^(IH|SH|PC|OS)-/.exec(String(code || "")) || [, "IH"])[1];
const TOP_PAGES = ["/week", "/", "/todo", "/approvals", "/gags", "/tags", "/stats", "/credits", "/pricing", "/orders", "/amend", "/tools", "/check", "/links", "/alerts"];
const TITLE_SHORT = { Dashboard: "Home", "Check for problems": "Checks", "Quiet listings": "Quiet", "Weekly check": "Weekly" };   // phone: shorter page names
function topBar(section = "") {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  return `<div class="topbar"><a class="home" href="/" aria-label="Dashboard"><img id="logo" src="/assets/brand-ih-wide.png?v=2" alt="Introvert Here"><img class="mark" src="/assets/icon3-192.png" alt="Introvert Here"></a>${section ? `<span class="sect"><span class="full">${section}</span>${TITLE_SHORT[section] ? `<span class="short">${TITLE_SHORT[section]}</span>` : ""}</span>` : ""}<div class="sp"></div><button class="stopbtn" id="stopBtn" type="button" hidden>Stop</button><div class="sp"></div>
<div class="when"><b>Studio</b>${esc(today)}</div><button class="iconbtn" type="button" id="findBtn" aria-label="Find a gag">${icon("search")}</button><a class="iconbtn" href="/alerts" aria-label="Alerts">${icon("bell")}</a><button class="iconbtn moretop" type="button" id="moreTop" aria-label="Menu">${icon("more")}</button></div>`;
}
// Page header. Links to other app pages are dropped (the dashboard and bottom bar do that now); page buttons stay.
function brandHeader(title, actions = "") {
  const kept = String(actions || "").replace(/<a class="btn" href="(\/[a-z-]*)"[^>]*>[\s\S]*?<\/a>/g, (m, href) => (TOP_PAGES.includes(href) ? "" : m));
  // Every page gets a Sync to Core button (Barry, 13 Nov), unless the page already has its own.
  const sync = /Sync to Core/.test(kept) ? "" : `<button class="btn" type="button" data-sync>${icon("sync")}Sync to Core</button>`;
  const acts = (kept.trim() + sync).trim();
  return `${topBar(title)}<header class="pagehead"><div class="brand"><a class="back" href="/">${icon("back")}Dashboard</a><h1 class="vh">${title}</h1></div>${acts ? `<div class="actions">${acts}</div>` : ""}</header>`;
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

// ---------- one gag, drilled down ----------
const GAG_STATUS = { LIVE_EXISTING: ["Live", "ok"], READY_FOR_RELEASE: ["Scheduled", "wait"], ETSY_DRAFT_READY_FOR_REVIEW: ["Draft waiting for review", "wait"], AMENDMENT_REQUIRED: ["Updating text", "run"], AMENDMENT_REQUIRED_ARTWORK: ["Updating mockups", "run"], AMENDMENT_REQUIRED_REPRINT: ["Updating printed design", "run"], AMENDMENT_REQUIRED_COLOURS: ["Updating colours", "run"], AMENDMENT_REQUIRED_PHOTO: ["Updating one photo", "run"], FAILED: ["Failed", "bad"] };
const GAG_GARMENTS = [["T-SHIRT", "T-Shirt"], ["LONG-SLEEVE", "Long-Sleeve"], ["SWEATSHIRT", "Sweatshirt"], ["HOODIE", "Hoodie"]];
async function gagPage(env, id) {
  const [gags, stats, items, tags, amend, daily] = await Promise.all([env.PENDING.get("gags", "json"), env.PENDING.get("stats", "json"), loadItems(env), env.PENDING.get("tags", "json"), env.PENDING.get("amend", "json"), env.PENDING.get("daily", "json")]);
  const g = gags && (gags.all || []).find((x) => x.id === id);
  if (!g) return shell(`${brandHeader("Gag not found")}<div class="card empty">${icon("person")}There's no gag ${esc(id)} in the app's copy of Core. Tap Sync to Core on the Gags page if it's new.</div>`);
  const ed = (gags.editable || []).find((x) => x.id === id);
  const coll = collOf(id);
  const st = GAG_STATUS[g.status] || [g.status || "Not set", "wait"];
  const am = amend && (amend.gags || []).find((x) => x.id === id);
  const tg = tags && (tags.items || []).find((x) => x.id === id);
  const fmtDay = (iso) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const vids = Object.values(items);
  const cards = GAG_GARMENTS.map(([t, label], n) => {
    const code = id + "-" + t;
    const l = stats && (stats.listings || []).find((x) => x.code === code);
    const v = vids.filter((x) => x.product === code).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const date = ed && ed.dates ? ed.dates[n] : "";
    const live = l && l.state === "active";
    const state = live ? ["Live on Etsy", "ok"] : l ? [l.state === "draft" ? "Draft on Etsy" : "On Etsy (" + l.state + ")", "wait"] : date ? ["Releases " + fmtDay(date), "wait"] : am && am.live.includes(t) ? ["Live on Etsy", "ok"] : ["Not built yet", "wait"];
    const video = !v ? "" : v.status === "pending" ? `<a class="vlink" href="/approvals">Video waiting for your approval</a>`
      : v.status === "approved" ? (v.result && v.result.ok ? `<span class="vok">Video live and posted ${esc(when(v.result.at))}</span>` : `<span class="small">Video approved ${esc(when(v.approvedAt || v.updatedAt))}</span>`)
      : v.status === "rerendering" ? `<span class="small">New video being made</span>` : v.status === "rejected" ? `<span class="small">Video rejected</span>` : "";
    return `<div class="card gl-card"><div class="glh"><b>${label}</b><span class="pill ${state[1]}">${esc(state[0])}</span></div>
${l ? `<div class="glstats"><span><b>£${Number(l.price || 0).toFixed(2)}</b>price</span><span><b>${Number(l.views) || 0}</b>views</span><span><b>${Number(l.favs) || 0}</b>favourites</span></div>` : ""}
${video ? `<div class="glvid">${video}</div>` : ""}
${l ? `<div class="links"><a href="${esc(l.url)}" target="_blank" rel="noopener">Etsy page</a><a href="https://www.etsy.com/your/shops/me/listing-editor/edit/${esc(l.listingId)}" target="_blank" rel="noopener">Shop Manager</a></div>` : ""}</div>`;
  }).join("");
  const tagHtml = tg ? `<div class="chips">${[...(tg.gag5 || []), ...(tg.seas2 || [])].map((t) => `<span class="badge">${esc(t)}</span>`).join(" ")}</div><p class="small" style="margin:8px 0 0">${tg.approved ? "Approved" : "Not approved yet"}${tg.frozen ? " · frozen" : ""} · <a href="/tags">Open Tags</a></p>` : `<p class="small" style="margin:0">No tag row for this gag yet.</p>`;
  return shell(`
${brandHeader(esc(g.stem || id))}
<style>
.gh{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;align-items:start}
@media (max-width:820px){.gh{grid-template-columns:1fr}}
.gprint{background:rgba(0,0,0,.55);border-radius:14px;padding:22px;text-align:right;font:400 clamp(20px,3.6vw,34px)/1.2 "Montserrat",sans-serif;letter-spacing:-.03em;white-space:pre-line;color:#fff}
.gmeta{display:flex;flex-direction:column;gap:12px}
.gmeta img{height:44px;width:auto;align-self:flex-start}
.gmeta .row{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:10px;font-size:14px;color:var(--muted)}
.gmeta .row b{color:var(--text);font:700 14px var(--display);text-align:right}
.pill{display:inline-block;font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:99px;border:1.5px solid var(--line);color:var(--muted);white-space:nowrap}
.pill.ok{color:var(--ok);border-color:rgba(143,208,171,.5)}.pill.run{color:var(--info);border-color:rgba(168,195,230,.5)}.pill.bad{color:var(--warn);border-color:var(--warn)}
.gls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:620px){.gls{grid-template-columns:1fr}}
.gl-card{display:flex;flex-direction:column;gap:12px;border:3px solid var(--accent);box-shadow:inset 0 0 0 1px rgba(0,0,0,.4);padding:18px}
.glh{display:flex;flex-direction:column;align-items:flex-start;gap:8px}.glh b{font:800 17px var(--display);letter-spacing:.06em;text-transform:uppercase}
.glh .pill{white-space:normal}
.glstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
.glstats span{display:flex;flex-direction:column;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.glstats b{font:800 18px var(--display);color:var(--text);letter-spacing:0;text-transform:none}
.glvid{font-size:13px}.vok{color:var(--ok)}.vlink{color:var(--frame);font-weight:600}
.gacts2{display:flex;gap:10px;flex-wrap:wrap}.gacts2 .btn{flex:1 1 200px;min-height:56px}
</style>
<div class="gh">
  <div class="frame"><div class="card"><div class="gprint">${esc(g.text)}</div></div></div>
  <div class="card gmeta">
    <img src="/assets/brand-${coll.toLowerCase()}-wide.png?v=2" alt="">
    <div class="row"><span>Gag</span><b>${esc(id)}</b></div>
    <div class="row"><span>Status</span><b><span class="pill ${st[1]}">${esc(st[0])}</span></b></div>
    ${ed && ed.category ? `<div class="row"><span>Category</span><b>${esc(ed.category)}</b></div>` : ""}
    ${ed && ed.dates ? `<div class="row"><span>Releases</span><b>${esc(fmtDay(ed.dates[0]))}${ed.dates[3] && ed.dates[3] !== ed.dates[0] ? " → " + esc(fmtDay(ed.dates[3])) : ""}</b></div>` : ""}
    <div class="gacts2"><a class="btn" id="backList" hidden>‹ Back to list</a><script>(function () { var f = (new URLSearchParams(location.search).get("from") || "").replace(/[^A-Z]/g, "").slice(0, 2); if (f) { var b = document.getElementById("backList"); b.href = "/?rlist=" + f; b.hidden = false; } })();</script>${ed ? `<a class="btn" href="/gags?edit=${encodeURIComponent(id)}">${icon("gags")}Edit gag</a>` : ""}<a class="btn" href="/amend">${icon("update")}Update listings</a></div>
  </div>
</div>
<h2>Listings</h2>
<div class="gls">${cards}</div>
<h2>Tags</h2>
<div class="card">${tagHtml}</div>
<script>document.body.dataset.coll = ${JSON.stringify(coll)};</script>`);
}

// ---------- To-do (shared with Claude, ChatGPT and Claude Code) ----------
// Items live in KV "todos". The app page needs the normal sign-in. AI tools reach it with the private key kept in
// SECRETS "todo_key": Claude through a remote MCP connector at /mcp/<key>, ChatGPT and scripts through /todo-api/<key>.
async function todoKeyOk(env, key) { const k = env.SECRETS && (await env.SECRETS.get("todo_key")); return !!k && safeEqual(String(key || ""), k); }
async function todoLoad(env) { return (await env.PENDING.get("todos", "json")) || []; }
async function todoSave(env, list) { await env.PENDING.put("todos", JSON.stringify(list.slice(0, 500))); }
function todoClean(t, n) { return String(t == null ? "" : t).replace(/\s+/g, " ").trim().slice(0, n); }
async function todoAdd(env, text, details, source) {
  const t = todoClean(text, 140); if (!t) throw new Error("The to-do needs some text.");
  const list = await todoLoad(env);
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: t, details: todoClean(details, 1000), source: todoClean(source, 30) || "App", at: Date.now(), done: false };
  list.unshift(item); await todoSave(env, list); return item;
}
async function todoSet(env, id, patch) {
  const list = await todoLoad(env); const it = list.find((x) => x.id === id || x.id === String(id).trim());
  if (!it) throw new Error("No to-do with that id.");
  if ("done" in patch) { it.done = !!patch.done; it.doneAt = it.done ? Date.now() : null; }
  if ("text" in patch) { const t = todoClean(patch.text, 140); if (!t) throw new Error("The to-do needs some text."); it.text = t;
    it.details = String(patch.details == null ? "" : patch.details).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
    it.editedAt = Date.now(); }
  if (patch.remove) list.splice(list.indexOf(it), 1);
  await todoSave(env, list); return it;
}
// App (signed in)
async function todoAppApi(request, env) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === "add") await todoAdd(env, d.text, d.details, "Barry");
    else if (d.action === "done" || d.action === "undo") await todoSet(env, d.id, { done: d.action === "done" });
    else if (d.action === "remove") await todoSet(env, d.id, { remove: true });
    else if (d.action === "edit") await todoSet(env, d.id, { text: d.text, details: d.details });
    else return json({ error: "Unknown request" }, 400);
  } catch (e) { return json({ error: e.message }, 400); }
  return json({ ok: true, todos: await todoLoad(env) });
}
// ChatGPT action / scripts: GET list, POST add, POST done
async function todoExtApi(request, env, key, sub) {
  if (!(await todoKeyOk(env, key))) return json({ error: "Not found" }, 404);
  try {
    if (request.method === "GET") { const list = await todoLoad(env); return json({ todos: list.filter((x) => !x.done).map(({ id, text, details, source, at }) => ({ id, text, details, source, added: new Date(at).toISOString() })) }); }
    const d = await request.json().catch(() => ({}));
    if (sub === "done") return json({ ok: true, todo: await todoSet(env, d.id, { done: true }) });
    return json({ ok: true, todo: await todoAdd(env, d.text, d.details, d.source || "ChatGPT") });
  } catch (e) { return json({ error: e.message }, 400); }
}
// Claude: minimal remote MCP server (Streamable HTTP, JSON responses, no sessions)
const TODO_TOOLS = [
  { name: "add_todo", description: "Add an item to Barry's shared Introvert Here to-do list. Use when Barry asks to save an idea or task, in any wording: \"note it\", \"note that\", \"add that to the list\", \"put that on the list\", \"jot that down\", \"remember this\", \"save that idea\", \"park that\", \"to-do:\", \"idea:\", or plainly saying something is worth doing later. If you are unsure whether he wants it saved, ask in one line first. Summarise the idea as a short, clear to-do line (under 120 characters), with any useful context in details.", inputSchema: { type: "object", properties: { text: { type: "string", description: "The to-do, one short line" }, details: { type: "string", description: "Optional extra context" } }, required: ["text"] } },
  { name: "list_todos", description: "List the open items on Barry's shared Introvert Here to-do list.", inputSchema: { type: "object", properties: {} } },
  { name: "complete_todo", description: "Tick off an item on the shared to-do list by its id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];
async function todoMcp(request, env, key) {
  if (!(await todoKeyOk(env, key))) return new Response("Not found", { status: 404 });
  if (request.method === "GET") return new Response("Method not allowed", { status: 405 });
  if (request.method === "DELETE") return new Response(null, { status: 204 });
  let msg; try { msg = await request.json(); } catch (e) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const handle = async (m) => {
    if (m.id === undefined || m.id === null) return null; // notification
    const ok = (result) => ({ jsonrpc: "2.0", id: m.id, result });
    if (m.method === "initialize") return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "introvert-here-todo", version: "1.0.0" }, instructions: "Barry's shared to-do list for Introvert Here. Call add_todo when Barry asks to save an idea or task, in any wording: \"note it\", \"note that\", \"add that to the list\", \"put that on the list\", \"jot that down\", \"remember this\", \"save that idea\", \"park that\", \"to-do:\", \"idea:\", or plainly saying something is worth doing later. If you are unsure whether he wants it saved, ask in one line first." });
    if (m.method === "ping") return ok({});
    if (m.method === "tools/list") return ok({ tools: TODO_TOOLS });
    if (m.method === "tools/call") {
      const a = (m.params && m.params.arguments) || {}, name = m.params && m.params.name;
      const text = (t) => ok({ content: [{ type: "text", text: t }] });
      try {
        if (name === "add_todo") { const it = await todoAdd(env, a.text, a.details, "Claude"); return text("Added to the to-do list: " + it.text); }
        if (name === "list_todos") { const l = (await todoLoad(env)).filter((x) => !x.done); return text(l.length ? l.map((x) => "- [" + x.id + "] " + x.text + (x.details ? " (" + x.details + ")" : "")).join("\n") : "The to-do list is empty."); }
        if (name === "complete_todo") { const it = await todoSet(env, a.id, { done: true }); return text("Ticked off: " + it.text); }
        return { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown tool" } };
      } catch (e) { return ok({ content: [{ type: "text", text: "Couldn't do that: " + e.message }], isError: true }); }
    }
    return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
  };
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(handle))).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202 }); }
  const r = await handle(msg); return r ? json(r) : new Response(null, { status: 202 });
}

// ---------- Credits (software usage tracker) ----------
// Hourly (from the 5-minute cron) the app reads Make with Barry's own Make API token (saved write-only in SECRETS
// "make_token"): each scenario's credits this period, on/off/paused state and parked runs, plus 30 days of daily use.
// It raises alerts when Make pauses the account, switches a scenario off, parks runs, or usage passes 80% / 95%.
const MAKE_API = "https://eu1.make.com/api/v2";
const MAKE_ORG = 8311421, MAKE_TEAM = 2110125;

async function makeGet(token, path) {
  const r = await fetch(MAKE_API + path, { headers: { Authorization: "Token " + token } });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
}
const ddmmyyyy = (s) => { const [d, m, y] = String(s).split("-"); return y + "-" + m + "-" + d; };

async function creditsCheck(env, force) {
  const token = env.SECRETS && (await env.SECRETS.get("make_token"));
  if (!token) return { error: "No Make token saved yet." };
  const prev = (await env.PENDING.get("credits", "json")) || {};
  const flag = !!(await env.PENDING.get("credits-force")), forced = force || flag;
  if (!forced && prev.at && Date.now() - prev.at < 55 * 60000) return prev;
  if (flag) await env.PENDING.delete("credits-force");
  const settings = (await env.PENDING.get("credits-settings", "json")) || {};
  const sc = await makeGet(token, `/scenarios?teamId=${MAKE_TEAM}&pg%5Blimit%5D=200`);
  if (!sc.ok || !sc.j || !Array.isArray(sc.j.scenarios)) {
    const out = { ...prev, error: "Make said " + sc.status + ": " + ((sc.j && (sc.j.detail || sc.j.message)) || sc.t), errorAt: Date.now() };
    await env.PENDING.put("credits", JSON.stringify(out)); return out;
  }
  const scenarios = sc.j.scenarios.map((s) => ({ id: s.id, name: String(s.name || "").replace(/^(Introvert Here|Mosspit Studios):\s*/, ""), active: !!s.isActive, paused: !!s.isPaused,
    dlq: Number(s.dlqCount) || 0, credits: 0, d7: 0 }));
  // Organisation: plan, extras, reset date (needs organizations:read). Raw numbers kept so the maths can be checked.
  let org = null;
  const o = await makeGet(token, `/organizations/${MAKE_ORG}`);
  if (o.ok && o.j && o.j.organization) {
    const g = o.j.organization, lic = g.license || {};
    const flat = {};
    const grab = (obj, pre) => { for (const [k, v] of Object.entries(obj || {})) { if (typeof v === "number" || (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) || typeof v === "boolean") flat[pre + k] = v; else if (v && typeof v === "object" && !Array.isArray(v) && pre.split(".").length < 3) grab(v, pre + k + "."); } };
    grab(g, "");
    org = { plan: g.productName || lic.productName || "", raw: flat, nextReset: g.nextReset || lic.nextReset || g.resetDate || "" };
  }
  // Period = since the last reset (from Make, or Barry's reset day). Credits per scenario per day, summed over the period.
  const reset = nextResetDate(settings.resetDay, org && org.nextReset);
  const start = reset ? new Date(Date.UTC(reset.getUTCFullYear(), reset.getUTCMonth() - 1, reset.getUTCDate())) : new Date(Date.now() - 30 * 864e5);
  const startKey = start.toISOString().slice(0, 10);
  const daily = {};
  const per = await Promise.all(scenarios.map((s) => makeGet(token, `/scenarios/${s.id}/usage`)));
  per.forEach((p, i) => { if (p.ok && p.j && Array.isArray(p.j.data)) p.j.data.forEach((d) => {
    const k = ddmmyyyy(d.date), c = (Number(d.centicredits) || 0) / 100;
    daily[k] = (daily[k] || 0) + c;
    if (k >= startKey) scenarios[i].credits += c;
    if (Date.now() - Date.parse(k) < 7 * 864e5) scenarios[i].d7 += c; }); });
  const scenUsed = scenarios.reduce((a, s) => a + s.credits, 0);
  const extras = Number(settings.extras) || 0;
  const limit = (Number(settings.allowance) || 0) + extras;
  const used = scenUsed + (Number(settings.otherUsed) || 0);
  const cf = await cloudflareUsage(env);
  const out = { at: Date.now(), scenarios, daily, org, used, limit, periodStart: startKey, error: "", cf };
  await env.PENDING.put("credits", JSON.stringify(out));
  await creditsAlerts(env, out, prev);
  return out;
}

// Cloudflare Workers Paid ($5/month, from 12 Nov 2026): included each month: KV writes/deletes/lists 1M each,
// KV reads 10M, Worker requests 10M. Counted month to date (resets on the 1st, UTC).
const CF_LIMITS = { write: 1000000, delete: 1000000, list: 1000000, read: 10000000, requests: 10000000 };
async function cloudflareUsage(env) {
  const tok = env.SECRETS && (await env.SECRETS.get("cf_token"));
  if (!tok) return null;
  const d = new Date().toISOString().slice(0, 10), m1 = d.slice(0, 8) + "01";
  const q = `query { viewer { accounts(filter:{accountTag:"82725ced954062d2cb0d30912fbd923c"}) { kvOperationsAdaptiveGroups(limit:20, filter:{date_geq:"${m1}", date_leq:"${d}"}) { sum { requests } dimensions { actionType } } workersInvocationsAdaptive(limit:20, filter:{date_geq:"${m1}", date_leq:"${d}"}) { sum { requests } } } } }`;
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    const j = await r.json(); const a = j && j.data && j.data.viewer && j.data.viewer.accounts && j.data.viewer.accounts[0];
    if (!a) return { error: "Cloudflare said " + r.status + ((j && j.errors && j.errors[0] && ": " + j.errors[0].message) || "") };
    const u = { day: d.slice(0, 7) };
    (a.kvOperationsAdaptiveGroups || []).forEach((g) => { u[g.dimensions.actionType] = (u[g.dimensions.actionType] || 0) + (g.sum.requests || 0); });
    u.requests = (a.workersInvocationsAdaptive || []).reduce((x, g) => x + (g.sum.requests || 0), 0);
    return u;
  } catch (e) { return { error: String(e.message || e) }; }
}

async function creditsAlerts(env, cur, prev) {
  const st = (await env.PENDING.get("credits-state", "json")) || {};
  const st0 = JSON.stringify(st);
  const fresh = [];
  const link = "https://mosspit-approvals.mosspit.workers.dev/credits";
  const makeLink = MAKE_TEAM_URL;
  const pausedNow = cur.scenarios.some((s) => s.paused);
  if (pausedNow && !st.paused) fresh.push({ title: "Make has paused your account", body: "Make has stopped every scenario, usually because this month's credits have run out. Nothing will build, render or go live until it's sorted. In Make: Billing, then buy extra credits or wait for the monthly reset. Tell Claude once it's running again.", link: makeLink });
  st.paused = pausedNow;
  const before = {}; (prev.scenarios || []).forEach((s) => { before[s.id] = s; });
  cur.scenarios.forEach((s) => {
    const b = before[s.id];
    if (b && b.active && !s.active && !pausedNow) fresh.push({ title: "Make switched off: " + s.name, body: "This scenario was on an hour ago and is now off. Make does this after an error. Anything sent to it waits in its queue until it's switched back on. Ask Claude to look.", link: makeLink + "/scenarios/" + s.id });
    if (b && s.dlq > b.dlq) fresh.push({ title: s.name + ": " + s.dlq + " run" + (s.dlq === 1 ? "" : "s") + " parked", body: "A run hit an error and Make parked it (incomplete executions). The chain behind it has stopped. Ask Claude to look, or open it in Make.", link: makeLink + "/scenarios/" + s.id });
  });
  if (cur.limit > 0) {
    const pct = (cur.used / cur.limit) * 100, period = String(cur.limit) + ":" + new Date().toISOString().slice(0, 7);
    for (const lvl of [95, 80]) {
      if (pct >= lvl && st["pct" + lvl] !== period) {
        st["pct" + lvl] = period; if (lvl === 80) st.pct80 = period;
        fresh.push({ title: "Make credits " + Math.round(pct) + "% used", body: Math.round(cur.used).toLocaleString("en-GB") + " of " + cur.limit.toLocaleString("en-GB") + " credits used this period. If they run out, Make pauses everything. The Credits page shows what's using them.", link });
        break;
      }
    }
  }
  if (cur.cf && !cur.cf.error) {
    const worst = Object.keys(CF_LIMITS).map((k) => [k, (cur.cf[k] || 0) / CF_LIMITS[k]]).sort((a, b) => b[1] - a[1])[0];
    const tag = cur.cf.day + ":" + worst[0];
    if (worst[1] >= 0.8 && st.cf !== tag) {
      st.cf = tag;
      const nice = { write: "saves", delete: "deletes", list: "lookups", read: "reads", requests: "page visits" }[worst[0]];
      fresh.push({ title: "Cloudflare: " + Math.round(worst[1] * 100) + "% of this month's " + nice + " used", body: "The app has used " + (cur.cf[worst[0]] || 0).toLocaleString("en-GB") + " of the " + CF_LIMITS[worst[0]].toLocaleString("en-GB") + " " + nice + " included in your $5 plan this month. Going over doesn't stop anything; Cloudflare just charges a little extra (about 50p per extra million saves). Ask Claude if it's growing fast.", link: "https://mosspit-approvals.mosspit.workers.dev/credits" });
    }
  }
  if (JSON.stringify(st) !== st0) await env.PENDING.put("credits-state", JSON.stringify(st));
  if (!fresh.length) return;
  const alerts = await loadAlerts(env);
  for (const f of fresh) alerts.unshift({ id: crypto.randomUUID(), at: Date.now(), source: "Credits", ...f });
  await saveAlerts(env, alerts);
  for (const f of fresh) await notify(env, "https://mosspit-approvals.mosspit.workers.dev", f.title, f.body.slice(0, 200), "warning");
}

async function creditsKey(request, env) {
  const d = await request.json().catch(() => ({}));
  const saved = [];
  const t = str(d.make_token).replace(/\s+/g, "");
  if (t) {
    if (!/^[0-9a-f-]{30,}$/i.test(t)) return json({ error: "That doesn't look like a Make API token (letters, numbers and dashes, about 36 characters)." }, 400);
    const test = await makeGet(t, `/scenarios?teamId=${MAKE_TEAM}&pg%5Blimit%5D=1`);
    if (!test.ok) return json({ error: "Make didn't accept that token (" + test.status + "). Check it has the scenarios:read scope." }, 400);
    await env.SECRETS.put("make_token", t); saved.push("Make token");
  }
  const cft = str(d.cf_token).replace(/\s+/g, "");
  if (cft) {
    if (cft.length < 30) return json({ error: "That doesn't look like a Cloudflare API token." }, 400);
    await env.SECRETS.put("cf_token", cft); const t = await cloudflareUsage(env);
    if (!t || t.error) { await env.SECRETS.delete("cf_token"); return json({ error: "Cloudflare didn't accept that token. Make sure it has Account Analytics: Read. " + ((t && t.error) || "") }, 400); }
    saved.push("Cloudflare token");
  }
  const s = (await env.PENDING.get("credits-settings", "json")) || {};
  for (const k of ["claudePlan", "claudeCost", "claudeRenew", "gptPlan", "gptCost", "gptRenew", "makeCost"]) {
    if (d[k] !== undefined && String(d[k]) !== String(s[k] || "")) { s[k] = str(d[k]).slice(0, 40); saved.push(k.replace(/^claude/, "Claude ").replace(/^gpt/, "ChatGPT ").replace(/^make/, "Make ").toLowerCase()); }
  }
  if (d.allowance !== undefined && d.allowance !== "") { const n = Number(String(d.allowance).replace(/[, ]/g, "")); if (!(n > 0)) return json({ error: "Monthly allowance should be a number." }, 400); s.allowance = n; saved.push("allowance"); }
  if (d.extras !== undefined) { const n = Number(String(d.extras || 0).replace(/[, ]/g, "")); if (!(n >= 0)) return json({ error: "Extra credits should be a number." }, 400); if (n !== (s.extras || 0)) { s.extras = n; saved.push("extra credits"); } }
  if (d.resetDay !== undefined && d.resetDay !== "") { const n = Number(d.resetDay); if (!(n >= 1 && n <= 31)) return json({ error: "Reset day should be 1 to 31." }, 400); s.resetDay = n; saved.push("reset day"); }
  await env.PENDING.put("credits-settings", JSON.stringify(s));
  if (!saved.length) return json({ error: "Nothing to save." }, 400);
  const out = await creditsCheck(env, true);
  return json({ ok: true, saved, error: out.error || "" });
}

function ordinal(n) { n = Number(n); const v = n % 100; return v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"; }
function nextResetDate(day, iso) {
  if (iso && !isNaN(Date.parse(iso))) return new Date(iso);
  if (!day) return null;
  const n = new Date(); let r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), day));
  if (r <= n) r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, day));
  return r;
}

async function creditsPage(env) {
  const [c, settings, lock] = await Promise.all([env.PENDING.get("credits", "json"), env.PENDING.get("credits-settings", "json"), env.PENDING.get("lock:builder:blocked", "json")]);
  const s = settings || {};
  const tok = env.SECRETS && (await env.SECRETS.get("make_token"));
  const n0 = (x) => Math.round(x || 0).toLocaleString("en-GB");
  let body = "";
  if (!c || !c.scenarios) {
    body = `<div class="card empty">${tok ? "Reading Make… tap Refresh in a moment." : "Save your Make API token below and this page fills in."}</div>`;
  } else {
    const limit = c.limit || 0, used = c.used || 0, pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    const days = Object.keys(c.daily || {}).sort().slice(-30);
    const last7 = days.slice(-8, -1).reduce((a, k) => a + c.daily[k], 0) / 7 || 0;
    const reset = nextResetDate(s.resetDay, c.org && c.org.nextReset);
    const daysLeft = reset ? Math.max(0, Math.ceil((reset - Date.now()) / 864e5)) : null;
    const projected = daysLeft != null ? used + last7 * daysLeft : null;
    let forecast = "";
    if (limit && last7 > 0) {
      const runOut = (limit - used) / last7;
      forecast = used >= limit ? `<b class="bad">Out of credits.</b> Make will pause everything until the reset${reset ? " on " + reset.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""} or until you buy more.`
        : daysLeft != null && runOut < daysLeft ? `<b class="bad">At this rate you'll run out on ${new Date(Date.now() + runOut * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</b>, ${Math.ceil(daysLeft - runOut)} days before the reset.`
        : `At this rate you'll use about <b>${n0(projected)}</b> by the reset. That's fine.`;
    }
    const tone = pct >= 95 ? "var(--warn)" : pct >= 80 ? "#e6b450" : "var(--go)";
    const maxDay = Math.max(1, ...days.map((k) => c.daily[k]));
    const bars = days.map((k) => `<div class="cb" title="${esc(k)}: ${n0(c.daily[k])}"><i style="height:${Math.max(2, (c.daily[k] / maxDay) * 100)}%"></i></div>`).join("");
    const sorted = c.scenarios.slice().sort((a, b) => b.credits - a.credits);
    const top = Math.max(1, sorted[0] ? sorted[0].credits : 1);
    const rows = sorted.map((x) => `<div class="cr"><div class="cn">${esc(x.name)}${x.paused ? ' <span class="pill bad">paused</span>' : !x.active ? ' <span class="pill bad">off</span>' : ""}${x.dlq ? ` <span class="pill warn">${x.dlq} parked</span>` : ""}</div>
<div class="cv"><span class="cbar"><i style="width:${(x.credits / top) * 100}%"></i></span><b>${n0(x.credits)}</b>${used ? `<small>${Math.round((x.credits / used) * 100)}%</small>` : ""}</div></div>`).join("");
    const paused = c.scenarios.some((x) => x.paused);
    body = `${paused ? `<div class="card warnc"><b>Make has paused your account.</b> Nothing runs until credits are topped up or the month resets.</div>` : ""}
${c.error ? `<div class="card warnc small">Last check failed: ${esc(c.error)}</div>` : ""}
<div class="cgrid">
<div class="card"><div class="lbl2">Make credits since ${c.periodStart ? esc(new Date(c.periodStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })) : "the reset"}</div>
  <div class="big2">${n0(used)}${limit ? `<small> / ${n0(limit)}</small>` : ""}</div>
  ${limit ? `<div class="gauge"><i style="width:${pct}%;background:${tone}"></i></div><div class="small">${Math.round(pct)}% used${reset ? ` · resets ${reset.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} (${daysLeft} day${daysLeft === 1 ? "" : "s"})` : ""}</div>` : `<div class="small">Add your monthly allowance below to see how close you are.</div>`}
  ${forecast ? `<p class="small" style="margin:10px 0 0">${forecast}</p>` : ""}
  <div class="small" style="margin-top:6px">Last 7 days: about ${n0(last7)} a day.</div></div>
<div class="card"><div class="lbl2">Daily use, last 30 days</div><div class="cbars">${bars}</div><div class="small">Checked ${esc(when(c.at))}</div></div>
</div>
<div class="card"><div class="lbl2">What's using them</div>${rows}</div>
${lock && lock.length ? `<div class="card small"><b>Builder lock:</b> stopped ${lock.length} extra cop${lock.length === 1 ? "y" : "ies"} from running side by side, most recently ${esc(when(lock[0].at))}.</div>` : ""}`;
  }
  // Other services: Cloudflare (live, with its own token), Claude and ChatGPT (plan cards: neither shares usage with apps).
  const cfTok = env.SECRETS && (await env.SECRETS.get("cf_token"));
  const cfU = c && c.cf;
  const bar2 = (n, of) => { const pct = Math.min(100, (n / of) * 100); return `<div class="gauge"><i style="width:${Math.max(2, pct)}%;background:${pct >= 95 ? "var(--warn)" : pct >= 80 ? "#e6b450" : "var(--go)"}"></i></div>`; };
  const cfCard = `<div class="card"><div class="lbl2">Cloudflare (runs this app) · $5 plan</div>${!cfTok ? `<p class="small">Add a Cloudflare token in Settings below to see today's use here.</p>` : !cfU ? `<p class="small">Reading Cloudflare… tap Refresh in a moment.</p>` : cfU.error ? `<p class="small">Couldn't read Cloudflare: ${esc(cfU.error)}</p>` :
    `<div class="big2">${n0(cfU.write || 0)}<small> / 1,000,000 saves this month</small></div>${bar2(cfU.write || 0, 1000000)}<div class="small">Reads ${n0(cfU.read || 0)} of 10 million · page visits ${n0(cfU.requests || 0)} of 10 million · included in your $5 plan, counted from the 1st</div>`}</div>`;
  const ai = (nm, plan, cost, renew, url) => `<div class="card"><div class="lbl2">${nm}</div><div class="big2" style="font-size:24px">${esc(plan || "Plan not set")}</div><div class="small">${cost ? esc(cost) + " a month" : ""}${renew ? (cost ? " · " : "") + "renews on the " + esc(renew) + ordinal(renew) : ""}</div><p class="small" style="margin:8px 0">${nm} doesn't let other apps see your usage, so tap to check it there.</p><a class="btn" href="${url}" target="_blank" rel="noopener">Check ${nm} usage</a></div>`;
  const aiCards = `<div class="cgrid">${ai("Claude", s.claudePlan, s.claudeCost, s.claudeRenew, "https://claude.ai/settings/usage")}${ai("ChatGPT", s.gptPlan, s.gptCost, s.gptRenew, "https://chatgpt.com/#settings/Account")}</div>`;
  const costs = [["Make", s.makeCost], ["Cloudflare", "$5"], ["Claude", s.claudeCost], ["ChatGPT", s.gptCost]].filter((x) => x[1]);
  const costCard = costs.length ? `<div class="card"><div class="lbl2">Monthly costs</div>${costs.map((x) => `<div class="cr"><div class="cn">${x[0]}</div><div class="cv"><b>${esc(x[1])}</b></div></div>`).join("")}</div>` : "";
  body += cfCard + aiCards + costCard;
  const settingsCard = `<details class="card" ${tok ? "" : "open"}><summary class="lbl2" style="cursor:pointer">Settings</summary>
<p class="small">Monthly credits = your plan's credits (Make → Subscription → Current plan). Add any extras you buy in the extra-credits box; set it back to 0 after the reset.</p>
<p class="small">Make token: <b>${tok ? "saved ✓ (…" + esc(tok.slice(-4)) + ")" : "not saved yet"}</b>. To make one: Make → your profile picture → Profile → <b>API access</b> → Add token. Name it <i>Approvals app</i>, tick <b>scenarios:read</b>, <b>scenarios:run</b> and <b>organizations:read</b>, then paste it here. (scenarios:run lets the app start the copy watch, the reviews check and List it now.) It's stored privately and never shown again.</p>
<div class="kf"><input id="mt" placeholder="Make API token" autocomplete="off" spellcheck="false"><input id="al" inputmode="numeric" placeholder="Monthly credits, e.g. 40000" value="${esc(s.allowance || "")}"><input id="rd" inputmode="numeric" placeholder="Reset day of month, e.g. 4" value="${esc(s.resetDay || "")}"><input id="ex" inputmode="numeric" placeholder="Extra credits bought this month (0 if none)" value="${esc(s.extras || "")}"><input id="mc" placeholder="Make monthly cost, e.g. $34.12" value="${esc(s.makeCost || "")}">
<p class="small" style="flex-basis:100%;margin:10px 0 0"><b>Cloudflare:</b> token ${cfTok ? "saved ✓" : "not saved yet"}. To make one: dash.cloudflare.com → your profile icon → My Profile → API Tokens → Create Token → Create Custom Token. Name it <i>Approvals app</i>. Permissions: Account → Account Analytics → Read. Continue → Create, then copy it here.</p>
<input id="cft" placeholder="Cloudflare API token" autocomplete="off" spellcheck="false">
<p class="small" style="flex-basis:100%;margin:10px 0 0"><b>Claude and ChatGPT</b> (for the cards above):</p>
<input id="cp" placeholder="Claude plan, e.g. Max" value="${esc(s.claudePlan || "")}"><input id="cc" placeholder="Claude cost, e.g. £90" value="${esc(s.claudeCost || "")}"><input id="cr2" inputmode="numeric" placeholder="Claude renews on day…" value="${esc(s.claudeRenew || "")}">
<input id="gp" placeholder="ChatGPT plan, e.g. Plus" value="${esc(s.gptPlan || "")}"><input id="gc" placeholder="ChatGPT cost, e.g. £20" value="${esc(s.gptCost || "")}"><input id="gr" inputmode="numeric" placeholder="ChatGPT renews on day…" value="${esc(s.gptRenew || "")}"><button class="btn-main" id="ks" type="button">Save</button></div>
</details>`;
  return shell(`
${brandHeader("Credits", `<button class="btn" id="cr" type="button"><svg class="ic"><use href="#i-sync"/></svg> Refresh</button>`)}
<style>
.cgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}@media (max-width:760px){.cgrid{grid-template-columns:1fr}}
.lbl2{font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.big2{font:800 34px var(--display)}.big2 small{font-size:18px;color:var(--muted)}
.gauge{height:14px;border-radius:99px;background:var(--line);overflow:hidden;margin:10px 0 6px}.gauge i{display:block;height:100%;border-radius:99px}
.cbars{display:flex;align-items:flex-end;gap:3px;height:120px;margin:6px 0 8px}.cb{flex:1;height:100%;display:flex;align-items:flex-end}.cb i{display:block;width:100%;background:var(--go);border-radius:3px 3px 0 0;opacity:.85}
.cr{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}.cr:first-of-type{border-top:0}
.cn{flex:1;min-width:0;font-size:14px}.cv{display:flex;align-items:center;gap:8px;flex:none}.cv b{font:700 14px var(--display);min-width:56px;text-align:right}.cv small{color:var(--muted);min-width:34px;text-align:right}
.cbar{width:110px;height:8px;border-radius:99px;background:var(--line);overflow:hidden}.cbar i{display:block;height:100%;background:var(--go)}
@media (max-width:520px){.cbar{width:60px}}
.pill{font:700 10px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:99px;border:1px solid}.pill.bad{color:var(--warn);border-color:var(--warn)}.pill.warn{color:#e6b450;border-color:#e6b450}
.warnc{border-color:var(--warn)}.bad{color:var(--warn)}
.kf{display:flex;flex-wrap:wrap;gap:8px}.kf input{flex:1 1 200px;min-width:0;min-height:48px;padding:0 12px;font:15px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}.kf .btn-main{width:auto;padding:0 22px}
.card{margin-bottom:14px}
</style>
${body}
${settingsCard}
<script>
(function () {
  function go(url, b) { return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "Couldn't do that"); return j; }); }); }
  document.getElementById("cr").onclick = function () { this.disabled = true; go("/api/credits-refresh").then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); document.getElementById("cr").disabled = false; }); };
  document.getElementById("ks").onclick = function () { var b = { make_token: document.getElementById("mt").value, allowance: document.getElementById("al").value, resetDay: document.getElementById("rd").value, extras: document.getElementById("ex").value, makeCost: document.getElementById("mc").value, cf_token: document.getElementById("cft").value,
      claudePlan: document.getElementById("cp").value, claudeCost: document.getElementById("cc").value, claudeRenew: document.getElementById("cr2").value, gptPlan: document.getElementById("gp").value, gptCost: document.getElementById("gc").value, gptRenew: document.getElementById("gr").value };
    go("/api/credits-key", b).then(function (j) { toast("Saved " + j.saved.join(", ")); setTimeout(function () { location.reload(); }, 700); }).catch(function (e) { toast(e.message, true); }); };
})();
</script>`);
}

async function todoPage(env, origin) {
  const list = await todoLoad(env);
  const key = env.SECRETS && (await env.SECRETS.get("todo_key"));
  const mcpUrl = key ? origin + "/mcp/" + key : "";
  const apiUrl = key ? origin + "/todo-api/" + key : "";
  const schema = key ? JSON.stringify({ openapi: "3.1.0", info: { title: "Introvert Here to-do", version: "1.0.0" }, servers: [{ url: apiUrl }],
    paths: { "/": { get: { operationId: "listTodos", summary: "List open to-dos", responses: { "200": { description: "OK" } } },
      post: { operationId: "addTodo", summary: "Add a to-do", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { text: { type: "string", description: "One short line" }, details: { type: "string" } }, required: ["text"] } } } }, responses: { "200": { description: "OK" } } } },
      "/done": { post: { operationId: "completeTodo", summary: "Tick off a to-do by id", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }, responses: { "200": { description: "OK" } } } } } }, null, 2) : "";
  const gptInstr = "You help Barry run Introvert Here, an Etsy shop of introvert humour clothing. When Barry asks to save an idea or task, in any wording (\"note it\", \"note that\", \"add that to the list\", \"jot that down\", \"remember this\", \"park that\", \"idea:\", or saying something is worth doing later), summarise it as one short, clear to-do line (under 120 characters), put any useful context in details, and call addTodo. If you're not sure he wants it saved, ask in one line first. Confirm in one line. If he asks what's on his list, call listTodos.";
  const setup = key ? `<details class="card setup"><summary>Set up Claude and ChatGPT</summary>
  <p class="small">Keep these private: anyone with the link can add to your list.</p>
  <h4>Claude</h4><ol class="small"><li>In Claude: Settings → Connectors → <b>Add custom connector</b>.</li><li>Name: <b>Introvert Here to-do</b>. URL: the link below. Leave the advanced settings empty, then Add.</li><li>Settings → Profile, in "What personal preferences should Claude consider", add: <i>When I ask to save an idea or task in any wording (note it, add that to the list, jot that down, remember this, park that), summarise it and add it with the Introvert Here to-do connector. If unsure, ask me first.</i></li></ol>
  <div class="cp"><code>${esc(mcpUrl)}</code><button class="btn" type="button" data-copy="${esc(mcpUrl)}">Copy</button></div>
  <h4>ChatGPT</h4><ol class="small"><li>In ChatGPT: Explore GPTs → <b>Create</b> → Configure. Name it <b>Introvert Here</b>.</li><li>Paste the instructions below into Instructions.</li><li>Create new action → paste the schema below. Authentication: None. Save (Only me).</li><li>Chat in that GPT and say "Note it" when you have an idea.</li></ol>
  <div class="cp"><code>Instructions</code><button class="btn" type="button" data-copy="${esc(gptInstr)}">Copy instructions</button></div>
  <div class="cp"><code>Action schema</code><button class="btn" type="button" data-copy="${esc(schema)}">Copy schema</button></div>
</details>` : "";
  return shell(`
${brandHeader("To-do")}
<style>
.tdw{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
@media (max-width:860px){.tdw{grid-template-columns:1fr}}
.tdadd{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.tdadd input{flex:1 1 240px;min-width:0;min-height:52px;padding:0 14px;font:16px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}
.tdl{display:flex;flex-direction:column;gap:8px}
.td{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.td input{width:26px;height:26px;accent-color:var(--go);flex:none;margin-top:1px}
.td .tx{flex:1;min-width:0}.td .tx b{display:block;font:700 16px var(--display)}.td .tx p{margin:4px 0 0;font-size:14px;color:var(--muted);white-space:pre-wrap}
.td .meta3{font-size:12px;color:var(--dim);margin-top:6px}
.td.done .tx b{text-decoration:line-through;color:var(--muted)}
.td button.tdcp{font-size:18px;color:var(--text)}
.tdeT,.tdeD{display:block;width:100%;box-sizing:border-box;padding:10px 12px;font:16px var(--body);border:1.5px solid var(--line);border-radius:10px;background:var(--field);color:var(--text);margin:0 0 8px}
.tdeT{font-weight:700;min-height:46px}.tdeD{resize:vertical;font-size:15px}
.tdeB{display:flex;gap:8px}.td .tdeB button{width:auto;height:auto;min-height:44px;padding:0 18px;font:800 12px var(--display);letter-spacing:.1em}
.td input.tdeT{width:100%;height:auto;min-height:46px;margin:0 0 8px;flex:none;accent-color:auto}
.td .tdeB .btn-main{color:#0b0b0a;background:var(--go);border-color:var(--go)}.td .tdeB .btn{color:var(--text)}
.td button{flex:none;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:none;color:var(--muted);font-size:20px;cursor:pointer}
.src{display:inline-block;font:700 10px var(--display);letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:99px;border:1px solid var(--line);margin-right:6px}
.setup{grid-column:2}.setup summary{cursor:pointer;font:800 13px var(--display);letter-spacing:.06em;text-transform:uppercase}
.setup h4{margin:14px 0 4px;font:800 14px var(--display)}.setup ol{padding-left:18px;margin:4px 0 8px}
.cp{display:flex;gap:8px;align-items:center;margin:6px 0}.cp code{flex:1;min-width:0;font:500 12px var(--mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:860px){.setup{grid-column:auto}}
.src.Claude{color:#e8a389;border-color:#d97757}.src.ChatGPT{color:#9fd0c3;border-color:#74aa9c}.src.Barry{color:var(--text)}
</style>
<div class="tdw">
  <div>
    <div class="tdadd"><input id="tdText" placeholder="Add a to-do" enterkeyhint="done"><button class="btn-main" id="tdAdd" type="button" style="width:auto;padding:0 22px">Add</button></div>
    <div class="tdl" id="open"></div>
    <h2 id="doneH">Done</h2><div class="tdl" id="done"></div>
  </div>
  <div class="card"><h3 style="margin:0 0 8px;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)">Add from anywhere</h3>
    <p class="small" style="margin:0">In Claude, say <b>Note it</b>, <b>add that to the list</b>, <b>jot that down</b> or similar, and the idea is summarised and added here. From ChatGPT (or anywhere) on your phone or tablet: long-press a message → Share → <b>Introvert Here</b>. Claude Code can add to it too. Ticked items move to Done.</p></div>
  ${setup}
</div>
<script>
(function () {
  var L = ${JSON.stringify(list).replace(/</g, "\\u003c")};
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function when(ms) { return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function row(t) { return '<div class="td' + (t.done ? " done" : "") + '"><input type="checkbox" data-id="' + esc(t.id) + '"' + (t.done ? " checked" : "") + ' aria-label="Done"><div class="tx"><b>' + esc(t.text) + '</b>' + (t.details ? "<p>" + esc(t.details) + "</p>" : "") + '<div class="meta3"><span class="src ' + esc(t.source) + '">' + esc(t.source) + '</span>' + when(t.done ? t.doneAt : t.at) + '</div></div><button type="button" class="tdcp" data-ed="' + esc(t.id) + '" aria-label="Edit" title="Edit">✎</button><button type="button" class="tdcp" data-cp="' + esc(t.id) + '" aria-label="Copy for Claude or ChatGPT" title="Copy for Claude or ChatGPT">⧉</button><button type="button" data-rm="' + esc(t.id) + '" aria-label="Delete">×</button></div>'; }
  function draw() { var o = L.filter(function (t) { return !t.done; }), d = L.filter(function (t) { return t.done; }).slice(0, 30);
    document.getElementById("open").innerHTML = o.length ? o.map(row).join("") : '<div class="card empty">Nothing on the list. Say “Note it” to Claude or ChatGPT, or add one above.</div>';
    document.getElementById("done").innerHTML = d.map(row).join(""); document.getElementById("doneH").hidden = !d.length; }
  async function send(b) { var r = await fetch("/api/todo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); var j = await r.json().catch(function () { return {}; }); if (!r.ok) throw new Error(j.error || "Couldn't save"); L = j.todos; draw(); }
  function add() { var i = document.getElementById("tdText"); if (!i.value.trim()) return; send({ action: "add", text: i.value }).then(function () { i.value = ""; toast("Added"); }).catch(function (e) { toast(e.message, true); }); }
  document.getElementById("tdAdd").onclick = add;
  document.querySelectorAll("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { navigator.clipboard.writeText(b.dataset.copy).then(function () { toast("Copied"); }).catch(function () { toast("Couldn't copy. Long-press to select instead.", true); }); }); });
  document.getElementById("tdText").addEventListener("keydown", function (e) { if (e.key === "Enter") add(); });
  document.addEventListener("change", function (e) { var id = e.target.dataset && e.target.dataset.id; if (id) send({ action: e.target.checked ? "done" : "undo", id: id }).catch(function (er) { toast(er.message, true); }); });
  // Copy a to-do as a ready-made message to paste into Claude or ChatGPT.
  function prompt(t) { return "Let's pick up this Introvert Here to-do:\\n\\n" + t.text + (t.details ? "\\n\\nDetails: " + t.details : "") +
      "\\n\\n(Added " + when(t.at) + (t.source ? " by " + t.source : "") + ".) Please remind me where we got to and suggest the next step."; }
  function copyText(txt) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return new Promise(function (ok, no) { var a = document.createElement("textarea"); a.value = txt; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select();
      var r = false; try { r = document.execCommand("copy"); } catch (x) {} a.remove(); r ? ok() : no(); }); }
  // Edit in place: the text and details become boxes with Save / Cancel.
  var editing = null;
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-ed]"); if (!b) return; var t = L.filter(function (x) { return x.id === b.dataset.ed; })[0]; if (!t) return;
    if (editing) draw(); editing = t.id; var tx = b.closest(".td").querySelector(".tx");
    tx.innerHTML = '<input class="tdeT" maxlength="140" value="' + esc(t.text) + '"><textarea class="tdeD" rows="4" placeholder="Details (optional)">' + esc(t.details || "") + '</textarea><div class="tdeB"><button type="button" class="btn-main tdeS">Save</button><button type="button" class="btn tdeC">Cancel</button></div>';
    tx.querySelector(".tdeT").focus();
    tx.querySelector(".tdeC").onclick = function () { editing = null; draw(); };
    tx.querySelector(".tdeS").onclick = function () { var sv = this; sv.disabled = true; sv.textContent = "Saving…";
      send({ action: "edit", id: t.id, text: tx.querySelector(".tdeT").value, details: tx.querySelector(".tdeD").value }).then(function () { editing = null; draw(); toast("Saved"); })
        .catch(function (er) { sv.disabled = false; sv.textContent = "Save"; toast(er.message, true); }); }; });
  document.addEventListener("click", function (e) { var c = e.target.closest("[data-cp]"); if (!c) return; var t = L.filter(function (x) { return x.id === c.dataset.cp; })[0]; if (!t) return;
    copyText(prompt(t)).then(function () { toast("Copied. Paste it into Claude or ChatGPT."); }).catch(function () { toast("Couldn't copy on this device.", true); }); });
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) send({ action: "remove", id: b.dataset.rm }).then(function () { toast("Deleted"); }).catch(function (er) { toast(er.message, true); }); });
  draw();
  setInterval(function () { fetch("/api/todo-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && !editing && JSON.stringify(d) !== JSON.stringify(L) && !document.activeElement.matches("input#tdText")) { L = d; draw(); } }); }, 30000);
})();
</script>`);
}

// ---------- dashboard ----------
const DASH_RANGES = [["IH", "INTROVERT HERE…", "Introvert Here", "--ih"], ["SH", "SHHH.", "SHHH.", "--sh"], ["PC", "PER CONTRACT", "Per Contract", "--pc"], ["OS", "OFF THE SHELF", "Off The Shelf", "--os"]];
async function dashboardPage(env) {
  const todos = (await todoLoad(env)).filter((t) => !t.done);
  const credits = await env.PENDING.get("credits", "json");
  const trial = await env.PENDING.get("amend-trial", "json");
  const watch = (await env.PENDING.get("amend-watch", "json")) || {};
  const [items, alerts, amend, daily, gags, tags, stats, pricing, orders, hist] = await Promise.all([
    loadItems(env), loadAlerts(env), env.PENDING.get("amend", "json"), env.PENDING.get("daily", "json"), env.PENDING.get("gags", "json"),
    env.PENDING.get("tags", "json"), env.PENDING.get("stats", "json"), env.PENDING.get("pricing", "json"), env.PENDING.get("shop:orders", "json"), env.PENDING.get("stats-hist", "json")]);
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
  // "Read" hides a card until it changes (new count or new first item), then it comes back.
  const dismissed = (await env.PENDING.get("dismissed", "json")) || {};
  const copyNew = (((await env.PENDING.get(COPY_KEY, "json")) || {}).hits || []).filter((h) => h.status === "new");
  const quick = ((await env.PENDING.get(QUICK_KEY, "json")) || []).filter((j) => ["saving", "tags", "build"].includes(j.stage) || Date.now() - j.upd < 24 * 3600e3);
  const needSig = (n, s) => n + "|" + String(s).replace(/<[^>]*>/g, "");
  const need = (cls, n, t, s, href) => !n || dismissed[t] === needSig(n, s) ? "" : `<a class="need ${cls}" href="${href}"><span class="big">${n}</span><span><span class="t">${t}</span><span class="s">${s}</span></span><button type="button" class="nread" data-k="${esc(t)}" data-sig="${esc(needSig(n, s))}">Read</button></a>`;
  // A tile turns red while its area needs attention, with the count as a badge (Barry, 14 Nov).
  const tile = (href, ic, nm, st, primary, tall) => { const n = (typeof HOT === "object" && HOT[href]) || 0;
    return `<a class="tile${primary ? " primary" : ""}${tall ? " tall" : ""}${n ? " hot" : ""}" href="${href}" data-tile="${href}"><span class="ic">${icon(ic)}</span><span class="nm">${nm}</span><span class="st">${st}</span>${n ? `<span class="hotb">${n === true ? "!" : n}</span>` : primary ? '<span class="dots"><i></i><i></i><i></i></span>' : ""}</a>`; };
  const todayMs = Date.parse(((daily && daily.today) || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
  // Last planned release per range. The gags summary is re-sent whenever Core changes,
  // so use it when it is newer than the once-a-day summary.
  const runwayFor = (code, coll) => {
    if (gags && gags.editable && (!daily || (gags.receivedAt || 0) > (daily.at || 0))) {
      const ds = gags.editable.filter((e) => e.id.startsWith(code + "-")).flatMap((e) => e.dates || []).filter(Boolean).sort();
      return ds.length ? { collection: coll, lastDate: ds[ds.length - 1] } : null;
    }
    return (daily && daily.runway || []).find((x) => x.collection === coll);
  };
  const targets = (await env.PENDING.get("gag-targets", "json")) || {};
  const ranges = DASH_RANGES.map(([code, coll, name, colour]) => {
    const inCore = ((gags && gags.all) || []).filter((x) => x.id.startsWith(code + "-")).length, tgt = Number(targets[code]) || 0;
    const live = (amend && amend.gags || []).filter((g) => g.id.startsWith(code + "-")).length;
    const r = runwayFor(code, coll);
    const left = r && r.lastDate ? Math.round((Date.parse(r.lastDate + "T00:00:00Z") - todayMs) / 864e5) : null;
    const pct = left === null ? 0 : Math.max(3, Math.min(100, Math.round(left / 28 * 100)));
    const slot = gags && gags.perCollection && gags.perCollection[coll] && gags.perCollection[coll].next;
    const firstSlot = left === null && slot && slot.mode === "fill" && slot.dates && slot.dates[0] ? slot.dates[0] : "";
    const low = (left !== null && left < 7) || !!firstSlot;
    return `<a class="rng" href="/gags"><button class="rlbtn" type="button" data-rlist="${code}" data-name="${esc(name)}" aria-label="List ${esc(name)} gags">List</button><img src="/assets/brand-${code.toLowerCase()}-stacked.png" alt="${esc(name)}" loading="lazy">
<div class="rbar" title="Releases planned ahead (full = 4 weeks or more)"><i style="width:${pct}%;background:${low ? "var(--warn)" : `var(${colour})`}"></i></div>
<div class="row"><span>Live gags</span><b>${live}</b></div>
<div class="row"><span>Gags in Core</span><b>${inCore}</b></div>
${tgt ? `<div class="row"><span>Target</span><b>${tgt} · ${inCore >= tgt ? "reached ✓" : (tgt - inCore) + " to go"}</b></div><div class="rbar tbar" title="Gags written towards your target"><i style="width:${Math.max(3, Math.min(100, Math.round(inCore / tgt * 100)))}%;background:var(--ok)"></i></div>` : `<div class="row"><span>Target</span><b style="color:var(--muted);font-weight:500">None set · set it in the gag tool</b></div><div class="rbar tbar"><i style="width:0"></i></div>`}
${firstSlot ? `<div class="row"><span>No gags written yet</span><b class="low">First slot ${esc(dayName(firstSlot))}</b></div>` : `<div class="row"><span>Releases planned until</span><b class="${low ? "low" : ""}">${r && r.lastDate ? esc(dayName(r.lastDate)) : "Nothing planned"}</b></div>`}</a>`;
  }).join("");
  const tee = pricing && pricing.prices && pricing.prices["T-SHIRT"];
  // tags: gags releasing within a week whose tags aren't approved yet
  const in7 = new Date(todayMs + 7 * 864e5).toISOString().slice(0, 10);
  // Tags approve themselves 2 days before release; only real problems (title too long for a tag, clashing tags) need you.
  const tagsDue = (tags && tags.items || []).filter((t) => !t.approved && t.due && t.due <= in7 && (String(t.band || "").toUpperCase() === "RED" || (t.status && t.status !== "READY" && !/awaiting approval/i.test(t.status))));
  // today strip: today's releases and views since the previous daily read
  const todayIso = (daily && daily.today) || new Date().toISOString().slice(0, 10);
  const todays = (daily && daily.upcoming || []).filter((u) => u.date === todayIso);
  const days = Object.keys(hist || {}).sort();
  const sumDay = (d) => Object.values((hist || {})[d] || {}).reduce((a, v) => a + (Number(v[0]) || 0), 0);
  const viewsDelta = days.length >= 2 ? sumDay(days[days.length - 1]) - sumDay(days[days.length - 2]) : null;
  const todayStrip = `<div class="today">
  <div class="tcell"><span class="tl">Releasing today</span>${todays.length ? todays.map((u) => `<a href="/gag/${encodeURIComponent(u.gag)}"><b>${esc(u.title || u.gag)}</b> ${esc(TYPE_NAMES[u.type] || u.type)} ${u.built ? '<span class="tok">✓ built</span>' : '<span class="tno">not built yet</span>'}</a>`).join("") : "<span>Nothing today</span>"}</div>
  <div class="tcell"><span class="tl">Views, last day</span><b class="tbig">${viewsDelta === null ? "—" : (viewsDelta >= 0 ? "+" : "") + viewsDelta}</b></div>
  <div class="tcell"><span class="tl">Items sold (Etsy)</span><b class="tbig">${stats && Array.isArray(stats.orders) ? stats.orders.filter((o) => !/cancel/i.test(String(o.status || ""))).reduce((n, o) => n + (Number(o.qty) || 0), 0) : "—"}</b></div>
  <a class="tcell tdcell" href="/todo"><span class="tl">To-do</span><b class="tbig">${todos.length}</b><span class="small">${todos.length ? esc(todos[0].text).slice(0, 50) : "Nothing on the list"}</span></a>
</div>`;
  const lowRanges = DASH_RANGES.filter(([code, coll]) => {
    const r = runwayFor(code, coll);
    const left = r && r.lastDate ? Math.round((Date.parse(r.lastDate + "T00:00:00Z") - todayMs) / 864e5) : null;
    const slot = gags && gags.perCollection && gags.perCollection[coll] && gags.perCollection[coll].next;
    return (left !== null && left < 7) || (left === null && slot && slot.mode === "fill" && slot.dates && !!slot.dates[0]);
  }).map((x) => x[2]);
  // In progress: listing updates, then the new videos they produce (free: from what the app already tracks).
  const B = watch.batch;
  let prog = "", showProg = false;
  if (B && B.ids && B.ids.length) {
    const total = B.ids.length, left = B.doneAt ? 0 : Math.min(total, busy.filter((g) => B.ids.includes(g.id)).length || (B.doneAt ? 0 : total));
    const done = total - left, prods = B.products || [];
    const vids = Object.values(items).filter((i) => prods.includes(i.product) && (i.receivedAt || 0) > B.start);
    const vIn = vids.length, vWait = vids.filter((i) => i.status === "pending").length, vDone = vids.filter((i) => i.status !== "pending").length;
    const bar = (pct, tone) => `<div class="pbar"><i style="width:${Math.max(3, Math.min(100, pct))}%;background:${tone}"></i></div>`;
    if (!(prods.length && vDone >= prods.length)) {
      showProg = true;
      const mins = left * 8;
      const upd = left ? `<div class="prow2"><div class="pt"><b>Updating listings</b><span>${done} of ${total} gag${total === 1 ? "" : "s"} done · about ${mins < 60 ? mins + " min" : Math.round(mins / 60 * 10) / 10 + " hours"} left</span></div>${bar(done / total * 100, "var(--go)")}</div>`
        : `<div class="prow2"><div class="pt"><b>Updating listings</b><span>All ${total} gag${total === 1 ? "" : "s"} done ✓</span></div>${bar(100, "var(--go)")}</div>`;
      const vid = !prods.length ? "" : left ? `<div class="prow2"><div class="pt"><b>New videos</b><span>Start when the updates finish · ${prods.length} to come</span></div>${bar(0, "#e6b450")}</div>`
        : `<a class="prow2" href="/approvals"><div class="pt"><b>New videos</b><span>${vIn} of ${prods.length} in${vWait ? ` · <em>${vWait} waiting for you</em>` : ""}${vDone ? ` · ${vDone} approved` : ""}</span></div>${bar(vIn / prods.length * 100, "#e6b450")}</a>`;
      prog = `<h2>In progress</h2><div class="card progc">${upd}${vid}</div>`;
    }
  }
  const creditPct = credits && credits.used && credits.limit ? credits.used / credits.limit : 0;
  const londonDay = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" });
  const isSunday = londonDay === "Sunday", health = isSunday ? await healthIssues(env) : { issues: [] };
  const sale = salesReminder(new Date().toISOString().slice(0, 10));
  const revKV = (await env.PENDING.get(REVIEWS_KEY, "json")) || { list: [] };
  const newReviews = (revKV.list || []).filter((r) => r.at && Date.now() - r.at < 14 * 864e5);
  const quiet = new Date().getUTCDate() <= 7 ? await quietListings(env) : [];
  var HOT = { "/approvals": pending.length, "/orders": toSend.length, "/tags": tagsDue.length, "/gags": lowRanges.length,
    "/listings": watch.warned && busy.length ? busy.length : 0, "/credits": creditPct >= 0.85 ? Math.round(creditPct * 100) + "%" : 0 };
  return shell(`
${topBar("Dashboard")}
<style>.progc{display:flex;flex-direction:column;gap:16px;margin-bottom:8px}.prow2{display:block;color:var(--text);text-decoration:none}
.pt{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}.pt b{font:800 13px var(--display);letter-spacing:.14em;text-transform:uppercase}.pt span{color:var(--muted);font-size:14px}.pt em{font-style:normal;color:#e6b450;font-weight:600}
.pbar{height:12px;border-radius:99px;background:var(--line);overflow:hidden}.pbar i{display:block;height:100%;border-radius:99px;transition:width .4s}</style>
${trial ? `<h2>Waiting for you</h2>${trialCard(trial, amend)}` : ""}
${prog}
${(() => { const QS = { saving: "Saving to Core…", tags: "Approving its tags…", build: "Building on Etsy (one garment at a time, about 15 minutes each)…" };
  const quickCards = quick.map((j) => j.stage === "done" ? need("run", "✓", "Listed: " + esc(j.stem), "Built. Its video comes to Approvals; approve to go live and post.", "/approvals")
    : ["failed", "stuck"].includes(j.stage) ? need("hot", "!", "List it now: " + esc(j.stem), esc(j.msg || "Something went wrong."), "/alerts")
    : need("run", "…", "Listing now: " + esc(j.stem), esc(j.msg || QS[j.stage] || "") + " · " + esc(j.garments.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(", ")), "/")).join("");
  const cards = [quickCards, need("hot", pending.length, "Videos to approve", pending.length ? "Oldest waiting " + ago(oldest) : "All caught up", "/approvals"),
(new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/London" }) === "Saturday" ? need("warn", weekReleases(gags).length, "Check next week's releases", "Read through the gags going out in the next 7 days", "/week") : "") +
need("warn", alerts.length, "Alerts", alerts.length ? esc(alerts[0].title).slice(0, 60) : "Nothing to look at", "/alerts") +
(sale ? need("warn", sale.days || "!", sale.name + (sale.days ? " in " + sale.days + " day" + (sale.days === 1 ? "" : "s") : " is today"), "Worth an Etsy sale or discount code? Shop Manager → Marketing → Sales and discounts", "https://www.etsy.com/your/shops/me/sales-discounts") : "") +
(newReviews.length ? need("run", newReviews.length, "New Etsy review" + (newReviews.length === 1 ? "" : "s"), esc("★".repeat(Number(newReviews[0].rating) || 0) + " " + (newReviews[0].text || "")).slice(0, 70), "/reviews") : "") +
(copyNew.length ? need("hot", copyNew.length, "Possible cop" + (copyNew.length === 1 ? "y" : "ies") + " on Etsy", esc(copyNew[0].title).slice(0, 70), "/copywatch") : "") +
(quiet.length && new Date().getUTCDate() <= 7 ? need("warn", quiet.length, "Quiet listings to refresh", "Live 60+ days with under 10 views. Monthly look.", "/quiet") : "") +
(isSunday ? need(health.issues.length ? "warn" : "run", health.issues.length || "✓", "Weekly check", health.issues.length ? esc(health.issues[0].t) + (health.issues.length > 1 ? " and " + (health.issues.length - 1) + " more" : "") : "Next two weeks look ready", "/health") : ""),
(watch.warned && busy.length ? need("warn", busy.length, "Updates stuck", "Stopped at " + esc(watch.sig.split(",")[0]) + " · tap to restart", "/amend") : "") + need("run", watch.warned || showProg ? 0 : busy.length, "Updates running", busy.length ? esc(busy.slice(0, 2).map((g) => g.stem || g.id).join(", ")) + (busy.length > 2 ? " and " + (busy.length - 2) + " more" : "") : "None running", "/amend"),
need("warn", toSend.length, "Orders to send", toSend.length ? "Waiting for you" : "All caught up", "/orders"),
need("warn", tagsDue.length, "Tags to fix", tagsDue.length ? esc(tagsDue.slice(0, 2).map((t) => t.titleStem || t.id).join(", ")) + (tagsDue.length > 2 ? " and " + (tagsDue.length - 2) + " more" : "") + " · releasing this week" : "", "/tags"),
need("warn", lowRanges.length, "Gags to write", esc(lowRanges.join(", ")) + (lowRanges.length === 1 ? " runs out" : " run out") + " within a week", "/gags")].join("");
  return cards ? `<h2>Needs you</h2><div class="needs">${cards}</div>` : `<div class="allclear">${icon("check")}<span><b>All caught up</b>Nothing needs you right now.</span></div>`; })()}
<h2>Today <a class="small" href="/today" style="margin-left:auto;letter-spacing:.08em">Today view ›</a></h2>
${todayStrip}
<h2>Studio</h2>
<a class="quickbar" href="/gags?now=1"><span class="ic">${icon("gags")}</span><span><span class="nm">List a gag now</span><span class="st">Write it and it's built straight away, outside the weekly schedule. It comes to Approvals before it goes live.</span></span><span class="qgo">Start ›</span></a>
<div class="tiles">
  ${tile("/gags", "gags", "Gags", `<b>${gags && gags.all ? gags.all.length : "—"}</b> written${next ? " · next release " + esc(dayName(next.date)) : ""} · write, edit and check`, true, true)}
  ${tile("/calendar", "cal", "Calendar", next ? "Next release " + esc(dayName(next.date)) + " · sales dates and seasons" : "Releases, sales dates and seasons")}
  ${tile("/stats", "stats", "Stats", `<b>${views.toLocaleString("en-GB")}</b> listing views`)}
  ${tile("/listings", "update", "Listings", `<b>${liveListings || "—"}</b> live · photos, titles, tags, prices, shipping`, true, true)}
  ${tile("/approvals", "approve", "Approvals", pending.length ? `<b>${pending.length} video${pending.length === 1 ? "" : "s"}</b> waiting · approve to go live and post` : "Nothing waiting · new videos appear here")}
  ${tile("/orders", "orders", "Orders", `<b>${toSend.length}</b> to send · ${(orders || []).length} in total`)}
  ${tile("/tags", "tags", "Tags", tagsToApprove ? `<b>${tagsToApprove}</b> to approve` : "All approved", true)}
  ${tile("/credits", "credits", "Credits", credits && credits.used ? `<b>${Math.round(credits.used).toLocaleString("en-GB")}</b>${credits.limit ? " of " + Math.round(credits.limit).toLocaleString("en-GB") : ""} Make credits` : "Make credits used")}
  ${tile("/links", "links", "Links", "Key addresses")}
  ${tile("/settings", "tools", "Settings", "Tag system and product text", true)}
</div>
<h2 class="rngh">Ranges<button class="btn dsync" id="dashSync" type="button">${icon("sync")}Sync to Core</button></h2>
<div class="ranges">${ranges}</div>
<script>(function () { var b = document.getElementById("dashSync"); if (!b) return; b.addEventListener("click", function () {
  b.disabled = true; b.lastChild.textContent = "Syncing…";
  Promise.all([fetch("/api/gags-refresh", { method: "POST" }), fetch("/api/amend-refresh", { method: "POST" })]).then(function (r) {
    if (!r[0].ok) throw 0; if (window.toast) window.toast("Syncing to Core. The page refreshes in a minute.");
    setTimeout(function () { location.reload(); }, 60000);
  }).catch(function () { b.disabled = false; b.lastChild.textContent = "Sync to Core"; alert("Sync didn't start. Try again."); }); }); })();</script>
<p class="foot">Release plan updated ${daily ? esc(when(daily.at)) : "—"} · <a href="/logout">Sign out</a></p>
<script src="/gagcheck.js"></script>
<script>
window.DISMISSED = ${JSON.stringify(dismissed).replace(/</g, "\\u003c")};
document.addEventListener("click", function (e) { var b = e.target.closest(".nread"); if (!b) return; e.preventDefault(); e.stopPropagation();
  var card = b.closest(".need"); card.style.opacity = ".4";
  fetch("/api/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: b.dataset.k, sig: b.dataset.sig }) }).then(function (r) { if (!r.ok) throw 0;
    var box = card.parentNode; card.remove(); if (box && !box.querySelector(".need")) { var h = box.previousElementSibling; if (h && h.tagName === "H2") h.remove(); box.outerHTML = '<div class="allclear"><span><b>All caught up</b>Nothing needs you right now.</span></div>'; } })
    .catch(function () { card.style.opacity = ""; if (window.toast) window.toast("Couldn't mark it read. Try again.", true); }); });
// Gag check runs here in the background; a "Gag problems" card appears only when something needs fixing.
fetch("/api/gags-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (g) {
  if (!g || !g.all || typeof gagIssues !== "function") return;
  var iss = gagIssues(g); if (!iss.length) return;
  var ct = document.querySelector('[data-tile="/gags"]'); if (ct && !ct.classList.contains("hot")) { ct.classList.add("hot"); var dd = ct.querySelector(".dots"); if (dd) dd.remove(); ct.insertAdjacentHTML("beforeend", '<span class="hotb">' + iss.length + "</span>"); }
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var gt = "Gag problem" + (iss.length === 1 ? "" : "s") + " to fix", gs = (iss[0].t + ": " + iss[0].ids.join(", ")).slice(0, 80), sig = iss.length + "|" + gs;
  if ((window.DISMISSED || {})[gt] === sig) return;
  var card = '<a class="need warn" href="/check"><span class="big">' + iss.length + '</span><span><span class="t">' + gt + '</span><span class="s">' + esc(gs) + '</span></span><button type="button" class="nread" data-k="' + esc(gt) + '" data-sig="' + esc(sig) + '">Read</button></a>';
  var needs = document.querySelector(".needs");
  if (needs) needs.insertAdjacentHTML("beforeend", card);
  else { var ac = document.querySelector(".allclear"); if (ac) ac.outerHTML = '<h2>Needs you</h2><div class="needs">' + card + "</div>"; }
}).catch(function () {});
setTimeout(function () { location.reload(); }, 120000);
</script>`);
}

// ---------- This week's releases (Saturday check) ----------
// Every gag with a garment releasing in the next 7 days (from tomorrow), from the app's copy of Core.
function weekReleases(gags) {
  const start = new Date(Date.now() + 864e5).toISOString().slice(0, 10), end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const GN = ["T-Shirt", "Long-Sleeve", "Sweatshirt", "Hoodie"];
  return ((gags && gags.editable) || []).map((e) => {
    const hits = (e.dates || []).map((d, i) => [d, GN[i]]).filter(([d]) => d && d >= start && d <= end);
    return hits.length ? { id: e.id, text: e.text, stem: e.stem, hits, first: hits.map((h) => h[0]).sort()[0] } : null;
  }).filter(Boolean).sort((a, b) => a.first.localeCompare(b.first) || a.id.localeCompare(b.id));
}
async function weekPage(env) {
  const gags = await env.PENDING.get("gags", "json");
  const list = weekReleases(gags);
  const day = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const rows = list.map((g) => `<a class="wkrow" href="/gags?edit=${encodeURIComponent(g.id)}"><span class="frid">${esc(g.id)}</span><span class="wktx"><b>${esc(g.stem || "")}</b><span>${esc(String(g.text || "").replace(/\s+/g, " "))}</span></span><span class="wkd">${g.hits.map((h) => esc(day(h[0]) + " · " + h[1])).join("<br>")}</span></a>`).join("");
  return shell(`
${brandHeader("This week's releases")}
<style>.wkl{display:flex;flex-direction:column;gap:8px;max-width:980px}
.wkrow{display:grid;grid-template-columns:96px minmax(0,1fr) 190px;gap:14px;align-items:center;padding:14px;border:1px solid var(--line);border-left:5px solid #e6b450;border-radius:12px;background:var(--card);color:var(--text);text-decoration:none}
.wktx{min-width:0}.wktx b{display:block;font:700 15px var(--display)}.wktx span{display:block;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wkd{font:600 13px var(--body);color:#f0c870;text-align:right}
@media (max-width:600px){.wkrow{grid-template-columns:1fr}.wkd{text-align:left}}</style>
<p class="small" style="margin:0 0 12px">Everything releasing in the next 7 days. Read each one through; tap a gag to fix anything before it goes out.</p>
<div class="wkl">${rows || '<div class="card empty">Nothing releases in the next 7 days.</div>'}</div>`);
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
  const pending = items.filter((i) => i.status === "pending").sort((a, b) => a.receivedAt - b.receivedAt);
  const handled = items.filter((i) => i.status !== "pending").sort((a, b) => b.updatedAt - a.updatedAt);
  const alerts = await loadAlerts(env);
  const pendingHtml = pending.length
    ? `${pending.length > 1 ? `<div class="bulkbar" id="bulkbar"><label class="bulk"><input type="checkbox" id="pickAll"><span>Select all</span></label><div class="bbtns"><button class="btn" id="bulkRej" type="button" disabled>Reject ticked</button><button class="btn-main" id="bulkGo" type="button" disabled>${icon("check")}<span id="bulkTxt">Approve ticked</span></button></div></div>` : ""}<div class="aq">${pending.map(pendingCard).join("")}</div>`
    : `<div class="card empty">${icon("approve")}Nothing waiting for review. New videos appear here.</div>`;
  const comingHtml = comingUp(await env.PENDING.get("daily", "json"));
  const handledHtml = handled.length ? `<h2>Recently handled</h2><div class="grid" id="handled">${handled.map((h, n) => n < 6 ? handledCard(h) : handledCard(h).replace('<div class="card', '<div hidden class="card')).join("")}</div>${handled.length > 6 ? `<button class="btn" id="showAll" type="button" style="margin-top:12px" onclick="document.querySelectorAll('#handled [hidden]').forEach(function(e){e.hidden=false});this.remove()">Show all ${handled.length}</button>` : ""}` : "";
  return shell(`
${brandHeader("Approvals" + (pending.length ? ` (${pending.length})` : ""), `<a class="btn" href="/approvals">${icon("sync")}Refresh</a>`)}
${alerts.length ? `<a class="need warn" href="/alerts" style="margin-bottom:14px"><span class="big">${alerts.length}</span><span><span class="t">Alert${alerts.length === 1 ? "" : "s"} to look at</span><span class="s">${esc(alerts[0].title).slice(0, 80)}</span></span></a>` : ""}
${pending.length ? `<p class="small" style="margin:0 0 12px">Watch the video, then tap Approve to put the listing live and post it to Pinterest, Instagram and Facebook. On a phone or tablet you can also swipe a card: right to approve, left to remake.</p>` : ""}
${pendingHtml}
${comingHtml}
${handledHtml}
<p class="small" style="margin-top:32px">Handled items and alerts are cleared after ${KEEP_HANDLED_DAYS} days.</p>
<div class="sheet" id="ask"><div class="pane askpane"><div class="askt" id="askT"></div><div class="small" id="askB"></div><label class="bulk asksoc" id="askSocW" hidden><input type="checkbox" id="askSoc"><span id="askSocT">Also post to Pinterest, Instagram and Facebook</span></label><div class="askbtns"><button class="btn-main" id="askGo" type="button"></button><button class="btn" id="askNo" type="button">Cancel</button></div></div></div>
<style>
.aq{display:flex;flex-direction:column;gap:18px}
.ac{position:relative;touch-action:pan-y;transition:transform .25s ease}
.ac[data-coll=SH]{border-color:var(--sh)}.ac[data-coll=PC]{border-color:var(--pc)}.ac[data-coll=OS]{border-color:var(--os)}
.ac.dragging{transition:none}
.ac .in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;padding:18px}
@media (max-width:820px){.ac .in{grid-template-columns:1fr;padding:14px}}
.ac .vwrap{position:relative}
.ac video{margin:0;border-radius:14px;border:1px solid var(--line)}
.fsbtn{position:absolute;right:10px;top:10px;min-height:40px;padding:0 12px;border-radius:12px;border:1.5px solid rgba(255,255,255,.5);background:rgba(0,0,0,.6);color:#fff;font:800 11px var(--display);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.ac .meta2{display:flex;flex-direction:column;gap:12px;min-width:0}
.ac .rlogo{height:30px;width:auto;align-self:flex-start}
.ahead{display:flex;justify-content:space-between;align-items:center;gap:10px}
.bulk{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:800 12px var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);min-height:44px;padding:0 6px}
.bulk input{width:28px;height:28px;accent-color:var(--go);margin:0}
.bulkbar{position:sticky;top:var(--stick,140px);z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;margin:0 0 14px;border:1px solid var(--line);border-radius:16px;background:rgba(13,13,12,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.bulkbar .btn-main{width:auto;min-height:52px;padding:0 22px}
.bulkbar .btn-main[disabled]{opacity:.45}
.ac.picked{box-shadow:0 0 0 3px var(--go)}
.ac .code{color:var(--muted)}
.ac .title{font-size:22px}
.abig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:auto}
.abig .btn-main,.abig .btn{min-height:64px;font-size:16px;width:100%}
.abig .btn{border-color:var(--frame)}
.asmall{display:flex;gap:14px;flex-wrap:wrap}
.swipehint{position:absolute;top:50%;transform:translateY(-50%);font:900 18px var(--display);letter-spacing:.12em;text-transform:uppercase;opacity:0;pointer-events:none;padding:12px 16px;border-radius:14px}
.swipehint.l{left:16px;color:var(--go-text);background:var(--go)}
.swipehint.r{right:16px;color:#0d0d0c;background:var(--frame)}
.askpane{display:flex!important;flex-direction:column;gap:12px;max-width:560px;margin:0 auto;border-radius:20px 20px 0 0}
.askt{font:800 18px var(--display)}
.asksoc{text-transform:none;letter-spacing:0;font:600 15px var(--body);color:var(--text)}
.pill2{align-self:flex-start;font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:99px;border:1px solid #e6b450;color:#e6b450}
.bulkbar .bbtns{display:flex;gap:10px;flex-wrap:wrap}.bulkbar .btn{min-height:52px;padding:0 20px}
.askbtns{display:grid;grid-template-columns:2fr 1fr;gap:10px}
.askbtns .btn-main,.askbtns .btn{min-height:58px}
</style>
<script>
const $ = (id) => document.getElementById(id);
async function post(path, data) {
  const res = await fetch(path, { method: "POST", body: new URLSearchParams(data) });
  let out = {}; try { out = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(out.error || ("Error " + res.status));
  return out;
}
function cardOf(el) { const c = el.closest(".ac"); return { card: c, row: c.dataset.row, code: c.dataset.code, product: c.dataset.product }; }
let pendingAsk = null;
function ask(title, body, goText, fn, soc) { $("askT").textContent = title; $("askB").textContent = body; $("askGo").textContent = goText; pendingAsk = fn;
  $("askSocW").hidden = !soc; if (soc) { $("askSoc").checked = soc.on; $("askSocT").textContent = soc.label; } $("ask").classList.add("open"); }
$("askNo").onclick = () => { $("ask").classList.remove("open"); pendingAsk = null; document.querySelectorAll(".ac").forEach((c) => c.style.transform = ""); };
$("ask").addEventListener("click", (e) => { if (e.target.id === "ask") $("askNo").onclick(); });
$("askGo").onclick = async () => { const f = pendingAsk; $("ask").classList.remove("open"); pendingAsk = null; if (f) await f(); };
function approve(d) {
  const posted = d.card.dataset.posted === "1";
  ask("Approve " + d.product + "?", "This attaches the video to the listing and puts it live." + (posted ? " This listing's earlier video was already posted to social, so posting is off unless you tick it." : ""), "Approve", async () => {
    d.card.style.opacity = ".5";
    const social = $("askSoc").checked ? "yes" : "no";
    try { await post("/api/approve", { row: d.row, code: d.code, social }); toast(social === "no" ? "Approved: video only, not posted to social" : "Approved: going live"); setTimeout(() => location.reload(), 1200); }
    catch (err) { d.card.style.opacity = ""; d.card.style.transform = ""; toast(err.message, true); }
  }, { on: !posted, label: /^EX-/.test(d.product) ? "Also post to Instagram and Facebook (with its hashtags)" : "Also post to Pinterest, Instagram and Facebook" });
}
function remake(d) {
  ask("Remake the video for " + d.product + "?", "This video is rejected and a new one is made from what's in Core and on the Etsy listing now. It'll appear here in a few minutes.", "Remake", async () => {
    d.card.style.opacity = ".5";
    try { await post("/api/remake", { row: d.row, code: d.code }); toast("New video on its way"); setTimeout(() => location.reload(), 1200); }
    catch (err) { d.card.style.opacity = ""; d.card.style.transform = ""; toast(err.message, true); }
  });
}
// If this card is ticked along with others, the card's buttons act on every ticked video (same as the top bar).
const tickedWith = (b) => { const c = b.closest(".ac"), t = c && c.querySelector("[data-pick]"); return t && t.checked && document.querySelectorAll("[data-pick]:checked").length > 1; };
document.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => tickedWith(b) && $("bulkGo") ? $("bulkGo").onclick() : approve(cardOf(b))));
// Bulk approve: tick cards, then approve them all. Make's Approve scenario runs one at a time, so they queue safely.
const picks = () => [...document.querySelectorAll("[data-pick]")];
function bulkSync() { const n = picks().filter((x) => x.checked).length; if (!$("bulkGo")) return;
  $("bulkGo").disabled = !n; $("bulkRej").disabled = !n; $("bulkTxt").textContent = n ? "Approve " + n + " ticked" : "Approve ticked"; $("bulkRej").textContent = n ? "Reject " + n + " ticked" : "Reject ticked";
  $("pickAll").checked = n && n === picks().length; picks().forEach((x) => x.closest(".ac").classList.toggle("picked", x.checked)); }
picks().forEach((x) => x.addEventListener("change", bulkSync));
if ($("pickAll")) $("pickAll").addEventListener("change", (e) => { picks().forEach((x) => { x.checked = e.target.checked; }); bulkSync(); });
if ($("bulkGo")) $("bulkGo").onclick = () => { const ds = picks().filter((x) => x.checked).map((x) => cardOf(x));
  const nPosted = ds.filter((d) => d.card.dataset.posted === "1").length;
  ask("Approve " + ds.length + " video" + (ds.length === 1 ? "" : "s") + "?", "Each listing gets its video and goes live. Make does them one at a time, about 2 minutes each, so the last one finishes in roughly " + Math.max(2, ds.length * 2) + " minutes." + (nPosted ? " " + nPosted + " of them were already posted to social once and won't be posted again." : ""), "Approve " + ds.length, async () => {
    $("bulkGo").disabled = true; $("bulkRej").disabled = true; let ok = 0, bad = [];
    const socOn = $("askSoc").checked;
    for (const d of ds) { d.card.style.opacity = ".5"; $("bulkTxt").textContent = "Approving " + (ok + bad.length + 1) + " of " + ds.length + "…";
      const social = socOn && d.card.dataset.posted !== "1" ? "yes" : "no";
      try { await post("/api/approve", { row: d.row, code: d.code, social }); ok++; } catch (err) { d.card.style.opacity = ""; bad.push(d.product + ": " + err.message); } }
    toast(ok + " approved" + (bad.length ? ", " + bad.length + " didn't go: " + bad[0] : ": going live"), !!bad.length);
    setTimeout(() => location.reload(), bad.length ? 4000 : 1500); }, { on: nPosted < ds.length, label: "Also post to Pinterest, Instagram and Facebook" + (nPosted ? " (new ones only)" : "") });
};
if ($("bulkRej")) $("bulkRej").onclick = () => { const ds = picks().filter((x) => x.checked).map((x) => cardOf(x));
  ask("Reject " + ds.length + " video" + (ds.length === 1 ? "" : "s") + "?", "Each one is marked REJECTED in Core. Nothing goes live or gets posted, and no new video is made until you tap Make new video under Recently handled.", "Reject " + ds.length, async () => {
    $("bulkGo").disabled = true; $("bulkRej").disabled = true; let ok = 0, bad = [];
    for (const d of ds) { d.card.style.opacity = ".5"; $("bulkRej").textContent = "Rejecting " + (ok + bad.length + 1) + " of " + ds.length + "…";
      try { await post("/api/reject", { row: d.row, code: d.code, product: d.product }); ok++; } catch (err) { d.card.style.opacity = ""; bad.push(d.product + ": " + err.message); } }
    toast(ok + " rejected" + (bad.length ? ", " + bad.length + " didn't go: " + bad[0] : ""), !!bad.length);
    setTimeout(() => location.reload(), bad.length ? 4000 : 1200); });
};
document.querySelectorAll("[data-remake]").forEach((b) => b.addEventListener("click", () => remake(cardOf(b))));
document.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => { if (tickedWith(b) && $("bulkRej")) return $("bulkRej").onclick(); const d = cardOf(b);
  ask("Reject " + d.product + " without a new video?", "It's marked REJECTED in Core and no new video is made until you tap Make new video.", "Reject", async () => {
    try { await post("/api/reject", d); toast("Rejected"); setTimeout(() => location.reload(), 900); } catch (err) { toast(err.message, true); } }); }));
document.querySelectorAll("[data-scrap]").forEach((b) => b.addEventListener("click", () => { const d = cardOf(b);
  ask("Scrap " + d.product + "?", "Deletes it from Printify and Etsy (it isn't live), and removes it from Core's listing registry and listing tags. This can't be undone.", "Scrap it", async () => {
    const clear = $("askSoc").checked; toast("Scrapping " + d.product + "… (about 30 seconds)");
    try { const r = await post("/api/scrap", { row: d.row, code: d.code, product: d.product, clearGag: clear }); toast(r.message || "Scrapped"); setTimeout(() => location.reload(), 2500); } catch (err) { toast(err.message, true); } },
    { on: true, label: "Also clear the gag in Core so you can rewrite it (only if none of its other garments are built)" }); }));
document.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => { const d = cardOf(b); await post("/api/mark", { row: d.row, code: d.code, status: "removed" }).catch(() => {}); toast("Hidden"); setTimeout(() => location.reload(), 700); }));
document.querySelectorAll("[data-rerender]").forEach((b) => b.addEventListener("click", async () => { const c = b.closest(".card");
  b.disabled = true; try { await post("/api/rerender", { row: c.dataset.row, code: c.dataset.code, product: c.dataset.product }); toast("New video requested"); setTimeout(() => location.reload(), 900); } catch (err) { toast(err.message, true); b.disabled = false; } }));
document.querySelectorAll("[data-fs]").forEach((b) => b.addEventListener("click", () => { const v = b.parentNode.querySelector("video"); if (!v) return;
  if (v.requestFullscreen) v.requestFullscreen().then(() => v.play()).catch(() => {}); else if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); v.play(); } }));
// Swipe a card: right = approve, left = remake. Starts only on the card itself, not the video or buttons.
document.querySelectorAll(".ac").forEach((c) => {
  let x0 = null, y0 = 0, dx = 0, locked = false;
  const hl = c.querySelector(".swipehint.l"), hr = c.querySelector(".swipehint.r");
  c.addEventListener("touchstart", (e) => { if (e.target.closest("video,button,a,.fsbtn,label,input")) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; locked = false; }, { passive: true });
  c.addEventListener("touchmove", (e) => { if (x0 === null) return; const t = e.touches[0]; dx = t.clientX - x0;
    if (!locked) { if (Math.abs(t.clientY - y0) > Math.abs(dx)) { x0 = null; return; } locked = Math.abs(dx) > 10; }
    if (locked) { c.classList.add("dragging"); c.style.transform = "translateX(" + dx + "px) rotate(" + dx / 40 + "deg)"; hl.style.opacity = Math.max(0, Math.min(1, dx / 120)); hr.style.opacity = Math.max(0, Math.min(1, -dx / 120)); } }, { passive: true });
  c.addEventListener("touchend", () => { if (x0 === null) return; x0 = null; c.classList.remove("dragging"); hl.style.opacity = 0; hr.style.opacity = 0;
    const d = cardOf(c);
    if (dx > 120) { c.style.transform = "translateX(40px)"; approve(d); } else if (dx < -120) { c.style.transform = "translateX(-40px)"; remake(d); } else c.style.transform = ""; });
});
// Refresh by itself when something changes, unless a video is playing or a question is open.
let sig = null;
setInterval(async () => {
  try {
    const s = (await (await fetch("/api/state")).json()).sig;
    if (sig === null) { sig = s; return; }
    const playing = [...document.querySelectorAll("video")].some((v) => !v.paused);
    if (s !== sig && !playing && !$("ask").classList.contains("open")) location.reload();
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
  const coll = collOf(i.product);
  const player = i.hasVideo
    ? `<div class="vwrap"><video controls playsinline preload="metadata" src="/video/${encodeURIComponent(i.row)}/${encodeURIComponent(i.code)}"></video><button class="fsbtn" data-fs type="button">Full screen</button></div>`
    : `<div class="card empty" style="margin:0">${icon("approve")}${oneDrive ? `<a href="${esc(oneDrive)}" target="_blank" rel="noopener">Watch the video in OneDrive</a>` : "No video attached"}</div>`;
  return `
<div class="frame ac" data-coll="${coll}" data-row="${esc(i.row)}" data-code="${esc(i.code)}" data-product="${esc(i.product)}" data-posted="${i.postedBefore ? 1 : ""}"><div class="card in">
  <span class="swipehint l">Approve</span><span class="swipehint r">Remake</span>
  ${player}
  <div class="meta2">
    <div class="ahead"><img class="rlogo" src="/assets/brand-${coll.toLowerCase()}-wide.png?v=2" alt=""><label class="bulk"><input type="checkbox" data-pick aria-label="Tick to approve in bulk"><span>Tick</span></label></div>
    <span class="code">${esc(i.product)} · rendered ${esc(when(i.receivedAt))}</span>
    ${i.postedBefore ? `<span class="pill2">Replacement video · already posted to social once</span>` : ""}
    ${i.title ? `<div class="title">${esc(i.title)}</div>` : ""}
    ${captionBlock(i)}
    <div class="links">
      ${listing ? `<a href="${esc(listing)}" target="_blank" rel="noopener">${listingId ? "Edit in Shop Manager" : "Open listing"}</a>` : ""}
      ${oneDrive && i.hasVideo ? `<a href="${esc(oneDrive)}" target="_blank" rel="noopener">Video in OneDrive</a>` : ""}
    </div>
    <div class="abig"><button class="btn-main" data-approve type="button">${icon("check")}Approve</button><button class="btn" data-remake type="button">${icon("sync")}Remake</button></div>
    <div class="asmall"><button class="link-btn" data-reject type="button">Reject without a new video</button><button class="link-btn" data-remove type="button">Hide from list</button><button class="link-btn" data-scrap type="button">Scrap listing</button></div>
  </div>
</div></div>`;
}

function handledCard(i) {
  let status = "";
  let action = "";
  if (i.status === "approved") {
    if (!i.result) status = `<div class="status wait">Approved ${esc(when(i.approvedAt || i.updatedAt))}. Waiting for the result from Make…</div>`;
    else if (i.result.ok) status = `<div class="status ok">✓ Live on Etsy${i.social === false ? " with its new video (not posted to social)" : " and posted to Pinterest, Instagram and Facebook"} (${esc(when(i.result.at))})</div>`;
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

// Garment names as shown in the app (Barry, 13 Nov): T-Shirt, Long-Sleeve, Sweatshirt, Hoodie.
function garmentName(t) { return { "T-SHIRT": "T-Shirt", "LONG-SLEEVE": "Long-Sleeve", SWEATSHIRT: "Sweatshirt", HOODIE: "Hoodie" }[String(t || "").toUpperCase()] || String(t || ""); }
const TYPE_NAMES = { "T-SHIRT": "T-Shirt", "LONG-SLEEVE": "Long-Sleeve", SWEATSHIRT: "Sweatshirt", HOODIE: "Hoodie" };

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
  const moved = await env.PENDING.get("gag-rows-moved"); if (moved && Date.now() - Number(moved) > 150000) await env.PENDING.delete("gag-rows-moved");   // a sync read after the rows moved
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
  const QJ = (await env.PENDING.get(QUICK_KEY, "json")) || [], qj = QJ.find((j) => j.ref === str(data.ref));
  if (qj) { if (ok && str(data.gagId)) { qj.gagId = str(data.gagId); qj.stage = "tags"; qj.newRow = /new row/i.test(str(data.message));
      if (qj.ex) { const M = (await env.PENDING.get(EX_META_KEY, "json")) || {}; M[qj.gagId] = Object.assign({}, qj.ex, { stem: qj.stem, at: qj.at }); await env.PENDING.put(EX_META_KEY, JSON.stringify(M)); } } else { qj.stage = "failed"; qj.msg = str(data.message) || "Core refused the gag."; } qj.upd = Date.now(); await env.PENDING.put(QUICK_KEY, JSON.stringify(QJ)); }
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

// Swap the release dates of two unreleased gags in the same range: two ordinary "edit"
// saves through the Save Gag webhook, so Make re-checks each row exactly as for a normal edit.
async function gagSwap(request, env) {
  if (!env.MAKE_GAG_HOOK) return json({ error: "MAKE_GAG_HOOK is not set" }, 500);
  const d = await request.json().catch(() => ({}));
  const g = await env.PENDING.get("gags", "json");
  const ed = (g && g.editable) || [];
  const A = ed.find((e) => e.id === str(d.a)), B = ed.find((e) => e.id === str(d.b));
  if (!A || !B) return json({ error: "Only written gags that haven't been built yet can be swapped. Tap Sync to Core and try again." }, 400);
  if (A.id === B.id) return json({ error: "Pick two different gags." }, 400);
  if (A.id.split("-")[0] !== B.id.split("-")[0]) return json({ error: "Gags can only be swapped within the same range." }, 400);
  const ok4 = (e) => Array.isArray(e.dates) && e.dates.length === 4 && e.dates.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x || ""));
  if (!ok4(A) || !ok4(B)) return json({ error: "Both gags need all four release dates to be swapped." }, 400);
  const send = async (e, dates, ref) => {
    const body = { ref, action: "edit", gagId: e.id, collection: str(e.collection), category: str(e.category), text: String(e.text || ""), stem: str(e.stem),
      tag12: "auto", tag13: "auto", d1: dates[0], d2: dates[1], d3: dates[2], d4: dates[3], datesFromSlot: "false" };
    const r = await fetch(env.MAKE_GAG_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  };
  const refA = crypto.randomUUID(), refB = crypto.randomUUID();
  if (!(await send(A, B.dates, refA))) return json({ error: "Make didn't accept the swap. Nothing was changed." }, 502);
  if (!(await send(B, A.dates, refB))) {
    await send(A, A.dates, crypto.randomUUID()); // put the first one back
    return json({ error: "Make didn't accept the second half of the swap, so the first gag was put back. Nothing changed." }, 502);
  }
  const saves = await loadSaves(env);
  saves.unshift({ ref: refB, action: "edit", gagId: B.id, stem: "Swap: " + str(B.stem) + " (now " + A.dates[0] + ")", text: B.text, status: "pending", at: Date.now() },
    { ref: refA, action: "edit", gagId: A.id, stem: "Swap: " + str(A.stem) + " (now " + B.dates[0] + ")", text: A.text, status: "pending", at: Date.now() });
  await env.PENDING.put(SAVES_KEY, JSON.stringify(saves.slice(0, 50)));
  // Reflect the swap straight away; the next Gags Sync overwrites this with what Core holds.
  const da = A.dates; A.dates = B.dates; B.dates = da;
  await env.PENDING.put("gags", JSON.stringify(g));
  return json({ ok: true, a: { id: A.id, dates: A.dates }, b: { id: B.id, dates: B.dates } });
}

// Delete a gag (Barry, 14 Nov): clear its text, title and tags in Core but keep the row, its ID and its dates,
// so the gag tool fills that space next. Only for gags not built yet and not releasing within 2 days.
const GAG_CLEAR_COLS = ["GAG_TEXT", "GAG_CATEGORY", "CUSTOM_TAG_12", "CUSTOM_TAG_13", "TITLE_STEM", "STATUS", "ELLIPSIS_CHECK", "AMEND_ONLY"];
const TAG_CLEAR_COLS = ["STEM_TAG", "APPROVED", "STEM_FROZEN", "GAG5_FROZEN", "SEAS2_FROZEN", "FROZEN_AT", "FREEZE_MESSAGE", "GAG5_OVERRIDE"];
async function gagClear(request, env) {
  const d = await request.json().catch(() => ({}));
  const id = str(d.id), g = await env.PENDING.get("gags", "json");
  const e = g && (g.editable || []).find((x) => x.id === id), a = g && (g.all || []).find((x) => x.id === id);
  if (!e || !a || !a.row) return json({ error: "Only gags that haven't been built yet can be deleted. Tap Sync to Core and try again." }, 400);
  const first = (e.dates || []).filter(Boolean).sort()[0] || "";
  if (first && first <= new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)) return json({ error: id + " releases within 2 days, so it may already be building. Change its dates first if you really want it gone." }, 400);
  if (await env.PENDING.get("gag-rows-moved")) return json({ error: "Rows were just added or removed in Core. Tap Sync to Core, wait a minute, then try again." }, 409);
  const idx = Number(a.row) - 2, ops = [];
  GAG_CLEAR_COLS.forEach((c) => ops.push(amendCell("GAGS_TABLE", c, idx, "")));
  TAG_CLEAR_COLS.forEach((c) => ops.push(amendCell("GAG_TAGS", c, idx, "")));
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  a.text = ""; a.stem = ""; g.editable = g.editable.filter((x) => x.id !== id);
  await env.PENDING.put("gags", JSON.stringify(g));
  for (const k of [STARS_KEY, "season-locks"]) { const M = (await env.PENDING.get(k, "json")) || {}; if (M[id]) { delete M[id]; await env.PENDING.put(k, JSON.stringify(M)); } }
  await logSetting(env, "Deleted gag " + id + " (" + (e.stem || "") + ")", null);
  return json({ ok: true });
}

// Target (Barry, 14 Nov): the number of gag spaces a range should have. Raising it adds empty, numbered rows to
// Core (dates carry on the range's own rhythm); lowering it removes empty rows from the end only, never a written gag.
const XL_DAY = (iso) => Math.round((Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 864e5);
const ISO_DAY = (n) => new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
function targetPlan(g, pre, target) {
  const rows = (g.all || []).concat((g.empties || []).map((e) => ({ id: e.id, row: e.r, text: "", ds: e.dates }))).filter((x) => new RegExp("^" + pre + "-\\d+$").test(x.id)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const written = rows.filter((x) => String(x.text || "").trim()).length;
  const coll = (Object.entries(g.perCollection || {}).find(([, v]) => v.prefix === pre) || [])[0];
  const plan = { pre, target, have: rows.length, written, add: [], remove: [], blocked: 0 };
  if (!coll || !rows.length) return plan;
  if (target > rows.length) {
    // carry on from the latest-dated scheduled rows (a List it now gag has a newer number but today's date)
    const dated = rows.filter((x) => (x.ds || []).length === 4 && x.ds.every(Boolean)).sort((x, y) => (x.ds[0] < y.ds[0] ? -1 : x.ds[0] > y.ds[0] ? 1 : 0));
    const last = dated[dated.length - 1] || rows[rows.length - 1], prev = dated[dated.length - 2] || last;
    const ld = (last.ds || []).map(XL_DAY), pd = (prev.ds || []).map(XL_DAY);
    const step = ld[0] && pd[0] && ld[0] > pd[0] ? ld[0] - pd[0] : 7;
    let num = Math.max(...rows.map((x) => Number(x.id.split("-")[1]) || 0)), cur = ld.length === 4 && ld.every(Boolean) ? ld : null;
    if (!cur) return Object.assign(plan, { error: "The last " + pre + " row has no dates to carry on from." });
    for (let i = rows.length; i < target; i++) { num++; cur = cur.map((x) => x + step); plan.add.push({ id: pre + "-" + String(num).padStart(5, "0"), coll, ds: cur.map(ISO_DAY), xl: cur.slice() }); }
  } else if (target < rows.length) {
    for (let i = rows.length - 1; i >= 0 && rows.length - plan.remove.length > target; i--) {
      if (String(rows[i].text || "").trim()) { plan.blocked = rows.length - plan.remove.length - target; break; }
      plan.remove.push({ id: rows[i].id, row: Number(rows[i].row) });
    }
  }
  return plan;
}
async function gagTarget(request, env) {
  const d = await request.json().catch(() => ({}));
  const pre = String(d.prefix || "").toUpperCase(); if (!/^[A-Z]{2}$/.test(pre)) return json({ error: "Unknown range" }, 400);
  const n = Math.round(Number(d.n) || 0); if (n < 0 || n > 5000) return json({ error: "Pick a number up to 5,000." }, 400);
  const t = (await env.PENDING.get("gag-targets", "json")) || {};
  const g = await env.PENDING.get("gags", "json");
  const plan = n && g ? targetPlan(g, pre, n) : { add: [], remove: [], blocked: 0 };
  if (plan.error) return json({ error: plan.error }, 400);
  if (d.dry) return json({ ok: true, plan });
  if ((plan.add.length || plan.remove.length) && await env.PENDING.get("gag-rows-moved")) return json({ error: "Rows were just added or removed in Core. Tap Sync to Core, wait a minute, then try again." }, 409);
  const ops = [];
  if (plan.add.length) {
    ops.push({ url: `${AMEND_XL}/tables/GAGS_TABLE/rows/add`, method: "POST", values: plan.add.map((r) => [r.id, "", r.coll, "", "", "", "", "", ...r.xl, "", ""]) });
    ops.push({ url: `${AMEND_XL}/tables/GAG_TAGS/rows/add`, method: "POST", values: plan.add.map((r) => [r.id, ...Array(28).fill(null)]) });
  }
  plan.remove.slice().sort((x, y) => y.row - x.row).forEach((r) => {   // bottom first, so row numbers above stay put
    ops.push({ url: `${AMEND_XL}/worksheets/GAGS/range(address='A${r.row}:N${r.row}')/delete`, method: "POST", body: { shift: "Up" } });
    ops.push({ url: `${AMEND_XL}/worksheets/GAG_TAGS/range(address='A${r.row}:AC${r.row}')/delete`, method: "POST", body: { shift: "Up" } });
  });
  if (ops.length) {
    const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
    if (err) return err;
    await env.PENDING.put("gag-rows-moved", String(Date.now()), { expirationTtl: 3600 });   // until Core has been re-read, no more row changes
    await logSetting(env, "Target " + pre + " " + n + ": " + (plan.add.length ? "added " + plan.add[0].id + "–" + plan.add[plan.add.length - 1].id : "") + (plan.remove.length ? "removed " + plan.remove.length + " empty rows" : ""), null);
  }
  if (n) t[pre] = n; else delete t[pre];
  await env.PENDING.put("gag-targets", JSON.stringify(t));
  return json({ ok: true, targets: t, plan });
}

// List it now (Barry, 14 Nov): write a gag and have it built straight away, outside the weekly schedule.
// 1. Save Gag ("now") adds a new row dated today for the garments picked. 2. Its tag row is added already approved,
// so the builder freezes the tags at the start of its run. 3. The builder is run (one garment per run) until every
// picked garment is built. The listings then go through Approvals as usual: approving puts them live and posts them.
const QUICK_KEY = "quick-jobs";
const GARMS = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
// Trade-mark blocklist for Exclusive topic tags (Barry's tags plan, 16 Nov). Editable later in Settings; this is the
// starting list of names Etsy is known to take listings down for.
const TAG_BLOCK_DEFAULT = ["disney", "marvel", "pixar", "star wars", "harry potter", "hogwarts", "pokemon", "nintendo", "lego", "barbie", "nike", "adidas", "apple", "iphone", "netflix", "coca cola", "starbucks", "mcdonalds", "olympic", "olympics", "super bowl", "world cup", "fifa", "premier league", "champions league", "nfl", "nba", "eurovision", "glastonbury", "wimbledon", "strictly", "bake off", "love island", "x factor", "taylor swift", "swiftie", "beyonce", "beatles", "friends", "the simpsons", "simpsons", "minecraft", "fortnite", "peppa pig", "bluey", "hello kitty", "ikea", "amazon", "google", "tesla", "chatgpt", "openai", "tiktok", "instagram", "facebook", "youtube", "game of thrones", "stranger things", "squid game"];
async function tagBlocklist(env) { const L = await env.PENDING.get("tag-blocklist", "json"); return Array.isArray(L) && L.length ? L : TAG_BLOCK_DEFAULT; }
function exCheck(ex, block) {
  if (!ex || typeof ex !== "object") return "Fill in the Topic & checks step first.";
  if (ex.checks !== true) return "Tick all three checks first.";
  const tt = (Array.isArray(ex.topicTags) ? ex.topicTags : []).map((t) => String(t || "").toLowerCase().replace(/[^a-z0-9 &'-]/g, " ").replace(/\s+/g, " ").trim());
  if (tt.length !== 2 || !tt[0] || !tt[1]) return "Add both topic tags.";
  if (tt.some((t) => t.length > 20)) return "A topic tag is longer than 20 letters.";
  const hit = tt.map((t) => block.find((b) => (" " + t + " ").indexOf(" " + b + " ") >= 0)).find(Boolean);
  if (hit) return "“" + hit + "” is on the trade-mark blocklist.";
  return { topic: str(ex.topic).slice(0, 160), flags: (ex.flags || []).map(str).slice(0, 4), topicTags: tt, hashtags: (Array.isArray(ex.hashtags) ? ex.hashtags : []).map((h) => "#" + String(h).toLowerCase().replace(/[^a-z0-9]/g, "")).filter((h) => h.length > 2).slice(0, 15), useBy: [24, 48, 72].includes(Number(ex.useBy)) ? Number(ex.useBy) : 48 };
}
// Multi-box ranges (EXCLUSIVE): the three parts go to GAGS columns GAG_HEADER / GAG_BODY / GAG_FOOTER via Save Gag.
// No blank lines inside a part: GAG_TEXT joins them with exactly one blank line, which the video splits on.
function gagParts(p) {
  if (!p || typeof p !== "object") return {};
  const c = (v) => String(v || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]*(\n[ \t]*)+/g, "\n").trim();
  const o = { partHeader: c(p.GAG_HEADER), partBody: c(p.GAG_BODY), partFooter: c(p.GAG_FOOTER) };
  return o.partHeader || o.partBody || o.partFooter ? o : {};
}
async function quickList(request, env) {
  if (!env.MAKE_GAG_HOOK) return json({ error: "MAKE_GAG_HOOK is not set" }, 500);
  const d = await request.json().catch(() => ({}));
  const garments = GARMS.filter((t) => Array.isArray(d.garments) && d.garments.includes(t));
  const text = String(d.text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, ""), stem = str(d.stem), collection = str(d.collection), category = str(d.category);
  if (!text || !stem || !collection || !category) return json({ error: "Fill in the gag, range, title stem and category first." }, 400);
  if (!garments.length) return json({ error: "Pick at least one garment." }, 400);
  let ex = null;
  if (collection === "EXCLUSIVE") {
    ex = exCheck(d.ex, await tagBlocklist(env)); if (typeof ex === "string") return json({ error: ex }, 400);
    garments.splice(0, garments.length, "T-SHIRT"); d.later = {};
  }
  const L = (await env.PENDING.get(QUICK_KEY, "json")) || [];
  if (L.some((j) => ["saving", "tags", "build"].includes(j.stage))) return json({ error: "Another List it now is still building. Wait for it to finish (it shows on the dashboard)." }, 409);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const later = d.later && typeof d.later === "object" ? d.later : {};
  for (const [k, v] of Object.entries(later)) if (!GARMS.includes(k) || garments.includes(k) || !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || String(v) <= today) return json({ error: "The later release dates need to be after today." }, 400);
  const dd = GARMS.map((t) => (garments.includes(t) ? today : later[t] ? String(later[t]) : ""));
  const ref = crypto.randomUUID();
  const body = { ref, action: "now", gagId: "", collection, category, text, stem, tag12: ex ? ex.topicTags[0] : "auto", tag13: ex ? ex.topicTags[1] : "auto", d1: dd[0], d2: dd[1], d3: dd[2], d4: dd[3], datesFromSlot: "false", ...gagParts(d.parts) };
  const res = await fetch(env.MAKE_GAG_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept it (" + res.status + "). Nothing was written." }, 502);
  const saves = await loadSaves(env);
  saves.unshift({ ref, action: "now", gagId: "", stem: "List it now: " + stem, text, status: "pending", at: Date.now() });
  await env.PENDING.put(SAVES_KEY, JSON.stringify(saves.slice(0, 50)));
  L.unshift({ ref, stem, garments, stage: "saving", at: Date.now(), upd: Date.now(), runs: 0, ...(ex ? { ex } : {}) });
  await env.PENDING.put(QUICK_KEY, JSON.stringify(L.slice(0, 10)));
  return json({ ok: true });
}
// Exclusive reminders (Barry, 16 Nov): 1 hour and 4 hours after it's waiting in Approvals, and once at its use-by
// time if it still isn't approved. Never publishes anything itself.
const EX_META_KEY = "ex-meta";
async function exTick(env) {
  const M = (await env.PENDING.get(EX_META_KEY, "json")) || {}; const ids = Object.keys(M).filter((k) => !M[k].done); if (!ids.length) return;
  const items = await loadItems(env), now = Date.now(); let changed = false;
  for (const id of ids) {
    const m = M[id], it = Object.values(items).find((x) => x.product === id + "-T-SHIRT");
    if (it && it.status !== "pending") { m.done = true; changed = true; continue; }
    if (now - m.at > 14 * 864e5) { m.done = true; changed = true; continue; }
    const left = m.at + m.useBy * 3600e3 - now, hrs = Math.max(0, Math.round(left / 3600e3));
    if (it && !m.readyAt) { m.readyAt = now; changed = true; }
    if (m.readyAt && !m.r1 && now - m.readyAt >= 3600e3) { m.r1 = now; changed = true; await notify(env, "", "Exclusive waiting: " + m.stem, "Ready to approve. Use-by in about " + hrs + " hours.", "hourglass"); }
    if (m.readyAt && !m.r4 && now - m.readyAt >= 4 * 3600e3) { m.r4 = now; changed = true; await notify(env, "", "Still waiting: " + m.stem, "The Exclusive T-shirt is in Approvals. Use-by in about " + hrs + " hours.", "hourglass"); }
    if (!m.expired && left <= 0) { m.expired = now; changed = true;
      const alerts = await loadAlerts(env); alerts.unshift({ id: crypto.randomUUID(), at: now, title: "Exclusive past its use-by: " + m.stem, body: "It's " + m.useBy + " hours since it was made and it hasn't been approved. Approve it if the topic is still fresh, or tap Scrap listing on its Approvals card.", link: "/approvals", source: "app" }); await saveAlerts(env, alerts);
      await notify(env, "", "Use-by passed: " + m.stem, "Approve it if it's still fresh, or scrap it from Approvals.", "warning"); }
  }
  if (changed) await env.PENDING.put(EX_META_KEY, JSON.stringify(M));
}
async function quickTick(env) {
  const L = (await env.PENDING.get(QUICK_KEY, "json")) || [];
  const j = L.find((x) => ["saving", "tags", "build"].includes(x.stage)); if (!j) return;
  const now = Date.now(), save = () => env.PENDING.put(QUICK_KEY, JSON.stringify(L));
  const fail = async (stage, msg) => { j.stage = stage; j.msg = msg; j.upd = now; await save();
    const alerts = await loadAlerts(env); alerts.unshift({ id: crypto.randomUUID(), at: now, title: "List it now: " + j.stem + " needs a look", body: msg, link: "/", source: "app" }); await saveAlerts(env, alerts); };
  if (j.stage === "saving") { if (now - j.at > 15 * 60e3) await fail("failed", "Core never confirmed the gag was saved. Check Gags → Recent saves."); return; }
  if (j.stage === "tags") {
    // A gag that filled an empty prepared row already has its GAG_TAGS row (the two sheets line up row for row): adding one
    // would push every tag row below it out of line. Only a brand-new row at the end gets a new tag row.
    if (j.newRow === false) { j.stage = "build"; j.tagAt = now; j.upd = now; await save(); return; }
    const row = [j.gagId, ...Array(12).fill(null), true, ...Array(15).fill(null)];   // APPROVED = TRUE: the builder freezes the suggested tags
    const err = await amendHook(env, { action: "apply", ops: JSON.stringify([{ url: `${AMEND_XL}/tables/GAG_TAGS/rows/add`, method: "POST", values: [row] }]), delay: "1", run: "no" });
    if (err) { if (now - j.upd > 30 * 60e3) await fail("stuck", "Couldn't add its tag row in Core."); return; }
    j.stage = "build"; j.tagAt = now; j.upd = now; await save(); return;
  }
  // build: wait for the tag row, then run the builder whenever it's free, until every picked garment is in the registry
  const g = await env.PENDING.get("gags", "json");
  const sc = g && (g.sched || []).find((x) => x.id === j.gagId);
  const done = sc && j.garments.every((t) => sc.b && sc.b[GARMS.indexOf(t)]);
  if (done) { j.stage = "done"; j.upd = now; await save(); await notify(env, "", "Listed: " + j.stem, j.garments.length + " listing" + (j.garments.length === 1 ? "" : "s") + " built. The video comes to Approvals; approve it to go live and post.", "white_check_mark"); return; }
  // Make sure its tags are approved before the builder looks (16 Nov: the row add once left APPROVED = FALSE, so the builder skipped it).
  if (sc && sc.r && !j.apprAt) {
    const err = await amendHook(env, { action: "apply", ops: JSON.stringify([amendCell("GAG_TAGS", "APPROVED", sc.r - 2, "TRUE")]), delay: "1", run: "no" });
    if (!err) { j.apprAt = now; j.tagAt = now; }
    await save(); return;
  }
  if (env.MAKE_GAGSYNC_HOOK && (!j.syncAt || now - j.syncAt > 9 * 60e3)) { j.syncAt = now; await fetch(env.MAKE_GAGSYNC_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "quick" }) }).catch(() => {}); }
  if (now - j.tagAt < 3 * 60e3) { await save(); return; }
  if (j.runs >= j.garments.length * 2 + 2 || now - j.at > 4 * 3600e3) return await fail("stuck", "The builder ran " + j.runs + " times but not every garment was built. Check Alerts and Make.");
  if (await env.PENDING.get("builder-stop")) { j.msg = "Waiting: the builder is stopped (Stop button)."; await save(); return; }
  const lk = await env.PENDING.get("lock:builder", "json");
  if (lk && !lk.passed && now - lk.at < 20 * 60e3) { await save(); return; }   // builder busy
  if (j.lastRun && now - j.lastRun < 12 * 60e3) { await save(); return; }   // give the last run time to finish and Core to update
  const token = env.SECRETS && (await env.SECRETS.get("make_token")); if (!token) return await fail("stuck", "The app has no Make key to start the builder.");
  const r = await fetch(MAKE_API + "/scenarios/7896436/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" }, body: "{}" });
  j.runs++; j.lastRun = now; j.upd = now; j.msg = r.ok ? "" : "Make said " + r.status + " when starting the builder; trying again shortly.";
  await save();
}

// Today's headlines for the Exclusive gag step (Barry, 16 Nov): BBC top stories + Google Trends UK, free feeds,
// fetched by the app itself (no Make credits), kept for an hour. Each item is flagged if it looks like it names a
// person or involves a tragedy, the two things Exclusive gags never touch.
const NEWS_KEY = "headlines";
const NEWS_TRAGIC = /\b(dead|dies|died|death|deaths|killed|kill|killing|murder\w*|stabb\w*|shot|shooting|crash(es|ed)?|attack\w*|war|wars|bomb\w*|terror\w*|flood\w*|fire|blaze|victim\w*|abuse\w*|cancer|suicide|missing|earthquake|injur\w*|rape\w*|assault\w*|funeral|tribute\w*|hostage\w*|genocide|tragedy|tragic|famine|disaster|fatal\w*|mourn\w*|grief|grieving|inquest|manslaughter|explosion|airstrike\w*|massacre)\b/i;
const NEWS_NOT_NAMES = /^(Prime Minister|Premier League|Champions League|New York|Black Friday|Bank Of England|White House|Downing Street|Northern Ireland|United States|United Kingdom|European Union|Labour Party|Conservative Party|Home Office|High Court|Supreme Court|World Cup|Formula One|Grand Prix|South Africa|North Korea|South Korea|Middle East|Hong Kong|Los Angeles|Royal Mail|Great British|Bake Off|Strictly Come|Come Dancing|I'm A|Get Me|Six Nations|Ryder Cup|Met Office|Office For|National Trust|Wall Street|Silicon Valley|Red Cross|Boxing Day|Christmas Day|New Year|Bonfire Night|St Andrew|Eurovision Song|Song Contest|BBC One|Channel Four|Sky News|Big Ben|Old Trafford|Wembley Stadium|Apple TV|Prime Video|Champions Trophy|Test Match)$/i;
const NEWS_STOP = /^(The|A|An|In|On|At|Of|For|And|To|By|As|Why|How|What|When|Who|Where|After|Before|Over|Under|From|With|But|Or|New|More|Live|Watch|Week|Is|Are|Was|Will|Can)$/;
function newsFlags(...parts) {
  const f = [], t = parts.join(" ");
  if (NEWS_TRAGIC.test(t)) f.push("tragedy");
  if (parts.some(nameIn)) f.push("name");
  return f;
}
function nameIn(t) {
  const words = String(t).replace(/[‘’]/g, "'").split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {   // two capitalised words together: probably a name
    const a = words[i].replace(/[^A-Za-z'-]/g, "").replace(/'s$/, ""), b = words[i + 1].replace(/[^A-Za-z'-]/g, "").replace(/'s$/, "");
    if ((i > 0 && /[.:!?]$/.test(words[i - 1])) || /[.:,;!?]$/.test(words[i])) continue;   // a new sentence or clause, not a name
    const cap = (w, n) => new RegExp("^[A-Z][A-Za-z'-]{" + n + ",}$").test(w) && /[a-z]/.test(w);   // also McCaffrey, CeeDee, O'Neill
    if (cap(a, 1) && cap(b, 2) && !NEWS_STOP.test(a) && !NEWS_NOT_NAMES.test(a + " " + b)) return true;
  }
  return false;
}
function xmlText(x) { return String(x || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").trim(); }
function xmlTag(block, tag) { const m = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">").exec(block); return m ? xmlText(m[1]) : ""; }
function xmlItems(xml, tag) { return String(xml).split(new RegExp("<" + tag + "(?:\\s[^>]*)?>")).slice(1).map((b) => b.split("</" + tag + ">")[0]); }
async function headlinesGet(env, force) {
  const c = (await env.PENDING.get(NEWS_KEY, "json")) || null, now = Date.now();
  if (c && !force && now - c.at < 55 * 60e3) return c;
  if (c && force && now - c.at < 2 * 60e3) return c;
  const get = (u) => fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; IntrovertHereApp/1.0)", Accept: "application/rss+xml, application/xml, text/xml" }, cf: { cacheTtl: 600 } }).then((r) => r.ok ? r.text() : Promise.reject(new Error(String(r.status))));
  const out = { at: now, bbc: (c && c.bbc) || [], trends: (c && c.trends) || [], err: [] };
  const [b, g] = await Promise.allSettled([get("https://feeds.bbci.co.uk/news/rss.xml?edition=uk"), get("https://trends.google.com/trending/rss?geo=GB")]);
  if (b.status === "fulfilled") {
    const L = xmlItems(b.value, "item").map((it) => ({ t: xmlTag(it, "title"), d: xmlTag(it, "description"), u: xmlTag(it, "link") })).filter((x) => x.t).slice(0, 15);
    if (L.length) out.bbc = L.map((x) => Object.assign(x, { f: newsFlags(x.t, x.d) })); else out.err.push("BBC feed was empty");
  } else out.err.push("BBC feed didn't answer (" + b.reason.message + ")");
  if (g.status === "fulfilled") {
    const L = xmlItems(g.value, "item").map((it) => {
      const news = xmlItems(it, "ht:news_item").map((n) => ({ t: xmlTag(n, "ht:news_item_title"), u: xmlTag(n, "ht:news_item_url"), s: xmlTag(n, "ht:news_item_source") })).filter((n) => n.t).slice(0, 2);
      return { q: xmlTag(it, "title"), n: xmlTag(it, "ht:approx_traffic"), news };
    }).filter((x) => x.q).slice(0, 15);
    if (L.length) out.trends = L.map((x) => Object.assign(x, { f: Array.from(new Set(newsFlags(...x.news.map((n) => n.t)).concat(/^[a-z]+ [a-z]+$/i.test(x.q) && x.news.some((n) => n.t.toLowerCase().includes(x.q.toLowerCase()) && newsFlags("x " + n.t.slice(n.t.toLowerCase().indexOf(x.q.toLowerCase()), n.t.toLowerCase().indexOf(x.q.toLowerCase()) + x.q.length)).includes("name")) ? ["name"] : []))) }));
    else out.err.push("Google Trends was empty");
  } else out.err.push("Google Trends didn't answer (" + g.reason.message + ")");
  if (!out.err.length) delete out.err;
  if (!out.bbc.length && !out.trends.length && c) return Object.assign(c, { err: out.err });
  await env.PENDING.put(NEWS_KEY, JSON.stringify(out));
  return out;
}

async function gagSave(request, env) {
  if (!env.MAKE_GAG_HOOK) return json({ error: "MAKE_GAG_HOOK is not set" }, 500);
  const d = await request.json();
  const action = str(d.action);
  if (!["fill", "append", "edit"].includes(action)) return json({ error: "Unknown action" }, 400);
  const body = {
    ref: crypto.randomUUID(), action, gagId: str(d.gagId), collection: str(d.collection), category: str(d.category),
    text: String(d.text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, ""), stem: str(d.stem), tag12: "auto", tag13: "auto", // seasonal tags: always rotated by the tag engine (Barry, 10 Nov 2026)
    d1: str(d.d1), d2: str(d.d2), d3: str(d.d3), d4: str(d.d4), datesFromSlot: d.datesFromSlot ? "true" : "false", ...gagParts(d.parts),
  };
  const ds = [body.d1, body.d2, body.d3, body.d4];   // all four dates, or none (backlog; Exclusive gags have no schedule)
  if (!body.text || !body.collection || !body.category || !body.stem || !(ds.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || ds.every((x) => !x))) {
    return json({ error: "Please fill in the gag, collection, category, title stem and all four dates (or leave all four empty)." }, 400);
  }
  const res = await fetch(env.MAKE_GAG_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return json({ error: "Make didn't accept the save (" + res.status + "). Nothing was written." }, 502);
  if (str(d.season) && body.gagId) { const L = (await env.PENDING.get("season-locks", "json")) || {}; L[body.gagId] = str(d.season).slice(0, 40); await env.PENDING.put("season-locks", JSON.stringify(L)); }
  const saves = await loadSaves(env);
  saves.unshift({ ref: body.ref, action, gagId: body.gagId, stem: body.stem, text: body.text, status: "pending", at: Date.now() });
  await env.PENDING.put(SAVES_KEY, JSON.stringify(saves.slice(0, 50)));
  return json({ ok: true, ref: body.ref });
}

async function gagsPage(env) {
  const g = await env.PENDING.get("gags", "json");
  const catMap = await loadCategories(env);
  // Gags the Best season option must never bump: already placed for an occasion, or tags approved/frozen.
  const locks = (await env.PENDING.get("season-locks", "json")) || {};
  const tagItems = (((await env.PENDING.get("tags", "json")) || {}).items) || [];
  const poolsKV = (await env.PENDING.get(POOLS_KEY, "json")) || { tag: [] };
  const catWords = {}; poolsKV.tag.forEach((x) => { if (x.on && x.g === "GAG") (catWords[x.p] = catWords[x.p] || []).push(x.t); });
  const lockIds = Array.from(new Set([...Object.keys(locks), ...tagItems.filter((t) => t.approved === true || t.approved === "True" || t.frozen).map((t) => t.id)]));
  if (g) g.categories = Array.from(new Set([...(g.categories || []), ...Object.values(catMap).flat()]));
  const saves = await loadSaves(env);
  const savesHtml = saves.length ? `<h3 class="sideh">Recent saves</h3><div class="saves">${saves.slice(0, 8).map((x) => {
    const cls = x.status === "ok" ? "ok" : x.status === "failed" ? "bad" : "wait";
    const label = x.status === "ok" ? "✓ " + esc(x.message || "Saved to Core") : x.status === "failed" ? "<b>Not saved</b><br>" + esc(x.message || "") : "Saving to Core…";
    return `<div class="sv"><div class="svt"><b>${esc(x.stem || "")}</b><span>${esc(when(x.at))}</span></div><div class="status ${cls}">${label}</div></div>`;
  }).join("")}</div>` : "";
  return shell(`
${brandHeader("Gags")}
<div class="small" id="synced">${g ? "Core read " + esc(when(g.at)) : "Not read from Core yet. Tap Sync to Core."}</div>
<form id="form" class="gwrap">
  <div class="gacts o-acts"><a class="btn link" href="/check">${icon("check")}Check for problems</a><button class="btn" id="refresh" type="button">${icon("sync")}Sync to Core</button></div>
  <div class="gcol gL">
    <div class="frame g-prev o-prev"><div class="card"><div class="prevhead"><h3 class="sideh">Preview</h3><span class="lamp" id="lFit">Fits</span><span class="lamp" id="lSpell">Spelling</span></div><div id="stage"><div id="pbox"></div></div></div></div>
    ${savesHtml ? `<div class="card g-saves o-saves">${savesHtml}</div>` : ""}
  </div>
  <div class="gcol gR">
    <div class="wzhead o-wzbar"><a class="btn wzlist" id="wzList" hidden>‹ Back to list</a><div class="wzbar" id="wzBar"></div><div class="wznav"><button class="btn" type="button" id="wzNext">Next</button><button class="btn" type="button" id="wzBack">Back</button><button class="btn-main" type="submit" form="form" id="save">Save to Core</button></div></div>
    <div class="tabs o-tabs" data-st="1"><button class="btn tab on" data-tab="new" type="button">New gag</button><button class="btn tab" data-tab="edit" type="button">Edit unreleased</button></div>
    <div id="pick" data-st="1" class="card o-pick" style="display:none"><input id="search" placeholder="Search by ID, text or title stem…"><div id="results" style="margin-top:8px;max-height:320px;overflow:auto"></div></div>
    <div class="card g-text o-text" data-st="2"><label><b>Gag</b> <span class="small">(press Enter for a new line, exactly as it should appear)</span>
      <textarea id="text" rows="8" required spellcheck="true"></textarea></label><div id="boxes"></div><div id="pwarn"></div><div id="dupwarn"></div><div id="spell"></div>
      <details id="ideasBox" class="ideas"><summary>Ideas inbox <span id="ideasN" class="small"></span></summary><div id="ideasL"></div></details></div>
    <div class="card g-side">
      <div class="fld o-range" data-st="1"><b>Range</b><div class="chips" id="rangeChips"></div><select id="collection" class="hid" tabindex="-1" aria-hidden="true"></select>
        <div id="slot" class="small" style="display:none"></div><div id="rangeCount"></div></div>
      <div class="fld o-stem" data-st="3"><label><b>Title stem</b><input id="stem" required maxlength="60" autocapitalize="words" autocomplete="off"><span class="small" id="stemnote" style="display:block;margin-top:10px"></span></label><div id="stemspell"></div></div>
      <div class="fld o-stars" data-st="5"><b>Your rating <span class="small" style="font-weight:400">(optional: your best gags get the best seasonal slots)</span></b><div class="chips" id="starChips"></div></div>
      <div class="fld o-cat" data-st="4"><b>Gag category</b><div class="chips" id="catChips"><span class="small">Choose a range first.</span></div><select id="category" class="hid" tabindex="-1" aria-hidden="true"></select></div>
      <input type="hidden" id="tag12" value="auto"><input type="hidden" id="tag13" value="auto">
      <div class="fld o-season" data-st="5"><b>Best season <span class="small" style="font-weight:400">(optional)</span></b><div class="chips" id="seasonChips"></div><div id="seasonNote" class="small" style="margin-top:8px"></div></div>
      <div class="fld o-extopic" data-st="9"><b>Topic &amp; checks</b>
        <div id="exTopicNow" class="small"></div>
        <div class="extags"><label>Topic tag 1 <span class="small excnt" id="exc1"></span><input id="ext1" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false"></label><div class="exw" id="exw1"></div>
          <label>Topic tag 2 <span class="small excnt" id="exc2"></span><input id="ext2" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false"></label><div class="exw" id="exw2"></div></div>
        <div class="exsec"><b class="small">All 13 Etsy tags</b><div id="ex13"></div></div>
        <div class="exsec"><b class="small">Hashtags for Instagram and Facebook <span style="font-weight:400">(tap to switch on or off)</span></b><div class="chips" id="exHash"></div><div class="exadd"><input id="exHashAdd" placeholder="Add a hashtag" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn" type="button" id="exHashGo">Add</button></div><div class="small">Events are fine; never a person's name.</div></div>
        <div class="exsec"><b class="small">Use by</b><div class="chips" id="exUse"></div><p class="small" style="margin:6px 0 0">You get a reminder 1 hour and 4 hours after it's ready to approve. If it still isn't approved by the use-by time, the app tells you so you can scrap it.</p></div>
        <div class="exsec exchk"><b class="small">Before it's made</b><label><input type="checkbox" class="exck"> No names: it isn't about a real person</label><label><input type="checkbox" class="exck"> No tragedy: nobody died or got hurt</label><label><input type="checkbox" class="exck"> It's about what happened, not who people are</label></div>
        <p class="small" style="margin:10px 0 0">T-shirt only. It's built straight away and nothing goes live until you approve it in Approvals.</p></div>
      <div class="fld o-garm" data-st="9"><b>Garments to list now</b><div class="chips" id="garmChips"></div><p class="small" style="margin:8px 0 0">Each garment is built one after another, about 15 minutes each. T-shirt only is quickest.</p></div>
      <div class="fld o-dates" data-st="6"><b>Release dates</b>
        <div class="four">
          <label>T-Shirt<input type="date" id="d1"></label><label>Long-Sleeve<input type="date" id="d2"></label>
          <label>Sweatshirt<input type="date" id="d3"></label><label>Hoodie<input type="date" id="d4"></label>
        </div><p class="small" style="margin:8px 0 0">Leave all four empty to save the gag to the backlog. It won't release until it has dates.</p>
        <p class="small" id="nowHint" style="margin:10px 0 0">Tap <b>Now</b> on a garment to publish it straight away instead of waiting for its date.</p></div>
      <div class="fld o-save" style="display:flex;gap:10px"><button class="btn" type="button" id="clear">Clear</button><button class="btn" type="button" id="ideaSave">Save as idea</button></div>
    </div>
  </div>
</form>
<style>
  /* Form on the left, preview and recent saves on the right (Barry, 13 Nov: works better in split screen). */
  .gwrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);grid-template-areas:"R L" "acts L";grid-template-rows:auto 1fr;gap:16px;align-items:start;margin-top:4px}
  .gacts{grid-area:acts;display:flex;gap:8px;flex-wrap:wrap}.gacts .btn{flex:1}
  .gL{grid-area:L}.gR{grid-area:R}
  .warnbox{margin-top:8px;padding:10px 12px;border-radius:10px;background:rgba(230,180,80,.14);border:1px solid rgba(230,180,80,.5);font-size:14px}.warnbox a{color:var(--text)}
  .ideas{margin-top:12px}.ideas summary{cursor:pointer;font:800 12px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:6px 0}
  .idea{display:flex;gap:8px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}.idea .itx{flex:1;font-size:14px}.idea .btn{width:auto;min-height:40px;padding:0 12px}
  .chip.sugg::after{content:" · suggested";font-weight:400;opacity:.7}
  /* Step by step on the left (Barry, 14 Nov): one question at a time, so the keyboard never hides the rest. */
  .gR [data-st]:not(.cur){display:none!important}
  .wzbar{display:flex;gap:6px;flex-wrap:wrap}
  .wzbar button{font:600 13px Montserrat,sans-serif;padding:7px 12px;border-radius:99px;border:1px solid var(--line);background:var(--field);color:var(--muted);cursor:pointer}
  .wzbar button.on{background:var(--accent);border-color:var(--accent);color:#141413}
  .wzbar button.done{color:var(--text)}
  .wzhead{position:sticky;top:var(--stick,calc(62px + env(safe-area-inset-top,0px)));z-index:14;display:flex;flex-direction:column;gap:10px;padding:10px;margin:-10px;border-radius:var(--r);background:rgba(20,20,19,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  .wznav{display:flex;gap:8px}.wznav .btn,.wznav .btn-main{flex:1;min-height:50px;margin:0;width:auto}
  #wzNext{border-color:var(--accent)}
  /* Keyboard open (Barry, 14 Nov): only the box being typed in and a small Next. */
  .wzlist{align-self:flex-start;min-height:40px;padding:0 16px}.wzlist[hidden],#backList[hidden]{display:none!important}
  body.kb .wzlist,body.kb .wzbar,body.kb #save,body.kb .o-save,body.kb .o-tabs,body.kb #ideasBox,body.kb .o-text label>b,body.kb .o-text label>.small{display:none!important}
  body.kb .wzhead{padding:6px 10px;gap:0;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;margin:0;align-items:flex-start;pointer-events:none}
  body.kb .wznav{justify-content:flex-start;pointer-events:auto}
  body.kb #wzNext,body.kb #wzBack{flex:none;min-height:40px;padding:0 22px;background:var(--card)}
  body.kb .o-text{padding:10px}body.kb .o-text textarea{margin-top:0}
  .wzmsg{color:var(--warn);font-size:14px;margin-top:8px}
  .nowbtn{float:right;font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:99px;border:1px solid var(--line);background:var(--field);color:var(--muted);cursor:pointer}
  .nowbtn.on{background:#e6b450;border-color:#e6b450;color:#141413}
  .four input.isnow{opacity:.35}
  .qmodal{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px}
  .qmodal .box{max-width:440px;width:100%;background:var(--card,#1c1c1b);border:1px solid var(--line);border-radius:16px;padding:20px;backdrop-filter:blur(12px)}
  .qmodal h3{margin:0 0 8px;font-size:17px}.qmodal p{margin:0 0 12px;font-size:14px;color:var(--muted)}
  .qmodal .row{display:flex;gap:10px;align-items:center;margin:10px 0}.qmodal .row input{width:90px;margin:0}
  .qmodal .acts{display:flex;flex-direction:column;gap:8px;margin-top:14px}.qmodal .acts button{width:100%;margin:0}
  #rangeCount{margin-top:14px;display:flex;flex-direction:column;gap:10px}
  .rc{font-size:14px}.rc b{font-weight:700}.rc .rch{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:6px}
  .rc .rbar{height:10px;border-radius:99px;background:var(--line);overflow:hidden}.rc .rbar i{display:block;height:100%;border-radius:99px;background:var(--ok)}
  .rc button{background:none;border:0;color:var(--accent);font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:0}
  .rc.sel{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--field)}
  .chip.star{color:#f0c870;letter-spacing:1px}.chip.star.on{border-color:#f0c870;background:rgba(240,200,112,.14)}
  /* Preview stays pinned under the header while the rest scrolls beneath it. */
  .gL .g-prev{position:sticky;top:var(--stick,calc(62px + env(safe-area-inset-top,0px)));z-index:15}
  /* The whole preview card is the black print area; the gag sits in it with margins (Barry, 13 Nov). */
  .g-prev .card{background:#000!important;box-shadow:0 12px 28px rgba(0,0,0,.65);padding:14px 16px 18px}
  .gL .g-prev .prevhead{margin-bottom:6px}
  /* Exclusive (Barry, 15 Nov): cream page like the finished print, three boxes left-aligned. */
  .g-prev .card.ex{background:#ECE3CF!important}
  .card.ex .sideh{color:#5a5345}.card.ex .lamp{color:#5a5345;border-color:#c9bea6}.card.ex .lamp::before{background:#b4a98f}
  .card.ex .lamp.ok{color:#2e7d4f;border-color:#2e7d4f}.card.ex .lamp.ok::before{background:#2e7d4f}
  .card.ex .lamp.bad{color:#b3261e;border-color:#b3261e}.card.ex .lamp.bad::before{background:#b3261e}
  .expage{position:absolute;top:0;width:3951px;height:4919px;transform-origin:top left;background:#ECE3CF;overflow:hidden}
  .expage>*{position:absolute;margin:0}
  .expage .exr{height:14px;background:#000;left:175.5px;width:3600px}
  .expage .ext{white-space:pre-wrap;overflow-wrap:break-word;letter-spacing:-0.04em;text-align:left}
  .expage .ext.ph{opacity:.18}.expage .ext.over{color:#b3261e}
  .extags label{display:block;margin-top:10px}.excnt{float:right}.excnt.bad,.exw .bad{color:var(--warn)}.exw{font-size:13px;margin-top:4px;min-height:0}
  .exsec{margin-top:16px}.exsec>b{display:block;margin-bottom:6px}
  #ex13{display:flex;flex-wrap:wrap;gap:6px}#ex13 span{font-size:12.5px;padding:5px 9px;border-radius:99px;border:1px solid var(--line);background:var(--field)}
  #ex13 span.k{border-color:#d8262c}#ex13 span.miss{border-style:dashed;color:var(--warn)}#ex13 i{font-style:normal;color:var(--muted);font-size:11px;margin-right:4px}
  .exadd{display:flex;gap:8px;margin-top:8px}.exadd input{margin:0}.exadd .btn{width:auto;margin:0;min-height:44px;padding:0 16px}
  .exchk label{display:flex;gap:10px;align-items:center;padding:8px 0;font-size:14.5px}.exchk input{width:22px;height:22px;margin:0;flex:none}
  #exHash .chip{min-height:40px;font-weight:600}
  .draftnote{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #e6b450;border-radius:12px;background:rgba(230,180,80,.12);font-size:14px}.draftnote .btn{width:auto;min-height:38px;padding:0 14px;margin:0}
  #boxes{display:flex;flex-direction:column;gap:14px}#boxes:empty{display:none}
  #boxes label>b{display:inline}#boxes textarea{min-height:0;height:auto}
  .bxn{font-size:13px;color:var(--muted);margin-top:4px}.bxn.bad{color:var(--warn)}
  body.kb #boxes label>.small{display:none}
  .news{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--field)}
  .news summary{cursor:pointer;font:800 12px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  #newsL{max-height:360px;overflow:auto;margin-top:8px;display:flex;flex-direction:column;gap:6px}
  .nh{font:700 11px var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:8px 0 2px}
  .ni{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--text);font:14px Montserrat,sans-serif;cursor:pointer;display:block;width:100%}
  .ni b{font-weight:600}.ni .nd{display:block;font-size:12.5px;color:var(--muted);margin-top:4px}
  .nb{display:inline-block;margin-left:6px;font:700 10px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:99px;border:1px solid var(--warn);color:var(--warn);vertical-align:2px}
  .topic{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:2px solid #d8262c;border-radius:12px}.topic>div{flex:1;font-size:14px}.topic .btn{width:auto;min-height:36px;padding:0 12px;margin:0}
  .topic .warnt{color:var(--warn);margin-top:4px}
  #topicPick:empty{display:none}
  body.kb .news{display:none}
  .gcol{display:flex;flex-direction:column;gap:16px;min-width:0}
  .tabs{display:flex;gap:8px}.tabs .btn{flex:1}
  .g-side{display:flex;flex-direction:column;gap:18px}
  @media (max-width:820px){
    .gwrap{display:flex;flex-direction:column;align-items:stretch;gap:12px}
    .gcol,.g-side{display:contents}
    /* Phone (Barry, 14 Nov): buttons pinned at the top on the right, text box first, preview under it (not floating). */
    .o-wzbar{order:1}.o-tabs{order:2}.o-pick{order:3}.o-text{order:4}.o-prev{order:5}.o-stem{order:6}.o-range{order:3}.o-cat{order:7}.o-stars{order:7}.o-season{order:8}.o-dates{order:8}.o-garm{order:8}.o-save{order:9}.o-acts{order:10}.o-saves{order:11}
    .gL .g-prev{position:static}
    .wzhead{margin:0;padding:8px 0;border-radius:0;gap:8px}
    .wzbar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.wzbar::-webkit-scrollbar{display:none}.wzbar button{flex:none;padding:6px 10px;font-size:12px}
    .wznav{justify-content:flex-end}.wznav .btn,.wznav .btn-main{flex:none;min-height:46px;padding:0 18px}
    #save{order:0;margin-right:auto!important}#wzBack{order:1}#wzNext{order:2}
    body.kb .wzhead{align-items:flex-end;padding:6px 0;background:#0d0d0c;pointer-events:auto}
    body.kb #text,body.kb #stem{scroll-margin-top:calc(var(--stick,62px) + 72px)}
    body.kb .wznav{justify-content:flex-end}
    body.kb .o-prev .card{padding:10px 12px}
    #text{height:9.5em;min-height:7em}
    body.noprev .o-prev{display:none!important}
    body.kb .pagehead,body.kb .tabbar,body.kb #synced{display:none!important}

    .g-prev .card{padding:12px}
    .fld{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:15px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    .o-save.fld{background:none;border:0;padding:0;backdrop-filter:none}
    .gacts{justify-content:stretch}.gacts .btn{flex:1}
  }
  .fld>b{display:block;margin-bottom:8px}
  .prevhead{display:flex;align-items:center;gap:8px;margin-bottom:10px}.prevhead .sideh{margin:0;flex:1}
  .lamp{display:inline-flex;align-items:center;gap:6px;font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:99px;border:1.5px solid var(--line);color:var(--dim)}
  .lamp::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--dim)}
  .lamp.ok{color:var(--ok);border-color:rgba(143,208,171,.5)}.lamp.ok::before{background:var(--ok)}
  .lamp.bad{color:var(--warn);border-color:var(--warn)}.lamp.bad::before{background:var(--warn)}
  .lamp.wait::before{background:var(--info)}
  #pwarn .status.ok,#spell .status.ok{display:none}
  .hid{display:none!important}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chip{min-height:48px;padding:0 16px;border-radius:12px;border:2px solid var(--line);background:var(--field);color:var(--text);font:700 14px var(--display);letter-spacing:.02em;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
  .chip:hover{border-color:rgba(242,240,235,.6)}
  .chip.on{border:3px solid var(--c,var(--accent));padding:0 15px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4);color:var(--text)}
  .chip:disabled{opacity:.45;cursor:not-allowed}
  .chip i{width:10px;height:10px;border-radius:50%;flex:none}
  .chip.more{border-style:dashed;color:var(--muted);font-weight:600}
  #rangeChips .chip{flex:1 1 calc(50% - 8px);justify-content:flex-start}
  .sideh{margin:0 0 10px;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
  .saves{display:flex;flex-direction:column;gap:10px}
  .sv{border-top:1px solid var(--line);padding-top:10px}.sv:first-child{border-top:0;padding-top:0}
  .svt{display:flex;justify-content:space-between;gap:8px;font-size:14px}.svt span{color:var(--muted);font-size:12px;white-space:nowrap}
  .sv .status{margin-top:6px;padding:8px 10px;font-size:13px}
  #refresh.busy svg{animation:spin 1s linear infinite}
  select,input:not([type=checkbox]),textarea{display:block;width:100%;margin-top:6px;padding:12px;font-size:16px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--text);font-family:'Montserrat',sans-serif}
  select option{background:#1c1c1b;color:var(--text)}
  .tab.on{border:3px solid var(--accent);color:var(--text);background:var(--card)}
  @media (max-width:700px){.two{grid-template-columns:1fr}.four{grid-template-columns:1fr 1fr}.gagrow{flex-direction:column}}
  textarea{font-family:'Montserrat',sans-serif;line-height:1.35;resize:vertical}
  .gagrow{display:flex;gap:14px;flex-wrap:wrap}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:6px}
  #stage{margin:0;background:none;border-radius:0;padding:0;box-sizing:border-box;overflow:visible;position:relative;width:100%;min-height:60px}
  .gagrow > *{min-width:0}
  #pbox{position:absolute;left:14px;top:14px;transform-origin:top left;box-sizing:content-box;overflow:visible;color:#fff;font-family:'Montserrat',sans-serif;font-weight:400;line-height:1.2;letter-spacing:-0.04em;text-align:right}
  #pbox div{white-space:nowrap}
  #pbox .over{color:#ff9a8a}
  .result{padding:10px;border-top:1px solid var(--line);cursor:pointer}
  .result:hover{background:var(--bg)}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&family=Anton&family=Newsreader:ital,opsz,wght@1,6..72,400&display=swap" rel="stylesheet">
<script>
let G = ${JSON.stringify(g || null).replace(/</g, "\\u003c")};
window.GAG_CATS = ${JSON.stringify(catMap).replace(/</g, "\\u003c")};
window.SEASON_LOCK = ${JSON.stringify(lockIds)};
window.CAT_WORDS = ${JSON.stringify(catWords).replace(/</g, "\\u003c")};
window.GAG_STARS = ${JSON.stringify((await env.PENDING.get(STARS_KEY, "json")) || {})};
window.GAG_TARGETS = ${JSON.stringify((await env.PENDING.get("gag-targets", "json")) || {})};
window.EX_TAGSET = ${JSON.stringify((await env.PENDING.get("ex-tagset", "json")) || { product: [], gag: [] }).replace(/</g, "\\u003c")};
window.TAG_BLOCK = ${JSON.stringify(await tagBlocklist(env)).replace(/</g, "\\u003c")};
window.TEXT_RULES = ${JSON.stringify((((await env.PENDING.get("text-rules", "json")) || {}).rules) || {}).replace(/</g, "\\u003c")};
${GAGS_SCRIPT}
${GAG_CHIPS_SCRIPT}
${GAG_SEASON_SCRIPT}
${GAG_EXTRA_SCRIPT}
${GAG_LAMPS_SCRIPT}
${GAG_BOXES_SCRIPT}
${GAG_EX_SCRIPT}
${GAG_WIZARD_SCRIPT}
${GAG_DRAFT_SCRIPT}</script>`);
}

// Gag boxes per range, from Core's GAG_TEXT_RULES (Barry, 15 Nov). One-box ranges keep the classic gag box;
// a range with several boxes (EXCLUSIVE: headline, body, footer) gets one box each and a preview laid out like its Canva print page.
const GAG_BOXES_SCRIPT = String.raw`(function () {
  var R = window.TEXT_RULES || {}, col = document.getElementById("collection"), main = document.getElementById("text"), boxes = document.getElementById("boxes"), shown = "", stemTouched = false;
  // Canva page E001_EX_T-SHIRT_TEMPLATES, in its own units (read 15 Nov).
  var EX = { w: 3951, h: 4919, logo: [0, 175.5, 3621.9, 836.3], rules: [2360, 3781.5],
    GAG_HEADER: { top: 1080, left: 175.5, width: 3600, font: "Anton", size: 533.34, lh: 1.02, style: "normal", color: "#000" },
    GAG_BODY: { top: 2460, left: 175.5, width: 3600, font: "Newsreader", size: 254, lh: 1.25, style: "italic", color: "#111" },
    GAG_FOOTER: { top: 3939.5, left: 1700, width: 2075.5, font: "Anton", size: 166.333, lh: 1.25, style: "normal", color: "#000" } };
  function rules() { var r = R[col.value] || []; return r.length > 1 || (r[0] && r[0].col !== "GAG_TEXT") ? r : null; }
  window.isMulti = function () { return !!rules(); };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function vals() { var o = {}; boxes.querySelectorAll("textarea[data-col]").forEach(function (t) { o[t.dataset.col] = t.value.replace(/\r/g, "").replace(/\s+$/, ""); }); return o; }
  window.boxParts = function () { if (!rules()) return null; var v = vals(); Object.keys(v).forEach(function (k) { v[k] = v[k].replace(/\n[ \t]*(\n[ \t]*)+/g, "\n").trim(); }); return v; };
  window.boxesMissing = function () { var r = rules(); if (!r) return ""; var v = vals(), m = r.filter(function (x) { return x.req && !String(v[x.col] || "").trim(); });
    return m.length ? "Fill in the " + m.map(function (x) { return x.label.replace(/\s*\(.*$/, "").toLowerCase(); }).join(" and ") + "." : ""; };
  // One blank line between parts and none inside a part: the video splits GAG_TEXT on blank lines (EX thread, 16 Nov).
  function join() { var r = rules(), v = vals(); main.value = r.map(function (x) { return String(v[x.col] || "").replace(/\n[ \t]*(\n[ \t]*)+/g, "\n").trim(); }).filter(function (t) { return t.trim(); }).join("\n\n"); }
  function render() {
    var ed = typeof editing !== "undefined" ? editing : null, r = rules(), key = r ? col.value + "|" + (ed ? ed.id : "") : "";
    if (key === shown) return; shown = key;
    var lab = main.closest("label");
    if (!r) { var had = !!boxes.innerHTML; boxes.innerHTML = ""; lab.style.display = ""; main.required = true; if (had && !ed) { main.value = "... "; } return; }
    lab.style.display = "none"; main.required = false;
    var parts = (ed && ed.parts) || null, old = parts || !ed ? null : main.value.replace(/^[ .…]+$/, "").split(/\n\s*\n/);   // only an existing gag being edited is split into boxes
    boxes.innerHTML = (col.value === "EXCLUSIVE" ? newsBox() : "") + r.map(function (x, i) {
      var v = parts ? parts[x.col] || "" : (old && old[i]) || "";
      return '<label><b>' + esc(x.label) + '</b> <span class="small">(' + x.lines + " line" + (x.lines === 1 ? "" : "s") + " max" + (x.case === "UPPER" ? ", capitals" : "") + ')</span>' +
        '<textarea data-col="' + esc(x.col) + '" data-case="' + esc(x.case) + '" rows="' + Math.min(4, x.lines + 1) + '" spellcheck="true">' + esc(v) + '</textarea></label><div class="bxn" data-n="' + esc(x.col) + '"></div>';
    }).join("");
    join(); if (col.value === "EXCLUSIVE") newsFill();
  }
  // Today's headlines (Barry, 16 Nov): tap one to make it the topic; the gag itself is still yours to write.
  var NEWS = null, TOPIC = null;
  function newsBox() { return '<details class="news" open><summary>Today’s headlines <span class="small" id="newsAt"></span></summary><div id="newsL"><div class="small">Loading…</div></div></details><div id="topicPick"></div>'; }
  function badge(f) { return (f || []).map(function (x) { return '<span class="nb ' + x + '">' + (x === "name" ? "names someone?" : "tragedy?") + "</span>"; }).join(""); }
  function newsFill() {
    var L = document.getElementById("newsL"); if (!L) return; topicDraw();
    if (!NEWS) { fetch("/api/headlines").then(function (r) { return r.json(); }).then(function (j) { NEWS = j; newsFill(); }).catch(function () { L.innerHTML = '<div class="small">Couldn’t load the headlines right now.</div>'; }); return; }
    var at = document.getElementById("newsAt"); if (at && NEWS.at) at.textContent = "· updated " + new Date(NEWS.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    var h = "";
    if ((NEWS.trends || []).length) h += '<div class="nh">Trending searches in the UK</div>' + NEWS.trends.slice(0, 10).map(function (x, i) { return '<button type="button" class="ni" data-news="g' + i + '"><b>' + esc(x.q) + "</b>" + (x.n ? ' <span class="small">' + esc(x.n) + " searches</span>" : "") + badge(x.f) + (x.news && x.news[0] ? '<span class="nd">' + esc(x.news[0].t) + "</span>" : "") + "</button>"; }).join("");
    if ((NEWS.bbc || []).length) h += '<div class="nh">Top UK headlines (BBC)</div>' + NEWS.bbc.slice(0, 10).map(function (x, i) { return '<button type="button" class="ni" data-news="b' + i + '"><b>' + esc(x.t) + "</b>" + badge(x.f) + "</button>"; }).join("");
    L.innerHTML = h || '<div class="small">No headlines yet' + (NEWS.err ? " (" + esc(NEWS.err.join("; ")) + ")" : "") + ". They refresh every hour.</div>";
  }
  function topicDraw() {
    var t = document.getElementById("topicPick"); if (!t) return;
    t.innerHTML = TOPIC ? '<div class="topic"><div><span class="small">Topic</span> <b>' + esc(TOPIC.t) + "</b>" + badge(TOPIC.f) + (TOPIC.tags.length ? '<div class="small">Suggested topic tags: ' + TOPIC.tags.map(esc).join(", ") + "</div>" : "") +
      ((TOPIC.f || []).length ? '<div class="small warnt">Remember: no names, no tragedy, nothing about who people are.</div>' : "") + '</div><button type="button" class="btn" data-topic-x="1">✕</button></div>' : "";
  }
  window.exTopic = function () { return TOPIC; };
  boxes.addEventListener("click", function (e) {
    var x = e.target.closest("[data-topic-x]"); if (x) { TOPIC = null; topicDraw(); var d = boxes.querySelector(".news"); if (d) d.open = true; return; }
    var b = e.target.closest("[data-news]"); if (!b || !NEWS) return;
    var k = b.dataset.news, i = Number(k.slice(1)), yr = String(new Date().getFullYear());
    if (k[0] === "g") { var g = NEWS.trends[i], q = g.q.toLowerCase().trim(); TOPIC = { t: g.q, f: g.f, tags: [q.slice(0, 20)].concat((q + " " + yr).length <= 20 && q.indexOf(yr) < 0 ? [q + " " + yr] : []) }; }
    else { var n = NEWS.bbc[i]; TOPIC = { t: n.t, f: n.f, tags: [] }; }
    topicDraw(); var d = boxes.querySelector(".news"); if (d) d.open = false;
    var h = boxes.querySelector('textarea[data-col="GAG_HEADER"]'); if (h) h.focus();
  });
  boxes.addEventListener("input", function (e) {
    var t = e.target; if (!t.dataset || !t.dataset.col) return;
    if (t.dataset.case === "UPPER") { var u = t.value.toUpperCase(); if (u !== t.value) { var a = t.selectionStart, b = t.selectionEnd; t.value = u; t.setSelectionRange(a, b); } }
    if (t.dataset.col === "GAG_HEADER" && !stemTouched && typeof properStem === "function") { var st = document.getElementById("stem"); st.value = properStem(t.value.replace(/\s+/g, " ")).trim().slice(0, 60); if (typeof stemNote === "function") stemNote(); }
    join(); var m = document.querySelector(".wzmsg"); if (m) m.remove();
    if (typeof preview === "function") preview(); if (typeof checkLater === "function") checkLater("text", "spell", "gag");
  });
  document.getElementById("stem").addEventListener("input", function (e) { if (e.isTrusted) stemTouched = true; });
  document.getElementById("form").addEventListener("reset", function () { stemTouched = false; setTimeout(function () { shown = "-"; render(); window.exPreview(); }, 0); });
  col.addEventListener("change", function () { render(); });
  // Preview: the whole print page, scaled to fit, boxes where Canva has them. Lines are counted as the browser wraps them.
  window.exPreview = function () {
    render();
    var card = document.querySelector(".g-prev .card"), stage = document.getElementById("stage"), pbox = document.getElementById("pbox"), page = document.getElementById("expage"), r = rules();
    card.classList.toggle("ex", !!r);
    var pl = document.getElementById("plogo");
    if (!r || col.value !== "EXCLUSIVE") { if (page) page.remove(); pbox.style.display = ""; if (pl) pl.style.visibility = ""; return false; }
    pbox.style.display = "none"; if (pl) pl.style.visibility = "hidden";
    if (!page) { page = document.createElement("div"); page.id = "expage"; page.className = "expage"; stage.appendChild(page); }
    var v = vals(), html = '<img src="/assets/ex-logo.png" alt="" style="top:' + EX.logo[0] + 'px;left:' + EX.logo[1] + 'px;width:' + EX.logo[2] + 'px;height:' + EX.logo[3] + 'px">' +
      EX.rules.map(function (t) { return '<div class="exr" style="top:' + t + 'px"></div>'; }).join("");
    r.forEach(function (x) { var L = EX[x.col]; if (!L) return; var t = v[x.col] || "";
      html += '<div class="ext' + (t.trim() ? "" : " ph") + '" data-c="' + esc(x.col) + '" style="top:' + L.top + 'px;left:' + L.left + 'px;width:' + L.width + 'px;font:' + L.style + " 400 " + L.size + "px/" + L.lh + " '" + L.font + "'," + (L.font === "Anton" ? "Impact,sans-serif" : "Georgia,serif") + ';color:' + L.color + '">' + esc(t.trim() ? t : x.label.replace(/\s*\(.*$/, "")) + "</div>"; });
    page.innerHTML = html;
    var sc = Math.min(stage.clientWidth / EX.w, Math.min(560, window.innerHeight * 0.62) / EX.h);
    page.style.transform = "scale(" + sc + ")"; page.style.left = Math.max(0, (stage.clientWidth - EX.w * sc) / 2) + "px";
    stage.style.height = EX.h * sc + "px";
    var warn = [];
    r.forEach(function (x) { var L = EX[x.col], d = page.querySelector('[data-c="' + x.col + '"]'), n = boxes.querySelector('[data-n="' + x.col + '"]'), t = v[x.col] || "";
      if (!d || !n) return; if (!t.trim()) { n.textContent = ""; n.className = "bxn"; return; }
      var lines = Math.round(d.scrollHeight / (L.size * L.lh)), name = x.label.replace(/\s*\(.*$/, "");
      if (lines > x.lines) { d.classList.add("over"); warn.push(name + " runs to " + lines + " lines on the shirt; it holds " + x.lines + "."); }
      n.textContent = lines + " of " + x.lines + " line" + (x.lines === 1 ? "" : "s"); n.className = "bxn" + (lines > x.lines ? " bad" : ""); });
    var any = r.some(function (x) { return String(v[x.col] || "").trim(); });
    document.getElementById("pwarn").innerHTML = warn.length ? '<div class="status bad">' + warn.join("<br>") + "</div>" : any ? '<div class="status ok">Fits the print.</div>' : "";
    return true;
  };
  if (document.fonts) Promise.all([document.fonts.load("400 100px Anton", "W"), document.fonts.load("italic 400 100px Newsreader", "W")]).then(function () { if (window.isMulti()) window.exPreview(); }).catch(function () {});
})();`;

// Unsaved draft (Barry, 16 Nov): everything typed or picked is kept in this browser as you go and put back when the
// page opens again, so a reload, a tab switch on the tablet or a crash never loses a gag. Cleared once it's saved.
const GAG_DRAFT_SCRIPT = String.raw`(function () {
  var KEY = "gagDraft:v1", t = null, restoring = false;
  function el(id) { return document.getElementById(id); }
  function boxVals() { var o = {}; document.querySelectorAll("#boxes textarea[data-col]").forEach(function (x) { o[x.dataset.col] = x.value; }); return o; }
  function realText(v) { return String(v || "").replace(/^[\s.…]+/, "").trim(); }
  window.gagDirty = function () {
    var b = boxVals(); if (Object.keys(b).some(function (k) { return b[k].trim(); })) return true;
    return !!(realText(el("text").value) || el("stem").value.trim() || el("category").value || (el("pick") && el("pick").style.display === "block" && typeof editing !== "undefined" && editing));
  };
  function snap() {
    if (restoring || (typeof mode !== "undefined" && mode === "edit")) return;
    if (!window.gagDirty()) { try { localStorage.removeItem(KEY); } catch (e) {} return; }
    var d = { at: Date.now(), collection: el("collection").value, category: el("category").value, text: el("text").value, parts: boxVals(), stem: el("stem").value,
      dates: ["d1", "d2", "d3", "d4"].map(function (k) { return el(k).value; }), touched: typeof datesTouched !== "undefined" && datesTouched, stars: window.starPick || 0, ex: window.exState ? window.exState() : null, now: new URLSearchParams(location.search).get("now") === "1" };
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }
  function later() { clearTimeout(t); t = setTimeout(snap, 400); }
  ["input", "change", "click"].forEach(function (ev) { el("form").addEventListener(ev, later, true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) snap(); });
  window.addEventListener("pagehide", snap);
  window.gagDraftClear = function () { clearTimeout(t); restoring = true; try { localStorage.removeItem(KEY); } catch (e) {} };
  el("clear").addEventListener("click", function () { setTimeout(function () { if (!window.gagDirty()) window.gagDraftClear(), restoring = false; }, 50); });
  function fire(x, ev) { x.dispatchEvent(new Event(ev, { bubbles: true })); }
  function restore() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!d || Date.now() - d.at > 14 * 864e5) return;
    if (new URLSearchParams(location.search).get("edit")) return;   // opening a specific gag to edit: leave the draft for later
    if (window.gagDirty()) return;
    restoring = true;
    try {
      if (d.collection && Array.prototype.some.call(el("collection").options, function (o) { return o.value === d.collection; })) { el("collection").value = d.collection; fire(el("collection"), "change"); }
      var multi = window.isMulti && window.isMulti();
      if (multi) { document.querySelectorAll("#boxes textarea[data-col]").forEach(function (x) { if (d.parts && d.parts[x.dataset.col] != null) { x.value = d.parts[x.dataset.col]; fire(x, "input"); } }); }
      else if (realText(d.text)) { el("text").value = d.text; fire(el("text"), "input"); }
      if (d.category) { if (!Array.prototype.some.call(el("category").options, function (o) { return o.value === d.category; })) { var o = document.createElement("option"); o.value = o.textContent = d.category; el("category").appendChild(o); } el("category").value = d.category; fire(el("category"), "change"); }
      if (d.stem) { el("stem").value = d.stem; fire(el("stem"), "input"); }
      if (d.touched && d.dates) { ["d1", "d2", "d3", "d4"].forEach(function (k, i) { el(k).value = d.dates[i] || ""; }); try { datesTouched = true; } catch (e) {} }
      if (d.stars) window.starPick = d.stars;
      if (d.ex && window.exRestore && el("collection").value === "EXCLUSIVE") window.exRestore(d.ex);
    } catch (e) {}
    restoring = false;
    var note = document.createElement("div"); note.className = "draftnote";
    note.innerHTML = "<span>Your unsaved gag from " + new Date(d.at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + " is back.</span><button type=\"button\" class=\"btn\">Discard it</button>";
    var gr = document.querySelector(".gR"); gr.insertBefore(note, gr.children[1] || null);
    note.querySelector("button").onclick = function () { if (!confirm("Throw away the restored gag?")) return; window.gagDraftClear(); location.reload(); };
    setTimeout(function () { var w = document.querySelector("[data-go='2']"); if (w) w.click(); }, 50);
  }
  setTimeout(restore, 150);
})();`;

// Exclusive "create now" step (Barry, 16 Nov): two topic tags (checked against the trade-mark blocklist), the full
// 13-tag preview, hashtags to approve, a use-by time and the three checks. Always T-shirt only, never auto-published.
const GAG_EX_SCRIPT = String.raw`(function () {
  var USE = [24, 48, 72], useBy = 48, HASH = {}, HASHON = {}, AUTO = {}, lastTopic = "";
  function el(id) { return document.getElementById(id); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9 &'-]/g, " ").replace(/\s+/g, " ").replace(/^ /, ""); }
  function blocked(t) { var s = " " + norm(t).trim() + " "; return (window.TAG_BLOCK || []).filter(function (b) { return b && s.indexOf(" " + b + " ") >= 0; })[0] || ""; }
  function titleTag() { var s = String(el("stem").value || "").replace(/\s+/g, " ").trim().toLowerCase(); if (s.length <= 20) return s; return s.split(" ").reduce(function (a, b) { return b.length > a.length ? b : a; }, "").slice(0, 20); }
  function topicTags() { return [norm(el("ext1").value).trim(), norm(el("ext2").value).trim()]; }
  function checkTag(i) {
    var inp = el("ext" + i), v = norm(inp.value); if (v !== inp.value) { var a = inp.selectionStart; inp.value = v; try { inp.setSelectionRange(a, a); } catch (e) {} }
    var t = v.trim(), c = el("exc" + i), w = el("exw" + i), b = blocked(t), other = topicTags()[2 - i];
    c.textContent = t.length + "/20"; c.className = "small excnt" + (t.length > 20 ? " bad" : "");
    var msg = t.length > 20 ? "Too long for Etsy (20 letters at most)." : b ? "“" + b + "” is a trade mark (on the blocklist), so Etsy could take the listing down." : t && t === other ? "Same as the other topic tag." : "";
    w.innerHTML = msg ? '<span class="bad">' + esc(msg) + "</span>" : ""; return !msg;
  }
  function draw13() {
    var T = window.EX_TAGSET || {}, tt = topicTags(), all = [];
    (T.product || []).forEach(function (x) { all.push(["Product", x]); });
    (T.gag || []).forEach(function (x) { all.push(["Topical", x]); });
    all.push(["Title", titleTag()]); all.push(["Topic", tt[0]]); all.push(["Topic", tt[1]]);
    el("ex13").innerHTML = all.map(function (x) { return '<span class="' + (x[0] === "Topic" ? "k" : "") + (x[1] ? "" : " miss") + '"><i>' + x[0] + "</i>" + esc(x[1] || "missing") + "</span>"; }).join("") +
      '<div class="small" style="flex-basis:100%;margin-top:4px">The five Topical ones are the likeliest; the tag engine makes the final pick when it builds.</div>';
  }
  function hashOf(t) { return "#" + String(t || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function drawHash() {
    // Hashtags made from the topic tags follow the tags: change a tag and its old hashtag goes (unless you added it yourself).
    var tt = topicTags(), want = {}; tt.forEach(function (t) { var h = hashOf(t); if (h.length > 2 && !blocked(t)) want[h] = 1; });
    Object.keys(AUTO).forEach(function (h) { if (!want[h]) { delete HASH[h]; delete HASHON[h]; delete AUTO[h]; } });
    Object.keys(want).forEach(function (h) { if (!(h in HASH)) { HASH[h] = 1; HASHON[h] = true; AUTO[h] = 1; } });
    ["#introverthere", "#introvert", "#topicalhumour"].forEach(function (h) { if (!(h in HASHON)) { HASH[h] = 1; HASHON[h] = h === "#introverthere"; } });
    el("exHash").innerHTML = Object.keys(HASH).map(function (h) { return '<button type="button" class="chip' + (HASHON[h] ? " on" : "") + '" data-h="' + esc(h) + '">' + esc(h) + "</button>"; }).join("");
  }
  function drawUse() { el("exUse").innerHTML = USE.map(function (h) { return '<button type="button" class="chip' + (useBy === h ? " on" : "") + '" data-u="' + h + '">' + h + " hours</button>"; }).join(""); }
  function topicLine() {
    var T = window.exTopic && window.exTopic();
    el("exTopicNow").innerHTML = T ? "Topic: <b>" + esc(T.t) + "</b>" + ((T.f || []).length ? ' <span style="color:var(--warn)">(' + T.f.map(function (f) { return f === "name" ? "may name someone" : "may involve a tragedy"; }).join(", ") + ")</span>" : "") : "No headline picked. Type your own topic tags.";
    if (T && T.t !== lastTopic) { lastTopic = T.t; if (!el("ext1").value && T.tags[0]) el("ext1").value = T.tags[0]; if (!el("ext2").value && T.tags[1]) el("ext2").value = T.tags[1]; }
  }
  function all() { topicLine(); checkTag(1); checkTag(2); draw13(); drawHash(); drawUse(); }
  ["ext1", "ext2"].forEach(function (id) { el(id).addEventListener("input", function () { checkTag(1); checkTag(2); draw13(); drawHash(); }); });
  el("stem").addEventListener("input", draw13);
  el("exHash").addEventListener("click", function (e) { var b = e.target.closest("[data-h]"); if (!b) return; HASHON[b.dataset.h] = !HASHON[b.dataset.h]; drawHash(); });
  el("exHashGo").addEventListener("click", function () { var h = hashOf(el("exHashAdd").value); if (h.length < 3) return; HASH[h] = 1; HASHON[h] = true; delete AUTO[h]; el("exHashAdd").value = ""; drawHash(); });
  el("exUse").addEventListener("click", function (e) { var b = e.target.closest("[data-u]"); if (!b) return; useBy = Number(b.dataset.u); drawUse(); });
  window.exStepShown = all;
  window.exReady = function () {
    var tt = topicTags(); if (!tt[0] || !tt[1]) return "Add both topic tags.";
    if (!checkTag(1) || !checkTag(2)) return "Fix the topic tags first.";
    if (Array.prototype.some.call(document.querySelectorAll(".exck"), function (c) { return !c.checked; })) return "Tick all three checks first.";
    return "";
  };
  window.exMeta = function () { var T = window.exTopic && window.exTopic(); return { topic: T ? T.t : "", flags: T ? T.f || [] : [], topicTags: topicTags(), hashtags: Object.keys(HASH).filter(function (h) { return HASHON[h]; }), useBy: useBy, checks: true }; };
  window.exState = function () { return { t1: el("ext1").value, t2: el("ext2").value, hash: HASH, on: HASHON, auto: AUTO, useBy: useBy }; };
  window.exRestore = function (d) { if (!d) return; el("ext1").value = d.t1 || ""; el("ext2").value = d.t2 || ""; HASH = d.hash || {}; HASHON = d.on || {}; AUTO = d.auto || {}; useBy = d.useBy || 48; all(); };
  all();
})();`;

// Gag tool steps (Barry, 14 Nov). Every field stays on the page (so saving works as before); only the current step shows.
const GAG_WIZARD_SCRIPT = String.raw`(function () {
  var STEPS = ["Range", "Gag", "Title stem", "Category", "Rating & season", "Dates"], cur = 1;   // range first (Barry, 15 Nov): the range decides which boxes the gag step shows
  var NOW = new URLSearchParams(location.search).get("now") === "1", GSEL = { "T-SHIRT": 1 };
  var GN = [["T-SHIRT", "T-Shirt"], ["LONG-SLEEVE", "Long-Sleeve"], ["SWEATSHIRT", "Sweatshirt"], ["HOODIE", "Hoodie"]];
  function chipsFor(boxId) { var box = document.getElementById(boxId); var draw = function () { box.innerHTML = GN.map(function (x) { return '<button type="button" class="chip' + (GSEL[x[0]] ? " on" : "") + '" data-garm="' + x[0] + '">' + x[1] + "</button>"; }).join(""); };
    draw(); box.addEventListener("click", function (e) { var b = e.target.closest("[data-garm]"); if (!b) return; if (GSEL[b.dataset.garm]) delete GSEL[b.dataset.garm]; else GSEL[b.dataset.garm] = 1; draw(); }); }
  function quickGo(btn, label, later) {
    var t = document.getElementById("text"), st = document.getElementById("stem");
    if (typeof capsGag === "function" && !(window.isMulti && window.isMulti())) t.value = capsGag(t.value); if (typeof properStem === "function") st.value = properStem(st.value).trim();
    var g = Object.keys(GSEL); if (!g.length) { alert("Pick at least one garment."); return; }
    if (!t.value.replace(/^[ .…]+/, "").trim() || !st.value || !document.getElementById("collection").value || !document.getElementById("category").value) { alert("Fill in the gag, range, title stem and category first."); return; }
    var lt = Object.keys(later || {}), nice = function (iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
    if (document.getElementById("collection").value === "EXCLUSIVE") { if (!confirm("Make " + st.value + " now?" + String.fromCharCode(10, 10) + "Exclusive T-shirt. It's built straight away and waits in Approvals; nothing goes live until you approve it.")) return; }
    else if (!confirm("Publish " + st.value + " now on " + g.length + " garment" + (g.length === 1 ? "" : "s") + "?" + String.fromCharCode(10, 10) + "It's built straight away and comes to Approvals before it goes live." + (lt.length ? String.fromCharCode(10) + "Then: " + lt.map(function (k) { return GN.filter(function (x) { return x[0] === k; })[0][1] + " " + nice(later[k]); }).join(", ") + "." : ""))) return;
    btn.disabled = true; btn.textContent = "Starting…";
    fetch("/api/quick-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.value, stem: st.value, collection: document.getElementById("collection").value, category: document.getElementById("category").value, garments: g, later: later || {}, parts: window.boxParts ? window.boxParts() : null, ex: document.getElementById("collection").value === "EXCLUSIVE" && window.exMeta ? window.exMeta() : null }) })
      .then(function (r) { return r.json().then(function (o) { return { ok: r.ok, o: o }; }); })
      .then(function (x) { if (!x.ok) { alert(x.o.error || "Couldn't start."); btn.disabled = false; btn.textContent = label; return; } if (window.gagDraftClear) window.gagDraftClear(); location.href = "/"; })
      .catch(function () { alert("Couldn't reach the app. Nothing was changed."); btn.disabled = false; btn.textContent = label; });
  }
  // "Now" on a release date (Barry, 14 Nov): publish that garment straight away; a pop-up spaces out the rest.
  var NOWSET = {}, DIDS = ["d1", "d2", "d3", "d4"];
  DIDS.forEach(function (id, i) { var inp = document.getElementById(id), lab = inp.parentNode, b = document.createElement("button");
    b.type = "button"; b.className = "nowbtn"; b.textContent = "Now"; lab.insertBefore(b, lab.firstChild);
    b.addEventListener("click", function () { var k = GN[i][0]; if (NOWSET[k]) delete NOWSET[k]; else NOWSET[k] = 1; b.classList.toggle("on", !!NOWSET[k]); inp.classList.toggle("isnow", !!NOWSET[k]);
      document.getElementById("save").textContent = Object.keys(NOWSET).length ? "Publish now" : "Save to Core"; }); });
  function laterPopup(nowKeys, boxDates, go) {
    var rest = GN.filter(function (x) { return nowKeys.indexOf(x[0]) < 0; });
    if (!rest.length) return go({});
    var names = function (L) { return L.map(function (x) { return x[1]; }).join(", "); };
    var m = document.createElement("div"); m.className = "qmodal";
    var haveBoxes = boxDates && rest.every(function (x) { return boxDates[x[0]]; });
    m.innerHTML = '<div class="box"><h3>' + names(GN.filter(function (x) { return nowKeys.indexOf(x[0]) >= 0; })) + ' goes out now.</h3><p>When should the ' + (rest.length === 1 ? "" : rest.length + " ") + 'other' + (rest.length === 1 ? " garment" : "s") + ' (' + names(rest) + ') follow?</p>' +
      '<div class="row">One every <input type="number" min="1" max="60" value="7" id="qN"> days, in that order</div>' +
      '<div class="acts"><button class="btn-main" type="button" data-q="space">Space them out</button>' + (haveBoxes ? '<button class="btn" type="button" data-q="boxes">Use the dates in the boxes</button>' : "") + '<button class="btn" type="button" data-q="cancel">Cancel</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { var b = e.target.closest("[data-q]"); if (!b) { if (e.target === m) m.remove(); return; } var q = b.dataset.q; m.remove(); if (q === "cancel") return;
      var later = {};
      if (q === "boxes") rest.forEach(function (x) { later[x[0]] = boxDates[x[0]]; });
      else { var n = Math.max(1, Math.min(60, Math.round(Number(document.getElementById("qN") ? document.getElementById("qN").value : 7) || 7))); rest.forEach(function (x, i) { later[x[0]] = new Date(Date.now() + (i + 1) * n * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/London" }); }); }
      go(later); });
    setTimeout(function () { var q = document.getElementById("qN"); if (q) q.select(); }, 30);
  }
  window.quickLater = laterPopup;
  document.getElementById("form").addEventListener("submit", function (e) {
    if (NOW || !Object.keys(NOWSET).length || document.getElementById("collection").value === "EXCLUSIVE") return;
    e.preventDefault(); e.stopImmediatePropagation();
    var keys = GN.map(function (x) { return x[0]; }).filter(function (k) { return NOWSET[k]; }), boxes = {};
    DIDS.forEach(function (id, i) { var v = document.getElementById(id).value; if (v) boxes[GN[i][0]] = v; });
    laterPopup(keys, boxes, function (later) { GSEL = {}; keys.forEach(function (k) { GSEL[k] = 1; }); quickGo(document.getElementById("save"), "Publish now", later); });
  }, true);
  if (NOW) {
    STEPS = ["Range", "Gag", "Title stem", "Category", "Garments"];
    document.querySelectorAll(".o-stars,.o-season,.o-dates,.o-tabs,.o-pick").forEach(function (x) { x.dataset.st = "9"; });
    document.querySelector(".o-garm").dataset.st = "5";
    document.getElementById("save").textContent = "List it now";
    chipsFor("garmChips"); document.getElementById("nowHint").style.display = "none";
    document.title = "List it now";
    document.getElementById("form").addEventListener("submit", function (e) { if (document.getElementById("collection").value === "EXCLUSIVE") return; e.preventDefault(); e.stopImmediatePropagation();
      var keys = Object.keys(GSEL); if (!keys.length) { alert("Pick at least one garment."); return; }
      window.quickLater(keys, null, function (later) { quickGo(document.getElementById("save"), "List it now", later); }); }, true);
  }
  // Exclusive gets its own last step and always lists now, T-shirt only (Barry, 16 Nov).
  document.getElementById("form").addEventListener("submit", function (e) {
    if (document.getElementById("collection").value !== "EXCLUSIVE") return;
    e.preventDefault(); e.stopImmediatePropagation();
    var w = window.exReady ? window.exReady() : ""; if (w) { alert(w); return; }
    GSEL = { "T-SHIRT": 1 }; quickGo(document.getElementById("save"), "List it now", {});
  }, true);
  var FROM = (new URLSearchParams(location.search).get("from") || "").replace(/[^A-Z]/g, "").slice(0, 2);
  if (FROM) { var bl = document.getElementById("wzList"); bl.href = "/?rlist=" + FROM; bl.hidden = false; window.GAG_FROM = FROM; }
  function el(id) { return document.getElementById(id); }
  function need() {
    if (cur === 1 && document.querySelector('.tab.on[data-tab="edit"]') && !el("collection").value) return "Pick a gag to edit.";
    if (cur === 1 && !el("collection").value) return "Pick a range.";
    if (cur === 2 && window.boxesMissing && window.boxesMissing()) return window.boxesMissing();
    if (cur === 2 && !el("text").value.replace(/^[\s.…]+/, "").trim()) return "Type the gag first.";
    if (cur === 3 && !el("stem").value.trim()) return "Give it a title stem.";
    return "";
  }
  function go(n) {
    cur = Math.max(1, Math.min(STEPS.length, n));
    Array.prototype.forEach.call(document.querySelectorAll(".gR [data-st]"), function (x) { x.classList.toggle("cur", Number(x.dataset.st) === cur); });
    document.body.classList.toggle("noprev", [2, 3, STEPS.length].indexOf(cur) < 0);   // phone: preview only on the text, title stem and last steps
    el("wzBar").innerHTML = STEPS.map(function (s, i) { return '<button type="button" data-go="' + (i + 1) + '" class="' + (i + 1 === cur ? "on" : i + 1 < cur ? "done" : "") + '">' + (i + 1) + ". " + s + "</button>"; }).join("");
        el("wzNext").style.display = cur === STEPS.length ? "none" : "";
    el("wzBack").style.display = cur === 1 ? "none" : "";
    var m = document.querySelector(".wzmsg"); if (m) m.remove();
    var f = document.querySelector(".gR [data-st='" + cur + "'] input:not([type=hidden]):not([type=date]), .gR [data-st='" + cur + "'] #boxes textarea, .gR [data-st='" + cur + "'] textarea:not(.hid *)");
    if (f && f.offsetParent && cur <= 3 && !el("search").offsetParent) f.focus({ preventScroll: true });
    else if (document.body.classList.contains("kb") && document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 0); if (document.body.classList.contains("kb")) setTimeout(fit, 30);
  }
  function next(to) { var w = need(); if (w && to > cur) { var m = document.querySelector(".wzmsg") || document.createElement("div"); m.className = "wzmsg"; m.textContent = w; el("wzNext").parentNode.after(m); return; }
    window.scrollTo(0, 0); go(to); }
  el("wzNext").onclick = function () { next(cur + 1); };
  // Keep the keyboard up when Next is tapped mid-typing (the next step's box takes the focus).
  ["wzNext", "wzBack"].forEach(function (id) { el(id).addEventListener("pointerdown", function (e) { if (document.body.classList.contains("kb")) e.preventDefault(); }); });
  // Gags per range, with an optional target (Barry, 14 Nov).
  function counts() {
    var box = el("rangeCount"); if (!box || typeof G === "undefined" || !G || !G.perCollection) return;
    var sel = el("collection").value, T = window.GAG_TARGETS || {};
    box.innerHTML = Object.keys(G.perCollection).map(function (c) {
      var pre = G.perCollection[c].prefix, rows = (G.all || []).concat(G.empties || []).filter(function (x) { return new RegExp("^" + pre + "-\\d+$").test(x.id); }), n = rows.filter(function (x) { return String(x.text || "").trim(); }).length, t = Number(T[pre]) || 0;
      var on = c === sel, name = { IH: "Introvert Here", SH: "SHHH.", PC: "Per Contract", OS: "Off The Shelf", EX: "Exclusive" }[pre] || c;
      if (!on && sel) return "";
      return '<div class="rc' + (on ? " sel" : "") + '"><div class="rch"><span><b>' + n + "</b> gags in " + name.replace(/</g, "&lt;") + "</span>" +
        (t ? "<span>" + (n >= t ? "Target reached ✓" : "<b>" + (t - n) + "</b> to go to " + t) + "</span>" : "") + "</div>" +
        (t ? '<div class="rbar"><i style="width:' + Math.min(100, Math.round(n / t * 100)) + '%"></i></div>' : "") + (on && pre !== "EX" ? '<div class="small" style="margin-top:6px">' + rows.length + " spaces in Core · " + (rows.length - n) + " empty</div>" : "") +
        (on && pre !== "EX" ? '<div style="margin-top:6px"><button type="button" data-target="' + pre + '">' + (t ? "Change target" : "Set a target") + "</button></div>" : "") + "</div>";
    }).join("");
  }
  el("rangeCount").addEventListener("click", function (e) { var b = e.target.closest("[data-target]"); if (!b) return; var pre = b.dataset.target, cur = (window.GAG_TARGETS || {})[pre] || "";
    var v = prompt("How many " + pre + " gags should this range have in total? Core gets that many numbered spaces. (Leave empty to remove the target.)", cur); if (v === null) return;
    var post = function (dry) { return fetch("/api/gag-target", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: pre, n: Number(v) || 0, dry: dry }) }).then(function (r) { return r.json(); }); };
    var nice = function (iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
    post(true).then(function (j) { if (j.error) return alert(j.error); var P = j.plan || {}, msg = "";
      if (P.add && P.add.length) msg = "Add " + P.add.length + " empty space" + (P.add.length === 1 ? "" : "s") + " to Core: " + P.add[0].id + (P.add.length > 1 ? " to " + P.add[P.add.length - 1].id : "") + ". Dates carry on from the last one; the final T-shirt releases " + nice(P.add[P.add.length - 1].ds[0]) + ".";
      else if (P.remove && P.remove.length) msg = "Remove " + P.remove.length + " empty space" + (P.remove.length === 1 ? "" : "s") + " from the end of the range in Core (" + P.remove.map(function (r) { return r.id; }).reverse().join(", ") + ")." + (P.blocked ? " " + P.blocked + " more can't go: the spaces at the end have gags written in them. Delete those gags first if you want them gone." : "");
      else if (P.blocked) msg = "Nothing can be removed: the spaces at the end have gags written in them. Delete those gags first (range list on the dashboard).";
      if (msg && !confirm(msg + String.fromCharCode(10, 10) + "Go ahead?")) return;
      post(false).then(function (k) { if (k.error) return alert(k.error); window.GAG_TARGETS = k.targets; counts();
        if (msg && window.toast) window.toast("Sent to Core. Tap Sync to Core in a minute to see the new numbers."); }); }); });
  el("collection").addEventListener("change", function () { setTimeout(counts, 0); });
  el("rangeChips").addEventListener("click", function () { setTimeout(counts, 30); if (cur === 1 && !document.querySelector('.tab.on[data-tab="edit"]')) setTimeout(function () { if (el("collection").value) go(2); }, 120); });
  counts();
  function typing() { var a = document.activeElement; return a && a.closest && a.closest(".gR") && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "date" && a.type !== "checkbox")); }
  function fit() {   // text box fills what's left above the keyboard
    var t = el("text"), vv = window.visualViewport, h = vv ? vv.height : window.innerHeight;
    if (!document.body.classList.contains("kb")) { t.style.height = ""; return; }
    var a = document.activeElement, card = a && a.closest("[data-st]"); if (!card) return;
    var head = document.querySelector(".wzhead").getBoundingClientRect();
    window.scrollBy(0, card.getBoundingClientRect().top - head.bottom - 6);
    if (a === t && window.innerWidth > 820) t.style.height = Math.max(120, h - t.getBoundingClientRect().top - 24) + "px";
    else if (a === t) t.style.height = "";
  }
  var resz = function () { try { window.dispatchEvent(new Event("resize")); } catch (e) {} };   // re-measure the pinned header
  document.addEventListener("focusin", function () { if (typing()) { document.body.classList.add("kb"); resz(); setTimeout(fit, 250); setTimeout(fit, 700); } });
  document.addEventListener("focusout", function () { setTimeout(function () { if (!typing()) { document.body.classList.remove("kb"); resz(); fit(); } }, 150); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { if (document.body.classList.contains("kb")) fit(); });
  ["text", "stem"].forEach(function (id) { el(id).addEventListener("input", function () { var m = document.querySelector(".wzmsg"); if (m) m.remove(); }); });
  el("wzBack").onclick = function () { go(cur - 1); };
  el("wzBar").addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (!b) return; var t = Number(b.dataset.go); if (t <= cur) go(t); else { for (var i = cur; i < t; i++) { if (need()) return next(cur + 1); go(cur + 1); } } });
  el("form").addEventListener("reset", function () { setTimeout(function () { go(1); }, 0); });
  el("clear").addEventListener("click", function () { setTimeout(function () { if (!el("text").value) go(1); }, 0); });
  // Picking a gag to edit goes back to its text.
  el("results").addEventListener("click", function (e) { if (e.target.closest(".result")) setTimeout(function () { go(2); }, 0); });
  go(1);
  // Steps depend on the range: Exclusive swaps Rating/Season/Dates for one "Topic & checks" step.
  var BASE_STEPS = STEPS.slice(), EX_STEPS = ["Range", "Gag", "Title stem", "Category", "Topic & checks"];
  Array.prototype.forEach.call(document.querySelectorAll(".gR [data-st]"), function (x) { x.dataset.ost = x.dataset.st; });
  function rangeSteps() {
    var ex = el("collection").value === "EXCLUSIVE";
    Array.prototype.forEach.call(document.querySelectorAll(".gR [data-st]"), function (x) { x.dataset.st = x.dataset.ost; });
    if (ex) { STEPS = EX_STEPS; document.querySelectorAll(".o-stars,.o-season,.o-dates,.o-garm,.o-tabs,.o-pick").forEach(function (x) { x.dataset.st = "9"; }); document.querySelector(".o-extopic").dataset.st = "5"; el("save").textContent = "List it now"; }
    else { STEPS = BASE_STEPS; el("save").textContent = NOW ? "List it now" : Object.keys(NOWSET).length ? "Publish now" : "Save to Core"; }
    go(Math.min(cur, STEPS.length));
  }
  el("collection").addEventListener("change", rangeSteps);
  el("wzBar").addEventListener("click", function () { if (cur === 5 && window.exStepShown && el("collection").value === "EXCLUSIVE") window.exStepShown(); });
  el("wzNext").addEventListener("click", function () { setTimeout(function () { if (cur === 5 && window.exStepShown && el("collection").value === "EXCLUSIVE") window.exStepShown(); }, 0); });
  rangeSteps();
})();`;

// Status lights in the preview header; the full warnings sit under the text box and only show when something's wrong.
const GAG_LAMPS_SCRIPT = String.raw`(function () {
  function watch(srcId, lampId) {
    var src = document.getElementById(srcId), lamp = document.getElementById(lampId);
    function upd() { var bad = src.querySelector(".bad"), ok = src.querySelector(".ok"), wait = /Checking/.test(src.textContent);
      lamp.className = "lamp" + (bad ? " bad" : ok ? " ok" : wait ? " wait" : ""); }
    new MutationObserver(upd).observe(src, { childList: true, subtree: true, characterData: true }); upd();
  }
  watch("pwarn", "lFit"); watch("spell", "lSpell");
})();`;

// Gag tool extras (Barry, 14 Nov): ideas inbox, "very similar" warning while typing, category suggestion.
const GAG_EXTRA_SCRIPT = String.raw`(function () {
  var tx = $("text"), STOP = " the and you your are was not but that this for with have just what when then them they its it's i'm i've don't can't too all any our out who how why off one get got been into from about would could there their here very much more some like ";
  function words(t) { return String(t || "").toLowerCase().replace(/[^a-z' ]/g, " ").split(" ").filter(function (w) { return w.length > 2 && STOP.indexOf(" " + w + " ") < 0; }); }
  function esc3(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 1. Very similar gags, checked as you type.
  var dupT = null;
  function dup() { var box = $("dupwarn"); if (!box) return; var w = words(tx.value); if (w.length < 3 || !G || !G.all) { box.innerHTML = ""; return; }
    var set = {}; w.forEach(function (x) { set[x] = 1; }); var me = (typeof editing !== "undefined" && editing) ? editing.id : "";
    var hits = G.all.map(function (g) { if (g.id === me) return null; var o = words(g.text); if (o.length < 3) return null; var os = {}, inter = 0; o.forEach(function (x) { os[x] = 1; });
      Object.keys(os).forEach(function (x) { if (set[x]) inter++; }); var uni = Object.keys(set).length + Object.keys(os).length - inter; var sc = uni ? inter / uni : 0; return sc >= 0.5 ? { g: g, sc: sc } : null; })
      .filter(Boolean).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 2);
    box.innerHTML = hits.length ? '<div class="warnbox">Very similar to ' + hits.map(function (h) { return '<a href="/gag/' + encodeURIComponent(h.g.id) + '" target="_blank">' + esc3(h.g.id) + "</a> (" + Math.round(h.sc * 100) + "% the same words): “" + esc3(String(h.g.text).split("\n").join(" ").slice(0, 70)) + "”"; }).join("; ") + "</div>" : ""; }
  tx.addEventListener("input", function () { clearTimeout(dupT); dupT = setTimeout(function () { dup(); suggest(); }, 450); });
  // 2. Category suggestion from the gag's words and each category's tag phrases.
  var userPicked = false, suggested = "";
  $("catChips").addEventListener("click", function (e) { if (e.target.closest("[data-c]")) userPicked = true; });
  $("collection").addEventListener("change", function () { userPicked = false; suggested = ""; setTimeout(suggest, 0); });
  function suggest() { var c = $("collection").value, cat = $("category"); if (!c || userPicked || (typeof mode !== "undefined" && mode === "edit")) return;
    var cats = (window.GAG_CATS || {})[c] || []; var w = words(tx.value); if (w.length < 2) return;
    var best = null; cats.forEach(function (k) { var vocab = words(k + " " + ((window.CAT_WORDS || {})[k] || []).join(" ")), vs = {}, sc = 0; vocab.forEach(function (x) { vs[x] = 1; vs[x.replace(/s$/, "")] = 1; });
      w.forEach(function (x) { if (vs[x] || vs[x.replace(/s$/, "")]) sc++; }); if (sc > 0 && (!best || sc > best.sc)) best = { k: k, sc: sc }; });
    if (best && best.k !== cat.value) { suggested = best.k; cat.value = best.k; cat.dispatchEvent(new Event("change", { bubbles: true })); var chips = document.querySelectorAll("#catChips [data-c]");
      chips.forEach(function (b) { b.classList.toggle("on", b.dataset.c === best.k); b.classList.toggle("sugg", b.dataset.c === best.k); }); }
  }
  // 3. Your rating (1-5 stars).
  window.starPick = 0;
  function drawStars() { $("starChips").innerHTML = [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="chip star' + (window.starPick === n ? " on" : "") + '" data-star="' + n + '">' + "★".repeat(n) + "</button>"; }).join("") +
    (window.starPick ? '<button type="button" class="chip" data-star="0">Clear</button>' : ""); }
  $("starChips").addEventListener("click", function (e) { var b = e.target.closest("[data-star]"); if (!b) return; window.starPick = +b.dataset.star; drawStars(); });
  var origSlot = slotInfo; slotInfo = function () { origSlot.apply(this, arguments); var ed = (typeof mode !== "undefined" && mode === "edit" && editing) ? editing.id : ""; window.starPick = ed ? ((window.GAG_STARS || {})[ed] || 0) : window.starPick; drawStars(); };
  $("clear").addEventListener("click", function () { window.starPick = 0; drawStars(); });
  drawStars();
  // 4. Ideas inbox.
  var IL = [];
  function drawIdeas() { $("ideasN").textContent = IL.length ? "(" + IL.length + ")" : "";
    $("ideasL").innerHTML = IL.length ? IL.map(function (x) { return '<div class="idea"><div class="itx">' + esc3(x.text).split("\n").join("<br>") + (x.note ? '<div class="small">' + esc3(x.note) + "</div>" : "") + '</div><button type="button" class="btn" data-iuse="' + x.id + '">Use</button><button type="button" class="btn" data-idel="' + x.id + '">×</button></div>'; }).join("") : '<p class="small">No ideas saved. Type a half-finished gag and tap Save as idea.</p>'; }
  function ideas(b) { return fetch("/api/ideas", b ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) } : {}).then(function (r) { return r.json().then(function (o) { if (!r.ok) throw new Error(o.error || "Failed"); return o; }); }); }
  ideas().then(function (l) { IL = l || []; drawIdeas(); }).catch(function () {});
  $("ideaSave").addEventListener("click", function () { ideas({ action: "add", text: tx.value, note: $("stem").value, range: $("collection").value }).then(function (o) { IL = o.ideas; drawIdeas(); $("ideasBox").open = true; toast("Saved to your ideas"); }).catch(function (e) { toast(e.message, true); }); });
  $("ideasL").addEventListener("click", function (e) { var u = e.target.closest("[data-iuse]"), d = e.target.closest("[data-idel]");
    if (u) { var x = IL.filter(function (i) { return i.id === u.dataset.iuse; })[0]; if (!x) return; if (tx.value.trim() && tx.value.trim() !== "..." && !confirm("Replace what's in the gag box?")) return;
      tx.value = x.text; tx.dispatchEvent(new Event("input", { bubbles: true })); if (x.note && !$("stem").value) $("stem").value = x.note; toast("Loaded. It stays in your ideas until you remove it."); }
    if (d) ideas({ action: "remove", id: d.dataset.idel }).then(function (o) { IL = o.ideas; drawIdeas(); }); });
})();`;

// "Best season" (Barry, 14 Nov): pick an occasion and the gag goes into the best slot of its range,
// about three weeks before it; the gag already in that slot takes this gag's slot instead.
const GAG_SEASON_SCRIPT = String.raw`(function () {
  var box = $("seasonChips"), noteEl = $("seasonNote"); if (!box) return;
  function nth(y, m, wd, n) { var d = new Date(Date.UTC(y, m, 1)); var off = (wd - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, m, 1 + off + 7 * (n - 1))); }
  function easter(y) { var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(y, mo - 1, da)); }
  function U(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  var OCC = [["Valentine's", function (y) { return U(y, 1, 14); }], ["World Introvert Day", function (y) { return U(y, 0, 2); }], ["New Year", function (y) { return U(y, 0, 1); }],
    ["Mothering Sunday", function (y) { var e = easter(y); return U(y, e.getUTCMonth(), e.getUTCDate() - 21); }], ["World Book Day", function (y) { return nth(y, 2, 4, 1); }],
    ["Father's Day", function (y) { return nth(y, 5, 0, 3); }], ["Summer", function (y) { return U(y, 5, 21); }], ["Book Lovers Day", function (y) { return U(y, 7, 9); }],
    ["Back to school", function (y) { return U(y, 8, 1); }], ["Boss's Day", function (y) { return U(y, 9, 16); }], ["Halloween", function (y) { return U(y, 9, 31); }],
    ["Christmas", function (y) { return U(y, 11, 25); }]];
  var pickName = "", target = null, origDates = null;
  function iso(d) { return d.toISOString().slice(0, 10); }
  function nice(s) { return new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  function draw() { box.innerHTML = '<button type="button" class="chip' + (pickName ? "" : " on") + '" data-o="">No season</button>' + OCC.map(function (o) { return '<button type="button" class="chip' + (pickName === o[0] ? " on" : "") + '" data-o="' + o[0] + '">' + o[0] + "</button>"; }).join(""); }
  function find() {
    target = null; origDates = null; noteEl.textContent = "";
    if (!pickName) return;
    var c = $("collection").value, pc = G && G.perCollection && G.perCollection[c];
    if (!c || !pc) { noteEl.textContent = "Choose a range first."; return; }
    var editingNow = (typeof mode !== "undefined" && mode === "edit") ? editing : null;
    if (editingNow) origDates = editingNow.dates; else if (pc.next && pc.next.mode === "fill") origDates = pc.next.dates;
    if (!origDates || !origDates.every(Boolean)) { noteEl.textContent = "There's no dated slot for this gag to swap from, so the season can't be applied. Save it normally and use Swap in the range list."; return; }
    var occ = OCC.filter(function (o) { return o[0] === pickName; })[0][1], now = new Date(), soonest = iso(new Date(Date.now() + 21 * 864e5));
    for (var y = now.getUTCFullYear(); y < now.getUTCFullYear() + 8 && !target; y++) {
      var day = occ(y), lo = iso(new Date(day.getTime() - 42 * 864e5)), hi = iso(new Date(day.getTime() - 7 * 864e5)), aim = day.getTime() - 21 * 864e5;
      if (hi < soonest) continue;
      var best = null;
      var LOCK = window.SEASON_LOCK || [];
      (G.editable || []).forEach(function (e) { if (!e.id || e.id.indexOf(pc.prefix + "-") !== 0 || !e.dates || !e.dates.every(Boolean)) return; if (editingNow && e.id === editingNow.id) return; if (LOCK.indexOf(e.id) >= 0) return;
        var ST = window.GAG_STARS || {}, mine = window.starPick || 0; if (mine && (ST[e.id] || 0) > mine) return;
        var f = e.dates[0]; if (f < lo || f > hi || f < soonest) return; var dist = Math.abs(new Date(f + "T12:00:00Z").getTime() - aim) + (ST[e.id] || 0) * 2 * 864e5; if (!best || dist < best.dist) best = { e: e, dist: dist }; });
      if (!editingNow) (G.empties || []).forEach(function (e) { if (e.id.indexOf(pc.prefix + "-") !== 0) return; var f = e.dates[0]; if (f < lo || f > hi || f < soonest) return;
        var dist = Math.abs(new Date(f + "T12:00:00Z").getTime() - aim); if (!best || dist < best.dist) best = { e: { id: e.id, dates: e.dates, empty: true }, dist: dist }; });
      if (best) { target = best.e; target._occ = iso(day); }
    }
    if (!target) { noteEl.textContent = "No free " + pc.prefix + " slot found before " + pickName + " in the next few years."; return; }
    setDates(target.dates); datesTouched = true;
    var wk = Math.round((new Date(target._occ + "T12:00:00Z") - new Date(target.dates[0] + "T12:00:00Z")) / (7 * 864e5));
    noteEl.innerHTML = "Best slot: <b>" + nice(target.dates[0]) + "</b>, about " + wk + " week" + (wk === 1 ? "" : "s") + " before " + pickName + " (" + nice(target._occ) + "). " +
      (target.empty ? "It fills the empty prepared row " + target.id + "." : target.id + " “" + (target.stem || "") + "” moves to this gag's slot (" + nice(origDates[0]) + ").");
  }
  window.seasonMove = function () { return target && origDates ? { target: target, dates: origDates, season: pickName } : null; };
  box.addEventListener("click", function (e) { var b = e.target.closest("[data-o]"); if (!b) return; pickName = b.dataset.o; draw(); find(); if (!pickName && typeof slotInfo === "function") slotInfo(); });
  $("collection").addEventListener("change", function () { if (pickName) setTimeout(find, 0); });
  $("clear").addEventListener("click", function () { pickName = ""; target = null; noteEl.textContent = ""; draw(); });
  document.querySelectorAll("[data-tab]").forEach(function (t) { t.addEventListener("click", function () { pickName = ""; target = null; noteEl.textContent = ""; draw(); }); });
  draw();
})();`;

// Range and category buttons for /gags. The hidden <select>s stay the source of truth for the page script;
// the buttons set them and fire "change". Categories are grouped by how Core's gags are filed today.
const GAG_CHIPS_SCRIPT = String.raw`(function () {
  var RANGE_INFO = { "INTROVERT HERE…": ["Introvert Here", "var(--ih)"], "SHHH.": ["SHHH.", "var(--sh)"], "PER CONTRACT": ["Per Contract", "var(--pc)"], "OFF THE SHELF": ["Off The Shelf", "var(--os)"], "EXCLUSIVE": ["Exclusive", "#d8262c"] };
  var CATS = window.GAG_CATS || {
    "INTROVERT HERE…": ["Small Talk", "Avoiding People", "Introvert Life", "Social Exhaustion", "Social Anxiety", "Overthinking"],
    "SHHH.": ["Alternative Communication", "Sensory Issues"],
    "PER CONTRACT": ["Quiet Quitting", "Corporate Nonsense", "Off The Clock", "Burnout", "Workplace"],
    "OFF THE SHELF": ["Book Lover", "Escapism"] };
  var col = $("collection"), cat = $("category"), rc = $("rangeChips"), cc = $("catChips"), showAll = false, last = "";
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pick(sel, v) { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); draw(); }
  function draw() {
    var ranges = Array.prototype.map.call(col.options, function (o) { return o.value; }).filter(Boolean);
    rc.innerHTML = ranges.map(function (r) { var i = RANGE_INFO[r] || [r, "var(--muted)"]; return '<button type="button" class="chip' + (col.value === r ? " on" : "") + '" data-r="' + esc(r) + '" style="--c:' + (i[1] === "var(--pc)" ? "#e0574a" : i[1]) + '"' + (col.disabled ? " disabled" : "") + '><i style="background:' + i[1] + '"></i>' + esc(i[0]) + "</button>"; }).join("");
    if (!col.value) { cc.innerHTML = '<span class="small">Choose a range first.</span>'; return; }
    var all = Array.prototype.map.call(cat.options, function (o) { return o.value; }).filter(Boolean);
    var mine = (CATS[col.value] || []).filter(function (c) { return all.indexOf(c) >= 0; });
    if (cat.value && mine.indexOf(cat.value) < 0) mine.push(cat.value);
    var list = showAll || !mine.length ? all : mine;
    cc.innerHTML = list.map(function (c) { return '<button type="button" class="chip' + (cat.value === c ? " on" : "") + '" data-c="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") +
      '<button type="button" class="chip more" data-more="1">' + (showAll ? "Just this range" : "Show all categories") + "</button>";
  }
  rc.addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (!b || col.disabled) return; if (col.value !== b.dataset.r) { cat.value = ""; showAll = false; } pick(col, b.dataset.r); });
  cc.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.dataset.more) { showAll = !showAll; draw(); return; } pick(cat, b.dataset.c); });
  var tx = $("text");
  function lead() { if (window.isMulti && window.isMulti()) return; if (!tx.value.trim()) { tx.value = "... "; tx.dispatchEvent(new Event("input", { bubbles: true })); } }
  tx.addEventListener("focus", function () { lead(); setTimeout(function () { if (tx.value === "... ") tx.setSelectionRange(4, 4); }, 0); });
  $("clear").addEventListener("click", function () { setTimeout(lead, 0); });
  $("form").addEventListener("submit", function (e) {
    var t = tx.value.replace(/^\s+/, "");
    if (t && !(window.isMulti && window.isMulti()) && !/^(\.\.\.|…)/.test(t)) { tx.value = "... " + t; tx.dispatchEvent(new Event("input", { bubbles: true })); }
    var miss = !col.value ? "Choose a range." : !cat.value ? "Choose a gag category." : "";
    if (miss) { e.preventDefault(); e.stopImmediatePropagation(); if (window.toast) toast(miss, true); else alert(miss); }
  }, true);
  setInterval(function () { var k = col.value + "|" + cat.value + "|" + col.disabled + "|" + col.options.length + "|" + cat.options.length; if (k !== last) { last = k; draw(); } }, 300);
  draw(); lead();
  var want = new URLSearchParams(location.search).get("edit");
  if (want) setTimeout(function () {
    var tab = document.querySelector('.tab[data-tab="edit"]'); if (tab) tab.click();
    var sq = $("search"); if (!sq) return; sq.value = want; sq.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(function () { var r = document.querySelector("#results .result"); if (r) r.click(); }, 150);
  }, 200);
})();`;

// Page script for /gags, kept verbatim (String.raw) so backslashes like \n survive.
const GAGS_SCRIPT = String.raw`const BOX = { "INTROVERT HERE…": 509, "SHHH.": 505, "PER CONTRACT": 543, "OFF THE SHELF": 509 }; // OTS width is a placeholder until the first OTS print file is measured
const $ = (id) => document.getElementById(id);
let mode = "new", editing = null;

function opts(sel, items, placeholder) {
  sel.innerHTML = '<option value="">' + placeholder + '</option>' + items.map((x) => '<option>' + x.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</option>').join('');
}
// Ranges with their own boxes in GAG_TEXT_RULES (e.g. EXCLUSIVE) are added even before they have a gag in Core.
if (G) Object.keys(window.TEXT_RULES || {}).forEach((c) => { if ((G.collections || []).indexOf(c) < 0 && c === "EXCLUSIVE") {
  G.collections.push(c); const n = (G.all || []).filter((x) => /^EX-\d+$/.test(x.id)).reduce((m, x) => Math.max(m, Number(x.id.slice(3))), 0);
  G.perCollection[c] = G.perCollection[c] && G.perCollection[c].prefix ? G.perCollection[c] : { prefix: "EX", next: { mode: "append", id: "EX-" + String(n + 1).padStart(5, "0"), dates: [null, null, null, null] }, emptyLeft: 0 }; } });
if (G) { opts($("collection"), G.collections, "Choose…"); opts($("category"), G.categories, "Choose…"); }

let datesTouched = false;
function setDates(ds) { ["d1","d2","d3","d4"].forEach((k, i) => { $(k).value = (ds && ds[i]) || ""; }); datesTouched = false; }
["d1","d2","d3","d4"].forEach((k) => $(k).addEventListener("input", () => { datesTouched = true; }));

const CODE = { "INTROVERT HERE\u2026": "IH", "SHHH.": "SH", "PER CONTRACT": "PC", "OFF THE SHELF": "OS" };
const PRINT = { IH: { src: "/assets/print-logo-ih.png", h: 607, top: 1000 }, SH: { src: "/assets/print-logo-sh.png", h: 946, top: 1230 }, PC: { src: "/assets/print-logo-pc.png", h: 835, top: 1230 }, OS: { src: "/assets/print-logo-os.png", h: 805, top: 1000 } };
function setLook(coll) {
  const c = CODE[coll] || "IH";
  document.body.dataset.coll = c;
  const logo = document.getElementById("logo"); if (logo) logo.src = "/assets/brand-" + c.toLowerCase() + "-wide.png?v=2";
}
function note(text, cls) { const el = $("slot"); el.style.display = text ? "block" : "none"; el.className = cls || "small"; el.textContent = text || ""; }
function slotInfo() {
  setLook($("collection").value);
  if (mode === "edit") { note(editing ? "Editing " + editing.id + " (not built yet). Saving updates its row in Core." : "", "small"); return; }
  const c = $("collection").value, pc = G && G.perCollection[c];
  if (!c || !pc) { note(""); return; }
  const n = pc.next;
  if (window.isMulti && window.isMulti()) { note("New " + (c === "EXCLUSIVE" ? "Exclusive" : c) + " gag " + n.id + ". Exclusive gags are made on demand, not on the weekly schedule.", "small"); setDates([]); return; }
  note(n.mode === "fill"
    ? "Fills prepared row " + n.id + " (" + pc.emptyLeft + " empty " + pc.prefix + " row" + (pc.emptyLeft === 1 ? "" : "s") + " left) \u2014 its dates are filled in below."
    : "No empty " + (pc.prefix || "") + " rows left \u2014 adds a new row at the bottom as " + n.id + ", dated the day after the latest date in Core.", "small");
  setDates(n.dates);
}
$("collection").addEventListener("change", () => { slotInfo(); preview(); });

// ----- live preview -----
let wAt100 = null;
const inkCtx = document.createElement("canvas").getContext("2d");
function inkW(t) { inkCtx.font = "400 100px Montserrat, sans-serif"; try { inkCtx.letterSpacing = "-4px"; } catch (e) {}
  // Full letter widths, the way Canva wraps (16 Nov): ink-edge measuring let "STENOGRAPHER FOR ONE" pass, but the
  // mockup template's box (exactly 12 capital Ws) pushed ONE onto its own line.
  return inkCtx.measureText(t).width; }
function measureW() {
  const m = document.createElement('span');
  m.style.cssText = "position:absolute;left:-9999px;white-space:nowrap;font-family:Montserrat,sans-serif;font-weight:400;font-size:100px;letter-spacing:-0.04em";
  m.textContent = "WWWWWWWWWWWW"; document.body.appendChild(m); wAt100 = m.getBoundingClientRect().width; m.remove();
}
function preview() {
  if (window.exPreview && window.exPreview()) return;
  if (!wAt100) return;
  // Print box (Barry, 15 Nov): 3440 wide, Montserrat 262.39, right-aligned, as in every range's Canva print template.
  const width = 3440, fs = 262.39;
  const box = $("pbox"); box.style.width = width + "px"; box.style.fontSize = fs.toFixed(2) + "px";
  const lines = $("text").value.replace(/\r/g, "").split("\n");
  box.innerHTML = lines.map((l) => '<div>' + (l ? l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/ /g,'&nbsp;') : '&nbsp;') + '</div>').join('');
  const over = [];
  // Width rule (Barry, 13 Nov): a line may be as wide as 12 capital Ws, measured by full letter widths as Canva
  // wraps them (16 Nov; was ink tip to tip) - real pixels, not a character count. Same font settings as
  // the Canva print box: Montserrat Regular, letter spacing -0.04em.
  const limit = inkW("WWWWWWWWWWWW");
  [...box.children].forEach((d, i) => { const t = lines[i] || ""; if (t.trim() && inkW(t.replace(/\s+$/, "")) > limit + 0.01) { d.classList.add('over'); over.push(i + 1); } if (i >= 9) d.classList.add('over'); });
  // The black box is exactly the product text box: 12 capital Ws wide x 9 lines tall, the same as
  // the Canva text boxes and Core's cells (Barry, 13 Nov). Shown at 160px tall, the size of the earlier grid.
  // The gag frame (12 W x 9 lines) is centred in the black card with side margins, as large as fits
  // the card's width and about a third of the screen's height.
  const lh = fs * 1.2, frameH = lh * 9;
  box.style.height = frameH + "px";
  // The whole print page (Barry, 15 Nov): range logo at the top and the 12 W x 9 line gag box where Canva puts it.
  // Page 3951 x 4919; gag box 3440 wide at left 250; top 1000 (IH, OS) or 1230 (SHHH., Per Contract). Logo heights from the print files.
  const P = PRINT[CODE[$("collection").value] || "IH"] || PRINT.IH, u = 1;
  const stage = $("stage"); stage.style.width = "100%";
  const scale = Math.min(stage.clientWidth / (3951 * u), Math.min(560, window.innerHeight * 0.62) / (4919 * u));
  const x0 = Math.max(0, (stage.clientWidth - 3951 * u * scale) / 2);
  let logo = $("plogo"); if (!logo) { logo = document.createElement("img"); logo.id = "plogo"; logo.alt = ""; stage.insertBefore(logo, box); }
  if (logo.dataset.src !== P.src) { logo.src = P.src; logo.dataset.src = P.src; }
  logo.style.cssText = "position:absolute;display:block;top:0;left:" + x0 + "px;width:" + (3951 * u * scale) + "px;height:" + (P.h * u * scale) + "px";
  box.style.transform = "scale(" + scale + ")"; box.style.top = (P.top * u * scale) + "px";
  box.style.left = (x0 + 250 * u * scale) + "px";
  stage.style.height = (4919 * u * scale) + "px";
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
  mode = b.dataset.tab; editing = null; document.querySelectorAll(".nowbtn,#nowHint").forEach((x) => { x.style.display = mode === "edit" ? "none" : ""; if (mode === "edit" && x.classList.contains("on")) x.click(); });
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
  if (!(window.isMulti && window.isMulti())) $("text").value = capsGag($("text").value); $("stem").value = properStem($("stem").value).trim();
  if ($("pwarn").querySelector('.bad') && !confirm("The preview shows a problem with the line breaks. Save anyway?")) return;
  const body = { action, gagId, collection: $("collection").value, category: $("category").value, text: $("text").value, stem: $("stem").value, parts: window.boxParts ? window.boxParts() : null,
    tag12: $("tag12").value, tag13: $("tag13").value, d1: $("d1").value, d2: $("d2").value, d3: $("d3").value, d4: $("d4").value, datesFromSlot };
  $("save").disabled = true; $("save").textContent = "Sending to Core…";
  const sw = window.seasonMove ? window.seasonMove() : null;
  if (sw) { body.datesFromSlot = false; body.season = sw.season; if (sw.target.empty) { body.action = "fill"; body.gagId = sw.target.id; } }
  const res = await fetch('/api/gag-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { alert(out.error || "Couldn't save."); $("save").disabled = false; $("save").textContent = "Save to Core"; return; }
  if (sw && !sw.target.empty) { // the gag that was in the seasonal slot takes this gag's old slot
    const t = sw.target, mv = { action: "edit", gagId: t.id, collection: t.collection, category: t.category, text: t.text, stem: t.stem, d1: sw.dates[0], d2: sw.dates[1], d3: sw.dates[2], d4: sw.dates[3] };
    const r2 = await fetch('/api/gag-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mv) });
    if (!r2.ok) alert("Saved, but " + t.id + " couldn't be moved out of the seasonal slot, so two gags now share it. Use Swap in the range list to sort it.");
  }
  if (body.gagId && (window.starPick || (window.GAG_STARS || {})[body.gagId])) await fetch('/api/stars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: body.gagId, n: window.starPick || 0 }) }).catch(() => {});
  try { sessionStorage.setItem("gagTop", "1"); } catch (e) {}
  if (window.gagDraftClear) window.gagDraftClear();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0); if (window.GAG_FROM) location.href = "/?rlist=" + window.GAG_FROM; else location.reload();
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
    // Reload only when the form is untouched and the page is on screen (Barry, 16 Nov: the old check only looked at
    // whether the cursor was in a box, so tapping a chip or closing the keyboard let a Core change wipe a half-written gag).
    const typing = (window.gagDirty && window.gagDirty()) || document.hidden;
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
    share_target: { action: "/links", method: "GET", params: { title: "title", text: "text", url: "url" } },
    
  }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}

// ---------- Links (Core sheet LINKS, table LINKS_TABLE) ----------
// A copy of the table is kept in KV "links" ({at, rows:[{name,address,what}]}), sent by
// tools/sync_links.py (or any Make scenario) to /api/links-sync with the app secret.
// The page has its own manifest so it can sit on the home screen as a separate "IH Links" icon.
function linksManifest() {
  return new Response(JSON.stringify({
    id: "/links", name: "IH Links", short_name: "IH Links", start_url: "/links", scope: "/links", display: "standalone",
    share_target: { action: "/links", method: "GET", params: { title: "title", text: "text", url: "url" } },
    
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
// App and site buttons (addresses come from Core's LINKS sheet when present).
const OWN_LINKS = [
  ["Introvert Here", /^(own shop|introvert here)/i, "https://introvert-here-shop.mosspit.workers.dev", "#f2f0eb", '<rect x="4" y="4" width="24" height="24" rx="6" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="10" r="2.6" fill="currentColor"/><rect x="13.2" y="13.6" width="5.6" height="6.6" rx="1.8" fill="currentColor"/><rect x="13.2" y="18" width="2.4" height="6.5" rx="1.2" fill="currentColor"/><rect x="16.4" y="18" width="2.4" height="6.5" rx="1.2" fill="currentColor"/>'],
  ["Tag Checker", /^tag checker/i, "https://tag-checker.mosspit.workers.dev", "#c9a434", '<path d="M4 6v9.5L17.5 29 29 17.5 15.5 4H6a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="10.5" cy="10.5" r="2.4" fill="currentColor"/><path d="M14 18.5l3 3 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'],
  ["Mosspit Studios", /^(studio site|mosspit)/i, "https://mosspit-draft.mosspit.workers.dev", "#f08a4b", '<path d="M16 9.5c-2-2.6-6.2-2.8-8.6-.3-2.8 2.9-2.6 8.6.4 12.8 2.2 3.1 5.4 5 8.2 5s6-1.9 8.2-5c3-4.2 3.2-9.9.4-12.8-2.4-2.5-6.6-2.3-8.6.3z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 9.5c.6 4.2.4 9.8-1.2 16.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M16.4 8.6c1.2-3 3.8-4.6 7.4-4.4-1 3.4-3.8 5-7.4 4.4z" fill="currentColor"/><path d="M15.6 9c-.2-1.8-.8-3.2-1.8-4.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
  ["Core", /^core\b/i, "https://mosspitstudios-my.sharepoint.com/personal/admin_mosspit_org/_layouts/15/Doc.aspx?sourcedoc=%7BEA717AD9-320A-4722-B604-03270C9D7310%7D&file=001A_INTROVERT_HERE_CORE.xlsx&action=default&mobileredirect=true", "#33c481", '<rect x="4" y="5" width="24" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M4 12h24M4 19h24M13 5v22" fill="none" stroke="currentColor" stroke-width="2.2"/>'],
  ["GitHub", /^code/i, "https://github.com/Mosspit-droid/introvert-here-renderer", "#8b949e", '<path d="M16 4a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 16 4z" fill="currentColor"/>'],
];

// Recent AI threads (Claude / ChatGPT). Neither service lets other apps read your chat list, so threads are saved here
// (paste a link, or share it into the app) and sorted by when you last opened them from this page. KV "threads".
const THREAD_HOSTS = { claude: /^(www\.)?claude\.ai$/i, chatgpt: /^(www\.)?(chatgpt\.com|chat\.openai\.com)$/i };
async function threadsSave(request, env) {
  const d = await request.json();
  const T = (await env.PENDING.get("threads", "json")) || { claude: [], chatgpt: [] };
  let u = null; try { u = new URL(String(d.url || "").trim()); } catch (e) {}
  const which = u && Object.keys(THREAD_HOSTS).find((k) => THREAD_HOSTS[k].test(u.hostname));
  if (d.action === "add") {
    if (!which) return json({ error: "That isn't a Claude or ChatGPT link." }, 400);
    const url = u.origin + u.pathname;
    T[which] = T[which].filter((x) => x.url !== url);
    T[which].unshift({ url, title: String(d.title || "").replace(/\s+/g, " ").trim().slice(0, 90) || "Untitled thread", used: Date.now() });
    T[which] = T[which].slice(0, 30);
  } else if (d.action === "use" || d.action === "remove") {
    for (const k of Object.keys(T)) {
      const i = T[k].findIndex((x) => x.url === d.url);
      if (i < 0) continue;
      if (d.action === "remove") T[k].splice(i, 1); else { T[k][i].used = Date.now(); T[k].sort((a, b) => b.used - a.used); }
    }
  } else return json({ error: "Unknown request" }, 400);
  await env.PENDING.put("threads", JSON.stringify(T));
  return json({ ok: true, threads: T });
}

async function linksPage(env) {
  const d = (await env.PENDING.get("links", "json")) || { rows: [] };
  const T = (await env.PENDING.get("threads", "json")) || { claude: [], chatgpt: [] };
  const btn = (name, url, colour, svg, extra = "") => `<a class="qk" href="${esc(url)}" target="_blank" rel="noopener" style="--b:${colour}"${extra}><svg viewBox="0 0 32 32" aria-hidden="true">${svg}</svg><span>${esc(name)}</span></a>`;
  const own = OWN_LINKS.map(([name, re, fallback, colour, svg]) => { const r = d.rows.find((x) => re.test(x.name)); return btn(name, r ? r.address : fallback, colour, svg); }).join("");
  const quick = BRAND_LINKS.map(([name, url, colour, svg]) => btn(name, url, colour, svg, name === "Facebook" ? " data-fb" : "")).join("");
  const fbScript = `<script>(function () { if (!/Android/i.test(navigator.userAgent)) return; var a = document.querySelector('.qk[data-fb]'); if (!a) return;
    var u = a.href.replace(/^https:\\/\\//, ""); a.href = "intent://" + u + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(a.href) + ";end"; a.removeAttribute("target"); })();</script>`;
  return shell(`
<style>
.lwrap{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
.thr{display:grid;grid-template-rows:1fr 1fr;gap:14px}
.tbox h3{display:flex;align-items:center;gap:10px;margin:0 0 12px;font:800 13px var(--display);letter-spacing:.16em;text-transform:uppercase}
.tbox h3 svg{width:22px;height:22px}
.tlist{display:flex;flex-direction:column;gap:8px}
.ti{display:flex;align-items:center;gap:8px}
.ti a{flex:1;min-width:0;display:flex;flex-direction:column;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.03);text-decoration:none;color:var(--text)}
.ti a:hover{border-color:var(--frame)}
.ti a b{font:700 15px var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ti a span{font-size:12px;color:var(--muted)}
.ti button{flex:none;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:none;color:var(--muted);font-size:20px;cursor:pointer}
.tadd{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.tadd input{flex:1 1 160px;min-width:0;min-height:48px;padding:0 12px;font:15px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}
.qside{position:sticky;top:calc(var(--stick,96px) + 10px)}
.qside h3{margin:0 0 10px;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.qside h3.second{margin-top:18px}
.qks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.qk span{max-width:100%;overflow-wrap:anywhere}
.qk{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:100px;padding:14px 8px 18px;border:2px solid rgba(242,240,235,.5);border-radius:16px;background:var(--card);color:var(--text);text-decoration:none;font:800 11px var(--display);letter-spacing:.1em;text-transform:uppercase;overflow:hidden;text-align:center}
.qk:hover{border-color:var(--frame)}
.qk svg{width:36px;height:36px}
.qk::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:var(--b)}
@media (max-width:860px){.lwrap{grid-template-columns:minmax(0,1fr)}.qside{position:static;min-width:0}.qks{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:480px){.qks{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.qk{min-height:88px;padding:12px 4px 16px;font-size:10px;letter-spacing:.06em}.qk svg{width:30px;height:30px}}
</style>
${brandHeader("Links")}
<div class="lwrap">
  <div class="thr">
    <div class="card tbox" data-list="claude"><h3><svg viewBox="0 0 32 32"><path d="M16 3v26M3 16h26M6.8 6.8l18.4 18.4M25.2 6.8L6.8 25.2" stroke="#d97757" stroke-width="3.2" stroke-linecap="round"/></svg>Claude</h3><div class="tlist"></div>
      <div class="tadd"><input placeholder="Paste a Claude chat link" data-url><input placeholder="Name it (optional)" data-title><button class="btn" type="button" data-add>Add</button></div></div>
    <div class="card tbox" data-list="chatgpt"><h3><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11.5" fill="none" stroke="#74aa9c" stroke-width="2.8"/><path d="M16 9.5v13M10.4 12.8l11.2 6.4M10.4 19.2l11.2-6.4" stroke="#74aa9c" stroke-width="2.6" stroke-linecap="round"/></svg>ChatGPT</h3><div class="tlist"></div>
      <div class="tadd"><input placeholder="Paste a ChatGPT chat link" data-url><input placeholder="Name it (optional)" data-title><button class="btn" type="button" data-add>Add</button></div></div>
    <p class="small" style="margin:0">Neither Claude nor ChatGPT lets other apps read your chat list, so save the threads you use here. Paste a link, or on your phone or tablet share a chat link to Introvert Here. Share any other text (a ChatGPT answer, a note) to Introvert Here and it goes on your To-do list instead. The one you open most recently goes to the top.</p>
  </div>
  <aside class="qside frame"><div class="card"><h3>Ours</h3><div class="qks">${own}</div><h3 class="second">Tools</h3><div class="qks">${quick}</div></div></aside>
</div>${fbScript}
<script>
(function () {
  var T = ${JSON.stringify(T).replace(/</g, "\\u003c")};
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " hours ago" : Math.round(m / 1440) + " days ago"; }
  function draw() {
    document.querySelectorAll(".tbox").forEach(function (box) {
      var list = T[box.dataset.list] || [];
      box.querySelector(".tlist").innerHTML = list.length ? list.slice(0, 6).map(function (t) { return '<div class="ti"><a href="' + esc(t.url) + '" target="_blank" rel="noopener" data-use="' + esc(t.url) + '"><b>' + esc(t.title) + '</b><span>Opened ' + ago(t.used) + '</span></a><button type="button" data-rm="' + esc(t.url) + '" aria-label="Remove">×</button></div>'; }).join("") : '<p class="small" style="margin:0">No threads saved yet.</p>';
    });
  }
  async function send(body) { var r = await fetch("/api/threads-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); var j = await r.json().catch(function () { return {}; }); if (!r.ok) throw new Error(j.error || "Couldn't save"); T = j.threads; draw(); }
  document.addEventListener("click", function (e) {
    var u = e.target.closest("[data-use]"); if (u) { send({ action: "use", url: u.dataset.use }).catch(function () {}); return; }
    var rm = e.target.closest("[data-rm]"); if (rm) { send({ action: "remove", url: rm.dataset.rm }).then(function () { toast("Removed"); }).catch(function (err) { toast(err.message, true); }); return; }
    var add = e.target.closest("[data-add]"); if (add) { var box = add.closest(".tbox"); var url = box.querySelector("[data-url]").value, title = box.querySelector("[data-title]").value;
      send({ action: "add", url: url, title: title }).then(function () { box.querySelector("[data-url]").value = ""; box.querySelector("[data-title]").value = ""; toast("Saved"); }).catch(function (err) { toast(err.message, true); }); }
  });
  draw();
  // Shared into the app from Claude or ChatGPT: save it straight away.
  var q = new URLSearchParams(location.search), text = (q.get("url") || "") + " " + (q.get("text") || "");
  var m = text.match(/https?:\\/\\/[^\\s]+/);
  var shared = ((q.get("title") || "") + "\\n" + (q.get("text") || "")).trim(), isThread = m && /(^|\\.)(claude\\.ai|chatgpt\\.com|chat\\.openai\\.com)\\//i.test(m[0].replace(/^https?:\\/\\//, "") + "/");
  var bare = shared.replace(m ? m[0] : "", "").replace(/\\s+/g, " ").trim();
  if (isThread && bare.length < 120) { send({ action: "add", url: m[0], title: q.get("title") || "" }).then(function () { toast("Thread saved"); history.replaceState(null, "", "/links"); }).catch(function (err) { toast(err.message, true); }); }
  else if (shared) {
    // Anything else shared into the app (a ChatGPT answer, a note, a web page) goes on the to-do list.
    var line = bare || shared, first = line.split(/(?<=[.!?])\\s/)[0];
    var body = { action: "add", text: (first.length > 130 ? first.slice(0, 127) + "…" : first), details: line.length > first.length ? line.slice(0, 1000) : "" };
    fetch("/api/todo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) throw new Error("Couldn't save"); toast("Added to your to-do list"); history.replaceState(null, "", "/links"); }).catch(function (err) { toast(err.message, true); });
  }
})();
</script>`, "/links.webmanifest");
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
  // British -ise spellings are correct for this shop (Barry, 13 Nov): drop LanguageTool's Oxford
  // "-ize" rule and any suggestion that only swaps an s for a z.
  const isZSwap = (m) => { const o = text.substr(m.offset, m.length).toLowerCase(); return (m.replacements || []).some((r) => { const v = String(r.value || "").toLowerCase(); return v.length === o.length && v.replace(/z/g, "s") === o.replace(/z/g, "s") && v !== o; }); };
  const matches = (out.matches || []).filter((m) => !/OXFORD/i.test((m.rule && m.rule.id) || "") && !/oxford/i.test(m.message || "") && !isZSwap(m)).map((m) => {
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

const TYPE_LABEL = { "T-SHIRT": "T-Shirt", "LONG-SLEEVE": "Long-Sleeve", "SWEATSHIRT": "Sweatshirt", "HOODIE": "Hoodie" };
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
  // 30-day trend: new views per day (stacked by range) and items sold per day.
  const trend = (() => {
    const ds = days.slice(-31);
    if (ds.length < 3) return `<div class="card small">The trend chart appears once a few days of history have built up (one reading a day at 12:00).</div>`;
    const R = [["IH", "var(--ih)"], ["SH", "var(--sh)"], ["PC", "var(--pc)"], ["OS", "var(--os)"]];
    const per = (d) => { const o = { IH: 0, SH: 0, PC: 0, OS: 0 }; for (const [code, v] of Object.entries(hist[d] || {})) { const c = collOf(code); o[c] = (o[c] || 0) + (Number(v[0]) || 0); } return o; };
    const rows = ds.slice(1).map((d, i) => { const a = per(ds[i]), b = per(d); const o = { d }; R.forEach(([c]) => { o[c] = Math.max(0, (b[c] || 0) - (a[c] || 0)); }); o.sold = (st.orders || []).filter((x) => x.date === d).reduce((n, x) => n + (Number(x.qty) || 0), 0); return o; });
    const max = Math.max(4, ...rows.map((r) => R.reduce((n, [c]) => n + r[c], 0)));
    const nice = Math.ceil(max / 4) * 4, W = 720, H = 220, L = 34, B = 26, T = 12, bw = (W - L - 8) / rows.length;
    const y = (v) => T + (H - T - B) * (1 - v / nice);
    let svg = "";
    for (let k = 0; k <= 4; k++) { const v = nice * k / 4; svg += `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`; }
    rows.forEach((r, i) => {
      let acc = 0; const x = L + i * bw + bw * 0.15, w = bw * 0.7;
      R.forEach(([c, col]) => { if (!r[c]) return; svg += `<rect x="${x}" y="${y(acc + r[c])}" width="${w}" height="${y(acc) - y(acc + r[c])}" fill="${col}" rx="1.5"><title>${r.d} · ${COLL_LABEL[c]}: ${r[c]} views</title></rect>`; acc += r[c]; });
      if (r.sold) svg += `<circle cx="${x + w / 2}" cy="${y(acc) - 9}" r="5" fill="var(--go)"><title>${r.d}: ${r.sold} sold</title></circle>`;
      if (i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1) svg += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${new Date(r.d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</text>`;
    });
    const key = R.map(([c, col]) => `<span><i style="background:${col}"></i>${COLL_LABEL[c]}</span>`).join("") + `<span><i style="background:var(--go);border-radius:50%"></i>Sold</span>`;
    return `<div class="card"><div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:520px;height:auto;display:block" role="img" aria-label="New views per day by range, with sales">${svg}</svg></div><div class="tkey">${key}</div></div>`;
  })();
  const tile = (label, value, sub = "") => `<div class="card stile"><div class="tv">${value}</div><div class="tl">${label}</div>${sub ? `<div class="small">${sub}</div>` : ""}</div>`;

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
  <div class="sub"><div class="srow small2"><div class="sname"><a href="/gag/${encodeURIComponent(g.id)}">Open the gag page →</a></div></div>${g.items.sort((a, b) => b.views - a.views).map((l) => `<div class="srow small2"><div class="sname"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(TYPE_LABEL[l.type] || l.type)}</a>${l.state && l.state !== "active" ? ` <span class="badge">${esc(l.state)}</span>` : ""}</div><div class="snum">${l.views}<span>views</span></div><div class="snum">${recent(l.code, 0) ?? "–"}<span>recent</span></div><div class="snum">${l.favs}<span>favs</span></div><div class="snum">${sold[l.code] || 0}<span>sold</span></div></div>`).join("")}</div>
</details>`).join("");

  const ordersHtml = (st.orders || []).length ? (st.orders || []).slice().sort((a, b) => (b.date > a.date ? 1 : -1)).map((o) =>
    `<div class="srow"><div class="sname"><b>${esc(o.title)}</b><div class="small">${esc(o.variant)} · ${esc(o.date)}${o.status ? " · " + esc(o.status.replace(/-|_/g, " ")) : ""}</div></div><div class="snum">${money(o.price * o.qty)}<span>sale</span></div><div class="snum">${money(o.cost)}<span>Printify</span></div></div>`).join("")
    : `<div class="small">No orders yet.</div>`;

  return shell(`
<style>
.stiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.stile{padding:16px 18px}.tv{font:900 32px/1.1 var(--display);font-variant-numeric:tabular-nums}.tl{font:800 11px var(--display);text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-top:4px}
.snum{font-family:var(--display)}
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
@media (max-width:700px){.snum{width:50px;font-size:15px}.tv{font-size:24px}.stiles{grid-template-columns:repeat(2,1fr)}}
</style>
${brandHeader("Stats", nav)}
<div class="small">From Etsy and Printify, updated daily at 12:00. Last update ${esc(when(Date.parse(st.at)))}.${baseDays ? "" : " The “recent” column fills in once a few days of history have built up."}</div>
<h2>Shop totals</h2>
<div class="stiles">
${tile("Listings", live.length)}
${tile("Views", tot("views"), baseDays ? `${totRecent >= 0 ? "+" : ""}${totRecent} in the last ${baseDays} days` : "")}
${tile("Favourites", tot("favs"))}
${tile("Items sold", units)}
${tile("Sales", money(revenue))}
</div>
<h2>Last 30 days</h2>
${trend}
<style>.tkey{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)}.tkey i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}</style>
${plannerStatsHtml(planner, tile)}
${workingHtml(st, hist)}
${await priceTestsHtml(env, st, hist)}
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
  const nav = `<a class="btn" href="/listings">← Listings</a><a class="btn" href="/stats">📈 Stats</a><button class="btn" id="refresh" type="button">${icon("sync")}Sync to Core</button>`;
  return shell(`
<style>
.pgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width:760px){.pgrid{grid-template-columns:1fr}}
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
const TYPES = [["T-SHIRT","T-Shirt"],["LONG-SLEEVE","Long-Sleeve"],["SWEATSHIRT","Sweatshirt"],["HOODIE","Hoodie"]];
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
  reprice: { hook: "MAKE_TOOL_REPRICE_HOOK", name: "Re-price listings" }, // also called by the Pricing scenario (8451335) when "update live listings" is ticked
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

// Gag checks, shared by Check Core and the dashboard. Runs in the browser (served as /gagcheck.js from this
// function's own source), so the worker does no heavy work. Returns [{ t: kind, d: detail, ids: [gag ids] }].
function gagIssuesFn(g) {
  const all = (g && g.all) || [], issues = [];
  const norm = (t) => String(t || "").toUpperCase().replace(/…/g, " ").replace(/[^A-Z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const bigrams = (str) => { const m = new Map(); for (let i = 0; i < str.length - 1; i++) { const k = str.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const dice = (a, b) => { let inter = 0, na = 0, nb = 0; a.forEach((v) => { na += v; }); b.forEach((v) => { nb += v; }); a.forEach((v, k) => { if (b.has(k)) inter += Math.min(v, b.get(k)); }); return na + nb ? 2 * inter / (na + nb) : 0; };
  const by = (f) => { const m = {}; all.forEach((x) => { const k = f(x); if (k) (m[k] = m[k] || []).push(x.id); }); return Object.entries(m).filter(([, v]) => v.length > 1); };
  by((x) => x.id).forEach(([k, v]) => issues.push({ t: "Same gag ID used twice", d: k + " (" + v.length + " rows)", ids: [k] }));
  by((x) => norm(x.text)).forEach(([, v]) => issues.push({ t: "Identical gag text", d: "", ids: v }));
  by((x) => String(x.stem || "").trim().toLowerCase()).forEach(([k, v]) => issues.push({ t: "Same title stem", d: "“" + k + "”", ids: v }));
  all.forEach((x) => {
    const st = String(x.stem || "");
    if (/[\r\n\t]/.test(st)) issues.push({ t: "Line break in title stem", d: JSON.stringify(st), ids: [x.id] });
    else if (/^\s|\s$|\s{2,}/.test(st)) issues.push({ t: "Stray spaces in title stem", d: "“" + st + "”", ids: [x.id] });
    if (!/^\s*(\.\.\.|…)/.test(String(x.text || ""))) issues.push({ t: "Missing the opening ...", d: "", ids: [x.id] });
    [x.t12, x.t13].forEach((t) => { if (t && String(t).trim().length > 20) issues.push({ t: "Custom tag over 20 characters", d: "“" + t + "”", ids: [x.id] }); });
  });
  const B = all.map((x) => ({ id: x.id, n: norm(x.text), t: String(x.text || "") }));
  B.forEach((x) => { x.bg = bigrams(x.n); });
  const sim = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j]; if (a.n === b.n) continue;
    if (Math.abs(a.n.length - b.n.length) > 0.5 * Math.max(a.n.length, b.n.length)) continue;
    const d = dice(a.bg, b.bg); if (d >= 0.72) sim.push([d, a, b]);
  }
  sim.sort((p, q) => q[0] - p[0]).slice(0, 15).forEach(([d, a, b]) => issues.push({ t: "Very similar gags (" + Math.round(d * 100) + "% alike)", d: a.id + ": " + a.t.replace(/\n+/g, " ") + "\n" + b.id + ": " + b.t.replace(/\n+/g, " "), ids: [a.id, b.id] }));
  return issues;
}


// ---------- Mockup template check ----------
// Make (helper scenario, action "template") makes a throwaway copy of the published Canva template and reports
// its page count; the app compares that with Core's MOCKUP_PAGES rows for the range and garment.
function templateIssues(S, coll, type, pagesInCanva) {
  const pg = (S && S.pages || []).filter((x) => x.coll === coll && x.type === type).sort((a, b) => a.pos - b.pos);
  const out = [], n = Number(pagesInCanva) || 0;
  if (!pg.length) return [["bad", "Core has no mockup pages listed for this range and garment."]];
  const maxPos = Math.max(...pg.map((x) => x.pos));
  if (n && n < maxPos) out.push(["bad", `Core lists page ${maxPos}, but the published Canva template only has ${n} pages. The builder will fail on these listings. Publish the template with all its pages, or ask Claude to remove the extra rows from Core.`]);
  if (n > maxPos) out.push(["warn", `The published Canva template has ${n} pages, but Core only goes up to page ${maxPos}. ${n === maxPos + 1 ? `Page ${n} is` : `Pages ${maxPos + 1}–${n} are`} never used. If they're new photos, use Update listings → Add a new photo; if not, delete them in Canva.`]);
  const listed = new Set(pg.map((x) => x.pos)), gaps = [];
  for (let i = 1; i <= Math.min(n || maxPos, maxPos); i++) if (!listed.has(i)) gaps.push(i);
  if (gaps.length) out.push(["warn", `Canva page${gaps.length === 1 ? "" : "s"} ${gaps.join(", ")} ${gaps.length === 1 ? "isn't" : "aren't"} in Core, so ${gaps.length === 1 ? "it's" : "they're"} never uploaded. Fine if that's on purpose.`]);
  const dup = pg.filter((x, i) => pg.findIndex((y) => y.pos === x.pos) !== i).map((x) => x.pos);
  if (dup.length) out.push(["bad", `Core lists page ${[...new Set(dup)].join(", ")} more than once.`]);
  const badName = pg.filter((x) => { const m = /^[A-Z]+_(\d+)_[A-Z]{2}_/.exec(String(x.name).toUpperCase()); return !m || Number(m[1]) !== x.pos; });
  if (badName.length) out.push(["warn", `${badName.length} page name${badName.length === 1 ? " doesn't" : "s don't"} match the pattern RANGE_NN_GARMENT_NAME with the right page number: ${badName.slice(0, 4).map((x) => x.name + " (page " + x.pos + ")").join(", ")}.`]);
  if (!pg.some((x) => /THUMBNAIL/i.test(x.name))) out.push(["warn", "No THUMBNAIL page, so listings won't have a proper first photo."]);
  const photos = photoPlan(pg, "BLACK").length + 1;
  if (photos > 20) out.push(["bad", `That's ${photos} photos per listing, and Etsy allows 20.`]);
  if (!out.length) out.push(["ok", `All good: ${n} pages in Canva, all listed in Core with proper names. ${photos} photos per listing.`]);
  return out;
}
async function templateCheck(request, env) {
  const d = await request.json().catch(() => ({}));
  const S = await env.PENDING.get("amend", "json");
  const r = S && (S.rules || []).find((x) => x.coll === d.coll && x.type === d.type);
  if (!r || !r.tpl) {
    // The app's copy of Core is too old to know the template: refresh it, and run the check as soon as it arrives.
    await env.PENDING.put("tpl-pending", JSON.stringify({ coll: d.coll, type: d.type, at: Date.now() }));
    const e2 = await amendHook(env, { action: "state" }); if (e2) return e2;
  } else {
    const err = await amendHook(env, { action: "template", ops: JSON.stringify({ tpl: r.tpl, coll: d.coll, type: d.type }) });
    if (err) return err;
  }
  const all = (await env.PENDING.get("tpl-checks", "json")) || {};
  all[d.coll + "|" + d.type] = { running: true, at: Date.now() };
  await env.PENDING.put("tpl-checks", JSON.stringify(all));
  return json({ ok: true });
}
async function templateResult(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const d = await request.json().catch(() => ({}));
  const S = await env.PENDING.get("amend", "json");
  const all = (await env.PENDING.get("tpl-checks", "json")) || {};
  all[d.coll + "|" + d.type] = { at: Date.now(), pages: Number(d.pages) || 0, issues: templateIssues(S, d.coll, d.type, d.pages) };
  await env.PENDING.put("tpl-checks", JSON.stringify(all));
  return json({ ok: true });
}

// ---------- Calendar (Barry, 13 Nov): releases, sales dates and seasonal tag windows ----------
// Seasonal windows mirror Core's SEASON_POOL (earliest start to latest end per season). The daily
// "Refresh seasonal tags" scenario swaps live listings' seasonal tags automatically inside these windows.
const SEASON_WINDOWS = [["Christmas", 1001, 1231], ["New Year", 1226, 115], ["Valentine's", 120, 214], ["Mother's Day", 301, 512], ["Easter", 301, 430],
  ["Graduation", 501, 731], ["Father's Day", 520, 621], ["Back to school", 615, 1005], ["Halloween", 915, 1031], ["Winter", 1015, 228]];
async function calendarPage(env) {
  const [g, daily] = await Promise.all([env.PENDING.get("gags", "json"), env.PENDING.get("daily", "json")]);
  const TY = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
  const ev = {}, seen = new Set();
  const add = (date, o) => { if (!date) return; const k = o.id + "|" + o.garment + "|" + date; if (seen.has(k)) return; seen.add(k); (ev[date] = ev[date] || []).push(o); };
  const editableIds = new Set(((g && g.editable) || []).map((e) => e.id));
  ((g && g.sched) || []).forEach((e) => (e.d || []).forEach((d, i) => add(d, { id: e.id, garment: TY[i], stem: e.s || "", edit: editableIds.has(e.id), built: !!(e.b && e.b[i]) })));
  ((g && g.editable) || []).forEach((e) => (e.dates || []).forEach((d, i) => add(d, { id: e.id, garment: TY[i], stem: e.stem || "", edit: true })));
  ((daily && daily.upcoming) || []).forEach((u) => add(u.date, { id: u.gag, garment: u.type, stem: u.title || "", built: !!u.built }));
  Object.values(ev).forEach((l) => l.forEach((o) => { o.gname = garmentName(o.garment); }));
  return shell(`
${brandHeader("Calendar")}
<style>
.calbar{display:flex;align-items:center;gap:10px;margin:0 0 12px}.calbar h2{margin:0;flex:1;font:900 22px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--text)}.calbar h2::after{display:none}
.calbar .btn{width:auto;min-height:44px;padding:0 16px}
.calgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.calhd{font:800 11px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:4px 6px}
.cday{min-height:104px;border:1px solid var(--line);border-radius:12px;padding:6px;background:var(--card);cursor:pointer;display:flex;flex-direction:column;gap:3px;overflow:hidden;text-align:left;color:var(--text);font:inherit}
.cday.out{opacity:.35}.cday.today{border-color:var(--frame);box-shadow:inset 0 0 0 1px var(--frame)}.cday.sel{outline:2px solid var(--go);outline-offset:-2px}
.cday .dn{font:800 13px var(--display)}
.cr{display:flex;align-items:center;gap:5px;font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr i{flex:none;width:8px;height:8px;border-radius:50%}.cr.hol{color:#ff9a5c}.cr.sea{color:#9fc6ef}.cr.more{color:var(--muted)}
.cdet{margin-top:16px}.cdet h3{margin:0 0 10px;font:800 16px var(--display)}
.ditem{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;color:var(--text);text-decoration:none;background:rgba(255,255,255,.03)}
.ditem i{flex:none;width:12px;height:12px;border-radius:50%}.ditem b{font-weight:700}.ditem .small{margin-left:auto}
.ditem.hol{border-color:rgba(255,154,92,.5)}.ditem.sea{border-color:rgba(159,198,239,.45)}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:12px 0 0;font-size:12px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:6px}.legend i{width:10px;height:10px;border-radius:50%}
@media (max-width:700px){.cday{min-height:58px;padding:4px}.cr span{display:none}.cr{gap:2px}.cday .crs{display:flex;flex-wrap:wrap;gap:3px}.cr.more{display:none}}
</style>
<p class="small" style="margin:0 0 10px"><a href="/settings?part=shift">Move a whole range's release dates ›</a></p>
<div class="calbar"><button class="btn" id="cPrev" type="button">‹</button><h2 id="cTitle"></h2><button class="btn" id="cToday" type="button">Today</button><button class="btn" id="cNext" type="button">›</button></div>
<div class="calgrid" id="cGrid"></div>
<div class="legend"><span><i style="background:var(--ih)"></i>Introvert Here</span><span><i style="background:var(--sh)"></i>SHHH.</span><span><i style="background:var(--pc)"></i>Per Contract</span><span><i style="background:var(--os)"></i>Off The Shelf</span><span><i style="background:#ff9a5c"></i>Sales date</span><span><i style="background:#9fc6ef"></i>Seasonal tags</span></div>
<div class="cdet card" id="cDet"></div>
<script>
(function () {
  var EV = ${JSON.stringify(ev).replace(/</g, "\\u003c")}, SEAS = ${JSON.stringify(SEASON_WINDOWS)};
  var COL = { IH: "var(--ih)", SH: "var(--sh)", PC: "var(--pc)", OS: "var(--os)" };
  function h(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nth(y, m, wd, n) { var d = new Date(y, m, 1); var off = (wd - d.getDay() + 7) % 7; return new Date(y, m, 1 + off + 7 * (n - 1)); }
  function easter(y) { var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451), mo = Math.floor((hh + l - 7 * m + 114) / 31), da = ((hh + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  function add(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  // Sales dates worth planning around (UK shop, plenty of US buyers on Etsy).
  function holidays(y) {
    var E = easter(y), tg = nth(y, 10, 4, 4), L = [];
    function p(d, t, n) { L.push([iso(d), t, n || ""]); }
    p(new Date(y, 0, 2), "World Introvert Day", "Made for this shop - worth a social post.");
    p(new Date(y, 1, 14), "Valentine's Day", "Anti-Valentine's gags do well.");
    p(nth(y, 2, 4, 1), "World Book Day (UK)", "Off The Shelf.");
    p(add(E, -21), "Mothering Sunday (UK)");
    p(E, "Easter Sunday");
    p(nth(y, 4, 0, 2), "Mother's Day (US)");
    p(nth(y, 5, 0, 3), "Father's Day");
    p(new Date(y, 7, 9), "Book Lovers Day", "Off The Shelf.");
    p(new Date(y, 9, 16), "Boss's Day", "Per Contract.");
    p(new Date(y, 9, 31), "Halloween");
    p(new Date(y, 10, 11), "Singles' Day");
    p(add(tg, 1), "Black Friday", "Biggest sales weekend of the year.");
    p(add(tg, 4), "Cyber Monday");
    p(new Date(y, 11, 10), "Last safe Christmas order (approx.)", "Print and post takes about 10-14 days to UK addresses. Check Printify's cut-off each year.");
    p(new Date(y, 11, 25), "Christmas Day");
    p(new Date(y, 11, 26), "Boxing Day sales");
    return L;
  }
  function seasons(y) { var L = []; SEAS.forEach(function (s) { var sm = Math.floor(s[1] / 100), sd = s[1] % 100, em = Math.floor(s[2] / 100), ed = s[2] % 100;
    [y - 1, y].forEach(function (yy) { var st = new Date(yy, sm - 1, sd), en = new Date(s[2] < s[1] ? yy + 1 : yy, em - 1, ed);
      L.push([iso(add(st, -7)), "Seasonal tags: " + s[0] + " starts next week", "From " + st.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " live listings swap in " + s[0] + " gift tags automatically (every morning at 07:20). Good week to check the phrases in Settings."]);
      L.push([iso(st), "Seasonal tags on: " + s[0], "Live listings start getting " + s[0] + " tags today, automatically."]);
      L.push([iso(add(en, 1)), "Seasonal tags off: " + s[0], s[0] + " tags are swapped back out of live listings, automatically."]); }); });
    return L; }
  var extra = {};
  function build(y) { [y - 1, y, y + 1].forEach(function (yy) { if (extra["y" + yy]) return; extra["y" + yy] = 1;
    holidays(yy).forEach(function (x) { (extra[x[0]] = extra[x[0]] || []).push({ hol: 1, t: x[1], n: x[2] }); });
    seasons(yy).forEach(function (x) { var l = (extra[x[0]] = extra[x[0]] || []); if (!l.some(function (q) { return q.t === x[1]; })) l.push({ sea: 1, t: x[1], n: x[2] }); }); }); }
  var now = new Date(), cur = new Date(now.getFullYear(), now.getMonth(), 1), sel = iso(now);
  function items(day) { return { rel: (EV[day] || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }), oth: extra[day] || [] }; }
  function draw() {
    build(cur.getFullYear());
    document.getElementById("cTitle").textContent = cur.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    var start = add(cur, -((cur.getDay() + 6) % 7)), html = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="calhd">' + d + "</div>"; }).join("");
    for (var i = 0; i < 42; i++) { var d = add(start, i), k = iso(d), it = items(k), rows = [];
      if (i >= 35 && d.getMonth() !== cur.getMonth()) break;
      it.oth.forEach(function (o) { rows.push('<div class="cr ' + (o.hol ? "hol" : "sea") + '"><i style="background:' + (o.hol ? "#ff9a5c" : "#9fc6ef") + '"></i><span>' + h(o.t) + "</span></div>"); });
      it.rel.forEach(function (o) { rows.push('<div class="cr"><i style="background:' + (COL[o.id.slice(0, 2)] || "var(--muted)") + '"></i><span>' + h(o.id) + " " + h(o.gname) + "</span></div>"); });
      var shown = rows.slice(0, 4).join("") + (rows.length > 4 ? '<div class="cr more">+' + (rows.length - 4) + " more</div>" : "");
      html += '<button type="button" class="cday' + (d.getMonth() !== cur.getMonth() ? " out" : "") + (k === iso(now) ? " today" : "") + (k === sel ? " sel" : "") + '" data-d="' + k + '"><span class="dn">' + d.getDate() + '</span><span class="crs">' + shown + "</span></button>"; }
    document.getElementById("cGrid").innerHTML = html; det();
  }
  function det() { var it = items(sel), d = new Date(sel + "T12:00:00");
    var out = '<h3>' + d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + "</h3>";
    it.oth.forEach(function (o) { out += '<div class="ditem ' + (o.hol ? "hol" : "sea") + '"><i style="background:' + (o.hol ? "#ff9a5c" : "#9fc6ef") + '"></i><div><b>' + h(o.t) + "</b>" + (o.n ? '<div class="small">' + h(o.n) + "</div>" : "") + "</div></div>"; });
    it.rel.forEach(function (o) { var href = o.edit ? "/gags?edit=" + encodeURIComponent(o.id) : "/gag/" + encodeURIComponent(o.id);
      out += '<a class="ditem" href="' + href + '"><i style="background:' + (COL[o.id.slice(0, 2)] || "var(--muted)") + '"></i><div><b>' + h(o.id) + " · " + h(o.gname) + "</b><div class=\\"small\\">" + h(o.stem) + "</div></div><span class=\\"small\\">" + (o.built ? "Built ✓" : o.edit ? "Tap to edit" : "") + "</span></a>"; });
    if (!it.oth.length && !it.rel.length) out += '<p class="small">Nothing on this day.</p>';
    document.getElementById("cDet").innerHTML = out; }
  document.getElementById("cGrid").addEventListener("click", function (e) { var b = e.target.closest("[data-d]"); if (!b) return; sel = b.dataset.d; draw(); if (window.innerWidth < 700) document.getElementById("cDet").scrollIntoView({ behavior: "smooth" }); });
  document.getElementById("cPrev").onclick = function () { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); draw(); };
  document.getElementById("cNext").onclick = function () { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); draw(); };
  document.getElementById("cToday").onclick = function () { cur = new Date(now.getFullYear(), now.getMonth(), 1); sel = iso(now); draw(); };
  draw();
})();
</script>`);
}

// "What's working": plain-English pointers from the daily Etsy numbers (Barry, 14 Nov).
function workingHtml(st, hist) {
  const live = (st.listings || []).filter((l) => l.listingId);
  if (live.length < 4) return "";
  const days = Object.keys(hist || {}).sort(), last = days[days.length - 1], wk = days.filter((d) => d <= addDays(last, -7)).pop();
  const recent = (code) => (last && wk && hist[last][code] && hist[wk][code]) ? hist[last][code][0] - hist[wk][code][0] : null;
  const RN = { IH: "Introvert Here", SH: "SHHH.", PC: "Per Contract", OS: "Off The Shelf" };
  const avgBy = (keyFn) => { const m = {}; live.forEach((l) => { const k = keyFn(l); (m[k] = m[k] || { v: 0, n: 0, f: 0 }); m[k].v += l.views || 0; m[k].f += l.favs || 0; m[k].n++; });
    return Object.entries(m).map(([k, x]) => ({ k, avg: x.v / x.n, favs: x.f, n: x.n })).sort((a, b) => b.avg - a.avg); };
  const rng = avgBy((l) => l.code.slice(0, 2)), gar = avgBy((l) => l.type);
  const hot = live.map((l) => ({ l, r: recent(l.code) })).filter((x) => x.r !== null && x.r > 0).sort((a, b) => b.r - a.r).slice(0, 3);
  const colours = {}; (st.orders || []).forEach((o) => { const c = String(o.variant || "").split("/")[0].trim(); if (c) colours[c] = (colours[c] || 0) + (Number(o.qty) || 1); });
  const col = Object.entries(colours).sort((a, b) => b[1] - a[1]);
  const li = [];
  if (rng.length > 1) li.push(`<b>${esc(RN[rng[0].k] || rng[0].k)}</b> gets the most views per listing (${rng[0].avg.toFixed(1)}), ${rng.length > 1 ? "then " + esc(RN[rng[1].k] || rng[1].k) + " (" + rng[1].avg.toFixed(1) + ")" : ""}.`);
  if (gar.length > 1) li.push(`<b>${esc(garmentName(gar[0].k))}</b> listings get the most views on average (${gar[0].avg.toFixed(1)}); ${esc(garmentName(gar[gar.length - 1].k))} the fewest (${gar[gar.length - 1].avg.toFixed(1)}).`);
  if (hot.length) li.push(`Busiest this week: ${hot.map((x) => `<b>${esc(x.l.stem || x.l.code)}</b> ${esc(garmentName(x.l.type))} (+${x.r})`).join(", ")}.`);
  if (col.length) li.push(`Colours sold so far: ${col.map(([c, n]) => esc(c) + " ×" + n).join(", ")}.`);
  return li.length ? `<h2>What's working</h2><div class="card"><ul style="margin:0;padding-left:20px;line-height:1.7">${li.map((x) => "<li>" + x + "</li>").join("")}</ul><p class="small" style="margin-bottom:0">Small numbers early on, so treat these as hints rather than rules.</p></div>` : "";
}
async function priceTestsHtml(env, st, hist) {
  const tests = (await env.PENDING.get(PRICE_TESTS_KEY, "json")) || [];
  const live = (st.listings || []).filter((l) => l.listingId);
  const combos = []; live.forEach((l) => { const k = l.coll + "|" + l.type; if (!combos.includes(k)) combos.push(k); });
  const days = Object.keys(hist || {}).sort();
  const perDay = (t, from, to) => { const ds = days.filter((d) => d >= from && d <= to); if (ds.length < 2) return null;
    const codes = live.filter((l) => l.coll === t.coll && l.type === t.type).map((l) => l.code);
    const v = (d) => codes.reduce((a, c) => a + (((hist[d] || {})[c] || [0])[0] || 0), 0);
    return (v(ds[ds.length - 1]) - v(ds[0])) / Math.max(1, (Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / 864e5); };
  const sold = (t, from, to) => (st.orders || []).filter((o) => o.code && o.code.indexOf("-" + t.type) > 0 && o.date >= from && o.date <= to).length;
  const RN = { "INTROVERT HERE…": "Introvert Here", "SHHH.": "SHHH.", "PER CONTRACT": "Per Contract", "OFF THE SHELF": "Off The Shelf" };
  const today = new Date().toISOString().slice(0, 10);
  const rows = tests.map((t) => { const end = t.end || today, before = perDay(t, addDays(t.start, -14), t.start), after = perDay(t, t.start, end);
    const cur = live.find((l) => l.coll === t.coll && l.type === t.type);
    return `<div class="setrow" style="display:flex;gap:12px;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding:12px 0"><div><b>${esc(RN[t.coll] || t.coll)} · ${esc(garmentName(t.type))}</b> <span class="small">from ${esc(t.start)}${t.end ? " to " + esc(t.end) : " (running)"} · £${Number(t.oldPrice || 0).toFixed(2)} → £${Number(cur ? cur.price : 0).toFixed(2)}</span>
      <div class="small">Views a day: ${before === null ? "—" : before.toFixed(1)} before → ${after === null ? "still collecting" : after.toFixed(1)} since · sales: ${sold(t, addDays(t.start, -14), t.start)} in the 2 weeks before, ${sold(t, t.start, end)} since${t.note ? " · " + esc(t.note) : ""}</div></div>
      ${t.end ? "" : `<button class="btn" type="button" data-ptend="${esc(t.id)}" style="width:auto">End test</button>`}</div>`; }).join("");
  return `<h2>Price tests</h2><div class="card"><p class="small" style="margin-top:0">Change a price on the Pricing page, then start a test here. It compares views and sales from the two weeks before with the time since, for that range and garment.</p>
  ${rows || ""}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><select id="ptC" style="flex:1;min-width:200px">${combos.map((k) => { const [c, t] = k.split("|"); return `<option value="${esc(k)}">${esc(RN[c] || c)} · ${esc(garmentName(t))}</option>`; }).join("")}</select>
  <input id="ptN" placeholder="Note (e.g. £24.99 instead of £26.99)" style="flex:2;min-width:200px"><button class="btn-main" id="ptGo" type="button" style="width:auto;padding:0 22px">Start test</button></div></div>
  <script>(function () { function post(b) { return fetch("/api/price-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().then(function (o) { if (!r.ok) throw new Error(o.error || "Failed"); return o; }); }); }
    var g = document.getElementById("ptGo"); if (g) g.onclick = function () { var k = document.getElementById("ptC").value.split("|"); post({ action: "start", coll: k[0], type: k[1], note: document.getElementById("ptN").value }).then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); }); };
    document.querySelectorAll("[data-ptend]").forEach(function (b) { b.onclick = function () { post({ action: "end", id: b.dataset.ptend }).then(function () { location.reload(); }); }; }); })();</script>`;
}

// ---------- Batch 2 (Barry, 14 Nov): ratings, quiet listings, Etsy reviews, backups, range shift ----------
const STARS_KEY = "gag-stars";
async function starsApi(request, env) {
  const M = (await env.PENDING.get(STARS_KEY, "json")) || {};
  if (request.method === "GET") return json(M);
  const d = await request.json().catch(() => ({}));
  const id = str(d.id), n = Math.round(Number(d.n));
  if (!/^[A-Z]{2}-\d{5}$/.test(id)) return json({ error: "Bad gag ID" }, 400);
  if (n >= 1 && n <= 5) M[id] = n; else delete M[id];
  await env.PENDING.put(STARS_KEY, JSON.stringify(M));
  return json({ ok: true });
}

// Quiet listings: live 60+ days with hardly any interest.
async function quietListings(env) {
  const [st, g] = await Promise.all([env.PENDING.get("stats", "json"), env.PENDING.get("gags", "json")]);
  const TY = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"], rel = {};
  ((g && g.all) || []).forEach((x) => { (x.ds || []).forEach((d, i) => { if (d) rel[x.id + "-" + TY[i]] = d; }); });
  const today = Date.now();
  return ((st && st.listings) || []).filter((l) => l.listingId).map((l) => ({ l, rel: rel[l.code], age: rel[l.code] ? Math.floor((today - Date.parse(rel[l.code] + "T00:00:00Z")) / 864e5) : null }))
    .filter((x) => x.age !== null && x.age >= 60 && (x.l.views || 0) < 10 && !(x.l.favs > 0)).sort((a, b) => (a.l.views || 0) - (b.l.views || 0));
}
async function quietPage(env) {
  const q = await quietListings(env);
  const row = (x) => { const gid = x.l.code.split("-").slice(0, 2).join("-");
    return `<div class="card qrow"><div><b>${esc(x.l.stem || gid)}</b> · ${esc(garmentName(x.l.type))} <span class="small">${esc(x.l.code)} · live ${x.age} days · ${x.l.views || 0} views · no favourites</span></div>
    <div class="qact"><a class="btn" href="${esc(x.l.url)}" target="_blank" rel="noopener">See on Etsy</a><a class="btn" href="/amend?gag=${encodeURIComponent(gid)}">New tags or photos</a><a class="btn" href="/gag/${encodeURIComponent(gid)}">Gag details</a></div></div>`; };
  return shell(`${brandHeader("Quiet listings")}
<style>.qrow{display:flex;flex-direction:column;gap:10px;margin-bottom:10px}.qact{display:flex;gap:8px;flex-wrap:wrap}.qact .btn{width:auto;min-height:42px;padding:0 14px}</style>
<p class="small">Listings live for 60 days or more with fewer than 10 views and no favourites. Things to try: fresher tags (Tags page or Update listings), a different lead photo (Update listings → Choose photos), or a seasonal push when its occasion comes round. Checked against the daily Etsy numbers.</p>
${q.length ? q.map(row).join("") : `<div class="allclear">${icon("check")}<span><b>Nothing quiet</b>No listing has been live 60+ days with under 10 views. (Most listings are newer than that so far.)</span></div>`}`);
}

// Etsy reviews: fetched every 6 hours through the Make "Etsy tool" scenario, newest first.
const REVIEWS_KEY = "reviews";
async function reviewsCheck(env, force) {
  const prev = (await env.PENDING.get(REVIEWS_KEY, "json")) || { list: [] };
  if (!force && prev.at && Date.now() - prev.at < 6 * 3600e3) return prev;
  const token = env.SECRETS && (await env.SECRETS.get("make_token")); if (!token) return prev;
  try {
    const r = await fetch(MAKE_API + "/scenarios/7705176/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ responsive: true, data: { path: "/shops/65435151/reviews", method: "GET", qs: [{ key: "limit", value: "50" }] } }) });
    const j = await r.json().catch(() => ({})); let b = j.outputs && (j.outputs.data !== undefined ? j.outputs.data : j.outputs.body); if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    if (!b || !Array.isArray(b.results)) { prev.at = Date.now(); prev.error = "Etsy said: " + String((j.error && j.error.message) || r.status).slice(0, 120); await env.PENDING.put(REVIEWS_KEY, JSON.stringify(prev)); return prev; }
    const list = b.results.map((x) => ({ id: String(x.transaction_id || x.created_timestamp), rating: x.rating, text: x.review || "", listing: x.listing_id, at: (x.created_timestamp || x.create_timestamp || 0) * 1000 })).sort((a, c) => c.at - a.at);
    const out = { at: Date.now(), list };
    await env.PENDING.put(REVIEWS_KEY, JSON.stringify(out)); return out;
  } catch (e) { return prev; }
}
function reviewDraft(r) {
  const n = Number(r.rating) || 0;
  if (n >= 5) return "Thank you so much for the lovely review. It genuinely made our day (quietly, in a corner). Enjoy wearing it, and we hope it saves you from at least one conversation.\n\n— Introvert Here";
  if (n === 4) return "Thank you for taking the time to leave a review. We're really glad you like it. If there's anything we could have done better, do send us a message; we read every one.\n\n— Introvert Here";
  return "Thank you for your honest review, and we're sorry it wasn't quite right. Please send us a message through Etsy so we can put it right for you.\n\n— Introvert Here";
}
// Copy watch (Barry, 15 Nov): once a week, search Etsy for the wording of every live gag and flag other shops'
// listings that contain it. One gag per 5-minute tick, two searches each, through the Make "Etsy tool".
const COPY_KEY = "copywatch", OWN_SHOP = 65435151;
const cwNorm = (s) => String(s || "").replace(/&#39;|&rsquo;|’|'/g, "").replace(/&[a-z#0-9]+;/gi, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function cwLines(text) { return String(text || "").split(/\n+/).map((l) => cwNorm(l.replace(/^\s*(\.\.\.|…)/, ""))).filter((l) => l.split(" ").length >= 3); }
function cwMatch(gag, listing) {
  const T = " " + cwNorm([listing.title, listing.description, (listing.tags || []).join(" ")].join(" ")) + " ";
  const full = cwNorm(String(gag.text || "").replace(/^\s*(\.\.\.|…)/, ""));
  if (full.split(" ").length >= 4 && T.includes(" " + full + " ")) return "whole gag";
  const lines = cwLines(gag.text).filter((l) => T.includes(" " + l + " "));
  if (lines.some((l) => l.split(" ").length >= 6) || lines.length >= 2) return lines.length + " line" + (lines.length === 1 ? "" : "s") + " of the gag";
  return "";
}
async function etsySearch(env, token, keywords) {
  const r = await fetch(MAKE_API + "/scenarios/7705176/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ responsive: true, data: { path: "/listings/active", method: "GET", qs: [{ key: "keywords", value: keywords }, { key: "limit", value: "50" }] } }) });
  const j = await r.json().catch(() => ({})); let b = j.outputs && (j.outputs.data !== undefined ? j.outputs.data : j.outputs.body); if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
  if (!b || !Array.isArray(b.results)) throw new Error("Etsy search failed (" + r.status + ")");
  return b.results;
}
async function copyWatchTick(env, force) {
  const W = (await env.PENDING.get(COPY_KEY, "json")) || { checked: {}, hits: [], ignore: {} };
  const S = await env.PENDING.get("amend", "json"); if (!S || !S.gags) return;
  const now = Date.now(), live = S.gags.filter((g) => (g.live || []).length && String(g.text || "").trim());
  const due = live.filter((g) => !W.checked[g.id] || now - W.checked[g.id] > 7 * 864e5).sort((a, b) => (W.checked[a.id] || 0) - (W.checked[b.id] || 0));
  if (!due.length) return;
  if (W.errAt && now - W.errAt < 30 * 60e3) return;   // after a failed search, wait half an hour before trying again
  const token = env.SECRETS && (await env.SECRETS.get("make_token")); if (!token) return;
  const g = due[0], lines = cwLines(g.text).sort((a, b) => b.split(" ").length - a.split(" ").length);
  const queries = [...new Set([lines[0] && lines[0].split(" ").slice(0, 6).join(" "), lines[1] && lines[1].split(" ").slice(0, 6).join(" "), cwNorm(g.stem)].filter((q) => q && q.split(" ").length >= 2))].slice(0, 2);
  const seen = {};
  try {
    for (const q of queries) for (const L of await etsySearch(env, token, q)) {
      if (Number(L.shop_id) === OWN_SHOP || seen[L.listing_id] || W.ignore[L.listing_id]) continue; seen[L.listing_id] = 1;
      const why = cwMatch(g, L); if (!why) continue;
      if (W.hits.some((h) => String(h.listing) === String(L.listing_id))) continue;
      W.hits.unshift({ gag: g.id, stem: g.stem, text: g.text, listing: L.listing_id, shop: L.shop_id, title: String(L.title || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&"), url: String(L.url || "https://www.etsy.com/listing/" + L.listing_id).split("?")[0], why, at: now, status: "new" });
    }
  } catch (e) { W.err = String(e.message || e) + (/401|403/.test(String(e.message)) ? " (the app's Make key can't start scenarios: it needs scenarios:run, see Credits)" : ""); W.errAt = now; await env.PENDING.put(COPY_KEY, JSON.stringify(W)); return; }
  delete W.errAt; W.checked[g.id] = now; W.last = now; W.hits = W.hits.slice(0, 200);
  await env.PENDING.put(COPY_KEY, JSON.stringify(W));
}
async function copyWatchApi(request, env) {
  const d = await request.json().catch(() => ({}));
  const W = (await env.PENDING.get(COPY_KEY, "json")) || { checked: {}, hits: [], ignore: {} };
  if (d.action === "recheck") { W.checked = {}; await env.PENDING.put(COPY_KEY, JSON.stringify(W)); return json({ ok: true }); }
  const h = W.hits.find((x) => String(x.listing) === String(d.listing)); if (!h) return json({ error: "Not found" }, 404);
  if (d.action === "notcopy") { W.ignore[h.listing] = 1; W.hits = W.hits.filter((x) => x !== h); }
  else if (d.action === "reported") { h.status = "reported"; h.doneAt = Date.now(); }
  else if (d.action === "gone") { W.ignore[h.listing] = 1; W.hits = W.hits.filter((x) => x !== h); }
  else return json({ error: "Unknown action" }, 400);
  await env.PENDING.put(COPY_KEY, JSON.stringify(W));
  return json({ ok: true });
}
async function copyWatchPage(env) {
  const W = (await env.PENDING.get(COPY_KEY, "json")) || { checked: {}, hits: [], ignore: {} };
  const S = await env.PENDING.get("amend", "json"), G = await env.PENDING.get("gags", "json");
  const live = ((S && S.gags) || []).filter((g) => (g.live || []).length).length, done = Object.keys(W.checked || {}).length;
  const firstRel = (id) => { const a = ((G && G.all) || []).find((x) => x.id === id); const ds = ((a && a.ds) || []).filter(Boolean).sort(); return ds[0] || ""; };
  const card = (h) => `<div class="card cw" data-l="${esc(h.listing)}"><div class="small">${esc(h.gag)} · ${esc(h.stem || "")} · found ${esc(new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))} · matches ${esc(h.why)}</div>
    <h3 style="margin:6px 0">${esc(h.title)}</h3><div class="gagtx">${esc(h.text)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a class="btn" href="${esc(h.url)}" target="_blank" rel="noopener">Open their listing</a>${h.status === "new" ? `<button class="btn" type="button" data-a="reported">I've reported it</button>` : `<span class="small" style="align-self:center">Reported ${esc(new Date(h.doneAt || h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}</span><button class="btn" type="button" data-a="gone">It's been taken down</button>`}<button class="btn" type="button" data-a="notcopy">Not a copy</button></div>
    ${h.status === "new" ? `<details style="margin-top:10px"><summary class="small">How to report it, and your evidence</summary><p class="small">On their listing, scroll to the bottom and tap <b>Report this item to Etsy</b> → <b>It infringes my intellectual property</b>. Etsy asks for the original: give your listing and these details.</p><p class="small" style="white-space:pre-wrap;user-select:all;background:var(--field);padding:10px;border-radius:10px">Original work: "${esc(String(h.text || "").replace(/\s+/g, " "))}"
Written by Introvert Here (Mosspit Studios), gag ${esc(h.gag)}, first released ${esc(firstRel(h.gag) || "on Etsy")}, kept in our dated design records since before release.
Our shop: https://www.etsy.com/shop/IntrovertHereShop</p></details>` : ""}</div>`;
  const nw = W.hits.filter((h) => h.status === "new"), rep = W.hits.filter((h) => h.status === "reported");
  return shell(`${brandHeader("Copy watch")}
<style>.cw h3{font-size:16px}.gagtx{white-space:pre-line;font-size:14px;color:var(--muted);border-left:3px solid var(--line);padding-left:10px}</style>
<div class="card"><p style="margin:0">Once a week the app searches Etsy for the wording of each of your <b>${live}</b> live gags and lists other shops' listings that contain it. ${done ? `Checked so far this round: <b>${Math.min(done, live)}</b> of ${live}.` : "The first round is running now (one gag every 5 minutes)."}${W.last ? " Last check " + esc(when(W.last)) + "." : ""}${W.err && W.errAt > (W.last || 0) - 600000 ? ` <span style="color:var(--warn)">Last search problem: ${esc(W.err)}</span>` : ""}</p>
<p class="small" style="margin:8px 0 0">"Not a copy" hides a match for good. Common phrases can match by chance, so do look before reporting. Amazon isn't covered yet.</p>
<button class="btn" type="button" id="cwAll" style="margin-top:10px">Check everything again now</button></div>
<h2>Possible copies${nw.length ? " (" + nw.length + ")" : ""}</h2>${nw.length ? nw.map(card).join("") : `<div class="card empty">${icon("check")}Nothing found${done ? "" : " yet"}.</div>`}
${rep.length ? `<h2>Reported, waiting for Etsy</h2>${rep.map(card).join("")}` : ""}
<script>document.addEventListener("click", function (e) { var b = e.target.closest("[data-a]"), all = e.target.closest("#cwAll"); if (!b && !all) return;
  var body = all ? { action: "recheck" } : { action: b.dataset.a, listing: b.closest(".cw").dataset.l }; (b || all).disabled = true;
  fetch("/api/copywatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) { alert(j.error); return; } if (all && window.toast) toast("A full check has started: one gag every 5 minutes."); setTimeout(function () { location.reload(); }, all ? 1200 : 200); }); });</script>`);
}

async function reviewsPage(env) {
  const R = await reviewsCheck(env, false); const st = await env.PENDING.get("stats", "json");
  const byListing = {}; ((st && st.listings) || []).forEach((l) => { if (l.listingId) byListing[String(l.listingId)] = l; });
  const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  const rows = (R.list || []).map((r) => { const l = byListing[String(r.listing)];
    return `<div class="card rv"><div class="rvh"><span class="rvs">${stars(Number(r.rating) || 0)}</span><span class="small">${r.at ? esc(when(r.at)) : ""}${l ? " · " + esc(l.stem || l.code) + " " + esc(garmentName(l.type)) : ""}</span></div>
    ${r.text ? `<p>${esc(r.text)}</p>` : '<p class="small">(No written review, just stars.)</p>'}
    <details><summary>Draft reply</summary><textarea class="rvd">${esc(reviewDraft(r))}</textarea><button class="btn" type="button" data-cpy>Copy reply</button></details></div>`; }).join("");
  return shell(`${brandHeader("Reviews")}
<style>.rv{margin-bottom:10px}.rvh{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.rvs{color:#f0c870;font-size:20px;letter-spacing:2px}.rvd{display:block;width:100%;min-height:120px;margin:8px 0;padding:10px;border:1.5px solid var(--line);border-radius:10px;background:var(--field);color:var(--text);font:15px var(--body)}
.rv details summary{cursor:pointer;font:800 12px var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.rv .btn{width:auto}</style>
<p class="small">Your Etsy reviews, checked every 6 hours${R.at ? " (last " + esc(when(R.at)) + ")" : ""}. Etsy doesn't let apps post replies, so copy a draft, edit if you like, and paste it in Etsy: <a href="https://www.etsy.com/your/shops/me/reviews" target="_blank" rel="noopener">Shop Manager → Reviews</a>.${R.error ? " Last check: " + esc(R.error) : ""}</p>
${rows || `<div class="allclear">${icon("check")}<span><b>No reviews yet</b>They'll appear here, newest first, with a reply drafted for each.</span></div>`}
<script>document.addEventListener("click", function (e) { var b = e.target.closest("[data-cpy]"); if (!b) return; navigator.clipboard.writeText(b.previousElementSibling.value).then(function () { toast("Copied"); }); });</script>`);
}

// Shift a whole range's unreleased schedule by N weeks (Settings → Schedule).
const toSerial = (iso) => Math.round((Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 864e5);
async function rangeShift(d, env) {
  const pre = str(d.prefix), weeks = Math.round(Number(d.weeks));
  if (!["IH", "SH", "PC", "OS"].includes(pre)) return json({ error: "Pick a range." }, 400);
  if (!weeks || Math.abs(weeks) > 104) return json({ error: "Pick a number of weeks between -104 and 104 (not 0)." }, 400);
  const g = await env.PENDING.get("gags", "json");
  if (!g || !g.sched || !g.sched.every((x) => x.r)) return json({ error: "The app's schedule copy is out of date. Tap Sync to Core, wait a minute and try again." }, 400);
  const safe = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const shiftD = (iso) => new Date(Date.parse(iso + "T00:00:00Z") + weeks * 7 * 864e5).toISOString().slice(0, 10);
  const rows = [];
  g.sched.filter((x) => x.id.startsWith(pre + "-")).forEach((x) => rows.push({ r: x.r, id: x.id, d: x.d, b: x.b || [0, 0, 0, 0], ref: x }));
  (g.empties || []).filter((x) => x.id.startsWith(pre + "-")).forEach((x) => rows.push({ r: x.r, id: x.id, d: x.dates, b: [0, 0, 0, 0], ref: x, empty: true }));
  let moved = 0, tooSoon = null;
  rows.forEach((x) => { x.nd = x.d.map((v, i) => { if (!v || x.b[i] || v < safe) return v; const n = shiftD(v); if (n < safe) tooSoon = x.id; moved++; return n; }); });
  if (tooSoon) return json({ error: "That would move " + tooSoon + " into the next two days or the past. Pick fewer weeks back." }, 400);
  if (!moved) return json({ error: "Nothing to move: no unreleased dates in that range." }, 400);
  rows.sort((a, b) => a.r - b.r);
  const ops = []; let blk = [];
  const flush = () => { if (!blk.length) return; ops.push({ url: `${AMEND_XL}/worksheets/GAGS/range(address='I${blk[0].r}:L${blk[blk.length - 1].r}')`, values: blk.map((x) => x.nd.map((v) => (v ? toSerial(v) : ""))) }); blk = []; };
  rows.forEach((x) => { if (blk.length && x.r !== blk[blk.length - 1].r + 1) flush(); blk.push(x); }); flush();
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  rows.forEach((x) => { if (x.empty) x.ref.dates = x.nd; else x.ref.d = x.nd; });
  const byId = {}; rows.forEach((x) => { byId[x.id] = x.nd; }); (g.editable || []).forEach((e) => { if (byId[e.id]) e.dates = byId[e.id]; });
  await env.PENDING.put("gags", JSON.stringify(g));
  if (!d.isUndo) await logSetting(env, "Moved " + pre + "'s unreleased schedule " + (weeks > 0 ? weeks + " week" + (weeks === 1 ? "" : "s") + " later" : -weeks + " week" + (weeks === -1 ? "" : "s") + " earlier"), { kind: "shift", prefix: pre, weeks: -weeks });
  return json({ ok: true, moved, ops: ops.length });
}

// Restore Core to how it was at a nightly backup time (Barry asked for the button, 14 Nov).
// Uses OneDrive's version history for Core itself, so the file (and Make's link to it) stays the same.
// Restoring creates a new version, so the version that was current just before is kept for "Undo".
const CORE_ITEM = "graph:/v1.0/drives/b!ndnYRjl_sE21BKMMz_r6PMo1voTJfixLpQRKuPki-i9EoHVOO8R9TbWVCCuU0ua6/items/01R3POCZGZPJY6UCRSEJD3MBADE4GJ24YQ";
async function coreTool(env, path, method = "GET", body) {
  const token = env.SECRETS && (await env.SECRETS.get("make_token")); if (!token) throw new Error("No Make token saved.");
  const data = { path, method }; if (body !== undefined) data.body = JSON.stringify(body);
  const r = await fetch(MAKE_API + "/scenarios/7446858/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" }, body: JSON.stringify({ responsive: true, data }) });
  const j = await r.json().catch(() => ({})); if (j.error) throw new Error(String(j.error.message || "Make error").slice(0, 200));
  let b = j.outputs && (j.outputs.data !== undefined ? j.outputs.data : j.outputs.body); if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
  return b && b.data && b.data.value ? b.data : b;
}
async function restoreCore(d, env) {
  try {
    let versionId = str(d.version), label = "";
    let current = null;
    if (!versionId) {
      const date = str(d.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Pick a backup date." }, 400);
      const target = date + "T02:16:00Z";
      let path = CORE_ITEM + "/versions?$select=id,lastModifiedDateTime&$top=200", pages = 0, found = null;
      while (path && pages < 25 && !found) {
        const b = await coreTool(env, path); const vals = (b && b.value) || []; if (!current && vals[0]) current = vals[0];
        found = vals.find((v) => v.lastModifiedDateTime <= target) || null;
        path = b && b["@odata.nextLink"] ? b["@odata.nextLink"].replace("https://graph.microsoft.com", "graph:") : ""; pages++;
      }
      if (!found) return json({ error: "OneDrive doesn't have a version of Core from that far back." }, 400);
      if (current && found.id === current.id) return json({ error: "Core hasn't changed since then, so there's nothing to restore." }, 400);
      versionId = found.id; label = "Core restored to " + date + " 02:15 (version " + found.id + ")";
    } else { const b = await coreTool(env, CORE_ITEM + "/versions?$select=id&$top=1"); current = ((b && b.value) || [])[0] || null; label = "Restore undone (back to version " + versionId + ")"; }
    await coreTool(env, CORE_ITEM + "/versions/" + encodeURIComponent(versionId) + "/restoreVersion", "POST", {});
    if (current && !d.isUndo) await logSetting(env, label, { kind: "restore", version: current.id });
    await env.PENDING.put("credits-force", "1");
    return json({ ok: true, restored: versionId });
  } catch (e) { return json({ error: "Restore didn't go through: " + e.message + ". Nothing was changed." }, 502); }
}

// Backups: list the nightly copies (read-only) through the Make Core tool.
async function backupList(env) {
  const token = env.SECRETS && (await env.SECRETS.get("make_token")); if (!token) return { error: "No Make token saved." };
  try {
    const r = await fetch(MAKE_API + "/scenarios/7446858/run", { method: "POST", headers: { Authorization: "Token " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ responsive: true, data: { path: "graph:/v1.0/drives/b!ndnYRjl_sE21BKMMz_r6PMo1voTJfixLpQRKuPki-i9EoHVOO8R9TbWVCCuU0ua6/items/01R3POCZGVFIVC2ML2V5E2W63R4ZN5PT3T/children?$select=name,webUrl,lastModifiedDateTime&$orderby=name desc&$top=40", method: "GET" } }) });
    const j = await r.json().catch(() => ({})); let b = j.outputs && (j.outputs.data !== undefined ? j.outputs.data : j.outputs.body); if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    if (b && b.data && b.data.value) b = b.data;
    return { list: ((b && b.value) || []).map((x) => ({ name: x.name, url: x.webUrl, at: x.lastModifiedDateTime })) };
  } catch (e) { return { error: "Couldn't reach Make." }; }
}

// ---------- Improvements batch (Barry, 14 Nov) ----------
// Sales dates worth a sale or a push: reminder card from 21 days before.
function salesEvents(y) {
  const U = (m, d) => new Date(Date.UTC(y, m, d));
  const nthDow = (m, wd, n) => { const d = U(m, 1); return U(m, 1 + ((wd - d.getUTCDay() + 7) % 7) + 7 * (n - 1)); };
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = U(Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  const tg = nthDow(10, 4, 4);
  return [["Valentine's Day", U(1, 14)], ["Mothering Sunday", new Date(easter.getTime() - 21 * 864e5)], ["Father's Day", nthDow(5, 0, 3)],
    ["Black Friday", new Date(tg.getTime() + 864e5)], ["Christmas (last safe order)", U(11, 10)]].map(([n, d]) => ({ name: n, date: d.toISOString().slice(0, 10) }));
}
function salesReminder(today) {
  const y = Number(today.slice(0, 4));
  const t = Date.parse(today + "T00:00:00Z");
  return [...salesEvents(y), ...salesEvents(y + 1)].map((e) => ({ ...e, days: Math.round((Date.parse(e.date + "T00:00:00Z") - t) / 864e5) })).filter((e) => e.days >= 0 && e.days <= 21).sort((a, b) => a.days - b.days)[0] || null;
}

// Weekly health check (Sundays on the dashboard, any time at /health).
async function healthIssues(env) {
  const [g, tags, amend, credits, watch, alerts, daily] = await Promise.all([env.PENDING.get("gags", "json"), env.PENDING.get("tags", "json"), env.PENDING.get("amend", "json"),
    env.PENDING.get("credits", "json"), env.PENDING.get("amend-watch", "json"), loadAlerts(env), env.PENDING.get("daily", "json")]);
  const out = [], today = new Date().toISOString().slice(0, 10), in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const TY = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"];
  const COLL = { IH: "INTROVERT HERE…", SH: "SHHH.", PC: "PER CONTRACT", OS: "OFF THE SHELF" };
  const pages = (amend && amend.pages) || [], items = (tags && tags.items) || [];
  const due = [];
  ((g && g.sched) || []).forEach((e) => (e.d || []).forEach((d, i) => { if (d && d >= today && d <= in14 && !(e.b && e.b[i])) due.push({ id: e.id, type: TY[i], date: d }); }));
  const noPages = new Set();
  due.forEach((r) => { const n = pages.filter((p) => p.coll === COLL[r.id.slice(0, 2)] && p.type === r.type).length; if (n < 10) noPages.add(r.id.slice(0, 2) + " " + garmentName(r.type) + " (" + n + " pages)"); });
  if (noPages.size) out.push({ level: "bad", t: "Mockup pages look short", s: "Releasing in the next 2 weeks with fewer than 10 photo pages listed: " + [...noPages].join(", ") + ". Check Settings → Mockup pages.", href: "/settings" });
  const ids = [...new Set(due.map((r) => r.id))];
  const tagBad = items.filter((t) => ids.includes(t.id) && !t.approved && (t.stemProblem || String(t.band || "").toUpperCase() === "RED"));
  if (tagBad.length) out.push({ level: "bad", t: "Tags won't auto-approve", s: tagBad.map((t) => t.id + (t.stemProblem ? " (stem: " + t.stemProblem + ")" : " (overlap red)")).join(", ") + ". Fix on the Tags page or they'll be held.", href: "/tags" });
  if (credits && credits.limit && credits.used) {
    const days = Object.keys(credits.daily || {}).sort().slice(-8, -1), avg = days.reduce((a, k) => a + credits.daily[k], 0) / Math.max(1, days.length);
    const start = Date.parse((credits.periodStart || today) + "T00:00:00Z"), reset = new Date(start); reset.setUTCMonth(reset.getUTCMonth() + 1);
    const daysLeft = Math.max(0, (reset - Date.now()) / 864e5), runOut = avg > 0 ? (credits.limit - credits.used) / avg : 99;
    if (runOut < daysLeft) out.push({ level: "bad", t: "Make credits may run out", s: "At about " + Math.round(avg).toLocaleString("en-GB") + " a day they'd last " + Math.floor(runOut) + " days, but the reset is in " + Math.ceil(daysLeft) + ".", href: "/credits" });
  }
  if (watch && watch.warned) out.push({ level: "bad", t: "A listing update is stuck", s: "Open Update listings and tap Restart.", href: "/amend" });
  if (alerts.length) out.push({ level: "warn", t: alerts.length + " alert" + (alerts.length === 1 ? "" : "s") + " not dismissed", s: esc(alerts[0].title).slice(0, 80), href: "/alerts" });
  ((daily && daily.runway) || []).forEach((r) => { const left = r.lastDate ? (Date.parse(r.lastDate) - Date.now()) / 864e5 : 0; if (left < 28) out.push({ level: "warn", t: "Running low: " + r.collection, s: "Written gags run out " + (r.lastDate ? "on " + r.lastDate : "now") + ".", href: "/gags" }); });
  const unbuiltPast = ((g && g.sched) || []).flatMap((e) => (e.d || []).map((d, i) => (d && d < today && d >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) && !(e.b && e.b[i]) ? e.id + " " + garmentName(TY[i]) + " (" + d + ")" : null))).filter(Boolean);
  if (unbuiltPast.length) out.push({ level: "bad", t: "Releases from the last week not built", s: unbuiltPast.slice(0, 6).join(", ") + (unbuiltPast.length > 6 ? "…" : "") + ". Tap Sync to Core to refresh first; if they stay, ask Claude.", href: "/calendar" });
  return { issues: out, due: due.length };
}
async function healthPage(env) {
  const h = await healthIssues(env);
  const row = (i) => `<a class="hrow ${i.level}" href="${i.href}"><b>${esc(i.t)}</b><span class="small">${i.s}</span></a>`;
  return shell(`${brandHeader("Weekly check")}
<style>.hrow{display:block;padding:14px 16px;border:1px solid var(--line);border-left:6px solid #e6b450;border-radius:12px;margin-bottom:10px;color:var(--text);text-decoration:none;background:var(--card)}.hrow.bad{border-left-color:#e0605a}.hrow b{display:block;font:700 16px var(--display);margin-bottom:4px}</style>
<p class="small">Checks the next two weeks of releases (${h.due} garment${h.due === 1 ? "" : "s"} due), tags, mockup pages, Make credits, stuck updates, alerts and gag stock.</p>
${h.issues.length ? h.issues.map(row).join("") : `<div class="allclear">${icon("check")}<span><b>All clear</b>Everything for the next two weeks looks ready.</span></div>`}`);
}

// Today view: the essentials on one phone screen.
async function todayPage(env) {
  const [g, daily, stats, hist, items, orders, alerts, tags] = await Promise.all([env.PENDING.get("gags", "json"), env.PENDING.get("daily", "json"), env.PENDING.get("stats", "json"),
    env.PENDING.get("stats-hist", "json"), loadItems(env), env.PENDING.get("shop:orders", "json"), loadAlerts(env), env.PENDING.get("tags", "json")]);
  const today = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const TY = ["T-SHIRT", "LONG-SLEEVE", "SWEATSHIRT", "HOODIE"], rel = (day) => ((g && g.sched) || []).flatMap((e) => (e.d || []).map((d, i) => (d === day ? { id: e.id, s: e.s, t: TY[i], b: e.b && e.b[i] } : null))).filter(Boolean);
  const pending = Object.values(items || {}).filter((i) => i.status === "pending"), toSend = (orders || []).filter((o) => o.status === "on-hold" || o.status === "failed");
  const days = Object.keys(hist || {}).sort(), sum = (d) => Object.values((hist || {})[d] || {}).reduce((a, v) => a + (v[0] || 0), 0);
  const viewsDelta = days.length >= 2 ? sum(days[days.length - 1]) - sum(days[days.length - 2]) : null;
  const li = (r) => `<a class="trow" href="/gag/${encodeURIComponent(r.id)}"><span>${esc(r.id)} · ${esc(garmentName(r.t))}</span><span class="small">${esc(r.s || "")}${r.b ? " · ✓ built" : ""}</span></a>`;
  const card = (n, t, href) => n ? `<a class="tneed" href="${href}"><b>${n}</b>${t}</a>` : "";
  const needs = card(pending.length, "videos to approve", "/approvals") + card(toSend.length, "orders to send", "/orders") + card(alerts.length, "alerts", "/alerts");
  return shell(`${brandHeader("Today")}
<style>.tcol{display:grid;gap:16px;max-width:680px}.trow{display:flex;flex-direction:column;padding:12px 14px;border:1px solid var(--line);border-radius:12px;color:var(--text);text-decoration:none;margin-top:8px;background:var(--card)}
.tneed{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:rgba(150,40,34,.32);border:1px solid #e0605a;color:var(--text);text-decoration:none;margin-top:8px}.tneed b{font:900 26px var(--display)}
.tbig2{font:900 34px var(--display)}</style>
<div class="tcol">
  <div class="card"><h2 style="margin-top:0">Needs you</h2>${needs || '<p class="small">Nothing. Enjoy the quiet.</p>'}</div>
  <div class="card"><h2 style="margin-top:0">Releasing today</h2>${rel(today).map(li).join("") || '<p class="small">Nothing today.</p>'}<h2>Tomorrow</h2>${rel(tomorrow).map(li).join("") || '<p class="small">Nothing tomorrow.</p>'}</div>
  <div class="card"><h2 style="margin-top:0">Listing views, last day</h2><div class="tbig2">${viewsDelta === null ? "—" : (viewsDelta >= 0 ? "+" : "") + viewsDelta}</div><p class="small">${stats ? stats.listings.filter((l) => l.listingId).length + " live listings" : ""}</p></div>
  <a class="btn" href="/">Full dashboard</a>
</div>`);
}

// Ideas inbox for half-finished gags.
const IDEAS_KEY = "gag-ideas";
async function ideasApi(request, env) {
  const L = (await env.PENDING.get(IDEAS_KEY, "json")) || [];
  if (request.method === "GET") return json(L);
  const d = await request.json().catch(() => ({}));
  if (d.action === "add") { const text = String(d.text || "").replace(/\r\n?/g, "\n").trim().slice(0, 600); if (!text || text === "...") return json({ error: "Type the idea first." }, 400);
    L.unshift({ id: Date.now().toString(36), text, note: str(d.note).slice(0, 200), range: str(d.range), at: Date.now() }); }
  else if (d.action === "remove") { const i = L.findIndex((x) => x.id === str(d.id)); if (i >= 0) L.splice(i, 1); }
  else return json({ error: "Unknown request" }, 400);
  await env.PENDING.put(IDEAS_KEY, JSON.stringify(L.slice(0, 300)));
  return json({ ok: true, ideas: L });
}

// Price tests: note when a price changes and compare views/sales before and after.
const PRICE_TESTS_KEY = "price-tests";
async function priceTestApi(request, env) {
  const d = await request.json().catch(() => ({}));
  const L = (await env.PENDING.get(PRICE_TESTS_KEY, "json")) || [];
  if (d.action === "start") {
    const st = await env.PENDING.get("stats", "json");
    const ls = ((st && st.listings) || []).filter((l) => l.coll === str(d.coll) && l.type === str(d.type));
    if (!ls.length) return json({ error: "No live listings for that range and garment yet." }, 400);
    L.unshift({ id: Date.now().toString(36), coll: str(d.coll), type: str(d.type), start: new Date().toISOString().slice(0, 10), oldPrice: ls[0].price, note: str(d.note).slice(0, 200) });
  } else if (d.action === "end") { const t = L.find((x) => x.id === str(d.id)); if (t) t.end = new Date().toISOString().slice(0, 10); }
  else return json({ error: "Unknown request" }, 400);
  await env.PENDING.put(PRICE_TESTS_KEY, JSON.stringify(L.slice(0, 30)));
  return json({ ok: true });
}

// Everything the search sheet can find besides gags.
async function searchData(env) {
  const [todos, orders, stats] = await Promise.all([todoLoad(env), env.PENDING.get("shop:orders", "json"), env.PENDING.get("stats", "json")]);
  const pages = [["Dashboard", "/"], ["Today", "/today"], ["Approvals", "/approvals"], ["Gags", "/gags"], ["Listings", "/listings"], ["Calendar", "/calendar"], ["Stats", "/stats"],
    ["Tags", "/tags"], ["Orders", "/orders"], ["Links", "/links"], ["Credits", "/credits"], ["Check for problems", "/check"], ["Weekly check", "/health"], ["Reviews", "/reviews"], ["Quiet listings", "/quiet"], ["To-do", "/todo"], ["Alerts", "/alerts"],
    ["Move a whole range (dates)", "/settings?part=shift"], ["Settings: backups", "/settings"],
    ["Settings: tag system", "/settings"], ["Gag categories and tag phrases", "/settings?part=tags"], ["Seasonal tags", "/settings?part=tags"], ["Mockup pages", "/settings?part=pages"], ["Product text (new listings)", "/settings?part=text"],
    ["Settings: phone notifications", "/settings"], ["Settings: recent changes / undo", "/settings"]].map(([t, h]) => ({ t, h, k: "Page" }));
  const td = todos.filter((t) => !t.done).map((t) => ({ t: t.text, h: "/todo", k: "To-do" }));
  const od = [...(orders || []).map((o) => ({ t: (o.name || o.customer || "Shop order") + " · " + (o.status || ""), h: "/orders", k: "Order" })),
    ...(((stats && stats.orders) || []).map((o) => ({ t: o.title + " · " + o.variant + " · " + o.date, h: "/stats", k: "Etsy sale" })))];
  const listings = ((stats && stats.listings) || []).filter((l) => l.listingId).map((l) => ({ t: l.code + " · " + (l.stem || ""), h: l.url, k: "Etsy listing" }));
  return json({ items: [...pages, ...td, ...od, ...listings] });
}

// ---------- Settings (Barry, 13 Nov): things that used to be changed by hand in Core ----------
// Writes go through the Amend helper's generic "apply" route (cell PATCHes), with the builder left alone.
const SETTINGS_KEY = "core-settings";
const SETTINGS_DEFAULT = { TagEngine: "ON", AutoApprove: "ON", AutoApproveDays: 2, TagCap: 3, OverlapAmber: 4, OverlapRed: 6, PlanMonths: 12, StemMaxWords: 4 };
const TAG_SETTING_ROW = { TagCap: 2, OverlapAmber: 7, OverlapRed: 8, PlanMonths: 12, StemMaxWords: 13, TagEngine: 14, AutoApprove: 15, AutoApproveDays: 16 }; // TAG_SETTINGS column B
const TAG_SETTING_LIM = { TagCap: [1, 10], OverlapAmber: [1, 12], OverlapRed: [2, 13], PlanMonths: [1, 36], StemMaxWords: [1, 6], AutoApproveDays: [1, 14] };
const RULE_TEXT = [["suffix", "Title ending (after the title stem)", 0], ["intro", "Range intro", 1], ["features", "Product features", 1], ["audience", "Who it's for", 1], ["closing", "Closing text (legal / EU wording goes here)", 1]];

// Which gag categories belong to which range (the gag tool's buttons). Kept in the app; Core's
// GAG_CATEGORIES/TAG_POOL hold each category's tags and phrases.
const CATEGORIES_KEY = "categories";
const CATEGORIES_DEFAULT = {
  "INTROVERT HERE…": ["Small Talk", "Avoiding People", "Introvert Life", "Social Exhaustion", "Social Anxiety", "Overthinking", "Plans Cancelled", "Phone Calls", "Homebody"],
  "SHHH.": ["Alternative Communication", "Sensory Issues", "Noise & Loud People", "Personal Space", "Headphones On", "Masking", "Not Talking Today"],
  "PER CONTRACT": ["Quiet Quitting", "Corporate Nonsense", "Off The Clock", "Burnout", "Workplace", "Meetings", "Team Building & Office Socials", "Emails & Messages", "Working From Home", "Management"],
  "OFF THE SHELF": ["Book Lover", "Escapism", "Reading Over People", "Fictional Love Life", "Genre Jokes", "Library & Book Club", "To-Be-Read Pile"] };
async function loadCategories(env) { return (await env.PENDING.get(CATEGORIES_KEY, "json")) || CATEGORIES_DEFAULT; }
const phraseOk = (t) => t.length >= 2 && t.length <= 20 && /^[a-z0-9 '\-]+$/.test(t) && !/^['\-]/.test(t) && !/  /.test(t);
const splitPhrases = (v) => Array.from(new Set(String(v || "").split(/[\n,]+/).map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean)));
const poolRow = (cat, cls, t) => [cat, "GAG", cls, t, "Y", null, null, null, null];

// Settings history with one-tap undo (Barry, 14 Nov). Each entry stores the request that puts things back.
const SET_LOG_KEY = "settings-log";
async function logSetting(env, label, undo) { const L = (await env.PENDING.get(SET_LOG_KEY, "json")) || []; L.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), label, undo }); await env.PENDING.put(SET_LOG_KEY, JSON.stringify(L.slice(0, 40))); }
async function settingsSave(request, env) {
  const d0 = await request.json().catch(() => ({}));
  let d = d0;
  if (d0.kind === "undo") {
    const L = (await env.PENDING.get(SET_LOG_KEY, "json")) || []; const e = L.find((x) => x.id === str(d0.id));
    if (!e || !e.undo) return json({ error: "Nothing to undo there." }, 400);
    d = Object.assign({ isUndo: true }, e.undo);
    const r = await settingsSave(new Request("http://x", { method: "POST", body: JSON.stringify(d) }), env);
    if (r.status === 200) { const L2 = ((await env.PENDING.get(SET_LOG_KEY, "json")) || []).filter((x) => x.id !== e.id); await env.PENDING.put(SET_LOG_KEY, JSON.stringify(L2)); }
    return r;
  }
  const ops = [];
  if (d.kind === "cat-add" || d.kind === "phrase-add") return await categorySave(d, env);
  if (["phrase-toggle", "season-toggle", "season-add"].includes(d.kind)) return await poolSave(d, env);
  if (["page-save", "page-add", "page-del"].includes(d.kind)) return await pageSave(d, env);
  if (d.kind === "shift") return await rangeShift(d, env);
  if (d.kind === "restore") return await restoreCore(d, env);
  const cs = Object.assign({}, SETTINGS_DEFAULT, (await env.PENDING.get(SETTINGS_KEY, "json")) || {});
  let S = null, rule = null;
  if (d.kind === "tag") {
    const k = str(d.key);
    if (!(k in TAG_SETTING_ROW)) return json({ error: "Unknown setting" }, 400);
    let v;
    if (k === "TagEngine" || k === "AutoApprove") { v = str(d.value).toUpperCase() === "ON" ? "ON" : "OFF"; }
    else { v = Math.round(Number(d.value)); const lim = TAG_SETTING_LIM[k]; if (!(v >= lim[0] && v <= lim[1])) return json({ error: "Pick a number from " + lim[0] + " to " + lim[1] + "." }, 400);
      if (k === "OverlapRed" && v <= Number(cs.OverlapAmber)) return json({ error: "Red has to be higher than amber (" + cs.OverlapAmber + ")." }, 400);
      if (k === "OverlapAmber" && v >= Number(cs.OverlapRed)) return json({ error: "Amber has to be lower than red (" + cs.OverlapRed + ")." }, 400); }
    ops.push({ url: `${AMEND_XL}/worksheets/TAG_SETTINGS/range(address='B${TAG_SETTING_ROW[k]}')`, values: [[v]] });
    d.__log = [k + ": " + cs[k] + " → " + v, { kind: "tag", key: k, value: cs[k] }];
    cs[k] = v;
  } else if (d.kind === "rule") {
    S = await env.PENDING.get("amend", "json");
    rule = S && (S.rules || []).find((r) => String(r.row) === String(d.row));
    if (!rule) return json({ error: "That range and garment isn't in the app's copy of Core. Tap Sync to Core and try again." }, 400);
    const oldRule = { kind: "rule", row: rule.row, tags: Array.isArray(rule.tags) ? rule.tags.slice() : [] }; RULE_TEXT.forEach(([k]) => { oldRule[k] = String(rule[k] || ""); });
    d.__log = ["Product text: " + rule.coll + " " + garmentName(rule.type), oldRule];
    for (const [k] of RULE_TEXT) {
      if (d[k] === undefined) continue;
      const v = String(d[k]).replace(/\r\n?/g, "\n");
      if (k === "suffix" && v.length > 60) return json({ error: "The title ending is too long (60 characters max)." }, 400);
      if (v !== String(rule[k] || "")) { ops.push(amendCell("PRODUCT_RULES", AMEND_RULE_COLS[k], rule.row, v)); rule[k] = v; }
    }
    if (d.ship !== undefined) {
      const v = str(d.ship); if (rule.ship) oldRule.ship = String(rule.ship);
      if (!/^\d{6,15}$/.test(v)) return json({ error: "That isn't an Etsy shipping profile number." }, 400);
      if (v !== String(rule.ship || "")) { ops.push(amendCell("PRODUCT_RULES", "SHIPPING_PROFILE_ID", rule.row, v)); rule.ship = v; }
    }
    if (Array.isArray(d.tags)) {
      const tags = d.tags.slice(0, 5).map((t) => String(t || "").trim().toLowerCase());
      const bad = tags.find((t) => t.length > 20 || !/^[a-z0-9 '\-]*$/.test(t));
      if (bad !== undefined) return json({ error: "Product tag “" + bad + "” breaks Etsy's rules (20 characters max; letters, numbers, spaces, ' and -)." }, 400);
      const old = Array.isArray(rule.tags) ? rule.tags : [];
      tags.forEach((t, i) => { if (t !== String(old[i] || "")) ops.push(amendCell("PRODUCT_RULES", AMEND_TAG_COLS[i], rule.row, t)); });
      rule.tags = tags;
    }
  } else if (d.kind === "range") {
    S = await env.PENDING.get("amend", "json");
    const rr = ((S && S.rules) || []).filter((r) => r.coll === str(d.coll));
    if (!rr.length) return json({ error: "That range isn't in the app's copy of Core. Tap Sync to Core and try again." }, 400);
    const v = { lead: String(d.lead || "").replace(/\s+/g, " ").trim(), live: str(d.live).toUpperCase() === "Y" ? "Y" : "N", rname: String(d.rname || "").replace(/\s+/g, " ").trim() };
    if (v.lead.length > 90) return json({ error: "Keep the lead line under 90 characters." }, 400);
    if (!v.rname) return json({ error: "Give the range the name buyers should see." }, 400);
    const COLS = { lead: "CROSS_SELL_LEAD", live: "RANGE_LIVE", rname: "RANGE_NAME" };
    const old = { kind: "range", coll: rr[0].coll, lead: rr[0].lead || "", live: rr[0].live || "N", rname: rr[0].rname || rr[0].coll };
    rr.forEach((r) => Object.keys(COLS).forEach((k) => { if (String(r[k] || "") !== v[k]) { ops.push(amendCell("PRODUCT_RULES", COLS[k], r.row, v[k])); r[k] = v[k]; } }));
    d.__log = ["Cross-selling: " + old.rname, old];
  } else return json({ error: "Unknown request" }, 400);
  if (!ops.length) return json({ ok: true, unchanged: true });
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  if (d.kind === "tag") await env.PENDING.put(SETTINGS_KEY, JSON.stringify(cs));
  else await env.PENDING.put("amend", JSON.stringify(S));
  if (d.__log && !d.isUndo) await logSetting(env, d.__log[0], d.__log[1]);
  return json({ ok: true, settings: cs });
}

// TAG_POOL and SEASON_POOL rows with their table positions, kept in step by the app (rows are only ever
// appended or switched on/off, never deleted, so positions stay valid).
const POOLS_KEY = "pools";
const mmdd = (v) => { const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(v || "").trim()); if (!m) return 0; const dd = +m[1], mo = +m[2]; return mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31 ? mo * 100 + dd : 0; };
async function poolSave(d, env) {
  const P = (await env.PENDING.get(POOLS_KEY, "json")) || { tag: [], season: [] };
  const ops = [];
  if (d.kind === "phrase-toggle" || d.kind === "season-toggle") {
    const L = d.kind === "phrase-toggle" ? P.tag : P.season, row = L.find((x) => x.i === Number(d.i));
    if (!row) return json({ error: "That phrase isn't in the app's list. Reload and try again." }, 400);
    row.on = !!d.on;
    ops.push(amendCell(d.kind === "phrase-toggle" ? "TAG_POOL" : "SEASON_POOL", "ACTIVE", row.i, row.on ? "Y" : "N"));
    if (!d.isUndo) d.__log = [(d.kind === "phrase-toggle" ? "Phrase" : "Seasonal phrase") + " \u201c" + row.t + "\u201d switched " + (row.on ? "on" : "off"), { kind: d.kind, i: row.i, on: !row.on }];
  } else {
    const t = String(d.t || "").trim().toLowerCase().replace(/\s+/g, " "), season = String(d.s || "").trim().toUpperCase().replace(/[^A-Z_ ]/g, "").replace(/ +/g, "_");
    const a = mmdd(d.a), e = mmdd(d.e);
    if (!phraseOk(t)) return json({ error: "“" + t + "” breaks Etsy's tag rules (20 characters max; letters, numbers, spaces, ' and -)." }, 400);
    if (!season) return json({ error: "Pick or name a season." }, 400);
    if (!a || !e) return json({ error: "Give start and end as day/month, e.g. 01/10 and 24/12." }, 400);
    if (P.season.some((x) => x.t === t)) return json({ error: "“" + t + "” is already a seasonal phrase." }, 400);
    ops.push({ url: `${AMEND_XL}/tables/SEASON_POOL/rows/add`, method: "POST", values: [[t, season, a, e, "Y", null, null, null]] });
    P.season.push({ i: P.season.length, t, s: season, a, e, on: true });
  }
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  await env.PENDING.put(POOLS_KEY, JSON.stringify(P));
  if (d.__log) await logSetting(env, d.__log[0], d.__log[1]);
  return json({ ok: true });
}
// MOCKUP_PAGES: the app's copy (amend.pages) is in table order, so list position = table row.
async function pageSave(d, env) {
  const S = await env.PENDING.get("amend", "json");
  const pages = (S && S.pages) || [];
  const ops = [], idx = Number(d.idx);
  const cleanName = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "_");
  const pos = Math.round(Number(d.pos));
  if (d.kind !== "page-del" && !(pos >= 1 && pos <= 40)) return json({ error: "Position has to be a number from 1 to 40." }, 400);
  if (d.kind === "page-save") {
    const pg = pages[idx]; if (!pg) return json({ error: "That page isn't in the app's list. Tap Sync to Core and try again." }, 400);
    const name = cleanName(d.name); if (!/^[A-Z0-9_]{3,60}$/.test(name)) return json({ error: "Page names use capitals, numbers and underscores, like OS_05_TS_GIFT_FOREST_GREEN." }, 400);
    if (pos !== Number(pg.pos)) ops.push({ url: `${AMEND_XL}/tables/MOCKUP_PAGES/columns/POSITION/dataBodyRange/cell(row=${idx},column=0)`, values: [[pos]] });
    if (name !== pg.name) ops.push(amendCell("MOCKUP_PAGES", "PAGE_NAME", idx, name));
    if (!ops.length) return json({ ok: true, unchanged: true });
    if (!d.isUndo) d.__log = ["Mockup page " + pg.name + (name !== pg.name ? " renamed " + name : "") + (pos !== Number(pg.pos) ? " moved to " + pos : ""), { kind: "page-save", idx, pos: Number(pg.pos), name: pg.name }];
    pg.pos = pos; pg.name = name;
  } else if (d.kind === "page-add") {
    const name = cleanName(d.name); if (!/^[A-Z0-9_]{3,60}$/.test(name)) return json({ error: "Page names use capitals, numbers and underscores, like OS_05_TS_GIFT_FOREST_GREEN." }, 400);
    if (!S || !(S.rules || []).some((r) => r.coll === d.coll && r.type === d.type)) return json({ error: "Pick a range and garment." }, 400);
    if (pages.some((p) => p.coll === d.coll && p.type === d.type && Number(p.pos) === pos)) return json({ error: "Position " + pos + " is already used for this garment. Change that page first, or pick another number." }, 400);
    ops.push({ url: `${AMEND_XL}/tables/MOCKUP_PAGES/rows/add`, method: "POST", values: [[d.coll, d.type, pos, name]] });
    pages.push({ coll: d.coll, type: d.type, pos, name });
  } else {
    const pg = pages[idx]; if (!pg || pg.name !== String(d.name || "")) return json({ error: "That page has moved since this screen loaded. Reload and try again." }, 400);
    ops.push({ url: `${AMEND_XL}/worksheets/MOCKUP_PAGES/range(address='A${idx + 2}:D${idx + 2}')/delete`, method: "POST", body: { shift: "Up" } });
    pages.splice(idx, 1);
  }
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  S.pages = pages; await env.PENDING.put("amend", JSON.stringify(S));
  if (d.__log) await logSetting(env, d.__log[0], d.__log[1]);
  return json({ ok: true });
}

async function categorySave(d, env) {
  const cats = await loadCategories(env);
  const tagsKV = (await env.PENDING.get("tags", "json")) || {};
  const pool = tagsKV.pool || {};
  const all = Object.values(cats).flat();
  const ops = [];
  let name = "", anchors = [], flavours = [];
  if (d.kind === "cat-add") {
    name = String(d.name || "").trim().replace(/\s+/g, " ");
    if (!(d.range in cats)) return json({ error: "Pick a range." }, 400);
    if (!/^[A-Za-z0-9][A-Za-z0-9 &'\-]{1,39}$/.test(name)) return json({ error: "Give the category a name of 2 to 40 letters, numbers or spaces (& ' - allowed)." }, 400);
    if (all.some((c) => c.toLowerCase() === name.toLowerCase())) return json({ error: "There's already a category called " + name + "." }, 400);
    anchors = splitPhrases(d.anchors); flavours = splitPhrases(d.flavours).filter((t) => !anchors.includes(t));
    if (anchors.length < 1 || anchors.length > 4) return json({ error: "Add 1 to 4 main phrases (one per line)." }, 400);
    if (flavours.length < 8) return json({ error: "Add at least 8 flavour phrases (one per line) - 12 or more is better." }, 400);
  } else {
    name = String(d.name || "");
    if (!all.includes(name)) return json({ error: "Pick a category." }, 400);
    const have = new Set((pool[name] || []).map((p) => p.t));
    flavours = splitPhrases(d.flavours).filter((t) => !have.has(t));
    if (!flavours.length) return json({ error: "No new phrases to add (they may already be there)." }, 400);
  }
  const bad = [...anchors, ...flavours].filter((t) => !phraseOk(t));
  if (bad.length) return json({ error: "These break Etsy's tag rules (20 characters max; letters, numbers, spaces, ' and -): " + bad.map((b) => "\u201c" + b + "\u201d").join(", ") }, 400);
  const T = (t) => `${AMEND_XL}/tables/${t}/rows/add`;
  if (d.kind === "cat-add") {
    const ctags = [name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 '\-]/g, "").slice(0, 20).trim(), ...anchors, ...flavours].filter(phraseOk).slice(0, 5);
    while (ctags.length < 5) ctags.push("");
    ops.push({ url: T("GAG_CATEGORIES"), method: "POST", values: [[name, ...ctags]] });
    ops.push({ url: T("POOL_CAPACITY"), method: "POST", values: [[name, null, null, null, null, null]] });
  }
  ops.push({ url: T("TAG_POOL"), method: "POST", values: [...anchors.map((t) => poolRow(name, "Anchor", t)), ...flavours.map((t) => poolRow(name, "Flavour", t))] });
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" });
  if (err) return err;
  if (d.kind === "cat-add") {
    cats[d.range] = [...cats[d.range], name]; await env.PENDING.put(CATEGORIES_KEY, JSON.stringify(cats));
    const g = await env.PENDING.get("gags", "json"); if (g) { g.categories = Array.from(new Set([...(g.categories || []), name])); await env.PENDING.put("gags", JSON.stringify(g)); }
  }
  const P = (await env.PENDING.get(POOLS_KEY, "json")) || { tag: [], season: [] };
  [...anchors.map((t) => ["A", t]), ...flavours.map((t) => ["F", t])].forEach(([c, t]) => P.tag.push({ i: P.tag.length, p: name, g: "GAG", c, t, on: true }));
  await env.PENDING.put(POOLS_KEY, JSON.stringify(P));
  pool[name] = [...(pool[name] || []), ...anchors.map((t) => ({ t, c: "A", cap: false })), ...flavours.map((t) => ({ t, c: "F", cap: false }))];
  tagsKV.pool = pool; await env.PENDING.put("tags", JSON.stringify(tagsKV));
  return json({ ok: true, added: anchors.length + flavours.length });
}

// Cross-selling line (Barry, 15 Nov): one per range, just before the closing text of every new listing.
function crossSellLine(ranges, own) {
  const r0 = ranges.find((r) => r.coll === own); if (!r0 || !String(r0.lead || "").trim()) return "";
  const names = ranges.filter((r) => r.coll !== own && String(r.live || "").trim().toUpperCase() === "Y").map((r) => String(r.rname || r.coll).trim());
  if (!names.length) return "";
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return String(r0.lead).trim() + " Tap the shop name above for " + list + (/[.!?]$/.test(list) ? "" : ".");
}
function crossRanges(S) { const seen = {}, out = []; ((S && S.rules) || []).forEach((r) => { if (!seen[r.coll]) { seen[r.coll] = 1; out.push({ coll: r.coll, lead: r.lead || "", live: r.live || "", rname: r.rname || "" }); } }); return out; }
function crossSellCard(S) {
  const R = crossRanges(S);
  if (!R.length || R.every((r) => r.lead === undefined)) return "";
  return `<div class="card ptext part-text" id="xsell"><h2 style="margin-top:0">Cross-selling line</h2>
    <p class="small" style="margin:0">Every new listing's description ends with a line pointing buyers to your other ranges, just before the closing text. Etsy links don't work in descriptions, so it tells them to tap the shop name. A range only appears in the others' lines while <b>Live</b> is Yes. Changes apply to new listings; live listings change through Listings → Descriptions.</p>
    ${R.map((r, i) => `<div class="xs" data-coll="${esc(r.coll)}" style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px">
      <div class="g3"><label>Shown as<input data-f="rname" value="${esc(r.rname)}"></label><label style="grid-column:span 2">Lead line<input data-f="lead" value="${esc(r.lead)}" maxlength="90"></label></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><label style="display:flex;gap:8px;align-items:center;margin:0">Live<select data-f="live" style="width:auto;margin:0"><option value="Y"${String(r.live).toUpperCase() === "Y" ? " selected" : ""}>Yes</option><option value="N"${String(r.live).toUpperCase() === "Y" ? "" : " selected"}>No</option></select></label><button class="btn" type="button" data-xsave style="width:auto;padding:0 18px">Save</button></div>
      <p class="small xsprev" style="margin:8px 0 0"></p></div>`).join("")}
  </div>
  <script>(function () { var box = document.getElementById("xsell"); if (!box) return;
    function rows() { return Array.prototype.map.call(box.querySelectorAll(".xs"), function (d) { var o = { coll: d.dataset.coll }; d.querySelectorAll("[data-f]").forEach(function (x) { o[x.dataset.f] = x.value; }); return o; }); }
    function line(R, own) { var r0 = R.filter(function (r) { return r.coll === own; })[0]; if (!r0 || !r0.lead.trim()) return "(no line: the lead is empty)";
      var n = R.filter(function (r) { return r.coll !== own && r.live === "Y"; }).map(function (r) { return (r.rname || r.coll).trim(); }); if (!n.length) return "(no line: no other range is live)";
      return r0.lead.trim() + " Have a look at our other ranges: " + n.join(" · ") + " (each with a link to its shop section)"; }
    function draw() { var R = rows(); box.querySelectorAll(".xs").forEach(function (d) { d.querySelector(".xsprev").textContent = "Reads: " + line(R, d.dataset.coll); }); }
    box.addEventListener("input", draw); box.addEventListener("change", draw); draw();
    box.addEventListener("click", function (e) { var b = e.target.closest("[data-xsave]"); if (!b) return; var d = b.closest(".xs"), o = { kind: "range", coll: d.dataset.coll }; d.querySelectorAll("[data-f]").forEach(function (x) { o[x.dataset.f] = x.value; });
      b.disabled = true; b.textContent = "Saving…";
      fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't save"); }); })
        .then(function () { b.textContent = "Saved ✓"; if (window.toast) toast("Saved to Core"); setTimeout(function () { b.disabled = false; b.textContent = "Save"; }, 1500); })
        .catch(function (er) { alert(er.message); b.disabled = false; b.textContent = "Save"; }); });
  })();</script>`;
}

async function settingsPage(env, part) {
  const cs = Object.assign({}, SETTINGS_DEFAULT, (await env.PENDING.get(SETTINGS_KEY, "json")) || {});
  const S = await env.PENDING.get("amend", "json");
  const setLog = (await env.PENDING.get(SET_LOG_KEY, "json")) || [];
  const cats = await loadCategories(env);
  const pool = ((await env.PENDING.get("tags", "json")) || {}).pool || {};
  const P = (await env.PENDING.get(POOLS_KEY, "json")) || { tag: [], season: [] };
  const byPool = {}; P.tag.forEach((x) => { (byPool[x.p] = byPool[x.p] || []).push(x); });
  const chip = (x, kind) => `<button type="button" class="ph${x.on ? "" : " off"}" data-kind="${kind}" data-i="${x.i}" title="Tap to switch ${x.on ? "off" : "on"}">${esc(x.t)}${x.c === "A" ? " ★" : ""}</button>`;
  const md = (n) => { n = Number(n) || 0; const m = Math.floor(n / 100), d0 = n % 100; return m ? new Date(2001, m - 1, d0).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "?"; };
  const seasons = {}; P.season.forEach((x) => { (seasons[x.s] = seasons[x.s] || []).push(x); });
  const seasonHtml = Object.entries(seasons).map(([sn, l]) => { const on = l.filter((x) => x.on);
    const a = Math.min(...(on.length ? on : l).map((x) => x.a)), e = (on.length ? on : l).map((x) => x.e);
    return `<div class="catrng"><b>${esc(sn.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</b> <span class="small">${l.map((x) => md(x.a) + "–" + md(x.e)).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")}</span><div class="catchips">${l.map((x) => chip(x, "season-toggle")).join("")}</div></div>`; }).join("");
  const pages = ((S && S.pages) || []).map((p, i) => Object.assign({ i }, p));
  const RN0 = { "INTROVERT HERE…": "Introvert Here", "SHHH.": "SHHH.", "PER CONTRACT": "Per Contract", "OFF THE SHELF": "Off The Shelf" };
  const catHtml = Object.entries(cats).map(([rng, list]) => `<div class="catrng"><b>${esc(RN0[rng] || rng)}</b><div class="catchips">${list.map((c) => {
    const p = pool[c] || []; const fl = p.filter((x) => x.c === "F").length;
    const rows = byPool[c] || []; const n = rows.length ? rows.filter((x) => x.c === "F" && x.on).length : fl;
    return `<details class="catc"><summary>${esc(c)} <span class="small">${n ? n + " phrases" : ""}</span></summary><div class="catchips">${rows.length ? rows.map((x) => chip(x, "phrase-toggle")).join("") : '<span class="small">' + (p.length ? p.map((x) => esc(x.t)).join(" · ") : "Phrases load after the next Sync to Core.") + "</span>"}</div></details>`; }).join("")}</div></div>`).join("");
  const allCats = Object.values(cats).flat();
  const RN = { "INTROVERT HERE…": "Introvert Here", "SHHH.": "SHHH.", "PER CONTRACT": "Per Contract", "OFF THE SHELF": "Off The Shelf" };
  const rules = ((S && S.rules) || []).map((r) => ({ row: r.row, name: (RN[r.coll] || r.coll) + " · " + garmentName(r.type), suffix: r.suffix || "", intro: r.intro || "", features: r.features || "", audience: r.audience || "", closing: r.closing || "", tags: Array.isArray(r.tags) ? r.tags : [] }));
  const onoff = (k, title, help) => `<div class="setrow"><div><b>${title}</b><p class="small">${help}</p></div>
    <div class="seg" data-k="${k}"><button type="button" data-v="ON" class="${cs[k] === "ON" ? "on" : ""}">On</button><button type="button" data-v="OFF" class="${cs[k] !== "ON" ? "on" : ""}">Off</button></div></div>`;
  const num = (k, title, help, min, max) => `<div class="setrow"><div><b>${title}</b><p class="small">${help}</p></div>
    <div class="numset"><input type="number" inputmode="numeric" min="${min}" max="${max}" value="${esc(String(cs[k]))}" data-k="${k}"><button class="btn" type="button" data-save="${k}">Save</button></div></div>`;
  return shell(`
${brandHeader(({ system: "Settings", pages: "Mockup pages", tags: "Tags setup", text: "Product text", shift: "Move a range" })[part] || "Settings")}
<style>.setw > .card{display:none}.setw > .card.part-${/^[a-z]+$/.test(part) ? part : "system"}{display:block}</style>
${part !== "system" ? `<p class="small" style="margin:0 0 12px">${part === "shift" ? '<a href="/calendar">‹ Calendar</a>' : '<a href="/listings">‹ Listings</a>'} · <a href="/settings">All settings</a></p>` : `<p class="small" style="margin:0 0 12px">Titles, descriptions, tags, mockup pages and phrases are in <a href="/listings">Listings</a>; moving a range's dates is in the <a href="/calendar">Calendar</a>.</p>`}
<style>
.setw{display:grid;gap:18px;max-width:980px}
.setrow{display:flex;gap:18px;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid var(--line)}
.setrow:first-of-type{border-top:0}.setrow b{font:700 16px var(--display)}.setrow p{margin:4px 0 0;max-width:560px}
.seg{display:flex;border:1.5px solid var(--line);border-radius:99px;overflow:hidden;flex:none}
.seg button{min-width:76px;min-height:46px;border:0;background:none;color:var(--muted);font:800 13px var(--display);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.seg button.on{background:var(--go);color:var(--go-text)}
.numset{display:flex;gap:8px;flex:none}.numset input{width:84px;min-height:46px;padding:0 12px;font:16px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}
.ptext label{display:block;margin:14px 0 0;font-weight:700}.ptext textarea,.ptext input,.ptext select{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;font:15px var(--body);border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--text)}
.ptext textarea{min-height:110px;resize:vertical;white-space:pre-wrap}.ptags{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.ph{border:1px solid var(--line);border-radius:99px;padding:6px 12px;background:rgba(255,255,255,.04);color:var(--text);font:500 13px var(--body);cursor:pointer}
.ph.off{opacity:.45;text-decoration:line-through}
.more{margin-top:8px}.more summary{cursor:pointer;font:800 12px var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:10px 0}
.g3{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.g3 label{margin-top:10px}
.mprow{display:grid;grid-template-columns:76px minmax(0,1fr) auto auto;gap:8px;align-items:center;margin-top:8px}.mprow input{margin:0!important}.mprow .btn{width:auto;min-height:44px;padding:0 14px}
@media (max-width:700px){.g3{grid-template-columns:1fr 1fr}.mprow{grid-template-columns:60px minmax(0,1fr)}.mprow .btn{grid-column:span 1}}
.catrng{margin-top:16px}.catrng>b{font:800 12px var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.catchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.catc{border:1px solid var(--line);border-radius:12px;padding:8px 12px;background:rgba(255,255,255,.03)}
.catc summary{cursor:pointer;font-weight:600}.catc[open]{flex-basis:100%}.catc .small{margin-top:6px;line-height:1.6}
@media (max-width:700px){.setrow{flex-direction:column;align-items:flex-start}.ptags{grid-template-columns:1fr 1fr}}
</style>
<nav class="setnav">${[["system", "System"], ["tags", "Tags setup"], ["text", "Product text & cross-selling"], ["pages", "Mockup pages"], ["shift", "Move a range"]].map(([k, t]) => `<a href="/settings${k === "system" ? "" : "?part=" + k}" class="${(/^[a-z]+$/.test(part) ? part : "system") === k ? "on" : ""}">${t}</a>`).join("")}</nav>
<style>.setnav{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}.setnav a{font:600 14px var(--body);padding:9px 14px;border-radius:99px;border:1px solid var(--line);background:var(--field);color:var(--muted);text-decoration:none}.setnav a.on{background:var(--accent);border-color:var(--accent);color:#141413}</style>
<div class="setw">
  ${setLog.length ? `<div class="card part-system"><h2 style="margin-top:0">Recent changes</h2>${setLog.slice(0, 8).map((e) => `<div class="setrow"><div><b style="font:600 14px var(--body)">${esc(e.label)}</b><p class="small">${esc(when(e.at))}</p></div>${e.undo ? `<button class="btn" type="button" data-undo="${esc(e.id)}" style="width:auto">Undo</button>` : ""}</div>`).join("")}</div>` : ""}
  <div class="card part-system part-tags"><h2 style="margin-top:0">Tag system</h2>
    ${onoff("TagEngine", "Use approved tags", "On: each listing gets the tags approved and frozen for its gag (see the Tags page); a gag with a tag problem waits instead of being built. Off: the older automatic tags, no approval.")}
    ${onoff("AutoApprove", "Approve tags automatically", "On: if you haven't approved a gag's tags yourself, they're approved and frozen shortly before its first release (not if the overlap with other gags is red). Off: every gag waits for you on the Tags page.")}
    ${num("AutoApproveDays", "Days before release to auto-approve", "How long before a gag's first release its tags are approved automatically. Gives you that long to change them. 1 to 14.", 1, 14)}
    ${num("TagCap", "Gags per flavour phrase", "How many different gags may share one flavour tag phrase before it's rested. Lower = more variety, but bigger phrase lists needed. 1 to 10.", 1, 10)}
    <details class="more"><summary>More tag settings</summary>
      ${num("OverlapAmber", "Overlap warning: amber", "How many comparable tags two gags can share before the Tags page shows amber. 1 to 12.", 1, 12)}
      ${num("OverlapRed", "Overlap warning: red", "How many shared tags count as red. A red gag is never approved automatically. Must be above amber.", 2, 13)}
      ${num("StemMaxWords", "Most words in a title-stem tag", "Title stems longer than this are held until shortened. 1 to 6.", 1, 6)}
      ${num("PlanMonths", "Months ahead for phrase capacity", "How far ahead the phrase-list check looks when warning that a category is running low. 1 to 36.", 1, 36)}
    </details>
  </div>
  <div class="card ptext part-tags"><h2 style="margin-top:0">Gag categories</h2>
    <p class="small" style="margin:0">Each category has its own tag phrases: ★ main phrases (one goes on every gag in it) and flavour phrases (four per gag, rotated so gags don't share identical tags). Tap a category to see its phrases.</p>
    ${catHtml}
    <h3 class="sideh" style="margin-top:22px">Add a category</h3>
    <label>Range<select id="caR">${Object.keys(cats).map((r) => `<option value="${esc(r)}">${esc(RN0[r] || r)}</option>`).join("")}</select></label>
    <label>Name<input id="caN" maxlength="40" placeholder="e.g. Hobbies"></label>
    <label>Main phrases (1 to 4, one per line)<textarea id="caA" style="min-height:80px" placeholder="hobby humour"></textarea></label>
    <label>Flavour phrases (at least 8, ideally 12 or more, one per line)<textarea id="caF" placeholder="crafting addict"></textarea></label>
    <p class="small">Tag rules: up to 20 characters; letters, numbers, spaces, ' and - only. Lower case is fine.</p>
    <button class="btn-main" type="button" id="caGo" style="width:auto;padding:0 26px">Add category</button>
    <h3 class="sideh" style="margin-top:26px">Add phrases to a category</h3>
    <label>Category<select id="paC">${allCats.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
    <label>New flavour phrases (one per line)<textarea id="paF"></textarea></label>
    <button class="btn-main" type="button" id="paGo" style="width:auto;padding:0 26px">Add phrases</button>
  </div>
  <div class="card ptext part-tags"><h2 style="margin-top:0">Seasonal tags</h2>
    <p class="small" style="margin:0">Live listings swap these in automatically each morning while they're in season (see the Calendar). Tap a phrase to switch it off or back on.</p>
    ${seasonHtml || '<p class="small">No seasonal phrases loaded.</p>'}
    <h3 class="sideh" style="margin-top:22px">Add a seasonal phrase</h3>
    <div class="g3"><label>Phrase<input id="spT" maxlength="20" placeholder="e.g. advent gift"></label>
      <label>Season<input id="spS" list="spList" placeholder="CHRISTMAS"><datalist id="spList">${Object.keys(seasons).map((sn) => `<option value="${esc(sn)}">`).join("")}</datalist></label>
      <label>Starts (day/month)<input id="spA" placeholder="01/10"></label><label>Ends (day/month)<input id="spE" placeholder="24/12"></label></div>
    <button class="btn-main" type="button" id="spGo" style="width:auto;padding:0 26px;margin-top:12px">Add seasonal phrase</button>
  </div>
  <div class="card ptext part-pages"><h2 style="margin-top:0">Mockup pages</h2>
    <p class="small" style="margin:0">Which pages of each Canva mockup template become listing photos, and in what order. Names must match the Canva page names exactly. After changing a garment's pages, run Check for problems → Check a mockup template for it.</p>
    <label>Range and garment<select id="mpR">${rules.map((r, i) => `<option value="${i}">${esc(r.name)}</option>`).join("")}</select></label>
    <div id="mpL"></div>
    <h3 class="sideh" style="margin-top:18px">Add a page</h3>
    <div class="g3"><label>Position<input id="mpP" type="number" min="1" max="40"></label><label style="grid-column:span 2">Page name<input id="mpN" placeholder="OS_26_TS_EXTRA_MAROON"></label></div>
    <button class="btn-main" type="button" id="mpGo" style="width:auto;padding:0 26px;margin-top:12px">Add page</button>
  </div>
${crossSellCard(S)}
  <div class="card ptext part-text"><h2 style="margin-top:0">Product text</h2>
    <p class="small" style="margin:0">What new listings are built with, for each range and garment. Saving changes Core only: listings already live keep their text. To change live listings as well, use Update listings → Descriptions.</p>
    <label>Range and garment<select id="pr">${rules.map((r, i) => `<option value="${i}">${esc(r.name)}</option>`).join("")}</select></label>
    <div id="pf"></div>
    <div style="display:flex;gap:10px;margin-top:16px"><button class="btn-main" type="button" id="psave" style="width:auto;padding:0 26px">Save product text</button></div>
  </div>
  <div class="card part-system"><h2 style="margin-top:0">Phone notifications</h2>
    <p class="small" style="margin:0 0 10px">The app sends alerts to your phone through the free <b>ntfy</b> app: videos ready, approvals done, failed builds, today's release, alerts. To receive them: install ntfy (App Store / Google Play), tap +, and subscribe to the topic below. Keep the topic private.</p>
    <div class="cp" style="display:flex;gap:8px;align-items:center"><code style="flex:1;font:500 13px var(--mono);overflow:hidden;text-overflow:ellipsis">${esc(env.NTFY_TOPIC || "not set up")}</code>${env.NTFY_TOPIC ? `<button class="btn" type="button" id="ntCopy" style="width:auto" data-t="${esc(env.NTFY_TOPIC)}">Copy</button>` : ""}</div>
    <button class="btn-main" type="button" id="ntTest" style="width:auto;padding:0 26px;margin-top:12px">Send a test notification</button>
  </div>
  <div class="card ptext part-shift"><h2 style="margin-top:0">Schedule: move a whole range</h2>
    <p class="small" style="margin:0">Moves every unreleased date in one range later or earlier by whole weeks, keeping the order and weekdays. Built and released garments stay put, and nothing can be moved into the next two days. Undo is in Recent changes above.</p>
    <div class="g3"><label>Range<select id="shR"><option value="IH">Introvert Here</option><option value="SH">SHHH.</option><option value="PC">Per Contract</option><option value="OS">Off The Shelf</option></select></label>
      <label>Weeks (minus = earlier)<input id="shW" type="number" min="-104" max="104" value="1"></label></div>
    <button class="btn-main" type="button" id="shGo" style="width:auto;padding:0 26px;margin-top:12px">Move the range</button>
  </div>
  <div class="card ptext part-system"><h2 style="margin-top:0">Backups</h2>
    <p class="small" style="margin:0">Core is copied every night at 02:15 and the last 35 days are kept. To put Core back how it was:</p>
    <ol class="small" style="padding-left:18px"><li><b>Best:</b> open Core in OneDrive (<a href="https://mosspitstudios-my.sharepoint.com/personal/admin_mosspit_org/_layouts/15/Doc.aspx?sourcedoc=%7BEA717AD9-320A-4722-B604-03270C9D7310%7D&file=001A_INTROVERT_HERE_CORE.xlsx&action=default" target="_blank" rel="noopener">open Core</a>) → File → Info → <b>Version history</b>, pick a time and Restore. This keeps the same file, so Make carries on working.</li>
    <li>Or ask Claude to restore it for you from a nightly copy.</li><li>Don't replace Core with a backup file by hand: Make would lose track of it.</li></ol>
    <div id="bkL"><p class="small">Loading the nightly copies…</p></div>
    <h3 class="sideh" style="margin-top:20px">Restore Core</h3>
    <p class="small" style="margin:0">Puts Core back exactly as it was at 02:15 on the night you pick (using OneDrive's version history, so Make keeps working). Everything changed in Core since then is undone, so only use it if something has gone badly wrong. You can undo a restore from Recent changes. Afterwards tap Sync to Core.</p>
    <div class="g3"><label>Back to the night of<select id="rsD"></select></label></div>
    <button class="btn" type="button" id="rsGo" style="width:auto;margin-top:12px;border-color:#e0605a;color:#ff8a85">Restore Core…</button>
  </div>
</div>
<script>
(function () {
  var R = ${JSON.stringify(rules).replace(/</g, "\\u003c")}, F = ${JSON.stringify(RULE_TEXT)};
  function h(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function post(b) { return fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().then(function (o) { if (!r.ok) throw new Error(o.error || "Couldn't save"); return o; }); }); }
  document.querySelectorAll(".seg").forEach(function (g) { g.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.classList.contains("on")) return;
    post({ kind: "tag", key: g.dataset.k, value: b.dataset.v }).then(function () { g.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); toast("Saved to Core"); }).catch(function (er) { toast(er.message, true); }); }); });
  document.querySelectorAll("[data-save]").forEach(function (b) { b.addEventListener("click", function () { var i = document.querySelector('input[data-k="' + b.dataset.save + '"]');
    post({ kind: "tag", key: b.dataset.save, value: i.value }).then(function () { toast("Saved to Core"); }).catch(function (er) { toast(er.message, true); }); }); });
  var sel = document.getElementById("pr");
  function draw() { var r = R[sel.value]; if (!r) { document.getElementById("pf").innerHTML = '<p class="small">Tap Sync to Core to load the product text.</p>'; return; }
    document.getElementById("pf").innerHTML = F.map(function (f) { return '<label>' + h(f[1]) + (f[2] ? '<textarea data-f="' + f[0] + '">' + h(r[f[0]]) + '</textarea>' : '<input data-f="' + f[0] + '" maxlength="60" value="' + h(r[f[0]]) + '">') + '</label>'; }).join("") +
      '<label>Product tags (5, up to 20 characters each)</label><div class="ptags">' + [0, 1, 2, 3, 4].map(function (i) { return '<input data-t="' + i + '" maxlength="20" value="' + h(r.tags[i] || "") + '">'; }).join("") + '</div>'; }
  sel.addEventListener("change", draw); draw();
  document.querySelectorAll("[data-undo]").forEach(function (b) { b.addEventListener("click", function () { b.disabled = true; post({ kind: "undo", id: b.dataset.undo }).then(function () { toast("Undone"); setTimeout(function () { location.reload(); }, 800); }).catch(function (er) { b.disabled = false; toast(er.message, true); }); }); });
  var ntc = document.getElementById("ntCopy"); if (ntc) ntc.onclick = function () { navigator.clipboard.writeText(ntc.dataset.t).then(function () { toast("Copied"); }); };
  document.getElementById("shGo").onclick = function () { var w = +document.getElementById("shW").value, r = document.getElementById("shR");
    if (!w || !confirm("Move every unreleased " + r.options[r.selectedIndex].text + " date " + Math.abs(w) + " week" + (Math.abs(w) === 1 ? "" : "s") + (w > 0 ? " later" : " earlier") + "?")) return;
    go(this, { kind: "shift", prefix: r.value, weeks: w }, function () { setTimeout(function () { location.reload(); }, 900); }); };
  document.getElementById("rsGo").onclick = function () { var dt = document.getElementById("rsD").value; if (!dt) return;
    var t = prompt("This puts Core back to how it was at 02:15 on " + dt + ". Everything changed in Core since then is undone.\\n\\nType RESTORE to go ahead."); if (t !== "RESTORE") { toast("Not restored"); return; }
    var b = this; b.disabled = true; b.textContent = "Restoring… (up to a minute)";
    post({ kind: "restore", date: dt }).then(function () { toast("Core restored. Tap Sync to Core."); setTimeout(function () { location.reload(); }, 1500); }).catch(function (er) { b.disabled = false; b.textContent = "Restore Core…"; toast(er.message, true); }); };
  fetch("/api/backups").then(function (r) { return r.json(); }).then(function (o) { var sel = document.getElementById("rsD"); sel.innerHTML = (o.list || []).map(function (b) { var dt = b.name.replace("CORE_", "").replace(".xlsx", ""); return '<option value="' + h(dt) + '">' + h(dt) + "</option>"; }).join("");
    document.getElementById("bkL").innerHTML = o.list && o.list.length ? '<div class="catchips">' + o.list.map(function (b) { return '<a class="ph" href="' + h(b.url) + '" target="_blank" rel="noopener">' + h(b.name.replace("CORE_", "").replace(".xlsx", "")) + "</a>"; }).join("") + "</div>" : '<p class="small">' + h(o.error || "No copies found.") + "</p>"; }).catch(function () {});
  document.getElementById("ntTest").onclick = function () { fetch("/api/notify-test", { method: "POST" }).then(function (r) { return r.json(); }).then(function (o) { toast(o.ok ? "Sent. Check your phone." : "Notifications aren't set up yet.", !o.ok); }); };
  var PG = ${JSON.stringify(pages).replace(/</g, "\\u003c")}, RL = ${JSON.stringify(((S && S.rules) || []).map((r) => [r.coll, r.type]))};
  document.addEventListener("click", function (e) { var b = e.target.closest(".ph"); if (!b) return; var on = b.classList.contains("off");
    post({ kind: b.dataset.kind, i: +b.dataset.i, on: on }).then(function () { b.classList.toggle("off", !on); b.title = "Tap to switch " + (on ? "off" : "on"); toast(on ? "Switched on" : "Switched off"); }).catch(function (er) { toast(er.message, true); }); });
  document.getElementById("spGo").addEventListener("click", function () { go(this, { kind: "season-add", t: document.getElementById("spT").value, s: document.getElementById("spS").value, a: document.getElementById("spA").value, e: document.getElementById("spE").value }, function () { setTimeout(function () { location.reload(); }, 900); }); });
  var mp = document.getElementById("mpR");
  function mpDraw() { var k = RL[mp.value] || []; var rows = PG.filter(function (p) { return p.coll === k[0] && p.type === k[1]; }).sort(function (a, b) { return a.pos - b.pos; });
    document.getElementById("mpL").innerHTML = rows.length ? rows.map(function (p) { return '<div class="mprow" data-idx="' + p.i + '" data-name="' + h(p.name) + '"><input type="number" min="1" max="40" value="' + h(p.pos) + '" class="mpPos"><input value="' + h(p.name) + '" class="mpName"><button class="btn mpSave" type="button">Save</button><button class="btn mpDel" type="button">Remove</button></div>'; }).join("") : '<p class="small">No pages listed for this garment yet.</p>'; }
  mp.addEventListener("change", mpDraw); mpDraw();
  document.getElementById("mpL").addEventListener("click", function (e) { var r = e.target.closest(".mprow"); if (!r) return;
    if (e.target.closest(".mpSave")) post({ kind: "page-save", idx: +r.dataset.idx, pos: r.querySelector(".mpPos").value, name: r.querySelector(".mpName").value }).then(function (o) { toast(o.unchanged ? "Nothing changed" : "Saved to Core"); }).catch(function (er) { toast(er.message, true); });
    if (e.target.closest(".mpDel") && confirm("Remove " + r.dataset.name + " from the photos for this garment?")) post({ kind: "page-del", idx: +r.dataset.idx, name: r.dataset.name }).then(function () { toast("Removed"); setTimeout(function () { location.reload(); }, 900); }).catch(function (er) { toast(er.message, true); }); });
  document.getElementById("mpGo").addEventListener("click", function () { var k = RL[mp.value] || []; go(this, { kind: "page-add", coll: k[0], type: k[1], pos: document.getElementById("mpP").value, name: document.getElementById("mpN").value }, function () { setTimeout(function () { location.reload(); }, 900); }); });
  function go(btn, body, done) { btn.disabled = true; var lbl = btn.textContent; btn.textContent = "Saving…";
    post(body).then(function (o) { toast(o.added == null ? "Saved to Core" : "Saved to Core: " + o.added + (o.added === 1 ? " phrase" : " phrases")); done(); }).catch(function (er) { toast(er.message, true); }).then(function () { btn.disabled = false; btn.textContent = lbl; }); }
  document.getElementById("caGo").addEventListener("click", function () { go(this, { kind: "cat-add", range: document.getElementById("caR").value, name: document.getElementById("caN").value, anchors: document.getElementById("caA").value, flavours: document.getElementById("caF").value }, function () { setTimeout(function () { location.reload(); }, 900); }); });
  document.getElementById("paGo").addEventListener("click", function () { go(this, { kind: "phrase-add", name: document.getElementById("paC").value, flavours: document.getElementById("paF").value }, function () { setTimeout(function () { location.reload(); }, 900); }); });
  document.getElementById("psave").addEventListener("click", function () { var r = R[sel.value]; if (!r) return; var b = { kind: "rule", row: r.row, tags: [] };
    document.querySelectorAll("#pf [data-f]").forEach(function (x) { b[x.dataset.f] = x.value; }); document.querySelectorAll("#pf [data-t]").forEach(function (x) { b.tags[+x.dataset.t] = x.value; });
    var btn = this; btn.disabled = true; btn.textContent = "Saving…";
    post(b).then(function (o) { F.forEach(function (f) { r[f[0]] = b[f[0]]; }); r.tags = b.tags.map(function (t) { return String(t || "").trim().toLowerCase(); }); toast(o.unchanged ? "Nothing changed" : "Saved to Core"); })
      .catch(function (er) { toast(er.message, true); }).then(function () { btn.disabled = false; btn.textContent = "Save product text"; }); });
})();
</script>`);
}

async function toolsPage(env) {
  const runs = (await env.PENDING.get("tool-runs", "json")) || {};
  const SA = await env.PENDING.get("amend", "json");
  const RN = { "INTROVERT HERE…": "Introvert Here", "SHHH.": "SHHH.", "PER CONTRACT": "Per Contract", "OFF THE SHELF": "Off The Shelf" };
  const tplOpts = ((SA && SA.rules) || []).map((r) => `<option value="${esc(r.coll + "|" + r.type)}">${esc((RN[r.coll] || r.coll) + " · " + garmentName(r.type))}</option>`).join("");
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
.gchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.gchip{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1.5px solid var(--frame);border-radius:12px;color:var(--text);text-decoration:none;font:700 13px var(--display);letter-spacing:.06em}
</style>
${brandHeader("Check for problems", `<button class="btn" id="scanRefresh" type="button">${icon("sync")}Sync to Core</button>`)}
<div class="frame" style="max-width:860px;margin-bottom:16px"><div class="card tcard">
  <h3>Check a mockup template</h3>
  <p>Run this after you publish a Canva mockup template. It compares the template with Core's page list and tells you if anything doesn't match, before you update any listings. About 3 Make credits. It leaves a copy called "TEMPLATE CHECK (safe to delete)" in Canva.</p>
  <div class="prow"><label>Range and garment</label><select id="tplPick">${tplOpts}</select></div>
  <button class="btn-main" id="tplGo" type="button">${icon("check")}Check this template</button>
  <div id="tplOut" class="small" style="margin-top:12px"></div>
</div></div>
<div class="frame" style="max-width:860px"><div class="card tcard">
  <h3>Check the gags for problems</h3>
  <p>Runs by itself whenever you open this page or the dashboard. Looks through every written gag for duplicates, very similar gags, title stems with stray spaces or line breaks, gags missing the opening "...", and custom tags over Etsy's 20 characters. Instant and free.</p>
  <button class="btn-main" id="scan" type="button">${icon("check")}Check again</button>
  <div id="scanOut" class="small" style="margin-top:12px"></div>
</div></div>
<script src="/gagcheck.js"></script>
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
function esc2(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
async function scan() {
  const out = $("scanOut"); out.textContent = "Checking…";
  const r = await fetch("/api/gags-data"); const g = r.ok ? await r.json() : null;
  if (!g || !g.all) { out.innerHTML = "The app hasn't got the full gag list yet. Tap “Sync to Core”, wait a minute, then check again."; return; }
  const issues = gagIssues(g);
  const head = "Checked " + g.all.length + " written gags (Core read " + new Date(g.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "). ";
  out.innerHTML = issues.length ? head + issues.length + " thing" + (issues.length === 1 ? "" : "s") + " to look at. Tap a gag to open it and fix it:" + issues.map((x) =>
    '<div class="issue"><b>' + esc2(x.t) + '</b>' + (x.d ? esc2(x.d) + "<br>" : "") + '<span class="gchips">' + x.ids.map((id) => '<a class="gchip" href="/gag/' + encodeURIComponent(id) + '">' + esc2(id) + " ›</a>").join("") + "</span></div>").join("") : head + "No problems found. ✓";
}
async function tplShow() {
  const k = $("tplPick").value; const all = await (await fetch("/api/template-checks")).json(); const c = all[k];
  if (!c) { $("tplOut").textContent = ""; return false; }
  if (c.running) { $("tplOut").textContent = "Checking… (about a minute)"; return Date.now() - c.at < 5 * 60e3; }
  const icon = { ok: "✓", warn: "!", bad: "✕" };
  $("tplOut").innerHTML = "Checked " + new Date(c.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ":" + c.issues.map((x) => '<div class="issue"><b>' + icon[x[0]] + " " + (x[0] === "ok" ? "Looks right" : x[0] === "bad" ? "Needs fixing" : "Worth a look") + "</b>" + esc2(x[1]) + "</div>").join("");
  return false;
}
let tplTimer = null;
async function tplPoll() { clearTimeout(tplTimer); if (await tplShow()) tplTimer = setTimeout(tplPoll, 8000); }
$("tplPick").addEventListener("change", tplPoll);
$("tplGo").addEventListener("click", async () => { $("tplGo").disabled = true; const [coll, type] = $("tplPick").value.split("|");
  const r = await fetch("/api/template-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coll, type }) }); const j = await r.json().catch(() => ({}));
  $("tplGo").disabled = false; if (!r.ok) { $("tplOut").textContent = j.error || "Couldn't start the check."; return; } tplPoll(); });
tplPoll();
$("scan").addEventListener("click", scan);
scan();
$("scanRefresh").addEventListener("click", async () => { $("scanOut").textContent = "Syncing to Core… check again in about a minute."; await fetch("/api/gags-refresh", { method: "POST" }); fetch("/api/amend-refresh", { method: "POST" }); toast("Syncing to Core"); });
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
const AMEND_WHAT = ["supplier", "print", "mockups", "colours", "titles", "descriptions", "tags", "shipping", "video"];
const AMEND_RULE_COLS = { suffix: "TITLE_SUFFIX", intro: "COLLECTION_INTRO", features: "PRODUCT_FEATURES", audience: "AUDIENCE_TEXT", closing: "CLOSING_TEXT", bp: "PRINTIFY_BLUEPRINT_ID", provider: "PRINTIFY_PROVIDER_ID", ship: "SHIPPING_PROFILE_ID" };
const AMEND_TAG_COLS = ["PRODUCT_TAG_09", "PRODUCT_TAG_10", "PRODUCT_TAG_11", "PRODUCT_TAG_12", "PRODUCT_TAG_13"];
const amendCell = (table, col, row, value) => ({ url: `${AMEND_XL}/tables/${table}/columns/${col}/dataBodyRange/cell(row=${Number(row)},column=0)`, value: String(value) });

async function amendSync(request, env) {
  if (!checkSecret(request, env)) return json({ error: "bad secret" }, 403);
  const data = await request.json();
  data.at = Date.now();
  await env.PENDING.put("amend", JSON.stringify(data));
  const pend = await env.PENDING.get("tpl-pending", "json");
  if (pend) {
    await env.PENDING.delete("tpl-pending");
    const r = (data.rules || []).find((x) => x.coll === pend.coll && x.type === pend.type);
    if (r && r.tpl) await amendHook(env, { action: "template", ops: JSON.stringify({ tpl: r.tpl, coll: pend.coll, type: pend.type }) });
  }
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
  const S = await env.PENDING.get("amend", "json");
  if (!S) return;
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  const w = (await env.PENDING.get("amend-watch", "json")) || {};
  const w0 = JSON.stringify(w);   // only save when something changed (Cloudflare's free plan allows ~1,000 saves a day)
  const now = Date.now();
  const busyIds = S.gags.filter((g) => /^AMENDMENT_REQUIRED/.test(g.status)).map((g) => g.id).sort();
  const busy = busyIds.length > 0;
  const justSaved = log[0] && now - log[0].at < 20 * 60000;
  // Stall check: if the list of gags still updating hasn't changed for 40 minutes, the builder's chain has stopped.
  const sig = busyIds.join(",");
  if (sig !== w.sig) { w.sig = sig; w.since = now; w.warned = false; }
  if (busy && !w.warned && now - (w.since || now) > 40 * 60000) {
    w.warned = true;
    const alerts = await loadAlerts(env);
    const title = "Listing updates have stopped at " + busyIds[0];
    const body = busyIds.length + " gag" + (busyIds.length === 1 ? " is" : "s are") + " still waiting (" + busyIds.slice(0, 6).join(", ") + (busyIds.length > 6 ? "…" : "") + "). Nothing has finished for 40 minutes, so the builder has probably hit an error. Tap Restart updates on the Update listings page. If it stops again on the same gag, ask Claude to look.";
    alerts.unshift({ id: crypto.randomUUID(), at: now, title, body, link: "https://mosspit-approvals.mosspit.workers.dev/amend", source: "Update listings" });
    await saveAlerts(env, alerts);
    await notify(env, "https://mosspit-approvals.mosspit.workers.dev", title, "Tap Restart updates on the Update listings page.", "warning");
  }
  // Progress bar: remember this batch of gags (and the listings in it) so the dashboard can show
  // "3 of 7 gags updated" and then "12 of 28 new videos in". Cleared a day after the updates finish.
  if (busy) {
    const b = w.batch && !w.batch.doneAt ? w.batch : { start: now, ids: [], products: [] };
    busyIds.forEach((id) => { if (b.ids.includes(id)) return; b.ids.push(id);
      const g = S.gags.find((x) => x.id === id); const garm = g ? (g.only ? String(g.only).split("|") : g.live || []) : [];
      garm.forEach((t) => b.products.push(id + "-" + t)); });
    w.batch = b;
  } else if (w.batch && !w.batch.doneAt) w.batch.doneAt = now;
  if (w.batch && w.batch.doneAt && now - w.batch.doneAt > 24 * 3600e3) delete w.batch;
  if (JSON.stringify(w) !== w0) await env.PENDING.put("amend-watch", JSON.stringify(w));
  if (!busy && !justSaved) return;
  if (w.last && now - w.last < 9 * 60000) return;
  w.last = now; await env.PENDING.put("amend-watch", JSON.stringify(w));
  await amendHook(env, { action: "state" });
}

// ---------- Emergency stop ----------
// STOP sets "builder-stop": the builder's lock refuses every new run (each stops at its first step, 1 credit).
// "Pause and cancel" also clears the queued updates in Core. Resume clears the flag and restarts anything queued.
async function stopBuilder(request, env) {
  const d = await request.json().catch(() => ({}));
  const cancel = d.mode === "cancel";
  await env.PENDING.put("builder-stop", JSON.stringify({ at: Date.now(), mode: cancel ? "cancel" : "pause" }));
  let cleared = 0;
  if (cancel) {
    const S = await env.PENDING.get("amend", "json");
    const busy = S ? S.gags.filter((g) => /^AMENDMENT_REQUIRED/.test(g.status)) : [];
    const ops = [];
    busy.forEach((g) => { ops.push(amendCell("GAGS_TABLE", "STATUS", g.row, "LIVE_EXISTING")); g.status = "LIVE_EXISTING"; if (S.hasOnly && g.only) { ops.push(amendCell("GAGS_TABLE", "AMEND_ONLY", g.row, "")); g.only = ""; } });
    if (ops.length) { const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: "1", run: "no" }); if (err) return err; await env.PENDING.put("amend", JSON.stringify(S)); }
    cleared = busy.length;
    await env.PENDING.delete("amend-trial"); await env.PENDING.delete("photo-job");
  }
  return json({ ok: true, cleared });
}
async function resumeBuilder(env) {
  await env.PENDING.delete("builder-stop");
  const S = await env.PENDING.get("amend", "json");
  const queued = S ? S.gags.filter((g) => /^AMENDMENT_REQUIRED/.test(g.status)).length : 0;
  if (queued) { const err = await amendHook(env, { action: "kick" }); if (err) return err; }
  return json({ ok: true, queued });
}

async function amendRestart(env) {
  const err = await amendHook(env, { action: "kick" });
  if (err) return err;
  const w = (await env.PENDING.get("amend-watch", "json")) || {};
  w.since = Date.now(); w.warned = false; await env.PENDING.put("amend-watch", JSON.stringify(w));
  return json({ ok: true });
}

async function amendRefresh(env) {
  return (await amendHook(env, { action: "state" })) || json({ ok: true });
}

async function amendApply(request, env) {
  try { return await amendApply2(request, env); } catch (e) { return json({ error: String(e.message || e) }, 400); }
}
async function amendApply2(request, env, given) {
  const d = given || await request.json();
  // "Try it on one listing first": send only the first listing now, keep the rest until Barry taps Carry on.
  let trialRest = null;
  if (d.trial && Array.isArray(d.listings) && d.listings.length > 1) {
    if (await env.PENDING.get("amend-trial")) throw new Error("A trial listing is waiting for you to check. Tap Carry on or Stop at the top of this page first.");
    d.comboListings = d.listings.slice();
    const rest = { ...d, trial: false, listings: d.listings.slice(1), comboListings: undefined };
    if (rest.photo && rest.photo.mode === "add") rest.photo = { mode: "one", keys: [String(rest.photo.name || "").toUpperCase().replace(/[^A-Z_]/g, "") + "#1"] };
    trialRest = { first: d.listings[0], rest, at: Date.now() };
    d.listings = [d.listings[0]];
  }
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
    const allow = { suffix: "titles", intro: "descriptions", features: "descriptions", audience: "descriptions", closing: "descriptions", bp: "supplier", provider: "supplier", ship: "shipping" };
    for (const [k, col] of Object.entries(AMEND_RULE_COLS)) {
      if (typeof e[k] !== "string" || !what.has(allow[k])) continue;
      const v = e[k].trim();
      if ((k === "bp" || k === "provider") && !/^\d+$/.test(v)) throw new Error("Blueprint and provider must be Printify ID numbers.");
      if (k === "ship" && !/^\d{6,15}$/.test(v)) throw new Error("That isn't an Etsy shipping profile number.");
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
  // One photo (replace or add): mockups only, one job at a time; the builder reads the job from /api/photo-job.
  let photoJob = null;
  if (d.photo && (d.photo.mode === "one" || d.photo.mode === "add")) {
    if ([...what].some((w) => w !== "mockups")) throw new Error("A one-photo change can't be combined with other changes. Untick the others, or pick All photos.");
    const running = S.gags.some((g) => g.status === "AMENDMENT_REQUIRED_PHOTO");
    if (running) throw new Error("Another one-photo change is still running. Wait for it to finish (watch the dashboard), then try again.");
    const pagesOf = (coll, type) => (S.pages || []).filter((x) => x.coll === coll && x.type === type);
    const combosPicked = new Set();
    gagIds.forEach((id) => { const g = S.gags.find((x) => x.id === id); byGag[id].forEach((t) => combosPicked.add(g.coll + "|" + t)); });
    // A trial adds the new page to Core for every garment picked, not just the trial listing's.
    (d.comboListings || []).forEach((l) => { const g = S.gags.find((x) => x.id === String(l.gag || "")); if (g) combosPicked.add(g.coll + "|" + String(l.garment || "")); });
    if (d.photo.mode === "one") {
      const keys = (Array.isArray(d.photo.keys) ? d.photo.keys : d.photo.key ? [d.photo.key] : []).map(String).filter((k) => /^[A-Z_]+#\d+$/.test(k) && !/^THUMBNAIL/.test(k));
      if (!keys.length) throw new Error("Tick at least one photo to refresh.");
      // Is any ticked photo in the video? Then the builder clears the video so a new one is made.
      const video = [...combosPicked].some((combo) => { const [coll, type] = combo.split("|"); const r = (S.rules || []).find((x) => x.coll === coll && x.type === type) || {};
        return photoPlan(pagesOf(coll, type), "BLACK").some((x) => keys.includes(x.key) && (x.rank === r.slot1 || x.rank === r.slot2)); });
      photoJob = { action: "replace", keys, key: keys[0], video, at: Date.now() };
    } else {
      const name = String(d.photo.name || "").toUpperCase().replace(/[^A-Z_]/g, "");
      if (!/^[A-Z][A-Z_]{1,23}$/.test(name)) throw new Error("Give the new photo a name, letters only (e.g. BEACH).");
      for (const combo of combosPicked) {
        const [coll, type] = combo.split("|"), pg = pagesOf(coll, type);
        if (!pg.length) throw new Error("Core has no mockup pages for " + coll + " " + type + ".");
        const plan = photoPlan(pg, "BLACK");
        if (plan.some((x) => x.key === name + "#1")) throw new Error("There's already a photo called " + name + " for " + type + ". Pick Just one photo to swap it, or use another name.");
        const thumbs = pg.filter((x) => /THUMBNAIL_/.test(x.name)).sort((a, b) => a.pos - b.pos).map((x) => x.name.toUpperCase().split("THUMBNAIL_")[1]);
        const cols = d.photo.each && thumbs.length ? thumbs : [""];
        if (plan.length + 1 > 20) throw new Error("Etsy allows 20 photos and " + coll + " " + type + " listings are already full.");
        const parts = pg.slice().sort((a, b) => a.pos - b.pos)[0].name.toUpperCase().split("_"), pre = parts[0], ab = parts[2];
        const maxPos = Math.max(...pg.map((x) => Number(x.pos) || 0));
        const rows = cols.map((c, i) => { const pos = maxPos + 1 + i; return [coll, type, pos, pre + "_" + String(pos).padStart(2, "0") + "_" + ab + "_" + name + (c ? "_" + c : "")]; });
        ops.push({ url: `${AMEND_XL}/tables/MOCKUP_PAGES/rows`, method: "POST", values: rows });
        rows.forEach((r) => S.pages.push({ coll: r[0], type: r[1], pos: r[2], name: r[3] }));
      }
      photoJob = { action: "add", key: name + "#1", keys: [name + "#1"], video: false, at: Date.now() };
    }
  }
  // New video: clear each picked listing's video status so the video starter makes a fresh one.
  if (what.has("video")) {
    if (!S.regRows) throw new Error("The app needs a fresh read of Core first. Tap Sync to Core, wait a minute, and try again.");
    for (const id of gagIds) for (const t of byGag[id]) { const r = S.regRows[id + "-" + t]; if (r !== undefined) ops.push(amendCell("LISTING_REGISTRY_TABLE", "VIDEO_STATUS", r, "")); }
  }
  const onlyVideo = what.size === 1 && what.has("video");
  const text = what.has("titles") || what.has("descriptions") || what.has("tags") || what.has("shipping");   // a text update re-sends shipping too
  const status = photoJob ? "AMENDMENT_REQUIRED_PHOTO" : what.has("print") ? "AMENDMENT_REQUIRED_REPRINT"
    : what.has("supplier") || what.has("colours") || (text && what.has("mockups")) ? "AMENDMENT_REQUIRED_COLOURS"
    : text ? "AMENDMENT_REQUIRED" : "AMENDMENT_REQUIRED_ARTWORK";
  for (const id of onlyVideo ? [] : gagIds) {
    const g = S.gags.find((x) => x.id === id);
    const pick = byGag[id];
    const only = g.live.every((t) => pick.has(t)) ? "" : AMEND_GARMENTS.filter((t) => pick.has(t)).join("|");
    if (only && !S.hasOnly) throw new Error("Core's GAGS table has no AMEND_ONLY column, so it can only update all garments of a gag.");
    if (S.hasOnly && (only || g.only)) { ops.push(amendCell("GAGS_TABLE", "AMEND_ONLY", g.row, only)); g.only = only; }
    ops.push(amendCell("GAGS_TABLE", "STATUS", g.row, status)); g.status = status;
  }
  if (photoJob) await env.PENDING.put("photo-job", JSON.stringify(photoJob));
  const err = await amendHook(env, { action: "apply", ops: JSON.stringify(ops), delay: onlyVideo ? "5" : "300", run: "yes" });
  if (err) return err;
  await env.PENDING.put("amend", JSON.stringify(S));
  const n = gagIds.reduce((a, id) => a + byGag[id].size, 0);
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  log.unshift({ at: Date.now(), what: [...what], listings: n, gags: gagIds });
  await env.PENDING.put("amend-log", JSON.stringify(log.slice(0, 20)));
  if (trialRest) { await env.PENDING.put("amend-trial", JSON.stringify(trialRest)); return json({ ok: true, gags: 1, listings: 1, trial: true, rest: trialRest.rest.listings.length, first: trialRest.first }); }
  return json({ ok: true, gags: gagIds.length, listings: n });
}

async function amendTrial(request, env) {
  const d = await request.json().catch(() => ({}));
  const t = await env.PENDING.get("amend-trial", "json");
  if (!t) return json({ error: "There's no trial waiting." }, 400);
  await env.PENDING.delete("amend-trial");
  if (d.action !== "carry") return json({ ok: true, stopped: true });
  try { return await amendApply2(null, env, t.rest); }
  catch (e) { await env.PENDING.put("amend-trial", JSON.stringify(t)); return json({ error: String(e.message || e) }, 400); }
}

// The trial card (Update listings page and dashboard): updating, or ready to check.
function trialCard(t, S, where) {
  if (!t) return "";
  const g = S && S.gags ? S.gags.find((x) => x.id === t.first.gag) : null;
  const busy = g && /^AMENDMENT_REQUIRED/.test(g.status);
  const name = esc(t.first.gag + " " + garmentName(t.first.garment));
  const n = t.rest.listings.length;
  return `<div class="card trialc"><b>${busy ? "Trying it on one listing first" : "Trial done: check it"}</b>
<p class="small" style="margin:6px 0 10px">${busy ? `Updating ${name} now. When it's done, check it on Etsy, then carry on with the other ${n}.` : `Look at ${name} on Etsy. If it's right, carry on with the other ${n} listing${n === 1 ? "" : "s"}. If not, stop and nothing else changes.`}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/gag/${encodeURIComponent(t.first.gag)}">Open ${esc(t.first.gag)}</a>${busy ? "" : `<button class="btn-main" type="button" data-trial="carry" style="width:auto;padding:0 20px">Carry on with ${n}</button>`}<button class="btn" type="button" data-trial="stop">Stop</button></div></div>
<script>document.querySelectorAll("[data-trial]").forEach(function (b) { b.onclick = function () { var a = b.dataset.trial; if (a === "stop" && !confirm("Stop here? The other listings won't be changed.")) return; b.disabled = true;
  fetch("/api/amend-trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a }) }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) { toast(j.error, true); b.disabled = false; } else { toast(a === "carry" ? "Carrying on with the rest" : "Stopped"); setTimeout(function () { location.reload(); }, 900); } }); }; });</script>`;
}

async function amendPage(env) {
  const S = (await env.PENDING.get("amend", "json")) || null;
  const trial = await env.PENDING.get("amend-trial", "json");
  const log = (await env.PENDING.get("amend-log", "json")) || [];
  const ship = (await env.PENDING.get("ship-profiles", "json")) || {};
  const data = JSON.stringify({ S, log, ship }).replace(/</g, "\\u003c");
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
.grp{margin:10px 0 0;font:800 11px var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
/* Tap-to-go tiles (Barry, 14 Nov): every choice is a button that moves you on; no tick boxes. */
.lt{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin:8px 0 6px}
.lt .tile{min-height:118px;cursor:pointer;font:inherit;text-align:left;width:100%}
.lt .tile .ic{width:42px;height:42px;border-radius:12px}.lt .tile .ic svg{width:24px;height:24px}
.lt .tile .nm{font-size:14px}
.lt .tile.sm{min-height:76px;flex-direction:row;align-items:center}
.lt .tile.sm .st{margin-top:2px}
.lt .tile .busy{position:absolute;right:12px;top:12px;font-size:11px;padding:3px 8px;border-radius:99px;background:rgba(230,180,80,.2);color:#f0c870}
.lt .tile[disabled]{opacity:.4;cursor:not-allowed;transform:none}
.lgrp{margin:18px 0 0;font:800 12px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.lgw{display:flex;flex-wrap:wrap;gap:0 12px}.lgb{min-width:0}.lgb .lt{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.runb{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}
.pv{margin-top:12px}.pvlbl{font:800 11px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.pvbox{background:#fff;color:#222;border-radius:10px;padding:12px 14px;font:16px/1.45 Arial,sans-serif}.pvseen{background:#fff3c4}.pvdesc{white-space:pre-wrap;font-size:14px;max-height:420px;overflow:auto}
.ttab{width:100%;border-collapse:collapse;font-size:13px}.ttab th,.ttab td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.warnbox{margin:8px 0;padding:10px 12px;border-radius:10px;background:rgba(230,180,80,.14);border:1px solid rgba(230,180,80,.5);font-size:14px}
</style>
${brandHeader("Listings", `<button class="btn" id="restart" type="button"${S && S.gags.some((g) => /^AMENDMENT_REQUIRED/.test(g.status)) ? "" : " hidden"}>${icon("sync")}Restart updates</button><button class="btn" id="reread" type="button">${icon("sync")}Sync to Core</button>`)}
<div class="aw">
  ${trialCard(trial, S)}
  <div class="steps" id="steps"></div>
  <div class="card" id="view"></div>
  <details class="card"><summary style="cursor:pointer;font-weight:600">Recent updates</summary><div class="small" id="log" style="margin-top:8px"></div><p class="small" id="readAt" style="margin:8px 0 0"></p></details>
</div>
<div class="abar"><div class="in">
  <div class="count" id="count"></div>
  <button class="abtn ghost" id="reset" type="button">Start over</button>
  <button class="abtn" id="back" type="button">Back</button>
  <button class="abtn go" id="next" type="button">Next</button>
</div></div>
<script id="amend-data" type="application/json">${data}</script>
<script src="/amend.js?v=${AMEND_VER}"></script>`);
}

// One listing's photos in Etsy order, for a template (pages = [{pos, name}]) and a lead colour.
// Same rules as the builder (docs/tagging/make/mockup_rank.js): one colour of each picture (lead colour, else Black),
// lead thumbnail first, one Printify mockup at rank 2. Each photo gets a stable key like "SETUP#2" that means the
// same picture whatever the colour or garment, so "replace just this photo" can be asked across a whole range.
function photoPlan(pages, hero) {
  hero = String(hero || "").toUpperCase().replace(/\s+/g, "_");
  var nm = function (p) { return String(p.name || "").toUpperCase(); };
  var sorted = pages.slice().sort(function (a, b) { return Number(a.pos) - Number(b.pos); });
  var thumbs = sorted.filter(function (p) { return /THUMBNAIL/.test(nm(p)); });
  var colours = thumbs.map(function (p) { var m = nm(p).match(/THUMBNAIL_(.+)$/); return m ? m[1] : ""; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
  var colourOf = function (p) { var n = nm(p); for (var i = 0; i < colours.length; i++) if (n.slice(-(colours[i].length + 1)) === "_" + colours[i]) return colours[i]; return ""; };
  var baseOf = function (p) { var c = colourOf(p), n = nm(p).replace(/^[A-Z]+_\d+_/, "").replace(/^(TS|LS|SW|HD)_/, ""); return c ? n.slice(0, -(c.length + 1)) : n; };
  var groups = {};
  sorted.forEach(function (p) { if (/THUMBNAIL/.test(nm(p)) || !colourOf(p)) return; var b = baseOf(p), c = colourOf(p); groups[b] = groups[b] || {}; (groups[b][c] = groups[b][c] || []).push(p); });
  var swap = [], drop = [];
  Object.keys(groups).forEach(function (b) {
    var g = groups[b], want = g[hero] ? hero : (g.BLACK ? "BLACK" : Object.keys(g)[0]);
    var n = Math.max.apply(null, Object.keys(g).map(function (c) { return g[c].length; }));
    for (var k = 0; k < n; k++) {
      var copies = Object.keys(g).map(function (c) { return g[c][k]; }).filter(Boolean).sort(function (a, b) { return Number(a.pos) - Number(b.pos); });
      var keep = (g[want] && g[want][k]) || copies[0];
      copies.forEach(function (p) { if (p !== copies[0]) drop.push(p); });
      swap.push([copies[0], keep]);
    }
  });
  var order = sorted.filter(function (p) { return drop.indexOf(p) < 0; }).map(function (p) { for (var i = 0; i < swap.length; i++) if (swap[i][0] === p) return swap[i][1]; return p; });
  var lead = null; for (var j = 0; j < thumbs.length; j++) if (hero && nm(thumbs[j]).slice(-(hero.length + 1)) === "_" + hero) lead = thumbs[j];
  if (lead && thumbs.length > 1 && lead !== thumbs[0]) { var at = order.indexOf(thumbs[0]); order = order.filter(function (p) { return p !== lead; }); order.splice(at, 0, lead); }
  var seen = {};
  return order.map(function (p, i) {
    var thumb = /THUMBNAIL/.test(nm(p)), b = thumb ? "THUMBNAIL" : baseOf(p);
    seen[b] = (seen[b] || 0) + 1;
    var label = b.toLowerCase().replace(/_/g, " "); label = /^(agm)$/.test(label) ? label.toUpperCase() : label.charAt(0).toUpperCase() + label.slice(1);
    return { pos: Number(p.pos), name: p.name, key: b + "#" + seen[b], label: label + (seen[b] > 1 ? " " + seen[b] : ""), thumb: thumb, rank: i === 0 ? 1 : i + 2 };
  });
}

const AMEND_JS = String.raw`
var D = JSON.parse(document.getElementById("amend-data").textContent);
var S0 = D.S, LOG = D.log || [], SHIP = D.ship || {};
var TAXO = { "T-SHIRT": "Clothing › Gender-Neutral Adult › Tops & Tees › T-shirts", "LONG-SLEEVE": "Clothing › Gender-Neutral Adult › Tops & Tees › T-shirts", "SWEATSHIRT": "Clothing › Gender-Neutral Adult › Hoodies & Sweatshirts › Sweatshirts", "HOODIE": "Clothing › Gender-Neutral Adult › Hoodies & Sweatshirts › Hoodies" };
var RANGES = [["IH","Introvert Here","INTROVERT HERE…"],["SH","SHHH.","SHHH."],["PC","Per Contract","PER CONTRACT"],["OS","Off The Shelf","OFF THE SHELF"]];
var GARM = [["T-SHIRT","T-Shirt","T-Shirts"],["LONG-SLEEVE","Long-Sleeve","Long-Sleeves"],["SWEATSHIRT","Sweatshirt","Sweatshirts"],["HOODIE","Hoodie","Hoodies"]];
// Listings (Barry, 14 Nov): sections in the order of Etsy's own edit page.
var WHAT = [
  ["mockups","Mockups","Photos: re-export the Canva mockup pages onto the listings (all of them, one page, or add a page)","Photos & video"],
  ["video","Video","Make a fresh video from the photos already on Etsy. It comes to Approvals; approving it replaces the old video.","Photos & video"],
  ["titles","Title","The title ending for a range and garment, or one gag's title stem. With a preview.","Listing text"],
  ["descriptions","Description","Intro, features, who it's for, closing text. With a preview.","Listing text"],
  ["tags","Tags","The 5 product tags for a range and garment (gag tags live on the Tags page)","Listing text"],
  ["taxonomy","Category & attributes","The Etsy category and colour attributes each range and garment uses","Search"],
  ["shipping","Shipping","What buyers pay for postage and the delivery time Etsy shows them, per range and garment","Shipping"],
  ["colours","Colours & sizes","See each garment's sizes, and add or take away colours","Variations"],
  ["print","Print template","New print file from the gag text and the current Canva print template; also refreshes mockups and the video","Production"],
  ["supplier","Supplier","Record a new Printify provider or garment model (do the swap in Printify first with Replace)","Production"]];
var VIEW_ONLY = { taxonomy: 1 };
var RULE_ONLY = { titles: 1, descriptions: 1, tags: 1, shipping: 1 };
var STAT = { AMENDMENT_REQUIRED:"Updating", AMENDMENT_REQUIRED_PHOTO:"Updating one photo", AMENDMENT_REQUIRED_ARTWORK:"Updating mockups", AMENDMENT_REQUIRED_REPRINT:"Updating print", AMENDMENT_REQUIRED_COLOURS:"Updating" };
function gName(t) { for (var i = 0; i < GARM.length; i++) if (GARM[i][0] === t) return GARM[i][1]; return t; }
function rName(c) { for (var i = 0; i < RANGES.length; i++) if (RANGES[i][0] === c) return RANGES[i][1]; return c; }
function rColl(c) { for (var i = 0; i < RANGES.length; i++) if (RANGES[i][0] === c) return RANGES[i][2]; return c; }
function $(id) { return document.getElementById(id); }
function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
var A;  // all choices; Start over resets it
function fresh() { A = { step:0, path:[], pickKs:[], scope:null, sel:{}, drill:[], q:"", what:{}, stem:null, text:null, rules:{}, colours:{}, cur:{}, photo:{ mode:"all", keys:{}, name:"", each:true }, trial:true, done:null, err:"" }; }
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

var STEPS = ["What", "Which", "Details", "Check"];
function render() {
  if (!S0) { $("view").innerHTML = "The page hasn't read Core yet. Tap <b>Sync to Core</b> and give it a minute."; $("count").textContent = ""; return; }
  $("steps").innerHTML = STEPS.map(function (s, i) { return '<span class="' + (i === A.step ? "on" : i < A.step ? "done" : "") + '">' + (i + 1) + ". " + s + "</span>"; }).join("");
  [what, where, details, check][A.step]();
  Array.prototype.forEach.call(document.querySelectorAll("input[data-mixed]"), function (i) { i.indeterminate = true; });
  var n = selKeys().length, w = whatOn();
  $("count").innerHTML = A.done ? "Saved" : "<b>" + n + "</b> listing" + (n === 1 ? "" : "s") + (w.length ? " · " + w.length + " change" + (w.length === 1 ? "" : "s") : "");
  $("back").hidden = A.step === 0 || !!A.done;
  $("next").hidden = A.step !== 2 || !!A.done;
  $("next").textContent = "Check";
  var ruleOnly = w.length && w.every(function (x) { return RULE_ONLY[x] || VIEW_ONLY[x]; });
  $("next").disabled = (A.step === 0 && !w.length) || (A.step === 1 && !n && !ruleOnly) || (A.step === 2 && A.what.mockups && A.photo.mode === "one" && !Object.keys(A.photo.keys).length) || (A.step === 2 && A.what.mockups && A.photo.mode === "add" && !A.photo.name);
  $("log").innerHTML = LOG.length ? LOG.map(function (l) { return h(new Date(l.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })) + " · " + h(Array.isArray(l.what) ? l.what.join(", ") : (l.what || "")) + " · " + (l.listings ? l.listings + " listing" + (l.listings === 1 ? "" : "s") : h(l.scope || "")); }).join("<br>") : "None yet.";
  $("readAt").textContent = "Core read " + new Date(S0.at).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
}

var WICON = { mockups: "approve", video: "approve", titles: "gags", descriptions: "gags", tags: "tags", taxonomy: "search", shipping: "orders", colours: "tools", print: "update", supplier: "links" };
function ic(n) { return '<span class="ic"><svg><use href="#i-' + n + '"/></svg></span>'; }
function tileB(attr, icon, name, sub, extra) { return '<button type="button" class="tile' + (icon ? "" : " sm") + '" ' + attr + ">" + (icon ? ic(icon) : "") + '<span><span class="nm">' + h(name) + '</span>' + (sub ? '<span class="st" style="display:block">' + sub + "</span>" : "") + "</span>" + (extra || "") + "</button>"; }
function what() {
  var groups = [], by = {};
  WHAT.forEach(function (w) { if (!by[w[3]]) { by[w[3]] = []; groups.push(w[3]); } by[w[3]].push(tileB('data-whatgo="' + w[0] + '"', WICON[w[0]], w[1], h(w[2])));
    if (w[0] === "tags") { groups.push("Price"); by.Price = ['<a class="tile" href="/pricing">' + ic("price") + '<span><span class="nm">Price</span><span class="st" style="display:block">Prices per garment and size, profit after fees and postage. Opens Pricing.</span></span></a>']; } });
  $("view").innerHTML = '<p class="q">What do you want to change?</p><p class="hint">Same order as Etsy\'s edit page. Tap one.</p><div class="lgw">' +
    groups.map(function (g) { var n = by[g].length; return '<div class="lgb" style="flex:' + n + " 1 " + (n * 200) + 'px"><p class="lgrp">' + h(g) + '</p><div class="lt">' + by[g].join("") + "</div></div>"; }).join("") + "</div>";
}
function gTiles(ks, label) {   // "All garments" + one tile per garment that has listings in ks
  var out = '<div class="lt">' + tileB('data-pick="all"', "", "All " + label, ks.length + " listing" + (ks.length === 1 ? "" : "s"));
  GARM.forEach(function (g) { var n = ks.filter(function (k) { return k.split("|")[1] === g[0]; }).length; if (n) out += tileB('data-pick="' + g[0] + '"', "", g[2], n + " listing" + (n === 1 ? "" : "s")); });
  return out + "</div>";
}
function where() {
  var P = A.path, ruleOnly = whatOn().every(function (x) { return RULE_ONLY[x]; }), out = '<p class="q">Which listings?</p>';
  var crumb = function (t) { return '<p class="hint">' + t + "</p>"; };
  if (!P.length) {
    out += '<div class="lt">' + (ruleOnly ? tileB('data-path="new"', "gags", "New listings only", "Save to Core. Live listings stay as they are.") : "") +
      tileB('data-path="all"', "home", "Everything", ALL.length + " live listings in every range") + tileB('data-path="range"', "stats", "One range", "A whole range, or one garment in it") + tileB('data-path="gag"', "search", "One gag", "Find a gag, then pick its garments") + "</div>";
  } else if (P[0] === "all") { A.pickKs = ALL.slice(); out += crumb("Everything › which garments?") + gTiles(ALL, "garments");
  } else if (P.length === 1) {
    out += crumb(P[0] === "range" ? "One range › which range?" : "One gag › which range is it in?") + '<div class="lt">' + RANGES.map(function (r) { var ks = keys(function (k) { return k.indexOf(r[0] + "-") === 0; }); var n = S0.gags.filter(function (g) { return g.id.indexOf(r[0] + "-") === 0; }).length;
      return tileB('data-path="' + r[0] + '"' + (ks.length ? "" : " disabled"), "", r[1], n + " gags · " + ks.length + " listings"); }).join("") + "</div>";
  } else if (P[0] === "range") { var rk = keys(function (k) { return k.indexOf(P[1] + "-") === 0; }); A.pickKs = rk; out += crumb("One range › " + h(rName(P[1])) + " › which garments?") + gTiles(rk, h(rName(P[1])) + " garments");
  } else if (P.length === 2) {
    var gs = S0.gags.filter(function (g) { return g.id.indexOf(P[1] + "-") === 0 && (!A.q || (g.stem + " " + g.id + " " + g.text).toLowerCase().indexOf(A.q.toLowerCase()) >= 0); });
    out += crumb("One gag › " + h(rName(P[1])) + " › which gag?") + '<input class="inp" id="q" placeholder="Search by title, ID or words in the gag" value="' + h(A.q) + '"><div class="lt">' +
      gs.map(function (g) { return tileB('data-path="' + g.id + '"', "", g.stem, h(g.id) + " · " + g.live.length + " garment" + (g.live.length === 1 ? "" : "s"), /^AMENDMENT_REQUIRED/.test(g.status) ? '<span class="busy">' + (STAT[g.status] || "Updating") + "</span>" : ""); }).join("") + "</div>";
  } else { var g = gagOf(P[2]), gk = g.live.map(function (t) { return g.id + "|" + t; }); A.pickKs = gk; out += crumb("One gag › " + h(g.stem) + " › which garments?") + gTiles(gk, "garments"); }
  $("view").innerHTML = out;
}
function pickerFor(kind, list, label) {   // list of ids; A.cur[kind] = selected id
  if (!A.cur[kind] || list.indexOf(A.cur[kind]) < 0) A.cur[kind] = list[0];
  if (list.length < 2) return "";
  return '<label class="f">' + label + '<select data-cur="' + kind + '">' + list.map(function (id) { var p = id.split("|"); return '<option value="' + id + '"' + (id === A.cur[kind] ? " selected" : "") + ">" + h(rName(p[0]) + (p[1] ? " · " + gName(p[1]) : "")) + "</option>"; }).join("") + "</select></label>";
}
// Mockups: all photos, just one photo, or add a new one (all three work per listing, per range or globally).
function pagesFor(combo) { var p = combo.split("|"); return (S0.pages || []).filter(function (x) { return x.coll === rColl(p[0]) && x.type === p[1]; }); }
function photoChoice(cb) {
  try { return photoChoice2(cb); } catch (e) { return '<div class="errbox">Something went wrong drawing the photo list (' + h(e.message) + '). Pull down to reload the page and try again; if it keeps happening, tell Claude.</div>'; }
}
function photoChoice2(cb) {
  if (!A.photo || typeof A.photo !== "object") A.photo = { mode: "all", keys: {}, name: "", each: true };
  if (!A.photo.keys || typeof A.photo.keys !== "object") A.photo.keys = {};
  var P = A.photo, opts = [["all","All photos","Re-export every mockup page. About 60 credits a listing, and makes a new video."],["one","Choose photos","Tick just the photos to refresh. About 25 credits a listing, however many you tick."],["add","Add a new photo","Add a page you've just added to the end of the Canva mockup template. About 25 credits a listing."]];
  var out = '<div class="col">' + opts.map(function (o) { return '<label class="tick"><input type="radio" name="pmode" data-pmode="' + o[0] + '"' + (P.mode === o[0] ? " checked" : "") + '><span class="lbl">' + o[1] + "<small>" + o[2] + "</small></span></label>"; }).join("") + "</div>";
  if (!S0.pages) return out + '<div class="errbox">The app doesn\'t have your mockup page list yet. <button class="abtn" type="button" id="readPages" style="margin-left:8px">Read it from Core</button> (takes about a minute, then this page reloads).</div>';
  if (P.mode === "one") {
    var keys = {}, order = [];
    cb.forEach(function (c) { var rule = ruleFor(c.split("|")[0], c.split("|")[1]) || {};
      photoPlan(pagesFor(c), "BLACK").forEach(function (x) { if (x.thumb) return; if (!keys[x.key]) { keys[x.key] = { label: x.label, n: 0, video: false }; order.push(x.key); }
        keys[x.key].n++; if (x.rank === rule.slot1 || x.rank === rule.slot2) keys[x.key].video = true; }); });
    Object.keys(P.keys).forEach(function (k) { if (!keys[k]) delete P.keys[k]; });
    out += '<p class="q" style="margin-top:12px">Which photos?</p><p class="hint">Tick the ones to refresh. Each listing gets its lead colour\'s version.</p><div class="g2">' + order.map(function (k) {
      return '<label class="tick"><input type="checkbox" data-pkeytick="' + h(k) + '"' + (P.keys[k] ? " checked" : "") + '><span class="lbl">' + h(keys[k].label) + "<small>" + (keys[k].video ? "In the video" : "") + (keys[k].n < cb.length ? (keys[k].video ? " · " : "") + "not every garment" : "") + "</small></span></label>"; }).join("") + "</div>";
    var vid = Object.keys(P.keys).some(function (k) { return keys[k] && keys[k].video; });
    if (vid) out += '<p class="hint">You\'ve ticked a photo that\'s in the video, so each listing also gets a new video to approve.</p>';
    out += '<p class="hint">Thumbnails aren\'t on this list: they\'re linked to the colour choices, so use All photos for those.</p>';
  }
  if (P.mode === "add") {
    out += '<p class="hint"><b>First</b>, in Canva, add the new page at the <b>end</b> of the mockup template for each garment you picked. Then name it here.</p>' +
      '<label class="f">Photo name (letters only, e.g. BEACH)<input data-pname="1" maxlength="24" value="' + h(P.name) + '"></label>' +
      '<label class="tick"><input type="checkbox" data-peach="1"' + (P.each ? " checked" : "") + '><span class="lbl">One page for each colour<small>Ticked: you added a Black page and then a Dark Heather page (same order as the thumbnails). Unticked: you added one page that suits every colour.</small></span></label>';
    var over = [];
    cb.forEach(function (c) { var n = photoPlan(pagesFor(c), "BLACK").length + 1; if (n >= 20) over.push(rName(c.split("|")[0]) + " " + gName(c.split("|")[1])); });
    if (over.length) out += '<div class="errbox">Etsy allows 20 photos. These are already full: ' + h(over.join(", ")) + ".</div>";
  }
  return out;
}
function rv(row, k, def) { var d = A.rules[row]; return d && d[k] != null ? d[k] : def; }
function allCombos() { return S0.rules.map(function (r) { var c = ""; RANGES.forEach(function (x) { if (x[2] === r.coll) c = x[0]; }); return c + "|" + r.type; }); }
function sampleGag(code) { var ks = selKeys().filter(function (k) { return k.indexOf(code + "-") === 0; }); var g = ks.length ? gagOf(ks[0].split("|")[0]) : null;
  if (!g) S0.gags.some(function (x) { if (x.id.indexOf(code + "-") === 0) { g = x; return true; } return false; }); return g; }
function crossLine(own) {   // same rule as the listing builder
  var seen = {}, R = []; S0.rules.forEach(function (r) { if (!seen[r.coll]) { seen[r.coll] = 1; R.push(r); } });
  var r0 = R.filter(function (r) { return r.coll === own; })[0]; if (!r0 || !String(r0.lead || "").trim()) return "";
  var n = R.filter(function (r) { return r.coll !== own && String(r.live || "").toUpperCase() === "Y"; }).map(function (r) { var nm = String(r.rname || r.coll).trim(), sid = String(r.section || "").trim(); return sid ? nm + ": https://www.etsy.com/shop/IntrovertHereShop?section_id=" + sid : nm; }); if (!n.length) return "";
  return "\n" + String(r0.lead).trim() + " Have a look at our other ranges:\n" + n.join("\n") + "\n\n"; }
function preview() { var t = $("pvT"), d = $("pvD"); if (!t && !d) return; var p = (A.cur.rule || "").split("|"), r = ruleFor(p[0], p[1]); if (!r) return; var g = sampleGag(p[0]);
  var stem = (single() && A.stem != null) ? A.stem : (g ? g.stem : "Your Title Stem"), title = stem + " " + rv(r.row, "suffix", r.suffix);
  if (t) { var n = title.length; t.innerHTML = '<div class="pvlbl">Etsy title · ' + n + "/140 characters" + (n > 140 ? ' <b style="color:#ff8a85">too long</b>' : "") + '</div><div class="pvbox"><span class="pvseen">' + h(title.slice(0, 45)) + "</span>" + h(title.slice(45)) + '</div><div class="small">Highlighted: roughly what shows in Etsy search on a phone.</div>'; }
  if (d) { var txt = (g ? g.text : "... YOUR GAG TEXT") + "\n\n" + rv(r.row, "intro", r.intro) + "\n" + rv(r.row, "features", r.features) + "\n" + rv(r.row, "audience", r.audience) + "\n" + crossLine(r.coll) + rv(r.row, "closing", r.closing);
    d.innerHTML = '<div class="pvlbl">Etsy description' + (g ? " (shown with " + h(g.id) + ")" : "") + '</div><div class="pvbox pvdesc">' + h(txt) + "</div>"; } }
function details() {
  var one = single(), cb = combos(), out = '<p class="q">Details</p>', any = false;
  if (!cb.length) cb = allCombos();
  function sec(title, body) { any = true; out += '<div class="sec"><h3>' + title + "</h3>" + body + "</div>"; }
  if (A.what.print) sec("Print template", one ? '<label class="f">Gag text (goes on the print)<textarea data-one="text">' + h(A.text != null ? A.text : one.text) + "</textarea></label>" : '<p class="hint">Each listing\'s print is remade from its gag text and the current Canva print template. Nothing to fill in.</p>');
  if (A.what.mockups) sec("Mockup photos", photoChoice(cb));
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
    function fld(k, label, ta) { var v = rv(r.row, k, r[k]); return '<label class="f">' + label + (ta ? '<textarea data-rule="' + r.row + '" data-rk="' + k + '">' + h(v) + "</textarea>" : '<input data-rule="' + r.row + '" data-rk="' + k + '" value="' + h(v) + '">') + "</label>" + (combos().length > 1 ? '<button class="copy" type="button" data-copy="' + k + '">Use this for all ' + cb.length + " picked range/garment combinations</button>" : ""); }
    if (ruleKinds.indexOf("titles") >= 0) b += fld("suffix", "Title ending (after the stem)") + '<div id="pvT" class="pv"></div>';
    if (ruleKinds.indexOf("descriptions") >= 0) b += fld("intro", "Range intro", 1) + fld("features", "Product features", 1) + fld("audience", "Who it's for", 1) + fld("closing", "Closing text (put legal or compliance wording here)", 1) + '<div id="pvD" class="pv"></div>';
    if (ruleKinds.indexOf("tags") >= 0) { var tg = rv(r.row, "tags", r.tags); b += '<label class="f">Product tags (5, 20 characters max)</label><div class="g2">' + [0,1,2,3,4].map(function (i) { return '<input class="inp" maxlength="20" data-rule="' + r.row + '" data-tag="' + i + '" value="' + h(tg[i]) + '">'; }).join("") + "</div>" + (combos().length > 1 ? '<button class="copy" type="button" data-copy="tags">Use these tags for all ' + cb.length + " picked combinations</button>" : ""); }
    if (ruleKinds.indexOf("supplier") >= 0) b += '<p class="hint">Do the swap in Printify first (My products › Replace), then record the new IDs here. Now: ' + h(r.bpName || "blueprint") + " (blueprint " + h(r.bp) + ", provider " + h(r.provider) + ").</p>" + fld("bp", "Printify blueprint ID (garment model)") + fld("provider", "Printify provider ID");
    sec(ruleKinds.length === 1 && ruleKinds[0] === "supplier" ? "Supplier" : "Range text", b);
  }
  if (A.what.colours) {
    var rs = []; cb.forEach(function (c) { var x = c.split("|")[0]; if (rs.indexOf(x) < 0) rs.push(x); });
    var cb2 = pickerFor("col", rs, "Colours for");
    var code = A.cur.col, rules = S0.rules.filter(function (r) { return r.coll === rColl(code); });
    var prof = S0.profiles.filter(function (p) { return rules[0] && p.name === rules[0].profile; })[0];
    var have = A.colours[code] || String(prof ? prof.colours : "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    // Global Fulfillment (15 Nov): Charcoal isn't eligible on sweatshirts/hoodies, so the builder leaves it off them.
    var GFX = { SWEATSHIRT: { Charcoal: 1 }, HOODIE: { Charcoal: 1 } };
    var avail = {}; rules.forEach(function (r) { (S0.colours[r.bp] || []).forEach(function (c) { if (GFX[r.type] && GFX[r.type][c]) return; (avail[c] = avail[c] || []).push(gName(r.type)); }); });
    var list = Object.keys(avail).sort(function (a, b) { return (have.indexOf(b) >= 0) - (have.indexOf(a) >= 0) || a.localeCompare(b); });
    cb2 += '<p class="hint">Ticked colours are on every ' + h(rName(code)) + ' listing. Untick to remove, tick to add. Garments that don\'t offer a colour are skipped. Main colour: ' + h(rules[0] ? rules[0].primary : "") + ".</p><div class=\"sw\">" +
      list.map(function (c) { return '<label><input type="checkbox" data-colour="' + h(c) + '"' + (have.indexOf(c) >= 0 ? " checked" : "") + ">" + h(c) + (avail[c].length < rules.length ? ' <small style="color:var(--muted)">(' + h(avail[c].join(", ")) + ")</small>" : "") + "</label>"; }).join("") + "</div>";
    var SZ = S0.sizes || {};
    cb2 += '<p class="grp" style="margin-top:14px">Sizes</p><table class="ttab"><tr><th>Garment</th><th>Sizes on Etsy</th></tr>' + rules.map(function (r) { var z = SZ[r.bp] || []; var gfz = (r.type === "SWEATSHIRT" || r.type === "HOODIE"); if (gfz) z = z.filter(function (x) { return x !== "4XL" && x !== "5XL"; });
      return "<tr><td>" + h(gName(r.type)) + "</td><td>" + (z.length ? h(z.join(", ")) + (gfz ? ' <span class="small">(3XL in Black only; no Charcoal)</span>' : "") : '<span class="small">Tap Sync to Core to load</span>') + "</td></tr>"; }).join("") +
      '</table><p class="hint">Sizes come with the garment model from Printify, so every listing gets all of them. Bigger sizes (2XL and up) cost more; their extra price is set on the Pricing page. Sweatshirts and hoodies leave out Charcoal and non-Black 3XL so Printify prints UK and EU orders locally (Global Fulfillment).</p>';
    sec("Colours & sizes", cb2);
  }
  if (A.what.mockups) out += '<p class="hint"><a href="/settings?part=pages">Manage which Canva pages become photos ›</a></p>';
  if (A.what.tags) out += '<p class="hint"><a href="/settings?part=tags">Gag categories, tag phrases and seasonal tags ›</a> · <a href="/tags">Approve gag tags ›</a></p>';
  if (A.what.taxonomy) { any = true; out += '<div class="sec"><h3>Category & attributes</h3><table class="ttab"><tr><th>Range and garment</th><th>Etsy category</th><th>Colour attributes</th></tr>' +
    S0.rules.map(function (r) { var c = ""; RANGES.forEach(function (x) { if (x[2] === r.coll) c = x[0]; }); return "<tr><td>" + h(rName(c)) + " · " + h(gName(r.type)) + "</td><td>" + h(TAXO[r.type] || "") + "</td><td>" + h((r.primary || "—") + (r.secondary ? " / " + r.secondary : "")) + "</td></tr>"; }).join("") +
    '</table><p class="hint">Etsy has no Maroon or Navy option, so the nearest Etsy colour is used (Maroon → Red, Navy → Blue). Changing these is rare; ask Claude if you need to.</p></div>'; }
  if (A.what.shipping) { any = true; var slist = (SHIP.list || []).filter(function (x) { return !x.hide; });
    var srows = cb.map(function (c) { var q = c.split("|"), r = ruleFor(q[0], q[1]); if (!r) return ""; var v = String(rv(r.row, "ship", r.ship || SHIP.current));
      return "<tr><td>" + h(rName(q[0])) + " · " + h(gName(q[1])) + '</td><td><select class="inp" style="font:500 14px Montserrat,sans-serif;width:100%" data-rule="' + r.row + '" data-rk="ship">' + slist.map(function (x) { return '<option value="' + h(x.id) + '"' + (String(x.id) === v ? " selected" : "") + ">" + h(x.p || x.t) + "</option>"; }).join("") + "</select></td></tr>"; }).join("");
    out += '<div class="sec"><h3>Shipping</h3><div class="okbox" style="margin-bottom:10px"><b>What this is.</b> A shipping profile is the postage rule Etsy shows a buyer: what they pay for delivery and how long Etsy says it will take. Printify posts the order the same way whichever you pick. <b>Recommended: free postage.</b> Your prices already include it, and Etsy favours free-postage listings in UK and US search.</div>' +
      '<table class="ttab"><tr><th>Range and garment</th><th>Shipping profile</th></tr>' + srows + "</table>" +
      (cb.length > 1 ? '<button class="copy" type="button" data-shipall="1">Use the first one for all ' + cb.length + "</button>" : "") +
      (SHIP.note ? '<div class="warnbox" style="margin-top:10px">' + SHIP.note + "</div>" : "") + "</div>"; }
  if (!any) out += '<p class="hint">Nothing to fill in. Tap Next.</p>';
  $("view").innerHTML = out;
  preview();
}

function saveCore() { var rows = Object.keys(A.rules), i = 0, b = $("go"); b.disabled = true; b.querySelector(".nm").textContent = "Saving…";
  (function next() { if (i >= rows.length) { A.done = { core: rows.length }; render(); return; }
    var body = Object.assign({ kind: "rule", row: rows[i] }, A.rules[rows[i]]); i++;
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't save"); next(); }); })
      .catch(function (e) { A.err = e.message; render(); }); })(); }
function check() {
  var wo = whatOn(), nRule = Object.keys(A.rules).length;
  if (A.done && A.done.core) { $("view").innerHTML = '<div class="okbox"><p class="q">Saved to Core</p><p class="hint" style="color:var(--text)">' + A.done.core + " range and garment setting" + (A.done.core === 1 ? " was" : "s were") + " updated. New listings will use it; live listings were not changed. Undo is in Settings → Recent changes.</p></div>"; return; }
  if (wo.every(function (x) { return VIEW_ONLY[x]; })) { $("view").innerHTML = '<p class="q">Nothing to save</p><p class="hint">Category & attributes is for looking at for now.</p>'; return; }
  var onlyRules = wo.every(function (x) { return RULE_ONLY[x] || VIEW_ONLY[x]; });
  if (onlyRules && (!selKeys().length || A.coreOnly)) {
    $("view").innerHTML = '<p class="q">Save for new listings</p><p class="hint">' + (nRule ? nRule + " range and garment setting" + (nRule === 1 ? "" : "s") + " changed. Saved to Core only: listings built from now on use it; live listings stay as they are." : "You haven't changed anything yet. Go Back to edit.") + "</p>" +
      (A.err ? '<div class="errbox">' + h(A.err) + "</div>" : "") + (selKeys().length ? '<p class="hint"><a href="#" id="toLive">Update the ' + selKeys().length + " ticked live listings too ›</a></p>" : '<p class="hint">To change live listings as well, go Back to step 2 and tick them.</p>') +
      (nRule ? '<div class="lt runb">' + tileB('id="go"', "check", "Save for new listings", "Saved to Core. Undo is in Settings › Recent changes.") + "</div>" : "");
    if ($("go")) $("go").onclick = saveCore; if ($("toLive")) $("toLive").onclick = function (e) { e.preventDefault(); A.coreOnly = false; render(); };
    return; }
  var ks = selKeys(), gs = {}, rs = {}, ts = {};
  ks.forEach(function (k) { var p = k.split("|"); gs[p[0]] = 1; rs[rName(p[0].slice(0, 2))] = 1; ts[gName(p[1])] = 1; });
  var w = WHAT.filter(function (x) { return A.what[x[0]]; }).map(function (x) { return x[0] === "mockups" && A.photo.mode === "one" ? "the " + Object.keys(A.photo.keys).map(function (k) { var p = k.split("#"); return p[0].toLowerCase().replace(/_/g, " ") + (p[1] !== "1" ? " " + p[1] : ""); }).join(" and ") + " photo" + (Object.keys(A.photo.keys).length === 1 ? "" : "s") : x[0] === "mockups" && A.photo.mode === "add" ? "add a new photo (" + (A.photo.name || "?") + ")" : x[1].toLowerCase(); });
  var n = ks.length, ng = Object.keys(gs).length;
  var per = A.what.print ? 2.5 : (A.what.mockups && A.photo.mode !== "all" && !A.what.colours && !A.what.supplier) ? 0.5 : (A.what.mockups || A.what.colours || A.what.supplier) ? 1.5 : 0.5;
  var mins = Math.max(5, Math.round(n * per) + 5);
  if (A.done && A.done.trial) { $("view").innerHTML = '<div class="okbox"><p class="q">Trying it on one listing first</p><p class="hint" style="color:var(--text)">' + h(A.done.first.gag + " " + A.done.first.garment.toLowerCase()) + " starts updating in about 5 minutes. When it's done, a yellow box appears at the top of this page and on the dashboard: check the listing on Etsy, then tap Carry on for the other " + A.done.rest + ", or Stop.</p></div>"; return; }
  if (A.done) { $("view").innerHTML = '<div class="okbox"><p class="q">Saved to Core</p><p class="hint" style="color:var(--text)">Etsy starts updating in about 5 minutes: ' + A.done.listings + " listing" + (A.done.listings === 1 ? "" : "s") + " across " + A.done.gags + " gag" + (A.done.gags === 1 ? "" : "s") + ". Each gag shows as updating in the By listing view until it's finished. You'll get an alert if anything fails.</p></div>"; return; }
  $("view").innerHTML = '<p class="q">Check and confirm</p><p class="sum">Change <b>' + h(w.join(", ")) + "</b> on <b>" + n + " listing" + (n === 1 ? "" : "s") + "</b> (" + ng + " gag" + (ng === 1 ? "" : "s") + ") in " + h(Object.keys(rs).join(", ")) + '.</p><div class="chips">' + Object.keys(ts).map(function (t) { return "<span>" + h(t) + "</span>"; }).join("") + "</div>" +
    '<p class="hint">Saved to Core straight away. Etsy starts updating 5 minutes later and takes roughly ' + (mins >= 90 ? Math.round(mins / 6) / 10 + " hours" : mins + " minutes") + ". Listings stay live throughout." + (A.what.print ? " New videos come to the Approvals page for you to approve; approving re-posts them to social." : "") + "</p>" +
    (A.err ? '<div class="errbox">' + h(A.err) + "</div>" : "") +
    '<div class="lt runb">' + (n > 1 ? tileB('data-run="trial" id="go"', "check", "Try one first", "Recommended. Updates " + h(ks[0].replace("|", " ").toLowerCase()) + " only; you check it on Etsy, then tap Carry on for the other " + (n - 1) + ".") + tileB('data-run="all"', "update", "Do all " + n + " now", "Starts straight away.") : tileB('data-run="all" id="go"', "update", "Update it now", "Starts in about 5 minutes.")) + "</div>";
  if (onlyRules && nRule) { var c2 = document.createElement("p"); c2.className = "hint"; c2.innerHTML = '<a href="#">Or save for new listings only (leave live listings as they are) ›</a>'; c2.firstChild.onclick = function (e) { e.preventDefault(); A.coreOnly = true; render(); }; $("view").appendChild(c2); }
}
function submit() {
  var body = { listings: selKeys().map(function (k) { var p = k.split("|"); return { gag: p[0], garment: p[1] }; }), what: whatOn().filter(function (x) { return !VIEW_ONLY[x]; }), rules: A.rules, colours: {} };
  var one = single();
  if (A.what.mockups && A.photo.mode !== "all") body.photo = A.photo.mode === "one" ? { mode: "one", keys: Object.keys(A.photo.keys) } : A.photo;
  if (A.trial && body.listings.length > 1) body.trial = true;
  if (one && A.stem != null) body.stem = A.stem;
  if (one && A.text != null) body.text = A.text;
  if (A.what.colours) { var rs = {}; combos().forEach(function (c) { rs[c.split("|")[0]] = 1; }); Object.keys(rs).forEach(function (code) { if (A.colours[code]) body.colours[code] = A.colours[code]; else { var rules = S0.rules.filter(function (r) { return r.coll === rColl(code); }); var p = S0.profiles.filter(function (x) { return rules[0] && x.name === rules[0].profile; })[0]; body.colours[code] = String(p ? p.colours : "").split(",").map(function (s) { return s.trim(); }).filter(Boolean); } }); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-run]"), function (b) { b.disabled = true; }); $("go").querySelector(".nm").textContent = "Saving…";
  fetch("/api/amend-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); }).then(function (x) {
    if (x[0]) { A.done = x[1]; A.err = ""; LOG.unshift({ at: Date.now(), what: whatOn(), listings: x[1].listings }); } else A.err = x[1].error || "Something went wrong.";
    render();
  }).catch(function () { A.err = "Couldn't reach the app. Check your connection and try again."; render(); });
}

document.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t) return;
  if (t.id === "readPages") { t.disabled = true; t.textContent = "Reading…"; fetch("/api/amend-refresh", { method: "POST" }); setTimeout(function () { location.reload(); }, 50000); return; }
  if (t.dataset.whatgo) { A.what = {}; A.what[t.dataset.whatgo] = 1; A.sel = {}; A.path = []; A.coreOnly = false; A.step = VIEW_ONLY[t.dataset.whatgo] ? 2 : 1; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.path) { if (t.dataset.path === "new") { A.sel = {}; A.coreOnly = true; A.step = 2; } else { A.path.push(t.dataset.path); A.q = ""; } render(); window.scrollTo(0, 0); return; }
  if (t.dataset.pick) { var pk = t.dataset.pick; A.sel = {}; setMany(A.pickKs.filter(function (k) { return pk === "all" || k.split("|")[1] === pk; }), true); A.coreOnly = false; A.step = 2; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.run) { A.trial = t.dataset.run === "trial"; submit(); return; }
  if (t.dataset.scope) { A.scope = t.dataset.scope; A.drill = []; render(); }
  if (t.dataset.colpick) { var ks = keys(function (k) { return k.split("|")[1] === t.dataset.colpick; }); setMany(ks, st(ks) !== "all"); render(); }
  if (t.dataset.drill) { A.drill.push(t.dataset.drill); A.q = ""; render(); }
  if (t.dataset.crumb) { A.drill = A.drill.slice(0, Number(t.dataset.crumb)); render(); }
  if (t.dataset.shipall) { var sel = document.querySelectorAll('select[data-rk="ship"]'); if (sel.length) { var v0 = sel[0].value; Array.prototype.forEach.call(sel, function (x) { x.value = v0; A.rules[x.dataset.rule] = A.rules[x.dataset.rule] || {}; A.rules[x.dataset.rule].ship = v0; }); t.textContent = "Done ✓"; } }
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
  if (el.dataset.pmode) { A.photo.mode = el.dataset.pmode; render(); }
  if (el.dataset.trialtick) { A.trial = el.checked; }
  if (el.dataset.pkeytick) { if (el.checked) A.photo.keys[el.dataset.pkeytick] = 1; else delete A.photo.keys[el.dataset.pkeytick]; render(); }
  if (el.dataset.peach) { A.photo.each = el.checked; }
  if (el.dataset.colour) { A.colours[A.cur.col] = Array.prototype.map.call(document.querySelectorAll("[data-colour]:checked"), function (i) { return i.dataset.colour; }); }
});
document.addEventListener("input", function (e) {
  var el = e.target;
  if (el.id === "q") { A.q = el.value; var pos = el.selectionStart; render(); var q = $("q"); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (el.dataset.one) A[el.dataset.one] = el.value;
  if (el.dataset.pname) A.photo.name = el.value.toUpperCase().replace(/[^A-Z_ ]/g, "").replace(/ +/g, "_");
  if (el.dataset.rule) { var row = el.dataset.rule; A.rules[row] = A.rules[row] || {};
    if (el.dataset.rk) A.rules[row][el.dataset.rk] = el.value;
    if (el.dataset.tag != null) { var r = S0.rules.filter(function (x) { return String(x.row) === row; })[0]; var tg = (A.rules[row].tags || r.tags).slice(); tg[Number(el.dataset.tag)] = el.value; A.rules[row].tags = tg; } }
  if (el.dataset.rule || el.dataset.one) preview();
});
$("next").onclick = function () { A.step++; A.err = ""; render(); window.scrollTo(0, 0); };
$("back").onclick = function () { if (A.step === 1 && A.path.length) { A.path.pop(); A.q = ""; } else { if (A.step === 2 && (A.coreOnly || VIEW_ONLY[whatOn()[0]])) { A.step = VIEW_ONLY[whatOn()[0]] ? 0 : 1; A.path = []; } else A.step--; } A.err = ""; render(); window.scrollTo(0, 0); };
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
$("restart").onclick = function () {
  var b = $("restart"); b.disabled = true;
  fetch("/api/amend-restart", { method: "POST" }).then(function (r) { if (r.ok) toast("Restarted. The next gag starts in a moment."); else toast("Couldn't restart. Try again in a minute.", true); b.disabled = false; });
};
$("reread").onclick = function () {
  var b = $("reread"); b.disabled = true; b.textContent = "Syncing…";
  var at = S0 ? S0.at : 0;
  fetch("/api/amend-refresh", { method: "POST" }).then(function () {
    (function poll() { fetch("/api/amend-data").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.at !== at) location.reload(); else setTimeout(poll, 5000); }); })();
  });
};
render();
`;
// Cloudflare's bundler adds __name(...) calls inside functions; code sent to the browser via fn.toString() needs this stand-in.
const BROWSER_SHIM = "var __name = window.__name || function (f) { return f; };\n";
const AMEND_VER = (() => { let h = 0; const t = AMEND_JS + photoPlan.toString(); for (let k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) | 0; return (h >>> 0).toString(36); })();

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
<textarea id="sk" rows="2" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" class="keybox" placeholder="sk_test_… (or sk_live_… when going live)"></textarea>
<label style="margin-top:12px;display:block"><b>Printify API token</b> <span class="small">${pState}</span></label>
<textarea id="pt" rows="4" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" class="keybox" placeholder="Printify token (a long code)"></textarea>
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
