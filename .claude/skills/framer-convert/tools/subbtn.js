const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const out = [];
 for (const W of [1440, 1200, 1100, 992, 900, 390]) { const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto('https://adaptable-event-041934.framer.app/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await p.evaluate(() => scrollTo(0, 1e6)); await p.waitForTimeout(1500);
  out.push(W + ': ' + await p.evaluate(() => { const btn = [...document.querySelectorAll('[data-framer-name="foot-actions"] *')].find(e => e.textContent.trim() === 'Subscribe' && e.children.length === 0); if (!btn) return 'no label'; let box = btn; while (box && box.getBoundingClientRect().height < 40) box = box.parentElement; const a = btn.getBoundingClientRect(), c = box.getBoundingClientRect(); return 'label centre ' + Math.round(a.top + a.height / 2) + ' vs button centre ' + Math.round(c.top + c.height / 2) + ' (btn h' + Math.round(c.height) + ')'; }));
  await p.close(); }
 console.log(out.join('\n')); await b.close(); })();
