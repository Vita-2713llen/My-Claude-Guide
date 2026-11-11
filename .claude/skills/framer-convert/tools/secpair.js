// screenshot the element that contains a text, live vs Framer, side by side: node secpair.js <page> <W> <text> <out> [ancestorDepth]
const { chromium } = require('playwright'); const fs = require('fs');
const [pg, W, txt, out, depth = '4'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const files = [];
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' });
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(80); }
    await p.waitForTimeout(2500);
    const box = await p.evaluate(([t, d]) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase(); const el = [...document.querySelectorAll('h1,h2,h3,h4,p')].find((e) => norm(e.textContent).startsWith(t.toLowerCase()) && e.getBoundingClientRect().width > 0);
      if (!el) return null; let x = el; for (let i = 0; i < +d && x.parentElement; i++) x = x.parentElement;
      x.scrollIntoView({ block: 'start' }); const r = x.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + scrollY - 20), w: innerWidth, h: Math.min(1400, r.height + 40) };
    }, [txt, depth]);
    if (!box) { console.log(k, 'not found'); await p.close(); continue; }
    await p.evaluate((y) => scrollTo(0, y), box.y); await p.waitForTimeout(1500);
    const f = `qcv/pair-${k}.png`; await p.screenshot({ path: f, fullPage: true, clip: { x: 0, y: box.y, width: box.w, height: box.h } }); files.push(f);
    await p.close();
  }
  const pp = await b.newPage({ viewport: { width: 1200, height: 100 } });
  await pp.setContent('<body style="margin:0;display:flex;gap:8px;background:#f0f;align-items:flex-start">' + files.map((f) => '<img src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '">').join('') + '</body>');
  await pp.screenshot({ path: out, fullPage: true }); await b.close(); console.log('ok', out);
})();
