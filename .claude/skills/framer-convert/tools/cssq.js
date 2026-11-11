// computed styles of first match of a live selector at widths
const { chromium } = require('playwright');
const [pg, sel, props, widths='1440,810,390'] = process.argv.slice(2);
(async () => { const b = await chromium.launch();
 for (const W of widths.split(',')) { const p = await b.newPage({viewport:{width:+W,height:900}});
  await p.goto('https://noverde-128.webflow.io'+pg,{waitUntil:'load',timeout:60000}); await p.waitForTimeout(1500);
  console.log(W, JSON.stringify(await p.evaluate(([sel,props])=>{ const e=document.querySelector(sel); if(!e) return null; const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return Object.assign({w:Math.round(r.width),h:Math.round(r.height)},Object.fromEntries(props.split(',').map(k=>[k,s.getPropertyValue(k)]))); },[sel,props])));
  await p.close(); }
 await b.close(); })();
