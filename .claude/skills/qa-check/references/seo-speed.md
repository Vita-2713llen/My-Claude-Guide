<!-- qa-check reference · SEO, швидкість, Lighthouse, технічний обхід · вантажити за потреби, правила тут рівно ті самі -->

## 17. SEO, speed and the technical sweep — both stages

**The choices belong to `seo-check` and are routed to it** — the *wording* of the
meta title and description, the literary quality of alt text, the favicon set,
the design of the Open Graph image, the structured-data type (SKILL.md §23: 🔁, or a
handoff row when `seo-check` is not installed). What this skill checks itself is
that they are **present and well-formed** — SEO-01…13, IMG-01/08 — which is a
different question and a cheap one.

**Half of SEO is built into the markup and half only exists once deployed.** The
split matters: a `noindex` left in the head is found in the file in a second and
costs an indexing cycle if it is found after launch.

### Stage 1 — in the HTML, before anything is deployed

| Перевірка | P |
|---|---|
| **Немає `<meta name="robots" content="noindex">`** — залишений із розробки, це двійник галки «Discourage search engines», і він так само ховає сайт (SEO-06; на стадії 1 `staging` вважається `false`) | HARD |
| `<title>` присутній, унікальний, не порожній; довжина поза `decisions.titleLen` → ❓ (SEO-01) | HARD |
| `<meta name="description">` присутній і не порожній. **Унікальний на сторінку — на клієнтському сайті; однаковий на весь сайт — на темплейті**, де знахідкою є сторінка, що відрізняється, а не сторінка без унікального (SEO-02) | HARD |
| Рівно один `<h1>`, ієрархія заголовків без пропущених рівнів (A11Y-06) | HARD |
| `canonical` присутній і вказує на себе, а не на дев-домен чи на сусідню сторінку (SEO-03) | HARD |
| `lang`, `charset`, `viewport` на місці (I18N-01, SEO-10) | HIGH |
| Open Graph і Twitter теги присутні в **серверному** HTML (соцботи не виконують JS); рівно один абсолютний `og:image`, що віддає 200 як JPG/PNG/WebP/GIF ≥1200×627 у межах `decisions.ogImageMaxKB` (SEO-08); своє на кожну сторінку/запис (SEO-04) | HIGH |
| JSON-LD парситься як валідний JSON і має `@type` — **або його немає взагалі, якщо це темплейт для маркетплейсу** (SEO-05); FAQPage відповідає FAQ сторінки (SEO-11) | HIGH |
| Жодного захардкоженого `http://` — ні в посиланнях, ні в стилях, ні в скриптах (SEO-09) | HARD |
| Alt присутній і **непорожній** на кожному зображенні, декоративні теж — порожній `alt=""` є знахідкою; `width`/`height` на кожному `<img>` (IMG-01, IMG-02) | HARD |
| Жодного мертвого `href`: порожнього, відсутнього або `#` (LINK-01) | HARD |
| Зовнішні посилання з `rel="noopener"` (LINK-04) | HIGH |
| W3C-валідація розмітки без помилок (без ID: валідатор запускає людина → рядок handoff) | MED |
| Слаги чисті: малі літери, дефіси, без дат, без ID, без `?p=123` (SEO-13) | HIGH |

### Stage 2 — only exists on the deployed site

| Перевірка | P |
|---|---|
| **«Discourage search engines» знято** (SEO-06 через `staging: false`) | HARD |
| **⛔ Webflow Audits на кожній сторінці й кожному CMS-шаблоні** — «N issues to improve on this page» у Publish і панель Audits (WF-07, людина читає число). Кожен issue — рядок звіту з числом на сторінку і готовим фіксом ⚡ (aria-label на неописових посиланнях, alt на зображеннях, JSON-LD зі справжнього контенту); фікс — лише після дозволу, тоді число до і після (див. §21, Webflow Audits) | HARD |
| **⛔ Орфографія** — весь текст сайту (сторінки, кожен CMS-запис, alt, meta/OG, aria, sr-only, форми) прогнано через `spell.cjs` (TEXT-02, TEXT-08); кожна помилка — рядок звіту з джерелом (сторінка / CMS-запис / поле) і «було → має бути»; виправлення в CMS і білді — лише після дозволу, тоді повторний прогін = 0; власні назви й терміни — у `qa-target.json → dictionary` (див. §15) | HARD |
| **Сторінки колекцій: `og:image` і `twitter:image` беруться з поля зображення запису кодом у head шаблону** — у двох різних записів різні URL, рівно один `og:image` на сторінку, файл віддається (SEO-04, SEO-08). Одна сайтова картинка на всіх записах — знахідка. Деталі й причина — §21, SEO fields | HARD |
| **`robots.txt`, `meta robots` і `X-Robots-Tag` відповідають домену, який перевіряють** (SEO-06). Котрий це домен — каже `qa-target.json → staging`, а не вгадування за назвою. На **бойовому** домені жодне з трьох не закриває сайт — це HARD. На **стейджингу** закрито бути має — достатньо будь-якого з трьох; знахідкою є стейджинг, відкритий для індексації | HARD |
| Сайтмап знайдено (рядок `Sitemap:` у robots.txt або стандартні шляхи), віддає 200 і містить сторінки; URL з іншого хоста — знахідка (SEO-07) | HIGH `M` |
| Жодне посилання не веде на 404 — реальні HTTP-статуси, внутрішні й зовнішні (LINK-03) | HARD |
| Жодна сторінка не редиректиться на 404 (LINK-03) | HARD |
| `canonical` вказує на бойовий домен, а не на дев (SEO-03) | HARD |
| 301 для сторінок, які були в індексі й більше не мають там бути (людина зі списком старих адрес → handoff) (SEO-15) | HIGH `M` |
| Orphan-сторінок немає; якщо є — редирект на осмислену сторінку. **Крім тих, що мають існувати без посилань**: `404`, `401`, Licensing, Changelog і будь-яка сторінка, обов'язкова за вимогами маркетплейсу або за законом (`decisions.orphanAllowed`). SEO-12 дає ❓, не 🔴 | HIGH |
| Слаг читається як назва сторінки; глибина й ієрархія відповідають меню (SEO-13, TEXT-06; звірка з файлами плану сторінок — людина) | HIGH `M` |
| HSTS і базові заголовки безпеки (SEC-01) | MED `M` |

**Two of these are the same defect at two stages** — `noindex` in the markup and
the "Discourage" checkbox — and a site can carry either. Check both; passing one
proves nothing about the other.

### Speed — one instrument, stage 2 only

A number taken on a local file has no network, no cache and no compression behind
it. It is not a smaller number, it is a meaningless one.

| Перевірка | Поріг | P |
|---|---|---|
| **PERF-01** · Lighthouse (`scripts/lighthouse.cjs`) | Mobile **70+**, Desktop **90+** (`decisions.perfTargets`) | HARD |
| **⛔ Швидкість міряється на КОЖНОМУ прогоні стадій 2 і 3, і завжди числами (practice rule, 2026-10-05).** Мобайл і десктоп, головна + кожна сторінка з власною формою + по одній сторінці кожного шаблону. У манифест ідуть самі числа: score, LCP, CLS, TBT, FCP. «Швидкість прийнятна», «не встигли», «квота API» — не результат. Єдине джерело чисел — `lighthouse.cjs`, він працює на будь-якій ОС. Прогін без чисел — ⚠️ і незавершений (PERF-01) | HARD | 2 |
| Core Web Vitals (PERF-01) | LCP · CLS · **INP** — зелені на десктопі, жовті або краще на мобільному (лаб: LCP, CLS, TBT як замінник INP) | HARD |
| Вага сторінки на мобайлі ≤ `decisions.maxPageWeightMB` (PERF-02) | 3 MB | HIGH |
| Pingdom, GTmetrix — зовнішні тести чекліста компанії | Pingdom **80+** і **< 2 s**; GTmetrix **80+** | HIGH — PERF-03, рядок людини: числа записуються `record.cjs`; інструмент їх не запускає |

### ⛔ Speed is always measured, by one instrument

**The single source of PERF-01 is `node <skill>/scripts/lighthouse.cjs --out qa-out`.**
It is lab Lighthouse pinned by the skill's `package-lock.json`, strictly serial,
each page × form factor run `runs` times (3) with the median reported, on an idle
machine — the script refuses to start while any other instrument runs, and marks a
run made under CPU load as ❓ instead of 🔴. Pages: `qa-target.json → lighthouse.pages`
(alias `perfPages`) when set — so every run and every colleague measures the same
pages — else home + pages with their own form + one page per template, capped at
`lighthouse.max` (14); pages over the cap are a ❓ with their list. Lighthouse
version, browser, user agent and benchmark index go into the evidence.

**Never run Lighthouse in parallel** — a parallel run cut a home score from 76 to 43 —
and never replace it with the PageSpeed Insights API, pagespeed.web.dev, `npx
lighthouse` or a CDP run: each gives different numbers. PSI or pagespeed.web.dev may
be used only as an optional cross-check of one or two pages, recorded as a note
(`record.cjs --id PERF-01 --status ask --note "PSI …"` only if it disagrees), and
never change the status.

**If `lighthouse.cjs` cannot measure a page** (runtime error, host challenge, HTTP
error, timeout), that page × form is NOT RUN with its reason — never ✅ and never a
🔴 site bug. Re-run on an idle machine; what still has no score is routed
(`record.cjs --status routed --note "pagespeed.web.dev, who"`).

**What is measured:** the pages `lighthouse.cjs` picks (or `lighthouse.pages`),
each on mobile and on desktop. Report every score with its top two opportunities.
Anything we control is a finding with the fix named: an oversized image, a lazy LCP
image, unused JS (a library loaded with 0 references), a render-blocking stylesheet,
a font without preload.

**When the first screen fades in with JavaScript, measure what gates the start.**
Record `domContentLoadedEventStart` next to the moment the first revealed element
becomes visible. If the reveal
waits for DOMContentLoaded and parser-blocking footer scripts sit in front of it,
every one of those scripts delays FCP and LCP even though the animation itself is
fine. Find the fix in code, never by changing the animation:
- remove libraries loaded with zero references. On Webflow, GSAP (`gsap`,
  `ScrollTrigger`, `CustomEase`) loads with no interactions on the site, and only its
  GSAP switch in the site settings removes it;
- `preconnect` to every third-party script host, such as Webflow's jQuery on
  `d3e54v103j8qbb.cloudfront.net`;
- keep custom scripts small, and do not make them wait on anything they do not need.

Each proposed fix is a report row with its expected gain; after the designer
approves it, `lighthouse.cjs` measures before and after on the same pages and the
report gives the difference in milliseconds.

Report the numbers, do not block the build on them: a score is a symptom, and the
row that matters is which of them moved after the last change.

**INP, not FID** — Google retired FID in March 2024. A run that measures FID is
measuring a metric that no longer exists.

**What stage 1 can say about speed instead of a score:** page weight in bytes,
the number and size of images, whether any of them is more than 2× its box,
whether CSS and JS are minified, whether the LCP image is eager and the rest lazy.
Those are the causes the score will later report, and they are all visible in the
file.

### LightHouse — all five categories, mobile and desktop, stage 2

| Категорія | P |
|---|---|
| Performance (PERF-01) | HIGH |
| Accessibility (PERF-01) | HIGH |
| Best Practices (PERF-01) | HIGH |
| SEO (PERF-01) | HIGH |
| ~~Progressive Web App~~ — прибрана з Lighthouse 12 (2024); не шукати й не звітувати як «0» | — |

Run both profiles; a page can pass on desktop and fail on mobile, and mobile is
where the audience is. Report each score with the top two opportunities behind it
— a bare number tells nobody what to do.

### Plugins and cleanliness — WordPress, stage 2

| Перевірка | P |
|---|---|
| **Плагіни, яких вимагає стандарт команди** (SEO, редиректи, кеш, оптимізація зображень), встановлені **й налаштовані** — список задається в `qa-target.json → wp.requiredPlugins`; відсутній — 🔴 (WP-03) | HIGH |
| Кешування сторінок є — плагіном **або** кешем хостингу (видно із заголовків відповіді); оптимізація зображень є — плагіном або вже відданими WebP/AVIF. Відсутнє без рішення в `wp.requireCachePlugin` / `requireImagePlugin` — ❓ (WP-03) | HIGH |
| Немає двох плагінів, що роблять одне й те саме (два SEO-плагіни, окремий плагін редиректів поруч із SEO-плагіном, що їх уже веде) (WP-03) | HIGH |
| Дефолтний контент WordPress видалений: сторінки, записи, категорії, теги, коментарі, типи записів, стокові теми, невикористані плагіни (WP-02, WP-04) | HIGH |

HSTS is a server header. On Webflow it is handled by the platform; on a client's
hosting it may be outside our control — if it cannot be set, that is 🔑, not a
failure.

<!-- merged 2026-11-05 from the 2026-10-19 branch of this skill -->
### Redirects at a domain move — the row above, in practice

**The one-line check «301 для сторінок, які були в індексі» hides a day of work,
and it is the day the site changes domain.** Every old address — in bookmarks, in
emails, in the search index — starts arriving at the new site that morning.
Without rules they 404 and everything those pages earned in search is lost.

What a run has to establish, and in this order:

| | |
|---|---|
| **чи є список від клієнта** | майже завжди є — таблиця «стара адреса → назва сторінки». Назви це не адреси, і переклад назв в адреси і є робота |
| **чи покриває він стару сайтмапу** | взяти `/sitemap.xml` старого сайту і звірити один в один. Збіг 115 до 115 — відповідь, а не припущення |
| **що з рядками без цілі** | «404» у таблиці це рішення клієнта, а не прогалина. Але таких рядків **не видно в плагіні**, і за місяць ніхто не згадає, чому в списку 100, а в таблиці 115 — варіант завести їх правилами **410 Content Deleted** |
| **чи ціль відносна** | ⛔ дивитись **збережене значення, не екран** — див. нижче |
| **чи правила взагалі живі** | справжній запит на стару адресу, і дивитись `Location`, а не список у плагіні |

⛔ **Ціль із доменом стейджингу — дефект, і його не видно в списку.** Rank Math
при збереженні через панель розгортає `/about-us/` у
`https://staging.example.com/about-us/`. У списку виглядає нормально, а після
переїзду кожен редірект тягне людей назад на стейджинг. Перевіряти в базі або
через Edit самого правила, не по колонці «To».

⛔ **Regex у Rank Math — це заміна, а не «веди сюди».** Правило `(^|/)5782-` з
ціллю `/videos/…/` на адресу `/resources/webinars/5782-foo` дає
`http://resources/webinars/videos/…/foo` — воно підставляє ціль **замість
знайденого шматка** і лишає решту. Вираз має захоплювати весь рядок
(`^(.*/)?5782-.*$`), інакше виходить сміття. **Перевіряти живим запитом**: у
списку обидві версії виглядають однаково правильно.

**Редіректи живуть у базі, не в темі.** Деплоєм вони не їдуть. Якщо прод — не
копія стейджингу, той самий імпорт треба прогнати там, і це пункт у списку дня
переїзду разом зі скиданням кешу.

### ⛔ Кеш — перевіряти по заголовках, і це перше питання на будь-яку дивну знахідку, stage 2

На задеплоєному сайті між темою і браузером стоїть кеш, і він **перший підозрюваний
для будь-якого дефекту, якого в коді немає**. Правило: знайшли щось, чого файли не
об'являють — перевірити кеш, перш ніж писати рядок звіту.

| Перевірка | P |
|---|---|
| Та сама адреса з `?x=1` і без — верстка, CSS і скрипти однакові | HIGH |
| `X-Cache` / `Age` / `CF-Cache-Status` на головній і на одній внутрішній | MED |
| Залогінений не отримує закешовану сторінку розлогіненого (і навпаки) | HARD |
| Після релізу сайт показує нову версію без ручного скидання | HIGH |

**«Скинути кеш» і «скинути used CSS» — дві різні дії, і друга окрема в UI.**
Оптимізатори (WP Rocket, Perfmatters, LiteSpeed) тримають власний «використаний
CSS» на сторінку: вони самі вирішили, які селектори потрібні, і зберегли це. Нові
класи в тему туди не входять, і сторінка їде саме тому, що кеш «скинули» — але не
той. Сайт із такою оптимізацією треба перевіряти на **обидва** скидання, і це
окремий рядок у передачі клієнту.

*Один прогін: половина сторінок приїхала без стилів після деплою; у файлах усе було
правильно. Причина — used CSS, згенерований до релізу. `?nocache=1` рендерився
бездоганно, і це довело діагноз за одну секунду.*

### Структуровані дані описують сторінку, а не читача

| Перевірка | P |
|---|---|
| JSON-LD парситься, і `<`, `>`, `&` в ньому екрановані, а не вставлені дослівно | HIGH |
| Розмітка **побайтово однакова** для залогіненого й розлогіненого | HIGH |
| Жоден закритий блок не потрапив у FAQ / Article / Event schema | HARD |
| Один `og:image` на сторінку, і файл справді віддається | HIGH |

**Межа з `seo-check` тут та сама, що й усюди:** *який* тип схеми потрібен сторінці — його
питання (§23). Чи вона парситься, чи екранована і чи однакова для всіх читачів — дані й
звʼязування, тобто цей скіл.

Схема, зібрана з відрендереного виводу, успадковує те, що бачить **поточний**
читач. Від пошукових систем це ховає лише те, що краулер розлогінений — випадок, а
не межа: один закешований рендер залогіненої сторінки робить її приватний вміст
публічним описом сторінки.

Те саме з екрануванням: рядок, який пройшов `wp_strip_all_tags` і потім
`html_entity_decode`, **знову стає розміткою** — і вилітає з `<script>` у документ.
Перевірка — відкрити JSON-LD і прочитати його, не повірити, що функція екранує.
### Speed — four tools, four numbers, stage 2 only

A number taken on a local file has no network, no cache and no compression behind
it. It is not a smaller number, it is a meaningless one.

| Перевірка | Поріг | P |
|---|---|---|
| Google PageSpeed | Mobile **70+**, Desktop **90+** | HARD |
| **⛔ Швидкість міряється на КОЖНОМУ прогоні стадій 2 і 3, і завжди числами (practice rule, 2026-10-05).** Мобайл і десктоп, головна + по одній сторінці кожного шаблону. У манифест ідуть самі числа: score, LCP, CLS, INP/TBT. «Швидкість прийнятна», «не встигли», «квота API» — не результат: драбина інструментів нижче існує саме для цього, і щонайменше локальний Lighthouse доступний завжди. Прогін без чисел — ⚠️ і незавершений | HARD | 2 |
| Core Web Vitals | LCP · CLS · **INP** — зелені на десктопі, жовті або краще на мобільному | HARD |
| Pingdom | **80+**, час завантаження **менше 2 секунд** | HIGH |
| GTMetrix YSlow | **80+** | HIGH |
| GTMetrix PageSpeed | **80+** | HIGH |

### ⛔ Speed is always measured — a quota or a missing tool is never the reason it was not

**The PageSpeed API often answers `429 Quota exceeded`.** The anonymous daily quota
is shared, and Lighthouse may not be installed. Neither is a reason to leave speed
unmeasured, and neither may be written up as a pass. Go down this list until
something works:

**Use the fastest method that works, and install what is missing yourself.** The
this was fixed as practice on 2026-09-11: Lighthouse is free, and installing it needs no
further OK. The order below runs fastest first.

1. **PageSpeed Insights API** (`pagespeedonline/v5/runPagespeed`, `strategy=mobile` and `desktop`).
   It is one HTTP call per page. On `429` go straight to step 2; do not retry.
1a. **Local Lighthouse CLI — the default when the API is out.** If `lighthouse --version`
   fails, run `npm install -g lighthouse` without asking. Then run every page ×
   mobile/desktop in parallel (3–4 at a time) against the installed Chrome:
   `CHROME_PATH=<chrome> lighthouse <url> --output=json --output-path=<file> --quiet --chrome-flags="--headless=new"`
   (add `--preset=desktop` for desktop). Read `categories.*.score` and
   `audits.{first-contentful-paint,largest-contentful-paint,total-blocking-time,cumulative-layout-shift,speed-index}`.
   Eight pages take about two minutes and no quota applies. Report that the numbers are
   lab Lighthouse on this machine.
2. **pagespeed.web.dev in the browser** — for a PSI-identical cross-check of one or two
   pages, or when step 1a cannot run. (`/analysis?url=…`). It uses the same
   Lighthouse and does not touch the API quota. **Run it yourself** in the user's
   real Chrome (claude-in-chrome), one tab per page. The in-app preview pane is hidden
   and never renders a report there. Wait about 40 s, then read the report text for
   `?form_factor=mobile` and `?form_factor=desktop`: the score, FCP, LCP, TBT, CLS, SI
   and the top opportunities. **Never hand this to the designer as a to-do.** On
   2026-09-11 the designer answered, with emphasis, that Claude must always run it
   themselves.
3. **Local Lighthouse** (`npx lighthouse <url> --preset=desktop` plus the default
   mobile run) against the locally installed Chrome. It needs the designer's OK the
   first time, because it installs a package.
4. **A CDP lab run** with network and CPU throttling (Slow 4G, 4× CPU) against
   the **deployed** site: LCP, CLS and TBT from `PerformanceObserver`. It gives no
   score, but it gives real numbers.

**⚠️ Не вдалося перевірити** is allowed only if all four fail, and it names every
attempt and every error. A speed row that was never measured must never appear in
the report as ✅, or be left out of it.

**What is measured:** Home, every static page, and one item of every CMS template,
each on mobile and on desktop. Report every score with its top two opportunities.
Anything we control is a finding with the fix named: an oversized image, a lazy LCP
image, unused JS (a library loaded with 0 references), a render-blocking stylesheet,
a font without preload.

**When the first screen fades in with JavaScript, measure what gates the start.**
Record `domContentLoadedEventStart` next to the first `is-revealed`. If the reveal
waits for DOMContentLoaded and parser-blocking footer scripts sit in front of it,
every one of those scripts delays FCP and LCP even though the animation itself is
fine. Find the fix in code, never by changing the animation:
- remove libraries loaded with zero references. On Webflow, GSAP (`gsap`,
  `ScrollTrigger`, `CustomEase`) loads with no interactions on the site, and only its
  GSAP switch in the site settings removes it;
- `preconnect` to every third-party script host, such as Webflow's jQuery on
  `d3e54v103j8qbb.cloudfront.net`;
- keep custom scripts small, and do not make them wait on anything they do not need.

Prove each fix before shipping it. Rewrite the page HTML on the fly
(`Fetch.fulfillRequest`), measure throttled mobile (Slow 4G, CPU ×4) before and
after, and report the gain in milliseconds.

Report the numbers, do not block the build on them: a score is a symptom, and the
row that matters is which of them moved after the last change.

**INP, not FID** — Google retired FID in March 2024. A run that measures FID is
measuring a metric that no longer exists.

**What stage 1 can say about speed instead of a score:** page weight in bytes,
the number and size of images, whether any of them is more than 2× its box,
whether CSS and JS are minified, whether the LCP image is eager and the rest lazy.
Those are the causes the score will later report, and they are all visible in the
file.

### LightHouse — all five categories, mobile and desktop, stage 2

| Категорія | P |
|---|---|
| Performance | HIGH |
| Accessibility | HIGH |
| Best Practices | HIGH |
| SEO | HIGH |
| ~~Progressive Web App~~ — прибрана з Lighthouse 12 (2024); не шукати й не звітувати як «0» | — |

Run both profiles; a page can pass on desktop and fail on mobile, and mobile is
where the audience is. Report each score with the top two opportunities behind it
— a bare number tells nobody what to do.

### Plugins and cleanliness — WordPress, stage 2

| Перевірка | P |
|---|---|
| **Rank Math** встановлений і налаштований; **Redirection не встановлений** — редиректи ведуться в Rank Math Pro | HIGH |
| WP Rocket встановлений **і налаштований**, не просто активований | HIGH |
| Imagify встановлений і налаштований, next-gen формати увімкнені | HIGH |
| Дефолтний контент WordPress видалений: сторінки, записи, категорії, теги, коментарі, типи записів, стокові теми, невикористані плагіни | HIGH |

**The Yoast row from the sheet is superseded.** Rank Math Pro carries the redirect
manager, so it replaces two plugins with one and the "only one of Redirection or
Rank Math" rule disappears. Yoast stays only on an inherited site already running
it, and only there is Redirection allowed alongside.

HSTS is a server header. On Webflow it is handled by the platform; on a client's
hosting it may be outside our control — if it cannot be set, that is 🔑, not a
failure.
