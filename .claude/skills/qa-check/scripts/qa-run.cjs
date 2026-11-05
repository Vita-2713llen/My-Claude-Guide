#!/usr/bin/env node
// qa-check · qa-run.cjs — the main crawler. It measures every registry row whose tool is 'qa-run' and reports each one
// as a finding (fail / ask), as tested with 0 findings (pass), as n/a with the reason the subject is absent, or as NOT
// RUN with the reason and the route. No row is ever left silent: finalize() turns anything unreached into NOT RUN.
//
// Usage (from the PROJECT folder, where qa-target.json lives; call the script by its full path):
//   node <skill>/scripts/qa-run.cjs [--base https://site | --local ./build] [--out qa-out] [--pages /,/about/]
//        [--widths 1920,1440,1280,992,768,568,360] [--engines chromium,webkit,firefox] [--interact-widths 1440,768,360]
//        [--full] [--quick] [--no-edge] [--form-errors] [--stage 1|2] [--storage-state file] [--budget minutes]
//        [--concurrency n] [--interact-concurrency n] [--xb-widths anchor|all|1440,768,568,360]
//   --budget       minutes (default 30, the upper bound — not a target): steps run by priority, what the budget cuts is
//                  NOT RUN per row (RUN-04); results-qa-run.json → _timing and manifest.md → ## Time say where the time went
//   --full         no template sampling: every page gets every pass
//   --quick        WebKit/Firefox at 1440 + 360 only, page weight on ≤5 pages — recorded as a cut (RUN-04 not run)
//   --no-edge      skip the Microsoft Edge pass (XB-04 not run, with the reason)
//   --form-errors  allowed to press submit on EMPTY forms (client-side validation and the error state: FORM-06, A11Y-09).
//                  Nothing is ever typed into a form that is submitted; without the flag no submit is ever pressed.
//
// Safety (audit-only): the audited site is never changed. Requests other than GET/HEAD/OPTIONS made by the page are
// blocked (except the empty submit allowed by --form-errors), analytics hits are blocked (qa-target.json
// "trackingHits": "allow" turns that off), cookie banners are hidden or declined — never accepted — and no password is
// ever typed: a gated site is audited only through a session the person saved (storageState) or QA_HTTP_USER /
// QA_HTTP_PASS exported by the person in their own terminal.
//
// Determinism: pinned browser (Playwright's bundled Chromium unless qa-target.json "chromium" says otherwise), locale,
// timezone, DPR 1, light colour scheme, service workers blocked; pages, widths and findings in a fixed order. The same
// site + qa-target.json + skill version gives the same manifest on macOS, Windows and Linux.
//
// Outputs in --out: results-qa-run.json (with _platform, _stage, _presence, _coverage), static-chromium.json,
// texts.json (for spell.cjs), pages.json (page plan for the other instruments), progress.json, shots/.
// Exit: 0 finished (findings and NOT RUN rows are in the results), 3 stopped early (gate, no browser, nothing loaded).
//
// qa-target.json keys read here besides the common ones (see references/instruments.md):
//   decisions.credit        { text, links: [{ text, href }], linkCount } or a list of such rules (FOOT-01)
//   decisions.contacts      { emails: [], phones: [] } (LINK-08)      decisions.socialProfiles  [url, …] (LINK-11)
//   decisions.logoHover     "none" | "opacity" | "color" | "any" (INT-14)
//   decisions.container     { width, gutter } (LAY-13)                decisions.spacing  { headingText, textButton, headContent } (LAY-14)
//   decisions.fieldMaxLength { text, email, tel, textarea, url, number } (FORM-12)
//   reference.tokens        JSON file { color: [], fontSize: [], space: [], radius: [], durationMs: [], fontFamily: [] } (REF-01)
//   reference.build         folder of a clean stage-1 qa-out (its static-chromium.json) + reference.pageMap (REF-02)
//   sources.copy            text file with the client's copy, one block per paragraph (COPY-01)
//   cssOwn / cssExclude     regex lists: stylesheets that are / are not project CSS (INT-07, XB-06, XB-07, STRUCT-02)
//   selectors.header|main|footer|section|honeypot   region / section / honeypot overrides
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const M = require('./measure-page.cjs');
const REG = require('./registry.cjs');

const a = L.args(process.argv.slice(2));
const OUT = L.outDirFrom(a);
const cfg = L.loadConfig(a, { allowLocal: true });
const R = L.makeResults('qa-run', cfg, a);
const DEC = cfg.decisions;
const T0 = Date.now();
const FORM_ERRORS = !!a['form-errors'], QUICK = !!a.quick, FULL = !!a.full, NO_EDGE = !!a['no-edge'];
const REF = L.TIER; // { desktop: 1440, tablet: 768, mobile: 360 }
const MINE = REG.filter(r => r.tool === 'qa-run').map(r => r.id);
const MINE_SET = new Set(MINE);
const ROW = id => REG.byId(id);
const GATES = REG.GATES || {};
const gateName = g => String(GATES[g] || g).replace(/^(a|an|the)\s+/i, '');

const log = (...x) => process.stderr.write(x.join(' ') + '\n');
const wait = ms => new Promise(r => setTimeout(r, ms));
const byStr = L.byStr;
const firstLine = (s, n) => String(s === null || s === undefined ? '' : s).split('\n')[0].slice(0, n || 160);
const errMsg = e => firstLine((e && e.message) || e, 160);
const slug = p => (String(p).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home').slice(0, 60);
const uniq = arr => [...new Set(arr)];
const sortNum = arr => arr.slice().sort((x, y) => x - y);
const norm = s => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
const fileOf = u => String(u || '').split(/[?#]/)[0].split('/').pop().slice(0, 80) || String(u || '').slice(0, 80);
const reList = v => [].concat(v || []).filter(Boolean).map(x => { try { return new RegExp(String(x), 'i'); } catch (e) { return null; } }).filter(Boolean);
const where = (p, w, engine) => `${p} @${w}${engine && engine !== 'chromium' ? ' ' + engine : ''}`;
function withTimeout(promise, ms, what) {
  let t; return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what || 'step'} timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
}
const ev = (page, fn, arg, ms) => withTimeout(page.evaluate(fn, arg), ms || 60000, fn.name || 'page step');

// ------------------------------------------------------------------------------------------------ ledger
// Everything is collected here first and written to R only in finalize(), so the precedence is fixed:
// findings → tested (pass) → n/a (subject absent) → NOT RUN (reason) → NOT RUN (not reached). Coverage gaps (a page
// that did not load, an engine that did not start, the time budget) are added to every row they touch as "partial".
const ITEM_CAP = 150;
const LED = new Map();
// Interaction jobs run in parallel (runJobs); every ledger write made inside a job is buffered and replayed in the
// job's plan order when it finishes, so the ledger (items, caps, notes, NOT RUN reasons) is the same as in a serial run.
const { AsyncLocalStorage } = require('async_hooks');
const JOB_LOG = new AsyncLocalStorage();
const deferred = fn => (...x) => { const b = JOB_LOG.getStore(); if (b) b.push(() => fn(...x)); else fn(...x); };
function led(id) {
  if (!MINE_SET.has(id)) throw new Error(`internal: ${id} is not a qa-run row`);
  let l = LED.get(id); if (!l) LED.set(id, l = { t: 0, items: new Map(), na: new Set(), nr: new Set(), notes: [], extra: 0 });
  return l;
}
const T = deferred((id, n) => { led(id).t += (n === undefined ? 1 : n); });
const putLater = deferred(putNow);
const put = (id, item, ask, key) => putLater(id, Object.assign({}, item), ask, key); // copied now: later mutation never leaks in
function putNow(id, item, ask, key) {
  const l = led(id); const it = Object.assign({}, item); if (ask) it.ask = true;
  const k = (ask ? 'Q|' : 'F|') + (key !== undefined ? String(key) : L.stable(it));
  if (l.items.has(k)) return;
  if (l.items.size >= ITEM_CAP) { l.extra++; return; }
  l.items.set(k, it);
}
const F = (id, item, key) => put(id, item, false, key);
const Q = (id, item, key) => put(id, item, true, key);
const NA = deferred((id, why) => { led(id).na.add(String(why)); });
const NR = deferred((id, why) => { led(id).nr.add(String(why)); });
const NOTE = deferred((id, s) => { const l = led(id); s = String(s); if (l.notes.length < 40 && !l.notes.includes(s)) l.notes.push(s); });
const ids = s => s.split(/\s+/).filter(Boolean);
const tested = id => led(id).t > 0 || led(id).items.size > 0;
// coverage gaps: { ids, what, why }
const GAPS = [];
const GAP = deferred((list, what, why) => { GAPS.push({ ids: [].concat(list), what: String(what), why: String(why) }); });
// decisions that must be set explicitly before a dependent check may judge
const MISSING = Object.fromEntries(L.requireDecisions(cfg).map(x => [x.key, x.question]));
const decided = (id, key) => { if (!MISSING[key]) return true; NR(id, `decision missing — ${MISSING[key]}`); return false; };
// time budget (the cut is recorded, never silent)
const DEADLINE = T0 + Math.max(5, +cfg.budgetMinutes || 30) * 60000;
const late = () => Date.now() > DEADLINE;
const BUDGET_WHY = `time budget reached (budgetMinutes ${cfg.budgetMinutes}) — rerun with --budget <more minutes>, --pages for a subset, or raise "sample"`;
// time accounting (R._timing, progress.json): every step's wall time with the counts that explain it, plus the busy
// time of each sub-step (page loads, STATIC, each interaction kind). Busy time of parallel workers can exceed wall time.
const TIME = { steps: [], acc: {} };
const CUT = []; // interaction phases the time budget cut ("engine phase page @width"), for the time table
function tAdd(key, ms, n) { const x = TIME.acc[key] || (TIME.acc[key] = { ms: 0, n: 0 }); x.ms += ms; x.n += (n === undefined ? 1 : n); }
async function timed(key, fn, n) { const t = Date.now(); try { return await fn(); } finally { tAdd(key, Date.now() - t, n); } }
function stepTime(id, label, ms, why) { TIME.steps.push({ id, label, ms, why: why || '' }); }
async function wallStep(id, label, fn, why) { const t = Date.now(); try { return await fn(); } finally { stepTime(id, label, Date.now() - t, typeof why === 'function' ? why() : why); } }
function timingOut() {
  const acc = {}; for (const k of Object.keys(TIME.acc).sort(byStr)) acc[k] = { ms: TIME.acc[k].ms, n: TIME.acc[k].n };
  return { tool: 'qa-run', startMs: T0, endMs: Date.now(), totalMs: Date.now() - T0, budgetMinutes: cfg.budgetMinutes, concurrency: cfg.concurrency, steps: TIME.steps.slice(), busy: acc };
}

// ------------------------------------------------------------------------------------------------ row groups
const STATIC_IDS = ids(`LINK-01 LINK-02 LINK-04 LINK-05 LINK-06 LINK-08 LINK-09 LINK-11 LINK-12 LINK-13 JS-01 A11Y-01 A11Y-04 A11Y-05
  A11Y-06 A11Y-08 LAY-01 LAY-02 LAY-03 LAY-04 LAY-05 LAY-07 LAY-08 LAY-10 LAY-11 LAY-12 LAY-13 LAY-14 LAY-15 LAY-16 LAY-17 LAY-18 LAY-19 LAY-20 LAY-22 LINK-14
  IMG-01 IMG-02 IMG-03 IMG-04 IMG-05 IMG-06 IMG-07 IMG-08 IMG-09 VID-01 VID-02 VID-03 FONT-01 FONT-02 TEXT-01 TEXT-03 TEXT-04
  TEXT-05 TEXT-06 TEXT-07 COPY-01 COPY-02 COPY-03 COPY-04 COPY-05 COPY-06 COPY-07 FORM-02 FORM-03 FORM-04 FORM-12 FORM-13 FORM-15
  MAP-01 MAP-02 SEO-01 SEO-02 SEO-03 SEO-04 SEO-05 SEO-09 SEO-10 SEO-11 TRACK-01 DONOR-01 TPL-01 CMS-01 WF-02 WF-03 WF-08
  I18N-01 I18N-02 I18N-05 I18N-06 PAGE-01 FOOT-01 REF-01 INT-08 INT-13 PERF-02 RUN-02`);
const XB_IDS = ids('XB-01 FORM-07 FORM-10 FORM-15 JS-01');
const INTERACT_IDS = ids(`INT-01 INT-02 INT-03 INT-04 INT-05 INT-06 INT-09 INT-10 INT-11 INT-12 INT-14 INT-15 MODAL-01 NAV-01 NAV-02 NAV-03
  NAV-04 NAV-05 NAV-06 NAV-07 NAV-08 NAV-09 NAV-11 NAV-12 NAV-13 NAV-14 NAV-15 A11Y-02 A11Y-03 A11Y-07 A11Y-08 A11Y-09 A11Y-10
  LAY-06 LINK-07 LINK-10 LINK-13 FORM-01 FORM-05 FORM-06 FORM-11 FORM-12 FORM-13 I18N-03 I18N-04 XB-08 JS-01`);

// ------------------------------------------------------------------------------------------------ browsers, contexts, pages
let PW = null;
const BR = {};               // engine → browser (chromium / webkit / firefox through lib; msedge launched here)
const ENGINE_FAIL = {};      // engine → reason it did not start
async function browser(engine) {
  const b = BR[engine]; if (b && b.isConnected()) return b;
  if (ENGINE_FAIL[engine]) throw Object.assign(new Error(ENGINE_FAIL[engine]), { code: 'LAUNCH_FAILED' });
  try {
    if (engine === 'msedge') {
      const exe = process.env.EDGE_PATH && fs.existsSync(process.env.EDGE_PATH) ? process.env.EDGE_PATH : null;
      BR.msedge = await PW.chromium.launch(exe ? { executablePath: exe } : { channel: 'msedge' });
      BR.msedge.__qaSource = exe ? 'EDGE_PATH' : 'channel msedge'; BR.msedge.__qaVersion = BR.msedge.version();
    } else BR[engine] = await L.launchBrowser(PW, engine, cfg);
    return BR[engine];
  } catch (e) {
    ENGINE_FAIL[engine] = engine === 'msedge' ? `Microsoft Edge did not start (${errMsg(e)}) — route: install Microsoft Edge, or set EDGE_PATH to its executable, or hand XB-04 to a machine that has it` : errMsg(e);
    throw Object.assign(new Error(ENGINE_FAIL[engine]), { code: 'LAUNCH_FAILED' });
  }
}
async function closeBrowsers() {
  for (const k of Object.keys(BR)) { try { await BR[k].close(); } catch (e) { } }
  try { await L.closeAllBrowsers(); } catch (e) { }
}
const vh = w => (w < 768 ? 800 : w < 1200 ? 1024 : 900);
function ctxOptions(engine, w, extra) {
  const o = L.contextOptions(cfg, Object.assign({ viewport: { width: w, height: vh(w) }, serviceWorkers: 'block' }, extra || {}));
  if (w < 768) { o.hasTouch = true; if (engine !== 'firefox') o.isMobile = true; }
  return o;
}
// Analytics / tracking hits: blocked so the audit never pollutes the client's numbers (scripts still load: TRACK-01).
const TRACK_HIT = /(google-analytics\.com|analytics\.google\.com)\/(g\/|j\/)?collect|stats\.g\.doubleclick\.net|googleads\.g\.doubleclick\.net\/pagead\/(viewthroughconversion|conversion)|facebook\.com\/tr[/?]|px\.ads\.linkedin\.com|bat\.bing\.com\/action|ct\.pinterest\.com\/v3|analytics\.tiktok\.com\/api|clarity\.ms\/collect|plausible\.io\/api\/event|api\.segment\.io\/v1\/[tpi]|api-js\.mixpanel\.com\/track|heapanalytics\.com\/h\?|in\.hotjar\.com|vc\.hotjar\.io|\/matomo\.php|\/piwik\.php|sentry\.io\/api\/\d+\/(envelope|store)/i;
const ABORTED = new Set();   // URLs this instrument aborted (never reported as failures)
const BLOCKED = new Map();   // non-GET requests the guard stopped: "METHOD host/path" → count (evidence for RUN-07)
async function guardContext(ctx, o) {
  await ctx.route('**/*', route => {
    const req = route.request(); const m = req.method(); const u = req.url();
    if (cfg.trackingHits !== 'allow' && TRACK_HIT.test(u)) { ABORTED.add(u); return route.abort('blockedbyclient').catch(() => { }); }
    if (!/^(GET|HEAD|OPTIONS)$/.test(m) && !(o && o.allowSubmit && o.allowSubmit())) {
      ABORTED.add(u); let k = m + ' ' + u; try { const x = new URL(u); k = m + ' ' + x.host + x.pathname; } catch (e) { }
      BLOCKED.set(k, (BLOCKED.get(k) || 0) + 1); return route.abort('blockedbyclient').catch(() => { });
    }
    return route.continue().catch(() => { });
  });
}
// JS-01 material for one page: uncaught errors, console errors, failed script/style/font/image/document requests.
function watchPage(page) {
  const n = { errors: [], console: [], failed: [] };
  page.on('pageerror', e => { const m = String((e && e.stack) || '').match(/https?:\/\/[^\s)'"]+/); n.errors.push({ text: firstLine(e && e.message, 200), url: m ? m[0] : '' }); });
  page.on('console', m => {
    if (m.type() !== 'error') return; const t = m.text();
    if (/^Failed to load resource|net::ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(t)) return; // represented by `failed`, or aborted by the guard
    const loc = m.location() || {}; n.console.push({ text: firstLine(t, 200), url: loc.url || '' });
  });
  page.on('requestfailed', r => {
    const u = r.url(); if (ABORTED.has(u)) return; const f = r.failure(); const why = (f && f.errorText) || 'failed';
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancell?ed|blockedbyclient|ERR_BLOCKED_BY_CLIENT/i.test(why)) return;
    if (!/^(script|stylesheet|font|image|media)$/.test(r.resourceType())) return;
    n.failed.push({ url: u, type: r.resourceType(), why: firstLine(why, 80) });
  });
  page.on('response', r => {
    const s = r.status(); if (s < 400) return; const t = r.request().resourceType();
    if (!/^(script|stylesheet|font|image)$/.test(t)) return; n.failed.push({ url: r.url(), type: t, why: 'HTTP ' + s });
  });
  return n;
}
// One fresh context + page. o: { ctx: extra context options, allowSubmit: () => bool }
async function open(engine, w, o) {
  o = o || {};
  const b = await browser(engine);
  const ctx = await b.newContext(ctxOptions(engine, w, o.ctx));
  try { if (!(o.ctx && o.ctx.javaScriptEnabled === false)) await L.addConsentHiding(ctx, cfg); await guardContext(ctx, o); } catch (e) { }
  const page = await ctx.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(45000);
  const net = watchPage(page);
  return { ctx, page, net, engine, w, close: () => ctx.close().catch(() => { }) };
}
async function go(page, p, o) {
  o = o || {}; const info = {};
  const resp = await L.gotoStable(page, cfg.base + p, { settle: o.settle === undefined ? 800 : o.settle, settleCapMs: cfg.timing.settleCapMs, coverCapMs: DEC.settleMaxMs, info, timeout: 45000 });
  return { resp, status: resp ? resp.status() : 0, headers: resp ? resp.headers() : {}, info };
}
async function scrollThrough(page, engine, w) {
  const H = await ev(page, () => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), null, 10000).catch(() => 0);
  const step = Math.round(vh(w) * 0.8); const wheel = w >= 768;
  for (let y = 0, i = 0; y < Math.min(H, 60000) && i < 150; y += step, i++) {
    let ok = false;
    if (wheel) { try { await page.mouse.move(Math.round(w / 2), Math.round(vh(w) / 2)); await page.mouse.wheel(0, step); ok = true; } catch (e) { ok = false; } }
    if (!ok) await ev(page, t => window.scrollTo({ top: t, behavior: 'instant' }), y + step, 10000).catch(() => { });
    await page.waitForTimeout(90);
  }
  await quiet(page, 900);
}
// Condition-based waits. quiet(page, cap) replaces a fixed sleep of `cap` ms: it returns once nothing finite is
// animating (CSS transitions, finite animations / WAAPI, images still loading in view), no script has changed a
// style / class / state attribute or a node, and the watched signature — page size and scroll, the elements `o.sel`
// (box and computed colour / opacity / transform) and `o.sig(o.arg)` when given — has stayed the same for `o.quiet` ms
// (default cap / 3, ≥ 120 ms). It never waits longer than the old sleep, so a page that never
// settles is measured exactly as before; on any page error it falls back to the rest of the fixed sleep.
function QUIET_PROBE(sel) {
  let busy = 0;
  // attribute / node changes made by scripts (rAF tweens, sliders, lazy loaders) count as movement too
  if (!window.__qaMut) { window.__qaMut = { n: 0 }; try { new MutationObserver(l => { window.__qaMut.n += l.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'open', 'hidden', 'aria-expanded', 'aria-hidden', 'src', 'srcset'] }); } catch (e) { } busy++; }
  try { for (const an of document.getAnimations()) { if (an.playState !== 'running') continue; const t = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming() : null; if (t && Number.isFinite(t.endTime)) busy++; } } catch (e) { busy++; }
  try { for (const im of document.images) { if (im.complete) continue; const r = im.getBoundingClientRect(); if (r.width > 0 && r.bottom > 0 && r.top < innerHeight) busy++; } } catch (e) { }
  const de = document.documentElement; let sig = [de.scrollHeight, de.scrollWidth, Math.round(scrollX), Math.round(scrollY), window.__qaMut.n].join(',');
  for (const s of [].concat(sel || [])) {
    let e = null; try { e = document.querySelector(s); } catch (x) { }
    if (!e) { sig += '|-'; continue; }
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    sig += '|' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + '|' + [c.color, c.backgroundColor, c.opacity, c.transform, c.boxShadow, c.borderTopColor, c.textDecorationColor, c.visibility, c.display].join(';');
  }
  return { busy, sig };
}
async function quiet(page, cap, o) {
  o = o || {}; const t0 = Date.now(); const need = o.quiet || Math.max(120, Math.round(cap / 3));
  let last = null, since = t0;
  for (;;) {
    let cur = null;
    try {
      const q = await ev(page, QUIET_PROBE, o.sel || null, cap + 2000);
      if (!q.busy) cur = q.sig + (o.sig ? '#' + await ev(page, o.sig, o.arg, cap + 2000) : '');
    } catch (e) { const left = cap - (Date.now() - t0); if (left > 0) await page.waitForTimeout(left).catch(() => { }); tAdd('quiet waits', Date.now() - t0); return; }
    const t = Date.now();
    if (cur === null || cur !== last) { last = cur; since = t; }
    else if (t - since >= need) { tAdd('quiet waits', t - t0); tAdd('quiet waits: saved vs fixed sleeps', Math.max(0, cap - (t - t0))); return; }
    if (t - t0 >= cap) { tAdd('quiet waits', t - t0); return; }
    await page.waitForTimeout(Math.min(40, Math.max(1, cap - (t - t0))));
  }
}
// burger panels and overlays may be moved by scripts without CSS transitions: a longer quiet window (cap / 2)
const qb = (page, cap) => quiet(page, cap, { quiet: Math.max(150, Math.round(cap / 2)), sel: ['[data-qa-burger]'] });
const toTop = async page => { await ev(page, () => window.scrollTo({ top: 0, behavior: 'instant' }), null, 10000).catch(() => { }); await quiet(page, 350); };
const shot = async (target, file, opts) => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); await target.screenshot(Object.assign({ path: file, timeout: 15000 }, opts || {})); return path.relative(OUT, file).split(path.sep).join('/'); } catch (e) { return null; } };
const SHOTS = path.join(OUT, 'shots');
// decisions + private flags handed to the page functions (STATIC, STRUCT_SCAN)
const DECP = Object.assign({}, DEC, {
  _burgerSel: cfg.selectors.burger, _logoSel: cfg.selectors.logo,
  _sel: { header: (cfg._explicitSelectors && cfg._explicitSelectors.has('header')) ? cfg.selectors.header : null, main: (cfg._explicitSelectors && cfg._explicitSelectors.has('main')) ? cfg.selectors.main : null, footer: (cfg._explicitSelectors && cfg._explicitSelectors.has('footer')) ? cfg.selectors.footer : null },
  _sectionSel: cfg.selectors.section || null, _honeypotSel: cfg.selectors.honeypot || null,
  _placeholderList: ['lorem ipsum', 'your text here', 'your title here', 'your heading here', 'add your text', 'card title', 'sample text', 'insert text', '[your-'].filter(x => !(DEC.declaredPlaceholders || []).map(s => String(s).toLowerCase()).includes(x)),
  donor: Array.isArray(DEC.donor) ? DEC.donor : null,
});

// ------------------------------------------------------------------------------------------------ in-page helpers (self-contained)
// Records which elements got pointer / key listeners, so LINK-13 can tell a handled <button> from a dead one.
function LISTEN_HOOK() {
  try {
    if (window.__qaL) return; const m = window.__qaL = new WeakMap();
    const K = /^(click|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend|keydown|keyup|submit)$/;
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opt) { try { if (K.test(type)) { const s = m.get(this) || new Set(); s.add(type); m.set(this, s); } } catch (e) { } return orig.call(this, type, fn, opt); };
  } catch (e) { }
}
function BTN_HANDLERS() {
  const m = window.__qaL; const out = {}; const roots = [document, window, document.documentElement, document.body];
  const rootHas = !!m && roots.some(r => r && m.has(r));
  document.querySelectorAll('[data-qa-btn]').forEach(b => {
    let kind = 'none';
    if (b.onclick || b.hasAttribute('onclick') || (m && m.has(b))) kind = 'own';
    else for (let p = b.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.hasAttribute('onclick')) { kind = 'ancestor'; break; }
      if (m && m.has(p)) { kind = p.querySelectorAll('*').length > 300 ? 'delegated' : 'ancestor'; break; }
    }
    if (kind === 'none' && rootHas) kind = 'delegated';
    out[b.getAttribute('data-qa-btn')] = kind;
  });
  return { hook: !!m, kinds: out };
}

// FORM-12: which visible forms have a submit listener (own, ancestor or page-wide)
function FORM_DEST() {
  const m = window.__qaL; const roots = [document, window, document.documentElement, document.body];
  const vis = f => { if (!f.getClientRects().length) return false; const c = getComputedStyle(f); const r = f.getBoundingClientRect(); return c.visibility !== 'hidden' && +c.opacity !== 0 && r.width > 0 && r.height > 0; };
  return [...document.forms].filter(vis).map(f => {
    if (f.onsubmit || f.hasAttribute('onsubmit')) return true; if (!m) return null;
    for (let p = f; p; p = p.parentElement) { const s = m.get(p); if (s && s.has('submit')) return true; }
    return roots.some(r => r && m.has(r) && m.get(r).has('submit'));
  });
}

// ------------------------------------------------------------------------------------------------ state
const STAT = { chromium: {}, webkit: {}, firefox: {}, msedge: {} }; // engine → "page@width" → STATIC result | { fail }
const ASSETS = new Map();      // url → { type, mime, bytes (decoded), enc, status, pages: Set }
const GATED = new Map();       // page → gate found on that page only (post password form)
let PLAN = null, INFO = null, PLATFORM = null, RUN = null;
let HOME_SERVER = null;        // { status, headers, text } of the home page as the server sends it
let PROBE = null;              // 404 probe path
const PROG = { phase: 'start', done: 0, total: 0, at: 0 };
function progress(phase, done, total, force) {
  PROG.phase = phase; PROG.done = done; PROG.total = total;
  if (!force && Date.now() - PROG.at < 5000) return; PROG.at = Date.now();
  try { L.writeJsonAtomic(path.join(OUT, 'progress.json'), { tool: 'qa-run', phase, done, total, elapsedMin: +((Date.now() - T0) / 60000).toFixed(1), budgetMinutes: cfg.budgetMinutes, steps: TIME.steps.map(x => ({ id: x.id, label: x.label, sec: Math.round(x.ms / 1000), why: x.why })), at: new Date().toISOString() }); } catch (e) { }
}
function addAsset(r, p) {
  if (!r || !r.url || /^data:|^blob:/.test(r.url)) return;
  const k = r.url.split('#')[0]; const x = ASSETS.get(k) || { type: r.type, mime: r.mime, bytes: 0, enc: 0, status: r.status, pages: new Set() };
  x.bytes = Math.max(x.bytes, r.dec || 0); x.enc = Math.max(x.enc, r.enc || 0); x.pages.add(p); if (!x.mime) x.mime = r.mime; ASSETS.set(k, x);
}
const HDR_KEEP = ['content-type', 'x-robots-tag', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'x-frame-options', 'content-security-policy', 'permissions-policy', 'cache-control', 'server', 'x-powered-by'];
const pickHeaders = h => { const o = {}; for (const k of HDR_KEEP) if (h && h[k] !== undefined) o[k] = String(h[k]).slice(0, 400); return o; };

// ------------------------------------------------------------------------------------------------ abort (nothing can be measured)
let STOPPED = null;
async function abortAll(why, extra) {
  log('qa-run stopped: ' + why); STOPPED = why;
  for (const id of MINE) if (!tested(id)) NR(id, why);
  if (extra) extra();
  await finish(L.EXIT_NOT_RUN);
}

// ------------------------------------------------------------------------------------------------ preflight: browser, base, gate, inventory
async function preflight() {
  progress('preflight', 0, 1, true);
  let s;
  try { s = await open('chromium', REF.desktop); }
  catch (e) { return abortAll(`Chromium did not start: ${errMsg(e)}`); }
  try {
    const rb = await L.resolveBase(cfg, { ctx: s.ctx }).catch(e => ({ error: errMsg(e) }));
    if (rb.note) NOTE('RUN-06', rb.note);
    if (rb.offsite) { await s.close(); return abortAll(`${rb.note} — ${L.GATE_ROUTE}`); }
    PROBE = L.probe404Path(cfg);
    let probeFp = null;
    try { await go(s.page, PROBE, { settle: 300 }); probeFp = await L.pageFingerprint(s.page); } catch (e) { /* judged in the static pass (PAGE-02) */ }
    let nav;
    try { nav = await go(s.page, '/'); }
    catch (e) {
      await s.close();
      if (e && e.blocked) return abortAll(errMsg(e));
      return abortAll(`the home page ${cfg.base}/ did not load: ${errMsg(e)} — check "base" and that the site is reachable from this machine (VPN, proxy, firewall), or run where it is`);
    }
    const gate = await L.detectGate(s.page, nav.resp, cfg.base, { probe: probeFp });
    const auth = L.authOpts(cfg, a);
    if (gate && !gate.page && !(gate.weak && (auth.storageState || auth.httpCredentials))) {
      await s.close();
      return abortAll(`access gate: ${gate.type} (${gate.evidence})${auth.storageState || auth.httpCredentials ? ' — the saved session did not open it' : ''} — ${L.GATE_ROUTE}`, () => NOTE('RUN-06', `gate ${gate.type}: ${gate.evidence}`));
    }
    if (gate && gate.page) GATED.set('/', gate);
    T('RUN-06'); NOTE('RUN-06', `${cfg.base}/ answered ${nav.status}${auth.storageState ? ' through the saved session ' + path.basename(auth.storageState) : ''}${auth.httpCredentials ? ' with basic auth from QA_HTTP_USER' : ''}; no site-wide gate${gate && gate.page ? ' (the home page itself is password-protected: ' + gate.evidence + ')' : ''}`);
    // the home page as the server sends it (platform markers, share preview, X-Robots-Tag)
    const h = await L.getUrl(cfg.base + '/', { cfg, page: s.page, ctx: s.ctx, fallbackToNode: true });
    HOME_SERVER = { status: h.status, headers: h.headers || {}, text: h.text || '', via: h.via };
    // inventory and plan
    progress('inventory', 0, 1, true);
    INFO = await L.discoverPagesInfo(cfg, { page: s.page, ctx: s.ctx });
    PLAN = await L.planPages(cfg, INFO, { full: FULL, page: s.page, ctx: s.ctx });
  } finally { if (s) await s.close(); }
}

// ------------------------------------------------------------------------------------------------ static pass
// Per engine × page × width: load, lazy-image check before scrolling, scroll through (lazy content, reveals),
// video metadata, stuck-animation sampling, STATIC, contrast, CSS sources, button handlers, screenshots, bytes.
async function stuckPass(page, cands, w) {
  const H = vh(w); const seen = {};
  const ys = sortNum(uniq(cands.map(c => Math.max(0, c.y - Math.round(H * 0.3))))); let last = -1e9;
  for (const y of ys) {
    if (y - last < H * 0.3) continue; last = y;
    await ev(page, t => window.scrollTo({ top: t, behavior: 'instant' }), y, 10000).catch(() => { });
    await page.waitForTimeout(900);
    const r = await ev(page, M.STUCK_SAMPLE, null, 10000).catch(() => ({}));
    for (const [i, v] of Object.entries(r)) if (!(i in seen) || v.op > seen[i].op) seen[i] = v;
    if (late()) break;
  }
  const checked = cands.filter(c => seen[c.i]);
  return { checked: checked.length, stuck: checked.filter(c => seen[c.i].op < 0.99).map(c => ({ sel: seen[c.i].sel, op: seen[c.i].op, ev: c.ev, y: c.y })) };
}
async function measure(engine, p, w, kind) {
  const key = `${p}@${w}`; const store = STAT[engine];
  if (late()) { store[key] = { fail: BUDGET_WHY, budget: true }; return; }
  let s; try { s = await open(engine, w); } catch (e) { store[key] = { fail: 'browser: ' + errMsg(e), launch: true }; return; }
  try { await s.ctx.addInitScript(LISTEN_HOOK); } catch (e) { }
  const chrome = engine === 'chromium';
  const refW = [REF.desktop, REF.tablet, REF.mobile].includes(w);
  let bytes = 0; const reqs = new Map();
  if (chrome) {
    try {
      const cdp = await s.ctx.newCDPSession(s.page); await cdp.send('Network.enable');
      cdp.on('Network.responseReceived', e => { reqs.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, status: e.response.status, dec: 0, enc: 0 }); });
      cdp.on('Network.dataReceived', e => { const r = reqs.get(e.requestId); if (r) r.dec += e.dataLength; });
      cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; const r = reqs.get(e.requestId); if (r) r.enc = e.encodedDataLength; });
    } catch (e) { /* bytes stay 0 → PERF-02 / IMG-07 record the gap */ }
  }
  try {
    const nav = await timed(`page load ${engine}`, () => go(s.page, p));
    const gate = p === PROBE ? null : await L.detectGate(s.page, nav.resp, cfg.base, {}).catch(() => null);
    if (gate) { store[key] = { fail: `password / sign-in gate on this page: ${gate.type} (${gate.evidence})`, gate }; GATED.set(p, gate); return; }
    const base = { status: nav.status, finalUrl: s.page.url(), challenge: nav.info.challenge || null, settle: nav.info.settle || null };
    if (kind === 'weight') { await scrollThrough(s.page, engine, w); await s.page.waitForTimeout(800); store[key] = Object.assign(base, { weightOnly: true, bytes }); return; }
    const pre = await ev(s.page, M.PRELOAD, null, 15000).catch(() => []);
    const doStuck = (chrome && (w === REF.desktop || w === REF.mobile)) || ((engine === 'webkit' || engine === 'firefox') && w === REF.desktop);
    const cands = doStuck ? await ev(s.page, M.STUCK_CANDIDATES, null, 20000).catch(() => []) : [];
    await timed(`static ${engine}: scroll through`, () => scrollThrough(s.page, engine, w));
    if (chrome && (w === REF.desktop || w === REF.mobile) && kind !== 'content') await ev(s.page, M.VIDEO_META, 8000, 120000).catch(() => 0);
    const stuck = doStuck && cands.length ? await timed(`static ${engine}: stuck-animation sampling`, () => stuckPass(s.page, cands, w)) : { checked: 0, stuck: [] };
    await toTop(s.page);
    const st = await timed(`static ${engine}: STATIC measure`, () => ev(s.page, M.STATIC, Object.assign({}, DECP, { __full: chrome, __desk: chrome && w === REF.desktop }), 150000));
    Object.assign(st, base, { preLazy: pre, stuck: stuck.stuck, stuckChecked: stuck.checked, stuckCands: cands.length, stuckDone: doStuck });
    if (chrome && refW) { await ev(s.page, M.COLOR_KIT, null, 10000).catch(() => { }); st.contrast = await timed('static chromium: contrast', () => ev(s.page, M.CONTRAST, {}, 150000).catch(e => ({ error: errMsg(e) }))); }
    if (chrome && w === REF.desktop) {
      st.headers = pickHeaders(nav.headers);
      st.cssSources = await ev(s.page, M.CSS_SOURCES, null, 20000).catch(() => []);
      st.btnHandlers = await ev(s.page, BTN_HANDLERS, null, 20000).catch(() => null);
      st.formDest = await ev(s.page, FORM_DEST, null, 20000).catch(() => null);
    }
    if (chrome) { for (const [key, dir] of [['rails', 'rail'], ['linkGaps', 'linkgap']]) for (const [i, x] of (st[key] || []).slice(0, 4).entries()) { try { const loc = s.page.locator(x.sel).first(); await loc.scrollIntoViewIfNeeded({ timeout: 5000 }); x.shot = await shot(loc, path.join(SHOTS, dir, `${slug(p)}-${w}-${i}.png`)); } catch (e) { } } }
    if (chrome && (st.rowGaps || []).length) { for (const [i, x] of st.rowGaps.slice(0, 6).entries()) { try { const loc = s.page.locator(x.sel).first(); await loc.scrollIntoViewIfNeeded({ timeout: 5000 }); x.shot = await shot(loc, path.join(SHOTS, 'rowgap', `${slug(p)}-${w}-${i}.png`)); } catch (e) { } } }
    if (chrome && refW && kind !== 'content') st.shot = await timed('screenshots', () => shot(s.page, path.join(SHOTS, 'pages', `${slug(p)}-${w}.jpg`), { fullPage: true, type: 'jpeg', quality: 55 }));
    if (chrome) { await s.page.waitForTimeout(250); st.bytes = bytes; for (const r of reqs.values()) addAsset(r, p); }
    if (!(chrome && w === REF.desktop)) { delete st.text; delete st.hiddenText; delete st.copy; delete st.attrTexts; delete st.tokenVals; }
    st.net = s.net;
    store[key] = st;
  } catch (e) {
    store[key] = { fail: e && e.blocked ? errMsg(e) : `did not load or measure: ${errMsg(e)}`, blocked: !!(e && e.blocked) };
  } finally { await s.close(); }
}
async function pool(jobs, conc, fn, label) {
  let i = 0, done = 0; const n = jobs.length;
  const worker = async () => { while (i < n) { const j = jobs[i++]; await fn(j); done++; progress(label, done, n); if (cfg.throttleMs) await wait(cfg.throttleMs); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(conc, n)) }, worker));
  progress(label, n, n, true);
}
// WebKit / Firefox widths: the anchor tiers by default (1440 · 768 · 360); "xbWidths": "all" adds every project tier below
// 768, a list sets them. Tiers left out are measured in Chromium only — recorded in RUN-04 and XB-01 (never silent).
const XB_WIDTHS = () => (QUICK ? [REF.desktop, REF.mobile] : Array.isArray(cfg.xbWidths) && cfg.xbWidths.length ? uniq([REF.desktop].concat(cfg.xbWidths)) : cfg.xbWidths === 'all' ? uniq([REF.desktop, REF.tablet].concat(cfg.widths.filter(w => w < 768))) : [REF.desktop, REF.tablet, REF.mobile]).sort((x, y) => y - x);
const XB_CUT = () => uniq([REF.desktop, REF.tablet].concat(cfg.widths.filter(w => w < 768))).filter(w => !XB_WIDTHS().includes(w)).sort((x, y) => y - x); // vs "all"
let HS_WIDTHS = 0, LINK_WHY = '';
function staticWhy(engine) {
  const j = STATIC_JOBS[engine]; if (!j) return ENGINE_FAIL[engine] ? 'did not start: ' + ENGINE_FAIL[engine] : '';
  const k = Object.entries(j.kinds).map(([x, n]) => `${n} ${x}`).join(' + ');
  const cut = Object.values(STAT[engine] || {}).filter(x => x && x.budget).length;
  return `${j.loads} loads (${k}) · ${j.pages} pages × widths ${j.widths.join('/')} · ${cfg.concurrency} at a time${cut ? ` · ${cut} load(s) cut by the time budget (RUN-04)` : ''}`;
}
function interactWhy(engine, pages, widths) {
  const pre = `interact ${engine} `; const runs = Object.keys(TIME.acc).filter(k => k.startsWith(pre));
  const n = runs.reduce((t, k) => t + TIME.acc[k].n, 0);
  const top = runs.map(k => [k.slice(pre.length), TIME.acc[k]]).sort((x, y) => y[1].ms - x[1].ms).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v.ms / 1000)} s`).join(', ');
  const cut = CUT.filter(x => x.startsWith(engine + ' ')).length;
  return `${engine}: ${pages} pages × ${widths.length} widths (${widths.join('/')}) → ${n} phase runs, each a fresh load, ${cfg.interactConcurrency} at a time${top ? ' · most: ' + top : ''}${cut ? ` · ${cut} phase run(s) cut by the time budget (RUN-04)` : ''}`;
}
const STATIC_JOBS = {}; // engine → { loads, pages, widths, kinds } (the "why" of the time table)
async function staticPass(engine) {
  const jobs = [];
  if (engine === 'chromium') {
    for (const p of PLAN.sampled) for (const w of cfg.widths) jobs.push([p, w, 'heavy']);
    // pages outside the template sample: the content pass at desktop and phone width (layout, text, links, SEO, images)
    for (const p of PLAN.all) if (!PLAN.sampled.includes(p)) jobs.push([p, REF.desktop, 'content'], [p, REF.mobile, 'content']);
    jobs.push([PROBE, REF.desktop, 'probe'], [PROBE, REF.mobile, 'probe']);
    const wt = +DEC.pageWeightTier || REF.mobile;
    if (!cfg.widths.includes(wt)) for (const p of PLAN.sampled) jobs.push([p, wt, 'weight']);
  } else if (engine === 'msedge') {
    for (const p of PLAN.sampled.slice(0, QUICK ? 2 : 5)) for (const w of [REF.desktop, REF.mobile]) jobs.push([p, w, 'heavy']);
  } else {
    for (const p of PLAN.sampled) for (const w of XB_WIDTHS()) jobs.push([p, w, 'heavy']);
  }
  log(`${engine}: static pass — ${jobs.length} page × width loads`);
  const kinds = {}; for (const j of jobs) kinds[j[2]] = (kinds[j[2]] || 0) + 1;
  STATIC_JOBS[engine] = { loads: jobs.length, pages: uniq(jobs.map(j => j[0]).filter(p => p !== PROBE)).length, widths: uniq(jobs.map(j => j[1])).sort((x, y) => y - x), kinds };
  await pool(jobs, cfg.concurrency, ([p, w, k]) => timed(`static ${engine} ${k} load`, () => measure(engine, p, w, k)), `static ${engine}`);
  const fails = Object.values(STAT[engine]).filter(x => x.launch).length;
  if (fails && fails === jobs.length) ENGINE_FAIL[engine] = ENGINE_FAIL[engine] || 'browser did not start';
}

// ------------------------------------------------------------------------------------------------ NAV-10 header sweep
async function headerSweep() {
  const top = Math.max.apply(null, cfg.widths); const set = new Set([REF.mobile]);
  for (let x = top; x >= REF.mobile; x -= 16) set.add(x);
  for (const w of cfg.widths) { set.add(w); if (w - 1 >= REF.mobile) set.add(w - 1); }
  const list = [...set].sort((x, y) => y - x); const res = []; HS_WIDTHS = list.length;
  const home = PLAN.sampled[0] || '/';
  let s; try { s = await open('chromium', top); } catch (e) { NR('NAV-10', 'header sweep: ' + errMsg(e)); return res; }
  try {
    await go(s.page, home);
    for (const w of list) {
      if (late()) { NR('NAV-10', `partial: header sweep stopped at ${w}px — ${BUDGET_WHY}`); break; }
      await s.page.setViewportSize({ width: w, height: vh(w) }); await quiet(s.page, 300);
      await ev(s.page, M.STATIC, Object.assign({}, DECP, { __mode: 'regions' }), 20000).catch(() => null);
      const h = await ev(s.page, M.HEADER_PROBE, cfg.selectors.burger, 20000).catch(e => ({ error: errMsg(e) }));
      res.push(Object.assign({ w }, h));
    }
  } catch (e) { NR('NAV-10', `header sweep failed on ${home}: ${errMsg(e)}`); }
  finally { await s.close(); }
  return res;
}

// ------------------------------------------------------------------------------------------------ interactions
// Every phase gets a fresh context and a fresh load (no state leaks between phases; the first hover after load is
// measured). Chromium runs every phase; WebKit and Firefox run the "lite" phases that XB-08, NAV-13, FORM-10/11 and
// I18N-03 need. Results of Chromium are kept to compare the other engines against.
const IX = {
  hoverSeen: new Set(), ddSeen: new Set(), navSeen: new Set(), logoSeen: new Set(),
  chromeToggle: {},        // "page@w|toggle key" → true when it changed state in Chromium
  chromeBurger: {},        // "page@w" → { open, close }
  chromeHover: {},         // "page@w|sig" → changed
  ddLinks: {},             // desktop dropdown parent text → { href, links: [hrefs] }
  desktopTop: null,        // { items, ctas } header top-level counts at 1440
  hoverReveal: {},         // page → [{ path, what }] hover-only affordances seen on desktop
  ink: {},                 // "page@w|field" → { top, bottom } Chromium baseline (FORM-10)
};
const headerPages = () => PLAN.sampled.slice(0, 3);
const statOf = (p, w, engine) => { const s = STAT[engine || 'chromium'][`${p}@${w}`]; return s && !s.fail ? s : null; };
async function click(page, loc, touch, opts) {
  if (touch) { try { await loc.tap(Object.assign({ timeout: 3000 }, opts || {})); return true; } catch (e) { /* fall back to a click */ } }
  await loc.click(Object.assign({ timeout: 3000 }, opts || {})); return true;
}
async function pointAt(page, x, y, touch) { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
const parkMouse = async (page, w) => { try { await page.mouse.move(Math.max(1, w - 3), Math.max(1, vh(w) - 3)); } catch (e) { } };
function collectJs(s, p, w, phase) {
  const k = `${s.engine}|${p}|${w}|${phase}`; JSLOG.set(k, { engine: s.engine, p, w, phase, net: s.net });
}
const JSLOG = new Map();
// interaction pages never run STATIC, so tag header / main / footer the same way before any helper reads them
const tagRegions = page => ev(page, M.STATIC, Object.assign({}, DECP, { __mode: 'regions' }), 20000).catch(() => null);
// a marker on the loaded document: gone after any reload or navigation (same URL included)
const markDoc = page => ev(page, () => { window.__qaDoc = 1; return true; }, null, 5000).catch(() => false);
async function docChanged(page) { try { return !(await ev(page, () => window.__qaDoc === 1, null, 5000)); } catch (e) { return true; } }
async function reGo(page, p) { await go(page, p, { settle: 300 }); await tagRegions(page); await markDoc(page); }

// tags toggles in main (never inside forms, never real links)
function TOGGLES(max) {
  document.querySelectorAll('[data-qa-tg]').forEach(e => e.removeAttribute('data-qa-tg'));
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const main = document.querySelector('[data-qa-region=main]') || document.querySelector('main') || document.body;
  const S = '[aria-expanded], [role=tab], summary, [aria-controls], [class*=faq i] button, [class*=faq i] [class*=question i], [class*=accordion i] button, [class*=accordion i] [class*=title i], [class*=accordion i] [class*=header i], [class*=tabs i] button, [class*=tab-nav i] button, button[class*=tab i], [data-toggle=collapse], [data-bs-toggle=collapse], [data-bs-toggle=tab], .w-tab-link';
  const out = []; const tagged = [];
  for (const e of main.querySelectorAll(S)) {
    if (out.length >= max) break;
    if (!vis(e) || e.closest('[data-qa-region=header],[data-qa-region=footer],form,[aria-hidden=true]')) continue;
    if (e.matches('a[href]:not([href^="#"]):not([href=""])') || e.closest('a[href]:not([href^="#"]):not([href=""])')) continue;
    if (tagged.some(o => o.contains(e) || e.contains(o))) continue;
    tagged.push(e);
    const cl = (e.className && e.className.toString()) || '';
    const kind = e.matches('[role=tab],.w-tab-link,[data-bs-toggle=tab]') || /(^|[\s_-])tabs?([\s_-]|$)/i.test(cl) || /(^|[\s_-])tabs?([\s_-]|$)/i.test((e.parentElement && e.parentElement.className.toString()) || '') ? 'tab' : e.matches('summary') ? 'faq' : e.closest('[class*=faq i],[class*=accordion i],details') ? 'faq' : 'toggle';
    // the tab already shown: clicking it is not expected to change anything (ARIA, Webflow, or a plain active class)
    const selected = e.getAttribute('aria-selected') === 'true' || e.classList.contains('w--current') || e.classList.contains('w--tab-active') || (kind === 'tab' && /(^|\s)(is-active|active|is-selected|selected|is-current|current)(\s|$)/.test(cl));
    const i = out.length; e.setAttribute('data-qa-tg', i);
    out.push({ i, kind, selected, text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40), sel: e.tagName.toLowerCase() + '.' + ((cl.trim().split(/\s+/)[0]) || '') });
  }
  return out;
}
function TOGGLE_STATE(i) {
  const e = document.querySelector(`[data-qa-tg="${i}"]`); if (!e) return null;
  const id = (e.getAttribute('aria-controls') || '').split(/\s+/)[0]; const ctl = id && document.getElementById(id);
  const nx = ctl || (e.matches('summary') ? e.parentElement : null) || e.nextElementSibling || (e.parentElement && e.parentElement.nextElementSibling);
  const host = e.closest('details,[class*=item i],li') || e.parentElement;
  const box = x => { if (!x) return null; const r = x.getBoundingClientRect(), c = getComputedStyle(x); return [Math.round(r.height), c.display, c.visibility, Math.round(+c.opacity * 100)].join(','); };
  const d = e.closest('details');
  if (nx && !nx.hasAttribute('data-qa-rev')) { document.querySelectorAll('[data-qa-rev]').forEach(x => x.removeAttribute('data-qa-rev')); nx.setAttribute('data-qa-rev', i); }
  return JSON.stringify([e.getAttribute('aria-expanded'), e.getAttribute('aria-selected'), String(e.className), d ? d.open : null, box(nx), box(host), document.querySelectorAll('[aria-expanded=true],[aria-selected=true],details[open],.w--open,.w--tab-active').length]);
}
function ROW_POINTS(sel) { // left / centre / right of a row at its vertical middle (FAQ rows, NAV-13 at 3 points)
  const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = e.getBoundingClientRect(); const y = r.top + r.height / 2;
  return [['left', r.left + Math.min(8, r.width / 4)], ['centre', r.left + r.width / 2], ['right', r.right - Math.min(8, r.width / 4)]].map(([n, x]) => ({ n, x: Math.round(x), y: Math.round(y) }));
}
async function phaseToggles(s, p, w, lite) {
  const { page, engine } = s; const touch = w < 768; const W = where(p, w, engine);
  const list = await ev(page, TOGGLES, 40);
  if (list.length >= 40) { NR('INT-01', `partial: element cap 40 toggles reached on ${W}`); }
  const tabW = {}; let faqRows = 0;
  // INT-02 baseline: the page as loaded (whole document, one cheap layout pass). What was already clipped / near an
  // edge / scrolling sideways before any toggle is reported by the static pass (LAY-*), not again after every click.
  const base0 = lite || !list.length ? null : await ev(page, M.STATIC, Object.assign({}, DECP, { __mode: 'layout' }), 30000).catch(() => null);
  const preKey = x => `${x.sel}|${x.text}`;
  const pre = base0 ? new Set([].concat(base0.clipped || [], base0.edges || []).map(preKey)) : new Set();
  for (const t of list) {
    if (t.selected) continue;
    const loc = page.locator(`[data-qa-tg="${t.i}"]`); const tkey = `${p}@${w}|${t.kind}|${t.text}|${t.sel}`;
    const before = await ev(page, TOGGLE_STATE, t.i).catch(() => null);
    try { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }); await click(page, loc, touch); }
    catch (e) { const cov = L.coveredBy(e); Q(lite ? 'XB-08' : 'INT-01', { where: W, el: t.text || t.sel, why: cov ? `covered by ${cov}` : 'could not be clicked: ' + errMsg(e) }); continue; }
    await quiet(page, 650, { sel: [`[data-qa-tg="${t.i}"]`, `[data-qa-rev="${t.i}"]`] });
    if ((await docChanged(page))) { await reGo(page, p); await ev(page, TOGGLES, 40); continue; }
    const after = await ev(page, TOGGLE_STATE, t.i).catch(() => null);
    if (before !== null && after === null) { await reGo(page, p); await ev(page, TOGGLES, 40); continue; } // reloaded: not judged
    const changed = !!(before && after && before !== after);
    if (!lite) {
      T('INT-01'); IX.chromeToggle[tkey] = changed;
      if (!changed) F('INT-01', { where: W, el: t.text || t.sel, kind: t.kind, why: 'click/tap changes nothing (aria state, class, panel height or visibility)' });
      else {
        // INT-02: measure what became visible
        const lay = await ev(page, M.STATIC, Object.assign({}, DECP, { __mode: 'layout', __root: `[data-qa-rev="${t.i}"]` }), 30000).catch(() => null);
        if (lay) {
          T('INT-02');
          for (const x of lay.clipped || []) if (!pre.has(preKey(x))) F('INT-02', { where: W, after: t.text || t.sel, el: x.sel, text: x.text, why: `clipped by the viewport (left ${x.left}, right ${x.right})` });
          for (const x of lay.edges || []) if (!pre.has(preKey(x))) F('INT-02', { where: W, after: t.text || t.sel, el: x.sel, text: x.text, why: `text ${Math.min(x.L, x.R)}px from the viewport edge` });
          const ox0 = base0 ? Math.max(0, base0.overflowX || 0) : 0;
          if (lay.overflowX > ox0) F('INT-02', { where: W, after: t.text || t.sel, why: `horizontal scroll ${lay.overflowX}px after opening${ox0 ? ` (${ox0}px before)` : ''}` });
        }
        if (t.kind === 'tab') { const tp = await loc.evaluate(M.TAB_PROBE).catch(() => null); if (tp && tp.group !== null) (tabW[tp.group] = tabW[tp.group] || {})[t.text || t.sel] = tp.widths; }
      }
    } else {
      T('XB-08'); const c = IX.chromeToggle[tkey];
      if (c === true && !changed) F('XB-08', { where: W, el: t.text || t.sel, why: `changes state in Chromium, not in ${engine}` });
      else if (c === undefined && !changed) Q('XB-08', { where: W, el: t.text || t.sel, why: `no state change in ${engine}; no Chromium result for this toggle` });
    }
    // NAV-13: FAQ / accordion rows toggle from their left, centre and right (3 points)
    if (changed && t.kind === 'faq' && faqRows < 8) {
      faqRows++;
      // restore the closed state first
      try { await click(page, loc, touch); await quiet(page, 500, { sel: [`[data-qa-tg="${t.i}"]`, `[data-qa-rev="${t.i}"]`] }); } catch (e) { }
      const pts = await ev(page, ROW_POINTS, `[data-qa-tg="${t.i}"]`).catch(() => null);
      for (const pt of pts || []) {
        const b0 = await ev(page, TOGGLE_STATE, t.i).catch(() => null);
        try { await pointAt(page, pt.x, pt.y, touch); } catch (e) { continue; }
        await quiet(page, 550, { sel: [`[data-qa-tg="${t.i}"]`, `[data-qa-rev="${t.i}"]`] });
        if ((await docChanged(page))) { F('NAV-13', { where: W, row: t.text, point: pt.n, why: 'this point of the row navigates instead of toggling' }); await reGo(page, p); await ev(page, TOGGLES, 40); break; }
        const b1 = await ev(page, TOGGLE_STATE, t.i).catch(() => null);
        T('NAV-13');
        if (b0 === b1) F('NAV-13', { where: W, row: t.text, point: pt.n, why: `the ${pt.n} of the row does not toggle it` });
        else { try { await pointAt(page, pt.x, pt.y, touch); await quiet(page, 450, { sel: [`[data-qa-tg="${t.i}"]`, `[data-qa-rev="${t.i}"]`] }); } catch (e) { } }
      }
    }
  }
  if (!lite) {
    for (const [g, tabs] of Object.entries(tabW)) {
      const firsts = Object.entries(tabs).filter(([, ws]) => ws.length).map(([k, ws]) => [k, ws[0]]);
      if (firsts.length < 2) continue; T('LAY-06');
      const vals = firsts.map(x => x[1]); if (Math.max.apply(null, vals) - Math.min.apply(null, vals) > 2) F('LAY-06', { where: W, group: g, widths: Object.fromEntries(firsts), why: 'cards differ in width between tabs/filters of one component' });
    }
    if (faqRows >= 8) NR('NAV-13', `partial: FAQ rows capped at 8 on ${W}`);
  }
  return list.length;
}

// ---------------------------------------------------------------- sliders (INT-03, INT-04, INT-09, INT-10)
async function sigSeries(page, i, ms, step) { const out = []; for (let t = 0; t <= ms; t += step) { out.push(await ev(page, M.SLIDER_SIG, i).catch(() => '')); if (t < ms) await page.waitForTimeout(step); } return out; }
const moving = series => new Set(series).size > 1;
async function swipe(s, i, dir) {
  const { page, engine } = s;
  const pt = await ev(page, M.SLIDER_TAP_POINT, i).catch(() => null); if (!pt) return null;
  const x0 = pt.left + pt.w * (dir < 0 ? 0.8 : 0.2), x1 = pt.left + pt.w * (dir < 0 ? 0.2 : 0.8), y = pt.y;
  if (engine === 'chromium') {
    const cdp = await s.ctx.newCDPSession(page);
    const tp = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }] });
    await tp('touchStart', x0); for (let k = 1; k <= 8; k++) { await tp('touchMove', x0 + (x1 - x0) * k / 8); await page.waitForTimeout(16); } await tp('touchEnd', x1);
    await cdp.detach().catch(() => { });
    return 'touch';
  }
  await page.mouse.move(x0, y); await page.mouse.down(); await page.mouse.move(x1, y, { steps: 8 }); await page.mouse.up();
  return 'mouse';
}
async function phaseSliders(s, p, w) {
  const { page } = s; const W = where(p, w); const touch = w < 992; const phone = w < 768;
  const list = await ev(page, M.SLIDERS);
  for (const sl of list) {
    const name = sl.label || 'slider ' + sl.i;
    await page.locator(`[data-qa-host="${sl.i}"]`).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => { });
    await parkMouse(page, w); await page.waitForTimeout(300);
    const delay = Math.min(cfg.timing.sliderSampleMs || 7000, Math.max(3500, ((sl.decl && sl.decl.delay) || 3000) + 1200));
    const auto = sl.marquee || moving(await sigSeries(page, sl.i, delay, 700));
    // INT-04: autoplay / ticker must pause on interaction or have a working pause control
    if (auto) {
      T('INT-04'); const stops = {};
      if (phone || touch) {
        const pt = await ev(page, M.SLIDER_TAP_POINT, sl.i).catch(() => null);
        if (pt) { try { await page.touchscreen.tap(pt.x, pt.y); } catch (e) { await page.mouse.click(pt.x, pt.y).catch(() => { }); } stops.tap = !moving(await sigSeries(page, sl.i, 3500, 700)); }
      } else {
        try { await page.locator(`[data-qa-mask="${sl.i}"]`).first().hover({ timeout: 2000 }); stops.hover = !moving(await sigSeries(page, sl.i, 3500, 700)); } catch (e) { stops.hover = null; }
        await parkMouse(page, w);
        if (sl.focusable) { const ok = await ev(page, i => { const h = document.querySelector(`[data-qa-host="${i}"]`); const f = h && h.querySelector('a[href],button,[tabindex]:not([tabindex="-1"])'); if (!f) return false; f.focus({ preventScroll: true }); return document.activeElement === f; }, sl.i).catch(() => false); if (ok) stops.focus = !moving(await sigSeries(page, sl.i, 3500, 700)); }
        else stops.focus = false;
      }
      let pauseOk = null;
      if (sl.pause) { try { await page.locator(`[data-qa-pause="${sl.i}"]`).first().click({ timeout: 2000 }); await parkMouse(page, w); pauseOk = !moving(await sigSeries(page, sl.i, 3500, 700)); } catch (e) { pauseOk = false; } }
      const need = phone || touch ? ['tap'] : ['hover', 'focus'];
      const failed = need.filter(k => stops[k] !== true);
      if (failed.length && pauseOk !== true) F('INT-04', { where: W, slider: name, why: `keeps moving on ${failed.join(' and ')}${sl.pause ? ' and its pause control does not stop it' : ' and has no pause control'}` });
      if (pauseOk === true && failed.length) NOTE('INT-04', `${W} ${name}: stopped by its pause control (not by ${failed.join('/')})`);
      if (sl.hasNext) NR('INT-03', `partial: ${W} ${name} moves on its own — its arrows were not judged`);
      if (sl.dots >= 2) NR('INT-09', `partial: ${W} ${name} moves on its own — its bullets were not judged`);
      continue; // arrows / dots of a moving slider cannot be judged reliably
    }
    // INT-03: arrows
    if (sl.hasNext) {
      T('INT-03');
      const isDis = sel => ev(page, x => { const b = document.querySelector(x); if (!b) return null; const c = getComputedStyle(b); return !!(b.disabled || b.getAttribute('aria-disabled') === 'true' || +c.opacity < 0.5 || c.pointerEvents === 'none' || /(^|\s)(is-disabled|disabled|swiper-button-disabled|slick-disabled|splide__arrow--disabled|glide__arrow--disabled)(\s|$)/.test(b.className.toString()) || b.hidden); }, sel).catch(() => null);
      const start = await ev(page, M.SLIDER_SIG, sl.i);
      if (sl.hasPrev) {
        const pd = await isDis(`[data-qa-prev="${sl.i}"]`);
        if (pd === false) {
          try { await page.locator(`[data-qa-prev="${sl.i}"]`).first().click({ timeout: 2000 }); } catch (e) { }
          await quiet(page, 1100, { sig: M.SLIDER_SIG, arg: sl.i }); const back = await ev(page, M.SLIDER_SIG, sl.i);
          if (back === start && (!sl.decl || sl.decl.loop !== true)) F('INT-03', { where: W, slider: name, why: 'prev arrow looks active on the first slide but does nothing (non-looping slider)' });
          else if (back !== start && sl.decl && sl.decl.loop === false) F('INT-03', { where: W, slider: name, why: 'prev arrow active on the first slide of a non-looping slider' });
          if (back !== start) { try { await page.locator(`[data-qa-next="${sl.i}"]`).first().click({ timeout: 2000 }); await quiet(page, 1100, { sig: M.SLIDER_SIG, arg: sl.i }); } catch (e) { } }
        }
      }
      let last = await ev(page, M.SLIDER_SIG, sl.i), movedOnce = false; const first = last;
      for (let k = 0; k < Math.min(20, (sl.n || 6) + 2); k++) {
        if (await isDis(`[data-qa-next="${sl.i}"]`)) break;
        try { await page.locator(`[data-qa-next="${sl.i}"]`).first().click({ timeout: 2000 }); } catch (e) { const cov = L.coveredBy(e); F('INT-03', { where: W, slider: name, why: cov ? `next arrow covered by ${cov}` : 'next arrow cannot be clicked' }); break; }
        await quiet(page, 1100, { sig: M.SLIDER_SIG, arg: sl.i }); const cur = await ev(page, M.SLIDER_SIG, sl.i);
        if (cur === first && movedOnce) break; // looped back to the start
        if (cur === last) { F('INT-03', { where: W, slider: name, why: movedOnce ? 'last slide reached but the next arrow still looks active' : 'next arrow changes nothing' }); break; }
        movedOnce = true; last = cur;
      }
    }
    // INT-09: pagination bullets
    if (sl.dots >= 2) {
      T('INT-09');
      for (let k = 0; k < Math.min(sl.dots, 8); k++) {
        const before = await ev(page, M.SLIDER_SIG, sl.i); const act0 = await ev(page, M.SLIDER_ACTIVE_DOT, sl.i);
        if (act0 === k) continue;
        try { await page.locator(`[data-qa-dot="${sl.i}:${k}"]`).first().click({ timeout: 2000 }); } catch (e) { F('INT-09', { where: W, slider: name, bullet: k + 1, why: 'bullet cannot be clicked' }); continue; }
        await quiet(page, 1100, { sig: M.SLIDER_SIG, arg: sl.i });
        const after = await ev(page, M.SLIDER_SIG, sl.i); const act = await ev(page, M.SLIDER_ACTIVE_DOT, sl.i);
        if (after === before) F('INT-09', { where: W, slider: name, bullet: k + 1, why: 'bullet does not change the slide' });
        else if (act !== -1 && act !== k) F('INT-09', { where: W, slider: name, bullet: k + 1, why: `active bullet is ${act + 1} after clicking bullet ${k + 1}` });
      }
    }
    // INT-10: touch swipe at touch tiers; a desktop mouse drag is only an ask
    if (sl.n >= 2 || sl.hasNext || sl.dots >= 2) {
      const before = await ev(page, M.SLIDER_SIG, sl.i);
      const how = await swipe(s, sl.i, -1).catch(() => null);
      await quiet(page, 1100, { sig: M.SLIDER_SIG, arg: sl.i }); const after = await ev(page, M.SLIDER_SIG, sl.i);
      if (how) {
        T('INT-10');
        if (after === before) { if (touch) F('INT-10', { where: W, slider: name, why: 'does not move on a touch swipe' }); else Q('INT-10', { where: W, slider: name, why: 'does not move on a mouse drag (desktop) — intended?' }); }
      }
    }
  }
  if (list.length) {
    if (!list.some(x => x.hasNext)) NA('INT-03', `${W}: the slider(s) have no next / prev arrows`);
    if (!list.some(x => x.dots >= 2)) NA('INT-09', `${W}: the slider(s) have no pagination bullets`);
    NA('INT-04', `${W}: no slider or ticker moves on its own`);
  }
  return list.length;
}

// ---------------------------------------------------------------- hover (INT-05, INT-06, INT-12, INT-14, INT-13, A11Y-08, INT-15 material)
function HOVER_CANDS(arg) {
  document.querySelectorAll('[data-qa-h]').forEach(e => e.removeAttribute('data-qa-h'));
  const seen = new Set(arg.seen); const per = {}; const out = [];
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const reg = e => { const r = e.closest('[data-qa-region]'); return r ? r.getAttribute('data-qa-region') : 'other'; };
  const logoSel = arg.logo; const isLogo = e => { try { return !!(logoSel && (e.matches(logoSel) || e.querySelector(logoSel))); } catch (x) { return false; } };
  for (const e of document.querySelectorAll('[data-qa-region] a[href], [data-qa-region] button, [data-qa-region] [role=button], [data-qa-region] summary, [data-qa-region] [role=tab]')) {
    if (out.length >= arg.max) break;
    if (!vis(e) || e.closest('[aria-hidden=true],[inert]') || e.closest('form')) continue;
    if (e.parentElement && e.parentElement.closest('a[href],button')) continue;
    const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
    const cl = ((e.className && e.className.toString()) || '').trim().split(/\s+/).filter(c => !/^(is-|w--|active|current)/.test(c)).slice(0, 2).join('.');
    const rg = reg(e); const logo = (rg === 'header' || rg === 'footer') && isLogo(e);
    const sig = e.tagName.toLowerCase() + '.' + cl + '@' + rg + (logo ? '#logo' : '');
    if (seen.has(sig)) continue; per[sig] = (per[sig] || 0) + 1; if (per[sig] > 2) continue;
    const active = e.getAttribute('aria-current') || e.getAttribute('aria-selected') === 'true' || e.disabled || e.getAttribute('aria-disabled') === 'true' || /(^|\s)(is-active|active|is-current|current-menu-item|w--current)(\s|$)/.test(e.className.toString());
    const i = out.length; e.setAttribute('data-qa-h', i);
    const media = !!e.querySelector('img,video,picture') || r.width * r.height > 40000;
    out.push({ i, sig, region: rg, logo, active: !!active, media, text: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30), ownText: [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || !!(e.innerText || '').trim() });
  }
  return out;
}
function HOVER_PROPS(i) {
  const el = document.querySelector(`[data-qa-h="${i}"]`); if (!el) return null;
  const P = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor', 'boxShadow', 'transform', 'translate', 'scale', 'opacity', 'filter', 'textDecorationLine', 'textDecorationColor', 'fill', 'stroke', 'width', 'height', 'clipPath', 'letterSpacing', 'outlineColor', 'visibility'];
  const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  const trans = c => { const props = c.transitionProperty.split(',').map(s => s.trim()); const ds = c.transitionDuration.split(',').map(s => /ms/.test(s) ? parseFloat(s) : parseFloat(s) * 1000); const dl = c.transitionDelay.split(',').map(s => /ms/.test(s) ? parseFloat(s) : parseFloat(s) * 1000); const m = {}; props.forEach((pp, k) => { m[pp] = { d: Math.round(ds[k % ds.length] || 0), l: Math.round(dl[k % dl.length] || 0) }; }); return m; };
  const nodes = [el, ...[...el.querySelectorAll('*')].slice(0, 30)]; const out = {};
  const path = n => { const a = []; for (let x = n; x && x !== el; x = x.parentElement) a.unshift([...x.parentElement.children].indexOf(x)); return a.join('/') || '.'; };
  nodes.forEach(n => {
    for (const w of [null, '::before', '::after']) {
      const c = getComputedStyle(n, w); if (w && /^(none|normal)$/.test(c.content)) continue;
      const v = {}; P.forEach(k => { v[k] = String(c[k]).slice(0, 160); });
      const t = trans(c); const tr = {}; P.forEach(k => { const x = t[kebab(k)] || t.all; tr[k] = x ? x.d : 0; });
      const r = w ? null : n.getBoundingClientRect();
      out[path(n) + (w || '')] = { v, t: tr, vis: r ? (r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none') : (c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none') };
    }
  });
  return out;
}
function NODE_PATH(i) { // stable nth-child path from <body> (INT-15 re-finds the element in a touch context)
  const el = document.querySelector(`[data-qa-h="${i}"]`); if (!el) return null; const a = [];
  for (let x = el; x && x !== document.body; x = x.parentElement) a.unshift(`${x.tagName.toLowerCase()}:nth-child(${[...x.parentElement.children].indexOf(x) + 1})`);
  return 'body > ' + a.join(' > ');
}
function STRETCH_CELLS() { // INT-13 behaviour: the bottom edge of a whole-card link cell hovers and clicks
  const out = { checked: 0, dead: [] }; const main = document.querySelector('[data-qa-region=main]') || document.body;
  const sel = e => e.tagName.toLowerCase() + '.' + ((e.className && e.className.toString()) || '').trim().split(/\s+/).slice(0, 2).join('.');
  for (const a of main.querySelectorAll('a[href]')) {
    if (out.checked >= 30) break;
    const layer = ['::before', '::after'].some(w => { const c = getComputedStyle(a, w); return !/^(none|normal)$/.test(c.content) && c.position === 'absolute' && c.top === '0px' && c.bottom === '0px'; });
    if (!layer) continue;
    let cell = a; while (cell.parentElement && !/^(grid|inline-grid|flex|inline-flex)$/.test(getComputedStyle(cell.parentElement).display)) { cell = cell.parentElement; if (cell === document.body) break; }
    if (!cell || cell === document.body) continue;
    cell.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = cell.getBoundingClientRect(); if (r.height < 20) continue;
    out.checked++;
    for (const [n, x] of [['bottom-centre', r.left + r.width / 2], ['bottom-left', r.left + 6]]) { const y = r.bottom - 3; if (y >= innerHeight || y < 0) continue; const hit = document.elementFromPoint(x, y); if (!hit || !(hit === a || a.contains(hit) || hit.closest('a[href]') === a)) { out.dead.push({ cell: sel(cell), link: sel(a), point: n, hit: hit ? sel(hit) : null }); break; } }
  }
  window.scrollTo({ top: 0, behavior: 'instant' }); return out;
}
const durOk = (ms, media) => (DEC.hoverMs || [350]).some(v => Math.abs(v - ms) <= 10) || (media && ms >= (DEC.mediaHoverMs || [500, 650])[0] - 10 && ms <= (DEC.mediaHoverMs || [500, 650])[1] + 10);
async function phaseHover(s, p, w, lite) {
  const { page, engine } = s; const W = where(p, w, engine);
  if (!lite) await ev(page, M.COLOR_KIT, null, 10000).catch(() => { });
  const list = await ev(page, HOVER_CANDS, { seen: lite ? [] : [...IX.hoverSeen], max: lite ? 12 : 120, logo: cfg.selectors.logo });
  if (!lite && list.length >= 120) NR('INT-05', `partial: element cap 120 hover targets reached on ${W}`);
  for (const c of list) {
    if (!lite) IX.hoverSeen.add(c.sig);
    const loc = page.locator(`[data-qa-h="${c.i}"]`);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 }); await parkMouse(page, w); await quiet(page, 450, { sel: `[data-qa-h="${c.i}"]` });
      const b = await loc.evaluate(M.STATE_OF); const pb = lite ? null : await ev(page, HOVER_PROPS, c.i);
      await loc.hover({ timeout: 2000 }); await quiet(page, 800, { sel: `[data-qa-h="${c.i}"]` });
      const h = await loc.evaluate(M.STATE_OF); const ph = lite ? null : await ev(page, HOVER_PROPS, c.i);
      const [ob, sb] = JSON.parse(b), [oh, sh] = JSON.parse(h); const ownChanged = ob !== oh, sharedChanged = sb !== sh;
      const hk = `${p}@${w}|${c.sig}|${c.text}`;
      if (lite) { T('XB-08'); if (IX.chromeHover[hk] === true && !ownChanged) F('XB-08', { where: W, el: c.sig, text: c.text, why: `hover changes it in Chromium, not in ${engine}` }); continue; }
      IX.chromeHover[hk] = ownChanged; T('INT-05');
      if (!ownChanged && !c.active) {
        if (sharedChanged) Q('INT-05', { where: W, el: c.sig, text: c.text, why: 'only a wrapper shared with other links changes on hover' });
        else F('INT-05', { where: W, el: c.sig, text: c.text, why: 'hover changes nothing (self, children, ::before/::after)' });
      }
      if (pb && ph) {
        const changed = [];
        for (const k of Object.keys(ph)) {
          const x = pb[k], y = ph[k]; if (!x) continue;
          const colD = Math.max(x.t.color || 0, y.t.color || 0);
          for (const pr of Object.keys(y.v)) {
            if (x.v[pr] === y.v[pr]) continue;
            // border / outline / decoration / fill / stroke left at currentColor follow the animated colour
            const follows = pr !== 'color' && x.v[pr].includes(x.v.color) && y.v[pr].includes(y.v.color) && x.v.color !== y.v.color;
            changed.push({ node: k, pr, from: x.v[pr], to: y.v[pr], d: follows ? Math.max(colD, x.t[pr] || 0, y.t[pr] || 0) : Math.max(x.t[pr] || 0, y.t[pr] || 0), follows });
          }
        }
        if (changed.length) {
          T('INT-06'); T('INT-12');
          const durs = uniq(changed.filter(x => x.d > 0 && !x.follows && !/^(width|height|visibility)$/.test(x.pr)).map(x => x.d + (/transform|scale|translate/.test(x.pr) ? 't' : '')));
          for (const d of durs) { const ms = parseInt(d, 10); if (!durOk(ms, c.media && /t$/.test(d))) F('INT-06', { where: W, el: c.sig, text: c.text, ms, allowed: `${(DEC.hoverMs || [350]).join('/')} ms${c.media ? `; media ${(DEC.mediaHoverMs || []).join('–')} ms` : ''}` }, `${c.sig}|${ms}`); }
          const jumps = uniq(changed.filter(x => x.d === 0 && !/^(visibility|width|height)$/.test(x.pr)).map(x => x.pr));
          if (jumps.length) F('INT-12', { where: W, el: c.sig, text: c.text, props: jumps.slice(0, 6), why: 'property switches in one frame (no transition)' }, `${c.sig}|jump|${jumps.join(',')}`);
          if (changed.some(x => x.pr === 'backgroundImage' && x.from !== 'none' && x.to !== 'none')) F('INT-12', { where: W, el: c.sig, text: c.text, why: 'background-image swap on hover (flashes while the new image loads)' }, `${c.sig}|bgswap`);
          // INT-15 material: a child that is hidden at rest and shown on hover
          const reveals = Object.keys(ph).filter(k => k !== '.' && pb[k] && !pb[k].vis && ph[k].vis);
          if (reveals.length) { const pathSel = await ev(page, NODE_PATH, c.i).catch(() => null); if (pathSel) (IX.hoverReveal[p] = IX.hoverReveal[p] || []).push({ path: pathSel, kids: reveals.slice(0, 4), sig: c.sig, text: c.text }); }
          // INT-14: logo hover against decisions.logoHover
          if (c.logo) {
            T('INT-14'); const kinds = uniq(changed.map(x => /opacity/.test(x.pr) ? 'opacity' : /color|fill|stroke|filter/i.test(x.pr) ? 'color' : 'other'));
            const want = DEC.logoHover; const bad = want === 'any' ? [] : want === 'none' ? kinds : want === 'opacity' ? kinds.filter(k => k !== 'opacity') : want === 'color' ? kinds.filter(k => k !== 'color') : null;
            if (bad === null) { if (kinds.includes('opacity') || kinds.includes('color')) Q('INT-14', { where: W, logo: c.sig, changes: kinds, why: 'logo changes on hover — set decisions.logoHover ("none" | "opacity" | "color" | "any") to record the intent' }); }
            else if (bad.length) F('INT-14', { where: W, logo: c.sig, changes: kinds, want, why: 'logo hover differs from decisions.logoHover' });
          }
        } else if (c.logo) { T('INT-14'); if (DEC.logoHover && !['none', 'any'].includes(DEC.logoHover)) F('INT-14', { where: W, logo: c.sig, want: DEC.logoHover, why: 'logo does not change on hover' }); }
      }
      if (c.ownText) { const tr = await loc.evaluate(e => { const K = window.__qaC; if (!K) return null; const t = [e, ...e.querySelectorAll('*')].find(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())); return t ? K.textRatio(t, { noMedia: true }) : null; }).catch(() => null); if (tr && tr.ratio) { T('A11Y-08'); if (tr.ratio < (tr.large ? 3 : 4.5)) F('A11Y-08', { where: W, el: c.sig, text: c.text, state: 'hover', ratio: +tr.ratio.toFixed(2) }); } }
    } catch (e) { const cov = L.coveredBy(e); NR(lite ? 'XB-08' : 'INT-05', `partial: hover not measured on ${W} ${c.sig} "${c.text}" (${cov ? 'covered by ' + cov : errMsg(e)})`); } // never a silent skip
  }
  if (!lite) {
    const sc = await ev(page, STRETCH_CELLS, null, 60000).catch(() => null);
    if (sc) { T('INT-13', sc.checked); for (const d of sc.dead) F('INT-13', { where: W, cell: d.cell, link: d.link, point: d.point, hit: d.hit, why: 'the bottom edge of a whole-card link does not hover or click' }); }
  }
  return list.length;
}

// ---------------------------------------------------------------- desktop dropdowns (NAV-01, A11Y-03, A11Y-10 keys)
function DD_ITEMS() {
  ['data-qa-dd', 'data-qa-ddsub', 'data-qa-ddtog'].forEach(a => document.querySelectorAll(`[${a}]`).forEach(e => e.removeAttribute(a)));
  const h = document.querySelector('[data-qa-region=header]'); if (!h) return [];
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const out = [];
  for (const it of h.querySelectorAll('li, .w-dropdown')) {
    if (out.length >= 10) break;
    if (!vis(it) || (it.parentElement && it.parentElement.closest('li, .w-dropdown'))) continue;
    const sub = it.querySelector(':scope > ul, :scope > .w-dropdown-list, .w-dropdown-list, :scope > [class*=sub i], :scope > [class*=drop i]:not([class*=toggle i]), :scope > [class*=mega i], :scope > div > ul');
    if (!sub || !sub.querySelector('a[href]')) continue;
    const link = it.querySelector(':scope > a, :scope > div > a, .w-dropdown-toggle, :scope > button, :scope > span, :scope > div');
    const tog = it.querySelector('[aria-expanded], .w-dropdown-toggle, :scope > button, :scope > div > button') || link;
    const i = out.length; it.setAttribute('data-qa-dd', i); sub.setAttribute('data-qa-ddsub', i); if (tog) tog.setAttribute('data-qa-ddtog', i);
    const lr = (link || it).getBoundingClientRect();
    out.push({ i, text: (((link || it).innerText || '').trim().split('\n')[0] || '').slice(0, 30), href: link && link.tagName === 'A' && (link.getAttribute('href') || '').trim() && !/^#|^javascript:/i.test(link.getAttribute('href').trim()) ? link.href : null, box: [lr.left, lr.top, lr.width, lr.height], links: [...sub.querySelectorAll('a[href]')].map(a => a.href.split('#')[0]) });
  }
  return out;
}
function DD_OPEN(i) {
  const it = document.querySelector(`[data-qa-dd="${i}"]`); if (!it) return null;
  const sub = document.querySelector(`[data-qa-ddsub="${i}"]`);
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); let op = 1; for (let p = e; p && p !== document.documentElement; p = p.parentElement) op *= +getComputedStyle(p).opacity; return r.width > 0 && r.height > 4 && c.visibility !== 'hidden' && c.display !== 'none' && op > 0.5; };
  const expEl = it.hasAttribute('aria-expanded') ? it : it.querySelector('[aria-expanded]');
  return { open: !!sub && vis(sub) && [...sub.querySelectorAll('a[href]')].some(vis), exp: expEl ? expEl.getAttribute('aria-expanded') : null, focusIn: it.contains(document.activeElement) };
}
async function phaseDropdowns(s, p, w) {
  const { page } = s; const W = where(p, w);
  const items = await ev(page, DD_ITEMS);
  for (const it of items) {
    const key = it.text + '|' + it.href; if (!IX.ddLinks[it.text.toLowerCase()]) IX.ddLinks[it.text.toLowerCase()] = { href: it.href, links: uniq(it.links) };
    if (IX.ddSeen.has(key)) continue; IX.ddSeen.add(key);
    const [x, y, bw, bh] = it.box; let exposed = null, openedCentre = false;
    for (const [n, px] of [['left', x + 3], ['centre', x + bw / 2], ['right', x + bw - 3]]) {
      await parkMouse(page, w); await page.waitForTimeout(450);
      await page.mouse.move(Math.round(px), Math.round(y + bh / 2), { steps: 4 }); await page.waitForTimeout(700);
      const st = await ev(page, DD_OPEN, it.i).catch(() => null); if (!st) continue;
      T('NAV-01');
      if (!st.open) F('NAV-01', { where: W, item: it.text, point: n, why: 'dropdown does not open on hover at this point of the item' });
      else if (n === 'centre') { exposed = st.exp; openedCentre = true; }
    }
    if (openedCentre) { T('A11Y-03'); if (exposed !== 'true') F('A11Y-03', { where: W, item: it.text, why: exposed === null ? 'no aria-expanded on the item or its toggle' : `aria-expanded="${exposed}" while the dropdown is open` }); }
    // A11Y-10: keyboard — open with Enter / Space (or on focus), close with Escape
    await parkMouse(page, w); await page.waitForTimeout(400);
    const tog = page.locator(`[data-qa-ddtog="${it.i}"]`).first();
    try {
      await tog.focus({ timeout: 2000 }); await page.waitForTimeout(400); T('A11Y-10');
      let st = await ev(page, DD_OPEN, it.i); let how = st && st.open ? 'focus' : null;
      for (const key of ['Enter', 'Space']) {
        if (how) break;
        const tag = await tog.evaluate(e => e.tagName + '|' + (e.getAttribute('href') || '')).catch(() => '');
        if (key === 'Enter' && /^A\|/.test(tag) && !/^A\|(#|javascript:|$)/i.test(tag)) continue; // Enter on a real link navigates by design
        await page.keyboard.press(key); await page.waitForTimeout(500);
        if ((await docChanged(page))) { await reGo(page, p); await ev(page, DD_ITEMS); break; }
        st = await ev(page, DD_OPEN, it.i); if (st && st.open) how = key;
      }
      if (!how) F('A11Y-10', { where: W, item: it.text, why: 'the dropdown does not open from the keyboard (focus, Enter or Space)' });
      else { await page.keyboard.press('Escape'); await page.waitForTimeout(500); const c = await ev(page, DD_OPEN, it.i).catch(() => null); if (c && c.open && !c.focusIn) F('A11Y-10', { where: W, item: it.text, why: `opened by ${how} but Escape does not close it` }); else if (c && c.open) F('A11Y-10', { where: W, item: it.text, why: `opened by ${how}; Escape does not close it while focus is inside` }); }
    } catch (e) { /* toggle not focusable: covered by A11Y-07 */ }
  }
  return items.length;
}

// ---------------------------------------------------------------- top-level nav click (LINK-07), logos (NAV-11), header counts (NAV-03)
function NAV_TOP(logoSel) {
  document.querySelectorAll('[data-qa-nav]').forEach(e => e.removeAttribute('data-qa-nav'));
  const h = document.querySelector('[data-qa-region=header]'); const f = document.querySelector('[data-qa-region=footer]');
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const isLogo = e => { try { return !!(logoSel && (e.matches(logoSel) || e.querySelector(logoSel))) || e.matches('a[rel~=home]'); } catch (x) { return false; } };
  const inSub = e => !!e.closest('li li, .w-dropdown-list, [class*=sub-menu i], [class*=submenu i], [class*=dropdown-menu i], [class*=mega i]');
  const isBtn = e => /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test((e.className && e.className.toString()) || '') || e.matches('.wp-block-button__link,.w-button');
  const logos = [];
  for (const [rg, root] of [['header', h], ['footer', f]]) { if (!root) continue; let l = null; try { l = [...root.querySelectorAll(logoSel)].find(vis); } catch (x) { } if (!l) l = [...root.querySelectorAll('a[rel~=home]')].find(vis); if (!l) continue; const a = l.closest('a[href]'); logos.push({ region: rg, href: a ? a.href : null }); }
  if (!h) return { items: [], ctas: [], logos };
  const items = []; const lis = new Set(); const ctas = [];
  for (const e of h.querySelectorAll('a[href], button, [role=button], .w-dropdown-toggle, li > span, li > div')) {
    if (!vis(e) || inSub(e) || isLogo(e) || e.closest('[data-qa-burger]') || e.closest('form')) continue;
    if (/^(SPAN|DIV)$/.test(e.tagName) && getComputedStyle(e).cursor !== 'pointer') continue;
    if (!e.closest('nav, [role=navigation], .w-nav-menu, ul, [class*=menu i], [class*=nav i]') && !isBtn(e)) continue;
    if (isBtn(e)) { ctas.push((e.innerText || '').trim().slice(0, 25)); continue; }
    const li = e.closest('li, .w-dropdown'); if (li) { if (lis.has(li)) continue; lis.add(li); }
    if (e.parentElement && e.parentElement.closest('a[href],button')) continue;
    const i = items.length; e.setAttribute('data-qa-nav', i);
    const href = e.tagName === 'A' ? (e.getAttribute('href') || '').trim() : '';
    items.push({ i, text: (e.innerText || e.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 30), tag: e.tagName, href, abs: e.tagName === 'A' ? e.href : '', real: e.tagName === 'A' && !!href && !/^#|^javascript:/i.test(href) });
  }
  return { items, ctas, logos };
}
function MUT_ARM() { try { if (window.__qaMo) window.__qaMo.disconnect(); window.__qaMut = 0; window.__qaMo = new MutationObserver(l => { window.__qaMut += l.length; }); window.__qaMo.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true }); window.__qaY = scrollY; window.__qaF = document.activeElement; } catch (e) { } return true; }
function MUT_READ() { const r = { m: window.__qaMut || 0, y: scrollY !== window.__qaY, f: document.activeElement !== window.__qaF && document.activeElement !== document.body }; try { window.__qaMo.disconnect(); } catch (e) { } return r; }
const homePath = () => { try { return new URL(cfg.base + '/').pathname.replace(/\/$/, '') || '/'; } catch (e) { return '/'; } };
const isHome = href => { if (!href) return false; const pth = L.pagePath(href, cfg); return pth === '/' || pth === '/index.html'; };
async function phaseNavClick(s, p, w) {
  const { page } = s; const W = where(p, w);
  let nav = await ev(page, NAV_TOP, cfg.selectors.logo);
  if (!IX.desktopTop) IX.desktopTop = { items: nav.items.length, ctas: nav.ctas.length, page: p };
  for (const lg of nav.logos) { const k = lg.region + '|' + p; if (IX.logoSeen.has(lg.region)) continue; IX.logoSeen.add(lg.region); T('NAV-11'); if (!lg.href) F('NAV-11', { where: W, logo: lg.region, why: 'logo is not a link' }); else if (!isHome(lg.href)) F('NAV-11', { where: W, logo: lg.region, href: lg.href, why: 'logo does not link to the home page' }); void k; }
  for (const it of nav.items) {
    const key = it.text + '|' + it.abs; if (IX.navSeen.has(key)) continue; IX.navSeen.add(key);
    const loc = page.locator(`[data-qa-nav="${it.i}"]`).first();
    if (!(await loc.count())) { nav = await ev(page, NAV_TOP, cfg.selectors.logo); continue; }
    await ev(page, MUT_ARM);
    let navigated = false; const onNav = fr => { if (fr === page.mainFrame()) navigated = true; }; page.on('framenavigated', onNav);
    try { await loc.click({ timeout: 3000 }); } catch (e) { page.off('framenavigated', onNav); const cov = L.coveredBy(e); F('LINK-07', { where: W, item: it.text, why: cov ? `covered by ${cov}` : 'cannot be clicked: ' + errMsg(e) }); continue; }
    T('LINK-07');
    for (let k = 0; k < (it.real ? 25 : 6) && !navigated; k++) await page.waitForTimeout(200);
    page.off('framenavigated', onNav);
    if (navigated) { await page.waitForLoadState('load', { timeout: 15000 }).catch(() => { }); await reGo(page, p); nav = await ev(page, NAV_TOP, cfg.selectors.logo); continue; }
    await page.waitForTimeout(500);
    const m = await ev(page, MUT_READ).catch(() => ({ m: 0 }));
    if (!m.m && !m.y) F('LINK-07', { where: W, item: it.text, href: it.href || '(none)', why: it.real ? 'link does not navigate on click' : 'styled as a nav item, click goes nowhere and opens nothing' });
    await page.keyboard.press('Escape').catch(() => { }); await parkMouse(page, w);
  }
  return nav.items.length;
}

// ---------------------------------------------------------------- buttons outside forms (LINK-13 behaviour)
function BTN_TAG() {
  document.querySelectorAll('[data-qa-btn]').forEach(e => e.removeAttribute('data-qa-btn'));
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const out = [];
  for (const b of document.querySelectorAll('button,[role=button]')) {
    if (out.length >= 120) break;
    if (!vis(b) || b.closest('form') || b.hasAttribute('form') || /^(submit|reset)$/i.test(b.getAttribute('type') || '') || b.tagName === 'A' || !b.closest('[data-qa-region]')) continue;
    const attr = ['aria-controls', 'aria-expanded', 'aria-haspopup', 'popovertarget', 'commandfor', 'onclick', 'data-toggle', 'data-bs-toggle', 'data-target', 'data-bs-target', 'data-action', 'data-w-id'].some(k => b.hasAttribute(k)) || b.matches('summary');
    const i = out.length; b.setAttribute('data-qa-btn', i);
    out.push({ i, attr, sig: b.tagName.toLowerCase() + '.' + ((b.className && b.className.toString()) || '').trim().split(/\s+/).slice(0, 2).join('.') + '|' + (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30), text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30) });
  }
  return out;
}
const BTN_VERDICT = {}; // button signature → 'ok' | 'dead'
async function phaseButtons(s, p, w) {
  const { page } = s; const W = where(p, w);
  const list = await ev(page, BTN_TAG); const hk = await ev(page, BTN_HANDLERS).catch(() => ({ kinds: {} }));
  let clicks = 0;
  for (const b of list) {
    const kind = b.attr ? 'attr' : (hk.kinds[b.i] || 'none');
    if (kind !== 'delegated') { if (BTN_VERDICT[b.sig] === undefined) BTN_VERDICT[b.sig] = kind === 'none' ? 'dead' : 'ok'; continue; }
    if (BTN_VERDICT[b.sig] !== undefined) continue;
    if (clicks >= 20) { NR('LINK-13', `partial: click cap 20 on ${W}`); break; }
    clicks++;
    const before = page.url(); await ev(page, MUT_ARM);
    try { await page.locator(`[data-qa-btn="${b.i}"]`).first().click({ timeout: 2500 }); } catch (e) { continue; }
    await page.waitForTimeout(600);
    const m = await ev(page, MUT_READ).catch(() => ({ m: 1 }));
    BTN_VERDICT[b.sig] = (m.m || m.y || m.f || page.url() !== before) ? 'ok' : 'dead';
    if (page.url() !== before || (await docChanged(page))) { await reGo(page, p); await ev(page, BTN_TAG); }
    else { await page.keyboard.press('Escape').catch(() => { }); await page.waitForTimeout(250); }
  }
  return list.length;
}

// ---------------------------------------------------------------- keyboard focus (A11Y-07, A11Y-08 focus)
function FOCUS_PREP() {
  const S = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=true]';
  let n = 0; const rest = {};
  for (const e of document.querySelectorAll(S)) { if (n >= 500) break; e.setAttribute('data-qa-fc', n); const c = getComputedStyle(e); rest[n] = [c.outlineStyle, c.outlineWidth, c.outlineColor, c.outlineOffset, c.boxShadow, c.backgroundColor, c.color, c.borderTopColor, c.borderBottomColor, c.textDecorationLine].join('|'); n++; }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  return { n, rest };
}
function FOCUS_EXTRA() {
  const e = document.activeElement; if (!e || e === document.body) return null; const K = window.__qaC; const c = getComputedStyle(e);
  const out = { idx: e.getAttribute('data-qa-fc'), ring: null, text: null };
  if (K) {
    const w = parseFloat(c.outlineWidth) || 0;
    if (c.outlineStyle !== 'none' && w >= 1) { const bg = K.effBg(e.parentElement || e); if (!bg.visual) { const oc = K.parse(c.outlineColor); out.ring = +K.ratio(K.over(oc, bg.rgb), bg.rgb).toFixed(2); } }
    const t = [e, ...e.querySelectorAll('*')].find(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    if (t) { const r = K.textRatio(t, { noMedia: true }); if (r && r.ratio) out.text = { ratio: +r.ratio.toFixed(2), large: r.large }; }
  }
  return out;
}
const FOCUS_SEEN = new Set();
async function phaseFocus(s, p, w) {
  const { page } = s; const W = where(p, w);
  await ev(page, M.COLOR_KIT, null, 10000).catch(() => { });
  const prep = await ev(page, FOCUS_PREP); if (!prep.n) return 0;
  const visited = new Set(); let steps = 0, bodyHits = 0;
  const max = Math.min(160, prep.n + 10);
  while (steps < max) {
    steps++; await page.keyboard.press('Tab'); await page.waitForTimeout(120);
    const info = await ev(page, M.FOCUS_INFO).catch(() => ({ none: true }));
    if (info.none) { if (++bodyHits >= 2) break; continue; }
    if (info.iframe) continue;
    const ex = await ev(page, FOCUS_EXTRA).catch(() => null); const idx = ex && ex.idx;
    if (idx !== null && idx !== undefined) { if (visited.has(idx)) break; visited.add(idx); }
    const key = info.sel + '|' + info.text; if (FOCUS_SEEN.has(key)) continue; FOCUS_SEEN.add(key);
    T('A11Y-07');
    if (!info.visible) { F('A11Y-07', { where: W, el: info.sel, text: info.text, why: 'keyboard focus lands on an invisible / off-screen element' }); continue; }
    if (idx !== null && idx !== undefined && prep.rest[idx] === info.sig) F('A11Y-07', { where: W, el: info.sel, text: info.text, why: 'no visible focus state (nothing changes on focus)' });
    if (ex && ex.ring !== null && ex.ring < 3) F('A11Y-07', { where: W, el: info.sel, text: info.text, ring: ex.ring, why: `focus ring contrast ${ex.ring}:1 (< 3:1)` });
    if (ex && ex.text) { T('A11Y-08'); if (ex.text.ratio < (ex.text.large ? 3 : 4.5)) F('A11Y-08', { where: W, el: info.sel, text: info.text, state: 'focus', ratio: ex.text.ratio }); }
  }
  if (steps >= max && max === 160) NR('A11Y-07', `partial: Tab cap 160 reached on ${W}`);
  return visited.size;
}

// ---------------------------------------------------------------- burger (NAV-02..09, NAV-11..15, A11Y-02, A11Y-10)
function PANEL_PROBE(arg) {
  const b = document.querySelector('[data-qa-burger]'); if (!b) return { open: false, noBurger: true };
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none'; };
  const inView = e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const sel = e => e.tagName.toLowerCase() + '.' + ((e.className && e.className.toString()) || '').trim().split(/\s+/).slice(0, 2).join('.');
  const name = e => ((e.getAttribute('aria-label') || '') || (e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby')) || {}).textContent || '' : '') || (e.innerText || '') || (e.getAttribute('title') || '') || [...e.querySelectorAll('.sr-only,.screen-reader-text,.visually-hidden')].map(x => x.textContent).join(' ')).trim();
  document.querySelectorAll('[data-qa-panel],[data-qa-prow],[data-qa-close]').forEach(e => { e.removeAttribute('data-qa-panel'); e.removeAttribute('data-qa-prow'); e.removeAttribute('data-qa-close'); });
  const id = (b.getAttribute('aria-controls') || '').split(/\s+/)[0];
  let panel = id ? document.getElementById(id) : null;
  if (!panel || !vis(panel)) {
    const main = document.querySelector('[data-qa-region=main]');
    const c = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); if (!/fixed|absolute/.test(cs.position) || !vis(e)) return false; const r = e.getBoundingClientRect(); return r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.35 && [...e.querySelectorAll('a[href]')].filter(vis).length >= 2 && !(main && e.contains(main)) && !e.closest('[data-qa-region=main]'); });
    panel = c.sort((x, y) => { const rx = x.getBoundingClientRect(), ry = y.getBoundingClientRect(); return ry.width * ry.height - rx.width * rx.height; })[0] || null;
  }
  const exp = b.getAttribute('aria-expanded');
  const lockY = () => { const h = getComputedStyle(document.documentElement), bd = getComputedStyle(document.body); return h.overflowY === 'hidden' || h.overflow === 'hidden' || bd.overflowY === 'hidden' || bd.overflow === 'hidden' || bd.position === 'fixed'; };
  if (!panel || !vis(panel) || ![...panel.querySelectorAll('a[href]')].some(x => vis(x) && inView(x))) return { open: false, exp, lock: lockY(), bName: name(b) };
  panel.setAttribute('data-qa-panel', '1');
  const inNested = e => !!e.closest('li li, .sub-menu, .w-dropdown-list, [class*=submenu i], [class*=sub-menu i], [class*=dropdown-menu i]');
  const isBtn = e => /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test((e.className && e.className.toString()) || '') || e.matches('.wp-block-button__link,.w-button');
  const isClose = e => /close|dismiss|×|✕/i.test((e.getAttribute('aria-label') || '') + ' ' + ((e.className && e.className.toString()) || '') + ' ' + (e.innerText || '').trim());
  let logo = null; try { logo = [...document.querySelectorAll(arg.logo)].find(x => vis(x) && inView(x)); } catch (e) { }
  const lr = logo && logo.getBoundingClientRect();
  const rowsEls = [...panel.querySelectorAll('a[href], button, [role=button]')].filter(e => vis(e) && !inNested(e) && !isBtn(e) && !isClose(e) && !(logo && (e.contains(logo))) && e !== b && !e.closest('form'));
  const rowsByLi = []; const seenLi = new Set(); for (const e of rowsEls) { const li = e.closest('li'); if (li) { if (seenLi.has(li)) continue; seenLi.add(li); } rowsByLi.push(li || e); }
  const close = [...panel.querySelectorAll('button,[role=button],a[href^="#"]')].find(e => vis(e) && isClose(e)) || ((exp === 'true' && vis(b)) ? b : null);
  if (close) close.setAttribute('data-qa-close', '1');
  const exps = [...panel.querySelectorAll('[aria-expanded], li > button, .w-dropdown-toggle')].filter(e => vis(e) && e !== b && e !== close && !e.closest('li li')).filter((e, i, a) => a.findIndex(o => (o.closest('li') || o) === (e.closest('li') || e)) === i).slice(0, 8);
  exps.forEach((e, i) => e.setAttribute('data-qa-prow', i));
  const sc = [panel, ...panel.querySelectorAll('*')].find(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2) || null;
  const nested = [...panel.querySelectorAll('*')].filter(e => e !== sc && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2 && vis(e)).map(sel).slice(0, 5);
  const pr = panel.getBoundingClientRect();
  const contentBottom = Math.max(pr.bottom, ...[...panel.querySelectorAll('a,button')].filter(vis).map(e => e.getBoundingClientRect().bottom));
  const ctas = [...panel.querySelectorAll('a,button')].filter(e => vis(e) && isBtn(e) && !isClose(e)).map(e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { text: (e.innerText || '').trim().slice(0, 25), h: Math.round(r.height), pad: c.paddingTop + '/' + c.paddingLeft, r: c.borderTopLeftRadius, fs: c.fontSize, bg: c.backgroundColor, inView: r.top >= 0 && r.bottom <= innerHeight }; });
  const main = document.querySelector('[data-qa-region=main]');
  return {
    open: true, exp, role: panel.getAttribute('role') || (panel.closest('[role=dialog]') ? 'dialog' : null), modal: panel.getAttribute('aria-modal') || (panel.closest('[aria-modal]') || { getAttribute: () => null }).getAttribute('aria-modal'),
    inert: !!(main && (main.closest('[inert]') || main.closest('[aria-hidden=true]'))), focusIn: panel.contains(document.activeElement) || (close === b && document.activeElement === b && panel.contains(b)),
    bName: name(b), closeName: close ? name(close) : null, closeIsBurger: close === b, hasClose: !!close,
    rows: rowsByLi.map(e => Math.round(e.getBoundingClientRect().height)), rowCount: rowsByLi.length,
    nestedVisible: [...panel.querySelectorAll('li li a, .sub-menu a, .w-dropdown-list a, [class*=submenu i] a, [class*=sub-menu i] a')].filter(e => vis(e) && inView(e)).length,
    expRows: exps.map((e, i) => ({ i, text: ((e.closest('li') || e).innerText || '').trim().split('\n')[0].slice(0, 30), exp: e.getAttribute('aria-expanded') })),
    ctas, logo: lr ? [lr.left, lr.top, lr.width, lr.height].map(v => +v.toFixed(1)) : null, logoHref: logo && logo.closest('a[href]') ? logo.closest('a[href]').href : (logo ? '' : null), logoInPanel: !!(logo && panel.contains(logo)),
    lock: lockY(), scrollable: !!sc, overscroll: sc ? getComputedStyle(sc).overscrollBehaviorY : null, tall: contentBottom > innerHeight + 2, nested,
    full: pr.width >= innerWidth - 4 && pr.height >= innerHeight - 4, box: [pr.left, pr.top, pr.width, pr.height].map(Math.round),
  };
}
function ROW_STATE(i) {
  const t = document.querySelector(`[data-qa-prow="${i}"]`); if (!t) return null; const li = t.closest('li') || t.parentElement;
  const sub = li && li.querySelector('ul, .sub-menu, .w-dropdown-list, [class*=submenu i], [class*=sub-menu i], [class*=dropdown-menu i]');
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 2 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0.1; };
  return JSON.stringify([t.getAttribute('aria-expanded'), vis(sub), sub ? Math.round(sub.getBoundingClientRect().height) : null]);
}
function ROW_LINKS(i) {
  const t = document.querySelector(`[data-qa-prow="${i}"]`); if (!t) return null; const li = t.closest('li') || t.parentElement;
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1; };
  return { links: [...li.querySelectorAll('a[href]')].filter(vis).map(a => a.href.split('#')[0]), count: li.querySelectorAll('li li a, ul a').length };
}
function ROW6(i) {
  const t = document.querySelector(`[data-qa-prow="${i}"]`); if (!t) return null; const li = t.closest('li') || t.parentElement;
  li.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = li.getBoundingClientRect(); const sub = li.querySelector('ul, .sub-menu, .w-dropdown-list, [class*=submenu i]');
  let bottom = r.bottom; if (sub) { const sr = sub.getBoundingClientRect(); if (sr.height > 0 && sr.top > r.top) bottom = Math.min(bottom, sr.top); }
  const tr = t.getBoundingClientRect(); const top = Math.min(r.top, tr.top); bottom = Math.max(bottom, tr.bottom); const h = bottom - top;
  const pts = []; for (const [vn, fy] of [['upper', 0.3], ['lower', 0.7]]) for (const [hn, fx] of [['left', 0.1], ['centre', 0.5], ['right', 0.9]]) pts.push({ n: `${vn} ${hn}`, x: Math.round(r.left + r.width * fx), y: Math.round(top + h * fy) });
  return pts;
}
const btnMode = (p, w) => { const st = statOf(p, w); if (!st || !st.btnSig) return []; const g = {}; st.btnSig.filter(b => b.region === 'main' && !b.exempt).forEach(b => { const k = `${b.h}|${b.pad}|${b.r}|${b.fs}`; g[k] = (g[k] || 0) + 1; }); return Object.keys(g); };
async function openBurger(s, touch) {
  const { page } = s; const pick = await ev(page, M.PICK_BURGER, cfg.selectors.burger).catch(() => ({ found: false }));
  if (!pick.found) return { pick };
  try { await click(page, page.locator('[data-qa-burger]').first(), touch); } catch (e) { return { pick, error: L.coveredBy(e) ? 'covered by ' + L.coveredBy(e) : errMsg(e) }; }
  await qb(page, 900);
  return { pick, st: await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }) };
}
async function phaseBurger(s, p, w, lite) {
  const { page, engine } = s; const W = where(p, w, engine); const touch = w < 768;
  const pick0 = await ev(page, M.PICK_BURGER, cfg.selectors.burger).catch(() => ({ found: false }));
  if (!pick0.found) return 0;
  const logo0 = await ev(page, sl => { try { const l = [...document.querySelectorAll(sl)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight; }); if (!l) return null; const r = l.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => +v.toFixed(1)); } catch (e) { return null; } }, cfg.selectors.logo).catch(() => null);
  const bars = lite ? null : await ev(page, M.LINE_WEIGHT, '[data-qa-burger]').catch(() => null);
  const shotDir = path.join(SHOTS, 'burger');
  const y0 = await ev(page, () => scrollY);
  const o = await openBurger(s, touch); const st = o.st;
  const bk = `${p}@${w}`;
  if (lite) {
    T('XB-08'); const c = IX.chromeBurger[bk];
    if (!st || !st.open) { if (!c || c.open) F('XB-08', { where: W, why: `burger does not open the panel in ${engine}${c && c.open ? ' (it does in Chromium)' : ''}` }); return 1; }
    await page.keyboard.press('Escape'); await qb(page, 700);
    let st2 = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null);
    if (st2 && st2.open) { try { await click(page, page.locator('[data-qa-close], [data-qa-burger]').first(), touch); await qb(page, 700); } catch (e) { } st2 = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null); }
    if (st2 && st2.open && (!c || c.close)) F('XB-08', { where: W, why: `the burger panel does not close in ${engine} (Escape, close button)` });
    // NAV-13 in this engine
    const re = await openBurger(s, touch); if (re.st && re.st.open) await burgerRows(s, p, w, re.st, true);
    return 1;
  }
  IX.chromeBurger[bk] = { open: !!(st && st.open) };
  T('NAV-02'); T('A11Y-10');
  if (o.error) { F('NAV-02', { where: W, why: 'burger cannot be clicked: ' + o.error }); return 1; }
  const shotOpen = await shot(page, path.join(shotDir, `${slug(p)}-${w}-open.png`));
  if (!st || !st.open) { F('NAV-02', { where: W, why: 'burger does not open a panel', shot: shotOpen }); return 1; }
  if (!pick0.name && !st.bName) F('A11Y-10', { where: W, el: 'burger', why: 'burger has no accessible name' });
  if (pick0.exp === null || pick0.exp === undefined) F('A11Y-10', { where: W, el: 'burger', why: 'burger has no aria-expanded' });
  else if (st.exp !== 'true') F('A11Y-10', { where: W, el: 'burger', why: `aria-expanded stays "${st.exp}" while the panel is open` });
  if (st.hasClose && !st.closeIsBurger && !st.closeName) F('A11Y-10', { where: W, el: 'close button', why: 'close button has no accessible name' });
  T('A11Y-02');
  if (!((st.role === 'dialog' && st.modal === 'true') || st.inert)) F('A11Y-02', { where: W, why: `panel role=${st.role || 'none'} aria-modal=${st.modal || 'none'}, page behind not inert` });
  if (!st.focusIn) F('A11Y-02', { where: W, why: 'focus stays outside the panel after opening' });
  T('NAV-03');
  if (st.nestedVisible) F('NAV-03', { where: W, why: `${st.nestedVisible} link(s) of nested lists visible before any submenu toggle` });
  if (IX.desktopTop) { const want = IX.desktopTop.items + IX.desktopTop.ctas, got = st.rowCount + st.ctas.length; if (want !== got) F('NAV-03', { where: W, panel: `${st.rowCount} rows + ${st.ctas.length} CTAs = ${got}`, desktop: `${IX.desktopTop.items} items + ${IX.desktopTop.ctas} CTAs = ${want} (${IX.desktopTop.page} @1440)`, why: 'panel link count differs from the desktop header' }); }
  else NR('NAV-03', 'partial: desktop header count not measured (no 1440 nav pass) — panel count not compared');
  if (st.rows.length < 2) NA('NAV-06', `${W}: fewer than two rows in the burger panel`);
  if (!st.ctas.length) NA('NAV-04', `${W}: no CTA in the burger panel`);
  if (!st.expRows.length) { NA('NAV-12', `${W}: no expandable rows in the burger panel`); }
  if (logo0 && !st.logo) Q('NAV-08', { where: W, why: 'the logo is hidden when the burger opens — intended?', shot: shotOpen });
  if (st.rows.length > 1) { T('NAV-06'); const mx = Math.max.apply(null, st.rows), mn = Math.min.apply(null, st.rows); if (mx - mn > 1) F('NAV-06', { where: W, rows: st.rows.join(','), why: 'burger rows differ in height' }); }
  if (logo0 && st.logo) { T('NAV-08'); const d = logo0.map((v, i) => Math.abs(v - st.logo[i])); if (Math.max.apply(null, d) > 0.5) F('NAV-08', { where: W, closed: logo0.join(','), open: st.logo.join(','), why: 'logo box moves when the burger opens (left,top,width,height)' }); }
  if (st.logoInPanel || st.logoHref !== null) { T('NAV-11'); if (st.logoInPanel && !st.logoHref) F('NAV-11', { where: W, logo: 'burger panel', why: 'logo in the open panel is not a link' }); else if (st.logoHref && !isHome(st.logoHref)) F('NAV-11', { where: W, logo: 'burger panel', href: st.logoHref, why: 'logo in the open panel does not link to the home page' }); }
  // NAV-07: burger bars vs close cross
  const closeW = st.hasClose ? await ev(page, M.LINE_WEIGHT, '[data-qa-close]').catch(() => null) : null;
  T('NAV-07');
  if (bars && closeW) { if (Math.abs(bars - closeW) > 0.25) F('NAV-07', { where: W, burger: bars, close: closeW, why: 'line weight differs (±0.25px)' }); }
  else Q('NAV-07', { where: W, burger: bars, close: closeW, why: 'line weight not measurable (no svg stroke / thin bar) — compare the screenshots', shot: shotOpen });
  // NAV-15 / NAV-05
  T('NAV-15'); if (st.scrollable && !/contain|none/.test(st.overscroll || '')) F('NAV-15', { where: W, overscroll: st.overscroll, why: 'scrollable panel without overscroll-behavior contain/none (scroll chains to the page)' });
  if (st.tall && !st.scrollable) F('NAV-15', { where: W, why: 'panel is taller than the screen but cannot scroll' });
  T('NAV-05'); if (st.nested.length) F('NAV-05', { where: W, el: st.nested.join(', '), why: 'scroll inside scroll in the burger panel' });
  // NAV-09: page behind does not scroll
  T('NAV-09');
  if (!st.lock) {
    try { if (touch) { await page.mouse.move(Math.round(w / 2), Math.round(vh(w) - 20)); } await page.mouse.wheel(0, 400); } catch (e) { }
    await page.waitForTimeout(400); const y1 = await ev(page, () => scrollY);
    if (y1 !== y0) F('NAV-09', { where: W, why: `page scrolled behind the open menu (${y0}→${y1}); no scroll lock` });
  }
  // NAV-12 / NAV-04 / NAV-13 on the expandable rows
  await burgerRows(s, p, w, st, false);
  // NAV-14: CTAs styled like the site's buttons
  if (st.ctas.length) { T('NAV-14'); const modes = btnMode(p, w); for (const c of st.ctas) { const k = `${c.h}|${c.pad}|${c.r}|${c.fs}`; if (modes.length && !modes.includes(k)) F('NAV-14', { where: W, cta: c.text, panel: k, site: modes.slice(0, 4), why: 'panel CTA does not match any button style of the page (height|padding|radius|font-size)' }); } }
  // Escape closes, focus returns
  await page.keyboard.press('Escape'); await qb(page, 700);
  let after = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null);
  IX.chromeBurger[bk].close = !(after && after.open);
  if (after && after.open) F('NAV-02', { where: W, why: 'Escape does not close the panel' });
  else { const f = await ev(page, () => !!document.activeElement && document.activeElement.hasAttribute('data-qa-burger')).catch(() => false); if (!f) Q('NAV-02', { where: W, why: 'focus does not return to the burger after Escape' }); const e2 = await ev(page, () => { const b = document.querySelector('[data-qa-burger]'); return b ? b.getAttribute('aria-expanded') : null; }).catch(() => null); if (e2 === 'true') F('A11Y-10', { where: W, el: 'burger', why: 'aria-expanded stays "true" after the panel closed' }); }
  // the close button closes
  let re = await openBurger(s, touch);
  if (re.st && re.st.open && re.st.hasClose) {
    try { await click(page, page.locator('[data-qa-close]').first(), touch); } catch (e) { }
    await qb(page, 700); after = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null);
    if (after && after.open) F('NAV-02', { where: W, why: 'the close button does not close the panel' });
  }
  // NAV-14: a click outside closes and releases the lock; a resize past the breakpoint closes it
  re = await openBurger(s, touch);
  if (re.st && re.st.open) {
    T('NAV-14');
    if (!re.st.full) {
      const [px, py, pw2, ph2] = re.st.box; const pts = [[w - 6, vh(w) - 6], [6, vh(w) - 6], [w - 6, Math.min(vh(w) - 6, py + ph2 + 20)]].filter(([x, y]) => !(x >= px && x <= px + pw2 && y >= py && y <= py + ph2));
      if (pts.length) {
        try { await pointAt(page, pts[0][0], pts[0][1], touch); } catch (e) { }
        await qb(page, 700); after = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null);
        if (after && after.open) F('NAV-14', { where: W, why: 'a click outside the panel does not close it' });
        else if (after && after.lock) F('NAV-14', { where: W, why: 'the scroll lock stays after closing by an outside click' });
      }
    } else NOTE('NAV-14', `${W}: the panel covers the whole screen — no outside area to click`);
    re = (after && after.open) ? re : await openBurger(s, touch);
    if (re.st && re.st.open) {
      await page.setViewportSize({ width: REF.desktop, height: vh(REF.desktop) }); await qb(page, 900);
      const big = await ev(page, () => { const p = document.querySelector('[data-qa-panel]'); const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none' && (/fixed|absolute/.test(c.position)); }; const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body); return { open: vis(p) && p.getBoundingClientRect().height >= innerHeight * 0.5, lock: h.overflowY === 'hidden' || b.overflowY === 'hidden' || b.position === 'fixed' }; }).catch(() => null);
      if (big && big.open) F('NAV-14', { where: W, why: `the panel stays open after a resize to ${REF.desktop}px` });
      else if (big && big.lock) F('NAV-14', { where: W, why: `the scroll lock stays after a resize to ${REF.desktop}px` });
      await page.setViewportSize({ width: w, height: vh(w) }); await qb(page, 500);
    }
  }
  return 1;
}
async function burgerRows(s, p, w, st, lite) {
  const { page, engine } = s; const W = where(p, w, engine); const touch = w < 768;
  let biggest = null;
  for (const row of st.expRows.slice(0, 6)) {
    // NAV-12: links of the submenu vs the desktop dropdown of the same parent
    const r0 = await ev(page, ROW_STATE, row.i).catch(() => null); if (r0 === null) continue;
    if (!lite) {
      try { await click(page, page.locator(`[data-qa-prow="${row.i}"]`).first(), touch); } catch (e) { continue; }
      await qb(page, 650);
      if ((await docChanged(page))) { F('NAV-13', { where: W, row: row.text, why: 'tapping the row toggle navigates instead of opening the submenu' }); await reGo(page, p); const o = await openBurger(s, touch); if (!o.st || !o.st.open) return; continue; }
      const lk = await ev(page, ROW_LINKS, row.i).catch(() => null);
      const d = IX.ddLinks[row.text.toLowerCase()];
      if (lk && d) {
        T('NAV-12'); const have = new Set(lk.links.map(x => x.replace(/\/$/, '')));
        const miss = d.links.map(x => x.replace(/\/$/, '')).filter(x => !have.has(x));
        if (miss.length) F('NAV-12', { where: W, parent: row.text, missing: miss.slice(0, 8), why: 'burger submenu lacks links of the desktop dropdown' });
        if (d.href && !have.has(d.href.split('#')[0].replace(/\/$/, ''))) F('NAV-12', { where: W, parent: row.text, href: d.href, why: 'no link to the parent page in the burger' });
      } else if (lk && !d) NOTE('NAV-12', `${W}: burger row "${row.text}" has no desktop dropdown of the same name`);
      if (lk && (!biggest || lk.links.length > biggest.n)) biggest = { i: row.i, n: lk.links.length, text: row.text };
      try { await click(page, page.locator(`[data-qa-prow="${row.i}"]`).first(), touch); } catch (e) { } await qb(page, 450);
    }
    // NAV-13: 6 points of the row + Enter + Space
    const pts = await ev(page, ROW6, row.i).catch(() => null);
    for (const pt of pts || []) {
      const b0 = await ev(page, ROW_STATE, row.i).catch(() => null);
      try { await pointAt(page, pt.x, pt.y, touch); } catch (e) { continue; }
      await qb(page, 550); T('NAV-13');
      if ((await docChanged(page))) { F('NAV-13', { where: W, row: row.text, point: pt.n, why: 'this point of the row navigates instead of toggling' }); await reGo(page, p); const o = await openBurger(s, touch); if (!o.st || !o.st.open) return; break; }
      const b1 = await ev(page, ROW_STATE, row.i).catch(() => null);
      if (b0 === b1) F('NAV-13', { where: W, row: row.text, point: pt.n, why: 'this point of the row does not toggle it' });
      else { try { await pointAt(page, pt.x, pt.y, touch); await qb(page, 450); } catch (e) { } }
    }
    for (const key of ['Enter', 'Space']) {
      const loc = page.locator(`[data-qa-prow="${row.i}"]`).first();
      try { await loc.focus({ timeout: 1500 }); } catch (e) { continue; }
      const b0 = await ev(page, ROW_STATE, row.i).catch(() => null); await page.keyboard.press(key); await qb(page, 500); T('NAV-13');
      if ((await docChanged(page))) { F('NAV-13', { where: W, row: row.text, key, why: `${key} navigates instead of toggling` }); await reGo(page, p); const o = await openBurger(s, touch); if (!o.st || !o.st.open) return; break; }
      const b1 = await ev(page, ROW_STATE, row.i).catch(() => null);
      if (b0 === b1) F('NAV-13', { where: W, row: row.text, key, why: `${key} does not toggle the row` }); else { await page.keyboard.press(key).catch(() => { }); await qb(page, 400); }
    }
  }
  if (!lite && biggest) {
    // NAV-04: CTAs stay visible with the largest submenu open
    try { await click(page, page.locator(`[data-qa-prow="${biggest.i}"]`).first(), touch); await qb(page, 650); } catch (e) { }
    const st2 = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null);
    if (st2 && st2.open && st2.ctas.length) { T('NAV-04'); const off = st2.ctas.filter(c => !c.inView).map(c => c.text); if (off.length) F('NAV-04', { where: W, submenu: biggest.text, ctas: off, why: 'CTA leaves the screen with the largest submenu open', shot: await shot(page, path.join(SHOTS, 'burger', `${slug(p)}-${w}-submenu.png`)) }); }
  }
}

// ---------------------------------------------------------------- in-page anchors (LINK-10)
async function phaseAnchors(s, p, w) {
  const { page } = s; const W = where(p, w); const touch = w < 768;
  const list = await ev(page, M.ANCHORS);
  for (const an of list) {
    await toTop(page);
    let viaBurger = false;
    if (!an.visible) {
      const o = await openBurger(s, touch); if (!o.st || !o.st.open) continue;
      const inPanel = await ev(page, i => { const a = document.querySelector(`[data-qa-anc="${i}"]`); const pn = document.querySelector('[data-qa-panel]'); if (!a || !pn || !pn.contains(a)) return false; const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, an.i).catch(() => false);
      if (!inPanel) { await page.keyboard.press('Escape').catch(() => { }); continue; }
      viaBurger = true;
    }
    try { await click(page, page.locator(`[data-qa-anc="${an.i}"]`).first(), touch); } catch (e) { continue; }
    await quiet(page, 1500, { quiet: 500 });
    const land = await ev(page, M.ANCHOR_LANDING, an.hash).catch(() => null); if (!land) continue;
    T('LINK-10');
    if (land.top < land.headerBottom - 2) F('LINK-10', { where: W, anchor: an.hash, text: an.text, why: `target lands under the fixed/sticky header (target top ${land.top}px, header bottom ${land.headerBottom}px)` });
    else if (land.top > vh(w) * 0.6 && !land.atEnd) Q('LINK-10', { where: W, anchor: an.hash, text: an.text, why: `target lands ${land.top}px from the top — scrolled?` });
    if (viaBurger) { const st = await ev(page, PANEL_PROBE, { logo: cfg.selectors.logo }).catch(() => null); if (st && st.open) F('LINK-10', { where: W, anchor: an.hash, why: 'the burger stays open after an anchor tap' }); }
    if ((await docChanged(page))) await reGo(page, p);
  }
  return list.length;
}

// ---------------------------------------------------------------- pop-ups / lightboxes (MODAL-01)
function OVERLAY_PROBE(i) {
  const o = document.querySelector(`[data-qa-ov="${i}"]`); if (!o) return null;
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none'; };
  const box = [...o.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().width < innerWidth * 0.98 && e.getBoundingClientRect().width > 120 && e.getBoundingClientRect().height > 80).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || o;
  const r = box.getBoundingClientRect();
  const sc = [o, ...o.querySelectorAll('*')].find(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2);
  const contentTall = [...o.querySelectorAll('*')].some(e => e.getBoundingClientRect().bottom > innerHeight + 2);
  const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body);
  const close = [...o.querySelectorAll('button,[role=button],a')].find(e => vis(e) && /close|dismiss|×|✕/i.test((e.getAttribute('aria-label') || '') + ' ' + ((e.className && e.className.toString()) || '') + ' ' + (e.innerText || '').trim()));
  if (close) close.setAttribute('data-qa-ovclose', i);
  return { dx: Math.round((r.left + r.right) / 2 - innerWidth / 2), dy: Math.round((r.top + r.bottom) / 2 - innerHeight / 2), tallBox: r.height > innerHeight, scroll: !!sc, contentTall, lock: h.overflowY === 'hidden' || b.overflowY === 'hidden' || b.position === 'fixed', focusIn: o.contains(document.activeElement), hasClose: !!close };
}
async function phaseModals(s, p, w) {
  const { page } = s; const W = where(p, w); const touch = w < 768;
  let trig = await ev(page, M.DIALOG_TRIGGERS);
  for (const t of trig) {
    T('MODAL-01');
    try { await click(page, page.locator(`[data-qa-dlg="${t.i}"]`).first(), touch); } catch (e) { F('MODAL-01', { where: W, trigger: t.text, why: 'trigger cannot be clicked: ' + (L.coveredBy(e) ? 'covered by ' + L.coveredBy(e) : errMsg(e)) }); continue; }
    await qb(page, 1000);
    if ((await docChanged(page))) { Q('MODAL-01', { where: W, trigger: t.text, why: 'the trigger navigates to another page instead of opening a pop-up' }); await reGo(page, p); trig = await ev(page, M.DIALOG_TRIGGERS); continue; }
    const ovs = await ev(page, M.OPEN_OVERLAYS);
    if (!ovs.length) { F('MODAL-01', { where: W, trigger: t.text, why: 'the trigger opens nothing' }); continue; }
    const pr = await ev(page, OVERLAY_PROBE, 0); const shotRel = await shot(page, path.join(SHOTS, 'modal', `${slug(p)}-${w}-${t.i}.png`));
    const bad = [];
    if (pr) {
      if (Math.abs(pr.dx) > 4 || (!pr.tallBox && Math.abs(pr.dy) > vh(w) * 0.1)) bad.push(`not centred (offset ${pr.dx}px, ${pr.dy}px)`);
      if (pr.contentTall && !pr.scroll) bad.push('content taller than the screen does not scroll inside');
      if (!pr.lock) { const y0 = await ev(page, () => scrollY); await page.mouse.wheel(0, 300).catch(() => { }); await page.waitForTimeout(300); if ((await ev(page, () => scrollY)) !== y0) bad.push('the page behind scrolls'); }
      if (!pr.focusIn) bad.push('focus does not move into the pop-up');
    }
    await page.keyboard.press('Escape'); await qb(page, 700);
    if ((await ev(page, M.OPEN_OVERLAYS)).length) {
      bad.push('Escape does not close it');
      if (pr && pr.hasClose) { try { await click(page, page.locator('[data-qa-ovclose="0"]').first(), touch); await qb(page, 700); } catch (e) { } if ((await ev(page, M.OPEN_OVERLAYS)).length) bad.push('the close button does not close it'); }
      else bad.push('no close button');
      if ((await ev(page, M.OPEN_OVERLAYS)).length) { await reGo(page, p); trig = await ev(page, M.DIALOG_TRIGGERS); }
    } else if (pr && !pr.hasClose) bad.push('no visible close button');
    else if (pr && pr.hasClose) {
      try { await click(page, page.locator(`[data-qa-dlg="${t.i}"]`).first(), touch); await qb(page, 900); await ev(page, M.OPEN_OVERLAYS); await ev(page, OVERLAY_PROBE, 0); await click(page, page.locator('[data-qa-ovclose="0"]').first(), touch); await qb(page, 700); if ((await ev(page, M.OPEN_OVERLAYS)).length) bad.push('the close button does not close it'); } catch (e) { }
    }
    for (const b of bad) F('MODAL-01', { where: W, trigger: t.text, why: b, shot: shotRel });
  }
  return trig.length;
}

// ---------------------------------------------------------------- forms (FORM-01, -05, -06, -10, -11, -12, -13, A11Y-09)
function FIELDS_TAG() {
  document.querySelectorAll('[data-qa-f],[data-qa-fm]').forEach(e => { e.removeAttribute('data-qa-f'); e.removeAttribute('data-qa-fm'); });
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && +c.opacity > 0.05; };
  const labelOf = e => ((e.labels && e.labels[0] && e.labels[0].innerText) || (e.closest('label') && e.closest('label').innerText) || e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby')) || {}).textContent : '') || '').replace(/\s+/g, ' ').trim();
  const out = []; const forms = [...document.forms].filter(vis);
  forms.forEach((f, fi) => f.setAttribute('data-qa-fm', fi));
  for (const e of document.querySelectorAll('input, textarea, select')) {
    if (out.length >= 60) break;
    if (/^(hidden|submit|button|reset|image|checkbox|radio|file|range|color)$/.test(e.type) || !vis(e)) continue;
    const f = e.form || e.closest('form'); const fi = f && f.hasAttribute('data-qa-fm') ? +f.getAttribute('data-qa-fm') : -1;
    const i = out.length; e.setAttribute('data-qa-f', i); const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    const label = labelOf(e);
    out.push({ i, form: fi, tag: e.tagName, type: e.type, name: e.name || e.id || '', label: label.slice(0, 50), ph: e.getAttribute('placeholder') || '', hasLabel: !!label || !!(e.getAttribute('title') || '').trim(), min: e.getAttribute('min'), readonly: e.readOnly, disabled: e.disabled, req: e.required || e.getAttribute('aria-required') === 'true', top: Math.round(r.top + scrollY), left: Math.round(r.left), h: Math.round(r.height), single: e.tagName === 'INPUT', picker: /flatpickr|datepicker|pikaday|air-datepicker|react-datepicker|hasDatepicker|duet-date|vanillajs-datepicker/i.test(((e.className && e.className.toString()) || '') + ' ' + ((e.parentElement && e.parentElement.className && e.parentElement.className.toString()) || '')) || (e.readOnly && /date/i.test(e.name + ' ' + label + ' ' + (e.getAttribute('placeholder') || ''))), box: { w: r.width, h: r.height, bt: parseFloat(c.borderTopWidth), bb: parseFloat(c.borderBottomWidth), bl: parseFloat(c.borderLeftWidth), br: parseFloat(c.borderRightWidth), pl: parseFloat(c.paddingLeft), pr: parseFloat(c.paddingRight), align: c.textAlign } });
  }
  return out;
}
// FORM-10: ink rows of the typed text inside a field screenshot. Border / outline rows (ink across ≥90% of the scanned
// columns) are skipped, so a field drawn at a fractional y (screenshot one row taller) still measures from its inner edge.
async function INK(arg) {
  const bin = atob(arg.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' })); const W = bmp.width, H = bmp.height;
  const c = new OffscreenCanvas(W, H); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, W, H).data;
  const x0 = Math.max(0, Math.min(W - 1, Math.floor(arg.x0))), x1 = Math.max(x0 + 1, Math.min(W, Math.ceil(arg.x1))); const span = x1 - x0;
  const counts = new Map(); let best = 0, bestN = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; const k = (d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3); const n = (counts.get(k) || 0) + 1; counts.set(k, n); if (n > bestN) { bestN = n; best = i; } }
  const r0 = d[best], g0 = d[best + 1], b0 = d[best + 2];
  const cnt = []; for (let y = 0; y < H; y++) { let n = 0; for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 48) n++; } cnt.push(n); }
  const full = y => cnt[y] >= span * 0.9;
  let t = 0; for (let y = 0; y < Math.min(4, H); y++) if (full(y)) t = y + 1; while (t < H && full(t)) t++;
  let b = H - 1; for (let y = H - 1; y >= Math.max(t, H - 4); y--) if (full(y)) b = y - 1; while (b > t && full(b)) b--;
  let first = -1, last = -1; for (let y = t; y <= b; y++) if (cnt[y] > 0 && cnt[y] < span * 0.9) { if (first < 0) first = y; last = y; }
  return first < 0 ? null : { top: first - t, bottom: b - last, inner: b - t + 1 };
}
const DATE_FUTURE = /arriv|check[- ]?in|check[- ]?out|book|appoint|reserv|event|deliver|start|preferred|visit|move[- ]?in|travel|departure|wedding|party|session/i;
const COUNT_FIELD = /guest|quantity|\bqty\b|number of|people|persons|adults|children|kids|count|rooms|seats|attendees|tickets|units/i;
const EMAIL_FIELD = /e-?mail/i;
async function fieldGeo(page, fi) {
  return ev(page, x => { const f = document.querySelector(`[data-qa-fm="${x}"]`); if (!f) return []; return [...f.querySelectorAll('input:not([type=hidden]),select,textarea')].map(e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); const p = e.parentElement; const ic = p ? [...p.children].filter(k => k !== e && /svg|img|i|span/i.test(k.tagName)).map(k => { const kr = k.getBoundingClientRect(); return Math.round(kr.top - r.top) + ':' + Math.round(kr.left - r.left); }).join(',') : ''; return { n: e.name || e.id || e.type, h: Math.round(r.height), bp: c.backgroundPosition, pad: c.paddingTop + '/' + c.paddingBottom + '/' + c.paddingRight, icons: ic }; }); }, fi);
}
async function phaseForms(s, p, w, lite) {
  const { page, engine } = s; const W = where(p, w, engine); const touch = w < 768;
  const fields = await ev(page, FIELDS_TAG); if (!fields.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const f of fields) {
    if (f.readonly && !f.picker || f.disabled) continue;
    const loc = page.locator(`[data-qa-f="${f.i}"]`).first(); const name = f.label || f.ph || f.name || f.type;
    const isDate = f.type === 'date' || f.type === 'datetime-local' || (f.picker);
    if (!lite) {
      // FORM-01: a real label; placeholder-only → ask
      T('FORM-01');
      if (!f.hasLabel) (f.ph ? Q : F)('FORM-01', { where: W, field: name, why: f.ph ? 'placeholder is the only label' : 'no label (label[for], wrapping label, aria-label / labelledby)' }, `${p}|${f.name}|label`);
    }
    if (f.tag === 'SELECT') continue;
    if (isDate) {
      if (lite || w >= 992) {
        // FORM-11 (other engines) / FORM-05 (Chromium): date entry
        if (f.picker) {
          T(lite ? 'FORM-11' : 'FORM-05');
          if (lite) {
            try { await click(page, loc, touch); await page.waitForTimeout(700); } catch (e) { F('FORM-11', { where: W, field: name, why: 'date field cannot be opened: ' + errMsg(e) }); continue; }
            const opened = await ev(page, () => [...document.querySelectorAll('.flatpickr-calendar.open, .ui-datepicker, .pika-single:not(.is-hidden), .air-datepicker.-active-, .react-datepicker, .duet-date__dialog.is-active, .datepicker-dropdown.active, [class*=datepicker i][class*=open i], [class*=calendar i][class*=open i]')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })).catch(() => false);
            if (!opened) F('FORM-11', { where: W, field: name, why: `the date picker does not open in ${engine}` });
            else {
              const day = page.locator('.flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay), .ui-datepicker-calendar td:not(.ui-datepicker-unselectable) a, .pika-button:not([disabled]), .air-datepicker-cell:not(.-disabled-), .react-datepicker__day:not(.react-datepicker__day--disabled)').last();
              try { await day.click({ timeout: 2000 }); await page.waitForTimeout(400); const v = await loc.inputValue(); if (!v) F('FORM-11', { where: W, field: name, why: `picking a day leaves the field empty in ${engine}` }); } catch (e) { Q('FORM-11', { where: W, field: name, why: `could not pick a day in ${engine}: ${errMsg(e)}` }); }
            }
            await page.keyboard.press('Escape').catch(() => { });
          } else if (!f.min || f.min < today) Q('FORM-05', { where: W, field: name, why: 'JS date picker: check that past dates are disabled when a future date is meant' }, `${p}|${f.name}|picker`);
          continue;
        }
        if (lite) {
          T('FORM-11');
          try { await loc.fill('2031-06-15', { timeout: 2000 }); const v = await loc.inputValue(); if (!/2031-06-15/.test(v)) F('FORM-11', { where: W, field: name, value: v, why: `native date entry does not fill in ${engine}` }); await loc.fill('').catch(() => { }); } catch (e) { F('FORM-11', { where: W, field: name, why: `native date entry fails in ${engine}: ${errMsg(e)}` }); }
          if (f.h < 20) F('FORM-11', { where: W, field: name, h: f.h, why: `date field collapsed (${f.h}px) in ${engine}` });
          continue;
        }
        if (DATE_FUTURE.test(name + ' ' + f.name) || f.min) {
          T('FORM-05');
          let accepts = null; try { await loc.fill('2000-01-01', { timeout: 1500 }); accepts = await loc.evaluate(e => e.checkValidity()); await loc.fill(''); } catch (e) { }
          if (accepts === true) F('FORM-05', { where: W, field: name, min: f.min || 'none', why: 'accepts a past date where a future date is meant' }, `${p}|${f.name}|past`);
        }
      }
      continue;
    }
    // typing (FORM-01 in Chromium, FORM-11 in WebKit / Firefox)
    const id = lite ? 'FORM-11' : 'FORM-01';
    const sample = { number: '5', email: 'qa@example.com', tel: '0123456789', url: 'https://example.com', time: '10:30', month: '2031-06', week: '2031-W24' }[f.type] || 'qa check';
    try { await loc.fill(sample, { timeout: 2000 }); const v = await loc.inputValue(); T(id); if (!v) F(id, { where: W, field: name, why: `field refuses typing${lite ? ' in ' + engine : ''}` }); await loc.fill(''); }
    catch (e) { T(id); F(id, { where: W, field: name, why: `cannot type${lite ? ' in ' + engine : ''}: ${errMsg(e)}` }); }
    // FORM-10: text vertical position (pixel ink box) — Chromium baseline at 1440, compared in WebKit / Firefox
    if (f.single && /^(text|email|tel|search|url|number|password)$/.test(f.type) && w === REF.desktop && f.type !== 'password') {
      try {
        await loc.fill('Hg 0123', { timeout: 1500 }); await loc.evaluate(e => e.blur()); await parkMouse(page, w); await page.waitForTimeout(200);
        const png = await loc.screenshot({ timeout: 5000 }); const textW = await loc.evaluate(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return c.measureText(e.value).width; });
        const ink = await ev(page, INK, { b64: png.toString('base64'), x0: f.box.bl + f.box.pl, x1: f.box.bl + f.box.pl + textW + 2 }, 20000).catch(() => null); await loc.fill('');
        const k = `${p}|${f.form}|${f.name || f.i}`;
        if (ink) { if (!lite) IX.ink[k] = ink; else { const b = IX.ink[k]; if (b) { T('FORM-10'); const dc = ((ink.top - ink.bottom) - (b.top - b.bottom)) / 2; if (Math.abs(dc) > 2) F('FORM-10', { where: W, field: name, [engine]: `top ${ink.top} / bottom ${ink.bottom} of ${ink.inner}px`, chromium: `top ${b.top} / bottom ${b.bottom} of ${b.inner}px`, shift: +dc.toFixed(1), why: 'text sits at a different height in the field (ink box centre, ±2px)' }); } } }
      } catch (e) { /* not measurable: counted by the coverage note */ }
    }
    if (lite) continue;
    // FORM-05: counts refuse letters and negatives; FORM-12: an invalid email is rejected
    if ((f.type === 'number' || f.type === 'tel' || COUNT_FIELD.test(name + ' ' + f.name)) && COUNT_FIELD.test(name + ' ' + f.name)) {
      T('FORM-05');
      for (const v of ['abc', '-3']) { try { await loc.fill(v, { timeout: 1500 }); const r = await loc.evaluate(e => ({ v: e.value, ok: e.checkValidity() })); if (r.v === v && r.ok) F('FORM-05', { where: W, field: name, value: v, why: v === 'abc' ? 'a count field accepts letters' : 'a count field accepts a negative number' }, `${p}|${f.name}|${v}`); await loc.fill(''); } catch (e) { } }
    } else if (f.type === 'tel') {
      T('FORM-05'); try { await loc.fill('abcdef', { timeout: 1500 }); const r = await loc.evaluate(e => ({ v: e.value, ok: e.checkValidity() })); if (r.v === 'abcdef' && r.ok) F('FORM-05', { where: W, field: name, why: 'phone field accepts letters (no pattern / mask)' }, `${p}|${f.name}|tel`); await loc.fill(''); } catch (e) { }
    }
    if (f.type === 'email' || EMAIL_FIELD.test(name + ' ' + f.name)) {
      T('FORM-12'); try { await loc.fill('not-an-email', { timeout: 1500 }); const ok = await loc.evaluate(e => e.checkValidity()); if (ok) F('FORM-12', { where: W, field: name, type: f.type, why: 'an invalid email ("not-an-email") is accepted' }, `${p}|${f.name}|email`); await loc.fill(''); } catch (e) { }
    }
  }
  if (lite) return fields.length;
  // FORM-13: tab order follows the visual order inside each form
  const byForm = {}; fields.filter(f => f.form >= 0 && !f.disabled).forEach(f => (byForm[f.form] = byForm[f.form] || []).push(f));
  for (const [fi, fl] of Object.entries(byForm)) {
    if (fl.length < 2) continue;
    const visual = fl.slice().sort((x, y) => (Math.abs(x.top - y.top) > 8 ? x.top - y.top : x.left - y.left)).map(x => x.i);
    try { await page.locator(`[data-qa-f="${fl[0].i}"]`).first().focus({ timeout: 1500 }); } catch (e) { continue; }
    const order = [fl[0].i];
    for (let k = 0; k < fl.length + 3 && order.length < fl.length; k++) { await page.keyboard.press('Tab'); const ix = await ev(page, () => document.activeElement && document.activeElement.getAttribute('data-qa-f')).catch(() => null); if (ix === null || ix === undefined) continue; if (!order.includes(+ix)) order.push(+ix); }
    T('FORM-13');
    const vis0 = visual.filter(x => order.includes(x)); if (order.join(',') !== vis0.join(',')) F('FORM-13', { where: W, form: +fi, tab: order.map(i => (fields[i].label || fields[i].name).slice(0, 14)), visual: vis0.map(i => (fields[i].label || fields[i].name).slice(0, 14)), why: 'tab order differs from the visual order' });
  }
  // FORM-06 / A11Y-09: empty submit (only with --form-errors)
  if (!FORM_ERRORS && Object.keys(byForm).length) for (const id of ['FORM-06', 'A11Y-09']) NR(id, 'needs --form-errors (permission to press submit on EMPTY forms; nothing is typed or sent) — rerun with the flag when the person allows it');
  if (FORM_ERRORS) {
    for (const fi of Object.keys(byForm)) {
      const g0 = await fieldGeo(page, fi);
      const sub = page.locator(`[data-qa-fm="${fi}"] [type=submit], [data-qa-fm="${fi}"] button:not([type]), [data-qa-fm="${fi}"] input[type=image]`).first();
      if (!(await sub.count())) continue;
      s.allow = true;
      try { await sub.click({ timeout: 2500 }); } catch (e) { s.allow = false; continue; }
      await page.waitForTimeout(2500); s.allow = false;
      T('FORM-06');
      if ((await docChanged(page))) { F('FORM-06', { where: W, form: +fi, why: 'an empty submit leaves the page (not blocked)' }); await reGo(page, p); await ev(page, FIELDS_TAG); continue; }
      const st = await ev(page, x => { const f = document.querySelector(`[data-qa-fm="${x}"]`); if (!f) return null; const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.1; }; const scope = f.closest('section,div') || f; const msgs = [...scope.querySelectorAll('[role=alert], [aria-live], .error, .invalid-feedback, .wpcf7-not-valid-tip, .wpcf7-response-output, .w-form-fail, .w-form-done, [class*=error i], [class*=invalid i], [class*=success i], [class*=message i]')].filter(e => vis(e) && (e.innerText || '').trim()); const K = window.__qaC; return { invalid: !f.checkValidity(), aria: !!f.querySelector('[aria-invalid=true]'), msgs: msgs.slice(0, 6).map(e => { const t = K ? K.textRatio(e, { noMedia: true }) : null; return { text: (e.innerText || '').trim().slice(0, 50), ratio: t && t.ratio ? +t.ratio.toFixed(2) : null, large: t && t.large }; }) }; }, fi).catch(() => null);
      if (st && !st.invalid && !st.aria && !st.msgs.length) F('FORM-06', { where: W, form: +fi, why: 'an empty submit shows no message (not blocked)' });
      const g1 = await fieldGeo(page, fi);
      const moved = g0.filter((x, k) => g1[k] && (x.bp !== g1[k].bp || x.pad !== g1[k].pad || x.icons !== g1[k].icons || Math.abs(x.h - g1[k].h) > 1)).map(x => x.n);
      if (moved.length) F('FORM-06', { where: W, form: +fi, fields: moved.slice(0, 8), why: 'the error state shifts field geometry (height, padding, background-position, icons)', shot: await shot(page.locator(`[data-qa-fm="${fi}"]`).first(), path.join(SHOTS, 'forms', `${slug(p)}-${w}-${fi}-error.png`)) });
      if (st && st.msgs.length) { await ev(page, M.COLOR_KIT, null, 10000).catch(() => { }); for (const m of st.msgs) { if (m.ratio === null) continue; T('A11Y-09'); if (m.ratio < (m.large ? 3 : 4.5)) F('A11Y-09', { where: W, form: +fi, message: m.text, ratio: m.ratio }); } }
    }
  }
  return fields.length;
}

// ---------------------------------------------------------------- hover-only affordances on touch tiers (INT-15)
async function phaseTouch(s, p, w) {
  const { page } = s; const W = where(p, w); const items = IX.hoverReveal[p] || [];
  for (const it of items) {
    const r = await ev(page, x => { let el = null; try { el = document.querySelector(x.path); } catch (e) { } if (!el) return null; const kids = x.kids.map(k => { let n = el; for (const part of k.replace(/::(before|after)$/, '').split('/').filter(v => v !== '.' && v !== '')) n = n && n.children[+part]; const pseudo = (k.match(/::(before|after)$/) || [])[0] || null; if (!n) return null; const c = getComputedStyle(n, pseudo); const rr = n.getBoundingClientRect(); return { vis: c.visibility !== 'hidden' && +c.opacity > 0.1 && c.display !== 'none' && (pseudo ? true : rr.width > 0 && rr.height > 0), k }; }).filter(Boolean); return { hover: matchMedia('(hover: none)').matches ? 'none' : 'hover', kids }; }, it).catch(() => null);
    if (!r || !r.kids.length) continue;
    T('INT-15');
    const hidden = r.kids.filter(k => !k.vis).map(k => k.k);
    if (hidden.length) F('INT-15', { where: W, el: it.sig, text: it.text, why: `an affordance revealed on desktop hover stays hidden on this touch tier (hover: ${r.hover})` });
  }
  return items.length;
}

// ---------------------------------------------------------------- language switch (I18N-03, I18N-04)
async function phaseLang(s, p, w, lite) {
  const { page, engine } = s; const W = where(p, w, engine); const touch = w < 768;
  const lt = await ev(page, M.LANG_TARGETS); if (!lt.targets.length) return 0;
  const t = lt.targets[0]; const before = await ev(page, M.TEXT_SAMPLE, 20);
  if (!t.visible) { const o = await openBurger(s, touch); if (!o.st || !o.st.open) { NR('I18N-03', `partial: ${W} the language switcher is hidden and the burger did not open`); return 0; } await ev(page, M.LANG_TARGETS); }
  try { await click(page, page.locator('[data-qa-lang="0"]').first(), touch); } catch (e) { F('I18N-03', { where: W, to: t.hl, why: 'switcher cannot be clicked: ' + errMsg(e) }); return 1; }
  try { await page.waitForLoadState('load', { timeout: 15000 }); } catch (e) { }
  await page.waitForTimeout(1500);
  const after = await ev(page, M.TEXT_SAMPLE, 20).catch(() => null); T('I18N-03');
  if (!after) { F('I18N-03', { where: W, to: t.hl, why: 'page did not load after switching language' }); return 1; }
  const same = after.lines.filter(x => before.lines.includes(x)).length;
  const bad = [];
  if (!after.lang || after.lang.split('-')[0] !== t.hl) bad.push(`<html lang> is "${after.lang}" (want ${t.hl})`);
  if (after.url === before.url) bad.push('URL unchanged');
  if (before.lines.length && same >= before.lines.length * 0.5) bad.push(`${same}/${before.lines.length} text lines unchanged`);
  for (const b of bad) F('I18N-03', { where: W, to: t.hl, why: b + (lite ? ` (${engine})` : '') });
  if (!lite && !bad.length) {
    // I18N-04: the language persists after following an internal link
    await tagRegions(page);
    const next = await ev(page, () => { const here = location.href.split('#')[0]; const a = [...document.querySelectorAll('[data-qa-region=main] a[href], [data-qa-region=header] a[href]')].find(x => x.origin === location.origin && x.href.split('#')[0] !== here && !x.hasAttribute('hreflang') && !/\.(pdf|jpg|png|zip)$/i.test(x.pathname)); return a ? a.href : null; }).catch(() => null);
    if (next) { try { await page.goto(next, { waitUntil: 'load', timeout: 30000 }); await page.waitForTimeout(1000); const l2 = await ev(page, () => (document.documentElement.getAttribute('lang') || '').toLowerCase()); T('I18N-04'); if (l2.split('-')[0] !== t.hl) F('I18N-04', { where: W, from: after.url, to: next, lang: l2, why: `language falls back to "${l2}" after an internal link` }); } catch (e) { NR('I18N-04', `partial: ${W} the internal link did not load: ${errMsg(e)}`); } }
  }
  return 1;
}

// ---------------------------------------------------------------- reveal on scroll (INT-11)
async function REVEAL_SERIES(arg) {
  const e = document.querySelector(`[data-qa-st="${arg.i}"]`); if (!e) return null;
  const eff = () => { let op = 1; for (let p = e; p && p !== document.documentElement; p = p.parentElement) op *= +getComputedStyle(p).opacity; return +op.toFixed(3); };
  const r0 = e.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, r0.top + scrollY - innerHeight * 0.75), behavior: 'instant' });
  const s = []; const t0 = performance.now();
  while (performance.now() - t0 < arg.ms) { s.push(eff()); await new Promise(r => requestAnimationFrame(() => r())); }
  const c = getComputedStyle(e); const link = e.matches('a') ? e : e.querySelector('a[href]'); const lc = link ? getComputedStyle(link) : null;
  return { s, tf: c.transform, wc: c.willChange, ltf: lc ? lc.transform : null, lwc: lc ? lc.willChange : null, isLink: !!link, sel: e.tagName.toLowerCase() + '.' + ((e.className && e.className.toString()) || '').trim().split(/\s+/).slice(0, 2).join('.') };
}
async function phaseReveal(s, p, w) {
  const { page } = s; const W = where(p, w);
  const cands = await ev(page, M.STUCK_CANDIDATES); if (!cands.length) return 0;
  const H = vh(w); const first = cands.filter(c => c.y < H * 0.85);
  if (first.length) {
    const sm = await ev(page, M.STUCK_SAMPLE).catch(() => ({}));
    const hidden = first.filter(c => sm[c.i] && sm[c.i].op < 0.99);
    T('INT-11', first.length);
    if (hidden.length) F('INT-11', { where: W, els: hidden.slice(0, 5).map(c => sm[c.i].sel), why: 'first-screen content waits for a scroll / reveal (hidden after load)' });
  }
  const below = cands.filter(c => c.y >= H * 0.85).sort((x, y) => x.y - y.y).slice(0, 10);
  for (const c of below) {
    const r = await ev(page, REVEAL_SERIES, { i: c.i, ms: 1600 }, 20000).catch(() => null); if (!r || !r.s.length) continue;
    T('INT-11'); const s0 = r.s;
    const iUp = s0.findIndex(v => v > 0.05), iDone = s0.findIndex(v => v > 0.95);
    if (s0[0] < 0.5 && iUp >= 0 && iDone >= 0 && iDone - iUp <= 3 && iDone > 0) F('INT-11', { where: W, el: r.sel, frames: iDone - iUp, why: 'abrupt reveal (completes in ≤3 frames)' });
    let peak = 0, flick = false; for (const v of s0) { peak = Math.max(peak, v); if (peak > 0.5 && v < peak - 0.3) flick = true; } if (flick) F('INT-11', { where: W, el: r.sel, why: 'flickering reveal (opacity drops while revealing)' });
    if (r.isLink && ((r.ltf && r.ltf !== 'none') || (r.lwc && r.lwc !== 'auto'))) F('INT-11', { where: W, el: r.sel, transform: r.ltf, willChange: r.lwc, why: 'a revealed link does not end at transform:none / will-change:auto' });
  }
  // down / up / down: nothing left hidden
  for (const dir of ['down', 'up', 'down']) { if (dir === 'up') await toTop(page); else await scrollThrough(page, 'chromium', w); }
  const left = await stuckPass(page, cands.map(c => ({ i: c.i, y: c.y, ev: c.ev })), w).catch(() => null);
  if (left) { T('INT-11', 0); for (const x of left.stuck.slice(0, 8)) F('INT-11', { where: W, el: x.sel, opacity: x.op, why: 'left hidden after down / up / down scroll passes' }); }
  return cands.length;
}

// ---------------------------------------------------------------- orchestration per page × width × engine
function interactPhases(engine, p, w) {
  const lite = engine !== 'chromium'; const desktop = w >= 992; const W = where(p, w, engine);
  const st = statOf(p, w) || statOf(p, REF.desktop); const pr = (st && st.presence) || {};
  const burgerHere = !!(statOf(p, w) && statOf(p, w).hamburgerVisible);
  const hdr = headerPages().includes(p);
  const phases = [];
  const add = (name, list, cond, fn, ctxExtra) => { if (cond) phases.push({ name, list, fn, ctxExtra }); };
  add('toggles', ['INT-01', 'INT-02', 'LAY-06', 'NAV-13', 'XB-08'], true, s => phaseToggles(s, p, w, lite));
  add('sliders', ['INT-03', 'INT-04', 'INT-09', 'INT-10'], !lite && (pr.sliderLike > 0 || !st), s => phaseSliders(s, p, w));
  add('hover', ['INT-05', 'INT-06', 'INT-12', 'INT-13', 'INT-14', 'A11Y-08', 'XB-08'], desktop && (!lite || w === REF.desktop), s => phaseHover(s, p, w, lite));
  add('dropdowns', ['NAV-01', 'A11Y-03', 'A11Y-10'], !lite && desktop && hdr && (pr.dropdowns > 0 || !st), s => phaseDropdowns(s, p, w));
  add('nav', ['LINK-07', 'NAV-11'], !lite && w === REF.desktop && hdr, s => phaseNavClick(s, p, w));
  add('buttons', ['LINK-13'], !lite && w === REF.desktop, s => phaseButtons(s, p, w));
  add('focus', ['A11Y-07', 'A11Y-08'], !lite && w === REF.desktop, s => phaseFocus(s, p, w));
  add('burger', ['NAV-02', 'NAV-03', 'NAV-04', 'NAV-05', 'NAV-06', 'NAV-07', 'NAV-08', 'NAV-09', 'NAV-11', 'NAV-12', 'NAV-13', 'NAV-14', 'NAV-15', 'A11Y-02', 'A11Y-10', 'XB-08'], !desktop && hdr && burgerHere, s => phaseBurger(s, p, w, lite));
  add('anchors', ['LINK-10'], !lite && (w === REF.desktop || w === REF.mobile) && (pr.anchors > 0 || !st), s => phaseAnchors(s, p, w));
  add('modals', ['MODAL-01'], !lite && (w === REF.desktop || w === REF.mobile) && (pr.dialogTriggers > 0 || !st), s => phaseModals(s, p, w));
  const hasForms = st ? (st.forms || []).some(f => f.fields && f.fields.length) : true;
  add('forms', ['FORM-01', 'FORM-05', 'FORM-06', 'FORM-10', 'FORM-11', 'FORM-12', 'FORM-13', 'A11Y-09'], hasForms && (lite ? w === REF.desktop : (w === REF.desktop || w === REF.mobile)), s => phaseForms(s, p, w, lite), null);
  add('touch', ['INT-15'], !lite && !desktop, s => phaseTouch(s, p, w), w >= 768 ? { hasTouch: true, isMobile: true } : null);
  const langHere = st && ((st.hreflang || []).length > 1 || pr.langSwitch > 0);
  add('lang', ['I18N-03', 'I18N-04'], langHere && (w === REF.desktop || w === REF.mobile) && hdr, s => phaseLang(s, p, w, lite));
  add('reveal', ['INT-11'], !lite && (w === REF.desktop || w === REF.mobile), s => phaseReveal(s, p, w));
  return phases;
}
// Parallel interactions with the serial run's results. Jobs keep their plan order (engine → page → width → phase); a
// job starts when its dependencies are done, the lowest ready index first, at most `conc` at a time. Dependencies:
//   hover / dropdowns / nav share "seen" sets across pages (an element is judged on the first page that has it) → each
//   runs in plan order after the previous job of its kind; burger reads what nav and dropdowns found on desktop, touch
//   reads the hover reveals → they wait for every earlier job of those kinds.
// Ledger writes are replayed in plan order (JOB_LOG), so findings, caps and notes match a one-at-a-time run.
const SERIAL_KINDS = new Set(['hover', 'dropdowns', 'nav']);
function interactJobs(engines) {
  const jobs = [];
  for (const e of engines) {
    const widths = e === 'chromium' ? cfg.interactWidths : [REF.desktop, REF.mobile];
    for (const p of PLAN.sampled) for (const w of widths) for (const ph of interactPhases(e, p, w)) {
      const deps = [];
      jobs.forEach((o, j) => {
        if (o.engine !== e) return;
        if (SERIAL_KINDS.has(ph.name) && o.ph.name === ph.name) deps.push(j);
        else if (e === 'chromium' && ph.name === 'burger' && (o.ph.name === 'nav' || o.ph.name === 'dropdowns')) deps.push(j);
        else if (e === 'chromium' && ph.name === 'touch' && o.ph.name === 'hover') deps.push(j);
      });
      jobs.push({ engine: e, p, w, ph, deps });
    }
  }
  return jobs;
}
async function runJobs(jobs, conc, label) {
  const n = jobs.length; const state = new Array(n).fill(0); const logs = jobs.map(() => []); let flushed = 0, done = 0;
  const waiters = []; const wake = () => { while (waiters.length) waiters.shift()(); };
  const next = () => { for (let i = 0; i < n; i++) if (state[i] === 0 && jobs[i].deps.every(d => state[d] === 2)) return i; return -1; };
  const worker = async () => {
    for (;;) {
      const i = next();
      if (i < 0) { if (!state.includes(0)) return; await new Promise(r => waiters.push(r)); continue; }
      state[i] = 1; const j = jobs[i];
      try { await JOB_LOG.run(logs[i], () => runPhase(j.engine, j.p, j.w, j.ph)); }
      catch (e) { logs[i].push(() => GAP(j.ph.list, `${where(j.p, j.w, j.engine)} ${j.ph.name}`, `interaction failed: ${errMsg(e)}`)); }
      state[i] = 2; done++;
      while (flushed < n && state[flushed] === 2) { for (const op of logs[flushed]) op(); logs[flushed] = null; flushed++; }
      progress(label, done, n); wake();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(conc, n)) }, worker));
  progress(label, n, n, true);
}
// One phase on one page × width × engine: a fresh context and a fresh load (no state leaks between phases).
async function runPhase(engine, p, w, ph) {
  const W = where(p, w, engine);
  {
    if (late()) { GAP(ph.list, `${W} ${ph.name}`, BUDGET_WHY); CUT.push(`${engine} ${ph.name} ${p} @${w}`); return; }
    let s; const holder = { allow: false };
    try { s = await open(engine, w, { ctx: ph.ctxExtra || undefined, allowSubmit: () => holder.allow }); } catch (e) { GAP(ph.list, `${W} ${ph.name}`, errMsg(e)); return; }
    Object.defineProperty(s, 'allow', { get: () => holder.allow, set: v => { holder.allow = !!v; } });
    try { await s.ctx.addInitScript(LISTEN_HOOK); } catch (e) { }
    try {
      await timed(`page load ${engine}`, async () => { await go(s.page, p, { settle: 500 }); await tagRegions(s.page); await markDoc(s.page); });
      await timed(`interact ${engine} ${ph.name}`, () => withTimeout(ph.fn(s), 8 * 60000, `${ph.name} on ${W}`));
      collectJs(s, p, w, ph.name); PHASE_RAN.add(ph.name);
    } catch (e) { GAP(ph.list, `${W} ${ph.name}`, e && e.blocked ? errMsg(e) : `interaction failed: ${errMsg(e)}`); }
    finally { await s.close(); }
  }
}

// ------------------------------------------------------------------------------------------------ evaluation of the static pass
const splitKey = k => { const i = k.lastIndexOf('@'); return [k.slice(0, i), +k.slice(i + 1)]; };
let PAGE_ORDER = new Map();
const cmpKey = (x, y) => { const [p1, w1] = splitKey(x), [p2, w2] = splitKey(y); const o1 = PAGE_ORDER.has(p1) ? PAGE_ORDER.get(p1) : 1e9, o2 = PAGE_ORDER.has(p2) ? PAGE_ORDER.get(p2) : 1e9; return (o1 - o2) || byStr(p1, p2) || (w2 - w1); };
// measured entries of one engine (404 probe and weight-only loads excluded), in a fixed order
function measured(engine, wf) {
  const S = STAT[engine] || {};
  return Object.keys(S).filter(k => { const s = S[k]; const [p, w] = splitKey(k); return s && !s.fail && !s.weightOnly && p !== PROBE && (!wf || wf(w)); }).sort(cmpKey).map(k => { const [p, w] = splitKey(k); return { k, p, w, s: S[k], W: where(p, w) }; });
}
const isRefW = w => w === REF.desktop || w === REF.tablet || w === REF.mobile;
const thirdParty = u => !!u && /^https?:/i.test(u) && !L.sameSite(u, cfg);
const SOCIAL = /(^|\.)((facebook|fb|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|threads|vimeo|behance|dribbble)\.com|youtu\.be|t\.me)$/i;
const SHARE_PATH = /\/(sharer|share|intent|shareArticle|dialog\/share|pin\/create)/i;
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;
const enPage = s => !s.meta || !s.meta.lang || /^en\b/i.test(s.meta.lang);

function evalLinks() {
  for (const { p, w, s, W } of measured('chromium')) {
    const desk = w === REF.desktop;
    // LINK-12: hidden links at every tier
    for (const l of s.links || []) {
      if (!l.href || l.excl) continue; T('LINK-12');
      if (l.inv) F('LINK-12', { where: W, el: l.sel, href: l.href, text: l.text, why: `rendered invisible (${l.inv})` }, `${p}|${w}|${l.sel}|${l.href}`);
    }
    // LINK-05 at 1440 and 360
    if (w === REF.desktop || w === REF.mobile) {
      for (const l of (s.links || []).filter(x => x.vis)) { T('LINK-05'); if (!l.name) F('LINK-05', { where: p, el: l.sel, href: l.href, why: 'link without an accessible name' }, `${p}|${l.sel}|${l.href}`); }
      for (const b of s.buttonsNoName || []) { T('LINK-05'); F('LINK-05', { where: p, el: b, why: 'button without an accessible name' }, `${p}|${b}`); }
    }
    if (!desk) continue;
    const toggles = new Set((s.toggleAnchors || []).map(t => t.sel + '|' + t.href));
    for (const l of s.links || []) {
      const h = l.href; const raw = h === null ? null : String(h).trim();
      if (raw === null && !l.name && !l.hasImg) continue; // <a id> anchor targets
      T('LINK-01');
      if ((raw === null || raw === '' || raw === '#' || /^javascript:/i.test(raw)) && !toggles.has(l.sel + '|' + h)) F('LINK-01', { where: p, el: l.sel, text: l.name, href: raw === null ? '(no href)' : raw }, `${p}|${l.sel}|${raw}|${l.name}`);
      if (l.sameDoc) T('LINK-02');
      if (l.abs && /^https?:/i.test(l.abs) && thirdParty(l.abs)) { T('LINK-04'); if (l.target !== '_blank' || !/noopener|noreferrer/i.test(l.rel || '')) F('LINK-04', { where: p, href: l.abs.slice(0, 100), target: l.target || '(none)', rel: l.rel || '(none)' }, `${p}|${l.abs}`); }
    }
    for (const x of s.anchorsMissing || []) F('LINK-02', { where: p, anchor: x, why: 'no element with this id / name on the page' }, `${p}|${x}`);
    // LINK-06
    T('LINK-06');
    for (const x of s.fakeClickable || []) { const strong = /^(book|buy|get|start|learn|view|contact|call|send|apply|join|shop|order|read|see|explore|claim|download|sign|subscribe|request)\b/i.test(x.text); (strong ? F : Q)('LINK-06', { where: p, el: x.sel, text: x.text, why: x.pointer ? 'cursor:pointer but not a link or button' : 'button-like class but not a link or button' }, `${p}|${x.sel}|${x.text}`); }
    // LINK-08 / LINK-09: contacts
    for (const c of s.contactLinks || []) {
      T('LINK-08'); const href = c.href; const lower = href.toLowerCase();
      if (lower.startsWith('mailto:')) {
        const addr = decodeURIComponent(href.slice(7).split('?')[0]).trim();
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr)) F('LINK-08', { where: p, href, why: 'malformed mailto' }, `${p}|${href}`);
        else if (/@(example\.(com|org|net)|domain\.com|test\.com|email\.com|yoursite|yourdomain|company\.com)$/i.test(addr) || /^(you|your|name|email|test|info@example)/i.test(addr.split('@')[0]) && /example|domain|yoursite/i.test(addr)) F('LINK-08', { where: p, href, why: 'template sample address' }, `${p}|${href}`);
        const shown = (c.text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i) || [])[0];
        if (shown && shown.toLowerCase() !== addr.toLowerCase()) F('LINK-08', { where: p, href, text: c.text, why: 'mails a different address than the text shows' }, `${p}|${href}|${shown}`);
        const want = DEC.contacts && DEC.contacts.emails; if (Array.isArray(want) && want.length && !want.map(x => String(x).toLowerCase()).includes(addr.toLowerCase())) F('LINK-08', { where: p, href, want, why: 'not in decisions.contacts.emails' }, `${p}|${href}|dec`);
      } else if (lower.startsWith('tel:')) {
        const num = href.slice(4).replace(/[^\d+]/g, ''); const digits = num.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15 || /[^\d+\s().\-%20]/.test(decodeURIComponent(href.slice(4)).replace(/\s/g, ''))) F('LINK-08', { where: p, href, why: 'malformed tel: number' }, `${p}|${href}`);
        else if (/555-?01\d\d|^\+?1?5550\d{3}|^0+$|^1234567|(\d)\1{6,}/.test(digits) || /555-?01\d\d/.test(href)) F('LINK-08', { where: p, href, why: 'template sample number' }, `${p}|${href}`);
        const td = (c.text || '').replace(/\D/g, ''); if (td.length >= 7 && !digits.endsWith(td.slice(-7)) && !td.endsWith(digits.slice(-7))) F('LINK-08', { where: p, href, text: c.text, why: 'dials a different number than the text shows' }, `${p}|${href}|${td}`);
        const want = DEC.contacts && DEC.contacts.phones; if (Array.isArray(want) && want.length && !want.map(x => String(x).replace(/\D/g, '')).some(x => x && (digits.endsWith(x.slice(-9)) || x.endsWith(digits.slice(-9))))) F('LINK-08', { where: p, href, want, why: 'not in decisions.contacts.phones' }, `${p}|${href}|dec`);
      }
    }
    for (const c of s.contactText || []) { T('LINK-09'); F('LINK-09', { where: p, kind: c.kind, value: c.v, el: c.sel, in: c.ctx, why: `visible ${c.kind} is not a ${c.kind === 'email' ? 'mailto:' : 'tel:'} link` }, `${p}|${c.v}`); }
    for (const c of s.contactLinks || []) if (c.vis) T('LINK-09');
    // LINK-11: social profiles
    for (const l of s.links || []) {
      let u; try { u = new URL(l.abs); } catch (e) { continue; }
      if (!SOCIAL.test(u.hostname) || SHARE_PATH.test(u.pathname)) continue;
      T('LINK-11'); const path0 = u.pathname.replace(/\/+$/, '');
      if (!path0 || /^\/(home|index|#)?$/i.test(path0)) F('LINK-11', { where: p, href: l.abs, why: 'points to the network root, not a profile' }, `${p}|${l.abs}`);
      if (Array.isArray(DEC.donor) && DEC.donor.some(d => d && l.abs.toLowerCase().includes(String(d).toLowerCase().replace(/^https?:\/\//, '')))) F('LINK-11', { where: p, href: l.abs, why: "points to the donor's profile" }, `${p}|${l.abs}|donor`);
      const want = Array.isArray(DEC.socialProfiles) ? DEC.socialProfiles : DEC.socialProfiles && typeof DEC.socialProfiles === 'object' ? Object.values(DEC.socialProfiles) : null;
      if (want && want.length) { const n = x => String(x).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').split('?')[0]; const same = want.map(n).filter(x => x.split('/')[0].replace(/^(m|mobile)\./, '') === n(l.abs).split('/')[0].replace(/^(m|mobile)\./, '')); if (same.length && !same.includes(n(l.abs))) F('LINK-11', { where: p, href: l.abs, want: same, why: 'differs from decisions.socialProfiles' }, `${p}|${l.abs}|dec`); }
    }
    // LINK-13: controls do something
    for (const t of s.toggleAnchors || []) { T('LINK-13'); F('LINK-13', { where: p, el: t.sel, text: t.text, href: t.href, why: 'a toggle built as <a href="#…"> — use a <button>' }, `${p}|${t.sel}|${t.text}`); }
    const hk = s.btnHandlers && s.btnHandlers.kinds;
    for (const b of s.buttons || []) {
      T('LINK-13'); if (b.attrAction) continue;
      const kind = hk ? hk[b.i] : null; const sig = b.sel + '|' + b.text; const v = BTN_VERDICT[sig];
      if (kind === 'none' || v === 'dead') F('LINK-13', { where: p, el: b.sel, text: b.text, why: kind === 'none' ? 'button outside a form with no handler, no aria-controls / aria-expanded' : 'a click on the button changes nothing' }, `${sig}`);
      else if (kind === 'delegated' && v === undefined) Q('LINK-13', { where: p, el: b.sel, text: b.text, why: 'only a page-wide (delegated) listener; the click was not tested on this page' }, `${sig}|q`);
      else if (!hk) NR('LINK-13', `partial: listener hook not readable on ${p}`);
    }
  }
}

function evalJs() {
  // JS-01: page errors, first-party console errors and failed requests — static loads and every interaction phase
  const agg = new Map();
  const add = (kind, engine, p, text, url, extra) => {
    const third = thirdParty(url); const k = `${kind}|${third ? 't' : 'f'}|${text}|${third ? '' : url}`;
    const x = agg.get(k) || { kind, third, text, url, engines: new Set(), pages: new Set(), extra }; x.engines.add(engine); x.pages.add(p); agg.set(k, x);
  };
  const scan = (engine, p, w, net) => {
    if (!net) return; T('JS-01');
    for (const e of net.errors) add('uncaught error', engine, p, e.text, e.url);
    for (const c of net.console) add('console error', engine, p, c.text, c.url);
    for (const f of net.failed) add(`failed ${f.type}`, engine, p, `${fileOf(f.url)} (${f.why})`, f.url);
  };
  for (const engine of Object.keys(STAT)) for (const [k, s] of Object.entries(STAT[engine]).sort((x, y) => cmpKey(x[0], y[0]))) { if (!s || s.fail || !s.net) continue; const [p, w] = splitKey(k); scan(engine, p, w, s.net); delete s.net; }
  for (const [, j] of [...JSLOG.entries()].sort((x, y) => byStr(x[0], y[0]))) scan(j.engine, j.p, j.w, j.net);
  for (const x of [...agg.values()].sort((a1, b1) => byStr(a1.kind + a1.text, b1.kind + b1.text))) {
    const item = { kind: x.kind, text: x.text.slice(0, 160), engines: [...x.engines].sort(byStr), pages: [...x.pages].sort(byStr).slice(0, 8), url: x.url ? x.url.slice(0, 120) : undefined };
    (x.third ? Q : F)('JS-01', Object.assign(item, x.third ? { why: 'third-party — confirm it does not affect the page' } : {}), `${x.kind}|${x.third}|${x.text}`);
  }
}

function evalA11y() {
  for (const { p, w, s, W } of measured('chromium')) {
    if (s.contrast && !s.contrast.error) {
      T('A11Y-01');
      for (const x of s.contrast.fails) F('A11Y-01', { where: W, el: x }, `${p}|${w}|${x}`);
      if (s.contrast.totalFails > s.contrast.fails.length) NOTE('A11Y-01', `${W}: ${s.contrast.totalFails - s.contrast.fails.length} more low-contrast texts not listed`);
      for (const x of s.contrast.visual) Q('A11Y-01', { where: W, el: x, why: 'text over an image / blur / gradient — check the screenshot', shot: s.shot || undefined }, `${p}|${x}`);
      T('A11Y-08');
      for (const x of s.contrast.ph) F('A11Y-08', { where: W, el: x, state: 'placeholder' }, `${p}|${x}`);
      for (const x of s.contrast.bounds) F('A11Y-08', { where: W, el: x, state: 'field boundary' }, `${p}|${x}`);
      for (const x of s.contrast.disabled) Q('A11Y-08', { where: W, el: x, state: 'disabled', why: 'disabled control — is it meant to look disabled?' }, `${p}|${x}`);
    } else if (s.contrast && s.contrast.error) NR('A11Y-01', `partial: contrast not measured on ${W}: ${s.contrast.error}`);
    if (w === REF.desktop) {
      T('A11Y-06');
      if (s.h1.length !== 1) F('A11Y-06', { where: p, h1: s.h1.length, texts: s.h1.slice(0, 3), why: s.h1.length ? 'more than one <h1>' : 'no <h1>' }, `${p}|h1`);
      for (const x of s.headingSkips || []) F('A11Y-06', { where: p, skip: x }, `${p}|${x}`);
      for (const g of s.tabGroups || []) { T('A11Y-04'); if (!g.roleTab || !g.tablist || !g.selected) F('A11Y-04', { where: p, group: g.sel, roleTab: g.roleTab, tablist: g.tablist, ariaSelected: g.selected, why: 'tabs without role=tablist / tab + aria-selected' }, `${p}|${g.sel}`); }
    }
    if (w === REF.desktop || w === REF.mobile) { T('A11Y-05'); for (const x of s.smallTargets || []) F('A11Y-05', { where: W, el: x, why: 'pointer target under 24×24px' }, `${p}|${w}|${x}`); }
  }
}

const mode = arr => { const c = {}; arr.forEach(v => { c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((x, y) => y[1] - x[1] || byStr(String(x[0]), String(y[0])))[0]; };
function evalLayout() {
  const btnGroups = {}; const headGroups = {};
  for (const { p, w, s, W } of measured('chromium')) {
    T('LAY-01'); if (s.overflowX > 0) F('LAY-01', { where: W, px: s.overflowX, why: 'horizontal scroll' }, `${p}|${w}`);
    T('LAY-02'); for (const x of s.clipped || []) (/^img/.test(x.sel) ? Q : F)('LAY-02', { where: W, el: x.sel, text: x.text, left: x.left, right: x.right, why: /^img/.test(x.sel) ? 'image bleeds past the viewport — intended?' : 'clipped by the viewport' }, `${p}|${w}|${x.sel}|${x.text}`);
    T('LAY-03'); for (const x of s.edges || []) F('LAY-03', { where: W, el: x.sel, text: x.text, L: x.L, R: x.R, why: `text closer than ${DEC.edgeMinPx}px to the viewport edge` }, `${p}|${w}|${x.sel}|${x.text}`);
    for (const x of s.grids || []) { if (x.cols === 2 || x.cols === 3) F('LAY-04', { where: W, grid: x.sel, cards: x.cards, cols: x.cols, lastRow: x.lastRow, why: 'orphan card(s) in the last row' }, `${p}|${w}|${x.sel}`); }
    if ((s.grids || []).length || s.sectionModel) T('LAY-04');
    T('LINK-14'); for (const x of s.noPointer || []) F('LINK-14', { where: W, el: x.sel, text: x.text, cursor: x.cursor, why: `clickable element shows cursor: ${x.cursor}, not pointer` }, `${p}|${x.sel}|${x.text}`);
    T('LAY-19'); for (const x of s.rails || []) ((w >= 768 && !(DEC.railsAllowed)) ? F : Q)('LAY-19', { where: W, el: x.sel, scrollW: x.scrollW, clientW: x.clientW, items: x.items, shot: x.shot || null, why: `horizontal scroll rail: ${x.scrollW}px of content in ${x.clientW}px, cards cut at the edge` }, `${p}|${w}|${x.sel}`);
    T('LAY-20'); for (const x of s.linkGaps || []) F('LAY-20', { where: W, group: x.sel, links: x.links.join(' · '), h: x.h.join('/'), v: x.v.join('/'), shot: x.shot || null, why: `${x.why}: horizontal ${x.h.join('/')}px, vertical ${x.v.join('/')}px` }, `${p}|${w}|${x.sel}`);
    T('LAY-22'); for (const x of s.narrow || []) F('LAY-22', { where: W, el: x.sel, box: x.box, text: x.text, cpl: x.cpl, lines: x.lines, why: `text squeezed to ~${x.cpl} characters per line (${x.lines} lines, ${x.width}px wide, ${x.cols} columns)` }, `${p}|${w}|${x.box}`);
    T('LAY-18'); for (const x of s.rowGaps || []) (x.kind === 'touch' ? F : Q)('LAY-18', { where: W, grid: x.sel, row: x.row, gap: x.gap, colGap: x.colGap, rowGap: x.rowGapCss, shot: x.shot || null, why: x.kind === 'touch' ? `row ${x.row} sits ${x.gap}px under the row above (row-gap ${x.rowGapCss}, column gap ${x.colGap}px)` : `row gap ${x.gap}px vs column gap ${x.colGap}px — intended?` }, `${p}|${w}|${x.sel}|${x.row}`);
    if (w < 768) { T('LAY-05'); for (const x of s.align || []) F('LAY-05', { where: W, section: x.section, el: x.el, text: x.text, why: 'left-stuck block in a centred section' }, `${p}|${w}|${x.el}|${x.text}`); }
    T('LAY-08'); for (const x of s.fractional || []) F('LAY-08', { where: W, el: x, why: 'fractional pixels' }, `${p}|${w}|${x}`);
    if (s.fractionalCapped) NOTE('LAY-08', `${W}: more than 200 fractional values — list capped`);
    // LAY-10: one inset scale per tier for same-role sections
    const secs = (s.sectionPad || []).filter(x => x.inTop !== null && x.inBot !== null);
    if (secs.length >= 2) {
      T('LAY-10'); const byKey = {}; secs.forEach((x, i) => (byKey[x.key] = byKey[x.key] || []).push(Object.assign({ i }, x)));
      for (const [k, list] of Object.entries(byKey)) { if (list.length < 2) continue; const mT = +mode(list.map(x => x.inTop))[0], mB = +mode(list.map(x => x.inBot))[0]; for (const x of list) if (Math.abs(x.inTop - mT) > 2 || Math.abs(x.inBot - mB) > 2) F('LAY-10', { where: W, section: x.sel, inset: `${x.inTop}/${x.inBot}`, usual: `${mT}/${mB}`, role: k, why: 'section inset differs from same-role sections' }, `${p}|${w}|${x.sel}|${x.i}`); }
      const allT = secs.map(x => Math.min(x.inTop, x.inBot)); const med = sortNum(allT)[Math.floor(allT.length / 2)];
      for (const x of secs) if (Math.min(x.inTop, x.inBot) <= 2 && med >= 24 && x.h > 100) F('LAY-10', { where: W, section: x.sel, inset: `${x.inTop}/${x.inBot}`, why: 'section at ~0 inset while its siblings carry the scale' }, `${p}|${w}|${x.sel}|zero`);
    }
    // LAY-11 / LAY-12 / LAY-13 / LAY-14 / LAY-15 / LAY-16 / LAY-17
    T('LAY-11'); for (const x of s.panels || []) F('LAY-11', { where: W, el: x.el, text: x.text, panel: x.panel, side: x.side, px: x.px, why: `text closer than ${DEC.edgeMinPx}px to a painted edge` }, `${p}|${w}|${x.el}|${x.side}|${x.text}`);
    for (const x of s.asym || []) F('LAY-11', { where: W, el: x.el, text: x.text, L: x.L, R: x.R, usual: x.usual, why: 'one-sided inset smaller than the rest of its section' }, `${p}|${w}|${x.el}|asym|${x.text}`);
    if ((s.sectionPad || []).length >= 2) { T('LAY-12'); for (const x of s.bgChange || []) F('LAY-12', { where: W, boundary: x.boundary, side: x.side, px: x.px, why: `content closer than ${DEC.edgeMinPx}px to a background change` }, `${p}|${w}|${x.boundary}|${x.side}`); }
    const le = (s.leftEdge || []); if (le.length >= 2) {
      T('LAY-13'); const mx = +mode(le.map(x => x.x))[0];
      for (const x of le) if (Math.abs(x.x - mx) > 2) F('LAY-13', { where: W, what: x.what, el: x.sel, x: x.x, edge: mx, why: 'left edge differs from the container edge (±2px)' }, `${p}|${w}|${x.sel}`);
      const ct = DEC.container; if (ct && ct.width) { const gut = +ct.gutter || 0; const want = w > ct.width + 2 * gut ? Math.round((w - ct.width) / 2) : gut; if (Math.abs(mx - want) > 2) F('LAY-13', { where: W, edge: mx, want, container: ct, why: 'container edge differs from decisions.container' }, `${p}|${w}|container`); }
    }
    for (const x of s.skeleton || []) T('LAY-14');
    if (w === REF.desktop || w === REF.mobile) { const iw = s.iconWeights || {}; for (const [g, list] of Object.entries(iw)) { const ws = list.filter(x => typeof x.w === 'number'); if (ws.length < 2) continue; T('LAY-15'); const vals = ws.map(x => x.w); if (Math.max.apply(null, vals) - Math.min.apply(null, vals) > 0.25) F('LAY-15', { where: W, group: g, weights: uniq(vals).sort((x, y) => x - y), els: ws.slice(0, 6).map(x => `${x.sel} ${x.w}`), why: 'icon stroke differs within the group (±0.25px)' }, `${p}|${w}|${g}`); } }
    T('LAY-16'); for (const x of s.truncated || []) (w <= 768 ? F : Q)('LAY-16', { where: W, el: x.el, text: x.text, why: `truncated copy (${x.why})` }, `${p}|${w}|${x.el}|${x.text}`);
    T('LAY-17'); for (const x of s.art || []) { if (x.over) F('LAY-17', { where: W, section: x.section, art: x.art, text: x.text, why: 'decorative art paints over a text line' }, `${p}|${w}|${x.art}|${x.text}`); else if (x.near) Q('LAY-17', { where: W, section: x.section, art: x.art, text: x.text, gap: x.gap, why: `text ${x.gap}px from decorative art` }, `${p}|${w}|${x.art}|${x.text}|near`); }
    // material for LAY-07 (site-wide per width)
    for (const b of s.btnSig || []) { if (b.exempt) continue; (btnGroups[w] = btnGroups[w] || []).push(Object.assign({ page: p }, b)); }
    for (const h of s.headings || []) (headGroups[w + '|' + h.key] = headGroups[w + '|' + h.key] || []).push(Object.assign({ page: p }, h));
    for (const set of s.siblingSets || []) {
      T('LAY-07'); const mm = set.members; if (mm.length < 3) continue;
      for (const prop of ['pad', 'rad', 'border']) { const md = mode(mm.map(x => x[prop])); const off = mm.filter(x => x[prop] !== md[0]); if (off.length && off.length <= mm.length / 3) F('LAY-07', { where: W, set: set.sel, prop, usual: md[0], off: off.slice(0, 4).map(x => `${x.text} ${x[prop]}`), why: `sibling ${prop === 'pad' ? 'padding' : prop === 'rad' ? 'radius' : 'border'} differs within one set` }, `${p}|${w}|${set.sel}|${prop}`); }
      const rows = {}; mm.forEach(x => (rows[x.row] = rows[x.row] || []).push(x.w)); for (const ws of Object.values(rows)) if (ws.length >= 2 && Math.max.apply(null, ws) - Math.min.apply(null, ws) > 2) { F('LAY-07', { where: W, set: set.sel, widths: ws, why: 'siblings in one row differ in width' }, `${p}|${w}|${set.sel}|w`); break; }
      if (set.gaps.length >= 2 && Math.max.apply(null, set.gaps) - Math.min.apply(null, set.gaps) > 2) F('LAY-07', { where: W, set: set.sel, gaps: uniq(set.gaps), why: 'unequal gaps between siblings' }, `${p}|${w}|${set.sel}|gap`);
      const ars = mm.map(x => x.ar).filter(x => x); if (ars.length >= 3 && Math.max.apply(null, ars) - Math.min.apply(null, ars) > 0.05) F('LAY-07', { where: W, set: set.sel, ratios: uniq(ars), why: 'media aspect ratio differs within the set' }, `${p}|${w}|${set.sel}|ar`);
    }
  }
  // LAY-07: buttons by look per width (header included) and headings per tag+class
  for (const [w, list] of Object.entries(btnGroups)) {
    const byCls = {}; list.forEach(b => (byCls[b.cls || '(no class)'] = byCls[b.cls || '(no class)'] || []).push(b));
    for (const [c, bl] of Object.entries(byCls)) {
      T('LAY-07'); if (bl.length < 2) continue; const key = b => `${b.h}|${b.pad}|${b.r}|${b.fs}`; const md = mode(bl.map(key));
      const off = bl.filter(b => key(b) !== md[0]); const offU = [...new Map(off.map(b => [b.text + key(b) + b.region, b])).values()];
      if (offU.length && offU.length <= bl.length / 2) offU.slice(0, 6).forEach(b => F('LAY-07', { where: `${b.page} @${w}`, group: c, region: b.region, usual: md[0], actual: key(b), text: b.text, why: 'button variant measures differently (height|padding|radius|font-size)' }, `${w}|${c}|${b.text}|${key(b)}`));
    }
  }
  for (const [k, list] of Object.entries(headGroups)) {
    if (list.length < 2) continue; const [w] = k.split('|'); const key = h => `${h.fs}|${h.lh}|${h.fw}|${h.ff}|${h.tt}`; const md = mode(list.map(key));
    const off = list.filter(h => key(h) !== md[0]); if (off.length && off.length <= list.length / 3) off.slice(0, 4).forEach(h => F('LAY-07', { where: `${h.page} @${w}`, heading: h.key, usual: md[0], actual: key(h), text: h.text, why: 'heading of the same tag+class measures differently' }, `${k}|${h.text}|${key(h)}`));
  }
  // LAY-14: spacing skeleton per tier (decisions.spacing or the site's most common value)
  const sk = {}; for (const { p, w, s } of measured('chromium')) for (const r of s.skeleton || []) for (const f of ['headingText', 'textButton', 'headContent']) if (typeof r[f] === 'number') (sk[w + '|' + f] = sk[w + '|' + f] || []).push({ p, v: r[f], section: r.section, heading: r.heading });
  for (const [k, list] of Object.entries(sk)) {
    const [w, f] = k.split('|'); const dv = DEC.spacing && (typeof DEC.spacing[f] === 'number' ? DEC.spacing[f] : DEC.spacing[w] && DEC.spacing[w][f]);
    const want = typeof dv === 'number' ? dv : (list.length >= 3 ? +mode(list.map(x => x.v))[0] : null); if (want === null) continue;
    for (const x of list) if (Math.abs(x.v - want) > 2) F('LAY-14', { where: `${x.p} @${w}`, section: x.section, heading: x.heading, gap: f, px: x.v, want, why: `${f} spacing off the ${typeof dv === 'number' ? 'decided' : 'site-wide'} value` }, `${x.p}|${w}|${x.section}|${f}`);
  }
  // INT-08 (stuck after scroll) and INT-13 (static hover layers)
  for (const { p, w, s, W } of measured('chromium')) {
    if (s.stuckDone) { T('INT-08', Math.max(1, s.stuckChecked || 0)); for (const x of s.stuck || []) F('INT-08', { where: W, el: x.sel, opacity: x.op, evidence: x.ev, why: 'left at an animation start value after scrolling into view' }, `${p}|${w}|${x.sel}`); }
    if (w === REF.desktop) { T('INT-13', s.hoverLayersChecked || 0); for (const x of s.hoverLayers || []) F('INT-13', { where: W, el: x.el, pseudo: x.pseudo, cell: x.cell, cellH: x.cellH, layerH: x.layerH, why: 'hover layer shorter than its grid/flex cell' }, `${p}|${x.el}`); }
  }
}

const GENERIC_ALT = /^(image|img|photo|picture|pic|graphic|banner|icon|logo|untitled|placeholder|default|thumbnail|hero|bg|background|null|undefined|alt|alt text|image of|photo of)\s*\d*$/i;
const FILE_ALT = /\.(jpe?g|png|webp|avif|gif|svg)$|^(img|dsc|image|photo|screenshot|screen shot)[-_ ]?\d+|^[\w-]+[-_]\d{2,4}x\d{2,4}$|^[a-f0-9]{16,}$/i;
function evalMedia() {
  const ogMax = DEC.assetMaxKB && DEC.assetMaxKB.ogImage;
  for (const { p, w, s, W } of measured('chromium')) {
    const desk = w === REF.desktop;
    for (const i of s.imgs || []) {
      const f = fileOf(i.src || i.key); const data = /^data:/.test(i.src || '');
      if (desk) {
        T('IMG-01'); if (i.alt === null) F('IMG-01', { where: p, img: f, why: 'no alt attribute' }, `${p}|${i.key}`); else if (!i.alt.trim() && i.vis && !data) F('IMG-01', { where: p, img: f, why: 'empty alt on a visible image' }, `${p}|${i.key}`);
        T('IMG-02'); if ((!i.w || !i.h) && !data && i.key) F('IMG-02', { where: p, img: f, width: i.w, height: i.h }, `${p}|${i.key}`);
        if (i.vis && i.rw >= 64) { T('IMG-04'); const a = ASSETS.get((i.cur || '').split('#')[0]); const mime = a && a.mime ? a.mime : ''; if (/\.(jpe?g|png)(\?|$)/i.test(i.cur || i.src) && !/webp|avif/i.test(mime)) F('IMG-04', { where: p, img: f, why: 'content image not in WebP/AVIF' }, `${i.key}`); }
        if (i.alt && i.alt.trim()) { T('IMG-08'); const al = i.alt.trim(); if (GENERIC_ALT.test(al) || FILE_ALT.test(al) || !/\p{L}/u.test(al)) F('IMG-08', { where: p, img: f, alt: al.slice(0, 60), why: 'alt is a generic word, a file name or has no letters' }, `${p}|${i.key}|${al}`); }
      }
      if (desk || w === REF.mobile) { if (i.vis && i.rw > 8 && i.nw > 2 * i.rw && !/\.svg(\?|$)/i.test(i.cur || '')) { T('IMG-03'); F('IMG-03', { where: W, img: f, natural: i.nw, rendered: i.rw, ratio: +(i.nw / i.rw).toFixed(1), why: 'served more than 2× its rendered width (DPR 1)' }, `${p}|${w}|${i.key}`); } else if (i.vis && i.nw) T('IMG-03'); }
      if (i.vis) { T('IMG-06'); if (i.broken) F('IMG-06', { where: W, img: f, why: 'visible broken image' }, `${p}|${i.key}`); }
    }
    T('IMG-05'); for (const x of s.preLazy || []) F('IMG-05', { where: W, img: x.src, top: x.top, why: 'loading=lazy on an image visible in the first viewport' }, `${p}|${w}|${x.key}`);
    if (desk) {
      // IMG-08: one alt shared by ≥3 different pictures
      const byAlt = {}; (s.imgs || []).filter(i => i.alt && i.alt.trim() && i.vis).forEach(i => { (byAlt[i.alt.trim()] = byAlt[i.alt.trim()] || new Set()).add(i.key); });
      for (const [al, set] of Object.entries(byAlt)) if (set.size >= 3) Q('IMG-08', { where: p, alt: al.slice(0, 60), pictures: set.size, why: 'one alt shared by different pictures' }, `${p}|${al}|shared`);
      T('IMG-09'); for (const b of s.bgImgs || []) Q('IMG-09', { where: p, el: b.sel, file: b.file, size: `${b.w}×${b.h}`, why: 'background image without a text alternative — does it carry meaning (logo, portrait, infographic)?', shot: s.shot || undefined }, `${b.file}|${b.sel}`);
    }
    // video
    if (desk || w === REF.mobile) {
      for (const v of s.videos || []) {
        T('VID-01'); if (!v.poster) F('VID-01', { where: p, video: v.src, why: 'no poster' }, `${p}|${v.url}|poster`);
        if (v.autoplay && !(v.muted && v.loop && v.playsinline)) F('VID-01', { where: p, video: v.src, muted: v.muted, loop: v.loop, playsinline: v.playsinline, why: 'autoplay video must be muted + loop + playsinline' }, `${p}|${v.url}|attrs`);
        const bg = v.autoplay && v.muted && !v.controls;
        if (v.vw) { T('VID-02'); if (v.fs && !bg && v.vw < DEC.minVideoWidth) F('VID-02', { where: W, video: v.src, videoWidth: v.vw, want: DEC.minVideoWidth, why: 'too small for full-screen viewing' }, `${v.url}|fs`); else if (v.vw < v.rw) F('VID-02', { where: W, video: v.src, videoWidth: v.vw, rendered: v.rw, why: 'video narrower than its rendered width' }, `${v.url}|${w}|rw`); }
        else NR('VID-02', `partial: ${W} ${v.src}: resolution not measurable (${v.vwWhy || 'no metadata'})`);
        T('VID-03'); if (v.err) F('VID-03', { where: W, video: v.src, error: v.err, why: 'media error' }, `${v.url}|err`);
        else if (v.autoplay && v.vis && (v.playing === 'paused' || (v.playing && v.ticks === 0))) F('VID-03', { where: W, video: v.src, state: v.playing, ticks: v.ticks, why: 'autoplay video does not play while in view' }, `${v.url}|${w}|play`);
      }
      for (const e of s.embeds || []) NR('VID-02', `partial: ${p} ${e.provider} embed — its resolution is set by the provider (check the player quality setting)`);
    }
    // fonts
    if (desk || w === REF.mobile) {
      T('FONT-01');
      for (const x of s.fontIssues || []) F('FONT-01', { where: W, family: x.family, kind: x.kind, el: x.el, text: x.text, why: x.kind === 'undeclared' ? 'rendered family has no @font-face and is not in decisions.fonts / systemFonts' : x.kind === 'not-loaded' ? 'declared face did not load' : x.kind === 'control-ua-font' ? 'form control does not inherit the site font' : 'family not in decisions.fonts' }, `${x.family}|${x.kind}`);
      for (const fam of s.fontErrors || []) F('FONT-01', { where: W, family: fam, why: 'font face failed to load' }, `${fam}|error`);
    }
  }
  // IMG-07: per-file bytes (Chromium network log)
  const KB = Object.assign({ raster: 300, svg: 50, favicon: 20, ogImage: 200, font: 150 }, DEC.assetMaxKB || {});
  for (const [u, x] of [...ASSETS.entries()].sort((a1, b1) => byStr(a1[0], b1[0]))) {
    if (!x.status || x.status >= 300) continue;
    const kind = /favicon|apple-touch-icon|\.ico(\?|$)/i.test(u) ? 'favicon' : /svg/i.test(x.mime || '') || /\.svg(\?|$)/i.test(u) ? 'svg' : /^image\//i.test(x.mime || '') || x.type === 'Image' ? 'raster' : x.type === 'Font' || /font/i.test(x.mime || '') ? 'font' : null;
    if (!kind) continue; T('IMG-07');
    const kb = Math.round(x.bytes / 1024);
    if (!x.bytes) Q('IMG-07', { file: fileOf(u), kind, why: '0 bytes reported (cache / service worker / stream) — check the file size by hand', pages: [...x.pages].sort(byStr).slice(0, 3) }, u);
    else if (kb > KB[kind]) F('IMG-07', { file: fileOf(u), kind, KB: kb, max: KB[kind], pages: [...x.pages].sort(byStr).slice(0, 3), url: u.slice(0, 120) }, u);
  }
  void ogMax;
  // FONT-02: self-hosted, font-display: swap, declared pairs = used pairs
  const face = {}, used = {}; const hosted = new Set();
  for (const { s } of measured('chromium', w => w === REF.desktop)) {
    for (const f of s.faces || []) { if (/awesome|icon|dashicons|material|glyph|eicons|ionicons/i.test(f.family)) continue; const k = f.family + '|' + f.weight + '|' + f.style; face[k] = face[k] || f; if (f.status === 'loaded') face[k].loaded = true; }
    for (const pr of s.fontPairs || []) used[pr.k] = used[pr.k] || pr.sel;
  }
  for (const u of ASSETS.keys()) if (/fonts\.(gstatic|googleapis)\.com|use\.typekit\.net|fonts\.bunny\.net|fast\.fonts\.net|cloud\.typography\.com/i.test(u)) hosted.add(new URL(u).host);
  const faceList = Object.values(face);
  if (faceList.length) {
    T('FONT-02');
    for (const h of [...hosted].sort(byStr)) F('FONT-02', { host: h, why: 'fonts served by a third-party host (not self-hosted)' }, `host|${h}`);
    for (const f of faceList.sort((x, y) => byStr(x.family + x.weight, y.family + y.weight))) if ((f.display || 'auto') !== 'swap') F('FONT-02', { family: f.family, weight: f.weight, display: f.display || 'auto', why: 'font-display is not swap' }, `display|${f.family}|${f.weight}|${f.style}`);
    const inRange = (wt, spec) => { const m = String(spec).split(/\s+/).map(Number).filter(n => !isNaN(n)); if (m.length === 2) return wt >= m[0] && wt <= m[1]; return m.length ? m[0] === wt : false; };
    for (const [k, sel] of Object.entries(used).sort((x, y) => byStr(x[0], y[0]))) {
      const [fam, wt, st] = k.split('|'); const faces = faceList.filter(f => f.family === fam); if (!faces.length) continue;
      if (!faces.some(f => inRange(+wt, f.weight) && (st === 'normal' ? f.style === 'normal' : f.style !== 'normal'))) F('FONT-02', { family: fam, weight: wt, style: st, el: sel, why: 'used weight/style has no declared face (synthesised)' }, `syn|${k}`);
    }
    for (const f of faceList) if (f.loaded && !Object.keys(used).some(k => { const [fam, wt, st] = k.split('|'); return fam === f.family && inRange(+wt, f.weight) && (st === 'normal' ? f.style === 'normal' : f.style !== 'normal'); })) F('FONT-02', { family: f.family, weight: f.weight, style: f.style, why: 'loaded face is never used on the measured pages' }, `unused|${f.family}|${f.weight}|${f.style}`);
  } else if (measured('chromium', w => w === REF.desktop).length) NA('FONT-02', 'no web fonts (@font-face) on the measured pages — system fonts only');
}

const UK_WORDS = ['colour', 'centre', 'organisation', 'optimise', 'personalise', 'analyse', 'favourite', 'programme', 'travelling', 'neighbour', 'behaviour', 'customise', 'recognise', 'licence', 'realise', 'catalogue', 'honour', 'labour', 'defence', 'grey', 'jewellery', 'cheque', 'tyre', 'fulfil', 'enrol', 'specialise', 'utilise', 'minimise', 'maximise', 'prioritise'];
const US_WORDS = ['color', 'center', 'organization', 'optimize', 'personalize', 'analyze', 'favorite', 'program', 'traveling', 'neighbor', 'behavior', 'customize', 'recognize', 'license', 'realize', 'catalog', 'honor', 'labor', 'defense', 'gray', 'jewelry', 'check', 'tire', 'fulfill', 'enroll', 'specialize', 'utilize', 'minimize', 'maximize', 'prioritize'];
const SMALL_W = /^(a|an|the|and|or|but|nor|of|to|in|on|for|with|at|by|from|per|vs|via|as|into|onto|up|your|our|my|its|is|be)$/i;
const STOP_END = /\b(and|or|the|a|an|to|of|with|for|in|on|at|by|from|that|which|our|your|is|are)$/i;
function evalText() {
  const desk = measured('chromium', w => w === REF.desktop);
  const curYear = String(DEC.copyrightYear || new Date().getUTCFullYear());
  // TEXT-01 / TEXT-05 per page
  for (const { p, w, s, W } of measured('chromium', w => w === REF.desktop || w === REF.mobile)) { T('TEXT-01'); for (const x of s.br || []) F('TEXT-01', { where: W, in: x.in, text: x.text, why: '<br> inside copy' }, `${p}|${x.in}|${x.text}`); }
  for (const { p, s } of desk) {
    T('TEXT-05');
    for (const x of s.placeholders || []) F('TEXT-05', { where: p, text: x.text, in: x.in, why: 'placeholder text' }, `${p}|${x.text}|${x.in}`);
    for (const x of s.devMarkers || []) F('TEXT-05', { where: p, text: x, why: 'developer marker in the text' }, `${p}|${x}`);
    for (const x of s.rawTokens || []) F('TEXT-05', { where: p, text: x, why: 'raw template token' }, `${p}|${x}`);
  }
  // TEXT-03: one English variant
  if (decided('TEXT-03', 'englishVariant')) {
    const want = DEC.englishVariant === 'UK' ? US_WORDS : UK_WORDS; const other = [];
    for (const { p, s } of desk) {
      if (!enPage(s)) { other.push(p); continue; }
      T('TEXT-03'); const hay = [s.text || '', (s.imgs || []).map(i => i.alt || '').join(' '), s.meta ? [s.meta.title, s.meta.desc].join(' ') : ''].join('\n');
      for (const wd of want) { const m = hay.match(new RegExp('\\b' + wd + '(s|d|ed|ing|er|ers)?\\b', 'gi')); if (m) F('TEXT-03', { where: p, word: m[0], count: m.length, want: DEC.englishVariant, why: `${DEC.englishVariant === 'UK' ? 'US' : 'UK'} spelling on a ${DEC.englishVariant} English site` }, `${p}|${wd}`); }
    }
    if (other.length) NOTE('TEXT-03', `skipped (not English): ${other.slice(0, 10).join(', ')}`);
  }
  // TEXT-04: one capitalisation rule for buttons and arrow links (English pages)
  { const labels = uniq(desk.filter(x => enPage(x.s)).flatMap(x => x.s.buttonLabels || [])).sort(byStr);
    const kind = t => { const ws = t.split(/\s+/).filter(x => /^[A-Za-z]/.test(x)); const big = ws.slice(1).filter(x => !SMALL_W.test(x) && !/^[A-Z0-9&]{2,}s?$/.test(x)); if (!big.length) return null; const caps = big.filter(x => /^[A-Z]/.test(x)).length; return caps === big.length ? 'title' : caps === 0 ? 'sentence' : 'mixed'; };
    const by = { title: [], sentence: [], mixed: [] }; labels.forEach(t => { const k = kind(t); if (k) by[k].push(t); });
    const n = by.title.length + by.sentence.length + by.mixed.length;
    if (n) {
      T('TEXT-04', n); const rule = DEC.buttonCase || (by.title.length >= by.sentence.length ? 'title' : 'sentence');
      const off = (rule === 'title' ? by.sentence : by.title).concat(by.mixed);
      for (const t of off.slice(0, 30)) F('TEXT-04', { label: t, rule: rule === 'title' ? 'Title Case' : 'Sentence case', counts: `title ${by.title.length} · sentence ${by.sentence.length} · mixed ${by.mixed.length}`, decided: !!DEC.buttonCase }, t);
    } else NA('TEXT-04', 'no multi-word button or arrow-link labels on the English pages');
  }
  // TEXT-06: menu label = target page H1 / title
  { const navs = new Map(); desk.forEach(x => (x.s.navLabels || []).forEach(n => { const tp = L.pagePath(n.href, cfg); if (tp) navs.set(tp, n.label); }));
    for (const [tp, label] of [...navs.entries()].sort((x, y) => byStr(x[0], y[0]))) {
      if (tp === '/' || /^home$/i.test(label)) continue; // "Home" names the site, not a page title
      const t = statOf(tp, REF.desktop); if (!t) continue; T('TEXT-06');
      const target = norm((t.h1 || []).join(' ') + ' ' + (t.meta && t.meta.title || '')).toLowerCase(); const words = label.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 3);
      let shared = 0;
      for (const wd of words) { if (new RegExp('\\b' + wd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(target)) { shared++; continue; } const m = target.match(new RegExp('\\b' + wd.slice(0, 4).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\p{L}]*', 'u')); if (m && m[0] !== wd) F('TEXT-06', { menu: label, page: tp, pageSays: m[0], why: `menu "${wd}" vs page "${m[0]}" — one name per thing` }, `${tp}|${wd}`); else if (m) shared++; }
      if (words.length && !shared) Q('TEXT-06', { menu: label, page: tp, h1: (t.h1 || [])[0] || '', title: t.meta && t.meta.title, why: 'menu label shares no word with the page H1 / title' }, `${tp}|none`);
    }
  }
  // TEXT-07: one date format per language
  { const byLang = {};
    for (const { p, s } of desk) { const lang = ((s.meta && s.meta.lang) || 'und').toLowerCase().split('-')[0]; for (const d of s.dates || []) { T('TEXT-07'); const kinds = L.classifyDate(d); (byLang[lang] = byLang[lang] || []).push({ d, p, kinds }); } }
    for (const [lang, list] of Object.entries(byLang)) {
      if (DEC.dateFormat) { for (const x of list) if (x.kinds.length && !x.kinds.includes(DEC.dateFormat)) F('TEXT-07', { where: x.p, date: x.d, want: DEC.dateFormat, lang }, `${lang}|${x.d}`); continue; }
      const counts = {}; list.forEach(x => x.kinds.forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
      const best = Object.entries(counts).sort((x, y) => y[1] - x[1] || byStr(x[0], y[0]))[0]; if (!best) continue;
      const off = list.filter(x => x.kinds.length && !x.kinds.includes(best[0]));
      for (const x of off.slice(0, 20)) F('TEXT-07', { where: x.p, date: x.d, usual: best[0], lang, why: 'date format differs from the rest of the site (set decisions.dateFormat to pin one)' }, `${lang}|${x.d}`);
    }
  }
  // COPY-01: source copy (sources.copy)
  if (cfg.sources && cfg.sources.copy) {
    const f = path.resolve(cfg._configDir, String(cfg.sources.copy)); let src = null;
    try { src = fs.readFileSync(f, 'utf8'); } catch (e) { NR('COPY-01', `sources.copy not readable: ${f} (${errMsg(e)})`); }
    if (src !== null) {
      const site = norm(desk.map(x => x.s.text || '').join('\n')).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
      const blocks = src.replace(/\r/g, '').split(/\n\s*\n|\n(?=[#*\-•] )/).map(b => norm(b.replace(/^[#*\-•>\d.]+\s*/gm, ''))).filter(b => b.length >= 12);
      for (const b of blocks) { T('COPY-01'); const low = b.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"'); if (site.includes(low)) continue; const head = low.slice(0, 40); F('COPY-01', { block: b.slice(0, 120), why: site.includes(head) ? 'present but cut or changed' : 'missing on the site' }, b.slice(0, 80)); }
    }
  } else NR('COPY-01', "no client copy source (sources.copy) — route: the designer adds the client's copy file to qa-target.json sources.copy, or a person compares by hand");
  // COPY-02..07
  const h1s = {};
  for (const { p, s } of desk) {
    const blocks = (s.copy && s.copy.blocks) || []; T('COPY-02'); T('COPY-03');
    const seen = new Map(); for (const b of blocks) { const t = norm(b.text); if (t.length < 20) continue; if (seen.has(t) && seen.get(t) !== b.sel) Q('COPY-02', { where: p, text: t.slice(0, 80), why: 'the same text appears in two different blocks' }, `${p}|${t.slice(0, 60)}`); else seen.set(t, b.sel); }
    for (const b of blocks) { if (b.tag !== 'p') continue; const t = norm(b.text); if (t.length < 25) continue; if (/,$/.test(t) || STOP_END.test(t)) Q('COPY-03', { where: p, text: t.slice(-80), why: 'sentence ends in a comma or a stop-word — cut?' }, `${p}|${t.slice(-50)}`); }
    for (const g of (s.copy && s.copy.cardGroups) || []) {
      const ends = g.cards.filter(c => c.hasP).map(c => c.last); const dot = ends.filter(e => /[.!?]/.test(e)).length;
      if (ends.length >= 3 && dot >= ends.length - 1 && dot < ends.length) g.cards.filter(c => c.hasP && !/[.!?]/.test(c.last)).forEach(c => Q('COPY-03', { where: p, card: c.title, group: g.sel, why: 'lacks the ending its siblings have' }, `${p}|${g.sel}|${c.title}`));
      // COPY-05: the same label=value metric in cards with different titles
      T('COPY-05'); const byM = {}; g.cards.forEach(c => c.metrics.forEach(m => (byM[m] = byM[m] || new Set()).add(c.title)));
      for (const [m, titles] of Object.entries(byM)) if (titles.size >= 2) Q('COPY-05', { where: p, group: g.sel, metric: m, cards: [...titles].slice(0, 4), why: 'the same metric value in cards with different titles' }, `${p}|${g.sel}|${m}`);
      // COPY-07: card without text among siblings with text
      T('COPY-07'); const withText = g.cards.filter(c => c.textLen > 0).length; if (withText >= 2) g.cards.filter(c => c.textLen === 0).forEach(c => F('COPY-07', { where: p, group: g.sel, why: 'a card without text among siblings with text' }, `${p}|${g.sel}|empty`));
    }
    for (const sct of (s.copy && s.copy.emptySections) || []) { T('COPY-07'); F('COPY-07', { where: p, section: sct, why: 'a section with only a heading' }, `${p}|${sct}`); }
    // COPY-04: © year, cut numbers, price 0
    const ft = (s.copy && s.copy.footerText) || ''; T('COPY-04');
    const cm = ft.match(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i); if (cm && cm[1] !== curYear) F('COPY-04', { where: p, found: cm[0], want: curYear, why: '© year is not the current year' }, `year|${cm[1]}`);
    const txt = s.text || ''; const cut = txt.match(/\b(since|est\.?|established|founded in|from)\s+(\d{1,3})\b(?![\d,.])/i); if (cut) Q('COPY-04', { where: p, text: cut[0], why: 'a number looks cut ("since 20")' }, `${p}|${cut[0]}`);
    const z = txt.match(/[$€£]\s?0(?:[.,]00)?(?![\d.,])|\b0(?:[.,]00)?\s?(?:USD|EUR|GBP|\$|€|£)/); if (z) Q('COPY-04', { where: p, text: z[0], why: 'a price of 0' }, `${p}|${z[0]}`);
    if ((s.h1 || [])[0]) (h1s[norm(s.h1[0]).toLowerCase()] = h1s[norm(s.h1[0]).toLowerCase()] || []).push(p);
  }
  // COPY-06: H1 unique across pages; H1 equal to another page's menu label or title → ask
  { const titles = {}; desk.forEach(x => { if (x.s.meta && x.s.meta.title) titles[norm(x.s.meta.title).toLowerCase()] = x.p; });
    const labels = {}; desk.forEach(x => (x.s.navLabels || []).forEach(n => { const tp = L.pagePath(n.href, cfg); if (tp) labels[n.label.toLowerCase()] = tp; }));
    for (const [h, ps] of Object.entries(h1s).sort((x, y) => byStr(x[0], y[0]))) {
      T('COPY-06', ps.length); if (ps.length > 1) F('COPY-06', { h1: h.slice(0, 80), pages: ps.slice(0, 8), why: 'the same H1 on several pages' }, `dup|${h}`);
      for (const p of ps) { if (labels[h] && labels[h] !== p) Q('COPY-06', { where: p, h1: h.slice(0, 60), menuOf: labels[h], why: "H1 equals another page's menu label" }, `${p}|menu`); if (titles[h] && titles[h] !== p) Q('COPY-06', { where: p, h1: h.slice(0, 60), titleOf: titles[h], why: "H1 equals another page's title" }, `${p}|title`); }
    }
  }
}

function evalForms() {
  const FMAX = Object.assign({ text: 255, email: 254, tel: 32, textarea: 5000, url: 2048, number: 32, search: 255 }, DEC.fieldMaxLength || {});
  const NAMELIKE = /name|e-?mail|phone|tel|mobile|company|organi[sz]ation|org\b/i;
  for (const { p, w, s, W } of measured('chromium', w => w === REF.desktop)) {
    (s.forms || []).forEach((f, fi) => {
      if (f.isSearch || f.password || !f.fields.length) return;
      const where0 = `${p} form ${f.sel}`;
      // FORM-02: required fields marked
      const req = f.fields.filter(x => x.req);
      if (req.length) { T('FORM-02'); const all = req.length === f.fields.length; const un = req.filter(x => !x.marked); if (un.length && !(all && f.note)) F('FORM-02', { where: where0, fields: un.map(x => x.label || x.name).slice(0, 8), why: all ? 'every field is required but there is no visible marker or "required" note' : 'required fields without a visible marker' }, `${p}|${fi}|req`); }
      // FORM-03: autocomplete on personal fields
      for (const x of f.fields) if (NAMELIKE.test(x.name + ' ' + x.label + ' ' + x.type) && x.tag !== 'SELECT' && !/^(checkbox|radio|hidden|date)$/.test(x.type)) { T('FORM-03'); if (!x.ac || x.ac === 'off') F('FORM-03', { where: where0, field: x.label || x.name, autocomplete: x.ac || '(none)', why: 'autocomplete missing on a name / email / phone / organisation field' }, `${p}|${fi}|${x.name}|ac`); }
      // FORM-04: anti-spam
      if (f.lead) { T('FORM-04'); if (!f.captcha && !f.honeypot && !f.serverSide) { if (f.captchaCfg && !f.captchaLoaded) Q('FORM-04', { where: where0, why: 'captcha configured but its script is not loaded at rest — confirm it loads before submit' }, `${p}|${fi}`); else F('FORM-04', { where: where0, why: 'no captcha / Turnstile / honeypot' }, `${p}|${fi}`); } }
      // FORM-12: destination, types, maxlength, empty first option, names
      T('FORM-12');
      if (!f.loose && !f.hasAction && !f.platform && !(s.formDest && s.formDest[fi])) F('FORM-12', { where: where0, why: 'no destination: no action, no platform handler, no submit listener' }, `${p}|${fi}|dest`);
      for (const x of f.fields) {
        const nm = x.name + ' ' + x.label;
        if (/e-?mail/i.test(nm) && x.tag === 'INPUT' && x.type !== 'email') F('FORM-12', { where: where0, field: x.label || x.name, type: x.type, why: 'email field is not type=email' }, `${p}|${fi}|${x.name}|type`);
        if (/phone|\btel\b|mobile/i.test(nm) && x.tag === 'INPUT' && x.type !== 'tel') F('FORM-12', { where: where0, field: x.label || x.name, type: x.type, why: 'phone field is not type=tel' }, `${p}|${fi}|${x.name}|type`);
        const lim = x.tag === 'TEXTAREA' ? FMAX.textarea : FMAX[x.type];
        if (lim && x.tag !== 'SELECT' && !/^(date|number|checkbox|radio)$/.test(x.type)) { if (!(x.maxl > 0)) F('FORM-12', { where: where0, field: x.label || x.name, why: `no maxlength (limit ${lim})` }, `${p}|${fi}|${x.name}|maxl`); else if (x.maxl > lim) F('FORM-12', { where: where0, field: x.label || x.name, maxlength: x.maxl, limit: lim, why: 'maxlength above the limit' }, `${p}|${fi}|${x.name}|maxl`); }
        if (x.tag === 'SELECT' && x.req && x.firstOpt && x.firstOpt.value) F('FORM-12', { where: where0, field: x.label || x.name, first: x.firstOpt.text, why: 'a required select does not start on an empty option' }, `${p}|${fi}|${x.name}|opt`);
        if (!x.name || /^(field|input|text|untitled|name)[-_ ]?\d+$|^field$/i.test(x.name)) F('FORM-12', { where: where0, field: x.label || x.type, name: x.name || '(none)', why: 'field name is empty or generic' }, `${p}|${fi}|${x.name}|${x.label}|name`);
      }
      // FORM-13: an empty select looks like the placeholders; the submit is not disabled at rest
      const sel0 = f.fields.filter(x => x.tag === 'SELECT' && x.firstOpt && (!x.firstOpt.value || x.firstOpt.disabled)); const ph = f.fields.find(x => x.ph && x.placeholder);
      if (sel0.length && ph) { T('FORM-13'); for (const x of sel0) if (x.color !== ph.ph.color && !(x.opacity !== '1' && ph.ph.opacity !== '1')) F('FORM-13', { where: where0, field: x.label || x.name, select: x.color, placeholder: ph.ph.color, why: 'an empty select does not look like the input placeholders' }, `${p}|${fi}|${x.name}|sel`); }
      if (f.submit) { T('FORM-13'); if (f.submit.disabled) F('FORM-13', { where: where0, button: f.submit.text, why: 'submit button disabled at rest' }, `${p}|${fi}|dis`); }
      // WF-02 material handled below
      void w;
    });
    for (const u of s.formsUnreached || []) NR('FORM-02', `partial: ${p} ${u.kind} form not measured (${u.sel})`);
  }
  // FORM-15: ≥16px in every engine at every tier below 768
  for (const engine of ['chromium', 'webkit', 'firefox']) for (const { p, w, s } of measured(engine, w => w < 768)) for (const f of s.forms || []) for (const x of f.fields || []) {
    T('FORM-15'); if (parseFloat(x.fs) < 16) F('FORM-15', { where: where(p, w, engine), field: x.label || x.name, fontSize: x.fs, why: 'font-size under 16px (iOS zooms on focus)' }, `${engine}|${x.name}|${x.fs}|${w}`);
  }
  // WF-02 / WF-03 (Webflow)
  const names = {};
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) {
    for (const f of s.forms || []) if (f.dataName !== null && f.dataName !== undefined) { const sig = f.fields.map(x => x.name).join(','); (names[f.dataName] = names[f.dataName] || []).push({ p, sig }); }
    for (const h of s.hiddenStates || []) { T('WF-03'); if (/thank you! your submission has been received|oops! something went wrong while submitting|^no items found\.?$/i.test(h.text)) F('WF-03', { where: p, state: h.kind, text: h.text.slice(0, 80), why: 'platform default text left in' }, `${h.kind}|${h.text}`); }
  }
  for (const [n, list] of Object.entries(names).sort((x, y) => byStr(x[0], y[0]))) {
    T('WF-02'); if (/^(email form|wf-form-.*|form)( \d+)?$/i.test(n)) F('WF-02', { name: n, pages: uniq(list.map(x => x.p)).slice(0, 6), why: 'default form name' }, `def|${n}`);
    const sigs = uniq(list.map(x => x.sig)); if (sigs.length > 1) F('WF-02', { name: n, variants: sigs.length, pages: uniq(list.map(x => x.p)).slice(0, 6), why: 'two forms with different fields under one name' }, `dup|${n}`);
  }
}

const STAGING = () => (typeof cfg.staging === 'boolean' ? cfg.staging : null);
function evalSeoAndSite() {
  const desk = measured('chromium', w => w === REF.desktop);
  const titles = {}, descs = {}, ogs = {};
  const [tMin, tMax] = DEC.titleLen || [30, 60], [dMin, dMax] = DEC.descLen || [70, 160];
  for (const { p, s } of desk) {
    const m = s.meta || {};
    T('SEO-01'); if (!m.title) F('SEO-01', { where: p, why: 'no <title>' }, `${p}|none`); else { (titles[m.title] = titles[m.title] || []).push(p); if (m.title.length < tMin || m.title.length > tMax) Q('SEO-01', { where: p, title: m.title, length: m.title.length, want: `${tMin}–${tMax}`, why: 'title length outside decisions.titleLen' }, `${p}|len`); }
    T('SEO-02'); if (!m.desc) F('SEO-02', { where: p, why: 'no meta description' }, `${p}|none`); else { (descs[m.desc] = descs[m.desc] || []).push(p); if (m.desc.length < dMin || m.desc.length > dMax) Q('SEO-02', { where: p, length: m.desc.length, want: `${dMin}–${dMax}`, why: 'description length outside decisions.descLen' }, `${p}|len`); }
    T('SEO-04'); if (!m.ogImage) F('SEO-04', { where: p, why: 'no og:image' }, `${p}|none`); else (ogs[m.ogImage] = ogs[m.ogImage] || []).push(p);
    T('SEO-05'); if (s.ld && s.ld.parseErrors) F('SEO-05', { where: p, blocks: s.ld.blocks, errors: s.ld.parseErrors, why: 'JSON-LD does not parse' }, `${p}|parse`);
    // SEO-09: hard-coded http://
    T('SEO-09'); const https = /^https:/i.test(s.finalUrl || cfg.base);
    for (const r of s.httpRefs || []) { const u = r.replace(/^(a|res) /, ''); const own = !thirdParty(u.replace(/^http:/, 'https:')); if (!https && own) continue; if (r.startsWith('res ') && https) F('SEO-09', { where: p, url: u.slice(0, 120), why: 'mixed content: an http:// resource on an https page' }, `${u}|res`); else if (own) F('SEO-09', { where: p, url: u.slice(0, 120), why: "http:// link to the site's own host" }, `${u}|own`); else Q('SEO-09', { where: p, url: u.slice(0, 120), why: 'http:// link to another host — does it have https?' }, `${u}|ext`); }
    // SEO-10
    T('SEO-10'); if (!m.charset) F('SEO-10', { where: p, why: 'no charset declaration' }, `${p}|cs`);
    if (!m.viewport || !/width\s*=\s*device-width/i.test(m.viewport)) F('SEO-10', { where: p, viewport: m.viewport, why: 'viewport meta without width=device-width' }, `${p}|vp`);
    else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0*)?\b/i.test(m.viewport)) Q('SEO-10', { where: p, viewport: m.viewport, why: 'zoom is limited (user-scalable=no / maximum-scale=1)' }, `${p}|zoom`);
    // SEO-11: FAQ schema matches the page
    const faq = s.faq || { items: 0, containers: 0, empty: [] };
    if (faq.items >= 2) {
      T('SEO-11'); const types = (s.ld && s.ld.types) || [];
      if (!types.includes('FAQPage')) F('SEO-11', { where: p, items: faq.items, why: 'FAQ on the page but no FAQPage schema' }, `${p}|none`);
      else { if (s.ld.questions !== faq.items) F('SEO-11', { where: p, schema: s.ld.questions, page: faq.items, why: 'Question count differs from the FAQ items' }, `${p}|count`); if (s.ld.answersEmpty) F('SEO-11', { where: p, empty: s.ld.answersEmpty, why: 'FAQPage answers are empty' }, `${p}|ans`); }
      for (const q of faq.empty || []) F('SEO-11', { where: p, question: q, why: 'answer not in the markup before a click' }, `${p}|${q}`);
    } else if (s.ld && (s.ld.types || []).includes('FAQPage')) { T('SEO-11'); F('SEO-11', { where: p, why: 'FAQPage schema but no FAQ on the page' }, `${p}|orphan`); }
    // SEO-03 (stage 2)
    if (cfg.stage === '2') {
      T('SEO-03'); const noindex = /noindex/i.test(m.robots || '') || /noindex/i.test((s.headers || {})['x-robots-tag'] || '');
      const self = (cfg.base + p).replace(/\/$/, ''); const can = m.canonical ? m.canonical.split('#')[0].replace(/\/$/, '') : null;
      if (!can && !(noindex && STAGING() === true)) F('SEO-03', { where: p, why: 'no canonical' }, `${p}|none`);
      else if (can && can !== self && !(noindex && STAGING() === true)) { const cp = L.pagePath(can, cfg); if (cp !== p && cp !== L.normPath(p)) (cp ? F : Q)('SEO-03', { where: p, canonical: m.canonical, why: cp ? 'canonical points to another page' : 'canonical points to another host (production domain on staging?)' }, `${p}|other`); }
    }
    // I18N-01: valid <html lang>
    T('I18N-01'); if (!m.lang || !LANG_RE.test(m.lang)) F('I18N-01', { where: p, lang: m.lang || '(none)', why: 'missing or invalid <html lang>' }, `${p}|lang`);
    const hl = (s.hreflang || []); if (hl.length > 1 && m.lang) { const selfE = hl.find(x => L.pagePath(x.href, cfg, { search: true }) === p || x.href.replace(/\/$/, '') === (cfg.base + p).replace(/\/$/, '')); if (selfE && selfE.hl !== 'x-default' && selfE.hl.split('-')[0] !== m.lang.toLowerCase().split('-')[0]) F('I18N-01', { where: p, lang: m.lang, hreflang: selfE.hl, why: '<html lang> differs from the page own hreflang' }, `${p}|hl`); const seg = (p.split('/')[1] || '').toLowerCase(); if (/^[a-z]{2}(-[a-z]{2})?$/.test(seg) && hl.some(x => x.hl.split('-')[0] === seg.split('-')[0]) && seg.split('-')[0] !== m.lang.toLowerCase().split('-')[0]) F('I18N-01', { where: p, lang: m.lang, urlLocale: seg, why: '<html lang> differs from the URL locale' }, `${p}|url`); }
    // CMS-01
    for (const x of s.selfLinks || []) { if (!x.inCollection) continue; T('CMS-01'); F('CMS-01', { where: p, el: x.sel, text: x.text, why: 'a collection list on this page links to the page itself' }, `${p}|${x.sel}|${x.text}`); }
    if ((s.presence || {}).cms) T('CMS-01');
    // MAP-01 / MAP-02
    for (const mp of (s.maps || []).concat(s.mapsJs || [])) {
      if (mp.gated) { NR('MAP-01', `partial: ${p} map hidden behind a consent / lazy gate (${mp.src})`); continue; }
      T('MAP-01'); if (/grayscale|opacity|saturate\(0|brightness|blur/i.test(mp.filter || '') || mp.covered) F('MAP-01', { where: p, map: mp.src, filter: mp.filter || '-', overlay: mp.covered || '-', why: 'map greyed out or covered at rest' }, `${p}|${mp.src}`);
      if (cfg.stage === '2') { T('MAP-02'); if (mp.watermark) F('MAP-02', { where: p, map: mp.src, why: '"for development purposes only" / key or billing error' }, `${p}|${mp.src}|wm`); else if (mp.noKey) F('MAP-02', { where: p, map: mp.src, why: 'Maps Embed API URL without a key' }, `${p}|${mp.src}|key`); else if (mp.iframe) Q('MAP-02', { where: p, map: mp.src, why: 'cross-origin map iframe — its key / billing state cannot be read; check the screenshot', shot: s.shot || undefined }, `${p}|${mp.src}|x`); }
    }
  }
  for (const [t, ps] of Object.entries(titles)) if (ps.length > 1) F('SEO-01', { pages: ps.slice(0, 8), title: t.slice(0, 80), why: 'duplicate title' }, `dup|${t}`);
  if (decided('SEO-02', 'projectType') && DEC.projectType === 'client') for (const [d, ps] of Object.entries(descs)) if (ps.length > 1) F('SEO-02', { pages: ps.slice(0, 8), description: d.slice(0, 80), why: 'duplicate description (client site)' }, `dup|${d}`);
  // SEO-04: one og:image for every page / every item of a template
  const pagesWithOg = Object.values(ogs).reduce((n, l) => n + l.length, 0);
  for (const [img, ps] of Object.entries(ogs)) {
    if (ps.length > 2 && ps.length >= pagesWithOg * 0.5) F('SEO-04', { image: fileOf(img), pages: ps.length, of: pagesWithOg, why: 'the same og:image on most pages' }, `same|${img}`);
    else if (PLAN && PLAN.groups) for (const [g, gr] of Object.entries(PLAN.groups)) { if (gr.count < 2) continue; const inG = ps.filter(p => gr.picked.includes(p)); if (inG.length >= 2 && inG.length === gr.picked.length) F('SEO-04', { image: fileOf(img), template: g, pages: inG, why: 'one og:image for every item of a template' }, `tpl|${img}|${g}`); }
  }
  // SEO-05: a marketplace template carries no JSON-LD → ask
  if (DEC.projectType === 'template' && !MISSING.projectType) for (const { p, s } of desk) if (!s.ld || !s.ld.blocks) Q('SEO-05', { where: p, why: 'no JSON-LD on a marketplace template — intended?' }, `${p}|tplnone`);
  // SEO-13: clean slugs
  { const allow = reList(DEC.slugAllowed);
    for (const p of PLAN.all) { T('SEO-13'); if (allow.some(r => r.test(p))) continue; const why = []; if (/[A-Z]/.test(p)) why.push('uppercase'); if (/_/.test(p)) why.push('underscore'); if (/\/(19|20)\d{2}\/(0?[1-9]|1[0-2])\//.test(p)) why.push('date in the path'); if (/[?&]p(age_id)?=\d+/.test(p)) why.push('?p= query'); if (/\/\d{3,}\/?$/.test(p) || /-\d{4,}\/?$/.test(p)) why.push('numeric id'); if (/%[0-9a-f]{2}/i.test(p) && !/%[89a-f][0-9a-f]/i.test(p)) why.push('encoded characters'); if (why.length) F('SEO-13', { page: p, why: why.join(', ') }, p); } }
  // TRACK-01 / DONOR-01 / TPL-01 / WF-08 (site-wide material)
  const ids0 = new Set(), oth = new Set(), scripts = new Set(), iframes = new Set(), inl = [];
  const wIds = new Set(); let ixRead = false, ixErr = null; const ixT = new Set(); const donorHits = [];
  for (const { p, s } of desk) {
    (s.trackerIds || []).forEach(x => ids0.add(x)); (s.trackerOther || []).forEach(x => oth.add(x)); (s.scriptSrcs || []).forEach(x => scripts.add(x)); (s.iframes || []).forEach(x => iframes.add(x));
    (s.inlineScripts || []).forEach(x => { if (x.forbidden) inl.push({ p, head: x.head }); });
    if (s.wf) { (s.wf.wIds || []).forEach(x => wIds.add(x)); if (s.wf.ixRead) { ixRead = true; (s.wf.ixTargets || []).forEach(x => ixT.add(x)); } if (s.wf.ixError) ixErr = s.wf.ixError; }
    (s.donorHits || []).forEach(h => donorHits.push(Object.assign({ p }, h)));
  }
  T('TRACK-01'); const allIds = [...ids0].sort(byStr); NOTE('TRACK-01', `inventory: ${allIds.concat([...oth].sort(byStr)).join(', ') || 'no tracker IDs found'}`);
  for (const id of allIds) if (/X{3,}|0{6,}|^UA-0+-|^(GTM|G)-(TEST|DEMO|XXXX)/i.test(id)) F('TRACK-01', { id, why: 'placeholder analytics ID' }, `ph|${id}`);
  if (DEC.projectType === 'template' && !MISSING.projectType) { for (const id of allIds.concat([...oth])) F('TRACK-01', { id, why: 'tracker on a marketplace template' }, `tpl|${id}`); }
  else if (Array.isArray(DEC.analyticsIds)) { for (const id of allIds) if (!DEC.analyticsIds.includes(id) && !/X{3,}/i.test(id)) F('TRACK-01', { id, allowed: DEC.analyticsIds, why: 'ID not on decisions.analyticsIds' }, `na|${id}`); }
  else if (allIds.length || oth.size) Q('TRACK-01', { ids: allIds.concat([...oth].sort(byStr)), why: 'confirm these IDs belong to this site — record them in decisions.analyticsIds' }, 'confirm');
  if (DEC.donor === null || DEC.donor === undefined) Q('DONOR-01', { why: 'was this site cloned from another one? set decisions.donor to the donor names / domains, or [] when it was not' }, 'ask');
  else if (Array.isArray(DEC.donor) && DEC.donor.length) {
    T('DONOR-01', desk.length);
    for (const h of donorHits.slice(0, 40)) F('DONOR-01', { where: h.p, needle: h.needle, snippet: h.snippet.slice(0, 140) }, `${h.p}|${h.needle}|${h.snippet.slice(0, 40)}`);
    for (const u of ASSETS.keys()) for (const d of DEC.donor) if (/[./]/.test(d) && u.toLowerCase().includes(String(d).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''))) F('DONOR-01', { request: u.slice(0, 120), needle: d, why: 'network request to the donor' }, `net|${u}`);
  }
  if (DEC.projectType === 'template' && !MISSING.projectType) {
    const RUNTIME = /website-files\.com|webflow\.(js|com)|d3e54v103j8qbb\.cloudfront\.net|jquery|cdn\.jsdelivr\.net\/npm\/gsap|cdnjs\.cloudflare\.com\/ajax\/libs\/gsap|unpkg\.com\/gsap|\/gsap(\.min)?\.js|ScrollTrigger|SplitText|wp-includes|wp-content\/themes/i;
    const allow = reList(DEC.allowedScripts);
    T('TPL-01');
    for (const u of [...scripts].sort(byStr)) if (!RUNTIME.test(u) && !allow.some(r => r.test(u)) && thirdParty(u)) F('TPL-01', { script: u.slice(0, 120), why: 'script outside the platform runtime and GSAP (name it in decisions.allowedScripts)' }, u);
    for (const u of [...iframes].sort(byStr)) if (!allow.some(r => r.test(u))) F('TPL-01', { embed: u.slice(0, 120), why: 'embed not named in decisions.allowedScripts' }, u);
    for (const x of inl.slice(0, 10)) F('TPL-01', { where: x.p, inline: x.head, why: 'inline script with network / tracking calls' }, `${x.p}|${x.head}`);
  }
  if (PLATFORM && PLATFORM.name === 'webflow') {
    if (!ixRead) NR('WF-08', `the published interactions data could not be read${ixErr ? ' (' + ixErr + ')' : ''} — route: check Interactions in the Designer (webflow connection) and record it`);
    else { T('WF-08', wIds.size || 1); for (const id of [...wIds].sort(byStr)) if (!ixT.has(id)) F('WF-08', { dataWId: id, why: 'data-w-id without an interaction in the published data' }, `w|${id}`); const seen = new Set(wIds); const orphan = [...ixT].filter(x => /^[0-9a-f-]{8,}$/i.test(x) && !seen.has(x)); if (orphan.length) Q('WF-08', { targets: orphan.slice(0, 10), count: orphan.length, why: 'interaction targets not found on the measured pages (unmeasured pages or removed elements)' }, 'orphan'); }
  }
}

function evalI18n() {
  const desk = measured('chromium', w => w === REF.desktop);
  const multi = desk.some(x => (x.s.hreflang || []).length > 1);
  if (!multi) return;
  for (const { p, s } of desk) {
    const hl = s.hreflang || []; T('I18N-02');
    if (!hl.length) { F('I18N-02', { where: p, why: 'no hreflang on a multilingual site' }, `${p}|none`); continue; }
    const self = hl.some(x => L.pagePath(x.href, cfg, { search: true }) === p); if (!self) F('I18N-02', { where: p, why: 'no self-referencing hreflang entry' }, `${p}|self`);
    if (!hl.some(x => x.hl === 'x-default')) F('I18N-02', { where: p, why: 'no x-default' }, `${p}|xd`);
    for (const x of hl) { const q = L.pagePath(x.href, cfg, { search: true }); if (!q || q === p || x.hl === 'x-default') continue; const t = statOf(q, REF.desktop); if (!t) continue; if (!(t.hreflang || []).some(y => L.pagePath(y.href, cfg, { search: true }) === p)) F('I18N-02', { where: p, alternate: q, why: 'hreflang pair is not reciprocal' }, `${p}|${q}|recip`); }
  }
  // I18N-05 / I18N-06: translated alternates vs the page
  const pairs = []; for (const { p, s } of desk) for (const x of s.hreflang || []) { const q = L.pagePath(x.href, cfg, { search: true }); if (q && q !== p && x.hl !== 'x-default' && statOf(q, REF.desktop) && byStr(p, q) < 0) pairs.push([p, q, x.hl]); }
  const unmeasured = new Set(); for (const { s } of desk) for (const x of s.hreflang || []) { const q = L.pagePath(x.href, cfg, { search: true }); if (q && x.hl !== 'x-default' && !statOf(q, REF.desktop)) unmeasured.add(q); }
  if (unmeasured.size) { NR('I18N-05', `partial: ${unmeasured.size} alternate page(s) not measured (not in the page plan): ${[...unmeasured].sort(byStr).slice(0, 5).join(', ')}`); NR('I18N-06', 'partial: alternates outside the page plan not compared'); }
  for (const [p, q, hl] of uniq(pairs.map(x => x.join('|'))).map(x => x.split('|'))) {
    const a1 = statOf(p, REF.desktop), b1 = statOf(q, REF.desktop); T('I18N-05');
    const same = [];
    if (a1.meta.title && a1.meta.title === b1.meta.title) same.push('title'); if (a1.meta.desc && a1.meta.desc === b1.meta.desc) same.push('meta description');
    const bl = new Set(a1.buttonLabels || []); const sb = (b1.buttonLabels || []).filter(x => bl.has(x) && /[a-z]{3}/i.test(x)); if (sb.length >= 2) same.push(`buttons: ${sb.slice(0, 4).join(' | ')}`);
    const phA = new Set((a1.forms || []).flatMap(f => f.fields.map(x => x.placeholder || x.label)).filter(Boolean)); const sp = (b1.forms || []).flatMap(f => f.fields.map(x => x.placeholder || x.label)).filter(x => x && phA.has(x)); if (sp.length) same.push(`form labels / placeholders: ${uniq(sp).slice(0, 4).join(' | ')}`);
    const la = (a1.text || '').split('\n').map(norm).filter(x => x.length > 24); const lb = new Set((b1.text || '').split('\n').map(norm)); const st = la.filter(x => lb.has(x)); if (la.length && st.length > la.length * 0.3) same.push(`${st.length}/${la.length} text lines identical`);
    for (const x of same) F('I18N-05', { page: p, alternate: q, locale: hl, why: 'not translated: ' + x }, `${p}|${q}|${x.slice(0, 30)}`);
    for (const w of [REF.desktop, REF.mobile]) {
      const A = statOf(p, w), B = statOf(q, w); if (!A || !B) continue; T('I18N-06');
      const hA = (A.btnSig || []).filter(b => b.region === 'header'), hB = (B.btnSig || []).filter(b => b.region === 'header');
      const byCls = (list) => { const m = {}; list.forEach(b => { (m[b.cls] = m[b.cls] || []).push(b.h); }); return m; };
      const ca = byCls(A.btnSig || []), cb = byCls(B.btnSig || []);
      for (const c of Object.keys(ca)) if (cb[c]) { const d = Math.abs(Math.max.apply(null, ca[c]) - Math.max.apply(null, cb[c])); if (d > 4) F('I18N-06', { page: p, alternate: q, width: w, button: c, heights: `${Math.max.apply(null, ca[c])} vs ${Math.max.apply(null, cb[c])}`, why: 'same-class button height differs by more than 4px between locales' }, `${p}|${q}|${w}|${c}`); }
      void hA; void hB;
    }
  }
}

// REF-01: design tokens; REF-02: deployed page vs the clean stage-1 build
function evalReference() {
  const rt = cfg.reference || {};
  if (!rt.tokens) NA('REF-01', 'no design tokens (reference.tokens not set) — consistency-only run');
  else {
    let tok = null; try { tok = L.readJson(path.resolve(cfg._configDir, String(rt.tokens)), 'reference.tokens'); } catch (e) { NR('REF-01', `reference.tokens not readable: ${errMsg(e)}`); }
    if (tok) {
      const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
      const colorKey = v => String(v).replace(/\s+/g, '').toLowerCase();
      const scale = { color: (tok.color || tok.colors || []).map(colorKey), fontSize: (tok.fontSize || []).map(toNum), space: (tok.space || tok.spacing || []).map(toNum), radius: (tok.radius || []).map(toNum), durationMs: (tok.durationMs || tok.duration || []).map(toNum), fontFamily: (tok.fontFamily || []).map(x => String(x).toLowerCase().replace(/["']/g, '')) };
      for (const { p, w, s } of measured('chromium', w => w === REF.desktop)) {
        if (!s.tokenVals) continue;
        for (const [k, vals] of Object.entries(s.tokenVals)) {
          const sc = scale[k]; if (!sc || !sc.length) continue;
          for (const [v, info] of Object.entries(vals)) {
            T('REF-01'); const ok = k === 'color' ? sc.includes(colorKey(v)) || /rgba\(0, 0, 0, 0\)/.test(v) : k === 'fontFamily' ? sc.includes(v) : sc.some(x => x !== null && Math.abs(x - +v) <= 0.5);
            if (!ok) F('REF-01', { where: `${p} @${w}`, group: k, value: v, uses: info.n, example: info.ex, why: 'value off the design-token scale' }, `${k}|${v}`);
          }
        }
      }
      for (const k of Object.keys(scale)) if (!scale[k].length) NOTE('REF-01', `no ${k} scale in the tokens file — that group not compared`);
    }
  }
  if (cfg.stage !== '2') return;
  if (!rt.build) { NR('REF-02', 'reference.build not set — route: point reference.build at the clean stage-1 qa-out folder (its static-chromium.json) and rerun'); return; }
  let ref = null; try { ref = L.readJson(path.join(path.resolve(cfg._configDir, String(rt.build)), 'static-chromium.json'), 'reference build'); } catch (e) { NR('REF-02', `reference build not readable: ${errMsg(e)}`); return; }
  const map = rt.pageMap || {};
  for (const w of [REF.desktop, REF.mobile]) for (const { p, s } of measured('chromium', x => x === w)) {
    const rp = Object.keys(map).find(k => map[k] === p) || p; const r = ref[`${rp}@${w}`]; if (!r || r.fail) continue;
    T('REF-02'); const W = `${p} @${w}`; const diffs = [];
    const lc = x => (x.links || []).filter(l => l.vis).length; if (lc(r) !== lc(s)) diffs.push(`visible links ${lc(r)} → ${lc(s)}`);
    const secs = x => (x.sectionPad || []).map(z => z.key); if (secs(r).join(',') !== secs(s).join(',')) diffs.push(`sections ${secs(r).length} → ${secs(s).length} (order or count)`);
    const pads = x => (x.sectionPad || []).map(z => z.pt + '/' + z.pb).join(','); if (secs(r).join(',') === secs(s).join(',') && pads(r) !== pads(s)) diffs.push('section paddings differ');
    const bt = x => uniq((x.btnSig || []).map(b => `${b.h}|${b.pad}|${b.r}|${b.fs}`)).sort(byStr).join(','); if (bt(r) !== bt(s)) diffs.push('button measures differ');
    const le = x => { const m = mode((x.leftEdge || []).map(z => z.x)); return m ? m[0] : null; }; if (le(r) !== le(s)) diffs.push(`container edge ${le(r)} → ${le(s)}`);
    const hd = x => uniq((x.headings || []).filter(h => /^h[1-3]/.test(h.key)).map(h => h.key.split('.')[0] + ':' + h.ff + ' ' + h.fs)).sort(byStr).join(','); if (hd(r) !== hd(s)) diffs.push('h1–h3 family / size differ');
    for (const d of diffs) F('REF-02', { where: W, ref: rp, why: d }, `${p}|${w}|${d.slice(0, 30)}`);
  }
}

// PAGE-01 legal page, PAGE-02 404 page, FOOT-01 footer credit
function evalPages(linkStatus) {
  const desk = measured('chromium', w => w === REF.desktop);
  // PAGE-02
  const pr = STAT.chromium[`${PROBE}@${REF.desktop}`];
  if (!pr) NR('PAGE-02', 'the 404 probe was not loaded');
  else if (pr.fail) { if (pr.gate) { T('PAGE-02'); Q('PAGE-02', { url: PROBE, gate: pr.gate.type, why: 'unknown URL shows a platform password / sign-in page — look at the screenshot' }, 'gate'); } else NR('PAGE-02', `the 404 probe did not load: ${pr.fail}`); }
  else {
    T('PAGE-02'); const W = `${PROBE} @${REF.desktop}`;
    if (pr.status !== 404) F('PAGE-02', { url: PROBE, status: pr.status, why: 'an unknown URL must answer 404' }, 'status');
    if (!pr.regions || !pr.regions.header) F('PAGE-02', { where: W, why: 'no site header on the 404 page' }, 'header');
    if (!pr.regions || !pr.regions.footer) F('PAGE-02', { where: W, why: 'no site footer on the 404 page' }, 'footer');
    const msg = /\b404\b|not\s+found|page\s+(doesn.t|does\s+not|could\s+not|can.t|cannot)\s+(exist|be\s+found)|nothing\s+(was\s+)?found|no\s+longer\s+(exists|available)|page\s+is\s+missing/i.test(pr.text || '') || /404|not.?found/i.test((pr.meta && pr.meta.title) || '');
    if (!msg) F('PAGE-02', { where: W, why: 'no not-found message' }, 'msg');
    if (!(pr.links || []).some(l => l.vis && isHome(l.abs))) F('PAGE-02', { where: W, why: 'no way home (no visible link to the home page)' }, 'home');
    if (!msg && ((pr.postItems || 0) >= 2 || /\b(home|blog|archive)\b/.test(pr.bodyClass || ''))) F('PAGE-02', { where: W, bodyClass: (pr.bodyClass || '').slice(0, 80), posts: pr.postItems, why: 'the CMS index renders instead of a 404 page' }, 'index');
    if (pr.shot) NOTE('PAGE-02', `screenshot ${pr.shot}`);
  }
  for (const [p, g] of [...GATED.entries()].sort((x, y) => byStr(x[0], y[0]))) { T('PAGE-02'); Q('PAGE-02', { where: p, gate: g.type, evidence: g.evidence, why: 'password-protected page — opened and listed; look at it in a browser' }, `gate|${p}`); }
  // PAGE-01
  if (decided('PAGE-01', 'projectType')) {
    const want = DEC.projectType === 'template' ? [['licensing', /licen[cs]/i], ['changelog', /change\s*-?log|release notes|updates/i]] : [['privacy policy', /privacy|datenschutz|confidentialit|privacidad|privacy-policy/i]];
    const legal = [].concat(DEC.legalPath || []).map(String);
    for (const [label, re] of want) {
      let found = null;
      for (const { p, s } of desk) { const l = (s.links || []).find(x => x.abs && (re.test(x.text || x.name || '') || re.test(x.abs)) && !thirdParty(x.abs)); if (l) { found = { from: p, href: l.abs, path: L.pagePath(l.abs, cfg) }; break; } }
      if (!found && legal.length) found = { from: 'decisions.legalPath', path: L.normPath(legal.find(x => re.test(x)) || legal[0]), href: cfg.base + L.normPath(legal.find(x => re.test(x)) || legal[0]) };
      T('PAGE-01');
      if (!found) { F('PAGE-01', { want: label, why: `no ${label} page linked from the measured pages (or decisions.legalPath)` }, label); continue; }
      const st = linkStatus[found.href.split('#')[0]]; if (st && st.code !== 200) F('PAGE-01', { want: label, href: found.href, status: st.code, why: `${label} does not answer 200` }, label + '|status');
      const t = found.path && statOf(found.path, REF.desktop);
      if (t) { const len = norm(t.text || '').length; if (len < 800 || /lorem ipsum|draft|coming soon|\[insert|to be added/i.test(t.text || '')) F('PAGE-01', { want: label, page: found.path, chars: len, why: `${label} looks like a stub or draft` }, label + '|stub'); }
      else NR('PAGE-01', `partial: ${label} page ${found.path || found.href} not in the measured pages — its text was not read`);
    }
  }
  // FOOT-01
  const rules = DEC.credit ? [].concat(DEC.credit) : null;
  if (!rules) NR('FOOT-01', 'decisions.credit not set — route: record the company credit rule ({ text, links: [{ text, href }], linkCount }) in qa-target.json');
  else for (const { p, s } of desk.slice(0, Math.min(desk.length, 6))) {
    const ft = norm((s.copy && s.copy.footerText) || ''); const fl = (s.links || []).filter(l => l.region === 'footer' && l.vis);
    T('FOOT-01');
    const ok = rules.some(r => { const rr = typeof r === 'string' ? { text: r } : r; if (rr.text && !ft.toLowerCase().includes(norm(rr.text).toLowerCase())) return false; for (const lk of rr.links || []) { const a = fl.find(l => norm(l.text || l.name).toLowerCase().includes(String(lk.text).toLowerCase())); if (!a || (lk.href && !String(a.abs).replace(/\/$/, '').toLowerCase().startsWith(String(lk.href).replace(/\/$/, '').toLowerCase()))) return false; } if (typeof rr.linkCount === 'number') { const hosts = uniq((rr.links || []).map(lk => { try { return new URL(lk.href).host; } catch (e) { return null; } }).filter(Boolean)); const n = fl.filter(l => { try { return hosts.includes(new URL(l.abs).host); } catch (e) { return false; } }).length; if (n !== rr.linkCount) return false; } return true; });
    if (!ok) F('FOOT-01', { where: p, footer: ft.slice(-160), want: rules, why: 'footer credit does not match decisions.credit' }, p);
  }
}

// ------------------------------------------------------------------------------------------------ network checks
let NETCTX = null; // a Chromium context for HEAD/GET (cookies of the person's session; no page routes)
async function netContext() { if (NETCTX) return NETCTX; const b = await browser('chromium'); NETCTX = await b.newContext(L.contextOptions(cfg, {})); return NETCTX; }
async function head(url, getFallback) {
  const ctx = await netContext(); let cur = url; const chain = [];
  for (let hop = 0; hop < 10; hop++) {
    let r = null;
    try { r = await ctx.request.fetch(cur, { method: 'HEAD', maxRedirects: 0, failOnStatusCode: false, timeout: 20000 }); } catch (e) { r = null; }
    if (!r || [400, 403, 405, 406, 501].includes(r.status())) { try { r = await ctx.request.fetch(cur, { method: 'GET', maxRedirects: 0, failOnStatusCode: false, timeout: 25000, headers: { range: getFallback ? 'bytes=0-0' : 'bytes=0-2047' } }); } catch (e) { return { code: -1, error: errMsg(e), chain, url: cur }; } }
    const st = r.status(); const loc = r.headers().location;
    if (st >= 300 && st < 400 && loc) { let nx; try { nx = new URL(loc, cur).href; } catch (e) { return { code: st, chain, url: cur }; } chain.push(`${st} ${nx}`); cur = nx; continue; }
    return { code: st === 206 ? 200 : st, headers: r.headers(), chain, url: cur };
  }
  return { code: -2, error: 'more than 10 redirects', chain, url: cur };
}
async function linkStatuses() {
  const urls = new Map(); // url → pages
  const addU = (u, p) => { if (!u || !/^https?:/i.test(u)) return; const k = u.split('#')[0]; if (!urls.has(k)) urls.set(k, new Set()); urls.get(k).add(p); };
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) { for (const l of s.links || []) if (l.href && !/^(#|mailto:|tel:|javascript:)/i.test(l.href.trim())) addU(l.abs, p); for (const h of s.hreflang || []) addU(h.href, p); }
  const list = [...urls.keys()].sort(byStr); const CAP = 1500; const res = {};
  if (list.length > CAP) NR('LINK-03', `partial: ${list.length} unique URLs, the first ${CAP} (sorted) checked`);
  const own = list.slice(0, CAP).filter(u => !thirdParty(u)), ext = list.slice(0, CAP).filter(u => thirdParty(u));
  progress('link statuses', 0, own.length + ext.length, true); let done = 0; LINK_WHY = `${own.length} own + ${ext.length} external URLs (own: ${Math.min(2, cfg.concurrency)} at a time, ${cfg.throttleMs} ms apart)`;
  const run = async (arr, conc, gap) => { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, arr.length) }, async () => { while (i < arr.length) { if (late()) { const u = arr[i++]; res[u] = { code: 0, skipped: true }; continue; } const u = arr[i++]; res[u] = await head(u); done++; progress('link statuses', done, own.length + ext.length); if (gap) await wait(gap); } })); };
  await run(own, Math.min(2, cfg.concurrency), cfg.throttleMs); await run(ext, 4, 50);
  const skipped = Object.values(res).filter(r => r.skipped).length; if (skipped) NR('LINK-03', `partial: ${skipped} URLs not checked — ${BUDGET_WHY}`);
  for (const u of Object.keys(res).sort(byStr)) {
    const r = res[u]; if (r.skipped) continue; const pages = [...urls.get(u)].sort(byStr).slice(0, 5); const third = thirdParty(u);
    T('LINK-03'); const social = /linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|pinterest\.|youtube\.com/i.test(u);
    if (r.code === -1 || r.code === -2) (social ? Q : F)('LINK-03', { url: u.slice(0, 140), error: r.error, pages }, u);
    else if (r.code >= 400) { if (third && (social || [401, 403, 429, 999].includes(r.code))) Q('LINK-03', { url: u.slice(0, 140), code: r.code, pages, why: 'the host blocks automated requests — open it by hand' }, u); else F('LINK-03', { url: u.slice(0, 140), code: r.code, pages }, u); }
    else if (r.chain.length && !third) Q('LINK-03', { url: u.slice(0, 140), to: r.url.slice(0, 140), hops: r.chain.length, pages, why: 'internal link points to a redirect — link the final URL' }, u);
    else if (r.chain.length >= 2) Q('LINK-03', { url: u.slice(0, 140), hops: r.chain.length, pages, why: `${r.chain.length} redirects` }, u);
  }
  // the pages themselves
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) if (s.status >= 400) F('LINK-03', { url: cfg.base + p, code: s.status, why: 'page in the inventory does not answer 200' }, `page|${p}`);
  // I18N-02: every alternate answers 200
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) for (const h of s.hreflang || []) { const r = res[h.href.split('#')[0]]; if (r && !r.skipped && r.code !== 200) F('I18N-02', { where: p, hreflang: h.hl, href: h.href, code: r.code, why: 'hreflang alternate does not answer 200' }, `${p}|${h.href}`); }
  const out = {}; for (const [u, r] of Object.entries(res)) out[u] = { code: r.code, hops: r.chain ? r.chain.length : 0 }; return out;
}
function robotsGroups(txt) { // { agent(lowercase) → [{ allow, path }] }
  const g = {}; let agents = [], lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) { const line = raw.replace(/#.*$/, '').trim(); if (!line) continue; const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue; const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent) agents = []; agents.push(v.toLowerCase()); lastWasAgent = true; agents.forEach(a => { g[a] = g[a] || []; }); continue; }
    lastWasAgent = false; if (k === 'disallow' || k === 'allow') agents.forEach(a => g[a].push({ allow: k === 'allow', path: v })); }
  return g;
}
const blocksAll = rules => !!rules && rules.some(r => !r.allow && r.path === '/') && !rules.some(r => r.allow && (r.path === '/' || r.path === '/$'));
async function siteChecks() {
  const ctx = await netContext(); const origin = new URL(cfg.base + '/').origin;
  const rb = await L.getUrl(origin + '/robots.txt', { cfg, ctx, fallbackToNode: true });
  const groups = rb.status === 200 && !rb.blocked ? robotsGroups(rb.text) : {};
  const desk = measured('chromium', w => w === REF.desktop);
  // SEO-06: robots.txt, meta robots and X-Robots-Tag match the domain
  if (decided('SEO-06', 'staging')) {
    T('SEO-06', desk.length + 1); const closedRobots = blocksAll(groups['*']);
    const noidx = desk.filter(x => /noindex/i.test((x.s.meta && x.s.meta.robots) || '') || /noindex/i.test((x.s.headers || {})['x-robots-tag'] || '')).map(x => x.p);
    if (STAGING() === true) { if (!closedRobots) { const open = desk.map(x => x.p).filter(p => !noidx.includes(p)); if (open.length) F('SEO-06', { pages: open.slice(0, 10), of: desk.length, robots: rb.status, why: 'staging is indexable: robots.txt does not block it and these pages carry no noindex' }, 'staging'); } }
    else { if (closedRobots) F('SEO-06', { robots: 'Disallow: / for *', why: 'production site blocked by robots.txt' }, 'robots'); for (const p of noidx) F('SEO-06', { where: p, why: 'production page has noindex (meta robots or X-Robots-Tag)' }, `noindex|${p}`); }
    NOTE('SEO-06', `robots.txt ${rb.status === -1 ? rb.error : rb.status}${rb.blocked ? ' (challenge)' : ''}; noindex on ${noidx.length}/${desk.length} pages`);
  }
  // SEO-08: share preview from the server HTML
  const ogSeen = new Map(); const srcPages = PLAN.sampled.slice(0, 12);
  for (const p of srcPages) {
    const r = p === '/' && HOME_SERVER ? HOME_SERVER : await L.getUrl(cfg.base + p, { cfg, ctx, fallbackToNode: true }); if (r.status !== 200 || r.blocked) { NR('SEO-08', `partial: server HTML of ${p} not read (${r.status === -1 ? r.error : r.status})`); continue; }
    T('SEO-08'); const html = r.text || '';
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
    const val = (attr, name) => metas.filter(m => new RegExp(`${attr}\\s*=\\s*["']${name}["']`, 'i').test(m)).map(m => ((m.match(/content\s*=\s*"([^"]*)"/i) || m.match(/content\s*=\s*'([^']*)'/i) || [])[1] || '').trim());
    const need = [['property', 'og:title'], ['property', 'og:description'], ['property', 'og:url'], ['property', 'og:image'], ['name', 'twitter:card']];
    const miss = need.filter(([at, n]) => !val(at, n).filter(Boolean).length && !val(at === 'property' ? 'name' : 'property', n).filter(Boolean).length).map(x => x[1]);
    if (miss.length) F('SEO-08', { where: p, missing: miss, why: 'share tags missing from the server HTML' }, `${p}|miss`);
    const imgs = uniq(val('property', 'og:image').concat(val('name', 'og:image')).filter(Boolean));
    if (imgs.length > 1) F('SEO-08', { where: p, count: imgs.length, why: 'more than one og:image' }, `${p}|many`);
    if (imgs[0]) { if (!/^https?:\/\//i.test(imgs[0])) F('SEO-08', { where: p, ogImage: imgs[0], why: 'og:image is not an absolute URL' }, `${p}|rel`); else if (!ogSeen.has(imgs[0])) ogSeen.set(imgs[0], p); }
  }
  const ogMaxKB = DEC.ogImageMaxKB || (DEC.assetMaxKB && DEC.assetMaxKB.ogImage) || 200;
  for (const [u, p] of [...ogSeen.entries()].sort((x, y) => byStr(x[0], y[0]))) {
    let res = null; try { res = await ctx.request.get(u, { failOnStatusCode: false, timeout: 25000 }); } catch (e) { F('SEO-08', { image: u.slice(0, 120), where: p, why: 'og:image did not answer: ' + errMsg(e) }, `img|${u}`); continue; }
    const st = res.status(), ct = res.headers()['content-type'] || ''; const buf = await res.body().catch(() => Buffer.alloc(0));
    if (st !== 200) { F('SEO-08', { image: u.slice(0, 120), status: st, why: 'og:image does not answer 200' }, `img|${u}`); continue; }
    if (!/image\/(jpeg|png|webp|gif)/i.test(ct)) F('SEO-08', { image: u.slice(0, 120), type: ct, why: 'og:image is not JPG/PNG/WebP/GIF' }, `img|${u}|type`);
    const kb = Math.round(buf.length / 1024); if (kb > ogMaxKB) F('SEO-08', { image: fileOf(u), KB: kb, max: ogMaxKB, why: 'og:image too heavy' }, `img|${u}|kb`);
    const d = imageSize(buf); if (!d) Q('SEO-08', { image: fileOf(u), why: 'og:image dimensions not readable' }, `img|${u}|dim`); else if (d.w < 1200 || d.h < 627) F('SEO-08', { image: fileOf(u), size: `${d.w}×${d.h}`, why: 'og:image smaller than 1200×627' }, `img|${u}|dim`);
  }
  if (STAGING() === false) { for (const bot of ['facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'whatsapp']) { const rules = groups[bot] || groups['*']; if (blocksAll(rules)) F('SEO-08', { crawler: bot, why: 'social crawler blocked by robots.txt on production' }, `bot|${bot}`); } }
  if (cfg.stage !== '2') return;
  // SEC-01: security headers on the document
  const hd = (statOf(PLAN.sampled[0] || '/', REF.desktop) || {}).headers || (HOME_SERVER && HOME_SERVER.headers) || null;
  if (!hd) NR('SEC-01', 'document headers not read'); else {
    T('SEC-01'); const miss = [];
    if (/^https:/i.test(cfg.base) && !hd['strict-transport-security']) miss.push('strict-transport-security'); if (!/nosniff/i.test(hd['x-content-type-options'] || '')) miss.push('x-content-type-options: nosniff');
    if (!hd['referrer-policy']) miss.push('referrer-policy'); if (!hd['x-frame-options'] && !/frame-ancestors/i.test(hd['content-security-policy'] || '')) miss.push('x-frame-options / CSP frame-ancestors');
    if (!/^https:/i.test(cfg.base)) miss.push('site served over http (no TLS)');
    if (miss.length) F('SEC-01', { missing: miss, why: 'basic security headers missing on the document' }, 'hdr');
  }
  // SEO-07 / SEO-12: sitemap
  let sm = INFO;
  if (!INFO || INFO.explicit) { try { sm = await L.discoverPagesInfo(Object.assign({}, cfg, { pages: [], pagesFrom: null, _localPages: null, local: null }), { ctx }); } catch (e) { sm = null; } }
  T('SEO-07');
  if (!sm || !sm.sitemaps || !sm.sitemaps.length) F('SEO-07', { tried: sm ? sm.tried.slice(0, 6) : [], why: 'no sitemap found (robots.txt Sitemap: or standard paths)' }, 'none');
  else {
    NOTE('SEO-07', `sitemaps: ${sm.sitemaps.join(', ')}`);
    const dh = Object.keys(sm.dropped || {}).sort(byStr); if (dh.length) F('SEO-07', { hosts: dh.map(h => `${h} ×${sm.dropped[h]}`), why: 'sitemap lists URLs on another host' }, 'hosts');
    const inSm = new Set((sm.pages || []).map(x => x.replace(/\/$/, '') || '/')); const linked = new Set();
    for (const { s } of desk) for (const l of s.links || []) { const q = l.abs && L.pagePath(l.abs, cfg); if (q && !L.NOT_PAGE.test(q)) linked.add(q.replace(/\/$/, '') || '/'); }
    const notIn = [...linked].filter(q => !inSm.has(q) && !/\?/.test(q)).sort(byStr); for (const q of notIn.slice(0, 20)) Q('SEO-07', { page: q, why: 'linked page missing from the sitemap' }, `miss|${q}`);
    const allow = reList(DEC.orphanAllowed);
    T('SEO-12', inSm.size);
    if (sm.pages.length > 1) for (const q of [...inSm].sort(byStr)) { if (q === '/' || linked.has(q) || allow.some(r => r.test(q))) continue; Q('SEO-12', { page: q, why: 'in the sitemap but not linked from any measured page' }, q); }
    // every page gets the content pass at desktop (template sampling included), so links come from the whole site;
    // only pages whose desktop load failed or was cut leave a gap
    const noLinks = PLAN.all.filter(q => !statOf(q, REF.desktop));
    if (noLinks.length) NR('SEO-12', `partial: links were not read from ${noLinks.length} page(s) that did not load at ${REF.desktop} (${noLinks.slice(0, 5).join(', ')}${noLinks.length > 5 ? ', …' : ''}) — an orphan may be linked from one of them`);
  }
}
// image dimensions from file headers (PNG, JPEG, GIF, WebP)
function imageSize(b) {
  try {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') { const t = b.toString('ascii', 12, 16); if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }; if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }; if (t === 'VP8L') { const n = b.readUInt32LE(21); return { w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) }; } }
    if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length - 9) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; } }
  } catch (e) { }
  return null;
}
async function weightAndVideo() {
  // PERF-02: page weight at decisions.pageWeightTier
  const tier = +DEC.pageWeightTier || REF.mobile; const max = (+DEC.maxPageWeightMB || 3) * 1048576;
  for (const p of PLAN.sampled) {
    const s = STAT.chromium[`${p}@${tier}`]; if (!s || s.fail) continue;
    if (!s.bytes) { NR('PERF-02', `partial: ${p} @${tier} bytes not reported`); continue; }
    T('PERF-02'); NOTE('PERF-02', `${p} ${(s.bytes / 1048576).toFixed(2)} MB @${tier}`);
    if (s.bytes > max) F('PERF-02', { where: p, MB: +(s.bytes / 1048576).toFixed(2), max: DEC.maxPageWeightMB, width: tier, why: 'page weight over the limit (transferred bytes after scrolling)' }, p);
  }
  // VID-04: video file size from the server headers
  const vids = new Map(); for (const { p, s } of measured('chromium', w => w === REF.desktop || w === REF.mobile)) for (const v of s.videos || []) if (v.url && !vids.has(v.url)) vids.set(v.url, p);
  for (const [u, p] of [...vids.entries()].sort((x, y) => byStr(x[0], y[0]))) {
    if (/^blob:|\.m3u8(\?|$)/i.test(u)) { NR('VID-04', `partial: ${fileOf(u)} is a stream — no single file size`); continue; }
    const r = await head(u, true); const h = r.headers || {};
    const total = h['content-range'] ? +String(h['content-range']).split('/')[1] : (r.code === 200 && h['content-length'] && !h['content-range'] ? +h['content-length'] : NaN);
    if (!(total > 0)) { NR('VID-04', `partial: ${fileOf(u)} size not reported by the server (${r.code})`); continue; }
    T('VID-04'); const mb = total / 1048576; if (mb > (+DEC.maxVideoMB || 10)) F('VID-04', { where: p, video: fileOf(u), MB: +mb.toFixed(1), max: DEC.maxVideoMB, why: 'video file too heavy' }, u);
  }
}

// ------------------------------------------------------------------------------------------------ project CSS (INT-07, XB-06, XB-07, STRUCT-02)
const PLUGIN_CSS = /\/wp-includes\/|\/wp-admin\/|\/wp-content\/plugins\/|\/node_modules\/|fonts\.googleapis|use\.typekit|cdnjs\.cloudflare|cdn\.jsdelivr|unpkg\.com|ajax\.googleapis|\/cdn-cgi\//i;
async function cssScan() {
  const own = reList(cfg.cssOwn), excl = reList(cfg.cssExclude);
  let themeRe = null; try { themeRe = cfg.selectors.themeCss ? new RegExp(cfg.selectors.themeCss, 'i') : null; } catch (e) { }
  const linked = new Map(), inline = new Map();
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) for (const src of s.cssSources || []) {
    if (src.href) { const u = src.href.split('#')[0]; const isOwn = own.some(r => r.test(u)) || (!excl.some(r => r.test(u)) && !PLUGIN_CSS.test(u) && (!thirdParty(u) || (themeRe && themeRe.test(u)))); if (isOwn && !linked.has(u)) linked.set(u, p); }
    else if (src.inline && src.inline.trim()) { const plug = (src.handleHref && PLUGIN_CSS.test(src.handleHref)) || /^(wp-|global-styles|classic-theme|core-block|elementor-(frontend|icons|pro)|woocommerce|wpforms|contact-form-7|qa-)/i.test(src.id || ''); if (!plug && !excl.some(r => r.test(src.id || ''))) { const k = L.sha1(src.inline).slice(0, 12); if (!inline.has(k)) inline.set(k, { text: src.inline, id: src.id || '(inline)', p }); } }
  }
  const sheets = [];
  const ctx = await netContext();
  for (const [u, p] of [...linked.entries()].sort((x, y) => byStr(x[0], y[0]))) { const r = await L.getUrl(u, { cfg, ctx, fallbackToNode: true, maxBytes: 6 * 1048576 }); if (r.status === 200 && r.text) sheets.push({ text: r.text, src: fileOf(u), p }); else NOTE('INT-07', `stylesheet not readable: ${fileOf(u)} (${r.status === -1 ? r.error : r.status})`); }
  for (const x of [...inline.values()].sort((a1, b1) => byStr(a1.id + a1.p, b1.id + b1.p))) sheets.push({ text: x.text, src: `inline <style> ${x.id} (${x.p})`, p: x.p });
  if (!sheets.length) { for (const id of ['INT-07', 'XB-06', 'XB-07']) NR(id, 'no readable project CSS (every stylesheet is platform / plugin / third-party, or none could be read) — route: list the project stylesheets in qa-target.json "cssOwn"'); if (cfg.stage === '1') NR('STRUCT-02', 'partial: no readable project CSS — descendant type selectors not checked'); return; }
  const b = await browser('chromium'); const c2 = await b.newContext(); const pg = await c2.newPage(); await pg.goto('about:blank');
  const agg = { rules: 0, hover: 0, animates: false, reducedMotion: false, textSizeAdjust: false };
  try {
    for (const sh of sheets) {
      const r = await ev(pg, M.CSS_SCAN, [sh.text, sh.src], 60000).catch(e => ({ parseError: errMsg(e) }));
      if (r.parseError) { NOTE('INT-07', `${sh.src}: not parsed (${r.parseError})`); continue; }
      agg.rules += r.rules; agg.hover += r.hover; agg.animates = agg.animates || r.animates; agg.reducedMotion = agg.reducedMotion || r.reducedMotion; agg.textSizeAdjust = agg.textSizeAdjust || r.textSizeAdjust;
      for (const x of r.un) F('INT-07', { css: sh.src, rule: x, why: ':hover outside @media (hover: hover)' }, `${sh.src}|${x}`);
      for (const x of r.webkit.concat(r.vh)) F('XB-06', { css: sh.src, rule: x }, `${sh.src}|${x}`);
      if (cfg.stage === '1') for (const x of r.descType) F('STRUCT-02', { css: sh.src, rule: x, why: 'descendant type selector in project CSS' }, `${sh.src}|${x}`);
    }
  } finally { await c2.close().catch(() => { }); }
  T('INT-07', Math.max(1, agg.hover)); T('XB-06', Math.max(1, agg.rules ? 1 : 0)); T('XB-07');
  NOTE('INT-07', `${sheets.length} project stylesheet(s), ${agg.rules} rules, ${agg.hover} :hover rules`);
  if (agg.animates && !agg.reducedMotion) F('XB-07', { why: 'project CSS animates but never handles prefers-reduced-motion' }, 'rm');
  if (!agg.textSizeAdjust) F('XB-07', { why: 'text-size-adjust not set in project CSS (iOS landscape text inflation)' }, 'tsa');
  if (cfg.stage === '1') T('STRUCT-02');
}

// ------------------------------------------------------------------------------------------------ stage 1: source structure (STRUCT-01..03)
async function structPass() {
  const pages = PLAN.all.slice(0, 200); if (PLAN.all.length > 200) for (const id of ['STRUCT-01', 'STRUCT-02', 'STRUCT-03']) NR(id, `partial: ${PLAN.all.length - 200} pages over the 200-page cap not read`);
  const pads = {};
  for (const p of pages) {
    if (late()) { GAP(['STRUCT-01', 'STRUCT-02', 'STRUCT-03'], `${p} source structure`, BUDGET_WHY); continue; }
    let s; try { s = await open('chromium', REF.desktop, { ctx: { javaScriptEnabled: false } }); } catch (e) { GAP(['STRUCT-01', 'STRUCT-02', 'STRUCT-03'], p, errMsg(e)); continue; }
    try {
      await s.page.goto(cfg.base + p, { waitUntil: 'load', timeout: 45000 });
      const r = await ev(s.page, M.STRUCT_SCAN, DECP, 60000);
      T('STRUCT-01'); T('STRUCT-02'); T('STRUCT-03');
      if (r.noMain) { F('STRUCT-01', { where: p, why: 'no <main> in the source markup' }, `${p}|main`); continue; }
      for (const x of r.notSection) F('STRUCT-01', { where: p, el: x, why: 'block directly in <main> is not a <section>' }, `${p}|${x}`);
      if (!r.container) F('STRUCT-01', { where: p, why: 'no common container as the first child of the sections (set decisions.containerClass)' }, `${p}|container`);
      for (const x of r.badFirst) F('STRUCT-01', { where: p, el: x, container: r.container, why: 'first child of the section is not the container' }, `${p}|${x}|first`);
      for (const x of r.extra) F('STRUCT-01', { where: p, el: x, why: 'section has children besides the container and declared decor' }, `${p}|${x}|extra`);
      r.pads.forEach(v => { (pads[v] = pads[v] || []).push(p); });
      for (const x of r.many) F('STRUCT-02', { where: p, el: x, why: 'more than 2 classes' }, `${p}|${x}|many`);
      for (const x of r.badName) F('STRUCT-02', { where: p, class: x, pattern: DEC.classNamePattern, why: 'class name does not match decisions.classNamePattern' }, `${x}|name`);
      for (const x of r.leftovers) F('STRUCT-02', { where: p, el: x, why: 'builder leftover (field-* class or empty wrapper)' }, `${p}|${x}|left`);
      for (const x of r.inline) F('STRUCT-03', { where: p, el: x, why: 'inline style attribute in the source markup of <main>' }, `${p}|${x}`);
    } catch (e) { GAP(['STRUCT-01', 'STRUCT-02', 'STRUCT-03'], p, `source not read: ${errMsg(e)}`); }
    finally { await s.close(); }
  }
  const pv = Object.keys(pads); if (pv.length > 1) F('STRUCT-01', { paddings: Object.fromEntries(pv.map(v => [v, pads[v].slice(0, 3)])), why: 'container side padding differs across sections (1440)' }, 'pads');
  NOTE('STRUCT-01', 'read with JavaScript disabled at 1440 (source markup, not runtime DOM)');
}

// ------------------------------------------------------------------------------------------------ cross-engine (XB-01, XB-04, FORM-07)
function compareEngine(engine, id) {
  for (const { p, w, s } of measured(engine)) {
    const c = statOf(p, w); if (!c) continue; const W = where(p, w, engine); T(id);
    if (s.overflowX > 0 && !(c.overflowX > 0)) F(id, { where: W, px: s.overflowX, why: `horizontal scroll in ${engine} only` }, `${W}|ox`);
    const cl = new Set((c.clipped || []).map(x => x.sel + '|' + x.text)); const extra = (s.clipped || []).filter(x => !cl.has(x.sel + '|' + x.text));
    if (extra.length) F(id, { where: W, els: extra.slice(0, 4).map(x => `${x.sel} "${x.text}" L${x.left} R${x.right}`), why: `clipped in ${engine} only` }, `${W}|clip`);
    if ((s.fontErrors || []).length) F(id, { where: W, fonts: s.fontErrors, why: `font faces fail to load in ${engine}` }, `${W}|font`);
    const bi = (s.imgs || []).filter(i => i.broken).map(i => fileOf(i.src)); const cb = new Set((c.imgs || []).filter(i => i.broken).map(i => fileOf(i.src))); const nb = bi.filter(x => !cb.has(x));
    if (nb.length) F(id, { where: W, images: nb.slice(0, 4), why: `broken images in ${engine} only` }, `${W}|img`);
    if (s.stuckDone && c.stuckDone) { const cs = new Set((c.stuck || []).map(x => x.sel)); const ns = (s.stuck || []).filter(x => !cs.has(x.sel)); if (ns.length) F(id, { where: W, els: ns.slice(0, 4).map(x => x.sel), why: `left at an animation start value in ${engine} only` }, `${W}|stuck`); }
    const sa = (s.sectionPad || []).map(x => x.h), sb = (c.sectionPad || []).map(x => x.h);
    if (sa.length !== sb.length) F(id, { where: W, sections: `${sb.length} → ${sa.length}`, why: `section count differs from Chromium in ${engine}` }, `${W}|secn`);
    else { const d = sa.map((h, i) => h - sb[i]).map((x, i) => [i, x]).filter(([, x]) => Math.abs(x) > 2); if (d.length) F(id, { where: W, diffs: d.slice(0, 4).map(([i, x]) => `${(s.sectionPad[i] || {}).sel}: ${x > 0 ? '+' : ''}${x}px`), why: `section heights differ from Chromium in ${engine} (±2px)` }, `${W}|sech`); }
    if ((s.h1 || []).length !== (c.h1 || []).length) F(id, { where: W, why: `h1 count ${c.h1.length} → ${s.h1.length} in ${engine}` }, `${W}|h1`);
    if (s.net && c.net) { const ce = new Set(c.net.errors.map(e => e.text)); const ne = s.net.errors.filter(e => !ce.has(e.text)); for (const e of ne.slice(0, 3)) F(id, { where: W, error: e.text, why: `JS error in ${engine} only` }, `${W}|js|${e.text}`); }
    if (id === 'XB-01') {
      (s.forms || []).forEach((f, fi) => { const cf = (c.forms || [])[fi]; if (!cf) return; f.fields.forEach((x, i) => { const y = cf.fields[i]; if (!y || (y.name || y.id) !== (x.name || x.id)) return; T('FORM-07'); const bad = []; if (Math.abs(x.h - y.h) > 1) bad.push(`height ${y.h}→${x.h}`); if (x.pt !== y.pt || x.pb !== y.pb) bad.push(`padding ${y.pt}/${y.pb}→${x.pt}/${x.pb}`); if (x.lh !== y.lh) bad.push(`line-height ${y.lh}→${x.lh}`); if (x.type !== y.type) bad.push(`type ${y.type}→${x.type}`); if (bad.length) F('FORM-07', { where: W, field: x.label || x.name, diff: bad, why: `field renders differently in ${engine}` }, `${W}|${x.name}|${x.id}`); }); });
    }
  }
}
function evalCrossEngine() {
  for (const engine of ['webkit', 'firefox']) {
    const list = ['XB-01', 'FORM-07', 'FORM-10', 'FORM-11', 'XB-08', 'NAV-13', 'I18N-03'];
    if (!cfg.engines.includes(engine)) { for (const id of list) NR(id, `partial: ${engine} not in the engine list (--engines / qa-target.json engines)`); continue; }
    if (ENGINE_FAIL[engine]) { for (const id of list) NR(id, `partial: ${engine} — ${ENGINE_FAIL[engine]}`); continue; }
    compareEngine(engine, 'XB-01');
  }
  if (NO_EDGE) NR('XB-04', 'skipped by --no-edge');
  else if (ENGINE_FAIL.msedge) NR('XB-04', ENGINE_FAIL.msedge);
  else { compareEngine('msedge', 'XB-04'); NOTE('XB-04', `Edge ${BR.msedge && BR.msedge.__qaVersion ? BR.msedge.__qaVersion : ''} (${BR.msedge && BR.msedge.__qaSource}) at 1440 and 360 on ${PLAN.sampled.slice(0, QUICK ? 2 : 5).length} pages`); }
}

// ------------------------------------------------------------------------------------------------ NAV-10 header sweep evaluation
function evalHeader(res) {
  const ok = res.filter(r => !r.none && !r.error);
  if (!res.length) return;
  if (!ok.length) { NR('NAV-10', res[0] && res[0].none ? 'no header region found (set selectors.header)' : `header not measurable: ${res[0] && res[0].error}`); return; }
  const ref = {}; for (const r of ok) { const m = r.burger ? 'burger' : 'full'; if (!ref[m]) ref[m] = r; }
  const fullMax = Math.max.apply(null, ok.filter(r => !r.burger).map(r => r.navLinks).concat([0]));
  const probs = ok.map(r => {
    T('NAV-10'); const pr = [];
    if (r.rows > 1) pr.push(`${r.rows} rows`);
    if (r.wrapped.length) pr.push(`wrapped label: ${r.wrapped.slice(0, 3).join(', ')}`);
    if (r.overlaps.length) pr.push(`overlap: ${r.overlaps.slice(0, 2).join(', ')}`);
    if (r.outside.length) pr.push(`outside the header: ${r.outside.slice(0, 3).join(', ')}`);
    if (!r.burger && r.navLinks < fullMax) pr.push(`${fullMax - r.navLinks} nav link(s) hidden without a burger`);
    const rf = ref[r.burger ? 'burger' : 'full']; if (rf && r.height > rf.height * 1.2) pr.push(`height ${r.height}px > 1.2 × ${rf.height}px (at ${rf.w})`);
    return { w: r.w, pr: pr.join('; ') };
  });
  // group consecutive widths with the same problem
  let cur = null;
  const flush = () => { if (cur && cur.pr) F('NAV-10', { widths: cur.from === cur.to ? `${cur.from}` : `${cur.from}–${cur.to}`, why: cur.pr }, `${cur.from}|${cur.pr}`); };
  for (const x of probs) { if (cur && cur.pr === x.pr) { cur.to = x.w; continue; } flush(); cur = { from: x.w, to: x.w, pr: x.pr }; }
  flush();
  NOTE('NAV-10', `swept ${ok.length} widths ${ok[0].w}→${ok[ok.length - 1].w} on ${PLAN.sampled[0] || '/'} (desktop context resized; touch emulation not applied during the sweep)`);
}

// ------------------------------------------------------------------------------------------------ platform (RUN-05)
function resolvePlatform() {
  const html = HOME_SERVER ? L.detectPlatformFromHtml(HOME_SERVER.text, cfg.base + '/') : { platform: null, evidence: [] };
  const home = statOf(PLAN.sampled[0] || '/', REF.desktop); const sig = home && home.platformSignals;
  let det = html.platform; const evid = html.evidence.slice();
  if (!det && sig) { if (sig.webflow) { det = 'webflow'; evid.push('rendered Webflow markers'); } else if (sig.wordpress) { det = 'wordpress'; evid.push('rendered WordPress markers'); } else if (sig.other) { det = 'other'; evid.push(`${sig.other} markers`); } }
  if (!det && cfg.stage === '1') { det = 'static'; evid.push('stage 1: local HTML build'); }
  T('RUN-05');
  if (cfg.platform) {
    if (det && det !== cfg.platform) Q('RUN-05', { configured: cfg.platform, detected: det, evidence: evid, why: 'qa-target.json "platform" disagrees with the markers on the site' }, 'conflict');
    PLATFORM = { name: cfg.platform, evidence: ['qa-target.json "platform"'].concat(det ? [`detected ${det}: ${evid.join(', ')}`] : []), source: 'config' };
  } else if (det) PLATFORM = { name: det, evidence: evid, source: 'detected' };
  else { PLATFORM = null; Q('RUN-05', { generator: (sig && sig.generator) || null, why: 'no positive platform marker — set qa-target.json "platform" to "static" (hand-coded / generated HTML) or "other" (another CMS); rows of one platform stay NOT RUN until then' }, 'unknown'); }
  NOTE('RUN-05', PLATFORM ? `${PLATFORM.name} — ${PLATFORM.evidence.join('; ')}` : 'platform unknown');
}

// ------------------------------------------------------------------------------------------------ presence sweep (RUN-02)
let PRESENCE = {};
const PHASE_RAN = new Set();
function presenceSweep() {
  const all = measured('chromium'); const P = {}; const add = (g, p) => { (P[g] = P[g] || new Set()).add(p); };
  for (const { p, w, s } of all) {
    const pr = s.presence || {};
    if (s.hamburgerVisible) add('burger', p);
    if (pr.dropdowns > 0 && w >= 992) add('dropdowns', p);
    if (pr.anchors > 0) add('anchors', p);
    if (pr.contacts > 0) add('contacts', p);
    if (pr.social > 0) add('social', p);
    if (pr.sliderLike > 0) add('sliders', p);
    if ((s.tabGroups || []).length) add('tabs', p);
    if ((s.faq && s.faq.items >= 2) || (s.faq && s.faq.containers > 0)) add('faq', p);
    if (pr.dialogTriggers > 0 || pr.dialogs > 0) add('dialogs', p);
    const fm = (s.forms || []).filter(f => f.fields.length && !f.isSearch && !f.password);
    if (fm.length || (s.formsUnreached || []).length) add('forms', p);
    if (fm.some(f => f.lead)) add('mailForms', p);
    if ((s.videos || []).length || (s.embeds || []).length) add('video', p);
    if ((s.maps || []).length || (s.mapsJs || []).length) add('maps', p);
    for (const [g, k] of [['search', 'search'], ['subscribe', 'subscribe'], ['fileFields', 'fileField'], ['sortFilter', 'sortFilter'], ['downloads', 'downloads'], ['preloader', 'preloader'], ['passwordPage', 'passwordPage'], ['accounts', 'accounts'], ['cms', 'cms']]) if (pr[k] > 0) add(g, p);
    if ((s.hreflang || []).filter(x => x.hl !== 'x-default').length > 1 || pr.langSwitch > 0) add('lang', p);
  }
  for (const p of GATED.keys()) add('passwordPage', p);
  const planned = PLAN.sampled.length * cfg.widths.length + PLAN.all.filter(p => !PLAN.sampled.includes(p)).length;
  const failed = Object.entries(STAT.chromium).filter(([k, s]) => s.fail && !splitKey(k)[0].startsWith(PROBE)).length;
  const complete = failed === 0;
  const out = {};
  for (const g of Object.keys(GATES).sort(byStr)) {
    if (g === 'acf') continue; // flexible content / shortcodes: read in wp-admin, not from the front end
    if (g === 'donor') { out.donor = Array.isArray(DEC.donor) ? { found: DEC.donor.length > 0, source: 'decisions.donor' } : { found: null, source: 'decisions.donor not set' }; continue; }
    if (g === 'template') { out.template = MISSING.projectType ? { found: null, source: 'decisions.projectType not set' } : { found: DEC.projectType === 'template', source: 'decisions.projectType' }; continue; }
    const pages = P[g] ? [...P[g]].sort((x, y) => (PAGE_ORDER.get(x) || 0) - (PAGE_ORDER.get(y) || 0) || byStr(x, y)) : [];
    out[g] = pages.length ? { found: true, count: pages.length, pages: pages.slice(0, 10) } : { found: complete ? false : null, searched: `${all.length} of ${planned} page × width loads in Chromium${complete ? '' : `; ${failed} load(s) failed, so absence is not proven`}` };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ RUN-03, RUN-04, RUN-07
function runRows() {
  T('RUN-02');
  for (const g of Object.keys(PRESENCE).sort(byStr)) { const v = PRESENCE[g]; NOTE('RUN-02', `${g}: ${v.found === true ? `present on ${v.count} page(s) (${v.pages.slice(0, 3).join(', ')})` : v.found === false ? 'absent — searched ' + v.searched : 'unknown — ' + (v.searched || v.source)}`); }
  if (Object.values(PRESENCE).some(v => v.found === null && v.searched)) NR('RUN-02', 'partial: some page loads failed — an absent subject is not proven (rows of those gates stay NOT RUN)');
  // RUN-03: page inventory
  T('RUN-03');
  NOTE('RUN-03', `source: ${INFO.source}${INFO.explicit ? ' (explicit list)' : ''}; ${PLAN.all.length} page(s); sitemaps: ${(INFO.sitemaps || []).join(', ') || 'none'}`);
  for (const wn of INFO.warnings || []) NOTE('RUN-03', wn);
  for (const er of (INFO.errors || []).slice(0, 5)) NOTE('RUN-03', 'error: ' + er);
  for (const n of PLAN.notes || []) NOTE('RUN-03', n);
  if (INFO.source === 'none' && !DEC.singlePage) NR('RUN-03', 'only "/" was found (no sitemap, no crawlable links) — list the pages in qa-target.json "pages", or set decisions.singlePage: true if the site really is one page');
  if (cfg.pagesFrom === 'cli') NR('RUN-03', `partial: inventory replaced by --pages (${PLAN.all.length} page(s)) — a cut, not the site`);
  if (INFO.capped) NR('RUN-03', `partial: inventory capped (${INFO.capped}) — raise maxPages / crawlMax`);
  if (INFO.blocked) NOTE('RUN-03', 'the host challenged some inventory requests');
  // RUN-04: coverage
  T('RUN-04');
  const fails = []; for (const e of Object.keys(STAT)) for (const [k, s] of Object.entries(STAT[e]).sort((x, y) => cmpKey(x[0], y[0]))) if (s.fail) fails.push(`${e} ${k}: ${s.fail}`);
  for (const f of fails.slice(0, 15)) NR('RUN-04', 'not measured: ' + f); if (fails.length > 15) NR('RUN-04', `… and ${fails.length - 15} more page × width loads not measured`);
  for (const g of GAPS.slice(0, 15)) NR('RUN-04', `not run: ${g.what} — ${g.why}`); if (GAPS.length > 15) NR('RUN-04', `… and ${GAPS.length - 15} more interaction / structure steps not run`);
  for (const e of Object.keys(ENGINE_FAIL).sort(byStr)) NR('RUN-04', `${e}: ${ENGINE_FAIL[e]}`);
  if (QUICK) { NR('RUN-04', `--quick: WebKit / Firefox at ${XB_WIDTHS().join(' + ')} only, Edge on 2 pages`); for (const id of ['XB-01', 'FORM-07', 'FORM-15', 'XB-04']) NR(id, 'partial: --quick cut the widths / pages of the other engines'); }
  for (const e of ['webkit', 'firefox']) if (!cfg.engines.includes(e)) NR('RUN-04', `${e} not in the engine list — cut`);
  if (a.widths) { let want = [1920, 1440, 1280, 992, 768, 568, 360]; try { const t = L.readTarget(a); if (Array.isArray(t.widths) && t.widths.length) want = t.widths.map(Number); } catch (e) { } const cut = want.filter(w => !cfg.widths.includes(w)); if (cut.length) NR('RUN-04', `--widths cut the project tiers ${cut.join(', ')}`); }
  if (NO_EDGE) NR('RUN-04', '--no-edge: Microsoft Edge pass skipped');
  if (late()) NR('RUN-04', BUDGET_WHY);
  NOTE('RUN-04', `Chromium: ${measured('chromium').length} page × width loads measured (${PLAN.sampled.length} sampled page(s) × ${cfg.widths.length} widths + ${PLAN.all.length - PLAN.sampled.length} content-only page(s) at ${REF.desktop} and ${REF.mobile}); interactions at ${cfg.interactWidths.join(', ')}; other engines at ${XB_WIDTHS().join(', ')}`);
  if (PLAN.sampling) {
    NOTE('RUN-04', `template sampling on (${PLAN.all.length} pages → ${PLAN.sampled.length} in the heavy passes: every width, interactions, other engines; the rest get the content pass at ${REF.desktop} + ${REF.mobile}; sample.threshold ${cfg.sample.threshold}, ≤${cfg.sample.perTemplate} per template; --full turns it off)`);
    const gk = Object.keys(PLAN.groups || {}).filter(k => PLAN.groups[k].count > PLAN.groups[k].picked.length).sort(byStr);
    for (const k of gk.slice(0, 12)) NOTE('RUN-04', `template ${k}: ${PLAN.groups[k].count} pages share it → sampled ${PLAN.groups[k].picked.join(', ')}`);
    if (gk.length > 12) NOTE('RUN-04', `… and ${gk.length - 12} more sampled template(s) in pages.json`);
  }
  const xbCut = XB_CUT();
  if (xbCut.length && !QUICK && cfg.engines.some(e => e === 'webkit' || e === 'firefox')) {
    const msg = `WebKit / Firefox measured at ${XB_WIDTHS().join(' · ')} (anchor tiers); project tier(s) ${xbCut.join(', ')} measured in Chromium only — qa-target.json "xbWidths": "all" adds them`;
    NOTE('RUN-04', msg); NOTE('XB-01', msg);
  }
  // RUN-07: run conditions
  T('RUN-07'); const sv = L.skillVersion();
  NOTE('RUN-07', `skill ${sv.version || '?'} (scripts ${sv.hash}), config ${cfg._configHash || 'none'}, ${process.platform} ${require('os').release()} ${process.arch}, Node ${process.versions.node}, playwright-core ${sv.playwright || '?'}`);
  for (const e of ['chromium', 'webkit', 'firefox', 'msedge']) { const b = BR[e]; const c = L.engineChoice(e); if (b && b.__qaVersion) NOTE('RUN-07', `${e}: ${b.__qaVersion} (${b.__qaSource || (c && c.how) || 'bundled'})${c && c.fallback ? ' — fallback from ' + c.wanted : ''}`); else if (ENGINE_FAIL[e]) NOTE('RUN-07', `${e}: not available — ${ENGINE_FAIL[e]}`); }
  const st0 = statOf(PLAN.sampled[0] || '/', REF.desktop);
  NOTE('RUN-07', `locale ${cfg.locale}, timezone ${cfg.timezoneId}, colour scheme light, DPR 1, reduced motion no-preference, scrollbar ${st0 && st0.scrollbarW ? st0.scrollbarW + 'px classic' : 'overlay / 0px'} at ${REF.desktop}, touch emulation below 768, iPad descriptor for FORM-11`);
  NOTE('RUN-07', `flags: ${Object.keys(a).filter(k => k !== '_').sort(byStr).map(k => `--${k}${a[k] === true ? '' : '=' + a[k]}`).join(' ') || 'none'}; spelling: spell.cjs (texts.json)`);
  if (BLOCKED.size) NOTE('RUN-07', `audit-only guard blocked ${[...BLOCKED.values()].reduce((x, y) => x + y, 0)} non-GET request(s): ${[...BLOCKED.keys()].sort(byStr).slice(0, 5).join(', ')}`);
  const caps = []; for (const e of ['webkit', 'firefox']) if (ENGINE_FAIL[e] || !cfg.engines.includes(e)) caps.push(`${e} → XB-01, XB-08, FORM-07, FORM-10, FORM-11, NAV-13, I18N-03 partial`);
  if (ENGINE_FAIL.msedge || NO_EDGE) caps.push('Microsoft Edge → XB-04 not run');
  if (caps.length) NOTE('RUN-07', 'capabilities missing: ' + caps.join('; '));
}

// ------------------------------------------------------------------------------------------------ finalize: every qa-run row gets exactly one outcome
const NATURAL_NA = {
  'LINK-02': ['static', 'no same-page anchor links on the measured pages'], 'LINK-04': ['static', 'no external links'], 'LINK-08': ['static', 'no mailto: / tel: links'],
  'LINK-09': ['static', 'no visible email address or phone number'], 'LINK-10': ['anchors', 'no in-page anchor link with a visible target'], 'LINK-11': ['static', 'no links to social networks'],
  'LINK-13': ['static', 'no buttons outside forms and no <a href="#"> toggles'], 'LINK-07': ['nav', 'no top-level nav items in the header'],
  'INT-01': ['toggles', 'no toggles (aria-expanded, tabs, summary, accordion) in main'], 'INT-02': ['toggles', 'no toggle revealed content'],
  'INT-03': ['sliders', 'no slider with arrows that stands still'], 'INT-04': ['sliders', 'no autoplaying slider or ticker'], 'INT-09': ['sliders', 'no slider with pagination bullets'], 'INT-10': ['sliders', 'no slider with two or more slides'],
  'INT-11': ['reveal', 'no reveal-on-scroll elements'], 'INT-13': ['hover', 'no absolute ::before/::after hover layers'], 'INT-14': ['hover', 'no logo link in the header or footer'],
  'INT-15': ['touch', 'no hover-only affordance found on desktop'], 'MODAL-01': ['modals', 'no pop-up / lightbox trigger'],
  'NAV-04': ['burger', 'no CTA in the burger panel'], 'NAV-06': ['burger', 'fewer than two rows in the burger panel'], 'NAV-08': ['burger', 'no logo visible with the burger open'],
  'NAV-11': ['nav', 'no logo found in the header or footer'], 'NAV-12': ['burger', 'no expandable burger row with a matching desktop dropdown'], 'NAV-13': ['toggles', 'no expandable burger rows and no FAQ / accordion rows'],
  'NAV-14': ['burger', 'no burger panel to test'], 'A11Y-04': ['static', 'no tab interfaces'], 'A11Y-09': ['forms', 'no error / success message appeared after an empty submit'],
  'LAY-04': ['static', 'no card grids'], 'LAY-06': ['toggles', 'no tabs / filters that switch card sets'], 'LAY-12': ['static', 'no background change between sections'],
  'LAY-13': ['static', 'fewer than two left-edge samples per tier'], 'LAY-14': ['static', 'no heading → text / button sequences'], 'LAY-15': ['static', 'no icon group with two or more stroked icons'],
  'IMG-01': ['static', 'no <img> on the measured pages'], 'IMG-02': ['static', 'no <img> on the measured pages'], 'IMG-03': ['static', 'no visible raster images'], 'IMG-04': ['static', 'no visible content images'],
  'IMG-06': ['static', 'no visible images'], 'IMG-07': ['static', 'no image / font files in the network log'], 'IMG-08': ['static', 'no image with a non-empty alt'], 'IMG-09': ['static', 'no background images'],
  'COPY-05': ['static', 'no card groups'], 'COPY-07': ['static', 'no card groups or sections'], 'TEXT-07': ['static', 'no dates in the text'], 'TEXT-03': ['static', 'no English pages'],
  'TEXT-06': ['static', 'no menu label whose target page was measured'],
  'FORM-01': ['forms', 'no form fields'], 'FORM-02': ['static', 'no required fields'], 'FORM-03': ['static', 'no name / email / phone / organisation fields'], 'FORM-04': ['static', 'no lead form (search, login and cart forms excluded)'],
  'FORM-05': ['forms', 'no date, count or phone fields'], 'FORM-10': ['forms', 'no single-line text field with a Chromium baseline'], 'FORM-11': ['forms', 'no fields to type into'],
  'FORM-12': ['static', 'no form fields'], 'FORM-13': ['static', 'no form with two or more fields, an empty select or a submit'], 'FORM-15': ['static', 'no form fields below 768'],
  'WF-02': ['static', 'no form with a data-name'], 'WF-03': ['static', 'no form success / error or empty-state elements'], 'SEO-11': ['static', 'no FAQ and no FAQPage schema'],
  'MAP-01': ['static', 'no embedded map'], 'MAP-02': ['static', 'no embedded map'], 'VID-01': ['static', 'no <video>'], 'VID-02': ['static', 'no <video>'], 'VID-03': ['static', 'no <video>'], 'VID-04': ['static', 'no <video>'],
  'CMS-01': ['static', 'no collection / related-content lists'], 'A11Y-03': ['static', 'no desktop dropdown menus'], 'NAV-01': ['static', 'no desktop dropdown menus'],
  'XB-08': ['toggles', 'no toggles, burger or hover targets to compare'], 'COPY-02': ['static', 'no text blocks'], 'COPY-03': ['static', 'no text blocks'],
  'I18N-02': ['static', 'single-language site'], 'I18N-03': ['static', 'single-language site'], 'I18N-04': ['static', 'single-language site'], 'I18N-05': ['static', 'single-language site'], 'I18N-06': ['static', 'single-language site'],
};
let CRASH = null;
function summarize(list) {
  const by = {}; for (const g of list) (by[g.why] = by[g.why] || []).push(g.what);
  return Object.keys(by).sort(byStr).map(why => `partial: ${by[why].length} step(s) not run — ${why} (${by[why].sort(byStr).slice(0, 3).join(', ')}${by[why].length > 3 ? ', …' : ''})`);
}
function finalize() {
  const gapBy = {}; for (const g of GAPS) for (const id of g.ids) if (MINE_SET.has(id)) (gapBy[id] = gapBy[id] || []).push(g);
  // static load failures make every static-derived row partial
  const sf = []; for (const [k, s] of Object.entries(STAT.chromium).sort((x, y) => cmpKey(x[0], y[0]))) if (s.fail && !k.startsWith(PROBE + '@')) sf.push({ what: `chromium ${k}`, why: s.fail.replace(/ on https?:\/\/\S+/, '') });
  if (sf.length) for (const id of STATIC_IDS) (gapBy[id] = gapBy[id] || []).push(...sf);
  for (const id of MINE) {
    const row = ROW(id); const l = led(id); const c = () => R.checks[id] = R.checks[id] || { items: [], notes: [] };
    const ap = REG.appliesTo(row, { platform: PLATFORM ? PLATFORM.name : null, stage: cfg.stage });
    if (ap !== true) { R.na(id, `${ap} (qa-run)`); continue; }
    if (row.platforms && !PLATFORM) { R.notRun(id, 'platform unknown (RUN-05) — set qa-target.json "platform"'); continue; }
    const gaps = gapBy[id] || [];
    if (l.items.size || l.t > 0) {
      for (const [, it] of [...l.items.entries()].sort((x, y) => byStr(x[0], y[0]))) { if (it.ask) R.ask(id, it); else R.add(id, it); }
      const ch = c(); ch.ran = true; ch.tested = Math.max(l.t, l.items.size ? 1 : 0);
      for (const n of l.notes) R.note(id, n);
      if (l.extra) R.note(id, `+${l.extra} more finding(s) not listed (cap ${ITEM_CAP} per row)`);
      for (const why of [...l.nr].sort(byStr)) R.notRun(id, /^partial/.test(why) ? why : 'partial: ' + why);
      for (const why of summarize(gaps)) R.notRun(id, why);
      if (CRASH) R.notRun(id, `partial: qa-run stopped early (${CRASH})`);
      continue;
    }
    for (const n of l.notes) R.note(id, n);
    const gate = row.gate && PRESENCE[row.gate];
    if (l.na.size) { R.na(id, [...l.na].sort(byStr).join('; ')); continue; }
    if (gate && gate.found === false && !l.nr.size) { R.na(id, `subject absent: no ${gateName(row.gate)} (presence sweep RUN-02: ${gate.searched || gate.source})`); continue; }
    if (l.nr.size) { for (const why of [...l.nr].sort(byStr)) R.notRun(id, why); for (const why of summarize(gaps)) R.notRun(id, why); continue; }
    if (gaps.length) { for (const why of summarize(gaps)) R.notRun(id, why.replace(/^partial: /, '')); continue; }
    if (CRASH) { R.notRun(id, `qa-run stopped early (${CRASH}) before this check`); continue; }
    const nat = NATURAL_NA[id];
    if (nat && PHASE_RAN.has(nat[0]) && !(gate && gate.found === true)) { R.na(id, `${nat[1]} (searched ${nat[0] === 'static' ? 'every measured page' : 'the ' + nat[0] + ' pass'})`); continue; }
    R.notRun(id, gate && gate.found === true ? `subject present (${gate.pages.slice(0, 3).join(', ')}) but this check did not reach it — rerun, or run with --full / more interactWidths` : `not reached in this run${nat ? ` (the ${nat[0]} pass did not run)` : ''} — rerun qa-run`);
  }
}

// ------------------------------------------------------------------------------------------------ outputs
let FINISHED = false, SRV = null;
const BIG = ['text', 'hiddenText', 'attrTexts', 'copy', 'tokenVals', 'net'];
function writeOutputs() {
  // static-chromium.json: the Chromium measurements per page@width (other instruments read forms, tpl, fields)
  const sc = {}; for (const k of Object.keys(STAT.chromium).sort(cmpKey)) { const s = STAT.chromium[k]; const o = {}; for (const [kk, v] of Object.entries(s)) if (!BIG.includes(kk)) o[kk] = v; if (o.cssSources) o.cssSources = o.cssSources.map(x => (x.href ? { href: x.href } : { inline: true, id: x.id })); sc[k] = o; }
  L.writeJsonAtomic(path.join(OUT, 'static-chromium.json'), JSON.stringify(sc));
  // texts.json for spell.cjs: every source of copy a visitor meets
  const texts = { _runId: RUN && RUN.runId, _base: cfg.base, _tool: 'qa-run', _at: new Date().toISOString() };
  for (const { p, s } of measured('chromium', w => w === REF.desktop)) {
    const src = [];
    if (s.text) src.push({ src: 'text', t: s.text });
    if (s.hiddenText) src.push({ src: 'hidden-text', t: s.hiddenText });
    for (const i of s.imgs || []) if (i.alt && i.alt.trim()) src.push({ src: 'alt', t: i.alt.trim(), where: fileOf(i.src) });
    for (const x of s.attrTexts || []) src.push(x);
    const m = s.meta || {}; for (const [k, v] of [['title', m.title], ['description', m.desc], ['og:title', m.ogTitle], ['og:description', m.ogDesc]]) if (v) src.push({ src: 'meta:' + k, t: v });
    for (const x of (s.ld && s.ld.strings) || []) src.push({ src: 'jsonld:text', t: x });
    for (const h of s.hiddenStates || []) if (h.text) src.push({ src: 'form-response', t: h.text, where: h.sel });
    texts[p] = { lang: (m.lang || '').toLowerCase(), sources: src };
  }
  L.writeJsonAtomic(path.join(OUT, 'texts.json'), JSON.stringify(texts));
  if (PLAN) L.writeJsonAtomic(path.join(OUT, 'pages.json'), Object.assign({ _tool: 'qa-run', base: cfg.base, source: INFO && INFO.source, explicit: !!(INFO && INFO.explicit) }, PLAN));
}
async function finish(code) {
  if (FINISHED) return; FINISHED = true;
  try { if (PLAN && !Object.keys(PRESENCE).length) PRESENCE = presenceSweep(); } catch (e) { /* presence stays empty */ }
  try { finalize(); } catch (e) { log('finalize failed: ' + errMsg(e)); for (const id of MINE) if (!R.checks[id]) R.notRun(id, 'qa-run finalize failed: ' + errMsg(e)); }
  R._platform = PLATFORM ? { name: PLATFORM.name, evidence: PLATFORM.evidence, source: PLATFORM.source } : null;
  R._stage = cfg.stage; R._presence = PRESENCE; R._timing = timingOut();
  R._coverage = { pages: PLAN ? PLAN.all.length : 0, sampled: PLAN ? PLAN.sampled.length : 0, widths: cfg.widths, interactWidths: cfg.interactWidths, engines: Object.keys(STAT).filter(e => Object.keys(STAT[e]).length), failedLoads: Object.values(STAT).reduce((n, S) => n + Object.values(S).filter(s => s.fail).length, 0), gaps: GAPS.length, budgetMinutes: cfg.budgetMinutes, elapsedMin: +((Date.now() - T0) / 60000).toFixed(1), crashed: CRASH };
  if (BR.msedge) R._env.engines = Object.assign({}, R._env.engines || {}, { msedge: { how: BR.msedge.__qaSource, version: BR.msedge.__qaVersion } });
  try { L.saveResults(R, OUT); } catch (e) { log('could not save results: ' + errMsg(e)); }
  try { writeOutputs(); } catch (e) { log('could not write static-chromium.json / texts.json / pages.json: ' + errMsg(e)); }
  progress('done', 1, 1, true);
  const cnt = { fail: 0, ask: 0, na: 0, notRun: 0, pass: 0 }; for (const id of MINE) { const ch = R.checks[id] || {}; const it = ch.items || []; if (it.some(x => !x.ask)) cnt.fail++; else if (it.length) cnt.ask++; else if (ch.notRun) cnt.notRun++; else if (ch.na) cnt.na++; else cnt.pass++; }
  log(`\nqa-run ${CRASH || STOPPED ? 'stopped' : 'finished'} in ${((Date.now() - T0) / 60000).toFixed(1)} min — ${MINE.length} rows: ${cnt.fail} with findings, ${cnt.ask} ask, ${cnt.pass} pass, ${cnt.na} n/a, ${cnt.notRun} not run → ${path.join(OUT, 'results-qa-run.json')}\nnext: node "${path.join(__dirname, 'manifest.cjs')}" --out "${OUT}"`);
  try { if (NETCTX) await NETCTX.close(); } catch (e) { }
  await withTimeout(closeBrowsers(), 20000, 'closing browsers').catch(() => { });
  try { if (SRV) await SRV.stop(); } catch (e) { }
  try { L.releaseLocks(); } catch (e) { }
  process.exit(code);
}

// ------------------------------------------------------------------------------------------------ iPad touch context (FORM-11)
async function ipadForms() {
  if (!cfg.engines.includes('webkit') || ENGINE_FAIL.webkit) { NR('FORM-11', 'partial: the iPad touch context needs WebKit'); return; }
  const dev = PW.devices && (PW.devices['iPad (gen 7)'] || PW.devices['iPad Mini']); if (!dev) { NR('FORM-11', 'partial: no iPad descriptor in this Playwright build'); return; }
  const pages = PLAN.sampled.filter(p => { const s = statOf(p, REF.desktop); return s && (s.forms || []).some(f => f.fields.length && !f.isSearch); }).slice(0, 3);
  for (const p of pages) {
    if (late()) { GAP(['FORM-11'], `${p} iPad forms`, BUDGET_WHY); continue; }
    let s; const d = Object.assign({}, dev); delete d.defaultBrowserType;
    try { s = await open('webkit', dev.viewport.width, { ctx: d }); } catch (e) { GAP(['FORM-11'], `${p} iPad`, errMsg(e)); continue; }
    s.engine = 'webkit iPad';
    try { await go(s.page, p, { settle: 500 }); await tagRegions(s.page); await markDoc(s.page); await phaseForms(s, p, dev.viewport.width, true); PHASE_RAN.add('forms'); }
    catch (e) { GAP(['FORM-11'], `${p} iPad forms`, errMsg(e)); }
    finally { await s.close(); }
  }
}

// ------------------------------------------------------------------------------------------------ main
async function step(name, list, fn, why) {
  if (late()) { GAP(list, name, BUDGET_WHY); stepTime(name, name, 0, 'cut: ' + BUDGET_WHY); return null; }
  progress(name, 0, 1, true); const t = Date.now();
  try { const r = await fn(); PHASE_RAN.add(name); return r; }
  catch (e) { log(`${name} failed: ${errMsg(e)}`); if (!(e && e.code === 'LAUNCH_FAILED')) GAP(list, name, `failed: ${errMsg(e)}`); return null; } // an engine that did not start is reported per row with its route
  finally { stepTime(name, name, Date.now() - t, typeof why === 'function' ? why() : (why || '')); }
}
function onCrash(e) {
  if (FINISHED) { process.exit(L.EXIT_NOT_RUN); return; }
  CRASH = firstLine((e && (e.message || e.stack)) || e, 160); log('qa-run crashed: ' + CRASH);
  setTimeout(() => process.exit(L.EXIT_NOT_RUN), 30000).unref();
  finish(L.EXIT_NOT_RUN);
}
process.on('uncaughtException', onCrash); process.on('unhandledRejection', onCrash);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) { try { process.on(sig, () => { if (FINISHED) process.exit(130); CRASH = 'interrupted (' + sig + ')'; setTimeout(() => process.exit(130), 20000).unref(); finish(L.EXIT_NOT_RUN); }); } catch (e) { } }

(async () => {
  PW = L.loadPlaywright(R, MINE, OUT); // missing playwright → every row NOT RUN with the install route, exit 3
  SRV = await L.resolveTarget(cfg);   // --local / "local": serve the folder on 127.0.0.1
  RUN = L.requireRun(OUT, cfg, { tool: 'qa-run' });
  L.acquireLock('qa-run', cfg, OUT);
  fs.mkdirSync(SHOTS, { recursive: true });
  log(`qa-run · ${cfg.base} · stage ${cfg.stage} · widths ${cfg.widths.join(',')} · engines ${cfg.engines.join(',')}${NO_EDGE ? '' : ' + msedge'} · ${process.platform} · Node ${process.versions.node}`);
  for (const m of Object.values(MISSING)) log('decision missing: ' + m);
  await wallStep('preflight', 'preflight + page inventory', () => preflight(), () => PLAN ? `${PLAN.all.length} pages found (${INFO && INFO.source})${PLAN.sampling ? `, templates read for sampling` : ''}` : '');
  PAGE_ORDER = new Map(PLAN.all.map((p, i) => [p, i])); PAGE_ORDER.set(PROBE, 1e6);
  log(`pages: ${PLAN.all.length} (${INFO.source})${PLAN.sampling ? `, ${PLAN.sampled.length} sampled for the heavy passes` : ''}`);
  await wallStep('static chromium', 'static pass Chromium', () => staticPass('chromium'), () => staticWhy('chromium')); PHASE_RAN.add('static');
  if (!measured('chromium').length) {
    const why = Object.values(STAT.chromium).map(s => s.fail).filter(Boolean)[0] || 'no page loaded';
    return abortAll(`no page could be measured in Chromium (${why})`);
  }
  resolvePlatform();
  // Priority order (the time budget cuts from the end, every cut listed per row): the Chromium static pass (above), the
  // cheap site-wide checks (HARD rows: links, robots / sitemap, headers, weight), the header sweep, Chromium
  // interactions, then the other engines, the iPad context and Edge.
  if (cfg.stage === '1') await step('struct', ['STRUCT-01', 'STRUCT-02', 'STRUCT-03'], () => structPass(), () => `${PLAN.all.length} pages, source HTML`);
  await step('css', ['INT-07', 'XB-06', 'XB-07', 'STRUCT-02'], () => cssScan(), 'project stylesheets, once');
  const ls = await step('links', ['LINK-03', 'I18N-02'], () => linkStatuses(), () => LINK_WHY) || {};
  await step('site', ['SEO-06', 'SEO-07', 'SEO-08', 'SEO-12', 'SEC-01'], () => siteChecks(), 'robots, sitemap, share previews, headers');
  await step('weight', ['PERF-02', 'VID-04'], () => weightAndVideo(), () => `${PLAN.sampled.length} pages (sizes from the static pass)`);
  const hs = await step('header sweep', ['NAV-10'], () => headerSweep(), () => `${HS_WIDTHS} widths on ${PLAN.sampled[0] || '/'} (one page, resized)`) || [];
  log(`chromium: interactions (${cfg.interactConcurrency} at a time)`);
  await wallStep('interactions chromium', 'interactions Chromium', () => runJobs(interactJobs(['chromium']), cfg.interactConcurrency, 'interactions chromium'), () => interactWhy('chromium', PLAN.sampled.length, cfg.interactWidths));
  for (const e of ['webkit', 'firefox']) if (cfg.engines.includes(e)) await step(`static ${e}`, XB_IDS, async () => { await browser(e); await staticPass(e); }, () => staticWhy(e));
  const lite = ['webkit', 'firefox'].filter(e => cfg.engines.includes(e) && !ENGINE_FAIL[e]);
  if (lite.length) {
    log(`${lite.join(' + ')}: interactions`);
    if (late()) { for (const e of lite) GAP(INTERACT_IDS.filter(id => /^(XB-08|NAV-13|FORM-10|FORM-11|I18N-03)$/.test(id)), `${e} interactions`, BUDGET_WHY); stepTime(`interactions ${lite.join('+')}`, `interactions ${lite.join(' + ')}`, 0, 'cut: ' + BUDGET_WHY); }
    else await wallStep(`interactions ${lite.join('+')}`, `interactions ${lite.join(' + ')}`, () => runJobs(interactJobs(lite), cfg.interactConcurrency, `interactions ${lite.join('+')}`), () => lite.map(e => interactWhy(e, PLAN.sampled.length, [REF.desktop, REF.mobile])).join(' ‖ '));
  }
  await step('ipad', ['FORM-11'], () => ipadForms(), 'WebKit iPad context, ≤3 pages with forms');
  if (!NO_EDGE) await step('static msedge', ['XB-04'], async () => { await browser('msedge'); await staticPass('msedge'); }, () => staticWhy('msedge'));
  progress('evaluate', 0, 1, true); const tEval = Date.now();
  const evals = [['cross-engine', ['XB-01', 'XB-04', 'FORM-07'], evalCrossEngine], ['js', ['JS-01'], evalJs], ['links', STATIC_IDS.filter(x => /^LINK/.test(x)), evalLinks], ['a11y', ['A11Y-01', 'A11Y-04', 'A11Y-05', 'A11Y-06', 'A11Y-08'], evalA11y], ['layout', STATIC_IDS.filter(x => /^(LAY|INT)/.test(x)), evalLayout], ['media', STATIC_IDS.filter(x => /^(IMG|VID|FONT)/.test(x)), evalMedia], ['text', STATIC_IDS.filter(x => /^(TEXT|COPY)/.test(x)), evalText], ['forms', STATIC_IDS.filter(x => /^(FORM|WF)/.test(x)), evalForms], ['seo', STATIC_IDS.filter(x => /^(SEO|MAP|TRACK|DONOR|TPL|CMS|WF|I18N)/.test(x)), evalSeoAndSite], ['i18n', ['I18N-02', 'I18N-05', 'I18N-06'], evalI18n], ['reference', ['REF-01', 'REF-02'], evalReference], ['pages', ['PAGE-01', 'PAGE-02', 'FOOT-01'], () => evalPages(ls)], ['header', ['NAV-10'], () => evalHeader(hs)]];
  for (const [n, list, fn] of evals) { try { fn(); } catch (e) { log(`evaluation ${n} failed: ${errMsg(e)}`); GAP(list, `evaluation ${n}`, `failed: ${errMsg(e)}`); } }
  PRESENCE = presenceSweep(); runRows();
  stepTime('evaluate', 'evaluate + write results', Date.now() - tEval, `${MINE.length} rows`);
  await finish(0);
})().catch(onCrash);
