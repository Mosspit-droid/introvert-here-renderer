import json, html, sys
from etsy import etsy
S = "/tmp/claude-0/-home-user-introvert-here-renderer/769316c1-83de-5c23-bdef-f72138378311/scratchpad/"
am = json.load(open(S + "amend_kv_new.json"))
ranges, seen = [], set()
for r in am["rules"]:
    if r["coll"] not in seen: seen.add(r["coll"]); ranges.append(r)
def line(coll):
    r0 = [r for r in ranges if r["coll"] == coll][0]
    names = [r["rname"] for r in ranges if r["coll"] != coll and r.get("live") == "Y"]
    lst = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    return r0["lead"] + " Tap the shop name above for " + lst + ("" if lst[-1] in ".!?" else ".")
def update(lid, coll, ptype, dry=False):
    d = etsy("/listings/%s" % lid, "GET"); d = d if isinstance(d, dict) else json.loads(d)
    desc = html.unescape(d["description"])
    import re
    want = line(coll)
    if want in desc and ("\n\n" + want + "\n\n") in desc: return "already up to date"
    desc = re.sub(r"\n*[^\n]*Tap the shop name above for[^\n]*\n*", "\n", desc)   # take out an older version of the line
    rule = [r for r in am["rules"] if r["coll"] == coll and r["type"] == ptype][0]
    closing = html.unescape(str(rule["closing"] or "")).strip()
    first = closing.split("\n")[0].strip()
    i = desc.find(first) if first else -1
    if i < 0: return "closing text not found - skipped"
    head = desc[:i].rstrip("\n")
    new = head + "\n\n" + want + "\n\n" + desc[i:]
    if dry: return new
    r = etsy("/shops/65435151/listings/%s" % lid, "PATCH", body={"description": new})
    r = r if isinstance(r, dict) else json.loads(r)
    return "updated" if "Tap the shop name above" in html.unescape(r.get("description", "")) else "PATCH failed: " + str(r)[:200]
if __name__ == "__main__":
    lid, coll, ptype = sys.argv[1], sys.argv[2], sys.argv[3]
    print(update(lid, coll, ptype, dry="--dry" in sys.argv))
