const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: 360, height: 900 } });
    await p.goto(base + '/our-impact', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    console.log(k, await p.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2')].find((e) => /The year/.test(e.textContent)); const s = getComputedStyle(h);
      const fam = s.fontFamily;
      const probe = (extra) => { const sp = document.createElement('span'); sp.textContent = 'The year, exactly as the weighbridge saw it'; Object.assign(sp.style, { fontFamily: fam, fontSize: '40px', letterSpacing: '-0.4px', whiteSpace: 'nowrap', position: 'absolute', top: '-999px' }, extra); document.body.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return Math.round(w); };
      return 'ovs:' + s.fontVariationSettings + ' opt:' + s.fontOpticalSizing + ' stretch:' + s.fontStretch + ' kern:' + s.fontKerning + ' | w auto ' + probe({}) + ' opt-none ' + probe({ fontOpticalSizing: 'none' }) + " opsz12 " + probe({ fontVariationSettings: '"opsz" 12' }) + " opsz40 " + probe({ fontVariationSettings: '"opsz" 40' }) + " opsz144 " + probe({ fontVariationSettings: '"opsz" 144' }) + ' fonts:' + [...document.fonts].filter((f) => /playfair/i.test(f.family)).map((f) => f.family + ' ' + f.weight + ' ' + f.stretch + ' ' + f.status).slice(0, 3).join(';');
    }));
    await p.close();
  }
  await b.close();
})();
