// qa-check · handoff.cjs — the measured part of the QA handoff (mode 4), built from the manifest only.
//
//   node <skill>/scripts/handoff.cjs --out qa-out [--config qa-target.json] [--file qa-handoff-YYYY-MM-DD.md]
//                                    [--project "Name"] [--draft]
//
// Run it from the PROJECT folder after manifest.cjs. It writes the handoff file beside qa-target.json
// (qa-handoff-<date>.md; a second file on the same day gets -2, -3 …; nothing is overwritten) with:
//   header      site, platform, stage, run id, skill version — from manifest-meta.json
//   section 2   every ✅ row, grouped by area, with its evidence line                      (already verified)
//   section 3   every 🔁 routed row with its owner note, every person / route row not closed, IOS-01…07, and the five
//               SEO choices owned by seo-check or a person                                         (checklist)
//   section 4   decisions from qa-target.json → decisions and answered rows of .qa-state.json
//   section 5   every 🔴 row with each finding and its check ID, every ❓ row               (known bugs, open questions)
// Sections 1 (scope) and 6 (interview) are left as marked placeholders: the agent fills them from the interview
// (references/reports.md). Section 7 is the empty table for the tester.
// Two agents with the same manifest get the same sections 2–5, line for line (registry order, no free text).
//
// Refuses (exit 3) while the manifest is unfinished (⚠️ not-run rows: close or route them first, see
// references/instruments.md) or comes from a partial run (--pages / --engines / --widths / --quick).
// --draft writes anyway, with a DRAFT banner — never hand a draft to the tester.
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const REG = require('./registry.cjs');

const a = L.args(process.argv.slice(2));
const OUT = L.outDirFrom(a);
const die = (m, code) => { console.error('handoff: ' + m); process.exit(code || 1); };

const mf = path.join(OUT, 'manifest.json'), mm = path.join(OUT, 'manifest-meta.json');
if (!fs.existsSync(mf)) die(`no ${mf} — run manifest.cjs first (step 9)`);
const rowsR = L.tryReadJson(mf, 'manifest.json'); if (!rowsR.ok || !Array.isArray(rowsR.data)) die(`${mf} is not a manifest (${rowsR.error || 'not an array'})`);
const metaR = L.tryReadJson(mm, 'manifest-meta.json'); const meta = metaR.ok ? metaR.data : {};
const rows = rowsR.data;
let cfg = {}; try { cfg = L.readTarget(a) || {}; } catch (e) { die(e.message); }
const projectDir = path.dirname(L.configPath(a));

const DRAFT = !!a.draft;
const cuts = Array.isArray(meta.cuts) ? meta.cuts : [];
if (cuts.length) die(`the manifest comes from a partial run (${cuts.join(', ')}) — a handoff is built only from a full run`, 3);
const open = rows.filter(r => r.st === 'not-run');
if (open.length && !DRAFT) die(`the manifest still has ${open.length} ⚠️ not-run row(s): ${open.slice(0, 12).map(r => r.id).join(', ')}${open.length > 12 ? ' …' : ''} — close them with the instrument or route them (record.cjs --status routed --note "who, where, when"), rebuild the manifest, then run this again`, 3);

// ---------- helpers
// One Markdown table cell: no line breaks, '|' escaped, '<' escaped outside code spans (a raw tag would be parsed as HTML).
const cell = v => String(v === undefined || v === null ? '' : v).replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|')
  .split('`').map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;'))).join('`').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const reg = id => (typeof REG.byId === 'function' ? REG.byId(id) : REG.find(r => r.id === id)) || {};
const area = id => id.split('-')[0];
const order = new Map(REG.map((r, i) => [r.id, i]));
const byReg = (x, y) => (order.has(x.id) ? order.get(x.id) : 1e9) - (order.has(y.id) ? order.get(y.id) : 1e9) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
const sorted = rows.slice().sort(byReg);
const findingTxt = f => {
  if (!f || typeof f !== 'object') return cell(f);
  const keys = Object.keys(f).filter(k => !['ask', '_by'].includes(k)).sort();
  const lead = ['where', 'page', 'url'].map(k => f[k]).find(Boolean);
  const rest = keys.filter(k => !['where', 'page', 'url'].includes(k)).map(k => `${k}: ${typeof f[k] === 'object' ? JSON.stringify(f[k]) : f[k]}`);
  return { where: cell(lead || '—'), what: cell(clip(rest.join(' · '), 300)) };
};

// ---------- file name
const now = new Date();
const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let file = typeof a.file === 'string' ? path.resolve(a.file) : path.join(projectDir, `qa-handoff-${ymd}.md`);
if (fs.existsSync(file)) { const ext = path.extname(file), stem = file.slice(0, -ext.length); let k = 2; while (fs.existsSync(`${stem}-${k}${ext}`)) k++; file = `${stem}-${k}${ext}`; }

// ---------- header
const run = meta.run || {};
const site = run.base || cfg.base || '?';
const project = typeof a.project === 'string' ? a.project : '{Project}';
let md = '';
if (DRAFT) md += `> ⚠️ DRAFT — the manifest still has ${open.length} ⚠️ not-run row(s). Not for the tester.\n\n`;
md += `# QA handoff · ${project} · ${ymd}\n`;
md += `Сайт: ${site} · ${meta.platform || '?'} · ${(cfg.decisions && cfg.decisions.projectType) || '?'} · опубліковано: {lastPublished}\n`;
md += `Останній прогін qa-check: стадія ${meta.stage || '?'}, ${run.startedAt || '?'} (run ${run.runId || '?'}, skill ${(meta.skill && meta.skill.version) || '?'}) · еталон: ${(cfg.decisions && cfg.decisions.reference) || (cfg.reference && cfg.reference.tokens) || 'внутрішня консистентність'}\n`;
const c = meta.counts || {};
md += `Манифест: 🔴 ${c.fail || 0} · ❓ ${c.ask || 0} · ✅ ${c.pass || 0} · ⊘ ${c.na || 0} · 🔁 ${c.routed || 0} · ⚠️ ${c.notRun || 0}\n`;
// run time (manifest-meta.json → timing; the full table is in manifest.md → ## Time)
const tm = meta.timing || null;
if (tm && tm.totalMs > 0) {
  const mins = ms => `${Math.round(ms / 6000) / 10} хв`;
  const steps = []; for (const t of tm.tools || []) { if ((t.steps || []).length) for (const x of t.steps) steps.push([`${t.tool} · ${x.label || x.id}`, x.ms]); else steps.push([t.tool, t.totalMs]); }
  const top = steps.sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, ms]) => `${k} ${mins(ms)}`).join(', ');
  md += `Час прогону: ${mins(tm.totalMs)} (бюджет ${tm.budgetMinutes || '?'} хв${tm.totalMs > (tm.budgetMinutes || 1e9) * 60000 ? ', перевищено — причини в manifest.md → Time' : ''})${top ? ` · найдовше: ${top}` : ''}\n`;
}
md += '\n';

md += `**1. Обсяг тестування** <!-- заповнює агент з інтерв'ю (references/reports.md, крок 2) -->\n\n| Що | Значення |\n|---|---|\n`;
md += `| Домен | ${site} |\n| Сторінки | {з інтерв'ю: кожен URL, включно з CMS-записами, 404 і сторінкою пароля} |\n`;
md += `| Ширини | ${[1920, 1440, 1280, 992, 768, 568, 360].join(' · ')} |\n| Браузери й пристрої | {з інтерв'ю} |\n| Поза обсягом | {з причиною} |\n\n`;

// ---------- 2. already verified
const pass = sorted.filter(r => r.st === 'pass');
md += `**2. Уже перевірено інструментами — не повторювати** (${pass.length})\n\n| Група | ID | Що доведено | Доказ |\n|---|---|---|---|\n`;
for (const r of pass) md += `| ${area(r.id)} | ${r.id} | ${cell(r.title)} | ${cell(clip(String(r.ev || ''), 220))} |\n`;
md += '\n';

// ---------- 3. checklist
const IOS = REG.filter(r => /^IOS-\d+$/.test(r.id)).map(r => r.id);
const checklist = sorted.filter(r => r.st === 'routed' || ((reg(r.id).tool === 'person' || reg(r.id).tool === 'route') && !['pass', 'na', 'fail', 'ask'].includes(r.st)) || (IOS.includes(r.id) && !['pass', 'na'].includes(r.st)));
md += `**3. Чекліст для тестувальника** (${checklist.length})\n\n| # | Що перевірити | Як | Хто / нотатка | Результат QA | Коментар |\n|---|---|---|---|---|---|\n`;
for (const r of checklist) {
  const g = reg(r.id); const note = r.st === 'routed' ? String(r.ev || '').replace(/^routed:\s*/, '') : '';
  md += `| ${r.id} | ${cell(r.title)} | ${cell(g.route || '—')} | ${cell(note)} | | |\n`;
}
// The SEO choices belong to the seo-check skill (SKILL.md → «Belongs to seo-check»): listed always, so the file is the
// same whether that skill is installed on this machine or not.
const SEO_CHOICES = [
  ['Формулювання meta title і description', 'наявність, унікальність, довжина — SEO-01/02 — інструментом'] ,
  ['Набір фавіконів', 'вага favicon — IMG-07 — інструментом'] ,
  ['Вибір і дизайн зображення Open Graph', 'наявність, своє на кожну сторінку, формат, розмір — SEO-04, SEO-08 — інструментом'] ,
  ['Тип структурованих даних', 'JSON-LD парситься, FAQPage = FAQ — SEO-05, SEO-11 — інструментом'] ,
  ['Літературна якість alt', 'відсутній, порожній, шаблонний alt, ім\'я файлу — IMG-01, IMG-08 — інструментом'] ,
];
SEO_CHOICES.forEach(([what, here], i) => { md += `| SEO-вибір ${i + 1} | ${what} | seo-check або людина (${here}) | seo-check або людина | | |\n`; });
md += `\nРезультат кожного рядка записується \`record.cjs --id <ID> --status pass|fail --note "…"\` (для iPhone — модель і iOS у нотатці).\n\n`;

// ---------- 4. decisions
md += `**4. Рішення дизайнера — це не баги**\n\n| Рішення | Значення | Звідки |\n|---|---|---|\n`;
const dec = cfg.decisions && typeof cfg.decisions === 'object' ? cfg.decisions : {};
for (const k of Object.keys(dec).sort()) {
  const v = dec[k]; if (v === null || v === undefined || (Array.isArray(v) && !v.length) || v === '') continue;
  md += `| ${cell(k)} | ${cell(clip(typeof v === 'object' ? JSON.stringify(v) : String(v), 200))} | qa-target.json |\n`;
}
const stF = path.join(projectDir, '.qa-state.json');
const st = fs.existsSync(stF) ? L.tryReadJson(stF, '.qa-state.json') : { ok: false };
if (st.ok && st.data && st.data.findings && typeof st.data.findings === 'object') {
  for (const id of Object.keys(st.data.findings).sort()) {
    const f = st.data.findings[id]; const ans = f && f.answered;
    if (!ans) continue;
    md += `| ${cell(id)} | ${cell(clip(typeof ans === 'object' ? (ans.text || JSON.stringify(ans)) : String(ans), 200))} | .qa-state.json${ans && ans.at ? ' · ' + cell(ans.at) : ''} |\n`;
  }
}
md += '\n';

// ---------- 5. known bugs and open questions
const fails = sorted.filter(r => r.st === 'fail'), asks = sorted.filter(r => r.st === 'ask');
md += `**5. Відомі баги** (${fails.length} перевірок) **і відкриті питання** (${asks.length})\n\n| ID | P | Перевірка | Де | Що | Стан | Хто закриває |\n|---|---|---|---|---|---|---|\n`;
const emit = (r, icon) => {
  const fs_ = Array.isArray(r.findings) && r.findings.length ? r.findings : [null];
  const cap = 40;
  fs_.slice(0, cap).forEach(f => { const t = f ? findingTxt(f) : { where: '—', what: cell(clip(String(r.ev || ''), 300)) }; md += `| ${r.id} | ${r.P || ''} | ${cell(r.title)} | ${t.where} | ${t.what} | ${icon} | |\n`; });
  if (fs_.length > cap) md += `| ${r.id} | ${r.P || ''} | … | | ще ${fs_.length - cap} — повний список у qa-out/manifest.md | ${icon} | |\n`;
};
fails.forEach(r => emit(r, '🔴'));
asks.forEach(r => emit(r, '❓'));
md += '\n';

md += `**6. Інтерв'ю** <!-- кожне питання, як його поставлено, і відповідь, як її дано -->\n\n| Питання | Відповідь | Нотатка |\n|---|---|---|\n\n`;
md += `**7. Баги, знайдені QA**\n\n| # | URL | Ширина / браузер | Кроки | Очікувано | Фактично | Скрін | Пріоритет | Статус |\n|---|---|---|---|---|---|---|---|---|\n`;

fs.writeFileSync(file, md);
console.log(`wrote ${file} · verified ${pass.length} · checklist ${checklist.length} · bugs ${fails.length} · questions ${asks.length}${DRAFT ? ' · DRAFT' : ''}`);
console.log('next: fill sections 1 and 6 (and the {placeholders}) from the interview; never edit sections 2, 3 and 5 by hand');
