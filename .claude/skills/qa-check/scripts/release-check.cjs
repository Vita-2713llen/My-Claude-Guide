// qa-check · release-check.cjs — is this skill folder generic and clean enough to give to a colleague?
//
//   node <skill>/scripts/release-check.cjs [--deny <file>] [--list]
//   (npm run release-check inside scripts/)
//
// Fails (exit 1) on anything that must never ship inside the skill:
//   files     backups (*.bak*, *.orig, *~), tool caches and other dot-folders, per-project files
//             (qa-target.json, .qa-state*.json, qa-out*/, .qa-snapshots/, results-*.json, qa-handoff-*.md, qa-bugs-*.md)
//   content   a home-folder path of a real machine (/Users/<name>/, /home/<name>/, C:\Users\<name>\),
//             an e-mail address outside the reserved example domains, an http(s) URL outside the allow-list below,
//             and every word of the --deny file (case-insensitive)
// --deny <file>: a plain-text list kept OUTSIDE the skill (one word or phrase per line, # comments) — client, project,
//   brand and person names the owner never wants in the skill. The names stay on the owner's machine; the skill only
//   learns that the check passed. Also read from the QA_RELEASE_DENY environment variable (a file path).
// --list: also print every domain-like token found, for a human to look over.
// node_modules is never scanned. Nothing is changed, moved or deleted: the check only reports.
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
const LIST = !!opt('list');
const denyFile = typeof opt('deny') === 'string' ? opt('deny') : process.env.QA_RELEASE_DENY || null;

// Reserved / generic hosts that may appear in docs and code (RFC 2606 / 6761 names, standards bodies, local hosts).
const HOST_OK = [/^(.+\.)?example\.(com|org|net)$/i, /\.example$/i, /\.test$/i, /\.localhost$/i, /^localhost$/i, /^127\.0\.0\.1$/,
  /^(www\.)?w3\.org$/i, /^(www\.)?sitemaps\.org$/i, /^(www\.)?schema\.org$/i, /^api\.w\.org$/i, /^(site|x|host)$/i];
const MAIL_OK = [/@(.+\.)?example\.(com|org|net)$/i, /@[^@]+\.example$/i, /@[^@]+\.test$/i, /@localhost$/i,
  /@webforms\.io$/i]; // webforms.io: the sender Webflow uses for every site's form notifications (a platform fact)
const TEXT_EXT = /\.(md|cjs|js|mjs|json|swift|html?|css|xml|txt|ya?ml|sh|ps1)$/i;
const SKIP_DIRS = new Set(['node_modules']);

const problems = [], warn = []; const domains = new Map();
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const bad = (f, why) => problems.push(`${rel(f)}: ${why}`);

let deny = [];
if (denyFile) {
  try { deny = fs.readFileSync(denyFile, 'utf8').split(/\r?\n/).map(s => s.replace(/#.*/, '').trim()).filter(Boolean); }
  catch (e) { console.error(`release-check: cannot read the deny list ${denyFile}: ${e.message}`); process.exit(2); }
  if (path.resolve(denyFile).startsWith(ROOT + path.sep)) { console.error('release-check: keep the deny list OUTSIDE the skill folder — it holds the very names that must not ship'); process.exit(2); }
}
const denyRe = deny.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.')) { bad(f, 'dot-folder (tool cache or project working files) — keep it out of the skill'); continue; }
      if (/^qa-out/i.test(e.name)) { bad(f, 'a run output folder — belongs to a project'); continue; }
      walk(f); continue;
    }
    const n = e.name;
    if (/\.bak|\.orig$|~$/i.test(n)) bad(f, 'backup file — keep backups outside the skill folder (e.g. ~/.claude/skills-archive/qa-check/)');
    else if (n === '.DS_Store') warn.push(`${rel(f)}: Finder metadata (harmless; tar --exclude='.*' leaves it out)`);
    else if (/^\.qa-state.*\.json$|^qa-target\.json$|^results-.*\.json$|^qa-(handoff|bugs)-.*\.md$|^\.qa-auth.*\.json$/i.test(n)) bad(f, 'per-project file — belongs in the project folder');
    if (!TEXT_EXT.test(n) || n === 'package-lock.json') continue;
    const txt = fs.readFileSync(f, 'utf8');
    const lines = txt.split(/\r?\n/);
    lines.forEach((line, i) => {
      const at = `line ${i + 1}`;
      const home = line.match(/\/Users\/(?!<)[A-Za-z0-9._-]+\/|\/home\/(?!<)[A-Za-z0-9._-]+\/|[A-Za-z]:\\\\?Users\\\\?(?!<|%)[A-Za-z0-9._ -]+\\/);
      if (home) bad(f, `${at}: a real home-folder path "${home[0]}" — use ~ / $HOME / <skill>`);
      for (const m of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g)) {
        const addr = m[0];
        if (/^[\w.-]+@\d/.test(addr) || /\.(cjs|js|json|md|png|svg|css)$/i.test(addr)) continue; // npm@10, file names
        if (!MAIL_OK.some(r => r.test(addr))) bad(f, `${at}: e-mail address "${addr}" — use name@example.com`);
      }
      for (const m of line.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
        const host = m[1].replace(/\.$/, '');
        if (!HOST_OK.some(r => r.test(host))) bad(f, `${at}: URL host "${host}" — examples use example.com; a platform or tool URL needs adding to HOST_OK in release-check.cjs on purpose`);
      }
      if (LIST) for (const m of line.matchAll(/\b[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|net|org|io|co|ie|ua|uk|de|fr|es|it|nl|pl|app|dev|site|online|studio|agency|design|ai|me|biz)\b/gi)) domains.set(m[0].toLowerCase(), (domains.get(m[0].toLowerCase()) || 0) + 1);
      denyRe.forEach((re, k) => { if (re.test(line)) bad(f, `${at}: contains a word from the deny list (entry ${k + 1})`); });
    });
  }
}
walk(ROOT);

// SKILL.md frontmatter: valid YAML (strict loaders reject a plain scalar with ": " in it), name ≤ 64, description ≤ 1024.
(() => {
  const f = path.join(ROOT, 'SKILL.md'); if (!fs.existsSync(f)) { bad(f, 'missing'); return; }
  const m = fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { bad(f, 'no YAML frontmatter'); return; }
  let fm = null;
  try { fm = require('yaml').parse(m[1]); } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') { bad(f, 'frontmatter is not valid YAML: ' + String(e.message).split('\n')[0]); return; }
    fm = {}; for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^([a-z-]+):\s*(.*)$/); if (!k) continue; let v = k[2];
      if (/^["']/.test(v)) v = v.slice(1, -1); else if (/:\s/.test(v)) bad(f, `frontmatter ${k[1]}: an unquoted value with ": " is not valid YAML — quote it`); fm[k[1]] = v; }
  }
  if (!fm || typeof fm.name !== 'string' || !fm.name) bad(f, 'frontmatter has no name');
  else if (fm.name.length > 64) bad(f, `frontmatter name is ${fm.name.length} characters (max 64)`);
  if (!fm || typeof fm.description !== 'string' || !fm.description) bad(f, 'frontmatter has no description');
  else if (fm.description.length > 1024) bad(f, `frontmatter description is ${fm.description.length} characters (max 1024 — longer ones are cut or refused by skill loaders)`);
})();

if (LIST) { console.log('domain-like tokens (look them over):'); [...domains.entries()].sort((x, y) => y[1] - x[1]).forEach(([d, n]) => console.log(`  ${n}× ${d}`)); }
warn.forEach(w => console.log('note: ' + w));
if (problems.length) {
  console.log(`RELEASE-CHECK FAIL · ${problems.length} problem(s) in ${ROOT}`);
  problems.forEach(p => console.log('  ' + p));
  process.exit(1);
}
console.log(`RELEASE-CHECK PASS · ${ROOT}${denyFile ? ` · deny list: ${deny.length} entr${deny.length === 1 ? 'y' : 'ies'}` : ' · no deny list given (--deny <file> outside the skill adds your own names)'}`);
