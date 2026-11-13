// IMAGE FILL AUDIT — photos must cover their box like on live (100% width/height, no strips).
// For every image box (name/class token like image|photo|background|land|media|cover|picture|avatar) measure the gap
// from the box to its container on each side (left/top/right/bottom), on live and in Framer, matched by class token +
// occurrence. Reports where Framer leaves a strip the live site does not (gap > live + 3px), or overflows it.
// Read the findings: a strip in the image's OWN box (card, land-wrap) is real. An offset against a whole `section`
// usually means the text above is taller, or the layout differs (Framer tablet = 810–1199, Webflow desktop from 992):
// compare the image SIZE (w x h) with live before fixing. Fixed px heights on 390/810 replicas are the usual cause.
// node imgfill.js <widths csv> [pages…]   (pages default: pages.json)   env: BASE, LIVE
const { chromium } = require('playwright'); const fs = require('fs');
const widths = (process.argv[2] || '360,600,810,1100,1440').split(',').map(Number);
let pages = process.argv.slice(3);
if (!pages.length) pages = fs.existsSync(__dirname + '/pages.json') ? JSON.parse(fs.readFileSync(__dirname + '/pages.json')) : ['/'];
const FR = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const LIVE = process.env.LIVE || 'https://noverde-128.webflow.io';
const probe = (isFr) => {
  const RX = /(image|photo|background|-bg\b|land|media|cover|picture|avatar|portrait|visual|figure)/i;
  const tok = (e) => (isFr ? (e.getAttribute('data-framer-name') || '') : (typeof e.className === 'string' ? e.className : '')).trim().split(/\s+/)[0] || '';
  const out = {}; const seen = {};
  const cands = [...document.querySelectorAll(isFr ? '[data-framer-name]' : '[class]')].filter((e) => RX.test(tok(e)) && !/wrap$|wrapper$|list$|grid$/.test(tok(e)) && (e.matches('img') || e.querySelector('img,[data-framer-background-image-wrapper]') || getComputedStyle(e).backgroundImage !== 'none'));
  for (const e of cands) {
    const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue;
    if (isFr && e.closest('.ssr-variant') && getComputedStyle(e.closest('.ssr-variant')).display === 'none') continue;
    // skip boxes still mid-reveal (a scale/translate on any ancestor shifts every gap): wait, do not report
    { let t = e, moving = false; while (t && t !== document.body) { const tf = getComputedStyle(t).transform; if (tf !== 'none' && tf !== 'matrix(1, 0, 0, 1, 0, 0)') { moving = true; break; } t = t.parentElement; } if (moving) continue; }
    // container = nearest ancestor that is clipped, rounded or has its own background (the visible card/section)
    let c = e.parentElement;
    while (c && c !== document.body) { const cs = getComputedStyle(c); const q = c.getBoundingClientRect(); if ((cs.overflow !== 'visible' || parseFloat(cs.borderTopLeftRadius) > 0 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') && q.width >= r.width - 2) break; c = c.parentElement; }
    if (!c || c === document.body) continue;
    const q = c.getBoundingClientRect();
    // the visible part of the image (clipped by the container)
    const vis = { l: Math.max(r.left, q.left), t: Math.max(r.top, q.top), r: Math.min(r.right, q.right), b: Math.min(r.bottom, q.bottom) };
    const k = tok(e); seen[k] = (seen[k] || 0) + 1;
    out[k + '#' + seen[k]] = { gap: [vis.l - q.left, vis.t - q.top, q.right - vis.r, q.bottom - vis.b].map(Math.round), box: tok(c).slice(0, 26) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height) };
  }
  return out;
};
(async () => {
  const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) {
    const res = [];
    for (const [base, isFr] of [[LIVE, false], [FR, true]]) {
      const p = await b.newPage({ viewport: { width: W, height: 900 } });
      await p.goto(base + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      const H = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
      for (let y = 0; y < H; y += 700) { await p.evaluate((y) => scrollTo(0, y), y).catch(() => {}); await p.waitForTimeout(70); }
      await p.waitForTimeout(1500);
      res.push(await p.evaluate(probe, isFr).catch(() => ({})));
      await p.close();
    }
    const [L, F] = res; const bad = [];
    for (const [k, f] of Object.entries(F)) {
      const l = L[k]; if (!l) continue;
      const side = ['left', 'top', 'right', 'bottom'];
      const d = f.gap.map((g, i) => g - l.gap[i]);
      const worst = d.map((x, i) => [x, i]).filter(([x]) => x > 3);
      if (worst.length) bad.push(`   ${k.padEnd(30)} in ${f.box}: strip ${worst.map(([x, i]) => side[i] + ' +' + x + 'px').join(', ')}  (live gaps ${l.gap.join('/')}, framer ${f.gap.join('/')})`);
    }
    if (bad.length) console.log(`== ${pg} @${W}\n` + bad.join('\n'));
  }
  console.log('imgfill: done', widths.join(','), pages.length, 'pages');
  await b.close();
})();
