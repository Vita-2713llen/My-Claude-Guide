// wide-screen centring audit: every max-width container must sit centred in its parent. node centeraudit.js <W> [pages...]
const { chromium } = require('playwright');
const W = +(process.argv[2] || 1920);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 1000 } });
    await p.goto('https://adaptable-event-041934.framer.app' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(50); }
    await p.waitForTimeout(1500);
    const bad = await p.evaluate((W) => {
      const out = [];
      document.querySelectorAll('[data-framer-name]').forEach((e) => {
        const cs = getComputedStyle(e); if (cs.maxWidth === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return;
        const r = e.getBoundingClientRect(); if (r.width < 600 || r.height < 1) return;
        const par = e.parentElement; const pr = par.getBoundingClientRect(); const pcs = getComputedStyle(par);
        const inner = pr.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
        if (inner - r.width < 20) return; // fills parent
        const left = r.left - pr.left - parseFloat(pcs.paddingLeft); const right = inner - r.width - left;
        if (Math.abs(left - right) > 6) out.push(`${(e.getAttribute('data-framer-name') || '').slice(0, 40)} w${Math.round(r.width)} mw${cs.maxWidth} L${Math.round(left)} R${Math.round(right)} parent:${(par.getAttribute('data-framer-name') || par.tagName).slice(0, 30)}`);
      });
      return [...new Set(out)];
    }, W);
    if (bad.length) console.log(`== ${pg} @${W}\n   ` + bad.join('\n   '));
    await p.close();
  }
  await b.close();
})();
