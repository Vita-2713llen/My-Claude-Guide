---
name: qa-check
description: "QA gate for a finished page or site. Audits it against the design guide and the company QA checklist with bundled, deterministic instruments (one check registry with IDs, the same measurements on every machine) and reports; it changes nothing on the site, and fixes happen only after the designer approves a scope. Works the same for any project (WordPress, Webflow, static, other CMS) on macOS, Windows or Linux; everything project-specific lives in the project's qa-target.json. Modes - 1 the HTML build, 2 the deployed site, 3 the full final pass, 4 the handoff file for the human QA tester, 5 the report of bugs made; no argument shows the menu. Use when the user types /qa-check, /qa-check 1…5 or /page-check, or says «перевір сторінку», «запусти чек», «фінальна перевірка», «перевір html», «перевір сайт після деплою», «репорт для QA», «handoff для QA», «репорт по багах», “page check”, “QA the page”, “check the deployed site”."
---

# QA-CHECK — the page audit (audit only, never auto-edit)

Audits a finished page or site against the design and the company QA checklist,
and reports. It runs on a page that is **done** — built and approved — and again
after that page is deployed. **The skill is self-contained:** every rule,
threshold and priority it uses ships inside this folder (`SKILL.md`,
`references/`, `scripts/registry.cjs`). No guide file found on the machine is read
to decide what a rule is or how severe it is, and nothing in the skill belongs to
one project — everything project-specific lives in that project's
`qa-target.json`.

## ⛔ Golden rule

**You do not change anything while checking.** Not the site, not the CMS
(WordPress or Webflow), not the build, not a platform setting (password,
publishing, form recipients). No autonomous fixes, no "I went ahead and…". Every
issue becomes a row in the report. Code is touched only after the designer says
so, and then only the approved rows.

**find → report → wait → fix what was approved.**

**Дрібні детерміновані дефекти позначаються ⚡ — це рядок звіту з готовим фіксом**
(закритий перелік у розділі «⚡ Швидкі фікси» нижче). Під час прогону вони **не
виконуються**: інакше прогін з доступом на запис і прогін без нього дали б різні
манифести. Виконуються лише після дозволу — зокрема одним словом «пофікси швидкі».

## ⛔ Один протокол для всіх — виконувати буквально (practice rule, 2026-10-06)

**Чому.** Два прогони попередньої версії скіла на тому самому сайті дали різні списки
багів: кожен писав власні скрипти й сам вибирав, які рядки чекліста виконати. Один
пропустив мертвий FAQ і виміряний, але не записаний стрибок лого; другий — обрізану
кнопку, бо міряв панелі закритими; обидва пропустили більшість ручних знахідок
дизайнера. **Результат не залежить від того, хто, де й на якій машині запускає.**

**Де що лежить.** `<skill>` — тека цього файлу (Claude Code показує її як base directory
скіла). Робоча тека — **тека проєкту**: там `.qa-state.json`, `qa-target.json`, `qa-out/`,
`.qa-snapshots/`. Команди запускаються з неї, скрипти — за повним шляхом
(`S=<skill>/scripts`; як задати `S` у bash, Git Bash на Windows і PowerShell —
`references/instruments.md` → «Де запускати»). Ніколи не з теки скіла.

**Скіл загальний — у ньому немає жодного проєкту.** Коли покращуєш цей скіл чи дописуєш
practice rule, не пиши в нього ім'я людини, назву клієнта, бренду чи проєкту, домен, e-mail
чи селектори й тексти конкретного сайту — лише загальний урок («прогін виміряв стрибок лого
й не записав його»). Приклади — `example.com`, «Brand», `.site-burger`, `.card`. Факти
проєкту живуть у його `qa-target.json` / `.qa-state.json`, ніколи у скілі. Перед тим як
дати скіл колегам — `node "$S/release-check.cjs" --deny <свій список поза скілом>`.

**Порядок — завжди повністю, кожен важкий інструмент у фоні й по одному.** Режими 2 і 3
запускають **ті самі** команди (3 відрізняється лише тим, що меню й стан ігноруються, а звіт —
повний, для клієнта). Стадія 1 — ті самі кроки з `--local <тека збірки>` (таблиця нижче).

0. `qa-target.json` є (інакше скопіювати `$S/qa-target.example.json`), і в ньому явно
   задані `base`, `staging`, `decisions.projectType`, `decisions.englishVariant` — немає →
   один діалог, відповідь записати.
1. `node "$S/snapshot.cjs" --out qa-out` — RUN-01, відкриває прогін.
2. `node "$S/qa-run.cjs" --out qa-out` (`--form-errors` лише з явного «так» людини в цьому прогоні).
3. `node "$S/spell.cjs" --out qa-out` → кандидати прочитати в контексті → `record.cjs`.
4. `node "$S/lighthouse.cjs" --out qa-out` — стадії 2 і 3, коли нічого іншого не запущено.
5. `node "$S/safari-real.cjs" --out qa-out` і 6. `node "$S/ios.cjs" --out qa-out` — **на будь-якій
   ОС**: поза macOS вони за секунди самі записують NOT RUN з маршрутом (не пропускати кроки).
7. Аудит адмінки за платформою з RUN-05: WordPress — `wp-admin-cfg.cjs`, потім
   `wp-admin-audit.js` у вкладці людини, потім `record.cjs --import … --len … --sum …`;
   Webflow — підключення на читання або людина. Інша платформа — нічого (⊘ ставить манифест).
8. Рядки людини й без скрипта — `node "$S/record.cjs" --out qa-out --id … --status …`.
9. `node "$S/manifest.cjs" --out qa-out` → `qa-out/manifest.{md,json}`: кожен ID реєстру, один статус;
   потім `node "$S/state.cjs" --out qa-out` — запис прогону й статусів у `.qa-state.json`.
10. Звіт у чат, handoff і стан будуються **лише з `qa-out/manifest.json`** + `qa-target.json`;
    файл handoff (режим 4) пише `node "$S/handoff.cjs" --out qa-out`, агент дописує лише обсяг та інтерв'ю.

| Стадія | snapshot · qa-run · safari-real · ios | spell · record · manifest | lighthouse | адмінка (7) |
|---|---|---|---|---|
| 1 — HTML-збірка | `--local <тека збірки>` (сервер на 127.0.0.1 інструменти піднімають самі; `file://` — ніколи) | без змін | не запускається (PERF-01 — ⊘ стадія 2) | не запускається |
| 2 і 3 — задеплоєний сайт | `base` з `qa-target.json` | без змін | завжди | за платформою |

Команди з усіма прапорами, тривалість, Windows/Linux, ключі конфігу —
`references/instruments.md`. Прочитай його **перед** першою командою.

**Правила, які не обговорюються:**

- **Вимірюють інструменти з `scripts/`**, а не код, написаний під час прогону. Бракує
  перевірки — доповнюється інструмент: новий ID у `scripts/registry.cjs`, логіка в
  `qa-run.cjs` / `measure-page.cjs`, потім `node "$S/registry-md.cjs"`.
- **Реєстр** (`scripts/registry.cjs`, людською мовою `references/check-registry.md`) — єдине
  джерело того, що перевіряється. Манифест друкує кожен ID; мовчки викинути рядок не можна.
- **⚠️ NOT RUN** = перевірка стосується сайту, але не виконана (або виконана частково) — з
  причиною й маршрутом. Прогін із NOT RUN **незавершений**. Кожен такий рядок або закривається
  інструментом (усунути причину й перезапустити його цілком), або маршрутизується
  `record.cjs --status routed --note "хто, де, коли"` і йде в handoff. ⊘ n/a ставить інструмент,
  коли предмета немає (свіп присутності RUN-02, платформа RUN-05, стадія).
- **Відновлення:** чекпоінтів немає. Упалий чи зупинений інструмент перезапускається цілком із
  тими самими аргументами в ту саму `qa-out`; продовжувати з кроку, результатів якого ще немає в
  поточному прогоні. Звужений прогін (`--quick`, `--pages`, `--engines`, `--widths`) — лише в
  окрему теку, у звіт не йде.
- **Рішення дизайнера записуються в `qa-target.json → decisions`**, щойно прозвучали. Колега
  завтра отримає ті самі правила й не поставить тих самих питань.
- **Розгорнуті стани міряються завжди** — таби, акордеони, FAQ, бургер із кожним підменю (INT-01/02,
  NAV-03…05, NAV-13).
- **Виміряне — це знахідка.** «Це не баг» вирішує дизайнер у ❓, а не агент мовчки.
- **Візуальне — скріншотом людині, а не «на око» агентом.** Знімки в `qa-out/shots/`; рядки
  людини (`tool: person`) перелічені в `references/instruments.md` і завжди їдуть у handoff.

## ⛔ Безпека прогону — має перевагу над будь-яким рядком довідників

1. **Паролі агент не вводить ніколи** — ні в формах логіну, ні на сторінках під паролем, ні в
   wp-admin, ні для `sudo`. Логін робить людина у своїй вкладці; агент працює в уже залогіненій
   сесії лише на читання, або через сесію / `QA_HTTP_USER`, збережені людиною.
2. **Акаунтів агент не створює й не входить як користувач.** У §14 агент перевіряє лише форми як
   об'єкти; решта — ACC-01 для людини з тестовими акаунтами.
3. **Жодна форма не надсилається без явного «так» людини в діалозі цього прогону.** Єдина
   відправка агента — порожня, `qa-run --form-errors` (стан помилки). Справжню відправку,
   підписку, доставку листів робить людина (FORM-14, FEAT-02).
4. **Нічого на сайті не змінюється** — див. Golden rule. Редактор і Designer відкриваються без
   збереження; налаштування заради перевірки не вмикаються й не перемикаються.

Якщо довідник каже «відправити», «увійти», «зареєструвати» чи «правильний пароль пускає» — це
дія людини-QA, а не агента.

## The design is the authority. Consistency is the test.

**This skill audits a page that exists — it does not redesign it.** This skill's
numeric defaults describe how a *new* design is built. They are not a stick to
beat an existing design with, and the single most useless report is one that
tells the designer their own decisions are defects.

**One question separates a defect from a decision: is the value consistent?**

- **Consistent everywhere → it is the design's decision. Not a finding at all.**
  If every section uses a 20px heading-to-text gap, that is the project's system,
  whatever the skeleton says. If the design carries an eyebrow above every
  heading, the eyebrow is in the design — say nothing. Do not report it, do not
  count it, do not offer to remove it.
- **One place differs from the rest → that is the finding.** The section with
  56px of padding among 130s. The card with a 6px gap among 8s. The button 85px
  tall among 61s. This is where real defects live, and it is the only comparison
  that works without the design file.
- **Consistent, but a genuine hazard → a question, not a defect.** Contrast below
  AA, text that truncates, a header that breaks, an image ten times its box — the
  page is uniform and still harms the visitor. Raise it in **❓ Потребує рішення**
  with the number, and let the designer decide.

**The hero's min-height follows the same rule.** If the design carries its own
ladder — different numbers at different tiers — that is its ladder, and this skill's
figures are not an accusation. Only two things are worth raising, and both as
questions: **`100vh` at 1024 or 1280**, because a tablet held sideways is barely
768 tall and the banner collapses to a strip; and **one value at all seven tiers**,
which is not necessarily wrong but is almost always an oversight. Show the numbers,
let the designer decide.

**Fonts follow the same rule and are always asked, never asserted.** A third
family, a weight, a size — if it is used consistently, it is a choice. Ask
whether to change it; do not report it as broken.

So the order of judgement on any value is: *does the rest of the site do the same
thing?* If yes, it is the design. If no, the odd one out is the defect. Only then
does this skill's number enter — as the recommendation in the fix column, never as
the accusation.

## What the page is measured against — find the reference before checking anything

**The consistency test above is the fallback, not the first choice.** It is what
works when there is nothing to compare against. There usually is something, and a
run that never looks for it throws away the only answer that can settle a value
outright.

**Three references, in this order. Establish which one applies before the first
check, and name it in the report's opening line.**

### 1. The design system in the project folder

`design-system.html`, `styleguide.html`, `tokens/design-tokens.json`, an exported
token file, a style-guide page generated by a design-system tool —
whatever the project actually carries. It names the values: the palette, the type
scale per tier, the spacing scale, radii, button heights, hover duration, the
breakpoints.

**Against a named scale, consistency stops being the argument.** A `15.3px` in a
project whose scale runs 4/8/12/16 is a defect because it is off the scale, and it
stays a defect even if a second element repeats it. Two elements off the scale are
two findings, not a system.

This also settles what the consistency test cannot: a value that is uniform
everywhere **and wrong** — every button at 42.4px in a system that says 44 — is a
🔴 against the scale, where the consistency test would have called it the
design's decision and said nothing.

### 2. The fixed stage-1 HTML — but only if it closed clean

**A deployed page is a port of something.** Where that something is a local HTML
build this run has already checked, the deployed page is measured against it
directly: same computed properties, same widths, side by side. Anything that
differs is what the platform lost in the crossing, and that is the most valuable
class of stage-2 finding — it is invisible to any check that looks at the
deployed page alone.

**The condition is not optional.** The stage-1 HTML is admissible as a reference
**only if its own run finished and closed clean**: every 🔴 and 🟡 fixed and
re-verified, and no ⚠️ left in the sections being compared. An unfixed source
carries its defects into the comparison and **launders them** — the deployed page
matches it perfectly, every row goes ✅, and both are wrong together.

If stage 1 did not close clean, say so and fall to reference 3:
*«еталон — внутрішня консистентність: стадія 1 не закрита, 4 🔴 не полагоджені»*.

### 3. Internal consistency

The odd-one-out test. Used when neither of the above exists — a site handed over
with no design file and no local source. It finds real defects and it cannot
find a uniform wrong value, and the report says which reference it ran on so the
reader knows what was not asked.

### The rules that hold across all three

**A reference is stated, not assumed.** The opening line names it and where it
came from: *«еталон — `tokens/design-tokens.json` + почищений `index.html`
зі стадії 1 від 10.09»*. A run that does not say what it measured against has
not told the reader how much its ✅ rows are worth.

**They combine, they do not compete.** The design system settles values; the
stage-1 HTML settles what survived the port. A project with both gets both, and
the odd-one-out test still runs on top of them for anything neither covers.

**A reference can be wrong, and matching it is still a finding.** If the design
system itself carries a 3.1:1 contrast, the deployed page reproducing it faithfully
is a ❓, not a ✅ — raised once, against the design, with the number.

**Look for the reference; do not ask for it.** `design-system.html`,
`styleguide.html`, `tokens/`, the folder the source was built in — these are
findable. Ask only when the search comes up empty and the project type suggests
one should exist.

**The reference goes in `qa-target.json`** — the token file in `reference.tokens`
(REF-01), the clean stage-1 run in `reference.build` (REF-02), and its name in
`decisions.reference` — so the next run, and a colleague's run, uses the same one
and the standard never changes silently between runs. The manifest prints it.

## Work silently — the report is the output

**Write nothing between the opening line and the report.** No progress notes, no
"static pass done, moving to computed styles", no reasoning about whether a
finding is real, no announcing which tier is next. All of that is working out
loud, and it buries the only thing anyone reads.

Exactly four things reach the chat:

1. **One opening message** — stage, platform, project type, reference, and the
   machine's capability line from the manifest's run conditions (RUN-07): which
   rows this machine can run (real Safari, iOS Simulator, Edge, WebKit, Firefox,
   Android, Lighthouse) and the route of each one it cannot.
2. **All blocking human steps, asked once, before the first instrument** — the
   missing `qa-target.json` decisions, permission for `--form-errors`, the admin
   login, Safari Remote Automation. One dialog, then wait. A human step that turns
   out to be needed mid-run is never asked mid-run: the instrument has already
   written NOT RUN with its reason; finish, and ask it in the report.
3. **Silence** while the whole check runs, however long it takes.
4. **The report.**

This holds especially when a finding turns out to be a measurement artefact — a
frozen rAF, a lazy image not yet loaded, a transition caught mid-flight. Resolve
it, then either report the defect or do not; the investigation itself is never
interesting to the reader. If a check could not be made to work at all, it goes
in **⚠️ Не вдалося перевірити** with its reason, in one row, in the report.

Blocking questions — no URL, the project type unknown — belong to item 2 and
never go into the chat as prose.

## Every question goes in the options dialog, never as text

**A question written as a paragraph costs the designer a paragraph to answer.**
Put every question — the blocking one at the start, and all the ❓ rows later — in
the **options dialog**, with concrete choices to click.

- **Never** end a message with a question mark and wait.
- **Never** describe the options in prose and ask which one they prefer.
- One dialog, up to four questions at a time; more than four go in a second dialog
  after the first is answered.
- Two to four options each, short and concrete, with the recommended one first and
  marked. "Other" is always available, so never manufacture a filler option.
- Multi-select only where the answers genuinely combine.

**No dialog tool** (a subagent, another agent, a non-interactive run): send the
same questions as one message — a numbered list with lettered options, the
recommended one first and marked, in the shape shown under «When the scope
contains ❓» — end with «Відповісти одним рядком: 1а 2б…» and stop. **Nobody to
answer:** never guess; the row stays ❓ or is routed, and goes into the report and
the handoff.

The project type is the first of these, and it is a dialog too: *"Це клієнтський
сайт чи темплейт для маркетплейсу?"* with both options — because guessing it wrong
inverts the footer, the legal page and the structured-data rules all at once.

## How a run starts — the menu comes from the state, not from the user

**The designer never types a stage number.** The skill reads `qa-target.json`,
`.qa-state.json`, the last run's `qa-out/manifest.json` and a read-only snapshot
check, works out what makes sense next, and offers it in the options dialog with
the right answer already first and marked. Typing `/qa-check 1` still works; it
is a shortcut, not the normal path.

**Every run is a full run.** Nothing is carried forward between runs (see «Nothing
is carried forward»); the menu only decides *which* run comes next.

Read the rows top to bottom; the first that matches comes first in the dialog:

| What the files say | What the dialog offers |
|---|---|
| no `qa-target.json`, or it lacks `base` / `staging` / `decisions.projectType` / `decisions.englishVariant` | **створити `qa-target.json`** з `scripts/qa-target.example.json` (діалог: адреса · стейджинг так/ні · клієнтський сайт чи темплейт · US/UK) — до будь-якого режиму 1–3 |
| `.qa-state.json` without `"schema": 2` (an older version, keys that are not registry IDs) | rename it to `.qa-state.v1.json` (never delete); take only platform, url, declared placeholders and report paths from it; the next run is full |
| the last run's manifest still has ⚠️ not-run rows | **закрити або маршрутизувати N ⚠️** (рекомендовано) · далі звичайне меню; 4 не пропонується, доки N ≠ 0 |
| first run, nothing deployed | **1 — перевірити HTML** · 3 — повна фінальна |
| HTML was checked before | **1 — HTML ще раз** · 3 — повна |
| a deployed URL now exists, never checked | **2 — перевірити задеплоєний** · 1 — HTML ще раз · 3 — повна |
| the deployed site was checked before, and `snapshot.cjs --no-baseline --out qa-out-check` (RUN-01, read-only; its own folder, so the last run stays in `qa-out/`) lists changes | **2 — задеплоєний ще раз** · 3 — повна фінальна |
| a stage-2 or stage-3 run is done, its manifest has no ⚠️, and the same check reports changed 0 · added 0 · removed 0 | **4 — інтерв'ю й репорт для QA** · 2 — задеплоєний ще раз |
| the state holds fixed, accepted or QA-reported bugs | **5 — репорт по допущених багах** is added to whatever else is offered |
| a QA handoff file came back with bugs in its last table | **2 — перевірити баги від QA** first, then 5 |

RUN-01 sees the rendered content of every page and the versions of its CSS and JS.
It does not see a PHP, plugin or admin change that alters neither, so before
offering 4 also ask «чи був деплой теми чи плагінів після прогону?».

That is what makes it feel like it remembers: *"з'явився задеплоєний сайт —
перевіряємо його?"* is not a special case, it is the row above. Nothing that
cannot apply is ever offered — no "check the deployed site" before one exists.

**Option 3 is not another run.** It ignores the state entirely and walks every
check on the deployed site, whatever passed before. It is the report that goes to
the client, which is why it is its own choice rather than a flag.

### The modes

**1 — the built HTML.** The local build, served by the instruments themselves on
127.0.0.1 (`--local <folder>`; never `file://`) — no CMS, no plugins, no form
backend. Measured by the same instruments as stage 2; the stage-2-only rows are ⊘
automatically. Sees what the platform will later bury: class counts, attributes,
declared values, the stylesheet itself (STRUCT-01…03).

**2 — the deployed site.** Sees what needs a backend: forms actually sending, CMS
uploads, caching, real browsers, share previews.

**3 — the full final pass.** Everything, on the deployed site, from zero.

**4 — the QA handoff.** No measuring. An interview with the designer on everything
the runs left open, then one file the human QA tester works from. See **Reports**.

**5 — the bugs-made report.** No measuring. Every bug the project made, with its
cause and the rule that stops it next time — feedback on the design and the build.
See **Reports**.

Shortcuts, for when the menu is unnecessary:

```
/qa-check 1      the built HTML
/qa-check 2      the deployed site
/qa-check 3      the full final pass (the same commands as 2; state and menu ignored)
/qa-check 4      QA handoff: interview + file
/qa-check 5      bugs-made report (feedback)
```

There is no "one group only" run: the instruments always measure every row they own.
A narrower re-check is by pages only — `--pages <paths> --out qa-out-recheck` — and its
manifest never feeds the report or the handoff (see «Nothing is carried forward»).

### Three things settled before the first check

**The project type — client site or marketplace template.** It cannot be seen
from the page, so it is asked once **per project** and written to
`qa-target.json → decisions.projectType`; later runs and colleagues read it rather
than asking again. The instruments refuse to guess it. It changes real
expectations: the footer credit (the company's client credit versus the
template's own line — `decisions.credit`), Privacy Policy versus Licensing,
whether structured data must be present or must be **absent**, and whether the
client-specific checks — the real form recipient, 301s, analytics, the client's
Maps key — have any subject at all. Getting it wrong produces confident, wrong
HARD findings.

**The platform is detected, never asked.** `qa-run` records it from positive
markers (RUN-05): `html[data-wf-site]`, the Webflow generator or a
`website-files.com` asset → Webflow; `/wp-content/`, `/wp-includes/` or
`api.w.org` → WordPress; otherwise static or other. Bare `w-` classes are not a
signal (other frameworks use them). The manifest header prints it with its
evidence; `qa-target.json → platform` only corrects a wrong detection, and a
disagreement is a ❓. Rows of other platforms become ⊘ by themselves.

**The reference is found, not asked.** Look for it before the first check: a
design system or token file in the project folder, and — at stage 2 — the
stage-1 run, admissible only if it closed clean. See **What the page is measured
against**. Whichever applies is named in the opening line and written to
`qa-target.json` (`reference.*`, `decisions.reference`), so the standard does not
change between runs.

**And never run a stage-1 check at stage 2.** "Maximum two classes" on a WordPress
page fails on every element by design — that is the platform, not a defect. The
same in reverse: a stage-2 check has no subject in a local file.

**But stage 1 is a narrow category, and filing a check there by mistake hides real
defects.** It means one thing only: *the platform destroys the evidence* — class
counts, declared CSS values, the source markup before it is rewritten.

**If a defect is still visible on the deployed page, the check is `both`.** A
button with no destination, a dropdown that will not open, an input that refuses
text, a missing alt — none of those are obscured by anything. They are equally
broken in a local file and on a live site.

The test, whenever a stage is in doubt: *would this defect still be there after
deploy?* If yes, it is `both`. One run found a planted dead button in the HTML and
missed the identical one on Webflow, purely because the check had been filed as
stage 1 and the stage rule then did exactly what it was told.

## Files the skill keeps in the project folder

| File | What | Shared with colleagues? |
|---|---|---|
| `qa-target.json` | the site, the stage, **every designer decision**, the dictionary, selectors, references | **yes** — this is what makes two runs use the same rules |
| `.qa-state.json` | run history, per-finding cause / origin / answer / fix, report paths | no (local working file) |
| `qa-out/` | this run's results, `manifest.{md,json}`, screenshots; earlier runs in `qa-out/_prev/<runId>/` | no |
| `.qa-snapshots/<site>/` | RUN-01 history (one fingerprint per run) | no |

The last three are working files: never part of the theme, and in `.gitignore`
where the project has a repository.

## The state file — `.qa-state.json`, written by the skill itself

**Created automatically, on the first run, with nothing asked of the designer.**
It is written at the end of every run and read at the start of the next one —
by `node "$S/state.cjs" --out qa-out` after the manifest: it appends the run entry
and sets `status` / `run` of every row that is (or ever was) 🔴 ❓ ⚠️ 🔁, the same
way on every machine. The agent adds only the fields below (`cause`, `origin`,
`visible`, `found_by`, `stage`, `answered`, `fixed`) and the lifecycle statuses
`fixed` / `accepted` / `accepted-limitation`; it never rewrites the file by hand.

**Where:** the project folder — the folder that holds the page source, or, with
only a deployed URL, the folder the run was started from. Beside the work, so it
survives a closed chat and a different chat.

**If it cannot be written** — a read-only folder, no permission — the run still
does everything else and says so **once**, in the opening message: *"стан не
зберігається"*. Never fail a check because the bookkeeping failed.

**If it is missing or was deleted**, that is not an error: the next run simply
starts fresh. Nothing in it decides what is measured — every run is full anyway.

**What it does not hold:** statuses as truth (those live in each run's
`manifest.json`), the project type, the reference, the dictionary or any other
decision (those live in `qa-target.json`, shared). It is plain JSON; keys of
`findings` are **only registry IDs** from `scripts/registry.cjs`, never invented
names, so any agent on any machine can read it:

```json
{
  "schema": 2,
  "platform": "wordpress",
  "url": "https://staging.example.com",
  "runs": [
    { "stage": 2, "at": "2026-10-06T10:40", "base": "https://staging.example.com",
      "manifest": "qa-out/manifest.json", "runId": "…", "skill": "2.1.0",
      "counts": { "fail": 7, "ask": 3, "pass": 61, "na": 9, "routed": 4, "not-run": 0 },
      "snapshot": "since …: changed 2, added 0, removed 0" }
  ],
  "findings": {
    "NAV-08": { "status": "fail", "run": "2026-10-06T10:40",
                "cause": "the logo changes size when the burger opens", "origin": "build",
                "visible": true, "found_by": "NAV-08", "stage": "deploy",
                "answered": null, "fixed": null },
    "TEXT-04": { "status": "accepted", "run": "2026-10-06T10:40",
                 "answered": { "text": "лишити як є", "at": "2026-10-06" } }
  },
  "declared-placeholders": [],
  "reports": [ { "path": "qa-handoff-2026-10-06.md", "at": "2026-10-06", "manifest": "qa-out/_prev/…/manifest.json" } ]
}
```

**One status vocabulary everywhere.** `status` uses the manifest's keys — `pass`,
`fail`, `ask`, `na`, `not-run`, `routed` — plus the lifecycle values `fixed`,
`accepted`, `accepted-limitation`. `answered`, `fixed` and the rest are fields
beside the status, not statuses.

**Every finding also keeps what the reports will need later.** A row that was ever
🔴, 🟡, ⚠️ or ❓ stores, beside its status:

| Field | What it holds |
|---|---|
| `cause` | why it happened, in one plain sentence |
| `origin` | `design` · `build` · `port` · `content` · `process` · `check` |
| `visible` | whether a visitor sees it |
| `found_by` | the check ID, `designer`, `qa`, or the tool |
| `stage` | where it was caught: build, port, deploy, QA |
| `fixed` | «було → стало», when, and how many fix-and-recheck rounds it took |
| `answered` | the designer's decision, in their words, with the date (the decision itself also goes into `qa-target.json → decisions`) |

**Write them the moment the finding is made.** Nobody reconstructs a cause a week
later, and a bugs-made report built from memory teaches the wrong rules.

`reports` lists every report file written: path, date, and the manifest it was
built from. A finding returned by a QA tester that matches no registry ID is
recorded with the closest ID and the tester's steps as its item.

## Nothing is carried forward between runs

**Every run of stages 1, 2 and 3 measures everything, from zero.** An earlier
result is history, never evidence. Skipping what passed is only safe while nothing
it depended on changed — and no instrument can prove that: the site fingerprint
(RUN-01) sees page content and asset versions, not a theme PHP edit, a plugin
setting or a CDN change. A second run that reported «без змін» about a page
rewritten since would be worse than no run, because it looks like proof.

What RUN-01 does instead is **explain differences**: the report says what changed
on the site since the last run, so a new finding can be told apart from a new page.
Answered ❓ go into `qa-target.json → decisions`, so the next full run applies them.

**Re-checking a fix** is a separate, partial run into its own folder
(`--pages <the changed pages> --out qa-out-recheck`, then `manifest.cjs --out
qa-out-recheck`). Its manifest is attached to the report as «перевірка фіксу»; it
never replaces the full one.

**The first run on a deployed site matters most**, because deployment does not
preserve the page, it produces a new one. The defects that appear for the first
time there did not exist in the file:

- the platform **rewrites the markup** — `wp-block-*`, `w-*`, its own layout rules
  loading after the theme's;
- **caching defers and combines JavaScript**, which is what kills animations that
  ran perfectly locally;
- **image plugins convert and lazy-load**, so what is served is not what was built;
- the **CMS supplies real content** — longer names, missing fields, three cards
  where the design had two;
- **URLs become absolute**, canonical points somewhere real, and a link that
  resolved locally can 404;
- **fonts, scripts and assets come from a CDN**, and any one of them can fail to
  arrive.

None of that is visible in a local file. The stage-1 run is a reference for the
deployed page (REF-02), never a substitute for measuring it.

**The report always states its coverage**: the manifest's counts (🔴/🟡/❓/✅/⊘/🔁/⚠️),
the pages × widths × engines measured (RUN-04), and the RUN-01 line.

**…and its time.** `manifest.md` opens with a `## Time` table — *Step | Time | Why
this long (pages × widths × engines, items) | Share* — one row per `qa-run` step and
one per other instrument that ran (each results file carries `_timing`: start, end,
total), then the total against `budgetMinutes`. The report quotes the total and the
two biggest rows. **30 minutes is the upper bound of a `qa-run`, not its target**
(typical project: 10–50 pages, most of them CMS items on a few templates). When a run
needs more, the table says on what the time went; what the budget cut is listed per
row under RUN-04 as NOT RUN with the reason — never a silent pass. How the time is
kept down (template sampling, parallel contexts, condition-based waits, anchor
widths in WebKit / Firefox): `references/instruments.md` → «Час прогону».

## The presence sweep — the first thing you do, once

**Before checking anything, establish what this site actually has.** `qa-run`
does it itself (RUN-02) and records every gate as **present** (with its pages)
or **absent** (with what was searched) in `results-qa-run.json → _presence`. A
gated row whose subject is absent becomes ⊘ with that reason — it is not
attempted and costs no time; a present subject means every row of its gate runs.
The agent never decides a gate by eye.

| Gate (RUN-02) | Rows it opens |
|---|---|
| burger, drawer or off-canvas panel | NAV-02…09, NAV-12, NAV-14, NAV-15, A11Y-02 — measured with the panel **open** |
| desktop dropdowns | NAV-01, A11Y-03 |
| slider / carousel / ticker | INT-03, INT-04, INT-09, INT-10 |
| tabs | A11Y-04, LAY-06 |
| FAQ | SEO-11 (and INT-01/02, NAV-13 for every toggle) |
| pop-up, modal, lightbox | MODAL-01, MODAL-02 |
| a form with fields | FORM-01…07, FORM-10…13, FORM-15, A11Y-09, IOS-04, WF-02 |
| a form that sends mail | FORM-08, FORM-09, FORM-14 |
| video | VID-01…05 |
| map | MAP-01…03 |
| contacts · social links · in-page anchors | LINK-08/09 · LINK-11 · LINK-10 |
| more than one language | I18N-02…06 |
| collection / related lists | CMS-01, EDIT-02 |
| search · subscribe · file field · sorting/filter · downloads · preloader · password page | FEAT-01 … FEAT-07 (person) |
| registration, login, account | ACC-01 (person, §14) |
| ACF layouts / shortcodes | WP-15 |
| cloned from a donor (`decisions.donor`) | DONOR-01, DONOR-02 |
| marketplace template (`decisions.projectType`) | TPL-01 |
| platform WordPress / Webflow (RUN-05) | WP-* / WF-* — the other platform's rows are ⊘ |
| stage (1 or 2) | STRUCT-01…03 only at stage 1; the deployed-only rows only at stage 2 |

The full mapping is `references/check-registry.md` (gate column). A gate whose
sweep could not finish (pages failed to load) is **not** reported absent: its rows
stay NOT RUN.

**Never invent the subject.** "There is no pop-up on this page" is an answer, not
a gap: do not go looking for a pop-up that the design never had, and never report
its absence as a defect.

### ⛔ The style guide page is a reference, not a test subject (practice rule)

**The style guide is where the checks read their values from. It is not checked
itself.** This covers the design-system page, the build's `styleguide/`, and Webflow's
`/templates/style-guide`.

- **It is the reference for unification and design values.** Colours, the type scale,
  spacing, button sizes and hovers on the site are compared against it. A button that
  differs from the style guide's button is a finding on the **site page**.
- **It is not a page under test.** At both stages the instruments leave it out of the
  discovered page list themselves (`qa-target.json → reference.exclude`, by default any
  `style-guide` / `styleguide` / `design-system` path; `false` switches it off) and name the
  pages they left out in RUN-03. An explicit `pages` list is taken as given. Nothing on it is checked: links, `<br>`, lorem and placeholders, H1 count, spelling, contrast, layout
  and animation of the page itself, alt, SEO fields. Nothing found **on** it is
  reported, with no 🔴, 🟡, ❓ or ⊘ row and no mention in the counts. A style-guide `<br>`
  or lorem paragraph is not a finding.
- **Nothing on it is changed for QA** unless the designer asks.
- **It counts as a source of usage.** A class, variable or asset that only the style
  guide uses is **not** "unused" and must never be deleted.

Practice rule, 2026-09-11. A run reported the three `<br>` in the starter style
guide's Spacing System notes as 🔴. The designer answered that testing the style guide
itself makes no sense, but it still counts for unification and design values.

**Every skipped block is named in the report**, one row in ⊘ Не застосовно with
the reason: *"пошуку на сайті немає — FEAT-01 ⊘"*. A silent skip
is indistinguishable from work not done, and that is the whole difference between
a checklist and a claim.

**Two absences are findings, not skips**, because the thing exists but is
unreachable: a **search page that nothing links to**, and a **form that no page
contains while a form plugin is configured**. Both are orphans, and both get
reported.

## A setting is not an inventory — count the things, not the switch

The presence sweep asks **whether a kind of thing exists**. That is not the same
question as **how many there are and what state each is in**, and a run that
answers only the first will read the settings screen and stop.

Three real misses, all the same shape:

- Comments were reported as «open by default, moderation off, anonymous
  allowed» — every word true, and **nobody asked whether a comment existed.**
  One was sitting in the moderation queue.
- Posts were reported as «12 published» — true, and **nobody asked why not
  13.** One had been pushed back to draft.
- A pattern file nothing inserts was found; a dead CSS block in the same theme
  was not.

**So wherever a check is about a kind of object, the object gets counted — by
every state it can be in, not only the visible one.** On WordPress the admin audit
does it (CMS-02 inventory, WP-02 leftovers, WP-09 comments); on Webflow CMS-02 is
read through the connection; elsewhere a person records it. The counts go in the report
even when they are unremarkable, because a number nobody wrote down is a number
nobody looked at.

| Object | What is counted |
|---|---|
| Comments | total, approved, **awaiting moderation**, spam, trash — and the author and body of anything not approved |
| Posts and pages | publish, **draft**, pending, future, private, **trash** — per post type, not in total |
| Collection entries | the same states, per collection, plus how many the page actually renders |
| Media | total, and how many are attached to nothing |
| Terms | per taxonomy, and how many hold zero entries |
| Users | per role, and the last-login of anything with admin rights |
| Menus | per location, and how many items each holds |

**A count that does not match the page is a finding on its own.** Four team
entries published and three cards rendered is a defect even when every card that
does render is perfect — and it is invisible to anyone who only looked at the
page.

## Priority — by consequence, so that not everything becomes "high"

| | Meaning |
|---|---|
| **HOOK** | Marked ⛔ HOOK / SUPER-HARD HOOK in this skill (section headings, HARD rows of its tables, `P: HARD` in `scripts/registry.cjs`). Mandatory, never skipped, never negotiated. Reported as **HARD**. |
| **HARD** | The page cannot ship: a hook was violated, or a defect blocks handover. |
| **HIGH** | Every visitor sees it, or it breaks a promise to the client. |
| **MED** | A reviewer or the client will notice. |
| **LOW** | Polish, or applies only on some projects. |

---

## ⛔ Гейт виконання — правило без доказу не пройдене (practice rule, 2026-10-05)

**Найчастіша причина пропущеного бага — не відсутнє правило, а невиконане.** У двох реальних
handoff поспіль майже кожен баг, який приніс людський QA, був покритий правилом, що вже існувало:
биті лінки на службових сторінках, порожній `alt`, `href="#"`, дробові пікселі, відсутній sitemap,
форма без антиспаму, залишки клонованого проєкту. Рулбук був; прогін їх не виконав. Тому
виконання — частина правила, і його рахує код, а не агент.

0. **Перший крок — машина, а не сторінка.** Що ця машина може і куди йде кожен недоступний рядок,
   пише сам `qa-run` (RUN-07, умови прогону) і кожен інструмент у своєму NOT RUN. Таблиця
   маршрутів — `references/instruments.md` → «NOT RUN». «На цій ОС неможливо» — маршрут, а не
   закритий рядок; рушій не підміняє браузер (WebKit ≠ Safari, Chromium ≠ Edge).
1. **Кожен рядок віддає доказ:** число, URL, шлях до файлу чи скриншота. «Перевірено», «виглядає
   добре», «покрито за висновком» доказом не є. ✅ з'являється в манифесті лише тоді, коли
   інструмент виміряв хоча б один предмет і нічого не знайшов (або людина записала `pass` з
   `--note`).
2. **Манифест** — `qa-out/manifest.{md,json}` від `manifest.cjs`: кожен ID реєстру, один статус,
   доказ. Немає рядка — прогін не завершений, і так і звітується.
3. Якщо поряд лежить handoff від людського QA — його рядки імпортуються **першими**
   (`record.cjs`, найближчий ID і кроки тестувальника як item), і лише потім іде звичайний прогін.
4. **Заборона висновку** діє всюди: один рушій не закриває інший, одна сторінка не закриває
   шаблон, одна CMS-картка не закриває колекцію.
5. **Три грубі порушення, які ніколи не бувають ❓, «прийнятно» чи «на розсуд дизайну»:**
   порожній або нікуди не ведучий лінк (LINK-01…03, LINK-05), зображення без `alt` (IMG-01, IMG-08)
   і нестиснутий ассет понад поріг (IMG-07). Кожне — 🔴 HARD із числом або селектором, на кожній
   сторінці й у кожному CMS-айтемі, і жодне не закривається «так у макеті».
   **Єдиний виняток для `#`:** плейсхолдер, заявлений проєктом наперед —
   `qa-target.json → decisions.declaredPlaceholders` з причиною й відповідальним. Такий лінк іде в
   звіт окремим рядком ⚠️ «заявлений плейсхолдер», а не зникає; незаявлений `#` лишається 🔴.
6. **Усе, що стосується DOM, ARIA, Lighthouse і копірайту, міряється на відрендереному DOM після
   JS** — так і роблять інструменти. Рантайм-скрипти додають і атрибути, яких немає в сорсі, і
   помилки, яких перевірка сорсу не побачить.

### Інструменти — що який закриває

Скрипти їдуть разом зі скілом, у `scripts/`. **Вони не містять ні адреси сайту, ні його
селекторів**: усе проєктне — у `qa-target.json` проєкту. Селектор, що не знайшов нічого, дає
`NOT RUN` з підказкою, який ключ задати, а не «пройдено».

| Файл | Що робить | ID |
|---|---|---|
| `registry.cjs` | реєстр усіх перевірок: єдине джерело правди | усі |
| `lib.cjs` | конфіг, браузери (закріплений Chromium), sitemap і вибірка сторінок, доступ, замки, формат результатів | — |
| `measure-page.cjs` | заміри всередині сторінки | — |
| `snapshot.cjs` | відкриває прогін; відбиток сайту і що змінилось | RUN-01 |
| `qa-run.cjs` | головний прогін: сторінки × 7 ширин × Chromium / WebKit / Firefox / Edge; тогли, слайдери, ховери, бургер, модалки, форми, лінки, вага, SEO, контент | 160 ID (`tool: qa-run`) |
| `spell.cjs` | кандидати орфографії й граматики (закріплений cspell на кожній ОС; `spell.swift` — лише `--second-opinion` на macOS, без знахідок) | TEXT-02, TEXT-08 |
| `lighthouse.cjs` | Lighthouse **послідовно**, закріплена версія | PERF-01 |
| `safari-real.cjs` | справжній Safari (macOS) | XB-02 (+ докази FORM-07, FORM-10) |
| `ios.cjs` | Mobile Safari в iOS Simulator, iPhone + iPad, відступи проти WebKit | XB-03, LAY-09 (+ доказ FORM-11) |
| `wp-admin-cfg.cjs` | збирає `QA_WP_CFG` для аудиту wp-admin з `qa-target.json`, `pages.json` і свіпу присутності — однаково для всіх | — |
| `wp-admin-audit.js` | аудит wp-admin лише на читання, у залогіненій вкладці | WP-01…12, WP-14, FORM-08/09, CMS-02 |
| `record.cjs` | рядки людини, маршрути, імпорт результатів з браузера (з перевіркою довжини й хешу) | будь-який ID реєстру |
| `manifest.cjs` | зібрати результати цього прогону й надрукувати манифест | усі |
| `handoff.cjs` | файл handoff для QA (режим 4): розділи 2–5 з манифесту, без ручного переписування | — |
| `state.cjs` | записує прогін і статуси рядків у `.qa-state.json` (меню наступного запуску) | — |
| `registry-md.cjs` | перегенерувати `references/check-registry.md` | — |
| `release-check.cjs` | перед тим як дати скіл колегам: жодних бекапів, кешів, проєктних файлів, імен (`--deny`) | — |
| `selftest/` | `npm test`: інструменти на локальних фікстурах, два прогони мають збігтися | — |

Встановлення — `INSTALL.md`; порядок, конфіг, маршрути — `references/instruments.md`.

### ⚡ Швидкі фікси — готовий фікс у звіті, виконується лише після дозволу (practice rule, 2026-10-05)

Рядки з цього переліку **детерміновані, зворотні й не є рішенням дизайну**, тому у звіті вони
мають готовий фікс у колонці «Виправлення» і позначку ⚡. Під час прогону вони **не виконуються**.
Виконуються після дозволу — зокрема одним словом «пофікси швидкі» (розділ «Fixing»).

**Швидкі фікси (закритий перелік):**

| Що | Як саме | Межа |
|---|---|---|
| Проблеми панелі аудиту платформи | за її ж підказкою (§21, Webflow Audits) | лише після дозволу, записом через підключення |
| Орфографія й друкарські помилки | за §5b, з урахуванням словника проєкту | слово з джерела клієнта — не чіпати, лише питання |
| Порожній лінк з **однозначним** призначенням | підставити реальну адресу | призначення неочевидне — ❓ з варіантами сторінок |
| `width`/`height` у `<img>` | з натуральних розмірів файлу | — |
| `loading`: `eager` на LCP-зображенні, `lazy` на решті | за §2 | — |
| Доступна назва іконкового лінка | з призначення лінка | — |
| Дробові пікселі у відступах | округлити до цілого за шкалою гайда | значення поза шкалою — звіт |
| **Кросбраузерне загартування** (нижче) | за переліком | — |
| **Відсутня анімація появи** на секції чи блоці | маркер анімації **системи проєкту** (той самий атрибут/клас, що в решти блоків) | у проєкті немає системи анімацій — звіт, не вигадувати свою |
| Стиснення ассета у збірці | перегнати у вебформат, не змінюючи кадр | заміна самого зображення — звіт |

**Ніколи не швидкий фікс (лише ❓ або звичайний рядок):** тексти й заголовки, розміри й
композиція, кольори, порядок секцій, видалення елементів, будь-які зміни в CMS-даних, усе, що
стосується бренду, і записи через API платформи (alt, aria-label, JSON-LD, пропси компонентів,
фільтри колекцій) поза дозволеним обсягом.

**Після кожного дозволеного швидкого фіксу — повторний замір тим самим інструментом** (окремий
частковий прогін, див. «Fixing»); у підсумковій таблиці «було → стало» і джерело значення.

#### Кросбраузерне загартування — застосовується на всіх проєктах

| Проблема | Фікс | Де болить | ID |
|---|---|---|---|
| `:hover`-стани без медіа-запиту | загорнути в `@media (hover: hover)` | тач-пристрої: ховер «залипає» після тапу | INT-07 |
| Висота першого екрана на `100vh` | `100svh`/`100dvh` із `100vh` як запасним | iOS Safari, Android Chrome: панель адреси зʼїдає екран | XB-06 |
| Прокрутка під відкритим меню | `overscroll-behavior: contain` на панелі + блокування сторінки | iOS ігнорує самий `overflow: hidden` | NAV-09, NAV-15, IOS-01 |
| Поле форми зі шрифтом < 16px | підняти до 16px | iOS Safari зумить сторінку на фокусі | FORM-15 |
| `backdrop-filter`, `mask`, `background-clip: text` | додати `-webkit-` префікси | Safari | XB-06 |
| Стрибок ширини при блокуванні скролу | `scrollbar-gutter: stable` або компенсація падінгом | Windows-браузери: горизонтальний зсув | маршрут (headless не має смуги прокрутки): XB-04 / людина |
| Анімації без поваги до налаштувань | `@media (prefers-reduced-motion: reduce)` | доступність, усі ОС | XB-07 |
| `text-size-adjust` | `100%` | Android Chrome збільшує шрифт сам | XB-07 |

Кожен пункт перевіряється інструментом за своїм ID; рядок без машинного виміру — маршрут у handoff.
Недоступний рушій — ⚠️ з маршрутом, а не тихе «виправлено скрізь».

### ⛔ Багатомовність: перемикач мови має справді перекладати (practice rule, 2026-10-05)

Реальний випадок від тестера: у футері стоїть перемикач мови, на десктопі все добре, а на Android
контент лишається англійським. Наявність перемикача — не доказ перекладу. Гейт — `lang` у RUN-02;
одномовний сайт отримує ⊘ сам.

| Перевірка | ID | P |
|---|---|---|
| `<html lang>` валідний на кожній сторінці; на багатомовному збігається з власним `hreflang` і локаллю в URL | I18N-01 | HARD |
| `hreflang` на кожній сторінці: свій запис, усі локалі, `x-default`; пари взаємні; кожен альтернативний URL віддає 200 | I18N-02 | HIGH |
| Перемикач справді міняє видимий контент, `<html lang>` і локаль в URL — у Chromium, WebKit і Firefox, на 1440 (клік) і 360 (тап) | I18N-03 | HARD |
| Вибір запам'ятовується після переходу на іншу сторінку | I18N-04 | HIGH |
| Переклад повний: текст, лейбли, плейсхолдери, кнопки, title і description кожної сторінки в кожній локалі | I18N-05 | HARD |
| Нічого не ламається: перекладені сторінки проходять ті самі зміри; хедер і кнопки ±4px від мови за замовчуванням | I18N-06 | HARD |
| Справжній Android / iPhone — перемикач тапом | XB-05 / IOS-* (маршрут, скріншоти I18N-03 у handoff) | HARD |

### ⛔ Обовʼязковий мінімум кожного прогону — рядки, які не можна не зробити

Ці рядки найчастіше «випадали», тому вони перелічені тут, у головному файлі. Жоден не
закривається без числа або файлу-доказу — їх дає манифест.

| Рядок | ID | Повне правило |
|---|---|---|
| Швидкість: мобайл і десктоп, числами (score, LCP, CLS, TBT) | PERF-01, PERF-02 | `references/seo-speed.md` |
| Орфографія й граматика всіх сторінок і CMS-айтемів | TEXT-02, TEXT-08 | §5b тут |
| Позначки обовʼязкових полів | FORM-02 | `references/forms-accounts.md` |
| Порожні лінки, відсутні `alt`, нестиснуті ассети | LINK-01…03, IMG-01, IMG-07, IMG-08 | §2, §5, §6 тут |
| Структура Section → контейнер (стадія 1) | STRUCT-01…03 | §7a тут |
| Контраст на кожній реальній парі, включно зі станами й фокусом | A11Y-01, A11Y-07, A11Y-08, A11Y-09 | `references/visual-layout.md` |
| Справжній Safari і Mobile Safari (або маршрут, якщо не macOS) | XB-02, XB-03, LAY-09 | `references/browsers-devices.md` |
| Кросбраузер: WebKit, Firefox, Edge, Chrome на Android | XB-01, XB-04, XB-05, XB-08 | `references/browsers-devices.md` |
| Багатомовність, якщо на сайті є перемикач | I18N-01…06 | тут, вище |

### ⛔ Проєкт-донор: залишки клонування (practice rule, 2026-10-05)

Коли сайт зроблено клонуванням іншого проєкту чи шаблону, залишки донора лишаються там, куди
візуальна перевірка не дивиться, і їх знаходить клієнт. Реальний випадок: 18 чужих сторінок,
дві чужі CMS-колекції, чужий GA4-тег (візити йшли в аналітику донора), форма з чужою назвою,
лінки на домен донора, копірайт із чужого футера.

**Перше питання прогону: з чого зроблено цей проєкт?** Відповідь записується в
`qa-target.json → decisions.donor` **до** `qa-run`: `[]` — не клон; інакше назви, домени й
хендли донора. Поки `null` — DONOR-01 ставить ❓ із переліком зовнішніх хостів, футерних рядків
і назв форм, щоб людина назвала донора без повторного прогону.

| Що перевірити | ID | Знахідка |
|---|---|---|
| Назва/домен/соцмережі донора в опублікованому HTML і мережевих запитах усіх сторінок; назви форм | DONOR-01 | будь-який збіг |
| Сторінки, CMS-колекції, форми, custom code у списках платформи | DONOR-02 (читання адмінки чи підключення → `record.cjs`) | сторінка чи колекція, якої немає в брифі; дефолтна «Email Form» |
| Аналітика й теги: інвентар, плейсхолдери, ID поза `decisions.analyticsIds` | TRACK-01 | чужий чи невигаданий ID — HARD, і одразу PM |
| Скрипти й ембеди на темплейті | TPL-01 | будь-що, крім рантайму платформи й GSAP з офіційними плагінами, поіменно |

Жоден із цих рядків не закривається оглядом сторінки очима.

### Механічні зміри найчастіших пропусків — хто їх робить

Колись це були рецепти для ручного заміру; тепер кожен рядок — ID інструмента, і агент читає
рядок манифесту, а не пише власний замір.

| Правило | ID |
|---|---|
| Кожен лінк веде кудись, на **всіх** сторінках, включно з 404/401/дякуємо/логін; ланцюжки редиректів | LINK-01, LINK-02, LINK-03 |
| Службові сторінки: лого й кнопка повернення ведуть на наявну сторінку поточного сайту | PAGE-02, NAV-11 |
| Доступна назва кожного лінка й кнопки (іконкові лінки у футері) | LINK-05 |
| Alt у кожного зображення; описовий, не шаблонний | IMG-01, IMG-08, IMG-09 |
| `width`/`height` у кожного `img` | IMG-02 |
| Цілі пікселі | LAY-08 |
| Антиспам на кожній формі, і він справді вантажиться | FORM-04 |
| Назва форми унікальна, не дефолтна, не чужа | WF-02, DONOR-01 |
| Sitemap, robots, canonical, X-Robots-Tag проти домену | SEO-03, SEO-06, SEO-07 |
| Швидкість числами | PERF-01 |
| Копія з джерела клієнта (`sources.copy`) | COPY-01 |
| Юридичні сторінки злінковані, живі, справжній текст | PAGE-01 |
| Блок кредитів: формулювання, кожне слово — лінк, кількість лінків | FOOT-01 |
| Соцмережі ведуть на профіль **цього** клієнта; пошта й телефони збігаються з брифом | LINK-08, LINK-11 |
| Текст футера проти макета (рік, юридичні рядки) | COPY-04, FOOT-01 |
| Нові секції — ті самі HARD-правила з нуля | кожен прогін повний |

<!-- merged 2026-11-05 from the 2026-10-19 branch of this skill -->
## …and the mirror of it: what is drawn is not what is written

**A count of rendered elements is not a count of authored blocks, and reading one
as the other invents defects.** The line above — "four entries and three cards is
a defect" — holds only when the two numbers are supposed to be equal. Inside a
loop they never are.

Measured on a live page: **29 tiles rendered, 6 tiles in the page's own content.**
Reported as "17 tiles are empty for some other reason" — a confident finding about
nothing. Four of the six sat inside query loops, and each loop drew its one tile
once per record. Two cards also held **two** blocks each, so twelve blocks made
six tiles. Both numbers were right; the comparison was not.

🔴 **Before comparing a rendered count with a source count, ask what multiplies
and what divides between them:**

| | |
|---|---|
| a loop | one authored block → as many as there are records |
| a repeater in a pattern | one written row → N drawn |
| nested blocks | several blocks → one visible element |
| a block hidden when empty | present in the source, absent from the page |

The honest version of the check is **render-to-render**: the page against the
design, or the page against itself at another width. Source-to-render only works
where you have established there is no loop between them.

And when the two numbers disagree and you cannot explain the ratio, that is the
moment to say so and look — not the moment to write the finding. Mine survived
two messages to the designer before the arithmetic came out.

## The screen is not the stored value

**An admin screen shows you what it chooses to show.** Measuring it is measuring
the screen, and twice in one day that was the wrong thing.

A redirect was typed as `/about-us/` and the plugin's list showed `/about-us/`.
What it had actually written was `https://staging.example.com/about-us/` — it had
expanded the path against the site it was running on. Visible only by opening the
rule itself; invisible in the list, and fatal the day the site changes domain.

A rule with a regex source looked right in the list and did something else
entirely when a real request hit it: the plugin treats the pattern as a
**replacement**, not as a destination, so it swapped the matched fragment and kept
the rest of the address.

🔴 **For anything a plugin stores, check the stored value or the behaviour, never
the list.** One real request and its `Location` header settles in a second what no
amount of reading the screen will.

## Your own check scripts get cached too

**The page cache does not know your diagnostic is a diagnostic.** A read-only
script opened at the site root came back from Varnish half an hour later with its
old numbers, and a whole theory was built on them before anybody noticed the
timestamps were stale.

🔴 **Print the current time at the top of every tool you run on a deployed site,
and read that line first.** If it is not now, nothing below it is now. Open them
with a fresh `?nc=<number>` each time — including between the dry run and the one
that writes, because those are two different URLs only if you make them so.

The same applies to any page being re-checked after a fix: a 404 cached before the
fix will keep being served afterwards, and it is not evidence of anything.

## Контрольний замір — скрипт, що шукає відсутність

**Скрипт, який шукає відсутність, спершу доводить, що вмів знайти присутність** — контрольний замір поряд із основним

| **Скрипт, який шукає відсутність, спершу доводить, що вмів знайти присутність** — контрольний замір поряд із основним | «нуль знахідок» від зламаного заміру виглядає як найкращий прогін проєкту |


# The checks

Each carries its priority and its stage. `M` means a person must confirm intent.


## Довідкові файли — вантажити за потреби

Головний файл несе протокол і хуки, які діють ЗАВЖДИ. Решта розділів лежить поруч; правила в
них ті самі, що були тут, і кожен розділ нижче лишив свій заголовок із посиланням. Статуси
рядків ставить лише `manifest.cjs`; довідник читається, щоб правильно закрити рядки людини й
маршрути через `record.cjs` і правильно сформулювати знахідку.

| Файл | Розділи | Коли читати |
|---|---|---|
| `references/instruments.md` | де запускати, порядок, тривалість, NOT RUN і маршрути, аудит адмінки, рядки людини, усі ключі `qa-target.json` | **перед кожним прогоном стадій 1, 2 і 3** |
| `references/check-registry.md` | реєстр усіх перевірок з ID, P, інструментом, гейтом, платформою, стадією (генерується з `scripts/registry.cjs`) | коли складаєш звіт, handoff і закриваєш рядки |
| `references/visual-layout.md` | 7. Design fidelity, 8. Spacing, contrast, alignment, 10. Responsive | відповідність макету, відступи, контраст, адаптив по семи тирах |
| `references/navigation-motion.md` | 9. Navigation and header, 11. Animation and hover | хедер, меню, дропдауни, анімації появи й ховер |
| `references/forms-accounts.md` | 12. Forms, 14. Registration, login and the user account | форми обох стадій, реєстрація, логін, кабінет |
| `references/page-features.md` | 13. The features the page actually has | FAQ, акордеони, таби, слайдери, карти, відео |
| `references/copy-and-content.md` | 15. The copy, 16. Content, and the pages a project owes | копія проти джерела, вичитка, сторінки, які проєкт винен |
| `references/seo-speed.md` | 17. SEO, speed and the technical sweep | SEO, швидкість, Lighthouse, технічний обхід |
| `references/handover.md` | 18. Handover cleanliness, 19. Editability | чистота передачі, невикористане, редагованість |
| `references/platforms.md` | 20. WordPress internals, 21. Webflow internals, the Webflow connection | нутрощі WordPress і Webflow |
| `references/browsers-devices.md` | 22. Links, browsers, devices | лінки, кросбраузер, Safari, iOS Simulator, пристрої |
| `references/reports.md` | Reports: the QA handoff (mode 4), the bugs-made report (mode 5) | **лише режими 4 і 5** |

## ⛔ 1. Fonts — SUPER-HARD HOOK (ALWAYS) · stage 1

Instruments: FONT-01 (rendered vs declared families, faces load, form controls
inherit), FONT-02 (self-hosted, `font-display`, used weights = loaded weights),
XB-01 (the same fonts in WebKit and Firefox). Icon fonts listed in
`decisions.iconFonts` are not counted as text families.

- **Read the family that actually resolves**, not the one the CSS asks for. A
  missing file falls back silently and the page looks *almost* right.
- **A third family is a question, never a verdict.** If something outside the two
  named families resolves anywhere — Georgia on a testimonial, a system stack on
  an input — report it in **❓ Потребує рішення**: *"`.testimonial-text` renders in
  Georgia, the rest of the page is Inter. Change it, or is it deliberate?"*
  It may be a design choice, and it may be a fallback nobody noticed; only the
  designer knows which.
- **Free Google fonts only.** A paid family is raised with the PM to confirm the
  client holds a licence — again a question, not a defect. `M`
- **Self-hosted, and every weight loaded is a weight used.** A weight loaded and
  never used is dead bytes; a weight used and never loaded is a browser-synthesised
  fake — bolder or slanted by algorithm, and visibly wrong beside the real face.
- **An icon font is not a text family and is never counted as one.** Font Awesome
  and its kind are kept deliberately, wired through the variables that place
  icons, and they carry no text — so they are neither a "third family" nor dead
  weight, and their files in the assets panel are **not** unused. Before reporting
  any font file as a leftover, check whether an icon class or variable references
  it; if one does, it stays. What is worth reporting about an icon font is
  narrower: **a subset far larger than the icons actually used**, or a file that
  nothing references at all.
- **Count the families that are declared, not only the ones that render.** A third
  family can be invisible on the page and still be loaded: an extra entry in
  `theme.json` → `settings.typography.fontFamilies`, a stray `<link>` to the Google
  CDN, an `@font-face` nothing selects. Read the declaration list, then match it
  against what actually resolves. A family declared and unused is dead bytes and a
  request; a family used and undeclared is a synthesised fake.
- **`font-display: swap`** on every face, and `preconnect` where files are remote.
- **The resolved family, not the declared one.** Check the computed value on a
  real heading and a real paragraph. A missing file falls back silently, and the
  page looks *almost* right.

## ⛔ 2. Images and video — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

- **Every image is sized for the box it occupies.** Compare `naturalWidth`
  against the rendered width at the largest breakpoint where the image appears.
  More than **2×** is a finding, with the number in the report.
- **Modern format** — WebP or AVIF. A JPEG or PNG in a content slot is a finding.
- **`width` and `height` attributes on every `<img>`**, so the box is reserved
  before the file lands. Their absence is a CLS failure that never shows on a fast
  local machine.
- **`loading="lazy"` below the fold, eager on the LCP image**, `decoding="async"`.
- **Video:** `muted loop playsinline autoplay` for background video, a `poster`,
  compressed, and never a multi-megabyte file served from the media library.
- **Weigh the page, not the folder.** Total transferred bytes for one page. A hero
  that weighs eight megabytes passes every visual check ever written and fails the
  only measurement the client runs.
- At **stage 2** this runs again: caching and image plugins change what is served,
  and a WebP conversion that did not happen is invisible in the source.
- **⛔ Байти міряються запитом, не `performance`-API (practice rule, 2026-09-16).** CDN
  (Webflow `cdn.prod.website-files.com`) не віддає `Timing-Allow-Origin`, тому
  `encodedBodySize` / `transferSize` кожного зображення = 0, і «вага сторінки» тихо
  проходить. Інструмент бере вагу кожного файлу із заголовків відповіді (CDP / HEAD), не з
  `performance`. Нуль байтів — не «легкий файл», а зламаний вимір: ❓, ніколи ✅.
- **Зважити й те, що не лежить у `<img>`:** кожен `link[rel*=icon]`, `og:image` кожної
  сторінки й кожного CMS-айтема, SVG-ілюстрації й текстури з CSS, шрифти, відео. Пороги —
  `decisions.assetMaxKB` (типово растр 300 KB, SVG 50 KB, favicon 20 KB, og:image 200 KB,
  шрифт 150 KB) і `decisions.maxVideoMB` — **IMG-07**, VID-04, SEO-08, з числом у звіті.
  Урок одного прогону: favicon 132 KB, OG 380 KB PNG, SVG 140 KB — інструмент тоді міряв 0
  і не бачив нічого; знайшов QA.
- Instruments: IMG-02 (attributes), IMG-03 (size vs box), IMG-04 (format), IMG-05 (lazy
  above the fold), IMG-06 (broken), IMG-07 (bytes), VID-01…04 (poster and autoplay attributes, resolution through a detached probe,
  playback, file size), PERF-02 (page weight). VID-05 — one clip full screen, by eye.

## ⛔ 3. Unification — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

**Things that are the same must measure the same.** This is the check that finds
what the eye registers as "slightly off" without being able to name it: one card
in a row with a 6px gap while its neighbours have 8px, one section with 79px of
padding among 80s, one button 2px taller than the rest.

The method is mechanical, and the instruments do it: LAY-07 (button variants,
sibling sets, headings, media ratios), LAY-10 (section insets), LAY-14 (spacing
skeleton), LAY-15 and NAV-07 (icon line weight). Approved exceptions go into
`decisions.unifyExempt`. What they apply:

1. **Group by role** — all cards inside one grid, all buttons of one variant, all
   section top paddings, all icons in one rail, all headings of one level, all
   media boxes in one set.
2. **Read the computed value** for each member: gap, padding, margin, radius,
   border width, font size, line height, width, height, aspect ratio.
3. **The group's mode is the intended value.** Anything that differs from it is a
   finding — report the element, the group, the expected value and the actual one.

Do not repair by eye and do not average. Report the outlier, name the value the
rest of the group uses, and let the designer confirm which is right — sometimes
the odd one is deliberate, and that is exactly what the report is for.

**A number you measured but no rule covers is still a finding.** If a value looks
wrong and nothing in this file names it, do not discard it — put it in ❓ with both
numbers and let the designer judge. The alternative is what happened once: the run
had `brandX: -3` in its own data at 768 and 360, matched it against no rule, and
said nothing, while the logo sat three pixels off the screen edge.

### Icon line weight is a unification check too

**Icons that sit together must draw lines of the same thickness.** The burger's bars,
the close cross that replaces them, the dropdown chevron, the arrows in links and
buttons — the eye reads them as one set, and a cross at 1.6px beside bars at 1px
looks like a different icon family even when every size is right.

Measure the **rendered** thickness, never the attribute:

- a stroked SVG: `stroke-width × (rendered width ÷ viewBox width)` — a
  `stroke-width="1.6"` in a 24-unit viewBox drawn at 30px is **2px**, the same
  attribute at 18px is **1.2px**. With `vector-effect: non-scaling-stroke` the
  attribute is already the pixel value;
- a `<use>` icon: take the viewBox of the **symbol** it points to, not of the outer `<svg>`;
- a bar built from a `div`: its `height` (or the border width, if the line is a border);
- a filled-outline icon: the thickness is baked into the path — compare it by
  eye against a 4× screenshot and say that it was compared by eye.

Group them the way the visitor meets them: **burger ↔ close** (the same control in
two states, measured with the panel closed and open), **chevrons** across header,
panel and FAQ, **arrows** across buttons and links, **social / contact icons**. Any
member more than **0.25px** off the group's value is a finding — name both icons and
both numbers: *«хрестик 2px, смужки бургера 1px — той самий контрол у двох станах»*.
Measure at 1440 **and** at 360: an icon that scales with its box changes weight
between tiers, a div bar does not, so a pair that matches on desktop can split on
mobile.

**Name the element, never the spread.** "Nine padding variants across eighteen
buttons" is a shrug; "the hero's *Get in touch* is 85px tall, the other
seventeen buttons are 61px" is a defect someone can fix in a minute. One row per
outlier, with the element, its value, and the group's value — a list of variants
tells the reader that something is wrong somewhere, which they already suspected.

## ⛔ 4. Whole-integer pixels — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

**No fractional pixels in spacing or size** (LAY-08). A computed `13.4px`, `64.7px`,
`23.99px` is a finding. Walk padding, margin, gap, radius, width, height and
font-size across the page and list every value that is not an integer.

The cause is almost always one of four, and naming it saves the fix:

- a **percentage or `vw`** where the design has a fixed value;
- a **`calc()`** dividing by a number that does not divide evenly;
- a **`rem`** against a root font size that is not 16;
- **`space-between` / `space-around`** distributing leftover space, which is fine
  for position but not when it lands in a declared gap.

Line height is the one legitimate exception — `1.2` and `1.5` are ratios, not
pixels. Everything measured in pixels is an integer.

## ⛔ 5. Alt text — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

- **Every `<img>` has an `alt` attribute.** Missing is a finding; there is no such
  thing as an image that does not need the attribute.
- **It describes the content.** `alt="image"`, `alt="photo"`, a filename, or the
  same text on every image in a set are findings.
- **⛔ Every image carries non-empty alt text — decorative ones included (practice rule).** An empty
  `alt=""` is a finding by default even for pure decoration: write a short description of what the
  image shows («Abstract line illustration», «Services icon»). On a platform, asset-panel alt and element
  alt are both filled. A project whose designer decided otherwise records that in `qa-target.json`.
- **A meaningful `background-image`** — a logo, a portrait, an infographic — needs
  an accessible alternative; decoration does not.
- At **stage 2**, CMS images take their alt from the field, so an empty field is
  the finding, not the template.
- Instruments: IMG-01 (present and non-empty), IMG-08 (not a generic word, not a
  file name; one alt on ≥3 different pictures → ❓), IMG-09 (meaningful
  background-image candidates → ❓ with screenshots). The *wording* of a good alt
  is `seo-check`'s; placeholders and file names are caught here.

---

## ⛔ 5b. Орфографія і граматика — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

**Текст перевіряється на кожному прогоні, без винятків** (practice rule, 2026-10-05). Це не
«якщо лишиться час» і не разова вичитка на початку проєкту: будь-яка нова секція, нова CMS-картка
чи правка копії приносить нову помилку, а помилку в тексті першим бачить клієнт.

**Обсяг:** увесь текст кожної сторінки **і кожного CMS-айтема** — видимий і прихований (закриті
FAQ, неактивні таби, підменю, стани форм), заголовки, кнопки, лейбли, плейсхолдери, `alt`,
`aria-label`, `title`, мета й Open Graph, рядки JSON-LD. `qa-run` збирає його з **відрендереного DOM
після JS** у `qa-out/texts.json`, разом із мовою кожної сторінки.

**Як — інструментом, не очима і не власним скриптом:**

1. `node "$S/spell.cjs" --out qa-out` — закріплений cspell на кожній ОС; англійська за
   `decisions.englishVariant` (en-US / en-GB), інші мови — за `<html lang>` сторінки, якщо словник
   встановлений (`@cspell/dict-<мова>` у `scripts/`), інакше ця мова — NOT RUN з маршрутом, ніколи
   «0 кандидатів». Кожна мова має самоперевірку словника.
2. Кандидати в `spell-candidates.json` (TEXT-02) і граматичні кандидати в
   `grammar-candidates.json` (TEXT-08: артикль + множина, подвоєне слово, пробіл перед комою,
   подвійний пробіл, `...` проти `…`, змішані лапки) **читаються в контексті** — спелчекер не бачить
   узгодження.
3. Висновок записується: справжні помилки — `record.cjs --id TEXT-02 --status fail --where "/page/"
   --why "recieve → receive"`; жодної справжньої — `--status pass --note "N кандидатів прочитано, 0 справжніх"`.
4. Слова, що лише **виглядають** помилкою — бренд, прізвище, абревіатура, галузевий термін —
   звіряються з матеріалом клієнта й додаються в `qa-target.json → dictionary`, щоб наступні
   прогони й колеги їх не чіпали. Ніколи не «виправляти» їх у словникове слово.
5. Якщо є текст клієнта (`sources.copy`) — COPY-01 спершу звіряє з ним; збіг помилки з джерелом
   стає питанням, а не дефектом (§15).

`spell.cjs --second-opinion` на macOS додає NSSpellChecker лише як нотатку (він враховує вивчені
слова конкретного Мака), ніколи як знахідки.

**У манифест ідуть числа:** скільки сторінок і джерел тексту перевірено, скільки кандидатів, скільки
підтверджено. Прогін без них — ⚠️, не ✅.

## ⛔ 6. Operate every control — do not merely look at it — HOOK (ALWAYS)

**A dead control looks exactly like a working one.** It is present, styled,
positioned correctly, and it does nothing. No amount of reading markup or
computed styles will ever reveal it — the only way to find it is to use it.

So use every one of them, once, and record what happened — this is what `qa-run`
does: INT-01/02 (toggles, then the revealed content measured again), INT-03/04/09/10
(sliders: arrows, bullets, swipe, autoplay pause), NAV-01/13 (dropdowns, whole-row
hit test), NAV-02…15 (burger), MODAL-01 (pop-ups), FORM-01/11 (typing), LINK-07/13
(controls that do something):

- **every dropdown** — open it, and open **each** one separately. A menu where
  four dropdowns work and the fifth does not is the normal shape of this defect,
  and testing one is testing nothing.
- **every slider** — click the arrows, click the pagination, drag on touch. Arrows
  that lost the class that binds them still render perfectly.
- **every accordion, tab and toggle** — open and close, and confirm the
  single-active or multi-active behaviour the design specifies.
- **every pop-up trigger** — open it, scroll inside it, close it.
- **every input** — click into it and type. `pointer-events: none`, a covering
  overlay, a `readonly` left from a demo: all invisible until you try.
- **every burger and drawer**, at 768 and at 360, submenu included. Tap the
  **label and the empty part of every expandable row**, not only its icon: the
  whole row must open the submenu (§9).

### ⛔ Every link, button and link element has a destination — a mechanical sweep of every page — HARD

Instruments: LINK-01…13, JS-01, NAV-11, PAGE-02, plus WF-02/03 on Webflow. The
table below is what they measure; the agent reads the manifest rows.

This is the designer's rule. **Nothing on the site that looks or acts like a link or
a button may be empty or go nowhere.** A dead one looks like a button, hovers like
a button, and goes nowhere. Checking by eye misses half of them, so this is a script.

**Where it runs:** on the **rendered DOM**, after JavaScript, so links the runtime
builds (job rows, CMS lists, menus) are included. It covers every page, every CMS
item page, and the 404, 401 and password pages. It **never** covers the
style guide page itself (see *The style guide page is a reference, not a test
subject*). Run it at desktop,
and again at 360 with the burger and its submenu open.

**What it collects:** every `a`, `button`, `[role=button]` and
`input[type=submit|button]`, and every Webflow Link Block, Text Link and Button. It
also collects anything that looks like a button or card (a button or card class,
`cursor:pointer`) and is not inside one of those. Each of these is a finding:

| Знахідка | P |
|---|---|
| `<a>` без `href`, з `href=""`, `href="#"` або `javascript:` (LINK-01) | HARD |
| Якір `#id`, `/#id` чи повна адреса сторінки з `#id`, якого немає на сторінці (LINK-02); якір лягає під фіксований хедер (LINK-10) | HARD |
| Посилання на адресу, що не відповідає 200 — кожна унікальна адреса (LINK-03) | HARD |
| Порожній лінк або кнопка: немає ні тексту, ні `aria-label`, ні alt у вкладеному зображенні, ні sr-only тексту (LINK-05) | HARD |
| Елемент виглядає як кнопка, картка чи лінк, але не є ні `<a href>`, ні `<button>` (LINK-06); прихований лінк (LINK-12) | HARD |
| Лінк-елемент у Webflow (Link Block / Button / Text Link) без налаштованого Link Settings — навіть прихований чи в компоненті (LINK-01, LINK-06) | HARD |
| **Паритет з білдом:** кожне посилання з білду (картка, CTA, пункт списку, порожній стан) є і на сайті; менше на сайті — знахідка (REF-02) | HARD |
| `<button>` поза формою, який нічим не керує: ні обробника, ні `aria-controls` / `aria-expanded` (LINK-13) | HIGH |
| **Керуючий елемент — не лінк зовсім.** Бургер, хрестик, тогл підменю, акордеон лише відкривають і закривають, тож на них немає ні `<a>`, ні `href` — навіть на якір. У білді це `<button type="button">`; у Webflow — Block з `role="button"`, `tabindex="0"`, `aria-controls` / `aria-expanded` і обробником Enter/Space. `<a href="#…">` на такому елементі — знахідка (LINK-13) | HARD |
| Зовнішнє посилання без `target="_blank"` і `rel="noopener noreferrer"` (LINK-04); `mailto:` / `tel:` з помилкою, не той, що в тексті, чи не з брифа (LINK-08); видима пошта чи телефон без лінка (LINK-09) | HIGH |

A real form submit (`<button type="submit">` / `input[type=submit]`) is not a
"button without an action".

**When the destination is unambiguous** (the build has it, the label names a page,
the card belongs to a CMS item), the report row carries the exact fix, marked ⚡:
in Webflow a Link of Type Page or Collection page, never a typed `/path`, plus the
same change in the build. Nothing is changed until the designer approves. After
approval, re-run the sweep until it reports zero and list every fixed link:
сторінка, елемент, «було → стало». A destination that is genuinely unknown becomes
a ❓ with concrete page options.

This block finds the defects nothing else can, so it is never skipped for time.
Where an instrument could not run it, the row is NOT RUN with the reason — fix the
cause and re-run the instrument, never report the page as fine.

## ⛔ 6b. Внутрішні відступи з усіх боків, на кожному тирі — SUPER-HARD HOOK (ALWAYS) · stages 1 and 2

**Контент ніколи не впирається в край.** Ні в лінію сітки, ні в край картки, ні в
край екрана, ні в сусідній блок. Якщо текст, іконка чи кнопка стоїть впритул до
краю, бо контейнер у якомусь медіа-запиті втратив `padding` (`padding-right: 0`,
`padding: 0`, забутий бік), — **це баг**, навіть якщо на десктопі все гаразд.
Саме так він і живе: на 1440 відступ є, на 768 чи 360 його хтось обнулив, і
заголовок на телефоні лягає прямо на лінію.

Міряють інструменти, **на всіх 7 тирах і на кожній сторінці** (секції знаходяться крізь обгортки
платформи; `selectors.section` у `qa-target.json`, якщо ні):

| Що | ID |
|---|---|
| Текст ≥ `decisions.edgeMinPx` (8px) від краю екрана — і загальна обгортка з `overflow-x: hidden` перевірку не вимикає | LAY-03 |
| Текст ≥ 8px від кожного намальованого краю картки, панелі, клітинки, вертикальної лінії сітки — з усіх чотирьох боків | LAY-11 |
| **Асиметрія — знахідка, навіть коли обидва відступи більші за 8px:** блок, у якого з одного боку менше, ніж у решти секції (15 проти 35) | LAY-11 |
| Відступ з обох боків межі зміни фону між секціями | LAY-12 |
| Одне ліве ребро на тир: лого, секції, футер (±2px) | LAY-13 |
| Мобільне вирівнювання всередині секції | LAY-05 |

Правила, які інструменти застосовують і які агент тримає в голові, формулюючи знахідку:

1. Вертикальні лінії сітки — це край, якщо дизайн їх має; секцію без ліній ця частина не стосується.
2. Візуально приховані частини (`.sr-only`, `clip`, 1×1px absolute) не рахуються — міряється
   видимий бокс.
3. Перевіряються **обидва боки**: найчастіше губиться правий відступ, бо текст зліва вирівняний і
   дефект не видно, доки довгий рядок не дотягнеться до правого краю.
4. Якщо в білді відступ теж `0` — це все одно баг дизайну; його виправляють у білді й на сайті,
   а не «переносять 1:1».
5. Урок (practice rule, 2026-09-16): заголовок секції на 360–390 мав праворуч 15px при 35px у решти
   секції — знайшов QA на iPhone («add more padding»). Поріг 8px асиметрію не рятує.

Звіт — окремим блоком: сторінка → тир → секція → елемент → бік → фактичний відступ →
очікуваний. Цей хук не пропускається через час і не замінюється скріншотом: дефект на 360 не
видно на 1440.

## 7. Design fidelity

→ **Повний розділ: `references/visual-layout.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## ⛔ 7a. Structure and markup — HOOK (ALWAYS) · stages 1 and 2

**Чиста, впорядкована розмітка — окрема перевірка, а не наслідок гарного вигляду.** Сторінка може
виглядати пиксель-в-пиксель і мати зламану структуру: саме вона потім ламає редагування, адаптив
і перенесення на платформу. Правила структури беруться з гайда проєкту; нижче — порядок, який
перевіряється завжди, і спосіб перевірити його механічно, а не очима (practice rule, 2026-10-05).

### Порядок вкладеності — Section, далі контейнер, далі контент

```html
<section class="section section-name">
  <div class="base-container">
    <div class="section-head">…</div>
    <!-- контент секції -->
  </div>
</section>
```

| Перевірка | ID | P |
|---|---|---|
| Кожен блок сторінки — справжній `<section>`, а не `div` | STRUCT-01 | HARD |
| Перший клас — структурний (`section`), другий — назва секції | STRUCT-01, STRUCT-02 | HARD |
| **Одразу всередині секції — контейнер** (`base-container` або його аналог у гайді — `decisions.containerClass`), і нічого між ними | STRUCT-01 | HARD |
| Весь контент лежить у контейнері, а не поруч із ним (виняток — декор із `decisions.decorClasses`) | STRUCT-01 | HARD |
| Бокові відступи контейнера однакові по секціях на кожному тирі, значенням із гайда | STRUCT-01, LAY-13 | HARD |
| Вертикальні відступи секції задаються **лише** службовими класами (`section`, `section-top`, `section-bot`), не власним класом секції | LAY-10 (+ огляд CSS) | HARD |
| Максимум 2 класи на елемент: структурний + модифікатор | STRUCT-02 | HIGH |
| Іменування: lowercase-hyphen, префікс секції; стани `is-*`; модифікатори без префікса (`decisions.classNamePattern`) | STRUCT-02 | HIGH |
| **У кожного елемента свій клас; селектори-нащадки не використовуються** (`.block h2`, `.block div`) | STRUCT-02 | HIGH |
| Інлайнових стилів немає (виняток: значення, які виставляє рантайм-анімація) | STRUCT-03 | HARD |
| Технічні маркери прибрані після звʼязування: класи-маркери CMS (`field-*`), `data-*` від конструктора, порожні обгортки | STRUCT-02 | HIGH |
| Семантика сторінки: один `<h1>`, рівні заголовків не перестрибують, є `header`/`main`/`footer`, повторювані блоки — списками | A11Y-06 | HARD |
| Та сама структура **на платформі після публікації**: конструктор додає свої обгортки, і структура розходиться зі збіркою | REF-02 | HARD |

**Стадії.** STRUCT-01…03 міряються на стадії 1 — у збірці, де структуру ще видно (сторінка
читається з вимкненим JS, тож рантайм-класи й інлайн-стилі анімацій не рахуються). На стадії 2
платформа вставляє власні обгортки, перейменовує класи при клонуванні компонентів і лишає порожні
`div`: розходження структури з чисто закритою стадією 1 ловить REF-02, з обома значеннями в звіті.

**У манифест іде число:** скільки секцій перевірено, скільки з них порушили порядок, скільки
елементів мають більше за 2 класи.

## 8. Spacing, contrast, alignment

→ **Повний розділ: `references/visual-layout.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 9. Navigation and header

→ **Повний розділ: `references/navigation-motion.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 10. Responsive — the browser gets seven tiers, the editor gets what the platform has

→ **Повний розділ: `references/visual-layout.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 11. Animation and hover

→ **Повний розділ: `references/navigation-motion.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 12. Forms — both stages, and stage 1 is not optional

→ **Повний розділ: `references/forms-accounts.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 13. The features the page actually has

→ **Повний розділ: `references/page-features.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 14. Registration, login and the user account

→ **Повний розділ: `references/forms-accounts.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 15. The copy — against its source, then on its own

→ **Повний розділ: `references/copy-and-content.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 16. Content, and the pages a project owes

→ **Повний розділ: `references/copy-and-content.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 17. SEO, speed and the technical sweep — both stages

→ **Повний розділ: `references/seo-speed.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 18. Handover cleanliness — mostly stage 2, but the "unused" sweep starts at stage 1

→ **Повний розділ: `references/handover.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 19. Editability — the thing the whole build is for — stage 2

→ **Повний розділ: `references/handover.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 20. WordPress internals — what breaks where nobody is looking

→ **Повний розділ: `references/platforms.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 21. Webflow internals — what breaks where nobody is looking

→ **Повний розділ: `references/platforms.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## Use the Webflow connection before deciding anything is unreachable

→ **Повний розділ: `references/platforms.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## 22. Links, browsers, devices

→ **Повний розділ: `references/browsers-devices.md`.** Прочитати цей файл перед перевіркою; тут залишено лише заголовок, щоб розділ не загубився у плані прогону.

## Every HARD row is a hook

The HARD rows are this skill's fixed rules, the same for every project and every
machine: the spacing skeleton, whole-integer pixels, unification, fonts, image
optimisation, the header that never breaks, no truncated text, the footer credit,
reveal animation, hover timing on its two-value scale, card grids collapsing to
one column, contrast. Their priority is the `P` of their registry ID
(`scripts/registry.cjs`) or of their table row. A HARD finding is quoted with its
ID or the text of its row — the skill is the authority, not the checker's
judgement and not any guide file that happens to be on the machine. A rule changes
only with a new skill version.

**A hook breach is never ❓.** ❓ exists for things only the designer can decide —
a third font that may be a choice, a contrast ratio that is uniform across the
site. A hook has already been decided for every project. So «a `<br>` inside a
heading — leave it or remove it?» is the wrong row: TEXT-01 is HARD, and unless
the designer listed it in `qa-target.json → decisions.brAllowed`, it is 🔴. Where
the instrument itself grades a row ❓ (a logo hover without `decisions.logoHover`,
contrast over an image), the instrument's status stands — the agent does not
re-grade it either way.

**Назва рядка — ще не вимога. Прочитай увесь рядок таблиці (і його ID у реєстрі), перш ніж
робити з нього перевірку.** Деякі правила названі за формою, до якої прагнуть, а визначені через
те, що забороняють. «Banner text — 2 lines on desktop, NEVER truncated» раз за разом породжувало
фантомну перевірку: заборона стосується обрізання, а повне речення завжди перемагає преференцію
двох рядків. **Цитуй речення, яке несе вимогу, а не заголовок — і якщо тіло пом'якшує заголовок,
виграє тіло.**

The one thing worth saying alongside it is **where it came from** — «this `<br>`
is Shift+Enter in the Webflow editor, carried through the port» — because that
tells the designer it will come back on the next import. But the status stays
🔴.

## 23. Never checked here

Two kinds, and both are named in the report rather than passed silently.

**Belongs to `seo-check` — the choices, not the presence.** These are not registry
rows. In the chat report each gets one line with the status 🔁 and the reason
"виконує seo-check". The handoff file always lists these five in section 3
(`handoff.cjs` adds them), owned by «seo-check або людина», so it does not matter
whether that skill is installed on this machine. Never ⊘ — work is owed.

| Перевірка | Статус |
|---|---|
| Формулювання meta title і description | 🔁 seo-check (наявність, унікальність, довжина — SEO-01/02 тут) |
| Набір фавіконів | 🔁 seo-check (вага favicon — IMG-07 тут) |
| Вибір і дизайн зображення Open Graph | 🔁 seo-check (наявність, своє на кожну сторінку, формат, розмір — SEO-04, SEO-08 тут) |
| Тип структурованих даних | 🔁 seo-check (JSON-LD парситься, FAQPage = FAQ — SEO-05, SEO-11 тут) |
| Літературна якість alt | 🔁 seo-check (відсутній, порожній, шаблонний alt, ім'я файлу — IMG-01, IMG-08 тут) |

**One exception, and it is checked here, not by `seo-check`:** on collection pages
the OG image **must be pulled from the item's field by code** in the template head
(§17 stage 2, §21 SEO fields). Which picture to design is `seo-check`'s question;
whether every item page actually serves its own is a data binding (SEO-04), and a
binding is this skill's to verify.

**Outside reach entirely — `SKIP`:** client comments in the project-management tool
and in the design file · stock-library links in the design file · a test
submission confirmed by the client · CRM integration. They stay on the human QA's
list. **Never report them as passed.**

---

# The report

**One table. Every check gets a row, and every row gets a status.** Not a list of
complaints with the passes hidden somewhere else — the whole page, top to bottom,
in one place, so the state of the site can be read in one pass.

**At stages 1, 2 and 3 the rows come from `qa-out/manifest.json` and nothing else.**
The status of a row is the manifest's status — the agent groups the rows by page
section and words them, it never re-grades them. Every manifest row appears; the
report's counts add up to the manifest's counts.

Three columns carry it:

| Перевірка | Статус | Що саме |
|---|---|---|

- **Перевірка** — written as the task, the way it is asked for: *"перевірити
  кнопки відповідно до стайлгайду"*, *"перевірити дропдауни в хедері"*,
  *"перевірити шрифти"*, with the registry ID in brackets at the end:
  *«перевірити дропдауни в хедері (NAV-01)»*. Not a CSS property.
- **Статус** — one of the statuses below.
- **Що саме** — the finding in a sentence a person would say out loud, naming the
  element and the numbers: *"кнопка «Get in touch» у хіро має падінги
  18px, решта кнопок 24px"*. Empty when the status is ✅.
- **Every non-✅ row also says why it happened and whether a visitor sees it** —
  in plain words, in the first report, not after the designer asks: *«зайвий
  `<link>` після лінка: Webflow дублює атрибут `href`; відвідувач не бачить,
  валідатор бачить»*. Working out the cause first often shows that the finding is a
  deliberate decision — an attribute set on purpose — and then it is not reported
  at all. A finding without a cause makes the designer investigate it again
  themselves.

Two more columns when the report is going to someone who will fix it — **Де**
(selector, breakpoint) and **Виправлення**. They stay narrow; the sentence is what
gets read.

## The statuses — one vocabulary for the report, the manifest and the state

| | Manifest key | Means | Example |
|---|---|---|---|
| ✅ | `pass` | **Пройдено** — measured, at least one subject, correct | |
| 🔴 | `fail` | **Провалено** — it does not work | дропдаун «All Pages» не відкривається · стрілки слайдера не гортають · інпут підписки не приймає текст · кнопка без посилання |
| 🟡 | `fail` | **Не за дизайном** — it works, the value differs from the rest of the site. Shown as 🟡 for a fail of a consistency check (LAY-05…08, LAY-10, LAY-13…15, INT-06, NAV-06/07, TEXT-03/04/06/07); counted with 🔴 in the manifest | падінг секції 56px, у решти секцій 130px |
| ❓ | `ask` | **Запитати** — it may well be deliberate, and only the designer knows | третій шрифт на відгуках · контраст 3.1:1 у футері, але однаково на всьому сайті |
| 🔑 | `routed` / `not-run` | **Потребує доступу** — the missing input is access: the client's map key, the real recipient address, an admin session. Recorded as `routed --note "доступ: що бракує, від кого"` | ключ карти клієнта · справжня пошта отримувача |
| 🔁 | `routed` | **Передано** — a person or another machine owns it, named in the note; goes to handoff section 3 | Edge на Windows-машині QA · справжній iPhone |
| ⊘ | `na` | **Не застосовно** — there was nothing to check (gate, platform, stage, designer's dated decision). **Nothing is owed.** | пошуку на сайті немає · не WordPress · стадія 2 |
| ⚠️ | `not-run` | **Не вдалося перевірити** — it applies, and it was not (fully) measured. **Work is outstanding.** Every row says what would unblock it | рушій не стартував — `npm run browsers` · немає сесії адміна · сторінка за антиботом |

## ✅ is the one status that has to be earned

**Every other status describes the page. ✅ describes what you did.** That is why it
is the only one that can be wrong while looking right.

**A ✅ means: the named instrument ran on at least one subject, and its output was
clean** — or a person recorded `pass` with the evidence in `--note`. Nothing else
earns it — not "the front end looks fine", not "nothing jumped out", not "the file
parses". The manifest never prints ✅ for an instrument that reported zero tested
subjects; it prints ⚠️.

**⚠️ is not an admission of failure. A wrong ✅ is.** A ⚠️ says "come back to
this" and costs one more run. A ✅ on a row nobody checked closes the question
permanently, and the defect ships. Given the choice, always take the ⚠️.

Three phrasings that are never a pass, because each one describes the front end
answering a question the front end cannot answer:

| Written | What it actually means |
|---|---|
| «Жодного невалідного блока ✅» | WP-01 did not run — nobody parsed the blocks with the editor's own parser |
| «theme.json ✅ парситься» | the file was read at the top level; WP-12 (the generated stylesheet) did not run |
| «404 ✅ кастомна сторінка теми» | a 404 was served — by the index template, because the theme ships no 404 template (WP-10, PAGE-02) |

### Before printing any ✅, name the evidence to yourself

One sentence, never written into the report: *what did I look at, and what did it
say?* If the honest answer is "the rendered page" for a row whose subject is not
the rendered page, the row is ⚠️.

### The report may not contradict itself

Two rows about the same object must agree. A run that writes «Privacy Policy ✅
існує, 200» in one table, and lists four existing pages without Privacy Policy
among them in another, has checked neither — it filled both from expectation.

**Before the report goes out, read the 🔴 and ⚠️ rows against the ✅ rows
once.** Any object named in both is a contradiction, and the ✅ is the one that is
wrong.

### A negative claim carries its count

«It is not defined anywhere», «nothing references it», «there is no such file»
— these are the easiest findings to write and the easiest to invent, because
nothing on the page contradicts them. One run reported a CSS variable used 41
times and defined nowhere. **The variable did not exist under that name at all**,
and every variable that the theme does use was defined.

**So a row that asserts an absence names what was searched and what came back:**
*«`grep -r` по теці теми: 12 використань, 16 оголошень, невизначених 0»*. The
number is the evidence; without it the sentence is a guess with a red dot beside
it.

**And a name is copied, never retyped from memory.** Half of that invented
finding was a mangled token: the theme's own prefix rewritten as WordPress's. If
a row quotes an identifier, that identifier is pasted from the file.

**❓ is a status, not a separate table.** A third font, a value that is uniform
across the site but questionable, a slider with autoplay the design does not
mention — these sit in the main table beside everything else, with the question in
the last column. Splitting them out is how they get lost.

## Order — down the page, never by check name

Header, hero, then each section in the order a visitor meets them, then the
footer, then what is site-wide. A report ordered by check name scatters four hero
problems across four places and nobody sees that the hero is the problem.

```
QA · stage 1 · Webflow · marketplace template · home.html
```

| | К-сть |
|---|---|
| 🔴 Провалено | 5 |
| 🟡 Не за дизайном | 3 |
| ❓ Запитати | 2 |
| 🔑 Потребує доступу | 2 |
| 🔁 Передано | 4 |
| ⊘ Не застосовно | 7 |
| ⚠️ Не вдалося | 2 |
| ✅ Пройдено | 31 |

### Хедер

| Перевірка | Статус | Що саме |
|---|---|---|
| Перевірити дропдауни в хедері | 🔴 | «All Pages» не відкривається; решта чотирьох працюють |
| Перевірити бургер 768→360 | ✅ | |
| Перевірити лого ліворуч, бургер праворуч | ✅ | |
| Перевірити відступ бургера від краю | 🟡 | 30px на 768 і 15px на 767 — той самий контрол, два значення |

### Хіро

| Перевірка | Статус | Що саме |
|---|---|---|
| Перевірити кнопки відповідно до стайлгайду | 🔴 | «Get in touch» 85px заввишки, решта сімнадцяти кнопок 61px |
| Перевірити анімацію появи | ⚠️ | rAF заморожений у панелі перегляду — 0 кадрів за 800мс. Перезапустити у справжній вкладці |
| Перевірити заголовок хіро на обрізання 768→360 | ✅ | |

### Послуги

| Перевірка | Статус | Що саме |
|---|---|---|
| Перевірити падінги секції | 🟡 | 56px зверху, у решти секцій 130px |
| Перевірити gap сітки | 🟡 | 14px, у сусідніх сітках 60px |
| Перевірити кнопки на посилання | 🔴 | «Explore services» без `href` — виглядає кнопкою, не веде нікуди |

### Футер

| Перевірка | Статус | Що саме |
|---|---|---|
| Перевірити кредит футера (FOOT-01) | 🔴 | у кредиті немає слова, якого вимагає `decisions.credit` — вузол видалено |
| Перевірити поля форми підписки | 🔴 | інпут не приймає текст: `pointer-events: none` |
| Перевірити посилання кредиту (FOOT-01) | 🔴 | 3 з 4 слів кредиту — лінки з правильними адресами; четверте — простий текст |

### Загальносайтове

| Перевірка | Статус | Що саме |
|---|---|---|
| Перевірити шрифти | ❓ | цитата відгуку набрана Georgia, решта сторінки Inter — міняти чи так задумано? |
| Перевірити цілі числа | 🟡 | абзац у «Featured news» 16.2px, решта абзаців 18px |
| Перевірити alt-тексти | 🟡 | 42 з 43 зображень мають `alt="Icon"` або `alt="Image"` |
| Перевірити горизонтальний скрол | ✅ | немає на жодному з семи тирів |

## Count every table — the antidote to quietly doing half of one

**A table is not a menu.** Every row in it is a check, and a run that does the
first two and moves on has not done the section — it has sampled it.

This is the failure mode that no amount of rule-writing prevents, because the
rules were already there: as a run gets long, the rows near the top of each table
get done and the ones further down get dropped, and the report shows only what was
done, so nothing looks missing.

**So every section reports its arithmetic.** The heading carries the count:

```
### Залишки збірки — 7 перевірок · виконано 7
### Уніфікація — 4 перевірки · виконано 3, одна ⚠️
```

Three rules follow from it, and they are what make the count honest:

- **A row you did not run is never absent from the report.** It appears with ⚠️ and
  the reason, or with ⊘ if it had no subject. Omission is the one thing that is
  never allowed, because it is indistinguishable from a pass.
- **"Виконано 2 з 7" is a legitimate report** when there is a reason for the five.
  "Виконано 2" with no denominator is not a report at all.
- **The denominator comes from the registry, not from what was measured.** At
  stages 1–3 it is the number of registry IDs in the group (`check-registry.md`);
  the manifest already accounts for every one of them.

A run that ends with any section's numerator below its denominator, and no ⚠️ or ⊘
row explaining the difference, is an unfinished run and says so in the closing
line.

## One finding closes an element, not a check

**A check is a question asked of every element it applies to.** Finding one
element that fails answers it for that element and for no other, and a run that
stops at the first hit has answered a different, easier question: *does this
defect exist anywhere?*

Two shapes this takes, both seen on real runs:

- **Stopping at the first instance.** A sweep for missing reveal animation found
  one element without its attribute, reported it, and moved on — while a heading
  further down the same page had also lost its animation. The row was true and
  the check was not done.
- **Answering half the question.** A hover sweep counted 95 of 100 clickable
  elements as having a hover and reported the five that do not. The other
  question — **do the 95 hovers change anything?** — was never asked, and one
  of them resolved to the same colour as its resting state. Coverage and effect
  are two checks, and the table has rows for both.

**So a row that names an element also names the population.** Not «`.top-bar`
has no reveal attribute» but «**of 31 elements that should reveal, 2 carry no
attribute**: `.top-bar`, `Card Title`». The denominator is what proves the
sweep ran; the list is what makes it fixable in one pass instead of three.

**And when a defect has a plausible cause, look for its siblings.** A hover that
was set up and left empty, a section whose padding was typed by hand, an
attribute lost in a copy — all of these come in groups, because whatever produced
one produced the rest. Finding one is the reason to go looking, not the reason to
stop.

## The two kinds of "not checked" are never mixed

**⊘ and ⚠️ look similar and mean opposite things**, so they get separate tables
with their own headings — never one list sorted by reason.

**⊘ Не застосовно** is a finished state. There is no search on the site, so the
nine search checks have no subject; registration does not exist, so fifty-two
checks have none. Nobody needs to come back to these. The count is there so the
reader can see the scope was considered, not so they can worry about it.

**⚠️ Не вдалося перевірити** is unfinished work, and it is the one that gets lost
when the two are mixed. The check applies to this page, it was attempted, and
something stopped it: a frozen frame loop, contrast that cannot be computed over
video, a missing admin session. **Every row says what would unblock it** — "run
`npm run browsers` and re-run qa-run", "a person logs in at /wp-admin", "route to
the QA machine with Edge" — and
the closing line of the report names the number: *"2 перевірки не вдалося
виконати"*. A run that ends with ⚠️ rows is not a finished run.

## After the table

Two short things, and nothing else:

- **the ❓ rows repeated with their options**, so they can be answered without
  scrolling back: *"Georgia на відгуках — [лишити / привести до Inter]"*;
- **one line offering the fix**: what would be done by default (🔴 first, then 🟡),
  and that ❓ and 🔑 are not touched until answered.

# Fixing

Nothing is touched during the check — the ⚡ quick fixes included. Afterwards the
designer names a scope, in their own words, and that is the only trigger.

| What they say | What it covers |
|---|---|
| «пофікси все» | everything that can be fixed — 🔴, then 🟡, then the ❓ once answered |
| «пофікси швидкі» / «пофікси дрібне» | the ⚡ rows only (closed list in «⚡ Швидкі фікси») |
| «пофікси червоні» / «поламане» | 🔴 only |
| «пофікси найважливіше» | 🔴 and everything marked HARD |
| «пофікси питання» | the ❓ rows — which means asking them first |
| «пофікси футер» / «хедер» / «форми» | that section or that group only |

A fix written to a platform (Webflow through its connection, WordPress) is shown
first as one permission line with the count — *«Запишу у Webflow-проєкт: 14 alt,
6 aria-label — підтвердити?»* — and waits for a yes.

## When the scope contains ❓ — ask them all at once

**Never fix a ❓ by guessing, and never ask them one at a time.** The moment the
scope includes questions — "пофікси все" and "пофікси питання" both do — put them
in the **options dialog**, four at a time, each with its choices, and wait.

The shape below is what each dialog entry says; it is not a message to type into
the chat.

```
Перед тим як фіксити — 4 питання:

1. Шрифт на відгуках
   `.testimonial-text` набрано Georgia, решта сторінки Inter.
   а) привести до Inter   б) лишити Georgia

2. Контраст у футері
   Дрібний текст 3.1:1 — нижче AA, але однаково на всьому сайті.
   а) підняти до 4.5:1   б) лишити як є

3. Автоплей слайдера
   Слайдер відгуків крутиться сам; у дизайні автоплею немає.
   а) вимкнути автоплей   б) лишити

4. Частота попапа
   Показується щовізиту.
   а) раз на сесію   б) щовізиту   в) раз на добу

Відповісти можна одним рядком: 1а 2б 3а 4а
```

Rules for each entry, all of them earned:

- **Options are short and concrete** — «привести до Inter», not "consider
  standardising the typography". They are answered in a second, not read.
- **Two options where there are two.** Do not manufacture a third to look
  thorough.
- **Mark the recommendation** where there is a clear one, and say why in half a
  line — but never decide for them.
- **Four per dialog, answered in one pass.** More than four wait for a second
  dialog rather than making the first unreadable.
- **Options, never open questions.** "What would you like to do about the fonts?"
  costs the designer a paragraph; two options to click cost one click.

If the answer to one is "I do not know" or it is left out, that row is not fixed —
it goes back in the report as still open, and the rest proceeds.

## Then fix, in this order

1. **🔴 first**, and inside 🔴 the HARD rows before the rest.
2. **🟡 next**, only within the named scope.
3. **The answered ❓**, as answered.
4. **🔑 rows are never fixed** — they are missing inputs, not defects. List them
   again at the end.

**Re-check what the fix touched** with the same instrument, as a separate partial
run in its own folder — `node "$S/qa-run.cjs" --pages <changed pages> --out
qa-out-recheck`, then `manifest.cjs --out qa-out-recheck`. Its manifest is attached
as «перевірка фіксу»; it never replaces the full one, and the next full run
re-measures everything anyway.

**Then a short closing table**: what was fixed, what was re-checked and now
passes, what was deliberately not touched and why. Same three columns as the
report, so it reads the same way.

**MED and LOW are not fixed by "пофікси все" unless they are named.** Dozens of
small edits are where a run starts breaking what already worked — list them and
let the designer pick.

# Reports — the two files that outlive the run

→ **Повний розділ: `references/reports.md`** — режим 4 (handoff для QA: інтерв'ю, потім файл) і
режим 5 (репорт допущених багів). Читати лише в цих режимах. Обидва файли будуються з
`qa-out/manifest.json`, `qa-target.json → decisions` і `.qa-state.json`, ніколи з пам'яті.

# Reminders

- The page is final only after this check has run **and** its questions are
  resolved — then `seo-check`, where that skill is installed (it is a separate skill;
  qa-check never depends on it).
- Re-run after any later edit, and always again after caching or image
  optimisation is enabled.
- This skill (its tables and `scripts/registry.cjs`) is the source of truth. A rule
  changes only with a new skill version — never because a different guide file was
  found on the machine.
- Before a human QA starts: **4 — the handoff**. When QA returns the file: **2 —
  their bugs first**. At the end of every project: **5 — the bugs-made report**.
