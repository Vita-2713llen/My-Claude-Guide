# Layout-spec — Aveline (berry-rose editorial beauty)

> Reference point that drives the build (per `design-references/README.md`).
> Note: the library galleries (land-book, minimal.gallery) returned HTTP 403 in this
> environment, so no live reference was pulled. This spec encodes the agreed editorial
> vector instead. If the designer supplies a screenshot/link, it takes priority and this
> spec is re-tuned.

Brief (a few words): premium women's cosmetics house — skincare + colour + fragrance,
"beauty that behaves like skincare", clean/refillable, flatters every undertone.

Direction (confirmed by designer): Berry-rose editorial · Fraunces + Instrument Sans ·
brand name "Aveline".

1. Hero composition   — full-bleed duotone portrait, text bottom-left (not centred),
                        display serif H1 on 2 lines, signature shade-swatch strip anchored
                        at the bottom as the one bold move.
2. Grid               — 1280 base-container, 15px gutters, asymmetric splits (1.05/0.95)
                        for the signature feature; 3- and 4-up card grids elsewhere.
3. Section rhythm     — alternating off-white / white / ink blocks so no two same-bg
                        sections touch; one dark "standard/values" block for density shift;
                        rose newsletter as the warm close before the ink footer.
4. Type hierarchy     — Fraunces display (76/64/52→36) vs Instrument Sans body; high
                        contrast, italic `.high` accent word inside headings.
5. Motion             — GSAP reveal (opacity + y-15, 0.8s, delay 0.45s, power3.out, once),
                        hero cascade on load; hover = 350ms (fills/underlines/arrow glide,
                        no vertical hop); prefers-reduced-motion respected.
6. Signature element  — the interactive hero shade-swatch strip (Petal→Nocturne); the lip
                        is echoed as the berry accent everywhere. Everything else quiet.
7. What we DON'T take  — no cream+serif+terracotta AI palette, no eyebrow/kicker above
                        headings, no fake 01/02/03, no templated "big number + gradient".

Reference-check (final): level ✓ (editorial, not templated), rhythm ✓ (alternating bg,
one dark block), signature ✓ (shade strip). Hooks: hero min-heights, fixed header +60px
clearance, 15/40/60 spacing skeleton, duotone imagery + fallback, UPQODE footer — all present.
