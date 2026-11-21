// The stealth game's first corridor, in Barry's drawings (cut into pictures by stealth-art/cut.py).
//
// Rules agreed with Barry (21 Nov): closed doors are scenery; an open doorway always has someone in it; the green fire
// exit is the way out. You read people by their pose, not by meters:
//   The Pacer walks up and down. Walking, she sees a few paces ahead. At each end she checks her clipboard (safe).
//     If she sees you she gasps and waves, and you have about a second to get out of sight.
//   The Boss, seen through his doorway, goes asleep -> stirring (the warning) -> awake -> asleep. In his doorway while
//     he is awake, he calls you in.
//   Controls: left thumb is a stick (gentle = creep, further = walk); right thumb has Jump and Crouch. Walking or
//   landing near the Boss's door while he sleeps wakes him early, so creep. Crouching behind the water cooler hides you.
//   Crouch + direction is a slow crouched creep. Throw lobs a cupcake a few paces ahead (two per go): the Pacer walks
//   to it and eats it, not looking, for a few seconds. One who has already spotted you ignores it.
//   The Boss's awake phase is passive (he looks about); only if he sees you upright in his doorway does he greet you.
//   A cupcake near his door: he casts a fishing rod, reels it in and scoffs it, seeing nothing meanwhile.
//   Coat stand: silent, but the Pacer sees your shoes if she stops to read right beside it. Locker: hides you
//   completely, but the door clangs and wakes the Boss if he is within three heights.
//   Hide by hopping into the recycling bin.
//   Caught: the conversation drains the battery until you escape by tapping Nod while steering away (see caught()).
// Distances are in "heights": 1 = how tall the introvert stands. All wording is a draft for Barry to edit.
import { ART, PPH } from "./stealth-art/art.js";

const TITLE = "Just Passing Through";   // working title
const LEVEL = { cakes: 2, len: 17.4, start: .7, bin: 5.0, cooler: 7.4, coats: 11.3, locker: 12.25, doorway: 13.9, exit: 16.0,
  pacer: { from: 3.6, to: 11.6, x: 7.5, f: -1, sight: 2.3, speed: .9, read: 2.8, name: "The Pacer", colour: "#e81f84",
    lines: ["Ooh, just the person. Have you got two minutes for a quick survey?", "There you are! I’ve got a form with your name on it.", "Perfect timing. We’re one short for the fun committee."] },
  boss: { asleep: 3.6, stir: 1.0, awake: 2.6, droop: .6, name: "The Boss", colour: "#7a5a2e",
    lines: ["Come in, come in. Shut the door. Let me tell you about synergy.", "Got a minute? Let’s blue-sky this. Sit.", "Ah! Walk me through your bandwidth going forward."] } };
const FILLER = ["and anyway…", "so I said…", "which reminds me…", "long story short…", "it gets better…", "where was I…", "no, I tell a lie…", "going forward…", "to be fair…", "and then…"];
const FAILS = ["You have agreed to attend a barbecue.", "You are now on the social committee.", "You said “we must do this again”. You must now do this again.", "You have been added to a group chat."];

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
.sg{position:relative;height:calc(100dvh - var(--hh,63px));min-height:300px;overflow:hidden;background:#1d1a17;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}
.sg [hidden]{display:none!important}
.sg canvas#sgc{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.sg .hud{position:absolute;top:8px;right:12px;z-index:3;padding:5px 12px 5px 8px;border-radius:9px;background:rgba(22,20,18,.72);pointer-events:none}
.sg .bat{display:flex;gap:3px;padding:3px;border:2px solid #f6efe0;border-radius:6px;position:relative}
.sg .bat:after{content:"";position:absolute;right:-6px;top:50%;width:3px;height:9px;margin-top:-4.5px;background:#f6efe0;border-radius:0 2px 2px 0}
.sg .bat i{display:block;width:12px;height:13px;border-radius:2px;background:#fad00c}.sg .bat i.off{background:#f6efe0;opacity:.14}
.sg .tip{position:absolute;left:50%;bottom:10px;z-index:3;transform:translateX(-50%);width:max-content;max-width:calc(100% - 20px);margin:0;padding:8px 14px;border-radius:10px;background:rgba(22,20,18,.9);border:1px solid rgba(255,231,166,.35);color:#f6efe0;font-size:13px;font-weight:600;line-height:1.35;text-align:center;text-wrap:balance;pointer-events:none}
.sg.wide .tip{bottom:auto;top:46px}
.sg .talk{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}
.sg .talk canvas{width:min(100%,400px);height:auto;border-radius:14px;background:#fbf1e7;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.sg .bub{position:relative;width:min(100%,400px);padding:14px 18px 16px;border-radius:20px;background:#fffdf6;color:#1c1611;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.sg .bub small{display:block;margin-bottom:4px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6d6257}
.sg .bub p{margin:0;font-size:17px;font-weight:700;line-height:1.3}.sg .bub .fill{margin-top:8px;font-size:14px;font-weight:600;color:#6d6257;min-height:2.8em}
.sg .talk .btn{background:#1c1611;color:#fffdf6;padding:16px 26px;font-size:17px;touch-action:none;user-select:none;-webkit-user-select:none}
.sg .bub{border:3px solid transparent}
.sg .talk.mini{inset:auto;left:0;right:0;top:40px;padding:0 10px;pointer-events:none;display:block}.sg .talk.mini canvas{display:none}.sg .talk.mini .bub{margin:0 auto;padding:8px 14px 10px;border-radius:14px;width:min(100%,420px)}.sg .talk.mini .bub p{font-size:14px}.sg .talk.mini .bub .fill{margin-top:3px;font-size:12px;min-height:1.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sg.wide .talk.mini .bub{width:min(56%,420px)}
.sg .card{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(22,20,18,.72);overflow:auto}
.sg .card>div{width:min(100%,430px);margin:auto;padding:20px 20px 18px;border-radius:16px;background:rgba(24,21,17,.97);border:2px solid #fad00c;border-bottom-width:6px;color:#f6efe0;box-shadow:0 14px 40px rgba(0,0,0,.6)}
.sg .card .pre{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fad00c}
.sg .card h1,.sg .card h2{margin:2px 0 10px;font-size:26px;line-height:1.1;font-weight:800;text-wrap:balance}
.sg .card p{margin:0 0 10px;font-size:15px;line-height:1.45}.sg .card ul{margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.45}.sg .card li{margin-bottom:4px}
.sg .card .go{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:12px 0 0}.sg .card .btn{background:#fad00c;color:#1c1611}.sg .card a{color:#f6efe0;font-size:14px}
.sg .card .sm{font-size:13px;color:#b9ae9c;margin:0}
@media (max-height:440px){.sg .card h1,.sg .card h2{font-size:20px}.sg .card ul{font-size:13px}.sg .card>div{width:min(100%,640px);padding:12px 16px}.sg .card p{font-size:13px;margin-bottom:6px}
 .sg .talk{flex-direction:row;flex-wrap:wrap}.sg .talk canvas{width:min(44%,300px)}.sg .bub{width:min(50%,380px)}}
`;

// The game itself, run in the visitor's browser. Written without backticks or dollar-braces so it can sit in String.raw.
const CLIENT = String.raw`
(function(){
var L=__LEVEL__,ART=__ART__,PPH=__PPH__,FILLER=__FILLER__,FAILS=__FAILS__,SRC=__SRC__;
var $=function(i){return document.getElementById(i)},box=$('sg'),cv=$('sgc'),cx=cv.getContext('2d'),tipEl=$('sgt'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var IMG={},left=0;Object.keys(ART).forEach(function(n){left++;var im=new Image();im.onload=im.onerror=function(){left--};im.src=SRC+n;IMG[n]=im});
// Heights down the picture: the wall drawing is BGH tall, doors stand on WALLB, feet on FEET, and the view is VIEW tall.
var VIEW=2.5,BGH=2.18,WALLB=1.955,FEET=2.13,TILE=ART.corridor.W/ART.corridor.H*BGH,SPEED=1.25,HOP=3.6,GRAV=9.5,RIM=ART.bin.rim;
var CRAWL=.42,CREEP=.6,WALK=[0,1,2,3,4,5],YEL='#fad00c',CREAM='#f6efe0',DOORW=(ART.props.hole.x1-ART.props.hole.x0)/PPH;

var S,P,PC,BO,CK,T=0,tipT=0,keys={},stick=null,held={},hopQ=false,throwQ=false,hideQ=false;
function reset(){P={x:L.start,y:0,vy:0,f:1,state:'idle',st:0,t:0,door:0,nodT:0,away:0};
 PC={x:L.pacer.x,f:L.pacer.f,state:'walk',st:0,t:0,blind:0,cake:false,peek:false};BO={t:0,hold:0,cake:false,ct:0,greet:false,gt:0};CK=null;
 S={mode:'ready',batt:1,chats:0,t:0,who:null,seenTip:false,wokeTip:false,cakes:L.cakes};keys={};stick=null;held={};hopQ=throwQ=hideQ=false;batt();tip('Left thumb: push gently to creep, further to walk.',1e9)}
function batt(){var c=$('sgb').children,b=Math.max(0,S.batt);for(var i=0;i<c.length;i++){var f=Math.max(0,Math.min(1,b*3-i));c[i].className=f<=0?'off':'';c[i].style.opacity=f<=0?'':String(.25+.75*f)}$('sgb').setAttribute('aria-label','Social battery: '+Math.round(b*100)+' percent')}
function tip(t,s){tipEl.textContent=t;tipT=s||4;tipEl.hidden=!t}
// How hard the stick is pushed, -1 to 1. Under CREEP of full speed counts as creeping (quiet).
function axis(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);return k?k*(keys.Shift?.42:1):(stick?stick.v:0)}
function ducking(){return !!(held.crouch||keys.ArrowDown||keys.s)}
function hidden(){return P.state==='bin'||P.state==='locker'||(P.state==='coats'&&!PC.peek)||(P.state==='duck'&&Math.abs(P.x-L.cooler)<.3)}
// The coat stand or the locker, if you are standing right by one.
function nearSpot(){if(P.y>0||!(P.state==='idle'||P.state==='walk'||P.state==='duck'))return null;return Math.abs(P.x-L.coats)<.42?'coats':Math.abs(P.x-L.locker)<.42?'locker':null}
// What the Boss is up to: 0 asleep, 1 stirring, 2 awake and looking about, 3 nodding off again, 4 busy with a cupcake, 5 greeting you.
function bossCycle(){var b=L.boss;return BO.t%(b.asleep+b.stir+b.awake+b.droop)}
function bossPhase(){if(BO.cake)return 4;if(BO.greet)return 5;var b=L.boss,c=bossCycle();return c<b.asleep?0:c<b.asleep+b.stir?1:c<b.asleep+b.stir+b.awake?2:3}
function bossFrame(){var ph=bossPhase(),b=L.boss;if(ph===4)return BO.ct<.8?8:BO.ct<1.7?9:BO.ct<2.7?10:11;if(ph===5)return 2;if(ph===0)return 0;if(ph===1)return 1;if(ph===3)return 7;
 var c=bossCycle()-b.asleep-b.stir;return c<.4?4:Math.floor((c-.4)/.75)%2?6:5}

// ---- being caught ----
// A conversation drains the battery for as long as it lasts. Tapping Nod (the Throw button) nods and edges you away in
// the direction you are steering; stop and they close the gap. Holding it counts as slow tapping. Get clear to escape.
var fillT=null,C=null,nodHeld=false,throwLock=0,DRAIN=1/7,CLEAR=1.9;
function caught(who){S.mode='chat';S.who=who;S.chats++;held={};nodHeld=false;P.state='idle';P.y=0;P.vy=0;P.nodT=0;P.away=0;C={taps:0,prog:0,auto:0,t:0,arrive:who!=='boss'};
 var d=who==='boss'?L.boss:L.pacer,tk=$('sgtalk'),mini=who!=='boss';tk.classList.toggle('mini',mini);tk.style.background=mini?'':d.colour;tk.style.top=mini?((tall?sceneH+8:40)+'px'):'';$('sgbub').style.borderColor=d.colour;
 $('sgwho').textContent=d.name;$('sgline').textContent=d.lines[Math.floor(Math.random()*d.lines.length)];var f=$('sgfill'),words=[];f.textContent='';$('sgnod').hidden=mini;tk.hidden=false;
 var n=0,order=FILLER.slice().sort(function(){return Math.random()-.5});clearInterval(fillT);fillT=setInterval(function(){words.push(order[n++%order.length]);if(words.length>5)words.shift();f.textContent=words.join(' ')},520);
 if(who==='boss'){picture()}else{PC.state='talk';PC.f=P.x>=PC.x?1:-1}
 tip(mini?'Tap NOD and steer away. Keep tapping.':'Keep nodding to edge your chair out of the door.',1e9)}
// The Boss scene is Barry's drawing; as you nod your way out it slides off, with a bar for how nearly out you are.
function picture(){var c=$('sgpic').getContext('2d'),w=640,h=300,im=IMG['caught-boss'],CUT=238;
 if(!im.naturalWidth){c.fillStyle='#fbf1e7';c.fillRect(0,0,w,h);return}
 // The drawing is split just left of the desk: the Boss and his desk stay put, and only you (and your chair) slide out.
 var s=Math.max(w/im.naturalWidth,h/im.naturalHeight),x0=(w-im.naturalWidth*s)/2,y0=(h-im.naturalHeight*s)/2,ih=im.naturalHeight;
 c.drawImage(im,x0,y0,im.naturalWidth*s,ih*s);if(!picture.paper){try{var px=c.getImageData(w-6,6,1,1).data;picture.paper='rgb('+px[0]+','+px[1]+','+px[2]+')'}catch(e){picture.paper='#fbf1e7'}}
 c.fillStyle=picture.paper;c.fillRect(0,0,x0+CUT*s,h);
 c.drawImage(im,0,0,CUT,ih,x0-Math.min(1,C.prog)*(CUT*s+x0+10),y0+(P.nodT>0?5:0),CUT*s,ih*s);
 c.fillStyle='rgba(28,22,17,.25)';c.fillRect(20,h-22,w-40,10);c.fillStyle='#1c1611';c.fillRect(20,h-22,(w-40)*Math.min(1,C.prog),10)}
function nodTap(){if(S.mode!=='chat')return;C.taps++;P.nodT=.2;
 if(S.who==='boss'){C.prog+=.1;return}if(C.arrive)return;   // she has to reach you before you can start backing off
 var a=axis(),dn=Math.abs(a)>.12?(a>0?1:-1):(P.x>=PC.x?1:-1);P.x=Math.max(.35,Math.min(L.len-.3,P.x+dn*.2))}
function chatTick(dt){C.t+=dt;S.batt-=DRAIN*dt;batt();if(P.nodT>0)P.nodT-=dt;
 if(S.batt<=0){endChat();S.mode='lost';card('Social battery flat.',FAILS[Math.floor(Math.random()*FAILS.length)],'Back to the start of the corridor. Nobody saw anything.','Try again');return}
 if(nodHeld){C.auto-=dt;if(C.auto<=0){nodTap();C.auto=.42}}
 if(S.who==='boss'){C.prog=Math.max(0,C.prog-.12*dt);picture();if(C.prog>=1)free();return}
 var gap=Math.abs(P.x-PC.x);PC.f=P.x>=PC.x?1:-1;P.f=-PC.f;
 if(C.arrive){if(gap<=.6)C.arrive=false;else PC.x+=PC.f*2.6*dt;return}
 if(gap>=CLEAR){free();return}if(gap>.55&&P.nodT<=0)PC.x+=PC.f*.35*dt}
function endChat(){clearInterval(fillT);$('sgtalk').hidden=true;nodHeld=false;C=null}
function free(){var who=S.who;endChat();S.who=null;S.mode='play';throwLock=1.2;held={};
 if(who==='boss'){BO.t=0;BO.greet=false;P.x=L.doorway+DOORW/2+.25;P.f=1}else{P.f=P.x>=PC.x?1:-1;P.away=.5;PC.state='walk';PC.blind=4;PC.st=0;PC.t=0}
 tip(S.batt<.34?'Battery nearly flat. Tread carefully.':'Free. Go, while they’re pleased with themselves.',3)}
function win(){S.mode='won';card('You’re out.',S.chats===0?'Nobody saw you leave. They’ll assume you’re still in the meeting.':S.chats===1?'One conversation endured. You nodded in all the right places.':S.chats+' conversations endured. You are owed a quiet weekend.',
 'Out in '+Math.round(S.t)+' seconds.','Go again')}
function card(h,p,sm,btn){$('sgch').textContent=h;$('sgcp').textContent=p;$('sgcs').textContent=sm;$('sgcb').textContent=btn;$('sgintro').hidden=true;$('sgend').hidden=false;$('sgcard').hidden=false;tipEl.hidden=true;$('sgcb').focus()}

// Anything louder than creeping, near the Boss's door while he is asleep, wakes him early.
function noise(r){if(S.mode!=='play'||Math.abs(P.x-L.doorway)>(r||DOORW/2+.55)||bossPhase()!==0)return;var b=L.boss;BO.t=b.asleep+b.stir-.45;if(r){tip('The locker door clanged. The Boss is stirring.',3.5)}else if(!S.wokeTip){S.wokeTip=true;tip('Too loud. You woke him. Push the stick gently to creep past.',3.5)}}
// ---- one tick ----
function update(dt){if(S.mode==='chat'){chatTick(dt);return}if(S.mode!=='play'&&S.mode!=='ready')return;if(P.away>0)P.away-=dt;if(throwLock>0){throwLock-=dt;if(throwQ){throwQ=false;throwLock=Math.max(throwLock,.6)}}
 if(tipT<1e8){tipT-=dt;if(tipT<=0){tip(hidden()?'In the recycling. Walk to climb out.':'',1e9)}}
 var a=axis(),d=a>.12?1:a<-.12?-1:0,sp=SPEED*Math.min(1,Math.abs(a)),spot=nearSpot(),duck=ducking()&&!spot;if(P.door>0)P.door-=dt;if(S.mode==='ready'&&(d||hopQ||duck||hideQ)){S.mode='play';tip('Watch what people are doing before you walk past them.',5)}
 if(S.mode==='play')S.t+=dt;
 // you
 P.st+=dt;
 if(P.state==='coats'||P.state==='locker'){if(d||hopQ||hideQ){if(P.state==='locker'){P.door=.3;noise(3)}P.state='idle';PC.peek=false;tip('',.01)}}
 else if(P.state==='bin'){if(d||hopQ){P.state='air';P.y=RIM;P.vy=1.7;P.f=d||P.f;P.x+=(d||P.f)*.25;P.st=0;tip('',.01)}}
 else if(P.state==='crouch'){if(P.st>.09){P.state='air';P.vy=HOP;P.st=0}}
 else if(P.state==='land'){if(P.st>.13){P.state='idle';P.st=0}}
 else if(P.state==='air'){P.vy-=GRAV*dt;P.y+=P.vy*dt;if(d){P.x+=d*sp*dt;P.f=d}
  if(P.vy<0&&P.y<=RIM&&P.y>RIM-.2&&Math.abs(P.x-L.bin)<.3){P.state='bin';P.x=L.bin;P.y=0;P.vy=0;tip('In the recycling. Technically, you are paper. Walk to climb out.',4)}
  else if(P.y<=0){P.y=0;P.vy=0;P.state='land';P.st=0;noise()}}
 else if(hideQ&&spot){P.state=spot;P.x=L[spot];if(spot==='locker'){P.door=.3;tip('In the locker. Push the stick to come out.',4);noise(3)}else tip('Among the coats. Your shoes are showing. Push the stick to come out.',4)}
 else if(duck){P.state='duck';if(d){P.f=d;P.x+=d*CRAWL*dt;P.t+=dt}}
 else{if(hopQ){P.state='crouch';P.st=0}else if(d){P.f=d;P.x+=d*sp*dt;if(P.state!=='walk'){P.state='walk';P.t=0}P.t+=dt*Math.max(.5,Math.abs(a));if(Math.abs(a)>CREEP)noise()}else P.state='idle'}
 if(throwQ&&S.mode==='play'&&!CK&&S.cakes>0&&(P.state==='idle'||P.state==='walk'||P.state==='duck')){S.cakes--;CK={x:P.x+P.f*.2,y:.7,vx:P.f*3.4,vy:2.6,landed:false};if(!S.cakeTip){S.cakeTip=true;tip('A cupcake. Nobody in an office can walk past one.',3.5)}}
 throwQ=false;if(CK&&!CK.landed){CK.x=Math.max(.5,Math.min(L.len-.5,CK.x+CK.vx*dt));CK.vy-=GRAV*dt;CK.y+=CK.vy*dt;if(CK.y<=0){CK.y=0;CK.landed=true}}
 hopQ=hideQ=false;P.x=Math.max(.35,Math.min(L.len-.3,P.x));
 if(P.x>=L.exit-.05&&(P.state==='idle'||P.state==='walk'||P.state==='duck'||P.state==='air')){win();return}
 if(P.state==='duck'&&hidden()&&!S.duckTip){S.duckTip=true;tip('Crouched behind the water cooler. Nobody looks at a water cooler.',3.5)}
 // the Pacer
 var q=L.pacer;PC.st+=dt;if(PC.blind>0)PC.blind-=dt;
 var ahead=(P.x-PC.x)*PC.f,sees=!hidden()&&S.mode==='play'&&PC.blind<=0&&((ahead>.1&&ahead<q.sight)||Math.abs(P.x-PC.x)<.3);
 if(PC.cake&&(!CK||CK.boss)&&PC.state==='walk')PC.cake=false;
 if(CK&&CK.landed&&!CK.boss&&!PC.cake&&Math.abs(CK.x-PC.x)<4.2&&(PC.state==='walk'||PC.state==='read')){PC.cake=true;PC.state='walk';PC.f=CK.x>=PC.x?1:-1;ahead=(P.x-PC.x)*PC.f}
 if(PC.state==='walk'&&PC.cake&&CK&&!sees&&Math.abs(CK.x-PC.x)<=.45){PC.state='c1';PC.st=0;PC.f=CK.x>=PC.x?1:-1}
 if(PC.state==='c1'){if(PC.st>.7){PC.state='c2';PC.st=0}}
 else if(PC.state==='c2'){if(PC.st>.25)CK=null;if(PC.st>.65){PC.state='c3';PC.st=0}}
 else if(PC.state==='c3'){if(PC.st>.8){PC.state='c4';PC.st=0}}
 else if(PC.state==='c4'){if(PC.st>4.5){PC.state='walk';PC.t=0;PC.cake=false;if(PC.x>q.to)PC.f=-1;else if(PC.x<q.from)PC.f=1}}
 else if(PC.state==='walk'){PC.x+=PC.f*q.speed*dt;PC.t+=dt;
  if(sees){PC.state='spot';PC.st=0;PC.f=P.x>=PC.x?1:-1;if(!S.seenTip){S.seenTip=true;tip('She’s seen you. Get out of sight.',2.5)}}
  else if(!PC.cake&&((PC.f<0&&PC.x<=q.from)||(PC.f>0&&PC.x>=q.to))){PC.x=PC.f<0?q.from:q.to;PC.state='read';PC.st=0}}
 else if(PC.state==='read'){if(P.state==='coats'&&!PC.peek&&PC.blind<=0&&PC.st>.8&&Math.abs(PC.x-L.coats)<.9){PC.peek=true;PC.state='spot';PC.st=0;PC.f=P.x>=PC.x?1:-1;tip('She stopped right beside you and saw your shoes.',3)}else if(PC.st>=q.read){PC.f=-PC.f;PC.state='walk';PC.t=0}}
 else if(PC.state==='spot'){var gone=hidden()||Math.abs(P.x-PC.x)>q.sight+.7;if(gone){PC.state='lost';PC.st=0}else if(PC.st>=1.05){caught('pacer');return}}
 else if(PC.state==='lost'){if(PC.st>=.9){PC.state='walk';PC.t=0;if((PC.f<0&&PC.x<=q.from)||(PC.f>0&&PC.x>=q.to))PC.f=-PC.f}}
 // the Boss
 var inDoor=!hidden()&&P.state!=='duck'&&Math.abs(P.x-L.doorway)<DOORW/2+.06;   // crouched, you are under his eyeline
 if(BO.greet){BO.gt+=dt;if(BO.gt>.55){BO.greet=false;caught('boss');return}}
 else if(BO.cake){BO.ct+=dt;if(BO.ct>1.7&&CK&&CK.boss)CK=null;if(BO.ct>6.7){BO.cake=false;BO.t=0}}       // spots it, casts, reels it in, scoffs it, nods off
 else{BO.t+=dt;if(CK&&CK.landed&&Math.abs(CK.x-L.doorway)<1.3){CK.boss=true;BO.cake=true;BO.ct=0;BO.hold=0}
  else if(bossPhase()===2&&inDoor&&S.mode==='play'){BO.hold+=dt;if(BO.hold>.14){BO.hold=0;BO.greet=true;BO.gt=0}}else BO.hold=0}}

// ---- painting ----
var W=0,H=0,u=100,vw=4,sceneH=0,sceneY=0,dpr=1,cam=0,tall=false,PAD={sx:0,sy:0,sr:46,jump:{x:0,y:0,r:40},crouch:{x:0,y:0,r:32},'throw':{x:0,y:0,r:32}};
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 tall=H>W;box.classList.toggle('wide',!tall);u=tall?Math.min(W/3.4,H*.62/VIEW):Math.min(H/VIEW,W/4.2);sceneH=VIEW*u;sceneY=tall?0:Math.max(0,(H-sceneH)/2);vw=W/u;
 if(tall){var h=H-sceneH,y0=sceneH;PAD.sx=W*.26;PAD.sy=y0+h*.42;PAD.jump={x:W*.8,y:y0+h*.3,r:42};PAD.crouch={x:W*.6,y:y0+h*.5,r:33};PAD['throw']={x:W*.84,y:y0+h*.62,r:33}}
 else{PAD.sx=84;PAD.sy=H-78;PAD.jump={x:W-70,y:H-142,r:40};PAD.crouch={x:W-158,y:H-70,r:33};PAD['throw']={x:W-66,y:H-54,r:33}}}
function spr(name,frame,x,base,flip,alpha){var a=ART[name],im=IMG[name];if(!im.naturalWidth)return;var k=1/PPH;cx.save();cx.translate(x,base);if(flip)cx.scale(-1,1);if(alpha!=null)cx.globalAlpha=alpha;
 cx.drawImage(im,frame*a.w,0,a.w,a.h,-a.ax*k,-a.base*k,a.w*k,a.h*k);cx.restore()}
function prop(name,x,base,anchor){var it=ART.props.items[name],im=IMG.props;if(!im.naturalWidth)return;var k=1/PPH;cx.drawImage(im,it.x,ART.props.H-it.h,it.w,it.h,x-anchor*k,base-it.h*k,it.w*k,it.h*k)}
function shadow(x,w,a){cx.fillStyle='rgba(40,30,20,'+a+')';cx.beginPath();cx.ellipse(x,FEET+.03,w,.04,0,0,6.2832);cx.fill()}
function tag(t,x,y){cx.font='800 .1px Montserrat,system-ui,sans-serif';cx.textAlign='center';cx.textBaseline='middle';var w=cx.measureText(t).width+.16;cx.fillStyle=YEL;cx.beginPath();cx.roundRect(x-w/2,y-.1,w,.2,.1);cx.fill();cx.fillStyle='#1c1611';cx.fillText(t,x,y+.006)}
function draw(){var c=cx,d0=Math.abs(axis())>.12;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#1d1a17';c.fillRect(0,0,W,H);
 var want=Math.max(0,Math.min(L.len-vw,P.x-vw*(P.f>0?.3:.5)));cam+=(want-cam)*(calm||S.mode==='ready'?1:.08);
 c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.translate(0,sceneY);c.scale(u,u);c.translate(-cam,0);c.imageSmoothingQuality='high';
 // floor below the wall drawing, then the wall, repeated
 c.fillStyle=ART.corridor.floor;c.fillRect(cam,BGH-.02,vw,VIEW-BGH+.02);var g=c.createLinearGradient(0,BGH,0,VIEW);g.addColorStop(0,'rgba(40,30,20,0)');g.addColorStop(1,'rgba(40,30,20,.35)');c.fillStyle=g;c.fillRect(cam,BGH-.02,vw,VIEW-BGH+.02);
 if(IMG.corridor.naturalWidth)for(var i=Math.floor(cam/TILE);i*TILE<cam+vw;i++)c.drawImage(IMG.corridor,i*TILE,0,TILE+.004,BGH);
 // the Boss's office, seen through his doorway
 var hole=ART.props.hole,k=1/PPH,dw=ART.props.items.doorway,dx0=L.doorway-(hole.x0+hole.x1)/2*k,ox=dx0+hole.x0*k,oy=WALLB-(dw.h-hole.top)*k,ow=DOORW,oh=(dw.h-hole.top)*k,ph=bossPhase();
 c.save();c.beginPath();c.rect(ox,oy,ow,oh);c.clip();c.fillStyle='#b7a27c';c.fillRect(ox,oy,ow,oh);c.fillStyle='#8e7a5c';c.fillRect(ox,WALLB-.2,ow,.2);
 c.fillStyle='rgba(60,45,25,.25)';for(var j=0;j<7;j++)c.fillRect(ox,oy+.12+j*.085,ow,.02);
 var b=ART.boss,bf=bossFrame(),bx=L.doorway-b.ax*k,by=WALLB-.04-b.h*k;if(IMG.boss.naturalWidth)c.drawImage(IMG.boss,bf*b.w,0,b.w,b.h,bx,by,b.w*k,b.h*k);
 var sh=c.createLinearGradient(ox,0,ox+ow,0);sh.addColorStop(0,'rgba(30,20,10,.4)');sh.addColorStop(.3,'rgba(30,20,10,0)');c.fillStyle=sh;c.fillRect(ox,oy,ow,oh);c.restore();
 if(IMG.props.naturalWidth)c.drawImage(IMG.props,dw.x,ART.props.H-dw.h,dw.w,dw.h,dx0,WALLB-dw.h*k,dw.w*k,dw.h*k);
 if((bf===9||bf===10)&&IMG.boss.naturalWidth)c.drawImage(IMG.boss,bf*b.w,0,b.rodx,b.rody,bx,by,b.rodx*k,b.rody*k);   // his fishing rod pokes out of the doorway
 if(ph===0){c.font='800 .16px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle='rgba(60,45,25,.75)';for(var z=0;z<3;z++){var zt=calm?z/3:((T*.5+z/3)%1);c.globalAlpha=(1-zt)*.9;c.fillText('z',L.doorway+.12+zt*.22,oy+.42-zt*.34)}c.globalAlpha=1}
 var ct=ART.coats,lk=ART.locker,tucked=P.state==='coats'||P.state==='locker';
 if(IMG.coats.naturalWidth){c.fillStyle='rgba(40,30,20,.2)';c.beginPath();c.ellipse(L.coats,FEET-.06,.4,.04,0,0,6.2832);c.fill();c.drawImage(IMG.coats,(P.state==='coats'?1:0)*ct.w,0,ct.w,ct.h,L.coats-ct.w*k/2,FEET-.04-ct.h*k,ct.w*k,ct.h*k)}
 if(IMG.locker.naturalWidth){var lf=P.door>0?1:P.state==='locker'?2:0;c.drawImage(IMG.locker,lf*lk.w,0,lk.w,lk.h,L.locker+lk.body*k/2-lk.w*k,WALLB+.04-lk.h*k,lk.w*k,lk.h*k)}
 if((S.mode==='play'||S.mode==='ready')&&nearSpot())tag('TAP HIDE',L[nearSpot()],FEET-1.55);
 var behind=P.state==='duck'&&hidden();if(behind){shadow(P.x,.27,.2);spr('introvert',7,P.x,FEET-.06,P.f<0)}
 prop('cooler',L.cooler,behind?FEET+.02:WALLB+.02,ART.props.items.cooler.w/2);prop('exit',L.exit,WALLB,ART.props.items.exit.w/2);
 // the bin: empty, or with you in it
 var bn=ART.bin,inBin=P.state==='bin';if(IMG.bin.naturalWidth){c.fillStyle='rgba(40,30,20,.22)';c.beginPath();c.ellipse(L.bin+.08,FEET-.06,.36,.04,0,0,6.2832);c.fill();c.drawImage(IMG.bin,inBin?bn.w:0,0,bn.w,bn.h,L.bin-bn.w*k*.62,FEET-.07-bn.h*k,bn.w*k,bn.h*k)}
 if(S.mode==='play'&&!inBin&&Math.abs(P.x-L.bin)<.75)tag('JUMP TO HOP IN',L.bin,FEET-1.25);
 // the Pacer
 if(CK&&IMG.cupcake.naturalWidth){var cw=ART.cupcake.W*k,chh=ART.cupcake.H*k;c.drawImage(IMG.cupcake,CK.x-cw/2,FEET-.02-CK.y-chh,cw,chh)}
 var pf=PC.state==='walk'?WALK[Math.floor(PC.t/.1)%6]:PC.state==='read'?6:PC.state==='spot'?7:PC.state==='lost'?6:PC.state==='c1'?10:PC.state==='c2'?11:PC.state==='c3'?12:PC.state==='c4'?(Math.floor(PC.st/.6)%2?12:13):PC.state==='talk'?(C&&C.arrive?WALK[Math.floor(T/.07)%6]:8+Math.floor(T/.43)%2):8;shadow(PC.x,.3,.22);spr('pacer',pf,PC.x,FEET,PC.f<0);
 if(PC.state==='spot'){c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle=L.pacer.colour;c.fillText('!',PC.x+PC.f*.3,FEET-1.5)}
 if(PC.state==='lost'){c.font='800 .24px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle='rgba(60,45,25,.8)';c.fillText('?',PC.x+PC.f*.25,FEET-1.5)}
 // you
 if(S.mode==='chat'&&S.who==='pacer'){shadow(P.x,.27,.2);spr('introvert',P.nodT>0?(C.taps%2?21:22):(Math.floor(C.t/.5)%2?19:18),P.x,FEET,P.f<0)}
 else if(P.away>0&&P.state!=='duck'&&P.y===0){shadow(P.x,.27,.2);spr('introvert',23,P.x,FEET,P.f>0)}
 else if(!inBin&&!behind&&!tucked){var f=P.state==='duck'&&d0?12+Math.floor(P.t/.16)%6:P.state==='crouch'||P.state==='duck'?7:P.state==='air'?8:P.state==='land'?9:P.state==='walk'?WALK[Math.floor(P.t/.12)%6]:6;shadow(P.x,P.y>0?.2:.27,P.y>0?.1:.2);spr('introvert',f,P.x,FEET-P.y-(P.state==='duck'&&d0?Math.abs(Math.sin(P.t*9))*.025:0),P.f<0)}
 c.restore();
 if(left>0){c.fillStyle=CREAM;c.font='600 14px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillText('Unrolling the carpet…',W/2,sceneY+sceneH/2)}
 // the thumb controls: a stick wherever the left thumb lands, Jump and Crouch under the right thumb
 if(tall){c.fillStyle='#1d1a17';c.fillRect(0,sceneH,W,H-sceneH);c.fillStyle='#2a2622';c.fillRect(0,sceneH,W,3)}
 if(S.mode==='play'||S.mode==='ready'||(S.mode==='chat'&&S.who==='pacer')){var chat=S.mode==='chat',o=stick||{x0:PAD.sx,y0:PAD.sy,v:0};c.lineWidth=2;c.strokeStyle='rgba(246,239,224,'+(stick?.7:.35)+')';c.fillStyle='rgba(22,20,18,.35)';c.beginPath();c.arc(o.x0,o.y0,PAD.sr,0,6.2832);c.fill();c.stroke();
  c.fillStyle=Math.abs(o.v)>CREEP?YEL:'rgba(246,239,224,'+(stick?.9:.5)+')';c.beginPath();c.arc(o.x0+o.v*PAD.sr,o.y0,PAD.sr*.45,0,6.2832);c.fill();
  c.font='700 10px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';if(!stick){c.fillStyle='rgba(246,239,224,.55)';c.fillText('CREEP · WALK',o.x0,o.y0+PAD.sr+13)}
  [['jump','JUMP'],['crouch','CROUCH'],['throw','THROW']].forEach(function(q){var b=PAD[q[0]],on=held[q[0]]!=null;if(chat&&q[0]!=='throw'){c.globalAlpha=.25}else if(chat){on=on||P.nodT>0||Math.floor(T*3)%2===0}else if(q[0]==='throw'){c.globalAlpha=S.cakes>0?1:.35}c.fillStyle=on?YEL:'rgba(22,20,18,.45)';c.strokeStyle='rgba(246,239,224,.7)';c.beginPath();c.arc(b.x,b.y,b.r,0,6.2832);c.fill();c.stroke();c.fillStyle=on?'#1c1611':CREAM;c.font='800 '+(b.r>34?12:10)+'px Montserrat,system-ui,sans-serif';if(chat&&q[0]==='throw'){c.fillText('NOD',b.x,b.y+1)}else{c.fillText(q[0]==='crouch'&&nearSpot()?'HIDE':q[1],b.x,b.y+(q[0]==='throw'?-5:1));if(q[0]==='throw'){c.fillText('× '+S.cakes,b.x,b.y+9)}}c.globalAlpha=1});c.textBaseline='alphabetic'}}
var last=0;function loop(now){var dt=Math.min(.05,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden&&left<=0)update(dt);draw();requestAnimationFrame(loop)}

// ---- thumbs and keys ----
function playing(){return S.mode==='play'||S.mode==='ready'||(S.mode==='chat'&&S.who==='pacer')}
function at(e){var b=cv.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top]}
cv.addEventListener('pointerdown',function(e){if(!playing())return;e.preventDefault();var q=at(e),hit=null;['jump','crouch','throw'].forEach(function(n){var b=PAD[n];if(Math.hypot(q[0]-b.x,q[1]-b.y)<b.r+10)hit=n});
 if(S.mode==='chat'){if(hit==='throw'){held[hit]=e.pointerId;nodHeld=true;C.auto=.42;nodTap()}else if(!hit&&q[0]<W*.55&&!stick){stick={id:e.pointerId,x0:Math.max(PAD.sr+6,q[0]),y0:q[1],v:0};move(e)}try{cv.setPointerCapture(e.pointerId)}catch(_){}return}
 if(hit){held[hit]=e.pointerId;if(hit==='jump')hopQ=true;if(hit==='throw')throwQ=true;if(hit==='crouch')hideQ=true}else if(q[0]<W*.55&&!stick){var floatOK=!tall||q[1]>sceneH;stick={id:e.pointerId,x0:floatOK?Math.max(PAD.sr+6,q[0]):PAD.sx,y0:floatOK?q[1]:PAD.sy,v:0};move(e)}
 try{cv.setPointerCapture(e.pointerId)}catch(_){}});
function move(e){if(!stick||e.pointerId!==stick.id)return;var v=(at(e)[0]-stick.x0)/PAD.sr;stick.v=Math.max(-1,Math.min(1,Math.abs(v)<.15?0:v))}
cv.addEventListener('pointermove',move);
function lift(e){if(held['throw']===e.pointerId)nodHeld=false;if(stick&&e.pointerId===stick.id)stick=null;['jump','crouch','throw'].forEach(function(n){if(held[n]===e.pointerId)delete held[n]})}cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
addEventListener('keydown',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;if(S.mode==='chat'){if(/^(Arrow(Left|Right)|[ad])$/.test(k)){keys[k]=1;e.preventDefault()}if(k==='c'||k==='Enter'||k===' '){if(!e.repeat){nodTap();nodHeld=true;C.auto=.42}e.preventDefault()}return}if(!playing())return;if(/^(Arrow(Left|Right|Down)|Shift|[ads])$/.test(k)){keys[k]=1;e.preventDefault()}if(k===' '||k==='ArrowUp'||k==='w'){if(!e.repeat)hopQ=true;e.preventDefault()}if(k==='c'||k==='Enter'){if(!e.repeat)throwQ=true;e.preventDefault()}if((k==='ArrowDown'||k==='s')&&!e.repeat)hideQ=true});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k];if(k==='c'||k==='Enter'||k===' ')nodHeld=false});addEventListener('blur',function(){keys={};stick=null;held={}});
$('sggo').addEventListener('click',function(){$('sgcard').hidden=true;cv.focus()});
$('sgcb').addEventListener('click',function(){$('sgcard').hidden=true;reset()});
(function(b){b.addEventListener('pointerdown',function(e){e.preventDefault();if(S.mode==='chat'){nodHeld=true;C.auto=.42;nodTap()}});['pointerup','pointercancel','pointerleave'].forEach(function(n){b.addEventListener(n,function(){nodHeld=false})});b.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&!e.repeat)nodTap()})})($('sgnod'));addEventListener('resize',lay);
reset();lay();requestAnimationFrame(loop);
// Hooks for the automatic play-tests.
window.__sg={L:L,S:function(){return S},P:function(){return P},PC:function(){return PC},phase:bossPhase,ready:function(){return left<=0},hold:function(v){stick=v?{id:-1,x0:PAD.sx,y0:PAD.sy,v:v}:null},hide:function(){hideQ=true},nod:nodTap,BO:function(){return BO},frame:bossFrame,duck:function(on){if(on)held.crouch=-1;else delete held.crouch},toss:function(){throwQ=true},CK:function(){return CK},hop:function(){hopQ=true},step:function(n){for(var i=0;i<n;i++)update(1/30)}};
})();`;

export function levelPage(page, hub, v) {
  const j = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__LEVEL__", () => j(LEVEL)).replace("__ART__", () => j(ART)).replace("__PPH__", () => String(PPH)).replace("__FILLER__", () => j(FILLER)).replace("__FAILS__", () => j(FAILS)).replace("__SRC__", () => j(hub.path + "/stealth?v=" + v + "&a="));
  return page(TITLE, `<style>${CSS}</style><div class="sg" id="sg">
<canvas id="sgc" tabindex="0" role="img" aria-label="A side-on view of a long office corridor. Use the on-screen stick to creep or walk, and the Jump and Crouch buttons. On a keyboard: arrow keys to walk, Shift to creep, Space to jump, down arrow to crouch."></canvas>
<div class="hud"><span class="bat" id="sgb" role="img" aria-label="Social battery: 3 of 3"><i></i><i></i><i></i></span></div>
<p class="tip" id="sgt" role="status" aria-live="polite"></p>
<div class="talk" id="sgtalk" hidden><canvas id="sgpic" width="640" height="300" aria-hidden="true"></canvas><div class="bub" id="sgbub"><small id="sgwho"></small><p id="sgline"></p><p class="fill" id="sgfill"></p></div><button class="btn" id="sgnod" type="button" hidden>Nod. Keep nodding.</button></div>
<div class="card" id="sgcard"><div>
<div id="sgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>The meeting has finished. The fire exit is at the far end of the corridor.</p>
<ul><li><b>Left thumb</b> steers: push gently to creep, further to walk. <b>Right thumb</b> jumps, crouches and throws.</li><li><b>The Pacer</b> checks her clipboard at each end of her walk. That’s your moment.</li><li><b>The Boss</b> dozes. Creep past his door (walking wakes him), or crouch-walk under his eyeline.</li><li><b>Hide</b> in the recycling (jump), behind the water cooler (crouch), or in the coats or the locker (the Crouch button turns to Hide).</li><li><b>Neither of them can resist a cupcake.</b> You have two.</li><li><b>Caught?</b> Conversation drains your battery. Tap Nod and steer away until you’re clear.</li></ul>
<p class="sm">Turn your phone sideways to see further. No sound. On a computer: arrow keys, hold Shift to creep, Space to jump, down to crouch, C to throw.</p>
<p class="go"><button class="btn" id="sggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="sgend" hidden><p class="pre">Introvert Here…</p><h2 id="sgch"></h2><p id="sgcp"></p><p class="sm" id="sgcs"></p>
<p class="go"><button class="btn" id="sgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A stealth game for introverts: get down the corridor without being drawn into a conversation.", script });
}
