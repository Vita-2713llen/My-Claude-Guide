<!-- qa-check reference · хедер, меню, дропдауни, анімації появи й ховер · вантажити за потреби, правила тут рівно ті самі -->

## 9. Navigation and header

| Check | P | Stage |
|---|---|---|
| Main menu works and shows the items placed in it (NAV-12, LINK-07) | HARD | both |
| Every button, field and control works (LINK-13, FORM-01, INT-01) | HARD | both |
| No `href="#"` — a menu item with no page yet points at a real empty page (LINK-01) | HIGH | both |
| Header never breaks from the widest tier down to 360: one row, no wrapped label, no overlap, no link hidden without a burger (NAV-10); the burger width is a recorded decision, not a fixed 768 | HARD | both |
| **Хедер для скрінрідера — механічно, у Chromium і WebKit (practice rule, 2026-09-16).** На 1440 і 360: `navigation` з назвою (`aria-label`); на 360 — `button` бургера з назвою і `aria-expanded`, що перемикається; після відкриття фокус переходить у панель; панель — `role="dialog"` + `aria-modal="true"` або решта сторінки `inert`; кнопка закриття в панелі з назвою. Дропдаун десктопу відкривається з клавіатури (Enter/Space), закривається Escape, пункти в дереві, поки він відкритий (A11Y-02, A11Y-10). Кожен пропуск — HARD. Живий прохід VoiceOver — обовʼязковий рядок handoff (IOS-07). Урок одного прогону: дерево Chrome було чисте, а QA з VoiceOver почув, що меню «не оголошується» — у `nav` не було назви, фокус лишався на бургері, панель була без `aria-modal` | HARD | both |
| Burger opens and closes the way the designer specified (NAV-02, VIS-01) | HIGH `M` | both |
| Mobile bar: logo left, burger right — unless the design says otherwise (VIS-01) | HIGH | both |
| The submenu has its own designed style (VIS-01) | HIGH | both |
| A full-height menu takes full height at every resolution | MED | both |
| **Відкрита панель бургера відділена від сторінки** — тінь або обведення по краю, як у дизайні (VIS-01) | HIGH | both |
| **Сторінка за відкритим меню не скролиться**; після закриття скрол повертається (NAV-09) | HARD | both |
| **Блокування скролу нічого не зсуває** — зняти позицію лого по x до відкриття і після, вона не має змінитись ні на піксель (NAV-08) | HIGH | both |
| Відкрити й закрити двічі — макет у спокої той самий, що на початку; нічого не стрибає (NAV-02, NAV-08) | HIGH | both |
| Усередині панелі лого, хрестик і пункти меню на одних краях — по 15px контейнера; лого центроване на хрестику по вертикалі (VIS-01) | HIGH | both |
| **Лого центроване по вертикалі в смузі хедера**: відстань над його боксом і під ним однакова, на кожному тирі. Якщо хедер має стан після скролу — там теж (VIS-01) | HIGH | both |
| **На лого немає зсувів**: жодних відʼємних margin, жодного асиметричного падінга «для оптики». Оптична компенсація належить viewBox самої SVG, не макету (VIS-01) | HIGH | 1 |
| **Ліве ребро лого = падінг контейнера**, і дзеркальне до правого ребра бургера. Зняти обидва числа **на кожному тирі** — на мобільному дефект найпомітніший. Типова причина: відʼємний `margin-left` на бренді заради «оптичного вирівнювання» (LAY-13) | HIGH | both |
| **У сторінки одне ліве ребро**: лого, контент кожної секції та футер мають однаковий x на кожному тирі. Виміряти найлівіший контент по секціях і назвати ту, що вибивається, з обома числами (LAY-13) | HIGH | both |
| **Стрілка дропдауна повертається на ховер**, не лише на відкриття, тими самими 350ms (NAV-01, INT-06) | HIGH | both |
| **Бургер і хрестик однієї товщини лінії** — смужки бургера (висота div або stroke) і хрестик у відкритій панелі мають однакову рендерну товщину, як і шеврони поруч. Міряти `stroke-width × рендер/viewBox`, не атрибут; на 1440 і на 360. Розбіжність >0.25px — знахідка з обома числами (див. §3, Icon line weight) (NAV-07, LAY-15) | HIGH | both |
| **⛔ Увесь рядок пункту з підменю розгортає підменю**, не лише іконка. Назва, порожнє місце і шеврон — одна хіт-зона на всю ширину й висоту рядка. Клік по назві не веде на іншу сторінку і не закриває меню. Хіт-зона 44×44 на іконці при неклікабельній назві — знахідка. Так само для дропдаунів, акордеонів і FAQ (NAV-13) | HARD | both |
| **Підменю в бургері має ті самі пункти, що десктопний дропдаун**, включно з посиланням на батьківську сторінку (напр. «Усі послуги»). Коли назва рядка стала тоглом, це посилання всередині підменю обов'язкове — інакше на батьківську сторінку з мобільного меню не потрапити. Списки десктоп ↔ бургер порівнюються за текстом і `href` (NAV-12) | HARD | both |
| **⛔ Лого в хедері, футері й відкритій панелі бургера — завжди лінк на головну.** Кожне зображення чи SVG логотипу загорнуте в `<a href>`, що веде на головну (WordPress — `home_url`; Webflow — Link типу Page → Home, не `#` і не вписаний шлях; статика — `/` або `index.html`), з доступною назвою («<назва компанії> — home»). На кожній сторінці: логотипи в хедері, футері й відкритій панелі бургера; лого без лінка, лінк на іншу сторінку чи `#` — знахідка з готовим фіксом ⚡ (NAV-11) | HARD | both |
| **⛔ Уся площа кожного розгортуваного елемента його розгортає — механічно, на кожному прогоні** (practice rule, 2026-09-14). Діє для рядка підменю в бургері, десктопного дропдауна, FAQ, акордеона, табів. **Бургер-рядок (NAV-13):** на тирах із бургером у Chromium, WebKit (справжній тап) і Firefox — **шість точок**: центр назви, порожнє місце між назвою і шевроном, шеврон, лівий верхній кут рядка, низ рядка, правий край; плюс Enter і Space з фокусу. Спершу точка має належати самому рядку (інакше щось його перекриває), потім **кожен тап перемикає `aria-expanded`** і висоту підменю, сторінка не переходить на іншу адресу, меню не закривається. **Десктопний дропдаун (NAV-01):** вказівник у кілька точок пункту — панель відкривається з кожної. **FAQ/акордеон (NAV-13, INT-01):** клік у назву, у порожнє місце рядка й в іконку. Будь-яка точка, що не перемикає, — HARD з назвою точки, тиру й рушія. Покриття: Chromium — кожна ширина взаємодій нижче 992; WebKit і Firefox — 360 (додаткові тири бургера — `interactWidths`) | HARD | both |

### Відкрита панель бургера — це окремий екран, а не список посилань

**Панель перевіряється у відкритому стані, і кожен блок цього файлу до неї
застосовується** — контроли, зони натискання, відступи, контраст, ховери, сім
тірів. Закрита панель є в DOM і не виміряна жодною перевіркою, що обходить
видимі елементи: `offsetParent` у неї `null`, висоти нульові, `display` — `none`.
Тому рядки нижче знімаються **після** кліку на бургер, а не до нього.

**І найперше — порахувати.** Кількість видимих посилань у відкритій панелі проти
кількості пунктів верхнього рівня в десктопному меню. Шість проти шести — панель
у порядку. **Тридцять чотири проти шести означає, що всі підменю розкриті**, і це
один вимір, який ловить найчастіший дефект цього блоку за секунду.

| Check | P | Stage |
|---|---|---|
| **Підменю в панелі закриті за замовчуванням.** Одразу після відкриття зняти `display` кожного дропдауна в панелі — усі мають бути `none`. Розкритий дропдаун у мобільній панелі — це дефект, а не стан, навіть якщо панель через нього скролиться «нормально» (NAV-03) | HARD | both |
| **Кількість посилань у панелі = кількість пунктів верхнього рівня.** Числа назвати обидва. Розбіжність означає розкриті підменю або пункт, що загубився (NAV-03) | HARD | both |
| **Кожен батьківський рядок щось робить.** Тапнути кожен: підменю має розкритись. Батько-`<button>` без обробника виглядає точно як робочий і не робить нічого — його не видно ні в розмітці, ні в стилях (NAV-13) | HARD | both |
| **Шеврон означає стан, і стан змінюється.** Мітка з шевроном, що нічого не перемикає, бреше про наявність акордеона. Зняти `transform` до і після тапу: `none` → `rotate(180deg)` (INT-01) | HIGH | both |
| **Один відкритий розділ за раз** — якщо дизайн не каже інакше. Відкрити другий і перевірити, що перший закрився | MED | both |
| **Панель вміщається в екран; якщо ні — скролиться вона, а не сторінка.** Зняти `scrollHeight` панелі проти висоти вікна, і `overscroll-behavior` — скрол панелі не має ланцюгом іти на заблоковану сторінку (NAV-15; вкладений скрол у панелі — NAV-05) | HARD | both |
| **Кнопки в панелі видимі завжди.** Розкрити найбільше підменю і перевірити, що обидві CTA лишаються на екрані без догортування до кінця списку. Практично це `position:sticky;bottom:0` на їхньому контейнері (NAV-04) | HARD | both |
| **Кнопки в панелі виглядають як кнопки.** Зняти `background`, `border`, `border-radius`, `padding` і `font-weight` на кожній і звірити з тією ж `.btn` у хедері. Це той дефект, який не видно в розмітці: клас на місці, а правило меню його перебиває (NAV-14) | HARD | both |
| **Зони натискання ≥44×44** — сам бургер, кожен рядок, кожен рядок підменю. Бургер із 22px шириною смужок дає зону 22px, якщо на ньому немає падінга (A11Y-05 міряє мінімум WCAG 24×24; 44×44 — ціль) | HIGH | both |
| **Висота рядків у панелі однакова.** `<button>` і `<a>` беруть різний `normal` line-height — батьківський рядок на 3px нижчий за сусідні є завжди, коли мітку зробили кнопкою (NAV-06) | HIGH | both |
| **Рядки відділені один від одного і від смуги хедера**, як у дизайні. Без розділювача під хедером панель читається як продовження сторінки, а не як своя поверхня (NAV-06, VIS-01) | HIGH | both |
| **Escape закриває панель** і повертає фокус на бургер; **клік поза панеллю закриває** її і знімає блокування скролу (NAV-02, NAV-14) | HIGH | both |
| **`aria-expanded` і `aria-controls` на бургері та на кожному батьківському рядку**, і значення змінюється разом зі станом. Вище брейкпойнта, де дропдауни живуть на ховері, `aria-expanded` знімається (A11Y-10) | HIGH | 1 |
| **Ресайз за брейкпойнт із відкритою панеллю** не лишає сторінку заблокованою: панель закривається, `overflow` і компенсація скролбара знімаються (NAV-14) | HIGH | both |
| **Після закриття підменю скинуті** — відкрити панель, розкрити розділ, закрити панель, відкрити знову: розділ має бути закритий | MED | both |
| **Панель знімається на кожному тирі з бургером і на краях смуг** (768, 767, 640, 568, 360), не лише на 768 і 360. Брейкпойнт панелі рідко збігається з тим, який шукають — він береться з CSS проєкту (NAV-03, NAV-13) | HIGH | both |

**Заморожені кадри цю панель ламають найсильніше.** `max-height` з переходом
означає, що `getComputedStyle` у превʼю з мертвим rAF віддасть `0px` на відкритій
панелі і `none` на шевроні, що вже повернувся. Тому кожен прохід по панелі
закінчується **скріншотом відкритого стану** — і з розкритим підменю теж. Обидві
регресії, знайдені так у реальному прогоні, були невидимі для знятих значень і очевидні
на першому скріншоті (`qa-out/shots/burger/`).


## 11. Animation and hover

**Animations are never judged from the source. Open the page in a browser and set
them off.** Declared durations and easing tell you what was intended; only running
them tells you what happens. Every defect in this section — a reveal that never
fires, a hover that does nothing, a tween frozen halfway — is invisible in CSS and
obvious in a browser.

### Before trusting a single animation reading, check the frame loop

A hidden or backgrounded pane freezes `requestAnimationFrame` — browsers stop
giving frames to a page nobody is looking at — and then **every** tween sits
partway through. It looks exactly like a page full of broken animations, and it is
not.

Count frames for one second. Zero or near-zero means the environment is dead, not
the page: report nothing from it.

**Then fix the environment yourself, in this order — do not jump to the last step,
and do not ask the designer to do any of it.** The browser pane belongs to the
run; fronting a tab is a tool call, not a favour to request.

1. **Read the pane's own state** — the tab listing says whether it is displayed or
   hidden. Hidden is the usual answer, and it is the whole problem.
2. **Front the tab** and count frames again. In most cases they resume immediately
   and the section runs normally — this is the fix, and it costs one call.
3. **Reload with the tab fronted**, so anything that runs on load fires while the
   frames are flowing rather than while they were stopped.
4. **Only then** a real Chrome tab through the extension, if it is connected.
5. **Only if all of that fails** does the section go to ⚠️ Не вдалося перевірити,
   with the frame count in the row — never to ✅.

A run that reports animations as unverifiable **without having fronted the pane**
has skipped the cheap fix and reported a limitation it created itself.

**The designer is asked for nothing here.** "Open the preview pane so I can see it"
is not a question worth their time — front it, reload it, and only if the frames
still refuse to run does the row become ⚠️, saying what was already tried.

### Set off every trigger, by kind

- **On load** — reload and watch. Above-the-fold elements must finish, not begin.
- **On scroll** — scroll with **real wheel events**, not `scrollTo`. Programmatic
  jumps skip the thresholds an observer is waiting for and produce false
  failures. Go **down and back up**, and then **a second time**: an animation that
  fires once and never again is the common failure, and one pass cannot see it.
- **On hover** — move the pointer onto the element, **wait for the transition to
  finish**, read the computed value, move away, read it again. A screenshot taken
  mid-transition proves nothing, and a hover read without waiting reports the
  resting state every time.
- **On click** — open and close: dropdowns, accordions, tabs, modals, the burger.
  Each one separately.
- **On focus** — tab to anything interactive and confirm the focus state exists
  and is visible.

### Read three values, not one

At rest · at the midpoint · at the end. A tween that starts and never arrives is
the defect people describe as "the section is invisible" — it is sitting at
`opacity: 0.38` because something stopped it, and only the end value shows that.

**Nothing may remain at its start value.** An element still at `opacity: 0` or
`translateY(40px)` after its animation should have run is a HARD finding, not a
timing quirk.

| Check | P | Stage |
|---|---|---|
| Every animation the design has is present and reaches its end state (INT-11) | HARD | both |
| Nothing is left standing at an animation's start value (INT-08) | HARD | both |
| **Порядок появи: спершу банер, потім наступна секція.** Від завантаження знімати прозорість: момент, коли заголовок банера (H1) починає з'являтися, і момент, коли з'являється перший елемент другої секції, що вже видимий у першому вʼюпорті. Друга секція, яка стартує раніше за H1 (типово: scroll-reveal спрацьовує для всього, що вже на екрані, поки анімація завантаження банера ще в черзі), — знахідка. На кожній сторінці на 1440 і 360, включно з короткими (INT-11) | HARD | both |
| **Жодної секції чи блока без анімації появи, і жодної різкої появи** (INT-11). На 1440 і 360 від першого кадру знімається прозорість кожного видимого блока — заголовків, лідів, абзаців, пунктів списків, дітей Rich Text, карток, картинок, декоративних ліній — і те саме після прокрутки до кожної секції. **Знахідка:** (а) елемент ні разу не був прозорим, коли в білді той самий елемент анімується; (б) перехід за 1–3 кадри замість плавного (`transition: none` або `0s`); (в) блимання — видимий, зникає, з'являється знову. **Причини, що трапляються регулярно (називати в рядку):** (1) **власний `transition` елемента перебиває transition появи** — правило на кшталт `.card-list li{transition:color…}` має таку саму або вищу специфічність, ніж атрибут появи, тож `opacity` лишається без переходу і пункт «вискакує» за кадр; у `transition-property` елемента до появи немає `opacity` — знахідка; фікс — правило появи з підвищеною специфічністю, що діє лише під час появи; (2) **«рятувальний» скрипт для динамічного контенту** (вбудований сервіс, CMS, fetch), який на кожен `scroll` примусово показує все на екрані — картки заїжджають уже видимими; рятувати можна лише те, що простояло невидимим цілий тік, і теж з fade; (3) **високий блок з одним маркером появи** (темна картка з текстом, довгий список, картка з метрикою внизу, форма на 360) — поки верх проявляється, низ ще за екраном і потім заїжджає видимим; на телефоні високими стають майже всі блоки; глобальний фікс — у рушії появи: кожен контентний нащадок нижче вʼюпорта отримує власний маркер, а не латки по одному елементу; (4) **класовий стиль тримає елемент видимим ще до появи** — маркер є, але обчислена `opacity` одразу 1 (напр. стиль `:disabled` кнопки форми, поки вантажиться антиспам, сильніший за прихований стан); фікс — прихований стан з підвищеною специфічністю. Елемент, уперше спійманий посеред fade (0.75 → 1), анімується, і це не знахідка; динамічні елементи збираються постійно, а не один раз. Звіт: сторінка → секція → елемент → мінімальна прозорість / кроки / білд проти сайту | HARD | both |
| Reveal fires on scroll, both directions, twice; revealed ancestors of links end at `transform: none` and `will-change: auto` (INT-11) | HARD | 2 |
| Hover effects match the design — measured with real pointer events, not screenshots (INT-05, INT-12) | HIGH | both |
| **Тривалість ховерів — два значення на весь сайт, а не розкид.** Стандартні `350ms` на колір, фон, бордер, прозорість і дрібні трансформації; окреме значення з діапазону `500–650ms`, обране раз на проєкт, на трансформації великих медіа (зум картинки в картці). Зібрати всі `transition` зі стилів, згрупувати за тривалістю, назвати кожну, що випадає, з її селектором. **Появу (`0.8s`) і таймлайни завантаження сюди не зараховувати** — це інші хуки, і порахувати їх як ховери означає видати хибну знахідку (INT-06, `decisions.hoverMs` / `mediaHoverMs`) | HARD | both |
| **Оголошений ховер має що змінювати — на кожному елементі, де він є.** `transition: .35s` без жодної властивості, яка на ховері відрізняється, або `Button:hover` із тим самим кольором, що в бази, — це **відсутній ховер, який виглядає наявним**, і саме тому його ніхто не знаходить: у панелі стилів стан є, у зведенні «ховер є» — галочка. Зчитати обидва стани реальним вказівником і порівняти числа. Це **окрема перевірка від покриття**, і вона йде по тих елементах, які покриття вже зарахувало (INT-05) | HARD | both |
| **Ефекту, якого немає в дизайні, не має бути на сайті.** Ховер, доданий «щоб було», — така сама розбіжність із макетом, як і відсутній (INT-05, VIS-01) | HIGH | both |
| **Кожен ховер плавний — жодна властивість не перемикається за один кадр** (INT-12). Для кожного елемента з ховером: дочекатися завершення появи, навести справжній вказівник і читати обчислені `color`, `background-color`, `background-image`, `border-*-color`, `box-shadow`, `transform`, `opacity`, `fill`, `stroke`, `text-decoration-color` самого елемента, його дітей і їхніх `::before/::after`. **Знахідка:** (а) властивість перемикається без переходу; (б) **будь-яка зміна `background-image` на ховері** — картинка чи текстура не анімується в CSS взагалі й підміняється миттєво, навіть якщо колір фону плавний; фікс — окремий шар (`::before` / `::after`, `inset:0`, `z-index:-1`, `isolation:isolate` на картці), що на ховері плавно міняє `opacity`; (в) **transition, що живе лише на атрибуті появи**: після появи рантайм знімає атрибут, і ховер стає різким — transition ховеру має бути на базовому класі. У Webflow перевірити й нативний стиль `:hover`. Тільки на тирах із ховером (≥992) | HARD | both |
| **Перший ховер після оновлення сторінки не стрибає.** Після появи навести на посилання у футері, в меню, в кредиті — текст не зсувається ні на субпіксель і не «перемальовується». Типова причина: після анімації появи на предку лишається `transform: translate3d(0,0,0)` / `will-change`. Обчислений `transform` предків-лінків після появи має бути `none` (INT-11, INT-12) | HARD | both |
| **Декоративні лінії не виходять за свою секцію.** Кожна вертикальна лінія сітки закінчується на нижній межі свого шару на всіх 7 тирах. Лінія, зсунута `margin-top` із фіксованою `height: 100%`, вилазить у наступну секцію — порівняти з білдом (скріншоти VIS-01; рядок людини) | HIGH | both |
| **Секція з нижньою лінією має відступ до футера.** Якщо остання секція перед футером закінчується горизонтальною лінією, між лінією і контентом футера є відступ секції — футер не липне до лінії (LAY-11, LAY-12) | HIGH | both |
| **Кожен клікабельний елемент має ховер** — посилання, кнопки, картки, іконки, пункти меню, пагінація, таби, соцмережі. Пройти всі й перелічити ті, що не реагують (INT-05) | HARD | both |
| **⛔ Ховер заливає всю клітинку — 100% її висоти, і вся клітинка лишається клікабельною** (practice rule, 2026-09-14; INT-13). У сітці рядок розтягується під найвищу клітинку, а шар ховера часто висить на внутрішньому елементі (`<summary>`, обгортка тексту, заголовок) і має висоту свого тексту — тоді низ клітинки не підсвічується і **не реагує на клік**, що ламає й правило «вся площа розгортає». На всіх 7 тирах і кожній сторінці: шар `::before`/`::after` з `position:absolute` і `top/bottom:0`, що щось малює, має покривати всю клітинку сітки (різниця > 1.5px — знахідка); вказівник у нижніх пікселях клітинки має підсвітити шар, а клік там — перемкнути стан. Фікс — `position:static; isolation:auto` на внутрішньому елементі плюс `::after` з `inset:0` на закритому стані для зони кліку — ніколи не розтягуванням тексту | HARD | both |
| **Лого: ховер лише той, що є в дизайні** (INT-14, `decisions.logoHover`). Навести в хедері й у футері, зчитати обидва стани. **Немає — норма.** **Є в дизайні й не працює — знахідка.** **Є на сайті, а в дизайні немає — теж знахідка**: вигаданий ховер на мітці виглядає помилкою. Без записаного рішення будь-яка зміна — ❓ з обома значеннями | HIGH | both |
| **У Webflow лого — це Link Block, і платформа сама дає йому ховер із прозорістю 70–80%.** Його ніхто не додавав, тож і не шукає: зняти прозорість на ховері бренду, якщо дизайн її не вимагає. Зчитати `opacity` у спокої та на ховері — вони мають збігатися (INT-14) | HIGH | both |
| Durations, distances, delays and easing taken from the source (REF-01, INT-06) | HIGH | 1 |
| `prefers-reduced-motion` honoured (XB-07) | MED | 1 |

**At stage 2 this is re-run after caching and image optimisation are switched on.**
Deferring or combining JS, and lazy-loading images, are what break animations that
worked perfectly in the source — and the page then looks merely "plain", not
broken, so nobody reports it.
