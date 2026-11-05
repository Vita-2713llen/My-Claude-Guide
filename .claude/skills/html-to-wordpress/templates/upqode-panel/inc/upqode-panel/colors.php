<?php
/**
 * Styles → Colors is the colour tokens.
 *
 * The tokens file writes every colour as
 * `--c-<slug>: var(--wp--preset--color--<slug>, #hex)` — WordPress's variable
 * first, the design's hex behind it — so a colour changed in Styles reaches
 * every use at once, and the file still stands alone where the palette is not
 * printed.
 *
 * Two things do not follow on their own, and this supplies both:
 *
 *   - the channels: `rgba(var(--rgb-navy), .4)` needs `6,28,62`, which CSS
 *     cannot read out of a hex, so `--rgb-<slug>` is worked out here for every
 *     palette colour;
 *   - a colour somebody adds: WordPress gives it a preset and nothing else; this
 *     gives it `--c-<slug>` too, so it is a token the moment it exists.
 *
 * Plus a "New colour" row inside every swatch popover (palette-add.js), so a
 * colour can be made where it is wanted.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/**
 * Every colour the palette holds, slug → value, the later origin winning.
 *
 * Origins are named, not taken whole: asked by path WordPress returns the
 * `default` origin even when `defaultPalette` is off, and taking it would
 * invent tokens for colours nobody is offered.
 *
 * @return array<string, string>
 */
function xxp_palette_entries() {
	$palette = wp_get_global_settings( array( 'color', 'palette' ) );

	if ( ! is_array( $palette ) ) {
		return array();
	}

	if ( isset( $palette[0] ) ) {
		$groups = array( $palette );
	} else {
		$origins = wp_get_global_settings( array( 'color', 'defaultPalette' ) )
			? array( 'default', 'theme', 'custom' )
			: array( 'theme', 'custom' );
		$groups  = array();

		foreach ( $origins as $origin ) {
			if ( isset( $palette[ $origin ] ) ) {
				$groups[] = $palette[ $origin ];
			}
		}
	}

	$out = array();

	foreach ( $groups as $group ) {
		foreach ( (array) $group as $entry ) {
			if ( is_array( $entry ) && ! empty( $entry['slug'] ) ) {
				$out[ (string) $entry['slug'] ] = isset( $entry['color'] ) ? (string) $entry['color'] : '';
			}
		}
	}

	return $out;
}

/**
 * A colour as `r,g,b`, or '' where it has no channels to give.
 *
 * @param string $value Hex, rgb() or rgba().
 * @return string
 */
function xxp_color_channels( $value ) {
	$value = trim( (string) $value );

	if ( '#' === substr( $value, 0, 1 ) ) {
		$hex = substr( $value, 1 );

		if ( 3 === strlen( $hex ) || 4 === strlen( $hex ) ) {
			$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
		}

		if ( strlen( $hex ) < 6 || ! ctype_xdigit( substr( $hex, 0, 6 ) ) ) {
			return '';
		}

		return sprintf( '%d,%d,%d', hexdec( substr( $hex, 0, 2 ) ), hexdec( substr( $hex, 2, 2 ) ), hexdec( substr( $hex, 4, 2 ) ) );
	}

	if ( preg_match( '/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i', $value, $m ) ) {
		return sprintf( '%d,%d,%d', (float) $m[1], (float) $m[2], (float) $m[3] );
	}

	return '';
}

/**
 * The block printed after the tokens.
 *
 * @return string
 */
function xxp_colors_css() {
	$rules = '';

	foreach ( xxp_palette_entries() as $slug => $value ) {
		/*
		 * A token name, and a value checked as the COLOUR it claims to be — see
		 * `xxp_panel_css_value()`, which replaced a list of forbidden characters with a
		 * list of allowed shapes on 19 Oct. An empty value is kept and means "no override":
		 * the rule below then prints the preset on its own.
		 */
		if ( ! preg_match( '/^[a-z0-9-]+$/', $slug ) ) {
			continue;
		}

		if ( '' !== trim( (string) $value ) && null === xxp_panel_css_value( $value, 'color' ) ) {
			continue;
		}

		$rules .= sprintf( '--c-%1$s:var(--wp--preset--color--%1$s%2$s);', $slug, '' === $value ? '' : ',' . $value );

		$rgb = xxp_color_channels( $value );

		if ( '' !== $rgb ) {
			$rules .= sprintf( '--rgb-%s:%s;', $slug, $rgb );
		}
	}

	return '' === $rules ? '' : sprintf( ':root{%s}', $rules );
}

/**
 * The "New colour" row.
 *
 * @return void
 */
function xxp_colors_editor_assets() {
	wp_enqueue_script(
		'xxp-palette-add',
		get_theme_file_uri( 'upqode-panel/assets/palette-add.js' ),
		array( 'wp-components', 'wp-element', 'wp-data', 'wp-core-data', 'wp-i18n' ),
		xxp_panel_ver( 'upqode-panel/assets/palette-add.js' ),
		true
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_colors_editor_assets' );
