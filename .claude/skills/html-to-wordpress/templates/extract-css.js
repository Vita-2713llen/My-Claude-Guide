#!/usr/bin/env node
/**
 * extract-css.js — every rule that can reach the given classes or ids, grouped
 * by media condition, in cascade order, with specificity.
 *
 * Copy this; do not write another one. It is the same tool in every port, and
 * the versions written by hand have repeatedly shipped the same four faults:
 * returning only the first matching rule, being blind to id selectors, choking
 * on data-URIs, and printing so much that the answer gets truncated on the way
 * back. All four are handled here.
 *
 *   node extract-css.js source.css .hero-title .hero-sub '#w-node-abc'
 *   node extract-css.js source.css --file classes.txt
 *
 * Full output is always written to `css-extract.txt`; the console gets a summary
 * and the path. There is nothing to truncate, and the printed rule count says
 * whether what you read was all of it.
 *
 * No dependencies. Node 16+.
 */

'use strict';

const fs = require( 'fs' );
const path = require( 'path' );

/* ------------------------------------------------------------------ input */

const argv = process.argv.slice( 2 );

if ( argv.length < 2 ) {
	console.error( 'usage: node extract-css.js <file.css> <selector...> | --file <list.txt>' );
	process.exit( 1 );
}

const cssFile = argv[ 0 ];
let names = [];

const fileFlag = argv.indexOf( '--file' );
if ( fileFlag !== -1 ) {
	names = fs.readFileSync( argv[ fileFlag + 1 ], 'utf8' )
		.split( /\s+/ )
		.filter( Boolean );
} else {
	names = argv.slice( 1 );
}

/*
 * Accept `hero-title`, `.hero-title`, `#w-node-x` and `[data-bcard]` alike.
 *
 * The bracket form is not a nicety. A design-canvas export hooks its CSS on
 * `data-*` attributes rather than on classes, and with a hardcoded `.` prefix
 * every lookup in such a source returned zero rules — which reads as "the design
 * does not set this" and is in fact "this tool cannot see it". A bare `data-x`
 * is taken as an attribute too, since there is nothing else it could mean.
 */
const wanted = names.map( ( n ) => {
	if ( /^[.#[]/.test( n ) ) {
		return n;
	}

	return /^data-/.test( n ) ? '[' + n + ']' : '.' + n;
} );

let css = fs.readFileSync( cssFile, 'utf8' );

/* -------------------------------------------------------------- sanitising */

/*
 * Data-URIs contain semicolons, braces and newlines, and a Webflow export can
 * carry hundreds of kilobytes of them. Left in place they shred any parse and
 * flood the output; swap them for a marker and put nothing back — no value in
 * the port ever comes from one.
 */
const dataUris = [];
css = css.replace( /url\(\s*(['"]?)data:[^)]*\1\s*\)/gi, () => {
	dataUris.push( 1 );
	return 'url(DATA_URI)';
} );

// Comments can contain braces; remove them before counting.
css = css.replace( /\/\*[\s\S]*?\*\//g, '' );

/* ----------------------------------------------------------------- parsing */

/**
 * Walk the stylesheet with a brace counter, keeping the stack of at-rule
 * conditions. Regular expressions cannot do this: @media nests, and a rule
 * inside one is invisible to a flat scan — which is exactly how a whole
 * responsive tier goes missing and the base value looks deliberate.
 */
function parse( text ) {
	const rules = [];
	const stack = [];
	let buf = '';
	let i = 0;

	while ( i < text.length ) {
		const ch = text[ i ];

		if ( ch === '{' ) {
			const head = buf.trim();
			buf = '';

			if ( head.startsWith( '@' ) ) {
				// @media, @supports, @layer — descend, remembering the condition.
				stack.push( head );
				i++;
				continue;
			}

			// A style rule: take its body wholesale.
			let depth = 1;
			let body = '';
			i++;
			while ( i < text.length && depth > 0 ) {
				if ( text[ i ] === '{' ) depth++;
				if ( text[ i ] === '}' ) depth--;
				if ( depth > 0 ) body += text[ i ];
				i++;
			}

			rules.push( {
				selector: head,
				body: body.trim(),
				condition: stack.join( ' and ' ),
				order: rules.length,
			} );
			continue;
		}

		if ( ch === '}' ) {
			stack.pop();
			buf = '';
			i++;
			continue;
		}

		buf += ch;
		i++;
	}

	return rules;
}

/* ------------------------------------------------------------ specificity */

function specificity( sel ) {
	const s = sel.replace( /:not\(|:where\(|:is\(|\)/g, ' ' );
	const ids = ( s.match( /#[\w-]+/g ) || [] ).length;
	const cls = ( s.match( /\.[\w-]+|\[[^\]]+\]|:[\w-]+/g ) || [] ).length;
	const els = ( s.match( /(^|[\s>+~])[a-zA-Z][\w-]*/g ) || [] ).length;
	return `(${ ids },${ cls },${ els })`;
}

/* ------------------------------------------------------------------ output */

const all = parse( css );
const lines = [];
const perName = {};

lines.push( `source: ${ path.resolve( cssFile ) }` );
lines.push( `rules parsed: ${ all.length }   data-URIs replaced: ${ dataUris.length }` );
lines.push( '' );

for ( const want of wanted ) {
	// Match the token, not a substring: `.hero` must not match `.hero-title`.
	const token = new RegExp(
		want.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) + '(?![\\w-])'
	);

	const hits = all.filter( ( r ) =>
		r.selector.split( ',' ).some( ( part ) => token.test( part ) )
	);

	perName[ want ] = hits.length;

	lines.push( '='.repeat( 70 ) );
	lines.push( `${ want }   —   ${ hits.length } rule(s)` );
	lines.push( '='.repeat( 70 ) );

	if ( ! hits.length ) {
		lines.push( '  NO RULE FOUND.' );
		lines.push( '  This is not the same as "the design does not set it": check the' );
		lines.push( '  spelling, check whether the value is set on a parent, and check' );
		lines.push( '  whether it lives in an interactions payload rather than in CSS.' );
		lines.push( '' );
		continue;
	}

	// Base layer first, then each condition in file order — the overrides are
	// the point, so they are never collapsed away.
	const groups = new Map();
	for ( const r of hits ) {
		const key = r.condition || '(base)';
		if ( ! groups.has( key ) ) groups.set( key, [] );
		groups.get( key ).push( r );
	}

	for ( const [ condition, group ] of groups ) {
		lines.push( `--- ${ condition }` );
		for ( const r of group ) {
			lines.push( `  ${ r.selector }   ${ specificity( r.selector ) }` );
			for ( const decl of r.body.split( ';' ) ) {
				if ( decl.trim() ) {
					lines.push( `      ${ decl.trim() };` );
				}
			}
		}
		lines.push( '' );
	}
}

const out = 'css-extract.txt';
fs.writeFileSync( out, lines.join( '\n' ), 'utf8' );

console.log( `wrote ${ out }  (${ lines.length } lines)` );
console.log( `parsed ${ all.length } rules from ${ cssFile }` );
for ( const [ name, n ] of Object.entries( perName ) ) {
	console.log( `  ${ n === 0 ? '!' : ' ' } ${ name }: ${ n } rule(s)` );
}
console.log( 'Read the file in full. A zero above is a question, not an answer.' );
