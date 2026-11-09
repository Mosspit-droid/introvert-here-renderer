import fs from "fs";
const D = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const mode = process.argv[3];
const fn = (f) => new Function("input", fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"));
// set mode in settings rows
const s = D.resp.responses.find((x) => x.id === "s").body.values;
const set = (k, v) => { const r = s.find((x) => x[0] === k); r[1] = v; };
set("TagEngine", mode === "on" ? "ON" : "OFF"); set("DryRun", mode === "dry"); set("DryRunGagId", mode === "dry" ? process.argv[4] : "");
const fr = fn("freeze.js")({ read: JSON.stringify(D.resp), today: "2026-11-10", base: D.base });
const oldSrc = JSON.parse(fs.readFileSync(process.argv[5], "utf8"));
const pick = fn("c21.js")({ gags: D.gags, registry: D.reg, tagMode: fr.tagMode, dryRun: fr.dryRun, dryId: fr.dryId, ready: fr.ready, status: fr.status });
const pickOld = new Function("input", oldSrc)({ gags: D.gags, registry: D.reg });
const code = pick["1"] || "";
const coll = String(pick["2"] || ""), type = String(pick["3"] || "");
const H = D.pr[0], rule = D.pr.find((r) => r[H.indexOf("COLLECTION")] === coll && r[H.indexOf("PRODUCT_TYPE")] === type) || [];
const prod = ["PRODUCT_TAG_09","PRODUCT_TAG_10","PRODUCT_TAG_11","PRODUCT_TAG_12","PRODUCT_TAG_13"].map((n) => rule[H.indexOf(n)]);
const t = fn("c6012.js")({ tags: [], tagMode: fr.tagMode, kind: pick["60"], code, sets: fr.sets, prod });
const batch = JSON.parse(fr.batch).requests;
console.log(JSON.stringify({ mode, picked: code, oldPicked: pickOld["1"] || "", same: (pick["1"] || "") === (pickOld["1"] || ""), held: String(pick["80"] || "").split("\n").filter(Boolean).slice(0, 6), heldCount: String(pick["80"] || "").split("\n").filter(Boolean).length,
  ok: t.ok, reason: t.reason, tags: t.tags, writes: batch.map((r) => r.method + " " + r.url.split("/workbook")[1]).slice(0, 8), report: JSON.parse(fr.report).map((x) => x.id + ":" + x.result) }, null, 1));
