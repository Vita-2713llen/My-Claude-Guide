// logo must link to / in every header state: hit-test the logo area at 360/1440, top and scrolled
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const W of [360, 1440]) for (const pg of ['/', '/services']) for (const sc of [0, 1500]) {
    const p = await b.newPage({ viewport: { width: W, height: 730 } }); await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '' + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    if (sc) { for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 250); await p.waitForTimeout(80); } await p.waitForTimeout(1200); }
    const res = await p.evaluate(() => { const out = new Set(); for (let x = 20; x <= 150; x += 10) for (let y = 15; y <= 60; y += 8) { const h = document.elementFromPoint(x, y); const a = h && h.closest('a'); if (a) out.add(a.getAttribute('href')); else if (h) out.add('[' + (h.getAttribute('data-framer-name') || h.tagName).slice(0, 14) + ']'); } return [...out].join(' '); });
    console.log(W, pg, 'scroll' + sc, res); await p.close(); }
  await b.close(); })();
