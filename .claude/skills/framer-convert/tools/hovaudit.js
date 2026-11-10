// Hover + link audit: live (Webflow) vs published Framer. Matches elements by class string == data-framer-name (minus [..] attrs).
// usage: node hovaudit.js page1 page2 ...   ("" = home). Writes hova/<page>.json and prints a report.
const { chromium } = require('playwright');
const fs = require('fs');
const L = 'https://noverde-128.webflow.io/', F = 'https://adaptable-event-041934.framer.app/';
const OUT = __dirname + '/hova/'; fs.mkdirSync(OUT, { recursive: true });
const pages = process.argv.slice(2).map((p) => (p === 'home' ? '' : p));
const css = fs.readFileSync(__dirname + '/live.css', 'utf8');
// classes that have a :hover rule on live (first class of the selector before :hover)
const hoverCls = new Set();
for (const m of css.matchAll(/([^{}]+):hover[^{]*\{/g)) for (const part of m[1].split(',')) { const mm = part.trim().match(/\.([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9_-]+)*\s*$/) || part.trim().match(/\.([a-zA-Z0-9_-]+)/); if (mm) hoverCls.add(mm[1]); }
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'opacity', 'transform', 'boxShadow', 'textDecorationLine', 'filter', 'width', 'height'];

// in-page helpers (stringified)
const setup = ({ mode, hoverList }) => {
  const key = (e) => { if (mode === 'L') return typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => !/^w-/.test(c) || /w-slider-arrow|w-nav/.test(c)).join(' ') : ''; const n = e.getAttribute('data-framer-name'); return n ? n.replace(/\[[^\]]*\]/g, '').replace(/\[|\]/g, '').trim().split(/\s+/).filter((c) => !/^w-/.test(c) || /w-slider-arrow|w-nav/.test(c)).join(' ') : ''; };
  window.__key = key;
  const all = mode === 'L' ? [...document.querySelectorAll('body [class]')] : [...document.querySelectorAll('[data-framer-name]')];
  const seen = {}; const targets = [];
  for (const e of all) {
    const k = key(e); if (!k) continue;
    const first = k.split(' ')[0];
    const isLink = e.tagName === 'A' || e.closest('a') === e;
    const hov = mode === 'L' ? (hoverList.includes(first) || e.hasAttribute('data-w-id') || e.tagName === 'A') : true;
    if (!hov) continue;
    if (seen[k]) continue; seen[k] = 1;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    targets.push(k);
  }
  window.__find = (k) => { const all = mode === 'L' ? [...document.querySelectorAll('body [class]')] : [...document.querySelectorAll('[data-framer-name]')]; return all.find((e) => key(e) === k && e.getBoundingClientRect().width > 3); };
  window.__snap = (root, props) => { const out = {}; const els = [root, ...root.querySelectorAll('*')].slice(0, 60); const cnt = {}; for (const e of els) { let k = key(e) || e.tagName.toLowerCase(); if (!k) continue; cnt[k] = (cnt[k] || 0) + 1; const s = getComputedStyle(e); out[k + '#' + cnt[k]] = props.map((p) => s[p]).join('|'); } return out; };
  return targets;
};
const links = (mode) => [...document.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().width > 0 || a.closest('nav,[data-framer-name*=nav]')).map((a) => ({ t: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\.\//, '/').replace(/\/$/, '') || '/', nt: a.target === '_blank' }));

const run = async (b, base, pg, mode, liveTargets) => {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + pg, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(2500);
  // scroll through to trigger reveals
  const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(800);
  const targets = await p.evaluate(setup, { mode, hoverList: [...hoverCls] });
  const want = liveTargets || targets;
  const res = {};
  for (const k of want) {
    try {
      const ok = await p.evaluate((k) => { const e = window.__find(k); if (!e) return false; e.scrollIntoView({ block: 'center' }); window.__t = e; return true; }, k);
      if (!ok) { res[k] = 'MISSING'; continue; }
      await p.mouse.move(2, 2); await p.waitForTimeout(250);
      const before = await p.evaluate((P) => window.__snap(window.__t, P), PROPS);
      const box = await p.evaluate(() => { const r = window.__t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await p.mouse.move(box.x, box.y); await p.waitForTimeout(900);
      const after = await p.evaluate((P) => window.__snap(window.__t, P), PROPS);
      const ch = {};
      for (const d of Object.keys(after)) if (before[d] && before[d] !== after[d]) { const bv = before[d].split('|'), av = after[d].split('|'); PROPS.forEach((pp, i) => { if (bv[i] !== av[i] && !(pp === 'width' || pp === 'height') ) ch[d + '.' + pp] = bv[i] + ' -> ' + av[i]; }); }
      res[k] = ch;
    } catch (e) { res[k] = 'ERR ' + String(e).slice(0, 80); }
  }
  const lk = await p.evaluate(links, mode);
  await p.close();
  return { targets, res, links: lk };
};
(async () => {
  const b = await chromium.launch();
  for (const pg of pages) {
    const live = await run(b, L, pg, 'L');
    const hovered = live.targets.filter((k) => live.res[k] && typeof live.res[k] === 'object' && Object.keys(live.res[k]).length);
    const fr = await run(b, F, pg, 'F', hovered);
    const rep = [];
    for (const k of hovered) {
      const lc = live.res[k], fc = fr.res[k];
      if (fc === 'MISSING' || typeof fc !== 'object') { rep.push(`✗ ${k}: element ${fc}`); continue; }
      const miss = Object.keys(lc).filter((x) => !fc[x]);
      if (miss.length) rep.push(`✗ ${k}: missing ${miss.map((m) => m + ' [' + lc[m] + ']').join('; ')}`);
    }
    // links
    const norm = (h) => h.replace(/^\/(services|team|our-impact|blog)\//, '/$1/');
    const fl = fr.links.map((l) => l.t + ' => ' + norm(l.h));
    const lrep = [];
    const fset = new Map(); for (const l of fr.links) fset.set(l.t.toLowerCase().replace(/noverde/g, 'verdova'), l);
    for (const l of live.links) { const t = l.t.toLowerCase().replace(/noverde/g, 'verdova'); const f = fset.get(t); if (!f) lrep.push(`✗ link "${l.t}" ${l.h} missing`); else if (norm(f.h) !== norm(l.h) && !(l.h.startsWith('#') && f.h.startsWith('#'))) lrep.push(`✗ link "${l.t}" live ${l.h} vs F ${f.h}`); }
    fs.writeFileSync(OUT + (pg || 'home').replace(/\//g, '_') + '.json', JSON.stringify({ live, fr }, null, 1));
    console.log(`\n===== /${pg}  hover targets live:${hovered.length}  issues:${rep.length}  link issues:${lrep.length}`);
    console.log(rep.join('\n')); console.log([...new Set(lrep)].join('\n'));
  }
  await b.close();
})();
