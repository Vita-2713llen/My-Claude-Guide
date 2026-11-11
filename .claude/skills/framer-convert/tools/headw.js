// headings: width / lines / x / max-width, live vs Framer, per page at a width -> only mismatches
const { chromium } = require('playwright');
const W = +(process.argv[2] || 360);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const grab = () => [...document.querySelectorAll('h1,h2,h3')].filter((h) => h.getBoundingClientRect().width > 0 && !h.closest('[data-framer-name^="Mobile"],[data-framer-name="Top"],.site-head')).map((h) => {
  const r = h.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(h).lineHeight) || 1;
  // container that carries the measure: nearest ancestor narrower than its parent
  let c = h, mw = ''; for (let i = 0; i < 4 && c; i++) { const cs = getComputedStyle(c); if (cs.maxWidth !== 'none') { mw = cs.maxWidth; break; } c = c.parentElement; }
  return { t: h.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').slice(0, 50), x: Math.round(r.left), w: Math.round(r.width), lines: Math.round(r.height / lh), fs: getComputedStyle(h).fontSize, ta: getComputedStyle(h).textAlign, mw };
});
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 800 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      const H = await p.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < H; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(70); }
      await p.waitForTimeout(2500);
      res[k] = await p.evaluate(grab); await p.close();
    }
    const out = [];
    res.L.forEach((l) => { const f = res.F.find((x) => x.t.toLowerCase() === l.t.toLowerCase()); if (!f) return; if (f.lines !== l.lines || Math.abs(f.x - l.x) > 8 || Math.abs(f.w - l.w) > 30 || f.fs !== l.fs) out.push(`   "${l.t}" L x${l.x} w${l.w} ${l.lines}ln ${l.fs} ${l.ta} mw:${l.mw} | F x${f.x} w${f.w} ${f.lines}ln ${f.fs} ${f.ta} mw:${f.mw}`); });
    if (out.length) console.log(`== ${pg} @${W}\n` + out.join('\n'));
  }
  await b.close();
})();
