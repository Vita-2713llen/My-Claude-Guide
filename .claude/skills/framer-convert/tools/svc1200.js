const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
 for (const W of [1200, 1279, 1280]) for (const [k, base, row] of [['L', 'https://noverde-128.webflow.io', '.service-list-row'], ['F', 'https://adaptable-event-041934.framer.app', '[data-framer-name^="service-list-row"]']]) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(base + '/services', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const r = p.locator(row).nth(1); await r.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  console.log(k, W, await r.evaluate((el) => { const R = el.getBoundingClientRect(); const g = (s) => { const e = el.querySelector(s); if (!e) return '-'; const q = e.getBoundingClientRect(); const t = e.querySelector('p,h3,h2') || e; return Math.round(q.left - R.left) + '/' + Math.round(q.width) + 'x' + Math.round(q.height) + ' fs' + getComputedStyle(t).fontSize; };
    return ['name ' + g('.service-list-name-text,[data-framer-name="service-list-name-text"]'), 'desc ' + g('.service-list-description-wrap,[data-framer-name^="service-list-description-wrap"]'), 'media ' + g('.service-list-media,[data-framer-name="service-list-media"]'), 'rowH ' + Math.round(R.height)].join(' | '); }));
  await p.close(); }
 await b.close(); })();
