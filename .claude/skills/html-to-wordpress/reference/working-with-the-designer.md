# Working with the designer

Open this at the start of a project and again whenever a correction arrives.

None of it is about WordPress. All of it comes from mistakes that cost real time
on a real port, and most of them are mistakes of **reporting**, not of building.

---

## Keep the checklist, and keep it numbered

On one project the designer kept a numbered document, appended to it with dates
("New — Sep 29", "Sep 30"), and **that document is what held the project in
shape.**

**The skill should keep one itself:** numbered, dated, each item marked *done /
deferred / the client's decision*, and returned to before handover.

Some items hung for months precisely because they lived in the designer's document
rather than in the work — on one port, renaming 25 headings and about 380 field
labels was agreed and never done, because that item existed only on her list.

So: when a correction arrives, it goes into the numbered list **and** into the
work. A correction that exists only in chat has not been received.

---

## Eight mistakes and the rule each one produced

| What happened | The rule |
|---|---|
| "we don't need those styles" was read as "remove the different tile widths" — that is, the design itself, not the control | **When asked to remove a control, remove the control.** The design stays. If it is ambiguous, ask in one line rather than guessing |
| "done" was said from the state of the page while the editor was broken | **Check both surfaces before reporting** |
| the wrong elements were measured, and "21 discrepancies" was reported | **Prove the harness on a case known to be sound** before believing it |
| several "bugs" turned out to be a stale editor tab | **After any asset change, force a reload before measuring** — and say that you did |
| it was verified that the sections render, but not their width | **Verify what was asked about**, not the thing next to it |
| a Query Loop was argued against, when the theme already contained an identical pattern | **Before objecting, look at whether it is already done that way nearby** |
| `theme.json` was cited, where the link colour contradicted the theme's own CSS | **The source of truth is what actually applies.** Show the contradiction rather than quoting the more convenient side |
| a report said something that had not been measured | **Say what was measured.** If a claim is about behaviour, measure the behaviour — an `<a>` without `href` reports `tabIndex: 0` and still cannot be focused |

---

## Ask yourself the designer's question before she does

**"Why is this custom? Can it not be done with Gutenberg?"**

Usually it can, and the honest reason it is not is that the custom form was
**easier to port**. The full version of this, with the one thing core genuinely
cannot do, is in `reference/content-model.md`.

Its companion: **"why are you adding a custom field for something that is in the
styles panel?"** The answer is never "then keep the field".

---

## The client's words win

- **Field and section names are the client's words, not the developer's.**
- When the designer chooses wording you would not have chosen, explain the
  difference **once** and do as asked. That is the right order: explain briefly,
  do it, do not argue twice.
- A value the client calls "for posts" almost always means "for all posts" — see
  `reference/content-model.md`.

---

## Reporting

- **Report every exception and everything not verified, before being asked.**
- **Every check says how much it examined.** "0 differences" with no count behind
  it is not a result.
- **Nothing is removed as "invented"** without checking the source's interactions
  payload as well as its stylesheet — a missing `:hover` rule is a value, and so
  is an animation declared somewhere other than CSS.
- **A correction is applied on the block**, and written to **both** the pattern
  file and the page's stored content, with the occurrence count asserted before
  the write.

---

## One environment note that has cost two corrupted files

🔴 **Never write a theme file through the shell — including "just one line".** No
heredocs, no `echo >`, no `sed -i`. Quoting eats backticks, dollar signs, `!` and
braces, and the failure is not a visible error: it is a file that still parses, a
check that still passes, and a defect an hour later. Both times the damage showed
up as a **false pass**.

And a specific one worth knowing: **a heredoc in this environment collapses `\\`
into `\`.** Inside a heredoc, `\\n` becomes a real line break in a JavaScript
literal. If a script has to contain a backslash, write the file with a
file-writing tool, not with the shell.

The full rule, with the structural checks that replace counting braces, is
non-negotiable 11 in `SKILL.md`.

## Three habits that saved or cost a day

**Find the client's own words before deciding from your notes.** A summary of a decision is
a decision you made once and forgot making. One run: a note recorded the client's rule
accurately and folded away a single sentence of theirs — and that sentence, found by
searching the transcripts, reversed which side of the problem needed fixing. If a decision
is about to change behaviour for real people, go and read what they actually wrote.

**Unused is not useless.** Asked to remove everything unused, check what each thing is *for*
before removing it. The inserter and the Styles tab are the **client's toolkit**: a pattern
offered and not yet placed is a capability, not a leftover; a block kept deliberately so a
removed feature can be restored in one line is documented, not dead. What is dead is what
nothing can reach and nobody can choose. Say which is which, and let them decide the rest.

**Name the decisions that are not yours.** Anything about money, policy, or who somebody is
goes to the client — drafted in their language so it can be forwarded as it stands. The
tell is a fix that would change what a real person can see or pay for; that is not resolved
in code because code was the tool at hand.
