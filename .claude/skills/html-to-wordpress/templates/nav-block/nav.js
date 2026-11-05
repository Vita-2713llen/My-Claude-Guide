/**
 * Front-end behaviour for the theme's navigation block.
 *
 * Everything here is behaviour core would otherwise fight you over: the drawer,
 * the submenu open state, and closing on Escape or an outside click.
 *
 * The script marks the document root the moment it runs. Every rule in nav.css
 * that hides something is written under that mark, so if this file fails to
 * load, arrives late, is switched off — or is simply absent, as it is in the
 * editor canvas — nothing is hidden and the menu degrades to a plain list.
 */
( function () {
	document.documentElement.classList.add( 'js-nav' );

	var DESKTOP = '(min-width: 992px)'; // Match the design's breakpoint.

	function ready( fn ) {
		if ( document.readyState !== 'loading' ) {
			fn();
		} else {
			document.addEventListener( 'DOMContentLoaded', fn );
		}
	}

	ready( function () {
		var navs = document.querySelectorAll( '.theme-prefix-nav' );

		Array.prototype.forEach.call( navs, function ( nav ) {
			var burger = nav.querySelector( '.theme-prefix-nav-burger' );
			var drawer = nav.querySelector( '.theme-prefix-nav-drawer' );
			var toggles = nav.querySelectorAll( '.theme-prefix-nav-toggle' );

			function closeAllSubmenus() {
				Array.prototype.forEach.call( toggles, function ( t ) {
					t.setAttribute( 'aria-expanded', 'false' );
					t.parentNode.classList.remove( 'is-open' );
				} );
			}

			function setDrawer( open ) {
				if ( ! burger || ! drawer ) {
					return;
				}
				burger.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
				nav.classList.toggle( 'is-open', open );
				document.documentElement.classList.toggle( 'has-nav-open', open );
				if ( ! open ) {
					closeAllSubmenus(); // A state that never resets is the usual drawer bug.
				}
			}

			if ( burger ) {
				burger.addEventListener( 'click', function () {
					setDrawer( burger.getAttribute( 'aria-expanded' ) !== 'true' );
				} );
			}

			function toggleItem( toggle ) {
				var item = toggle.parentNode;
				var open = toggle.getAttribute( 'aria-expanded' ) === 'true';

				// One open submenu at a time on desktop; free-standing in the drawer.
				if ( window.matchMedia( DESKTOP ).matches ) {
					closeAllSubmenus();
				}

				toggle.setAttribute( 'aria-expanded', open ? 'false' : 'true' );
				item.classList.toggle( 'is-open', ! open );
			}

			Array.prototype.forEach.call( toggles, function ( toggle ) {
				toggle.addEventListener( 'click', function ( e ) {
					e.preventDefault();
					toggleItem( toggle );
				} );
			} );

			// In the drawer the whole row is the control: tapping the label opens
			// the submenu rather than navigating. A 24px chevron is not a target a
			// thumb can be asked to hit. Desktop keeps the link's own behaviour.
			Array.prototype.forEach.call(
				nav.querySelectorAll( '.has-children > .theme-prefix-nav-link' ),
				function ( link ) {
					link.addEventListener( 'click', function ( e ) {
						if ( window.matchMedia( DESKTOP ).matches ) {
							return;
						}
						var toggle = link.parentNode.querySelector( '.theme-prefix-nav-toggle' );
						if ( ! toggle ) {
							return;
						}
						e.preventDefault();
						toggleItem( toggle );
					} );
				}
			);

			document.addEventListener( 'keydown', function ( e ) {
				if ( e.key === 'Escape' ) {
					closeAllSubmenus();
					setDrawer( false );
				}
			} );

			document.addEventListener( 'click', function ( e ) {
				if ( ! nav.contains( e.target ) ) {
					closeAllSubmenus();
				}
			} );

			// Leaving the drawer's width range must not strand its state.
			window.matchMedia( DESKTOP ).addEventListener( 'change', function () {
				setDrawer( false );
			} );
		} );
	} );
} )();
