// Shared helpers for every qa-check instrument. No site-, project-, brand- or person-specific values live here.
//
// Contract for every instrument: same site + same qa-target.json + same skill version => same manifest, on
// macOS, Windows and Linux. A check that could not run is recorded with R.notRun(id, reason + route), never as a pass.
//
// Syntax note: this file must stay parseable by old Node versions (no `?.`, no `??`) so that a too-old Node
// prints the upgrade route instead of a SyntaxError. Newer APIs (fetch, AbortSignal.timeout) are only used
// inside functions, at call time.
//
// Exported API (existing signatures kept; extra trailing parameters are optional):
//   config      args, loadConfig(a, opts), configPath, readTarget/readConfigFile, readJson, tryReadJson, requireDecisions,
//               parsePages, normPath, sortPages, byStr, TIER/REF, DATE_FORMATS, classifyDate, DATE_RE_SOURCE
//   site        discoverPages, discoverPagesInfo/discoverInventory, discoverPageList, resolveBase, sameSite, siteHosts,
//               hostKey, pagePath/sitePath, probe404Path, planPages, readPlan, templateKey, detectPlatformFromHtml,
//               serveStatic, resolveTarget (stage-1 local folder)
//   network     UA, httpFetch, hostGet, getUrl, authOpts, storageStateCookies, probeNodeNet, NODE_NET_HINT
//   browsers    loadPlaywright, tryPlaywright, nodeProblem, chromeExecutable, launchChromium, launchBrowser, launchEngine,
//               chromiumChoice, engineChoice, closeAllBrowsers, pinned, contextOptions
//   pages       gotoStable, settle, CHALLENGE, CHALLENGE_DOM, CHALLENGE_BODY, isChallenge, isChallengePage,
//               isChallengeBody, BlockedError, detectGate, pageFingerprint, GATE_ROUTE, coveredBy/interceptor,
//               consentHider, addConsentHiding, settleOverlays, inkRows
//   results     makeResults, saveResults, outDirFrom, envInfo/runEnv, skillVersion, stable, sha1, guard
//   run         startRun, currentRun, requireRun, acquireLock/busy, othersBusy, assertIdle, releaseLocks
//   tools       bundledCli, runCli
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SKILL_ROOT = path.resolve(__dirname, '..');
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const EXIT_NOT_RUN = 3; // the instrument wrote its NOT RUN reasons and stopped; the manifest shows ⚠️ with the route

// ------------------------------------------------------------------------------------------------ small utils
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // locale-free order, identical on every OS (never localeCompare)
const sha1 = s => crypto.createHash('sha1').update(String(s)).digest('hex');
function stable(v) { // JSON.stringify with sorted keys (recursive), for hashes that do not depend on key order
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort(byStr).filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const isNil = v => v === null || v === undefined;
const timeoutSignal = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
function errCode(e) { // ECONNREFUSED / ENOTFOUND / TimeoutError / the cause message — never just "fetch failed"
  const c = e && e.cause;
  if (c) { if (c.code) return c.code; if (c.errors && c.errors[0] && c.errors[0].code) return c.errors[0].code; if (c.message) return c.message.slice(0, 80); }
  return (e && (e.code || (e.name !== 'TypeError' && e.name) || e.message)) || 'error';
}
const firstLine = (s, n) => String(isNil(s) ? '' : s).split('\n')[0].slice(0, n || 200);
const wait = ms => new Promise(r => setTimeout(r, ms));
function samePathOnWin(p) { return process.platform === 'win32' ? p.toLowerCase() : p; }
function realOrResolved(p) { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } }
function insideSkill(p) {
  const root = samePathOnWin(realOrResolved(SKILL_ROOT));
  // resolve the deepest existing ancestor so a symlinked skill folder is still recognised
  let probe = path.resolve(p), rest = '';
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) { rest = rest ? path.join(path.basename(probe), rest) : path.basename(probe); probe = path.dirname(probe); }
  const target = samePathOnWin(rest ? path.join(realOrResolved(probe), rest) : realOrResolved(probe));
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ------------------------------------------------------------------------------------------------ JSON files
// Read JSON written by any editor or shell: UTF-8 with or without BOM, or UTF-16 LE/BE (PowerShell 5.1 `>` / Out-File).
// Throws an Error with a readable message; callers that must not crash use tryReadJson.
function readJson(file, what) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { const er = new Error(`${what || 'json'}: cannot read ${file}: ${e.message}`); er.code = 'READ_FAILED'; throw er; }
  let txt;
  if (buf[0] === 0xFF && buf[1] === 0xFE) txt = buf.subarray(2).toString('utf16le');
  else if (buf[0] === 0xFE && buf[1] === 0xFF) { const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))); b.swap16(); txt = b.toString('utf16le'); }
  else txt = buf.toString('utf8');
  txt = txt.replace(/^\uFEFF/, '');
  try { return JSON.parse(txt); } catch (e) {
    const er = new Error(`${what || 'json'}: ${file} is not valid JSON (${e.message}). Save it as plain UTF-8 JSON; check commas and quotes${txt.trim() && !/[}\]]\s*$/.test(txt) ? ' — the file looks truncated' : ''}.`);
    er.code = 'BAD_JSON'; throw er;
  }
}
function tryReadJson(file, what) { try { return { ok: true, data: readJson(file, what) }; } catch (e) { return { ok: false, error: e.message, code: e.code }; } }
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file); // atomic on POSIX, replaces the target on Windows
  return file;
}

// ------------------------------------------------------------------------------------------------ CLI args
// --k v, --k=v, --flag. PowerShell passes `--widths 1920,1440` as `--widths 1920 1440`: list flags are re-joined.
// A stray positional token is kept in o._ and reported on stderr, never silently dropped.
const LIST_FLAGS = new Set(['widths', 'engines', 'pages', 'devices', 'interactWidths', 'interact-widths', 'ids']);
function args(argv) {
  const o = {}; const stray = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { stray.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 2) { o[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const k = a.slice(2); const n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) { o[k] = true; continue; }
    o[k] = n; i++;
    if (LIST_FLAGS.has(k)) while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) o[k] += ',' + argv[++i];
  }
  if (stray.length) { o._ = stray; process.stderr.write(`note: ignored argument(s) ${stray.map(s => JSON.stringify(s)).join(' ')} — every option is --name value (quote comma lists: --widths "1920,1440")\n`); }
  return o;
}

// ------------------------------------------------------------------------------------------------ pages / paths
const NOT_PAGE = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|docx?|xlsx?|pptx?|csv|mp4|webm|mov|m4v|mp3|wav|ogg|xml|gz|txt|json|ics|css|js|mjs|map|woff2?|ttf|otf|eot)$/i;
function normPath(p) {
  let s = String(isNil(p) ? '' : p).trim(); if (!s) return null;
  s = s.replace(/#.*$/, ''); if (!s) return '/';
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/{2,}/g, '/');
}
// '/' first, then byte order; '/x' dropped when '/x/' is also listed (same page with and without the slash)
function sortPages(list) {
  const all = [...new Set([...list].map(normPath).filter(Boolean))];
  const slash = new Set(all.filter(p => p.endsWith('/')));
  const rest = all.filter(p => p !== '/' && (p.endsWith('/') || p.includes('?') || !slash.has(p + '/'))).sort(byStr);
  return all.includes('/') || !all.length ? ['/'].concat(rest) : rest;
}
// Page list from --pages or qa-target.json pages[]. Detects shell path rewriting (Git Bash on Windows) and foreign hosts.
function parsePages(v, cfg, src) {
  const list = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const raw of list) {
    let p = String(raw).trim(); if (!p) continue;
    if (/^[A-Za-z]:[\\/]/.test(p) || p.includes('\\')) {
      console.error(`Page "${p}" (${src || 'pages'}) is a file path: the shell (Git Bash on Windows) rewrote a "/..." argument. Rerun with MSYS_NO_PATHCONV=1 in front of the command, or list the pages in qa-target.json → "pages".`);
      process.exit(1);
    }
    if (/^https?:\/\//i.test(p)) {
      const rel = cfg && cfg.base ? pagePath(p, cfg, { search: true }) : null;
      if (rel === null) { console.error(`Page ${p} (${src || 'pages'}) is not on ${cfg && cfg.base} — list paths like "/about/", or add the host to "sameHosts".`); process.exit(1); }
      p = rel;
    }
    out.push(normPath(p));
  }
  return [...new Set(out.filter(Boolean))];
}

// ------------------------------------------------------------------------------------------------ hosts
const twin = h => String(h || '').toLowerCase().replace(/^www\./, '');
function hostKey(u) { // host without leading www., with a non-default port; scheme ignored
  try { const x = u instanceof URL ? u : new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(u)) ? String(u) : 'http://' + u); return twin(x.hostname) + (x.port ? ':' + x.port : ''); }
  catch (e) { return twin(String(u).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].replace(/:(80|443)$/, '')); }
}
function siteHosts(cfg) {
  const s = new Set();
  if (!cfg) return s;
  for (const b of [cfg.base, cfg.baseTyped, cfg.localOrigin]) if (b) s.add(hostKey(b));
  for (const k of ['sameHosts', 'sameSite']) if (Array.isArray(cfg[k])) cfg[k].forEach(h => { if (h) s.add(hostKey(h)); });
  return s;
}
function basePathOf(cfg) { try { return new URL(String(cfg.base).replace(/\/+$/, '') + '/').pathname.replace(/\/+$/, ''); } catch (e) { return ''; } }
const isUrlArg = x => typeof x === 'string' || x instanceof URL;
// sameSite(url, cfg) or sameSite(cfg, url): http(s) URL on the audited site (www/non-www and http/https are the same site)
function sameSite(x, y) {
  const cfg = isUrlArg(x) ? y : x; const u = isUrlArg(x) ? x : y;
  try { const url = new URL(String(u), cfg.base + '/'); if (!/^https?:$/.test(url.protocol)) return false; return siteHosts(cfg).has(hostKey(url)); } catch (e) { return false; }
}
// pagePath(url, cfg) or pagePath(cfg, url): the page path under cfg.base, or null when the URL is not on the site or
// outside the base folder. opts.search keeps the query string (sitemap URLs); default drops it.
function pagePath(x, y, opts) {
  const cfg = isUrlArg(x) ? y : x; const u = isUrlArg(x) ? x : y;
  opts = opts || {};
  let url; try { url = new URL(String(u), cfg.base + '/'); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol) || !siteHosts(cfg).has(hostKey(url))) return null;
  const bp = basePathOf(cfg); let p = url.pathname;
  if (bp) { if (p === bp) p = '/'; else if (p.startsWith(bp + '/')) p = p.slice(bp.length); else return null; }
  p = p.replace(/\/index\.html?$/i, '/') || '/';
  return normPath(p + (opts.search && url.search ? url.search : ''));
}
const sitePath = pagePath;
// Fixed per site, so two runs on the same site produce identical manifests.
function probe404Path(cfg) { return '/qa-404-probe-' + sha1(hostKey(cfg.base) + basePathOf(cfg)).slice(0, 6) + '/'; }

// ------------------------------------------------------------------------------------------------ config
const TIER = { desktop: 1440, tablet: 768, mobile: 360 }; // single-width checks (SEO, text, forms, contrast, spelling) are measured here
const REF = TIER;
const ENGINES = ['chromium', 'webkit', 'firefox'];
const PLATFORMS = ['wordpress', 'webflow', 'static', 'other'];
const DATE_FORMATS = ['MMM.DD.YYYY', 'MMM.D.YYYY', 'MMM D, YYYY', 'MMM. D, YYYY', 'MMMM D, YYYY', 'D MMM YYYY', 'D MMMM YYYY', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];
const DATE_FORMAT_LEGACY = { 'Month D, YYYY': 'MMMM D, YYYY', 'D Month YYYY': 'D MMMM YYYY', 'MMMM DD, YYYY': 'MMMM D, YYYY', 'MMM DD, YYYY': 'MMM D, YYYY' };
const REQUIRED_DECISIONS = {
  projectType: 'Is this a client site or a marketplace template? → qa-target.json "decisions": { "projectType": "client" | "template" }',
  englishVariant: 'US or UK English? → qa-target.json "decisions": { "englishVariant": "US" | "UK" }',
  staging: 'Is "base" a staging copy (search engines must be blocked) or production? → qa-target.json "staging": true | false',
};
const DEFAULT_DECISIONS = {
  projectType: 'client',            // client | template — set it explicitly (requireDecisions reports a default)
  englishVariant: 'US',             // US | UK — set it explicitly
  dateFormat: null,                 // one of DATE_FORMATS; null = demand ONE format across the site
  buttonCase: null,                 // "title" | "sentence" | null (null = demand consistency)
  hoverMs: [350],                   // allowed hover durations (ms)
  mediaHoverMs: [500, 650],         // allowed range for large-media transforms
  brAllowed: [],                    // CSS selectors where <br> is a recorded designer decision (e.g. "address")
  fractionalAllowedProps: ['lineHeight'],
  maxPageWeightMB: 3,
  minVideoWidth: 1280,
  maxVideoMB: 10,
  edgeMinPx: 8,
  pageWeightTier: 360,
  settleMaxMs: 8000,                // longest wait for a preloader / overlay to leave after load
  singlePage: false,                // true = the site really is one page; otherwise "/" alone is an incomplete inventory
  titleLen: [30, 60],
  descLen: [70, 160],
  ogImageMaxKB: 200,
  assetMaxKB: { raster: 300, svg: 50, favicon: 20, ogImage: 200, font: 150 },
  copyrightYear: null,              // null = the current year
  classNamePattern: '^[a-z][a-z0-9-]*$',
  containerClass: null, decorClasses: [], container: null, spacing: null,
  truncateAllowed: [], orphanAllowed: [], slugAllowed: [],
  contacts: null, socialProfiles: null, logoHover: null, legalPath: null, credit: null,
  donor: null, analyticsIds: null, allowedScripts: [], allowedCustomCode: [],
  fonts: [], systemFonts: [], themeAuthor: null,
  declaredPlaceholders: [], outOfScope: [], reference: null,
};
// Region and component selectors. Defaults are generic heuristics (semantic HTML, ARIA roles, WordPress blocks,
// Webflow, Bootstrap, Elementor, Divi). A project overrides any of them in qa-target.json → "selectors"; null = default.
const DEFAULT_HEADER = 'header, [role=banner], .w-nav, [data-elementor-type=header], .elementor-location-header, #masthead, .site-header';
const DEFAULT_SELECTORS = {
  header: DEFAULT_HEADER,
  main: 'main, [role=main], .main-wrapper, .site-main',
  footer: 'footer, [role=contentinfo], [data-elementor-type=footer], .elementor-location-footer, .site-footer',
  nav: 'nav, [role=navigation], .w-nav-menu',
  dropdown: '',                     // optional extra dropdown item selector
  burger: '.wp-block-navigation__responsive-container-open, .w-nav-button, .navbar-toggler, .elementor-menu-toggle, .e-n-menu-toggle, .mobile_menu_bar_toggle, .menu-toggle, [class*=hamburger i], [class*=burger i]:not(svg):not(svg *), button[aria-label*="menu" i], [role=button][aria-label*="menu" i]',
  logo: null,                       // built from "header" below when not set
  themeCss: '(website-files|webflow)\\.com/.+\\.css', // regex: theme CSS served from another origin
  consent: '#onetrust-consent-sdk, #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay, .cky-consent-container, .cky-overlay, #cookie-law-info-bar, .cli-modal-backdrop, #cmplz-cookiebanner-container, .cmplz-cookiebanner, #moove_gdpr_cookie_info_bar, #iubenda-cs-banner, #termly-code-snippet-support, #usercentrics-root, #BorlabsCookieBox, .osano-cm-window, #didomi-host, .qc-cmp2-container, #truste-consent-track, .cc-window, #cc-main, [fs-cc=banner]',
  dismiss: '#onetrust-reject-all-handler, #CybotCookiebotDialogBodyButtonDecline, .cky-btn-reject, .cmplz-btn.cmplz-deny, #cn-refuse-cookie, .cc-deny, .iubenda-cs-reject-btn, [fs-cc="deny"], #cookie_action_close_header_reject', // reject / necessary-only / close — never "accept"
  ignoreOverlays: '',               // elements not under audit that may cover controls (chat widgets, promo pop-ups)
};
function logoSelector(header) {
  const inner = '.custom-logo, [class*=logo i] img, [class*=logo i] svg, img[class*=logo i], svg[class*=logo i], [class*=brand i] img, [class*=brand i] svg, a[rel=home] img, a[rel=home] svg';
  return `:is(${header}) :is(${inner}), [data-qa-region=header] :is(${inner}), .w-nav-brand img, .w-nav-brand svg, .navbar-brand img, .navbar-brand svg, .elementor-widget-theme-site-logo img`;
}
function mergeDefined(defaults, user) { // user null / undefined / '' = "use the default"
  const out = Object.assign({}, defaults); const explicit = new Set();
  for (const [k, v] of Object.entries(user || {})) { if (isNil(v) || v === '') continue; out[k] = v; explicit.add(k); }
  return { out, explicit };
}
function configPath(a) { return path.resolve((a && a.config) || path.join(process.cwd(), 'qa-target.json')); }
// The raw qa-target.json (or {} when absent). Does not require "base" — for spell.cjs and other base-less tools.
function readTarget(a) { const f = configPath(a || {}); if (!fs.existsSync(f)) return {}; return readJson(f, 'qa-target.json'); }
const readConfigFile = readTarget;

// qa-target.json in cwd (or --config) — base, pages, decisions, selectors. Never a default URL.
// opts.allowLocal: the instrument supports --local <dir> (call resolveTarget(cfg) before using cfg.base).
function loadConfig(a, opts) {
  a = a || {}; opts = opts || {};
  const file = configPath(a);
  let raw = {};
  if (fs.existsSync(file)) { try { raw = readJson(file, 'qa-target.json'); } catch (e) { console.error(e.message); process.exit(1); } }
  if (fs.existsSync(file) && insideSkill(file)) process.stderr.write(`note: ${file} lives inside the skill folder; qa-target.json belongs in the PROJECT folder\n`);
  const cfg = JSON.parse(JSON.stringify(raw));
  cfg._configFile = fs.existsSync(file) ? file : null;
  cfg._configDir = path.dirname(file);
  cfg._configHash = sha1(stable(raw)).slice(0, 12);
  if (a.local && a.local !== true) cfg.local = path.resolve(String(a.local));
  else if (raw.local) cfg.local = path.resolve(cfg._configDir, String(raw.local));
  if (a.base) cfg.base = a.base;
  if (!cfg.base && !(cfg.local && opts.allowLocal)) {
    console.error(`No site. Pass --base https://site or put {"base": "..."} in qa-target.json (looked for ${file}).${cfg.local ? ' This instrument does not serve a local folder (--local).' : ''}\nRun the instruments from the PROJECT folder (where qa-target.json lives) and call the scripts by their full path.`);
    process.exit(1);
  }
  if (cfg.base) {
    cfg.base = String(cfg.base).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^/]/i.test(cfg.base)) { console.error(`"base" must be an http(s) URL, got ${JSON.stringify(cfg.base)}`); process.exit(1); }
  }
  // decisions: null in the file = default; remember what was set explicitly
  const dm = mergeDefined(DEFAULT_DECISIONS, raw.decisions);
  cfg.decisions = dm.out; cfg._explicit = new Set([...dm.explicit].map(k => 'decisions.' + k));
  if (!isNil(raw.staging)) cfg._explicit.add('staging');
  if (!isNil(cfg.decisions.dateFormat)) {
    const df = DATE_FORMAT_LEGACY[cfg.decisions.dateFormat] || cfg.decisions.dateFormat;
    if (df !== cfg.decisions.dateFormat) process.stderr.write(`note: decisions.dateFormat "${cfg.decisions.dateFormat}" read as "${df}"\n`);
    if (!DATE_FORMATS.includes(df)) { console.error(`decisions.dateFormat "${cfg.decisions.dateFormat}" must be one of: ${DATE_FORMATS.join(' | ')} — or null (= one format across the site)`); process.exit(1); }
    cfg.decisions.dateFormat = df;
  }
  if (!['client', 'template'].includes(cfg.decisions.projectType)) { console.error(`decisions.projectType must be "client" or "template", got ${JSON.stringify(cfg.decisions.projectType)}`); process.exit(1); }
  if (!['US', 'UK'].includes(cfg.decisions.englishVariant)) { console.error(`decisions.englishVariant must be "US" or "UK", got ${JSON.stringify(cfg.decisions.englishVariant)}`); process.exit(1); }
  // widths: the project's tiers are kept; the anchor tiers are always added, never replaced
  const reqW = a.widths ? String(a.widths).split(',').map(s => Number(String(s).trim())) : (Array.isArray(raw.widths) && raw.widths.length ? raw.widths.map(Number) : [1920, 1440, 1280, 992, 768, 568, 360]);
  const badW = reqW.filter(w => !Number.isInteger(w) || w < 200 || w > 4000);
  if (badW.length) { console.error(`widths: not a pixel width between 200 and 4000: ${badW.join(', ')} (quote comma lists: --widths "1920,1440")`); process.exit(1); }
  cfg.widthsRequested = reqW.slice();
  cfg.widthsAdded = Object.values(TIER).filter(w => !reqW.includes(w));
  cfg.widths = [...new Set(reqW.concat(cfg.widthsAdded))].sort((x, y) => y - x);
  const iwRaw = a.interactWidths || a['interact-widths'];
  const iw = iwRaw ? String(iwRaw).split(',').map(Number) : (Array.isArray(raw.interactWidths) && raw.interactWidths.length ? raw.interactWidths.map(Number) : [TIER.desktop, TIER.tablet, TIER.mobile]);
  if (iw.some(w => !Number.isInteger(w) || w < 200 || w > 4000)) { console.error('interactWidths: not a pixel width: ' + iw.join(', ')); process.exit(1); }
  cfg.interactWidths = [...new Set(iw.concat(iw.some(w => w >= 992) ? [] : [TIER.desktop], iw.some(w => w < 768) ? [] : [TIER.mobile]))].sort((x, y) => y - x);
  // engines: chromium is the measuring engine and is always present
  const eng = (a.engines ? String(a.engines).split(',') : (Array.isArray(raw.engines) && raw.engines.length ? raw.engines : ENGINES.slice())).map(s => String(s).trim().toLowerCase()).filter(Boolean);
  const badE = eng.filter(e => !ENGINES.includes(e));
  if (badE.length) { console.error(`engines: unknown ${badE.join(', ')} — use any of ${ENGINES.join(', ')}`); process.exit(1); }
  cfg.engines = [...new Set(eng)]; cfg.enginesAdded = [];
  if (!cfg.engines.includes('chromium')) { cfg.engines.unshift('chromium'); cfg.enginesAdded.push('chromium'); }
  cfg.concurrency = Math.max(1, +(a.concurrency || raw.concurrency || 2));
  // throttle: 400 ms between requests protects a live host (WAF, rate limits); a build on this machine has none
  const loopback = !!cfg.local || /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:\d+)?(\/|$)/i.test(String(cfg.base || ''));
  cfg.throttleMs = Math.max(0, +(isNil(a.throttle) ? (isNil(raw.throttleMs) ? (loopback ? 0 : 400) : raw.throttleMs) : a.throttle));
  // interaction phases run in parallel contexts too (results identical to a serial run: see qa-run runJobs)
  cfg.interactConcurrency = Math.max(1, +(a['interact-concurrency'] || raw.interactConcurrency || cfg.concurrency));
  // pinned browser environment: every machine sends the same language and formats dates the same way
  cfg.locale = a.locale || raw.locale || (cfg.decisions.englishVariant === 'UK' ? 'en-GB' : 'en-US');
  cfg.timezoneId = a.timezone || a.timezoneId || raw.timezoneId || 'UTC';
  cfg.chromium = String(a.chromium || raw.chromium || (raw.decisions && raw.decisions.chromium) || (process.env.QA_USE_SYSTEM_CHROME === '1' ? 'chrome' : 'bundled')).toLowerCase();
  if (cfg.chromium === 'system') cfg.chromium = 'chrome';
  if (!['bundled', 'chrome', 'msedge'].includes(cfg.chromium)) { console.error(`"chromium" must be "bundled" (default, pinned by package-lock), "chrome" or "msedge", got ${JSON.stringify(cfg.chromium)}`); process.exit(1); }
  cfg.platform = a.platform || raw.platform || null;
  if (cfg.platform && !PLATFORMS.includes(cfg.platform)) { console.error(`"platform" must be one of ${PLATFORMS.join(', ')} or null (= detected), got ${JSON.stringify(cfg.platform)}`); process.exit(1); }
  cfg.stage = String(a.stage || raw.stage || (cfg.local ? '1' : '2'));
  if (!['1', '2'].includes(cfg.stage)) { console.error('"stage" must be 1 (local HTML build) or 2 (deployed site)'); process.exit(1); }
  cfg.sameHosts = [].concat(raw.sameHosts || [], Array.isArray(raw.sameSite) ? raw.sameSite : []);
  cfg.crawlMax = +(raw.crawlMax || 200); cfg.crawlDepth = +(raw.crawlDepth || 2);
  const mp = isNil(a.maxPages) ? a['max-pages'] : a.maxPages;
  cfg.maxPages = isNil(mp) ? (isNil(raw.maxPages) ? null : +raw.maxPages) : +mp;
  // template sampling from 11 pages up: CMS items of one template share their layout, header, burger and forms, so
  // the heavy passes run on ≤ perTemplate of them; every page still gets the content pass (1440 + 360)
  cfg.sample = mergeDefined({ threshold: 10, perTemplate: 3, maxPages: null, keep: [] }, raw.sample).out;
  cfg.timing = mergeDefined({ settleCapMs: 4000, actionCapMs: 1500, sliderSampleMs: 7000, imgCapMs: 10000 }, raw.timing).out;
  // 30 min is the upper bound of a qa-run, not its target; what the budget cuts is listed per row (RUN-04)
  cfg.budgetMinutes = +(a.budget || raw.budgetMinutes || 30);
  // WebKit / Firefox widths: the anchor tiers 1440 · 768 · 360 (default) or "all" = 1440, 768 and every tier below 768
  const xbw = isNil(a['xb-widths']) ? raw.xbWidths : a['xb-widths'];
  cfg.xbWidths = isNil(xbw) || xbw === 'anchor' ? 'anchor' : xbw === 'all' ? 'all' : [].concat(Array.isArray(xbw) ? xbw : String(xbw).split(',')).map(Number).filter(w => Number.isInteger(w) && w >= 200 && w <= 4000);
  cfg.reference = mergeDefined({ tokens: null, build: null, pageMap: null, exclude: null }, raw.reference).out;
  pageExcludeRe(cfg); // a broken regex stops here, before anything is measured
  cfg.sources = mergeDefined({ copy: null }, raw.sources).out;
  cfg.ios = mergeDefined({ iphone: null, ipad: null, runtime: null }, raw.ios).out;
  cfg.wp = mergeDefined({ productionDomain: null, requiredPlugins: [], cachePlugins: [], imagePlugins: [], hostCaching: null, agencyDomains: [], devMuPlugins: [] }, raw.wp).out;
  cfg.dictionary = Array.isArray(raw.dictionary) ? raw.dictionary.map(String) : [];
  const sm = mergeDefined(DEFAULT_SELECTORS, raw.selectors);
  cfg.selectors = sm.out; cfg._explicitSelectors = sm.explicit;
  if (!cfg.selectors.logo) cfg.selectors.logo = logoSelector(cfg.selectors.header);
  if (a['storage-state'] && a['storage-state'] !== true) cfg.storageState = path.resolve(String(a['storage-state']));
  else if (raw.storageState) cfg.storageState = path.resolve(cfg._configDir, String(raw.storageState));
  // pages: --pages wins over qa-target.json; always a fresh, normalised array (callers may push into it)
  if (a.pages && a.pages !== true) { cfg.pages = parsePages(a.pages, cfg, '--pages'); cfg.pagesFrom = 'cli'; }
  else if (Array.isArray(raw.pages) && raw.pages.length) { cfg.pages = parsePages(raw.pages, cfg, 'qa-target.json pages'); cfg.pagesFrom = 'config'; }
  else { cfg.pages = []; cfg.pagesFrom = null; }
  return cfg;
}
// Facts that must be set explicitly before measuring (wrong guesses give confident wrong HARD findings).
// Returns [] when all are set; otherwise [{ key, question }] — the caller asks the designer or stops.
function requireDecisions(cfg, keys) {
  keys = keys || Object.keys(REQUIRED_DECISIONS);
  const ex = cfg._explicit || new Set();
  return keys.filter(k => !(k === 'staging' ? typeof cfg.staging === 'boolean' : ex.has('decisions.' + k))).map(k => ({ key: k, question: REQUIRED_DECISIONS[k] || k }));
}

// ------------------------------------------------------------------------------------------------ dates (TEXT-07)
const DATE_MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
// Collects plausible dates only (use with flags 'gi'; rejects "24/7/365", "2.4.10", "Mayday"). Pass the source into page code.
const DATE_RE_SOURCE = `\\b(?:${DATE_MONTHS})\\.?\\s*\\d{1,2},?\\s*(?:19|20)\\d{2}\\b|\\b\\d{1,2}\\s+(?:${DATE_MONTHS})\\.?,?\\s+(?:19|20)\\d{2}\\b|\\b(?:${DATE_MONTHS})\\.\\d{1,2}\\.(?:19|20)\\d{2}\\b|(?<![\\d./])(?:0?[1-9]|[12]\\d|3[01])([./])(?:0?[1-9]|[12]\\d|3[01])\\1(?:19|20)\\d{2}(?![\\d./]\\d)`;
const FULL_MONTH = /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i;
const SHORT_MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
// Every DATE_FORMATS entry a date string fits (letter case ignored). [] = not a date this classifier knows.
function classifyDate(s) {
  s = String(s).trim(); let m;
  const kinds = (name, dot) => { const out = []; if (FULL_MONTH.test(name)) out.push('full'); if (SHORT_MONTH.test(name)) out.push(dot ? 'shortDot' : 'short'); return out; };
  if ((m = s.match(/^([a-z]+)\.(\d{1,2})\.\d{4}$/i)) && (FULL_MONTH.test(m[1]) || SHORT_MONTH.test(m[1]))) return [m[2].length === 2 ? 'MMM.DD.YYYY' : 'MMM.D.YYYY'];
  if ((m = s.match(/^([a-z]+)(\.?)\s*\d{1,2},?\s*\d{4}$/i))) return kinds(m[1], !!m[2]).map(k => (k === 'full' ? 'MMMM D, YYYY' : k === 'shortDot' ? 'MMM. D, YYYY' : 'MMM D, YYYY'));
  if ((m = s.match(/^\d{1,2}\s+([a-z]+)\.?,?\s+\d{4}$/i))) return kinds(m[1], false).map(k => (k === 'full' ? 'D MMMM YYYY' : 'D MMM YYYY'));
  if ((m = s.match(/^(\d{1,2})([./])(\d{1,2})\2(\d{4})$/))) {
    if (m[2] === '.') return ['DD.MM.YYYY'];
    const a1 = +m[1], a2 = +m[3];
    if (a1 > 12) return ['DD/MM/YYYY']; if (a2 > 12) return ['MM/DD/YYYY']; return ['DD/MM/YYYY', 'MM/DD/YYYY'];
  }
  return [];
}

// ------------------------------------------------------------------------------------------------ Node / Playwright
// kind 'playwright': Playwright's own floor (it calls process.exit inside require below it).
// kind 'esm' (default): require() of ESM-only packages (the iOS inspector dependency) — ^20.19 || >=22.12.
function nodeProblem(kind) {
  const v = process.versions.node; const parts = v.split('.').map(Number); const M = parts[0], m = parts[1];
  const ok = kind === 'playwright' ? M >= 20 : (M >= 23 || (M === 22 && m >= 12) || (M === 20 && m >= 19));
  return ok ? null : `Node ${v} is too old (need ^20.19 or >=22.12) — install the current LTS (Node 22 or 24) from nodejs.org or with nvm/fnm, then: cd "${__dirname}" && npm ci`;
}
const INSTALL_ROUTE = `in the folder ${__dirname} run  npm ci  then  npm run browsers  (Windows PowerShell: npm.cmd ci, npm.cmd run browsers; Linux: a person also runs  sudo env "PATH=$PATH" npm run browsers-deps  once)`;
function tryPlaywright() {
  if (nodeProblem('playwright')) return null;
  const tries = [process.env.PW_PATH, path.join(__dirname, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright'];
  let lastErr = null;
  for (const t of tries) {
    if (!t) continue;
    try { return require(t); } catch (e) { if (!(e.code === 'MODULE_NOT_FOUND' && String(e.message).includes(t))) lastErr = e; }
  }
  tryPlaywright.lastError = lastErr; return null;
}
// loadPlaywright()              → exits 2 with the install route (old behaviour)
// loadPlaywright(R, ids, out)   → records NOT RUN with the reason on every id, saves results, exits 3
function loadPlaywright(R, ids, out) {
  const fail = why => {
    console.error(why);
    if (R && ids && ids.length) { ids.forEach(id => R.notRun(id, why)); saveResults(R, out || outDirFrom({})); process.exit(EXIT_NOT_RUN); }
    process.exit(2);
  };
  const np = nodeProblem('playwright'); if (np) fail(np);
  const pw = tryPlaywright(); if (pw) return pw;
  const le = tryPlaywright.lastError;
  fail(le ? `playwright-core failed to load on Node ${process.versions.node}: ${firstLine(le.message, 160)} — route: ${INSTALL_ROUTE}` : `playwright-core not installed — route: ${INSTALL_ROUTE}`);
}

// ------------------------------------------------------------------------------------------------ browsers
// System Google Chrome (Lighthouse and the opt-in "chrome" mode). CHROME_PATH is used only when the file exists.
let WARNED_CHROME_PATH = false;
function systemChromePaths() {
  const env = process.env, out = [];
  if (process.platform === 'win32') {
    for (const pre of [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.HOMEDRIVE && env.HOMEDRIVE + '\\Program Files', env.HOMEDRIVE && env.HOMEDRIVE + '\\Program Files (x86)', 'C:\\Program Files', 'C:\\Program Files (x86)']) if (pre) out.push(path.win32.join(pre, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else if (process.platform === 'darwin') {
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  } else {
    out.push('/opt/google/chrome/chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'); // snap chromium wrappers left out: they often fail under automation
  }
  return [...new Set(out)];
}
function validChromePathEnv() {
  const p = process.env.CHROME_PATH; if (!p) return null;
  if (fs.existsSync(p)) return p;
  if (!WARNED_CHROME_PATH) { process.stderr.write(`CHROME_PATH=${p} does not exist — ignored\n`); WARNED_CHROME_PATH = true; }
  return null;
}
// chromeExecutable()                 → CHROME_PATH (if it exists) → installed Chrome → Playwright's bundled Chromium → null
// chromeExecutable({ bundled:false }) → system Chrome only
function chromeExecutable(opts) {
  opts = opts || {};
  const env = validChromePathEnv(); if (env) return env;
  const found = systemChromePaths().find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
  if (found) return found;
  if (opts.bundled === false) return null;
  const pw = tryPlaywright();
  try { const e = pw && pw.chromium.executablePath(); if (e && fs.existsSync(e)) return e; } catch (e) { }
  return null;
}
const BROWSERS = new Set();
const ENGINES_USED = {};   // engine → { how, version, tried, wanted, fallback } | { error } — copied into every saved _env
let CHROMIUM = null;       // first successful Chromium choice; every relaunch in this process reuses it
function track(b, engine, info) {
  BROWSERS.add(b); try { b.on('disconnected', () => BROWSERS.delete(b)); } catch (e) { }
  b.__qaSource = info.how; b.__qaVersion = info.version; b.__qaTried = info.tried || [];
  ENGINES_USED[engine] = info; return b;
}
// Order: the configured choice first ("bundled" = Playwright's Chromium pinned by package-lock — the default and the
// most repeatable; "chrome" = installed Google Chrome; "msedge"), then the others as fallbacks (marked fallback:true).
// An explicit CHROME_PATH that exists is an explicit opt-in to that binary. Every launch error is kept; total failure
// throws with the route.
async function launchChromium(pw, cfg, launchOpts) {
  launchOpts = launchOpts || {};
  if (CHROMIUM) { const b = await pw.chromium.launch(Object.assign({}, CHROMIUM.opts, launchOpts)); return track(b, 'chromium', CHROMIUM); }
  const want = (cfg && cfg.chromium) || (process.env.QA_USE_SYSTEM_CHROME === '1' ? 'chrome' : 'bundled');
  const envPath = validChromePathEnv();
  const C = { bundled: [['bundled', { channel: 'chromium' }], ['bundled-headless-shell', {}]], msedge: [['msedge', { channel: 'msedge' }]], chrome: [] };
  if (envPath) C.chrome.push(['CHROME_PATH', { executablePath: envPath }]);
  C.chrome.push(['chrome', { channel: 'chrome' }]);
  if (process.platform === 'darwin') C.chrome.push(['chrome-user', { executablePath: path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome') }]);
  const first = envPath ? 'chrome' : want;
  const order = (first === 'chrome' ? ['chrome', 'bundled', 'msedge'] : first === 'msedge' ? ['msedge', 'bundled', 'chrome'] : ['bundled', 'chrome', 'msedge']).reduce((acc, k) => acc.concat(C[k]), []);
  const tried = [];
  if (process.env.CHROME_PATH && !envPath) tried.push('CHROME_PATH: not found at ' + process.env.CHROME_PATH + ' — ignored');
  for (const [how, opts] of order) {
    if (opts.executablePath && !fs.existsSync(opts.executablePath)) { tried.push(how + ': not found at ' + opts.executablePath); continue; }
    try {
      const b = await pw.chromium.launch(Object.assign({}, opts, launchOpts));
      const kind = how.startsWith('bundled') ? 'bundled' : how === 'msedge' ? 'msedge' : 'chrome';
      CHROMIUM = { how, opts, exe: opts.executablePath || opts.channel || 'bundled', version: b.version(), wanted: want, fallback: kind !== first, tried: tried.slice() };
      return track(b, 'chromium', CHROMIUM);
    } catch (e) { tried.push(how + ': ' + firstLine(e.message, 140)); }
  }
  ENGINES_USED.chromium = { error: 'no Chromium could start', tried };
  const er = new Error('no Chromium could start — ' + tried.join(' | ') + ' — route: npx playwright-core install chromium (Linux: a person runs  sudo npx playwright-core install-deps chromium) or set CHROME_PATH to an existing Chrome/Edge');
  er.code = 'LAUNCH_FAILED'; er.tried = tried; throw er;
}
// Any engine. Returns the browser (with __qaSource / __qaVersion). Throws a one-line reason + route on failure.
async function launchBrowser(pw, engine, cfg, launchOpts) {
  if (engine === 'chromium') return launchChromium(pw, cfg, launchOpts);
  if (!pw || !pw[engine]) throw new Error(`unknown engine ${engine}`);
  try { const b = await pw[engine].launch(launchOpts || {}); return track(b, engine, { how: 'bundled', version: b.version(), tried: [] }); }
  catch (e) {
    const why = firstLine(e.message, 160); ENGINES_USED[engine] = { error: why };
    const er = new Error(`${engine} did not start: ${why} — route: npx playwright-core install ${engine} (Linux: a person runs  sudo npx playwright-core install-deps ${engine}) or hand the ${engine} rows to a machine where it launches`);
    er.code = 'LAUNCH_FAILED'; throw er;
  }
}
async function launchEngine(pw, engine, cfg, launchOpts) { const browser = await launchBrowser(pw, engine, cfg, launchOpts); return { browser, source: browser.__qaSource, version: browser.__qaVersion }; }
const chromiumChoice = () => CHROMIUM;
const engineChoice = engine => ENGINES_USED[engine] || null;
async function closeAllBrowsers() { const all = [...BROWSERS]; BROWSERS.clear(); await Promise.all(all.map(b => b.close().catch(() => { }))); }
// Context options that make every machine render the same way. Spread viewport / device descriptors after this.
function pinned(cfg) { return { locale: (cfg && cfg.locale) || 'en-US', timezoneId: (cfg && cfg.timezoneId) || 'UTC', colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none', deviceScaleFactor: 1 }; }
function contextOptions(cfg, extra) { return Object.assign({}, pinned(cfg), authOpts(cfg), extra || {}); }

// ------------------------------------------------------------------------------------------------ access (session the person provided)
// The agent never types or reads a password. A person creates the session (storage state file) or exports
// QA_HTTP_USER / QA_HTTP_PASS for basic auth in their own terminal.
const GATE_ROUTE = 'site behind a password / basic auth / sign-in: a person opens it once and saves the session (storage state → qa-target.json "storageState", default .qa-auth.json next to qa-target.json) or exports QA_HTTP_USER / QA_HTTP_PASS for basic auth in their own terminal, then rerun — the agent never types a password';
function storageStatePath(cfg, a) {
  if (a && a['storage-state'] && a['storage-state'] !== true) return path.resolve(String(a['storage-state']));
  if (cfg && cfg.storageState) return cfg.storageState;
  const def = path.join((cfg && cfg._configDir) || process.cwd(), '.qa-auth.json');
  return fs.existsSync(def) ? def : null;
}
function authOpts(cfg, a) {
  const o = {}; const ss = storageStatePath(cfg, a);
  if (ss && fs.existsSync(ss)) o.storageState = ss;
  if (process.env.QA_HTTP_USER && process.env.QA_HTTP_PASS) {
    o.httpCredentials = { username: process.env.QA_HTTP_USER, password: process.env.QA_HTTP_PASS };
    try { if (cfg && cfg.base) o.httpCredentials.origin = new URL(cfg.base).origin; } catch (e) { } // never sent to other hosts
  }
  return o;
}
let SS_CACHE = null;
function storageStateCookies(cfg) {
  const f = storageStatePath(cfg); if (!f || !fs.existsSync(f)) return [];
  if (SS_CACHE && SS_CACHE.f === f) return SS_CACHE.c;
  let c = []; try { c = readJson(f, 'storage state').cookies || []; } catch (e) { c = []; }
  SS_CACHE = { f, c }; return c;
}
function cookieHeader(cfg, url) {
  let u; try { u = new URL(url); } catch (e) { return ''; }
  const now = Date.now() / 1000;
  return storageStateCookies(cfg).filter(k => {
    const d = String(k.domain || '').replace(/^\./, '').toLowerCase(); const h = u.hostname.toLowerCase();
    if (!(h === d || h.endsWith('.' + d))) return false;
    if (k.path && !u.pathname.startsWith(k.path)) return false;
    if (k.secure && u.protocol !== 'https:') return false;
    if (k.expires && k.expires > 0 && k.expires < now) return false;
    return true;
  }).map(k => `${k.name}=${k.value}`).join('; ');
}
// Node-side fetch with the pinned language, the person's session cookies and basic auth (same site only), and a timeout.
// Note: Node's fetch does not use the OS proxy or certificate store; behind a corporate proxy / TLS inspection set
// NODE_USE_ENV_PROXY=1 (recent Node), NODE_EXTRA_CA_CERTS=<ca.pem> or NODE_OPTIONS=--use-system-ca — or pass a
// browser page / context to getUrl(), which uses the browser network stack.
function httpFetch(cfg, url, init) {
  init = Object.assign({}, init || {});
  const h = Object.assign({}, UA, { 'accept-language': (cfg && cfg.locale) || 'en-US' }, init.headers || {});
  if (cfg && sameSite(url, cfg)) {
    const ck = cookieHeader(cfg, url); if (ck && !h.cookie) h.cookie = ck;
    if (process.env.QA_HTTP_USER && process.env.QA_HTTP_PASS && !h.authorization) h.authorization = 'Basic ' + Buffer.from(process.env.QA_HTTP_USER + ':' + process.env.QA_HTTP_PASS).toString('base64');
  }
  init.headers = h;
  if (!init.signal) init.signal = timeoutSignal(init.timeoutMs || 20000);
  delete init.timeoutMs;
  return fetch(url, init);
}
function maybeGunzip(buf) { if (buf && buf[0] === 0x1f && buf[1] === 0x8b) { try { return require('zlib').gunzipSync(buf); } catch (e) { } } return buf; }
// One GET through the best available route. Order: the open page (same origin only: browser network stack — OS proxy,
// certificates and a host-challenge clearance cookie), then the browser context's request API, then Node fetch.
// Returns { status (-1 = network error), headers, text, url, redirected, via, blocked, error } — never throws.
// opts: { cfg, page, ctx, redirect: 'follow'|'manual', head, timeoutMs, maxBytes, fallbackToNode }
async function getUrl(url, opts) {
  opts = opts || {}; const cfg = opts.cfg; const max = opts.maxBytes || 8 * 1048576;
  const done = r => { r.blocked = r.status > 0 ? !!isChallenge({ status: r.status, headers: r.headers || {}, url: r.url || url, body: r.text || '' }) : false; return r; };
  if (opts.page && opts.redirect !== 'manual' && !opts.head) {
    let pageOrigin = null, target = null;
    try { pageOrigin = new URL(opts.page.url()).origin; target = new URL(url).origin; } catch (e) { }
    if (pageOrigin && pageOrigin === target && !/\.gz(\?|$)/i.test(url)) {
      try {
        const r = await opts.page.evaluate(async ({ u, max, ms }) => {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
          try { const res = await fetch(u, { credentials: 'include', redirect: 'follow', signal: ctl.signal }); const tx = await res.text(); const hd = {}; res.headers.forEach((v, k) => { hd[k] = v; }); return { status: res.status, headers: hd, text: tx.slice(0, max), url: res.url, redirected: res.redirected }; }
          catch (e) { return { error: String((e && e.message) || e) }; } finally { clearTimeout(t); }
        }, { u: url, max, ms: opts.timeoutMs || 20000 });
        if (!r.error) { r.via = 'page'; return done(r); }
      } catch (e) { /* context destroyed etc. → next route */ }
    }
  }
  if (opts.ctx && opts.ctx.request) {
    try {
      const res = await opts.ctx.request.get(url, { maxRedirects: opts.redirect === 'manual' ? 0 : 20, failOnStatusCode: false, timeout: opts.timeoutMs || 20000, headers: { 'accept-language': (cfg && cfg.locale) || 'en-US' } });
      const body = opts.head ? Buffer.alloc(0) : maybeGunzip(await res.body().catch(() => Buffer.alloc(0)));
      return done({ status: res.status(), headers: res.headers(), text: body.toString('utf8').slice(0, max), url: res.url(), via: 'context' });
    } catch (e) { if (!opts.fallbackToNode) return { status: -1, error: firstLine(e.message, 120), via: 'context', headers: {}, text: '', blocked: false }; }
  }
  try {
    const res = await httpFetch(cfg, url, { redirect: opts.redirect || 'follow', timeoutMs: opts.timeoutMs || 20000 });
    const hd = {}; res.headers.forEach((v, k) => { hd[k] = v; });
    let text = '';
    if (opts.head || (opts.redirect === 'manual' && res.status >= 300 && res.status < 400)) { try { if (res.body) await res.body.cancel(); } catch (e) { } }
    else { const buf = maybeGunzip(Buffer.from(await res.arrayBuffer())); text = buf.toString('utf8').slice(0, max); }
    return done({ status: res.status, headers: hd, text, url: res.url || url, redirected: res.redirected, via: 'node' });
  } catch (e) { return { status: -1, error: errCode(e), headers: {}, text: '', via: 'node', blocked: false }; }
}
// GET through a browser context that already passed the host challenge (shares its cookies).
async function hostGet(ctx, url, maxRedirects) {
  try {
    const res = await ctx.request.get(url, { maxRedirects: isNil(maxRedirects) ? 20 : maxRedirects, failOnStatusCode: false, timeout: 20000, headers: { 'accept-language': 'en-US' } });
    const headers = res.headers(); const text = maybeGunzip(await res.body().catch(() => Buffer.alloc(0))).toString('utf8');
    return { status: res.status(), headers, text, url: res.url(), blocked: !!isChallengeBody(headers, text, res.status()) };
  } catch (e) { return { status: -1, error: firstLine(e.message, 120), headers: {}, text: '', blocked: false }; }
}

// ------------------------------------------------------------------------------------------------ host challenges (WAF)
const CHALLENGE = /One moment, please|Just a moment|Checking your browser|Attention Required|Sucuri WebSite Firewall|Your access to this site has been limited|Imunify360|DDoS-Guard|Vercel Security Checkpoint|Human Verification|Verifying you are human|Request unsuccessful/i; // title hint
const CHALLENGE_DOM = '#challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, form[action*="sgcaptcha"], meta[http-equiv="refresh" i][content*="captcha"]';
const CHALLENGE_BODY = /_cf_chl_opt|cf-browser-verification|\/\.well-known\/sgcaptcha|Sucuri WebSite Firewall|Your access to this site has been limited|imunify360|ddos-guard|awswaf|AwsWafIntegration|Vercel Security Checkpoint/i;
// Language-independent signals first; body markers only on a non-2xx or 202 answer (a normal page may mention a vendor).
// Returns a short reason string, or null.
function isChallenge(x) {
  x = x || {}; const headers = x.headers || {}; const h = k => String(headers[k] || '');
  const status = x.status || 0, title = x.title || '', url = x.url || '', body = String(x.body || '');
  if (/challenge/i.test(h('cf-mitigated'))) return 'cloudflare cf-mitigated';
  if (/challenge|captcha/i.test(h('x-amzn-waf-action'))) return 'aws-waf';
  if (/challenge|captcha/i.test(h('sg-captcha'))) return 'siteground sg-captcha';
  if (/\/\.well-known\/sgcaptcha|\/cdn-cgi\/challenge-platform\/h\//.test(url)) return 'challenge url';
  if (CHALLENGE.test(title)) return 'title "' + title.slice(0, 60) + '"';
  if (status >= 400 && /^\s*(access denied|403 forbidden)\s*$/i.test(title)) return `HTTP ${status} "${title}"`;
  if (status >= 400 || status === 202) {
    if (CHALLENGE_BODY.test(body.slice(0, 60000))) return `HTTP ${status} + WAF marker`;
    const tm = body.match(/<title[^>]*>([^<]*)</i); if (tm && CHALLENGE.test(tm[1])) return `HTTP ${status} challenge title`;
  }
  return null;
}
function isChallengeBody(headers, text, status) { return isChallenge({ headers: headers || {}, body: text || '', status: status || 0, title: ((String(text || '').match(/<title[^>]*>([^<]*)/i) || [])[1] || '') }); }
async function isChallengePage(page, resp) {
  const st = resp ? resp.status() : 0;
  let title = ''; try { title = await page.title(); } catch (e) { return 'page not readable'; }
  const why = isChallenge({ title, status: st, headers: resp ? resp.headers() : {}, url: page.url() });
  if (why) return why;
  try { if (await page.$(CHALLENGE_DOM)) return 'challenge form in the page'; } catch (e) { }
  if (st >= 400 || st === 202) { try { return isChallenge({ status: st, body: await page.content() }); } catch (e) { } }
  return null;
}
class BlockedError extends Error { constructor(msg, extra) { super(msg); this.name = 'BlockedError'; this.code = 'HOST_CHALLENGE'; this.blocked = true; Object.assign(this, extra || {}); } }

// Wait until the page is visually stable: fonts ready, no finite animation running, near-viewport images loaded,
// the same visual signature on two reads 150ms apart, and no fixed overlay covering ≥60% of the viewport (preloader,
// modal). Infinite animations (marquees, spinners) are ignored. Never throws; returns what was still moving at the cap:
// { ms, capped, running, pendImg, unstable, cover, lock } — lock = html/body scroll already locked.
async function settle(page, opts) {
  opts = opts || {}; const cap = opts.capMs || 4000; const coverCap = isNil(opts.coverCapMs) ? cap : opts.coverCapMs;
  try {
    return await page.evaluate(async ({ cap, coverCap }) => {
      const t0 = performance.now(); const sleep = ms => new Promise(r => setTimeout(r, ms)); const left = c => c - (performance.now() - t0);
      try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(cap)]); } catch (e) { }
      const anims = () => { try { return document.getAnimations ? document.getAnimations() : []; } catch (e) { return []; } };
      const infinite = () => { const s = new Set(); for (const an of anims()) { try { const t = an.effect && an.effect.getComputedTiming(); if (t && t.endTime === Infinity && an.effect.target) s.add(an.effect.target); } catch (e) { } } return s; };
      const running = () => { let n = 0; for (const an of anims()) { try { if (an.playState !== 'running') continue; const t = an.effect && an.effect.getComputedTiming(); if (t && isFinite(t.endTime)) n++; } catch (e) { } } return n; };
      const vh = innerHeight, vw = innerWidth;
      const pendImg = () => [...document.images].filter(i => (i.currentSrc || i.src) && !i.complete && i.loading !== 'lazy' && (() => { const r = i.getBoundingClientRect(); return r.bottom > -vh * 0.5 && r.top < vh * 1.5; })()).length;
      const sig = () => {
        const inf = infinite(); const under = el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (inf.has(p)) return true; return false; };
        let els = [...document.querySelectorAll('main *, [role=main] *, header *, [role=banner] *')]; if (els.length < 5) els = [...document.querySelectorAll('body *')];
        const out = []; for (const el of els) { if (out.length >= 300) break; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > vh || under(el)) continue; const cs = getComputedStyle(el); out.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.transform].join(',')); }
        return out.join('|');
      };
      const cover = () => {
        for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          for (let el = document.elementFromPoint(vw * fx, vh * fy); el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            const cs = getComputedStyle(el); if (cs.position !== 'fixed') continue;
            const r = el.getBoundingClientRect(); if (r.width * r.height < vw * vh * 0.6 || +cs.opacity <= 0.1 || cs.visibility === 'hidden') continue;
            return (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 80);
          }
        }
        return null;
      };
      const lock = () => { const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body || document.documentElement); return h.overflowY === 'hidden' || b.overflowY === 'hidden' || b.position === 'fixed'; };
      let prev = sig(), cov = cover(), run = running(), pend = pendImg(), stable = false;
      while (left(Math.max(cap, cov ? coverCap : 0)) > 0) {
        await sleep(150); const s = sig(); cov = cover(); run = running(); pend = pendImg();
        stable = s === prev; prev = s;
        if (stable && !run && !pend && !cov) break;
        if (!cov && left(cap) <= 0) break;
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ms: Math.round(performance.now() - t0), capped: !(stable && !run && !pend && !cov), running: run, pendImg: pend, unstable: !stable, cover: cov, lock: lock() };
    }, { cap, coverCap });
  } catch (e) { return { error: firstLine(e.message, 120) }; }
}

// Open a URL and wait until it is really the site: retries, host-challenge wait, 429/5xx back-off, then settle().
// Returns the FINAL main-frame document response (not a challenge that cleared). Throws BlockedError when a host
// challenge never clears — the caller records the page as not measured and never measures the challenge page.
// opts: { settle: minimum wait ms (1200), settleCapMs, coverCapMs, noSettle, timeout, info: {} ← filled with details }
async function gotoStable(page, url, opts) {
  opts = opts || {};
  let first = null, last = null;
  const onResp = r => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) { const s = r.status(); if (!(s >= 300 && s < 400)) last = r; } } catch (e) { } };
  page.on('response', onResp);
  let why = null; let firstStatus = 0;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { first = await page.goto(url, { waitUntil: 'load', timeout: opts.timeout || 60000 }); if (!firstStatus && first) firstStatus = first.status(); }
      catch (e) { if (/Download is starting/i.test(e.message) || attempt === 2) throw e; await page.waitForTimeout(3000 * (attempt + 1)); continue; }
      for (let i = 0; i < 12; i++) { why = await isChallengePage(page, last || first); if (!why) break; await page.waitForTimeout(2500); }
      await page.waitForLoadState('load').catch(() => { });
      why = await isChallengePage(page, last || first);
      const r = last || first; const st = r ? r.status() : 0;
      if (!why && !(st === 429 || st >= 500)) break;
      if (!why && attempt === 2) break; // a server error that persists is the answer (LINK-03 records it)
      await page.waitForTimeout(why ? 8000 : 3000 * Math.pow(2, attempt)); // host WAF or overload: back off and retry
    }
  } finally { try { page.off('response', onResp); } catch (e) { } }
  const resp = last || first;
  if (opts.info) Object.assign(opts.info, { blocked: !!why, challenge: why, firstStatus, status: resp ? resp.status() : 0, url: page.url() });
  if (why) throw new BlockedError(`host challenge did not clear (${why}) on ${url} — route: set concurrency 1 and throttleMs ≥ 1500 in qa-target.json, ask the host to allowlist this machine's IP or pause bot protection for the QA window, or run on staging`, { status: resp ? resp.status() : 0, url });
  await page.waitForTimeout(isNil(opts.settle) ? 1200 : opts.settle);
  if (!opts.noSettle) { const s = await settle(page, { capMs: opts.settleCapMs || 4000, coverCapMs: opts.coverCapMs }); if (opts.info) opts.info.settle = s; }
  return resp;
}

// Password / basic-auth / sign-in gate in front of the site. Returns { type, evidence, weak?, page? } or null.
// opts.probe = { title, textHash } of the 404 probe page: a password field on a page identical to it means every URL is gated.
async function detectGate(page, resp, base, opts) {
  opts = opts || {};
  const st = resp ? resp.status() : 0; const hd = resp ? resp.headers() : {};
  let dom = {};
  try {
    dom = await page.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const q = s => document.querySelector(s);
      const t = (document.body && document.body.innerText) || '';
      let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
      return {
        webflow: !!q('form[action*="/.wf_auth"], .w-password-page'),
        wpPlugin: !!q('#password-protected-form, form[action*="password-protected"]'),
        wpPostPass: !!q('form.post-password-form, form[action*="action=postpass"]'),
        wpLogin: !!q('form#loginform[action*="wp-login.php"]') && !q('main article, main section'),
        shopify: !!q('form[action$="/password"] input[type=password]'),
        pwd: [...document.querySelectorAll('input[type=password]')].some(vis),
        title: document.title, textLen: t.length, textHash: h,
      };
    });
  } catch (e) { dom = {}; }
  if (st === 401 || st === 407 || hd['www-authenticate']) return { type: dom.webflow ? 'webflow-password' : 'http-auth', evidence: `HTTP ${st}${hd['www-authenticate'] ? ' www-authenticate: ' + String(hd['www-authenticate']).slice(0, 40) : ''}` };
  if (dom.webflow) return { type: 'webflow-password', evidence: 'platform password form (/.wf_auth)' };
  if (dom.wpPlugin) return { type: 'wp-password-plugin', evidence: 'site password form (password plugin)' };
  if (dom.shopify) return { type: 'shopify-password', evidence: 'storefront password form' };
  if (dom.wpLogin) return { type: 'wp-login', evidence: 'redirected to the WordPress sign-in form' };
  try { const o = new URL(page.url()); const b = new URL(base + '/'); if (twin(o.hostname) !== twin(b.hostname)) return { type: 'redirect-off-site', evidence: `landed on ${o.origin} (sign-in / SSO?)` }; } catch (e) { }
  if (dom.wpPostPass) return { type: 'page-password', evidence: 'this page is password-protected (post password form)', page: true };
  if (dom.pwd && opts.probe && opts.probe.textHash === dom.textHash && opts.probe.title === dom.title) return { type: 'password-form', evidence: 'every URL renders the same page with a password field' };
  if (dom.pwd && dom.textLen < 600) return { type: 'password-form', evidence: 'short page with a password field', weak: true };
  return null;
}
// For detectGate opts.probe: title + text hash of the current page (e.g. the 404 probe).
async function pageFingerprint(page) { try { return await page.evaluate(() => { const t = (document.body && document.body.innerText) || ''; let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return { title: document.title, textHash: h }; }); } catch (e) { return null; } }

// "<div class=...> intercepts pointer events" in a Playwright action error → the covering element, or null
function coveredBy(err) { const m = String((err && err.message) || err || '').match(/(<[^\n]*?>)[^\n]*?intercepts pointer events/); return m ? m[1].slice(0, 80) : null; }

// Pixel ink box of the text inside a field screenshot (text vertical position, FORM-10). Decoded inside a browser page,
// so no image library is needed and the decoder is the same on every OS.
// pngBase64: element screenshot (Buffer or base64). box (CSS px): { w, h, bt, bb, bl, br, pl, pr, align, textW }
//   w/h = element size; b* = border widths; p* = horizontal paddings; align = computed text-align; textW = probe text width.
// Returns { top, bottom, touchesEdge } in CSS px from the inner border box, or null when no ink is found.
async function inkRows(page, pngBase64, box) {
  const b64 = Buffer.isBuffer(pngBase64) ? pngBase64.toString('base64') : String(pngBase64);
  try {
    return await page.evaluate(async ({ b64, box }) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const W = bmp.width, H = bmp.height; const c = new OffscreenCanvas(W, H); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, W, H).data; const sx = W / box.w, sy = H / box.h;
      const bl = box.bl || 0, br = box.br || 0, bt = box.bt || 0, bb = box.bb || 0, pl = box.pl || 0, pr = box.pr || 0;
      const inner = box.w - bl - br - pl - pr; const tw = Math.min(inner, (box.textW || inner * 0.5) + 2);
      let cx0 = bl + pl; if (/center/.test(box.align || '')) cx0 = bl + pl + (inner - tw) / 2; else if (/right|end/.test(box.align || '')) cx0 = box.w - br - pr - tw;
      const X0 = Math.max(0, Math.floor(cx0 * sx)), X1 = Math.min(W, Math.ceil((cx0 + tw) * sx));
      const Y0 = Math.max(0, Math.floor(bt * sy)), Y1 = Math.min(H, Math.ceil((box.h - bb) * sy));
      const counts = new Map(); let best = null, bestN = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const i = (y * W + x) * 4; const k = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3); const n = (counts.get(k) || 0) + 1; counts.set(k, n); if (n > bestN) { bestN = n; best = i; } }
      if (best === null) return null;
      const r0 = d[best], g0 = d[best + 1], b0 = d[best + 2];
      const ink = y => { for (let x = X0; x < X1; x++) { const i = (y * W + x) * 4; if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 48) return true; } return false; };
      let first = -1, last = -1; for (let y = Y0; y < Y1; y++) if (ink(y)) { if (first < 0) first = y; last = y; }
      if (first < 0) return null;
      return { top: +((first - Y0) / sy).toFixed(2), bottom: +((Y1 - 1 - last) / sy).toFixed(2), touchesEdge: first === Y0 || last === Y1 - 1 };
    }, { b64, box });
  } catch (e) { return null; }
}

// Node-side HTTP from this machine (proxy / TLS inspection breaks it while the browser still works).
const NODE_NET_HINT = 'Node HTTP is blocked on this machine (proxy / TLS inspection): set NODE_USE_ENV_PROXY=1 (recent Node) with HTTPS_PROXY, NODE_EXTRA_CA_CERTS=<corporate CA .pem>, or NODE_OPTIONS=--use-system-ca — browser-side checks are not affected';
async function probeNodeNet(cfg) {
  const r = await getUrl(cfg.base + '/', { cfg, redirect: 'manual', head: true, timeoutMs: 15000 });
  return r.status > 0 ? { ok: true, status: r.status } : { ok: false, code: r.error, hint: NODE_NET_HINT };
}
const interceptor = coveredBy;

// ------------------------------------------------------------------------------------------------ cookie / consent overlays
// Page-side init script (ctx.addInitScript): hides consent tools — vendor roots + any fixed/sticky cookie|consent|gdpr
// element outside header/nav/footer — on every navigation, before site scripts run. Constructed stylesheets are not
// blocked by a Content-Security-Policy. Never clicks Accept: the audit gives no consent. window.__qaHidden lists what was hidden.
function consentHider(arg) {
  try {
    const hidden = (window.__qaHidden = window.__qaHidden || []);
    const css = arg && arg.css; const generic = arg && arg.generic;
    const addSheet = () => { try { if (!css || window.__qaConsentSheet) return; const s = new CSSStyleSheet(); s.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; window.__qaConsentSheet = s; } catch (e) { } };
    const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 80);
    const sweep = () => {
      addSheet(); if (!generic || !document.body) return;
      for (const el of document.querySelectorAll('[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=gdpr i], [class*=gdpr i]')) {
        if (el.__qaSeen) continue; el.__qaSeen = 1;
        if (el.closest('header, nav, [role=banner], [role=navigation], footer')) continue;
        let fixed = false; for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; } }
        if (!fixed) continue;
        el.style.setProperty('display', 'none', 'important'); hidden.push(desc(el));
      }
    };
    let queued = false; const later = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; sweep(); }, 50); };
    const observe = () => { try { new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { } };
    addSheet(); document.addEventListener('DOMContentLoaded', sweep); window.addEventListener('load', sweep);
    if (document.documentElement) observe(); else document.addEventListener('readystatechange', observe, { once: true });
  } catch (e) { }
}
async function addConsentHiding(ctx, cfg) {
  const sel = [cfg.selectors.consent, cfg.selectors.ignoreOverlays].filter(Boolean).join(', ');
  await ctx.addInitScript(consentHider, { css: sel ? sel + '{display:none!important}' : '', generic: true });
}
// After load: click a reject / necessary-only / close button if one shows (never accept), hide ignoreOverlays, then
// report fixed overlays that still cover the page. Returns { dismissed, overlays: [{sel,w,h,pct,center,points}], blocker, error }.
// blocker = the first overlay covering ≥50% of the viewport or its centre: interaction results under it are not valid.
async function settleOverlays(page, cfg) {
  const out = { dismissed: null, overlays: [], blocker: null };
  try {
    if (cfg.selectors.dismiss) {
      const m = page.locator(cfg.selectors.dismiss).filter({ visible: true }).first();
      if (await m.count()) {
        try { const d = await m.evaluate(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : ''))); await m.click({ timeout: 2000 }); await page.waitForTimeout(600); out.dismissed = d; }
        catch (e) { out.dismissed = 'click failed: ' + firstLine(e.message, 60); }
      }
    }
    if (cfg.selectors.ignoreOverlays) await page.evaluate(css => { try { const s = new CSSStyleSheet(); s.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; } catch (e) { } }, cfg.selectors.ignoreOverlays + '{display:none!important}');
    out.overlays = await page.evaluate(burgerSel => {
      const vw = innerWidth, vh = innerHeight; const items = [];
      const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 80);
      const hits = []; for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) hits.push(document.elementFromPoint(vw * fx, vh * fy));
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (el.closest('header, [role=banner]')) continue;
        try { if (burgerSel && el.querySelector(burgerSel)) continue; } catch (e) { }
        const r = el.getBoundingClientRect(); const pct = Math.round(Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh) * 100);
        if (pct < 15) continue;
        // center: covers the viewport centre; points: how many of 5 sample points (centre + quarter points) it covers
        items.push({ sel: desc(el), w: Math.round(r.width), h: Math.round(r.height), pct, center: !!hits[0] && el.contains(hits[0]), points: hits.filter(x => x && el.contains(x)).length });
      }
      return items.filter((x, i, a) => a.findIndex(y => y.sel === x.sel) === i);
    }, cfg.selectors.burger);
    out.blocker = out.overlays.find(o => o.pct >= 50 || o.center) || null;
  } catch (e) { out.error = firstLine(e.message, 100); }
  return out;
}

// ------------------------------------------------------------------------------------------------ platform
// Positive markers only. static vs other cannot be told from markup alone — the caller decides.
function detectPlatformFromHtml(html, url) {
  const h = String(html || ''); const ev = [];
  if (/<html[^>]*\sdata-wf-(site|page)=/i.test(h)) ev.push('html[data-wf-site]');
  if (/(src|href)=["'][^"']*(website-files\.com|webflow\.js)/i.test(h)) ev.push('webflow assets');
  try { if (/\.webflow\.io$/i.test(new URL(url).hostname)) ev.push('*.webflow.io host'); } catch (e) { }
  if (ev.length) return { platform: 'webflow', evidence: ev };
  if (/(src|href)=["'][^"']*\/wp-(content|includes)\//i.test(h)) ev.push('/wp-content/ assets');
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i.test(h)) ev.push('generator WordPress');
  if (/<link[^>]+rel=["']https:\/\/api\.w\.org\/["']/i.test(h)) ev.push('api.w.org link');
  if (ev.length) return { platform: 'wordpress', evidence: ev };
  return { platform: null, evidence: [] };
}

// ------------------------------------------------------------------------------------------------ page inventory
function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (m, n, d, x) => d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[n.toLowerCase()]);
}
const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/loc>/gi;
// Page list for the run. Never fails silently: every source tried, every error and every dropped host is returned.
// opts: { page, ctx } — a Playwright page already on cfg.base (after gotoStable) / its context: fetches then use the
//        browser network stack (OS proxy and certificates, host-challenge cookie). Without them: Node fetch.
// Returns { base, pages, source: 'config'|'cli'|'local-dir'|'sitemap'|'crawl'|'none', explicit, sitemaps, tried, log,
//           warnings, errors, dropped: {host: n}, skipped: [urls], blocked, unreachable, capped }
// source 'none' = only "/" was found: with decisions.singlePage false that is an incomplete inventory (RUN-03 not run).
async function discoverPagesInfo(cfg, opts) {
  opts = opts || {};
  const info = { base: cfg.base, pages: ['/'], source: 'none', explicit: false, sitemaps: [], tried: [], log: [], warnings: [], errors: [], dropped: {}, skipped: [], blocked: false, unreachable: null, capped: null };
  if (cfg.pages && cfg.pages.length) return Object.assign(info, { pages: [...new Set(cfg.pages.map(normPath).filter(Boolean))], source: cfg.pagesFrom || 'config', explicit: true });
  if (cfg.local && cfg._localPages) return Object.assign(info, { pages: sortPages(cfg._localPages), source: 'local-dir', explicit: true });
  const origin = new URL(cfg.base + '/').origin; const bp = basePathOf(cfg);
  const rel = u => { try { const x = new URL(u); return twin(x.host) === twin(new URL(origin).host) ? x.pathname + x.search : x.href; } catch (e) { return u; } };
  const found = new Set(['/']);
  const route = { cfg, page: opts.page, ctx: opts.ctx, fallbackToNode: true };
  const get = async u => {
    for (let i = 0; i < 3; i++) {
      const r = await getUrl(u, route);
      if (r.status === 404 || r.status === 410) { info.log.push(`${rel(u)} ${r.status}`); return null; }
      if (r.blocked) { info.blocked = true; if (i === 2 || info.robotsBlocked) { info.log.push(`${rel(u)} ${r.status} challenge`); info.errors.push(`${rel(u)}: host challenge`); return null; } await wait(3000 * (i + 1)); continue; }
      if (r.status >= 200 && r.status < 300) return r;
      const why = r.status === -1 ? r.error : 'HTTP ' + r.status;
      if (i === 2 || info.unreachable || (r.status >= 400 && r.status < 500 && r.status !== 429)) { info.log.push(`${rel(u)} ${why}`); info.errors.push(`${rel(u)}: ${why}`); return null; }
      await wait(1500 * (i + 1));
    }
    return null;
  };
  const visited = new Set();
  const walk = async (u, depth) => {
    if (visited.has(u)) return true; visited.add(u); info.tried.push(rel(u));
    const r = await get(u); if (!r) return false;
    const t = r.text || '';
    if (!/<(urlset|sitemapindex)\b/i.test(t)) { info.log.push(`${rel(u)} ${r.status} not a sitemap`); info.warnings.push(`${rel(u)}: answered ${r.status} but is not a sitemap (HTML or challenge page?)`); return false; }
    info.log.push(`${rel(u)} ${r.status}`); info.sitemaps.push(rel(u));
    const isIndex = /<sitemapindex\b/i.test(t);
    const locs = [...t.matchAll(LOC_RE)].map(m => decodeEntities(m[1]).trim()).filter(Boolean).sort(byStr);
    for (const l of locs) {
      let url; try { url = new URL(l, origin + '/'); } catch (e) { continue; }
      const same = siteHosts(cfg).has(hostKey(url));
      if (!same) { info.dropped[url.host] = (info.dropped[url.host] || 0) + 1; if (info.skipped.length < 50) info.skipped.push(url.href); continue; }
      if (isIndex || /\.xml(\.gz)?$/i.test(url.pathname)) { if (depth < 3) await walk(origin + url.pathname + url.search, depth + 1); continue; }
      const p = pagePath(url.href, cfg, { search: true });
      if (p && !NOT_PAGE.test(url.pathname)) found.add(p);
    }
    return true;
  };
  // 1. robots.txt Sitemap: lines, then the standard paths. The FIRST readable sitemap wins (never "first with >1 page").
  const cands = [];
  const robots = await getUrl(origin + '/robots.txt', route);
  if (robots.status === -1) { info.unreachable = robots.error; info.errors.push(`site unreachable from this machine: ${robots.error}`); }
  if (robots.status === 200 && !robots.blocked) {
    for (const m of (robots.text || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
      let u; try { u = new URL(m[1].trim(), origin + '/'); } catch (e) { continue; }
      if (!siteHosts(cfg).has(hostKey(u))) info.warnings.push(`robots.txt lists a sitemap on ${u.host}; read at ${origin}${u.pathname} instead`);
      cands.push(origin + u.pathname + u.search);
    }
  } else info.log.push(`/robots.txt ${robots.status === -1 ? robots.error : robots.status}${robots.blocked ? ' challenge' : ''}`);
  if (robots.blocked) { info.blocked = true; info.robotsBlocked = true; } // the host challenges Node requests: one try per sitemap path, no back-off
  for (const s of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.xml', '/wp-sitemap.xml', '/sitemaps.xml']) cands.push(origin + bp + s);
  let source = null;
  for (const c of [...new Set(cands)]) { if (await walk(c, 0)) { source = 'sitemap'; break; } }
  // 2. no usable sitemap: follow same-site links from the home page (depth cfg.crawlDepth, cap cfg.crawlMax)
  if (found.size <= 1 && !info.unreachable) {
    const cap = cfg.crawlMax || 200; const depthMax = cfg.crawlDepth || 2;
    const linkOk = url => /^https?:$/.test(url.protocol) && siteHosts(cfg).has(hostKey(url)) && !url.search && !NOT_PAGE.test(url.pathname) && !/\/(wp-admin|wp-login|wp-json|feed|xmlrpc|cdn-cgi)(\/|\.|$)/i.test(url.pathname);
    const crawled = new Set(['/']); let level = ['/']; let usedDom = false;
    for (let d = 0; d < depthMax && level.length && crawled.size < cap; d++) {
      const next = [];
      for (const p of level) {
        if (crawled.size >= cap) break;
        let hrefs = [];
        if (d === 0 && opts.page) { try { const pu = new URL(opts.page.url()); if (twin(pu.host) === twin(new URL(origin).host)) { hrefs = await opts.page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href)); usedDom = true; } } catch (e) { hrefs = []; } }
        if (!hrefs.length) {
          const r = await get(origin + bp + p); if (!r) continue;
          if (!/text\/html|application\/xhtml/i.test((r.headers || {})['content-type'] || '') && !/<html[\s>]/i.test(r.text || '')) continue;
          hrefs = [...String(r.text).matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"'#]+)/gi)].map(m => decodeEntities(m[1]));
          if (cfg.throttleMs) await wait(cfg.throttleMs);
        }
        for (const h of hrefs.sort(byStr)) {
          let url; try { url = new URL(h, origin + bp + p); } catch (e) { continue; }
          if (!linkOk(url)) continue;
          const q = pagePath(url.href, cfg); if (!q || crawled.has(q)) continue;
          if (crawled.size >= cap) { info.capped = `crawl capped at ${cap}`; break; }
          crawled.add(q); next.push(q);
        }
      }
      level = next.sort(byStr);
    }
    if (crawled.size > 1) { crawled.forEach(p => found.add(p)); source = 'crawl'; info.warnings.push(`no usable sitemap — pages found by following links from / (depth ${depthMax}${usedDom ? ', rendered home page' : ''}); links built only by JS on inner pages are not seen`); }
    if (info.capped) info.warnings.push(info.capped);
  }
  let pages = sortPages(found);
  // Style-guide / design-system pages are the reference, not a page under test (SKILL.md practice rule) — at stage 2 too.
  // Only discovered pages are filtered; an explicit "pages" list is taken as given. reference.exclude: regex, or false = off.
  const exRe = pageExcludeRe(cfg);
  if (exRe) { const ex = pages.filter(p => p !== '/' && exRe.test(p)); if (ex.length) { pages = pages.filter(p => !ex.includes(p)); info.excluded = ex; info.warnings.push(`left out as reference pages (reference.exclude ${exRe}): ${ex.slice(0, 10).join(', ')}${ex.length > 10 ? ` … +${ex.length - 10}` : ''}`); } }
  const cap = cfg.maxPages || null;
  if (cap && pages.length > cap) { info.warnings.push(`capped ${cap} of ${pages.length} pages (maxPages)`); info.capped = `${cap} of ${pages.length}`; pages = pages.slice(0, cap); }
  const dh = Object.keys(info.dropped).sort(byStr);
  if (dh.length) info.warnings.push('sitemap URLs on other hosts ignored: ' + dh.map(h => `${h}×${info.dropped[h]}`).join(', ') + ` (base is ${new URL(origin).host}; add the host to "sameHosts" if it is the same site)`);
  info.pages = pages; info.source = pages.length > 1 ? (source || 'crawl') : 'none';
  return info;
}
const discoverInventory = discoverPagesInfo;
async function discoverPages(cfg, opts) { return (await discoverPagesInfo(cfg, opts)).pages.slice(); } // always a fresh array
const discoverPageList = discoverPages;

// Follow redirects on the base once. Same site (http→https, www/non-www): cfg.base becomes the final origin + the typed
// path (cfg.baseTyped keeps what was typed). Another host: nothing changes, { offsite: true } — the caller stops
// (sign-in / SSO gate or a wrong domain). Network error: { error }, nothing changes.
// Returns { typed, final, changed, offsite, status, blocked, error, note }.
async function resolveBase(cfg, opts) {
  opts = opts || {};
  const typed = new URL(cfg.base + '/');
  // follow the redirect chain hop by hop, so the final host is known even when it does not answer
  let cur = typed.href, r = null, hops = 0;
  for (; hops < 10; hops++) {
    r = await getUrl(cur, { cfg, ctx: opts.ctx, redirect: 'manual', fallbackToNode: true });
    const loc = r.headers && r.headers.location;
    if (!(r.status >= 300 && r.status < 400 && loc)) break;
    try { cur = new URL(loc, cur).href; } catch (e) { break; }
  }
  const out = { typed: cfg.base, final: cfg.base, changed: false, offsite: false, status: r.status, hops, blocked: !!r.blocked, error: r.status === -1 ? r.error : null, note: null };
  let fin; try { fin = new URL(cur); } catch (e) { return out; }
  if (fin.origin === typed.origin) return out;
  if (twin(fin.hostname) !== twin(typed.hostname) || (fin.port || '') !== (typed.port || '')) {
    out.offsite = true; out.final = fin.origin + fin.pathname;
    out.note = `base ${cfg.base} redirects to ${fin.origin} (another host: sign-in / SSO or a wrong domain) — set "base" to the site's final URL or provide a session`;
    return out;
  }
  if (r.status === -1) { out.note = `base ${cfg.base} redirects to ${fin.origin}, which did not answer: ${r.error}`; return out; }
  cfg.baseTyped = cfg.base; cfg.base = fin.origin + typed.pathname.replace(/\/$/, '');
  out.final = cfg.base; out.changed = true; out.note = `base ${cfg.baseTyped} redirects to ${cfg.base}; auditing ${cfg.base}`;
  return out;
}

// Template key from raw HTML (per-template sampling on large CMS sites). Platform markers first, then the URL shape.
function templateKey(html, p) {
  const h = String(html || ''); let m;
  if ((m = h.match(/<html[^>]*\sdata-wf-page=["']([^"']+)/i))) return 'wf:' + m[1];
  if ((m = h.match(/<body[^>]*\sclass=["']([^"']*)["']/i))) {
    const cl = m[1].split(/\s+/);
    if (cl.some(c => /^page-id-\d+$/.test(c))) return 'page:' + p;
    const single = cl.find(c => /^single-/.test(c) && !/^single-format-/.test(c));
    if (single) return 'wp:' + single;
    const arch = cl.find(c => /^(post-type-archive-|tax-)/.test(c)) || cl.find(c => ['category', 'tag', 'author', 'date', 'search', 'blog'].includes(c));
    if (arch) return 'wp:' + arch;
  }
  const seg = p.split('?')[0].split('/').filter(Boolean);
  return seg.length >= 2 ? 'path:/' + seg.slice(0, -1).join('/') + '/*' : 'url:' + p;
}
// Deterministic plan for big sites: every page gets the cheap content pass; heavy passes (all widths, other engines,
// interactions, weight, Safari, iOS, Lighthouse) use ≤ sample.perTemplate pages per template (stable sha1 order, so a
// new CMS item rarely changes the pick). Small sites (≤ sample.threshold) and explicit page lists are not sampled.
// Returns { all, sampled, groups: {key: {count, picked}}, probe404, settings, sampling, notes }
async function planPages(cfg, info, opts) {
  opts = opts || {};
  const s = cfg.sample || { threshold: 10, perTemplate: 3, maxPages: null, keep: [] };
  const all = sortPages(info.pages.filter(p => !/\/qa-404-/.test(p)));
  const plan = { all, sampled: all.slice(), groups: {}, probe404: probe404Path(cfg), settings: s, sampling: false, notes: [] };
  if (info.explicit || opts.full || all.length <= s.threshold) return plan;
  plan.sampling = true; const keyOf = {}; let failed = 0; let i = 0;
  const worker = async () => { while (i < all.length) { const p = all[i++]; const r = await getUrl(cfg.base + p, { cfg, page: opts.page, ctx: opts.ctx, fallbackToNode: true }); if (r.status !== 200) failed++; keyOf[p] = templateKey(r.text, p); if (cfg.throttleMs) await wait(cfg.throttleMs); } };
  await Promise.all(Array.from({ length: cfg.concurrency || 2 }, worker));
  const pagesOf = {};
  for (const p of all) { const k = keyOf[p]; (pagesOf[k] = pagesOf[k] || []).push(p); }
  const keep = new Set(['/'].concat((s.keep || []).map(normPath)));
  const picked = new Set();
  for (const k of Object.keys(pagesOf).sort(byStr)) {
    const g = pagesOf[k]; const pk = g.length <= s.perTemplate ? g.slice() : g.slice().sort((x, y) => byStr(sha1(x), sha1(y))).slice(0, s.perTemplate);
    plan.groups[k] = { count: g.length, picked: pk.sort(byStr) }; pk.forEach(p => picked.add(p));
  }
  all.forEach(p => { if (keep.has(p)) picked.add(p); });
  let sampled = sortPages(picked);
  if (s.maxPages && sampled.length > s.maxPages) {
    const keys = Object.keys(plan.groups).sort(byStr);
    const statics = keys.filter(k => plan.groups[k].count === 1).map(k => plan.groups[k].picked[0]).sort(byStr);
    const firsts = keys.map(k => plan.groups[k].picked[0]);
    const order = [...new Set(['/'].concat(statics, firsts, sampled))];
    plan.notes.push(`sample capped ${s.maxPages} of ${sampled.length}; not in the heavy passes: ${order.slice(s.maxPages).join(', ')}`);
    sampled = sortPages(order.slice(0, s.maxPages));
  }
  plan.sampled = sampled;
  plan.notes.unshift(`${all.length} URLs found → ${sampled.length} sampled for the heavy passes (${Object.keys(plan.groups).length} templates × ≤${s.perTemplate}); content checks on all ${all.length}; template detection failed for ${failed}`);
  return plan;
}
// pages.json written by qa-run: an object (plan) or an old-style array. "sampled" never includes the 404 probe.
function readPlan(OUT, cfg) {
  const f = path.join(OUT, 'pages.json'); if (!fs.existsSync(f)) return null;
  const r = tryReadJson(f, 'pages.json'); if (!r.ok) return null;
  const j = r.data;
  if (Array.isArray(j)) { const pages = sortPages(j.filter(p => !/\/qa-404-/.test(p))); return { all: pages, sampled: pages, groups: {}, probe404: cfg ? probe404Path(cfg) : null, legacy: true }; }
  if (j && Array.isArray(j.sampled)) return Object.assign({}, j, { sampled: j.sampled.filter(p => !/\/qa-404-/.test(p)) });
  if (j && Array.isArray(j.pages)) { const pages = j.pages.filter(p => !/\/qa-404-/.test(p)); return Object.assign({}, j, { all: pages, sampled: pages }); }
  return null;
}

// ------------------------------------------------------------------------------------------------ stage 1: local HTML folder
const MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', xml: 'application/xml', txt: 'text/plain; charset=utf-8', pdf: 'application/pdf', webmanifest: 'application/manifest+json' };
// Serve a folder on 127.0.0.1 (root-absolute links resolve; Range requests for <video>). The port is derived from the
// folder path so URLs are the same run after run on one machine; a busy port falls back to a free one.
function serveStatic(dir, opts) {
  opts = opts || {}; const root = path.resolve(dir); const http = require('http');
  const server = http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    let f = path.join(root, p);
    const relp = path.relative(root, f); if (relp.startsWith('..') || path.isAbsolute(relp)) { res.writeHead(403); return res.end(); }
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html'; }
    let st; try { st = fs.statSync(f); } catch (e) { const nf = path.join(root, '404.html'); res.writeHead(404, { 'content-type': MIME.html }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found'); }
    const type = MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range && st.size) {
      const start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]); const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).pipe(res);
  });
  const port0 = isNil(opts.port) ? 20000 + (parseInt(sha1(samePathOnWin(root)).slice(0, 4), 16) % 9000) : opts.port;
  return new Promise((resolve, reject) => {
    const ok = () => { const port = server.address().port; resolve({ origin: `http://127.0.0.1:${port}`, port, server, stop: () => new Promise(r => server.close(() => r())) }); };
    server.once('error', e => { if (e.code === 'EADDRINUSE' && port0 !== 0) server.listen(0, '127.0.0.1', ok); else reject(e); });
    server.listen(port0, '127.0.0.1', ok);
  });
}
// Pages that are the design reference (style guide, design system) and never a page under test.
// qa-target.json reference.exclude: a regex string (case-insensitive), or false to switch the default off.
const DEFAULT_PAGE_EXCLUDE = /style-?guide|design-system/i;
function pageExcludeRe(cfg) {
  const x = cfg && cfg.reference ? cfg.reference.exclude : null;
  if (x === false) return null;
  if (isNil(x) || x === '') return DEFAULT_PAGE_EXCLUDE;
  try { return new RegExp(String(x), 'i'); } catch (e) { console.error(`reference.exclude is not a valid regular expression: ${e.message}`); process.exit(1); }
}
function listLocalPages(dir, exclude) {
  const root = path.resolve(dir); const out = []; const ex = exclude === false ? /$^/ : exclude ? new RegExp(exclude, 'i') : DEFAULT_PAGE_EXCLUDE;
  const walkDir = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => byStr(a.name, b.name))) {
      if (e.name.startsWith('.') || ['node_modules', 'qa-out'].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walkDir(f);
      else if (/\.html?$/i.test(e.name) && !/^404\.html?$/i.test(e.name)) { const rel = path.relative(root, f).split(path.sep).join('/'); if (ex.test(rel)) continue; out.push(encodeURI('/' + rel.replace(/(^|\/)index\.html?$/i, '$1'))); }
    }
  };
  walkDir(root); return sortPages(out);
}
// --local <dir> / "local": serve the folder, point cfg.base at it, list its pages (style-guide pages excluded:
// reference.exclude). Returns { stop } — call it in finally. Store paths, not URLs (the origin carries the port).
async function resolveTarget(cfg) {
  if (!cfg.local) return { stop: async () => { } };
  if (!fs.existsSync(cfg.local)) { console.error(`local folder not found: ${cfg.local}`); process.exit(1); }
  const srv = await serveStatic(cfg.local);
  cfg.base = srv.origin; cfg.localOrigin = srv.origin; cfg.stage = '1';
  cfg._localPages = listLocalPages(cfg.local, cfg.reference && cfg.reference.exclude);
  return srv;
}

// ------------------------------------------------------------------------------------------------ environment / results
let SKILL_CACHE = null;
function skillVersion() {
  if (SKILL_CACHE) return SKILL_CACHE;
  const h = crypto.createHash('sha1'); let files = [];
  try { files = fs.readdirSync(__dirname).filter(f => /\.(cjs|js|swift)$/.test(f) || /^package(-lock)?\.json$/.test(f)).sort(byStr); } catch (e) { }
  for (const f of files) { try { h.update(f + '\0' + fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n') + '\0'); } catch (e) { } }
  let version = null, playwright = null;
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; } catch (e) { }
  try { playwright = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'playwright-core', 'package.json'), 'utf8')).version; } catch (e) { }
  SKILL_CACHE = { version, hash: h.digest('hex').slice(0, 12), files: files.length, playwright };
  return SKILL_CACHE;
}
// Fingerprint stored in every results file (_env): two manifests are comparable only when these match.
// runEnv(a, cfg) is the same with the arguments the other way round.
function runEnv(a, cfg) { return envInfo(cfg, a); }
function envInfo(cfg, a) {
  const flags = {}; for (const [k, v] of Object.entries(a || {})) if (!['out', 'config', '_', 'item', 'note', 'storage-state'].includes(k)) flags[k] = v;
  const c = cfg || {};
  return {
    os: process.platform, osRelease: os.release(), arch: process.arch, node: process.versions.node,
    skill: skillVersion(),
    base: c.base || null, baseTyped: c.baseTyped || null,
    config: c._configHash || null, configFile: c._configFile ? path.basename(c._configFile) : null,
    flags, locale: c.locale || null, timezoneId: c.timezoneId || null,
    widths: c.widths || null, widthsAdded: c.widthsAdded || null, enginesWanted: c.engines || null, enginesAdded: c.enginesAdded || null,
    chromiumWanted: c.chromium || null, pagesFrom: c.pagesFrom || null, stage: c.stage || null, platform: c.platform || null,
    engines: {},
  };
}
// Results container shared by every instrument: { ID: { items:[], notes:[], ran?, tested?, na?, notRun?, status? } }
//   R.ran(id)         the instrument looked for this check        R.tested(id)  …and exercised ≥1 real subject
//   R.add / R.ask     a finding (marks ran + tested)               R.na(id, why) the subject is absent (reason kept)
//   R.notRun(id, why) could not run, fully or partly — reasons are appended, never overwritten; a row with notRun is never ✅
//   R.note(id, n)     evidence text
// R._env is the run fingerprint (envInfo); engines launched through this lib are added on save.
function makeResults(tool, cfg, a) {
  const R = { _tool: tool, _at: new Date().toISOString(), _env: envInfo(cfg, a), checks: {} };
  const startMs = Date.now(); R.startMs = () => startMs; // _timing (start / end / total ms) is stamped by saveResults
  const get = id => (R.checks[id] = R.checks[id] || { items: [], notes: [] });
  R.ran = id => { get(id).ran = true; };
  R.tested = id => { const c = get(id); c.ran = true; c.tested = true; };
  R.add = (id, item) => { R.tested(id); get(id).items.push(item); };
  R.ask = (id, item) => { item = item || {}; item.ask = true; R.add(id, item); };
  R.na = (id, why) => { const c = get(id); why = String(why); if (!c.na) c.na = why; else if (c.na.indexOf(why) === -1) c.na += '; ' + why; };
  R.note = (id, n) => { get(id).notes.push(n); };
  R.notRun = (id, why) => { const c = get(id); why = String(why); if (!c.notRun) c.notRun = why; else if (c.notRun.indexOf(why) === -1) c.notRun += '; ' + why; };
  return R;
}
// Atomic write (a crash never leaves a truncated results file); stamps the run id when OUT holds a run.json.
function saveResults(R, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const f = path.join(outDir, `results-${R._tool}.json`);
  const plain = {}; for (const k of Object.keys(R)) if (typeof R[k] !== 'function') plain[k] = R[k];
  plain._env = Object.assign({}, plain._env || {}); plain._env.engines = Object.assign({}, ENGINES_USED, plain._env.engines || {});
  plain._finishedAt = new Date().toISOString();
  // time report: every tool's results carry start / end / total ms (manifest.cjs prints them in the time table);
  // a tool may add _timing.why (what the time was spent on: pages × runs …) and _timing.steps
  if (typeof R.startMs === 'function') { const t = Object.assign({ tool: R._tool, startMs: R.startMs() }, plain._timing || {}); t.endMs = Date.now(); t.totalMs = t.endMs - t.startMs; plain._timing = t; }
  const run = readRunFile(outDir);
  if (run) {
    plain._runId = run.runId; plain._base = run.base;
    if (!(run.tools || []).includes(R._tool)) { run.tools = (run.tools || []).concat(R._tool); try { writeJsonAtomic(path.join(outDir, 'run.json'), run); } catch (e) { } }
  }
  writeJsonAtomic(f, JSON.stringify(plain, null, 1));
  return f;
}
// Output folder of this run. Refuses a folder inside the skill (it is shared by every project).
function outDirFrom(a) {
  const out = path.resolve((a && a.out && a.out !== true && String(a.out)) || path.join(process.cwd(), 'qa-out'));
  if (insideSkill(out) && process.env.QA_ALLOW_SKILL_OUT !== '1') {
    console.error(`Output folder ${out} is inside the skill folder ${SKILL_ROOT}, which every project shares.\nRun qa-check instruments from the PROJECT folder (where qa-target.json lives) and call the scripts by their full path, e.g.\n  node "${path.join(__dirname, 'qa-run.cjs')}" --out qa-out`);
    process.exit(1);
  }
  return out;
}
// Crash guard: an exception never loses what was measured. Rows this tool owns that did not run become NOT RUN with the
// error; rows that did run get a "partial" note. Then results are saved, browsers closed, and the process exits 3.
function guard(R, OUT, ids) {
  let fired = false;
  const h = e => {
    if (fired) return; fired = true;
    const msg = firstLine((e && (e.message || e.stack)) || e, 160);
    for (const id of ids || []) { const c = R.checks[id]; if (c && c.ran) R.notRun(id, 'partial: ' + R._tool + ' crashed: ' + msg); else R.notRun(id, R._tool + ' crashed: ' + msg); }
    R._crashed = msg; try { saveResults(R, OUT); } catch (er) { }
    process.stderr.write(`${R._tool} crashed: ${msg}\n`);
    setTimeout(() => process.exit(EXIT_NOT_RUN), 5000).unref();
    closeAllBrowsers().then(() => process.exit(EXIT_NOT_RUN), () => process.exit(EXIT_NOT_RUN));
  };
  process.on('uncaughtException', h); process.on('unhandledRejection', h);
  return h;
}

// ------------------------------------------------------------------------------------------------ run identity (one run = one OUT folder state)
const RUN_ARTIFACTS = /^(results-.*\.json|manifest\.(md|json)|run\.json|env\.json|pages(-source|-plan|-inventory)?\.json|static-.*\.json|texts\.json|words\.txt|spell-candidates.*\.json|cspell\.qa\.json|snapshot\.json|fields-.*\.json|gate\.json|progress\.json|wp-admin.*\.(json|js))$/;
const RUN_DIRS = ['shots', 'lighthouse', 'journal'];
function readRunFile(OUT) { const f = path.join(OUT, 'run.json'); if (!fs.existsSync(f)) return null; const r = tryReadJson(f, 'run.json'); return r.ok ? r.data : null; }
// Start a new run: earlier artifacts are MOVED (never deleted) to OUT/_prev/<old runId>/, then run.json is written.
function startRun(OUT, cfg, opts) {
  opts = opts || {}; fs.mkdirSync(OUT, { recursive: true });
  const old = readRunFile(OUT);
  const names = fs.readdirSync(OUT).filter(n => RUN_ARTIFACTS.test(n) || RUN_DIRS.includes(n)).sort(byStr);
  if (names.length) {
    const newest = Math.max.apply(null, names.map(n => { try { return fs.statSync(path.join(OUT, n)).mtimeMs; } catch (e) { return 0; } }));
    const tag = old && old.runId ? old.runId : 'legacy-' + new Date(newest).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    let dest = path.join(OUT, '_prev', tag); let k = 1; while (fs.existsSync(dest)) dest = path.join(OUT, '_prev', tag + '-' + (++k));
    fs.mkdirSync(dest, { recursive: true });
    for (const n of names) { try { fs.renameSync(path.join(OUT, n), path.join(dest, n)); } catch (e) { process.stderr.write(`could not archive ${n}: ${e.message}\n`); } }
    process.stderr.write(`previous run archived to ${dest}\n`);
  }
  const now = new Date(); const sv = skillVersion();
  const run = { runId: now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + crypto.randomBytes(2).toString('hex'), base: cfg.base, cfgSha: cfg._configHash || null, scriptsSha: sv.hash, skillVersion: sv.version, startedAt: now.toISOString(), platform: process.platform, node: process.versions.node, startedBy: opts.tool || null, tools: [] };
  writeJsonAtomic(path.join(OUT, 'run.json'), run);
  return run;
}
function siteKey(base) { return base ? hostKey(base) + basePathOf({ base }) : ''; }
function currentRun(OUT, cfg) { const r = readRunFile(OUT); if (!r) return null; if (cfg && cfg.base && r.base && siteKey(r.base) !== siteKey(cfg.base) && siteKey(r.base) !== siteKey(cfg.baseTyped)) return null; return r; }
// The run this tool joins. No run.json → a new run. run.json for another site → refuse (one OUT folder per site).
function requireRun(OUT, cfg, opts) {
  const r = readRunFile(OUT);
  if (!r) return startRun(OUT, cfg, opts);
  if (!currentRun(OUT, cfg)) { console.error(`${OUT} holds a run for ${r.base}, not ${cfg.base}. Use one output folder per site (e.g. --out qa-out-staging) or start a new run with snapshot.cjs.`); process.exit(1); }
  return r;
}

// ------------------------------------------------------------------------------------------------ run locks
// One heavy instrument per site at a time, and Lighthouse only on an idle machine. A lock is live while its process is
// alive (same host) and its file was touched in the last 10 minutes (heartbeat every minute). QA_NO_LOCK=1 disables.
const LOCK_STALE_MS = 10 * 60000; const HELD = []; let HB = null; let HOOKED = false;
const lockDirPath = () => path.join(os.tmpdir(), 'qa-check-locks');
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function readLock(f) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); j._mtime = fs.statSync(f).mtimeMs; j._file = f; return j; } catch (e) { return null; } }
function ours(j) { return !!j && j.pid === process.pid && j.host === os.hostname(); }
function lockLive(j) { if (!j || ours(j)) return false; const fresh = Date.now() - j._mtime < LOCK_STALE_MS; return j.host === os.hostname() ? fresh && pidAlive(j.pid) : fresh; }
function takeLock(f, rec) {
  for (let i = 0; i < 2; i++) {
    try { fs.writeFileSync(f, JSON.stringify(rec), { flag: 'wx' }); HELD.push(f); return null; }
    catch (e) {
      if (e.code !== 'EEXIST') return null; // cannot lock (read-only temp folder): never block the run for that
      const j = readLock(f); if (ours(j)) return null;
      if (lockLive(j)) return j;
      try { fs.unlinkSync(f); process.stderr.write(`note: stale lock removed (${j ? j.tool + ' pid ' + j.pid : f})\n`); } catch (er) { }
    }
  }
  return null;
}
function releaseLocks() { while (HELD.length) { const f = HELD.pop(); const j = readLock(f); if (!j || ours(j)) { try { fs.unlinkSync(f); } catch (e) { } } } if (HB) { clearInterval(HB); HB = null; } }
function hookLockRelease() {
  if (HOOKED) return; HOOKED = true;
  process.on('exit', releaseLocks);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) { try { process.on(sig, () => { releaseLocks(); if (process.listenerCount(sig) <= 1) process.exit(130); }); } catch (e) { } }
  HB = setInterval(() => { const t = new Date(); HELD.forEach(f => { try { fs.utimesSync(f, t, t); } catch (e) { } }); }, 60000); HB.unref();
}
function refuseLock(tool, h) {
  releaseLocks();
  console.error(`qa-check: ${tool} NOT started — ${h.tool} (pid ${h.pid}${h.host !== os.hostname() ? ' on ' + h.host : ''}, since ${h.startedAt}) is already running on ${h.base} into ${h.out}.\nWait for its results-${h.tool}.json, or stop it: kill ${h.pid}  (Windows: taskkill /PID ${h.pid} /T /F). Never start a second heavy instrument; if a call timed out, the first process is probably still running.`);
  process.exit(EXIT_NOT_RUN);
}
function acquireLock(tool, cfg, OUT) {
  if (process.env.QA_NO_LOCK === '1') return;
  const dir = lockDirPath(); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return; }
  const rec = { pid: process.pid, host: os.hostname(), tool, base: cfg && cfg.base, out: path.resolve(OUT), cwd: process.cwd(), startedAt: new Date().toISOString() };
  const excl = path.join(dir, 'exclusive.json');
  const others = () => fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => readLock(path.join(dir, n))).filter(lockLive);
  let h;
  if (tool === 'lighthouse') {
    if ((h = others()[0])) refuseLock(tool, h);
    if ((h = takeLock(excl, rec))) refuseLock(tool, h);
    if ((h = others().find(j => j._file !== excl))) refuseLock(tool, h);
  } else {
    if ((h = readLock(excl)) && lockLive(h)) refuseLock(tool, h);
    if (cfg && cfg.base && (h = takeLock(path.join(dir, sha1(siteKey(cfg.base)).slice(0, 16) + '.json'), rec))) refuseLock(tool, h);
    fs.mkdirSync(OUT, { recursive: true });
    if ((h = takeLock(path.join(OUT, '.qa-lock.json'), rec))) refuseLock(tool, h);
    if ((h = readLock(excl)) && lockLive(h)) refuseLock(tool, h);
  }
  hookLockRelease();
}
// Live locks held by OTHER processes (machine-wide + this OUT folder): [{ tool, pid, host, base, out, startedAt }].
function othersBusy(OUT) {
  const dir = lockDirPath(); let list = [];
  try { list = fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => readLock(path.join(dir, n))); } catch (e) { list = []; }
  if (OUT) list.push(readLock(path.join(OUT, '.qa-lock.json')));
  const seen = new Set();
  return list.filter(lockLive).filter(j => { const k = j.pid + '|' + j.host; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(j => ({ tool: j.tool, pid: j.pid, host: j.host, base: j.base, out: j.out, startedAt: j.startedAt }));
}
// Short form for instruments: take this tool's lock (refuses and exits 3 when another heavy tool holds it).
function busy(OUT, tool, cfg) { return acquireLock(tool, cfg || null, OUT); }
// For tools that read another tool's output (spell, manifest): refuse while that tool is still writing OUT.
function assertIdle(OUT, who) {
  if (process.env.QA_NO_LOCK === '1') return;
  const j = readLock(path.join(OUT, '.qa-lock.json'));
  if (lockLive(j)) { console.error(`${who} refused — ${j.tool} pid ${j.pid} is still writing ${OUT}; its files would mix with the previous run. Wait for it to finish.`); process.exit(EXIT_NOT_RUN); }
}

// ------------------------------------------------------------------------------------------------ bundled CLIs (cspell, lighthouse)
// Run a CLI installed in scripts/node_modules as `node <entry>`: the same on macOS/Windows/Linux — no PATH, no .cmd
// shim, no npx, no network at run time. bundledCli returns null when the package is not installed (route: npm ci).
function bundledCli(pkg, bin) {
  const dir = path.join(__dirname, 'node_modules', pkg); const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) return null;
  let m; try { m = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch (e) { return null; }
  const rel = typeof m.bin === 'string' ? m.bin : (m.bin || {})[bin || pkg];
  return rel ? { entry: path.join(dir, rel), version: m.version, dir } : null;
}
function runCli(cli, argv, opts) {
  return require('child_process').spawnSync(process.execPath, [cli.entry].concat(argv || []), Object.assign({ encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true }, opts || {}));
}

module.exports = {
  // existing API (signatures kept)
  loadPlaywright, chromeExecutable, args, loadConfig, discoverPages, gotoStable, makeResults, saveResults, outDirFrom, CHALLENGE,
  // config & paths
  SKILL_ROOT, insideSkill, configPath, readTarget, readConfigFile, readJson, tryReadJson, writeJsonAtomic, requireDecisions,
  parsePages, normPath, sortPages, byStr, sha1, stable, TIER, REF, ENGINES, PLATFORMS, DEFAULT_SELECTORS, DEFAULT_DECISIONS,
  DATE_FORMATS, DATE_MONTHS, DATE_RE_SOURCE, classifyDate, EXIT_NOT_RUN,
  // site & inventory
  discoverPagesInfo, discoverInventory, discoverPageList, resolveBase, sameSite, siteHosts, hostKey, pagePath, sitePath,
  probe404Path, planPages, readPlan, templateKey, detectPlatformFromHtml, serveStatic, resolveTarget, listLocalPages, NOT_PAGE,
  // network
  UA, httpFetch, getUrl, hostGet, authOpts, storageStateCookies, GATE_ROUTE,
  // browsers
  nodeProblem, launchChromium, launchBrowser, launchEngine, chromiumChoice, engineChoice, closeAllBrowsers, pinned, contextOptions,
  // pages
  settle, isChallenge, isChallengePage, isChallengeBody, CHALLENGE_DOM, CHALLENGE_BODY, BlockedError, detectGate, pageFingerprint,
  coveredBy, interceptor, consentHider, addConsentHiding, settleOverlays, inkRows, NODE_NET_HINT, probeNodeNet,
  // results & run
  envInfo, runEnv, skillVersion, guard, startRun, currentRun, requireRun, acquireLock, assertIdle, releaseLocks, othersBusy, busy,
  tryPlaywright,
  // tools
  bundledCli, runCli,
};
