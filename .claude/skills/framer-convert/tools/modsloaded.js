// Lists the JS modules a published Framer page loads and counts old (1199.98) vs new (991.98) breakpoint ranges in each.
// node modsloaded.js <page>
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 992, height: 900 } });
  const page = process.argv[2] || '/contact-us';
  await p.goto('https://adaptable-event-041934.framer.app' + page + '?v=' + Date.now(), { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const urls = await p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(u => u.endsWith('.mjs')));
  for (const u of urls) { const t = await (await fetch(u)).text(); const a = (t.match(/1199\.98/g)||[]).length, c = (t.match(/991\.98/g)||[]).length; if (a||c) console.log(u.split('/').pop(), 'old', a, 'new', c); }
  await b.close(); })();
