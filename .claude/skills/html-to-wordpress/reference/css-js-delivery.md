# Getting the CSS and the JavaScript to the page

Open this when setting up the build, when deciding which stylesheet a page gets,
or when a rule that is plainly in the file does not apply on the site.

Two hard rules from `SKILL.md` live here in full: **after any edit to the CSS or
JS, run the build**, and **stylesheets and scripts load per page, by what the page
contains**.

---

## Loading only what the page needs

A theme serving all its stylesheets to every page is not only weight. Measured on
one port: 7 to 11 of 21 sheets had **no match at all** on the page they arrived
on — and those are rules that can reach things they were never written for.

**Derive the rule from the files, not from a list.** Ask each stylesheet which of
the theme's classes it defines; read the page for the classes it uses; the
intersection is the answer. A hand-kept list of "page X → file Y" goes stale the
first time somebody builds a page out of two other pages' sections — which is what
the site is for. A free bonus: a conflict between two files sharing a few names
resolves itself, because a page with such a name gets both, as before.

### Three readings, and each one was wrong first

**1. A class counts in CSS only with a dot.** These files are half prose, and prose
names other pages' classes constantly. Reading bare words gave "all 21, always" —
a correct answer to a meaningless question. **PHP render files read the opposite
way**, because there a class is written bare inside `class="…"`.

**2. A global stylesheet owns only the class its selector starts with.** Subtract
everything a global file merely *mentions* and a page stylesheet loses a class
because the global one writes `.location-map .contact-map`: that is a section
adjusting somebody else's component, not owning it. Read the **first compound** of
the selector for an always-loaded sheet.

**3. A pattern reference is a note, not markup.** A 404 template that is one line
of `wp:pattern` asks for nothing, and the page went out with 211 elements and no
design. **Expand slugs from the pattern registry** before reading the page.

### And the cache keyed only on its inputs went stale

The key held the stylesheets' modification times. The rule that reads them was
rewritten — the files did not change, the key did not change, and the transient
returned yesterday's map, looking entirely plausible. **`filemtime(__FILE__)` of
the rule itself belongs in the key.**

### How this is proved

For every page and width: a snapshot of ~45 computed properties and the rectangle
of every element. Then the sheets the page no longer receives are **poured back
in — at the end of `<head>`, that is, with more weight than they ever had** — and
the snapshot is repeated. Zero differences across 41 page/width combinations.

Appending at the end is deliberate: it can only *increase* the chance of seeing a
difference, so a zero in that test means zero.

### Two things the same rule has to know

🔴 **`is-style-…` counts as a class.** A block style is offered on every page, so
the file that defines one must be reachable from any page. Reading only the
theme's own prefix, a page that used a block style was sent eight stylesheets,
none of them the one that answers, and the style silently did nothing.

🔴 **A word ending in a hyphen is a prefix, not a class** — a token like
`theme-orb-` matches `theme-orb-1` through `theme-orb-9`, and a script asking for
an exact match finds nothing.

### Scripts ask a different question

A stylesheet asks "does the page use a class I define". A script asks "is the
thing I operate on present" — a selector, a data attribute, a block. Same
mechanism, different question, and the answer for a script is usually narrower.

---

## The build lives inside the theme

🔴 Not beside it. A theme with minified copies and no way to rebuild them travels
to the next machine as a theme that cannot be maintained: the next edit to a
stylesheet leaves a stale copy, and **the site quietly serves the unminified
source of exactly that file** while every other file stays minified. Nothing
errors and the symptom is one file behaving differently from the rest.

Two safety catches worth copying:

- **a copy older than its source is never served** — that is what makes a
  forgotten build harmless rather than wrong;
- **under `SCRIPT_DEBUG` the filter stays silent.**

Substitute on `style_loader_src` / `script_loader_src`: one place instead of sixty
enqueues, and a new file is covered without touching the config. The build script
**finds** its files rather than listing them.

Measured on one port: 991 KB → 531 KB.

---

## The minifier changes meaning, not only size — twice

Both of these were found late, and both were invisible while the stale copies sat
there unused.

### It breaks `:nth-child(N of …)`

clean-css strips the spaces around `of`, so `:nth-child(1 of li:not([style]))`
becomes `:nth-child(1ofli:not([style]))`. That is not a selector — and a browser
**discards the entire rule** if any selector in its list is invalid. So a rule that
also named an unrelated class stopped working altogether.

**Why it surfaced long after it appeared.** The theme serves a minified file only
when it is newer than the source. The corrupted copies were stale, the site took
the source, and everything looked right. One build was enough to bring the broken
rule to life: a card measured 122px inside a 395px row on a phone, because the
rule giving it full width had fallen over with the rest.

Cured by restoring the spaces after minification. **Verify by comparing the
selector count** in the source against the copy, not by eye.

**And a trap in the fix itself:** a replacement string containing `$1`/`$2`,
written inside double quotes in a shell command, is handed to the shell, which
substitutes nothing — and the expression starts **deleting** what it was meant to
repair. Write such edits into a file, and check the result against a test string
rather than against belief.

### It reorders media queries, and that changes the cascade

clean-css at level 2 **merges identical `@media` blocks** and gathers them where
that condition first appeared. For rules of equal weight the order *is* the
cascade, so a narrower screen's rule written last — as it should be — rises to the
top and stops winning.

Measured: a block with `max-width: 320px` at 567 showed `none`, because its query
had moved above the 991 one. Cured with
`level: { 1: {}, 2: { mergeMedia: false } }`.

**Verify by counting:** the number of `@media` blocks in the source against the
number in the built copy, per file. One mismatch and a cascade has moved
somewhere. Careful with `@media` written inside a comment — it counts too, and
gives a false alarm.

**After any change to the minifier: a full rebuild and a comparison.** Two
separate cases of it altering content is a pattern, not bad luck.

---

## Performance: cache in two layers

Helpers called several times per page — a menu tree, taxonomy groups, a whole
collection — are cached at both levels: **`static` within the request** plus a
**transient between requests**. On one port that took 31 queries to 0 on a repeat
call and 31 to 19 on a warm one.

- **A transient holds ids, not objects.** A serialised `WP_Post` is a large string
  that goes stale on any edit.
- **Invalidation is broad and stupid:** saving posts, editing menus, creating or
  editing terms and their meta.
- Remember that `static` belongs in a **named function**, not in a block's render
  file — see `reference/block-authoring.md`.

---

## Measuring the page, not the folder

Weight is measured as what is **transferred for one page**, not as the size of
`uploads/`. A folder total hides the one eight-megabyte hero that matters and
inflates on files no page requests.

And optimise **on the way in** — photographs to WebP, fonts to WOFF2, muted video
stripped of its audio track and scaled to the frame it plays in — rather than as a
pass at the end. A pass at the end is a migration.
