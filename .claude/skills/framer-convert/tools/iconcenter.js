// every round button (border-radius >= 40% of size) : icon (svg/img/glyph) centre vs circle centre
const { chromium } = require('playwright');
const widths = (process.argv[2] || '1440,992,390').split(',').map(Number);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed'];
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
(async () => { const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) { const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(BASE + pg, { waitUntil: 'load' }).catch(() => {}); const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(50); } await p.waitForTimeout(1500);
    const r = await p.evaluate(() => { const out = [];
      for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect(); if (r.width < 24 || r.width > 90 || Math.abs(r.width - r.height) > 2) continue; const cs = getComputedStyle(e); if (parseFloat(cs.borderTopLeftRadius) < r.width * 0.4) continue;
        const icons = [...e.querySelectorAll('svg, img, [data-framer-name*="icon" i]')].map((i) => i.getBoundingClientRect()).filter((q) => q.width > 4 && q.width < r.width * 0.8);
        let q = icons.sort((a, c) => a.width * a.height - c.width * c.height)[0];
        if (q && q.width > 4) { // glyph inside an svg: use the painted path box if possible
          const svg = e.querySelector('svg'); if (svg) { const pth = svg.querySelector('path,polyline,line'); if (pth) { const pb = pth.getBoundingClientRect(); if (pb.width > 1 && pb.height > 1) q = pb; } } }
        if (!q) continue; const dx = (q.left + q.width / 2) - (r.left + r.width / 2), dy = (q.top + q.height / 2) - (r.top + r.height / 2);
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) out.push(`${(e.getAttribute('data-framer-name') || e.className || e.tagName).toString().slice(0, 40)} ${Math.round(r.width)}px dx${dx.toFixed(1)} dy${dy.toFixed(1)} glyph ${q.width.toFixed(0)}x${q.height.toFixed(0)}`); }
      return [...new Set(out)]; });
    if (r.length) console.log(`== ${pg} @${W}\n   ` + r.join('\n   ')); await p.close(); }
  await b.close(); })();
