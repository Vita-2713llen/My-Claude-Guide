// Scroll-linked motion audit: which named elements change transform/opacity/position-in-viewport non-linearly with scroll
// (parallax, scrub, pin, sticky, counters) on live vs Framer. usage: node scrollaudit.js page...
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io/', F = 'https://adaptable-event-041934.framer.app/';
const pages = process.argv.slice(2).map((p) => (p === 'home' ? '' : p));
const sample = async (p, mode) => {
  const H = await p.evaluate(() => document.body.scrollHeight);
  // first pass to trigger reveals
  for (let y = 0; y < H; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(90); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800);
  const snaps = [];
  for (let y = 0; y < H - 900; y += 150) {
    await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(160);
    snaps.push(await p.evaluate(({ mode, y }) => {
      const out = {}; const seen = {};
      const els = mode === 'L' ? document.querySelectorAll('body [class]') : document.querySelectorAll('[data-framer-name]');
      for (const e of els) {
        const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue;
        const k0 = mode === 'L' ? (typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => !/^w-/.test(c)).join(' ') : '') : e.getAttribute('data-framer-name').replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).filter((c) => !/^w-/.test(c)).join(' ');
        if (!k0) continue; seen[k0] = (seen[k0] || 0) + 1; if (seen[k0] > 3) continue;
        const s = getComputedStyle(e);
        out[k0 + '#' + seen[k0]] = { t: s.transform, o: s.opacity, top: Math.round(r.top + y) };
      }
      return { y, out };
    }, { mode, y }));
  }
  // classify: element is scroll-linked if, while visible, its doc-top (top+y) or transform changes across >=3 samples
  const res = {};
  const keys = new Set(snaps.flatMap((s) => Object.keys(s.out)));
  for (const k of keys) {
    const seq = snaps.filter((s) => s.out[k]).map((s) => s.out[k]);
    if (seq.length < 3) continue;
    const tops = new Set(seq.map((v) => v.top)); const tr = new Set(seq.map((v) => v.t)); const op = new Set(seq.map((v) => v.o));
    const kind = [];
    if (tops.size >= 3) kind.push('moves(' + Math.min(...tops) + '..' + Math.max(...tops) + ')');
    if (tr.size >= 3) kind.push('transform x' + tr.size);
    if (op.size >= 3) kind.push('opacity x' + op.size);
    if (kind.length) res[k] = kind.join(' ');
  }
  return res;
};
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const out = {};
    for (const [m, base] of [['L', L], ['F', F]]) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.goto(base + pg, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(2500);
      out[m] = await sample(p, m); await p.close();
    }
    console.log(`\n===== /${pg}`);
    for (const [k, v] of Object.entries(out.L)) { const f = out.F[k]; if (!f) console.log(`✗ ${k.padEnd(40)} live: ${v} | F: none`); else if ((v.includes('moves') !== f.includes('moves')) || (v.includes('transform') !== f.includes('transform'))) console.log(`~ ${k.padEnd(40)} live: ${v} | F: ${f}`); }
  }
  await b.close();
})();
