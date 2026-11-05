<!-- qa-check reference · handoff для QA (режим 4) і репорт допущених багів (режим 5) · вантажити за потреби, правила тут рівно ті самі -->

# Reports — the two files that outlive the run

The check report lives in the chat and is finished when its rows are. Two more
documents are written as **files**, because other people read them after the
chat is closed: the human QA tester, and the designer and developer of the next
project. **Neither measures anything.** Both are built from the last full run's
`qa-out/manifest.json` (statuses and evidence), `qa-target.json → decisions`, and
`.qa-state.json` (answers, causes, origins, fixes) — and both are only as true as
the rows behind them.

**Where:** beside `.qa-state.json`, as Markdown with tables —
`qa-handoff-2026-09-14.md` and `qa-bugs-2026-09-14.md`. A second report on the
same day takes a `-2` suffix; nothing is overwritten. After writing, hand the file
to the person — with the harness's file-sharing tool if there is one, otherwise by
printing its absolute path in the chat — and add it to `reports` in the state, with
the manifest it was built from.

**Language:** Ukrainian, like the chat report. URLs, class names and site copy
stay as they are.

## 4 — the QA handoff: interview first, then the file

**The point.** The skill proved a great deal by instrument, and it also left what
only a person can do or decide. A tester who receives nothing repeats the first
half and files the decisions as bugs. A tester who receives this file starts where
the skill stopped. The same file goes with every later QA round, so nobody asks
the designer the same question twice.

### When it may be written

- **The file describes the site that is live.** Run
  `node <skill>/scripts/snapshot.cjs --out qa-out-check --no-baseline` first (it
  compares without moving the baseline) and ask «чи був деплой теми чи плагінів
  після прогону?» — RUN-01 does not see a PHP or plugin change that alters no page.
  If either says yes, offer **2 — задеплоєний ще раз** first and the handoff after
  it: a handoff about yesterday's site sends the tester to test the wrong thing.
- **The manifest is finished.** Not while it has ⚠️ not-run rows: close them or route
  them (`record.cjs --status routed`) first, then rebuild the manifest. A partial
  run's manifest (`--pages`, `--engines`, `--widths`, `--quick`) never feeds a handoff.
- **Open 🔴 are never hidden.** If any remain, ask in the dialog: *«спершу
  пофіксити (рекомендовано) / передати QA як відомі баги»*. Handed over, they go
  into the known-bugs table, never into «перевірено».

### Step 0 — the handoff is built from the manifest, never from memory (practice rule, 2026-10-06)

Two handoffs written from the same skill must agree on the same site. So the handoff file is
assembled from `qa-out/manifest.json` of the last full run, not from what the agent remembers —
**by the instrument**, from the project folder:

```
node "$S/handoff.cjs" --out qa-out --project "<назва проєкту з брифа>"
```

It writes `qa-handoff-<дата>.md` beside `qa-target.json` (a second one that day gets `-2`) with the
header and sections 2, 3, 4 and 5 filled from the manifest, the registry, `qa-target.json →
decisions` and the answered rows of `.qa-state.json`, in registry order. It refuses (exit 3) while
the manifest has ⚠️ not-run rows or comes from a partial run. The agent then fills **only** section 1
(scope), section 6 (interview) and the `{…}` placeholders from the interview below, and adds
interview decisions to section 4. Sections 2, 3 and 5 are never edited by hand — a correction goes
through `record.cjs` and a rebuilt manifest, then `handoff.cjs` again. The sources it uses:

| Handoff section | Source |
|---|---|
| 2. Already verified | every ✅ row of the manifest, with its evidence line |
| 3. Checklist | every 🔁 `routed` row (with its owner), every `person` / `route` row not closed yet (`references/instruments.md` → «Рядки, які закриває лише людина»), the real-iPhone rows IOS-01…07 below |
| 4. Designer decisions | `qa-target.json → decisions` + `.qa-state.json` answered rows |
| 5. Known bugs | every 🔴 / 🟡 row (`fail`), **one bug per finding group**, each tagged with its check ID (e.g. `LAY-02`); 🟡 tagged «не за дизайном» |
| 5. Open questions | every ❓ row |

**Every bug in the handoff carries its check ID.** Then two handoffs (or a handoff and a QA
return) can be compared line by line. Any difference is either a site change (RUN-01 says so),
or a check one run did not execute, and the manifest shows which.

### Step 1 — collect, without measuring

| Що | Звідки |
|---|---|
| Відкриті ❓ | рядки манифесту `ask` без `answered` у стані |
| 🔑 — чого бракує і від кого | рядки `routed` з нотаткою «доступ: …» |
| 🔁 — хто закриває | решта `routed` рядків, з виконавцем |
| Поза досяжністю skill | §23 SKIP і рядки `person`: справжній iPhone (IOS-01…07), тестова відправка (FORM-14), доставка листів, редагованість (EDIT-01/02), живий VoiceOver (IOS-07) |
| Рішення дизайнера | `qa-target.json → decisions` і кожен `answered` / `accepted` / `accepted-limitation` у стані — з датою |
| Поведінка, яку тестувальник сприйме за баг | працює не так, як «зазвичай», але задумано: панель меню лишається відкритою після ресайзу, затримка появи першого екрана, чернеткові правові сторінки віддають 404, сторінка пароля (401) з повним хедером і футером. **Перед записом пройти кожну службову сторінку (401, 404, пароль, success форми) і кожну «незвичну» поведінку й звірити з дизайном; кожну задуману записати в розділ 4** — реальний випадок: сторінка 401 з хедером і футером не була записана й прийшла від QA як High (2026-09-16) |
| Що доведено інструментами | ✅ рядки останнього повного прогону, з інструментом і датою |

### Step 2 — the interview

**Every item without a decision becomes a question in the options dialog** — four
at a time, recommended option first, the same rules as everywhere in this skill.
Nothing already answered in the state is asked again; it goes straight into the
decisions table with its date.

Ask in this order, because the first answers change what the later ones mean:

1. **Обсяг для QA** — which domain is tested (staging / production); browsers and
   devices (multi-select: Safari macOS · Safari iOS · Chrome Android · Firefox ·
   Edge); whether a real test submission is allowed, and to which address.
2. **Відкриті ❓** — one question each, with the options the report already gave.
3. **Задумана поведінка** — *«Панель меню лишається відкритою після повороту
   планшета: так задумано / це баг»*, one per behaviour without a recorded decision.
4. **🔑 і ⚠️** — who closes each and whether QA covers it: *«QA перевіряє вручну /
   чекаємо клієнта / поза обсягом»*.

«Не знаю» is recorded as said, and the item goes into the file as an open
question for the tester to raise — never guessed into a decision.

### Step 3 — the file

```
# QA handoff · {Project} · {date}
Сайт: {URL} · {платформа} · {тип проєкту} · опубліковано: {lastPublished}
Останній прогін qa-check: стадія {n}, {дата, час} · еталон: {reference}
```

**1. Обсяг тестування**

| Що | Значення |
|---|---|
| Домен | … |
| Сторінки | кожен URL, включно з CMS-записами, 404 і сторінкою пароля |
| Ширини | 1920 · 1440 · 1280 · 992 · 768 · 568 · 360 |
| Браузери й пристрої | з інтерв'ю |
| Поза обсягом | чернетки, стайлгайд — з причиною |

**2. Уже перевірено інструментами — не повторювати.** One row per group. A row
whose evidence is older than the live site does not belong here; it goes to 3.

| Група | Що доведено | Чим | Коли |
|---|---|---|---|
| Посилання | 22/22 адреси 200, 0 порожніх | рендер-обхід 20 сторінок × 1440/360 | 11.09 18:30 |

**3. Чекліст для тестувальника** — what only a person can do.

| # | Що перевірити | Як | Очікувано | Результат QA | Коментар |
|---|---|---|---|---|---|
| 1 | Форма Contact відправляється | заповнити валідно, відправити | стан success; лист на … | | |

**Справжній iPhone — обов'язкові рядки чекліста, завжди** (practice rule, 2026-09-14; симулятор
цього не замінює). Модель і версія iOS записуються в колонку «Коментар». Підключення: кабель,
на iPhone Налаштування → Safari → Додатково → Web Inspector, на Mac Safari → Develop → [iPhone].

| # | Що перевірити | Як | Очікувано |
|---|---|---|---|
| IOS-01 | Скрол під відкритим меню | відкрити бургер, свайпнути по панелі, по краю екрана і до кінця довгої панелі | сторінка за меню стоїть на місці, прокрутка не переходить на сторінку |
| IOS-02 | Липкий ховер | тапнути кнопку, картку, рядок FAQ, повернутися назад | жодна не лишилась зсунутою чи підсвіченою |
| IOS-03 | Панель адреси Safari | скрол вниз і вгору на кожній сторінці | хедер не стрибає, перший екран і кнопки не під панеллю |
| IOS-04 | Форма | тап у кожне поле, `select`, капчу, якщо є; відправка лише з дозволу | без зуму, клавіатура не перекриває поле, тип клавіатури відповідає полю, пікер працює |
| IOS-05 | Landscape | найширший доступний iPhone: головна і сторінка з формою | нічого під вирізом (safe-area), немає горизонтального скролу |
| IOS-06 | Швидкість і анімації | перше відкриття сторінки на мобільному інтернеті, свайп вниз і назад | перший екран з'являється плавно, нічого не лишилось невидимим чи не блимнуло |
| IOS-07 | VoiceOver | головна і сторінка з формою: увімкнути VoiceOver, пройти хедер, відкрити меню, пройти панель, закрити | навігація оголошується з назвою, кнопка меню — зі станом, фокус переходить у панель і повертається на кнопку після закриття |

Результат кожного рядка записується `record.cjs --id IOS-0x --status pass|fail --note "модель, iOS, …"`,
щоб наступний handoff не пропонував його знову.

**4. Рішення дизайнера — це не баги**

| Поведінка чи значення | Рішення | Дата |
|---|---|---|
| Перший екран з'являється з анімацією, LCP на мобільному 3.6–5.6 s | лишити анімацію | 11.09 |

**5. Відкриті питання та відомі баги**

| Пункт | Стан | Хто закриває |
|---|---|---|

**6. Інтерв'ю** — every question as it was asked, and the answer as it was given.

| Питання | Відповідь | Нотатка |
|---|---|---|

**7. Баги, знайдені QA** — empty, for the tester.

| # | URL | Ширина / браузер | Кроки | Очікувано | Фактично | Скрін | Пріоритет | Статус |
|---|---|---|---|---|---|---|---|---|

### Step 4 — when the file comes back

**A returned handoff is the first input of the next run.** At the start of any
run, look for `qa-handoff-*.md` beside the state. If its section 7 has rows the
state does not know yet:

- import each as a finding — `record.cjs --id <closest registry ID> --status fail
  --where … --why …` with the tester's steps, and `found_by: qa` in the state;
- **re-run those first**, with the same instruments as any other finding, and
  report each as confirmed, not reproduced, or «рішення дизайнера» when it matches
  section 4 — answered from the file, not asked again;
- carry the tester's «Результат QA» from section 3 into the run with `record.cjs`
  (the row's ID, `pass` / `fail` with the note), so a check a person passed is not
  offered again as ⚠️.

## 5 — the bugs-made report: feedback, so they are not made again

**Not «what is broken now» but «what we got wrong, why, and which rule prevents it
next time».** It is written for the designer and the developer of the next
project. A bug with a cause and no rule is half an entry.

### Sources — every entry has evidence

- every state row that was ever `fail`, `fixed`, `accepted-limitation` or imported
  from QA, with its `cause`, `origin`, `stage` and `fixed`;
- fixes made outside qa-check that the project log or the conversation records —
  quoted, with where it was read;
- **the check's own mistakes**: findings the designer rejected as wrong, and
  defects the skill missed that a person found. They are lessons for the
  instrument and get their own section.

**Never invent a cause.** If neither the state nor the log says why something
happened, the entry says *«причину не встановлено»*. A plausible cause written as
fact teaches the wrong rule.

**A confirmed design decision is not a bug.** It enters this report only if it
caused real rework — a value changed twice, a question asked five times — and then
as a process lesson, not as blame on the design.

### Classify every bug

| Походження | Що сюди | Приклад |
|---|---|---|
| Дизайн | рішення в макеті чи стайлгайді, що дало дефект | у макеті немає станів success / error; контраст закладено нижче AA |
| Верстка | HTML / CSS / JS білду | дробові пікселі від `calc()`; ховер без transition |
| Перенос | що платформа втратила чи додала | Webflow публікує `label for=""`; лінк на `#`; GSAP вантажиться без інтеракцій |
| Контент | копі, факти, поля CMS | PLACEHOLDER у записах; рік заснування 2017 проти 2018 |
| Процес | публікація, паралельні сесії, залишки | зайві копії CSS / JS; правка чекає публікації |
| Перевірка | помилка чи пропуск самого qa-check | навмисні атрибути звітовано як дефект |

### The file

```
# Bugs made · {Project} · {date}
Джерела: .qa-state.json ({n} прогонів) · QA handoff від {дата} · журнал проєкту
```

**1. Підсумок**

| Походження | Багів | Бачив відвідувач | Спіймано на білді | Після деплою | Знайшов QA |
|---|---|---|---|---|---|

Under it, **the three patterns that repeated most**, one line each with the count.
Bugs come in groups, and the group is the lesson.

**2. Усі баги**

| # | Що сталося | Де | Причина | Бачив відвідувач | Як виявили | Коли | Кіл виправлення | Правило на майбутнє |
|---|---|---|---|---|---|---|---|---|

«Кіл виправлення» makes the cost visible. «Правило на майбутнє» is concrete and
checkable — *«у макеті кожна форма має три стани: звичайний, success, error»* —
never *«бути уважнішим»*.

**3. Фідбек на дизайн** — a short checklist for the next design, from rows with
origin `design` and `content` only.

**4. Фідбек на верстку й перенос** — the same, from `build` and `port`.

**5. Процес** — from `process`.

**6. Що змінити в інструментах** — from `check`: each proposed rule for this skill
(a new or changed registry ID with its table row) or for the project's own files
(style guide, `qa-target.json → decisions`), with the entry that earned it.

### After the file

Section 6 is a proposal, not an edit. Ask in the options dialog which rules to
adopt — multi-select, one option per rule — and write only those into the skill or
the project's files. A rule written into the skill is generic: no project, client
or person name, only the lesson. The same «find → report → wait → fix what was approved» as everything
else.
