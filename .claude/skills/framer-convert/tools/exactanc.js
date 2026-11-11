const { chromium } = require('playwright');
const [W, pg, t, site = 'fr'] = process.argv.slice(2);
const U = site === 'live' ? 'https://noverde-128.webflow.io' : 'https://adaptable-event-041934.framer.app';
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: 900 } });
await p.goto(U + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
console.log(await p.evaluate((t) => { const e = [...document.querySelectorAll('body *')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === t)); const o = []; for (let x = e; x && o.length < 6; x = x.parentElement) { const r = x.getBoundingClientRect(); const cs = getComputedStyle(x); o.push(`${(x.getAttribute('data-framer-name') || x.className || x.tagName).toString().slice(0, 30)} w${r.width.toFixed(1)} css-w:${cs.width} pad:${cs.padding} gap:${cs.gap} disp:${cs.display}`); } return o.join('\n'); }, t)); await b.close(); })();
