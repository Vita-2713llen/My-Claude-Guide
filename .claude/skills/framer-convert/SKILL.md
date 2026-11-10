---
name: framer-convert
description: Convert a UPQODE design-tool project (or any live reference site) into a native, client-editable Framer site 1:1 — layout, tokens, text styles, CMS, components, responsive breakpoints and code-override motion. Use whenever the user says "конвертуй у фреймер", "перенеси у Framer", "зроби у фреймері один в один", "Framer project", "convert to Framer", or continues work on such a conversion (fixes, animations, QA against the live site). Holds every rule and correction learned on real conversions (Noverde → Verdova) so they are applied from the first pass, not after the designer complains.
---

# FRAMER-CONVERT — design tool / live site → native Framer, 1:1

Talk to the designer **in Ukrainian**. Site copy stays **English**. CLAUDE.md "Part II Rules for Claude" still applies.

## 0. Before touching Framer

1. **Reference = the live site**, measured, never eyeballed. Run Playwright (`executablePath: '/opt/pw-browsers/chromium'`)
   on the live URL at **1280, 1440 and 1800** wide and record per section: container `max-width` + padding, section
   padding, every heading's font-size / line-height / letter-spacing / max-width, button paddings, gaps, image boxes
   (`object-fit`, `object-position`, absolute pins, z-order), hover / focus states of inputs and buttons.
   Wide viewports catch container bugs that 1280 hides (1250 at 1280 was really `max-width:1400; padding:0 15px`).
2. Read the source motion file (e.g. `assets/js/main.js`) end to end before planning animations — it is the spec.
3. Never execute downloaded page scripts in jsdom/Node; render with Chromium and block `script/fetch/xhr` if a static
   snapshot is needed.
4. Rename the brand everywhere the user asks (copy, alt, meta, footer ©, testimonials) — grep the source for the old name.
5. Drop pages the user excludes (Style Guide, Licensing, Changelog, Password, …) and remove their links.

## 1. Tokens and text styles — nothing raw

- **Every colour is a colour token**: fills, text, borders, gradients (`var(--token-…)` works inside gradients), shadows,
  placeholder colours, focus borders. No `#000000` / `#FFFFFF` / default blue. Create a token when one is missing
  (e.g. `White`, `Placeholder #999999`).
- **Every text uses a text style preset**; inline overrides only for what a preset cannot carry.
- Use the **exact font family** of the live site. Check `getComputedStyle(h1).fontFamily` — "Playfair" (variable,
  opsz/wdth/wght) is NOT "Playfair Display".
- Variable fonts with an optical-size axis: set `fontVariationAxes: { opsz: <font-size>, wght: <weight> }` on every
  preset/node, otherwise Framer renders opsz = min (wide, low-contrast letters) while the browser uses auto opsz.
- Heading line-height from the live CSS (e.g. 1.1), not a default 1.2.
- Fluid headings: text-style breakpoints are widest-first. To get 80px ≥1440 and 72px ≥1200: set
  `breakpoint.default.minWidth = 1440px` (80px), then a slot at 1200 (72px), 810 (70px), 0 (52px). Add/remove slots one
  patch at a time and read back after each — adding `large` relabels slots.

## 2. Layout — native, editable, measured

- Container: section `width:100%` + side padding (15) → inner wrapper `width:100%`, `maxWidth` = live max-width minus
  padding (1400 − 30 = **1370**). The header bar gets the same inner wrapper, logo left / nav right.
- Section paddings from measurements; **no double spacing** (section bottom + next section top). But keep the spacing
  the live site really has — e.g. Journal → 130 → 1px divider → 130 → CTA heading. Never zero a padding without
  checking what sits below it.
- Hero/banner art: reproduce the live image box exactly. Noverde hero = section `minHeight:100vh`; valley image
  absolute `top 0, left 0, right 0, height 112%`, fill anchored **bottom** (lower 12% cropped); clouds absolute
  **behind** the valley (`zIndex 0`, valley `1`, copy `2`) so they only show through the transparent sky.
- Measured text widths (lead `522px`, title `maxWidth 700` + `textWrap: balance`) so line breaks match the live site.
- **Explicit `htmlTag` on every frame** (section, header, nav, footer, article, figure, form, button, div…); text uses
  `tag` h1–h6/p.
- Overflow clip on sections and cards; absolute children need both pins.

## 3. Components

- Repeated elements are components: buttons (variants Primary / Secondary / Neutral + hover + pressed gesture variants),
  header (Top / Scrolled variants + override), cards, testimonials.
- **CMS collection items are components too.** Build the list item as a frame, bind it to CMS, then run
  `tree.createComponentFromFrame(item, "<Name>")` — Framer turns every CMS binding into a component variable and binds
  the repeated instance's controls to the collection fields. Then rename the instance (motion selectors use the name)
  and restore its width/height.
- Pins are lost by `createComponentFromFrame` on fixed nodes — re-set `top/left` afterwards.
- `tapEffect`/`scale` are not allowed on a variant root — use a `pressed` gesture variant.

## 4. CMS

- Every list-like section is a real Collection List (`collectionList: { collection, repeatedDescendantId, limit, sorting }`)
  bound with `tree.ref(fieldId, list)`; images via `fill: tree.ref(photo, list)`; dates via `toDateString` (en-US, long).
- Carousels/galleries driven by CMS: list with `limit` = item count, horizontal stack, `overflow: clip`, items 100% wide;
  the motion code stacks and switches them.
- Photo stacks that follow scrolling (services stage) = a second CMS list of image items absolutely filling the frame.

## 5. Forms

- Style every input: fill token, 1px border token, radius, padding, text colour token, **placeholder colour token**,
  **focused border token** (live focus colour, never Framer's default blue), focused fill.
- Submit must be a component instance set as `formSubmitButtonId`.

## 6. Header

- Fixed instance in the layout template, `top 0, left 0, width 100%, zIndex 50`, override switching Top → Scrolled.
- Nav links: live padding (0 20 → gap 40), 12px uppercase 0.08em; CTA inside the nav pill, sentence case, live size.
- Dropdowns as `RelativeOverlayNode` on the trigger.

## 7. Motion — code overrides, 1:1 with the source

- One file `<Brand>Motion.tsx`, one override `with<Brand>Motion` attached to the **first section** of the page; it finds
  everything **by layer name** (`[data-framer-name="…"]`), so the canvas stays editable.
- Imports must be **URL modules** — bare `"gsap"` / `"lenis"` make Framer drop the override silently:
  `import { gsap } from "https://esm.sh/gsap@3.12.5"`, `.../gsap@3.12.5/ScrollTrigger`, `https://esm.sh/lenis@1.1.13`,
  each with `// @ts-ignore`. Override signature: `export function withX(Component: any): ComponentType { return (props: any) => … }`.
- No flash: the override renders a `<style>` (SSR) that hides animated elements until `html.vd-ready`, with a 3s CSS
  fallback; the boot sets GSAP start states, adds the class, then animates. Skip everything on `RenderTarget.canvas`.
- Port the source constants exactly (Noverde: reveal 1.05s power3.out, delay .45, ENTER `top 78%`, headings `top 82%`
  cut into words yPercent 118 + rotate 3 expo.out stagger .07, batch reveal y24 scale .985 stagger .1, Lenis 1.15s,
  hero wipe + scale 1.09→1 + drift, clouds yPercent 18 scrub, services stage sticky + photo/tick/title switch at
  `top 58%`, voices slats clip-wipe + accordion, case carousel fade, card lean scale 1.055 + y −4).
- Layer-name conventions: `hero-title / hero-lead / hero-cta / hero-scene / hero-clouds`, `… · reveal`,
  `svc-item / svc-title / svc-ix / svc-get / svc-shot / svc-tick / svc-step / svc-what / svc-stage`,
  `voice / voice-body`, `case-list / case-slide / case-body / case-prev / case-next`, `post-card`, `art`, `split`.
- Button hovers come from component gesture variants matching the live colours; never leave a hover unstyled.

## 8. QA after every section

- Screenshot each section in Framer and compare with the live crop at the same width; fix before moving on.
- Re-check wide screens (1440/1800) for container width, hero composition and type size.
- Zero linter errors; warnings only where intentional (bleeding art, collapsed accordion bodies).
- Never publish — the designer publishes. Ask her to publish, then verify motion on the published URL with Playwright.

## 11. Inner pages pipeline (after Home is approved)

Tools live in `stand/tools`: `prep.cjs` → `measure.cjs` → `native.cjs` → `resolve.cjs` → gzip+base64 → upload → replay.

1. Render each design page in Chromium (scripts blocked), then `node prep.cjs <rendered> <out> <assetBase>`: main's sections
   become named body children, header/footer dropped (the layout template owns them), brand renamed, asset URLs absolute.
2. `measure.cjs` at 1200/810/390 → `native.cjs` (FONT_MAP must map Playfair → "Playfair") → copy the spec bundle per page
   (`b-<page>.json`, the tool overwrites one file).
3. `node resolve.cjs b-<page>.json pages/ds.json r-<page>.json` — colours → existing tokens (or new "<Base> <alpha>"),
   presets → existing text styles when font/weight/case/sizes at 1200/810/390/line-height match, otherwise one new
   `Verdova/…` preset; links → Framer paths (+ `collectionItem` for detail pages), dropped pages unlinked.
4. Upload as `{"z": base64(gzip(json))}` — `fetch` inside `exec` fails on big or text/plain files.
5. Replay program per page: create Tablet/Phone page breakpoints if missing, set breakpoint heights in px (9000 / 10000 /
   12000 — a 1080 default makes the linter report every section as overlapping), clear the breakpoint, insert ops in
   order, patch replicas `${bpId}${nodeId}`; refresh token/preset lists per page; drop `overflowX/Y: "visible"`.
   Several pages per `exec` call is fine (~4).
6. Attach `with<Brand>Motion` to every page's first section. The motion file must match names with `~=` (word match) —
   converted layers are named after all their classes plus `[data-…]` attributes — and reveal
   `[data-framer-name*="[data-reveal"]` as well as `· reveal`.
7. Page paths follow the live site (`/team` → `/our-team`); Framer rewrites every link to the page automatically.
8. Then per page: CMS lists + CMS-bound detail pages, buttons → Button instances, publish → QA vs live at 1440/810/390.

**Source = the LIVE site, not the design tool.** The design-tool markup differed from live (container 1250 vs 1370,
other blocks, other copy). Snapshot each live page with `snap.cjs` (Chromium, JavaScript disabled — Webflow pages are
server-rendered, nothing from the page runs), `prep.cjs` takes `body > section` when there is no `<main>`.
**Measure desktop at 1440** (`measure.cjs … 1440,810,390`), the width you QA at — a 1200 measurement gives a narrower
media-query layout (2-col grids, 1280 containers, smaller images).
Converter rules learned in QA:
- Container centring only when the capped child fills the column; a narrower left-aligned title stays left.
- Column children with `margin: auto` (every narrower child centred) → `stackAlignment: center`.
- A fit-content box whose children all fill (image wraps) collapses to 0 → give it the measured width (100% when it
  fills its parent).
- Tiled CSS patterns (dot grid, hatching, small `background-size`) have no Framer equivalent → keep the base
  `background-color`; with real gradient layers keep the colour as the fill and draw the gradients above it.
- Strip `[data-wf-…]` / `[data-w-id]` from layer names.
- Set page `metadata` {title, description} from the live `<title>` / meta description (brand renamed).
- Header nav pill on photos: `fill` = bone 62% token + `backgroundBlur: 14px` + radius 10 + padding 7 (live glass).

## 10. Responsive (Tablet 810 / Phone 390)

- Measure the live site at 810 and 390 first (section paddings, heading sizes, grid columns, which blocks stack, centring) and screenshot every section + the open burger menu.
- Create page AND layout-template breakpoints (`createVariant(primaryBp, id, {gesture:null, width})`; template/page-with-template breakpoints need a fixed px height).
- Type: give presets breakpoint slots from the live values (Noverde: H1 52, H2 40, Statement 36/26, lead 18, quote 22, case claim 26); slot labels shift when adding — read back after every patch.
- Header: component variants `Mobile` (logo + burger, fixed 77px, clip) and `Mobile Open` (drawer: Playfair links with bottom rules, chevron row, full-width CTA instance) toggled with `SET_VARIANT`; set the instance variant per template breakpoint.
- Components that must change layout per breakpoint get variants (Case Slide Tablet/Phone, Service Row Stacked with its own CMS photo) and the instance picks the variant on each breakpoint.
- Desktop-only motion (accordion) is gated with `matchMedia('(min-width:1200px)')`; below it the same cards become a scroll-snap slider with prev/next buttons.
- Dense tables on phone: hide secondary columns per breakpoint, tiles go to a 2-column grid.
- `overflowX:auto` is rejected on some frames — do horizontal scrolling in the override instead.
- Instance link controls to CMS detail pages sometimes need a string `href` attempt before the `{href, collectionItem}` object is accepted.

## 9. Corrections log (do these right the first time)

| Mistake | Correct |
|---|---|
| Container 1250 everywhere | measure at 1800: `max-width 1400 − 2×15 = 1370` |
| Playfair Display | the live "Playfair" variable font + opsz = size |
| Hero valley as a 560px strip below the copy | full-bleed absolute, 112% height, bottom-anchored, clouds behind |
| Clouds over the trees | z-order: clouds 0 < valley 1 < copy 2 |
| Zeroed Journal bottom padding "to remove double spacing" | 130 → divider → 130, as live |
| Raw `000000` on SVG icons | Lucide IconNode, colour via the set's colour control bound to a token |
| Input with default blue focus / grey text | tokens for fill, text, placeholder, border, focus border |
| CMS items as plain frames | `createComponentFromFrame` → component with bound variables |
| Animations postponed to the end | plan motion with the layout; name layers as you build |
| Override with `import "gsap"` not detected | URL imports from esm.sh |
| Nav links 11px / no hover / CTA glued to "All pages" | read the live preset exactly (12px, 500, 0.08em), pill hover rgba(255,255,255,.78) r10, 8px gap before the CTA |
| Header CTA without hover | every clickable frame gets `hoverEffect` (CTA bg → darker token, 0.25s) |
| Primary hover = flat colour swap | live = dark disc grows from the arrow (absolute circle in the variant, scale 0 → 20, 0.5s power3.out), ink → bone, arrow x+5; the hover border takes the disc colour so no 1px ring stays |
| Hero photo too saturated | copy the live overlay (radial bone veil) with alpha tokens |
| Case carousel faded | live slides horizontally (xPercent track, 0.9s), content in the 1370 container |
| Tab panel collapsed / glued to the stage edge when shown | the active panel gets explicit `width:100%` + max-width AND inline `top:0; left:0; right:auto` — Framer's pins stay in the class CSS and shift a `relative` element |
| Journal card hover missing the corner | hover gesture variant on the card component: bone 52px "bite" with ↗ |
| CMS copy taken from the design tool | when it differs, the LIVE site copy wins (titles, dates) |
