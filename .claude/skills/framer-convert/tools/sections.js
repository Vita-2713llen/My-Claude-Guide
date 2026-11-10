// Top-level section heights live vs Framer at a width (matched by order of <section>/main children)
const { chromium } = require('playwright');
const [pg, W = '390'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const res = {};
  for (const [k, base] of [['L', 'https://noverde-128.webflow.io'], ['F', 'https://adaptable-event-041934.framer.app']]) {
    const p = await b.newPage({ viewport: { width: +W, height: 900 } });
    await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2000);
    res[k] = await p.evaluate((k) => {
      const secs = k === 'L' ? [...document.querySelectorAll('section, footer')] : [...document.querySelectorAll('[data-framer-name]')].filter((e) => /^(section|footer)\b/.test(e.getAttribute('data-framer-name')) || /^section /.test(e.getAttribute('data-framer-name')));
      const top = secs.filter((s) => !secs.some((o) => o !== s && o.contains(s)));
      return top.map((s) => { const r = s.getBoundingClientRect(); const first = (k === 'L' ? s.className : s.getAttribute('data-framer-name')).toString().slice(0, 34); const inner = s.querySelector(k === 'L' ? '[class*="-in"],[class*=container]' : '[data-framer-name]'); return first + ' :: ' + (inner ? (k === 'L' ? inner.className : inner.getAttribute('data-framer-name')).toString().split(' ')[0].slice(0, 24) : '') + ' h' + Math.round(r.height); });
    }, k);
    await p.close();
  }
  const n = Math.max(res.L.length, res.F.length);
  for (let i = 0; i < n; i++) console.log((res.L[i] || '').padEnd(70) + ' | ' + (res.F[i] || ''));
  await b.close();
})();
