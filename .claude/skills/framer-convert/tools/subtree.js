// dump a section's subtree (depth N) with heights, live vs Framer. usage: node subtree.js <page> <W> <liveSel> <framerNamePrefix> [depth]
const { chromium } = require('playwright');
const [pg, W, ls, fn, D = '4'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); for (let y = 0; y < 12000; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(80); } await p.waitForTimeout(1200);
    console.log(k + '\n' + await p.evaluate(([ls, fn, D]) => {
      const root = ls && document.querySelector(ls) || [...document.querySelectorAll('[data-framer-name]')].find((e) => e.getAttribute('data-framer-name').startsWith(fn));
      if (!root) return 'none'; const out = [];
      const walk = (e, d) => { const r = e.getBoundingClientRect(); if (!r.height) return; const nm = (e.getAttribute('data-framer-name') || (typeof e.className === 'string' ? e.className : '') || e.tagName).replace(/\s*\[data-[^\]]*\]+/g, '').slice(0, 34); out.push('  '.repeat(d) + nm + ' h' + Math.round(r.height) + ' y' + Math.round(r.top - root.getBoundingClientRect().top)); if (d < D) [...e.children].forEach((c) => walk(c, d + 1)); };
      walk(root, 0); return out.join('\n');
    }, [k === 'L' ? ls : '', fn, +D]));
    await p.close();
  }
  await b.close();
})();
