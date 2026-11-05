#!/usr/bin/env node
// Merge the results of THIS run and print the manifest: EVERY registry ID with exactly one status.
// node manifest.cjs --out qa-out [--config qa-target.json] [--platform wordpress|webflow|static|other] [--stage 1|2]
//                   [--accept results-x.json,…] [--fail-on fail] [--force]
//
// Status of a row — one rule, applied the same way on every machine:
//   1. a fail item (instrument or manual)                  → 🔴 fail  (a manual pass / na / routed closes it only with --override)
//   2. a manual verdict (record.cjs pass / na / routed)     → that verdict; it answers ❓ asks; it closes an instrument's
//      NOT RUN part when it is na or routed, or a pass recorded with --covers-not-run (else the row stays ⚠️ partial)
//   3. an ask item                                          → ❓ ask
//   4. the row does not apply (platform / stage)            → ⊘ n/a
//   5. any NOT RUN reason, also next to measured data       → ⚠️ not run — a partial measurement is never ✅
//   6. an instrument's n/a (subject absent)                 → ⊘ n/a
//   7. measured with no finding                             → ✅ pass (an instrument that reports 0 tested subjects → ⚠️)
//   8. nothing at all                                       → ⚠️ not run (a gated row whose subject the presence sweep did not find → ⊘)
// Only results of the current run are merged (qa-out/run.json, written by snapshot.cjs at step 1); every other
// results file is listed as ignored, so last week's run or another site never leaks into this manifest.
// Exit 3 while the run is unfinished (not-run or partial rows, unreadable or unknown results); 1 with --fail-on fail
// when a row fails; otherwise 0. The last printed line is machine-readable: MANIFEST fail=… ask=… … unfinished=…
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs'); const REG = require('./registry.cjs');
const a = L.args(process.argv.slice(2)); const OUT = L.outDirFrom(a);
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const readJsonFile = f => L.readJson(f, path.basename(f)); // UTF-8 with or without BOM, or UTF-16
const tryJson = f => { try { return readJsonFile(f); } catch (e) { return null; } };
const writeAtomic = (f, s) => L.writeJsonAtomic(f, s);
const byStr = L.byStr;
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => byStr(p, q))) : x));
const origin = u => { try { return L.hostKey(u); } catch (e) { return null; } }; // site identity: www/non-www and http/https are one site
const ms = s => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
// Make arbitrary text safe for one Markdown table cell, heading or list line. Raw tags would be parsed as HTML by most
// previewers (<title> swallows the rest of the file); code spans are kept, '|' is escaped everywhere.
function md(s) {
  return String(s == null ? '' : s).replace(/\r?\n/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/&(?=#?[a-z0-9]+;)/gi, '&amp;').replace(/</g, '&lt;')))
    .join('').replace(/\|/g, '\\|');
}
const byId = id => (typeof REG.byId === 'function' ? REG.byId(id) : REG.find(r => r.id === id));
const toolFor = (row, p) => (typeof REG.toolFor === 'function' ? REG.toolFor(row, p) : row.tool);
const appliesTo = (row, ctx) => (typeof REG.appliesTo === 'function' ? REG.appliesTo(row, ctx) : true);
const GATES = REG.GATES || {};
const PLATFORMS = REG.PLATFORMS || ['wordpress', 'webflow', 'static', 'other'];
const isManualFile = f => /^results-manual(-[a-z0-9-]+)?\.json$/.test(f);

// ---------- do not read a folder another instrument is still writing (--force reads it anyway) ----------
if (!a.force) L.assertIdle(OUT, 'manifest');

// ---------- inputs ----------
let cfg = {}; try { cfg = L.readTarget(a) || {}; } catch (e) { console.error('manifest: ' + e.message); }
const run = L.currentRun(OUT);
const startedMs = run ? ms(run.startedAt) : null;
const accept = new Set(String(typeof a.accept === 'string' ? a.accept : '').split(',').map(s => s.trim()).filter(Boolean));
const all = fs.readdirSync(OUT).filter(f => /^results-.*\.json$/.test(f))
  .sort((x, y) => (isManualFile(x) - isManualFile(y)) || byStr(x, y)); // manual records last; fixed order on every file system

const sources = [], accepted = [], ignored = [], invalid = [];
for (const f of all) {
  let r; try { r = readJsonFile(path.join(OUT, f)); } catch (e) { invalid.push({ file: f, why: e.message.split(path.join(OUT, f)).join(f).replace(/^[^:]+: /, '').slice(0, 200) }); sources.push({ file: f, status: 'invalid' }); continue; }
  if (!r || typeof r !== 'object' || typeof r.checks !== 'object' || !r.checks) { invalid.push({ file: f, why: 'no "checks" object' }); sources.push({ file: f, status: 'invalid' }); continue; }
  sources.push({ file: f, tool: r._tool || f.replace(/^results-|\.json$/g, ''), at: r._at || null, runId: r._runId || null, base: r._base || null, r });
}
// Freshness: with run.json only this run counts; without it, an instrument file a day older than the newest one is stale.
const newestTool = Math.max(0, ...sources.filter(s => s.r && !isManualFile(s.file)).map(s => ms(s.at) || 0));
for (const s of sources) {
  if (!s.r) continue;
  let why = '';
  if (accept.has(s.file)) why = '';
  else if (run) {
    if (s.runId) { if (s.runId !== run.runId) why = `run ${s.runId}, current run ${run.runId}`; }
    else if (s.at) { if (startedMs && ms(s.at) !== null && ms(s.at) < startedMs - 1000) why = `written ${s.at}, before this run started (${run.startedAt})`; }
    else why = `no _runId or _at — cannot tell which run it belongs to (if it is this run: --accept ${s.file})`;
    if (!why && s.base && run.base && origin(s.base) !== origin(run.base)) why = `another site: ${s.base} (this run: ${run.base})`;
  } else if (!isManualFile(s.file) && s.at && newestTool && ms(s.at) !== null && ms(s.at) < newestTool - 24 * 3600e3) why = `more than a day older than the newest results (${new Date(newestTool).toISOString()})`;
  if (why) { s.status = 'ignored'; s.why = why; ignored.push(s); } else { s.status = 'ok'; accepted.push(s); }
}
const bases = [...new Set(accepted.map(s => s.base && origin(s.base)).filter(Boolean))];

// ---------- merge ----------
const merged = {}, ignoredFor = {};
for (const s of ignored) for (const id of Object.keys(s.r.checks)) (ignoredFor[id] = ignoredFor[id] || []).push(`${s.file} (${s.why})`);
for (const s of accepted) {
  const manual = isManualFile(s.file) || s.tool === 'manual';
  for (const [id, c] of Object.entries(s.r.checks)) {
    if (!c || typeof c !== 'object') continue;
    const m = merged[id] = merged[id] || { items: [], notes: [], tools: new Set(), notRun: [], na: [], ran: false, tested: undefined, manual: null };
    m.tools.add(manual ? 'manual' : s.tool);
    const its = Array.isArray(c.items) ? c.items.filter(i => i && typeof i === 'object' && !Array.isArray(i)) : [];
    m.items.push(...its.map(i => Object.assign({}, i, manual ? { _by: 'manual' } : {})));
    if (Array.isArray(c.notes)) m.notes.push(...c.notes.map(String));
    if (c.ran) m.ran = true;
    // tested: number of real subjects exercised (or true). 0 / false = the instrument looked and found nothing to test.
    // ran without tested counts as measured — instruments mark an absent subject with R.na and a gap with R.notRun.
    if (typeof c.tested === 'number') m.tested = (typeof m.tested === 'number' ? m.tested : 0) + c.tested;
    else if (c.tested === true) { m.ran = true; m.tested = typeof m.tested === 'number' ? m.tested + 1 : true; }
    else if (c.tested === false && m.tested === undefined) m.tested = 0;
    if (c.na) m.na.push(c.na === true ? 'n/a' : String(c.na));
    if (c.notRun) m.notRun.push(...String(c.notRun).split('; '));
    if (Array.isArray(c.partial)) m.notRun.push(...c.partial.map(String));
    const st = c.status;
    if (manual && ['pass', 'na', 'routed'].includes(st)) m.manual = { status: st, note: (c.notes || []).join('; ') || c.na || '', override: c.override || null, covers: !!c.coversNotRun };
    else if (!manual && st === 'routed') m.manual = { status: 'routed', note: (c.notes || []).join('; '), override: null };
    else if (!manual && st === 'na') m.na.push(c.na || (c.notes || []).join('; ') || 'n/a');
  }
}
for (const m of Object.values(merged)) {
  const seen = new Set(); m.items = m.items.filter(i => { const k = canon(i); if (seen.has(k)) return false; seen.add(k); return true; });
  m.items.sort((x, y) => (!!x.ask - !!y.ask) || byStr(canon(x), canon(y)));
  m.notes = [...new Set(m.notes)]; m.notRun = [...new Set(m.notRun.map(s => s.trim()).filter(Boolean))].sort(byStr); m.na = [...new Set(m.na)].sort(byStr);
  m.tools = [...m.tools].sort(byStr);
}
const unknown = Object.keys(merged).filter(id => !byId(id)).sort(byStr);

// ---------- platform, stage, presence (who decided what applies) ----------
const normP = v => {
  if (v && typeof v === 'object') v = v.name || v.platform || v.detected;
  if (!v) return null; v = String(v).toLowerCase().trim();
  if (v === 'wp') return 'wordpress'; if (v.startsWith('webflow')) return 'webflow'; if (PLATFORMS.includes(v)) return v; if (v.startsWith('other')) return 'other';
  return null;
};
const fresh = f => fs.existsSync(f) && (!startedMs || fs.statSync(f).mtimeMs >= startedMs - 1000);
let platform = null, platformSrc = '';
if (normP(a.platform)) { platform = normP(a.platform); platformSrc = '--platform'; }
if (!platform && fresh(path.join(OUT, 'platform.json'))) { const p = tryJson(path.join(OUT, 'platform.json')); if (normP(p)) { platform = normP(p); platformSrc = 'platform.json' + (p && p.evidence ? ': ' + [].concat(p.evidence).join(', ') : ''); } }
if (!platform) for (const s of accepted) { const v = s.r._platform || s.r.platform; if (normP(v)) { platform = normP(v); platformSrc = `${s.file}` + (v && v.evidence ? ': ' + [].concat(v.evidence).join(', ') : ''); break; } }
if (!platform) for (const s of accepted) { const v = s.r._env && s.r._env.platform; if (normP(v)) { platform = normP(v); platformSrc = `${s.file} (configured "platform")`; break; } }
if (!platform && accepted.some(s => s.tool === 'wp-admin')) { platform = 'wordpress'; platformSrc = 'results-wp-admin.json present'; }
if (!platform && normP(cfg.platform)) { platform = normP(cfg.platform); platformSrc = 'qa-target.json platform (not detected this run)'; }
let stage = null, stageSrc = '';
const normS = v => (v === 1 || v === 2 || v === '1' || v === '2' ? String(v) : null);
if (normS(a.stage)) { stage = normS(a.stage); stageSrc = '--stage'; }
if (!stage) for (const s of accepted) if (normS(s.r._stage)) { stage = normS(s.r._stage); stageSrc = s.file; break; }
if (!stage) for (const s of accepted) if (s.r._env && normS(s.r._env.stage)) { stage = normS(s.r._env.stage); stageSrc = s.file; break; }
if (!stage && normS(cfg.stage || (cfg.decisions || {}).stage)) { stage = normS(cfg.stage || cfg.decisions.stage); stageSrc = 'qa-target.json'; }
const presence = {};
const addPresence = o => { if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (!(k in presence)) presence[k] = v; };
for (const s of accepted) { addPresence(s.r._presence); addPresence(s.r.presence); }
if (fresh(path.join(OUT, 'presence.json'))) addPresence(tryJson(path.join(OUT, 'presence.json')));
const gateAbsent = g => {
  if (!g || !(g in presence)) return false; const v = presence[g];
  if (v === false || v === 0) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return v.found === false || v.found === 0 || v.count === 0 || v.present === false;
  return false;
};

// ---------- status per row ----------
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const itemsTxt = its => its.slice(0, 2).map(i => clip(canon(Object.fromEntries(Object.entries(i).filter(([k]) => k !== 'ask' && k !== '_by'))), 140)).join(' · ');
const rows = REG.map(r => {
  const m = merged[r.id]; const tool = toolFor(r, platform);
  const applies = appliesTo(r, { platform, stage });
  const fails = m ? m.items.filter(i => !i.ask) : [], asks = m ? m.items.filter(i => i.ask) : [];
  const nr = m ? m.notRun : [];
  const measured = !!(m && (m.ran || m.items.length));
  let st, ev, partial = null;
  const needs = () => {
    const ign = ignoredFor[r.id] ? ` · ignored: ${ignoredFor[r.id].join('; ')}` : '';
    if (r.platforms && !platform) return `platform unknown — run qa-run.cjs (RUN-05) or pass --platform; needs tool: ${tool}${ign}`;
    return `needs tool: ${tool}` + (r.route ? ` — ${r.route}` : '') + ign;
  };
  // An override closes instrument findings only; a manual fail (from any machine) is cleared by record.cjs --reset.
  const manualFails = fails.filter(i => i._by === 'manual');
  if (m && fails.length && (manualFails.length || !(m.manual && m.manual.override))) {
    st = 'fail'; ev = `${fails.length} fail · ${asks.length} ask — ${itemsTxt(fails.concat(asks))}`;
    if (m.manual) ev += ` · manual ${m.manual.status} ignored: ${fails.length} finding(s) stand — only record.cjs --override "<designer decision>" closes instrument findings`;
  } else if (m && m.manual && m.manual.status === 'pass' && nr.length && !m.manual.covers) {
    // a manual pass of the measured part does not close what the instrument could not run
    st = 'not-run'; ev = `partial — manual pass of the measured part (${m.manual.note || '—'}), but NOT RUN: ${nr.join('; ')} — check it and record with --covers-not-run, or route it`;
  } else if (m && m.manual) {
    st = m.manual.status;
    ev = (st === 'pass' ? 'manual: ' : st === 'na' ? 'manual n/a: ' : 'routed: ') + (m.manual.note || '—');
    if (m.manual.override && (fails.length || asks.length)) ev += ` · override: ${m.manual.override} (${fails.length} fail, ${asks.length} ask overridden)`;
    else if (asks.length) ev += ` · answers ${asks.length} ❓`;
    if (nr.length && st !== 'routed') ev += ` · closes NOT RUN: ${nr.join('; ')}`;
  } else if (asks.length) {
    st = 'ask'; ev = `${asks.length} ask — ${itemsTxt(asks)}`;
  } else if (applies !== true) {
    st = 'na'; ev = `n/a: ${applies} (${applies.startsWith('platform') ? platformSrc : stageSrc})`;
  } else if (nr.length) {
    st = 'not-run'; ev = (measured ? `partial — measured by ${m.tools.join(', ')}, but NOT RUN: ` : 'NOT RUN: ') + nr.join('; ');
  } else if (m && m.na.length) {
    st = 'na'; ev = m.na.join('; ');
  } else if (m && measured && m.tested === 0) {
    st = 'not-run'; ev = `${m.tools.join(', ')} ran but tested 0 subjects — a selector that finds nothing is NOT RUN, not pass (references/instruments.md)`;
  } else if (m && measured) {
    st = 'pass'; ev = `ran by ${m.tools.join(', ')}${typeof m.tested === 'number' ? ` · tested ${m.tested}` : ''} · 0 findings` + (m.notes.length ? ' — ' + clip(m.notes.join('; '), 300) : '');
  } else if (gateAbsent(r.gate)) {
    st = 'na'; ev = `subject absent: no ${r.gate} (${GATES[r.gate] || r.gate}) found by the presence sweep (RUN-02)`;
  } else {
    st = 'not-run'; ev = needs();
  }
  if ((st === 'fail' || st === 'ask') && nr.length) { partial = nr.join('; '); ev += ` · NOT RUN part: ${partial}`; }
  if (st === 'not-run' && measured && nr.length) partial = nr.join('; ');
  return { ...r, toolFor: tool, st, ev, partial, override: m && m.manual && m.manual.override || null, notRun: nr, m };
});

// ---------- time table ----------
// "Step | Time | Why this long | Share": one row per qa-run step and one per other tool that ran in this run. 30 min is the
// upper bound of a run, not its target; over the budget the table says which steps took the time and why.
function dur(ms) { const t = Math.round((ms || 0) / 1000); if (t < 60) return `${t} s`; const m = Math.floor(t / 60), s = t % 60; return m < 60 ? `${m} min${s ? ' ' + s + ' s' : ''}` : `${Math.floor(m / 60)} h ${m % 60} min`; }
function buildTiming() {
  const rowsT = []; const meta = { tools: [], budgetMinutes: null, totalMs: 0 };
  for (const s of accepted) {
    const t = s.r && s.r._timing; if (!t || typeof t !== 'object' || !(t.totalMs >= 0)) continue;
    meta.tools.push({ tool: s.tool, startMs: t.startMs || null, endMs: t.endMs || null, totalMs: t.totalMs, why: t.why || '', steps: Array.isArray(t.steps) ? t.steps : [], busy: t.busy || null });
    if (s.tool === 'qa-run' && t.budgetMinutes) meta.budgetMinutes = t.budgetMinutes;
    if (Array.isArray(t.steps) && t.steps.length) {
      let sum = 0; for (const x of t.steps) { rowsT.push({ step: `${s.tool} · ${x.label || x.id}`, ms: x.ms, why: x.why || '' }); sum += x.ms || 0; }
      if (t.totalMs - sum > 5000) rowsT.push({ step: `${s.tool} · other (start, browsers, saving)`, ms: t.totalMs - sum, why: '' });
    } else rowsT.push({ step: s.tool, ms: t.totalMs, why: t.why || '' });
  }
  // wall-clock span of the run: tools usually run one after another, so the sum is the honest total
  meta.totalMs = meta.tools.reduce((n, x) => n + (x.totalMs || 0), 0);
  if (!rowsT.length) return { rows: [], md: '', meta };
  const budget = meta.budgetMinutes || (+cfg.budgetMinutes || 30); meta.budgetMinutes = budget;
  const over = meta.totalMs > budget * 60000;
  let out = `## Time\n\n| Step | Time | Why this long (pages × widths × engines, items) | Share |\n|---|---|---|---|\n`;
  for (const r of rowsT) out += `| ${md(r.step)} | ${dur(r.ms)} | ${md(clip(r.why, 300))} | ${meta.totalMs ? Math.round(100 * r.ms / meta.totalMs) : 0} % |\n`;
  out += `| **Total** | **${dur(meta.totalMs)}** | budget ${budget} min — ${over ? '**over the budget**' : `${Math.round(100 * meta.totalMs / (budget * 60000))} % of it`} | 100 % |\n\n`;
  const qa = meta.tools.find(x => x.tool === 'qa-run');
  if (qa && qa.busy) {
    const top = Object.entries(qa.busy).filter(([k]) => !/ load$|^quiet waits/.test(k)).sort((x, y) => y[1].ms - x[1].ms).slice(0, 8);
    if (top.length) out += `Biggest sub-steps of qa-run (busy time; parallel workers can add up to more than the wall time): ${top.map(([k, v]) => `${md(k)} ${dur(v.ms)} (${v.n}×)`).join(' · ')}\n\n`;
    const qw = qa.busy['quiet waits'], qs = qa.busy['quiet waits: saved vs fixed sleeps'];
    if (qw) out += `Condition-based waits: ${qw.n} waits took ${dur(qw.ms)}${qs ? ` (the fixed sleeps they replace add up to ≈ ${dur(qw.ms + qs.ms)}: ≈ ${dur(qs.ms)} of busy time saved)` : ''}.\n\n`;
  }
  out += over
    ? `> ⏱ The run took longer than the ${budget}-minute budget. The steps above show where the time went; steps the budget cut are listed under RUN-04 as NOT RUN with the reason.\n`
    : `> ⏱ ${budget} min is the upper bound of a run, not its target.\n`;
  return { rows: rowsT, md: out, meta };
}

// ---------- summary ----------
const ICON = { fail: '🔴', ask: '❓', pass: '✅', na: '⊘', 'not-run': '⚠️', routed: '🔁' };
const count = s => rows.filter(r => r.st === s).length;
const partialRows = rows.filter(r => r.partial && (r.st === 'fail' || r.st === 'ask' || r.st === 'not-run'));
const unfinishedN = count('not-run') + partialRows.filter(r => r.st !== 'not-run').length + invalid.length + unknown.length;
const sv = L.skillVersion(); const skill = { version: sv.version || '?', scripts: sv.hash };
const cfgHash = Object.keys(cfg).length ? L.sha1(L.stable(cfg)).slice(0, 12) : null;
const envRows = accepted.filter(s => s.r._env && typeof s.r._env === 'object').map(s => ({ file: s.file, tool: s.tool, at: s.at, env: s.r._env }));
const envDiff = []; {
  const pick = (e, k) => { const v = k.split('.').reduce((o, x) => (o && typeof o === 'object' ? o[x] : undefined), e); return v == null ? null : typeof v === 'object' ? canon(v) : String(v); };
  for (const k of ['skill.hash', 'skill.version', 'config', 'base', 'os']) { const vals = [...new Set(envRows.map(x => pick(x.env, k)).filter(v => v !== null))]; if (vals.length > 1) envDiff.push(`${k}: ${vals.join(' vs ')}`); }
}

let mdOut = `# QA manifest\n\n`;
mdOut += `Run \`${run ? run.runId : 'unknown'}\` · base ${md((run && run.base) || cfg.base || bases[0] || '?')} · started ${run ? run.startedAt : '?'} · skill ${skill.version} (scripts ${skill.scripts}) · config ${cfgHash || 'none'} · platform ${platform ? `**${platform}** (${md(platformSrc)})` : '**unknown**'} · stage ${stage ? `${stage} (${md(stageSrc)})` : 'both'}\n\n`;
mdOut += `Generated ${new Date().toISOString()} — the only line that differs when the same results are merged again.\n\n`;
if (!run) mdOut += `> ⚠️ No \`run.json\` in this folder: results cannot be tied to one run. Start every run with \`snapshot.cjs\` (step 1).\n\n`;
if (platform && platform !== 'wordpress' && accepted.some(s => s.tool === 'wp-admin')) mdOut += `> ⚠️ results-wp-admin.json is part of this run but the platform is ${platform} (${md(platformSrc)}) — one of them is wrong; check RUN-05 or pass --platform.\n\n`;
if (bases.length > 1) mdOut += `> ⚠️ Accepted results come from different sites: ${bases.join(', ')} — use one --out folder per site.\n\n`;
const cuts = [...new Set(accepted.flatMap(s => { const f = (s.r._env && s.r._env.flags) || {}; return Object.keys(f).filter(k => ['quick', 'pages', 'engines', 'widths', 'max-pages', 'maxPages', 'budget'].includes(k)).map(k => `${s.tool} --${k}${f[k] === true ? '' : ' ' + f[k]}`).concat(s.r._partial ? [`${s.tool}: partial`] : []); }))].sort(byStr);
if (cuts.length) mdOut += `> ⚠️ PARTIAL RUN — coverage was cut (${md(cuts.join(', '))}): this manifest is not the manifest of the whole site and is not compared with a full run.\n\n`;
if (envDiff.length) mdOut += `> ⚠️ Results were produced under different conditions: ${md(envDiff.join(' · '))} — compare them with care or rerun.\n\n`;
mdOut += `Sources: ${sources.map(s => `${md(s.file)} (${s.status === 'ok' ? (s.at || 'no time') : s.status})`).join(', ') || 'none'}\n\n`;
if (envRows.length) {
  mdOut += `| Tool | Written | Run conditions |\n|---|---|---|\n`;
  const envLine = e => {
    const sk = e.skill || {}; const eng = Object.entries(e.engines || {}).sort(([p], [q]) => byStr(p, q)).map(([k, v]) => `${k} ${v && (v.version || (v.error ? 'FAILED' : '')) || ''}${v && v.how ? ' (' + v.how + ')' : ''}`.trim());
    const flags = Object.keys(e.flags || {}).length ? canon(e.flags) : '';
    return [`${e.os || '?'} ${e.osRelease || ''} ${e.arch || ''}`.trim(), e.node && `node ${e.node}`, (sk.version || sk.hash) && `skill ${sk.version || '?'}/${sk.hash || '?'}`, e.config && `config ${e.config}`, (e.locale || e.timezoneId) && `${e.locale || '?'} / ${e.timezoneId || '?'}`, eng.length && `engines: ${eng.join(', ')}`, e.speller && `speller ${e.speller}`, e.lighthouse && `lighthouse ${e.lighthouse} · ${e.lighthouseBrowser || ''} · benchmarkIndex ${e.benchmarkIndex != null ? e.benchmarkIndex : '?'}`, flags && `flags ${flags}`].filter(Boolean).join(' · ');
  };
  for (const x of envRows) mdOut += `| ${md(x.tool)} | ${md(x.at || '')} | ${md(clip(envLine(x.env), 400))} |\n`;
  mdOut += '\n';
}
// ---------- time report: where the run's time went (every tool's _timing; qa-run adds its steps) ----------
const TIMING = buildTiming();
if (TIMING.rows.length) mdOut += TIMING.md + '\n';
mdOut += `| 🔴 fail | ❓ ask | ✅ pass | ⊘ n/a | 🔁 routed | ⚠️ not run |\n|---|---|---|---|---|---|\n| ${count('fail')} | ${count('ask')} | ${count('pass')} | ${count('na')} | ${count('routed')} | ${count('not-run')} |\n\n`;
mdOut += `| ID | P | Check | Status | Evidence |\n|---|---|---|---|---|\n`;
for (const r of rows) mdOut += `| ${r.id} | ${r.P} | ${md(r.title)} | ${ICON[r.st]} ${r.st}${r.partial ? ' (partial)' : ''} | ${md(r.ev)} |\n`;
if (unfinishedN) {
  mdOut += `\n**Unfinished run.** ${count('not-run')} row(s) not run` + (partialRows.length ? `, ${partialRows.length} measured only in part` : '') + (invalid.length ? `, ${invalid.length} unreadable results file(s)` : '') + (unknown.length ? `, ${unknown.length} unknown ID(s)` : '') + `.\n`;
  mdOut += `Close each with its tool, or record it: \`record.cjs --id ID --status routed --note "who, where, by when"\` (or \`--status na --note "why"\`).\n`;
}
if (partialRows.length) { mdOut += `\n## Partial coverage\n\n`; for (const r of partialRows) mdOut += `- ${r.id} (${r.st}): NOT RUN part — ${md(r.partial)}\n`; }
if (ignored.length) { mdOut += `\n## Ignored results (other run, other site or stale)\n\n`; for (const s of ignored) mdOut += `- ${md(s.file)} · tool ${md(s.tool)} · written ${md(s.at || '?')} — ${md(s.why)}\n`; }
if (invalid.length) { mdOut += `\n## Unreadable results\n\n`; for (const x of invalid) mdOut += `- ${md(x.file)} — ${md(x.why)} → rerun its tool, or re-import with record.cjs --import\n`; }
if (unknown.length) { mdOut += `\n## Unknown IDs (results recorded under an ID the registry does not have)\n\n`; for (const id of unknown) mdOut += `- ${md(id)} from ${md(merged[id].tools.join(', '))}: ${merged[id].items.length} item(s) — fix the ID (record.cjs --reset, then record under the right ID) or add the check to registry.cjs\n`; }
mdOut += `\n## Findings\n`;
for (const r of rows.filter(r => r.m && r.m.items.length)) {
  mdOut += `\n### ${r.id} · ${md(r.title)}\n\n`;
  r.m.items.slice(0, 60).forEach(i => { mdOut += `- ${i.ask ? '❓ ' : ''}${i._by ? '(manual) ' : ''}${Object.entries(i).filter(([k]) => k !== 'ask' && k !== '_by').map(([k, v]) => `${md(k)}: ${md(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ')}\n`; });
  if (r.m.items.length > 60) mdOut += `- … ${r.m.items.length - 60} more in manifest.json\n`;
}
const failOn = typeof a['fail-on'] === 'string' ? a['fail-on'] : '';
const line = `MANIFEST fail=${count('fail')} ask=${count('ask')} pass=${count('pass')} na=${count('na')} routed=${count('routed')} notrun=${count('not-run')} partial=${partialRows.length} invalid=${invalid.length} ignored=${ignored.length} unknown=${unknown.length} unfinished=${unfinishedN ? 'yes' : 'no'}`;

writeAtomic(path.join(OUT, 'manifest.md'), mdOut);
writeAtomic(path.join(OUT, 'manifest.json'), JSON.stringify(rows.map(({ m, ...r }) => ({ ...r, findings: m ? m.items.map(({ _by, ...i }) => (_by ? Object.assign(i, { by: _by }) : i)) : [] })), null, 1));
writeAtomic(path.join(OUT, 'manifest-meta.json'), JSON.stringify({
  generated: new Date().toISOString(), run, skill, config: cfgHash, platform, platformSource: platformSrc || null, stage, stageSource: stageSrc || null,
  sources: sources.map(({ r, ...s }) => s), ignored: ignored.map(({ r, ...s }) => s), invalid, unknown,
  counts: { fail: count('fail'), ask: count('ask'), pass: count('pass'), na: count('na'), routed: count('routed'), notRun: count('not-run'), partial: partialRows.length },
  unfinished: !!unfinishedN, cuts, env: envRows, envDiff, presence, timing: TIMING.meta,
}, null, 1));
console.log(mdOut.split('\n## Findings')[0]);
console.log(line);
process.exitCode = unfinishedN ? 3 : (failOn === 'fail' && count('fail') ? 1 : 0);
