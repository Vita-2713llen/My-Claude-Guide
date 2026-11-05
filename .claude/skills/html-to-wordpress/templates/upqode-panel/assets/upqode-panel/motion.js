/*
 * The scroll arrival — "Fade in on scroll" and "Line draws itself".
 *
 * One observer for the page. Each element with `xxp-reveal` arrives once:
 *
 *   already on screen  -> a keyframe, queued behind the load arrivals, because
 *                         an element armed and released in one frame never
 *                         animates;
 *   below the fold     -> a transition, released when it enters the window;
 *   scrolled past      -> simply there: nothing to animate above the window.
 *
 * Distance, duration and easing are read from panel.css (`--xxp-motion-*`) so
 * the design's numbers live in one place. Nothing is hidden until this runs —
 * the head gate in animations.php adds the class that hides — so a visitor
 * without JavaScript, and the editor canvas, see the finished page.
 */
( function () {
	'use strict';

	var hooks = document.querySelectorAll( '.xxp-reveal' );

	if ( ! ( 'IntersectionObserver' in window ) ) {
		return;
	}

	if ( window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) {
		document.documentElement.classList.remove( 'xxp-reveal-ready' );
		return;
	}

	var css = window.getComputedStyle( document.documentElement );

	function token( name, fallback ) {
		var value = css.getPropertyValue( name ).trim();

		return value || fallback;
	}

	var DISTANCE = token( '--xxp-motion-distance', '28px' );
	var DURATION = token( '--xxp-motion-duration', '1.1s' );
	var EASE = token( '--xxp-motion-ease', 'cubic-bezier(0.22, 1, 0.36, 1)' );
	var REVEAL_DURATION = token( '--xxp-reveal-duration', '0.7s' );
	var RISE = 'xxpRiseIn ' + DURATION + ' ' + EASE + ' ';
	var LINE = 'xxpLineGrow ' + DURATION + ' ' + EASE + ' ';

	/*
	 * A transform — even translateY(0) — makes an element the containing block
	 * for anything absolutely positioned inside it. So once the travel is over
	 * the element is put back exactly as the stylesheet had it.
	 */
	function settle( el ) {
		el.style.transform = '';
		el.style.transition = '';
		el.style.willChange = '';
	}

	function show( el ) {
		el.style.opacity = '1';
		el.style.transform = 'none';

		el.addEventListener( 'transitionend', function () {
			settle( el );
		}, { once: true } );

		window.setTimeout( function () {
			settle( el );
		}, 1600 );
	}

	/*
	 * Vertical position alone decides: the observer's ratio is both axes, so a
	 * card clipped sideways in a scroller would never reach the threshold. A
	 * panel behind a closed tab has no box and is off screen until picked.
	 */
	function onScreen( el ) {
		var r = el.getBoundingClientRect();

		if ( ! r.width && ! r.height ) {
			return false;
		}

		return r.top < window.innerHeight - 40 && r.bottom > 0;
	}

	function appear( el ) {
		el.style.transition = 'none';
		el.style.animation = 'none';
		el.style.opacity = '1';
		settle( el );
		el.style.animation = '';
	}

	function isLine( el ) {
		return el.classList.contains( 'xxp-line' );
	}

	/* `xxp-d-240` waits 240ms; `xxp-stagger-70` adds 70ms per card along the row */
	function delayOf( el ) {
		var names = el.getAttribute( 'class' ) || '';
		var base = /(?:^|\s)xxp-d-(\d+)(?:\s|$)/.exec( names );
		var step = /(?:^|\s)xxp-stagger-(\d+)(?:\s|$)/.exec( names );
		var delay = base ? parseInt( base[ 1 ], 10 ) : 0;

		if ( step ) {
			/* a Query Loop puts an <li> between the row and the card: the list is the row */
			var scope = el.closest( 'ul, ol' ) || el.parentNode;
			var peers = Array.prototype.slice.call( scope.querySelectorAll( '.xxp-stagger-' + step[ 1 ] ) );
			var place = Math.max( peers.indexOf( el ), 0 );

			/*
			 * A CEILING ON THE QUEUE. The step is the design's, and the design applies it to
			 * a row of three or four cards. The glossary is 73 rows: at 100ms each the last
			 * one waits 7.2 seconds, which is not an arrival — it is a reader scrolling past
			 * empty space. Measured on `/keywords/`, where twelve rows were still at zero
			 * opacity a second after the page had settled.
			 *
			 * So the first six step and everything after them comes with the sixth. A short
			 * row never reaches the ceiling and is untouched; a long list still arrives as a
			 * wave rather than all at once.
			 */
			delay += Math.min( place, 6 ) * parseInt( step[ 1 ], 10 );
		}

		return delay;
	}

	/* what is on screen at load starts once the load arrivals have let go */
	var lead = ( function () {
		var last = 0;

		document.querySelectorAll( '.xxp-rise' ).forEach( function ( el ) {
			var d = parseFloat( window.getComputedStyle( el ).animationDelay ) || 0;

			if ( d > last ) {
				last = d;
			}
		} );

		return last ? Math.round( last * 1000 ) + 300 : 600;
	}() );

	var observer = new window.IntersectionObserver( function ( entries ) {
		entries.forEach( function ( entry ) {
			if ( entry.isIntersecting ) {
				show( entry.target );
				observer.unobserve( entry.target );
			}
		} );
	}, { threshold: 0, rootMargin: '0px 0px -60px 0px' } );

	var armed = [];
	var known = new WeakSet();

	function arm( el ) {
		if ( known.has( el ) ) {
			return;
		}

		var delay = delayOf( el );

		known.add( el );
		armed.push( el );

		if ( onScreen( el ) ) {
			el.style.willChange = 'opacity, transform';
			el.style.animation = ( isLine( el ) ? LINE : RISE ) + ( delay + lead ) + 'ms both';

			/* dropped once it ends, so a tab switch cannot replay the opening */
			el.addEventListener( 'animationend', function () {
				el.style.animation = '';
				el.style.willChange = '';
				show( el );
			}, { once: true } );

			return;
		}

		/* the start state first, with no transition in force, then the transition */
		el.style.transition = 'none';
		el.style.opacity = '0';
		el.style.transform = isLine( el ) ? 'scaleX(0)' : 'translateY(' + DISTANCE + ')';
		el.style.willChange = 'opacity, transform';
		void el.offsetHeight;
		el.style.transition = 'opacity ' + REVEAL_DURATION + ' ' + EASE + ' ' + delay + 'ms, transform ' + REVEAL_DURATION + ' ' + EASE + ' ' + delay + 'ms';
		observer.observe( el );
	}

	hooks.forEach( arm );

	/*
	 * The observer reports a change of state, not a state: an element moved by
	 * layout after it was armed, one behind a closed tab, one flicked past in a
	 * single frame — none of them ever "changed". So the page is looked at again;
	 * the sweep only ever releases, never hides.
	 */
	function sweep( instant ) {
		var still = [];

		armed.forEach( function ( el ) {
			if ( '1' === el.style.opacity ) {
				return;
			}

			if ( ! onScreen( el ) ) {
				if ( el.getBoundingClientRect().bottom <= 0 ) {
					appear( el );
					observer.unobserve( el );
					return;
				}

				still.push( el );
				return;
			}

			if ( true === instant ) {
				el.style.transition = '';
				el.style.willChange = '';
			}

			show( el );
			observer.unobserve( el );
		} );

		armed = still;
	}

	function onFrame( fn ) {
		var waiting = false;

		return function () {
			if ( waiting ) {
				return;
			}

			waiting = true;
			window.requestAnimationFrame( function () {
				waiting = false;
				fn();
			} );
		};
	}

	var sweepSoon = onFrame( sweep );

	window.requestAnimationFrame( sweep );
	window.setTimeout( sweep, 120 );
	window.setTimeout( sweep, 700 );

	if ( document.fonts && document.fonts.ready ) {
		document.fonts.ready.then( sweep );
	}

	window.addEventListener( 'load', sweep );
	window.addEventListener( 'scroll', sweepSoon, { passive: true } );
	window.addEventListener( 'resize', sweepSoon );

	/*
	 * Content that arrives after the page (a Query Loop paging without reload)
	 * is handed over finished, not replayed: every new element, in view or not,
	 * because whether a node inserted this frame has a box yet is a race.
	 */
	function scan() {
		var fresh = [];

		document.querySelectorAll( '.xxp-reveal' ).forEach( function ( el ) {
			if ( ! known.has( el ) ) {
				fresh.push( el );
			}
		} );

		fresh.forEach( function ( el ) {
			known.add( el );
			el.style.transition = 'none';
			el.style.opacity = '1';
			settle( el );
		} );

		if ( fresh.length ) {
			sweep();
		}
	}

	if ( window.MutationObserver ) {
		var waiting = 0;

		new window.MutationObserver( function () {
			if ( waiting ) {
				return;
			}

			waiting = window.requestAnimationFrame( function () {
				waiting = 0;
				scan();
			} );
		} ).observe( document.body, { childList: true, subtree: true } );
	}

	/* the gate's signal that this ran; tabs and sliders call refresh(true) */
	window.xxpReveal = {
		refresh: function ( instant ) {
			sweep( instant );
		},
		scan: scan,
	};
}() );
