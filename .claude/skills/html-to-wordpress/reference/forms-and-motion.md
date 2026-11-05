# Forms and movement

Two subjects that share one property: both are mostly invisible until a visitor
does something, so both get declared finished after seeing one state.

---

**The default plugin is Contact Form 7**, and everything in this half of the file
is **specific to its markup** — the state classes, the `tabindex` option, the
error marker. On a project using something else, the rules still hold and the
names do not: look up that plugin's equivalents before writing a selector.

## A form has states, not a success message

Contact Form 7 announces what is happening with a class on `<form>`. On one port
only `sent` had been styled, and everything else arrived in the plugin's own admin
colours — blue, green, red, yellow — on a dark card.

**All ten are styled**, and they are a list, not a judgement call:

```
init · submitting · sent · invalid · unaccepted
payment-required · failed · aborted · spam · resetting
```

**And the button must show that it has been pressed.** A submit with no response
is why a visitor presses it three times. `submitting` is the state that does that
work, and it is the one most often left out, because a local form answers
instantly.

### What goes with that

- **Field-level errors are marked on the field**, not only summarised at the top:
  the plugin's own marker plus `aria-invalid`.
- **The message region is announced** — a status message that only changes
  visually does not exist for a screen reader.
- 🔴 **`tabindex` on a form control is `0` or absent.** A positive value reorders
  the tab sequence of the **whole** page. The plugin writes the markup, so the
  value is written **as an option in the form tag** rather than patched
  afterwards — `[text* your-name tabindex:0]`, and the submit button too:
  `[submit tabindex:0 "Send Message"]`. Patching the rendered HTML is undone the
  next time anyone saves the form in wp-admin.
- **`required` is written as `required="required"`** where a bare attribute is
  dropped by the renderer.
- **The recipient is an option**, never hard-coded in a template.
- **Never actually send while testing.** A real submission on a client's form
  reaches a client's inbox.

---

## Movement must not hang the page

- **`IntersectionObserver` instead of scroll handlers.**
- **No endless `requestAnimationFrame`** spinning when there is nothing to
  animate. The loop stops when the element leaves the screen.
- **Do not mix reading and writing layout in one frame** — that is a forced reflow
  on every iteration.
- 🔴 **`prefers-reduced-motion` turns movement off**, it does not slow it down.
- **A hidden tab stops the loops.**
- Verify by profiling a long page and looking for long frames, not by impression.

---

## `IntersectionObserver` reports a *change* of state, not a state

On one archive some cards never appeared. Not slowly — never. One sharp flick of
the page downwards and two rows stayed at `opacity: 0` until a reload, including
when the reader scrolled back up to look.

**Why.** The observer says "this is crossing the viewport now", and it says it at
the moment of **change**. Between two frames a card can travel the whole way from
below the viewport to above it without ever intersecting: the state did not change
(false → false), there is no callback, and the element stays armed forever.

**And the first fix was wrong for the same reason.** A branch was added *inside the
observer's callback* — "if the element is already above the viewport, show it". It
cannot fire: for the branch to run, the callback has to be called, and the missing
callback is the whole problem. The code looked right and the test reproduced the
same failure.

It works where there is already a scroll pass of its own: in it, the "not on
screen" branch now distinguishes **not yet reached** (leave it queued) from
**already passed** (show it with no animation and release it). There is nothing to
animate above the viewport, and a card the reader comes back to should simply be
there rather than arriving late.

### And a measurement lesson from the same bug

The first two measurements showed that **no** card appeared — an artefact: the tab
was not in the foreground, and `requestAnimationFrame` does not run in a background
tab. **When measuring animation, first make sure the tab is in front**, or you are
measuring the browser rather than the site.

---

## Anything that arrives after load is handed over finished

Not animated, and not "finished if it is on screen". The full rule, with the race
condition that makes the half-version behave differently on a slow machine, is in
`reference/loops-and-pagination.md`.

---

## Where the arrival itself is configured

Entrance animations are a panel on the block — UPQODE Animations — not a class
typed into a field. Three arrivals with agreed names, their distance, duration and
easing as variables, and a delay set by a variable rather than by fixed classes.
See `SKILL.md`, Step 10, and the panel template's README.

**Reveal animations are switched off inside the editor canvas** — see
`reference/editor-vs-front.md`.
