// what is on the first screen during the first 1.5s: per sample, the visible texts (opacity product, rect) and whether vd-in was set
const { chromium } = require('playwright');
const [W, pg] = [+(process.argv[2] || 1440), process.argv[3] || '/'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'commit' });
  const t0 = Date.now();
  while (Date.now() - t0 < 1800) {
    const s = await p.evaluate(() => {
      const o = []; const root = document.getElementById('vd-pre');
      document.querySelectorAll('h1,h2,p').forEach((e) => {
        const r = e.getBoundingClientRect(); if (r.top > innerHeight || e.closest('header,nav,[data-framer-name="Top"],[data-framer-name="Scrolled"],[data-framer-name^="Mobile"]')) return;
        let op = 1; for (let x = e; x && x !== document.body; x = x.parentElement) op *= +getComputedStyle(x).opacity;
        o.push(`${e.textContent.trim().slice(0, 18)}|op${op.toFixed(2)}|w${Math.round(r.width)}|t${Math.round(r.top)}|in${e.closest('[data-vd-in]') ? 1 : 0}|cls:${document.documentElement.className.slice(0, 40)}`);
      });
      return { ready: document.readyState, pre: !!root, n: o.length, o: o.slice(0, 4) };
    }).catch((e) => ({ err: e.message.slice(0, 60) }));
    console.log(Date.now() - t0, JSON.stringify(s));
    await p.waitForTimeout(120);
  }
  await b.close();
})();
