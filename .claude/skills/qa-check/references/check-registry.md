<!-- qa-check reference · реєстр перевірок з ID · генерується з scripts/registry.cjs — не редагувати руками: змінити registry.cjs і перегенерувати командою node scripts/registry-md.cjs -->

# Реєстр перевірок (check registry)

Кожен прогін — стадії 1, 2 і 3 — друкує **кожен** ID нижче зі статусом і доказом (`scripts/manifest.cjs`):
✅ pass · 🔴 fail · ❓ ask · ⊘ n/a (з причиною) · 🔁 routed (з виконавцем) · ⚠️ not run.
Прогін, у манифесті якого лишився ⚠️ not run, — незавершений. Рядок без машинного виміру не зникає:
він стоїть тут з інструментом `person` або `route` і закривається через `scripts/record.cjs`.

Усього: **228** перевірок · HARD 129 · HIGH 87 · MED 12 · LOW 0.

## Як читати колонки

- **Інструмент** — хто закриває рядок:
  - `qa-run` — scripts/qa-run.cjs — crawler: static pass on all tiers and engines, interactions, links, weight
  - `spell` — scripts/spell.cjs — spelling and grammar candidates
  - `lighthouse` — scripts/lighthouse.cjs — serial Lighthouse on an idle machine
  - `safari-real` — scripts/safari-real.cjs — real Safari on macOS through safaridriver
  - `ios` — scripts/ios.cjs — iOS Simulator Mobile Safari
  - `wp-admin` — scripts/wp-admin-audit.js — read-only audit in a logged-in wp-admin tab
  - `webflow` — Webflow internals — read through the Webflow connection (read-only) or by a person in Designer, then record.cjs
  - `route` — needs a machine or tool this run may lack — run it where available, otherwise route with a named owner (record.cjs --status routed)
  - `person` — needs eyes or hands, not a script — screenshots for the agent, devices / mailboxes / accounts for a human; closed with record.cjs
  - `snapshot` — scripts/snapshot.cjs — site fingerprint and changes since the previous run
- **Платформа** — порожньо: будь-яка. Інакше рядок стосується лише цих платформ; на іншій платформі (визначає RUN-05) він ⊘ n/a.
- **Стадія** — порожньо: обидві. `1` — лише локальна HTML-збірка, `2` — лише задеплоєний сайт; на іншій стадії рядок ⊘ n/a.
- **Гейт** — рядок має предмет лише тоді, коли presence sweep (RUN-02) його знайшов; інакше ⊘ n/a з тим, що шукали.
  Гейти: `burger` — a burger / drawer / off-canvas panel; `dropdowns` — desktop dropdown menus; `anchors` — in-page anchor links; `contacts` — email addresses or phone numbers on the page; `social` — links to social networks; `sliders` — a slider, carousel or ticker; `tabs` — tabs or filter tabs; `faq` — an FAQ section; `dialogs` — a pop-up, modal or lightbox; `forms` — a form with fields; `mailForms` — a form that sends mail (not search, not login); `video` — a &lt;video> or a video embed; `maps` — an embedded map; `search` — a search field or search page; `subscribe` — a subscribe form; `fileFields` — a file upload field; `sortFilter` — sorting or filtering of a list; `downloads` — documents offered for download; `preloader` — a preloader; `passwordPage` — a password-protected page; `accounts` — registration, login or a user account; `lang` — more than one language (hreflang, switcher, locale pages); `cms` — collection / related-content lists; `acf` — flexible-content layouts or shortcodes (WordPress); `donor` — the project was cloned from another site (decisions.donor); `template` — decisions.projectType = template (marketplace template).

## Реєстр

| ID | P | Перевірка | Інструмент | Платформа | Стадія | Гейт |
|---|---|---|---|---|---|---|
| RUN-01 | HARD | Site snapshot taken; changes since the previous run listed | `snapshot` |  |  |  |
| RUN-02 | HARD | Presence sweep: every gate recorded present (with pages) or absent (with what was searched); gated rows run or n/a with that reason | `qa-run` |  |  |  |
| RUN-03 | HARD | Page inventory: source (qa-target pages / sitemap from robots.txt or standard paths / link crawl), page count, URLs on other hosts dropped, sample per CMS template; only "/" found without decisions.singlePage → not run | `qa-run` |  |  |  |
| RUN-04 | HARD | Coverage: every planned page × width × engine × phase measured, or listed NOT RUN with its reason (load failure, challenge or password page, element cap, time budget, --quick/--pages/--engines/--widths cut) | `qa-run` |  |  |  |
| RUN-05 | HARD | Platform detected from positive markers and recorded (wordpress / webflow / static / other + evidence); a config "platform" that disagrees → ask; rows of other platforms n/a; platform unknown → those rows not run | `qa-run` |  |  |  |
| RUN-06 | HARD | Access: site reachable without a gate, or audited through a session the person provided; a password / basic-auth / SSO gate detected → every qa-run row not run with the route (the agent never types a password) | `qa-run` |  |  |  |
| RUN-07 | HARD | Run conditions pinned and recorded: skill version, config hash, OS, Node, browser builds and source, locale, timezone, scrollbar mode, devices, spellchecker + locale, CLI flags; each capability missing on this machine names the IDs it leaves not run | `qa-run` |  |  |  |
| LINK-01 | HARD | Every `<a>` has a real destination (no missing/empty href, #, javascript:) | `qa-run` |  |  |  |
| LINK-02 | HARD | Every same-page anchor (#id, /#id, full same-page URL#id) resolves to an element on the page | `qa-run` |  |  |  |
| LINK-03 | HARD | Every unique URL answers 200 (redirect chains counted) | `qa-run` |  |  |  |
| LINK-04 | HIGH | External links open in a new tab with rel=noopener | `qa-run` |  |  |  |
| LINK-05 | HARD | Every link/button has an accessible name | `qa-run` |  |  |  |
| LINK-06 | HARD | Nothing looks clickable without being a link/button (cursor:pointer / button-like class, no href, no handler) | `qa-run` |  |  |  |
| LINK-07 | HARD | Every top-level nav item (link, button or pointer-styled item, dropdown parents included) does something on click: navigates or opens its panel | `qa-run` |  |  |  |
| LINK-08 | HARD | Every mailto:/tel: is well-formed, not a template sample (example.com, 555-01xx, 000…), mails or dials what its text shows, and matches decisions.contacts when set | `qa-run` |  |  | `contacts` |
| LINK-09 | HARD | Every visible email address and phone number is a mailto:/tel: link | `qa-run` |  |  | `contacts` |
| LINK-10 | MED | In-page anchor links land with the target below the fixed/sticky header at 1440 and 360 (through the burger); the burger closes after an anchor tap | `qa-run` |  |  | `anchors` |
| LINK-11 | HIGH | Social links point to a specific profile: not the network root, not the donor's, equal to decisions.socialProfiles when set | `qa-run` |  |  | `social` |
| LINK-12 | HARD | No hidden links: no `<a href>` rendered invisible (0×0, opacity 0, transparent or 0px text, off-screen) at every tier where it exists | `qa-run` |  |  |  |
| LINK-13 | HARD | Controls do something: a `<button>` outside a form has an action (handler, aria-controls/expanded); toggles are buttons, not `<a href="#…">` | `qa-run` |  |  |  |
| LINK-14 | HARD | Every visible link, button and clickable control shows cursor: pointer | `qa-run` |  |  |  |
| JS-01 | HARD | No uncaught JS error, no first-party console error and no failed script/style/font/image request on any page, per engine, at load or after an interaction (third-party failures → ask) | `qa-run` |  |  |  |
| INT-01 | HARD | Every toggle (aria-expanded, tab, summary, accordion, FAQ) changes state when clicked/tapped | `qa-run` |  |  |  |
| INT-02 | HARD | Content revealed by toggles is measured again (overflow, clipping, edges) | `qa-run` |  |  |  |
| INT-03 | HIGH | Slider arrows change the slide (sliders found by library root, class, scroll-snap or motion, not only by a 'next' arrow); an active prev on the first slide of a non-looping slider is a fail | `qa-run` |  |  | `sliders` |
| INT-04 | HIGH | Autoplaying slider/ticker pauses on tap (mobile, tablet), hover and keyboard focus (desktop), or has a working pause control | `qa-run` |  |  | `sliders` |
| INT-05 | HARD | Every clickable element has a hover that changes something (≥992 only) | `qa-run` |  |  |  |
| INT-06 | HARD | Hover durations on the project scale (default 350ms; large media 500–650ms) | `qa-run` |  |  |  |
| INT-07 | HIGH | :hover rules wrapped in @media (hover: hover) (project CSS only; no readable project CSS → not run) | `qa-run` |  |  |  |
| INT-08 | HARD | Nothing left at an animation start value (opacity&lt;0.99 on visible text after scroll) | `qa-run` |  |  |  |
| INT-09 | HARD | Slider pagination: each bullet changes the slide and the active bullet follows | `qa-run` |  |  | `sliders` |
| INT-10 | HARD | Slider/carousel moves on a touch swipe at touch tiers (desktop mouse drag → ask only) | `qa-run` |  |  | `sliders` |
| INT-11 | HARD | Reveal on scroll: first screen first, no abrupt (≤3 frames) or flickering reveal, nothing left hidden after down/up/down passes, revealed links end at transform:none and will-change:auto | `qa-run` |  |  |  |
| INT-12 | HARD | Hover is smooth: no property switches in one frame, no background-image swap (first hover after load included) | `qa-run` |  |  |  |
| INT-13 | HARD | An absolute ::before/::after hover layer covers its whole grid/flex cell; the bottom edge of the cell hovers and clicks | `qa-run` |  |  |  |
| INT-14 | HIGH | Header/footer logo hover matches decisions.logoHover (no unintended opacity or colour change) | `qa-run` |  |  |  |
| INT-15 | HIGH | Hover-only affordances (arrow, icon, underline revealed on hover) are visible on touch tiers (hover: none) | `qa-run` |  |  |  |
| MODAL-01 | HIGH | Pop-up / lightbox opens from its trigger, is centred, scrolls inside, locks the page, moves focus in, closes with Escape and with its close button | `qa-run` |  |  | `dialogs` |
| MODAL-02 | MED | An auto-opening pop-up shows with the delay and frequency agreed with the designer (recorded in decisions) | `person` |  | 2 | `dialogs` |
| NAV-01 | HARD | Desktop dropdowns open on hover from every point of the item | `qa-run` |  |  | `dropdowns` |
| NAV-02 | HARD | Burger opens/closes, Escape closes, focus returns | `qa-run` |  |  | `burger` |
| NAV-03 | HARD | Burger panel: submenus collapsed by default (nothing in a nested list visible until its toggle); panel link count = desktop top-level items + CTAs (both numbers in evidence) | `qa-run` |  |  | `burger` |
| NAV-04 | HARD | Burger panel CTAs stay visible with the largest submenu open (sticky) | `qa-run` |  |  | `burger` |
| NAV-05 | HIGH | No nested scroll inside the burger panel (submenu with its own scrollbar) | `qa-run` |  |  | `burger` |
| NAV-06 | HIGH | Burger panel rows have equal height | `qa-run` |  |  | `burger` |
| NAV-07 | HIGH | Burger bars and close cross (or the burger morphed into a cross) have the same rendered line weight (±0.25px); not measurable → ask with screenshots | `qa-run` |  |  | `burger` |
| NAV-08 | HARD | Logo does not jump when the burger opens (left/top/width/height ±0.5px) | `qa-run` |  |  | `burger` |
| NAV-09 | HARD | Page behind the open menu does not scroll | `qa-run` |  |  | `burger` |
| NAV-10 | HARD | Header never breaks from the widest tier down to 360 (16px steps + band edges): one row, no wrapped label, no overlap, no link hidden without a burger, height ≤1.2× its reference | `qa-run` |  |  |  |
| NAV-11 | HARD | Logo in the header, footer and open burger panel links to the home page | `qa-run` |  |  |  |
| NAV-12 | HARD | Burger submenus hold the same links as the desktop dropdowns, plus a link to each parent page | `qa-run` |  |  | `burger` |
| NAV-13 | HARD | The whole row of every expandable item toggles it: 6 points per burger row at every burger width in Chromium, WebKit and Firefox, plus Enter and Space; FAQ/accordion rows at 3 points | `qa-run` |  |  |  |
| NAV-14 | HIGH | Burger panel CTAs styled like the site's buttons; a click outside the panel and a resize past the breakpoint close it and release the scroll lock | `qa-run` |  |  | `burger` |
| NAV-15 | HIGH | A scrollable burger panel has overscroll-behavior contain/none (no scroll chaining); a panel taller than the screen can scroll | `qa-run` |  |  | `burger` |
| A11Y-01 | HARD | Text contrast ≥4.5:1 (≥3:1 large) on solid backgrounds; over images/blur → screenshot + ask, never auto-fail | `qa-run` |  |  |  |
| A11Y-02 | HARD | Burger panel is a dialog (role=dialog + aria-modal or inert page); focus moves into it | `qa-run` |  |  | `burger` |
| A11Y-03 | HIGH | Hover dropdowns expose aria-expanded=true while open | `qa-run` |  |  | `dropdowns` |
| A11Y-04 | HIGH | Tab interfaces use role=tablist/tab/tabpanel + aria-selected | `qa-run` |  |  | `tabs` |
| A11Y-05 | MED | Pointer targets ≥24×24px (WCAG 2.5.8) | `qa-run` |  |  |  |
| A11Y-06 | HARD | Exactly one `<h1>`; heading levels not skipped | `qa-run` |  |  |  |
| A11Y-07 | HARD | Visible keyboard focus on every control: state changes on focus, ring ≥3:1 against its background, focus never lands on an invisible element | `qa-run` |  |  |  |
| A11Y-08 | HARD | State contrast: placeholder ≥4.5:1 (3:1 large), field boundary ≥3:1, hover and focus text ≥4.5:1 (3:1 large); disabled controls → ask | `qa-run` |  |  |  |
| A11Y-09 | HARD | Error and success message contrast ≥4.5:1 (needs --form-errors, otherwise not run) | `qa-run` |  |  | `forms` |
| A11Y-10 | HARD | Header in the accessibility tree: named nav, burger with a name and a flipping aria-expanded, named close button, desktop dropdowns open with Enter/Space and close with Escape | `qa-run` |  |  |  |
| LAY-01 | HARD | No horizontal scroll at any tier | `qa-run` |  |  |  |
| LAY-02 | HARD | No element clipped by the viewport outside a scroll/overflow container (e.g. a button at -38px) | `qa-run` |  |  |  |
| LAY-03 | HARD | Text never closer than 8px to the viewport edge (a site-wide overflow-x:hidden wrapper does not switch the check off) | `qa-run` |  |  |  |
| LAY-04 | HARD | Card grids balanced: no orphan card in the last row at 2/3-column tiers | `qa-run` |  |  |  |
| LAY-05 | HIGH | Mobile alignment consistent inside every section (sections found through platform wrappers): a centred section has no left-stuck block | `qa-run` |  |  |  |
| LAY-06 | HIGH | Cards in different tabs/filters of one component have the same width | `qa-run` |  |  | `tabs` |
| LAY-07 | HARD | Unification: same-role elements measure the same — button variants (header included) by height/padding/radius/font-size, siblings of one set by gap/padding/radius/border/width, headings per tag+class, media aspect ratio within a set | `qa-run` |  |  |  |
| LAY-08 | HARD | Whole-integer pixels in spacing and size (em/%-derived fractions included) | `qa-run` |  |  |  |
| LAY-09 | HIGH | Spacing identical in iOS Safari and desktop WebKit at the same width (±4px): section insets and element spacing matched by DOM path | `ios` |  |  |  |
| LAY-10 | HIGH | Section vertical insets follow one scale per tier: same-role sections measure the same; no section at ~0 while its siblings carry the scale | `qa-run` |  |  |  |
| LAY-11 | HARD | Text keeps ≥8px (decisions.edgeMinPx) from every painted card/panel/cell/rule edge on all four sides at all 7 tiers; no one-sided inset smaller than the rest of its section | `qa-run` |  |  |  |
| LAY-12 | HARD | Content keeps ≥8px on both sides of a background change between sections | `qa-run` |  |  |  |
| LAY-13 | HARD | One left edge per tier: logo, start-aligned sections and footer share the container edge (±2px); container width and gutters match decisions.container when set | `qa-run` |  |  |  |
| LAY-14 | HARD | Spacing skeleton: heading→text, text→button, section head→content hold one value per tier (decisions.spacing, else the site's most common value) | `qa-run` |  |  |  |
| LAY-15 | HIGH | Icon line weight: rendered stroke equal within ±0.25px per icon group (header and panel chevrons, FAQ toggles, arrows, social icons) at 1440 and 360 | `qa-run` |  |  |  |
| LAY-16 | HARD | No truncated copy: no ellipsis, line-clamp or overflow-clipped text (fail at ≤768, ask above; decisions.truncateAllowed) | `qa-run` |  |  |  |
| LAY-17 | HARD | Text never sits under decorative art (an absolute image/SVG painting over a text line); gap under 24px, or under 60px in a hero at 768–991 → ask | `qa-run` |  |  |  |
| LAY-18 | HARD | Wrapped grid/flex rows never touch: vertical distance between rows ≥ decisions.edgeMinPx at all 7 tiers (fail); a row gap under half the column gap → ask; each finding carries an element screenshot | `qa-run` |  |  |  |
| LAY-19 | HARD | No horizontal scroll rail at ≥768 (cards cut at the edge, sideways scrollbar inside the page); below 768 → ask unless decisions.railsAllowed; sliders with controls excluded | `qa-run` |  |  |  |
| LAY-20 | HIGH | Link groups that wrap (footer legal links, tag rows) keep one horizontal gap and a vertical gap within 4px of it | `qa-run` |  |  |  |
| LAY-21 | HARD | Charts and diagrams keep their meaning on tablet and mobile: every label stays attached to its point/step (compare 1440 against 768 and 360) | `person` |  |  |  |
| LAY-22 | HARD | Readable measure: body text never squeezed below ~28 characters per line (multi-column rows that do not collapse on tablet) | `qa-run` |  |  |  |
| STRUCT-01 | HARD | Section structure: every block directly in main is a `<section>`, its first child is the container (decisions.containerClass), no other children except declared decor; container side padding identical across sections per tier | `qa-run` |  | 1 |  |
| STRUCT-02 | HIGH | Class hygiene: ≤2 classes per element, names match decisions.classNamePattern, no descendant type selectors (.x h2) in project CSS, no builder leftovers (field-*, empty wrappers) | `qa-run` |  | 1 |  |
| STRUCT-03 | HARD | No inline style attributes in the source markup of main (runtime animation values excepted) | `qa-run` |  | 1 |  |
| STRUCT-04 | HIGH | No debug code left in the theme / build source: console.log, error_log, var_dump, print_r, TODO, FIXME, XXX (one search over the source folder) | `route` |  |  |  |
| REF-01 | HARD | Values on the design-token scale (reference.tokens): colour, font size, spacing, radius, duration, font family — every off-scale group is a finding, even when uniform; no tokens → n/a (consistency-only run) | `qa-run` |  |  |  |
| REF-02 | HARD | Deployed page = clean stage-1 build (reference.build, closed clean): link counts, section count and order, section paddings, buttons, container width, h1–h3 family and size | `qa-run` |  | 2 |  |
| IMG-01 | HARD | Every `<img>` has a non-empty alt | `qa-run` |  |  |  |
| IMG-02 | HARD | Every `<img>` has width and height attributes | `qa-run` |  |  |  |
| IMG-03 | HARD | No image served >2× its rendered width (DPR 1) | `qa-run` |  |  |  |
| IMG-04 | HIGH | Content images in WebP/AVIF | `qa-run` |  |  |  |
| IMG-05 | HIGH | No loading=lazy on images visible in the first viewport | `qa-run` |  |  |  |
| IMG-06 | HARD | No visible broken image | `qa-run` |  |  |  |
| IMG-07 | HARD | No uncompressed asset: per-file bytes under decisions.assetMaxKB (raster 300, SVG 50, favicon 20, og:image 200, font 150 KB); 0 bytes reported → ask | `qa-run` |  |  |  |
| IMG-08 | HARD | Alt is descriptive: not a generic word, not a file name, has letters; one alt shared by ≥3 different pictures on a page → ask | `qa-run` |  |  |  |
| IMG-09 | HIGH | A meaningful background-image (logo, portrait, infographic) has a text alternative: candidates listed with screenshots → ask | `qa-run` |  |  |  |
| VID-01 | HIGH | Every `<video>` has a poster; autoplay videos are muted+loop+playsinline | `qa-run` |  |  | `video` |
| VID-02 | HIGH | Video resolution fits its use: ≥ decisions.minVideoWidth for video a visitor can watch full screen, ≥ rendered width for background video (detached probe); unmeasurable clip or embed → not run | `qa-run` |  |  | `video` |
| VID-03 | HIGH | Every video loads without a media error or 404; autoplay/background video actually plays while in view | `qa-run` |  |  | `video` |
| VID-04 | HIGH | Video file ≤ decisions.maxVideoMB (size from the server headers, not from page weight) | `qa-run` |  |  | `video` |
| VID-05 | HIGH | One clip and every embed watched full screen at 1080p: sharp, no artefacts | `person` |  |  | `video` |
| FONT-01 | HARD | Every rendered text family is declared (@font-face, decisions.fonts or decisions.systemFonts); declared faces load (0 errors, none left unloaded); form controls inherit the site font | `qa-run` |  |  |  |
| FONT-02 | HARD | Fonts self-hosted with font-display: swap; declared family+weight pairs = the ones used (no synthesised weight or style, no loaded weight left unused) | `qa-run` |  |  |  |
| TEXT-01 | HARD | No `<br>` inside copy (designer exceptions recorded in decisions) | `qa-run` |  |  |  |
| TEXT-02 | HARD | Spelling: 0 real errors in every text source (visible, hidden, attributes, meta, JSON-LD) in each page's own language (en_GB when englishVariant is UK); a language with no dictionary → not run | `spell` |  |  |  |
| TEXT-03 | HIGH | One English variant (US/UK) across the English pages (other languages skipped and noted) | `qa-run` |  |  |  |
| TEXT-04 | MED | One capitalisation rule for buttons and arrow links on English pages (Title Case or Sentence case) | `qa-run` |  |  |  |
| TEXT-05 | HARD | No placeholders (lorem, "your text here", TODO, raw template tokens like {{…}}) in visible or hidden text, attributes, meta or JSON-LD | `qa-run` |  |  |  |
| TEXT-06 | MED | One name per thing: menu label = target page H1/title (a different word form fails; no shared word → ask) | `qa-run` |  |  |  |
| TEXT-07 | MED | One date format per language across the site (decisions.dateFormat if set) | `qa-run` |  |  |  |
| TEXT-08 | HARD | Grammar candidates in every text source (a/an + plural, doubled word, space before comma, double space, "..." vs "…", mixed quotes), each read in context | `spell` |  |  |  |
| COPY-01 | HARD | Copy matches the client's source (sources.copy): every heading, list item and paragraph present and not cut; no source → not run, routed | `qa-run` |  |  |  |
| COPY-02 | HIGH | No duplicated text: the same text (≥20 characters) in two different visible blocks of one page → ask | `qa-run` |  |  |  |
| COPY-03 | HIGH | No truncated sentences (ends in a comma or a stop-word, or lacks the ending its siblings have) → ask | `qa-run` |  |  |  |
| COPY-04 | HIGH | © year is the current year (decisions.copyrightYear); no cut numbers ("since 20"); a price of 0 → ask | `qa-run` |  |  |  |
| COPY-05 | HIGH | The same label + value metric in two or more cards of one group with different titles → ask | `qa-run` |  |  |  |
| COPY-06 | HIGH | H1 unique across pages; an H1 equal to another page's menu label or title → ask | `qa-run` |  |  |  |
| COPY-07 | HIGH | No empty states left in: no card without text among siblings with text, no section with only a heading | `qa-run` |  |  |  |
| PAGE-01 | HARD | Legal page (Privacy Policy on client sites; Licensing and Changelog on templates) linked or at decisions.legalPath, answers 200, real text (no CMS draft or stub) | `qa-run` |  |  |  |
| PAGE-02 | HARD | 404 page is designed: site header and footer, a not-found message, a way home, not the CMS index fallback; a platform 401/password page opened and looked at | `qa-run` |  |  |  |
| FOOT-01 | HARD | Footer credit matches the company rule recorded in decisions.credit: required wording, each credit word a link with the expected href, link count; unset → not run | `qa-run` |  |  |  |
| FORM-01 | HARD | Every field accepts typing and has a real label (label[for], wrapping label, aria-label/labelledby; placeholder-only → ask) | `qa-run` |  |  | `forms` |
| FORM-02 | HARD | Required fields marked visibly (asterisk or "required" note) | `qa-run` |  |  | `forms` |
| FORM-03 | HIGH | autocomplete set on name/email/phone/organisation fields | `qa-run` |  |  | `forms` |
| FORM-04 | HARD | Anti-spam present (captcha, Turnstile or honeypot) on every form | `qa-run` |  |  | `forms` |
| FORM-05 | HIGH | Field rules: date fields refuse past dates where a future date is meant; number/phone fields refuse letters and negatives where a count is meant | `qa-run` |  |  | `forms` |
| FORM-06 | HIGH | Empty submit is blocked with a visible message; the error state does not shift layout (field heights, select arrow/icons relative to their field) — needs --form-errors | `qa-run` |  |  | `forms` |
| FORM-07 | HIGH | Form fields: same computed height, padding, line-height and type in WebKit, Firefox and real Safari as in Chromium | `qa-run` |  |  | `forms` |
| FORM-08 | HARD | Mail config for every form provider: real recipients only (no test, example or agency addresses), sender on the site domain (n/a where the platform sends from its own), auto-reply on; a provider no script reads → not run with its screen | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, static: `route`, інша CMS: `route`) |  | 2 | `mailForms` |
| FORM-09 | HIGH | Mail content: every field labelled, page URL + page title (in the subject if decided), no unknown [tags]; auto-reply readable | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, static: `route`, інша CMS: `route`) |  | 2 | `mailForms` |
| FORM-10 | HIGH | Text sits at the same vertical position inside every single-line field in WebKit, Firefox and real Safari as in Chromium (pixel ink box, ±2px) | `qa-run` |  |  | `forms` |
| FORM-11 | HIGH | Typing and date entry work in WebKit, Firefox and an iPad touch context (native date fills, JS picker opens and fills, date field not collapsed) | `qa-run` |  |  | `forms` |
| FORM-12 | HARD | Form has a destination (action, platform handler or JS submit listener); type matches the content (email, tel), maxlength set within decisions limits, a required select starts on an empty option, meaningful field names; an invalid email is rejected | `qa-run` |  |  | `forms` |
| FORM-13 | HIGH | An empty select looks like the input placeholders; the submit button looks the same while anti-spam loads and is not disabled at rest; tab order follows the visual order | `qa-run` |  |  | `forms` |
| FORM-14 | HARD | One test submission per mail form, only with explicit permission: success state seen; admin email and auto-reply both arrive, not in spam; both read on desktop and phone | `person` |  | 2 | `mailForms` |
| FORM-15 | HIGH | Visible input/select/textarea font-size ≥16px at every tier below 768 (iOS focus zoom), every engine | `qa-run` |  |  | `forms` |
| FORM-16 | HIGH | A form used on several pages lives in one place (footer, page template or component), not pasted into each page; on the contact page the form is visible without scrolling or the first screen links to it | `person` |  |  | `forms` |
| MAP-01 | MED | Embedded map (iframe or JS map) is not greyed out or covered at rest (filter/overlay until hover) | `qa-run` |  |  | `maps` |
| MAP-02 | HARD | Map key valid: no "for development purposes only" watermark, key or billing error; a cross-origin iframe map → ask with a screenshot | `qa-run` |  | 2 | `maps` |
| MAP-03 | MED | Map markers click and open their info pop-up; marker icons as designed | `person` |  | 2 | `maps` |
| VIS-01 | HIGH | Contact sheet looked at: full-page screenshots of every page at 1440/768/360, burger, form error state, Safari and iOS shots — alignment, composition, anything numbers miss | `person` |  |  |  |
| SEO-01 | HARD | `<title>` present and unique; length outside decisions.titleLen → ask | `qa-run` |  |  |  |
| SEO-02 | HARD | Meta description present (unique on client sites); length outside decisions.descLen → ask | `qa-run` |  |  |  |
| SEO-03 | HARD | Canonical present and self (or noindex staging) | `qa-run` |  | 2 |  |
| SEO-04 | HIGH | og:image present and specific per post/item (not one image for every page) | `qa-run` |  |  |  |
| SEO-05 | HIGH | JSON-LD on every page parses (a marketplace template carries none → ask) | `qa-run` |  |  |  |
| SEO-06 | HARD | robots.txt, meta robots and X-Robots-Tag match the domain (staging closed, production open) | `qa-run` |  |  |  |
| SEO-07 | HIGH | Sitemap found (robots.txt Sitemap: or standard paths), answers 200 and lists the pages; URLs on another host → finding | `qa-run` |  | 2 |  |
| SEO-08 | HARD | Share preview: server HTML has og:title/description/url/image + twitter:card; exactly one absolute og:image answering 200 as JPG/PNG/WebP/GIF ≥1200×627 within decisions.ogImageMaxKB; social crawlers allowed by robots.txt on production | `qa-run` |  |  |  |
| SEO-09 | HARD | No hard-coded http://: no mixed content on https, no http:// link to the site's own host (other hosts → ask) | `qa-run` |  |  |  |
| SEO-10 | HIGH | Charset declared; viewport meta has width=device-width (user-scalable=no or maximum-scale=1 → ask) | `qa-run` |  |  |  |
| SEO-11 | HARD | FAQ schema matches the page: FAQPage where an FAQ is, Question count = FAQ items, every answer in the markup before any click | `qa-run` |  |  | `faq` |
| SEO-12 | HIGH | No orphan pages: every sitemap URL is linked from some crawled page (→ ask; decisions.orphanAllowed) | `qa-run` |  | 2 |  |
| SEO-13 | HIGH | Clean slugs: lowercase, hyphens, no dates, ids or ?p= queries (decisions.slugAllowed) | `qa-run` |  |  |  |
| SEO-14 | HIGH | Share preview on the production domain checked in the social post inspectors (title, description, image, crop) | `person` |  | 2 |  |
| SEO-15 | HIGH | Every old URL that was in the search index answers 301 to its new page (list from the client or the search console); a new domain with no indexed pages → n/a by note | `person` |  | 2 |  |
| PERF-01 | HARD | Lighthouse, serial on an idle machine: mobile ≥70, desktop ≥90 (numbers per page) | `lighthouse` |  | 2 |  |
| PERF-02 | HIGH | Page weight ≤3 MB on mobile | `qa-run` |  |  |  |
| PERF-03 | HIGH | External speed tests of the company checklist (Pingdom, GTmetrix) run and their numbers recorded per page | `person` |  | 2 |  |
| SEC-01 | MED | HSTS + basic security headers on the document | `qa-run` |  | 2 |  |
| TRACK-01 | HARD | Analytics/tracker inventory printed; no placeholder IDs (GTM-XXXX, G-XXXX); only IDs on decisions.analyticsIds; none on a marketplace template | `qa-run` |  |  |  |
| DONOR-01 | HARD | No donor leftovers in the published HTML or network: name, domain, links, socials, form names, script hosts (decisions.donor; null → ask) | `qa-run` |  |  | `donor` |
| DONOR-02 | HARD | No clone leftovers in the platform lists: pages not in the brief, donor or empty CMS collections, default or foreign form names, site/page custom code | `person` | WP, Webflow, інша CMS | 2 | `donor` |
| TPL-01 | HARD | A marketplace template ships only the platform runtime and GSAP with its official plugins; every other script or embed is named (decisions.allowedScripts) | `qa-run` |  |  | `template` |
| I18N-01 | HARD | Every page has a valid `<html lang>`; on a multilingual site it equals the page's own hreflang and URL locale | `qa-run` |  |  |  |
| I18N-02 | HIGH | hreflang on every page: self entry, every locale and x-default; pairs reciprocal; every alternate answers 200 | `qa-run` |  |  | `lang` |
| I18N-03 | HARD | Language switcher changes the visible content, `<html lang>` and the URL locale in Chromium, WebKit and Firefox at 1440 (click) and 360 (tap) | `qa-run` |  |  | `lang` |
| I18N-04 | HIGH | The chosen language persists after following an internal link | `qa-run` |  |  | `lang` |
| I18N-05 | HARD | Every page translated in every locale: visible text, form labels, placeholders and buttons, title and meta description (validation messages with --form-errors) | `qa-run` |  |  | `lang` |
| I18N-06 | HARD | Translated pages pass the layout measures: header and same-class button heights within ±4px of the default locale | `qa-run` |  |  | `lang` |
| XB-01 | HARD | WebKit and Firefox match Chromium: overflow, clipping, fonts, images, section positions (±2px), no engine-only JS error; an engine that did not launch → not run | `qa-run` |  |  |  |
| XB-02 | HARD | Real Safari (macOS) opens every page; same measures as WebKit (window widths recorded) | `safari-real` |  |  |  |
| XB-03 | HARD | iOS Simulator Mobile Safari, portrait, narrowest + widest iPhone + iPad: overflow, clipping, 8px edges, field font ≥16px on a fixed page sample (coverage in evidence); a missing device → not run | `ios` |  |  |  |
| XB-04 | HARD | Microsoft Edge (real browser via Playwright channel msedge or EDGE_PATH): same results as Chromium; not installed → not run with a route | `qa-run` |  |  |  |
| XB-05 | HARD | Chrome on Android (emulator or USB device via adb): overflow, clipping, edges, fonts, images at the device width; no adb or device → not run with a route | `route` |  |  |  |
| XB-06 | HIGH | Safari hardening in project CSS: backdrop-filter, mask and background-clip:text carry their -webkit- twins; 100vh has an svh/dvh fallback | `qa-run` |  |  |  |
| XB-07 | MED | Motion and text hardening: prefers-reduced-motion handled where CSS animates; text-size-adjust set | `qa-run` |  |  |  |
| XB-08 | HIGH | Interactions per engine: toggles/FAQ, burger open/close and hover change state in WebKit and Firefox as in Chromium | `qa-run` |  |  |  |
| IOS-01 | HARD | Real iPhone: swipe on the open menu panel and the screen edge — the page behind stays still | `person` |  | 2 |  |
| IOS-02 | HIGH | Real iPhone: tap a button, a card and an FAQ row, go back — nothing stays shifted or highlighted (sticky hover) | `person` |  | 2 |  |
| IOS-03 | HIGH | Real iPhone: scroll down and up on every page — header does not jump, first screen and buttons are not under the address bar | `person` |  | 2 |  |
| IOS-04 | HARD | Real iPhone form: tap each field, select and captcha — no zoom, keyboard does not cover the field, pickers work (submit only with permission) | `person` |  | 2 | `forms` |
| IOS-05 | HIGH | Real iPhone landscape on the widest model: nothing under the notch, no horizontal scroll | `person` |  | 2 |  |
| IOS-06 | HIGH | Real iPhone, first open on mobile internet: the first screen appears smoothly, nothing left invisible | `person` |  | 2 |  |
| IOS-07 | HARD | Real iPhone VoiceOver on the home page and a form page: navigation announced with a name, menu button announces its state, focus moves into the panel and back to the button on close | `person` |  | 2 |  |
| FEAT-01 | HIGH | Search: a query returns results; empty-query and no-results states and the results/archive pages are styled; autosuggest and "All results" as designed | `person` |  |  | `search` |
| FEAT-02 | HARD | Subscribe: the field accepts text and the form submits (with permission); the subscriber gets the email and lands in the list; unsubscribe works | `person` |  | 2 | `subscribe` |
| FEAT-03 | HIGH | File field: accepted formats and size limit stated and enforced | `person` |  |  | `fileFields` |
| FEAT-04 | HIGH | Sorting and filtering change the list correctly; reset works; an empty result is styled | `person` |  |  | `sortFilter` |
| FEAT-05 | HIGH | Downloadable documents open, have readable file names and a sensible size | `person` |  |  | `downloads` |
| FEAT-06 | MED | Preloader shows only while loading and never blocks the page | `person` |  |  | `preloader` |
| FEAT-07 | HARD | Password-protected page: the password form is styled like the site, a logged-out private window is asked for the password, the agreed password lets in (typed by the person) | `person` |  | 2 | `passwordPage` |
| ACC-01 | HARD | Registration, login and the user account (references/forms-accounts.md §14) run by a person with test accounts | `person` |  | 2 | `accounts` |
| CMS-01 | HIGH | A related/collection list on a detail page does not link to the page itself | `qa-run` |  |  | `cms` |
| CMS-02 | HIGH | Inventory: every CMS object counted per type and state; every published item of a public type appears on some crawled page (link or title), else ask; drafts, scheduled and private items listed | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, інша CMS: `person`) | WP, Webflow, інша CMS | 2 |  |
| EDIT-01 | HARD | Editor editability: every section selectable and named, text edited in the canvas, an image replaced from the media library, sidebar controls change the canvas (type, look, undo — never save) | `person` | WP, Webflow, інша CMS | 2 |  |
| EDIT-02 | HARD | Collection editability, by a person with permission: a draft entry renders in the list and is deleted again, an edit to an existing entry shows on the page, fields have labelled controls, permissions checked as a non-admin user | `person` | WP, Webflow, інша CMS | 2 | `cms` |
| WP-01 | HARD | WP: block validity 0 invalid, 0 core/html, 0 missing (every content type parsed) | `wp-admin` | WP | 2 |  |
| WP-02 | HIGH | WP: trash empty, no default content, Uncategorized not default, no empty categories | `wp-admin` | WP | 2 |  |
| WP-03 | HIGH | WP: plugins — no migration/dev leftovers, no local-dev mu-plugins, caching + image optimisation active, updates applied | `wp-admin` | WP | 2 |  |
| WP-04 | HIGH | WP: one stock theme only; theme author = decisions.themeAuthor (unset → ask) + screenshot.png | `wp-admin` | WP | 2 |  |
| WP-05 | HIGH | WP: no unused media (every content type and rendered page searched; files used only by trashed posts included) | `wp-admin` | WP | 2 |  |
| WP-06 | HIGH | WP: no template/template-part saved in DB over the theme file | `wp-admin` | WP | 2 |  |
| WP-07 | MED | WP: every top-level section named in List View | `wp-admin` | WP | 2 |  |
| WP-08 | HIGH | WP: users — no dev/fake emails, admin count justified | `wp-admin` | WP | 2 |  |
| WP-09 | HARD | WP: comments match blog presence — closed globally and per item when there is no comment section; with one: moderation on, name+email required, link limit; held/spam/trash queues counted | `wp-admin` | WP | 2 |  |
| WP-10 | HARD | WP: a block theme ships a 404 template in its files (otherwise WordPress serves index) | `wp-admin` | WP | 2 |  |
| WP-11 | HIGH | WP: theme templates exist for what the site has — single/archive for posts and each content type with entries, search when the site has search | `wp-admin` | WP | 2 |  |
| WP-12 | HARD | WP: generated global stylesheet complete — every settings.custom value present as --wp--custom--*, braces balanced | `wp-admin` | WP | 2 |  |
| WP-13 | HARD | WP: editor canvas = front end at Desktop, Tablet and Mobile preview | `route` | WP | 2 |  |
| WP-14 | HARD | WP: a content type with its own capability_type is editable by an administrator (map_meta_cap) | `wp-admin` | WP | 2 |  |
| WP-15 | HIGH | WP: flexible-content layouts reusable, no unused layouts left, every shortcode option checked | `person` | WP | 2 | `acf` |
| WF-01 | HARD | Custom code only where declared: site head/footer, every page head/footer and the registered-scripts list (template: none; client: decisions.allowedCustomCode); no stray HTML Embed or Code Block | `webflow` | Webflow | 2 |  |
| WF-02 | HARD | Every form has a unique name (form data-name): two forms with different fields under one name, or a default name such as "Email Form", is a finding | `qa-run` | Webflow |  | `forms` |
| WF-03 | HIGH | Form success/error and Collection List empty states are not the platform default texts | `qa-run` | Webflow |  |  |
| WF-04 | HARD | CMS integrity: no draft or archived item linked from a published page; required and reference fields filled in every item; every collection has meta description and OG fields, bound and filled per item | `webflow` | Webflow | 2 |  |
| WF-05 | HARD | Alt in all three places: every asset in the Assets panel, every CMS image field, every image inside Rich Text | `webflow` | Webflow | 2 |  |
| WF-06 | HIGH | Site republished after the last CMS change (site lastPublished ≥ newest item update) | `webflow` | Webflow | 2 |  |
| WF-07 | HARD | Designer Audits panel: issue count per page read at the start and brought to zero by the end | `person` | Webflow | 2 |  |
| WF-08 | HIGH | Interaction wiring: every data-w-id has an interaction in the published interactions data, and every interaction has its target | `qa-run` | Webflow |  |  |
| WF-09 | HIGH | Detail-page links generated inside Collection Lists, never typed by hand; every page slug matches every path that leads to it | `webflow` | Webflow | 2 |  |
| WF-10 | HIGH | File stays editable: text in Heading/Paragraph/Text Block, shared classes unchanged (instance changes on combo classes), colours and sizes from Variables on templates | `webflow` | Webflow | 2 |  |
| WF-11 | HIGH | No unused assets: the Assets panel compared with the published pages AND the CMS data (fields reference files the pages do not show) | `webflow` | Webflow | 2 |  |

## Як закривається рядок без скрипта

Рядки нижче не закриває жоден скрипт цієї машини (або закриває не на кожній платформі). Поки їх не закрито,
манифест показує ⚠️ not run з цим маршрутом. Закрити (з теки проєкту): `node "$S/record.cjs" --out qa-out --id ID --status pass|fail|ask|routed --note "…"`;
⊘ n/a — лише з причиною (`--status na --note "…"`), «поза обсягом» — лише з датою рішення дизайнера.

| ID | Інструмент | Маршрут |
|---|---|---|
| MODAL-02 | `person` | designer decision → qa-target.json decisions + record.cjs |
| LAY-21 | `person` | person: compare screenshots of every chart/diagram/timeline at 1440, 768, 360 |
| STRUCT-04 | `route` | whoever has the source (the build folder at stage 1, the theme folder or repository at stage 2) searches it → record.cjs with the count; no source access → record.cjs --status routed --note "developer, before handover" |
| VID-05 | `person` | agent or person opens each clip full screen → record.cjs |
| FORM-08 | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, static: `route`, інша CMS: `route`) | WordPress: wp-admin-audit.js; Webflow: Site settings → Forms + each form's Email Notifications; other: the owner of the form backend (form action host) — then record.cjs |
| FORM-09 | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, static: `route`, інша CMS: `route`) | WordPress: wp-admin-audit.js; Webflow: Site settings → Forms + each form's Email Notifications; other: the owner of the form backend (form action host) — then record.cjs |
| FORM-14 | `person` | person, with permission → record.cjs --id FORM-14 --item per form (never recorded under FORM-09) |
| FORM-16 | `person` | agent compares the form markup across pages and looks at the contact page screenshot at 1440 and 360 → record.cjs |
| MAP-03 | `person` | agent clicks the markers where it can, else a person → record.cjs |
| VIS-01 | `person` | agent looks at every shot, hands the folder to the designer → record.cjs --id VIS-01 |
| SEO-14 | `person` | person on the production domain after launch → record.cjs |
| SEO-15 | `person` | person with the list of old URLs (the agent may check each listed URL read-only) → record.cjs; no list → record.cjs --status routed --note "client: list of old URLs" |
| PERF-03 | `person` | person runs the external tests → record.cjs with the numbers |
| DONOR-02 | `person` | read the platform lists (wp-admin or the Webflow connection, read-only) → record.cjs |
| XB-04 | `qa-run` | install Edge (a person, needs admin) and rerun qa-run, or record.cjs --status routed --note "owner, machine, date" |
| XB-05 | `route` | Android emulator with a Google APIs image or a USB device; otherwise record.cjs --status routed --note "owner, device, date" |
| IOS-01 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-02 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-03 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-04 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-05 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-06 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| IOS-07 | `person` | person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision |
| FEAT-01 | `person` | person runs the search block → record.cjs |
| FEAT-02 | `person` | person, with permission → record.cjs |
| FEAT-03 | `person` | person tries an allowed and a refused file without submitting → record.cjs |
| FEAT-04 | `person` | person → record.cjs |
| FEAT-05 | `person` | person → record.cjs |
| FEAT-06 | `person` | person on a throttled connection → record.cjs |
| FEAT-07 | `person` | person (the agent never types passwords) → record.cjs |
| ACC-01 | `person` | person with test accounts (the agent never types passwords) → record.cjs per section |
| CMS-02 | `wp-admin` (WP: `wp-admin`, Webflow: `webflow`, інша CMS: `person`) | WordPress: wp-admin-audit.js; Webflow: CMS items via the connection; other CMS: person → record.cjs |
| EDIT-01 | `person` | person in the editor, type-look-undo → record.cjs; a row that needs saving → routed with the exact screens |
| EDIT-02 | `person` | person with permission → record.cjs |
| WP-13 | `route` | canvas-diff tool where installed, else a person compares the editor at the three preview widths with the front-end screenshots → record.cjs |
| WP-15 | `person` | person in wp-admin, read-only → record.cjs |
| WF-07 | `person` | person in Designer reads the Audits panel → record.cjs with the counts |
| WF-11 | `webflow` | Webflow connection read-only (assets, collections, items) or a person in Designer → record.cjs |
