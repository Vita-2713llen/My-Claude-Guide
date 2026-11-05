#!/usr/bin/env node
// PERF-01 · Lighthouse lab scores — strictly SERIAL, refused while any other qa-check instrument runs on this machine
// (a parallel run once reported a home page at 43 instead of 76). Run it alone, after the other steps.
// Engine:  the Lighthouse pinned in scripts/package.json, run as `node <cli>` (no shell, no .cmd shim, no npx, no global
//          install) — the same on macOS, Windows and Linux. Missing → NOT RUN with the route (npm ci); never installed here.
// Browser: per qa-target.json "chromium" (default "bundled" = Playwright's Chromium pinned by package-lock, the most
//          repeatable), then the others: CHROME_PATH / Google Chrome, Microsoft Edge. The one used is in the evidence.
// Pages:   --pages → qa-target.json lighthouse.pages → home + every page with its own form + one page per template
//          (this run's pages.json / static data from qa-run, else template markers read from each page's HTML),
//          capped at --max (14). Pages over the cap are a ❓ with their list, never dropped silently.
// Each page × form factor runs --runs times (3), one after another; the median-performance run is reported.
// Never silently passes: a page × form without a fresh, scored report of that very page (runtime error, host challenge,
// HTTP error, redirect to another page, timeout) is NOT RUN with its reason. Below target → 🔴; when the CPU was busy
// during that run → ❓ (rerun on an idle machine) instead.
// node lighthouse.cjs --out qa-out [--base https://site | --local ./build] [--pages "/,/about/"] [--runs 3] [--max 14]
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawnSync } = require('child_process'); const L = require('./lib.cjs');
const a = L.args(process.argv.slice(2)); const cfg = L.loadConfig(a, { allowLocal: true }); const OUT = L.outDirFrom(a);
const ID = 'PERF-01';
const LH = Object.assign({ runs: 3, max: 14, maxCpuBusy: 30, pages: null }, cfg.lighthouse || {});
if (!(Array.isArray(LH.pages) && LH.pages.length) && Array.isArray(cfg.perfPages) && cfg.perfPages.length) LH.pages = cfg.perfPages; // alias
const RUNS = Math.max(1, Math.round(+(a.runs || LH.runs) || 3)); const MAX = Math.max(1, Math.round(+(a.max || LH.max) || 14));
const TARGET = Object.assign({ mobile: 70, desktop: 90 }, cfg.decisions.perfTargets || {});
const byStr = L.byStr, wait = ms => new Promise(r => setTimeout(r, ms));
const tryJson = f => { const r = L.tryReadJson(f, path.basename(f)); return r.ok ? r.data : null; };

// ---------- other instruments on this machine (process list + the lock files of lib.acquireLock) ----------
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function othersRunning() {
  const found = [];
  const ps = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | ForEach-Object { '' + $_.ProcessId + ' ' + $_.CommandLine }"], { encoding: 'utf8', timeout: 20000, maxBuffer: 1 << 24, windowsHide: true })
    : spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'command='], { encoding: 'utf8', timeout: 20000, maxBuffer: 1 << 24 });
  const SCRIPT = /(qa-run|ios|safari-real|snapshot|spell|lighthouse)\.cjs\b/;
  for (const ln of String(ps.stdout || '').split(/\r?\n/)) {
    const m = ln.trim().match(/^(\d+)\s+(.*)$/); if (!m || +m[1] === process.pid || +m[1] === process.ppid) continue;
    // Only processes whose program is node itself: a shell whose command line merely mentions a script is not running it.
    if (!/^"?(?:[^"\s]*[\\/])?node(?:\.exe)?"?(\s|$)/i.test(m[2])) continue;
    if (SCRIPT.test(m[2])) found.push(`${m[2].match(SCRIPT)[0]} (pid ${m[1]})`);
    else if (/lighthouse[\\/]+cli[\\/]+index\.js/.test(m[2])) found.push(`a Lighthouse CLI (pid ${m[1]})`);
  }
  const locks = path.join(os.tmpdir(), 'qa-check-locks');
  try { for (const f of fs.readdirSync(locks).filter(n => n.endsWith('.json'))) { const l = tryJson(path.join(locks, f)); if (l && l.pid && l.pid !== process.pid && (!l.host || l.host === os.hostname()) && alive(l.pid)) found.push(`${l.tool || f} (pid ${l.pid}, lock)`); } } catch (e) { }
  return [...new Set(found)].sort(byStr);
}
// CPU load of the whole machine over a short window, from os.cpus() (works on every OS; loadavg is always 0 on Windows).
function cpuBusyPct(msWin) {
  const snap = () => os.cpus().reduce((s, c) => { const t = c.times; s.idle += t.idle; s.total += t.user + t.nice + t.sys + t.idle + t.irq; return s; }, { idle: 0, total: 0 });
  const x = snap(); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, msWin || 1000); // sleep without spinning
  const y = snap(); const dt = y.total - x.total; return dt > 0 ? Math.round(100 * (1 - (y.idle - x.idle) / dt)) : 0;
}
function killOrphanChrome() { // chrome-launcher profiles live in <tmp>/lighthouse.XXXXXX; a killed CLI can leave its Chrome running
  if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*user-data-dir*lighthouse.*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore', timeout: 20000, windowsHide: true });
  else spawnSync('pkill', ['-f', 'user-data-dir=[^ ]*lighthouse\\.'], { stdio: 'ignore', timeout: 20000 });
}
function browserFor() {
  const exists = p => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } };
  const bundled = () => { for (const t of [process.env.PW_PATH, path.join(__dirname, 'node_modules', 'playwright-core')]) { if (!t) continue; try { const p = require(t).chromium.executablePath(); if (exists(p)) return ["Playwright's Chromium (pinned)", p]; } catch (e) { } } return null; };
  const chrome = () => { const p = L.chromeExecutable({ bundled: false }); return p ? [process.env.CHROME_PATH && p === process.env.CHROME_PATH ? 'CHROME_PATH' : 'Google Chrome', p] : null; };
  const edge = () => {
    const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const c = { win32: [path.win32.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.win32.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')], darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], linux: ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'] }[process.platform] || [];
    const p = c.find(exists); return p ? ['Microsoft Edge', p] : null;
  };
  const order = cfg.chromium === 'chrome' ? [chrome, bundled, edge] : cfg.chromium === 'msedge' ? [edge, bundled, chrome] : [bundled, chrome, edge];
  if (process.env.CHROME_PATH && exists(process.env.CHROME_PATH)) order.unshift(chrome); // an explicit CHROME_PATH is an explicit choice
  for (const f of order) { const b = f(); if (b) return b; }
  return null;
}

// ---------- which pages ----------
const CHALLENGE_URL = /\/cdn-cgi\/challenge-platform\/|\/\.well-known\/sgcaptcha|_Incapsula_Resource|\/captcha\b/i;
const urlKey = p => { const s = p.split('?')[0].split('/').filter(Boolean); return p === '/' ? '/' : s.length > 1 ? 'url:/' + s[0] + '/*' : 'url:' + p; };
async function choosePages(run) {
  if (cfg.pagesFrom === 'cli') return { pages: cfg.pages.slice(), how: '--pages', explicit: true };
  if (Array.isArray(LH.pages) && LH.pages.length) return { pages: L.parsePages(LH.pages, cfg, 'qa-target.json lighthouse.pages'), how: 'qa-target.json lighthouse.pages', explicit: true };
  const qaRunDone = !!(run && (run.tools || []).includes('qa-run'));
  const plan = qaRunDone ? L.readPlan(OUT, cfg) : null;
  let all, how;
  if (plan && plan.all && plan.all.length) { all = plan.all; how = "this run's pages.json"; }
  else { const info = await L.discoverPagesInfo(cfg).catch(() => ({ pages: ['/'], source: 'none' })); all = info.pages; how = `${info.source} (qa-run has not finished in this run — its page plan is preferred)`; }
  all = L.sortPages(all.filter(p => !/\/qa-404-/.test(p)));
  const stat = qaRunDone ? tryJson(path.join(OUT, 'static-chromium.json')) || {} : {};
  const at = p => stat[p + '@1440'] || (Object.entries(stat).find(([k, s]) => k.startsWith(p + '@') && s && !s.fail) || [])[1];
  const fsig = f => (f.fields || []).map(x => x.name || x.type || x.tag).join(',');
  const homeForms = new Set((((at('/') || {}).forms) || []).map(fsig)); // header / footer forms repeat on every page
  const tpl = {}, formPages = []; let fetched = 0;
  if (plan && plan.groups) for (const [k, g] of Object.entries(plan.groups)) for (const p of g.picked || []) tpl[p] = k;
  for (const p of all) { const s = at(p); if (s && !s.fail && s.tpl && !tpl[p]) tpl[p] = s.tpl; if (s && Array.isArray(s.forms) && s.forms.some(f => !homeForms.has(fsig(f)))) formPages.push(p); }
  // No template data from qa-run: read the template marker of each page (plain GET, serial, throttled, ≤300 pages).
  if (all.length > MAX && !Object.keys(tpl).length) for (const p of all.slice(0, 300)) {
    const r = await L.getUrl(cfg.base + p, { cfg, fallbackToNode: true, timeoutMs: 20000 }); if (r.status === 200 && !r.blocked) { tpl[p] = L.templateKey(r.text, p); fetched++; }
    await wait(cfg.throttleMs);
  }
  const groups = new Map(); for (const p of all) { const k = tpl[p] || urlKey(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const reps = [...groups.keys()].sort(byStr).map(k => groups.get(k).sort((x, y) => x.length - y.length || byStr(x, y))[0]);
  const chosen = [...new Set(['/', ...formPages.sort(byStr), ...reps])];
  return { pages: chosen.slice(0, MAX), skipped: chosen.slice(MAX), groups: groups.size, total: all.length, how: how + (Object.keys(stat).length ? ' + its static data' : fetched ? ` + template markers of ${fetched} page(s)` : ' + URL shape only') };
}

// ---------- stage 1: serve the build folder from a child process (same origin as qa-run --local: port from the folder path)
function serveInChild(cfg) {
  const { spawn } = require('child_process');
  if (!fs.existsSync(cfg.local)) { console.error(`local folder not found: ${cfg.local}`); process.exit(1); }
  const code = `require(${JSON.stringify(path.join(__dirname, 'lib.cjs'))}).serveStatic(${JSON.stringify(cfg.local)}).then(s => process.stdout.write(s.origin + '\\n'), e => { console.error(e.message); process.exit(1); })`;
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  const kill = () => { try { child.kill(); } catch (e) { /* gone */ } };
  process.on('exit', kill);
  return new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', d => { buf += d; const m = buf.match(/^(http:\/\/127\.0\.0\.1:\d+)\n/); if (m) {
      cfg.base = m[1]; cfg.localOrigin = m[1]; cfg.stage = '1';
      cfg._localPages = L.listLocalPages(cfg.local, cfg.reference && cfg.reference.exclude);
      resolve({ origin: m[1], stop: async () => kill() });
    } });
    child.once('exit', c => reject(new Error(`the local server for ${cfg.local} stopped (exit ${c})`)));
  });
}

// ---------- one Lighthouse run, classified ----------
function lhOnce(cli, br, p, form, i, headersFile, dir) {
  const url = cfg.base + p;
  const f = path.join(dir, `${form}-${(p.replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || 'home')}-r${i + 1}.json`);
  fs.rmSync(f, { force: true }); // a report of an earlier run is never read again
  const flags = ['--headless=new', `--accept-lang=${cfg.locale || 'en-US'}`]; if (process.platform === 'linux' && process.getuid && process.getuid() === 0) flags.push('--no-sandbox');
  const argv = [url, '--output=json', `--output-path=${f}`, '--quiet', `--chrome-flags=${flags.join(' ')}`, '--max-wait-for-load=60000'];
  if (form === 'desktop') argv.push('--preset=desktop');
  if (headersFile) argv.push(`--extra-headers=${headersFile}`);
  const busy = cpuBusyPct(1000); const t0 = Date.now();
  const r = L.runCli(cli, argv, { env: Object.assign({}, process.env, { CHROME_PATH: br[1] }), stdio: ['ignore', 'ignore', 'pipe'], timeout: 240000, killSignal: process.platform === 'win32' ? 'SIGTERM' : 'SIGINT' });
  if (r.error || r.signal) killOrphanChrome();
  const tail = String(r.stderr || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (!fs.existsSync(f)) return { why: r.error ? `${r.error.code || r.error.message}${r.error.code === 'ETIMEDOUT' ? ' (240 s)' : ''}` : (tail.slice(0, 120) || `no report (exit ${r.status})`) };
  const j = tryJson(f); if (!j) return { why: 'unreadable report' };
  if (Date.parse(j.fetchTime) < t0 - 1000) return { why: 'stale report from an earlier run' };
  if (j.runtimeError && j.runtimeError.code) return { why: `${j.runtimeError.code}: ${String(j.runtimeError.message || '').slice(0, 100)}` };
  const au = j.audits || {}; const nr = (au['network-requests'] && au['network-requests'].details && au['network-requests'].details.items) || [];
  const mainUrl = j.mainDocumentUrl || j.finalUrl;
  const doc = nr.find(x => x.url === mainUrl) || nr.find(x => x.resourceType === 'Document' && !(x.statusCode >= 300 && x.statusCode < 400));
  if (doc && doc.statusCode && doc.statusCode !== 200) return { why: `main document HTTP ${doc.statusCode}` };
  if (nr.some(x => CHALLENGE_URL.test(x.url || ''))) return { why: 'host challenge page' };
  const c = j.categories || {}; const sc = k => (c[k] && c[k].score != null ? Math.round(c[k].score * 100) : null);
  if (sc('performance') === null) return { why: 'no performance score (' + Object.values(au).filter(x => x && x.errorMessage).map(x => x.id).slice(0, 3).join(', ') + ')' };
  const final = j.finalDisplayedUrl || j.finalUrl || url; const fu = new URL(final), ru = new URL(url);
  if (fu.pathname.replace(/\/$/, '') !== ru.pathname.replace(/\/$/, '')) return { why: `redirected to ${final} — that score belongs to another page` };
  const sav = x => { const m = x.metricSavings || {}; return (m.LCP || 0) + (m.FCP || 0) + (m.TBT || 0) + ((x.details && x.details.overallSavingsMs) || 0); };
  const top = Object.values(au).filter(x => x && x.score !== null && x.score < 0.9 && sav(x) > 0).sort((x, y) => sav(y) - sav(x) || byStr(x.id, y.id)).slice(0, 2).map(x => x.id).join(', ');
  const dv = k => (au[k] && au[k].displayValue) || null;
  return { row: { perf: sc('performance'), a11y: sc('accessibility'), bp: sc('best-practices'), seo: sc('seo'), LCP: dv('largest-contentful-paint'), CLS: dv('cumulative-layout-shift'), TBT: dv('total-blocking-time'), top, cpuBusy: busy, final: fu.origin !== ru.origin ? final : undefined }, env: j.environment || {}, version: j.lighthouseVersion };
}

(async () => {
  // --local: the build folder is served by a CHILD process. Lighthouse runs through spawnSync, which blocks this process's
  // event loop — a server living in this process would never answer and every page would time out.
  const srv = cfg.local ? await serveInChild(cfg) : await L.resolveTarget(cfg);
  const run = L.requireRun(OUT, cfg, { tool: 'lighthouse' });
  const R = L.makeResults('lighthouse', cfg, a); L.guard(R, OUT, [ID]);
  const dir = path.join(OUT, 'lighthouse'); fs.mkdirSync(dir, { recursive: true });
  let headersFile = null;
  const cleanup = () => { if (headersFile) { try { fs.rmSync(headersFile, { force: true }); } catch (e) { } } };
  process.on('exit', cleanup);
  const stop = async why => { R.notRun(ID, why); L.saveResults(R, OUT); await srv.stop(); console.error('lighthouse: NOT RUN — ' + why); process.exit(L.EXIT_NOT_RUN); };
  try {
    const others = process.env.QA_NO_LOCK === '1' ? [] : othersRunning(); // QA_NO_LOCK=1 (as in lib.acquireLock): checks off, noted below
    if (process.env.QA_NO_LOCK === '1') R.note(ID, 'QA_NO_LOCK=1: the idle-machine check was switched off for this run — scores may be lower than on an idle machine');
    if (others.length) await stop(`another qa-check instrument is running on this machine: ${others.join(', ')} — rerun lighthouse.cjs when it has finished (scores taken under load are not comparable)`);
    L.acquireLock('lighthouse', cfg, OUT); // exclusive: nothing else of the skill starts while Lighthouse runs
    const lh = L.bundledCli('lighthouse', 'lighthouse');
    if (!lh) await stop(`Lighthouse is not installed in scripts/ — route: cd "${__dirname}" && npm ci (Lighthouse is pinned in package.json), then rerun`);
    const br = browserFor();
    if (!br) await stop(`no Chromium-family browser on this machine — route: cd "${__dirname}" && npx playwright-core install chromium, or set CHROME_PATH to an installed Chrome / Edge`);
    // Access: only what the person provided (basic-auth env vars, a saved session) — never typed, never printed.
    const hdr = {};
    if (process.env.QA_HTTP_USER && process.env.QA_HTTP_PASS) hdr.Authorization = 'Basic ' + Buffer.from(process.env.QA_HTTP_USER + ':' + process.env.QA_HTTP_PASS).toString('base64');
    const host = new URL(cfg.base).hostname.toLowerCase();
    const ck = L.storageStateCookies(cfg).filter(k => { const d = String(k.domain || '').replace(/^\./, '').toLowerCase(); return d && (host === d || host.endsWith('.' + d)); });
    if (ck.length) hdr.Cookie = ck.map(k => `${k.name}=${k.value}`).join('; ');
    if (Object.keys(hdr).length) { headersFile = path.join(os.tmpdir(), `qa-lh-headers-${process.pid}-${crypto.randomBytes(3).toString('hex')}.json`); fs.writeFileSync(headersFile, JSON.stringify(hdr), { mode: 0o600 }); }
    // Gate preflight: behind a password / basic-auth gate every score would be a score of the gate page.
    const pre = await L.getUrl(cfg.base + '/', { cfg, fallbackToNode: true, timeoutMs: 30000 });
    if (pre.status === 401 || pre.status === 407) await stop(`site behind an access gate (HTTP ${pre.status}) — route: ${L.GATE_ROUTE}`);
    if (pre.blocked) R.note(ID, `host challenge on "/" for plain HTTP — pages Lighthouse also meets it on are NOT RUN, never scored`);

    const C = await choosePages(run);
    if (!C.pages.length) await stop('no page to measure — check --pages / qa-target.json');
    R.note(ID, `pages ${C.pages.length}${C.total ? ` of ${C.total} (${C.groups} template group(s))` : ''} from ${C.how}: ${C.pages.join(', ')}`);
    if (C.skipped && C.skipped.length) R.ask(ID, { why: `${C.skipped.length} template page(s) over the cap of ${MAX} not measured`, pages: C.skipped.join(', '), route: 'raise --max / qa-target.json lighthouse.max, or list them in lighthouse.pages' });
    if (!C.explicit && C.total <= 1 && !cfg.decisions.singlePage) R.ask(ID, { why: 'only "/" was found (no sitemap, or it is blocked) — the rest of the site is not measured', route: 'list the pages in qa-target.json → pages or lighthouse.pages (or set decisions.singlePage for a one-page site)' });

    // Wait for an idle machine (max 60 s): load from other applications lowers lab scores.
    let idle = cpuBusyPct(1000); for (let i = 0; i < 12 && idle > LH.maxCpuBusy; i++) { await wait(4000); idle = cpuBusyPct(1000); }
    if (idle > LH.maxCpuBusy) R.note(ID, `machine still ${idle}% busy after 60 s of waiting — below-target scores taken under load become ❓`);

    const rows = [], missing = []; let envNote = null; const total = C.pages.length * 2;
    for (const p of C.pages) for (const form of ['mobile', 'desktop']) {
      const ok = [], bad = [];
      for (let i = 0; i < RUNS; i++) { const res = lhOnce(lh, br, p, form, i, headersFile, dir); if (res.row) { ok.push(res.row); if (!envNote) envNote = res; } else bad.push(res.why); process.stderr.write(res.row ? '.' : 'x'); }
      if (!ok.length) { missing.push(`${p} ${form}: ${[...new Set(bad)].join(' / ')}`); continue; }
      ok.sort((x, y) => x.perf - y.perf); const med = ok[Math.floor((ok.length - 1) / 2)];
      const row = Object.assign({ where: p, form }, med, { runs: ok.map(x => x.perf).join('/') + (bad.length ? ` (+${bad.length} failed: ${[...new Set(bad)].join(' / ').slice(0, 80)})` : '') });
      rows.push(row);
      R.note(ID, `${p} ${form}: P${row.perf} (runs ${row.runs}) A${row.a11y} BP${row.bp} SEO${row.seo} LCP ${row.LCP} CLS ${row.CLS} TBT ${row.TBT}${row.top ? ' · top: ' + row.top : ''}${row.final ? ' · served from ' + row.final : ''}`);
      const target = TARGET[form];
      if (row.perf < target) { if (row.cpuBusy > LH.maxCpuBusy) R.ask(ID, Object.assign({}, row, { target, why: `CPU ${row.cpuBusy}% busy during the run — rerun on an idle machine` })); else R.add(ID, Object.assign({}, row, { target })); }
    }
    process.stderr.write('\n');
    if (envNote) R.note(ID, `lighthouse ${envNote.version || lh.version} · ${br[0]} · ${envNote.env.hostUserAgent || ''} · benchmarkIndex ${envNote.env.benchmarkIndex != null ? envNote.env.benchmarkIndex : '?'} · node ${process.version} · ${RUNS} run(s) per page × form, median`);
    R._env = Object.assign({}, R._env || {}, { lighthouse: (envNote && envNote.version) || lh.version, lighthouseBrowser: br[0] + (envNote && envNote.env.hostUserAgent ? ' · ' + (envNote.env.hostUserAgent.match(/(?:Headless)?Chrome\/[\d.]+|Edg\/[\d.]+/) || [''])[0] : ''), benchmarkIndex: envNote ? envNote.env.benchmarkIndex : null, runsPerPage: RUNS });
    if (rows.length) R.ran(ID);
    R._timing = { why: `${C.pages.length} pages × 2 form factors × ${RUNS} runs = ${total * RUNS} Lighthouse runs, one at a time (lab scores need an idle machine)` };
    if (missing.length) R.notRun(ID, `${missing.length} of ${total} page × form not measured: ${missing.join('; ')} — route: rerun lighthouse.cjs on an idle machine when those pages load, or measure them on pagespeed.web.dev and record.cjs`);
    L.writeJsonAtomic(path.join(dir, 'summary.json'), rows);
    L.saveResults(R, OUT); await srv.stop();
    console.log(`lighthouse: ${rows.length} of ${total} page × form measured (serial, lab, median of ${RUNS})${missing.length ? ` · ${missing.length} NOT measured` : ''}`);
    process.exit(missing.length && !rows.length ? L.EXIT_NOT_RUN : 0);
  } catch (e) {
    R.notRun(ID, 'lighthouse.cjs crashed: ' + String(e && e.message || e).split('\n')[0].slice(0, 160));
    L.saveResults(R, OUT); console.error(e && e.stack || e); process.exit(L.EXIT_NOT_RUN);
  }
})();
