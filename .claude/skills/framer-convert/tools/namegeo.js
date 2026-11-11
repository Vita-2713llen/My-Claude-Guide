// compare geometry of named blocks (class on live, data-framer-name on Framer): node namegeo.js <page> <W> name1 name2 ...
const { chromium } = require('playwright');
const [pg, W, ...names] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const res = {};
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    for (let y = 0; y < 14000; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(70); }
    await p.waitForTimeout(1500);
    res[k] = await p.evaluate((names) => names.map((nm) => {
      const els = [...document.querySelectorAll('[class], [data-framer-name]')].filter((e) => {
        const a = (e.getAttribute('data-framer-name') || '').split(/\s+/); const c = typeof e.className === 'string' ? e.className.split(/\s+/) : [];
        return (a[0] === nm || c[0] === nm) && e.getBoundingClientRect().height > 0;
      });
      return nm + ': ' + els.slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `h${Math.round(r.height)} w${Math.round(r.width)} x${Math.round(r.left)} p${cs.paddingTop}/${cs.paddingBottom} g${cs.rowGap}`; }).join(' | ');
    }), names);
    await p.close();
  }
  names.forEach((n, i) => console.log('L ' + res.L[i] + '\nF ' + res.F[i]));
  await b.close();
})();
