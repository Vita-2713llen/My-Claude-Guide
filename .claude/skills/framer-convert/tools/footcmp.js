const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const W of (process.argv[2] || '1199,1100,992,991,900,810,800,390').split(',').map(Number)) {
    const out = [];
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } });
      await p.goto(base + (process.argv[3] || '/') + '?v=' + Date.now(), { waitUntil: 'load' }); await p.waitForTimeout(1500);
      await p.evaluate(async () => { for (let y = 0; y < 12000; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 1e6); });
      await p.waitForTimeout(1500);
      const r = await p.evaluate(() => {
        const ft = document.querySelector('[data-framer-name="foot-top"], .foot-top'); const t0 = ft.getBoundingClientRect().top;
        const res = [];
        const walker = document.createTreeWalker(ft, NodeFilter.SHOW_TEXT); const seen = new Set();
        for (let t; (t = walker.nextNode());) { const e = t.parentElement; if (seen.has(e)) continue; const s = e.textContent.trim(); if (!s) continue; seen.add(e); const q = e.getBoundingClientRect(); if (q.width < 1) continue; res.push(s.slice(0, 14) + '@' + Math.round(q.left) + ',' + Math.round(q.top - t0)); }
        const inp = ft.querySelector('input'); if (inp) { const q = inp.getBoundingClientRect(); res.push('INPUT@' + Math.round(q.left) + ',' + Math.round(q.top - t0) + ' w' + Math.round(q.width)); }
        res.push('H' + Math.round(ft.getBoundingClientRect().height));
        return res;
      });
      out.push(r); await p.close();
    }
    const toMap = (a) => Object.fromEntries(a.filter(x => !/^(That did not|Thank you|Subscribe)/.test(x)).map(x => [x.split('@')[0], x.split('@')[1] || x]));
    const [L, F] = out.map(toMap); const diffs = [];
    Object.keys(L).forEach((k) => { if (L[k] !== F[k]) { const [a, b] = [L[k], F[k] || '-']; const d = (a.match(/-?\d+/g) || []).map((v, i) => Math.abs(+v - +((b.match(/-?\d+/g) || [])[i] || 0))); if (Math.max(...d) > 2) diffs.push(k + ' ' + a + ' | ' + b); } });
    console.log(W, diffs.length ? 'DIFF ' + diffs.length + '\n   ' + diffs.slice(0, 8).join('\n   ') : 'MATCH (' + L.length + ' items)');
  }
  await b.close();
})();
