// open the mobile menu -> All Pages at 360x730; check nothing is clipped, CTA visible, list scrolls
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 730], [390, 844], [360, 560]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: 1 }); const p = await ctx.newPage();
    await p.goto('https://adaptable-event-041934.framer.app/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
    await p.locator('[data-framer-name="Burger"]').first().click({ force: true }); await p.waitForTimeout(900);
    const ap = p.locator('[data-framer-name="Drawer link"]', { hasText: 'All Pages' }).first();
    await ap.click({ force: true }); await p.waitForTimeout(1200);
    const info = await p.evaluate(() => {
      const root = document.querySelector('[data-framer-name="Mobile Pages"]'); if (!root) return 'no Mobile Pages';
      const R = (e) => e.getBoundingClientRect();
      const list = root.querySelector('[data-framer-name="Pages list"]'), cta = root.querySelector('[data-framer-name="Drawer CTA"]');
      return { root: Math.round(R(root).height), vh: innerHeight, list: Math.round(R(list).height) + ' scrollH ' + list.scrollHeight + ' ovf ' + getComputedStyle(list).overflowY, ctaBottom: Math.round(R(cta).bottom), ctaTop: Math.round(R(cta).top) };
    });
    // scroll the list with the wheel and see it move
    const before = await p.evaluate(() => document.querySelector('[data-framer-name="Pages list"]').scrollTop);
    const lb = await p.locator('[data-framer-name="Pages list"]').first().boundingBox();
    await p.mouse.move(lb.x + 20, lb.y + 20); await p.mouse.wheel(0, 300); await p.waitForTimeout(600);
    const after = await p.evaluate(() => document.querySelector('[data-framer-name="Pages list"]').scrollTop);
    const items = await p.evaluate(() => [...document.querySelectorAll('[data-framer-name="Mobile Pages"] [data-framer-name="Pages list"] a')].map((a) => a.innerText.trim() + '=' + a.getAttribute('href')).join(', ')); console.log(items); console.log(W + 'x' + H, JSON.stringify(info), 'list scrollTop', before, '->', after);
    await p.screenshot({ path: `qcv/mobmenu-${W}x${H}.png` });
    await ctx.close();
  }
  await b.close();
})();
