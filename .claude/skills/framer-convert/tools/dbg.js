// page errors + console errors after load (a broken boot() shows here first): node dbg.js [page]
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + (process.argv[2] || '/blog'), { waitUntil: 'load' }); await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => { const c = [...document.querySelectorAll('[data-framer-name~="journal-card"]')].map((e) => e.parentElement); return 'ready=' + document.documentElement.className + ' | ' + c.map((x) => (x.getAttribute('style') || '-').slice(0, 70) + ' cls=' + x.className.slice(0, 40)).join('\n'); }));
  await b.close(); })();
