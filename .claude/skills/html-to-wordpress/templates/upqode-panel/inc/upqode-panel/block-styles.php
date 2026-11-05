<?php
/**
 * Block styles — the panel's other half.
 *
 * What the panel cannot say becomes a style the designer picks by name in the
 * block's Styles tab: a frosted glass, a pill with a dot, a gradient edge, a
 * hover zoom. Never a class typed into "Additional CSS class(es)".
 *
 * Before registering one, make a plain block, give it core's controls and the
 * panel, and measure. If it comes out the same, the style would be a second
 * place to say one thing — leave it out.
 *
 * A project adds its styles through the `xxp_block_styles` filter, from one file
 * every page loads, so a style picked on any page finds its rule:
 *
 *     add_filter( 'xxp_block_styles', function ( $styles ) {
 *         $styles[] = array(
 *             'name'   => 'glass',               // is-style-glass
 *             'label'  => 'Frosted glass',       // what the designer reads
 *             'blocks' => array( 'core/group' ),
 *             'word'   => '',                    // optional: an existing class it stands for
 *         );
 *         return $styles;
 *     } );
 *
 * `word` exists for migrations: a style can stand for a class the stylesheet
 * already uses, and that word is put on beside `is-style-…` at render and in
 * the canvas, so no selector has to be renamed. A fresh port writes its rules
 * against `.is-style-<name>` and leaves `word` empty.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/**
 * Every registered style.
 *
 * Small and Large on a paragraph ship with the panel: they read the same tokens
 * Styles → Typography → Text edits per screen, so a paragraph given one follows
 * that screen. Body is the default — the paragraph as the body is.
 *
 * @return array<int, array{name:string,label:string,blocks:string[],word:string,default?:bool}>
 */
function xxp_block_styles() {
	$styles = array(
		array(
			'name'    => 'text-body',
			'label'   => __( 'Body', 'theme-textdomain' ),
			'blocks'  => array( 'core/paragraph' ),
			'word'    => '',
			'default' => true,
		),
		array(
			'name'   => 'text-sm',
			'label'  => __( 'Small', 'theme-textdomain' ),
			'blocks' => array( 'core/paragraph' ),
			'word'   => '',
		),
		array(
			'name'   => 'text-lg',
			'label'  => __( 'Large', 'theme-textdomain' ),
			'blocks' => array( 'core/paragraph' ),
			'word'   => '',
		),
	);

	$styles = apply_filters( 'xxp_block_styles', $styles );

	return array_values(
		array_filter(
			array_map(
				static function ( $one ) {
					if ( empty( $one['name'] ) || empty( $one['label'] ) || empty( $one['blocks'] ) ) {
						return null;
					}

					$one['word'] = isset( $one['word'] ) ? (string) $one['word'] : '';

					return $one;
				},
				(array) $styles
			)
		)
	);
}

/**
 * Offer them where the editor offers its own.
 *
 * Names core already ships are refused: `outline` on a button carries
 * `border: 2px solid` from core, and a style of the same name inherits it.
 *
 * @return void
 */
function xxp_register_block_styles() {
	$core = array( 'outline', 'fill', 'rounded', 'default', 'squared', 'stripes', 'plain', 'large', 'regular', 'checkmark-list' );

	foreach ( xxp_block_styles() as $style ) {
		if ( in_array( $style['name'], $core, true ) ) {
			continue;
		}

		foreach ( $style['blocks'] as $block ) {
			register_block_style(
				$block,
				array(
					'name'       => $style['name'],
					'label'      => $style['label'],
					'is_default' => ! empty( $style['default'] ),
				)
			);
		}
	}
}
add_action( 'init', 'xxp_register_block_styles' );

/**
 * The class words, with the word each picked style stands for added.
 *
 * @param string $classes The class attribute.
 * @return string[]
 */
function xxp_style_words( $classes ) {
	$words = preg_split( '/\s+/', (string) $classes, -1, PREG_SPLIT_NO_EMPTY );

	foreach ( xxp_block_styles() as $style ) {
		if ( '' !== $style['word']
			&& in_array( 'is-style-' . $style['name'], $words, true )
			&& ! in_array( $style['word'], $words, true ) ) {
			$words[] = $style['word'];
		}
	}

	return $words;
}
