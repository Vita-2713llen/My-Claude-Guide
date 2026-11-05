<?php
/**
 * Button variants and other block style variations.
 *
 * Replace theme_prefix_ and the slugs. One entry per variant in the design.
 *
 * Two rules this file exists to enforce:
 *
 * 1. A variant name must not collide with one core already ships.
 *    `is-style-outline` is a built-in button style carrying `border: 2px solid`,
 *    so registering your own of that name silently inherits it. Prefix them.
 * 2. Typography for buttons belongs in theme.json, not here. Core declares
 *    `elements.button.typography` as `inherit` through `:root :where(...)`,
 *    which ties on specificity with a single class — and the tie is settled by
 *    load order, which differs between the front end and the editor canvas.
 *    A theme.json value wins by origin in both. Leave only what a :hover or a
 *    JS state repaints in CSS.
 *
 * @package ThemeName
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The variants in the design.
 *
 * @return array
 */
function theme_prefix_button_styles() {
	return array(
		array(
			'name'  => 'xx-primary',
			'label' => __( 'Primary', 'theme-textdomain' ),
		),
		array(
			'name'  => 'xx-ghost',
			'label' => __( 'Ghost', 'theme-textdomain' ),
		),
	);
}

/**
 * Register them.
 */
function theme_prefix_register_block_styles() {
	foreach ( theme_prefix_button_styles() as $style ) {
		register_block_style( 'core/button', $style );
	}
}
add_action( 'init', 'theme_prefix_register_block_styles' );

/**
 * Fail loudly if a variant name collides with a core one.
 *
 * Call from a build script. A collision does not error — it silently inherits
 * core's declarations, which is far harder to spot than a fatal.
 *
 * @return array Colliding names.
 */
function theme_prefix_check_style_collisions() {
	$core = array( 'outline', 'fill', 'default', 'squared', 'rounded' );
	$hits = array();

	foreach ( theme_prefix_button_styles() as $style ) {
		if ( in_array( $style['name'], $core, true ) ) {
			$hits[] = $style['name'];
		}
	}

	return $hits;
}
