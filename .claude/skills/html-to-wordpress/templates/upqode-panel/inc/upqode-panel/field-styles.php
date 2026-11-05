<?php
/**
 * Styles → Form fields.
 *
 * A row of its own on the Styles root screen, under Layout, and a screen behind
 * it: three tabs — Default, Focus, Error — and the same eleven values in each
 * (background, border, border width, radius; text colour, placeholder colour,
 * size, line height, letter spacing, weight, letter case), plus two only Error
 * has (border on focus, the message under the field).
 *
 * Same contract as Typography: the design is `--field-*` in the tokens file,
 * the panel shows it in grey and keeps only overrides in one option.
 *
 * Default is printed twice — as tokens, which every stylesheet reads, and as a
 * rule, because a page can declare something the tokens do not carry. Focus and
 * Error are printed as rules only, and only for what is set: declaring all
 * eleven up front made a field that went wrong take the base leading back over
 * the one its own page had given it.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

const XXP_FIELD_STYLES_OPTION = 'xxp_field_styles';

/**
 * The three states, in tab order. The prefix is the token's.
 *
 * @return array<string, array{label:string,prefix:string,note:string}>
 */
function xxp_field_style_states() {
	return array(
		'rest'  => array(
			'label'  => __( 'Default', 'theme-textdomain' ),
			'prefix' => '',
			'note'   => __( 'The field before anyone touches it.', 'theme-textdomain' ),
		),
		'focus' => array(
			'label'  => __( 'Focus', 'theme-textdomain' ),
			'prefix' => 'focus-',
			'note'   => __( 'While the cursor is in it. Anything left alone here stays as it is in Default.', 'theme-textdomain' ),
		),
		'error' => array(
			'label'  => __( 'Error', 'theme-textdomain' ),
			'prefix' => 'error-',
			'note'   => __( 'A field the form could not accept. Anything left alone here stays as it is in Default.', 'theme-textdomain' ),
		),
	);
}

/**
 * The eleven every state has.
 *
 * @return array<string, array{label:string,kind:string,group:string,prop:string,on:string}>
 */
function xxp_field_style_shape() {
	$box  = __( 'Field', 'theme-textdomain' );
	$type = __( 'Typography', 'theme-textdomain' );

	return array(
		'bg'             => array( 'label' => __( 'Background', 'theme-textdomain' ), 'kind' => 'color', 'group' => $box, 'prop' => 'background', 'on' => 'field' ),
		'border'         => array( 'label' => __( 'Border', 'theme-textdomain' ), 'kind' => 'color', 'group' => $box, 'prop' => 'border-color', 'on' => 'field' ),
		'border-w'       => array( 'label' => __( 'Border width', 'theme-textdomain' ), 'kind' => 'length', 'group' => $box, 'prop' => 'border-width', 'on' => 'field' ),
		'radius'         => array( 'label' => __( 'Border radius', 'theme-textdomain' ), 'kind' => 'length', 'group' => $box, 'prop' => 'border-radius', 'on' => 'field' ),
		'text'           => array( 'label' => __( 'Text color', 'theme-textdomain' ), 'kind' => 'color', 'group' => $type, 'prop' => 'color', 'on' => 'field' ),
		'placeholder'    => array( 'label' => __( 'Placeholder color', 'theme-textdomain' ), 'kind' => 'color', 'group' => $type, 'prop' => 'color', 'on' => 'placeholder' ),
		'size'           => array( 'label' => __( 'Size', 'theme-textdomain' ), 'kind' => 'length', 'group' => $type, 'prop' => 'font-size', 'on' => 'field' ),
		'line-height'    => array( 'label' => __( 'Line height', 'theme-textdomain' ), 'kind' => 'number', 'group' => $type, 'prop' => 'line-height', 'on' => 'field' ),
		'letter-spacing' => array( 'label' => __( 'Letter spacing', 'theme-textdomain' ), 'kind' => 'length', 'group' => $type, 'prop' => 'letter-spacing', 'on' => 'field' ),
		'weight'         => array( 'label' => __( 'Weight', 'theme-textdomain' ), 'kind' => 'weight', 'group' => $type, 'prop' => 'font-weight', 'on' => 'field' ),
		'case'           => array( 'label' => __( 'Letter case', 'theme-textdomain' ), 'kind' => 'case', 'group' => $type, 'prop' => 'text-transform', 'on' => 'field' ),
	);
}

/**
 * Every token, state by state.
 *
 * @return array<string, array{label:string,kind:string,group:string,state:string}>
 */
function xxp_field_style_tokens() {
	$out = array();

	foreach ( xxp_field_style_states() as $state => $meta ) {
		foreach ( xxp_field_style_shape() as $name => $field ) {
			$out[ 'field-' . $meta['prefix'] . $name ] = array(
				'label' => $field['label'],
				'kind'  => $field['kind'],
				'group' => $field['group'],
				'state' => $state,
			);
		}
	}

	$out['field-error-border-focus'] = array(
		'label' => __( 'Border on focus', 'theme-textdomain' ),
		'kind'  => 'color',
		'group' => __( 'Field', 'theme-textdomain' ),
		'state' => 'error',
	);
	$out['field-error-msg']          = array(
		'label' => __( 'Message under the field', 'theme-textdomain' ),
		'kind'  => 'color',
		'group' => __( 'Message', 'theme-textdomain' ),
		'state' => 'error',
	);

	return $out;
}

/**
 * The overrides, as stored.
 *
 * @return array<string, string>
 */
function xxp_field_style_values() {
	$saved = get_option( XXP_FIELD_STYLES_OPTION, array() );

	return is_array( $saved ) ? $saved : array();
}

/**
 * What the tokens file says, followed to a value the panel can draw.
 *
 * `var(--c-white)` tells nobody anything in a swatch; the chain is followed —
 * up to six hops, as a stop rather than a limit — and a colour written with its
 * own fallback comes out as the fallback.
 *
 * @return array<string, string>
 */
function xxp_field_style_defaults() {
	static $out = null;

	if ( null !== $out ) {
		return $out;
	}

	$root = xxp_panel_tokens_by_band()['base'];
	$out  = array();

	foreach ( array_keys( xxp_field_style_tokens() ) as $token ) {
		if ( ! isset( $root[ $token ] ) ) {
			continue;
		}

		$value = $root[ $token ];

		for ( $hop = 0; $hop < 6; $hop++ ) {
			$before = $value;
			$value  = preg_replace_callback(
				'/var\(\s*--([a-z0-9-]+)\s*\)/i',
				static function ( $m ) use ( $root ) {
					return $root[ $m[1] ] ?? $m[0];
				},
				$value
			);

			if ( $before === $value ) {
				break;
			}
		}

		if ( preg_match( '/^var\(\s*--[a-z0-9-]+\s*,\s*(.+?)\s*\)$/i', $value, $m ) ) {
			$value = $m[1];
		}

		$out[ $token ] = $value;
	}

	return $out;
}

/**
 * The markers a form puts on a field it refused, and on the message under it.
 * Contact Form 7's and the ARIA one by default; a project adds its own.
 *
 * @return array{field:string[],message:string[]}
 */
function xxp_field_style_error_markers() {
	return apply_filters(
		'xxp_field_style_error_markers',
		array(
			'field'   => array( '.wpcf7-not-valid', '[aria-invalid="true"]' ),
			'message' => array( '.wpcf7-not-valid-tip', '.xxp-field-error' ),
		)
	);
}

/**
 * The selectors a state writes through.
 *
 * One ladder: `:root:root` outweighs a page's one-class-one-element rule;
 * `:focus` and the error marker are each one step up; both together is what a
 * wrong field being fixed takes. The `:not()` chain is identical in every arm,
 * or the ladder breaks — an uneven chain once let Default outrank Error.
 *
 * @param string $state `rest`, `focus` or `error`.
 * @param string $on    `field` or `placeholder`.
 * @param string $scope What every selector starts with.
 * @return string
 */
function xxp_field_style_selector( $state, $on, $scope = ':root:root' ) {
	$input    = 'input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="range"])';
	$elements = 'placeholder' === $on ? array( $input, 'textarea' ) : array( $input, 'textarea', 'select' );
	$ats      = array( '' );

	if ( 'focus' === $state ) {
		$ats = array( ':focus' );
	} elseif ( 'error' === $state ) {
		$ats = xxp_field_style_error_markers()['field'];
	}

	$tail = 'placeholder' === $on ? '::placeholder' : '';
	$arms = array();

	foreach ( $elements as $element ) {
		foreach ( $ats as $at ) {
			$arms[] = $scope . ' ' . $element . $at . $tail;
		}
	}

	return implode( ',', $arms );
}

/**
 * The overrides as CSS.
 *
 * @param string $scope ':root:root' on the page; the canvas wrapper in the editor.
 * @return string
 */
function xxp_field_styles_as_css( $scope = ':root:root' ) {
	$values = xxp_field_style_values();
	$tokens = xxp_field_style_tokens();
	$blocks = array();
	$root   = '';

	foreach ( xxp_field_style_states() as $state => $meta ) {
		$parts = array();

		foreach ( xxp_field_style_shape() as $name => $what ) {
			$token = 'field-' . $meta['prefix'] . $name;
			$value = trim( (string) ( $values[ $token ] ?? '' ) );

			/*
			 * The shape already says what each field holds — `color`, `length`, `number`,
			 * `weight`, `case` — so the value is checked as that, rather than against a
			 * list of forbidden characters. 19 Oct; see `xxp_panel_css_value()`.
			 */
			if ( '' === $value || ! isset( $tokens[ $token ] ) ) {
				continue;
			}

			if ( null === xxp_panel_css_value( $value, isset( $what['kind'] ) ? $what['kind'] : 'length' ) ) {
				continue;
			}

			if ( '' === $meta['prefix'] ) {
				$root .= sprintf( '--%s:%s;', $token, $value );
			}

			$parts[ $what['on'] ][] = sprintf( '%s:%s;', $what['prop'], $value );
		}

		foreach ( $parts as $on => $lines ) {
			$blocks[] = sprintf( '%s{%s}', xxp_field_style_selector( $state, $on, $scope ), implode( '', $lines ) );
		}
	}

	$extra = array(
		'field-error-border-focus' => array(
			implode(
				',',
				array_map(
					static function ( $arm ) {
						return $arm . ':focus';
					},
					explode( ',', xxp_field_style_selector( 'error', 'field', $scope ) )
				)
			),
			'border-color',
		),
		'field-error-msg'          => array(
			implode(
				',',
				array_map(
					static function ( $marker ) use ( $scope ) {
						return $scope . ' ' . $marker;
					},
					xxp_field_style_error_markers()['message']
				)
			),
			'color',
		),
	);

	foreach ( $extra as $token => $where ) {
		$value = trim( (string) ( $values[ $token ] ?? '' ) );

		if ( '' !== $value && ! preg_match( '/[<>{};]/', $value ) ) {
			$blocks[] = sprintf( '%s{%s:%s;}', $where[0], $where[1], $value );
		}
	}

	if ( '' !== $root ) {
		array_unshift( $blocks, sprintf( '%s{%s}', $scope, $root ) );
	}

	return implode( '', $blocks );
}

/**
 * The option, readable and writable from the editor.
 *
 * @return void
 */
function xxp_field_styles_register() {
	register_setting(
		'options',
		XXP_FIELD_STYLES_OPTION,
		array(
			'type'         => 'object',
			'default'      => array(),
			'show_in_rest' => array(
				'schema' => array(
					'type'                 => 'object',
					'additionalProperties' => array( 'type' => 'string' ),
				),
			),
		)
	);
}
add_action( 'init', 'xxp_field_styles_register' );

/**
 * The row and its screen.
 *
 * @return void
 */
function xxp_field_styles_editor_assets() {
	$palette = wp_get_global_settings( array( 'color', 'palette' ) );

	wp_enqueue_script(
		'xxp-field-styles',
		get_theme_file_uri( 'upqode-panel/assets/field-styles.js' ),
		array( 'wp-components', 'wp-block-editor', 'wp-element', 'wp-core-data', 'wp-data', 'wp-i18n' ),
		xxp_panel_ver( 'upqode-panel/assets/field-styles.js' ),
		true
	);

	wp_add_inline_script(
		'xxp-field-styles',
		'window.xxpFieldStyles = ' . wp_json_encode(
			array(
				'option'   => XXP_FIELD_STYLES_OPTION,
				'states'   => xxp_field_style_states(),
				'tokens'   => xxp_field_style_tokens(),
				'defaults' => xxp_field_style_defaults(),
				'palette'  => is_array( $palette ) && isset( $palette['theme'] ) ? array_values( $palette['theme'] ) : array(),
			)
		) . ';',
		'before'
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_field_styles_editor_assets' );
