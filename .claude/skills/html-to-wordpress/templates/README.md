# Templates

Working code that is the same in every project. **Copy these instead of writing
them from scratch** — authoring this boilerplate by hand costs 5–8 minutes a run
and tends to come out weaker than the version here, which has been hardened
against real failures.

Replace the placeholders and nothing else:

| Placeholder | Replace with |
|---|---|
| `theme_prefix_` | the theme's function prefix |
| `ThemeName` | the theme name in docblocks |
| `theme-textdomain` | the theme's text domain |
| `xx_thing` / `Things` / `Thing` | the collection's key and labels |
| `xx-primary` / `xx-ghost` | the design's button variant names |
| `xx-` | the theme's class prefix (`PREFIX` in `canvas-diff.js`) |

| File | What it is | Editing needed |
|---|---|---|
| `upqode-panel/` | **The panel — installed on every port.** UPQODE Dimensions and Animations on every block, per-screen Typography, Colors as tokens, Form fields and Export / Import in Styles | none: `node upqode-panel/install.js <theme> <prefix>` does it; see its README |
| `svg-support.php` | SVG uploads with a DOM allow-list sanitiser, admin-gated | prefix only |
| `register-cpt.php` | One collection: post type, fields, sidebar panel, post-import check | prefix + names |
| `block-styles.php` | Block style variations with a core-collision check — superseded by the panel's `<prefix>_block_styles` filter; only for a theme without the panel | prefix + names |
| `validate-blocks.php` | The real validator: builds a Gutenberg-parser harness, prints a URL, reports every invalid block | prefix only |
| `bootstrap.php` | Limits, loader, database-identity guard, admin user, MIME repair | two constants |
| `probe.js` | The measuring rig, with every known browser-pane lie worked around | prefix in the enqueue snippet |
| `extract-css.js` | The CSS extractor: all matching rules by media condition, with specificity | nothing |
| `inserter-categories.php` | One named group in the inserter for the theme's blocks and patterns | prefix + the label |
| `check-theme-json.js` | Lint: quote parity in `settings.custom`, plus the two slug faults | nothing |
| `nav-block/` | The theme's own navigation block — render, editor registration, drawer script, structural CSS | prefix + design values |

## Notes

**`svg-support.php` is copied verbatim.** It parses and rebuilds each file
against an allow-list rather than matching tags with regular expressions, refuses
`<!DOCTYPE>` and `<!ENTITY>`, unwraps `<a>`/`<switch>` instead of deleting their
children, and gates uploads on `manage_options`. Do not write a lighter version;
regex-based sanitisers are the usual way an SVG upload becomes a stored XSS.

**`register-cpt.php` also hides the raw Custom Fields table** while keeping the
support REST needs, so the labelled sidebar panel is the only place a field is
edited. Never drop `custom-fields` from `supports` to achieve that — it takes the
whole `meta` object out of REST.

**`register-cpt.php` has three LOAD-BEARING lines** marked in the file —
`custom-fields` in `supports`, `publicly_queryable`, and `show_in_rest` +
`single` on each field. Each of them, when missing, breaks the editor while
leaving the front end correct.

**`validate-blocks.php` runs Gutenberg's own parser**, so its answer is the one
the editor gives. It needs no login: it collects the editor's scripts, writes a
throwaway page beside `index.php`, and prints the URL to open. Read the JSON,
then delete the file. Do not write a replacement that compares classes — that
kind passes `core/button` and everything else with
`__experimentalSkipSerialization` while those blocks are invalid.

**`nav-block/` replaces `core/navigation`, and only when the design needs it.**
Use it for a mega panel, a panel that spans the header, hover-revealed marks, or
a drawer with real behaviour; use core's block for a plain menu. Copy the folder
to `blocks/nav/` in the theme, require `register.php` from `functions.php`, and
replace every value marked `DESIGN` in `nav.css` — those are placeholders, not
defaults.

**It is one header archetype, not the header.** It assumes a desktop bar that
collapses into a burger and a drawer below a breakpoint: `nav.js` carries
`DESKTOP = '(min-width: 992px)'` and every hiding rule sits under one `max-width`
query. A header is designed per project, and a full-screen overlay, a burger at
every width, a centred split logo or a vertical rail is a different shape —
replacing the `DESIGN` values adapts the numbers, never the shape. Read the
design's header first and decide whether this is a thing to copy, to adapt, or to
take the mechanics from. `SKILL.md`, Step 6, has the table of which parts travel
to every project and which were one project's answer.

**Four things in it are load-bearing**, and these are the parts worth keeping even
when the markup is rewritten:

- `wp-server-side-render` in the editor script's dependencies, without which the
  block registers on the server and shows as unknown in the editor;
- the `.js-nav` class the script puts on `<html>`, which every hiding rule is
  written under, so that no script means nothing hidden — that is what keeps the
  editor canvas from rendering a blank strip;
- **no `function` declared in `render.php`**: the file is included once per block
  instance, so a function in it is declared twice the moment a page holds two
  navigations — a fatal redeclare, on the front end, after one menu looked fine.
  Helpers live in `register.php`;
- **printing rather than returning**, with no output buffer. WordPress includes
  the file inside its own buffer and takes what was printed; a returned string is
  discarded and the block renders as nothing — registered, valid, empty.

**`probe.js` is copied, never rewritten.** It handles the failures that cost a
measured port roughly 25 minutes and produced green checks on a page that was
broken: it waits for `document.fonts.ready`, forces lazy images to load and to
report real dimensions, disables transitions before reading computed values,
recurses into `@media` when walking the CSSOM (and says so when the sheet list is
empty rather than reporting "no rule"), dispatches scroll rather than trusting the
pane to, and excludes Webflow's badge from the fingerprint. Enqueue it behind
`?probe=1` on both the port and the trimmed source copy.

**`extract-css.js` is run, not rewritten.** `node extract-css.js source.css
.some-class '#some-id'` writes the complete answer to `css-extract.txt` and prints
a per-name rule count. It parses with a brace counter rather than a regular
expression, so rules inside `@media` are found instead of silently missed; it
matches whole tokens, so `.hero` does not match `.hero-title`; it replaces
data-URIs before parsing; and it reports zero matches as a question rather than as
"the design does not set it".

**`inserter-categories.php` registers both lists.** Blocks and patterns are kept
in separate registries, so one call does not cover the other: an unregistered
block category drops the block into "Widgets", an unregistered pattern category
drops the pattern into "Uncategorized". Set `THEME_PREFIX_INSERTER_LABEL` once,
give every custom block `"category": "upqode"` in its block.json and every section
pattern `Categories: upqode-sections`.

**`check-theme-json.js` runs after every write to `theme.json`.** One apostrophe
in a manifest description — the word "core's" — opened a CSS string, the parser
swallowed the rest of the `:root` block and the `:where(body){margin:0}` after it,
and every page on the site gained an 8px body margin. Parity is the thing: an even
number of apostrophes survives, an odd one is fatal, so the fault lies dormant
until an unrelated edit.

## Build these per project

Not templated, because they are coupled to the page and the pattern list: the
drift check, the guarded save, and the resync script. Their specifications are in
Step 14.
