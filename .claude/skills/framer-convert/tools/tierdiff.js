// live: compare 1440 vs W for max-width / padding (by class) and Playfair font sizes (by text). -> tier-W.json
const { chromium } = require('playwright'); const fs = require('fs');
const W = +(process.argv[2] || 1280);
const pages = ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const grab = () => {
  const mw = {}, pad = {}, fsz = {};
  document.querySelectorAll('[class]').forEach((e) => {
    if (typeof e.className !== 'string') return; const k = e.className.trim(); const cs = getComputedStyle(e);
    if (cs.maxWidth !== 'none' && !(k in mw)) mw[k] = cs.maxWidth;
    if (/^section\b/.test(k) && !(k in pad)) pad[k] = cs.paddingTop + ' ' + cs.paddingBottom;
    if (/Playfair/.test(cs.fontFamily) && ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.querySelector('.gsap_split_word'))) {
      const t = e.textContent.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova').toLowerCase().slice(0, 40); if (t.length > 8 && !(t in fsz)) fsz[t] = parseFloat(cs.fontSize);
    }
  });
  return { mw, pad, fsz };
};
(async () => {
  const b = await chromium.launch(); const MW = {}, PAD = {}, FS = {};
  for (const pg of pages) {
    const r = {};
    for (const w of [1440, W]) { const p = await b.newPage({ viewport: { width: w, height: 1000 } }); await p.goto('https://noverde-128.webflow.io' + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(900); r[w] = await p.evaluate(grab); await p.close(); }
    for (const [k, v] of Object.entries(r[W].mw)) if (r[1440].mw[k] && r[1440].mw[k] !== v) MW[k] = [r[1440].mw[k], v];
    for (const [k, v] of Object.entries(r[W].pad)) if (r[1440].pad[k] && r[1440].pad[k] !== v) PAD[k] = [r[1440].pad[k], v];
    for (const [t, v] of Object.entries(r[W].fsz)) if (r[1440].fsz[t]) FS[t] = [r[1440].fsz[t], v];
  }
  fs.writeFileSync('tier-' + W + '.json', JSON.stringify({ MW, PAD, FS }));
  console.log('MW'); Object.entries(MW).forEach(([k, v]) => console.log('  ' + k + ' : ' + v.join(' -> ')));
  console.log('PAD'); Object.entries(PAD).forEach(([k, v]) => console.log('  ' + k + ' : ' + v.join(' -> ')));
  const ch = Object.values(FS).filter(([a, b]) => a !== b).length; console.log('FS texts', Object.keys(FS).length, 'changed', ch);
  await b.close();
})();
