const { chromium } = require('playwright');
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404'];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const pg of pages) {
    await p.goto('https://noverde-128.webflow.io' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1200);
    const H = await p.evaluate(() => document.body.scrollHeight); const row = [];
    for (const f of [0, 0.1, 0.3, 0.5, 0.7]) {
      await p.evaluate((y) => scrollTo(0, y), Math.round(f * H)); await p.waitForTimeout(700);
      row.push(Math.round(f * H) + ':' + await p.evaluate(() => { const h = document.querySelector('.site-head'); const bar = document.querySelector('.head-bar'); const s = getComputedStyle(h); const sb = getComputedStyle(bar); return [h.className.replace('site-head', '').trim() || '-', s.backgroundColor, s.borderBottomWidth + ' ' + s.borderBottomColor, Math.round(h.getBoundingClientRect().height), sb.backgroundColor, sb.paddingTop].join('|'); }));
    }
    console.log(pg + '\n  ' + row.join('\n  '));
  }
  await b.close();
})();
