// The stealth game's first corridor, in Barry's drawings (cut into pictures by stealth-art/cut.py).
//
// Rules agreed with Barry (21 Nov): closed doors are scenery; an open doorway always has someone in it; the green fire
// exit is the way out. You read people by their pose, not by meters:
//   The Pacer walks up and down. Walking, she sees a few paces ahead. At each end she checks her clipboard (safe).
//     If she sees you she gasps and waves, and you have about a second to get out of sight.
//   The Boss, seen through his doorway, goes asleep -> stirring (the warning) -> awake -> asleep. In his doorway while
//     he is awake, he calls you in.
//   Hide by hopping into the recycling bin. Three conversations and your social battery is flat.
// Distances are in "heights": 1 = how tall the introvert stands. All wording is a draft for Barry to edit.
import { ART, PPH } from "./stealth-art/art.js";

const TITLE = "Just Passing Through";   // working title
const LEVEL = { len: 17.4, start: .7, bin: 5.0, cooler: 7.4, doorway: 12.5, exit: 16.0,
  pacer: { from: 3.6, to: 10.2, x: 7.5, f: -1, sight: 2.3, speed: .9, read: 2.8, name: "The Pacer", colour: "#e81f84",
    lines: ["Ooh, just the person. Have you got two minutes for a quick survey?", "There you are! I’ve got a form with your name on it.", "Perfect timing. We’re one short for the fun committee."] },
  boss: { asleep: 3.6, stir: 1.0, awake: 2.6, name: "The Boss", colour: "#7a5a2e",
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
.sg .talk .btn{background:#1c1611;color:#fffdf6}
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
var WALK=[0,1,2,3,4,5],YEL='#fad00c',CREAM='#f6efe0',DOORW=(ART.props.hole.x1-ART.props.hole.x0)/PPH;

var S,P,PC,BO,T=0,tipT=0,keys={},touch=null,hopQ=false;
function reset(){P={x:L.start,y:0,vy:0,f:1,state:'idle',st:0,t:0};
 PC={x:L.pacer.x,f:L.pacer.f,state:'walk',st:0,t:0,blind:0};BO={t:0,hold:0};
 S={mode:'ready',cells:3,chats:0,t:0,who:null,seenTip:false};keys={};touch=null;hopQ=false;batt();tip('Hold the right side of the screen to walk. Let go to stop.',1e9)}
function batt(){var c=$('sgb').children;for(var i=0;i<c.length;i++)c[i].className=i<S.cells?'':'off';$('sgb').setAttribute('aria-label','Social battery: '+S.cells+' of 3')}
function tip(t,s){tipEl.textContent=t;tipT=s||4;tipEl.hidden=!t}
function dir(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);return k||(touch?touch.side:0)}
function hidden(){return P.state==='bin'}
function bossPhase(){var b=L.boss,c=BO.t%(b.asleep+b.stir+b.awake);return c<b.asleep?0:c<b.asleep+b.stir?1:2}

// ---- being caught ----
var fillT=null,talkT=null;
function caught(who){S.mode='talk';S.who=who;S.chats++;S.cells--;batt();touch=null;keys={};P.state='idle';P.y=0;P.vy=0;
 var d=who==='boss'?L.boss:L.pacer;$('sgtalk').style.background=d.colour;$('sgwho').textContent=d.name;$('sgline').textContent=d.lines[Math.floor(Math.random()*d.lines.length)];
 var f=$('sgfill');f.textContent='';$('sgnod').hidden=true;$('sgtalk').hidden=false;tipEl.hidden=true;
 var k=0,order=FILLER.slice().sort(function(){return Math.random()-.5});clearInterval(fillT);clearInterval(talkT);picture(who,0);
 talkT=setInterval(function(){picture(who,++k)},430);
 var n=0;fillT=setInterval(function(){f.textContent+=(n?' ':'')+order[n%order.length];n++;if(n===4){$('sgnod').hidden=false;$('sgnod').focus()}if(n>7)clearInterval(fillT)},560)}
// The picture above the speech bubble: the Boss scene is Barry's drawing; the Pacer is her talking poses over the slumped introvert.
function picture(who,k){var c=$('sgpic').getContext('2d'),w=640,h=300;c.fillStyle='#fbf1e7';c.fillRect(0,0,w,h);
 if(who==='boss'){var im=IMG['caught-boss'];if(im.naturalWidth){var s=Math.max(w/im.naturalWidth,h/im.naturalHeight);c.drawImage(im,(w-im.naturalWidth*s)/2,(h-im.naturalHeight*s)/2,im.naturalWidth*s,im.naturalHeight*s)}return}
 var s=.88,a=ART.introvert,p=ART.pacer;c.fillStyle='#efe2d2';c.fillRect(0,262,w,38);c.fillStyle='#3b342c';c.fillRect(0,262,w,2);
 if(IMG.introvert.naturalWidth)c.drawImage(IMG.introvert,10*a.w,0,a.w,a.h,200-a.ax*s,270-a.base*s,a.w*s,a.h*s);
 if(IMG.pacer.naturalWidth){c.save();c.translate(430,270);c.scale(-1,1);c.drawImage(IMG.pacer,(8+k%2)*p.w,0,p.w,p.h,-p.ax*s,-p.base*s,p.w*s,p.h*s);c.restore()}}
function nod(){clearInterval(fillT);clearInterval(talkT);$('sgtalk').hidden=true;var who=S.who;S.who=null;
 if(who==='boss'){BO.t=0;P.x=L.doorway+DOORW/2+.25}else{PC.state='walk';PC.blind=4;PC.st=0}
 if(S.cells<=0){S.mode='lost';card('Social battery flat.',FAILS[Math.floor(Math.random()*FAILS.length)],'Back to the start of the corridor. Nobody saw anything.','Try again');return}
 S.mode='play';tip(S.cells===1?'One bar of battery left. Tread carefully.':'Go, while they’re pleased with themselves.',3)}
function win(){S.mode='won';card('You’re out.',S.chats===0?'Nobody saw you leave. They’ll assume you’re still in the meeting.':S.chats===1?'One conversation endured. You nodded in all the right places.':S.chats+' conversations endured. You are owed a quiet weekend.',
 'Out in '+Math.round(S.t)+' seconds.','Go again')}
function card(h,p,sm,btn){$('sgch').textContent=h;$('sgcp').textContent=p;$('sgcs').textContent=sm;$('sgcb').textContent=btn;$('sgintro').hidden=true;$('sgend').hidden=false;$('sgcard').hidden=false;tipEl.hidden=true;$('sgcb').focus()}

// ---- one tick ----
function update(dt){if(S.mode!=='play'&&S.mode!=='ready')return;
 if(tipT<1e8){tipT-=dt;if(tipT<=0){tip(hidden()?'In the recycling. Walk to climb out.':'',1e9)}}
 var d=dir();if(S.mode==='ready'&&(d||hopQ)){S.mode='play';tip('Watch what people are doing before you walk past them.',5)}
 if(S.mode==='play')S.t+=dt;
 // you
 P.st+=dt;
 if(P.state==='bin'){if(d||hopQ){P.state='air';P.y=RIM;P.vy=1.7;P.f=d||P.f;P.x+=(d||P.f)*.25;P.st=0;tip('',.01)}}
 else if(P.state==='crouch'){if(P.st>.09){P.state='air';P.vy=HOP;P.st=0}}
 else if(P.state==='land'){if(P.st>.13){P.state='idle';P.st=0}}
 else if(P.state==='air'){P.vy-=GRAV*dt;P.y+=P.vy*dt;if(d){P.x+=d*SPEED*dt;P.f=d}
  if(P.vy<0&&P.y<=RIM&&P.y>RIM-.2&&Math.abs(P.x-L.bin)<.3){P.state='bin';P.x=L.bin;P.y=0;P.vy=0;tip('In the recycling. Technically, you are paper. Walk to climb out.',4)}
  else if(P.y<=0){P.y=0;P.vy=0;P.state='land';P.st=0}}
 else{if(hopQ){P.state='crouch';P.st=0}else if(d){P.f=d;P.x+=d*SPEED*dt;if(P.state!=='walk'){P.state='walk';P.t=0}P.t+=dt}else P.state='idle'}
 hopQ=false;P.x=Math.max(.35,Math.min(L.len-.3,P.x));
 if(P.x>=L.exit-.05&&P.state!=='bin'){win();return}
 // the Pacer
 var q=L.pacer;PC.st+=dt;if(PC.blind>0)PC.blind-=dt;
 var ahead=(P.x-PC.x)*PC.f,sees=!hidden()&&S.mode==='play'&&PC.blind<=0&&((ahead>.1&&ahead<q.sight)||Math.abs(P.x-PC.x)<.3);
 if(PC.state==='walk'){PC.x+=PC.f*q.speed*dt;PC.t+=dt;
  if(sees){PC.state='spot';PC.st=0;PC.f=P.x>=PC.x?1:-1;if(!S.seenTip){S.seenTip=true;tip('She’s seen you. Get out of sight.',2.5)}}
  else if((PC.f<0&&PC.x<=q.from)||(PC.f>0&&PC.x>=q.to)){PC.x=PC.f<0?q.from:q.to;PC.state='read';PC.st=0}}
 else if(PC.state==='read'){if(PC.st>=q.read){PC.f=-PC.f;PC.state='walk';PC.t=0}}
 else if(PC.state==='spot'){var gone=hidden()||Math.abs(P.x-PC.x)>q.sight+.7;if(gone){PC.state='lost';PC.st=0}else if(PC.st>=1.05){caught('pacer');return}}
 else if(PC.state==='lost'){if(PC.st>=.9){PC.state='walk';PC.t=0;if((PC.f<0&&PC.x<=q.from)||(PC.f>0&&PC.x>=q.to))PC.f=-PC.f}}
 // the Boss
 BO.t+=dt;var inDoor=!hidden()&&Math.abs(P.x-L.doorway)<DOORW/2+.06;
 if(bossPhase()===2&&inDoor&&S.mode==='play'){BO.hold+=dt;if(BO.hold>.14){BO.hold=0;caught('boss')}}else BO.hold=0}

// ---- painting ----
var W=0,H=0,u=100,vw=4,sceneH=0,sceneY=0,dpr=1,cam=0,tall=false;
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(3,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 tall=H>W;box.classList.toggle('wide',!tall);u=tall?Math.min(W/3.4,H*.62/VIEW):Math.min(H/VIEW,W/4.2);sceneH=VIEW*u;sceneY=tall?0:Math.max(0,(H-sceneH)/2);vw=W/u}
function spr(name,frame,x,base,flip,alpha){var a=ART[name],im=IMG[name];if(!im.naturalWidth)return;var k=1/PPH;cx.save();cx.translate(x,base);if(flip)cx.scale(-1,1);if(alpha!=null)cx.globalAlpha=alpha;
 cx.drawImage(im,frame*a.w,0,a.w,a.h,-a.ax*k,-a.base*k,a.w*k,a.h*k);cx.restore()}
function prop(name,x,base,anchor){var it=ART.props.items[name],im=IMG.props;if(!im.naturalWidth)return;var k=1/PPH;cx.drawImage(im,it.x,ART.props.H-it.h,it.w,it.h,x-anchor*k,base-it.h*k,it.w*k,it.h*k)}
function shadow(x,w,a){cx.fillStyle='rgba(40,30,20,'+a+')';cx.beginPath();cx.ellipse(x,FEET+.03,w,.04,0,0,6.2832);cx.fill()}
function tag(t,x,y){cx.font='800 .1px Montserrat,system-ui,sans-serif';cx.textAlign='center';cx.textBaseline='middle';var w=cx.measureText(t).width+.16;cx.fillStyle=YEL;cx.beginPath();cx.roundRect(x-w/2,y-.1,w,.2,.1);cx.fill();cx.fillStyle='#1c1611';cx.fillText(t,x,y+.006)}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#1d1a17';c.fillRect(0,0,W,H);
 var want=Math.max(0,Math.min(L.len-vw,P.x-vw*(P.f>0?.3:.5)));cam+=(want-cam)*(calm||S.mode==='ready'?1:.08);
 c.save();c.beginPath();c.rect(0,sceneY,W,sceneH);c.clip();c.translate(0,sceneY);c.scale(u,u);c.translate(-cam,0);c.imageSmoothingQuality='high';
 // floor below the wall drawing, then the wall, repeated
 c.fillStyle=ART.corridor.floor;c.fillRect(cam,BGH-.02,vw,VIEW-BGH+.02);var g=c.createLinearGradient(0,BGH,0,VIEW);g.addColorStop(0,'rgba(40,30,20,0)');g.addColorStop(1,'rgba(40,30,20,.35)');c.fillStyle=g;c.fillRect(cam,BGH-.02,vw,VIEW-BGH+.02);
 if(IMG.corridor.naturalWidth)for(var i=Math.floor(cam/TILE);i*TILE<cam+vw;i++)c.drawImage(IMG.corridor,i*TILE,0,TILE+.004,BGH);
 // the Boss's office, seen through his doorway
 var hole=ART.props.hole,k=1/PPH,dw=ART.props.items.doorway,dx0=L.doorway-(hole.x0+hole.x1)/2*k,ox=dx0+hole.x0*k,oy=WALLB-(dw.h-hole.top)*k,ow=DOORW,oh=(dw.h-hole.top)*k,ph=bossPhase();
 c.save();c.beginPath();c.rect(ox,oy,ow,oh);c.clip();c.fillStyle='#b7a27c';c.fillRect(ox,oy,ow,oh);c.fillStyle='#8e7a5c';c.fillRect(ox,WALLB-.2,ow,.2);
 c.fillStyle='rgba(60,45,25,.25)';for(var j=0;j<7;j++)c.fillRect(ox,oy+.12+j*.085,ow,.02);
 var b=ART.boss;if(IMG.boss.naturalWidth)c.drawImage(IMG.boss,ph*b.w,0,b.w,b.h,L.doorway-b.w*k*.6,WALLB-.04-b.h*k,b.w*k,b.h*k);
 var sh=c.createLinearGradient(ox,0,ox+ow,0);sh.addColorStop(0,'rgba(30,20,10,.4)');sh.addColorStop(.3,'rgba(30,20,10,0)');c.fillStyle=sh;c.fillRect(ox,oy,ow,oh);c.restore();
 if(IMG.props.naturalWidth)c.drawImage(IMG.props,dw.x,ART.props.H-dw.h,dw.w,dw.h,dx0,WALLB-dw.h*k,dw.w*k,dw.h*k);
 if(ph===0&&!calm||ph===0){c.font='800 .16px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle='rgba(60,45,25,.75)';for(var z=0;z<3;z++){var zt=calm?z/3:((T*.5+z/3)%1);c.globalAlpha=(1-zt)*.9;c.fillText('z',L.doorway+.12+zt*.22,oy+.42-zt*.34)}c.globalAlpha=1}
 prop('cooler',L.cooler,WALLB+.02,ART.props.items.cooler.w/2);prop('exit',L.exit,WALLB,ART.props.items.exit.w/2);
 // the bin: empty, or with you in it
 var bn=ART.bin,inBin=P.state==='bin';if(IMG.bin.naturalWidth){c.fillStyle='rgba(40,30,20,.22)';c.beginPath();c.ellipse(L.bin+.08,FEET-.06,.36,.04,0,0,6.2832);c.fill();c.drawImage(IMG.bin,inBin?bn.w:0,0,bn.w,bn.h,L.bin-bn.w*k*.62,FEET-.07-bn.h*k,bn.w*k,bn.h*k)}
 if(S.mode==='play'&&!inBin&&Math.abs(P.x-L.bin)<.75)tag('SWIPE UP TO HOP IN',L.bin,FEET-1.25);
 // the Pacer
 var pf=PC.state==='walk'?WALK[Math.floor(PC.t/.1)%6]:PC.state==='read'?6:PC.state==='spot'?7:PC.state==='lost'?6:8;shadow(PC.x,.3,.22);spr('pacer',pf,PC.x,FEET,PC.f<0);
 if(PC.state==='spot'){c.font='800 .3px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle=L.pacer.colour;c.fillText('!',PC.x+PC.f*.3,FEET-1.5)}
 if(PC.state==='lost'){c.font='800 .24px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillStyle='rgba(60,45,25,.8)';c.fillText('?',PC.x+PC.f*.25,FEET-1.5)}
 // you
 if(!inBin){var f=P.state==='crouch'?7:P.state==='air'?8:P.state==='land'?9:P.state==='walk'?WALK[Math.floor(P.t/.12)%6]:6;shadow(P.x,P.y>0?.2:.27,P.y>0?.1:.2);spr('introvert',f,P.x,FEET-P.y,P.f<0)}
 c.restore();
 if(left>0){c.fillStyle=CREAM;c.font='600 14px Montserrat,system-ui,sans-serif';c.textAlign='center';c.fillText('Unrolling the carpet…',W/2,sceneY+sceneH/2)}
 // where your thumb goes, on an upright phone
 if(tall){var y0=sceneH,h=H-sceneH;c.fillStyle='#1d1a17';c.fillRect(0,y0,W,h);c.fillStyle='#2a2622';c.fillRect(0,y0,W,3);var d=dir(),cy=y0+h*.42,r=Math.min(46,h*.16);
  [[-1,W*.25,'BACK AWAY'],[1,W*.75,'WALK']].forEach(function(q){c.globalAlpha=d===q[0]?.95:.4;c.strokeStyle=CREAM;c.lineWidth=2;c.beginPath();c.arc(q[1],cy,r,0,6.2832);c.stroke();c.fillStyle=d===q[0]?YEL:CREAM;c.beginPath();c.moveTo(q[1]+q[0]*r*.4,cy);c.lineTo(q[1]-q[0]*r*.25,cy-r*.38);c.lineTo(q[1]-q[0]*r*.25,cy+r*.38);c.closePath();c.fill();c.font='700 11px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=CREAM;c.fillText(q[2],q[1],cy+r+16)});
  c.globalAlpha=.4;c.fillText('SWIPE UP TO HOP',W/2,cy-r-18);c.globalAlpha=1;c.textBaseline='alphabetic'}}
var last=0;function loop(now){var dt=Math.min(.05,(now-last)/1000||0);last=now;T+=dt;if(!document.hidden&&left<=0)update(dt);draw();requestAnimationFrame(loop)}

// ---- thumbs and keys ----
function playing(){return S.mode==='play'||S.mode==='ready'}
cv.addEventListener('pointerdown',function(e){if(!playing())return;e.preventDefault();var b=cv.getBoundingClientRect();touch={id:e.pointerId,y0:e.clientY-b.top,side:e.clientX-b.left<W/2?-1:1,hopped:false};try{cv.setPointerCapture(e.pointerId)}catch(_){}});
cv.addEventListener('pointermove',function(e){if(!touch||e.pointerId!==touch.id)return;var y=e.clientY-cv.getBoundingClientRect().top;if(!touch.hopped&&touch.y0-y>28){touch.hopped=true;hopQ=true}});
function lift(e){if(touch&&e.pointerId===touch.id)touch=null}cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
addEventListener('keydown',function(e){if(!playing())return;var k=e.key.length===1?e.key.toLowerCase():e.key;if(/^(Arrow(Left|Right)|[ad])$/.test(k)){keys[k]=1;e.preventDefault()}if(k===' '||k==='ArrowUp'||k==='w'){if(!e.repeat)hopQ=true;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});addEventListener('blur',function(){keys={};touch=null});
$('sggo').addEventListener('click',function(){$('sgcard').hidden=true;cv.focus()});
$('sgcb').addEventListener('click',function(){$('sgcard').hidden=true;reset()});
$('sgnod').addEventListener('click',nod);addEventListener('resize',lay);
reset();lay();requestAnimationFrame(loop);
// Hooks for the automatic play-tests.
window.__sg={L:L,S:function(){return S},P:function(){return P},PC:function(){return PC},phase:bossPhase,ready:function(){return left<=0},hold:function(d){touch=d?{id:-1,y0:0,side:d,hopped:true}:null},hop:function(){hopQ=true},step:function(n){for(var i=0;i<n;i++)update(1/30)}};
})();`;

export function levelPage(page, hub, v) {
  const j = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  const script = CLIENT.replace("__LEVEL__", () => j(LEVEL)).replace("__ART__", () => j(ART)).replace("__PPH__", () => String(PPH)).replace("__FILLER__", () => j(FILLER)).replace("__FAILS__", () => j(FAILS)).replace("__SRC__", () => j(hub.path + "/stealth?v=" + v + "&a="));
  return page(TITLE, `<style>${CSS}</style><div class="sg" id="sg">
<canvas id="sgc" tabindex="0" role="img" aria-label="A side-on view of a long office corridor. Hold the right of the screen to walk, the left to back away, and swipe up to hop. On a keyboard: arrow keys to walk, Space to hop."></canvas>
<div class="hud"><span class="bat" id="sgb" role="img" aria-label="Social battery: 3 of 3"><i></i><i></i><i></i></span></div>
<p class="tip" id="sgt" role="status" aria-live="polite"></p>
<div class="talk" id="sgtalk" hidden><canvas id="sgpic" width="640" height="300" aria-hidden="true"></canvas><div class="bub"><small id="sgwho"></small><p id="sgline"></p><p class="fill" id="sgfill"></p></div><button class="btn" id="sgnod" type="button" hidden>Nod. Back away slowly.</button></div>
<div class="card" id="sgcard"><div>
<div id="sgintro"><p class="pre">Introvert Here…</p><h1>${TITLE}</h1>
<p>The meeting has finished. The fire exit is at the far end of the corridor.</p>
<ul><li><b>Hold the right side</b> to walk, <b>the left</b> to back away. <b>Swipe up</b> to hop.</li><li><b>The Pacer</b> checks her clipboard at each end of her walk. That’s your moment.</li><li><b>The Boss</b> nods off. Pass his door while he’s asleep.</li><li><b>Hop into the recycling</b> to hide.</li></ul>
<p class="sm">Turn your phone sideways to see further. No sound. On a computer: arrow keys, and Space to hop.</p>
<p class="go"><button class="btn" id="sggo" type="button">Sneak out</button><a href="${hub.path}">Back to the room</a></p></div>
<div id="sgend" hidden><p class="pre">Introvert Here…</p><h2 id="sgch"></h2><p id="sgcp"></p><p class="sm" id="sgcs"></p>
<p class="go"><button class="btn" id="sgcb" type="button">Go again</button><a href="${hub.path}">Back to the room</a></p></div>
</div></div></div>`, { nav: "hub", body: "stealth", desc: "A stealth game for introverts: get down the corridor without being drawn into a conversation.", script });
}
