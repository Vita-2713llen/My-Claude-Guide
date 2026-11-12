// when does the motion code boot? resource timings for esm.sh / framer chunks, time of html.vd-ready, FCP
const { chromium } = require('playwright');
const pg = process.argv[2] || '/services/reporting-and-disclosure';
(async () => {
  const b = await chromium.launch();
  for (let run = 0; run < 2; run++) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { const t0 = performance.now(); new MutationObserver(() => { if (document.documentElement.classList.contains('vd-ready') && !window.__vdReadyAt) window.__vdReadyAt = performance.now(); }).observe(document.documentElement, { attributes: true }); });
    await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' });
    await p.waitForTimeout(3500);
    const r = await p.evaluate(() => {
      const res = performance.getEntriesByType('resource').filter((e) => /esm\.sh|framerusercontent|\.mjs/.test(e.name)).map((e) => `${Math.round(e.startTime)}-${Math.round(e.responseEnd)} ${e.name.replace(/^https?:\/\//, '').slice(0, 70)}`);
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { ready: Math.round(window.__vdReadyAt || -1), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: fcp && Math.round(fcp.startTime), res };
    });
    console.log(`run ${run}: FCP ${r.fcp}ms DCL ${r.dcl}ms load ${r.load}ms vd-ready ${r.ready}ms`);
    r.res.filter((x) => /esm\.sh/.test(x) || run === 0).slice(0, 30).forEach((x) => console.log('   ' + x));
    await ctx.close();
  }
  await b.close();
})();
