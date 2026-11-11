// dump section #i subtree (depth D) live vs Framer side by side. node secdiff.js <page> <W> <sectionIndex> [depth]
const { chromium } = require('playwright');
const [pg, W, I, D = '5'] = process.argv.slice(2);
const dump = ([I, D]) => {
  const s = document.querySelectorAll('section')[+I]; if (!s) return ['none']; const top = s.getBoundingClientRect().top; const out = [];
  const w = (e, d) => {
    const cs = getComputedStyle(e); if (cs.display === 'contents') { [...e.children].forEach((c) => w(c, d)); return; }
    const r = e.getBoundingClientRect(); if (r.height < 1) return;
    const nm = ((e.getAttribute('data-framer-name') || (typeof e.className === 'string' ? e.className : '') || e.tagName) + '').replace(/\s*\[data-[^\]]*\]+/g, '').split(' ')[0].slice(0, 26);
    if (/gsap_split|vd-w|^framer-text$/.test(nm)) return;
    out.push('  '.repeat(d) + nm + ' h' + Math.round(r.height) + ' w' + Math.round(r.width) + ' y' + Math.round(r.top - top));
    if (d < +D) [...e.children].forEach((c) => w(c, d + 1));
  };
  w(s, 0); return out;
};
(async () => {
  const b = await chromium.launch(); const R = {};
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 1000 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    for (let y = 0; y < 14000; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(50); }
    await p.waitForTimeout(1500); R[k] = await p.evaluate(dump, [I, D]); await p.close();
  }
  const n = Math.max(R.L.length, R.F.length);
  for (let i = 0; i < n; i++) console.log((R.L[i] || '').padEnd(60) + ' | ' + (R.F[i] || ''));
  await b.close();
})();
