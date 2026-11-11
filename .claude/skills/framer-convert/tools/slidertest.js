const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const W of [360, 768, 992]) { const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto('https://adaptable-event-041934.framer.app/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    for (const [name, mask, next] of [['voices', '[data-framer-name^="voices-slider"]', '[data-framer-name^="voices-arrow voices-arrow-next"]'], ['case', '[data-framer-name^="case-slider"]', '[data-framer-name^="case-button w-slider-arrow-right"]']]) {
      const sl = p.locator(mask).first(); await sl.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
      const state = () => p.evaluate((m) => { const s = document.querySelector(m); const r = s.getBoundingClientRect(); const items = [...s.querySelectorAll('[data-framer-name="w-slide"],[data-framer-name="w-dyn-item"]')]; const vis = items.map((it, i) => { const q = it.getBoundingClientRect(); return [i, Math.round(q.left - r.left), Math.round(q.width), getComputedStyle(it).opacity]; }).filter((x) => x[1] > -5 && x[1] < r.width - 10 && +x[3] > 0.5); return JSON.stringify(vis); }, mask);
      const a = await state(); const btn = p.locator(next).first(); const bb = await btn.boundingBox();
      await btn.click({ force: true }).catch((e) => console.log('click err', e.message.slice(0, 60))); await p.waitForTimeout(1500);
      const c = await state(); console.log(`${W} ${name}: arrow x${bb && Math.round(bb.x)}..${bb && Math.round(bb.x + bb.width)} visible-before ${a} after ${c} ${a !== c ? 'MOVES' : 'STUCK'}`);
    }
    await p.close(); }
  await b.close(); })();
