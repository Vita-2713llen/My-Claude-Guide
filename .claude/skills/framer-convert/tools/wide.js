// wide-screen check: headings x/w/font-size + page height, live vs Framer at W (default 1920)
const { chromium } = require('playwright');
const W = +(process.argv[2] || 1920);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404'];
const grab = () => ({ H: document.body.scrollHeight, h: [...document.querySelectorAll('h1,h2,h3')].filter((h) => h.getBoundingClientRect().width > 0 && !h.closest('[data-framer-name^="Mobile"]')).map((h) => { const r = h.getBoundingClientRect(); return { t: h.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').slice(0, 34).toLowerCase(), x: Math.round(r.left), w: Math.round(r.width), fs: getComputedStyle(h).fontSize }; }) });
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 1000 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      const H = await p.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < H; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(50); }
      await p.waitForTimeout(1500); res[k] = await p.evaluate(grab); await p.close();
    }
    const out = [];
    res.L.h.forEach((l) => { const f = res.F.h.find((x) => x.t === l.t); if (!f) return; if (Math.abs(f.x - l.x) > 8 || f.fs !== l.fs) out.push(`   "${l.t}" L x${l.x} w${l.w} ${l.fs} | F x${f.x} w${f.w} ${f.fs}`); });
    console.log(`== ${pg} @${W}  H L${res.L.H} F${res.F.H} d${res.F.H - res.L.H}` + (out.length ? '\n' + out.join('\n') : ''));
  }
  await b.close();
})();
