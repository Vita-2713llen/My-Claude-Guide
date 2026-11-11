// sample a button's subtree styles across a hover transition, live vs Framer
const { chromium } = require('playwright');
const [pg, text, W = '1440'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); await p.waitForTimeout(2000);
    const h = await p.evaluateHandle((t) => [...document.querySelectorAll('a,button')].find((a) => a.innerText.trim() === t && a.getBoundingClientRect().width > 0), text);
    const el = h.asElement(); if (!el) { console.log(k, 'not found'); continue; }
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1800); await p.mouse.move(5, 5); await p.waitForTimeout(600);
    const snap = () => el.evaluate((a) => { const all = [a, ...a.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 6); return all.map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return (e.getAttribute('data-framer-name') || e.className.toString().split(' ')[0] || e.tagName).toString().slice(0, 14) + '{bg ' + s.backgroundColor.replace(/rgba?\(|\)| /g, '') + ' c ' + s.color.replace(/rgba?\(|\)| /g, '') + ' x' + Math.round(r.left) + ' w' + Math.round(r.width) + ' o' + (+s.opacity).toFixed(2) + ' t ' + (s.transform === 'none' ? '-' : s.transform.replace(/matrix\(|\)| /g, '').split(',').map((v) => (+v).toFixed(2)).join(',')) + '}'; }).join(' '); });
    console.log(k, 'rest ', await snap());
    console.log(k, 'trans', await el.evaluate((a) => [a, ...a.querySelectorAll('*')].slice(0, 4).map((e) => getComputedStyle(e).transition.slice(0, 90)).join(' || ')));
    const box = await el.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const t0 = Date.now();
    for (const t of [60, 150, 250, 400, 650]) { await p.waitForTimeout(Math.max(0, t - (Date.now() - t0))); console.log(k, String(t).padStart(5), await snap()); }
    await p.close();
  }
  await b.close();
})();
