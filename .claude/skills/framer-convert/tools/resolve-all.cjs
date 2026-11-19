// Resolves every page's native.cjs bundle (n/<page>/spec-bundle.json) into ONE design system and per-page op lists:
//  - colours -> semantic colour tokens (base names from the live CSS variables, alpha steps named by words, no numbers)
//  - presets -> merged across pages by typography, named by the role of the layers that use them (no numbers)
//  - links   -> Framer paths; CMS detail links -> { href:"/<col>/:$COL:<col>", collectionItem:"<slug>" }
// Usage: node resolve-all.cjs <nDir> <out.json> <config.json>
// config: { brand:[from,to], bases:{ "r,g,b": "Name" }, drop:[path segs], detail:{ seg: "colKey" }, livePrefix: "regex" }
const fs = require('fs');
const path = require('path');
const [, , nDir, outFile, cfgFile] = process.argv;
const CFG = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const pages = fs.readdirSync(nDir).filter((d) => fs.existsSync(path.join(nDir, d, 'spec-bundle.json')));

/* ---------- colours ---------- */
const parse = (c) => { const m = String(c).match(/^rgba?\(([^)]+)\)$/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
const COLOR_RE = /rgba?\([^)]*\)/g;
const seen = new Map();
for (const p of pages) for (const m of fs.readFileSync(path.join(nDir, p, 'spec-bundle.json'), 'utf8').match(COLOR_RE) || []) { const c = parse(m); if (c) seen.set(c.join(','), c); }
const WORDS = ['Whisper', 'Trace', 'Faint', 'Haze', 'Veil', 'Hairline', 'Line', 'Subtle', 'Light', 'Pale', 'Soft', 'Mist', 'Smoke', 'Shade', 'Shadow', 'Dusk', 'Muted', 'Quiet', 'Hushed', 'Half', 'Medium', 'Dim', 'Secondary', 'Calm', 'Steady', 'Firm', 'Strong', 'Bold', 'Rich', 'Dense', 'Deep', 'Heavy', 'Intense', 'Dark', 'Thick', 'Solid', 'Opaque'];
const alphas = [...new Set([...seen.values()].map((c) => c[3]).filter((a) => a > 0 && a < 1))].sort((a, b) => a - b);
if (alphas.length > WORDS.length) throw new Error('need more alpha words: ' + alphas.length);
// spread the words over the alpha range so neighbours keep their order
const alphaWord = {}; alphas.forEach((a, i) => (alphaWord[a] = WORDS[Math.round((i * (WORDS.length - 1)) / Math.max(1, alphas.length - 1))]));
const tokens = {};
const hex = (c) => '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
for (const [key, c] of seen) {
  const rgb = c.slice(0, 3).join(',');
  const base = CFG.bases[rgb] || CFG.extra[rgb];
  if (!base) throw new Error('no name for ' + rgb);
  const alphaBase = (CFG.alphaBases || {})[rgb] || base;
  const name = c[3] === 0 ? (c[0] + c[1] + c[2] === 0 ? 'Transparent' : alphaBase + ' Clear') : c[3] === 1 ? base : alphaBase + ' ' + alphaWord[c[3]];
  tokens[key] = { key: 'T' + Object.keys(tokens).length, name, light: c[3] < 1 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})` : hex(c) };
}
const names = Object.values(tokens).map((t) => t.name);
const dup = names.filter((n, i) => names.indexOf(n) !== i); if (dup.length) throw new Error('duplicate token names ' + dup);
const tokRef = (str) => { const c = parse(str); return c ? `var(--$tok:${tokens[c.join(',')].key})` : str; };
const inString = (s) => s.replace(COLOR_RE, (m) => tokRef(m));

/* ---------- presets ---------- */
const presets = {}; // sig -> { key, attrs, slots, uses:{cls:count} }
const presetOf = {}; // page:pkey -> sig
for (const p of pages) {
  const B = JSON.parse(fs.readFileSync(path.join(nDir, p, 'spec-bundle.json'), 'utf8'));
  for (const sp of B.$presets) {
    const sig = JSON.stringify([sp.fontName, sp.fontWeight, sp.fontStyle, sp.textTransform, sp.textDecoration, sp.tag, sp.slots]);
    if (!presets[sig]) presets[sig] = { key: 'P' + Object.keys(presets).length, sp, uses: {} };
    presetOf[p + ':' + sp.key] = sig;
  }
}
/* ---------- links ---------- */
function link(l) {
  if (!l || !l.href) return l;
  let h = String(l.href).replace(new RegExp(CFG.livePrefix), '') || '/';
  if (/^mailto:/.test(h)) return { ...l, href: 'mailto:info@example.com' };
  if (/^(https?:|tel:)/.test(h)) return { ...l, openInNewTab: true };
  if (!h.startsWith('/')) return null;
  const [p0, hash] = h.split('#');
  const seg = p0.split('?')[0].replace(/\/$/, '').split('/').filter(Boolean);
  if (!seg.length) return { ...l, href: '/' + (hash ? '#' + hash : '') };
  if (CFG.drop.includes(seg[0])) return null;
  if (seg[0] === 'category') return { ...l, href: '/blog' };
  if (seg.length === 2 && CFG.detail[seg[0]]) return { ...l, href: `/${CFG.paths[CFG.detail[seg[0]]] || seg[0]}/:$COL:${CFG.detail[seg[0]]}`, collectionItem: seg[1] };
  return { ...l, href: '/' + seg.join('/') + (hash ? '#' + hash : '') };
}
const brand = (s) => s.replace(/Noeta/g, 'Germina').replace(/noeta/g, 'germina').replace(/NOETA/g, 'GERMINA');
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const COLOR_KEYS = ['fill', 'textColor', 'borderColor'];
function fix(attrs, page) {
  const a = { ...attrs };
  for (const k of COLOR_KEYS) if (typeof a[k] === 'string' && !a[k].startsWith('data:')) a[k] = /gradient/.test(a[k]) ? inString(a[k]) : tokRef(a[k]);
  if (a.overflowX === 'auto' || a.overflowY === 'auto') { delete a.overflowX; delete a.overflowY; a.overflow = 'clip'; a.name = (a.name || '') + ' [scroll-x]'; }
  if (typeof a.textStylePreset === 'string' && a.textStylePreset.startsWith('$preset:')) {
    const sig = presetOf[page + ':' + a.textStylePreset.slice(8)];
    const P = presets[sig];
    const cls = (a.name || 'text').split(/[\s[]/)[0];
    P.uses[cls] = (P.uses[cls] || 0) + 1;
    a.textStylePreset = '$preset:' + P.key;
  }
  if ('link' in a) { const l = link(a.link); if (l) a.link = l; else delete a.link; }
  if (typeof a.text === 'string') a.text = brand(a.text).replace(EMAIL, 'info@example.com');
  if (typeof a.name === 'string') a.name = brand(a.name).replace(/\s*\[data-(wf|w)-[^\]]*(\]\]\]|\])+/g, '').trim().slice(0, 80);
  if (typeof a.svg === 'string') a.svg = a.svg.replace(COLOR_RE, (m) => m); // literal colours inside SVG markup stay
  return a;
}
const out = { widths: null, pages: {} };
for (const p of pages) {
  const B = JSON.parse(fs.readFileSync(path.join(nDir, p, 'spec-bundle.json'), 'utf8'));
  out.widths = B.$widths;
  out.pages[p] = Object.entries(B).filter(([k]) => !k.startsWith('$')).map(([name, spec]) => ({ name, ops: spec.ops.map((o) => ({ ...o, attrs: fix(o.attrs || {}, p) })) }));
}
/* preset names from their users: the most frequent layer class, title-cased, without the page prefix */
const title = (s) => s.replace(/^(ab|bl|bd|ct|fq|tm|pf|rs|rc|sl|sd|td|ts|vl|vd)-/, '').split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const taken = new Set();
const ALT = ['Alt', 'Compact', 'Soft', 'Strong', 'Wide', 'Plain', 'Muted', 'Large', 'Small', 'Light', 'Bold', 'Tight', 'Loose', 'Minor', 'Major', 'Fine', 'Bright', 'Calm', 'Crisp', 'Deep'];
const outPresets = [];
for (const P of Object.values(presets).sort((a, b) => Object.values(b.uses).reduce((x, y) => x + y, 0) - Object.values(a.uses).reduce((x, y) => x + y, 0))) {
  const top = Object.entries(P.uses).sort((a, b) => b[1] - a[1]).map(([c]) => c).find((c) => !/^(text|p|div|span|h\d|a|label)$/.test(c));
  let base = title(top || (P.sp.tag === 'p' ? 'Body Text' : 'Heading ' + P.sp.tag.slice(1))) || 'Body Text';
  base = base.replace(/\d+/g, '').trim() || 'Body Text';
  let name = base;
  for (let i = 0; taken.has(name); i++) name = base + ' ' + ALT[i];
  taken.add(name);
  const sp = P.sp;
  outPresets.push({ key: P.key, name, used: Object.values(P.uses).reduce((x, y) => x + y, 0), tag: sp.tag, fontName: sp.fontName, fontWeight: sp.fontWeight, fontStyle: sp.fontStyle || 'normal', textTransform: sp.textTransform || 'none', textDecoration: sp.textDecoration || 'none', slots: sp.slots });
}
out.tokens = Object.values(tokens);
out.presets = outPresets.filter((p) => p.used > 0);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('pages', pages.length, 'tokens', out.tokens.length, 'presets', out.presets.length);
console.log(out.tokens.map((t) => t.name).join(', '));
console.log(out.presets.map((p) => p.name + ' (' + p.slots.map((s) => parseFloat(s.fontSize)).join('/') + ')').join(', '));
