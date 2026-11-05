#!/usr/bin/env node
'use strict';
// XB-02 · Real Safari (macOS) through safaridriver: the same STATIC measure as the other engines, page by page.
//   node safari-real.cjs --out qa-out [--base URL | --local ./build] [--max N]
// Windows: the largest desktop width from cfg.widths that fits the screen (1440 when it fits) + 768 (or the largest cfg
// width from 568 to 991). The real innerWidth is read back and recorded, and every comparison uses it.
// FORM-07 (extra evidence; qa-run closes it): field height, padding, line-height and type vs Chromium at the SAME innerWidth.
// FORM-10 (extra evidence; qa-run closes it): where the typed text sits inside single-line fields — pixel ink box,
//          real Safari vs Chromium at the same innerWidth. Typing never submits: no Enter key, no click on submit.
// The Chromium reference is measured here (Playwright, launched through lib.launchChromium: the same Chromium choice as
// qa-run, pinned context, consent hidden). Without it FORM-07 falls back to static-chromium.json at the same width and
// the Safari part of FORM-10 is NOT RUN with the reason. Evidence: fields-safari.json, shots/safari/ (forms, fields).
// Password / sign-in gates and cookie banners: a gated page is NOT RUN (an automation session has no cookies); consent
// banners are hidden with the lib's consent hider (never clicks Accept), the same way the Playwright engines hide them.
// Needs Safari → Develop → "Allow Remote Automation": the person enables it once; never change it yourself.
// Never a silent pass: XB-02 counts as tested only when ≥1 page was measured; every page not measured (tool problem,
// redirect, host challenge, password gate) is a NOT RUN reason with its route, so a partial run is never ✅. The session
// is always deleted, the driver always stopped and the results always written (crash, Ctrl-C and kill included).
// Exit 0 when something was measured, 3 when nothing was.

const fs = require('fs');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const { spawn, execFileSync } = require('child_process');
const L = require('./lib.cjs');
const M = require('./measure-page.cjs');

const a = L.args(process.argv.slice(2));
const cfg = L.loadConfig(a, { allowLocal: true }); // --local <build folder>: stage 1, served on 127.0.0.1 by the lib
const OUT = L.outDirFrom(a);
let R; try { R = L.makeResults('safari-real', cfg, a); } catch (e) { R = L.makeResults('safari-real'); }
R._base = cfg.base;
const SAF = cfg.safari && typeof cfg.safari === 'object' ? cfg.safari : {};
const MAX = Math.max(1, Math.floor(+(a.max || SAF.max || 999)) || 999);
const FIELD_CAP = 12; // single-line fields per page×window compared for FORM-10
const CHALLENGE = L.CHALLENGE || /One moment, please|Just a moment|Checking your browser|Attention Required/i;
const ELEM = 'element-6066-11e4-a52e-4f735466cecf'; // W3C web element key
const EXIT_NOT_RUN = L.EXIT_NOT_RUN || 3;
const ROUTE = 'route: a Mac with Safari (team or rented Mac)';
const PERSON_SETUP = 'person enables Safari → Settings → Advanced → "Show features for web developers", then Develop → Allow Remote Automation (never change it yourself), then reruns';
const GATE_ROUTE = 'a Safari automation session starts without cookies, so a saved session cannot be reused: the gate is lifted for the QA window or a person checks these pages in Safari (the agent never types a password)';
// Same private-flag-free call as the other engines: only explicitly configured region selectors are passed on.
const SEL = cfg.selectors || {};
const RSEL = {}; for (const k of ['header', 'main', 'footer']) if (cfg._explicitSelectors && cfg._explicitSelectors.has && cfg._explicitSelectors.has(k) && SEL[k]) RSEL[k] = SEL[k];
const dec = Object.assign({}, cfg.decisions, { _burgerSel: SEL.burger, _logoSel: SEL.logo || undefined, _sectionSel: SEL.section || '', _sel: RSEL });

const wait = ms => new Promise(r => setTimeout(r, ms));
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // locale-independent
const msg = e => String((e && e.message) || e).replace(/\s+/g, ' ').trim();
const one = s => String(s).replace(/;\s*/g, ', '); // a single NOT RUN reason never contains "; " (the manifest splits on it)
const slug = s => String(s).replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
const num = v => { const f = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(f) ? f : null; };
const uniq = l => [...new Set(l)];
function norm(u) { try { const x = new URL(u); return x.host.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search; } catch (e) { return String(u || ''); } }
const sameUrl = (x, y) => norm(x) === norm(y);
// Path of a URL on the audited site (scheme and www ignored), or null for another host.
function sitePath(u) { try { const x = new URL(u), b = new URL(cfg.base + '/'); if (x.host.toLowerCase().replace(/^www\./, '') !== b.host.toLowerCase().replace(/^www\./, '')) return null; const bp = b.pathname.replace(/\/$/, ''); const p = x.pathname.startsWith(bp) ? x.pathname.slice(bp.length) || '/' : x.pathname; return p + x.search; } catch (e) { return null; } }
let PAGESET = new Set(); // normalised URLs of every planned page (opened or cut), for redirect de-duplication
const tryRun = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch (e) { return null; } };

// ---------------------------------------------------------------- state → results (rebuilt before every save)
const S = {
  inProgress: true, stopped: null, fatal: null,
  version: null, screen: null, windows: [], winGaps: [],
  plan: null, pages: [], cut: [],
  planned: 0, measured: 0, missed: [], redirects: [], pageNotes: [], xb02: [], notes: [],
  f07: [], f07Fields: 0, f07Pages: 0, f07Gaps: [],
  f10: [], f10Ask: [], f10Fields: 0, f10Gaps: [],
  refEngine: null, refOff: null, fieldsOut: {}, shotFails: 0, stray: 0,
};
const KIND = { tool: 'NOT MEASURED (tool problem, not a site finding)', gate: 'NOT OPENED (password / sign-in gate)', offsite: 'NOT MEASURED (redirects to another host)', challenge: 'NOT MEASURED (host challenge)' };
function setTested(id, n) { const c = R.checks[id] || (R.checks[id] = { items: [], notes: [] }); c.ran = true; c.tested = n; }
function materialize() {
  for (const id of ['XB-02', 'FORM-07', 'FORM-10']) delete R.checks[id];
  const wins = S.windows.map(w => (w.iw === w.req || w.iw == null ? `${w.iw == null ? w.req + '?' : w.iw}` : `${w.req}→${w.iw}`)).join(' + ') || '—';
  const pagesTxt = S.plan ? `${S.pages.length} of ${S.plan.sampled} sampled page(s), ${S.plan.all} found` : `${S.pages.length} page(s)`;
  const cov = `Safari ${S.version || '(no session)'} · ${S.windows.length ? `window innerWidth ${wins}px` : 'no window opened'} · ${S.measured}/${S.planned} page×window measured · ${pagesTxt}`;
  R._timing = { why: `${S.measured}/${S.planned} page × window loads in real Safari (${pagesTxt}), one at a time` };
  const unfinished = S.stopped || (S.inProgress ? 'safari-real.cjs did not finish (crashed or was killed) — rerun it in the background or with a long timeout' : null);
  // one NOT RUN reason per window and cause, with the route that closes it
  const by = new Map();
  for (const m of S.missed) {
    const kind = m.kind || 'tool', route = kind === 'tool' ? 'rerun safari-real.cjs' : m.route || '';
    const k = [m.win, kind, route].join('\u0000');
    if (!by.has(k)) by.set(k, { win: m.win, kind, route, l: [] });
    by.get(k).l.push(kind === 'gate' ? m.p : `${m.p} (${m.why})`);
  }
  const partial = [unfinished, ...S.winGaps,
    ...[...by.values()].map(g => `${KIND[g.kind] || g.kind} in real Safari @${g.win}, ${g.l.length} page(s): ${g.l.join(' · ').slice(0, 500)}${g.route ? ' — ' + g.route : ''}`),
    S.cut.length ? `--max ${MAX} left ${S.cut.length} sampled page(s) unopened (${S.cut.slice(0, 10).join(' ')}${S.cut.length > 10 ? ' …' : ''}) — rerun with --max ${S.pages.length + S.cut.length}` : null,
  ].filter(Boolean).map(one);

  // XB-02 — the coverage line is notes[0]: the manifest shows the notes as the evidence
  R.note('XB-02', cov);
  S.notes.forEach(n => R.note('XB-02', n));
  if (S.shotFails) R.note('XB-02', `${S.shotFails} form screenshot(s) failed`);
  if (S.redirects.length) R.note('XB-02', 'redirects (the target is measured as its own page): ' + uniq(S.redirects).join(' · '));
  uniq(S.pageNotes).forEach(n => R.note('XB-02', n));
  if (!S.measured) {
    const why = [S.fatal ? (/route:|person /.test(S.fatal) ? S.fatal : `${S.fatal} — ${ROUTE}`) : null, ...partial].filter(Boolean).map(one);
    (why.length ? why : ['nothing was measured']).forEach(w => R.notRun('XB-02', w));
  } else {
    S.xb02.forEach(i => R.add('XB-02', i));
    partial.forEach(w => R.notRun('XB-02', w));
    setTested('XB-02', S.measured);
  }
  // FORM-07 / FORM-10: qa-run closes them; this instrument adds the real-Safari part and never marks them as run on
  // its own (a fail or ask item is real evidence; a comparison that could not be made is a NOT RUN reason).
  if (S.f07Fields) R.note('FORM-07', `real Safari vs ${S.refEngine || 'Chromium'} at the same innerWidth: ${S.f07Fields} field(s) on ${S.f07Pages} page×window`);
  S.f07.forEach(i => R.add('FORM-07', i));
  uniq(S.f07Gaps).slice(0, 4).forEach(g => R.notRun('FORM-07', one('real Safari part not compared: ' + g)));
  if (S.f10Fields) R.note('FORM-10', `real Safari vs ${S.refEngine || 'Chromium'}, ink box of the typed text at the same innerWidth: ${S.f10Fields} field(s)`);
  S.f10.forEach(i => R.add('FORM-10', i));
  S.f10Ask.forEach(i => R.ask('FORM-10', i));
  uniq(S.f10Gaps).slice(0, 4).forEach(g => R.notRun('FORM-10', one('real Safari part not compared: ' + g)));
}
function save() {
  try { materialize(); L.saveResults(R, OUT); } catch (e) { console.error('safari-real: could not save results: ' + msg(e)); }
  if (Object.keys(S.fieldsOut).length) { try { fs.writeFileSync(path.join(OUT, 'fields-safari.json'), JSON.stringify(S.fieldsOut, null, 1)); } catch (e) { /* evidence only */ } }
}

// ---------------------------------------------------------------- lifecycle: session deleted, driver stopped, results written
let sd = null, sdLog = '', sid = null, U = null, ending = false, refBrowser = null;
const killDriver = () => { if (sd && sd.exitCode === null && sd.signalCode === null) { try { sd.kill(); } catch (e) { /* gone */ } } };
process.on('exit', killDriver);
async function finish(code) {
  if (ending) return; ending = true;
  S.inProgress = false; save();
  if (sid && U) { try { await fetch(`${U}/session/${sid}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) }); } catch (e) { /* driver gone */ } sid = null; }
  if (refBrowser) await refBrowser.close().catch(() => { });
  killDriver();
  process.exit(code);
}
function fail(why) { S.fatal = one(why); console.log('safari-real: NOT RUN — ' + why); return finish(EXIT_NOT_RUN); }
process.on('uncaughtException', e => { S.stopped = 'safari-real stopped: ' + msg(e).slice(0, 200); console.error(S.stopped); finish(EXIT_NOT_RUN); });
process.on('unhandledRejection', e => { S.stray++; if (S.stray <= 3) console.error('safari-real: ignored stray rejection: ' + msg(e).slice(0, 160)); });
process.on('SIGINT', () => { S.stopped = 'interrupted (SIGINT)'; finish(130); });
process.on('SIGTERM', () => { S.stopped = 'killed (SIGTERM)'; finish(143); });

function setEnv(extra) { R._env = Object.assign({}, R._env || {}); R._env.safari = Object.assign({}, R._env.safari || {}, extra); }
function tryPlaywright() {
  if (typeof L.tryPlaywright === 'function') { try { return L.tryPlaywright(); } catch (e) { return null; } }
  if (typeof L.nodeProblem === 'function' && L.nodeProblem('playwright')) return null;
  for (const t of [process.env.PW_PATH, path.join(__dirname, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { if (!t) continue; try { return require(t); } catch (e) { /* next */ } }
  return null;
}

// ---------------------------------------------------------------- page plan (same rule in ios.cjs and safari-real.cjs)
async function planPages(max) {
  const clean = l => [...new Set((Array.isArray(l) ? l : []).filter(p => typeof p === 'string' && p && !/(^|\/)qa-404-/.test(p)))];
  let all = null, sampled = null, src = 'sitemap';
  try {
    const p = typeof L.readPlan === 'function' ? await L.readPlan(OUT, cfg) : null;
    if (p && Array.isArray(p.sampled)) { sampled = p.sampled; all = Array.isArray(p.all) ? p.all : p.sampled; src = 'pages.json'; }
  } catch (e) { S.notes.push('page plan unreadable (' + msg(e).slice(0, 80) + ')'); }
  if (!sampled) {
    const f = path.join(OUT, 'pages.json');
    if (fs.existsSync(f)) {
      try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (Array.isArray(j)) { all = sampled = j; src = 'pages.json'; }
        else if (j && Array.isArray(j.sampled)) { sampled = j.sampled; all = Array.isArray(j.all) ? j.all : j.sampled; src = 'pages.json'; }
      } catch (e) { S.notes.push('pages.json unreadable — the page list was discovered again'); }
    }
  }
  if (!sampled && typeof L.discoverPagesInfo === 'function' && typeof L.planPages === 'function') {
    const info = await L.discoverPagesInfo(cfg);
    const p = await L.planPages(cfg, info);
    all = p.all; sampled = p.sampled; src = info.source === 'none' ? 'only / found (no sitemap)' : info.source;
  }
  if (!sampled) all = sampled = await L.discoverPages(cfg);
  all = clean(all); sampled = clean(sampled);
  const withForms = new Set();
  for (const [k, v] of Object.entries(staticChrome())) if (v && !v.fail && Array.isArray(v.forms) && v.forms.length) withForms.add(k.slice(0, k.lastIndexOf('@')));
  const sorted = sampled.slice().sort(cmp), ordered = [], has = new Set(), seg = new Set();
  const push = p => { if (!has.has(p)) { has.add(p); ordered.push(p); } };
  sorted.filter(p => p === '/').forEach(push);
  sorted.filter(p => withForms.has(p)).forEach(push);
  sorted.forEach(p => { const k = p.split(/[/?#]/).filter(Boolean)[0] || '/'; if (!seg.has(k)) { seg.add(k); push(p); } });
  sorted.forEach(push);
  return { pages: ordered.slice(0, max), cut: ordered.slice(max), sampled: sampled.length, all: all.length, src };
}
let _static = null;
function staticChrome() {
  if (_static) return _static;
  try { _static = JSON.parse(fs.readFileSync(path.join(OUT, 'static-chromium.json'), 'utf8')) || {}; } catch (e) { _static = {}; }
  return _static;
}

// ---------------------------------------------------------------- WebDriver plumbing
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function req(method, p, body, ms = 90000) {
  const label = `${method} ${p.replace(/\/session\/[^/]+/, '/session')}`;
  let r;
  try { r = await fetch(U + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new Error(/abort|timeout/i.test(String(e && e.name) + msg(e)) ? `${label} timed out after ${Math.round(ms / 1000)} s` : `${label}: ${msg(e).slice(0, 120)}`); }
  let j = null;
  try { j = await r.json(); } catch (e) { throw new Error(`${label}: HTTP ${r.status} without JSON`); }
  const v = j ? j.value : null;
  if (v && typeof v === 'object' && !Array.isArray(v) && v.error) throw Object.assign(new Error(`${v.error}: ${String(v.message || '').replace(/\s+/g, ' ').slice(0, 160)}`), { wd: v.error });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  return v;
}
const ex = (script, args = []) => req('POST', `/session/${sid}/execute/sync`, { script, args });
async function el(css) { const v = await req('POST', `/session/${sid}/element`, { using: 'css selector', value: css }); const id = v && (v[ELEM] || v.ELEMENT); if (!id) throw new Error('element not found: ' + css); return id; }
async function waitReady(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(U + '/status', { signal: AbortSignal.timeout(1000) }); if (r.ok) { const j = await r.json().catch(() => null); if (!j || !j.value || j.value.ready !== false) return true; } } catch (e) { /* not listening yet */ }
    await wait(200);
  }
  return null;
}
function sessionRoute(e) {
  const m = msg(e);
  if (/already paired|another (webdriver )?session|session (is )?already/i.test(m)) return `Safari is held by an earlier automation session (${m.slice(0, 100)}) — quit Safari and any stray safaridriver (pkill -x safaridriver), then rerun`;
  if (/remote automation|allow remote/i.test(m)) return `${m.slice(0, 120)} — ${PERSON_SETUP}`;
  if (/timed out/i.test(m)) return `POST /session hung for 90 s — usually Allow Remote Automation is off or Safari shows a dialog; ${PERSON_SETUP}`;
  return `no Safari session: ${m.slice(0, 160)} — ${PERSON_SETUP}`;
}

// ---------------------------------------------------------------- page-side helpers (self-contained; run in Safari and Chromium)
const SCROLL_JS = 'return (async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=450){scrollTo(0,y);await new Promise(r=>setTimeout(r,70))}scrollTo(0,0);return 1})()';
// Tags visible forms and their visible fields in the same order as STATIC (same visible / srOnly rules).
function FIELDS_TAG() {
  const visible = e => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const srOnly = e => { let p = e; while (p && p !== document.body) { const c = getComputedStyle(p); if ((c.position === 'absolute' && (parseFloat(c.width) <= 1 || parseFloat(c.height) <= 1)) || (c.clip && c.clip !== 'auto') || /inset\(50%\)/.test(c.clipPath) || p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('inert')) return true; p = p.parentElement; } return false; };
  const out = [];
  [...document.forms].filter(f => visible(f)).forEach((f, fi) => {
    f.setAttribute('data-qa-form', String(fi));
    [...f.elements].filter(e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(e.type)).filter(e => visible(e) && !srOnly(e)).forEach((e, i) => {
      const k = fi + '.' + i; e.setAttribute('data-qa-f', k);
      const cs = getComputedStyle(e); const type = e.tagName === 'SELECT' ? 'select' : (e.type || 'text');
      const single = e.tagName === 'INPUT' ? /^(text|email|tel|url|search|number)$/.test(type) : e.tagName === 'SELECT' ? (!e.multiple && (+e.size || 1) <= 1 && /none/.test(cs.appearance || cs.webkitAppearance || '')) : false;
      const lab = e.id ? document.querySelector('label[for="' + CSS.escape(e.id) + '"]') : null;
      const label = ((lab && lab.innerText) || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.name || type || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      out.push({ k, fi, tag: e.tagName, type, single, readOnly: !!(e.readOnly || e.disabled), label });
    });
  });
  return out;
}
// Border-box geometry of one tagged field and the columns where its text is drawn (CSS px, relative to the box).
function FIELD_GEOM(arg) {
  const k = arg[0], text = arg[1];
  const e = document.querySelector('[data-qa-f="' + k + '"]'); if (!e) return null;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect(), n = v => parseFloat(v) || 0;
  const shown = e.tagName === 'SELECT' ? ((e.options[e.selectedIndex] || {}).text || '') : String(e.value || text || '');
  const c = document.createElement('canvas').getContext('2d'); c.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ');
  const tw = shown ? c.measureText(shown).width : 0;
  const bl = n(cs.borderLeftWidth), br = n(cs.borderRightWidth), bt = n(cs.borderTopWidth), bb = n(cs.borderBottomWidth);
  const cl = bl + n(cs.paddingLeft), cr = r.width - br - n(cs.paddingRight), ta = cs.textAlign;
  let x0 = /center/.test(ta) ? cl + Math.max(0, (cr - cl - tw) / 2) : /right|end/.test(ta) ? Math.max(cl, cr - tw) : cl;
  const x1 = Math.min(r.width - br, x0 + tw + 2); x0 = Math.max(bl, x0 - 1);
  return { W: r.width, H: r.height, bl, br, bt, bb, pt: n(cs.paddingTop), pb: n(cs.paddingBottom), x0, x1, shown: shown.slice(0, 30) };
}
function BLUR(k) { const e = document.querySelector('[data-qa-f="' + k + '"]'); if (e) e.blur(); return 1; }
function SELECT_SHOW(k) { const e = document.querySelector('[data-qa-f="' + k + '"]'); if (!e || e.tagName !== 'SELECT') return false; const cur = e.options[e.selectedIndex]; if (cur && cur.text.trim()) return false; const i = [...e.options].findIndex(o => o.text.trim()); if (i < 0) return false; e.setAttribute('data-qa-old', String(e.selectedIndex)); e.selectedIndex = i; return true; }
function SELECT_RESTORE(k) { const e = document.querySelector('[data-qa-f="' + k + '"]'); if (e && e.hasAttribute('data-qa-old')) { e.selectedIndex = +e.getAttribute('data-qa-old'); e.removeAttribute('data-qa-old'); } return 1; }
const typeText = t => (/^(number|tel)$/.test(t.type) ? '18' : 'Hg');
const call = (fn, arg) => ex(`return (${fn.toString()})(arguments[0])`, [arg]);
// A password / sign-in gate in front of the page (platform markers only). Returns a short reason or null.
function GATE() {
  const q = s => { try { return !!document.querySelector(s); } catch (e) { return false; } };
  if (q('form[action*="/.wf_auth"], .w-password-page')) return 'platform password page';
  if (q('#password-protected-form, form[action*="password-protected"]')) return 'site password form';
  if (q('form[action$="/password"] input[type=password]')) return 'storefront password form';
  if (q('form#loginform[action*="wp-login.php"]') && !q('main article, main section')) return 'sign-in form';
  if (q('form.post-password-form, form[action*="action=postpass"]')) return 'this page is password-protected';
  return null;
}
// The lib's consent hider (never clicks Accept), applied after load; a no-op DOM mutation wakes its observer.
const CONSENT_CSS = [SEL.consent, SEL.ignoreOverlays].filter(Boolean).join(', ');
const CONSENT = typeof L.consentHider !== 'function' ? null
  : `(${L.consentHider.toString()})(arguments[0]); try { document.body.appendChild(document.createComment('qa')).remove(); } catch (e) {} return 1;`;
const CONSENT_ARG = { css: CONSENT_CSS ? CONSENT_CSS + '{display:none!important}' : '', generic: true };

// ---------------------------------------------------------------- PNG ink box (no dependency: zlib only)
function decodePNG(buf) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let o = 8, w = 0, h = 0, depth = 0, ct = 0, il = 0; const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!w || !h || depth !== 8 || !ch || il) return null;
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return null; }
  const stride = w * ch, px = Buffer.alloc(h * stride);
  if (raw.length < h * (stride + 1)) return null;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x], left = x >= ch ? px[dst + x - ch] : 0, up = y ? px[dst - stride + x] : 0, ul = y && x >= ch ? px[dst - stride + x - ch] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + left; else if (f === 2) r = v + up; else if (f === 3) r = v + ((left + up) >> 1);
      else if (f === 4) { const pp = left + up - ul, pa = Math.abs(pp - left), pb = Math.abs(pp - up), pc = Math.abs(pp - ul); r = v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul); }
      else return null;
      px[dst + x] = r & 255;
    }
  }
  return { w, h, rgb: (x, y) => { const i = y * stride + x * ch; return ch >= 3 ? [px[i], px[i + 1], px[i + 2]] : [px[i], px[i], px[i]]; } };
}
// Where the typed text sits inside the field, from pixels. The field's inner box is found in the image itself (an
// element screenshot can carry an extra row from sub-pixel positioning): edge rows = rows that differ from the field
// background across most of the width (border, outside page), searched only within the border width + 2px of each
// side. Text rows are scanned in the text columns only (no select arrow, autofill or suffix icon).
function inkBox(img, g) {
  const s = img.w / g.W; // device px per CSS px
  const c0 = Math.max(0, Math.floor(g.x0 * s)), c1 = Math.min(img.w, Math.ceil(g.x1 * s));
  if (img.h < 8 || c1 - c0 < 2) return null;
  const hist = new Map();
  for (let y = Math.floor(img.h / 4); y < Math.ceil(img.h * 3 / 4); y++) for (let x = c0; x < c1; x++) { const [r, gg, b] = img.rgb(x, y); const k = (r << 16) | (gg << 8) | b; hist.set(k, (hist.get(k) || 0) + 1); }
  let bg = 0, best = -1; for (const [k, v] of hist) if (v > best) { best = v; bg = k; }
  const R0 = (bg >> 16) & 255, G0 = (bg >> 8) & 255, B0 = bg & 255;
  const off = (x, y) => { const [r, gg, b] = img.rgb(x, y); return Math.abs(r - R0) + Math.abs(gg - G0) + Math.abs(b - B0) > 48; };
  const xa = Math.min(2, img.w - 1), xb = Math.max(xa + 1, img.w - 2);
  const edge = y => { let n = 0; for (let x = xa; x < xb; x++) if (off(x, y)) n++; return n / (xb - xa) > 0.5; };
  const topBand = Math.min(img.h, Math.ceil((g.bt + 2) * s) + 1), botBand = Math.min(img.h, Math.ceil((g.bb + 2) * s) + 1);
  let top = 0; for (let y = 0; y < topBand; y++) if (edge(y)) top = y + 1;
  let bot = img.h; for (let y = img.h - 1; y >= img.h - botBand; y--) if (edge(y)) bot = y;
  if (bot - top < 4) return null;
  let first = -1, last = -1;
  for (let y = top; y < bot; y++) for (let x = c0; x < c1; x++) if (off(x, y)) { if (first < 0) first = y; last = y; break; }
  if (first < 0) return { ink: false };
  const r1 = v => Math.round(v * 10) / 10;
  return { ink: true, top: r1((first - top) / s), bottom: r1((bot - 1 - last) / s), touch: first === top || last === bot - 1 };
}
function inkOf(buf, g, file) {
  if (!g) return { error: 'field not found' };
  if (file) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); } catch (e) { /* evidence only */ } }
  const img = decodePNG(buf); if (!img) return { error: 'screenshot not decodable (PNG type unsupported)' };
  const b = inkBox(img, g); if (!b) return { error: 'field too small to scan' };
  return Object.assign({ pt: g.pt, pb: g.pb, H: Math.round(g.H * 10) / 10, shown: g.shown }, b);
}
const shotFile = (p, iw, k, engine) => path.join(OUT, 'shots', 'safari', 'fields', `${slug(p) || 'home'}-${iw}-f${String(k).replace('.', '_')}-${engine}.png`);

// ---------------------------------------------------------------- Chromium reference at the same innerWidth (optional)
let refTried = false;
async function chromium() {
  if (refTried) return refBrowser;
  refTried = true;
  const pw = tryPlaywright();
  if (!pw) { S.refOff = `Playwright missing — run: cd "${__dirname}" && npm ci && npx playwright-core install chromium`; return null; }
  try {
    if (typeof L.launchChromium === 'function') { refBrowser = await L.launchChromium(pw, cfg); S.refEngine = `Chromium ${refBrowser.version()} (${refBrowser.__qaSource || 'lib choice'})`; }
    else { const exe = typeof L.chromeExecutable === 'function' ? L.chromeExecutable() : null; refBrowser = await pw.chromium.launch(exe ? { executablePath: exe } : {}); S.refEngine = `Chromium ${refBrowser.version()}`; }
  } catch (e) { S.refOff = `Chromium failed to launch: ${msg(e).split(' Call log')[0].replace(/\s*=+\s*/g, ' ').slice(0, 420)}`; }
  return refBrowser;
}
async function chromiumInk(pg, t, p, iw) {
  const sel = `[data-qa-f="${t.k}"]`, loc = pg.locator(sel), text = typeText(t);
  await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
  let restore = false;
  if (t.tag === 'SELECT') restore = await pg.evaluate(SELECT_SHOW, t.k);
  else await loc.fill(text, { timeout: 5000 });
  await pg.evaluate(BLUR, t.k); await pg.waitForTimeout(150);
  const g = await pg.evaluate(FIELD_GEOM, [t.k, text]);
  const png = await loc.screenshot({ caret: 'hide', animations: 'disabled', timeout: 10000 });
  if (t.tag === 'SELECT') { if (restore) await pg.evaluate(SELECT_RESTORE, t.k); }
  else await loc.fill('', { timeout: 5000 }).catch(() => { });
  return inkOf(png, g, shotFile(p, iw, t.k, 'chromium'));
}
async function chromiumRef(p, iw, ih) {
  const b = await chromium(); if (!b) return { error: S.refOff };
  let ctx = null;
  try {
    const extra = { viewport: { width: iw, height: ih || 900 }, deviceScaleFactor: 2 };
    ctx = await b.newContext(typeof L.contextOptions === 'function' ? L.contextOptions(cfg, extra) : extra);
    if (typeof L.addConsentHiding === 'function') await L.addConsentHiding(ctx, cfg).catch(() => { });
    const pg = await ctx.newPage();
    await L.gotoStable(pg, cfg.base + p);
    await pg.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 450) { scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } scrollTo(0, 0); });
    await pg.waitForTimeout(1800);
    const st = await pg.evaluate(M.STATIC, dec);
    const tags = await pg.evaluate(FIELDS_TAG);
    const ink = {};
    for (const t of tags.filter(x => x.single && !x.readOnly).slice(0, FIELD_CAP)) {
      try { ink[t.k] = await chromiumInk(pg, t, p, iw); } catch (e) { ink[t.k] = { error: msg(e).split(' Call log')[0].slice(0, 80) }; }
    }
    return { st, ink };
  } catch (e) { return { error: 'Chromium reference failed: ' + msg(e).split(' Call log')[0].slice(0, 120) }; }
  finally { if (ctx) await ctx.close().catch(() => { }); }
}

// ---------------------------------------------------------------- Safari measurements
async function measurePage(p) {
  const url = cfg.base + p;
  await req('POST', `/session/${sid}/url`, { url }, 90000);
  for (let i = 0; ; i++) { const t = await ex('return document.title'); if (!CHALLENGE.test(t || '')) break; if (i >= 10) throw Object.assign(new Error('host challenge page did not clear'), { kind: 'challenge', route: 'set concurrency 1 and throttleMs ≥ 1500 in qa-target.json or ask the host to allowlist this machine' }); await wait(2500); }
  // a redirect: the target is measured as its own page when it is in the page list, otherwise here (labelled p → target)
  const here = await ex('return location.href');
  let label = p;
  if (!sameUrl(here, url)) {
    const fin = sitePath(here);
    if (fin == null) throw Object.assign(new Error(`redirects to ${here} (sign-in / SSO?)`), { kind: 'offsite', route: 'set "base" to the final site, or a person provides access' });
    if (PAGESET.has(norm(cfg.base + fin))) throw Object.assign(new Error(`${p} → ${fin}`), { dup: true });
    label = `${p} → ${fin}`;
  }
  const gate = await call(GATE, null);
  if (gate && !/this page is password-protected/.test(gate)) throw Object.assign(new Error(gate), { kind: 'gate', route: GATE_ROUTE });
  if (gate) S.pageNotes.push(`${p} is password-protected: the password form itself was measured (the protected content is FEAT-07, a person)`);
  if (CONSENT) await ex(CONSENT, [CONSENT_ARG]).catch(() => { });
  await wait(1200);
  await ex(SCROLL_JS);
  await wait(1800);
  const st = await ex(`return (${M.STATIC.toString()})(arguments[0])`, [dec]);
  if (!st || typeof st !== 'object' || !Array.isArray(st.clipped)) throw new Error('the page measure returned nothing');
  const vp = await ex('return [innerWidth, innerHeight]');
  return { st, iw: vp[0], ih: vp[1], label };
}
function evaluate(p, iw, st, label) {
  const where = `${label || p} @${iw}`;
  if (st.overflowX > 0) S.xb02.push({ where, why: `horizontal scroll ${st.overflowX}px` });
  if (st.clipped.length) S.xb02.push({ where, why: 'clipped: ' + st.clipped.slice(0, 3).map(x => `${x.sel} L${x.left}`).join('; ') + (st.clipped.length > 3 ? ` (+${st.clipped.length - 3} more)` : '') });
  if ((st.fontErrors || []).length) S.xb02.push({ where, why: 'font errors: ' + st.fontErrors.join(', ') });
  const broken = (st.imgs || []).filter(i => i.broken);
  if (broken.length) S.xb02.push({ where, why: `${broken.length} broken image(s): ` + broken.slice(0, 3).map(i => String(i.src).split('/').pop()).join(', ') });
}
async function safariInk(t, p, iw) {
  const css = `[data-qa-f="${t.k}"]`, text = typeText(t);
  const eid = await el(css);
  await ex('var e=document.querySelector(arguments[0]); if (e) e.scrollIntoView({block:"center"}); return 1', [css]);
  let restore = false;
  if (t.tag === 'SELECT') restore = await call(SELECT_SHOW, t.k);
  else { await req('POST', `/session/${sid}/element/${eid}/clear`, {}).catch(() => { }); await req('POST', `/session/${sid}/element/${eid}/value`, { text }); }
  await call(BLUR, t.k); await wait(150);
  const g = await call(FIELD_GEOM, [t.k, text]);
  const b64 = await req('GET', `/session/${sid}/element/${eid}/screenshot`);
  if (t.tag === 'SELECT') { if (restore) await call(SELECT_RESTORE, t.k); }
  else await req('POST', `/session/${sid}/element/${eid}/clear`, {}).catch(() => { });
  return inkOf(Buffer.from(String(b64 || ''), 'base64'), g, shotFile(p, iw, t.k, 'safari'));
}
async function formShots(p, iw, tags) {
  for (const fi of uniq(tags.map(t => t.fi))) {
    try {
      const css = `[data-qa-form="${fi}"]`, eid = await el(css);
      await ex('var e=document.querySelector(arguments[0]); if (e) e.scrollIntoView({block:"start"}); return 1', [css]);
      let b64; try { b64 = await req('GET', `/session/${sid}/element/${eid}/screenshot`); } catch (e) { b64 = await req('GET', `/session/${sid}/screenshot`); }
      const dir = path.join(OUT, 'shots', 'safari'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${slug(p) || 'home'}-${iw}-form${fi}.png`), Buffer.from(String(b64 || ''), 'base64'));
    } catch (e) { S.shotFails++; }
  }
}
function compareBoxes(where, st, base, src) {
  let n = 0;
  (base.forms || []).forEach((cf, fi) => {
    const sf = (st.forms || [])[fi]; if (!sf) return;
    (sf.fields || []).forEach((x, i) => {
      const y = (cf.fields || [])[i]; if (!y) return;
      n++;
      const off = (u, v, tol) => { const p = num(u), q = num(v); return p != null && q != null ? Math.abs(p - q) > tol : String(u) !== String(v); };
      if (Math.abs(x.h - y.h) > 2 || off(x.pt, y.pt, 0.5) || off(x.pb, y.pb, 0.5) || off(x.lh, y.lh, 0.5) || x.type !== y.type) {
        S.f07.push({ engine: 'safari', where, field: x.label || x.name || x.tag, safari: `${x.type} ${x.h}px pad ${x.pt}/${x.pb} lh ${x.lh}`, chromium: `${y.type} ${y.h}px pad ${y.pt}/${y.pb} lh ${y.lh}`, baseline: src });
      }
    });
  });
  return n;
}
function compareInk(where, p, iw, t, s, c) {
  const key = `${p}@${iw}#${t.fi}#${t.k.split('.')[1]}`;
  S.fieldsOut[key] = { label: t.label, type: t.type, safari: s, chromium: c || null };
  if (!c || c.error) { S.f10Gaps.push(`${where} ${t.label}: Chromium ${c ? c.error : 'not measured'}`); return; }
  if (s.error) { S.f10Gaps.push(`${where} ${t.label}: Safari ${s.error}`); return; }
  S.f10Fields++;
  if (!c.ink) return; // nothing drawn in Chromium either (e.g. an empty select): no subject
  const shots = `${path.relative(OUT, shotFile(p, iw, t.k, 'safari'))} | ${path.relative(OUT, shotFile(p, iw, t.k, 'chromium'))}`;
  const show = x => `ink gap top ${x.top} / bottom ${x.bottom}, padding ${x.pt}/${x.pb}, field ${x.H}px`;
  if (!s.ink) { S.f10Ask.push({ where, field: t.label, why: 'the typed text is not visible in Safari (no ink) while Chromium draws it — look at the screenshots', shots }); return; }
  if (s.touch && !c.touch) { S.f10.push({ engine: 'safari', where, field: t.label, why: 'text touches the inner edge of the field in Safari (clipped), not in Chromium', safari: show(s), chromium: show(c), shots }); return; }
  const skS = (s.top - s.bottom) - (s.pt - s.pb), skC = (c.top - c.bottom) - (c.pt - c.pb), d = Math.round((skS - skC) * 10) / 10;
  S.fieldsOut[key].skewDiff = d;
  if (Math.abs(d) > 2) S.f10.push({ engine: 'safari', where, field: t.label, why: `text sits ${Math.abs(d / 2).toFixed(1)}px ${d > 0 ? 'lower' : 'higher'} in Safari than in Chromium (top−bottom gap differs by ${Math.abs(d)}px)`, safari: show(s), chromium: show(c), shots });
}
async function formsPart(p, iw, ih, st) {
  if (!(st.forms || []).some(f => (f.fields || []).length)) return;
  const where = `${p} @${iw}`;
  const tags = await call(FIELDS_TAG, null);
  await formShots(p, iw, tags);
  const ref = await chromiumRef(p, iw, ih);
  // FORM-07: field boxes
  let base = ref.st || null, src = `${S.refEngine || 'Chromium'} @${iw}`;
  if (!base) { const c = staticChrome()[`${p}@${iw}`]; if (c && !c.fail) { base = c; src = 'static-chromium.json'; } }
  if (!base) S.f07Gaps.push(`${where}: ${ref.error ? ref.error + '; ' : ''}no Chromium baseline at this innerWidth (static-chromium.json has ${Object.keys(staticChrome()).length ? 'other widths only' : 'no data — run qa-run.cjs first'})`);
  else { S.f07Fields += compareBoxes(where, st, base, src); S.f07Pages++; }
  // FORM-10: ink box of the typed text
  const single = tags.filter(t => t.single && !t.readOnly).slice(0, FIELD_CAP);
  if (!single.length) return;
  if (!ref.ink) { S.f10Gaps.push(`${where}: ${ref.error || 'no Chromium reference'}`); return; }
  for (const t of single) {
    let s;
    try { s = await safariInk(t, p, iw); }
    catch (e) { if (/invalid session id|no such window/i.test(msg(e))) throw e; s = { error: msg(e).slice(0, 80) }; }
    compareInk(where, p, iw, t, s, ref.ink[t.k]);
  }
}
// Size the window, read the real innerWidth back and correct once for window chrome (a clamped window stays clamped
// and is recorded as such). A read that fails leaves iw null; the first measured page then supplies it.
async function setWindow(w, h) {
  await req('POST', `/session/${sid}/window/rect`, { width: w, height: h });
  const read = async () => { try { const v = await ex('return [innerWidth, document.documentElement.clientWidth]'); return Array.isArray(v) ? v : [null, null]; } catch (e) { return [null, null]; } };
  let [iw, cw] = await read();
  if (iw && iw !== w) { await req('POST', `/session/${sid}/window/rect`, { width: w + (w - iw), height: h }); [iw, cw] = await read(); }
  return { iw, cw };
}

// ---------------------------------------------------------------- main
async function main() {
  if (cfg.local) { await L.resolveTarget(cfg); R._base = cfg.base; } // the same 127.0.0.1 origin as qa-run --local (port derived from the folder)
  if (typeof L.acquireLock === 'function') L.acquireLock('safari-real', cfg, OUT); // one heavy instrument per site; never next to Lighthouse
  save(); // provisional: a kill from here on leaves "did not finish", never an older run's file
  if (process.platform !== 'darwin') return fail(`Safari exists only on macOS — ${ROUTE}`);
  const plan = await planPages(MAX);
  S.plan = { sampled: plan.sampled, all: plan.all, src: plan.src };
  S.pages = plan.pages; S.cut = plan.cut;
  PAGESET = new Set(S.pages.concat(S.cut).map(q => norm(cfg.base + q)));
  if (!S.pages.length) return fail('no page to open — run qa-run.cjs first (it writes the page list) or list "pages" in qa-target.json');

  // driver: a free local port, readiness polled (never a fixed sleep), start-up failures mapped to a route
  const port = await freePort(); U = `http://127.0.0.1:${port}`;
  sd = spawn('safaridriver', ['-p', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
  sd.stderr.on('data', d => { if (sdLog.length < 2000) sdLog += d; });
  const died = new Promise(res => {
    sd.once('error', e => res(e.code === 'ENOENT' ? `safaridriver not found on this Mac — ${ROUTE}` : `safaridriver could not start: ${msg(e)} — ${ROUTE}`));
    sd.once('exit', (c, sig) => res(`safaridriver exited (${sig || 'code ' + c})${sdLog.trim() ? ': ' + sdLog.trim().replace(/\s+/g, ' ').slice(0, 200) : ''} — person runs once in Terminal: safaridriver --enable (it asks for their own password), then ${PERSON_SETUP.replace(/^person /, '')}`));
  });
  const ready = await Promise.race([waitReady(10000), died]);
  if (ready !== true) return fail(typeof ready === 'string' ? ready : `safaridriver did not start listening on 127.0.0.1:${port} within 10 s — rerun; if it repeats: ${PERSON_SETUP}`);
  died.then(why => { if (!ending && sid) S.notes.push('driver stopped during the run: ' + why.slice(0, 160)); });

  try {
    const v = await req('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }, 90000);
    sid = v && v.sessionId; S.version = (v && v.capabilities && v.capabilities.browserVersion) || null;
    if (!sid) throw new Error('no sessionId in the reply');
  } catch (e) { return fail(sessionRoute(e)); }
  await req('POST', `/session/${sid}/timeouts`, { pageLoad: 60000, script: 30000 }).catch(e => S.notes.push('timeouts not set: ' + msg(e).slice(0, 80)));

  // open the first page once, so the screen and window reads run on a real document (not about:blank)
  try { await req('POST', `/session/${sid}/url`, { url: cfg.base + S.pages[0] }, 90000); } catch (e) { if (/invalid session id|no such window/i.test(msg(e))) return fail('the Safari session closed right after it opened: ' + msg(e).slice(0, 120)); }
  // windows from cfg.widths that fit this screen
  let aw = null, ah = null, dpr = null;
  try { [aw, ah, dpr] = await ex('return [screen.availWidth, screen.availHeight, window.devicePixelRatio]'); } catch (e) { S.notes.push('screen size unreadable: ' + msg(e).slice(0, 80)); }
  S.screen = aw ? `${aw}x${ah}@${dpr}x` : null;
  const ws = uniq((cfg.widths || []).map(Number).filter(Number.isFinite));
  const fits = w => !aw || w <= aw;
  const desk = ws.includes(1440) && fits(1440) ? 1440 : ws.filter(w => w >= 992 && fits(w)).sort((x, y) => y - x)[0] || null;
  const tab = ws.includes(768) ? 768 : ws.filter(w => w >= 568 && w < 992).sort((x, y) => y - x)[0] || null;
  const H = Math.min(900, ah || 900);
  if (!desk) S.winGaps.push(`desktop Safari window NOT RUN: the screen (${aw}px) is narrower than every desktop width in cfg.widths (${ws.join(', ')}) — route: a Mac with a wider screen`);
  if (!tab) S.notes.push(`no tablet width (568–991) in cfg.widths (${ws.join(', ')}) — Safari measured at the desktop width only`);
  const wins = [desk, tab].filter(Boolean);
  if (!wins.length) return fail(`no width from cfg.widths (${ws.join(', ')}) fits a Safari window on this screen (${aw}px)`);
  S.planned = S.pages.length * wins.length;
  setEnv({ version: S.version, macOS: tryRun('sw_vers', ['-productVersion']), screen: S.screen, windows: wins, pages: `${S.pages.length} of ${plan.sampled} sampled (${plan.all} found, from ${plan.src})`, max: MAX });
  save();

  try {
    for (const w of wins) {
      if (ending) break;
      let win;
      try { win = await setWindow(w, H); }
      catch (e) { if (/invalid session id|no such window/i.test(msg(e))) throw e; S.pages.forEach(p => S.missed.push({ win: w, p, why: 'window could not be sized: ' + msg(e).slice(0, 100) })); save(); continue; }
      const wrec = { req: w, iw: win.iw, cw: win.cw }; S.windows.push(wrec);
      S.notes.push(`window requested ${w}x${H}: innerWidth ${win.iw == null ? 'unread' : win.iw}, clientWidth ${win.cw == null ? 'unread' : win.cw}, screen ${S.screen || '?'}${win.iw && win.cw && win.cw < win.iw ? ` — classic scrollbars take ${win.iw - win.cw}px (headless Chromium has none)` : ''}`);
      let streak = 0;
      for (let i = 0; i < S.pages.length; i++) {
        if (ending) break;
        const p = S.pages[i];
        if (streak >= 3) { S.pages.slice(i).forEach(q => S.missed.push({ win: wrec.iw || w, p: q, why: 'skipped after 3 pages in a row could not be measured', kind: 'tool' })); break; }
        let m = null;
        try { m = await measurePage(p); streak = 0; }
        catch (e) {
          if (/invalid session id|no such window/i.test(msg(e))) throw e;
          if (e.dup) { S.redirects.push(msg(e)); save(); continue; }
          if (!e.kind) streak++;
          S.missed.push({ win: wrec.iw || w, p, why: msg(e).slice(0, 220), kind: e.kind || 'tool', route: e.route || '' });
          // a site-wide gate answers every page the same way: record the rest with the same reason instead of opening them
          if (e.kind === 'gate') { S.pages.slice(i + 1).forEach(q => S.missed.push({ win: wrec.iw || w, p: q, why: msg(e), kind: 'gate', route: e.route })); save(); break; }
        }
        if (m) {
          if (wrec.iw == null) wrec.iw = m.iw;
          S.measured++;
          evaluate(p, m.iw, m.st, m.label);
          try { await formsPart(p, m.iw, m.ih, m.st); }
          catch (e) { if (/invalid session id|no such window/i.test(msg(e))) throw e; S.f10Gaps.push(`${p} @${m.iw}: ${msg(e).slice(0, 100)}`); }
        }
        save(); process.stderr.write('.');
      }
    }
  } catch (e) {
    S.stopped = 'the Safari session was lost: ' + msg(e).slice(0, 160);
  }
  if (S.refEngine) setEnv({ reference: S.refEngine });
  S.inProgress = false;
  materialize();
  const xb = R.checks['XB-02'] || {};
  console.log(`\nsafari done: ${(xb.notes || [])[0] || ''}`);
  if (xb.notRun) console.log('XB-02 NOT RUN' + (S.measured ? ' (partly)' : '') + ': ' + xb.notRun);
  return finish(S.measured ? 0 : EXIT_NOT_RUN);
}
main().catch(e => { S.stopped = 'safari-real stopped: ' + msg(e).slice(0, 200); console.error(S.stopped); finish(EXIT_NOT_RUN); });
