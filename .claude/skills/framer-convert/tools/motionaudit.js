// MOTION AUDIT — load animation + scroll reveals, Framer vs live, every page.
// For each text/button:
//   LOAD (first screen): animated in? when fully shown? did it move again after it settled (late jump)?
//   REVEAL (below the fold, scrolled into view): ms until fully shown, or never.
// Reported only where Framer is worse than live:
//   LOAD-STATIC   live animates on load, Framer shows it static
//   LOAD-SLOW     Framer fully shown > max(LOAD_MAX, live + 300ms)
//   LOAD-JUMP     Framer moves/hides it again after it had settled (live does not)
//   REVEAL-NEVER  live reveals it, Framer never shows it (within 2s in view)
//   REVEAL-SLOW   Framer reveal > live + 300ms and > REVEAL_MAX
// node motionaudit.js <widths csv> [pages...]   pages default: pages.json (crawl.js) + /404
// env: BASE (Framer), LIVE (source site), LOAD_MAX (1600), REVEAL_MAX (900)
const { chromium } = require('playwright'); const fs = require('fs');
const widths = (process.argv[2] || '1440,390').split(',').map(Number);
let pages = process.argv.slice(3);
if (!pages.length) pages = fs.existsSync(__dirname + '/pages.json') ? [...JSON.parse(fs.readFileSync(__dirname + '/pages.json')), '/404'] : ['/'];
const FR = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const LIVE = process.env.LIVE || 'https://noverde-128.webflow.io';
const LOAD_MAX = +(process.env.LOAD_MAX || 1600), REVEAL_MAX = +(process.env.REVEAL_MAX || 900);
const sample = (fold) => {
  const out = {}; const vh = innerHeight;
  document.querySelectorAll('h1,h2,h3,h4,p,a,button').forEach((e) => {
    if (e.closest('header,nav,.w-nav,[data-framer-name="Top"],[data-framer-name="Scrolled"],[data-framer-name^="Mobile"],[data-framer-name="All Pages Menu"],[aria-hidden="true"]')) return;
    const t = e.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 3) return;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    if (fold === 'first' && (r.top > vh * 0.9 || r.bottom < 0)) return;
    if (fold === 'view' && (r.top > vh * 0.85 || r.bottom < vh * 0.1)) return;
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
      const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (cs.display !== 'contents' && /(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) { const q = x.getBoundingClientRect(); if (q.width >= 1 && q.height >= 1 && (r.left >= q.right || r.right <= q.left || r.top >= q.bottom || r.bottom <= q.top)) return; }
    }
    let op = 1; for (let x = e; x && x !== document.body; x = x.parentElement) op *= +getComputedStyle(x).opacity;
    const ty = r.top + scrollY; // on-screen position (what the user sees), not a sum of ancestor matrices
    const k = t.replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 40); if (!(k in out)) out[k] = { op: +op.toFixed(2), y: Math.round(ty) };
  });
  return out;
};
async function measure(b, base, pg, W) {
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto(base + pg, { waitUntil: 'commit', timeout: 60000 }).catch(() => {});
  const t0 = Date.now(); const seq = {};
  while (Date.now() - t0 < 3600) {
    const s = await p.evaluate(sample, 'first').catch(() => ({}));
    const t = Date.now() - t0;
    for (const [k, v] of Object.entries(s)) (seq[k] = seq[k] || []).push({ t, ...v });
    await p.waitForTimeout(70);
  }
  const load = {};
  for (const [k, q] of Object.entries(seq)) {
    if (q.length < 3) continue;
    const fin = q[q.length - 1];
    const ok = (z) => z.op >= 0.99 && Math.abs(z.y - fin.y) <= 1;
    let settledAt = null, jump = null;
    for (let i = 0; i < q.length; i++) { if (ok(q[i])) { if (settledAt == null) settledAt = q[i].t; } else if (settledAt != null && !jump) jump = q[i].t; }
    const shownAt = (q.find((z, i) => q.slice(i).every(ok)) || {}).t ?? null;
    load[k] = { animated: q.some((z) => z.op < 0.9 || Math.abs(z.y - fin.y) > 6), shownAt, jump: jump && shownAt && jump < shownAt ? jump : null };
  }
  const reveal = {};
  const H = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
  for (let y = 700; y < Math.min(H, 16000); y += 600) {
    await p.evaluate((y) => { const l = window.__vdLenis; if (l) l.scrollTo(y, { immediate: true }); else scrollTo(0, y); }, y);
    const ts = Date.now(); const st = {};
    while (Date.now() - ts < 2000) {
      const s = await p.evaluate(sample, 'view').catch(() => ({}));
      const t = Date.now() - ts;
      for (const [k, v] of Object.entries(s)) { if (k in load || k in reveal) continue; st[k] = st[k] || { t: null }; if (v.op >= 0.99 && st[k].t == null) st[k].t = t; }
      await p.waitForTimeout(90);
    }
    for (const [k, v] of Object.entries(st)) if (!(k in reveal)) reveal[k] = v.t;
  }
  await p.close();
  return { load, reveal };
}
(async () => {
  const b = await chromium.launch();
  let total = 0;
  for (const W of widths) for (const pg of pages) {
    const [L, F] = await Promise.all([measure(b, LIVE, pg, W), measure(b, FR, pg, W)]);
    const lines = [];
    for (const [k, f] of Object.entries(F.load)) {
      const l = L.load[k];
      if (l && l.animated && !f.animated) lines.push(`LOAD-STATIC "${k}" (live animates in, Framer is static)`);
      if (f.shownAt == null && (!l || l.shownAt != null)) lines.push(`LOAD-NOT-SHOWN "${k}"`);
      else if (f.shownAt != null && f.shownAt > Math.max(LOAD_MAX, (l && l.shownAt != null ? l.shownAt : 0) + 300)) lines.push(`LOAD-SLOW "${k}" Framer ${f.shownAt}ms vs live ${l ? l.shownAt : '-'}ms`);
      if (f.jump && !(l && l.jump)) lines.push(`LOAD-JUMP "${k}" moves again at ${f.jump}ms after settling`);
    }
    for (const [k, f] of Object.entries(F.reveal)) {
      const l = L.reveal[k]; if (l === undefined) continue; // not comparable (other content / layout)
      if (f == null && l != null) lines.push(`REVEAL-NEVER "${k}" (live ${l}ms)`);
      else if (f != null && l != null && f > l + 300 && f > REVEAL_MAX) lines.push(`REVEAL-SLOW "${k}" Framer ${f}ms vs live ${l}ms`);
    }
    total += lines.length;
    console.log(`== ${pg} @${W}` + (lines.length ? '\n   ' + lines.slice(0, 30).join('\n   ') + (lines.length > 30 ? `\n   … +${lines.length - 30}` : '') : '  OK'));
  }
  console.log(`\nTOTAL issues: ${total}`);
  await b.close();
})();
