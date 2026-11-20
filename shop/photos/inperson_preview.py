import sys, json, time, re, os
sys.path.insert(0,'/home/user/introvert-here-renderer/shop/photos'); sys.path.insert(0,'/tmp/claude-0/-home-user-introvert-here-renderer/20e9d7d1-a197-59e9-a99e-cdad943e4ff1/scratchpad')
import store, etsy
SP='/tmp/claude-0/-home-user-introvert-here-renderer/20e9d7d1-a197-59e9-a99e-cdad943e4ff1/scratchpad/'
# Where the gag text sits on each kind of photo, in Canva's 4500px page units (read from each garment's mockup design).
G={'T-SHIRT':{'tpl':'EAHbHc0Z3HY','etsy':'4620239853','label':'T-shirt','sample':'SAM','live':{'_THUMBNAIL_':(1242.755,2086.406,2048.485,1249.811,152.975,0),'_HANGING_':(1636.196,1824.657,1248.323,761.620,93.221,0)}},
   'LONG-SLEEVE':{'tpl':'EAHbKl-Q9Fs','etsy':'4620262077','label':'Long sleeve','sample':'ALEX','live':{'_THUMBNAIL_':(1032.321,2082.562,1941.998,1184.841,145.023,12),'_HANGING_':(1636.196,1824.657,1248.323,761.620,93.221,0)}},
   'SWEATSHIRT':{'tpl':'EAHbN_jcGPo','etsy':'4620270384','label':'Sweatshirt','sample':'CHARLIE','live':{'_THUMBNAIL_':(1341.228,1719.341,1865.535,1138.190,139.313,-12),'_HANGING_':(1550.755,1932.882,1420.934,866.933,106.111,1)}},
   'HOODIE':{'tpl':'EAHbNZPGdsw','etsy':'4620262239','label':'Hoodie','sample':'JORDAN','live':{'_THUMBNAIL_':(1468.761,1712.214,1588.846,969.378,118.651,0),'_HANGING_BACK_':(1576.781,2001.379,1369.159,835.344,102.245,0)}}}
COL={"DARK_HEATHER":"Dark Heather","NAVY":"Navy","PURPLE":"Purple"}; HEX={"Purple":"#4a2377","Navy":"#1c2741","Dark Heather":"#4c4c50"}; SZ=["S","M","L","XL","2XL","3XL"]
TEXT="... MY NAME IS\n[NAME].\n\nMY RANK AND SERIAL\nNUMBER ARE MY\nOWN BUSINESS."
mp=json.load(open(SP+'mockup_pages.json')); designs=json.load(open(SP+'work/designs.json'))
state=json.load(open(SP+'ip/state.json')) if os.path.exists(SP+'ip/state.json') else {}
def wait(path):
    for _ in range(40):
        j=store.canva(path)["job"]
        if j.get("status")!="in_progress": return j
        time.sleep(5)
    raise RuntimeError("timeout")
def pages(t): return sorted((int(r[2]),r[3]) for r in mp[1:] if r[0]=='IN PERSON' and r[1]==t)
for t in sys.argv[1:]:
    g=G[t]; code='IP-00001-'+t; st=state.setdefault(code,{})
    livep=[(pos,name,k) for pos,name in pages(t) for k in g['live'] if k in name+'_' and re.search(r'_(DARK_HEATHER|NAVY|PURPLE)$',name)]
    if not st.get('bases'):
        job=store.canva("/v1/autofills","POST",{"brand_template_id":g['tpl'],"title":"PREVIEW BASE (safe to delete) "+code,"data":{"GAG_ID":{"type":"text","text":"IP-00001"},"GAG_TEXT":{"type":"text","text":" "}}})["job"]
        if job.get("status")=="in_progress": job=wait("/v1/autofills/"+job["id"])
        did=job["result"]["design"]["id"]; st['baseDesign']=did
        ps=[p for p,_,_ in livep]
        job=store.canva("/v1/exports","POST",{"design_id":did,"format":{"type":"jpg","quality":88,"width":1600,"pages":ps}})["job"]
        if job.get("status")=="in_progress": job=wait("/v1/exports/"+job["id"])
        for p,u in zip(ps,job["urls"]):
            raw=store.curl(u,binary=True); open(SP+'ip/%s-b%02d.jpg'%(t,p),'wb').write(raw); store.r2_put('p/%s/b%02d.jpg'%(code,p),raw)
        st['bases']=ps
    if not st.get('n'):
        st['n']=store.store(code,designs[code]); st['at']=int(time.time()); st['design']=designs[code]['id']
    if not st.get('inv'):
        st['inv']=etsy.etsy('/listings/%s/inventory'%g['etsy'])[0]['products']
    json.dump(state,open(SP+'ip/state.json','w'))
    print(code,'pages',st['n'],'bases',st['bases'],'requests',store.RUNS['n'])
# catalogue entries for every garment done so far
out={}
for t,g in G.items():
    code='IP-00001-'+t; st=state.get(code)
    if not st or not st.get('n'): continue
    variants=[]
    for p in st['inv']:
        pv={x['property_id']:x['values'][0] for x in p['property_values']}; o=p['offerings'][0]
        if p['is_deleted'] or not o['is_enabled']: continue
        variants.append({'id':pv[514]+'/'+pv[513],'size':pv[513],'colour':pv[514],'hex':HEX[pv[514]],'price':round(o['price']['amount']*1.2),'net':o['price']['amount']})
    variants.sort(key=lambda v:(v['colour'],SZ.index(v['size'])))
    imgs=[];sg=None;at=st['at']
    for pos,name in pages(t):
        base='/p/%s/%02d'%(code,pos); m=re.search(r'_(DARK_HEATHER|NAVY|PURPLE)$',name)
        if 'SIZE_GUIDE' in name: sg=base+'.jpg?v=%d'%at; continue
        im={'url':base+'.jpg?v=%d'%at,'thumb':base+'t.jpg?v=%d'%at,'alt':name,'colour':COL[m.group(1)] if m else None}
        for k,(x,y,w,h,s,r) in g['live'].items():
            if k in name+'_' and pos in st['bases']:
                im['live']={'x':round(x/45,3),'y':round(y/45,3),'w':round(w/45,3),'h':round(h/45,3),'s':round(s/45,3),'r':r}; im['base']='/p/%s/b%02d.jpg?v=%d'%(code,pos,at)
        imgs.append(im)
    main='Purple' if any(v['colour']=='Purple' for v in variants) else 'Navy'
    first=[i for i in imgs if i['colour']==main][0]
    out[t]={'label':g['label'],'code':code,'printifyId':None,'etsyId':g['etsy'],'etsyUrl':'https://www.etsy.com/listing/'+g['etsy'],'priceFrom':min(v['price'] for v in variants),'variants':variants,
        'images':imgs,'mockups':[],'tile':first['thumb'],'mainColour':main,'sizeGuide':sg,'features':'','personal':{'max':12,'text':TEXT,'sample':g['sample']}}
json.dump(out,open(SP+'ip/garments.json','w'))
print({t:(len(v['variants']),v['priceFrom'],sum(1 for i in v['images'] if i.get('live'))) for t,v in out.items()})
