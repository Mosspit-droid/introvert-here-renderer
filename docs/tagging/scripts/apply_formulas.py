import sys, json
from core import call
from formulas import F, ORDER, br
rows = {"PRODUCT_TAGS_FLAT": 61, "SEASON_POOL": 15, "TAG_POOL": 246, "GAG_TAGS": 638, "POOL_CAPACITY": 14}
only = sys.argv[1:] or ORDER
for t in only:
    for c, f in F[t]:
        f = br(f)
        try:
            call(f"/worksheets/{t}/range(address='{c}2')", "PATCH", {"formulas": [[f]]})
        except Exception as e:
            print("ERR", t, c, str(e)[150:330]); continue
        last = rows[t]
        r = call(f"/worksheets/{t}/range(address='{c}{last}')?$select=formulas,values")
        filled = str(r["formulas"][0][0]).startswith("=")
        if not filled:
            # fill the column explicitly in chunks
            for s in range(3, last + 1, 150):
                e = min(last, s + 149)
                call(f"/worksheets/{t}/range(address='{c}{s}:{c}{e}')", "PATCH", {"formulas": [[f]] * (e - s + 1)})
        r2 = call(f"/worksheets/{t}/range(address='{c}2:{c}4')?$select=values")
        print("ok", t, c, "autofill" if filled else "filled", [v[0] if not isinstance(v[0], str) else v[0][:50] for v in r2["values"]])
