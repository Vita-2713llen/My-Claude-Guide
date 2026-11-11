// compare anchor hrefs (main content, excluding header/footer) live vs Framer
const { chromium } = require('playwright');
const pages = process.argv.slice(2);
const norm = (h) => (h || '').replace(/^https?:\/\/(noverde-128\.webflow\.io|adaptable-event-041934\.framer\.app)/, '').replace(/\/$/, '').replace(/^\.\//, '/') || '/';
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
      res[k] = (await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => !a.closest('header,footer,.site-head,.site-foot,[data-framer-name="Header"],[data-framer-name^="Site Chrome"]')).map((a) => [a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), a.getAttribute('href'), a.target]))).map(([t, h, tg]) => t + ' -> ' + norm(h) + (tg ? ' [' + tg + ']' : ''));
      await p.close();
    }
    const L = res.L.map((x) => x.replace(/noverde/gi, 'verdova')), F = res.F;
    const onlyL = L.filter((x) => !F.includes(x)), onlyF = F.filter((x) => !L.includes(x));
    console.log('== ' + pg + ' (L' + L.length + ' F' + F.length + ')\n  only live: ' + onlyL.join(' | ') + '\n  only framer: ' + onlyF.join(' | '));
  }
  await b.close();
})();
