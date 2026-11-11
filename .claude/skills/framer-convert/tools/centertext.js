// headings/leads centred on live but not on Framer (by text, same width)
const { chromium } = require('playwright');
const widths = (process.argv[2] || '360,390,768').split(',').map(Number);
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/licenses', '/changelog'];
const grab = () => { const W = innerWidth, o = {}; document.querySelectorAll('h1,h2,h3,h4,p').forEach((h) => { const t = h.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 40); if (t.length < 6 || t in o) return; const rg = document.createRange(); rg.selectNodeContents(h); const rs = [...rg.getClientRects()].filter((q) => q.width > 2); if (!rs.length) return; const L = Math.min(...rs.map((q) => q.left)), R = Math.max(...rs.map((q) => q.right)); if (R - L < 40 || L < -5 || R > W + 5) return; o[t] = (L + R) / 2 - W / 2; }); return o; };
(async () => { const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) { const res = {};
    for (const [k, u] of [['live', 'https://noverde-128.webflow.io'], ['fr', 'https://adaptable-event-041934.framer.app']]) { const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(u + pg, { waitUntil: 'load' }).catch(() => {}); const H = await p.evaluate(() => document.body.scrollHeight); const acc = {}; for (let y = 0; y < H; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(500); Object.assign(acc, await p.evaluate(grab)); } res[k] = acc; await p.close(); }
    const bad = Object.entries(res.live).filter(([t, v]) => Math.abs(v) < 4 && t in res.fr && Math.abs(res.fr[t]) > 8).map(([t]) => `"${t}" off ${res.fr[t].toFixed(0)}px`);
    if (bad.length) console.log(`== ${pg} @${W}\n   ` + bad.join('\n   ')); }
  await b.close(); })();
