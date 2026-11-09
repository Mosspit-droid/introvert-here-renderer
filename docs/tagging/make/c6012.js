// Tags for Printify and Etsy.
// Tag engine off: old method (trimmed, blanks and duplicates removed, max 13).
// Tag engine on (or dry run): exactly the frozen set: 5 gag tags + 2 seasonal + this garment's 5 product tags + stem.
// Every tag is checked against Etsy's rules and all 13 must be different; otherwise ok=false and nothing is built (never cut or padded).
const yes = (v) => v === true || String(v) === "true";
const allowed = "abcdefghijklmnopqrstuvwxyz0123456789 '-";
const err = (t) => !t ? "an empty tag" : t.length > 20 ? `"${t}" is over 20 characters` : (t[0] === "'" || t[0] === "-") ? `"${t}" starts with ' or -` : [...t.toLowerCase()].some((c) => !allowed.includes(c)) ? `"${t}" has a character Etsy rejects` : "";
const code = String(input.code || ""), gagId = code.split("-").slice(0, 2).join("-");
if (!yes(input.tagMode) || String(input.kind || "NEW") !== "NEW") {
  const seen = new Set(); const tags = [];
  for (const t of (input.tags || [])) {
    const v = String(t == null ? "" : t).trim(); const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k); tags.push(v);
  }
  return { tags: tags.slice(0, 13), ok: true, reason: "", summary: "" };
}
const set = (JSON.parse(input.sets || "{}"))[gagId];
if (!set) return { tags: [], ok: false, reason: gagId + " has no approved, frozen tag set", summary: "" };
const prod = (input.prod || []).map((t) => String(t == null ? "" : t).trim()).filter(Boolean);
const tags = [...set.gag5, ...set.seas2, ...prod, set.stem].map((t) => String(t).trim());
const problems = tags.map(err).filter(Boolean);
if (tags.length !== 13) problems.unshift(`${tags.length} tags instead of 13`);
if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length) problems.push("a tag is repeated");
return { tags, ok: problems.length === 0, reason: problems.join("; "),
  summary: `Gag tags: ${set.gag5.join(", ")}\nSeasonal: ${set.seas2.join(", ")}\nProduct: ${prod.join(", ")}\nStem: ${set.stem}` };
