// Typography audit: match leaf text elements live vs Framer by text, diff computed font props.
// usage: node textaudit.js <width> [pages comma list]
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io', F = 'https://adaptable-event-041934.framer.app';
const W = +(process.argv[2] || 1440);
const pages = (process.argv[3] || '/,/about-us,/services,/services/carbon-footprint,/our-team,/team/tess-okonkwo,/pricing,/our-impact,/our-impact/clean-energy,/contact-us,/blog,/blog/diversion-rates-are-over-claimed,/404').split(',');
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 60);
const collect = () => {
  const out = [];
  const els = [...document.querySelectorAll('body *')].filter((e) => {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'].includes(e.tagName.toUpperCase())) return false;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!own) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  });
  for (const e of els) {
    const c = getComputedStyle(e);
    out.push({ t: e.innerText || e.textContent, fs: c.fontSize, lh: c.lineHeight, ls: c.letterSpacing, fw: c.fontWeight, ff: c.fontFamily.split(',')[0].replace(/"/g, ''), tt: c.textTransform, col: c.color });
  }
  return out;
};
(async () => {
  const b = await chromium.launch();
  const agg = {};
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', L], ['F', F]]) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(1800);
      res[k] = await p.evaluate(collect);
      await p.close();
    }
    const fm = new Map(); for (const x of res.F) { const n = norm(x.t); if (n.length > 3 && !fm.has(n)) fm.set(n, x); }
    const px = (v) => (v === 'normal' ? 0 : parseFloat(v));
    for (const l of res.L) {
      const n = norm(l.t); if (n.length <= 3) continue; const f = fm.get(n); if (!f) continue;
      const d = [];
      if (Math.abs(px(l.fs) - px(f.fs)) > 0.5) d.push('fs ' + l.fs + '→' + f.fs);
      const llh = l.lh === 'normal' ? px(l.fs) * 1.2 : px(l.lh), flh = f.lh === 'normal' ? px(f.fs) * 1.2 : px(f.lh);
      if (Math.abs(llh - flh) > 1) d.push('lh ' + l.lh + '→' + f.lh);
      if (Math.abs(px(l.ls) - px(f.ls)) > 0.15) d.push('ls ' + l.ls + '→' + f.ls);
      if (l.fw !== f.fw) d.push('fw ' + l.fw + '→' + f.fw);
      if (l.tt !== f.tt) d.push('tt ' + l.tt + '→' + f.tt);
      if (l.ff.toLowerCase().slice(0, 5) !== f.ff.toLowerCase().slice(0, 5)) d.push('ff ' + l.ff + '→' + f.ff);
      if (!d.length) continue;
      const key = d.join(' | ');
      (agg[key] = agg[key] || []).push(pg + ' :: ' + n.slice(0, 40));
    }
  }
  const rows = Object.entries(agg).sort((a, b) => b[1].length - a[1].length);
  for (const [k, v] of rows) console.log(String(v.length).padStart(3) + '  ' + k + '\n       e.g. ' + [...new Set(v)].slice(0, 3).join('  ||  '));
  await b.close();
})();
