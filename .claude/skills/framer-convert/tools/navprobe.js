const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('https://noverde-128.webflow.io/about-us', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const out = [];
    const nav = document.querySelector('.head-nav-link').closest('nav, [class*=head-nav]:not(.head-nav-link)');
    let pill = document.querySelector('.head-nav-link').parentElement;
    for (let i = 0; i < 4 && pill; i++, pill = pill.parentElement) {
      const s = getComputedStyle(pill); const b = pill.getBoundingClientRect();
      out.push(`${pill.className} x=${b.x.toFixed(1)} w=${b.width.toFixed(1)} y=${b.y.toFixed(1)} h=${b.height.toFixed(1)} pad=${s.padding} gap=${s.gap} bg=${s.backgroundColor} bd=${s.border} rad=${s.borderRadius} blur=${s.backdropFilter}`);
    }
    document.querySelectorAll('.head-nav-link, .head-cta, .button-solid, [class*=head-] .button, .head-logo, [class*=brand]').forEach((e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); if (b.y < 120) out.push(`  ${e.className} x=${b.x.toFixed(1)} w=${b.width.toFixed(1)} h=${b.height.toFixed(1)} pad=${s.padding} fs=${s.fontSize} ls=${s.letterSpacing} fw=${s.fontWeight} rad=${s.borderRadius} bg=${s.backgroundColor}`); });
    return out.join('\n');
  });
  console.log(r);
  await b.close();
})();
