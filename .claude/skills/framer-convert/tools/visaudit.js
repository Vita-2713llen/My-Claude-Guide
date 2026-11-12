// Visual defects audit (clip-aware): overlapping texts, texts cut by a clipping ancestor / viewport edge,
// controls cut by the viewport, page h-overflow. Fully hidden things (offscreen slides, collapsed accordions,
// masked word reveals) are ignored: every rect is first intersected with all clipping ancestors.
// node visaudit.js <widths csv> [pages...]      BASE=<site> to audit another site (e.g. live, for diffing)
const { chromium } = require('playwright');
const widths = (process.argv[2] || '360,390,480,640,768,810,900,992,1100,1200,1280').split(',').map(Number);
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/about-us', '/services', '/services/carbon-footprint', '/our-team', '/team/tess-okonkwo', '/pricing', '/our-impact', '/our-impact/clean-energy', '/contact-us', '/blog', '/blog/diversion-rates-are-over-claimed', '/404', '/style-guide', '/licenses', '/changelog'];
if (require('fs').existsSync(__dirname + '/pages.json')) { pages.length = 0; pages.push(...JSON.parse(require('fs').readFileSync(__dirname + '/pages.json')), '/404'); }
const BASE = process.env.BASE || 'https://adaptable-event-041934.framer.app';
const audit = () => {
  const W = innerWidth, out = [];
  const skip = (e) => e.closest('[data-framer-name^="Mobile"],[data-framer-name="Top"],[data-framer-name="Scrolled"],[data-framer-name="All Pages Menu"],nav,[aria-hidden="true"],[data-framer-name*="ticker" i],[data-framer-name*="marquee" i],[data-framer-name*="logo-track" i]');
  const shown = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const clipChain = (e) => { // clipping ancestors that really clip e (respect containing blocks of absolute/fixed boxes)
    const cl = []; let needPos = /absolute/.test(getComputedStyle(e).position); if (getComputedStyle(e).position === 'fixed') return cl;
    for (let x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) {
      const cs = getComputedStyle(x);
      const isCB = cs.position !== 'static' || cs.transform !== 'none';
      if (!needPos || isCB) { needPos = false; if (cs.display !== 'contents' && /(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY + cs.overflow)) cl.push(x); }
      if (cs.position === 'fixed') break; if (cs.position === 'absolute') needPos = true;
    }
    return cl; };
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) });
  const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const texts = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) && !skip(e) && shown(e));
  const boxes = [];
  for (const e of texts) {
    const rg = document.createRange(); rg.selectNodeContents(e);
    const raw = [...rg.getClientRects()].filter((q) => q.width > 1 && q.height > 1).map((q) => ({ left: q.left, right: q.right, top: q.top, bottom: q.bottom }));
    if (!raw.length) continue;
    const chain = clipChain(e);
    let vis = raw; let cutBy = null, cut = 0;
    for (const c of chain) {
      const cr = c.getBoundingClientRect(); const nv = vis.map((q) => inter(q, cr));
      const before = vis.reduce((s, q) => s + area(q), 0), after = nv.reduce((s, q) => s + area(q), 0);
      if (after < before - 1 && after > 0) { // partially cut by this ancestor
        const over = Math.max(...vis.map((q) => Math.max(q.right - cr.right, cr.left - q.left, q.bottom - cr.bottom, cr.top - q.top)));
        const scroller = /(auto|scroll)/.test(getComputedStyle(c).overflowX + getComputedStyle(c).overflowY);
        if (over > cut && !scroller && cr.height > 4) { cut = over; cutBy = c; }
      }
      vis = nv.filter((q) => area(q) > 0);
      if (!vis.length) break;
    }
    if (!vis.length) continue; // fully hidden (offscreen slide, collapsed panel, masked reveal)
    const L = Math.min(...vis.map((q) => q.left)), R = Math.max(...vis.map((q) => q.right));
    const t = e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (cutBy && cut > 3 && !/vd-w/.test(cutBy.className + '')) out.push(`CLIP "${t}" by ${(cutBy.getAttribute('data-framer-name') || cutBy.className || cutBy.tagName).toString().slice(0, 28)} over ${Math.round(cut)}px`);
    if ((L < -1 && R > 2) || (R > W + 1 && L < W - 2)) out.push(`CLIP-VIEWPORT "${t}" x${Math.round(L)}..${Math.round(R)}`);
    boxes.push({ e, rects: vis, t, para: e.closest('h1,h2,h3,h4,h5,h6,p,a,button,label,li') });
  }
  if (document.documentElement.scrollWidth > W + 1) out.push(`H-OVERFLOW page scrollWidth ${document.documentElement.scrollWidth}`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    if (a.e.contains(c.e) || c.e.contains(a.e) || (a.para && a.para === c.para)) continue;
    let hit = 0; for (const p of a.rects) for (const q of c.rects) { const r = inter(p, q); const w = r.right - r.left, h = r.bottom - r.top; if (w > 2 && h > 3) hit = Math.max(hit, (w * h) / Math.min(area(p), area(q))); }
    if (hit > 0.15) out.push(`OVERLAP "${a.t}" x "${c.t}" ${Math.round(hit * 100)}%`);
  }
  document.querySelectorAll('a,button,[role=button],[data-framer-name*="arrow" i],[data-framer-name*="button" i]').forEach((e) => {
    if (skip(e) || !shown(e)) return; const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    if ((r.left < -1 && r.right > 2) || (r.right > W + 1 && r.left < W - 2)) {
      let v = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; for (const c of clipChain(e)) v = inter(v, c.getBoundingClientRect());
      if (area(v) > 0) out.push(`CONTROL-CUT ${(e.getAttribute('data-framer-name') || e.className || e.tagName).toString().slice(0, 30)} "${(e.textContent || '').trim().slice(0, 20)}" x${Math.round(r.left)}..${Math.round(r.right)}`);
    }
  });
  return [...new Set(out)];
};
(async () => {
  const b = await chromium.launch();
  for (const W of widths) for (const pg of pages) {
    const p = await b.newPage({ viewport: { width: W, height: 800 } });
    await p.goto(BASE + pg, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 400) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(80); }
    await p.waitForTimeout(1500);
    const all = new Set();
    for (let y = 0; y < H; y += 700) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(900); (await p.evaluate(audit)).forEach((x) => all.add(x)); }
    if (all.size) console.log(`== ${pg} @${W}\n   ` + [...all].slice(0, 30).join('\n   '));
    await p.close();
  }
  await b.close();
})();
