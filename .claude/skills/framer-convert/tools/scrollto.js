// scroll gradually to a text, then report its opacity chain live vs Framer
const { chromium } = require('playwright');
const [W, pg, needle] = [+process.argv[2], process.argv[3], process.argv[4].toLowerCase()];
(async () => { const b = await chromium.launch();
  for (const [k, u] of [['live', (process.env.LIVE || 'https://noverde-128.webflow.io')], ['fr', (process.env.BASE || 'https://adaptable-event-041934.framer.app')]]) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(u + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const y = await p.evaluate((n) => { const e = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.toLowerCase().includes(n))).pop(); return e ? e.getBoundingClientRect().top + scrollY - 450 : -1; }, needle);
    for (let s = 0; s <= y; s += 250) { await p.mouse.wheel(0, 250); await p.waitForTimeout(70); }
    await p.waitForTimeout(2000);
    console.log(k, 'y', Math.round(y), await p.evaluate((n) => { const e = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.toLowerCase().includes(n))).pop(); const o = []; for (let x = e; x && x !== document.body && o.length < 7; x = x.parentElement) { const c = getComputedStyle(x); o.push(`${(x.getAttribute('data-framer-name') || x.className || x.tagName).toString().slice(0, 30)} op${c.opacity}`); } return 'top' + Math.round(e.getBoundingClientRect().top) + ' ' + o.join(' < '); }, needle));
    await p.close(); }
  await b.close(); })();
