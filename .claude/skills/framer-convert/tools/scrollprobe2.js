// sample an element's rect top / opacity / transform at scroll positions, live vs Framer
// usage: node scrollprobe2.js <page> <name> <y0> <y1> <step> [W]
const { chromium } = require('playwright');
const [pg, name, y0, y1, step, W = '1440'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2000);
    const rows = [];
    for (let y = +y0; y <= +y1; y += +step) {
      await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(500);
      rows.push(y + ': ' + await p.evaluate((n) => {
        const els = [...document.querySelectorAll('.' + n.split(' ').join('.') + ', [data-framer-name^="' + n + '"]')].filter((e) => !e.parentElement.closest('.' + n.split(' ')[0] + ', [data-framer-name^="' + n + '"]'));
        return els.slice(0, 3).map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return Math.round(r.top) + ' o' + (+c.opacity).toFixed(2) + ' ' + (c.transform === 'none' ? '-' : c.transform.replace(/matrix\(|\)/g, '').split(',').map((v) => (+v).toFixed(2)).join(',')); }).join(' | ');
      }, name));
    }
    console.log(k + '\n  ' + rows.join('\n  ')); await p.close();
  }
  await b.close();
})();
