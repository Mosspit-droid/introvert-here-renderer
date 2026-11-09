import fs from "fs";
const D = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fn = (src) => new Function("input", src);
const oldSrc = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const newSrc = fs.readFileSync(new URL("./c21.js", import.meta.url), "utf8");
const frSrc = fs.readFileSync(new URL("./freeze.js", import.meta.url), "utf8");
const s = D.resp.responses.find((x) => x.id === "s").body.values;
const realNow = Date.now; let diff = 0, onPicks = [];
for (let d = 1; d <= 60; d++) {
  const t = Date.UTC(2026, 10, 9 + d, 8, 0); Date.now = () => t;
  s.find((x) => x[0] === "TagEngine")[1] = "OFF"; s.find((x) => x[0] === "DryRun")[1] = false;
  const fr = fn(frSrc)({ read: JSON.stringify(D.resp), today: "2026-11-10", base: D.base });
  const a = fn(oldSrc)({ gags: D.gags, registry: D.reg })["1"] || "", b = fn(newSrc)({ gags: D.gags, registry: D.reg, ...fr })["1"] || "";
  if (a !== b) { diff++; console.log("DIFF day", d, a, b); }
  s.find((x) => x[0] === "TagEngine")[1] = "ON";
  const fo = fn(frSrc)({ read: JSON.stringify(D.resp), today: "2026-11-10", base: D.base });
  const p = fn(newSrc)({ gags: D.gags, registry: D.reg, ...fo });
  if (d <= 6 || (p["80"] || "")) onPicks.push(`day ${d}: old=${a || "-"} on=${p["1"] || "-"}${p["80"] ? " held=" + p["80"].split("\n").length : ""}`);
}
console.log("OFF-mode differences over 60 days:", diff); console.log(onPicks.slice(0, 12).join("\n"));
