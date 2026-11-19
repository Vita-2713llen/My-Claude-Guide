// Measures a LIVE page (Webflow or any server-rendered site) into the element trees native.cjs reads.
// Nothing from the page runs: every <script> is stripped from the HTML and every script request is aborted.
// The DOM is measured at each width in ONE page (viewport resize), so node keys stay identical across widths.
//
// Usage: node measure.cjs <url> <outDir> [widths=1440,810,390] [sectionSelector]
// Env:   KEEP_STATES="sel1,sel2"   hidden states to keep (absolute, opacity 0) so the layer exists
//        CHROME="header-sel|footer-sel" extra top-level blocks to measure as their own sections (default none)
//        ONLY_CHROME=1 measure only the CHROME blocks
// Output: <outDir>/index.json {widths, sections:[name…], url}
//         <outDir>/<Name>.json   {name, tree}
// Node:   {k, tag, cls, attrs, kind: box|text|svg|img|embed, runs?, svg?, src?, children?, bp:{w:{r,st,none,dw,autoW,autoH,pvis,ow,oh}}}
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const path = require('path');

const [, , url, outDir, wArg, secSel] = process.argv;
const WIDTHS = (wArg || '1440,810,390').split(',').map(Number);
const KEEP = (process.env.KEEP_STATES || '').split(',').map((s) => s.trim()).filter(Boolean);
const CHROME = (process.env.CHROME || '').split('|').map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

const ST_KEYS = ['position', 'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'columnGap', 'rowGap', 'gridTemplateColumns', 'gridColumnStart', 'gridColumnEnd',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'boxShadow', 'opacity', 'visibility', 'overflowX', 'overflowY', 'zIndex', 'transform',
  'mixBlendMode', 'filter', 'backdropFilter', 'cursor', 'pointerEvents', 'maxWidth', 'minHeight', 'flexGrow', 'marginLeft', 'marginTop', 'marginRight', 'marginBottom', 'top', 'left', 'right', 'bottom', 'textAlign', 'whiteSpace',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'webkitTextFillColor', 'textTransform', 'textDecorationLine', 'webkitBackgroundClip', 'backgroundClip', 'objectFit', 'objectPosition', 'aspectRatio', 'alignSelf', 'justifySelf'];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: WIDTHS[0], height: 900 } });
  const p = await ctx.newPage();
  // documents: strip every <script>; scripts / xhr / fetch: aborted
  await p.route('**/*', async (route) => {
    const req = route.request();
    const t = req.resourceType();
    if (t === 'script' || t === 'xhr' || t === 'fetch' || t === 'websocket') return route.abort();
    if (t === 'document') {
      const res = await route.fetch();
      let body = await res.text();
      // Webflow loads Google fonts from a script (WebFont.load): keep them as a plain stylesheet, or text measures in a fallback font
      const fams = (body.match(/families:\s*\[([^\]]*)\]/) || [, ''])[1].match(/"([^"]+)"/g);
      const fontLink = fams ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${fams.map((f) => f.replace(/"/g, '').replace(/ /g, '+')).join('|')}&display=block">` : '';
      body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/\sloading="lazy"/gi, '').replace(/<\/head>/i, fontLink + '</head>');
      return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
    }
    return route.continue();
  });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(800);

  // annotate: keys, kinds, virtual loose-text nodes; Webflow IX start states (inline opacity/transform) removed
  const meta = await p.evaluate(({ secSel, KEEP, CHROME }) => {
    document.querySelectorAll('[style]').forEach((e) => { e.style.removeProperty('opacity'); e.style.removeProperty('transform'); e.style.removeProperty('filter'); e.style.removeProperty('clip-path'); e.style.removeProperty('visibility'); });
    KEEP.forEach((s) => document.querySelectorAll(s).forEach((e) => e.setAttribute('style', (e.getAttribute('style') || '') + ';display:block !important;position:absolute !important;opacity:0 !important;pointer-events:none !important')));
    const INLINE = new Set(['SPAN', 'STRONG', 'B', 'EM', 'I', 'A', 'BR', 'SUP', 'SUB', 'SMALL', 'CODE', 'U', 'S', 'MARK', 'ABBR', 'TIME', 'LABEL']);
    const boxy = (e) => { const s = getComputedStyle(e); return /block|flex|grid|table/.test(s.display) && s.display !== 'inline-block' || s.position === 'absolute' || s.position === 'fixed' || parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) > 0 && s.display !== 'inline' || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.display !== 'inline') || e.querySelector('img,svg,video,iframe,canvas'); };
    const isText = (e) => {
      if (/^(IMG|SVG|VIDEO|IFRAME|CANVAS|INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(e.tagName) && e.tagName !== 'BUTTON') return false;
      let hasTxt = false;
      for (const c of e.childNodes) {
        if (c.nodeType === 3) { if (c.nodeValue.trim()) hasTxt = true; }
        else if (c.nodeType === 1) { if (!INLINE.has(c.tagName) || boxy(c)) return false; if (c.textContent.trim()) hasTxt = true; }
      }
      return hasTxt;
    };
    let secs;
    if (secSel) secs = Array.from(document.querySelectorAll(secSel));
    else {
      const main = document.querySelector('main');
      const root = main || document.body;
      secs = Array.from(root.children).filter((e) => !/^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(e.tagName) && !e.matches('.w-webflow-badge') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 2);
      if (!main) secs = secs.filter((e) => !CHROME.some((c) => e.matches(c)) && !e.matches('header, footer, [role=banner], .w-nav') && !/footer/i.test(e.className || ''));
    }
    const chromeEls = CHROME.map((c) => document.querySelector(c)).filter(Boolean);
    const all = secs.concat(chromeEls);
    const names = {};
    const out = [];
    all.forEach((s, si) => {
      const own = (s.className || '').toString().split(/\s+/).filter((c) => c && !/^(section|no-|w-)/.test(c));
      let name = (own[0] || s.tagName.toLowerCase()).replace(/(^|-)(\w)/g, (m, a, c) => c.toUpperCase());
      names[name] = (names[name] || 0) + 1; if (names[name] > 1) name += names[name];
      // wrap loose text that sits next to boxes into virtual spans
      s.querySelectorAll('*').forEach((e) => {
        if (isText(e)) return;
        for (const c of Array.from(e.childNodes)) if (c.nodeType === 3 && c.nodeValue.trim() && !(e.closest('svg'))) { const sp = document.createElement('span'); sp.setAttribute('data-loose', ''); c.replaceWith(sp); sp.appendChild(c); }
      });
      let seq = 0;
      const walk = (e, key) => {
        e.setAttribute('data-mk', key);
        const tag = e.tagName.toLowerCase();
        if (tag === 'svg') { e.setAttribute('data-kind', 'svg'); return; }
        if (tag === 'img') { e.setAttribute('data-kind', 'img'); return; }
        if (/^(video|iframe|canvas|input|textarea|select)$/.test(tag)) { e.setAttribute('data-kind', 'embed'); return; }
        if (isText(e)) { e.setAttribute('data-kind', 'text'); return; }
        e.setAttribute('data-kind', 'box');
        let i = 0;
        for (const c of e.children) { if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(c.tagName)) continue; walk(c, key + '.' + i++); }
      };
      walk(s, 's' + si);
      out.push({ name, key: 's' + si });
    });
    return out;
  }, { secSel, KEEP, CHROME });
  const sections = process.env.ONLY_CHROME ? meta.slice(meta.length - CHROME.length) : meta;

  // static info per node (tag, class, attrs, runs, svg, src)
  const info = await p.evaluate((ST) => {
    const res = {};
    const st = (e) => { const c = getComputedStyle(e); const o = {}; for (const k of ST) o[k] = c[k]; return o; };
    document.querySelectorAll('[data-mk]').forEach((e) => {
      const kind = e.getAttribute('data-kind');
      const attrs = {};
      for (const a of e.attributes) if (/^(href|target|alt|data-loose|aria-label|type|placeholder|name|value|for|role)$/.test(a.name)) attrs[a.name] = a.value;
      const n = { tag: e.tagName.toLowerCase(), cls: (e.getAttribute('class') || '').trim(), attrs, kind };
      if (kind === 'img') {
        const ss = (e.getAttribute('srcset') || '').split(',').map((x) => x.trim().split(/\s+/)).filter((x) => x[0]);
        const best = ss.sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0];
        n.src = new URL(best ? best[0] : e.currentSrc || e.src, location.href).href;
      }
      if (e.tagName === 'VIDEO') {
        const srcs = Array.from(e.querySelectorAll('source')).map((x) => x.src);
        n.src = srcs.find((x) => /mp4/.test(x)) || srcs[0] || e.src || '';
        attrs['data-video'] = '';
      }
      if (kind === 'svg') {
        const cl = e.cloneNode(true);
        const col = getComputedStyle(e).color;
        cl.querySelectorAll('*').forEach((x) => { for (const a of ['fill', 'stroke']) if ((x.getAttribute(a) || '') === 'currentColor') x.setAttribute(a, col); });
        for (const a of ['fill', 'stroke']) if ((cl.getAttribute(a) || '') === 'currentColor') cl.setAttribute(a, col);
        if (!cl.getAttribute('fill') && getComputedStyle(e).fill && getComputedStyle(e).fill !== 'rgb(0, 0, 0)') cl.setAttribute('fill', getComputedStyle(e).fill);
        cl.removeAttribute('class'); cl.removeAttribute('data-mk'); cl.removeAttribute('data-kind');
        n.svg = cl.outerHTML;
      }
      if (kind === 'text') {
        const runs = [];
        const rec = (node, a) => {
          for (const c of node.childNodes) {
            if (c.nodeType === 3) { if (c.nodeValue) runs.push({ t: c.nodeValue.replace(/\s+/g, ' '), s: st(c.parentElement), a: a || undefined }); }
            else if (c.tagName === 'BR') runs.push({ br: true });
            else if (c.nodeType === 1) rec(c, c.tagName === 'A' ? c.getAttribute('href') : a);
          }
        };
        rec(e, null);
        // trim leading/trailing whitespace runs
        while (runs.length && runs[0].t !== undefined && !runs[0].t.trim()) runs.shift();
        while (runs.length && runs[runs.length - 1].t !== undefined && !runs[runs.length - 1].t.trim()) runs.pop();
        if (runs.length && runs[0].t) runs[0].t = runs[0].t.replace(/^\s+/, '');
        if (runs.length && runs[runs.length - 1].t) runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, '');
        n.runs = runs;
      }
      res[e.getAttribute('data-mk')] = n;
    });
    return res;
  }, ST_KEYS);

  // geometry per width
  const geo = {};
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(500);
    const g = await p.evaluate((ST) => {
      const res = {};
      const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
      const els = Array.from(document.querySelectorAll('[data-mk]'));
      for (const e of els) {
        const c = getComputedStyle(e);
        const st = {}; for (const k of ST) st[k] = c[k];
        const r = rect(e);
        const none = c.display === 'none' || !!e.closest('[data-mk]') && (() => { let q = e.parentElement; while (q) { if (q.hasAttribute && q.hasAttribute('data-mk') && getComputedStyle(q).display === 'none') return true; q = q.parentElement; } return false; })() || (e.getClientRects().length === 0 && c.display !== 'contents');
        const pvis = e.parentElement ? getComputedStyle(e.parentElement).visibility : 'visible';
        res[e.getAttribute('data-mk')] = { r, st, none, pvis, ow: e.offsetWidth || 0, oh: e.offsetHeight || 0 };
      }
      // intrinsic sizes: hug width / auto height, one element at a time
      for (const e of els) {
        const k = e.getAttribute('data-mk'); const o = res[k];
        if (o.none || e.getAttribute('data-kind') === 'svg' || e.getAttribute('data-kind') === 'img') { o.autoW = o.r.w; o.autoH = o.r.h; continue; }
        const old = e.getAttribute('style');
        const pd = e.parentElement ? getComputedStyle(e.parentElement).display : '';
        e.style.setProperty('width', 'fit-content', 'important');
        e.style.setProperty('max-width', o.st.maxWidth === 'none' ? 'none' : o.st.maxWidth, 'important');
        if (/flex|grid/.test(pd)) { e.style.setProperty('align-self', 'flex-start', 'important'); e.style.setProperty('justify-self', 'start', 'important'); e.style.setProperty('flex', '0 0 auto', 'important'); }
        let r1 = e.getBoundingClientRect();
        o.autoW = r1.width;
        e.style.removeProperty('width'); e.style.removeProperty('max-width'); e.style.removeProperty('flex'); e.style.removeProperty('justify-self');
        e.style.setProperty('height', 'auto', 'important');
        e.style.setProperty('min-height', '0px', 'important');
        if (/flex|grid/.test(pd)) { e.style.setProperty('align-self', 'flex-start', 'important'); e.style.setProperty('flex-grow', '0', 'important'); }
        r1 = e.getBoundingClientRect();
        o.autoH = r1.height;
        e.style.removeProperty('min-height');
        if (old === null) e.removeAttribute('style'); else e.setAttribute('style', old);
      }
      // text runs per width are identical; widths only change geometry
      return res;
    }, ST_KEYS);
    // fluidity: widths again at w + 40
    await p.setViewportSize({ width: w + 40, height: 900 });
    await p.waitForTimeout(250);
    const g2 = await p.evaluate(() => { const o = {}; document.querySelectorAll('[data-mk]').forEach((e) => { o[e.getAttribute('data-mk')] = e.getBoundingClientRect().width; }); return o; });
    for (const k of Object.keys(g)) g[k].dw = Math.abs((g2[k] || 0) - g[k].r.w);
    geo[w] = g;
  }

  // assemble trees
  const build = (key) => {
    const n = { k: key, ...info[key], bp: {} };
    for (const w of WIDTHS) n.bp[w] = geo[w][key] || { none: true };
    const kidKeys = Object.keys(info).filter((k) => k.startsWith(key + '.') && k.slice(key.length + 1).indexOf('.') < 0)
      .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
    if (n.kind === 'box' && kidKeys.length) n.children = kidKeys.map(build);
    return n;
  };
  const names = [];
  for (const s of sections) {
    const tree = build(s.key);
    fs.writeFileSync(path.join(outDir, s.name + '.json'), JSON.stringify({ name: s.name, tree }));
    names.push(s.name);
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ widths: WIDTHS, sections: names, url }));
  console.log(url, '→', names.join(', '));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
