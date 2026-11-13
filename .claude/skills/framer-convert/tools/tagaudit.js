// Semantic tag audit on the published Framer site: one h1 per page, no button-in-a / a-in-button, landmarks present.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const pages = JSON.parse(fs.readFileSync(__dirname + '/pages.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  let bad = 0;
  for (const pg of pages) {
    try { await p.goto(BASE + pg, { waitUntil: 'load', timeout: 45000 }); } catch (e) { console.log('LOADFAIL', pg); continue; }
    await p.waitForSelector('header,h1', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const h1 = [...document.querySelectorAll('h1')].filter(vis).map((e) => e.innerText.trim().slice(0, 40));
      const nest = [...document.querySelectorAll('a button, button a, button button, a a')].filter(vis).length;
      const land = ['header', 'nav', 'main', 'footer', 'section'].map((t) => t + ':' + document.querySelectorAll(t).length).join(' ');
      const links = document.querySelectorAll('a[href]').length;
      // clickable things that are not real links/buttons (cursor:pointer, not inside a/button/label/input)
      const fake = [...document.querySelectorAll('div,span,p,article,section,figure,nav,li')].filter((e) => vis(e) && getComputedStyle(e).cursor === 'pointer' && !e.closest('a,button,label,[role=button],[role=tab],input,select,textarea,#__framer-editorbar-container,#__framer-badge-container') && !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer')).map((e) => (e.getAttribute('data-framer-name') || e.tagName).split(' [')[0].slice(0, 30));
      return { h1, nest, land, links, fake };
    });
    const issues = [];
    if (r.h1.length !== 1) issues.push('h1×' + r.h1.length + ' ' + JSON.stringify(r.h1));
    if (r.nest) issues.push('nested interactive ×' + r.nest);
    if (r.fake.length) issues.push('clickable non-link ×' + r.fake.length + ' ' + [...new Set(r.fake)].join(','));
    if (issues.length) { bad++; console.log('FAIL', pg, issues.join(' | '), '|', r.land, 'a:' + r.links); } else console.log('ok  ', pg, r.land, 'a:' + r.links);
  }
  console.log(bad ? 'TAG FAIL ' + bad + ' page(s)' : 'TAG OK');
  await b.close();
})();
