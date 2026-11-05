<?php
/**
 * Registers the theme's navigation block.
 *
 * Require this from functions.php. The two script handles are registered by
 * hand rather than through `file:` paths in block.json, because without a build
 * step nothing generates the dependency list — and a missing `wp-server-side-render`
 * or `wp-data` is the usual reason the block registers on the server, renders on
 * the front end, and shows as an unknown block in the editor.
 *
 * @package ThemeName
 */

/**
 * Render one level.
 *
 * @param int   $parent_id Parent item ID, 0 for the top level.
 * @param array $tree      Grouped items.
 * @param int   $depth     Current depth.
 * @param int   $cols      Mega panel column count.
 * @param string $width    Mega panel width, e.g. "650px".
 * @return string
 */
function theme_prefix_nav_level( $parent_id, $tree, $depth, $cols, $width ) {
	if ( empty( $tree[ $parent_id ] ) ) {
		return '';
	}

	$out = '';

	foreach ( $tree[ $parent_id ] as $item ) {
		$children  = ! empty( $tree[ (int) $item->ID ] );
		$classes   = array( 'theme-prefix-nav-item' );
		$item_cls  = is_array( $item->classes ) ? $item->classes : array();
		$is_mega   = 0 === $depth && in_array( 'mega', $item_cls, true );
		$is_active = ( (int) $item->object_id === (int) get_queried_object_id() );

		if ( $children ) {
			$classes[] = 'has-children';
		}
		if ( $is_mega ) {
			$classes[] = 'is-mega';
		}
		if ( $is_active ) {
			$classes[] = 'is-current';
		}
		foreach ( $item_cls as $extra ) {
			if ( $extra && 'mega' !== $extra ) {
				$classes[] = sanitize_html_class( $extra );
			}
		}

		$out .= '<li class="' . esc_attr( implode( ' ', $classes ) ) . '">';
		$out .= '<a class="theme-prefix-nav-link" href="' . esc_url( $item->url ) . '"';
		if ( $item->target ) {
			$out .= ' target="' . esc_attr( $item->target ) . '" rel="noopener"';
		}
		if ( $is_active ) {
			$out .= ' aria-current="page"';
		}
		$out .= '>' . esc_html( $item->title ) . '</a>';

		if ( $children ) {
			// The toggle is a real button so it works by keyboard and carries
			// its own state. Core's aria-expanded belongs to the overlay and
			// cannot express a closed submenu; this one can.
			$out .= '<button class="theme-prefix-nav-toggle" type="button" aria-expanded="false"';
			$out .= ' aria-label="' . esc_attr( sprintf( __( 'Open %s submenu', 'theme-textdomain' ), $item->title ) ) . '">';
			$out .= '<span class="theme-prefix-nav-chevron" aria-hidden="true"></span>';
			$out .= '</button>';

			$panel_cls   = 'theme-prefix-nav-panel' . ( $is_mega ? ' is-mega' : '' );
			$panel_style = '';
			if ( $is_mega ) {
				$panel_style .= '--theme-prefix-nav-cols:' . (int) $cols . ';';
				if ( $width ) {
					$panel_style .= '--theme-prefix-nav-panel-width:' . esc_attr( $width ) . ';';
				}
			}

			$out .= '<ul class="' . esc_attr( $panel_cls ) . '"';
			if ( $panel_style ) {
				$out .= ' style="' . esc_attr( $panel_style ) . '"';
			}
			$out .= '>';
			$out .= theme_prefix_nav_level( (int) $item->ID, $tree, $depth + 1, $cols, $width );
			$out .= '</ul>';
		}

		$out .= '</li>';
	}

	return $out;
}

/**
 * Register scripts and the block itself.
 */
function theme_prefix_register_nav_block() {
	$dir = get_theme_file_path( 'blocks/nav' );
	$uri = get_theme_file_uri( 'blocks/nav' );

	wp_register_script(
		'theme-prefix-nav-editor',
		$uri . '/editor.js',
		array(
			'wp-blocks',
			'wp-element',
			'wp-block-editor',
			'wp-components',
			'wp-server-side-render', // LOAD-BEARING: without it the canvas renders nothing.
			'wp-data',
			'wp-i18n',
		),
		file_exists( $dir . '/editor.js' ) ? (string) filemtime( $dir . '/editor.js' ) : '1',
		true
	);

	wp_register_script(
		'theme-prefix-nav-view',
		$uri . '/nav.js',
		array(),
		file_exists( $dir . '/nav.js' ) ? (string) filemtime( $dir . '/nav.js' ) : '1',
		true
	);

	register_block_type_from_metadata( $dir );
}
add_action( 'init', 'theme_prefix_register_nav_block' );

/**
 * The menu location the block falls back to when no menu is chosen.
 */
function theme_prefix_register_nav_menus() {
	register_nav_menus(
		array(
			'primary' => __( 'Primary', 'theme-textdomain' ),
		)
	);
}
add_action( 'after_setup_theme', 'theme_prefix_register_nav_menus' );

/**
 * Make the block's own stylesheet load in the editor canvas as well.
 *
 * The canvas runs no theme JavaScript, so any state the script would set does
 * not exist there. Keep every hidden state owned by a class the script adds —
 * see nav.css — and the canvas shows the resting design instead of nothing.
 */
/*
 * Nothing is enqueued here: "style": "file:./nav.css" in block.json is what makes
 * WordPress load the stylesheet on the front end *and* in the canvas. Wiring it
 * for the canvas alone — with add_editor_style() — leaves the front end rendering
 * naked markup: bulleted link lists, every dropdown open, chevrons as squares.
 */
