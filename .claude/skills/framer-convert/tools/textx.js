// Compare horizontal text positions live vs Framer (matched by text, structure-agnostic).
// node textx.js <W> [pages=comma list|all]   -> per page: count of texts whose left edge differs > 3px
const { chromium } = require('playwright'); const fs = require('fs');
const W = +process.argv[2] || 1360;
const pages = !process.argv[3] || process.argv[3] === 'all' ? JSON.parse(fs.readFileSync(__dirname + '/pages.json')) : process.argv[3].split(',');
const grab = () => { const res = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let t; (t = w.nextNode());) { const e = t.parentElement; if (!e || seen.has(e) || e.closest('header,nav,.site-head,[data-framer-name="Header"],script,style,#__framer-editorbar-container')) continue; seen.add(e);
    const s = e.textContent.trim().replace(/\s+/g, ' ').replace(/noverde/gi, 'verdova').toLowerCase(); if (s.length < 3) continue; const r = e.getBoundingClientRect(); if (r.width < 1) continue;
    let v = true; for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { v = false; break; } } if (!v) continue;
    const k = s.slice(0, 30); (res[k] = res[k] || []).push(Math.round(r.left)); } return res; };
(async () => { const b = await chromium.launch(); let tot = 0;
  for (const pg of pages) { const R = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.evaluate(async () => { for (let y = 0; y < 15000; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); }); await p.waitForTimeout(1500);
      R[k] = await p.evaluate(grab); await p.close(); }
    const bad = []; for (const [t, xs] of Object.entries(R.L)) { const f = R.F[t]; if (!f) continue; const d = Math.min(...f.map(x => Math.abs(x - xs[0]))); if (d > 3) bad.push(t.slice(0, 22) + ' ' + xs[0] + '→' + f[0]); }
    tot += bad.length; console.log(pg + ' @' + W + ': ' + (bad.length ? bad.length + ' off  e.g. ' + bad.slice(0, 4).join(' | ') : 'OK'));
  } console.log('TOTAL off', tot); await b.close(); })();
