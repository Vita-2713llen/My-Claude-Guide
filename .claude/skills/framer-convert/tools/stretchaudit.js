// Within one Framer breakpoint, elements must keep their edge relations when the viewport changes.
// Compare base width (810 / 390) with in-between widths; flag: stopped stretching, lost centring, overflowing parent/viewport.
// node stretchaudit.js <base> <widths csv> [pages...]
const { chromium } = require('playwright');
const base = +process.argv[2];
const widths = process.argv[3].split(',').map(Number);
const pages = process.argv.slice(4).length ? process.argv.slice(4) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
const BASE = 'https://adaptable-event-041934.framer.app';
const grab = () => {
  const out = {};
  const main = document.querySelector('#main') || document.body;
  const walk = (e, path) => {
    [...e.children].forEach((c, i) => {
      const p = path + '/' + i; const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
      if (cs.display === 'none') return;
      const n = c.getAttribute('data-framer-name');
      if (r.width > 40 && r.height > 20 && n && !/^(Mobile|Top|Scrolled|All Pages Menu)/.test(n)) {
        const pr = c.parentElement.getBoundingClientRect(); const pcs = getComputedStyle(c.parentElement);
        const il = pr.left + parseFloat(pcs.paddingLeft) + parseFloat(pcs.borderLeftWidth), ir = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
        out[p] = { n: n.replace(/\s*\[data-[^\]]*\]+/g, '').slice(0, 34), gl: r.left - il, gr: ir - r.right, w: r.width, pw: ir - il, abs: cs.position === 'absolute', vw: r.right > innerWidth + 1 || r.left < -1, img: !!c.querySelector(':scope > img, :scope > div > img') || cs.backgroundImage !== 'none' };
      }
      if (!/^(Mobile|Top|Scrolled|All Pages Menu)/.test(n || '')) walk(c, p);
    });
  };
  walk(main, '');
  return out;
};
(async () => {
  const b = await chromium.launch();
  const load = async (pg, W) => { const p = await b.newPage({ viewport: { width: W, height: 900 } }); await p.goto(BASE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); const H = await p.evaluate(() => document.body.scrollHeight); for (let y = 0; y < H; y += 800) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(40); } await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200); const r = await p.evaluate(grab); await p.close(); return r; };
  for (const pg of pages) {
    const B = await load(pg, base); const lines = new Map();
    for (const W of widths) {
      const T = await load(pg, W);
      for (const [k, a] of Object.entries(B)) {
        const t = T[k]; if (!t || t.n !== a.n) continue;
        const issues = [];
        if (a.gr <= 1 && t.gr > 6 && a.gl <= 1) issues.push(`stops stretching (gap right ${Math.round(t.gr)})`);
        else if (a.gr <= 1 && t.gr > 6 && !a.abs) issues.push(`right edge detaches (${Math.round(t.gr)})`);
        if (Math.abs(a.gl - a.gr) <= 2 && a.gl > 3 && Math.abs(t.gl - t.gr) > 8) issues.push(`loses centring (L${Math.round(t.gl)} R${Math.round(t.gr)})`);
        if (t.gr < -3 && a.gr >= -1 && !t.abs) issues.push(`overflows parent by ${Math.round(-t.gr)}`);
        if (t.vw && !a.vw) issues.push('goes off-screen');
        if (issues.length) { const key = a.n + ' :: ' + issues[0].replace(/\d+/g, '#'); if (!lines.has(key)) lines.set(key, `   ${a.n} @${W}: ${issues.join('; ')}`); }
      }
    }
    if (lines.size) console.log(`== ${pg} (base ${base})\n` + [...lines.values()].slice(0, 40).join('\n'));
  }
  await b.close();
})();
