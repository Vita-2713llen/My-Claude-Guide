// open the burger at 360, open All Pages, scroll the panel: screenshots burg3a/b.png + panel height/scroll (live: max-height 219, scrolls)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 360, height: 730 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '/', { waitUntil: 'load' }); await p.waitForTimeout(1800);
  await p.mouse.click(330, 38); await p.waitForTimeout(1200);
  const ap = await p.evaluate(() => { const e = [...document.querySelectorAll('*')].filter((x) => x.children.length === 0 && x.textContent.trim() === 'All Pages' && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top > 60)[0]; const r = e.getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; });
  await p.mouse.click(ap[0], ap[1]); await p.waitForTimeout(1200); await p.screenshot({ path: 'burg3a.png' });
  await p.mouse.move(150, 520); await p.mouse.wheel(0, 900); await p.waitForTimeout(1000); await p.screenshot({ path: 'burg3b.png' });
  console.log(await p.evaluate(() => { const l = document.querySelector('[data-framer-name="Pages list"]'); const vis = [...document.querySelectorAll('[data-framer-name="Pages list"]')].filter((x) => x.getBoundingClientRect().height > 0)[0]; const r = vis.getBoundingClientRect(); return `list top${Math.round(r.top)} h${Math.round(r.height)} scrollTop=${vis.scrollTop} sh=${vis.scrollHeight}`; }));
  await b.close(); })();
