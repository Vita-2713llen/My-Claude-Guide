// hover screenshot of nth element (live selector vs framer selector): qcv/hov-<tag>-<L|F><0|1>.png (0 = rest, 1 = hover)
const { chromium } = require('playwright');
const [pg, ls, fs, tag, W = '1440', idx = '0'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base, sel] of [['L', 'https://noverde-128.webflow.io', ls], ['F', 'https://adaptable-event-041934.framer.app', fs]]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const el = (await p.$$(sel))[+idx];
    if (!el) { console.log(k, 'none'); await p.close(); continue; }
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    await p.mouse.move(0, 0); await p.waitForTimeout(300);
    await el.screenshot({ path: __dirname + '/qcv/hov-' + tag + '-' + k + '0.png' });
    await el.hover(); await p.waitForTimeout(900);
    await el.screenshot({ path: __dirname + '/qcv/hov-' + tag + '-' + k + '1.png' });
    console.log(k, 'ok'); await p.close();
  }
  await b.close();
})();
