// find words broken across two lines (mid-word wrap, e.g. "202 / 6") on every page at given widths
const { chromium } = require('playwright');
const widths = (process.argv[2] || '360,390,768,992').split(',').map(Number);
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const scan = () => {
  const out = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || el.closest('[aria-hidden="true"],script,style')) continue;
    const r0 = el.getBoundingClientRect(); if (r0.width < 1 || getComputedStyle(el).visibility === 'hidden') continue;
    const re = /[^\s ·—–-]+/g; let m;
    while ((m = re.exec(n.textContent))) {
      if (m[0].length < 3) continue;
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const rs = [...rg.getClientRects()].filter((q) => q.width > 0.5);
      if (rs.length > 1 && Math.abs(rs[0].top - rs[rs.length - 1].top) > 4) out.add(`"${m[0]}" in "${n.textContent.trim().slice(0, 40)}"`);
    }
  }
  return [...out];
};
(async () => {
  const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(BASE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
    await p.waitForTimeout(1500);
    const r = await p.evaluate(scan);
    if (r.length) console.log(`== ${pg} @${W}\n   ` + r.slice(0, 20).join('\n   '));
    await p.close();
  }
  await b.close();
})();
