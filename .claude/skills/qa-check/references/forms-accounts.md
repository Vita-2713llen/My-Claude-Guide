<!-- qa-check reference · форми обох стадій, реєстрація, логін, кабінет · вантажити за потреби, правила тут рівно ті самі -->

## 12. Forms — both stages, and stage 1 is not optional

**Deferring the whole form to stage 2 is how a dead input ships.** Sending needs a
backend; the form as an object does not, and most of what goes wrong with a form
is visible long before it is wired up. Every form on the page is worked at stage 1
— the footer subscribe field as much as the contact form.

Instruments: FORM-01…07, FORM-10…13, FORM-15, A11Y-09 (`qa-run`; FORM-06 and A11Y-09
only with `--form-errors`, which the person allows in the dialog of this run), FORM-08/09
(mail settings: wp-admin audit on WordPress, the connection or a person on Webflow, the
backend owner elsewhere), FORM-14 (one real test submission — a person, with permission).
**The agent never submits a filled form and never types a password** (SKILL.md, «Безпека
прогону»).

**Stage 1 — the form as an object:**

| Check | P |
|---|---|
| Click into **every** field and type. `pointer-events: none`, a covering overlay, a stray `readonly` or `disabled` — all of them look like a normal field until you try (FORM-01, FORM-11) | HARD |
| The form has somewhere to go: an `action`, a handler, or a platform binding — not an empty `<form>` (FORM-12) | HARD |
| Every field has a real label (placeholder-only → ❓), and the right `type` (`email`, `tel`, `number`) so mobile shows the right keyboard (FORM-01, FORM-12) | HIGH |
| **Плейсхолдер у `select` виглядає так само, як у текстових полях.** Порожній `select` («Select an inquiry type») має той самий колір, прозорість, шрифт і розмір, що й `::placeholder` сусідніх `input` / `textarea` (FORM-13) | HIGH |
| **Кнопка сабміту на сайті = кнопка в дизайні, і на завантаженні не блимає.** Порівняти обчислені фон, колір тексту, бордер, висоту з білдом. Webflow з антиспамом (Turnstile) вимикає кнопку (`disabled` + `w-form-loading`) до завантаження захисту: стан завантаження має виглядати як звичайна кнопка — без сірого фону, прозорості й анімованого переходу (FORM-13 міряє «не `disabled` у спокої» і вигляд; кадри перших секунд — скріншоти для людини) | HARD |
| Required fields are marked in the markup, not only visually (FORM-02) | HIGH |
| **⛔ Обовʼязкові поля позначені візуально — HARD (practice rule, 2026-10-05).** Якщо у формі **змішані** обовʼязкові й необовʼязкові поля, кожне обовʼязкове несе видиму позначку — `*` у лейблі або «(required)» — і де є `*`, там є легенда «* required». Перевіряти механічно: зібрати всі поля форми, зіставити `required`/`aria-required` з видимим текстом лейбла; поле з `required` без позначки — 🔴. Якщо обовʼязкові **всі** поля, достатньо одного напису над формою. **Відсутність позначок при змішаних полях — баг, а не пропозиція і не ❓ до дизайну:** людина не має дізнаватися про обовʼязковість з помилки після відправки. Якщо макет її не має — у звіті 🔴 з приміткою «немає в макеті», і рядок у розділ 4 handoff (FORM-02) | HARD |
| **Доставка листа — через той шлях, який QA реально змінить (practice rule, 2026-09-16).** Webflow: у форми може бути власний override отримувачів (Designer → форма → Settings → Email Notifications), і він перебиває Site settings → Forms → Default notifications. Тоді заміна адреси в Site settings нічого не дає, і лист «не приходить». До handoff відкрити налаштування саме цієї форми, записати, чи є override і кому він шле, і в рядку handoff написати, **де саме** QA міняє адресу. Відправник `no-reply@webforms.io` — попросити перевірити спам. Реальний випадок: QA двічі не отримав лист — причина не встановлена, перевіряти override першим (FORM-08) | HARD |
| **Антиспам на кожній формі увімкнений і реально стоїть на опублікованій формі.** Webflow: у `<form>` є `data-turnstile-sitekey` (Cloudflare Turnstile, Site settings → Forms → spam protection), кнопка до завантаження захисту має `disabled` + `w-form-loading`. WordPress: reCAPTCHA / Turnstile / honeypot у плагіні форм. Форма без жодного захисту — знахідка (FORM-04) | HARD |
| **Кожне поле форми обмежене так, як задумано, — поле за полем, не вибірково.** (1) `required` на кожному полі, яке дизайн вважає обов'язковим; (2) `maxlength` на кожному текстовому полі в межах `decisions.fieldMaxLength` (типово 255 для `input`, 5000 для `textarea`) — без ліміту бот заливає мегабайти; (3) email — `type="email"`; (4) `select` — `required` з першою порожньою опцією `value=""`, щоб «не вибрано» не проходило; (5) `autocomplete` на полях імені, організації, email; (6) у кожного поля осмислений опублікований `name` / `data-name`, а не `Field` / `Field 2`. **Webflow не пускає зарезервоване `name`** — поле з назвою «Name» публікується як `name="field"` і приходить у заявках як «Field». Перейменування через Data API до опублікованої форми **не доходить** — поле лишається `field` після кількох публікацій; запропонований фікс — перестворити поле з осмисленим `name` і тими самими атрибутами, або перейменувати в панелі Designer (після дозволу). Атрибути читаються з опублікованого HTML, не з Designer; таблицю поле → required → maxlength → type → name дає FORM-12 (а `autocomplete` — FORM-03) | HARD |
| **Обмеження працюють, а не лише стоять у розмітці:** порожня відправка блокується з повідомленням на першому порожньому полі; `test@` не проходить як email; текст довший за `maxlength` не вводиться; `select` без вибору не відправляється (FORM-12; порожня відправка — FORM-06 з `--form-errors`). Справжню тестову відправку робить людина, з дозволу (FORM-14); агент — лише порожню | HIGH |
| Tab order runs through the form in the order it is read (FORM-13) | HIGH |
| The submit control is a real submit, and it is not `disabled` by default (FORM-13) | HIGH |
| Fields, checkboxes and radios are visible, distinguishable and large enough to hit (A11Y-05) | MED |

**Stage 2 — the form as a mechanism.** Rows that need a real submission (two
emails, spam, success, the recipient's inbox) are closed by the agent only from the
configuration (FORM-08/09, settings read-only); the submission itself is FORM-14 —
a person, with permission, recorded per form with `record.cjs --id FORM-14`, never
under FORM-09:

| Check | P | Stage |
|---|---|---|
| Two emails: one to the person who filled the form, one to the administrator (FORM-08, FORM-14) | HARD | 2 |
| The form reaches the admin/owner address, and it is the client's, not a test one (FORM-08, FORM-14) | HARD | 2 |
| The email does not land in spam (FORM-14) | HARD | 2 |
| A "Thank you" / success state after submitting (FORM-14; WF-03 — not the default text) | HARD | 2 |
| The correct form is used, not a clone left from the dev site (DONOR-01, WF-02) | HIGH | 2 |
| No `[your-subject]` in the subject line (FORM-09) | HIGH | 2 |
| The email carries every field label with its value (FORM-09) | HIGH | 2 |
| Required fields marked, and flagged on an empty submit (FORM-02, FORM-06) | HIGH | 2 |
| Email format validation, with a message that explains the problem (FORM-12) | HIGH | 2 |
| Forms work on mobile (FORM-01, FORM-15, IOS-04) | HIGH | both |
| Dropdowns, radios and checkboxes carry the right options and are clickable (FORM-01) | HIGH | both |
| Phone accepts digits only; max length does not truncate; special characters handled (FORM-05, FORM-12) | MED | 2 |
| Attached-file format checked (FEAT-03, person); calendars load and allow a date (FORM-05, FORM-11) | MED | 2 |
| Response-email structure set up regardless of the admin checkbox (FORM-09) | MED | 2 |
| Links inside the admin and user emails work (FORM-14) | MED | 2 |
| Negative numbers refused in numeric fields; amounts in currency format (FORM-05) | LOW | 2 |

## 14. Registration, login and the user account

**Runs only where the site actually has registration or login** — a sign-up form,
a login form, a members area, a `/my-account` page. On a brochure site this whole
section is skipped, and the skip is named: *"реєстрації на сайті немає — 52
перевірки не запускались"*. It is by far the largest block, so getting the gate
right is what keeps a run short.

**Almost all of it is stage 2.** An account system cannot be exercised without a
backend. Stage 1 sees the forms as objects, and nothing else.

**⛔ The agent types no password, creates no account and never logs in as a user**
(SKILL.md, «Безпека прогону»). Stage 1 below — the forms as objects — is the agent's.
Every stage-2 row is **ACC-01**: a person with test accounts runs it and records the
result per section with `record.cjs --id ACC-01`; until then it is a handoff row.

### The registration form — stage 1

| Перевірка | P |
|---|---|
| Поля точно ті, що в дизайні — ні зайвих, ні відсутніх (ACC-01) | HARD |
| Кожне поле має свій `type` (`email`, `tel`, `password`, `date`) — від цього залежить клавіатура на телефоні і маскування пароля (ACC-01) | HARD |
| Пароль у полі маскується (ACC-01) | HARD |
| Обов'язкові поля позначені зірочкою і в розмітці, не тільки візуально (ACC-01) | HIGH |
| Плейсхолдери є і зникають при фокусі або заповненні (ACC-01) | MED |
| Tab проходить форму в тому порядку, в якому вона читається; Enter надсилає (ACC-01) | HIGH |
| «Terms and conditions» знято за замовчуванням, якщо бізнес-логіка не каже інакше (ACC-01) | HIGH |

### The registration form — stage 2

| Перевірка | P |
|---|---|
| Заповнена форма створює запис; неповна — не створює (ACC-01) | HARD |
| Порожні обов'язкові поля дають повідомлення валідації, а не мовчазний провал (ACC-01) | HARD |
| Самі пробіли в обов'язковому полі — теж помилка, а не валідне значення (ACC-01) | HIGH |
| Пробіли на початку й у кінці обрізаються перед відправкою (ACC-01) | MED |
| Неправильна пошта відхиляється з поясненням (ACC-01) | HIGH |
| Існуючий логін відхиляється з поясненням (ACC-01) | HIGH |
| Логін не чутливий до регістру — `john` і `JOHN` це одна людина (ACC-01) | HIGH |
| Обмеження довжини й дозволених символів у логіні та паролі — за вимогами (ACC-01) | MED |
| Пароль і підтвердження мають збігатися (ACC-01) | HARD |
| Дата народження не приймає майбутнє; вікове обмеження, якщо воно є (ACC-01) | MED |
| Числові поля відхиляють літери (ACC-01) | MED |
| Необов'язкові поля можна лишити порожніми без помилки (ACC-01) | MED |

### Login — stage 2

| Перевірка | P |
|---|---|
| Правильні дані пускають (ACC-01) | HARD |
| Неправильний логін, неправильний пароль, обидва неправильні, порожні — не пускають, і повідомлення однакове для всіх чотирьох (ACC-01) | HARD |
| Неактивний акаунт не пускає (ACC-01) | HIGH |
| Є ліміт невдалих спроб (ACC-01) | HIGH |
| Після входу — на потрібну сторінку; після виходу — на вхід або головну (ACC-01) | HIGH |
| «Forgot password» і «Create an account» ведуть куди належить (ACC-01) | HIGH |
| «Remember password» знято за замовчуванням, якщо бізнес-логіка не каже інакше (ACC-01) | MED |

**Повідомлення про помилку входу однакове в усіх випадках** — і це не дрібниця
формулювання. «Такого користувача немає» проти «невірний пароль» повідомляє
атакуючому, які логіни існують.

### Session and security — stage 2

| Перевірка | P |
|---|---|
| Кнопка «назад» після виходу не повертає в залогінений стан (ACC-01) | HARD |
| Кнопка «назад» після входу не показує сторінку виходу (ACC-01) | HIGH |
| Стан входу після закриття й повторного відкриття браузера поводиться так, як задумано (ACC-01) | MED |
| У вихідному коді сторінки входу немає нічого службового — ні підказок, ні коментарів, ні прихованих полів із даними (ACC-01) | HARD |
| Скопійований із поля пароль не читається у відкритому вигляді (ACC-01) | MED |
| Видалення кукі не лишає сторінку в напівзалогіненому стані (ACC-01) | LOW |

### Password change and recovery — stage 2

| Перевірка | P |
|---|---|
| Відновлення пароля працює наскрізь: лист приходить, посилання діє, новий пароль встановлюється (ACC-01) | HARD |
| Після зміни новий пароль пускає, а старий — ні (ACC-01) | HARD |
| Пробіли перед паролем не приймаються (ACC-01) | LOW |

### Email confirmation and data — stage 2

| Перевірка | P |
|---|---|
| Пошта — обов'язкова частина профілю (ACC-01) | HIGH |
| Лист-підтвердження реєстрації приходить (ACC-01) | HARD |
| Дані користувача зберігаються в базі (ACC-01) | HIGH |
| Користувач бачить і редагує свої дані в акаунті (ACC-01) | HIGH |
| Доступ до записів і типів записів лише той, на який є права — і це перевіряється з-під звичайного користувача, не з-під адміна (ACC-01) | HARD |

**The last row is the one that is faked most often.** Checked while logged in as
an administrator, every permission looks correct. Log out, log in as an ordinary
user, and try to reach something that is not theirs.

<!-- merged 2026-11-05 from the 2026-10-19 branch of this skill -->
### ⛔ Що сайт віддає незнайомцю — stage 2, HARD

**Є скрипт: `scripts/leaks.cjs`.** Девʼять поверхонь, без браузера, з контрольним заміром і
другим проходом із `COOKIE=`. Цілі — у `qa-target.json → restricted`. Не писати свій замір.

Попередній рядок перевіряє **сторінки**. Ті самі записи роздають механізми, які
сторінок не відкривають, і закритий сайт тече саме через них. Перевіряти
**розлогіненим**, по адресах, а не читанням коду.

| Перевірка | P |
|---|---|
| Пошук сайту за словом, яке несуть лише закриті записи, не показує жодного з них | HARD |
| `/wp-json/wp/v2/<тип>?search=…` не повертає закритих записів | HARD |
| `/wp-json/wp/v2/<тип>/<id закритого>` відповідає 404, а не вмістом | HARD |
| `/wp-json/wp/v2/search?search=…` їх не містить | HARD |
| `/feed/` їх не містить | HIGH |
| Сайтмап — і ядра, і SEO-плагіна — їх не перелічує | HIGH |
| `/wp-json/wp/v2/users` не віддає список акаунтів зі слугами | HIGH |
| Непублічні типи записів не відповідають по REST | HIGH |
| **Файл із закритого запису за прямою адресою в `uploads/` не відкривається** | HARD |

**Останній рядок — найчастіший і найдорожчий.** Сторінку закривають, а файл на ній
лишається у `wp-content/uploads/`, звідки сервер віддає його будь-кому з адресою.
Це стосується не лише членських сайтів: будь-який PDF за формою, і насамперед усе,
що приїхало зі старого сайту при імпорті — дерево тек приїжджає цілим, і на
більшість файлів у ньому ніщо не посилається.

Беремо **один** файл, на який посилається закритий запис, і відкриваємо його без
сесії. Якщо він приходить — обмеження декоративне, і це 🔴 незалежно від того, як
добре закрита сторінка.

*Один прогін: усі сторінки зі списками документів закриті, і 580 документів із них
віддавались по 200 — плюс повна друга копія того самого дерева в `uploads/backup/`,
на яку не посилалось ніщо.*
