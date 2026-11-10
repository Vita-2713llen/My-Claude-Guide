// Live collection slugs -> page h1, for blog / team / services / impact
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io', F = 'https://adaptable-event-041934.framer.app';
const lists = { '/blog': '/blog/', '/our-team': '/team/', '/services': '/services/', '/our-impact': '/our-impact/' };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const out = [];
  for (const [list, pre] of Object.entries(lists)) {
    await p.goto(L + list, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const hrefs = await p.evaluate((pre) => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith(pre) && h.length > pre.length))], pre);
    for (const h of hrefs) {
      const row = [h];
      for (const base of [L, F]) {
        const r = await p.goto(base + h, { waitUntil: 'domcontentloaded' }).catch(() => null); await p.waitForTimeout(900);
        row.push((r ? r.status() : 'ERR') + ' ' + (await p.evaluate(() => (document.querySelector('h1') || {}).textContent || '').catch(() => '')).trim().slice(0, 50));
      }
      out.push(row.join(' | ') + (row[1].slice(4) !== row[2].slice(4) ? '   <<< MISMATCH' : ''));
      console.log(out[out.length - 1]);
    }
  }
  await b.close();
})();
