// Heading anchors: y of every h1/h2/h3 live vs Framer (matched by text) at a width; shows delta growth to locate the section that grows
const { chromium } = require('playwright');
const [pg, W = '810'] = process.argv.slice(2);
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').slice(0, 40);
(async () => {
  const b = await chromium.launch(); const res = {};
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2000);
    res[k] = await p.evaluate(() => [...document.querySelectorAll('h1,h2,h3,footer')].map((h) => [h.textContent, Math.round(h.getBoundingClientRect().top + scrollY), Math.round(h.getBoundingClientRect().height)]));
    await p.close();
  }
  let prev = 0;
  for (const [t, y, h] of res.L) {
    const m = res.F.find((x) => norm(x[0]) === norm(t)); if (!m) { console.log(norm(t).padEnd(42) + ' L' + y + '  F —'); continue; }
    const d = m[1] - y; console.log(norm(t).padEnd(42) + ' L' + String(y).padStart(6) + ' F' + String(m[1]).padStart(6) + ' d' + String(d).padStart(5) + (Math.abs(d - prev) > 30 ? '   <<< +' + (d - prev) : '') + '  h' + h + '/' + m[2]); prev = d;
  }
  await b.close();
})();
