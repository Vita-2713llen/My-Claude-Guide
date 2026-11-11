// timeline trace during wheel scroll: total + max duration per main-thread event type, live vs Framer
const { chromium } = require('playwright');
const [pg = '/'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load' }); await p.waitForTimeout(3000);
    await b.startTracing(p, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
    for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(50); }
    await p.waitForTimeout(1200);
    const buf = await b.stopTracing();
    const ev = JSON.parse(buf.toString()).traceEvents.filter((e) => e.ph === 'X' && e.dur);
    // main renderer thread = thread with most RunTask
    const cnt = {}; ev.filter((e) => e.name === 'RunTask').forEach((e) => { cnt[e.pid + ':' + e.tid] = (cnt[e.pid + ':' + e.tid] || 0) + e.dur; });
    const main = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    const agg = {};
    ev.filter((e) => e.pid + ':' + e.tid === main && e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask').forEach((e) => { const a = agg[e.name] = agg[e.name] || [0, 0, 0]; a[0] += e.dur / 1000; a[1] = Math.max(a[1], e.dur / 1000); a[2]++; });
    const long = ev.filter((e) => e.pid + ':' + e.tid === main && e.name === 'RunTask' && e.dur > 50000).map((e) => Math.round(e.dur / 1000));
    console.log(k, pg, 'long tasks:', JSON.stringify(long));
    Object.entries(agg).sort((a, b) => b[1][0] - a[1][0]).slice(0, 14).forEach(([n, a]) => console.log('   ' + n.padEnd(34) + ' total ' + a[0].toFixed(0).padStart(5) + 'ms  max ' + a[1].toFixed(0).padStart(4) + 'ms  n' + a[2]));
    await p.close();
  }
  await b.close();
})();
