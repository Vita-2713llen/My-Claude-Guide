// footer links at 1440/810/360 (every variant): text → href
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const W of [1440, 810, 360]) { const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(1500);
    const f = p.locator('[data-framer-name="foot-nav"] >> visible=true').first(); await f.screenshot({ path: `foot_${W}.png` });
    console.log(W, await p.evaluate(() => [...document.querySelectorAll('[data-framer-name="foot-nav"] a')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.textContent.trim() + '→' + a.getAttribute('href')).join(' | ')));
    await p.close(); }
  await b.close(); })();
