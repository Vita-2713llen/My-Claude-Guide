<?php
/**
 * Plugin Name: Environment Guard
 * Description: Environment badge in the admin bar; noindex on non-production.
 * Version:     1.2.0
 *
 * Settings in wp-config.php:
 *   define( 'WP_ENVIRONMENT_TYPE', 'local' | 'development' | 'staging' | 'production' );
 *
 * Mail is not touched anywhere: DEV sends it as usual, Local catches it in Mailpit (Tools tab → Mailpit).
 */

defined( 'ABSPATH' ) || exit;

$env_guard_type = wp_get_environment_type();

if ( 'production' !== $env_guard_type ) {
	// Search engines do not index local/dev, even if the DB came from production.
	add_filter( 'pre_option_blog_public', '__return_zero' );
	add_action(
		'send_headers',
		static function () {
			header( 'X-Robots-Tag: noindex, nofollow', true );
		}
	);
}

add_action(
	'admin_bar_menu',
	static function ( WP_Admin_Bar $bar ) {
		$env    = wp_get_environment_type();
		$labels = array(
			'local'       => array( 'LOCAL', '#2e7d32' ),
			'development' => array( 'DEV', '#ef6c00' ),
			'staging'     => array( 'STAGING', '#6a1b9a' ),
			'production'  => array( 'PROD', '#c62828' ),
		);
		list( $label, $color ) = isset( $labels[ $env ] ) ? $labels[ $env ] : array( strtoupper( $env ), '#555' );

		$bar->add_node(
			array(
				'id'    => 'environment-guard',
				'title' => sprintf(
					'<span style="background:%s;color:#fff;padding:2px 8px;border-radius:3px;font-weight:600">%s</span>',
					esc_attr( $color ),
					esc_html( $label )
				),
				'meta'  => array( 'title' => 'WP_ENVIRONMENT_TYPE: ' . $env ),
			)
		);
	},
	1
);
