// Page heights + horizontal overflow, live vs Framer, at 1440/810/390
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io', F = 'https://adaptable-event-041934.framer.app';
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404'];
const widths = (process.argv[2] || '1440,810,390').split(',').map(Number);
(async () => {
  const b = await chromium.launch();
  for (const w of widths) {
    console.log('\n=== ' + w);
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    for (const pg of pages) {
      const r = [];
      for (const base of [L, F]) {
        await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await p.waitForTimeout(1500);
        r.push(await p.evaluate(() => ({ h: document.documentElement.scrollHeight, ox: document.documentElement.scrollWidth - innerWidth })));
      }
      const d = r[1].h - r[0].h; const flag = Math.abs(d) > Math.max(80, r[0].h * 0.03) || r[1].ox > 0 ? '  <<<' : '';
      console.log(pg.padEnd(40) + ' L' + String(r[0].h).padStart(6) + '  F' + String(r[1].h).padStart(6) + '  d' + String(d).padStart(6) + (r[1].ox > 0 ? '  overflowX ' + r[1].ox : '') + flag);
    }
    await p.close();
  }
  await b.close();
})();
