// The stealth game as a small platformer (Barry, 21 Nov): old-handheld feel, two actions, one proper level.
//
// You are trying to get out of the office to the door at the far end. You cannot hurt anyone. Touching a person, or one
// of a talker's speech bubbles, is a conversation: it knocks a quarter off your social battery. Jump (A) over and around
// them. Hood Up (B): sit down, hood tight, and for a couple of seconds nobody notices you, but you cannot move.
// Tea tops the battery up; three "plans cancelled" notes are hidden for the thorough; headphones make you un-talk-to-able
// for a few seconds; office chairs bounce you. Fall down a gap and you lose a quarter and go back to the last safe spot.
//
// The hero is Barry's flat "sticker" drawing (stealth-art/src/hero-flat.png). Everyone and everything else is a plain
// stand-in drawn in code, to judge whether this feels like a level before more drawing. Wording is draft for Barry.
import { ART } from "./stealth-art/art.js";

const TITLE = "Just Passing Through";   // working title

// The office, 11 squares high. Built from a list of placements so the rows cannot come out different lengths.
// # floor or wall  F filing cabinet (solid)  = shelf or desk (jump up through it)  ^ office chair (bounces you)
// o tea  N plans-cancelled note  H headphones  P stander  W walker  T talker (speech bubbles)  D the door out  S start
function office() {
  const W = 112, H = 11, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  box(0, W - 1, 9, 10, "#"); box(0, 0, 0, 10, "#"); box(W - 1, W - 1, 0, 10, "#");
  put(2, 8, "S");
  // 1. A gentle start: tea, a desk, the first person to hop over
  row(5, 7, 8, "o"); row(9, 11, 7, "="); put(10, 6, "o"); put(14, 8, "P");
  // 2. The stairwell gap, filing cabinets, a walker under a shelf with the first note
  box(18, 20, 9, 10, "."); put(18, 6, "o"); put(19, 5, "o"); put(20, 6, "o");
  put(24, 8, "F"); box(25, 26, 7, 8, "F"); put(31, 8, "W"); row(28, 32, 5, "="); put(30, 4, "N");
  // 3. An office chair up to a high shelf (tea, headphones), then a talker
  put(36, 8, "^"); row(38, 43, 3, "="); row(39, 41, 2, "o"); put(43, 2, "H"); put(48, 8, "T");
  // 4. A birthday huddle, with desks over the top and the second note
  row(51, 53, 6, "="); row(55, 59, 4, "="); put(58, 3, "N"); row(55, 57, 8, "P");
  // 5. A wider gap with a ledge in the middle
  box(63, 67, 9, 10, "."); row(65, 66, 8, "="); put(65, 6, "o"); put(66, 6, "o");
  // 6. Two walkers either side of a cabinet, a chair up to the third note
  put(74, 8, "W"); box(81, 81, 7, 8, "F"); put(85, 8, "W"); put(89, 8, "^"); put(90, 2, "N"); row(91, 93, 4, "="); row(91, 93, 3, "o");
  // 7. The last stretch: tea, a talker, the door
  row(97, 99, 8, "o"); put(104, 8, "T"); put(108, 8, "D");
  return g.map((r) => r.join(""));
}
const LEVEL = { name: "The Office", map: office(),
  lines: { P: ["Have you got a sec?", "You’ll like this one.", "Are you coming to the thing?"], W: ["Ooh, just the person!", "Walk with me.", "Quick question."], T: ["How ARE you?", "Any plans for the weekend?", "Did you get my email?"], pit: ["You fell into a team-building exercise."] } };
const FAILS = ["You have agreed to attend a barbecue.", "You are now on the social committee.", "You said “we must do this again”. You must now do this again.", "You have been added to a group chat."];

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
.pg{position:relative;height:calc(100dvh - var(--hh,63px));min-height:300px;overflow:hidden;background:#20222b;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}
.pg [hidden]{display:none!important}
.pg canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.pg .card{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(22,20,18,.72);overflow:auto}
.pg .card>div{width:min(100%,430px);margin:auto;padding:20px 20px 18px;border-radius:16px;background:rgba(24,21,17,.97);border:2px solid #fad00c;border-bottom-width:6px;color:#f6efe0;box-shadow:0 14px 40px rgba(0,0,0,.6)}
.pg .card .pre{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.pg .card h1,.pg .card h2{margin:2px 0 10px;font-size:26px;line-height:1.1;font-weight:800;text-wrap:balance}
.pg .card p{margin:0 0 10px;font-size:15px;line-height:1.45}.pg .card ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.45}.pg .card li{margin-bottom:4px}
.pg .card .go{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:12px 0 0}.pg .card .btn{background:#fad00c;color:#1c1611}.pg .card a{color:#f6efe0;font-size:14px}
.pg .card .sm{font-size:13px;color:#b9ae9c;margin:0}
@media (max-height:440px){.pg .card h1,.pg .card h2{font-size:20px}.pg .card ul{font-size:13px}.pg .card>div{width:min(100%,640px);padding:12px 16px}.pg .card p{font-size:13px;margin-bottom:6px}}
`;

// The game, run in the visitor's browser. Written without backticks or dollar-braces so it can sit in String.raw.
const CLIENT = String.raw`
(function(){
var L=__LEVEL__,HERO=__HERO__,FAILS=__FAILS__,SRC=__SRC__;
var $=function(i){return document.getElementById(i)},box=$('pg'),cv=$('pgc'),cx=cv.getContext('2d'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var img=new Image(),ready=false;img.onload=img.onerror=function(){ready=true};img.src=SRC+'hero';
var MAP=L.map,MW=MAP[0].length,MH=MAP.length,VIEW=MH,INK='#1b1b2a',YEL='#fad00c',CREAM='#f6efe0';
// Feel: squares per second. A full jump clears about 3.6 squares; letting go early cuts it short.
var RUN=5.4,ACC=46,JUMP=17,GRAV=42,FALLMAX=22,HOODMAX=2.4,HW=.3,HH=1.5;
function tile(x,y){return y<0?'.':y>=MH?'.':x<0||x>=MW?'#':MAP[y].charAt(x)}
function solid(x,y){var c=tile(x,y);return c==='#'||c==='F'}

var S,P,people,items,bubbles,says,T=0,keys={},btn={},jumpQ=0;
function reset(){people=[];items=[];bubbles=[];says=[];var sx=2,sy=8;
 for(var y=0;y<MH;y++)for(var x=0;x<MW;x++){var c=MAP[y].charAt(x);
  if(c==='S'){sx=x;sy=y}else if(c==='P'||c==='W'||c==='T')people.push({k:c,x:x+.5,y:y+1,f:-1,t:Math.random()*2,i:people.length})
  else if('oNH'.indexOf(c)>=0)items.push({k:c,x:x+.5,y:y+.5,got:false})}
 P={x:sx+.5,y:sy+1,vx:0,vy:0,f:1,ground:true,coy:0,hood:false,hoodT:HOODMAX,cool:0,inv:0,phones:0,walkT:0,safe:[sx+.5,sy+1],wave:0};
 S={mode:'ready',batt:1,tea:0,notes:0,t:0,hits:0};keys={};btn={};jumpQ=0}
function say(t,x,y){says.push({t:t,x:x,y:y,life:1.8})}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function hurt(why,from){if(P.inv>0||S.mode!=='play')return;S.batt-=.25;S.hits++;P.inv=1.6;P.hood=false;P.vy=-8;P.vx=(from!=null&&from>P.x?-1:1)*5;P.ground=false;
 if(S.batt<=.001){S.mode='lost';card('Social battery flat.',pick(FAILS),'Back to your desk. Nobody saw anything.','Try again')}}
function card(h,p,sm,b){$('pgch').textContent=h;$('pgcp').textContent=p;$('pgcs').textContent=sm;$('pgcb').textContent=b;$('pgintro').hidden=true;$('pgend').hidden=false;$('pgcard').hidden=false;$('pgcb').focus()}
function win(){S.mode='won';P.wave=1;var total=items.filter(function(i){return i.k==='o'}).length;
 card('You’re out.',S.hits===0?'Not one conversation. They’ll assume you’re still at your desk.':S.hits===1?'One conversation endured. You nodded in all the right places.':S.hits+' conversations endured. You are owed a quiet weekend.',
  'Tea '+S.tea+' of '+total+' · Plans cancelled '+S.notes+' of 3 · '+Math.round(S.t)+' seconds','Go again')}

// ---- one tick ----
function left(){return keys.ArrowLeft||keys.a||btn.l}function right(){return keys.ArrowRight||keys.d||btn.r}function hoodKey(){return keys.x||keys.Shift||keys.ArrowDown||keys.s||btn.b}function jumpKey(){return keys.z||keys[' ']||keys.ArrowUp||keys.w||btn.a}
function update(dt){if(S.mode!=='play'&&S.mode!=='ready')return;
 var d=(right()?1:0)-(left()?1:0);if(S.mode==='ready'&&(d||jumpQ>0||hoodKey()))S.mode='play';if(S.mode==='play')S.t+=dt;
 if(P.inv>0)P.inv-=dt;if(P.phones>0)P.phones-=dt;if(P.cool>0)P.cool-=dt;if(jumpQ>0)jumpQ-=dt;
 // Hood Up: on the ground, while B is held and there is hood left
 var want=hoodKey()&&P.ground&&P.cool<=0&&P.hoodT>0&&S.mode==='play';
 if(want){P.hood=true;P.hoodT-=dt;if(P.hoodT<=0){P.hood=false;P.cool=1.5}}else{if(P.hood)P.cool=Math.max(P.cool,.4);P.hood=false;if(!hoodKey())P.hoodT=Math.min(HOODMAX,P.hoodT+dt*1.2)}
 if(P.hood)d=0;
 // running
 var tv=d*RUN;if(P.vx<tv)P.vx=Math.min(tv,P.vx+ACC*dt);else if(P.vx>tv)P.vx=Math.max(tv,P.vx-ACC*dt);if(d)P.f=d;
 // jumping, with a little forgiveness either side of an edge
 if(P.ground)P.coy=.1;else P.coy-=dt;
 if(jumpQ>0&&P.coy>0&&!P.hood){P.vy=-JUMP;P.ground=false;P.coy=0;jumpQ=0}
 if(P.vy>=0)P.sprung=false;if(!jumpKey()&&!P.sprung&&P.vy<-6)P.vy=-6;   // letting go of A cuts a jump short (but not a bounce)
 P.vy=Math.min(FALLMAX,P.vy+GRAV*dt);
 // move sideways, then up or down, stopping at anything solid
 var nx=P.x+P.vx*dt,top=P.y-HH,ys=[Math.floor(top+.05),Math.floor(P.y-HH/2),Math.floor(P.y-.05)],i;
 if(P.vx>0){for(i=0;i<3;i++)if(solid(Math.floor(nx+HW),ys[i])){nx=Math.floor(nx+HW)-HW-.001;P.vx=0;break}}
 else if(P.vx<0){for(i=0;i<3;i++)if(solid(Math.floor(nx-HW),ys[i])){nx=Math.floor(nx-HW)+1+HW+.001;P.vx=0;break}}
 P.x=nx;var ny=P.y+P.vy*dt,xa=Math.floor(P.x-HW+.02),xb=Math.floor(P.x+HW-.02),wasGround=P.ground;P.ground=false;
 if(P.vy>=0){for(i=xa;i<=xb;i++){var ty=Math.floor(ny),c=tile(i,ty);
   if((solid(i,ty)||(c==='='&&P.y<=ty+.02))&&P.y<=ty+.02+Math.max(0,P.vy*dt)){ny=ty;P.vy=0;P.ground=true;break}}}
 else{for(i=xa;i<=xb;i++)if(solid(i,Math.floor(ny-HH))){ny=Math.floor(ny-HH)+1+HH+.001;P.vy=0;break}}
 P.y=ny;if(P.ground&&Math.abs(P.vx)>.5)P.walkT+=dt;
 // an office chair: step or land on it and up you go
 var cyy=Math.floor(P.y-.01);if(P.vy>=0&&tile(Math.floor(P.x),cyy)==='^'&&P.y>=cyy+.3){P.vy=-23;P.sprung=true;P.ground=false;P.coy=0;jumpQ=0;P.hood=false}
 if(P.ground&&solid(Math.floor(P.x),Math.floor(P.y+.1))&&solid(Math.floor(P.x-1),Math.floor(P.y+.1))&&solid(Math.floor(P.x+1),Math.floor(P.y+.1)))P.safe=[P.x,P.y];
 if(P.y>MH+2){var was=P.inv;P.inv=0;S.batt-=.25;S.hits++;say(L.lines.pit[0],P.safe[0],P.safe[1]-2.4);P.x=P.safe[0];P.y=P.safe[1];P.vx=P.vy=0;P.inv=1.6;if(S.batt<=.001){S.mode='lost';card('Social battery flat.',pick(FAILS),'Back to your desk. Nobody saw anything.','Try again');return}}
 // collecting
 items.forEach(function(it){if(it.got||Math.abs(it.x-P.x)>.7||Math.abs(it.y-(P.y-HH/2))>1)return;it.got=true;
  if(it.k==='o'){S.tea++;S.batt=Math.min(1,S.batt+.08)}else if(it.k==='N'){S.notes++;say('Plans cancelled!',it.x,it.y-1)}else{P.phones=7;say('Headphones on.',it.x,it.y-1)}});
 // the door
 var dx=Math.floor(P.x);if(tile(dx,Math.floor(P.y-.5))==='D'||tile(dx,Math.floor(P.y-1.4))==='D'){win();return}
 // people: standers stand, walkers walk between obstacles, talkers send out speech bubbles
 var unseen=P.hood||P.phones>0;
 people.forEach(function(p){p.t+=dt;
  if(p.k==='W'){var ax=p.x+p.f*.5,blocked=solid(Math.floor(ax),Math.floor(p.y-.5))||tile(Math.floor(ax),Math.floor(p.y-.5))==='^'||!solid(Math.floor(ax),Math.floor(p.y+.1))||people.some(function(o){return o!==p&&Math.abs(o.y-p.y)<.5&&Math.abs(o.x-ax)<.5});if(blocked)p.f=-p.f;else p.x+=p.f*2.1*dt}
  else if(Math.abs(P.x-p.x)<9)p.f=P.x<p.x?-1:1;
  if(p.k==='T'&&p.t>2.3&&Math.abs(P.x-p.x)<14){p.t=0;bubbles.push({x:p.x+p.f*.6,y:p.y-.75,f:p.f,life:2.6,line:pick(L.lines.T)})}
  if(!unseen&&Math.abs(P.x-p.x)<.62&&P.y>p.y-1.7&&P.y-HH<p.y){if(P.inv<=0)say(pick(L.lines[p.k]),p.x,p.y-2.5);hurt('person',p.x)}});
 bubbles=bubbles.filter(function(b){b.x+=b.f*4.4*dt;b.life-=dt;if(solid(Math.floor(b.x),Math.floor(b.y)))b.life=0;
  if(!unseen&&b.life>0&&Math.abs(b.x-P.x)<.62&&b.y>P.y-HH&&b.y<P.y){if(P.inv<=0)say(b.line,P.x,P.y-2.6);hurt('bubble',b.x);b.life=0}return b.life>0});
 says=says.filter(function(s){s.life-=dt;return s.life>0})}

// ---- painting: flat colours and chunky outlines ----
var W=0,H=0,u=30,vw=13,sceneH=0,sceneY=0,dpr=1,cam=0,tall=false,PAD={};
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);tall=H>W;
 u=tall?Math.min(W/12,H*.58/VIEW):Math.min(H/VIEW,W/14);sceneH=VIEW*u;sceneY=tall?0:Math.max(0,(H-sceneH)/2);vw=W/u;
 var r=tall?Math.min(40,W*.1):34;if(tall){var y0=sceneH,h=H-sceneH,cy=y0+h*.45;PAD={l:{x:W*.16,y:cy,r:r},r:{x:W*.16+r*2.5,y:cy,r:r},b:{x:W*.84-r*2.3,y:cy+r*.5,r:r},a:{x:W*.84,y:cy-r*.5,r:r}}}
 else{var by=H-52;PAD={l:{x:54,y:by,r:r},r:{x:54+r*2.5,y:by,r:r},b:{x:W-54-r*2.4,y:by,r:r},a:{x:W-54,y:by-r*.9,r:r}}}}
function ink(w){cx.strokeStyle=INK;cx.lineWidth=w||.08;cx.lineJoin='round';cx.stroke()}
function rr(x,y,w,h,r){cx.beginPath();cx.roundRect(x,y,w,h,r)}
function person(p){var c=cx,col=p.k==='W'?'#ff4f9a':p.k==='T'?'#ff8a1f':'#22b8a5',hair=p.k==='W'?'#b5562a':p.k==='T'?'#5a3a2a':'#e8c15a',bob=p.k==='W'?Math.abs(Math.sin(p.t*8))*.06:Math.sin(p.t*2.4)*.02;
 c.save();c.translate(p.x,p.y);c.scale(p.f,1);
 c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(0,0,.45,.08,0,0,6.2832);c.fill();
 var sw=p.k==='W'?Math.sin(p.t*8)*.16:0;c.fillStyle='#3b4a6b';rr(-.2+sw,-.5,.17,.5,.06);c.fill();ink();rr(.03-sw,-.5,.17,.5,.06);c.fill();ink();
 c.translate(0,-bob);c.fillStyle=col;rr(-.3,-1.25,.6,.85,.18);c.fill();ink();
 c.fillStyle='#ffd0a6';rr(.2,-1.1,.34,.14,.07);c.fill();ink(.06);
 c.fillStyle=hair;c.beginPath();c.arc(-.03,-1.55,.33,0,6.2832);c.fill();ink();c.fillStyle='#ffd0a6';c.beginPath();c.arc(.05,-1.5,.27,0,6.2832);c.fill();ink();
 c.fillStyle=INK;c.beginPath();c.arc(.15,-1.55,.04,0,6.2832);c.fill();c.beginPath();c.ellipse(.17,-1.4,.07,p.k==='T'?.09:.05,0,0,6.2832);c.fill();
 c.restore();
 c.fillStyle='#fff';c.beginPath();c.ellipse(p.x+p.f*.45,p.y-2.15,.3,.2,0,0,6.2832);c.fill();ink(.06);c.fillStyle=col;for(var i=-1;i<2;i++){c.beginPath();c.arc(p.x+p.f*.45+i*.13,p.y-2.15,.04,0,6.2832);c.fill()}}
function bubbleSay(t,x,y,a){var c=cx;c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var w=c.measureText(t).width+.5;x=Math.max(cam+w/2+.1,Math.min(cam+vw-w/2-.1,x));y=Math.max(.5,y);
 c.globalAlpha=a;c.fillStyle='#fff';rr(x-w/2,y-.3,w,.6,.22);c.fill();ink(.07);c.fillStyle=INK;c.fillText(t,x,y+.02);c.globalAlpha=1}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#20222b';c.fillRect(0,0,W,H);
 var want=Math.max(0,Math.min(MW-vw,P.x-vw*(P.f>0?.36:.5)));cam+=(want-cam)*(calm||S.mode==='ready'?1:.1);
 c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.translate(0,sceneY);c.scale(u,u);c.translate(-cam,0);
 var x0=Math.floor(cam)-1,x1=Math.ceil(cam+vw)+1,x,y,t;
 // the wall, with windows on the sky
 c.fillStyle='#f3e3c0';c.fillRect(cam,0,vw,MH);c.fillStyle='#e7d2a6';c.fillRect(cam,6.2,vw,2.8);c.fillStyle='#c9ad7a';c.fillRect(cam,6.12,vw,.12);
 for(x=Math.floor(x0/9)*9+3;x<x1;x+=9){c.fillStyle='#8fd3f4';rr(x,1.2,3,3.2,.12);c.fill();ink();c.fillStyle='#fff';c.beginPath();c.ellipse(x+.9+((x*7)%5)*.2,2.1,.5,.2,0,0,6.2832);c.ellipse(x+1.9,2.9,.6,.22,0,0,6.2832);c.fill();c.fillStyle=INK;c.fillRect(x+1.46,1.2,.08,3.2);c.fillRect(x,2.76,3,.08);
  c.fillStyle='#fff';c.beginPath();c.arc(x+6,2.2,.42,0,6.2832);c.fill();ink();c.beginPath();c.moveTo(x+6,2.2);c.lineTo(x+6,1.95);c.moveTo(x+6,2.2);c.lineTo(x+6.18,2.3);ink(.06)}
 // gaps in the floor are a dark stairwell
 for(x=Math.max(1,x0);x<Math.min(MW-1,x1);x++)if(tile(x,MH-2)==='.'){var pg=c.createLinearGradient(0,MH-2,0,MH);pg.addColorStop(0,'#3a3350');pg.addColorStop(1,'#15131f');c.fillStyle=pg;c.fillRect(x,MH-2,1.01,2.01);c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,MH-1.4,1.01,.08);c.fillRect(x,MH-.7,1.01,.08)}
 // tiles
 for(y=0;y<MH;y++)for(x=Math.max(0,x0);x<Math.min(MW,x1);x++){t=MAP[y].charAt(x);
  if(t==='#'){var topRow=tile(x,y-1)!=='#';c.fillStyle=topRow?'#3fa796':'#2e7f72';c.fillRect(x,y,1.01,1.01);if(topRow){c.fillStyle='#63c7b5';c.fillRect(x,y,1.01,.16);c.fillStyle=INK;c.fillRect(x,y-.04,1.01,.08)}
   if(!solid(x-1,y)&&x>0){c.fillStyle=INK;c.fillRect(x-.04,y,.08,1.01)}if(!solid(x+1,y)&&x<MW-1){c.fillStyle=INK;c.fillRect(x+.96,y,.08,1.01)}}
  else if(t==='F'){c.fillStyle='#9fb2d1';rr(x+.03,y+.03,.94,.97,.05);c.fill();ink();c.fillStyle='#7f93b5';rr(x+.14,y+.16,.72,.3,.04);c.fill();ink(.05);rr(x+.14,y+.58,.72,.3,.04);c.fill();ink(.05);c.fillStyle=INK;c.fillRect(x+.4,y+.28,.2,.06);c.fillRect(x+.4,y+.7,.2,.06)}
  else if(t==='='){c.fillStyle='#d9964f';rr(x-.02,y,1.04,.3,.04);c.fill();c.fillStyle=INK;c.fillRect(x-.02,y-.04,1.04,.08);c.fillRect(x-.02,y+.26,1.04,.08);if(tile(x-1,y)!=='=')c.fillRect(x-.04,y,.08,.3);if(tile(x+1,y)!=='=')c.fillRect(x+.96,y,.08,.3);
   if(tile(x-1,y)!=='='||tile(x+1,y)!=='='){c.fillStyle='#8a5a2b';c.beginPath();var bx=tile(x-1,y)!=='='?x+.25:x+.75;c.moveTo(bx-.12,y+.3);c.lineTo(bx+.12,y+.3);c.lineTo(bx,y+.75);c.closePath();c.fill();ink(.05)}}
  else if(t==='^'){c.fillStyle=INK;c.fillRect(x+.46,y+.55,.08,.35);c.fillRect(x+.15,y+.88,.7,.08);c.fillStyle='#ff5a4f';rr(x+.08,y+.3,.84,.28,.12);c.fill();ink();rr(x+.02,y-.25,.2,.6,.08);c.fill();ink();c.fillStyle='#fff';c.font='800 .28px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('▲',x+.52,y+.44)}
  else if(t==='D'){c.fillStyle='#2f7d4f';rr(x-.1,y-1.1,1.2,2.1,.08);c.fill();ink();c.fillStyle='#3fa76a';rr(x+.02,y-.98,.96,1.98,.05);c.fill();ink(.05);c.fillStyle=YEL;c.beginPath();c.arc(x+.78,y+.1,.07,0,6.2832);c.fill();ink(.04);
   c.fillStyle='#fff';rr(x+.5,y+.2,.34,.55,.06);c.fill();ink(.05);c.fillStyle='#d23b3b';c.font='800 .13px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('DO',x+.67,y+.38);c.fillText('NOT',x+.67,y+.52)}}
 // things to collect
 items.forEach(function(it){if(it.got||it.x<x0||it.x>x1)return;var by=it.y+(calm?0:Math.sin(T*3+it.x)*.06);
  if(it.k==='o'){c.fillStyle='#fff';rr(it.x-.2,by-.14,.36,.36,.07);c.fill();ink(.06);c.beginPath();c.arc(it.x+.2,by+.04,.1,-1.3,1.3);ink(.06);c.fillStyle='#b5723a';c.fillRect(it.x-.14,by-.09,.24,.06)}
  else if(it.k==='N'){c.fillStyle=YEL;c.save();c.translate(it.x,by);c.rotate(-.12);rr(-.28,-.3,.56,.6,.05);c.fill();ink(.06);c.beginPath();c.moveTo(-.14,-.12);c.lineTo(.14,.16);c.moveTo(.14,-.12);c.lineTo(-.14,.16);c.strokeStyle='#d23b3b';c.lineWidth=.09;c.stroke();c.restore()}
  else{c.beginPath();c.arc(it.x,by,.26,3.3,6.1);ink(.09);c.fillStyle='#7a5cff';rr(it.x-.36,by-.08,.18,.3,.06);c.fill();ink(.06);rr(it.x+.18,by-.08,.18,.3,.06);c.fill();ink(.06)}});
 people.forEach(function(p){if(p.x>x0-1&&p.x<x1+1)person(p)});
 bubbles.forEach(function(b){c.fillStyle='#fff';c.beginPath();c.ellipse(b.x,b.y,.42,.3,0,0,6.2832);c.fill();ink();c.beginPath();c.moveTo(b.x-b.f*.25,b.y+.22);c.lineTo(b.x-b.f*.55,b.y+.45);c.lineTo(b.x-b.f*.05,b.y+.28);c.closePath();c.fill();ink(.06);c.fillStyle='#ff8a1f';c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('?!',b.x,b.y+.02)});
 // you
 var k=1.7/HERO.pph,f=P.hood?2:S.mode==='won'?3:!P.ground?1:Math.abs(P.vx)>.5?(Math.floor(P.walkT/.11)%2?1:0):0;
 c.fillStyle='rgba(27,27,42,.2)';c.beginPath();c.ellipse(P.x,Math.min(P.y,MH-2)+.02,.4,.08,0,0,6.2832);if(P.ground)c.fill();
 if(P.phones>0){c.strokeStyle='#7a5cff';c.lineWidth=.07;c.globalAlpha=.5+.3*Math.sin(T*4);c.beginPath();c.arc(P.x,P.y-.85,1.05,0,6.2832);c.stroke();c.globalAlpha=1}
 if(ready&&img.naturalWidth){c.save();c.translate(P.x,P.y+.04);c.scale(P.f,1);c.globalAlpha=P.inv>0?.55:P.hood?.8:1;c.imageSmoothingQuality='high';c.drawImage(img,f*HERO.w,0,HERO.w,HERO.h,-HERO.ax*k,-HERO.base*k,HERO.w*k,HERO.h*k);c.restore();c.globalAlpha=1}
 if(P.hood){c.fillStyle='rgba(27,27,42,.5)';rr(P.x-.5,P.y-1.75,1,.14,.07);c.fill();c.fillStyle=YEL;rr(P.x-.5,P.y-1.75,Math.max(0,P.hoodT/HOODMAX),.14,.07);c.fill()}
 says.forEach(function(s){bubbleSay(s.t,s.x,s.y,Math.min(1,s.life*2))});
 c.restore();
 // the display: battery, tea and notes
 var hx=W-12,hy=sceneY+10;c.fillStyle='rgba(27,27,42,.78)';rr(hx-214,hy,214,28,9);c.fill();hx-=14;
 c.strokeStyle=CREAM;c.lineWidth=2;rr(hx-188,hy+6,64,16,4);c.stroke();c.fillStyle=CREAM;c.fillRect(hx-122,hy+10,3,8);c.fillStyle=S.batt>.3?YEL:'#ff6a4f';c.fillRect(hx-185,hy+9,58*Math.max(0,S.batt),10);
 c.fillStyle=CREAM;c.font='700 12px Montserrat,system-ui,sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('TEA '+S.tea,hx-110,hy+15);c.fillText('NOTES '+S.notes+'/3',hx-62,hy+15);
 if(!ready){c.fillStyle=CREAM;c.textAlign='center';c.font='600 14px Montserrat,system-ui,sans-serif';c.fillText('Unrolling the carpet…',W/2,sceneY+sceneH/2)}
 // the buttons, laid out like an old handheld
 if(tall){c.fillStyle='#2b2e3a';c.fillRect(0,sceneH,W,H-sceneH);c.fillStyle='#14151c';c.fillRect(0,sceneH,W,4)}
 if(S.mode==='play'||S.mode==='ready')[['l','◀'],['r','▶'],['b','B'],['a','A']].forEach(function(q){var b=PAD[q[0]],on=!!btn[q[0]],round=q[0]==='a'||q[0]==='b';c.globalAlpha=tall?1:.8;
  c.fillStyle=on?YEL:round?'#c9364a':'#3d4152';c.beginPath();if(round)c.arc(b.x,b.y,b.r,0,6.2832);else c.roundRect(b.x-b.r,b.y-b.r,b.r*2,b.r*2,10);c.fill();c.strokeStyle='#14151c';c.lineWidth=3;c.stroke();
  c.fillStyle=on?'#1c1611':CREAM;c.font='800 '+Math.round(b.r*.7)+'px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(q[1],b.x,b.y+1);
  if(round){c.font='700 10px Montserrat,system-ui,sans-serif';c.fillStyle=CREAM;c.globalAlpha=.75;c.fillText(q[0]==='a'?'JUMP':'HOOD UP',b.x,b.y+b.r+12)}c.globalAlpha=1})}
var last=0;function loop(now){var dt=Math.min(.033,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden&&ready)update(dt);draw();requestAnimationFrame(loop)}

// ---- thumbs and keys ----
var ptr={};
function which(e){var b=cv.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,best=null,bd=1e9;['l','r','a','b'].forEach(function(n){var p=PAD[n],d=Math.hypot(x-p.x,y-p.y);if(d<p.r+22&&d<bd){bd=d;best=n}});
 if(!best&&x<W*.5&&(!tall||y>sceneH))best=x<(PAD.l.x+PAD.r.x)/2?'l':'r';return best}
function sync(){btn={};for(var id in ptr)if(ptr[id])btn[ptr[id]]=1}
cv.addEventListener('pointerdown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;e.preventDefault();var n=which(e);ptr[e.pointerId]=n;if(n==='a')jumpQ=.12;sync();try{cv.setPointerCapture(e.pointerId)}catch(_){}});
cv.addEventListener('pointermove',function(e){if(!(e.pointerId in ptr))return;var was=ptr[e.pointerId];if(was==='l'||was==='r'){var n=which(e);if(n==='l'||n==='r'){ptr[e.pointerId]=n;sync()}}});
function up(e){delete ptr[e.pointerId];sync()}cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
addEventListener('keydown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;var k=e.key.length===1?e.key.toLowerCase():e.key;if(/^(Arrow(Left|Right|Up|Down)|Shift| |[adwszx])$/.test(k)){if(!e.repeat&&(k==='z'||k===' '||k==='ArrowUp'||k==='w'))jumpQ=.12;keys[k]=1;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});addEventListener('blur',function(){keys={};ptr={};btn={}});
$('pggo').addEventListener('click',function(){$('pgcard').hidden=true;cv.focus()});
$('pgcb').addEventListener('click',function(){$('pgcard').hidden=true;reset()});
addEventListener('resize',lay);reset();lay();requestAnimationFrame(loop);
// Hooks for the automatic play-tests.
window.__pg={S:function(){return S},P:function(){return P},people:function(){return people},items:function(){return items},bubbles:function(){return bubbles},map:MAP,ready:function(){return ready},
 press:function(n,on){if(on){btn[n]=1;if(n==='a')jumpQ=.12}else delete btn[n]},step:function(n){for(var i=0;i<n;i++)update(1/60)}};
})();`;

export function platformPage(page, hub, v) {
  const j = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__LEVEL__", () => j(LEVEL)).replace("__HERO__", () => j(ART.hero)).replace("__FAILS__", () => j(FAILS)).replace("__SRC__", () => j(hub.path + "/stealth?v=" + v + "&a="));
  return page(TITLE, `<style>${CSS}</style><div class="pg" id="pg">
<canvas id="pgc" tabindex="0" role="img" aria-label="A side-scrolling platform game set in an office. Use the on-screen arrows to run, A to jump and B to put your hood up. On a keyboard: arrow keys to run, Z or Space to jump, X or Shift to put your hood up."></canvas>
<div class="card" id="pgcard"><div>
<div id="pgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>${LEVEL.name}. The door is at the far end. Everyone between you and it would love a chat.</p>
<ul><li><b>◀ ▶</b> run. <b>A</b> jumps: hold it to jump higher.</li><li><b>B</b> is Hood Up: sit tight and nobody notices you for a couple of seconds.</li><li><b>Touch a person or a speech bubble</b> and it costs a quarter of your social battery.</li><li><b>Tea</b> tops it up. Three <b>plans-cancelled notes</b> are hidden. <b>Office chairs</b> bounce.</li></ul>
<p class="sm">A test level with stand-in art. No sound. On a computer: arrow keys, Z or Space to jump, X or Shift for Hood Up.</p>
<p class="go"><button class="btn" id="pggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="pgend" hidden><p class="pre">Introvert Here…</p><h2 id="pgch"></h2><p id="pgcp"></p><p class="sm" id="pgcs"></p>
<p class="go"><button class="btn" id="pgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A platform game for introverts: get out of the office without being drawn into a conversation.", script });
}
