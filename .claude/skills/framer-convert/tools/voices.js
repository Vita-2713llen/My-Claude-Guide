const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const W of (process.argv[2] || '1600,1440,1300,1200,1100,1000,900,800,600,390').split(',').map(Number)) {
    const row = [];
    for (const [k, base, S] of [['L', 'https://noverde-128.webflow.io', { wrap: '.quote-reel-wrap', reel: '.quote-reel', slider: '.voices-slider', arrow: '.voices-arrow', item: '.quote-reel-item', slot: '.quote-reel-slot' }], ['F', 'https://adaptable-event-041934.framer.app', { wrap: '[data-framer-name="quote-reel-wrap"]', reel: '[data-framer-name~="quote-reel"]', slider: '[data-framer-name^="voices-slider"]', arrow: '[data-framer-name^="voices-arrow"]', item: '[data-framer-name^="quote-reel-item"]', slot: '[data-framer-name^="quote-reel-slot"]' }]]) {
      const p = await b.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
      await p.goto(base + '/?v=' + Date.now(), { waitUntil: 'load' }); await p.waitForTimeout(2000);
      await p.evaluate(async (s) => { for (let y = 0; y < 9000; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } const e = document.querySelector(s); scrollTo(0, scrollY + e.getBoundingClientRect().top - 120); }, S.wrap);
      await p.waitForTimeout(1500);
      const info = await p.evaluate((S) => {
        const vis = (e) => e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none';
        const w = document.querySelector(S.wrap), wt = w.getBoundingClientRect().top;
        const reel = [...document.querySelectorAll(S.reel)].find(vis), sl = [...document.querySelectorAll(S.slider)].find(vis);
        const mode = reel ? 'reel' : sl ? 'slider' : 'none';
        const el = reel || sl; const r = el ? el.getBoundingClientRect() : null;
        const ar = [...document.querySelectorAll(S.arrow)].filter(vis).map(a => { const q = a.getBoundingClientRect(); return Math.round(q.left) + ',' + Math.round(q.top - wt); }).join(' ');
        const imgs = [...w.querySelectorAll('img')].filter(vis).slice(0, 3).map(i => { const q = i.getBoundingClientRect(); return Math.round(i.naturalWidth / Math.max(q.width, q.height * i.naturalWidth / i.naturalHeight) * 100) / 100; }).join(',');
        return mode + ' ' + (r ? Math.round(r.width) + 'x' + Math.round(r.height) : '') + ' arrows[' + ar + '] imgRes[' + imgs + ']';
      }, S);
      let click = '';
      if (info.startsWith('reel')) {
        const items = p.locator(S.item); const n = await items.count();
        const target = items.nth(2); await target.click({ force: true }); await p.waitForTimeout(1000);
        click = ' click->' + await p.evaluate((s) => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => Math.round(e.getBoundingClientRect().width)).join('/'), S.slot);
      }
      row.push(k + ': ' + info + click);
      await p.close();
    }
    console.log(W + '\n  ' + row.join('\n  '));
  }
  await b.close();
})();
