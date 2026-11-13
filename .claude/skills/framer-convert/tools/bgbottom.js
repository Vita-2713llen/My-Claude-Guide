// bottom-anchored background (consult-land-wrap): top/height/gap to section bottom, live vs Framer — WS=360,600,810 node bgbottom.js /services
const { chromium } = require('playwright');
const pages = process.argv.slice(2);
(async () => { const b = await chromium.launch();
  for (const W of (process.env.WS || "360,390,600,810,992,1199,1440").split(",").map(Number)) for (const pg of pages) { const row = [];
    for (const u of [(process.env.LIVE || 'https://noverde-128.webflow.io'), (process.env.BASE || 'https://adaptable-event-041934.framer.app')]) {
      const p = await b.newPage({ viewport: { width: W, height: 800 } }); await p.goto(u + pg, { waitUntil: 'load' }); await p.waitForTimeout(1200);
      row.push(await p.evaluate(() => { const w = [...document.querySelectorAll('[data-framer-name^="consult-land-wrap"], .consult-land-wrap')].filter((e) => e.getBoundingClientRect().height > 0)[0]; if (!w) return '-'; let s = w; while (s.parentElement && !/section/i.test(s.getAttribute?.('data-framer-name') || s.tagName)) s = s.parentElement; const R = s.getBoundingClientRect(), r = w.getBoundingClientRect(); return `top${Math.round(r.top - R.top)} h${Math.round(r.height)} gapBottom=${Math.round(R.bottom - r.bottom)} secH${Math.round(R.height)}`; }));
      await p.close(); }
    console.log(W, pg, 'LIVE', row[0], '| FR', row[1]); }
  await b.close(); })();
