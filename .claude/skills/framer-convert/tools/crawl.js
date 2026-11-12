// crawl every internal page of the Framer site (static pages + every CMS item) -> pages.json
const { chromium } = require('playwright'); const fs = require('fs');
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const seen = new Set(['/']); const queue = ['/'];
  while (queue.length && seen.size < 200) {
    const pg = queue.shift();
    await p.goto(BASE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(600);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
    for (const h of hrefs) {
      let u; try { u = new URL(h); } catch (e) { continue; }
      if (u.origin !== new URL(BASE).origin) continue;
      const path = u.pathname.replace(/\/$/, '') || '/';
      if (!seen.has(path)) { seen.add(path); queue.push(path); }
    }
  }
  const list = [...seen].sort();
  fs.writeFileSync(__dirname + '/pages.json', JSON.stringify(list, null, 1));
  console.log(list.length + ' pages\n' + list.join('\n'));
  await b.close();
})();
