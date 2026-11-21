// The Escape Room's stealth game (the games console in the room). Kept out of worker.js on purpose: worker.js only
// imports stealthPage() and adds the route.
//
// How it plays: a top-down office drawn on a canvas. Tap where you want to go and the introvert walks there. Colleagues
// walk set rounds with a cone of attention in front of them; stand in a cone and a ring fills, and when it is full you
// are dragged into a conversation (one cell of social battery). Three conversations and you start again. Plants and
// coats hide you, the noticeboard and photocopier let you "look busy" for a few seconds, and the cake tin sends
// everyone to the kitchen once. Everything is drawn in code: no pictures, no sound, nothing downloaded.
//
// All the wording below is a draft for Barry to edit: TITLE, the PEOPLE lines, FAILS and the tips.

const TITLE = "Just Passing Through";   // working title: reads on from the brand name, "Introvert Here… Just Passing Through"

// Each row is one strip of floor, top of the office first.
// # wall  . floor  D desk  P plant (hide)  K coats (hide)  N noticeboard (look busy)  X photocopier (look busy)
// F fridge (hide)  T cake tin  S your desk (start)  E the way out
const MAP = [
  "##########E#",
  "#P.........#",
  "#..DD..DD..#",
  "#..DD..DD..#",
  "#.........K#",
  "#..#N#######",
  "#.....#F..T#",
  "#.DD..#....#",
  "#.DD.......#",
  "#P....#....#",
  "########..##",
  "#.........P#",
  "#.DD..DD...#",
  "#.DD..DD...#",
  "#.........X#",
  "#.DD..DD...#",
  "#.DD..DD...#",
  "#S........K#",
  "############",
];

// way = the tiles each person walks between, in order, for ever. cake = where they stand when there is cake.
const PEOPLE = [
  { name: "The Weekend Asker", prop: "mug", top: "#8a4f3d", hair: "#3a2a22", way: [[9, 11], [9, 14], [5, 14], [5, 11]], cake: [9, 7],
    lines: ["Do anything nice at the weekend? I did. I’ll start with Friday.", "Ooh, while I’ve got you.", "You look like someone who wants to hear about my loft."] },
  { name: "The Cat Photo Person", prop: "phone", top: "#56607a", hair: "#b08a4a", way: [[8, 14], [4, 14], [4, 17], [8, 17]], cake: [8, 7],
    lines: ["You’ll never guess what my cat did. I’ve got forty photos.", "Wait, wait. This one’s a video.", "He’s not normally like this. Well. He is."] },
  { name: "The Tea Round", prop: "tray", top: "#8a7a4a", hair: "#2a2320", way: [[9, 7], [9, 9], [7, 9], [7, 7]], cake: [9, 6],
    lines: ["I’m making one. How do you take it? Sit down, I’ll tell you how I take mine.", "Kettle’s on. That’s four minutes we’ve got.", "Is that your mug? Tell me about your mug."] },
  { name: "The Collector", prop: "envelope", top: "#5d7352", hair: "#6b3d2c", way: [[4, 9], [5, 8], [4, 6], [1, 6], [1, 8]], cake: [8, 6],
    lines: ["We’re doing a card for Gary. You know Gary. Nobody knows Gary.", "Have you signed Gary’s card? Write something personal.", "It’s a fiver each. I’ll wait while you find one."] },
  { name: "The Quick-Word Manager", prop: "lanyard", top: "#6a5a78", hair: "#8d8780", way: [[9, 1], [9, 4], [2, 4], [2, 1]], cake: [10, 8],
    lines: ["Got five minutes? Lovely. It’ll be forty.", "Quick one before you go. It isn’t quick.", "Walk with me. No, the other way. Away from the door."] },
];
const FILLER = ["and anyway…", "so I said…", "which reminds me…", "long story short…", "it gets better…", "where was I…", "no, I tell a lie…", "you’d have loved it…", "to be fair…", "and then…"];
const FAILS = ["You have agreed to attend a barbecue.", "You are now on the social committee.", "You said “we must do this again”. You must now do this again.", "You have been added to a group chat."];

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
.sg{position:relative;height:calc(100dvh - var(--hh,63px));min-height:420px;overflow:hidden;background:#15100c;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.sg [hidden]{display:none!important}
.sg canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:pointer}
.sg .hud{position:absolute;top:8px;right:12px;z-index:3;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;color:#f6efe0;pointer-events:none}
.sg .bat{display:flex;gap:3px;padding:3px;border:2px solid #f6efe0;border-radius:6px;position:relative}
.sg .bat:after{content:"";position:absolute;right:-6px;top:50%;width:3px;height:9px;margin-top:-4.5px;background:#f6efe0;border-radius:0 2px 2px 0}
.sg .bat i{display:block;width:13px;height:14px;border-radius:2px;background:#fad00c;transition:background .5s,opacity .5s}.sg .bat i.off{background:#f6efe0;opacity:.14}
.sg .tip{position:absolute;left:50%;bottom:8px;z-index:3;transform:translateX(-50%);width:max-content;max-width:calc(100% - 20px);margin:0;padding:8px 14px;border-radius:10px;background:rgba(18,14,9,.9);border:1px solid rgba(255,231,166,.35);color:#f6efe0;font-size:13px;font-weight:600;line-height:1.35;text-align:center;text-wrap:balance;pointer-events:none}
.sg .talk{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;background:rgba(12,9,6,.6)}
.sg .bub{position:relative;width:min(100%,400px);max-height:70%;overflow:hidden;padding:18px 20px 20px;border-radius:22px;background:#f6efe0;color:#1c1611;box-shadow:0 14px 40px rgba(0,0,0,.55);transform-origin:50% 100%;animation:sgpop .45s ease-out}
.sg .bub:after{content:"";position:absolute;left:44px;bottom:-14px;border:14px solid transparent;border-top-color:#f6efe0;border-bottom:0}
.sg .bub small{display:block;margin-bottom:6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8a6a00}
.sg .bub p{margin:0;font-size:19px;font-weight:700;line-height:1.3}.sg .bub .fill{margin-top:10px;font-size:15px;font-weight:600;color:#6d6257;min-height:4.2em}
.sg .talk .btn{background:#fad00c;color:#1c1611}
@keyframes sgpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.sg .card{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(12,9,6,.72);overflow:auto}
.sg .card>div{width:min(100%,420px);padding:22px 22px 20px;border-radius:16px;background:rgba(24,19,13,.97);border:2px solid #fad00c;border-bottom-width:6px;color:#f6efe0;box-shadow:0 14px 40px rgba(0,0,0,.6)}
.sg .card .pre{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.sg .card h1,.sg .card h2{margin:2px 0 10px;font-size:28px;line-height:1.1;font-weight:800;text-wrap:balance}
.sg .card p{margin:0 0 10px;font-size:15px;line-height:1.45}.sg .card ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.45}.sg .card li{margin-bottom:4px}
.sg .card .go{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:14px}.sg .card .btn{background:#fad00c;color:#1c1611}.sg .card a{color:#f6efe0;font-size:14px}
.sg .card .sm{font-size:13px;color:#b9ae9c;margin:0}
@media (prefers-reduced-motion:reduce){.sg .bub{animation:none}.sg .bat i{transition:none}}
`;

// The game itself, run in the visitor's browser. Written without backticks or dollar-braces so it can sit in String.raw.
const CLIENT = String.raw`
(function(){
var MAP=__MAP__,PEOPLE=__PEOPLE__,FILLER=__FILLER__,FAILS=__FAILS__,HUBPATH=__HUB__;
var COLS=MAP[0].length,ROWS=MAP.length,$=function(i){return document.getElementById(i)};
var box=$('sg'),cv=$('sgc'),cx=cv.getContext('2d'),tipEl=$('sgt'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var YEL='#fad00c',CREAM='#f6efe0',RANGE=4.2,HALF=0.58,PSPEED=2.4,NSPEED=1.4;

// ---- the floor plan ----
function ch(x,y){return y<0||y>=ROWS||x<0||x>=COLS?'#':MAP[y].charAt(x)}
function walk(x,y){var c=ch(x,y);return c==='.'||c==='S'}
function opaque(x,y){var c=ch(x,y);return c==='#'||c==='N'||c==='E'}
var KIT=[7,6,10,9],TIN={x:10,y:6};var KIND={P:'hide',K:'hide',F:'hide',N:'busy',X:'busy',T:'cake',E:'exit'},LABEL={P:'hide',K:'hide',F:'hide',N:'look busy',X:'look busy',T:'cake',E:'way out'};
var SPOTS=[],START=[1,1];
(function(){for(var y=0;y<ROWS;y++)for(var x=0;x<COLS;x++){var c=ch(x,y);if(c==='S')START=[x,y];if(c==='T')TIN={x:x,y:y};if(KIND[c]){var st=[];[[0,1],[0,-1],[1,0],[-1,0]].forEach(function(d){if(walk(x+d[0],y+d[1]))st.push([x+d[0],y+d[1]])});SPOTS.push({x:x,y:y,c:c,kind:KIND[c],stand:st,cool:0})}}})();
function spotAt(x,y){for(var i=0;i<SPOTS.length;i++)if(SPOTS[i].x===x&&SPOTS[i].y===y)return SPOTS[i];return null}
// Shortest way across the floor from one tile to any of the goal tiles (breadth-first).
function route(fx,fy,goals){var key=function(x,y){return y*COLS+x},want={},prev={},q=[[fx,fy]],seen={},i,n,found=null;
 goals.forEach(function(g){want[key(g[0],g[1])]=1});seen[key(fx,fy)]=1;
 while(q.length){n=q.shift();if(want[key(n[0],n[1])]){found=n;break}
  var ds=[[0,1],[0,-1],[1,0],[-1,0]];for(i=0;i<4;i++){var x=n[0]+ds[i][0],y=n[1]+ds[i][1],k=key(x,y);if(!seen[k]&&walk(x,y)){seen[k]=1;prev[k]=n;q.push([x,y])}}}
 if(!found)return null;var out=[];n=found;while(n[0]!==fx||n[1]!==fy){out.unshift(n);n=prev[key(n[0],n[1])]}return out}
function nearestFloor(gx,gy){var best=null,bd=1e9;for(var y=0;y<ROWS;y++)for(var x=0;x<COLS;x++)if(walk(x,y)){var d=Math.hypot(x+.5-gx,y+.5-gy);if(d<bd){bd=d;best=[x,y]}}return best}
function los(ax,ay,bx,by){var d=Math.hypot(bx-ax,by-ay),n=Math.ceil(d/.18),i;for(i=1;i<n;i++){if(opaque(Math.floor(ax+(bx-ax)*i/n),Math.floor(ay+(by-ay)*i/n)))return false}return true}
function turnTo(a,b,max){var d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+Math.max(-max,Math.min(max,d))}

// ---- the state of play ----
var S,P,N,mark=null,tipT=0,held={},clockT=0;
function reset(){
 P={x:START[0]+.5,y:START[1]+.5,a:-Math.PI/2,path:[],want:null,spot:null,mode:'desk',busyT:0,step:0};
 N=PEOPLE.map(function(d,i){var w=d.way[0];return {d:d,x:w[0]+.5,y:w[1]+.5,a:Math.PI/2,wi:0,path:[],pause:.6+i*.5,meter:0,sated:0,cake:false,look:0,step:0}});
 SPOTS.forEach(function(s){s.cool=0;s.used=false});
 S={mode:'ready',cells:3,chats:0,t:0,cakeT:0,cakeUsed:false,who:null};mark=null;held={};batt();
 tip('You’re at your desk. Nobody bothers a person at a desk. Tap where you want to go.',1e9)}
function batt(){var c=$('sgb').children;for(var i=0;i<c.length;i++)c[i].className=i<S.cells?'':'off';$('sgb').setAttribute('aria-label','Social battery: '+S.cells+' of 3')}
function tip(t,ms){tipEl.textContent=t;tipT=ms||4;}
function clock(){var s=16*3600+58*60+Math.floor(S.t*4),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return (h>12?h-12:h)+':'+(m<10?'0':'')+m+'pm'}
function tileOf(o){return [Math.floor(o.x),Math.floor(o.y)]}

// ---- what a tap does ----
function goTo(gx,gy){if(S.mode!=='play'&&S.mode!=='ready')return;
 var sp=null,bd=.95,i;for(i=0;i<SPOTS.length;i++){var d=Math.hypot(SPOTS[i].x+.5-gx,SPOTS[i].y+.5-gy);if(d<bd){bd=d;sp=SPOTS[i]}}
 var t=tileOf(P),path,target;
 if(sp){path=route(t[0],t[1],sp.stand);target=sp}else{var f=walk(Math.floor(gx),Math.floor(gy))?[Math.floor(gx),Math.floor(gy)]:nearestFloor(gx,gy);path=route(t[0],t[1],[f]);target=null}
 if(!path)return;leave();P.path=path;P.want=target;var e=path.length?path[path.length-1]:t;mark={x:target?target.x+.5:e[0]+.5,y:target?target.y+.5:e[1]+.5,t:0,spot:!!target};
 if(!path.length&&target)arrive()}
function leave(){if(S.mode==='ready'){S.mode='play';tip('Stay out of the cones of light. Tap a plant or the coats to hide.',6)}
 if(P.mode==='busy'&&P.spot)P.spot.cool=6;P.mode='walk';P.spot=null}
function arrive(){var s=P.want;P.want=null;mark=null;if(!s)return;P.a=Math.atan2(s.y+.5-P.y,s.x+.5-P.x);
 if(s.kind==='exit'){win();return}
 if(s.kind==='hide'){P.mode='hide';P.spot=s;tip(s.c==='K'?'You are now a coat. Tap anywhere to stop being a coat.':s.c==='F'?'Behind the fridge door, considering the yoghurts. Tap anywhere to come out.':'You are a plant now. Tap anywhere to come out.',5);return}
 if(s.kind==='busy'){var seen=N.some(function(n){return n.meter>.12});
  if(seen){tip('Too late to look busy. They’ve already clocked you.',3);return}
  if(s.cool>0){tip(s.c==='N'?'You’ve read the fire notice twice. A third time would look odd.':'The photocopier has nothing more to offer you.',3);return}
  P.mode='busy';P.spot=s;P.busyT=5;tip(s.c==='N'?'Reading the fire safety notice. Fascinating. Nobody interrupts this.':'Frowning at the photocopier. Nobody wants to get involved.',5);return}
 if(s.kind==='cake'){if(S.cakeUsed){tip('The tin is empty. It was a one-cake plan.',3);return}
  S.cakeUsed=true;S.cakeT=15;N.forEach(function(n,i){n.cake=true;n.pause=.8+i*.35;n.path=[]});tip('You’ve opened the cake tin. Everyone is coming. Hide.',5)}}
function win(){S.mode='won';var best=null;try{best=JSON.parse(localStorage.getItem('ih_stealth_best')||'null')}catch(e){}
 var mine={t:Math.round(S.t),c:S.chats},better=!best||mine.c<best.c||(mine.c===best.c&&mine.t<best.t);
 if(better){try{localStorage.setItem('ih_stealth_best',JSON.stringify(mine))}catch(e){}best=mine}
 card('You’re out.','Out of the door by '+clock()+'. '+(S.chats===0?'Nobody saw you leave. They’ll assume you’re still at your desk.':S.chats===1?'One conversation endured. You nodded in all the right places.':S.chats+' conversations endured. You are owed a quiet weekend.'),
  'Your best: '+best.c+(best.c===1?' conversation, ':' conversations, ')+best.t+' seconds.','Go again')}
function fail(){S.mode='lost';card('Social battery flat.',FAILS[Math.floor(Math.random()*FAILS.length)],'Back to your desk. Nobody saw anything.','Try again')}
function card(h,p,sm,btn){$('sgch').textContent=h;$('sgcp').textContent=p;$('sgcs').textContent=sm;$('sgcb').textContent=btn;$('sgintro').hidden=true;$('sgend').hidden=false;$('sgcard').hidden=false;$('sgcb').focus()}

// ---- being caught ----
var fillT=null;
function caught(n){S.mode='talk';S.who=n;S.chats++;S.cells--;batt();P.path=[];P.want=null;mark=null;if(P.mode!=='walk'){P.mode='walk';P.spot=null}
 n.a=Math.atan2(P.y-n.y,P.x-n.x);P.a=Math.atan2(n.y-P.y,n.x-P.x);N.forEach(function(m){m.meter=0});
 $('sgwho').textContent=n.d.name;$('sgline').textContent=n.d.lines[Math.floor(Math.random()*n.d.lines.length)];var f=$('sgfill');f.textContent='';$('sgnod').hidden=true;$('sgtalk').hidden=false;
 var k=0,order=FILLER.slice().sort(function(){return Math.random()-.5});clearInterval(fillT);
 fillT=setInterval(function(){f.textContent+=(k?' ':'')+order[k%order.length];k++;if(k===5){$('sgnod').hidden=false;$('sgnod').focus()}if(k>9)clearInterval(fillT)},520)}
function nod(){clearInterval(fillT);$('sgtalk').hidden=true;var n=S.who;S.who=null;if(n)n.sated=5;
 if(S.cells<=0){fail();return}S.mode='play';tip(S.cells===1?'One bar of battery left. Tread carefully.':'They’ve had their chat. Go, while they’re pleased with themselves.',4)}

// ---- one tick of the office ----
function update(dt){
 if(S.mode!=='play'&&S.mode!=='ready')return;
 if(tipT<1e8){tipT-=dt;if(tipT<=0){tipEl.textContent=P.mode==='hide'?'Hidden. Tap anywhere to come out.':'Tap where you want to go.';tipT=1e9}}
 if(mark)mark.t+=dt;
 if(S.mode==='play'){S.t+=dt}
 SPOTS.forEach(function(s){if(s.cool>0)s.cool-=dt});
 // you
 if(!P.path.length&&S.mode!=='talk'){var t=tileOf(P),dx=(held.ArrowRight||held.d?1:0)-(held.ArrowLeft||held.a?1:0),dy=(held.ArrowDown||held.s?1:0)-(held.ArrowUp||held.w?1:0);
  if(dx&&walk(t[0]+dx,t[1])){leave();P.path=[[t[0]+dx,t[1]]];mark=null}else if(dy&&walk(t[0],t[1]+dy)){leave();P.path=[[t[0],t[1]+dy]];mark=null}}
 if(P.path.length){var g=P.path[0],tx=g[0]+.5,ty=g[1]+.5,d=Math.hypot(tx-P.x,ty-P.y),st=PSPEED*dt;P.a=turnTo(P.a,Math.atan2(ty-P.y,tx-P.x),12*dt);P.step+=dt*9;
  if(d<=st){P.x=tx;P.y=ty;P.path.shift();if(!P.path.length)arrive()}else{P.x+=(tx-P.x)/d*st;P.y+=(ty-P.y)/d*st}}
 if(P.mode==='busy'){P.busyT-=dt;if(P.busyT<=0){P.mode='walk';P.spot.cool=8;P.spot=null;tip('That’s as long as anyone can plausibly look busy. Move.',3)}}
 // the cake
 if(S.cakeT>0){S.cakeT-=dt;if(S.cakeT<=0){N.forEach(function(n){n.cake=false;n.path=[];n.pause=.4});tip('The cake has gone. So has everyone’s reason to be in the kitchen.',4)}}
 // them
 var hiddenNow=P.mode==='hide'||P.mode==='busy'||P.mode==='desk';
 N.forEach(function(n){
  if(n.sated>0)n.sated-=dt;
  if(n.pause>0){n.pause-=dt;n.look+=dt;if(!n.cake||n.path.length===0)n.a+=Math.sin(n.look*1.6)*dt*.9}
  else if(n.path.length){var g=n.path[0],tx=g[0]+.5,ty=g[1]+.5,d=Math.hypot(tx-n.x,ty-n.y),st=(n.cake?NSPEED*1.6:NSPEED)*dt;n.a=turnTo(n.a,Math.atan2(ty-n.y,tx-n.x),5*dt);n.step+=dt*7;
   if(d<=st){n.x=tx;n.y=ty;n.path.shift();if(!n.path.length){n.pause=n.cake?99:1.1;n.look=0}}else{n.x+=(tx-n.x)/d*st;n.y+=(ty-n.y)/d*st}}
  else{var t=tileOf(n),goal;if(n.cake){goal=n.d.cake;if(t[0]===goal[0]&&t[1]===goal[1]){n.pause=99;n.a=turnTo(n.a,Math.atan2(TIN.y+.5-n.y,TIN.x+.5-n.x),3)}}else{n.wi=(n.wi+1)%n.d.way.length;goal=n.d.way[n.wi]}
   n.path=route(t[0],t[1],[goal])||[]}
  // have they noticed you?
  var d=Math.hypot(P.x-n.x,P.y-n.y),see=false;
  if(!hiddenNow&&n.sated<=0&&d<RANGE){var off=Math.atan2(P.y-n.y,P.x-n.x)-n.a;off=Math.abs(Math.atan2(Math.sin(off),Math.cos(off)));
   if((off<HALF||d<.8)&&los(n.x,n.y,P.x,P.y))see=true}
  if(see){n.meter+=dt*(d<.8?4:2.2-1.0*d/RANGE)}else n.meter=Math.max(0,n.meter-dt*.7);
  if(n.meter>=1)caught(n)})}

// ---- painting ----
var W=0,H=0,ts=32,ox=0,oy=0,dpr=1,bg=null,T=0;
function rnd(seed){var a=seed;return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function circ(c,x,y,r){c.beginPath();c.arc(x,y,r,0,6.2832)}
function ell(c,x,y,a,b,rot){c.beginPath();c.ellipse(x,y,a,b,rot||0,0,6.2832)}
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 var top=38,bot=46;ts=Math.min(W/COLS,(H-top-bot)/ROWS);ox=(W-COLS*ts)/2;oy=top+(H-top-bot-ROWS*ts)/2;paintBg()}
// Everything that never moves is painted once: floor, walls, desks, lamplight, brushwork.
function paintBg(){bg=document.createElement('canvas');var s=ts*dpr;bg.width=Math.ceil(COLS*s);bg.height=Math.ceil(ROWS*s);var c=bg.getContext('2d'),r=rnd(7),x,y,i;c.scale(s,s);
 c.fillStyle='#1d1612';c.fillRect(0,0,COLS,ROWS);
 for(y=0;y<ROWS;y++)for(x=0;x<COLS;x++){var k=ch(x,y);if(k==='#'||k==='N'||k==='E')continue;var kit=x>=KIT[0]&&y>=KIT[1]&&x<=KIT[2]&&y<=KIT[3];
  if(kit){c.fillStyle=(x+y)%2?'#3a4140':'#333a39'}else{var v=Math.floor(r()*7);c.fillStyle='rgb('+(62+v)+','+(48+v)+','+(40+v)+')'}c.fillRect(x,y,1.02,1.02)}
 // brushwork over the floor
 for(i=0;i<1500;i++){x=r()*COLS;y=r()*ROWS;if(opaque(Math.floor(x),Math.floor(y)))continue;var a=-.5+r()*.4,l=.25+r()*.5;c.strokeStyle=r()<.5?'rgba(255,214,160,'+(.02+r()*.035)+')':'rgba(10,6,3,'+(.03+r()*.05)+')';c.lineWidth=.05+r()*.09;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);c.stroke()}
 // walls, with a paler edge where they meet the floor
 for(y=0;y<ROWS;y++)for(x=0;x<COLS;x++){if(!opaque(x,y))continue;c.fillStyle='#211915';c.fillRect(x,y,1.02,1.02);
  c.fillStyle='#5a4638';if(!opaque(x,y+1)&&y+1<ROWS)c.fillRect(x,y+.72,1.02,.28);c.fillStyle='#3a2d25';if(!opaque(x,y-1)&&y>0)c.fillRect(x,y,1.02,.14);if(!opaque(x-1,y)&&x>0)c.fillRect(x,y,.14,1.02);if(!opaque(x+1,y)&&x+1<COLS)c.fillRect(x+.86,y,.14,1.02)}
 // desks: each block of four is two desks back to back
 for(y=0;y<ROWS;y++)for(x=0;x<COLS;x++){if(ch(x,y)!=='D'||ch(x-1,y)==='D'||ch(x,y-1)==='D')continue;
  c.fillStyle='rgba(0,0,0,.35)';rr(c,x+.1,y+.14,1.9,1.9,.12);c.fill();
  var g=c.createLinearGradient(x,y,x+2,y+2);g.addColorStop(0,'#8a6444');g.addColorStop(1,'#6a4a31');c.fillStyle=g;rr(c,x+.06,y+.06,1.88,1.88,.12);c.fill();
  c.strokeStyle='rgba(30,18,10,.55)';c.lineWidth=.03;c.beginPath();c.moveTo(x+.1,y+1);c.lineTo(x+1.9,y+1);c.stroke();
  for(i=0;i<2;i++){var sy=i?y+1.12:y+.74,ky=i?y+1.5:y+.36,mx=x+.55+r()*.5;
   c.fillStyle='rgba(150,190,220,.16)';rr(c,mx-.1,ky-.2,.9,.5,.1);c.fill();
   c.fillStyle='#1a1d22';rr(c,mx,sy,.7,.14,.04);c.fill();c.fillStyle='#2b2f36';rr(c,mx+.1,ky-.07,.5,.16,.03);c.fill();
   c.fillStyle='#e9e2d0';c.save();c.translate(x+.3+r()*.15,ky);c.rotate(r()*.8-.4);c.fillRect(-.13,-.17,.26,.34);c.restore();
   if(r()<.7){c.fillStyle='#d9d2c4';circ(c,x+1.65,ky+r()*.1,.08);c.fill();c.fillStyle='#4a2f1e';circ(c,x+1.65,ky,.05);c.fill()}}}
 // kitchen worktop along the top wall of the kitchen
 c.fillStyle='#6d6257';rr(c,TIN.x+.04,TIN.y+.04,.92,.92,.08);c.fill();
 // your own desk mat
 c.fillStyle='rgba(250,208,12,.10)';rr(c,START[0]+.08,START[1]+.08,.84,.84,.2);c.fill();
 // pools of lamplight
 c.globalCompositeOperation='lighter';[[3.6,3,3.2],[8,2.6,3],[2.8,7.6,3],[9,7.6,2.6],[3,13,3.2],[7,13,3],[7,16.2,3],[2.6,16.4,2.4],[10.5,.9,2.2]].forEach(function(L){var g=c.createRadialGradient(L[0],L[1],0,L[0],L[1],L[2]);g.addColorStop(0,'rgba(255,196,120,.17)');g.addColorStop(1,'rgba(255,196,120,0)');c.fillStyle=g;c.fillRect(L[0]-L[2],L[1]-L[2],L[2]*2,L[2]*2)});
 c.globalCompositeOperation='source-over'}
function label(t,x,y,col){cx.font='700 .2px Montserrat,system-ui,sans-serif';cx.textAlign='center';cx.textBaseline='middle';var w=cx.measureText(t).width+.2;cx.fillStyle='rgba(18,14,9,.78)';rr(cx,x-w/2,y-.15,w,.3,.1);cx.fill();cx.fillStyle=col||CREAM;cx.fillText(t.toUpperCase(),x,y+.01)}
function drawSpot(s,front){var x=s.x,y=s.y,c=cx,i,r=rnd(s.x*31+s.y*7);
 if(s.c==='P'){if(!front){c.fillStyle='rgba(0,0,0,.35)';ell(c,x+.56,y+.6,.36,.3);c.fill();c.fillStyle='#a45f3f';circ(c,x+.5,y+.5,.26);c.fill();c.fillStyle='#3b2416';circ(c,x+.5,y+.5,.2);c.fill()}
  var cols=['#2f5238','#3f6b45','#567f4d','#35603f'];for(i=0;i<9;i++){var a=i*.7+r()*.3,l=.26+r()*.14;c.fillStyle=cols[i%4];ell(c,x+.5+Math.cos(a)*l*.7,y+.5+Math.sin(a)*l*.7,l*.75,.11,a);c.fill()}}
 else if(s.c==='K'){if(!front){c.fillStyle='rgba(0,0,0,.35)';ell(c,x+.55,y+.58,.42,.36);c.fill()}
  var cc=['#6d3b3b','#3d4a63','#5c5a46','#2e2e33','#7a5a3a'];for(i=0;i<5;i++){var a=i*1.26+.4;c.fillStyle=cc[i];ell(c,x+.5+Math.cos(a)*.17,y+.5+Math.sin(a)*.17,.27,.2,a+1);c.fill()}
  c.fillStyle='#1b1512';circ(c,x+.5,y+.5,.05);c.fill()}
 else if(s.c==='F'){if(!front){c.fillStyle='rgba(0,0,0,.35)';rr(c,x+.12,y+.14,.84,.84,.08);c.fill();c.fillStyle='#cfd3d2';rr(c,x+.08,y+.08,.84,.84,.08);c.fill();c.fillStyle='#aab0af';rr(c,x+.16,y+.16,.68,.5,.05);c.fill()}
  c.save();c.translate(x+.9,y+.9);c.rotate(front?.5:.12);c.fillStyle='#e4e7e5';rr(c,-.8,-.06,.8,.12,.04);c.fill();c.restore()}
 else if(s.c==='N'&&!front){[[.3,.72],[.02,.0]].forEach(function(q,j){if(j===1&&opaque(x,y-1))return;if(j===0&&opaque(x,y+1))return;var yy=y+(j?0.0:.72);c.fillStyle='#b88a55';c.fillRect(x+.08,yy+.03,.84,.22);c.fillStyle='#f1ead8';c.fillRect(x+.14,yy+.06,.2,.15);c.fillStyle='#e7c64b';c.fillRect(x+.4,yy+.07,.16,.14);c.fillStyle='#d9a6a0';c.fillRect(x+.62,yy+.06,.22,.15)})}
 else if(s.c==='X'&&!front){c.fillStyle='rgba(0,0,0,.35)';rr(c,x+.14,y+.16,.8,.8,.08);c.fill();c.fillStyle='#9a968a';rr(c,x+.1,y+.1,.8,.8,.08);c.fill();c.fillStyle='#6f6c63';rr(c,x+.18,y+.18,.64,.42,.05);c.fill();c.fillStyle='#e9e2d0';c.fillRect(x+.3,y+.68,.4,.14);c.fillStyle=s.cool>0?'#b9552f':'#7fc27a';circ(c,x+.8,y+.76,.04);c.fill()}
 else if(s.c==='T'&&!front){if(S.cakeUsed){c.fillStyle='#e9e2d0';circ(c,x+.5,y+.5,.3);c.fill();if(S.cakeT>0){c.fillStyle='#7a4a2a';c.beginPath();c.moveTo(x+.5,y+.5);c.arc(x+.5,y+.5,.24,.6,5.4);c.closePath();c.fill();c.fillStyle='#f3e3c8';c.beginPath();c.moveTo(x+.5,y+.5);c.arc(x+.5,y+.5,.15,.6,5.4);c.closePath();c.fill()}else{c.fillStyle='#7a4a2a';for(i=0;i<5;i++){circ(c,x+.36+r()*.3,y+.38+r()*.26,.025);c.fill()}}}
  else{c.fillStyle='#b9c0c4';circ(c,x+.5,y+.5,.3);c.fill();c.fillStyle='#8e979c';circ(c,x+.5,y+.5,.24);c.fill();c.fillStyle='#c9d0d4';circ(c,x+.5,y+.5,.06);c.fill()}}
 else if(s.c==='E'&&!front){var p=calm?.7:.55+.25*Math.sin(T*2.2);c.fillStyle='#6a5138';c.fillRect(x+.12,y+.3,.76,.7);c.fillStyle='#4a3826';c.fillRect(x+.2,y+.38,.6,.62);c.strokeStyle=YEL;c.globalAlpha=p;c.lineWidth=.06;c.strokeRect(x+.12,y+.3,.76,.72);
  var g=c.createRadialGradient(x+.5,y+1.1,0,x+.5,y+1.1,1.5);g.addColorStop(0,'rgba(250,208,12,.3)');g.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=g;c.fillRect(x-1,y+1,3,1.6);c.globalAlpha=1}
 if(!front&&LABEL[s.c]&&!(P.spot===s)&&!(s.c==='T'&&S.cakeUsed)){var ly=s.c==='N'?(opaque(x,y+1)?y-.2:y+1.2):s.c==='T'?y+1.12:y+1.08;label(LABEL[s.c],x+.5,ly,s.kind==='cake'||s.kind==='exit'?YEL:CREAM)}}
function drawCone(n){var pts=[],i,k=18,r=RANGE;for(i=0;i<=k;i++){var a=n.a-HALF+2*HALF*i/k,d=0,px=n.x,py=n.y;while(d<r){d+=.12;var qx=n.x+Math.cos(a)*d,qy=n.y+Math.sin(a)*d;if(opaque(Math.floor(qx),Math.floor(qy)))break;px=qx;py=qy}pts.push([px,py])}
 var m=Math.min(1,n.meter),al=n.sated>0?.06:.27+.3*m,g=cx.createRadialGradient(n.x,n.y,.1,n.x,n.y,r);
 var col=m>0?'250,'+Math.round(226-18*m)+','+Math.round(150-138*m):'255,232,190';g.addColorStop(0,'rgba('+col+','+al+')');g.addColorStop(1,'rgba('+col+','+(al*.15)+')');
 cx.fillStyle=g;cx.beginPath();cx.moveTo(n.x,n.y);pts.forEach(function(p){cx.lineTo(p[0],p[1])});cx.closePath();cx.fill()}
function person(x,y,a,top,hair,prop,step,moving){var c=cx,sw=moving?Math.sin(step)*.05:0;c.save();c.translate(x,y);c.fillStyle='rgba(0,0,0,.4)';ell(c,.05,.08,.34,.3);c.fill();c.rotate(a);
 c.fillStyle='#2a2320';ell(c,.08+sw,-.16,.1,.07);c.fill();ell(c,.08-sw,.16,.1,.07);c.fill();
 c.fillStyle=top;ell(c,0,0,.19,.34);c.fill();c.fillStyle='rgba(255,255,255,.1)';ell(c,-.04,-.1,.08,.16);c.fill();
 if(prop==='lanyard'){c.strokeStyle='#b9463a';c.lineWidth=.035;c.beginPath();c.moveTo(.02,-.14);c.lineTo(.2,0);c.lineTo(.02,.14);c.stroke();c.fillStyle='#f1ead8';c.fillRect(.17,-.05,.09,.1)}
 if(prop==='hood'){c.fillStyle='#3f575c';circ(c,-.01,0,.2);c.fill();c.fillStyle='#d8b79a';ell(c,.09,0,.08,.1);c.fill();c.strokeStyle='#161514';c.lineWidth=.05;c.beginPath();c.arc(0,0,.2,-1.9,1.9,true);c.stroke();c.fillStyle='#161514';ell(c,.02,-.2,.07,.045);c.fill();ell(c,.02,.2,.07,.045);c.fill()}
 else{c.fillStyle='#d8b79a';circ(c,.05,0,.16);c.fill();c.fillStyle=hair;circ(c,0,0,.165);c.fill()}
 if(prop==='mug'){c.fillStyle='#f1ead8';circ(c,.3,.2,.1);c.fill();c.fillStyle='#4a2f1e';circ(c,.3,.2,.065);c.fill()}
 if(prop==='phone'){c.fillStyle='#161514';rr(c,.24,-.09,.18,.12,.02);c.fill();c.fillStyle='#9fc3d6';c.fillRect(.26,-.075,.14,.09)}
 if(prop==='tray'){c.fillStyle='#4a3826';rr(c,.2,-.2,.2,.4,.03);c.fill();c.fillStyle='#f1ead8';circ(c,.3,-.1,.055);c.fill();circ(c,.3,.02,.055);c.fill();circ(c,.3,.14,.055);c.fill()}
 if(prop==='envelope'){c.fillStyle='#f1ead8';c.fillRect(.22,-.16,.2,.28);c.strokeStyle='#b9463a';c.lineWidth=.025;c.beginPath();c.moveTo(.22,-.16);c.lineTo(.32,-.04);c.lineTo(.42,-.16);c.stroke()}
 c.restore()}
function draw(){var c=cx,s=ts*dpr;c.setTransform(1,0,0,1,0,0);c.fillStyle='#15100c';c.fillRect(0,0,cv.width,cv.height);
 c.setTransform(s,0,0,s,ox*dpr,oy*dpr);c.drawImage(bg,0,0,COLS,ROWS);
 N.forEach(drawCone);SPOTS.forEach(function(q){drawSpot(q,false)});
 if(mark&&!mark.spot){c.strokeStyle='rgba(246,239,224,'+Math.max(.25,.8-mark.t)+')';c.lineWidth=.05;circ(c,mark.x,mark.y,.22);c.stroke()}
 if(mark&&mark.spot){c.strokeStyle='rgba(250,208,12,.8)';c.lineWidth=.05;c.setLineDash([.14,.1]);circ(c,mark.x,mark.y,.56);c.stroke();c.setLineDash([])}
 N.forEach(function(n){person(n.x,n.y,n.a,n.d.top,n.d.hair,n.d.prop,n.step,n.path.length&&n.pause<=0)});
 var hid=P.mode==='hide',px=hid?P.spot.x+.5:P.x,py=hid?P.spot.y+.5:P.y;if(hid)c.globalAlpha=.85;person(px,py,P.a,'#5f7f86','#3f575c','hood',P.step,P.path.length>0);c.globalAlpha=1;
 if(hid)drawSpot(P.spot,true);
 if(P.mode==='busy'){c.strokeStyle=CREAM;c.lineWidth=.07;c.lineCap='round';c.beginPath();c.arc(P.x,P.y,.5,-1.57,-1.57+6.283*P.busyT/5);c.stroke()}
 var top=0,who=null;N.forEach(function(n){if(n.meter>top){top=n.meter;who=n}});
 if(top>0.02){c.strokeStyle='rgba(18,14,9,.6)';c.lineWidth=.13;circ(c,P.x,P.y,.52);c.stroke();c.strokeStyle=YEL;c.lineWidth=.09;c.lineCap='round';c.beginPath();c.arc(P.x,P.y,.52,-1.57,-1.57+6.283*Math.min(1,top));c.stroke();
  if(top>.3)label(who.d.name,Math.max(1.6,Math.min(COLS-1.6,who.x)),who.y-.62,YEL)}
 // the edges fall away into shadow
 c.setTransform(dpr,0,0,dpr,0,0);var g=c.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.5)');c.fillStyle=g;c.fillRect(0,0,W,H);
 $('sgk').textContent=clock()}
var last=0;
function frame(now){var dt=Math.min(.05,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden)update(dt);draw();requestAnimationFrame(frame)}

// ---- taps, clicks and keys ----
cv.addEventListener('pointerdown',function(e){var b=cv.getBoundingClientRect();goTo((e.clientX-b.left-ox)/ts,(e.clientY-b.top-oy)/ts);e.preventDefault()});
addEventListener('keydown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;var k=e.key.length===1?e.key.toLowerCase():e.key;
 if(/^(Arrow(Up|Down|Left|Right)|[wasd])$/.test(k)){held[k]=1;e.preventDefault()}
 if(k===' '||k==='Enter'){var t=tileOf(P),near=null;SPOTS.forEach(function(s){s.stand.forEach(function(q){if(q[0]===t[0]&&q[1]===t[1]&&!near)near=s})});if(near&&!P.path.length){e.preventDefault();if(P.mode==='hide'||P.mode==='busy'){leave()}else{goTo(near.x+.5,near.y+.5)}}}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete held[k]});
addEventListener('blur',function(){held={}});
$('sggo').addEventListener('click',function(){$('sgcard').hidden=true;cv.focus()});
$('sgcb').addEventListener('click',function(){$('sgcard').hidden=true;reset()});
$('sgnod').addEventListener('click',nod);
addEventListener('resize',lay);
reset();lay();requestAnimationFrame(frame);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){});
// Hooks for the automatic play-tests (see docs/shop): step the office on without drawing, and save or restore a moment.
window.__sg={los:los,go:goTo,step:function(n){for(var i=0;i<n;i++)update(1/30)},
 snap:function(){return JSON.stringify({S:S,P:Object.assign({},P,{spot:SPOTS.indexOf(P.spot),want:SPOTS.indexOf(P.want)}),N:N,C:SPOTS.map(function(s){return s.cool})})},
 load:function(j){var q=JSON.parse(j);S=q.S;P=q.P;P.spot=SPOTS[P.spot]||null;P.want=SPOTS[P.want]||null;N=q.N;SPOTS.forEach(function(s,i){s.cool=q.C[i]})},S:function(){return S},P:function(){return P},N:function(){return N},tile:function(x,y){var b=cv.getBoundingClientRect();return [b.left+ox+(x+.5)*ts,b.top+oy+(y+.5)*ts]}};
})();`;

// page = worker.js's page builder, hub = its HUB ({ path, name }).
export function stealthPage(page, hub) {
  const j = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__MAP__", () => j(MAP)).replace("__PEOPLE__", () => j(PEOPLE)).replace("__FILLER__", () => j(FILLER)).replace("__FAILS__", () => j(FAILS)).replace("__HUB__", () => j(hub.path));
  return page(TITLE, `<style>${CSS}</style><div class="sg" id="sg">
<canvas id="sgc" tabindex="0" role="img" aria-label="A top-down view of an office. Tap the floor to walk there. Use the arrow keys to move and Space to use the thing next to you."></canvas>
<div class="hud"><span>The Office · <span id="sgk">4:58pm</span></span><span class="bat" id="sgb" role="img" aria-label="Social battery: 3 of 3"><i></i><i></i><i></i></span></div>
<p class="tip" id="sgt" role="status" aria-live="polite"></p>
<div class="talk" id="sgtalk" hidden><div class="bub"><small id="sgwho"></small><p id="sgline"></p><p class="fill" id="sgfill"></p></div><button class="btn" id="sgnod" type="button" hidden>Nod. Back away slowly.</button></div>
<div class="card" id="sgcard"><div>
<div id="sgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>It’s 4:58pm. The door is at the far end of the office. Between you and it: colleagues with things to say.</p>
<ul><li><b>Tap where you want to go.</b> Stay out of the cones of light.</li><li><b>Tap a plant or the coats</b> to hide.</li><li><b>Tap the noticeboard or photocopier</b> to look busy for a few seconds.</li><li><b>There is one cake</b> in the kitchen tin. Opening it clears the room. Use it wisely.</li></ul>
<p class="sm">Three conversations and your social battery is flat. No sound. On a computer: arrow keys, and Space to use things.</p>
<p class="go"><button class="btn" id="sggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="sgend" hidden><p class="pre">Introvert Here…</p><h2 id="sgch"></h2><p id="sgcp"></p><p class="sm" id="sgcs"></p>
<p class="go"><button class="btn" id="sgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A stealth game for introverts: get out of the office without being drawn into a conversation.", script });
}
