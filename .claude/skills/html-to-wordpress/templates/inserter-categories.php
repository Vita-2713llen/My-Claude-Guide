<?php
/**
 * One home in the inserter for everything this theme adds.
 *
 * Two separate registries, and both are needed — WordPress keeps blocks and
 * patterns in different lists, so registering one leaves the other scattered
 * among core's categories where nobody finds it.
 *
 *   Blocks   → Inserter → Blocks tab   → "UPQODE"
 *   Patterns → Inserter → Patterns tab → "UPQODE sections"
 *
 * Require this from functions.php.
 *
 * @package ThemeName
 */

/** The label the client reads in the inserter. */
define( 'THEME_PREFIX_INSERTER_LABEL', 'UPQODE' );

/**
 * Add the theme's own block category, first in the list.
 *
 * Every custom block must then carry `"category": "upqode"` in its block.json.
 * A block whose category does not exist silently falls back to "Widgets", which
 * is where custom blocks usually go to be lost.
 *
 * @param array $categories Existing categories.
 * @return array
 */
function theme_prefix_block_category( $categories ) {
	return array_merge(
		array(
			array(
				'slug'  => 'upqode',
				'title' => THEME_PREFIX_INSERTER_LABEL,
				'icon'  => null, // A dashicon slug, or null for the default.
			),
		),
		$categories
	);
}
add_filter( 'block_categories_all', 'theme_prefix_block_category' );

/**
 * Add the pattern category the section patterns are filed under.
 *
 * Each pattern header then reads `Categories: upqode-sections`. Patterns with an
 * unregistered category still appear, but under "Uncategorized" — which defeats
 * the point of grouping them.
 */
function theme_prefix_pattern_category() {
	register_block_pattern_category(
		'upqode-sections',
		array(
			'label'       => THEME_PREFIX_INSERTER_LABEL . ' ' . __( 'sections', 'theme-textdomain' ),
			'description' => __( 'Sections from this design, ready to place on any page.', 'theme-textdomain' ),
		)
	);
}
add_action( 'init', 'theme_prefix_pattern_category' );

/**
 * Optional: keep the theme's own categories at the top of the patterns tab.
 *
 * Core orders pattern categories by registration; this pins ours ahead of the
 * ones WordPress ships so the client meets them first.
 *
 * @param array $categories Registered pattern categories.
 * @return array
 */
function theme_prefix_pattern_category_order( $categories ) {
	$ours = array();
	$rest = array();

	foreach ( $categories as $category ) {
		if ( isset( $category['name'] ) && 0 === strpos( $category['name'], 'upqode-' ) ) {
			$ours[] = $category;
		} else {
			$rest[] = $category;
		}
	}

	return array_merge( $ours, $rest );
}
add_filter( 'get_block_pattern_categories', 'theme_prefix_pattern_category_order' );
