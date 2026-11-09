# Etsy tagging – build-ready specification (v2, 9 Nov 2026)

Status: **for approval. Nothing in Core, Make or Etsy has been changed.**
Companion file: `TAG_POOLS_REVIEW.xlsx` (draft pools, stem review, live backfill, overlap baseline, preview).

---

## 1. Verified current state (inspected 9 Nov 2026)

| Item | Finding |
|---|---|
| Workbook | `001A_INTROVERT_HERE_CORE.xlsx` (OneDrive for Business). 9 sheets: GAGS, LISTS, GAG_CATEGORIES, PRODUCT_RULES, MOCKUP_PAGES, ETSY_TAXONOMY_PROPERTY_IDS, LISTING_REGISTRY, COLOUR_PROFILES, PRICING |
| Tables Make uses | `GAGS_TABLE` (A:M, 13 cols), `GAG_CATEGORIES`, `PRODUCT_RULES` (A:AX), `LISTING_REGISTRY_TABLE` (A:BA, 53 cols), `COLOUR_PROFILES_TABLE`, `MOCKUP_PAGES`, `ETSY_TAXONOMY_PROPERTY_IDS` |
| GAGS columns | GAG_ID, GAG_TEXT, COLLECTION, GAG_CATEGORY, CUSTOM_TAG_12, CUSTOM_TAG_13, TITLE_STEM, STATUS, T-SHIRT, LONG-SLEEVE, SWEATSHIRT, HOODIE, ELLIPSIS_CHECK |
| GagID format | All 637 IDs match `^(IH|SH|PC|OS)-\d{5}$`, no duplicates. 426 rows have gag text, all with a GAG_CATEGORY |
| Product code format | All 79 registry codes match `<GagID>-(T-SHIRT|LONG-SLEEVE|SWEATSHIRT|HOODIE)` |
| Existing formulas | 128 formula cells, **all on PRICING**. GAGS and LISTING_REGISTRY contain no formulas |
| Gag types | 13 in `GAG_CATEGORIES` (5 tags each). Use: Small Talk 104, Avoiding People 96, Introvert Life 90, Social Exhaustion 55, Alternative Communication 23, Sensory Issues 17, Social Anxiety 14, Corporate Nonsense 9, Quiet Quitting 9, Overthinking 4, Off The Clock 3, Workplace 1, Burnout 1 |
| Current tag assembly (builder 7896436) | Module 23 → stem tag (lower-cased; **if >20 chars, auto-cut to its longest word**). Module 6012 input = `[23.70 stem, 25.1–25.5 category tags, 27.35–27.39 PRODUCT_TAG_09–13, 23.71 CUSTOM_TAG_12, 23.72 CUSTOM_TAG_13]` → trim, drop blanks, drop case-insensitive duplicates, cut to 13. Used by 39 (Printify create) and 43 (Etsy update). Amendments: 6013 → 242, 245 |
| Next-listing choice | Module 21: earliest due, unbuilt `GagID-GARMENT` from GAGS release-date columns. Builder runs **daily 08:00** |
| Writes that fix table shape | Builder 44 adds registry rows as a **full 53-value row**; builder 246 rewrites a full registry row; Save Gag (8438720) module 9 **POSTs full 13-value GAGS rows** |
| Live tags (verified from Etsy, 8 Nov 21:47 UTC) | 21 live gags / 79 listings. Same-type gags share 5 category + 2 seasonal tags: **18 of 21 live gags share 7 of 8 comparable tags with another gag** |
| Etsy rules | Help article "How to Use Tags to Get Found in Search": up to 13 tags, ≤20 characters, letters/numbers/spaces, `'` and `-` allowed inside words, not at the start. Our pipeline has also seen Etsy reject a repeated tag (case-insensitive) |

**Consequence for the design:** adding columns to GAGS_TABLE or LISTING_REGISTRY_TABLE would break builder 44/246 and Save Gag 9 (fixed row width). **All new data goes into new tables on new sheets.** No existing table changes shape. Existing column positions that Make reads stay where they are.

---

## 2. Tag structure (13 per listing)

| Slots | Source | Varies by |
|---|---|---|
| 1–5 gag-level | `TAG_POOL` for the gag's GAG_CATEGORY: **1 Anchor + 4 Flavour** (configurable), deterministic per-gag rotation, borrowing if short | gag |
| 6–10 product-type | `PRODUCT_RULES` PRODUCT_TAG_09–13 (unchanged; colours allowed) | collection + garment |
| 11–12 seasonal | GAGS `CUSTOM_TAG_12/13` (manual). Used only if the phrase is in `SEASON_POOL`, active and in season on `SeasonDate`. Otherwise filled from the non-seasonal `FALLBACK` pool, rotated per gag. Optional keyword `auto` = rotate in-season phrases per gag | gag + date |
| 13 | Title stem: `STEM_TAG` if typed, else `TITLE_STEM`, lower-case. 1–3 words, ≤20 chars, valid characters. **Never auto-cut** | gag |

Uniqueness is guaranteed by construction. Gag-level and fallback phrases exclude the stem, every product tag of the gag's collection (all 4 garments), the valid seasonal phrases, and each other. A final 13-tag check runs again in Make before any Printify/Etsy call.

---

## 3. Excel capability (Gate 0, before anything else)

Formulas use Microsoft 365 functions: `LET, FILTER, SORTBY, UNIQUE, SEQUENCE, XMATCH, XLOOKUP, TEXTJOIN, TEXTSPLIT, VSTACK, TAKE, DROP`, plus `MAP`/`LAMBDA` (overlap only). Excel for the web supports these, and Make reads Core through Microsoft Graph, which uses the same calculation engine. **This is verified by test before building** (§8 Gate 0). If you ever open Core in an older desktop Excel, these columns would show `#NAME?` there only.

**Fallback if any function is missing:** suggestions use classic per-slot helper columns (`INDEX/MOD/COUNTIF/MATCH`), and overlap is computed by Make (JavaScript) and written as values. No Power Query, no `RAND`, no volatile functions (`SeasonDate` is a plain value cell that Make updates at each 08:00 run).

---

## 4. New sheets and tables

### 4.1 `TAG_SETTINGS` (named cells)
| Name | Cell | Default | Notes |
|---|---|---|---|
| TagCap | B2 | 3 | distinct gags per Flavour phrase |
| SeasonDate | B3 | (date value) | written by Make at 08:00; you can set it to test |
| TagMaxLen | B4 | 20 | Etsy help article |
| AnchorSlots | B5 | 1 | |
| FlavourSlots | B6 | 4 | AnchorSlots + FlavourSlots = 5 |
| OverlapAmber | B7 | 4 | provisional, comparable slots |
| OverlapRed | B8 | 6 | provisional |
| DryRun | B9 | FALSE | TRUE = builder stops before Printify/Etsy |
| DryRunGagId | B10 | (blank) | builder targets this gag in dry run |
| TagAllowed | B11 | `abcdefghijklmnopqrstuvwxyz0123456789 '-` | stricter than Etsy (accented letters are flagged, not stripped) |

### 4.2 `TAG_POOL` (table) – columns `POOL | GROUP | CLASS | TAG | ACTIVE | KEY | VALID | GAG_USES | CAPPED`
POOL = gag-type name (GROUP=GAG) or `ALL`/collection name (GROUP=FALLBACK). CLASS = Anchor/Flavour. ACTIVE = Y/N.
```
KEY      =LOWER(TRIM([@TAG]))
VALID    =LET(t,[@KEY],n,LEN(t),IF(n=0,FALSE,
          AND(n<=TagMaxLen,ISNUMBER(FIND(MID(t,SEQUENCE(n),1),TagAllowed)),
              LEFT(t)<>"'",LEFT(t)<>"-",ISERROR(FIND("  ",t)),
              COUNTIFS([POOL],[@POOL],[KEY],[@KEY])=1)))
GAG_USES =IF([@CLASS]="Flavour",COUNTIF(GAG_TAGS[GAG5_FROZEN],"*|"&[@KEY]&"|*"),"")
CAPPED   =AND([@CLASS]="Flavour",N([@GAG_USES])>=TagCap)
```
(`GAG_USES` counts **distinct gags**, because each gag has one frozen cell. Valid keys can't contain `*`, `?` or `~`, so the wildcard count is safe.)

### 4.3 `SEASON_POOL` (table) – `TAG | SEASON | START_MMDD | END_MMDD | ACTIVE | KEY | VALID | IN_SEASON`
```
KEY       =LOWER(TRIM([@TAG]))
VALID     (same rule as TAG_POOL, uniqueness over the whole table)
IN_SEASON =LET(d,MONTH(SeasonDate)*100+DAY(SeasonDate),s,[@START_MMDD],e,[@END_MMDD],
           AND([@VALID],[@ACTIVE]="Y",IF(s<=e,AND(d>=s,d<=e),OR(d>=s,d<=e))))
```

### 4.4 `PRODUCT_TAGS_FLAT` (read-only helper table, 60 rows = 12 collection×garment × 5 slots) – `COLLECTION | PRODUCT_TYPE | SLOT | KEY | VALID`
```
KEY   =LOWER(TRIM(INDEX(PRODUCT_RULES[[PRODUCT_TAG_09]:[PRODUCT_TAG_13]],
        XMATCH(1,(PRODUCT_RULES[COLLECTION]=[@COLLECTION])*(PRODUCT_RULES[PRODUCT_TYPE]=[@PRODUCT_TYPE])),
        [@SLOT]-8)))
VALID (same rule; uniqueness within COLLECTION + PRODUCT_TYPE)
```
PRODUCT_RULES itself is not edited.

### 4.5 `GAG_TAGS` (table, one row per GagID, explicit key)
Value columns (you or Make): `GAG_ID`, `STEM_TAG` (you), `APPROVED` (tick box, TRUE/FALSE), `STEM_FROZEN`, `GAG5_FROZEN`, `SEAS2_FROZEN`, `FROZEN_AT`, `FREEZE_MESSAGE` (Make).
Formula columns:
```
GAG_TYPE      =XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[GAG_CATEGORY],"")
COLLECTION    =XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[COLLECTION],"")
TITLE_STEM    =XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[TITLE_STEM],"")
SEAS_MANUAL_1 =LOWER(TRIM(XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[CUSTOM_TAG_12],"")))
SEAS_MANUAL_2 =LOWER(TRIM(XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[CUSTOM_TAG_13],"")))

TAG13         =LOWER(TRIM(IF([@STEM_TAG]<>"",[@STEM_TAG],[@TITLE_STEM])))
STEM_PROBLEM  =LET(t,[@TAG13],n,LEN(t),w,IF(n=0,0,n-LEN(SUBSTITUTE(t," ",""))+1),
               IF(n=0,"No stem",IF(n>TagMaxLen,n&" characters (max "&TagMaxLen&")",
               IF(NOT(AND(ISNUMBER(FIND(MID(t,SEQUENCE(n),1),TagAllowed)))),"Has characters Etsy rejects",
               IF(OR(LEFT(t)="'",LEFT(t)="-"),"Starts with ' or -",IF(w>3,w&" words (max 3)",""))))))
STEM_OK       =[@STEM_PROBLEM]=""

SEAS_VALID    =LET(id,[@GAG_ID],
               insea,FILTER(SEASON_POOL[KEY],SEASON_POOL[IN_SEASON],""),
               ss,VALUE(MID(id,4,5))*13+CODE(LEFT(id))+5,
               rs,IF(INDEX(insea,1)="",insea,INDEX(insea,MOD(ss+SEQUENCE(ROWS(insea))-1,ROWS(insea))+1)),
               m1,IF([@SEAS_MANUAL_1]="auto",INDEX(rs,1),[@SEAS_MANUAL_1]),
               m2,IF([@SEAS_MANUAL_2]="auto",IFERROR(INDEX(rs,2),""),[@SEAS_MANUAL_2]),
               m,VSTACK(m1,m2),
               ok,(m<>"")*(m<>[@TAG13])*ISNUMBER(XMATCH(m,insea)),
               v,UNIQUE(FILTER(m,ok,"")),
               IF(INDEX(v,1)="","","|"&TEXTJOIN("|",TRUE,v)&"|"))

GAG5_SUGGESTED=LET(id,[@GAG_ID],type,[@GAG_TYPE],stem,[@TAG13],sv,[@SEAS_VALID],
               seed,VALUE(MID(id,4,5))*7+CODE(LEFT(id))+CODE(MID(id,2,1)),
               excl,VSTACK(stem,FILTER(PRODUCT_TAGS_FLAT[KEY],PRODUCT_TAGS_FLAT[COLLECTION]=[@COLLECTION],""),
                    IFERROR(TEXTSPLIT(MID(sv,2,LEN(sv)-2),,"|"),"")),
               k,TAG_POOL[KEY],
               use,(TAG_POOL[POOL]=type)*(TAG_POOL[GROUP]="GAG")*(TAG_POOL[ACTIVE]="Y")*TAG_POOL[VALID]*ISNA(XMATCH(k,excl)),
               an,FILTER(k,use*(TAG_POOL[CLASS]="Anchor"),""),
               fl,FILTER(k,use*(TAG_POOL[CLASS]="Flavour")*NOT(TAG_POOL[CAPPED]),""),
               fc,FILTER(k,use*(TAG_POOL[CLASS]="Flavour")*TAG_POOL[CAPPED],""),
               fu,FILTER(TAG_POOL[GAG_USES],use*(TAG_POOL[CLASS]="Flavour")*TAG_POOL[CAPPED],0),
               anR,IF(INDEX(an,1)="",an,INDEX(an,MOD(seed+SEQUENCE(ROWS(an))-1,ROWS(an))+1)),
               flR,IF(INDEX(fl,1)="",fl,INDEX(fl,MOD(seed+SEQUENCE(ROWS(fl))-1,ROWS(fl))+1)),
               fcS,IF(INDEX(fc,1)="",fc,SORTBY(fc,fu,1)),
               cand,VSTACK(IFERROR(TAKE(flR,FlavourSlots),""),IFERROR(TAKE(anR,AnchorSlots),""),
                    IFERROR(DROP(flR,FlavourSlots),""),IFERROR(DROP(anR,AnchorSlots),""),fcS),
               pick,TAKE(UNIQUE(FILTER(cand,cand<>"","")),5),
               n,IF(INDEX(pick,1)="",0,ROWS(pick)),
               IF(n<5,"SHORT:"&n,"|"&TEXTJOIN("|",TRUE,pick)&"|"))

SEAS2_SUGGESTED=LET(id,[@GAG_ID],sv,[@SEAS_VALID],g5,[@GAG5_SUGGESTED],
               have,IFERROR(TEXTSPLIT(MID(sv,2,LEN(sv)-2),,"|"),""),
               g5l,IFERROR(TEXTSPLIT(MID(g5,2,LEN(g5)-2),,"|"),""),
               excl,VSTACK([@TAG13],FILTER(PRODUCT_TAGS_FLAT[KEY],PRODUCT_TAGS_FLAT[COLLECTION]=[@COLLECTION],""),have,g5l),
               k,TAG_POOL[KEY],
               fb,FILTER(k,(TAG_POOL[GROUP]="FALLBACK")*((TAG_POOL[POOL]="ALL")+(TAG_POOL[POOL]=[@COLLECTION]))
                    *(TAG_POOL[ACTIVE]="Y")*TAG_POOL[VALID]*ISNA(XMATCH(k,excl)),""),
               s2,VALUE(MID(id,4,5))*11+CODE(LEFT(id))+CODE(MID(id,2,1))+3,
               fbR,IF(INDEX(fb,1)="",fb,INDEX(fb,MOD(s2+SEQUENCE(ROWS(fb))-1,ROWS(fb))+1)),
               c,VSTACK(have,fbR),
               all,TAKE(UNIQUE(FILTER(c,c<>"","")),2),
               n,IF(INDEX(all,1)="",0,ROWS(all)),
               IF(n<2,"SHORT:"&n,"|"&TEXTJOIN("|",TRUE,all)&"|"))

PRODUCT_OK    =AND(COUNTIFS(PRODUCT_TAGS_FLAT[COLLECTION],[@COLLECTION])=20,
                   COUNTIFS(PRODUCT_TAGS_FLAT[COLLECTION],[@COLLECTION],PRODUCT_TAGS_FLAT[VALID],TRUE)=20)

EFF_STEM      =IF([@STEM_FROZEN]<>"",[@STEM_FROZEN],[@TAG13])
EFF_GAG5      =IF([@GAG5_FROZEN]<>"",[@GAG5_FROZEN],[@GAG5_SUGGESTED])
EFF_SEAS2     =IF([@SEAS2_FROZEN]<>"",[@SEAS2_FROZEN],[@SEAS2_SUGGESTED])

TAG_STATUS    =IF([@GAG_ID]="","",IF([@GAG5_FROZEN]<>"",
                 IF(AND(LEN([@GAG5_FROZEN])-LEN(SUBSTITUTE([@GAG5_FROZEN],"|",""))=6,
                        LEN([@SEAS2_FROZEN])-LEN(SUBSTITUTE([@SEAS2_FROZEN],"|",""))=3,
                        [@STEM_FROZEN]<>"",[@PRODUCT_OK]),"READY","HOLD – frozen set incomplete: regenerate"),
                IF(NOT([@STEM_OK]),"HOLD – stem: "&[@STEM_PROBLEM],
                IF(LEFT([@GAG5_SUGGESTED],6)="SHORT:","HOLD – only "&MID([@GAG5_SUGGESTED],7,2)&" of 5 gag-level tags",
                IF(LEFT([@SEAS2_SUGGESTED],6)="SHORT:","HOLD – only "&MID([@SEAS2_SUGGESTED],7,2)&" of 2 seasonal/fallback tags",
                IF(NOT([@PRODUCT_OK]),"HOLD – product tags invalid for "&[@COLLECTION],
                IF([@APPROVED],"APPROVED – freezes at next 08:00 run","HOLD – awaiting approval")))))))

TAG_NOTES     =LET(g,[@EFF_GAG5],
               capL,FILTER(TAG_POOL[KEY],(TAG_POOL[POOL]=[@GAG_TYPE])*TAG_POOL[CAPPED],"#none"),
               cu,SUM(--ISNUMBER(SEARCH("|"&capL&"|",g))),
               sv,[@SEAS_VALID],nsv,IF(sv="",0,LEN(sv)-LEN(SUBSTITUTE(sv,"|",""))-1),
               TEXTJOIN("; ",TRUE,
                 IF(cu>0,cu&" capped phrase(s) reused (least-used)",""),
                 IF(nsv<2,(2-nsv)&" seasonal slot(s) using non-seasonal fallback",""),
                 IF(AND([@APPROVED],[@GAG5_FROZEN]=""),"Will freeze: "&[@GAG5_SUGGESTED]&" + "&[@SEAS2_SUGGESTED]&" + "&[@TAG13],"")))
```

**Overlap (advisory).** It compares gag-level, in-season seasonal and stem slots (6–8 comparable) against **frozen** gags with a different GagID. Product tags and fallback phrases are informational only.
```
COMPARABLE    =LET(g,[@EFF_GAG5],sv,[@SEAS_VALID],IF(LEFT(g,6)="SHORT:","",
               g&IF([@SEAS2_FROZEN]<>"",MID([@SEAS2_FROZEN],2,999),MID(sv,2,999))&[@EFF_STEM]&"|"))
COMPARABLE_FROZEN =IF([@GAG5_FROZEN]<>"",[@COMPARABLE],"")
OVERLAP_SLOTS =IF([@COMPARABLE]="","",LEN([@COMPARABLE])-LEN(SUBSTITUTE([@COMPARABLE],"|",""))-1)
OVERLAP_MAX   =LET(me,[@COMPARABLE],IF(me="","",LET(mine,TEXTSPLIT(MID(me,2,LEN(me)-2),,"|"),
               sh,MAP(GAG_TAGS[COMPARABLE_FROZEN],GAG_TAGS[GAG_ID],
                  LAMBDA(x,i,IF(OR(x="",i=[@GAG_ID]),0,SUM(--ISNUMBER(SEARCH("|"&mine&"|",x)))))),
               MAX(sh))))
OVERLAP_DETAIL=(same LET; if MAX(sh)>=OverlapAmber returns "<GagID>: shared a, b, c" for the worst match,
               using XLOOKUP(MAX(sh),sh,GAG_TAGS[GAG_ID]) and FILTER(mine,ISNUMBER(SEARCH("|"&mine&"|",best))))
OVERLAP_BAND  =IF([@OVERLAP_MAX]="","",IF([@OVERLAP_MAX]>=OverlapRed,"RED",IF([@OVERLAP_MAX]>=OverlapAmber,"AMBER","GREEN")))
PRODUCT_INFO  ="Also shares the 5 fixed product tags with every other "&[@COLLECTION]&" listing of the same garment (not scored)"
```
On the in-season seasonal part of `COMPARABLE`: when frozen it uses the frozen seasonal pair; fallback phrases are excluded from the score per your rule.

### 4.6 `LISTING_TAGS` (table, plain values, written by Make at each build)
`PRODUCT_CODE | GAG_ID | PRODUCT_TYPE | TAGS_FINAL (|t1|…|t13|) | SOURCE (NEW/AMEND) | BUILT_AT`. LISTING_REGISTRY is not touched.

### 4.7 `SEARCH_LOG` (optional table)
`DATE | SEARCH_PHRASE | LISTING | PAGE | POSITION | METHOD | NOTES`. Baseline row: 2026-11-08 · "introvert shirt" · 2 listings (which ones not recorded) · page 4 · incognito · first data point, a trend only.

### 4.8 Conditional formatting
- `GAG_TAGS[TAG13]`: red when `STEM_OK=FALSE`.
- `TAG_STATUS`: red when it starts with "HOLD", green for "READY".
- `TAG_POOL` / `SEASON_POOL` / `PRODUCT_TAGS_FLAT`: red row when `VALID=FALSE`.
- `OVERLAP_BAND`: red/amber/green.

---

## 5. Approval, freezing and caps

1. You review a gag's row in `GAG_TAGS` (suggested 5 + 2 + stem) and tick **APPROVED**. Nothing freezes at that moment, and nothing freezes on a build without the tick.
2. At the 08:00 run, before choosing a listing, Make processes ticked, unfrozen gags **one at a time in GagID order**:
   - It re-checks everything in JavaScript: stem, 5 + 2 valid unique tags, 13 unique tags with each of the collection's 4 garments, and caps, using live counts that include gags frozen earlier in the same run.
   - **Pass:** it writes `STEM_FROZEN`, `GAG5_FROZEN`, `SEAS2_FROZEN`, `FROZEN_AT` as plain values, plus `FREEZE_MESSAGE` "Frozen <date>".
   - **Fail** (for example, another approval just took the last slot of a capped phrase): nothing is frozen, `APPROVED` is set back to FALSE, and `FREEZE_MESSAGE` says why. The suggestion recalculates and you re-approve.
3. That ordered re-check is the reservation. Two approvals can't both take the last slot.
4. The freeze writes exactly the suggestion you saw, as long as you don't edit pools between ticking and 08:00. `TAG_NOTES` shows "Will freeze: …" while pending.
5. Frozen sets are never rewritten by a build. **Regenerate** = clear the three frozen cells and untick. Seasonal changes on frozen gags happen only by the same explicit request.
6. The cap counts distinct gags (`COUNTIF` over `GAG5_FROZEN`). Anchors are uncapped. If every suitable flavour phrase is capped, the least-used one is reused, with a warning in `TAG_NOTES`. That's advisory, not a hold.

---

## 6. Holds (only the affected gag; release continues)

The builder skips a candidate unless its gag's `TAG_STATUS = READY` (or it was frozen earlier in that run). The next due listing is built instead, so a held gag simply releases on a later day once fixed. Hold reasons:
- invalid or overlong stem
- fewer than 5 gag-level tags or 2 seasonal/fallback tags available
- invalid product tags for that collection
- not yet approved

Held gags appear in the app's daily summary. **Nothing is ever truncated or substituted.**

---

## 7. Make changes (scenario 7896436 unless stated). Payload unchanged: an array of 13 strings to Printify (39/242) and Etsy (43/245)

| # | Change |
|---|---|
| M1 | New first step: PATCH `TAG_SETTINGS!B3` (SeasonDate) = today |
| M2 | New: read `GAG_TAGS`, `TAG_POOL`, `PRODUCT_TAGS_FLAT` (list rows) |
| M3 | New code module "Freeze approved tag sets": implements §5 step 2; outputs freeze/reject lists and the set of gags frozen this run |
| M4 | New iterator + Excel PATCH per freeze/reject (GAG_TAGS row range by GagID position) |
| M5 | **Module 21**: extra inputs = GAG_TAGS rows and the frozen-this-run set. Skip candidates whose gag isn't READY; emit the held list. If DryRun and DryRunGagId are set, choose that gag's first unbuilt garment |
| M6 | **Module 23**: delete the `titleTag` auto-shortening. Output 70 = STEM_FROZEN, 71/72 = SEAS2_FROZEN parts, 73 = GAG5_FROZEN list |
| M7 | **Module 6012 input** = `[GAG5_FROZEN ×5, SEAS2_FROZEN ×2, 27.35–27.39, STEM_FROZEN]`. JavaScript: trim; Etsy rule check; case-insensitive uniqueness; **ok only if exactly 13**, else ok=false + reason (no cutting, no padding). **6013** is the same for amendments, using the frozen set |
| M8 | Filter after 6012/6013: continue only if ok=true AND DryRun=FALSE. Else post to the app (dry-run report or hold alert) and stop. No Printify/Etsy/registry writes |
| M9 | After 44: add a `LISTING_TAGS` row (plain values). Amendment path: add a row with SOURCE=AMEND after 246 |
| M10 | Save Gag (8438720): after module 9 adds a GAGS row, add the matching `GAG_TAGS` row (GAG_ID only; formula columns fill from the table, verified in Gate 1) |
| M11 | Daily Checks (8438305): add "held gags + reason" to the app summary |
| — | Nothing else changes. 39/43/242/245 keep reading `6012/6013.result.tags` |

---

## 8. Rollout and tests (no publishing, no Etsy edits)

**Gate 0 – capability (scratch cells in TAG_SETTINGS, read back via Graph):**
- `=LET(x,VSTACK(1,2,3),SUM(MAP(x,LAMBDA(v,v*2))))` → 12
- `=ROWS(TEXTSPLIT("|a|b|",,"|",TRUE))` → 2
- `=TEXTJOIN(",",TRUE,TAKE(DROP(SEQUENCE(5),1),2))` → "2,3"
- `=XMATCH("b",{"a";"b"})` → 2
- `=INDEX(SORTBY({"x";"y"},{2;1}),1)` → "y"

Any failure means the fallback design (§3).

**Gate 1 – structure:**
- Create the new sheets/tables only.
- Add GAG_TAGS rows for all 637 GagIDs.
- Backfill the 21 live gags' frozen sets from verified Etsy tags (LIVE_BACKFILL sheet). Etsy is not touched.
- Check Excel suggestions against the Python mirror for 40 upcoming gags: they must match exactly.
- Test M10 row creation and recalc time.

**Gate 2 – edge cases** using test gags `IH-99901…IH-99909` (no release dates, so never real candidates) and test pool rows:

| Test | Setup | Expected |
|---|---|---|
| T1 normal | valid stem, full pool | READY after approval; freeze = exactly the suggestion |
| T2 short pool | type with 3 valid phrases | `HOLD – only 3 of 5`; builder skips; others build |
| T3 empty pool | type with 0 phrases | `HOLD – only 0 of 5` |
| T4 duplicates | pool contains the stem, a product tag, a seasonal phrase, and one phrase twice | all excluded; still 13 unique |
| T5 invalid characters | `café & co`, `-leading`, a 21-character phrase | VALID=FALSE, red, never selected |
| T6 capped | TagCap=1; freeze T1; T6 same type | T6 avoids T1's flavours; all capped → least-used + warning |
| T7 race | tick two gags whose only free flavour is the same last slot | first frozen; second unticked with message |
| T8 invalid stem | 23 characters; curly `’`; 4 words | red, `HOLD – stem: …`; a valid STEM_TAG clears it |
| T9 out of season | SeasonDate = 15 Mar 2027 | Christmas manual phrases rejected → fallback fills; `auto` rotates in-season phrases |
| T10 frozen stability | edit pools after freezing | frozen cells unchanged; dry-run build uses frozen tags |

Then a **Make dry run**: DryRun=TRUE, DryRunGagId=IH-99901 → the app receives the final 13 tags and the "would build / held" lists. No Printify, Etsy or registry writes. Repeat for the next real due gag once you approve it. Clean-up removes test rows, resets TagCap and turns DryRun off.

**Gate 3 – switch on:** next 08:00 build monitored. Existing listings untouched.

---

## 9. Decisions (defaults proposed)

1. **Allocation 1 Anchor + 4 Flavour.** In the sequential simulation of the next 60 gags (cap 3, seasonal rotated), most gags share only 2–4 comparable tags; with 2+3 it's slightly higher.
2. **Seasonal `auto` keyword.** Recommended: it rotates in-season phrases per gag. With the same manual pair on every gag, the seasonal slots add 2 shared tags to every pair. I won't change your CUSTOM_TAG columns without your OK.
3. **Season windows** as in SEASON_POOL (review the dates).
4. **Overlap bands provisional: AMBER ≥4, RED ≥6** of 6–8 comparable slots. Today 18 of 21 live gags score 7 (red), which is expected. Refine after a month.
5. **Stems:** 110 future gags need a valid 1–3 word stem (114 flagged, 4 are live and left alone). Draft shorteners are in STEM_REVIEW; only gags due soon matter right away (9 of the next 40).
6. **Partly-live gags:** remaining garments use the backfilled live set, matching their live siblings.
7. **Capacity:** at cap 3, about 12 flavour phrases serve about 12 gags per type. The big types (Small Talk, Avoiding People, Introvert Life, Social Exhaustion) will exhaust and reuse least-used phrases with warnings. Grow those pools toward ~24, or review the cap after the first month.
8. **Freeze timing:** at the 08:00 run (no spare Make scenario for an instant freeze).

## 10. Unverified (tested at the gates above)
- **U1** 365 function support (Gate 0).
- **U2** Graph row-add filling calculated columns (Gate 1).
- **U3** Etsy rules come from the help-centre article; Etsy's developer site couldn't be reached from this session.
- **U4** Etsy may accept accented letters; we flag them instead.
- **U5** MAP overlap recalc time at ~640 rows (Gate 1; fallback: Make computes).
- **U6** The GAG_CATEGORY dropdown rule itself isn't readable with my access; pools use the 13 names in GAG_CATEGORIES.
