const { chromium } = require('playwright');
const [pg, W = '1440', y = '900'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
    await p.evaluate((y) => scrollTo(0, y), +y); await p.waitForTimeout(900);
    console.log(k, await p.evaluate(() => {
      const out = [];
      const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(c); const b = r.getBoundingClientRect(); if (b.top < 80 && b.width) out.push(c.textContent.trim().slice(0, 12) + '@' + Math.round(b.left) + ',' + Math.round(b.top)); } else if (c.nodeType === 1 && getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).display !== 'none') walk(c); } };
      walk(document.body);
      const svg = [...document.querySelectorAll('svg')].map((s) => s.getBoundingClientRect()).filter((r) => r.top < 60 && r.left < 200 && r.width > 10)[0];
      return out.slice(0, 9).join(' ') + (svg ? ' logo@' + Math.round(svg.left) + ',' + Math.round(svg.top) + ' ' + Math.round(svg.width) : '');
    }));
    await p.close();
  }
  await b.close();
})();
