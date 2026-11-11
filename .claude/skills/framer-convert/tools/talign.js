// text-align mismatches live vs Framer (h1-h4, p) at a width, all pages
const { chromium } = require('playwright');
const W = +(process.argv[2] || 360);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const grab = () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/noverde/g, 'verdova').slice(0, 40);
  const m = {};
  [...document.querySelectorAll('h1,h2,h3,h4,p')].forEach((e) => {
    if (e.getBoundingClientRect().width < 1 || e.closest('[data-framer-name^="Mobile"],[data-framer-name="Top"],[data-framer-name="Scrolled"],.site-head')) return;
    const t = norm(e.textContent); if (t.length < 3 || m[t]) return;
    let ta = getComputedStyle(e).textAlign; if (ta === 'start') ta = 'left'; if (ta === 'end') ta = 'right';
    const lines = Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || 20));
    m[t] = ta + (lines > 1 ? '' : '1'); // single-line text: alignment only matters if box wider than text
  });
  return m;
};
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const res = {};
    for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
      const p = await b.newPage({ viewport: { width: W, height: 800 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(1500); res[k] = await p.evaluate(grab); await p.close();
    }
    const out = Object.entries(res.L).filter(([t, a]) => res.F[t] && res.F[t].replace('1', '') !== a.replace('1', '')).map(([t, a]) => `   ${a} -> F ${res.F[t]}  "${t}"`);
    if (out.length) console.log(`== ${pg} @${W}\n` + out.join('\n'));
  }
  await b.close();
})();
