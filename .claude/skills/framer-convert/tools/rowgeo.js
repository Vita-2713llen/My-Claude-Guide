// geometry of a row's direct children, live vs Framer: node rowgeo.js <page> <W> <text> <levelsUp>
const { chromium } = require('playwright');
const [pg, W, txt, up = '3'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); for (let y = 0; y < 6000; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(70); } await p.waitForTimeout(2000);
    console.log(k, await p.evaluate(([t, u]) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const el = [...document.querySelectorAll('h1,h2,h3,h4,p')].find((e) => norm(e.textContent) === t.toLowerCase() && e.getBoundingClientRect().width > 0); if (!el) return 'none';
      let row = el; for (let i = 0; i < +u; i++) row = row.parentElement;
      const kids = (e) => [...e.children].flatMap((c) => getComputedStyle(c).display === 'contents' ? kids(c) : [c]);
      const s = getComputedStyle(row); const R = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + '+' + Math.round(r.width) + 'x' + Math.round(r.height); };
      return ((row.getAttribute('data-framer-name') || row.className) + '').slice(0, 30) + ' ' + R(row) + ' ' + s.display + ' gtc:' + s.gridTemplateColumns + ' gap' + s.columnGap + ' pad' + s.padding + '\n   ' + kids(row).map((c) => ((c.getAttribute('data-framer-name') || c.className) + '').slice(0, 24) + ' ' + R(c)).join('\n   ');
    }, [txt, up]));
    await p.close();
  }
  await b.close();
})();
