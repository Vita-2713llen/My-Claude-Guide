// width chain (element -> 4 ancestors) for headings starting with given texts, live vs Framer
const { chromium } = require('playwright');
const [pg, W, ...texts] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); for (let y = 0; y < 9000; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); } await p.waitForTimeout(2000);
    console.log(k, W, await p.evaluate((ts) => ts.map((t) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const h = [...document.querySelectorAll('h1,h2,h3')].find((e) => norm(e.textContent).startsWith(t.toLowerCase()) && e.getBoundingClientRect().width > 0); if (!h) return t + ': none';
      const out = []; let x = h; for (let i = 0; i < 5 && x; i++) { const s = getComputedStyle(x); const r = x.getBoundingClientRect(); out.push(((x.getAttribute('data-framer-name') || x.className || x.tagName) + '').replace(/\s*\[data[^\]]*\]+/g, '').slice(0, 22) + ' x' + Math.round(r.left) + ' w' + Math.round(r.width) + (s.maxWidth !== 'none' ? ' mw' + s.maxWidth : '') + (s.paddingLeft !== '0px' ? ' pl' + s.paddingLeft : '')); x = x.parentElement; }
      return t.slice(0, 20) + ' [' + getComputedStyle(h).fontSize + '/' + getComputedStyle(h).letterSpacing + '] ' + out.join(' < ');
    }).join('\n   '), texts));
    await p.close();
  }
  await b.close();
})();
