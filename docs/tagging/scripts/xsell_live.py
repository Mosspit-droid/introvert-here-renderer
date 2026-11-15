import json, html, re, sys
from etsy import etsy
S = "/tmp/claude-0/-home-user-introvert-here-renderer/769316c1-83de-5c23-bdef-f72138378311/scratchpad/"
am = json.load(open(S + "amend_kv_new.json"))
ranges, seen = [], set()
for r in am["rules"]:
    if r["coll"] not in seen: seen.add(r["coll"]); ranges.append(r)
def block(coll):
    r0 = [r for r in ranges if r["coll"] == coll][0]
    out = [(r["rname"] + ": https://www.etsy.com/shop/IntrovertHereShop?section_id=" + r["section"]) if r.get("section") else r["rname"]
           for r in ranges if r["coll"] != coll and r.get("live") == "Y"]
    return r0["lead"] + " Have a look at our other ranges:\n" + "\n".join(out)
OLD = re.compile(r"(Tap the shop name above for|Have a look at our other ranges:|^Also from us, |^[A-Za-z' ]{3,20}: https://www\.etsy\.com/shop/IntrovertHereShop\?section_id=\d+$)")
def update(lid, coll, ptype, dry=False):
    d = etsy("/listings/%s" % lid, "GET"); d = d if isinstance(d, dict) else json.loads(d)
    if d.get("state") != "active": return "skipped (" + str(d.get("state")) + ")"
    desc = html.unescape(d["description"]); want = block(coll)
    if want in desc: return "already up to date"
    lines = [l for l in desc.split("\n") if not OLD.search(l)]
    desc = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
    rule = [r for r in am["rules"] if r["coll"] == coll and r["type"] == ptype][0]
    first = html.unescape(str(rule["closing"] or "")).strip().split("\n")[0].strip()
    i = desc.find(first) if first else -1
    if i < 0: return "closing text not found - skipped"
    new = desc[:i].rstrip("\n") + "\n\n" + want + "\n\n" + desc[i:]
    if dry: return new
    r = etsy("/shops/65435151/listings/%s" % lid, "PATCH", body={"description": new}); r = r if isinstance(r, dict) else json.loads(r)
    return "updated" if want in html.unescape(r.get("description", "")) else "PATCH failed: " + str(r)[:200]
if __name__ == "__main__":
    print(update(sys.argv[1], sys.argv[2], sys.argv[3], dry="--dry" in sys.argv))
