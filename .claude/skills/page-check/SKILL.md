---
name: page-check
description: QA gate for a finished, client+designer-approved page (homepage or ANY page). Run when the user types /page-check, or says "перевір сторінку", "запусти пейдж-чек", "фінальна перевірка", "page check", "QA the page", "готова сторінка — перевір". This skill ONLY audits and reports — it NEVER edits the design on its own. It scans the page against the guide's HOOKs (spacing skeleton, WCAG contrast, minification/optimisation, responsive/adaptivity, structure rules, reveal animation, line-height, hover, palette-graded imagery, footer/UPQODE) and returns a checklist plus confirmation questions for every deviation. Nothing is changed until the designer approves each fix.
---

# PAGE-CHECK — QA gate (audit only, never auto-edit)

This skill is the runnable form of the **PAGE-CHECK HARDCODE HOOK** in `CLAUDE-CODE-GUIDE.md`. It runs when a
page is **done and approved by both client and designer** and does a full logical review of the **whole page** —
homepage **and every other finished page**.

## ⛔ Golden rule — this is QA, not editing

**You do NOT change the design here.** No autonomous fixes, no "I went ahead and…". Every issue becomes either a
**checklist item** or a **confirmation question**. You only touch the code **after the designer approves that
specific fix**. Destroying or "improving" the design on your own is a violation of this skill.

The behaviour is always: **find → report → ask → wait for the designer → only then fix (one approved item at a time).**

## Step 1 — Scan the whole page, top to bottom

Audit against every relevant HOOK in the guide. For each area, note concrete, located findings (which element,
which line, what's wrong, what the guide says it should be):

1. **Spacing / uniformity (skeleton).** 15px heading→text · 40px text→button · 60px title→content (→40px on 568 & 360).
   Section spacing: no doubled gap between two same-background sections. Flag anything off-system.
2. **Colour & contrast.** Every real text/bg and UI pairing vs **WCAG** (≥4.5:1 body, ≥3:1 large headings/UI).
   List every failing pair with its measured ratio.
3. **Optimisation / weight.** Ask whether CSS/JS are minified, images right-sized and in modern formats, no unused
   code. **Proactively offer to optimise** — never assume it's done.
4. **Responsive / adaptivity.** Walk all 7 breakpoints (1920/1440/1280/992/768/568/360). Header must never break
   (burger from 768). Note any overflow, break, or lost layout.
5. **Reveal animation.** Everything from header to footer reveals (opacity 0→1 + y −15→0, .8s, delay .45s), incl.
   sections, **decorative lines/dividers** (even CSS borders — must be their own `data-reveal` element), and the
   whole footer. Flag anything static.
6. **Structure rules.** `<section>` + `section*`; content in `base-container`; max 2 classes; every element has its
   own class (no descendant selectors); buttons are `<a>`; components are single-master + identical everywhere.
7. **System details.** Line-heights (1.2 headings/links/buttons, 1.5 paragraphs); hover transitions 350ms; images
   graded to the brand palette; uniform + non-duplicate team photos; footer copyright + UPQODE (3 links, `{Project Name}`).
8. **Anything else off-system.** Typography scale (whole-integer px), max 2 fonts, text-balance, base-container 15px, etc.

## Step 2 — Report as a checklist + questions (do not fix yet)

Return the results in this shape, in the designer's language (Ukrainian by default here):

- A **checklist** grouped by the areas above. Use ✅ pass / ⚠️ deviation / ❓ needs a decision for each item.
- For every ⚠️/❓, write a **confirmation question** the designer can answer without scrolling — include where it is,
  what the guide expects, and the concrete fix you'd propose. Example:
  *"Секція Services → Studio: обидві на одному фоні, але верхній відступ подвоєний (132+132). Прибрати `no-sp-top`
  на Studio? [так/ні]"*
- If everything passes, say so explicitly and still surface the optimisation offer.

## Step 3 — Only fix what the designer approves

After the designer answers, apply **only** the approved fixes, one at a time, then (per the deploy rule) redeploy
**all** files and bump the cache version. Re-run the relevant checklist items to confirm. Never bundle in an
unapproved change.

## Reminders

- The page is "final" only after this check has run and its questions are resolved.
- Run it again after any later edit to a finished page.
- This skill reads the live guide HOOKs as the source of truth — if a HOOK changes, the check follows it.
