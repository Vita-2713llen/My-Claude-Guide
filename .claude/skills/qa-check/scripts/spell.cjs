#!/usr/bin/env node
// TEXT-02 · spelling candidates and TEXT-08 · grammar candidates, from qa-out/texts.json (written by qa-run.cjs, step 2).
// One engine on every OS: cspell pinned in scripts/package.json (installed by `npm install` in scripts/), run as
// `node <cspell bin>` with a generated config — no project cspell config, no npx, no network at run time.
//   English pages: en-US, or en-GB when qa-target.json decisions.englishVariant is "UK".
//   Other page languages (<html lang> of each page): @cspell/dict-<lang> when it is installed in scripts/node_modules;
//   without it that language is NOT RUN with a route — never checked against English, never silently passed.
//   Words of another script than the page language (an English word on a Ukrainian page) go to the first
//   language in decisions.languages with that script, else to English for Latin words, else NOT RUN.
// Every language run carries a self-test (a garbage word must be flagged, a common word must not), so a broken or
// missing dictionary is NOT RUN, never "0 candidates". Project words: qa-target.json → dictionary[] (and the legacy
// "spelling-dictionary" of .qa-state.json next to it).
// Candidates are questions. The agent reads each in context, then:
//   real errors → node record.cjs --id TEXT-02 --status fail --where "/page/" --why "recieve → receive"
//   none real   → node record.cjs --id TEXT-02 --status pass --note "N candidates read in context, 0 real"
// (same for TEXT-08 with grammar-candidates.json).
// texts.json contract (written by qa-run.cjs, one entry per page, keyed by page path, optionally "path@width"):
//   { "<path>": { "lang": "<html lang>", "sources": [{ "src": "text" | "hidden-text" | "alt" | "attr:<name>" | "meta:<key>" |
//                 "jsonld:<key>" | "form-response", "t": "<text>", "where": "<selector>"? }], "glued": [{ "join": "Book|Now",
//                 "sel": "…", "context": "…" }]? } }
//   "text" is the rendered visible text (innerText: double spaces are judged there only). The older shape
//   { text, alts, meta } is still read, but then TEXT-02 / TEXT-08 stay partial: hidden copy, attributes and JSON-LD missing.
// node spell.cjs --out qa-out [--config qa-target.json] [--second-opinion]
//   --second-opinion (macOS only): also runs NSSpellChecker (spell.swift) → spell-candidates-macos.json + a note.
//   It never adds findings: NSSpellChecker includes each user's learned words, so it differs between Macs.
const fs = require('fs'), path = require('path'); const { spawnSync } = require('child_process'); const L = require('./lib.cjs');
const a = L.args(process.argv.slice(2)); const OUT = L.outDirFrom(a); fs.mkdirSync(OUT, { recursive: true });
L.assertIdle(OUT, 'spell'); // never read texts.json while qa-run is still writing it
const SP = 'TEXT-02', GR = 'TEXT-08';

// ---------- helpers ----------
const readJsonFile = f => L.readJson(f, path.basename(f)); // UTF-8 with or without BOM, or UTF-16
const tryJson = f => { try { return readJsonFile(f); } catch (e) { return null; } };
const byStr = L.byStr;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = arr => [...new Set(arr)];

// ---------- config, run, results ----------
const cfgFile = L.configPath(a);
let cfg = {}, cfgError = null;
try { cfg = L.readTarget(a) || {}; } catch (e) { cfgError = e.message; }
const dec = Object.assign({ englishVariant: 'US', languages: [] }, cfg.decisions || {});
const run = L.currentRun(OUT);
let R; try { R = L.makeResults('spell', cfg.base ? Object.assign({}, cfg, { base: String(cfg.base).replace(/\/$/, '') }) : undefined, a); } catch (e) { R = L.makeResults('spell'); }
const notRun = (id, why) => R.notRun(id, why); // lib appends reasons, never overwrites
const done = code => { L.saveResults(R, OUT); process.exit(code); };
const NOT_RUN = L.EXIT_NOT_RUN || 3;
const both = why => { notRun(SP, why); notRun(GR, why); console.error('spell: NOT RUN — ' + why); };
if (cfgError) { both(cfgError); done(NOT_RUN); }

// ---------- texts.json from this run ----------
const tf = path.join(OUT, 'texts.json');
if (!fs.existsSync(tf)) { both(`no texts.json in ${OUT} — run qa-run.cjs with the same --out first (step 2)`); done(NOT_RUN); }
let raw; try { raw = readJsonFile(tf); } catch (e) { both(`texts.json unreadable (${e.message}) — rerun step 2`); done(NOT_RUN); }
const data = raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw && raw.pages && typeof raw.pages === 'object' && !Array.isArray(raw.pages) ? raw.pages : raw;
if (run && ((raw && raw._runId && raw._runId !== run.runId) || (!(raw && raw._runId) && fs.statSync(tf).mtimeMs < Date.parse(run.startedAt) - 1000))) {
  both(`texts.json belongs to an earlier run (this run ${run.runId} started ${run.startedAt}) — qa-run did not finish in this run; rerun step 2`); done(NOT_RUN);
}
const VISIBLE = /^(text|visible|rendered)$/;
const PAGES = []; let fullSources = false;
for (const k of Object.keys(data && typeof data === 'object' ? data : {}).filter(k => !k.startsWith('_')).sort(byStr)) {
  const t = data[k]; const p = k.replace(/@\d+$/, ''); if (PAGES.some(x => x.p === p)) continue;
  const srcs = [];
  const push = (src, v, where) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(x => push(src, x, where)); return; }
    if (typeof v === 'object') { if ('t' in v || 'text' in v || 'value' in v) push(v.src || src, v.t ?? v.text ?? v.value, v.where || where); else Object.entries(v).forEach(([kk, x]) => push(src + ':' + kk, x, where)); return; }
    const s = String(v); if (s.trim()) srcs.push({ src, t: s, where });
  };
  if (typeof t === 'string') push('text', t);
  else if (t && typeof t === 'object') {
    const list = Array.isArray(t.sources) ? t.sources : Array.isArray(t.textSources) ? t.textSources : null;
    if (list) { fullSources = true; list.forEach(s => s && push(s.src || 'text', s.t ?? s.text ?? s.value, s.where)); if (!srcs.some(s => VISIBLE.test(s.src)) && (t.rendered ?? t.text)) push('text', t.rendered ?? t.text); }
    else { push('text', t.rendered ?? t.text); push('alt', t.alts); push('meta', t.meta); }
    for (const [f, src] of [['hidden', 'hidden-text'], ['hiddenText', 'hidden-text'], ['attrs', 'attr'], ['attributes', 'attr'], ['jsonld', 'jsonld'], ['jsonLd', 'jsonld']]) if (!list && t[f] != null) { fullSources = true; push(src, t[f]); }
  }
  const visible = srcs.filter(s => VISIBLE.test(s.src)).map(s => s.t).join('\n');
  PAGES.push({ p, rawLang: (t && typeof t === 'object' && (t.lang || (t.meta && typeof t.meta === 'object' && t.meta.lang))) || '', srcs, visible, glued: t && Array.isArray(t.glued) ? t.glued : [] });
}
if (!PAGES.length) { both('texts.json has 0 pages — qa-run collected no page text (every page failed at the text width); rerun step 2'); done(NOT_RUN); }
if (!PAGES.some(x => x.srcs.length)) { both(`texts.json lists ${PAGES.length} page(s) but no text — rerun step 2`); done(NOT_RUN); }
const SOURCES_GAP = 'texts.json carries visible text, alt and meta only: hidden copy (closed FAQ/tabs, form messages), attributes (aria-label, title, placeholder), og/twitter meta and JSON-LD were not collected — update qa-run.cjs (texts.json sources) and rerun step 2';
if (!fullSources) { notRun(SP, SOURCES_GAP); notRun(GR, SOURCES_GAP); }

// ---------- languages and scripts ----------
const ENGLISH = String(dec.englishVariant || 'US').toUpperCase() === 'UK' ? 'en-GB' : 'en-US';
function normLang(v) {
  const s = String(v || '').trim().toLowerCase().replace(/_/g, '-'); if (!/^[a-z]{2,3}(-|$)/.test(s)) return null;
  const [b, r] = s.split('-');
  if (b === 'en') return ENGLISH;
  if (b === 'pt') return r === 'pt' ? 'pt-PT' : 'pt-BR';
  if (b === 'no' || b === 'nn' || b === 'nb') return 'nb';
  return b;
}
const DEC_LANGS = uniq((Array.isArray(dec.languages) ? dec.languages : []).map(normLang).filter(Boolean));
const FALLBACK = DEC_LANGS[0] || ENGLISH;
const SCRIPT_OF = { uk: 'Cyrillic', ru: 'Cyrillic', bg: 'Cyrillic', be: 'Cyrillic', mk: 'Cyrillic', sr: 'Cyrillic', kk: 'Cyrillic', el: 'Greek', he: 'Hebrew', ar: 'Arabic', fa: 'Arabic', ur: 'Arabic', hy: 'Armenian', ka: 'Georgian', th: 'Thai', hi: 'Devanagari', mr: 'Devanagari', ne: 'Devanagari', zh: 'Han', ja: 'Han', ko: 'Hangul' };
const scriptOfLang = l => SCRIPT_OF[String(l).split('-')[0]] || 'Latin';
const SCRIPT_RE = ['Latin', 'Cyrillic', 'Greek', 'Hebrew', 'Arabic', 'Armenian', 'Georgian', 'Thai', 'Devanagari', 'Hangul'].map(s => [s, new RegExp(`\\p{Script=${s}}`, 'u')]).concat([['Han', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u]]);
const scriptOf = w => (SCRIPT_RE.find(([, re]) => re.test(w)) || ['Other'])[0];
const groupFor = (w, pageLang) => { const s = scriptOf(w); return [pageLang, ...DEC_LANGS, ENGLISH].find(l => scriptOfLang(l) === s) || '?' + s; };
// Dictionary package per language (cspell). English ones ship inside cspell's bundled dictionaries.
const DICT = { 'en-US': '', 'en-GB': '', uk: '@cspell/dict-uk-ua', ru: '@cspell/dict-ru_ru', bg: '@cspell/dict-bg-bg', de: '@cspell/dict-de-de', fr: '@cspell/dict-fr-fr', es: '@cspell/dict-es-es', it: '@cspell/dict-it-it', 'pt-BR': '@cspell/dict-pt-br', 'pt-PT': '@cspell/dict-pt-pt', nl: '@cspell/dict-nl-nl', pl: '@cspell/dict-pl_pl', sv: '@cspell/dict-sv', da: '@cspell/dict-da-dk', nb: '@cspell/dict-nb-no', cs: '@cspell/dict-cs-cz', el: '@cspell/dict-el', tr: '@cspell/dict-tr-tr', ro: '@cspell/dict-ro-ro', hu: '@cspell/dict-hu-hu', fi: '@cspell/dict-fi-fi', hr: '@cspell/dict-hr-hr', sk: '@cspell/dict-sk-sk', sl: '@cspell/dict-sl-si', lt: '@cspell/dict-lt-lt', lv: '@cspell/dict-lv', et: '@cspell/dict-et-ee', ca: '@cspell/dict-ca', he: '@cspell/dict-he', ar: '@cspell/dict-ar', fa: '@cspell/dict-fa-ir', vi: '@cspell/dict-vi-vn', id: '@cspell/dict-id-id' };
// Self-test words per language: [garbage that must be flagged, common word that must be accepted].
const Q = 'qacanaryzqxw', QC = 'щзщзщзщ';
const PROBE = { 'en-US': [Q, 'color'], 'en-GB': [Q, 'colour'], uk: [QC, 'книга'], ru: [QC, 'книга'], bg: [QC, 'книга'], de: [Q, 'Haus'], fr: [Q, 'maison'], es: [Q, 'casa'], it: [Q, 'casa'], 'pt-BR': [Q, 'casa'], 'pt-PT': [Q, 'casa'], nl: [Q, 'huis'], pl: [Q, 'dom'], sv: [Q, 'huset'], da: [Q, 'huset'], nb: [Q, 'huset'], cs: [Q, 'domov'], el: ['ξζξζξζξ', 'σπίτι'], tr: [Q, 'kitap'], ro: [Q, 'casă'], hu: [Q, 'ház'], fi: [Q, 'talo'], hr: [Q, 'kuća'], sk: [Q, 'domov'], sl: [Q, 'hiša'], lt: [Q, 'namas'], lv: [Q, 'māja'], et: [Q, 'maja'], ca: [Q, 'casa'], he: ['שקשקשקשק', 'בית'], ar: ['ضصثقضصثق', 'كتاب'], fa: ['ضصثقضصثق', 'کتاب'], vi: [Q, 'nhà'], id: [Q, 'rumah'] };

// ---------- words ----------
const dict = new Set(); const addDict = arr => (Array.isArray(arr) ? arr : []).forEach(w => dict.add(String(w).normalize('NFC').toLowerCase()));
addDict(cfg.dictionary); addDict((tryJson(path.join(path.dirname(cfgFile), '.qa-state.json')) || {})['spelling-dictionary']); // legacy location
const TOKEN = /\p{L}[\p{L}\p{M}’'-]*[\p{L}\p{M}]/gu;
const clean = s => String(s).normalize('NFC').replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ');
const WORDS = new Map(); const CAMEL = new Map(); const pageLangNotes = [];
for (const pg of PAGES) {
  pg.lang = normLang(pg.rawLang) || FALLBACK; if (!normLang(pg.rawLang)) pageLangNotes.push(pg.p);
  for (const s of pg.srcs) for (const tok of clean(s.t).match(TOKEN) || []) for (let part of tok.split('-')) {
    part = part.replace(/^['’]+|['’]+$/g, '');
    if ([...part].length < 3 || /^\p{Lu}{2,5}$/u.test(part) || dict.has(part.toLowerCase())) continue;
    const g = groupFor(part, pg.lang);
    let w = part; if (g.startsWith('en-')) w = w.replace(/['’]s$/, '');
    if ([...w].length < 3 || dict.has(w.toLowerCase())) continue;
    const key = g + '\u0000' + w;
    if (!WORDS.has(key)) WORDS.set(key, { w, g, pages: new Set(), srcs: new Set() });
    const e = WORDS.get(key); e.pages.add(pg.p); e.srcs.add(s.src);
    if (/^\p{Ll}{3,}\p{Lu}\p{Ll}{2,}$/u.test(w)) { if (!CAMEL.has(w)) CAMEL.set(w, { pages: new Set(), srcs: new Set() }); CAMEL.get(w).pages.add(pg.p); CAMEL.get(w).srcs.add(s.src); }
  }
}
if (pageLangNotes.length) R.note(SP, `${pageLangNotes.length} page(s) without a usable <html lang> in texts.json, read as ${FALLBACK}${pageLangNotes.length <= 5 ? ': ' + pageLangNotes.join(', ') : ''}`);

// ---------- engine ----------
// The pinned cspell of scripts/package.json only — never npx, never a global copy (that would differ per machine).
const CS = L.bundledCli('cspell', 'cspell');
const INSTALL = `cd "${__dirname}" && npm ci`;
const ADD_DICT = pkg => `a person pins it for the whole team: cd "${__dirname}" && npm install -E ${pkg} (package.json then pins it for every machine), then rerun`;
function dictExt(pkg) {
  const roots = [path.join(__dirname, 'node_modules')]; if (CS) roots.push(path.join(CS.dir, 'node_modules'));
  for (const r of roots) { const f = path.join(r, pkg, 'cspell-ext.json'); if (fs.existsSync(f)) return f; }
  return null;
}
function runGroup(lang, entries) {
  if (!(lang in DICT)) return { why: `no cspell dictionary is known for "${lang}"` };
  if (!CS) return { why: `cspell is not installed in scripts/ — route: ${INSTALL} (cspell is pinned in package.json; no network is needed at run time)` };
  let imp = null; if (DICT[lang]) { imp = dictExt(DICT[lang]); if (!imp) return { why: `dictionary ${DICT[lang]} is not installed — route: ${ADD_DICT(DICT[lang])}, or a native speaker reads these pages` }; }
  const [bad, good] = PROBE[lang] || [Q, null];
  const lines = [bad, ...(good ? [good] : []), ...entries.map(e => e.w)];
  const tag = lang.toLowerCase();
  const wf = path.join(OUT, `words-${tag}.txt`); fs.writeFileSync(wf, lines.join('\n') + '\n');
  const conf = { version: '0.2', language: lang === 'en-US' ? 'en' : lang, minWordLength: 3, useGitignore: false, ignorePaths: [], words: [...dict].sort(byStr) };
  if (imp) conf.import = [imp];
  const cf = path.join(OUT, `cspell-${tag}.json`); fs.writeFileSync(cf, JSON.stringify(conf, null, 1));
  const r = L.runCli(CS, ['lint', '--config', cf, '--no-progress', '--no-summary', '--no-color', '--no-cache', '--no-gitignore', path.basename(wf)], { cwd: OUT, timeout: 300000 });
  if (r.error) return { why: `cspell could not start (${r.error.code || r.error.message}) — route: ${INSTALL}` };
  if (r.status !== 0 && r.status !== 1) return { why: `cspell exited ${r.status}${r.signal ? ' (' + r.signal + ')' : ''}: ${String(r.stderr || '').trim().split(/\r?\n/).pop().slice(0, 160)}` };
  const hits = new Map();
  for (const ln of String(r.stdout || '').split(/\r?\n/)) {
    const m = ln.match(/:(\d+):(\d+) - Unknown word \((.+?)\)(?:\s+fix: \((.+?)\))?\s*$/); if (!m) continue;
    const i = +m[1] - 1; const h = hits.get(i) || { subs: new Set(), fix: new Set() }; h.subs.add(m[3]); if (m[4]) m[4].split(/,\s*/).forEach(x => h.fix.add(x)); hits.set(i, h);
  }
  if (!hits.has(0)) return { why: `self-test failed: cspell did not flag the garbage word "${bad}" for ${lang} — the engine is not checking` };
  if (good && hits.has(1)) return { why: `self-test failed: the ${lang} dictionary is not active (it flags the common word "${good}") — route: ${DICT[lang] ? ADD_DICT(DICT[lang]) : INSTALL}` };
  const off = good ? 2 : 1; const flagged = [];
  for (const [i, h] of hits) if (i >= off) flagged.push({ e: entries[i - off], subs: [...h.subs].sort(byStr), fix: [...h.fix].slice(0, 3) });
  return { ran: true, flagged, engine: `cspell ${CS.version}` };
}

// ---------- TEXT-02: run every language group ----------
const groups = new Map(); for (const e of WORDS.values()) { if (!groups.has(e.g)) groups.set(e.g, []); groups.get(e.g).push(e); }
const ran = [], rows = [];
const contextOf = (w, pages) => {
  const re = new RegExp(`.{0,40}(?<![\\p{L}\\p{M}])${esc(w)}(?![\\p{L}\\p{M}]).{0,40}`, 'u');
  for (const pg of PAGES.filter(x => pages.has(x.p))) for (const s of pg.srcs) { const m = String(s.t).normalize('NFC').match(re); if (m) return `${pg.p} [${s.src}]: …${m[0].replace(/\s+/g, ' ').trim()}…`; }
  return '';
};
if (!CS && groups.size) notRun(SP, `cspell is not installed in scripts/ — no language was checked (${[...groups.keys()].sort(byStr).join(', ')}); route: ${INSTALL} (cspell is pinned in package.json; no network is needed at run time)`);
for (const g of (CS ? [...groups.keys()] : []).sort(byStr)) {
  const entries = groups.get(g).sort((x, y) => byStr(x.w, y.w));
  const pagesN = new Set(entries.flatMap(e => [...e.pages])).size;
  if (g.startsWith('?')) { notRun(SP, `${entries.length} word(s) in ${g.slice(1)} script on ${pagesN} page(s) not checked — no page language of that script (set decisions.languages, or check that qa-run records each page's lang); route: a native speaker reads those pages`); continue; }
  const res = runGroup(g, entries);
  if (!res.ran) { notRun(SP, `${g}: ${entries.length} word(s) on ${pagesN} page(s) not checked — ${res.why}`); continue; }
  ran.push(`${g} ${entries.length} words (${res.engine})`);
  for (const f of res.flagged) {
    const pages = [...f.e.pages].sort(byStr);
    rows.push({ word: f.e.w, ...(f.subs.length && !(f.subs.length === 1 && f.subs[0] === f.e.w) ? { flagged: f.subs.join(', ') } : {}), lang: g, ...(f.fix.length ? { suggest: f.fix.join(', ') } : {}), pages: pages.slice(0, 3), pageCount: pages.length, sources: [...f.e.srcs].sort(byStr).join(', '), context: contextOf(f.e.w, f.e.pages) });
  }
}
rows.sort((x, y) => byStr(x.lang, y.lang) || byStr(x.word, y.word));
// Glued words: no space between two inline elements (measured on the rendered page by qa-run when it records them).
const glued = new Map();
for (const pg of PAGES) for (const gg of pg.glued) { const word = String(gg.join || gg.word || '').trim(); if (!word || dict.has(word.replace(/\|/g, '').toLowerCase())) continue; if (!glued.has(word)) glued.set(word, { word, why: 'missing space between inline elements (no visible gap)', pages: [], sel: gg.sel, context: gg.context }); const x = glued.get(word); if (!x.pages.includes(pg.p)) x.pages.push(pg.p); }
for (const [w, x] of CAMEL) if (!glued.has(w)) glued.set(w, { word: w, why: 'lowerCamel word inside one text: possible missing space', pages: [...x.pages].sort(byStr).slice(0, 3), sources: [...x.srcs].sort(byStr).join(', '), context: contextOf(w, x.pages) });
const gluedRows = [...glued.values()].map(x => Object.assign(x, { pages: [...x.pages].sort(byStr).slice(0, 3) })).sort((x, y) => byStr(x.word, y.word));

R._env = Object.assign({}, R._env || {}, { speller: CS ? `cspell ${CS.version} (scripts/node_modules) · ${ran.length ? ran.map(x => x.split(' ')[0]).join(', ') : 'no language run'}` : 'cspell not installed', englishVariant: ENGLISH });
if (ran.length) {
  R.ran(SP);
  R.note(SP, `${ran.join(' · ')} · minWordLength 3 · ${PAGES.length} page(s) · ${WORDS.size} unique word(s) · ${rows.length} spelling + ${gluedRows.length} spacing candidate(s) → read spell-candidates.json in context, then record.cjs`);
  rows.forEach(r => R.ask(SP, r)); gluedRows.forEach(r => R.ask(SP, r));
} else if (!WORDS.size) notRun(SP, `${PAGES.length} page(s) gave 0 checkable words (all in the dictionary, too short or not letters) — check texts.json`);
fs.writeFileSync(path.join(OUT, 'spell-candidates.json'), JSON.stringify(rows.concat(gluedRows), null, 1));

// ---------- optional macOS second opinion (never a finding) ----------
if (a['second-opinion']) {
  if (process.platform !== 'darwin') R.note(SP, 'second opinion skipped: NSSpellChecker exists only on macOS');
  else {
    const NS = { 'en-US': 'en_US', 'en-GB': 'en_GB', 'pt-BR': 'pt_BR', 'pt-PT': 'pt_PT' }; const extra = {};
    for (const g of [...groups.keys()].filter(g => !g.startsWith('?')).sort(byStr)) {
      const wf = path.join(OUT, `words-${g.toLowerCase()}-macos.txt`); fs.writeFileSync(wf, groups.get(g).map(e => e.w).join('\n') + '\n');
      const r = spawnSync('swift', [path.join(__dirname, 'spell.swift'), wf, NS[g] || g, (PROBE[g] || [Q])[0]], { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26 });
      if (r.error || r.status !== 0) { R.note(SP, `second opinion ${g}: not available (${r.error ? r.error.code : 'exit ' + r.status + ' ' + String(r.stderr || '').trim().slice(0, 80)})`); continue; }
      const mine = new Set(rows.filter(x => x.lang === g).map(x => x.word));
      extra[g] = String(r.stdout).split(/\r?\n/).filter(Boolean).filter(w => !mine.has(w)).sort(byStr);
    }
    fs.writeFileSync(path.join(OUT, 'spell-candidates-macos.json'), JSON.stringify(extra, null, 1));
    R.note(SP, `second opinion (NSSpellChecker, includes this Mac's learned words — not comparable between machines): ${Object.entries(extra).map(([g, w]) => `${g} +${w.length}`).join(', ') || 'nothing run'} → spell-candidates-macos.json (not findings)`);
  }
}

// ---------- TEXT-08: grammar and typography candidates, per text source (never across joined blocks) ----------
const SINGULAR_S = new Set('series species news means lens canvas bus gas atlas alias bonus chaos status campus corpus focus virus plus minus bias basis crisis analysis thesis diagnosis emphasis oasis iris tennis physics mathematics ethics economics politics always perhaps towards afterwards whereas yes this his its was has does thus less unless process business address access success class glass mass pass boss loss dress press stress fitness wellness kindness happiness illness awareness darkness compass christmas summons sometimes nowadays'.split(' '));
const grammar = []; const capped = []; const counts = {};
const anyDots = PAGES.some(p => /(^|[^.])\.\.\.(?!\.)/.test(p.visible)), anyEllipsis = PAGES.some(p => p.visible.includes('…'));
const snippet = (s, i, n) => '…' + s.slice(Math.max(0, i - 40), i + n + 40).replace(/\s+/g, ' ').trim() + '…';
for (const pg of PAGES) {
  const items = []; const en = pg.lang.startsWith('en-');
  const add = (rule, s, i, n, src, extra) => items.push(Object.assign({ where: pg.p, rule, src, context: snippet(s, i, n) }, extra || {}));
  for (const so of pg.srcs) {
    const s = String(so.t).normalize('NFC'); const vis = VISIBLE.test(so.src);
    if (en) for (const m of s.matchAll(/(?<![\p{L}\p{N}])([Aa]n?)[ \t\u00a0]+(\p{Ll}{3,}s)(?![\p{L}'’])/gu)) { const w = m[2]; if (/(ss|us|is|ous|ics)$/.test(w) || SINGULAR_S.has(w)) continue; add('a/an + plural', s, m.index, m[0].length, so.src, { words: m[0] }); }
    for (const m of s.matchAll(/(?<![\p{L}\p{N}])(\p{L}{2,})[ \t\u00a0]+(\1)(?![\p{L}\p{N}])/giu)) add('doubled word', s, m.index, m[0].length, so.src, { words: m[0] });
    for (const m of s.matchAll(en ? /(?<=\p{L})[ \t\u00a0]+(,|\.(?![.\d])|[;:!?])/gu : /(?<=\p{L})[ \t\u00a0]+(,|\.(?![.\d]))/gu)) add('space before punctuation', s, m.index, m[0].length, so.src);
    if (vis) for (const m of s.matchAll(/\S+(?: {2,}| \u00a0|\u00a0 |\u00a0{2,})\S+/g)) add('double space', s, m.index, m[0].length, so.src, { words: m[0].replace(/[ \u00a0]/g, '␣') });
    if (vis && anyDots && anyEllipsis) for (const m of s.matchAll(/(?<!\.)\.\.\.(?!\.)/g)) add('"..." while the site also uses "…"', s, m.index, 3, so.src);
  }
  if (/"[^"\n]{1,200}"/.test(pg.visible) && /[“”]/.test(pg.visible)) { const i = pg.visible.search(/[“”]/); add('straight and curly quotes on one page', pg.visible, i, 1, 'text'); }
  if (/\p{L}'\p{L}/u.test(pg.visible) && /\p{L}’\p{L}/u.test(pg.visible)) { const i = pg.visible.search(/\p{L}'\p{L}/u); add("straight and curly apostrophes on one page", pg.visible, i, 3, 'text'); }
  items.sort((x, y) => byStr(x.rule, y.rule) || byStr(x.context, y.context));
  const seen = new Set(); const uniqItems = items.filter(x => { const k = x.rule + '\u0000' + x.context; if (seen.has(k)) return false; seen.add(k); return true; });
  if (uniqItems.length > 40) capped.push(`${pg.p} (${uniqItems.length})`);
  for (const x of uniqItems.slice(0, 40)) { grammar.push(x); counts[x.rule] = (counts[x.rule] || 0) + 1; }
}
R.ran(GR);
R.note(GR, `${PAGES.length} page(s), ${PAGES.reduce((n, p) => n + p.srcs.length, 0)} text source(s) · ${grammar.length} candidate(s)${grammar.length ? ': ' + Object.entries(counts).sort(([x], [y]) => byStr(x, y)).map(([k, n]) => `${k} ${n}`).join(', ') : ''}${capped.length ? ` · capped at 40 per page on ${capped.join(', ')}` : ''} → read grammar-candidates.json in context, then record.cjs`);
grammar.forEach(x => R.ask(GR, x));
fs.writeFileSync(path.join(OUT, 'grammar-candidates.json'), JSON.stringify(grammar, null, 1));

R._timing = { why: `${PAGES.length} page(s) of text from texts.json (no browser), ${WORDS.size} distinct word(s)` };
L.saveResults(R, OUT);
const nr = id => (R.checks[id] || {}).notRun;
console.log(`spell: ${ran.length ? ran.join(' · ') : 'no language checked'} · ${rows.length} spelling + ${gluedRows.length} spacing candidates · ${grammar.length} grammar candidates`);
for (const id of [SP, GR]) if (nr(id)) console.error(`spell: ${id} ${R.checks[id].ran ? 'PARTIAL' : 'NOT RUN'} — ${nr(id)}`);
process.exit(ran.length ? 0 : NOT_RUN);
