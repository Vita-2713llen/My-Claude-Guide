// Adaptive audit live vs Framer at one width:
//  (1) text boxes that overlap each other in Framer but not live
//  (2) matched texts whose x / width / height differ (wrapping, alignment, order)
//  (3) elements sticking out past the viewport (not inside a clipping ancestor)
// usage: node adaptaudit.js <W> [pages...]  -> adapt-<W>.json + console summary
const { chromium } = require('playwright');
const fs = require('fs');
const W = +(process.argv[2] || 360);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const collect = () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase();
  const out = []; const seen = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const skip = (el) => el.closest('[data-framer-name="Top"],[data-framer-name="Scrolled"],[data-framer-name^="Mobile"],.site-head,.w-nav,[data-framer-name="All Pages Menu"],.head-drop-panel,script,style,noscript,#__framer-badge-container');
  let n;
  while ((n = walker.nextNode())) {
    const t = norm(n.textContent); if (t.length < 2) continue;
    const el = n.parentElement; if (!el || skip(el)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue; let hid = false; for (let x = el; x && x !== document.body; x = x.parentElement) { if (+getComputedStyle(x).opacity === 0) { hid = true; break; } } if (hid) continue;
    const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    // ignore things clipped away (slides off-canvas etc.)
    let clipped = false; for (let x = el; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (s.display !== 'contents' && /hidden|clip/.test(s.overflow + s.overflowX)) { const pr = x.getBoundingClientRect(); if (pr.width > 0 && (b.right <= pr.left + 1 || b.left >= pr.right - 1)) { clipped = true; break; } } }
    if (clipped) continue;
    const k = t.slice(0, 60); seen[k] = (seen[k] || 0) + 1;
    out.push({ k: k + '#' + seen[k], x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height), fs: cs.fontSize });
  }
  const vw = document.documentElement.clientWidth; const over = [];
  document.querySelectorAll('body *').forEach((e) => {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.right <= vw + 2) return;
    if (e.closest('script,style,#__framer-badge-container')) return;
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (s.display !== 'contents' && /hidden|clip|auto|scroll/.test(s.overflow + s.overflowX)) { const xr = x.getBoundingClientRect(); if (xr.width > 0 && xr.right <= vw + 2) return; } }
    over.push(((e.getAttribute('data-framer-name') || e.className || e.tagName) + '').slice(0, 40) + ' right' + Math.round(r.right));
  });
  return { texts: out, over: over.slice(0, 15), sw: document.documentElement.scrollWidth, vw };
};
(async () => {
  const b = await chromium.launch(); const report = {};
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 800 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      const H = await p.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < H; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(90); }
      await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
      res[k] = await p.evaluate(collect);
      await p.close();
    }
    const L = Object.fromEntries(res.L.texts.map((t) => [t.k, t])), F = res.F.texts;
    // (1) overlaps in F
    const ov = [];
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const a = F[i], c = F[j]; if (Math.abs(a.y - c.y) > 60) continue;
      const ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ix > 2 && iy > 2 && ix * iy > 0.15 * Math.min(a.w * a.h, c.w * c.h)) {
        const la = L[a.k], lc = L[c.k];
        const liveOv = la && lc && (Math.min(la.x + la.w, lc.x + lc.w) - Math.max(la.x, lc.x)) > 2 && (Math.min(la.y + la.h, lc.y + lc.h) - Math.max(la.y, lc.y)) > 2;
        if (!liveOv) ov.push(a.k + '  ⨯  ' + c.k + ' @y' + a.y);
      }
    }
    // (2) geometry diffs on matched texts
    const geo = [];
    for (const f of F) { const l = L[f.k]; if (!l) continue; const dx = f.x - l.x, dw = f.w - l.w, dh = f.h - l.h; if (Math.abs(dx) > 10 || Math.abs(dw) > 24 || Math.abs(dh) > 10) geo.push({ k: f.k, y: f.y, dx, dw, dh, L: `${l.x},${l.w}x${l.h}`, F: `${f.x},${f.w}x${f.h}` }); }
    geo.sort((a, b) => (Math.abs(b.dh) + Math.abs(b.dx) + Math.abs(b.dw) / 2) - (Math.abs(a.dh) + Math.abs(a.dx) + Math.abs(a.dw) / 2));
    report[pg] = { overlaps: ov, geo, overflowF: res.F.over, scrollW: res.F.sw + '/' + res.F.vw, liveOverflow: res.L.sw + '/' + res.L.vw, matched: F.filter((f) => L[f.k]).length + '/' + F.length };
    console.log(`== ${pg} @${W}  matched ${report[pg].matched}  scrollW F ${report[pg].scrollW} L ${report[pg].liveOverflow}`);
    ov.slice(0, 8).forEach((o) => console.log('   OVERLAP ' + o));
    geo.slice(0, 10).forEach((g) => console.log(`   GEO dx${g.dx} dw${g.dw} dh${g.dh}  L ${g.L} F ${g.F}  y${g.y}  ${g.k}`));
    res.F.over.slice(0, 5).forEach((o) => console.log('   OUT ' + o));
  }
  fs.writeFileSync(__dirname + '/adapt-' + W + '.json', JSON.stringify(report, null, 1));
  await b.close();
})();
