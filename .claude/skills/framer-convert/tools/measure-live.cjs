// Measures a prepped page (prep.cjs output: sections are named body children with data-dz-name) at several
// viewport widths and writes the element trees native.cjs reads:
//   <outDir>/index.json         { widths: [W0, …], sections: [name, …] }
//   <outDir>/<Section>.json     { name, tree }
// tree node: { k, tag, cls, attrs, kind: box|text|svg|img|canvas|embed, children?, runs?, svg?, src?,
//              bp: { [w]: { r:{x,y,w,h}, st:{…computed}, none, dw, autoW, autoH, ow, oh, pvis } } }
// The prepped file has no <script>; Chromium renders it, nothing from the page runs.
// Usage: node measure.cjs <prepped.html> <outDir> [widths=1440,810,390]
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [, , src, outDir, wArg] = process.argv;
const WIDTHS = (wArg || '1440,810,390').split(',').map(Number);
const ST_KEYS = ['display', 'position', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf', 'columnGap', 'rowGap',
  'gridTemplateColumns', 'gridColumnStart', 'gridColumnEnd', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'boxShadow', 'transform', 'opacity', 'visibility', 'overflowX', 'overflowY', 'zIndex',
  'mixBlendMode', 'filter', 'backdropFilter', 'cursor', 'pointerEvents', 'maxWidth', 'minHeight', 'maxHeight', 'flexGrow', 'top', 'right', 'bottom', 'left', 'marginLeft', 'marginTop',
  'marginRight', 'marginBottom', 'textAlign', 'whiteSpace', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'webkitTextFillColor',
  'webkitBackgroundClip', 'backgroundClip', 'textTransform', 'textDecorationLine', 'objectFit', 'objectPosition', 'aspectRatio', 'width', 'height'];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: WIDTHS[0], height: 900 } });
  await p.route('**/*', (r) => (/\.js(\?|$)/.test(r.request().url()) ? r.abort() : r.continue()));
  await p.goto('file://' + path.resolve(src), { waitUntil: 'networkidle', timeout: 120000 });
  // static markup only: drop runtime-only states, keys for every element, loose text wrapped
  const names = await p.evaluate(() => {
    const INLINE = /^(SPAN|A|STRONG|EM|B|I|BR|SUP|SUB|SMALL|CODE|U|MARK|ABBR|S|DEL|INS|Q|CITE|TIME|LABEL)$/;
    let k = 0;
    const secs = Array.from(document.body.children).filter((e) => e.hasAttribute('data-dz-name'));
    const isText = (e) => {
      if (/^(SVG|IMG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(e.tagName)) return false;
      if (!(e.textContent || '').trim()) return false;
      for (const d of e.querySelectorAll('*')) if (!INLINE.test(d.tagName) || /^(block|flex|grid)$/.test(getComputedStyle(d).display)) return false;
      return true;
    };
    const prepare = (e) => {
      e.setAttribute('data-mk', String(k++));
      if (isText(e)) { e.setAttribute('data-mkind', 'text'); return; }
      // loose text next to elements: give it its own span so it becomes a text layer
      for (const n of Array.from(e.childNodes)) if (n.nodeType === 3 && n.nodeValue.trim() && e.children.length) { const s = document.createElement('span'); s.setAttribute('data-loose', ''); n.replaceWith(s); s.appendChild(n); }
      for (const c of Array.from(e.children)) { if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(c.tagName)) continue; if (c.tagName.toLowerCase() === 'svg') { c.setAttribute('data-mk', String(k++)); continue; } prepare(c); }
    };
    secs.forEach(prepare);
    return secs.map((s) => s.getAttribute('data-dz-name'));
  });
  await p.evaluate(() => document.fonts.ready);
  const KEYS = ST_KEYS;
  const measureAll = (W) => p.evaluate(({ W, KEYS }) => {
    const out = {};
    const els = Array.from(document.querySelectorAll('[data-mk]'));
    for (const e of els) {
      const cs = getComputedStyle(e);
      const rs = e.getClientRects();
      const k = e.getAttribute('data-mk');
      if (!rs.length && cs.display !== 'contents') { out[k] = { none: true }; continue; }
      const bb = e.getBoundingClientRect();
      const st = {}; for (const key of KEYS) st[key] = cs[key];
      out[k] = { r: { x: bb.left + scrollX, y: bb.top + scrollY, w: bb.width, h: bb.height }, st, none: false, ow: e.offsetWidth || bb.width, oh: e.offsetHeight || bb.height,
        pvis: e.parentElement ? getComputedStyle(e.parentElement).visibility : 'visible' };
    }
    // natural sizes, one element at a time
    for (const e of els) {
      const o = out[e.getAttribute('data-mk')];
      if (!o || o.none || e.tagName.toLowerCase() === 'svg') continue;
      const s = e.style, keep = s.cssText;
      s.setProperty('width', 'fit-content', 'important'); s.setProperty('min-width', '0', 'important'); s.setProperty('flex-grow', '0', 'important'); s.setProperty('flex-basis', 'auto', 'important');
      o.autoW = e.getBoundingClientRect().width;
      s.cssText = keep;
      s.setProperty('height', 'auto', 'important'); s.setProperty('min-height', '0', 'important'); s.setProperty('flex-grow', '0', 'important'); s.setProperty('align-self', 'flex-start', 'important'); s.setProperty('aspect-ratio', 'auto', 'important');
      o.autoH = e.getBoundingClientRect().height;
      s.cssText = keep;
      if (!keep) e.removeAttribute('style');
    }
    return out;
  }, { W, KEYS });
  const widthsOf = (W) => p.evaluate(() => { const o = {}; for (const e of document.querySelectorAll('[data-mk]')) { const r = e.getBoundingClientRect(); o[e.getAttribute('data-mk')] = r.width; } return o; });
  const M = {};
  for (const W of WIDTHS) {
    await p.setViewportSize({ width: W, height: 900 });
    await p.waitForTimeout(400);
    M[W] = await measureAll(W);
    await p.setViewportSize({ width: W - 20, height: 900 });
    await p.waitForTimeout(150);
    const w2 = await widthsOf();
    for (const [k, o] of Object.entries(M[W])) if (!o.none) o.dw = Math.abs(o.r.w - (w2[k] || 0));
  }
  await p.setViewportSize({ width: WIDTHS[0], height: 900 });
  // structure (width independent)
  const trees = await p.evaluate(() => {
    const STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'webkitTextFillColor', 'textTransform', 'textDecorationLine', 'backgroundImage', 'webkitBackgroundClip', 'backgroundClip'];
    const sty = (el) => { const cs = getComputedStyle(el); const o = {}; for (const k of STYLE) o[k] = cs[k]; return o; };
    const attrsOf = (e) => { const o = {}; for (const a of e.attributes) if (!/^(class|style|src|srcset|sizes|data-mk|data-mkind|data-dz-name|loading|width|height|xmlns.*|viewbox|fill|stroke.*|d|id)$/i.test(a.name)) o[a.name] = a.value; return o; };
    const svgOf = (e) => {
      const c = e.cloneNode(true);
      const col = getComputedStyle(e).color;
      c.removeAttribute('data-mk');
      const bb = e.getBoundingClientRect();
      if (!c.getAttribute('viewBox') && bb.width) c.setAttribute('viewBox', `0 0 ${bb.width} ${bb.height}`);
      c.setAttribute('width', String(bb.width)); c.setAttribute('height', String(bb.height));
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return c.outerHTML.replace(/currentColor/g, col);
    };
    function runsOf(e) {
      const runs = [];
      const walk = (n, a) => {
        if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t) runs.push({ t, s: sty(n.parentElement), ...(a ? { a } : {}) }); return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'BR') { runs.push({ br: true }); return; }
        if (getComputedStyle(n).display === 'none') return;
        const href = n.tagName === 'A' ? n.getAttribute('href') : a;
        for (const c of n.childNodes) walk(c, href);
      };
      for (const c of e.childNodes) walk(c, null);
      // trim the outer whitespace
      const tx = runs.filter((r) => r.t !== undefined);
      if (tx.length) { tx[0].t = tx[0].t.replace(/^ +/, ''); tx[tx.length - 1].t = tx[tx.length - 1].t.replace(/ +$/, ''); }
      return runs.filter((r) => r.br || r.t);
    }
    function node(e) {
      const tag = e.tagName.toLowerCase();
      const n = { k: e.getAttribute('data-mk'), tag, cls: typeof e.className === 'string' ? e.className : (e.getAttribute('class') || ''), attrs: attrsOf(e), kind: 'box' };
      if (tag === 'svg') { n.kind = 'svg'; n.svg = svgOf(e); return n; }
      if (tag === 'img') { n.kind = 'img'; n.src = e.currentSrc || e.src; return n; }
      if (tag === 'canvas') { n.kind = 'canvas'; return n; }
      if (/^(video|iframe)$/.test(tag)) { n.kind = 'embed'; return n; }
      if (e.getAttribute('data-mkind') === 'text') { n.kind = 'text'; n.runs = runsOf(e); return n; }
      n.children = Array.from(e.children).filter((c) => c.hasAttribute('data-mk')).map(node);
      return n;
    }
    return Array.from(document.body.children).filter((e) => e.hasAttribute('data-dz-name')).map((s) => ({ name: s.getAttribute('data-dz-name'), tree: node(s) }));
  });
  const attach = (n) => { n.bp = {}; for (const W of WIDTHS) n.bp[W] = M[W][n.k] || { none: true }; (n.children || []).forEach(attach); };
  for (const t of trees) { attach(t.tree); fs.writeFileSync(path.join(outDir, t.name + '.json'), JSON.stringify(t)); }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ widths: WIDTHS, sections: names }));
  console.log(outDir, names.join(', '));
  await b.close();
})();
