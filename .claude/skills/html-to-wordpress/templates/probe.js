/**
 * probe.js — the measuring rig, with the browser pane's known lies already
 * worked around.
 *
 * Copy this into the theme as `assets/js/probe.js` and enqueue it behind a
 * query flag (see the snippet at the bottom of this file). Serve it to the
 * trimmed source copy as well, so both sides answer the same way.
 *
 * WHY THIS FILE EXISTS. In one measured port, 151 browser calls cost 49
 * minutes, and roughly half of that was repairing the instrument rather than
 * measuring the page — rediscovering, one at a time, that the pane does not
 * dispatch scroll, does not tick rAF, reports frozen transition values, returns
 * an empty document.styleSheets, and never loads lazy images in an unscrolled
 * iframe. Worse than the time: several checks came back green on a page that was
 * not. Every one of those is handled below. Do not re-derive them.
 *
 * Usage, once loaded:
 *
 *   await probe.ready()                       // fonts, images, layout settled
 *   probe.snapshot( '.section-hero' )         // one section's fingerprint
 *   probe.rules( el, 'padding-left' )         // every rule that reaches el
 *   probe.hover( el )                         // apply :hover for real
 *   probe.scrollTo( 400 )                     // move AND notify listeners
 *
 * WHAT IT CANNOT SEE — state this when reporting, and measure these another way:
 *
 *   - Anything keyed on text: a form control has no text node, and a harness
 *     written that way was blind to an entire newsletter form at every width.
 *     Three footer defects lived in that blind spot. `snapshot()` walks the DOM
 *     rather than the text, but any comparison built on top of it must not
 *     re-introduce the assumption.
 *   - Pseudo-elements: only `visibility().marks` reports whether one draws.
 *   - Ink extents: a box is not the glyphs inside it. For "the space above looks
 *     bigger than below", measure with
 *     `ctx.measureText().actualBoundingBoxAscent/Descent` against the computed
 *     font — that settled one report at 40px above and 41px below.
 *   - True `:hover`: `hover()` dispatches events, which is close but not the
 *     browser's own hover state; confirm anything surprising by eye.
 */

( function ( global ) {
	'use strict';

	/* Elements a Webflow export adds that are not part of the design. */
	var NOISE = '.w-webflow-badge, #wf-form-promo, .w-editor-publish-node';

	function nap( ms ) {
		return new Promise( function ( r ) {
			setTimeout( r, ms );
		} );
	}

	/**
	 * Wait until measurements mean something.
	 *
	 * Fonts first: a reading taken before the webfont lands uses the system
	 * font's metrics, which made one section 81px taller than it really was.
	 * Then images, because a card sized by its image is wrong until the image
	 * has dimensions. Then two frames, so layout has settled.
	 */
	async function ready() {
		if ( document.fonts && document.fonts.ready ) {
			await document.fonts.ready;
		}

		// Lazy images never load in a pane that has not been scrolled, and then
		// report naturalWidth 0 — which reads as a broken image, not a
		// deferred one. Force them, then wait for the ones still in flight.
		var imgs = Array.prototype.slice.call( document.images );
		imgs.forEach( function ( img ) {
			if ( img.loading === 'lazy' ) {
				img.loading = 'eager';
			}
			if ( ! img.complete && img.dataset && img.dataset.src ) {
				img.src = img.dataset.src;
			}
		} );

		await Promise.all(
			imgs.filter( function ( i ) {
				return ! i.complete;
			} ).map( function ( i ) {
				return new Promise( function ( r ) {
					i.addEventListener( 'load', r, { once: true } );
					i.addEventListener( 'error', r, { once: true } );
					setTimeout( r, 3000 );
				} );
			} )
		);

		await nap( 32 );
		return true;
	}

	/**
	 * Read computed style with transitions and animations switched off.
	 *
	 * Mid-transition, getComputedStyle returns the value the property is moving
	 * through — or, in a pane that is not compositing, the value it started
	 * from. Either way it is not the resting value anyone means.
	 */
	function frozen( fn ) {
		var style = document.createElement( 'style' );
		style.textContent =
			'*,*::before,*::after{transition:none!important;animation:none!important}';
		document.head.appendChild( style );
		try {
			return fn();
		} finally {
			style.remove();
		}
	}

	/**
	 * Every rule that can reach an element, in cascade order, with specificity.
	 *
	 * Two traps folded in: cross-origin sheets throw on .cssRules and must be
	 * skipped rather than aborting the walk, and @media / @supports blocks have
	 * to be recursed into or the whole responsive layer is invisible — which is
	 * exactly how a value gets built from the base tier and looks deliberate.
	 */
	function rules( el, property ) {
		var out = [];

		function specificity( sel ) {
			var s = sel.replace( /:not\(|:where\(|:is\(|\)/g, ' ' );
			var ids = ( s.match( /#[\w-]+/g ) || [] ).length;
			var cls = ( s.match( /\.[\w-]+|\[[^\]]+\]|:[\w-]+/g ) || [] ).length;
			var els = ( s.match( /(^|[\s>+~])[a-zA-Z][\w-]*/g ) || [] ).length;
			return [ ids, cls, els ];
		}

		function walk( list, condition ) {
			for ( var i = 0; i < list.length; i++ ) {
				var rule = list[ i ];

				if ( rule.cssRules && typeof rule.conditionText === 'string' ) {
					walk( rule.cssRules, rule.conditionText );
					continue;
				}
				if ( ! rule.selectorText ) {
					continue;
				}
				if ( property && rule.style.getPropertyValue( property ) === '' ) {
					continue;
				}

				// A selector list must be tested part by part.
				var parts = rule.selectorText.split( ',' );
				for ( var p = 0; p < parts.length; p++ ) {
					var sel = parts[ p ].trim();
					var hit = false;
					try {
						hit = el.matches( sel );
					} catch ( e ) {
						hit = false;
					}
					if ( ! hit ) {
						continue;
					}
					out.push( {
						selector: sel,
						media: condition || '',
						value: property
							? rule.style.getPropertyValue( property )
							: rule.style.cssText,
						important: property
							? rule.style.getPropertyPriority( property ) === 'important'
							: false,
						specificity: specificity( sel ),
						sheet: ( rule.parentStyleSheet && rule.parentStyleSheet.href
							? rule.parentStyleSheet.href.split( '/' ).pop()
							: 'inline' ),
					} );
					break;
				}
			}
		}

		var sheets = Array.prototype.slice.call( document.styleSheets );

		// An empty list means the sheets have not parsed yet, not that there
		// are no rules. Say so instead of reporting "no rule found".
		if ( ! sheets.length ) {
			return { error: 'document.styleSheets is empty — sheets not parsed yet; reload and retry' };
		}

		sheets.forEach( function ( sheet ) {
			var list;
			try {
				list = sheet.cssRules;
			} catch ( e ) {
				return; // cross-origin, skip quietly
			}
			if ( list ) {
				walk( list, '' );
			}
		} );

		out.push( {
			inline: el.style.getPropertyValue( property || '' ),
			note: 'an inline value beats every rule above, including one in a media query',
		} );

		return out;
	}

	/**
	 * Is this element actually on top at its own centre?
	 *
	 * Arithmetic answers a different question. Comparing an element's rect
	 * against its container's and concluding "clipped" produced a defect report
	 * that was wrong: one `elementFromPoint` returned the element itself,
	 * visible and on top. Whether something can be seen is observed, not
	 * derived — overflow, z-order, transforms and clip paths all decide it, and
	 * none of them appear in two rectangles.
	 */
	function hitTest( el ) {
		var r = el.getBoundingClientRect();
		if ( r.width === 0 || r.height === 0 ) {
			return { visible: false, reason: 'zero box' };
		}

		var x = r.left + r.width / 2;
		var y = r.top + r.height / 2;

		if ( x < 0 || y < 0 || x > global.innerWidth || y > global.innerHeight ) {
			return { visible: null, reason: 'outside the viewport — scroll to it first' };
		}

		var top = document.elementFromPoint( x, y );

		return {
			visible: top === el || el.contains( top ) || ( top && top.contains( el ) ),
			topmost: top ? top.tagName.toLowerCase() + '.' + ( top.className || '' ).toString().split( ' ' )[ 0 ] : null,
		};
	}

	/**
	 * Every matching element, not the first.
	 *
	 * `querySelector` returns row 0, and row 0 is rarely the one the designer is
	 * pointing at. Reporting on it and speaking about the rest is how a defect
	 * in the third card gets declared absent.
	 */
	function all( selector ) {
		var nodes = Array.prototype.slice.call( document.querySelectorAll( selector ) );
		return {
			selector: selector,
			count: nodes.length,
			nodes: nodes.map( function ( el, i ) {
				var m = measure( el );
				m.index = i;
				return m;
			} ),
		};
	}

	/** Apply a real hover, since :hover cannot be forced from script alone. */
	function hover( el ) {
		[ 'mouseover', 'mouseenter', 'mousemove' ].forEach( function ( type ) {
			el.dispatchEvent(
				new MouseEvent( type, { bubbles: type !== 'mouseenter', cancelable: true } )
			);
		} );
		return nap( 400 ); // longer than the house hover timing
	}

	function unhover( el ) {
		[ 'mouseout', 'mouseleave' ].forEach( function ( type ) {
			el.dispatchEvent(
				new MouseEvent( type, { bubbles: type !== 'mouseleave', cancelable: true } )
			);
		} );
		return nap( 400 );
	}

	/**
	 * Scroll and make sure everything that listens for it hears about it.
	 *
	 * The pane does not always dispatch scroll, and IntersectionObserver may not
	 * fire in a hidden frame, so a scrolled-header state or a reveal appears
	 * never to work when it works fine for a person.
	 */
	async function scrollTo( y ) {
		global.scrollTo( 0, y );
		global.dispatchEvent( new Event( 'scroll' ) );
		document.dispatchEvent( new Event( 'scroll' ) );
		await nap( 100 );
		return global.scrollY;
	}

	/**
	 * Does this element actually render anything?
	 *
	 * `display` alone answers a different question. Chevrons that were
	 * `display: block` throughout drew nothing; an overlay sat in the markup at
	 * opacity 0. Both passed a display check and both were wrong on screen.
	 */
	function visibility( el ) {
		var cs = getComputedStyle( el );
		var r = el.getBoundingClientRect();

		// Opacity multiplies down the ancestor chain, so a parent at 0 hides a
		// child at 1 — reading the element alone misses it.
		var opacity = 1;
		var node = el;
		while ( node && node.nodeType === 1 ) {
			opacity *= parseFloat( getComputedStyle( node ).opacity );
			node = node.parentElement;
		}

		var marks = [ '::before', '::after' ].map( function ( pseudo ) {
			var p = getComputedStyle( el, pseudo );
			var drawn =
				p.content !== 'none' &&
				( p.content !== '""' ||
					p.backgroundImage !== 'none' ||
					( p.maskImage && p.maskImage !== 'none' ) ||
					( p.webkitMaskImage && p.webkitMaskImage !== 'none' ) ||
					parseFloat( p.width ) > 0 );
			return drawn ? pseudo : null;
		} ).filter( Boolean );

		var transparentText =
			/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test( cs.color );

		return {
			visible:
				cs.display !== 'none' &&
				cs.visibility !== 'hidden' &&
				opacity > 0.01 &&
				( r.width > 0 && r.height > 0 ),
			why:
				cs.display === 'none' ? 'display:none'
					: cs.visibility === 'hidden' ? 'visibility:hidden'
					: opacity <= 0.01 ? 'opacity:' + opacity.toFixed( 2 )
					: ( r.width === 0 || r.height === 0 ) ? 'zero box'
					: transparentText ? 'transparent text'
					: '',
			marks: marks,
		};
	}

	/** One element's readings — boxes and leaves both. */
	function measure( el ) {
		return frozen( function () {
			var cs = getComputedStyle( el );
			var r = el.getBoundingClientRect();
			var parent = el.parentElement
				? el.parentElement.getBoundingClientRect()
				: r;

			var vis = visibility( el );

			var out = {
				tag: el.tagName.toLowerCase(),
				cls: ( el.className || '' ).toString().slice( 0, 80 ),
				// Below the collapse width the browser lays children out in
				// document order, so the index IS the layout down there.
				order: el.parentElement
					? Array.prototype.indexOf.call( el.parentElement.children, el )
					: 0,
				visible: vis.visible,
				hiddenBy: vis.why,
				marks: vis.marks,
				box: [ Math.round( r.width ), Math.round( r.height ) ],
				left: Math.round( r.left ),
				right: Math.round( r.right ),
				display: cs.display,
				position: cs.position,
				flexDirection: cs.flexDirection,
				gap: cs.gap,
				padding: cs.padding,
				margin: cs.margin,
				fontSize: cs.fontSize,
				lineHeight: cs.lineHeight,
				fontWeight: cs.fontWeight,
				fontFamily: cs.fontFamily.split( ',' )[ 0 ],
				// Caps, tracking and style are carried values like any other, and
				// they are the ones a size-only comparison never notices.
				textTransform: cs.textTransform,
				letterSpacing: cs.letterSpacing,
				fontStyle: cs.fontStyle,
				textDecorationLine: cs.textDecorationLine,
				color: cs.color,
				background: cs.backgroundColor,
				textAlign: cs.textAlign,
				overflow: cs.overflow,
				centreDelta: Math.round(
					( r.left + r.width / 2 ) - ( parent.left + parent.width / 2 )
				),
			};

			if ( cs.display === 'grid' ) {
				out.columns = cs.gridTemplateColumns.split( ' ' ).length;
			}

			if ( el.tagName === 'IMG' ) {
				out.natural = [ el.naturalWidth, el.naturalHeight ];
				out.fills =
					el.naturalWidth > 0 &&
					Math.abs(
						el.naturalWidth / el.naturalHeight - r.width / r.height
					) < 0.02;
				out.underResolved =
					el.naturalWidth > 0 &&
					el.naturalWidth < r.width * ( global.devicePixelRatio || 1 );
				out.src = ( el.currentSrc || el.src || '' ).split( '/' ).pop();
			}

			return out;
		} );
	}

	/** A section's fingerprint: the container and every element under it. */
	function snapshot( selector, opts ) {
		opts = opts || {};
		var root = document.querySelector( selector );
		if ( ! root ) {
			return { error: 'not found: ' + selector };
		}

		var nodes = [ root ].concat(
			Array.prototype.slice.call( root.querySelectorAll( opts.within || '*' ) )
		);

		var noise = Array.prototype.slice.call( document.querySelectorAll( NOISE ) );

		var kept = nodes
				.filter( function ( el ) {
					if ( noise.some( function ( n ) { return n === el || n.contains( el ); } ) ) {
						return false; // Webflow's own badge is not part of the design
					}
					var r = el.getBoundingClientRect();
					return r.width > 0 || r.height > 0 || getComputedStyle( el ).display === 'none';
				} )
				.map( measure );

		// A rig that reports nothing looks exactly like a page with nothing
		// wrong. Print what was examined so "0 differences" can be believed —
		// one run's clean result was taken on a page where two thirds of the
		// design was never seen by the probe at all.
		return {
			width: global.innerWidth,
			selector: selector,
			examined: kept.length,
			skipped: nodes.length - kept.length,
			warning: kept.length < 5
				? 'suspiciously few elements — check the selector and that the page is loaded'
				: '',
			nodes: kept,
		};
	}

	global.probe = {
		ready: ready,
		snapshot: snapshot,
		measure: measure,
		all: all,
		hitTest: hitTest,
		rules: rules,
		hover: hover,
		unhover: unhover,
		scrollTo: scrollTo,
		frozen: frozen,
	};
} )( window );

/*
 * Enqueue it from functions.php, behind a flag so it never ships to a visitor:
 *
 *   function theme_prefix_probe() {
 *       if ( ! isset( $_GET['probe'] ) ) {
 *           return;
 *       }
 *       wp_enqueue_script(
 *           'theme-prefix-probe',
 *           get_theme_file_uri( 'assets/js/probe.js' ),
 *           array(),
 *           (string) filemtime( get_theme_file_path( 'assets/js/probe.js' ) ),
 *           false
 *       );
 *   }
 *   add_action( 'wp_enqueue_scripts', 'theme_prefix_probe' );
 *
 * Then measure at ?probe=1 — and serve the same file beside the trimmed source
 * copy, so the two sides are read by identical code.
 */
