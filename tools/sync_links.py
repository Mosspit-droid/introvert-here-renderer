"""Copy Core's LINKS table into the approvals app (KV "links"), for the 🔗 Links page.
Run after any change to the LINKS tab:  python3 tools/sync_links.py
Reads Core through Make scenario 7446858 (graph: route); writes KV through the Cloudflare API.
Credentials are injected by the environment ("proxy-injected"); nothing secret is stored here."""
import json, subprocess, time
CORE = "graph:/v1.0/drives/b!ndnYRjl_sE21BKMMz_r6PMo1voTJfixLpQRKuPki-i9EoHVOO8R9TbWVCCuU0ua6/items/01R3POCZGZPJY6UCRSEJD3MBADE4GJ24YQ/workbook"
KV = "https://api.cloudflare.com/client/v4/accounts/82725ced954062d2cb0d30912fbd923c/storage/kv/namespaces/1c5342ad32504af1abd1da52c342f3ce/values/links"

def core(path):
    out = subprocess.run(["curl", "-s", "-X", "POST", "-H", "Authorization: Token proxy-injected", "-H", "Content-Type: application/json",
                          "https://eu1.make.com/api/v2/scenarios/7446858/run", "--data-binary", "@-"],
                         input=json.dumps({"responsive": True, "data": {"path": CORE + path, "method": "GET"}}), capture_output=True, text=True).stdout
    j = json.loads(out)
    o = j.get("outputs", j)
    b = o.get("body", o) if isinstance(o, dict) else o
    if isinstance(b, str):
        b = json.loads(b)
    return b["data"] if isinstance(b, dict) and isinstance(b.get("data"), dict) else b

h = core("/tables/LINKS_TABLE/headerRowRange?$select=values")["values"][0]
v = core("/tables/LINKS_TABLE/dataBodyRange?$select=values")["values"]
i = {k: h.index(k) for k in ("NAME", "ADDRESS", "WHAT IT IS")}
rows = [{"name": str(r[i["NAME"]]).strip(), "address": str(r[i["ADDRESS"]]).strip(), "what": str(r[i["WHAT IT IS"]]).strip()}
        for r in v if str(r[i["NAME"]]).strip() and str(r[i["ADDRESS"]]).startswith("http")]
body = json.dumps({"at": int(time.time() * 1000), "rows": rows})
code = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "PUT", KV, "-H", "Authorization: Bearer proxy-injected",
                       "-H", "Content-Type: application/json", "--data-binary", "@-"], input=body, capture_output=True, text=True).stdout
print(len(rows), "links synced, KV", code)
