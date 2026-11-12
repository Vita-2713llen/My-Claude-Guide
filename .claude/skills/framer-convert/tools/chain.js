// computed width/white-space chain of a heading up to the section: node chain.js <w> <page> <text>
const { chromium } = require('playwright');
const [W, pg, needle] = [+process.argv[2], process.argv[3], process.argv[4]];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' }); await p.waitForTimeout(2000);
  console.log(await p.evaluate((n) => {
    const e = [...document.querySelectorAll('h1,h2,h3')].find((x) => x.textContent.toLowerCase().includes(n)); if (!e) return 'nf';
    const o = []; for (let x = e; x && o.length < 7; x = x.parentElement) { const c = getComputedStyle(x); o.push(`${x.tagName} ${(x.getAttribute('data-framer-name') || x.className).toString().slice(0, 30)} w=${c.width} ws=${c.whiteSpace} max=${c.maxWidth} flex=${c.flex} wcss=${x.style.width}`); }
    return o.join('\n');
  }, needle));
  await b.close();
})();
