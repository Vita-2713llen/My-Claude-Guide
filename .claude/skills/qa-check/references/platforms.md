<!-- qa-check reference · нутрощі WordPress і Webflow, робота через API конструктора · вантажити за потреби, правила тут рівно ті самі -->

## 20. WordPress internals — what breaks where nobody is looking

Every one of these has the same shape: **the front end is perfect and something
else is broken**, so a visual sweep passes and the defect reaches the client. All
are stage 2, gated on RUN-05 = WordPress (on any other platform the manifest marks
them ⊘ itself).

**Instrument:** `scripts/wp-admin-audit.js`, read-only, in a logged-in admin tab
(`references/instruments.md`, step 7) — WP-01…12, WP-14, FORM-08/09, CMS-02. Two
rows have no bundled script: **WP-13** (editor canvas = front end) — a canvas-diff
tool where one is installed, otherwise a person compares the editor at the three
preview widths with the front-end screenshots; **WP-15** (flexible layouts,
shortcodes) — a person. Both are closed with `record.cjs` (`pass` / `fail` with the
evidence, or `routed`), never ✅ by inference.

### The editor canvas against the front end — the biggest gap

| Перевірка | P |
|---|---|
| **Канва редактора виглядає так само, як фронт** (WP-13). Інструмент порівняння вантажить фронт у прихований iframe завширшки з канву і друкує тільки ті обчислені властивості, що відрізняються, на **трьох ширинах редактора** — Desktop, Tablet, Mobile; кожна різниця — рядок звіту (фікс — після дозволу) | HARD |

**Why it differs at all, and why no amount of front-end checking finds it:** in the
canvas the theme's stylesheet loads **before** core's; on the front end it loads
**after**. A theme rule that ties with a core layout rule therefore **wins on the
front end and loses in the editor**. One run returned seven differences on a page
that had just passed a full front-end sweep — a hero gap rendering 0px instead of
100px, eight groups whose `align-items` came out `stretch`. The proposed fix: double
the class, not weaken core.

Two more canvas facts worth knowing before reporting a difference as a defect:
**no theme JavaScript runs there**, so every state a script would set is absent;
and **`100vh` in the canvas is the window minus roughly 220px**, so a full-height
section is legitimately shorter there.

### Blocks and theme.json

| Перевірка | P |
|---|---|
| **Валідність через парсер самого Gutenberg** (WP-01) — аудит використовує `wp.blocks` редактора і віддає кожен блок із `isValid === false` разом із дослівною різницею. Без цього невалідний блок знаходить клієнт, відкривши сторінку | HARD |
| **Глобальний стайлшит справді згенерований і повний** (WP-12). `settings.custom` — це CSS: один апостроф, лапка, фігурна дужка чи крапка з комою обриває його **з того значення й до кінця**, мовчки | HARD |
| **Немає збереженого `wp_global_styles`, який перекриває theme.json** (WP-06). Нові записи палітри не з'являються, і причину шукають у кешах | HIGH |
| **Кеш патернів скинутий**: активація теми до того, як патерни існували, кешує порожній список — інсертер лишається порожнім, поки кеш не скинути (EDIT-01) | HIGH |
| **Слаги в theme.json чисті** — `border` у палітрі робить невалідним **кожен** блок із кольором рамки; цифровий слаг `2xl` стає `2-xl` і резолвиться в нуль (наслідок видно в WP-01; сам файл читає людина або інструмент перевірки theme.json, де він є) | HIGH |

### The templates the theme owes — read the folder, not the browser

**WordPress always serves something.** Ask for a missing address and you get a
page; ask for a search and you get results. So "the 404 works" and "search works"
are true on every WordPress site ever built, and prove nothing. What is being
checked is whether **the theme designed those screens**, and that question is
answered by listing `templates/`.

| Перевірка | P |
|---|---|
| **`templates/404.html` існує** (WP-10) і несе хедер, футер, типографіку сайту й кнопку на головну (PAGE-02). Якщо файла немає, WordPress мовчки віддає `index.html`, і візуально це виглядає як працююча 404 | HARD |
| **`templates/search.html` існує**, якщо на сайті є пошук — разом із оформленим порожнім станом (WP-11) | HIGH |
| **`templates/index.html` — не єдиний шаблон на все.** Де є блог або CPT, мають бути `single.html` / `single-{type}.html` і `archive.html` / `archive-{type}.html`; де є таксономія — `taxonomy-*.html` (WP-11) | HIGH |
| **Кожен файл у `templates/` і `parts/` дійсно використовується.** Шаблон, який не ловить жодного запиту, і `customTemplates`, який ніде не вибраний, — такі самі залишки, як патерн, якого ніхто не вставляє | MED |

### The rest

| Перевірка | P |
|---|---|
| **CPT має `map_meta_cap`, якщо в нього свій `capability_type`** (WP-14). Без цього фронт бездоганний, а редактор зламаний: біндінги друкують ключі метаполів замість значень, featured image показує плейсхолдер, і помилки немає ніде | HARD |
| **Дрейф між файлом патерна і збереженою сторінкою.** Сторінка — копія на момент збереження; правки дизайнера в wp-admin живуть лише в ній. Звірити перед передачею, щоб наступний запис їх не затер (WP-06, EDIT-01) | HIGH |
| **Інлайновий SVG вижив.** KSES вирізає його при записі через CLI — іконки зникають тихо, і в базі лишається порожній блок (WP-01, IMG-06) | HIGH |
| **Розмитий хедер не ламає фіксовані елементи.** `backdrop-filter` робить елемент containing block для кожного `position: fixed` нащадка: панель дропдауна обрізається висотою хедера, шухляда відкривається недосяжною смугою. Те саме дають `filter`, `transform`, `perspective` (LAY-02, NAV-01) | HIGH |
| **`post_content` не гігантський.** Плагіни на кшталт LottieFiles вшивають усю анімацію в пост: файл на 3.4 МБ дає сторінку на 35 МБ і фатальну помилку при відкритті редактора (PERF-02) | HIGH |

## 21. Webflow internals — what breaks where nobody is looking

Checks from the pre-publish sweep, all of them earned on a real build. Gated on
RUN-05 = Webflow. Most are template rules — a **client site** has more latitude,
and each block says where. What the published HTML shows is measured by `qa-run`
(WF-02 form names, WF-03 default state texts, WF-08 interaction wiring, plus the
generic rows: IMG-05 hero eager, SEO-06 subdomain indexing, PAGE-01/02, SEO-04/08).
What lives inside the project is read **read-only** through the Webflow connection
or by a person in Designer and recorded with `record.cjs`: WF-01 custom code, WF-04
CMS integrity, WF-05 alt in three places, WF-06 republished, WF-09 collection links
and slugs, WF-10 editable structure; WF-07 (the Audits panel count) is a person. Rows
without a connection and without a person are `routed`, never ✅.

## Use the Webflow connection before deciding anything is unreachable

**If a Webflow MCP connection is available, it is the first instrument, not the
last.** List the tools it exposes at the start of the run and work from what is
actually there — it reaches the project directly and reads back most of what
otherwise looks like a Designer-only judgement:

| Що читається напряму | Що це закриває |
|---|---|
| сторінки та їхні налаштування | мета-поля, кастомний код у head/footer, структуровані дані |
| стилі та класи | невикористані класи, випадкові комбо-класи, чернеткові назви |
| компоненти та їхні властивості | осиротілі компоненти, винесені властивості |
| колекції, поля, записи | порожні поля, незаповнені reference, чернетки й архів |
| ассети | невикористані файли, alt-тексти |
| форми | назви форм, поля, типи, обов'язковість |
| змінні | чи значення беруться зі змінних, а не вписані разово |
| зареєстровані скрипти | реєстр окремо від блоків коду |

**So "needs the Designer" is a conclusion, not an assumption.** Before putting a
row in ⚠️ or calling it manual, check whether the connection answers it. A run
that reports "перевірити можна лише вручну" while a tool for exactly that sits
unused has not hit a limit — it did not look.

**Two things the connection genuinely does not give**, and they are the only
honest ⚠️ in this section:

- **Interactions.** There is no endpoint. They are read from the published HTML
  instead — `data-w-id` on the elements and the interaction data the site's
  Webflow script carries (WF-08) — or exercised in the browser.
- **Whether something *looks* right.** The connection returns the values applied
  to an element, which answers "does this carry the site's styles or Webflow's
  defaults" — but not whether the result reads well. That last step is eyes, and
  it is the one place the word "manual" is earned.

**Interactions do not exist in the Data API** — there is no endpoint. That is not
the same as unverifiable, and the difference decides half this section.

### Where Webflow animations actually live, and what each stage can see

Animations here arrive two ways, and both leave traces in the markup.

**GSAP driven by attributes** — `data-load`, `data-scroll`,
`data-scroll="fade-in-item"` — is plain HTML. **Stage 1 reads all of it:**

| Перевірка | P | Stage |
|---|---|---|
| **Покриття**: кожна секція має свій атрибут; декоративні лінії й роздільники мають власний, як вимагає хук про reveal (INT-11, WF-08) | HIGH | 1 |
| **GSAP і його плагіни справді завантажені**, і в порядку, який працює — ScrollTrigger після ядра (JS-01, INT-11) | HARD | 1 |
| **Немає розбіжності між атрибутами і скриптом**: елемент з атрибутом, який ніхто не читає, або скрипт, що чекає на атрибути, яких ніде немає (WF-08, INT-08) | HARD | 1 |
| Значення в атрибутах — з дизайну, а не з чужого прикладу | MED | 1 |

**Webflow's own IX2** leaves `data-w-id` on the elements, and the interaction data
(every interaction, its trigger and its targets) is published with the page — in
current exports it is the argument of `Webflow.require('ix2').init({…})` inside the
site's Webflow script, not a separate JSON blob. So IX2 is readable from the
published files even though the API knows nothing about it (WF-08):

| Перевірка | P | Stage |
|---|---|---|
| Дані інтеракцій читаються; кожна інтеракція має тригер і ціль (WF-08) | HIGH | 2 |
| **Немає `data-w-id` без відповідної інтеракції** — і навпаки (WF-08) | MED | 2 |

**And what only the live site can answer:** whether any of it actually runs — the
frame loop, the end states, scroll in both directions and twice, hover with real
pointer events, and whether caching or minification broke the wiring.

**Both halves are needed, and neither substitutes for the other.** An attribute
being present does not mean the animation works: the script may not have loaded,
a class hook may not survive file combining, a trigger may wait for a threshold a
short page never reaches. And the live site cannot show **missing coverage** — a
section with no attribute simply does not animate. It is not broken, it is silent,
and by eye that is indistinguishable from a section meant to be still.

That is also why the frame-loop ladder in section 11 matters: without it, a dead
pane makes every working animation look broken and every missing one look the
same.

### Custom code — four separate places, not one

On a **template**: GSAP and its official plugins for animation, nothing else (WF-01,
TPL-01). On a **client site**: allowed when listed in `decisions.allowedCustomCode`,
and declared in the summary.

| Перевірка | P |
|---|---|
| Site Settings → Custom Code: head і footer порожні (WF-01) | HARD |
| **Page Settings кожної сторінки**: head і footer порожні. Код рівня сторінки не видно нізвідки більше — перевіряти всі, не лише ту, над якою працювали (WF-01) | HARD |
| **Реєстр зареєстрованих скриптів порожній.** Це окремий список: порожній footer не означає порожній реєстр (WF-01) | HARD |
| Жодного HTML Embed чи Code Block у дереві сторінки (WF-01) | HARD |
| У вихідному коді живого сайту немає жодного `<script>`, якого ви туди не клали — окрім рантайму самого Webflow (WF-01, TPL-01) | HIGH |

### SEO fields

| Перевірка | P |
|---|---|
| **Мета-опис однаковий на всьому сайті** — один на проєкт. Знахідка це сторінка, де він **інший** або порожній, а не сторінка без унікального (SEO-02) | HIGH |
| **На сторінках колекцій опис тягнеться з поля колекції**, динамічною прив'язкою, не літеральним текстом. Токен пишеться **сирими лапками**: екрановані виглядають правильно в полі, ніколи не збігаються при публікації і їдуть на сторінку видимим текстом (WF-04, SEO-02) | HARD |
| **Кожна колекція має поле Meta Description і поле Open Graph**, і кожен запис їх заповнює. Відсутнє поле видно лише тоді, коли колекції виклали поруч (WF-04) | HARD |
| **⛔ OG-зображення на сторінках колекцій тягнеться з поля запису — кодом.** У колекції є поле зображення для Open Graph, кожен запис його заповнює, а в **Page Settings шаблону колекції → Custom Code → head** стоять `<meta property="og:image" content="…">` і `<meta name="twitter:image" content="…">`, де `content` — **динамічна прив'язка до цього поля**, не URL, вписаний руками. Сайтове OG-зображення в налаштуваннях шаблону при цьому знято, щоб на сторінці був **рівно один** `og:image` — інакше платформа віддає свій тег першим, і соцмережі беруть його. Перевірка на живому сайті, не в налаштуваннях: відкрити **два різні записи** — `og:image` у них **різні URL**, по одному тегу на сторінку, і обидва файли віддаються з CDN. Знахідкою є кожне з: одна сайтова картинка на всіх записах; порожній head шаблону; колекція без поля зображення; запис із порожнім полем; прив'язка, яка на сторінці віддалася сирим токеном (WF-04, SEO-04) | HARD |
| Мета-заголовок заповнений на кожній статичній сторінці. **На темплейті заголовок головної закінчується на «… Webflow HTML website template» — це так і має бути**; знахідкою є його відсутність або чужа назва (SEO-01) | HARD |
| OG title, description та image на кожній сторінці **і на кожному шаблоні колекції** (SEO-08) | HIGH |
| Запасні title і description на рівні сайту, Site Settings → SEO | MED |
| **Перемикач «Disable Webflow subdomain indexing»** (SEO-06): увімкнений, поки сайт живе на `.webflow.io`. **У Webflow `robots.txt` не створюють** — платформа віддає його сама, а редагують у Site Settings → SEO. Тож перевіряти треба перемикач і вміст, а не наявність файлу | HIGH |
| **Темплейт маркетплейсу лишається на `.webflow.io` назавжди**, тож блокування індексації для нього — норма назавжди, а не тимчасовий стан перед запуском (SEO-06) | HIGH |
| Фавікон **і webclip** завантажені | MED |

### Assets and alt — three different places

**Alt, проставлений в одному місці, не робить нічого для двох інших.**

| Перевірка | P |
|---|---|
| Кожен ассет у панелі Assets має alt (WF-05) | HARD |
| **Кожне поле зображення CMS має alt — і ставиться воно руками.** Запис через API вимагає `url` поруч із `fileId`, а це переімпортовує файл під новим id: лишається дублікат у бакеті колекції, іноді з подвійним кодуванням пробілів у `%2520`. В Editor це безкоштовно (WF-05) | HARD |
| Кожен `<img>` усередині Rich Text має alt — це звичайний HTML, скриптувати безпечно (WF-05, IMG-01) | HIGH |
| **Невикористані ассети звірені і з опублікованими сторінками, і з даними CMS.** Обхід сторінок сам по собі не доводить нічого: поля CMS посилаються на файли, яких немає в жодному вихідному коді. `delete_asset` — м'яке видалення без відновлення (WF-11) | HIGH |
| **Hero вантажиться eager, решта lazy** (IMG-05). Webflow робить lazy **все** за замовчуванням — включно з тим зображенням, яке визначає LCP | HIGH |

### Links

| Перевірка | P |
|---|---|
| **Посилання на детальні сторінки генеруються всередині Collection List** (WF-09), ніколи не набираються руками. Набране руками переживає зміну слага мовчки; згенероване всередині `w-dyn-item` зламатись не може | HARD |
| **Слаг сторінки збігається з кожним шляхом, який на неї веде.** Слаг `licensing` у налаштуваннях і живий шлях `/templates/license` — усе, що лінкує другий варіант, віддає 404, без жодного попередження (WF-09) | HARD |
| **Якірні id стоять у полі ID елемента**, не в кастомних атрибутах: `id` зарезервований, і як атрибут просто не працює (LINK-02) | HIGH |
| **Якір лягає нижче фіксованого навбару** — виміряно, не на око (LINK-10) | MED |
| `mailto:` і `tel:` ведуть на справжню адресу й номер, а не на зразок із макета (LINK-08) | HIGH |

### CMS integrity

| Перевірка | P |
|---|---|
| **Жоден чернетковий чи заархівований запис не злінкований з опублікованої сторінки** (WF-04) | HARD |
| **Кожен запис має заповнені всі поля** — включно з тими, яких шаблон зараз не показує. Порожнє поле невидиме до дня, коли його прив'яжуть (WF-04) | HIGH |
| **Reference-поля заповнені в усіх записах**, не в більшості: шаблон, що тягне `author → name`, рендерить порожнечу там, де посилання лишили порожнім (WF-04) | HIGH |
| **Collection List рекомендацій на шаблоні колекції виключає поточний запис** — фільтр на рівні списку, а не ручний добір. Живий сайт міряє CMS-01 на кожному записі; наявність самого фільтра (знахідка навіть тоді, коли збігу зараз не видно) читається з налаштувань списку — підключення або людина | HIGH |
| **Порожній стан кожного Collection List застилізований**, а не лишений дефолтним (WF-03) | HIGH |
| Ліміт, сортування й фільтри Collection List виставлені свідомо | MED |

### Structure and styling — what keeps the file editable

| Перевірка | P |
|---|---|
| Увесь текст у Heading, Paragraph або Text Block — ніколи голим текстовим вузлом у Div (WF-10) | HIGH |
| Кольори й розміри з Variables; жодних одноразових значень у Style-панелі (WF-10). **Лише для темплейта маркетплейсу** (`decisions.projectType: "template"`). На **клієнтському сайті** код дозволений, тож сирі значення в нативних стилях і значення, що живуть у hosted CSS / head-коді, **не знахідка**: не міряти, не рахувати, не згадувати у звіті (practice rule, 2026-09-11) | HIGH |
| Спільні класи не змінені; правки під екземпляр живуть на комбо-класах (WF-10) | HIGH |
| Відступи через flex і grid gap плюс падінги, не через margin | MED |

### States nobody sees unless they are forced

**A state that never appears on a normal page load is a state nobody styled.**
Success, error and empty are the three, and all three ship as Webflow defaults far
more often than anything visible does — precisely because opening the page does
not show them.

**Reading the page's markup is not enough.** In Webflow the success and error
blocks sit in the DOM with `display: none` and look perfectly fine there.

**But the connection answers half of it without forcing anything:** ask it what
styles those blocks carry. A success block with the site's classes on it is
styled; one carrying only Webflow's own is not, and that is a finding before
anything has been submitted.

**Show the state for the other half** — whether it looks right on screen, at the
right size, in the right place — without sending anything the agent is not allowed
to send:

| Стан | Як його показати |
|---|---|
| **Success** | агент: у своїй сторінці прогону зняти `display:none` з блоку success і зняти скріншот на 1440 і 360 — на сайт нічого не відправляється; у Designer — перемиканням стану форми. Справжня валідна відправка — FORM-14, людина з дозволу |
| **Error** | `qa-run --form-errors` — лише з дозволу людини в цьому прогоні (порожня відправка); інша невалідна відправка — так само лише з дозволу, інакше рядок handoff |
| **Empty state** колекції | WF-03 читає дефолтний текст із розмітки; вигляд — відфільтрувати Collection List у Designer (без збереження) або відкрити колекцію без записів |

Then check what appeared:

| Перевірка | P | Stage |
|---|---|---|
| **Success застилізований** — типографіка, кольори й відступи сайту, а не сірий блок Webflow. Текст говорить, що саме сталося, і що буде далі (WF-03, FORM-14) | HIGH | 2 |
| **Error застилізований** і пояснює проблему, а не каже «Oops! Something went wrong while submitting the form.» дефолтним текстом (WF-03, FORM-06) | HIGH | 2 |
| **Порожній стан кожного Collection List застилізований** і має текст, який щось означає — «Поки що немає записів» замість дефолтного «No items found» (WF-03) | HIGH | 2 |
| Порожній стан не ламає верстку секції: падінги, вирівнювання й висота лишаються тими самими | MED | 2 |
| Усі три стани перевірені **на мобільному теж** — саме там вони найчастіше вилазять за межі | MED | 2 |

**Report them by name.** "Стани форми не перевірені" says nothing; "Success —
дефолтний блок Webflow; Error — дефолтний текст; порожній стан Blog — «No items
found»" is three defects with three fixes.

### Forms and error pages

| Перевірка | P |
|---|---|
| **Кожна форма має унікальну назву** (WF-02). Webflow групує заявки за назвою: дві «Email Form» зливаються в одну скриньку | HARD |
| Стани Success і Error обидва застилізовані **і обидва відкриті очима** (WF-03, FORM-06) | HIGH |
| **Системні сторінки `404` і `401` задизайнені, а не дефолтні** (PAGE-02). У Webflow вони існують завжди, тож питання не в наявності, а в тому, чи їх оформили типографікою, кольорами й кнопками сайту. **Відкрити обидві й подивитись** — `404` за неіснуючою адресою; `401` лише якщо захист паролем уже увімкнений (напр. на стейджингу) — вмикати його заради перевірки заборонено, інакше людина дивиться сторінку в Designer → рядок `routed` | HARD |
| **`404` має хедер і футер сайту**, велике «404», короткий заголовок на кшталт «Something's not right.», один рядок пояснення і **одну кнопку на головну**. Це повноцінна сторінка сайту, а не окремий екран (PAGE-02) | HIGH |
| **`401` навпаки — самостійний екран без хедера й футера**: іконка замка, заголовок «Protected Page», підпис `PASSWORD`, поле вводу і кнопка Submit. Навігація тут зайва: людина ще не всередині сайту (PAGE-02, FEAT-07) | HIGH |
| Кнопки на обох — стилі сайту, а не дефолтні кнопки Webflow; поле пароля має ті самі радіус, рамку й падінги, що інші поля форм | MED |
| **Licensing і Changelog існують** — обидві обов'язкові для темплейта маркетплейсу і обидві **задизайнені**, а не заглушки з двома рядками тексту (PAGE-01; знаходиться за лінком футера або `decisions.legalPath`). Чи Licensing має вхідний лінк із футера — вирішує правило кредиту компанії (`decisions.credit`) | HARD |
| **Ховер має справжній другий стан**, а не перехід у нікуди (INT-05, INT-12) | HIGH |
| **Жодна інтеракція не лишає елемент на нульовій прозорості, коли її тригер не спрацьовує.** Класика: scroll-into-view на тому, що вже над згином короткої сторінки — воно просто не з'являється ніколи (INT-08, INT-11) | HARD |

### ⛔ Webflow Audits — every issue is read and reported, page by page

**Webflow audits every page itself** — the Designer's **Audits** panel and the line
*«N issues to improve on this page»* in the Publish dialog. The client and the next
developer see that number the moment they open the project, so it is part of the
deliverable, not a suggestion.

**During the run it is only read (WF-07, a person in Designer, or the connection's
audit call if it exposes one — read-only).** The count is recorded for **every**
static page and every CMS template — the Publish dialog counts only the current
page; Home at zero says nothing about the inner pages. A page whose count was not
read is ⚠️ or routed, never ✅. The published HTML answers most of it
independently — generic link text (LINK-05), `<img>` without alt (IMG-01/08), no
`application/ld+json` (SEO-05) — and the two sources must agree.

Each issue becomes a report row with the proposed fix from the table below, marked
⚡. **Nothing is written to the project during the run.** After the designer approves
a scope, the permission line names the count first — *«Запишу у Webflow-проєкт: 14 alt,
6 aria-label, JSON-LD на 5 сторінках — підтвердити?»* — and after the fix the count is
read again: *«Home 11 → 0, About 6 → 0, шаблон колекції 4 → 1 (schema: template)»*. A
remaining issue is allowed only with a stated reason — a decision, so a ❓, never a
quiet ✅.

| Audit issue | Proposed fix | Never |
|---|---|---|
| **Non-descriptive link content** («Learn more», «Explore», «View», an icon-only link) | an `aria-label` that names the destination — «Learn more about <the company>»; on a CMS card, bind the label to the item name | rewriting the visible text the design chose |
| **Add alt text** | **every** image gets a real description — content images from the content, decorative ones by what they show («Abstract line illustration»). Empty / Decorative alt only if the project's `qa-target.json` records that decision. Asset-panel alt and element alt are two places — fill both | typing «image» or a filename into alt to silence it |
| **Add schema markup** | JSON-LD in Page Settings: `Organization` + `WebSite` on Home, `WebPage`/`AboutPage`/`ContactPage` where the type is obvious, `Service` on service items, `Article`/`CreativeWork` on case studies — built from real content. **On a marketplace template the rule inverts: no structured data** — leave the issue, and say why | inventing addresses, phone numbers, ratings or logos that are not on the site |
| **Missing / duplicate title or description**, **heading order**, **empty link / button** | fix at the source: page settings, the heading level, the element's link | hiding the element to make the warning go away |

#### Як виконати фікс після дозволу (не під час прогону)

API mechanics that decide how each approved fix is made (earned on a real run):

- **Alt:** an Image whose `altText` setting is `inherit` takes the asset's alt — and an asset without alt makes the
  element flagged. Write a descriptive static `altText` on the element, and set the same text on the asset with
  `update_asset alt_text`. An empty `""` is Webflow's Decorative — only where the project decided so.
- **Link names on a component button:** binding a link attribute such as `aria-label` to a component prop is
  refused by the API. Put a visually-hidden child (`position:absolute; width:1px; height:1px; overflow:hidden;
  clip:rect(0,0,0,0); white-space:nowrap`) inside the link and bind its **text** to a string prop — the accessible
  name becomes label + context, the button does not move. Fill the prop on every instance and verify the
  computed accessibility name, not the markup.
- **Exclude the current item from a related Collection List:** set `filters` with `static_json`
  `[{"fieldSlug":"name","operator":"doesNotEqual","value":{"sourceType":"cms","collectionId":"<id>","fieldId":"<Name field id>"}}]`.
  `slug` and `_id` are not filterable fields, `ne` is not an operator (text fields take `equals` / `doesNotEqual`),
  and a `{type:"currentItem"}` value is refused — the CMS binding on a template page is what means "this item".
- **Schema:** the Page Settings schema field cannot be written through the API (bulk write 403, single write
  silently ignored). JSON-LD in the page's head code is valid for search engines; whether the panel accepts it
  is confirmed in the Designer, and if it does not, the JSON goes into Page Settings by hand.

### After publishing

| Перевірка | P |
|---|---|
| **Сайт перепубліковано після кожної зміни CMS** (WF-06). Publish запису в Editor **не публікує сайт**: сторінка віддає 404, хоч запис опублікований, посилання згенероване і ніде нічого не захардкоджено. Це найдорожча помилка з усього списку, бо виглядає як баг, яким не є | HARD |
| Захист паролем знято — або лишено свідомо — на тому домені, який передається (RUN-06, FEAT-07) | HIGH |
| **OG-зображення справді віддається за своєю CDN-адресою** і має щонайменше 1200×627 (SEO-08). Прив'язане поле і досяжний файл — два різні факти | HIGH |

### If any of this is scripted through the Data API

Six things that cost an hour each to discover:

- **`bulk_update_pages` віддає 403** `insufficient_permissions`, тоді як посторінковий `update_page_settings` працює. Планувати виклик на сторінку.
- **Ліміт ≈60 запитів на хвилину.** Батч на п'ятдесят, потім пауза сімдесят секунд; 429 посеред батча лишає сайт у напівоновленому стані.
- **`jsonLdSchema` тільки для читання.** `update_page_settings` приймає поле й мовчки ігнорує. Чистити схему доводиться в Designer.
- **Запис зображення CMS вимагає `url` разом із `fileId`** — і дублює файл, як описано вище.
- **Завеликі відповіді пишуться у файл**, кількома склеєними JSON-об'єктами в обгортці: розбирати поступово, один `parse` впаде на другому об'єкті.
- **Інтеракцій в API немає.** Жодного ендпоінта.

<!-- merged 2026-11-05 from the 2026-10-19 branch of this skill -->
### What the client actually edits — open every one of them, alone

**Секція може бути ідеальною на фронті й недосяжною в адмінці, і жодна перевірка
сторінки цього не покаже.** Чотири різні причини, усі зустрілись на одному
проєкті за один день, усі виглядають для клієнта однаково: «я не можу це
змінити».

| Перевірка | P |
|---|---|
| **Кожна секція, яку клієнт має правити, має синхронізовану копію.** Тема шукає її за НАЗВОЮ і друкує патерн із файлу, коли копії немає. Фронт при цьому бездоганний, а правити нічого: файл теми не редагується ніколи. Перелічити секції, які клієнт змінюватиме, і для кожної знайти запис у **Appearance → Patterns → My patterns** | HARD |
| **Патерни теми й копії називаються однаково, і це плутає.** У категорії теми на кожному замок і підпис «Not synced»; у «My patterns» замка немає. Перевірка — відкрити ту, що без замка, і переконатися, що вона справді та сама секція | HIGH |
| **⛔ Відкрити КОЖЕН синхронізований патерн окремо і переконатися, що в канві щось намальовано.** Секція, яка ховає себе порожньою — `:not(:has(…)) { display: none }` — у редакторі патерна **схована завжди**, бо запису, з якого вона бере дані, там немає ніколи. Разом із нею зникає її власний заголовок, тобто саме те, що прийшли правити. Панель при цьому пише «3 words» — вміст є, його не показують. Лікується правилом тільки для редактора: `.is-root-container > .картка:not(:has(…)) { display: flex }` | HARD |
| **Динамічний блок у патерні має зрозумілий порожній стан.** `ServerSideRender` без запису друкує «Block rendered as empty.», а блок, прив'язаний до поля, друкує **назву поля** — `event_sponsor_name` замість заголовка. Відвідувач цього не бачить ніколи, клієнт — щоразу. Замінити на речення, яке пояснює, звідки береться вміст | HIGH |
| **Сказати клієнту, що з трьох речей перед ним він міняє.** Synced — **на всіх сторінках одразу** (кнопка в тулбарі так і зветься «Edit original»); вставлений патерн — тільки тут; поле — тільки цей запис. Питання «а можна, щоб текст був різний на кожній сторінці?» звучить у кожному проєкті, і відповідь визначає, чим ця секція має бути | HIGH |
| **Сайдбар і будь-що з шаблону не редагується з екрана запису.** У List View запису його немає й бути не може, і це читається як «блоки зникли». Усе, що змінюється від запису до запису, має бути **полем** — більше нічого з екрана запису до шаблону не дістає | HIGH |

### ⛔ Тихі помилки — лог, консоль і час збереження

Три перевірки, які нічого не питають у сторінки, і кожна знаходить те, чого візуальний
прогін не бачить **ніколи**. Усі stage 2, усі обовʼязкові перед передачею.

| Перевірка | P |
|---|---|
| **`WP_DEBUG_LOG` увімкнено, пройдено ключові сторінки й редактор — лог порожній** | HARD |
| **Консоль редактора без помилок** на сторінці, записі й шаблоні; усі REST-запроси канви — 200 | HARD |
| **Час збереження в редакторі зміряний під навантаженням**, а не на тихому сайті | HIGH |
| **Жоден дев-інструмент не лишився** — скрипти в корені сайту, дампи, `*-check.php`, `cookie.txt`, тестові сторінки | HARD |

**Лог ловить те, на що немає жодної іншої перевірки.** Найчастіше це не фатальні
помилки, а notice-и, які ядро пише раз на запит і яких не видно ніде: патерн без
обовʼязкового заголовка, звернення до неіснуючого ключа масиву в рендері блока,
деприкація. Сторінка при цьому бездоганна.

*Один прогін: тека `patterns/` мала підтеку з частинами, які не є патернами. Ядро
сканує `patterns/` **на глибину 1 включно з підтеками**, тому кожна з них давала
notice «Slug missing», і єдиним місцем, де це було видно, був лог.*

**Час збереження міряється під навантаженням, бо на тихому сайті його немає.**
Локальний стек зазвичай тримає **два PHP-воркери**; один довгий запит забирає
половину сайту. Збереження, яке самотньо займає 800 мс, під паралельним запитом
займає 3,6 с — і саме це відчує клієнт. Міряти вдруге, з одним відкритим запитом
поруч.

**І ніколи не опитувати сайт, поки відкритий редактор.** Редактор тримає свої
зʼєднання; проба в цей момент стає в чергу, повертає таймаут і виглядає як дефект
сайту. Це найчастіша причина хибно-червоного рядка на WordPress.

<!-- merged 2026-11-05: rows with no local equivalent -->
| **Валідність через парсер самого Gutenberg** — `templates/validate-blocks.php` вантажить скрипти редактора і віддає кожен блок із `isValid === false` разом із `validationIssues[0].args`, тобто дослівною різницею. Без цього невалідний блок знаходить клієнт, відкривши сторінку | HARD |
| **OG-зображення справді віддається за своєю CDN-адресою** і має щонайменше 1200×630. Прив'язане поле і досяжний файл — два різні факти | HIGH |
