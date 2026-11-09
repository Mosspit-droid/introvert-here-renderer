import json, sys, datetime
sys.path.insert(0, "/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/tagging")
from core import call
src = open("/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/tagging/build_review.py").read().split("# ---------- write workbook")[0]
ns = {}; exec(src, ns)
pool_rows, SEASONAL, prules, gags_all, backfill, by_lid, code_by_lid = [ns[k] for k in ["pool_rows", "SEASONAL", "prules", "gags", "backfill", "by_lid", "code_by_lid"]]
L = ns["L"]

def col(n):
    s = ""
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

def make_table(sheet, name, header, rows):
    try: call("/worksheets/add", "POST", {"name": sheet})
    except Exception as e:
        if "already exists" not in str(e) and "ItemAlreadyExists" not in str(e): raise
    data = [header] + rows
    addr = f"A1:{col(len(header))}{len(data)}"
    for i in range(0, len(data), 200):  # chunk writes
        chunk = data[i:i + 200]
        call(f"/worksheets/{sheet}/range(address='A{i+1}:{col(len(header))}{i+len(chunk)}')", "PATCH", {"values": chunk})
    t = call("/tables/add", "POST", {"address": f"{sheet}!{addr}", "hasHeaders": True})
    call(f"/tables/{t['id']}", "PATCH", {"name": name})
    print("table", name, addr)

step = sys.argv[1]

if step == "settings":
    vals = [["Setting", "Value", "Notes"],
            ["TagCap", 3, "Max distinct gags per Flavour phrase"],
            ["SeasonDate", "2026-11-09", "Date used for 'in season'. Make writes today's date at each 08:00 run once switched on"],
            ["TagMaxLen", 20, "Etsy help article: up to 20 characters per tag"],
            ["AnchorSlots", 1, "Gag-level anchor slots"],
            ["FlavourSlots", 4, "Gag-level flavour slots (Anchor + Flavour = 5)"],
            ["OverlapAmber", 4, "Advisory band, shared comparable slots"],
            ["OverlapRed", 6, "Advisory band, shared comparable slots"],
            ["DryRun", False, "TRUE = builder stops before Printify/Etsy (used for tests)"],
            ["DryRunGagId", "", "Gag the builder targets in a dry run"],
            ["TagAllowed", "abcdefghijklmnopqrstuvwxyz0123456789 '-", "Allowed characters (stricter than Etsy: accented letters are flagged, not stripped)"],
            ["PlanMonths", 12, "Pool capacity horizon in months"]]
    call("/worksheets/TAG_SETTINGS/range(address='A1:C12')", "PATCH", {"values": vals})
    call("/worksheets/TAG_SETTINGS/range(address='B3')", "PATCH", {"formulas": [["=DATE(2026,11,9)"]]})
    call("/worksheets/TAG_SETTINGS/range(address='B3')", "PATCH", {"numberFormat": [["yyyy-mm-dd"]]})
    for i, (nm) in enumerate(["TagCap", "SeasonDate", "TagMaxLen", "AnchorSlots", "FlavourSlots", "OverlapAmber", "OverlapRed", "DryRun", "DryRunGagId", "TagAllowed", "PlanMonths"], start=2):
        try: call("/names/add", "POST", {"name": nm, "reference": f"=TAG_SETTINGS!$B${i}"})
        except Exception as e: print("name", nm, str(e)[:120])
    print("settings done")

if step == "tables":
    make_table("TAG_POOL", "TAG_POOL", ["POOL", "GROUP", "CLASS", "TAG", "ACTIVE", "KEY", "VALID", "GAG_USES", "CAPPED"],
               [[r["POOL"], r["GROUP"], r["CLASS"], r["TAG"], "Y", "", "", "", ""] for r in pool_rows])
    make_table("SEASON_POOL", "SEASON_POOL", ["TAG", "SEASON", "START_MMDD", "END_MMDD", "ACTIVE", "KEY", "VALID", "IN_SEASON"],
               [[t, s, a, b, "Y", "", "", ""] for t, s, a, b in SEASONAL])
    flat = []
    for r in prules:
        for slot in range(9, 14): flat.append([r["COLLECTION"], r["PRODUCT_TYPE"], slot, "", ""])
    make_table("PRODUCT_TAGS_FLAT", "PRODUCT_TAGS_FLAT", ["COLLECTION", "PRODUCT_TYPE", "SLOT", "KEY", "VALID"], flat)
    # GAG_TAGS: one row per GagID in GAGS order (incl. placeholder rows), backfilled live sets
    s = [i for i, l in enumerate(L) if l.startswith("## Sheet: GAGS ")][0]
    ids = [l.split("\t")[0] for l in L[s + 2:s + 640] if l.split("\t")[0].strip()]
    bf = {b["GAG_ID"]: b for b in backfill}
    hdr = ["GAG_ID", "GAG_TYPE", "COLLECTION", "FIRST_RELEASE", "TITLE_STEM", "STEM_TAG", "TAG13", "STEM_PROBLEM",
           "SEAS_MANUAL_1", "SEAS_MANUAL_2", "SEAS_VALID", "GAG5_SUGGESTED", "SEAS2_SUGGESTED", "APPROVED",
           "STEM_FROZEN", "GAG5_FROZEN", "SEAS2_FROZEN", "FROZEN_AT", "FREEZE_MESSAGE", "PRODUCT_OK", "TAG_STATUS",
           "TAG_NOTES", "COMPARABLE", "COMPARABLE_FROZEN", "OVERLAP_MAX", "OVERLAP_DETAIL", "OVERLAP_BAND", "CONTEXT_INFO"]
    rows = []
    for gid in ids:
        r = [""] * len(hdr); r[0] = gid; r[13] = False
        if gid in bf:
            b = bf[gid]
            r[13] = True; r[14] = b["STEM_FROZEN"]; r[15] = b["GAG5_FROZEN"]; r[16] = b["SEAS2_FROZEN"]
            r[17] = "2026-11-09"; r[18] = "Backfilled from live Etsy tags fetched 8 Nov 2026 (Etsy unchanged)"
        rows.append(r)
    make_table("GAG_TAGS", "GAG_TAGS", hdr, rows)
    # LISTING_TAGS: plain values; backfill the live listings from verified Etsy tags
    lt = []
    for lid, l in sorted(by_lid.items()):
        code = code_by_lid.get(lid)
        if not code: continue
        lt.append([code, code[:8], code[9:], "|" + "|".join(t.lower() for t in l["tags"]) + "|", "LIVE_BACKFILL", "2026-11-08"])
    make_table("LISTING_TAGS", "LISTING_TAGS", ["PRODUCT_CODE", "GAG_ID", "PRODUCT_TYPE", "TAGS_FINAL", "SOURCE", "BUILT_AT"], lt)
    make_table("POOL_CAPACITY", "POOL_CAPACITY", ["GAG_TYPE", "QUEUE_IN_HORIZON", "PHRASES_NEEDED", "FLAVOURS_ACTIVE", "SLOTS_LEFT", "CAPACITY_STATUS"],
               [[t, "", "", "", "", ""] for t in ns["GAG_POOLS"]])
    make_table("SEARCH_LOG", "SEARCH_LOG", ["DATE", "SEARCH_PHRASE", "LISTING", "PAGE", "POSITION", "METHOD", "NOTES"],
               [["2026-11-08", "introvert shirt", "2 listings (which ones not recorded)", 4, "", "Incognito search",
                 "Baseline observation. Treat as a trend, not proof of cause."]])
    print("tables done")
