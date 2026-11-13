// Every email on the Framer site must be info@example.com (text, mailto:, placeholders, CMS, form copy).
// Usage: BASE=<framer site> node emailaudit.js   (reads pages.json from crawl.js)
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const OK = 'info@example.com';
const RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
(async () => {
  const pages = JSON.parse(fs.readFileSync(__dirname + '/pages.json', 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage();
  let bad = 0;
  for (const pg of pages) {
    try { await p.goto(BASE + pg, { waitUntil: 'load', timeout: 45000 }); } catch (e) { console.log('LOADFAIL', pg); continue; }
    const found = await p.evaluate(() => {
      const out = [];
      out.push(document.body.innerText);
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => out.push(a.getAttribute('href')));
      document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => out.push(i.placeholder));
      return out.join('\n') + '\n' + document.documentElement.outerHTML;
    });
    const hits = [...new Set((found.match(RE) || []).filter(e => e !== OK && !/\.(png|jpe?g|webp|svg|avif|gif|js|css)$/i.test(e)))];
    if (hits.length) { bad++; console.log('EMAIL', pg, hits.join(', ')); }
  }
  console.log(bad ? `FAIL ${bad} page(s) with emails other than ${OK}` : `OK every email is ${OK}`);
  await b.close();
})();
