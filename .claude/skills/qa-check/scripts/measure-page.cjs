// Functions evaluated INSIDE the page. Each must be self-contained (no closures, no references to
// other top-level functions): Playwright and the Safari / iOS instruments serialise them with
// Function.prototype.toString. Generic heuristics only — no site, brand or project values live here;
// every project-specific value arrives through the `dec` argument (qa-target.json decisions/selectors).

// Run right after load, before any scroll: lazy images actually visible in the first viewport.
// Visible = viewport ∩ every clipping ancestor (carousel tracks, overflow:hidden boxes), both axes.
function PRELOAD() {
  const vw = innerWidth, vh = innerHeight;
  const shown = i => {
    const r = i.getBoundingClientRect(); let L = Math.max(r.left, 0), T = Math.max(r.top, 0), Rt = Math.min(r.right, vw), B = Math.min(r.bottom, vh);
    for (let p = i.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const c = getComputedStyle(p); if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); Rt = Math.min(Rt, q.right); B = Math.min(B, q.bottom);
    }
    return Rt - L > 1 && B - T > 1;
  };
  const keyOf = i => { const s = i.getAttribute('src') || i.getAttribute('data-src') || i.currentSrc || ''; try { return new URL(s, location.href).href.split(/[?#]/)[0]; } catch (e) { return s; } };
  return [...document.images].filter(i => i.getAttribute('loading') === 'lazy' && getComputedStyle(i).visibility !== 'hidden' && shown(i))
    .map(i => ({ src: (i.currentSrc || i.src || i.getAttribute('data-src') || '').split(/[?#]/)[0].split('/').pop().slice(0, 80), key: keyOf(i), top: Math.round(i.getBoundingClientRect().top) }));
}

// The big static sweep. `dec` = decisions + private flags from the instrument:
//   dec.__mode   'full' (default) | 'regions' (tag header/main/footer only) | 'layout' (overflow/clipped/edges only, dec.__root scopes it)
//   dec.__full   extended chromium sweep (layout rules, presence, platform, copy …)
//   dec.__desk   this is the reference desktop tier: site-wide content checks run here
//   dec._sel     { header, main, footer } selector overrides; dec._burgerSel, dec._logoSel, dec._sectionSel
// Without the private flags (Safari / iOS instruments) only the cross-engine core is measured.
function STATIC(dec) {
  dec = dec || {};
  const mode = dec.__mode || 'full';
  const FULL = !!dec.__full, DESK = !!dec.__desk;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const EDGE = dec.edgeMinPx || 8;
  const out = { v: 3 };
  const cls = e => (e && e.className && e.className.baseVal !== undefined ? e.className.baseVal : ((e && e.className) || '')).toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const sel = e => !e || !e.tagName ? '' : e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls(e) ? '.' + cls(e) : '');
  const txt = e => ((e && (e.innerText || e.textContent)) || '').replace(/\s+/g, ' ').trim();
  const visible = e => { if (!e || !e.getClientRects || !e.getClientRects().length) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const srOnly = e => { let p = e; while (p && p !== document.body) { const c = getComputedStyle(p); if ((c.position === 'absolute' && (parseFloat(c.width) <= 1 || parseFloat(c.height) <= 1)) || (c.clip && c.clip !== 'auto') || /inset\(50%\)/.test(c.clipPath) || p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('inert')) return true; p = p.parentElement; } return false; };
  const all = (root, s) => { try { return [...root.querySelectorAll(s)]; } catch (e) { return []; } };
  const closest = (e, s) => { try { return e.closest(s); } catch (x) { return null; } };
  const matches = (e, s) => { try { return e.matches(s); } catch (x) { return false; } };
  const mode1 = arr => { const c = {}; arr.forEach(v => c[v] = (c[v] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]; };

  // ---------------- regions: header / main / footer, resolved the same way on every platform
  const RS = dec._sel || {};
  const DEF = {
    header: ['header', '[role=banner]', '.w-nav', '[data-elementor-type=header]', '.elementor-location-header', '#masthead', '.site-header', 'body > nav', 'body > [class*=navbar i]', 'body > [class*=header i]'],
    main: ['main', '[role=main]'],
    footer: ['footer', '[role=contentinfo]', '[data-elementor-type=footer]', '.elementor-location-footer', '.site-footer', '#colophon', 'body > [class*=footer i]'],
  };
  const regErr = [];
  document.querySelectorAll('[data-qa-region]').forEach(e => e.removeAttribute('data-qa-region'));
  const boxShown = e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
  const outermost = arr => arr.filter(e => !arr.some(o => o !== e && o.contains(e)));
  const pick = (key, test, last) => {
    const list = RS[key] ? [RS[key]] : DEF[key];
    for (const s of list) {
      let found; try { found = [...document.querySelectorAll(s)]; } catch (e) { regErr.push(`${key}: invalid selector "${s}"`); continue; }
      const ok = outermost(found.filter(e => e !== document.body && e !== document.documentElement && boxShown(e) && test(e)));
      if (ok.length) return { el: last ? ok[ok.length - 1] : ok[0], s };
    }
    if (RS[key]) regErr.push(`${key}: selectors.${key} "${RS[key]}" matched nothing visible`);
    return { el: null, s: null };
  };
  const mainR = pick('main', () => true);
  const mainEl = mainR.el;
  const docTop = e => e.getBoundingClientRect().top + scrollY;
  const headR = pick('header', e => !e.closest('article') && !(mainEl && (mainEl.contains(e) || e.contains(mainEl))) && !e.closest('footer,[role=contentinfo]') && (docTop(e) < 300 || /fixed|sticky/.test(getComputedStyle(e).position)));
  const headerEl = headR.el;
  const footR = pick('footer', e => !e.closest('article') && !(mainEl && (mainEl.contains(e) || e.contains(mainEl))) && !(headerEl && (headerEl.contains(e) || e.contains(headerEl))), true);
  const footerEl = footR.el;
  if (headerEl) headerEl.setAttribute('data-qa-region', 'header');
  if (footerEl) footerEl.setAttribute('data-qa-region', 'footer');
  (mainEl || document.body).setAttribute('data-qa-region', 'main');
  const desc = e => e ? sel(e) + (e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : '') : null;
  out.regions = { header: desc(headerEl), main: mainEl ? desc(mainEl) : '<none→body>', footer: desc(footerEl), errors: regErr };
  const regionOf = e => { const r = e && e.closest && e.closest('[data-qa-region]'); return r ? r.getAttribute('data-qa-region') : 'other'; };
  const main = mainEl || document.body;
  const inMain = e => regionOf(e) === 'main';
  const mainAll = s => all(main, s).filter(inMain);
  if (mode === 'regions') return { regions: out.regions };

  // ---------------- layout helpers
  // horizontal scroller (carousel you can scroll) or running marquee: off-screen content is intended
  const inScroller = e => { let p = e.parentElement; while (p && p !== document.body && p !== document.documentElement) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; if (p.getAnimations && p.getAnimations().some(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)) return true; p = p.parentElement; } return false; };
  const inOverflowBox = e => { let p = e.parentElement; while (p && p !== document.body && p !== document.documentElement) { const c = getComputedStyle(p); if (c.overflowX !== 'visible' || c.overflow === 'hidden' || c.overflow === 'clip') return true; if (c.position === 'fixed') return true; p = p.parentElement; } return false; };
  // carousel track: a transform-moved single row of ≥2 slides that is wider than its box or its parent
  const isTrack = p => { if (p.children.length < 2) return false; const c = getComputedStyle(p); const row = (/flex/.test(c.display) && /^row/.test(c.flexDirection) && c.flexWrap === 'nowrap') || (/grid/.test(c.display) && /column/.test(c.gridAutoFlow)) || c.whiteSpace === 'nowrap'; if (!row) return false; const moved = c.transform !== 'none' || [...p.children].some(k => getComputedStyle(k).transform !== 'none'); const pw = p.parentElement ? p.parentElement.getBoundingClientRect().width : Infinity; return moved && (p.scrollWidth > p.clientWidth + 2 || p.getBoundingClientRect().width > pw + 2); };
  // horizontal part of r that survives every clipping ancestor; null = its own container hides it completely
  const clipSpan = (e, r) => { let L = r.left, R = r.right, p = e.parentElement; while (p && p !== document.body && p !== document.documentElement) { const c = getComputedStyle(p); if (c.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); L = Math.max(L, pr.left); R = Math.min(R, pr.right); if (R - L < 1) return null; } if (c.position === 'fixed') break; p = p.parentElement; } return { left: L, right: R }; };
  // sticks out of its own block (before the clipping container), unless the escape is a slide leaving its carousel track
  const sticksOut = (e, r) => { let p = e.parentElement, inTrack = false; while (p && p !== document.body && p !== document.documentElement) { if (isTrack(p)) inTrack = true; const pr = p.getBoundingClientRect(); if (pr.width > 0 && (r.left < pr.left - 1 || r.right > pr.right + 1)) return !inTrack; const c = getComputedStyle(p); if (c.overflowX !== 'visible' || c.overflow === 'hidden') return false; p = p.parentElement; } return false; };
  // partly hidden by a horizontal clip box (carousel peek, marquee, bleed decoration): its on-screen edge is not a layout decision
  const clipX = (e, r) => { let p = e.parentElement; while (p && p !== document.body && p !== document.documentElement) { const c = getComputedStyle(p); if (c.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); if (r.left < pr.left - 1 || r.right > pr.right + 1) return true; } p = p.parentElement; } return false; };
  // inside a closed overlay that stays in layout (opacity 0 on an ancestor)
  const fadedOut = e => { let p = e, op = 1; while (p && p !== document.documentElement) { op *= +getComputedStyle(p).opacity; p = p.parentElement; } return op < 0.01; };

  const layout = (root, regionScoped) => {
    const res = { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: [], edges: [], clippedTotal: 0, edgesTotal: 0 };
    const CL = 'a, button, h1, h2, h3, h4, p, li, img, input, select, textarea';
    for (const e of all(root, CL)) {
      if (regionScoped) { const rg = regionOf(e); if (rg === 'other') continue; if (rg === 'header' && !/^(A|BUTTON)$/.test(e.tagName)) continue; if (rg === 'footer' && e.tagName !== 'A') continue; }
      if (!visible(e) || srOnly(e)) continue;
      const r = e.getBoundingClientRect();
      if ((r.left < -1 || r.right > vw + 1) && !inScroller(e) && (!inOverflowBox(e) || (clipSpan(e, r) && sticksOut(e, r)))) { res.clippedTotal++; if (res.clipped.length < 40) res.clipped.push({ sel: sel(e), text: txt(e).slice(0, 30), left: Math.round(r.left), right: Math.round(vw - r.right) }); }
    }
    for (const e of all(root, 'h1,h2,h3,h4,p,li,blockquote,figcaption')) {
      if (regionScoped && !inMain(e)) continue;
      if (!visible(e) || srOnly(e) || inScroller(e) || fadedOut(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(e); const rr = rg.getBoundingClientRect(); if (!rr.width || clipX(e, rr)) continue;
      const L = rr.left, R = vw - rr.right;
      if ((L >= -1 && L < EDGE) || (R >= -1 && R < EDGE)) { res.edgesTotal++; if (res.edges.length < 30) res.edges.push({ sel: sel(e), L: Math.round(L), R: Math.round(R), text: txt(e).slice(0, 40) }); }
    }
    return res;
  };
  if (mode === 'layout') { const root = (dec.__root && document.querySelector(dec.__root)) || document; return layout(root, root === document); }

  // ---------------- meta / seo
  const metaAll = n => all(document, `meta[name="${n}" i],meta[property="${n}" i]`).map(m => m.getAttribute('content'));
  const meta = n => metaAll(n)[0] ?? null;
  const absU = v => { if (!v) return v; try { return new URL(v, location.href).href; } catch (e) { return v; } };
  out.url = location.href;
  out.meta = {
    title: document.title, desc: meta('description'), robots: all(document, 'meta[name="robots" i],meta[name="googlebot" i]').map(m => m.content).join(', ') || null,
    ogImage: absU(meta('og:image')), ogImageRaw: meta('og:image'), ogCount: metaAll('og:image').length, twCount: metaAll('twitter:image').length,
    ogTitle: meta('og:title'), ogDesc: meta('og:description'), ogUrl: meta('og:url'), twitterCard: meta('twitter:card'),
    canonical: document.querySelector('link[rel=canonical]')?.href || null, lang: (document.documentElement.getAttribute('lang') || '').trim(),
    charset: !!document.querySelector('meta[charset], meta[http-equiv="content-type" i]'), viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? null, generator: meta('generator'),
  };
  out.hreflang = all(document, 'link[rel~=alternate][hreflang]').map(l => ({ hl: (l.getAttribute('hreflang') || '').toLowerCase(), href: l.href.split('#')[0] }));
  const ldTypes = [], ld = { blocks: 0, parseErrors: 0, questions: 0, answersEmpty: 0, types: [], strings: [] };
  out.jsonld = all(document, 'script[type="application/ld+json"]').map(s => {
    ld.blocks++;
    try {
      const j = JSON.parse(s.textContent); const types = [];
      const walk = (x, k) => { if (Array.isArray(x)) return x.forEach(y => walk(y, k)); if (x && typeof x === 'object') { const t = x['@type']; if (t) [].concat(t).forEach(v => types.push(String(v))); if ([].concat(t || []).includes('Question')) { ld.questions++; const ans = x.acceptedAnswer || x.suggestedAnswer; const at = ans && [].concat(ans)[0] && [].concat(ans)[0].text; if (!at || !String(at).trim()) ld.answersEmpty++; } for (const [kk, v] of Object.entries(x)) if (!kk.startsWith('@')) walk(v, kk); } else if (typeof x === 'string' && ld.strings.length < 200 && !/^(https?:|mailto:|tel:|\/|data:)/.test(x) && !/^[\d\s:.\-+TZ]+$/.test(x)) ld.strings.push(x.slice(0, 300)); };
      walk(j); ldTypes.push(...types); return types.join('|');
    } catch (e) { ld.parseErrors++; return 'PARSE_ERROR'; }
  });
  ld.types = [...new Set(ldTypes)]; out.ld = ld;
  // h1: exposed to assistive tech (visually-hidden counts; aria-hidden / inert / display:none / visibility:hidden do not)
  const inA11yTree = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden="true"],[inert]');
  const h1s = all(document, 'h1').filter(inA11yTree);
  out.h1 = h1s.map(txt); out.h1SrOnly = h1s.filter(srOnly).map(txt);
  let prev = 0; out.headingSkips = [];
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) { if (!visible(h)) continue; const l = +h.tagName[1]; if (prev && l > prev + 1) out.headingSkips.push(`${h.tagName} after H${prev}: "${txt(h).slice(0, 50)}"`); prev = l; }

  // ---------------- links & controls
  const accName = a => (a.getAttribute('aria-label') || (a.getAttribute('aria-labelledby') ? a.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') : '') || txt(a) || [...a.querySelectorAll('img')].map(i => i.alt).join(' ') || a.getAttribute('title') || [...a.querySelectorAll('svg title,[aria-label]')].map(x => x.textContent || x.getAttribute('aria-label')).join(' ') || a.getAttribute('value') || '').trim();
  const sameDoc = a => a.hash && a.hash.length > 1 && a.origin === location.origin && a.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '') && a.search === location.search;
  const fragOk = raw => { let d = raw; try { d = decodeURIComponent(raw); } catch (e) { } return [raw, d].some(f => document.getElementById(f) || [...document.getElementsByName(f)].some(n => n.tagName === 'A')) || /^top$/i.test(d); };
  const EXCL = '[hidden],[aria-hidden="true"],[inert],details:not([open]),dialog,[role=dialog],[popover],nav,menu,[class*=menu i],[class*=dropdown i],[class*=submenu i],[class*=mega i],[class*=offcanvas i],[class*=drawer i],[class*=modal i],[class*=popup i],[class*=lightbox i],[class*=swiper i],[class*=slick i],[class*=splide i],[class*=carousel i],[class*=slider i],[class*=tab-pane i],[role=tabpanel],[class*=accordion i],[class*=collapse i],.w-dropdown,.w-nav';
  const invReason = a => {
    if (!a.getClientRects().length) return null;
    const cs = getComputedStyle(a); const r = a.getBoundingClientRect();
    const kidBox = [...a.querySelectorAll('*')].some(k => { const kr = k.getBoundingClientRect(); return kr.width > 1 && kr.height > 1; });
    if ((r.width < 1 || r.height < 1) && !kidBox) return '0×0';
    let op = 1; for (let p = a; p && p !== document.documentElement; p = p.parentElement) op *= +getComputedStyle(p).opacity; if (op < 0.05) return 'opacity 0';
    if (parseFloat(cs.fontSize) === 0 && !kidBox) return 'font-size 0';
    if (txt(a) && !a.querySelector('img,svg,picture') && /^(transparent|rgba\([^)]*,\s*0\))$/.test(cs.color)) return 'transparent text';
    if (parseFloat(cs.textIndent) < -999) return 'text-indent off-screen';
    const sx = r.left + scrollX, sy = r.top + scrollY; if (sx + r.width < 0 || sy + r.height < 0) return 'off-screen';
    if ((cs.clip && cs.clip !== 'auto') || /inset\(50%\)/.test(cs.clipPath)) return 'clipped';
    return null;
  };
  out.links = all(document, 'a').map(a => {
    const href = a.getAttribute('href'); const skip = (href || '').startsWith('#') && /skip/i.test(a.className + ' ' + txt(a));
    const o = { href, abs: a.href, name: accName(a).slice(0, 70), target: a.target, rel: a.rel, sel: sel(a), vis: visible(a), region: regionOf(a), sameDoc: sameDoc(a) };
    if (FULL) { o.dn = !a.getClientRects().length && !!href; o.inv = href ? invReason(a) : null; o.excl = !!closest(a, EXCL) || skip; o.text = txt(a).slice(0, 60); o.hasImg = !!a.querySelector('img,svg'); }
    return o;
  });
  out.buttonsNoName = all(document, 'button,[role=button]').filter(b => visible(b) && !accName(b)).map(sel);
  out.anchorsMissing = [...new Set(all(document, 'a[href*="#"]').filter(a => sameDoc(a) && !/^#(!|\/)/.test(a.hash) && !fragOk(a.hash.slice(1))).map(a => a.getAttribute('href')))];
  // LINK-06: looks clickable, is not
  out.fakeClickable = []; out.fakeClickableTotal = 0;
  for (const e of mainAll('div,span,li,p,img,figure,h2,h3,h4')) {
    if (!visible(e) || e.closest('a,button,label,summary,[role=button],[role=tab],[role=link],[onclick],input,select,textarea')) continue;
    if (e.querySelector('a,button')) continue;
    const c = getComputedStyle(e); const hasBox = (parseFloat(c.paddingLeft) >= 8 && (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth) > 0));
    const looksBtn = c.cursor === 'pointer' || (/(^|[-_ .])(btn|button)([-_ .]|$)/i.test(cls(e)) && hasBox);
    if (!looksBtn) continue;
    const t = txt(e); if (!t && e.tagName !== 'IMG') continue;
    out.fakeClickableTotal++; if (out.fakeClickable.length < 30) out.fakeClickable.push({ sel: sel(e), text: t.slice(0, 40), pointer: c.cursor === 'pointer' });
  }

  // ---------------- images & video
  out.imgs = [...document.images].map(i => {
    const r = i.getBoundingClientRect(); const cs = getComputedStyle(i);
    const srcAttr = (i.getAttribute('src') || '').trim(); const lazySrc = i.getAttribute('data-src') || i.getAttribute('data-lazy-src') || i.getAttribute('data-lazy') || '';
    const hasSource = !!srcAttr || !!i.getAttribute('srcset') || !!(i.parentElement && i.parentElement.tagName === 'PICTURE' && i.parentElement.querySelector('source[srcset]'));
    const placeholder = !srcAttr || /^data:/i.test(srcAttr); const dead = i.complete && i.naturalWidth === 0 && visible(i);
    let key = ''; try { key = new URL((placeholder && lazySrc) ? lazySrc : (srcAttr || i.currentSrc || ''), location.href).href.split(/[?#]/)[0]; } catch (e) { key = srcAttr; }
    return { src: (i.currentSrc || i.src).split('?')[0], cur: i.currentSrc || i.src, key, alt: i.getAttribute('alt'), w: i.getAttribute('width'), h: i.getAttribute('height'), nw: i.naturalWidth, nh: i.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height), fit: cs.objectFit, vis: visible(i) && !srOnly(i), broken: dead && hasSource && !/^data:/i.test(srcAttr), noSrc: dead && (!hasSource || /^data:/i.test(srcAttr)), lazy: i.getAttribute('loading'), complete: i.complete };
  });
  const FS_RE = /full-?screen|fullscreen|plein[- ]?[eé]cran|vollbild/i;
  const canFull = v => { if (v.controls) return true; if (v.closest('[class*=lightbox],[class*=modal],[class*=player],[data-fullscreen],[class*=plyr],[class*=video-js],[class*=vjs]')) return true; const box = v.closest('figure,[class*=video],[class*=player],[class*=media],section,article') || v.parentElement; return !!box && [...box.querySelectorAll('button,[role=button],a,[class*=fullscreen],[data-plyr]')].some(b => FS_RE.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('class') || '') + ' ' + (b.getAttribute('data-plyr') || ''))); };
  out.videos = all(document, 'video').map(v => {
    const raw = v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.getAttribute('src') || v.dataset.src || v.querySelector('source[data-src]')?.getAttribute('data-src') || '';
    let url = ''; try { url = raw ? new URL(raw, location.href).href : ''; } catch (e) { url = raw; }
    return { url, src: url.split('?')[0].split('/').pop() || '(no src)', poster: !!v.getAttribute('poster'), autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsinline: v.playsInline, vw: v.videoWidth || +(v.dataset.qaVw || 0), vwWhy: v.dataset.qaVwWhy || '', vhh: v.videoHeight, controls: v.controls, fs: canFull(v), rw: Math.round(v.getBoundingClientRect().width), err: v.error ? v.error.code : 0, preload: v.preload, vis: visible(v), playing: v.dataset.qaPlay || '', ticks: +(v.dataset.qaTicks || 0) };
  });
  const EMB = /youtube(-nocookie)?\.com\/embed|youtu\.be\/|player\.vimeo\.com|wistia\.(com|net)|loom\.com\/embed|vidyard|dailymotion|jwplayer|brightcove/i;
  out.embeds = all(document, 'iframe, lite-youtube, lite-vimeo').map(f => ({ src: f.getAttribute('src') || f.getAttribute('data-src') || f.getAttribute('data-lazy-src') || f.getAttribute('videoid') || f.tagName.toLowerCase(), tag: f.tagName.toLowerCase() })).filter(x => /^lite-/.test(x.tag) || EMB.test(x.src)).map(x => ({ src: x.src.slice(0, 120), provider: (x.src.match(/youtube|youtu\.be|vimeo|wistia|loom|vidyard|dailymotion|jwplayer|brightcove/i) || [x.tag])[0].toLowerCase() }));

  // ---------------- fonts
  const nf = f => String(f || '').replace(/["']/g, '').trim().toLowerCase();
  const GEN = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-(serif|sans-serif|monospace|rounded)|emoji|math|fangsong|-apple-system|blinkmacsystemfont|inherit|initial)$/;
  const fams = new Map(); const pairs = new Map();
  const ownText = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  for (const e of document.querySelectorAll('body *')) {
    if (!ownText(e) || !visible(e) || srOnly(e)) continue;
    const c = getComputedStyle(e); const stack = c.fontFamily.split(',').map(nf); const first = stack[0];
    if (!fams.has(first)) fams.set(first, { sel: sel(e), fallback: stack[1] || '', ctl: /^(BUTTON|SELECT|OPTION|TEXTAREA|INPUT)$/.test(e.tagName), text: txt(e).slice(0, 30) });
    const pk = `${first}|${c.fontWeight}|${c.fontStyle === 'normal' ? 'normal' : 'italic'}`; if (!pairs.has(pk)) pairs.set(pk, sel(e));
  }
  for (const e of document.querySelectorAll('input:not([type=hidden]), select, textarea, button')) { if (!visible(e)) continue; const first = nf(getComputedStyle(e).fontFamily.split(',')[0]); if (!fams.has(first)) fams.set(first, { sel: sel(e), fallback: '', ctl: true, text: '' }); }
  out.fontsRendered = [...fams.keys()];
  const faces = [...document.fonts].map(f => ({ family: nf(f.family), weight: String(f.weight), style: f.style, status: f.status, display: f.display || '' }));
  out.faces = faces.slice(0, 120);
  out.fontsLoaded = [...new Set(faces.filter(f => f.status === 'loaded').map(f => f.family))];
  out.fontErrors = [...new Set(faces.filter(f => f.status === 'error').map(f => f.family))];
  out.fontPairs = [...pairs.entries()].map(([k, s]) => ({ k, sel: s }));
  {
    const faceStatus = {}; for (const f of faces) if (faceStatus[f.family] !== 'loaded') faceStatus[f.family] = f.status;
    const sys = (dec.systemFonts || []).map(nf); const want = dec.fonts ? dec.fonts.map(nf).concat((dec.iconFonts || []).map(nf)) : null;
    const ICON = /awesome|icon|dashicons|material symbols|material icons|glyph|eicons|ionicons/i;
    out.fontIssues = [];
    for (const [first, info] of fams) {
      if (GEN.test(first) || sys.includes(first) || ICON.test(first)) continue;
      let kind = null;
      if (!(first in faceStatus)) kind = info.ctl ? 'control-ua-font' : 'undeclared';
      else if (faceStatus[first] !== 'loaded') kind = 'not-loaded';
      else if (want && !want.includes(first)) kind = 'not-in-decisions';
      if (kind) out.fontIssues.push({ kind, family: first, fallback: info.fallback, el: info.sel, text: info.text });
    }
  }

  // ---------------- text
  let allowBr = (dec.brAllowed || []).filter(s => { try { document.querySelector(s); return true; } catch (e) { return false; } }).join(',');
  out.br = mainAll('br').filter(b => !(allowBr && b.closest(allowBr))).map(b => ({ in: sel(b.parentElement), text: txt(b.parentElement).slice(0, 60) }));
  const body = document.body ? document.body.innerText : '';
  out.text = body.slice(0, 200000);
  {
    const list = (dec._placeholderList || ['lorem ipsum', 'your text here', 'your title here', 'your heading here', 'add your text', 'card title', '[your-']).map(s => s.toLowerCase());
    const hay = { body: body.replace(/\s+/g, ' ').toLowerCase(), title: (document.title || '').toLowerCase(), meta: [meta('description'), meta('og:title'), meta('og:description')].filter(Boolean).join('\n').toLowerCase(), jsonld: ld.strings.join('\n').toLowerCase(), attrs: all(document, '[alt],[title],[aria-label]').map(e => [e.getAttribute('alt'), e.getAttribute('title'), e.getAttribute('aria-label')].filter(Boolean).join(' ')).join('\n').toLowerCase() };
    const found = [];
    for (const [where, t] of Object.entries(hay)) for (const p of list) if (p && t.includes(p)) found.push({ text: p, in: where });
    // developer markers: case-sensitive, from text sources (text-transform cannot create them)
    const dev = []; const tw = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const hidden = []; let n;
    while ((n = tw.nextNode())) { const pe = n.parentElement; if (!pe || pe.closest('script,style,noscript,template,code,pre')) continue; const t = n.textContent; if (/\b(TODO|TBD|FIXME)\b/.test(t)) dev.push(t.trim().slice(0, 60)); if (!pe.getClientRects().length && t.trim() && hidden.length < 400) hidden.push(t.trim()); }
    const hiddenText = hidden.join('\n').toLowerCase();
    for (const p of list) if (p && hiddenText.includes(p)) found.push({ text: p, in: 'hidden text' });
    out.placeholders = [...new Map(found.map(f => [f.in + '|' + f.text, f])).values()].sort((a, b) => (a.in + a.text < b.in + b.text ? -1 : 1));
    out.devMarkers = [...new Set(dev)].slice(0, 10);
    const tokRe = /\{\{[^{}\n]{1,80}\}\}|\{%[^%\n]{1,80}%\}|\[\[[a-z_][\w.-]{1,40}\]\]|%%[a-z_]+%%/gi;
    out.rawTokens = [...new Set([...(body.match(tokRe) || []), ...((document.title || '').match(tokRe) || []), ...((meta('description') || '').match(tokRe) || []), ...(hidden.join(' ').match(tokRe) || [])])].slice(0, 10);
    out.hiddenText = hidden.join('\n').slice(0, 20000);
  }
  // builder default states (hidden until a form is sent / a list is empty) — textContent, because innerText skips display:none
  out.hiddenStates = all(document, '.w-form-done, .w-form-fail, .w-dyn-empty').map(e => ({ sel: sel(e), kind: e.matches('.w-form-done') ? 'success' : e.matches('.w-form-fail') ? 'error' : 'empty', text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160), ownClasses: [...e.classList].filter(c => !/^w-/.test(c)) }));
  const BTN = '.wp-block-button__link, a[class*=btn], a[class*=button], button, a[class*=arrow], [class*=link-arrow], .w-button';
  // disclosure toggles (FAQ questions, accordion rows) carry a question or heading, not a button label
  out.buttonLabels = all(document, BTN).filter(b => { const rg = regionOf(b); return (rg === 'main' || (rg === 'header' && !/^BUTTON$/.test(b.tagName))) && visible(b) && !srOnly(b) && !b.matches('[role=tab],[aria-pressed],[aria-selected],[aria-expanded],summary') && !b.closest('[class*=faq i],[class*=accordion i]') && !/chip|tag|pill|filter|tab|badge/i.test(b.className.toString()); }).map(b => txt(b)).filter(t => t && t.split(' ').length >= 2 && t.length < 40);
  out.navLabels = all(document, '[data-qa-region=header] nav a, [data-qa-region=header] [class*=nav] a').filter(a => a.getAttribute('href') && !a.getAttribute('href').startsWith('#') && !sameDoc(a)).map(a => ({ label: txt(a).split('\n')[0].slice(0, 40), href: a.href })).filter(x => x.label);
  out.dates = (() => { const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'; const re = new RegExp(`\\b(?:${MON})\\.?\\s*\\d{1,2},?\\s*(?:19|20)\\d{2}\\b|\\b\\d{1,2}\\s+(?:${MON})\\.?,?\\s+(?:19|20)\\d{2}\\b|\\b(?:${MON})\\.\\d{1,2}\\.(?:19|20)\\d{2}\\b|(?<![\\d./])(?:0?[1-9]|[12]\\d|3[01])([./])(?:0?[1-9]|[12]\\d|3[01])\\1(?:19|20)\\d{2}(?![\\d./]\\d)`, 'gi'); return [...new Set(body.match(re) || [])].slice(0, 40); })();

  // ---------------- layout (core: every engine)
  Object.assign(out, layout(document, true));
  out.scrollbarW = innerWidth - document.documentElement.clientWidth;
  // fractional pixels (em/% included)
  out.fractional = [];
  const PX = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap', 'borderTopLeftRadius', 'fontSize', 'marginTop', 'marginBottom'];
  for (const e of document.querySelectorAll('[data-qa-region=main] *, [data-qa-region=header] *, [data-qa-region=footer] *')) {
    const c = getComputedStyle(e); if (c.display === 'none' || !visible(e)) continue;
    const own = ownText(e);
    for (const p of PX) {
      if ((dec.fractionalAllowedProps || []).includes(p)) continue;
      if (p === 'fontSize' && !own) continue;                              // UA font-size on icon-only controls is invisible
      if ((p === 'marginTop' || p === 'marginBottom') && /^(flex|grid)$/.test(getComputedStyle(e.parentElement || e).display)) continue; // auto margins resolve to fractions
      const v = parseFloat(c[p]); if (v && Math.abs(v - Math.round(v)) > 0.05) out.fractional.push(`${sel(e)} ${p}=${c[p]}`);
    }
    if (out.fractional.length > 200) { out.fractionalCapped = true; break; }
  }
  // grid balance
  out.grids = [];
  for (const g of mainAll('*')) {
    const c = getComputedStyle(g); if (!(c.display === 'grid' || (c.display === 'flex' && c.flexWrap === 'wrap'))) continue;
    const kids = [...g.children].filter(visible); if (kids.length < 3) continue;
    const sg = k => k.tagName + '.' + cls(k).split('.')[0]; const s0 = sg(kids[0]); if (!kids.every(k => sg(k) === s0)) continue;
    if (inScroller(g) || fadedOut(g) || clipX(g, g.getBoundingClientRect())) continue;
    const tops = [...new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)))].sort((a, b) => a - b);
    if (tops.length < 2) continue;
    const cols = kids.filter(k => Math.round(k.getBoundingClientRect().top) === tops[0]).length;
    const last = kids.filter(k => Math.round(k.getBoundingClientRect().top) === tops[tops.length - 1]);
    if (Math.max(...kids.map(k => k.getBoundingClientRect().height)) < 60) continue; // tags / pills / chips are not cards
    if (cols >= 2 && last.length < cols) { const lw = last.reduce((a, k) => a + k.getBoundingClientRect().width, 0); const fw = g.getBoundingClientRect().width; if (lw < fw * 0.9) out.grids.push({ sel: sel(g), cards: kids.length, cols, lastRow: last.length, lastRowWidthPct: Math.round(lw / fw * 100) }); }
  }
  // LAY-18 row gap: wrapped grid/flex rows must not touch (vertical distance between rows ≥ edgeMinPx, and not far below the column gap)
  out.rowGaps = [];
  for (const g of mainAll('*')) {
    const c = getComputedStyle(g); if (!(c.display === 'grid' || c.display === 'inline-grid' || (c.display === 'flex' && c.flexWrap === 'wrap'))) continue;
    const kids = [...g.children].filter(visible); if (kids.length < 2) continue;
    if (inScroller(g) || fadedOut(g)) continue;
    const rows = {}; for (const k of kids) { const r = k.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; const t = Math.round(r.top); (rows[t] = rows[t] || []).push(r); }
    const tops = Object.keys(rows).map(Number).sort((a, b) => a - b); if (tops.length < 2) continue;
    const colGap = parseFloat(c.columnGap) || 0;
    for (let i = 1; i < tops.length; i++) {
      // measure painted content, not boxes: a row with its own padding/dividers is not touching
      const inner = (el, edge) => { const ds = [...el.querySelectorAll('*')].filter(d => (visible(d) && !d.children.length) || d.tagName === 'IMG' || d.tagName === 'svg'); const rs = ds.map(d => d.getBoundingClientRect()).filter(r => r.width > 1 && r.height > 1); if (!rs.length) { const r = el.getBoundingClientRect(); return edge === 'b' ? r.bottom : r.top; } return edge === 'b' ? Math.max(...rs.map(r => r.bottom)) : Math.min(...rs.map(r => r.top)); };
      const prevEls = kids.filter(k => Math.round(k.getBoundingClientRect().top) === tops[i - 1]), curEls = kids.filter(k => Math.round(k.getBoundingClientRect().top) === tops[i]);
      const prevBottom = Math.max(...prevEls.map(k => inner(k, 'b'))); const gap = Math.round(Math.min(...curEls.map(k => inner(k, 't'))) - prevBottom);
      if (gap < -1) continue; // overlapping rows = masonry / absolute, handled elsewhere
      const boxGap = Math.round(Math.min(...curEls.map(k => k.getBoundingClientRect().top)) - Math.max(...prevEls.map(k => k.getBoundingClientRect().bottom))); const pills = Math.max(...kids.map(k => k.getBoundingClientRect().height)) < 60; const small = !pills && (gap < EDGE || (boxGap <= 1 && gap < 24)); const uneven = !small && colGap >= 16 && rows[tops[i - 1]].length >= 2 && gap < colGap / 2;
      if (small || uneven) { out.rowGaps.push({ sel: sel(g), row: i + 1, gap, boxGap, colGap: Math.round(colGap), rowGapCss: c.rowGap, kids: kids.length, kind: small ? 'touch' : 'uneven' }); break; }
    }
  }
  // LINK-14 cursor: every visible link / button shows the pointer cursor
  out.noPointer = [];
  { const seen = new Set();
    for (const e of all(document, 'a[href], button, [role=button], input[type=submit], input[type=button], summary, label[for]')) {
      if (out.noPointer.length >= 60) break; if (!visible(e) || e.disabled || e.getAttribute('aria-disabled') === 'true') continue;
      const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
      const cur = getComputedStyle(e).cursor; if (cur === 'pointer') continue;
      const k = sel(e) + '|' + txt(e).slice(0, 30); if (seen.has(k)) continue; seen.add(k);
      out.noPointer.push({ sel: sel(e), text: txt(e).slice(0, 40), cursor: cur });
    } }
  // LAY-19 horizontal scroll rails: content that overflows sideways inside a scroll container (cards cut at the edge)
  out.rails = [];
  for (const g of all(document.body, '*')) {
    if (out.rails.length >= 20) break; const c = getComputedStyle(g); if (!/(auto|scroll)/.test(c.overflowX)) continue;
    if (g === document.body || g === document.documentElement || !visible(g)) continue;
    if (g.scrollWidth <= g.clientWidth + 8 || g.clientWidth < 120 || g.getBoundingClientRect().height < 60) continue;
    if (closest(g, '.w-slider, [class*=swiper], [class*=splide], [class*=marquee i], [class*=ticker i], table, pre, code, [role=tablist]')) continue;
    if (all(out.rails, '').length) {}
    if (out.rails.some(x => x.el && x.el.contains(g))) continue;
    out.rails.push({ el: g, sel: sel(g), scrollW: g.scrollWidth, clientW: g.clientWidth, items: g.children.length === 1 ? g.children[0].children.length : g.children.length, scrollbar: c.scrollbarWidth !== 'none' });
  }
  out.rails = out.rails.map(({ el, ...x }) => x);
  // LAY-20 link groups: a run of ≥3 sibling links that wraps keeps one horizontal gap and a vertical gap close to it
  out.linkGaps = [];
  { const groups = new Set(); for (const a of all(document, 'a[href]')) { const g = a.parentElement && a.parentElement.tagName === 'LI' ? a.parentElement.parentElement : a.parentElement; if (g) groups.add(g); }
    for (const g of groups) {
      if (out.linkGaps.length >= 30) break; if (!visible(g)) continue;
      const links = [...g.children].map(k => k.tagName === 'A' ? k : k.querySelector(':scope > a')).filter(a => a && visible(a)); if (links.length < 3) continue;
      const rects = links.map(a => a.getBoundingClientRect()); const lines = {}; rects.forEach(r => { const t = Math.round(r.top); (lines[t] = lines[t] || []).push(r); });
      const tops = Object.keys(lines).map(Number).sort((a, b) => a - b); if (tops.length < 2) continue;
      if (tops.every(t => lines[t].length === 1)) continue; // a vertical list, not a wrapped run
      const h = []; tops.forEach(t => { const L = lines[t].sort((a, b) => a.left - b.left); for (let i = 1; i < L.length; i++) h.push(Math.round(L[i].left - L[i - 1].right)); });
      const v = []; for (let i = 1; i < tops.length; i++) v.push(Math.round(tops[i] - Math.max(...lines[tops[i - 1]].map(r => r.bottom))));
      if (!h.length) continue; const hMin = Math.min(...h), hMax = Math.max(...h), vMin = Math.min(...v), vMax = Math.max(...v);
      const unevenH = hMax - hMin > 2, mismatch = Math.abs(hMax - vMax) > 4;
      if (unevenH || mismatch) out.linkGaps.push({ sel: sel(g), links: links.map(a => txt(a).slice(0, 24)), h: [...new Set(h)], v: [...new Set(v)], why: unevenH ? 'uneven gaps between links on one line' : 'horizontal and vertical gaps differ' });
    } }
  // LAY-22 narrow measure: body text squeezed into columns too narrow to read (few words per line, very tall ragged blocks)
  out.narrow = [];
  for (const e of all(document.body, 'p, li, [class*=desc], [class*=text]')) {
    if (out.narrow.length >= 40) break; if (!visible(e) || e.children.length > 2) continue;
    const t = txt(e); if (t.length < 80) continue; const c = getComputedStyle(e); const lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.4; const r = e.getBoundingClientRect();
    const lines = Math.round(r.height / lh); if (lines < 5) continue; const cpl = Math.round(t.length / lines);
    if (cpl < 20 && !e.querySelector('li, div, p')) { const box = e.parentElement; const sibs = box && box.parentElement ? [...box.parentElement.children].filter(visible).length : 1; out.narrow.push({ sel: sel(e), box: sel(box && box.parentElement || box), text: t.slice(0, 40), cpl, lines, width: Math.round(r.width), cols: sibs }); }
  }
  // sections: unwrap single-child wrappers (WordPress entry-content, Webflow page-wrapper, builder roots)
  const blockKids = el => [...el.children].filter(k => !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT|BR)$/.test(k.tagName) && visible(k) && !/^(fixed|absolute)$/.test(getComputedStyle(k).position) && regionOf(k) !== 'header' && regionOf(k) !== 'footer' && !k.matches('[data-qa-region=header],[data-qa-region=footer]'));
  const SECTIONISH = 'section, [class*=section i], .wp-block-group.alignfull, .wp-block-cover.alignfull, .e-con.e-parent, .elementor-top-section, [data-section]';
  const sectionsOf = () => {
    if (dec._sectionSel) { const m = outermost(all(document, dec._sectionSel).filter(visible)); return { how: 'selector', root: dec._sectionSel, depth: 0, list: m }; }
    let root = main, depth = 0;
    for (; depth < 8; depth++) {
      const kids = blockKids(root);
      if (kids.length === 1 && kids[0].children.length) { root = kids[0]; continue; }
      if (kids.filter(k => matches(k, SECTIONISH)).length >= 2) break;
      const hs = kids.map(k => k.getBoundingClientRect().height), tot = hs.reduce((a, b) => a + b, 0);
      const big = kids.find((k, i) => tot && hs[i] >= tot * 0.8 && blockKids(k).length >= 2);
      if (big) { root = big; continue; }
      break;
    }
    return { how: 'descent', root: sel(root), depth, list: blockKids(root) };
  };
  const SEC = sectionsOf();
  out.sectionModel = { how: SEC.how, root: SEC.root, depth: SEC.depth, count: SEC.list.length };
  const CONTENT = 'h1,h2,h3,h4,h5,h6,p,li,img,svg,video,iframe,picture,button,input,select,textarea,a,blockquote,figure,form,table';
  const contentBounds = s => { let t = Infinity, b = -Infinity; for (const d of s.querySelectorAll(CONTENT)) { if (!visible(d) || srOnly(d) || /absolute|fixed/.test(getComputedStyle(d).position) || d.closest('[aria-hidden="true"]')) continue; const q = d.getBoundingClientRect(); if (!q.height) continue; t = Math.min(t, q.top); b = Math.max(b, q.bottom); } return { t, b }; };
  const bgKey = e => { for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.backgroundImage !== 'none') return 'img:' + c.backgroundImage.slice(0, 60); const m = c.backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0.05)) return c.backgroundColor; } return 'rgb(255, 255, 255)'; };
  out.sectionPad = SEC.list.map(s => { const c = getComputedStyle(s), r = s.getBoundingClientRect(); const cb = contentBounds(s); return { sel: sel(s), key: s.tagName.toLowerCase() + '.' + (cls(s).split('.')[0] || ''), pt: c.paddingTop, pb: c.paddingBottom, inTop: isFinite(cb.t) ? Math.round(cb.t - r.top) : null, inBot: isFinite(cb.b) ? Math.round(r.bottom - cb.b) : null, bg: bgKey(s), h: Math.round(r.height) }; });
  // mobile alignment inside centred sections (every section, not only the first hit)
  out.align = [];
  if (vw < 768) for (const s of SEC.list) {
    const blocks = [...s.querySelectorAll('h1,h2,h3,h4,p,ul,ol,.wp-block-buttons,[class*=buttons],figure,form,blockquote')].filter(b => visible(b) && !srOnly(b) && !inScroller(b) && !fadedOut(b) && !b.parentElement.closest('ul,ol,p,figure,form,blockquote,[class*=buttons]'));
    const sr = s.getBoundingClientRect(); const cx = (sr.left + sr.right) / 2;
    const kind = b => { const r = b.getBoundingClientRect(); const ta = getComputedStyle(b).textAlign; if (ta === 'center') return 'C'; if (r.width < sr.width * 0.85 && Math.abs((r.left + r.right) / 2 - cx) <= 4) return 'C'; return 'S'; };
    const ks = blocks.map(kind); const C = ks.filter(k => k === 'C').length;
    if (C >= 2 && C > ks.length / 2) blocks.forEach((b, i) => { if (ks[i] !== 'S' || clipX(b, b.getBoundingClientRect())) return; const r = b.getBoundingClientRect(); if (r.width >= sr.width * 0.85) return; if (out.align.length < 30) out.align.push({ section: sel(s), el: sel(b), offset: Math.round(Math.abs((r.left + r.right) / 2 - cx)), text: txt(b).slice(0, 30) }); });
  }
  // tabs semantics (filter chips with aria-pressed / role=radio are a valid non-tab pattern)
  out.tabGroups = [];
  {
    const tabish = all(document, '[role=tab], button[class*=tab], [class*=tabs] button, [class*=tab-nav] button, [class*=filter] button').filter(t => visible(t) && (t.getAttribute('role') === 'tab' || (!/^(submit|reset)$/i.test(t.getAttribute('type') || '') && !(t.matches('button[class*=tab]') && !t.closest('[class*=tabs],[class*=tab-nav],[class*=filter]') && !/tab(?!le|let)/i.test(cls(t))))));
    const byParent = new Map(); tabish.forEach(t => { const p = t.parentElement; byParent.set(p, (byParent.get(p) || []).concat(t)); });
    for (const [p, ts] of byParent) {
      if (ts.length < 2) continue;
      if (ts.every(t => t.getAttribute('role') !== 'tab' && (t.hasAttribute('aria-pressed') || t.getAttribute('role') === 'radio' || t.hasAttribute('aria-current')))) continue;
      out.tabGroups.push({ sel: sel(p), count: ts.length, roleTab: ts.every(t => t.getAttribute('role') === 'tab'), tablist: p.getAttribute('role') === 'tablist', selected: ts.some(t => t.hasAttribute('aria-selected')) });
    }
  }
  // target size
  out.smallTargets = []; out.smallTargetsTotal = 0;
  for (const e of document.querySelectorAll('a, button, [role=button], input[type=checkbox], input[type=radio]')) {
    if (!visible(e) || srOnly(e)) continue; const r = e.getBoundingClientRect();
    const inline = e.tagName === 'A' && e.closest('p, li') && getComputedStyle(e).display === 'inline';
    if (!inline && (r.width < 24 || r.height < 24)) { out.smallTargetsTotal++; if (out.smallTargets.length < 20) out.smallTargets.push(`${sel(e)} ${Math.round(r.width)}×${Math.round(r.height)} "${txt(e).slice(0, 20)}"`); }
  }
  // unification material: buttons (grouped later by look, header included)
  const exempt = (dec.unifyExempt || []).filter(s => { try { document.querySelector(s); return true; } catch (e) { return false; } }).join(',');
  out.btnSig = all(document, '.wp-block-button__link, a[class*=btn], button[class*=btn], a[class*=button], .w-button').filter(b => visible(b) && !srOnly(b) && regionOf(b) !== 'other').map(b => { const c = getComputedStyle(b); return { cls: cls(b), region: regionOf(b), h: Math.round(b.getBoundingClientRect().height), pad: c.paddingTop + '/' + c.paddingLeft, r: c.borderTopLeftRadius, fs: c.fontSize, bg: c.backgroundColor, color: c.color, border: c.borderTopWidth + ' ' + c.borderTopColor, fw: c.fontWeight, text: txt(b).slice(0, 25), exempt: !!(exempt && b.matches(exempt)) }; });
  out.stuck = [];
  // forms (core shape kept for Safari / iOS / cross-engine comparisons)
  {
    const REQ = /\*|\brequired\b|mandatory|obligatoi|obligatori|obbligatori|pflicht|verplicht|wymagan|обов.язков|обязательн/i;
    const shown = e => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false; let p = e; while (p && p !== document.body) { const c = getComputedStyle(p); if ((c.clip && c.clip !== 'auto') || /inset\(50%\)/.test(c.clipPath)) return false; p = p.parentElement; } return true; };
    const visText = (root, skip) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let s = '', n; while ((n = w.nextNode())) { const p = n.parentElement; if (!p || !n.textContent.trim() || p.closest('select,option,datalist,textarea,script,style,noscript,template') || (skip && skip(p)) || !shown(p)) continue; s += ' ' + n.textContent; } return s.replace(/\s+/g, ' ').trim(); };
    const pseudoMark = root => [root, ...root.querySelectorAll('*')].slice(0, 40).some(x => ['::before', '::after'].some(w => { const c = getComputedStyle(x, w); return c.display !== 'none' && !/^(none|normal)$/.test(c.content) && REQ.test(c.content); }));
    const labelEls = e => [...(e.labels || []), ...(e.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)).filter(Boolean)];
    const labelOf = e => ((e.labels && e.labels[0] && e.labels[0].innerText) || e.closest('label')?.innerText || e.getAttribute('aria-label') || labelEls(e).map(x => x.textContent).join(' ') || e.getAttribute('placeholder') || e.getAttribute('data-name') || '').replace(/\s+/g, ' ').trim();
    const hasLabel = e => !!((e.labels && [...e.labels].some(l => txt(l))) || (e.closest('label') && txt(e.closest('label'))) || (e.getAttribute('aria-label') || '').trim() || labelEls(e).some(x => (x.textContent || '').trim()) || (e.getAttribute('title') || '').trim());
    const HP = '[class*=honeypot i],.gform_validation_container,.elementor-field-type-honeypot,.wpforms-field-hp,.nf-field-hp,.frm_verify,.akismet-fields-container,[name*=honeypot i],[name*=fluent_checkme]' + (dec._honeypotSel ? ',' + dec._honeypotSel : '');
    const NOT_LEAD = 'form[role=search],form.cart,form.variations_form,form.woocommerce-cart-form,form.checkout,form[action*="wp-login"],form.post-password-form,form[action*="wp-comments-post"],#commentform,form[action*="add-to-cart"]';
    const userFields = f => [...f.elements].filter(e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['hidden', 'submit', 'button', 'reset', 'search', 'password', 'checkbox', 'radio', 'image'].includes(e.type) && !/^(s|q)$/.test(e.name));
    const captchaLoaded = !!document.querySelector('script[src*="recaptcha"],script[src*="turnstile"],script[src*="hcaptcha"],script[src*="friendlycaptcha"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"]');
    const serverSide = document.querySelector('script[src*="cleantalk" i],input[name^="ct_"],input[name*="apbct"]') ? 'CleanTalk' : null;
    const platformOf = f => f.closest('.w-form') || f.hasAttribute('data-name') ? 'webflow' : f.matches('.wpcf7-form') ? 'cf7' : (f.closest('.gform_wrapper') || /^gform_/.test(f.id)) ? 'gravity' : f.matches('.wpforms-form') ? 'wpforms' : f.matches('.frm-fluent-form') ? 'fluent' : f.matches('.elementor-form') ? 'elementor' : f.closest('.nf-form-cont') ? 'ninja' : f.matches('.frm-show-form') ? 'formidable' : f.matches('.hs-form') ? 'hubspot' : (f.hasAttribute('data-netlify') || f.hasAttribute('netlify')) ? 'netlify' : null;
    const mk = (f, fieldsAll, loose) => {
      const fields = fieldsAll.filter(e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(e.type));
      const realFields = fields.filter(e => visible(e) && !srOnly(e));
      const key = e => e.name || e.id || e;
      const groupOf = e => { let g = null, up = e.parentElement; while (up && up !== f && up !== document.body && new Set(realFields.filter(x => up.contains(x)).map(key)).size === 1) { g = up; up = up.parentElement; } return g; };
      const groups = realFields.map(groupOf);
      const inOwn = p => p.closest('label') || groups.some(g => g && g.contains(p));
      const near = loose ? [] : [f.previousElementSibling, f.nextElementSibling].filter(x => x && !x.matches('form') && !x.querySelector('form,input,select,textarea')).map(x => visText(x)).filter(t => t.length < 200);
      const noteText = loose ? '' : ([visText(f, inOwn), ...near].find(t => REQ.test(t)) || '');
      const honeypot = !!(loose ? null : f.querySelector(HP)) || fields.some(e => (srOnly(e) || !visible(e)) && (/hp|honey|extra|trap|website_url|leave/i.test(e.name + ' ' + e.id + ' ' + labelOf(e)) || e.tabIndex === -1));
      const captchaCfg = loose ? false : (f.matches('[data-turnstile-sitekey],[data-sitekey]') || !!f.querySelector('[data-sitekey],[data-turnstile-sitekey],.cf-turnstile,.g-recaptcha,.h-captcha,.frc-captcha,[class*=captcha],[class*=turnstile],input[name*=captcha i]'));
      const btn = loose ? null : f.querySelector('[type=submit],button:not([type]),input[type=image]');
      const lead = !loose && !f.matches(NOT_LEAD) && !f.querySelector('input[type=password]') && userFields(f).length > 0;
      const act = loose ? '' : (f.getAttribute('action') || '').trim();
      return {
        sel: loose ? '(fields outside <form>)' : sel(f), loose: !!loose, action: loose ? null : f.getAttribute('action'), hasAction: !!act && act !== '#' && !/^javascript:/i.test(act), method: loose ? null : (f.getAttribute('method') || 'get').toLowerCase(), platform: loose ? null : platformOf(f), dataName: loose ? null : f.getAttribute('data-name'), novalidate: !loose && f.noValidate,
        lead, isSearch: !loose && (f.matches('[role=search]') || !!f.querySelector('input[type=search]') || userFields(f).every(e => /^(s|q|search|query)$/i.test(e.name))), password: !loose && !!f.querySelector('input[type=password]'),
        honeypot, captcha: captchaCfg && captchaLoaded, captchaCfg, captchaLoaded, serverSide, text: txt(f).slice(0, 400), note: !!noteText, noteText: noteText.slice(0, 80),
        submit: btn ? { disabled: btn.disabled || btn.getAttribute('aria-disabled') === 'true', text: txt(btn).slice(0, 30) || btn.value || '' } : null,
        fields: realFields.map((e, i) => { const c = getComputedStyle(e); const ph = e.tagName !== 'SELECT' ? getComputedStyle(e, '::placeholder') : null; const opt = e.tagName === 'SELECT' && e.options[0] ? { value: e.options[0].value, disabled: e.options[0].disabled, text: (e.options[0].text || '').trim().slice(0, 30) } : null; return { tag: e.tagName, type: e.type, name: e.name, id: e.id, dataName: e.getAttribute('data-name'), label: labelOf(e).slice(0, 50), hasLabel: hasLabel(e), placeholder: e.getAttribute('placeholder') || '', req: e.required || e.getAttribute('aria-required') === 'true', maxl: e.maxLength, ac: e.getAttribute('autocomplete'), min: e.getAttribute('min'), h: Math.round(e.getBoundingClientRect().height), pt: c.paddingTop, pb: c.paddingBottom, lh: c.lineHeight, fs: c.fontSize, color: c.color, opacity: c.opacity, ff: c.fontFamily, fw: c.fontWeight, ph: ph ? { color: ph.color, opacity: ph.opacity, fs: ph.fontSize, ff: ph.fontFamily, fw: ph.fontWeight } : null, firstOpt: opt, marked: [...labelEls(e), groups[i]].filter(Boolean).some(r => REQ.test(visText(r)) || pseudoMark(r)), readonly: e.readOnly, disabled: e.disabled }; }),
      };
    };
    out.forms = [...document.forms].filter(f => visible(f)).map(f => mk(f, [...f.elements]));
    const loose = all(document, 'input:not([type=hidden]):not([type=search]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,select').filter(e => !e.form && visible(e) && !srOnly(e));
    if (loose.length >= 2) out.forms.push(mk(document.body, loose, true));
    const EMBED = /hsforms|hubspot\.com|typeform\.com|jotform|calendly\.com|formstack|wufoo\.com|cognitoforms|docs\.google\.com\/forms|forms\.gle|tally\.so|paperform|forms\.office\.com|zohopublic|123formbuilder|airtable\.com\/embed/i;
    out.formsUnreached = [
      ...[...document.forms].filter(f => !visible(f) && !f.matches(NOT_LEAD) && !f.querySelector('input[type=password]') && userFields(f).length).map(f => ({ kind: 'hidden (modal/popup/tab)', sel: sel(f) })),
      ...all(document, 'iframe').filter(i => EMBED.test(i.getAttribute('src') || i.getAttribute('data-src') || '') || i.matches('.hs-form-iframe')).map(i => ({ kind: 'embedded iframe', sel: (i.getAttribute('src') || i.getAttribute('data-src') || 'hubspot iframe').slice(0, 80) })),
      ...all(document, '.hs-form-frame,[data-tf-widget],[data-tf-live],.calendly-inline-widget,.typeform-widget').map(e => ({ kind: 'embed widget', sel: sel(e) })),
    ];
  }
  out.maps = []; out.mapsJs = [];
  out.hamburgerVisible = (() => { const s = dec._burgerSel; if (!s) return false; const c = all(document, s).filter(b => !b.parentElement || !closest(b.parentElement, s)).filter(b => visible(b) && !b.closest('li')); return c.length > 0; })();
  out.faqLike = !!document.querySelector('details, [class*=faq i], [class*=accordion i]');
  if (!FULL) return out;

  // =========================================================================== extended (chromium) sweep
  // ---- template signature (used to sample large CMS sites per template)
  { const bc = [...(document.body ? document.body.classList : [])]; const H = document.documentElement; const pk = re => bc.find(c => re.test(c));
    if (H.dataset.wfPage) out.tpl = 'wf:' + H.dataset.wfPage;
    else if (bc.some(c => /^(postid|page-id)-\d+$|^(single|archive|home|blog|search|error404)$/.test(c))) out.tpl = bc.includes('home') ? 'wp:front' : bc.includes('page') ? 'wp:page:' + location.pathname : 'wp:' + (pk(/^single-(?!format-)[\w-]+$/) || pk(/^post-type-archive-[\w-]+$/) || pk(/^(category|tag|tax-[\w-]+|author|date|search|blog|archive)$/) || 'other');
    else out.tpl = 'dom:' + location.pathname.replace(/[^/]+\/?$/, '') + '|' + [...main.children].slice(0, 12).map(e => e.tagName.toLowerCase() + '.' + ((e.className || '').toString().trim().split(/\s+/)[0] || '')).join('>');
    // PAGE-02 material: body classes and post-list items (a CMS index rendered for an unknown URL)
    out.bodyClass = bc.join(' ').slice(0, 300);
    out.postItems = all(main, 'article, .wp-block-post, .type-post, .w-dyn-item').filter(visible).length; }
  // ---- platform markers (positive evidence only; bare w- classes are never a Webflow marker)
  { const gen = (meta('generator') || ''); const res = all(document, 'link[href],script[src]').map(e => e.href || e.src).join(' ');
    out.platformSignals = { webflow: !!document.documentElement.dataset.wfSite || !!document.documentElement.dataset.wfPage || /^Webflow/i.test(gen) || /website-files\.com|webflow(\.[\w-]+)?\.js/i.test(res), wordpress: /^WordPress/i.test(gen) || /\/wp-(content|includes)\//.test(res) || !!document.querySelector('link[rel="https://api.w.org/"]'), other: /cdn\.shopify\.com/.test(res) ? 'shopify' : (/^Framer/i.test(gen) || /framerusercontent\.com/.test(res)) ? 'framer' : /wixstatic\.com/.test(res) ? 'wix' : /squarespace(-cdn)?\.com/.test(res) ? 'squarespace' : /^Ghost/i.test(gen) ? 'ghost' : /hs-scripts\.com|hubspot/.test(res) && /^HubSpot/i.test(gen) ? 'hubspot' : null, generator: gen.slice(0, 60) }; }

  // ---- LINK-08/09 contacts
  out.contactLinks = all(document, 'a[href^="mailto:" i],a[href^="tel:" i]').map(a => ({ href: a.getAttribute('href').trim(), text: txt(a).slice(0, 60), sel: sel(a), vis: visible(a) }));
  out.contactText = [];
  { const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi; const PHONE = /(?:\+\d[\d\s().\-‑–]{6,}\d|\(\d{2,4}\)\s?\d[\d\s.\-]{5,}\d|\b0\d[\d\s.\-]{7,}\d|\b\d{3}[.\-]\d{3}[.\-]\d{4}\b)/g;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode()) && out.contactText.length < 40;) {
      const e = n.parentElement; if (!e || !visible(e) || srOnly(e) || e.closest('a[href^="mailto:" i],a[href^="tel:" i],a[href*="/cdn-cgi/l/email-protection"],script,style,noscript,code,pre,input,textarea,select,option,time')) continue;
      const t = n.textContent; const ctx = e.closest('header,[data-qa-region=header]') ? 'header' : e.closest('footer,[data-qa-region=footer]') ? 'footer' : e.closest('address,[class*=contact i]') ? 'contact' : 'main';
      (t.match(EMAIL) || []).filter(v => !/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(v)).forEach(v => out.contactText.push({ kind: 'email', v, sel: sel(e), ctx }));
      (t.match(PHONE) || []).filter(v => { const d = v.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 && !/^\d{4}\s*[-–]\s*\d{4}$/.test(v.trim()) && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v.trim()) && (/[\s().\-+]/.test(v) || v.trim().startsWith('+')); }).forEach(v => out.contactText.push({ kind: 'phone', v: v.trim(), sel: sel(e), ctx, plus: /^\+|\(/.test(v.trim()) }));
    } }
  // ---- LINK-13 controls that do something
  out.toggleAnchors = all(document, 'a[href^="#"]:not([role=tab])').filter(a => visible(a) && (a.hasAttribute('aria-expanded') || a.hasAttribute('aria-controls') || a.getAttribute('role') === 'button' || a.hasAttribute('data-toggle') || a.hasAttribute('data-bs-toggle') || /(^|[\s_-])(toggle|burger|hamburger|accordion|dropdown-toggle|menu-toggle|close)([\s_-]|$)/i.test(a.className.toString()))).map(a => ({ sel: sel(a), text: txt(a).slice(0, 40), href: a.getAttribute('href') }));
  document.querySelectorAll('[data-qa-btn]').forEach(e => e.removeAttribute('data-qa-btn'));
  out.buttons = all(document, 'button,[role=button]').filter(b => visible(b) && !b.closest('form') && !b.hasAttribute('form') && !/^(submit|reset)$/i.test(b.getAttribute('type') || '') && b.tagName !== 'A' && regionOf(b) !== 'other').slice(0, 120).map((b, i) => { b.setAttribute('data-qa-btn', i); return { i, sel: sel(b), text: (txt(b) || b.getAttribute('aria-label') || '').slice(0, 40), attrAction: ['aria-controls', 'aria-expanded', 'aria-haspopup', 'popovertarget', 'commandfor', 'onclick', 'data-toggle', 'data-bs-toggle', 'data-target', 'data-bs-target', 'data-action', 'data-w-id'].some(k => b.hasAttribute(k)) || b.matches('summary') }; });
  // ---- CMS-01 self links inside collection lists
  { const norm = u => { try { const x = new URL(u, location.href); return (x.origin + x.pathname).toLowerCase().replace(/\/$/, ''); } catch (e) { return ''; } };
    const here = norm(location.href);
    out.selfLinks = mainAll('a[href]').filter(a => !a.closest('nav,[aria-label*=breadcrumb i],[class*=breadcrumb],[class*=pagination],.nav-links,[hreflang],[class*=lang]') && !(a.getAttribute('href') || '').startsWith('#') && !a.matches('[rel=prev],[rel=next]') && visible(a) && norm(a.href) === here && !(dec.selfLinkAllowed || []).some(s => matches(a, s))).map(a => { const item = a.closest('.w-dyn-item,.wp-block-post,article,li,[class*=card]'); const sib = item && item.parentElement ? [...item.parentElement.children].filter(k => k.tagName === item.tagName && cls(k).split('.')[0] === cls(item).split('.')[0]).length : 0; return { sel: sel(a), text: txt(a).slice(0, 40), inCollection: sib >= 2 }; }).slice(0, 20);
    out.cmsLists = mainAll('.w-dyn-items,.wp-block-post-template,[class*=related i],[class*=collection i],[class*=posts i],[class*=grid i]').filter(g => { const k = [...g.children].filter(visible); return k.length >= 2 && k.filter(x => x.querySelector('a[href]')).length >= 2; }).length; }
  // ---- IMG-09 background images that may carry meaning
  out.bgImgs = [];
  for (const e of all(document, '[data-qa-region] *')) {
    if (out.bgImgs.length >= 30) break;
    const c = getComputedStyle(e); if (!/url\(/.test(c.backgroundImage) || c.backgroundRepeat === 'repeat') continue;
    if (!visible(e) || srOnly(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 32 || r.height < 32 || r.width * r.height < 2500) continue;
    if (txt(e) || e.getAttribute('role') === 'img' || e.getAttribute('aria-label') || e.getAttribute('title') || e.closest('[aria-hidden="true"]')) continue;
    const named = e.closest('a,button'); if (named && accName(named)) continue;
    const m = c.backgroundImage.match(/url\(["']?([^"')]+)/); out.bgImgs.push({ sel: sel(e), file: m ? m[1].split(/[?#]/)[0].split('/').pop().slice(0, 60) : '', w: Math.round(r.width), h: Math.round(r.height) });
  }
  // ---- TRACK-01 / TPL-01 / DONOR-01 material
  out.scriptSrcs = [...new Set([...document.scripts].filter(s => s.src).map(s => s.src.split('#')[0]))].slice(0, 200);
  out.inlineScripts = [...document.scripts].filter(s => !s.src && !/json|template|importmap|text\/html/i.test(s.type || '')).map(s => { const t = s.textContent || ''; return { len: t.length, gsap: /gsap|ScrollTrigger|SplitText/.test(t), forbidden: /fetch\(|XMLHttpRequest|sendBeacon|\.submit\(|['"]submit['"]|dataLayer|gtag\(|\$\.ajax|new Image\(/.test(t), wf: /w-mod-|WebFont\.load\(/.test(t), head: t.trim().slice(0, 80) }; }).slice(0, 60);
  { const ID_RE = /\b(?:GTM-[A-Z0-9]{4,}|G-[A-Z0-9]{6,}|UA-[0-9X]{4,}-[0-9X]+|AW-[0-9X]{6,}|DC-[0-9X]{6,})\b/g; const ids = new Set(); const others = new Set();
    for (const s of document.scripts) { const t = s.src || s.textContent || ''; (t.match(ID_RE) || []).forEach(x => ids.add(x)); if (!s.src) { const rx = [[/fbq\(\s*['"]init['"]\s*,\s*['"]([^'"]+)/g, 'Meta Pixel'], [/hjid\s*:\s*(\d+)/g, 'Hotjar'], [/clarity\.ms\/tag\/([a-z0-9]+)/gi, 'Clarity'], [/_linkedin_partner_id\s*=\s*['"]?(\d+)/g, 'LinkedIn'], [/ttq\.load\(\s*['"]([^'"]+)/g, 'TikTok'], [/gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)/g, 'gtag']]; for (const [re, nm] of rx) for (const m of t.matchAll(re)) others.add(nm + ':' + m[1]); } }
    for (const n of all(document, 'noscript')) (n.textContent.match(ID_RE) || []).forEach(x => ids.add(x));
    out.trackerIds = [...ids].sort(); out.trackerOther = [...others].sort(); }
  out.iframes = [...new Set(all(document, 'iframe').map(f => f.getAttribute('src') || f.getAttribute('data-src') || '').filter(Boolean))].slice(0, 40);
  if (Array.isArray(dec.donor) && dec.donor.length) {
    const html = document.documentElement.outerHTML; out.donorHits = [];
    for (const d of dec.donor) { const isHost = /[./]/.test(d); const needle = isHost ? d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\b' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'; const re = new RegExp(needle, 'gi'); let m, k = 0; while ((m = re.exec(html)) && k < 5) { k++; out.donorHits.push({ needle: d, snippet: html.slice(Math.max(0, m.index - 50), m.index + d.length + 50).replace(/\s+/g, ' ') }); } }
  }
  // ---- SEO-09 hard-coded http://
  { const vals = new Set();
    for (const e of all(document, '[src],[srcset],[href],[action],[poster],[data-src],[data-srcset]')) for (const k of ['src', 'srcset', 'href', 'action', 'poster', 'data-src', 'data-srcset']) { const v = e.getAttribute(k); if (v && /(^|[\s,])http:\/\//i.test(v)) (v.match(/http:\/\/[^\s,"')]+/gi) || []).forEach(u => vals.add((e.tagName === 'A' ? 'a ' : 'res ') + u)); }
    for (const e of all(document, '[style*="url("]')) (e.getAttribute('style').match(/url\(\s*["']?(http:\/\/[^"')]+)/gi) || []).forEach(u => vals.add('res ' + u.replace(/url\(\s*["']?/i, '')));
    for (const ss of document.styleSheets) { let rs; try { rs = ss.cssRules; } catch (e) { continue; } const walk = r => { for (const x of r) { if (x.cssRules) walk(x.cssRules); if (x.style && /url\(\s*["']?http:\/\//i.test(x.cssText)) (x.cssText.match(/url\(\s*["']?(http:\/\/[^"')]+)/gi) || []).forEach(u => vals.add('res ' + u.replace(/url\(\s*["']?/i, ''))); } }; try { walk(rs); } catch (e) { } }
    out.httpRefs = [...vals].sort().slice(0, 40); }
  // ---- SEO-11 FAQ in the markup before any click
  { const FAQH = /\bFAQs?\b|frequently asked|questions/i;
    const conts = outermost([...all(document, '[class*=faq i],[id*=faq i]'), ...all(document, 'section,[class*=section i]').filter(s => { const h = s.querySelector('h2,h3'); return h && FAQH.test(txt(h)); })].filter(visible));
    const items = new Set(); for (const c of conts) for (const it of c.querySelectorAll('summary,[aria-expanded],button,[role=button]')) if (visible(it) && txt(it).length > 3) items.add(it);
    const its = [...items].filter(i => ![...items].some(o => o !== i && o.contains(i)));
    const ans = it => { const id = it.getAttribute('aria-controls'); const a = id && document.getElementById(id); if (a) return a; const d = it.closest('details'); if (d) return d; return it.nextElementSibling || it.parentElement?.nextElementSibling; };
    out.faq = { containers: conts.length, items: its.length, empty: its.filter(i => { const a = ans(i); const t = a ? (a.textContent || '').replace(i.textContent || '', '').trim() : ''; return t.length === 0; }).map(i => txt(i).slice(0, 40)).slice(0, 10) }; }
  // ---- COPY-02..07 material
  { const BL = 'h1,h2,h3,h4,p,li,blockquote,figcaption';
    out.copy = { blocks: mainAll(BL).filter(b => visible(b) && !srOnly(b) && !b.closest('nav,[aria-hidden="true"],.swiper-slide-duplicate,.slick-cloned') && !b.parentElement.closest('p,li,blockquote,figcaption')).map(b => ({ tag: b.tagName.toLowerCase(), sel: sel(b), text: txt(b).slice(0, 400), last: txt(b).slice(-1), card: (() => { const c = b.closest('[class*=card],li,article'); return c ? sel(c) : ''; })() })).slice(0, 600) };
    const footer = document.querySelector('[data-qa-region=footer]') || document.body; out.copy.footerText = txt(footer).slice(-1500);
    out.copy.cardGroups = [];
    for (const g of mainAll('*')) {
      const kids = [...g.children].filter(visible); if (kids.length < 2) continue;
      const sg = k => k.tagName + '.' + cls(k).split('.')[0]; const s0 = sg(kids[0]); if (!kids.every(k => sg(k) === s0) || !/card|item|col|post|tile|box/i.test(s0) && !matches(g, 'ul,ol,.w-dyn-items')) continue;
      out.copy.cardGroups.push({ sel: sel(g), cards: kids.map(k => { const t = txt(k); const h = k.querySelector('h1,h2,h3,h4,h5'); const ps = [...k.querySelectorAll('p')]; return { title: h ? txt(h).slice(0, 60) : '', textLen: t.length, hasP: ps.length > 0, last: ps.length ? txt(ps[ps.length - 1]).slice(-1) : '', metrics: [...t.matchAll(/([A-Za-z][A-Za-z ]{1,30}):?\s*([$€£]?\d[\d.,]*\s*%?)/g)].map(m => (m[1].trim() + '=' + m[2].trim()).toLowerCase()).slice(0, 6) }; }) });
      if (out.copy.cardGroups.length >= 40) break;
    }
    out.copy.emptySections = SEC.list.filter(s => { const h = s.querySelector('h1,h2,h3'); if (!h || !visible(h)) return false; const other = txt(s).replace(txt(h), '').trim(); return other.length < 20 && !s.querySelector('img,video,iframe,form,a,picture,svg,canvas'); }).map(s => sel(s)); }
  // ---- texts.json material: attribute copy a visitor or a screen reader meets (spelling / placeholders)
  out.attrTexts = [];
  for (const e of all(document, '[aria-label],[title],[placeholder],img[alt],input[type=submit][value],input[type=button][value]')) {
    if (out.attrTexts.length >= 400) break;
    if (e.closest('script,style,noscript,template,svg title')) continue;
    for (const k of ['aria-label', 'title', 'placeholder', 'alt', 'value']) {
      if (k === 'value' && !e.matches('input[type=submit],input[type=button]')) continue;
      if (k === 'alt') continue; // alts travel separately (imgs)
      const v = (e.getAttribute(k) || '').replace(/\s+/g, ' ').trim(); if (!v || v.length < 2 || /^(https?:|\/|#)/.test(v)) continue;
      out.attrTexts.push({ src: 'attr:' + k, t: v.slice(0, 200), where: sel(e) });
    }
  }
  // ---- presence sweep material
  { const vis = e => visible(e);
    out.presence = {
      search: all(document, 'input[type=search], [role=search], form[role=search], form[action*="search" i], input[name=s], input[name=q]').length,
      dialogTriggers: all(document, '[aria-haspopup=dialog],[data-bs-toggle=modal],[data-toggle=modal],a.w-lightbox,.wp-lightbox-container button,[data-fancybox],[data-lightbox],[data-glightbox],.glightbox,[data-lity],[data-modal-open],[data-popup-open],a[href^="#"][class*=popup i],a[href^="#"][class*=modal i]').filter(e => !e.closest('form') && vis(e)).length,
      dialogs: (() => { let burgerTargets = []; try { burgerTargets = dec._burgerSel ? all(document, dec._burgerSel).map(b => (b.getAttribute('aria-controls') || '').split(/\s+/)[0]).filter(Boolean) : []; } catch (e) { } return all(document, 'dialog,[role=dialog],[aria-modal=true]').filter(e => !/cookie|consent/i.test(e.id + ' ' + e.className) && !e.closest('[data-qa-region=header]') && !(e.id && burgerTargets.includes(e.id))).length; })(),
      accounts: all(document, 'input[type=password]').filter(vis).length + all(document, 'a[href*="login" i],a[href*="sign-in" i],a[href*="signin" i],a[href*="register" i],a[href*="sign-up" i],a[href*="signup" i],a[href*="my-account" i],[data-wf-user-form-type]').length,
      passwordPage: all(document, '.post-password-form,.w-password-page,form[action*="wf_auth"]').length,
      fileField: all(document, 'input[type=file]').length, telNum: all(document, 'input[type=tel],input[type=number]').length,
      sortFilter: all(document, 'select[name*=sort i],[class*=sort i] select,[fs-cmsfilter-element],[class*=filter i] button').length,
      downloads: all(document, 'a[download],a[href$=".pdf" i],a[href$=".doc" i],a[href$=".docx" i],a[href$=".xls" i],a[href$=".xlsx" i],a[href$=".zip" i]').length,
      preloader: all(document, '[class*=preloader i],[id*=preloader i],[class*=page-loader i]').length,
      langSwitch: all(document, '.w-locales-list,.wpml-ls,.trp-language-switcher,.pll-switcher,.weglot-container,.gtranslate_wrapper,[class*=lang-switch i],[class*=language-switch i],a[hreflang]').length,
      subscribe: [...document.forms].filter(f => /subscribe|newsletter/i.test(f.textContent + ' ' + f.className + ' ' + (f.getAttribute('action') || '')) && f.querySelector('input[type=email]')).length,
      comments: all(document, '#comments,#respond,.comment-list,.wp-block-comments').length,
      sliderLike: all(document, '.swiper,.swiper-container,.splide,.slick-slider,.flickity-enabled,.owl-carousel,.glide,.keen-slider,.embla,.w-slider,[aria-roledescription=carousel],[class*=carousel i],[class*=slider i],[class*=marquee i],[class*=ticker i]').filter(e => vis(e) && e.getBoundingClientRect().width >= 200 && !e.matches('input,[role=slider]')).length,
      dropdowns: all(document, '[data-qa-region=header] li, [data-qa-region=header] .w-dropdown, [data-qa-region=header] [aria-haspopup]').filter(li => li.querySelector('ul, [class*=drop], [class*=mega], [class*=sub], .w-dropdown-list') || li.hasAttribute('aria-haspopup')).length,
      anchors: all(document, 'a[href*="#"]').filter(a => sameDoc(a) && !/^#(top|!|\/)?$/i.test(a.hash) && fragOk(a.hash.slice(1)) && vis(a)).length,
      social: out.links.filter(l => /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|youtube|youtu|tiktok|pinterest|threads|vimeo|behance|dribbble)\.(com|be|net)$/i.test((() => { try { return new URL(l.abs).hostname; } catch (e) { return ''; } })())).length,
      contacts: out.contactLinks.length + out.contactText.length,
      cms: out.cmsLists,
    };
    out.overlays = all(document, 'body *').filter(e => { const c = getComputedStyle(e); if (!/fixed|sticky/.test(c.position) || !vis(e) || e.closest('[data-qa-region=header]')) return false; const r = e.getBoundingClientRect(); const ar = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); return ar >= innerWidth * innerHeight * 0.15; }).filter((e, i, arr) => !arr.some(o => o !== e && o.contains(e))).slice(0, 5).map(e => { const r = e.getBoundingClientRect(); return { sel: sel(e), pct: Math.round(Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / (innerWidth * innerHeight) * 100), consent: /cookie|consent|gdpr|cmplz|cky|onetrust|cookiebot/i.test(e.id + ' ' + e.className) }; });
  }
  // ---- maps: iframe or JS map; greyed (filter/opacity) or covered at rest (centre hit-test after scrolling into view)
  { const y0 = scrollY; const MAPRE = /google\.[a-z.]+\/maps|maps\.google|mapbox|openstreetmap|maps\.apple|bing\.com\/maps/i;
    const test = (f, src) => { let p = f, filt = []; while (p && p !== document.body) { const c = getComputedStyle(p); if (c.filter !== 'none') filt.push(c.filter); if (+c.opacity < 1) filt.push('opacity ' + c.opacity); p = p.parentElement; } f.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); const r = f.getBoundingClientRect(); const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); const covered = top && top !== f && !f.contains(top) && !top.closest('.gm-style,.leaflet-container,.mapboxgl-map,.maplibregl-map'); const wm = /for development purposes only|can.t load google maps correctly|this page can.t load google maps/i.test(f.textContent || '') || !!(f.querySelector && f.querySelector('.gm-err-container')); return { src: (src || '').slice(0, 80), filter: filt.join('; '), covered: covered ? (top.id || top.className || top.tagName).toString().slice(0, 40) : null, watermark: wm, iframe: f.tagName === 'IFRAME', noKey: f.tagName === 'IFRAME' && /\/maps\/embed\/v1\//.test(src || '') && !/[?&]key=/.test(src || '') };
    };
    for (const f of all(document, 'iframe')) { const src = f.getAttribute('src') || f.getAttribute('data-src') || f.getAttribute('data-src-cmplz') || f.getAttribute('data-cookieblock-src') || f.getAttribute('data-lazy-src') || ''; if (!MAPRE.test(src)) continue; if (!visible(f)) { out.maps.push({ src: src.slice(0, 80), gated: true }); continue; } out.maps.push(test(f, src)); }
    for (const f of all(document, '.gm-style, gmp-map, .leaflet-container, .mapboxgl-map, .maplibregl-map, .mk-map-view, .ol-viewport')) { if (!visible(f) || out.mapsJs.length >= 6) continue; const host = f.closest('[class*=map i]') || f; out.mapsJs.push(test(host, f.className.toString())); }
    scrollTo({ top: y0, behavior: 'instant' }); }
  // ---- WF material
  out.wf = { wIds: [...new Set(all(document, '[data-w-id]').map(e => e.getAttribute('data-w-id')))].slice(0, 400) };
  try { if (window.Webflow && Webflow.require) { const st = Webflow.require('ix2') && Webflow.require('ix2').store && Webflow.require('ix2').store.getState(); const ix = st && st.ixData; if (ix) { const tg = new Set(); const pick = t => { if (t && typeof t.id === 'string') tg.add(t.id.split('|').pop()); }; Object.values(ix.events || {}).forEach(ev => { pick(ev.target); (ev.targets || []).forEach(pick); }); Object.values(ix.actionLists || {}).forEach(al => (al.actionItemGroups || []).forEach(g => (g.actionItems || []).forEach(it => pick(it.config && it.config.target)))); out.wf.ixTargets = [...tg].slice(0, 600); out.wf.ixRead = true; } } } catch (e) { out.wf.ixError = String(e).slice(0, 80); }

  // ---- LAY-07 extension: sibling sets and headings
  out.siblingSets = [];
  for (const g of mainAll('*')) {
    if (out.siblingSets.length >= 60) break;
    const kids = [...g.children].filter(visible); if (kids.length < 3) continue;
    const sg = k => k.tagName + '.' + cls(k).split('.')[0]; const s0 = sg(kids[0]); if (!kids.every(k => sg(k) === s0) || /^(LI|P|SPAN|A|BR|SVG|PATH)\.$/i.test(s0)) continue;
    if (inScroller(g)) continue;
    const rows = {}; const m = kids.map(k => { const r = k.getBoundingClientRect(); const c = getComputedStyle(k); const med = k.querySelector('img,video,picture img'); const mr = med && med.getBoundingClientRect(); const row = Math.round(r.top); (rows[row] = rows[row] || []).push(r); return { w: Math.round(r.width), h: Math.round(r.height), row, pad: `${c.paddingTop}/${c.paddingRight}/${c.paddingBottom}/${c.paddingLeft}`, rad: c.borderTopLeftRadius, border: c.borderTopWidth + ' ' + c.borderTopStyle, ar: mr && mr.height > 0 ? +(mr.width / mr.height).toFixed(2) : null, text: txt(k).slice(0, 25) }; });
    const gaps = []; Object.values(rows).forEach(rs => { rs.sort((a, b) => a.left - b.left); for (let i = 1; i < rs.length; i++) gaps.push(Math.round(rs[i].left - rs[i - 1].right)); });
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b); const rgap = []; for (let i = 1; i < rowKeys.length; i++) { const prevB = Math.max(...rows[rowKeys[i - 1]].map(r => r.bottom)); rgap.push(Math.round(rowKeys[i] - prevB)); }
    out.siblingSets.push({ sel: sel(g), sig: s0, members: m, gaps, rowGaps: rgap });
  }
  out.headings = mainAll('h1,h2,h3,h4').filter(h => visible(h) && !srOnly(h)).map(h => { const c = getComputedStyle(h); return { key: h.tagName.toLowerCase() + '.' + (cls(h).split('.')[0] || ''), fs: c.fontSize, lh: c.lineHeight, fw: c.fontWeight, ls: c.letterSpacing, ff: nf(c.fontFamily.split(',')[0]), tt: c.textTransform, text: txt(h).slice(0, 30) }; }).slice(0, 200);

  // ---- LAY-11 text vs painted panel edges; asymmetric insets inside a section
  const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd';
  const textBlocks = all(document, TEXT).filter(e => regionOf(e) !== 'other' && visible(e) && !srOnly(e) && !inScroller(e) && !fadedOut(e) && !/fixed|sticky/.test(getComputedStyle(e).position) && !e.parentElement.closest(TEXT));
  const pxv = v => parseFloat(v) || 0;
  const contentBox = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { left: r.left + pxv(c.paddingLeft) + pxv(c.borderLeftWidth), right: r.right - pxv(c.paddingRight) - pxv(c.borderRightWidth), top: r.top + pxv(c.paddingTop) + pxv(c.borderTopWidth), bottom: r.bottom - pxv(c.paddingBottom) - pxv(c.borderBottomWidth) }; };
  const padBox = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { left: r.left + pxv(c.borderLeftWidth), right: r.right - pxv(c.borderRightWidth), top: r.top + pxv(c.borderTopWidth), bottom: r.bottom - pxv(c.borderBottomWidth) }; };
  const colOf = s => { const m = String(s).match(/[\d.]+/g); return m ? { a: m.length > 3 ? +m[3] : 1, k: m.slice(0, 3).join(',') } : { a: 0, k: '' }; };
  out.panels = []; out.panelsTotal = 0;
  for (const el of textBlocks) {
    let panel = null, sides = [];
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const c = getComputedStyle(p); const bg = colOf(c.backgroundColor); const bordered = ['Top', 'Right', 'Bottom', 'Left'].filter(s => pxv(c['border' + s + 'Width']) >= 1 && c['border' + s + 'Style'] !== 'none' && colOf(c['border' + s + 'Color']).a > 0.1);
      const painted = bg.a > 0.05 || c.backgroundImage !== 'none' || c.boxShadow !== 'none';
      if (!painted && !bordered.length) continue;
      if (p.matches('a,button,input,select,textarea,label,[role=button]') || /^inline/.test(c.display)) break;
      const r = p.getBoundingClientRect(); if (r.width < 120 || r.height < 40 || r.width >= vw * 0.98) break;
      const parentBg = p.parentElement ? bgKey(p.parentElement) : 'rgb(255, 255, 255)';
      if (c.backgroundImage !== 'none' || c.boxShadow !== 'none' || (bg.a > 0.05 && bgKey(p) !== parentBg)) sides = ['Top', 'Right', 'Bottom', 'Left']; else sides = bordered;
      if (sides.length) panel = p;
      break;
    }
    if (!panel) continue;
    const cb = contentBox(el), pb = padBox(panel);
    const d = { Top: cb.top - pb.top, Right: pb.right - cb.right, Bottom: pb.bottom - cb.bottom, Left: cb.left - pb.left };
    for (const s of sides) if (d[s] > -1 && d[s] < EDGE) { out.panelsTotal++; if (out.panels.length < 30) out.panels.push({ el: sel(el), text: txt(el).slice(0, 30), panel: sel(panel), side: s.toLowerCase(), px: Math.round(d[s]) }); break; }
  }
  // vertical rules: ≤2px wide, ≥100px tall, painted — text within EDGE of them
  { const rules = all(document, '[data-qa-region] div, [data-qa-region] span, [data-qa-region] hr').filter(e => { const r = e.getBoundingClientRect(); if (r.width > 2 || r.width < 0.5 || r.height < 100) return false; const c = getComputedStyle(e); return colOf(c.backgroundColor).a > 0.1 || pxv(c.borderLeftWidth) >= 0.5; }).slice(0, 40).map(e => ({ e, r: e.getBoundingClientRect() }));
    for (const el of textBlocks) { if (out.panels.length >= 30) break; const cb = contentBox(el); for (const { e, r } of rules) { if (cb.bottom < r.top || cb.top > r.bottom) continue; const dl = cb.left - r.right, dr = r.left - cb.right; const dd = dl >= -1 ? dl : dr >= -1 ? dr : null; if (dd !== null && dd > -1 && dd < EDGE) { out.panelsTotal++; out.panels.push({ el: sel(el), text: txt(el).slice(0, 30), panel: 'rule ' + sel(e), side: dl >= -1 ? 'left' : 'right', px: Math.round(dd) }); break; } } } }
  // asymmetry: one side much smaller than the section's usual inset
  out.asym = [];
  for (const s of SEC.list) {
    const blocks = textBlocks.filter(b => s.contains(b)).map(b => ({ b, r: b.getBoundingClientRect() })).filter(x => x.r.width < vw - 2);
    if (blocks.length < 3) continue;
    const L = mode1(blocks.map(x => Math.round(x.r.left))), R = mode1(blocks.map(x => Math.round(vw - x.r.right))); if (!L || !R) continue;
    const mL = +L[0], mR = +R[0];
    for (const x of blocks) { const l = Math.round(x.r.left), rr = Math.round(vw - x.r.right); if ((rr < mR - 8 && Math.abs(l - mL) <= 2) || (l < mL - 8 && Math.abs(rr - mR) <= 2)) { if (out.asym.length < 20) out.asym.push({ section: sel(s), el: sel(x.b), text: txt(x.b).slice(0, 30), L: l, R: rr, usual: `${mL}/${mR}` }); } }
  }
  // ---- LAY-12 content keeps EDGE on both sides of a background change
  out.bgChange = [];
  for (let i = 1; i < SEC.list.length; i++) {
    const A = SEC.list[i - 1], B = SEC.list[i]; if (bgKey(A) === bgKey(B)) continue;
    const ca = contentBounds(A), cb2 = contentBounds(B); const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    const above = isFinite(ca.b) ? ra.bottom - ca.b : null, below = isFinite(cb2.t) ? cb2.t - rb.top : null;
    if (above !== null && above > -1 && above < EDGE) out.bgChange.push({ boundary: `${sel(A)} → ${sel(B)}`, side: 'above', px: Math.round(above) });
    if (below !== null && below > -1 && below < EDGE) out.bgChange.push({ boundary: `${sel(A)} → ${sel(B)}`, side: 'below', px: Math.round(below) });
  }
  // ---- LAY-13 one left edge
  { const samples = []; const ex = (dec.leftEdgeExceptions || []).filter(s => { try { document.querySelector(s); return true; } catch (e) { return false; } }).join(',');
    const lg = dec._logoSel && all(document, dec._logoSel).find(visible); if (lg && !(ex && lg.matches(ex))) samples.push({ what: 'logo', sel: sel(lg), x: Math.round(lg.getBoundingClientRect().left) });
    for (const s of SEC.list) { const bs = [...s.querySelectorAll('h1,h2,h3,h4,p,li,a,button,input')].filter(b => visible(b) && !srOnly(b) && !inScroller(b) && !/absolute|fixed/.test(getComputedStyle(b).position) && getComputedStyle(b).textAlign !== 'center' && !(ex && b.closest(ex))).map(b => b.getBoundingClientRect()).filter(r => !(r.left <= 1 && r.right >= vw - 1)); if (!bs.length) continue; samples.push({ what: 'section', sel: sel(s), x: Math.round(Math.min(...bs.map(r => r.left))) }); }
    const ft = document.querySelector('[data-qa-region=footer]'); if (ft) { const bs = [...ft.querySelectorAll('p,a,li,h2,h3,h4,span')].filter(b => visible(b) && ownText(b) && getComputedStyle(b).textAlign !== 'center').map(b => b.getBoundingClientRect()); if (bs.length) samples.push({ what: 'footer', sel: sel(ft), x: Math.round(Math.min(...bs.map(r => r.left))) }); }
    out.leftEdge = samples; }
  // ---- LAY-14 spacing skeleton per section
  out.skeleton = [];
  for (const s of SEC.list) {
    const h = [...s.querySelectorAll('h1,h2,h3')].find(x => visible(x) && !srOnly(x)); if (!h) continue;
    const hr = h.getBoundingClientRect();
    const after = [...s.querySelectorAll('p,ul,ol,blockquote')].filter(x => visible(x) && x.getBoundingClientRect().top >= hr.bottom - 1 && !x.closest('[class*=card],li'));
    const t = after[0]; const rec = { section: sel(s), heading: txt(h).slice(0, 30) };
    if (t) { rec.headingText = Math.round(t.getBoundingClientRect().top - hr.bottom); const tr = t.getBoundingClientRect(); const b = [...s.querySelectorAll(BTN)].find(x => visible(x) && x.getBoundingClientRect().top >= tr.bottom - 1 && !x.closest('[class*=card]')); if (b) rec.textButton = Math.round(b.getBoundingClientRect().top - tr.bottom); }
    // head wrapper → next sibling (content)
    let hw = h; while (hw.parentElement && hw.parentElement !== s && blockKids(hw.parentElement).length <= 3 && !hw.parentElement.querySelector('[class*=card],ul li ~ li ~ li')) hw = hw.parentElement;
    const nx = hw.nextElementSibling; if (nx && visible(nx) && hw !== h) rec.headContent = Math.round(nx.getBoundingClientRect().top - hw.getBoundingClientRect().bottom);
    out.skeleton.push(rec);
  }
  // ---- LAY-15 icon line weight per group
  { const iconWeight = el => {
      const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
      if (svg) {
        let shapes = [...svg.querySelectorAll('path,line,polyline,polygon,circle,rect,ellipse')]; let vb = svg.viewBox && svg.viewBox.baseVal;
        const use = svg.querySelector('use'); if (!shapes.length && use) { const id = ((use.href && use.href.baseVal) || use.getAttribute('xlink:href') || '').replace(/^.*#/, ''); const sym = id && document.getElementById(id); if (sym) { shapes = [...sym.querySelectorAll('path,line,polyline,polygon,circle,rect,ellipse')]; if (sym.viewBox && sym.viewBox.baseVal && sym.viewBox.baseVal.width) vb = sym.viewBox.baseVal; } }
        const r = svg.getBoundingClientRect(); if (!r.width) return null;
        const scale = vb && vb.width ? Math.min(r.width / vb.width, r.height / vb.height) : 1;
        const ws = shapes.map(s => { const c = getComputedStyle(s); if (!c.stroke || c.stroke === 'none') return null; const sw = parseFloat(c.strokeWidth); if (!sw) return null; return +(sw * (c.vectorEffect === 'non-scaling-stroke' ? 1 : scale)).toFixed(2); }).filter(x => x !== null);
        if (!ws.length) return { filled: true };
        const m = mode1(ws.map(String)); return { w: +m[0] };
      }
      const r = el.getBoundingClientRect(); if (r.height > 0 && r.height < 6 && r.width >= 12) return { w: +r.height.toFixed(2) };
      return null;
    };
    const groups = { header: [], faq: [], arrows: [], social: [] };
    for (const s of all(document, '[data-qa-region=header] svg')) { if (!visible(s) || s.getBoundingClientRect().width > 40) continue; const w = iconWeight(s); if (w) groups.header.push({ sel: sel(s.closest('a,button') || s), ...w }); }
    for (const s of all(document, 'details svg, [aria-expanded] svg, [class*=faq i] svg, [class*=accordion i] svg')) { if (!visible(s) || s.getBoundingClientRect().width > 40 || regionOf(s) !== 'main') continue; const w = iconWeight(s); if (w) groups.faq.push({ sel: sel(s.closest('summary,button,[aria-expanded]') || s), ...w }); }
    for (const s of mainAll('a svg, button svg')) { if (!visible(s) || s.getBoundingClientRect().width > 32) continue; const host = s.closest('a,button'); if (!txt(host)) continue; const w = iconWeight(s); if (w) groups.arrows.push({ sel: sel(host), ...w }); }
    for (const a of all(document, 'a[href]')) { let h = ''; try { h = new URL(a.href).hostname; } catch (e) { } if (!/(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|threads|vimeo|behance|dribbble)\.com$/i.test(h)) continue; const s = a.querySelector('svg'); if (!s || !visible(s)) continue; const w = iconWeight(s); if (w) groups.social.push({ sel: sel(a), ...w }); }
    for (const k of Object.keys(groups)) groups[k] = groups[k].slice(0, 40);
    out.iconWeights = groups; }
  // ---- LAY-16 truncated copy
  { const allowT = (dec.truncateAllowed || []).filter(s => { try { document.querySelector(s); return true; } catch (e) { return false; } }).join(',');
    out.truncated = [];
    for (const e of all(document, '[data-qa-region] *')) {
      if (out.truncated.length >= 30) break;
      if (!ownText(e) || /^(INPUT|SELECT|TEXTAREA|OPTION)$/.test(e.tagName) || !visible(e) || srOnly(e) || inScroller(e)) continue;
      const c = getComputedStyle(e); let why = null;
      if (c.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) why = 'ellipsis';
      else if (((c.webkitLineClamp && c.webkitLineClamp !== 'none') || (c.lineClamp && c.lineClamp !== 'none')) && e.scrollHeight > e.clientHeight + 1) why = 'line-clamp';
      else { const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect(); for (let p = e; p && p !== document.body; p = p.parentElement) { const pc = getComputedStyle(p); if (/hidden|clip/.test(pc.overflowX + pc.overflowY) && p.getBoundingClientRect().width > 0) { const pr = padBox(p); if (tr.right > pr.right + 1 || tr.bottom > pr.bottom + 1 || tr.left < pr.left - 1) { if (!isTrack(p) && !(p.scrollWidth > p.clientWidth * 1.5)) why = 'clipped by ' + sel(p); } break; } } }
      if (why && !(allowT && e.closest(allowT))) out.truncated.push({ el: sel(e), text: txt(e).slice(0, 40), why });
    } }
  // ---- LAY-17 text under decorative art
  { out.art = []; const y0 = scrollY;
    for (const s of SEC.list) {
      const sr = s.getBoundingClientRect();
      const arts = [...s.querySelectorAll('img,svg,picture,canvas,video')].filter(a => { if (a.closest('a,button') || !visible(a) || a.parentElement.closest('svg')) return false; const r = a.getBoundingClientRect(); if (r.width < 64 || r.height < 64 || r.width > sr.width * 0.7) return false; for (let p = a; p && p !== s; p = p.parentElement) if (/absolute|fixed/.test(getComputedStyle(p).position)) return true; return false; });
      if (!arts.length) continue;
      const texts = [...s.querySelectorAll('h1,h2,h3,p,li')].filter(t => visible(t) && !srOnly(t) && ownText(t));
      for (const a of arts) {
        const ar = a.getBoundingClientRect();
        for (const t of texts) {
          if (a.contains(t) || t.contains(a)) continue;
          const rg = document.createRange(); rg.selectNodeContents(t); const lines = [...rg.getClientRects()];
          const hit = lines.find(l => l.right > ar.left + 1 && l.left < ar.right - 1 && l.bottom > ar.top + 1 && l.top < ar.bottom - 1);
          if (hit) {
            const cx = (Math.max(hit.left, ar.left) + Math.min(hit.right, ar.right)) / 2, cy = (Math.max(hit.top, ar.top) + Math.min(hit.bottom, ar.bottom)) / 2;
            scrollTo({ top: Math.max(0, scrollY + cy - innerHeight / 2), behavior: 'instant' });
            const ny = cy - (scrollY - y0); const stack = document.elementsFromPoint(Math.min(innerWidth - 1, Math.max(0, cx)), Math.min(innerHeight - 1, Math.max(0, cy + y0 - scrollY)));
            const ai = stack.findIndex(x => x === a || a.contains(x)), ti = stack.findIndex(x => x === t || t.contains(x));
            scrollTo({ top: y0, behavior: 'instant' });
            if (out.art.length < 20) out.art.push({ section: sel(s), art: sel(a), text: txt(t).slice(0, 30), over: ai >= 0 && (ti < 0 || ai < ti), ny: Math.round(ny) });
            break;
          }
          const gap = Math.max(ar.left - (rg.getBoundingClientRect().right), (rg.getBoundingClientRect().left) - ar.right); const vOverlap = rg.getBoundingClientRect().bottom > ar.top && rg.getBoundingClientRect().top < ar.bottom;
          const hero = SEC.list.indexOf(s) === 0;
          if (vOverlap && gap >= 0 && (gap < 24 || (hero && vw >= 768 && vw <= 991 && gap < 60)) && out.art.length < 20) out.art.push({ section: sel(s), art: sel(a), text: txt(t).slice(0, 30), gap: Math.round(gap), near: true });
        }
      }
    }
    scrollTo({ top: y0, behavior: 'instant' }); }
  // ---- INT-13 absolute hover layers shorter than their grid / flex cell
  out.hoverLayers = []; out.hoverLayersChecked = 0;
  for (const e of mainAll('a,button,[class*=card],li,summary')) {
    if (out.hoverLayers.length >= 20) break;
    if (!visible(e)) continue;
    for (const w of ['::before', '::after']) {
      const s = getComputedStyle(e, w); if (/^(none|normal)$/.test(s.content) || s.display === 'none' || s.position !== 'absolute' || s.top !== '0px' || s.bottom !== '0px') continue;
      out.hoverLayersChecked++;
      let cb = e; if (getComputedStyle(e).position === 'static') { cb = e.parentElement; while (cb && cb !== document.body && getComputedStyle(cb).position === 'static') cb = cb.parentElement; }
      if (!cb) continue; let cell = e; while (cell.parentElement && !/^(grid|inline-grid|flex|inline-flex)$/.test(getComputedStyle(cell.parentElement).display)) { cell = cell.parentElement; if (cell === document.body) break; }
      if (!cell || cell === document.body || !cell.contains(cb) && cell !== cb) continue;
      const ch = cell.getBoundingClientRect().height, lh = cb.clientHeight; if (ch - lh > 1.5) out.hoverLayers.push({ el: sel(e), pseudo: w, cell: sel(cell), cellH: Math.round(ch), layerH: Math.round(lh) });
    }
  }
  // ---- REF-01 material: values in use (only when the project gave a token file)
  if (dec._tokens) {
    const vals = { color: {}, fontSize: {}, space: {}, radius: {}, durationMs: {}, fontFamily: {} };
    const add = (k, v, s) => { if (v === null || v === undefined || v === '') return; (vals[k][v] = vals[k][v] || { n: 0, ex: s }).n++; };
    for (const e of all(document, '[data-qa-region] *')) {
      if (!visible(e)) continue; const c = getComputedStyle(e); const s = sel(e);
      if (ownText(e)) { add('color', c.color, s); add('fontSize', Math.round(parseFloat(c.fontSize) * 2) / 2, s); add('fontFamily', nf(c.fontFamily.split(',')[0]), s); }
      if (colOf(c.backgroundColor).a > 0.05) add('color', c.backgroundColor, s);
      if (pxv(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none') add('color', c.borderTopColor, s);
      for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) { const v = pxv(c[p]); if (v > 0) add('space', Math.round(v * 2) / 2, s); }
      const rad = pxv(c.borderTopLeftRadius); if (rad > 0 && rad < 999) add('radius', Math.round(rad * 2) / 2, s);
      c.transitionDuration.split(',').map(x => Math.round(parseFloat(x) * 1000)).filter(x => x > 0).forEach(x => add('durationMs', x, s));
    }
    out.tokenVals = vals;
  }
  return out;
}

// Colour kit installed on window.__qaC (contrast, hover and focus checks share one implementation).
// Colours are normalised through a 1×1 canvas, so oklch / lab / color() / color-mix are measured like rgb.
function COLOR_KIT() {
  if (window.__qaC) return true;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const ctx = cv.getContext('2d', { willReadFrequently: true }); const cache = new Map();
  const parse = c => { if (cache.has(c)) return cache.get(c); let v; const m = /^rgba?\(([^)]+)\)$/.exec(c || ''); if (m && !/%/.test(m[1])) { const n = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); v = { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; } else { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; try { ctx.fillStyle = c; } catch (e) { } ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; if (c === 'transparent') v.a = 0; } cache.set(c, v); return v; };
  const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lerp = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 });
  const white = { r: 255, g: 255, b: 255, a: 1 };
  // ancestor chain with group opacity; stops at the first opaque, fully opaque layer
  const chainOf = el => {
    const chain = []; for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); chain.push({ n: p, c, bg: parse(c.backgroundColor), o: +c.opacity }); }
    for (let i = chain.length - 1, acc = 1; i >= 0; i--) { acc *= chain[i].o; chain[i].acc = acc; }
    let top = -1, visual = null;
    for (let i = 0; i < chain.length; i++) {
      const k = chain[i], c = k.c, p = k.n;
      if (c.backgroundImage !== 'none') { visual = 'background image'; break; }
      if ((c.backdropFilter && c.backdropFilter !== 'none') || (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none')) { visual = 'backdrop-filter'; break; }
      if (c.filter !== 'none' && p !== document.documentElement) { visual = 'filter'; break; }
      if (c.mixBlendMode !== 'normal') { visual = 'blend mode'; break; }
      if (i > 0) for (const w of ['::before', '::after']) { const pc = getComputedStyle(p, w); if (!/^(none|normal)$/.test(pc.content) && /absolute|fixed/.test(pc.position) && +pc.opacity > 0.05 && (pc.backgroundImage !== 'none' || parse(pc.backgroundColor).a > 0.05)) { visual = 'overlay pseudo-element'; break; } }
      if (visual) break;
      if (k.bg.a >= 0.999 && k.acc >= 0.999) { top = i; break; }
    }
    return { chain, top, visual };
  };
  const comp = (chain, i, below, fg) => { if (i < 0) return fg ? over(fg, below) : below; const k = chain[i]; const inner = comp(chain, i - 1, over(k.bg, below), fg); return k.o < 1 ? lerp(below, inner, k.o) : inner; };
  const effBg = el => { const ci = chainOf(el); if (ci.visual) return { visual: ci.visual }; return { rgb: comp(ci.chain, ci.top >= 0 ? ci.top : ci.chain.length - 1, white, null) }; };
  // text over media (sibling image, video, CSS background) found by geometry, not by the viewport
  const mediaUnder = (el, ci) => {
    const rg = document.createRange(); rg.selectNodeContents(el); const lines = [...rg.getClientRects()].filter(l => l.width > 0); if (!lines.length) return false;
    const owner = ci.top >= 0 ? ci.chain[ci.top].n : null;
    const cands = window.__qaMedia || [...document.querySelectorAll('img,video,canvas,picture,iframe,object,embed')].filter(m => { const r = m.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 && getComputedStyle(m).visibility !== 'hidden'; });
    return cands.some(m => { if (m.contains(el) || el.contains(m)) return false; if (owner && !owner.contains(m)) return false; const mr = m.getBoundingClientRect(); return lines.some(l => l.right > mr.left + 1 && l.left < mr.right - 1 && l.bottom > mr.top + 1 && l.top < mr.bottom - 1); });
  };
  const textRatio = (el, opt) => {
    const cs = getComputedStyle(el); const ci = chainOf(el);
    if (ci.chain[0].acc < 0.1) return { skip: 'invisible' };
    if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') return { skip: 'clip-text' };
    if (ci.visual) return { visual: ci.visual };
    if (!(opt && opt.noMedia) && mediaUnder(el, ci)) return { visual: 'media under text' };
    if (ci.chain[0].acc < 0.999 && ci.chain.some(k => k.n.getAnimations && k.n.getAnimations().some(a => a.playState === 'running'))) return { visual: 'opacity animating' };
    const fg = parse(cs.webkitTextFillColor || cs.color); const start = ci.top >= 0 ? ci.top : ci.chain.length - 1;
    const tp = comp(ci.chain, start, white, fg), bp = comp(ci.chain, start, white, null);
    const fs = parseFloat(cs.fontSize), large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
    return { ratio: ratio(tp, bp), large, fs };
  };
  window.__qaC = { parse, lum, ratio, over, effBg, textRatio, chainOf };
  return true;
}

// A11Y-01 text contrast (+ A11Y-08 static half: placeholders, field boundaries, disabled controls).
// Needs COLOR_KIT evaluated first. Anything over an image / gradient / blur / media → "visual" (ask + screenshot), never auto-fail.
function CONTRAST(opts) {
  opts = opts || {}; const K = window.__qaC; if (!K) return { error: 'COLOR_KIT not installed' };
  window.__qaMedia = [...document.querySelectorAll('img,video,canvas,picture,iframe,object,embed')].filter(m => { const r = m.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 && getComputedStyle(m).visibility !== 'hidden'; });
  for (const e of document.querySelectorAll('body *')) { const c = getComputedStyle(e); if (/url\(/.test(c.backgroundImage) && e.getBoundingClientRect().width > 2) window.__qaMedia.push(e); }
  const label = el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${(el.textContent || '').trim().slice(0, 30)}"`;
  const fails = [], visual = []; let totalFails = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || cs.visibility === 'hidden') continue;
    const t = K.textRatio(el);
    if (t.skip) continue;
    if (t.visual) { visual.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} in ${(el.closest('header,footer,section,[class*=hero],[class*=card]') || document.body).className.toString().split(' ').slice(0, 2).join('.')} (${t.visual})`); continue; }
    if (t.ratio < (t.large ? 3 : 4.5)) { totalFails++; fails.push(`${t.ratio.toFixed(2)}:1 ${t.fs}px ${label(el)}`); }
  }
  // placeholders and field boundaries (A11Y-08), disabled controls → ask
  const ph = [], bounds = [], disabled = [];
  if (opts.states !== false) for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=range]):not([type=color]), textarea, select')) {
    const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === 'hidden') continue;
    const bgI = K.effBg(e.parentElement || e); if (bgI.visual) continue;
    const surround = bgI.rgb; const own = K.effBg(e);
    if (e.tagName !== 'SELECT' && e.getAttribute('placeholder') && !e.value) { const p = getComputedStyle(e, '::placeholder'); const pc = K.parse(p.color); const a = pc.a * (+p.opacity || 1); const fieldBg = own.rgb || surround; const rr = K.ratio(K.over({ ...pc, a }, fieldBg), fieldBg); const fs = parseFloat(p.fontSize); if (rr < (fs >= 24 ? 3 : 4.5)) ph.push(`${rr.toFixed(2)}:1 placeholder "${e.getAttribute('placeholder').slice(0, 25)}" ${e.tagName.toLowerCase()}${e.name ? '[name=' + e.name + ']' : ''}`); }
    const c = getComputedStyle(e); const sides = ['Bottom', 'Top', 'Left', 'Right'].filter(s => parseFloat(c['border' + s + 'Width']) >= 1 && c['border' + s + 'Style'] !== 'none');
    let b = 0; for (const s of sides) { const bc = K.parse(c['border' + s + 'Color']); b = Math.max(b, K.ratio(K.over(bc, surround), surround)); }
    const f = own.rgb ? K.ratio(own.rgb, surround) : 1; if (Math.max(b, f) < 3) bounds.push(`${Math.max(b, f).toFixed(2)}:1 field boundary ${e.tagName.toLowerCase()}${e.name ? '[name=' + e.name + ']' : ''} (border ${b.toFixed(2)}, fill ${f.toFixed(2)})`);
  }
  if (opts.states !== false) for (const e of document.querySelectorAll(':disabled,[aria-disabled=true]')) { if (!e.getBoundingClientRect().width || !(e.textContent || e.value || '').trim()) continue; const t = K.textRatio(e, { noMedia: true }); if (t.ratio && t.ratio < 3) disabled.push(`${t.ratio.toFixed(2)}:1 ${label(e)}`); }
  delete window.__qaMedia;
  return { fails: [...new Set(fails)].slice(0, 30), totalFails, visual: [...new Set(visual)].slice(0, 30), totalVisual: new Set(visual).size, ph: [...new Set(ph)].slice(0, 20), bounds: [...new Set(bounds)].slice(0, 20), disabled: [...new Set(disabled)].slice(0, 10) };
}

// Snapshot used to compare toggle / hover states. Returns JSON [own, shared]:
// own = the element, every descendant (≤200, ::before/::after included) and its own card ancestors (no other target inside);
// shared = ancestors that also hold other links (a change there only → ask, not pass).
function STATE_OF(el) {
  const P = ['color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'textShadow', 'transform', 'translate', 'scale', 'rotate', 'opacity', 'visibility', 'filter', 'clipPath', 'textDecorationLine', 'textDecorationColor', 'textUnderlineOffset', 'fontWeight', 'letterSpacing', 'outlineColor', 'outlineStyle', 'fill', 'stroke', 'width', 'height'];
  const PS = ['content', 'opacity', 'transform', 'translate', 'scale', 'backgroundColor', 'backgroundSize', 'width', 'height', 'borderTopColor', 'borderBottomColor', 'visibility', 'clipPath'];
  const loop = new Set((document.getAnimations ? document.getAnimations() : []).filter(a => !(window.CSSTransition && a instanceof CSSTransition) && a.effect && a.effect.getTiming().iterations === Infinity).map(a => a.effect.target));
  const one = (e, w) => { const c = getComputedStyle(e, w); if (w && (c.content === 'none' || c.content === 'normal')) return ''; return (w ? PS : P).map(k => String(c[k]).slice(0, 120)).join('|'); };
  const full = e => loop.has(e) ? 'loop' : one(e) + '^' + one(e, '::before') + '^' + one(e, '::after');
  const href = el.getAttribute('href'); const own = [], shared = []; let p = el.parentElement, sh = false;
  for (let i = 0; p && i < 4; i++, p = p.parentElement) {
    if (/^(BODY|MAIN|HEADER|FOOTER|NAV|SECTION|UL|OL|FORM|TABLE)$/.test(p.tagName)) break;
    if (!sh && [...p.querySelectorAll('a[href],button,[role=button]')].some(x => x !== el && !el.contains(x) && !(href && x.getAttribute('href') === href))) sh = true;
    (sh ? shared : own).push(p);
  }
  return JSON.stringify([[el, ...[...el.querySelectorAll('*')].slice(0, 200), ...own].map(full).join('#'), shared.map(full).join('#')]);
}

// Sliders: found by library root, slider/carousel class, scroll-snap container or ticker — never by an arrow alone.
// Only real carousel controls are tagged: never a link with a real href, never anything inside a form.
function SLIDERS() {
  ['data-qa-next', 'data-qa-prev', 'data-qa-host', 'data-qa-track', 'data-qa-mask', 'data-qa-dot'].forEach(a => document.querySelectorAll(`[${a}]`).forEach(e => e.removeAttribute(a)));
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const lab = x => ((x.getAttribute('aria-label') || '') + ' ' + (x.className && x.className.baseVal !== undefined ? x.className.baseVal : x.className) + ' ' + (x.innerText || '')).slice(0, 200);
  const ROOT = '.swiper, .swiper-container, .splide, .slick-slider, .w-slider, .flickity-enabled, .glide, .owl-carousel, .keen-slider, .embla, .f-carousel, [aria-roledescription=carousel], [data-slider], [data-carousel], [class*=slider i], [class*=carousel i], [class*=swiper i], [class*=marquee i], [class*=ticker i]';
  const CTRL = /arrow|button|btn|nav|prev|next|pagination|bullet|dots?\b|control|icon/i;
  const TRACKS = ['.swiper-wrapper', '.splide__list', '.slick-track', '.glide__slides', '.flickity-slider', '.owl-stage', '.embla__container', '.w-slider-mask', '[class*=track]'];
  const realHref = a => { const h = (a.getAttribute('href') || '').trim(); return a.tagName === 'A' && h && !h.startsWith('#') && !/^javascript:/i.test(h); };
  // a <button> without a type defaults to "submit", which matters only inside a form (excluded here)
  const okCtl = b => !b.closest('form') && !(b.matches('button') && b.form) && !realHref(b) && !b.closest('a[href]:not([href^="#"]):not([href=""])');
  const main = document.querySelector('[data-qa-region=main]') || document.querySelector('main') || document.body;
  const inHF = e => !!e.closest('[data-qa-region=header],[data-qa-region=footer],header,footer,nav');
  let hosts = [...main.querySelectorAll(ROOT)].filter(h => vis(h) && h.getBoundingClientRect().width >= 200 && !h.matches('input,[role=slider]') && !CTRL.test((h.className && h.className.toString()) || '') && !inHF(h));
  // scroll-snap containers
  for (const e of main.querySelectorAll('*')) { if (hosts.length > 40) break; const c = getComputedStyle(e); if (/(auto|scroll)/.test(c.overflowX) && c.scrollSnapType && c.scrollSnapType !== 'none' && e.scrollWidth > e.clientWidth * 1.2 && e.children.length >= 2 && !inHF(e)) hosts.push(e); }
  hosts = hosts.filter(h => !hosts.some(o => o !== h && o.contains(h)));
  const out = []; const nextRe = /next|forward|→|›|»|❯/i, prevRe = /prev|back|←|‹|«|❮/i;
  const NAMED_N = '.swiper-button-next,.splide__arrow--next,.slick-next,.flickity-prev-next-button.next,.w-slider-arrow-right,.glide__arrow--right,.owl-next,.carousel-control-next';
  const NAMED_P = '.swiper-button-prev,.splide__arrow--prev,.slick-prev,.flickity-prev-next-button.previous,.w-slider-arrow-left,.glide__arrow--left,.owl-prev,.carousel-control-prev';
  const DOTS = '.swiper-pagination-bullet,.splide__pagination__page,.slick-dots button,.flickity-page-dot,.w-slider-dot,.glide__bullet,.owl-dot';
  for (const host of hosts) {
    if (out.length >= 8) break;
    // Controls often sit next to the slider (Swiper arrows outside .swiper, a .slider-nav row). The section is the scope
    // when it holds no other slider host. Counted on the final host list: ROOT also matches the slider's own parts
    // (.swiper-wrapper, .slider-track, .slider-nav), which used to force the narrow scope and hide the arrows.
    const sec = host.closest('section');
    const scope = sec && hosts.filter(o => sec.contains(o)).length <= 1 ? sec : host;
    const ctrls = [...scope.querySelectorAll('button,[role=button],a,div[class*=arrow],span[class*=arrow]')].filter(b => vis(b) && okCtl(b));
    const next = ctrls.find(b => b.matches(NAMED_N)) || ctrls.find(b => nextRe.test(lab(b)) && !prevRe.test(lab(b)));
    const prev = ctrls.find(b => b.matches(NAMED_P)) || ctrls.find(b => prevRe.test(lab(b)) && b !== next);
    let track = null;
    for (const s of TRACKS) { const t = [...host.querySelectorAll(s)].find(e => e.children.length >= 2 && (!next || !e.contains(next))); if (t) { track = t; break; } }
    if (!track) { let best = 0; host.querySelectorAll('*').forEach(e => { if (e.children.length < 2 || (next && e.contains(next))) return; const r = e.getBoundingClientRect(); const kids = [...e.children].map(k => k.getBoundingClientRect()).filter(k => k.width > 0); const off = kids.filter(k => k.right > r.right + 1 || k.left < r.left - 1).length; const stacked = kids.filter(k => Math.abs(k.left - kids[0].left) < 1 && Math.abs(k.top - kids[0].top) < 1).length; const sc = Math.max(off, stacked > 1 ? stacked : 0); if (sc > best) { best = sc; track = e; } }); }
    const marquee = /marquee|ticker/i.test(host.className.toString()) || (host.getAnimations && host.querySelectorAll('*').length < 400 && [...host.querySelectorAll('*')].some(e => e.getAnimations && e.getAnimations().some(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)));
    if (!track && !marquee) continue;
    const i = out.length;
    host.setAttribute('data-qa-host', i); if (track) track.setAttribute('data-qa-track', i);
    let mask = track && track.parentElement; while (mask && mask !== host && !/(hidden|clip|auto|scroll)/.test(getComputedStyle(mask).overflowX)) mask = mask.parentElement;
    (mask || host).setAttribute('data-qa-mask', i);
    if (next) next.setAttribute('data-qa-next', i); if (prev) prev.setAttribute('data-qa-prev', i);
    const dots = [...scope.querySelectorAll(DOTS)].filter(vis).filter(okCtl); let dotList = dots;
    if (!dotList.length) { const gen = [...scope.querySelectorAll('[class*=bullet i],[class*=dot i],[role=tab]')].filter(d => vis(d) && okCtl(d) && d.getBoundingClientRect().width < 40 && !d.querySelector('img')); if (gen.length >= 2) dotList = gen; }
    dotList.slice(0, 12).forEach((d, k) => d.setAttribute('data-qa-dot', i + ':' + k));
    let decl = null;
    try {
      const w = host.closest('.w-slider') || host.querySelector('.w-slider'); const swEl = host.closest('.swiper, .swiper-container') || host.querySelector('.swiper, .swiper-container'); const sw = swEl && swEl.swiper;
      const skEl = host.closest('.slick-slider') || host.querySelector('.slick-slider'); const sk = skEl && skEl.slick; const sp = host.closest('[data-splide]') || host.querySelector('[data-splide]');
      if (w && w.dataset.autoplay != null) decl = { autoplay: w.dataset.autoplay === 'true', delay: +w.dataset.delay || 4000, loop: w.dataset.infinite === 'true' };
      else if (sw && sw.params) decl = { autoplay: !!(sw.params.autoplay && sw.params.autoplay.enabled), delay: (sw.params.autoplay && sw.params.autoplay.delay) || 3000, loop: !!sw.params.loop };
      else if (sk && sk.options) decl = { autoplay: !!sk.options.autoplay, delay: sk.options.autoplaySpeed || 3000, loop: !!sk.options.infinite };
      else if (sp) { const o = JSON.parse(sp.getAttribute('data-splide') || '{}'); if ('autoplay' in o || 'type' in o) decl = { autoplay: !!o.autoplay, delay: o.interval || 5000, loop: o.type === 'loop' }; }
    } catch (e) { }
    const pause = [...scope.querySelectorAll('[aria-label*=pause i],[aria-label*=stop i],[class*=pause i]')].find(vis);
    if (pause) pause.setAttribute('data-qa-pause', i);
    out.push({ i, label: ((host.getAttribute('aria-label') || '') + ' ' + host.tagName.toLowerCase() + '.' + (host.className.toString().trim().split(/\s+/)[0] || '')).trim().slice(0, 50), hasNext: !!next, hasPrev: !!prev, dots: Math.min(dotList.length, 12), decl, n: track ? track.children.length : 0, marquee: !!marquee, pause: !!pause, focusable: !!host.querySelector('a[href],button,[tabindex]:not([tabindex="-1"])') });
  }
  return out;
}
// Position of ONE slider: slides inside its window, the track offset, the active dot. Decorations elsewhere are ignored.
function SLIDER_SIG(i) {
  const h = document.querySelector(`[data-qa-host="${i}"]`); if (!h) return '';
  const t = h.querySelector(`[data-qa-track="${i}"]`); const m = h.matches(`[data-qa-mask="${i}"]`) ? h : (h.querySelector(`[data-qa-mask="${i}"]`) || h);
  const parts = [];
  if (t) {
    const mr = m.getBoundingClientRect();
    const id = (s, k) => s.getAttribute('data-swiper-slide-index') ?? s.getAttribute('data-slick-index') ?? s.getAttribute('aria-label') ?? String(k);
    parts.push('v=' + [...t.children].map((s, k) => { const r = s.getBoundingClientRect(), c = getComputedStyle(s); const ov = Math.min(r.right, mr.right) - Math.max(r.left, mr.left); return r.width > 0 && ov > r.width / 2 && c.visibility !== 'hidden' && +c.opacity > 0.5 ? id(s, k) : null; }).filter(x => x !== null).join(','));
    const tf = getComputedStyle(t).transform; let mx = null; try { mx = tf && tf !== 'none' ? new DOMMatrix(tf) : null; } catch (e) { }
    parts.push('x=' + (mx ? Math.round(mx.m41 / 4) : 0) + ',' + Math.round(t.scrollLeft / 4) + ',' + Math.round((m.scrollLeft || 0) / 4));
  } else {
    parts.push('a=' + [...h.querySelectorAll('*')].slice(0, 300).filter(e => e.getAnimations && e.getAnimations().length).map(e => { const tf = getComputedStyle(e).transform; return tf === 'none' ? 0 : Math.round(new DOMMatrix(tf).m41 / 4); }).join(','));
  }
  const dot = h.closest('section') ? h.closest('section').querySelector('.swiper-pagination-bullet-active, .w-slider-dot.w-active, .splide__pagination__page.is-active, .slick-dots .slick-active, .flickity-page-dot.is-selected, [data-qa-dot][aria-current=true], [data-qa-dot][aria-selected=true], [data-qa-dot].is-active, [data-qa-dot].active') : null;
  parts.push('d=' + (dot ? [...dot.parentElement.children].indexOf(dot) : -1));
  return parts.join('|');
}
// Index of the active pagination bullet of slider i (−1 when none is marked).
function SLIDER_ACTIVE_DOT(i) {
  const dots = [...document.querySelectorAll(`[data-qa-dot^="${i}:"]`)];
  const k = dots.findIndex(d => d.matches('.swiper-pagination-bullet-active,.w-active,.is-active,.active,.slick-active,.is-selected,[aria-current=true],[aria-selected=true],[aria-pressed=true]') || (d.parentElement && d.parentElement.matches('.slick-active,.is-active,.active')));
  return k;
}
// A point inside the slider window that is not a link or control (mobile tap test).
function SLIDER_TAP_POINT(i) {
  const m = document.querySelector(`[data-qa-mask="${i}"]`) || document.querySelector(`[data-qa-host="${i}"]`); if (!m) return null; const r = m.getBoundingClientRect();
  for (const fy of [0.5, 0.25, 0.75]) for (const fx of [0.5, 0.2, 0.8, 0.1, 0.9]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue; const e = document.elementFromPoint(x, y); if (e && m.contains(e) && !e.closest('a[href], button, [role=button], input, select, textarea, label, summary, video, iframe, [onclick]')) return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), top: Math.round(r.top), h: Math.round(r.height), left: Math.round(r.left) }; }
  return null;
}

// INT-08: elements below 0.99 effective opacity WITH animation evidence (marker, inline opacity, running opacity animation).
// Designed transparency (a muted class) has no evidence and is skipped; carousels, tab panels, hidden subtrees too.
function STUCK_CANDIDATES() {
  document.querySelectorAll('[data-qa-st]').forEach(e => e.removeAttribute('data-qa-st'));
  const SEL = 'h1,h2,h3,h4,p,li,a,img,figure,blockquote,[class*=card]';
  const SKIP = '.swiper,.slick-slider,.splide,.flickity-enabled,.owl-carousel,.glide,.keen-slider,.w-slider,[class*=carousel],[class*=slider],[class*=marquee],[class*=ticker],[aria-roledescription=carousel],[aria-roledescription=slide],[role=tabpanel],[aria-hidden=true],[inert],dialog,[aria-disabled=true],[data-qa-region=header],[data-qa-region=footer]';
  const MARK = '[data-reveal],[data-load],[data-aos],[data-sal],[data-scroll],[data-animate],[data-animation],[data-w-id],[data-gsap],.wow,.animate__animated,.elementor-invisible,[class*=reveal],[class*=fade],[class*=animate]';
  const opKeys = a => { try { return a.effect && a.effect.getKeyframes().some(k => 'opacity' in k); } catch (e) { return false; } };
  const root = document.querySelector('[data-qa-region=main]') || document.querySelector('main') || document.body;
  const out = []; let i = 0;
  for (const e of root.querySelectorAll(SEL)) {
    if (!e.getClientRects().length || e.closest(SKIP) || getComputedStyle(e).visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let op = 1, ev = '';
    for (let p = e; p && p !== document.body; p = p.parentElement) { const o = +getComputedStyle(p).opacity; if (o >= 0.99) continue; op *= o; if (!ev) ev = p.matches(MARK) ? 'marker' : /opacity/.test(p.getAttribute('style') || '') ? 'inline' : (p.getAnimations ? p.getAnimations() : []).some(opKeys) ? 'animation' : ''; }
    if (op < 0.99 && ev) { e.setAttribute('data-qa-st', i); out.push({ i: i++, y: Math.round(r.top + scrollY), ev }); }
    if (i >= 200) break;
  }
  return out;
}
function STUCK_SAMPLE() {
  const res = {}; const cls = e => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e.className || '')).toString().trim().split(/\s+/).slice(0, 3).join('.');
  for (const e of document.querySelectorAll('[data-qa-st]')) {
    const r = e.getBoundingClientRect(); const cy = r.top + r.height / 2;
    if (!r.width || cy < 0 || cy > innerHeight * 0.6) continue;
    let op = 1; for (let p = e; p && p !== document.body; p = p.parentElement) op *= +getComputedStyle(p).opacity;
    res[e.getAttribute('data-qa-st')] = { op: +op.toFixed(3), sel: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls(e) ? '.' + cls(e) : '') };
  }
  return res;
}

// VID-02/03: detached probe per <video> with no metadata yet (never touches the page's own player);
// autoplay videos: count timeupdate events while centred in view.
async function VIDEO_META(timeoutMs) {
  const vids = [...document.querySelectorAll('video')];
  await Promise.all(vids.filter(v => !v.videoWidth).map(v => new Promise(res => {
    const raw = v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.getAttribute('src') || v.dataset.src || v.querySelector('source[data-src]')?.getAttribute('data-src') || '';
    if (!raw) { v.dataset.qaVwWhy = 'no src yet (lazy-loaded video)'; return res(); }
    if (/^blob:|\.m3u8(\?|$)/i.test(raw)) { v.dataset.qaVwWhy = 'stream player (MSE/HLS)'; return res(); }
    const p = document.createElement('video'); p.muted = true; p.preload = 'metadata';
    const done = why => { clearTimeout(t); if (p.videoWidth) v.dataset.qaVw = p.videoWidth; else v.dataset.qaVwWhy = why; v.dataset.qaErr = p.error ? p.error.code : ''; v.dataset.qaCanPlay = p.canPlayType((v.querySelector('source[type]') || {}).type || 'video/mp4'); p.removeAttribute('src'); try { p.load(); } catch (e) { } res(); };
    const t = setTimeout(() => done(`metadata not loaded in ${timeoutMs}ms`), timeoutMs);
    p.onloadedmetadata = () => done(''); p.onerror = () => done(p.error && p.error.code === 4 ? 'this browser build cannot decode the video' : 'metadata request failed');
    try { p.src = new URL(raw, location.href).href; } catch (e) { done('bad src'); }
  })));
  for (const v of vids.filter(v => v.autoplay)) {
    v.scrollIntoView({ block: 'center', behavior: 'instant' }); let ticks = 0; const on = () => ticks++; v.addEventListener('timeupdate', on);
    await new Promise(r => setTimeout(r, 2500)); v.removeEventListener('timeupdate', on);
    v.dataset.qaTicks = ticks; v.dataset.qaPlay = v.paused ? 'paused' : 'playing'; if (v.error) v.dataset.qaErr = v.error.code;
  }
  scrollTo({ top: 0, behavior: 'instant' });
  return vids.length;
}

// Every stylesheet source of the page: linked (any origin) and inline. Text is read by the instrument.
function CSS_SOURCES() {
  return [...document.styleSheets].map(ss => { const n = ss.ownerNode || {}; const id = n.id || '';
    if (ss.href) return { href: ss.href, id, media: ss.media && ss.media.mediaText };
    const h = id.replace(/-inline-css$/, ''); const link = h && h !== id ? document.getElementById(h + '-css') : null;
    return { inline: (n.textContent || '').slice(0, 400000), id, handleHref: (link && link.href) || null }; });
}
// Parse one stylesheet text in a blank page and report hover guards, Safari hardening, motion/text hardening,
// descendant type selectors and @font-face rules. Runs in about:blank (no site CSP).
function CSS_SCAN(args) {
  const [text, src] = args;
  const GUARD = /\((any-)?hover(\s*:\s*hover)?\)|\((any-)?pointer\s*:\s*fine\)/;
  const out = { src, rules: 0, hover: 0, un: [], webkit: [], vh: [], animates: false, reducedMotion: false, textSizeAdjust: false, descType: [], faces: [], parseError: null };
  let s; try { s = new CSSStyleSheet(); s.replaceSync(text); } catch (e) { out.parseError = String(e).slice(0, 80); return out; }
  const vhOk = new Set();
  const walk = (rules, g, parent, media) => { for (const r of rules) { out.rules++;
    const cond = r.conditionText != null ? r.conditionText : (r.media && r.media.mediaText) || '';
    if (/prefers-reduced-motion/.test(cond)) out.reducedMotion = true;
    const g2 = g || (!!cond && GUARD.test(cond));
    if (r.constructor && r.constructor.name === 'CSSFontFaceRule' || (r.cssText || '').startsWith('@font-face')) { const st = r.style; out.faces.push({ family: (st.getPropertyValue('font-family') || '').replace(/["']/g, '').trim(), display: st.getPropertyValue('font-display') || '', src: (st.getPropertyValue('src') || '').slice(0, 200), weight: st.getPropertyValue('font-weight') || '', style: st.getPropertyValue('font-style') || '' }); continue; }
    if (r.selectorText != null) {
      const selT = (parent ? parent + ' ' : '') + r.selectorText; const st = r.style; const body = r.style ? r.style.cssText : '';
      if (/:hover/.test(r.selectorText)) { out.hover++; const props = st ? [...st] : []; const noop = props.length > 0 && props.every(p => /^(outline|cursor)/.test(p)); const runtime = r.selectorText.split(',').every(x => /\.w-[\w-]+[^\s>+~]*:hover/.test(x)); if (!g && !noop && !runtime && out.un.length < 200) out.un.push(selT.slice(0, 110)); }
      if (/(^|;)\s*(transition|animation)(-[a-z-]+)?\s*:/.test(body) && !/transition:\s*(none|0s)/.test(body)) out.animates = true;
      if (/text-size-adjust/.test(body)) out.textSizeAdjust = true;
      const has = p => st && st.getPropertyValue(p) && st.getPropertyValue(p) !== 'none';
      if (has('backdrop-filter') && !(st.getPropertyValue('-webkit-backdrop-filter'))) out.webkit.push(selT.slice(0, 80) + ' | backdrop-filter without -webkit-');
      if (/(^|[;\s])mask(-image)?\s*:/.test(body) && !/-webkit-mask/.test(body)) out.webkit.push(selT.slice(0, 80) + ' | mask without -webkit-mask');
      if (/background-clip:\s*text/.test(body) && !/-webkit-background-clip:\s*text/.test(body)) out.webkit.push(selT.slice(0, 80) + ' | background-clip:text without -webkit-');
      if (/(^|[;\s])(min-|max-)?height:\s*100vh/.test(body)) { if (/[sdl]vh|-webkit-fill-available|--vh/.test(body)) vhOk.add(r.selectorText); else out.vh.push({ sel: r.selectorText, full: selT.slice(0, 80) }); }
      if (/[sdl]vh/.test(body)) vhOk.add(r.selectorText);
      // descendant type selector: last compound is a bare element after a combinator (.x h2, .x > div)
      for (const part of r.selectorText.split(',')) { const p = part.trim(); if (/[.#\[][^\s>+~]*\s*[\s>+~]\s*[a-z][a-z0-9]*$/i.test(p) && /^[.#\[]/.test(p)) { if (out.descType.length < 60) out.descType.push(p.slice(0, 80)); } }
    }
    if (r.keyframes || /^@keyframes/.test(r.cssText || '')) out.animates = true;
    if (r.cssRules) walk(r.cssRules, g2, r.selectorText != null ? r.selectorText : parent, cond || media);
  } };
  walk(s.cssRules, false, '', '');
  out.vh = out.vh.filter(x => !vhOk.has(x.sel)).map(x => x.full + ' | 100vh without svh/dvh fallback');
  return out;
}

// NAV-10: header geometry at the current viewport.
function HEADER_PROBE(sel) {
  const h = document.querySelector('[data-qa-region=header]'); if (!h) return { none: true };
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.right > 0 && r.left < innerWidth; };
  const burger = sel && [...document.querySelectorAll(sel)].find(b => vis(b) && !b.closest('li'));
  const items = [...h.querySelectorAll('a[href], button')].filter(e => vis(e) && !e.closest('li li, [aria-hidden=true]') && !(burger && burger.contains(e)) && !e.closest('[class*=drop],[class*=mega],[class*=sub],.w-dropdown-list'));
  const navLinks = items.filter(e => e.closest('nav,[class*=nav]') && e.tagName === 'A');
  const rows = []; items.forEach(e => { const r = e.getBoundingClientRect(); const cy = r.top + r.height / 2; if (!rows.some(y => Math.abs(y - cy) <= 8)) rows.push(cy); });
  const wrapped = navLinks.filter(a => { const rg = document.createRange(); rg.selectNodeContents(a); const tops = new Set([...rg.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))); return tops.size > 1; }).map(a => (a.innerText || '').trim().slice(0, 25));
  const overlaps = []; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; if (a.contains(b) || b.contains(a)) continue; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); if (ox > 1 && oy > 1 && overlaps.length < 5) overlaps.push(`${(a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 15)} × ${(b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 15)}`); }
  const hr = h.getBoundingClientRect();
  const outside = items.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1 || r.bottom > hr.bottom + 2 || r.top < hr.top - 2; }).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20));
  return { height: Math.round(hr.height), burger: !!burger, navLinks: navLinks.length, items: items.length, rows: rows.length, wrapped, overlaps, outside: outside.slice(0, 5) };
}

// LAY-06: card widths per tab panel. `e` is the clicked tab-like control.
function TAB_PROBE(e) {
  const tok = s => /(^|[\s_-])(tabs?|filters?|pills?)([\s_-]|$)/i.test(String(s || ''));
  const p1 = e.parentElement, p2 = p1 && p1.parentElement;
  const isTab = e.getAttribute('role') === 'tab' || !!e.closest('[role=tablist]') || e.hasAttribute('data-filter') || e.hasAttribute('data-tab') || /^(tab|pill)$/i.test(e.getAttribute('data-bs-toggle') || e.getAttribute('data-toggle') || '') || tok(e.className) || tok(p1 && p1.className) || tok(p2 && p2.className);
  if (!isTab) return null;
  const bar = e.closest('[role=tablist]') || p1 || e;
  const vis = c => { const r = c.getBoundingClientRect(), s = getComputedStyle(c); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const outer = scope => [...scope.querySelectorAll('[class*=card i]')].filter(c => !bar.contains(c) && vis(c)).filter(c => { for (let q = c.parentElement; q && q !== scope; q = q.parentElement) if (q.matches('[class*=card i]')) return false; return true; });
  const stop = e.closest('section, main') || document.body;
  let root = bar; while (root !== stop && !outer(root).length && root.parentElement) root = root.parentElement;
  if (!outer(root).length) return { group: null, widths: [] };
  if (!root.hasAttribute('data-qa-tabgroup')) root.setAttribute('data-qa-tabgroup', String(document.querySelectorAll('[data-qa-tabgroup]').length));
  const ctl = document.getElementById(e.getAttribute('aria-controls') || '');
  const panel = (ctl && vis(ctl) && ctl) || [...root.querySelectorAll('[role=tabpanel]')].find(vis) || root;
  return { group: root.getAttribute('data-qa-tabgroup'), widths: outer(panel).map(c => Math.round(c.getBoundingClientRect().width)) };
}

// First VISIBLE burger (outermost match, not a submenu toggle inside a list); falls back to a visible header/nav button
// whose accessible name or class says menu / navigation. Tags it data-qa-burger.
function PICK_BURGER(sel) {
  document.querySelectorAll('[data-qa-burger]').forEach(e => e.removeAttribute('data-qa-burger'));
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.right > 0 && r.left < innerWidth && r.bottom > 0; };
  let list = []; try { list = [...document.querySelectorAll(sel)]; } catch (e) { return { found: false, error: 'invalid selectors.burger' }; }
  let b = list.filter(c => !c.parentElement || !c.parentElement.closest(sel)).filter(c => vis(c) && !c.closest('li'))[0];
  let via = 'selector';
  if (!b) { const name = e => ((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.className && e.className.toString()) + ' ' + (e.innerText || '') + ' ' + [...e.querySelectorAll('.sr-only,.screen-reader-text,.visually-hidden')].map(x => x.textContent).join(' ')); b = [...document.querySelectorAll('button,[role=button]')].find(e => vis(e) && (e.closest('[data-qa-region=header],header,[role=banner],nav') || e.getBoundingClientRect().top + scrollY < 200) && /\b(menu|navigation)\b|burger|hamburger|toggler|menu[-_]?toggle|mobile[-_]?menu/i.test(name(e))); via = 'fallback'; }
  if (!b) return { found: false };
  b.setAttribute('data-qa-burger', '1');
  const r = b.getBoundingClientRect();
  return { found: true, via, desc: b.tagName.toLowerCase() + '.' + ((b.className && b.className.toString()) || '').trim().split(/\s+/).slice(0, 2).join('.'), name: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 30), exp: b.getAttribute('aria-expanded'), controls: b.getAttribute('aria-controls'), box: [r.left, r.top, r.width, r.height].map(Math.round) };
}
// Line weight of the burger bars / a close control (svg stroke scaled to its render size, or a thin bar's height).
function LINE_WEIGHT(selector) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector; if (!el) return null;
  const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
  if (svg) { let shapes = [...svg.querySelectorAll('path,line,polyline,rect')]; let vb = svg.viewBox && svg.viewBox.baseVal; const use = svg.querySelector('use'); if (!shapes.length && use) { const id = ((use.href && use.href.baseVal) || '').replace(/^.*#/, ''); const sym = id && document.getElementById(id); if (sym) { shapes = [...sym.querySelectorAll('path,line,polyline,rect')]; if (sym.viewBox && sym.viewBox.baseVal && sym.viewBox.baseVal.width) vb = sym.viewBox.baseVal; } } const r = svg.getBoundingClientRect(); const scale = vb && vb.width ? Math.min(r.width / vb.width, r.height / vb.height) : 1; const ws = shapes.map(s => { const c = getComputedStyle(s); if (!c.stroke || c.stroke === 'none') return null; const sw = parseFloat(c.strokeWidth); return sw ? +(sw * scale).toFixed(2) : null; }).filter(x => x !== null); return ws.length ? Math.max(...ws) : null; }
  const bars = [el, ...el.querySelectorAll('span,i,div')].filter(x => { const r = x.getBoundingClientRect(); return r.width >= 8 && r.height > 0 && parseFloat(getComputedStyle(x).height) < 6; });
  if (bars.length) return +parseFloat(getComputedStyle(bars[0]).height).toFixed(2);
  for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); if (!/^(none|normal)$/.test(c.content) && parseFloat(c.height) > 0 && parseFloat(c.height) < 6) return +parseFloat(c.height).toFixed(2); }
  return null;
}

// LINK-10: same-document anchor links whose target exists (toggles excluded).
function ANCHORS() {
  document.querySelectorAll('[data-qa-anc]').forEach(e => e.removeAttribute('data-qa-anc'));
  const sameDoc = a => a.hash.length > 1 && a.origin === location.origin && a.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '') && !/^#(top|!|\/)/i.test(a.hash);
  const tgt = h => { let id = h.slice(1); try { id = decodeURIComponent(id); } catch (e) { } return document.getElementById(id) || document.getElementsByName(id)[0] || null; };
  const seen = new Set(); const out = [];
  const list = [...document.querySelectorAll('a[href*="#"]')].filter(a => sameDoc(a) && !a.matches('[role=tab],[aria-controls],[data-toggle],[data-bs-toggle]') && !a.closest('[role=tablist]'));
  const order = a => a.closest('[data-qa-region=header],header,nav') ? 0 : a.closest('[data-qa-region=footer],footer') ? 2 : 1;
  list.sort((x, y) => order(x) - order(y));
  for (const a of list) { if (seen.has(a.hash) || out.length >= 12) continue; const t = tgt(a.hash); if (!t || !t.getClientRects().length) continue; seen.add(a.hash); const i = out.length; a.setAttribute('data-qa-anc', i); const r = a.getBoundingClientRect(); out.push({ i, hash: a.hash, text: (a.innerText || '').trim().slice(0, 30), visible: r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden' }); }
  return out;
}
// Measures where an anchor target landed relative to fixed/sticky headers.
function ANCHOR_LANDING(hash) {
  let id = hash.slice(1); try { id = decodeURIComponent(id); } catch (e) { } const t = document.getElementById(id) || document.getElementsByName(id)[0]; if (!t) return null;
  let hb = 0; for (const x of [8, innerWidth / 2, innerWidth - 8]) for (let e = document.elementFromPoint(x, 1); e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); if (/fixed|sticky/.test(c.position) && c.visibility !== 'hidden' && +c.opacity > 0.05) { const r = e.getBoundingClientRect(); if (r.height < innerHeight * 0.5) hb = Math.max(hb, r.bottom); break; } }
  return { top: Math.round(t.getBoundingClientRect().top), headerBottom: Math.round(hb), y: Math.round(scrollY), atEnd: scrollY + innerHeight >= document.documentElement.scrollHeight - 2 };
}

// MODAL-01: pop-up / lightbox triggers (never inside forms, never submit).
function DIALOG_TRIGGERS() {
  document.querySelectorAll('[data-qa-dlg]').forEach(e => e.removeAttribute('data-qa-dlg'));
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden'; };
  const S = '[aria-haspopup=dialog],[data-bs-toggle=modal],[data-toggle=modal],a.w-lightbox,.wp-lightbox-container button,[data-fancybox],[data-lightbox],[data-glightbox],.glightbox,[data-lity],[data-modal-open],[data-popup-open],a[href^="#"][class*=popup i],a[href^="#"][class*=modal i]';
  const seen = new Set(); const out = [];
  for (const e of document.querySelectorAll(S)) { if (out.length >= 6 || e.closest('form') || e.closest('[data-qa-region=header]') || !vis(e) || e.matches('[type=submit]')) continue; const k = e.tagName + '.' + e.className.toString().split(' ')[0] + [...e.attributes].map(a => a.name).filter(n => /^data-/.test(n)).sort().join(','); if (seen.has(k)) continue; seen.add(k); const i = out.length; e.setAttribute('data-qa-dlg', i); out.push({ i, text: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30) }); }
  return out;
}
// Visible dialogs / overlays now (fixed or modal, ≥30% of the viewport), excluding the burger panel and consent banners.
function OPEN_OVERLAYS() {
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  return [...document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true],body *')].filter((e, i, a) => a.indexOf(e) === i).filter(e => { if (!vis(e) || e.closest('[data-qa-panel]') || /cookie|consent|gdpr|cky|cmplz|onetrust|cookiebot/i.test(e.id + ' ' + e.className)) return false; if (e.matches('dialog[open],[role=dialog],[aria-modal=true]')) return true; const c = getComputedStyle(e); if (c.position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.width * r.height >= innerWidth * innerHeight * 0.3; }).filter((e, i, a) => !a.some(o => o !== e && o.contains(e))).slice(0, 3).map((e, i) => { e.setAttribute('data-qa-ov', i); return { i, sel: e.tagName.toLowerCase() + '.' + e.className.toString().split(' ')[0] }; });
}

// I18N-03: the language switcher target for locale `hl` (link with hreflang/lang, or text = locale code / language name).
function LANG_TARGETS() {
  document.querySelectorAll('[data-qa-lang]').forEach(e => e.removeAttribute('data-qa-lang'));
  const here = (document.documentElement.getAttribute('lang') || '').toLowerCase().split('-')[0];
  const out = []; const seen = new Set();
  for (const a of document.querySelectorAll('a[hreflang], a[lang], .w-locales-list a, .wpml-ls a, .pll-switcher a, .lang-item a, .trp-language-switcher a, .weglot-container a, [class*=lang-switch i] a, [class*=language-switch i] a')) {
    const hl = ((a.getAttribute('hreflang') || a.getAttribute('lang') || (a.innerText || '').trim()).toLowerCase().split(/[-_\s]/)[0]).slice(0, 8);
    if (!hl || hl === here || seen.has(hl) || !a.getAttribute('href')) continue; seen.add(hl); const i = out.length; a.setAttribute('data-qa-lang', i); const r = a.getBoundingClientRect(); out.push({ i, hl, href: a.href, visible: r.width > 0 && r.height > 0 });
    if (out.length >= 3) break;
  }
  return { here, targets: out };
}
// First visible lines of main text (≥12 chars), in DOM order — the comparable sample of a page.
function TEXT_SAMPLE(n) {
  const root = document.querySelector('[data-qa-region=main]') || document.querySelector('main') || document.body; const out = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let x; (x = tw.nextNode()) && out.length < (n || 20);) { const p = x.parentElement; const t = x.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 12 || !p || !p.getClientRects().length || p.closest('script,style,noscript,[aria-hidden=true],[data-qa-region=header],[data-qa-region=footer]') || /^[\d\s.,:+()%€$£-]+$/.test(t) || /@/.test(t)) continue; out.push(t.slice(0, 120)); }
  return { lang: (document.documentElement.getAttribute('lang') || '').toLowerCase(), lines: out, url: location.href, title: document.title };
}

// STRUCT-01..03 on the SOURCE markup (run in a JavaScript-disabled context: runtime styles and classes do not count).
function STRUCT_SCAN(dec) {
  dec = dec || {};
  const main = document.querySelector('main') || document.querySelector('[role=main]'); if (!main) return { noMain: true };
  const cls = e => [...e.classList];
  const decor = (dec.decorClasses || []);
  const kids = [...main.children].filter(k => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK)$/.test(k.tagName));
  const notSection = kids.filter(k => k.tagName !== 'SECTION' && !decor.some(d => k.classList.contains(d))).map(k => k.tagName.toLowerCase() + (k.className ? '.' + cls(k).slice(0, 2).join('.') : ''));
  const secs = kids.filter(k => k.tagName === 'SECTION');
  let container = dec.containerClass || null; let auto = false;
  if (!container && secs.length) { const c = {}; secs.forEach(s => { const f = s.firstElementChild; if (f) cls(f).forEach(x => c[x] = (c[x] || 0) + 1); }); const best = Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]; if (best && best[1] >= secs.length * 0.6) { container = best[0]; auto = true; } }
  const badFirst = container ? secs.filter(s => !s.firstElementChild || !s.firstElementChild.classList.contains(container)).map(s => 'section.' + cls(s).slice(0, 2).join('.')) : [];
  const extra = container ? secs.filter(s => [...s.children].some((k, i) => i > 0 && !decor.some(d => k.classList.contains(d)) && !/^(SCRIPT|STYLE)$/.test(k.tagName))).map(s => 'section.' + cls(s).slice(0, 2).join('.')) : [];
  const pads = container ? secs.map(s => s.firstElementChild).filter(f => f && f.classList.contains(container)).map(f => { const c = getComputedStyle(f); return c.paddingLeft + '/' + c.paddingRight; }) : [];
  const pat = dec.classNamePattern ? new RegExp(dec.classNamePattern) : null;
  const many = [], badName = [], leftovers = [];
  for (const e of main.querySelectorAll('*')) {
    const cs = cls(e).filter(c => !/^is-/.test(c));
    if (cs.length > 2 && many.length < 30) many.push(e.tagName.toLowerCase() + '.' + cs.join('.'));
    if (pat) cs.forEach(c => { if (!pat.test(c) && badName.length < 30) badName.push(c); });
    if (cs.some(c => /^field-/.test(c)) && leftovers.length < 20) leftovers.push(e.tagName.toLowerCase() + '.' + cs.join('.'));
    if (e.tagName === 'DIV' && !e.children.length && !e.textContent.trim() && !e.attributes.length && leftovers.length < 20) leftovers.push('empty div in ' + (e.parentElement ? e.parentElement.tagName.toLowerCase() + '.' + cls(e.parentElement).slice(0, 2).join('.') : ''));
  }
  const inline = [...main.querySelectorAll('[style]')].filter(e => (e.getAttribute('style') || '').trim()).map(e => e.tagName.toLowerCase() + (e.className ? '.' + cls(e).slice(0, 2).join('.') : '') + ' style="' + e.getAttribute('style').slice(0, 50) + '"').slice(0, 30);
  return { sections: secs.length, notSection, container, auto, badFirst, extra, pads: [...new Set(pads)], many, badName, leftovers, inline, patternSet: !!pat };
}

// Rendered style snapshot of a focused control (A11Y-07): own + ring properties.
function FOCUS_INFO() {
  const el = document.activeElement; if (!el || el === document.body || el === document.documentElement) return { none: true };
  if (el.tagName === 'IFRAME') return { iframe: true };
  const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
  const visible = r.width >= 1 && r.height >= 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : c.visibility !== 'hidden') && !el.closest('[aria-hidden="true"],[inert]');
  let clipped = false; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const pc = getComputedStyle(p); if (/hidden|clip/.test(pc.overflowX + pc.overflowY)) { const pr = p.getBoundingClientRect(); if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) { clipped = true; break; } } }
  const sig = [c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset, c.boxShadow, c.backgroundColor, c.color, c.borderTopColor, c.borderBottomColor, c.textDecorationLine].join('|');
  return { tag: el.tagName.toLowerCase(), sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && el.className.toString().trim() ? '.' + el.className.toString().trim().split(/\s+/).slice(0, 2).join('.') : ''), text: (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 30), fv: el.matches(':focus-visible'), visible: visible && !clipped, sig, outline: { style: c.outlineStyle, width: parseFloat(c.outlineWidth) || 0, color: c.outlineColor, offset: parseFloat(c.outlineOffset) || 0 }, shadow: c.boxShadow, bg: c.backgroundColor, color: c.color, box: [r.left, r.top, r.width, r.height].map(Math.round) };
}

module.exports = { PRELOAD, STATIC, COLOR_KIT, CONTRAST, STATE_OF, SLIDERS, SLIDER_SIG, SLIDER_ACTIVE_DOT, SLIDER_TAP_POINT, STUCK_CANDIDATES, STUCK_SAMPLE, VIDEO_META, CSS_SOURCES, CSS_SCAN, HEADER_PROBE, TAB_PROBE, PICK_BURGER, LINE_WEIGHT, ANCHORS, ANCHOR_LANDING, DIALOG_TRIGGERS, OPEN_OVERLAYS, LANG_TARGETS, TEXT_SAMPLE, STRUCT_SCAN, FOCUS_INFO };
