#!/usr/bin/env node
// Record a check closed by hand, by a tool without a script, or routed to a person — or import a results file
// that was produced outside node (e.g. the JSON saved from wp-admin-audit.js).
//
// Every form works in every shell (cmd, PowerShell, Git Bash, zsh): no inline JSON is needed.
//   node record.cjs --out qa-out --id TEXT-02 --status pass   --note "41 candidates read, 0 real errors"
//   node record.cjs --out qa-out --id FORM-09 --status fail   --where "Footer form" --why "no page URL in the admin email"
//   node record.cjs --out qa-out --id MAP-02  --status ask    --where "/contact/" --why "map shows a watermark: key or billing?"
//   node record.cjs --out qa-out --id WP-01   --status na     --note "not WordPress (RUN-05)"
//   node record.cjs --out qa-out --id XB-04   --status routed --note "Edge: QA tester on a Windows machine, before launch"
//   node record.cjs --out qa-out --id LAY-07  --status pass   --override "designer decision <date>: compact button variant is intended" --note "…"
//   node record.cjs --out qa-out --id FORM-09 --reset                     (forget every manual record of that ID)
//   node record.cjs --out qa-out --import qa-out/wp-admin.raw.json --tool wp-admin --len <QA_WP.len> --sum <QA_WP.sum>
// Item fields: --where --why --page --url --form --field --selector --engine --width, or --item-file item.json,
// or --item '{"…":"…"}' (inline JSON breaks in PowerShell 5.1 and cmd — prefer the flags).
// Rules:
//   status is pass | fail | ask | na | routed — anything else exits 1, and so does an ID the registry does not know.
//   pass, na and routed need --note (the evidence, the reason, the owner); fail and ask need an item or a --note.
//   A manual pass / na / routed never hides a finding of an instrument: the manifest keeps 🔴 unless --override
//   carries a recorded designer decision. A manual pass answers ❓ asks (e.g. spelling candidates read in context).
//   A pass on an ID whose instrument left a NOT RUN part (an engine that did not start, a language without a dictionary)
//   needs --covers-not-run: the person checked that part too. Otherwise route the part with --status routed.
//   --as <label> writes results-manual-<label>.json, so records made on another machine do not overwrite these.
const fs = require('fs'), path = require('path'); const L = require('./lib.cjs'); const REG = require('./registry.cjs');
const a = L.args(process.argv.slice(2)); const OUT = L.outDirFrom(a);
const STATUSES = ['pass', 'fail', 'ask', 'na', 'routed'];
const die = m => { console.error('record: ' + m); process.exit(1); };
const str = v => (typeof v === 'string' ? v.trim() : '');

const readJsonFile = f => L.readJson(f, path.basename(f)); // UTF-8 with or without BOM, or UTF-16 (PowerShell 5.1)
// The decoded text of a file (same encodings as readJson), for the length / hash check of an imported copy.
function rawText(f) {
  const buf = fs.readFileSync(f); let t;
  if (buf[0] === 0xFF && buf[1] === 0xFE) t = buf.subarray(2).toString('utf16le');
  else if (buf[0] === 0xFE && buf[1] === 0xFF) { const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1))); b.swap16(); t = b.toString('utf16le'); }
  else t = buf.toString('utf8');
  return t.replace(/^\uFEFF/, '');
}
const writeAtomic = (f, s) => L.writeJsonAtomic(f, s);
const origin = u => { try { return L.hostKey(u); } catch (e) { return null; } }; // site identity: www/non-www and http/https are one site
function configBase() { try { return String(L.readTarget(a).base || '').replace(/\/$/, '') || null; } catch (e) { return null; } }
// Move a results file of an earlier run out of the way, next to that run's other files (never delete).
function archive(file, runId) {
  const dest = path.join(OUT, '_prev', String(runId || 'legacy-' + fs.statSync(file).mtime.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')));
  fs.mkdirSync(dest, { recursive: true });
  let target = path.join(dest, path.basename(file)), n = 1;
  while (fs.existsSync(target)) target = path.join(dest, path.basename(file, '.json') + '-' + (n++) + '.json');
  fs.renameSync(file, target); return target;
}

fs.mkdirSync(OUT, { recursive: true });
const run = L.currentRun(OUT);
const base = (run && run.base) || (typeof a.base === 'string' && a.base.replace(/\/$/, '')) || configBase() || null;

// ---------- import mode: a whole results file produced elsewhere ----------
if (a.import) {
  const src = path.resolve(String(a.import)); if (!fs.existsSync(src)) die('no such file: ' + src);
  // --len / --sum: the length (JS string length) and FNV-1a 32-bit hash (UTF-16 code units) the browser printed
  // (QA_WP.len / QA_WP.sum). With them a retyped, truncated or "repaired" copy is refused instead of imported.
  if (a.len !== undefined || a.sum !== undefined) {
    const txt = rawText(src).replace(/\s+$/, '');
    const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
    if (a.len !== undefined && a.len !== true && +a.len !== txt.length) die(`${path.basename(src)} has ${txt.length} characters, the browser said ${a.len} (QA_WP.len) — a chunk is missing, doubled or edited: transfer QA_WP.chunk(0…parts-1) again, unedited`);
    if (a.sum !== undefined && a.sum !== true && String(a.sum).toLowerCase() !== fnv(txt)) die(`${path.basename(src)} hash ${fnv(txt)} ≠ ${a.sum} (QA_WP.sum) — the copy differs from the browser's: compare per chunk with QA_WP.sums[i] and transfer the differing chunk again, unedited`);
  } else console.error('record: note — no --len / --sum given: the copy is not verified against QA_WP.len / QA_WP.sum');
  let data; try { data = readJsonFile(src); } catch (e) { die(`${e.message} A truncated copy is the usual cause: transfer QA_WP.chunk(0) … QA_WP.chunk(QA_WP.parts-1) again in order, unedited, save as plain UTF-8, and pass --len / --sum.`); }
  if (!data || typeof data !== 'object' || !data.checks || typeof data.checks !== 'object') die('not a results file: no "checks" object');
  const tool = str(a.tool) || str(data._tool); if (!/^[a-z0-9][a-z0-9-]*$/.test(tool) || /^manual/.test(tool)) die('give the instrument name with --tool (e.g. wp-admin)');
  if (data._base && base && origin(data._base) !== origin(base)) die(`the file was produced on ${data._base}, this run is for ${base} — refusing to mix two sites`);
  const unknown = Object.keys(data.checks).filter(id => !REG.byId(id));
  data._tool = tool; data._imported = new Date().toISOString(); if (run) data._runId = run.runId; if (!data._base && base) data._base = base;
  if (!data._at) data._at = data._imported;
  const f = path.join(OUT, `results-${tool}.json`); writeAtomic(f, JSON.stringify(data, null, 1));
  console.log(`imported ${Object.keys(data.checks).length} check(s) as ${path.basename(f)}${run ? ' into run ' + run.runId : ' (no run.json — start every run with snapshot.cjs)'}`);
  if (unknown.length) console.error('record: warning — IDs not in the registry (the manifest lists them as unknown): ' + unknown.join(', '));
  process.exit(0);
}

// ---------- single record ----------
const id = str(a.id).toUpperCase(); if (!id) die('need --id ID (see references/check-registry.md)');
if (!REG.byId(id)) {
  const pre = id.split('-')[0]; const near = REG.filter(r => r.id.startsWith(pre + '-')).map(r => r.id).slice(0, 12);
  die(`unknown id "${id}" — nothing recorded.` + (near.length ? ' Same area: ' + near.join(', ') : ' Areas: ' + [...new Set(REG.map(r => r.id.split('-')[0]))].join(', ')));
}
const label = a.as ? String(a.as).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') : '';
const f = path.join(OUT, label ? `results-manual-${label}.json` : 'results-manual.json');
let R = null;
if (fs.existsSync(f)) {
  try { R = readJsonFile(f); } catch (e) { die(`${e.message} — fix or move it; nothing recorded`); }
  if (run && R._runId && R._runId !== run.runId) { const moved = archive(f, R._runId); console.error(`record: ${path.basename(f)} belonged to run ${R._runId} — moved to ${path.relative(OUT, moved)}; starting a fresh record for run ${run.runId}`); R = null; }
  else if (run && !R._runId && R._at && R._at < run.startedAt) { const moved = archive(f, null); console.error(`record: ${path.basename(f)} is older than this run — moved to ${path.relative(OUT, moved)}`); R = null; }
}
if (!R || typeof R !== 'object' || !R.checks) R = { _tool: 'manual', checks: {} };
if (!run) console.error('record: warning — no run.json in ' + OUT + '; the manifest cannot tell this record from an older run. Start every run with snapshot.cjs.');

if (a.reset) {
  const had = !!R.checks[id]; delete R.checks[id];
  stampAndWrite(); console.log(had ? `reset ${id}` : `nothing recorded for ${id} — nothing to reset`); process.exit(0);
}

const st = str(a.status).toLowerCase();
if (!STATUSES.includes(st)) die(`--status must be one of ${STATUSES.join(' | ')} (got "${typeof a.status === 'string' ? a.status : ''}") — nothing recorded`);
const note = str(a.note); const override = str(a.override);

// Build the item without shell-fragile JSON when possible.
let items = [];
if (a['item-file']) {
  let v; try { v = readJsonFile(path.resolve(String(a['item-file']))); } catch (e) { die('--item-file: ' + e.message); }
  items = (Array.isArray(v) ? v : [v]).filter(x => x && typeof x === 'object' && !Array.isArray(x));
  if (!items.length) die('--item-file must hold an object or an array of objects');
}
if (a.item) {
  let v; try { v = JSON.parse(String(a.item)); } catch (e) { die(`--item is not valid JSON (${e.message}). Your shell probably stripped the quotes: use --where/--why (or --item-file) instead.`); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) die('--item must be one JSON object');
  items.push(v);
}
const FIELD_FLAGS = ['where', 'why', 'page', 'url', 'form', 'field', 'selector', 'engine', 'width'];
const fromFlags = {}; for (const k of FIELD_FLAGS) if (str(a[k])) fromFlags[k] = str(a[k]);
if (Object.keys(fromFlags).length) items.push(fromFlags);

// NOT RUN parts an instrument recorded for this ID in this run: a manual pass must say it covers them too.
function toolNotRun() {
  const out = [];
  for (const n of fs.readdirSync(OUT).filter(n => /^results-.*\.json$/.test(n) && !/^results-manual/.test(n)).sort(L.byStr)) {
    let r; try { r = readJsonFile(path.join(OUT, n)); } catch (e) { continue; }
    if (run && r._runId && r._runId !== run.runId) continue;
    const c = r.checks && r.checks[id]; if (c && c.notRun) out.push(`${r._tool || n}: ${c.notRun}`);
  }
  return out;
}
const covers = !!a['covers-not-run'];
if (st === 'pass' && !covers) { const nr = toolNotRun(); if (nr.length) die(`${id} has a NOT RUN part from an instrument: ${nr.join('; ')}. A pass must cover it: check that part too and add --covers-not-run (say how in --note), or record --status routed for it — nothing recorded`); }
if (['pass', 'na', 'routed'].includes(st)) {
  if (!note) die(`--status ${st} needs --note (${st === 'pass' ? 'what was seen, where, which screenshot' : st === 'na' ? 'why it does not apply' : 'who checks it, where, by when'}) — nothing recorded`);
  if (items.length) die(`items belong to fail / ask records, not to --status ${st}`);
}
if (['fail', 'ask'].includes(st)) {
  if (override) die('--override only goes with --status pass, na or routed');
  if (!items.length) { if (note) items.push({ why: note }); else die(`--status ${st} needs --where "…" --why "…" (or --note "what is wrong") — nothing recorded`); }
}

const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x));
const prev = R.checks[id];
const prevFails = prev ? (prev.items || []).filter(i => !i.ask) : [];
let c;
if (['pass', 'na', 'routed'].includes(st)) {
  // A manual fail is cleared only on purpose (--reset first). Manual asks are answered by this verdict.
  if (prevFails.length) die(`${id} has ${prevFails.length} manual fail item(s); if it is really fixed, run --reset first, then record again — nothing recorded`);
  c = { status: st, items: [], notes: [note] };
  if (st === 'pass') { c.ran = true; if (covers) c.coversNotRun = true; }
  if (st === 'na') c.na = note;
  if (override) c.override = override;
  if (prev && (prev.items || []).length) c.answered = (prev.items || []).length;
} else {
  c = prev && ['fail', 'ask'].includes(prev.status) ? prev : { items: [], notes: [] };
  c.items = c.items || []; c.notes = c.notes || [];
  const seen = new Set(c.items.map(canon));
  for (const it of items) { const x = Object.assign({}, it); if (st === 'ask') x.ask = true; else delete x.ask; const k = canon(x); if (!seen.has(k)) { seen.add(k); c.items.push(x); } }
  if (note && !c.notes.includes(note)) c.notes.push(note);
  c.ran = true; c.status = c.items.some(i => !i.ask) ? 'fail' : 'ask';
  delete c.na; delete c.override; delete c.answered;
}
if (str(a.by)) c.by = str(a.by);
c.at = new Date().toISOString();
R.checks[id] = c;
stampAndWrite();
console.log(`recorded ${id} ${c.status}${c.items.length ? ` (${c.items.length} item${c.items.length > 1 ? 's' : ''})` : ''}${c.override ? ' with override' : ''} → ${path.basename(f)}`);

function stampAndWrite() {
  R._tool = 'manual'; R._at = new Date().toISOString();
  if (run) R._runId = run.runId; else delete R._runId;
  if (base) R._base = base;
  writeAtomic(f, JSON.stringify(R, null, 1));
}
