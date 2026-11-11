// Live flex containers with justify-content:space-between AND a gap, whose Framer layer (same name) renders gap 'normal'.
// usage: node gapscan.js [widths] -> JSON lines {pg, w, name, rowGap, colGap, dir, wrap}
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io', F = 'https://adaptable-event-041934.framer.app';
const widths = (process.argv[2] || '1440,810,390').split(',').map(Number);
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const w of widths) for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(L + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800);
    const live = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return /flex/.test(s.display) && s.justifyContent === 'space-between' && (parseFloat(s.rowGap) > 0 || parseFloat(s.columnGap) > 0) && e.className && typeof e.className === 'string'; }).map((e) => { const s = getComputedStyle(e); return { name: e.className.trim(), rowGap: s.rowGap, colGap: s.columnGap, dir: s.flexDirection, wrap: s.flexWrap }; }));
    await p.goto(F + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800);
    const fr = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-framer-name]')].map((e) => [e.getAttribute('data-framer-name').replace(/\s*\[data-[^\]]*\]+/g, '').trim(), getComputedStyle(e).rowGap + '|' + getComputedStyle(e).columnGap])));
    const seen = new Set();
    for (const l of live) { if (seen.has(l.name)) continue; seen.add(l.name); const f = fr[l.name]; if (f === undefined) continue; const [rg, cg] = f.split('|'); const need = l.dir.startsWith('row') ? l.colGap : l.rowGap; const have = l.dir.startsWith('row') ? cg : rg; if ((have === 'normal' || parseFloat(have) === 0) && parseFloat(need) > 0) out.push({ pg, w, ...l }); }
    await p.close();
  }
  for (const o of out) console.log(JSON.stringify(o));
  await b.close();
})();
