// LOAD + REVEAL motion audit, live vs Framer.
// 1) load: elements visible in the first viewport — sample opacity/translate every 100ms for 2.4s after load;
//    report which texts animate (opacity or y change) on live but are static on Framer, and when each is fully shown.
// 2) reveal: scroll each below-the-fold text into view, measure ms until it is fully visible (opacity>=0.99, no offset).
// node loadaudit.js <W> [pages...]   (BASE_LIVE / BASE_FR env to override)
const { chromium } = require('playwright');
const W = +(process.argv[2] || 1440);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/licenses', '/changelog', '/style-guide'];
const SITES = { live: process.env.BASE_LIVE || 'https://noverde-128.webflow.io', fr: process.env.BASE_FR || 'https://adaptable-event-041934.framer.app' };
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 36);
// state of the text blocks (h1-h4, p, a buttons) inside the viewport: effective opacity + translate offset
const sample = (onlyFold) => {
  const out = {};
  const vh = innerHeight;
  document.querySelectorAll('h1,h2,h3,h4,p,a').forEach((e) => {
    if (e.closest('header,nav,[data-framer-name="Top"],[data-framer-name="Scrolled"],[data-framer-name^="Mobile"]')) return;
    const t = e.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 4) return;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    if (onlyFold && (r.top > vh || r.bottom < 0)) return;
    let op = 1; for (let x = e; x && x !== document.body; x = x.parentElement) op *= +getComputedStyle(x).opacity;
    // words split for reveal: take the first child word's transform/opacity too
    const w = e.querySelector('.vd-w > i, .gsap_split_word, .word, [class*="split"]');
    let wy = 0, wop = 1; if (w) { const m = new DOMMatrix(getComputedStyle(w).transform); wy = m.m42; let o = 1; for (let x = w; x && x !== e; x = x.parentElement) o *= +getComputedStyle(x).opacity; wop = o; }
    const k = t.replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 36);
    if (!(k in out)) out[k] = { op: +(op * wop).toFixed(2), y: Math.round(r.top + wy), top: Math.round(r.top) };
  });
  return out;
};
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const res = {};
    for (const [k, u] of Object.entries(SITES)) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } });
      await p.goto(u + pg, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      const frames = []; const t0 = Date.now();
      for (let i = 0; i < 30; i++) { frames.push({ t: Date.now() - t0, s: await p.evaluate(sample, true).catch(() => ({})) }); await p.waitForTimeout(100); }
      // load summary per text: animated? (first sample op<0.95 or y moved > 4) and time to settle
      const keys = new Set(); frames.forEach((f) => Object.keys(f.s).forEach((x) => keys.add(x)));
      const load = {};
      for (const x of keys) {
        const seq = frames.filter((f) => f.s[x]).map((f) => ({ t: f.t, ...f.s[x] }));
        if (!seq.length) continue; const last = seq[seq.length - 1];
        const moved = seq.some((q) => q.op < 0.95 || Math.abs(q.y - last.y) > 4);
        const settle = (seq.find((q, i) => seq.slice(i).every((z) => z.op >= 0.99 && Math.abs(z.y - last.y) <= 1)) || { t: null }).t;
        load[x] = { moved, settle, finalOp: last.op };
      }
      // reveal timing below the fold
      await p.waitForTimeout(800);
      const H = await p.evaluate(() => document.body.scrollHeight);
      const reveal = {};
      for (let y = 900; y < Math.min(H, 9000); y += 700) {
        await p.evaluate((y) => scrollTo(0, y), y);
        const tS = Date.now(); const seen = {};
        for (let i = 0; i < 18; i++) { await p.waitForTimeout(120); const s = await p.evaluate(sample, true).catch(() => ({})); for (const [x, v] of Object.entries(s)) { if (x in reveal) continue; if (!(x in seen)) seen[x] = { firstOp: v.op }; if (v.op >= 0.99 && seen[x].t == null) seen[x].t = Date.now() - tS; } }
        for (const [x, v] of Object.entries(seen)) if (!(x in reveal)) reveal[x] = { t: v.t == null ? 'never' : v.t, hidden0: v.firstOp < 0.5 };
      }
      res[k] = { load, reveal };
      await p.close();
    }
    const lines = [];
    // load animation missing on Framer
    for (const [x, v] of Object.entries(res.live.load)) { const f = res.fr.load[x]; if (!f) continue; if (v.moved && !f.moved) lines.push(`LOAD-MISSING "${x}" (live animates, settles ${v.settle}ms; Framer static)`); if (f.finalOp < 0.95) lines.push(`LOAD-NOT-SHOWN "${x}" Framer opacity ${f.finalOp} after 3s`); }
    // reveal slower / never
    for (const [x, v] of Object.entries(res.fr.reveal)) { const l = res.live.reveal[x]; if (v.t === 'never') lines.push(`REVEAL-NEVER "${x}"`); else if (l && typeof l.t === 'number' && v.t - l.t > 350) lines.push(`REVEAL-SLOW "${x}" Framer ${v.t}ms vs live ${l.t}ms`); }
    console.log(`== ${pg} @${W}` + (lines.length ? '\n   ' + lines.slice(0, 25).join('\n   ') : '  ok'));
  }
  await b.close();
})();
