// details of a text and its clipping ancestors: node clipinfo.js <width> <page> <text-prefix>
const { chromium } = require('playwright');
const [W, pg, needle] = [+process.argv[2], process.argv[3], process.argv[4]];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate((needle) => {
    const all = [...document.querySelectorAll('h1,h2,h3,h4,p,div,span')].filter((x) => x.textContent.trim().startsWith(needle)); const e = all[all.length - 1];
    if (!e) return 'not found';
    e.scrollIntoView({ block: 'center' });
    const out = [];
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const cs = getComputedStyle(x); const q = x.getBoundingClientRect();
      out.push(`${x.tagName} ${(x.getAttribute('data-framer-name') || '').slice(0, 26)} y${Math.round(q.top)}..${Math.round(q.bottom)} x${Math.round(q.left)}..${Math.round(q.right)} ov:${cs.overflow} h:${cs.height} ws:${cs.whiteSpace} lh:${cs.lineHeight}`);
      if (out.length > 6) break;
    }
    const rg = document.createRange(); rg.selectNodeContents(e);
    const rs = [...rg.getClientRects()].map((q) => `${Math.round(q.top)}..${Math.round(q.bottom)}`);
    return out.join('\n') + '\nlines: ' + rs.join(' ');
  }, needle);
  console.log(r);
  await b.close();
})();
