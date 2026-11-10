// For each CMS template: texts that are item-specific on live (differ between two slugs) must appear on our page for the same slug
const { chromium } = require('playwright');
const L = 'https://noverde-128.webflow.io', F = 'https://adaptable-event-041934.framer.app';
const sets = [['/team/tess-okonkwo', '/team/priya-raman'], ['/services/carbon-footprint', '/services/renewable-energy'], ['/our-impact/reforestation', '/our-impact/clean-energy'], ['/blog/diversion-rates-are-over-claimed', '/blog/the-emission-factor-you-cite']];
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/noverde/gi, 'verdova');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const texts = async (url) => { await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1200);
    return p.evaluate(() => { const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t.length > 2 && !n.parentElement.closest('script,style,noscript')) out.add(t); } return [...out]; }); };
  const imgs = async () => p.evaluate(() => [...document.querySelectorAll('img')].map((i) => (i.currentSrc || i.src).split('/').pop().split('?')[0]).concat([...document.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).filter((x) => x && x !== 'none').map((x) => x.split('/').pop().split('?')[0])));
  for (const [a, c] of sets) {
    const la = (await texts(L + a)).map(norm), lc = new Set((await texts(L + c)).map(norm));
    const fa = (await texts(F + a)).map(norm); const fjoin = ' ' + fa.join(' ') + ' ';
    const specific = la.filter((t) => !lc.has(t));
    const missing = specific.filter((t) => !fjoin.includes(t) && !fjoin.replace(/\s/g, '').includes(t.replace(/\s/g, '')));
    console.log('\n## ' + a + '  item-specific ' + specific.length + ', missing on Framer ' + missing.length);
    missing.slice(0, 25).forEach((t) => console.log('   - ' + t.slice(0, 110)));
  }
  await b.close();
})();
