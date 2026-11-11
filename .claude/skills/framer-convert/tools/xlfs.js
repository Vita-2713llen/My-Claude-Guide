// live Playfair texts: font-size at 1440 and 1920 -> xlfs.json { text: [fs1440, fs1920] }
const { chromium } = require('playwright'); const fs = require('fs');
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/services/esg-strategy', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const grab = () => {
  const m = {};
  document.querySelectorAll('body *').forEach((e) => {
    if (e.closest('.gsap_split_word') && !e.classList.contains('gsap_split_word')) return;
    const cs = getComputedStyle(e); if (!/Playfair/.test(cs.fontFamily)) return;
    // element owns direct text?
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); const split = e.querySelector('.gsap_split_word');
    if (!own && !split) return;
    const t = e.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 40); if (t.length < 2 || m[t]) return;
    m[t] = cs.fontSize;
  });
  return m;
};
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const pg of pages) {
    const r = {};
    for (const W of [1440, 1920]) {
      const p = await b.newPage({ viewport: { width: W, height: 1000 } });
      await p.goto('https://noverde-128.webflow.io' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1200);
      r[W] = await p.evaluate(grab); await p.close();
    }
    for (const [t, a] of Object.entries(r[1440])) if (r[1920][t]) out[t] = [parseFloat(a), parseFloat(r[1920][t])];
  }
  fs.writeFileSync('xlfs.json', JSON.stringify(out));
  const sc = Object.values(out).filter(([a, b]) => a !== b).length; console.log(Object.keys(out).length, 'texts;', sc, 'scale');
  await b.close();
})();
