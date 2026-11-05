// qa-check · state.cjs — record a finished run in the project's .qa-state.json, the same way on every machine.
//
//   node <skill>/scripts/state.cjs --out qa-out [--config qa-target.json]
//
// Run it from the PROJECT folder after manifest.cjs (step 9). It reads qa-out/manifest.json + manifest-meta.json and:
//   - appends one entry to "runs": stage, time, base, manifest path, runId, skill version, counts, the RUN-01 line;
//     a manifest that was already recorded (same runId and the same counts) is not added twice;
//   - for every registry ID that is fail / ask / not-run / routed now, or was ever recorded before, sets
//     findings[ID].status and .run to this run — and only those two fields. cause, origin, visible, found_by, stage,
//     answered and fixed are the agent's to write (SKILL.md → «The state file») and are never touched here;
//     a lifecycle status the agent set (fixed, accepted, accepted-limitation) is kept while the row is not failing;
//   - never deletes anything. An older file without "schema": 2 is renamed to .qa-state.v1.json first (never deleted).
// A partial run (--pages / --engines / --widths / --quick) is not recorded as a run: it is a re-check, not history.
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');

const a = L.args(process.argv.slice(2));
const OUT = L.outDirFrom(a);
const die = m => { console.error('state: ' + m); process.exit(1); };

const rowsR = L.tryReadJson(path.join(OUT, 'manifest.json'), 'manifest.json');
if (!rowsR.ok || !Array.isArray(rowsR.data)) die(`no manifest in ${OUT} — run manifest.cjs first (${rowsR.error || 'not an array'})`);
const metaR = L.tryReadJson(path.join(OUT, 'manifest-meta.json'), 'manifest-meta.json');
const meta = metaR.ok ? metaR.data : {};
if (Array.isArray(meta.cuts) && meta.cuts.length) { console.log(`state: partial run (${meta.cuts.join(', ')}) — not recorded as a run`); process.exit(0); }

const projectDir = path.dirname(L.configPath(a));
const file = path.join(projectDir, '.qa-state.json');
let st = { schema: 2, platform: null, url: null, runs: [], findings: {}, 'declared-placeholders': [], reports: [] };
if (fs.existsSync(file)) {
  const r = L.tryReadJson(file, '.qa-state.json');
  if (!r.ok) die(`${file} is not valid JSON (${r.error}) — fix or rename it; nothing written`);
  if (r.data && r.data.schema === 2) st = Object.assign(st, r.data);
  else {
    let dest = path.join(projectDir, '.qa-state.v1.json'), k = 2;
    while (fs.existsSync(dest)) dest = path.join(projectDir, `.qa-state.v1-${k++}.json`);
    fs.renameSync(file, dest); console.log(`state: older state file kept as ${path.basename(dest)}`);
    const old = r.data || {};
    st.platform = old.platform || null; st.url = old.url || null;
    if (Array.isArray(old['declared-placeholders'])) st['declared-placeholders'] = old['declared-placeholders'];
    if (Array.isArray(old.reports)) st.reports = old.reports;
  }
}
if (!Array.isArray(st.runs)) st.runs = [];
if (!st.findings || typeof st.findings !== 'object') st.findings = {};

const run = meta.run || {};
const rows = rowsR.data;
const counts = { fail: 0, ask: 0, pass: 0, na: 0, routed: 0, 'not-run': 0 };
rows.forEach(r => { if (r.st in counts) counts[r.st]++; });
const at = (run.startedAt || new Date().toISOString()).slice(0, 16);
const r01 = rows.find(r => r.id === 'RUN-01');
const entry = {
  stage: Number(meta.stage) || meta.stage || null, at, base: run.base || null,
  manifest: path.relative(projectDir, path.join(OUT, 'manifest.json')).split(path.sep).join('/'),
  archivedAs: run.runId ? path.relative(projectDir, path.join(OUT, '_prev', run.runId, 'manifest.json')).split(path.sep).join('/') : null, // where the next run moves it
  runId: run.runId || null, skill: (meta.skill && meta.skill.version) || null, counts,
  snapshot: r01 ? String(r01.ev || '').slice(0, 200) : null,
};
const same = st.runs.find(x => x && x.runId && x.runId === entry.runId);
if (same && JSON.stringify(same.counts) === JSON.stringify(counts)) console.log('state: this manifest is already recorded — run entry unchanged');
else if (same) Object.assign(same, entry);
else st.runs.push(entry);
if (meta.platform) st.platform = meta.platform;
if (run.base && Number(entry.stage) !== 1) st.url = run.base;

const LIFE = new Set(['fixed', 'accepted', 'accepted-limitation']);
let touched = 0;
for (const r of rows) {
  const prev = st.findings[r.id];
  const now = r.st;
  if (!prev && !['fail', 'ask', 'not-run', 'routed'].includes(now)) continue;
  const f = prev && typeof prev === 'object' ? prev : {};
  if (prev && LIFE.has(prev.status) && now !== 'fail') { /* the agent's lifecycle verdict stands */ }
  else f.status = now;
  f.run = at;
  st.findings[r.id] = f; touched++;
}
fs.writeFileSync(file, JSON.stringify(st, null, 2) + '\n');
console.log(`state: ${file} · run ${entry.runId || '?'} (stage ${entry.stage}) · ${touched} finding row(s) updated · counts ${JSON.stringify(counts)}`);
console.log('next: add cause / origin / visible / found_by / stage for new 🔴 🟡 ⚠️ ❓ rows, and answered / fixed when they happen');
