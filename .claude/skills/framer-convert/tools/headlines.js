// Headings that wrap into MORE lines on Framer than on live (e.g. one word per line when a heading sits in a
// min-content / auto-width wrapper). Usage: node headlines.js 1440,1100 [pages…]  → lists text, lines L/F, width L/F,
// and the nearest ancestor whose width is narrower than its parent (the wrapper to widen).
const { chromium } = require('playwright');
const fs = require('fs');
const L = process.env.LIVE || 'https://noverde-128.webflow.io', F = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const widths = (process.argv[2] || '1440,1100').split(',').map(Number);
let pages = process.argv.slice(3);
if (!pages.length) pages = fs.existsSync(__dirname + '/pages.json') ? JSON.parse(fs.readFileSync(__dirname + '/pages.json')) : ['/'];
const probe = () => {
  const out = {};
  for (const e of document.querySelectorAll('h1,h2,h3,h4')) {
    const t = e.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); if (!t || t.length < 6) continue;
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    const rg = document.createRange(); rg.selectNodeContents(e);
    const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 4)));
    let culprit = '';
    for (let x = e.parentElement, i = 0; x && i < 6; x = x.parentElement, i++) {
      const p = x.parentElement; if (!p) break;
      const pw = p.getBoundingClientRect().width, xw = x.getBoundingClientRect().width;
      if (xw < pw * 0.6 && getComputedStyle(x).width !== 'auto') { culprit = (x.getAttribute('data-framer-name') || x.className || x.tagName).toString().slice(0, 40) + ' w=' + getComputedStyle(x).width; break; }
    }
    if (!out[t] || out[t].lines < tops.size) out[t] = { lines: tops.size, w: Math.round(r.width), culprit };
  }
  return out;
};
(async () => {
  const b = await chromium.launch();
  for (const W of widths) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    for (const pg of pages) {
      const res = [];
      for (const base of [L, F]) { await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1800); res.push(await p.evaluate(probe).catch(() => ({}))); }
      const bad = [];
      for (const [t, f] of Object.entries(res[1])) {
        const l = res[0][t]; if (!l) continue;
        if (f.lines > l.lines + 1 || (f.lines > l.lines && f.w < l.w * 0.6)) bad.push(`   "${t.slice(0, 44)}" lines L${l.lines}/F${f.lines} w L${l.w}/F${f.w} ${f.culprit ? '← ' + f.culprit : ''}`);
      }
      if (bad.length) console.log(`== ${pg} @${W}\n` + bad.join('\n'));
    }
    await p.close();
  }
  console.log('headlines: done ' + widths.join(',') + ' x ' + pages.length + ' pages');
  await b.close();
})();
