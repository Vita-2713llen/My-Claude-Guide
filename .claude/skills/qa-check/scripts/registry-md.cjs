#!/usr/bin/env node
// Regenerate references/check-registry.md from registry.cjs, after validating the registry.
// Usage: node scripts/registry-md.cjs            → write the file, print doc-coverage warnings
//        node scripts/registry-md.cjs --check    → validate and report only, write nothing
//        node scripts/registry-md.cjs --strict   → also exit 1 when a HARD/HIGH doc row cites no registry ID,
//                                                  or a doc cites an ID the registry does not have
// Requiring registry.cjs already throws on a structural problem (bad id, duplicate, unknown tool/gate/platform).
const fs = require('fs'), path = require('path');
const R = require('./registry.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'references', 'check-registry.md');
const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check'), STRICT = argv.includes('--strict');

// Make arbitrary text safe for one Markdown table cell: raw tags would be parsed as HTML by most
// previewers (<title> swallows the rest of the file). Code spans are kept; '|' is escaped everywhere.
function md(s) {
  return String(s == null ? '' : s).replace(/\r?\n/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/&(?=#?[a-z0-9]+;)/gi, '&amp;').replace(/</g, '&lt;')))
    .join('').replace(/\|/g, '\\|');
}

const problems = R.validate(R);
if (problems.length) { console.error('registry invalid:\n' + problems.join('\n')); process.exit(1); }

const STAGE = { '1': '1', '2': '2' };
const PLAT = { wordpress: 'WP', webflow: 'Webflow', static: 'static', other: 'інша CMS' };
const toolCell = r => '`' + r.tool + '`' + (r.toolBy ? ' (' + Object.entries(r.toolBy).map(([p, t]) => `${PLAT[p]}: \`${t}\``).join(', ') + ')' : '');
const count = (k, v) => R.filter(r => r[k] === v).length;

let doc = `<!-- qa-check reference · реєстр перевірок з ID · генерується з scripts/registry.cjs — не редагувати руками: змінити registry.cjs і перегенерувати командою node scripts/registry-md.cjs -->

# Реєстр перевірок (check registry)

Кожен прогін — стадії 1, 2 і 3 — друкує **кожен** ID нижче зі статусом і доказом (\`scripts/manifest.cjs\`):
✅ pass · 🔴 fail · ❓ ask · ⊘ n/a (з причиною) · 🔁 routed (з виконавцем) · ⚠️ not run.
Прогін, у манифесті якого лишився ⚠️ not run, — незавершений. Рядок без машинного виміру не зникає:
він стоїть тут з інструментом \`person\` або \`route\` і закривається через \`scripts/record.cjs\`.

Усього: **${R.length}** перевірок · HARD ${count('P', 'HARD')} · HIGH ${count('P', 'HIGH')} · MED ${count('P', 'MED')} · LOW ${count('P', 'LOW')}.

## Як читати колонки

- **Інструмент** — хто закриває рядок:
${Object.entries(R.TOOLS).map(([k, v]) => `  - \`${k}\` — ${md(v)}`).join('\n')}
- **Платформа** — порожньо: будь-яка. Інакше рядок стосується лише цих платформ; на іншій платформі (визначає RUN-05) він ⊘ n/a.
- **Стадія** — порожньо: обидві. \`1\` — лише локальна HTML-збірка, \`2\` — лише задеплоєний сайт; на іншій стадії рядок ⊘ n/a.
- **Гейт** — рядок має предмет лише тоді, коли presence sweep (RUN-02) його знайшов; інакше ⊘ n/a з тим, що шукали.
  Гейти: ${Object.entries(R.GATES).map(([k, v]) => `\`${k}\` — ${md(v)}`).join('; ')}.

## Реєстр

| ID | P | Перевірка | Інструмент | Платформа | Стадія | Гейт |
|---|---|---|---|---|---|---|
`;
for (const r of R) {
  doc += `| ${r.id} | ${r.P} | ${md(r.title)} | ${toolCell(r)} | ${r.platforms ? r.platforms.map(p => PLAT[p]).join(', ') : ''} | ${r.stage ? STAGE[r.stage] : ''} | ${r.gate ? '`' + r.gate + '`' : ''} |\n`;
}

const routed = R.filter(r => r.route);
doc += `
## Як закривається рядок без скрипта

Рядки нижче не закриває жоден скрипт цієї машини (або закриває не на кожній платформі). Поки їх не закрито,
манифест показує ⚠️ not run з цим маршрутом. Закрити (з теки проєкту): \`node "$S/record.cjs" --out qa-out --id ID --status pass|fail|ask|routed --note "…"\`;
⊘ n/a — лише з причиною (\`--status na --note "…"\`), «поза обсягом» — лише з датою рішення дизайнера.

| ID | Інструмент | Маршрут |
|---|---|---|
`;
for (const r of routed) doc += `| ${r.id} | ${toolCell(r)} | ${md(r.route)} |\n`;

// ---- doc coverage: does every HARD/HIGH rule row in the docs cite a registry ID?
const IDS = new Set(R.map(r => r.id));
const ID_TOKEN = /\b[A-Z][A-Z0-9]*-\d{2}\b/g;
const docFiles = [path.join(ROOT, 'SKILL.md'), ...fs.readdirSync(path.join(ROOT, 'references')).filter(f => f.endsWith('.md') && f !== 'check-registry.md').map(f => path.join(ROOT, 'references', f))].filter(f => fs.existsSync(f));
const uncited = {}, stale = {}, cited = new Set();
for (const f of docFiles) {
  const rel = path.relative(ROOT, f);
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const t of line.match(ID_TOKEN) || []) { if (IDS.has(t)) cited.add(t); else if (/^(RUN|LINK|JS|INT|MODAL|NAV|A11Y|LAY|STRUCT|REF|IMG|VID|FONT|TEXT|COPY|PAGE|FOOT|FORM|MAP|VIS|SEO|PERF|SEC|TRACK|DONOR|TPL|I18N|XB|IOS|FEAT|ACC|CMS|EDIT|WP|WF)-/.test(t)) (stale[t] = stale[t] || []).push(`${rel}:${i + 1}`); }
    if (!line.trim().startsWith('|')) return;
    const cells = line.split('|').map(c => c.trim());
    if (!cells.some(c => /^(HARD|HIGH)\b/.test(c))) return;
    if (!(line.match(ID_TOKEN) || []).some(t => IDS.has(t))) (uncited[rel] = uncited[rel] || []).push(i + 1);
  });
}
const nUncited = Object.values(uncited).reduce((s, a) => s + a.length, 0);
const neverCited = [...IDS].filter(id => !cited.has(id));

if (!CHECK_ONLY) fs.writeFileSync(OUT, doc);
console.log(`${R.length} checks${CHECK_ONLY ? ' (validated, nothing written)' : ' → references/check-registry.md'}`);
console.log(`doc coverage: ${nUncited} HARD/HIGH table row(s) cite no registry ID` + (nUncited ? ' — ' + Object.entries(uncited).map(([f, a]) => `${f} ×${a.length}`).join(', ') : ''));
if (Object.keys(stale).length) console.log('docs cite IDs the registry does not have: ' + Object.entries(stale).map(([t, w]) => `${t} (${w.slice(0, 3).join(', ')}${w.length > 3 ? ' …' : ''})`).join('; '));
console.log(`registry IDs not cited in any doc: ${neverCited.length}`);
if (STRICT && (nUncited || Object.keys(stale).length)) process.exit(1);
