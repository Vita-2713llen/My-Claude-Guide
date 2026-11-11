// find blocks that scale with width on live (keep a ratio) but stay fixed in Framer. node ratioaudit.js <page...>
const { chromium } = require('playwright');
const pages = process.argv.slice(2);
const grab = () => {
  const m = {};
  document.querySelectorAll('[class],[data-framer-name]').forEach((e) => {
    const n = ((e.getAttribute('data-framer-name') || (typeof e.className === 'string' ? e.className : '')) + '').replace(/\s*\[data-[^\]]*\]+/g, '').trim(); if (!n || m[n]) return;
    const r = e.getBoundingClientRect(); if (r.height < 60 || r.width < 120) return; m[n] = [Math.round(r.width), Math.round(r.height), e.offsetHeight];
  });
  return m;
};
(async () => {
  const b = await chromium.launch();
  const load = async (u, W) => { const p = await b.newPage({ viewport: { width: W, height: 1000 } }); await p.goto(u, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); for (let y = 0; y < 12000; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(40); } await p.waitForTimeout(1200); const r = await p.evaluate(grab); await p.close(); return r; };
  for (const pg of pages) {
    const L14 = await load('https://noverde-128.webflow.io' + pg, 1440), L19 = await load('https://noverde-128.webflow.io' + pg, 1920), F19 = await load('https://adaptable-event-041934.framer.app' + pg, 1920);
    const out = [];
    for (const [n, [w1, h1, o1]] of Object.entries(L14)) {
      const l = L19[n], f = F19[n]; if (!l || !f) continue;
      if (Math.abs(l[2] - o1) > 4 && Math.abs(f[2] - l[2]) > 6) out.push(`   ${n.slice(0, 40)}  L1440 ${w1}x${o1} (r${(w1 / o1).toFixed(3)})  L1920 ${l[0]}x${l[2]} (r${(l[0] / l[2]).toFixed(3)})  F1920 ${f[0]}x${f[2]}`);
    }
    console.log('== ' + pg + '\n' + out.join('\n'));
  }
  await b.close();
})();
