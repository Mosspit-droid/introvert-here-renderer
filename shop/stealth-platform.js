// The stealth game as a small platformer (Barry, 21 Nov): old-handheld feel, two actions, one proper level.
//
// You are trying to get out of the office to the door at the far end. You cannot hurt anyone. Touching a person, or one
// of a talker's speech bubbles, is a conversation: it knocks a quarter off your social battery. Jump (A) over and around
// them. Hood Up (B): sit down, hood tight, and for a couple of seconds nobody notices you, but you cannot move.
// Steering is a thumb pad (gradual), with extra grip in the air. Low ceilings make Hood Up the only way through.
// Quiet rooms are checkpoints. Chasers run at you for a few seconds when you come near, then need a rest.
// Coffee: fast legs for six seconds. Phone: a fake call that lets one person or bubble go by for free.
// Tea tops the battery up; three "plans cancelled" notes are hidden for the thorough; headphones make you un-talk-to-able
// for a few seconds; office chairs bounce you. Fall down a gap and you lose a quarter and go back to the last safe spot.
//
// The hero, the people and the objects are Barry's flat "sticker" drawings (stealth-art/src/hero-*.png, flat-*.png).
// The floor, walls, windows and shelves are drawn in code. Wording is draft for Barry.
import { ART } from "./stealth-art/art.js";

const TITLE = "Just Passing Through";   // working title

// The office: 250 squares long and 20 high (two storeys; the screen shows 11). Built from a list of placements so the
// rows cannot come out different lengths.
// # floor, wall or ceiling  F filing cabinet (solid)  = shelf or desk (jump up through it)  ^ office chair (bounces you)
// o tea  N plans-cancelled note  H headphones  c coffee (speed)  m phone call (one free pass)  K quiet room (checkpoint)  D the door out  S start
// P stander  W walker  T talker (speech bubbles)  C chaser (runs at you)  w where a walker turns round (invisible)
function office() {
  const W = 250, H = 20, G = 17, U = 8, g = Array.from({ length: H }, () => Array(W).fill("."));
  const put = (x, y, c) => { g[y][x] = c; }, row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) put(x, y, c); }, box = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) row(x0, x1, y, c); };
  const pit = (x0, x1) => box(x0, x1, 18, 19, "."), hole = (x0, x1) => box(x0, x1, 9, 10, ".");
  box(0, W - 1, 18, 19, "#"); box(0, 0, 0, 19, "#"); box(W - 1, W - 1, 0, 19, "#");
  put(2, G, "S");
  // 1. A gentle start: tea, a desk, the first person to hop over, a gap, cabinets, a walker under a shelf (note 1)
  row(5, 7, G, "o"); row(9, 11, 16, "="); put(10, 15, "o"); put(14, G, "P");
  pit(18, 20); put(18, 15, "o"); put(19, 14, "o"); put(20, 15, "o");
  put(24, G, "F"); box(25, 26, 16, G, "F"); put(31, G, "W"); row(28, 32, 14, "="); put(30, 13, "N");
  // 2. An office chair up to a high shelf (tea, headphones), then a talker
  put(36, G, "^"); row(38, 43, 12, "="); row(39, 41, 11, "o"); put(43, 11, "H"); put(48, G, "T");
  // 3. Two low corridors where you cannot jump: Hood Up is the only way past the speech bubbles, then past a walker
  box(53, 60, 13, 15, "#"); row(55, 58, G, "o"); put(63, G, "T");
  box(67, 74, 13, 15, "#"); put(66, G, "w"); put(71, G, "W"); put(75, G, "w");
  put(77, G, "K");
  // 4. Up to the first floor: a staircase of cabinets with a chair on top
  put(79, G, "F"); box(80, 81, 16, G, "F"); box(82, 84, 15, G, "F"); put(84, 14, "^"); box(86, 150, 9, 10, "#");
  // 5. The first floor: holes to fall through, a chaser, a chair up to note 2, a talker. Below it, the all-hands meeting.
  row(89, 91, U, "o"); put(94, U, "W"); hole(98, 100); put(106, U, "C"); hole(112, 116); row(113, 114, 9, "=");
  put(118, U, "^"); row(120, 124, 5, "="); put(122, 4, "N"); row(120, 121, 4, "o"); put(128, U, "T"); hole(134, 137); row(139, 141, U, "o"); put(144, U, "W");
  for (let x = 93; x <= 147; x += 6) put(x, G, "P");   // spaced so each can be hopped; the first floor is the easier way
  put(88, G, "m"); put(103, U, "c");
  put(153, G, "K");
  // 6. The canteen: tables, a talker, a chaser, a birthday huddle with a way over the top (note 3), a gap
  row(158, 160, 16, "="); row(158, 160, 15, "o"); put(163, G, "T"); row(165, 167, 16, "="); put(168, G, "c"); put(170, G, "m"); put(172, G, "C");
  row(175, 176, 15, "="); row(179, 183, 13, "="); put(182, 12, "N"); row(178, 180, G, "P"); pit(187, 189); put(188, 14, "o");
  // (The w at 227 keeps the last chaser back from where you land after the gap.)
  // 7. The way out: islands with a walker, a cabinet staircase, a leap over someone and a gap, a chaser, a talker, the door
  put(193, G, "K");
  pit(198, 200); pit(205, 208); row(206, 207, G, "=");   // the island between the gaps is empty: somewhere to land
  put(212, G, "F"); box(213, 213, 16, G, "F"); box(214, 215, 15, G, "F"); pit(221, 224); row(222, 223, 15, "="); row(222, 223, 14, "o");
  put(227, G, "w"); put(228, G, "c"); put(232, G, "C"); row(233, 235, G, "o"); put(238, G, "T"); put(244, G, "D");
  return g.map((r) => r.join(""));
}
const LEVEL = { name: "The Office", map: office(), signs: [{ x: 50.6, y: 14.2, t: "LOW CEILING" }, { x: 50.6, y: 14.9, t: "HOLD B: HOOD UP" }, { x: 76.6, y: 13.6, t: "UPSTAIRS IS QUIETER" }, { x: 89.5, y: 13.2, t: "ALL-HANDS MEETING" }],
  lines: { P: ["Have you got a sec?", "You’ll like this one.", "Are you coming to the thing?"], W: ["Ooh, just the person!", "Walk with me.", "Quick question."], T: ["How ARE you?", "Any plans for the weekend?", "Did you get my email?"], C: ["Come here, you!", "There you are!", "Don’t you run off!"], pit: ["You fell into a team-building exercise."] } };
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
var L=__LEVEL__,ART=__ART__,HERO=ART.hero,FAILS=__FAILS__,SRC=__SRC__;
var $=function(i){return document.getElementById(i)},box=$('pg'),cv=$('pgc'),cx=cv.getContext('2d'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var IMG={},waiting=0,ready=false;Object.keys(ART).forEach(function(n){waiting++;var im=new Image();im.onload=im.onerror=function(){if(--waiting<=0)ready=true};im.src=SRC+n;IMG[n]=im});var img=IMG.hero,PPT=ART['flat-things'].ppt;
var MAP=L.map,MW=MAP[0].length,MH=MAP.length,VIEW=11,INK='#1b1b2a',YEL='#fad00c',CREAM='#f6efe0';
// Feel: squares per second. A full jump clears about 3.6 squares; letting go early cuts it short.
var RUN=5.6,ACC=46,AIR=78,JUMP=17,GRAV=42,FALLMAX=22,HOODMAX=2.4,HW=.3,HH=1.5;
function tile(x,y){return y<0?'.':y>=MH?'.':x<0||x>=MW?'#':MAP[y].charAt(x)}
function solid(x,y){var c=tile(x,y);return c==='#'||c==='F'}

var S,P,people,items,bubbles,says,pops=[],T=0,keys={},btn={},stick=null,jumpQ=0,look=null,lookX=0,lookY=0,bcx=0,bcy=0;   // look = a finger dragging the picture to look around (the game waits)
function reset(){people=[];items=[];bubbles=[];says=[];pops=[];var sx=2,sy=8;
 for(var y=0;y<MH;y++)for(var x=0;x<MW;x++){var c=MAP[y].charAt(x);
  if(c==='S'){sx=x;sy=y}else if(c==='P'||c==='W'||c==='T'||c==='C')people.push({k:c,x:x+.5,y:y+1,f:-1,t:Math.random()*2,i:people.length,run:0,rest:0})
  else if('oNHcm'.indexOf(c)>=0)items.push({k:c,x:x+.5,y:y+.5,got:false})}
 P={x:sx+.5,y:sy+1,vx:0,vy:0,f:1,ground:true,coy:0,hood:false,hoodT:HOODMAX,cool:0,inv:0,phones:0,fast:0,shield:false,walkT:0,safe:[sx+.5,sy+1],wave:0};
 S={mode:'ready',batt:1,tea:0,notes:0,t:0,hits:0,cp:null,tries:0};keys={};btn={};stick=null;jumpQ=0;look=null;lookX=lookY=0}
// Battery flat with a quiet room behind you: carry on from there with a full battery (what you collected stays collected).
function again(){if(!S.cp){reset();return}P.x=S.cp[0];P.y=S.cp[1];P.vx=P.vy=0;P.inv=1.5;P.hood=false;P.hoodT=HOODMAX;P.phones=0;P.safe=[P.x,P.y];S.batt=1;S.mode='play';S.tries++;bubbles=[];says=[];people.forEach(function(p){p.run=0;p.rest=1})}
function flat(){S.mode='lost';card('Social battery flat.',pick(FAILS),S.cp?'Back to the last quiet room.':'Back to your desk. Nobody saw anything.','Try again')}
function say(t,x,y){says.push({t:t,x:x,y:y,life:1.8})}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function hurt(why,from){if(P.inv>0||S.mode!=='play')return;if(P.shield&&why!=='fell'){P.shield=false;P.inv=1.3;say('Sorry, on a call.',P.x,P.y-2.7);return}S.why=why;S.batt-=.25;S.hits++;P.inv=1.6;P.hood=false;P.vy=-8;P.vx=(from!=null&&from>P.x?-1:1)*5;P.ground=false;
 if(S.batt<=.001)flat()}
function card(h,p,sm,b){$('pgch').textContent=h;$('pgcp').textContent=p;$('pgcs').textContent=sm;$('pgcb').textContent=b;$('pgintro').hidden=true;$('pgend').hidden=false;$('pgcard').hidden=false;$('pgcb').focus()}
function win(){S.mode='won';P.wave=1;var total=items.filter(function(i){return i.k==='o'}).length;
 card('You’re out.',S.hits===0?'Not one conversation. They’ll assume you’re still at your desk.':S.hits===1?'One conversation endured. You nodded in all the right places.':S.hits+' conversations endured. You are owed a quiet weekend.',
  'Tea '+S.tea+' of '+total+' · Plans cancelled '+S.notes+' of 3 · '+Math.round(S.t)+' seconds','Go again')}

// ---- one tick ----
// How hard you are steering, -1 to 1: keys are all or nothing, the thumb pad is gradual.
function steer(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);if(k)return k;if(!stick)return 0;var v=stick.v,m=Math.abs(v);return m<.18?0:(v>0?1:-1)*Math.min(1,.35+(m-.18)/.5*.65)}function hoodKey(){return keys.x||keys.Shift||keys.ArrowDown||keys.s||btn.b}function jumpKey(){return keys.z||keys[' ']||keys.ArrowUp||keys.w||btn.a}
function update(dt){if(S.mode!=='play'&&S.mode!=='ready')return;if(look)return;
 var sv=steer(),d=sv>0?1:sv<0?-1:0;if(S.mode==='ready'&&(d||jumpQ>0||hoodKey()))S.mode='play';if(S.mode==='play')S.t+=dt;
 if(P.inv>0)P.inv-=dt;if(P.phones>0)P.phones-=dt;if(P.fast>0)P.fast-=dt;if(P.cool>0)P.cool-=dt;if(jumpQ>0)jumpQ-=dt;
 // Hood Up: on the ground, while B is held and there is hood left
 var want=hoodKey()&&P.ground&&P.cool<=0&&P.hoodT>0&&S.mode==='play';
 if(want){P.hood=true;P.hoodT-=dt;if(P.hoodT<=0){P.hood=false;P.cool=1.5}}else{if(P.hood)P.cool=Math.max(P.cool,.4);P.hood=false;if(!hoodKey())P.hoodT=Math.min(HOODMAX,P.hoodT+dt*1.2)}
 if(P.hood){d=0;sv=0}
 // running
 var tv=sv*RUN*(P.fast>0?1.45:1),ac=(P.ground?ACC:AIR)*dt;if(P.vx<tv)P.vx=Math.min(tv,P.vx+ac);else if(P.vx>tv)P.vx=Math.max(tv,P.vx-ac);if(d)P.f=d;   // quicker to turn in the air than on the carpet
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
 P.y=ny;if(P.ground&&Math.abs(P.vx)>.5)P.walkT+=dt;if(P.landT>0)P.landT-=dt;if(P.ground&&!wasGround&&P.fell>6)P.landT=.12;P.fell=P.ground?0:Math.max(P.fell||0,P.vy);
 // an office chair: step or land on it and up you go
 var cyy=Math.floor(P.y-.01),onChair=tile(Math.floor(P.x),cyy)==='^'||tile(Math.floor(P.x+.55),cyy)==='^'||tile(Math.floor(P.x-.55),cyy)==='^';if(P.vy>=0&&onChair&&P.y>=cyy+.15){   // generous: brush against it and up you go
  P.vy=-23;P.sprung=true;P.ground=false;P.coy=0;jumpQ=0;P.hood=false}
 if(P.ground&&solid(Math.floor(P.x),Math.floor(P.y+.1))&&solid(Math.floor(P.x-1),Math.floor(P.y+.1))&&solid(Math.floor(P.x+1),Math.floor(P.y+.1)))P.safe=[P.x,P.y];
 if(P.y>MH+2){P.inv=0;S.why='fell';S.batt-=.25;S.hits++;say(L.lines.pit[0],P.safe[0],P.safe[1]-2.4);P.x=P.safe[0];P.y=P.safe[1];P.vx=P.vy=0;P.inv=1.6;if(S.batt<=.001){flat();return}}
 // collecting
 items.forEach(function(it){if(it.got||Math.abs(it.x-P.x)>.7||Math.abs(it.y-(P.y-HH/2))>1)return;it.got=true;pops.push({x:it.x,y:it.y,life:.6,big:it.k!=='o'});
  if(it.k==='o'){S.tea++;S.batt=Math.min(1,S.batt+.08);S.glow=.5}else if(it.k==='N'){S.notes++;say('Plans cancelled!',it.x,it.y-1)}else if(it.k==='c'){P.fast=6;say('Coffee! Fast legs.',it.x,it.y-1)}else if(it.k==='m'){P.shield=true;say('Fake phone call ready.',it.x,it.y-1)}else{P.phones=7;say('Headphones on.',it.x,it.y-1)}});
 // a quiet room: a checkpoint, and a breather
 var kx=Math.floor(P.x),ky=Math.floor(P.y-.5);if(tile(kx,ky)==='K'&&(!S.cp||S.cp[0]!==kx+.5)){S.cp=[kx+.5,ky+1];S.batt=Math.min(1,S.batt+.25);say('Quiet room. Nobody in here.',kx+.5,ky-1.4)}
 // the door
 var dx=Math.floor(P.x),dy=Math.floor(P.y-.5);if(tile(dx,dy)==='D'||tile(dx,dy+1)==='D'||tile(dx,dy+2)==='D'||tile(dx,dy+3)==='D'){win();return}   // through the door, or sailing over the top of it
 // people: standers stand, walkers walk between obstacles, talkers send out speech bubbles
 var unseen=P.hood||P.phones>0;
 people.forEach(function(p){p.t+=dt;
  var near=Math.abs(P.y-p.y)<2.2&&Math.abs(P.x-p.x)<7;
  if(p.k==='C'){if(p.rest>0)p.rest-=dt;else if(p.run>0){p.run-=dt;if(p.run<=0)p.rest=2.2}else if(near&&!unseen&&S.mode==='play'){p.run=3.1;p.wind=.55;say(pick(L.lines.C),p.x,p.y-2.5)}
   if(p.wind>0)p.wind-=dt;else if(p.run>0){if(!unseen)p.f=P.x<p.x?-1:1;var cx2=p.x+p.f*.5;if(!(solid(Math.floor(cx2),Math.floor(p.y-.5))||tile(Math.floor(cx2),Math.floor(p.y-.5))==='w'||!solid(Math.floor(cx2),Math.floor(p.y+.1))))p.x+=p.f*3.7*dt}}
  else if(p.k==='W'){var ax=p.x+p.f*.5,blocked=solid(Math.floor(ax),Math.floor(p.y-.5))||'^w'.indexOf(tile(Math.floor(ax),Math.floor(p.y-.5)))>=0||!solid(Math.floor(ax),Math.floor(p.y+.1))||people.some(function(o){return o!==p&&Math.abs(o.y-p.y)<.5&&Math.abs(o.x-ax)<.5});if(blocked)p.f=-p.f;else p.x+=p.f*2.1*dt}
  else if(Math.abs(P.x-p.x)<9&&Math.abs(P.y-p.y)<3)p.f=P.x<p.x?-1:1;
  if(p.k==='T'&&p.t>2&&Math.abs(P.x-p.x)<14&&Math.abs(P.y-p.y)<3){p.t=0;bubbles.push({x:p.x+p.f*.6,y:p.y-.75,f:p.f,life:2.6,line:pick(L.lines.T)})}
  if(!unseen&&Math.abs(P.x-p.x)<.62&&P.y>p.y-1.95&&P.y-HH<p.y){if(P.inv<=0)say(pick(L.lines[p.k]),p.x,p.y-2.5);hurt(p.k,p.x)}});
 bubbles=bubbles.filter(function(b){b.x+=b.f*4.4*dt;b.life-=dt;if(solid(Math.floor(b.x),Math.floor(b.y)))b.life=0;
  if(!unseen&&b.life>0&&Math.abs(b.x-P.x)<.62&&b.y>P.y-HH&&b.y<P.y){if(P.inv<=0)say(b.line,P.x,P.y-2.6);hurt('bubble',b.x);b.life=0}return b.life>0});
 says=says.filter(function(s){s.life-=dt;return s.life>0});pops=pops.filter(function(q){q.life-=dt;return q.life>0});if(S.glow>0)S.glow-=dt}

// ---- painting: flat colours and chunky outlines ----
var W=0,H=0,u=30,vw=13,sceneH=0,sceneY=0,dpr=1,cam=0,camY=0,tall=false,PAD={};
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);tall=H>W;
 u=tall?Math.min(W/12,H*.58/VIEW):Math.min(H/VIEW,W/14);sceneH=VIEW*u;sceneY=tall?0:Math.max(0,(H-sceneH)/2);vw=W/u;
 var r=tall?Math.min(44,W*.11):Math.min(46,H*.11);if(tall){var y0=sceneH,h=H-sceneH,cy=y0+Math.min(h*.34,h/2);PAD={s:{x:W*.24,y:cy,r:r*1.25},b:{x:W*.86-r*2.3,y:cy+r*.55,r:r},a:{x:W*.86,y:cy-r*.55,r:r}}}
 else{var by=H-Math.max(96,H*.2);PAD={s:{x:Math.max(86,W*.1),y:by,r:r*1.25},b:{x:W-Math.max(70,W*.07)-r*2.4,y:by+r*.3,r:r},a:{x:W-Math.max(70,W*.07),y:by-r*.7,r:r}}}}
function ink(w){cx.strokeStyle=INK;cx.lineWidth=w||.08;cx.lineJoin='round';cx.stroke()}
function rr(x,y,w,h,r){cx.beginPath();cx.roundRect(x,y,w,h,r)}
// People, from Barry's flat sheets. Standers come in three kinds; each has an idle pose and a talking one.
function sprite(name,frame,x,y,flip,k){var a=ART[name],im=IMG[name];if(!im.naturalWidth)return;cx.save();cx.translate(x,y);if(flip)cx.scale(-1,1);cx.drawImage(im,frame*a.w,0,a.w,a.h,-a.ax*k,-a.base*k,a.w*k,a.h*k);cx.restore()}
function person(p){var c=cx,k=1/PPT,near=Math.abs(P.x-p.x)<3.2&&Math.abs(P.y-p.y)<2.5;c.fillStyle='rgba(27,27,42,.18)';c.beginPath();c.ellipse(p.x,p.y,.5,.08,0,0,6.2832);c.fill();
 if(p.k==='W')sprite('flat-movers',Math.floor(p.t/.13)%4,p.x,p.y+.03,p.f<0,k);
 else if(p.k==='C'){sprite('flat-movers',p.wind>0?5:p.run>0?4+Math.floor(p.t/.1)%3:p.rest>0?7:5,p.x,p.y+.03,p.f<0,k);
  if(p.run>0||p.rest>0){c.fillStyle='#fff';c.beginPath();c.ellipse(p.x,p.y-2.45,.26,.2,0,0,6.2832);c.fill();ink(.06);c.fillStyle='#e0303a';c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(p.run>0?'!':'~',p.x,p.y-2.44)}}
 else if(p.k==='T')sprite('flat-people',p.t<.55?3:2,p.x,p.y+.03,p.f<0,k);
 else sprite('flat-people',[0,4,6][p.i%3]+(near?1:0),p.x,p.y+.03,p.f<0,k)}
function thing(name,x,y,w,flip){var it=ART['flat-things'].items[name],im=IMG['flat-things'],k=1/PPT;if(!im.naturalWidth)return;var dw=(w||it.w*k),dh=it.h*k*(w?w/(it.w*k):1);cx.save();cx.translate(x,y);if(flip)cx.scale(-1,1);cx.drawImage(im,it.x,ART['flat-things'].H-it.h,it.w,it.h,-dw/2,-dh,dw,dh);cx.restore()}
function bubbleSay(t,x,y,a){var c=cx;c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var w=c.measureText(t).width+.5;x=Math.max(cam+w/2+.1,Math.min(cam+vw-w/2-.1,x));y=Math.max(camY+.5,y);
 c.globalAlpha=a;c.fillStyle='#fff';rr(x-w/2,y-.3,w,.6,.22);c.fill();ink(.07);c.fillStyle=INK;c.fillText(t,x,y+.02);c.globalAlpha=1}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#20222b';c.fillRect(0,0,W,H);
 cam=bcx;camY=bcy;var snap=calm||S.mode==='ready',want=Math.max(0,Math.min(MW-vw,P.x-vw*(P.f>0?.36:.5))),wy=Math.max(0,Math.min(MH-VIEW,P.y-VIEW*.68));cam+=(want-cam)*(snap?1:.1);camY+=(wy-camY)*(snap?1:.07);
 bcx=cam;bcy=camY;if(!look){lookX*=.8;lookY*=.8;if(Math.abs(lookX)<.02)lookX=0;if(Math.abs(lookY)<.02)lookY=0}cam=Math.max(0,Math.min(MW-vw,cam+lookX));camY=Math.max(0,Math.min(MH-VIEW,camY+lookY));
 c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.translate(0,sceneY);c.scale(u,u);c.translate(-cam,-camY);
 var x0=Math.floor(cam)-1,x1=Math.ceil(cam+vw)+1,x,y,t;
 // the wall, with windows on the sky
 c.fillStyle='#f3e3c0';c.fillRect(cam,0,vw,MH);c.fillStyle='#e7d2a6';c.fillRect(cam,MH-4.8,vw,2.8);c.fillStyle='#c9ad7a';c.fillRect(cam,MH-4.88,vw,.12);
 for(x=Math.floor(x0/9)*9+3;x<x1;x+=9)[1.4,MH-9.4].forEach(function(wy0,k){if(solid(x+1,Math.floor(wy0+1))||solid(x+1,Math.floor(wy0+3.4))||solid(x+1,Math.floor(wy0-.6)))return;
  c.fillStyle='#8fd3f4';rr(x,wy0,3,3.2,.12);c.fill();ink();c.fillStyle='#fff';c.beginPath();c.ellipse(x+.9+((x*7+k*3)%5)*.2,wy0+.9,.5,.2,0,0,6.2832);c.ellipse(x+1.9,wy0+1.7,.6,.22,0,0,6.2832);c.fill();c.fillStyle=INK;c.fillRect(x+1.46,wy0,.08,3.2);c.fillRect(x,wy0+1.56,3,.08);
  if(!solid(x+6,Math.floor(wy0+1))){c.fillStyle='#fff';c.beginPath();c.arc(x+6,wy0+1,.42,0,6.2832);c.fill();ink();c.beginPath();c.moveTo(x+6,wy0+1);c.lineTo(x+6,wy0+.75);c.moveTo(x+6,wy0+1);c.lineTo(x+6.18,wy0+1.1);ink(.06)}});
 (L.signs||[]).forEach(function(sg){c.font='800 .34px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var w=c.measureText(sg.t).width+.5;c.fillStyle=YEL;rr(sg.x-w/2,sg.y-.3,w,.6,.1);c.fill();ink(.07);c.fillStyle=INK;c.fillText(sg.t,sg.x,sg.y+.02)});
 // gaps in the floor are a dark stairwell
 for(x=Math.max(1,x0);x<Math.min(MW-1,x1);x++)if(tile(x,MH-2)==='.'){var pg=c.createLinearGradient(0,MH-2,0,MH);pg.addColorStop(0,'#3a3350');pg.addColorStop(1,'#15131f');c.fillStyle=pg;c.fillRect(x,MH-2,1.01,2.01);c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,MH-1.4,1.01,.08);c.fillRect(x,MH-.7,1.01,.08)}
 // safety tape round the gaps
 for(x=Math.max(1,x0);x<Math.min(MW-1,x1);x++)if(tile(x,MH-2)==='.'){var lf=tile(x-1,MH-2)==='#',rt=tile(x+1,MH-2)==='#';[[lf,x],[rt,x+1]].forEach(function(q){if(!q[0])return;c.fillStyle='#ff8a1f';c.beginPath();c.moveTo(q[1]-.14,MH-2);c.lineTo(q[1]+.14,MH-2);c.lineTo(q[1]+.05,MH-2.7);c.lineTo(q[1]-.05,MH-2.7);c.closePath();c.fill();ink(.06);c.fillStyle='#fff';c.fillRect(q[1]-.08,MH-2.45,.16,.12)});
  c.fillStyle=YEL;c.fillRect(x,MH-2.62,1.01,.16);c.fillStyle=INK;for(var sx=0;sx<4;sx++){c.beginPath();c.moveTo(x+sx*.25,MH-2.62);c.lineTo(x+sx*.25+.1,MH-2.62);c.lineTo(x+sx*.25+.2,MH-2.46);c.lineTo(x+sx*.25+.1,MH-2.46);c.closePath();c.fill()}c.fillRect(x,MH-2.64,1.01,.03);c.fillRect(x,MH-2.47,1.01,.03)}
 // tiles
 for(y=Math.max(0,Math.floor(camY)-1);y<Math.min(MH,Math.ceil(camY+VIEW)+2);y++)for(x=Math.max(0,x0);x<Math.min(MW,x1);x++){t=MAP[y].charAt(x);
  if(t==='F'){thing('cabinet',x+.5,y+1.02,1.04)}
  else if(t==='^'){thing('chair',x+.5,y+1.02,1.45)}
  else if(t==='D'){thing('exit',x+.5,y+1.02)}
  else if(t==='K'){thing('quiet',x+.5,y+1.02);if(S.cp&&S.cp[0]===x+.5){c.fillStyle='#3fd16a';c.beginPath();c.arc(x+.5,y-.95,.16,0,6.2832);c.fill();ink(.06)}}
  else if(t==='k'){var on=S.cp&&S.cp[0]===x+.5;c.fillStyle='#3d5a8c';rr(x-.1,y-1.1,1.2,2.1,.08);c.fill();ink();c.fillStyle=on?'#ffe9a8':'#5b7db8';rr(x+.02,y-.98,.96,1.98,.05);c.fill();ink(.05);c.fillStyle=INK;c.font='800 .2px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('QUIET',x+.5,y-.5);c.fillText('ROOM',x+.5,y-.25);c.fillStyle=on?'#3fa76a':'#d23b3b';c.beginPath();c.arc(x+.5,y+.25,.12,0,6.2832);c.fill();ink(.05)}
  else if(t==='#'){var under=tile(x,y+1)!=='#'&&y<MH-1;if(under){c.fillStyle=INK;c.fillRect(x,y+.97,1.01,.07)}var topRow=tile(x,y-1)!=='#';c.fillStyle=topRow?'#3fa796':'#2e7f72';c.fillRect(x,y,1.01,1.01);if(under){c.fillStyle=INK;c.fillRect(x,y+.96,1.01,.08)}if(topRow){c.fillStyle='#63c7b5';c.fillRect(x,y,1.01,.16);c.fillStyle=INK;c.fillRect(x,y-.04,1.01,.08)}
   if(!solid(x-1,y)&&x>0){c.fillStyle=INK;c.fillRect(x-.04,y,.08,1.01)}if(!solid(x+1,y)&&x<MW-1){c.fillStyle=INK;c.fillRect(x+.96,y,.08,1.01)}}
  else if(t==='F'){c.fillStyle='#9fb2d1';rr(x+.03,y+.03,.94,.97,.05);c.fill();ink();c.fillStyle='#7f93b5';rr(x+.14,y+.16,.72,.3,.04);c.fill();ink(.05);rr(x+.14,y+.58,.72,.3,.04);c.fill();ink(.05);c.fillStyle=INK;c.fillRect(x+.4,y+.28,.2,.06);c.fillRect(x+.4,y+.7,.2,.06)}
  else if(t==='='){c.fillStyle='#d9964f';rr(x-.02,y,1.04,.3,.04);c.fill();c.fillStyle=INK;c.fillRect(x-.02,y-.04,1.04,.08);c.fillRect(x-.02,y+.26,1.04,.08);if(tile(x-1,y)!=='=')c.fillRect(x-.04,y,.08,.3);if(tile(x+1,y)!=='=')c.fillRect(x+.96,y,.08,.3);
   if(tile(x-1,y)!=='='||tile(x+1,y)!=='='){c.fillStyle='#8a5a2b';c.beginPath();var bx=tile(x-1,y)!=='='?x+.25:x+.75;c.moveTo(bx-.12,y+.3);c.lineTo(bx+.12,y+.3);c.lineTo(bx,y+.75);c.closePath();c.fill();ink(.05)}}
  else if(t==='^'){c.fillStyle=INK;c.fillRect(x+.46,y+.55,.08,.35);c.fillRect(x+.15,y+.88,.7,.08);c.fillStyle='#ff5a4f';rr(x+.08,y+.3,.84,.28,.12);c.fill();ink();rr(x+.02,y-.25,.2,.6,.08);c.fill();ink();c.fillStyle='#fff';c.font='800 .28px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('▲',x+.52,y+.44)}
  else if(t==='D'){c.fillStyle='#2f7d4f';rr(x-.1,y-1.1,1.2,2.1,.08);c.fill();ink();c.fillStyle='#3fa76a';rr(x+.02,y-.98,.96,1.98,.05);c.fill();ink(.05);c.fillStyle=YEL;c.beginPath();c.arc(x+.78,y+.1,.07,0,6.2832);c.fill();ink(.04);
   c.fillStyle='#fff';rr(x+.5,y+.2,.34,.55,.06);c.fill();ink(.05);c.fillStyle='#d23b3b';c.font='800 .13px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('DO',x+.67,y+.38);c.fillText('NOT',x+.67,y+.52)}}
 // things to collect
 items.forEach(function(it){if(it.got||it.x<x0||it.x>x1)return;var up=it.k!=='o',by=it.y+(calm?0:Math.sin(T*(up?4:3)+it.x)*(up?.14:.06));
  if(up){var pu=calm?.5:.5+.5*Math.sin(T*5+it.x),hg=c.createRadialGradient(it.x,by,0,it.x,by,.75+pu*.2);hg.addColorStop(0,'rgba(250,208,12,.75)');hg.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=hg;c.beginPath();c.arc(it.x,by,1,0,6.2832);c.fill();
   if(!calm)for(var sp=0;sp<4;sp++){var sa=T*2.2+sp*1.571+it.x,sx2=it.x+Math.cos(sa)*.62,sy2=by+Math.sin(sa)*.62;c.fillStyle='#fff';c.beginPath();c.moveTo(sx2,sy2-.12);c.lineTo(sx2+.04,sy2-.04);c.lineTo(sx2+.12,sy2);c.lineTo(sx2+.04,sy2+.04);c.lineTo(sx2,sy2+.12);c.lineTo(sx2-.04,sy2+.04);c.lineTo(sx2-.12,sy2);c.lineTo(sx2-.04,sy2-.04);c.closePath();c.fill();ink(.035)}}
  if(it.k==='c'){c.fillStyle='#b5723a';c.beginPath();c.moveTo(it.x-.22,by-.2);c.lineTo(it.x+.22,by-.2);c.lineTo(it.x+.16,by+.36);c.lineTo(it.x-.16,by+.36);c.closePath();c.fill();ink(.07);c.fillStyle='#fff';rr(it.x-.26,by-.32,.52,.14,.05);c.fill();ink(.07);c.fillStyle=YEL;c.beginPath();c.moveTo(it.x+.04,by-.12);c.lineTo(it.x-.1,by+.1);c.lineTo(it.x,by+.1);c.lineTo(it.x-.04,by+.3);c.lineTo(it.x+.1,by+.04);c.lineTo(it.x,by+.04);c.closePath();c.fill()}
  else if(it.k==='m'){c.fillStyle=INK;rr(it.x-.2,by-.34,.4,.7,.08);c.fill();c.fillStyle='#3fd16a';rr(it.x-.14,by-.26,.28,.46,.04);c.fill();c.fillStyle='#fff';c.beginPath();c.arc(it.x,by-.03,.09,0,6.2832);c.fill()}
  else if(it.k==='o')thing('tea',it.x,by+.46,ART['flat-things'].items.tea.w/PPT*1.4);else thing(it.k==='N'?'note':'phones',it.x,by+.42,ART['flat-things'].items[it.k==='N'?'note':'phones'].w/PPT*1.15)});
 pops.forEach(function(q){var a=q.life/.6,r=(1-a)*(q.big?1.5:.8);c.globalAlpha=a;c.strokeStyle=YEL;c.lineWidth=q.big?.14:.08;c.beginPath();c.arc(q.x,q.y,.3+r,0,6.2832);c.stroke();if(!q.big){c.fillStyle=INK;c.font='800 .4px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('+',q.x,q.y-.5-(1-a)*.8)}c.globalAlpha=1});

 people.forEach(function(p){if(p.x>x0-1&&p.x<x1+1)person(p)});
 bubbles.forEach(function(b){thing('bubble',b.x,b.y+.42,null,b.f>0)});
 // you
 var k=1.7/HERO.pph,f=P.hood?2:S.mode==='won'?3:P.inv>1.15?11:!P.ground?(P.vy<2?8:9):P.landT>0?10:Math.abs(P.vx)>.5?4+Math.floor(P.walkT/.085)%4:0;
 c.fillStyle='rgba(27,27,42,.2)';c.beginPath();c.ellipse(P.x,Math.min(P.y,MH-2)+.02,.4,.08,0,0,6.2832);if(P.ground)c.fill();
 if(P.phones>0){c.strokeStyle='#7a5cff';c.lineWidth=.07;c.globalAlpha=.5+.3*Math.sin(T*4);c.beginPath();c.arc(P.x,P.y-.85,1.05,0,6.2832);c.stroke();c.globalAlpha=1}
 if(ready&&img.naturalWidth){c.save();c.translate(P.x,P.y+.04);c.scale(P.f,1);c.globalAlpha=P.inv>0?.55:P.hood?.8:1;c.imageSmoothingQuality='high';c.drawImage(img,f*HERO.w,0,HERO.w,HERO.h,-HERO.ax*k,-HERO.base*k,HERO.w*k,HERO.h*k);c.restore();c.globalAlpha=1}
 if(P.shield){c.fillStyle=INK;rr(P.x+P.f*.22-.09,P.y-1.52,.18,.3,.04);c.fill();c.fillStyle='#3fd16a';rr(P.x+P.f*.22-.06,P.y-1.48,.12,.2,.02);c.fill()}
 if(P.fast>0&&!calm){c.strokeStyle='rgba(27,27,42,.35)';c.lineWidth=.06;for(var q2=0;q2<3;q2++){c.beginPath();c.moveTo(P.x-P.f*(.5+q2*.12),P.y-.4-q2*.4);c.lineTo(P.x-P.f*(1+q2*.12),P.y-.4-q2*.4);c.stroke()}}
 if(P.hood){c.fillStyle='rgba(27,27,42,.5)';rr(P.x-.5,P.y-1.75,1,.14,.07);c.fill();c.fillStyle=YEL;rr(P.x-.5,P.y-1.75,Math.max(0,P.hoodT/HOODMAX),.14,.07);c.fill()}
 says.forEach(function(s){bubbleSay(s.t,s.x,s.y,Math.min(1,s.life*2))});
 c.restore();
 // the display: battery, tea and notes
 var hx=W-12,hy=sceneY+10;c.fillStyle='rgba(27,27,42,.78)';rr(hx-214,hy,214,28,9);c.fill();hx-=14;
 c.strokeStyle=CREAM;c.lineWidth=2;rr(hx-188,hy+6,64,16,4);c.stroke();c.fillStyle=CREAM;c.fillRect(hx-122,hy+10,3,8);c.fillStyle=S.glow>0?'#fff':S.batt>.3?YEL:'#ff6a4f';c.fillRect(hx-185,hy+9,58*Math.max(0,S.batt),10);
 c.fillStyle=CREAM;c.font='700 12px Montserrat,system-ui,sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText('TEA '+S.tea,hx-110,hy+15);c.fillText('NOTES '+S.notes+'/3',hx-62,hy+15);
 var ups=[];if(P.fast>0)ups.push('COFFEE '+Math.ceil(P.fast));if(P.phones>0)ups.push('HEADPHONES '+Math.ceil(P.phones));if(P.shield)ups.push('PHONE CALL');if(ups.length){c.font='800 11px Montserrat,system-ui,sans-serif';c.textAlign='right';c.textBaseline='middle';var ut=ups.join('  ·  '),uw=c.measureText(ut).width+18;c.fillStyle=YEL;rr(W-12-uw,sceneY+44,uw,22,8);c.fill();c.fillStyle='#1c1611';c.fillText(ut,W-21,sceneY+55.5)}
 if(look){c.font='800 12px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';var lw=c.measureText('LOOKING AROUND · GAME PAUSED').width+24;c.fillStyle=YEL;rr(W/2-lw/2,sceneY+sceneH-34,lw,24,12);c.fill();c.fillStyle='#1c1611';c.fillText('LOOKING AROUND · GAME PAUSED',W/2,sceneY+sceneH-21)}
 if(!ready){c.fillStyle=CREAM;c.textAlign='center';c.font='600 14px Montserrat,system-ui,sans-serif';c.fillText('Unrolling the carpet…',W/2,sceneY+sceneH/2)}
 // the buttons, laid out like an old handheld
 if(tall){c.fillStyle='#2b2e3a';c.fillRect(0,sceneH,W,H-sceneH);c.fillStyle='#14151c';c.fillRect(0,sceneH,W,4)}
 if(S.mode==='play'||S.mode==='ready'){var o=stick||{x0:PAD.s.x,y0:PAD.s.y,v:0},sr=PAD.s.r;c.globalAlpha=tall?1:.8;c.fillStyle='#3d4152';c.beginPath();c.arc(o.x0,o.y0,sr,0,6.2832);c.fill();c.strokeStyle='#14151c';c.lineWidth=3;c.stroke();
  c.fillStyle='rgba(246,239,224,.35)';c.font='800 '+Math.round(sr*.4)+'px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('◀',o.x0-sr*.62,o.y0+1);c.fillText('▶',o.x0+sr*.62,o.y0+1);
  c.fillStyle=stick&&Math.abs(stick.v)>.18?YEL:CREAM;c.beginPath();c.arc(o.x0+o.v*sr*.6,o.y0,sr*.42,0,6.2832);c.fill();c.stroke();
  [['b','B'],['a','A']].forEach(function(q){var b=PAD[q[0]],on=!!btn[q[0]];c.fillStyle=on?YEL:'#c9364a';c.beginPath();c.arc(b.x,b.y,b.r,0,6.2832);c.fill();c.strokeStyle='#14151c';c.lineWidth=3;c.stroke();
   c.fillStyle=on?'#1c1611':CREAM;c.font='800 '+Math.round(b.r*.7)+'px Montserrat,system-ui,sans-serif';c.fillText(q[1],b.x,b.y+1);c.font='700 10px Montserrat,system-ui,sans-serif';c.fillStyle=CREAM;c.globalAlpha=.75;c.fillText(q[0]==='a'?'JUMP':'HOOD UP',b.x,b.y+b.r+12);c.globalAlpha=tall?1:.8});c.globalAlpha=1}}
var last=0;function loop(now){var dt=Math.min(.033,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden&&ready)update(dt);draw();requestAnimationFrame(loop)}

// ---- thumbs and keys ----
var ptr={};
function at(e){var b=cv.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top]}
function sync(){btn={};for(var id in ptr)if(ptr[id])btn[ptr[id]]=1}
cv.addEventListener('pointerdown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;e.preventDefault();var q=at(e),hit=null;['a','b'].forEach(function(n){var p=PAD[n];if(Math.hypot(q[0]-p.x,q[1]-p.y)<p.r+18)hit=n});
 if(hit){ptr[e.pointerId]=hit;if(hit==='a')jumpQ=.12;sync()}else if(tall?q[1]<sceneH:q[1]<sceneY+sceneH*.52){if(!look)look={id:e.pointerId,x:q[0],y:q[1]}}   // a finger on the picture itself: drag to look around
 else if(q[0]<W*.55&&!stick){stick={id:e.pointerId,x0:Math.max(PAD.s.r+6,q[0]),y0:q[1],v:0};move(e)}
 try{cv.setPointerCapture(e.pointerId)}catch(_){}});
function move(e){if(look&&e.pointerId===look.id){var q=at(e);lookX=Math.max(-16,Math.min(16,lookX-(q[0]-look.x)/u));lookY=Math.max(-10,Math.min(10,lookY-(q[1]-look.y)/u));look.x=q[0];look.y=q[1];return}if(!stick||e.pointerId!==stick.id)return;stick.v=Math.max(-1,Math.min(1,(at(e)[0]-stick.x0)/(PAD.s.r*.6)))}
cv.addEventListener('pointermove',move);
function up(e){if(look&&e.pointerId===look.id)look=null;if(stick&&e.pointerId===stick.id)stick=null;delete ptr[e.pointerId];sync()}cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
addEventListener('keydown',function(e){if(S.mode!=='play'&&S.mode!=='ready')return;var k=e.key.length===1?e.key.toLowerCase():e.key;if(/^(Arrow(Left|Right|Up|Down)|Shift| |[adwszx])$/.test(k)){if(!e.repeat&&(k==='z'||k===' '||k==='ArrowUp'||k==='w'))jumpQ=.12;keys[k]=1;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});addEventListener('blur',function(){keys={};ptr={};btn={};stick=null;look=null});
$('pggo').addEventListener('click',function(){$('pgcard').hidden=true;cv.focus()});
$('pgcb').addEventListener('click',function(){$('pgcard').hidden=true;if(S.mode==='lost')again();else reset()});
addEventListener('resize',lay);reset();lay();requestAnimationFrame(loop);
// Hooks for the automatic play-tests.
window.__pg={S:function(){return S},P:function(){return P},people:function(){return people},items:function(){return items},bubbles:function(){return bubbles},map:MAP,ready:function(){return ready},
 look:function(){return [look,lookX,lookY,cam,camY]},press:function(n,on){if(n==='l'||n==='r'){stick=on?{id:-1,x0:0,y0:0,v:n==='r'?1:-1}:(stick&&stick.v===(n==='r'?1:-1)?null:stick);return}if(on){btn[n]=1;if(n==='a')jumpQ=.12}else delete btn[n]},restart:function(){reset()},step:function(n){for(var i=0;i<n;i++)update(1/60)}};
})();`;

export function platformPage(page, hub, v) {
  const j = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__LEVEL__", () => j(LEVEL)).replace("__ART__", () => j({ hero: ART.hero, "flat-people": ART["flat-people"], "flat-movers": ART["flat-movers"], "flat-things": ART["flat-things"] })).replace("__FAILS__", () => j(FAILS)).replace("__SRC__", () => j(hub.path + "/stealth?v=" + v + "&a="));
  return page(TITLE, `<style>${CSS}</style><div class="pg" id="pg">
<canvas id="pgc" tabindex="0" role="img" aria-label="A side-scrolling platform game set in an office. Use the on-screen thumb pad to run, A to jump and B to put your hood up. On a keyboard: arrow keys to run, Z or Space to jump, X or Shift to put your hood up."></canvas>
<div class="card" id="pgcard"><div>
<div id="pgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>${LEVEL.name}. The door is at the far end. Everyone between you and it would love a chat.</p>
<ul><li><b>Left thumb</b> steers. <b>A</b> jumps: hold it to jump higher, and steer in the air.</li><li><b>B</b> is Hood Up: sit tight and nobody notices you for a couple of seconds. It’s the only way through a low ceiling.</li><li><b>Touch a person or a speech bubble</b> and it costs a quarter of your social battery.</li><li><b>Drag the picture</b> to look around before you leap. The game waits while you do.</li><li><b>Coffee</b> makes you fast. <b>A phone</b> gets you past one person free. <b>Headphones</b> make everyone ignore you.</li><li><b>Tea</b> tops it up. <b>Quiet rooms</b> save your place. <b>Office chairs</b> bounce. Three <b>plans-cancelled notes</b> are hidden.</li></ul>
<p class="sm">A test level. No sound. On a computer: arrow keys, Z or Space to jump, X or Shift for Hood Up.</p>
<p class="go"><button class="btn" id="pggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="pgend" hidden><p class="pre">Introvert Here…</p><h2 id="pgch"></h2><p id="pgcp"></p><p class="sm" id="pgcs"></p>
<p class="go"><button class="btn" id="pgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A platform game for introverts: get out of the office without being drawn into a conversation.", script });
}
