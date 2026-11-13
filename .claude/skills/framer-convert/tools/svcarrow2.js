const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const W of [1720, 1440, 1200]) for (const [k, base, row] of [['L', 'https://noverde-128.webflow.io', '.service-list-row'], ['F', 'https://adaptable-event-041934.framer.app', '[data-framer-name^="service-list-row"]']]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(base + '/services', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const rows = p.locator(row); const n = await rows.count();
    const r = rows.nth(4); await r.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
    const snap = () => r.evaluate((el) => { const R = el.getBoundingClientRect(); const out = [];
      el.querySelectorAll('*').forEach(e => { const q = e.getBoundingClientRect(); const cs = getComputedStyle(e); const nm = (e.getAttribute('data-framer-name') || (typeof e.className === 'string' ? e.className : '') || e.tagName).toString().split(' [')[0].slice(0, 34);
        if (/arrow|desc|lead|tag|image|svg/i.test(nm) || e.tagName === 'svg') out.push(nm + ' x' + Math.round(q.left - R.left) + ' y' + Math.round(q.top - R.top) + ' w' + Math.round(q.width) + ' h' + Math.round(q.height) + ' op' + (+cs.opacity).toFixed(2) + (cs.transform === 'none' ? '' : ' tf' + cs.transform.slice(0, 50))); });
      return out.slice(0, 12).join('\n      '); });
    const before = await snap(); await r.hover(); await p.waitForTimeout(1500); const after = await snap();
    console.log(k, W, 'rows=' + n, '\n   BEFORE\n      ' + before + '\n   HOVER\n      ' + after);
    await p.screenshot({ path: `${process.argv[2]}/svc_${k}_${W}.png`, clip: await r.boundingBox() });
    await p.close(); }
  await b.close(); })();
