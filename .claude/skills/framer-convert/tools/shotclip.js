const { chromium } = require('playwright');
const [W, pg, y, h, out] = [+process.argv[2], process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.screenshot({ path: out, clip: { x: 0, y, width: W, height: h } }); await b.close(); })();
