const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const W of [810, 360, 1440]) for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(base + '/', { waitUntil: 'load' }); for (let y = 0; y < 9000; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); } await p.waitForTimeout(1500);
    console.log(k, W, await p.evaluate(() => {
      const g = [...document.querySelectorAll('.post-grid, [data-framer-name^="post-grid"]')].find((e) => e.getBoundingClientRect().width > 0); if (!g) return 'none';
      const s = getComputedStyle(g); const R = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top - g.getBoundingClientRect().top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
      const kids = (e) => [...e.children].flatMap((c) => getComputedStyle(c).display === 'contents' ? kids(c) : [c]); const cards = kids(g).filter((c) => c.getBoundingClientRect().width > 0);
      const btn = [...document.querySelectorAll('a')].find((a) => /all notes/i.test(a.innerText));
      return 'grid ' + R(g) + ' ' + s.display + ' gtc:' + s.gridTemplateColumns + ' gap' + s.rowGap + '/' + s.columnGap + ' :: ' + cards.map(R).join(' | ') + ' || allnotes ' + (btn ? R(btn) : '-');
    }));
    await p.close();
  }
  await b.close();
})();
