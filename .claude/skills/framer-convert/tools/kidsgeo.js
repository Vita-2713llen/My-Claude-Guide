// children geometry of an element (by class / framer name) live vs Framer
const { chromium } = require('playwright');
const [pg, W, name, idx = '0'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); for (let y = 0; y < 5000; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); } await p.waitForTimeout(2000);
    console.log(k, await p.evaluate(([n, i]) => {
      const els = [...document.querySelectorAll('.' + n + ', [data-framer-name~="' + n + '"]')].filter((e) => e.getBoundingClientRect().width > 0); const e = els[+i]; if (!e) return 'none';
      const kids = (x) => [...x.children].flatMap((c) => getComputedStyle(c).display === 'contents' ? kids(c) : [c]);
      const s = getComputedStyle(e); const R = (x) => { const r = x.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top - e.getBoundingClientRect().top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
      return R(e) + ' ' + s.display + ' ' + s.flexDirection + ' wrap:' + s.flexWrap + ' jc:' + s.justifyContent + ' gap' + s.rowGap + '/' + s.columnGap + '\n   ' + kids(e).map((c) => ((c.getAttribute('data-framer-name') || c.className) + '').slice(0, 26) + ' ' + R(c) + ' ws:' + getComputedStyle(c).whiteSpace + ' "' + c.innerText.replace(/\n/g, ' / ').slice(0, 40) + '"').join('\n   ');
    }, [name, idx]));
    await p.close();
  }
  await b.close();
})();
