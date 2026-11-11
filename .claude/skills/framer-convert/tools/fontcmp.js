// compare computed font of texts (by exact text) live vs Framer: node fontcmp.js <W> <page> <text>...
const { chromium } = require('playwright');
const [W, pg, ...texts] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, u] of [['live', 'https://noverde-128.webflow.io'], ['fr', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(u + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const r = await p.evaluate((texts) => texts.map((t) => {
      const e = [...document.querySelectorAll('body *')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === t));
      if (!e) return t + ': nf';
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return `${t}: fs ${cs.fontSize} lh ${cs.lineHeight} ls ${cs.letterSpacing} fw ${cs.fontWeight} ff ${cs.fontFamily.slice(0, 20)} ws ${cs.whiteSpace} w${Math.round(r.width)} h${Math.round(r.height)} feat ${cs.fontFeatureSettings} num ${cs.fontVariantNumeric}`;
    }), texts);
    console.log(k + '\n  ' + r.join('\n  '));
    await p.close();
  }
  await b.close();
})();
