/*
 * Styles → Typography, per screen.
 *
 * Mounted inside the typography panel on each element's screen in Styles:
 * Text (with Small · Body · Large), Headings (All, then H1–H6 from WordPress's
 * own row), Button, Caption. The same seven icons as UPQODE Dimensions; under
 * the chosen screen, four fields — size, line height, letter spacing, weight.
 *
 * Every field starts empty and shows in grey what is in force there — the
 * nearest value set between this screen and the middle, else the design's own
 * number from the tokens file. Typing is an override; clearing it gives the
 * design back. Saved with the editor's own Save, like everything in Styles.
 *
 * Global Styles has no slot, filter or hook, so this finds the panel in the
 * page and mounts into it. It fails quietly: if the anchors stop matching,
 * nothing is mounted and WordPress's own controls are untouched.
 */
( function ( wp ) {
	'use strict';

	var config = window.xxpTypeScale;

	if ( ! config || ! wp.element || ! wp.components || ! wp.coreData ) {
		return;
	}

	var el = wp.element.createElement;
	var __ = wp.i18n.__;

	/**
	 * The option as a map. One nobody has written comes back as an empty array,
	 * and JSON keeps no string keys on an array — every value typed in was saved
	 * into it and lost.
	 */
	function asBands( value ) {
		return value && 'object' === typeof value && ! Array.isArray( value ) ? value : {};
	}

	/* the same drawings as the Dimensions panel: one row of screens to learn */
	var DEVICES = {
		1920: [ 'M1 4.5h22v12H1z', 'M7 20h10', 'M12 16.5v3.5' ],
		1440: [ 'M2 5h20v11H2z', 'M9 20h6', 'M12 16v4' ],
		1280: [ 'M4 5.5h16v10H4z', 'M8 19h8', 'M12 15.5v3.5' ],
		base: [ 'M5 6h14v9H5z', 'M2.5 18.5h19' ],
		991: [ 'M4 4.5h16v15H4z', 'M11 17h2' ],
		767: [ 'M6 4h12v16H6z', 'M10.5 17.5h3' ],
		567: [ 'M8 3.5h8v17H8z', 'M11 18h2' ],
	};

	function screenIcon( key ) {
		return el(
			'svg',
			{
				width: 20,
				height: 20,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.5,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': 'true',
				focusable: 'false',
			},
			( DEVICES[ key ] || DEVICES.base ).map( function ( d, i ) {
				return el( 'path', { key: i, d: d } );
			} )
		);
	}

	function band( key ) {
		return ( config.breakpoints || [] ).filter( function ( one ) {
			return String( one.key ) === String( key );
		} )[ 0 ] || null;
	}

	/** The screens a screen falls back to, nearest first, ending at the middle. */
	function inheritsFrom( key ) {
		var out = [];
		var here = band( key );

		while ( here && here.inherits ) {
			out.push( here.inherits );
			here = band( here.inherits );
		}

		return out;
	}

	/* ---- which tokens belong on the screen being looked at ---- */

	var TEXT_STYLES = [
		{ key: 'text-sm', label: __( 'Small', 'theme-textdomain' ) },
		{ key: 'body', label: __( 'Body', 'theme-textdomain' ) },
		{ key: 'text-lg', label: __( 'Large', 'theme-textdomain' ) },
	];

	/** The Styles screen, as the last segment of its path: text, heading, button… */
	function currentScreen() {
		var params = new URLSearchParams( window.location.search );
		var section = params.get( 'section' ) || '';
		var path = params.get( 'path' ) || '';
		var found = /\/typography\/([a-z0-9-]+)/.exec( section ) || /\/typography\/([a-z0-9-]+)/.exec( path );

		return found ? found[ 1 ] : '';
	}

	/** Which heading WordPress's All / H1…H6 row has picked; '' for All. */
	function currentLevel() {
		var on = [].slice.call( document.querySelectorAll( '[role="radio"][aria-checked="true"]' ) )
			.map( function ( node ) {
				return node.textContent.trim().toLowerCase();
			} )
			.filter( function ( text ) {
				return /^h[1-6]$/.test( text );
			} );

		return on.length ? on[ 0 ] : '';
	}

	/** The element this screen edits. */
	function elementFor( screen, level, textStyle ) {
		if ( 'text' === screen ) {
			return textStyle;
		}

		if ( 'heading' === screen ) {
			return level || 'heading';
		}

		return config.elements[ screen ] ? screen : '';
	}

	/** Its tokens, in the order size, line height, letter spacing, weight. */
	function tokensFor( element ) {
		return Object.keys( config.tokens ).filter( function ( token ) {
			return config.tokens[ token ].element === element;
		} );
	}

	/* ---- the fields ---- */

	function shownFor( token, key, values ) {
		var shown = ( config.defaults[ key ] || {} )[ token ] || '';

		inheritsFrom( key ).some( function ( from ) {
			var set = ( values[ from ] || {} )[ token ];

			if ( set ) {
				shown = set;
				return true;
			}

			return false;
		} );

		return shown;
	}

	function fields( key, tokens, values, onChange ) {
		return tokens.map( function ( token ) {
			return el( wp.components.TextControl, {
				key: token,
				label: config.tokens[ token ].label,
				placeholder: shownFor( token, key, values ),
				value: ( values[ key ] || {} )[ token ] || '',
				__next40pxDefaultSize: true,
				__nextHasNoMarginBottom: true,
				onChange: function ( next ) {
					var all = JSON.parse( JSON.stringify( asBands( values ) ) );
					var said = String( next || '' ).trim();

					all[ key ] = all[ key ] || {};

					if ( '' === said ) {
						delete all[ key ][ token ];
					} else {
						/* a bare number on a size or a tracking is what was meant in its unit */
						if ( /^-?\d+(\.\d+)?$/.test( said ) && config.tokens[ token ].unit ) {
							said += config.tokens[ token ].unit;
						}

						all[ key ][ token ] = said;
					}

					if ( ! Object.keys( all[ key ] ).length ) {
						delete all[ key ];
					}

					onChange( all );
				},
			} );
		} );
	}

	function Breakpoints() {
		var entity = wp.coreData.useEntityProp( 'root', 'site', config.option );
		var values = asBands( entity[ 0 ] );
		var setter = entity[ 1 ];
		var chosen = wp.element.useState( 'base' );
		var key = chosen[ 0 ];
		var screen = wp.element.useState( currentScreen() );
		var level = wp.element.useState( currentLevel() );
		var textStyle = wp.element.useState( 'body' );
		var element = elementFor( screen[ 0 ], level[ 0 ], textStyle[ 0 ] );
		var tokens = tokensFor( element );

		/* Styles moves between screens without reloading: watch, do not read once */
		wp.element.useEffect( function () {
			var tick = window.setInterval( function () {
				var nowScreen = currentScreen();
				var nowLevel = currentLevel();

				if ( nowScreen !== screen[ 0 ] ) {
					screen[ 1 ]( nowScreen );
				}

				if ( nowLevel !== level[ 0 ] ) {
					level[ 1 ]( nowLevel );
				}
			}, 400 );

			return function () {
				window.clearInterval( tick );
			};
		} );

		function carries( el2 ) {
			return tokensFor( el2 ).some( function ( token ) {
				return Object.keys( values ).some( function ( b ) {
					return ( values[ b ] || {} )[ token ];
				} );
			} );
		}

		var current = band( key );

		return el(
			'div',
			{ className: 'xxp-ts-inline' },
			el(
				'p',
				{ className: 'xxp-ts-intro' },
				__( 'Per screen. Grey is what is in force there — type over it to change it, empty it to put the design back.', 'theme-textdomain' )
			),
			/* Headings get their row of tabs from WordPress; Text has none, so it is drawn here */
			'text' === screen[ 0 ]
				? el(
					'div',
					{ className: 'xxp-ts-sizes' },
					TEXT_STYLES.map( function ( one ) {
						return el(
							wp.components.Button,
							{
								key: one.key,
								variant: one.key === textStyle[ 0 ] ? 'primary' : 'secondary',
								size: 'small',
								className: carries( one.key ) ? 'xxp-ts-size is-set' : 'xxp-ts-size',
								onClick: function () {
									textStyle[ 1 ]( one.key );
								},
							},
							one.label
						);
					} )
				)
				: null,
			el(
				'div',
				{ className: 'xxp-dim-screens' },
				( config.breakpoints || [] ).map( function ( screenOne ) {
					var set = tokens.some( function ( token ) {
						return ( values[ screenOne.key ] || {} )[ token ];
					} );

					return el(
						wp.components.Button,
						{
							key: screenOne.key,
							variant: String( screenOne.key ) === String( key ) ? 'primary' : 'secondary',
							size: 'small',
							className: set ? 'xxp-dim-screen is-set' : 'xxp-dim-screen',
							label: screenOne.label,
							showTooltip: true,
							onClick: function () {
								chosen[ 1 ]( screenOne.key );
							},
						},
						screenIcon( screenOne.key )
					);
				} )
			),
			el( 'p', { className: 'xxp-ts-band' }, current ? current.label : '' ),
			el( 'div', { className: 'xxp-ts-group' }, fields( key, tokens, values, setter ) )
		);
	}

	/* ---- mounting into Styles ---- */

	var mount = null;
	var root = null;

	function typographyPanel() {
		var anchor = document.querySelector( '.components-font-appearance-control, .block-editor-line-height-control' );

		return anchor ? anchor.closest( '.components-tools-panel' ) : null;
	}

	/** Only on the Styles screens, never on a block's own inspector. */
	function applies( panel ) {
		var element = elementFor( currentScreen(), currentLevel(), 'body' );

		return !! element && !! tokensFor( element ).length && ! panel.closest( '.block-editor-block-inspector' );
	}

	/**
	 * Take the "Font size presets" row off the typography screen. The theme
	 * ships no presets — sizes are tokens, edited here per screen — so the row
	 * leads to a screen for building a second scale that would quietly outrank
	 * the real one.
	 */
	function hidePresetsRow() {
		[].slice.call( document.querySelectorAll( '.components-navigator-button' ) ).forEach( function ( row ) {
			if ( ! /^font size presets$/i.test( row.textContent.trim() ) ) {
				return;
			}

			var item = row.closest( '.components-item-group' ) || row;

			item.style.display = 'none';

			var before = item.previousElementSibling;

			if ( before && /^font sizes$/i.test( before.textContent.trim() ) ) {
				before.style.display = 'none';
			}
		} );
	}

	function unmount( panel ) {
		if ( panel ) {
			panel.classList.remove( 'xxp-ts-panel', 'xxp-ts-has-size', 'xxp-ts-has-lh', 'xxp-ts-has-ls', 'xxp-ts-has-fw' );
		}

		if ( root ) {
			root.unmount();
			root = null;
		}

		if ( mount && mount.parentNode ) {
			mount.parentNode.removeChild( mount );
		}

		mount = null;
	}

	function sync() {
		hidePresetsRow();

		var panel = typographyPanel();

		if ( ! panel || ! applies( panel ) ) {
			unmount( panel );
			return;
		}

		/*
		 * WordPress's own size, line height, letter spacing and weight set one
		 * value for every width — the thing the design does not do. They are
		 * hidden where this panel stands in for them; family, case and colour
		 * stay, because none of them changes with the width.
		 */
		var props = tokensFor( elementFor( currentScreen(), currentLevel(), 'body' ) ).map( function ( token ) {
			return config.tokens[ token ].prop;
		} );

		panel.classList.add( 'xxp-ts-panel' );
		[ 'size', 'lh', 'ls', 'fw' ].forEach( function ( prop ) {
			panel.classList.toggle( 'xxp-ts-has-' + prop, props.indexOf( prop ) >= 0 );
		} );

		if ( mount && mount.parentNode === panel ) {
			return;
		}

		unmount( null );

		var first = panel.querySelector( '.components-font-appearance-control, .block-editor-line-height-control' );
		var before = first ? first.closest( '.components-tools-panel-item' ) : null;

		mount = document.createElement( 'div' );
		mount.className = 'xxp-ts-mount';
		panel.insertBefore( mount, before );

		root = wp.element.createRoot( mount );
		root.render( el( Breakpoints ) );
	}

	new window.MutationObserver( sync ).observe( document.body, { childList: true, subtree: true } );
	sync();
}( window.wp ) );
