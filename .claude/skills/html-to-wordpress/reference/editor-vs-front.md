# The canvas is a third surface

Open this when the page is right and the editor is not — or when you are about to
report a section as done.

🔴 **A front-end-only check is not a check.** A page that is broken in the canvas
is a page the designer cannot work with, and the designer sees it immediately
while a markup comparison never will.

---

## Three surfaces, not two

| Surface | What it proves |
|---|---|
| the served page | what a visitor gets |
| the editor canvas | what the person who maintains the site gets |
| the editor's **sidebar** | whether they can change it at all |

On one port a section passed its validator with 0 invalid blocks and matched the
design on 184 of 184 values per width — and the designer then found a slideshow
with no way to choose its photographs, a sidebar field asking for a raw storage
key, and four blocks printing "Block rendered as empty", **all inside the scope
already declared verified.**

---

## How to measure the canvas against the page

The canvas is an iframe, so it is readable. For each section: the same list of
computed properties and the same rectangles taken inside the canvas and on the
page, matched by block.

Three things to settle before believing a difference:

- **the admin bar adds exactly 32px at the top.** If **every** element is shifted
  by 32, that is the bar, not the layout.
- **kill animations and transitions first.** A photograph growing into its frame
  measures 0.88 of its size halfway through, which reads as a real discrepancy.
- **force a reload after any asset change.** Several "bugs" on one run were an old
  editor tab, and the measurement was of the browser rather than of the site.

`templates/canvas-diff.js` is the rig. Anything it reports as differing is either
a defect or a declared, named exception — there is no third category.

---

## Why a server-rendered block shows less in the canvas

**A block that draws itself on the server shows in the canvas exactly what the
server returned — and it returns less, because in the canvas there is no parent
and no context.**

On one port a menu row rendered without its photograph (the ancestor list
carrying `has-figs` exists only on the page), and a tab showed only its rows: the
heading, the caption, the link and the extras stayed in the inspector and never
appeared in the canvas at all. **The designer saw it at once and a markup check
never would** — both pages matched byte for byte the whole time.

🔴 **After a section becomes blocks, open it in the editor and list what is
visible, field by field.** Everything the client changes must be in the canvas,
preferably as `RichText` where it stands rather than as a row in the inspector.

---

## A card that hides itself when empty hides from the editor too

**A section that takes itself away when its data is missing will take itself away
in the editor every single time — because in the editor the data is never there.**
And it takes its own heading with it, which is the part the client came to edit.

The shape is always the same. A sidebar card holds a dynamic block and a rule
that asks whether anything came out of it:

```css
.card:not(:has(.the-dynamic-bit)) { display: none; }
```

Right on the page: a card with a heading over a white rectangle is worse than no
card. Wrong in the pattern editor, where there is no record to read, so there is
never anything inside, so the card is **always** hidden. Opening it shows an
empty canvas with "3 words" written in the panel beside it — the content is in
the row, nothing is drawn, and the only way in is the code editor.

🔴 **Lift the hiding for the one case where the card IS what is being edited** —
a direct child of the editor's root, which is what a pattern opened on its own
is. Inside a record's canvas it is nested, the rule does not reach it, and that
canvas still matches the page:

```css
.is-root-container > .card:not(:has(.the-dynamic-bit)) { display: flex; }
```

`display: flex` and not `revert`, because the card is usually a flex column and
`revert` hands it back to the browser's `block`. Put it in the editor-only
stylesheet, and check the theme does not already use `.is-root-container` for
something else in the same file — if it does, that is confirmation the selector
reaches, not a reason to avoid it.

**The same day, the same client, two more canvases of nothing**, both normal and
both worth explaining before someone calls them bugs:

| what the canvas shows | why | what to do |
|---|---|---|
| `event_sponsor_name` where a heading should be | the heading is **bound to a field**, and with no record to read, core prints the field's own name as a placeholder | nothing — it never reaches a visitor. Say so once |
| "Block rendered as empty." | `ServerSideRender` asked the server, the server had nothing to say | give it a real empty state: *"The subjects come from this event's Scheduled topics field"* |

The second one is worth the five minutes. It is the sentence the client meets
every time they open that card, and core's version explains nothing.

---

## A post opens with the content only, and the page looks decapitated

The post editor by default draws **only the content**. Everything the template
supplies — header, a banner with the photograph, the category, the date, reading
time, the heading, the lead, the author, the footer — is not drawn at all. In
place of the banner there is a dark strip, and the first question it produces is
"where is the first section?"

For pages the question does not arise: there the first section is a block in the
content. It arises precisely where **the opening is built from the record's
fields**, which is every detail type.

**One line cures it** — `template-locked` draws the template around the content:
header, banner and footer look exactly as they do on the site, only the content is
editable, the rest is locked until somebody deliberately opens the template.

```php
add_post_type_support( 'post', 'editor', array( 'default-mode' => 'template-locked' ) );
```

### And the trap that makes that line look ineffective

Core takes the mode in this order:

1. **the user's own preference** — `renderingModes[theme][post type]`;
2. `supports.editor` → `default-mode` (what the theme sets);
3. the editor's settings;
4. `post-only`.

**The user's preference overrides the theme.** And the editor writes it silently,
the first time a person opens a record of that type. So everybody who opened posts
before this change keeps a pinned `post-only`, and the theme cannot move it.
Observed on one install:

```
user → { program: "template-locked", service: "template-locked", post: "post-only" }
```

Programmes and services showed the page around them, posts did not, and it looked
like a theme fault.

**The switch is in the sidebar: Post → Template → ⋮ → "Show template".** A new
user — the client — gets the right thing from the theme and switches nothing.
Anyone who opened records earlier has to click once; clearing their persisted
preferences is possible and not worth doing without a reason.

🔴 **In the checklist: open a detail page of every type in the editor and confirm
you see what the site shows.** A dark strip instead of a banner is not cosmetic —
it is what makes the client think part of the page has gone.

---

## Three reasons the canvas looks different, all from one day

**A card wearing two looks at once.** `edit()` added the archive's class
unconditionally while `render.php` added it only when the block had none of its
own. The archive rule takes the photo's height from a variable nothing declares on
the other page, so `var()` resolved empty, the height fell to `auto`, and a frame
with an absolutely positioned photograph measured **0**.

The general rule beside it: **`height: var(--x)` with `--x` undefined does not fall
back to the previous rule — it falls to `auto`.**

**The editor writes `style="height:auto"` on the image itself** in the Image
block, and inline beats any file. A frame with a height then shows the photograph
in its own proportions and cuts the bottom off. Cured with a list of frames
carrying `!important`, scoped to `.editor-styles-wrapper`.

**A foreign frame inside the editor's frame.** A map embed in the canvas is
another origin; the editor reaches into every frame it draws to neutralise clicks,
and the browser refuses. It throws while preparing a preview, so the console names
whatever pattern happened to be open at that second, however irrelevant.

---

## The console error that is not yours

```
SecurityError: Failed to read a named property 'removeEventListener' from 'Window':
Blocked a frame with origin "…" from accessing a cross-origin frame.
```

It looks alarming and appears in the editor regularly. **It is core, not the
theme:** the canvas is an iframe, and when the canvas's address differs from the
admin's by anything at all — a local tunnel, a different port, http against https
— the browser forbids core from reaching the canvas's window.

**Check the address before looking for it in your own code.** The same error on
`localhost:8888` and on a tunnel host is one and the same cause, and it disappears
on a normal domain. Spend exactly as long as it takes to confirm that none of your
own scripts touches another iframe's `contentWindow`.

---

## Reveal animations belong on the site, not in the canvas

An entrance animation that is lovely on the page is an obstruction in the editor:
a block sliding in while it is being edited cannot be grabbed. **Turn them off
inside the editor canvas.**

---

## "The editor freezes sometimes" is usually the queue

A development stack commonly runs two PHP processes — Local ships with
`pm.max_children = 2` — and a shared host is rarely more generous. A save is one request
holding one worker for its whole duration, so anything else in flight pushes it behind.

Measure it twice before looking for a bug: the save alone, and the save while two or three
ordinary page loads are running. *One run: 800 ms alone, 3,600 ms under that load, with no
long tasks in the browser at all — so nothing was blocking the editor; it was waiting.*

Two consequences:

- **Separate server time from browser time** in the measurement. A save that is 3.8 seconds
  of long tasks is a different defect from one that is 3.8 seconds of waiting, and only one
  of them is in your code.
- **Anything a guard does on every request is a share of that queue.** Work it out once and
  keep the answer; cache by what the answer depends on, not by who asked.

Never measure a page while an editor is open on the same stack — the two of them are the
whole pool.

## Related

- The two notices written to the log on every request — a block registered twice,
  and a translation asked for before `init`: `reference/block-authoring.md`.
- A synced pattern's Content panel listing a field that accepts nothing:
  `reference/patterns.md`.
- What the panel must and must not offer, and why a group has to declare its kind
  to the editor: `reference/panel-migration.md`.
