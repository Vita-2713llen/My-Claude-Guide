// live: every display:contents element at given widths, with parent gap/padding and children y order
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
 for (const w of [810,390]) { const p = await b.newPage({viewport:{width:w,height:900}});
  await p.goto('https://noverde-128.webflow.io'+(process.argv[2]||'/'),{waitUntil:'load',timeout:60000}); await p.waitForTimeout(800);
  console.log('== '+w); console.log(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).display==='contents'&&!e.closest('.w-nav,header,footer,.site-foot,.navbar')).map(e=>{ const par=e.parentElement, ps=getComputedStyle(par); const kids=[...e.children].map(k=>k.className.split(' ')[0]+'@'+Math.round(k.getBoundingClientRect().top+scrollY)+(getComputedStyle(k).order!=='0'?' order'+getComputedStyle(k).order:'')).join(', '); const sibs=[...par.children].filter(s=>s!==e).map(s=>s.className.split(' ')[0]+'@'+Math.round(s.getBoundingClientRect().top+scrollY)+(getComputedStyle(s).order!=='0'?' order'+getComputedStyle(s).order:'')).join(', '); return e.className+'  | parent '+par.className.split(' ')[0]+' gap='+ps.rowGap+' pad='+ps.padding+' dir='+ps.flexDirection+'\n    kids: '+kids+'\n    sibs: '+sibs; }).join('\n'))); await p.close(); }
 await b.close(); })();
