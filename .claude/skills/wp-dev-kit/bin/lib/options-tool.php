<?php
/**
 * Helper for bin/db-sync.sh. Runs only through WP-CLI:
 *
 *   wp eval-file options-tool.php export <pattern>...  → JSON to STDOUT
 *   wp eval-file options-tool.php import <file.json>
 *
 * Pattern: * = any characters (options_*, theme_mods_*, blog_public).
 * Values are moved "raw" from the DB (base64), without re-serialization,
 * so serialized arrays/objects do not break. Transients are skipped.
 *
 * @var array $args Positional arguments from `wp eval-file`.
 */

if ( ! defined( 'ABSPATH' ) || ! class_exists( 'WP_CLI' ) ) {
	exit( 1 );
}

global $wpdb;

$mode = isset( $args[0] ) ? $args[0] : '';

if ( 'export' === $mode ) {
	$patterns = array_slice( $args, 1 );
	$out      = array();

	if ( $patterns ) {
		$where  = array();
		$params = array();
		foreach ( $patterns as $pattern ) {
			$where[]  = 'option_name LIKE %s';
			$params[] = str_replace( '*', '%', $wpdb->esc_like( $pattern ) );
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- placeholders added above.
		$sql  = $wpdb->prepare( "SELECT option_name, option_value, autoload FROM {$wpdb->options} WHERE " . implode( ' OR ', $where ), $params );
		$rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

		foreach ( (array) $rows as $row ) {
			if ( preg_match( '/^_(site_)?transient_/', $row['option_name'] ) ) {
				continue;
			}
			$out[ $row['option_name'] ] = array(
				'v' => base64_encode( $row['option_value'] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
				'a' => $row['autoload'],
			);
		}
	}

	echo wp_json_encode( $out ? $out : new stdClass() );
	// STDOUT carries the JSON, so the log goes to STDERR.
	fwrite( STDERR, sprintf( "Options exported: %d\n", count( $out ) ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	return;
}

if ( 'import' === $mode ) {
	$file = isset( $args[1] ) ? $args[1] : '';
	if ( ! is_readable( $file ) ) {
		WP_CLI::error( "File not found: {$file}" );
	}

	$data = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	if ( ! is_array( $data ) ) {
		WP_CLI::error( 'Invalid options JSON.' );
	}

	$count = 0;
	foreach ( $data as $name => $row ) {
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, %s)
				 ON DUPLICATE KEY UPDATE option_value = VALUES(option_value), autoload = VALUES(autoload)",
				$name,
				base64_decode( $row['v'] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
				$row['a']
			)
		);
		++$count;
	}

	wp_cache_delete( 'alloptions', 'options' );
	wp_cache_delete( 'notoptions', 'options' );
	WP_CLI::log( sprintf( 'Options imported: %d', $count ) );
	return;
}

WP_CLI::error( 'Usage: export <pattern>... | import <file.json>' );
