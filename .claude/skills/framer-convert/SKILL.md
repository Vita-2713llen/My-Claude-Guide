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
5. **Every email on the Framer site is `info@example.com` — MANDATORY, no exceptions.** Visible text, `mailto:`
   hrefs (frame links AND TextRun links inside rich text), form error/success copy, CMS fields (team emails +
   their `mailto:` link fields), input placeholders, code files. Do it in the first replay pass, then re-scan the
   whole tree (walk every node, JSON-stringify every attribute, regex for emails) — replica breakpoints can carry
   their own text overrides, so fix those with `tree.replaceText(replicaId, old, new)` too. QA fails if any other
   address remains (`emailaudit`: grep the published HTML of every page for `@` addresses ≠ info@example.com).
6. Drop pages the user excludes (Style Guide, Licensing, Changelog, Password, …) and remove their links.

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
- **Every live `.w-dyn-list` is a CMS list and every item is a component — without being asked.** Recipe for an existing
  list (proven on 10 lists):
  1. target = the repeated item's single child frame (if the item has several children, wrap them first in a frame that
     copies the item's stack props and per-breakpoint layout; the item itself must stay the `repeatedDescendantId`);
  2. record per-breakpoint replica diffs of the target and all descendants **by child-index path** (width, height, gap,
     padding, direction, visible, fontSize, …) — they are lost when the frame becomes a component;
  3. `createComponentFromFrame` (auto-creates variables for some bindings only) → walk the primary variant, for every
     prop still bound to the list (`providerId === list`) create a var (`string`/`image`/`link`/`date`), re-bind the node
     to `tree.ref(var, comp)`, and set the instance control to `tree.ref(field, list)`;
  4. **new controls can't be set in the same program that creates the var** — call `await api.controls.components([id])`
     in a following program, then patch `$control__<varId>`;
  5. create `Tablet` / `Phone` variants with `tree.createVariant(primary, id, {gesture:null,name})`, apply the recorded
     diffs by path, offset their `top` (ground nodes must not overlap), and set `$control__variant` on the tablet/phone
     replicas of the instance;
  6. **rename every variant root to the live class string** (`service-list-row w-inline-block`, `crew-card tablet`) —
     `createComponentFromFrame` names it "Variant 1" and every hover/motion selector stops matching.
- Check each Phone variant against the live ≤767 CSS — a 4-column desktop row copied to phone squeezes text to one letter
  per line (use absolute number + padded name, full-width copy/media, `aspectRatio` needs a px height).

## 4. CMS

- Every list-like section is a real Collection List (`collectionList: { collection, repeatedDescendantId, limit, sorting }`)
  bound with `tree.ref(fieldId, list)`; images via `fill: tree.ref(photo, list)`; dates via `toDateString` (en-US, long).
- Carousels/galleries driven by CMS: list with `limit` = item count, horizontal stack, `overflow: clip`, items 100% wide;
  the motion code stacks and switches them.
- Photo stacks that follow scrolling (services stage) = a second CMS list of image items absolutely filling the frame.
- **CMS detail templates: bind EVERYTHING that changes per item** (title, lead, role, figures, dates, hero image, email,
  body). A static template shows one item's copy on every slug. Text: `text: tree.ref(field, pageId)`; image frames:
  `fill: tree.ref(imageField, pageId)` (`backgroundImage`/`fillImage` are rejected); dates:
  `{from: tree.ref(dateField, pageId), transforms:[{name:'toDateString',display:'date',format:'all',dateStyle:'long'}]}`;
  `mailto:` links: add a `link` field (`mailto:` + email) and bind `link.href`. Verify every slug with `slugmap.js`
  (h1 per slug live vs Framer) and `itemdiff.js` (texts that differ between two live items must appear on ours).
- **Rich bodies** = ONE `RichTextNode` bound to the richtext field (delete the measured paragraphs/spacers) with per-tag
  presets whose tag matches (`stylePresetHeading2` must be an h2 preset, etc.). Bound rich text renders `blockquote`, `li`,
  `img` as `.framer-text` elements themselves — style them with injected CSS keyed by the node name
  (`.team-body blockquote.framer-text{…}`, `li.framer-text`, `img.framer-text{border-radius:20px;margin:40px 0}`).
- `TextMediaBlock` images publish as raw `data:framer/asset-reference,<hash>.<ext>` → the override rewrites them to
  `https://framerusercontent.com/images/<hash>.<ext>` at runtime (`fixRtImgs`).
- A collection list can show a different count per breakpoint: patch the replica `collectionList.limit`.

## 5. Forms

- Style every input: fill token, 1px border token, radius, padding, text colour token, **placeholder colour token**,
  **focused border token** (live focus colour, never Framer's default blue), focused fill.
- Submit must be a component instance set as `formSubmitButtonId`.
- **Never leave a live form as plain frames** (the converter outputs `w-input` divs): replace each with
  `FormPlainTextInputNode` (`formTextInputType` text/email/tel/textarea, `formInputName`, `formInputPlaceholder` = live
  placeholder, `formInputRequired`) or `FormSelectNode` (`formSelectOptions` from the live `<option>`s, drop the fake
  chevron, `formInputIconColor`). Read names/placeholders/options/button label/success text from the live DOM with
  Playwright (`formprobe.js`). Set the cell wrappers to `htmlTag:"label"`. `transition` is not accepted on inputs.
- Submit component: variant root needs a **px width** (instance is `100%`), hover = `tree.createVariant(root, id,
  {gesture:"hover", fill})`, label = string var → instance `$control__…` = live button value.
- Footer subscribe form too (placeholder "Email", live widths).

## 6. Header

- Fixed instance in the layout template, `top 0, left 0, width 100%, zIndex 50`, override switching Top → Scrolled.
- Nav links: live padding (0 20 → gap 40), 12px uppercase 0.08em; CTA inside the nav pill, sentence case, live size.
- Dropdowns as `RelativeOverlayNode` on the trigger.
- **One pill, symmetric padding**: the glass pill (fill, 1px border, radius 10, blur 14, padding 6) wraps the links
  (gap 2) AND the CTA (gap 8 before it). A pill inside a padded wrapper gives 13px left / 6px right — the designer sees it.
- Name header/footer nodes with the live classes (`head-nav-link`, `head-nav-link head-drop-trigger`, `head-chevron`,
  `head-drop-item`, `button button-solid`, `foot-link`, `foot-button`) so the generated hover CSS reaches them.
- **The logo always links to Home (`/`).** That applies to every header variant (Top, Scrolled, Mobile, Mobile Open,
  Mobile Pages) and to the footer logo. Verify it by clicking the logo, not by reading the tree: probe
  `elementFromPoint` over the whole logo, icon included, on 360, 810 and 1440.
- **Burger = the live burger, measured.** Open it on live at 360 with `hasTouch:true, isMobile:true`, because a
  Webflow dropdown ignores a mouse click in headless. Copy these:
  - the bar height (live 52 px inside 12 px padding);
  - the first link's top (live 78);
  - the row heights;
  - the **All Pages submenu panel**: live is `max-height:219px; overflow-y:auto`, a short scrolling panel. Ours grew
    to its full 15 links, so Contact, Licensing and 404 fell below the screen and the designer saw "no links".
    Use `[data-framer-name="Pages list"]{max-height:219px;overflow-y:auto;overscroll-behavior:contain}` and keep it
    in Lenis `prevent`;
  - the chevron flip when open, with `transform:rotate(180deg)!important`. Framer's svg class overrides it
    otherwise.

  Check: every submenu link is reachable by scrolling the panel (`elementFromPoint` hits each `a`).
  - **A tap on a burger link must close the menu.** The header lives in the layout template and survives page
    navigation, so the "Mobile Open" variant stays open on the new page. In the global capture click handler, when
    the link is inside `Mobile Open` or `Mobile Pages`:
    - remove `html.vd-ap`;
    - send the Burger a real tap: `pointerdown` + `pointerup` (on the button and on `window`) + `click`, with
      `clientX`/`clientY`. Framer variant taps ignore a bare `.click()`.

    Check: click About, and a submenu link, at 390 and 992. The header must be back to `Mobile` (77 px) and the page
    at the top.
- **Bottom-anchored background pictures must stay bottom-anchored on every replica.** The consult landscape is
  `bottom:0; height:34%` of the section on live. The 390 replica froze it as `top:743px; height:383px`, which left a
  95 px empty strip at 360 and overflowed the section at 600. On tablet and phone replicas set
  `{top:null, bottom:"0px", height:"<live % of section>"}` (measure the live ratio at 2–3 widths). Check
  `gapBottom = section.bottom − image.bottom` is 0 at 360, 600 and 810 (`land.js`-style probe).
- **Absolute pairs (slider arrows) frozen in px on tablet/phone replicas drift off-centre between breakpoints.**
  `left:342px` is centred only at exactly 810. Framer rejects `calc()` in `left`, and `centerX` is not a property.
  Centre them with CSS under `@media (max-width:1199.98px)`: back `left:calc(50% - (w + gap/2))`, next
  `left:calc(50% + gap/2)`, both `!important`. Then measure the **pair** (not the icons inside) at 360…1199.
- **A scrolling list gets no border.** The burger "Pages list" (max-height 219, overflow auto) had a border-bottom.
  The border sits on the visible edge of the scroll box, so it looks like a divider between two items. Framer draws
  borders in `::after`, so a probe must read `getComputedStyle(e, "::after")`. Remove it with
  `borderColor: "rgba(0,0,0,0)"`; `borderBottom: 0` gives "Border is incomplete".
- **Card grids whose column count changes inside one Framer breakpoint.** Webflow pricing is 2+1 at 810–991, with
  the third card 380 px and centred, and 3 in a row from 992. Framer tablet covers 810–1199.
  - On the tablet replica, the lone last card spans **all** grid columns (`gridItemColumnSpan` = the column count)
    with `gridItemHorizontalAlignment: "center"`. Spanning 2 leaves it on the left.
  - At 992–1199, CSS in `PRE_CSS`:
    `@media (min-width:992px) and (max-width:1199.98px){list{grid-template-columns:repeat(3,minmax(0,1fr))!important} list>*{grid-column:auto/span 1!important;width:100%!important;justify-self:stretch!important;align-self:stretch!important}}`
  - Check the cards' x-ranges against live at 810, 992 and 1100 (`pcards.js` style), then take a screenshot.
- **Never freeze an aspect-ratio picture in px on replicas.** The hero media is 16:9 on live. The 390 and 810
  replicas froze it at 219 and 455 px, so it was 219 px tall at 600 (live 337), with a 118 px empty band above it.
  - Fix it with `height:auto; aspect-ratio:16/9; max-height:100%; min-height:0; overflow:hidden` under
    `@media (max-width:1199.98px)`.
  - Without `min-height:0` and `overflow:hidden`, the content min-size makes the box taller than the ratio.
  - Live desktop hero sections are `100vh` from 992, so add `min-height:100vh` to the hero section at 992–1199.
- **Live `max-height` steps inside one Framer breakpoint.** `metrics-media` is 300 px ≤479, 320 px at 480–767, and
  314 px as a row (`metrics-card` row, media right) at 768–991. Framer phone (<810) froze 300 px in a column.
  1. Read the live CSS rules for the class: download `site.css` and find every `@media` block that names it.
  2. Reproduce each step with a CSS media query.
- **`fr` widths in a Framer stack are not CSS-grid `fr`.** A live grid of `1.05fr 1fr` became a stack with media
  `1.05fr` and panel `1fr`. The panel's content min-width won, and the media came out 30 px narrower. Pin the
  basis: `media{flex:0 0 calc((100% - gap) * 1.05 / 2.05)} panel{flex:1 1 0}`. Measure both columns against live.
- **Image-fill audit: `tools/imgfill.js`** (in `qa_all.sh`). It reports where a photo leaves a strip that live
  does not. Two cases are not real strips:
  - A box mid-reveal, with a transform on an ancestor. The tool now skips these.
  - An offset against a whole `section`, because the text above is taller or the layout differs.

  Compare the image **size** with live first. A strip inside the image's own card or wrap is always real.
- **Blog Previous / Next on a CMS detail page.**
  - The button link is `{href: "/blog/:<slugFieldId>", collectionItem: tree.ref("previousItemId.<slugFieldId>", <itemId>)}`.
  - Visibility is `visible: {from: tree.ref("previousItemId", page), transforms: [{name: "isSet"}]}`.
  - The order is the collection item order. Reorder the items to live's order first.
  - Framer does not wrap: the first post has no Previous and the last has no Next, while Webflow wraps. Tell the
    designer.
- **Navigation inside the same template replays the load animation.** Post → next post keeps the page component
  mounted, so `boot()` does not run again. The motion file therefore runs a route watcher:
  - A 50 ms interval on `location.pathname`.
  - It waits until the **same** `h1` element gets new text, so that it does not animate the old page while the new
    chunk loads.
  - Then it replays `vdLoadFade` on the first-screen units: `animation:none`, a reflow, then the animation with a
    stagger.
  - It sets `__vdReplayAt`, so a cross-template boot right after it does not animate twice.

  Check: click Next at 390 and 1440. The `h1` must go op0, then fade in within about 1 s, with the page at the top.
- **Runs and attachment rows: gaps and wrapping.** Each name is `1fr`, so it wraps instead of pushing the size out.
  Each fixed spacer is 10 px. Hidden phone spacers must be visible on the replica. A row with `gap` needs
  `stackDistribution:"start"`, because Framer refuses `gap` with space-between.
- **Hover-only transforms on phone.** At ≤991, `service-list-media` / `-image` must be `transform:none` and the
  tag must be `opacity:1`, as on live.
- **Every live interaction must exist in Framer.** The About FAQ had the tree (head, answer-wrap at 0 px, the + bars)
  but no click handler, so it never opened. For every live accordion, tab, switch or dropdown, write the handler
  (GSAP `height: auto`, rotate the + bar 90 → 0, `aria-expanded`), then run `tools/clickaudit.js <w>`. It clicks the
  same class on live and Framer and reports `DEAD` or `MISSING`.
- **Form selects:** Webflow's `padding-right:40px` (room for the arrow) lands on the FormSelectNode wrapper **and** on
  the `<select>`. The select shrinks by 40 px and the chevron sits 50 px from the edge. Use node padding
  `8px 15px 8px 15px`.
- **Column dividers become nothing when columns stack.** A desktop `border-left` between side-by-side items (office
  channels) draws a stray vertical line on phone and tablet, where the items stack. Override it on the 810 and 390
  replicas. Do not set the width to `0px`, which makes the linter report "Border is incomplete"; set
  `borderColor:"rgba(0,0,0,0)"` instead. Live has no border there (`liveoff.js`-style check of computed borders
  per width).
- **Template utility pages are NOT part of the client site: ask before building or linking them.** A Webflow template
  ships Licensing (licenses), Changelog, Style Guide, Template Instructions, Password, and "Template by … / Powered
  by Webflow" credits. Before converting, and again before the footer and the burger "All Pages" list are built,
  **ask the designer** two things:
  1. Which pages are skipped? Default: all utility pages.
  2. What replaces their footer column and menu links: other real pages, or contact details (email, phone,
     address, socials)?

  Never copy the template's "Legal: Licensing / Changelog / Style Guide" column as it is. On Verdova the designer
  had said not to build them, and they still ended up in the footer.

  Check: grep the published footer, burger and sitemap for `licenses|changelog|style-guide|template|webflow`. Any
  hit the designer did not approve is a defect.
- Footer = the live footer: services column is a CMS list (live order, e.g. Number desc, limit 4) of a
  `Footer Service Link` component; Company / Legal columns at the live x positions; never leave
  `/services/:<collectionId>` links without a collection item (they publish as broken `/:<slugVarId>` hrefs).

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
- **All hovers, measured, not guessed** (`hovaudit.js` → `hovgen.js`): Playwright hovers every live element that has a
  `:hover` rule, a `data-w-id` (Webflow IX2) or is a link, records computed colour / background / border / opacity /
  transform / shadow of the element and its descendants before → after, and does the same on the published Framer page
  by layer name. `hovgen.js` turns the live end-states into CSS keyed by `[data-framer-name~="class"]` (colour also sets
  `--framer-text-color` and reaches `.framer-text`; `!important` to beat inline styles; base states for hidden-until-hover
  parts such as `service-list-fill scaleX(0)`, arrows/tags opacity 0) inside `@media (hover:hover)`, and the motion file
  injects it once as `<style id="…-hover">`. Skip parts already driven by GSAP (button-hero fill). Re-run the audit after
  publishing: every line must be gone.
- **Sticky = `position:"sticky"` + `positionStickyTop`** — `top` is ignored for sticky (published as `top:auto`). Grep the
  live CSS for `position: sticky` (runs cards 118/144/170, article contents 100, prose aside 118, testimonial pin 100)
  and its breakpoints (often desktop only → replicas `relative`). Parent stack must be `stackAlignment:start`.
  `overflow: clip` ancestors are fine.
- Scroll-spy contents ("On this page"): labels scroll to the heading with the same text (offset 120) and the active one
  gets ink colour + 2px ink left border.
- Run `scrollaudit.js` (samples every 150px of scroll on live and Framer) to catch parallax / scrub / marquee / counters
  that do not move on Framer.

## 8. QA after every section

- Screenshot each section in Framer and compare with the live crop at the same width; fix before moving on.
- Re-check wide screens (1440/1800) for container width, hero composition and type size.
- **Over-scan art layers** (`width:111%; top/left:-5.5%` in Webflow) must not be frozen to the 1440 px width: set
  `width/height:"111%"` + all four pins (`left/right/top/bottom` = the negative offset). Sweep every page for frames
  wider than ~1150px inside absolute 100% wraps — a frozen 1598px image leaves an empty strip at 1800.
- Audit scripts (scratch, keep in `tools/`): `hovaudit.js` (hovers + links), `scrollaudit.js` (scroll-linked motion),
  `dynlists.js` (every live `.w-dyn-list` must be a CMS list), `formprobe.js`, `navprobe.js` (header geometry).
  Do the user's job before they see it: run them on every page after each publish.
- **Measure every page, every width, every publish** — `tools/heights.js` (page heights 1440/810/390), then for any
  page with |Δ| > ~10px `tools/sections.js` → `tools/anchors.js` (which heading first moves) → `tools/tree.js` /
  `tools/tree2.js` (live class vs Framer layer outline with sizes, gaps, paddings) → `tools/cssq.js` (live computed
  CSS of one selector at 3 widths). Fix until every page is within a few px at all three widths.
- **Typography audit** — `tools/textaudit.js <width>` matches every text live vs Framer by content and diffs
  font-size / line-height / letter-spacing / weight / transform / family; `tools/textwho.js` shows which element and
  preset a text belongs to. Shared presets often hide per-element differences (one user has `-0.05em`, the rest
  `-0.01em`): clone the preset for those users instead of editing the shared one.
- Rich text: `tools/rtcmp.js` compares a body block by block (tag, height, margins, font).
- Hovers visually: `tools/hovshot.js <page> <liveSel> <framerSel> <tag>` saves rest/hover crops of both sites.
- Zero linter errors; warnings only where intentional (bleeding art, collapsed accordion bodies).
- Publish yourself when the designer has asked for it (`api.publishing.publish()`), then verify on the published URL
  with Playwright. Otherwise ask the designer to publish.
- **Test the in-between widths, not only 1440/810/390.** The designer opens 360, 768, 992, 1100 and 1765.
  Framer has 3 breakpoints (≥1200 / 810–1199 / <810), and every px value set on the 810 or 390 replica is frozen
  across the whole range. Run these after every publish:
  - `tools/visaudit.js 360,390,480,600,700,768,810,900,992,1100,1199,1280` → overlapping texts, text cut by a
    clipping ancestor or by the viewport, controls cut by the viewport. The audit is clip-aware: it skips offscreen
    slides, collapsed accordions and masked word reveals, and it respects the containing block of absolute boxes.
    A 0-height `overflow:hidden` FAQ body really does clip.
  - `tools/stretchaudit.js 810 900,992,1100,1199` and `… 390 360,480,600,700,809` → elements that stop stretching,
    lose centring or overflow when the width changes inside one breakpoint. Many "stops stretching" hits are
    legitimate max-width caps; overflows and off-screen hits never are.
  - `tools/slidertest.js` → click every slider arrow at 360/768/992 and confirm the slide changes.
- **Replica px traps found by those audits** (scan the tree: replica nodes whose width is ≥ 300px on the phone or
  ≥ 660px on the tablet, or whose stack height is a fixed px value while they hold text):
  - Slides, CMS items, lead texts or titles frozen at the base width (360 / 780) overflow at 360 and leave a gap at
    700. Set them to `100%`.
  - A wrapper with a fixed height (a tablet `platform-grid` at 1120px) lets a card grow past it at 992 and overlap
    the next section's heading. Set `height:auto`.
  - Slider masks at `108%` / `104%` (copied from the live `margin:-15px` + padding trick) push the card to the right
    and cut its icons. Set the mask to `100%` with no padding.
  - Absolute overlays measured at 1440 come out as `top:198px` with a fixed px `width`/`height` and an `aspectRatio`.
    The live rule was `bottom:18px; left:18px; right:18px; max-width:320px`, or insets of 15 on all four sides.
    At 1199/1280/360 the panel then slides out of its photo or gets cut. `{width:null}` is refused, so pin it in
    the code CSS: `top:auto; bottom:18px; height:auto; right:18px; width:auto; max-width:320px`. For a
    four-inset overlay, also set `aspect-ratio:auto` and all four insets explicitly.
  - Setting `width:"100%"` on a child whose parent stack is `width:auto` makes the child collapse to 0, and a title
    then breaks one letter per line. Before you set a child to 100%, give every auto-width parent up the chain
    `100%` as well. Afterwards, sweep for `100%` children inside `auto` parents.
  - A wrapper with a capped max-width sits on the left inside a `stackAlignment:"start"` parent at 768. Live centres
    it. Set the phone replica parent to `stackAlignment:"center"` (for example `testimonial-head`,
    `specification-intro`, `person-hero-title-group`). `tools/centertext.js` lists texts that are centred on live
    and off-centre on Framer, and `tools/offwrap.js` names the wrapper that is stuck on the left.
  - Absolute arrows accept only px `left`. Centre or right-anchor them with CSS in the code file instead:
    `left:calc(50% - 57px)` and `left:calc(100% - 76px)`.
- **Icons in round buttons must sit exactly in the centre.** Glyph wrappers imported from Webflow keep a
  line-height bottom padding (3–6px) that pushes the arrow up. Set those wrappers to `padding:0`. Check with
  `tools/iconcenter.js`: dx and dy must both be within 1px.
- **Everything in the burger must be clickable, every time.**
  - A `SET_VARIANT` onTap inside the open mobile menu (for example "All Pages" → a "Mobile Pages" variant) is
    flaky in published Framer. On the first open the stale tap callback is sometimes dropped, and roughly 3 of 20
    first taps did nothing.
  - Expand the page list in place instead:
    - Make the Pages list `visible` in the Mobile Open variant and remove the onTap.
    - Hide the list with CSS unless `html.vd-ap` is set.
    - Toggle that class with a click listener on `window` in the capture phase. Install the listener at **module
      load**, not inside the override effect, so it already works on the very first tap after load.
    - Make the drawer scroll: `flex:1 1 0; min-height:0; overflow-y:auto; data-lenis-prevent`.
  - Verify with `tools/burgertest.js 390 20`. It checks the expand rate (must be 20/20), that every sub-link
    navigates (scrolling inside the drawer), every top-level item, and the close button.
- **Framer's Inter renders slightly wider than Webflow's.** A label that fits exactly on live ("2026" in a 35.5px
  bar column, "Abated, costed" in 100px) breaks mid-word in Framer ("202 / 6"), because Framer text uses
  `pre-wrap` plus break-word. Give such short labels `white-space:nowrap`. `tools/wordbreak.js` lists every word
  broken across two lines. Hidden alternative prices and words mid-reveal show up as false positives.
- **Text on photos must pass contrast at every width.** When dark text sits on a photo that can be dark, use
  light text (`#f6f2e8`) with a darker top gradient, even if live alternates light and dark slides. The designer
  wants readability first.
- **Text on photos**: Webflow often stacks 3 gradients in one `background-image` on a scrim. A light top gradient
  is what makes dark text readable, and there is an alternating `top-dark` variant with light text. Framer's single
  fill keeps only one layer, and the dark text ends up on a dark photo. Replicate the stack in CSS with the live
  media queries (`max-width:991/767/479` are fine in code CSS). Use `:nth-child(odd/even)` for the alternating
  variant, and set text colour through `--framer-text-color`.
- **Smooth scroll (Lenis) and page navigation**: Framer shows the next page while Lenis keeps forcing the old
  scrollY for 1–2s, so the new page opens at the footer. Listen on `window` in the capture phase, because Framer's
  own document-level handler has already called `preventDefault`. For an internal link to another path: destroy
  Lenis, then `scrollTo(0,0)` on the frames after `location.pathname` changes. On init, set
  `history.scrollRestoration="manual"` and `scrollTo(0,0)` unless there is a hash.
- **Webflow desktop starts at 992, Framer desktop at 1200.** At 992–1199 live shows the desktop layout and Framer
  shows the tablet one. The designer opens 992 and calls it bad, so do not leave it. Give every section whose live
  layout changes at 992 a CSS block under `@media (min-width:992px) and (max-width:1199.98px)` in `PRE_CSS`, and
  compare it with live at 992 and 1100. Typical changes are a 3-column card grid, a title-left / lead-right
  header grid, 3 channel columns with `border-left` dividers, and 2 office cards side by side. Grid children
  need `width:100%; justify-self:stretch`, or the cards shrink to their content.
  - **Do NOT move the Framer breakpoint to 992 through the API.** Patching the primary frames to `width:992px`
    updates the SSR CSS ranges at once. The compiled page JS keeps `(min-width: 1200px)` for every page that is not
    open in the designer's editor, because only that page recompiles. Hydration then switches 992–1199 back to
    tablet, and the page flashes desktop, then tablet. Reopening the session, republishing, content tweaks and
    `getRect` did not recompile the other pages. If you ever need it, check every page module for
    `max-width: 1199.98px` after publishing (`modsloaded.js`) and revert at once if any remain.
- **QA agent: run it after every publish.** `.claude/agents/framer-qa.md` (the `framer-qa` subagent) runs
  `tools/qa_all.sh`, which works in three steps:
  1. `crawl.js` writes `pages.json` with every static page and every CMS item.
  2. `motionaudit.js` runs on its own, because motion timing is CPU-sensitive.
  3. The layout audits run in parallel: visaudit at 15 widths, wordbreak, centerstuck, iconcenter, sliders, burger,
     nav-to-top and heights.

  The agent then fixes each finding, republishes and re-checks. Delegate to it (or run the script yourself) before
  you tell the designer anything is done. Test **every CMS item**, not one per template: items differ in text
  length, and the one you skipped is the one that clips.
- **Content must wrap, never clip.** In Framer, auto-width text is `white-space:pre`. A title that fits at 1440
  is cut off at 360 by its `overflow:hidden` wrapper instead of wrapping onto the next line.
  - Give every title or name text a real width: `100%`, or `1fr` when the parent stack is horizontal. Give every
    `auto` parent up the chain `100%`.
  - Do not use a global `white-space:pre-wrap`. It broke button labels, which then wrapped and clipped. Scope it to
    heading containers only: `[data-framer-component-type="RichTextContainer"]:has(h1,h2,h3,h4):not(a *):not(button *)`.
  - After a bulk width patch, read the linter's "Horizontal stack … child with width=100%" list and switch those
    children to `1fr`. A 100% child in a row pushes the avatar or icon out.
  - **The heading `pre-wrap` rule breaks every heading inside an `auto` wrapper, at every breakpoint.** Framer
    renders an auto-width stack as `width:min-content`. With `white-space:pre` that was one line. With `pre-wrap`
    it becomes the longest word, so the desktop page banner read "What / it / costs", one word per line. That cost
    +150–470 px per page. So after any wrap or white-space change, check the **desktop** widths too, not only the
    widths you fixed:
    - `tools/headlines.js 1440,1100,1920` compares heading line counts with live and names the narrow wrapper.
    - `heights.js` shows the same regression as `d +150…+470 <<<` on every page with a banner.

    Fix it in the tree, on every breakpoint: set the heading text to `100%`, and set each `auto` parent up the chain
    to `100%` (or `1fr` when its parent is a horizontal stack). To find the candidates, walk the tree for a
    RichTextNode containing `<h1–h4>` that has an `auto` ancestor before any px-wide frame.
- **Load animation must start at first paint, on every page.** The motion code boots only after the Framer bundle
  has loaded (around 1.6 s), so a JS-only load animation means a blank or static first screen and "slow text".
  Use two layers:
  - **CSS first.** Put `@keyframes` on `[data-load=words|fade-in|fade-in-item|line-grow]` in the SSR `<style>`,
    under `prefers-reduced-motion:no-preference`.
  - **Early inline script.** Render it with `dangerouslySetInnerHTML` **after** `<Component/>`, because a `<script>`
    placed between the pre-hide style and the page root breaks `#vd-pre + *`. On DOMContentLoaded it marks every
    first-screen text, button and image `data-vd-in` and gives each an inline staggered `vdLoadFade` animation.

  The JS boot must then skip anything inside or containing `[data-vd-in]` or `[data-load]`. That covers the
  universal reveal pick, the heading split, the batch items and the IX3 one-shot load actions. If it does not skip
  them, the block jumps a second time at around 2.3 s. Target: the first screen fully shown by about 1 s (live is
  1.5–2 s).
- **Reveal speed.** Use `REVEAL {duration:.6, delay:.05}` with trigger `top 88%`, and cap stagger in long batches
  (`b.length>4 ? {amount:.3} : .08`). Otherwise a 20-row specimen card takes 2 s to appear and the designer calls
  the text slow.
- **Boot after hydration, animate the container.** A Framer page ships every breakpoint as SSR copies
  (`.ssr-variant` siblings). React swaps them for the live variant around 0.8–1 s, which is often *after* the
  override's `useEffect` and `rAF` have run `boot()`. Two failures follow:
  - GSAP hid nodes that were then thrown away, so the blog cards never revealed.
  - React re-applied the component root's `opacity:1` while GSAP's `translateY(24px) scale(.985)` stayed. The card
    sat 24 px low until the visitor scrolled.

  The fix has three parts:
  1. In `useEffect`, watch with a MutationObserver for removed nodes that are, or contain, `.ssr-variant`. Start
     `boot()` after 200 ms without removals, or at 1.5 s at the latest. Do not wait for "no `.ssr-variant +
     .ssr-variant`": the header keeps its copies for good, so that wait always times out.
  2. When a target is a component root whose parent is a lone `*-container` div, animate the container.
  3. Measure the trigger's top **before** `gsap.set(from)`. If it is already above the `top N%` line, `play()` now,
     because the `y:24` offset pushes a border card under the start line and it never fires.
  4. A late boot shows double animations that an early boot hid. The nodes React swapped in have no `data-vd-in`,
     so at the start of `boot()` mark every first-screen unit again with the early script's selector. The
     batch-reveal filter must also skip first-screen elements inside `[data-load=…]`, which the CSS keyframes
     already animated. Otherwise the services list fades in at about 1 s, then its descriptions hide and fade a
     second time at about 1.2 s (`LOAD-JUMP`).
- **The early-load CSS must not unhide hidden states.** `[data-vd-in] :is(h1…h6,p,…){opacity:1!important}` also
  showed the pricing "alt" figures, which the tree keeps at `opacity:0`, absolute, in the same spot. Every tier
  showed two overlapping prices. Give hidden alternates `visibility:hidden!important` (the switch still reads their
  `textContent`). Then screenshot every element whose hidden state comes from the tree.
- **Hover-only reveals must be visible without hover.** Live shows the service tags under 992 px. The desktop
  hover rule hid them on phone, so add `@media (max-width:991.98px){[data-framer-name="service-list-tag"]{opacity:1!important;transform:none!important}}`.

## 11. Inner pages pipeline (after Home is approved)

Tools live in `stand/tools` (snapshot copy in this skill's `tools/` folder): `prep.cjs` → `measure.cjs` → `native.cjs` → `resolve.cjs` → gzip+base64 → upload → replay.

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
- **QA the 1200 canvas too, not only the 1440 publish.** The Desktop breakpoint starts at 1200, so a layout measured at
  1440 must still hold at 1200: capped containers → `100%` + `maxWidth`, fixed-px text/boxes in a column → `maxWidth`
  + fill, single-line text in a column → `1fr` (it must wrap when the column narrows; only a left-aligned label in a
  centred column keeps `auto`). `auto`-width text never wraps in Framer — card blurbs ran out of the card.
- `margin-left/top: auto` computes to px (a 500px gap at 1440). Read the live CSS for classes with `margin-*: auto`
  (`AUTO_MARGIN` json): two children → `space-between`; otherwise a spacer `1fr` (min = CSS gap) before the pushed child
  (buttons at the bottom of pricing cards, figures on the right of sector rows).
- Equal-height cards (grid/row, align stretch, own surface, same height in the row) → `height: 1fr` — works in an
  auto-height grid and follows the tallest card. A stretched card must never keep a fixed px height.
- Grid tracks: a column that keeps its width when the viewport changes (`dw` ≈ 0: avatar 46px, photo 206px) stays px;
  only fluid columns become `fr` — otherwise a 46px avatar grows into a pill.
- Uneven multi-row grids (quote card = text over [avatar | byline]; lead card = [photo | text over byline]) have no
  Framer form: `regrid` splits them into rows (or columns when one child spans all rows) and wraps each group in a stack.
- Webflow icon-font glyphs (`w-icon-slider-left/right`) render empty in Framer → prep replaces them with SVG chevrons.
- States a script switches (alt prices, collapsed accordion text) are `display:none` and would be dropped: list them in
  `KEEP_STATES` (CSS selectors) — prep keeps them absolute + opacity 0 so the layer exists for the motion code.
- Scroll stages (`testimonial-stage` 256vh + `testimonial-pin` sticky) → set the pin `position: sticky, top: 100px`
  natively (relative on 810/390), and the motion code turns the cards per third of the scroll (out −28px, in +28px).
- Live inner-page interactions to port into the motion file (probe live with Playwright hover/click first): Webflow
  sliders (arrows step one card, wrap), cases rows (click opens text + switches panel), price switch (swap figures),
  FAQ (height 0→auto, plus → minus, bg white 95%), team card (photo scale .62/−7% → 1 + veil), buttons (`button-fill`
  circle scale 0→20 from the arrow, arrow x+5, label bone), journal card (photo 1.04).
- Transformed elements measure at their transformed rect (team photo at scale .62) — the motion code resets them to
  inset 0 + transform; on canvas give a px left that centres at 1200–1440.
- Publishing: with staging off `publishing.publish()` goes straight to production. The designer said "роби це сам" —
  publish yourself after each fix round, then QA the published site with Playwright (hover, click, scroll states and
  `pageerror`). On a new project without that explicit permission: ask first.
- **Every `w-dyn-list` is a CMS collection list — never leave static copies** (the designer: "це ж колекція!").
  Per list: find each item's CMS row by the slug in its detail link (`collectionItem`), write the live texts/images into
  the CMS (live = source of truth; delete rows the live site does not have), keep the first item as the template,
  delete the rest, `collectionList: {collection, repeatedDescendantId, limit?}` + `collectionList.sorting:
  [{variable: tree.ref(varId, list), direction: "asc"|"desc"}]` (add an `Order` number field when two pages show the
  same collection in different orders), bind `text` / `fill` / `link.collectionItem` with `tree.ref(var, list)`,
  socials with `link: {href: tree.ref(linkVar, list)}`, dates with `{from: ref, transforms: [{name: "toDateString",
  dateStyle: "long"}]}`. Webflow sliders built from one-item lists per slide → move the first list into the mask
  (horizontal stack), item width = slide width per breakpoint (%), item height/padding from the slide/card (the slide
  gave the card its height), remove the slides; the motion code falls back from `w-slide` to `w-dyn-item`.
- A frame with `width: auto` whose children all fill (`1fr` / `%`) collapses to 0 → text one letter per line. Sweep
  EVERY breakpoint (replicas too) after each replay and set such frames to `100%`.
- Media beside a panel in a row (consult photo | card): the live photo stretches to the card → `height: 1fr` +
  `minHeight` = measured; keep the measured px on the stacked tablet/phone replicas.
- Images inside a transformed/scaled frame (team photo) must be `100% × 100%`, not the measured px height.
- Code edits: never splice code with `String.replace(anchor, text)` — `$$` in the text collapses to `$` (`$$(...)`
  became `$(...)` and the whole motion file threw on boot). Use `split(anchor).join(...)` or a function replacer.

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

- **SUPER HARD RULE — every repeated element is a COMPONENT.** Buttons, section CTAs, page banners, FAQ items,
  testimonial cards, list rows (price/consult/ledger/metrics), chips, slider arrows, logo items… anything that appears
  twice (same structure, on one page or across pages) becomes a `ComponentNode` with variables for what differs
  (text, link, image, variant) and every copy is an INSTANCE. Never leave a raw frame copy (e.g. a hand-built
  `button button-hero` frame next to the `Button` component). Inventory with a tree walk grouped by cleaned layer
  name + child signature (≥2 copies), build components in the first pass, and re-run the inventory before handing
  over — zero raw groups allowed. Keep inner layer names identical (motion/CSS select by name) and remember the
  instance root carries the variant name, so selectors that relied on the old root name need the wrapper name.
- **SUPER HARD RULE — every layer has a semantic tag.** Text: `h1`–`h6`/`p` on every RichTextNode (exactly ONE visible
  `h1` per page). Frames: `section` (page sections), `header`/`nav`/`footer` (chrome, menus, footer link columns),
  `article` (cards, incl. component variant roots of card components), `aside` (sidebars/TOC), `figure` (image
  wrappers without text), `button` (clickable non-links: accordions, slider arrows, tabs, toggles, dropdown trigger,
  form submit component roots), `form`/`label` (forms), explicit `div` for pure layout wrappers — the Tag field is
  never left empty. Layers with a link render as `<a href>` — do not tag them. Verify with `tagaudit.js` (one h1,
  no nested interactive, no `cursor:pointer` element that is not a/button) after publishing, then click-test the
  elements you turned into `button` (they keep their JS handlers).

- **Ported `:hover` rules must hit the layer that paints, not a component wrapper.** `HOVER_CSS` maps live classes to
  `data-framer-name~=class`. When the live element became a component INSTANCE (`foot-button` → Submit Button), the
  name sits on the square instance wrapper: `.foot-button:hover{background-color:…}` painted a square dark box behind
  the rounded button ("радіуси зникають на ховер"). The component's own hover variant already does the colour, so
  drop background/border/shadow from such rules (keep text colour only) — or retarget to the inner variant layer.
  Check with `hoverradius.js`: every element that gets a hover background must keep live's border-radius.
- **Every live `:hover` rule needs a Framer twin — diff the class list.** `.case-link:hover` (gap 10→15px + underline
  0.14→ink, 0.4s `cubic-bezier(.2,.8,.2,1)`) was simply missing. After porting, grep live.css for `:hover` classes and
  confirm each one exists in `HOVER_CSS`/`PRE_CSS`; Framer borders live in `::after`, so hover border colours go on
  `[name]:hover::after`.
- **Absolute layers measured at 0×0 get pinned by `left:<card width>px`.** The post/journal fold kept `left:447px`
  from the measurement, so on any other card width it sat OUTSIDE the card (on the neighbour). Copy the live pins
  (`top:-1px; right:-1px` / `top:0; right:0`) and null the measured `left` on the primary AND every replica.

- **Favicons are part of the conversion — MANDATORY.** Read the live `<link rel="icon">` / `apple-touch-icon` tags,
  download into a `dl_*` dir and LOOK at them (brand text must match the renamed brand; a pure mark is fine), then set
  `tree.root` `metadata.favicon` + `metadata.faviconDark` (live light/dark files) and `metadata.appleTouchIcon`
  (180×180 webclip) via `tree.assetReference(url)`. Publish and curl the home page: no `default-favicon` /
  `default-touch-icon` may remain. Social share image (`metadata.socialImage`) is agreed in seo-check, not invented.

- **The shared header+footer layout template is named `Main Layout`** (not "Site Chrome" or any internal jargon).

- **Style names are SEMANTIC — no numbers, no values, no slashes — MANDATORY.** Colour styles: take the source
  design-system variable name for the same value (`--secondary--on-dark-soft` → `On Dark Soft`, `--secondary--scrim-wash`
  → `Scrim Wash`, `--secondary--glass-nav` → `Glass Nav`); a value with no variable is named by its role (`Hero Veil
  Strong`, `Runs Fade Light`, `Header Scrim Soft`, `Night Clear`). Never `Bone 2 24`, `Ink 16`, `Verdova/rgba(…)`.
  Text styles: name by role from where they are used (`Hero Title`, `Section Title`, `Testimonial Quote`, `Price
  Figure`, `Form Label`), never `Serif 48–40 Regular 1.1em` or `Heading 1`. Variants of one role get a word, not a
  digit (`Quote Name` / `Quote Name Compact`). Delete styles with zero uses (check nodes AND CMS rich text) instead
  of shipping them. After renaming, walk the tree for dangling preset refs, publish, and re-run `headlines.js`.

- **Breakpoint names are ALWAYS `Desktop` / `Tablet` / `Mobile` — MANDATORY.** On every page, CMS template and
  layout template (primary = Desktop, `810–1199.98` = Tablet, `≤809.98` = Mobile). Never leave Framer's default
  `Breakpoint 2/3`. Rename in the first replay pass (patch `name` on each breakpoint frame — renaming is safe, unlike
  moving the range) and re-check with a tree walk before handing over.

- **992–1199 needs the DESKTOP layout but Framer renders the TABLET DOM there.** Layers hidden in the tablet replica
  (e.g. `testimonial-photo` + its `-image`) are not in the DOM at all, so CSS cannot bring them back. Recipe: make
  them `visible:true` (and absolute, as on desktop) in the tablet replica, hide them with CSS for 810–991.98, and
  rebuild the desktop geometry for 992–1199 in `PRE_CSS` (sticky pin, absolute stacked cards, plate pins, desktop type
  sizes copied from Framer's own 1440 computed styles). Move any JS gate (`matchMedia("(min-width: 1200px)")`) of that
  section's motion to 992. Check visible children recursively — a visible wrapper with a hidden image is still empty.
- **Prefix selectors collide with sibling names.** `[data-framer-name^="post"]:not([data-framer-name^="post-"])` also
  matched the section `posts` → extra padding on the section and every card's hover firing when the section is
  hovered. Use `:is([data-framer-name="post"],[data-framer-name^="post "])` (exact name OR name + variant suffix).
  After adding a prefix rule, list every element it matches on the page before publishing.
- **Free the instance wrappers too.** A card inside a list item sits in `ssr-variant > *-container`; Framer gives the
  container and the grid rows fixed heights (`grid-template-rows:360px`). When CSS changes the card's height or
  aspect-ratio, also set `grid-template-rows:none; grid-auto-rows:auto` on the grid and `height:auto` on the item and
  its `[class*="-container"]` descendants, or the card overflows its cell.
- **In-between widths QA tool:** `midwidths.js` prints every section's box, display, grid columns, pins and padding at
  1150/1000/900/800/700/500 for live and Framer — diff them line by line before saying a width is done.

- **Card hover reveals (corner "fold" + darkening "wash") are part of 1:1 — replay them, never leave the layers at 0×0.**
  The replay measures hidden-by-transform layers (`transform: scale(0)`) as 0×0, so the fold/arrow come out with
  0px sizes and no hover. Fix: give the layers their real native sizes (from live CSS, per breakpoint) and add the hover
  to `PRE_CSS`: base `transform:scale(0); transform-origin:100% 0`, `@media (hover:hover){card:hover fold{scale(1)}
  card:hover wash{opacity:1}}`, timings sampled from live (in ≈450ms ease-out, out ≈300ms). Verify with a timed
  sampler (scale/opacity at 60/160/300/500ms after `mouse.move`, and after leave) at 1440/1100/900/500 on live AND
  Framer — `hovaudit.js` must cover every card list (Home posts, /blog journal cards, related posts).
- **Component variant layers are renamed per breakpoint** (`post` → `post tablet`, `journal-card` → `journal-card
  tablet`). CSS selectors on a component root must be prefix-matched (`[data-framer-name^="journal-card"]`,
  `[data-framer-name^="post"]:not([data-framer-name^="post-"])`), or the rule silently dies below 1200.
- **Absolute children pinned to the edge the source pins.** Live `testimonial-plate` is `bottom:40px` inside a card
  whose height is `100vh − 160px`; the replay pinned it `top:300px` (the measurement at 900px tall), so on a shorter
  window the plate ran past the card and got clipped. When a container's height depends on the viewport, copy the
  live `top/bottom/left/right` pins (computed style), never the measured offset; check at 2–3 window heights.

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
| Home kept from the design-tool build while inner pages came from live | Home goes through the SAME live pipeline (snapshot → measure 1440/810/390 → native → resolve → replay), then lists → CMS → components (`tools/cmscomp.js`) |
| Detail pages static (every slug = same person/post) | bind all per-item fields to the page's collection; check with `slugmap.js` |
| Live `display:contents` wrappers (head rows on phone) | the converter emits gap/padding of thousands of px on replicas — scan replicas for gap/padding ≥ 300px; rebuild live `order` (button under the list) with a phone-only duplicate |
| Leading empty paragraph in rich text (`\n` at start) | virtual blocks can't be removed: patch the RichTextNode `text` to the plain first run, restyle run 0, insert the other runs / `TextLineBreak` |
| Text colour tween on hover leaves the label dark | tween every `.framer-text` inside AND `--framer-text-color` (runs carry their own var) |
| SVG icon in a 16×26 frame looks cropped/bigger | Framer fills frames with `cover`; inject `img{object-fit:contain}` for that layer |
| Grid row centring via `gridAlignment` | `gridAlignment` is horizontal; vertical = `gridItemVerticalAlignment` on the child |
| Component variant roots after `createComponentFromFrame` | keep px heights per variant, rename roots to the live class without `[data-…]` suffixes |
| Inter in Framer renders wider than live (lines wrap one word earlier) | Framer presets carry `openTypeFontFeatures` cv03/cv04/cv09/cv11/blwf; live uses none — set `{}` on presets or `.framer-text{font-feature-settings:normal}` |
| Rich-text bodies taller than live (+40–50px per article) | Framer renders the body as flex column, so margins do not collapse; make the body `display:block` (`.post-body{display:block!important}`) |
| Rich-text images 16:9 / blockquote padding off | copy live: `img{aspect-ratio:16/10;object-fit:cover}`, blockquote `padding:30px 20px 22px 24px` |
| Grid card that spans two rows (`grid-row: span 2`) | Framer does not export row span — keep a 1-row grid and pin the bottom-aligned sibling `absolute; left; bottom; width:px` |
| Live `order:-1` on tablet/phone (photo stage before the list) | duplicate the block, put the copy first, `visible:false` on desktop and the original hidden on tablet/phone (only one is rendered per breakpoint, scripts still see one) |
| Converter "spacer" frames (`1fr`) in rows | they eat half the row and squeeze text — on narrow breakpoints hide the spacer and give the text `1fr` |
| Replica keeps an old `textStylePreset` | after assigning a new preset on the base node, also patch every breakpoint replica / component variant node |
| Text preset weight differs per breakpoint (500 desktop, 400 tablet/phone) | presets only vary size/lh/ls per breakpoint — make a second preset and assign it on the variant/replica |
| Tag pills with fixed px widths from the measurement | pills and their text `width:auto`, row `stackWrapEnabled` — otherwise a 1px font difference wraps the label |
| Slider arrows stacked under the slides on tablet/phone | read live positions (`tools/tree2.js`): arrows sit above the mask, centred — absolute `top`/`left` per breakpoint + slider `paddingTop` |
| Uploaded SVG loses its labels' font | Framer's sanitizer drops multi-class `<style>` rules — inline the CSS into attributes first (`tools/inlinesvg.py`) |
| Absolute element collapses to 0 / wrong side | absolute positioning needs an explicit px `width` |
| `api.tree.patch(textBlock, {textStylePreset})` fails on `v:` blocks | patch the RichTextNode itself (`{textStylePreset}`) — virtual blocks are read-only |
| Every exec prints a huge linter dump | batch all patches for a page into one program and publish in the same call |
| Converter drops `gap` whenever the live box is `justify-content: space-between` (Framer refuses gap + space-between) | `native.cjs` now emits `start` + gap when the children already fill the main axis; for existing pages run `tools/gapscan.js` and fix vertical/auto-sized boxes (horizontal fill rows can keep space-between) |
| Utility pages (Style Guide, Licensing, Changelog) skipped by the pipeline | they are `div.section` / `div.inner-banner` / `aside.section`, not `<section>` — `prep.cjs` now picks those up; create the page by duplicating a static page (keeps the layout template + breakpoints), then run `tools/replay.js` with the uploaded bundle |
| Lazy images make live pages look shorter in a load-only measurement | scroll the whole page before measuring (`tools/anchors2.js`); a rich-text image measured 0×0 on tablet/phone gets explicit height in the replica |
| Header variant per page (live `w-variant-…` on utility pages: solid bone bar, no glass pill) | reproduce with a page flag set by the motion code (`html[data-vd-paper]`) + CSS for both header variants; Framer draws borders on `::after` — hide that too |
| Dropdown labels / targets differ from live ("Team Member" vs "Team Details") | copy every label and every CMS item slug from the live menu (`tools/hovaudit.js` link report) |
| Sticky / pinned stage animation feels "different" though it fires at the right spot | live IX3 `wf:scroll` with `scrub` = a scroll-linked timeline, not a timed tween: rebuild it as one `gsap.timeline({scrollTrigger:{trigger, start, end, scrub}})` with the live `position`/`duration` per action (`ease:0` → `"none"`) and pad it to 1.0 (`.to({}, {duration:.001}, .999)`) so positions mean the same fraction of the scroll |
| IX3 targets are `wf:inst` ids, not classes | map each `[page, element]` id to a class via the `data-wf-target` attribute in the live HTML (parse only); the same timeline id can be reused by several page templates — check each page's bundle |
| Sticky element inside a Framer grid cell never sticks | the cell stretches to the row height: give it `align-self:start` (CSS injection at the desktop media query) plus `position:sticky; top` |
| Scroll audit says "Framer: none" | first check the selector caught the same layer (prefix matches like `price-question` vs `price-questions-in`, header named differently) — re-probe the exact element with `tools/scrollprobe2.js` before changing anything |
| Header "paper" variant on detail templates too | audit `site-head` classes on EVERY page and scroll position (`tools/hdrmode.js`); live adds a 1px hairline (`rgba(34,53,42,.14)`) once stuck |
| Nav pill items shifted 5px vs live | live pill border (1px) takes layout space, Framer's border is an overlay → add 1px to the pill's horizontal padding; compare chevron gap in the dropdown trigger (`tools/hdrbox.js` prints every header label x) |
| Social icons render no `<a>` though the component props are bound | the CMS link fields are empty — fill `$control__<fieldId>` on every CollectionItemNode (copy live URLs); also bind detail-page icons with `tree.ref(field, pageId)` instead of a static href |
| Same-page anchor (`href="#runs"`) | Framer rewrites a bare `#id` to `./#id` (= home). Set `elementId` on the target section and link to `"/<page-path>#id"` |
| Link audit | `tools/linkcmp.js` lists content links only-live / only-Framer per page (header/footer excluded); a live anchor to a missing id is a live bug — point it at the real page and say so |
| Card photo height differs only on phone | the phone variant of a CMS card component kept an aspect-derived px height — check every variant node of the component, not just the base |
| Footer copyright (ALWAYS, automatically) | left `© {Project}. All Rights Reserved`, right `Designed by Fourtwelve` with only "Fourtwelve" linked to `https://fourtwelve.co/` (new tab). Only the project name changes. This replaces any "by UPQODE"/template credit — say so once if a project rule asks for another credit |
| Social links | never invent personal profiles: link the generic platform pages (`https://www.linkedin.com/`, `https://x.com/`, `https://www.facebook.com/`, `https://www.instagram.com/`), new tab |
| Pre-hide CSS rendered by the code override does nothing | React escapes quotes inside `<style>{css}</style>` on SSR (`&quot;`) and the sheet dies after the first rule — render it with `dangerouslySetInnerHTML={{__html: CSS}}` |
| Code block inserted with `String.replace` lost `$$(` | in a replacement string `$$` means `$` — use `split(a).join(b)` or a replacer function |
| "Every element must have load + scroll motion" | universal pass at the end of boot: collect every tweened element (skip hover timelines tagged `tl.data="hover"`), then animate everything else — first-screen items as a load cascade, the rest with `ScrollTrigger.batch`; headings split into words; pre-hide only the first section in SSR CSS |
| Jerky hovers / reveals | a CSS `transition` on an element GSAP animates fights it — `transition:none!important` on GSAP-driven parts (button fill/arrow/label) and during reveals; copy live timings frame by frame (`tools/hovframes.js`) |
| Forms do nothing on submit | Framer forms need "Send To" chosen in the editor (no API) — tell the user. Wire submit button variants (Sending/Done/Error) and message frames after the form (absolute, height 0 until revealed) |
| Mobile menu cut off / list not scrollable | open variant height `100dvh` via CSS (variants refuse vh), list `min-height:0; overflow-y:auto`, Lenis `prevent` for the list |
| Testing only 390 | users test at 360: run `tools/adaptaudit.js 360` and `810` (text overlaps, x/width/height vs live, overflow) on every page |
| Element pinned with px `top` from the 390 measurement leaves a gap at 360 | live used `top:48%; bottom:0` — in Framer use `bottom:0` + `height:%` (absolute `top` must be px) |
| CMS list shows fewer items on tablet | each breakpoint replica has its own `collectionList.limit` — check all three |
| Footer columns on tablet/phone | live centres them (tablet grid 1.3fr 1fr 1fr, gap 24; phone single centred column) — check `foot-nav` per breakpoint |
| Headings break lines differently from live although width, size and tracking match | Framer stores a fixed `opsz` axis in every variable-font preset (`"opsz" 48`); live uses optical sizing auto (opsz = font-size). Presets refuse to drop the axis — inject `.framer-text,.framer-text *{font-variation-settings:normal!important;font-optical-sizing:auto!important}` (weight still follows font-weight). Check with `tools/fontaxes.js` / `tools/lines.js` |
| Text that wraps on live stays on one line in Framer | auto-width text renders `white-space:pre` — give the text a width (`100%` / `1fr`) on the breakpoint/variant where live wraps |
| Card heights measured at 390 are wrong at 360 | live cards keep a ratio (e.g. 330→248) — set px height + `aspectRatio` (aspect ratio is refused with auto height) |
| Centred title with max-width sits at the left on tablet | the title wrap is centred by its PARENT on live — set the parent stack `stackAlignment:center` per breakpoint |
| Grid item spanning 2 columns must be centred (`justify-self:center`) | `gridItemHorizontalAlignment` did not apply — use CSS `justify-self:center` for that breakpoint |
| Row reversed only on tablet (media right, text left) | live `flex-direction:row-reverse` at one breakpoint — CSS injection for that media query |
| QA tools for adaptive work | `headw.js` (heading box/lines), `talign.js` (text-align), `rowgeo.js`/`kidsgeo.js` (children geometry), `secpair.js` (section side-by-side), `pricefee.js`-style targeted probes |
| Hero/slider content sticks to the LEFT on wide screens (user at 1765px) | a horizontal stack whose child is `width:1fr; maxWidth:1400px` needs `stackDistribution:"center"` (vertical stacks: `stackAlignment:"center"`); also remove one-sided paddings that compensated at 1440. Always QA at 1440 **and** 1765/1920 — `tools/centeraudit.js` lists every max-width container whose left ≠ right gap |
| Live has a ≥1920 tier (`@media (min-width:1920px)` in the Webflow CSS: container 1600, h1 88, h2 52, h3 40, h4 30, display 160/70) | diff the CSS variables 1440 vs 1920 first (`tools/xl1920.js`). Text styles take it natively: patch the whole `breakpoint` object with a new `default` slot `{minWidth:"1920px", fontSize:X}` followed by the old slots (labels: default/large/medium/small/extraSmall, max 5; ignore the "minWidth 0px" error on the last slot, read back). Only presets tied to h-tokens scale — card titles/office names/numbers are fixed px on live: clone those presets without the 1920 bump (`tools/xlfs.js` lists which texts scale). Container/title max-widths: one `@media (min-width:1920px)` CSS block in the code file, generated from the live diff |
| Cards/charts that keep a ratio on live are fixed px in Framer, so wide screens are too short | measure w/h at 1440 and 1920; if the ratio is constant set `height:<1440px> + aspectRatio` on the desktop node, and patch tablet/phone replicas back to their own height (`auto`/px) — read replica values BEFORE overwriting (component variants refuse aspectRatio: put it on the CMS item / wrapper and give the instance `height:100%`) |
| Tags/chips row wraps on live but not in Framer | `stackWrapEnabled:true` AND a real width (`100%`) — an auto-width wrapping stack collapses to one chip per row |
| `aspectRatio` set on the desktop node silently applies to tablet/phone too (replicas inherit it even when they carry their own px height) — pages grew/shrank by 100–250px | after every desktop `aspectRatio` patch, patch each breakpoint replica `{aspectRatio: null}` (that is a real override) and re-check heights at 810/360. Reading `replica.aspectRatio` returns undefined either way — verify by rendering |
| Webflow sites often have FOUR desktop tiers: base (<1280), `min-width:1280`, `1440`, `1920` (list them: `grep -o "@media screen and ([a-z]*-width: [0-9]*px)" site.css`) | diff the CSS variables per tier first. Framer desktop starts at 1200: give text styles slots 1920 / 1440 / 1200 (= the 1280 values) / 810 / 0 (max 5 labels: default, large, medium, small, extraSmall). Inserting a slot can shift the old lower slots' minWidth (e.g. to 640) — re-set `small.minWidth:"810px"` and copy values into `extraSmall`, then read back. Container/title widths per tier: one `@media (min-width:1200px) and (max-width:1439.98px)` CSS block (`tools/tierdiff.js 1280`) |
| Live hero is `min-height:100vh` with an `aspect-ratio` media + `max-height:100%`; Framer hero was fixed 900px and the picture stopped short of the right edge on wide screens | section `height:auto; minHeight:"100vh"` (tablet/phone replicas: their own `minHeight` px — they inherit vh otherwise); media bottom-anchored (`top:null, bottom:0`) with CSS `height:min(56.22vw,100%)`. Framer's aspectRatio + maxHeight shrinks the WIDTH instead — don't combine them |
| Image inside a ratio box is 106% wide for parallax — copying 106% to the height too made rows 30px taller | parallax overscan is width-only on live: image `width:106%`, `height:100%` |
| Absolute child must fill a ratio box (`height:100%`) but its direct parent is a 0-height CMS item | give the absolute child its own `height:px + aspectRatio` instead of `%` |
| motionaudit says LOAD-SLOW on several CMS pages at once | it ran in parallel with other Playwright audits — re-run one page alone (`earlydom.js`) before changing timing; real slowness shows up there too |
| Linter: "Horizontal stack has multiple direct children and a child with width=100%" after a wrap fix | the walk-up set a row child (testimonial-who next to an avatar, channel text next to a 40px tile) to 100% — use `1fr` for children of horizontal stacks |
| `api.tree.remove()` of nodes inside a component (burger "Page link" items) left the tree right, but the published burger still showed them, now linking to `./` (their pages were deleted) | removal alone does not rebuild the component module. After removing nodes in a component, patch any property of that component and set it back, then publish, then open the burger/dropdown on the live site and list its links |
| Footer (or any component) text replaced on the primary variant only; tablet/phone kept "Legal / Licensing", and their links went to `./` | component breakpoint variants carry their own text **and** link overrides: `replaceText(id, old, new)` and `patch({link})` on every variant id (`<variantPrefix><nodeId>`), then check the footer links at 1440 / 810 / 360 |
| Tree patches + `publish()` in ONE exec program: `changedNodeCount:1`, and the published CSS still had the old `width:min-content` | publish in a **separate** exec call after the patches, then verify the live CSS (`rules.js`: the rule that sets `width` on the element) before you believe the fix |
| `s.replace(a, b)` on the motion file turned `$$(` into `$(` and killed `boot()` (".map is not a function") — every animation stopped | `String.replace` treats `$$` in the replacement as `$`. Edit code files with `s.split(a).join(b)`, and after every motion publish load one page and check `pageerror` (`dbg.js`) |
| burgertest 16/20 and nav-to-top "click fail" in the full QA run | they ran in parallel with eight Playwright audits — re-run alone. navtop2 below 992 must click a footer link (header links live in the burger) and only a link that `elementFromPoint` returns |
| User at 1200: the voices reel showed a wide card + slats, but live shows a full-width SLIDER there | Webflow can swap whole blocks INSIDE Framer's Desktop range: live `.quote-reel{display:none}` and only `@media (min-width:1440px){display:flex}` — below 1440 it is `.voices-slider`. Grep every `display:none`/`display:flex` pair across the 1280/1440 tiers. Recipe: make the other block visible in the Desktop node (it is ABSENT from the DOM while hidden), patch its Desktop sizes to the 1200 values, snapshot + restore the Tablet/Phone replica values you touched, then CSS `@media (1200–1439.98){reel display:none}` + `@media (≥1440){slider display:none}`. Check with `voices.js`-style probes at 1600/1440/1300/1200/1100/1000/900/800/600/390 |
| Click on the reel did nothing (also "через інспект") | the ported JS looked for old layer names (`voice`) and found nothing; the live click is a Webflow IX3 **class toggle** (`"wf:class":{class:{operation:"addClass"…"quote-reel-slot-on"}}` in the webflow.*.js bundle). Port every addClass/removeClass interaction by reading the matching CSS (`.quote-reel-slot-on{flex-grow:1}`, copy opacity .4s) and drive the same properties inline. Check `matchMedia` INSIDE the handler, never once at boot (devtools resize, rotation). QA: click one item per interactive block at every tier and compare widths with live |
| Photos pixelated in narrow tall cards (reel slats 164×560, slider cards) | Framer writes `sizes` from the FRAME width (164px) and serves a 512px file, but `object-fit:cover` draws the image ~1000px wide. There is no resolution property in the API — at runtime set `img.sizes = Math.max(w, h·aspect) + "px"` for every cover image (`fixCover` in the motion file; aspect from the `width=&height=` query of the asset URL). QA: natural width ÷ drawn width ≥ 1 for every visible image |
| Footer overlapped the form at 1200 | live `.foot-top{grid-template-columns:1.35fr 2.1fr; column-gap:80px}` (120 from 1440) and `.foot-nav{1.3fr 1fr 1fr; gap 24}`; Framer had fixed px widths that only fit 1440. Use stack children `width:"1.35fr"/"2.1fr"` (fr widths are accepted), the field `1fr`, heading `100%` + maxWidth. Tier-only gaps go in CSS. 992–1199 is Tablet in Framer but live keeps two columns there — CSS row layout for that range |
| Content lines up at 1200 and 1440 but drifts 10–80px at 1300–1439 | live `--containers--base-container` is 1280px from 1280 and 1400px from 1440. CSS `@media (1200–1439.98){[data-framer-name~=base-container],consult-in,prose-in,testimonial-in{max-width:1280px}}`, footer inner 1250. `tools/textx.js <W> <pages>` compares text x positions live vs Framer by text |
| CSS rule `[data-framer-name="quote-reel"]` never matched | layer names keep Webflow attribute suffixes (`quote-reel [scroll-x]`) — use `~=` (word) or `^=` selectors, never `=` for names that may carry suffixes |
| Changing a Desktop value silently changed Tablet/Phone | replicas inherit every property they do not override. Before patching a primary node: snapshot the replica values of the keys you change, patch, then re-patch replicas whose value moved (`drift 0` check) |
