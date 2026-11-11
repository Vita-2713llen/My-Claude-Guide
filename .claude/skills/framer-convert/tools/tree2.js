const { chromium } = require('playwright');
const [pg, lsel, fsel, W='1440', depth='5'] = process.argv.slice(2);
(async () => { const b = await chromium.launch();
 for (const [k,base,sel] of [['L','https://noverde-128.webflow.io',lsel],['F','https://adaptable-event-041934.framer.app',fsel]]) { const p = await b.newPage({viewport:{width:+W,height:900}});
  await p.goto(base+pg,{waitUntil:'load',timeout:60000}); await p.waitForTimeout(2000);
  console.log('#### '+k); console.log(await p.evaluate(([k,sel,depth])=>{ const R=document.querySelector(sel); if(!R) return 'none'; const out=[];
   const walk=(e,d)=>{ if(d>+depth) return; const r=e.getBoundingClientRect(); const s=getComputedStyle(e); const nm=((k==='L'?e.className:e.getAttribute('data-framer-name'))||'').toString().replace(/\s*\[data-[^\]]*\]+/g,'').slice(0,38); if(!nm&&k==='F'&&e.children.length===1){ [...e.children].forEach(c=>walk(c,d)); return;} out.push('  '.repeat(d)+(nm||e.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' '+s.display+(s.display.includes('flex')?' '+s.flexDirection+' gap'+s.rowGap:'')+(s.display==='grid'?' cols='+s.gridTemplateColumns:'')+' pad'+s.padding+' pos='+s.position+(s.aspectRatio!=='auto'?' ar='+s.aspectRatio:'')); [...e.children].slice(0,4).forEach(c=>walk(c,d+1)); }; walk(R,0); return out.join('\n'); },[k,sel,depth])); await p.close(); }
 await b.close(); })();
