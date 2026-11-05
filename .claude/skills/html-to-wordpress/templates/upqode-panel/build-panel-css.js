// Regenerates assets/upqode-panel/panel.css (in the template, or in a theme it was installed into).
// Usage: node build-panel-css.js [themeDir]   (default: this folder)
//
// Seven screens x sixty properties is four hundred and twenty rules in a fixed order, and
// the order IS the cascade — which is why they are generated and not typed. Add a property
// to `kinds` below and every screen gets it, in the right query, in the right place.
const fs = require('fs');
const path = require('path');
const out = path.join(process.argv[2] || __dirname, 'assets/upqode-panel/panel.css');

const bands = [
  ['base', '', '992–1279px, and every screen that says nothing of its own'],
  ['1280', '(min-width: 1280px)', '1280–1439px, and wider unless a wider screen says otherwise'],
  ['1440', '(min-width: 1440px)', '1440–1919px, and wider unless 1920 says otherwise'],
  ['1920', '(min-width: 1920px)', '1920px and wider'],
  ['991', '(max-width: 991px)', '768–991px, and narrower unless a narrower screen says otherwise'],
  ['767', '(max-width: 767px)', '568–767px, and narrower unless 567 says otherwise'],
  ['567', '(max-width: 567px)', '360–567px'],
];
const windows = [
  ['1920', '(min-width: 1920px)'],
  ['1440', '(min-width: 1440px) and (max-width: 1919px)'],
  ['1280', '(min-width: 1280px) and (max-width: 1439px)'],
  ['base', '(min-width: 992px) and (max-width: 1279px)'],
  ['991', '(min-width: 768px) and (max-width: 991px)'],
  ['767', '(min-width: 568px) and (max-width: 767px)'],
  ['567', '(max-width: 567px)'],
];

// kind, property, shape.
//
//   plain    the ordinary one — the attribute, the property, !important
//   doubled  the attribute written twice, for weight. Only the two margins core also
//            writes as `margin-right: auto` on a constrained child, which ties otherwise
//   gap      sets core's block-gap token as well, or a flex container ignores it
//   cols     a count, not a track list: `repeat(<count>, <track or 1fr>)`
//   border   a button's and an image's border belongs to the inner element, not the wrapper
//   crop     object-position reaches the img or video inside as well
//   fit      object-fit needs the inner element sized before it has anything to fit
//
// The order below is the order they come out in. Keep like with like: it is read.
const kinds = [
  ['w', 'width', 'plain'], ['minw', 'min-width', 'plain'], ['maxw', 'max-width', 'plain'],
  ['h', 'height', 'plain'], ['minh', 'min-height', 'plain'], ['maxh', 'max-height', 'plain'],
  ['ar', 'aspect-ratio', 'plain'],
  ['pt', 'padding-top', 'plain'], ['pr', 'padding-right', 'plain'],
  ['pb', 'padding-bottom', 'plain'], ['pl', 'padding-left', 'plain'],
  ['mt', 'margin-top', 'plain'], ['mr', 'margin-right', 'doubled'],
  ['mb', 'margin-bottom', 'plain'], ['ml', 'margin-left', 'doubled'],
  ['gap', 'gap', 'gap'], ['rgap', 'row-gap', 'plain'], ['cgap', 'column-gap', 'plain'],
  ['colw', 'column-width', 'plain'],
  ['grow', 'flex-grow', 'plain'], ['shrink', 'flex-shrink', 'plain'],
  ['basis', 'flex-basis', 'plain'], ['order', 'order', 'plain'],
  ['aself', 'align-self', 'plain'], ['over', 'overflow', 'plain'],
  ['disp', 'display', 'plain'], ['twrap', 'text-wrap', 'plain'],
  ['cols', 'grid-template-columns', 'cols'], ['gcol', 'grid-column', 'plain'],
  ['top', 'top', 'plain'], ['pos', 'position', 'plain'], ['right', 'right', 'plain'],
  ['bottom', 'bottom', 'plain'], ['left', 'left', 'plain'], ['z', 'z-index', 'plain'],
  ['op', 'opacity', 'plain'],
  ['btw', 'border-top-width', 'border'], ['brw', 'border-right-width', 'border'],
  ['bbw', 'border-bottom-width', 'border'], ['blw', 'border-left-width', 'border'],
  ['btc', 'border-top-color', 'border'], ['brc', 'border-right-color', 'border'],
  ['bbc', 'border-bottom-color', 'border'], ['blc', 'border-left-color', 'border'],
  ['bts', 'border-top-style', 'border'], ['brs', 'border-right-style', 'border'],
  ['bbs', 'border-bottom-style', 'border'], ['bls', 'border-left-style', 'border'],
  ['rtl', 'border-top-left-radius', 'border'], ['rtr', 'border-top-right-radius', 'border'],
  ['rbr', 'border-bottom-right-radius', 'border'], ['rbl', 'border-bottom-left-radius', 'border'],
  ['dir', 'flex-direction', 'plain'], ['just', 'justify-content', 'plain'],
  ['align', 'align-items', 'plain'], ['wrap', 'flex-wrap', 'plain'],
  ['talign', 'text-align', 'plain'], ['fs', 'font-size', 'plain'],
  ['crop', 'object-position', 'crop'], ['fit', 'object-fit', 'fit'],
];

function rules(kind, prop, shape, band) {
  const a = `[style*="--xxp-${kind}-${band}:"]`;
  const v = `var(--xxp-${kind}-${band})`;

  switch (shape) {
    case 'doubled':
      return [`${a}${a} { ${prop}: ${v} !important; }`];

    case 'gap':
      return [`${a} { --wp--style--block-gap: ${v} !important; gap: ${v} !important; }`];

    case 'cols':
      return [`${a} { ${prop}: repeat(${v}, var(--xxp-ctrack-${band}, minmax(0, 1fr))) !important; }`];

    case 'border':
      return [
        `${a}:not(.wp-block-button):not(.wp-block-image) { ${prop}: ${v} !important; }`,
        `${a}.wp-block-button > .wp-block-button__link, ${a}.wp-block-image > img, ${a}.wp-block-image > a > img { ${prop}: ${v} !important; }`,
      ];

    case 'crop':
      return [`${a}, ${a} img, ${a} video { ${prop}: ${v} !important; }`];

    case 'fit':
      return [
        `${a} { ${prop}: ${v} !important; }`,
        `${a} :is(img, video) { ${prop}: ${v} !important; width: 100% !important; height: 100% !important; }`,
      ];

    default:
      return [`${a} { ${prop}: ${v} !important; }`];
  }
}

let css = `/**
 * The UPQODE panel — what the panel's settings turn into, on the page and in
 * the editor canvas. Generated; edit the generator, not the band rules.
 *
 * A block given a value carries it as a custom property in its own style
 * attribute — \`--xxp-pt-991: 24px\` — and the rules below turn each one into its
 * property inside the right query. The selector asks whether the property is
 * written, which keeps the rules off every block that was given nothing. The
 * trailing colon makes the match exact: \`--xxp-w-base:\` is not inside
 * \`--xxp-minw-base:\`.
 *
 * **The order below is the behaviour.** The middle screen has no query and
 * answers everywhere; the three above are min-width and the three below are
 * max-width, written outward from the middle, so each answers the one before it.
 * Nothing computes that — it is the cascade.
 *
 * Every property here is \`!important\`, and for the same reason in two forms:
 * the middle screen's padding and gap are core's own inline style, which
 * outranks every rule in every file, and another screen has to be able to
 * answer it — and core's layout stylesheet caps every child of a constrained
 * block at the global content size with a one-class selector that loads after
 * this file, so a width or a max-width set in the panel lost to it in silence.
 * That cost a heading on AN 101 its second line and a column six pixels, and
 * the symptom is the worst kind: the sidebar shows the number, the page does
 * not use it. The six size properties therefore carry \`!important\` as the rest
 * always have.
 *
 * That is also why the theme's own CSS must never write one of these
 * properties for a block — see "The UPQODE panel" in the skill.
 *
 * @package theme-textdomain
 */

/* ---- the design's motion — take every number from the source ----

   THE FIVE BELOW ARE PLACEHOLDERS AND ARE WRONG EVERYWHERE. Replace all five
   from the source on the first port, with the extractor, the same as any other
   value. One port shipped them untouched for weeks and nobody saw it, because
   at that point no block in the theme carried an arrival — so numbers that were
   nobody's were never seen to be wrong. That source said 46px, 0.85s and a
   different curve, in one line repeated in all 25 of its pages. */

:root {
	--xxp-motion-distance: 28px;
	--xxp-motion-duration: 1.1s;
	--xxp-reveal-duration: 0.7s;
	--xxp-motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
	--xxp-motion-lead: 0.5s;
}

`;

for (const [band, q, note] of bands) {
  const lines = [];
  for (const [k, p, shape] of kinds) {
    lines.push(...rules(k, p, shape, band));
  }
  if (!q) {
    css += `/* ${note} */\n` + lines.join('\n') + '\n\n';
  } else {
    css += `@media ${q} {\n\t/* ${note} */\n\t` + lines.join('\n\t') + '\n}\n\n';
  }
}

css += `/* ---- Hide on this screen ----

   Every size above cascades on purpose. A switch must not: ticking 1920 and
   1280 must not hide 1440 between them. So each screen has a window of its own,
   closed at both ends, and a tick means that screen and no other. */
`;
for (const [band, q] of windows) {
  css += `@media ${q} {\n\t[style*="--xxp-hide-${band}:"] { display: none !important; }\n}\n`;
}

css += `
/* ---- the same, in the editor canvas ----

   A block hidden on the screen the canvas is at would vanish from the editor
   and could not be selected again. The canvas marks it instead
   (\`--xxp-hidden-<screen>\`), and it is faded and outlined in that window. */
`;
for (const [band, q] of windows) {
  css += `@media ${q} {\n\t.editor-styles-wrapper [style*="--xxp-hidden-${band}:"] { opacity: 0.35; outline: 1px dashed currentColor; outline-offset: -1px; }\n}\n`;
}

css += `
/* ---- UPQODE Animations ---- */

/* Fade in on load: declarative, ends visible, needs no script — so the canvas
   shows the finished state. The delay is the block's own (--xxp-delay). */
.xxp-rise {
	animation: xxpRiseIn var(--xxp-motion-duration) var(--xxp-motion-ease) both;
	animation-delay: calc(var(--xxp-motion-lead) + var(--xxp-delay, 0ms));
}

/* Zoom in on load: a picture settling into its frame. */
.xxp-zoom {
	transform-origin: center center;
	animation: xxpZoomIn calc(var(--xxp-motion-duration) * 1.3) var(--xxp-motion-ease) both;
	animation-delay: var(--xxp-delay, 0ms);
}

/* Fade in on scroll: hidden before the first paint, but only once the head
   gate has put .xxp-reveal-ready on <html> — which it does only where
   motion.js can run, and takes off again if motion.js never arrives. */
.xxp-reveal-ready .xxp-reveal {
	opacity: 0;
}

/* Line draws itself: grows from its centre. */
.xxp-line {
	transform-origin: center center;
}

@keyframes xxpRiseIn {
	from { opacity: 0; transform: translateY(var(--xxp-motion-distance)); }
	to { opacity: 1; transform: none; }
}

@keyframes xxpZoomIn {
	from { opacity: 0; transform: scale(0.88); }
	to { opacity: 1; transform: none; }
}

@keyframes xxpLineGrow {
	from { opacity: 0; transform: scaleX(0); }
	to { opacity: 1; transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
	.xxp-rise,
	.xxp-zoom,
	.xxp-reveal {
		animation: none !important;
		opacity: 1 !important;
		transform: none !important;
	}
}

/* ---- Small · Body · Large on a paragraph ----

   The same tokens Styles → Typography → Text edits per screen, so a paragraph
   given a style follows that screen. Body is the paragraph as it is. */
.is-style-text-sm {
	font-size: var(--type-text-sm-size) !important;
	line-height: var(--type-text-sm-lh);
	letter-spacing: var(--type-text-sm-ls);
	font-weight: var(--type-text-sm-fw);
}

.is-style-text-lg {
	font-size: var(--type-text-lg-size) !important;
	line-height: var(--type-text-lg-lh);
	letter-spacing: var(--type-text-lg-ls);
	font-weight: var(--type-text-lg-fw);
}
`;

fs.writeFileSync(out, css);
console.log('wrote', out, css.length, 'bytes');
