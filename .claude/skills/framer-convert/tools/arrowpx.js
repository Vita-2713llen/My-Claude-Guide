// pixel-level centring of the chevron inside each slider arrow circle (ink = dark pixels), live vs Framer
const { chromium } = require('playwright');
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['/about-us', '/our-impact'];
(async () => {
  const b = await chromium.launch(); const ana = await b.newPage();
  const measure = async (buf) => ana.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) {
      const i = (y * c.width + X) * 4; const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      if (lum < 110) { minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const s = 2;
    return { dx: +(((minX + maxX) / 2 - (c.width - 1) / 2) / s).toFixed(2), dy: +(((minY + maxY) / 2 - (c.height - 1) / 2) / s).toFixed(2), w: +((maxX - minX + 1) / s).toFixed(1), h: +((maxY - minY + 1) / s).toFixed(1) };
  }, 'data:image/png;base64,' + buf.toString('base64'));
  for (const pg of pages) for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
    await p.goto(base + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const els = await p.$$('.w-slider-arrow-left, .w-slider-arrow-right, [data-framer-name~="w-slider-arrow-left"], [data-framer-name~="w-slider-arrow-right"]');
    const out = [];
    for (const e of els) {
      if (!(await e.boundingBox())) continue;
      await e.scrollIntoViewIfNeeded(); await p.mouse.move(1, 1); await p.waitForTimeout(700);
      const buf = await e.screenshot({ path: 'qcv/arr-' + pg.replace(/\W/g, '') + '-' + k + out.length + '.png' }); out.push(JSON.stringify(await measure(buf)));
      if (out.length === 2) break;
    }
    console.log(pg, k, out.join(' '));
    await ctx.close();
  }
  await b.close();
})();
