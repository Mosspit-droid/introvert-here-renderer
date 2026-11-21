// A bare movement test for the stealth game's introvert (Barry's drawings, cut into a strip by stealth-art/cut.py).
// Nothing but the character on a plain floor: hold right to walk, left to go back, swipe up to hop.
import { INTROVERT } from "./stealth-art/introvert.js";

const CSS = `
body.stealth main{max-width:none;padding:0;margin:0}body.stealth footer{margin-top:0}
.wt{position:relative;height:calc(100dvh - var(--hh,63px));min-height:300px;overflow:hidden;background:#fbf1e7;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none}
.wt canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.wt .tip{position:absolute;left:50%;top:44px;transform:translateX(-50%);width:max-content;max-width:calc(100% - 24px);margin:0;padding:8px 14px;border-radius:10px;background:rgba(22,20,18,.88);color:#f6efe0;font-size:13px;font-weight:600;line-height:1.35;text-align:center;text-wrap:balance;pointer-events:none}
`;
const CLIENT = String.raw`
(function(){
var I=__I__,box=document.getElementById('wt'),cv=document.getElementById('wtc'),cx=cv.getContext('2d'),calm=false;
try{calm=matchMedia('(prefers-reduced-motion:reduce)').matches}catch(e){}
var hd=document.querySelector('header');box.style.setProperty('--hh',(hd?hd.offsetHeight:63)+'px');
var img=new Image();img.src=I.src;
// Sizes are in "heights": 1 = how tall the introvert stands.
var P={x:0,y:0,vy:0,f:1,t:0,state:'idle',st:0},keys={},touch=null,hopQ=false,cam=0,W=0,H=0,dpr=1,u=100,floorY=0,tall=false,sceneH=0;
var WALK=[0,1,2,3,4,5],SPEED=1.25,HOP=3.3,GRAV=9.5;
function lay(){W=box.clientWidth;H=box.clientHeight;dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);tall=H>W;sceneH=tall?Math.round(H*.62):H;u=sceneH*.42;floorY=sceneH*.82}
function dir(){var k=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);return k||(touch?touch.side:0)}
function update(dt){var d=dir();P.st+=dt;
 if(P.state==='crouch'){if(P.st>.09){P.state='air';P.vy=HOP;P.st=0}}
 else if(P.state==='land'){if(P.st>.13){P.state='idle';P.st=0}}
 else if(P.state==='air'){P.vy-=GRAV*dt;P.y+=P.vy*dt;if(d){P.x+=d*SPEED*dt;P.f=d}if(P.y<=0){P.y=0;P.vy=0;P.state='land';P.st=0}}
 else{if(hopQ){P.state='crouch';P.st=0}else if(d){P.f=d;P.x+=d*SPEED*dt;if(P.state!=='walk'){P.state='walk';P.t=0}P.t+=dt}else P.state='idle'}
 hopQ=false}
function frame(){if(P.state==='crouch')return 7;if(P.state==='air')return 8;if(P.state==='land')return 9;if(P.state==='walk')return WALK[Math.floor(P.t/.12)%WALK.length];return 6}
function draw(){var c=cx;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#fbf1e7';c.fillRect(0,0,W,H);
 cam+=((P.x-W/u*.4)-cam)*(calm?1:.15);
 // the floor, with marks so you can see how far a step goes
 c.fillStyle='#efe2d2';c.fillRect(0,floorY,W,sceneH-floorY);c.fillStyle='#3b342c';c.fillRect(0,floorY,W,2);
 c.fillStyle='rgba(59,52,44,.35)';for(var i=Math.floor(cam);i<cam+W/u+1;i++){var x=(i-cam)*u;c.fillRect(x,floorY,i%5===0?2:1,i%5===0?18:9)}
 var k=u/236,sx=(P.x-cam)*u,sy=floorY-P.y*u,f=frame();
 c.fillStyle='rgba(59,52,44,'+(P.y>0?.1:.2)+')';c.beginPath();c.ellipse(sx,floorY+4,u*(P.y>0?.2:.27),u*.035,0,0,6.2832);c.fill();
 if(img.complete&&img.naturalWidth){c.save();c.translate(sx,sy);c.scale(P.f,1);c.imageSmoothingQuality='high';c.drawImage(img,f*I.w,0,I.w,I.h,-I.ax*k,-I.base*k,I.w*k,I.h*k);c.restore()}
 if(tall){var y0=sceneH,h=H-sceneH;c.fillStyle='#1d1a17';c.fillRect(0,y0,W,h);var d=dir(),cy=y0+h*.45,r=Math.min(46,h*.2);
  [[-1,W*.25,'BACK'],[1,W*.75,'WALK']].forEach(function(q){c.globalAlpha=d===q[0]?.95:.45;c.strokeStyle='#f6efe0';c.lineWidth=2;c.beginPath();c.arc(q[1],cy,r,0,6.2832);c.stroke();c.fillStyle=d===q[0]?'#fad00c':'#f6efe0';c.beginPath();c.moveTo(q[1]+q[0]*r*.4,cy);c.lineTo(q[1]-q[0]*r*.25,cy-r*.38);c.lineTo(q[1]-q[0]*r*.25,cy+r*.38);c.closePath();c.fill();c.font='700 11px Montserrat,system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#f6efe0';c.fillText(q[2],q[1],cy+r+16)});
  c.globalAlpha=.45;c.fillText('SWIPE UP TO HOP',W/2,cy-r-18);c.globalAlpha=1}}
var last=0;function loop(now){var dt=Math.min(.05,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop)}
cv.addEventListener('pointerdown',function(e){e.preventDefault();var b=cv.getBoundingClientRect();touch={id:e.pointerId,y0:e.clientY-b.top,side:e.clientX-b.left<W/2?-1:1,hopped:false};try{cv.setPointerCapture(e.pointerId)}catch(_){}});
cv.addEventListener('pointermove',function(e){if(!touch||e.pointerId!==touch.id)return;var y=e.clientY-cv.getBoundingClientRect().top;if(!touch.hopped&&touch.y0-y>28){touch.hopped=true;hopQ=true}});
function lift(e){if(touch&&e.pointerId===touch.id)touch=null}cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
addEventListener('keydown',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;if(/^(Arrow(Left|Right)|[ad])$/.test(k)){keys[k]=1;e.preventDefault()}if(k===' '||k==='ArrowUp'||k==='w'){if(!e.repeat)hopQ=true;e.preventDefault()}});
addEventListener('keyup',function(e){var k=e.key.length===1?e.key.toLowerCase():e.key;delete keys[k]});addEventListener('blur',function(){keys={};touch=null});
addEventListener('resize',lay);lay();requestAnimationFrame(loop);
window.__wt={P:P,hold:function(d){touch=d?{id:-1,y0:0,side:d,hopped:true}:null},hop:function(){hopQ=true},ready:function(){return img.complete&&img.naturalWidth>0}};
})();`;

export function walkTestPage(page, hub) {
  return page("Walk test", `<style>${CSS}</style><div class="wt" id="wt"><canvas id="wtc" tabindex="0" role="img" aria-label="A hooded figure in a navy hoodie on a plain floor. Hold the right of the screen to walk, the left to go back, and swipe up to hop."></canvas>
<p class="tip">Walk test: hold right to walk, left to go back, swipe up to hop.</p></div>`, { nav: "hub", body: "stealth", noindex: true, script: CLIENT.replace("__I__", () => JSON.stringify(INTROVERT)) });
}
