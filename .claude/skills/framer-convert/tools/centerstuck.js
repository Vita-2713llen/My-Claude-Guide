// Centred text inside a box that is stuck to the left (or right) of a wider vertical parent.
// Pattern: max-width wrapper + parent stackAlignment start -> text-align:center lines sit off the page centre.
// Also flags centred texts whose line centres disagree (> 8px) with their centred siblings in the same group.
// node centerstuck.js <widths> (uses pages.json when present)
const { chromium } = require('playwright'); const fs = require('fs');
const widths = (process.argv[2] || '360,390,600,768,810,900,992,1100,1199').split(',').map(Number);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : fs.existsSync(__dirname + '/pages.json') ? [...JSON.parse(fs.readFileSync(__dirname + '/pages.json')), '/404'] : ['/'];
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const scan = () => {
  const out = [];
  const lineCentre = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()].filter((q) => q.width > 2); if (!rs.length) return null; return (Math.min(...rs.map((q) => q.left)) + Math.max(...rs.map((q) => q.right))) / 2; };
  const texts = [...document.querySelectorAll('h1,h2,h3,h4,h5,p')].filter((e) => {
    const r = e.getBoundingClientRect(); if (r.width < 30 || r.height < 5 || r.bottom < 0) return false;
    if (e.closest('header,nav,[data-framer-name^="Mobile"],[aria-hidden="true"]')) return false;
    const ta = getComputedStyle(e).textAlign; return ta === 'center' || getComputedStyle(e.parentElement).textAlign === 'center' || getComputedStyle(e).getPropertyValue('--framer-text-alignment').trim() === 'center';
  });
  for (const e of texts) {
    const c = lineCentre(e); if (c == null) continue;
    // walk up: find a box narrower than a VERTICAL parent and stuck to one side
    for (let x = e; x && x.parentElement && x !== document.body; x = x.parentElement) {
      const par = x.parentElement; const ps = getComputedStyle(par);
      const vertical = (ps.display.includes('flex') && ps.flexDirection.startsWith('column')) || ps.display === 'block';
      if (!vertical) continue;
      const r = x.getBoundingClientRect(), pr = par.getBoundingClientRect();
      const il = pr.left + parseFloat(ps.paddingLeft), ir = pr.right - parseFloat(ps.paddingRight);
      if (ir - il > innerWidth * 1.05) break;
      const gl = r.left - il, gr = ir - r.right;
      if (r.width < ir - il - 16 && Math.abs(gl - gr) > 12 && Math.min(gl, gr) < 2) {
        // only a problem if the parent group is centred (it has other centred, full-width or centred content)
        const pc = (il + ir) / 2;
        if (Math.abs(c - pc) > 8) { out.push(`STUCK "${e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)}" line-centre ${Math.round(c)} vs group ${Math.round(pc)} (box ${(x.getAttribute('data-framer-name') || x.className || x.tagName).toString().slice(0, 30)} in ${(par.getAttribute('data-framer-name') || par.tagName).toString().slice(0, 30)})`); }
        break;
      }
      if (x !== e && ir - il >= innerWidth * 0.5) break;
    }
  }
  return [...new Set(out)];
};
(async () => {
  const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 900 } });
    await p.goto(BASE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    const H = await p.evaluate(() => document.body.scrollHeight);
    const all = new Set();
    for (let y = 0; y < H; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(250); (await p.evaluate(scan)).forEach((x) => all.add(x)); }
    if (all.size) console.log(`== ${pg} @${W}\n   ` + [...all].slice(0, 15).join('\n   '));
    await p.close();
  }
  console.log(`centerstuck: ${widths.length} widths x ${pages.length} pages scanned`);
  await b.close();
})();
