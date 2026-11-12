// hero timeline: every visible text in the first viewport, opacity & translateY every 80ms for 2.5s after navigation
const { chromium } = require('playwright');
const [W, pg] = [+(process.argv[2] || 1440), process.argv[3] || '/'];
const SITES = { live: (process.env.LIVE || 'https://noverde-128.webflow.io'), fr: (process.env.BASE || 'https://adaptable-event-041934.framer.app') };
(async () => {
  const b = await chromium.launch();
  for (const [k, u] of Object.entries(SITES)) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(u + pg, { waitUntil: 'commit' });
    const rows = {};
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      const s = await p.evaluate(() => {
        const o = {};
        document.querySelectorAll('h1,h2,p,a.button,[data-framer-name*="button" i]').forEach((e) => {
          if (e.closest('header,nav,[data-framer-name="Top"],[data-framer-name="Scrolled"]')) return;
          const r = e.getBoundingClientRect(); if (r.top > innerHeight || r.width < 2) return;
          let op = 1, ty = 0; for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); op *= +cs.opacity; if (cs.transform !== 'none') ty += new DOMMatrix(cs.transform).m42; }
          const w = e.querySelector('.vd-w > i, .gsap_split_word, .word'); if (w) { const cs = getComputedStyle(w); op *= +cs.opacity; if (cs.transform !== 'none') ty += new DOMMatrix(cs.transform).m42; }
          const t = e.textContent.replace(/\s+/g, ' ').trim().slice(0, 24); if (t && !(t in o)) o[t] = op.toFixed(2) + '/' + Math.round(ty);
        });
        return o;
      }).catch(() => ({}));
      const t = Date.now() - t0;
      for (const [x, v] of Object.entries(s)) { rows[x] = rows[x] || []; const last = rows[x][rows[x].length - 1]; if (!last || last.v !== v) rows[x].push({ t, v }); }
      await p.waitForTimeout(80);
    }
    console.log('== ' + k);
    for (const [x, seq] of Object.entries(rows)) console.log('  ' + x.padEnd(26) + seq.slice(0, 8).map((q) => q.t + 'ms:' + q.v).join('  ') + (seq.length > 8 ? ' …' + seq[seq.length - 1].t + 'ms:' + seq[seq.length - 1].v : ''));
    await p.close();
  }
  await b.close();
})();
