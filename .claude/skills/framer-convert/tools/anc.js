// ancestors geometry for an element containing text: node anc.js <W> <page> <text> [site]
const { chromium } = require('playwright');
const [W, pg, txt, site = 'fr'] = process.argv.slice(2);
const U = site === 'live' ? 'https://noverde-128.webflow.io' : 'https://adaptable-event-041934.framer.app';
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: 800 } });
await p.goto(U + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
console.log(await p.evaluate((t) => { const e = [...document.querySelectorAll('body *')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(t))); const o = []; for (let x = e; x && o.length < 9; x = x.parentElement) { const r = x.getBoundingClientRect(); const cs = getComputedStyle(x); o.push(`${(x.getAttribute('data-framer-name') || x.className || x.tagName).toString().slice(0, 34)} x${Math.round(r.left)}..${Math.round(r.right)} w${Math.round(r.width)} h${Math.round(r.height)} css-w:${cs.width} maxw:${cs.maxWidth} pos:${cs.position} l:${cs.left} r:${cs.right} ov:${cs.overflow}`); } return o.join('\n'); }, txt));
await b.close(); })();
