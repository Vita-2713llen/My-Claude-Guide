# Patterns, synced patterns, and the post nobody made from one

Open this when deciding how a repeated section is delivered, or when a pattern
that exists cannot be found.

The three shapes and what they map to are in `SKILL.md`, "A block has to survive
the client editing it". This file is what goes wrong after that choice.

---

## A pattern's own headers decide whether the client ever sees it

🔴 **A pattern declared as the client's is tested through the client's inserter.**
The file existing, the registration succeeding and REST returning it prove
nothing.

Four blog-post sections were made patterns precisely so the client could insert
them. **None of the four was visible.** It surfaced only when the designer asked
whether the sections could be patterns — that is, the feature had been written,
declared done, and did not work.

A/B tested on WordPress 7.1, one header at a time:

| Pattern headers | In the Patterns tab |
|---|---|
| `Block Types: core/post-content` + `Post Types: post` | **not visible** |
| `Post Types: post` | **not visible** |
| neither | **visible** |

- **`Block Types`** binds the pattern to the *starting choice* offered for that
  block, not to the ordinary list.
- **`Post Types`** likewise takes it out of the ordinary list — it is consulted
  only by that starting flow.
- Together they produce a pattern that exists, is served over REST, carries
  correct headers, and that the client cannot find.

**What the correct setting costs:** without `Post Types` those patterns are also
visible while editing a page. Cure it by naming — start all of them with the same
prefix (`Post — …`) so they sit together in the list and read as a set.

### The cache that hides the fix

The theme's list of pattern files lives in a **site** transient
(`_site_transient_wp_theme_files_patterns-<hash>`). Deleting rows matching
`_transient%` does **not** touch it — different prefix — which is how a correct
fix gets declared ineffective twice. Clear it with
`wp_get_theme()->delete_pattern_cache()`.

**And the first request to the pattern list after clearing the cache may come
back empty.** One run got "2 blocks across 76 patterns" and nearly went looking
for a fault; repeating the same request gave 2461. Read such a number twice
before concluding anything from it.

---

## An inserted pattern leaves a mark behind

It is easy to claim — and wrong — that a pattern expands into blocks and the link
disappears. In WordPress 7.1 insertion writes ordinary blocks, but the top one
receives:

```
"metadata": { "patternName": "theme/post-wall", "name": "Post — …",
              "categories": ["theme-sections"] }
```

That mark is what draws the **Pattern** badge and the **Edit pattern** / **Change
design** buttons. The blocks really are ordinary: editable, private to each
record. What disappears is the *source of the content*, not the record of where it
came from.

**The consequence for migrations, and this is the important half.** A section
placed into content by a script rather than inserted from the inserter has **no
mark** — in the editor it looks like a plain group, with no badge and no buttons,
while the same section in a new record has both. Two different interfaces for one
thing. So **every migration that puts a pattern into content must write
`metadata.patternName`**, exactly as it writes classes.

The same mark is also a feature in its own right: it turns a plain group into a
pattern **edited in place**. See `reference/panel-migration.md`, last section.

---

## A pattern is a starting point; the page keeps its own copy

Editing a pattern does **not** change a page already built from it.

The one exception is visible in the markup: a page stored as
`<!-- wp:pattern {"slug":…} /-->` holds a reference and renders the pattern every
time. Those pages change when the file changes — **and a content pass skips them
entirely**, because they contain no blocks to find. On one port seven pages held a
reference instead of the section, so every content sweep quietly missed them.

So any correction is made twice: in the theme's files, so a new record starts out
right, and in the live content, so what the client opens today is already right.

---

## When a repeated section should be synced — decide by measuring

Not every repeated section should be a copy. **Count, do not eyeball**: take the
section from every record and count how many distinct versions there are.

Seven posts, on one port:

| Section | Distinct versions |
|---|---|
| booking panel | **1** |
| "more to read" | **1** |
| three services | 6 |
| wall of photographs | 7 |

The first two are identical not by accident but because **neither contains a
single word about the article it sits under**. So: a synced pattern — one record
in the database, referenced from every post, one edit instead of seven.

### Three things to say out loud when choosing it

1. **A synced pattern lives in the database, not in the theme.** Reinstall the
   theme on a clean database and the section is gone. The cure is that the **file
   pattern stays** as the source it was created from and can be restored from.
2. **It is edited on a separate screen**, not on the page. For something identical
   everywhere that is correct, but it is a step away from "the client edits in
   place".
3. **One record will eventually want to differ** — then the pattern is detached
   with one click, and the client has to know that button exists.

### And one thing without which there are two sources for one section

The file pattern the synced one was made from must get **`Inserter: no`**.
Otherwise the list holds two identically named cards — one synced, one not — and
the client inserts whichever, seeing no difference.

### What syncing does not solve

A value repeated across the whole site — a phone number sitting as a literal in
fourteen records and nine theme files — is a separate problem. A synced pattern
closes seven of them. Such a value has to live in one place and be substituted.

---

## A synced pattern's "Content" panel shows a field that does not exist

A synced pattern has a **Content** panel in the sidebar, meant as a list of what
can be rewritten here. The client reads it literally: "something goes in here."

In one "more to read" pattern that list held a single row — **Post Date**. Clicking
it gives nothing: the date comes from whichever post the Query Loop is drawing.

**Why the date, when the title and excerpt come from the same place.** Measured in
the editor: the block in the canvas has an attribute the saved markup does not —

```
core/post-date  metadata.bindings.datetime = { source: "core/post-data", args: { field: "date" } }
```

Core **adds that binding itself** during load, and the definition of "this is
content" reads exactly `metadata.bindings`. The card's title, excerpt and featured
image take their values from the loop context **with no such stamp**, so they never
reach the panel. Of five fields on the card, one appears — and it looks like
unfinished work rather than logic.

**So it is not a fault in the pattern.** In the pattern file `core/post-date` sits
where it should. Looking for the cause in the markup is wasted time: it is not
there.

**What to do.** Core offers no filter for this panel — it is written inside
`core/block`'s own `edit`. What is left is the same technique used for core's
video playback settings and an image's alt text: a script puts a class on `<body>`
when a `core/block` is selected, and a style hides the panel.

```css
body.theme-synced-selected .block-editor-block-inspector
	.components-panel__body:has( .block-editor-block-quick-navigation__item ) {
	display: none;
}
```

**The class goes on not only when the pattern itself is selected but when anything
inside it is** — otherwise clicking "Post Date" in that very list selects the date
block, the class drops, and the list comes back. Read parentage with
`getBlockParents()`.

The panel is identified by **the only thing unique to it** — its quick-navigation
item — because core gives it no class of its own. And it is hidden **only for a
synced pattern and its contents**: in an ordinary pattern the same panel lists the
article's real headings and paragraphs, and there it is useful. Verified: synced
ones then show only "Edit original", the ordinary one keeps its full list.

**And it is drawn in two places, not one.** The sidebar panel **and List View**: a
synced pattern expands there to exactly the same set. Fixing only the sidebar is
not enough — the client finds the same "Post Date" in the block list, which is
what happened. List View rows carry `data-block` with the id, so parentage is read
from the store rather than guessed from markup; hide the arrow that opened the row
along with the row, or it expands into nothing. Template parts are also marked
`is-synced` and do keep their contents — so the **block name** decides, not that
shared class.

🔴 **Before making a section a synced pattern, open it and read the Content panel
and List View with the client's eyes.** Every row must be something a person
actually types. A row that accepts nothing is removed from sight, not explained.

---

## Repeated decoration is one block, not a group of blocks

A small label above a section heading — an icon and two or three words — stood on
forty screens. Its history is the lesson:

1. **Custom HTML** assembled in PHP. To change two words the client edits code in
   a block the editor does not validate.
2. **A group of an image and a paragraph.** The words are editable, and the image
   can be deleted, moved or replaced — in forty places it will drift.
3. **A block of its own with one text field.** The theme draws the icon, the words
   are typed in place.

The third is the answer, and the test is simple: **if an element has exactly one
thing the client should change, it is a block with one field, not a set of
blocks.** A set of blocks grants freedom where there should be none.

### The more important half — where the icon itself lives

It was **an uploaded file**: one attachment referenced by eighteen records. The
client can delete it from the Media Library without knowing what it is, and the
label vanishes in eighteen places at once.

Put it in the theme folder and print it into the page: it cannot be deleted from
wp-admin, it travels with the theme export, and it needs no id — ids differ on
every install.

🔴 **Decoration that belongs to the design, not to the content** — labels,
dividers, section icons — **lives in the theme.** The Media Library holds what the
client uploaded or will one day replace.

**One detail that shows up only when inlining SVG:** the file carried its own
`<style>` with an animation inside. For an image loaded by URL that is correct;
for an SVG printed into the page it is six copies of the same keyframes on a page
with six labels. Move the styles into the stylesheet once and strip `<style>`
while reading the file.

---

## A post made without a pattern must still look like a post

Patterns exist so a page can be assembled quickly. But the client will eventually
press "Add new post" and just write. If the theme supplies its appearance **only**
through a pattern, that post comes out broken: text edge to edge, no padding, no
container.

So `entry-content` needs **base styles of its own**: a max width with a gutter,
vertical rhythm between blocks, space above and below. Written for the direct
children that carry no alignment:

```css
.entry-content.is-layout-constrained > :where(:not(.alignfull):not(.alignwide)) { … }
```

**Set the rhythm with an adjacent-sibling selector (`+`), not with `blockGap` on
the container.** On a flow layout core turns `blockGap` into margins on the child
blocks and pulls apart sections assembled by a pattern — see `SKILL.md`,
"`blockGap` is not `gap`".

The same applies to the test post in `reference/security-and-handover.md`: that is
where this gap gets found.

---

## Page Break cannot go inside a section

`core/nextpage` is not rendered. WordPress **cuts the `post_content` string
itself** at the `<!--nextpage-->` marker and serves the first half.

If the article is wrapped in a section, a container, a layout and an `<article>` —
and on any real theme it is — then all four closing tags are left **after** the
marker. The first page arrives with four unclosed elements, the browser repairs
them its own way, and the page turns inside out.

Measured when it happened: a rail ended up against the window edge, a container
reported 720px instead of 1170, and a layout wrapper turned out to be the
**parent** of its own `<article>`. It reads as broken CSS and it is not CSS.

🔴 **Page Break makes sense only where the content is wrapped in nothing.** On a
theme where every section is a wrapper, it is not inserted at all.

And a trap inside the trap: placed **inside** a list of blocks, everything after
it simply does not show — on one run sixteen of thirty-four blocks ended up on
page two, and the sandbox looked finished while showing half of itself.
