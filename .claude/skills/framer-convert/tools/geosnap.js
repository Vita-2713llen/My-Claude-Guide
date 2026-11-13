// Structure-agnostic geometry snapshot of the published Framer site, for refactor regression checks
// (e.g. turning repeated frames into components). Records every visible text leaf and image by content + rect.
// node geosnap.js <out.json> [widths=1440,1100,900,390] [pages=all from pages.json]
// node geosnap.js --cmp <before.json> <after.json>   -> prints moved/missing items (>2px)
const fs = require('fs');
if (process.argv[2] === '--cmp') {
  const A = JSON.parse(fs.readFileSync(process.argv[3])), B = JSON.parse(fs.readFileSync(process.argv[4]));
  let bad = 0;
  for (const k of Object.keys(A)) {
    const a = A[k], b = B[k] || [], used = new Set(), issues = [];
    for (const x of a) {
      let best = -1, bd = 1e9;
      b.forEach((y, i) => { if (used.has(i) || y.t !== x.t) return; const d = Math.abs(y.x - x.x) + Math.abs(y.y - x.y) + Math.abs(y.w - x.w) + Math.abs(y.h - x.h); if (d < bd) { bd = d; best = i; } });
      if (best < 0) issues.push('MISSING ' + x.t + ' @' + x.x + ',' + x.y);
      else { used.add(best); if (bd > 2) { const y = b[best]; issues.push('MOVED ' + x.t + ' ' + [x.x, x.y, x.w, x.h] + ' -> ' + [y.x, y.y, y.w, y.h]); } }
    }
    b.forEach((y, i) => { if (!used.has(i)) issues.push('EXTRA ' + y.t + ' @' + y.x + ',' + y.y); });
    if (issues.length) { bad += issues.length; console.log('== ' + k + ' (' + issues.length + ')\n  ' + issues.slice(0, 12).join('\n  ')); }
  }
  console.log(bad ? 'GEO DIFF: ' + bad : 'GEO OK'); process.exit(0);
}
const { chromium } = require('playwright');
const out = process.argv[2], W = (process.argv[3] || '1440,1100,900,390').split(',').map(Number);
const pages = process.argv[4] ? process.argv[4].split(',') : JSON.parse(fs.readFileSync(__dirname + '/pages.json'));
(async () => {
  const b = await chromium.launch(); const R = {};
  for (const w of W) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await Promise.all([0, 1, 2, 3].map(async (lane) => {
      const p = await ctx.newPage();
      for (let i = lane; i < pages.length; i += 4) {
        const pg = pages[i];
        await p.goto('https://adaptable-event-041934.framer.app' + pg + '?v=' + Date.now(), { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await p.waitForSelector('[data-framer-name]', { timeout: 20000 }).catch(() => {});
        for (let y = 0; y < 16000; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(40); }
        await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1800);
        R[pg + ' @' + w] = await p.evaluate(() => {
          const res = [], sy = scrollY;
          const vis = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const seen = new Set();
          for (let t; (t = walker.nextNode());) {
            const e = t.parentElement; if (!e || seen.has(e) || e.closest('#__framer-editorbar-container,script,style')) continue;
            const s = e.textContent.trim().replace(/\s+/g, ' '); if (!s) continue; seen.add(e);
            const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || !vis(e)) continue;
            res.push({ t: s.slice(0, 40), x: Math.round(r.left), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) });
          }
          document.querySelectorAll('img').forEach((im) => { const r = im.getBoundingClientRect(); if (r.width < 1 || !vis(im)) return; res.push({ t: 'img:' + (im.currentSrc || im.src).split('/').pop().split('?')[0].slice(0, 30), x: Math.round(r.left), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) }); });
          return res;
        });
      }
      await p.close();
    }));
    await ctx.close();
  }
  fs.writeFileSync(out, JSON.stringify(R)); console.log('saved ' + Object.keys(R).length + ' page@width snapshots -> ' + out);
  await b.close();
})();
