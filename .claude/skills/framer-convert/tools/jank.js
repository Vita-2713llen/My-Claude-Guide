// smooth wheel-scroll through a page, record rAF frame intervals + long tasks + ScrollTrigger refresh count
const { chromium } = require('playwright');
const [pg = '/'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); 
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); await p.waitForTimeout(3000);
    await p.evaluate(() => { window.__f = []; window.__lt = 0; window.__rf = 0; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lt += e.duration; })).observe({ type: 'longtask', buffered: false }); } catch (e) {}
      const ST = window.ScrollTrigger; if (ST && ST.addEventListener) ST.addEventListener('refresh', () => window.__rf++); });
    for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(50); }
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => { const f = window.__f.slice(5); const s = [...f].sort((a, b) => a - b); return { frames: f.length, p50: s[Math.floor(s.length * 0.5)].toFixed(1), p95: s[Math.floor(s.length * 0.95)].toFixed(1), over33: f.filter((x) => x > 33).length, max: Math.max(...f).toFixed(0), longTaskMs: Math.round(window.__lt), stRefresh: window.__rf, y: scrollY }; });
    console.log(k, pg, JSON.stringify(r)); await p.close();
  }
  await b.close();
})();
