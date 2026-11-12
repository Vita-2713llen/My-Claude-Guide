// CLICK AUDIT — every accordion / toggle / tab that does something on live must do the same in Framer.
// For each page: on live, collect clickable classes (question heads, asks, toggles, tabs, dropdowns), click the first
// element of each class and measure what changes (page height, the item's own height). Then click the Framer element
// whose data-framer-name contains the same class word and compare. Reports DEAD (live reacts, Framer does not).
// node clickaudit.js <width> [pages…]   (pages default: pages.json)   env: BASE, LIVE
const { chromium } = require('playwright'); const fs = require('fs');
const W = +(process.argv[2] || 1440);
let pages = process.argv.slice(3);
if (!pages.length) pages = fs.existsSync(__dirname + '/pages.json') ? JSON.parse(fs.readFileSync(__dirname + '/pages.json')) : ['/'];
const FR = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const LIVE = process.env.LIVE || 'https://noverde-128.webflow.io';
const RX = /(question-head|question|-ask\b|toggle|accordion|faq|tab-link|drop-trigger|-opt\b|-switch|expand|more-button)/;
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(LIVE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1200);
    const classes = await p.evaluate((src) => { const rx = new RegExp(src); const out = new Set();
      for (const e of document.querySelectorAll('body *')) { if (e.closest('nav,header,.w-nav,[class*="head-"]')) continue; const c = (e.className && e.className.baseVal === undefined ? e.className : '').split(/\s+/)[0]; if (!c || !rx.test(c)) continue; const r = e.getBoundingClientRect(); if (r.width < 20 || r.height < 14 || getComputedStyle(e).cursor !== 'pointer') continue; out.add(c); }
      return [...out]; }, RX.source);
    const res = [];
    for (const cls of classes) {
      const measure = async (page, sel) => {
        const loc = page.locator(sel).first(); if (!(await loc.count())) return null;
        await loc.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(700);
        const snap = () => page.evaluate((sel) => { const e = document.querySelector(sel); const h = (x) => (x ? x.getBoundingClientRect().height : 0); const box = h(e.parentElement) + h(e.parentElement && e.parentElement.parentElement); return [document.body.scrollHeight, Math.round(box), e.getAttribute('aria-expanded') || '', e.className.toString().includes('w--current') || e.className.toString().includes('w--open')]; }, sel);
        const a = await snap(); const bb = await loc.boundingBox(); if (!bb) return null;
        await page.mouse.click(bb.x + Math.min(20, bb.width / 2), bb.y + bb.height / 2); await page.waitForTimeout(900);
        const c = await snap(); return { dh: c[0] - a[0], dbox: c[1] - a[1], aria: a[2] + '→' + c[2] };
      };
      const lv = await measure(p, '.' + cls).catch(() => null);
      if (!lv || (Math.abs(lv.dh) < 8 && Math.abs(lv.dbox) < 8)) continue; // live: nothing measurable
      const f = await b.newPage({ viewport: { width: W, height: 900 } });
      await f.goto(FR + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await f.waitForTimeout(2200);
      const fr = await measure(f, `[data-framer-name~="${cls}"]`).catch(() => null);
      await f.close();
      const tag = !fr ? 'MISSING' : (Math.abs(fr.dh) < 8 && Math.abs(fr.dbox) < 8) ? 'DEAD' : 'ok';
      res.push(`   ${tag.padEnd(7)} .${cls}  live dh${lv.dh}/box${lv.dbox}  framer ${fr ? `dh${fr.dh}/box${fr.dbox}` : '-'}`);
    }
    await p.close();
    if (process.env.VERBOSE ? res.length : res.some((r) => !/^\s+ok/.test(r))) console.log(`== ${pg} @${W}\n` + res.join('\n'));
  }
  console.log('clickaudit: done', W, pages.length, 'pages');
  await b.close();
})();
