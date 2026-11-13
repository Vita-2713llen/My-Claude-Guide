// Hover background vs radius: for each class that paints a background on :hover, compare border-radius + bg before/after, live vs Framer, across pages.json. RADIUS-LOSS = Framer paints a square bg live keeps rounded.
// For every element that gets a background on hover, compare border-radius (element + visible bg) live vs Framer.
const { chromium } = require('playwright');
const CLS = ['button button-solid','contact-form-button','person-hero-social','crew-icon','crew-arrow','prose-case-link','faq-button','button button-secondary','impact-arrow','foot-button','case-link','post','journal-card'];
const pages = JSON.parse(require('fs').readFileSync(__dirname+'/pages.json','utf8')).filter((p,i,a)=>!/\/(blog|team|our-impact|services)\/.+/.test(p)||a.findIndex(q=>q.split('/')[1]===p.split('/')[1]&&q.split('/').length===p.split('/').length)===i);
(async()=>{const b=await chromium.launch();const res={};
for(const [tag,base] of [['live','https://noverde-128.webflow.io'],['fr','https://adaptable-event-041934.framer.app']]){
 const p=await b.newPage({viewport:{width:1440,height:900}});
 for(const pg of pages){ try{await p.goto(base+pg,{waitUntil:'load',timeout:40000})}catch(e){continue} await p.waitForTimeout(900);
  for(const c of CLS){
   const sel = tag==='live' ? '.'+c.split(' ').join('.') : c.split(' ').map(x=>`[data-framer-name~="${x}"]`).join('');
   const n=await p.locator(sel).count(); if(!n) continue;
   const el=p.locator(sel).first(); try{await el.scrollIntoViewIfNeeded({timeout:3000})}catch(e){continue} await p.waitForTimeout(500);
   const rd=()=>el.evaluate(e=>{const s=getComputedStyle(e);let vis=e;// element whose bg is painted
     return {rad:s.borderRadius,bg:s.backgroundColor}}).catch(()=>null);
   const a=await rd(); const bx=await el.boundingBox(); if(!bx||!a) continue;
   await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2); await p.waitForTimeout(700); const h=await rd(); await p.mouse.move(1,1); await p.waitForTimeout(300);
   const k=pg+' '+c; (res[k]=res[k]||{})[tag]=`rad ${a.rad} bg ${a.bg} -> hover bg ${h&&h.bg}`;
  }}
 await p.close();}
for(const [k,v] of Object.entries(res)){ if(!v.live||!v.fr) {console.log('ONLY', k, JSON.stringify(v)); continue}
 const lr=v.live.split(' bg')[0], fr=v.fr.split(' bg')[0]; const fbg=/hover bg rgba\(0, 0, 0, 0\)/.test(v.fr)||v.fr.includes('-> hover bg '+v.fr.split(' bg ')[1].split(' ->')[0]);
 const frHas=!/hover bg rgba\(0, 0, 0, 0\)$/.test(v.fr); const frRad0=/rad 0px/.test(v.fr);
 if(frHas && frRad0 && !/rad 0px/.test(v.live)) console.log('RADIUS-LOSS',k,'\n   L',v.live,'\n   F',v.fr);
 else console.log('ok',k,'| L',v.live,'| F',v.fr);}
await b.close();})();
