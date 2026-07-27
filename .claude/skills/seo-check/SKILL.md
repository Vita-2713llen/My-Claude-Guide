---
name: seo-check
description: SEO & performance setup gate that runs RIGHT AFTER page-check on any finished page. Use when the user types /seo-check, or says "сео", "seo", "перевір сео", "налаштуй сео", "оптимізація сторінки", "фавікон", "favicon", "og image", "graph image", "мета теги", "meta title", "meta description", "page speed", "pagespeed", "core web vitals", "alt тексти", "атрибути лінків". This skill AGREES each item with the designer (favicon, social share image, meta titles/descriptions, structured data), then IMPLEMENTS them and verifies top PageSpeed/Core Web Vitals, proper attributes on every link, and meaningful alt on every image. It is a conversation first — never invent brand assets or copy silently.
---

# SEO-CHECK — SEO & performance setup (agree → implement → verify)

This skill is the runnable form of the **SEO & PERFORMANCE SUPER-HARD HOOK** in `CLAUDE-CODE-GUIDE.md`. It runs
**immediately after `page-check` passes**, on the homepage **and every other finished page**. Unlike page-check
(audit only), this skill **does implement** — but only **after agreeing each item with the designer.**

## ⛔ Golden rule — agree first, never invent brand assets

Favicon, the social share image, meta titles and descriptions are **brand decisions**. Do **not** invent or ship
them silently. The flow is always: **ask the designer → get the asset/wording/decision → implement → verify.**
Run this **after** page-check, never before.

## Step 1 — Interview the designer (agree these before implementing)

Ask concise, concrete questions and wait for answers:

1. **Favicon** — what mark/source? (logo file, emoji, or generate from the wordmark?) Confirm before building the set.
2. **Open Graph / "graph" share image** — use an existing key visual, or generate a `1200×630`? Confirm the visual.
3. **Meta title** — per page, ≈50–60 chars, brand-suffixed. Propose wording, get approval.
4. **Meta description** — per page, ≈140–160 chars. Propose wording, get approval.
5. **Structured data** — which type fits (Organization / Product / Article / LocalBusiness)? Confirm.
6. **Scope** — this page only, or roll the same head/meta system across all pages?

Offer sensible defaults so the designer chooses **consciously**, then wait.

## Step 2 — Implement what was agreed

1. **Favicon set** — SVG + PNG `32`/`180`/`192`/`512`, `apple-touch-icon`, `site.webmanifest`, `theme-color`.
   Never leave the browser default.
2. **Social meta** — `og:title` / `og:description` / `og:image` (the 1200×630) / `og:url` / `og:type`, and
   `twitter:card=summary_large_image` (+ `twitter:image`).
3. **Head essentials** — one `<h1>` per page, correct heading order, `lang`, `charset`, `viewport`, `canonical`,
   plus the agreed JSON-LD structured data.
4. **Titles & descriptions** — the approved, unique-per-page `<title>` and `<meta name="description">`.
5. **PageSpeed / Core Web Vitals (MANDATORY — aim for top scores):**
   - images right-sized + modern format (WebP/AVIF) with explicit `width`/`height` (no CLS);
   - `loading="lazy"` below the fold, eager LCP image; `decoding="async"`;
   - minified CSS/JS, no unused code; `preconnect` for fonts + `font-display:swap`; no render-blocking resources.
6. **Links — proper attributes on every link:** descriptive text or `aria-label`; `rel="noopener"`
   (+`noreferrer` for external); `target` only when needed; no bare/class-less links.
7. **Images — every image:** meaningful `alt` (empty `alt=""` only for purely decorative), plus `width`/`height`,
   `loading`, `decoding`. Never `alt="image"` or placeholder text.

## Step 3 — Verify (report pass/fail)

Return a checklist (designer's language — Ukrainian by default) confirming each item, with ✅ / ⚠️ / ❓:

- Favicon set present and referenced • OG + Twitter tags complete • title & description unique and within length •
  one `<h1>` + canonical + structured data • **every link** has proper attributes • **every image** has a
  meaningful `alt` • Core Web Vitals targets met (list any risk: large image, blocking script, missing dimensions).
- For anything the designer must still decide, ask a confirmation question they can answer without scrolling.

## Reminders

- Runs **after** page-check; a page is shippable only when **both** are resolved.
- Re-run after any later edit that adds links, images, or copy.
- Reads the live guide HOOK as the source of truth — if the HOOK changes, this skill follows it.
- Per the deploy rule, after implementing, redeploy **all** files and bump the cache version.
