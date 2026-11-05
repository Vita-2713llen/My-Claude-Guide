---
name: html-to-wordpress
description: "Port a static HTML page (Webflow export, saved page, or hand-written HTML/CSS) into a WordPress block theme as native Gutenberg blocks the designer can fully edit from the block sidebar. Use when converting a design or static page into WordPress, rebuilding a Webflow site in WordPress, building theme.json design tokens from a design, or making an existing WordPress section editable from wp-admin. Trigger on Ukrainian requests too: «перенеси сторінку в вордпрес», «перенеси html у wordpress», «зроби з макета вордпрес тему», «порт сторінки», «збудуй сторінку на вордпресі з цього файлу», «перероби webflow на wordpress», «зроби сторінку редагованою в вордпресі». Covers environment setup, per-breakpoint CSS extraction, the UPQODE panel (every size, spacing, layout and visibility value set per breakpoint on the block itself, seven screens, Webflow-style cascade), per-breakpoint typography in Styles, block style variations for whatever the panel cannot say, design tokens, header/footer, patterns, custom post types, forms, fonts, animations, SEO and alt text, block validation, responsive verification, protecting the designer's wp-admin edits, and moving the finished site to its host. Also triggers on «перенеси сайт на хостинг», «мігруй сайт», «вигрузи сайт»."
compatibility: "WordPress 6.6+ (block bindings, pattern overrides), block theme with theme.json. Works with or without WP-CLI. The panel uses core's __experimental spacing and toggle-group components — verified on 6.8 to 7.1; re-check them after a major WordPress update."
---

# Porting a static HTML page into an editable WordPress block theme

Distilled from six production ports. This file is the short path — what to do,
in order.

**Two ideas the whole skill serves, and they are a pair.**

**One — everything is built out of core's blocks.** A section is core blocks in a
group until something makes that impossible, and the only thing that genuinely
makes it impossible is **behaviour**. Not "it would be tidier", not "the fields
map across neatly", not "it is easier to port" — that last one is how most custom
blocks actually get written, and it is the reason a designer has to ask *«чому це
кастомне? це хіба не можна зробити за допомогою гутенбергу?»* A custom block that
replaces markup takes the section out of the designer's hands: no reordering, no
extra paragraph, no image where they want one. Where behaviour is real, **the
block keeps the behaviour and everything the client changes becomes blocks inside
it.**

**Two — every value is set through the panel.** Every value the designer might
want to change — at any of the seven widths — is a setting on the block, visible
in the sidebar, at the width it belongs to. What the panel cannot say becomes a
named **block style**. The theme's stylesheet holds only what is not a block at
all.

The first decides *what the blocks are*; the second decides *where their values
live*. Read "The UPQODE panel" below before anything else; every step after it
assumes it. The first idea's hard cases — what is content, what is a field, and
what is neither — are `reference/content-model.md`.

- `templates/` — working code to copy, not write. Start there every time. Its
  `README.md` names every file, what to replace in it, and which of its lines are
  load-bearing; `templates/upqode-panel/` is the panel itself and is installed on
  every port.
- `reference/` — one file per subject, opened **when that subject comes up**, not
  read up front. Everything in them is distilled from ports that went wrong, so a
  rule here usually has its measured failure there.

  | File | Open it when |
  |---|---|
  | `traps.md` | something silently misbehaves — **and always when a thing is right on the page and wrong in the canvas, before measuring.** It holds that answer about half the time |
  | `gated-content.md` | anything on the site is for some readers and not others |
  | `content-model.md` | deciding what is a block, what is a field, and what is neither — including turning one into the other |
  | `patterns.md` | a repeated section needs delivering, or a pattern that exists cannot be found |
  | `block-authoring.md` | writing the theme's own block, or a control shows the wrong thing |
  | `loops-and-pagination.md` | a page lists records — and **always** before saying a list is done |
  | `editor-vs-front.md` | the page is right and the editor is not |
  | `css-js-delivery.md` | setting up the build, or a rule that is in the file does not apply |
  | `forms-and-motion.md` | building a form, or anything that moves |
  | `panel-migration.md` | an existing CSS-styled site has to move onto the panel. A fresh port never needs it |
  | `migration.md` | the site has to leave this machine — **ask which plugin first** |
  | `security-and-handover.md` | the last stretch, and once at the beginning for the audits |
  | `working-with-the-designer.md` | at the start, and whenever a correction arrives |

  (`reference/detail.md` was removed — it was never opened in any run. The long
  form of a rule lives in the rule.)

Speak the user's language. Map WordPress onto the tool they came from: Webflow
Components → synced patterns, Collections → custom post types, Variables →
`theme.json` presets, Assets panel → Media Library.

## Two phases, and the first one is the job

**Phase 1 — build the whole page.** Steps 0 to 11. Nothing here opens a browser
except where a value genuinely cannot be obtained otherwise. The output is a
complete page the designer can look at, and it is what the run is judged on.

**A page with invalid blocks is not built.** Run the validator (Step 12) before
the handover, not after — it is one script and a few seconds, and a canvas full
of "Attempt recovery" boxes is not something to show someone and then fix. This
is the one part of verification that belongs in phase 1, because it is not
measuring quality; it is checking the page exists.

**Phase 2 — verify. Three checks, each run once:**

- **A** — the page matches the source, at every breakpoint
- **B** — the editor canvas matches the page
- **C** — the editor works, at Desktop, Tablet and Mobile

Plus the block validator from Step 12. That is the whole of it: not a habit of
re-checking, three questions with three scripts. **It starts by itself the moment
the page is handed over — do not wait to be asked.** Hand over the link, then keep
going: the designer looks at the page while you check it, and neither of you is
waiting on the other. Report what it found and what you fixed.

The split is about **order**, not permission. Verification always happens; it
simply never stands between the designer and seeing their page. If they come back
with corrections mid-pass, those take priority — finish them, then resume.

A whole page in phase 1 beats two verified sections. If time is short, the page
gets finished and the verification waits; never the other way round.

## The non-negotiables

These cost nothing at build time. When something has to give, it is never one of
these.

1. **Every value comes from the CSS extractor, per breakpoint** — never from a
   picture or from memory, and never from a second measurement of the rendered
   source. One source of truth. This holds for **corrections too**: a reported
   defect is looked up in the source before anything is changed, never adjusted
   by eye until it looks right.
2. **Every section is written responsive at every breakpoint in one go**, then
   checked against its own extracted values before the next one starts — on paper, comparing what you wrote to what the extractor gave. No
   browser: that is free and catches most of it. Everything needing the browser
   waits for one pass at the end.
3. **Zero `core/html` blocks.** That is the "Custom HTML" block — a box holding
   raw markup. The client cannot edit it (changing two words means editing code),
   the editor does not validate it, nothing inside it is a block, so it has no
   sidebar, no panel and no styles, and both governing ideas above stop at its
   edge. It is also invisible to every check: a class inside it is found by
   neither the block validator nor the dead-class audit. And it is the usual
   dumping ground during a port — a decorative shape, an SVG, a divider, "I'll
   just paste the HTML" — which is quick once and permanent afterwards.

   **Every graphic is a real block or a pseudo-element**, and there are four
   answers, so there is never a fifth:

   | What it is | What it becomes |
   |---|---|
   | a photograph or illustration | `core/image` from the Media Library — the client can swap the file |
   | a shape, a gradient edge, a dotted field, a ring, a divider | **`::before` / `::after`** on a block that has real content, offered as a **block style** the designer picks by name |
   | a mark belonging to the design rather than the content | an SVG **in the theme folder**, printed by a pseudo-element or a dynamic block — never an attachment, which the client can delete without knowing what it was, taking the mark out of every page at once |
   | something that genuinely needs its own markup **and** one editable value | a small block of the theme's own with one field |

   See "Icons — the usual source of invalid blocks" in Step 7 for the three
   permitted shapes of an icon, and `reference/patterns.md` for where decoration
   lives.
4. **A section is core's blocks until behaviour makes that impossible.** Before
   writing a block of the theme's own, answer in one line *what core cannot do
   here* — and "the fields map across neatly" and "it is easier to port" are not
   answers. A collection section is `core/query` with a Post Template of core
   blocks, **always**; a custom block for the loop is a defect. Where the answer
   is real behaviour — a tab strip, a drawer, a fold, a slider — the block keeps
   **only** the behaviour and the content inside it stays core blocks. A container
   keeps nothing but what it would not be a container without.
5. **Every value a block shows is set on that block, through the panel, at the
   width it belongs to.** Padding, margin, gap, width, max-width, min-height,
   height, direction, alignment, wrap, text alignment, crop, visibility — at all
   seven screens — plus core's own colour, border, radius, typography and
   background. The theme's CSS never also writes one of these for a block: not
   as a default, not as a breakpoint override. See "The UPQODE panel".
6. **What the panel cannot say is a block style, chosen by name in the Styles
   tab** — a frosted glass, a pill with a dot, a gradient edge, a hover zoom.
   Never a class typed into "Additional CSS class(es)": that field stays empty,
   on every block, always.
7. **Layout is a block attribute**, never CSS alone: flex or grid on the block
   itself, so its gap is a real `gap` and the editor draws what the page draws.
8. **Check `supports` in `block.json` before writing an attribute.** An
   unsupported one is kept on the front end and dropped by the editor.
9. **Never inline SVG in a static block.** Icons are Media Library images,
   pseudo-elements or dynamic blocks — nothing else. This is not a preference:
   inline SVG makes the block invalid, every time, and the designer meets a row
   of "Attempt recovery" boxes instead of a page.
10. **Run the validator before handing the page over.** One script, seconds, and
   it is the difference between a page and a page covered in error boxes. An
   invalid block is not a verification finding — it is a broken build.
11. **Never write a theme file through the shell — including "just one line".** No
heredocs, no `echo >`, no `sed -i`, on any file under the theme, `editor.css` and
patterns included. This ban has been broken twice in a single run, the second time
after the first had already corrupted a file, because a one-line change does not
feel like writing a file. It is. Quoting eats backticks, dollar signs, `!` and braces, and
the failure is not a visible error — it is a file that still parses, a check that
still passes, and a defect that surfaces an hour later. Two files were corrupted
this way in a single run, and both times the damage showed up as a **false pass**.
Use the file-writing tool, and after writing anything substantial confirm it
survived.

**And confirm the property you care about, not a count that stands in for it.**
This clause used to read "line count, balanced braces, and the last line being
what you wrote", and that is precisely the check that failed: a run closed
`:root` in the middle of the token block, swallowing 126 declarations — the
families, the palette, the whole scale — into the class it was adding, and the
brace count was *balanced*, because one `{` and one `}` had been added. The
count passed, the check passed, and the page one run earlier lost every variable
it had.

So verify the structure, not its arithmetic:

| After editing | Confirm |
|---|---|
| CSS | which selector owns each declaration — walk the braces and print the owner of every `--var` and every property you touched |
| A block comment | that its attribute JSON parses, and that no `layout` or `metadata` ended up nested inside `style` |
| A pattern | that every `className` in a block comment also appears in the class attribute of the tag right after it |

**Never place a closing brace at the edge of the window you happened to read.**
That is the mechanism behind the `:root` disaster in full: fourteen lines were
read, the fourteenth was the comment header of the *next* group of tokens, and
the `}` went in front of it anyway. Before writing a `}` or a `]`, read to the
real end of the construct.

**Break every check you write before you believe it.** One deliberate wrong value,
confirm it goes red, put it back. Thirty seconds, and it is the single rule that
catches the most, because a check you wrote and immediately trusted is the easiest
thing in the run to get wrong — and its failure mode is a green result, which
nobody investigates. One run produced all of these inside one page, each reported
as clean:

| The check | Why it could not fail |
|---|---|
| `[^]]` in a regex over block attributes | cannot match JSON containing `]` — reported 0 className mismatches out of 14 |
| `\b` around a hyphenated class | `-` is a word boundary, so `prefix-bcard-media` counted as `prefix-bcard` — 104 cards reported for 13 |
| brace counting after a CSS edit | one `{` and one `}` added, count balanced, 126 declarations in the wrong selector |
| a brace walker that took comments as selectors | reported `--c-white` missing from `:root` when it was there |
| reading `__experimentalFeatures` for "what the client sees" | carries every origin bucket regardless of the flags — a defect was drafted for something that did not exist |

Same discipline for a mechanical edit: a string replacement over several files
assumed two shapes of class attribute and silently missed a third
(`wp-block-buttons …`, `… has-background`), so four blocks got the class in the
comment and not in the markup. **After a scripted patch, run the check that the
patch was supposed to satisfy** — do not read the script and conclude.

**The classes of false green**, which recur far more than any individual bug. A
sweep that reports a clean theme in four seconds has usually done one of these:

| Class | How it looks |
|---|---|
| matching a fragment | "is this file referenced" answered by its stem appearing anywhere — a file named `schema.php` proved alive by the string `schema.org` |
| not following indirection | a dependency walk that reads `require CONST . '…'` but not `require __DIR__ . '…'`, and calls live files dead |
| a word boundary on a hyphen | `\b` after `focus` splits `:focus-within`; the same trap as the row above, in a second disguise |
| one state only | a sweep run signed in reports every signed-out element dead, and the reverse. Run both |
| unnormalised comparison | `#fff` against `#ffffff`; `0` against `0px` |
| commented-out code read as live | and its mirror: masking comments in a way that loses their newlines, which shifts every line number reported |
| proving absence from a covering set | a set chosen to meet every style once cannot show a style is unused — the page carrying it may not be in the set. **There is no covering set for absence** |
| a default that equals the expected value | `margin-left: 0` is also what an element has when no rule reaches it. Compare against the rule's presence, not the computed value |

**So: a sweep is not believed until it has been run against a planted defect, and
the plant is described in the tool's own comment.** Plant an orphan, watch the
report name it, remove it. Under a minute, and it is the difference between a
report and a decoration.

**And a claim is scoped to the question the check asked.** "The dead code is gone"
after checking twenty-four class names is not true. "No CSS class is named
nowhere — files, functions and assets were not examined" is shorter and is. The
designer will ask *how did you check*, and the answer should already be in the
sentence.

**Copy the templates. Build nothing before something needs it** — before the
   header, only `theme.json`, the fonts, `functions.php` and the copied panel
   exist. **Images are
   handled by the section that places them**, never inventoried up front: nine
   minutes went into importing media for sections that were written forty minutes
   later.
12. **Nothing exists that the source does not declare.** No hover, no transition,
    no colour change, no spacing "that looks better". A missing `:hover` rule is a
    value: it means nothing happens. House conventions do not apply to a port.

    **This is about values, not about structure.** Padding, colour, duration,
    breakpoint — those are the source's and are never invented. The **skeleton
    and the semantics are the system's**, and they replace whatever the export
    happened to contain: a section is a `section`, the content wrapper is a
    `main`, the menu is in a `nav`, there is one `h1` and no skipped heading
    level — however many nested `div`s the source used to say it. Copying an
    export's markup faithfully is the one kind of fidelity nobody wants.
13. **Report every exception and everything not verified**, before being asked.
14. **A condition is enforced where records are CHOSEN, not only where they are
    drawn.** The moment anything on the site is for some readers and not others —
    a members' area, one block for signed-in people, a type not meant to be
    browsed yet — the page template and `render_block` are not the gate. The same
    records are handed out by machinery that calls neither: the search page, the
    REST collection, a REST read by id (where no query runs at all), feeds, and
    the sitemaps. `reference/gated-content.md` has the surfaces and the three
    hooks that cover them.
15. **A file under `uploads/` is public whatever the page around it says.** Before
    handover, take one file a restricted record links to and fetch it with no
    session. If it arrives, the restriction is decorative. This is not only a
    membership concern — it is any PDF behind a form, and above all anything
    inherited from a legacy import, where the old tree arrives intact and nothing
    links to most of it.

Phase 2 adds one more, and it carries the same weight as the rest: **the page is
opened and checked in the editor** — at Desktop, Tablet and Mobile, with the
canvas diffed against the front end. A front-end-only check is not a check, and a
page that is broken in the canvas is a page the designer cannot work with.

### Defects, not trade-offs

Each of these cost a port a day or more. Doing any of them differently is a
defect to be redone, not a decision to discuss.

- **A block's CSS is declared on the block itself.** A rule hung on a page
  ancestor vanishes the moment the block is placed anywhere else.
- **A custom block that replaces markup core could have drawn is a defect**, not
  a shortcut. The test is one line: *what can core not do here?* Behaviour is an
  answer; "the fields map across neatly" is not. A loop is never a custom block.
- **A block that only means something inside another is hidden from the
  inserter** — `supports.inserter: false` — and declares its `parent` or
  `ancestor`.
- **Validity runs both ways.** A class in the markup with no attribute behind it
  is as invalid as an attribute with no class. An invalid block is not handed
  over.
- **Blocks are registered in exactly one place.** A second registration breaks
  nothing visible and lives for months.
- **A block written into the database by a script goes through `wp_slash()` and
  is read back.** The script's own report is not proof — one importer reported
  "filled 5 entries" and had written nothing.
- **`static` in a block's `render.php` does not persist between blocks.** That
  file is included once per instance; a per-request cache lives in a function in
  `inc/`.
- **Sizes are measured in the browser, never read off a file** — with every
  animation and transition stilled, and the same state measured twice before a
  difference is believed. A baseline is only a baseline if it was taken before
  the first change, under the same conditions as the comparison.
- **Every band is checked, not a sample.** "Verified at 1440, 1100 and 560" is
  verified where nothing was going to differ.
- **A type with no pages of its own does not open by URL.** `public => false`
  only sets defaults: it takes `rewrite => false`, a guard on
  `template_redirect`, and a check of `/?post_type=<type>` — a separate door that
  does not close by itself.
- **SVG is accepted only through the sanitiser.** "Allow SVG for administrators"
  is not sanitising.
- **An entry with a page of its own is built from blocks.** Fields belong only to
  types that have no page.
- **Menus are in `<nav>`. One `header` and one `footer` per page, never nested.**
- **No absolute URL or root-relative path in markup or PHP.** The site's own
  pages through `home_url()`, theme files through `get_theme_file_uri()`, images
  by attachment id.
- **`html_entity_decode()` first, `rawurlencode()` second.** The other order
  encodes the entity, not the character.
- **Moving markup from PHP into JavaScript moves its translation too.** A string
  without a translation function is a string that will not exist in another
  language.
- **A dead class is one that appears nowhere** — not in CSS, PHP, JS or the
  database. Remove it only after all four searches.
- **After any edit to the theme's CSS or JS, run the build.** Otherwise the site
  quietly serves the unminified source of exactly that file.
- **`tabindex` on a form control is `0` or absent.** A positive value reorders
  the whole page.
- **`index.html` is the fallback loop, not a copy of `page.html`; `index.php` in
  the theme root is required.**
- **`DISALLOW_FILE_EDIT` is always on.** Hiding the menu item leaves the screen
  open by its address.
- **CSS and scripts load per page, by what the page contains** — and an
  `is-style-…` word counts as a class, because a block style is offered on every
  page. A word ending in a hyphen is a prefix, not a class.
- **Before handover: the theme audit, a sweep with `WP_DEBUG_LOG` on, and every
  developer tool removed.**
- **A move to another host replaces the address the database actually carries,
  not the one the site was opened at** — serialisation-safe, and the database is
  searched again afterwards to prove it is gone.

## The UPQODE panel — how every value gets onto the page

The designer's rule, in the designer's own words: *during a conversion everything is built with
the panel; the panel is on every block and is built automatically; anything that
cannot be done with it is done as a separate style; and the breakpoints are never
forgotten.* The rest of this section is what that means in practice.

**It is installed on every port, from `templates/upqode-panel/`, in Step 0** —
before the header, with the prefix replaced, and without asking. It is not a
feature of one project; it is how the theme is built. A port without it is a
port whose sidebar shows empty fields while the stylesheet decides everything,
and the designer opens any block on any page and finds nothing to change.

It attaches to **every block**, core's and the theme's alike: a
`blocks.registerBlockType` filter in the editor and `register_block_type_args`
on the server declare its attributes on all of them. A block that has not
declared an attribute in the editor gets it stripped back out of saved markup,
so both registrations are needed.

### What it holds

| Where | Name | Holds |
|---|---|---|
| Block → Settings tab | **UPQODE Dimensions** | nine sections, one open — below |
| Block → Settings tab, beside it | **UPQODE Animations** | Fade in on load · Fade in on scroll · Line draws itself — with a delay and a step |
| Appearance → Editor → Styles | **Typography**, **Colors**, **Form fields**, **Export / Import** | per-screen type, the palette as tokens, input states, one file for the whole look |

**Core's own Dimensions, Layout and Border panels are hidden in the block
inspector**, so there is one way in, not two that disagree. The Styles-wide ones
stay. The designer chose the place: beside Animations in the Settings tab, not
inside the Styles tab.

**Dimensions is sectioned, and only the first section is open.** Eighteen groups
in a flat list is what got the panel called uncomfortable to edit. The shape is
Webflow's: the box itself under no heading at all (hide, padding, margin, gap,
width, height), then **Layout** (what it does to its children), **Flex child**
(what it does inside its parent), **Position**, **Grid**, **Grid child**,
**Text**, **Border**, **More**. The full table is in the template's `README.md`;
three rules behind it are the part worth carrying:

- **A section with no subject is not drawn.** Grid appears only where the block
  is a grid — core's Grid layout, or `display: grid` chosen in the panel at any
  screen — and Grid child only where the parent is one. A control that writes a
  property nothing reads teaches the designer to ignore controls.
- **A preset wherever the number is a term of art.** Flex child offers Shrink /
  Grow / Fixed, not two fields called `flex-grow` and `flex-shrink` — and a
  preset writes its keys in **one** call, or each write starts from the render's
  own copy of the attributes and only the last of them survives.
- **A dropdown says what it does.** "A row of its children", not `flex`. The CSS
  name sits beside the field, small and grey, for whoever wants it — once, not
  repeated as a label above the field as well.

**And the Design screen's own sidebar loses its Pages row.** Core lists Pages
there beside Styles, Navigation, Patterns and Templates — a **second door to the
same content**, opening it in a different editor from the one everything else is
written in. Two doors to one room is how a page ends up edited in the place
nobody thinks to look, and how two people's changes quietly overwrite each other.

Nothing is removed: the pages, their editing and their permissions are untouched,
and the address the row pointed at still answers if it is typed. Only the offer
goes.

It is done in CSS, because that sidebar is a list WordPress builds in the browser
with no filter behind it. **Hook it on the row's address, not on a class name** —
the address is the one part of it that is not generated:

```php
wp_add_inline_style(
    'wp-edit-site',
    '.edit-site-sidebar__content [href$="p=%2Fpage"]{display:none !important;}'
);
```

enqueued only on `site-editor.php`. If a release ever changes that address the
row simply comes back, which is the harmless way for this to fail — say so in
the handover rather than leaving a silent dependency on a core selector.

**Every group names the blocks it answers for.** Crop is offered on an image, a
cover, a video, a featured image and media & text — not on a paragraph. A
control with no answer on that block is worse than no control.

**Block spacing is one field, not two.** A gap is one distance — the space
between the things inside — so it is drawn as a single box, the way core draws it
for a block whose layout is not axial. Two boxes appear **only where two
distances are real**: a `grid` layout, or a block that genuinely has a different
row and column gap, and then they read Vertical and Horizontal. Handing the
spacing control a side list it does not understand is what produces a lone box
labelled "Block spacing Top": the control knows the four sides and the two axes
and nothing else, so it drops what it cannot read and keeps the rest.

**And the two shapes need different React keys.** Same component, same slot: swap
the props and the control keeps whichever view it chose when it mounted, because
that view is initial state. The symptom is the wrong box in the right place.

**Reset all, and only Reset all.** A per-screen "clear this screen" was built once
and removed on the designer's word: a screen is cleared by emptying its fields,
which is the same gesture as changing them, and a second button that half-does it
is one more thing to explain.

### The seven screens

A row of seven device icons, the middle one selected when the panel opens, each
labelled with its numbers — never with words, never six of them:

| Icon | Screen | Key | Query |
|---|---|---|---|
| XXL | 1920 and wider | `1920` | `min-width: 1920px` |
| XL | 1440–1919 | `1440` | `min-width: 1440px` |
| L | 1280–1439 | `1280` | `min-width: 1280px` |
| **M** | **992–1279** | **`base`** | **none** |
| S | 768–991 | `991` | `max-width: 991px` |
| XS | 568–767 | `767` | `max-width: 767px` |
| XXS | 360–567 | `567` | `max-width: 567px` |

**The inheritance is Webflow's, and it is nothing but the cascade.** A value set
on the middle screen is in force everywhere. The three above are `min-width`, the
three below `max-width`, written outward from the middle — base, 1280, 1440,
1920, then 991, 767, 567 — so a value at 1440 reaches 1920 unless 1920 has its
own, and a value at 991 reaches 767 and 567 the same way. No script computes any
of it.

**The panel shows what is in force, not what is stored.** A screen with nothing
of its own shows the value it borrows, in grey, and on change it **keeps only
what differs from what it would borrow** — the spacing control hands back all
four sides every time, and storing the three nobody touched would stop them
following the middle for ever. A dot on an icon means that screen has values of
its own.

**Hide on this screen is not a ladder.** Every size cascades on purpose; a switch
must not. Ticking 1920 and 1280 must not hide 1440 between them, so each of the
seven hide rules is a window closed at both ends — `(min-width: 1280px) and
(max-width: 1439px)` and so on. Hiding on every phone is three ticks; in return,
it can be said exactly.

### How a value reaches the page

- The attribute is `<prefix>Size`: `{ "base": { "pt": "var:preset|spacing|40" },
  "991": { "pt": "24px" } }`. PHP turns each entry into `--<prefix>-pt-991` in
  the block's `style` attribute **at render**, so it never sits in saved markup
  and can never make a block invalid. Generated rules at the foot of the panel's
  stylesheet turn each variable into its property, inside the right query.
- **The middle screen's padding and block spacing are core's own
  `style.spacing`**, so the Styles tab and the panel show the same number. Except
  the gap on a block whose core layout is not flex or grid: core turns
  `blockGap` into margins there, so the base gap goes into the panel's own
  variable. The field reads from wherever the value is and writes back there.
- **Every property prints with `!important`**, because it must beat the inline
  style core writes for the middle screen. Width, min-width and max-width were
  the exception — they won on selector weight instead — and they lost in
  silence: core's layout stylesheet caps every child of a constrained block at
  the global content size with a one-class selector that loads after the panel's
  file. The sidebar went on showing the number the page was not using, which cost
  a heading its second line and a column six pixels before anyone looked. They
  carry `!important` now like the rest. That is also why the theme's CSS may
  never write one of these properties for a block: an inline-plus-`!important`
  system outranks every stylesheet rule, so a CSS value beside it is either dead
  or, worse, beaten at one screen and not the next.
- **Values are presets by name** — `var:preset|spacing|40`, never `var(--space-40)`.
  Core's spacing control reads presets and nothing else; a raw token is on the
  page and invisible in the panel. Lengths, `calc()`, `clamp()`, `min()` and
  `max()` are allowed; the layout fields take words from a fixed list.
- **A value the panel's validator refuses is dropped in silence**, and a
  stylesheet covering for it hides that it was ever dropped. After writing values,
  read them back on the page.

**Verify the panel by reading the control's props, not the DOM.** What the panel
hands each screen, and what it writes back, are React state — the markup only
shows the last render. Take `__reactFiber$` from the fieldset, walk `.return` to
the node whose props carry the control's own configuration, and read the values
it was given for every screen; calling its change handler tests the write path
without fighting the preset dropdown.

**And test it on a scratch block.** On real pages the section blocks are usually
content-locked, so the panel is not reachable there at all — insert a plain
group, test on it, delete the draft. A run that concludes "the panel does not
open" from a locked section has measured the lock, not the panel.

### What goes where

Every declaration in the source answers one question: which of these is it?

| The source declares | It becomes |
|---|---|
| padding, margin, gap, width / min / max, height / min / max — at any width | **UPQODE Dimensions**, on that block, on that screen |
| display, direction, justify, align-items, wrap — at any width | **UPQODE Dimensions → Layout** |
| `flex-grow` / `flex-shrink` / `flex-basis`, `align-self`, `order` | **→ Flex child** |
| `position` and the four offsets, `z-index` | **→ Position** |
| a column count, a track width, `grid-column` | **→ Grid** / **→ Grid child** — drawn only where there is a grid |
| `text-align`, `text-wrap` — at any width | **→ Text**, because core's own alignment is one value for all seven screens |
| border width, style, colour, radius — at any width | **→ Border**, which is core's own control drawn once per screen |
| `display: none` at a width | **Hide on this screen** |
| `object-position`, `object-fit` | **→ More** |
| colour, background, gradient, font family, size, weight, line height, tracking, case | core's own controls on the block — palette colours and type steps by name |
| a reveal or a load rise | **UPQODE Animations** |
| a look several blocks share that no control can hold — `backdrop-filter`, a pseudo-element decoration, a mask, a hover, a pressed state | a **block style**, picked by name in the Styles tab |
| the one-off anatomy of one section — grid areas, absolute placement, sticky, overflow | the section's own class, carried in `<prefix>Parts` — shown to administrators as a read-only line, "Part of the design: Hero" — or the section becomes a block of its own |
| anything a `render.php` or a PHP template part draws | the theme's stylesheet — it is not a block, so no panel reaches it |

**Additional CSS class(es) stays empty — always.** Core keeps a block style in
`className`, so a class typed there and a style picked from the list end up in the
same field; a client who clears it clears both. The words the design's skeleton
needs travel in `<prefix>Parts`, which is read-only, and the class field is
removed for anyone without `edit_theme_options`.

### Block styles — the panel's other half

What the panel cannot say becomes a style the designer picks by name. Rules for
offering one:

- **Test before offering.** Make a plain block, give it core's controls and the
  panel, and measure. If it comes out the same, the style would be a second place
  to say one thing — do not register it. Three of six styles on one port were
  withdrawn the moment somebody asked what they carried.
- **One style per look, not per colour.** Draw a decoration in `currentColor` and
  let the block's own text colour pick the accent, rather than registering "Dots
  — cyan" and "Dots — purple".
- **A block wears one style at a time.** A card that needs two decorations keeps
  the second on its part.
- **Hover is a style, never an arrival and never an inline value.** An inline
  value from the sidebar outranks `:hover` and kills the effect.
- **Labels say what it is, never a number.** "Small", not "Small — 14": the size
  behind it can be changed per screen, so the number is wrong the first time it is.
- **Register styles in a file every page loads.** A style is offered on every
  page; if its rule lives in one page's stylesheet, picking it anywhere else does
  nothing, with no error.

### Styles → Typography, per screen

**Every element screen in Styles → Typography carries the same seven icons** —
Text, Headings (All and H1–H6, from WordPress's own row), Link, Button, Caption —
and under each screen the four values: size, line height, letter spacing, weight.
Same keys, same cascade, same grey "inherited" value, same dot as the Dimensions
panel. The designer changes the H2 at 767 here, for the whole site, without
opening a stylesheet.

- **Text has three styles of its own — Small · Body · Large** — a row above the
  icons. Each owns its four values on every screen; Small and Large start as the
  body's, so picking one changes nothing until something is set on it. On a
  paragraph the same three words appear in the block's Styles list.
- **The design lives in `tokens.css`; the panel holds only overrides.** Each value
  is a token on `:root` — `--type-<element>-size|lh|ls|fw` for `heading`,
  `h1`–`h6`, `body`, `text-sm`, `text-lg`, `button`, `caption` — redefined per
  screen in the stylesheet from the source's numbers, and `theme.json` points
  every element at its four. The panel starts every field empty, showing the file's value, keeps
  what is set in one option, and prints it after the stylesheet. Reset puts the
  design back.
- **Measure which sizes step.** Headings usually change at every screen and body
  copy usually does not; read it from the extractor, never assume either.
- **`settings.typography.fontSizes` stays empty.** A handful of presets turns the
  editor's size field into a row of lettered buttons where the number can no
  longer be read or typed; the steps reach the block as tokens instead.

**Colors are tokens.** Every `--c-<name>` in the stylesheet reads
`var(--wp--preset--color--<name>, #hex)`, so a colour changed in Styles → Colors
reaches every use at once, and a colour added there becomes a token by its slug.
Channels for `rgba()` are computed in PHP. **Export / Import** is one row under
Blocks that writes all five sections to one file and reads one back as an unsaved
change.

### Styles → Form fields

**A row of its own on the Styles root screen, under Layout** — beside Typography,
Colors, Background, Shadows and Layout. Not inside Typography → Elements, which
is where it first went and was corrected: an input is a thing, not a kind of
text.

Behind it, **three tabs — Default, Focus, Error — and the same eleven values in
each**: background, border, border width, radius; text colour, placeholder
colour, size, line height, letter spacing, weight, letter case. Error has two
more of its own: the border while the field is focused *and* wrong, and the
message under the field.

Same contract as Typography: the design lives as `--field-*` tokens in the tokens
file, every field starts empty showing the file's value in grey, overrides are
kept in one option and printed after the stylesheet, and Reset puts the design
back.

**Five things that are defects if they are got wrong**, each one measured:

- **Print Default twice, the states once.** Default goes out as tokens, which
  every stylesheet already reads, *and* as a rule, because a page may declare
  something the tokens do not carry. **Focus and Error are rules only, and only
  for what is actually set** — declaring all eleven up front meant a field going
  wrong took the base line height back over the one its own page had given it.
- **The three states are one specificity ladder** — the resting selector, then
  `:focus`, then the error class, then both — and the `:not()` chain is
  **identical in all four**. An uneven one let Default outrank Error, and nothing
  on screen said so.
- **The submit button is an `input`.** Without `:not([type="submit"])` in every
  one of those selectors, repainting a field repaints the button.
- **The resting skin sits inside `:where()`; the state rules do not.** A page is
  allowed to shape its own form, so the resting skin must lose to it — but no
  page declares a focus state, and `:where(…):focus` lost to a page's plain
  class.
- **`line-height: inherit` is not "no declaration".** Browsers declare `normal`
  on an input and a textarea, so that is what the token defaults to; tracking and
  letter case default to `inherit`, which for them is faithful. Measured the
  other way, a message box came out eleven pixels taller.

**And one precondition that decides whether the screen works at all:** every
stylesheet that restated the field skin with literal values has to read the
tokens instead. On one port six of them did — and they beat the base sheet's
`:where()`, so the panel would have moved only some of the site's forms. Fifty
declarations were rewritten before the screen was worth shipping, and one of them
turned out to disagree with the rest by `0.01` of opacity, which is the sort of
thing only this exercise finds.

All of this is already built in `templates/upqode-panel/` — the screen, the
ladder and the printing — so none of it is written by hand. It is here because
the **tokens** and the **six stylesheets** are this project's work, and the
screen is worth nothing until they are done.

### Building a page with it

- The analysis already gives each element its value at every screen. Those
  values go **straight into the panel attributes** of the pattern's markup, screen
  by screen. Nothing is written into a section stylesheet first and moved later —
  that is the migration below, and a fresh port never needs it.
- **Every container gets a flex or grid layout on the block.** A gap on a flow
  layout is margins on the children, not a gap.
- **A pattern's blocks carry no `className`.** Their look is core attributes, the
  panel, at most one block style, and the parts line.
- **Generate block markup from the editor or copy a block the editor saved.** Core
  compares `class` as a set and `style` as a map, so order does not matter — but
  the PHP style engine drops some custom values the JS one keeps, so it is not a
  guide.
- **Open blocks at random, at random screens, and read the panel.** Every value
  the page shows must be there. A field reading "Default" on a block that plainly
  has padding is a defect.

**A site that was styled in CSS first is a migration, not a port** — every value
has to be resolved out of the cascade and moved without changing its weight.
**Prove every move by measuring, before and after:** the same elements at the
same widths, animations stilled, the baseline taken before the first change.
"It looks the same" is not proof. Moving a value into the panel also changes its
precedence — the panel writes `!important` — so a rule that used to lose can
start winning, and a value lifted out of a cascade can land with a weight it
never had. That job has its own traps and its own order of work:
`reference/panel-migration.md`.

## Pace and output

**Never say "built" before the sweep and the editor.** Saying it early is not a
wording problem: it hands the designer a page you have not checked, and they then
spend their own time finding what your own pass was going to find anyway. One run
reported a finished page and the designer found the full-bleed background, the
mobile gaps, the dropdowns and the canvas — every one of them inside the checks
that had not been run yet. Until the breakpoint sweep has run and the editor has
been opened, the words are "first version, not yet verified", and the list of what
remains unchecked goes with it.

**"Not verified" and "not built" are different words and only one of them is
usually true.** "Not verified" claims the thing exists and has not been driven.
Using it for something that was never built is the most misleading sentence
available, because it is the one the designer will not question. One run shipped
five sections with **no animation hook on a single element** — no reveal class, no
load rise — and reported animations as "not verified". The designer found out by
asking for them to be checked. Before writing either phrase, count: N elements
animated in the source, N carrying the hook in the port. If the second number is
zero, the word is "not built".

**The clock that counts is the total, to a finished page.** Not a demo, not an
early milestone — the designer is not waiting to be shown something, they are
waiting for the work. So optimise the whole run: everything below earns its place
by shortening the total, and anything that only moves a visible moment earlier
does not.

Two things dominate that total, measured across four ports: **the text produced**
(roughly half the clock) and **rework** (about a quarter). Everything else,
including all the checking, is the remaining quarter. That is the whole map, and
it says the work goes faster by writing fewer lines once — not by checking less.

One line when the frame stands — header, footer, first section — so a wrong
foundation can be caught before five more sections are built on it. One line, no
waiting, then straight on.

**Exactly four things may be built before the header exists**, and nothing else:

1. `theme.json`
2. the fonts
3. `functions.php`
4. the panel — copied from `templates/upqode-panel/`, never written, because the
   header is the first thing built with it

Everything else is **forbidden until the frame stands** — and the reason is total
time, not appearances. Work done before the thing that needs it is work done
against a guess: the shape of a collection, an icon set, a block style is not
known until a section asks for it, so it gets written, then rewritten, and a file
written twice is the most expensive thing on the clock. Named, because these are
the ones that always talk their way in: the custom post type, SVG upload support,
**block style variations**, the icon inventory, renaming and optimising media, the
drift and resync scripts, SEO, and the measuring tools. One run spent its first
twenty minutes on exactly this list and reached minute thirty-five with a header,
a footer and no page — then rebuilt part of it anyway.

**Images are handled when a section places them**, one section's worth at a time —
extracted, named, uploaded, optimised. Inventorying and optimising every image on
the page up front is half an hour spent on sections that may end up not using
half of them, and it buys nothing that doing it per section does not.

**Bound every wait, and abandon anything that hangs.** A single browser call once
failed to return for 52 minutes — fourteen per cent of that session, in one place,
producing nothing. Nothing was watching it. Give any command that can block a
deadline of about a minute; when it passes, stop it, reload the page, and try once
more. If the second attempt also hangs, that path is broken: say so and measure
another way, rather than waiting to see.

**Every browser action may cost the designer a permission prompt.** Treat them as
expensive: do not open the browser before a step needs it, batch every question
of a pass into one script, and never re-run a script for something the first one
could have collected.

**Most of the clock is text you generate, not commands you run.** Measured twice:
39 minutes in tool calls against 80 generating, and 97 against 108. Writing a
1700-line stylesheet does not show up as a slow command — it is the silence before
one. Writing less is therefore the only large speed-up available, and it is
mostly a matter of not writing the same thing twice:

- **Edit what changed; never rewrite a file to alter part of it.** Regenerating a
  large file costs its whole length again, every time.
- **Get it right once rather than producing a second version.** A file written
  twice in one run — a collection rebuilt, a pattern re-emitted — is the most
  expensive thing on the clock, and it is usually a decision that was taken before
  the values were in hand.
- **No prose that is not needed.** No plans restated, no summaries of what was
  just done, no commentary between steps.
- **Copy the templates verbatim.** Seven files ship with this skill precisely so
  that nobody spends the clock authoring them; a hand-written equivalent is both
  slower and weaker.
- **Let `theme.json` and block attributes carry what they can.** Every value
  expressed there is a value not hand-written into a stylesheet, and the
  stylesheet is where the line count actually goes.

Speed comes from doing less, never from checking less. Cut duplicated effort:
read a file once, do not re-read after editing, do not explore beyond the current
step, do not restate the plan. Never cut the twelve above.

Print one short line when a step finishes, anything needing a decision, and
anything that is an exception. Nothing else — no progress lines, no commentary on
files or tools, no documents. The deliverable is the site: analysis goes into
`theme.json`, the patterns and the page, never into a report.

**Never ask permission to continue.** Do not end a message with a question mark
unless it is a question — and questions go in the options dialog, not in prose.

## Questions never stop the work

Questions go to the designer in the **options dialog** — concrete choices, one
marked as recommended — and the run **carries on**. Never end a message waiting
for a reply, never put a question in prose, never make the designer read a wall
of text to unblock you.

**One exception, and it is the only one: a missing WordPress site stops
everything.** Every other question is about *how* to build something, so the run
can take its own recommendation and move; this one is about *where*, and there is
no answer to take. Until the site exists and answers, there is nothing to scaffold
the theme into, nothing to extract against, nothing to validate.

So when Step 0 finds no site: send the Local instructions **alone**, and send
nothing else — no structure plan, no collections, no form question, no plan of
work. A message that asks someone to create a site and in the same breath asks
them to choose between a collection and a synced pattern reads as though the
first part were optional, and it buries the one thing that has to happen next
under four things that cannot happen yet. Ask again only after the site answers;
the structure questions are cheap to ask later and worthless to ask now, because
the analysis they come from has not been run against anything real.

**If the site does exist, none of this applies** — carry straight on, ask the
four in one dialog, and keep building.

**If no answer arrives by the time the decision is needed, take your own
recommendation, say which one in a line, and keep building.** An answer that
comes later is applied then; almost everything here is cheaper to adjust than to
wait for.

### The four that are always asked

**On every page, including the second and the tenth.** A manifest lets later runs
skip the design system, the fonts and the header — it never skips these
questions. Page two has its own repeating structures and its own form, and
"the collections already exist" answers a different question than "what should
*this* page's cards become". List the collections already on the site as context,
then ask about what is new.

All three go in the dialog, batched into one interruption whenever they are known
together:

1. **The structure plan**, right after the analysis — **always asked, never
   skipped, and asked exactly once.** Analyse the whole page first, then send a
   single question listing *every* repeating structure on it, each with the same
   three choices — a collection, a synced pattern with overrides, or a plain
   pattern — and your recommendation marked on each. One question, every row in
   it, answered in one pass.

   **Every row that becomes a collection carries a second answer: does an entry
   have a page of its own?** Team, FAQ, testimonials, logos, events shown only
   as cards — usually not; services, programmes, posts — usually yes. Recommend
   one per row. It decides the registration, the URLs, the sitemap and whether
   the entry is a form of fields or a page of blocks, and it is the one answer
   that cannot be patched in later with a noindex.

   **After the analysis means after the extractor has run on those sections, not
   after reading their markup.** The markup tells you a structure repeats; only
   the CSS tells you how many of it the design shows. One run read
   `hint-placeholder-count="3"` on a testimonial loop and asked "the section shows
   three cards — confirm?", while that section's own CSS ran three columns at
   base, four above 1440 and five above 1920 with `nth-child` rules hiding the
   rest, over a collection holding exactly six. The question was answered
   truthfully about a thing that did not exist. A question built on a placeholder
   costs more than the extractor run it skipped.

   **Never one question per structure.** Meeting the analysis piecemeal and
   asking about the team grid, then later the testimonials, then later the case
   studies, turns one decision into six interruptions, and the designer cannot
   see the shape of the page while answering: whether those four cards should be
   a collection depends on what else on the page already is one. Do not decide
   that a case is "obvious" and leave it out either — the designer is the only
   one who knows whether those four cards will ever change, and that is exactly
   what this question is for.
2. **The form**, if the page has one. How many, which fields, where the source
   submitted, and where submissions go. **Contact Form 7 unless told otherwise** —
   recommend it rather than opening the choice, and still ask the rest.
3. **The header — how many, and how many behaviours.** Two questions, not one:
   *one header or two different ones?* and *does the bar behave the same on every
   page?* One header with two scroll behaviours is still one template part, and
   two genuinely different headers are two parts plus a custom template. Asking
   only the first question is how a behaviour variant becomes a forked copy that
   then drifts. See Step 6.
4. **How much the client may break.** Nothing in a block theme stops someone
   deleting the wrapper a grid hangs off, and the section then vanishes with no
   warning and no undo they will find. "Fully editable" and "hard to break" pull
   against each other, and only the person who knows the client can settle it.
   Three options — lock nothing; lock structural wrappers against move and delete
   while every content block stays free (**recommend this**); or lock the section
   templates entirely and edit content only through collections.

   Asked here rather than at the end because `templateLock` and per-block `lock`
   are written into the patterns as they are built. Retrofitting them means
   touching every pattern and the saved page twice.

### Anything else uncertain

Same channel, same rule: put it in the dialog, mark a recommendation, keep
working. Palette clashes with an existing custom theme, a font that cannot be
obtained, a section that cannot be built 1:1 — all of these are questions, not
halts.

**Two failed attempts at the same defect** is worth a question too — not "when
you do not know what to do", which is always decided in your own favour, but a
count: the second fix that does not work. Ask what to do with the recommendation
you would pick, and carry on with the rest of the page meanwhile.

### Notes, which are not even questions

A workaround the designer might have opinions about — a value left in CSS
because no control exists, a substituted font, a timing guessed from the source,
an icon font swapped for SVG — gets **one line as you pass it**. No dialog, no
pause. If you catch yourself writing "tell me and I will change it", delete it.

### The only two things that genuinely block

- **No site to build in**, and one has to be created — a manual step in someone
  else's UI.
- **The site does not resolve at all.** Nothing can be built or checked.

Everything else continues.

---

# Step 0 — environment

If the user already said which site, act on it: do not survey the machine.

- **Which site is this page for?** A running WordPress is not necessarily the
  right one. Mismatched colours, fonts or header markup mean a different project
  — confirm before writing.
- **New site: write out the clicks, do not gesture at them.** You cannot create
  the site yourself, so the only thing that moves the run forward is an
  instruction the person can follow without knowing WordPress. Assume they have
  never opened Local before.

  **Send it on its own, and stop.** Not alongside the structure plan, not
  alongside the four questions, not alongside a plan of work — those belong to a
  run that has somewhere to build, and this one does not yet. This is the single
  place in the whole skill where waiting is correct, and it overrides
  "Questions never stop the work": that rule is about choices the run can make
  for itself, and the absence of a site is not a choice.

  > 1. Open **Local**. Bottom left, click the **+**.
  > 2. **Site name** — `<project>`. Local turns it into `<project>.local`, and
  >    that address is what you will open in the browser. → **Continue**
  > 3. **Environment** — leave **Preferred** (PHP 8.x, nginx, MySQL). → **Continue**
  > 4. **WordPress username / password / email** — set them and **write them
  >    down**. This is the login for wp-admin, and nobody can read it back for
  >    you afterwards. → **Add Site**
  > 5. Local may ask for your computer's password. It needs it once, to add the
  >    `.local` address to your machine and trust the certificate.
  > 6. When the site appears in the list, press **WP Admin** and sign in.

  **Then verify it before building anything**: the folder exists
  (`~/Local Sites/<project>/app/public`; on Windows
  `C:\Users\<user>\Local Sites\<project>\app\public`), `wp-config.php` is in it,
  and the address answers. A site that was created but is not running fails
  later as a database error with nothing pointing back at the cause.

  **If Local is not installed at all**, say so plainly and give the address —
  `https://localwp.com` — rather than improvising another stack. Anything else
  already on the machine and already running (MAMP, XAMPP, a Docker setup) is
  fine; never ask anyone to install a second one.
- **Copy `templates/bootstrap.php` and require it from every CLI script.** It
  carries the limits, the loader, the database-identity guard and the admin user,
  each of which is otherwise rediscovered mid-run and each of which fails as some
  other symptom.
- **How PHP runs:** `wp --info` first. Otherwise locate `wp-load.php`. On
  Local/MAMP, `define('DB_HOST','127.0.0.1:<port>')` **before** requiring it, and
  their PHP binary is not on `PATH`.
- **A port is not an identity.** Local reassigns MySQL ports when it restarts, so
  a port that was this project yesterday can belong to another one today. Every
  script that writes must first assert **which database it is connected to** — read
  the site URL or the blog name back and compare — and refuse to run if it is not
  the expected one. One run wrote nineteen attachment rows into an unrelated
  project's database, silently, with the files landing correctly in this one. If
  scripts start failing with "Database Error" after a restart, the port moved; it
  lives in Local's `sites.json`.
- **Project theme?** A stock Twenty-Something theme does not count — scaffold the
  project's own immediately, without reading theirs. Only a custom theme is
  someone's work worth reading and asking about.
- **Install the panel the moment the theme exists:**
  `node <skill>/templates/upqode-panel/install.js <theme-dir> <prefix>`. It
  copies the panel in, replaces every placeholder, requires it from
  `functions.php`, and refuses to finish if a placeholder survives. Then the
  three hand steps in its README: the `--type-*` and `--field-*` tokens in the
  tokens file (from `tokens-skeleton.css`, filled from the source in Step 3),
  the elements in `theme.json` (from `theme-json-snippet.json`), and one look in
  the editor — UPQODE Dimensions and UPQODE Animations in a block's Settings
  tab, the seven icons in Styles → Typography. Nobody asks for it and nobody is
  asked: it is how the theme is built. Never edit the installed copy; change the
  template and re-run the installer.
- **The theme header is filled in when the theme is created, not before
  handover.** `style.css` carries the project's name as `Theme Name`, and the line
  below it reads **`By UPQODE`** — that is the author line the client sees in
  Appearance → Themes, and it is checked at handover every time. Add
  `screenshot.png` as well (1200×900): a theme card with a grey placeholder is the
  first thing anyone notices in that screen.
  **The name is the only place UPQODE appears.** The theme's **slug**, its text
  domain, its CSS class prefix and its function prefix all take the project's
  name — `modix-`, not `upqode-`. Those strings end up in every selector and every
  function in the theme; the client's site should read as theirs.
- **Manifest?** `settings.custom.portedFrom` in `theme.json` holds breakpoints,
  header height, fonts, patterns, collections, pages. If it exists and the design
  matches, reuse the tokens rather than deriving them again — but **reuse is not
  inheritance**. A shared template part shares its markup, not its design: one
  port took the header from page one, checked its colours, skipped its geometry,
  and missed that the second page groups the menu and the button to the right and
  treats its heading differently. Measure the header and footer against **this**
  page's source, every time; only the token table is reused. Take those values
  from it, and check `patterns` for
  something reusable. **The structure and form questions are still asked** — they
  are about this page, not about the site. Write or update it at the end of every run.

  **Diff page two's CSS against page one's for every shared token, before writing
  a section.** This is cheap — walk both `:root` blocks and print what differs —
  and on one port it found four divergences that would each have shipped as a
  defect: the hero's top padding (130 flat against a 160/140/130/120 ladder), the
  gap under the banner (80 against 88), the card photograph's height ladder (page
  one drops to 340 at 1279 and grows to 440 at 1920; page two does neither), and
  the header itself carrying a `flush` variant on page two only. A fifth was not a
  token at all: the two pages **order the same taxonomy differently** — Wellness,
  Aesthetics, Medical on one and Wellness, Medical, Aesthetics on the other — so a
  helper that returns "the design's order" has to take the order as an argument,
  or page one silently decides for every page after it.

  The general shape: a shared token is only shared where both pages vary it the
  same way. Reusing one that diverges is the same mistake as mapping a value to a
  preset whose ladder disagrees with it, one file further up.
- Also detect the SEO plugin and whether a saved `wp_global_styles` post shadows
  `theme.json`.

Print the environment in a few lines — site, versions, theme, manifest, SEO
plugin. Nothing else; the source belongs to Step 2.

## First ask whether there is already a repository

Everything below describes a port starting from nothing. The case that keeps
arriving is the other one — a project being continued, handed over, or begun by
somebody else — so **ask before creating anything.** Four answers, a minute, and
each changes how the rest of the run behaves.

**1. Is there one, and where is its root?** `git rev-parse --show-toplevel` from
the theme folder, before the first file is written.

- **There is one** — use it. Never `git init` inside it. A nested repository is
  noticed weeks later, when half the work turns out to be tracked by neither.
- **Rooted somewhere unexpected** — the whole install, or the theme folder alone,
  rather than `wp-content`. Leave it; the layout is the client's and re-rooting
  mid-project loses history for nothing. But **write the root down**: every path
  printed afterwards is relative to it. A status reading
  `themes/<slug>/inc/x.php` means the root is `wp-content`, and a command written
  for the theme folder will quietly miss.
- **There is none** — say so, and ask whether to make one, **before** the first
  bulk edit rather than after.

**2. If there is none, is that a decision or an oversight?** Some projects
genuinely cannot have one — SFTP-only hosting, a client who owns the process, a
site being touched once. That is fine, and it changes the working style, which is
worth saying out loud: nothing scripted across many files without a copy first, no
deletion until the thing is shown unused **and** set aside, smaller steps verified
more often.

*One run: a script removing dead CSS rules deleted a live one, because the
selector it read had swallowed the comment above it. `git checkout`, a few
seconds. Without a repository that is a 400 KB stylesheet repaired from memory.*

**3. Who commits, and when?** Ask; do not assume. The two habits are
incompatible: some designers want a commit at every working state so they can roll
back themselves, others want to read a diff first and treat an unasked-for commit
as noise in their history. Ask once, record it, follow it for the whole project —
and the same for pushing, which on some projects *is* the deploy.

**4. How does a change reach the other environments?** If there is a staging or
demo site, ask whether it pulls from the remote. This decides the shape of every
later handover: a change is usually code **and** database **and** files, and only
the first travels by `git pull`. `reference/migration.md` has that split.

**And check the line endings the same minute** — `git config core.autocrlf`, and
whether `.gitattributes` exists. On a repository that normalises, one scripted
edit turns a three-line change into a whole-file diff, and the person reviewing it
cannot see what changed.

## The theme lives inside the WordPress install, and the repository is `wp-content`

**Scaffold the theme straight into `wp-content/themes/<slug>`, and any plugin this
project writes into `wp-content/plugins/<slug>`.** No separate project folder
beside the install, no symbolic link, no junction. Then `git init` in
`wp-content`, give it a remote, and push on the first day.

A WordPress project is rarely only a theme. A custom post type's admin screens, an
importer, a form handler — the moment any of that exists it belongs in a plugin,
because a theme that carries behaviour takes the site down with it when the theme
is switched. Those plugins are as much the deliverable as the theme is, and they
live in `plugins/`. One repository rooted at `wp-content` holds all of it at the
paths the server will use, so what is committed is what ships. A folder beside the
install holds only the theme, needs a second link for every plugin, and still does
not mirror the thing being deployed.

It also removes a whole class of failure. A linked theme has to be relinked every
time the site is re-imported, cloned or moved, and it is the single most common
cause of a port arriving as a white page — the export walks the link, finds a
folder, and copies nothing. `reference/migration.md` has the full shape of that
one.

**The objection to this layout is real, and the remote is the whole answer.** The
local site folder is disposable — deleting the site in Local deletes everything
inside it, code included. So the remote is not a later nicety: push before there
is anything worth losing, and keep pushing. A repository with no remote, sitting
inside something whose purpose is to be thrown away, is the one arrangement that
actually loses work.

### What is tracked

`wp-content` is mostly WordPress's and the host's. So the ignore file denies
everything and then names what this project writes:

```
# none of this is ours
plugins/*
themes/*
mu-plugins
uploads
upgrade
upgrade-temp-backup
languages
cache/*
wp-rocket-config/*
advanced-cache.php
ai1wm-backups
node_modules/
debug.log
.DS_Store

# except exactly this
!.gitignore
!themes/<slug>
!plugins/<each plugin this project writes>

# never, on any project
.mcp.json
.claude/settings.local.json
.qa-state.json
```

Four things that are easy to get wrong:

- **`uploads/` is never committed.** Media is content, not code. It travels with
  the site, reaches the designer through the admin, and tens of megabytes in a
  repository slow every clone for the life of the project.
- **The stock theme is ignored, not deleted.** One default theme stays installed
  as the fallback for a fatal error in ours. It is WordPress's file, so it is
  ignored like the rest of `themes/*` — ignoring is not the same as removing, and
  deleting it to tidy the repository takes the safety net with it.
- **Built assets: decide once, and write the decision down.** If the minified CSS
  and JS are built on the server, ignore the built folder. If they are not — and a
  migration plugin moving files builds nothing — they must be committed, or the
  site serves a stale copy or no styles at all. Either rule works; an unstated one
  does not, because a half-built tree looks fine until a page loads unstyled.
- **The database is not in the repository.** Posts, options, menus, the Styles
  settings, every block on every page: none of that is in `wp-content`. Git
  carries code, and the site travels by an export plugin or the host's migrator.
  They are two separate mechanisms and confusing them costs a day.

**Then verify, before saying it worked:** the first commit's file count is of the
order of the theme's own files — not thousands. A whitelist that is subtly wrong
quietly tracks the whole of `uploads` and three stock themes, and nobody notices
until the push. Check that `uploads`, the stock theme and `node_modules` are
absent from `git ls-files`, and that the remote has the commit.

**Ask for the sign-in in the very first thing you write — before any tool call,
before the environment is even located — and do not wait for the answer.** Not
"early", not "in the first few steps": it is the opening line of the run, printed
before locating the site, before PHP, before anything. Buried after a dozen setup
commands it is missed every time, and the run reaches the editor with no session.

One line: "Please open http://<site>.local/wp-admin in the browser pane and log in
when you get a moment — without that session I cannot check the editor at all.
Not blocking, I'll keep building."

**With a real address in it, never a placeholder.** A line reading "your site's
/wp-admin" is not a request anybody can act on — there is nothing to click and
nothing to type. If the request names the environment, the address is already
known: `prospecta-02` is `http://prospecta-02.local/wp-admin`. Say that, and
correct it later if the site turns out to answer on another host. If the request
names no environment at all, find the site first — it is two commands — and ask
in the line immediately after.

Their being logged in to their own browser does not help; yours has an empty
cookie jar. Never ask for the password, type it, or store it.

**Ask again the moment the editor is actually needed, and say what is blocked.**
The first ask is easy to miss — it arrives while the run is still setting up, and
nothing appears to depend on it. So when the first canvas check comes round and
the session is still not there, repeat the line with the site's real URL in it and
name what cannot be checked without it: whether the sections look the same in the
editor as on the front end. Assume the person reading has not done this before and
does not know it is expected of them — a run that asked once, went quiet, and
shipped a page nobody ever opened in the editor is the failure this prevents.

Ask early because the session gates more than one step. Without it the entire
editor half of the work is unverifiable — the canvas, the block validity, the
bound fields, the visibility map at each canvas width — and in one port every
canvas defect was found by the designer instead, which means the person paying
for the work did the checking.

**Do not wait, and do not touch the browser yet.** The session is not needed
until Step 13, and everything from the analysis through the sections runs without
it. Opening the browser early costs the designer a permission prompt for nothing.
Check for the session when a step actually needs one; if it is missing then, say
so and name the checks being skipped.

If the site does **not resolve** at all, that is different: stop and say so. No
editor check will work until it does.

---

# Step 1 — intake

Ask for **the HTML file** and nothing else. Do not ask for a screenshot: every
number comes from the source CSS, and a picture cannot supply one.

Note the input type — a saved single-file page (fonts and images as `data:` URIs,
full `<head>`), a Webflow export folder, or hand-written HTML with no head worth
harvesting. It changes Steps 2 and 11.

One page per invocation.

---

# Step 2 — analysis

**Keep the source open beside the build, and compare against it — that is the
whole method.** Everything else in this file about measuring is detail; this is
the habit that makes the detail unnecessary. The design is on the left, the port
is on the right, and any question — what size, what colour, is this centred, does
this fill its frame — is answered by looking at both, not by remembering, not by
reasoning from the stylesheet, and not by deciding it looks about right.

**Serve the source alongside the site, from the first step — before the header,
not after it.** In one run the comparison copy went up at minute thirty-one, after
the header had been written, and the four minutes it took were described as the
most useful four minutes of the run: from that point every correction became a
lookup instead of a guess. Put up thirty minutes earlier, the first header would
have been right the first time. Not as a second
reference to reconcile — as an instrument. Any question of the form "what is it
in the design?" then becomes the same measurement taken twice, left and right, in
one command, instead of an excavation through the stylesheet. Across three ports
half the defects the designer found were places where the source had been read
incompletely, and every one of them was a single comparison away.

**Trim it before serving it.** Replace every `data:` URI with a transparent 1×1
first — a Webflow export is often 6–7 MB of inlined base64, and one run hung its
own browser tab for five minutes trying to open the untrimmed file. The trim is a
condition of it working at all, not an optimisation.

**But the extractor stays the source of values, and there is still no second
reference.** The rendered source is asked specific questions and used for the
final element-by-element comparison. What remains forbidden is what used to cost
whole hours: taking a full dump of the rendered page and reconciling it against
the CSS. The source has quirks that are not values — un-run reveal transforms
shifting rects, animation start states, empty Webflow spacers — and chasing them
is unbounded work that changes nothing in the port.

**Analysis is done when every section has its numbers.** It is not done when
everything about the source is understood. If no section has been written and
the analysis is still going, it has overrun — write a section.

**Make the source readable before writing anything.** Split `<body>` into one
file per section and add line breaks.

**The extractor is `templates/extract-css.js`. Copy it; do not write one.** Every
value in the port comes from it, it is identical in every project, and the
hand-written versions have shipped the same four faults over and over: returning
only the first matching rule, blindness to id selectors, choking on data-URIs, and
output long enough that someone truncates it. All four are already handled.

```bash
node extract-css.js source.css .hero-title .hero-sub '#w-node-abc'
```

It writes the full answer to `css-extract.txt` and prints a summary with a rule
count per name — so there is nothing to truncate, and the count tells you whether
what you read was all of it. A zero in that summary is a question, not an answer.

Three requirements on it, each from an extractor that shipped without them:

- **Return every matching rule, never the first.** A Webflow export repeats the
  same selector inside each media query, so the first hit is the base layer and
  the overrides sit below it. An extractor that stops at the first match returns
  an answer that looks complete and is wrong — one port rebuilt the same five
  wrappers three times because of it, and thirteen values in total came out
  frozen at their desktop number.
- **An answer is a list, one entry per breakpoint — never a single number.**
  `max-width: 800` is a red flag by itself; `600 / 700 / 800 / 550 / 500` is what
  a real wrapper looks like. If a class comes back with one value, that is a claim
  the design never overrides it, and it is usually false.
- **Replace every data-URI with a placeholder before splitting on `;`.** Base64
  contains semicolons and line breaks, so declaration splitting shreds it: one run
  dumped 178 KB of base64 into its own output and lost time writing a cleaner
  mid-build.

**It must audit an element, not just look up a class.** Give it an element's
classes **and its id**, and have it return every rule that can reach that element,
in cascade order, with the specificity counted. Class-only lookup misses a whole
category of design: Webflow writes grid-child geometry on ids —
`#w-node-_1c0b…{align-self:end}` — and an id at (1,0,0) beats the class rule at
(0,1,0) that the extractor confidently reports. One port put its hero at the top
of its cell instead of the middle for exactly this reason, and nothing in the
tooling could have shown it.

**An empty `grep` is not proof that a rule does not exist.** Exports are often
formatted with many declarations per line, and `grep` is line-oriented, so it
answers "not found" for a rule that is sitting right there. That answer was
accepted as fact in one run, on top of the id blindness above — a wrong tool's
silence reading as evidence. Absence is only established by a CSS-aware query.

**The extractor writes its full answer to a file and prints the path and the
rule count.** Not because reading is optional, but because a rule that says "do
not truncate" has now been broken in two separate runs — the answer arrives long,
it gets piped through `head` or `grep`, and the tail is lost silently. With the
output on disk there is nothing to truncate: read the file, and the printed count
tells you whether what you read was all of it.

**Never filter the extractor's output on the way back.** No `sed`, no `head`, no
`grep` over its answer — read all of it. Cutting the output is the same mistake as
an extractor that returns only the first match, committed one step later and
harder to see, because the tool did its job and the answer was thrown away
afterwards. One run piped its extractor through a range that ended at the first
`min-width`, which silently removed the entire Large tier: eighteen values were
built from the base layer, and a hover effect that was plainly in the source was
reported as absent, confidently, because it had been cut out of the text being
read. If the output is too long, ask for **fewer classes**, not for less of the
answer.

**Self-test the extractor before trusting it.** Pick one class you can see is
redefined in a media query, ask for it, and confirm at least two rules come back
with their conditions. Thirty seconds, and it is the difference between a fast
port and three rounds of "almost right".

Ignore Webflow noise: `gsap_split_word`/`gsap_split_letter` (every label appears
twice), `bis_skin_checked`, `data-load`, inline `translate3d`.

**Read text from the element that holds it, never from a flattened dump.** A
whole-page text extraction glues adjacent nodes together, so a heading arrives
carrying its neighbour's words and the port ships a sentence nobody wrote. Query
the node, take its text, and keep the two separate.

**Copy the base layer verbatim** — `box-sizing`, `img{max-width:100%}`, the
`margin:0` reset, font smoothing. A section-by-section pass never picks it up, and
a missing `box-sizing` surfaces pages later.

Four checks on every value copied out:

| Check | The failure it prevents |
|---|---|
| Can this declaration reach the element? | `.hero-title{max-width:740px}` never applied because `.hero-title.work` outranked it |
| Is it on the element holding the text? | A container said 14px; the `<p>` inside took the base 16px |
| Does the geometry mean the same here? | Source header `sticky`, theme header `fixed` at 104px — every top offset needed it added |
| Does the source define it at all? | A class with no rule is a hole: compute what it inherits, say so, do not invent |

**Measure the joints.** Walk the sections in order: if one's bottom padding and
the next one's top padding are both non-zero, that is a doubled gap. Report it.
Never introduce a doubling the source does not have.

Collect: breakpoints, palette, spacing scale, type scale, radii, shadows, button
variants, grid ratios, container widths, and a separate list of every animation.

**"Hidden" means invisible, not `display: none`.** A visibility check that only
reads `display` is green on half the ways a thing can fail to appear: the chevrons
in one port were `display: block` throughout and drew nothing; a section overlay
was present in the markup at `opacity: 0`. Both passed, and both were plainly
wrong on screen. Ask instead whether it *renders*: opacity down the ancestor
chain, `visibility`, a non-zero box, a colour that is not fully transparent, and —
for anything drawn by a pseudo-element — whether the `content`, `background-image`
or `mask` actually resolves. `templates/probe.js` reports this as one `visible`
field; use it rather than reading `display` yourself.

**Build a visibility map before writing anything.** One row per element that is
not visible at all seven tiers, one column per tier, each cell visible or hidden.
It takes a few minutes and it is the only artefact that makes the hiding rules
checkable later — without it, "is this supposed to be here?" has no answer and the
question quietly stops being asked. Every element that appears twice in the markup
belongs on it, and so does every decoration that exists only above or only below a
width. The map is what Step 7 writes from and what Step 13 asserts against.

**Collect every state rule too, in the same pass** — `:hover`, `:focus`,
`:focus-visible`, `:active`, and every state class the source's JS toggles. They
are carried values exactly like a padding is, and they are the values most often
dropped, because a static page never shows them and nobody misses what they have
never seen. Ask the extractor for the section's classes *with* their state
selectors, and record for each: what changes, from what to what, and over how
long. See "Hover and state effects" in Step 7.

**Collect every section at every breakpoint in the same pass.** For each section
the extractor gives the full set at once — sizes, paddings, gaps, columns, order,
what hides, what changes alignment. Record **visibility per breakpoint** and
**which ancestor is `position: relative`** alongside the numbers: both are
carried values, and both are routinely lost. Never analyse the desktop layout alone and
leave the rest for later: a second pass over the same classes costs more than
reading all the media queries the first time, and it is how breakpoints get
missed entirely.

---

# Step 3 — the design system

Everything into `theme.json` so it appears in Appearance → Styles and every
sidebar: `color.palette`, `spacing.spacingSizes`, `typography.fontSizes`,
`fontFamilies` with `fontFace`, `settings.custom`, `layout.contentSize`.

**Define what this page uses, not the whole design system.** Note the rest in the
manifest and add it when a page needs it.

**Assign the family per element, not once globally.** `styles.typography.fontFamily`
sets one family for the whole site and everything inherits it, so a design with a
display face for headings and a text face for body comes out looking uniform if
only the global one is set. Register both families, then assign them explicitly:
`styles.elements.heading`, `styles.elements.button`, `styles.elements.caption`,
and any block that differs. Read the source for **which element uses which
family**, not just how many families exist — one register and one assignment are
different jobs, and doing only the first is the usual reason a port reads as
flat.

**Per-breakpoint sizes:** every type value is a token on `:root`, redefined per
screen in `tokens.css` from the source's numbers — the seven screens of the
panel, nothing else. Styles → Typography then edits those tokens per screen (see
"The UPQODE panel"). The sidebar keeps a named step; the number under it changes
as the source does. `typography.fluid: false` when sizes are exact.

**Spacing is a preset scale, and the block names a step.** Every distance in the
source becomes a `spacingSizes` entry pointing at its token, so the panel's
control shows a name. A preset may not point at a token that is redefined below
`:root` — presets are substituted on `:root`, so a token a section redefines
resolves to the root's value, and one that lives on `body` resolves to nothing.

**The container width is one number in `theme.json`, and the design has several.**
`layout.contentSize` and `wideSize` take a single value with no per-breakpoint
form, so a design whose container is 1200 at 1280, 1320 at 1440 and 1600 at 1920
cannot be expressed there at all — and what happens instead is that one width is
written and every other tier silently inherits it. Treat it exactly like the font
sizes: put a variable in `theme.json` and redefine it per tier in the stylesheet.

```css
:root { --theme-content: 1320px }
@media (min-width: 1920px) { :root { --theme-content: 1600px } }
@media (max-width: 1279px) { :root { --theme-content: 1200px } }
```

The same applies to any width the design changes by tier — section padding caps,
a hero's text column, a panel's maximum. Read all of them before writing the
first, or the first one written becomes the answer everywhere.

## `settings.viewport` — leave it alone, and put the canvas width on screen instead

**Do not set `settings.viewport` to the design's tier boundaries.** It reads as
the obvious improvement — the editor's Tablet button opens at core's 782, which a
Webflow-derived design says nothing about, so point it at 991 instead — and it
makes things worse. This is written from having done it, shipped it, and had the
designer find it within the hour.

**The declared value is not the canvas width.** Core resolves it to a number and
subtracts a 1px inset, but what the canvas actually renders at is wider, by an
amount that moves with the editor pane: with `tablet: 991px` declared, one machine
measured **1027px** and then **1061px** for the same selection. So declaring the
tier's boundary puts the canvas *just outside* the tier — `max-width: 991px` stops
matching, and "Tablet" shows the desktop layout. Core's own 782 lands comfortably
inside the 768–991 tier and works; 991 lands outside it and does not.

The failure is silent and it looks like a theme bug. The canvas narrows, so it
reads as tablet; the type, the centring, the gaps are all desktop. The report that
came back was "the text isn't centred and there are no gaps between it, but on the
front end it's fine" — for a design whose `@media (max-width: 991px)` block does
exactly that centring.

So: **leave `settings.viewport` out**, and take the honest route to the same goal.

**Put the measured width in the editor.** One small `enqueue_block_editor_assets`
script, a `ResizeObserver` on the canvas iframe, a fixed badge reading
`1061px · 992–1279`. The screens are the panel's seven, read from the same list
the panel uses, so the badge and the icons cannot disagree. That turns "which
breakpoint am I looking at" from a guess into a number, permanently, and it is
what caught this defect.

Two measurement traps it also settles, both of which produced wrong readings
before the badge existed:

- **The canvas resize is animated.** One reading taken after the click caught it
  mid-transition — 1600, then 1324, then 1027, for one and the same selection.
  Observe, do not sample.
- **Viewport emulation fights the resizable canvas.** Driving the device buttons
  in an emulated viewport left the canvas at the full pane width while
  `getDeviceType()` reported `Tablet`. That is the instrument, not core.

If the setting is written anyway — a design whose tiers happen to sit well inside
core's — the four things below are not guessable:

- **A third key is dropped in silence.** `laptop`, `desktop`, `largeDesktop`
  offered alongside the two came back as just `mobile` and `tablet` — no warning,
  no error. Verify by reading it back through
  `WP_Theme_JSON_Resolver::get_merged_data()`, never by looking at what was
  written. A file that contains a setting is not a site that has it.
- **The generated states are bands, not `max-width` ladders.** `@mobile` is
  `(width <= 767px)` but `@tablet` is `(767px < width <= 991px)` — it *excludes*
  mobile. Nothing cascades downward, which is the opposite of how the stylesheet
  being ported is written.
- **Values may only be `px`, `em` or `rem`.** Percentages and CSS functions are
  rejected — the value is interpolated straight into a media query.
- **Whatever is chosen, one tier has no button** — three buttons cannot cover
  four tiers — and that belongs in the handover line, not in a later discovery.

**The setting moves the preview buttons and nothing else.** It generates no CSS:
on a finished two-page port, core emitted zero media queries while the theme's own
stylesheet carried 93. The page's responsive design stays entirely in the
stylesheet, because two breakpoints cannot express a ladder of eight.

**Do not author anything through the sidebar's "Responsive styles" toggle, and say
why in the handover.** It writes a viewport-scoped style into the block and has
core generate a media query for it — a second home for the adaptive layout, with
different boundaries and band semantics that do not cascade. Debugging why a card
misbehaves at 700px then means reading two systems at once.

**XXL is the tier that gets skipped, and it never looks wrong while you work.**
The screen in front of you is almost certainly 1440, the ladder cascades Large and
XL *upward*, so 1920 inherits a value that is legitimately defined — just not the
design's. Nothing looks broken at any width you happen to open. The only defence
is reading the source's `min-width: 1920` rules deliberately, and measuring there
in the verification pass.

**Fix the class-name convention here, before the first pattern exists.** No
class may contain a double dash — the block serialiser turns `--` into `u002d` in
the database and every drift check then reports a permanent difference. Use one
dash for modifiers. Deciding it now costs nothing; deciding it later cost one port
73 renames across four kinds of file. See "The serialiser escapes `--`" in Step 7.

Four silent traps:

- **Never a palette slug that collides with a block-support class** — `border`
  invalidates every block with a border colour.
- **No digit next to a letter in a slug.** WordPress kebab-cases at the boundary:
  `3xl` → `3-xl`, `h3` → `h-3`, and the variable resolves to nothing.
- **Core's presets shadow yours on a name clash.** Set
  `typography.defaultFontSizes`, `spacing.defaultSpacingSizes` and
  `color.defaultPalette` to `false`; avoid `small`/`medium`/`large` anyway.
- **`settings.custom` is CSS.** A quote, apostrophe, brace or semicolon in any
  value kills the rest of the global stylesheet site-wide. Structured values only.
  **Run `templates/check-theme-json.js` after every edit to `theme.json`** — the
  rule alone has not held, because the failure is silent: nothing errors, the
  generated stylesheet is simply truncated from the bad value onward and the site
  loses its styling below that point. One apostrophe did exactly that in one port,
  and the symptom was silence, not a message. The lint checks quote and apostrophe
  parity across every `settings.custom` value and the slug rules above.

Conflicts with an existing **custom** theme are listed and asked about, never
merged silently.

---

# Step 4 — buttons

Do this **with the header** — the first thing that has buttons. Register the
variations of `core/button` through the panel's `<prefix>_block_styles` filter
(its README shows the shape); it refuses names core already ships
(`is-style-outline` carries `border: 2px solid`).

**Before adding a variation, print the ones that exist.** Not "search" — print the
list, with each one's values. On page two of one port a card button was compared
against the two variations that came to mind, an eighth was written for it, and
the seventh already in the theme was byte-identical — labelled, in the file,
"Small white — View Details". The same applies to a token, a preset or a helper:
the cost of listing is one command, and the cost of not listing is a duplicate
that the designer then has to choose between in the sidebar.

**A button's look is a variation the designer can see and pick**, in the block's
Styles tab — never a class written into a pattern. A class in the pattern is a
look nobody can choose for the next button.

**Button typography belongs in `theme.json`** (`styles.elements.button`), not in
CSS: core declares it as `inherit` through `:root :where(...)`, which ties on
specificity and wins on the canvas. CSS keeps only what a `:hover` or a JS state
repaints.

---

# Step 5 — fonts and media

**Nothing heavy ships.** Every image is resized to the largest box it actually
occupies and converted to WebP or AVIF; a video that is decoration rather than
content is compressed, and one over a few megabytes is streamed or replaced
rather than served from the Media Library. A hero that weighs eight megabytes
passes every visual check ever written and fails the only measurement the client
runs. Weigh the page, not the folder: what matters is the bytes one page pulls.

**Fonts always end up self-hosted.** In order: `@font-face` with a `data:` URI →
decode the base64; with a URL → download; Google Fonts → download and host
(licences allow it, and it removes a third-party dependency). Anything else,
Adobe Fonts included, is **not** wired up — name the font and ask for the files.

**One `@font-face` per subset, each with its own `unicode-range`.** Several `src`
entries in one face are a fallback chain, not a union: the browser takes the
first that resolves, and if that is `latin-ext` every ordinary word falls back to
the system font while every diagnostic reports success. **Verify by measuring a
rendered string's width**, not by a load event.

**Images into the Media Library** — it is the Assets panel. Reference by
attachment ID; **never hardcode an upload URL**, WordPress stores under
`/uploads/YYYY/MM/`. Call `wp_generate_attachment_metadata()` after upload or the
image is blank on the canvas. Only CSS-only decorative files go in the theme.

**Optimise media after the page stands up**, not on the way in — attachment IDs
do not change, so nothing needs re-referencing. Exception: anything over ~2 MB,
or video, which distorts measurement. Then: downscale to ~2× the largest CSS
width (cap 2560), WebP, strip metadata; video as MP4+WebM, no audio on a
decorative loop, `preload="none"`, poster.

**SVG uploads** are off by default — copy `templates/svg-support.php` verbatim,
changing only the prefix. Never write a lighter one.

All text comes from the source verbatim. Never placeholder text.

**Preload the typefaces the page uses above the fold.** WordPress builds the
`@font-face` rules out of `theme.json` and prints them in a `<style>` in the
head. That is correct and it is also **late**: the browser only learns the fonts
exist once it has parsed that block, so the request goes out after every
stylesheet has been fetched, and `font-display: swap` then shows the page in the
fallback face and reflows into the real one. A `<link rel="preload">` moves both
requests to the front, where the preload scanner finds them on the first pass
over the markup.

Preload only the faces **every** page uses — typically the body family and the
display family. A third face, or one used by a single template, does not belong
there. And do it **in the theme rather than in the caching plugin**: a plugin's
version of this is usually gated on the site being live, so it does nothing on a
`.local` or `.test` host and the whole project is built without ever seeing the
real load order.

**Tell the browser how wide the picture is actually drawn.** WordPress writes
`sizes="(max-width: 1512px) 100vw, 1512px"` on every image — that is, *this
picture fills the window* — so at 1440 the browser fetches the 1440-wide file for
a card 334px across. Measured on one site before this was fixed: **230 images
over twice their box across 29 pages, the worst at 31×**. Nothing about it is
visible; the page looks right and weighs several times what it should.

Correct it per slot, and **guess nothing**: each rule names a class the theme
itself puts on the slot, so a width changes only where the design changes it, and
an image in a slot nobody listed falls back to its container rather than to the
window. Register a smaller intermediate size where the design's frame is smaller
than anything WordPress generates — small avatars and marks are the usual case,
where `medium` at 300 is still four or five times the frame.

## Optimise on the way in, never as a pass at the end

**A file is optimised in the same command that uploads it.** Not a later sweep, not
a line on the outstanding list — the import script converts and re-encodes, and
what lands in the Media Library is already the shipping file. The designer said it
plainly: *"you should optimize them while you are uploading them into project"*.

The reason is not tidiness. An asset imported raw is immediately referenced — by a
pattern, by an inline background URL, by a block's stored attributes — and by the
time anyone comes back to optimise it, replacing it means chasing those references
through the patterns **and** the saved page. One port left it to the end and paid
for exactly that: a background image converted to WebP still served as `.jpg`
because the URL was baked into `post_content` when the pattern was flattened.

Extension and filename change ⇒ two writes and a repoint. Same filename ⇒ one
write. So re-encode **before** the first reference exists.

### What to do, per kind

| Kind | On import |
|---|---|
| Photographs | WebP. GD does it in three lines — `imagecreatefromjpeg` → `imagewebp($im, $path, 80)` |
| Fonts | **WOFF2, with the original as a fallback `src`.** A variable TTF is 60% larger than the same face as WOFF2, and nothing self-hosted serves it compressed by default |
| Video | Strip the audio track from anything `muted`, scale to the width it is displayed at, re-encode: `ffmpeg -i in.mp4 -vf scale=W:-2 -an -c:v libx264 -crf 28 -preset slow -movflags +faststart out.mp4` |
| SVG | Leave alone — they are already bytes-small |

### Measure the page, not the folder

`du -sh uploads` is the wrong number: it counts every generated size variant, most
of which are never requested. What matters is what one visit transfers. Read it
from the browser and group it:

```js
performance.getEntriesByType('resource')
  .reduce((total, r) => total + (r.transferSize || r.encodedBodySize || 0), 0)
```

One port's "18 MB of uploads" was in truth a 6.4 MB page — of which **5.3 MB was
two video files** and the images were already fine. The folder size pointed at the
wrong work entirely. After the videos: 2.68 MB.

Three faults hide in a hero video, and all three were in that one file:

1. **An audio track on a `muted autoplay` loop** — 127 kbps of bytes that can
   never be heard by anyone.
2. **Resolution far above the frame** — 1080×1920 delivered into a 796×533 box.
3. **A bitrate meant for delivery, not for a background** — 4.85 Mbps for eight
   seconds.

Together: 4.76 MB → 1.28 MB, and a frame pulled from each at display size is
indistinguishable. Check that rather than trusting the CRF — extract the same
frame from both with `ffmpeg -ss N -frames:v 1` and look at them.

**And when you re-encode, keep the filename.** Replacing a file in place leaves
every URL in the patterns and the saved page correct; only `wp_update_attachment_metadata()`
needs calling afterwards, because WordPress caches a video's size and dimensions
on the attachment.

**One warning about verifying it: the browser's media cache is separate, shared
between tabs, and stubborn.** A `<video>` will keep reporting the old
`videoWidth`/`videoHeight` after the file has been replaced, in a brand-new tab.
`curl` the URL the served HTML actually names, and believe that.

---

# Step 6 — header and footer

Both template parts, both finished **before the first section is written**. The
frame comes first: a page with a header and no footer cannot be looked at as a
page, and coming back for the footer later means re-deriving values already in
hand.

### How many headers — and it is not the same count as how many behaviours

**Count the markup, not the effects.** These are three different situations and
only the last one is two template parts:

| The design has | What the theme has |
|---|---|
| one header, one behaviour | **one part** |
| one header, **several behaviours** — a bar that animates differently on the home page, two things interpolating on scroll, a variant with the logo inverted | **still one part.** The variant is a block style on the header block or a toggle in its panel, never a forked copy |
| two genuinely different headers — different markup, different contents | **two parts**, plus a custom template so the designer can choose per page |

**The test is whether the markup differs.** If the same elements are present and
only their look or their motion changes, it is one part: forking it duplicates
markup that then drifts, and the second copy stops getting the corrections the
first one gets. The commonest version of this mistake is making a second header
part for a scroll animation, which is behaviour, not structure.

Ask the designer which of the three it is, in the first minute of the header —
"one header or two?" is a different question from "does the bar behave the same
everywhere?", and the answers do not follow from each other.

A design with two headers — dark over a photo, light everywhere else — is two
template parts and one extra template, not one header with a conditional class.
The conditional version looks cheaper and takes the second variant out of the
designer's reach: it cannot be seen, opened or edited in the Site Editor, which is
the whole reason the work is done in blocks.

Three pieces, and all three are needed before anything appears in the interface:

```
parts/header.html            parts/header-dark.html
templates/page.html          templates/page-dark-header.html
```

```json
"templateParts": [
  { "name": "header",      "title": "Header",       "area": "header" },
  { "name": "header-dark", "title": "Header — dark", "area": "header" }
],
"customTemplates": [
  { "name": "page-dark-header", "title": "Page — dark header", "postTypes": [ "page" ] }
]
```

The alternate template is the ordinary one with a different part called:

```html
<!-- wp:template-part {"slug":"header-dark","area":"header"} /-->
```

The designer then picks it per page: **Page → Template → Change template**.

**An empty `customTemplates` is why that menu offers nothing.** It is the single
most common reason a theme ships with two headers and no way to choose between
them, and the symptom is a template list with one item in it. Note also that a
`page-{slug}.html` template does **not** appear there: WordPress applies it by the
slug automatically, so it is right for a page that always looks that way, and
useless as a choice.

Declare every part in `templateParts` even when there is only one of each —
undeclared parts still work, but they lose their title in the Site Editor and
appear as a slug.

### Decide which navigation you are building — before you build it

There are two ways to do the menu, and choosing the wrong one is expensive in a
way that only shows up after three rounds of corrections. Decide from the design,
in the first minute of the header, and say which you picked.

**`core/navigation` with `overlayMenu`** — when the design is a single-level bar,
or a plain one-column dropdown, and a standard drawer. Core is close enough to
free here, and the menu edits in the Site Editor like any block.

**The theme's own navigation block** (`templates/nav-block/`) — built *with* the
header, not after it, because it replaces the fight rather than joining it. When
the design
has any of: a mega panel with columns, a panel wider than a link list, a panel
that spans the header rather than hanging off its item, hover-revealed marks on
the links, or a drawer with its own open/close behaviour. Every one of those means
out-weighing core's navigation CSS — its submenu link padding, its doubled-class
colour rule, its positioning against the item with an edge flip, its hidden
submenu icon, its overlay's `aria-expanded`. Owning the markup removes all of
that at once, and the block still exposes the menu, the column count and the
panel width in the sidebar, while the items themselves edit in Appearance →
Menus.

**And this is the one place the "core blocks until behaviour makes it
impossible" rule comes out in favour of a block of your own** — so say why, out
loud, rather than treating it as licence. A menu is behaviour: open, close, trap
focus, close on Escape, close on a click outside, rebuild on a breakpoint change.
Core's own navigation block is behaviour too, which is why it is the default; it
is replaced only when out-weighing its stylesheet costs more than owning the
markup. Nothing else in the header earns the same exemption.

So the rest of the header stays real blocks either way — the logo is a
`core/image`, the CTA a `core/button`, the wrappers groups with their padding in
the panel. Only the menu changes hands, and the menu's **content** does not even
do that: it stays in Appearance → Menus.

Copy the template rather than writing this from scratch; it carries the drawer,
the panel grid, the chevron state and the hover-revealed mark already shaped, with
every design value marked.

**But the template is one header archetype, not the header.** This is the single
easiest way to ship a menu that is not the design. `templates/nav-block/` assumes
a desktop bar that collapses into a burger and a drawer below a breakpoint —
`nav.js` carries `DESKTOP = '(min-width: 992px)'` and every hiding rule in
`nav.css` lives under one `max-width` query. **A header is designed per project**,
and plenty of designs are none of that: a full-screen overlay, a burger at every
width, a logo centred with the menu split either side, a vertical rail, a two-row
header with a utility bar above, a panel that is always open on desktop.

So **read the design's header shape first, and only then decide what the template
is to you**: a thing to copy, a thing to adapt, or a thing to take four facts
from. Replacing the values marked `DESIGN` adapts the *numbers*; it does not
adapt the *shape*, and a drawer in a design that has no drawer passes every value
check there is.

| What travels to every project | What is this project's design |
|---|---|
| `wp-server-side-render` in the editor script's dependencies | the breakpoint, and whether there is one at all |
| `.js-nav` on `<html>`, with every hiding rule written under it — so no script means nothing hidden | burger and drawer, or overlay, or rail, or always-open |
| no `function` declared in `render.php` | which markup the panel is, and where it is anchored |
| printing rather than returning, with no output buffer | how a mega panel is marked — an item's CSS class, its depth, or its position |
| grouping the flat item list into a tree, so nesting decides the shape | the chevron, the hover mark, the current-item treatment |
| reading the item's `target`, `title` and `rel` yourself | how many columns, how wide |
| the menu's content living in Appearance → Menus | everything in `nav.css` |

**If the design's header is not the template's archetype, write the markup and
keep the left-hand column.** That is the part that was learnt the hard way; the
right-hand column was only ever one project's answer.

Whichever is chosen, everything below applies: the values still come from the
source, and the open-state pass still runs.

### A dropdown is something the client adds, not something the theme hard-codes

**Nested menu items must produce a dropdown, with no class and no theme edit.**
This is the one rule in the navigation that decides whether the menu is the
client's or yours. Write it into the block from the start; retrofitting it means
reworking both the bar and the drawer.

**`templates/nav-block/` already does this** — it groups the flat item list into a
tree and walks it recursively. The failure below happened in a run that wrote its
own navigation instead of copying the template, and quietly lost the capability
along the way. That is the sharpest argument for the copy rule there is: the
template's behaviour is not decoration, and a hand-written replacement loses the
parts nobody remembered were there.

The failure is quiet and it is easy to walk into, because the design shows only
the dropdowns it has. A port read the top level of the menu and branched on two
classes — `mega-services` and `mega-programs`, one collection each — because those
were the two panels in the source. Everything worked. Then the designer asked how
to add a third, and there was no answer: a third class did nothing, and **nesting
pages under a menu item — the ordinary way to make a dropdown in WordPress —
produced nothing at all**, because the renderer never looked below the top level.
Sub-items were being silently dropped on the floor. The menu screen offered a
gesture the site ignored.

So the kind of panel an item opens is decided in this order, and the last line is
the one that makes it the client's:

```php
if ( in_array( 'mega-services', $classes, true ) ) { return 'services'; }
if ( in_array( 'mega-programs', $classes, true ) ) { return 'programs'; }
return $children ? 'links' : '';   // nested pages → a plain dropdown
```

Four things that make the difference between this working and half-working:

- **Fetch the menu as a tree, once.** A helper returning `[ ['item'=>…,
  'children'=>[…] ], … ]` beats calling for children per item, and it is what both
  loops — the bar and the drawer — then share.
- **Build the drawer from the same tree.** A dropdown that exists on the desktop
  and not on a phone is half a feature, and the drawer is a second loop in the
  same file that is easy to leave on the old code path. Normalise collection
  entries and menu children to the same title/url pairs so the drawer's markup
  does not have to know which it is rendering.
- **Reuse the plainest panel the design already has** — the one-column list, with
  its width as a block attribute beside the others. A dropdown the client adds
  should look like the ones that shipped, and it will if it is the same markup.
- **Watch the wording that was written for a collection.** "All Services" above a
  collection reads correctly; "All About" above a page does not. And a parent
  whose URL is `#` should get no such row at all, rather than a link to nowhere.

**One level, deliberately.** A grandchild needs a nested panel the design has no
drawing for, so it is left out of the list rather than rendered somewhere it was
never meant to appear — and that is said out loud in the handover.

**Never declare a function in a block's `render.php`.** That file is executed once
per block instance, so the second instance on a page is a fatal error. Helpers
belong in `inc/`. The nav block appears once today, which is exactly why this
survives every test until the day somebody adds a second header.

**The footer is quick and gets skipped anyway.** It is usually a column layout, a
link list, a newsletter placeholder and a legal row — same skeleton rules as any
section, same ownership pass, and it collapses differently at each breakpoint, so
measure it in the verification pass like everything else. Build it now while the
extractor output is open; it is ten minutes that would otherwise cost thirty
later.

**Assume the header is broken below the breakpoint until measured.** It was the
most defective component in every port. Measure the bar and its children at 991,
768, 600, 480, 390, 360, and open the menu at each.

- [ ] Burger vertically aligned at every width
- [ ] Tapping opens, tapping again **closes**
- [ ] Submenus start **closed** and open on click
- [ ] In the drawer the whole parent row toggles the submenu and does not
      navigate; the chevron is not the only target
- [ ] Every parent item has a visible chevron that rotates when open
- [ ] A long submenu scrolls inside itself instead of pushing the drawer down
- [ ] The last item is not cut off at the bottom
- [ ] Buttons keep their borders and colours
- [ ] Rows have the design's height, not the line height
- [ ] The close control is where the designer put it — usually the burger's square
- [ ] Nothing wraps to a second line down to 360px
- [ ] Desktop dropdowns have the design's column count, width and padding
- [ ] The panel's edges line up with the design's — against the container, not
      against the menu item that opens it
- [ ] Panel radius, shadow, border and its gap to the bar are the design's, not
      core's
- [ ] Bar links have the design's colour in all three states — resting, hover,
      current page
- [ ] Chevrons point the design's way at rest and turn on open
- [ ] Nothing in the panel is visible at rest that the design reveals on hover
- [ ] Drawer submenu rows never overlap; the submenu scrolls inside itself
- [ ] The drawer's submenu spans the drawer's width — no leftover panel width,
      min-width, max-width or column count from the desktop dropdown
- [ ] No dropdown overflows the viewport at the narrowest desktop width
- [ ] The bar reads over every kind of section that can sit beneath it
- [ ] If the design changes the bar on scroll, it changes within the first few
      pixels — built here, with the header, not left for the animation step

**Set the Menus screen up for the menu the theme actually draws.** WordPress
hides most of that screen's fields by default, and the one a panel built from
menu items always needs is **Description** — on a card it is the line under the
name, in a drawer it is the second line of the row. With the field hidden, the
only way a client can change a card's words is to edit the entry's excerpt,
which changes it everywhere else on the site too; and nobody finds Screen
Options on their own.

Show it from the theme, and **only where nobody has decided otherwise**:
WordPress keeps that screen's hidden columns in a user option, and an account
that has never opened Screen Options has no option at all. That absence is what
to look for — anything else is the person's own choice and is left alone. Touch
nothing else about the screen.

**A theme that draws its own menu must read the link's attributes itself.** The
consequence of the rule above, and it is not noticed at once: if the theme does
not use `wp_nav_menu()` but builds the markup, then **every menu-item attribute
has to be read by hand**. The client ticks "Open link in a new tab" in Menus,
saves, checks — and nothing happens, because the theme never asked.

Read at least three: the target (`_blank`), `title` and `rel`. And read them in
**one place** that then feeds every place a link is drawn — the bar, the mobile
drawer, the mega panel and the footer. Four copies of that logic are three places
where it will be forgotten.

**A bar that changes on scroll is part of the header, and it is built now.** The
design switches background, logo, link colour, height or shadow within the first
few pixels of movement — take the threshold from the source, compare against
`scrollY` directly, and evaluate it once on load as well, since a page can open
already scrolled. Do not leave it for the animation step: by the time that step
arrives the header is considered finished, and in run after run this is the piece
that never gets built at all.

**And first decide which of the two kinds it is, because they are built
differently and only one of them is a class.**

- **A switch.** The bar is one thing above the threshold and another below it.
  The state is an attribute or a class on the header, the appearance stays in
  CSS, and the only numbers that matter are the threshold and the transition.
- **An interpolation.** The design does not switch — it *crosses over*: a
  background fading in while a tint fades out, both across the same short
  distance. A class toggle cannot reproduce that at all, and the giveaway in the
  source is a value that is neither the start nor the end at a scroll position
  between them. Here the script writes the values **frame by frame**, and
  whatever genuinely is a state — a padding that steps rather than slides — is
  *also* written as an attribute so CSS can still use it.

Read the source at three or four scroll positions before choosing. A crossover
built as a switch looks nearly right at the top and at the bottom of the
distance, and wrong everywhere in between, which is exactly where nobody
measures.

Two things to keep in mind while building either one: evaluate it **once on load**
as well, and never put a `backdrop-filter` on the bar if something inside it is
already blurred — the bar becomes a backdrop root and kills the inner blur.

### Check the header open, at every tier — nothing else counts

Almost every header defect a designer has reported lives in the **open** state,
and every one of them passed a verification that measured the header closed. Bar
height, burger alignment and wrapping are the cheap part; what goes wrong is what
appears after the click.

So the header gets its own pass, run at each tier of the ladder, with the panel
**open** while it is measured — one script per tier, not one per question:

- the panel's **left and right edges**, compared against the content container's
  edges, not against its parent item;
- its **width**, **padding**, **radius**, **shadow**, **border**, and the **gap
  between it and the bar** — five or six values, all of which core supplies its
  own version of;
- the **column count** and the column widths;
- the **row spacing** and the link colours, in all three states;
- the **chevron**: which way it points at rest, and that it turns on open;
- whether a long submenu **scrolls inside itself**;
- and whether anything is visible that should only appear on hover.

Compare each against the design side by side. The header is the one component
where most of the values exist only in an interaction state, so reading the source
CSS alone is not enough — open the design and open the build, at the same width.

### The desktop dropdown is a layout, not a list

Core's submenu is one narrow single-column list. That is a default, not a design
decision, and it is wrong for most headers — a mega menu with two or three
columns of links comes out as a single tall column unless the layout is
reproduced deliberately.

Read the source for the dropdown the same way as any section, and carry all of
it across:

- **how many columns**, and their widths — this is the one most often lost. Build
  them with **grid**: the CSS `columns` property is ignored on a flex container,
  and a multi-column block settles the panel's height before its content, so each
  link ends up in its own column running off the screen;
- the panel's own **width**, which is usually far wider than a link list;
- padding, gaps between columns, dividers, column headings;
- where it is anchored — under its parent item, or spanning the bar;
- what it does on hover versus click, and the transition.

**A mega panel is anchored to the header, not to its menu item — and that is the
defect, not the width.** Core positions
`.wp-block-navigation__submenu-container` against its own `<li>`, and flips it to
the right when it sits near the viewport edge. So a panel whose width is perfectly
correct still opens under the last menu item and runs to the right edge of the
page, while the design has it spanning the container. Do not fight the flip:
**give the owning `<li>` `position: static`**, so the panel resolves against the
header's positioned container instead, and set its `left`, `right` and `width`
from the design there.

Watch for this being mistaken for a design compromise. One port recorded "the
mega menu is pinned to the right edge because core pushes it off screen at 992" as
a deliberate deviation. It was not a deviation; it was this bug, accepted.

Two more things fight you. Core sizes and positions the panel itself, so a width
set on one class can lose — one port shipped a mega menu at 517px where the design
said 650. And core inflates specificity around navigation generally, so count its
selector before writing against it (`reference/traps.md` → "Core defaults").

**The bar's own link colours are a block attribute, not CSS.** Core writes
`.wp-block-navigation-item__content.wp-block-navigation-item__content{color:
inherit}` — the same class twice, purely to win, at (0,3,0). A single-class rule
of yours loses, so the resting colour comes out as core's while your hover or
current-page colour still applies, and the bar ends up with some links in the
accent colour and some not, for no reason a designer can see. Set `textColor` on
the navigation block and take the three states — resting, hover, current page — as
three separate values from the source.

Check the dropdown at every desktop width, not only the widest: a three-column
panel that fits at 1440 can overflow the viewport at 1280.

### What the drawer must actually do

Core's overlay does none of this by itself, and the defaults are wrong in three
specific ways. Build all three deliberately.

**Submenus start closed and open on click.** Core keeps every submenu expanded
inside its own overlay, so the drawer opens as one long unbroken list and the
designer cannot tell what is nested. Core also does not settle `aria-expanded`
in overlay mode, so the toggle has to be explicit: a state class set from a
capture-phase listener, and the submenu closed until it is set.

**A rule written for the open state must be scoped to the open state, and the
chevron belongs to the row, not the item.** Two defects, one habit. A mega panel
given a fixed height unconditionally is a panel that is open at rest — the height
belongs under the state class, not on the element. And a chevron positioned
absolutely against the whole `<li>` drifts to the middle of the opened panel,
because the `<li>` is what grows when the submenu appears: position it against the
row that holds the label, which does not change size.

**In the drawer the whole row opens the submenu — it does not navigate.** A
parent item on a phone is a control, not a link: tapping anywhere on the row,
label included, opens and closes its submenu. Leaving the label as a link means
the designer taps "About Us", the drawer vanishes and another page loads, and the
only way to reach the submenu is a 24px chevron. That is the behaviour in the
design, and it is also the only one that works with a thumb.

So below the drawer's breakpoint, a parent row's link has its default prevented
and carries the open state — the chevron is then a visual mark rather than the
only target. Two things follow from it:

- **This is drawer-only.** On desktop the same item usually does navigate, or
  opens on hover; do not carry the prevention up.
- **If the parent has a real page of its own**, the design almost always repeats
  it as the first entry inside the submenu. Check the source: if it is there,
  reproduce it; if it is not, the parent is a label and has no destination.

**Every parent item shows a chevron, and it rotates when open.** Without it the
row looks like an ordinary link and nobody knows there is anything under it.
Core actively hides it — `…:where(:not(…)) …__submenu-icon{display:none}` at
five classes, (0,5,0) — so the rule bringing it back needs at least as much
weight. Give it a real box (around 40px inside the row's height), sit it against
the right edge, and rotate 180° on open.

**Menu markers usually belong to the hover state.** A dash, an arrow or a dot
beside a submenu link is very often not a resting decoration: the link sits with a
negative left margin so the marker is held outside its box, and on hover the
margin goes to zero, so the link slides across and the marker appears. Build it as
a resting decoration and the panel shows a marker on every row at all times — which
looks like an invented decoration, but is really a hover state flattened into the
resting state. The general test, and it applies well beyond menus: **anything
visible all the time that the design only reveals is a state built as a
resting value.** Read both rules — the resting one and the `:hover` one — and carry
the difference, not the end result.

**A submenu is scrollable, not endless.** An eighteen-item submenu must not push
the rest of the drawer down and off the screen: give it a `max-height` — a
sensible cap is a few rows, or a fraction of the viewport — with
`overflow-y: auto`. Without this the designer opens one dropdown and loses every
item below it.

**Three parts, and only all three together work:**

| | |
|---|---|
| `max-height`, never `height` | A fixed `height` on a flex column makes the items shrink instead of overflow — `flex-shrink: 1` is the default — and they compress below their own line height until the text lines **overlap each other**. A drawer with rows printed on top of one another is this, not a spacing bug. |
| `flex: 0 0 auto` on the items | Stops them shrinking at all, so the excess becomes overflow, which is the thing `overflow-y` can scroll. |
| `overflow-y: auto` | Only now has something to scroll. |

Two of the three produce a different symptom each, which is why this looks like
several unrelated bugs: the first defect masks the second, since squashed items
technically fit and nothing overflows.

**The drawer's submenu takes the drawer's full width — undo every width the
dropdown set.** The desktop panel is a floating box with its own `width`,
`min-width` and often a `max-width`; inside the drawer it is a section of a list
and spans it edge to edge. Reset all three in the media query, and the mega
panel's column count with them — a three-column grid has no business in a 320px
drawer. Left in place, the submenu sits visibly narrower than the rows above it,
and its divider and padding are cut short to match, which reads as a spacing bug
rather than a leaked width.

This is the general leak check applied to the one place it happens most: every
value the dropdown sets is a value the drawer must either restate or clear.

**The drawer's button is a sibling of the `<ul>`, not a child of it.** Core puts
whatever follows the menu — the CTA, usually — in
`__responsive-container-content` beside the list, so every rule written against
the `<ul>` misses it, and removing or restyling the list tears the button out of
the flow. Style it as the sibling it is, and check its position in the drawer at
every tier.

Then check the whole drawer against the design's own row height, spacing and
dividers — core's defaults for those are wrong too.

Known causes are in `reference/traps.md` → "Header". The four that recur: a closed
responsive container still `display:block`; core's fade keeping a `translateY`;
`.wp-block-navigation-item__content` being inline with its padding zeroed; core's
own close button centred with auto margins.

---

# Step 7 — build the page

Zero `core/html`. Repeating content goes in a PHP array at the top of the pattern
and loops.

## The breakpoint ladder

Unless the source says otherwise, these are the breakpoints, and this is the
cascade — it is Webflow's, which is where most of these designs come from:

| Tier | Range | Cascades | What it is |
|---|---|---|---|
| **Base** | 992–1279 | **both up and down** | Every base style is written here |
| Large | 1280–1439 | up | Large desktop |
| XL | 1440–1919 | up | Wide screens |
| XXL | 1920+ | up | Ultra-wide |
| Medium | 768–991 | down | Tablet landscape |
| Small | 568–767 | down | Tablet portrait / large phone |
| Tiny | 360–567 | down | Mobile portrait |

These are the panel's seven screens, and **the only seven queries the theme
ever writes**: `min-width` 1280, 1440, 1920 and `max-width` 991, 767, 567. No
1099, no 1024, no 1600, no `(min-width: 768px) and (max-width: 1279px)` — a
value on an off-grid query is a value no screen of the panel can hold, so it can
never be moved there and never be edited. If the source has an off-grid query,
measure what it gives inside each of the seven and write those.

Do **not** copy two of them into
`settings.viewport` to move the editor's preview buttons — the canvas renders
wider than the declared value, so the tier's own rules stop matching and "Tablet"
silently shows desktop. Step 3 has the measurements.

Two consequences that decide how the CSS is written, and getting them backwards
is what produces a page that is right at one width and wrong at the next:

- **The widest tier is the one nobody sees.** A design's container, and often its
  type and section padding, grows again above 1920 — and since the ladder
  cascades upward, whatever was written at 1440 arrives there looking deliberate.
  Read the `min-width: 1920` rules explicitly; do not assume their absence.
- **Base is not desktop.** It is 992–1279, and it reaches every tier in both
  directions. A value written at Base without an override is a claim that the
  design uses it at 360 and at 1920 alike.
- **The two directions do not meet.** An override at Large travels up to XL and
  XXL and never reaches Medium; an override at Medium travels down to Small and
  Tiny and never reaches Large. So a change that must apply above *and* below Base
  is two rules, not one — and a rule written in the wrong direction is invisible
  at exactly the widths the designer is looking at.

**Every section is checked at every tier — all seven, not the three that seem
interesting.** A section that was only ever looked at on desktop and phone is a
section with two untested tiers in the middle, and 992 and 1280 are where the
layouts in these designs actually change.

## Build every section responsive from the first line

A section is written **with all of its breakpoints at once**, from the values the
analysis already collected — not built for desktop and adapted afterwards. The
adaptation pass is the expensive mistake: it means opening every pattern and
every rule a second time, and anything overlooked stays broken until someone
measures it.

So when a section is written, so are its seven screens — **in the panel, not in
media queries**: the sizes that change, the paddings that shrink, the direction
that turns, the alignment that centres, the elements that hide. What the panel
cannot say per screen (a grid going to one column, the order of children) is the
part's CSS, written in the same sitting. The section is finished at **every tier
of the ladder above** or it is not finished — and "finished" means each of the
seven was actually looked up in the source, not that the ones that seemed likely
were.

**`display:none` is a value, and it is the one most often dropped.** A design
routinely carries the same control twice — a CTA for the bar and a copy for the
drawer, a desktop logo and a mobile one, a decoration that exists only above a
width. The markup for both is copied faithfully and the rules that hide each one
are not, so the page shows two of everything. For every element, carry across
**where it is visible**, not just what it looks like: if the source hides it
anywhere, that rule comes with it. Two identical buttons side by side is the
signature of this being missed.

**On a block, hiding is the panel's "Hide on this screen" — one tick per screen
the source hides it on.** The switch prints `display: none` with `!important`
inside a window closed at both ends, so it beats core's layout rules on the front
end and in the canvas alike, and the designer sees and changes it. The rest of
this passage is about the elements that are **not** blocks — a `render.php`'s
markup, a part drawn in PHP — where the rule is still CSS and still has to win.

**And when the rule was written, it still loses.** This is the part that catches
people who did carry the value across: core prints
`body .is-layout-flex{display:flex}` — weight (0,1,1) — for every group with a
layout, after the theme's stylesheet. A single-class `.thing{display:none}` is
(0,1,0) and loses on weight, so the element that is meant to be hidden at 1440 is
sitting there in full view and the CSS says it should not be. One port had a
desktop block and a mobile block visible simultaneously on tablet for exactly
this reason.

So write hiding rules to win, every time:

- prefix with `body`, or use two classes — but **`body .thing` only ties with
  core's (0,1,1) layout rules, and a tie is decided by load order.** The theme's
  stylesheet is printed after core's on the front end and before it in the editor
  canvas, so the identical rule wins in one place and loses in the other. That is
  the single most expensive shape of mistake there is, because it presents as four
  or five unrelated defects — a background, a dropdown, a canvas — each looking
  local. To beat core rather than draw with it, add a second class of your own, or
  set the value as a block attribute. And when one of these is found, **search the
  whole stylesheet for the same shape** instead of fixing the instance;
- put the rule inside the media query for the tier that owns it, and remember the
  ladder's directions — hidden above Base and hidden below Base are two rules;
- for an element that is hidden at every tier but one, prefer hiding it at Base
  (which cascades both ways) and revealing it at the one tier that shows it —
  fewer rules, and no direction to get wrong.

A hidden element is hidden when `getComputedStyle` says `display: none` — not
when it is transparent, not when it is zero-height, and not when it happens to be
off screen. Those three leave it in the accessibility tree and in the tab order.

**DOM order is a value, and below the collapse width it is the layout.** On
desktop a grid places children by `grid-area` and their order in the markup does
not show; the moment the container becomes a column — usually below 992 — the
browser falls back to document order, and an image written before its heading
appears above it on every phone. No size comparison can see this, because every
size is right. Reproduce the source's order of children exactly, and compare the
**sequence** of elements at the widths where the layout collapses, not just their
boxes.

The same mistake in a different form: attaching a value to the wrong node. A
video control merged into its wrapper and positioned as the wrapper took the
wrapper out of flow, the panel lost its 120px row gap, and everything below 768
sat 105px too low. Before styling, confirm which node the source actually carries
the rule on.

**An absolutely positioned element belongs in the container that positions it.**
Its offsets and percentages resolve against the nearest positioned ancestor, so
moving it to a different parent silently changes what `top`, `right` and a
percentage mean — the element lands somewhere else, or bleeds over the section above. Read which
ancestor carries `position: relative` in the source and reproduce **that**
nesting, not a tidier one. Check the same on the canvas: the editor positions
every block, so the containing block there is the immediate parent, not the
ancestor the front end uses.

**A responsive value is a screen in the panel, never a CSS override of a panel
value.** The middle screen is inline and the other six print with `!important`;
a media-query rule in the theme beside them is dead at some widths and alive at
others, and nobody can see which from the sidebar.

## Every section has the same skeleton

```
Group  tagName:section  align:full   ← background, image, colour: reaches the edges
└─ Group  layout:constrained         ← content: lines up with every other section
   └─ the section content
```

This is the design system's own `<section>` + container, said in blocks. If the
project has an HTML guide, the two must read as the same rule in two
technologies — the outer block **is** `<section class="section …">` and the inner
one **is** the container with the project's max width and its fixed side padding.

🔴 **Set `tagName` on the outer group.** A Group renders as `<div>` unless told
otherwise, so the skeleton above produces div soup in WordPress just as readily
as a careless hand-written page does — and it passes every value check while
doing it. On one finished theme: 84 groups carry `"tagName":"section"`, plus
`main`, `header`, `footer` and one `article`. None of that is visible on screen,
and all of it is the difference between a document and a pile of boxes.

| Where | `tagName` |
|---|---|
| a page section | `section` |
| the one wrapper around the page's content | `main` — exactly one |
| the header and footer parts | `header` / `footer` — one each, never nested |
| a post or a card that stands on its own | `article` |
| everything else | leave it a `div` |

**The source's structure is not carried across; ours is imposed.** An export is
usually nothing but `div`s, and reproducing that faithfully would be the one kind
of fidelity nobody wants. Values come from the source — see non-negotiable 12 —
**structure and semantics come from the system**: the skeleton above, the menu in
`<nav>`, one `h1`, headings that do not skip a level.

A section that is not full-bleed simply gets no background on the outer block.
Keeping the skeleton identical is what makes the left edges match without
thinking — which is why it is a skeleton and not a per-section decision. The left
edges get measured in the single verification pass, not section by section.

`align:full` also needs `core/post-content` in the template to carry
`{"align":"full","layout":{"type":"constrained"}}`, and `theme.json` to have
`appearanceTools` and `useRootPaddingAwareAlignments`. If *every* section renders
at content width on the canvas, the template is the cause. Never fake it with
`width:100vw`.

## Centring is two different mechanisms — say which one

Gutenberg centres a **box** and centres **text** by different means, and they are
not interchangeable:

- `textAlign` on the block writes an alignment class and centres the **text
  inside** the element, whatever width the element is;
- `justifyContent` or `align-items` in the parent's layout centres the **box**,
  and does nothing to the text within it.

A group set to centre its children therefore leaves a full-width paragraph looking
left-aligned: its box is already as wide as the parent, so centring the box is a
no-op, and the text keeps its inherited alignment. The eyebrow above a centred
heading is where this shows up most, because the heading usually carries its own
`textAlign` and the small label above it does not.

So for every element the design centres, decide which of the two is meant, and
set that one. A narrow box inside a wider parent needs the layout; text inside a
full-width box needs `textAlign`; an element that is both usually needs both.

## Layout is a block attribute

| Design intent | Attribute |
|---|---|
| A collection section | `core/query` + Post Template — **always**, never a custom block for the loop |
| N columns of cards | `displayLayout` on `core/query` — the List/Grid toggle, and what the editor reads |
| Gaps, including heading to grid | `spacing.blockGap` |
| Full-bleed | `"align":"full"` |
| Row with space-between | flex layout + `justifyContent` |
| Photograph behind text | `core/cover` — never an Image with positioned text |
| Section background | `backgroundColor` / `gradient` |

**`blockGap` on a flow layout serialises as `margin-block-start`, not `gap`** —
give the block a grid layout so it becomes a real gap.

**Declaring the layout in CSS while the block declares another is the single most
productive bug in these ports.** Core writes its own layout CSS at the same
specificity as yours and after it, so the gap between what you wrote and what the
block says gets filled by core, not by you. Two defects a designer found in one
run were the same mistake: a group with flow layout and `blockGap: 15px` gave
every child a `margin-block-start` on top of the grid `gap` declared in the theme,
and a flex column with `justifyContent: center` shrank to its text so a button's
`width: 100%` meant 100% of 116px. Both were cured by giving the layout to the
block — `layout: {type: grid, columnCount: 2}`, `justifyContent: stretch` — which
also makes the editor render it correctly, for free.

So: **`display: grid` or `display: flex` written in the theme, on a container
that is a block, is a smell.** If you are typing it, the layout belongs on the
block instead.

**`verticalAlignment` counts as layout too, and is the one always forgotten.**
Core writes `align-items: center` on a flex `core/buttons` row; a design row is
plain flex, so its initial `stretch` makes a shorter button grow to match a taller
one. Two buttons that come out different heights are almost never a button
problem. See traps.md.

## A custom block must look the same wherever it is dropped

The bar is not "it works". The designer's own words, and they are the standard:

> *"If I paste a slider, I want it to look the same as the slider in the pattern —
> with borders, colours and so on. And I have the possibility to change it in
> WordPress, in the sidebar."*

Both halves, together. A pasted copy is visually identical to the one in the
pattern, **and** every part of that appearance is still reachable from the
sidebar. A block that needs the designer to retype values before it looks right
has failed, and so has one that looks right because the values are welded shut.

A block that only behaves in the one section the pattern places it in is not a
block. It is a section that happens to be spelled like one, and the designer finds
out by inserting it somewhere else and getting nothing.

This is not theoretical: one port shipped a crossfading slideshow whose frame —
`position: relative`, `overflow: hidden`, a height — lived on the *section's*
class. Its slides and dots are `position: absolute`, so a fresh copy anywhere else
collapsed to zero height and threw its photographs across the page. The designer
found it in the first minute of trying to reuse it.

Four rules, each of which was broken in that same port:

**1. The frame belongs to the block's own class.** Everything a standalone copy
needs to hold together — positioning context, a default size or ratio, `overflow`
— goes on `.your-block`. What is genuinely this placement's — its share of a grid
row, its height at each screen — goes on this instance through the panel.

**And the block's *look* belongs in `theme.json` under `styles.blocks.your/block`
— not on the instance the pattern happens to place.** This is the half that is
easy to get wrong while feeling principled about it. A radius, a background, a
border, a font: writing them only as attributes on the pattern's copy satisfies
"every value on the block" and still produces a paste with square corners. Writing
them in CSS makes the paste look right and takes the sidebar away. `theme.json` is
the only place that does both — it is the block's default appearance, it renders
identically wherever the block lands, the sidebar shows it, and a per-instance
change still overrides it.

So, for each property of a block's appearance, ask which of three it is:

| | where it goes |
|---|---|
| True of every copy of this block (its radius, its background, its type) | `theme.json` → `styles.blocks.your/block` |
| True of this one placement (its share of a grid row, its height at each screen) | the panel, on this instance |
| Chosen per instance by the designer | left unset — the sidebar writes it |

One port put a slideshow's 20px radius on the pattern's instance only. Every check
passed, the section was pixel-correct, and a pasted copy had square corners.

**2. Never build a sidebar by reflecting over `props.attributes`.** WordPress
merges an attribute into the block for everything it supports — `style`,
`metadata`, `anchor`, `className`, the colour and typography keys. Reflection
turns `style`, an object, into a text field reading `[object Object]`, and anyone
who types in it corrupts the block's own border and spacing. Render controls for
the block's **own scalar attributes** only; core draws its own panels for the rest.

**3. Never show a storage key to a human.** `xx_service_link` in a free text box
is a question nobody outside the theme can answer, and one typo silently unlinks
every card on the page. Offer a labelled list built from the same config that
labels the entry's own editing panel, so both screens call the field the same
thing and renaming it changes both. Keep the raw text field only for the case where
the block sits outside a collection and there is no list to build — with a help
line saying so.

Same rule for every other control: `interval` is not a label, `openInNewTab` is not
a label, `successText` is not a label. If the sidebar reads like a variable dump,
it is one.

**4. Every dynamic block answers its own empty state.** A render callback that
`return`s prints **"Block rendered as empty"** in the canvas, which tells the
designer nothing and reads as a broken block rather than an unfinished one. Say
what is missing and, where possible, offer the control that fixes it right there:

```php
if ( ! $terms ) {
    if ( current_user_can( 'edit_posts' ) ) {
        echo '<p>' . esc_html__( 'No service groups yet — add them under Services → Service groups.', 'theme-textdomain' ) . '</p>';
    }
    return;
}
```

A visitor still sees nothing. Only the editor gets the sentence.

**Declare `ancestor` when a block only means anything inside a loop** — but check
every existing use first. In the same port, `card-title` and `meta-if` were only
ever inside a Post Template and got `"ancestor": ["core/post-template"]`, while
`card-link` was legitimately standing alone in another section with a fixed URL;
adding the restriction for symmetry would have broken a working section. Grep the
patterns before restricting anything.

Skip `example`. For any block that needs a post or picked media, the inserter
preview renders empty, which is worse than the honest "no preview available".

## Flex direction changes what the properties mean

Four bites of the same nature, all of which cost real time:

- **`flex-wrap: wrap` is core's default.** In a *vertical* flex with a limited
  height, that wraps the content into a second column — and it does not look like
  wrapping, it looks like text mysteriously sitting to the right of its block, or
  126px outside the page. `flex-wrap: nowrap`.
- **`flex-basis` in a column direction is a height, not a width.** `flex: 1 1
  304px`, written to get 2+1 cards on tablet, added 483px of empty space per card
  the moment the list became a column. Reset it to `flex: 0 0 auto` inside that
  media query.
- **`body .is-layout-flex{display:flex}` has weight (0,1,1)** and beats any
  single-class `display: none`. This is why a mobile block and a desktop block are
  visible at the same time. Prefix such overrides with `body` too, or hide the
  element with a block attribute.
- **`columns` is ignored entirely on a flex container**, and a multi-column block
  does not rescue it either — the panel's height is settled before its content, so
  each item goes into its own column and marches off the screen. A mega menu that
  should be three columns comes out as one tall list. **Use grid**: it divides
  without needing a height.

## The serialiser escapes `--`, and it ruins three different things

WordPress escapes a double dash inside block-comment attributes as `u002d`, and
`wp_update_post()` strips the slashes off whatever you hand it. The literal
`u002d` survives into the database. Three consequences, and the cure for each is
one line:

1. **A CSS variable written into a block attribute makes the block invalid.**
   `var(--wp--preset--color--stroke)` becomes `var(u002du002dwp…)`. One port met
   twelve invalid blocks this way, with a perfect front end, and the editor's
   message pointed at markup rather than escaping. In an attribute write
   `var:preset|color|stroke`; the expanded form belongs only in HTML.
2. **`wp_slash( $content )` before every insert or update.** Without it, twelve
   invalid blocks; with it, zero. This is not optional and it is not conditional.
3. **No class name may contain `--`.** `unwind-students--mobile` in the file is
   `unwind-studentsu002du002dmobile` in the database, so every drift check reports
   a difference forever — one run had 28 permanent false positives, which is the
   same as having no drift check at all. **Decide this before the first pattern is
   written.** Doing it afterwards cost 73 renames across patterns, templates, CSS
   and JS, and a regex missed seven of them because the class was split by a PHP
   tag.

## Check the inventory, not the rules you wrote

Reviewing your own work confirms that what you wrote is right. It cannot tell you
what you never wrote. Two defects in one run came from exactly that gap: the hero
was the only top-level section without `align:full`, because it did not look like
a section in the source and so fell outside the skeleton convention — and a
decorative line that appears beside every section, in the hero and in a divider,
was carried across in one place, because a rule was mapped rather than the element
counted.

So verify by enumeration, from the source's side:

- **list every top-level section** and confirm each one is full-bleed, on the same
  skeleton, with the same left edge — as a list, not as an impression;
- **for any repeated decorative element, count its occurrences in the source** and
  match that count in the port. One instance carried is the usual result of
  reading a rule instead of the inventory.

The rule of thumb: if a check can only be answered by looking at what you built,
it cannot find a missing thing. Start from the design's list.

## The ownership pass — this is what gets checked

**Before writing any alignment inside a core block, read the parent's computed
`display`, `flex-direction` and `gap` on the live page.** Not the source's — the
built page's. Core rewrites the axis without saying so: inside the open overlay it
makes every menu item a column, and a chevron styled as a row element with
`margin: 0 0 0 auto` then lands *under* its label rather than beside it. Writing
`margin-left: auto` at all is the tell — it assumes a row nobody verified.

This is the third port in a row where core added geometry that was never asked
for: `has-background` adding padding, `blockGap` on a flow layout serialising as
`margin-block-start`, now the overlay flipping the axis. The pattern is reliable;
the reflex to check for it is not. Reading three computed properties off the
parent costs one line and settles it.

Grepping core's stylesheet is the weaker version of this and still worth it when
hunting a specific rule. Five minutes, and it is the cheapest minute in the whole
port. Core attaches geometry
nobody asked for, and the symptoms scatter: a single rule,
`.wp-block-group.has-background{padding:1.25em 2.375em}`, showed up in one port as
a play button 78×42 instead of 40×40, a benefit icon at 76px instead of 40, a
navbar shifted 38px, and part of a 126px overflow — four separate investigations,
one cause, found last. Reading core's rules for the classes you are about to
style turns all four into a value you already knew.

Grep the stylesheet for every class the section uses, read each surviving
declaration, and ask: is there a block control for this? Anything left is either
impossible or a value the designer cannot reach.

**A preset is only right where the design varies the value the same way.** A
token that shrinks at each tier is correct for something the design shrinks at
each tier — and wrong for a gap the design holds constant, which then quietly
collapses on a phone. Before mapping a value to a preset, check what the source
does with it across the ladder; if the two disagree, write the literal. One run
mapped footer gaps to a shrinking scale and paid for it with a full re-check at
568.

**Audit it mechanically, per section, before moving on.** This rule is broken more
often than any other in this file, and always for the same reason: writing a
plain CSS rule feels tidier than filling seven screens of a panel. It is not
tidier — it is a value the designer cannot reach, and it is the single complaint
that has come back in every port. One designer opened any block on any page and
found every field empty.

So grep the section's own CSS for the properties that are not allowed to live
there and read the result as a list:

```bash
grep -nE '(^|[^-])(padding|margin|gap|row-gap|column-gap|width|min-width|max-width|height|min-height|max-height|flex-direction|justify-content|align-items|flex-wrap|text-align|object-position|border-radius|background-color|color|font-size|line-height|letter-spacing)[^-a-z]' assets/css/sections.css
```

Every line it returns is either moved onto the block or names, in a comment, which
row of "What goes where" keeps it there. An empty result is the target; a long
result means the section was styled in CSS and the sidebar is decorative. Do this
while the section is fresh, not at the end — at the end it is a migration.

**Onto the block, through the panel:** padding · margin · gap · width, min and
max · height, min and max · direction · distribute · align · wrap · text
alignment · crop · visibility — every one at every screen the source sets it on.

**Onto the block, through core's controls:** background · gradient · text
colour · border colour, width and style · radius · font family, size, weight,
line height, tracking and case.

**Into a block style:** pseudo-element decorations, masks, `backdrop-filter`,
`box-shadow` where the theme has no shadow presets, hovers and pressed states —
anything several blocks share and no control holds.

**Stays in the stylesheet, as the part's own rule:** grid template areas and
column count per screen (core's grid has one count for every width), the order of
children, absolute and sticky placement, `overflow`, `object-fit`, and everything
a `render.php` draws.

**Must NOT go inline:** anything a `:hover` or a JS state class repaints — an
inline value kills it. That is a block style with the state inside it; if the
resting value is on the block, the state rule needs `!important` to beat it.

**Scope breakpoint-specific rules inside their media query and check the leak
both ways** — a drawer rule outside `@media` drew a 320px panel into the desktop
header; a desktop `display:grid` leaked into the drawer and held it open.

## Read the value back — a rule that was written is not a rule that applies

Writing the right declaration is half of it. The other half is confirming the
browser agrees, because a heavier selector somewhere else can take a single
property away and leave everything around it working. That failure is quiet by
design: the layout is nearly right, the transition still runs, nothing errors —
only one number is somebody else's.

So for the values that carry geometry — anything an offset, a clip, a hidden
state or an alignment depends on — read the computed value off the built element
and compare it against the source's number. It is one browser call for a whole
list of properties, so it costs almost nothing when folded into the pass you are
already running:

```js
const el = document.querySelector(sel), cs = getComputedStyle(el)
;['marginLeft','paddingLeft','overflow','display','position'].map(p => [p, cs[p]])
```

Two winners account for most of these, and the second is self-inflicted. One is
core, with a heavier selector. The other is **the panel's own value, serialised
inline** — the moment a padding is made editable from the sidebar, it outranks
every stylesheet rule including the media query written for it. A footer column
carried `padding-left: 112px` inside `@media (min-width: 1440px)`, correctly, and
never applied it, because the block also carried a padding from the panel. That is
the price of editability, and it is paid with an `!important` on the responsive
override — but only if someone notices, and noticing means reading the value back.

If a value disagrees, **find the rule that won rather than guessing at weights**:
walk `document.styleSheets`, keep the rules whose selector the element matches and
whose text mentions that property, and read them in order. That prints the winner,
its selector and its file, in one pass — no knowledge of core's stylesheet
required, and it works the same on the next project, where the selector will be a
different one.

Then out-weigh it deliberately, or better, find the block attribute that makes
core write your value itself.

A real one, to show the shape: a submenu link was given `padding-left: 0` so a
4px dot plus its 12px gap could hide behind a `-16px` margin. Core's own rule for
that link carries one more class and sets `1em`, so the link kept 18px of left
padding, the dot sat 2px inside the visible box instead of just outside it, and
the hover — which only removes the negative margin — pushed the whole row right.
Everything about the effect was built correctly; it started from the wrong
coordinate. Reading back `padding-left` would have said so in one line.

## Do not win a specificity war — avoid it

Core inflates specificity on purpose: doubled class names, sibling-plus-state
selectors, `:where(:not(...))` chains, `!important` on preset colour classes.
**Count core's selector before writing against it.**

Better: **find the attribute that makes core write the rule for you.** A
transparent overlay was three failed CSS attempts and then
`overlayBackgroundColor: transparent` — core emits its own `!important` preset
class, and the value lands in the sidebar. Order to try: block attribute →
`theme.json` → a counted selector.

## Icons — the usual source of invalid blocks

Hand-written inline `<svg>` inside a static core block is the single most common
cause of *"Block contains unexpected or invalid content"*, and it clusters wherever
the design has icons. The mechanism: validation re-runs the block's `save()` and
compares the whole markup, and arbitrary SVG is not something a paragraph or a
heading can regenerate from its attributes — so the saved markup and the produced
markup differ, every time, for every icon.

Three forms that are safe, in order of preference:

1. **An `.svg` in the Media Library placed as a `core/image`.** Validated shape,
   and the designer can swap the file. Needs `templates/svg-support.php`.
2. **A pseudo-element** with the icon as a `background-image` or a `mask`, on a
   block that has real content. Right for small repeated marks — chevrons,
   bullets, arrows.
3. **A dynamic block** (`render: file:`, `save: null`). Never validated, so it can
   emit whatever markup it likes. Right for an icon that takes a name as an
   attribute and is used dozens of times.

**Never** paste SVG into a paragraph, a heading, a button label or a group's
inner HTML, and never reach for `core/html` to hold it.

If a design uses an icon font, replacing it with SVG is usually right — but that
is a note in passing, not a question.

## Sliders, carousels and marquees

**A slider is a scroll container, not a block.** The slides stay real blocks —
a Query Loop when they are records, a Group with inner blocks when they are not —
and the sliding is CSS plus a short script. Wrapping the whole thing in a custom
block takes every slide out of the designer's hands, which is the one outcome
worth avoiding; a library like Swiper does the same and adds a dependency for
behaviour the browser already has.

The mechanism, in full:

```css
.slider-track {
	display: flex;
	gap: /* the design's */;
	overflow-x: auto;
	scroll-snap-type: x mandatory;
	scroll-behavior: smooth;
	scrollbar-width: none;            /* the design's scrollbar, if any */
}
.slider-track::-webkit-scrollbar { display: none }
.slider-track > * { flex: 0 0 auto; scroll-snap-align: start }
```

The arrows are buttons calling `track.scrollBy({ left: step, behavior: 'smooth' })`
where `step` is one slide plus the gap, read from the first slide's width. Dots
come from an `IntersectionObserver` on the slides, not from a counter the script
keeps — a kept counter drifts the moment someone swipes. Disable an arrow at the
end by comparing `scrollLeft` against `scrollWidth - clientWidth`.

This survives the things that break homemade sliders: a touch swipe works with no
code at all, keyboard and scrollbar work, and the canvas shows the slides laid out
in a row, which is what a designer wants to edit.

**Take autoplay, loop, timing and slides-per-view from the source, and nothing
else.** Webflow's `.w-slider` carries its own settings, so read them rather than
choosing: autoplay on or off, delay, whether it loops, how many slides show at
each tier. No autoplay unless the design has it.

**Do not add `overflow: hidden` unless the source has it.** A design that lets
slides bleed past the container edge does that deliberately, and clipping them is
an invention — this one has already shipped once, and twice in the same run.

**A marquee is not a slider.** An endless ticker is one CSS animation translating
a track that contains the content twice, with `prefers-reduced-motion` honoured.
No observer, no script, no snap points. Take the distance and duration from the
source — they are usually in the interactions payload, expressed as a pixel offset
and a duration, not as CSS.

## Hover and state effects — extract them, build them, then prove them

A hover is not decoration and it is not optional polish. It is what tells the
visitor a thing is clickable, and it is the part of the design a static screenshot
cannot argue for. In several ports hovers were carried across incompletely and
then listed as "not verified" at handover, which means nobody ever checked them —
not the port, not the review.

**Absence has to be proven in both places before anything is deleted.** Roughly
half of a design's behaviour is not in the stylesheet: hovers, clips, scroll
reactions and state changes live in the interactions payload. So "the source does
not have this" is a claim about two files, and made from one it is usually wrong.
One run deleted a card's white hover text as an invention and told the designer
the design had no hover; it had one, in the animations, and the matching black
background was already written thirty lines above — it only lacked an
`!important`. Half an effect was removed, and a false statement about the design
was made on the way.

Two rules follow, and the second is about what you say:

- **Before deleting a rule, find the effect it belongs to.** A white text colour
  with no visible background is not a stray value; it is one half of a pair whose
  other half is losing. Look for the partner before removing the survivor.
- **Never tell the designer what the design contains without having looked in
  both places.** They know their own file. A wrong claim costs more than the
  defect did.

**Carry exactly what the source declares — not less, and not more.** Everything
below is about not losing a state; this line is about not inventing one. A hover
that is not in the source does not exist, and **the absence of a `:hover` rule is
itself a value**: it means nothing happens. If the design's hover changes the
label and nothing else, then the label changes and nothing else — no colour shift,
no underline, no lift, no fade "so it feels responsive". Copy the declarations
that are in the rule, one for one, and stop there.

The same holds for house conventions. A project may carry its own design ruleset
about hovers, spacing or defaults; in a port it does not apply. **The source is
the specification**, and an improvement on it is a defect with a nicer motive —
the designer then has to find it and ask for it to be removed, which costs more
than it ever added.

For every interactive element, answer all four:

- **What changes colour** — background, text, border, an icon's fill. Note the
  exact from-value and to-value; "it gets darker" is not a value.
- **What appears** — an arrow, an overlay, a caption, a shadow, an underline that
  grows from one side.
- **What disappears** — and whether the space it occupied collapses or is held.
- **What moves or scales** — how far, and in what direction. Record both
  positions as numbers: a hover is very often the *removal* of a resting offset,
  not the addition of a new one, and building it the other way round makes the
  element jump the wrong way.

**Media that plays on hover must not play at rest.** A card showing a poster
image, swapping to a silent looping video under the cursor, with its play control
changing at the same moment, is a single design with three synchronised parts —
and it is routinely built as a video that simply plays forever with a static
button beside it. That is the same flattening as the marker above: the hover's
end state became the resting state. At rest the poster is what shows, and the
video does not run — ideally is not even fetched. Each of the three parts is read
from the source separately, because they are three declarations, and dropping any
one of them leaves something that half works.

**And if the card is a link, it is an `<a>`.** The whole card, wrapped or
stretched, with a real `href` — not a click handler, not a button that navigates.
Anything else means no status bar on hover, no middle-click, no open-in-new-tab,
and nothing at all for a keyboard. Where the click opens a video rather than a
page — a lightbox, an embed, a YouTube URL — that destination is a value in the
source too: read which it is instead of picking one, and if the source's
mechanism cannot be reproduced, say so rather than substituting silently.

**Prove the resting geometry, not just the transition.** Where an effect works by
hiding something outside a clipped box — a marker, an arrow, an underline that
grows in — check at rest that the thing really is outside: compare its rect
against the clipping container's edge, and read back the padding and margin that
put it there. "The hover animates" is not evidence; an effect that starts from
the wrong coordinate animates just as smoothly.

**A card that is a link almost always scales its image.** This is the single most
common one, and the single most commonly missed: the whole card is an `<a>`, the
image inside sits in a wrapper with `overflow: hidden`, and on hover the image
goes to roughly `scale(1.05)`. Miss the `overflow: hidden` and the image grows out
of its card instead of filling it. Check every linked card, every thumbnail, every
portfolio tile — and take the actual scale value from the source rather than
assuming 1.05.

Two rules for building them:

- **The state lives in a block style, never in a block attribute.** An inline
  value from the sidebar wins over the `:hover` rule and kills the effect
  outright. Register the hover as a style the designer picks by name — "Zoom the
  picture on hover", "Fill on hover" — so the next card can have it too. Take one
  house value per effect from the source (a zoom of 1.05, not 1.05, 1.06 and 1.08
  on three cards) and ask when the source itself drifts.
- **Transition the element that changes, not its parent.** Transitioning a wrapper
  and animating a child produces a hover that fires once and then stutters.

Give every one of them `:focus-visible` as well as `:hover`. A keyboard user
gets nothing from a hover, and it costs one selector.

## Graphics are real, visible, swappable

Artwork → Media Library + `core/image`. Dots, rules, bars → pseudo-element on a
block with content, or `core/separator`. **Chips and badges → a Group with the
words in a Paragraph inside it**, because `core/paragraph` has no border support
and a border and a radius are what make a pill a pill; the dot, if there is one,
is a block style. **Never an empty Group** — it renders as the layout
placeholder — and never an empty element for a scrim or a wash: an empty element
has no block, so the conversion drops it and white text ends up on a white
photograph. A scrim is a `::after` in a block style.

**A group given a background takes `padding: 0` with it, written on all four
sides**, unless the source pads it. Core pads every `.wp-block-group.has-background`
with `1.25em 2.375em`, so a 44px icon box becomes 78px the moment its colour moves
onto the block. A fixed-size flex item also needs its `min-width` set to its
width in the panel, and the sibling that fills the row `min-width: 0`.

An overlap margin belongs on the figure, not the `<img>`.

**An image that must fill its cell says so in its attributes, not in CSS.** Set
`aspectRatio` and `scale: "cover"` on the `core/image` — the two controls that
appear in the sidebar as the ratio and the "Cover" fit — or use `core/cover` when
something sits on top of it. Writing `width: 100%; height: 100%` on the figure
instead loses, because WordPress prints `width` and `height` attributes on the
`<img>`, the browser turns them into an `aspect-ratio`, and inside a grid or flex
cell that intrinsic ratio outranks the percentage. The picture then sits smaller
than its cell with space around it, most visibly in the editor.

Two more things to check when a picture will not fill: the grid item stretches but
the `<figure>` may not — it needs `height: 100%` — and with `isLink` on, the thing
inside the cell is the `<a>`, so anything written for the image lands one level
too deep. `probe.js` reports this as `fills: false`.

**Anything positioned absolutely must be anchored in a way the editor also
obeys.** In the canvas core anchors every block root with
`.block-editor-block-list__block{position:relative}` at (0,1,0), so an absolute
child resolves against core's box instead of yours, and the designer sees the
element floating over a neighbouring section — a shape sitting on top of the
section above, a badge halfway down the page. The front end being correct proves
nothing here.

Two things make it match:

- **Put the positioned element inside the block that positions it**, not beside
  it. Its offsets and percentages resolve against the nearest positioned ancestor,
  so the container is part of the value.
- **Declare `position: relative` on that ancestor with more than one class**, or
  prefixed with `body`, so it beats core's (0,1,0) instead of tying with it and
  losing on order.

Check every absolutely positioned element in the canvas, one by one. This is a
known repeat defect, not an edge case.

Say plainly what the canvas genuinely cannot show — `position: fixed` and scroll
state — and nothing more. Hovers **are** checkable, and Step 13 checks them.

---

# Step 8 — reusable content

## The templates a theme owes, beyond the pages it was asked for

A port that builds only the pages in the design ships a theme that falls back to
WordPress's own markup the moment anyone leaves them — and the first person to do
that is the client. Three templates carry the design or they carry nothing:

- **`404.html`** — the site's own header and footer, a line in plain words, and a
  way onward: home plus the two or three pages people actually want. Then request
  a URL that does not exist and look at it.
- **`search.html`** — the query the theme cannot style out of existence. If the
  header has a search field, this page is reachable from every page on the site.
- **`archive.html`** (and `index.html`) — the listing behind every category, tag,
  author and date. It inherits the card the design already has for the collection
  rather than inventing a second one.

If there is genuinely no search on the site, say so rather than leaving a
half-built search page behind — an orphan template is worse than none, because it
is reachable by URL and looks abandoned.

## A block has to survive the client editing it

Everything a run builds is tested with one item in it and looks right. The
question that matters is what happens **after** the client adds a fourth card, or
deletes the second: a row of three built as three fixed columns breaks on the
fourth, a slider with a hard-coded count stops at three, a grid with a background
sized to its content leaves the fourth item outside the panel.

So before a repeating block is called finished, add an item and remove an item in
the editor and look at the result. It is thirty seconds, and it is the difference
between a theme that survives its first week and one that comes back.

The same reasoning is why a section that repeats **is a collection or a pattern
that takes its items as inner blocks**, never a block with the content baked in.

**A collection is shown by `core/query`, and that is not negotiable.** Every
section listing records — cards, testimonials, team, posts — is a Query Loop with
a Post Template made of core blocks. Writing a custom block to render the loop
takes the whole section out of the designer's hands: no query controls, no order,
no count, no columns, nothing to drag, and every change comes back to you. If a
single field inside the card will not display in the canvas, replace **that
field** and leave everything around it alone.

The exception is narrow and worth naming, so it is not stretched: a design where
one record must render in a genuinely different shape from the rest — a featured
card twice the size, a set that mixes two post types in one visual sequence — may
need a block of its own. That is a section-level decision, taken once, said out
loud, and not the default.

**Synced pattern** (`wp_block`) — Webflow's Component: one content, everywhere.

**Synced pattern with overrides** — Webflow's Component *with properties*, and
usually the right answer. Mark editable blocks inside the pattern:

```html
<!-- wp:heading {"metadata":{"name":"Title","bindings":{"content":
{"source":"core/pattern-overrides"}}}} -->
```

Bindable: `content` on paragraph and heading; `text`, `url`, `linkTarget`, `rel`
on button; `id`, `url`, `alt`, `title` on image. Everything else stays shared.
**Never fork a pattern because two instances have different words** — fork only
when the structure differs.

**Regular pattern** (`patterns/*.php`) — a starting point each page then edits.

**Everything the theme adds lives in one named group in the inserter.** Copy
`templates/inserter-categories.php`, set the label once, and require it from
`functions.php`. Then the client opens "+" and finds a section of their own —
sections in the Patterns tab, custom blocks in the Blocks tab — instead of hunting
through core's list.

Two registries, and both are needed: `block_categories_all` for blocks and
`register_block_pattern_category` for patterns. A block whose category is not
registered falls back to **Widgets**, which is where custom blocks go to be lost;
a pattern whose category is not registered lands under **Uncategorized**.

So every custom block carries `"category": "upqode"` in its `block.json`, and
every section pattern reads `Categories: upqode-sections` in its header. Neither
is optional — a block or pattern outside the group is one the client will not
find, and unfound is the same as not built.

**One pattern per section. Never one pattern per page.** This is the unit that
makes the theme reusable: the designer opens the inserter, sees the sections by
name, and drops a hero, a CTA band or a pricing row onto any page. A page-sized
pattern gives them one item they can use exactly once, and every section inside it
becomes unreachable.

So each section is its own file in `patterns/`, with a header that makes it
findable:

```php
/**
 * Title: Hero — headline, two buttons, video
 * Slug: theme/hero
 * Categories: theme-sections
 * Keywords: hero, banner, intro
 * Viewport Width: 1400
 */
```

- **Title** is what the designer reads in the inserter, so it says what the
  section *is*, not `hero-2`.
- **Categories** — register one category for the theme
  (`register_block_pattern_category`) so all sections group together instead of
  scattering through core's list.
- **Viewport Width** sets the preview width; without it a full-width section
  previews as a squashed strip and looks broken before it is used.

**The page is composed of those patterns, not written instead of them.** If a
page starter is wanted as well, it is a pattern that *references* the sections
rather than repeating them:

```
<!-- wp:pattern {"slug":"theme/hero"} /-->
<!-- wp:pattern {"slug":"theme/services"} /-->
```

That way a change to a section is a change in one file, and the starter cannot
drift away from it.

**Custom post type** — Webflow's Collection. Start from
`templates/register-cpt.php`, and set its one switch first:
`THEME_PREFIX_THING_HAS_PAGE`, from the structure plan's answer.

### A collection without pages of its own

Most collections are data, not pages: the team, the FAQ, testimonials, logos,
events shown only as cards. **An entry of such a type must not be reachable at
any address** — not by its pretty URL, not by `?p=123`, not by
`?post_type=<type>`, not through its grouping's archive — and it must not be in
the sitemap, the site search, a "View" link or a preview. This is decided at
registration and proved by requests; it is never patched with a noindex.

**The halfway case, and it is common: a type whose entries *do* keep an
address.** Sometimes the addresses cannot be taken away — a Query Loop falls back
to `post` for any type that is not publicly queryable, so closing them would take
the listings with them. Then the entry keeps its URL and makes **two** statements
instead: `noindex` for a crawler that arrives, and out of the sitemap for the
list a crawler works from. One without the other is not enough. `follow` stays
on, so a link out of the entry still counts.

Decide **which** collections those are from the theme, not from a list kept by
hand: a collection shows an entry of its own exactly where the theme has a
template for it — `single-<type>.html` — and where it does not, it never meant
to. The exception to watch for is a type that *has* such a template while only
some of its entries use it; those are answered one at a time, from whatever
switch the entry carries.

Without this, a site hands a search engine a few dozen pages that are a heading
with a sentence under it — a testimonial is a sentence, a question is a question
— each offered as a page of the site.

The template does all of it when the switch is `false`. What each piece is for,
so nobody "simplifies" one away:

| Setting | Why |
|---|---|
| `public => true`, `publicly_queryable => true` | **LOAD-BEARING.** A Query Loop silently shows blog posts for a type that fails `is_post_type_viewable()`. Turning these off "to hide the pages" turns the team on About into the blog. |
| `rewrite => false`, `query_var => false` | no pretty URL, no `?thing=slug` |
| `exclude_from_search => true`, `show_in_nav_menus => false` | not in the site search, not offered in Menus |
| a guard on `template_redirect`: `is_singular( type )` → 404 | `?p=123` and `?post_type=…&p=…` need no rewrite and still reach the entry |
| the same guard: `post_type` **in the address** → 404 | `/?post_type=<type>` is a separate door: with no archive, WordPress answers with the blog template listing every entry, a 200 page made of 404 pages. Read `$wp_query->query['post_type']` — what was typed — never `query_vars`, which carries every `pre_get_posts`; a theme that sets search types there 404s every search. |
| no "View" / "Preview" in row actions, the admin bar and the editor | there is nothing to view |
| out of `wp_sitemaps_post_types` **and the SEO plugin's own** — `wpseo_sitemap_exclude_post_type` (Yoast), `rank_math/sitemap/exclude_post_type` (Rank Math), same two arguments either way | the plugin otherwise publishes the type, and a type with no permalinks goes in as raw `?post_type=slug` query URLs. Answer both, because the plugin can be swapped and the setting that hides it in the plugin's own UI can be lost; the theme's answer survives |

**Its grouping taxonomy** follows the same logic: `public => false` **with
`publicly_queryable => true`** — a Query Loop filtering by a taxonomy that fails
`is_taxonomy_viewable()` drops the filter silently and returns every entry — plus
`rewrite => false`, and the guard refuses `is_tax()` for the
`?taxonomy=…&term=…` form. Out of both sitemaps.

**Prove it, every time:** `theme_prefix_check_thing()` requests every door and
expects 404, requests a site search and expects 200, and the sections that list
the entries are counted before and after — a Query Loop builds its own
`WP_Query` and never reaches `template_redirect`, but that is measured, not
assumed.

A type whose entries are **sometimes** a page (an offer that is a card or a
card with a page behind it) keeps its pages and excludes the cardless entries by
id (`wpseo_exclude_from_sitemap_by_post_ids`) — and leaves the sitemap as a type
when no entry has a page at all.

### Fields speak the client's language

**A collection is finished when its fields have labels the client would say out
loud.** The raw "Custom Fields" table — `theme_team_role` in a name column — is
WordPress's fallback, not an interface: the client mistypes a key once and the
field "stops working" with no error anywhere. The template hides it in both
editors while keeping the `custom-fields` support REST needs. Never remove the
support to hide the table.

**Name every field when it is created, not in a renaming pass at the end.** One
port agreed to rename 25 section headings and ~380 field labels from developer
wording, and at handover none of it had been done — a pass at the end is a pass
that does not happen.

| Write | Never |
|---|---|
| Job title | role, subtitle, `xx_person_role` |
| Photo | featured image, thumbnail, media |
| Button text / Button link | CTA, CTA label, cta_url |
| Small line above the heading | eyebrow, kicker |
| Show five stars | hide_stars, rating flag |
| Order on the page | menu_order, sort, priority |
| What we offer — list | repeater, items, array |

- **The label is the thing as the client calls it**, in the site's language,
  sentence case. If the client or designer uses another word, theirs wins:
  explain the difference once, then do it their way.
- **`help` says where it shows and what empty does**: "Shown under the name on
  the team card. Leave empty and the card shows only the name."
- **A checkbox reads as a statement that is true when ticked** — "Show five
  stars", "Coming soon" — never a negation.
- **One list of fields feeds every screen**: the entry form, the list's columns,
  the "Needs" column, any block's sidebar. A field is called the same thing
  everywhere, and renaming it is one edit.
- **Post type labels too** — every one WordPress shows (`add_new_item`,
  `not_found`, `item_updated`, `featured_image`…), or the screen says "Add New
  Post" and "Post updated" over a team member. The template lists them all.
- **Grouping headings** over a long form are the client's words as well — what
  the section of the page is, not what the code calls it.

**Where the fields go.** For a collection without pages the fields *are* the
entry: a full-width box under the title, grouped under headings, not the 265px
sidebar — one collection measured 21 screens tall in the sidebar. For a
collection with pages the entry is built from blocks (the rule in "Defects, not
trade-offs"), and
only what the card needs that no block holds stays a field.

**Read every entry screen out loud before handover.** A key, an abbreviation, a
"Field label" placeholder or a word only a developer would use is a defect.

Two things to check once the panel exists: the fields appear **on a new entry**,
not only on one that already has values, and a field left empty renders nothing
rather than printing its own key. **Build it when the first section that queries it
is written, not before**: registration is quick, importing content is not.

**And the list screen is not finished by default — it is where the client lives.**
The entry editor gets all the attention and is opened occasionally; the list is
the screen they land on every single time. WordPress gives it Title, the taxonomy
and Date, which for a photograph-led collection says almost nothing, and one port
shipped exactly that.

Four columns, all built from the same config that builds the fields, so a new
field needs no second edit:

| Column | Why |
|---|---|
| Photo | The cards are photograph-led; the client cannot recognise an entry by its title alone, and a missing image is invisible otherwise |
| Every checkbox field | "Coming soon", "Show five stars" — flags that change the page and had no representation at all |
| Order | See below |
| Needs | What this entry is still missing, by field label, or "Complete" |

**Sort the list by `menu_order`, the way the front end does.** This is the one that
actually bites. The site orders every collection by `menu_order`; wp-admin
defaults to date. A client who sets an Order value then sees the list unchanged
has no way to tell whether it worked, and no way to see the running order at all.
One `pre_get_posts` that sets `orderby` when the client has not asked for another
— and make the column sortable so they can still choose.

**The "Needs" column shares its rule with the build-time verifier** — one function,
two readers. Two rules it must respect or it cries wolf: a checkbox is never
missing, it is off; and a genuinely optional field left empty is a choice, not a
gap. Mark those `'optional' => true` in the config. A port shipped this column
flagging "Photo focal point" — whose own help text says *leave empty for centre* —
on every entry that had sensibly left it empty.

**The structure plan is a required stop, not a judgement call.** After the
analysis, before writing any section, send one message listing every repeating
structure and its proposed treatment:

    Classes (5 items, same fields)      → collection
    Testimonials (6 items)              → collection
    CTA band (2 pages, different copy)  → synced pattern with overrides
    Feature row (3 cards, one-off)      → plain pattern

Then wait. One interruption, early, covering everything — not a question per
structure, and never a silent decision. "It looked obvious" is how a one-off row
becomes a collection nobody wanted, or four cards that will change monthly get
frozen into a pattern.

Five silent traps — `'custom-fields'` in `supports`, `publicly_queryable`,
`excludeCurrent: false`, wrapper-dependent selectors, and the `<li>` being the
grid item — are in `reference/traps.md` → "Collections". Read it before
investigating a collection that renders identically across records.

---

# Step 9 — forms

**Contact Form 7 is the default, and it is still a question.** Say which plugin
you are going to use rather than opening a menu — but report how many forms,
which fields and where the source submitted, and wait.

**Why a plugin and not a handler in the theme:** the same reason SEO is a plugin
(Step 11). A form's fields, its recipients and its stored submissions are
**content and configuration, not presentation**, and a theme switch must not take
them away. A handler in the theme is the narrow exception — one form, fixed
fields, nothing stored, and said out loud as a deviation — not a peer option.

Then ask, and do not assume any of it:

- **where submissions go.** Default the site admin address, **never hardcode
  one**, and keep it an option so the client can change it without an editor.
- **whether submissions are also stored** in the database.
- **whether the designer wants any integration at all.** Default: none. A CRM, a
  mailing list or a webhook is a decision, not a convenience.

Say out loud that **mail from a fresh host lands in spam without SMTP**, and that
a spam guard is part of the form rather than an afterthought. File uploads,
multiple steps or payment are the cases where the plugin's own add-ons earn their
place.

**Never actually send while testing.** A real submission on a client's form
reaches a client's inbox, and that cannot be taken back.

The states, the `tabindex` rule and the accessibility of the error messages are
`reference/forms-and-motion.md` — and all three are specific to Contact Form 7's
markup, so re-read them if a project uses something else.

---

# Step 10 — animations

Webflow interactions are rewritten by hand in plain JS: `IntersectionObserver`
for reveals, CSS transitions for hover, `requestAnimationFrame` for anything
continuous.

🔴 **The resting state of a reveal belongs in CSS, not in the script.** A script
that hides elements by writing `opacity: 0` on them runs **after the browser has
already painted the page**: the visitor sees the finished page, it drops to
nothing, and only then does it rise. About a second of that, on every page, and
it survived a whole port before anyone named it — because it looks like a slow
page rather than a bug.

So the hidden state lives in the stylesheet, where it applies **before the first
paint**, hanging off a class. Three conditions on the class, and each one is
there because of a way this fails:

- **it is set in the `<head>`**, inline, so it lands before any of the page is
  drawn — a request for a file would defeat the point;
- **only when the browser has what the animation needs** (`IntersectionObserver`,
  typically), because that is the one thing the script gives up on, and a flat
  rule would otherwise leave the site hidden with nothing to reveal it;
- **it is taken off again after a few seconds** if the animation script never
  announced itself, so a script that fails to load costs an animation rather than
  the page.

**Durations, distances, delays and easing come from the source, like every other
value.** There is no house timing. This file used to carry one — "slower and
softer than the source", 700–900 ms reveals, an 80–120 ms stagger — and it did
exactly what any invented value does: one port shipped 24px reveals with a made-up
stagger and no first-screen delay, where the design said 15px, 800 ms, ease and a
600 ms delay, and left a comment in the theme calling it a knowing deviation. A
deviation recorded in a comment is still a defect; the designer still has to find
it and ask for it back.

**A resting value that looks like a start state is not the design's value.** A
rule that reads `width: 0`, `scaleX(0)`, `opacity: 0`, `height: 0` or a transform
that pushes an element off its place is where an animation *begins*; the design is
what it looks like when the animation has finished. Copy the resting value alone
and the result is a permanent stub — the full-width divider that draws itself on
scroll comes out as a 100px line, forever, and it looks like a sizing bug rather
than a missing animation.

Two rules, and the second matters more:

- **Whenever a value looks like a start state, go and find the interaction.** It
  is in the payload, not the stylesheet, and it names the end value.
- **If the animation is not reproduced, ship the element in its END state.**
  Never leave it at the start. A line that is simply full width is a small,
  honest deviation; a line stuck at 8% is a defect the designer has to report.

**Enumerate the interactions, then reconcile the counts.** Absence is invisible:
an animation that was never carried across looks exactly like a design that never
had one, so nothing in the port can point at it — only a comparison of lists can.

1. List every `data-w-id` in the page's markup and look each one up in the
   payload.
2. **Expand each interaction to the elements it actually animates.** The
   attribute marks the *trigger*; IX2 targets are frequently something else —
   children of the trigger, or every element of a class, so one attribute can
   drive a dozen elements. Reading triggers alone is the usual reason "some
   elements were skipped": they were animated in the source by an interaction
   whose trigger sits elsewhere.
3. **Count both sides and print the numbers.** N elements animated in the source,
   N carrying the reveal in the port. Equal, or a list of which ones are missing —
   never an impression that it looks about right.

About five minutes for a whole page, and it is the only check that can find an
animation that is not there.

Read the interaction's numbers from the source. Webflow keeps them in its
interactions payload — the `webflow.*.js` chunk — not in the stylesheet, so a
conclusion of "there is no animation here" drawn from the CSS alone is worth
nothing. If the numbers genuinely cannot be recovered, say so and ask, rather
than choosing pleasant ones.

Put the curve and the durations in `settings.custom` so they are editable.

**An arrival is set in UPQODE Animations, on the block — never typed as a class.**
Fade in on load, Fade in on scroll and Line draws itself cover what these designs
use; the source's distance, duration and easing go into the panel's settings,
and its delay and stagger into each block's delay and step. The panel writes the
class at render, so the designer sees every arrival in the sidebar and can add
one to a new block. A server-rendered block's own wrapper never hard-codes an
arrival in its `render.php`: it takes the same attribute, or every instance
animates whether anyone wanted it to or not. Only markup that is not a block —
inside a `render.php` — carries the class directly. A component's own keyframes (a
ticker, a hero zoom, a spinner) belong to the component and never appear in the
panel.

**Every animation hook is a class, never an attribute — and grep that it matches
something.** The source hangs its animations on `data-reveal`, `data-hero-rise`,
`data-delay`; a `core/group` cannot emit an arbitrary attribute, so CSS copied
across in that form is dead the moment it lands. One theme carried a complete,
correct load-rise rule written as `[data-hero-rise][data-delay="120"]` — nine
elements' worth of animation in the design — and it matched nothing on any page,
for two pages, while every check passed. Nothing errors: the elements simply
appear instead of rising, which is indistinguishable from a design that has no
animation.

So after writing any animation CSS, count both sides on the built page:

```js
[ '.your-reveal', '.your-rise' ].map( s => [ s, document.querySelectorAll( s ).length ] )
```

A zero there is the whole feature missing. Do this as part of the build, not at
verification — the elements are what the pattern has to carry, and a pattern
written without them has to be reopened.

**And a hidden state gated behind the script's mark must be one the script owns.**
The gate exists so the canvas is not blank; it costs a flash on every load,
because the mark lands after first paint. A declarative animation that ends
visible — a load rise, a rule that draws itself — needs no gate: it completes on
its own and its end state is correct. One run gated a load rise and got a banner
that painted, dropped to `opacity: 0` when the class arrived, then rose.

**The script owns the hidden state — never the stylesheet.** This is the single
most damaging animation mistake, because it does not look like an animation bug:
it looks like the port is empty. A reveal written as `.reveal{opacity:0}` in the
theme's CSS, revealed by a class the JS adds, is invisible **everywhere the JS
does not run** — and the editor canvas is exactly that place. `add_editor_style()`
loads CSS into the canvas and never loads a script, so the designer opens the page
and finds section after section blank or white, with the markup perfectly intact.
It also stays blank if the script fails, arrives late, or is switched off.

So: the script marks the document — a class on `<html>` — and only that mark
brings the hidden state into play:

```css
.js-reveal .u-reveal { opacity: 0; transform: translateY(24px) }
.js-reveal .u-reveal.is-shown { opacity: 1; transform: none }
```

No script, no mark, nothing hidden. The same rule covers every other state a
script toggles — a scrolled header swapping two logos or two buttons by opacity,
a tab panel, an accordion, anything whose resting appearance depends on JS having
run. In the canvas none of it runs, so whatever CSS hides at load is hidden for
good.

**Animate only `transform` and `opacity`.** Anything already on screen at load is
not a scroll reveal — show it immediately. Zero-area elements are marked shown,
not observed. Reveal once. Keep a failsafe timeout, and prove the initial pass by
pushing the failsafe far out temporarily.

Disable heavy motion at tablet and below unless the design shows it. Honour
`prefers-reduced-motion` — an accessibility requirement, not a nicety.

**A scrolled header changes at the first scroll, not after the hero.** The design
switches the bar — background, logo, link colour, height, shadow — within the
first few pixels of movement. The usual implementation watches the hero with an
`IntersectionObserver` instead, so the change waits until the whole hero has gone
past, and the designer scrolls a third of a page through a bar that is still in
its transparent-over-photo state. Take the threshold from the source: it is a
small `scrollY` number, often the header's own height, occasionally zero. Compare
against it directly.

Two details that make it behave:

- **Evaluate once on load, before any scroll happens.** A page can be opened
  already scrolled — a refresh, a link with a fragment, a restored position — and
  a header that only listens for the event starts in the wrong state.
- **The state is a class on the header**, not a style written by the script, so
  the appearance stays in CSS where the design values live.

**Every interaction is verified running, not read in the code.** Write the list
while building — one line per effect, where it is and what it should do — and walk
it in the browser at Step 13. An animation that was written and never triggered is
an animation that does not work: reveals that never fire because the element was
already on screen, a stagger that lands all at once, a panel that opens but never
closes, a hover that fires once and then stutters. All of these shipped in ports
where the JS itself looked correct.

---

# Step 11 — review, then alt text (SEO on request only)

**Stop here first.** The page is built: hand it over with a link and wait for
corrections. Waiting is required even if nothing looks wrong. Alt text goes last,
on final content; SEO waits for an explicit request.

🔴 **And when it is requested, SEO is a plugin — never theme code.** No
`inc/seo.php`, no sidebar panel of your own for a title and a description, no
meta fields the theme registers. **SEO data is content, not presentation**, so it
must not live in something a theme switch takes away: the day the site is
redesigned, every title, description, canonical and noindex would leave with the
old theme.

This was built as theme code on one port and the designer pushed it back twice —
*«то може плагін зробити, а не оцей кодом?»* — and she was right. The module, its
panel, its script and its stylesheet were deleted. One install brings Open Graph,
canonical, sitemaps, schema, redirects and noindex together, and they all stay
when the theme goes.

**Write to the plugin's own keys**, read back after writing, and import the
client's sheet by script rather than retyping it. Titles and descriptions
arriving from a client sheet are mapped by hand — a sheet names pages the way a
person does, not the way a slug does, and that mapping *is* the work.

The honest counter-argument, so it is not discovered as a surprise: if the theme
also registers the site's collections, that site is already inseparable from its
theme. It does not change the answer — it only means the theme is holding
something else it should not.

## Harvest the `<head>` and set the site's identity

A port that reads the `<body>` and ignores the `<head>` throws away work the
source already did, and leaves the client a site called "acme" in lowercase with
the WordPress logo in the browser tab. This is not SEO and does not wait for the
SEO request — it is the site having a name.

Read the source's head and carry across whatever is there:

| In the source | Where it goes in WordPress |
|---|---|
| `<title>` | Settings → General **Site Title**, split from any " — Brand" suffix |
| `<meta name="description">` | the page's excerpt, and the SEO plugin if one is installed |
| `<link rel="icon">`, `apple-touch-icon` | **Site Icon** — import the file, do not redraw it |
| `og:title`, `og:description`, `og:image` | the SEO plugin's social fields; the image into the Media Library |
| `<html lang>` | Settings → General **Site Language** |
| `<meta name="theme-color">` | keep it; emit it from the theme |
| JSON-LD / `application/ld+json` | hand it to the designer — it is business data, not markup |

**Two schemas are the theme's job rather than the designer's, because they are
generated from what is on the page:** a page with an FAQ section emits `FAQPage`
built from the accordion's own questions and answers, and every video emits
`VideoObject` **with a `thumbnailUrl`** — the one field that is always left out,
and the one without which the entry is rejected. Both come from the markup, so
they belong to whoever wrote it.

**What the head does not carry is skipped, not invented.** This is rule 11 —
nothing exists that the source does not declare — applied to the head, and it
holds even though the values look easy to derive. A design-canvas export usually
has nothing there: one source's entire head was a charset, a viewport and a
runtime script. The temptation is then to compose a tagline out of the logo, pick
a time zone from the address, and draw a favicon from the wordmark. Don't. A site
name and a strapline are the client's words about their own business, and a
plausible guess is harder for them to notice and correct than a blank.

So: carry across what is there, **skip what is not, and hand over the list** —
"the source declares no title, description or icon; tell me what you want and I
will set them." The designer decides, and it is one small task when they do.

The exception is an explicit ask. *"Design a favicon"* is a request, and then it
is ordinary work: build it from the logo's most distinctive detail, size it so it
survives 16px, and set it through **Settings → Site Icon** so the client can
change it later. Never hardcode a `<link rel="icon">` in the theme — that takes
the control away.

Check the result rather than the setting: `wp_get_document_title()` on the front
page, and the rendered `<title>` in the served HTML. WordPress stores `&` in the
title and tagline as `&amp;`, which is correct — it is emitted into HTML and the
browser shows an ampersand. Do not "fix" it.

Record in the manifest both what was harvested and what the source did not
declare, along with any decision the designer settles by hand — whether structure
is locked, whether the palette stays as it is. A later page then reads them as
context instead of asking the same question again.

**After fixing one, find the rest of its kind.** A defect that reached the page
once usually reached it several times, because it came from a habit rather than a
slip. The next action after a fix is not the next task — it is one search for the
same shape across the project. One run found a container constrained twice in the
hero, fixed the hero, and left the identical skeleton broken in seven other
sections; another fixed an axis confusion in one place and met the same confusion
in the footer later, as a defect the designer reported. The search is a single
command against the patterns or the stylesheet, and it turns one fix into all of
them.

**A defect found on a later page is a defect to look for on the earlier ones.**
Half the faults on one port's second page — a heading split across nodes, a link
laid out with `display: flex`, a menu geometry never measured — had been sitting
unnoticed in the first page since it shipped. The second page did not create them,
it revealed them. So when one is found, check whether the pages already handed
over carry it too, and say so rather than leaving it for the designer to meet
twice.

**Find the cause, and when you find it, remove what you left behind.** A run
spent two rounds guessing at grid rows for a 60px gap, escalated it as an open
question, and the answer was core's `margin-top` on the second child of a group
with `blockGap` — one sweep of computed `marginTop` across the children would have
shown it in seconds. When the cause is finally known, delete the workarounds that
were holding the symptom down and delete the comments explaining the mechanism
that turned out not to be it. A confident comment describing the wrong cause is
worse than no comment: the next person believes it.

**Before changing a value, find every place it is already set.** One run wrote
`about.css` 83 times, and its worst loops all had the same shape: a line-height
set to `1.2em`, then `24px`, then back, because two elements shared a class and
only one was measured; a hover deleted and restored, because the search covered
the stylesheets and the animation lived in another file; and two rules for the
same selector in one file, where the earlier one lost on order and every edit to
it appeared to do nothing.

So the first action of a fix is a search — for that selector across **all** theme
files, not the CSS alone — and a look at every element carrying the class, not the
first. If a value seems not to take, look for a second declaration before writing
a third.

**The second time a fix does not work, measure — do not try again.** A third
attempt at guessing costs more than one reading, and it leaves debris: one port's
stylesheet was written 83 times, much of it untangling earlier guesses rather than
building anything. One failed attempt is ordinary; two means the cause is not
where you think it is, and the next action is a measurement, not another edit.

**A fix is a change, so it gets checked like one.** Widening a logo with
`max-width: none` to settle 1440 broke the same logo at 375, because the real
cause was a narrow column and the symptom was treated instead. Two habits follow:
find the cause before editing the value, and after any fix that touches a shared
property, re-diff the **other** tiers — the one you were looking at is the one
least likely to break.

**A correction is a lookup, not a guess.** The designer reports the *symptom* —
"this is too wide", "the gap is wrong", "that should be hidden". The *value* is in
the source, and the first action on every correction is to run the extractor over
that element's classes and read what the source actually says at that breakpoint.
Then set exactly that.

Never nudge a number until it looks right. Never infer a value from the
screenshot in the report. Never change a second thing "while I am here". A fix
that was guessed will be reported again, and the second report costs more than
the lookup would have.

If the source carries no rule for it, that is the hole case from Step 2: say so,
give what the element inherits, and let the designer decide — do not invent a
value to close the ticket.

**Corrections land on the block, not in the stylesheet.** A CSS patch fixes the
front end and leaves the editor wrong and the value out of reach. Verify each fix
**on the canvas**.

**SEO only happens when the designer asks for it.** Not after the review, not
once the corrections are in — only on an explicit request. Until then, do not
write a single meta field, do not touch `og:image`, do not install or configure
anything SEO-related. Mention in one line that it is outstanding and move on.

Alt text is different: it belongs to the images and is written as part of the
port.

When the request does come:

**SEO: copy, do not generate.** A Webflow head carries title, description, `og:*`
and `twitter:*` already approved. Write to keys the site reads (Yoast, Rank Math,
SEOPress, or theme meta). **Re-host `og:image` locally** — it points at the source
CDN. A field absent from the source stays empty and is reported.

**Alt text, three tiers:** carry over the source's; `alt=""` **deliberately** for
decoration; otherwise look at the image and describe it — never from the
filename. Write it into the Media Library, not the markup. Machine-written alt
goes to the designer as a review list, not silently into the database.

---

# Step 12 — validate

**Run Gutenberg's own parser — it needs no login.** Load the editor's scripts
(`wp_scripts()->all_deps(['wp-block-library','wp-blocks','wp-dom-ready'])`) on a
throwaway page with the saved `post_content` and every `parts/*.html` as JSON,
call `wp.blockLibrary.registerCoreBlocks()` then `wp.blocks.parse()`, and report
every block with `isValid === false` plus `validationIssues[0].args` — the literal
diff. Delete the throwaway files afterwards.

With an admin session, the same answer comes from
`wp.data.select('core/block-editor')…filter(b => !b.isValid)` in the console.

**Copy `templates/validate-blocks.php` — it *is* this check.** It assembles the
harness described above, prints a URL, and the JSON at that URL lists every
invalid block with its literal diff. Writing a validator by hand instead costs a
hundred lines and usually ends up comparing classes, which passes `core/button`
and anything else carrying `__experimentalSkipSerialization` while it is invalid.

**Never "Attempt recovery"** — it patches one page and leaves the pattern wrong.
Fix the pattern, re-run until the list is empty.

---

# Step 13 — verify

**Three checks. Each answers one question, each runs once, and each is a script
whose output is a list of differences or nothing.**

| | Question | Instrument |
|---|---|---|
| **A** | Does the page match the source, at every tier? | `probe.js` + the diff harness, port vs served source |
| **B** | Does the editor canvas match the page? | `templates/canvas-diff.js` |
| **C** | Can the designer work in it? | the editor at Desktop / Tablet / Mobile, and the first five minutes |

Nothing here is a re-reading of what was already read, and nothing is repeated
"to be sure". A check that has to be run twice to be believed is a broken check —
fix the instrument, do not re-run it. The rules further down exist for exactly
that: they are what makes one clean run mean something.

**Diff each section as it is finished; run A, B and C whole once at the end.** The
per-section diff is one command at the design's main width. It earns its place on
the clock: one run wrote all eight sections before measuring and spent a quarter
of the port reworking them — a container constrained twice lived in seven sections
before anyone looked.

**Diff, do not measure.** Numbers have to be read, compared and judged, and
reading them is the half that gets skipped when there are hundreds — which is how
a defect in plain sight survives a verification that technically ran. The source
is already served alongside (Step 2): take the same reading on both sides and
print only what differs.

One harness for the whole port: give it a section, it walks the matching elements
left and right, compares geometry, spacing, type and colour, and returns
mismatches with both values and a tolerance for sub-pixel noise. Three lines of
output or none.

**Put the probe in the theme, not in the console** — a `?probe=1` flag that
enqueues it, on the port and on the source copy both, so a reload does not lose it
and the same thirty lines are not re-sent for every reading.

## A — the page against the source

**Include the section's own box from the first section**: its height and its
padding top and bottom. Cheapest fields there are, likeliest to be off by a whole
rhythm — one run added them last and found 150px of dead space above a CTA in the
first reading.

**And reach the leaves, not just the boxes.** A run whose every measurement was
correct still shipped three defects, all of them content inside a box whose outer
geometry was perfect: section heights, grid widths, column counts, font sizes and
overflow stay identical whether an image fills its frame or floats inside it with
15px of air, whether it decoded at half resolution, and whether the text under it
is centred or hard left. Two extra fields close all three:

```js
// every image that carries meaning
{ natural: [w, h], box: [w, h],
  fills:          Math.abs( natural.w / natural.h - box.w / box.h ) < 0.01,
  underResolved:  natural.w < box.w * devicePixelRatio }

// every text node inside a container the design centres
{ centre: rect.x + rect.width / 2, parentCentre, delta,
  textAlign: getComputedStyle( el ).textAlign }
// delta alone is not enough: a full-width box is always centred on its parent,
// so an eyebrow whose text sits hard left passes a centre check and fails the eye
```

`underResolved` earns its place: WordPress adds `sizes="auto"` to lazy images, the
browser resolves `sizes` before the card has a width, and it picks a file half the
size it needs — right markup, right CSS, right file on disk, soft picture on
screen. No part of that is geometry, so no geometric sweep sees it.

Two things keep it honest: match elements by their **position in the section's
structure**, not by class — the names differ between source and port — and print
what it could **not** match, because a silently unmatched element is an unchecked
one.

**Compare against the source before sweeping for breakage, in that order.** One
run spent its whole budget on nine widths and both defects the designer found were
sitting on the desktop in plain sight: it had been checking *whether anything
breaks* and almost never *whether it matches the source*.

1. **One width, element by element, against the source's numbers** — section
   heights, column positions, button widths, the y of two columns that should
   align. This is where the defects a human notices live.
2. **Then every tier**, section by section. Not a sample: every tier, plus a width
   each side of every boundary — the boundary is where an override that travels
   the wrong way shows itself — and at least one wider than the largest image,
   since below that `max-width:100%` hides the problem.

One browser script per width, not one per question. Read grid columns, gaps, font
sizes, paddings, absolute placements, overflow and every section's left edge in
the same pass.

**Typography is seven properties, not one**: family, size, weight, **case**, letter
spacing, line-height and colour. Case and tracking are what a size comparison never
notices and a designer notices immediately; colour belongs here because WordPress
supplies a default to anything that was not given one, so "it looks black" is not
"it is the design's black". `probe.js` returns all seven per node.

**Assert the visibility map at every tier** — the map from Step 2, every row, as a
script rather than an inspection. Hidden must report `display: none`; visible must
have a box. It is the only check that catches everything having been built visible
and nothing hiding at any width, and a disagreement is a defect, not a judgement
call.

**States get their own pass, and it is not optional.** Walk the list from Step 2
and drive each effect for real: hover the element, read the computed value, move
away, read it again. Hovering is scriptable — a `hover` action, or a
`mouseover`/`mouseenter` pair dispatched at the element — so "the canvas cannot
show hovers" is not a reason to skip it. Confirm for each: the colour is the
source's colour and not merely *a* change; the image inside a linked card scales
by the source's factor and stays inside its frame; whatever should appear appears
and whatever should vanish vanishes; the duration is the house timing. Then run
the same list through the keyboard: `:focus-visible` on every one.

**Then trigger every animation.** Scroll the page from the top rather than jumping
to a section, so reveals fire in order and any stagger is visible; scroll by a few
pixels first and confirm a sticky header changes state there rather than after the
hero; open and close
every panel, drawer and dropdown twice — the second time is what catches a state
that never resets. Anything the pane genuinely cannot drive goes on the
not-verified list by name, not as a category.

**Look at the page, do not only measure it.** One screenshot per finished section
and one of the whole page, read rather than filed. Section heights matched to the
pixel on a port where a video had no overlay, a column had collapsed, the arrows
sat in a corner and a number printed in black — no box measurement sees any of
that and a glance sees all four.

### Six rules that make one clean run trustworthy

Every one of these is why a check does not need repeating. Skip them and the only
honest response to a green result is to run it again.

- **Derive the element list from the markup, never by hand.** One run reported
  "0 differences" twice over a typed list of 77 selectors; walking the DOM instead
  gave 94 and produced 18–21 real differences at every width. Use
  `probe.snapshot( section )`, and state the coverage: **"N elements compared" is
  the result**; anything outside that set is unexamined, not verified.
- **Print what the instrument examined and what it could not match.** A harness
  reporting zero is indistinguishable from one that measured nothing — one run's
  "all deltas 0" came from a page where two thirds of the design was invisible to
  the probe. A count that looks too small is a broken rig, not a clean page.
- **Drive the comparison from the source's tree**, demanding a counterpart in the
  port for each node. Picking two selectors from the port and comparing heights
  only confirms a number was copied; it cannot reveal an element placed where the
  design never had it, which is where most reported defects live.
- **Never trim the output.** A diff that printed `overflow: src=visible
  port=hidden` had that line filtered as noise along with four real defects. **A
  difference you do not understand is a finding.**
- **Observe, do not deduce.** `probe.hitTest( el )` asks the browser what is on
  top; comparing two rectangles and concluding "clipped" got one arrow reported
  as clipped when a hit test returned it visible. Overflow, z-order, transforms
  and clip paths are not in a pair of rects.
- **Read every instance, never the first.** `querySelector` returns row 0 and row
  0 is rarely the row in question. `probe.all( selector )` returns them with
  indices; name the index when a specific card is under discussion.

**Copy `templates/probe.js`; do not write measuring code.** Every lie the browser
pane tells is already worked around in it. In one measured port, browser work was
151 calls and 49 minutes, about half of it repairing the instrument — and several
checks still came back green on a page that was not. Load it at `?probe=1` on both
copies and `await probe.ready()` before the first reading. Its four essentials:
wait for `document.fonts.ready` (system-font metrics made one section 81px taller);
front the tab before resizing (resizing a background tab reports success and
changes nothing); reload after every resize (the numbers otherwise come back
identical to the previous width); and confirm a defect twice before investigating.

Two more that cost a round each: **do not fork the rig** — a second lighter probe
produces phantom differences; and **namespace every query flag** — `?w=1920` is
WordPress's week variable and returned an empty archive with 93 phantom "MISSING"
entries. Same for `p`, `s`, `m`, `cat`, `author`, `year`, `page`, `name`.

**Confirm the source copy actually loaded before believing any difference** —
images with non-zero `naturalWidth`, fonts resolved, stylesheet count. CDN assets
fail silently in a local copy, and one run chased a logo mismatch that did not
exist.

For anything stranger, `reference/traps.md` → "Measuring". Across five ports the
instruments lied nine times.

## B — the canvas against the page

**One script, and it is not optional.** `templates/canvas-diff.js` loads the front
end into a hidden iframe sized to the canvas and prints only the computed
properties that differ. Same page, same width, so anything left is the cascade.
Run it per page at every tier and fix until it returns zero.

The run it was written for returned **seven** differences on a page that had
already passed a front-end sweep, and two more at the next tier down — a hero gap
rendering 0px against 100px, and eight groups whose `align-items` came out
`stretch`. Every one was a theme rule tying with a core layout rule and losing on
order in the canvas only. Fix by doubling the class. See "In the canvas your
stylesheet loads *before* core's" in `traps.md`.

That trap and one other are what make the canvas differ, and both are ordinary:
the theme's stylesheet loads **before** core's there and after it on the front
end; and no theme JavaScript runs at all, so every state a script would set is
absent. Neither is visible from the front end.

## C — the editor at Desktop, Tablet and Mobile

**Switch the canvas deliberately — View → Desktop / Tablet / Mobile — and assert
at each.** Not by eye at whatever width the canvas happens to be: it is an iframe
answering media queries with *its own* width, and on a 1440 monitor the sidebar
leaves about 1050, so the editor shows the tablet layout while the designer
believes they are looking at desktop.

**Read the width, do not trust the label.** The button says "Tablet"; the number
is what decides which rules apply, and the two do not always agree — see
`settings.viewport` in Step 3. A width badge in the canvas, from
`enqueue_block_editor_assets`, answers this permanently.

Assert the visibility map at all three, reading computed `display` in the canvas
and not only on the front end: editor styles are rewritten on load — a `body`
prefix is not the same selector there — so a hiding rule that wins on the front
end can lose inside the iframe.

Re-check after applying corrections. A fix verified only on the front end is half
done.

What the diff cannot see, and the eye can, at each of the three widths:

- [ ] Grids have their columns; nothing collapsed to a stack; layers are layered
- [ ] Full-bleed sections span the canvas, and content inside them lines up with
      the container rather than the window
- [ ] Every absolutely positioned element sits inside its own section — the most
      frequent canvas defect
- [ ] No unsupported-block warnings, no invalid blocks
- [ ] Bound fields show content, not their own key; every collection field has a
      labelled sidebar control and the raw Custom Fields table is hidden
- [ ] Images visible, decorative graphics present, `fills: true` where a photo
      should fill its cell
- [ ] No section blank or faint — nothing left at an animation's or a state
      class's start value, since no theme script runs here

`add_editor_style()` takes a **relative** path and reaches the **canvas only**.
The sidebar lives in the outer document, so a class from `editor.css` styles
nothing in an inspector panel — use core's own (`components-base-control__help`).

## The editability pass

Everything above asks whether the page *looks* right; nothing above asks whether
the designer can *change* it, and that is the half that ships broken. One port
passed its validator with 0 invalid blocks and matched the design on 184 of 184
values per width — and the designer then found a slideshow with no way to pick its
photographs, a sidebar field asking for `xx_service_link`, and four blocks
printing "Block rendered as empty", all inside the scope already declared
verified.

**1. The first five minutes.** Open the editor and actually do the eight things a
client does on day one. Each either works or it does not — there is no partial
credit, and the whole pass costs one browser session:

- [ ] Change a heading
- [ ] Swap a photograph
- [ ] Add a new entry to a collection and see it appear in its section
- [ ] Add a link to the menu, then nest two pages under it and get a dropdown —
      on the desktop bar *and* in the drawer
- [ ] Reorder two cards
- [ ] Change a button's colour and its label
- [ ] Change a section's padding at 767 only, in UPQODE Dimensions, and see 991
      and 567 behave as the cascade says
- [ ] Change a card's max-width at 1440 and see 1920 follow it
- [ ] Hide a block on 1920 and 1280 only, and see it still at 1440
- [ ] Change the H2 size at 991 in Styles → Typography and see every H2 on the
      site change at that width and no other
- [ ] Give a new group a block style by name from the Styles tab
- [ ] Insert one of the theme's own blocks into an empty area and make it work
- [ ] Hide a section

**1a. The paste-parity test — run it, do not reason about it.** For every custom
block on the page, insert a fresh copy beside the existing one and diff their
computed styles. It is one script, it answers the "looks the same" requirement
directly, and it found in one port that six blocks matched and one did not — which
no amount of reading the CSS had revealed:

```js
const PROPS = ['backgroundColor','borderRadius','borderWidth','borderColor','color',
  'fontSize','fontFamily','fontWeight','aspectRatio','overflow','position','display','gap','boxShadow'];
// insert a fresh block, wait for the render, then compare both wrappers
// through the canvas iframe's own getComputedStyle, and print only what differs.
```

Read the differences it prints, do not skim them. One kind is expected and fine —
a per-instance setting the pattern made deliberately in the panel (a padding, a
height at one screen, an `align`). Everything else is a value that should have
been in `theme.json`.

**2. The sidebar reads like English.** Select every custom block on the page and
read its panel out loud. A raw attribute name, a storage key, an `[object Object]`,
or a number where a choice belongs is a defect, not a rough edge. This is the check
that catches reflection-built inspectors — see "A custom block must work where it
is dropped" in Step 7.

**3. The editability inventory.** Per section, list every value the design varies
and say where it is controlled: the panel (which screen), core's control, a
`theme.json` preset, a block style, or the stylesheet with the row of "What goes
where" that keeps it there. The point is not the document — it is being forced to
look at the list.

**Geometry belongs in the panel.** This file used to say the opposite — that
`min-height`, `max-width` and a responsive height ladder were fine in CSS because a
block attribute holds one value and the ladder has five. The panel holds seven,
and the designer settled it the other way: *"I open any element on any page and
there are no values here."* A width or a height in a section stylesheet is now
the same defect as a padding there. What stays in CSS is only the short list at
the end of the ownership pass in Step 7.

**4. Ask about locking.** Nothing in a block theme stops a client deleting the
wrapper a grid hangs off, and the section then disappears with no warning and no
undo they will find. "Fully editable" and "hard to break" pull against each other,
and which one this client wants is not yours to decide. Put it in the options
dialog with the structure plan:

- lock nothing (maximum freedom, easiest to break)
- lock structural wrappers against move and delete, leave all content free —
  **recommend this one**
- lock the section templates entirely, content edited only through collections

Then carry on building; it is a small change to apply either way.

---

# Step 14 — save, and protect the designer's edits

The pattern file is the source; the page is a copy taken at save time. Anything
edited in wp-admin lives only in the copy.

Four scripts, parameterised by page ID and pattern list:

- **flatten/compare** — both trees to one row per block: positional path,
  recursively sorted attributes, stripped text.
- **drift check** — what the live page has that the patterns do not. Run before
  touching a pattern.
- **guarded save** — refuses when drift exists; `--force` overwrites and prints
  what it discarded. Backup either way.
- **resync** — synced patterns are never touched by the guarded save, so an edit
  to the pattern file is otherwise invisible on every page using it.

Verify end to end by simulating edits in the database.

Call `kses_remove_filters()` before `wp_update_post()`. Drop the pattern cache
(`wp_get_theme()->delete_pattern_cache()`) at the **start** of every build —
activating a theme before its patterns exist caches an empty list.

Write or update the manifest.

## Hand the site over clean

None of this is visible on the page, and all of it is the first thing the client
sees when they log in. It takes ten minutes and it is checked every time.

**Delete the leftovers, and there are two kinds.**

*What WordPress installed:* the "Hello world!" post, the sample page, the draft
privacy page, the "Uncategorized" category and any tag nobody created on purpose,
and every plugin that arrived with the install and is not being used. Akismet and
Hello Dolly are the usual pair.

**Themes are the exception: the site keeps exactly two.** The project's own, and
**one** current default — the latest Twenty-Something — left installed on
purpose. If the project theme ever takes a fatal, WordPress needs somewhere to
fall back to; without a second theme the site is white and wp-admin can be
unreachable along with it, which is the worst moment to be installing a theme.
Delete every *other* stock theme, and say in the handover that the remaining one
is deliberate, so nobody tidies it away as clutter.

*What the migration left:* the plugin that moved the site — an export plugin or a
host's migrator — is removed once the move is done. It is a developer tool with a
database-wide reach, and it is the one nobody thinks of as a leftover because it
was the last thing that worked.

*What the build left behind*, and this is the half that gets missed because it
was made deliberately: header or footer variants that were tried and abandoned,
patterns that no page inserts, a custom post type registered for a section that
was cut, contact forms cloned while testing, media uploaded and never placed,
and the test pages made while wiring a template. Each of these looked correct on
the day it was made, which is exactly why nobody deletes it.

Walk the lists in wp-admin rather than trusting memory: Pages, Posts, Categories,
Tags, Comments, Media, every custom post type, Appearance → Editor → Patterns and
Template Parts, the forms plugin's list, Themes, Plugins. Anything the finished
site does not use goes.

**Two exceptions, so nothing useful is thrown away.** A pattern that is a
deliberate starting point for the client stays even though no page uses it yet —
say which ones and why. And an alternate header built because the design has two
stays: it is used by a template, and a check that only walks pages will not see
that.

An empty admin is the difference between a site that looks built and one that
looks half-configured — and for the client it is the first impression of the
whole project.

**Names are what the client navigates by.** Template parts read `Header`,
`Footer`; patterns read what the section is; forms read where they are used. A
list of `header-2`, `group`, `Contact form 1` is a list nobody can use, and
renaming later means finding every reference.

**Comments off unless the design has them.** No blog and no comment section means
the discussion setting is off globally, off on every existing post, and anonymous
comments closed. Left on, the client's first spam arrives before the invoice.

**Search engines: check the box is *un*checked.** Settings → Reading, "Discourage
search engines" — set during development and forgotten at launch more often than
any other single setting. It costs nothing to check and it costs months to notice.

**And while it is checked, confirm it is doing both halves of its job.** That
option is supposed to put `noindex` in every page's head **and** write
`Disallow: /` into robots.txt. On a site with an SEO plugin, only the first
usually happens: the plugin replaces WordPress's virtual robots.txt with a block
of its own, that block does not consult the option, **and it advertises the
sitemap** — so the site asks not to be indexed in the head while handing out a
list of every address in the same breath. Open `/robots.txt` and read it; do not
assume the tick did it.

Where it has to be corrected, replace the plugin's output rather than appending
to it — a `Disallow: /` under a `Sitemap:` line is not a smaller contradiction
than no `Disallow` at all — and filter **after** the plugin, which usually runs
at a very late priority. Tie it to the option rather than to a constant, so it
stands aside by itself the day the box is unticked and is not one more thing to
remember on launch day.

**The admin account is a work address, never a personal mailbox.** Not a `gmail`
address, and not the builder's own: the project manager's. It receives password
resets and update notices for the life of the site.

**Plugins, and only these:**

- **Yoast SEO** — the house default, and SEO is **never** theme code (Step 11).
  It brings titles, descriptions, Open Graph, canonical, sitemaps, schema,
  noindex and redirects in one install, and all of it stays when the theme goes.
  Its own hooks are the ones this skill documents: `wpseo_sitemap_exclude_post_type`
  and `wpseo_exclude_from_sitemap_by_post_ids` for the sitemap,
  `_yoast_wpseo_title` and `_yoast_wpseo_metadesc` for a page's copy, Search
  Appearance for a taxonomy's noindex.
  **Rank Math Pro instead, when the client already holds a licence** — ask,
  rather than installing Yoast and swapping later. Which plugin is a client
  decision; that SEO is a plugin at all is not. See *Swapping the SEO plugin*
  below for the hook-for-hook mapping and for what the swap actually costs.
- **Redirection only where the SEO plugin's own redirect manager is not
  available** — check before installing a second plugin for the same job. On a
  site inherited with another SEO plugin, leave it rather than migrating the
  data for its own sake, and write to its keys instead.
- **Contact Form 7** for forms, unless the designer chose otherwise — and the
  theme says in code that it needs it, because the theme's own markup assumes it.
  **There is no theme header for this**: `Requires Plugins:` is a plugin header
  and core ignores it on a theme, so the declaration is an admin notice while the
  plugin is missing plus a line under its row on the Plugins screen. See
  `reference/security-and-handover.md`. No integrations unless they were asked
  for.
- **An SMTP plugin** wherever the host's own mail is not reliable, which is most
  fresh hosts. A form that silently lands in spam is a form that does not work.
- **WP Rocket** for caching, configured rather than merely activated. **Off or
  bypassed on the development site** — a cache is the first reason a change
  "did not apply" — and cleared after any script that writes to the database.
- **An image plugin only if the images need one.** The rule is that media is
  optimised **on the way in** (Step 5), and a site whose library is already WebP
  has nothing for a plugin to do: on one port it was 329 WebP against 3 raster
  files, and the plugin named here had sat uninstalled all project without
  costing anything. So install one **only when the images arrived unoptimised**,
  and then ask first — recompressing photographs that are already good trades
  visible quality for bytes nobody is short of. **Agree it with the designer at
  the end of the project**, with the numbers, rather than assuming it at the
  start.
- Every plugin on its current version at handover, along with WordPress itself.

### Swapping the SEO plugin

Done once, Yoast → Rank Math Pro, on a finished 48-address site. It took four
theme files and two settings; nothing else moved. The order below is what made
it safe, and every step of it earned its place.

**1. Snapshot the rendered `<head>` first, and do not trust the database.**
REST exposes `_yoast_wpseo_*` for posts and **not for pages or any CPT**, so
querying the database tells you nothing about 80% of the site — it comes back
empty for pages that plainly have titles. Fetch every address in the sitemap and
record title, description and `og:image` to a file. That snapshot is the backup,
the acceptance test and the only way to prove afterwards that nothing was lost.
It also substitutes for a host backup when nobody on the call has host access.

**2. Install the new plugin beside the old one, import, then deactivate.**
Both active at once prints two of every tag, so do not leave a gap between the
import finishing and the old plugin going off. **Deactivate, never delete**, until
the diff is clean — that is the whole rollback. And in the importer, leave every
*Clean* / *delete the other plugin's data* control alone: it is the only
irreversible thing in the procedure.

**3. Diff against the snapshot and expect the settings, not the content, to be
missing.** The content came across byte for byte. What did not: a CPT that the
old plugin excluded from the sitemap reappeared — as raw `?post_type=slug` query
URLs, because it has no permalinks, which is exactly why it was excluded — the
blog category archives dropped out, and the global OpenGraph default arrived
empty, which left every page without its own card showing no card at all.

**4. Port the theme hooks.** They map almost one to one, and two of them get
simpler:

| What the theme does | Yoast | Rank Math |
|---|---|---|
| replace the social card | `wpseo_opengraph_image` + `_width`, `_height`, `_type`, `wpseo_twitter_image` | **`rank_math/opengraph/{network}/add_images`**, one action |
| keep a CPT out of the sitemap | `wpseo_sitemap_exclude_post_type` | `rank_math/sitemap/exclude_post_type` — *same two arguments, same meaning* |
| drop single entries | `wpseo_exclude_from_sitemap_by_post_ids` | `rank_math/sitemap/entry` — return `[]` and the row is skipped |
| noindex a thin single | `wpseo_robots_array` | `rank_math/frontend/robots` — same array shape |
| add a schema piece | `wpseo_schema_graph` (a list, push onto it) | `rank_math/json_ld` (a **map**, add under a name) |
| robots.txt | priority past Yoast's 99999 | **no change needed** — Rank Math hooks at 10, only when a custom file is set, and respects `blog_public` |

**The social card is the one worth reading twice.** Yoast needed four filters
because changing the image URL left the previous image's width and height
printed beside it, and a card served with wrong numbers is worse than no card.
Rank Math fires `add_images` **before** it looks for anything of its own, and
every one of its own paths — post meta, featured image, taxonomy image, global
default — returns early once an image is present. So add the card there **by
attachment id**: it wins, it suppresses the featured image, and the plugin reads
the dimensions off the Media Library itself.

**5. Only then delete the old plugin**, and remember the `wp-tools` scripts that
still write the old keys.

**Two traps worth naming.** The new plugin may honour "Discourage search
engines" more thoroughly than the old one did — pages that carried no `robots`
meta at all can start carrying `noindex, nofollow`, which is correct on a closed
demo and alarming if you do not expect it. And a field you are looking for is
often not under the tab its name suggests: the OpenGraph default lives under
**Global Meta**, not Social Meta.

**Redirects belong to launch, not after it.** Where a site is replacing one that
was indexed, the old URLs get 301s to their new homes before the switch — the
list comes from the client or from the old sitemap. Ask for it rather than
assuming there is nothing to redirect.

**Analytics and consent are the client's, not yours.** Ask what already runs on
their current site — GTM, GTag, a consent tool such as Termly — and wire what
they name. Never invent a container ID, and never leave a placeholder that looks
configured.

**If the site ships behind a password, prove it works.** Log out entirely, open
it in a private window, and confirm the protected pages ask for the password and
the rest of the site behaves. A protection that only appears to work is worse
than none, because nobody checks it twice.

## Moving the site somewhere else

**Ask how it travels before planning anything.** An export plugin (All-in-One WP
Migration and its kind) turns the site into a file; a host's own migrator
(Cloudways and its kind) pulls the site over a **public address**, which a local
site only has through a tunnel. They fail differently, and half the work applies
to one of them only — so this is a question for the options dialog, asked once
per project and written down:

> **Чим переносимо сайт?** · All-in-One WP Migration · мігратор хостингу
> (Cloudways) · вручну

Three things break in the crossing on **every** route, and not one of them shows
on the page anybody checks first:

- **The theme travels as files.** A theme that is a symbolic link locally arrives
  as an empty folder, and WordPress serves a white page. Afterwards confirm both
  that the folder has contents and that the theme is active.
- **The old address is in the database hundreds of times, and some of those rows
  are serialised** — so the replacement is made by something that understands
  serialisation (`wp search-replace … --all-tables --precise`), never by SQL, and
  the database is **searched again afterwards** to prove it is gone.
- **Check the deepest editor-written page, never the front page.** Pages built by
  the theme address their media by attachment id and render perfectly on any
  domain, while every post is broken — `core/image` and `core/video` keep an
  absolute URL in `post_content`.

And the trap that belongs to host migrators alone: **the migrator replaces the
tunnel's address, not the address the content carries.** The order is three steps,
not two — point `siteurl`/`home` at the tunnel, *replace the development address
inside the content*, then put the theme in as files.

The rest — the row that records where the site *was* and must be excluded from
the replacement, basic auth on the tunnel, the lazy-image false alarm, and the
verification list — is `reference/migration.md`.

---

# Definition of done

- [ ] Zero `core/html`; zero invalid blocks, confirmed by the real validator
- [ ] Every block of the theme's own justified in one line by what core cannot do
      — behaviour, never convenience; no custom block drawing a loop; every
      behaviour block holding core blocks as its content
- [ ] The UPQODE panel installed from the template: Dimensions and Animations on
      every block, seven icons with 992–1279 in the middle, core's own Dimensions
      and Layout hidden in the inspector
- [ ] Every value on a block — in the panel at the screen the source sets it, or
      in core's controls — or in `theme.json`, or named as an exception;
      confirmed by the ownership grep in Step 7, with every remaining line
      naming its row of "What goes where"
- [ ] The theme writes media queries only at 1280, 1440, 1920, 991, 767 and 567
- [ ] Every block's "Additional CSS class(es)" empty; anything the panel cannot
      say is a registered block style, each one tested against a plain block
      first and registered in a file every page loads
- [ ] Styles → Typography shows the seven screens on every element, with Small /
      Body / Large under Text; a change at one screen measured on the page
- [ ] Styles → Colors edits the tokens; a colour added there is usable as a token
- [ ] Styles → Form fields carries Default, Focus and Error, and a value changed
      in one of them shows on a real form — on **every** form, with no stylesheet
      still restating the field skin in literal values, and the submit button
      untouched by it
- [ ] Styles → Export / Import is one row under Blocks; a file written there and
      read back reproduces all five sections, and the import arrives as an
      unsaved change rather than writing straight to the database
- [ ] The Design sidebar's **Pages** row is gone — one door to a page, not two —
      with the removal hooked on the row's address and named in the handover as
      something a core release can undo
- [ ] Hide on this screen hides exactly the ticked screens and no screen between
      them
- [ ] Text the design centres has `text-align: center`, not merely a box whose
      centre happens to match its parent's
- [ ] Every section on the same skeleton; all left edges identical
- [ ] **The served markup is a document, not boxes**: every section group carries
      `tagName:section`, exactly one `main`, one `header` and one `footer` and
      none nested, the menu inside `nav`, one `h1`, no skipped heading level —
      read off the served HTML, not assumed from the source
- [ ] Graphics are blocks or pseudo-elements; images swappable from the library
- [ ] Fonts self-hosted, one face per subset, confirmed as the resolved family,
      and the above-the-fold faces preloaded from the theme — not from the
      caching plugin, which does nothing on a local host
- [ ] `style.css` names the project and reads `By UPQODE`, with a real
      `screenshot.png`; slug, text domain and class prefix use the project's name
- [ ] `404.html`, `search.html` and `archive.html` carry the design — opened and
      looked at, not assumed
- [ ] Every repeating block tested by adding one item and deleting one, in the
      editor
- [ ] Page weight measured: images resized and in WebP/AVIF, no multi-megabyte
      hero
- [ ] `sizes` corrected per slot — **no image fetched at more than its own box**,
      counted across every page, not spot-checked
- [ ] `FAQPage` where the page has an FAQ; every `VideoObject` has a
      `thumbnailUrl`
- [ ] Handed over clean: WordPress's own sample content deleted **and** the
      build's leftovers — abandoned parts, unused patterns, cloned forms,
      unplaced media, test pages, cut post types — walked list by list in
      wp-admin, with any deliberate keeper named
- [ ] Parts and patterns named, comments off where there is no blog, "Discourage
      search engines" unchecked, admin on the PM's address, plugins current
- [ ] Exactly two themes left — the project's and one current default, kept on
      purpose as the fallback and named as deliberate in the handover; the
      migration plugin removed once the move is done
- [ ] The SEO plugin installed and configured — Yoast by default, Rank Math Pro
      where the client holds a licence; **no SEO code in the theme at all** — no
      `inc/seo.php`, no panel of its own, no meta fields the theme registers;
      redirects in place where a site is being replaced
- [ ] Every address in the sitemap has **both** a title and a description, read
      out of the rendered page rather than the database — titles under 60
      characters, descriptions 70 to 160. The database answers for posts and
      stays silent about pages and CPTs, so it cannot tell you this
- [ ] Where the design has more than one header, each is a template part with a
      title, and a custom template makes the choice available in the page sidebar
- [ ] Header passes every check in Step 6, compared against the design **open**,
      at every tier — the closed bar proves nothing
- [ ] Every section is its own pattern, titled, categorised and given a viewport
      width — no page-sized pattern
- [ ] Every custom block and every pattern appears under the theme's own group in
      the inserter; nothing left in Widgets or Uncategorized
- [ ] Repeating structures confirmed with the user; different wording uses
      overrides, not forked copies
- [ ] Forms in Contact Form 7 unless the designer chose otherwise, declared as a
      dependency; recipient an option and never hardcoded; all ten states styled;
      `tabindex:0` written into the form tag, never patched after render; no
      integration that was not asked for; nothing actually sent while testing
- [ ] Sliders are scroll containers whose slides are still editable blocks;
      autoplay, loop, timing and slides-per-view taken from the source
- [ ] No state exists that the source does not declare, and no carried state has
      picked up an extra property along the way — and nothing was removed as
      "invented" without checking the interactions payload as well as the styles
- [ ] Every hover and focus state carried across and driven in the browser —
      colours, appearances, disappearances, and image scale inside linked cards
- [ ] Hover-played media is still at rest until hovered, its control changes with
      it, and the card is a real anchor that opens the source's destination
- [ ] Animated-element counts reconciled between source and port, with the
      numbers stated — triggers expanded to their real targets
- [ ] Nothing is left standing at an animation's start value — every element
      whose resting CSS is a start state either animates or sits at its end state
- [ ] Every animation and interaction triggered at least twice, not just read
- [ ] A scrolled header takes its state at the source's threshold — within the
      first pixels of scroll, and correctly on a page opened already scrolled —
      and it was read at three or four positions to establish whether it
      switches or interpolates, with a crossover built frame by frame rather
      than as a class
- [ ] Header parts counted from the markup, not from the behaviours: one part
      unless the markup genuinely differs, with a behaviour variant as a block
      style or a panel toggle rather than a forked copy
- [ ] Animation durations, distances, delays and easing taken from the source —
      including the interactions payload, not the stylesheet alone
- [ ] `prefers-reduced-motion` honoured
- [ ] No flash before a reveal: the resting state is in CSS, set by a class
      written in the head, gated on the capability the animation needs and
      released on a timer if the script never arrives — watched on a cold load,
      not assumed
- [ ] Every check reported how much it examined; no result of "0 differences"
      accepted without the count behind it
- [ ] Visibility claims made by hit test, not by arithmetic; every instance read,
      not the first; nothing filtered out of the comparison's own output
- [ ] Page handed over for review; corrections applied on the block
- [ ] The source's `<head>` harvested — title, description, icon, Open Graph,
      `lang` — and whatever it does not declare listed as outstanding for the
      designer rather than invented
- [ ] SEO — only if the designer asked for it; otherwise listed as outstanding
- [ ] Alt in the Media Library; decorative images deliberately empty
- [ ] Each section diffed when it was written, not only at the end
- [ ] Diffed against the served source — mismatch list empty, and nothing left
      unmatched — at one width first, then every section at every tier; opened in
      the editor
- [ ] Container and section widths measured at 1920 as well, not assumed to
      match 1440
- [ ] The visibility map asserted at all seven tiers — every element the source
      hides is `display: none`, not merely faint or off screen
- [ ] `wp_slash()` on every write; no `--` in any class; no expanded CSS variable
      in any block attribute
- [ ] The first-five-minutes actions performed in the editor — including the
      panel and Typography ones — each reported as worked or did not
- [ ] The theme is a full kit: every template, `index.php`, `screenshot.png`,
      and the plugin it cannot work without declared **in code** — a notice while
      it is missing and a line under its row on the Plugins screen, since no
      theme header does this; `index.html` a fallback loop, `home.html` a heading
      and a loop
- [ ] **Every list of records pages** — checked by creating one record too many,
      on each archive and each feed, with the pagination styled rather than
      core's
- [ ] Every detail type opened in the editor and showing the template around the
      content, not a bare content area
- [ ] One test post holding every core block, walked top to bottom, then removed
      or named as a keeper
- [ ] Menu-item attributes read by the theme — new tab, `title`, `rel` — in one
      place that feeds the bar, the drawer, the mega panel and the footer
- [ ] Any synced pattern's Content panel **and List View** read with the
      client's eyes; no row that accepts nothing
- [ ] `DISALLOW_FILE_EDIT` on; types without pages closed by URL and by
      `?post_type=`; no absolute URLs in markup or PHP
- [ ] Entries that keep an address but are not pages — a testimonial, a question,
      a team member — carry **both** `noindex` and absence from the sitemap, with
      the set decided from which `single-<type>.html` templates exist
- [ ] `/robots.txt` read, not assumed: while the site is discouraged it says
      `Disallow: /` and does **not** advertise a sitemap
- [ ] Build run after the last CSS/JS edit; CSS and scripts load per page,
      counting `is-style-…` words
- [ ] Theme audit clean, a `WP_DEBUG_LOG` sweep produced no log, developer tools
      removed
- [ ] Moved to its host as files, not as a link; the development address gone
      from the database — serialisation-safe, and searched again afterwards —
      with the deepest editor-written page opened, not the front page
- [ ] Every custom block's sidebar read out loud — no attribute names, no storage
      keys, no `[object Object]`, no free text box where a list belongs
- [ ] Paste parity: a fresh copy of every custom block diffed against the one in
      the pattern, computed style by computed style, with only per-instance
      attributes and section geometry left differing — its default look in
      `theme.json`, its frame on its own class, and every part of that appearance
      still changeable from the sidebar
- [ ] Every dynamic block says what is missing instead of rendering empty
- [ ] `ancestor` declared for blocks that only mean something inside a loop, after
      grepping the patterns to confirm none is used standalone
- [ ] Locking applied as the designer chose in question 3
- [ ] Corrections written to **both** the pattern file and the page's stored
      content, with the occurrence count asserted before the write
- [ ] Media optimised **at import**, not afterwards — photographs WebP, fonts
      WOFF2, muted video stripped of audio and scaled to its frame — with the
      page's transferred weight reported before and after, not the folder's
- [ ] An image plugin installed **only** if the library needs one, and agreed
      with the designer at the end with the numbers — never assumed, and never
      set to recompress photographs that are already good
- [ ] Manifest written; drift check green
- [ ] A "not verified" list handed over — scroll states, reveals, anything
      frame-dependent
