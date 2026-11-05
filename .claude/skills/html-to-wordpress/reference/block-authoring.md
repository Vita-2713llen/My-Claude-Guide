# Writing the theme's own blocks

Open this when registering a block, deciding what its sidebar offers, or working
out why a control shows the wrong thing.

The hard rules are in `SKILL.md`: one registration place, `supports.inserter:
false` for anything that only means something inside another block, `static` in a
render file does not persist, and a panel offers only what the block can answer.
This file is the detail behind them.

---

## `block.json`: the two lines that are always missing

**`supports`** — what the editor will offer for this block. No `spacing` → the
client cannot set a padding; no `color` → cannot set a colour; and they go and
type a class into "Additional CSS class", which is the field the whole method
exists to keep empty.

Declare **what the block can genuinely answer**, and no more: an extra control is
worse than a missing one. "Where the photograph sits" on a paragraph is a question
with no answer.

**`example`** — what the inserter shows on hover. Without it the block is a blank
grey card in the list, and choosing between two similar blocks becomes guesswork.
Five lines with a couple of typical values.

**And check `supports` before writing an attribute.** An unsupported one is kept
on the front end and dropped by the editor — the classic "it works on the site and
resets in the editor".

---

## The inserter: three groups, and a rule that can be checked

With more than two dozen blocks of its own, one shared inserter section becomes a
dump: a section meant for a page sits next to a wrapper meant to hold things,
next to a piece of the header that has no business on a page at all.

Three groups that have earned their place:

1. **The project's name** — sections and elements placed into content.
2. **Wrappers around content** — blocks that hold other blocks.
3. **Header and footer** — things that only mean something in template parts.

The line between the first two is not a matter of taste: **a wrapper is a block
whose `save()` returns `InnerBlocks.Content`.** If it returns that, it is a place
to put things; if not, it is a thing. That rule does not need remembering, it can
be tested.

Categories are named and ordered deliberately — what the client places most often
goes highest. And both registries have to be filled: blocks and patterns are kept
separately, so one call does not cover the other.

### Hiding, and the safety catch without which hiding is dangerous

- **`ancestor`** — for the insides of a card that read the current record. Core
  removes them from the inserter outside a loop by itself.
- **`supports.inserter: false`** — for parts of a composition: a transparent
  button over a card, decorative bars, slider arrows, "read more". Patterns still
  place them.
- **`allowed_block_types_all`** — for families of blocks tied to one post type.

🔴 **The safety catch: a block already standing in content stays allowed in spite
of the rule.** Without it, a decision about the inserter turns into "this block is
not supported" on a live page.

**And dead registrations accumulate.** A block that was replaced stays registered
and keeps being offered. A **registered-versus-used report** belongs in the final
pass.

---

## Core's controls the client does not need

**There is no filter.** These controls are written inside core's `edit`, not
declared as supports. The only lever is a class on `<body>` driven by the selected
block, plus CSS. That is a documented hack rather than "the right way", and it
should be described as exactly that.

Worth removing, each for a reason:

- **Alt text in the image block.** Alt belongs to the photograph: written once in
  the Media Library, correct everywhere. The field in the block overrides it for
  one case — so one photograph ends up described three ways on three pages.
- **Video playback settings** (autoplay, loop, muted, controls, playsinline,
  preload, poster) — seven decisions the page has already made.
- **"Described as" on a map** — asking the client to describe the thing whose
  address they just typed. The label should be assembled from the address.

**And the address field must accept a link.** Somebody who has just found a place
has a link in hand, not a retyped address. Parse `q=`, `/place/Name/`, `@lat,lng`,
`!3d!4d`; follow a shortened link once and remember the answer for a month.

---

## Font size: the knot that takes three attempts

- **Presets in `theme.json` turn the field into S · M · L.** The client neither
  sees nor types a number.
- **Removing the presets is not enough:** core draws an empty row of buttons and
  hides the number behind a "Set custom size" toggle. There is no "always a
  number" setting — it takes a script that presses that toggle when the preset row
  is empty.
- **Having removed the presets, declare `.has-*-font-size` yourself**, with the
  same tokens and the same `!important` WordPress was printing. Otherwise every
  pattern silently loses its sizes.
- **An empty field must show the inherited number**, not the file's number for
  this width — otherwise it lies the moment Base changes.
- **Gutenberg only displays plain numeric values.** `var(--fs-16)` and an
  unregistered slug both give an empty field. That is the cause of half of all
  "why does it not show the size".

### And the client's request for "big" and "small" text is not a size field

It is **style variations for `core/paragraph`** — "Large paragraph", "Small
paragraph". The client picks from a list, the value stays in one place, and a
design change is one rule rather than a tour of every page.

Thirty paragraphs with thirty different numbers is what the size field produces,
and there is then no way to change them all.

The same for lists: if a list has its own look — ticks, circled numbers — that is
a **list style**, not a group with a class around it.

---

## `static` in a render file does not count

🔴 A question and its panel must share one id: `aria-controls` on the button, `id`
on the panel. It cannot be typed — it has to differ for every pair on the page and
match inside the pair. The obvious move is to count: `static $n = 0; ++$n;` in
`render.php`.

It does not work. **Core includes the render file inside a closure it rebuilds for
every block**, so the static variable starts at zero each time. Measured: six
questions, six panels, **all six with the same id** — five unreachable by name,
and a screen reader saying every button opens the same thing. No error anywhere.

A static variable in a **named function** of the theme does persist, because the
function is declared once. The counter lives there and the render calls it.

---

## Things that are written to the log on every request

**A block registered twice.** WordPress keeps the first registration and logs the
second:

```
Notice: Function WP_Block_Type_Registry::register was called incorrectly.
Block type "theme/map" is already registered.
```

Nothing breaks on screen, which is why it lives for months. It happens when a
block is registered both by a loop over the `blocks/` folder and by hand in some
`inc/*.php`. 🔴 **Registration is one place** — the loop. If a block needs a
`render_callback` or anything unusual, that is an argument in its own
`block.json`, not a second registration beside it.

**A translation asked for before `init`.** A function called at file-include time
whose strings use `__()`. WordPress loads the domain too early and says so on
every request. Move it to `init` — the hooks it attaches to fire later anyway.

Both are invisible without `WP_DEBUG_LOG`. To hear them **before** block
registration happens, a callback written into
`$GLOBALS['wp_filter']['doing_it_wrong_run']` before `wp-load` catches
`WP_Hook::build_preinitialized_hooks` — the only way to be early enough.

---

## A field that will not accept input is usually not React

An option registered with `'default' => array()` arrives in JavaScript as an
**empty array**. JSON does not keep string keys on an array, so everything written
into it disappeared on the way back. The symptom: the field takes one character
and immediately empties.

**Rule:** coerce any value from `useEntityProp` to an object before writing into
it. **And the diagnosis:** when a controlled field will not accept input, look at
the **type** of the value before looking at the component.

---

## Numeric-looking keys sort themselves

A breakpoint map passed from PHP as `base, 1279, 1099, 991, 767, 567` came out in
the panel as `567, 767, 991, 1099, 1279, base`.

The cause is the language, not the code: **a JavaScript object puts
integer-like keys first and in ascending order**, whatever order they were written
in. A PHP array keeps its order, JSON carries it, and `Object.keys()` rebuilds it.

**Order that matters is passed as a list, not as a map.**

---

## Small traps worth having as a list

- `unregister_block_style()` does **not** remove styles declared in core's own
  `block.json` — only `wp.blocks.unregisterBlockStyle` under `wp.domReady` does.
- In the Customizer, **labels are escaped and descriptions are not**.
- `query_loop_block_query_vars` bound to `queryId` is the only way to exclude the
  current post from a Query Loop.
- `display: contents` on the `<li>` in `post-template`, so the grid lays out the
  card itself.
- WordPress caches the theme's pattern file list in a transient — a new pattern
  does not appear until it is cleared.
- In `template-locked` mode **`core/post-content` is the only editable region**;
  without it there is nowhere to type in the post editor.
- `useRootPaddingAwareAlignments` puts the side padding on `.has-global-padding`,
  not on `.wp-site-blocks`.
- Size preset classes are generated **with `!important`**.
- Core's `.is-dark-theme .wp-block-video :where(figcaption)` (0,2,0) beats a rule
  with one class.
- **Pseudo-elements collide:** the editor draws a block's outline on `::after` of
  the same element. Hang your own graphics on `::before`.
- A low `pm.max_children` in a local stack is the cause of a 502 at roughly 33
  parallel `ServerSideRender` calls in the editor.
- `wp_delete_user( $id, $reassign )` **moves** the content, it does not delete it.
- A section drawn by the template always renders **after** all the content — if a
  different order is needed, it has to live in the content.
- A column class on `core/post-content` **traps every full-width section** inside
  that column.

---

## Before handing a block over

- **Read its sidebar out loud.** No attribute names, no storage keys, no
  `[object Object]`, no free text box where a list belongs. 🔴 A storage key in a
  free text box is a question nobody outside the theme can answer, and one typo
  silently unlinks every card on the page — offer a labelled list built from the
  same config the render reads.
- **A dynamic block says what is missing** rather than rendering empty.
- **Test it by adding one item and deleting one**, in the editor.
- **Paste parity:** a fresh copy of the block, diffed against the one in the
  pattern, computed style by computed style — only per-instance attributes and
  section geometry may differ.
