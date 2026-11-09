import json
D="/tmp/claude-0/-home-user-introvert-here-renderer/769316c1-83de-5c23-bdef-f72138378311/scratchpad/pfp_worker"
html=open("/home/user/introvert-here-renderer/tools/phrase-field-planner.html").read()
js=r'''// Serves the Phrase Field Planner page and keeps an anonymous daily visit count.
// Source page: tools/phrase-field-planner.html in introvert-here-renderer.
// Counted per page load, on the server: date, the referring website (host only), country, phone or computer.
// No cookies, no IP addresses, nothing the visitor types. Numbers show on the approvals app's Stats page.
const HTML = __HTML__;
const KEY = "planner-stats";
const KEEP_DAYS = 120;
const WRITE_CAP = 300;   // KV writes per day before sampling 1 in 10 (the KV namespace is shared with the approvals app)

async function count(request, env) {
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless/i.test(ua)) return;
  const st = (await env.STATS.get(KEY, "json")) || { days: {} };
  const day = new Date().toISOString().slice(0, 10);
  const d = st.days[day] || (st.days[day] = { v: 0, w: 0, phone: 0, ref: {}, c: {} });
  let weight = 1;
  if (d.w >= WRITE_CAP) { if (Math.random() >= 0.1) return; weight = 10; }
  d.w += 1; d.v += weight;
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) d.phone += weight;
  let ref = "direct";
  try { const h = new URL(request.headers.get("Referer") || "").hostname.replace(/^www\./, ""); if (h && h !== new URL(request.url).hostname) ref = h; } catch (e) {}
  d.ref[ref] = (d.ref[ref] || 0) + weight;
  const c = (request.cf && request.cf.country) || "??";
  d.c[c] = (d.c[c] || 0) + weight;
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(st.days)) if (k < cutoff) delete st.days[k];
  await env.STATS.put(KEY, JSON.stringify(st));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("Not found", { status: 404 });
    if (request.method === "GET") ctx.waitUntil(count(request, env).catch(() => {}));
    return new Response(HTML, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    } });
  },
};
'''.replace("__HTML__", json.dumps(html))
open(D+"/worker.js","w").write(js)
open(D+"/wrangler.toml","w").write('name = "tag-checker"\nmain = "worker.js"\ncompatibility_date = "2024-09-01"\nworkers_dev = true\n\n[[kv_namespaces]]\nbinding = "STATS"\nid = "1c5342ad32504af1abd1da52c342f3ce"\n')
print("ok")
