// Card hover reveal sampler (fold scale / wash opacity at 60-500ms + after leave), live vs Framer, 4 widths.
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
for(const [tag,base] of [['live',process.env.LIVE||'https://noverde-128.webflow.io'],['fr','https://adaptable-event-041934.framer.app']]){
 for(const [pg,card,fold,wash] of [['/','post','post-fold','post-wash'],['/blog','journal-card','journal-fold','journal-wash']]){
 for(const w of [1440,1100,900,500]){
  const p=await b.newPage({viewport:{width:w,height:900}});
  for(let t=0;t<3;t++){try{await p.goto(base+pg,{waitUntil:'load',timeout:40000});break}catch(e){await p.waitForTimeout(2000)}}
  await p.waitForTimeout(1200);
  const sel=(n)=>`[class~="${n}"],[data-framer-name="${n}"],[data-framer-name^="${n} "]`;
  const c=p.locator(sel(card)).first(); await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  const bx=await c.boundingBox(); await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);
  const samp=[];const t0=Date.now();
  for(const ms of [60,160,300,500]){await p.waitForTimeout(Math.max(0,ms-(Date.now()-t0)));
   samp.push(await p.evaluate(([c,f,wsh,s])=>{const card=document.querySelector(s);const F=card.querySelector(`[class~="${f}"],[data-framer-name^="${f}"]:not([data-framer-name^="${f}-arrow"])`);const W=card.querySelector(`[class~="${wsh}"],[data-framer-name^="${wsh}"]`);const m=new DOMMatrix(getComputedStyle(F).transform);return m.a.toFixed(2)+'/'+(+getComputedStyle(W).opacity).toFixed(2)+(F?(' '+F.offsetWidth):'')},[card,fold,wash,sel(card)]));}
  await p.mouse.move(2,2); await p.waitForTimeout(400);
  const after=await p.evaluate(([f,s])=>{const F=document.querySelector(s).querySelector(`[class~="${f}"],[data-framer-name^="${f}"]:not([data-framer-name^="${f}-arrow"])`);return new DOMMatrix(getComputedStyle(F).transform).a.toFixed(2)},[fold,sel(card)]);
  console.log(tag,pg,w,'scale/wash size @60,160,300,500:',samp.join(' | '),' leave+400:',after);
  await p.close();}}}
await b.close();})()
