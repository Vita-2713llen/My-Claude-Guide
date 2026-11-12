// timeline of one text (opacity product, on-screen top, transforms of its 4 nearest ancestors) live vs Framer
const { chromium } = require('playwright');
const [W, pg, needle] = [+process.argv[2], process.argv[3], process.argv[4]];
const SITES = { live: (process.env.LIVE || 'https://noverde-128.webflow.io'), fr: (process.env.BASE || 'https://adaptable-event-041934.framer.app') };
(async () => { const b = await chromium.launch();
  for (const [k, u] of Object.entries(SITES)) { const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(u + pg, { waitUntil: 'commit' }); const t0 = Date.now(); let last = '';
    while (Date.now() - t0 < 3600) {
      const s = await p.evaluate((n) => { const all = [...document.querySelectorAll('p,div,span,h2,h3')].filter((x) => x.textContent.trim().toLowerCase().startsWith(n)); const e = all[all.length - 1]; if (!e) return '-';
        let op = 1; const tr = []; for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); op *= +cs.opacity; if (tr.length < 5 && cs.transform !== 'none') tr.push((x.getAttribute('data-framer-name') || x.className + '').slice(0, 18) + ':' + cs.transform.replace(/matrix\(|\)/g, '').split(',').map((v) => Math.round(+v * 100) / 100).join(',')); }
        return `op${op.toFixed(2)} top${Math.round(e.getBoundingClientRect().top)} ${tr.join(' | ')}`; }, needle).catch(() => 'err');
      if (s !== last) { console.log(k, Date.now() - t0, s); last = s; }
      await p.waitForTimeout(60);
    } await p.close(); }
  await b.close(); })();
