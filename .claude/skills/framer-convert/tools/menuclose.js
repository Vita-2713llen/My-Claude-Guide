// tap a burger link at <w>: the menu must close (header back to Mobile 77px) — node menuclose.js 992
const { chromium } = require('playwright');
const W = +(process.argv[2] || 992);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 730 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + '/', { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const burger = await p.evaluate(() => { const c = [...document.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < 70 && r.right > innerWidth - 60 && r.width > 20 && r.width < 60 && r.height > 15 && r.height < 60 && getComputedStyle(e).cursor === 'pointer'; }); const e = c[0]; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: e.getAttribute('data-framer-name'), html: e.outerHTML.slice(0, 200) }; });
  console.log('burger', JSON.stringify(burger));
  await p.mouse.click(burger.x, burger.y); await p.waitForTimeout(1000);
  const st = async () => p.evaluate(() => [...document.querySelectorAll('[data-framer-name^="Mobile"],[data-framer-name="Top"],[data-framer-name="Scrolled"]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getAttribute('data-framer-name') + ':' + Math.round(e.getBoundingClientRect().height)).join(','));
  console.log('open:', await st());
  const close = await p.evaluate(() => { const c = [...document.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < 70 && r.right > innerWidth - 60 && r.width > 20 && r.width < 60 && r.height > 15 && r.height < 60 && getComputedStyle(e).cursor === 'pointer'; }); return c.map((e) => (e.getAttribute('data-framer-name') || e.tagName) + ' ' + (e.className || '').toString().slice(0, 40)).join(' | '); });
  console.log('close candidates:', close);
  const ab = await p.evaluate(() => { const a = [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'About' && a.getBoundingClientRect().top > 60 && a.getBoundingClientRect().width > 0); const r = a.getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2, a.getAttribute('href')]; });
  await p.mouse.click(ab[0], ab[1]); await p.waitForTimeout(2000);
  console.log('after link click', new URL(p.url()).pathname, await st());
  await b.close(); })();
