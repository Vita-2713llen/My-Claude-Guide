// screenshot the section containing a text, on live and Framer: node shotsel.js <width> <page> <text> <outprefix>
const { chromium } = require('playwright');
const [W, pg, needle, out] = [+process.argv[2], process.argv[3], process.argv[4], process.argv[5]];
const SITES = { live: (process.env.LIVE || 'https://noverde-128.webflow.io'), fr: (process.env.BASE || 'https://adaptable-event-041934.framer.app') };
(async () => {
  const b = await chromium.launch();
  for (const [k, u] of Object.entries(SITES)) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(u + pg, { waitUntil: 'load' });
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
    const y = await p.evaluate((n) => { const all = [...document.querySelectorAll('h1,h2,h3,p,div')].filter((x) => x.textContent.trim().startsWith(n)); const e = all[all.length - 1]; if (!e) return -1; const s = e.closest('section') || e; s.scrollIntoView(); return 0; }, needle);
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `${out}_${k}.png` });
    await p.close();
  }
  await b.close();
})();
