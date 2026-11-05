#!/usr/bin/env node
// qa-check · selftest/run.cjs — deterministic self-test of the bundled instruments.
//
//   cd <skill>/scripts && npm test            (or: node selftest/run.cjs [--all] [--once] [--keep] [--verbose])
//
// What it does, on any OS (macOS, Windows, Linux), with no internet:
//   1. serves selftest/fixture/ (a small static site with PLANTED defects and CLEAN counterparts) on 127.0.0.1 at a
//      free port, from a tiny Node HTTP server in this process;
//   2. writes a temporary qa-target.json for that server in a scratch folder under the OS temp folder (never inside
//      the skill folder) and runs qa-run.cjs + manifest.cjs into two output folders (run1, run2);
//   3. asserts
//        (a) every planted defect is reported (status fail or ask, with a finding that names the planted element),
//        (b) no clean counterpart is reported,
//        (c) the two manifests are identical (status per ID + the sorted finding keys),
//        (d) no row is a silent pass when its subject is absent from the fixture (it must be n/a or not run);
//        (e) the run reports its time (results _timing with the steps, the "## Time" table in manifest.md);
//   4. prints a PASS/FAIL table and exits 0 (all passed) or 1 (something failed), 2 when the test itself could not run.
//
// Flags: --all     run Chromium, WebKit and Firefox (default: Chromium only — the bundled, pinned build)
//        --once    one run only (skips the determinism comparison — for debugging the fixture)
//        --keep    keep the scratch folder (its path is printed) to inspect results-qa-run.json / manifest.md
//        --verbose stream the instruments' own progress output
// Nothing here touches a real website: the only host contacted is the 127.0.0.1 fixture server started below.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixture');
const argv = process.argv.slice(2);
const flag = f => argv.includes('--' + f);
const ALL = flag('all'), ONCE = flag('once'), KEEP = flag('keep'), VERBOSE = flag('verbose');
const RUN_TIMEOUT_MS = 30 * 60000;

// ------------------------------------------------------------------------------------------------ expectations
// Planted defects: the row must be fail/ask AND carry a finding whose JSON matches `find`.
// Clean counterparts: no finding of the row may match `clean`.
// Each entry names the fixture element, so a reader can find it in selftest/fixture/ (search for the ID).
const PLANTED = [
  { id: 'LAY-02', find: /promo-cta|Book A Visit/, what: 'CTA pushed past the right edge inside an overflow:hidden band at 360 (index)' },
  { id: 'LINK-01', find: /Download Brochure/, what: '<a> styled as a button without href (index)' },
  { id: 'INT-01', find: /weekends/, what: 'FAQ toggle whose aria-expanded never changes (faq)' },
  { id: 'A11Y-04', find: /tabs-plain/, what: 'tab group without role=tablist/tab and aria-selected (faq)' },
  { id: 'INT-03', find: /Testimonials/, what: 'slider whose next arrow stays enabled on the last slide (index)' },
  { id: 'INT-04', find: /Awards/, what: 'autoplaying ticker that never pauses (index)' },
  { id: 'A11Y-02', find: /role=none|focus stays outside/, what: 'burger panel without role=dialog, focus left on the burger' },
  { id: 'NAV-08', find: /logo box moves/, what: 'logo shifts when the burger panel opens' },
  { id: 'INT-05', find: /link-plain|Read the story/, what: 'link with no hover change (index)' },
  { id: 'INT-06', find: /link-slow|See events/, what: '200 ms hover transition (index)' },
  { id: 'LAY-08', find: /span\.chip\b/, what: 'padding .1em of 15px = 1.5px (index)' },
  { id: 'IMG-01', find: /photo-a\.png/, what: '<img> without alt (index)' },
  { id: 'IMG-03', find: /photo-big\.png/, what: '1600px image shown at 400px (index)' },
  { id: 'FORM-02', find: /contact-form/, what: 'all fields required, no marker, no note (contact)' },
  { id: 'FORM-03', find: /contact-form/, what: 'no autocomplete on name/email/phone (contact)' },
  { id: 'FORM-04', find: /contact-form/, what: 'no captcha and no honeypot (contact)' },
  { id: 'FORM-05', find: /Preferred visit date/, what: 'visit date accepts a past date (contact)' },
  { id: 'TEXT-01', find: /rooms that rest/, what: '<br> inside a paragraph (index)' },
  { id: 'TEXT-03', find: /colour/, what: 'UK spelling on a US English site (about)' },
  { id: 'TEXT-04', find: /Learn more about us/, what: 'one sentence-case button among Title Case buttons (index)' },
  { id: 'TEXT-06', find: /Prices/, what: 'menu "Prices" points to the page "Pricing"' },
  { id: 'TEXT-07', find: /12\.06\.2026/, what: 'a second date format (events)' },
  { id: 'SEO-04', find: /"og\.png"/, what: 'the same og:image on most pages' },
  { id: 'SEO-11', find: /"\/faq\/"/, what: 'FAQ without FAQPage schema (faq)' },
  { id: 'MAP-01', find: /view=contact/, what: 'greyed-out map iframe (contact)' },
];
const CLEAN = [
  { id: 'LAY-02', clean: /Reading corner|Studio kitchen|Garden office|Guest room|Soft light|Open shelves|desk facing|Linen, oak|gallery/, what: 'horizontal scroller with off-screen cards (index)' },
  { id: 'LINK-01', clean: /View Our Work|Get In Touch/, what: 'buttons with a real href (index)' },
  { id: 'INT-01', clean: /How long does|keep our furniture|visit the site|Is the first call|charge for travel|Plan|Build|Homes|Offices/, what: 'working <details> and tabs' },
  { id: 'A11Y-04', clean: /tabs-aria/, what: 'tab group with full ARIA (about)' },
  { id: 'INT-03', clean: /Projects/, what: 'slider whose next arrow is disabled on the last slide (about)' },
  { id: 'INT-04', clean: /Partners/, what: 'ticker with a working pause control (index)' },
  { id: 'INT-05', clean: /link-ok|Read the answers/, what: 'link with a 350 ms hover (index)' },
  { id: 'INT-06', clean: /link-ok|Read the answers/, what: 'link with a 350 ms hover (index)' },
  { id: 'LAY-08', clean: /tag-ok/, what: 'whole-pixel padding (index)' },
  { id: 'IMG-01', clean: /photo-b\.png|photo-big\.png|logo\.svg/, what: 'images with alt' },
  { id: 'IMG-03', clean: /photo-b\.png|photo-a\.png/, what: 'images served at their shown size' },
  { id: 'FORM-02', clean: /subscribe-form/, what: 'form with a marked required field (contact)' },
  { id: 'FORM-03', clean: /subscribe-form/, what: 'email field with autocomplete (contact)' },
  { id: 'FORM-04', clean: /subscribe-form/, what: 'form with a honeypot (contact)' },
  { id: 'TEXT-01', clean: /Example Street|Brand Studio/, what: '<br> in the footer address (not copy)' },
  { id: 'TEXT-03', clean: /"\/events\/"|"\/pricing\/"|"\/faq\/"/, what: 'pages in US English' },
  { id: 'TEXT-04', clean: /View Our Work|Get In Touch|See Price List|Send Request|weekends/, what: 'Title Case buttons and the FAQ question button' },
  { id: 'TEXT-06', clean: /"menu":"(About|Events|Contact|FAQ)"/, what: 'menu labels that match their pages' },
  { id: 'TEXT-07', clean: /March 5, 2026|April 12, 2026|May 20, 2026/, what: 'dates in the site format (events)' },
  { id: 'SEO-04', clean: /og-pricing/, what: 'a page-specific og:image (pricing)' },
  { id: 'SEO-11', clean: /"\/pricing\/"/, what: 'FAQ with a matching FAQPage schema (pricing)' },
  { id: 'MAP-01', clean: /view=studio/, what: 'map in full colour (about)' },
];
// Subjects the fixture does NOT contain: every row behind these gates must be n/a or not-run, never a silent pass.
const ABSENT_GATES = ['video', 'lang', 'search', 'fileFields', 'accounts', 'passwordPage', 'downloads', 'preloader', 'sortFilter', 'dialogs', 'dropdowns'];

// ------------------------------------------------------------------------------------------------ fixture server
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
function startServer() {
  return new Promise((resolve, reject) => {
    let base = '';
    const srv = http.createServer((req, res) => {
      let p; try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch (e) { res.writeHead(400); return res.end(); }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      let f = path.normalize(path.join(FIXTURE, p));
      if (!f.startsWith(FIXTURE)) { res.writeHead(403); return res.end(); }
      if (p.endsWith('/')) f = path.join(f, 'index.html');
      else if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      let status = 200;
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { status = 404; f = path.join(FIXTURE, '404.html'); }
      const ext = path.extname(f).toLowerCase();
      let body = fs.readFileSync(f);
      if (ext === '.xml' || ext === '.txt') body = Buffer.from(body.toString('utf8').split('__BASE__').join(base));
      res.writeHead(status, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${srv.address().port}`; resolve({ srv, base }); });
  });
}

// ------------------------------------------------------------------------------------------------ runs
function writeTarget(dir, base) {
  const t = {
    base, staging: true, platform: 'static', pages: [],
    widths: [1440, 360], interactWidths: [1440, 360],
    engines: ALL ? ['chromium', 'webkit', 'firefox'] : ['chromium'],
    chromium: 'bundled', budgetMinutes: 25,
    decisions: { projectType: 'client', englishVariant: 'US', donor: [], singlePage: false },
    dictionary: ['Brand'],
  };
  const f = path.join(dir, 'qa-target.json'); fs.writeFileSync(f, JSON.stringify(t, null, 2)); return f;
}
function runNode(script, args, cwd, label) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = cp.spawn(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, env: Object.assign({}, process.env, { QA_SELFTEST: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; if (VERBOSE) process.stdout.write(d); });
    child.stderr.on('data', d => { err += d; if (VERBOSE) process.stderr.write(d); });
    const timer = setTimeout(() => { err += `\n[selftest] ${label} timed out after ${RUN_TIMEOUT_MS / 60000} min — killed`; child.kill('SIGTERM'); }, RUN_TIMEOUT_MS);
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err, ms: Date.now() - t0 }); });
  });
}
async function oneRun(scratch, cfgFile, name) {
  const out = path.join(scratch, name);
  process.stdout.write(`[selftest] ${name}: qa-run …\n`);
  const q = await runNode('qa-run.cjs', ['--config', cfgFile, '--out', out, '--no-edge'], scratch, `${name} qa-run`);
  const m = await runNode('manifest.cjs', ['--config', cfgFile, '--out', out, '--platform', 'static', '--stage', '2'], scratch, `${name} manifest`);
  let rows = null; try { rows = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')); } catch (e) { }
  let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(out, 'manifest-meta.json'), 'utf8')); } catch (e) { }
  let results = null; try { results = JSON.parse(fs.readFileSync(path.join(out, 'results-qa-run.json'), 'utf8')); } catch (e) { }
  let md = ''; try { md = fs.readFileSync(path.join(out, 'manifest.md'), 'utf8'); } catch (e) { }
  process.stdout.write(`[selftest] ${name}: qa-run exit ${q.code} in ${(q.ms / 1000).toFixed(0)} s · manifest exit ${m.code}\n`);
  return { name, out, q, m, rows, meta, results, md };
}

// ------------------------------------------------------------------------------------------------ assertions
const VOLATILE = new Set(['shot', 'ms_', 'at', 'path']);
function canon(v) {
  return JSON.stringify(v, (k, x) => {
    if (VOLATILE.has(k)) return undefined;
    if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]]));
    return x;
  });
}
const findingsOf = (rows, id) => { const r = (rows || []).find(x => x.id === id); return r ? r.findings || [] : []; };
const statusOf = (rows, id) => { const r = (rows || []).find(x => x.id === id); return r ? (r.st || r.status || '(none)') : '(missing)'; };
const isFlag = st => /^(fail|ask)/.test(String(st));
const isPass = st => /^pass/.test(String(st));
function checkRun(run, table) {
  const rows = run.rows;
  for (const p of PLANTED) {
    const st = statusOf(rows, p.id); const hit = findingsOf(rows, p.id).filter(f => p.find.test(canon(f)));
    const ok = isFlag(st) && hit.length > 0;
    table.push({ group: 'a planted', id: p.id, run: run.name, ok, what: p.what, got: ok ? `${st}, ${hit.length} matching` : `status ${st}, ${hit.length} matching finding(s)` + (findingsOf(rows, p.id).length ? ` — first: ${canon(findingsOf(rows, p.id)[0]).slice(0, 140)}` : notRunWhy(run, p.id)) });
  }
  for (const c of CLEAN) {
    const bad = findingsOf(rows, c.id).filter(f => c.clean.test(canon(f)));
    table.push({ group: 'b clean', id: c.id, run: run.name, ok: bad.length === 0, what: c.what, got: bad.length ? `flagged: ${canon(bad[0]).slice(0, 160)}` : 'not flagged' });
  }
  // (d) absent subjects are never a silent pass
  const presence = (run.meta && run.meta.presence) || (run.results && run.results._presence) || {};
  const REG = require(path.join(SCRIPTS, 'registry.cjs'));
  for (const g of ABSENT_GATES) {
    const pr = presence[g]; const found = pr && typeof pr === 'object' ? pr.found : pr;
    const gated = REG.filter(r => r.gate === g).map(r => r.id);
    if (!gated.length) continue;
    const passing = gated.filter(id => isPass(statusOf(rows, id)));
    const absentOk = !(found === true || (typeof found === 'number' && found > 0));
    table.push({ group: 'd absent', id: `gate:${g}`, run: run.name, ok: absentOk && passing.length === 0, what: `${gated.length} row(s) behind "${g}" — the fixture has none`, got: !absentOk ? `presence sweep says found (${JSON.stringify(pr).slice(0, 80)})` : passing.length ? `silent pass: ${passing.join(', ')}` : `no pass (${[...new Set(gated.map(id => statusOf(rows, id)))].join(', ')})` });
  }
  // (e) the run reports its time: per-step timing in the results, the time table in manifest.md
  const tm = run.results && run.results._timing;
  const stepsOk = !!(tm && tm.totalMs > 0 && Array.isArray(tm.steps) && tm.steps.some(x => /static/.test(x.id)) && tm.steps.some(x => /interactions/.test(x.id)));
  table.push({ group: 'e time', id: 'timing', run: run.name, ok: stepsOk && /## Time\n[\s\S]*\| \*\*Total\*\* \|/.test(run.md || ''), what: 'results-qa-run.json _timing has the steps; manifest.md has the time table with its total', got: !tm ? 'no _timing in results-qa-run.json' : !stepsOk ? `steps: ${(tm.steps || []).map(x => x.id).join(', ')}` : 'no "## Time" table with a Total row in manifest.md' });
  // every qa-run row has exactly one status in the manifest (nothing silently missing)
  const mine = REG.filter(r => r.tool === 'qa-run').map(r => r.id); const missing = mine.filter(id => !(rows || []).some(x => x.id === id));
  table.push({ group: 'd absent', id: 'ledger', run: run.name, ok: !!rows && missing.length === 0, what: `all ${mine.length} qa-run rows present in manifest.json`, got: rows ? (missing.length ? `missing: ${missing.slice(0, 8).join(', ')}` : 'all present') : 'manifest.json not written' });
}
function notRunWhy(run, id) {
  const c = run.results && run.results.checks && run.results.checks[id];
  if (!c) return ' — no entry in results-qa-run.json';
  const why = [].concat(c.notRun || [], c.na || []).filter(Boolean).join(' | ');
  return why ? ` — ${why.slice(0, 200)}` : '';
}
function keyset(rows) {
  const m = {};
  for (const r of rows || []) m[r.id] = { status: (r.st || r.status) + (r.partial ? ' (partial)' : ''), findings: (r.findings || []).map(canon).sort() };
  return m;
}
function compare(r1, r2, table) {
  const a = keyset(r1.rows), b = keyset(r2.rows); const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const diff = [];
  for (const id of ids) {
    const x = a[id], y = b[id];
    if (!x || !y) { diff.push(`${id}: only in ${x ? 'run1' : 'run2'}`); continue; }
    if (x.status !== y.status) diff.push(`${id}: status ${x.status} vs ${y.status}`);
    else if (JSON.stringify(x.findings) !== JSON.stringify(y.findings)) {
      const onlyA = x.findings.filter(f => !y.findings.includes(f)), onlyB = y.findings.filter(f => !x.findings.includes(f));
      diff.push(`${id}: findings differ (run1 only: ${onlyA.length} ${onlyA[0] ? onlyA[0].slice(0, 120) : ''}; run2 only: ${onlyB.length} ${onlyB[0] ? onlyB[0].slice(0, 120) : ''})`);
    }
  }
  table.push({ group: 'c determinism', id: 'manifest', run: 'run1=run2', ok: diff.length === 0 && ids.length > 0, what: `status + sorted finding keys of ${ids.length} rows`, got: diff.length ? `${diff.length} row(s) differ` : 'identical' });
  return diff;
}

// ------------------------------------------------------------------------------------------------ main
(async () => {
  const t0 = Date.now();
  if (!fs.existsSync(path.join(FIXTURE, 'index.html'))) { console.error('[selftest] fixture missing: ' + FIXTURE); process.exit(2); }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-check-selftest-'));
  const { srv, base } = await startServer();
  process.stdout.write(`[selftest] fixture ${base} · scratch ${scratch} · engines ${ALL ? 'chromium, webkit, firefox' : 'chromium'} · Node ${process.versions.node} · ${process.platform}\n`);
  const cfgFile = writeTarget(scratch, base);
  const runs = [];
  try {
    runs.push(await oneRun(scratch, cfgFile, 'run1'));
    if (!ONCE) runs.push(await oneRun(scratch, cfgFile, 'run2'));
  } finally { srv.close(); }
  const table = [];
  for (const r of runs) {
    if (!r.rows) {
      table.push({ group: 'run', id: r.name, run: r.name, ok: false, what: 'qa-run + manifest produced manifest.json', got: `qa-run exit ${r.q.code}: ${(r.q.err || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` });
      continue;
    }
    if (r.results && r.results._crashed) table.push({ group: 'run', id: r.name, run: r.name, ok: false, what: 'qa-run finished without crashing', got: 'crashed: ' + r.results._crashed });
    checkRun(r, table);
  }
  let diff = [];
  if (runs.length === 2 && runs[0].rows && runs[1].rows) diff = compare(runs[0], runs[1], table);
  // report: one line per check; for two runs, a planted/clean line passes only when it passes in both runs
  const merged = new Map();
  for (const t of table) { const k = t.group + '|' + t.id + '|' + t.what; const m = merged.get(k); if (!m) merged.set(k, Object.assign({}, t)); else if (!t.ok) { m.ok = false; m.got = `${t.run}: ${t.got}`; } }
  const lines = [...merged.values()];
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nRESULT  GROUP          ID          CHECK');
  for (const l of lines) console.log(`${pad(l.ok ? 'PASS' : 'FAIL', 7)} ${pad(l.group, 14)} ${pad(l.id, 11)} ${l.what}${l.ok ? '' : '\n' + ' '.repeat(35) + '→ ' + l.got}`);
  if (diff.length) { console.log('\nDeterminism differences (run1 vs run2):'); diff.slice(0, 40).forEach(d => console.log('  ' + d)); if (diff.length > 40) console.log(`  … ${diff.length - 40} more`); }
  const failed = lines.filter(l => !l.ok).length;
  const runMs = runs.map(r => r.q.ms);
  console.log(`\n${failed ? 'SELFTEST FAIL' : 'SELFTEST PASS'} · ${lines.length - failed}/${lines.length} checks passed · qa-run ${runMs.map(ms => (ms / 1000).toFixed(0) + ' s').join(' + ')} · total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (KEEP || failed) console.log(`scratch kept: ${scratch} (results-qa-run.json, manifest.md per run)`);
  else { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { } }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('[selftest] could not run: ' + (e && e.stack || e)); process.exit(2); });
