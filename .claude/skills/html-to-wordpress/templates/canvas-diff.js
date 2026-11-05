/**
 * Editor canvas vs front end, same page, same width, computed styles diffed.
 *
 * Paste into the browser console of an open block editor, or run it through the
 * browser tool's javascript action. It loads the front end into a hidden iframe
 * sized to the canvas, walks every themed element in both, and reports only the
 * properties that differ.
 *
 * Why this exists: a theme rule and one of core's generated layout rules —
 * `.wp-container-core-group-is-layout-N` — very often have the *same*
 * specificity, and the two contexts do not load them in the same order. The
 * front end is right, the canvas is wrong, and nothing errors. On one port this
 * silently produced nine defects across two pages: a hero gap rendering 0px
 * against 100px, and eight groups whose `align-items` came out `stretch` instead
 * of `center` or `flex-start`. It reads as "the editor is just different" and it
 * is not — it is the theme losing a tie it wins on the site.
 *
 * Run it at every tier of the design's ladder, on every page, and fix each hit
 * by doubling the theme's class: `.thing.thing { … }`. That beats core's rule in
 * both contexts and needs no `!important`.
 *
 * Configure PREFIX for the project, and SKIP for the editor-only wrappers a
 * theme deliberately compensates for in its editor stylesheet.
 */

( async function () {
	const PREFIX = 'xx-';   // the theme's class prefix
	const FRONT_URL = '/';
	const PROPS = [
		'alignItems',
		'justifyContent',
		'flexDirection',
		'flexWrap',
		'rowGap',
		'columnGap',
		'display',
		'textAlign',
	];

	// Classes the editor stylesheet changes on purpose — a dynamic block sits in
	// one extra wrapper in the canvas, and the theme makes that wrapper pass the
	// layout through. Those are not defects; list them here so they stop showing.
	const SKIP = new Set();

	// Classes that mark state rather than layout, and would split one element
	// into two different keys between the contexts.
	const NOT_IDENTITY = new Set( [ PREFIX + 'reveal', PREFIX + 'rise' ] );

	const canvas = document.querySelector( 'iframe[name="editor-canvas"]' );

	if ( ! canvas ) {
		throw new Error( 'No canvas iframe — is the editor open, and wide enough that its UI is not in mobile mode?' );
	}

	const width = canvas.contentWindow.innerWidth;

	const probe = document.createElement( 'iframe' );
	probe.style.cssText =
		'position:fixed;left:-9999px;top:0;width:' + width + 'px;height:1200px;border:0';
	probe.src = FRONT_URL;
	document.body.appendChild( probe );

	await new Promise( ( resolve ) => {
		probe.onload = resolve;
		setTimeout( resolve, 15000 );
	} );

	// Fonts and layout settle after load; measuring before they do reports
	// differences that are timing, not cascade.
	await new Promise( ( resolve ) => setTimeout( resolve, 2500 ) );

	const collect = ( doc ) => {
		const map = {};

		for ( const el of doc.querySelectorAll( '[class*="' + PREFIX + '"]' ) ) {
			const key = [ ...el.classList ]
				.filter( ( c ) => c.startsWith( PREFIX ) && ! NOT_IDENTITY.has( c ) )
				.sort()
				.join( '.' );

			if ( ! key || map[ key ] ) {
				continue;
			}

			const cs = doc.defaultView.getComputedStyle( el );
			map[ key ] = PROPS.map( ( p ) => cs[ p ] );
		}

		return map;
	};

	const inCanvas = collect( canvas.contentDocument );
	const inFront = collect( probe.contentDocument );
	const diffs = [];

	for ( const key of Object.keys( inCanvas ) ) {
		if ( ! inFront[ key ] || SKIP.has( key ) ) {
			continue;
		}

		const differing = PROPS.map( ( p, i ) =>
			inCanvas[ key ][ i ] === inFront[ key ][ i ]
				? null
				: p + ': canvas ' + inCanvas[ key ][ i ] + ' vs front ' + inFront[ key ][ i ]
		).filter( Boolean );

		if ( differing.length ) {
			diffs.push( { el: key, d: differing } );
		}
	}

	probe.remove();

	return {
		width,
		compared: Object.keys( inCanvas ).filter( ( k ) => inFront[ k ] ).length,
		differing: diffs.length,
		diffs,
	};
} )();
