# Query Loops, pagination, and paging without a reload

Open this when a page lists records: a blog, an archive, a resources feed, a row
of cards drawn from a collection.

---

## Pagination: an archive without it says nothing

🔴 A Query Loop shows exactly as many records as it was told to, and if there are
more, **the rest simply do not exist for a visitor.** No error, no "next".

**This is invisible while there is only one page of records, which is exactly why
it is missed.** Six posts at six per page look completely correct. On one port two
lists of posts existed: a feed with no navigation at all, and a blog page where
the navigation **was present and unstyled** — core's links, which nobody had ever
seen, because the blog inherited "10 per page" with six posts in it.

So:

- **Check every archive and every list**: blog, feed, categories, tags, search.
- **Check it by creating one record too many.** That is the only way to see it.
- **Pagination is design too.** Left to core it looks foreign on the page, so it
  is styled with everything else.
- **A seventh post without navigation does not "move to page two" — it
  disappears.** It is published, it has an address, it is in the sitemap, and
  there is no route to it from the site.

### Two kinds of address, and there is no choice about it

| The list | How it pages |
|---|---|
| a Query Loop that does **not** inherit the main query | a query string — `/resources/?query-80-page=2` |
| the posts page (inheriting) | a path — `/blog/page/2/` |

Both work; the second is better for a search engine. Which one you get follows
from `inherit`, so it is a consequence of the list's job, not a preference.

### And the count set in two places

Records per page can be set on the block **and** in WordPress's own reading
settings. **The block wins**, and the person changing the setting cannot work out
why nothing happened. Decide where it lives and say so.

---

## A filter that silently disappears

🔴 Covered as a hard rule in `SKILL.md`, and repeated here because this is where
it bites: `build_query_vars_from_query_block()` discards any taxonomy that fails
`is_taxonomy_viewable()` — that is, `publicly_queryable`. **The filter does not
error. It vanishes**, and the loop returns everything.

What that looked like on one site, found half a day later:

- a price list drew every service two or three times — 41 rows instead of 25;
- both FAQs showed all 16 questions instead of their own 8;
- a listing page showed 12 cards in each of three categories instead of 6 / 5 / 2
  — 13567px instead of 7348.

The correct registration is `public => false` **and**
`publicly_queryable => true`, with no `rewrite`: the term has no page of its own —
its addresses 404, it is absent from the sitemap, nothing links to it — but it
stays queryable, which is the only thing the loop needs.

**And a lesson about checking.** After that fix, every page returned 200 and the
heights matched — which proved nothing, because the heights had been taken
**after** the breakage, so they matched the broken state. 🔴 **A change that can
*add* rows is verified by counting what the loop returned**, not by a status code
and not by a height.

---

## Cards that will not fit across a tablet: a strip, and it is a block style

Three cards do not fit across a tablet, and the usual Query Loop answer is to drop
the third onto its own row. The result is a row of two with a widow under it and a
section twice as tall for nothing.

The right answer from 991 down is to lay them out as a **strip that is pushed
sideways**:

```css
@media (max-width: 991px) {
	.is-style-theme-strip {
		display: flex;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}
	.is-style-theme-strip > li { flex: 0 0 auto; width: 60%; scroll-snap-align: start; }
}
```

**The point is that this is a block style, not a rule against one section's
class.** `register_block_style( 'core/post-template', … )`, and the client turns it
on in the **Styles** tab. Nothing in the behaviour belongs to one particular
section: any row of cards on the site may behave this way, and it should be
visible that it is a choice rather than a sentence.

### Three things that break if you do not know them

1. **A Query Loop wraps every card in an `<li>`.** On a grid that wrapper is
   `display: contents` and the grid lays out the card itself. In a strip it is the
   opposite: the `<li>` has to become a real flex item, or the card has nothing to
   take its width from. Height matching moves there too —
   `> li > * { height: 100% }`.
2. **The arrow's step is measured, not set.** Card width is a percentage of the
   strip and differs per breakpoint; a fixed step leaves a card straddling the
   edge. Take the first item's `getBoundingClientRect().width` plus its
   `columnGap`.
3. **The arrows are written by script if the section is a synced pattern.** Markup
   added to the pattern file never reaches the database — it would have to be
   migrated into the single record every post shares, for an element that is chrome
   rather than content. A script adds them and hides them when there is nothing to
   scroll, so on desktop they never appear at all.

---

## Paging without a reload: one block turns it off for everyone

A Query Loop can page without reloading (`enhancedPagination`), but setting the
attribute is not enough: the page reloaded anyway, **with nothing in the
console**. The markup was right, all three modules loaded with 200, the
`core/query` store was registered, the handler was bound to the link — and the
click still did a full navigation.

**The diagnosis, step by step, because guessing does not get here:**

1. a synthetic `dispatchEvent` click worked, a real one did not. That was the most
   misleading part and was in fact a timing accident;
2. `defaultPrevented` on the **real** click turned out to be `true` — so the
   browser's navigation *was* cancelled, and the page was being changed by the
   router itself;
3. therefore the reload was the router's. Its code has one fallback —
   `window.location.assign` — guarded by `clientNavigationDisabled`;
4. that flag is printed by the server into
   `<script id="wp-script-module-data-@wordpress/interactivity">`. There it was:
   `{"core/router":{"clientNavigationDisabled":true}}`.

**The cause:** core's `query.php` marks the whole list dirty as soon as it contains
a block that has **not declared** `supports.interactivity.clientNavigation`. One
of the theme's own blocks inside a card disabled client navigation for the entire
list.

Cured by one line in the `block.json` of every own block that occurs inside a
loop. The declaration is only honest for blocks with no state of their own in JS:
it means "I can be repainted in place".

### The other half — what breaks *because* there is no reload

Everything bound on page load knows nothing about the new cards. A reveal
animation that sets `opacity: 0` as a start state and removes it with an observer
meant page two arrived **blank**: one card, opacity zero, no error.

Fixed with a `MutationObserver` that arms whatever appears after load, no more
than once per frame.

### And what "it works" means here — four measured things

- the document is the same (`performance.timeOrigin` unchanged; a marker on
  `window` is unreliable);
- the address changed;
- the cards are visible;
- the **back** button does not reload either.

---

## Content that arrived without a reload is given ready, not animated

Having taught the reveal to arm new cards, they began **playing their entrance**
under a heading that did not move. It reads as though the section is rebuilding
itself; one client described it as "the heading and subtitle are animating again",
when the heading measurably never changed — same node, opacity 1.

**Rule: anything that arrives after page load is handed over finished.**

**And not "finished if it is on screen".** That was the first attempt, and four of
six cards still played: a node inserted in this frame has no geometry yet, so the
"is it visible" check answers differently depending on who got there first. A rule
that depends on winning a race behaves differently on a slow machine. **Finished —
all of it.**

The same decision usually already exists elsewhere in the theme, for switching
tabs; extend it rather than inventing a second policy.

---

## Related

- Hiding a type or taxonomy correctly: `SKILL.md`, Defects.
- A field that must stay a field because a loop still draws the entity:
  `reference/content-model.md`.
- The reveal animation and the observer that misses a fast scroll:
  `reference/forms-and-motion.md`.
