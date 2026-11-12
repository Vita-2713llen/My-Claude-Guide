// opacity/transform timeline of the Nth element matching a framer-name word (Framer) or class (live)
const { chromium } = require('playwright');
const [W, pg, fname, lcls, idx] = [+process.argv[2], process.argv[3], process.argv[4], process.argv[5], +(process.argv[6] || 1)];
(async () => { const b = await chromium.launch();
  for (const [k, u, sel] of [['live', (process.env.LIVE || 'https://noverde-128.webflow.io'), '.' + lcls], ['fr', (process.env.BASE || 'https://adaptable-event-041934.framer.app'), `[data-framer-name~="${fname}"]`]]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(u + pg, { waitUntil: 'commit' }); const t0 = Date.now(); let last = '';
    while (Date.now() - t0 < 3000) { const s = await p.evaluate(([sel, idx]) => { const all = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0); const e = all[idx]; if (!e) return 'n=' + all.length; let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity; return `n=${all.length} op${op.toFixed(2)} top${Math.round(e.getBoundingClientRect().top)}`; }, [sel, idx]).catch(() => 'err'); if (s !== last) { console.log(k, Date.now() - t0, s); last = s; } await p.waitForTimeout(60); }
    await p.close(); }
  await b.close(); })();
