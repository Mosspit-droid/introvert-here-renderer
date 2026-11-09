const parseTarget = (row) => {
  const target = row && row.__IMTTARGET__;
  if (typeof target === "string") {
    const parsed = {};
    const pairPattern = /(?:\[|\{|,)\s*(\d+)\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match;
    while ((match = pairPattern.exec(target))) {
      try { parsed[match[1]] = JSON.parse(`"${match[2]}"`); } catch (error) { parsed[match[1]] = match[2]; }
    }
    return parsed;
  }
  if (target && typeof target === "object") return target;
  return row;
};

const isBlank = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined";
};

const parseDueDate = (val) => {
  const str = String(val === null || val === undefined ? "" : val).trim();
  if (!str) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(str);
  if (match) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  const num = Number(str);
  if (Number.isFinite(num) && num > 0) {
    const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
    return EXCEL_EPOCH_UTC + Math.round(num) * 86400000;
  }
  return null;
};

const read = (row, index) => {
  const value = parseTarget(row);
  if (Array.isArray(value)) return value[index] ?? "";
  if (value && Object.prototype.hasOwnProperty.call(value, String(index))) return value[String(index)] ?? "";
  return "";
};

const gags = Array.isArray(input.gags) ? input.gags : [];
const registry = Array.isArray(input.registry) ? input.registry : [];
// Tag engine (TAG_SETTINGS TagEngine / DryRun): only gags whose tags are frozen (or were frozen this run) may be built.
const yes = (v) => v === true || String(v) === "true";
const tagMode = yes(input.tagMode), dryRun = yes(input.dryRun), dryId = String(input.dryId || "").trim();
const ready = new Set(JSON.parse(input.ready || "[]")), tagStatus = JSON.parse(input.status || "{}");
const held = [];
const tagsOk = (gagId, what) => { if (!tagMode || ready.has(gagId)) return true; held.push(what + ": " + (tagStatus[gagId] || "no tag row")); return false; };

for (const raw of gags) {
  const row = parseTarget(raw);
  const status = String(read(row, 7) ?? "").trim();
  if (status !== "AMENDMENT_REQUIRED" && status !== "AMENDMENT_REQUIRED_ARTWORK") continue;
  const gagId = String(read(row, 0) ?? "").trim();
  if (!gagId) continue;
  if (dryRun && dryId) continue;
  if (!tagsOk(gagId, gagId + " amendment")) continue;
  return { "80": held.join("\n"), "1": gagId, "60": status === "AMENDMENT_REQUIRED_ARTWORK" ? "ARTWORK" : "AMEND" };
}

const productTypes = [
  { dateCol: 8,  suffix: "T-SHIRT",     type: "T-SHIRT",     display: "T-Shirt",              order: 0 },
  { dateCol: 9,  suffix: "LONG-SLEEVE", type: "LONG-SLEEVE", display: "Long Sleeved T-Shirt",  order: 1 },
  { dateCol: 10, suffix: "SWEATSHIRT",  type: "SWEATSHIRT",  display: "Sweatshirt",            order: 2 },
  { dateCol: 11, suffix: "HOODIE",      type: "HOODIE",      display: "Hoodie",                order: 3 }
];

const existing = new Set();
registry.forEach((item) => {
  const row = parseTarget(item);
  const code = String(row["1"] ?? "").trim();
  if (code) existing.add(code);
});

const now = Date.now();
const candidates = [];

gags.forEach((gag, gagOrder) => {
  const gagId = String(read(gag, 0) ?? "").trim();
  if (!gagId) return;

  productTypes.forEach((product) => {
    const releaseDateStr = String(read(gag, product.dateCol) ?? "").trim();
    const code = `${gagId}-${product.suffix}`;
    if (existing.has(code)) return;
    const forced = dryRun && dryId === gagId;            // dry run: build-check this gag's first unbuilt garment, whatever its date
    if (dryRun && dryId && !forced) return;
    if (!forced) {
      if (isBlank(releaseDateStr)) return;
      const due0 = parseDueDate(releaseDateStr);
      if (due0 === null || due0 > now) return;
      if (!tagsOk(gagId, code)) return;
    }
    const dueTime = forced ? 0 : parseDueDate(releaseDateStr);

    candidates.push({
      dueTime,
      order: gagOrder * 10 + product.order,
      result: {
        "1": code,
        "2": String(read(gag, 2) ?? ""),
        "3": product.type,
        "4": product.display,
        "5": String(read(gag, 6) ?? "").replace(/\s+/g, " ").trim(), // title stem: no line breaks or double spaces (Printify rejects them)
        "6": String(read(gag, 1) ?? ""),
        "29": releaseDateStr,
        "60": "NEW"
      }
    });
  });
});

candidates.sort((a, b) => (a.dueTime - b.dueTime) || (a.order - b.order));

if (!candidates.length) return held.length ? { "80": held.join("\n") } : {};
return { ...candidates[0].result, "80": held.join("\n") };