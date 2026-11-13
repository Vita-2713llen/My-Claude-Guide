// slider arrow pairs: are they centered when the 810 design centers them? node arrowpairs.js
const { chromium } = require('playwright');
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/about-us', '/our-impact'];
(async () => { const b = await chromium.launch();
  for (const W of [810, 992, 1100, 1199, 600, 390]) for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 800 } }); await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '' + pg, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => { const L = [...document.querySelectorAll('[data-framer-name*="arrow-left"],[data-framer-name*="arrow-back"],[data-framer-name*="-prev"]')].filter((e) => e.getBoundingClientRect().width > 20 && e.getBoundingClientRect().width < 80);
      return L.map((l) => { const par = l.parentElement; const rr = [...par.children].find((k) => k !== l && /arrow-right|arrow-next|-next/.test(k.getAttribute('data-framer-name') || '') && k.getBoundingClientRect().width > 20); if (!rr) return null; const a = l.getBoundingClientRect(), c = rr.getBoundingClientRect(); const pc = par.getBoundingClientRect(); const mid = (Math.min(a.left, c.left) + Math.max(a.right, c.right)) / 2; return `${(l.getAttribute('data-framer-name') || '').split(' ')[0]} pair ${Math.round(Math.min(a.left, c.left))}..${Math.round(Math.max(a.right, c.right))} mid=${Math.round(mid)} parentMid=${Math.round((pc.left + pc.right) / 2)} vw/2=${innerWidth / 2}`; }).filter(Boolean); });
    if (r.length) console.log(W, pg, '\n  ' + r.join('\n  '));
    await p.close(); }
  await b.close(); })();
