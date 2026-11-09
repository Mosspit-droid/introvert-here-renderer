import json, copy
A="/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/audit"; M="/tmp/claude-0/-home-user/769316c1-83de-5c23-bdef-f72138378311/scratchpad/tagging/make"
b=json.load(open(A+"/backup_7896436_before_tagengine.json"))['response']['blueprint']
X={}
def walk(fl):
    for m in fl:
        X[m['id']]=m
        for r in m.get('routes',[]): walk(r['flow'])
walk(b['flow'])
det=json.load(open(A+"/backup_7696096_before_tidy.json"))['response']['blueprint']
alert=None
def w2(fl):
    global alert
    for m in fl:
        if m['id']==603: alert=m
        [w2(r['flow']) for r in m.get('routes',[])]
w2(det['flow'])
xl=X[44]; BASE=xl['mapper']['url'].split('/tables/')[0]; BB=BASE.replace("/v1.0","")
code_mod=X[21]
def api(i,name,url,method,body,flt=None):
    m={"id":i,"module":xl['module'],"version":xl['version'],"parameters":xl['parameters'],
       "mapper":{"qs":[],"url":url,"method":method,"headers":[{"key":"Content-Type","value":"application/json"}],"body":body},
       "metadata":{"designer":{"x":0,"y":0,"name":name}}}
    if flt: m['filter']=flt
    return m
def js(i,name,inputs,src):
    return {"id":i,"module":code_mod['module'],"version":code_mod['version'],"parameters":code_mod.get('parameters',{}),
            "mapper":{"input":[{"name":k,"value":v} for k,v in inputs],"language":"javascript","inputFormat":"editor","codeEditorJavascript":src},
            "metadata":{"designer":{"x":0,"y":0,"name":name}}}
reads={"t":"/tables/GAG_TAGS/range?$select=values","p":"/tables/TAG_POOL/range?$select=values","f":"/tables/PRODUCT_TAGS_FLAT/range?$select=values",
 "s":"/worksheets/TAG_SETTINGS/range(address='A2:B14')?$select=values","r":"/worksheets/GAG_TAGS/range(address='A2:AC2')?$select=formulas","g":"/tables/GAGS_TABLE/columns/GAG_ID/dataBodyRange?$select=values"}
readBody=json.dumps({"requests":[{"id":k,"method":"GET","url":BB+v} for k,v in reads.items()]})
new_top=[api(9602,"Tags: read GAG_TAGS, pools, product tags, settings (one batch)","/v1.0/$batch","POST",readBody),
         js(9603,"Tags: freeze approved sets, repair new gag rows, season date",[("read","{{9602.body}}"),("today",'{{formatDate(now; "YYYY-MM-DD"; "Europe/London")}}'),("base",BB)],open(M+"/freeze.js").read()),
         api(9604,"Tags: write freezes + season date to Core (one batch)","/v1.0/$batch","POST","{{9603.result.batch}}")]
# insert after 121 at top level
top=b['flow']; i=[m['id'] for m in top].index(121); b['flow']=top[:i+1]+new_top+top[i+1:]
# 21
X[21]['mapper']['codeEditorJavascript']=open(M+"/c21.js").read()
X[21]['mapper']['input']+= [{"name":"tagMode","value":"{{9603.result.tagMode}}"},{"name":"dryRun","value":"{{9603.result.dryRun}}"},{"name":"dryId","value":"{{9603.result.dryId}}"},
                            {"name":"ready","value":"{{9603.result.ready}}"},{"name":"status","value":"{{9603.result.status}}"}]
c6012=open(M+"/c6012.js").read()
X[6012]['mapper']['codeEditorJavascript']=c6012
X[6012]['mapper']['input']+= [{"name":"tagMode","value":"{{9603.result.tagMode}}"},{"name":"kind","value":"{{21.result.`60`}}"},{"name":"code","value":"{{21.result.`1`}}"},
    {"name":"sets","value":"{{9603.result.sets}}"},{"name":"prod","value":"{{add(emptyarray; 27.result.`35`; 27.result.`36`; 27.result.`37`; 27.result.`38`; 27.result.`39`)}}"}]
X[6013]['mapper']['codeEditorJavascript']=c6012
X[6013]['mapper']['input']+= [{"name":"tagMode","value":"{{9603.result.tagMode}}"},{"name":"kind","value":"NEW"},{"name":"code","value":"{{237.`1`}}"},
    {"name":"sets","value":"{{9603.result.sets}}"},{"name":"prod","value":"{{add(emptyarray; 238.result.`35`; 238.result.`36`; 238.result.`37`; 238.result.`38`; 238.result.`39`)}}"}]
X[239]['filter']['conditions'][0].append({"a":'{{if(6013.result.ok; "yes"; "no")}}',"b":"yes","o":"text:equal"})
X[950]['filter']['conditions'][0].append({"a":'{{if(9603.result.dryRun; "yes"; "no")}}',"b":"no","o":"text:equal"})
# router after 6012 in route0 of 949
r0=X[949]['routes'][0]['flow']; k=[m['id'] for m in r0].index(6012); rest=r0[k+1:]
assert rest[0]['id']==28
go={"name":"Tags OK and not a dry run","conditions":[[{"a":'{{if(6012.result.ok; "yes"; "no")}}',"b":"yes","o":"text:equal"},{"a":'{{if(9603.result.dryRun; "yes"; "no")}}',"b":"no","o":"text:equal"}]]}
stop={"name":"Dry run, or tags not OK","conditions":[[{"a":'{{if(6012.result.ok; "yes"; "no")}}',"b":"no","o":"text:equal"}],[{"a":'{{if(9603.result.dryRun; "yes"; "no")}}',"b":"yes","o":"text:equal"}]]}
al=copy.deepcopy(alert); al['id']=9611; al['onerror'][0]['id']=9612; al['filter']=stop; al['metadata']['designer']['name']="Tags: send dry-run report / hold to the app"
al['mapper']['urlEncodedBodyContent']=[
 {"name":"title","value":'{{if(9603.result.dryRun; "Tag dry run: "; "Tags held, not built: ")}}{{21.result.`1`}}'},
 {"name":"body","value":'{{if(6012.result.ok; "All 13 tags OK. Nothing was sent to Printify or Etsy."; "Not built: " + 6012.result.reason)}}\n\n{{6012.result.summary}}\n\nFinal 13: {{join(6012.result.tags; ", ")}}\n\nFreeze step: {{9603.result.report}}\n\nHeld gags: {{ifempty(21.result.`80`; "none")}}'},
 {"name":"link","value":"https://mosspit-approvals.mosspit.workers.dev/tags"},{"name":"source","value":"Tags"}]
rest[0]=dict(rest[0])  # 28 router keeps its routes
X[28]['filter']=None
r0[k+1:]=[{"id":9610,"module":"builtin:BasicRouter","version":1,"mapper":None,"metadata":{"designer":{"x":0,"y":0,"name":"Tags OK? build, else report"}},
           "routes":[{"flow":[dict(X[28])]},{"flow":[al]}]}]
# a router can't carry a filter itself: put the go-filter on the first module of each of 28's routes
for rt in X[28]['routes']:
    f=rt['flow'][0]
    if f.get('filter'): f['filter']['conditions']=[cond+go['conditions'][0] for cond in f['filter']['conditions']]
    else: f['filter']=go
# LISTING_TAGS rows
lt=lambda i,name,code,tags,src: api(i,name,BASE+"/tables/LISTING_TAGS/rows/add","POST",
   '{"values":[["{{escapeJSON(%s)}}","{{escapeJSON(get(split(%s; \\"-\\"); 1) + \\"-\\" + get(split(%s; \\"-\\"); 2))}}","{{escapeJSON(substring(%s; 9))}}","|{{escapeJSON(lower(join(%s; \\"|\\")))}}|","%s","{{formatDate(now; \\"YYYY-MM-DD\\")}}"]]}'%(code,code,code,code,tags,src))
fl=X[28]['routes'][0]['flow']; j=[m['id'] for m in fl].index(290); fl.insert(j+1, lt(9620,"Tags: record final tags in LISTING_TAGS","21.result.`1`","6012.result.tags","BUILD"))
fl=X[28]['routes'][1]['flow']; j=[m['id'] for m in fl].index(246); fl.insert(j+1, lt(9621,"Tags: record final tags in LISTING_TAGS (amend)","237.`1`","6013.result.tags","AMEND"))
for m in (fl[j+1],): pass
# onerror Ignore on LISTING_TAGS writes so a record failure never stops a build
for mid,eid in ((9620,9622),(9621,9623)):
    pass
out=json.dumps(b)
ids=[]
def w3(fl):
    for m in fl:
        ids.append(m['id']); [ids.append(e['id']) for e in m.get('onerror',[]) or []]; [w3(r['flow']) for r in m.get('routes',[])]
w3(b['flow']); import collections; d=[k for k,v in collections.Counter(ids).items() if v>1]; assert not d, d
json.dump({"blueprint":out},open(A+"/patch_builder_tagengine.json","w")); print("built", len(ids))
