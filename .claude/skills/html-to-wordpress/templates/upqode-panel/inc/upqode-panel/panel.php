<?php
/**
 * The UPQODE panel — loader.
 *
 * Everything a designer changes on this site is changed through the panel:
 *
 *   - UPQODE Dimensions, in every block's Settings tab: padding, margin, block
 *     spacing, width, height, layout, crop and visibility, at seven screens;
 *   - UPQODE Animations, beside it: how the block arrives;
 *   - Styles → Typography: size, line height, letter spacing and weight for
 *     every element, at the same seven screens;
 *   - Styles → Colors: the palette is the colour tokens;
 *   - Styles → Form fields and Styles → Export / Import.
 *
 * What the panel cannot say is a block style (see block-styles.php). Nothing
 * here is project-specific; the design's own numbers live in the theme's tokens
 * file, which this reads as the defaults and never writes.
 *
 * Installed by `install.js` from the html-to-wordpress skill. Required once from
 * functions.php.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/*
 * Where the design's tokens are, relative to the theme, and the style handle
 * they are enqueued under. Typography and Form fields read their defaults from
 * this file and print their overrides after this handle. Change them with the
 * filters below rather than here, so a re-install does not undo it.
 */
if ( ! defined( 'XXP_PANEL_TOKENS_FILE' ) ) {
	define( 'XXP_PANEL_TOKENS_FILE', 'assets/css/tokens.css' );
}

if ( ! defined( 'XXP_PANEL_TOKENS_HANDLE' ) ) {
	define( 'XXP_PANEL_TOKENS_HANDLE', 'xxp-tokens' );
}

/**
 * A theme file's version, for cache busting.
 *
 * @param string $rel Path relative to the theme.
 * @return string
 */
function xxp_panel_ver( $rel ) {
	$path = get_theme_file_path( $rel );

	return file_exists( $path ) ? (string) filemtime( $path ) : wp_get_theme()->get( 'Version' );
}

/**
 * The tokens file, as text. Read once per request.
 *
 * @return string
 */
function xxp_panel_tokens_css() {
	static $css = null;

	if ( null === $css ) {
		$path = get_theme_file_path( apply_filters( 'xxp_panel_tokens_file', XXP_PANEL_TOKENS_FILE ) );
		$css  = is_readable( $path ) ? (string) file_get_contents( $path ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions
	}

	return $css;
}

/**
 * The seven screens, widest first.
 *
 * The designer's table, and the only seven queries the theme ever writes.
 * `base` is 992–1279 and has no query: a value set there is in force at every
 * width until another screen says otherwise. The three above are min-width and
 * the three below are max-width, so a value travels outward from the middle —
 * the Webflow cascade, and nothing but the cascade.
 *
 * Each entry: short name, label, the screen it inherits from, its cascading
 * query, and its exact window (used only by "Hide on this screen", which must
 * not cascade).
 *
 * @return array<string, array{short:string,label:string,inherits:string,query:string,window:string}>
 */
function xxp_panel_breakpoints() {
	return array(
		'1920' => array(
			'short'    => 'XXL',
			'label'    => __( '1920px and wider', 'theme-textdomain' ),
			'inherits' => '1440',
			'query'    => '(min-width: 1920px)',
			'window'   => '(min-width: 1920px)',
		),
		'1440' => array(
			'short'    => 'XL',
			'label'    => __( '1440–1919px', 'theme-textdomain' ),
			'inherits' => '1280',
			'query'    => '(min-width: 1440px)',
			'window'   => '(min-width: 1440px) and (max-width: 1919px)',
		),
		'1280' => array(
			'short'    => 'L',
			'label'    => __( '1280–1439px', 'theme-textdomain' ),
			'inherits' => 'base',
			'query'    => '(min-width: 1280px)',
			'window'   => '(min-width: 1280px) and (max-width: 1439px)',
		),
		'base' => array(
			'short'    => 'M',
			'label'    => __( '992–1279px', 'theme-textdomain' ),
			'inherits' => '',
			'query'    => '',
			'window'   => '(min-width: 992px) and (max-width: 1279px)',
		),
		'991'  => array(
			'short'    => 'S',
			'label'    => __( '768–991px', 'theme-textdomain' ),
			'inherits' => 'base',
			'query'    => '(max-width: 991px)',
			'window'   => '(min-width: 768px) and (max-width: 991px)',
		),
		'767'  => array(
			'short'    => 'XS',
			'label'    => __( '568–767px', 'theme-textdomain' ),
			'inherits' => '991',
			'query'    => '(max-width: 767px)',
			'window'   => '(min-width: 568px) and (max-width: 767px)',
		),
		'567'  => array(
			'short'    => 'XXS',
			'label'    => __( '360–567px', 'theme-textdomain' ),
			'inherits' => '767',
			'query'    => '(max-width: 567px)',
			'window'   => '(max-width: 567px)',
		),
	);
}

/**
 * The screens as a list the editor can read in order.
 *
 * A list, not a map: JavaScript puts integer-like keys first and in numeric
 * order, so `991`, `767`, `567` would come out ahead of `base`. And every key
 * as a string — PHP turns `'1440'` into the integer 1440, and a panel comparing
 * it with the string in `inherits` stopped its chain after one step.
 *
 * @return array<int, array>
 */
function xxp_panel_breakpoints_for_js() {
	$out = array();

	foreach ( xxp_panel_breakpoints() as $key => $one ) {
		$out[] = array(
			'key'      => (string) $key,
			'short'    => $one['short'],
			'label'    => $one['label'],
			'inherits' => (string) $one['inherits'],
		);
	}

	return $out;
}

/**
 * The stylesheet the band rules, the hide windows and the arrivals live in.
 * Loaded on the page and in the editor canvas alike.
 *
 * @return void
 */
function xxp_panel_block_assets() {
	wp_enqueue_style(
		'xxp-panel',
		get_theme_file_uri( 'upqode-panel/assets/panel.css' ),
		array(),
		xxp_panel_ver( 'upqode-panel/assets/panel.css' )
	);
}
add_action( 'enqueue_block_assets', 'xxp_panel_block_assets' );

/**
 * A handle the overrides are printed after.
 *
 * The overrides must come after the design's tokens, so they hang off a handle
 * of their own that depends on the tokens handle — but only when that handle
 * exists: WordPress silently drops a style whose dependency is not registered,
 * and the overrides would vanish with no error.
 *
 * @return string The handle.
 */
function xxp_panel_overrides_handle() {
	$tokens = apply_filters( 'xxp_panel_tokens_handle', XXP_PANEL_TOKENS_HANDLE );

	if ( ! wp_style_is( 'xxp-panel-overrides', 'registered' ) ) {
		wp_register_style(
			'xxp-panel-overrides',
			false,
			wp_style_is( $tokens, 'registered' ) ? array( $tokens ) : array(),
			xxp_panel_ver( apply_filters( 'xxp_panel_tokens_file', XXP_PANEL_TOKENS_FILE ) )
		);
	}

	wp_enqueue_style( 'xxp-panel-overrides' );

	return 'xxp-panel-overrides';
}

/**
 * Every override the Styles screens hold, as one block of CSS.
 *
 * @param string $scope ':root' on the page; the canvas wrapper in the editor.
 * @return string
 */
function xxp_panel_overrides_css( $scope = ':root' ) {
	return xxp_colors_css()
		. xxp_type_scale_as_css()
		. xxp_field_styles_as_css( ':root' === $scope ? ':root:root' : $scope );
}

/**
 * On the page: after the tokens.
 *
 * @return void
 */
function xxp_panel_print_overrides() {
	$css = xxp_panel_overrides_css();

	if ( '' !== $css ) {
		wp_add_inline_style( xxp_panel_overrides_handle(), $css );
	}
}
add_action( 'wp_enqueue_scripts', 'xxp_panel_print_overrides', 100 );

/**
 * In the editor canvas, where the same overrides have to show.
 *
 * The field skin is scoped to the canvas wrapper, never `:root`: the editor's
 * own sidebar is built from inputs too, and a field background set for the site
 * would repaint WordPress's controls.
 *
 * @return void
 */
function xxp_panel_print_editor_overrides() {
	if ( ! is_admin() ) {
		return;
	}

	$css = xxp_colors_css()
		. xxp_type_scale_as_css()
		. xxp_field_styles_as_css( '.editor-styles-wrapper.editor-styles-wrapper' );

	if ( '' !== $css ) {
		wp_add_inline_style( 'xxp-panel', $css );
	}
}
add_action( 'enqueue_block_assets', 'xxp_panel_print_editor_overrides', 100 );

/**
 * The sidebar chrome every panel shares. One handle, one file.
 *
 * @return void
 */
function xxp_panel_editor_chrome() {
	wp_enqueue_style(
		'xxp-panel-editor',
		get_theme_file_uri( 'upqode-panel/assets/editor-panels.css' ),
		array(),
		xxp_panel_ver( 'upqode-panel/assets/editor-panels.css' )
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_panel_editor_chrome' );


/**
 * A value on its way into a stylesheet, checked against what it is supposed to be.
 *
 * Anna's reviewer, 19 Oct: *"The UPQODE panel options are saved without sanitization and
 * outputted directly into CSS."* Half right, and the half that was right is this one.
 *
 * `dimensions.php` has always run a WHITELIST — units, words, `var()`, the calc family,
 * `url()` refused — and a value that fails it is dropped. The three generators that build
 * `<style>` blocks from the Styles screens did something weaker: a known token, and then
 * `preg_match( '/[<>{};]/' )`. A blacklist answers the question "is this one of the things
 * I thought of", which is the wrong question for anything that ends up in CSS: `url(...)`
 * passes it, and a custom property carrying a `url()` fetches whatever it names from
 * whoever opens the page.
 *
 * Nobody could reach it without `edit_theme_options` — an administrator, who can install a
 * plugin anyway — so this is hardening, not a hole that was open. It is still the
 * difference between a rule that lists what is allowed and one that lists what somebody
 * remembered to forbid.
 *
 * The KINDS are the panel's own, from the field each value belongs to, so the check is as
 * tight as the control that collected it:
 *
 *   color   a hex, an rgb/rgba/hsl/hsla, a named CSS colour, `transparent`, `currentColor`
 *   length  a number with a unit this panel offers, or a bare `0`
 *   number  a plain number — line heights, opacities
 *   weight  100–900, `normal`, `bold`, `lighter`, `bolder`
 *   case    the four `text-transform` words
 *   family  a font stack: names, quotes, commas, spaces
 *
 * `var(--x)` and `calc()`-family expressions are allowed for every kind, because the panel
 * lets a value point at another token — and both are checked for `url`, which is the only
 * way a CSS value reaches out to the network.
 *
 * @param string $xxp_value The stored value.
 * @param string $xxp_kind  color|length|number|weight|case|family.
 * @return string|null The value, or null when it is not what it claims to be.
 */
function xxp_panel_css_value( $xxp_value, $xxp_kind = 'length' ) {
	$xxp_value = trim( (string) $xxp_value );

	if ( '' === $xxp_value ) {
		return null;
	}

	/* Nothing fetches anything, whatever the kind, and nothing closes a rule or an element. */
	if ( preg_match( '/[<>{};@\\\\]/', $xxp_value ) || preg_match( '/url\s*\(|expression\s*\(|image-set\s*\(/i', $xxp_value ) ) {
		return null;
	}

	/* a reference to another token, and arithmetic over them */
	if ( preg_match( '/^var\(\s*--[a-z0-9-]+\s*(,[^()]*)?\)$/i', $xxp_value )
		|| preg_match( '/^(calc|clamp|min|max)\([-+*\/, ().0-9a-z%]+\)$/i', $xxp_value ) ) {
		return $xxp_value;
	}

	$xxp_unit = '(px|%|rem|em|vw|vh|svh|dvh|vmin|vmax|ch|pt|cm|mm|in|q|ex|cap|ic|lh|rlh)';

	switch ( $xxp_kind ) {
		case 'color':
			return (
				preg_match( '/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $xxp_value )
				|| preg_match( '/^(rgb|rgba|hsl|hsla)\(\s*[0-9a-z.%,\/\s]+\)$/i', $xxp_value )
				|| preg_match( '/^(transparent|currentcolor|inherit|[a-z]{3,20})$/i', $xxp_value )
			) ? $xxp_value : null;

		case 'length':
			return (
				preg_match( '/^-?[0-9]+(\.[0-9]+)?' . $xxp_unit . '$/i', $xxp_value )
				|| preg_match( '/^0$/', $xxp_value )
				|| preg_match( '/^(auto|inherit|normal)$/i', $xxp_value )
			) ? $xxp_value : null;

		case 'number':
			return preg_match( '/^-?[0-9]+(\.[0-9]+)?$/', $xxp_value ) ? $xxp_value : null;

		case 'weight':
			return preg_match( '/^([1-9]00|normal|bold|lighter|bolder|inherit)$/i', $xxp_value ) ? $xxp_value : null;

		case 'case':
			return preg_match( '/^(none|uppercase|lowercase|capitalize|inherit)$/i', $xxp_value ) ? $xxp_value : null;

		case 'family':
			return preg_match( '/^[-a-z0-9 ,\'"]+$/i', $xxp_value ) ? $xxp_value : null;
	}

	/* An unknown kind is refused rather than waved through: a kind nobody declared is a
	   field nobody checked. */
	return null;
}

require_once __DIR__ . '/dimensions.php';
require_once __DIR__ . '/animations.php';
require_once __DIR__ . '/block-styles.php';
require_once __DIR__ . '/type-scale.php';
require_once __DIR__ . '/colors.php';
require_once __DIR__ . '/field-styles.php';
require_once __DIR__ . '/styles-transfer.php';
