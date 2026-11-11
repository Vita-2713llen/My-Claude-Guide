// screenshot around the element containing given text: node textshot.js <W> <page> <text> <out> [site=fr|live]
const { chromium } = require('playwright');
const [W, pg, txt, out, site = 'fr'] = process.argv.slice(2);
const U = site === 'live' ? 'https://noverde-128.webflow.io' : 'https://adaptable-event-041934.framer.app';
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: 900 } });
  await p.goto(U + pg, { waitUntil: 'load' }); const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 400) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
  const y = await p.evaluate((t) => { const nz = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase(); const e = [...document.querySelectorAll('body *')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(t))) || [...document.querySelectorAll('h1,h2,h3,h4,p')].find((x) => nz(x.textContent).startsWith(nz(t))); if (!e) return -1; const r = e.getBoundingClientRect(); return r.top + scrollY; }, txt);
  if (y < 0) { console.log('not found'); return b.close(); }
  await p.evaluate(([y, o]) => scrollTo(0, y - o), [y, +(process.env.OFF || 300)]); await p.waitForTimeout(1800);
  await p.screenshot({ path: out }); await b.close(); })();
