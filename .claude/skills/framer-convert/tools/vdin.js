// trace one element during load: [data-vd-in] mark, top, inline style — finds double load animations (edit the selector)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('https://adaptable-event-041934.framer.app/services', { waitUntil: 'commit' }); const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < 2500) { const s = await p.evaluate(() => { const e = [...document.querySelectorAll('[data-framer-name^="service-list-descr"]')].filter((x) => x.getBoundingClientRect().width > 0)[0]; if (!e) return 'none'; const r = e.getBoundingClientRect(); return `vdin=${e.closest('[data-vd-in]') ? 'anc' : e.querySelector('[data-vd-in]') ? 'desc' : 0} top=${Math.round(r.top)} ready=${document.documentElement.classList.contains('vd-ready')} st=${(e.getAttribute('style') || '').replace(/\s/g, '').slice(0, 60)} n=${document.querySelectorAll('[data-framer-name^="service-list-descr"]').length}`; }).catch(() => 'err'); if (s !== last) { console.log(Date.now() - t0, s); last = s; } await p.waitForTimeout(30); }
  await b.close(); })();
