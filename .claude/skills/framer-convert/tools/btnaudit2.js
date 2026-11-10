// Every element whose data-framer-name contains "button" (non-component buttons): hover -> label colour vs fill colour
const { chromium } = require('playwright');
const F = 'https://adaptable-event-041934.framer.app';
const pages = (process.argv[2] || '/,/about-us,/services,/services/esg-strategy,/our-team,/team/aidan-clery,/pricing,/our-impact,/our-impact/reforestation,/contact-us,/blog,/blog/the-emission-factor-you-cite,/404').split(',');
const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return 1; const [r, g, b, a] = m.map(Number); if (a === 0) return -1; return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const pg of pages) {
    await p.goto(F + pg, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
    const hs = await p.$$('[data-framer-name*="button"],[data-framer-name="Primary"],[data-framer-name="Secondary"],[data-framer-name="Neutral"]');
    for (const [i, h] of hs.entries()) {
      const meta = await h.evaluate((e) => { const r = e.getBoundingClientRect(); const t = e.querySelector('.framer-text'); return { vis: r.width > 0 && r.height > 0 && r.height < 120, name: e.getAttribute('data-framer-name'), label: t ? t.textContent.trim().slice(0, 26) : '', nested: !!e.parentElement.closest('[data-framer-name*="button"],[data-framer-name="Primary"],[data-framer-name="Secondary"]') }; });
      if (!meta.vis || meta.nested || !meta.label) continue;
      await h.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(250);
      await h.hover({ force: true }).catch(() => {}); await p.waitForTimeout(1000);
      const r = await h.evaluate((e) => {
        const t = e.querySelector('.framer-text');
        // the visible background right behind the label: topmost element at label centre that has an opaque bg
        const tr = t.getBoundingClientRect(); const x = tr.left + 2, y = tr.top + tr.height / 2;
        let bg = 'rgba(0, 0, 0, 0)';
        for (const el of document.elementsFromPoint(x, y)) { const c = getComputedStyle(el).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; } }
        return { color: getComputedStyle(t).color, bg };
      });
      const lc = lum(r.color), lb = lum(r.bg); const bad = lb >= 0 && Math.abs(lc - lb) < 0.3;
      console.log((bad ? 'BAD ' : 'ok  ') + pg.padEnd(34) + (meta.name || '').slice(0, 22).padEnd(24) + meta.label.padEnd(28) + r.color + ' on ' + r.bg);
      if (bad) await h.screenshot({ path: __dirname + '/qcv/btnbad' + pg.replace(/\W/g, '_') + i + '.png' }).catch(() => {});
      await p.mouse.move(2, 2); await p.waitForTimeout(350);
    }
  }
  await b.close();
})();
