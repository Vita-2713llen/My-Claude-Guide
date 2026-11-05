# What is a block, what is a field, and what is neither

Open this when deciding how a section will be edited — before building it, and
again when a section built one way has to become the other.

The governing question is in `SKILL.md`: **does this entry have a page of its
own?** Has one → blocks. Has none → fields. Everything here is what that answer
does not settle.

---

## The line is not "blocks versus fields"

It runs between **what the client writes** and **what the designer drew**.

A section of 39 cards, fifteen sub-values each, of which two are text: the other
thirteen draw an illustration — a ring with a percentage, a chart, bars, three
possible shapes. Turning that into "ordinary blocks" means forty lines of SVG in
the page per card, which the client cannot edit and can easily break.

So the card became a block of its own: **heading and text are ordinary blocks
inside it**, edited in place, while the shape of the drawing and the numbers that
feed it are settings on the card. Adding, removing and reordering a card works
like any other block.

The canvas then shows what the client can affect — the photograph under the
drawing, a caption naming the shape, the live text. The drawing itself is
assembled in PHP.

---

## A row of cards is three layers, and each one is edited

The first version of such a section is always **one block for the whole row**: a
column of tick boxes in the sidebar saying which records to show. It looks tidy
and it cannot be edited.

| Layer | What it is | What the client gets |
|---|---|---|
| the row | a plain **Group with a `grid` layout** | how many columns, what gap, what else stands in the row |
| the card | **the theme's own block** with `providesContext` | which record it points at |
| the card's contents | **core blocks**: featured image, title, excerpt, read more | add a line, drop the button, reorder |

The key is `providesContext`. The card draws nothing itself:

```json
"attributes": { "id":       { "type": "number", "role": "content" },
                "postType": { "type": "string", "role": "content" } },
"providesContext": { "postId": "id", "postType": "postType" }
```

Core blocks inside then read that context, exactly as a Query Loop hands each
post to the blocks that draw it. Nothing is typed by hand: rename the record and
it renames on every card, and the card can still be taken apart.

### Three things it will not work without, and none is obvious

**1. `core/post-title` does not read the context.** It calls `get_the_title()`
with no argument, deliberately, so the preview shows what is being typed right
now. The photograph, the text and the link on the card come out right and **the
title on all three cards is the page's title** — which reads as a broken context
when the context is perfectly intact. Swap the global `$post` for the duration of
the card: `render_block_data` fires before the block, `render_block` after what
it produced, and everything inside is drawn between them. Keep a stack — a card
may one day hold a card.

**2. `role: "content"` on the attributes**, or inside a pattern the block becomes
`disabled`: visible, not selectable. A pattern is content-locked and core admits
only what it considers content.

**3. `InspectorControls` with `group: 'content'`**, not the default. In a locked
pattern a block's ordinary panels are not drawn at all — the card can be selected
and there is nothing to set. Core puts an image's Replace in the same group. And
**`props.isSelected` is required**: the `content` slot collects the fills of
*every* content block in the locked section, so without that check a row of three
cards puts three identical panels in the sidebar.

### Two smaller ones

An animation delay does not belong in an attribute — a class that counts the
card's position in the row survives a fourth card inserted in the middle. And
`subgrid` belongs to **the row**, not the card: a card dropped on a page by
itself, with `grid-template-rows: subgrid` and no grid above it, lays itself out
at random.

---

## Turning a field-driven section into blocks

Four things to know before starting, in the order they bite.

**The number of items is sometimes written into the CSS.** A row of facts built
as `repeat(3, minmax(0,1fr) 1px) minmax(0,1fr)` — seven tracks, because the
dividers between facts are grid items. That works while PHP prints the markup
and breaks the moment a client adds a fifth fact. Before converting, search for
exactly this: `grid-template-columns` with an explicit list, `nth-child` with
real numbers, elements that exist only as separators.

**Geometry is recomputed, not carried.** Between two facts there was a 40 gap, a
1px rule and another 40 — 81 in total. Keep `column-gap: 40` and drop the track
and every column grows by 30 and all of them shift. Measured: positions
175/365/556/747 became 175/356/536/717 after the naive substitution.

**Core brings different wrappers.** A `<div>` becomes `wp-block-group`, text
becomes `<p>` with document margins, a featured image becomes `<figure>`. The
minimum answer is `margin-block: 0` on the children of `.is-layout-flow` inside
the section, `margin: 0` on classed paragraphs, and `font: inherit` where the
class used to sit on a container. **Without `:where()`** — core writes its own
rules inside it, so anything beats them.

**Two ways of drawing one section have to coexist.** A collection of thirteen is
not converted in one sitting, so the dynamic block asks `has_blocks()` about the
record's content and stays silent for the converted ones. Nothing to switch on,
nothing to remember. One trap: for a block that returned nothing the editor shows
its own "disabled" placeholder, which is untrue and points at a switch that does
not exist — so for a converted record the block prints an honest line into the
canvas instead.

**And the dullest one:** a new file in `patterns/` does not appear in the editor
by itself. The theme caches the list, and until the cache is cleared the pattern
simply is not in the inserter — no error, no hint, file present and correct.
Check the REST answer, not the file.

---

## A section left in the template ends up last

When a detail page moves into the content one section at a time, the rest stay in
the template **after** the content. While the early sections move, the order
holds. Then a section that belongs *between* two others finds itself after both.

A dynamic block lives perfectly well in the content — it reads the record just
the same — so it moves there, into its place, and the template goes back to being
header, content, footer.

**Check this by comparing the order, not by looking at a section.** Each of six
was perfect and the page was not.

---

## When a loop is expanded into written blocks

**The reference is the built HTML, not the database.** The database returns
values; the HTML returns **decisions** — which button, in what order, with what
crop.

A generator that read a price table out of the database produced 25 rows whose
heights matched the design, and three of eleven were wrong, because the block it
replaced had three forms and the generator knew one:

| what the record held | what the block drew |
|---|---|
| "coming soon" ticked | a button that stays in the row and cannot be pressed |
| a link starting with `#` | a quiet style — it goes down this same page |
| anything else | the full button, booking in a new tab |

One row lost its button entirely; two got a full button opening an anchor on the
same page **in a new tab**.

**Open the `render.php` of the block you are removing and list every `if`.** Each
branch is a form the generator must know. One `if` cost three rows, and the
designer found them, not the check.

**Order comes from the design, not from `menu_order`.** The catalogue's order and
a section's order are different things, and the database knows only one of them.

**And the quietest failure of all:** `var(--something, fallback)` where
`--something` is set nowhere in the project is not a fallback, it is a **lost
setting**. Nine thumbnails had a per-image focal point in the source; the port
wrote `object-position: var(--focal, center 35%)` and never wrote `--focal`
anywhere. No error, no warning, all of them sitting on the fallback from day one.
**Grep every variable the CSS reads**: if nothing writes it, it is either dead or
something that should have arrived did not.

Where that setting goes back is also a decision: not into the stylesheet, but
into the image's own **Crop** control, so the client moves the face into the
frame and a replaced photograph brings its own cropping with it.

**Before expanding, write out every row from the HTML** with its label, style,
destination and target; afterwards reconcile **all** rows against that list, not
the ones that caught your eye.

### What survives the client editing the text

A block that stopped reading a field hands its text to the client — and the
editor **normalises what it holds**, discarding any tag it does not know.

| in the markup | after the first edit | what to do |
|---|---|---|
| `<small>/mo</small>` | `$129/mo`, no tail | register a format (a toolbar button) |
| `<i></i>` — the dot in a chip | an empty tag disappears | the dot becomes `::before` |

**Before handing text to a client, list the tags inside it. An empty tag goes to
CSS; a meaningful one becomes a registered format. Left as it is, it is a fault
with a delayed trigger.**

### Two more traps on the same pass

`get_the_title()` has already been through `wptexturize`, so `&` comes back as
`&#038;` and `esc_html()` over it writes `&amp;#038;`. For markup, take
`$post->post_title`.

**Expanding a loop leaves a dead builder behind.** The function that built each
row, and the three blocks only it used, keep each other alive. After the loop is
gone, grep every function and every block it used — the reference count is
usually already zero.

---

## A field dies with its loop — but only with the loop that really died

After one price table became blocks, ten fields on the collection looked unread.
Nine of them were. The tenth could not be removed: **the listing page was still a
Query Loop**, and there the record is the only thing that can tell one card from
another.

Worse, it had already been broken earlier the same day — a badge block was
rewritten to obey an attribute instead of the field, which is right for a written
row and fatal for a loop. On the listing the badge vanished entirely. No error,
no broken layout, one card simply stopped saying something.

**"Nothing reads this field" is the answer to a grep, not the answer to the
question.** The question is: **is there still a loop that draws this entity?** If
yes, everything that distinguishes one item from another stays a field, however
many pages have already been expanded.

**A block serving both worlds has three states, not two:**

```
attribute set      → the attribute decides   (a written row speaks for itself)
attribute not set  → the record decides      (a card in a loop asks the entity)
```

A `"default": false` kills that fork — with it, "not set" does not exist. Remove
the default.

**Cheap way to catch this:** count what should be visible in the built HTML and
compare with the same count on the site. One `grep -c` against the source page
gave 1 where the site gave 0 — enough to see two weeks of silence.

---

## Two fields for one sentence is two places for it to diverge

A short description **and** an excerpt, both one sentence, both about the same
thing, and on none of the records did they agree. The client, opening a card, has
no way to know which one they are looking at.

The fix is not choosing the better one. One **becomes** the other: the short text
is rewritten into the excerpt, the field leaves the screen, **and the data stays
in the database** in case the sentence is ever wanted back.

**Find every reader before removing anything.** A grep over `inc/` found one. There
were four: two more in patterns and one in the content of a page holding its own
copy. Search patterns, templates, parts **and the database** — a page with its own
copy is not findable in the theme's code.

And replace such a reader with **a core block**, not another reader of the field:
`core/post-excerpt` rather than a block that reads meta. Then the editor shows
what is being displayed, and it is edited where it stands.

**Expect the page to change.** Four pages got 52–75px shorter because the sentence
is shorter. That is the consequence that was wanted, not a regression — say so.

---

## A container is a place, not a form about itself

When a section becomes blocks, the tempting move is to carry its meta box across
as block attributes, one to one. The screen looks different and the client can do
exactly as little as before.

One tab ended up with fourteen sidebar fields: heading, accent, the line under
it, link label, where it goes, which tab it opens, the word before the chips, the
chips, the line after them, chips instead of a list, a button, its address, small
type, width. The designer sent it back twice, the second time plainly: **"it
should not exist at all — I just want to edit everything in the editor and put in
whatever I want."**

The mistake is not the number of fields. It is that the fields **describe the
tab**, and a tab is a **place**. A form permits exactly what was foreseen in it:
no second paragraph, no chips before the heading, no image.

**A container keeps only what it would not be a container without** — here, the
tab's name, because the strip is built from it. Everything else becomes ordinary
blocks inside: the heading is a paragraph, the line under it is a paragraph, the
chips are a group of paragraphs, the link is a link in that same paragraph.

### Then two things that were leaning on the fields have to be settled honestly

**A link that was a `<button data-k data-to>`** becomes an ordinary link `#anchor`
in a paragraph the client writes: where to go is read from the address, and which
tabs a card belongs to is written on the card. Without script it still works,
which the button never did. **No class on it** — a class typed into rich text does
not survive the first edit, so the style hangs on **where** the link stands.

**A tooltip that was a `title` on a span** has nowhere to live in rich text. Four
of them were lost, and that was said out loud rather than hidden.

**A width is not a field.** The designer's question was exact: *"why are you
adding a custom field for a max width when that is in the styles panel?"* The
honest answer is that the panel writes on the block's **own tag** and cannot reach
an element inside a row — which is why the field appeared. But the right
conclusion is not "then keep the field", it is "then it is a style": one rule and
three named exceptions, keyed on an anchor the tab already has.

---

## Ask yourself the question the designer will ask

**"Why is this custom? Can it not be done with Gutenberg?"**

Usually it can. A menu row is a picture, a name, a label beside it, ingredients,
tags, a number and a button — all of that is `core/image`, `core/group`,
`core/paragraph`, `core/buttons`. It was custom not because core cannot, but
because it was **easier to port**: meta box fields mapped one-to-one onto block
attributes, and the work looked done.

**The only thing core genuinely cannot do is behaviour.** And even behaviour
often need not be in the markup: a collapsed remainder is just a second
paragraph, and the "and N more" button is built by script counting the items in
it. A visitor without script then sees both lists in full, which is better than a
button that does nothing.

So: **the block keeps the behaviour; everything the client changes becomes blocks
inside it.**

```
theme/program-menu      the tab strip, arrows, switching      ← behaviour
  theme/menu-panel      one tab, its heading and extras
    theme/menu-row      one row
    theme/menu-request  the enquiry card
```

An unplanned win: a row used to belong to a tab by **a name typed in two places**.
Now belonging is *where the block sits*, and moving a row to another tab is a drag.

---

## The empty element does not survive the move, and nobody notices

A card drawn from three parts — an `<img>`, an **empty** `<span>` carrying a
gradient, and white text over it — becomes `core/image` plus paragraphs, **and the
span disappears**: there is no block for an empty element and nothing reminds you.

The page stays valid, nothing breaks, the heights match. The white text is simply
on a white wall. **The designer saw it two days later.**

**An empty element is a style.** The gradient became `::after` on the card itself.

Two neighbours of the same bug, worth checking separately whenever a section with
a background becomes blocks:

- **what happened to the empty elements;**
- **what `object-fit` is hanging on** — it was on the `<figure>`, where it does
  nothing: the block supplies the figure, and the covering is the image's job;
- **whether the editor overrode `position`** — core puts `position: relative` on
  **every** block and beats an `absolute`. The other two layers survived because
  core copies a block's own classes onto its wrapper.

---

## Two questions that have one answer per site, not one per record

**"Show the author?"** A switch the client asks for "on posts" almost always
means "on all posts". As a field on the record, the answer has to be repeated on
every new post, and somebody will forget.

The working shape: **the switch lives on the block in the template** — one answer
for the whole site — and the post itself gets three states: *as in the template*,
*show*, *hide*, defaulting to the first. Nothing to repeat, exceptions still
possible. The same applies to any option the client calls "for posts".

**Anything that can be counted is not typed.** "5 min read" as a field means
somebody has to recompute it when the text changes, and they will not. Compute it
from the text at render — and likewise everything printed beside a post: the title
comes from the post, the date from the date, the author from the author.

Related: the year in the footer is dynamic, never typed. And **do not put a post's
date into a pattern** as an element — it arrives from the post template, and the
copy in the pattern is a second date to remove by hand on every page.

---

## "Can this text be different on each page?" — the three answers

**The client will ask this, in those words, and the answer decides what the thing
is.** It came up four times in one afternoon on one project, each time about a
different card, and each time the honest answer was a different one of these.

| | what it is | changing it affects | where they change it |
|---|---|---|---|
| **synced pattern** | one row in the database, referenced | **every page at once** | Appearance → Patterns → My patterns |
| **inserted pattern** | a copy dropped into the page | **only that page** | the page itself, like any block |
| **field** | a value on the record | **only that record** | the record's own panel |

Same card can be all three, so say which one it is before they press anything.
The tell in the editor is the toolbar: a synced one says **"Edit original"**, and
that wording is the whole warning — they are not editing this page.

**The trap under it: a sidebar belongs to the template, not to the record.** Open
an event and the List View shows only the body. The cards beside it are the
template's, so they are not in the list and cannot be reached from there — which
reads as "the blocks are missing" to anybody who does not know that. Hence the
rule at the top of this file in its practical form:

🔴 **Whatever varies per record must be a field, because there is nowhere in a
record's content that lands outside the content.** Everything shared stays in the
template, as a pattern they can edit in one place.

And when they want it both ways — the card shared, but its words different on one
record — there are only two honest answers, and both cost:

- **make it a field too**, with the shared text as the default when it is empty.
  Cheap, works, but only for text you name in advance;
- **move the section into the record's own content**, where it becomes an
  ordinary inserted pattern. Full freedom, and the price is that it is no longer
  one place: every existing record needs the section adding, and a later fix to
  the design stops arriving by itself.

Say the price out loud before doing either. "Can it be different per page" nearly
always means "I want to edit this and cannot see how", and the answer is usually
the panel, not a rebuild.

---

## When fields are the right answer, they still need a decent home

For a type that is **a record, not a page** — team, FAQ, testimonials, events —
fields are entirely right: the entry has no page of its own, nobody lays it out,
and a form is more honest than a pseudo-page made of blocks.

But their place is **not a 265px sidebar**. A box under the page, full width,
grouped the way a person thinks about them. And the field labels are the client's
words, not the developer's — see `SKILL.md`, "Fields speak the client's language".
