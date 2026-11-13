// links in the open burger's All Pages list (published site)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 730 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '/', { waitUntil: 'load' }); await p.waitForTimeout(1800);
  await p.click('[data-framer-name="Burger"] >> visible=true'); await p.waitForTimeout(1000);
  console.log(await p.evaluate(() => [...document.querySelectorAll('[data-framer-name="Pages list"]')].filter((l) => l.closest('[data-framer-name^="Mobile"]') && l.offsetParent !== null || true).map((l) => (l.closest('[data-framer-name^="Mobile"],[data-framer-name="Top"],[data-framer-name="Scrolled"]') || {}).getAttribute?.('data-framer-name') + ': ' + [...l.querySelectorAll('a')].map((a) => a.textContent.trim()).join(', ')).join('\n')));
  await b.close(); })();
