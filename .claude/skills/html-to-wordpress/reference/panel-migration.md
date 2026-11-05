# Moving a site that was styled in CSS onto the panel

Open this for one job only: an existing site whose values live in stylesheets and
in the "Additional CSS class(es)" field, which now has to hold those values on
the blocks themselves. **A fresh port never needs this file** — there the values
go into the panel the first time they are written.

The job is not "add a panel". It is **moving a decision from a place the client
cannot see to a place the client can**, without the page changing by a pixel.

---

## 🔴 The two rules the whole job stands on

**Prove every move by measuring, before and after.** Same elements, same widths,
animations stilled, the baseline taken *before* the first change. "It looks the
same" is not proof and never was.

**Move only a value that nobody else still decides.** If a second source has a
say, the value stays in the file. The four second sources are in their own
section below, and each of them has cost a measured defect.

---

## What to measure, and how

**A fingerprint of the rendered result, not a reading of the file.** For every
record and every pattern, collect the sequence of elements that carry the thing
being moved, together with *which* thing. Snapshot, move, snapshot, compare.

On one port, 1250 uses of animation classes moved out of the class field this
way: 35 records and 76 patterns, sequences identical before and after. That is
the whole proof, and it takes minutes to collect.

### Sizes are measured, never read off a file

🔴 For a colour, reading the stylesheet is enough. For a padding or a width it is
not: the file does not say which rule wins at which width, and `getComputedStyle`
answers with the number the browser **used**, not the number somebody wrote —
`auto` comes back as `318.4px`.

The honest method is to walk the cascade at a real viewport: every matching rule
in its own order, skipping media queries that are not in force, with `!important`
winning as it should. Seven widths.

Three filters, without which the plan lies:

- a value the panel **already holds** is skipped;
- a band keeps only what differs from the band it inherits;
- **everything the browser would do anyway** is thrown out — `margin: 0` from a
  reset, `width`/`height: auto`. On one pass that last filter removed 370 of 896
  candidates.

### Still the page first

Animations and transitions make the same state measure differently on every run.
Kill them, measure one state twice, and only then believe a difference. A photo
that grows into its frame measures 0.88 of its size halfway through, and that
reads exactly like a real discrepancy.

---

## A class moves whole, or not at all

The stylesheet that holds a section usually loads **after** the one the panel's
generated rules live in, at the same specificity. So **any band left behind beats
the panel**. Move six screens and leave the seventh in CSS and the migration is
silently undone exactly there — on one screen, which is the one nobody opens.

Decide per class, not per value: either every band it declares comes across, or
none does and the class stays.

## Copy the computed value per band, never the rule

This is the mistake that looks most like diligence.

A rule written `@media (min-width: 992px) and (max-width: 1279px)` **does not
reach 900px**. The panel's band for that range **does** — bands cascade outward
from the middle, so a value put on it carries down to 900, 700 and 500 unless a
narrower band stops it.

Transcribing the rule therefore changes the page wherever the original query was
closed at both ends. **Measure what actually applies at each of the seven widths
and write those seven numbers**, even when that means writing the same number
twice.

Measure with **computed styles**, not `getBoundingClientRect()`: a width-set
iframe is scaled to fit the pane, so rectangles come back a few pixels short and
read as a regression that is not there.

## The four second sources — why a value may not move

Inline wins over everything, so a value that moves onto the block **stops
listening** to anything the file still says about it.

| Second source | What happens | Example |
|---|---|---|
| **another screen** | the element has its own value under a media query; inline is stronger than any width, so narrow screens silently take the wide value | a lead paragraph with its own size under 767 |
| **a state** | `:hover`, `.is-on`, `[aria-selected]` | the state would never show again |
| **a parent** | a descendant selector sets a different value in one context | 15px inside a list where the element alone is 16 — and **WordPress prints its size classes with `!important`**, so inline beats even a two-class selector |
| **a variant of the same element** | `.card.is-top` is not `.card` | its padding belongs only to blocks that carry `is-top` |

Measured consequence of getting the third one wrong: one section grew 8px, which
nobody notices until the designer does.

### Two traps in the check itself

- **A rule for a child is not a conflict.** `.wrapper a` does not compete with the
  wrapper's own value; the child wins for itself either way.
- **Match the class as a whole word.** Otherwise `.card-step` reads as a context
  for `.card-st`.

Those two mistakes turned 15 real findings into 59 on one run. Fix the checker
before trusting its count.

---

## What a control can actually read

### Core's spacing control reads presets, not raw tokens

**The commonest cause of "the value is there and the panel is empty."**

`padding: var(--space-30)` and `padding: var:preset|spacing|space-30` put the
same number on the page. But core's spacing control only understands the preset
form — a raw token does not exist for it, and the client sees "Default" where
there plainly is a padding.

One port had 286 raw against 1438 presets. Every token in use already had a
preset in `theme.json` except one, which had to be added.

### Radius has no presets at all

WordPress offers no spacing-style presets for border radius, and its control
takes a number with a unit. A token will never appear in it.

**The choice is real and it belongs to the designer:** either the radius becomes
a block style chosen by name, or it becomes a typed number — and then it stops
reading the token. Ask; do not pick.

### A group offers only what the block can answer

🔴 "Where the photograph sits" on a paragraph is a question with no answer. A
group of settings may name the blocks it belongs to and show only for them; a
group that names nothing stays everywhere.

And **the group's own kind has to reach the editor, not just be declared.** On one
build the localiser passed three of four group flags; the panel failed to
recognise the fourth, filed it under dimensions, and drew a pixel stepper for a
phrase like `center 25%`. Field width went with it: three columns are right for
top/right/bottom/left and wrong for one phrase.

---

## Where the value ends up, and what that costs

### The panel's own values are `!important`

Padding, margin, min-height, gap and the layout words are printed with
`!important`, so **moving a value into the panel changes its precedence, not just
its home.** A rule that used to lose can start winning. This is the mechanism
behind most "but I only moved it" surprises.

### Some settings reach the saved markup, and some do not

| Setting | Lives in | So to change it |
|---|---|---|
| the panel's own (`<prefix>Size` and its kin) | the block comment; the server prints it at render | editing the comment is enough |
| core's own (`style.spacing.padding`) | the comment **and the saved tag** | the tag has to be rewritten too |

Get this wrong and the page renders the old way while the block turns invalid:
the comment says forty, the tag says zero. It is worth a script of its own —
every side the comment promises must be present in the tag.

### Hide on a screen is a toggle, never a rule in a file

🔴 `display: none` in a media query is the one change that makes a page look not
different but **broken**, and the one the client can neither see nor undo. It
belongs on the block, as a toggle for exactly that screen, and it must not
cascade the way a size does.

It fits existing per-screen machinery almost without code: one allowed word
(`display` ← `none`), a toggle control, and seven rules of the form
`[style*="--prefix-hide-767"] { display: var(--prefix-hide-767) !important }`
inside the matching query. The server writes the value into `style`, so it never
reaches the saved markup and cannot invalidate a block.

**The toggle can hide from a band downwards; it cannot show something back.** The
base rule has no media query, so "hidden at base, visible at 767" cannot be said
with it. Those cases stay in the stylesheet — say so out loud rather than letting
it be discovered later.

**And count before promising.** On one site, the stylesheets hid things 38 times.
Ten of those could move. On an editable block it was **three**: seven were inside
server-rendered blocks, where the editor has nothing to switch, and the other 28
were states, variants, pseudo-elements, descendants and off-grid queries. "Move
them all" would have delivered 3 of 38.

---

## Content and patterns move differently

**This is not a detail.** Content can be parsed into blocks and serialised back.
A pattern cannot: it is PHP, and half of any real pattern library prints
something into its markup. Parsing it would run that PHP and write its answer
into the file — destroying the very thing that makes it a pattern.

**Patterns are edited as text:** read the JSON in the block comment, rewrite it,
and remove the same words from the first `class="…"` after the comment, which is
the block's own tag.

**Content is edited through the editor's store:** merge the attributes,
`resetEditorBlocks`, `savePost`. The editor writes the markup, so it cannot come
out invalid.

### A class lives in two places

In the block's attributes and in the saved markup. Remove it from both, or the
editor sees a block whose markup is not what it would have saved and calls it
broken.

### Every move is made twice

A pattern is a **starting point**; editing it does **not** change a page already
built from it. So every migration runs over the theme's files — so a new record
starts out right — and over the live content — so what the client opens today is
already right.

The one exception is visible in the markup: a page stored as
`<!-- wp:pattern {"slug":…} /-->` holds a *reference* and renders the pattern
every time. Those pages change the moment the file does, and a content pass skips
them entirely because they contain no blocks to find.

### Removing a value from the stylesheet is only safe where the pages already carry it

Obvious, which is exactly why it gets skipped. Deleting a padding from the CSS
costs nothing on a page whose blocks already hold it, and costs precisely that
padding on a page that has not caught up.

Two kinds lag, and both are easy to forget:

- records whose class still sits in the "Additional CSS class" field, so no
  attribute pass ever touched them;
- **cards drawn by a template or a template part** rather than by any pattern.
  Templates and parts are places where blocks live too.

Measured on one port: an archive lost 73px and a detail page lost 125px at 767,
from a deletion that was correct everywhere else.

---

## Two things the editor has to be asked, not guessed

### `serialize()` returns the whole block, not the opening tag

`wp.blocks.serialize()` is the only honest way to learn what markup core will
write for a given set of attributes. But it returns the **entire** block,
closing tag included: `<p …></p>`.

Written into a pattern as-is, that produces `<p …></p>` in front of the text and
the pattern's own `</p>` after it. Take everything up to the first `>` — **except
for an image**, where the tag is a whole `<figure><img/></figure>` and what has
to go is the markup that was already there.

This trap repeats. On one port it was recorded, and then hit again a few hours
later by a second pass over the same files, leaving seven blocks with a spare
`<img/></figure>` in the tail. **Validate after every pass, not at the end of the
day.**

### An empty media block has an exact shape

A pattern offering empty tiles must write them the way core would, or all of them
are invalid from the start:

- empty image — `<figure class="wp-block-image CLASS"><img/></figure>`, **with**
  the empty `<img/>` inside;
- empty video — `<figure class="wp-block-video CLASS"></figure>`, with **nothing**
  inside.

Ask the editor rather than remembering:
`wp.blocks.getSaveContent( wp.blocks.getBlockType( name ), attributes )`.

---

## Background and section padding: two values that travel with company

### A background cannot move on its own

Core gives any group or paragraph carrying `has-background` a padding of
`1.25em 2.375em` — twenty by thirty-eight. So a background moves **together with
a padding**, or boxes grow.

Of 60 elements taking a background on one port, **30 had no padding at all** —
they need an explicit honest zero, and that zero is what cancels core's. Fifteen
had one value, thirteen changed it with width, two were also given padding by
something else.

The check that catches this: look for a block with a background and no padding
at all, across patterns, templates and the database. One surfaced a day later —
a 40×40 numeric badge stretched beyond recognition.

### A section that matches the default carries nothing

If the base stylesheet gives every section its top and bottom padding, then a
section that does not deviate holds **nothing** in the panel: on one port 168 of
258 showed "Default" on a section whose padding plainly exists.

The fix is that every section states its own padding, as a preset. The value does
not move — the section class redefines those presets on itself, so the ladder
still steps with width — and the rule stays in the file, because PHP-drawn
sections still read it and an inline value on a block overrides it anyway.

**Name the exceptions rather than guessing them.** The handful of classes that
override that padding are found once and listed.

---

## Merge, never replace

Before writing a value into a block, **look at what the block already has.**

On one pass, backgrounds were moved and the padding was taken from the
stylesheet; for thirty elements the stylesheet was silent, so a zero was written.
But silence in the stylesheet does not mean there is no padding: five of them
carried it **on the block itself**, and the zero erased it. One card lost its
padding on every screen above 767, and the designer found it, not the check.

---

## A side-benefit worth taking while you are in there

A section that is a plain group can be made into a **pattern edited in place**
with nothing but metadata in the block comment:

```
"metadata": { "categories": ["theme-sections"],
              "patternName": "theme/post-article",
              "name": "Post — the article and its rail" }
```

That is enough for the editor to call the section a Pattern, show its name in the
block list instead of "Group", and offer "Edit pattern" — while the blocks stay
editable where they are, separately on each page. Nothing is shared and nothing
is locked.

A converter that builds pages without writing this leaves a block list reading
"Group, Group, Group". On one port, adding it fixed 136 sections across 18 pages.
The metadata lives in the comment and never reaches the saved markup, so it
cannot invalidate a block.

**What this cannot do:** a detail page cannot *be* a pattern reference — the
reference renders the pattern's sample words, so every record would read the
same. And it cannot become a synced pattern if the sections genuinely differ:
measure before assuming they are alike.
