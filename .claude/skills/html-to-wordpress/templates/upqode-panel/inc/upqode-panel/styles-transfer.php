<?php
/**
 * Styles → Export / Import: the whole look in one file.
 *
 * One row at the foot of the Styles list, under Blocks, opening a screen of
 * its own: the five sections with a count beside each, an Export button, then a
 * file field and an Import button. Five sections travel:
 *
 *   Colors, Background, Shadows   WordPress's own global styles record
 *   Typography                    the same record **and** the per-screen type option
 *   Form fields                   the field styles option
 *
 * Export carries the design (theme.json under the overrides, the tokens under
 * the options), so a file is always a whole look. Import writes only what the
 * file says, into the user record, as an unsaved change: nothing is stored until
 * Save, and the theme's own theme.json is never copied into the database.
 *
 * @package theme-textdomain
 */

defined( 'ABSPATH' ) || exit;

/** What the file calls itself, so another JSON is not read by mistake. */
const XXP_STYLES_FILE_MARK = 'xxp/styles';

/**
 * The five sections and where each one lives.
 *
 * @return array<string, array>
 */
function xxp_styles_sections() {
	return array(
		'colors'     => array(
			'label'    => __( 'Colors', 'theme-textdomain' ),
			'paths'    => array( 'settings.color', 'styles.color' ),
			'elements' => 'color',
		),
		'typography' => array(
			'label'    => __( 'Typography', 'theme-textdomain' ),
			'paths'    => array( 'settings.typography', 'styles.typography' ),
			'elements' => 'typography',
			'option'   => XXP_TYPE_SCALE_OPTION,
		),
		'background' => array(
			'label' => __( 'Background', 'theme-textdomain' ),
			'paths' => array( 'styles.background' ),
		),
		'shadows'    => array(
			'label'    => __( 'Shadows', 'theme-textdomain' ),
			'paths'    => array( 'settings.shadow', 'styles.shadow' ),
			'elements' => 'shadow',
		),
		'fields'     => array(
			'label'  => __( 'Form fields', 'theme-textdomain' ),
			'option' => XXP_FIELD_STYLES_OPTION,
		),
	);
}

/**
 * The row and its screen.
 *
 * @return void
 */
function xxp_styles_transfer_assets() {
	$bands = array();

	foreach ( array_keys( xxp_panel_breakpoints() ) as $band ) {
		$bands[ (string) $band ] = true;
	}

	wp_enqueue_script(
		'xxp-styles-transfer',
		get_theme_file_uri( 'upqode-panel/assets/styles-transfer.js' ),
		array( 'wp-element', 'wp-components', 'wp-data', 'wp-core-data', 'wp-notices', 'wp-i18n' ),
		xxp_panel_ver( 'upqode-panel/assets/styles-transfer.js' ),
		true
	);

	wp_add_inline_script(
		'xxp-styles-transfer',
		'window.xxpStylesTransfer = ' . wp_json_encode(
			array(
				'mark'          => XXP_STYLES_FILE_MARK,
				'sections'      => xxp_styles_sections(),
				'site'          => wp_parse_url( home_url(), PHP_URL_HOST ),
				'name'          => sanitize_title( get_bloginfo( 'name' ) ),
				'bands'         => $bands,
				'tokens'        => xxp_type_scale_tokens(),
				'fields'        => xxp_field_style_tokens(),
				'typeDefaults'  => xxp_type_scale_defaults(),
				'fieldDefaults' => xxp_field_style_defaults(),
			)
		) . ';',
		'before'
	);
}
add_action( 'enqueue_block_editor_assets', 'xxp_styles_transfer_assets' );
