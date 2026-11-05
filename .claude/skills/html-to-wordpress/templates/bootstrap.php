<?php
/**
 * Environment bootstrap for every CLI script in the port.
 *
 * Require this first from any script that touches WordPress:
 *
 *     require __DIR__ . '/bootstrap.php';
 *
 * It exists because the same four or five things are rediscovered at the start
 * of every run, and each of them fails in a way that looks like something else:
 * a moved database port reads as "Database Error", a missing admin capability
 * reads as "the SVG upload silently did nothing", a short PHP limit reads as
 * "the import stopped halfway".
 *
 * Replace the two constants below and nothing else.
 *
 * @package ThemeName
 */

/** Absolute path to the site root — the folder holding wp-load.php. */
define( 'THEME_PREFIX_SITE_PATH', 'C:/Users/you/Local Sites/yoursite/app/public' );

/** The site URL this script is allowed to write to. A guard, not a setting. */
define( 'THEME_PREFIX_EXPECTED_URL', 'https://yoursite.local' );

/* ------------------------------------------------------------------ limits */

/*
 * Set before WordPress loads. Media import and a large page's block parse both
 * run past the defaults, and both fail quietly rather than loudly.
 */
ini_set( 'memory_limit', '512M' );
ini_set( 'max_execution_time', '0' );
ini_set( 'display_errors', '1' );
error_reporting( E_ALL );

/* -------------------------------------------------------------- the socket */

/*
 * Local and MAMP put MySQL on a per-site port, and the port is reassigned when
 * the app restarts — it is not an identity. If DB_HOST needs a port, define it
 * here BEFORE wp-load.php reads wp-config.php.
 *
 * Local keeps the current port in:
 *   %APPDATA%/Local/sites.json  →  services.mysql.ports.MYSQL
 */
// define( 'DB_HOST', '127.0.0.1:10058' );

$theme_prefix_loader = rtrim( THEME_PREFIX_SITE_PATH, '/\\' ) . '/wp-load.php';

if ( ! file_exists( $theme_prefix_loader ) ) {
	fwrite( STDERR, "wp-load.php not found at {$theme_prefix_loader}\n" );
	exit( 1 );
}

require_once $theme_prefix_loader;

/* ------------------------------------------------------------- the identity */

/*
 * LOAD-BEARING. Confirm which site answered, not which port was dialled. One
 * run wrote nineteen attachment rows into an unrelated project's database
 * because the port had moved to it overnight; the files landed correctly here,
 * so nothing looked wrong until much later.
 */
$theme_prefix_actual = untrailingslashit( get_option( 'siteurl' ) );

if ( $theme_prefix_actual !== untrailingslashit( THEME_PREFIX_EXPECTED_URL ) ) {
	fwrite(
		STDERR,
		"Refusing to run.\n" .
		"  expected: " . THEME_PREFIX_EXPECTED_URL . "\n" .
		"  connected to: {$theme_prefix_actual}\n" .
		"The database port has probably been reassigned. Check sites.json.\n"
	);
	exit( 1 );
}

/* ----------------------------------------------------------- the capability */

/*
 * Uploads, SVG sanitising and anything gated on manage_options need a user.
 * Without one the call returns a WP_Error nobody reads, or does nothing at all.
 */
$theme_prefix_admins = get_users(
	array(
		'role'   => 'administrator',
		'number' => 1,
		'fields' => 'ID',
	)
);

if ( empty( $theme_prefix_admins ) ) {
	fwrite( STDERR, "No administrator found to run as.\n" );
	exit( 1 );
}

wp_set_current_user( (int) $theme_prefix_admins[0] );

/* ---------------------------------------------------------------- the media */

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

/**
 * Repair an attachment whose MIME type was stored wrong.
 *
 * SVGs uploaded before SVG support was registered are stored with an empty or
 * generic type, and then never render. Cheaper to fix than to re-import.
 *
 * @param int $attachment_id Attachment ID.
 * @return void
 */
function theme_prefix_fix_attachment_mime( $attachment_id ) {
	$file = get_attached_file( $attachment_id );
	if ( ! $file || ! file_exists( $file ) ) {
		return;
	}

	$ext = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
	$map = array(
		'svg'  => 'image/svg+xml',
		'webp' => 'image/webp',
		'avif' => 'image/avif',
	);

	if ( isset( $map[ $ext ] ) && get_post_mime_type( $attachment_id ) !== $map[ $ext ] ) {
		wp_update_post(
			array(
				'ID'             => $attachment_id,
				'post_mime_type' => $map[ $ext ],
			)
		);
	}
}

/*
 * Two reminders for whatever runs after this file:
 *
 * - wp_slash( $content ) before every insert or update, or `--` inside block
 *   attributes survives as a literal u002d and the block is invalid.
 * - kses_remove_filters() before writing content that contains inline SVG,
 *   or it is stripped silently.
 */
