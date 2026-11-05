# The audits, the leftovers, and the things a theme owes

Open this in the last stretch of a project, and once near the beginning — because
the first section is the one that should have existed on day one.

What to delete and configure in wp-admin is "Hand the site over clean" in
`SKILL.md`. This file is the mechanical part: what to generate, what to switch
off, and what the theme is missing that nothing will complain about.

---

## The four audits, which should exist from the first day

On one port these were written at the end. They belong at the start, because each
one is a few minutes and each answers a question that is otherwise answered by
belief.

| Script | What it does |
|---|---|
| `audit-blocks.php` | a draft containing **every block the client can reach**, each with its starting attributes |
| `audit-patterns.php` | the same for every pattern, one after another |
| a usage report | block × (templates, patterns, `post_content`) — shows the dead ones |
| a render pass | every block through `do_blocks()` with PHP notices captured |

**What they found on one run:** three dead blocks, one real style defect, four
detail blocks that had no business in the inserter. Zero PHP notices, zero invalid
blocks — which is also worth knowing.

**One detail:** label the blocks in the audit with `$type->title`, not
`namespace/slug`, or the page reads as a list of tags separated by slashes.

### And the final pass needs two more reports

- **registered versus used** — a block that was replaced stays registered and
  keeps being offered;
- **duplicate enqueues** — the same file registered under two handles means the
  browser downloads and parses it twice. One file, one handle.

---

## Scaffolding leftovers are their own category

Not the same as dead code: this is what was **needed during the port** and stayed
afterwards.

- **Temporary post types** — one created before the forms plugin was wired up.
- **Temporary form code** that duplicated what the plugin does.
- **Meta the importer needed** — a source path, a conversion marker. Nothing in
  the code should still depend on it once the import is done.
- **Developer tools** are removed or closed at the end. One deliberate exception is
  fine — a panel the designer asked to keep — but it must be **a decision, not an
  omission**.

---

## What a theme owes regardless of the pages it was asked for

🔴 A block theme missing a template does not break: WordPress substitutes its own
fallback, and the page comes out with no design, no warning and no error. So the
set is checked **as a list**:

`index.html` · `page.html` · `single.html` · `archive.html` · `search.html` ·
`home.html` · `404.html`, plus `parts/header.html` and `parts/footer.html`.

- 🔴 **`index.html` is the fallback loop, not a copy of `page.html`**, and
  `index.php` in the theme root is required.
- **A static "posts page" must have something to show.** Assign one in the settings
  and then check that `home.html` prints a heading and a loop rather than
  emptiness.
- **`screenshot.png`, 1200×900.** Without it the theme is a grey hatched rectangle
  in the list.
- 🔴 **A plugin dependency is declared — and declaring it takes code, not a
  header.** `Requires Plugins:` is a **plugin** header: it is read by
  `WP_Plugin_Dependencies` and `wp-admin/includes/plugin.php` and nothing else.
  Verified against core 7.1: `WP_Theme` does not carry it in its header map at
  all, so the same line in a theme's `style.css` is documentation for whoever
  opens the file and **is enforced by nothing**. Core has no theme-dependency
  feature.

  So the theme says it itself, in two places, because they catch two different
  people: **a notice at the top of the screen while the plugin is missing**, for
  somebody who has just installed the theme on a fresh site, and **a line under
  the plugin's own row on the Plugins screen**, for somebody standing with their
  hand on "Deactivate". Ask the plugin itself — `is_plugin_active()` or a
  `class_exists()` on something it defines — rather than reading the list of
  active plugins, so a must-use or network activation is not mistaken for
  absence. Neither warning stops anyone: a warning is the theme's business, the
  decision is the site owner's.

  A theme that silently needs a plugin is a theme whose forms are five empty
  boxes on the next install, with nothing on screen saying why.
- **`404.html`, `search.html` and `archive.html` carry the design** — opened and
  looked at, not assumed.

---

## A place for other people's code

Analytics, a tag manager, a domain-verification snippet, a chat widget, a pixel —
all of it arrives as a snippet with "paste into `<head>`" or "right after
`<body>`" or "before `</body>`". If the theme has no such place, the snippet gets
glued into a template and the next theme update erases it.

Three fields in Customize — **Header**, **Body start**, **Body end** — close this
permanently. Four decisions worth copying:

- **options, not theme mods** — analytics belongs to the site, not to the theme,
  and must not vanish when the theme changes;
- **nothing is escaped on output**, because escaped code is not code; what protects
  here is the `unfiltered_html` capability, not escaping;
- **nothing is printed inside the Customize preview**, so analytics does not count
  the administrator and a half-written snippet cannot break the preview itself;
- plain text fields, no syntax highlighting: this is a place to paste, not an
  editor.

**And the IDs are the client's.** Ask what already runs on their current site and
wire what they name. Never invent a container ID and never leave a placeholder
that looks configured.

---

## The test post with every core block

**A theme styles what it has seen.** The client will eventually insert a table, a
quote, a separator, a definition list, a button inside a group, a gallery, an
embed — and half of them will turn out to have no styles, because the design did
not contain them.

So before handover: **one test post with every core block in it**, walked from top
to bottom. It is the only way to see the gap between "the theme is pretty" and
"the theme is complete", and it finds dozens of small things in an hour.

The same post is where things visible nowhere else get checked: the spacing between
blocks on an archive and on a detail page, what pagination looks like, and what an
empty search result looks like.

**Delete it before handover**, or name it as a deliberate keeper.

---

## Security, briefly

- 🔴 **SVG is accepted only through a sanitiser.** "Allow SVG for administrators"
  is not sanitising — an SVG can contain script. Copy
  `templates/svg-support.php` verbatim: it parses and rebuilds each file against an
  allow-list rather than matching tags with regular expressions, refuses
  `<!DOCTYPE>` and `<!ENTITY>`, unwraps `<a>`/`<switch>` instead of deleting their
  children, and gates uploads on a capability. **Do not write a lighter version**;
  a regex-based sanitiser is the usual way an SVG upload becomes a stored XSS.
- 🔴 **`DISALLOW_FILE_EDIT` is always on.** Hiding the menu item leaves the screen
  reachable by its address.
- **Anything imported from a file is validated** — an unknown breakpoint, an
  unknown token, an unknown state, a value longer than 60 characters or containing
  `<>{};` is rejected. A settings file came off somebody else's disk, and the only
  thing worse than refusing it is writing nonsense into the site's colours.
- **The admin account is a work address**, never a personal mailbox and never the
  builder's own.

---

## The sweep before handover

🔴 **An audit with a list, and `WP_DEBUG_LOG` switched on.** Without the log, the
two recurring notices — a block registered twice, a translation asked for before
`init` — are written nowhere and the theme looks clean. See
`reference/block-authoring.md`.

Then, in order:

- [ ] the four audits above, plus registered-versus-used and duplicate enqueues
- [ ] the test post with every core block, walked
- [ ] `WP_DEBUG_LOG` on, a pass over every page, the log empty
- [ ] developer tools removed, or each survivor named as a decision
- [ ] scaffolding leftovers gone — temporary types, importer meta, cloned forms
- [ ] the template set complete, `index.php` and `screenshot.png` present,
      plugin dependencies declared
- [ ] no absolute URL or root-relative path in markup or PHP; a grep of the theme
      for the development host returns zero — **searched in the source, not in
      rendered HTML**, where the site's own address is legitimately everywhere
- [ ] types and taxonomies without pages closed by URL **and** by
      `/?post_type=<type>`
- [ ] the build run after the last CSS/JS edit
- [ ] a "not verified" list handed over — scroll states, reveals, anything
      frame-dependent

---

## Small things that repeat on every project

Each is one line, and each is forgotten regularly.

- 🔴 **Menus are in `<nav>`.** A theme that draws its own menu easily leaves it a
  pile of `div`s.
- 🔴 **One `header` and one `footer` per page, never nested.** A template part that
  is already a `header` does not contain a second one — semantically or for a
  screen reader.
- **Links through `home_url()`**, never from the root. A root path breaks in a
  subdirectory and on any move.
- **The year in the footer is dynamic.** A static year becomes a lie on 1 January.
- **The favicon is set explicitly** — Site Icon — not by scanning a folder for
  images, and never hard-coded as a `<link rel="icon">` in the theme, which takes
  it out of the client's reach.
- **The same file is not enqueued twice** under two handles.
- **Strings in a block's markup** — "Book", "Read more", "Send" — go through a
  translation function with the theme's domain. Find them by searching `render.php`
  for quotes.
- **Per-request caching** for helpers called several times per page: `static` in a
  named function.
- 🔴 **After any CSS or JS edit, run the build.**
