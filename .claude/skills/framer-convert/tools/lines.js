const { chromium } = require('playwright');
const [pg, W, t] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); for (let y = 0; y < 6000; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); } await p.waitForTimeout(2500);
    console.log(k, await p.evaluate((t) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const h = [...document.querySelectorAll('h1,h2,h3')].find((e) => norm(e.textContent).startsWith(t.toLowerCase()) && e.getBoundingClientRect().width > 0); if (!h) return 'none';
      const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); const lines = {}; let n;
      while ((n = w.nextNode())) { const r = document.createRange(); r.selectNodeContents(n); for (const rc of r.getClientRects()) { const y = Math.round(rc.top); (lines[y] = lines[y] || []).push(n.textContent.trim()); } }
      const s = getComputedStyle(h);
      return [s.fontFamily.slice(0, 30), s.fontSize, s.letterSpacing, s.wordSpacing, s.fontFeatureSettings, s.fontWeight, 'w' + Math.round(h.getBoundingClientRect().width), s.textAlign].join(' | ') + '\n   ' + Object.values(lines).map((l) => l.filter(Boolean).join(' ')).join('\n   ');
    }, t));
    await p.close();
  }
  await b.close();
})();
