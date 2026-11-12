// which CSS rules set width on an element (by data-framer-name), to verify a tree fix really published: node rules.js <w> <page> <framer-name>
const { chromium } = require('playwright');
const [W, pg, name] = [+process.argv[2], process.argv[3], process.argv[4]];
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 900 } });
  await p.goto((process.env.BASE || 'https://adaptable-event-041934.framer.app') + pg, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  console.log(await p.evaluate((name) => {
    const e = document.querySelector(`[data-framer-name="${name}"]`); if (!e) return 'nf';
    const o = ['class=' + e.className];
    for (const ss of document.styleSheets) { let rs; try { rs = ss.cssRules; } catch { continue; }
      const scan = (list, mq) => { for (const r of list) { if (r.cssRules && !r.selectorText) { if (!r.media || matchMedia(r.media.mediaText).matches) scan(r.cssRules, r.media ? r.media.mediaText : mq); continue; }
        try { if (r.selectorText && e.matches(r.selectorText) && /width/.test(r.style.cssText)) o.push((mq || '') + ' ' + r.selectorText.slice(0, 120) + ' {' + r.style.cssText.slice(0, 160) + '}'); } catch {} } };
      scan(rs, ''); }
    return o.join('\n');
  }, name)); await b.close(); })();
