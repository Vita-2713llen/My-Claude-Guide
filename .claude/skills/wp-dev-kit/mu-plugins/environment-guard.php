<?php
/**
 * Plugin Name: Environment Guard
 * Description: Environment badge in the admin bar; on non-production — noindex and a mail guard
 *              (WooCommerce / CF7 / Gravity Forms emails from DEV do not reach real customers).
 * Version:     1.1.0
 *
 * Settings in wp-config.php:
 *   define( 'WP_ENVIRONMENT_TYPE', 'local' | 'development' | 'staging' | 'production' );
 *   define( 'ENV_GUARD_MAIL_TO', 'qa@agency.com' );  // DEV: all emails go here (subject prefixed with [DEV → original recipient])
 *   define( 'ENV_GUARD_ALLOW_MAIL', true );          // DEV: turn off the mail guard (not recommended)
 *
 * Mail is not touched on local: Local catches all emails in its built-in Mailpit (Tools tab → Mailpit).
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

if ( ! in_array( $env_guard_type, array( 'production', 'local' ), true ) && ! ( defined( 'ENV_GUARD_ALLOW_MAIL' ) && ENV_GUARD_ALLOW_MAIL ) ) {
	if ( defined( 'ENV_GUARD_MAIL_TO' ) && is_email( ENV_GUARD_MAIL_TO ) ) {
		// Redirect all emails to the QA mailbox.
		add_filter(
			'wp_mail',
			static function ( $args ) {
				$original        = is_array( $args['to'] ) ? implode( ', ', $args['to'] ) : (string) $args['to'];
				$args['subject'] = sprintf( '[%s → %s] %s', strtoupper( wp_get_environment_type() ), $original, $args['subject'] );
				$args['to']      = ENV_GUARD_MAIL_TO;
				// Strip CC/BCC so copies do not reach real people.
				$headers         = is_array( $args['headers'] ) ? $args['headers'] : explode( "\n", (string) $args['headers'] );
				$args['headers'] = array_values(
					array_filter(
						$headers,
						static function ( $h ) {
							return ! preg_match( '/^\s*(cc|bcc)\s*:/i', $h );
						}
					)
				);
				return $args;
			},
			PHP_INT_MAX
		);
	} else {
		// No address set — emails are not sent at all (forms still show "success").
		add_filter(
			'pre_wp_mail',
			static function ( $return, $atts ) {
				error_log( '[environment-guard] Email blocked: ' . wp_json_encode( array( $atts['to'], $atts['subject'] ) ) ); // phpcs:ignore
				return true;
			},
			PHP_INT_MAX,
			2
		);
	}
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
