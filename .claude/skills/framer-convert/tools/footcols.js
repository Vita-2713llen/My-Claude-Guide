const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const W of [810, 360]) for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(base + '/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    console.log(k, W, await p.evaluate(() => { const nav = [...document.querySelectorAll('.foot-nav, [data-framer-name="foot-nav"]')].find((e) => e.getBoundingClientRect().width > 0); const s = getComputedStyle(nav); const R = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + '+' + Math.round(r.width); }; return 'nav ' + R(nav) + ' ' + s.display + ' ' + s.justifyContent + ' gap' + s.columnGap + '/' + s.rowGap + ' gtc:' + s.gridTemplateColumns + ' :: ' + [...nav.children].filter((c) => c.getBoundingClientRect().width > 0 || getComputedStyle(c).display === 'contents').map((c) => { const cs = getComputedStyle(c); return R(c) + ' ' + cs.alignItems + ' ta:' + cs.textAlign; }).join(' | '); }));
    await p.close();
  }
  await b.close();
})();
