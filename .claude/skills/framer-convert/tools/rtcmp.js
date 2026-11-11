// compare rich text blocks child-by-child (tag, height, margins, font) live vs Framer, n-th block
const { chromium } = require('playwright');
const [pg, idx='0', W='1440'] = process.argv.slice(2);
(async () => { const b = await chromium.launch(); const res={};
 for (const [k,base,sel] of [['L','https://noverde-128.webflow.io','.w-richtext'],['F','https://adaptable-event-041934.framer.app','[data-framer-name^="rich-text-style"]']]) { const p = await b.newPage({viewport:{width:+W,height:900}});
  await p.goto(base+pg,{waitUntil:'load',timeout:60000}); await p.waitForTimeout(1500);
  res[k]=await p.evaluate(([sel,idx])=>{ let e=document.querySelectorAll(sel)[+idx]; if(!e) return []; while(e.children.length===1 && e.children[0].children.length>1) e=e.children[0]; return [...e.children].map(c=>{const s=getComputedStyle(c);const r=c.getBoundingClientRect();return [c.tagName, Math.round(r.height), s.marginTop+'/'+s.marginBottom, s.fontSize+'/'+s.lineHeight, s.paddingTop+'/'+s.paddingBottom, (c.textContent||'').trim().slice(0,30)].join(' | ')}); },[sel,idx]); await p.close(); }
 const n=Math.max(res.L.length,res.F.length); for(let i=0;i<n;i++) console.log((res.L[i]||'').padEnd(90)+' || '+(res.F[i]||''));
 await b.close(); })();
