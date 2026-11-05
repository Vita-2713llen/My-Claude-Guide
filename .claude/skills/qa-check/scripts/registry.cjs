// Single source of truth for every check the skill knows about — automated, semi-automated and person-only.
// manifest.cjs prints EVERY id below with a status: pass · fail · ask · n/a · routed · not-run.
// A run whose manifest still has a not-run row is an unfinished run.
//
// Fields of a row:
//   id        AREA-NN, unique, never reused for another meaning
//   P         HARD | HIGH | MED | LOW
//   tool      who closes it (see TOOLS below)
//   title     what is checked, in plain words; generic — no client, project, brand or person names
//   platforms optional list (see PLATFORMS); absent = every platform. Rows of another platform are n/a.
//   stage     optional '1' (local HTML build only) | '2' (deployed site only); absent = both stages
//   gate      optional presence gate (see GATES); when the presence sweep finds no subject the row is n/a
//   toolBy    optional { platform: tool } when the closing tool depends on the platform (toolFor() resolves it)
//   route     how a not-run row is closed when no script closes it (required for person / route rows)
//
// This module exports the array itself (consumers do REG.map / REG.some) plus non-enumerable helpers:
//   REG.TOOLS, REG.PRIORITIES, REG.PLATFORMS, REG.STAGES, REG.GATES, REG.byId(id), REG.toolFor(row, platform),
//   REG.appliesTo(row, { platform, stage }) → true | reason, REG.validate(rows) → [problems].
// Requiring it validates the table and throws on any structural problem, so a broken registry never runs silently.
// CLI: node registry.cjs check   → validate and print counts
//      node registry.cjs list    → print id · tool · title as JSON

const TOOLS = {
  'qa-run': 'scripts/qa-run.cjs — crawler: static pass on all tiers and engines, interactions, links, weight',
  spell: 'scripts/spell.cjs — spelling and grammar candidates',
  lighthouse: 'scripts/lighthouse.cjs — serial Lighthouse on an idle machine',
  'safari-real': 'scripts/safari-real.cjs — real Safari on macOS through safaridriver',
  ios: 'scripts/ios.cjs — iOS Simulator Mobile Safari',
  'wp-admin': 'scripts/wp-admin-audit.js — read-only audit in a logged-in wp-admin tab',
  webflow: 'Webflow internals — read through the Webflow connection (read-only) or by a person in Designer, then record.cjs',
  route: 'needs a machine or tool this run may lack — run it where available, otherwise route with a named owner (record.cjs --status routed)',
  person: 'needs eyes or hands, not a script — screenshots for the agent, devices / mailboxes / accounts for a human; closed with record.cjs',
  snapshot: 'scripts/snapshot.cjs — site fingerprint and changes since the previous run',
};
const PRIORITIES = ['HARD', 'HIGH', 'MED', 'LOW'];
const PLATFORMS = ['wordpress', 'webflow', 'static', 'other'];
const STAGES = ['1', '2'];
const GATES = {
  burger: 'a burger / drawer / off-canvas panel',
  dropdowns: 'desktop dropdown menus',
  anchors: 'in-page anchor links',
  contacts: 'email addresses or phone numbers on the page',
  social: 'links to social networks',
  sliders: 'a slider, carousel or ticker',
  tabs: 'tabs or filter tabs',
  faq: 'an FAQ section',
  dialogs: 'a pop-up, modal or lightbox',
  forms: 'a form with fields',
  mailForms: 'a form that sends mail (not search, not login)',
  video: 'a <video> or a video embed',
  maps: 'an embedded map',
  search: 'a search field or search page',
  subscribe: 'a subscribe form',
  fileFields: 'a file upload field',
  sortFilter: 'sorting or filtering of a list',
  downloads: 'documents offered for download',
  preloader: 'a preloader',
  passwordPage: 'a password-protected page',
  accounts: 'registration, login or a user account',
  lang: 'more than one language (hreflang, switcher, locale pages)',
  cms: 'collection / related-content lists',
  acf: 'flexible-content layouts or shortcodes (WordPress)',
  donor: 'the project was cloned from another site (decisions.donor)',
  template: 'decisions.projectType = template (marketplace template)',
};
const NOT_STATIC = ['wordpress', 'webflow', 'other'];
const MAIL_TOOLS = { wordpress: 'wp-admin', webflow: 'webflow', static: 'route', other: 'route' };
const R_MAIL = "WordPress: wp-admin-audit.js; Webflow: Site settings → Forms + each form's Email Notifications; other: the owner of the form backend (form action host) — then record.cjs";
const R_IPHONE = 'person on a real iPhone (model + iOS in the note) → record.cjs; out of scope only by a dated designer decision';

const ROWS = [
  // ---- run hygiene: is this run valid and comparable with another one
  { id: 'RUN-01', P: 'HARD', tool: 'snapshot', title: 'Site snapshot taken; changes since the previous run listed' },
  { id: 'RUN-02', P: 'HARD', tool: 'qa-run', title: 'Presence sweep: every gate recorded present (with pages) or absent (with what was searched); gated rows run or n/a with that reason' },
  { id: 'RUN-03', P: 'HARD', tool: 'qa-run', title: 'Page inventory: source (qa-target pages / sitemap from robots.txt or standard paths / link crawl), page count, URLs on other hosts dropped, sample per CMS template; only "/" found without decisions.singlePage → not run' },
  { id: 'RUN-04', P: 'HARD', tool: 'qa-run', title: 'Coverage: every planned page × width × engine × phase measured, or listed NOT RUN with its reason (load failure, challenge or password page, element cap, time budget, --quick/--pages/--engines/--widths cut)' },
  { id: 'RUN-05', P: 'HARD', tool: 'qa-run', title: 'Platform detected from positive markers and recorded (wordpress / webflow / static / other + evidence); a config "platform" that disagrees → ask; rows of other platforms n/a; platform unknown → those rows not run' },
  { id: 'RUN-06', P: 'HARD', tool: 'qa-run', title: 'Access: site reachable without a gate, or audited through a session the person provided; a password / basic-auth / SSO gate detected → every qa-run row not run with the route (the agent never types a password)' },
  { id: 'RUN-07', P: 'HARD', tool: 'qa-run', title: 'Run conditions pinned and recorded: skill version, config hash, OS, Node, browser builds and source, locale, timezone, scrollbar mode, devices, spellchecker + locale, CLI flags; each capability missing on this machine names the IDs it leaves not run' },

  // ---- links & controls
  { id: 'LINK-01', P: 'HARD', tool: 'qa-run', title: 'Every `<a>` has a real destination (no missing/empty href, #, javascript:)' },
  { id: 'LINK-02', P: 'HARD', tool: 'qa-run', title: 'Every same-page anchor (#id, /#id, full same-page URL#id) resolves to an element on the page' },
  { id: 'LINK-03', P: 'HARD', tool: 'qa-run', title: 'Every unique URL answers 200 (redirect chains counted)' },
  { id: 'LINK-04', P: 'HIGH', tool: 'qa-run', title: 'External links open in a new tab with rel=noopener' },
  { id: 'LINK-05', P: 'HARD', tool: 'qa-run', title: 'Every link/button has an accessible name' },
  { id: 'LINK-06', P: 'HARD', tool: 'qa-run', title: 'Nothing looks clickable without being a link/button (cursor:pointer / button-like class, no href, no handler)' },
  { id: 'LINK-07', P: 'HARD', tool: 'qa-run', title: 'Every top-level nav item (link, button or pointer-styled item, dropdown parents included) does something on click: navigates or opens its panel' },
  { id: 'LINK-08', P: 'HARD', tool: 'qa-run', gate: 'contacts', title: 'Every mailto:/tel: is well-formed, not a template sample (example.com, 555-01xx, 000…), mails or dials what its text shows, and matches decisions.contacts when set' },
  { id: 'LINK-09', P: 'HARD', tool: 'qa-run', gate: 'contacts', title: 'Every visible email address and phone number is a mailto:/tel: link' },
  { id: 'LINK-10', P: 'MED', tool: 'qa-run', gate: 'anchors', title: 'In-page anchor links land with the target below the fixed/sticky header at 1440 and 360 (through the burger); the burger closes after an anchor tap' },
  { id: 'LINK-11', P: 'HIGH', tool: 'qa-run', gate: 'social', title: "Social links point to a specific profile: not the network root, not the donor's, equal to decisions.socialProfiles when set" },
  { id: 'LINK-12', P: 'HARD', tool: 'qa-run', title: 'No hidden links: no `<a href>` rendered invisible (0×0, opacity 0, transparent or 0px text, off-screen) at every tier where it exists' },
  { id: 'LINK-13', P: 'HARD', tool: 'qa-run', title: 'Controls do something: a `<button>` outside a form has an action (handler, aria-controls/expanded); toggles are buttons, not `<a href="#…">`' },
  { id: 'LINK-14', P: 'HARD', tool: 'qa-run', title: 'Every visible link, button and clickable control shows cursor: pointer' },

  // ---- runtime
  { id: 'JS-01', P: 'HARD', tool: 'qa-run', title: 'No uncaught JS error, no first-party console error and no failed script/style/font/image request on any page, per engine, at load or after an interaction (third-party failures → ask)' },

  // ---- expanded states & interactive features
  { id: 'INT-01', P: 'HARD', tool: 'qa-run', title: 'Every toggle (aria-expanded, tab, summary, accordion, FAQ) changes state when clicked/tapped' },
  { id: 'INT-02', P: 'HARD', tool: 'qa-run', title: 'Content revealed by toggles is measured again (overflow, clipping, edges)' },
  { id: 'INT-03', P: 'HIGH', tool: 'qa-run', gate: 'sliders', title: "Slider arrows change the slide (sliders found by library root, class, scroll-snap or motion, not only by a 'next' arrow); an active prev on the first slide of a non-looping slider is a fail" },
  { id: 'INT-04', P: 'HIGH', tool: 'qa-run', gate: 'sliders', title: 'Autoplaying slider/ticker pauses on tap (mobile, tablet), hover and keyboard focus (desktop), or has a working pause control' },
  { id: 'INT-05', P: 'HARD', tool: 'qa-run', title: 'Every clickable element has a hover that changes something (≥992 only)' },
  { id: 'INT-06', P: 'HARD', tool: 'qa-run', title: 'Hover durations on the project scale (default 350ms; large media 500–650ms)' },
  { id: 'INT-07', P: 'HIGH', tool: 'qa-run', title: ':hover rules wrapped in @media (hover: hover) (project CSS only; no readable project CSS → not run)' },
  { id: 'INT-08', P: 'HARD', tool: 'qa-run', title: 'Nothing left at an animation start value (opacity<0.99 on visible text after scroll)' },
  { id: 'INT-09', P: 'HARD', tool: 'qa-run', gate: 'sliders', title: 'Slider pagination: each bullet changes the slide and the active bullet follows' },
  { id: 'INT-10', P: 'HARD', tool: 'qa-run', gate: 'sliders', title: 'Slider/carousel moves on a touch swipe at touch tiers (desktop mouse drag → ask only)' },
  { id: 'INT-11', P: 'HARD', tool: 'qa-run', title: 'Reveal on scroll: first screen first, no abrupt (≤3 frames) or flickering reveal, nothing left hidden after down/up/down passes, revealed links end at transform:none and will-change:auto' },
  { id: 'INT-12', P: 'HARD', tool: 'qa-run', title: 'Hover is smooth: no property switches in one frame, no background-image swap (first hover after load included)' },
  { id: 'INT-13', P: 'HARD', tool: 'qa-run', title: 'An absolute ::before/::after hover layer covers its whole grid/flex cell; the bottom edge of the cell hovers and clicks' },
  { id: 'INT-14', P: 'HIGH', tool: 'qa-run', title: 'Header/footer logo hover matches decisions.logoHover (no unintended opacity or colour change)' },
  { id: 'INT-15', P: 'HIGH', tool: 'qa-run', title: 'Hover-only affordances (arrow, icon, underline revealed on hover) are visible on touch tiers (hover: none)' },

  // ---- pop-ups & lightboxes
  { id: 'MODAL-01', P: 'HIGH', tool: 'qa-run', gate: 'dialogs', title: 'Pop-up / lightbox opens from its trigger, is centred, scrolls inside, locks the page, moves focus in, closes with Escape and with its close button' },
  { id: 'MODAL-02', P: 'MED', tool: 'person', gate: 'dialogs', stage: '2', title: 'An auto-opening pop-up shows with the delay and frequency agreed with the designer (recorded in decisions)', route: 'designer decision → qa-target.json decisions + record.cjs' },

  // ---- navigation
  { id: 'NAV-01', P: 'HARD', tool: 'qa-run', gate: 'dropdowns', title: 'Desktop dropdowns open on hover from every point of the item' },
  { id: 'NAV-02', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Burger opens/closes, Escape closes, focus returns' },
  { id: 'NAV-03', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Burger panel: submenus collapsed by default (nothing in a nested list visible until its toggle); panel link count = desktop top-level items + CTAs (both numbers in evidence)' },
  { id: 'NAV-04', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Burger panel CTAs stay visible with the largest submenu open (sticky)' },
  { id: 'NAV-05', P: 'HIGH', tool: 'qa-run', gate: 'burger', title: 'No nested scroll inside the burger panel (submenu with its own scrollbar)' },
  { id: 'NAV-06', P: 'HIGH', tool: 'qa-run', gate: 'burger', title: 'Burger panel rows have equal height' },
  { id: 'NAV-07', P: 'HIGH', tool: 'qa-run', gate: 'burger', title: 'Burger bars and close cross (or the burger morphed into a cross) have the same rendered line weight (±0.25px); not measurable → ask with screenshots' },
  { id: 'NAV-08', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Logo does not jump when the burger opens (left/top/width/height ±0.5px)' },
  { id: 'NAV-09', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Page behind the open menu does not scroll' },
  { id: 'NAV-10', P: 'HARD', tool: 'qa-run', title: 'Header never breaks from the widest tier down to 360 (16px steps + band edges): one row, no wrapped label, no overlap, no link hidden without a burger, height ≤1.2× its reference' },
  { id: 'NAV-11', P: 'HARD', tool: 'qa-run', title: 'Logo in the header, footer and open burger panel links to the home page' },
  { id: 'NAV-12', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Burger submenus hold the same links as the desktop dropdowns, plus a link to each parent page' },
  { id: 'NAV-13', P: 'HARD', tool: 'qa-run', title: 'The whole row of every expandable item toggles it: 6 points per burger row at every burger width in Chromium, WebKit and Firefox, plus Enter and Space; FAQ/accordion rows at 3 points' },
  { id: 'NAV-14', P: 'HIGH', tool: 'qa-run', gate: 'burger', title: "Burger panel CTAs styled like the site's buttons; a click outside the panel and a resize past the breakpoint close it and release the scroll lock" },
  { id: 'NAV-15', P: 'HIGH', tool: 'qa-run', gate: 'burger', title: 'A scrollable burger panel has overscroll-behavior contain/none (no scroll chaining); a panel taller than the screen can scroll' },

  // ---- accessibility
  { id: 'A11Y-01', P: 'HARD', tool: 'qa-run', title: 'Text contrast ≥4.5:1 (≥3:1 large) on solid backgrounds; over images/blur → screenshot + ask, never auto-fail' },
  { id: 'A11Y-02', P: 'HARD', tool: 'qa-run', gate: 'burger', title: 'Burger panel is a dialog (role=dialog + aria-modal or inert page); focus moves into it' },
  { id: 'A11Y-03', P: 'HIGH', tool: 'qa-run', gate: 'dropdowns', title: 'Hover dropdowns expose aria-expanded=true while open' },
  { id: 'A11Y-04', P: 'HIGH', tool: 'qa-run', gate: 'tabs', title: 'Tab interfaces use role=tablist/tab/tabpanel + aria-selected' },
  { id: 'A11Y-05', P: 'MED', tool: 'qa-run', title: 'Pointer targets ≥24×24px (WCAG 2.5.8)' },
  { id: 'A11Y-06', P: 'HARD', tool: 'qa-run', title: 'Exactly one `<h1>`; heading levels not skipped' },
  { id: 'A11Y-07', P: 'HARD', tool: 'qa-run', title: 'Visible keyboard focus on every control: state changes on focus, ring ≥3:1 against its background, focus never lands on an invisible element' },
  { id: 'A11Y-08', P: 'HARD', tool: 'qa-run', title: 'State contrast: placeholder ≥4.5:1 (3:1 large), field boundary ≥3:1, hover and focus text ≥4.5:1 (3:1 large); disabled controls → ask' },
  { id: 'A11Y-09', P: 'HARD', tool: 'qa-run', gate: 'forms', title: 'Error and success message contrast ≥4.5:1 (needs --form-errors, otherwise not run)' },
  { id: 'A11Y-10', P: 'HARD', tool: 'qa-run', title: 'Header in the accessibility tree: named nav, burger with a name and a flipping aria-expanded, named close button, desktop dropdowns open with Enter/Space and close with Escape' },

  // ---- layout
  { id: 'LAY-01', P: 'HARD', tool: 'qa-run', title: 'No horizontal scroll at any tier' },
  { id: 'LAY-02', P: 'HARD', tool: 'qa-run', title: 'No element clipped by the viewport outside a scroll/overflow container (e.g. a button at -38px)' },
  { id: 'LAY-03', P: 'HARD', tool: 'qa-run', title: 'Text never closer than 8px to the viewport edge (a site-wide overflow-x:hidden wrapper does not switch the check off)' },
  { id: 'LAY-04', P: 'HARD', tool: 'qa-run', title: 'Card grids balanced: no orphan card in the last row at 2/3-column tiers' },
  { id: 'LAY-05', P: 'HIGH', tool: 'qa-run', title: 'Mobile alignment consistent inside every section (sections found through platform wrappers): a centred section has no left-stuck block' },
  { id: 'LAY-06', P: 'HIGH', tool: 'qa-run', gate: 'tabs', title: 'Cards in different tabs/filters of one component have the same width' },
  { id: 'LAY-07', P: 'HARD', tool: 'qa-run', title: 'Unification: same-role elements measure the same — button variants (header included) by height/padding/radius/font-size, siblings of one set by gap/padding/radius/border/width, headings per tag+class, media aspect ratio within a set' },
  { id: 'LAY-08', P: 'HARD', tool: 'qa-run', title: 'Whole-integer pixels in spacing and size (em/%-derived fractions included)' },
  { id: 'LAY-09', P: 'HIGH', tool: 'ios', title: 'Spacing identical in iOS Safari and desktop WebKit at the same width (±4px): section insets and element spacing matched by DOM path' },
  { id: 'LAY-10', P: 'HIGH', tool: 'qa-run', title: 'Section vertical insets follow one scale per tier: same-role sections measure the same; no section at ~0 while its siblings carry the scale' },
  { id: 'LAY-11', P: 'HARD', tool: 'qa-run', title: 'Text keeps ≥8px (decisions.edgeMinPx) from every painted card/panel/cell/rule edge on all four sides at all 7 tiers; no one-sided inset smaller than the rest of its section' },
  { id: 'LAY-12', P: 'HARD', tool: 'qa-run', title: 'Content keeps ≥8px on both sides of a background change between sections' },
  { id: 'LAY-13', P: 'HARD', tool: 'qa-run', title: 'One left edge per tier: logo, start-aligned sections and footer share the container edge (±2px); container width and gutters match decisions.container when set' },
  { id: 'LAY-14', P: 'HARD', tool: 'qa-run', title: "Spacing skeleton: heading→text, text→button, section head→content hold one value per tier (decisions.spacing, else the site's most common value)" },
  { id: 'LAY-15', P: 'HIGH', tool: 'qa-run', title: 'Icon line weight: rendered stroke equal within ±0.25px per icon group (header and panel chevrons, FAQ toggles, arrows, social icons) at 1440 and 360' },
  { id: 'LAY-16', P: 'HARD', tool: 'qa-run', title: 'No truncated copy: no ellipsis, line-clamp or overflow-clipped text (fail at ≤768, ask above; decisions.truncateAllowed)' },
  { id: 'LAY-17', P: 'HARD', tool: 'qa-run', title: 'Text never sits under decorative art (an absolute image/SVG painting over a text line); gap under 24px, or under 60px in a hero at 768–991 → ask' },
  { id: 'LAY-18', P: 'HARD', tool: 'qa-run', title: 'Wrapped grid/flex rows never touch: vertical distance between rows ≥ decisions.edgeMinPx at all 7 tiers (fail); a row gap under half the column gap → ask; each finding carries an element screenshot' },
  { id: 'LAY-19', P: 'HARD', tool: 'qa-run', title: 'No horizontal scroll rail at ≥768 (cards cut at the edge, sideways scrollbar inside the page); below 768 → ask unless decisions.railsAllowed; sliders with controls excluded' },
  { id: 'LAY-20', P: 'HIGH', tool: 'qa-run', title: 'Link groups that wrap (footer legal links, tag rows) keep one horizontal gap and a vertical gap within 4px of it' },
  { id: 'LAY-21', P: 'HARD', tool: 'person', title: 'Charts and diagrams keep their meaning on tablet and mobile: every label stays attached to its point/step (compare 1440 against 768 and 360)', route: 'person: compare screenshots of every chart/diagram/timeline at 1440, 768, 360' },
  { id: 'LAY-22', P: 'HARD', tool: 'qa-run', title: 'Readable measure: body text never squeezed below ~28 characters per line (multi-column rows that do not collapse on tablet)' },

  // ---- markup structure (local build)
  { id: 'STRUCT-01', P: 'HARD', tool: 'qa-run', stage: '1', title: 'Section structure: every block directly in main is a `<section>`, its first child is the container (decisions.containerClass), no other children except declared decor; container side padding identical across sections per tier' },
  { id: 'STRUCT-02', P: 'HIGH', tool: 'qa-run', stage: '1', title: 'Class hygiene: ≤2 classes per element, names match decisions.classNamePattern, no descendant type selectors (.x h2) in project CSS, no builder leftovers (field-*, empty wrappers)' },
  { id: 'STRUCT-03', P: 'HARD', tool: 'qa-run', stage: '1', title: 'No inline style attributes in the source markup of main (runtime animation values excepted)' },
  { id: 'STRUCT-04', P: 'HIGH', tool: 'route', title: 'No debug code left in the theme / build source: console.log, error_log, var_dump, print_r, TODO, FIXME, XXX (one search over the source folder)', route: 'whoever has the source (the build folder at stage 1, the theme folder or repository at stage 2) searches it → record.cjs with the count; no source access → record.cjs --status routed --note "developer, before handover"' },

  // ---- design reference
  { id: 'REF-01', P: 'HARD', tool: 'qa-run', title: 'Values on the design-token scale (reference.tokens): colour, font size, spacing, radius, duration, font family — every off-scale group is a finding, even when uniform; no tokens → n/a (consistency-only run)' },
  { id: 'REF-02', P: 'HARD', tool: 'qa-run', stage: '2', title: 'Deployed page = clean stage-1 build (reference.build, closed clean): link counts, section count and order, section paddings, buttons, container width, h1–h3 family and size' },

  // ---- images & video
  { id: 'IMG-01', P: 'HARD', tool: 'qa-run', title: 'Every `<img>` has a non-empty alt' },
  { id: 'IMG-02', P: 'HARD', tool: 'qa-run', title: 'Every `<img>` has width and height attributes' },
  { id: 'IMG-03', P: 'HARD', tool: 'qa-run', title: 'No image served >2× its rendered width (DPR 1)' },
  { id: 'IMG-04', P: 'HIGH', tool: 'qa-run', title: 'Content images in WebP/AVIF' },
  { id: 'IMG-05', P: 'HIGH', tool: 'qa-run', title: 'No loading=lazy on images visible in the first viewport' },
  { id: 'IMG-06', P: 'HARD', tool: 'qa-run', title: 'No visible broken image' },
  { id: 'IMG-07', P: 'HARD', tool: 'qa-run', title: 'No uncompressed asset: per-file bytes under decisions.assetMaxKB (raster 300, SVG 50, favicon 20, og:image 200, font 150 KB); 0 bytes reported → ask' },
  { id: 'IMG-08', P: 'HARD', tool: 'qa-run', title: 'Alt is descriptive: not a generic word, not a file name, has letters; one alt shared by ≥3 different pictures on a page → ask' },
  { id: 'IMG-09', P: 'HIGH', tool: 'qa-run', title: 'A meaningful background-image (logo, portrait, infographic) has a text alternative: candidates listed with screenshots → ask' },
  { id: 'VID-01', P: 'HIGH', tool: 'qa-run', gate: 'video', title: 'Every `<video>` has a poster; autoplay videos are muted+loop+playsinline' },
  { id: 'VID-02', P: 'HIGH', tool: 'qa-run', gate: 'video', title: 'Video resolution fits its use: ≥ decisions.minVideoWidth for video a visitor can watch full screen, ≥ rendered width for background video (detached probe); unmeasurable clip or embed → not run' },
  { id: 'VID-03', P: 'HIGH', tool: 'qa-run', gate: 'video', title: 'Every video loads without a media error or 404; autoplay/background video actually plays while in view' },
  { id: 'VID-04', P: 'HIGH', tool: 'qa-run', gate: 'video', title: 'Video file ≤ decisions.maxVideoMB (size from the server headers, not from page weight)' },
  { id: 'VID-05', P: 'HIGH', tool: 'person', gate: 'video', title: 'One clip and every embed watched full screen at 1080p: sharp, no artefacts', route: 'agent or person opens each clip full screen → record.cjs' },

  // ---- fonts & text
  { id: 'FONT-01', P: 'HARD', tool: 'qa-run', title: 'Every rendered text family is declared (@font-face, decisions.fonts or decisions.systemFonts); declared faces load (0 errors, none left unloaded); form controls inherit the site font' },
  { id: 'FONT-02', P: 'HARD', tool: 'qa-run', title: 'Fonts self-hosted with font-display: swap; declared family+weight pairs = the ones used (no synthesised weight or style, no loaded weight left unused)' },
  { id: 'TEXT-01', P: 'HARD', tool: 'qa-run', title: 'No `<br>` inside copy (designer exceptions recorded in decisions)' },
  { id: 'TEXT-02', P: 'HARD', tool: 'spell', title: "Spelling: 0 real errors in every text source (visible, hidden, attributes, meta, JSON-LD) in each page's own language (en_GB when englishVariant is UK); a language with no dictionary → not run" },
  { id: 'TEXT-03', P: 'HIGH', tool: 'qa-run', title: 'One English variant (US/UK) across the English pages (other languages skipped and noted)' },
  { id: 'TEXT-04', P: 'MED', tool: 'qa-run', title: 'One capitalisation rule for buttons and arrow links on English pages (Title Case or Sentence case)' },
  { id: 'TEXT-05', P: 'HARD', tool: 'qa-run', title: 'No placeholders (lorem, "your text here", TODO, raw template tokens like {{…}}) in visible or hidden text, attributes, meta or JSON-LD' },
  { id: 'TEXT-06', P: 'MED', tool: 'qa-run', title: 'One name per thing: menu label = target page H1/title (a different word form fails; no shared word → ask)' },
  { id: 'TEXT-07', P: 'MED', tool: 'qa-run', title: 'One date format per language across the site (decisions.dateFormat if set)' },
  { id: 'TEXT-08', P: 'HARD', tool: 'spell', title: 'Grammar candidates in every text source (a/an + plural, doubled word, space before comma, double space, "..." vs "…", mixed quotes), each read in context' },

  // ---- copy & content
  { id: 'COPY-01', P: 'HARD', tool: 'qa-run', title: "Copy matches the client's source (sources.copy): every heading, list item and paragraph present and not cut; no source → not run, routed" },
  { id: 'COPY-02', P: 'HIGH', tool: 'qa-run', title: 'No duplicated text: the same text (≥20 characters) in two different visible blocks of one page → ask' },
  { id: 'COPY-03', P: 'HIGH', tool: 'qa-run', title: 'No truncated sentences (ends in a comma or a stop-word, or lacks the ending its siblings have) → ask' },
  { id: 'COPY-04', P: 'HIGH', tool: 'qa-run', title: '© year is the current year (decisions.copyrightYear); no cut numbers ("since 20"); a price of 0 → ask' },
  { id: 'COPY-05', P: 'HIGH', tool: 'qa-run', title: 'The same label + value metric in two or more cards of one group with different titles → ask' },
  { id: 'COPY-06', P: 'HIGH', tool: 'qa-run', title: "H1 unique across pages; an H1 equal to another page's menu label or title → ask" },
  { id: 'COPY-07', P: 'HIGH', tool: 'qa-run', title: 'No empty states left in: no card without text among siblings with text, no section with only a heading' },

  // ---- pages a project owes
  { id: 'PAGE-01', P: 'HARD', tool: 'qa-run', title: 'Legal page (Privacy Policy on client sites; Licensing and Changelog on templates) linked or at decisions.legalPath, answers 200, real text (no CMS draft or stub)' },
  { id: 'PAGE-02', P: 'HARD', tool: 'qa-run', title: '404 page is designed: site header and footer, a not-found message, a way home, not the CMS index fallback; a platform 401/password page opened and looked at' },
  { id: 'FOOT-01', P: 'HARD', tool: 'qa-run', title: 'Footer credit matches the company rule recorded in decisions.credit: required wording, each credit word a link with the expected href, link count; unset → not run' },

  // ---- forms
  { id: 'FORM-01', P: 'HARD', tool: 'qa-run', gate: 'forms', title: 'Every field accepts typing and has a real label (label[for], wrapping label, aria-label/labelledby; placeholder-only → ask)' },
  { id: 'FORM-02', P: 'HARD', tool: 'qa-run', gate: 'forms', title: 'Required fields marked visibly (asterisk or "required" note)' },
  { id: 'FORM-03', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'autocomplete set on name/email/phone/organisation fields' },
  { id: 'FORM-04', P: 'HARD', tool: 'qa-run', gate: 'forms', title: 'Anti-spam present (captcha, Turnstile or honeypot) on every form' },
  { id: 'FORM-05', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Field rules: date fields refuse past dates where a future date is meant; number/phone fields refuse letters and negatives where a count is meant' },
  { id: 'FORM-06', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Empty submit is blocked with a visible message; the error state does not shift layout (field heights, select arrow/icons relative to their field) — needs --form-errors' },
  { id: 'FORM-07', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Form fields: same computed height, padding, line-height and type in WebKit, Firefox and real Safari as in Chromium' },
  { id: 'FORM-08', P: 'HARD', tool: 'wp-admin', toolBy: MAIL_TOOLS, gate: 'mailForms', stage: '2', title: 'Mail config for every form provider: real recipients only (no test, example or agency addresses), sender on the site domain (n/a where the platform sends from its own), auto-reply on; a provider no script reads → not run with its screen', route: R_MAIL },
  { id: 'FORM-09', P: 'HIGH', tool: 'wp-admin', toolBy: MAIL_TOOLS, gate: 'mailForms', stage: '2', title: 'Mail content: every field labelled, page URL + page title (in the subject if decided), no unknown [tags]; auto-reply readable', route: R_MAIL },
  { id: 'FORM-10', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Text sits at the same vertical position inside every single-line field in WebKit, Firefox and real Safari as in Chromium (pixel ink box, ±2px)' },
  { id: 'FORM-11', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Typing and date entry work in WebKit, Firefox and an iPad touch context (native date fills, JS picker opens and fills, date field not collapsed)' },
  { id: 'FORM-12', P: 'HARD', tool: 'qa-run', gate: 'forms', title: 'Form has a destination (action, platform handler or JS submit listener); type matches the content (email, tel), maxlength set within decisions limits, a required select starts on an empty option, meaningful field names; an invalid email is rejected' },
  { id: 'FORM-13', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'An empty select looks like the input placeholders; the submit button looks the same while anti-spam loads and is not disabled at rest; tab order follows the visual order' },
  { id: 'FORM-14', P: 'HARD', tool: 'person', gate: 'mailForms', stage: '2', title: 'One test submission per mail form, only with explicit permission: success state seen; admin email and auto-reply both arrive, not in spam; both read on desktop and phone', route: 'person, with permission → record.cjs --id FORM-14 --item per form (never recorded under FORM-09)' },
  { id: 'FORM-15', P: 'HIGH', tool: 'qa-run', gate: 'forms', title: 'Visible input/select/textarea font-size ≥16px at every tier below 768 (iOS focus zoom), every engine' },
  { id: 'FORM-16', P: 'HIGH', tool: 'person', gate: 'forms', title: 'A form used on several pages lives in one place (footer, page template or component), not pasted into each page; on the contact page the form is visible without scrolling or the first screen links to it', route: 'agent compares the form markup across pages and looks at the contact page screenshot at 1440 and 360 → record.cjs' },

  // ---- maps & visual review
  { id: 'MAP-01', P: 'MED', tool: 'qa-run', gate: 'maps', title: 'Embedded map (iframe or JS map) is not greyed out or covered at rest (filter/overlay until hover)' },
  { id: 'MAP-02', P: 'HARD', tool: 'qa-run', gate: 'maps', stage: '2', title: 'Map key valid: no "for development purposes only" watermark, key or billing error; a cross-origin iframe map → ask with a screenshot' },
  { id: 'MAP-03', P: 'MED', tool: 'person', gate: 'maps', stage: '2', title: 'Map markers click and open their info pop-up; marker icons as designed', route: 'agent clicks the markers where it can, else a person → record.cjs' },
  { id: 'VIS-01', P: 'HIGH', tool: 'person', title: 'Contact sheet looked at: full-page screenshots of every page at 1440/768/360, burger, form error state, Safari and iOS shots — alignment, composition, anything numbers miss', route: 'agent looks at every shot, hands the folder to the designer → record.cjs --id VIS-01' },

  // ---- seo / perf / security
  { id: 'SEO-01', P: 'HARD', tool: 'qa-run', title: '`<title>` present and unique; length outside decisions.titleLen → ask' },
  { id: 'SEO-02', P: 'HARD', tool: 'qa-run', title: 'Meta description present (unique on client sites); length outside decisions.descLen → ask' },
  { id: 'SEO-03', P: 'HARD', tool: 'qa-run', stage: '2', title: 'Canonical present and self (or noindex staging)' },
  { id: 'SEO-04', P: 'HIGH', tool: 'qa-run', title: 'og:image present and specific per post/item (not one image for every page)' },
  { id: 'SEO-05', P: 'HIGH', tool: 'qa-run', title: 'JSON-LD on every page parses (a marketplace template carries none → ask)' },
  { id: 'SEO-06', P: 'HARD', tool: 'qa-run', title: 'robots.txt, meta robots and X-Robots-Tag match the domain (staging closed, production open)' },
  { id: 'SEO-07', P: 'HIGH', tool: 'qa-run', stage: '2', title: 'Sitemap found (robots.txt Sitemap: or standard paths), answers 200 and lists the pages; URLs on another host → finding' },
  { id: 'SEO-08', P: 'HARD', tool: 'qa-run', title: 'Share preview: server HTML has og:title/description/url/image + twitter:card; exactly one absolute og:image answering 200 as JPG/PNG/WebP/GIF ≥1200×627 within decisions.ogImageMaxKB; social crawlers allowed by robots.txt on production' },
  { id: 'SEO-09', P: 'HARD', tool: 'qa-run', title: "No hard-coded http://: no mixed content on https, no http:// link to the site's own host (other hosts → ask)" },
  { id: 'SEO-10', P: 'HIGH', tool: 'qa-run', title: 'Charset declared; viewport meta has width=device-width (user-scalable=no or maximum-scale=1 → ask)' },
  { id: 'SEO-11', P: 'HARD', tool: 'qa-run', gate: 'faq', title: 'FAQ schema matches the page: FAQPage where an FAQ is, Question count = FAQ items, every answer in the markup before any click' },
  { id: 'SEO-12', P: 'HIGH', tool: 'qa-run', stage: '2', title: 'No orphan pages: every sitemap URL is linked from some crawled page (→ ask; decisions.orphanAllowed)' },
  { id: 'SEO-13', P: 'HIGH', tool: 'qa-run', title: 'Clean slugs: lowercase, hyphens, no dates, ids or ?p= queries (decisions.slugAllowed)' },
  { id: 'SEO-14', P: 'HIGH', tool: 'person', stage: '2', title: 'Share preview on the production domain checked in the social post inspectors (title, description, image, crop)', route: 'person on the production domain after launch → record.cjs' },
  { id: 'SEO-15', P: 'HIGH', tool: 'person', stage: '2', title: 'Every old URL that was in the search index answers 301 to its new page (list from the client or the search console); a new domain with no indexed pages → n/a by note', route: 'person with the list of old URLs (the agent may check each listed URL read-only) → record.cjs; no list → record.cjs --status routed --note "client: list of old URLs"' },
  { id: 'PERF-01', P: 'HARD', tool: 'lighthouse', stage: '2', title: 'Lighthouse, serial on an idle machine: mobile ≥70, desktop ≥90 (numbers per page)' },
  { id: 'PERF-02', P: 'HIGH', tool: 'qa-run', title: 'Page weight ≤3 MB on mobile' },
  { id: 'PERF-03', P: 'HIGH', tool: 'person', stage: '2', title: 'External speed tests of the company checklist (Pingdom, GTmetrix) run and their numbers recorded per page', route: 'person runs the external tests → record.cjs with the numbers' },
  { id: 'SEC-01', P: 'MED', tool: 'qa-run', stage: '2', title: 'HSTS + basic security headers on the document' },

  // ---- tracking, clone leftovers, template code
  { id: 'TRACK-01', P: 'HARD', tool: 'qa-run', title: 'Analytics/tracker inventory printed; no placeholder IDs (GTM-XXXX, G-XXXX); only IDs on decisions.analyticsIds; none on a marketplace template' },
  { id: 'DONOR-01', P: 'HARD', tool: 'qa-run', gate: 'donor', title: 'No donor leftovers in the published HTML or network: name, domain, links, socials, form names, script hosts (decisions.donor; null → ask)' },
  { id: 'DONOR-02', P: 'HARD', tool: 'person', gate: 'donor', platforms: NOT_STATIC, stage: '2', title: 'No clone leftovers in the platform lists: pages not in the brief, donor or empty CMS collections, default or foreign form names, site/page custom code', route: 'read the platform lists (wp-admin or the Webflow connection, read-only) → record.cjs' },
  { id: 'TPL-01', P: 'HARD', tool: 'qa-run', gate: 'template', title: 'A marketplace template ships only the platform runtime and GSAP with its official plugins; every other script or embed is named (decisions.allowedScripts)' },

  // ---- multilingual
  { id: 'I18N-01', P: 'HARD', tool: 'qa-run', title: "Every page has a valid `<html lang>`; on a multilingual site it equals the page's own hreflang and URL locale" },
  { id: 'I18N-02', P: 'HIGH', tool: 'qa-run', gate: 'lang', title: 'hreflang on every page: self entry, every locale and x-default; pairs reciprocal; every alternate answers 200' },
  { id: 'I18N-03', P: 'HARD', tool: 'qa-run', gate: 'lang', title: 'Language switcher changes the visible content, `<html lang>` and the URL locale in Chromium, WebKit and Firefox at 1440 (click) and 360 (tap)' },
  { id: 'I18N-04', P: 'HIGH', tool: 'qa-run', gate: 'lang', title: 'The chosen language persists after following an internal link' },
  { id: 'I18N-05', P: 'HARD', tool: 'qa-run', gate: 'lang', title: 'Every page translated in every locale: visible text, form labels, placeholders and buttons, title and meta description (validation messages with --form-errors)' },
  { id: 'I18N-06', P: 'HARD', tool: 'qa-run', gate: 'lang', title: 'Translated pages pass the layout measures: header and same-class button heights within ±4px of the default locale' },

  // ---- cross-browser / devices
  { id: 'XB-01', P: 'HARD', tool: 'qa-run', title: 'WebKit and Firefox match Chromium: overflow, clipping, fonts, images, section positions (±2px), no engine-only JS error; an engine that did not launch → not run' },
  { id: 'XB-02', P: 'HARD', tool: 'safari-real', title: 'Real Safari (macOS) opens every page; same measures as WebKit (window widths recorded)' },
  { id: 'XB-03', P: 'HARD', tool: 'ios', title: 'iOS Simulator Mobile Safari, portrait, narrowest + widest iPhone + iPad: overflow, clipping, 8px edges, field font ≥16px on a fixed page sample (coverage in evidence); a missing device → not run' },
  { id: 'XB-04', P: 'HARD', tool: 'qa-run', title: 'Microsoft Edge (real browser via Playwright channel msedge or EDGE_PATH): same results as Chromium; not installed → not run with a route', route: 'install Edge (a person, needs admin) and rerun qa-run, or record.cjs --status routed --note "owner, machine, date"' },
  { id: 'XB-05', P: 'HARD', tool: 'route', title: 'Chrome on Android (emulator or USB device via adb): overflow, clipping, edges, fonts, images at the device width; no adb or device → not run with a route', route: 'Android emulator with a Google APIs image or a USB device; otherwise record.cjs --status routed --note "owner, device, date"' },
  { id: 'XB-06', P: 'HIGH', tool: 'qa-run', title: 'Safari hardening in project CSS: backdrop-filter, mask and background-clip:text carry their -webkit- twins; 100vh has an svh/dvh fallback' },
  { id: 'XB-07', P: 'MED', tool: 'qa-run', title: 'Motion and text hardening: prefers-reduced-motion handled where CSS animates; text-size-adjust set' },
  { id: 'XB-08', P: 'HIGH', tool: 'qa-run', title: 'Interactions per engine: toggles/FAQ, burger open/close and hover change state in WebKit and Firefox as in Chromium' },

  // ---- real iPhone (a person; the simulator does not replace these)
  { id: 'IOS-01', P: 'HARD', tool: 'person', stage: '2', title: 'Real iPhone: swipe on the open menu panel and the screen edge — the page behind stays still', route: R_IPHONE },
  { id: 'IOS-02', P: 'HIGH', tool: 'person', stage: '2', title: 'Real iPhone: tap a button, a card and an FAQ row, go back — nothing stays shifted or highlighted (sticky hover)', route: R_IPHONE },
  { id: 'IOS-03', P: 'HIGH', tool: 'person', stage: '2', title: 'Real iPhone: scroll down and up on every page — header does not jump, first screen and buttons are not under the address bar', route: R_IPHONE },
  { id: 'IOS-04', P: 'HARD', tool: 'person', gate: 'forms', stage: '2', title: 'Real iPhone form: tap each field, select and captcha — no zoom, keyboard does not cover the field, pickers work (submit only with permission)', route: R_IPHONE },
  { id: 'IOS-05', P: 'HIGH', tool: 'person', stage: '2', title: 'Real iPhone landscape on the widest model: nothing under the notch, no horizontal scroll', route: R_IPHONE },
  { id: 'IOS-06', P: 'HIGH', tool: 'person', stage: '2', title: 'Real iPhone, first open on mobile internet: the first screen appears smoothly, nothing left invisible', route: R_IPHONE },
  { id: 'IOS-07', P: 'HARD', tool: 'person', stage: '2', title: 'Real iPhone VoiceOver on the home page and a form page: navigation announced with a name, menu button announces its state, focus moves into the panel and back to the button on close', route: R_IPHONE },

  // ---- gated features without an instrument (a person runs the block in references/page-features.md)
  { id: 'FEAT-01', P: 'HIGH', tool: 'person', gate: 'search', title: 'Search: a query returns results; empty-query and no-results states and the results/archive pages are styled; autosuggest and "All results" as designed', route: 'person runs the search block → record.cjs' },
  { id: 'FEAT-02', P: 'HARD', tool: 'person', gate: 'subscribe', stage: '2', title: 'Subscribe: the field accepts text and the form submits (with permission); the subscriber gets the email and lands in the list; unsubscribe works', route: 'person, with permission → record.cjs' },
  { id: 'FEAT-03', P: 'HIGH', tool: 'person', gate: 'fileFields', title: 'File field: accepted formats and size limit stated and enforced', route: 'person tries an allowed and a refused file without submitting → record.cjs' },
  { id: 'FEAT-04', P: 'HIGH', tool: 'person', gate: 'sortFilter', title: 'Sorting and filtering change the list correctly; reset works; an empty result is styled', route: 'person → record.cjs' },
  { id: 'FEAT-05', P: 'HIGH', tool: 'person', gate: 'downloads', title: 'Downloadable documents open, have readable file names and a sensible size', route: 'person → record.cjs' },
  { id: 'FEAT-06', P: 'MED', tool: 'person', gate: 'preloader', title: 'Preloader shows only while loading and never blocks the page', route: 'person on a throttled connection → record.cjs' },
  { id: 'FEAT-07', P: 'HARD', tool: 'person', gate: 'passwordPage', stage: '2', title: 'Password-protected page: the password form is styled like the site, a logged-out private window is asked for the password, the agreed password lets in (typed by the person)', route: 'person (the agent never types passwords) → record.cjs' },
  { id: 'ACC-01', P: 'HARD', tool: 'person', gate: 'accounts', stage: '2', title: 'Registration, login and the user account (references/forms-accounts.md §14) run by a person with test accounts', route: 'person with test accounts (the agent never types passwords) → record.cjs per section' },

  // ---- CMS content & editability
  { id: 'CMS-01', P: 'HIGH', tool: 'qa-run', gate: 'cms', title: 'A related/collection list on a detail page does not link to the page itself' },
  { id: 'CMS-02', P: 'HIGH', tool: 'wp-admin', toolBy: { wordpress: 'wp-admin', webflow: 'webflow', other: 'person' }, platforms: NOT_STATIC, stage: '2', title: 'Inventory: every CMS object counted per type and state; every published item of a public type appears on some crawled page (link or title), else ask; drafts, scheduled and private items listed', route: 'WordPress: wp-admin-audit.js; Webflow: CMS items via the connection; other CMS: person → record.cjs' },
  { id: 'EDIT-01', P: 'HARD', tool: 'person', platforms: NOT_STATIC, stage: '2', title: 'Editor editability: every section selectable and named, text edited in the canvas, an image replaced from the media library, sidebar controls change the canvas (type, look, undo — never save)', route: 'person in the editor, type-look-undo → record.cjs; a row that needs saving → routed with the exact screens' },
  { id: 'EDIT-02', P: 'HARD', tool: 'person', platforms: NOT_STATIC, gate: 'cms', stage: '2', title: 'Collection editability, by a person with permission: a draft entry renders in the list and is deleted again, an edit to an existing entry shows on the page, fields have labelled controls, permissions checked as a non-admin user', route: 'person with permission → record.cjs' },

  // ---- WordPress internals
  { id: 'WP-01', P: 'HARD', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: block validity 0 invalid, 0 core/html, 0 missing (every content type parsed)' },
  { id: 'WP-02', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: trash empty, no default content, Uncategorized not default, no empty categories' },
  { id: 'WP-03', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: plugins — no migration/dev leftovers, no local-dev mu-plugins, caching + image optimisation active, updates applied' },
  { id: 'WP-04', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: one stock theme only; theme author = decisions.themeAuthor (unset → ask) + screenshot.png' },
  { id: 'WP-05', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: no unused media (every content type and rendered page searched; files used only by trashed posts included)' },
  { id: 'WP-06', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: no template/template-part saved in DB over the theme file' },
  { id: 'WP-07', P: 'MED', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: every top-level section named in List View' },
  { id: 'WP-08', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: users — no dev/fake emails, admin count justified' },
  { id: 'WP-09', P: 'HARD', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: comments match blog presence — closed globally and per item when there is no comment section; with one: moderation on, name+email required, link limit; held/spam/trash queues counted' },
  { id: 'WP-10', P: 'HARD', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: a block theme ships a 404 template in its files (otherwise WordPress serves index)' },
  { id: 'WP-11', P: 'HIGH', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: theme templates exist for what the site has — single/archive for posts and each content type with entries, search when the site has search' },
  { id: 'WP-12', P: 'HARD', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: generated global stylesheet complete — every settings.custom value present as --wp--custom--*, braces balanced' },
  { id: 'WP-13', P: 'HARD', tool: 'route', platforms: ['wordpress'], stage: '2', title: 'WP: editor canvas = front end at Desktop, Tablet and Mobile preview', route: 'canvas-diff tool where installed, else a person compares the editor at the three preview widths with the front-end screenshots → record.cjs' },
  { id: 'WP-14', P: 'HARD', tool: 'wp-admin', platforms: ['wordpress'], stage: '2', title: 'WP: a content type with its own capability_type is editable by an administrator (map_meta_cap)' },
  { id: 'WP-15', P: 'HIGH', tool: 'person', platforms: ['wordpress'], gate: 'acf', stage: '2', title: 'WP: flexible-content layouts reusable, no unused layouts left, every shortcode option checked', route: 'person in wp-admin, read-only → record.cjs' },

  // ---- Webflow internals
  { id: 'WF-01', P: 'HARD', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'Custom code only where declared: site head/footer, every page head/footer and the registered-scripts list (template: none; client: decisions.allowedCustomCode); no stray HTML Embed or Code Block' },
  { id: 'WF-02', P: 'HARD', tool: 'qa-run', platforms: ['webflow'], gate: 'forms', title: 'Every form has a unique name (form data-name): two forms with different fields under one name, or a default name such as "Email Form", is a finding' },
  { id: 'WF-03', P: 'HIGH', tool: 'qa-run', platforms: ['webflow'], title: 'Form success/error and Collection List empty states are not the platform default texts' },
  { id: 'WF-04', P: 'HARD', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'CMS integrity: no draft or archived item linked from a published page; required and reference fields filled in every item; every collection has meta description and OG fields, bound and filled per item' },
  { id: 'WF-05', P: 'HARD', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'Alt in all three places: every asset in the Assets panel, every CMS image field, every image inside Rich Text' },
  { id: 'WF-06', P: 'HIGH', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'Site republished after the last CMS change (site lastPublished ≥ newest item update)' },
  { id: 'WF-07', P: 'HARD', tool: 'person', platforms: ['webflow'], stage: '2', title: 'Designer Audits panel: issue count per page read at the start and brought to zero by the end', route: 'person in Designer reads the Audits panel → record.cjs with the counts' },
  { id: 'WF-08', P: 'HIGH', tool: 'qa-run', platforms: ['webflow'], title: 'Interaction wiring: every data-w-id has an interaction in the published interactions data, and every interaction has its target' },
  { id: 'WF-09', P: 'HIGH', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'Detail-page links generated inside Collection Lists, never typed by hand; every page slug matches every path that leads to it' },
  { id: 'WF-10', P: 'HIGH', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'File stays editable: text in Heading/Paragraph/Text Block, shared classes unchanged (instance changes on combo classes), colours and sizes from Variables on templates' },
  { id: 'WF-11', P: 'HIGH', tool: 'webflow', platforms: ['webflow'], stage: '2', title: 'No unused assets: the Assets panel compared with the published pages AND the CMS data (fields reference files the pages do not show)', route: 'Webflow connection read-only (assets, collections, items) or a person in Designer → record.cjs' },
];

const ID_RE = /^[A-Z][A-Z0-9]*-\d{2}$/;
const FIELDS = ['id', 'P', 'tool', 'title', 'platforms', 'stage', 'gate', 'toolBy', 'route'];

function validate(rows) {
  const bad = [], seen = new Set(), tools = Object.keys(TOOLS);
  for (const r of rows) {
    const id = r && r.id;
    if (!id || !ID_RE.test(id)) bad.push(`${id}: id must match AREA-NN`);
    if (seen.has(id)) bad.push(`${id}: duplicate id`);
    seen.add(id);
    if (!PRIORITIES.includes(r.P)) bad.push(`${id}: P must be one of ${PRIORITIES.join('/')}`);
    if (!tools.includes(r.tool)) bad.push(`${id}: unknown tool "${r.tool}"`);
    if (!r.title || !String(r.title).trim()) bad.push(`${id}: empty title`);
    if (/[\n|]/.test(r.title || '')) bad.push(`${id}: title must not contain a newline or "|"`);
    if (r.platforms !== undefined && (!Array.isArray(r.platforms) || !r.platforms.length || r.platforms.some(p => !PLATFORMS.includes(p)))) bad.push(`${id}: platforms must be a non-empty list of ${PLATFORMS.join('/')}`);
    if (r.stage !== undefined && !STAGES.includes(r.stage)) bad.push(`${id}: stage must be '1' or '2' (absent = both)`);
    if (r.gate !== undefined && !GATES[r.gate]) bad.push(`${id}: unknown gate "${r.gate}"`);
    if (r.toolBy !== undefined) for (const [p, t] of Object.entries(r.toolBy)) {
      if (!PLATFORMS.includes(p)) bad.push(`${id}: toolBy has unknown platform "${p}"`);
      if (!tools.includes(t)) bad.push(`${id}: toolBy has unknown tool "${t}"`);
    }
    if ((r.tool === 'person' || r.tool === 'route') && !r.route) bad.push(`${id}: a ${r.tool} row needs a route (how it is closed)`);
    for (const k of Object.keys(r)) if (!FIELDS.includes(k)) bad.push(`${id}: unknown field "${k}"`);
  }
  return bad;
}

const problems = validate(ROWS);
if (problems.length) throw new Error('qa-check registry invalid:\n' + problems.join('\n'));

const BY_ID = new Map(ROWS.map(r => [r.id, r]));
// The tool that closes a row on this platform (FORM-08/09 and CMS-02 depend on it).
const toolFor = (row, platform) => (row.toolBy && platform && (row.toolBy[platform] || row.toolBy.other)) || row.tool;
// Does the row apply to this run? true, or the reason it is n/a.
function appliesTo(row, ctx = {}) {
  if (row.platforms && ctx.platform && !row.platforms.includes(ctx.platform)) return `platform is ${ctx.platform}`;
  if (row.stage && ctx.stage && String(ctx.stage) !== row.stage) return `stage ${row.stage} only`;
  return true;
}
Object.defineProperties(ROWS, {
  TOOLS: { value: TOOLS }, PRIORITIES: { value: PRIORITIES }, PLATFORMS: { value: PLATFORMS }, STAGES: { value: STAGES }, GATES: { value: GATES },
  byId: { value: id => BY_ID.get(id) }, toolFor: { value: toolFor }, appliesTo: { value: appliesTo }, validate: { value: validate },
});
module.exports = ROWS;

if (require.main === module) {
  if (process.argv[2] === 'list') console.log(JSON.stringify(ROWS.map(r => ({ id: r.id, tool: r.tool, title: r.title })), null, 1));
  else {
    const by = k => ROWS.reduce((m, r) => { const v = r[k] || 'both/any'; m[v] = (m[v] || 0) + 1; return m; }, {});
    console.log(`registry OK: ${ROWS.length} checks`);
    console.log('by tool:', JSON.stringify(by('tool')));
    console.log('by P:', JSON.stringify(by('P')));
    console.log('by stage:', JSON.stringify(by('stage')));
  }
}
