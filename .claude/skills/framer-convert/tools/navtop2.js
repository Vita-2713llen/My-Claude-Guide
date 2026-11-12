const { chromium } = require('playwright');
const W = +(process.argv[2] || 1440);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  for (const [pg, sel] of [['/', 'nav a:has-text("About")'], ['/services', 'a:has-text("About")'], ['/about-us', 'a:has-text("Services")']]) {
    await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    await p.mouse.move(500, 400); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 600); await p.waitForTimeout(40); }
    await p.waitForTimeout(300); // still gliding
    // desktop: a header link; below 992 the header links live in the burger, so scroll to the footer and use its links
    if (W < 992) { await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(1200); }
    const links = await p.evaluate((W) => [...document.querySelectorAll('a')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && a.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) && (W < 992 ? r.top > 0 && r.bottom < innerHeight : r.top > 0 && r.top < 120); }).map((a) => a.textContent.trim() + '|' + a.getAttribute('href')), W);
    const target = links.find((l) => /^(About|About Us|Services|Pricing|Team)\|/i.test(l) && !l.toLowerCase().includes(pg === '/' ? '|/#' : '|.' + pg));
    const txt = target && target.split('|')[0];
    const before = await p.evaluate(() => scrollY);
    const pt = await p.evaluate(([txt, W]) => { const a = [...document.querySelectorAll('a')].reverse().find((a) => { const r = a.getBoundingClientRect(); return a.textContent.trim().toLowerCase() === (txt || '').toLowerCase() && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && a.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [txt, W]);
    if (pt) await p.mouse.click(pt[0], pt[1]); else console.log('click fail: no visible link', txt);
    const ys = []; for (const t of [100, 300, 600, 1000, 2000, 3500]) { await p.waitForTimeout(t - (ys.length ? [100, 300, 600, 1000, 2000, 3500][ys.length - 1] : 0)); ys.push(await p.evaluate(() => location.pathname + ':' + Math.round(scrollY))); }
    console.log(`${pg} y${before} click ${txt} -> ${ys.join('  ')}`);
  }
  await b.close(); })();
