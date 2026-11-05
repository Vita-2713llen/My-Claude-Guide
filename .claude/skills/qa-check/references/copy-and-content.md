<!-- qa-check reference · копія проти джерела, вичитка, сторінки, які проєкт винен · вантажити за потреби, правила тут рівно ті самі -->

## 15. The copy — against its source, then on its own

Two different jobs that look alike, and the first governs the second.

### Where the copy came from — ask once, in the opening line

Instrument: **COPY-01** compares the page with the file named in
`qa-target.json → sources.copy` (`.md` / `.txt` / `.html`). No file → COPY-01 is NOT RUN
with that route; copy given in the chat is saved by the agent into a `.md` file and
named there, so the comparison is the same on every run.

**"Чи є файл із текстом від клієнта?"** It costs a second and it decides which of
three routes runs. Do not assume, and do not skip the question because no file is
visible in the folder.

**1 — a file exists.** Diff it against the rendered page. This is the only route
that catches what nobody notices: a **dropped paragraph or list item**, a
**sentence truncated** by a field limit during copy-paste, a **placeholder left
behind**, a **heading someone rewrote** to fit the line, and quotes, dashes or
non-breaking spaces mangled on the way in.

**2 — no file, but the copy was given in the conversation.** *The conversation is
the source.* If it was said anywhere above — "на хіро має бути такий заголовок",
"в цій секції ось цей текст" — take it and compare, quoting what was said:
*"ви казали «Better results for every client», на сторінці «Better results for
clients»"*. Copy stated in chat is real copy; treating it as non-existent because
it is not a file is how it gets silently lost.

**3 — nothing at all.** Say so — COPY-01 routed with the note «доступ: тексту
клієнта немає», a 🔑 row in the report — and never report the check as passed. Then run the substitute below,
which finds most of what the diff would have found anyway.

### Signs of unfinished content — runs when there is no source

Looks inside the page instead of comparing it to anything:

| Перевірка | P | Stage |
|---|---|---|
| Плейсхолдери: Lorem, «Your text here», «Heading», «Card title», «Add your text», сирі токени `{{…}}` (TEXT-05) | HARD | 1 |
| **Той самий текст двічі в різних місцях** — заголовок, підзаголовок, опис картки. Майже завжди означає, що другий блок не заповнили (COPY-02) | HIGH | 1 |
| Обірвані речення: закінчується комою, прийменником, без крапки, посеред слова (COPY-03) | HIGH | 1 |
| Та сама річ названа по-різному в двох місцях — продукт, послуга, відділ, кнопка (TEXT-06) | MED | 1 |
| Очевидно неправильні числа й дати: рік копірайту в минулому, «since 20», ціна 0 (COPY-04) | HIGH | both |
| Порожній стан там, де мав бути контент: картка без тексту, секція з одним заголовком (COPY-07) | HIGH | both |

### ⛔ Spelling — every word is checked, every mistake is reported — HARD, both stages

This is the designer's rule, and it is strict. **The site never ships with a
spelling mistake.** The run reports every one with its source; the fix follows the
designer's approval like every other row. Spelling is not a MED proofreading note.

**What is read** is every word a visitor, a screen reader or a search engine gets:
- the visible text of every page and CMS template, and of every CMS item
  (drafts included);
- component props, the 404, 401 and password pages, the legal pages and the style
  guide;
- `alt`, `title`, `aria-label`, sr-only text and `placeholder`;
- button, link and form labels, and form success and error messages;
- `<title>`, the meta description, Open Graph and Twitter fields, and JSON-LD strings;
- the built HTML at stage 1, and the published pages plus the CMS API at stage 2.

**How:** mechanically, never by eye — `spell.cjs` (TEXT-02, TEXT-08), the same pinned
cspell on every OS, on the text `qa-run` collected into `qa-out/texts.json`. English
follows `decisions.englishVariant` (en-US or en-GB); every other page language follows
its `<html lang>` and needs its dictionary installed, otherwise that language is NOT
RUN with a route. Every flagged word comes with its context and where it comes from;
go through the list in context.

| Перевірка | P | Stage |
|---|---|---|
| Жодної орфографічної помилки в усіх джерелах тексту вище (TEXT-02) | HARD | both |
| Один варіант англійської на весь сайт — US або UK (center/centre, organization/organisation), не впереміш (TEXT-03, `decisions.englishVariant`) | HIGH | both |
| **Граматика читається, а не лише спелчекається (practice rule, 2026-09-16).** Спелчекер не бачить узгодження: «we look not only for a strong technical skills» пройшов спелчекер і дійшов до QA. Кожне речення з усіх джерел тексту вище (CMS і клієнтське копі теж) прочитати на: `a/an` + множина, підмет ↔ присудок, подвоєні й пропущені слова, «not only … but (also)». Кандидатів дає TEXT-08 (`grammar-candidates.json`: артикль + множина, подвоєне слово, пробіл перед комою, подвійний пробіл, `...`, змішані лапки) — кожен прочитати в контексті. Помилка в клієнтському копі — ❓ (виправити на сайті й попросити клієнта оновити файл) | HARD | both |
| Мова сайту англійська, як вимагає гайд — не змішана (TEXT-03, I18N-01) | HIGH | 1 |

**Every real mistake becomes one report row naming every place the word lives** —
the Designer text element, the CMS field of each affected item, the component prop,
the asset alt, the page SEO settings, the same word in the build HTML — with
«було → має бути», marked ⚡. After approval it is fixed in all of them (so the two
never drift apart), published, re-fetched and re-spellchecked: the count must be
zero, and the closing table lists every correction.
- **A flagged word that is not a mistake is verified, not "fixed".** That covers a
  brand, a surname, an acronym or an industry term (a product name, a company name,
  a regulation's name). Confirm it against the client's material or an authoritative
  source, then add it to `qa-target.json → dictionary` so later runs, and colleagues,
  never flag it again. Never "correct" it into a dictionary word.
- **Lorem ipsum is not a spelling result.** It is a placeholder finding and goes in
  the table above.
- **A mistake in the client's own source copy is a ❓** — *«виправити на сайті й
  попросити клієнта оновити файл / лишити як у джерелі»* (see the next rule). A word
  that merely *looks* wrong and may be deliberate, such as a stylised product name,
  is a ❓ too.

### And the rule that ties the two together

**Where a source exists, it outranks the proofread.** A spelling mistake that is
*in the client's own copy* is not our mistake: show it as a question — *"у
наданому тексті стоїть саме так — виправляти?"* — and never quietly correct it.
Correcting it puts the site out of step with what the client approved, and the
next comparison reports a difference nobody made on purpose.

So the order is: diff against the source first, proofread what is left, and
anything the proofread finds that **matches** the source becomes a question rather
than a defect.

## 16. Content, and the pages a project owes

### The pages

| Перевірка | P | Stage |
|---|---|---|
| **Privacy Policy** на клієнтському сайті: сторінка існує, злінкована з футера, відкривається, і в ній справжній текст — не чернетка WordPress і не заготовка (PAGE-01) | HARD | both |
| **Licensing** на темплейті замість неї — за правилом кредиту компанії (`decisions.credit`, `decisions.legalPath`) (PAGE-01) | HARD | both |
| Сторінка 404 існує, оформлена, з хедером, футером і шляхом далі — перевірена на неіснуючій адресі (PAGE-02) | HARD | both |
| Контактна форма живе у футері або шаблоні сторінки, а не вставлена окремо на кожну (FORM-16) | HIGH | 1 |
| На сторінці Contact Us форма видима без прокрутки, або в банері є якір, який до неї веде (FORM-16) | HIGH | 1 |

### The content itself

| Перевірка | P | Stage |
|---|---|---|
| Прихованих посилань немає — нічого злінкованого з невидимого, нульового або винесеного за екран тексту (LINK-12) | HARD | both |
| На сторінках блогу в рядку «поділитися» немає Instagram — туди пости не публікуються. У футері соцмережі це не зачіпає | MED | both |
| На мобільному кнопка «All blog posts» стоїть під третім постом, не над ними | MED | 1 |
| Один формат дат на весь сайт; якщо дизайнер назвав формат — він записаний у `decisions.dateFormat` (список форматів — `references/instruments.md`, напр. `MMMM D, YYYY` = January 29, 2026) (TEXT-07) | MED | both |
| Адмінська пошта — робоча адреса відповідального, ніколи особиста скринька й ніколи пошта виконавця (WP-08 на WordPress) | HIGH | 2 |
| **Однакові дані в картках різних сутностей — це плейсхолдер (practice rule, 2026-09-16).** У повторюваних картках (кейси, послуги, команда, вакансії) звести кожне число, відсоток, дату, метрику між картками: однакове значення у двох і більше картках різних айтемів — знахідка, навіть коли білд = сайт (COPY-05). Перевірити, чи значення взагалі йде з поля CMS; захардкоджена метрика в CMS-картці — HIGH + ❓ дизайнеру/PM, звідки реальні цифри. Урок одного прогону: однакова метрика у відсотках на трьох різних кейсах — знайшов QA | HIGH | both |

### «Meaningful content» — the mechanical part of it

The sheet asks whether the copy "clears the sense of the target page". That is a
judgement, and most of it belongs to a person. **Three parts of it are mechanical
and are checked; the rest becomes a question, not a verdict.**

| Перевірка | P | Stage |
|---|---|---|
| H1 і вступ описують **цю** сторінку, а не будь-яку — заголовок не збігається дослівно з назвою іншої сторінки сайту (COPY-06) | HIGH | 1 |
| H1 не скопійований з іншої сторінки; на сторінках однакового типу заголовки відрізняються (COPY-06) | HIGH | 1 |
| Назва сторінки в меню, її H1 і `<title>` говорять про одне й те саме (TEXT-06: інша форма слова — 🔴, жодного спільного слова — ❓) | MED | 1 |

Anything beyond that — whether the wording is persuasive, whether the section
earns its place — goes to **❓ Запитати** with the page named, never reported as a
defect.

### Password-protected pages

**Only where a page is password-protected.** Two things, and the second is the one
that ships broken:

| Перевірка | P | Stage |
|---|---|---|
| Захист справді працює: вийти з акаунта, відкрити приватне вікно, переконатись, що сторінка просить пароль; що правильний пароль пускає, перевіряє **людина** — агент паролі не вводить (FEAT-07) | HARD | 2 |
| Форма введення пароля застилізована під сайт — не гола дефолтна форма WordPress (FEAT-07, скріншот) | HIGH | 2 |

The default form is unstyled, sits alone on a white page and looks like a broken
site. It is the first thing the client sees when they check the protection, and
nobody looks at it twice while building.

### Not yet decided

**"All the text is ready to be translated"** — the intent has not been settled, so
this row is not checked and not reported as passed. Ask what it should mean before
running it: text baked into images, strings extracted properly (`__()` with a text
domain in WordPress, editable elements rather than embeds in Webflow), or a
multilingual plugin being configured.
