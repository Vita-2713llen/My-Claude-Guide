/*
 * Form fields, in Editor → Styles.
 *
 * A row of its own under Layout, and a screen behind it holding the seven
 * values that make an input, a textarea and a select look like this site.
 *
 * Styles is core's own screen and it has no slot, no filter and no hook — the
 * same wall the type scale ran into — so the row is put into the panel's markup
 * from here. Two things keep that honest. The row is a *copy* of one of core's
 * own, cloned from the Layout button, so it is dressed by whatever classes that
 * release happens to use rather than by class names written down here and gone
 * stale by the next update. And everything is wrapped in a check: if the list
 * is not found, nothing is mounted, nothing throws, and Styles is exactly as it
 * was.
 *
 * The screen is drawn in place of the root list rather than through the
 * navigator. The navigator's routes are declared by core when Styles is built,
 * and a path it has never heard of renders an empty panel with no way back.
 */
( function ( wp ) {
	'use strict';

	var config = window.xxpFieldStyles;

	if ( ! config || ! wp.element || ! wp.components ) {
		return;
	}

	var el = wp.element.createElement;
	var __ = wp.i18n.__;

	/**
	 * A name a group's rows and the panel around them can agree on.
	 *
	 * One per group and not one for the screen: a tools panel shows the items
	 * whose `panelId` is its own, so a single name would have put all sixteen
	 * colours into the first panel and left the other four empty.
	 *
	 * @param {string} name The group's heading.
	 * @return {string} Something to key it by.
	 */
	function panelId( name ) {
		return 'xxp-field-' + name.toLowerCase().replace( /[^a-z0-9]+/g, '-' );
	}

	/** The drawing on the row: a field with a caret in it. */
	var ICON = [
		'M3.5 7.5h17v9h-17z',
		'M7 10.5v3',
	];

	/**
	 * Whatever the option holds, as something that can carry a token.
	 *
	 * An option that has never been written comes back from PHP as an empty
	 * array, and JSON keeps no string keys on an array — the same trap the type
	 * scale fell into, where every value typed in was saved into an array, the
	 * array serialised to `[]`, and the field re-rendered from that.
	 *
	 * @param {*} value Whatever the entity holds.
	 * @return {Object} The same thing, as an object.
	 */
	function asValues( value ) {
		if ( ! value || Array.isArray( value ) || 'object' !== typeof value ) {
			return {};
		}

		return value;
	}

	/**
	 * One state's tokens, grouped, in the order PHP listed them.
	 *
	 * @param {string} state Which tab.
	 * @return {Array} Pairs of heading and token names.
	 */
	function groups( state ) {
		var out = [];
		var seen = {};

		Object.keys( config.tokens ).forEach( function ( token ) {
			if ( config.tokens[ token ].state !== state ) {
				return;
			}

			var name = config.tokens[ token ].group;

			if ( ! seen[ name ] ) {
				seen[ name ] = [];
				out.push( { name: name, tokens: seen[ name ] } );
			}

			seen[ name ].push( token );
		} );

		return out;
	}

	/**
	 * Whether a state has been given anything of its own.
	 *
	 * What puts the dot on a tab, so the two that are still the design's can be
	 * told from the one somebody has been in without opening all three.
	 *
	 * @param {string} state  Which tab.
	 * @param {Object} values What is set.
	 * @return {boolean} Whether anything in it is set.
	 */
	function stateIsSet( state, values ) {
		return Object.keys( values ).some( function ( token ) {
			return config.tokens[ token ] &&
				config.tokens[ token ].state === state &&
				'' !== String( values[ token ] || '' );
		} );
	}

	/**
	 * The five colours, as the row of swatches Styles draws everywhere else.
	 *
	 * Core's own Colors screen is a short list — a round swatch, a word, and a
	 * palette that opens when it is clicked — and this is the same component,
	 * so the two screens are the same thing to learn. A grid of swatches per
	 * colour was the first attempt and it was five screens of scrolling.
	 *
	 * A swatch that has never been set shows the design's colour rather than an
	 * empty square: that is what the field is, and an empty square says only
	 * that nobody has been here. Clear takes an override off again.
	 *
	 * @param {string[]} tokens Which of them.
	 * @param {Object}   values What is set.
	 * @param {Function} onSet  Takes a token and a value.
	 * @return {Object} The control.
	 */
	function colorRows( tokens, label, values, onSet, origins, panel ) {
		var Dropdown = wp.blockEditor && wp.blockEditor.__experimentalColorGradientSettingsDropdown;
		var ToolsPanel = wp.components.__experimentalToolsPanel;

		if ( ! Dropdown || ! ToolsPanel || ! origins ) {
			return plainColors( tokens, values, onSet );
		}

		/* Each row the dropdown draws is a tools-panel item, and a tools-panel
		   item outside a tools panel renders nothing at all — which is what
		   this did on the first try: five colours, no markup, no error. The
		   panel around them is the thing core's own Colors screen has, and the
		   `panelId` has to be the same on both or the items stay hidden. */
		return el(
			ToolsPanel,
			{
				label: label,
				panelId: panel,
				hasInnerWrapper: true,
				className: 'xxp-fs-colors',
				resetAll: function () {
					tokens.forEach( function ( token ) {
						onSet( token, '' );
					} );
				},
			},
			el(
				Dropdown,
				Object.assign( {}, origins, {
					__experimentalIsRenderedInSidebar: true,
					enableAlpha: true,
					panelId: panel,
					settings: tokens.map( function ( token ) {
						return {
							label: config.tokens[ token ].label,
							colorValue: values[ token ] || config.defaults[ token ] || '',
							clearable: !! values[ token ],
							isShownByDefault: true,
							resetAllFilter: function () {
								return {};
							},
							onColorChange: function ( next ) {
								onSet( token, next || '' );
							},
						};
					} ),
				} )
			)
		);
	}

	/**
	 * The same five where that component is not there to borrow.
	 *
	 * @param {string[]} tokens Which of them.
	 * @param {Object}   values What is set.
	 * @param {Function} onSet  Takes a token and a value.
	 * @return {Object} The control.
	 */
	function plainColors( tokens, values, onSet ) {
		return el(
			'div',
			{ className: 'xxp-fs-colors' },
			tokens.map( function ( token ) {
				return el(
					'div',
					{ className: 'xxp-fs-field', key: token },
					el( 'p', { className: 'xxp-fs-label' }, config.tokens[ token ].label ),
					el( wp.components.ColorPalette, {
						colors: config.palette,
						value: values[ token ] || config.defaults[ token ] || '',
						enableAlpha: true,
						clearable: !! values[ token ],
						__experimentalIsRenderedInSidebar: true,
						onChange: function ( next ) {
							onSet( token, next || '' );
						},
					} )
				);
			} )
		);
	}

	/**
	 * What to show behind an empty field.
	 *
	 * The design value, unless it is a word rather than a number: the leading,
	 * the tracking and the letter case are declared `inherit`, which is what not
	 * declaring them already meant, and a field greyed out with the word
	 * "inherit" in it reads as a value somebody typed.
	 *
	 * @param {string} token The token.
	 * @return {string} The placeholder, or nothing.
	 */
	function shownDefault( token ) {
		var now = config.defaults[ token ] || '';

		return /[0-9]/.test( now ) ? now : '';
	}

	/**
	 * One length — a border or a radius.
	 *
	 * Left empty on purpose, with the file's value behind it in grey: a
	 * pre-filled field cannot be cleared back to "whatever the design says",
	 * only to blank.
	 *
	 * @param {string}   token The token.
	 * @param {string}   value What is set, if anything.
	 * @param {Function} onSet Takes the new value.
	 * @return {Object} The control.
	 */
	function lengthField( token, value, onSet ) {
		var meta = config.tokens[ token ];

		return el( wp.components.__experimentalUnitControl || wp.components.UnitControl, {
			key: token,
			label: meta.label,
			value: value || '',
			placeholder: shownDefault( token ),
			units: [
				{ value: 'px', label: 'px', default: 0 },
				{ value: 'rem', label: 'rem', default: 0 },
				{ value: '%', label: '%', default: 0 },
			],
			__next40pxDefaultSize: true,
			__nextHasNoMarginBottom: true,
			onChange: function ( next ) {
				onSet( next || '' );
			},
		} );
	}

	/**
	 * How heavy the typing is.
	 *
	 * The five weights this site's body font is loaded in, by the words the
	 * rest of the editor uses for them rather than by their numbers.
	 *
	 * @param {string}   token The token.
	 * @param {string}   value What is set, if anything.
	 * @param {Function} onSet Takes the new value.
	 * @return {Object} The control.
	 */
	function weightField( token, value, onSet ) {
		return el( wp.components.SelectControl, {
			key: token,
			label: config.tokens[ token ].label,
			value: value || '',
			__next40pxDefaultSize: true,
			__nextHasNoMarginBottom: true,
			options: [
				{ value: '', label: __( 'The design’s own', 'theme-textdomain' ) },
				{ value: '300', label: __( 'Light', 'theme-textdomain' ) },
				{ value: '400', label: __( 'Regular', 'theme-textdomain' ) },
				{ value: '500', label: __( 'Medium', 'theme-textdomain' ) },
				{ value: '600', label: __( 'Semi bold', 'theme-textdomain' ) },
				{ value: '700', label: __( 'Bold', 'theme-textdomain' ) },
			],
			onChange: function ( next ) {
				onSet( next || '' );
			},
		} );
	}

	/**
	 * A list of words.
	 *
	 * @param {string}   token   The token.
	 * @param {string}   value   What is set, if anything.
	 * @param {Function} onSet   Takes the new value.
	 * @param {Array}    options What it can be.
	 * @return {Object} The control.
	 */
	function listField( token, value, onSet, options ) {
		return el( wp.components.SelectControl, {
			key: token,
			label: config.tokens[ token ].label,
			value: value || '',
			__next40pxDefaultSize: true,
			__nextHasNoMarginBottom: true,
			options: [ { value: '', label: __( 'The design’s own', 'theme-textdomain' ) } ].concat( options ),
			onChange: function ( next ) {
				onSet( next || '' );
			},
		} );
	}

	/**
	 * The leading, which is a number and not a length.
	 *
	 * Written as a multiple of the size the way the rest of this design writes
	 * it — 1.55, not 25px — so it still follows when the size is changed.
	 *
	 * @param {string}   token The token.
	 * @param {string}   value What is set, if anything.
	 * @param {Function} onSet Takes the new value.
	 * @return {Object} The control.
	 */
	function numberField( token, value, onSet ) {
		var Number = wp.components.__experimentalNumberControl || wp.components.NumberControl;

		if ( ! Number ) {
			return lengthField( token, value, onSet );
		}

		return el( Number, {
			key: token,
			label: config.tokens[ token ].label,
			value: value || '',
			placeholder: shownDefault( token ),
			step: 0.05,
			min: 0,
			__next40pxDefaultSize: true,
			__nextHasNoMarginBottom: true,
			onChange: function ( next ) {
				onSet( '' === next || undefined === next ? '' : String( next ) );
			},
		} );
	}

	/**
	 * Whichever kind a token asks for.
	 *
	 * @param {string}   token The token.
	 * @param {string}   value What is set, if anything.
	 * @param {Function} onSet Takes the new value.
	 * @return {Object} The control.
	 */
	function field( token, value, onSet ) {
		var kind = config.tokens[ token ].kind;

		if ( 'weight' === kind ) {
			return weightField( token, value, onSet );
		}

		if ( 'number' === kind ) {
			return numberField( token, value, onSet );
		}

		if ( 'case' === kind ) {
			return listField( token, value, onSet, [
				{ value: 'none', label: __( 'As typed', 'theme-textdomain' ) },
				{ value: 'uppercase', label: __( 'UPPERCASE', 'theme-textdomain' ) },
				{ value: 'lowercase', label: __( 'lowercase', 'theme-textdomain' ) },
				{ value: 'capitalize', label: __( 'Capitalised', 'theme-textdomain' ) },
			] );
		}

		return lengthField( token, value, onSet );
	}

	/**
	 * The screen.
	 *
	 * @return {Object} The element.
	 */
	function Screen() {
		var entity = wp.coreData.useEntityProp( 'root', 'site', config.option );
		var values = asValues( entity[ 0 ] );
		var setter = entity[ 1 ];
		/* the palettes core offers a colour control — the theme's, the user's
		   and core's own. Taken here, at the top and on every render, because
		   it is a hook: calling it further down inside a list would make it a
		   hook that sometimes runs and sometimes does not. */
		var useOrigins = wp.blockEditor && wp.blockEditor.__experimentalUseMultipleOriginColorsAndGradients;
		var origins = useOrigins ? useOrigins() : null;
		var state = wp.element.useState( Object.keys( config.states )[ 0 ] );

		/**
		 * Write one token, keeping the rest.
		 *
		 * @param {string} token The token.
		 * @param {string} next  Its new value, or an empty string to clear it.
		 * @return {void}
		 */
		function set( token, next ) {
			var all = {};

			Object.keys( values ).forEach( function ( key ) {
				all[ key ] = values[ key ];
			} );

			if ( '' === next ) {
				delete all[ token ];
			} else {
				all[ token ] = next;
			}

			setter( all );
		}

		var touched = Object.keys( values ).filter( function ( key ) {
			return '' !== String( values[ key ] || '' );
		} );

		return el(
			'div',
			{ className: 'xxp-fs-screen' },
			el(
				'div',
				{ className: 'xxp-fs-head' },
				el( wp.components.Button, {
					label: __( 'Back', 'theme-textdomain' ),
					showTooltip: true,
					size: 'small',
					className: 'xxp-fs-back',
					onClick: close,
				}, backArrow() ),
				el( 'h2', { className: 'xxp-fs-title' }, __( 'Form fields', 'theme-textdomain' ) )
			),
			el(
				'p',
				{ className: 'xxp-fs-intro' },
				__( 'Every input, text area and dropdown on the site. What is shown is what the design says until something here is changed, and Clear puts a value back.', 'theme-textdomain' )
			),
			/* The three states, as a row of tabs. Each one carries the same nine
			   things, so a state is a whole field rather than the two or three
			   values that happen to move in this design — and a dot says which
			   of them somebody has already been into. */
			el(
				'div',
				{ className: 'xxp-fs-states' },
				Object.keys( config.states ).map( function ( key ) {
					return el(
						wp.components.Button,
						{
							key: key,
							variant: key === state[ 0 ] ? 'primary' : 'secondary',
							size: 'small',
							className: stateIsSet( key, values ) ? 'xxp-fs-state is-set' : 'xxp-fs-state',
							onClick: function () {
								state[ 1 ]( key );
							},
						},
						config.states[ key ].label
					);
				} )
			),
			el( 'p', { className: 'xxp-fs-note' }, config.states[ state[ 0 ] ].note ),
			groups( state[ 0 ] ).map( function ( group ) {
				var colors = group.tokens.filter( function ( token ) {
					return 'color' === config.tokens[ token ].kind;
				} );

				return el(
					'div',
					{ className: 'xxp-fs-group', key: group.name },
					/* the colours carry their heading inside the tools panel,
					   where its three-dot menu belongs with it */
					colors.length ? null : el( 'p', { className: 'xxp-fs-grouphead' }, group.name ),
					colors.length ? colorRows( colors, group.name, values, set, origins, panelId( state[ 0 ] + ' ' + group.name ) ) : null,
					el(
						'div',
						{ className: 'xxp-fs-rest' },
						group.tokens.filter( function ( token ) {
							return 'color' !== config.tokens[ token ].kind;
						} ).map( function ( token ) {
							return field( token, values[ token ], function ( next ) {
								set( token, next );
							} );
						} )
					)
				);
			} ),
			touched.length
				? el(
					wp.components.Button,
					{
						variant: 'tertiary',
						className: 'xxp-fs-reset',
						onClick: function () {
							setter( {} );
						},
					},
					__( 'Put all of them back', 'theme-textdomain' )
				)
				: null
		);
	}

	/**
	 * The arrow on the screen's own header, drawn the way core draws it.
	 *
	 * @return {Object} The drawing.
	 */
	function backArrow() {
		return el(
			'svg',
			{
				width: 24,
				height: 24,
				viewBox: '0 0 24 24',
				xmlns: 'http://www.w3.org/2000/svg',
				'aria-hidden': 'true',
				focusable: 'false',
			},
			el( 'path', { d: 'M14.6 7l-1.2-1L8 12l5.4 6 1.2-1-4.6-5 4.6-5z' } )
		);
	}

	/* ---- the row, and the screen it swaps in ---- */

	var row = null;
	var mount = null;
	var root = null;
	var open = false;

	/**
	 * The card Styles draws its first screen into, or nothing.
	 *
	 * @return {Element|null} The card.
	 */
	function rootCard() {
		return document.querySelector( '.global-styles-ui-screen-root' );
	}

	/**
	 * The row for Layout, which this one is copied from and put after.
	 *
	 * Found by its id, which is the navigator's path for that screen and the
	 * one thing about these rows that is not generated.
	 *
	 * @return {Element|null} The button.
	 */
	function layoutRow() {
		var card = rootCard();

		return card ? card.querySelector( '.components-navigator-button[id="/layout"]' ) : null;
	}

	/**
	 * Open the screen: the root list steps aside and this takes its place.
	 *
	 * @return {void}
	 */
	function openScreen() {
		var card = rootCard();

		if ( ! card || open ) {
			return;
		}

		open = true;
		card.style.display = 'none';

		mount = document.createElement( 'div' );
		mount.className = 'xxp-fs-mount';
		card.parentNode.insertBefore( mount, card.nextSibling );

		root = wp.element.createRoot( mount );
		root.render( el( Screen ) );
	}

	/**
	 * Shut it again.
	 *
	 * @return {void}
	 */
	function close() {
		var card = rootCard();

		open = false;

		if ( root ) {
			root.unmount();
			root = null;
		}

		if ( mount && mount.parentNode ) {
			mount.parentNode.removeChild( mount );
		}

		mount = null;

		if ( card ) {
			card.style.display = '';
		}
	}

	/**
	 * Put the row in, once, and take it away with the list it belongs to.
	 *
	 * @return {void}
	 */
	function sync() {
		var after = layoutRow();

		if ( ! after ) {
			/* the root list is gone — the panel moved to another screen, or
			   Styles was shut. Anything this put there went with it. */
			if ( open ) {
				open = false;
				root = null;
				mount = null;
			}

			row = null;

			return;
		}

		if ( row && row.parentNode ) {
			return;
		}

		row = after.parentNode.cloneNode( true );
		row.classList.add( 'xxp-fs-row' );

		var button = row.querySelector( 'button' ) || row;

		button.removeAttribute( 'id' );
		button.removeAttribute( 'data-wp-component' );
		button.removeAttribute( 'data-wp-c16t' );

		var svg = button.querySelector( 'svg' );

		if ( svg ) {
			svg.innerHTML = ICON.map( function ( d ) {
				return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>';
			} ).join( '' );
			svg.setAttribute( 'fill', 'none' );
		}

		var label = button.querySelector( '.components-flex-item' );

		if ( label ) {
			label.textContent = __( 'Form fields', 'theme-textdomain' );
		}

		button.addEventListener( 'click', function ( event ) {
			event.preventDefault();
			event.stopPropagation();
			openScreen();
		} );

		after.parentNode.parentNode.insertBefore( row, after.parentNode.nextSibling );
	}

	new window.MutationObserver( sync ).observe( document.body, { childList: true, subtree: true } );
	sync();
} )( window.wp );
