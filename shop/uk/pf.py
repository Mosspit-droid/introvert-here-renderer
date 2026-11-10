import json, urllib.request, ssl
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request("https://api.printify.com/v1/" + path, data=data, method=method,
        headers={"Authorization": "Bearer proxy-injected", "User-Agent": "shop-tools", "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(r, context=ctx, timeout=120))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:800]}")
