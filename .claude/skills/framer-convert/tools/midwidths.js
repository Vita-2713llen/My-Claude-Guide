// In-between widths diff: box/display/grid cols/pins/padding per named layer, live vs Framer.
// Usage: SPEC='[["/page",["layer",...]]]' node midwidths.js 1150,1000,900,800,700,500
const { chromium } = require('playwright');
const SPEC=JSON.parse(process.env.SPEC||'[["/contact-us",["testimonial-stage","testimonial-pin","testimonial-card","testimonial-plate"]],["/",["post-grid","post-item","post"]],["/blog",["journal-grid","journal-card"]]]');
(async()=>{const b=await chromium.launch();
for(const [tag,base] of [['live',process.env.LIVE||'https://noverde-128.webflow.io'],['fr',process.env.BASE||'https://adaptable-event-041934.framer.app']]){
 for(const w of (process.argv[2]||'1150,1000,900,800,700,500').split(',').map(Number)){
  const p=await b.newPage({viewport:{width:w,height:800}});
  for(const [pg,names] of SPEC){
   for(let t=0;t<3;t++){try{await p.goto(base+pg,{waitUntil:'load',timeout:40000});break}catch(e){await p.waitForTimeout(2000)}}
   await p.waitForTimeout(800);
   const r=await p.evaluate(names=>names.map(n=>{const els=[...document.querySelectorAll(`[class~="${n}"],[data-framer-name="${n}"],[data-framer-name^="${n} "]`)].filter(e=>e.offsetParent||getComputedStyle(e).position==='fixed');if(!els.length)return n+':none';const e=els[0],r=e.getBoundingClientRect(),s=getComputedStyle(e);const pr=e.parentElement.getBoundingClientRect();return n+'×'+els.length+' '+Math.round(r.width)+'x'+Math.round(r.height)+' @'+Math.round(r.left-pr.left)+','+Math.round(r.top-pr.top)+' '+s.display+(s.display.includes('grid')?' cols='+s.gridTemplateColumns:'')+(s.display.includes('flex')?' dir='+s.flexDirection:'')+' pos='+s.position+(s.position==='absolute'?' t='+s.top+' b='+s.bottom+' l='+s.left:'')+' pad='+s.padding+' rad='+s.borderRadius}),names);
   console.log(tag,w,pg,'\n   '+r.join('\n   '));
  }
  await p.close();}}
await b.close();})()
