const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
 for (const [k, base, sel] of [['L', 'https://noverde-128.webflow.io', '.impact-link'], ['F', 'https://adaptable-event-041934.framer.app', '[data-framer-name^="impact-link"]']]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(base + '/our-impact', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const a = p.locator(sel).first(); await a.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  const snap = () => a.evaluate((el) => [el, ...el.querySelectorAll('*')].slice(0, 6).map(e => { const cs = getComputedStyle(e); const af = getComputedStyle(e, '::after'); const q = e.getBoundingClientRect(); return ((e.getAttribute('data-framer-name') || e.className || e.tagName) + '').split(' [')[0].slice(0, 28) + ' x' + Math.round(q.left) + ' w' + Math.round(q.width) + ' col=' + cs.color + ' bb=' + cs.borderBottomWidth + ' ' + cs.borderBottomColor + ' after=' + af.borderBottomColor + ' tf=' + cs.transform.slice(0, 28) + ' tr=' + cs.transition.slice(0, 60); }).join('\n      '));
  const b4 = await snap(); await a.hover(); await p.waitForTimeout(1000); console.log(k, '\n   BEFORE\n      ' + b4 + '\n   HOVER\n      ' + await snap()); await p.close(); }
 await b.close(); })();
