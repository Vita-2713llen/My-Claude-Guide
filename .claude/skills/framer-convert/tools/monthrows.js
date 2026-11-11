const { chromium } = require('playwright');
const [W = '360'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + '/our-impact', { waitUntil: 'load' }); for (let y = 0; y < 4000; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(80); } await p.waitForTimeout(3000);
    console.log(k, W, await p.evaluate(() => [...document.querySelectorAll('.month-column, [data-framer-name~="month-column"]')].filter((c) => c.getBoundingClientRect().width > 0).map((c) => { const q = (n) => c.querySelector('.' + n + ', [data-framer-name~="' + n + '"]'); const R = (e) => { if (!e) return '-'; const r = e.getBoundingClientRect(); return Math.round(r.left) + '+' + Math.round(r.width) + 'x' + Math.round(r.height); }; return (q('month-label') || {}).innerText + ' L' + R(q('month-label')) + ' S' + R(q('month-stem')) + ' V' + R(q('month-value')) + '"' + ((q('month-value') || {}).innerText || '').replace(/\n/g, '/') + '"'; }).join('\n   ')));
    await p.close();
  }
  await b.close();
})();
