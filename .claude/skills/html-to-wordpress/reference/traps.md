# Reference — why things break

Consulted when something does not behave, not read start to finish. The skill
itself carries the procedure; this file carries the diagnosis.

Every entry here cost a real port real time.

---

## Anything core styles in its own theme.json must be answered in yours

Core ships a `theme.json` too, and it styles blocks through selectors like:

```css
:root :where(.wp-element-button, .wp-block-button__link) {
  font-family: inherit; font-weight: inherit; text-transform: inherit;
}
```

That is **the same specificity** as a theme rule written as
`.wp-block-button__link`, so which one wins comes down to load order — and the
load order is **different in the editor than on the front end**. On the front end
the theme stylesheet is enqueued after global styles and wins. On the canvas the
order is reversed, core wins, and the button quietly inherits the body font: no
uppercase, lighter weight. The symptom is a button reading "Shop pints" in the
editor and "SHOP PINTS" on the site.

**The fix is not stronger CSS.** Put the values in **your `theme.json`** —
`styles.elements.button` and `styles.blocks.core/button` — where theme origin
beats core origin regardless of which file loaded first. A specificity war
against `:where()` is unwinnable in one place and fragile in the other.

Treat this as the general rule: **typography, colour and spacing defaults that
core sets for a block belong in `theme.json`, not in `style.css`.** Reach for the
stylesheet only for what `theme.json` cannot express — hovers, transitions,
pseudo-elements, ratios.

### The core defaults that actually bite

Four separate ports diagnosed these from scratch, one at a time. Check the list
instead of rediscovering it.

| Symptom | What core declares | Where to answer it |
|---|---|---|
| Buttons thin and un-capitalised **in the editor only** | core `theme.json`: `elements.button.typography` = `inherit` for family, size, weight, letter-spacing, text-transform | your `theme.json` |
| A Group with a background gains ~38px side padding | `:where(.wp-block-group.has-background){padding:1.25em 2.375em}` | declare **all four** paddings on every block that carries a background |
| Cover content flush to the window edge; a row shrinking to its text | `has-custom-content-position` → `width:auto` on the inner container | see the specificity note below |
| A cover offset by 1px | `core/cover` carries its own `padding:1em` | declare padding explicitly |
| Menu items the wrong colour | core `styles.blocks.core/navigation` | your `theme.json` |
| Your `small` / `medium` / `large` preset ignored | core's same-named presets | `defaultFontSizes` / `defaultSpacingSizes` / `defaultPalette` → `false` |

**Count core's specificity before overriding it — it inflates on purpose.** The
cover rule is written with the position class deliberately repeated:

```css
.wp-block-cover.has-custom-content-position.has-custom-content-position.is-position-bottom-left
  .wp-block-cover__inner-container { margin: 0; width: auto; }
```

That is five classes, (0,5,0). A two- or three-class override loses silently and
looks like the fix never applied — one port spent three iterations on it. Read
core's actual selector and count, rather than assuming a single class is enough.

**Two exceptions on padding.** On an `alignfull` *constrained* section, setting
left/right padding to `0` also kills the global padding that aligns its content
to the container — use the root padding value instead. On a genuinely full-bleed
band (a marquee) `0` is what you want.

---

## The editor is the authority on validity — ask it, then fix the source

The static script above catches known mismatch classes, but it is a
reimplementation of WordPress's rules and it will miss cases. The only
authoritative validator is the editor itself, so ask it directly. Open the page
in the editor and read the block tree:

```js
wp.data.select('core/block-editor')
  .getClientIdsWithDescendants()
  .map( id => wp.data.select('core/block-editor').getBlock(id) )
  .filter( b => ! b.isValid )
  .map( b => ({ name: b.name, attributes: b.attributes }) )
```

Anything returned is a block the designer will meet as *"Block contains
unexpected or invalid content"*. Run this after every build and after applying
corrections — not once at the end.

### Navigation — the three core mechanisms behind most header defects

- **The doubled class.** `.wp-block-navigation-item__content.wp-block-navigation-item__content{color:inherit}`
  is (0,3,0) — the same class written twice for no reason but weight. Menu links
  came out black instead of `#757575` against a rule that read as obviously
  correct. Use the block's `textColor` instead of out-weighing it.
- **The submenu is positioned against its own `<li>`, with an edge flip.** Core
  places `.wp-block-navigation__submenu-container` relative to the item and shifts
  it left when it approaches the viewport edge. A mega panel that must span the
  header cannot be positioned this way: make the `<li>` `position: static` and let
  the panel resolve against the header's container.
- **Core styles submenu links itself**, currently `padding: 0.5em 1em` on a
  five-class selector — heavier than the four-class-plus-element rule a theme
  naturally writes. Treat the exact numbers as perishable: what matters is that
  core has an opinion about this element's padding and usually outweighs yours, so
  read the computed value back instead of trusting the declaration.
- **The overlay's `aria-expanded` belongs to the overlay, not the submenu.**
  Inside an open drawer it is permanently `true`, so it can never express a closed
  submenu. The theme has to keep its own state class.

### Dynamic blocks: two ways they render nothing, and one fatal

- **A `file:` render template must print, not return.** WordPress includes the
  file inside its own output buffer and keeps whatever was echoed; a returned
  string is discarded. The block registers, validates, and renders as emptiness —
  which reads as a data problem and is not one.
- **Never declare a function inside a render template.** The file is included
  once per block instance, so the second navigation, card or icon on the page is
  a fatal redeclare — on the front end, after one instance worked perfectly.
  Helpers belong in `inc/`, loaded once.
- **Ids must be unique per instance.** Two of the same block on one page sharing
  an `id` breaks `aria-controls` and every script that queries by it. Use
  `wp_unique_id()`.

### Why the canvas looks different when the front end is perfect

Three causes account for nearly all of it. All three are invisible on the front
end, and the canvas is where the designer works.

- **Core anchors every block root: `.block-editor-block-list__block{position:
  relative}`**, at (0,1,0) — exactly one class, so a single-class rule of yours
  ties and loses on order. Absolutely positioned children resolve against the
  wrong ancestor and drop into the flow; one testimonial section grew from 700 to
  2141px and painted over its neighbours above and below.
- **`max-height` plus `justify-content: center` overflows symmetrically** — half
  above, half below. On the front end the content fit under the ceiling; in the
  canvas the blocks' own spacing makes the column taller, and it spills into both
  neighbouring sections. Make the ceiling a floor: `min-height`.
- **A PHP-rendered block must also be registered on the client.** Otherwise the
  editor calls it unknown — *"your site doesn't include support for the … block"*
  — while the front end renders it perfectly.

**Never resolve it with "Attempt recovery".** Recovery rewrites the saved markup
from the attributes, which discards whatever the markup held and only patches
that one page. The pattern file is still wrong, so the next build reintroduces
the same broken block, and the designer sees the warning again.

Fix it at the source instead:

1. Read the mismatch — compare the block's `originalContent` with what its
   attributes imply, or diff against markup the editor produces for the same
   settings.
2. **Round-trip the block**: build that one block by hand in the editor, save,
   copy the markup WordPress wrote, and put that exact shape into the pattern.
   Faster and more reliable than reasoning about which class is missing.
3. Rebuild and re-run the query above. Repeat until it returns an empty array.

Loading the page fresh matters: a block can be valid in a stale editor session
and invalid after a hard reload, so reload before trusting a clean result.

Also: a block style variation lives in `className` — if the markup shows
`is-style-x` but the attribute does not, the block is invalid and the variation
never applied. And dynamic blocks (`save: null`) are never validated, which makes
them the safe choice for hand-generated markup.

---

### How to measure, not just what

The checks are worthless if the measurement lies, and across four ports it lied
nine times — every one of them sent someone chasing a bug that did not exist.

- **Keep the measuring iframe on screen** (opacity ~0.01, `z-index:-1`). An
  offscreen frame has its rendering throttled: transitions never advance and
  animations never run, so anything animated reads as broken.
- **Disable transitions before measuring** (`transition:none !important`).
  Otherwise the computed value is the transition's *starting* value — and in a
  hidden viewport it stays there forever.
- **Never read a computed style after detaching the frame.** `getComputedStyle`
  returns a live object and yields empty strings once the element is gone.
- **Geometry over computed values.** `getBoundingClientRect()` is a static
  snapshot; computed styles are live and can come back cached when the same
  element is read repeatedly across style changes.
- **In a headless or hidden pane, `requestAnimationFrame` is paused and large
  images do not finish decoding.** Never judge by `img.naturalWidth`, by whether a
  transition finished, or by a screenshot. And never gate a reveal on rAF — in a
  background tab the content stays at opacity 0 forever; apply the class directly
  with a failsafe timeout.
- **Find an overflow by asking, not by reasoning.** Walk every element and collect
  those whose `right > documentElement.clientWidth`. Narrowing down by hiding
  sections and guessing mislabels the culprit when the real one is elsewhere.
- **`getBoundingClientRect()` returns a box for a `visibility: hidden` element.**
  Presence of a rect is not proof an element is visible; check the computed
  `visibility` and `display` too.
- **Layout numbers can come back stale.** One run read `[0,0,0]` for a grid at
  1280 while a targeted re-check showed it was correct. When a reading is
  surprising, take it again from a fresh load before believing it.
- **Never trust `img.naturalWidth` in an automated pane** — it reported 0 for
  every image in one run, including ones visibly rendering at 76×19. To find
  broken images, read the HTTP status of each source instead.
- **Bust the CSS cache before re-measuring.** A fix that "did not work" is often a
  stale stylesheet: bump the theme version or the enqueued asset version, then
  reload. One run threw away a whole measurement pass to this.
- **The decisive control is a clone.** When a block misbehaves, take the live
  block's own attributes off the page, build an identical copy beside it, and
  compare. If the copy behaves and the original does not, the difference is in
  the attributes and a diff will name it — that is how a hung Query Loop was
  traced to one key after two wrong guesses.
- **Validate a negative result against a control.** Before concluding "the rule
  does not apply", build a throwaway element with the same classes in the same
  place. If the control gets the expected value and the real element does not, the
  measurement is wrong, not the code.
- **A CSSOM scanner must recurse into `@media` and see `:where()`.** One that did
  neither reported "no rule matches" twice while the rule was right there.
- **When a hypothesis fails twice, stop guessing and run a decisive experiment** —
  disable the suspected rule, set the value inline, clone the element. Two failed
  guesses cost more than one measurement.
- **Loading is not a defect.** A spinner, a blank preview, an image that has not
  decoded, a Query Loop still resolving — none of these are bugs. Reload once,
  wait, look again. Only what survives a full reload is real. One run spent
  several minutes and an A/B control proving that some spinners were merely slow.
- **Budget the *explanation*, not the fix.** Once a defect is confirmed, fix it —
  a confirmed defect is never deferred. What is budgeted is the hunt for *why*:
  one decisive experiment, and if that does not settle the cause, apply the
  narrowest fix that removes the symptom, write down what is still not
  understood, and raise it in the final summary. Twenty minutes on one
  unexplained observation is not warranted; shipping the symptom is worse.
- **Confirm a defect exists before investigating why.** Reproduce it twice, from a
  clean load, before spending anything on the cause. Most of the time lost to
  measurement across four ports went to explaining things that were never
  broken.

Give font sizes their own element-by-element pass. A 39-element audit in the
reference port caught two wrong sizes that visual inspection had missed every
previous time.

Everything that changes responsively in the source must change the same way
here — sizes, order, visibility, alignment, not just widths.

---

### Git Bash rewrites arguments that start with a slash

*(Windows only — on macOS none of this applies.)*

On Windows, MSYS converts an argument beginning with `/` into a Windows path
before the program sees it, so a CSS selector, a URL path or a jq filter arrives
mangled. The command succeeds, and the rig reports nothing found **on both
sides** — which reads as a page-level defect and is not one. It has broken the
same measuring stand twice in one session. Prefix the command with
`MSYS_NO_PATHCONV=1`, or avoid a leading slash in the argument.

**A command handed to the designer runs in a different shell than yours.** Theirs
is PowerShell; yours is Git Bash, and the two disagree on the pieces that are
easiest not to notice. `&&` does not exist in PowerShell 5.1, and because the
whole line is parsed before anything runs, a chained one-liner executes *nothing*
— which fails safely but costs a round trip and reads to them as a broken
instruction. `cmd //c` is Git Bash's escape for `cmd /c` and is a syntax error
anywhere else. `mkdir -p` is `New-Item -ItemType Directory -Force`. When a
sequence must not stop half-done, open it with `$ErrorActionPreference='Stop'` and
join the parts with `;`.

The general rule: a command you run yourself is written for Git Bash, and a
command you print for the designer is written for PowerShell. They are not the
same text, and pasting one where the other belongs is a defect you handed over.

### Three more ways the instrument lies

- **Measure before the fonts land and every height is wrong.** A reading taken
  straight after `location.reload()` used the system font's metrics; the same
  section, unchanged, was 81px shorter a minute later. `await
  document.fonts.ready` before **any** measurement, without exception — this one
  sends people hunting a defect that does not exist.
- **Resizing a tab that is not fronted does nothing, and reports success.** The
  call returns "viewport set to 1440x900" while `innerWidth` stays 390. Front the
  tab first, then resize, then confirm `innerWidth` is what was asked for before
  trusting anything measured after it.
- **Changing the width without reloading does not re-run the layout.** Readings at
  768 came back byte-identical to readings at 991. Reload after every resize —
  and since that is also when the font metrics reset, the `fonts.ready` wait
  belongs in the same helper.

### Collection traps that fail silently

- **`core/query` with `excludeCurrent: null` hangs the editor preview.** In
  WordPress 7.0 that is the attribute's default; Post Template passes it on as a
  REST argument and the editor store never finishes resolving for that key, so
  the section shows a spinner forever while the front end renders. Write
  `"excludeCurrent": false` explicitly on every Query Loop. One run lost more
  time to this single key than to writing all eight patterns.
- **A `core/post-meta` binding resolves only for the first record in the editor
  preview**; every other card prints the field name. This is a defect in one
  *field*, not a reason to replace the loop. Keep `core/query` and the Post
  Template, keep the card made of real blocks, and swap only the stubborn field
  for a small dynamic block — roughly 60 lines of plain JS reading
  `getEntityRecord( postType, postId ).meta[ key ]` — placed inside the Post
  Template alongside the others. The front end was never wrong here; only the
  canvas was.

- **A meta key starting with an underscore is protected, and `core/post-meta`
  refuses it.** The binding resolves to nothing and the editor shows **the key's
  name where the value should be** — the same symptom as the `supports` trap
  below, from a completely different cause. Check the leading character first; it
  is a one-second test.
- **`register_post_meta` needs `'custom-fields'` in the post type's `supports`.**
  Without it `show_in_rest` is ignored, the REST record comes back with **no
  `meta` object at all**, and there is no error anywhere. Cards then print raw
  field names, every record falls back to the same default, and the sidebar cannot
  write the fields either. This was the single most expensive trap across four
  ports — check it first whenever collection data looks identical across records.
- **Assert the registration instead of trusting it.** This trap has been walked
  into on a run whose skill named it explicitly, because nothing complains: after
  registering, check `is_post_type_viewable()` and that a REST record comes back
  with a `meta` object, and print the result. Two lines, and they turn a silent
  wrong-content bug into a line of output.
- **`is_post_type_viewable()`** — a Query Loop silently falls back to `post` for a
  post type that is not publicly queryable. `public => false` alone breaks it; add
  `publicly_queryable => true`.
- **`is_taxonomy_viewable()`** — `core/post-terms` renders nothing at all for a
  taxonomy that fails it.
- **Never write a selector that assumes the loop's wrapper.** The front end wraps
  each entry in an `<li>` and the editor wraps them differently, so
  `> li:nth-child(even)` breaks on the canvas — use `> *:nth-child(even)`. And
  because each entry is alone in its own wrapper, `.card:last-child` matches
  *every* card; scope it to the list.
- **The `<li>` is the grid item, not the card.** It is the wrapper that stretches
  to the row height, so a card that must fill its row needs `li{display:flex}` with
  the card at `flex:1`. Do not use `margin-top:auto` inside the card to push
  content down — it silently cancels the container's `blockGap`.
- **A CPT rewrite slug can steal a page's URL.** `rewrite.slug = flavours` takes
  `/flavours/` from the page of the same name; make the single-entry base singular.

Also: `get_terms()` does not always return a zero-based list; `array_values()`
before testing `0 === $i`.

---

# Anti-patterns — all of these happened

**Building from a screenshot instead of the source CSS.** Cost a full rebuild.
The per-breakpoint extractor must exist before the first block is written.

**Reporting "the section is converted" while values are still in CSS.** The
designer opens the sidebar, finds it empty, and reads the conversion as failed.

**Modelling decorative elements as empty divs in raw HTML.** Front end correct,
editor half-empty. The rule was already written down — writing a rule down is
not the same as checking against it before shipping.

**Widening a change past what was asked.** A `border:1px solid transparent`
added for alignment overrode a button's colour rule and removed its outline.
Scope the change as narrowly as the instruction; if a broader one seems better,
make the narrow change and offer the wider one in a sentence.

**Trusting your own diagnostic output over re-verification.** Two diagnoses came
from a scanner written minutes earlier; both times the scanner was wrong. Verify
the tool before believing the finding.

**Modelling a hero as an absolutely-positioned Image behind a Group.** The
"legitimately stays in CSS" list permits absolute placement — but only for
decoration. When the absolutely-placed element *is* the section's background, it
is a Cover, and nothing else reads correctly on the canvas.

**Describing an anti-pattern is not the same as preventing it.** "Do not trust
your own diagnosis" is in this list, and a port still shipped two guesses as
fixes. What stopped it was a tool that asks the real validator. Where a rule keeps
being broken, build the check rather than restating the rule.

**Stating a capability is missing without checking.** "SVG uploads are disabled"
— the sanitiser was already installed and active.


---

## Images: three reasons a correct file looks wrong

- **`sizes="auto"` picks a file that is too small.** WordPress marks lazy images
  `sizes="auto"`, and the browser resolves the attribute before the card has been
  laid out, so it chooses a source for a box it has not measured yet. The file on
  disk is right, the CSS is right, and `naturalWidth` comes back at less than half
  the rendered width. Read `natural` against `box` to see it; nothing geometric
  will.
- **`width` and `height` attributes become an `aspect-ratio` that beats
  `width: 100%`.** WordPress writes both attributes, the UA stylesheet turns them
  into a ratio, and inside a flex row that ratio produces an intrinsic width the
  percentage cannot override — so the image sits inside its frame with air on
  both sides. It hides below the width where the frame is narrower than that
  intrinsic width, which is why it surfaces first at 1920.
- **`core/post-featured-image` writes `height` inline on the `<img>`.** The
  figure stretches with its card while the image keeps the height the block put
  on it, so a card that grows to 290 shows a 220-tall picture with a gap beneath
  it. Read the computed height back rather than trusting the CSS you wrote for it.
- **The flex item is often the `<a>`, not the `<img>`.** With `isLink` on, core
  wraps the image in an anchor, so `flex` and `aspect-ratio` written on the image
  land on a child of the flex item and change nothing. Check what the parent's
  actual child is before styling it — two fixes in a row missed for this reason.

## Full-bleed and cover — the mechanisms

**`width:100vw` fakes a full-bleed and breaks on the canvas.** In the editor
`100vw` is the iframe's width while the container is narrower, so the element
renders at roughly half width.

**`align:full` needs an ancestor that declares alignment support.** A full
alignment escapes only a wrapper whose layout allows it. Wrapped in a plain Group
with a `max-width` in CSS, the section is capped by that wrapper and nothing done
to the section will widen it. Check the template part and the page template
first.

**`core/cover` + `contentPosition`.** Setting a content position adds
`has-custom-content-position`, and core's stylesheet then declares `width: auto`
on `.wp-block-cover__inner-container`, so the container stops filling the cover
and shrinks to its contents. The symptom looks identical to a missing container
but has a different fix. It is invisible in the markup — nothing in the block
comment says `width: auto`; it arrives from a class core adds. Core writes that
rule with the position class deliberately repeated
(`.wp-block-cover.has-custom-content-position.has-custom-content-position.is-position-bottom-left …`),
which is five classes, (0,5,0); a two- or three-class override loses silently.

**Text positioned over an image with CSS.** The editor applies none of that CSS,
so the blocks fall into their natural order and the heading lands under the
picture.

**A hand-written block with no `.asset.php`.** `register_block_script_handle()`
silently refuses the handle, the block never registers on the client, and the
canvas reports missing support — which reads like a registration problem and is
not one.

---

## The source itself lies when rendered

Measuring the *source* page in a browser introduces a second, noisier source of
truth. Two real cases:

- **Webflow ID rules outrank class rules.** `#w-node-…{align-self:end}` beats the
  class's `flex-start`, so the class value never applied and the CSS alone reads
  wrong. If a value from the extractor contradicts the rendered source, look for
  an `#w-node-` rule before assuming either is broken.
- **Un-run reveal transforms shift rects by the reveal distance.** With the
  source's scroll animations never triggered, `getBoundingClientRect()` returns
  positions offset by the reveal travel — 20px in one port — while `offsetTop`
  gives the resting value. Use `offsetTop` for source comparisons.

Both are reasons **not** to build a reference dump of the rendered source: each
discrepancy needs its own explanation, none of them changes a value in the port,
and the explanations are unbounded.

---

## `backdrop-filter` makes its element a containing block

An element with `backdrop-filter` — a frosted header bar is the usual case —
becomes the containing block for **every** `position: fixed` descendant. A fixed
dropdown panel or a fixed mobile drawer inside it then resolves against the bar
instead of the viewport: the panel is clipped to the header's height, and the
drawer opens as a strip nobody can reach. One port lost both at once — the header
blurred correctly and the burger menu was dead.

The same applies to `filter`, `transform`, `perspective` and `will-change` with
any of those named: all of them create a containing block for fixed descendants.

Two ways out, and the design decides which:

- move the fixed element **out** of the blurred wrapper, so it is a sibling of the
  bar rather than a child; or
- keep the blur on a `::before` that fills the bar, leaving the bar itself
  unfiltered and still a plain positioning context.

The test is one line in the console: `getComputedStyle(bar).backdropFilter` on
the ancestor of anything that should be fixed.

---

## A CPT without `map_meta_cap` breaks only the editor

Registering a post type with its own `capability_type` and no
`'map_meta_cap' => true` produces a collection that works perfectly on the front
end and is quietly broken in wp-admin: block bindings print their meta keys
instead of the values, the featured image shows a placeholder, and nothing
reports an error anywhere. The capabilities exist by name but map to nothing, so
every editor-side permission check fails closed.

This is the reason a collection can pass a front-end sweep completely and still be
unusable for the designer — which is exactly the case a front-end-only check
cannot catch. Set `'map_meta_cap' => true` whenever `capability_type` is not the
default, and open one entry in the editor to confirm the fields render values.

---

## In the canvas your stylesheet loads *before* core's — a tie loses there

This is the single highest-yield entry in this file. One port traced **eight
separate editor-only defects to it**, reported one at a time by the designer over
an afternoon: grid ratios flattened, absolutely-positioned photographs falling
into the flow, a `space-between` row collapsing, a server-rendered block refusing
to stretch to its row.

On the front end the theme stylesheet is enqueued after core's, so a rule written
at the same specificity as core's **wins on order**. In the editor the order is
reversed. Every rule that merely ties therefore works on the site and silently
loses in the canvas, and the difference never shows up in a front-end sweep.

**The fix is to double the class** — `.theme-who-photo.theme-who-photo` — which
costs (0,2,0) against core's (0,1,0) and wins in both places.

**But double only where core actually contests the property.** The same port then
broke the canvas a second way by doubling everything it had touched: the doubled
fixed heights now outranked its own responsive overrides inside media queries, and
three sections lost their mobile geometry — audience −480px at 768, why-cards
−259px at 390, offers −74px. Doubled base rules and single-class breakpoint rules
are a specificity trap of your own making.

So: grep core for the property, confirm core writes it, double that one rule, and
double the matching media-query rule too or write neither.

### Find them all at once — `templates/canvas-diff.js`

Reading rules and reasoning about order finds these one at a time, which is how
one port shipped nine of them and had the designer report each. Measuring finds
them all in one pass.

The script loads the **front end into a hidden iframe sized to the canvas**, in
the editor's own document, walks every themed element in both, and prints only
the computed properties that differ. Same page, same width, same fonts — so any
difference left is the cascade, and each one is a defect with the front end as
the answer key.

On the port it was written for it returned, at 900px:

```
theme-hero-inner    rowGap: canvas 0px vs front 100px
theme-prog-copy     alignItems: canvas stretch vs front flex-start
theme-prog-body     alignItems: canvas stretch vs front flex-start
theme-aud-head      alignItems: canvas flex-end vs front center
theme-mship-content alignItems: canvas stretch vs front center
theme-mship-list    alignItems: canvas stretch vs front start
theme-loc-info      alignItems: canvas stretch vs front center
```

— seven, in one run, on a page that had already passed a front-end sweep. Two
more appeared at 560px. The designer's report of it was "the text isn't centred
and there are no gaps between it, but on the front end it's fine", which names
two of the seven and none of the rest.

**Run it per page, at every tier of the ladder** — the hits are not the same at
each; the hero's gap only diverges at ≤991, the button column only at ≤567. Then
re-run until it returns zero, and record that zero in the handover.

Two things to configure before the first run, both of which otherwise produce
noise that looks like findings:

- **`SKIP`** — the editor-only wrappers the theme compensates for on purpose. A
  dynamic block sits inside one extra wrapper in the canvas, so `display: flex`
  there against `block` on the site is the theme working, not failing.
- **`NOT_IDENTITY`** — state classes such as a reveal or animation marker. They
  are present in one context and not the other, so leaving them in the key splits
  one element into two and it silently drops out of the comparison.

---

## Core's layout container writes geometry over the design

Core's own layout rules land at low specificity but *before* yours in the canvas,
and several of them contradict a design that never asked for them. All four cost a
real port real time:

| Symptom | What core writes | The answer |
|---|---|---|
| Two buttons on one row end up different heights | `align-items: center` on `.wp-block-buttons.is-layout-flex` | `"layout":{"type":"flex","verticalAlignment":"stretch"}` — a real attribute, not CSS |
| `margin-top: auto` on a card's footer does nothing | `margin: 0` on every flex child of its own layout container, at (0,1,1) | write it at two classes |
| A flex row of cards gains vertical gaps | `blockGap` on a Post Template applies to the `<li>`, not the card | set that template's `blockGap` to `0` |
| A photograph sits at its natural height inside a correct frame **in the editor only** | `core/image`'s `edit()` writes `height: auto` as an **inline** style when the block has a fit but no ratio | the one place `!important` is correct, and only in `editor.css` |

The buttons case is worth spelling out because it looks like a design decision.
A design row of two buttons is a plain flex container with the initial
`align-items: stretch`, so a shorter button **grows to match** the taller one.
Core centres them instead, and each keeps its natural height — so a primary with
`padding: 14px` and a ghost with `min-height: 48px` come out 53.59 and 48. Nothing
is wrong with either button; the row lost its stretch. Check `verticalAlignment`
before touching either button's padding.

---

## `hidden` has no specificity and loses to everything

The `hidden` attribute is styled by the UA as `[hidden] { display: none }` at
specificity (0,1,0) — but a stylesheet rule like `.drawer-sub { display: flex }`
ties it and wins on order. The symptom is every collapsible panel in a drawer
opening at once while `el.hidden` is perfectly `true`, so the JavaScript looks
broken and is not.

Any component whose resting state is driven by `hidden` needs the rule written
back explicitly, next to the one that fights it:

```css
.theme-drawer-sub[hidden] { display: none; }
```

---

## A published page is a *copy* of the pattern, not a reference to it

When a page is built by inserting patterns, WordPress flattens them: the page's
`post_content` holds the pattern's markup, and nothing links back to the file. So
editing `patterns/whatever.php` changes **what a future insertion looks like and
nothing that is published.**

One port fixed a button row in the pattern, reloaded the site, measured the exact
same wrong value, and briefly concluded the fix had not worked. It had — on a file
nothing was reading.

Every correction to a built page is therefore **two** writes: the pattern file, so
the next insertion is right, and the page's stored content, so the live page is.
Do the stored one as a surgical `str_replace` of one exact substring, assert the
occurrence count is 1 before writing, and check the length delta afterwards — a
designer's own edits may be sitting in that same content.

The alternative is to have the page hold `<!-- wp:pattern {"slug":"…"} /-->`
references, which stay live. That is worth choosing deliberately at build time:
references keep the file authoritative, flattened copies let the designer edit
freely in the page. Ask before assuming.

---

## The CLI PHP you built an ini for will move under you

Local has no `php.ini` for its CLI binary, so the run hand-writes one naming an
`extension_dir`. Local then updates its bundled PHP — `php-8.2.27+0` becomes
`php-8.3.29+1` — and every script dies with **"Please check that the mysqli PHP
extension is installed and enabled"**, which reads like a database problem and is
not.

Same family as the moving MySQL port: nothing in this environment holds still
between sessions. When a script that worked yesterday cannot see an extension,
list `lightning-services/` before debugging anything else, and point both the
binary and the `extension_dir` at whatever is actually there now.

---

## The editor settings object lies about which presets the client can pick

`getSettings().__experimentalFeatures` carries **every origin bucket** — `default`,
`theme`, `custom` — side by side, and it keeps carrying core's `default` bucket
after `defaultPalette`, `defaultFontSizes` and `defaultSpacingSizes` have been set
to `false`. Those flags govern what the **UI merges**, not what the settings object
holds.

Read it and you will "find" that the client sees 26 colours, 14 gradients, 24 font
sizes and 37 spacing steps, half of them WordPress's own — a serious-looking
defect that does not exist. One run got as far as drafting the fix.

Count the swatches in the picker instead. Select a block, open the colour panel,
and read `.components-circular-option-picker__option` — 14 in, 14 out, and the
question is answered in one call:

```js
[...document.querySelectorAll('.components-circular-option-picker__option')]
  .map(s => s.getAttribute('aria-label'))
```

The general form: **an internal settings object is not the interface.** Anything
you intend to report as "what the client sees" is read off the screen they see.

---

## Two ways a browser test lies about the thing it is testing

Both were self-inflicted in one port, and both produced a confident wrong
conclusion about working code:

- **`new MouseEvent('click')` is not cancelable by default**, so the handler's
  `preventDefault()` is a no-op, the anchor navigates, and the test concludes the
  script never loaded. Pass `{ bubbles: true, cancelable: true }`.
- **`getComputedStyle` returns a live object.** Capture the values you care about
  into plain numbers or strings *at the moment you read them*; holding the object
  across a later click reports the new state as if it were the old one.

And one about measuring: **a cross-origin iframe has no `contentDocument`, and a
cross-origin `fetch` is refused.** A harness on `127.0.0.1:8099` cannot measure a
page on `project.local` at all, and the failure is a null dereference or a bare
"Failed to fetch" rather than a security message. Serve the design and a fetched
copy of the port from the same origin, then a whole breakpoint ladder costs one
browser call.

---

## A background tab stops the clock, and every reading built on it is wrong

A tab that is not fronted does not advance the document's animation timeline and
does not call `requestAnimationFrame`. Two consequences, and one run met both in
the same minute:

- **A CSS animation reads as broken.** `playState: "running"` with
  `currentTime: 0`, forever, and the element sitting at its `from` state. It looks
  exactly like missing keyframes. The keyframes were fine; the tab was hidden.
- **Anything a script defers to `requestAnimationFrame` never happens.** A reveal
  pass scheduled that way left every revealed element at `opacity: 0` — the whole
  page blank — and no error anywhere.

So: front the tab before reading animation state, the same as before resizing it.
And in the theme's own code, **never gate a visible resting state behind
`requestAnimationFrame`** — a real visitor can open a page in a background tab
too. A timeout fires either way.

---

## The reveal pass must run when the layout has settled — and four signals do not mean that

A scroll reveal reads element positions to decide what is already on screen. Run
it before the images have height and every section measures as sitting inside the
first viewport, so the entire page is marked shown and nothing ever animates.
Measured on one page: **38 of 38 revealed at load, 32 of them below the fold.**

Four signals were tried and none of them is the one:

| Signal | What actually happens |
|---|---|
| `DOMContentLoaded` | no image has a height yet — the original bug |
| `readyState === 'complete'` | already true for a deferred script, so it is the same moment under another name |
| `document.fonts.ready` | says nothing about images |
| `requestAnimationFrame` | never fires in a background tab (above) |

The lesson is larger than the fix: **instrument the precondition instead of
iterating the trigger.** The condition being waited for is "the images have
height", and four attempts were spent guessing at signals without once measuring
element heights at the moment the pass ran — which would have answered it
immediately. When a fix does not take, read the thing the fix depends on.

Two more things to know before debugging this: the failsafe timeout inside the
pass will mark everything shown a few seconds in, so **take the reading before it
fires or the page always looks broken-then-fine**; and if the initial pass
shortcuts "already on screen", remove that shortcut — the observer reports
immediately for whatever intersects, so the first screen still appears at once,
and only a genuinely zero-area element needs a shortcut at all.

## Nine that cost a day between them, all of them WordPress's own behaviour

Collected on one port; none is project-specific.

| Trap | Why |
|---|---|
| Fragments in a subdirectory of `patterns/` raise *"Slug field missing"* on every request with `WP_DEBUG` on | core scans with `get_files( 'php', 1, true )` — depth **one**, which includes subdirectories. A comment in the theme asserted the opposite and was believed for a week. Keep non-pattern includes outside `patterns/` |
| An audit of "which patterns are unused" reports every pattern used | a pattern file carries its own `Slug:` in its header, so the search finds it in itself. Exclude the file being tested |
| A filter on `option_<name>` never fires in a test | `get_option` applies `default_option_<name>`, not `option_<name>`, when the option does not exist. Set the option in the test instead of filtering it |
| A cache-invalidation test passes while nothing is ever invalidated | `update_post_meta` with the value it already holds fires no hook. The test has to change the value |
| A rule correct on a nested block fails on a top-level one **in the canvas only** | the canvas gives a top-level block `.block-editor-block-list__layout.is-root-container > …` — two classes — where a nested block meets only a `:where()` worth nothing. Theme CSS is injected before core's, so equal specificity loses the tie. Three classes, not two |
| A band renders as its tablet layout in the editor and its desktop layout on the page | the canvas is narrower than the window by the width of two panels — about 1,160 at a 1,440 window — so every `max-width` tier fires one step early. Not a defect; check before chasing one |
| Escaping that escapes nothing | `str_replace( '<', '<', $json )` — the same character on both sides, under a comment claiming it was the protection. Prefer a flag (`JSON_HEX_TAG`) to a hand-rolled replacement: a flag cannot be written so that it silently does nothing |
| Text sanitised and still carrying live markup | `html_entity_decode( wp_strip_all_tags( $x ) )` strips real tags, then turns `&lt;script&gt;` back into one. Reversing the order is safe and eats legitimate text like `status <2`; strip, decode, then strip again **only if** the decode produced something tag-shaped |
| A stored setting reaching a `<style>` block through a character blacklist | a blacklist answers "is this one of the things I thought of", and `url()` passes it. Validate by the **kind** the control collected — colour, length, number, weight, keyword — and refuse a kind nobody declared |
