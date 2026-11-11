const { chromium } = require('playwright');
const W = +(process.argv[2] || 1440);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  for (const [pg, sel] of [['/', 'nav a:has-text("About")'], ['/services', 'a:has-text("About")'], ['/about-us', 'a:has-text("Services")']]) {
    await p.goto('https://adaptable-event-041934.framer.app' + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    await p.mouse.move(500, 400); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 600); await p.waitForTimeout(40); }
    await p.waitForTimeout(300); // still gliding
    const links = await p.evaluate(() => [...document.querySelectorAll('a')].filter((a) => { const r = a.getBoundingClientRect(); return r.top > 0 && r.top < 120 && r.width > 0; }).map((a) => a.textContent.trim() + '|' + a.getAttribute('href')));
    const target = links.find((l) => /^(About|Services)/i.test(l) && !l.startsWith(pg === '/about-us' ? 'About' : 'Services'));
    const txt = target && target.split('|')[0];
    const before = await p.evaluate(() => scrollY);
    const el = p.locator('a').filter({ hasText: new RegExp('^' + txt + '$', 'i') }).first();
    await el.click({ timeout: 5000 }).catch((e) => console.log('click fail', e.message.slice(0, 80)));
    const ys = []; for (const t of [100, 300, 600, 1000, 2000, 3500]) { await p.waitForTimeout(t - (ys.length ? [100, 300, 600, 1000, 2000, 3500][ys.length - 1] : 0)); ys.push(await p.evaluate(() => location.pathname + ':' + Math.round(scrollY))); }
    console.log(`${pg} y${before} click ${txt} -> ${ys.join('  ')}`);
  }
  await b.close(); })();
