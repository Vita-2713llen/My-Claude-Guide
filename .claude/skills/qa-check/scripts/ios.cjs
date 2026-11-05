#!/usr/bin/env node
'use strict';
// XB-03 / LAY-09 · Real Mobile Safari in the iOS Simulator (macOS + Xcode), portrait.
//   node ios.cjs --out qa-out [--base URL | --local ./build] [--devices "Name A,Name B"] [--runtime x.y] [--max 25] [--keep-booted]
//
// Devices: the newest installed iOS runtime; the narrowest iPhone + the widest iPhone (portrait width read from the
// device profile, no boot needed) + the narrowest iPad that is at least 768pt wide. Pin them so every machine measures
// the same devices: qa-target.json "ios": { "iphone": ["…", "…"], "ipad": "…", "runtime": "x.y" } (or "devices": [...]),
// or --devices / --runtime. A pinned device that is not installed is NOT RUN with the available names.
// Only devices this run booted are shut down again (--keep-booted keeps them running).
// Pages: the shared page plan (pages.json from qa-run; else the lib's template sample), never the 404 probe, in a fixed
// order ('/', pages with forms, one page per first path segment, the rest). XB-03 is defined on that fixed sample:
// the first --max pages (default 25); the coverage line (notes[0]) says how many of how many.
// XB-03: horizontal scroll, clipped elements, text closer than decisions.edgeMinPx to the screen edge, form fields
//        with font-size < 16px below 768 (iOS zooms on focus).
// LAY-09: section paddings and insets, element spacing matched by DOM path (±4px) and screen-edge distance, compared
//         with Playwright WebKit at the same viewport, UA and DPR. Without WebKit only LAY-09 is NOT RUN.
// FORM-11: extra evidence only — a date field shorter than the text fields on iOS while WebKit renders it equal.
// Never a silent pass and never a tool problem reported as a site bug: a device, page or reference that could not be
// measured is a NOT RUN reason with its route (partial when other pages were measured). Results are saved after every
// page, so a crash or kill keeps what was measured. Exit 0 when something was measured, 3 when nothing was.
// JS runs through the simulator's Web Inspector socket (appium-remote-debugger) — no proxy, never a password.
// Test seam: QA_IOS_RD_MODULE points at a stub module exporting createRemoteDebugger() (local tests only).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const L = require('./lib.cjs');
const M = require('./measure-page.cjs');

const a = L.args(process.argv.slice(2));
const cfg = L.loadConfig(a, { allowLocal: true }); // --local <build folder>: stage 1, served on 127.0.0.1 by the lib
const OUT = L.outDirFrom(a);
let R; try { R = L.makeResults('ios', cfg, a); } catch (e) { R = L.makeResults('ios'); }
R._base = cfg.base;
const IOS = cfg.ios && typeof cfg.ios === 'object' ? cfg.ios : {};
const KEEP_BOOTED = !!(a['keep-booted'] || IOS.keepBooted);
const MAX = Math.max(1, Math.floor(+(a.max || IOS.max || 25)) || 25);
const TOL = 4;             // LAY-09 tolerance in px
const SPACING_CAP = 3000;  // elements compared per page, in document order
const EXIT_NOT_RUN = L.EXIT_NOT_RUN || 3;
const CHALLENGE = L.CHALLENGE || /One moment, please|Just a moment|Checking your browser|Attention Required/i;
const SETUP = 'person runs once: sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch, then: xcodebuild -downloadPlatform iOS';
const ROUTE = 'route: a Mac with Xcode (team, rented or real-device cloud) — the real-iPhone rows IOS-01…07 stay with a person';
const GATE_ROUTE = 'the simulator cannot reuse a saved Playwright session: a person signs in once in the simulator\'s Safari (the agent never types a password) or the gate is lifted for the QA window, then rerun ios.cjs';
// Same private-flag-free call as the other engines: only explicitly configured region selectors are passed on.
const SEL = cfg.selectors || {};
const RSEL = {}; for (const k of ['header', 'main', 'footer']) if (cfg._explicitSelectors && cfg._explicitSelectors.has && cfg._explicitSelectors.has(k) && SEL[k]) RSEL[k] = SEL[k];
const dec = Object.assign({}, cfg.decisions, { _burgerSel: SEL.burger, _logoSel: SEL.logo || undefined, _sectionSel: SEL.section || '', _sel: RSEL });

const wait = ms => new Promise(r => setTimeout(r, ms));
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // locale-independent: the same order on every machine
const msg = e => String((e && e.message) || e).replace(/\s+/g, ' ').trim();
const one = s => String(s).replace(/;\s*/g, ', '); // a single NOT RUN reason never contains "; " (the manifest splits on it)
const slug = s => String(s).replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
const num = v => { const f = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(f) ? f : null; };
const vcmp = (x, y) => { const p = String(x).split('.').map(Number), q = String(y).split('.').map(Number); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] || 0) - (q[i] || 0); if (d) return d; } return 0; };
function norm(u) { try { const x = new URL(u); return x.host.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search; } catch (e) { return String(u || ''); } }
const sameUrl = (x, y) => (norm(x) === norm(y) ? 1 : 0);
const pageNo = id => Number(String(id).split('.')[1]) || 0;
// Path of a URL on the audited site (scheme and www ignored), or null for another host.
function sitePath(u) { try { const x = new URL(u), b = new URL(cfg.base + '/'); if (x.host.toLowerCase().replace(/^www\./, '') !== b.host.toLowerCase().replace(/^www\./, '')) return null; const bp = b.pathname.replace(/\/$/, ''); const p = x.pathname.startsWith(bp) ? x.pathname.slice(bp.length) || '/' : x.pathname; return p + x.search; } catch (e) { return null; } }
let PAGESET = new Set(); // normalised URLs of every planned page (opened or cut), for redirect de-duplication
function withTimeout(p, ms, label) {
  let t;
  return Promise.race([Promise.resolve(p), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`)), ms); })]).finally(() => clearTimeout(t));
}
// Shell-free process call; the error carries the tool's own stderr (licence, missing runtime, …).
function run(cmd, args, timeout = 60000) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 64 * 1024 * 1024 }).trim(); }
  catch (e) {
    const why = (e.stderr && String(e.stderr).trim()) || (e.signal ? `timed out after ${Math.round(timeout / 1000)} s` : e.message);
    throw new Error(`${cmd} ${args.slice(0, 2).join(' ')} failed: ${String(why).replace(/\s+/g, ' ').slice(0, 240)}`);
  }
}
const simctl = (args, timeout) => run('xcrun', ['simctl', ...args], timeout);
const tryRun = (cmd, args) => { try { return run(cmd, args, 15000); } catch (e) { return null; } };

// ---------------------------------------------------------------- state → results (rebuilt before every save)
const S = {
  inProgress: true, stopped: null, fatal: null,
  runtime: null, pickHow: null, devices: [], skips: [],
  plan: null, pages: [], cut: [],
  planned: 0, measured: 0, missed: [], redirects: [], pageNotes: [],
  xb03: [], lay09: [], lay09Ask: [], form11: [],
  refMeasured: 0, refMissed: [], refOff: null, refEngine: null, refNotes: [], truncated: 0,
  notes: [], shotFails: 0, stray: 0,
};
function setTested(id, n) { const c = R.checks[id] || (R.checks[id] = { items: [], notes: [] }); c.ran = true; c.tested = n; }
// One NOT RUN reason per device and cause, with the route that closes it.
const KIND = { tool: 'NOT MEASURED (tool problem, not a site finding)', gate: 'NOT OPENED (password / sign-in gate)', offsite: 'NOT MEASURED (redirects to another host)', challenge: 'NOT MEASURED (host challenge)', ref: 'NOT COMPARED (WebKit reference failed)' };
function groupMissed(list, forceKind) {
  const by = new Map();
  for (const m of list) {
    const kind = forceKind || m.kind || 'tool';
    const route = kind === 'tool' || kind === 'ref' ? 'rerun ios.cjs (all devices: a run replaces results-ios.json)' : m.route || '';
    const k = [m.device, kind, route].join('\u0000');
    if (!by.has(k)) by.set(k, { device: m.device, kind, route, l: [] });
    by.get(k).l.push(kind === 'gate' ? m.p : `${m.p} (${m.why})`);
  }
  return [...by.values()].map(g => one(`${KIND[g.kind] || g.kind} on ${g.device}, ${g.l.length} page(s): ${g.l.join(' · ').slice(0, 500)}${g.route ? ' — ' + g.route : ''}`));
}
function materialize() {
  for (const id of ['XB-03', 'LAY-09', 'FORM-11']) delete R.checks[id];
  const devs = S.devices.map(d => `${d.name} ${d.iw || d.wPt || '?'}pt${d.failed ? ' (not run)' : ''}`).join(' + ') || 'no device';
  const notOpened = S.cut.length ? ` (${S.cut.length} more sampled page(s) not opened — --max ${S.pages.length + S.cut.length} covers all)` : '';
  const pagesTxt = S.plan ? `${S.pages.length} of ${S.plan.sampled} sampled page(s)${notOpened}, ${S.plan.all} found` : `${S.pages.length} page(s)`;
  const cov = `${S.runtime ? 'iOS ' + S.runtime.version + ' · ' : ''}${devs} · ${S.measured}/${S.planned} page×device measured · ${pagesTxt}`;
  R._timing = { why: `${S.measured}/${S.planned} page × device loads in the iOS Simulator (${devs}; ${pagesTxt}), one at a time` };
  const unfinished = S.stopped || (S.inProgress ? 'ios.cjs did not finish (crashed or was killed) — rerun it in the background or with a long timeout' : null);
  const partial = [unfinished, ...S.skips.map(s => `NOT RUN on ${s.name}: ${s.why}`), ...groupMissed(S.missed)].filter(Boolean).map(one);

  // XB-03 — the coverage line is always notes[0]: the manifest shows the notes as the evidence
  R.note('XB-03', cov);
  if (S.pickHow) R.note('XB-03', 'devices: ' + S.pickHow);
  S.notes.forEach(n => R.note('XB-03', n));
  if (S.shotFails) R.note('XB-03', `${S.shotFails} simulator screenshot(s) failed`);
  if (S.redirects.length) R.note('XB-03', 'redirects (the target is measured as its own page): ' + [...new Set(S.redirects)].join(' · '));
  [...new Set(S.pageNotes)].forEach(n => R.note('XB-03', n));
  if (!S.measured) {
    const why = [S.fatal, ...partial].filter(Boolean).map(one);
    (why.length ? why : ['nothing was measured']).forEach(w => R.notRun('XB-03', S.fatal && w === one(S.fatal) && !/route:/.test(w) ? `${w} — ${ROUTE}` : w));
  } else {
    S.xb03.forEach(i => R.add('XB-03', i));
    partial.forEach(w => R.notRun('XB-03', w));
    setTested('XB-03', S.measured);
  }

  // LAY-09
  R.note('LAY-09', `vs ${S.refEngine || 'Playwright WebKit'} at the same viewport, UA and DPR: ${S.refMeasured}/${S.measured} page×device compared (±${TOL}px)${S.truncated ? `, ${S.truncated} page(s) compared on their first ${SPACING_CAP} elements` : ''}`);
  S.refNotes.forEach(n => R.note('LAY-09', n));
  if (!S.refMeasured) {
    if (S.refOff) R.notRun('LAY-09', one(S.refOff));
    else if (S.measured) groupMissed(S.refMissed, 'ref').forEach(w => R.notRun('LAY-09', w));
    else (R.checks['XB-03'] && R.checks['XB-03'].notRun ? R.checks['XB-03'].notRun.split('; ') : ['nothing was measured']).forEach(w => R.notRun('LAY-09', w));
    if (!R.checks['LAY-09'].notRun) R.notRun('LAY-09', 'the WebKit reference was never measured');
  } else {
    S.lay09.forEach(i => R.add('LAY-09', i));
    S.lay09Ask.forEach(i => R.ask('LAY-09', i));
    partial.forEach(w => R.notRun('LAY-09', w));
    groupMissed(S.refMissed, 'ref').forEach(w => R.notRun('LAY-09', w));
    setTested('LAY-09', S.refMeasured);
  }

  // FORM-11 is closed by qa-run; this instrument only adds iOS evidence of a real defect (never marks it as run)
  S.form11.forEach(i => R.add('FORM-11', i));
}
function save() { try { materialize(); L.saveResults(R, OUT); } catch (e) { console.error('ios: could not save results: ' + msg(e)); } }

// ---------------------------------------------------------------- lifecycle: always leave a results file behind
const bootedByUs = [];
function shutdownDevice(udid) {
  const i = bootedByUs.indexOf(udid); if (i < 0 || KEEP_BOOTED) return;
  bootedByUs.splice(i, 1);
  try { simctl(['shutdown', udid], 60000); } catch (e) { /* already shut down */ }
}
let ending = false;
function finish(code) {
  if (ending) return; ending = true;
  S.inProgress = false; save();
  [...bootedByUs].forEach(shutdownDevice);
  process.exit(code);
}
function fail(why) { S.fatal = one(why); console.log('ios: NOT RUN — ' + why); finish(EXIT_NOT_RUN); }
process.on('uncaughtException', e => { S.stopped = 'ios.cjs stopped: ' + msg(e).slice(0, 200); console.error(S.stopped); finish(EXIT_NOT_RUN); });
// The inspector library can leave a stray rejection behind; the measuring flow has its own catches.
process.on('unhandledRejection', e => { S.stray++; if (S.stray <= 3) console.error('ios: ignored stray rejection: ' + msg(e).slice(0, 160)); });
process.on('SIGINT', () => { S.stopped = 'interrupted (SIGINT)'; finish(130); });
process.on('SIGTERM', () => { S.stopped = 'killed (SIGTERM)'; finish(143); });

function setEnv(extra) { R._env = Object.assign({}, R._env || {}); R._env.ios = Object.assign({}, R._env.ios || {}, extra); }
function tryPlaywright() {
  if (typeof L.tryPlaywright === 'function') { try { return L.tryPlaywright(); } catch (e) { return null; } }
  if (typeof L.nodeProblem === 'function' && L.nodeProblem('playwright')) return null;
  for (const t of [process.env.PW_PATH, path.join(__dirname, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { if (!t) continue; try { return require(t); } catch (e) { /* next */ } }
  return null;
}

// ---------------------------------------------------------------- page plan (the same rule in ios.cjs and safari-real.cjs)
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
  try {
    const st = JSON.parse(fs.readFileSync(path.join(OUT, 'static-chromium.json'), 'utf8'));
    for (const [k, v] of Object.entries(st)) if (v && !v.fail && Array.isArray(v.forms) && v.forms.length) withForms.add(k.slice(0, k.lastIndexOf('@')));
  } catch (e) { /* no qa-run data yet: the form tier stays empty */ }
  const sorted = sampled.slice().sort(cmp), ordered = [], has = new Set(), seg = new Set();
  const push = p => { if (!has.has(p)) { has.add(p); ordered.push(p); } };
  sorted.filter(p => p === '/').forEach(push);
  sorted.filter(p => withForms.has(p)).forEach(push);
  sorted.forEach(p => { const k = p.split(/[/?#]/).filter(Boolean)[0] || '/'; if (!seg.has(k)) { seg.add(k); push(p); } });
  sorted.forEach(push);
  return { pages: ordered.slice(0, max), cut: ordered.slice(max), sampled: sampled.length, all: all.length, src };
}

// ---------------------------------------------------------------- simulator inventory and device choice
async function loadRD() {
  const p = process.env.QA_IOS_RD_MODULE || path.join(__dirname, 'node_modules', 'appium-remote-debugger', 'build', 'lib', 'index.js');
  if (!fs.existsSync(p)) fail(`appium-remote-debugger missing — run: cd "${__dirname}" && npm ci`);
  let mod = null, err = null;
  // The package is ESM-only: require() works on Node ^20.19 / >=22.12, import() is the fallback.
  try { mod = require(p); } catch (e1) { err = e1; try { mod = await import(pathToFileURL(p).href); } catch (e2) { err = e2; mod = null; } }
  if (!mod) fail(`appium-remote-debugger cannot load on Node ${process.version} (${(err && err.code) || 'error'}: ${msg(err).slice(0, 120)}) — it needs Node ^20.19 or >=22.12 (install the current LTS), then: cd "${__dirname}" && npm ci`);
  const create = mod.createRemoteDebugger || (mod.default && mod.default.createRemoteDebugger);
  if (typeof create !== 'function') fail(`appium-remote-debugger has no createRemoteDebugger — run: cd "${__dirname}" && npm ci`);
  let version = null; try { version = JSON.parse(fs.readFileSync(path.join(path.dirname(p), '..', '..', 'package.json'), 'utf8')).version; } catch (e) { /* stub */ }
  return { create, version };
}
function inventory() {
  let devDir;
  try { devDir = run('xcode-select', ['-p'], 15000); }
  catch (e) { fail(`Xcode not found (${msg(e).slice(0, 120)}) — person installs Xcode from the App Store, then runs: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer, then ${SETUP.replace(/^person runs once: /, '')}`); }
  if (/CommandLineTools/.test(devDir) || !fs.existsSync(path.join(devDir, 'Platforms', 'iPhoneSimulator.platform'))) {
    fail(`xcode-select points to ${devDir}, which has no iOS Simulator — person runs: sudo xcode-select -s /Applications/<Xcode>.app/Contents/Developer`);
  }
  let runtimes, byRuntime;
  try {
    runtimes = JSON.parse(simctl(['list', 'runtimes', 'available', '-j'], 60000)).runtimes || [];
    byRuntime = JSON.parse(simctl(['list', 'devices', 'available', '-j'], 60000)).devices || {};
  } catch (e) { fail(`${msg(e).slice(0, 220)}${/licen[cs]e/i.test(msg(e)) ? ' (Xcode licence not accepted)' : ''} — ${SETUP}`); }
  const ios = runtimes.filter(r => r && r.isAvailable !== false && (r.platform === 'iOS' || /SimRuntime\.iOS-/.test(r.identifier || ''))).sort((x, y) => vcmp(y.version, x.version));
  if (!ios.length) fail('no iOS simulator runtime installed — person runs: xcodebuild -downloadPlatform iOS');
  const want = a.runtime && a.runtime !== true ? String(a.runtime) : IOS.runtime ? String(IOS.runtime) : null;
  const rt = want ? ios.find(r => String(r.version) === want || String(r.version).startsWith(want + '.')) : ios[0];
  if (!rt) fail(`iOS ${want} runtime not installed (installed: ${ios.map(r => r.version).join(', ')}) — person runs: xcodebuild -downloadPlatform iOS -buildVersion ${want}, or "ios.runtime" in qa-target.json is changed`);
  const types = {};
  for (const t of rt.supportedDeviceTypes || []) types[t.identifier] = t;
  if (!Object.keys(types).length) { try { for (const t of JSON.parse(simctl(['list', 'devicetypes', '-j'], 60000)).devicetypes || []) types[t.identifier] = t; } catch (e) { /* names only */ } }
  const wCache = {};
  const widthOf = d => { // portrait width in points, from the device type profile (no boot needed)
    const t = types[d.deviceTypeIdentifier]; if (!t || !t.bundlePath) return null;
    if (!(t.bundlePath in wCache)) {
      let w = null;
      try {
        const j = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', path.join(t.bundlePath, 'Contents', 'Resources', 'profile.plist')], 15000));
        if (j.mainScreenWidth && j.mainScreenScale) w = Math.round(Math.min(j.mainScreenWidth, j.mainScreenHeight || Infinity) / j.mainScreenScale);
      } catch (e) { /* unreadable profile */ }
      wCache[t.bundlePath] = w;
    }
    return wCache[t.bundlePath];
  };
  const family = d => (types[d.deviceTypeIdentifier] || {}).productFamily || (/^iPhone/i.test(d.name) ? 'iPhone' : /^iPad/i.test(d.name) ? 'iPad' : null);
  const pool = (byRuntime[rt.identifier] || []).filter(d => d && d.isAvailable !== false)
    .map(d => ({ name: d.name, udid: d.udid, state: d.state, family: family(d), wPt: widthOf(d) }))
    .sort((x, y) => cmp(x.name, y.name) || cmp(x.udid, y.udid));
  return { rt, pool };
}
const listArg = v => { if (!v || v === true) return null; const l = (Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim()).filter(Boolean); return l.length ? [...new Set(l)] : null; };
function chooseDevices(rt, pool) {
  const names = [...new Set(pool.map(d => d.name))].join(', ') || 'none';
  const chosen = [];
  const pinOne = n => {
    const m = pool.find(d => d.name === n);
    if (m) { if (!chosen.includes(m)) chosen.push(m); return; }
    S.skips.push({ name: n, why: one(`no simulator named "${n}" for iOS ${rt.version} (available: ${names}) — fix "ios" in qa-target.json or --devices, or a person adds it in Xcode → Window → Devices and Simulators`) });
  };
  const all = listArg(a.devices) || listArg(IOS.devices) || listArg(cfg.iosDevices);
  if (all) {
    all.forEach(pinOne);
    S.pickHow = `pinned (${all.join(', ')})`;
    if (!chosen.length) fail(`none of the requested simulators exists for iOS ${rt.version}: ${all.join(', ')} — available: ${names}`);
    // XB-03 needs an iPhone and an iPad: a pin without one of them leaves that part NOT RUN
    for (const fam of ['iPhone', 'iPad']) if (!chosen.some(d => d.family === fam)) S.skips.push({ name: fam, why: `no ${fam} among the pinned devices (${all.join(', ')}) — add one to "ios" in qa-target.json or to --devices` });
    return chosen;
  }
  const phones = pool.filter(d => d.family === 'iPhone'), pads = pool.filter(d => d.family === 'iPad');
  const sized = l => l.filter(d => d.wPt);
  const how = [];
  // iPhones: pinned names, else the narrowest and the widest by profile width
  const pinPhones = listArg(IOS.iphone);
  if (pinPhones) { pinPhones.forEach(pinOne); how.push(`iPhone pinned (${pinPhones.join(', ')})`); }
  else {
    let narrow = null, wide = null;
    if (sized(phones).length) {
      narrow = sized(phones).sort((x, y) => x.wPt - y.wPt || cmp(x.name, y.name))[0];
      wide = sized(phones).sort((x, y) => y.wPt - x.wPt || cmp(x.name, y.name))[0];
      how.push('narrowest + widest iPhone by portrait width from the device profile');
    } else if (phones.length) {
      narrow = phones.find(d => /\bSE\b|mini|e$/.test(d.name)) || phones[0];
      wide = phones.find(d => /Pro Max|Plus/.test(d.name)) || phones.find(d => /Air/.test(d.name)) || phones[phones.length - 1];
      how.push('iPhone by device name (screen sizes unreadable — pin "ios.iphone" in qa-target.json for a stable choice)');
    }
    if (narrow) chosen.push(narrow);
    else S.skips.push({ name: 'iPhone', why: `no iPhone simulator for iOS ${rt.version} — a person adds one (Xcode → Window → Devices and Simulators → +), then reruns ios.cjs` });
    if (wide && narrow && wide.udid !== narrow.udid) chosen.push(wide);
    else if (narrow) S.notes.push(`only one iPhone screen width installed — the narrowest is also the widest (${narrow.name})`);
  }
  // iPad: pinned name(s), else the narrowest iPad at least 768pt wide
  const pinPads = listArg(IOS.ipad);
  if (pinPads) { pinPads.forEach(pinOne); how.push(`iPad pinned (${pinPads.join(', ')})`); }
  else {
    const sp = sized(pads).sort((x, y) => x.wPt - y.wPt || cmp(x.name, y.name));
    const pad = sp.find(d => d.wPt >= 768) || sp[0] || pads[0];
    if (pad) { chosen.push(pad); how.push('the narrowest iPad ≥768pt'); }
    else S.skips.push({ name: 'iPad', why: `no iPad simulator for iOS ${rt.version} — a person adds one (Xcode → Window → Devices and Simulators → +, any iPad), then reruns ios.cjs` });
  }
  S.pickHow = `${how.join(' + ')} (iOS ${rt.version})`;
  if (!chosen.length) fail(`no usable iPhone or iPad simulator for iOS ${rt.version} (available: ${names}) — a person adds them in Xcode → Window → Devices and Simulators`);
  return chosen;
}

// ---------------------------------------------------------------- page-side helpers (self-contained, stringified for the simulator)
// Element spacing keyed by a stable DOM path under main (nth-of-type), document order, capped.
function SPACING(cap) {
  const root = document.querySelector('main') || document.body;
  const items = {}; let n = 0, truncated = false;
  const px = v => { const f = parseFloat(v); return Number.isFinite(f) ? Math.round(f * 10) / 10 : null; };
  const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
  const walk = (el, key) => {
    const count = {};
    for (const ch of el.children) {
      const tag = ch.tagName.toLowerCase();
      count[tag] = (count[tag] || 0) + 1;
      if (/^(script|style|link|template|noscript|br|svg|iframe|canvas)$/.test(tag)) continue;
      const k = key + '>' + tag + ':' + count[tag];
      const cs = getComputedStyle(ch);
      if (cs.display === 'contents') { walk(ch, k); if (truncated) return; continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden' || !ch.getClientRects().length) continue;
      if (n >= cap) { truncated = true; return; }
      n++;
      const r = { s: name(ch), pt: px(cs.paddingTop), pr: px(cs.paddingRight), pb: px(cs.paddingBottom), pl: px(cs.paddingLeft), mt: px(cs.marginTop), mb: px(cs.marginBottom) };
      if (/flex|grid/.test(cs.display)) { r.rg = cs.rowGap === 'normal' ? 0 : px(cs.rowGap); r.cg = cs.columnGap === 'normal' ? 0 : px(cs.columnGap); }
      if ([...ch.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())) { r.fs = px(cs.fontSize); r.lh = cs.lineHeight === 'normal' ? null : px(cs.lineHeight); }
      if (/^(img|button|input|select|textarea|video)$/.test(tag)) r.h = Math.round(ch.getBoundingClientRect().height);
      items[k] = r;
      walk(ch, k);
      if (truncated) return;
    }
  };
  walk(root, root.tagName.toLowerCase());
  return { items, count: n, truncated };
}
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
// When the current document started (ms since epoch; the simulator shares the host clock).
const T_ORIGIN = '(performance.timeOrigin || (performance.timing && performance.timing.navigationStart) || 0)';
const SCROLL_START = '(function(){window.__qaScrollDone=false;(async function(){var H=document.documentElement.scrollHeight;for(var y=0;y<H;y+=450){scrollTo(0,y);await new Promise(function(r){setTimeout(r,70)})}scrollTo(0,0);window.__qaScrollDone=true})();return "1"})()';
// 100vh in px = the large viewport on iOS; the WebKit reference uses it as its height so vh-based spacing matches.
const ENV_EXPR = '{iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,ua:navigator.userAgent,vh:(function(){var d=document.createElement("div");d.style.cssText="position:absolute;top:0;left:0;width:1px;height:100vh;visibility:hidden;pointer-events:none";document.documentElement.appendChild(d);var h=Math.round(d.getBoundingClientRect().height);d.remove();return h})()}';
// The lib's consent hider (never clicks Accept), applied after load; a no-op DOM mutation wakes its observer.
const CONSENT_CSS = [SEL.consent, SEL.ignoreOverlays].filter(Boolean).join(', ');
const CONSENT = typeof L.consentHider !== 'function' ? null
  : `(function(){(${L.consentHider.toString()})(${JSON.stringify({ css: CONSENT_CSS ? CONSENT_CSS + '{display:none!important}' : '', generic: true })});try{document.body.appendChild(document.createComment('qa')).remove()}catch(e){}return "1"})()`;

// ---------------------------------------------------------------- one Safari tab per device, verified before every measure
function safariTab(createRD, dev, sock) {
  const opts = { bundleId: 'com.apple.mobilesafari', isSafari: true, socketPath: sock, pageLoadMs: 20000, garbageCollectOnExecute: false, platformVersion: S.runtime.version };
  let rd = null;
  const close = async () => { const r = rd; rd = null; if (r) await withTimeout(r.disconnect(), 10000, 'inspector disconnect').catch(() => { }); };
  const exec = (js, ms = 30000) => withTimeout(rd.execute(js), ms, 'inspector execute');
  const json = async (expr, ms) => { const v = await exec(`JSON.stringify(${expr})`, ms); return typeof v === 'string' ? JSON.parse(v) : v; };

  // Attach to the tab that `simctl openurl` just opened: the one whose document started after t0.
  // Older tabs (Safari restores them from earlier runs) are never measured.
  async function attach(url, t0) {
    const r = createRD(opts, false);
    try {
      await withTimeout(r.connect(30000), 45000, 'Web Inspector connect');
      const until = Date.now() + 25000; let listed = 0, last = '';
      while (Date.now() < until) {
        // by URL first: the inspector fills a process's tab list only for the app it selected (tabs can live in several
        // web-content processes); any non-blank tab second (a redirect changes the URL)
        let pgs = [];
        try { pgs = (await withTimeout(r.selectApp(url, 6, true), 20000, 'select Safari')) || []; } catch (e) { last = msg(e); }
        if (!pgs.length) { try { pgs = (await withTimeout(r.selectApp(null, 6, true), 20000, 'select Safari')) || []; } catch (e) { last = msg(e); } }
        listed = pgs.length;
        const cands = pgs.filter(x => x && x.id != null && x.url !== 'about:blank')
          .sort((x, y) => (sameUrl(y.url, url) - sameUrl(x.url, url)) || (pageNo(y.id) - pageNo(x.id))).slice(0, 6);
        for (const c of cands) {
          const [app, no] = String(c.id).split('.');
          try {
            await withTimeout(r.selectPage('PID:' + app, Number(no), true), 20000, 'select page');
            const v = await withTimeout(r.execute(`JSON.stringify({o:${T_ORIGIN}})`), 10000, 'tab probe');
            if (JSON.parse(v).o >= t0 - 2000) { rd = r; return; }
          } catch (e) { last = msg(e); }
        }
        await wait(1500);
      }
      throw new Error(`no freshly opened Safari tab in the Web Inspector (${listed} tab(s) listed${last ? ', last error: ' + last.slice(0, 80) : ''})`);
    } catch (e) { await withTimeout(r.disconnect(), 10000, 'inspector disconnect').catch(() => { }); throw e; }
  }
  // Wait until the tab shows THIS navigation, loaded, past any host challenge, at the requested URL.
  async function settle(url, t0) {
    const until = Date.now() + 45000; let v = null, challenge = 0, errs = 0;
    while (Date.now() < until) {
      try { v = await json(`{h:location.href,t:document.title,o:${T_ORIGIN},r:document.readyState}`, 10000); errs = 0; }
      catch (e) { if (++errs >= 5) throw new Error('Web Inspector lost the tab: ' + msg(e).slice(0, 120)); await wait(1000); continue; }
      if (!(v.o >= t0 - 2000) || v.r !== 'complete') { await wait(500); continue; }
      if (CHALLENGE.test(v.t || '')) { if (++challenge > 12) throw Object.assign(new Error('host challenge page did not clear'), { kind: 'challenge', route: 'set concurrency 1 and throttleMs ≥ 1500 in qa-target.json or ask the host to allowlist this machine' }); await wait(2500); continue; }
      return v;
    }
    throw new Error(!v ? 'the tab never answered' : !(v.o >= t0 - 2000) ? 'the tab still shows the previous page after 45 s' : `page did not finish loading in 45 s (readyState ${v.r})`);
  }
  async function open(url) {
    const t0 = Date.now();
    if (rd) { try { await withTimeout(rd.navToUrl(url), 60000, 'navigate'); } catch (e) { await close(); } }
    if (!rd) { simctl(['openurl', dev.udid, url], 60000); await wait(3000); await attach(url, t0); }
    return settle(url, t0);
  }
  async function measure(p) {
    const url = cfg.base + p; let ok = null, err = null;
    for (let i = 0; i < 2 && !ok; i++) {
      try { ok = await open(url); } catch (e) { err = e; if (e.final || e.kind) break; await close(); }
    }
    if (!ok) throw err || new Error('page not opened');
    // a redirect: the target is measured as its own page when it is in the page list, otherwise here (labelled p → target)
    let label = p;
    if (!sameUrl(ok.h, url)) {
      const fin = sitePath(ok.h);
      if (fin == null) throw Object.assign(new Error(`redirects to ${ok.h} (sign-in / SSO?)`), { final: true, kind: 'offsite', route: 'set "base" to the final site, or a person provides access' });
      if (PAGESET.has(norm(cfg.base + fin))) throw Object.assign(new Error(`${p} → ${fin}`), { final: true, dup: true });
      label = `${p} → ${fin}`;
    }
    const gate = await json(`(${GATE.toString()})()`, 10000);
    if (gate && !/this page is password-protected/.test(gate)) throw Object.assign(new Error(gate), { gate: true, kind: 'gate', route: GATE_ROUTE });
    if (gate) S.pageNotes.push(`${p} is password-protected: the password form itself was measured (the protected content is FEAT-07, a person)`);
    if (CONSENT) { await exec(CONSENT).catch(() => { }); await wait(300); }
    // scroll through once so reveal-on-scroll content reaches its end state (the WebKit reference does the same)
    await exec(SCROLL_START);
    for (let i = 0; i < 60; i++) { await wait(500); if (String(await exec('String(window.__qaScrollDone === true)')) === 'true') break; }
    await wait(1500);
    const st = await json(`(${M.STATIC.toString()})(${JSON.stringify(dec)})`, 90000);
    if (!st || !Array.isArray(st.clipped)) throw new Error('the page measure returned nothing');
    const env = await json(ENV_EXPR, 15000);
    const sp = await json(`(${SPACING.toString()})(${SPACING_CAP})`, 90000);
    return { st, env, sp, label };
  }
  return { measure, close };
}

// ---------------------------------------------------------------- evaluation
function smallFields(st) {
  if (Array.isArray(st.smallFields)) return st.smallFields.map(x => (typeof x === 'string' ? x : `${x.sel || x.label || x.name || x.tag || 'field'} ${x.fs || ''}`.trim()));
  const out = [];
  (st.forms || []).forEach(f => (f.fields || []).forEach(x => { if (parseFloat(x.fs) < 16) out.push(`${x.label || x.name || x.tag} ${x.fs}`); }));
  return out;
}
function evaluate(dev, p, m) {
  const { st, env } = m; const where = `${m.label || p} @${env.iw} ${dev.name}`;
  if (st.overflowX > 0) S.xb03.push({ where, why: `horizontal scroll ${st.overflowX}px` });
  (st.clipped || []).forEach(x => S.xb03.push({ where, why: `clipped ${x.sel} "${x.text}" L${x.left} R${x.right}` }));
  if (st.clippedTotal > (st.clipped || []).length) S.xb03.push({ where, why: `${st.clippedTotal - st.clipped.length} more clipped element(s) beyond the first ${st.clipped.length}` });
  (st.edges || []).forEach(x => S.xb03.push({ where, why: `text ${Math.min(x.L, x.R)}px from the ${x.L < x.R ? 'left' : 'right'} screen edge (min ${cfg.decisions.edgeMinPx}px): ${x.sel}` }));
  if (st.edgesTotal > (st.edges || []).length) S.xb03.push({ where, why: `${st.edgesTotal - st.edges.length} more text block(s) closer than ${cfg.decisions.edgeMinPx}px to the screen edge` });
  if (env.iw < 768) {
    const small = [...new Set(smallFields(st))];
    if (small.length) S.xb03.push({ where, why: `${small.length} form field(s) with font-size < 16px — iOS zooms the page on focus`, fields: small.slice(0, 8).join(' · ') });
  }
}
function diffs(x, y, props) {
  const out = [];
  for (const k of props || Object.keys(x)) {
    if (k === 's') continue;
    const u = num(x[k]), v = num(y[k]);
    if (u != null && v != null && Math.abs(u - v) > TOL) out.push(`${k} ${u}/${v}`);
  }
  return out;
}
function dateFields(st) {
  const out = {};
  (st.forms || []).forEach((f, fi) => {
    const fl = f.fields || [];
    const t = fl.filter(x => x.tag === 'INPUT' && /^(text|email|tel|url|search|number|password)$/.test(x.type)).map(x => x.h).filter(Number.isFinite).sort((x, y) => x - y);
    if (!t.length) return;
    const med = t[Math.floor(t.length / 2)];
    fl.forEach((x, i) => { if (x.tag === 'INPUT' && /^(date|datetime-local|month|week|time)$/.test(x.type)) out[fi + '.' + i] = { h: x.h, med, label: x.label || x.name || x.type }; });
  });
  return out;
}
function compare(dev, p, m, ref) {
  const where = `${m.label || p} @${m.env.iw} ${dev.name}`;
  // 1) sections, matched by section key + occurrence — never by bare index, so one missing section does not shift the rest
  const keyed = list => { const seen = {}, out = new Map(); for (const s of list || []) { const b = s.key || s.sel; seen[b] = (seen[b] || 0) + 1; out.set(b + '#' + seen[b], s); } return out; };
  const A = keyed(m.st.sectionPad), B = keyed(ref.st.sectionPad), reported = [];
  for (const [k, s] of A) {
    const o = B.get(k); if (!o) continue;
    const d = diffs(s, o, ['pt', 'pb', 'inTop', 'inBot']);
    if (d.length) { S.lay09.push({ where, section: s.sel, diff: d.join(', '), unit: 'iOS/WebKit px' }); reported.push(s.sel); }
  }
  // 2) element spacing by DOM path
  const ia = (m.sp && m.sp.items) || {}, ib = (ref.sp && ref.sp.items) || {};
  const keys = Object.keys(ia); let matched = 0; const found = [];
  for (const k of keys) {
    const y = ib[k]; if (!y) continue; matched++;
    const d = diffs(ia[k], y, null);
    // the same padding already reported for its section is not reported twice
    if (d.length && d.every(x => /^p[tb] /.test(x)) && reported.some(r => ia[k].s && r.startsWith(ia[k].s))) continue;
    if (d.length) found.push({ where, el: ia[k].s, path: k, diff: d.join(', '), unit: 'iOS/WebKit px' });
  }
  found.slice(0, 15).forEach(i => S.lay09.push(i));
  if (found.length > 15) S.lay09.push({ where, why: `${found.length - 15} more element(s) differ by more than ${TOL}px`, more: found.slice(15, 60).map(i => `${i.el} ${i.diff}`).join(' · ').slice(0, 600) });
  if (keys.length && matched / keys.length < 0.8) S.lay09Ask.push({ where, why: `the DOM differs between iOS and WebKit: ${matched}/${keys.length} elements matched by path — compare shots/ios with a WebKit screenshot` });
  if ((m.sp && m.sp.truncated) || (ref.sp && ref.sp.truncated)) S.truncated++;
  // 3) text that sits closer to the screen edge on iOS only
  const wkEdges = new Set((ref.st.edges || []).map(x => x.sel));
  (m.st.edges || []).filter(e => !wkEdges.has(e.sel)).forEach(e => S.lay09.push({ where, why: `tighter screen edge on iOS: ${e.sel} L${e.L} R${e.R}` }));
  // 4) FORM-11 evidence: a date field collapsed on iOS only
  const di = dateFields(m.st), dw = dateFields(ref.st);
  for (const [k, x] of Object.entries(di)) {
    const y = dw[k];
    if (y && Math.abs(x.h - x.med) > 2 && Math.abs(y.h - y.med) <= 2) S.form11.push({ engine: 'iOS Safari (simulator)', where, field: x.label, ios: `${x.h}px vs text fields ${x.med}px`, webkit: `${y.h}px vs ${y.med}px` });
  }
}

// ---------------------------------------------------------------- LAY-09 reference: Playwright WebKit (optional)
let wkBrowser = null, wkTried = false, wkMobileNoted = false;
async function webkit() {
  if (wkTried) return wkBrowser;
  wkTried = true;
  const pw = tryPlaywright();
  if (!pw) { S.refOff = `Playwright missing — run: cd "${__dirname}" && npm ci && npx playwright-core install webkit (XB-03 was still measured)`; return null; }
  try {
    wkBrowser = typeof L.launchBrowser === 'function' ? await L.launchBrowser(pw, 'webkit', cfg) : await pw.webkit.launch();
    S.refEngine = 'Playwright WebKit ' + wkBrowser.version();
  } catch (e) { S.refOff = `Playwright WebKit failed to launch: ${msg(e).split(' Call log')[0].replace(/\s*=+\s*/g, ' ').slice(0, 420)} (XB-03 was still measured)`; }
  return wkBrowser;
}
async function reference(dev, p, m) {
  if (S.refOff) return;
  const b = await webkit(); if (!b) return;
  const { env } = m; let ctx = null;
  try {
    const extra = { viewport: { width: env.iw, height: env.vh || env.ih }, deviceScaleFactor: env.dpr || 1, isMobile: true, hasTouch: true, userAgent: env.ua };
    const opts = () => (typeof L.contextOptions === 'function' ? L.contextOptions(cfg, extra) : Object.assign({}, extra));
    try { ctx = await b.newContext(opts()); }
    catch (e) { delete extra.isMobile; ctx = await b.newContext(opts()); if (!wkMobileNoted) { wkMobileNoted = true; S.refNotes.push('Playwright WebKit rejected isMobile on this machine — reference without meta-viewport emulation'); } }
    if (typeof L.addConsentHiding === 'function') await L.addConsentHiding(ctx, cfg).catch(() => { });
    const pg = await ctx.newPage();
    await L.gotoStable(pg, cfg.base + p);
    await pg.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 450) { scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } scrollTo(0, 0); });
    await pg.waitForTimeout(1500);
    const st = await pg.evaluate(M.STATIC, dec);
    const sp = await pg.evaluate(SPACING, SPACING_CAP);
    compare(dev, p, m, { st, sp });
    S.refMeasured++;
  } catch (e) { S.refMissed.push({ device: dev.name, p, why: msg(e).split(' Call log')[0].slice(0, 160) }); }
  finally { if (ctx) await ctx.close().catch(() => { }); }
}

function screenshot(dev, p) {
  try {
    const dir = path.join(OUT, 'shots', 'ios'); fs.mkdirSync(dir, { recursive: true });
    simctl(['io', dev.udid, 'screenshot', path.join(dir, `${slug(dev.name)}-${slug(p) || 'home'}.png`)], 30000);
  } catch (e) { S.shotFails++; }
}

async function runDevice(createRD, dev, d) {
  // boot only what is shut down; only what this run booted is shut down again
  if (dev.state !== 'Booted') {
    try { simctl(['boot', dev.udid], 180000); bootedByUs.push(dev.udid); }
    catch (e) { if (!/Booted/i.test(msg(e))) throw e; }
  }
  simctl(['bootstatus', dev.udid, '-b'], 300000);
  try { simctl(['terminate', dev.udid, 'com.apple.mobilesafari'], 30000); } catch (e) { /* Safari was not running */ }
  const sock = simctl(['spawn', dev.udid, 'launchctl', 'getenv', 'RWI_LISTEN_SOCKET'], 30000);
  if (!sock) throw new Error(`no Web Inspector socket in the simulator (RWI_LISTEN_SOCKET empty) — ${SETUP}`);
  const tab = safariTab(createRD, dev, sock);
  let streak = 0;
  try {
    for (let i = 0; i < S.pages.length; i++) {
      if (ending) break;
      const p = S.pages[i];
      if (streak >= 3) { S.pages.slice(i).forEach(q => S.missed.push({ device: dev.name, p: q, why: 'skipped after 3 pages in a row could not be opened', kind: 'tool' })); break; }
      let m = null;
      try { m = await tab.measure(p); streak = 0; }
      catch (e) {
        if (e.dup) { S.redirects.push(msg(e)); save(); continue; }
        if (!e.kind && !e.final) streak++;
        S.missed.push({ device: dev.name, p, why: msg(e).slice(0, 220), kind: e.kind || 'tool', route: e.route || '' });
        // a site-wide gate answers every page the same way: record the rest with the same reason instead of opening them
        if (e.kind === 'gate') { S.pages.slice(i + 1).forEach(q => S.missed.push({ device: dev.name, p: q, why: msg(e), kind: 'gate', route: e.route })); save(); break; }
      }
      if (m) {
        S.measured++; d.measured++; d.iw = d.iw || m.env.iw;
        evaluate(dev, p, m);
        screenshot(dev, p);
        await reference(dev, p, m);
      }
      save(); process.stderr.write('.');
    }
  } finally { await tab.close(); }
}

// ---------------------------------------------------------------- main
async function main() {
  if (cfg.local) { await L.resolveTarget(cfg); R._base = cfg.base; } // the same 127.0.0.1 origin as qa-run --local (port derived from the folder)
  if (typeof L.acquireLock === 'function') L.acquireLock('ios', cfg, OUT); // one heavy instrument per site; never next to Lighthouse
  save(); // provisional: a kill from here on leaves "did not finish", never an older run's file
  if (process.platform !== 'darwin') fail('the iOS Simulator exists only on macOS');
  const { create, version } = await loadRD();
  const { rt, pool } = inventory();
  S.runtime = { version: String(rt.version), build: rt.buildversion || null };
  const chosen = chooseDevices(rt, pool);
  S.devices = chosen.map(dv => ({ name: dv.name, wPt: dv.wPt, iw: null, measured: 0, failed: null }));
  const plan = await planPages(MAX);
  S.plan = { sampled: plan.sampled, all: plan.all, src: plan.src };
  S.pages = plan.pages; S.cut = plan.cut;
  PAGESET = new Set(S.pages.concat(S.cut).map(q => norm(cfg.base + q)));
  if (!S.pages.length) fail('no page to open — run qa-run.cjs first (it writes the page list) or list "pages" in qa-target.json');
  S.planned = S.pages.length * chosen.length;
  setEnv({
    macOS: tryRun('sw_vers', ['-productVersion']), xcode: (tryRun('xcodebuild', ['-version']) || '').split('\n')[0] || null,
    runtime: `${rt.version}${rt.buildversion ? ' (' + rt.buildversion + ')' : ''}`, devices: chosen.map(dv => `${dv.name} ${dv.wPt || '?'}pt`),
    choice: S.pickHow, remoteDebugger: version, pages: `${S.pages.length} of ${plan.sampled} sampled (${plan.all} found, from ${plan.src})`, max: MAX,
  });
  save();
  for (let i = 0; i < chosen.length; i++) {
    if (ending) break;
    const dev = chosen[i], d = S.devices[i];
    try { await runDevice(create, dev, d); }
    catch (e) {
      d.failed = msg(e).slice(0, 200);
      S.skips.push({ name: dev.name, why: `${d.failed} — rerun ios.cjs once the simulator works (all devices: a run replaces results-ios.json)` });
    } finally { shutdownDevice(dev.udid); save(); }
  }
  if (wkBrowser) await wkBrowser.close().catch(() => { });
  if (S.refEngine) setEnv({ reference: S.refEngine });
  S.inProgress = false;
  materialize();
  const xb = R.checks['XB-03'] || {};
  console.log(`\nios done: ${(xb.notes || [])[0] || ''}`);
  if (xb.notRun) console.log('XB-03 NOT RUN' + (S.measured ? ' (partly)' : '') + ': ' + xb.notRun);
  console.log('Not covered here (a person on a real iPhone): IOS-01…IOS-07 — swipe under the open menu, sticky hover, address bar, keyboard and pickers, landscape, first open on mobile data, VoiceOver.');
  finish(S.measured ? 0 : EXIT_NOT_RUN);
}
main().catch(e => { S.stopped = 'ios.cjs stopped: ' + msg(e).slice(0, 200); console.error(S.stopped); finish(EXIT_NOT_RUN); });
