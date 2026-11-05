<?php
/**
 * UPQODE Animations — how a block arrives, chosen in its sidebar.
 *
 *   Fade in on load    `xxp-rise`            plays as the page opens
 *   Fade in on scroll  `xxp-reveal`          plays when it enters the window
 *   Line draws itself  `xxp-reveal xxp-line` a rule that grows from its centre
 *   Zoom in on load    `xxp-zoom`            a picture that settles into place
 *
 * Plus a delay and a step (each card in a row waits that much longer than the
 * one before). The distance, duration and easing are the design's and live as
 * custom properties at the top of panel.css — take them from the source.
 *
 * Hover is deliberately not here. A hover is a state, not an arrival: it is a
 * block style (see block-styles.php).
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/**
 * The classes that play a block's arrival.
 *
 * @param array $motion What the panel holds.
 * @return string[]
 */
function xxp_motion_classes( $motion ) {
	$says = array(
		'rise'   => array( 'xxp-rise' ),
		'reveal' => array( 'xxp-reveal' ),
		'line'   => array( 'xxp-reveal', 'xxp-line' ),
		'zoom'   => array( 'xxp-zoom' ),
	);

	$kind = isset( $motion['kind'] ) ? (string) $motion['kind'] : '';

	if ( ! isset( $says[ $kind ] ) ) {
		return array();
	}

	$classes = $says[ $kind ];
	$delay   = isset( $motion['delay'] ) ? absint( $motion['delay'] ) : 0;
	$stagger = isset( $motion['stagger'] ) ? absint( $motion['stagger'] ) : 0;

	if ( $delay > 0 ) {
		$classes[] = 'xxp-d-' . $delay;
	}

	if ( $stagger > 0 ) {
		$classes[] = 'xxp-stagger-' . $stagger;
	}

	return $classes;
}

/**
 * The delay as a custom property, so a load arrival can wait any number of
 * milliseconds without a class per value in the stylesheet.
 *
 * @param array $motion What the panel holds.
 * @return string[]
 */
function xxp_motion_properties( $motion ) {
	$delay = isset( $motion['delay'] ) ? absint( $motion['delay'] ) : 0;

	return $delay > 0 && isset( $motion['kind'] ) ? array( '--xxp-delay:' . $delay . 'ms' ) : array();
}

/*
 * `xxp_motion_from_classes()` was here and is gone — 15 Oct.
 *
 * It read the classes back the other way, to move a block that still carried its arrival as
 * `xxp-rise xxp-d-240` into the panel. Nothing ever called it, and nothing ever will:
 * no block in this theme carried an arrival as a class, because until 15 Oct no block
 * carried an arrival at all. The migration it was written for had nothing to migrate.
 */

/**
 * The script that plays the scroll arrival.
 *
 * @return void
 */
function xxp_motion_script() {
	wp_enqueue_script(
		'xxp-motion',
		get_theme_file_uri( 'upqode-panel/assets/motion.js' ),
		array(),
		xxp_panel_ver( 'upqode-panel/assets/motion.js' ),
		array(
			'in_footer' => true,
			'strategy'  => 'defer',
		)
	);
}
add_action( 'wp_enqueue_scripts', 'xxp_motion_script' );

/**
 * Arm the reveal's first frame, in the head.
 *
 * The hidden start state lives in panel.css so it applies before the first
 * paint — otherwise the page paints finished, drops to nothing when the footer
 * script runs, and rises: a flinch on every load. It hangs off a class this
 * puts on <html>:
 *
 *   - only where IntersectionObserver exists, the one thing motion.js needs;
 *   - never when the visitor asked for reduced motion;
 *   - taken off after three seconds if motion.js never announced itself, so a
 *     script that fails to load costs an animation and not the page.
 *
 * The editor canvas runs no theme script and never gets the class, so it shows
 * every block in its finished state.
 *
 * @return void
 */
function xxp_motion_gate() {
	$js = "(function(){var r=document.documentElement;" .
		"if(!('IntersectionObserver' in window)||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;" .
		"r.classList.add('xxp-reveal-ready');" .
		"setTimeout(function(){if(!window.xxpReveal)r.classList.remove('xxp-reveal-ready');},3000);})();";

	echo '<script>' . $js . '</script>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput -- a literal.
}
add_action( 'wp_head', 'xxp_motion_gate', 1 );
