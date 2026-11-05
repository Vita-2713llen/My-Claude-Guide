<?php
/**
 * UPQODE Dimensions — every size, spacing, layout and visibility value, per
 * screen, on every block.
 *
 * The editor says a padding once, for every width at once. The design says it
 * seven times. So every block gets a panel beside UPQODE Animations with the
 * seven screens as icons, and each screen holds its own values:
 *
 *   PADDING · MARGIN · BLOCK SPACING · WIDTH · HEIGHT · LAYOUT · CROP · HIDE
 *
 * How a value reaches the page:
 *
 *   - the attribute is `xxpSize`: `{ "base": { "pt": "var:preset|spacing|40" },
 *     "991": { "pt": "24px" } }`;
 *   - at render, PHP writes each entry as `--xxp-pt-991:…` into the block's
 *     `style` attribute. Never into saved markup, so it cannot make a block
 *     invalid;
 *   - `upqode-panel/assets/panel.css` turns each variable into its property
 *     inside the right media query.
 *
 * The middle screen's padding, margin and block spacing are core's own
 * `style.spacing`, so Styles and this panel show the same number. The other six
 * are the panel's own. Padding, margin, min-height and gap print `!important`
 * because they must beat the inline style core writes for the middle screen.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/**
 * What a block can be given on each screen, in groups.
 *
 * `sides`   — a group the editor's own spacing control draws (key → side);
 * `choices` — words from a fixed list, drawn as a row of marks;
 * `words`   — a free phrase ("center 25%");
 * `toggle`  — a switch;
 * `blocks`  — offered only on these blocks (null: every block).
 *
 * @return array<string, array>
 */
function xxp_size_groups() {
	$groups = array(
		'hide'    => array(
			'label'  => __( 'Visibility', 'theme-textdomain' ),
			'toggle' => true,
			'kinds'  => array( 'hide' => __( 'Hide on this screen', 'theme-textdomain' ) ),
		),
		'padding' => array(
			'label' => __( 'Padding', 'theme-textdomain' ),
			'sides' => array(
				'pt' => 'top',
				'pr' => 'right',
				'pb' => 'bottom',
				'pl' => 'left',
			),
			'kinds' => array(
				'pt' => __( 'Top', 'theme-textdomain' ),
				'pr' => __( 'Right', 'theme-textdomain' ),
				'pb' => __( 'Bottom', 'theme-textdomain' ),
				'pl' => __( 'Left', 'theme-textdomain' ),
			),
		),
		'margin'  => array(
			'label' => __( 'Margin', 'theme-textdomain' ),
			'sides' => array(
				'mt' => 'top',
				'mr' => 'right',
				'mb' => 'bottom',
				'ml' => 'left',
			),
			'kinds' => array(
				'mt' => __( 'Top', 'theme-textdomain' ),
				'mr' => __( 'Right', 'theme-textdomain' ),
				'mb' => __( 'Bottom', 'theme-textdomain' ),
				'ml' => __( 'Left', 'theme-textdomain' ),
			),
		),
		'gap'     => array(
			'label' => __( 'gap', 'theme-textdomain' ),
			'sides' => array(
				'gap'  => 'all',
				'rgap' => 'top',
				'cgap' => 'left',
			),
			'kinds' => array(
				'gap'  => __( 'gap', 'theme-textdomain' ),
				'rgap' => __( 'row-gap', 'theme-textdomain' ),
				'cgap' => __( 'column-gap', 'theme-textdomain' ),
				/*
				 * How wide a column is when a list flows into columns — `column-width`, the
				 * one half of CSS columns the panel had no word for. `cgap` was already the
				 * other half: `column-gap` is the same property whether the block is a flex
				 * row, a grid or a multi-column list.
				 *
				 * It was `xxp-list-columns`, on one list in the Employment guide, holding
				 * those two declarations and nothing else.
				 */
				'colw' => __( 'column-width', 'theme-textdomain' ),
			),
		),
		'width'   => array(
			'label' => __( 'Width', 'theme-textdomain' ),
			'kinds' => array(
				'w'    => __( 'width', 'theme-textdomain' ),
				'minw' => __( 'min', 'theme-textdomain' ),
				'maxw' => __( 'max', 'theme-textdomain' ),
			),
		),
		'height'  => array(
			'label' => __( 'Height', 'theme-textdomain' ),
			'kinds' => array(
				'h'    => __( 'height', 'theme-textdomain' ),
				'minh' => __( 'min', 'theme-textdomain' ),
				'maxh' => __( 'max', 'theme-textdomain' ),
			),
		),
		/*
		 * `hint` and `help` belong to the GROUP, not to the function that draws it.
		 *
		 * Both word-valued groups — this one and Aspect ratio — are drawn by one renderer,
		 * and that renderer had the crop sentence and the word "center" written into it. So
		 * Aspect ratio offered "center" as its placeholder and explained how a picture is
		 * cropped, under a field that wants "16 / 9".
		 */
		'crop'    => array(
			'label'  => __( 'Crop', 'theme-textdomain' ),
			'words'  => true,
			'blocks' => array( 'core/image', 'core/video', 'core/cover', 'core/media-text', 'core/post-featured-image' ),
			'kinds'  => array( 'crop' => __( 'Where the picture sits', 'theme-textdomain' ) ),
			'hint'   => 'center',
			'help'   => __( 'What to keep when the frame is a different shape from the picture: "center", "top", "top right", "center 25%", "100% 0%".', 'theme-textdomain' ),
		),
		/* The other half of Crop: whether the picture fills the frame at all. */
		'fitting' => array(
			'label'   => __( 'Fill', 'theme-textdomain' ),
			'choices' => true,
			'blocks'  => array( 'core/image', 'core/video', 'core/cover', 'core/media-text', 'core/post-featured-image' ),
			'kinds'   => array( 'fit' => __( 'How it fills the frame', 'theme-textdomain' ) ),
		),
		'layout'  => array(
			'label'   => __( 'Layout', 'theme-textdomain' ),
			'choices' => true,
			/*
			 * NAMED AFTER THE CSS. The first five were the designer's own words —
			 * Direction, Distribute, Align, Wrap — and they are the ones a reviewer and
			 * then Anna both stopped at: the panel is used by people who know CSS, and
			 * "Distribute" costs them a guess where `justify-content` is read on sight.
			 * `align-self` keeps a name of its own because it is the one that is NOT about
			 * this block's children, and that difference is the whole reason it now sits
			 * under Flex child rather than here.
			 */
			'kinds'   => array(
				'dir'    => __( 'flex-direction', 'theme-textdomain' ),
				'just'   => __( 'justify-content', 'theme-textdomain' ),
				'align'  => __( 'align-items', 'theme-textdomain' ),
				'aself'  => __( 'align-self', 'theme-textdomain' ),
				'wrap'   => __( 'flex-wrap', 'theme-textdomain' ),
				'talign' => __( 'text-align', 'theme-textdomain' ),
				/* `text-wrap`, not `white-space`: the panel wrote one property and named
				   the other, which is the one mistake a CSS name is supposed to prevent.
				   Its words are balance / pretty / wrap / nowrap, and `panel.css` has
				   always set `text-wrap` from them. */
				'twrap'  => __( 'text-wrap', 'theme-textdomain' ),
				'over'   => __( 'overflow', 'theme-textdomain' ),
				'disp'   => __( 'display', 'theme-textdomain' ),
			),
		),
		/*
		 * How a block SHARES a row with its siblings.
		 *
		 * Added because its absence was writing classes. Fifteen `xxpParts` classes in
		 * this theme existed for nothing but a flex ratio — `xxp-split-wide` is
		 * `flex: 1.5 1 460px`, `xxp-candidate-split > …` the same thing at 1.7,
		 * `xxp-band-action` is `flex-shrink: 0` — because a designer could say how wide
		 * a block is but not how it grows against the block beside it, and a column that
		 * grows 1.7 from a 460 basis is a design value like any other.
		 *
		 * Grow and shrink are plain numbers; basis is a length and goes through the same
		 * validation as a width.
		 */
		'flex'    => array(
			'label' => __( 'Flex', 'theme-textdomain' ),
			'kinds' => array(
				'grow'   => __( 'flex-grow', 'theme-textdomain' ),
				'shrink' => __( 'flex-shrink', 'theme-textdomain' ),
				'basis'  => __( 'flex-basis', 'theme-textdomain' ),
				'order'  => __( 'order', 'theme-textdomain' ),
			),
		),
		/*
		 * Whether a block is taken out of the flow, per screen.
		 *
		 * Core has a Position control already and it is deliberately NOT replaced: it offers
		 * Sticky and Fixed, which are states core also writes a z-index for, and the header
		 * uses it. What core has no word for is `absolute` — a block pinned to a corner of
		 * its parent at one screen and back in the flow at the next. That is one design
		 * value at seven widths, which is this panel's whole job.
		 *
		 * `static` is here too, because turning the pinning OFF lower down is the half that
		 * makes it usable: without it the only way back into the flow is a class.
		 */
		'place'   => array(
			'label'   => __( 'Position', 'theme-textdomain' ),
			'choices' => true,
			'kinds'   => array(
				'pos' => __( 'position', 'theme-textdomain' ),
			),
		),
		/*
		 * And WHERE it then sits. Four sides in one group, drawn the way padding and margin
		 * are — because that is what they are.
		 *
		 * `top` was here already, alone, as the sticky offset, and it keeps that job: core
		 * says THAT a block sticks and hardcodes `top: 0px` every time it is picked, while
		 * this design holds its sticky boxes 100 down, clear of the fixed bar. That 100 was
		 * three classes — `xxp-rail`, `xxp-plate-sticky`, `xxp-guide-aside` —
		 * saying the same two declarations under three names. The other three sides had no
		 * word at all, which is why `top` moved in beside them rather than a second control
		 * being added next to it.
		 *
		 * Membership's hero is the reason. The design hangs a small framed photograph off
		 * the bottom-right corner of the hero — `position: absolute`, `right` the gutter,
		 * `bottom` the band's own end padding — and then drops it back into the flow, full
		 * width, on a narrow screen. Every one of those is a design value at a screen, and
		 * without these keys the whole card would have had to be a class.
		 */
		'inset'   => array(
			'label' => __( 'Offsets', 'theme-textdomain' ),
			'sides' => array(
				'top'    => 'top',
				'right'  => 'right',
				'bottom' => 'bottom',
				'left'   => 'left',
			),
			'kinds' => array(
				'top'    => __( 'Top', 'theme-textdomain' ),
				'right'  => __( 'Right', 'theme-textdomain' ),
				'bottom' => __( 'Bottom', 'theme-textdomain' ),
				'left'   => __( 'Left', 'theme-textdomain' ),
			),
		),
		/*
		 * How tall a block is for the width it has — `3 / 2`, `16 / 9`. Not a length, so it
		 * is a phrase like `crop` rather than a number with a unit.
		 *
		 * The same photograph: 3/2 while it is the card in the corner, 2/1 once it lies
		 * across the top of a narrow screen. A height in pixels cannot say that, and an
		 * `aspect-ratio` written into CSS would have put both values out of reach.
		 */
		'aspect'  => array(
			'label' => __( 'Aspect ratio', 'theme-textdomain' ),
			'words' => true,
			'kinds' => array( 'ar' => __( 'aspect-ratio', 'theme-textdomain' ) ),
			'hint'  => '16 / 9',
			'help'  => __( 'The shape the block holds whatever its width: "16 / 9", "4 / 3", "1", or "auto" to let the content decide.', 'theme-textdomain' ),
		),
		/*
		 * NAMED AFTER THE CSS, not after the idea. "Depth" was the designer's own word and
		 * it read well until somebody had to use it: Anna, 20 October, looking at the panel
		 * — *"от наприклад шо означає depth?"* — and then *"ну то так і назви opacity and
		 * z-index"*. A reviewer had said the same thing more politely. Whoever opens this
		 * sidebar knows CSS; the plain-English name teaches them nothing and costs them a
		 * guess, where the property name is understood on sight.
		 */
		'offset'  => array(
			'label' => __( 'Opacity and z-index', 'theme-textdomain' ),
			'kinds' => array(
				/*
				 * How solid a block is.
				 *
				 * The panel had no word for it, and that one gap kept `xxp-eyebrow` alive
				 * across NINE patterns for a single declaration — `opacity: 0.8`. The same
				 * gap is `xxp-lead`, the mission's credit and the arrow between the
				 * claims. Designer, on being shown the eyebrow: "there is nothing there",
				 * which was exactly right — it is a value, and a value belongs in the
				 * sidebar at the screen it applies to.
				 */
				'op'  => __( 'opacity', 'theme-textdomain' ),
				/*
				 * What a block sits in front of. Core's position support writes a z-index of
				 * its own — 10, always — and the bar needs 50 so that nothing on a page can
				 * rise through it. That number was the last part of `xxp-bar` the sidebar
				 * could not say.
				 */
				'z'   => __( 'z-index', 'theme-textdomain' ),
			),
		),
		/*
		 * Border WIDTH, per screen and per side.
		 *
		 * Core sets a border once, for every width at once, which is right for a card and
		 * wrong for a rule that the design draws only on the desktop bar: the header's top
		 * row is ruled off above 1280 and plain below it, and that one difference was the
		 * reason `xxp-header-top` existed. The colour stays core's — it does not change
		 * per screen — and only the width moves.
		 */
		/*
		 * THE BORDER, per screen — colour, style, width on four sides, and four radii.
		 *
		 * It was the width alone, and the question that followed was the right one: Anna,
		 * 20 Oct — *"але для бордерів є ж нативна панель, нашо ти свою створював?"* The
		 * answer was that core's sets ONE value for all seven screens while the design
		 * rules the header's top row only above 1280. The better answer is this one:
		 * *"зроби таке ж саме як в нативній, просто для всіх брейкпоінтів, а в нативній
		 * заховай"*.
		 *
		 * So the panel draws core's OWN `BorderBoxControl` and `BorderRadiusControl` — the
		 * same control, not a copy — pointed at whichever screen is chosen, and core's
		 * Border panel is hidden in `editor-panels.css`. The middle screen reads and writes
		 * `style.border`, exactly as padding and margin do with `style.spacing`, so every
		 * border written before this is still there, still editable, and still one value.
		 *
		 * No `sides` and no `kinds` drawn one by one: the whole group is one control, named
		 * in `xxp_panel_sections()`, and the keys below exist for the validator and for
		 * `panel.css`.
		 */
		'borderw' => array(
			'label' => __( 'Border', 'theme-textdomain' ),
			'kinds' => array(
				'btw' => __( 'border-top-width', 'theme-textdomain' ),
				'brw' => __( 'border-right-width', 'theme-textdomain' ),
				'bbw' => __( 'border-bottom-width', 'theme-textdomain' ),
				'blw' => __( 'border-left-width', 'theme-textdomain' ),
				'btc' => __( 'border-top-color', 'theme-textdomain' ),
				'brc' => __( 'border-right-color', 'theme-textdomain' ),
				'bbc' => __( 'border-bottom-color', 'theme-textdomain' ),
				'blc' => __( 'border-left-color', 'theme-textdomain' ),
				'bts' => __( 'border-top-style', 'theme-textdomain' ),
				'brs' => __( 'border-right-style', 'theme-textdomain' ),
				'bbs' => __( 'border-bottom-style', 'theme-textdomain' ),
				'bls' => __( 'border-left-style', 'theme-textdomain' ),
				'rtl' => __( 'border-top-left-radius', 'theme-textdomain' ),
				'rtr' => __( 'border-top-right-radius', 'theme-textdomain' ),
				'rbr' => __( 'border-bottom-right-radius', 'theme-textdomain' ),
				'rbl' => __( 'border-bottom-left-radius', 'theme-textdomain' ),
			),
		),
		/*
		 * Columns, per screen. Core's grid layout has one `columnCount` and no breakpoints,
		 * so every "three, then two, then one" in this design had been written as a class.
		 */
		'grid'    => array(
			'label' => __( 'Grid', 'theme-textdomain' ),
			'kinds' => array(
				/*
				 * NOT called `grid-template-columns`, although that is the property it ends
				 * up in. Neither this nor the column width below is that property on its
				 * own — the two are the inside of one `repeat()` — and labelling both with
				 * the property's name put the same words on two different controls in one
				 * section, which is worse than the plain word. The sentence under the field
				 * says what they add up to.
				 */
				'cols' => __( 'columns', 'theme-textdomain' ),
				/*
				 * Which of those columns a block spans — written as grid lines, `3 / -1`
				 * for "from the third to the end". It was the last thing holding
				 * `xxp-footer-sponsors` together: the sponsors panel takes the two
				 * columns the menus leave on the second row, and no other key could say so.
				 */
				'gcol' => __( 'grid-column', 'theme-textdomain' ),
			),
		),
		/*
		 * How wide those columns are. `cols` says how MANY and has always made them equal;
		 * the footer's menu grid wants four columns each as wide as its own longest menu,
		 * spread apart — `repeat(4, max-content)` — which was the last thing keeping
		 * `xxp-footer-nav` alive. Left unset it stays equal, so nothing that exists
		 * changes.
		 */
		'track'   => array(
			'label'   => __( 'Column width', 'theme-textdomain' ),
			'choices' => true,
			'kinds'   => array(
				/* said once: the group is called this, and the control under it was too */
				'ctrack' => __( 'Column width', 'theme-textdomain' ),
			),
		),
		/* shown in the block's Typography group, not here — see dimensions.js */
		'type'    => array(
			'label' => __( 'Type size', 'theme-textdomain' ),
			'steps' => true,
			'kinds' => array( 'fs' => __( 'font-size', 'theme-textdomain' ) ),
		),
	);

	/* a project may add a group, or narrow one to the blocks it answers on */
	return apply_filters( 'xxp_size_groups', $groups );
}

/**
 * The keyword settings, and the only words each will take.
 *
 * Written out because these end up in a style attribute. Anything not on the
 * list is dropped.
 *
 * A THIRD element names those words in plain English, and a kind that carries one is
 * drawn as a dropdown instead of a row of marks.
 *
 * It exists because the five oldest kinds — direction, distribute, align, wrap, text —
 * are drawn as ICONS, and the drawings live in a lookup inside dimensions.js. Every kind
 * added after those five went through the same lookup, found nothing, and drew an EMPTY
 * square: five or six blank buttons under a heading, which reads as a setting that does
 * nothing at all. The settings were real throughout and wrote real CSS; only the pictures
 * were missing. So: words where nobody drew a picture, rather than a blank button.
 *
 * The words belong HERE, beside the list they name, not in the renderer — the same
 * mistake one layer up put the crop sentence under the aspect-ratio field.
 *
 * @return array<string, array{0:string,1:string[],2?:array<string,string>}>
 */
function xxp_layout_kinds() {
	return array(
		'dir'    => array( 'flex-direction', array( 'row', 'row-reverse', 'column', 'column-reverse' ) ),
		'just'   => array( 'justify-content', array( 'flex-start', 'center', 'flex-end', 'space-between', 'space-around' ) ),
		'align'  => array( 'align-items', array( 'flex-start', 'center', 'flex-end', 'stretch', 'baseline' ) ),
		'wrap'   => array( 'flex-wrap', array( 'wrap', 'nowrap' ) ),
		'talign' => array( 'text-align', array( 'left', 'center', 'right' ) ),
		/*
		 * Whether a block is in the flow — see the `place` group above. `sticky` and `fixed`
		 * are deliberately NOT offered: core's own Position control writes those, together
		 * with the z-index they need, and two controls writing one property is how a block
		 * ends up with a position nobody can find. This says the one word core will not.
		 */
		'pos'    => array(
			'position',
			array( 'static', 'relative', 'absolute' ),
			array(
				'static'   => __( 'In the flow', 'theme-textdomain' ),
				'relative' => __( 'In the flow, nudged', 'theme-textdomain' ),
				'absolute' => __( 'Pinned to the parent', 'theme-textdomain' ),
			),
		),
		'hide'   => array( 'display', array( 'none' ) ),
		/*
		 * Display, said outright.
		 *
		 * `hide` is a switch whose only value is `none`, so it can turn a block off at a
		 * screen but never back ON at a wider one — and "hidden by default, shown above
		 * 1280" needs both halves. The header's top row is exactly that: its menu and its
		 * buttons belong to the desktop bar and the drawer takes over below, which is why
		 * `xxp-header-top` existed.
		 *
		 * It is a MEASUREMENT, not a toggle, and panel.css keeps the two apart: the
		 * measurement rules cascade, with `base` carrying no media query at all, while the
		 * visibility rules are BANDED — `--xxp-hide-base` lives inside
		 * `(min-width: 992px) and (max-width: 1279px)` and means that band alone. Written
		 * beside `hide` at first, on the reasoning that it had to come later to beat the
		 * switch, and the header's menu then reappeared below 992 because `disp: none` had
		 * stopped applying there. It belongs with the measurements.
		 *
		 * So `hide` wins over `disp` inside its band, which is the right way round: the
		 * switch is the deliberate one.
		 */
		'disp'   => array(
			'display',
			array( 'none', 'block', 'flex', 'inline-flex', 'grid' ),
			array(
				'none'        => __( 'Not shown', 'theme-textdomain' ),
				'block'       => __( 'A band of its own', 'theme-textdomain' ),
				'flex'        => __( 'A row of its children', 'theme-textdomain' ),
				'inline-flex' => __( 'A row, as wide as it needs', 'theme-textdomain' ),
				'grid'        => __( 'A grid of its children', 'theme-textdomain' ),
			),
		),
		/*
		 * How a heading breaks across its lines. `balance` is what the design asks for on
		 * every big heading — it evens the lines instead of leaving one word alone — and it
		 * was a class, `xxp-balance`, because the panel had nowhere to say it.
		 */
		'twrap'  => array(
			'text-wrap',
			array( 'balance', 'pretty', 'wrap', 'nowrap' ),
			array(
				'balance' => __( 'Even the lines', 'theme-textdomain' ),
				'pretty'  => __( 'No word left alone', 'theme-textdomain' ),
				'wrap'    => __( 'Break where it falls', 'theme-textdomain' ),
				'nowrap'  => __( 'Keep on one line', 'theme-textdomain' ),
			),
		),
		/*
		 * This block's own alignment across the row, against the row's for all of them.
		 * It was five classes — `chip-when`, `pill`, `mission`, `mission-rule`,
		 * `nd-step-title` — each saying `align-self` and little else.
		 */
		'aself'  => array(
			'align-self',
			array( 'auto', 'flex-start', 'center', 'flex-end', 'stretch', 'baseline' ),
			array(
				'auto'       => __( 'Whatever the row says', 'theme-textdomain' ),
				'flex-start' => __( 'To the top of the row', 'theme-textdomain' ),
				'center'     => __( 'Centred in the row', 'theme-textdomain' ),
				'flex-end'   => __( 'To the foot of the row', 'theme-textdomain' ),
				'stretch'    => __( 'Fill the height of the row', 'theme-textdomain' ),
				'baseline'   => __( 'On the first line of text', 'theme-textdomain' ),
			),
		),
		/*
		 * What is allowed to stick out. A card that clips its photograph to its own
		 * rounded corner was `xxp-mentor-card` and nothing more.
		 */
		'over'   => array(
			'overflow',
			array( 'visible', 'hidden', 'clip', 'auto', 'scroll' ),
			array(
				'visible' => __( 'Let it stick out', 'theme-textdomain' ),
				'hidden'  => __( 'Cut it off at the edge', 'theme-textdomain' ),
				'clip'    => __( 'Cut it off, no scrolling', 'theme-textdomain' ),
				'auto'    => __( 'Scroll when there is more', 'theme-textdomain' ),
				'scroll'  => __( 'Always scroll', 'theme-textdomain' ),
			),
		),
		/*
		 * How a picture fills the frame it is given — the other half of `crop`, which has
		 * always said WHERE inside the frame and never whether to fill it.
		 *
		 * About Us needs all three in one page: the board's headshots crop to a square, the
		 * sponsors' logos sit INSIDE their tile untouched, and the ANAwareness photograph
		 * covers a full-bleed band. Written in CSS that is three styles for one property.
		 */
		'fit'    => array(
			'object-fit',
			array( 'cover', 'contain', 'fill', 'none', 'scale-down' ),
			array(
				'cover'      => __( 'Fill the frame, crop the rest', 'theme-textdomain' ),
				'contain'    => __( 'Fit inside, show all of it', 'theme-textdomain' ),
				'fill'       => __( 'Stretch to the frame', 'theme-textdomain' ),
				'none'       => __( 'Its own size', 'theme-textdomain' ),
				'scale-down' => __( 'Fit inside, never enlarge', 'theme-textdomain' ),
			),
		),
		/*
		 * How wide each column of a grid is — see the `track` group above. The value is a
		 * grid TRACK, not a property of its own: panel.css feeds it to the `repeat()` that
		 * `cols` already writes, and falls back to `minmax(0,1fr)` when nothing is chosen,
		 * which is what every grid on the site has today.
		 */
		'ctrack' => array(
			'grid-template-columns',
			array( 'minmax(0,1fr)', 'max-content', 'min-content', 'auto' ),
			array(
				'minmax(0,1fr)' => __( 'All the same width', 'theme-textdomain' ),
				'max-content'   => __( 'As wide as its longest line', 'theme-textdomain' ),
				'min-content'   => __( 'As narrow as it will go', 'theme-textdomain' ),
				'auto'          => __( 'As wide as it needs', 'theme-textdomain' ),
			),
		),
	);
}

/**
 * HOW THE PANEL IS ARRANGED — which settings sit together, and which are folded away.
 *
 * The groups above say what a block can be given; this says where each of those settings
 * is drawn. The two are separate on purpose: nothing here changes a key, a property or a
 * saved value, so the arrangement can be rethought without touching what the panel writes.
 *
 * It was rethought on 20 October, against Webflow, because the groups had been ordered by
 * the SHAPE of their value rather than by what they do. `flex-grow` and `flex-basis` sat
 * under "Flex" while `align-self` — the same idea, how this block behaves inside its
 * parent — sat under "Layout" beside `flex-direction`, which is about the block's
 * children. Two settings that are never used apart were two groups apart, and a designer
 * had to know which was which before the panel helped at all. Anna, 20 Oct, on being shown
 * Webflow's own panel: *"тут все зрозуміло"*.
 *
 * So, like Webflow: **Layout** is what this block does to its children, **Flex child** is
 * what it does inside its parent, **Position** is whether it is in the flow at all, and
 * everything reached a few times a year is behind **More**.
 *
 * An entry draws either a whole group — `array( 'group' => 'padding' )`, which the core
 * spacing control needs because it draws four sides at once — or named settings,
 * `array( 'kinds' => array( 'disp', 'dir' ) )`, which may be taken from several groups and
 * are drawn in the order written here. `sizing` is the one control with no group of its
 * own: see `xxp_panel_sizing()`.
 *
 * `fold` is a second heading inside the section, closed until it is wanted.
 *
 * @return array<int, array>
 */
function xxp_panel_sections() {
	$sections = array(
		/*
		 * The box itself: whether it is here, how much room around it, how big it is. No
		 * heading — these are what the panel is opened for, and a heading over them would
		 * be one more line between the designer and the field.
		 */
		array(
			'key'  => 'box',
			'open' => true,
			'draw' => array(
				array( 'group' => 'hide' ),
				array( 'group' => 'padding' ),
				array( 'group' => 'margin' ),
				array( 'group' => 'gap' ),
				array( 'group' => 'width' ),
				array( 'group' => 'height' ),
			),
		),
		/*
		 * What this block does to its CHILDREN. `display` comes first because the four
		 * under it mean nothing until it is flex or grid.
		 */
		array(
			'key'   => 'layout',
			'label' => __( 'Layout', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'kinds' => array( 'disp', 'dir', 'just', 'align', 'wrap' ) ),
			),
		),
		/* What this block does inside its PARENT. */
		array(
			'key'   => 'flexchild',
			'label' => __( 'Flex child', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'sizing' => true ),
			),
			'fold'  => array(
				'label' => __( 'Alignment and order', 'theme-textdomain' ),
				'draw'  => array(
					array( 'kinds' => array( 'aself', 'order' ) ),
				),
			),
		),
		/*
		 * Whether it is in the flow, and where it sits once it is not. The offsets are
		 * folded because three blocks in four never leave the flow — and the one that does
		 * needs all four sides at once, which is exactly what a fold opens onto.
		 */
		array(
			'key'   => 'place',
			'label' => __( 'Position', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'kinds' => array( 'pos' ) ),
			),
			'fold'  => array(
				'label' => __( 'Offsets and z-index', 'theme-textdomain' ),
				'draw'  => array(
					array( 'group' => 'inset' ),
					array( 'kinds' => array( 'z' ) ),
				),
			),
		),
		/*
		 * The grid, when there IS one.
		 *
		 * These two sections are the first in the panel that come and go, and they are the
		 * reason `when` exists at all. Anna, 20 Oct: *"це має бути десь в іншому місці, і
		 * з'являтись тільки коли ми додаємо елемент грід"* — and then *"або коли я тут
		 * вибираю грід"*, which is both halves of the condition. A column count under a
		 * block that is not a grid writes a property nothing reads, and the designer has to
		 * know that to ignore it.
		 *
		 * `grid` is true when the block is one: core's own Grid layout, or `display: grid`
		 * chosen here at any screen. `in-grid` is true when its PARENT is — which is where
		 * `grid-column` belongs, exactly as `align-self` belongs under Flex child.
		 */
		array(
			'key'   => 'grid',
			'label' => __( 'Grid', 'theme-textdomain' ),
			'when'  => 'grid',
			'open'  => false,
			'draw'  => array(
				array( 'kinds' => array( 'cols' ) ),
				array( 'group' => 'track' ),
			),
		),
		array(
			'key'   => 'gridchild',
			'label' => __( 'Grid child', 'theme-textdomain' ),
			'when'  => 'in-grid',
			'open'  => false,
			'draw'  => array(
				array( 'gridcolumn' => true ),
			),
		),
		/*
		 * The two text settings, together and under their own name.
		 *
		 * `text-align` was under More, between `overflow` and `aspect-ratio`, and Anna
		 * asked the right question on 20 Oct: *"чому тут є цей text-align?"* — twice over,
		 * because a text property among the layout leftovers reads as something left
		 * behind, and because the editor already has an alignment control of its own.
		 *
		 * It stays, and here is why: core's alignment is ONE value for all seven screens,
		 * and this design changes it by width — centred on a phone, left on the desktop.
		 * Every such case was a class before the panel could say it. `text-wrap` is the
		 * same kind of thing: `balance` on a big heading, and it was `xxp-balance`.
		 *
		 * Not moved into the editor's own Typography group beside the type size, although
		 * that is where it belongs by subject: that row is only drawn where core offers a
		 * font size, and a group or a cover that takes no font size would lose the control
		 * altogether.
		 */
		array(
			'key'   => 'text',
			'label' => __( 'Text', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'kinds' => array( 'talign', 'twrap' ) ),
			),
		),
		/*
		 * The border — the editor's own control, once per screen.
		 *
		 * It used to be the width alone here and everything else in core's Border panel,
		 * which is one value for all seven screens. Both are now here, drawn by core's own
		 * `BorderBoxControl` and `BorderRadiusControl`, and core's panel is hidden: the
		 * same control, at the width you are looking at.
		 *
		 * On the middle screen it reads and writes core's `style.border`, so every border
		 * set before this change is still there and still editable — and there is one value
		 * for that screen, not two.
		 */
		array(
			'key'   => 'border',
			'label' => __( 'Border', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'border' => true ),
			),
		),
		/*
		 * And the rest. Every one of these is real and several were hard-won — but they are
		 * reached when one particular block needs them, not while laying a page out, and
		 * eighteen open groups is why the panel was called uncomfortable to edit.
		 */
		array(
			'key'   => 'more',
			'label' => __( 'More', 'theme-textdomain' ),
			'open'  => false,
			'draw'  => array(
				array( 'kinds' => array( 'op', 'over' ) ),
				array( 'group' => 'aspect' ),
				array( 'group' => 'crop' ),
				array( 'group' => 'fitting' ),
			),
		),
	);

	/* a project that adds a group says where it goes; anything unplaced is drawn under
	   More, so a new setting is never silently invisible */
	return apply_filters( 'xxp_panel_sections', $sections );
}

/**
 * `grid-column`, said as two things a person can answer.
 *
 * The property takes grid LINES — `3 / -1`, `span 2`, `2 / span 3` — and a free text box
 * asking for that is a box most people cannot fill. Anna, 20 Oct: *"поле grid-column — це
 * взагалі не зрозуміло, треба по іншому це робити"*.
 *
 * So it is asked as a start and a width, and the panel writes the line syntax:
 *
 *   start 3, to the end      → `3 / -1`
 *   start 2, 3 columns       → `2 / span 3`
 *   no start, 2 columns      → `span 2`
 *   start 2, 1 column        → `2`
 *
 * The widths are a short list rather than a number because a grid in this design is never
 * wider than four columns, and a list cannot be filled in wrongly.
 *
 * @return array<string, string> value → the words for the sidebar.
 */
function xxp_panel_grid_widths() {
	return array(
		''   => __( 'One column', 'theme-textdomain' ),
		'2'  => __( 'Two columns', 'theme-textdomain' ),
		'3'  => __( 'Three columns', 'theme-textdomain' ),
		'4'  => __( 'Four columns', 'theme-textdomain' ),
		'-1' => __( 'To the end of the row', 'theme-textdomain' ),
	);
}

/**
 * The sizing presets — one choice that writes `flex-grow` and `flex-shrink` together.
 *
 * Two settings that are never set apart, and almost always to one of three combinations.
 * Webflow offers exactly those three and keeps the numbers behind a "…", and the numbers
 * are what this theme actually needed: fifteen classes existed for a flex ratio alone —
 * `xxp-split-wide` is `flex: 1.5 1 460px` — so the exact values stay one click away
 * rather than gone.
 *
 * `flex-basis` is left alone by the presets. It is a LENGTH, the one of the three a
 * designer writes deliberately, and a preset that cleared it would undo that by accident.
 *
 * @return array<string, array{0:string,1:array<string,string>}>
 */
function xxp_panel_sizing() {
	return array(
		'shrink' => array(
			__( 'Shrink', 'theme-textdomain' ),
			array(
				'grow'   => '0',
				'shrink' => '1',
			),
		),
		'grow'   => array(
			__( 'Grow', 'theme-textdomain' ),
			array(
				'grow'   => '1',
				'shrink' => '1',
			),
		),
		'fixed'  => array(
			__( 'Fixed', 'theme-textdomain' ),
			array(
				'grow'   => '0',
				'shrink' => '0',
			),
		),
	);
}

/**
 * Every measurement and the property it sets.
 *
 * @return array<string, string>
 */
function xxp_size_kinds() {
	return array(
		'w'    => 'width',
		'minw' => 'min-width',
		'maxw' => 'max-width',
		'h'    => 'height',
		'minh' => 'min-height',
		'maxh' => 'max-height',
		'crop' => 'object-position',
		'pt'   => 'padding-top',
		'pr'   => 'padding-right',
		'pb'   => 'padding-bottom',
		'pl'   => 'padding-left',
		'mt'   => 'margin-top',
		'mr'   => 'margin-right',
		'mb'   => 'margin-bottom',
		'ml'   => 'margin-left',
		'gap'  => 'gap',
		'rgap' => 'row-gap',
		'cgap' => 'column-gap',
		/* How wide each column is when a list flows into columns — see the `gap` group. */
		'colw' => 'column-width',
		'fs'   => 'font-size',
		/* How a block shares a row with its siblings — see the `flex` group above. */
		'grow'   => 'flex-grow',
		'shrink' => 'flex-shrink',
		'basis'  => 'flex-basis',
		/*
		 * Where a block sits in the row, regardless of where it is written. One class,
		 * `xxp-nav-foot`, existed to put the footer's menu first on a narrow screen.
		 */
		'order'  => 'order',
		/*
		 * How many equal columns a grid has, PER SCREEN.
		 *
		 * Core's grid layout takes a single `columnCount` and has no breakpoints, so the
		 * design's "three, then two, then one" had to be written as a class every time —
		 * `xxp-grid-2`, `xxp-grid-3`, `xxp-mentor-grid`, `xxp-qa-grid`,
		 * `xxp-option-cards`, `xxp-proscons`, six names for one idea. The value is a
		 * plain count; the repeat() around it is in panel.css, where the property lives.
		 */
		'cols'   => 'grid-template-columns',
		/* Which columns of that grid a block spans — see the `grid` group above. */
		'gcol'   => 'grid-column',
		/*
		 * THE WHOLE BORDER, per screen — see the `border` group above.
		 *
		 * The width was here alone, and the colour and the radius were core's, which is
		 * one value for all seven screens. Anna, 20 Oct: *"зроби таке ж саме як в нативній,
		 * просто для всіх брейкпоінтів, а в нативній заховай"*. So the panel now says all
		 * three, the editor's own Border panel is hidden, and the middle screen writes
		 * core's `style.border` exactly as padding and margin already do — one value in one
		 * place, whichever control you reach for.
		 */
		'btc'    => 'border-top-color',
		'brc'    => 'border-right-color',
		'bbc'    => 'border-bottom-color',
		'blc'    => 'border-left-color',
		'bts'    => 'border-top-style',
		'brs'    => 'border-right-style',
		'bbs'    => 'border-bottom-style',
		'bls'    => 'border-left-style',
		'rtl'    => 'border-top-left-radius',
		'rtr'    => 'border-top-right-radius',
		'rbr'    => 'border-bottom-right-radius',
		'rbl'    => 'border-bottom-left-radius',
		/*
		 * Where a block sits once it is out of the flow — see the `inset` group above. All
		 * four are plain lengths, so they need nothing of their own in the validator. `top`
		 * is also the sticky offset, which is the same property and the same field.
		 */
		'top'    => 'top',
		'right'  => 'right',
		'bottom' => 'bottom',
		'left'   => 'left',
		/*
		 * How tall a block is for the width it has — see the `aspect` group above. A PAIR
		 * of numbers around a slash, not a length, so it is answered in the validator
		 * before the line that turns a bare number into pixels.
		 */
		'ar'     => 'aspect-ratio',
		/*
		 * What the block sits in front of. A plain number and NOT a length, so it is
		 * answered in the validator before the line that turns a bare number into pixels —
		 * `z-index: 50px` is ignored, and the bar would have silently fallen behind the page
		 * while the panel showed 50.
		 */
		'z'      => 'z-index',
		/* How solid a block is — see the `offset` group above. A fraction, not a length. */
		'op'     => 'opacity',
		/* Border width per screen and per side — see the `borderw` group above. */
		'btw'    => 'border-top-width',
		'brw'    => 'border-right-width',
		'bbw'    => 'border-bottom-width',
		'blw'    => 'border-left-width',
	);
}

/**
 * Every block learns the three attributes on the server.
 *
 * They are read at render; an attribute the server does not know never
 * arrives. The editor declares them too (dimensions.js) — a block that has not
 * declared an attribute in the editor gets it stripped out of saved markup.
 *
 * @param array $args Registration arguments.
 * @return array
 */
function xxp_supports_attributes( $args ) {
	if ( ! isset( $args['attributes'] ) || ! is_array( $args['attributes'] ) ) {
		$args['attributes'] = array();
	}

	$args['attributes']['xxpMotion'] = array( 'type' => 'object' );
	$args['attributes']['xxpSize']   = array( 'type' => 'object' );
	$args['attributes']['xxpParts']  = array( 'type' => 'array' );

	return $args;
}
add_filter( 'register_block_type_args', 'xxp_supports_attributes' );

/**
 * One value, checked, as CSS — or null when it is refused.
 *
 * A value this refuses is refused in silence, and a stylesheet quietly covering
 * for it hides that it was ever refused. Read the page back after writing
 * values. `calc()`, `clamp()`, `min()` and `max()` are allowed — designs need
 * them — with nothing inside that can close the attribute or open a URL.
 *
 * @param string $kind  Which measurement.
 * @param string $value What was stored.
 * @return string|null
 */
function xxp_size_value( $kind, $value ) {
	$value = trim( (string) $value );

	if ( '' === $value ) {
		return null;
	}

	/* the editor's own shorthand for a preset, unpacked */
	if ( preg_match( '/^var:preset\|(spacing|font-size)\|([a-z0-9-]+)$/', $value, $m ) ) {
		return 'var(--wp--preset--' . $m[1] . '--' . $m[2] . ')';
	}

	if ( 'crop' === $kind ) {
		$one = '(left|center|centre|right|top|bottom|-?[0-9]+(\.[0-9]+)?(%|px))';

		return preg_match( '/^' . $one . '( ' . $one . ')?$/i', $value ) ? $value : null;
	}

	/*
	 * A BORDER COLOUR. Answered here because it is neither a length nor a keyword, and the
	 * pixel line below would turn nothing useful into something: a colour arrives as a hex
	 * from the editor's own picker, or as the preset variable when one was chosen from the
	 * palette. Anything else is refused, because this ends up in a style attribute.
	 */
	if ( in_array( $kind, array( 'btc', 'brc', 'bbc', 'blc' ), true ) ) {
		if ( preg_match( '/^var:preset\|color\|([a-z0-9-]+)$/', $value, $m ) ) {
			return 'var(--wp--preset--color--' . $m[1] . ')';
		}

		$ok = preg_match( '/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $value )
			|| preg_match( '/^var[(]--wp--preset--color--[a-z0-9-]+[)]$/', $value )
			|| preg_match( '/^(currentColor|transparent)$/i', $value );

		return $ok ? $value : null;
	}

	/* And a border STYLE: the three the editor offers, plus the one that takes it off. */
	if ( in_array( $kind, array( 'bts', 'brs', 'bbs', 'bls' ), true ) ) {
		return preg_match( '/^(none|solid|dashed|dotted|double)$/', $value ) ? $value : null;
	}

	/*
	 * `gap` is two properties in one word — the row's and the column's — and a design that
	 * wants 46 down and nothing across has to be able to say so. This checked a single value
	 * and refused the pair in silence, so a `gap` of "28px 20px" written into a pattern set
	 * nothing at all and the block kept the theme's default while the panel showed the pair.
	 */
	if ( 'gap' === $kind && preg_match( '/\s/', $value ) ) {
		$pair = preg_split( '/\s+/', $value, -1, PREG_SPLIT_NO_EMPTY );

		if ( 2 !== count( $pair ) ) {
			return null;
		}

		$row = xxp_size_value( 'gap', $pair[0] );
		$col = xxp_size_value( 'gap', $pair[1] );

		return ( null === $row || null === $col ) ? null : $row . ' ' . $col;
	}

	/*
	 * Grow and shrink are RATIOS, not lengths, and they have to be answered before the
	 * line below — which turns a bare number into pixels and would have made a grow of
	 * 1.7 into `1.7px`, a value flex-grow refuses, so the block would have silently kept
	 * its default while the panel showed 1.7.
	 *
	 * Negative is not a ratio; `0` is meaningful for both and is kept.
	 */
	if ( 'grow' === $kind || 'shrink' === $kind ) {
		return preg_match( '/^\d+(\.\d+)?$/', $value ) ? $value : null;
	}

	/*
	 * Counts, not lengths, and they have to be answered before the pixel line below for
	 * the same reason: `3px` is not a column count and not an order, and the block would
	 * keep its default while the panel showed the number.
	 *
	 * `order` takes a negative — that is how something is moved in front of everything
	 * else; a column count does not.
	 */
	if ( 'cols' === $kind ) {
		return preg_match( '/^[1-9]\d*$/', $value ) ? $value : null;
	}

	if ( 'order' === $kind ) {
		return preg_match( '/^-?\d+$/', $value ) ? $value : null;
	}

	/*
	 * Which columns of a grid a block spans — `3 / -1`, `1 / -1`, `span 2`. A line NUMBER,
	 * so it is answered before the pixel line below for the same reason as the two above.
	 * `-1` means the last line, which is how a block is told to run to the end of the row
	 * whatever the column count is; the footer's sponsors panel is written that way.
	 */
	/* A stacking number, not a length — before the pixel line below, like the counts above. */
	if ( 'z' === $kind ) {
		return preg_match( '/^-?\d+$/', $value ) ? $value : null;
	}

	/*
	 * Opacity is a FRACTION, and it has to be answered before the pixel line too: `0.8px`
	 * is not an opacity, so the block would have gone on at full strength while the panel
	 * showed 0.8. Zero is meaningful and is kept; anything above 1 is refused rather than
	 * clamped, because a 2 in the sidebar means somebody typed a percentage.
	 */
	if ( 'op' === $kind ) {
		return preg_match( '/^(0(\.\d+)?|1(\.0+)?)$/', $value ) ? $value : null;
	}

	/*
	 * An aspect ratio is two numbers around a slash — `3 / 2`, `16 / 9` — or one number,
	 * or `auto`. Answered before the pixel line below for the same reason as the counts:
	 * `3px` is not a ratio, and the block would have kept its natural height while the
	 * panel showed 3.
	 */
	if ( 'ar' === $kind ) {
		return preg_match( '/^(auto|\d+(\.\d+)?( ?\/ ?\d+(\.\d+)?)?)$/', $value ) ? $value : null;
	}

	if ( 'gcol' === $kind ) {
		return preg_match( '/^(-?\d+|span \d+|auto)( \/ (-?\d+|span \d+|auto))?$/', $value ) ? $value : null;
	}

	/* a bare number is what somebody meant in pixels */
	if ( preg_match( '/^-?\d+(\.\d+)?$/', $value ) ) {
		$value .= 'px';
	}

	$unit = '(px|%|rem|em|vw|vh|svh|dvh|vmin|vmax|ch)';
	$word = 'auto|none|fit-content|max-content|min-content';
	$fn   = '(calc|clamp|min|max)';

	$ok = preg_match( '/^-?[0-9]+([.][0-9]+)?' . $unit . '$/', $value )
		|| preg_match( '/^(' . $word . ')$/', $value )
		|| preg_match( '/^var[(]--[a-z0-9-]+[)]$/i', $value )
		|| ( preg_match( '/^' . $fn . '[(][-+*\/, ().0-9a-z%]+[)]$/i', $value )
			&& false === stripos( $value, 'url' ) );

	return $ok ? $value : null;
}

/**
 * The custom properties that carry a block's values, only for what is set.
 *
 * @param array $size What the panel holds.
 * @return string[] Declarations.
 */
function xxp_size_properties( $size ) {
	$out = array();

	foreach ( array_keys( xxp_panel_breakpoints() ) as $where ) {
		$where = (string) $where;

		if ( empty( $size[ $where ] ) || ! is_array( $size[ $where ] ) ) {
			continue;
		}

		foreach ( xxp_layout_kinds() as $kind => $pair ) {
			$value = isset( $size[ $where ][ $kind ] ) ? trim( (string) $size[ $where ][ $kind ] ) : '';

			if ( '' !== $value && in_array( $value, $pair[1], true ) ) {
				$out[] = '--xxp-' . $kind . '-' . $where . ':' . $value;
			}
		}

		foreach ( array_keys( xxp_size_kinds() ) as $kind ) {
			if ( ! isset( $size[ $where ][ $kind ] ) ) {
				continue;
			}

			$value = xxp_size_value( $kind, $size[ $where ][ $kind ] );

			if ( null !== $value ) {
				$out[] = '--xxp-' . $kind . '-' . $where . ':' . $value;
			}
		}
	}

	return $out;
}

/**
 * Put the sizes and the arrival on to the block as it renders.
 *
 * The tag processor, because the block's wrapper is the first tag and a class
 * and a style may already be there.
 *
 * @param string $html  Rendered block.
 * @param array  $block Parsed block.
 * @return string
 */
function xxp_supports_render( $html, $block ) {
	if ( '' === trim( (string) $html ) ) {
		return $html;
	}

	/*
	 * A post template renders once per post through this same filter, with the
	 * template's own attributes each time — a value written here would land on
	 * every card instead of once on the list. Its wrapper is drawn elsewhere.
	 *
	 * `core/null` IS that second pass. `render_block_core_post_template()` renames
	 * its own parsed block to `core/null` before rendering the inner blocks for each
	 * post (wp-includes/blocks/post-template.php:112) so the template cannot recurse
	 * into itself — and the rename is exactly what carried the template's attributes
	 * past the two names above. Measured on /resources/ 14 Oct: every recording's
	 * card and the NOTES panel arrived with the LIST's `dir`, `align`, `gap` and `h`
	 * appended to their own style attribute, the later value winning, so a card laid
	 * out as a row came out as a column and every gap on the page collapsed to the
	 * list's `0px`. Nothing in the markup showed it; the attribute was duplicated.
	 *
	 * `core/null` is produced by nothing else — core uses the name only here and in
	 * the comment template — so the guard is exact.
	 */
	if ( in_array( $block['blockName'] ?? '', array( 'core/post-template', 'core/comment-template', 'core/null' ), true ) ) {
		return $html;
	}

	$motion = $block['attrs']['xxpMotion'] ?? null;
	$size   = $block['attrs']['xxpSize'] ?? null;

	$classes = is_array( $motion ) ? xxp_motion_classes( $motion ) : array();
	$props   = array_merge(
		is_array( $size ) ? xxp_size_properties( $size ) : array(),
		is_array( $motion ) ? xxp_motion_properties( $motion ) : array()
	);

	if ( ! $classes && ! $props ) {
		return $html;
	}

	$tags = new WP_HTML_Tag_Processor( $html );

	if ( ! $tags->next_tag() ) {
		return $html;
	}

	foreach ( $classes as $one ) {
		$tags->add_class( $one );
	}

	if ( $props ) {
		$style = trim( (string) $tags->get_attribute( 'style' ) );
		$style = '' === $style ? '' : rtrim( $style, ';' ) . ';';

		$tags->set_attribute( 'style', $style . implode( ';', $props ) );
	}

	return $tags->get_updated_html();
}
add_filter( 'render_block', 'xxp_supports_render', 20, 2 );

/**
 * The parts of the design a block is, handed to core as its class before it
 * renders.
 *
 * "Additional CSS class(es)" stays empty on every block. The one-off anatomy a
 * section needs travels in `xxpParts` instead and is put where core expects a
 * class at render. Through `render_block_data`, not by editing the finished
 * HTML: a post template renders once per post through `render_block`, and a
 * class added there lands on every card.
 *
 * @param array $block Parsed block.
 * @return array
 */
function xxp_parts_as_class( $block ) {
	$parts = $block['attrs']['xxpParts'] ?? null;
	$class = (string) ( $block['attrs']['className'] ?? '' );

	if ( ( ! is_array( $parts ) || ! $parts ) && false === strpos( $class, 'is-style-' ) ) {
		return $block;
	}

	$words = xxp_style_words( $class );

	foreach ( is_array( $parts ) ? $parts : array() as $one ) {
		if ( ! is_string( $one ) ) {
			continue;
		}

		/* one part may be several words: a class and its modifier */
		foreach ( preg_split( '/\s+/', $one, -1, PREG_SPLIT_NO_EMPTY ) as $word ) {
			if ( preg_match( '/^[a-z][a-z0-9-]*$/', $word ) && ! in_array( $word, $words, true ) ) {
				$words[] = $word;
			}
		}
	}

	$block['attrs']['className'] = implode( ' ', $words );

	return $block;
}
add_filter( 'render_block_data', 'xxp_parts_as_class' );

/**
 * The panel scripts, and what they need to know.
 *
 * @return void
 */
function xxp_dimensions_editor() {
	wp_enqueue_script(
		'xxp-dimensions',
		get_theme_file_uri( 'upqode-panel/assets/dimensions.js' ),
		array( 'wp-hooks', 'wp-element', 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-compose', 'wp-i18n' ),
		xxp_panel_ver( 'upqode-panel/assets/dimensions.js' ),
		true
	);

	$layout = xxp_layout_kinds();
	$groups = array();

	/*
	 * A value that is WORDS inside a group of measurements: the example to show greyed in
	 * the box, and the sentence under it.
	 *
	 * `gcol` was the only one, and it is gone from here: a free box asking for grid lines
	 * is a box most people cannot fill — *"поле grid-column це взагалі не зрозуміло"* — so
	 * it is now a start and a width, and the panel writes the lines. See `GridColumnRow`.
	 */
	$text_kinds = array();

	/*
	 * And a sentence under a field that is NOT words — a number whose name cannot carry
	 * the whole truth. `columns` and the column width below it are the two halves of one
	 * `repeat()`, so neither is `grid-template-columns` on its own and the sentence is
	 * where that gets said.
	 */
	$help_kinds = array(
		'cols' => __( 'With the width below, this is grid-template-columns: repeat(columns, width).', 'theme-textdomain' ),
	);

	foreach ( xxp_size_groups() as $key => $group ) {
		$kinds = array();

		foreach ( $group['kinds'] as $kind => $label ) {
			$kinds[] = array(
				'key'   => $kind,
				'label' => $label,
				'words' => isset( $layout[ $kind ] ) ? $layout[ $kind ][1] : null,
				/*
				 * The plain-English name of each word, where there is one. A kind that has
				 * these is drawn as a dropdown; a kind without them has icons in the JS and
				 * keeps them. Nothing has both, and nothing has neither — which is what the
				 * blank buttons were: words with neither a picture nor a name.
				 */
				'names' => isset( $layout[ $kind ][2] ) ? $layout[ $kind ][2] : null,
				/*
				 * A RATIO, not a measurement. Grow and shrink are plain numbers and the
				 * field must not offer px — the panel drew them with the px/auto buttons
				 * every other measurement has, which invites a value the validator then
				 * refuses in silence: `1.7px` is not a flex-grow, so the block keeps its
				 * default while the sidebar shows 1.7px.
				 */
				/*
				 * A plain NUMBER, not a measurement — no px, no auto. A ratio, a column
				 * count and an order are all counted, not measured, and the generic field
				 * would offer units that the validator then refuses in silence.
				 */
				/*
				 * Plain numbers, drawn as a number field rather than the px/auto unit
				 * control — the same trap the flex ratios hit, where the control offered to
				 * write `50px` into a property that ignores it and the panel went on showing
				 * 50 while nothing applied.
				 */
				'ratio' => in_array( $kind, array( 'grow', 'shrink', 'cols', 'order', 'z', 'op' ), true ),
				/* and the third kind: words, with its own example and sentence */
				'text'  => isset( $text_kinds[ $kind ] ),
				'hint'  => $text_kinds[ $kind ][0] ?? null,
				'help'  => $text_kinds[ $kind ][1] ?? ( $help_kinds[ $kind ] ?? null ),
			);
		}

		$groups[] = array(
			'key'     => $key,
			'label'   => $group['label'],
			'sides'   => $group['sides'] ?? null,
			'choices' => ! empty( $group['choices'] ),
			'steps'   => ! empty( $group['steps'] ),
			/* a group whose value is words has to say so, or the panel files it with
			   the measurements and draws a box that counts pixels */
			'words'   => ! empty( $group['words'] ),
			'toggle'  => ! empty( $group['toggle'] ),
			'blocks'  => $group['blocks'] ?? null,
			/* the sentence under the field and the greyed example in it, per group —
			   written here so one renderer can serve two groups without either of them
			   borrowing the other's words */
			'help'    => $group['help'] ?? null,
			'hint'    => $group['hint'] ?? null,
			'kinds'   => $kinds,
		);
	}

	wp_localize_script(
		'xxp-dimensions',
		'xxpPanel',
		array(
			'breakpoints'  => xxp_panel_breakpoints_for_js(),
			'groups'       => $groups,
			/* where each of those is drawn — see xxp_panel_sections() */
			'sections'     => xxp_panel_sections(),
			'gridWidths'   => xxp_panel_grid_widths(),
			'sizing'       => array_map(
				static function ( $preset ) {
					return array(
						'label'  => $preset[0],
						'writes' => $preset[1],
					);
				},
				xxp_panel_sizing()
			),
			'canEditTheme' => current_user_can( 'edit_theme_options' ),
			'styles'       => array_map(
				static function ( $style ) {
					return array(
						'word' => $style['word'],
						'name' => $style['name'],
					);
				},
				xxp_block_styles()
			),
		)
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_dimensions_editor' );
