// Prepares a rendered design page for measure.cjs: main's sections become named body children, chrome
// (header/footer/progress) is dropped (the Framer layout template owns it), the brand is renamed and every
// asset URL is made absolute so Framer can fetch it. Parse-only: no page script is executed.
// Usage: node prep.cjs <rendered.html> <out.html> <assetBase>
const fs = require('fs');
const { JSDOM } = require(process.env.QODERS_NODE_MODULES + '/jsdom');
const [, , src, out, base] = process.argv;
const dom = new JSDOM(fs.readFileSync(src, 'utf8'));
const doc = dom.window.document;
const abs = (u) => {
  if (!u || /^(data:|https?:|#|mailto:|tel:)/.test(u)) return u;
  const clean = u.replace(/^(\.\.\/|\.\/)+/, '').replace(/^file:\/\/.*?\/src\//, '');
  return base + clean;
};
doc.querySelectorAll('[src]').forEach((e) => e.setAttribute('src', abs(e.getAttribute('src'))));
doc.querySelectorAll('[srcset]').forEach((e) => e.setAttribute('srcset', e.getAttribute('srcset').split(',').map((p) => { const [u, d] = p.trim().split(/\s+/); return abs(u) + (d ? ' ' + d : ''); }).join(', ')));
doc.querySelectorAll('link[rel=stylesheet][href]').forEach((e) => e.setAttribute('href', abs(e.getAttribute('href'))));
doc.querySelectorAll('[style*="url("]').forEach((e) => e.setAttribute('style', e.getAttribute('style').replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => `url("${abs(u)}")`)));
doc.querySelectorAll('style').forEach((s) => { s.textContent = s.textContent.replace(/url\((['"]?)(?!data:|https?:)([^'")]+)\1\)/g, (m, q, u) => `url("${abs(u)}")`); });
// states the page script switches between stay in the DOM: measured in place but invisible (absolute, opacity 0),
// so the converted layer exists and the motion code can bring it in (alt prices, collapsed accordion text …)
(process.env.KEEP_STATES || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((sel) => doc.querySelectorAll(sel).forEach((e) => {
  e.setAttribute('style', (e.getAttribute('style') || '') + ';display:block !important;position:absolute !important;opacity:0 !important;pointer-events:none !important');
}));
// Webflow's icon-font glyphs (slider arrows) render from a ::before font Framer does not have: draw them as SVG chevrons
doc.querySelectorAll('.w-icon-slider-left, .w-icon-slider-right').forEach((e) => {
  const left = e.classList.contains('w-icon-slider-left');
  e.classList.remove('w-icon-slider-left', 'w-icon-slider-right');
  e.classList.add(left ? 'slider-glyph-left' : 'slider-glyph-right');
  e.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (left ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5') + '"/></svg>';
});
const main = doc.querySelector('main');
const body = doc.body;
const names = {};
// design-tool pages wrap sections in <main>; a live Webflow page has them straight under <body>
const secs = main ? Array.from(main.children) : Array.from(body.children).filter((e) => e.tagName === 'SECTION' || ((e.tagName === 'DIV' || e.tagName === 'ASIDE') && /(^|\s)(section|inner-banner)(\s|$)/.test(e.className || '')));
// drop chrome
body.querySelectorAll(':scope > header, :scope > footer, :scope > .progress, :scope > #progress, :scope > script, :scope > .w-webflow-badge').forEach((e) => e.remove());
secs.forEach((s) => {
  const own = (s.className || '').split(/\s+/).filter((c) => c && !/^(section|no-|w-)/.test(c));
  let first = s.firstElementChild;
  while (first && /\bbase-container\b|\bsection-body-wrap\b/.test(first.className || '') && first.firstElementChild) first = first.firstElementChild;
  const kid = first ? (first.className || '').split(/\s+/).find((c) => c && !/^(base-container|w-)/.test(c)) : null;
  const cls = (s.className || '').split(/\s+/).find((c) => /^cmp-/.test(c) && !c.includes('__')) || own[0] || kid || s.tagName.toLowerCase();
  let name = cls.replace(/^cmp-/, '').replace(/(^|-)(\w)/g, (m, a, b) => b.toUpperCase());
  names[name] = (names[name] || 0) + 1;
  if (names[name] > 1) name += names[name];
  s.setAttribute('data-dz-name', name);
  body.insertBefore(s, main);
});
if (main) main.remove();
// brand rename in text and attributes (keep CSS custom-property names)
const walker = doc.createTreeWalker(body, 4);
let t; while ((t = walker.nextNode())) if (/Noverde/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/Noverde/g, 'Verdova');
body.querySelectorAll('[alt],[title],[aria-label]').forEach((e) => ['alt', 'title', 'aria-label'].forEach((a) => { const v = e.getAttribute(a); if (v && /Noverde/.test(v)) e.setAttribute(a, v.replace(/Noverde/g, 'Verdova')); }));
doc.querySelectorAll('title').forEach((e) => (e.textContent = e.textContent.replace(/Noverde/g, 'Verdova')));
fs.writeFileSync(out, '<!doctype html>\n' + doc.documentElement.outerHTML);
console.log(out, 'sections:', secs.map((s) => s.getAttribute('data-dz-name')).join(', '));
