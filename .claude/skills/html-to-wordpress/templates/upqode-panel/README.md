# The UPQODE panel

Installed on **every** port, in Step 0, without asking. It is how the theme is
built: every value the designer might change, at any of the seven screens, is a
setting on the block, and what the panel cannot say is a block style.

```
node install.js <theme-dir> <prefix>
```

`<prefix>` is the project's name, lowercase (`modix`, `acme-co`) — never
`upqode`. The script copies two folders into the theme, replaces the
placeholders, requires `inc/upqode-panel/panel.php` from `functions.php`, and
refuses to finish if a placeholder survives. Re-run it to update a theme; it
touches nothing outside the two folders and the one require line. **Never edit
the copied files in a theme** — change the template here and re-install.

### Carrying a change back, when it was made in a theme anyway

It happens: the panel gets reworked on a live project, with the designer
watching, and the template is a version behind. The difference between the two
is only the prefix, so the way back is a substitution — and the check that it
was only a substitution is the **round trip**: put the prefix back and the file
must be the theme's own file, byte for byte. Then install the template into an
empty folder with that project's prefix and diff it against the theme: every
file must come out identical. Two files are allowed to differ and both are
declared — `panel.css`, whose motion tokens are placeholders here and measured
there, and any file the theme keeps as CRLF.

Use Python or Node for the substitution, not `sed`: under MSYS it reads CRLF and
writes LF, and it silently took 752 carriage returns out of `panel.css`.

## What the designer gets

| Where | Name | Holds |
|---|---|---|
| Block → Settings | **UPQODE Dimensions** | nine sections — see below |
| Block → Settings | **UPQODE Animations** | Fade in on load · Fade in on scroll · Line draws itself · Zoom in on load — delay and step |
| Block → Styles → Typography | the seven icons above the font size | the block's own size per screen |
| Styles → Typography | seven icons on Text (Small · Body · Large), Headings (All, H1–H6), Button, Caption | size, line height, letter spacing, weight per screen |
| Styles → Colors | the palette | is the `--c-*` tokens; a colour added anywhere becomes a token; "New colour" in every swatch popover |
| Styles → Form fields | a row under Layout | Default · Focus · Error, eleven values each |
| Styles → Export / Import | a row under Blocks | the five sections in one file |

Core's own Dimensions, Layout and Border panels are hidden in the block
inspector — one way in. "Additional CSS class(es)" is removed for anyone who
cannot `edit_theme_options`, and stays empty for everyone else.

## UPQODE Dimensions — nine sections, one open

Eighteen groups in a flat list is what made the panel "uncomfortable to edit".
They are grouped the way Webflow groups them, and **only the first is open**:
the rest are closed on arrival, so the panel opens on what it is opened for.

| Section | Open | Holds |
|---|---|---|
| *(no heading)* | ✔ | Hide on this screen · Padding · Margin · Gap · Width · Height |
| **Layout** | | what it does to its CHILDREN: display, then direction, distribute, align, wrap |
| **Flex child** | | what it does inside its PARENT: Shrink / Grow / Fixed presets, then basis — and a fold for align-self and order |
| **Position** | | position, with a fold for the four offsets and z-index |
| **Grid** | | columns and track width — **only when the block is a grid** |
| **Grid child** | | grid-column, picked as start and span — **only when the parent is a grid** |
| **Text** | | text-align and text-wrap, per screen, which core's own control cannot do |
| **Border** | | core's own border and radius controls, once per screen |
| **More** | | opacity, overflow, aspect ratio, crop, fill |

Three things in that table are the whole idea and are easy to undo by accident:

- **A section can come and go.** `'when' => 'grid'` draws it only where the
  block is a grid — core's Grid layout, or `display: grid` chosen in the panel
  at any screen; `'in-grid'` asks the same of the parent. A column count under a
  block that is not a grid writes a property nothing reads, and the designer has
  to learn to ignore it.
- **A preset beats a number where the number is a term of art.** Flex child
  offers Shrink / Grow / Fixed, not two numeric fields called `flex-grow` and
  `flex-shrink`. Presets write several keys at once — in **one** write, through
  `writeMany`: writing them one at a time starts each from the render's own copy
  of the attributes and only the last one survives.
- **A dropdown says what it does, not what it is called.** `display` reads
  "A row of its children", not `flex`. The CSS name goes beside the field, small
  and grey, for whoever knows it.

A group drawn in a section must not also be drawn under More: declare it placed,
or it appears twice.

## The seven screens

| Icon | Screen | Key | Cascading query | Hide window |
|---|---|---|---|---|
| XXL | 1920+ | `1920` | `min-width: 1920px` | `min-width: 1920px` |
| XL | 1440–1919 | `1440` | `min-width: 1440px` | `1440 – 1919` |
| L | 1280–1439 | `1280` | `min-width: 1280px` | `1280 – 1439` |
| **M** | **992–1279** | **`base`** | **none** | `992 – 1279` |
| S | 768–991 | `991` | `max-width: 991px` | `768 – 991` |
| XS | 568–767 | `767` | `max-width: 767px` | `568 – 767` |
| XXS | 360–567 | `567` | `max-width: 567px` | `max-width: 567px` |

Sizes cascade outward from the middle (Webflow's model). "Hide on this screen"
never cascades: each tick is one closed window.

## After installing — three things by hand

1. **The tokens file.** `XXP_PANEL_TOKENS_FILE` (default `assets/css/tokens.css`)
   must define the `--type-*` and `--field-*` tokens from `tokens-skeleton.css`,
   with the source's numbers, the middle screen outside any `@media` and the six
   others under exactly the queries above. Enqueue it under the handle
   `<prefix>-tokens`, or point the panel elsewhere:
   `add_filter( '<prefix>_panel_tokens_handle', fn() => 'my-handle' );`
   The overrides print after that handle; if it is not registered they still
   print, just without the ordering guarantee.
2. **theme.json.** Merge `theme-json-snippet.json`: every element reads its
   tokens, `fontSizes` is empty, core's default presets are off.
3. **Open the editor and look.** A group's Settings tab shows UPQODE Animations
   and UPQODE Dimensions with seven icons, 992–1279 selected; Styles →
   Typography → Headings shows seven icons; set H2 at 767, save, and measure an
   H2 on the page at 700 and 900.

## Adding block styles

From one file every page loads:

```php
add_filter( '<prefix>_block_styles', function ( $styles ) {
	$styles[] = array( 'name' => 'glass', 'label' => 'Frosted glass', 'blocks' => array( 'core/group' ) );
	return $styles;
} );
```

and write the rule against `.is-style-glass`. Test before registering: a plain
block with core's controls and the panel, measured — if it comes out the same,
do not register the style.

## Adding a panel group, or narrowing one

`add_filter( '<prefix>_size_groups', … )` receives the groups. A group with
`'blocks' => array( 'core/image' )` is offered only there.
`add_filter( '<prefix>_panel_sections', … )` receives the nine sections and
decides where a group is drawn; a group no section claims is drawn under More,
so a new setting is never silently invisible.

A new measurement also needs its rules in `panel.css`: add it to `kinds` in
`build-panel-css.js` here, run `node build-panel-css.js`, re-install. Seven
screens × sixty properties is why that file is generated — **never add a band
rule to `panel.css` by hand**, the next run of the generator deletes it.

## What is in the template

| File | What |
|---|---|
| `inc/upqode-panel/panel.php` | Loader, the seven screens, asset and override printing |
| `inc/upqode-panel/dimensions.php` | Groups, value validation, render filter, parts, editor data |
| `inc/upqode-panel/animations.php` | Arrival classes, delay, the head gate |
| `inc/upqode-panel/block-styles.php` | The style registry (Small / Body / Large on a paragraph built in) |
| `inc/upqode-panel/type-scale.php` | Per-screen typography: tokens, defaults reader, overrides |
| `inc/upqode-panel/colors.php` | Palette → `--c-*` and `--rgb-*` |
| `inc/upqode-panel/field-styles.php` | Form field states |
| `inc/upqode-panel/styles-transfer.php` | Export / Import sections |
| `assets/upqode-panel/*.js` | The editor side of each, and `motion.js` for the page |
| `assets/upqode-panel/panel.css` | Generated: band rules, hide windows, canvas marks, arrivals |
| `assets/upqode-panel/editor-panels.css` | Sidebar chrome for every panel |
| `build-panel-css.js` | Regenerates `panel.css` |
| `tokens-skeleton.css`, `theme-json-snippet.json` | Starting points, not installed |

## Traps the panel already handles — do not undo them

- Screen keys are strings everywhere; PHP turns `'1440'` into an integer and the
  inheritance chain stopped after one step.
- Screens go to JavaScript as a list, not a map — integer-like keys reorder.
- A screen stores only what differs from what it would borrow.
- The middle gap reads `blockGap` unless the block keeps its own base gap: core
  turns `blockGap` into margins on a flow layout.
- Two gap shapes get different React keys, or the control keeps the old view.
- Values are validated before they reach a style attribute; `clamp()`, `min()`,
  `max()` and `calc()` are allowed. A refused value is dropped silently — read the
  page back after writing values.
- Nothing is printed on `core/post-template` or `core/comment-template`: they
  render once per post through the same filter.
- Parts reach the page through `render_block_data`, not by editing HTML.
- An option nobody wrote comes back as `[]`; every reader treats non-maps as empty.
- The field skin in the editor is scoped to `.editor-styles-wrapper`, never `:root`.
- A hidden block is faded in the canvas, not removed, so it can still be selected.
- A preset writes all its keys in one call. Several `write()`s in a row each
  start from the render's copy of the attributes, so only the last one survives.
- **`rgba()` in a block attribute is dropped by WordPress, silently** — the
  border colour comes back empty and nothing says why. Write 8-digit hex.
- The six size properties carry `!important` like the rest: core's layout
  stylesheet caps every child of a constrained block with a one-class selector
  that loads after `panel.css`, so a width set in the panel lost in silence
  while the sidebar went on showing the number.
- Core sets a field label's uppercase from an inline style whose selector
  repeats its class three times. Overriding it needs `!important`.
- The motion tokens in `panel.css` are placeholders and ship wrong unless the
  first port replaces them from the source. One port carried them for weeks,
  unnoticed, because no block had an arrival yet.

These panels mount into Global Styles by finding WordPress's own markup — there
is no slot, filter or hook there. They fail quietly if it moves. After a major
WordPress update, open Styles and check all four rows still appear.
