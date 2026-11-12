// Mobile menu QA: every item clickable + navigates; All Pages expands reliably; every sub-link navigates
// node burgertest.js <width> <repeats>
const { chromium } = require('playwright');
const W = +(process.argv[2] || 390), REP = +(process.argv[3] || 10);
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: 800 } });
  const centre = (name, text) => p.evaluate(([n, t]) => {
    const e = [...document.querySelectorAll(`[data-framer-name="${n}"]`)].find((x) => x.getBoundingClientRect().width > 0 && (!t || x.textContent.includes(t)));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 };
  }, [name, text]);
  const openMenu = async (pg) => { await p.goto(BASE + pg, { waitUntil: 'load' }); await p.waitForTimeout(1300); const c = await centre('Burger'); await p.mouse.click(c.x, c.y); await p.waitForTimeout(900); };
  const listShown = () => p.evaluate(() => { const l = [...document.querySelectorAll('[data-framer-name="Pages list"]')].find((x) => x.getBoundingClientRect().height > 20); return l ? [...l.querySelectorAll('a')].map((a) => a.textContent.trim() + '|' + a.getAttribute('href')) : null; });
  // 1) All Pages reliability
  let ok = 0, links = null;
  for (let i = 0; i < REP; i++) {
    await openMenu(i % 2 ? '/pricing' : '/');
    const c = await centre('Drawer link', 'All Pages'); await p.mouse.click(c.x, c.y); await p.waitForTimeout(700);
    const l = await listShown(); if (l && l.length) { ok++; links = l; }
  }
  console.log(`All Pages expands: ${ok}/${REP}`);
  // collapse toggles back
  const c2 = await centre('Drawer link', 'All Pages'); await p.mouse.click(c2.x, c2.y); await p.waitForTimeout(600);
  console.log('second tap collapses:', !(await listShown()));
  await p.mouse.click(c2.x, c2.y); await p.waitForTimeout(600);
  await p.screenshot({ path: 'shots/burger-open-list.png' });
  // 2) every sub-link navigates (scroll inside drawer if needed)
  if (links) {
    let bad = [];
    for (const l of links) {
      const [txt, href] = l.split('|');
      await openMenu('/pricing');
      const c = await centre('Drawer link', 'All Pages'); await p.mouse.click(c.x, c.y); await p.waitForTimeout(600);
      const esc = txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const loc = p.locator('[data-framer-name="Pages list"] a').filter({ hasText: new RegExp('^\\s*' + esc + '\\s*$') }).first();
      let bb = await loc.boundingBox();
      for (let k = 0; k < 12 && bb && bb.y + bb.height > 790; k++) { await p.mouse.move(200, 500); await p.mouse.wheel(0, 250); await p.waitForTimeout(250); bb = await loc.boundingBox(); }
      if (!bb || bb.y < 0 || bb.y + bb.height > 800) { bad.push(txt + ' (not reachable)'); continue; }
      await p.mouse.click(bb.x + Math.min(bb.width / 2, 100), bb.y + bb.height / 2); await p.waitForTimeout(1500);
      const path = await p.evaluate(() => location.pathname);
      const want = href.replace(/^\.\//, '/').replace(/^\/$/, '/');
      if (path.replace(/\/$/, '') !== want.replace(/\/$/, '') ) bad.push(`${txt}: want ${want} got ${path}`);
    }
    console.log(`sub-links: ${links.length - bad.length}/${links.length} ok` + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
  }
  // 3) top-level items
  for (const t of ['Verdova', 'Home', 'About', 'Services', 'Our Impact', 'Book a consultation']) {
    await openMenu('/pricing');
    const pos = await p.evaluate((t) => { const e = [...document.querySelectorAll('body *')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === t) && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, t);
    if (!pos) { console.log(`"${t}" not visible`); continue; }
    await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(1500);
    console.log(`"${t}" -> ${await p.evaluate(() => location.pathname)}`);
  }
  // 4) close button
  await openMenu('/pricing'); const cb = await centre('Burger'); await p.mouse.click(cb.x, cb.y); await p.waitForTimeout(900);
  console.log('close ->', await p.evaluate(() => document.querySelector('header').getAttribute('data-framer-name')));
  await b.close();
})();
