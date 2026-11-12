// scroll down slowly at 1440 and log the Nth card's opacity product + top (live vs Framer)
const { chromium } = require('playwright');
const [W, pg, fname, lcls, idx] = [+process.argv[2], process.argv[3], process.argv[4], process.argv[5], +(process.argv[6] || 3)];
(async () => { const b = await chromium.launch();
  for (const [k, u, sel] of [['live', (process.env.LIVE || 'https://noverde-128.webflow.io'), '.' + lcls], ['fr', (process.env.BASE || 'https://adaptable-event-041934.framer.app'), `[data-framer-name~="${fname}"]`]]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(u + pg, { waitUntil: 'load' }); await p.waitForTimeout(2000);
    const rows = [];
    for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(150);
      rows.push(await p.evaluate(([sel, idx]) => { const e = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)[idx]; if (!e) return 'nf'; let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity; return `op${op.toFixed(2)}@${Math.round(e.getBoundingClientRect().top)}`; }, [sel, idx])); }
    await p.waitForTimeout(1500);
    rows.push('final ' + await p.evaluate(([sel, idx]) => { const e = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)[idx]; let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity; const pr = e.parentElement; return `op${op.toFixed(2)}@${Math.round(e.getBoundingClientRect().top)} tf=${getComputedStyle(pr).transform}`; }, [sel, idx]));
    console.log(k, rows.join(' ')); await p.close(); }
  await b.close(); })();
