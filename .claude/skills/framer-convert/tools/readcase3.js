const { chromium } = require('playwright'); const pages = require(process.argv[2]);
(async () => { const b = await chromium.launch();
 for (const pg of pages) { const row = [];
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
   const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
   const n = await p.locator('a', { hasText: /Read the case|Read the story|See the case/ }).count();
   if (!n) { row.push(k + ' -'); await p.close(); continue; }
   const a = p.locator('a:visible', { hasText: /Read the case|Read the story|See the case/ }).first();
   if (!(await a.count())) { row.push(k + ' hidden'); await p.close(); continue; }
   await a.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
   const snap = () => a.evaluate((el) => { const cs = getComputedStyle(el); const af = getComputedStyle(el, '::after'); return 'gap' + cs.columnGap + ' line=' + (cs.borderBottomStyle !== 'none' ? cs.borderBottomColor : af.borderColor); });
   const b4 = await snap(); await a.hover(); await p.waitForTimeout(1000);
   row.push(k + ' n' + n + ' ' + b4 + ' → ' + await snap() + '  [' + await a.evaluate(e => (e.getAttribute('data-framer-name') || e.className).split(' [')[0] + ' < ' + ((e.parentElement.getAttribute('data-framer-name') || e.parentElement.className) + '').split(' [')[0]) + ']'); await p.close(); }
  if (row.some(r => !/ -$/.test(r))) console.log(pg + '\n  ' + row.join('\n  ')); }
 await b.close(); })();
