import re
def br(f):
    # [@NAME] -> [@[NAME]] (fully bracketed form; identical meaning)
    return re.sub(r"\[@([A-Z0-9_]+)\]", r"[@[\1]]", f)

VALID_RULE = 'LET(t,[@KEY],n,LEN(t),IF(n=0,FALSE,AND(n<=TagMaxLen,ISNUMBER(FIND(MID(t,SEQUENCE(n),1),TagAllowed)),LEFT(t)<>"\'",LEFT(t)<>"-",ISERROR(FIND("  ",t)),{uniq})))'

F = {
 "PRODUCT_TAGS_FLAT": [
  ("D", "=LOWER(TRIM(INDEX(PRODUCT_RULES[[PRODUCT_TAG_09]:[PRODUCT_TAG_13]],XMATCH(1,(PRODUCT_RULES[COLLECTION]=[@COLLECTION])*(PRODUCT_RULES[PRODUCT_TYPE]=[@PRODUCT_TYPE])),[@SLOT]-8)))"),
  ("E", "=" + VALID_RULE.format(uniq="COUNTIFS([COLLECTION],[@COLLECTION],[PRODUCT_TYPE],[@PRODUCT_TYPE],[KEY],t)=1")),
 ],
 "SEASON_POOL": [
  ("F", "=LOWER(TRIM([@TAG]))"),
  ("G", "=" + VALID_RULE.format(uniq="COUNTIF([KEY],t)=1")),
  ("H", "=LET(d,MONTH(SeasonDate)*100+DAY(SeasonDate),s,[@START_MMDD],e,[@END_MMDD],AND([@VALID],[@ACTIVE]=\"Y\",IF(s<=e,AND(d>=s,d<=e),OR(d>=s,d<=e))))"),
 ],
 "TAG_POOL": [
  ("F", "=LOWER(TRIM([@TAG]))"),
  ("G", "=" + VALID_RULE.format(uniq="COUNTIFS([POOL],[@POOL],[KEY],t)=1")),
  ("H", "=IF([@CLASS]=\"Flavour\",COUNTIF(GAG_TAGS[GAG5_FROZEN],\"*|\"&[@KEY]&\"|*\"),\"\")"),
  ("I", "=AND([@CLASS]=\"Flavour\",N([@GAG_USES])>=TagCap)"),
 ],
 "GAG_TAGS": [
  ("B", "=XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[GAG_CATEGORY],\"\")&\"\""),
  ("C", "=XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[COLLECTION],\"\")&\"\""),
  ("D", "=IF([@GAG_TYPE]=\"\",\"\",LET(r,XMATCH([@GAG_ID],GAGS_TABLE[GAG_ID]),d,VSTACK(INDEX(GAGS_TABLE[[T-SHIRT]],r),INDEX(GAGS_TABLE[[LONG-SLEEVE]],r),INDEX(GAGS_TABLE[SWEATSHIRT],r),INDEX(GAGS_TABLE[HOODIE],r)),v,IFERROR(--d,0),IF(MAX(v)=0,\"\",MIN(FILTER(v,v>0)))))"),
  ("E", "=XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[TITLE_STEM],\"\")&\"\""),
  ("G", "=IF([@GAG_TYPE]=\"\",\"\",LOWER(TRIM(IF([@STEM_TAG]<>\"\",[@STEM_TAG],[@TITLE_STEM]))))"),
  ("H", "=IF([@GAG_TYPE]=\"\",\"\",LET(t,[@TAG13],n,LEN(t),w,IF(n=0,0,n-LEN(SUBSTITUTE(t,\" \",\"\"))+1),IF(n=0,\"No stem\",IF(n>TagMaxLen,n&\" characters (max \"&TagMaxLen&\")\",IF(NOT(AND(ISNUMBER(FIND(MID(t,SEQUENCE(n),1),TagAllowed)))),\"Has characters Etsy rejects\",IF(OR(LEFT(t)=\"'\",LEFT(t)=\"-\"),\"Starts with ' or -\",IF(w>3,w&\" words (max 3)\",\"\")))))))"),
  ("I", "=LOWER(TRIM(XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[CUSTOM_TAG_12],\"\")&\"\"))"),
  ("J", "=LOWER(TRIM(XLOOKUP([@GAG_ID],GAGS_TABLE[GAG_ID],GAGS_TABLE[CUSTOM_TAG_13],\"\")&\"\"))"),
  ("K", "=IF([@GAG_TYPE]=\"\",\"\",LET(id,[@GAG_ID],insea,FILTER(SEASON_POOL[KEY],SEASON_POOL[IN_SEASON],\"\"),ss,VALUE(MID(id,4,5))*13+CODE(LEFT(id))+CODE(MID(id,2,1))+5,rs,IF(INDEX(insea,1)=\"\",insea,INDEX(insea,MOD(ss+SEQUENCE(ROWS(insea))-1,ROWS(insea))+1)),mone,IF([@SEAS_MANUAL_1]=\"auto\",INDEX(rs,1),[@SEAS_MANUAL_1]),mtwo,IF([@SEAS_MANUAL_2]=\"auto\",IFERROR(INDEX(rs,2),\"\"),[@SEAS_MANUAL_2]),m,VSTACK(mone,mtwo),ok,(m<>\"\")*(m<>[@TAG13])*ISNUMBER(XMATCH(m,insea)),v,UNIQUE(FILTER(m,ok,\"\")),IF(INDEX(v,1)=\"\",\"\",\"|\"&TEXTJOIN(\"|\",TRUE,v)&\"|\")))"),
  ("L", "=IF([@GAG_TYPE]=\"\",\"\",LET(id,[@GAG_ID],type,[@GAG_TYPE],stem,[@TAG13],sv,[@SEAS_VALID],seed,VALUE(MID(id,4,5))*7+CODE(LEFT(id))+CODE(MID(id,2,1)),excl,VSTACK(stem,FILTER(PRODUCT_TAGS_FLAT[KEY],PRODUCT_TAGS_FLAT[COLLECTION]=[@COLLECTION],\"\"),IFERROR(TEXTSPLIT(MID(sv,2,LEN(sv)-2),,\"|\"),\"\")),k,TAG_POOL[KEY],use,(TAG_POOL[POOL]=type)*(TAG_POOL[GROUP]=\"GAG\")*(TAG_POOL[ACTIVE]=\"Y\")*TAG_POOL[VALID]*ISNA(XMATCH(k,excl)),an,FILTER(k,use*(TAG_POOL[CLASS]=\"Anchor\"),\"\"),fl,FILTER(k,use*(TAG_POOL[CLASS]=\"Flavour\")*NOT(TAG_POOL[CAPPED]),\"\"),fc,FILTER(k,use*(TAG_POOL[CLASS]=\"Flavour\")*TAG_POOL[CAPPED],\"\"),fu,FILTER(TAG_POOL[GAG_USES],use*(TAG_POOL[CLASS]=\"Flavour\")*TAG_POOL[CAPPED],0),anR,IF(INDEX(an,1)=\"\",an,INDEX(an,MOD(seed+SEQUENCE(ROWS(an))-1,ROWS(an))+1)),flR,IF(INDEX(fl,1)=\"\",fl,INDEX(fl,MOD(seed+SEQUENCE(ROWS(fl))-1,ROWS(fl))+1)),fcS,IF(INDEX(fc,1)=\"\",fc,SORTBY(fc,fu,1)),cand,VSTACK(IFERROR(TAKE(flR,FlavourSlots),\"\"),IFERROR(TAKE(anR,AnchorSlots),\"\"),IFERROR(DROP(flR,FlavourSlots),\"\"),IFERROR(DROP(anR,AnchorSlots),\"\"),fcS),pick,TAKE(UNIQUE(FILTER(cand,cand<>\"\",\"\")),5),n,IF(INDEX(pick,1)=\"\",0,ROWS(pick)),IF(n<5,\"SHORT:\"&n,\"|\"&TEXTJOIN(\"|\",TRUE,pick)&\"|\")))"),
  ("M", "=IF([@GAG_TYPE]=\"\",\"\",LET(id,[@GAG_ID],sv,[@SEAS_VALID],gfive,[@GAG5_SUGGESTED],have,IFERROR(TEXTSPLIT(MID(sv,2,LEN(sv)-2),,\"|\"),\"\"),gfivel,IFERROR(TEXTSPLIT(MID(gfive,2,LEN(gfive)-2),,\"|\"),\"\"),excl,VSTACK([@TAG13],FILTER(PRODUCT_TAGS_FLAT[KEY],PRODUCT_TAGS_FLAT[COLLECTION]=[@COLLECTION],\"\"),have,gfivel),k,TAG_POOL[KEY],fb,FILTER(k,(TAG_POOL[GROUP]=\"FALLBACK\")*((TAG_POOL[POOL]=\"ALL\")+(TAG_POOL[POOL]=[@COLLECTION]))*(TAG_POOL[ACTIVE]=\"Y\")*TAG_POOL[VALID]*ISNA(XMATCH(k,excl)),\"\"),stwo,VALUE(MID(id,4,5))*11+CODE(LEFT(id))+CODE(MID(id,2,1))+3,fbR,IF(INDEX(fb,1)=\"\",fb,INDEX(fb,MOD(stwo+SEQUENCE(ROWS(fb))-1,ROWS(fb))+1)),c,VSTACK(have,fbR),all,TAKE(UNIQUE(FILTER(c,c<>\"\",\"\")),2),n,IF(INDEX(all,1)=\"\",0,ROWS(all)),IF(n<2,\"SHORT:\"&n,\"|\"&TEXTJOIN(\"|\",TRUE,all)&\"|\")))"),
  ("T", "=IF([@GAG_TYPE]=\"\",\"\",AND(COUNTIFS(PRODUCT_TAGS_FLAT[COLLECTION],[@COLLECTION])=20,COUNTIFS(PRODUCT_TAGS_FLAT[COLLECTION],[@COLLECTION],PRODUCT_TAGS_FLAT[VALID],TRUE)=20))"),
  ("U", "=IF([@GAG_TYPE]=\"\",\"\",IF([@GAG5_FROZEN]<>\"\",IF(AND(LEN([@GAG5_FROZEN])-LEN(SUBSTITUTE([@GAG5_FROZEN],\"|\",\"\"))=6,LEN([@SEAS2_FROZEN])-LEN(SUBSTITUTE([@SEAS2_FROZEN],\"|\",\"\"))=3,[@STEM_FROZEN]<>\"\",[@PRODUCT_OK]),\"READY\",\"HOLD – frozen set incomplete: regenerate\"),IF([@STEM_PROBLEM]<>\"\",\"HOLD – stem: \"&[@STEM_PROBLEM],IF(LEFT([@GAG5_SUGGESTED],6)=\"SHORT:\",\"HOLD – only \"&MID([@GAG5_SUGGESTED],7,2)&\" of 5 gag-level tags\",IF(LEFT([@SEAS2_SUGGESTED],6)=\"SHORT:\",\"HOLD – only \"&MID([@SEAS2_SUGGESTED],7,2)&\" of 2 seasonal/fallback tags\",IF(NOT([@PRODUCT_OK]),\"HOLD – product tags invalid for \"&[@COLLECTION],IF([@APPROVED]=TRUE,\"APPROVED – freezes at next 08:00 run\",\"HOLD – awaiting approval\")))))))"),
  ("V", "=IF([@GAG_TYPE]=\"\",\"\",LET(g,IF([@GAG5_FROZEN]<>\"\",[@GAG5_FROZEN],[@GAG5_SUGGESTED]),capL,FILTER(TAG_POOL[KEY],(TAG_POOL[POOL]=[@GAG_TYPE])*TAG_POOL[CAPPED],\"#none\"),cu,SUM(--ISNUMBER(SEARCH(\"|\"&capL&\"|\",g))),sv,[@SEAS_VALID],nsv,IF(sv=\"\",0,LEN(sv)-LEN(SUBSTITUTE(sv,\"|\",\"\"))-1),TEXTJOIN(\"; \",TRUE,IF(AND(cu>0,[@GAG5_FROZEN]=\"\"),\"AMBER: \"&cu&\" capped phrase(s) reused (least-used)\",\"\"),IF(AND(nsv<2,[@SEAS2_FROZEN]=\"\"),(2-nsv)&\" seasonal slot(s) using non-seasonal fallback\",\"\"),IF(AND([@APPROVED]=TRUE,[@GAG5_FROZEN]=\"\"),\"Will freeze: \"&[@GAG5_SUGGESTED]&\" + \"&[@SEAS2_SUGGESTED]&\" + \"&[@TAG13],\"\"))))"),
  ("W", "=IF([@GAG_TYPE]=\"\",\"\",LET(g,IF([@GAG5_FROZEN]<>\"\",[@GAG5_FROZEN],[@GAG5_SUGGESTED]),IF(LEFT(g,6)=\"SHORT:\",\"\",LET(gl,TEXTSPLIT(MID(g,2,LEN(g)-2),,\"|\"),an,FILTER(TAG_POOL[KEY],(TAG_POOL[POOL]=[@GAG_TYPE])*(TAG_POOL[CLASS]=\"Anchor\"),\"#none\"),fl,FILTER(gl,ISNA(XMATCH(gl,an)),\"\"),z,IF([@SEAS2_FROZEN]<>\"\",[@SEAS2_FROZEN],[@SEAS2_SUGGESTED]),zl,IFERROR(TEXTSPLIT(MID(z,2,LEN(z)-2),,\"|\"),\"\"),sz,FILTER(zl,ISNUMBER(XMATCH(zl,SEASON_POOL[KEY])),\"\"),st,IF([@STEM_FROZEN]<>\"\",[@STEM_FROZEN],[@TAG13]),a,VSTACK(fl,sz,st),\"|\"&TEXTJOIN(\"|\",TRUE,FILTER(a,a<>\"\"))&\"|\"))))"),
  ("X", "=IF([@GAG5_FROZEN]<>\"\",[@COMPARABLE],\"\")"),
  ("Y", "=IF([@COMPARABLE]=\"\",\"\",IF(NOT(OR([@GAG5_FROZEN]<>\"\",[@APPROVED]=TRUE,AND(ISNUMBER([@FIRST_RELEASE]),N([@FIRST_RELEASE])<=SeasonDate+120))),\"\",LET(me,[@COMPARABLE],mine,TEXTSPLIT(MID(me,2,LEN(me)-2),,\"|\"),sh,MAP(GAG_TAGS[COMPARABLE_FROZEN],GAG_TAGS[GAG_ID],LAMBDA(x,i,IF(OR(x=\"\",i=[@GAG_ID]),0,SUM(--ISNUMBER(SEARCH(\"|\"&mine&\"|\",x)))))),MAX(sh))))"),
  ("Z", "=IF(N([@OVERLAP_MAX])<OverlapAmber,\"\",LET(me,[@COMPARABLE],mine,TEXTSPLIT(MID(me,2,LEN(me)-2),,\"|\"),sh,MAP(GAG_TAGS[COMPARABLE_FROZEN],GAG_TAGS[GAG_ID],LAMBDA(x,i,IF(OR(x=\"\",i=[@GAG_ID]),0,SUM(--ISNUMBER(SEARCH(\"|\"&mine&\"|\",x)))))),m,MAX(sh),bid,XLOOKUP(m,sh,GAG_TAGS[GAG_ID]),best,XLOOKUP(m,sh,GAG_TAGS[COMPARABLE_FROZEN]),bid&\": \"&TEXTJOIN(\", \",TRUE,FILTER(mine,ISNUMBER(SEARCH(\"|\"&mine&\"|\",best))))))"),
  ("AA", "=IF([@OVERLAP_MAX]=\"\",\"\",IF([@OVERLAP_MAX]>=OverlapRed,\"RED\",IF([@OVERLAP_MAX]>=OverlapAmber,\"AMBER\",\"GREEN\")))"),
  ("AB", "=IF([@GAG_TYPE]=\"\",\"\",LET(g,IF([@GAG5_FROZEN]<>\"\",[@GAG5_FROZEN],[@GAG5_SUGGESTED]),gl,IFERROR(TEXTSPLIT(MID(g,2,LEN(g)-2),,\"|\"),\"\"),an,FILTER(gl,ISNUMBER(XMATCH(gl,FILTER(TAG_POOL[KEY],(TAG_POOL[POOL]=[@GAG_TYPE])*(TAG_POOL[CLASS]=\"Anchor\"),\"#none\"))),\"\"),\"Type anchor: \"&TEXTJOIN(\", \",TRUE,an)&\" · plus 5 fixed product tags per garment (not scored)\"))"),
 ],
 "POOL_CAPACITY": [
  ("B", "=COUNTIFS(GAG_TAGS[GAG_TYPE],[@GAG_TYPE],GAG_TAGS[GAG5_FROZEN],\"\",GAG_TAGS[FIRST_RELEASE],\"<=\"&EDATE(SeasonDate,PlanMonths))"),
  ("C", "=ROUNDUP([@QUEUE_IN_HORIZON]*FlavourSlots/TagCap,0)"),
  ("D", "=COUNTIFS(TAG_POOL[POOL],[@GAG_TYPE],TAG_POOL[CLASS],\"Flavour\",TAG_POOL[ACTIVE],\"Y\",TAG_POOL[VALID],TRUE)"),
  ("E", "=LET(u,IFERROR(--TAG_POOL[GAG_USES],0),SUM((TAG_POOL[POOL]=[@GAG_TYPE])*(TAG_POOL[CLASS]=\"Flavour\")*(TAG_POOL[ACTIVE]=\"Y\")*TAG_POOL[VALID]*IF(u<TagCap,TagCap-u,0)))"),
  ("F", "=IF([@SLOTS_LEFT]>=[@QUEUE_IN_HORIZON]*FlavourSlots,\"OK\",\"AMBER – add about \"&ROUNDUP(([@QUEUE_IN_HORIZON]*FlavourSlots-[@SLOTS_LEFT])/TagCap,0)&\" flavour phrases\")"),
 ],
}
ORDER = ["PRODUCT_TAGS_FLAT", "SEASON_POOL", "TAG_POOL", "GAG_TAGS", "POOL_CAPACITY"]
