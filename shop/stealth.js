// The Escape Room's stealth game (the games console in the room). Kept out of worker.js on purpose: worker.js only
// imports stealthPage() and adds the route.
//
// This is the side-on version (Barry, 21 Nov): a corridor that scrolls as you walk, in a washed-out "liminal" office
// where the only bright things are the people who want a chat. It is a look-and-feel test, one short corridor.
// (The first, top-down version is in this file's history: commit 5b13872.)
//
// How it plays: hold the right of the screen to walk, the left to back away, swipe up to hop. Each accoster has a
// reach in front of them, shown as their colour spilling along the carpet. Stand in it and their speech bubble swells;
// when it is full you are in a conversation (one cell of social battery; three and you start again). Stand behind the
// plant or hop into the recycling bin to hide. Everything is drawn in code: no pictures, no sound, nothing downloaded.
//
// All the wording below is a draft for Barry to edit: TITLE, the PEOPLE lines, FAILS and the tips.

import { SHEET } from "./stealth-art/sheet.js";
import { walkTestPage } from "./stealth-test.js";

const TITLE = "Just Passing Through";   // working title: reads on from the brand name, "Introvert Here… Just Passing Through"

// Where things are along the corridor, in strides from the left-hand end (the corridor is 36 long).
// pace = walks up and down between "from" and "to"; stand = stays put, attentive for "alert" seconds then on the
// phone for "away" seconds. reach = how far in front of them they will spot you.
const PEOPLE = [
  { name: "The Weekend Asker", look: "woman", move: "pace", x: 16, f: -1, from: 6, to: 20.5, reach: 2.6,
    colour: "#ff3d8b", second: "#19b5b0", hair: "#c2452d", skin: "#f0c4a2",
    lines: ["Do anything nice at the weekend? I did. I’ll start with Friday.", "Ooh, while I’ve got you.", "You look like someone who wants to hear about my loft."] },
  { name: "The Quick-Word Manager", look: "man", move: "stand", x: 27.2, f: -1, alert: 3.1, away: 2.8, reach: 3,
    colour: "#ff4a2e", second: "#eaf1f5", hair: "#6b6259", skin: "#e2b08e",
    lines: ["Got five minutes? Lovely. It’ll be forty.", "Quick one before you go. It isn’t quick.", "Walk with me. No, the other way. Away from the door."] },
];
const FILLER = ["and anyway…", "so I said…", "which reminds me…", "long story short…", "it gets better…", "where was I…", "no, I tell a lie…", "you’d have loved it…", "to be fair…", "and then…"];
const FAILS = ["You have agreed to attend a barbecue.", "You are now on the social committee.", "You said “we must do this again”. You must now do this again.", "You have been added to a group chat."];

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
.sg{position:relative;height:calc(100dvh - var(--hh,63px));min-height:300px;overflow:hidden;background:#161412;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}
.sg [hidden]{display:none!important}
.sg canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.sg .hud{position:absolute;top:8px;right:12px;z-index:3;display:flex;align-items:center;gap:10px;padding:4px 8px 4px 10px;border-radius:9px;background:rgba(22,20,18,.72);font-size:12px;font-weight:700;color:#f6efe0;pointer-events:none}
.sg .bat{display:flex;gap:3px;padding:3px;border:2px solid #f6efe0;border-radius:6px;position:relative;margin-right:5px}
.sg .bat:after{content:"";position:absolute;right:-6px;top:50%;width:3px;height:9px;margin-top:-4.5px;background:#f6efe0;border-radius:0 2px 2px 0}
.sg .bat i{display:block;width:12px;height:13px;border-radius:2px;background:#fad00c;transition:background .5s,opacity .5s}.sg .bat i.off{background:#f6efe0;opacity:.14}
.sg .tip{position:absolute;left:50%;bottom:10px;z-index:3;transform:translateX(-50%);width:max-content;max-width:calc(100% - 20px);margin:0;padding:8px 14px;border-radius:10px;background:rgba(22,20,18,.9);border:1px solid rgba(255,231,166,.35);color:#f6efe0;font-size:13px;font-weight:600;line-height:1.35;text-align:center;text-wrap:balance;pointer-events:none}
.sg.wide .tip{bottom:auto;top:46px}
.sg .talk{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;animation:sgflood .5s ease-out}
.sg .bub{position:relative;width:min(100%,400px);max-height:70%;overflow:hidden;padding:18px 20px 20px;border-radius:22px;background:#fffdf6;color:#1c1611;box-shadow:0 14px 40px rgba(0,0,0,.35);transform-origin:50% 100%;animation:sgpop .45s ease-out}
.sg .bub:after{content:"";position:absolute;left:44px;bottom:-14px;border:14px solid transparent;border-top-color:#fffdf6;border-bottom:0}
.sg .bub small{display:block;margin-bottom:6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6d6257}
.sg .bub p{margin:0;font-size:19px;font-weight:700;line-height:1.3}.sg .bub .fill{margin-top:10px;font-size:15px;font-weight:600;color:#6d6257;min-height:4.2em}
.sg .talk .btn{background:#1c1611;color:#fffdf6}
@keyframes sgpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}@keyframes sgflood{from{opacity:0}to{opacity:1}}
.sg .card{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(22,20,18,.72);overflow:auto}
.sg .card>div{width:min(100%,430px);margin:auto;padding:20px 20px 18px;border-radius:16px;background:rgba(24,21,17,.97);border:2px solid #fad00c;border-bottom-width:6px;color:#f6efe0;box-shadow:0 14px 40px rgba(0,0,0,.6)}
.sg .card .pre{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.sg .card h1,.sg .card h2{margin:2px 0 10px;font-size:26px;line-height:1.1;font-weight:800;text-wrap:balance}
.sg .card p{margin:0 0 10px;font-size:15px;line-height:1.45}.sg .card ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.45}.sg .card li{margin-bottom:4px}
.sg .card .go{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:12px 0 0}.sg .card .btn{background:#fad00c;color:#1c1611}.sg .card a{color:#f6efe0;font-size:14px}
.sg .card .sm{font-size:13px;color:#b9ae9c;margin:0}
@media (max-height:420px){.sg .card h1,.sg .card h2{font-size:20px}.sg .card ul{font-size:13px;columns:2;column-gap:26px}.sg .card>div{width:min(100%,640px);padding:12px 16px}.sg .card p{font-size:13px;margin-bottom:6px}}
@media (prefers-reduced-motion:reduce){.sg .bub,.sg .talk{animation:none}.sg .bat i{transition:none}}
`;

// The game itself, run in the visitor's browser. Written without backticks or dollar-braces so it can sit in String.raw.
const CLIENT = String.raw`
(function(){
var PEOPLE=__PEOPLE__,FILLER=__FILLER__,FAILS=__FAILS__;
var $=function(i){return document.getElementById(i)},box=$('sg'),cv=$('sgc'),cx=cv.getContext('2d'),tipEl=$('sgt'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
// The corridor: 36 strides long, 6 high. Feet stand at FLOOR.
var LEN=36,VIEW=6,FLOOR=5.32,WALLB=4.9,SPEED=2.7,HOP=7.6,GRAV=22,YEL='#fad00c',CREAM='#f6efe0';
var PLANT=8,BIN=17.6,BINH=1.12,SIGN=13.2,COOLER=23,DOOR=33.6,START=2.2;

// ---- the state of play ----
var S,P,A,tipT=0,T=0,keys={},touch=null,hopQ=false,hideQ=false;
function reset(){
 P={x:START,y:0,vy:0,f:1,mode:'walk',trip:0,ph:0,moving:false,fear:0};
 A=PEOPLE.map(function(d){return {d:d,x:d.x,f:d.f,meter:0,sated:0,t:0,ph:0,pause:0,alarm:0,phone:false}});
 S={mode:'ready',cells:3,chats:0,t:0,who:null,signDown:false,moved:false,hopped:false};keys={};touch=null;hopQ=hideQ=false;batt();
 tip('Hold the right side of the screen to walk. Let go to stop.',1e9)}
function batt(){var c=$('sgb').children;for(var i=0;i<c.length;i++)c[i].className=i<S.cells?'':'off';$('sgb').setAttribute('aria-label','Social battery: '+S.cells+' of 3')}
function tip(t,s){tipEl.textContent=t;tipT=s||4}
function hidden(){return P.mode==='plant'||P.mode==='bin'}
function nearPlant(){return P.mode==='walk'&&P.y===0&&Math.abs(P.x-PLANT)<1.1}
function nearBin(){return P.mode==='walk'&&Math.abs(P.x-BIN)<1.0}
function wantDir(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);return k||(touch?touch.side:0)}

// ---- being caught ----
var fillT=null;
function caught(a){S.mode='talk';S.who=a;S.chats++;S.cells--;batt();touch=null;keys={};if(hidden()){P.mode='walk';P.y=0;P.vy=0}
 a.f=P.x>=a.x?1:-1;P.f=-a.f;A.forEach(function(m){m.meter=0});
 $('sgtalk').style.background=a.d.colour;$('sgwho').textContent=a.d.name;$('sgline').textContent=a.d.lines[Math.floor(Math.random()*a.d.lines.length)];var f=$('sgfill');f.textContent='';$('sgnod').hidden=true;$('sgtalk').hidden=false;
 var k=0,order=FILLER.slice().sort(function(){return Math.random()-.5});clearInterval(fillT);
 fillT=setInterval(function(){f.textContent+=(k?' ':'')+order[k%order.length];k++;if(k===5){$('sgnod').hidden=false;$('sgnod').focus()}if(k>9)clearInterval(fillT)},520)}
function nod(){clearInterval(fillT);$('sgtalk').hidden=true;var a=S.who;S.who=null;if(a)a.sated=5;
 if(S.cells<=0){S.mode='lost';card('Social battery flat.',FAILS[Math.floor(Math.random()*FAILS.length)],'Back to the start of the corridor. Nobody saw anything.','Try again');return}
 S.mode='play';tip(S.cells===1?'One bar of battery left. Tread carefully.':'They’ve had their chat. Go, while they’re pleased with themselves.',4)}
function win(){S.mode='won';card('You’re out.',S.chats===0?'Nobody saw you leave. They’ll assume you’re still in the meeting.':S.chats===1?'One conversation endured. You nodded in all the right places.':S.chats+' conversations endured. You are owed a quiet weekend.',
 'That’s the end of the test corridor: '+Math.round(S.t)+' seconds.','Go again')}
function card(h,p,sm,btn){$('sgch').textContent=h;$('sgcp').textContent=p;$('sgcs').textContent=sm;$('sgcb').textContent=btn;$('sgintro').hidden=true;$('sgend').hidden=false;$('sgcard').hidden=false;$('sgcb').focus()}

// ---- one tick of the corridor ----
function update(dt){
 if(S.mode!=='play'&&S.mode!=='ready')return;
 if(tipT<1e8){tipT-=dt;if(tipT<=0){tipEl.textContent=hidden()?'Hidden. Walk to come out.':'';tipT=1e9;tipEl.hidden=!tipEl.textContent}}else tipEl.hidden=!tipEl.textContent;
 var d=wantDir();
 if(S.mode==='ready'&&(d||hopQ)){S.mode='play';S.moved=true;tip('Their colour on the carpet is how far they can reach. Keep out of it.',6)}
 if(S.mode==='play')S.t+=dt;
 // you
 if(hidden()){if(d||hopQ){if(P.mode==='bin'){P.y=BINH;P.vy=3.2;P.x+=(d||P.f)*.25}P.mode='walk';hopQ=false;tip('',.01)}hideQ=false}
 else{
  if(hideQ){hideQ=false;if(nearPlant()){P.mode='plant';P.x=PLANT;P.moving=false;tip('You are a plant now. Walk to stop being a plant.',5)}}
  if(P.mode==='walk'){
   if(P.trip>0){P.trip-=dt;d=0}
   if(hopQ){hopQ=false;if(P.y===0&&P.trip<=0){P.vy=HOP;S.hopped=true}}
   if(d){P.x=Math.max(.8,Math.min(LEN-.6,P.x+d*SPEED*dt));P.f=d}
   P.moving=!!d&&P.y===0;if(P.moving)P.ph+=dt*11;
   if(P.vy!==0||P.y>0){var py=P.y;P.vy-=GRAV*dt;P.y+=P.vy*dt;
    if(P.vy<0&&py>=BINH*.8&&P.y<=BINH&&Math.abs(P.x-BIN)<.55){P.mode='bin';P.x=BIN;P.y=0;P.vy=0;P.moving=false;tip('In the recycling. Technically, you are paper. Walk to climb out.',5)}
    else if(P.y<=0){P.y=0;P.vy=0}}
   if(!S.signDown&&P.y<.28&&Math.abs(P.x-SIGN)<.3){S.signDown=true;P.trip=.8;A.forEach(function(a){if(Math.abs(a.x-P.x)<9){if(a.d.move==='stand')a.alarm=2.6;else{a.f=P.x>=a.x?1:-1;a.pause=1.6}}});tip('You kicked the wet floor sign. Everyone looked. Swipe up to hop over things.',5)}
   if(P.x>=DOOR-.15){win();return}}}
 // them
 var top=0;
 A.forEach(function(a){
  if(a.sated>0)a.sated-=dt;var busy=a.meter>0;
  if(a.d.move==='pace'){if(!busy){if(a.pause>0){a.pause-=dt;if(a.pause<=0&&((a.f<0&&a.x<=a.d.from+.05)||(a.f>0&&a.x>=a.d.to-.05)))a.f=-a.f}
    else{a.x+=a.f*1.3*dt;a.ph+=dt*6.5;if(a.f<0&&a.x<=a.d.from){a.x=a.d.from;a.pause=1.3}else if(a.f>0&&a.x>=a.d.to){a.x=a.d.to;a.pause=1.3}}}
   a.phone=false}
  else{a.t+=dt;if(a.alarm>0)a.alarm-=dt;a.phone=!busy&&a.alarm<=0&&(a.t%(a.d.alert+a.d.away))>=a.d.alert}
  var dx=(P.x-a.x)*a.f,see=a.sated<=0&&!a.phone&&!hidden()&&S.mode==='play'&&((dx>.15&&dx<a.d.reach)||Math.abs(P.x-a.x)<.42);
  if(see)a.meter+=dt*(1.75-.75*Math.max(0,dx)/a.d.reach);else a.meter=Math.max(0,a.meter-dt*1.4);
  if(a.meter>top)top=a.meter;
  if(a.meter>=1)caught(a)});
 P.fear+=(Math.min(1,top*1.6)-P.fear)*Math.min(1,dt*8)}

// ---- painting ----
var W=0,H=0,sc=50,vw=7,sceneH=300,dpr=1,cam=0,tall=false,pill=null;
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function circ(c,x,y,r){c.beginPath();c.arc(x,y,r,0,6.2832)}
function ell(c,x,y,a,b,rot){c.beginPath();c.ellipse(x,y,a,b,rot||0,0,6.2832)}
function limb(c,x,y,ang,len,w,col){c.save();c.translate(x,y);c.rotate(ang);c.fillStyle=col;rr(c,-w/2,-w/2,w,len+w/2,w/2);c.fill();c.restore()}
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 tall=H>W;box.classList.toggle('wide',!tall);sc=tall?Math.min(W/6.6,H*.62/VIEW):H/VIEW;sceneH=VIEW*sc;vw=W/sc}
function text(t,x,y,size,col,align){cx.font='700 '+size+'px Montserrat,system-ui,sans-serif';cx.textAlign=align||'center';cx.textBaseline='middle';cx.fillStyle=col;cx.fillText(t,x,y)}
function tag(t,x,y,col,bg){cx.font='800 .2px Montserrat,system-ui,sans-serif';var w=cx.measureText(t).width+.3;cx.fillStyle=bg||'rgba(22,20,18,.86)';rr(cx,x-w/2,y-.19,w,.38,.19);cx.fill();text(t,x,y+.01,.2,col||CREAM);return [x-w/2,y-.19,w,.38]}

function door(x,num,out){var c=cx;c.fillStyle=out?'#3b3a36':'#a59c85';c.fillRect(x-.56,2.34,1.12,WALLB-2.34);c.fillStyle=out?YEL:'#bdb49d';c.fillRect(x-.47,2.43,.94,WALLB-2.43);
 c.fillStyle=out?'rgba(60,45,0,.25)':'#59635f';c.fillRect(x+.1,2.72,.2,.8);c.fillStyle=out?'#3b3a36':'#8a826e';circ(c,x-.3,3.8,.055);c.fill();
 if(out){c.fillStyle='#2f3a33';rr(c,x-.5,1.82,1,.34,.05);c.fill();text('WAY OUT',x,2,.19,YEL)}else{c.fillStyle='#f3eee0';c.fillRect(x-.2,2.02,.4,.17);text(num,x,2.115,.11,'#8a826e')}}
function backdrop(x0,x1){var c=cx,i,x;
 c.fillStyle='#e3dac4';c.fillRect(x0,0,x1-x0,3.3);c.fillStyle='#d2c8ae';c.fillRect(x0,3.3,x1-x0,WALLB-3.3);c.fillStyle='#bdb297';c.fillRect(x0,3.27,x1-x0,.07);c.fillStyle='#a89e86';c.fillRect(x0,WALLB-.16,x1-x0,.16);
 // ceiling tiles and strip lights
 c.fillStyle='#ece6d6';c.fillRect(x0,0,x1-x0,.5);c.fillStyle='#d6cfbc';for(i=Math.floor(x0);i<x1;i++)c.fillRect(i,0,.025,.5);c.fillRect(x0,.48,x1-x0,.03);
 for(x=2;x<LEN+4;x+=4){if(x<x0-2||x>x1+2)continue;var g=c.createLinearGradient(0,.5,0,WALLB);g.addColorStop(0,'rgba(255,253,232,.34)');g.addColorStop(1,'rgba(255,253,232,0)');c.fillStyle=g;c.beginPath();c.moveTo(x-.6,.5);c.lineTo(x+.6,.5);c.lineTo(x+1.7,WALLB);c.lineTo(x-1.7,WALLB);c.closePath();c.fill();c.fillStyle='#fffdf0';c.fillRect(x-.62,.2,1.24,.13)}
 // carpet tiles
 for(i=Math.floor(x0);i<x1;i++){c.fillStyle=i%2?'#8d9b95':'#86958f';c.fillRect(i,WALLB,1.01,VIEW-WALLB)}
 c.fillStyle='rgba(60,72,68,.16)';c.fillRect(x0,WALLB+.5,x1-x0,.02);var g2=c.createLinearGradient(0,WALLB,0,VIEW);g2.addColorStop(0,'rgba(40,48,45,.22)');g2.addColorStop(.25,'rgba(40,48,45,0)');g2.addColorStop(1,'rgba(40,48,45,.2)');c.fillStyle=g2;c.fillRect(x0,WALLB,x1-x0,VIEW-WALLB);
 // the things along the wall
 door(START,'2.01');door(10.6,'2.02');door(15.2,'2.03');door(20.9,'2.04');door(29.4,'2.05');door(DOOR,'',true);
 var gl=c.createRadialGradient(DOOR,4,0,DOOR,4,2.4);gl.addColorStop(0,'rgba(250,208,12,'+(calm?.2:.16+.06*Math.sin(T*2))+')');gl.addColorStop(1,'rgba(250,208,12,0)');c.fillStyle=gl;c.fillRect(DOOR-2.4,1.6,4.8,VIEW-1.6);
 // vending machine
 c.fillStyle='rgba(60,60,50,.18)';c.fillRect(4.55,WALLB-.06,1.25,.12);c.fillStyle='#8f9aa0';rr(c,4.5,2.45,1.2,WALLB-2.45,.06);c.fill();c.fillStyle='#c9d3d6';c.fillRect(4.6,2.6,.72,1.5);
 var dots=['#c9a3a0','#a9b79a','#b9ac8a','#9fb0bb'];for(i=0;i<12;i++){c.fillStyle=dots[(i*7)%4];c.fillRect(4.66+(i%3)*.22,2.7+Math.floor(i/3)*.34,.14,.2)}c.fillStyle='#6f7a80';c.fillRect(5.4,2.8,.2,.5);c.fillStyle='#3d4448';c.fillRect(4.7,4.3,.6,.3);
 // noticeboard
 c.fillStyle='#a58a62';c.fillRect(11.75,1.45,1.7,1.15);c.fillStyle='#c4a071';c.fillRect(11.82,1.52,1.56,1.01);[['#f3eee0',11.9,1.6,.4,.5],['#e6dcc0',12.4,1.62,.3,.36],['#d7c7c0',12.8,1.6,.46,.3],['#f3eee0',12.42,2.06,.5,.38],['#dfe3d6',11.92,2.18,.36,.26]].forEach(function(q){c.fillStyle=q[0];c.fillRect(q[1],q[2],q[3],q[4])});
 // a poster nobody chose
 c.fillStyle='#f3eee0';c.fillRect(18.9,1.35,1.2,1.45);var pg=c.createLinearGradient(0,1.45,0,2.4);pg.addColorStop(0,'#cfdbe0');pg.addColorStop(1,'#e9d8c2');c.fillStyle=pg;c.fillRect(19,1.45,1,.95);c.fillStyle='#b9c4bd';c.beginPath();c.moveTo(19,2.4);c.lineTo(19.4,1.95);c.lineTo(19.65,2.2);c.lineTo(19.8,2.05);c.lineTo(20,2.4);c.closePath();c.fill();text('SYNERGY',19.5,2.6,.13,'#8a826e');
 // clock, water cooler, fire extinguisher
 c.fillStyle='#f3eee0';circ(c,25,1.5,.27);c.fill();c.strokeStyle='#8a826e';c.lineWidth=.035;c.stroke();c.beginPath();c.moveTo(25,1.5);c.lineTo(25,1.32);c.moveTo(25,1.5);c.lineTo(24.88,1.56);c.stroke();
 c.fillStyle='rgba(60,60,50,.18)';c.fillRect(COOLER-.3,WALLB-.05,.7,.1);c.fillStyle='#dcdfda';rr(c,COOLER-.27,3.55,.54,WALLB-3.55,.05);c.fill();c.fillStyle='rgba(150,196,214,.85)';rr(c,COOLER-.21,2.85,.42,.72,.12);c.fill();c.fillStyle='rgba(255,255,255,.5)';c.fillRect(COOLER-.14,2.95,.07,.5);c.fillStyle='#aab0ab';c.fillRect(COOLER-.1,3.8,.2,.12);
 c.fillStyle='#b5604f';rr(c,30.7,3.35,.22,.62,.08);c.fill();c.fillStyle='#4a4743';c.fillRect(30.76,3.24,.1,.13)}
function plant(front){var c=cx,x=PLANT,i,sw=calm?0:Math.sin(T*.9)*.02;
 if(!front){c.fillStyle='rgba(40,48,45,.25)';ell(c,x,FLOOR+.04,.5,.1);c.fill();c.fillStyle='#b9a58a';c.beginPath();c.moveTo(x-.3,FLOOR-.62);c.lineTo(x+.3,FLOOR-.62);c.lineTo(x+.23,FLOOR);c.lineTo(x-.23,FLOOR);c.closePath();c.fill();c.fillStyle='#a8957b';c.fillRect(x-.33,FLOOR-.68,.66,.1)}
 var L=[[-.95,.5,'#6e8b6a'],[-.55,.62,'#7f9a76'],[-.2,.7,'#64805f'],[.15,.72,'#7f9a76'],[.5,.62,'#6e8b6a'],[.9,.5,'#64805f'],[-.75,.4,'#89a37f'],[.72,.42,'#89a37f'],[0,.55,'#6e8b6a']];
 for(i=0;i<L.length;i++){if(front&&i%2)continue;var a=L[i][0]+sw*(i%3-1),len=L[i][1]*(1.9);c.save();c.translate(x,FLOOR-.66);c.rotate(a);c.fillStyle=L[i][2];c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(.24,-len*.5,0,-len);c.quadraticCurveTo(-.24,-len*.5,0,0);c.fill();c.restore()}}
function bin(front){var c=cx,x=BIN;
 if(!front){c.fillStyle='rgba(40,48,45,.25)';ell(c,x,FLOOR+.04,.6,.1);c.fill();c.save();c.translate(x-.46,FLOOR-BINH);c.rotate(-1.15);c.fillStyle='#5f7d70';rr(c,-.04,-.07,.98,.12,.05);c.fill();c.restore();c.fillStyle='#4f6a5f';c.fillRect(x-.44,FLOOR-BINH,.88,.1);return}
 c.fillStyle='#6f8f80';c.beginPath();c.moveTo(x-.48,FLOOR-BINH);c.lineTo(x+.48,FLOOR-BINH);c.lineTo(x+.4,FLOOR);c.lineTo(x-.4,FLOOR);c.closePath();c.fill();c.fillStyle='rgba(255,255,255,.1)';c.fillRect(x-.36,FLOOR-BINH+.12,.12,BINH-.3);c.fillStyle='#5f7d70';c.fillRect(x-.5,FLOOR-BINH-.02,1,.1);
 c.fillStyle='#3d4448';circ(c,x+.32,FLOOR-.04,.09);c.fill();c.strokeStyle='#dfe9e2';c.lineWidth=.045;c.lineCap='round';for(var i=0;i<3;i++){c.beginPath();c.arc(x,FLOOR-.55,.17,i*2.094+.25,i*2.094+1.55);c.stroke()}}
function sign(){var c=cx,x=SIGN;c.save();c.translate(x,FLOOR);if(S.signDown){c.translate(.3,0);c.rotate(1.45)}c.fillStyle='rgba(40,48,45,.22)';if(!S.signDown){ell(c,0,.03,.3,.06);c.fill()}
 c.fillStyle='#e9a23b';c.beginPath();c.moveTo(-.24,0);c.lineTo(-.07,-.62);c.lineTo(.07,-.62);c.lineTo(.24,0);c.closePath();c.fill();c.fillStyle='#3b3a36';c.beginPath();c.moveTo(0,-.46);c.lineTo(.09,-.2);c.lineTo(-.09,-.2);c.closePath();c.fill();c.restore()}
// You: small, side-on, hood drawn tight, no face to be seen.
function you(){var c=cx,sh=1-.13*P.fear,inBin=P.mode==='bin',y=FLOOR-P.y+(inBin?.12:0),air=P.y>0,sw=P.moving?Math.sin(P.ph):0,bob=P.moving?Math.abs(Math.cos(P.ph))*.03:0;
 if(!hidden()){c.fillStyle='rgba(40,48,45,'+(air?.14:.26)+')';ell(c,P.x,FLOOR+.04,air?.26:.36,.08);c.fill()}
 c.save();if(inBin){c.beginPath();c.rect(P.x-1,FLOOR-4,2,4-BINH);c.clip()}c.translate(P.x,y);c.scale(P.f,1);
 if(P.trip>0)c.rotate(.28*Math.sin(P.trip*9));
 var la=air?.75:sw*.55,lb=air?-.5:-sw*.55;
 limb(c,-.04,-.44,lb,.36,.17,'#41464c');c.fillStyle='#d9d4c6';ell(c,-.04-Math.sin(lb)*.42+.06,-.44+Math.cos(lb)*.42+.0,.13,.07);c.fill();
 limb(c,.04,-.44,la,.36,.17,'#4b5057');c.fillStyle='#e8e3d6';ell(c,.04-Math.sin(la)*.42+.06,-.44+Math.cos(la)*.42,.13,.07);c.fill();
 c.translate(0,-bob);c.scale(1,sh);
 c.fillStyle='#7d8a7c';c.beginPath();c.moveTo(-.3,-.38);c.quadraticCurveTo(-.4,-.9,-.22,-1.08);c.lineTo(.2,-1.08);c.quadraticCurveTo(.36,-.86,.3,-.38);c.quadraticCurveTo(0,-.3,-.3,-.38);c.fill();
 c.fillStyle='#6b776a';rr(c,-.02,-.72,.3,.2,.09);c.fill();limb(c,.0,-.98,-.42,.34,.16,'#727f71');
 // the hood
 c.fillStyle='#7d8a7c';c.beginPath();c.moveTo(-.3,-1.02);c.quadraticCurveTo(-.42,-1.62,.0,-1.66);c.quadraticCurveTo(.36,-1.64,.34,-1.22);c.quadraticCurveTo(.3,-1,.1,-.98);c.closePath();c.fill();
 c.fillStyle='#6b776a';c.beginPath();c.moveTo(-.3,-1.04);c.quadraticCurveTo(-.4,-1.5,-.12,-1.63);c.quadraticCurveTo(-.3,-1.4,-.2,-1.02);c.closePath();c.fill();
 c.fillStyle='#232724';ell(c,.2,-1.3,.1-.03*P.fear,.2,.12);c.fill();c.strokeStyle='#93a091';c.lineWidth=.045;ell(c,.2,-1.3,.12-.03*P.fear,.22,.12);c.stroke();
 c.strokeStyle='#c3cabf';c.lineWidth=.02;c.lineCap='round';c.beginPath();c.moveTo(.23,-1.04);c.lineTo(.25,-.88);c.moveTo(.18,-1.04);c.lineTo(.17,-.86);c.stroke();
 c.restore()}
// Them: tall, bright, pleased to see you.
function them(a){var c=cx,d=a.d,man=d.look==='man',walking=d.move==='pace'&&a.pause<=0&&a.meter<=0,sw=walking?Math.sin(a.ph):0,keen=Math.min(1,a.meter*1.5),lean=keen*.12,wave=keen>0?Math.sin(T*12)*.35:0,bob=walking?Math.abs(Math.cos(a.ph))*.03:0;
 c.fillStyle='rgba(40,48,45,.26)';ell(c,a.x,FLOOR+.04,.42,.09);c.fill();
 c.save();c.translate(a.x,FLOOR);c.scale(a.f,1);
 var la=sw*.42,lb=-sw*.42,leg=man?'#6d7278':d.skin,shoe=man?'#2e2b29':d.second;
 limb(c,-.05,-.92,lb,.84,man?.2:.13,man?'#5f646a':leg);c.fillStyle=shoe;ell(c,-.05-Math.sin(lb)*.9+.07,-.92+Math.cos(lb)*.9,.16,.075);c.fill();
 limb(c,.05,-.92,la,.84,man?.2:.13,leg);c.fillStyle=shoe;ell(c,.05-Math.sin(la)*.9+.07,-.92+Math.cos(la)*.9,.16,.075);c.fill();
 c.translate(0,-bob);c.rotate(lean);
 if(man){c.fillStyle=d.second;rr(c,-.27,-1.72,.54,.86,.14);c.fill();c.fillStyle='#5f646a';c.fillRect(-.27,-.98,.54,.12);
  c.fillStyle=d.colour;c.beginPath();c.moveTo(.2,-1.66);c.lineTo(.29,-1.6);c.lineTo(.3,-1.12);c.lineTo(.23,-1.02);c.lineTo(.17,-1.12);c.closePath();c.fill();
  c.strokeStyle='#3d6f8f';c.lineWidth=.03;c.beginPath();c.moveTo(-.1,-1.7);c.quadraticCurveTo(.02,-1.3,.12,-1.22);c.stroke();c.fillStyle='#f3eee0';c.fillRect(.07,-1.24,.11,.15)}
 else{c.fillStyle=d.colour;c.beginPath();c.moveTo(-.24,-1.7);c.lineTo(.24,-1.7);c.quadraticCurveTo(.3,-1.2,.26,-1.1);c.lineTo(.42,-.62);c.lineTo(-.42,-.62);c.lineTo(-.26,-1.1);c.quadraticCurveTo(-.3,-1.2,-.24,-1.7);c.fill();c.fillStyle=d.second;c.fillRect(-.27,-1.16,.54,.09)}
 // head
 var hy=-2.0;c.fillStyle=d.skin;c.fillRect(-.07,-1.82,.16,.16);
 if(!man){c.fillStyle=d.hair;circ(c,-.1,hy-.08,.34);c.fill();circ(c,-.24,hy+.14,.2);c.fill();circ(c,.06,hy-.24,.24);c.fill()}
 c.fillStyle=d.skin;circ(c,.04,hy,.25);c.fill();
 if(man){c.fillStyle=d.hair;c.beginPath();c.arc(.04,hy,.26,2.2,4.6);c.quadraticCurveTo(-.05,hy-.1,-.12,hy+.2);c.fill()}else{c.fillStyle=d.hair;c.beginPath();c.arc(.04,hy,.26,3.3,5.6);c.quadraticCurveTo(.05,hy-.12,-.2,hy-.02);c.fill();c.strokeStyle=YEL;c.lineWidth=.035;circ(c,-.08,hy+.2,.07);c.stroke()}
 c.fillStyle='#2e2b29';if(a.phone){c.fillRect(.13,hy-.03,.09,.025)}else{circ(c,.17,hy-.04,.03+.012*keen);c.fill()}
 if(keen>0){ell(c,.19,hy+.11,.06,.05+.03*keen);c.fill()}else{c.strokeStyle='#2e2b29';c.lineWidth=.028;c.lineCap='round';c.beginPath();c.arc(.15,hy+.07,.08,.3,1.6);c.stroke()}
 if(!man){c.fillStyle=d.colour;ell(c,.2,hy+.12,.05,.02);if(!keen)c.fill()}
 // the near arm: hanging, waving, or holding a phone up
 var sx=.02,sy=-1.6,ua=a.phone?-1.0:keen>0?-1.75+wave*.4:.12-sw*.3,fa=a.phone?-2.3:keen>0?-2.85+wave*1.5:.2-sw*.3;
 var ex=sx-Math.sin(ua)*.3,ey=sy+Math.cos(ua)*.3;limb(c,sx,sy,ua,.3,.17,man?d.second:d.colour);limb(c,ex,ey,fa,.3,.12,d.skin);
 var hx=ex-Math.sin(fa)*.34,hyy=ey+Math.cos(fa)*.34;
 if(a.phone){c.fillStyle='#2e2b29';rr(c,hx-.05,hyy-.13,.1,.2,.02);c.fill();c.fillStyle='#bfe0ee';c.fillRect(hx+.02,hyy-.11,.02,.16)}
 else if(man&&keen<=0){c.fillStyle='#f3eee0';rr(c,hx-.08,hyy-.02,.16,.17,.03);c.fill()}
 c.restore()}
function reach(a){if(a.sated>0||a.phone)return;var c=cx,x0=a.x,x1=a.x+a.f*a.d.reach,al=.38+.3*Math.min(1,a.meter),g=c.createLinearGradient(x0,0,x1,0),col=a.d.colour;
 c.globalAlpha=al;g.addColorStop(0,col);g.addColorStop(.75,col);g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(Math.min(x0,x1),WALLB,a.d.reach,VIEW-WALLB);
 c.globalAlpha=al*.3;c.fillRect(Math.min(x0,x1),3.34,a.d.reach,WALLB-3.34);c.globalAlpha=1}
function bubble(a){if(a.sated>0)return;var c=cx,m=Math.min(1,a.meter),r=(a.phone?.16:.22)+m*.42,x=a.x+a.f*(.45+m*.3),y=FLOOR-2.62-m*.35+(calm?0:Math.sin(T*3+a.x)*.02);
 c.fillStyle=a.phone?'rgba(255,253,246,.7)':'#fffdf6';c.strokeStyle=a.d.colour;c.lineWidth=.05+.05*m;circ(c,x,y,r);c.fill();c.stroke();c.beginPath();c.moveTo(x-a.f*r*.5,y+r*.8);c.lineTo(x-a.f*r*1.05,y+r*1.35);c.lineTo(x-a.f*r*.05,y+r*.98);c.closePath();c.fill();
 c.fillStyle=a.d.colour;if(a.phone){text('…',x,y-.03,.2,'#8a826e')}else for(var i=-1;i<2;i++){circ(c,x+i*r*.42,y+(m>0&&!calm?Math.sin(T*14+i)*.03:0),r*.13);c.fill()}}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#161412';c.fillRect(0,0,W,H);
 var lead=tall?.3:.36;cam+=(Math.max(0,Math.min(LEN-vw,P.x-vw*lead))-cam)*(calm?1:.18);if(S.mode==='ready'&&!S.moved)cam=Math.max(0,Math.min(LEN-vw,P.x-vw*lead));
 c.save();c.beginPath();c.rect(0,0,W,sceneH);c.clip();c.scale(sc,sc);c.translate(-cam,0);
 backdrop(cam-1,cam+vw+1);A.forEach(reach);plant(false);bin(false);sign();
 var hid=hidden();if(hid)you();if(P.mode==='plant')plant(true);bin(true);if(P.mode!=='plant'){c.globalAlpha=.9;plant(true);c.globalAlpha=1}
 A.forEach(them);if(!hid)you();A.forEach(bubble);
 pill=null;if(S.mode==='play'||S.mode==='ready'){if(nearPlant())pill={b:tag('HIDE HERE',PLANT,FLOOR-2.45,'#1c1611',YEL),act:'hide'};else if(nearBin())pill={b:tag('SWIPE UP TO HOP IN',BIN,FLOOR-1.75,'#1c1611',YEL),act:'hop'}}
 c.restore();
 // the lights hum; the edges of the picture fall away
 var g=c.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(22,20,18,.3)');g.addColorStop(.12,'rgba(22,20,18,0)');g.addColorStop(.88,'rgba(22,20,18,0)');g.addColorStop(1,'rgba(22,20,18,.3)');c.fillStyle=g;c.fillRect(0,0,W,sceneH);
 // below the corridor on an upright phone: where your thumb goes
 if(tall){var y0=sceneH,h=H-sceneH;c.fillStyle='#1d1a17';c.fillRect(0,y0,W,h);c.fillStyle='#2a2622';c.fillRect(0,y0,W,3);var d=wantDir(),cy=y0+h*.42,r=Math.min(46,h*.2);
  [[-1,W*.25,'BACK AWAY'],[1,W*.75,'WALK']].forEach(function(q){c.globalAlpha=d===q[0]?.95:.4;c.strokeStyle=CREAM;c.lineWidth=2;circ(c,q[1],cy,r);c.stroke();c.fillStyle=d===q[0]?YEL:CREAM;c.beginPath();c.moveTo(q[1]+q[0]*r*.4,cy);c.lineTo(q[1]-q[0]*r*.25,cy-r*.38);c.lineTo(q[1]-q[0]*r*.25,cy+r*.38);c.closePath();c.fill();c.font='700 11px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=CREAM;c.fillText(q[2],q[1],cy+r+16)});
  c.globalAlpha=.4;c.fillText('SWIPE UP TO HOP',W/2,cy-r-18);c.globalAlpha=1}}
var last=0;
function frame(now){var dt=Math.min(.05,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden)update(dt);draw();requestAnimationFrame(frame)}

// ---- thumbs and keys ----
function playing(){return S.mode==='play'||S.mode==='ready'}
cv.addEventListener('pointerdown',function(e){if(!playing())return;e.preventDefault();var b=cv.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
 if(pill){var wx=x/sc+cam,wy=y/sc,q=pill.b;if(wx>q[0]-.25&&wx<q[0]+q[2]+.25&&wy>q[1]-.3&&wy<q[1]+q[3]+.3){if(pill.act==='hide')hideQ=true;else hopQ=true;return}}
 if(P.mode==='walk'&&y<sceneH&&Math.abs(x/sc+cam-PLANT)<.6&&y/sc>FLOOR-2.4&&nearPlant()){hideQ=true;return}
 touch={id:e.pointerId,y0:y,side:x<W/2?-1:1,hopped:false};try{cv.setPointerCapture(e.pointerId)}catch(_){}});
cv.addEventListener('pointermove',function(e){if(!touch||e.pointerId!==touch.id)return;var y=e.clientY-cv.getBoundingClientRect().top;if(!touch.hopped&&touch.y0-y>28){touch.hopped=true;hopQ=true}});
function lift(e){if(touch&&e.pointerId===touch.id)touch=null}
cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
addEventListener('keydown',function(e){if(!playing())return;var k=e.key.length===1?e.key.toLowerCase():e.key;
 if(/^(Arrow(Left|Right)|[ad])$/.test(k)){keys[k]=1;e.preventDefault()}
 if(k===' '||k==='ArrowUp'||k==='w'){if(!e.repeat)hopQ=true;e.preventDefault()}
 if(k==='ArrowDown'||k==='s'){if(!e.repeat)hideQ=true;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});
addEventListener('blur',function(){keys={};touch=null});
$('sggo').addEventListener('click',function(){$('sgcard').hidden=true;cv.focus()});
$('sgcb').addEventListener('click',function(){$('sgcard').hidden=true;reset()});
$('sgnod').addEventListener('click',nod);
addEventListener('resize',lay);
reset();lay();requestAnimationFrame(frame);
// Hooks for the automatic play-tests: steer and step the corridor on without drawing.
window.__sg={S:function(){return S},P:function(){return P},A:function(){return A},K:{PLANT:PLANT,BIN:BIN,SIGN:SIGN,DOOR:DOOR},
 hold:function(d){touch=d?{id:-1,y0:0,side:d,hopped:true}:null},hop:function(){hopQ=true},hide:function(){hideQ=true},step:function(n){for(var i=0;i<n;i++)update(1/30)}};
})();`;

// page = worker.js's page builder, hub = its HUB ({ path, name }). ?sheet=1 shows the character sheet being workshopped.
export function stealthPage(page, hub, url) {
  // While the look is being workshopped with Barry, the console shows the bare walk test. ?old=1 is the earlier corridor test.
  if (url && !url.searchParams.has("sheet") && !url.searchParams.has("old")) return walkTestPage(page, hub);
  if (url && url.searchParams.has("sheet")) return page("Character sheet", `<h1 style="font-size:20px;margin:18px 0 6px">Character sheet: the introvert</h1><p class="note" style="margin:0 0 12px">Options to pick from. Not in the game yet. <a href="${hub.path}/stealth">Back to the corridor test</a></p><img src="${SHEET}" alt="Four pixel-art versions of a hooded figure in a navy hoodie, each shown side on, front on and as a silhouette." style="display:block;width:100%;max-width:600px;height:auto;image-rendering:pixelated;border-radius:8px">`, { nav: "hub", noindex: true });
  const j = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__PEOPLE__", () => j(PEOPLE)).replace("__FILLER__", () => j(FILLER)).replace("__FAILS__", () => j(FAILS));
  return page(TITLE, `<style>${CSS}</style><div class="sg" id="sg">
<canvas id="sgc" tabindex="0" role="img" aria-label="A side-on view of a long office corridor. Hold the right of the screen to walk, the left to back away, and swipe up to hop. On a keyboard: arrow keys to walk, Space to hop, down arrow to hide."></canvas>
<div class="hud"><span>The Corridor</span><span class="bat" id="sgb" role="img" aria-label="Social battery: 3 of 3"><i></i><i></i><i></i></span></div>
<p class="tip" id="sgt" role="status" aria-live="polite"></p>
<div class="talk" id="sgtalk" hidden><div class="bub"><small id="sgwho"></small><p id="sgline"></p><p class="fill" id="sgfill"></p></div><button class="btn" id="sgnod" type="button" hidden>Nod. Back away slowly.</button></div>
<div class="card" id="sgcard"><div>
<div id="sgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>The meeting has finished. The way out is at the far end of the corridor. So are two people with things to say.</p>
<ul><li><b>Hold the right side</b> to walk. Let go to stop. <b>Hold the left</b> to back away.</li><li><b>Swipe up</b> to hop.</li><li><b>Their colour on the carpet</b> is how far they can reach. Keep out of it.</li><li><b>Hide</b> behind the plant, or hop into the recycling.</li></ul>
<p class="sm">A short test corridor. Turn your phone sideways to see further. No sound. On a computer: arrow keys, Space to hop, down to hide.</p>
<p class="go"><button class="btn" id="sggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="sgend" hidden><p class="pre">Introvert Here…</p><h2 id="sgch"></h2><p id="sgcp"></p><p class="sm" id="sgcs"></p>
<p class="go"><button class="btn" id="sgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A stealth game for introverts: get down the corridor without being drawn into a conversation.", script });
}
