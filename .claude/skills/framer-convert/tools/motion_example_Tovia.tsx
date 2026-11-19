// Tovia — every animation and interaction on the site, ported 1:1 from the source motion spec (cv-gsap.js)
// and the live site's measured behaviour. One override, withToviaMotion, attached to the FIRST section of every
// page (static pages and CMS templates). It finds layers by name ([data-framer-name…]) so the canvas stays editable.
//
// The one reveal: from { opacity: 0, y: -15 } over 0.8s power2.out.
//   on screen at load  -> CSS keyframes started by an early inline script (first paint), delay .45 + i * .05
//   below the fold     -> GSAP ScrollTrigger, start "top 92%", delay .15, once
// Scenes: hero media parallax, records wash parallax, departments weave drift, services rail (sticky, ≥1200),
// about flow stepper (scroll), FAQ nav scroll-spy, values bars. Clicks (delegated, installed once at module load):
// slider arrows + swipe, voice video play/pause, departments route tabs, testimonials voice tabs, FAQ / About
// accordions, pricing compare tabs, same-page anchors through Lenis. Lenis smooth scroll 1.05s.
import * as React from "react"
import type { ComponentType } from "react"
import { RenderTarget } from "framer"
// @ts-ignore
import { gsap } from "https://esm.sh/gsap@3.12.5"
// @ts-ignore
import { ScrollTrigger } from "https://esm.sh/gsap@3.12.5/ScrollTrigger"
// @ts-ignore
import Lenis from "https://esm.sh/lenis@1.1.13"

const RV = { y: -15, duration: 0.8, ease: "power2.out", loadDelay: 0.45, scrollDelay: 0.15, stagger: 0.05, start: "top 92%" }
const EASE_CSS = "cubic-bezier(.215,.61,.355,1)"
const N = (name: string) => `[data-framer-name~="${name}"]`
const P = (name: string) => `[data-framer-name^="${name}"]`
const INK = "rgb(6, 8, 15)"
const INK46 = "rgba(6, 8, 15, 0.46)"

// first-screen units: texts, buttons, images of the first section, in reading order
const UNIT_SEL = '[data-framer-component-type="RichTextContainer"], a[data-framer-name], [data-framer-name~="tovia-button-primary"], [data-framer-name~="tovia-button-glass"]'

const hatch = (c: string) => `background-image:repeating-linear-gradient(45deg,${c}12 0 1px,${c}00 1px 14.14px)`
const hatchSoft = (c: string) => `background-image:repeating-linear-gradient(45deg,${c}0d 0 1px,${c}00 1px 14.14px)`

const CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes tvIn { from { opacity: 0; transform: translateY(${RV.y}px) } to { opacity: 1; transform: none } }
  [data-tv-in] { animation: tvIn ${RV.duration}s ${EASE_CSS} both; }
  @keyframes tvPulse { 0%,100% { opacity: 1; transform: none } 50% { opacity: .34; transform: scale(.8) } }
  ${N("tovia-hero-strip-dot")} { animation: tvPulse 2.4s ease-in-out infinite; }
}
${N("tovia-hero-strip-value")}, ${N("tovia-records-stat-value")} { white-space: nowrap; }
/* hatch layers that came over empty (live: repeating-linear-gradient 45deg, 1px line every 14.14px) */
${P("tovia-departments-weave")}:empty, ${P("tovia-ask-weave")}:empty, ${P("tovia-team-quotes-weave")}:empty { ${hatch("#06080f")} }
${P("tovia-depts-sys-weave")}:empty, ${P("tovia-ct-ways-weave")}:empty { ${hatchSoft("#06080f")} }
${P("tovia-note-weave")}:empty { ${hatch("#0a1440")} }
${P("tovia-bl-banner-weave")}:empty { ${hatchSoft("#0a1440")} }
/* live weaves bleed 30px past their section on every side (inset:-30px), at every width */
${P("tovia-departments-weave")}, ${P("tovia-team-quotes-weave")} { top: -30px !important; right: -30px !important; bottom: -30px !important; left: -30px !important; width: auto !important; height: auto !important; }
/* /testimonials banner faces overlap */
${P("tovia-voice-banner-face")} + ${P("tovia-voice-banner-face")} { margin-left: -12px !important; }
/* rich-text bodies: heading + next block = 15px (live margin-bottom of h2/h3) */
[data-framer-name="Body"] :is(h2,h3) + :is(p,ul,ol,blockquote) { margin-top: 15px !important; }
/* interactive states */
${P("tovia-voices-play")}, ${P("tovia-faq-sum")}, ${P("tovia-about-ask-question")}, [data-framer-name*="w-slider-arrow-"], ${P("tovia-depts-route-tab")}, ${P("tovia-voice-words-tab")}, ${P("tovia-pr-cmp-tab")}, ${P("tovia-about-flow-step")} { cursor: pointer; }
${P("tovia-about-flow-iso")} { transition: opacity .35s ${EASE_CSS}; }
[data-framer-name*="w-slider-mask"] { touch-action: pan-y; }
[data-framer-name*="w-slider-mask"] :is(a, img) { -webkit-user-drag: none; user-select: none; }

/* ---- hovers ported from live (measured end-states, hovaudit) ---- */
/* generated from live hover end-states */
[data-framer-name~="tovia-about-roll-shot-link"],
[data-framer-name~="tovia-about-roll-soc"],
[data-framer-name~="tovia-about-roll-soc"] [data-framer-name~="tovia-about-roll-soc-glyph"],
[data-framer-name~="tovia-about-roll-name"],
[data-framer-name~="tovia-about-roll-ava"],
[data-framer-name~="tovia-about-roll-ava"] [data-framer-name~="tovia-about-roll-ava-img"],
[data-framer-name~="tovia-about-roll-ava"] [data-framer-name~="tovia-about-roll-ava-tint"],
[data-framer-name~="tovia-about-roll-ava-img"],
[data-framer-name~="tovia-about-roll-name"][data-framer-name~="small"],
[data-framer-name~="tovia-about-pledge-card"],
[data-framer-name~="tovia-about-pledge-art"],
[data-framer-name~="tovia-about-pledge-art"] [data-framer-name~="tovia-about-pledge-weave"],
[data-framer-name~="tovia-about-pledge-art"] [data-framer-name~="tovia-about-pledge-iso"],
[data-framer-name~="tovia-about-pledge-title"],
[data-framer-name~="tovia-about-ask-question"],
[data-framer-name~="tovia-about-ask-question"] [data-framer-name~="tovia-about-ask-question-measure"],
[data-framer-name~="tovia-about-ask-question"] [data-framer-name~="tovia-about-ask-question-text"],
[data-framer-name~="tovia-about-ask-question"] [data-framer-name~="tovia-about-ask-sign"],
[data-framer-name~="tovia-about-ask-question"] [data-framer-name~="tovia-about-ask-sign-bar"],
[data-framer-name~="tovia-about-ask-question"] [data-framer-name~="tovia-about-ask-sign-bar-cross"][data-framer-name~="open"],
[data-framer-name~="tovia-button-light"],
[data-framer-name~="tovia-footer-link"],
[data-framer-name~="tovia-footer-credit-link"],
[data-framer-name~="tovia-po-body-ico"],
[data-framer-name~="tovia-po-body-ico"] [data-framer-name~="tovia-po-body-ico-glyph"],
[data-framer-name~="tovia-po-more-all"],
[data-framer-name~="tovia-po-more-all"] .framer-text,
[data-framer-name~="tovia-po-more-all"] [data-framer-name~="tovia-po-more-arrow"],
[data-framer-name~="tovia-bl-grid-card"],
[data-framer-name~="tovia-bl-grid-card"] [data-framer-name~="tovia-bl-grid-shot"],
[data-framer-name~="tovia-bl-grid-card"] [data-framer-name~="tovia-bl-grid-img"],
[data-framer-name~="tovia-bl-grid-card"] [data-framer-name~="tovia-bl-grid-tint"],
[data-framer-name~="tovia-bl-grid-card"] [data-framer-name~="tovia-bl-grid-body"],
[data-framer-name~="tovia-bl-grid-card"] [data-framer-name~="tovia-bl-grid-ex-measure"],
[data-framer-name~="tovia-bl-grid-shot"],
[data-framer-name~="tovia-bl-grid-shot"] [data-framer-name~="tovia-bl-grid-img"],
[data-framer-name~="tovia-bl-grid-shot"] [data-framer-name~="tovia-bl-grid-tint"],
[data-framer-name~="tovia-bl-grid-topic"],
[data-framer-name~="tovia-bl-grid-heading-link"],
[data-framer-name~="tovia-note-input"][data-framer-name~="min-width"],
[data-framer-name~="tovia-note-send"],
[data-framer-name~="tovia-departments-btn"],
[data-framer-name~="tovia-ct-banner-input"],
[data-framer-name~="tovia-ct-banner-chip"],
[data-framer-name~="tovia-ct-banner-input"][data-framer-name~="tovia-ct-banner-area"],
[data-framer-name~="tovia-ct-banner-submit"],
[data-framer-name~="tovia-ct-ways-value"],
[data-framer-name~="tovia-depts-sys-name"],
[data-framer-name~="tovia-depts-sys-go"],
[data-framer-name~="tovia-depts-sys-go"] [data-framer-name~="tovia-depts-sys-go-arrow"],
[data-framer-name~="tovia-depts-dial-row"],
[data-framer-name~="tovia-depts-dial-row"] [data-framer-name~="tovia-depts-dial-rn"],
[data-framer-name~="tovia-depts-dial-row"] [data-framer-name~="tovia-depts-dial-rt"],
[data-framer-name~="tovia-depts-dial-row"] [data-framer-name~="tovia-depts-dial-dot"],
[data-framer-name~="tovia-depts-route-tab"],
[data-framer-name~="tovia-depts-route-tab"] .framer-text,
[data-framer-name~="tovia-depts-route-go"],
[data-framer-name~="tovia-depts-route-go"] .framer-text,
[data-framer-name~="tovia-depts-route-go"] [data-framer-name~="tovia-depts-route-arrow"],
[data-framer-name~="tovia-depts-route-tel"],
[data-framer-name~="tovia-faq-nav-item"],
[data-framer-name~="tovia-faq-nav-item"] .framer-text,
[data-framer-name~="tovia-faq-aside-link"],
[data-framer-name~="tovia-faq-aside-link"] .framer-text,
[data-framer-name~="tovia-faq-aside-link"] [data-framer-name~="tovia-faq-aside-arrow"],
[data-framer-name~="tovia-faq-sum"],
[data-framer-name~="tovia-faq-sum"] [data-framer-name~="tovia-faq-q"],
[data-framer-name~="tovia-faq-sum"] [data-framer-name~="tovia-faq-chev"],
[data-framer-name~="tovia-hero-strip-link"],
[data-framer-name~="tovia-hero-strip-link"] .framer-text,
[data-framer-name~="tovia-hero-strip-link"] [data-framer-name~="tovia-hero-strip-arrow"],
[data-framer-name~="tovia-hero-strip-link"] [data-framer-name~="tovia-hero-strip-arrow-hover"],
[data-framer-name~="tovia-team-chamber-shot-link"],
[data-framer-name~="tovia-team-chamber-soc"],
[data-framer-name~="tovia-team-chamber-soc"] [data-framer-name~="tovia-team-chamber-soc-glyph"],
[data-framer-name~="tovia-team-chamber-name"],
[data-framer-name~="tovia-team-depts-row"],
[data-framer-name~="tovia-team-depts-row"] [data-framer-name~="tovia-team-depts-row-arrow"],
[data-framer-name~="tovia-team-depts-name"],
[data-framer-name~="tovia-pr-when-step"],
[data-framer-name~="tovia-services-grid-art"],
[data-framer-name~="tovia-services-grid-art"] [data-framer-name~="tovia-services-grid-weave"],
[data-framer-name~="tovia-services-grid-art"] [data-framer-name~="tovia-services-grid-iso"],
[data-framer-name~="tovia-services-grid-title"]{transition:color .35s cubic-bezier(.2,.8,.2,1),background-color .35s cubic-bezier(.2,.8,.2,1),border-color .35s,box-shadow .35s,opacity .35s,transform .45s cubic-bezier(.2,.8,.2,1),filter .35s}
@media (hover:hover){[data-framer-name~="tovia-about-roll-shot-link"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-shot-link"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-soc"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;background-color:rgb(29, 75, 243) !important;border-color:rgb(29, 75, 243) !important;--border-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-soc"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-soc"]:hover [data-framer-name~="tovia-about-roll-soc-glyph"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-soc"]:hover [data-framer-name~="tovia-about-roll-soc-glyph"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-name"]:hover{color:rgb(119, 147, 248) !important;--framer-text-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-name"]:hover .framer-text{color:rgb(119, 147, 248) !important;--framer-text-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover [data-framer-name~="tovia-about-roll-ava-img"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.05, 0, 0, 1.05, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover [data-framer-name~="tovia-about-roll-ava-img"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover [data-framer-name~="tovia-about-roll-ava-tint"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava"]:hover [data-framer-name~="tovia-about-roll-ava-tint"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava-img"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.05, 0, 0, 1.05, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-ava-img"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-name"][data-framer-name~="small"]:hover{color:rgb(119, 147, 248) !important;--framer-text-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-roll-name"][data-framer-name~="small"]:hover .framer-text{color:rgb(119, 147, 248) !important;--framer-text-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-card"]:hover{border-color:rgb(205, 206, 207) !important;--border-color:rgb(205, 206, 207) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover [data-framer-name~="tovia-about-pledge-weave"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover [data-framer-name~="tovia-about-pledge-weave"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover [data-framer-name~="tovia-about-pledge-iso"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.05, 0, 0, 1.05, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-art"]:hover [data-framer-name~="tovia-about-pledge-iso"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-title"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-pledge-title"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-question-measure"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-question-measure"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-question-text"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-question-text"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign-bar"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign-bar"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign-bar-cross"][data-framer-name~="open"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-about-ask-question"]:hover [data-framer-name~="tovia-about-ask-sign-bar-cross"][data-framer-name~="open"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-button-light"]:hover > [data-framer-name], [data-framer-name~="tovia-button-light"]:hover > .ssr-variant > [data-framer-name]{background-color:rgb(119, 147, 248) !important;border-color:rgb(119, 147, 248) !important;--border-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-footer-link"]:hover{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-footer-link"]:hover .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-footer-credit-link"]:hover{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-footer-credit-link"]:hover .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-body-ico"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;background-color:rgb(246, 248, 255) !important;border-color:rgb(29, 75, 243) !important;--border-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-body-ico"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-body-ico"]:hover [data-framer-name~="tovia-po-body-ico-glyph"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-body-ico"]:hover [data-framer-name~="tovia-po-body-ico-glyph"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-more-all"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-more-all"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-more-all"]:hover .framer-text .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-more-all"]:hover [data-framer-name~="tovia-po-more-arrow"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-po-more-all"]:hover [data-framer-name~="tovia-po-more-arrow"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-shot"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-shot"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-img"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.05, 0, 0, 1.05, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-img"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-tint"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-tint"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-body"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-body"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-ex-measure"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-card"]:hover [data-framer-name~="tovia-bl-grid-ex-measure"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover [data-framer-name~="tovia-bl-grid-img"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.05, 0, 0, 1.05, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover [data-framer-name~="tovia-bl-grid-img"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover [data-framer-name~="tovia-bl-grid-tint"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-shot"]:hover [data-framer-name~="tovia-bl-grid-tint"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-topic"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-topic"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-heading-link"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-bl-grid-heading-link"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-note-input"][data-framer-name~="min-width"]:hover{border-color:rgb(119, 147, 248) !important;--border-color:rgb(119, 147, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-note-send"]:hover > [data-framer-name], [data-framer-name~="tovia-note-send"]:hover > .ssr-variant > [data-framer-name]{background-color:rgb(10, 20, 64) !important}}
@media (hover:hover){[data-framer-name~="tovia-departments-btn"]:hover > [data-framer-name], [data-framer-name~="tovia-departments-btn"]:hover > .ssr-variant > [data-framer-name]{background-color:rgb(20, 59, 201) !important;border-color:rgb(20, 59, 201) !important;--border-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-banner-input"]:hover{border-color:rgb(205, 206, 207) !important;--border-color:rgb(205, 206, 207) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-banner-chip"]:hover{border-color:rgb(29, 75, 243) !important;--border-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-banner-input"][data-framer-name~="tovia-ct-banner-area"]:hover{border-color:rgb(205, 206, 207) !important;--border-color:rgb(205, 206, 207) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-banner-submit"]:hover > [data-framer-name], [data-framer-name~="tovia-ct-banner-submit"]:hover > .ssr-variant > [data-framer-name]{background-color:rgb(20, 59, 201) !important;border-color:rgb(20, 59, 201) !important;--border-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-ways-value"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-ct-ways-value"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-sys-name"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-sys-name"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-sys-go"]:hover{background-color:rgb(20, 59, 201) !important;border-color:rgb(20, 59, 201) !important;--border-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-sys-go"]:hover [data-framer-name~="tovia-depts-sys-go-arrow"]{transform:matrix(1, 0, 0, 1, 4, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-rn"]{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-rn"] .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-rt"]{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-rt"] .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-dot"]{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-dial-row"]:hover [data-framer-name~="tovia-depts-dial-dot"] .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-tab"]:hover{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-tab"]:hover .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-tab"]:hover .framer-text .framer-text{color:rgb(6, 8, 15) !important;--framer-text-color:rgb(6, 8, 15) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-go"]:hover{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-go"]:hover .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-go"]:hover .framer-text .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-go"]:hover [data-framer-name~="tovia-depts-route-arrow"]{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-go"]:hover [data-framer-name~="tovia-depts-route-arrow"] .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-tel"]:hover{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-depts-route-tel"]:hover .framer-text{color:rgb(255, 255, 255) !important;--framer-text-color:rgb(255, 255, 255) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-nav-item"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-nav-item"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-nav-item"]:hover .framer-text .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-aside-link"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-aside-link"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-aside-link"]:hover .framer-text .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-aside-link"]:hover [data-framer-name~="tovia-faq-aside-arrow"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-aside-link"]:hover [data-framer-name~="tovia-faq-aside-arrow"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover [data-framer-name~="tovia-faq-q"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover [data-framer-name~="tovia-faq-q"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover [data-framer-name~="tovia-faq-chev"]{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-faq-sum"]:hover [data-framer-name~="tovia-faq-chev"] .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover .framer-text{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover .framer-text .framer-text{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover [data-framer-name~="tovia-hero-strip-arrow"]{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important;opacity:0 !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover [data-framer-name~="tovia-hero-strip-arrow"] .framer-text{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover [data-framer-name~="tovia-hero-strip-arrow-hover"]{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important;opacity:1 !important}}
@media (hover:hover){[data-framer-name~="tovia-hero-strip-link"]:hover [data-framer-name~="tovia-hero-strip-arrow-hover"] .framer-text{color:rgb(131, 156, 248) !important;--framer-text-color:rgb(131, 156, 248) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-shot-link"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-shot-link"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-soc"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;background-color:rgb(29, 75, 243) !important;border-color:rgb(29, 75, 243) !important;--border-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-soc"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-soc"]:hover [data-framer-name~="tovia-team-chamber-soc-glyph"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-soc"]:hover [data-framer-name~="tovia-team-chamber-soc-glyph"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-name"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-chamber-name"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-row"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-row"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-row"]:hover [data-framer-name~="tovia-team-depts-row-arrow"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-row"]:hover [data-framer-name~="tovia-team-depts-row-arrow"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-name"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-team-depts-name"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-pr-when-step"]:hover{border-color:rgb(205, 206, 207) !important;--border-color:rgb(205, 206, 207) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover [data-framer-name~="tovia-services-grid-weave"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover [data-framer-name~="tovia-services-grid-weave"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover [data-framer-name~="tovia-services-grid-iso"]{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important;transform:matrix(1.06, 0, 0, 1.06, 0, 0) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-art"]:hover [data-framer-name~="tovia-services-grid-iso"] .framer-text{color:rgb(20, 59, 201) !important;--framer-text-color:rgb(20, 59, 201) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-title"]:hover{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}
@media (hover:hover){[data-framer-name~="tovia-services-grid-title"]:hover .framer-text{color:rgb(29, 75, 243) !important;--framer-text-color:rgb(29, 75, 243) !important}}

/* ---- end hovers ---- */
/* ---- live tiers: Webflow desktop starts at 992 and keeps its base type until 1279 (measured per text style) ---- */
@media (min-width: 992px) and (max-width: 1199.98px) {
  .framer-styles-preset-1ed1kvy{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1kzknlp{--framer-font-size:20px!important;--framer-line-height:24px!important;--framer-letter-spacing:-0.6px!important}
  .framer-styles-preset-1uzmt41{--framer-font-size:18px!important;--framer-line-height:18px!important;--framer-letter-spacing:-0.54px!important}
  .framer-styles-preset-8nlg2k{--framer-font-size:14px!important;--framer-line-height:19.6px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-j4irbg{--framer-font-size:60px!important;--framer-line-height:72px!important;--framer-letter-spacing:-1.8px!important}
  .framer-styles-preset-jzwva6{--framer-font-size:46px!important;--framer-line-height:55.2px!important;--framer-letter-spacing:-1.38px!important}
  .framer-styles-preset-k4ysy0{--framer-font-size:16px!important;--framer-line-height:19.2px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-l7tzks{--framer-font-size:45px!important;--framer-line-height:54px!important;--framer-letter-spacing:-1.35px!important}
  .framer-styles-preset-nuq7n4{--framer-font-size:46px!important;--framer-line-height:55.2px!important;--framer-letter-spacing:-1.38px!important}
  .framer-styles-preset-oizxfs{--framer-font-size:60px!important;--framer-line-height:72px!important;--framer-letter-spacing:-1.8px!important}
  .framer-styles-preset-vkss1u{--framer-font-size:50px!important;--framer-line-height:60px!important;--framer-letter-spacing:-1.5px!important}
  .framer-styles-preset-wi6s7b{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
}
@media (min-width: 1200px) and (max-width: 1279.98px) {
  .framer-styles-preset-17ymbi9{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1348mfd{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-18d3ldj{--framer-font-size:24px!important;--framer-line-height:31.2px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1b9sfi0{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-1bh90jk{--framer-font-size:14px!important;--framer-line-height:21px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-1ewksm3{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-1kzknlp{--framer-font-size:20px!important;--framer-line-height:24px!important;--framer-letter-spacing:-0.6px!important}
  .framer-styles-preset-1lc2aoj{--framer-font-size:12px!important;--framer-line-height:18px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-1neults{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-1ovql7x{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1q9ekzu{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1x5b7nf{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-3li09b{--framer-font-size:40px!important;--framer-line-height:48px!important;--framer-letter-spacing:-1.2px!important}
  .framer-styles-preset-9pbcua{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-gjl7py{--framer-font-size:20px!important;--framer-line-height:24px!important;--framer-letter-spacing:-0.6px!important}
  .framer-styles-preset-j4irbg{--framer-font-size:60px!important;--framer-line-height:72px!important;--framer-letter-spacing:-1.8px!important}
  .framer-styles-preset-jzwva6{--framer-font-size:46px!important;--framer-line-height:55.2px!important;--framer-letter-spacing:-1.38px!important}
  .framer-styles-preset-l7tzks{--framer-font-size:45px!important;--framer-line-height:54px!important;--framer-letter-spacing:-1.35px!important}
  .framer-styles-preset-md05vo{--framer-font-size:28px!important;--framer-line-height:33.6px!important;--framer-letter-spacing:-0.84px!important}
  .framer-styles-preset-nuq7n4{--framer-font-size:46px!important;--framer-line-height:55.2px!important;--framer-letter-spacing:-1.38px!important}
  .framer-styles-preset-oizxfs{--framer-font-size:60px!important;--framer-line-height:72px!important;--framer-letter-spacing:-1.8px!important}
  .framer-styles-preset-te7ryf{--framer-font-size:18px!important;--framer-line-height:27px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-vkss1u{--framer-font-size:50px!important;--framer-line-height:60px!important;--framer-letter-spacing:-1.5px!important}
  .framer-styles-preset-xw6i31{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-xye2wy{--framer-font-size:16px!important;--framer-line-height:24px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-ytbzbj{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
}
@media (min-width: 1280px) and (max-width: 1439.98px) {
  .framer-styles-preset-1348mfd{--framer-font-size:30px!important;--framer-line-height:36px!important;--framer-letter-spacing:-0.9px!important}
  .framer-styles-preset-18d3ldj{--framer-font-size:30px!important;--framer-line-height:39px!important;--framer-letter-spacing:-0.9px!important}
  .framer-styles-preset-1bh90jk{--framer-font-size:14px!important;--framer-line-height:21px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-1ce0wjm{--framer-font-size:30px!important;--framer-line-height:36px!important;--framer-letter-spacing:-0.9px!important}
  .framer-styles-preset-1ewksm3{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-1kzknlp{--framer-font-size:20px!important;--framer-line-height:24px!important;--framer-letter-spacing:-0.6px!important}
  .framer-styles-preset-1lc2aoj{--framer-font-size:12px!important;--framer-line-height:18px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-1neults{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-1q9ekzu{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-1x5b7nf{--framer-font-size:24px!important;--framer-line-height:28.8px!important;--framer-letter-spacing:-0.72px!important}
  .framer-styles-preset-3li09b{--framer-font-size:40px!important;--framer-line-height:48px!important;--framer-letter-spacing:-1.2px!important}
  .framer-styles-preset-gjl7py{--framer-font-size:20px!important;--framer-line-height:24px!important;--framer-letter-spacing:-0.6px!important}
  .framer-styles-preset-l7tzks{--framer-font-size:45px!important;--framer-line-height:54px!important;--framer-letter-spacing:-1.35px!important}
  .framer-styles-preset-md05vo{--framer-font-size:28px!important;--framer-line-height:33.6px!important;--framer-letter-spacing:-0.84px!important}
  .framer-styles-preset-te7ryf{--framer-font-size:18px!important;--framer-line-height:27px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-vkss1u{--framer-font-size:60px!important;--framer-line-height:72px!important;--framer-letter-spacing:-1.8px!important}
  .framer-styles-preset-xw6i31{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
  .framer-styles-preset-xye2wy{--framer-font-size:16px!important;--framer-line-height:24px!important;--framer-letter-spacing:0px!important}
  .framer-styles-preset-ytbzbj{--framer-font-size:22px!important;--framer-line-height:26.4px!important;--framer-letter-spacing:-0.66px!important}
}

/* ---- 992–1199: live renders the desktop layout, Framer the Tablet replica — rebuild the desktop grids ---- */
@media (min-width: 992px) and (max-width: 1199.98px) {
  :is([data-framer-name="tovia-voices-grid"],[data-framer-name^="tovia-voices-grid "]){display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:15px!important;row-gap:15px!important;}
  :is([data-framer-name="tovia-voices-grid"],[data-framer-name^="tovia-voices-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-voices-grid"],[data-framer-name^="tovia-voices-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-departments-grid"],[data-framer-name^="tovia-departments-grid "]){display:grid!important;grid-template-columns:1.15fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:0px!important;row-gap:0px!important;}
  :is([data-framer-name="tovia-departments-grid"],[data-framer-name^="tovia-departments-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-departments-grid"],[data-framer-name^="tovia-departments-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-footer-grid"],[data-framer-name^="tovia-footer-grid "]){display:grid!important;grid-template-columns:1.3fr 1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:40px!important;row-gap:40px!important;}
  :is([data-framer-name="tovia-footer-grid"],[data-framer-name^="tovia-footer-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-footer-grid"],[data-framer-name^="tovia-footer-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-about-flow-body"],[data-framer-name^="tovia-about-flow-body "]){display:grid!important;grid-template-columns:1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:80px!important;row-gap:0px!important;align-items:start!important;}
  :is([data-framer-name="tovia-about-flow-body"],[data-framer-name^="tovia-about-flow-body "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-about-flow-body"],[data-framer-name^="tovia-about-flow-body "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:start}
  :is([data-framer-name="tovia-about-era-list"],[data-framer-name^="tovia-about-era-list "]){display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:30px!important;row-gap:0px!important;}
  :is([data-framer-name="tovia-about-era-list"],[data-framer-name^="tovia-about-era-list "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-about-era-list"],[data-framer-name^="tovia-about-era-list "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-about-say-panel"],[data-framer-name^="tovia-about-say-panel "]){display:grid!important;grid-template-columns:1.12fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:0px!important;row-gap:0px!important;}
  :is([data-framer-name="tovia-about-say-panel"],[data-framer-name^="tovia-about-say-panel "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-about-say-panel"],[data-framer-name^="tovia-about-say-panel "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-services-route-list"],[data-framer-name^="tovia-services-route-list "]){display:grid!important;grid-template-columns:1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:0px!important;row-gap:30px!important;}
  :is([data-framer-name="tovia-services-route-list"],[data-framer-name^="tovia-services-route-list "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-services-route-list"],[data-framer-name^="tovia-services-route-list "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-services-cta-panel"],[data-framer-name^="tovia-services-cta-panel "]){display:grid!important;grid-template-columns:1.05fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:0px!important;row-gap:0px!important;align-items:center!important;}
  :is([data-framer-name="tovia-services-cta-panel"],[data-framer-name^="tovia-services-cta-panel "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-services-cta-panel"],[data-framer-name^="tovia-services-cta-panel "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-depts-route-card"],[data-framer-name^="tovia-depts-route-card "]){display:grid!important;grid-template-columns:1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:60px!important;row-gap:0px!important;align-items:center!important;}
  :is([data-framer-name="tovia-depts-route-card"],[data-framer-name^="tovia-depts-route-card "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-depts-route-card"],[data-framer-name^="tovia-depts-route-card "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-values-shows-grid"],[data-framer-name^="tovia-values-shows-grid "]){display:grid!important;grid-template-columns:1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:15px!important;row-gap:15px!important;}
  :is([data-framer-name="tovia-values-shows-grid"],[data-framer-name^="tovia-values-shows-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-values-shows-grid"],[data-framer-name^="tovia-values-shows-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-pr-when-grid"],[data-framer-name^="tovia-pr-when-grid "]){display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:15px!important;row-gap:15px!important;}
  :is([data-framer-name="tovia-pr-when-grid"],[data-framer-name^="tovia-pr-when-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-pr-when-grid"],[data-framer-name^="tovia-pr-when-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-faq-grid"],[data-framer-name^="tovia-faq-grid "]){display:grid!important;grid-template-columns:.42fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:60px!important;row-gap:40px!important;align-items:start!important;}
  :is([data-framer-name="tovia-faq-grid"],[data-framer-name^="tovia-faq-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-faq-grid"],[data-framer-name^="tovia-faq-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:start}
  :is([data-framer-name="tovia-ask-grid"],[data-framer-name^="tovia-ask-grid "]){display:grid!important;grid-template-columns:1fr .86fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:80px!important;row-gap:40px!important;align-items:center!important;}
  :is([data-framer-name="tovia-ask-grid"],[data-framer-name^="tovia-ask-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-ask-grid"],[data-framer-name^="tovia-ask-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-voice-banner-grid"],[data-framer-name^="tovia-voice-banner-grid "]){display:grid!important;grid-template-columns:1fr .78fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:80px!important;row-gap:40px!important;align-items:center!important;}
  :is([data-framer-name="tovia-voice-banner-grid"],[data-framer-name^="tovia-voice-banner-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-voice-banner-grid"],[data-framer-name^="tovia-voice-banner-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-voice-words-panel-group"],[data-framer-name^="tovia-voice-words-panel-group "]){display:grid!important;grid-template-columns:.52fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:60px!important;row-gap:24px!important;}
  :is([data-framer-name="tovia-voice-words-panel-group"],[data-framer-name^="tovia-voice-words-panel-group "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-voice-words-panel-group"],[data-framer-name^="tovia-voice-words-panel-group "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-ct-ways-grid"],[data-framer-name^="tovia-ct-ways-grid "]){display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:20px!important;row-gap:20px!important;}
  :is([data-framer-name="tovia-ct-ways-grid"],[data-framer-name^="tovia-ct-ways-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-ct-ways-grid"],[data-framer-name^="tovia-ct-ways-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-team-quotes-grid"],[data-framer-name^="tovia-team-quotes-grid "]){display:grid!important;grid-template-columns:1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:0px!important;row-gap:0px!important;}
  :is([data-framer-name="tovia-team-quotes-grid"],[data-framer-name^="tovia-team-quotes-grid "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-team-quotes-grid"],[data-framer-name^="tovia-team-quotes-grid "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-bl-banner-inner"],[data-framer-name^="tovia-bl-banner-inner "]){display:grid!important;grid-template-columns:.72fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:60px!important;row-gap:60px!important;align-items:center!important;}
  :is([data-framer-name="tovia-bl-banner-inner"],[data-framer-name^="tovia-bl-banner-inner "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-bl-banner-inner"],[data-framer-name^="tovia-bl-banner-inner "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-bl-grid-list"],[data-framer-name^="tovia-bl-grid-list "]){display:grid!important;grid-template-columns:1fr 1fr 1fr!important;grid-auto-rows:auto!important;grid-template-rows:none!important;height:auto!important;column-gap:20px!important;row-gap:40px!important;}
  :is([data-framer-name="tovia-bl-grid-list"],[data-framer-name^="tovia-bl-grid-list "]) > :not(.ssr-variant):not([data-framer-name*="weave"]):not([data-framer-name*="rule"]), :is([data-framer-name="tovia-bl-grid-list"],[data-framer-name^="tovia-bl-grid-list "]) > .ssr-variant > *{width:100%!important;min-width:0!important;grid-column:auto!important;justify-self:stretch!important;align-self:auto}
  :is([data-framer-name="tovia-faq-nav"],[data-framer-name^="tovia-faq-nav "]){flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:0px!important}
  :is([data-framer-name="tovia-faq-nav"],[data-framer-name^="tovia-faq-nav "]) > *, :is([data-framer-name="tovia-faq-nav"],[data-framer-name^="tovia-faq-nav "]) > .ssr-variant > *{width:100%!important;justify-content:space-between!important}
  [data-framer-name="tovia-voice-words-quote"]:has(> [data-framer-name="tovia-voice-words-shot"]){display:grid!important;grid-template-columns:.62fr 1fr!important;height:auto!important}
  [data-framer-name="tovia-voice-words-quote"] > :is([data-framer-name="tovia-voice-words-shot"],[data-framer-name="tovia-voice-words-body"]){width:100%!important;height:auto!important;min-height:100%;align-self:stretch!important}
}

@media (min-width: 992px) {
  [data-framer-name="tovia-about-flow-scene"] { position: sticky !important; top: 120px !important; align-self: start !important; }
  :is([data-framer-name^="tovia-sd-body-aside"], [data-framer-name^="tovia-pe-body-rail"]) { position: sticky !important; top: 100px !important; align-self: flex-start !important; }
  [data-framer-name^="tovia-po-body-rail"] { position: sticky !important; top: 110px !important; align-self: flex-start !important; }
}
`

// runs inline right after the page markup: marks the first-screen units so they animate from the first paint
const EARLY = `(function(){try{
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var vh=innerHeight,sec=document.querySelector('section');if(!sec)return;
var u=[].slice.call(sec.querySelectorAll('${UNIT_SEL.replace(/'/g, "\\'")}')).filter(function(e){
 if(e.closest('[data-tv-in]'))return false;var p=e.parentElement&&e.parentElement.closest('${UNIT_SEL.replace(/'/g, "\\'")}');if(p)return false;
 var r=e.getBoundingClientRect();return r.height>0&&r.top<vh*.92;});
var st=Math.min(${RV.stagger},0.5/Math.max(1,u.length));u.forEach(function(e,i){e.setAttribute('data-tv-in','');e.style.animationDelay=(${RV.loadDelay}+i*st)+'s';});
window.__tvEarly=u.length;}catch(e){}})();`

let booted = false
let lenis: any = null
const RM = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

// ---------------------------------------------------------------- helpers
const nm = (e: Element | null) => (e && e.getAttribute("data-framer-name")) || ""
const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
// children with Framer's display:contents breakpoint wrappers flattened
function kids(el: Element): HTMLElement[] {
    const out: HTMLElement[] = []
    const add = (e: Element) => { for (const c of Array.from(e.children)) { if (getComputedStyle(c).display === "contents") add(c); else out.push(c as HTMLElement) } }
    add(el)
    return out
}
// top-level matches only (a component wrapper and its variant root often share the name)
function tops(root: ParentNode, sel: string): HTMLElement[] {
    const all = Array.from(root.querySelectorAll(sel)) as HTMLElement[]
    return all.filter((e) => !all.some((o) => o !== e && o.contains(e)))
}
const texts = (el: Element) => Array.from(el.querySelectorAll(".framer-text")) as HTMLElement[]
const base = (e: Element) => nm(e).split(" ")[0]
// nearest ancestor (or self) whose layer name matches
function up(t: Element | null, re: RegExp): HTMLElement | null {
    for (let e = t; e && e !== document.body; e = e.parentElement) if (re.test(nm(e))) return e as HTMLElement
    return null
}

// one state (on / off) of a tab-like element: its own fill, its texts' colours and every named part's fill/opacity
type Skin = { bg: string; bc: string; txt: string[]; parts: Record<string, { bg: string; op: string; bc: string }> }
function readSkin(el: HTMLElement): Skin {
    const cs = getComputedStyle(el)
    const parts: Skin["parts"] = {}
    el.querySelectorAll("[data-framer-name]").forEach((d) => { const c = getComputedStyle(d); const k = base(d); if (!parts[k]) parts[k] = { bg: c.backgroundColor, op: c.opacity, bc: c.borderColor } })
    return { bg: cs.backgroundColor, bc: cs.borderColor, txt: texts(el).map((t) => getComputedStyle(t).color), parts }
}
const T = `background-color .35s ${EASE_CSS}, color .35s ${EASE_CSS}, opacity .35s ${EASE_CSS}, border-color .35s ${EASE_CSS}`
function paintSkin(el: HTMLElement, s: Skin) {
    el.style.transition = T
    el.style.backgroundColor = s.bg
    texts(el).forEach((t, j) => { t.style.transition = T; t.style.color = s.txt[j] || s.txt[0] || ""; t.style.setProperty("--framer-text-color", t.style.color) })
    el.querySelectorAll("[data-framer-name]").forEach((d) => {
        const p = s.parts[base(d)]; if (!p) return
        const h = d as HTMLElement; h.style.transition = T; h.style.backgroundColor = p.bg; h.style.opacity = p.op
    })
}
const isOn = (e: Element) => /(-on\b|is-on|w--current|tab-active|mark-active|chip-active|\bshown\b|\bopen\b)/.test(nm(e) + " " + Array.from(e.querySelectorAll("[data-framer-name]")).slice(0, 3).map(nm).join(" "))
// a group of tabs: remember the on/off looks once, then paint the chosen index
const skins = new WeakMap<Element, { on: Skin; off: Skin }>()
function paintGroup(group: Element, items: HTMLElement[], index: number) {
    let s = skins.get(group)
    if (!s) {
        const onI = Math.max(0, items.findIndex(isOn))
        const offI = items.findIndex((e, i) => i !== onI)
        if (offI < 0) return
        s = { on: readSkin(items[onI]), off: readSkin(items[offI]) }
        skins.set(group, s)
    }
    items.forEach((it, i) => paintSkin(it, i === index ? s!.on : s!.off))
}
// panes stacked in one box: the active one is in flow, the rest absolute and transparent
function showPane(panes: HTMLElement[], index: number, dur = 0.4) {
    panes.forEach((p, i) => {
        if (i === index) {
            Object.assign(p.style, { position: "relative", top: "0px", left: "0px", right: "auto", width: "100%", pointerEvents: "", zIndex: "1", visibility: "visible", display: "" })
            gsap.fromTo(p, { opacity: 0 }, { opacity: 1, duration: RM() ? 0 : dur, ease: RV.ease, overwrite: true })
        } else {
            Object.assign(p.style, { position: "absolute", top: "0px", left: "0px", right: "auto", width: "100%", pointerEvents: "none", zIndex: "0" })
            gsap.to(p, { opacity: 0, duration: RM() ? 0 : 0.12, ease: RV.ease, overwrite: true })
        }
    })
    ScrollTrigger.refresh()
}
// height 0 <-> content, then auto
function setOpen(el: HTMLElement, open: boolean, dur = 0.4) {
    const from = el.getBoundingClientRect().height
    el.style.overflow = "clip"
    if (open) {
        el.style.height = "auto"; el.style.display = ""; el.style.visibility = "visible"
        const to = el.scrollHeight || el.getBoundingClientRect().height
        gsap.fromTo(el, { height: from }, { height: to, duration: RM() ? 0 : dur, ease: RV.ease, overwrite: true, onComplete: () => { el.style.height = "auto"; ScrollTrigger.refresh() } })
    } else {
        gsap.fromTo(el, { height: from }, { height: 0, duration: RM() ? 0 : dur, ease: RV.ease, overwrite: true, onComplete: () => ScrollTrigger.refresh() })
    }
}

// ---------------------------------------------------------------- sliders (Webflow w-slider: arrows + swipe)
const slideState = new WeakMap<Element, { i: number; x: number }>()
function maskFor(from: Element): HTMLElement | null {
    let el: Element | null = from.parentElement
    while (el && el !== document.body) {
        const m = el.querySelector('[data-framer-name*="-mask"]')
        if (m) return m as HTMLElement
        el = el.parentElement
    }
    return null
}
function slide(mask: HTMLElement, dir: number) {
    const slides = kids(mask).filter(vis)
    if (slides.length < 2) return
    const st = slideState.get(mask) || { i: 0, x: 0 }
    const w0 = slides[0].offsetWidth
    const step = slides[1].offsetLeft - slides[0].offsetLeft || w0
    const last = slides[slides.length - 1]
    const maxX = Math.max(0, last.offsetLeft + last.offsetWidth - slides[0].offsetLeft - mask.clientWidth + 1)
    const name = nm(mask)
    const loop = /about-say/.test(name) // full-width quote slider loops
    const page = /services/.test(name) // services: step by every whole card in view
    const per = page ? Math.max(1, Math.floor((mask.clientWidth + (step - w0)) / step)) : 1
    const maxI = loop ? slides.length - 1 : Math.ceil(maxX / step - 0.01)
    let i = st.i + dir * per
    if (loop) i = (i + slides.length) % slides.length
    else i = Math.max(0, Math.min(maxI, i))
    const x = loop ? i * step : Math.min(maxX, i * step)
    slideState.set(mask, { i, x })
    gsap.to(slides, { x: -x, duration: RM() ? 0 : 0.5, ease: RV.ease, overwrite: "auto" })
}
function resetSliders() {
    document.querySelectorAll('[data-framer-name*="-mask"]').forEach((m) => {
        if (!slideState.has(m)) return
        slideState.delete(m)
        gsap.set(kids(m), { x: 0 })
    })
}

// ---------------------------------------------------------------- click / swipe handlers (installed once)
function onClick(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (!t || !t.closest) return
    // a swipe is not a click on the card under it
    if (Date.now() - swiped < 350 && t.closest('[data-framer-name*="w-slider-mask"]')) { e.preventDefault(); e.stopPropagation(); return }
    // slider arrows
    const arrow = t.closest('[data-framer-name*="w-slider-arrow-"], [data-framer-name*="-arrow prev"], [data-framer-name*="-arrow next"]') as HTMLElement | null
    if (arrow) {
        const mask = maskFor(arrow)
        if (mask) { e.preventDefault(); slide(mask, /prev|arrow-left/.test(nm(arrow)) ? -1 : 1); return }
    }
    // voice cards: the background video plays / pauses, the glyph follows
    const play = t.closest(P("tovia-voices-play")) as HTMLElement | null
    if (play) {
        const card = (play.closest("article") || play.parentElement) as HTMLElement
        const v = card && (card.querySelector("video") as HTMLVideoElement | null)
        if (v) {
            e.preventDefault()
            if (v.paused) { v.muted = true; v.loop = true; v.play().catch(() => {}) } else v.pause()
            glyph(card, !v.paused)
            v.onplay = () => glyph(card, true); v.onpause = () => glyph(card, false)
        }
        return
    }
    // departments: route tabs
    const rtab = up(t, /^tovia-depts-route-tab( |$)/)
    if (rtab) {
        e.preventDefault()
        const wrap = rtab.closest(P("tovia-depts-route-tabs-wrap")) || document
        const tabs = tops(wrap, P("tovia-depts-route-tab ")).filter((x) => /^tovia-depts-route-tab( |$)/.test(nm(x)))
        const box = wrap.querySelector(P("tovia-depts-route-tabs-content"))
        const panes = box ? kids(box).filter((p) => /^tovia-depts-route-pane/.test(nm(p))) : []
        const i = tabs.indexOf(rtab)
        if (i >= 0) { paintGroup(tabs[0].parentElement || wrap as Element, tabs, i); if (panes[i]) showPane(panes, i, 0.4) }
        return
    }
    // testimonials: voice tabs <-> quote deck
    const vtab = up(t, /^tovia-voice-words-tab( |$)/)
    if (vtab) {
        const list = vtab.closest(N("tovia-voice-words-tabs"))
        if (list) {
            const items = kids(list)
            const item = items.find((x) => x.contains(vtab))
            const i = item ? items.indexOf(item) : -1
            const skinsOf = items.map((x) => (x.querySelector("button") as HTMLElement) || x)
            const deck = document.querySelector(N("tovia-voice-words-deck"))
            const quotes = deck ? kids(deck).filter((q) => /tovia-voice-words-quote/.test(nm(q))) : []
            if (i >= 0) { paintGroup(list, skinsOf, i); if (quotes[i]) showPane(quotes, i, 0.3) }
        }
        return
    }
    // FAQ page accordion
    const sum = t.closest(N("tovia-faq-sum")) as HTMLElement | null
    if (sum) {
        e.preventDefault()
        const item = sum.parentElement as HTMLElement
        const inner = item.querySelector(N("tovia-faq-panel-inner")) as HTMLElement | null
        const panel = item.querySelector(N("tovia-faq-panel")) as HTMLElement | null
        const chev = item.querySelector(N("tovia-faq-chev")) as HTMLElement | null
        const open = item.getAttribute("data-tv-open") !== "1"
        item.setAttribute("data-tv-open", open ? "1" : "0")
        if (panel) panel.style.height = "auto"
        if (inner) setOpen(inner, open, 0.4)
        if (chev) gsap.to(chev, { rotation: open ? 180 : 0, duration: RM() ? 0 : 0.25, ease: RV.ease, overwrite: true })
        return
    }
    // About FAQ accordion (first one open)
    const q = t.closest(P("tovia-about-ask-question")) as HTMLElement | null
    if (q) {
        e.preventDefault()
        const item = q.parentElement as HTMLElement
        const panel = item.querySelector(P("tovia-about-ask-panel")) as HTMLElement | null
        const cross = item.querySelector(P("tovia-about-ask-sign-bar-cross")) as HTMLElement | null
        const was = item.hasAttribute("data-tv-open") ? item.getAttribute("data-tv-open") === "1" : !!panel && panel.getBoundingClientRect().height > 1
        const open = !was
        item.setAttribute("data-tv-open", open ? "1" : "0")
        if (panel) setOpen(panel, open, 0.4)
        if (cross) gsap.to(cross, { opacity: open ? 0 : 1, rotation: open ? 0 : 90, duration: RM() ? 0 : 0.2, ease: RV.ease, overwrite: true })
        return
    }
    // About flow: a click on a step jumps to it (the stepper itself follows the scroll)
    const step = up(t, /^tovia-about-flow-step( |$)/)
    if (step) { flowPaint(flowSteps().indexOf(step)); flowLock = Date.now() + 900; return }
    // Pricing compare tabs (phone): one tier column at a time
    const ptab = up(t, /^tovia-pr-cmp-tab( |$)/)
    if (ptab) {
        const list = ptab.parentElement as HTMLElement
        const tabs = kids(list).filter((x) => /^tovia-pr-cmp-tab( |$)/.test(nm(x)))
        const i = tabs.indexOf(ptab)
        if (i < 0) return
        paintGroup(list, tabs, i)
        const pill = list.querySelector(P("tovia-pr-cmp-tab-pill")) as HTMLElement | null
        if (pill) gsap.to(pill, { y: tabs[i].offsetTop - tabs[0].offsetTop, duration: RM() ? 0 : 0.3, ease: RV.ease, overwrite: true })
        document.querySelectorAll(N("tovia-pr-cmp-grid-group")).forEach((g) => {
            const cells = kids(g).filter((c) => /tovia-pr-cmp-cell/.test(nm(c)))
            if (cells.length > 1) cells.forEach((c, k) => { c.style.display = k === i ? "" : "none" })
        })
        return
    }
    // same-page anchors (FAQ nav, "#…" links): scroll through Lenis, clear of the fixed header
    const a = t.closest("a[href*='#']") as HTMLAnchorElement | null
    if (a) {
        const u = new URL(a.href, location.href)
        if (u.pathname === location.pathname && u.hash.length > 1) {
            const target = document.getElementById(decodeURIComponent(u.hash.slice(1)))
            if (target) {
                e.preventDefault(); e.stopPropagation()
                if (lenis) lenis.scrollTo(target, { offset: -120, duration: 1.05 })
                else window.scrollTo({ top: target.getBoundingClientRect().top + scrollY - 120, behavior: "smooth" })
                history.replaceState(null, "", u.hash)
            }
        }
    }
}
function glyph(card: Element, playing: boolean) {
    card.querySelectorAll(P("tovia-voices-play-glyph")).forEach((g) => {
        const isPause = /\bpause\b/.test(nm(g))
        ;(g as HTMLElement).style.opacity = (isPause ? playing : !playing) ? "1" : "0"
    })
}
let sw: { x: number; y: number; m: HTMLElement } | null = null
let swiped = 0
function onDown(e: PointerEvent) {
    const m = (e.target as HTMLElement)?.closest?.('[data-framer-name*="w-slider-mask"]') as HTMLElement | null
    sw = m ? { x: e.clientX, y: e.clientY, m } : null
}
function onUp(e: PointerEvent) {
    if (!sw) return
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { slide(sw.m, dx < 0 ? 1 : -1); swiped = Date.now() }
    sw = null
}

// ---------------------------------------------------------------- scroll-driven scenes (read the DOM every frame)
let railActive = -1
let railTo: any = null
let railTrack: Element | null = null
function rail() {
    const stage = document.querySelector('[data-framer-name="tovia-services-stage"]') as HTMLElement | null
    const track = document.querySelector(N("tovia-services-names-track")) as HTMLElement | null
    if (!stage || !track || !vis(track)) { railActive = -1; return }
    const names = Array.from(track.querySelectorAll(P("tovia-services-name"))).filter((e) => /^tovia-services-name c\d/.test(nm(e))) as HTMLElement[]
    if (names.length < 2) return
    if (track !== railTrack) { railTrack = track; railActive = -1; railTo = gsap.quickTo(track, "y", { duration: RM() ? 0.01 : 0.6, ease: "power3" }) }
    const stepH = names[1].offsetTop - names[0].offsetTop
    const r = stage.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, -r.top / Math.max(1, stage.offsetHeight - innerHeight)))
    // live: the track runs on a power2.out curve over the pinned scroll (−396px at 1440, switches at p .29/.51/.80)
    const y = -stepH * (names.length - 1) * (1 - (1 - p) * (1 - p))
    railTo(y)
    const index = Math.max(0, Math.min(names.length - 1, Math.round(-y / stepH)))
    if (index === railActive) return
    const instant = railActive < 0
    railActive = index
    const k = instant || RM() ? 0 : 1
    const shots = tops(document, P("tovia-services-shot c")).filter((e) => /^tovia-services-shot c\d/.test(nm(e)))
    const notes = tops(document, P("tovia-services-note c")).filter((e) => /^tovia-services-note c\d/.test(nm(e)))
    names.forEach((el, n) => {
        const c = n === index ? INK : INK46
        texts(el).forEach((t) => { t.style.transition = `color ${0.8 * k}s ${EASE_CSS}`; t.style.color = c; t.style.setProperty("--framer-text-color", c) })
    })
    shots.forEach((el, n) => gsap.to(el, { opacity: n <= index ? 1 : 0, duration: 0.9 * k, ease: "expo.out", overwrite: true }))
    notes.forEach((el, n) => gsap.to(el, { opacity: n === index ? 1 : 0, duration: 0.8 * k, ease: RV.ease, overwrite: true }))
}
let flowLock = 0
let flowActive = -1
const flowSteps = () => tops(document, P("tovia-about-flow-step")).filter((e) => /^tovia-about-flow-step( |$)/.test(nm(e)) && vis(e))
function flowPaint(i: number) {
    const steps = flowSteps()
    if (i < 0 || !steps.length || i === flowActive) return
    flowActive = i
    paintGroup(steps[0].parentElement as Element, steps, i)
    const isos = tops(document, P("tovia-about-flow-iso"))
    isos.forEach((e, n) => { e.style.transition = `opacity .35s ${EASE_CSS}`; e.style.opacity = n === i ? "1" : "0" })
}
function flow() {
    if (Date.now() < flowLock) return
    const steps = flowSteps()
    if (steps.length < 2) return
    const line = innerHeight * 0.44
    let i = 0
    steps.forEach((s, n) => { if (s.getBoundingClientRect().top <= line) i = n })
    flowPaint(i)
}
let spyActive = -1
function faqSpy() {
    const nav = document.querySelector(N("tovia-faq-nav"))
    if (!nav || !vis(nav)) return
    const items = kids(nav).filter((e) => /^tovia-faq-nav-item/.test(nm(e)))
    const groups = items.map((a) => { const h = (a.getAttribute("href") || "").split("#")[1]; return h ? document.getElementById(h) : null })
    let i = 0
    groups.forEach((g, n) => { if (g && g.getBoundingClientRect().top <= innerHeight * 0.4) i = n })
    if (i === spyActive) return
    spyActive = i
    paintGroup(nav, items, i)
}
let frame = 0
function onScroll() {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; try { rail(); flow(); faqSpy() } catch (e) {} })
}

if (typeof window !== "undefined" && !(window as any).__tvUI) {
    ;(window as any).__tvUI = 1
    window.addEventListener("click", onClick, true)
    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    let rw = innerWidth
    window.addEventListener("resize", () => { if (innerWidth !== rw) { rw = innerWidth; resetSliders(); railActive = -1; flowActive = -1; spyActive = -1 } onScroll() })
}

function boot() {
    if (booted) return
    booted = true
    gsap.registerPlugin(ScrollTrigger)
    const reduce = RM()
    railActive = -1; railTrack = null; flowActive = -1; spyActive = -1
    // smooth scroll
    if (!reduce && !lenis) {
        lenis = new Lenis({ duration: 1.05, easing: (x: number) => Math.min(1, 1.001 - Math.pow(2, -10 * x)), smoothWheel: true })
        lenis.on("scroll", ScrollTrigger.update)
        lenis.on("scroll", onScroll)
        gsap.ticker.add((t: number) => lenis && lenis.raf(t * 1000))
        gsap.ticker.lagSmoothing(0)
    }
    onScroll()
    // about FAQ: the first item starts open (live), the rest closed
    tops(document, P("tovia-about-ask-item")).forEach((it, n) => { if (!it.hasAttribute("data-tv-open")) it.setAttribute("data-tv-open", n === 0 ? "1" : "0") })
    if (reduce) return
    const vh = innerHeight
    // ---- reveals below the fold: the same move as the load cascade ----
    const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[]
    const seen = new Set<Element>()
    for (const sec of sections) {
        if (seen.has(sec) || sec.closest("header")) continue
        seen.add(sec)
        const box = (sec.querySelector('[data-framer-name*="container"], [data-framer-name*="-inner"], [data-framer-name*="-panel"], [data-framer-name*="-wrap"]') as HTMLElement) || sec
        const ks = (Array.from(box.children) as HTMLElement[]).flatMap((c) => (getComputedStyle(c).display === "contents" ? kids(c) : [c]))
            .filter((el) => !/wash|weave|rule|frame|-bg|background layer|-media|grade|scrim/.test(nm(el)) && el.getBoundingClientRect().height > 0)
        const out: HTMLElement[] = []
        ks.forEach((el) => {
            const ch = kids(el).filter((c) => c.getBoundingClientRect().height > 0)
            if (el.getBoundingClientRect().height > vh * 0.8 && ch.length > 1) out.push(el, ...ch)
            else out.push(el)
        })
        for (const el of out) {
            if (el.closest("[data-tv-in]") || el.querySelector("[data-tv-in]")) continue
            if (el.matches(P("tovia-services-stage")) || el.querySelector(P("tovia-services-pin"))) continue // sticky stage: never transform it
            const top = el.getBoundingClientRect().top
            if (top < vh * 0.92) continue // already on screen: the load cascade owns it
            gsap.from(el, { opacity: 0, y: RV.y, duration: RV.duration, ease: RV.ease, delay: RV.scrollDelay, clearProps: "opacity,transform", scrollTrigger: { trigger: el, start: RV.start, once: true } })
        }
    }
    // ---- scenes ----
    const hero = document.querySelector('[data-framer-name="section hero"]') as HTMLElement | null
    const media = document.querySelector(P("tovia-hero-media")) as HTMLElement | null
    if (hero && media) gsap.to(media, { y: () => hero.offsetHeight * 0.32, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6, invalidateOnRefresh: true } })
    const records = document.querySelector('[data-framer-name="section records"]') as HTMLElement | null
    const wash = document.querySelector(N("tovia-records-wash")) as HTMLElement | null
    if (records && wash) gsap.fromTo(wash, { y: -65 }, { y: 65, ease: "none", scrollTrigger: { trigger: records, start: "top bottom", end: "bottom top", scrub: 0.8 } })
    const weave = document.querySelector(P("tovia-departments-weave")) as HTMLElement | null
    if (weave) gsap.to(weave, { x: 20, duration: 5, ease: "none", repeat: -1 })
    // values: the record bars grow from the floor, one after another
    const bars = tops(document, P("tovia-values-record-bar")).filter((b) => /^tovia-values-record-bar( |$)/.test(nm(b)))
    if (bars.length) {
        gsap.set(bars, { scaleY: 0, transformOrigin: "50% 100%" })
        ScrollTrigger.create({ trigger: bars[0].parentElement || bars[0], start: RV.start, once: true, onEnter: () => gsap.to(bars, { scaleY: 1, duration: 0.6, ease: "power2.out", stagger: 0.07, delay: RV.scrollDelay }) })
    }
    const refresh = () => { ScrollTrigger.refresh(); onScroll() }
    setTimeout(refresh, 600); setTimeout(refresh, 1800)
    if ((document as any).fonts?.ready) (document as any).fonts.ready.then(refresh)
}

// Lenis keeps forcing the old scrollY after Framer swaps the page: destroy it on internal navigation
if (typeof window !== "undefined" && !(window as any).__tvNav) {
    ;(window as any).__tvNav = 1
    try { history.scrollRestoration = "manual" } catch (e) {}
    window.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null
        if (!a || a.target === "_blank") return
        const u = new URL(a.href, location.href)
        if (u.origin !== location.origin || u.pathname === location.pathname) return
        const from = location.pathname
        const t0 = Date.now()
        const iv = setInterval(() => {
            if (location.pathname !== from) {
                clearInterval(iv)
                if (lenis) { lenis.destroy(); lenis = null }
                ScrollTrigger.getAll().forEach((s: any) => s.kill())
                booted = false
                window.scrollTo(0, 0)
                setTimeout(() => window.scrollTo(0, 0), 60)
            } else if (Date.now() - t0 > 4000) clearInterval(iv)
        }, 50)
    }, true)
}

export function withToviaMotion(Component: any): ComponentType {
    return (props: any) => {
        const canvas = RenderTarget.current() === RenderTarget.canvas
        React.useEffect(() => {
            if (canvas) return
            if (!location.hash) window.scrollTo(0, 0)
            // boot after hydration: wait until React stops swapping the SSR breakpoint copies
            let t: any, done = false
            const go = () => { if (done) return; done = true; obs.disconnect(); clearTimeout(t); clearTimeout(hard); boot() }
            const obs = new MutationObserver((ms) => {
                if (ms.some((m) => Array.from(m.removedNodes).some((n: any) => n.nodeType === 1 && (n.classList?.contains("ssr-variant") || n.querySelector?.(".ssr-variant"))))) { clearTimeout(t); t = setTimeout(go, 200) }
            })
            obs.observe(document.body, { childList: true, subtree: true })
            t = setTimeout(go, 400)
            const hard = setTimeout(go, 1500)
            return () => { obs.disconnect(); clearTimeout(t); clearTimeout(hard) }
        }, [])
        if (canvas) return <Component {...props} />
        return (
            <>
                <style dangerouslySetInnerHTML={{ __html: CSS }} />
                <Component {...props} />
                <script dangerouslySetInnerHTML={{ __html: EARLY }} />
            </>
        )
    }
}

// Header ink (cv-gsap SEC.header): over a light section, or once scrolled over one, the desktop bar switches to its
// light variant. The section under the bar's mid-line decides. Live shows the desktop bar from 992px, so the
// Tablet replica (810–1199) also gets the Desktop variants at ≥992; below that the instance keeps its Mobile variant.
function isLight(el: Element) {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
    if (!c || (c.length > 3 && parseFloat(c[3]) < 0.5)) return false
    return (0.2126 * +c[0] + 0.7152 * +c[1] + 0.0722 * +c[2]) / 255 > 0.5
}
function lightUnder(y: number) {
    // the first layer under the bar's mid-line that paints decides: a photo / video means a dark scene,
    // an opaque colour decides by luminance; reaching the section with nothing painted = the white page ground
    const els = document.elementsFromPoint(innerWidth / 2, y)
    for (const el of els) {
        if (el.closest("header")) continue
        if (el.tagName === "VIDEO" || el.tagName === "IMG") return false
        const cs = getComputedStyle(el)
        if (cs.backgroundImage && cs.backgroundImage !== "none" && !/repeating-linear/.test(cs.backgroundImage)) return false
        if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) return isLight(el)
        if (el.tagName === "SECTION" || el.tagName === "FOOTER") return true
    }
    return true
}
export function withHeaderInk(Component: any): ComponentType {
    return (props: any) => {
        const [light, setLight] = React.useState(false)
        const [desk, setDesk] = React.useState(false)
        React.useEffect(() => {
            if (RenderTarget.current() === RenderTarget.canvas) return
            let frame = 0
            const paint = () => { frame = 0; setDesk(innerWidth >= 992); setLight(lightUnder(30)) }
            const on = () => { if (!frame) frame = requestAnimationFrame(paint) }
            paint()
            addEventListener("scroll", on, { passive: true }); addEventListener("resize", on)
            const iv = setInterval(on, 500) // page swaps without a scroll event
            return () => { removeEventListener("scroll", on); removeEventListener("resize", on); clearInterval(iv) }
        }, [])
        if (!desk) return <Component {...props} />
        return <Component {...props} variant={light ? "Desktop Light" : "Desktop"} />
    }
}
