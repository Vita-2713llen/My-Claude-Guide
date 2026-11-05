<!-- qa-check reference · чистота передачі, невикористане, редагованість · вантажити за потреби, правила тут рівно ті самі -->

## 18. Handover cleanliness — mostly stage 2, but the "unused" sweep starts at stage 1

None of this is visible on the page, and all of it is the first thing the client
sees when they log in. It takes ten minutes and it is checked every time.

### On stage 2 the build is part of the site

**A deployed site has two surfaces, and only one of them renders.** The pages, the
options and the admin screens are the first. The second is the theme on disk —
`style.css`, `theme.json`, `functions.php`, `templates/`, `parts/`, `patterns/`,
`assets/` — and nothing in it announces itself in a browser.

A run that reads only the rendered site cannot see: a dead CSS block, a pattern
file nothing inserts, a debug line firing on every request, a font family declared
and never used, a template that does not exist. Every one of those is a handover
defect, and every one is invisible to the sweep that finds the rest of this
section.

**So stage 2 opens the theme folder and reads it, the same way stage 1 reads the
HTML.** The rows below that name a file mean that file, not its effect on a page.
If the theme folder is not reachable — a remote host, no filesystem access —
those rows go to ⚠️ with that reason. They never go to ✅.

**And the leftovers are not only whole files.** A file nothing references is the
easy half, and it is the half that gets found. The other half lives **inside**
files that are entirely in use:

- a CSS rule block whose selector matches nothing on any page;
- a custom property defined and never read — and one read and never defined,
  which is the same sweep run the other way;
- a registered block style, image size, or menu location nothing uses;
- a PHP function nobody calls, an `add_action` on a hook that never fires;
- a commented-out block kept "just in case".

**Run the unused sweep in both directions.** Defined-and-never-used is dead
weight. Used-and-never-defined is a value that silently resolves to nothing, and
it is the more expensive of the two because the page still renders.

### WordPress

| Перевірка | P |
|---|---|
| **Дефолтний контент видалений**: «Hello world!», sample page, чернетка privacy, «Uncategorized», випадкові теги, стокові теми, Akismet і Hello Dolly (WP-02) | HIGH |
| **Залишки збірки видалені**: покинуті варіанти хедера й футера, патерни, яких не вставляє жодна сторінка, склоновані форми, тестові сторінки (WP-02, DONOR-02) | HIGH |
| **Тем лишається дві: проєктна і один останній стоковий Twenty-Something** (наприклад Twenty Twenty-Five) — як запасна, якщо проєктна впаде. Усі інші стокові й будь-яка попередня кастомна **видалені, а не деактивовані** (WP-04) | HIGH |
| **Типи записів і таксономії, які нічого не використовує, зняті з реєстрації** — CPT під вирізану секцію лишає порожній пункт меню в адмінці назавжди (CMS-02) | HIGH |
| **Синхронізовані патерни й `wp_block`, яких не вставляє жодна сторінка, видалені**; зареєстровані стилі блоків, які ніде не вживані, теж | MED |
| **Медіатека: жодного файлу, який ніде не поставлений.** Пройти список і звірити з використанням — не за назвами, а за вставками (WP-05) | HIGH |
| **Невикористані CSS-класи й стилі блоків**, визначені в темі й не вжиті на жодній сторінці | MED |
| Меню, віджети й сайдбари без місця призначення видалені | MED |
| Тема названа проєктом, автор теми — той, що записаний у `qa-target.json → decisions.themeAuthor` (без запису — ❓), точно в тому написанні; є `screenshot.png` (WP-04) | HIGH |
| Слаг теми, текст-домен і префікс класів беруть назву проєкту, а не назву виконавця чи шаблону, з якого тему зроблено | MED |
| Template parts названі `Header`, `Footer`; патерни — тим, чим вони є; форми — тим, де вони стоять (WP-07) | HIGH |
| Плагіни й сам WordPress на актуальних версіях (WP-03) | HIGH |
| Медіа віддається в next-gen форматі — налаштування увімкнене й реально працює (IMG-04, WP-03) | HIGH |
| Коментарі вимкнені глобально, якщо блогу немає (WP-09) | HARD |
| «Discourage search engines» знято (SEO-06) | HARD |
| Адмінська пошта — робоча адреса PM (WP-08) | HIGH |
| **Жодного відлагочного коду в темі**: `console.log`, `error_log`, `var_dump`, `print_r`, `TODO`, `FIXME`, `XXX`. Грепнути по всій папці теми — це одна команда. `error_log` у `functions.php` пише рядок у лог **на кожен запит** і не видний ніде, крім лога (STRUCT-04) | HIGH |
| **Жодного великого закоментованого блоку** — стара версія, залишена «на всяк випадок». Клієнту він нічого не говорить, а наступному розробникові коштує півгодини | MED |
| **Усі шрифтові сімейства, оголошені в `theme.json`, стоять хоч десь.** Порахувати `settings.typography.fontFamilies` і звірити з тим, що реально резолвиться на сторінках. Зайве сімейство — це шрифт, який браузер тягне нізащо (FONT-02) | HIGH |

**Two exceptions when walking the leftovers, so nothing useful is thrown away:** a
pattern kept deliberately as a starting point for the client, and an alternate
header used by a template rather than by a page — a sweep that only walks pages
will not see the second. Both are named when kept.

### Webflow

The same job, different objects. **Not all of it waits for the deployed site** —
the export and the published HTML already hold the stylesheet and the asset
references, so the "unused" sweep starts at stage 1 and finishes at stage 2.

| Перевірка | P | Stage |
|---|---|---|
| **Невикористані класи**: визначені в стилях і не стоять на жодному елементі. Це найбільша купа сміття в типовому проєкті, і вона повністю видна зі стайлшита (WF-10) | HIGH | both |
| Комбо-класи, зроблені випадково й ужиті один раз | MED | both |
| Класи не мають слідів чернетки: `div-block-27`, `section-copy`, `untitled` (WF-10, STRUCT-02) | HIGH | both |
| **Невикористані ассети** — звірені і з опублікованими сторінками, **і з даними CMS**: поля колекцій посилаються на файли, яких немає в жодному вихідному коді. **Шрифти іконок сюди не входять**: Font Awesome і подібні тримають навмисно, і на них посилаються змінні та класи іконок, а не текст. **Перед видаленням** звірити кожен файл з: опублікованим HTML усіх сторінок і CMS-записів, деревами елементів чернеток, background-image у стилях, hosted CSS/JS, head/footer-кодом сайту й сторінок, полями CMS, фавіконом/OG; видаляти лише файли з нулем входжень, і назвати список у звіті (WF-05) | HIGH | both |
| **Осиротілі компоненти й символи**, які нікуди не вставлені | MED | 2 |
| **Невикористані анімації в панелі Interactions** — створені, названі й ніде не застосовані | MED | 2 |
| **Інтеракції, що ні на що не вішаються** — ні на сторінці, ні на елементі, ні як тригер сайту | MED | 2 |
| **Порожні або невикористані CMS-колекції й поля** (CMS-02, DONOR-02) | HIGH | 2 |
| **Невикористані сторінки**, у тому числі чернетки й дублі на кшталт `home-copy` (DONOR-02, SEO-12) | HIGH | 2 |
| **Обов'язкові сторінки, на які навмисно ніщо не веде, — не orphan.** На темплейті це `404`, `401`, **Licensing** і **Changelog**: вони мають існувати за вимогами маркетплейсу, і те, що на них немає посилань, є нормою, а не знахідкою. Знахідка — якщо якоїсь із них **немає** (SEO-12, `decisions.orphanAllowed`) | HIGH | 2 |
| **Мета-заголовок і опис заповнені на кожній сторінці**, у Page Settings (SEO-01, SEO-02) | HARD | both |
| **На темплейті формулювання «… Webflow HTML website template» у заголовку головної — правильне, а не залишок.** Саме так темплейт шукають на маркетплейсі. Знахідка тут протилежна: заголовок, який **не** називає його темплейтом, або заголовок від **іншого** темплейта. **На клієнтському сайті** те саме формулювання — залишок і дефект (SEO-01) | HIGH | both |
| **Поля форм у стані за замовчуванням**: порожні, без тестових значень, без лишених `value`; форма показана у звичайному стані, а не в Success чи Error, у якому її лишили в Designer (FORM-13) | HIGH | both |

**Why "unused" deserves the space it takes.** Everything on that list travels into
the buyer's cloned project or the client's site: a class panel with three hundred
dead entries, an asset bucket with images nobody placed, interactions that fire on
nothing. None of it is visible on the page, so nothing else in this file would
ever mention it — and the person who inherits the project is the one who pays for
it.

**Hidden elements are deliberately not on this list.** An element with
`display: none` is as likely to be the mobile variant of something as it is to be
a leftover, and the same goes for an empty wrapper — the guide allows decorative
empty divs. There is no reliable way to tell them apart, so flagging them would
report every responsive variant on the site as rubbish.

### Custom code on a marketplace template

**GSAP is allowed; everything else is not.** The one permitted exception is GSAP
and its official plugins — ScrollTrigger, SplitText — driving the design's
animations. Webflow's own IX2 is native and is not custom code at all.

| Перевірка | P |
|---|---|
| Кожен скрипт і ембед на темплейті — це GSAP або його офіційний плагін. Усе інше — знахідка, поіменно (TPL-01) | HARD |
| Сторонніх бібліотек немає: валідація форм, слайдери, лайтбокси, завантажувачі шрифтів, віджети (TPL-01) | HARD |
| Аналітики й трекінгу немає — на темплейті вони належать покупцеві, не нам (TRACK-01) | HARD |
| GSAP-блок робить тільки анімацію: не вішає форму, не шле подій, не тягне даних (TPL-01) | HIGH |

**Name the scripts, do not count them.** "Template ships custom code" is useless;
"GSAP and ScrollTrigger — allowed; `validation-worker/review.js` — not" is a
defect with one thing to delete. The test run reported both as a single violation
and the allowed half made the whole row look wrong.

On a **client site** none of this applies: custom code is permitted there, and it
is checked only for being declared in the summary.

### Analytics and consent — both platforms

| Перевірка | P |
|---|---|
| З'ясовано, що вже стоїть на чинному сайті клієнта — GTM, GTag, інше — і про це повідомлено PM (TRACK-01: інвентар; `decisions.analyticsIds`) | HIGH `M` |
| Якщо використовується Termly, підключення йде через GTM | MED `M` |
| Жодного вигаданого ID контейнера і жодного плейсхолдера, який виглядає налаштованим (TRACK-01) | HARD |

**A placeholder that looks configured is worse than nothing.** An empty analytics
slot is obvious at a glance; `GTM-XXXXXXX` sitting in the head reads as done, and
nobody checks it again until the client asks why there is no data.

### Not carried over

- **Shopify «physical product» checkbox** — out of scope with eCommerce.
- **Heavy videos and images**, **next-gen format**, **redirects**, **slugs against
  the PP files**, **the client's form recipient** — already checked in the images
  hook, the SEO sweep and the forms block. Not repeated here.

## 19. Editability — the thing the whole build is for — stage 2

A page can match the design pixel for pixel and still be a failure: if the client
cannot change a heading, swap a photo or add a team member without calling us, the
port did not do its job. **Nothing else in this file measures that**, because
editability is invisible from the front end.

### How to test it without breaking the golden rule

Testing editability means touching things, and this skill never changes anything.
So the protocol is fixed:

- **Type, look, undo.** Click into the text, type a character, confirm the canvas
  updates, press undo. Nothing is saved.
- **Draft, look, delete.** For a collection, create a **draft** entry, confirm it
  renders in the loop preview, then delete it. Never publish.
- **Never press Update on an existing page or post.** The designer's own edits live
  there, and a save can flatten them.

If any of that cannot be done without saving, the row is recorded `--status routed`
with the exact screens (so it reaches handoff section 3) rather than being forced.
Every row of this section is a person's: EDIT-01 (editor) and EDIT-02 (collections),
closed with `record.cjs`.

### WordPress

| Перевірка | P |
|---|---|
| **Кожна секція виділяється в редакторі** — блок клікається, у List View має читабельну назву, а не шість «Group» поспіль (EDIT-01; назви секцій — WP-07) | HARD |
| **Текст редагується прямо в канві**, а не в полі збоку і не в коді (EDIT-01) | HARD |
| **Зображення міняється з медіатеки** — кнопка заміни є, і нова картинка стає на місце за пропорцією слота (EDIT-01) | HARD |
| **Жодного `core/html` і жодного невалідного блока.** «This block contains unexpected or invalid content» робить секцію нередагованою назавжди. **На фронті цього не видно** — сторінка рендериться бездоганно. Відповідь дає або WP-01 (`wp-admin-audit.js`, парсер редактора), або відкритий редактор. Без одного з цього рядок — ⚠️, ніколи ✅ | HARD |

**І зворотне: не все, що виглядає невалідним, є невалідним.** Зміряно на WP 7.1:
`core/group` спокійно приймає й `<div>` там, де атрибути кажуть `section`, й клас, який атрибути заявляють, а розмітка не несе — його депрекейшени покривають обидва випадки. А ось `core/heading` із розбіжністю рівня й тега, `core/button` із чужим тегом і `core/image` без `<figure>` — відмовляються. **Тобто «0 невалідних блоків» — це цілком можлива правда**, і група, яка на око виглядає неправильно, ще не є знахідкою. Оцінює інструмент, не око.
| **Контроли в сайдбарі справді працюють**: змінити відступ, колір, радіус — і побачити зміну в канві. Контрол, який нічого не змінює, гірший за його відсутність (EDIT-01) | HARD |
| **Патерни секцій вставляються з інсертера** і лежать у групі теми, а не в «Uncategorized» (EDIT-01) | HIGH |
| **Меню редагується** там, де його очікують — Appearance → Menus або Site Editor (EDIT-01) | HIGH |
| **Лого, фавікон, назва й опис сайту міняються з налаштувань**, а не з розмітки (EDIT-01) | HIGH |

### Collections — the half that is usually forgotten

| Перевірка | P |
|---|---|
| **Новий запис створюється і рендериться в лупі** — чернетка, подивитись, видалити (EDIT-02) | HARD |
| **Наявний запис редагується, і зміна видно на сторінці** (EDIT-02) | HARD |
| **Поля мають підписані контроли** — Role, Photo, LinkedIn — а не сиру таблицю Custom Fields з `theme_team_role` в колонці імені (EDIT-02) | HARD |
| **Поля з'являються на новому записі**, а не тільки на тому, де значення вже є (EDIT-02) | HIGH |
| **Порожнє поле нічого не друкує** — ні свого ключа, ні плейсхолдера (EDIT-02) | HIGH |
| **Featured image працює** і показується там, де його чекає шаблон (EDIT-02) | HIGH |
| **Query Loop віддає керування**: порядок, кількість, колонки, фільтр — у сайдбарі, а не захардкоджені (EDIT-02) | HIGH |
| **Права перевірені з-під звичайного користувача**: під адміном будь-яка колекція виглядає редагованою (EDIT-02) | HARD |

### Webflow

| Перевірка | P |
|---|---|
| Текст і зображення редагуються в режимі Editor, без Designer (EDIT-01) | HARD |
| Записи CMS створюються, редагуються й публікуються; нове поле з'являється там, де має (EDIT-02) | HARD |
| Компоненти мають винесені властивості там, де контент відрізняється між екземплярами — інакше клієнт правитиме кожен окремо (EDIT-01, WF-10) | HIGH |
| Нічого важливого не замкнене від редагування, і нічого структурного не лишилось відкритим, якщо блокування домовлялись (EDIT-01) | MED |

<!-- merged 2026-11-05: rows with no local equivalent -->
| **Кожен названий блок-стиль застосовується в канві, а не лише на фронті.** Увімкнути стиль у Styles і подивитись: стиль, який нічого не робить у редакторі, дизайнер вважає зламаним — і він справді зламаний, бо вибирають його тут. Причина майже завжди одна: тема в канві вантажиться **перед** ядром, тому нічия з правилом ядра виграється на фронті й програється в редакторі | HARD |
| **Редактор показує справжній запис, а не шаблон.** Для записів і CPT канва може віддавати шаблон: ознака — кількість блоків, яка не змінюється від запису до запису. Перевіряти на двох різних записах | HIGH |
