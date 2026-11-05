#!/usr/bin/env node
/**
 * check-theme-json.js — run after every write to theme.json.
 *
 *   node check-theme-json.js path/to/theme.json
 *
 * WHY. Everything under `settings.custom` is emitted verbatim into one `:root`
 * block. A single apostrophe there opens a CSS string, and the parser swallows
 * the rest of the block **and whatever follows it** — in one port that was
 * `:where(body){margin:0}`, so every page on the site gained the browser's
 * default 8px body margin and all seven sections lost 16px of width. The word
 * that did it was "core's", written in a manifest description.
 *
 * The manifest is the one part of theme.json that holds prose, and prose is
 * where apostrophes live. Parity is what matters: an even number survives, an
 * odd one is fatal — which is why the fault can lie dormant across several edits
 * and then appear after an unrelated one.
 *
 * Exit code 1 on any finding, so it can gate a build step.
 */

'use strict';

const fs = require( 'fs' );

const file = process.argv[ 2 ] || 'theme.json';
let json;

try {
	json = JSON.parse( fs.readFileSync( file, 'utf8' ) );
} catch ( e ) {
	console.error( `${ file }: not valid JSON — ${ e.message }` );
	process.exit( 1 );
}

const problems = [];

/* ------------------------------------------------- settings.custom is CSS */

function walkStrings( node, path, fn ) {
	if ( typeof node === 'string' ) {
		fn( node, path );
	} else if ( node && typeof node === 'object' ) {
		for ( const key of Object.keys( node ) ) {
			walkStrings( node[ key ], path + '.' + key, fn );
		}
	}
}

if ( json.settings && json.settings.custom ) {
	let apostrophes = 0;
	let quotes = 0;

	walkStrings( json.settings.custom, 'settings.custom', ( value, path ) => {
		apostrophes += ( value.match( /'/g ) || [] ).length;
		quotes += ( value.match( /"/g ) || [] ).length;

		if ( /[{};]/.test( value ) ) {
			problems.push( `${ path }: contains a brace or semicolon — it will end the CSS rule early` );
		}
	} );

	if ( apostrophes % 2 ) {
		problems.push(
			`settings.custom: odd number of apostrophes (${ apostrophes }) — one of them opens a CSS string that is never closed, and everything after it in the stylesheet is lost`
		);
	}
	if ( quotes % 2 ) {
		problems.push( `settings.custom: odd number of double quotes (${ quotes }) — same failure` );
	}
}

/* --------------------------------------------- preset slugs that break WP */

function checkSlugs( list, where ) {
	for ( const item of list || [] ) {
		const slug = item.slug || '';

		// WordPress kebab-cases at every letter-digit boundary, so `3xl` becomes
		// `3-xl` and the variable the theme asks for resolves to nothing.
		if ( /[a-z][0-9]|[0-9][a-z]/i.test( slug ) ) {
			problems.push( `${ where }: slug "${ slug }" has a letter next to a digit — WordPress will rename it and the variable will resolve to nothing` );
		}

		// A slug that collides with a block-support class invalidates every block
		// carrying that support.
		if ( [ 'border', 'background', 'text', 'link', 'color' ].includes( slug ) ) {
			problems.push( `${ where }: slug "${ slug }" collides with a block-support class name` );
		}
	}
}

const settings = json.settings || {};
checkSlugs( settings.color && settings.color.palette, 'color.palette' );
checkSlugs( settings.spacing && settings.spacing.spacingSizes, 'spacing.spacingSizes' );
checkSlugs( settings.typography && settings.typography.fontSizes, 'typography.fontSizes' );
checkSlugs( settings.typography && settings.typography.fontFamilies, 'typography.fontFamilies' );

/* ------------------------------------------------------------------ report */

if ( problems.length ) {
	console.error( `${ file }: ${ problems.length } problem(s)` );
	for ( const p of problems ) {
		console.error( '  - ' + p );
	}
	process.exit( 1 );
}

console.log( `${ file }: OK` );
