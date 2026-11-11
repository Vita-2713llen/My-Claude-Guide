// Turns the measured element trees (measure.cjs) into native Framer layer specs: frames with stack or grid
// layout, rich text, SVG and image layers, with per-breakpoint overrides for the replicas.
//
// Usage: node native.cjs <measuredDir> <outDir>
// Output per section: <outDir>/<Section>.json = { name, ops: [...] } where every op is
//   { op: "insert", key, type, parent, attrs, asset? }   parent = key of an earlier op, or null for the page
//   { op: "replica", key, w, attrs }                     overrides for the breakpoint of width w
// The Framer-side builder (builder.js) replays the ops and resolves keys to node ids.
const fs = require('fs');
const path = require('path');

const [, , inDir, outDir, posterFile] = process.argv;
// stills of what the motion code draws (canvases, ASCII art), keyed by class, in page order
const POSTERS = posterFile && fs.existsSync(posterFile) ? JSON.parse(fs.readFileSync(posterFile, 'utf8')) : {};
const posterSeen = {};
// classes the motion code queries: such a layer is never dropped from a breakpoint (Framer does not render
// a hidden layer at all, and the code would find null); it stays in the page, see-through and out of flow
const CODE_CLASSES = new Set(process.env.CODE_CLASSES && fs.existsSync(process.env.CODE_CLASSES) ? JSON.parse(fs.readFileSync(process.env.CODE_CLASSES, 'utf8')) : []);
fs.mkdirSync(outDir, { recursive: true });
const idx = JSON.parse(fs.readFileSync(path.join(inDir, 'index.json'), 'utf8'));
// classes the live CSS pushes with margin-top/left:auto ({cls: 'top'|'left'}) — a flexible spacer keeps them at the far edge
const AUTO_M = process.env.AUTO_MARGIN && fs.existsSync(process.env.AUTO_MARGIN) ? JSON.parse(fs.readFileSync(process.env.AUTO_MARGIN, 'utf8')) : {};
const autoSide = (n) => { for (const c of (n.cls || '').split(/\s+/)) if (AUTO_M[c]) return AUTO_M[c]; return null; };
const WIDTHS = idx.widths;
const W0 = WIDTHS[0];

const px = (v) => parseFloat(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;
const P = (v) => r2(v) + 'px';
const near = (a, b, t = 1) => Math.abs(a - b) <= t;

// ---- value conversion ----
function color(c) {
  if (!c || c === 'transparent') return null;
  const cs = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (cs) c = `rgba(${Math.round(cs[1] * 255)}, ${Math.round(cs[2] * 255)}, ${Math.round(cs[3] * 255)}, ${cs[4] === undefined ? 1 : Number(cs[4])})`;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (p.length > 3 && p[3] === 0) return null;
  return p.length > 3 && p[3] < 1 ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})` : `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
}
function splitLayers(v) {
  const out = []; let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function fillOf(st) {
  const img = st.backgroundImage && st.backgroundImage !== 'none' ? splitLayers(st.backgroundImage) : [];
  const grad = img.find((l) => /gradient\(/.test(l));
  const url = img.find((l) => /^url\(/.test(l));
  // a tiled gradient (dot grid, hatching: small background-size) has no Framer equivalent -> keep the base colour
  const tiled = grad && st.backgroundSize && /\d+px/.test(st.backgroundSize) && st.backgroundSize.split(/[ ,]+/).some((v) => /px$/.test(v) && parseFloat(v) < 80);
  if (grad && (tiled || /repeating/.test(grad))) return { fill: color(st.backgroundColor), note: 'pattern dropped' };
  if (grad && /^linear|^radial/.test(grad) && !/repeating/.test(grad)) {
    const fixG = (g) => g.replace(/^linear-gradient\((?!\s*(-?[\d.]+(deg|turn|rad)|to\s))/, 'linear-gradient(180deg, ').replace(/color\(srgb[^)]*\)/g, (m) => color(m) || 'rgba(0, 0, 0, 0)').replace(/^radial-gradient\((circle|ellipse)?\s*(closest-side|farthest-corner|closest-corner|farthest-side)?\s*(at ([^,]+))?,/, (m, sh, ext, a1, at) => 'radial-gradient(50% 50% at ' + (at ? at.trim().replace(/^center$/, '50% 50%') : '50% 50%') + ',');
    const grads = img.filter((l) => /^(linear|radial)-gradient\(/.test(l)).map(fixG);
    const base = color(st.backgroundColor);
    // the background colour sits under every gradient layer: keep it as the fill and draw the gradients above it
    if (base && !/rgba\([^)]*,\s*0\)$/.test(base)) return { fill: base, layers: grads };
    return { fill: grads[grads.length - 1], layers: grads.slice(0, -1) };
  }
  if (url) {
    const u = url.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    if (/^data:image\/svg/.test(u)) return { fill: color(st.backgroundColor), note: 'svg-pattern' };
    return { fill: color(st.backgroundColor), asset: u };
  }
  return { fill: color(st.backgroundColor) };
}
function radius(st) {
  const c = [st.borderTopLeftRadius, st.borderTopRightRadius, st.borderBottomRightRadius, st.borderBottomLeftRadius].map((v) => v.split(' ')[0]);
  if (c.every((v) => px(v) === 0)) return null;
  const f = (v) => (/%$/.test(v) ? v : P(Math.min(px(v), 9999)));
  if (c.every((v) => v === c[0])) return f(c[0]);
  return c.map(f).join(' ');
}
function borders(st) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const w = sides.map((s) => (st['border' + s + 'Style'] === 'none' ? 0 : px(st['border' + s + 'Width'])));
  if (w.every((v) => v === 0)) return {};
  const i = w.findIndex((v) => v > 0);
  const side = sides[i];
  return { borderColor: color(st['border' + side + 'Color']) || 'rgba(0, 0, 0, 0)', borderStyle: st['border' + side + 'Style'] === 'dashed' ? 'dashed' : st['border' + side + 'Style'] === 'dotted' ? 'dotted' : 'solid',
    borderTop: P(w[0]), borderRight: P(w[1]), borderBottom: P(w[2]), borderLeft: P(w[3]) };
}
function shadows(st) {
  if (!st.boxShadow || st.boxShadow === 'none') return null;
  const l = splitLayers(st.boxShadow).filter((s) => !/inset/.test(s));
  if (!l.length) return null;
  // Chrome writes colour first: "rgba(...) 0px 10px 30px 0px" → "0px 10px 30px 0px rgba(...)"
  return l.map((s) => {
    s = s.replace(/color\(srgb[^)]*\)/g, (c) => color(c) || 'rgba(0, 0, 0, 0)');
    const m = s.match(/^(rgba?\([^)]*\)|#\w+)\s+(.*)$/);
    return m ? m[2] + ' ' + m[1] : s;
  });
}
function rotationOf(t) {
  if (!t || t === 'none') return null;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return null;
  const [a, b, c, d] = m[1].split(',').map(Number);
  const deg = r2((Math.atan2(b, a) * 180) / Math.PI);
  const sc = r2(Math.sqrt(a * a + b * b));
  return { rotation: deg, scale: sc };
}
const FONT_MAP = [[/playfair/i, 'Playfair'], [/geist mono/i, 'Geist Mono'], [/inter/i, 'Inter']];
function fontName(ff) {
  const f = (ff || '').split(',')[0].replace(/["']/g, '').trim();
  for (const [re, name] of FONT_MAP) if (re.test(f)) return name;
  return /mono/i.test(ff) ? 'Geist Mono' : 'Inter';
}
function typeAttrs(s, opts = {}) {
  const fs_ = px(s.fontSize);
  const name = fontName(s.fontFamily);
  const a = { fontName: name, fontWeight: Number(s.fontWeight) || 400, fontSize: P(fs_) };
  if (s.fontStyle === 'italic') a.fontStyle = 'italic';
  if (name === 'Inter') a.fontVariationAxes = { opsz: Math.max(14, Math.min(32, Math.round(fs_))), wght: Number(s.fontWeight) || 400 };
  if (!opts.run) {
    a.lineHeight = s.lineHeight === 'normal' ? '1.2em' : r2(px(s.lineHeight) / fs_ * 1000) / 1000 + 'em';
  }
  a.letterSpacing = s.letterSpacing === 'normal' ? '0em' : r2(px(s.letterSpacing) / fs_ * 1000) / 1000 + 'em';
  const fill = s.webkitTextFillColor && color(s.webkitTextFillColor);
  a.textColor = fill && !/rgba\(\d+, \d+, \d+, 0\)/.test(fill) ? fill : color(s.color) || 'rgb(0, 0, 0)';
  if (/gradient/.test(s.backgroundImage || '') && /text/.test(s.webkitBackgroundClip || s.backgroundClip || '')) a.textColor = color(s.color) && color(s.color) !== null ? color(s.color) : 'rgb(255, 255, 255)';
  a.textTransform = s.textTransform && s.textTransform !== 'none' ? s.textTransform : 'none';
  if (/underline/.test(s.textDecorationLine || '')) a.textDecoration = 'underline';
  else if (/line-through/.test(s.textDecorationLine || '')) a.textDecoration = 'line-through';
  return a;
}
const RUN_KEYS = ['fontName', 'fontWeight', 'fontStyle', 'textColor', 'textTransform', 'textDecoration', 'fontSize', 'letterSpacing', 'fontVariationAxes'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- naming: the layer name carries the source classes and the data attributes the motion code reads ----
const NAME_ATTRS = /^(data-(?!dz|mk|nk|pz|pseudo|loose|fed)[\w-]+|hidden)$/;
function layerName(n) {
  let base = (n.cls || '').trim().replace(/\s+/g, ' ');
  if (n.attrs && n.attrs['data-pseudo']) base = 'pseudo-' + n.attrs['data-pseudo'];
  if (!base) base = n.tag === 'span' && n.attrs && 'data-loose' in n.attrs ? 'text' : n.tag;
  const extra = Object.entries(n.attrs || {}).filter(([k]) => NAME_ATTRS.test(k)).map(([k, v]) => (v === '' ? `[${k}]` : `[${k}=${v}]`));
  if (n.kind === 'canvas') extra.push('<canvas>');
  return [base, ...extra].join(' ');
}
const HTML_TAGS = new Set(['article', 'aside', 'button', 'div', 'figcaption', 'figure', 'footer', 'header', 'main', 'nav', 'ol', 'section', 'ul', 'label', 'form']);
const TEXT_TAG = (t) => (/^h[1-6]$/.test(t) ? t : t === 'p' ? 'p' : 'p');
const href = (h) => (!h ? null : h === 'index.html' ? '/' : h.replace(/\.html$/, ''));

// ---- layout of a box at one width ----
function stackedSet(n, w) {
  const kids = (n.children || []).filter((c) => { const b = c.bp[w]; return b && !b.none && !/absolute|fixed/.test(b.st.position); });
  if (kids.length < 2 || !/grid/.test((n.bp[w].st || {}).display || '')) return null;
  const r0 = kids[0].bp[w].r;
  return kids.every((k) => near(k.bp[w].r.x, r0.x, 2) && near(k.bp[w].r.y, r0.y, 2)) ? kids.slice(1) : null;
}
function inflow(n, w) {
  const over = stackedSet(n, w) || [];
  return (n.children || []).filter((c) => { const b = c.bp[w]; return b && !b.none && !/absolute|fixed/.test(b.st.position) && !over.includes(c); });
}
function alignFromRects(kids, b, w) {
  if (!kids.length) return 'start';
  const st = b.st;
  const cl = b.r.x + px(st.paddingLeft) + px(st.borderLeftWidth), cr = b.r.x + b.r.w - px(st.paddingRight) - px(st.borderRightWidth);
  const votes = { start: 0, center: 0, end: 0 };
  for (const k of kids) {
    const r = k.bp[w].r, lg = r.x - cl, rg = cr - (r.x + r.w);
    if (near(lg, 0, 1.5) || near(r.w, cr - cl, 1.5)) votes.start++;
    else if (near(lg, rg, 2)) votes.center++;
    else if (near(rg, 0, 1.5)) votes.end++;
    else votes.start++;
  }
  return Object.entries(votes).sort((x, y) => y[1] - x[1])[0][0];
}
function layoutAt(n, w) {
  const b = n.bp[w], st = b.st;
  const kids = inflow(n, w);
  const L = { kids, dir: 'v', wrap: false, grid: null, distribution: 'start', alignment: 'start', stretch: false };
  const disp = st.display || '';
  if (/flex/.test(disp)) {
    L.dir = /^row/.test(st.flexDirection) ? 'h' : 'v';
    L.wrap = st.flexWrap !== 'nowrap';
    const j = st.justifyContent;
    L.distribution = /space-between/.test(j) ? 'space-between' : /space-around/.test(j) ? 'space-around' : /space-evenly/.test(j) ? 'space-evenly' : /center/.test(j) ? 'center' : /end|right/.test(j) ? 'end' : 'start';
    const a = st.alignItems;
    L.alignment = /center/.test(a) ? 'center' : /end/.test(a) ? 'end' : 'start';
    L.stretch = /normal|stretch/.test(a);
    // margin-left/top:auto pushing the last of two children to the far edge reads as space-between
    if (kids.length === 2 && L.distribution === 'start') {
      const k1 = kids[1].bp[w], gapCss = px(L.dir === 'h' ? st.columnGap : st.rowGap) || 0;
      const m = px(L.dir === 'h' ? k1.st.marginLeft : k1.st.marginTop);
      const cEnd = L.dir === 'h' ? b.r.x + b.r.w - px(st.paddingRight) - px(st.borderRightWidth) : b.r.y + b.r.h - px(st.paddingBottom) - px(st.borderBottomWidth);
      const kEnd = L.dir === 'h' ? k1.r.x + k1.r.w : k1.r.y + k1.r.h;
      if (m > gapCss + 8 && near(kEnd, cEnd, 2)) L.distribution = 'space-between';
    }
    // space-between whose children already fill the main axis (content-sized box) is just start + gap;
    // keep the gap: Framer refuses a gap together with space-between and the converter would lose it
    if (L.distribution === 'space-between' && !L.wrap && kids.length > 1) {
      const g = px(L.dir === 'h' ? st.columnGap : st.rowGap) || 0;
      if (g > 0) {
        const inner = L.dir === 'h' ? b.r.w - px(st.paddingLeft) - px(st.paddingRight) - px(st.borderLeftWidth) - px(st.borderRightWidth) : b.r.h - px(st.paddingTop) - px(st.paddingBottom) - px(st.borderTopWidth) - px(st.borderBottomWidth);
        const used = kids.reduce((t, k) => t + (L.dir === 'h' ? k.bp[w].r.w : k.bp[w].r.h), 0) + (kids.length - 1) * g;
        if (Math.abs(inner - used) <= 2) L.distribution = 'start';
      }
    }
  } else if (/grid/.test(disp)) {
    const cols = (st.gridTemplateColumns || '').split(/\s+/).map(px).filter((v) => v > 0);
    if (cols.length > 1) {
      const eq = cols.every((c) => near(c, cols[0], 1.5));
      const oneRow = kids.length <= cols.length || kids.every((k) => near(k.bp[w].r.y, kids[0].bp[w].r.y, 2));
      if (eq) L.grid = { cols: cols.length };
      else if (oneRow) { L.dir = 'h'; L.colW = cols; }
      else L.grid = { cols: cols.length, uneven: cols };
    }
    const a = st.alignItems;
    L.alignment = L.dir === 'h' || L.grid ? (/center/.test(a) ? 'center' : /end/.test(a) ? 'end' : 'start') : alignFromRects(kids, b, w);
    L.stretch = L.dir === 'h' || L.grid ? /normal|stretch/.test(a) : true;
    const jc = st.justifyContent;
    if (L.dir === 'h' && /center/.test(jc)) L.distribution = 'center';
  } else {
    // block flow: children on one row read as a horizontal stack
    if (kids.length > 1 && kids.every((k, i) => i === 0 || (near(k.bp[w].r.y, kids[0].bp[w].r.y, 3) && k.bp[w].r.x >= kids[i - 1].bp[w].r.x + kids[i - 1].bp[w].r.w - 1))) L.dir = 'h';
    L.stretch = L.dir === 'v';
    if (L.dir === 'v' && kids.length) {
      const cl = b.r.x + px(st.paddingLeft) + px(st.borderLeftWidth), cr = b.r.x + b.r.w - px(st.paddingRight) - px(st.borderRightWidth);
      const centred = kids.every((k) => { const r = k.bp[w].r; return near(r.x - cl, cr - (r.x + r.w), 2) && r.x - cl > 2; });
      if (centred) L.alignment = 'center';
      if (st.textAlign === 'center' && kids.every((k) => k.kind === 'text' || k.kind === 'svg')) L.alignment = 'center';
    }
  }
  // margin:auto in a column: every child narrower than the column sits in its middle -> centre the stack
  if (L.dir === 'v' && !L.grid && kids.length && L.alignment === 'start') {
    const cl = b.r.x + px(st.paddingLeft) + px(st.borderLeftWidth), cr = b.r.x + b.r.w - px(st.paddingRight) - px(st.borderRightWidth);
    const narrow = kids.filter((k) => k.bp[w].r.w < cr - cl - 2);
    if (narrow.length && narrow.every((k) => { const r = k.bp[w].r; return near(r.x - cl, cr - (r.x + r.w), 2) && r.x - cl > 2; })) L.alignment = 'center';
  }
  // a slider track: the children together are wider than the row, so each keeps its own width
  if (L.dir === 'h' && !L.grid && kids.length > 1) {
    const cw = b.r.w - px(st.paddingLeft) - px(st.paddingRight) - px(st.borderLeftWidth) - px(st.borderRightWidth);
    const total = kids.reduce((t, k) => t + k.bp[w].r.w, 0) + (kids.length - 1) * (px(st.columnGap) || 0);
    L.overflowing = total > cw + 2;
  }
  return L;
}
function spacings(L, w) {
  const ks = L.kids;
  const s = [];
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1].bp[w].r, c = ks[i].bp[w].r;
    s.push(L.dir === 'v' ? c.y - (a.y + a.h) : c.x - (a.x + a.w));
  }
  return s.map(r2);
}

// ---- text style presets: one per distinct typography, sized at every breakpoint ----
const TYPE_KEYS = ['fontName', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight', 'letterSpacing', 'textTransform', 'textDecoration', 'fontVariationAxes'];
const PRESETS = {};
function displayFont(n, all) {
  const a = all.find((x) => x.visible !== false) || all[0];
  return a.fontName;
}
function presetFor(n, all) {
  const shown = all.map((a, i) => (a.visible !== false ? a : null));
  const ref = shown.find(Boolean);
  // text-style slots follow the three type breakpoints, whatever extra page breakpoints were measured
  const TYPE_W = [W0, 810, 390].filter((w) => WIDTHS.includes(w));
  const at = (i) => shown[WIDTHS.indexOf(TYPE_W[i])] || ref;
  const slot = (a) => ({ fontSize: P(px(a.fontSize)), lineHeight: a.lineHeight, letterSpacing: a.letterSpacing });
  const font = displayFont(n, all);
  const sig = { fontName: font, fontWeight: ref.fontWeight, fontStyle: ref.fontStyle || 'normal', textTransform: ref.textTransform || 'none', textDecoration: ref.textDecoration || 'none',
    tag: /^h[1-6]$/.test(n.tag) ? n.tag : 'p', slots: TYPE_W.map((w, i) => slot(at(i))) };
  const key = JSON.stringify(sig);
  if (!PRESETS[key]) {
    const sizes = [...new Set(sig.slots.map((x) => px(x.fontSize)))].join('–');
    const wname = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[sig.fontWeight] || sig.fontWeight;
    const fam = font === 'Playfair' ? 'Serif' : font === 'Geist Mono' ? 'Mono' : 'Sans';
    let name = `Verdova/${fam} ${sizes} ${wname}${sig.textTransform === 'uppercase' ? ' Caps' : ''}${sig.fontStyle === 'italic' ? ' Italic' : ''}`;
    const taken = new Set(Object.values(PRESETS).map((p) => p.name));
    for (let i = 2; taken.has(name); i++) name = name.replace(/ #\d+$/, '') + ' #' + i;
    PRESETS[key] = { key: 'p' + Object.keys(PRESETS).length, name, ...sig };
  }
  return '$preset:' + PRESETS[key].key;
}

// ---- text with its own surface (buttons, tabs, pills) becomes a frame around a text layer ----
function hasBox(st) {
  if (!st || !st.display) return false;
  const pad = ['Top', 'Right', 'Bottom', 'Left'].some((k) => px(st['padding' + k]) > 0);
  const bord = ['Top', 'Right', 'Bottom', 'Left'].some((k) => st['border' + k + 'Style'] !== 'none' && px(st['border' + k + 'Width']) > 0);
  const bg = !!color(st.backgroundColor) || (st.backgroundImage && st.backgroundImage !== 'none' && !/text/.test((st.webkitBackgroundClip || '') + (st.backgroundClip || '')));
  return pad || bord || bg || /flex|grid/.test(st.display) || (st.boxShadow && st.boxShadow !== 'none');
}
function wrapBoxedText(n) {
  if (n.children) n.children.forEach(wrapBoxedText);
  if (n.kind !== 'text') return;
  if (!WIDTHS.some((w) => n.bp[w] && !n.bp[w].none && hasBox(n.bp[w].st))) return;
  const child = { k: n.k + ':label', tag: /^h[1-6]|p$/.test(n.tag) ? n.tag : 'span', cls: '', attrs: {}, kind: 'text', runs: n.runs, bp: {} };
  for (const w of WIDTHS) {
    const b = n.bp[w];
    if (!b || b.none) { child.bp[w] = { ...b, none: true }; continue; }
    const st = b.st;
    const bl = px(st.borderLeftWidth) + px(st.paddingLeft), br = px(st.borderRightWidth) + px(st.paddingRight);
    const bt = px(st.borderTopWidth) + px(st.paddingTop), bb = px(st.borderBottomWidth) + px(st.paddingBottom);
    const cst = { ...st, display: 'block', position: 'static', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
      borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none',
      maxWidth: 'none', minHeight: '0px', flexGrow: '0', opacity: '1', visibility: 'visible', transform: 'none' };
    const cw = Math.max(0, b.r.w - bl - br);
    child.bp[w] = { r: { x: b.r.x + bl, y: b.r.y + bt, w: cw, h: Math.max(0, b.r.h - bt - bb) }, st: cst, none: false, dw: 0, autoW: cw, autoH: b.r.h - bt - bb, runs: b.runs, pvis: st.visibility };
    if (/flex/.test(st.display)) child.bp[w].r = { ...child.bp[w].r, y: b.r.y + bt + Math.max(0, (b.r.h - bt - bb - px(st.lineHeight)) / 2), h: Math.min(b.r.h - bt - bb, px(st.lineHeight) || b.r.h) };
  }
  n.kind = 'box';
  delete n.runs;
  n.children = [child];
}


// An uneven grid that is more than one row (a quote card: text over [avatar | byline]; a lead card: [photo | text over byline])
// has no native Framer form. Split it into its rows — or, when one child spans every row, into its columns — and wrap each
// group of two or more children in a stack, so fixed tracks (avatar, photo) keep their size and the rest flows.
function regrid(n) {
  if (n.children) n.children.forEach(regrid);
  const b0 = n.bp[W0];
  if (n.kind !== 'box' || !b0 || b0.none || !/grid/.test(b0.st.display || '')) return;
  const cols = (b0.st.gridTemplateColumns || '').split(/\s+/).map(px).filter((v) => v > 0);
  if (cols.length < 2 || cols.every((c) => near(c, cols[0], 1.5))) return;
  const isIn = (k, w) => k.bp[w] && !k.bp[w].none && !/absolute|fixed/.test(k.bp[w].st.position);
  const kids = (n.children || []).filter((k) => isIn(k, W0));
  if (kids.length < 3 || kids.length !== (n.children || []).length) return;
  if (kids.every((k) => near(k.bp[W0].r.y, kids[0].bp[W0].r.y, 2))) return; // one row: the colW path handles it
  const bands = (axis) => {
    const ext = (k) => { const r = k.bp[W0].r; return axis === 'y' ? [r.y, r.y + r.h] : [r.x, r.x + r.w]; };
    let gs = kids.map((k) => { const [lo, hi] = ext(k); return { lo, hi, ks: [k] }; });
    for (let merged = true; merged;) {
      merged = false;
      outer: for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        if (gs[i].lo < gs[j].hi - 1 && gs[j].lo < gs[i].hi - 1) { gs[i] = { lo: Math.min(gs[i].lo, gs[j].lo), hi: Math.max(gs[i].hi, gs[j].hi), ks: [...gs[i].ks, ...gs[j].ks] }; gs.splice(j, 1); merged = true; break outer; }
      }
    }
    return gs.sort((a, c) => a.lo - c.lo);
  };
  let axis = 'y', gs = bands('y');
  if (gs.length < 2) { axis = 'x'; gs = bands('x'); }
  if (gs.length < 2 || gs.every((g) => g.ks.length === 1)) return;
  const order = (ks, w) => [...ks].sort((a, c) => (axis === 'y' ? a.bp[w].r.x - c.bp[w].r.x : a.bp[w].r.y - c.bp[w].r.y));
  const union = (ks, w) => { const rs = ks.map((k) => k.bp[w].r); const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y)); return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }; };
  const flowOf = (rs) => (rs.length > 1 && rs.every((r, i) => i === 0 || r.x >= rs[i - 1].x + rs[i - 1].w - 1) ? 'row' : 'column');
  const flat = { display: 'flex', position: 'static', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none', maxWidth: 'none', minHeight: '0px', flexGrow: '0', opacity: '1', visibility: 'visible', transform: 'none', justifyContent: 'flex-start', flexWrap: 'nowrap', gridTemplateColumns: 'none', marginLeft: '0px', marginTop: '0px' };
  const next = gs.map((g, gi) => {
    if (g.ks.length === 1) return g.ks[0];
    const wrap = { k: n.k + ':g' + gi, tag: 'div', cls: (n.cls || '').split(/\s+/)[0] + '-group', attrs: {}, kind: 'box', children: order(g.ks, W0), bp: {} };
    for (const w of WIDTHS) {
      if (!g.ks.some((k) => isIn(k, w))) { wrap.bp[w] = { ...(n.bp[w] || {}), none: true }; continue; }
      const shown = order(g.ks.filter((k) => isIn(k, w)), w);
      const rs = shown.map((k) => k.bp[w].r), r = union(shown, w), dir = flowOf(rs);
      const mids = rs.map((q) => (dir === 'row' ? q.y + q.h / 2 : q.x + q.w / 2)), tops = rs.map((q) => (dir === 'row' ? q.y : q.x));
      const ai = mids.every((m) => near(m, mids[0], 2)) && !tops.every((t) => near(t, tops[0], 1)) ? 'center' : 'flex-start';
      const st = n.bp[w].st;
      wrap.bp[w] = { r, st: { ...st, ...flat, flexDirection: dir, alignItems: ai, columnGap: st.columnGap, rowGap: st.rowGap }, none: false,
        dw: Math.max(...shown.map((k) => k.bp[w].dw || 0)), autoW: r.w, autoH: r.h, pvis: 'visible' };
    }
    return wrap;
  });
  n.children = next;
  for (const w of WIDTHS) {
    const b = n.bp[w];
    if (!b || b.none) continue;
    const rs = next.filter((k) => k.bp[w] && !k.bp[w].none).map((k) => k.bp[w].r).sort((a, c) => (axis === 'y' ? a.y - c.y : a.x - c.x));
    b.st = { ...b.st, display: 'flex', flexDirection: flowOf(axis === 'y' ? [...rs].sort((a, c) => a.x - c.x) : rs), alignItems: 'stretch', justifyContent: 'flex-start', flexWrap: 'nowrap', gridTemplateColumns: 'none' };
  }
}

// ---- spec building ----
function build(sec) {
  const ops = [];
  const notes = [];
  let spacerSeq = 0;

  function attrsAt(n, w, parent, PL) {
    const b = n.bp[w];
    if (!b || b.none) return { visible: false };
    const st = b.st, r = { ...b.r };
    if (b.ow && b.oh && rotationOf(st.transform) && rotationOf(st.transform).rotation) {
      // a rotated box: its own size, centred where the visual box is
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2; r.w = b.ow; r.h = b.oh; r.x = cx - r.w / 2; r.y = cy - r.h / 2;
    }
    const a = { visible: true };
    const pb = parent ? parent.bp[w] : null;
    const overlay = parent && (stackedSet(parent, w) || []).includes(n);
    const abs = /absolute|fixed/.test(st.position) || overlay;
    // ---- position and size ----
    if (!parent) {
      a.width = '100%';
      a.height = inflow(n, w).length && near(b.autoH, r.h, 1) ? 'auto' : P(r.h);
      if (st.position === 'fixed') { a.position = 'fixed'; a.left = '0px'; a.right = '0px'; a.top = P(px(st.top)); a.bottom = null; a.zIndex = 10; }
      else if (st.position === 'sticky') { a.position = 'sticky'; a.positionStickyTop = P(px(st.top)); }
      else a.position = 'relative';
    } else if (abs) {
      const pr = pb.r;
      const pbl = px(pb.st.borderLeftWidth), pbt = px(pb.st.borderTopWidth);
      const left = r.x - pr.x - pbl, top = r.y - pr.y - pbt;
      const innerW = pr.w - pbl - px(pb.st.borderRightWidth), innerH = pr.h - pbt - px(pb.st.borderBottomWidth);
      a.position = st.position === 'fixed' ? 'fixed' : 'absolute';
      if (overlay) { a.left = P(r.x - pr.x - pbl); a.top = P(r.y - pr.y - pbt); a.right = null; a.bottom = null; a.width = P(r.w); a.height = n.kind === 'text' ? 'auto' : P(r.h); a.$overlay = true; }
      else
      if (st.position === 'fixed') { a.position = 'absolute'; a.left = '0px'; a.top = '0px'; a.right = '0px'; a.bottom = null; a.width = '100%'; a.height = '100vh'; }
      else {
        const fullW = near(r.w, innerW, 1) && near(left, 0, 1), fullH = near(r.h, innerH, 1) && near(top, 0, 1);
        if (fullW) { a.left = '0px'; a.right = '0px'; a.width = '100%'; } else if (st.right !== 'auto' && st.left === 'auto') { a.right = P(innerW - left - r.w); a.left = null; a.width = P(r.w); } else { a.left = P(left); a.right = null; a.width = P(r.w); }
        if (fullH) { a.top = '0px'; a.bottom = '0px'; a.height = '100%'; } else if (st.bottom !== 'auto' && st.top === 'auto') { a.bottom = P(innerH - top - r.h); a.top = null; a.height = P(r.h); } else { a.top = P(top); a.bottom = null; a.height = P(r.h); }
        if (n.kind === 'text') { delete a.height; a.height = 'auto'; if (a.top === null) delete a.top; }
      }
    } else {
      a.position = 'relative';
      const contentW = pb.r.w - px(pb.st.paddingLeft) - px(pb.st.paddingRight) - px(pb.st.borderLeftWidth) - px(pb.st.borderRightWidth);
      const contentH = pb.r.h - px(pb.st.paddingTop) - px(pb.st.paddingBottom) - px(pb.st.borderTopWidth) - px(pb.st.borderBottomWidth);
      const fluid = (b.dw || 0) > 0.5;
      const hasKids = inflow(n, w).length > 0;
      const hug = near(b.autoW, r.w, 1);
      const hugParent = PL.selfW === 'auto';
      if (PL.grid) {
        a.width = '1fr';
        const span = (st.gridColumnStart + '/' + st.gridColumnEnd).match(/span (\d+)/);
        if (span) a.gridItemColumnSpan = Number(span[1]);
        else if (/^-?\d+$/.test(st.gridColumnStart) && /^-?\d+$/.test(st.gridColumnEnd) && Number(st.gridColumnEnd) - Number(st.gridColumnStart) > 1) a.gridItemColumnSpan = Number(st.gridColumnEnd) - Number(st.gridColumnStart);
        if (st.gridColumnEnd === '-1' && st.gridColumnStart === '1') a.gridItemColumnSpan = 'all';
      } else if (PL.dir === 'h' && PL.overflowing) {
        a.width = P(r.w);
      } else if (PL.dir === 'h') {
        if (PL.colW) {
          // a grid column that keeps its width when the viewport changes is a fixed track (avatar, icon); the others share the rest
          const i = PL.kids.indexOf(n);
          const fl = PL.kids.map((k, j) => ((k.bp[w].dw || 0) > 0.5 ? PL.colW[j] : 0)).filter((v) => v > 0);
          if (fl.length && !fluid) a.width = P(r.w);
          else { const minC = Math.min(...(fl.length ? fl : PL.colW)); a.width = r2((PL.colW[i] || r.w) / minC) + 'fr'; }
        } else if (fluid) {
          const fl = PL.kids.filter((k) => (k.bp[w].dw || 0) > 0.5).map((k) => k.bp[w].r.w);
          const minW = Math.min(...fl);
          a.width = fl.every((v) => near(v, fl[0], 2)) ? '1fr' : r2(r.w / minW) + 'fr';
        } else if (n.kind === 'text') a.width = hug && r.h < (px(st.lineHeight) || px(st.fontSize) * 1.2) * 1.5 ? 'auto' : P(r.w);
        else a.width = hasKids && hug ? 'auto' : P(r.w);
      } else if (hugParent) {
        const lines = n.kind === 'text' ? r.h / (px(st.lineHeight) || px(st.fontSize) * 1.2) : 1;
        a.width = n.kind === 'text' ? (lines > 1.5 ? P(r.w) : 'auto') : hasKids ? 'auto' : P(r.w);
      } else {
        if (fluid || near(r.w, contentW, 1)) {
          a.width = near(r.w, contentW, 1.5) || px(st.maxWidth) ? (n.kind === 'text' ? '1fr' : '100%') : r2((r.w / contentW) * 100) + '%';
        } else if (n.kind === 'text') {
          // one line of text in a column fills it, so it wraps on narrower screens instead of running out of the box;
          // a left-aligned label inside a centred column keeps hugging so it stays in the middle
          const single = hug && r.h < px(st.lineHeight) * 1.6 + 1;
          a.width = single ? (PL.alignment === 'center' && !/center/.test(st.textAlign) ? 'auto' : '1fr') : P(r.w);
        }
        else a.width = hasKids && hug ? 'auto' : P(r.w);
      }
      const mw = (st.maxWidth || '').match(/([\d.]+)px/);
      // measured at a wide desktop: a box held by its CSS max-width is a fluid container, not a fixed box
      if (mw && near(r.w, Number(mw[1]), 1.5) && !/svg|img|canvas|embed/.test(n.kind)) a.width = n.kind === 'text' || PL.dir === 'h' ? '1fr' : '100%';
      // a multi-line text or a content box with a fixed width in a column: keep the measure as max-width so it shrinks below 1440
      else if (/px$/.test(a.width || '') && PL.dir !== 'h' && !hugParent && r.w < contentW - 2 && !/svg|img|canvas|embed/.test(n.kind) && (n.kind === 'text' || hasKids)) { a.maxWidth = a.width; a.width = n.kind === 'text' ? '1fr' : '100%'; }
      if (mw && (a.width === '1fr' || a.width === '100%' || /%$/.test(a.width))) a.maxWidth = P(Number(mw[1]));
      // height
      if (n.kind === 'text') a.height = 'auto';
      else if (/svg|img|canvas|embed/.test(n.kind)) {
        a.height = PL.dir === 'h' && PL.stretch && near(r.h, contentH, 1) && !/svg|img/.test(n.kind) && PL.selfH !== 'auto' ? '1fr' : P(r.h);
      } else {
        const autoOk = hasKids && near(b.autoH, r.h, 1);
        const mainV = PL.dir === 'v' && !PL.grid;
        const surface = (q) => (q.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(q.backgroundColor)) || (q.backgroundImage && q.backgroundImage !== 'none') || px(q.borderTopWidth) > 0 || px(q.borderLeftWidth) > 0;
        // equal-height cards in a row: each fills the row, so a card whose copy wraps longer never leaves its neighbours short
        const eqRow = (PL.dir === 'h' || PL.grid) && PL.stretch && hasKids && !PL.overflowing && PL.kids.length > 1 && surface(st)
          && PL.kids.filter((k) => near(k.bp[w].r.y, r.y, 2)).every((k) => near(k.bp[w].r.h, r.h, 1.5)) && PL.kids.filter((k) => near(k.bp[w].r.y, r.y, 2)).length > 1;
        if (eqRow) a.height = '1fr';
        else if (autoOk) a.height = 'auto';
        else if (mainV && Number(st.flexGrow) > 0) a.height = '1fr';
        else if ((PL.dir === 'h' || PL.grid) && PL.stretch && near(r.h, contentH, 1.5) && contentH > 0 && PL.selfH !== 'auto') a.height = '1fr';
        // a card stretched to the tallest in its row (equal-height cards): fill the row, so it follows whichever card is tallest
        else if ((PL.dir === 'h' || PL.grid) && PL.stretch && hasKids && b.autoH && b.autoH < r.h - 1 && !PL.overflowing) a.height = '1fr';
        else if (hasKids && px(st.minHeight) && near(r.h, px(st.minHeight), 1)) { a.height = 'auto'; a.minHeight = P(px(st.minHeight)); }
        // a slider card stretched to its tallest neighbour: keep that height as a floor, so text that wraps one line more never clips
        else if (hasKids && b.autoH && b.autoH < r.h - 1 && PL.dir === 'h' && PL.overflowing) { a.height = 'auto'; a.minHeight = P(r.h); }
        else a.height = P(r.h);
      }
      if (hasKids && a.height !== 'auto' && px(st.minHeight) && !a.minHeight && near(r.h, px(st.minHeight), 1)) { a.height = 'auto'; a.minHeight = P(px(st.minHeight)); }
    }
    // ---- surface ----
    const clipText = /text/.test((st.webkitBackgroundClip || '') + (st.backgroundClip || ''));
    if (n.kind !== 'text' && n.kind !== 'svg' && !clipText) {
      const f = fillOf(st);
      a.fill = f.fill || null;
      if (f.asset) a.$asset = f.asset;
      if (f.note) notes.push(layerName(n) + ': ' + f.note);
      if (f.layers && f.layers.length) a.$layers = f.layers;
      Object.assign(a, borders(st));
      const rad = radius(st); a.radius = rad || null;
      const sh = shadows(st); a.boxShadows = sh || null;
    }
    if (n.kind === 'img') { a.$asset = n.src; a.fill = null; if (n.attrs && n.attrs.alt) a.altText = n.attrs.alt; }
    const op = Number(st.opacity);
    a.opacity = op < 1 ? op : 1;
    if (a.$overlay) { a.opacity = 0; delete a.$overlay; }
    if (abs && r.w <= 1 && r.h <= 1 && /hidden|clip/.test(st.overflowX)) { a.opacity = 0; a.width = '1px'; a.height = '1px'; a.pointerEvents = 'none'; }
    // hidden at rest (a menu, a stage the motion brings in) stays in the page, see-through
    if (st.visibility === 'hidden' && b.pvis !== 'hidden') a.opacity = 0;
    if (n.kind !== 'text' && n.kind !== 'svg') {
      const ox = st.overflowX, oy = st.overflowY;
      const ov = (v) => (/hidden|clip/.test(v) ? 'clip' : /auto|scroll/.test(v) ? 'auto' : 'visible');
      if (ox === oy) a.overflow = ov(ox); else { a.overflowX = ov(ox); a.overflowY = ov(oy); }
    }
    if (st.zIndex !== 'auto' && parent && Number(st.zIndex) > 0) a.zIndex = Number(st.zIndex);
    const rot = rotationOf(st.transform);
    if (rot && rot.rotation) a.rotation = rot.rotation + 'deg';
    if (st.mixBlendMode && st.mixBlendMode !== 'normal') a.blendingMode = st.mixBlendMode;
    const blur = (st.filter || '').match(/blur\(([\d.]+)px\)/); if (blur) a.blur = P(blur[1]);
    const gray = (st.filter || '').match(/grayscale\(([\d.]+)(%?)\)/); if (gray) a.grayscale = (gray[2] ? Number(gray[1]) : Number(gray[1]) * 100) + '%';
    const bblur = (st.backdropFilter || '').match(/blur\(([\d.]+)px\)/); if (bblur) a.backgroundBlur = P(bblur[1]);
    if (st.cursor === 'pointer' && n.kind !== 'svg') a.cursor = 'pointer';
    if (n.kind === 'svg') { delete a.overflow; delete a.overflowX; delete a.overflowY; }
    if (st.pointerEvents === 'none' && !a.pointerEvents) a.pointerEvents = 'none';
    // ---- layout ----
    if (n.kind === 'box') {
      const L = layoutAt(n, w);
      if (L.kids.length) {
        if (L.grid) {
          Object.assign(a, { layout: 'grid', gridColumnCount: L.grid.cols, gridRowHeightType: 'fit', gridAlignment: 'start',
            gap: P(px(st.rowGap) || 0) + ' ' + P(px(st.columnGap) || 0) });
          if (L.grid.uneven) notes.push(layerName(n) + ': uneven grid columns ' + L.grid.uneven.join('/') + ' at ' + w);
        } else {
          a.layout = 'stack';
          a.stackDirection = L.dir === 'h' ? 'horizontal' : 'vertical';
          a.stackDistribution = L.distribution;
          a.stackAlignment = L.alignment;
          a.stackWrapEnabled = !!L.wrap && a.width !== 'auto' && !(L.dir === 'h' && L.kids.every((k) => near(k.bp[w].r.y, L.kids[0].bp[w].r.y, 2)));
        }
        // padding: CSS on the cross axis, measured on the main axis (margins included)
        const pt = px(st.paddingTop) + px(st.borderTopWidth), pr = px(st.paddingRight) + px(st.borderRightWidth);
        const pbm = px(st.paddingBottom) + px(st.borderBottomWidth), pl = px(st.paddingLeft) + px(st.borderLeftWidth);
        let pad = [pt, pr, pbm, pl];
        if (!L.grid && !L.wrap) {
          const rs = L.kids.map((k) => k.bp[w].r);
          const minY = Math.min(...rs.map((q) => q.y)), maxY = Math.max(...rs.map((q) => q.y + q.h)), minX = Math.min(...rs.map((q) => q.x));
          if (L.dir === 'v') {
            if (L.distribution === 'start') pad[0] = Math.max(0, minY - r.y);
            if (a.height === 'auto') pad[2] = Math.max(0, r.y + r.h - maxY);
          } else if (L.distribution === 'start' && !L.colW) {
            pad[3] = Math.max(0, minX - r.x);
          }
        }
        a.padding = pad.map(P).join(' ');
        // a capped container (max-width + margin auto) sits in the middle at every wider screen
        // only when that child fills the column here (a capped container) — a narrower, left-aligned title stays left
        const cw0 = r.w - pad[1] - pad[3];
        const capped = L.kids.filter((k) => { const m = (k.bp[w].st.maxWidth || '').match(/([\d.]+)px/); return m && Number(m[1]) >= 900; });
        const isCapped = (k) => { const m = (k.bp[w].st.maxWidth || '').match(/([\d.]+)px/); return k.bp[w].r.w >= cw0 - 2 || (m && near(k.bp[w].r.w, Number(m[1]), 1.5)); };
        const narrowLeft = L.kids.some((k) => { const kr = k.bp[w].r; return !isCapped(k) && kr.w < cw0 - 2 && near(kr.x - (r.x + pad[3]), 0, 2); });
        if (a.stackDirection === 'vertical' && capped.length && capped.every(isCapped) && !narrowLeft) a.stackAlignment = 'center';
        a.$L = L;
      } else if ((n.children || []).some((c) => c.bp[w] && !c.bp[w].none)) {
        // only absolute children: a plain frame they pin to
      }
    }
    // ---- text ----
    if (n.kind === 'text') {
      Object.assign(a, typeAttrs(st));
      const g = clipText ? fillOf(st).fill : (PL && PL.textGrad) || null;
      if (g && /gradient/.test(g)) a.textColor = g;
      a.$type = { fontSize: px(st.fontSize), lineHeight: a.lineHeight, letterSpacing: a.letterSpacing };
      a.tag = TEXT_TAG(n.tag);
      a.textAlignment = /center/.test(st.textAlign) ? 'center' : /right|end/.test(st.textAlign) ? 'right' : /justify/.test(st.textAlign) ? 'justify' : 'left';
      if (st.whiteSpace === 'nowrap' && a.width !== 'auto' && PL && PL.dir === 'h') a.width = 'auto';
    }
    if (n.tag === 'a' && n.attrs && n.attrs.href) a.link = { href: href(n.attrs.href), openInNewTab: n.attrs.target === '_blank' };
    return a;
  }

  // gap or spacers, decided once per container across every width
  function gapPlan(n) {
    const plan = { mode: 'gap', perW: {} };
    for (const w of WIDTHS) {
      const b = n.bp[w];
      if (!b || b.none || n.kind !== 'box') continue;
      const L = layoutAt(n, w);
      if (!L.kids.length || L.grid) continue;
      if (L.wrap) { plan.perW[w] = { gap: L.dir === 'v' ? px(b.st.rowGap) : px(b.st.columnGap), rowGap: px(b.st.rowGap) }; continue; }
      if (/space/.test(L.distribution)) { plan.perW[w] = { none: true }; continue; }
      if (L.colW) { plan.perW[w] = { gap: px(b.st.columnGap) }; continue; }
      const s = spacings(L, w);
      if (!s.length) { plan.perW[w] = { gap: 0 }; continue; }
      if (L.kids.some((k, i) => i > 0 && autoSide(k) === (L.dir === 'h' ? 'left' : 'top'))) { plan.mode = 'spacers'; plan.perW[w] = { s }; continue; }
      const g = Math.min(...s);
      if (s.every((v) => near(v, s[0], 1))) plan.perW[w] = { gap: Math.max(0, s[0]) };
      else { plan.mode = 'spacers'; plan.perW[w] = { s }; }
    }
    return plan;
  }

  // A layer the motion code queries, or one that wraps such a layer, stays in the DOM at every
  // breakpoint (invisible where the design hides it), so the code always finds its elements.
  const codeMemo = new Map();
  function holdsCode(n) {
    if (codeMemo.has(n)) return codeMemo.get(n);
    const v = (n.cls || '').split(/\s+/).some((c) => CODE_CLASSES.has(c)) || (n.children || []).some(holdsCode);
    codeMemo.set(n, v);
    return v;
  }

  const NODES = {};
  function emit(n, parent, parentKey, PLs, inLink) {
    NODES[n.k] = n;
    const all = WIDTHS.map((w) => attrsAt(n, w, parent, PLs[w]));
    if (holdsCode(n)) {
      const shownI = all.findIndex((a) => a.visible !== false);
      const hiddenSomewhere = all.some((b) => b.visible === false);
      if (shownI >= 0) all.forEach((a, i) => {
        if (a.visible !== false) { if (hiddenSomewhere && !a.pointerEvents) a.pointerEvents = 'auto'; return; }
        const r = n.bp[WIDTHS[shownI]].r;
        // a box is also folded to 0 × 0 and clipped, so a reveal that tweens its opacity to 1 still shows nothing
        const box = n.kind !== 'text';
        all[i] = { ...all[shownI], visible: true, opacity: 0, pointerEvents: 'none', position: 'absolute', left: '0px', top: '0px', right: null, bottom: null, width: box ? '0px' : P(r.w), height: box ? '0px' : 'auto', ...(box ? { overflow: 'clip' } : {}) };
      });
    }
    const shownAt = WIDTHS.filter((w, i) => all[i].visible !== false);
    if (!shownAt.length) return;
    const baseW = shownAt[0];
    const base = { ...all[WIDTHS.indexOf(baseW)] };
    if (baseW !== W0) base.visible = false;
    const type = n.kind === 'text' ? 'RichTextNode' : n.kind === 'svg' ? 'SVGNode' : 'FrameNode';
    const name = layerName(n);
    const myL = {};
    WIDTHS.forEach((w, i) => { myL[w] = all[i].$L || null; });
    const plan = n.kind === 'box' ? gapPlan(n) : null;
    const clean = (a, w) => {
      const o = { ...a }; delete o.$L; delete o.$asset; delete o.$type; delete o.$layers;
      if (n.kind === 'text') for (const k of TYPE_KEYS) delete o[k];
      if (inLink) delete o.link;
      if (plan && o.layout === 'stack') {
        const p = plan.perW[w];
        if (plan.mode === 'spacers' || (p && p.none)) { if (p && p.none) delete o.gap; else o.gap = '0px'; }
        else if (p) o.gap = o.stackWrapEnabled ? P(p.rowGap) + ' ' + P(p.gap) : P(p.gap);
      }
      if (o.stackDistribution && /space/.test(o.stackDistribution)) delete o.gap;
      return o;
    };
    const insert = { op: 'insert', key: n.k, type, parent: parentKey, attrs: { name, ...clean(base, baseW) } };
    if (n.kind === 'svg') insert.attrs.svg = n.svg;
    if (n.tag && HTML_TAGS.has(n.tag) && type === 'FrameNode') insert.attrs.htmlTag = n.tag;
    if (n.tag === 'li' && type === 'FrameNode') insert.attrs.htmlTag = 'div';
    const asset = all[WIDTHS.indexOf(baseW)].$asset;
    if (asset) insert.asset = asset;
    if (n.kind === 'text') {
      const runs = n.runs || [];
      const preset = presetFor(n, all);
      for (const k of TYPE_KEYS) delete insert.attrs[k];
      insert.attrs.textStylePreset = preset;
      const rootStyle = RUN_KEYS.reduce((o, k) => (base[k] !== undefined ? ((o[k] = base[k]), o) : o), {});
      const styled = runs.filter((x) => x.t !== undefined).map((x) => typeAttrs(x.s, { run: true }));
      const gradText = /gradient/.test(base.textColor || '');
      const differs = (s, k) => k !== 'fontSize' && k !== 'letterSpacing' && k !== 'fontVariationAxes' && !(gradText && k === 'textColor') && s[k] !== undefined && !same(s[k], rootStyle[k]);
      const plain = runs.every((x) => x.t !== undefined) && styled.every((st_) => RUN_KEYS.every((k) => !differs(st_, k))) && !runs.some((x) => x.a && !inLink && n.tag !== 'a');
      if (plain) insert.attrs.text = runs.map((x) => x.t).join('');
      else delete insert.attrs.textColor;
      if (inLink) delete insert.attrs.link;
      ops.push(insert);
      if (!plain) {
        const bk = n.k + ':b';
        ops.push({ op: 'insert', key: bk, type: 'TextBlock', parent: n.k, attrs: { tag: insert.attrs.tag } });
        let i = 0, si = 0;
        for (const x of runs) {
          if (x.br) { ops.push({ op: 'insert', key: n.k + ':br' + i++, type: 'TextLineBreak', parent: bk, attrs: {} }); continue; }
          const st_ = styled[si++];
          const gradRoot = /gradient/.test(base.textColor || '') ? base.textColor : null;
          const run = { text: x.t, textColor: gradRoot && (!st_.textColor || /rgba\(\d+, \d+, \d+, 0\)/.test(st_.textColor) || same(st_.textColor, rootStyle.textColor)) ? gradRoot : st_.textColor || rootStyle.textColor };
          for (const k of ['fontWeight', 'fontStyle', 'fontName', 'textDecoration', 'textTransform']) if (differs(st_, k)) run[k] = st_[k];
          if (run.fontName === 'Inter' && displayFont(n, all) === 'Inter Display') run.fontName = 'Inter Display';
          if (x.a && !inLink && n.tag !== 'a') run.link = { href: href(x.a) };
          ops.push({ op: 'insert', key: n.k + ':r' + i++, type: 'TextRun', parent: bk, attrs: run });
        }
      }
    } else {
      if (inLink) delete insert.attrs.link;
      ops.push(insert);
    }
    // replicas
    WIDTHS.forEach((w, i) => {
      if (w === W0) return;
      const a = clean(all[i], w);
      const ref = clean(all[0].visible === false ? base : all[0], W0);
      const d = {};
      for (const [k, v] of Object.entries(a)) if (!same(v, ref[k])) d[k] = v;
      if (all[0].visible === false && a.visible !== false) d.visible = true;
      if (a.visible === false) { ops.push({ op: 'replica', key: n.k, w, attrs: { visible: false } }); return; }
      if (Object.keys(d).length) ops.push({ op: 'replica', key: n.k, w, attrs: d });
    });
    // a still of what the code draws here; the motion runtime removes it once the code draws for real
    const pcls = (n.cls || '').split(/\s+/).find((c) => POSTERS[c]);
    if (pcls && n.kind !== 'text') {
      const i = posterSeen[pcls] = (posterSeen[pcls] || 0) + 1;
      const src = POSTERS[pcls][i - 1];
      if (src) ops.push({ op: 'insert', key: n.k + ':poster', type: 'FrameNode', parent: n.k, asset: src, attrs: { name: 'poster [data-poster]', position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px', width: '100%', height: '100%', pointerEvents: 'none', radius: base.radius || null } });
    }
    // further background layers of the box, bottom first, under its content
    if (n.kind === 'box' || n.kind === 'img') {
      const layers = (all[0].$layers || all.find((x) => x.$layers) || {}).$layers || [];
      layers.slice().reverse().forEach((g, li) => {
        const lk = n.k + ':bg' + li;
        ops.push({ op: 'insert', key: lk, type: 'FrameNode', parent: n.k, attrs: { name: 'background layer', position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px', width: '100%', height: '100%', fill: g, radius: base.radius || null, pointerEvents: 'none' } });
      });
    }
    // children
    const kids = n.children || [];
    if (!kids.length || n.kind !== 'box') return;
    const PLc = {};
    WIDTHS.forEach((w, i) => {
      const b = n.bp[w], st = b && b.st;
      const grad = st && /text/.test((st.webkitBackgroundClip || '') + (st.backgroundClip || '')) ? fillOf(st).fill : null;
      PLc[w] = { ...(myL[w] || { dir: 'none', kids: [] }), selfW: all[i].width, selfH: all[i].height, textGrad: grad && /gradient/.test(grad) ? grad : (PLs[w] && PLs[w].textGrad) || null };
    });
    let prevInflow = null;
    for (const c of kids) {
      const isInflowSomewhere = WIDTHS.some((w) => c.bp[w] && !c.bp[w].none && !/absolute|fixed/.test(c.bp[w].st.position));
      if (plan && plan.mode === 'spacers' && isInflowSomewhere && prevInflow) {
        // a spacer between two in-flow children carries the measured distance at each width
        const sk = n.k + ':sp' + spacerSeq++;
        const sizeAt = (w) => {
          const L = myL[w]; if (!L) return 0;
          const ia = L.kids.indexOf(prevInflow), ib = L.kids.indexOf(c);
          if (ia < 0 || ib < 0) return 0;
          const s = spacings(L, w); return Math.max(0, s[ib - 1] || 0);
        };
        const dirAt = (w) => (myL[w] && myL[w].dir === 'h' ? 'h' : 'v');
        const flex = (w) => autoSide(c) === (dirAt(w) === 'h' ? 'left' : 'top');
        // a margin:auto push: the spacer takes the free space, never less than the CSS gap
        const minG = (w) => { const L = myL[w]; const st = n.bp[w] && n.bp[w].st; return st ? px(dirAt(w) === 'h' ? st.columnGap : st.rowGap) || 0 : 0; };
        const sa = (w) => flex(w)
          ? (dirAt(w) === 'h' ? { width: '1fr', minWidth: P(minG(w)), height: '1px' } : { width: '1px', height: '1fr', minHeight: P(minG(w)) })
          : (dirAt(w) === 'h' ? { width: P(sizeAt(w)), height: '1px' } : { width: '1px', height: P(sizeAt(w)) });
        ops.push({ op: 'insert', key: sk, type: 'FrameNode', parent: n.k, attrs: { name: 'spacer', fill: null, ...sa(W0) } });
        WIDTHS.slice(1).forEach((w) => ops.push({ op: 'replica', key: sk, w, attrs: sa(w) }));
      }
      emit(c, n, n.k, PLc, inLink || (n.tag === 'a' && n.attrs && !!n.attrs.href));
      if (isInflowSomewhere) prevInflow = c;
    }
  }

  emit(sec.tree, null, null, Object.fromEntries(WIDTHS.map((w) => [w, null])));
  // a fit-content box whose every child fills it collapses to 0 in Framer (e.g. an image wrap): give it its measured width
  const FILL = /^(1fr|100%|[\d.]+fr)$/;
  const inserts = ops.filter((o) => o.op === 'insert');
  for (const o of inserts) {
    if (o.type !== 'FrameNode' || o.attrs.width !== 'auto' || !NODES[o.key]) continue;
    const kids = inserts.filter((c) => c.parent === o.key && c.attrs.position !== 'absolute');
    if (!kids.length || !kids.every((c) => FILL.test(c.attrs.width || ''))) continue;
    const n = NODES[o.key], par = NODES[o.parent];
    const wAt = (w) => {
      const b = n.bp[w], pb = par && par.bp[w];
      if (!b || b.r.w <= 1) return null;
      if (pb) { const cw = pb.r.w - px(pb.st.paddingLeft) - px(pb.st.paddingRight) - px(pb.st.borderLeftWidth) - px(pb.st.borderRightWidth); if (near(b.r.w, cw, 2)) return '100%'; }
      return P(b.r.w);
    };
    if (wAt(W0)) o.attrs.width = wAt(W0);
    WIDTHS.slice(1).forEach((w) => { const v = wAt(w); if (v) ops.push({ op: 'replica', key: o.key, w, attrs: { width: v } }); });
    notes.push('fixed width for collapsing box ' + (o.attrs.name || '').slice(0, 30));
  }
  return { name: sec.name, ops, notes };
}

const summary = [];
const bundle = { $widths: WIDTHS };
for (const name of idx.sections) {
  const sec = JSON.parse(fs.readFileSync(path.join(inDir, name + '.json'), 'utf8'));
  wrapBoxedText(sec.tree);
  regrid(sec.tree);
  const spec = build(sec);
  bundle[name] = spec;
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(spec));
  summary.push(name + ': ' + spec.ops.length + ' ops' + (spec.notes.length ? ' | ' + spec.notes.slice(0, 4).join('; ') : ''));
}
bundle.$presets = Object.values(PRESETS);
fs.writeFileSync(path.join(outDir, '..', 'spec-bundle.json'), JSON.stringify(bundle));
summary.push('presets: ' + bundle.$presets.length + ' — ' + bundle.$presets.map((p) => p.name).join(', '));
console.log(summary.join('\n'));
