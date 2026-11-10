// Resolves a native.cjs spec bundle against the Framer project's design system, so the in-Framer replay
// is a dumb loop: every colour becomes a colour token (existing, or a new one declared in `tokens`), every
// text preset maps to an existing text style or a new one declared in `presets`, links point at Framer
// paths, asset URLs are clean. Usage: node resolve.cjs <bundle.json> <ds.json> <out.json>
const fs = require('fs');
const [, , bundleFile, dsFile, outFile] = process.argv;
const B = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
const DS = JSON.parse(fs.readFileSync(dsFile, 'utf8'));
const BASE = 'https://design.upqode.com/markup-files/d161aaee-caad-47ab-9b4f-4d79bbadcabb/';

/* ---------- colours ---------- */
function parse(c) {
  if (!c) return null;
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
const tokens = DS.tokens.map((t) => ({ ...t, c: parse(t.light) })).filter((t) => t.c);
const newTokens = {};
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && Math.abs(a[3] - b[3]) < 0.011;
function tokenFor(str) {
  const c = parse(str);
  if (!c) return null;
  const hit = tokens.find((t) => same(t.c, c));
  if (hit) return `var(--token-${hit.id})`;
  const key = c.join('_').replace(/\./g, 'p');
  if (!newTokens[key]) {
    const base = tokens.find((t) => t.c[0] === c[0] && t.c[1] === c[1] && t.c[2] === c[2] && t.c[3] === 1);
    const name = base ? `${base.name} ${Math.round(c[3] * 100)}` : `Verdova/${c[3] < 1 ? `rgba(${c.join(', ')})` : '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    newTokens[key] = { key, name, light: c[3] < 1 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})` : '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase() };
  }
  return `$tok:${key}`;
}
const COLOR_RE = /rgba?\([^)]*\)|#[0-9a-fA-F]{6}\b/g;
const inString = (s) => s.replace(COLOR_RE, (m) => { const t = tokenFor(m); return t ? (t.startsWith('$tok:') ? `var(--$tok:${t.slice(5)})` : t) : m; });

/* ---------- text presets ---------- */
const px = (v) => parseFloat(v) || 0;
const lh = (v) => (String(v).endsWith('%') ? px(v) / 100 : px(v));
const existing = DS.presets.map((p) => {
  const slots = Object.values(p.bp).sort((a, b) => px(b[0]) - px(a[0]));
  const at = (w) => (slots.find((s) => w >= px(s[0])) || slots[slots.length - 1]);
  return { ...p, at };
});
const presetMap = {};
const newPresets = {};
for (const sp of B.$presets) {
  const sizes = sp.slots.map((s) => px(s.fontSize));
  const hit = existing.find((p) => p.font === sp.fontName && p.w === sp.fontWeight && (p.tt || 'none') === (sp.textTransform || 'none') &&
    [(B.$widths || [1200])[0], 810, 390].every((w, i) => px(p.at(w)[1]) === sizes[i] && Math.abs(lh(p.at(w)[2]) - lh(sp.slots[i].lineHeight)) < 0.06));
  if (hit) { presetMap[sp.key] = hit.id; continue; }
  const sig = [sp.fontName, sp.fontWeight, sp.textTransform, sizes.join('-'), Math.round(lh(sp.slots[0].lineHeight) * 10) / 10, Math.round(px(sp.slots[0].letterSpacing) * 100) / 100].join('|');
  if (!newPresets[sig]) {
    const lhR = (Math.round(lh(sp.slots[0].lineHeight) * 10) / 10) + 'em';
    const ls = (Math.round(px(sp.slots[0].letterSpacing) * 100) / 100) + 'em';
    const wn = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold' }[sp.fontWeight] || sp.fontWeight;
    newPresets[sig] = {
      key: 'P' + Object.keys(newPresets).length, sig,
      name: `Verdova/${sp.fontName === 'Playfair' ? 'Serif' : 'Sans'} ${[...new Set(sizes)].join('–')} ${wn}${sp.textTransform === 'uppercase' ? ' Caps' : ''} ${lhR}`,
      attrs: { tag: sp.tag, fontName: sp.fontName, fontWeight: sp.fontWeight, fontStyle: sp.fontStyle || 'normal', textTransform: sp.textTransform || 'none', lineHeight: lhR, letterSpacing: ls, fontSize: sizes[0] + 'px', textColor: 'var(--token-uEP07Lemd)', ...(sp.fontName === 'Playfair' ? { fontVariationAxes: { opsz: sizes[0], wght: sp.fontWeight } } : {}) },
      slots: sizes,
    };
  }
  presetMap[sp.key] = '$preset:' + newPresets[sig].key;
}

/* ---------- links ---------- */
const DROP = new Set(['style-guide', 'licensing', 'changelog', 'password']);
const PATHS = { 'index': '/', 'about-us': '/about-us', 'services': '/services', 'team': '/team', 'pricing': '/pricing', 'our-impact': '/our-impact', 'contact-us': '/contact-us', 'blog': '/blog', '404': '/404' };
const DETAIL = { 'services-details': ['/services/:VLoWP51rZ', 'V6mwxD14y'], 'our-impact-details': ['/our-impact/:mRvnq66r5', 'UZZP3_1qp'], 'team-details': ['/team/:eqeGlcArb', '$first:eqeGlcArb'], 'blog-post': ['/blog/:YhBYX5zBs', '$first:YhBYX5zBs'] };
const LIVE = /^https?:\/\/noverde-128\.webflow\.io/;
const LIVE_DETAIL = { services: ['/services/:VLoWP51rZ'], 'our-impact': ['/our-impact/:mRvnq66r5'], team: ['/team/:eqeGlcArb'], blog: ['/blog/:YhBYX5zBs'] };
function link(l) {
  if (!l || !l.href) return l;
  let h = l.href.replace(LIVE, '') || '/';
  /* live Webflow paths: /about-us, /team/<slug>, … */
  if (h.startsWith('/')) {
    const seg = h.split(/[?#]/)[0].replace(/\/$/, '').split('/').filter(Boolean);
    if (!seg.length) return { ...l, href: '/' };
    if (['style-guide', 'licenses', 'licensing', 'changelog', 'password'].includes(seg[0])) return null;
    if (seg.length === 2 && LIVE_DETAIL[seg[0]]) return { ...l, href: LIVE_DETAIL[seg[0]][0], collectionItem: seg[1] };
    return { ...l, href: '/' + seg.join('/') };
  }
  if (/^(https?:|mailto:|tel:)/.test(h) && !/design\.upqode\.com/.test(h)) return l;
  const m = h.match(/([\w-]+)\.html(#.*)?$/);
  if (!m) return h === '#' || h.startsWith('#') ? null : l;
  if (DROP.has(m[1])) return null;
  if (PATHS[m[1]]) return { ...l, href: PATHS[m[1]] };
  if (DETAIL[m[1]]) return { ...l, href: DETAIL[m[1]][0], collectionItem: DETAIL[m[1]][1] };
  return null;
}

/* ---------- walk ops ---------- */
const COLOR_KEYS = ['fill', 'textColor', 'borderColor'];
function fix(attrs) {
  const a = { ...attrs };
  for (const k of COLOR_KEYS) if (typeof a[k] === 'string' && !a[k].startsWith('data:')) a[k] = /gradient/.test(a[k]) ? inString(a[k]) : (tokenFor(a[k]) ? (tokenFor(a[k]).startsWith('$tok:') ? `var(--$tok:${tokenFor(a[k]).slice(5)})` : tokenFor(a[k])) : a[k]);
  if (typeof a.border === 'string') a.border = inString(a.border);
  /* shadows stay literal: Framer rejects token references inside box-shadow strings */
  if (a.overflowX === 'auto' || a.overflowY === 'auto') { delete a.overflowX; delete a.overflowY; a.overflow = 'clip'; a.name = (a.name || '') + ' [scroll-x]'; }
  if (typeof a.textStylePreset === 'string' && a.textStylePreset.startsWith('$preset:')) a.textStylePreset = presetMap[a.textStylePreset.slice(8)];
  if ('link' in a) { const l = link(a.link); if (l) a.link = l; else delete a.link; }
  if (typeof a.text === 'string') a.text = a.text.replace(/Noverde/g, 'Verdova');
  if (typeof a.name === 'string') a.name = a.name.slice(0, 80);
  /* live container: max-width 1400 incl. 15px padding (the 1280 is the narrower media-query value at 1200) */
  if (a.maxWidth === '1280px') a.maxWidth = '1400px';
  return a;
}
const sections = [];
for (const [name, spec] of Object.entries(B)) {
  if (name.startsWith('$')) continue;
  sections.push({ name, ops: spec.ops.map((o) => ({ ...o, attrs: fix(o.attrs || {}), ...(o.asset ? { asset: o.asset.replace(/\/\/markup-files\/[^/]+\//, '/') } : {}) })) });
}
const out = { widths: B.$widths, tokens: Object.values(newTokens), presets: Object.values(newPresets), sections };
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(outFile, 'sections', sections.length, 'ops', sections.reduce((n, s) => n + s.ops.length, 0), 'newTokens', out.tokens.map((t) => t.name).join(', '), '| newPresets', out.presets.length, '| mapped presets', Object.values(presetMap).filter((v) => !String(v).startsWith('$')).length);
