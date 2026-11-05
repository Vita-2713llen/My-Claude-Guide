#!/usr/bin/env node
/**
 * Installs the UPQODE panel into a block theme.
 *
 *   node install.js <theme-dir> <prefix> [--textdomain=<domain>] [--dry]
 *
 *   <theme-dir>  the theme's folder (the one with style.css and functions.php)
 *   <prefix>     the project's prefix, lowercase, e.g. `modix` or `acme-co`
 *
 * What it does:
 *
 *   1. copies inc/upqode-panel/ and assets/upqode-panel/ into the theme;
 *   2. replaces the placeholders in every copied file —
 *        theme-textdomain → the text domain (style.css "Text Domain", else the prefix)
 *        XXP_             → MODIX_          (constants)
 *        xxp_             → modix_          (functions, options)
 *        xxp-             → modix-          (classes, custom properties, handles)
 *        xxp/             → modix/          (hook namespaces, the styles file mark)
 *        xxpSomething     → modixSomething  (block attributes, JS globals, keyframes)
 *      and refuses to finish if any `xxp` is left behind;
 *   3. requires inc/upqode-panel/panel.php from functions.php, once;
 *   4. prints what is left to do by hand (the tokens file, theme.json).
 *
 * Run it again to update a theme to a newer template: the two folders are
 * overwritten, nothing else in the theme is touched. Never edit the copied
 * files in a theme by hand — change the template and re-install, or a re-install
 * undoes the edit.
 */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );

const args = process.argv.slice( 2 );
const flags = Object.fromEntries( args.filter( ( a ) => a.startsWith( '--' ) ).map( ( a ) => {
	const [ k, v ] = a.slice( 2 ).split( '=' );
	return [ k, undefined === v ? true : v ];
} ) );
const [ themeDir, rawPrefix ] = args.filter( ( a ) => ! a.startsWith( '--' ) );

function fail( message ) {
	console.error( 'install: ' + message );
	process.exit( 1 );
}

if ( ! themeDir || ! rawPrefix ) {
	fail( 'usage: node install.js <theme-dir> <prefix> [--textdomain=<domain>] [--dry]' );
}

const theme = path.resolve( themeDir );

if ( ! fs.existsSync( path.join( theme, 'style.css' ) ) ) {
	fail( 'no style.css in ' + theme + ' — that is not a theme folder' );
}

if ( ! /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test( rawPrefix ) ) {
	fail( 'the prefix must be lowercase letters and digits, words joined by single hyphens: ' + rawPrefix );
}

if ( 'xxp' === rawPrefix || 'upqode' === rawPrefix ) {
	fail( 'the prefix is the project\'s name, not the template\'s or the agency\'s' );
}

const kebab = rawPrefix;
const snake = kebab.replace( /-/g, '_' );
const upper = snake.toUpperCase();
const camel = kebab.replace( /-([a-z0-9])/g, ( m, c ) => c.toUpperCase() );

const styleCss = fs.readFileSync( path.join( theme, 'style.css' ), 'utf8' );
const declared = /Text Domain:\s*([a-z0-9-]+)/i.exec( styleCss );
const textdomain = flags.textdomain || ( declared ? declared[ 1 ] : kebab );

function rewrite( text ) {
	return text
		.split( 'theme-textdomain' ).join( textdomain )
		.split( 'XXP_' ).join( upper + '_' )
		.split( 'xxp_' ).join( snake + '_' )
		.split( 'xxp-' ).join( kebab + '-' )
		.split( 'xxp/' ).join( kebab + '/' )
		.replace( /xxp(?=[A-Z])/g, camel );
}

const here = __dirname;
const folders = [ 'inc/upqode-panel', 'assets/upqode-panel' ];
const written = [];

for ( const folder of folders ) {
	const from = path.join( here, folder );
	const to = path.join( theme, folder );

	if ( ! flags.dry ) {
		fs.mkdirSync( to, { recursive: true } );
	}

	for ( const name of fs.readdirSync( from ) ) {
		const source = fs.readFileSync( path.join( from, name ), 'utf8' );
		const result = rewrite( source );
		const left = result.match( /xxp/gi );

		if ( left ) {
			fail( folder + '/' + name + ' still holds ' + left.length + ' placeholder(s) after rewriting — the template has a form install.js does not know' );
		}

		if ( ! flags.dry ) {
			/* UTF-8, always: the files carry em dashes and an ANSI write corrupts them */
			fs.writeFileSync( path.join( to, name ), result, { encoding: 'utf8' } );

			if ( fs.readFileSync( path.join( to, name ), 'utf8' ) !== result ) {
				fail( 'wrote ' + folder + '/' + name + ' but it did not read back the same' );
			}
		}

		written.push( folder + '/' + name );
	}
}

const functionsPath = path.join( theme, 'functions.php' );
const requireLine = "require_once get_theme_file_path( 'inc/upqode-panel/panel.php' );";
let functions = fs.existsSync( functionsPath ) ? fs.readFileSync( functionsPath, 'utf8' ) : "<?php\n";
let added = false;

if ( ! functions.includes( "inc/upqode-panel/panel.php" ) ) {
	functions = functions.replace( /\s*$/, '' ) + "\n\n/* The UPQODE panel: every value per screen, on every block. */\n" + requireLine + "\n";
	added = true;

	if ( ! flags.dry ) {
		fs.writeFileSync( functionsPath, functions, { encoding: 'utf8' } );
	}
}

console.log( ( flags.dry ? '[dry] ' : '' ) + 'UPQODE panel installed into ' + theme );
console.log( '  prefix ' + kebab + ' · functions ' + snake + '_ · constants ' + upper + '_ · attributes ' + camel + 'Size · text domain ' + textdomain );
console.log( '  ' + written.length + ' files' );
console.log( '  functions.php: ' + ( added ? 'require added' : 'require already there' ) );
console.log( '' );
console.log( 'Still to do — see README.md in the template:' );
console.log( '  1. the tokens file: ' + upper + '_PANEL_TOKENS_FILE (default assets/css/tokens.css), with --type-* and --field-* from tokens-skeleton.css,' );
console.log( '     redefined only inside the seven queries, enqueued under the handle ' + kebab + '-tokens (or filter ' + snake + '_panel_tokens_handle)' );
console.log( '  2. theme.json: point every element at its --type-* tokens (theme-json-snippet.json); fontSizes stays empty' );
console.log( '  3. open the editor: UPQODE Dimensions + Animations in a block\'s Settings tab, seven icons in Styles → Typography' );
