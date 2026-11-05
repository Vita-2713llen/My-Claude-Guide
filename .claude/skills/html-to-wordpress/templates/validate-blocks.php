<?php
/**
 * Block validity check — the real one, using Gutenberg's own parser.
 *
 * This does NOT compare classes by hand. It builds a standalone page that loads
 * the editor's own scripts, registers the core blocks, parses the saved content,
 * and reports every block WordPress will refuse. That is the only answer that
 * matches what the designer sees, and it needs no login.
 *
 * What it will and will not catch, measured on WP 7.1:
 *
 *   core/group   - a <div> where the attrs say `section`, or a class the attrs
 *                  claim and the markup lacks, are both accepted. The block has
 *                  deprecations covering them. Do not use a group to test this.
 *   core/heading - a level/tag mismatch is refused: "Expected tag name h3,
 *                  instead saw h2".
 *   core/button, core/image - a wrong wrapper tag or a missing <figure> is
 *                  refused.
 *
 * So "0 invalid blocks" is a real answer, and a group that looks wrong by eye is
 * not necessarily a finding.
 *
 * Run it, then open the printed URL in the browser and read the JSON:
 *
 *     php validate-blocks.php            # every pattern part + the front page
 *     php validate-blocks.php 297        # one page by ID
 *
 * Delete the generated file when finished — the script prints the path.
 *
 * @package ThemeName
 */

require __DIR__ . '/bootstrap.php';

$theme_prefix_targets = array();

/* The page under test: an explicit ID, or whatever the front page is. */
$theme_prefix_page_id = isset( $argv[1] ) ? (int) $argv[1] : (int) get_option( 'page_on_front' );

if ( $theme_prefix_page_id ) {
	$theme_prefix_post = get_post( $theme_prefix_page_id );
	if ( $theme_prefix_post ) {
		$theme_prefix_targets[ 'page:' . $theme_prefix_page_id ] = $theme_prefix_post->post_content;
	}
}

/* Template parts and patterns are saved markup too, and break the same way. */
foreach ( glob( get_stylesheet_directory() . '/parts/*.html' ) as $theme_prefix_part ) {
	$theme_prefix_targets[ 'part:' . basename( $theme_prefix_part ) ] = (string) file_get_contents( $theme_prefix_part );
}

foreach ( glob( get_stylesheet_directory() . '/templates/*.html' ) as $theme_prefix_tpl ) {
	$theme_prefix_targets[ 'template:' . basename( $theme_prefix_tpl ) ] = (string) file_get_contents( $theme_prefix_tpl );
}

if ( ! $theme_prefix_targets ) {
	fwrite( STDERR, "Nothing to validate.\n" );
	exit( 1 );
}

/*
 * Collect the editor's script dependencies in load order. wp-block-library
 * carries the core block definitions; without it every core block parses as
 * unregistered and the report is meaningless.
 */
wp_enqueue_script( 'wp-block-library' );
wp_enqueue_script( 'wp-blocks' );
wp_enqueue_script( 'wp-dom-ready' );

/*
 * all_deps() returns a BOOLEAN. It resolves the dependency graph into
 * wp_scripts()->to_do, in load order, and that queue is what has to be walked.
 * Reading the return value gives `true`, the foreach below then walks a bool,
 * the generated page carries no <script> at all, and the only symptom is
 * "wp is not defined" in the console -- which reads as a broken browser rather
 * than a broken script.
 */
wp_scripts()->all_deps( array( 'wp-block-library', 'wp-blocks', 'wp-dom-ready' ), true );
$theme_prefix_handles = wp_scripts()->to_do;

$theme_prefix_tags = '';
foreach ( $theme_prefix_handles as $theme_prefix_handle ) {
	$theme_prefix_obj = wp_scripts()->registered[ $theme_prefix_handle ] ?? null;
	if ( ! $theme_prefix_obj || ! $theme_prefix_obj->src ) {
		continue;
	}
	$theme_prefix_src = $theme_prefix_obj->src;
	if ( 0 === strpos( $theme_prefix_src, '/' ) ) {
		$theme_prefix_src = site_url( $theme_prefix_src );
	}
	$theme_prefix_tags .= '<script src="' . esc_url( $theme_prefix_src ) . '"></script>' . "\n";

	/* Inline data (wp.apiFetch settings, i18n) matters for some handles. */
	$theme_prefix_before = wp_scripts()->get_data( $theme_prefix_handle, 'before' );
	if ( $theme_prefix_before ) {
		$theme_prefix_tags .= '<script>' . implode( "\n", (array) $theme_prefix_before ) . '</script>' . "\n";
	}
}

$theme_prefix_payload = wp_json_encode( $theme_prefix_targets );

$theme_prefix_html = <<<HTML
<!doctype html>
<meta charset="utf-8">
<title>Block validity</title>
{$theme_prefix_tags}
<pre id="out">running…</pre>
<script>
( function () {
	var targets = {$theme_prefix_payload};
	wp.domReady( function () {
		wp.blockLibrary.registerCoreBlocks();

		var report = [];

		Object.keys( targets ).forEach( function ( name ) {
			var walk = function ( blocks, path ) {
				blocks.forEach( function ( b, i ) {
					var here = path + '/' + ( b.name || 'unknown' ) + '[' + i + ']';
					if ( b.isValid === false ) {
						report.push( {
							source: name,
							block: b.name,
							path: here,
							// The literal diff: what save() produced vs what is stored.
							issue: ( b.validationIssues && b.validationIssues[0] )
								? b.validationIssues[0].args
								: null
						} );
					}
					if ( b.innerBlocks && b.innerBlocks.length ) {
						walk( b.innerBlocks, here );
					}
				} );
			};
			walk( wp.blocks.parse( targets[ name ] ), name );
		} );

		document.getElementById( 'out' ).textContent =
			report.length
				? JSON.stringify( report, null, 2 )
				: 'OK — 0 invalid blocks across ' + Object.keys( targets ).length + ' sources';
	} );
} )();
</script>
HTML;

$theme_prefix_file = 'validate-' . wp_generate_password( 8, false ) . '.html';
$theme_prefix_path = ABSPATH . $theme_prefix_file;

file_put_contents( $theme_prefix_path, $theme_prefix_html );

echo "Open this, read the JSON, then delete the file:\n";
echo '  ' . site_url( '/' . $theme_prefix_file ) . "\n";
echo '  ' . $theme_prefix_path . "\n";
echo 'Sources: ' . implode( ', ', array_keys( $theme_prefix_targets ) ) . "\n";
