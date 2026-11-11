// DOM outline of a section (live class vs framer name) with sizes, depth-limited
const { chromium } = require('playwright');
const [pg, idx, W='1440', depth='5'] = process.argv.slice(2);
(async () => { const b = await chromium.launch();
 for (const [k,base] of [['L','https://noverde-128.webflow.io'],['F','https://adaptable-event-041934.framer.app']]) { const p = await b.newPage({viewport:{width:+W,height:900}});
  await p.goto(base+pg,{waitUntil:'load',timeout:60000}); await p.waitForTimeout(2000);
  console.log('#### '+k); console.log(await p.evaluate(([k,idx,depth])=>{ const secs=k==='L'?[...document.querySelectorAll('section')]:[...document.querySelectorAll('[data-framer-name^="section"]')]; const top=secs.filter(s=>!secs.some(o=>o!==s&&o.contains(s))); const R=top[+idx]; const out=[];
   const walk=(e,d)=>{ if(d>+depth) return; const r=e.getBoundingClientRect(); const s=getComputedStyle(e); if(r.height===0&&r.width===0&&s.display!=='contents') return; const nm=((k==='L'?e.className:e.getAttribute('data-framer-name'))||'').toString().replace(/\s*\[data-wf[^\]]*\]+/g,'').slice(0,38); if(!nm&&k==='F'&&e.children.length===1){ [...e.children].forEach(c=>walk(c,d)); return;} out.push('  '.repeat(d)+nm+' '+Math.round(r.width)+'x'+Math.round(r.height)+' '+s.display+(s.display.includes('flex')?' '+s.flexDirection+' gap'+s.rowGap:'')+(s.display==='grid'?' cols='+s.gridTemplateColumns.split(' ').length:'')+' pad'+s.paddingTop+'/'+s.paddingBottom); [...e.children].slice(0,4).forEach(c=>walk(c,d+1)); }; walk(R,0); return out.join('\n'); },[k,idx,depth])); await p.close(); }
 await b.close(); })();
