<?php
/**
 * Styles → Typography, per screen.
 *
 * WordPress holds one value per typography setting and prints it once. The
 * design has seven. So every element screen in Styles → Typography — Text,
 * Headings (All and H1–H6), Button, Caption — carries the same seven icons as
 * UPQODE Dimensions, and under each screen four values: size, line height,
 * letter spacing, weight. Text has a row of three above the icons — Small,
 * Body, Large — each with its own four.
 *
 * Where the numbers live:
 *
 *   - the design is the tokens file (XXP_PANEL_TOKENS_FILE): `--type-h2-size`
 *     and the rest on `:root`, redefined inside the seven queries, from the
 *     source's numbers;
 *   - this panel starts every field empty and shows the file's value in grey;
 *     a field filled in is an override, kept in one option and printed after
 *     the tokens. Clear it and the design comes back.
 *
 * `theme.json` points each element at its tokens (see the README), so a change
 * here reaches every H2 on the site at that screen and no other.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

const XXP_TYPE_SCALE_OPTION = 'xxp_type_scale';

/**
 * The elements the panel edits, and the screen each belongs to in Styles.
 *
 * `heading` is the All tab: the line height, tracking and weight every heading
 * starts from. Each `hN` token defaults to `var(--type-heading-…)` in the
 * tokens file, so a heading reads as the shared one until it is given its own.
 *
 * @return array<string, array{label:string,screen:string}>
 */
function xxp_type_scale_elements() {
	return apply_filters(
		'xxp_type_scale_elements',
		array(
			'heading' => array(
				'label'  => __( 'All headings', 'theme-textdomain' ),
				'screen' => 'heading',
			),
			'h1'      => array(
				'label'  => 'H1',
				'screen' => 'heading',
			),
			'h2'      => array(
				'label'  => 'H2',
				'screen' => 'heading',
			),
			'h3'      => array(
				'label'  => 'H3',
				'screen' => 'heading',
			),
			'h4'      => array(
				'label'  => 'H4',
				'screen' => 'heading',
			),
			'h5'      => array(
				'label'  => 'H5',
				'screen' => 'heading',
			),
			'h6'      => array(
				'label'  => 'H6',
				'screen' => 'heading',
			),
			'body'    => array(
				'label'  => __( 'Body', 'theme-textdomain' ),
				'screen' => 'text',
			),
			'text-sm' => array(
				'label'  => __( 'Small', 'theme-textdomain' ),
				'screen' => 'text',
			),
			'text-lg' => array(
				'label'  => __( 'Large', 'theme-textdomain' ),
				'screen' => 'text',
			),
			'button'  => array(
				'label'  => __( 'Button', 'theme-textdomain' ),
				'screen' => 'button',
			),
			'caption' => array(
				'label'  => __( 'Caption', 'theme-textdomain' ),
				'screen' => 'caption',
			),
		)
	);
}

/**
 * The four values each element owns.
 *
 * @return array<string, array{label:string,unit:string}>
 */
function xxp_type_scale_properties() {
	return array(
		'size' => array(
			'label' => __( 'Size', 'theme-textdomain' ),
			'unit'  => 'px',
		),
		'lh'   => array(
			'label' => __( 'Line height', 'theme-textdomain' ),
			'unit'  => '',
		),
		'ls'   => array(
			'label' => __( 'Letter spacing', 'theme-textdomain' ),
			'unit'  => 'em',
		),
		'fw'   => array(
			'label' => __( 'Weight', 'theme-textdomain' ),
			'unit'  => '',
		),
	);
}

/**
 * Every token the panel may set, with its element, property and label.
 *
 * `heading` has no size: every heading has its own.
 *
 * @return array<string, array{element:string,prop:string,label:string,screen:string,unit:string}>
 */
function xxp_type_scale_tokens() {
	$out = array();

	foreach ( xxp_type_scale_elements() as $element => $meta ) {
		foreach ( xxp_type_scale_properties() as $prop => $pmeta ) {
			if ( 'heading' === $element && 'size' === $prop ) {
				continue;
			}

			$out[ 'type-' . $element . '-' . $prop ] = array(
				'element' => $element,
				'prop'    => $prop,
				'label'   => $pmeta['label'],
				'screen'  => $meta['screen'],
				'unit'    => $pmeta['unit'],
			);
		}
	}

	return $out;
}

/**
 * The tokens file, split by screen: band → token → value, as written.
 *
 * The file must use the seven queries exactly as panel.php names them; a block
 * under any other query belongs to no screen and is not read. Several blocks
 * with the same query are read together.
 *
 * @return array<string, array<string, string>>
 */
function xxp_panel_tokens_by_band() {
	static $out = null;

	if ( null !== $out ) {
		return $out;
	}

	$css    = preg_replace( '#/\*.*?\*/#s', '', xxp_panel_tokens_css() );
	$out    = array();
	$by_q   = array();
	$base   = '';
	$cursor = 0;
	$len    = strlen( $css );

	foreach ( xxp_panel_breakpoints() as $band => $meta ) {
		$out[ (string) $band ] = array();

		if ( '' !== $meta['query'] ) {
			$by_q[ preg_replace( '/\s+/', '', $meta['query'] ) ] = (string) $band;
		}
	}

	while ( $cursor < $len ) {
		$at = strpos( $css, '@media', $cursor );

		if ( false === $at ) {
			$base .= substr( $css, $cursor );
			break;
		}

		$base .= substr( $css, $cursor, $at - $cursor );
		$open  = strpos( $css, '{', $at );

		if ( false === $open ) {
			break;
		}

		$query = preg_replace( '/\s+/', '', trim( substr( $css, $at + 6, $open - $at - 6 ) ) );
		$depth = 1;
		$i     = $open + 1;

		while ( $i < $len && $depth > 0 ) {
			if ( '{' === $css[ $i ] ) {
				++$depth;
			} elseif ( '}' === $css[ $i ] ) {
				--$depth;
			}
			++$i;
		}

		if ( isset( $by_q[ $query ] ) ) {
			$out[ $by_q[ $query ] ] = array_merge( $out[ $by_q[ $query ] ], xxp_panel_declarations( substr( $css, $open + 1, $i - $open - 2 ) ) );
		}

		$cursor = $i;
	}

	$out['base'] = xxp_panel_declarations( $base );

	return $out;
}

/**
 * Custom property declarations in a chunk of CSS.
 *
 * @param string $chunk CSS.
 * @return array<string, string> Name without dashes → value.
 */
function xxp_panel_declarations( $chunk ) {
	$found = array();

	if ( preg_match_all( '/--([a-z0-9-]+)\s*:\s*([^;{}]+);/i', $chunk, $hits, PREG_SET_ORDER ) ) {
		foreach ( $hits as $hit ) {
			$found[ $hit[1] ] = trim( $hit[2] );
		}
	}

	return $found;
}

/**
 * The overrides, as stored: band → token → value.
 *
 * An option nobody has written comes back as an empty array, which JSON keeps
 * no string keys on — anything that is not a map means nothing is set.
 *
 * @return array<string, array<string, string>>
 */
function xxp_type_scale_values() {
	$saved = get_option( XXP_TYPE_SCALE_OPTION, array() );

	return is_array( $saved ) ? $saved : array();
}

/**
 * What the design says on each screen, for the grey placeholders.
 *
 * What a screen shows has to be what applies there, not only what that screen
 * restates: a phone block that redefines four sizes says nothing about body
 * copy, and the body field there must still show the body's number. So each
 * screen is filled from the one it inherits, and a token that stands for
 * another (`var(--type-heading-lh)`) is shown as what it comes to.
 *
 * @return array<string, array<string, string>>
 */
function xxp_type_scale_defaults() {
	static $out = null;

	if ( null !== $out ) {
		return $out;
	}

	$raw    = xxp_panel_tokens_by_band();
	$tokens = array_keys( xxp_type_scale_tokens() );
	$out    = array();

	/* base first, then outward, so every screen can borrow from one already done */
	$order = array( 'base', '1280', '1440', '1920', '991', '767', '567' );
	$bps   = xxp_panel_breakpoints();

	foreach ( $order as $band ) {
		$out[ $band ] = array();
		$from         = $bps[ $band ]['inherits'];

		foreach ( $tokens as $token ) {
			if ( isset( $raw[ $band ][ $token ] ) ) {
				$out[ $band ][ $token ] = $raw[ $band ][ $token ];
			} elseif ( '' !== $from && isset( $out[ $from ][ $token ] ) ) {
				$out[ $band ][ $token ] = $out[ $from ][ $token ];
			}
		}
	}

	foreach ( $out as $band => $values ) {
		foreach ( $values as $token => $value ) {
			for ( $hop = 0; $hop < 4 && preg_match( '/^var\(\s*--([a-z0-9-]+)\s*(?:,[^)]*)?\)$/i', $value, $m ); $hop++ ) {
				$points = $m[1];

				if ( isset( $out[ $band ][ $points ] ) ) {
					$value = $out[ $band ][ $points ];
				} elseif ( isset( $raw[ $band ][ $points ] ) ) {
					$value = $raw[ $band ][ $points ];
				} elseif ( isset( $raw['base'][ $points ] ) ) {
					$value = $raw['base'][ $points ];
				} else {
					break;
				}
			}

			$out[ $band ][ $token ] = $value;
		}
	}

	return $out;
}

/**
 * The overrides as CSS, in the shape the tokens file is written in.
 *
 * Base without a query, the rest outward from it — the order is the cascade.
 *
 * @return string
 */
function xxp_type_scale_as_css() {
	$values = xxp_type_scale_values();
	$known  = xxp_type_scale_tokens();
	$out    = '';

	foreach ( array( 'base', '1280', '1440', '1920', '991', '767', '567' ) as $band ) {
		$rules = '';

		foreach ( (array) ( $values[ $band ] ?? array() ) as $token => $value ) {
			$value = trim( (string) $value );

			/*
			 * Only tokens the panel knows, and only a value of the KIND that token holds —
			 * the property's own `unit` says which, so a size is a length, a line height is
			 * a number and a weight is a weight. 19 Oct, replacing a list of forbidden
			 * characters; see `xxp_panel_css_value()`.
			 */
			if ( '' === $value || ! isset( $known[ $token ] ) ) {
				continue;
			}

			$kind = 'length';

			if ( 'fw' === $known[ $token ]['prop'] ) {
				$kind = 'weight';
			} elseif ( '' === $known[ $token ]['unit'] ) {
				$kind = 'number';
			} elseif ( 'family' === $known[ $token ]['prop'] ) {
				$kind = 'family';
			}

			if ( null === xxp_panel_css_value( $value, $kind ) ) {
				continue;
			}

			$rules .= sprintf( '--%s:%s;', $token, $value );
		}

		if ( '' === $rules ) {
			continue;
		}

		$query = xxp_panel_breakpoints()[ $band ]['query'];
		$out  .= '' === $query
			? sprintf( ':root{%s}', $rules )
			: sprintf( '@media %s{:root{%s}}', $query, $rules );
	}

	return $out;
}

/**
 * The option, readable and writable from the editor.
 *
 * @return void
 */
function xxp_type_scale_register() {
	register_setting(
		'options',
		XXP_TYPE_SCALE_OPTION,
		array(
			'type'         => 'object',
			'default'      => array(),
			'show_in_rest' => array(
				'schema' => array(
					'type'                 => 'object',
					'additionalProperties' => array(
						'type'                 => 'object',
						'additionalProperties' => array( 'type' => 'string' ),
					),
				),
			),
		)
	);
}
add_action( 'init', 'xxp_type_scale_register' );

/**
 * The panel, mounted into Styles → Typography.
 *
 * @return void
 */
function xxp_type_scale_editor_assets() {
	wp_enqueue_script(
		'xxp-type-scale',
		get_theme_file_uri( 'upqode-panel/assets/type-scale.js' ),
		array( 'wp-components', 'wp-element', 'wp-core-data', 'wp-data', 'wp-i18n' ),
		xxp_panel_ver( 'upqode-panel/assets/type-scale.js' ),
		true
	);

	wp_add_inline_script(
		'xxp-type-scale',
		'window.xxpTypeScale = ' . wp_json_encode(
			array(
				'option'      => XXP_TYPE_SCALE_OPTION,
				'breakpoints' => xxp_panel_breakpoints_for_js(),
				'elements'    => xxp_type_scale_elements(),
				'tokens'      => xxp_type_scale_tokens(),
				'defaults'    => xxp_type_scale_defaults(),
			)
		) . ';',
		'before'
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_type_scale_editor_assets' );
