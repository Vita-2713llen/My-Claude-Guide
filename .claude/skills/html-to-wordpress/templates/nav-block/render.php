<?php
/**
 * Server render for the theme's navigation block.
 *
 * Why this exists: core/navigation ships its own stylesheet, and it styles the
 * submenu link's padding, the item's colour (with a doubled class), the submenu
 * container's position (against its own <li>, with an edge flip), and hides the
 * submenu icon at five classes. A mega menu, a wide panel, or a drawer with real
 * open/close behaviour means out-weighing all of that. This renders the theme's
 * own markup instead, so the theme's CSS applies as written.
 *
 * What stays editable: the menu itself lives in Appearance → Menus — items,
 * order, nesting, and a per-item CSS class. Everything around it in the header
 * (logo, CTA button, wrappers) stays real blocks in the template part.
 *
 * A top-level item whose Menus "CSS Classes" field contains `mega` renders as a
 * multi-column panel; anything else renders as a plain dropdown.
 *
 * Helpers live in register.php, not here. This file is included once per block
 * instance, so a `function` declared in it is declared twice the moment two
 * navigations appear on a page — a fatal redeclare error, on the front end,
 * after everything looked fine with one.
 *
 * @package ThemeName
 *
 * @var array    $attributes
 * @var string   $content
 * @var WP_Block $block
 */

$theme_prefix_menu_id = isset( $attributes['menuId'] ) ? (int) $attributes['menuId'] : 0;
$theme_prefix_cols    = isset( $attributes['megaColumns'] ) ? max( 1, (int) $attributes['megaColumns'] ) : 3;
$theme_prefix_width   = isset( $attributes['megaWidth'] ) ? trim( (string) $attributes['megaWidth'] ) : '';

if ( ! $theme_prefix_menu_id ) {
	// Fall back to whatever is assigned to the theme's primary location.
	$theme_prefix_locations = get_nav_menu_locations();
	if ( ! empty( $theme_prefix_locations['primary'] ) ) {
		$theme_prefix_menu_id = (int) $theme_prefix_locations['primary'];
	}
}

$theme_prefix_items = $theme_prefix_menu_id ? wp_get_nav_menu_items( $theme_prefix_menu_id ) : array();

if ( empty( $theme_prefix_items ) ) {
	// Say so in the editor rather than rendering an empty nav the designer
	// cannot diagnose. Nothing is printed on the front end.
	if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
		// Printed, not returned — see the note at the foot of this file.
		echo '<p class="theme-prefix-nav-empty">' .
			esc_html__( 'No menu selected. Pick one in the block sidebar, or assign a menu to the Primary location.', 'theme-textdomain' ) .
			'</p>';
	}
	return;
}

/* Two navigations on one page must not share an id. */
$theme_prefix_drawer_id = wp_unique_id( 'theme-prefix-nav-drawer-' );

/**
 * Group the flat item list into parents and children.
 */
$theme_prefix_tree = array();
foreach ( $theme_prefix_items as $theme_prefix_item ) {
	$theme_prefix_parent = (int) $theme_prefix_item->menu_item_parent;
	$theme_prefix_tree[ $theme_prefix_parent ][] = $theme_prefix_item;
}

$theme_prefix_inner = theme_prefix_nav_level( 0, $theme_prefix_tree, 0, $theme_prefix_cols, $theme_prefix_width );

$theme_prefix_wrapper = get_block_wrapper_attributes( array( 'class' => 'theme-prefix-nav' ) );

?>
<nav <?php echo $theme_prefix_wrapper; // phpcs:ignore WordPress.Security.EscapeOutput ?> aria-label="<?php esc_attr_e( 'Main', 'theme-textdomain' ); ?>">
	<button class="theme-prefix-nav-burger" type="button" aria-expanded="false" aria-controls="<?php echo esc_attr( $theme_prefix_drawer_id ); ?>" aria-label="<?php esc_attr_e( 'Menu', 'theme-textdomain' ); ?>">
		<span aria-hidden="true"></span>
	</button>

	<div class="theme-prefix-nav-drawer" id="<?php echo esc_attr( $theme_prefix_drawer_id ); ?>">
		<ul class="theme-prefix-nav-list">
			<?php echo $theme_prefix_inner; // phpcs:ignore WordPress.Security.EscapeOutput ?>
		</ul>
	</div>
</nav>
<?php
/*
 * No `return` here, and no output buffer. WordPress includes this file inside
 * its own buffer and takes whatever was printed; a returned string is thrown
 * away and the block renders as nothing at all — registered, valid, empty.
 */
