// qa-check · wp-admin-cfg.cjs — builds the QA_WP_CFG that wp-admin-audit.js reads, the same way on every machine.
//
//   node <skill>/scripts/wp-admin-cfg.cjs --out qa-out [--config qa-target.json]
//
// Run it from the PROJECT folder after qa-run.cjs (step 2). It writes qa-out/wp-admin.cfg.js:
//   window.QA_WP_CFG = <qa-target.json> + "pages" (qa-out/pages.json → all) + "presence" (results-qa-run.json → _presence)
// The agent executes that file's text, unchanged, in the logged-in wp-admin tab before wp-admin-audit.js.
// Nobody assembles QA_WP_CFG by hand, so two agents never give the admin audit different inputs.
// Nothing is sent anywhere and nothing secret is read: qa-target.json holds no passwords (sessions stay in the
// person's own files and are not copied here).
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');

const a = L.args(process.argv.slice(2));
const OUT = L.outDirFrom(a);
const die = m => { console.error('wp-admin-cfg: ' + m); process.exit(1); };

let raw; try { raw = L.readTarget(a); } catch (e) { die(e.message); }
if (!raw || !Object.keys(raw).length) die(`no qa-target.json (looked for ${L.configPath(a)}) — run from the project folder`);
if (!raw.base) die('qa-target.json has no "base" — the admin audit belongs to a deployed site (stage 2)');
const cfg = JSON.parse(JSON.stringify(raw));
delete cfg._help; delete cfg.storageState; // a session file path is of no use inside the browser
const notes = [];

const run = L.currentRun(OUT);
if (!run) notes.push('no run.json in ' + OUT + ' — start the run with snapshot.cjs (step 1)');

const plan = L.readPlan(OUT, null);
if (plan && Array.isArray(plan.all) && plan.all.length) { cfg.pages = plan.all.slice(); notes.push(`pages: ${plan.all.length} from pages.json`); }
else notes.push('pages: no qa-out/pages.json — run qa-run.cjs first (step 2); the audit falls back to the sitemap');

const rq = L.tryReadJson(path.join(OUT, 'results-qa-run.json'), 'results-qa-run.json');
if (rq.ok && rq.data && rq.data._presence && typeof rq.data._presence === 'object') {
  if (run && rq.data._runId && rq.data._runId !== run.runId) notes.push('presence: results-qa-run.json belongs to another run — not used');
  else { cfg.presence = rq.data._presence; notes.push(`presence: ${Object.keys(rq.data._presence).length} gates from results-qa-run.json`); }
} else notes.push('presence: not available (results-qa-run.json missing or without _presence) — FORM-08/09 are then left to the presence sweep');

// Keys sorted, so the same inputs always give the same file (and the same hash) on every machine.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]); return o; }
  return v;
}
const json = JSON.stringify(sortKeys(cfg));
const file = path.join(OUT, 'wp-admin.cfg.js');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(file, `window.QA_WP_CFG = ${json};\n'QA_WP_CFG set (${json.length} characters)';\n`);
console.log(`wrote ${file} (${json.length} characters) · ${notes.join(' · ')}`);
console.log('next: execute the text of this file in the logged-in wp-admin tab, then the text of scripts/wp-admin-audit.js');
