<!-- qa-check reference · відповідність макету, відступи, контраст, адаптив по семи тирах · вантажити за потреби, правила тут рівно ті самі -->

## 7. Design fidelity

| Check | P | Stage |
|---|---|---|
| Everything matches the Style Guide and the design (REF-01, VIS-01) | HARD | 1 |
| **Тег відповідає функції.** Що веде кудись — `<a href>`; що діє на сторінці — `<button type="button">`. Перевіряти по одному: `<button>`, який веде на іншу сторінку, і `<a href="#">`, який відкриває модалку, — обидва дефекти. **Справжній сабміт форми — правильний `<button>` і не рахується** (LINK-13, LINK-06) | HIGH | **both** |
| **Кнопка веде туди, куди має**: клікнути кожну і подивитись, куди привело. Порожній `href`, `#`, відсутній атрибут, посилання на неіснуючу сторінку — усе це мертва кнопка, і вона однаково мертва на статиці й на задеплоєному (LINK-01, LINK-03) | HARD | **both** |
| **У Webflow** тег, який віддає платформа, знахідкою не є — але **перевірка не пропускається**: те, що веде, має мати проставлене посилання; те, що діє, не має `#` замість нього. «Платформа сама вирішує тег» не означає «кнопки тут не перевіряють» (LINK-01, LINK-13) | HIGH | **both** |
| Footer credit matches the project type and the **company credit rule**, recorded once per project in `qa-target.json → decisions.credit` (wording, which words are links, their hrefs, the link count) — FOOT-01 measures it; without the rule FOOT-01 is NOT RUN, never passed. **Client site:** the company's standard developer credit, verbatim, with its links. **Marketplace template:** the wording may vary; what is checked is that the line **names the template author** and **mentions the platform**. A difference in wording that the rule allows is not a defect | HARD | both |
| On a template, every credit word the rule names is a real link with the exact URL from `decisions.credit` (licence page, the author's templates page, the author, the platform); the author's links must match each other. Plain text where a link belongs is the same defect as the wrong wording (FOOT-01) | HARD | both |
| All elements and backgrounds use only the style guide's colours (REF-01) | HIGH | 1 |
| Container width matches the style guide and the content (LAY-13) | HIGH | 1 |
| Favicon present (IMG-07 вага; наявність — seo-check) | HIGH | both |
| Preloader, if the design has one, works on every page (FEAT-06) | MED | both |
| Image quality — no compression artefacts, no upscaled files | MED | 1 |
| Capitalisation rule identical across headings and buttons (TEXT-04) | MED | 1 |
| A new image dropped into an existing slot crops itself to the design (EDIT-01) | HIGH | 2 |
| The share preview of the URL looks right (SEO-08, SEO-14) | MED | 2 |

**The style guide page** — checked on the generated style guide, not in Figma:

| Check | P | Stage |
|---|---|---|
| Grid system covers the whole range of resolutions without gaps | MED | 1 |
| Styles for links, buttons and menu items, with their hover states (REF-01, LAY-07) | HIGH | 1 |
| Button styles: default, hover, disabled, plus size and typography (REF-01, LAY-07) | HIGH | 1 |
| Styles for headings, text and spacing (REF-01, LAY-14) | HIGH | 1 |
| Colour palette: swatches and codes consistent | MED | 1 |
| Separate H1 style for the homepage, if it differs | MED | 1 |
| Separate styles for blog posts, if they differ | MED | 1 |
| Open Graph image designed (SEO-08) | HIGH | 1 |

## 8. Spacing, contrast, alignment

| Check | P | Stage |
|---|---|---|
| Spacing skeleton: one value per tier for heading→text, text→button, title→content — `decisions.spacing`, else the site's most common value; 15 / 40 / 60 (40 at 568 and 360) is the recommendation in the fix column, not the accusation (LAY-14) | HARD | 1 |
| Spacings between and inside sections follow the style guide (LAY-10, LAY-14, REF-01) | HARD | 1 |
| Heading→paragraph spacing follows the style guide (LAY-14) | HARD | 1 |
| Section gaps 80–90px at 1024 and 768; 40–60px at 360 (LAY-10) | HIGH | 1 |
| **Хіро головної: `100vh` на 1024 або 1280** — на планшеті боком це заледве 768 висоти, і банер стискається в смугу. Показати з числами й спитати | ❓ | both |
| **Хіро має однакову висоту на всіх семи тирах** — драбини немає взагалі. Не обов'язково дефект, але майже завжди недогляд: показати значення й спитати, чи так задумано | ❓ | both |
| Opposite paddings consistent across sections (LAY-10) | HIGH | 1 |
| Column widths and the gaps between them consistent (LAY-07) | HIGH | 1 |
| Alignment identical in comparable sections (LAY-05, LAY-13) | HIGH | 1 |
| **Декоративні лінії сітки звіряються між сусідніми тирами (practice rule, 2026-09-16).** У кожній секції з лініями сітки зібрати видимі вертикальні й горизонтальні лінії (x, висота) на 767/768, 991/992, 1279/1280: лінія, що зʼявляється або зникає лише на одному тирі, проходить крізь картку, текст чи фото, або дублює край картки, — знахідка зі скриншотом секції; лінія на фоні контенту на вузьких тирах — ❓ дизайнеру. Урок: QA приніс «зайві вертикальні лінії в секції на 992» і «лінія за блоком команди на 360–991» (скріншоти VIS-01, текст біля лінії — LAY-11) | HIGH | both |
| **Контраст за WCAG 2.1**: ≥4.5:1 для основного тексту, ≥3:1 для великого тексту й UI-елементів; ціль AA, бажано AAA. Міряти кожну реальну пару, з числом у звіті (A11Y-01) | HARD | both |
| Текст поверх фото або відео — контраст міряється проти найсвітлішої ділянки під ним, а не проти прозорого фону (A11Y-01: ❓ зі скріншотом, не автоматичний 🔴) | HARD | both |
| **Контраст міряється механічно, а не «на око» (practice rule, 2026-10-05).** Обійти всі видимі текстові вузли й UI-елементи, для кожного взяти `color` і **ефективний фон**: піднятись предками, доки фон не стане непрозорим; якщо під текстом градієнт, зображення чи відео — зняти скріншот і виміряти найсвітліший і найтемніший піксель області тексту. Порахувати співвідношення за формулою WCAG і скласти таблицю пар із числами, найгірші зверху. Жодна пара не пропускається через «виглядає нормально» (A11Y-01) | HARD | both |
| **Стани теж мають контраст.** Міряти не лише спокійний текст: ховер і фокус лінків і кнопок, плейсхолдери полів, disabled-стани, повідомлення про помилку й успіх, текст на темних секціях, іконки-носії сенсу, межі полів форми проти фону. Саме стани найчастіше не доходять до заміру (A11Y-07, A11Y-08, A11Y-09) | HARD | both |
| **Фокус видно на кожному контролі**: обведення має власний контраст ≥3:1 проти сусіднього фону й не зникає на темних секціях (A11Y-07) | HARD | both |
| No doubled gap between two sections on the same background (LAY-10) | HIGH | 1 |
| **Every section keeps its own padding on a visible boundary.** Where the background changes, measure from the last element to the colour change and from the colour change to the first element of the next section — **zero on either side is a defect**, and it reads as content cut off rather than as a join (LAY-12) | HARD | both |
| A section with 0 padding on one side while its siblings all carry the scale's value is an outlier, not a decision — report it with both numbers (LAY-10) | HIGH | 1 |

### The header, the footer and the panels are sections too

**They have their own tables in this file, and that is exactly how they escape.**
The footer table asks about the credit and the links. The header table asks about
the burger and the dropdowns. Neither asks about padding, because padding lives
here — and a reader working table by table never brings the two together.

One run measured section padding across five sections, caught an outlier, and
reported the footer as clean while it carried **130px on top and 36px on the
bottom**. Nothing was wrong with the rule; the footer was simply never treated as
a thing the rule applies to.

**So every site-wide region is measured by this section as well as by its own:**
the header, the top bar, the footer, the open burger panel, the dropdown panels,
the cookie bar, any modal. For each of them:

- **opposite paddings**, against each other and against the rest of the site;
- **the spacing skeleton inside them** — a footer column's heading→links gap is
  the same kind of value as a section's heading→text gap;
- **one-off margins**. A single element carrying a margin that nothing else in
  its group carries is the unification finding, wherever it sits. A footer
  eyebrow with `margin-bottom: 41px` beside siblings at 0 is not "the footer's
  own spacing" — it is one element out of line;
- **hover on everything clickable in them**, measured the same way as in the body.

Their own tables stay as they are. This is in addition, not instead.

## 10. Responsive — the browser gets seven tiers, the editor gets what the platform has

**Two different things, and swapping them is how a run either misses defects or
invents them.**

**On the rendered page — seven tiers, on both platforms.** 1920 · 1440 · 1280 ·
992 · 768 · 568 · 360, every one, not a sample. A browser has no platform: a
visitor at 1280 sees 1280 whether the site was built in Webflow or WordPress.

**Inside the editor — whatever the platform actually offers.**

| Платформа | Скільки в редакторі | Що перевіряти |
|---|---|---|
| **Webflow** | **7** — чотири базові плюс 1280, 1440, 1920, якщо ввімкнені | пройти кожен, як на фронті |
| **WordPress** | **3** — Desktop, Tablet, Mobile у Site Editor | пройти всі три, і зчитувати **ширину**, а не назву кнопки |

**Read the width, never the label.** The button says "Tablet"; the number it
resolves to is what the layout reacts to, and it is not always the tier you
assume.

**And measure at both ends of a band, not only at its name.** Webflow's tablet
canvas renders at 768 while the band it styles runs 768–991, so a change made on
that canvas applies all the way up to 991. Check 768 **and** 991 — the same for
every band: 568 and 767, 360 and 567. A defect that only appears at the top of a
band is invisible to a run that only ever measures its floor.

So a WordPress editor pass that covers three widths is complete, and demanding
seven there is demanding something the platform does not have. The front-end sweep
still covers all seven — that is where the missing tiers get caught.

| Check | P | Stage |
|---|---|---|
| Container width correct at every breakpoint (LAY-13) | HARD | both |
| Page usable on mobile and tablet (LAY-01, LAY-02, XB-03) | HARD | both |
| No horizontal scrolling (LAY-01) | HARD | both |
| No truncated text from 768 down to 360 — no ellipsis, no `line-clamp`, no `nowrap` on copy (LAY-16) | HARD | both |
| Content scrolls where it needs to | MED | both |
| Pop-ups responsive and consistent on every screen | MED | both |
| Elements the design hides at a tier are hidden at that tier (VIS-01) | HIGH | both |
| **На тач-тирах (≤991) нічого клікабельного не ховається до ховера.** Стрілки, іконки «перейти», підкреслення, які на десктопі з'являються лише на `:hover`, на 991/768/568/360 мають бути видимі одразу — на тачі ховера немає, і без них не зрозуміло, що рядок клікабельний. Зчитати `opacity` / `visibility` таких елементів без наведення на кожному тирі ≤991: `0` — знахідка (INT-15) | HIGH | both |
| **Контент не впирається в лінії й краї карток ні на одному тирі.** На всіх 7 тирах для кожного заголовка, абзацу, пункту списку й кнопки в `main` — відстань від країв тексту до вертикальних ліній сітки (якщо дизайн їх має) і до країв батьківської картки; менше `decisions.edgeMinPx` (8px) — знахідка. Типова причина: `padding-right:0` на картці в медіа-запиті планшета (LAY-11) | HARD | both |
| **Лого не стрибає при відкритті бургер-меню.** На кожному тирі з бургером (991, 768, 568, 479, 360) виміряти `getBoundingClientRect()` лого в хедері, відкрити меню і виміряти лого всередині меню: `left`, `top`, `width`, `height` мають збігатися до 0.5px. Будь-який перепад (інший розмір, зсув) — знахідка. Перевіряти **всі компоненти хедера** (у Webflow їх може бути кілька — Header і Simple Header), а правила розміру лого читати з усіх шарів (нативні стилі, hosted CSS, bridge), бо пізніший шар тихо перебиває ручний оверрайд дизайнера (NAV-08) | HARD | both |
| **Відступ від тексту до кнопки на ≤991 — одне значення на весь сайт.** На кожній сторінці на 991, 768, 568, 360 для кожної кнопки в `main` — відстань від низу попереднього блока (заголовок, лід, текст) до верху кнопки. Прийняте значення — `decisions.spacing.textButton` або найчастіше на сайті; будь-яке інше — знахідка з назвою секції й кнопки. Шукати і токен, і сирі `row-gap` / `margin-top` у обгортках заголовка й копі, які токен не зачіпає, і нативні стилі платформи, прив'язані до змінної напряму (LAY-14) | HIGH | both |
| **Від планшета до мобайла лого і великі іконки трошки зменшуються.** Зчитати ширину лого в хедері / мобільному меню і розмір великих іконок (іконки карток, spot-іконки 60px+) на 1440 → 992 → 768 → 568 → 360. Якщо на 768 і 360 вони того самого розміру, що на десктопі, — знахідка. Орієнтир: лого −8–10% на ≤991 і ще раз на ≤567; іконки 68 → 60 на ≤991 → 48 на ≤767. Разом з цим перевірити, що вертикальний відступ заголовок → текст у картці на мобайлі менший за десктопний, а не такий самий (скріншоти VIS-01; рядок людини) | HIGH | both |
| **Збалансована сітка на 768 — жодної порожньої клітинки.** На кожному тирі, де сітка карток стає у 2 колонки (768 і вся смуга 568–991), рахувати картки в останньому ряду: непарна кількість лишає діру поруч з останньою карткою. Остання картка тоді йде на 100% ширини (`grid-column: 1 / -1`), а нижче, коли колонка одна, картки стоять одна під одною. Те саме для 3 колонок, де в останньому ряду 1 чи 2 картки. Перевірити кожну сітку сайту на 1280, 992, 768, 700, 568, 480 і 360, назвати сітку, кількість карток і відсоток ширини, який закриває останній ряд. Адаптив має бути збалансованим, не лише «не зламаним» (LAY-04) | HIGH | both |
| **Декоративний паттерн хіро впритул до лінії під хедером — але лише паттерн, не ілюстрація.** Паттерн, «обрізаний» верхньою лінією (лінії й доріжки виходять за край), стоїть рівно на верхній лінії сітки без зазору в кілька пікселів на всіх 7 тирах; дрібний ненульовий зазор — знахідка. **Велика самостійна ілюстрація** (замкнена схема з власною рамкою) навпаки **має спейс** від лінії зверху й знизу — притиснута до лінії вона виглядає як баг. **Кожен арт звіряється з оригінальним дизайном (білдом) окремо:** зазор, який є в дизайні, — рішення дизайну, а не знахідка; виправляється лише той елемент, на який вказав дизайнер, а не всі схожі арти. Правило дизайну: впритул стають лише зображення, у яких прямі лінії йдуть угору, і це позначається окремим модифікатором на самому елементі, а не зміною базового класу арту для всіх сторінок (скріншоти VIS-01; рядок людини) | HIGH | both |
| **Текст ніколи не заходить під ілюстрацію чи арт.** На кожному тирі (особливо 991–768, де арт ще абсолютний, а колонка тексту вже на всю ширину) виміряти правий край тексту заголовка/ліда (`Range.getClientRects()`) і лівий край арту: відстань < 24px або перекриття — знахідка. Лікується вужчою колонкою тексту на планшеті або прихованим артом, а не зменшенням шрифту (LAY-17) | HARD | both |
| **Міра заголовків і відстань до арту на планшеті й мобайлі** (practice rule, 2026-09-14). На 991, 768, 700, 568, 480, 360 для кожного `h1`/`h2` у `main` з `max-width`: якщо клон на повну ширину колонки займає **менше рядків**, а оригінал заповнює **< 60%** колонки — знахідка «вузька міра», з класом, тиром, кількістю рядків і відсотком. **≤767 заголовки секцій — `max-width: none` (100%)**; на 768–991 — ширина, за якої заголовок стає в 1–2 рівні рядки (`text-wrap: balance`). Хіро-текст поруч з артом на 768–991: відстань від найдовшого рядка до арту **≥ 60px** (менше — ❓ LAY-17); менше — лід коротший на цьому тирі, не менший шрифт. Перевіряти **на кожному записі CMS-шаблону**. Міра заголовка інструментом не міряється — рядок людини за скріншотами VIS-01, з цими числами | HARD | both |
| **Болд у Rich Text виглядає як болд у дизайні.** Webflow Rich Text віддає `<strong>`/`<em>`, а білд часто стилізує `<b>`/`<i>` — правило `.x b{color:ink}` не ловить `strong`, і болд лишається сірим. Зчитати колір і вагу кожного `strong`/`b` у `main` і порівняти з білдом (VIS-01) | HIGH | both |
| **Жодного `<br>` всередині речення — ніде.** Ні в заголовку, ні в ліді, ні в абзаці, ні в кнопці, ні «лише в статичному H1». Сама наявність — знахідка, статус 🔴 незалежно від того, як воно виглядає на 1440: розрив не знає про ширину, і тир, де він лягає погано (розрізана фраза на 1280, одне слово на рядку на 768), називається як доказ, а не як умова. Це не про платформу — Webflow (Shift+Enter) і Gutenberg відтворюють `<br>` точно, саме тому він і доїжджає до продакшену. Перелічити всі зі знаменником: «`<br>` у розмітці: 6, у реченнях: 6» — хук гайду (TEXT-01) | HARD | both |
| **`<br>` у тексті, який приходить із поля, — окремим рядком.** Та сама заборона, інша ціна: заголовок із колекції не має де його нести, а клієнт, редагуючи поле, його знесе або розмножить — цей рядок каже, що дефект у даних, а не в шаблоні (TEXT-01) | HARD | both |
| **Жодного подвійного `<br>`.** Два розриви поспіль — це відступ, зроблений не тим інструментом: його не знайти в стилях, не перевизначити й не зробити адаптивним — хук гайду (TEXT-01) | HARD | both |
| **Раг тримається на мірі, а не на розриві.** У блоку display-тексту є `max-width` по тирах; якщо його немає, а рядки лягають «правильно» лише завдяки `<br>` чи `span{display:block}`, це знахідка навіть коли на всіх тирах виглядає добре: наступна правка копії зламає його. У колонці фіксу — драбина гайду: міра → `text-wrap` → копі → `span{display:block}` з `inline` на тирах | MED | 1 |

**Чому це окремі рядки, а не частина перевірки на обрізаний текст.** Обрізання видно на
скріні. `<br>` — ні: сторінка виглядає цілою, просто речення розірване не там. **Тому спочатку
`grep '<br>'` по всій розмітці — це і є перевірка**; очі потім, щоб назвати тир, де кожен із них
лягає погано. Прогін, який не показав кількість `<br>` у розмітці, цей рядок не виконав.

**І це причина шукати братів.** Розриви ставлять пачками — хтось пройшовся по головній
на 1440 і поставив їх усі. Знайшовши один поганий, перевірити всі й видати списком із
знаменником.

**І одна заміна, яка гірша за саму проблему.** Заголовок, розбитий на **два елементи**
заради переносу — два заголовки поспіль або заголовок і текстовий блок під ним. Це те, до
чого приходять, коли вже знають, що `<br>` заборонений. **Розрив при цьому такий самий
жорсткий**, а зверху з'являється другий заголовок — а якщо це хіро, то другий `<h1>`, що вже
є HARD-рядком у §17.

| Перевірка | P | Stage |
|---|---|---|
| **Жоден заголовок не розбитий на два елементи заради переносу.** Два заголовки поспіль, що читаються як одне речення, або заголовок із текстовим блоком-продовженням (A11Y-06, VIS-01) | HIGH | both |
| **Розрив через `span { display: block }` має поводитись по-різному на тирах.** Це правильний спосіб — але сам по собі він такий самий жорсткий, як `<br>`. Перевірити, чи він перемикається в `inline` там, де перестає бути доречним | MED | both |

**Кількість рядків у заголовку сама по собі не є знахідкою.** Ні 🔴, ні 🟡, ні ❓. Правило скіла про
банер — це **заборона обрізання**, а не вимога двох рядків: у його ж тілі сказано, що повне речення
завжди перемагає преференцію двох рядків. Хіро-H1 на три рядки на всіх десктопних тирах — це рішення
дизайну. Звітувати треба обрізання, `<br>` і заголовок, розбитий на два елементи, тобто те, що вище в
цьому розділі. Рядок «заголовок на 2 рядки» у звіті — ознака, що перевірку зроблено із назви правила,
не прочитавши його тіла.


<!-- merged 2026-11-05 from the 2026-10-19 branch of this skill -->

### Тири й вікна заміру


| Тир | Діапазон | Замір | Напрямок |
|---|---|---|---|
| **XXL** | 1920+ | **1920**×1080 | ↑ up |
| **XL** | 1440–1919 | **1440**×900 | ↑ up |
| **Large** | 1280–1439 | **1280**×800 | ↑ up |
| **Base** | 992–1279 | **992**×800 | базові стилі |
| **Medium** (планшет) | 768–991 | **768**×1024 | ↓ down |
| **Small** | 568–767 | **568**×800 | ↓ down |
| **Tiny** | 360–567 | **360**×800 | ↓ down |
