// derive the >=1920 tier: live max-width + font-size changes 1440 -> 1920, mapped to Framer names / preset classes
const { chromium } = require('playwright');
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const grabLive = () => {
  const mw = {}, fs = {};
  document.querySelectorAll('[class]').forEach((e) => {
    if (typeof e.className !== 'string') return; const cs = getComputedStyle(e); const k = e.className.trim();
    if (cs.maxWidth !== 'none' && !(k in mw)) mw[k] = cs.maxWidth;
    if (e.children.length === 0 && e.textContent.trim().length > 2) { const t = e.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').slice(0, 30).toLowerCase(); if (!(t in fs)) fs[t] = cs.fontSize + '|' + cs.letterSpacing + '|' + cs.lineHeight; }
  });
  // headings split by gsap: use heading text
  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,div').forEach((e) => { const t = e.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').slice(0, 30).toLowerCase(); if (t.length > 2 && /^H/.test(e.tagName) && !(t in fs)) fs[t] = getComputedStyle(e).fontSize + '|' + getComputedStyle(e).letterSpacing + '|' + getComputedStyle(e).lineHeight; });
  return { mw, fs };
};
const grabF = () => {
  const map = {};
  document.querySelectorAll('[class*="framer-styles-preset-"]').forEach((e) => {
    const t = e.textContent.replace(/\s+/g, ' ').trim().slice(0, 30).toLowerCase(); if (t.length < 3 || map[t]) return;
    const c = [...e.classList].find((x) => x.startsWith('framer-styles-preset-')); map[t] = c + '|' + getComputedStyle(e).fontSize;
  });
  return map;
};
(async () => {
  const b = await chromium.launch(); const MW = {}, PRE = {};
  for (const pg of pages) {
    const r = {};
    for (const W of [1440, 1920]) {
      const p = await b.newPage({ viewport: { width: W, height: 1000 } });
      await p.goto('https://noverde-128.webflow.io' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800);
      r[W] = await p.evaluate(grabLive); await p.close();
    }
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await p.goto('https://adaptable-event-041934.framer.app' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800);
    const fm = await p.evaluate(grabF); await p.close();
    for (const [k, v] of Object.entries(r[1920].mw)) if (r[1440].mw[k] && r[1440].mw[k] !== v) MW[k] = r[1440].mw[k] + ' -> ' + v;
    for (const [t, v] of Object.entries(r[1920].fs)) { const a = r[1440].fs[t]; if (a && a !== v && fm[t]) { const [cls, ffs] = fm[t].split('|'); const key = cls; (PRE[key] = PRE[key] || new Set()).add(a + ' -> ' + v + ' (F ' + ffs + ') "' + t + '"'); } }
  }
  console.log('MAXWIDTH'); Object.entries(MW).forEach(([k, v]) => console.log('  ' + k + ' : ' + v));
  console.log('PRESETS'); Object.entries(PRE).forEach(([k, v]) => console.log('  ' + k + '\n     ' + [...v].slice(0, 3).join('\n     ')));
  await b.close();
})();
