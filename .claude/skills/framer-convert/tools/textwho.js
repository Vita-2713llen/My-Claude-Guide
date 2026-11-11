// For given page/width and text snippets: show element class/name chain + font props live vs Framer
const { chromium } = require('playwright');
const [pg, W, ...texts] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1800);
    const r = await p.evaluate((texts) => texts.map((t) => {
      const els = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().toLowerCase().replace(/noverde/g, 'verdova').startsWith(t.toLowerCase())));
      return t + ' -> ' + els.slice(0, 3).map((e) => { const c = getComputedStyle(e); let chain = []; let x = e; for (let i = 0; i < 4 && x; i++) { chain.push(((x.getAttribute && x.getAttribute('data-framer-name')) || x.className || x.tagName).toString().split(' ')[0].slice(0, 22)); x = x.parentElement; } return '[' + chain.join('<') + '] ' + [c.fontSize, c.lineHeight, c.letterSpacing, c.fontWeight, c.textTransform].join(' '); }).join('  ##  ');
    }), texts);
    console.log(k + '\n  ' + r.join('\n  ')); await p.close();
  }
  await b.close();
})();
