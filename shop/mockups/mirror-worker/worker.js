// Copies Printify mockup images into KV so they can be processed offline (the build sandbox can't reach Printify's image host).
// Reads the list from KV "mirror:list" ([{k,u}]) and fetches up to 20 missing images per run. Safe to re-run; skips done ones.
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
};
async function run(env) {
  const list = (await env.PENDING.get("mirror:list", "json")) || [];
  const done = new Set((await env.PENDING.get("mirror:done", "json")) || []);
  let n = 0, errs = [];
  for (const it of list) {
    if (done.has(it.k)) continue;
    if (n++ >= 20) break;
    try {
      const r = await fetch(it.u);
      if (!r.ok) { errs.push(it.k + " " + r.status); continue; }
      await env.PENDING.put(it.k, await r.arrayBuffer());
      done.add(it.k);
    } catch (e) { errs.push(it.k + " " + e.message); }
  }
  await env.PENDING.put("mirror:done", JSON.stringify([...done]));
  await env.PENDING.put("mirror:status", JSON.stringify({ at: Date.now(), done: done.size, total: list.length, errs }));
}
