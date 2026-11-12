// where is a text on live vs Framer after load: node where.js <w> <page> <text> [delayMs]
const { chromium } = require('playwright');
const [W, pg, needle, d] = [+process.argv[2], process.argv[3], process.argv[4].toLowerCase(), +(process.argv[5] || 3000)];
(async () => { const b = await chromium.launch();
  for (const [k, u] of [['live', (process.env.LIVE || 'https://noverde-128.webflow.io')], ['fr', (process.env.BASE || 'https://adaptable-event-041934.framer.app')]]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(u + pg, { waitUntil: 'load' }); await p.waitForTimeout(d);
    console.log(k, await p.evaluate((n) => [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.toLowerCase().includes(n))).map((e) => { const r = e.getBoundingClientRect(); let op = 1, vis = getComputedStyle(e).visibility, disp = ''; for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); op *= +c.opacity; if (c.display === 'none') disp = 'NONE:' + (x.getAttribute('data-framer-name') || x.className).toString().slice(0, 30); } return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} op${op.toFixed(2)} ${vis} ${disp}`; }).join(' | '), needle));
    await p.close(); }
  await b.close(); })();
