// Screenshot one section (by live class / framer name) on live and Framer at a width
const { chromium } = require('playwright');
const [pg, liveSel, frSel, W = '1440', tag = 'sec'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base, sel] of [['L', 'https://noverde-128.webflow.io', liveSel], ['F', 'https://adaptable-event-041934.framer.app', frSel]]) {
    const p = await b.newPage({ viewport: { width: +W, height: 1000 } });
    await p.goto(base + pg, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(200); }
    await p.waitForTimeout(1200);
    const el = await p.$(sel); if (!el) { console.log(k, 'no', sel); continue; }
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
    await el.screenshot({ path: __dirname + '/qcv/' + tag + '-' + W + k + '.png' });
    const info = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); });
    console.log(k, info);
    await p.close();
  }
  await b.close();
})();
