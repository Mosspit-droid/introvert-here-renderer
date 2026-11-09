import json, re, sys, collections, datetime
sys.path.insert(0, "/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/tagging")
from pools import GAG_POOLS, FALLBACK, SEASONAL
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter

CORE = "/root/.claude/projects/-home-user-introvert-here-renderer/769316c1-83de-5c23-bdef-f72138378311/tool-results/mcp-Microsoft_365-read_resource-1794168400447.txt"
LIVE = "/root/.claude/projects/-home-user-introvert-here-renderer/769316c1-83de-5c23-bdef-f72138378311/tool-results/mcp-Make-s7705176_introvert_here_tool_etsy_lookup_update-1794174500782.txt"
OUT = "/home/user/introvert-here-renderer/docs/tagging/TAG_POOLS_REVIEW.xlsx"
MAXLEN = 20
ALLOWED = set("abcdefghijklmnopqrstuvwxyz0123456789 '-")
SEASON_DATE = datetime.date(2026, 11, 9)

def check(tag):
    """Etsy rule check (help article): <=20 chars; letters, numbers, spaces; ' and - inside words only."""
    t = tag.strip().lower(); probs = []
    if not t: probs.append("blank")
    if len(t) > MAXLEN: probs.append(f"{len(t)} chars")
    bad = sorted(set(c for c in t if c not in ALLOWED))
    if bad: probs.append("characters " + " ".join(repr(c) for c in bad))
    if t[:1] in ("'", "-"): probs.append("starts with ' or -")
    if "  " in t: probs.append("double space")
    return probs

# ---------- read Core ----------
L = open(CORE).read().split("\n")
def sheet(name):
    s = [i for i, l in enumerate(L) if l.startswith("## Sheet: " + name + " ")][0]
    e = next(i for i in range(s + 1, len(L)) if L[i].startswith("## Sheet:") or L[i].startswith("Formulas:"))
    hdr = L[s + 1].split("\t")
    rows = [dict(zip(hdr, l.split("\t"))) for l in L[s + 2:e] if l.strip()]
    return hdr, rows
_, gags = sheet("GAGS")
gags = [g for g in gags if g.get("GAG_TEXT", "").strip()]
_, prules = sheet("PRODUCT_RULES")
_, reg = sheet("LISTING_REGISTRY")
PT = ["PRODUCT_TAG_09", "PRODUCT_TAG_10", "PRODUCT_TAG_11", "PRODUCT_TAG_12", "PRODUCT_TAG_13"]
product_tags = {(r["COLLECTION"], r["PRODUCT_TYPE"]): [r[c].strip().lower() for c in PT] for r in prules}
coll_product_tags = collections.defaultdict(set)
for (c, _t), tags in product_tags.items(): coll_product_tags[c].update(tags)

# ---------- pool table rows ----------
pool_rows = []
for gtype, d in GAG_POOLS.items():
    for cls, label in (("A", "Anchor"), ("F", "Flavour")):
        for t in d[cls]: pool_rows.append(dict(POOL=gtype, GROUP="GAG", CLASS=label, TAG=t))
for p, tags in FALLBACK.items():
    for t in tags: pool_rows.append(dict(POOL=p, GROUP="FALLBACK", CLASS="Anchor", TAG=t))
for r in pool_rows:
    r["PROBLEMS"] = "; ".join(check(r["TAG"]))
    r["VALID"] = not r["PROBLEMS"]
dup_in_pool = collections.Counter((r["POOL"], r["TAG"].lower()) for r in pool_rows)
for r in pool_rows:
    if dup_in_pool[(r["POOL"], r["TAG"].lower())] > 1: r["PROBLEMS"] += "; repeated in same pool"; r["VALID"] = False
    clash = [c for c, s in coll_product_tags.items() if r["TAG"].lower() in s]
    r["NOTE"] = ("Same as a product tag in " + ", ".join(clash) + " (skipped automatically there)") if clash else ""
season_rows = []
for t, s, a, b in SEASONAL:
    season_rows.append(dict(TAG=t, SEASON=s, START_MMDD=a, END_MMDD=b, PROBLEMS="; ".join(check(t))))

# ---------- product tags check ----------
prod_check = []
for (c, ty), tags in product_tags.items():
    probs = []
    for t in tags:
        p = check(t)
        if p: probs.append(f"'{t}': " + ", ".join(p))
    if len(set(tags)) < len(tags): probs.append("repeated tag")
    prod_check.append(dict(COLLECTION=c, PRODUCT_TYPE=ty, TAGS=" | ".join(tags), PROBLEMS="; ".join(probs)))

# ---------- live listings (verified from Etsy, fetched 8 Nov 21:47 UTC) ----------
t = open(LIVE).read(); d = json.loads(t[t.index("{"):])
data = d["result"]["outputs"]["data"] if "result" in d else d.get("data", d)
by_lid = {str(l["listing_id"]): l for l in data["results"]}
code_by_lid = {r["ETSY_LISTING_ID"]: r["PRODUCT_CODE"] for r in reg}
gag_by_id = {g["GAG_ID"]: g for g in gags}
SEAS_LIVE = {"christmas present", "holiday gift"}
live_by_gag = collections.defaultdict(list)
for lid, l in by_lid.items():
    code = code_by_lid.get(lid)
    if not code: continue
    live_by_gag[code[:8]].append((code, [x.lower() for x in l["tags"]]))
backfill = []
for gid, items in sorted(live_by_gag.items()):
    g = gag_by_id[gid]; coll = g["COLLECTION"]
    stems = collections.Counter(tags[0] for _, tags in items)
    stem = stems.most_common(1)[0][0]
    per = []
    for code, tags in items:
        ptype = code[9:]
        rest = [x for x in tags if x not in product_tags[(coll, ptype)] and x not in SEAS_LIVE and x != stem]
        per.append(rest)
    common = [x for x in per[0] if all(x in p for p in per)]
    seas = [x for x in ["christmas present", "holiday gift"] if all(x in tags for _, tags in items)]
    backfill.append(dict(GAG_ID=gid, GAG_TYPE=g["GAG_CATEGORY"], COLLECTION=coll, LIVE_LISTINGS=len(items),
                         STEM_FROZEN=stem, GAG5_FROZEN="|" + "|".join(common) + "|", SEAS2_FROZEN="|" + "|".join(seas) + "|",
                         GAG_LEVEL_COUNT=len(common),
                         NOTE=("Only %d gag-level tags live (duplicates were dropped at build)" % len(common)) if len(common) < 5 else ""))

# ledger: distinct gags using each Flavour phrase (from backfilled frozen sets)
frozen_sets = {b["GAG_ID"]: set(b["GAG5_FROZEN"].strip("|").split("|")) for b in backfill}
uses = collections.Counter()
for s in frozen_sets.values():
    for x in s: uses[x] += 1
CAP = 3
for r in pool_rows:
    r["GAG_USES"] = uses.get(r["TAG"].lower(), 0) if r["CLASS"] == "Flavour" else ""
    r["CAPPED"] = (r["CLASS"] == "Flavour" and r["GAG_USES"] >= CAP)

# ---------- overlap baseline on live gags (comparable slots: gag-level + seasonal + stem) ----------
def comparable(b):
    return set(b["GAG5_FROZEN"].strip("|").split("|")) | set(b["SEAS2_FROZEN"].strip("|").split("|")) | {b["STEM_FROZEN"]}
live_overlap = []
for a in backfill:
    ca = comparable(a) - {""}; best = (0, "", [])
    for b in backfill:
        if b["GAG_ID"] == a["GAG_ID"]: continue
        sh = sorted(ca & (comparable(b) - {""}))
        if len(sh) > best[0]: best = (len(sh), b["GAG_ID"], sh)
    live_overlap.append(dict(GAG_ID=a["GAG_ID"], GAG_TYPE=a["GAG_TYPE"], SLOTS=len(ca), MAX_SHARED=best[0],
                             WITH=best[1], SHARED=", ".join(best[2])))

# ---------- mirror of the Excel suggestion formulas (for preview + later test comparison) ----------
def in_window(s, e, d):
    md = d.month * 100 + d.day
    return s <= md <= e if s <= e else (md >= s or md <= e)
season_ok = {t: in_window(a, b, SEASON_DATE) for t, s, a, b in SEASONAL}
def rot(lst, seed):
    n = len(lst)
    return [lst[(seed + i) % n] for i in range(n)] if n else []
def seed_of(gid, mult=7, add=0):
    return int(gid[3:8]) * mult + ord(gid[0]) + ord(gid[1]) + add
def suggest(g):
    gid, typ, coll = g["GAG_ID"], g["GAG_CATEGORY"], g["COLLECTION"]
    stem = (g["TITLE_STEM"] or "").strip().lower()
    manual = [x.strip().lower() for x in (g["CUSTOM_TAG_12"], g["CUSTOM_TAG_13"])]
    seas_valid = []
    for m in manual:
        if m and m in season_ok and season_ok[m] and not check(m) and m not in seas_valid: seas_valid.append(m)
    excl = {stem} | coll_product_tags[coll] | set(seas_valid)
    rows = [r for r in pool_rows if r["POOL"] == typ and r["GROUP"] == "GAG" and r["VALID"] and r["TAG"].lower() not in excl]
    an = rot([r["TAG"].lower() for r in rows if r["CLASS"] == "Anchor"], seed_of(gid))
    fl = rot([r["TAG"].lower() for r in rows if r["CLASS"] == "Flavour" and not r["CAPPED"]], seed_of(gid))
    fc = sorted([r for r in rows if r["CLASS"] == "Flavour" and r["CAPPED"]], key=lambda r: r["GAG_USES"])
    cand = fl[:4] + an[:1] + fl[4:] + an[1:] + [r["TAG"].lower() for r in fc]
    pick = []
    for c in cand:
        if c and c not in pick: pick.append(c)
    gag5 = pick[:5]
    capped_used = [x for x in gag5 if x in {r["TAG"].lower() for r in fc}]
    fb_rows = [r for r in pool_rows if r["GROUP"] == "FALLBACK" and r["POOL"] in ("ALL", coll) and r["VALID"]]
    fb = rot([r["TAG"].lower() for r in fb_rows if r["TAG"].lower() not in excl | set(gag5)], seed_of(gid, 11, 3))
    seas2 = list(seas_valid)
    for x in fb:
        if len(seas2) >= 2: break
        if x not in seas2: seas2.append(x)
    return stem, gag5, seas2, capped_used
stem_status = {}
for g in gags:
    p = check(g["TITLE_STEM"] or "")
    words = len((g["TITLE_STEM"] or "").split())
    if words > 3: p.append(f"{words} words")
    stem_status[g["GAG_ID"]] = p
upcoming = [g for g in gags if not g["STATUS"].startswith("LIVE")]
upcoming.sort(key=lambda g: min([x for x in (g["T-SHIRT"], g["LONG-SLEEVE"], g["SWEATSHIRT"], g["HOODIE"]) if x] or ["9999"]))
preview = []
for g in upcoming[:40]:
    stem, gag5, seas2, cu = suggest(g)
    status = "READY once approved"
    if stem_status[g["GAG_ID"]]: status = "HOLD – stem: " + ", ".join(stem_status[g["GAG_ID"]])
    elif len(gag5) < 5: status = f"HOLD – only {len(gag5)} gag-level tags"
    elif len(seas2) < 2: status = f"HOLD – only {len(seas2)} seasonal/fallback tags"
    preview.append(dict(GAG_ID=g["GAG_ID"], GAG_TYPE=g["GAG_CATEGORY"], COLLECTION=g["COLLECTION"],
                        FIRST_RELEASE=min([x for x in (g["T-SHIRT"], g["LONG-SLEEVE"], g["SWEATSHIRT"], g["HOODIE"]) if x] or [""]),
                        TAG13_STEM=stem, GAG_LEVEL_5=" | ".join(gag5), SEASONAL_2=" | ".join(seas2),
                        WARNINGS=("Uses capped phrase (least-used): " + ", ".join(cu)) if cu else "", STATUS=status))
# overlap among previewed suggestions (comparable slots)
sets = {p["GAG_ID"]: set(p["GAG_LEVEL_5"].split(" | ")) | set(p["SEASONAL_2"].split(" | ")) | {p["TAG13_STEM"]} for p in preview}
for p in preview:
    best = (0, "", [])
    for q, s in sets.items():
        if q == p["GAG_ID"]: continue
        sh = sorted(sets[p["GAG_ID"]] & s)
        if len(sh) > best[0]: best = (len(sh), q, sh)
    p["MAX_SHARED_vs_PREVIEW"] = best[0]; p["WITH"] = best[1]; p["SHARED"] = ", ".join(best[2])

# ---------- stems needing a shortener (future gags only) ----------
FILLER = {"of", "a", "an", "the", "to", "you", "your", "i", "me", "my", "is", "it", "be", "and", "for", "in", "on", "at", "that", "this", "are", "am", "with"}
def shorten(stem):
    w = [x for x in re.sub(r"[^A-Za-z0-9 '\-]", "", stem.replace("’", "'")).split() if x.lower() not in FILLER]
    for n in (3, 2, 1):
        cand = " ".join(w[:n]) if len(w) >= n else ""
        if cand and len(cand) <= MAXLEN: return cand.lower()
    return ""
stem_rows = []
for g in gags:
    p = stem_status[g["GAG_ID"]]
    if not p: continue
    live = g["STATUS"].startswith("LIVE")
    stem_rows.append(dict(GAG_ID=g["GAG_ID"], STATUS=g["STATUS"], TITLE_STEM=g["TITLE_STEM"], PROBLEMS=", ".join(p),
                          LIVE="yes – leave as is" if live else "no",
                          SUGGESTED_STEM_TAG="" if live else shorten(g["TITLE_STEM"]),
                          GAG_TEXT=g["GAG_TEXT"][:120]))

# ---------- capacity at cap ----------
gag_counts = collections.Counter(g["GAG_CATEGORY"] for g in gags)
live_counts = collections.Counter(b["GAG_TYPE"] for b in backfill)
cap_rows = []
for typ, d in GAG_POOLS.items():
    nf = len(d["F"]); cap_rows.append(dict(GAG_TYPE=typ, GAGS_IN_CORE=gag_counts.get(typ, 0), LIVE_GAGS=live_counts.get(typ, 0),
        ANCHORS=len(d["A"]), FLAVOURS=nf, GAGS_SUPPORTED_AT_CAP_3=nf * CAP // 3,
        NOTE=("Pool runs out of uncapped flavour after ~%d gags – then least-used phrases are reused with a warning" % (nf * CAP // 3))
             if gag_counts.get(typ, 0) > nf * CAP // 3 else "OK"))

# ---------- write workbook ----------
wb = Workbook()
RED = PatternFill("solid", fgColor="F4C7C3"); AMB = PatternFill("solid", fgColor="FCE8B2"); GRN = PatternFill("solid", fgColor="D9EAD3")
HDR = PatternFill("solid", fgColor="2B2B2B")
def sheet_out(ws, rows, cols, widths=None, flag=None):
    for i, c in enumerate(cols, 1):
        ws.cell(1, i, c).font = Font(bold=True, color="FFFFFF"); ws.cell(1, i).fill = HDR
    for r_i, r in enumerate(rows, 2):
        for c_i, c in enumerate(cols, 1):
            v = r.get(c, ""); ws.cell(r_i, c_i, v if not isinstance(v, bool) else ("TRUE" if v else "FALSE"))
        if flag:
            f = flag(r)
            if f:
                for c_i in range(1, len(cols) + 1): ws.cell(r_i, c_i).fill = f
    for i, c in enumerate(cols, 1):
        ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(c, max(12, min(60, len(c) + 4)))
    ws.freeze_panes = "A2"
ws = wb.active; ws.title = "README"
readme = [
    "Introvert Here – tag pools for review (draft, 9 Nov 2026). Nothing in Core or on Etsy has been changed.",
    "",
    "TAG_POOL: gag-level phrases per gag type (Anchor = broad, never capped; Flavour = specific, capped at 3 gags) and the non-seasonal FALLBACK phrases.",
    "SEASON_POOL: the approved phrases your CUSTOM_TAG_12/13 columns may use, with the date window each is in season.",
    "PRODUCT_TAGS: your existing 5 product-type tags per collection and garment, checked against Etsy's rules (unchanged).",
    "STEM_REVIEW: title stems that are too long or contain characters Etsy rejects. Suggested shorteners are drafts for you to approve or rewrite.",
    "LIVE_BACKFILL: the tags actually live on Etsy now, split into slots. These become the frozen sets and the starting ledger (Etsy is not touched).",
    "OVERLAP_LIVE: how much live gags overlap today on the comparable slots (gag-level + seasonal + stem). Used to calibrate the warning bands.",
    "PREVIEW: what the new formulas would suggest for the next 40 gags due, using these pools (a Python mirror of the Excel formulas).",
    "CAPACITY: how many gags each pool can serve before every flavour phrase reaches the cap.",
    "",
    "Etsy rules used (help.etsy.com 'How to Use Tags to Get Found in Search'): up to 13 tags, up to 20 characters each, letters/numbers/spaces, ' and - allowed inside words but not at the start.",
    "Red rows = fails a rule or needs your decision.",
]
for i, line in enumerate(readme, 1): ws.cell(i, 1, line)
ws.column_dimensions["A"].width = 150
sheet_out(wb.create_sheet("TAG_POOL"), pool_rows, ["POOL", "GROUP", "CLASS", "TAG", "VALID", "PROBLEMS", "GAG_USES", "CAPPED", "NOTE"],
          {"POOL": 26, "TAG": 24, "PROBLEMS": 30, "NOTE": 60}, lambda r: RED if not r["VALID"] else None)
sheet_out(wb.create_sheet("SEASON_POOL"), season_rows, ["TAG", "SEASON", "START_MMDD", "END_MMDD", "PROBLEMS"],
          {"TAG": 24, "SEASON": 18}, lambda r: RED if r["PROBLEMS"] else None)
sheet_out(wb.create_sheet("PRODUCT_TAGS"), prod_check, ["COLLECTION", "PRODUCT_TYPE", "TAGS", "PROBLEMS"],
          {"COLLECTION": 18, "TAGS": 90, "PROBLEMS": 40}, lambda r: RED if r["PROBLEMS"] else None)
sheet_out(wb.create_sheet("STEM_REVIEW"), stem_rows, ["GAG_ID", "STATUS", "TITLE_STEM", "PROBLEMS", "LIVE", "SUGGESTED_STEM_TAG", "GAG_TEXT"],
          {"TITLE_STEM": 28, "PROBLEMS": 26, "LIVE": 18, "SUGGESTED_STEM_TAG": 24, "GAG_TEXT": 90}, lambda r: None if r["LIVE"].startswith("yes") else RED)
sheet_out(wb.create_sheet("LIVE_BACKFILL"), backfill, ["GAG_ID", "GAG_TYPE", "COLLECTION", "LIVE_LISTINGS", "STEM_FROZEN", "GAG5_FROZEN", "SEAS2_FROZEN", "GAG_LEVEL_COUNT", "NOTE"],
          {"GAG5_FROZEN": 90, "SEAS2_FROZEN": 34, "NOTE": 50, "STEM_FROZEN": 22}, lambda r: AMB if r["NOTE"] else None)
def band(n): return RED if n >= 5 else AMB if n >= 3 else GRN
sheet_out(wb.create_sheet("OVERLAP_LIVE"), live_overlap, ["GAG_ID", "GAG_TYPE", "SLOTS", "MAX_SHARED", "WITH", "SHARED"],
          {"SHARED": 100}, lambda r: band(r["MAX_SHARED"]))
sheet_out(wb.create_sheet("PREVIEW"), preview, ["GAG_ID", "GAG_TYPE", "COLLECTION", "FIRST_RELEASE", "TAG13_STEM", "GAG_LEVEL_5", "SEASONAL_2", "WARNINGS", "STATUS", "MAX_SHARED_vs_PREVIEW", "WITH", "SHARED"],
          {"GAG_LEVEL_5": 90, "SEASONAL_2": 40, "STATUS": 40, "TAG13_STEM": 22, "SHARED": 60, "WARNINGS": 40},
          lambda r: RED if r["STATUS"].startswith("HOLD") else None)
sheet_out(wb.create_sheet("CAPACITY"), cap_rows, ["GAG_TYPE", "GAGS_IN_CORE", "LIVE_GAGS", "ANCHORS", "FLAVOURS", "GAGS_SUPPORTED_AT_CAP_3", "NOTE"],
          {"GAG_TYPE": 26, "NOTE": 90}, lambda r: AMB if r["NOTE"] != "OK" else None)
wb.save(OUT)

summary = dict(
    pool_rows=len(pool_rows), invalid_pool=[(r["POOL"], r["TAG"], r["PROBLEMS"]) for r in pool_rows if not r["VALID"]],
    clashes=[(r["POOL"], r["TAG"], r["NOTE"]) for r in pool_rows if r["NOTE"]][:12],
    season_problems=[r for r in season_rows if r["PROBLEMS"]],
    product_problems=[r for r in prod_check if r["PROBLEMS"]],
    stems_flagged=len(stem_rows), stems_future=sum(1 for r in stem_rows if r["LIVE"] == "no"),
    live_gags=len(backfill), short_live=[(b["GAG_ID"], b["GAG_LEVEL_COUNT"]) for b in backfill if b["GAG_LEVEL_COUNT"] < 5],
    live_overlap=collections.Counter(r["MAX_SHARED"] for r in live_overlap),
    preview_status=collections.Counter(p["STATUS"].split(":")[0] for p in preview),
    preview_overlap=collections.Counter(p["MAX_SHARED_vs_PREVIEW"] for p in preview),
    capped_now=[(r["TAG"], r["GAG_USES"]) for r in pool_rows if r["CAPPED"]],
)
print(json.dumps(summary, indent=1, default=str))
json.dump(dict(preview=preview, backfill=backfill), open("/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/tagging/mirror.json", "w"), indent=1)
