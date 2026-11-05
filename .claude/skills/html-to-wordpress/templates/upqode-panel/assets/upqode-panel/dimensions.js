/**
 * UPQODE Dimensions and UPQODE Animations — two panels on every block.
 *
 * Both sit in the block's Settings tab, side by side. Dimensions has a row of
 * seven screens and, under the chosen one, everything the design changes with
 * the width: visibility, padding, margin, block spacing, width, height, crop
 * and layout. Animations says how the block arrives.
 *
 * Core's own Dimensions and Layout panels are hidden in the inspector (see
 * editor-panels.css) so there is one way in, not two that disagree. The middle
 * screen reads and writes core's own `style.spacing`, so Styles and this panel
 * show the same number.
 *
 * @package theme-textdomain
 */
( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;

	var SETTINGS = window.xxpPanel || { breakpoints: [ { key: 'base', label: 'All widths', inherits: '' } ], groups: [] };

	/*
	 * Core's own controls where they exist, a plain field where they do not —
	 * these have lived under experimental names for several releases, and a
	 * panel that disappears because a name changed is worse than a plain box.
	 */
	var UnitField = wp.components.__experimentalUnitControl || wp.components.TextControl;
	var SpacingControl = wp.blockEditor.__experimentalSpacingSizesControl || null;
	var Toggle = wp.components.__experimentalToggleGroupControl || null;
	var ToggleIcon = wp.components.__experimentalToggleGroupControlOptionIcon || null;
	/* the same control with words instead of a drawing — the sizing presets */
	var ToggleWord = wp.components.__experimentalToggleGroupControlOption || null;
	var NumberField = wp.components.__experimentalNumberControl || wp.components.TextControl;

	/*
	 * The settings whose value is NOT a length, so a bare number must stay a bare number.
	 *
	 * This is the editor's copy of the branches `xxp_size_value()` answers before its
	 * own "a bare number is what somebody meant in pixels" line. The server had them and
	 * the canvas did not, which is a difference that only shows up in the editor — see the
	 * note where it is used.
	 *
	 * A new kind that is a count, a ratio, a fraction or a grid line belongs here as well
	 * as in the validator.
	 */
	var NOT_A_LENGTH = {
		grow: true,     /* flex-grow */
		shrink: true,   /* flex-shrink */
		cols: true,     /* how many columns */
		order: true,    /* where in the row */
		z: true,        /* z-index */
		op: true,       /* opacity */
		gcol: true,     /* grid-column: a line number */
		ar: true,       /* aspect-ratio */
	};

	var UNITS = [
		{ value: 'px', label: 'px', default: 0 },
		{ value: '%', label: '%', default: 100 },
		{ value: 'rem', label: 'rem', default: 0 },
		{ value: 'vw', label: 'vw', default: 100 },
		{ value: 'vh', label: 'vh', default: 100 },
	];

	/* ---- the screens ---- */

	/**
	 * One screen, by key — compared as text: a key is 1440 in one place and
	 * '1440' in another, and `===` on the two stopped the inheritance chain.
	 *
	 * @param {string} key Which screen.
	 * @return {Object|null} It.
	 */
	function band( key ) {
		return ( SETTINGS.breakpoints || [] ).filter( function ( one ) {
			return String( one.key ) === String( key );
		} )[ 0 ] || null;
	}

	/*
	 * A device for each screen, drawn here rather than fetched: `wp.icons` is
	 * not exposed to the editor runtime, and the row must not go missing.
	 */
	var SCREENS = {
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
			( SCREENS[ key ] || SCREENS.base ).map( function ( d, i ) {
				return el( 'path', { key: i, d: d } );
			} )
		);
	}

	/* the screen last chosen, so the two rows of icons agree */
	var LAST_BAND = 'base';

	/**
	 * The row of seven, with a dot on any screen that holds values of its own.
	 *
	 * @param {string}   where    The chosen screen.
	 * @param {Function} setWhere Choose another.
	 * @param {Function} has      Whether a screen holds anything.
	 * @return {Object} The row.
	 */
	function screenRow( where, setWhere, has ) {
		return el(
			'div',
			{ className: 'xxp-dim-screens' },
			( SETTINGS.breakpoints || [] ).map( function ( screen ) {
				return el(
					wp.components.Button,
					{
						key: screen.key,
						variant: String( where ) === String( screen.key ) ? 'primary' : 'secondary',
						size: 'small',
						className: has( screen.key ) ? 'xxp-dim-screen is-set' : 'xxp-dim-screen',
						label: screen.label,
						showTooltip: true,
						onClick: function () {
							setWhere( screen.key );
						},
					},
					screenIcon( screen.key )
				);
			} )
		);
	}

	/* ---- reading and writing ---- */

	/**
	 * A value out of one of the two settings.
	 *
	 * @param {Object} attrs The block's attributes.
	 * @param {string} name  `xxpSize` or `xxpMotion`.
	 * @param {string} where A screen, for the size setting.
	 * @param {string} key   Which value.
	 * @return {string|number} It, or ''.
	 */
	function read( attrs, name, where, key ) {
		var held = attrs[ name ];

		if ( ! held ) {
			return '';
		}

		if ( ! where ) {
			return undefined === held[ key ] ? '' : held[ key ];
		}

		return held[ where ] && undefined !== held[ where ][ key ] ? held[ where ][ key ] : '';
	}

	/**
	 * Write one value, dropping whatever has been emptied — `{ base: {} }` in
	 * the content says nothing and is taken out.
	 *
	 * @param {Object} props The block's props.
	 * @param {string} name  Which setting.
	 * @param {string} where Which screen, or null.
	 * @param {string} key   Which value.
	 * @param {*}      value What was typed.
	 * @return {void}
	 */
	function write( props, name, where, key, value ) {
		var next = Object.assign( {}, props.attributes[ name ] );

		if ( where ) {
			next[ where ] = Object.assign( {}, next[ where ] );

			if ( '' === value || undefined === value || null === value ) {
				delete next[ where ][ key ];
			} else {
				next[ where ][ key ] = value;
			}

			if ( ! Object.keys( next[ where ] ).length ) {
				delete next[ where ];
			}
		} else if ( '' === value || undefined === value || null === value || 0 === value ) {
			delete next[ key ];
		} else {
			next[ key ] = value;
		}

		var out = {};

		out[ name ] = Object.keys( next ).length ? next : undefined;
		props.setAttributes( out );
	}

	/**
	 * Several values on one screen, in ONE write.
	 *
	 * `write()` reads `props.attributes` and hands back a whole new object, and `props` is
	 * the render's own copy: call it twice in a row and the second call starts from the
	 * attributes as they were BEFORE the first, so the first value is quietly dropped. The
	 * sizing presets are two values at once and showed it immediately — pressing Grow wrote
	 * `flex-grow: 1`, then `flex-shrink: 1` landed on top of a stale copy and the grow was
	 * gone. Anything writing more than one key at a time wants this, not a loop.
	 *
	 * @param {Object} props  The block's props.
	 * @param {string} name   Which setting.
	 * @param {string} where  Which screen.
	 * @param {Object} values key → value; an empty string takes that key out.
	 * @return {void}
	 */
	function writeMany( props, name, where, values ) {
		var next = Object.assign( {}, props.attributes[ name ] );

		next[ where ] = Object.assign( {}, next[ where ] );

		Object.keys( values ).forEach( function ( key ) {
			var value = values[ key ];

			if ( '' === value || undefined === value || null === value ) {
				delete next[ where ][ key ];
			} else {
				next[ where ][ key ] = value;
			}
		} );

		if ( ! Object.keys( next[ where ] ).length ) {
			delete next[ where ];
		}

		var out = {};

		out[ name ] = Object.keys( next ).length ? next : undefined;
		props.setAttributes( out );
	}

	/* where core keeps each group for the middle screen */
	var CORE = { padding: 'padding', margin: 'margin', gap: 'blockGap' };

	/**
	 * What core holds for a group on the middle screen, as sides.
	 *
	 * @param {Object} props The block's props.
	 * @param {Object} group Which group.
	 * @return {Object} Side → value.
	 */
	function baseValues( props, group ) {
		var spacing = ( props.attributes.style || {} ).spacing || {};
		var held = spacing[ CORE[ group.key ] ];

		if ( 'gap' === group.key ) {
			return held && 'string' === typeof held ? { all: held } : {};
		}

		return held && 'object' === typeof held ? Object.assign( {}, held ) : {};
	}

	/**
	 * And written back in the shape core saves.
	 *
	 * @param {Object} props The block's props.
	 * @param {Object} group Which group.
	 * @param {Object} next  Side → value.
	 * @return {void}
	 */
	function writeBase( props, group, next ) {
		var style = Object.assign( {}, props.attributes.style );
		var spacing = Object.assign( {}, style.spacing );
		var key = CORE[ group.key ];

		if ( 'gap' === group.key ) {
			if ( next && next.all ) {
				spacing[ key ] = String( next.all );
			} else {
				delete spacing[ key ];
			}
		} else {
			var sides = {};

			Object.keys( next || {} ).forEach( function ( side ) {
				if ( next[ side ] ) {
					sides[ side ] = String( next[ side ] );
				}
			} );

			if ( Object.keys( sides ).length ) {
				spacing[ key ] = sides;
			} else {
				delete spacing[ key ];
			}
		}

		if ( Object.keys( spacing ).length ) {
			style.spacing = spacing;
		} else {
			delete style.spacing;
		}

		props.setAttributes( { style: Object.keys( style ).length ? style : undefined } );
	}

	/**
	 * Whether the block keeps any of these sides for the middle screen in the
	 * panel's own setting. The field writes back to wherever the value is.
	 *
	 * @param {Object} props The block's props.
	 * @param {Object} sides Kind → side.
	 * @return {boolean} Whether it does.
	 */
	function holdsOurBase( props, sides ) {
		return Object.keys( sides ).some( function ( kind ) {
			return '' !== read( props.attributes, 'xxpSize', 'base', kind );
		} );
	}

	/**
	 * The middle screen's sides, written to the panel's own setting in one go.
	 *
	 * @param {Object} props The block's props.
	 * @param {Object} sides Kind → side.
	 * @param {Object} next  Side → value.
	 * @return {void}
	 */
	function writeOurBase( props, sides, next ) {
		var size = Object.assign( {}, props.attributes.xxpSize );
		var mid = Object.assign( {}, size.base );

		Object.keys( sides ).forEach( function ( kind ) {
			var value = next[ sides[ kind ] ];

			if ( undefined === value || null === value || '' === value ) {
				delete mid[ kind ];
			} else {
				mid[ kind ] = String( value );
			}
		} );

		if ( Object.keys( mid ).length ) {
			size.base = mid;
		} else {
			delete size.base;
		}

		props.setAttributes( { xxpSize: Object.keys( size ).length ? size : undefined } );
	}

	/**
	 * What a screen holds of its own.
	 *
	 * @param {Object} props The block's props.
	 * @param {string} where Which screen.
	 * @param {string} kind  Which value.
	 * @param {Object} group The group, when the middle screen reads core.
	 * @return {string} The value, or ''.
	 */
	function own( props, where, kind, group ) {
		if ( 'base' === where && group && group.sides ) {
			/* a block may keep its middle value in the panel's own setting rather
			   than in core's — the page prints both, so the field shows both */
			var ours = read( props.attributes, 'xxpSize', 'base', kind );

			if ( '' !== ours && null !== ours ) {
				return String( ours );
			}

			var held = baseValues( props, group )[ group.sides[ kind ] ];

			return undefined === held || null === held ? '' : String( held );
		}

		var value = read( props.attributes, 'xxpSize', where, kind );

		return undefined === value || null === value ? '' : String( value );
	}

	/**
	 * What a screen borrows when it holds nothing: outward from the middle,
	 * 1920 → 1440 → 1280 → base and 567 → 767 → 991 → base. The same chain the
	 * stylesheet's order makes, written down so the panel can show it.
	 *
	 * @param {Object} props The block's props.
	 * @param {string} where Which screen.
	 * @param {string} kind  Which value.
	 * @param {Object} group The group.
	 * @return {string} It, or ''.
	 */
	function borrowed( props, where, kind, group ) {
		var here = band( where );

		while ( here && here.inherits ) {
			here = band( here.inherits );

			if ( ! here ) {
				break;
			}

			var value = own( props, here.key, kind, group );

			if ( '' !== value ) {
				return value;
			}
		}

		return '';
	}

	function inForce( props, where, kind, group ) {
		var mine = own( props, where, kind, group );

		return '' !== mine ? mine : borrowed( props, where, kind, group );
	}

	function nameOf( group, kind ) {
		var found = ( group.kinds || [] ).filter( function ( one ) {
			return one.key === kind;
		} )[ 0 ];

		return found ? found.label : kind;
	}

	/* ---- the groups ---- */

	/**
	 * A gap written as two distances — `36px 64px`, the CSS shorthand, rows
	 * first. The server splits it into row-gap and column-gap, so the panel
	 * has to read it as two values and not show the first one twice.
	 *
	 * @param {string} value What is held.
	 * @return {Array|null} Row and column, or null when it is one distance.
	 */
	function gapPair( value ) {
		if ( 'string' !== typeof value ) {
			return null;
		}

		var parts = value.trim().split( /\s+/ );

		return 2 === parts.length ? parts : null;
	}

	/**
	 * One half of a gap: the matching part of a shorthand, or the whole of a
	 * single distance.
	 *
	 * @param {string} value What is held.
	 * @param {string} kind  `rgap` or `cgap`.
	 * @return {string} That half.
	 */
	function gapHalf( value, kind ) {
		var pair = gapPair( value );

		if ( ! pair ) {
			return value;
		}

		return 'cgap' === kind ? pair[ 1 ] : pair[ 0 ];
	}

	/**
	 * Whether this block has two gaps (rows and columns) rather than one.
	 * A grid does, a block already holding one of the two does, and so does one
	 * whose gap is written as a shorthand pair.
	 *
	 * @param {Object} props The block's props.
	 * @return {boolean} Whether to ask for both.
	 */
	function usesAxes( props ) {
		var layout = props.attributes.layout || {};
		var held = props.attributes.xxpSize || {};
		var core = ( ( props.attributes.style || {} ).spacing || {} ).blockGap;

		if ( 'grid' === layout.type ) {
			return true;
		}

		if ( gapPair( core ) ) {
			return true;
		}

		return Object.keys( held ).some( function ( where ) {
			return !! held[ where ] && !! ( held[ where ].rgap || held[ where ].cgap || gapPair( held[ where ].gap ) );
		} );
	}

	/*
	 * How each gap is put to core's control so it draws the right mark: an axis
	 * is believed only when both its sides carry the value.
	 */
	var GAP_SHAPES = {
		gap: { sides: [ 'top' ], reads: 'top', fills: [ 'top' ] },
		rgap: { sides: [ 'vertical' ], reads: 'top', fills: [ 'top', 'bottom' ] },
		cgap: { sides: [ 'horizontal' ], reads: 'left', fills: [ 'left', 'right' ] },
	};

	/**
	 * One gap field.
	 *
	 * On the middle screen the single gap is core's `blockGap` — except where
	 * the block already keeps its own base gap: core turns `blockGap` into
	 * margins on a flow layout, so a block that is flex by the stylesheet but
	 * flow by its attribute keeps the gap here. The field reads from wherever
	 * the value is and writes back there.
	 */
	function gapField( props, where, group, kind, label, fallback ) {
		var base = 'base' === where;
		var single = 'gap' === kind;
		var shape = GAP_SHAPES[ kind ];
		var ourBase = base && single ? read( props.attributes, 'xxpSize', 'base', 'gap' ) : '';
		var mine = '' !== ourBase;

		var value = single
			? ( mine ? String( ourBase ) : inForce( props, where, 'gap', group ) )
			: inForce( props, where, kind ) || gapHalf( fallback, kind );
		var values = {};

		if ( '' !== value ) {
			shape.fills.forEach( function ( side ) {
				values[ side ] = value;
			} );
		}

		return el( SpacingControl, {
			/* its own key: the control keeps the view it chose on mount */
			key: 'gap-' + kind,
			label: label,
			showSideInLabel: false,
			sides: shape.sides,
			values: values,
			onChange: function ( one ) {
				var got = one ? one[ shape.reads ] : '';

				got = undefined === got || null === got ? '' : String( got );

				if ( single && base && ! mine ) {
					writeBase( props, group, { all: got } );
					return;
				}

				if ( got === borrowed( props, where, kind, single ? group : null ) ) {
					got = '';
				}

				write( props, 'xxpSize', where, kind, got );
			},
		} );
	}

	function gapGroup( props, where, group ) {
		if ( ! usesAxes( props ) ) {
			return gapField( props, where, group, 'gap', group.label, '' );
		}

		var one = inForce( props, where, 'gap', group );

		return [
			gapField( props, where, group, 'rgap', nameOf( group, 'rgap' ), one ),
			gapField( props, where, group, 'cgap', nameOf( group, 'cgap' ), one ),
		];
	}

	/**
	 * Padding or margin, in core's own spacing control.
	 *
	 * A screen keeps only what differs from what it would borrow: the control
	 * hands back all four sides every time, and storing the three nobody touched
	 * would stop them following the middle for ever.
	 */
	function spacingGroup( props, where, group ) {
		if ( 'gap' === group.key ) {
			return gapGroup( props, where, group );
		}

		var sides = group.sides;
		var base = 'base' === where;
		var values = {};

		Object.keys( sides ).forEach( function ( kind ) {
			var value = inForce( props, where, kind, group );

			if ( '' !== value ) {
				values[ sides[ kind ] ] = value;
			}
		} );

		return el( SpacingControl, {
			label: group.label,
			values: values,
			sides: Object.keys( sides ).map( function ( kind ) {
				return sides[ kind ];
			} ),
			allowReset: true,
			splitOnAxis: false,
			onChange: function ( next ) {
				if ( base && ! holdsOurBase( props, sides ) ) {
					writeBase( props, group, next );
					return;
				}

				next = next || {};

				if ( base ) {
					writeOurBase( props, sides, next );
					return;
				}

				Object.keys( sides ).forEach( function ( kind ) {
					var value = next[ sides[ kind ] ];

					value = undefined === value || null === value ? '' : String( value );

					if ( value === borrowed( props, where, kind, group ) ) {
						value = '';
					}

					write( props, 'xxpSize', where, kind, value );
				} );
			},
		} );
	}

	/* the marks beside each layout choice, drawn the way core draws its own */
	var MARKS = {
		'dir:row': [ 'M4 12h12', 'M13 8.5l3.5 3.5-3.5 3.5' ],
		'dir:column': [ 'M12 4v12', 'M8.5 13l3.5 3.5 3.5-3.5' ],
		'just:flex-start': [ 'M4 4v16', 'M7 9h9v6h-9z' ],
		'just:center': [ 'M12 3v18', 'M6 9h12v6h-12z' ],
		'just:flex-end': [ 'M20 4v16', 'M8 9h9v6h-9z' ],
		'just:space-between': [ 'M4 4v16', 'M20 4v16', 'M6 9h4v6h-4z', 'M14 9h4v6h-4z' ],
		'align:flex-start': [ 'M4 4h16', 'M9 7h6v9h-6z' ],
		'align:center': [ 'M3 12h18', 'M9 6h6v12h-6z' ],
		'align:flex-end': [ 'M4 20h16', 'M9 8h6v9h-6z' ],
		'align:stretch': [ 'M4 4h16', 'M4 20h16', 'M9 7h6v10h-6z' ],
		'wrap:nowrap': [ 'M4 12h16', 'M16 9l3 3-3 3' ],
		'wrap:wrap': [ 'M4 8h16', 'M4 16h11', 'M12 13l-3 3 3 3' ],
		'talign:left': [ 'M4 6h16', 'M4 11h10', 'M4 16h14' ],
		'talign:center': [ 'M4 6h16', 'M7 11h10', 'M5 16h14' ],
		'talign:right': [ 'M4 6h16', 'M10 11h10', 'M6 16h14' ],
	};

	function mark( key ) {
		return el(
			'svg',
			{
				width: 24,
				height: 24,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.6,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': 'true',
				focusable: 'false',
			},
			( MARKS[ key ] || [] ).map( function ( d, i ) {
				return el( 'path', { key: i, d: d } );
			} )
		);
	}

	/* the words each choice offers, in the order core offers its own */
	var CHOICES = {
		dir: [ 'row', 'column' ],
		just: [ 'flex-start', 'center', 'flex-end', 'space-between' ],
		align: [ 'flex-start', 'center', 'flex-end', 'stretch' ],
		wrap: [ 'nowrap', 'wrap' ],
		talign: [ 'left', 'center', 'right' ],
	};

	/**
	 * Is there a drawing for every word this setting offers?
	 *
	 * THE REASON THIS FUNCTION EXISTS. A row of marks is drawn by handing each button an
	 * icon from MARKS, and MARKS was only ever filled in for the five oldest kinds. Every
	 * kind added afterwards — align-self, text-wrap, overflow, display, position, column
	 * width, object-fit — asked for a drawing that was not there, got an empty `<svg>`,
	 * and drew a BLANK BUTTON. Six blank squares under a heading look like a setting that
	 * controls nothing, and that is what they were taken for; measured in the editor, the
	 * buttons were all present and every one of them had zero paths inside it.
	 *
	 * So the marks no longer decide silently. A setting draws as icons only when there is
	 * a drawing for each of its words, and otherwise falls to a dropdown of the words
	 * themselves. Add a kind and forget both and it still reads — as its CSS words, which
	 * is plain, not blank.
	 *
	 * @param {string}   kind  The setting's key.
	 * @param {string[]} words Its words.
	 * @return {boolean} True when every word has a mark.
	 */
	function allDrawn( kind, words ) {
		return (
			words.length > 0 &&
			words.every( function ( word ) {
				return ( MARKS[ kind + ':' + word ] || [] ).length > 0;
			} )
		);
	}

	/**
	 * Direction, distribution, alignment, wrap and text alignment, per screen.
	 * Pressing the pressed mark lets the screen inherit again.
	 */
	function choiceGroup( props, where, group ) {
		return el(
			'div',
			{ className: 'xxp-dim-choices' },
			/* A slice taken out of a group to sit under a section heading carries no
			   heading of its own — the section's name is the heading, and a second one
			   under it ("Layout / Layout") is the noise this arrangement removed. */
			group.label ? el( 'p', { className: 'xxp-dim-kind' }, group.label ) : null,
			group.kinds.map( function ( kind ) {
				var words = CHOICES[ kind.key ] || kind.words || [];
				var mine = own( props, where, kind.key );
				var shown = inForce( props, where, kind.key );
				var names = kind.names || {};

				/**
				 * What to call a word in the sidebar — THE WORD.
				 *
				 * These lists used to read "A row of its children", "A band of its own",
				 * "Pinned to the parent", and Anna stopped at the display one on 20 Oct:
				 * *"ось це не зрозуміло"*. The sentence describes what the value does and
				 * still leaves you guessing which CSS it is, which is the one thing the
				 * reader of this sidebar already knows. So the list says `flex`, `block`,
				 * `inline-flex`, and the sentence moves under the control, where it
				 * explains the value that is actually chosen instead of five at once.
				 */
				var name = function ( word ) {
					return word;
				};

				if ( ! Toggle || ! ToggleIcon || ! allDrawn( kind.key, words ) ) {
					return el( wp.components.SelectControl, {
						key: kind.key,
						__next40pxDefaultSize: true,
						__nextHasNoMarginBottom: true,
						label: kind.label,
						/* a group of one whose kind is called what the group is called —
						   Position / Position — says the word twice; the heading is enough,
						   and the label stays for anyone reading the page aloud */
						hideLabelFromVision: saidAlready( group, kind ),
						value: mine,
						/* What the chosen word means, under the control — the sentence that
						   used to be the option's own label, now attached to the one value
						   it describes rather than shouted by all five at once. */
						help: names[ mine ] || undefined,
						/*
						 * The first option is "leave it to the wider screen", and it says what
						 * that screen is doing rather than the word "Default" — the same thing
						 * the marks show greyed out when nothing is set here.
						 */
						options: [
							{
								value: '',
								label: shown
									? /* translators: %s: the value a wider screen already sets. */
									  sprintf( __( 'As set wider: %s', 'theme-textdomain' ), name( shown ) )
									: __( 'Not set', 'theme-textdomain' ),
							},
						].concat(
							words.map( function ( word ) {
								return { value: word, label: name( word ) };
							} )
						),
						onChange: function ( value ) {
							write( props, 'xxpSize', where, kind.key, value );
						},
					} );
				}

				return el(
					Toggle,
					{
						key: kind.key,
						label: kind.label,
						hideLabelFromVision: saidAlready( group, kind ),
						value: mine,
						isBlock: true,
						isDeselectable: true,
						__next40pxDefaultSize: true,
						__nextHasNoMarginBottom: true,
						help: mine || ! shown ? undefined : shown,
						onChange: function ( value ) {
							write( props, 'xxpSize', where, kind.key, value || '' );
						},
					},
					words.map( function ( word ) {
						return el( ToggleIcon, {
							key: word,
							value: word,
							label: word,
							icon: mark( kind.key + ':' + word ),
						} );
					} )
				);
			} )
		);
	}

	/** Width or height: fixed, min, max. */
	function measureGroup( props, where, group ) {
		return el(
			'div',
			{ className: 'xxp-dim-group' },
			group.label ? el( 'p', { className: 'xxp-dim-label' }, group.label ) : null,
			el(
				'div',
				{ className: 'xxp-dim-fields' },
				group.kinds.map( function ( kind ) {
					/*
					 * A RATIO is not a measurement. Grow and shrink are plain numbers, so
					 * they get a plain box — no px, no auto. They were drawn with the unit
					 * buttons every other field has, which invites `1.7px`; the validator
					 * refuses that in silence, so the sidebar would show a value the block
					 * had never taken.
					 */
					if ( kind.ratio ) {
						/*
						 * A STEP PER KIND, because one step was wrong for most of them.
						 *
						 * Every plain number here had `step: 0.1, min: 0`, which suits an
						 * opacity and nothing else: the arrows turned `grid-template-columns`
						 * from 1 into 1.1, and `order` and `z-index` could not be taken below
						 * zero at all — though `order: -1` is how a picture is lifted above
						 * its text on a phone, and `z-index: -1` is how a shape is put behind
						 * one. The validator accepts both; the control refused to type them.
						 */
						var counted = 'cols' === kind.key || 'order' === kind.key || 'z' === kind.key;
						var floor = ( 'op' === kind.key || 'grow' === kind.key || 'shrink' === kind.key ) ? 0 : ( 'cols' === kind.key ? 1 : undefined );

						return el( wp.components.TextControl, {
							key: kind.key,
							/* the class says what the value IS, so the layout below can give a
							   length the room it needs without counting children */
							className: 'xxp-dim-count',
							label: kind.label,
							/* a number whose name cannot carry the whole truth — `columns`
							   is half of a `repeat()` — says the rest underneath */
							help: kind.help || undefined,
							value: own( props, where, kind.key ),
							placeholder: inForce( props, where, kind.key ) || '1',
							type: 'number',
							min: floor,
							max: 'op' === kind.key ? 1 : undefined,
							step: counted ? 1 : 0.1,
							onChange: function ( value ) {
								write( props, 'xxpSize', where, kind.key, undefined === value || null === value ? '' : String( value ) );
							},
						} );
					}

					/*
					 * A value written as WORDS, in a group that is otherwise measurements.
					 * "This block spans" takes grid lines — `3 / -1`, `span 2`, `auto` — and
					 * it had the px/auto unit control every length has, which cannot produce
					 * any of them: the slash cannot be typed and a bare number comes back as
					 * `3px`, which the validator drops in silence. The field looked editable
					 * and could not be used.
					 */
					if ( kind.text ) {
						return el( wp.components.TextControl, {
							key: kind.key,
							className: 'xxp-dim-text',
							__next40pxDefaultSize: true,
							__nextHasNoMarginBottom: true,
							label: kind.label,
							value: own( props, where, kind.key ),
							placeholder: inForce( props, where, kind.key ) || kind.hint || '',
							help: kind.help || undefined,
							onChange: function ( value ) {
								write( props, 'xxpSize', where, kind.key, undefined === value || null === value ? '' : String( value ) );
							},
						} );
					}

					return el( UnitField, {
						key: kind.key,
						className: 'xxp-dim-length',
						label: kind.label,
						value: own( props, where, kind.key ),
						placeholder: inForce( props, where, kind.key ) || __( 'auto', 'theme-textdomain' ),
						units: UNITS,
						onChange: function ( value ) {
							write( props, 'xxpSize', where, kind.key, undefined === value || null === value ? '' : String( value ) );
						},
					} );
				} )
			)
		);
	}

	/**
	 * Hide on this screen. A switch is not a ladder: it means this screen and no
	 * other, so it never shows a value borrowed from another screen.
	 */
	function toggleGroup( props, where, group ) {
		return el(
			'div',
			{ className: 'xxp-dim-group is-toggle' },
			group.kinds.map( function ( kind ) {
				return el( wp.components.ToggleControl, {
					key: kind.key,
					__nextHasNoMarginBottom: true,
					label: kind.label,
					checked: 'none' === own( props, where, kind.key ),
					onChange: function ( value ) {
						write( props, 'xxpSize', where, kind.key, value ? 'none' : '' );
					},
				} );
			} )
		);
	}

	/** Where a picture sits in its frame — a phrase, not a length. */
	function wordsGroup( props, where, group ) {
		return el(
			'div',
			{ className: 'xxp-dim-group is-words' },
			group.label ? el( 'p', { className: 'xxp-dim-label' }, group.label ) : null,
			el(
				'div',
				{ className: 'xxp-dim-fields' },
				group.kinds.map( function ( kind ) {
					return el( wp.components.TextControl, {
						key: kind.key,
						__next40pxDefaultSize: true,
						__nextHasNoMarginBottom: true,
						label: kind.label,
						value: own( props, where, kind.key ),
						/* THE GROUP'S OWN WORDS. Both of these used to be written into this
						   function — the crop sentence and the example "center" — and this
						   one renderer serves two groups. So Aspect ratio explained how a
						   picture is cropped and offered "center" for a field that wants
						   "16 / 9". */
						help: group.help || undefined,
						placeholder: inForce( props, where, kind.key ) || group.hint || '',
						onChange: function ( value ) {
							write( props, 'xxpSize', where, kind.key, undefined === value || null === value ? '' : String( value ) );
						},
					} );
				} )
			)
		);
	}

	/**
	 * The parts of the design this block is, as a quiet read-only line — only
	 * for someone who can edit the theme. A client is offered no list: the parts
	 * are the design's skeleton, not a setting anybody picks.
	 */
	function partsLine( props ) {
		var held = props.attributes.xxpParts || [];

		if ( ! held.length || ! SETTINGS.canEditTheme ) {
			return null;
		}

		return el(
			'p',
			{ className: 'xxp-dim-parts' },
			el( 'span', { className: 'xxp-dim-parts-label' }, __( 'Part of the design', 'theme-textdomain' ) ),
			held.map( function ( word ) {
				var name = String( word ).replace( /^xxp-/, '' ).replace( /-/g, ' ' );

				return name.charAt( 0 ).toUpperCase() + name.slice( 1 );
			} ).join( ', ' )
		);
	}

	/* ---- how the panel is arranged: see xxp_panel_sections() ---- */

	/*
	 * What the sizing control draws: whatever its presets write, and the basis they leave
	 * alone. Read from the presets rather than written out, so adding a fourth preset that
	 * touches a fourth setting does not leave that setting drawn in two places at once.
	 */
	/* and what the border control draws: four sides × colour, style, width, plus the corners */
	var BORDERED = [ 'btc', 'brc', 'bbc', 'blc', 'bts', 'brs', 'bbs', 'bls', 'btw', 'brw', 'bbw', 'blw', 'rtl', 'rtr', 'rbr', 'rbl' ];

	var SIZED = Object.keys( SETTINGS.sizing || {} )
		.reduce( function ( keys, name ) {
			return keys.concat( Object.keys( ( SETTINGS.sizing[ name ] || {} ).writes || {} ) );
		}, [ 'basis' ] )
		.filter( function ( key, at, all ) {
			return all.indexOf( key ) === at;
		} );

	/**
	 * Every setting by its key, with the group it came from.
	 *
	 * A section names settings — `disp`, `dir` — and a renderer needs the GROUP they
	 * belong to, because the group is what says whether they are words, lengths or marks.
	 *
	 * @param {Object[]} groups The groups offered on this block.
	 * @return {Object} key → { group, kind }.
	 */
	function byKind( groups ) {
		var found = {};

		groups.forEach( function ( group ) {
			( group.kinds || [] ).forEach( function ( kind ) {
				found[ kind.key ] = { group: group, kind: kind };
			} );
		} );

		return found;
	}

	/**
	 * A list of setting keys, cut into the groups that own them, in the order written.
	 *
	 * Consecutive keys from one group become one slice, so `disp, dir, just` is drawn by a
	 * single control rather than three. A slice is its group with the other settings taken
	 * out and the heading dropped — the section above it is the heading now.
	 *
	 * @param {Object}   index From byKind().
	 * @param {string[]} keys  What to draw.
	 * @return {Object[]} Groups to render.
	 */
	function slices( index, keys, heading ) {
		var out = [];

		( keys || [] ).forEach( function ( key ) {
			var found = index[ key ];

			if ( ! found ) {
				return;
			}

			var last = out[ out.length - 1 ];

			if ( last && last.from === found.group ) {
				last.kinds.push( found.kind );

				return;
			}

			out.push( { from: found.group, kinds: [ found.kind ] } );
		} );

		return out.map( function ( slice ) {
			/* `heading` is the section's own name, carried down so a control standing
			   alone under it does not repeat it: Position / position. */
			return Object.assign( {}, slice.from, { kinds: slice.kinds, label: '', heading: heading || '' } );
		} );
	}

	/**
	 * Does this control's name only repeat the heading above it?
	 *
	 * @param {Object} group The group, carrying the section's name.
	 * @param {Object} kind  The setting.
	 * @return {boolean} True when the label says nothing the heading has not.
	 */
	function saidAlready( group, kind ) {
		var heading = String( group.heading || group.label || '' ).trim().toLowerCase();

		return (
			'' !== heading &&
			group.kinds.length === 1 &&
			String( kind.label || '' ).trim().toLowerCase() === heading
		);
	}

	/**
	 * One group, drawn by whichever renderer its shape asks for.
	 *
	 * @param {Object} props Block props.
	 * @param {string} where Which screen.
	 * @param {Object} group The group.
	 * @return {Object|null} The control.
	 */
	function drawGroup( props, where, group ) {
		if ( group.toggle ) {
			return toggleGroup( props, where, group );
		}

		if ( group.sides ) {
			if ( ! SpacingControl ) {
				return null;
			}

			return el(
				'div',
				{ className: 'xxp-dim-spacing' },
				spacingGroup( props, where, group ),
				/* a sentence under a group of sides — the border width says here that it
				   is only the width, because the editor's own Border panel is right above
				   it and two controls for one idea is a fair thing to ask about */
				group.help ? el( 'p', { className: 'xxp-dim-note' }, group.help ) : null
			);
		}

		if ( group.words ) {
			return wordsGroup( props, where, group );
		}

		if ( group.choices ) {
			return choiceGroup( props, where, group );
		}

		return measureGroup( props, where, group );
	}

	/**
	 * Sizing — Shrink, Grow, Fixed, and the numbers behind them.
	 *
	 * The presets write `flex-grow` and `flex-shrink` together; pressing the pressed one
	 * clears both, which is how every other control in this panel gives a screen back to
	 * the one above it. The exact numbers open under "…" and are the same fields as before
	 * — `flex: 1.5 1 460px` is a real value in this design and the panel must still say it.
	 */
	function SizingRow( given ) {
		var props = given.props;
		var where = given.where;
		var index = given.index;
		var presets = SETTINGS.sizing || {};
		var names = Object.keys( presets );
		var opened = wp.element.useState( false );
		var fields = slices( index, [ 'grow', 'shrink', 'basis' ] );

		/* which preset, if any, these two numbers already are */
		var chosen = '';

		names.forEach( function ( name ) {
			var writes = ( presets[ name ] || {} ).writes || {};

			var same = Object.keys( writes ).every( function ( key ) {
				return String( own( props, where, key ) ) === String( writes[ key ] );
			} );

			if ( same && ! chosen ) {
				chosen = name;
			}
		} );

		/* what is actually in force here, preset or not, so the numbers are never hidden */
		var line = [ 'grow', 'shrink', 'basis' ]
			.map( function ( key ) {
				var held = inForce( props, where, key );

				return held ? ( index[ key ] ? index[ key ].kind.label : key ) + ' ' + held : '';
			} )
			.filter( Boolean )
			.join( ' · ' );

		/* the numbers open by themselves when they are not one of the three, so a value
		   this control cannot say is never a value the panel hides */
		var custom = opened[ 0 ] || ( ! chosen && !! line ) || ! Toggle || ! ToggleWord;

		return el(
			'div',
			{ className: 'xxp-dim-sizing' },
			! Toggle || ! ToggleWord
				? null
				: el(
					Toggle,
					{
						label: __( 'Sizing', 'theme-textdomain' ),
						value: chosen,
						isBlock: true,
						isDeselectable: true,
						__next40pxDefaultSize: true,
						__nextHasNoMarginBottom: true,
						onChange: function ( value ) {
							var writes = value ? ( presets[ value ] || {} ).writes || {} : {};
							var said = {};

							/* off, or onto another preset: every key any preset can write is
							   emptied first, so Fixed never leaves Grow's 1 behind — and all
							   of it goes in one write, or each key overwrites the one before */
							names.forEach( function ( name ) {
								Object.keys( ( presets[ name ] || {} ).writes || {} ).forEach( function ( key ) {
									said[ key ] = '';
								} );
							} );

							Object.keys( writes ).forEach( function ( key ) {
								said[ key ] = writes[ key ];
							} );

							writeMany( props, 'xxpSize', where, said );
						},
					},
					names.map( function ( name ) {
						return el( ToggleWord, {
							key: name,
							value: name,
							label: ( presets[ name ] || {} ).label || name,
						} );
					} )
				),
			! line
				? null
				: el( 'p', { className: 'xxp-dim-sizing-line' }, line ),
			el(
				wp.components.Button,
				{
					className: 'xxp-dim-sizing-more',
					variant: 'tertiary',
					onClick: function () {
						opened[ 1 ]( ! opened[ 0 ] );
					},
				},
				custom ? __( 'Hide the numbers', 'theme-textdomain' ) : __( 'The numbers', 'theme-textdomain' )
			),
			! custom
				? null
				: fields.map( function ( group, i ) {
					return el( wp.element.Fragment, { key: i }, drawGroup( props, where, group ) );
				} )
		);
	}

	/**
	 * Is this block a grid, or inside one?
	 *
	 * Two ways to be a grid, and the panel has to know both: core's own Grid layout, and
	 * `display: grid` chosen in this panel at any screen. A block is IN a grid when its
	 * parent is one by either test — which is a question about another block, so it is
	 * asked of the store rather than of our own props.
	 *
	 * @param {Object} props Block props.
	 * @return {Object} { isGrid, inGrid }.
	 */
	function gridness( props ) {
		var grid = function ( attributes ) {
			if ( ! attributes ) {
				return false;
			}

			if ( 'grid' === ( ( attributes.layout || {} ).type || '' ) ) {
				return true;
			}

			var held = attributes.xxpSize || {};

			return Object.keys( held ).some( function ( screen ) {
				return 'grid' === held[ screen ].disp;
			} );
		};

		var store = wp.data.select( 'core/block-editor' );
		var parent = null;

		if ( store && props.clientId ) {
			var up = store.getBlockRootClientId( props.clientId );

			parent = up ? store.getBlockAttributes( up ) : null;
		}

		/*
		 * A value that EXISTS is never hidden, whatever the condition says. Take core's
		 * Grid layout off a block that already has a column count and the count is still
		 * in the content, still writing a property — and a panel that stopped showing it
		 * would be the worst kind of tidy: the value is there and nobody can reach it.
		 */
		var holds = function ( keys ) {
			var held = props.attributes.xxpSize || {};

			return Object.keys( held ).some( function ( screen ) {
				return keys.some( function ( key ) {
					return '' !== ( held[ screen ][ key ] || '' );
				} );
			} );
		};

		return {
			isGrid: grid( props.attributes ) || holds( [ 'cols', 'ctrack' ] ),
			inGrid: grid( parent ) || holds( [ 'gcol' ] ),
		};
	}

	/**
	 * `grid-column`, asked as a start and a width.
	 *
	 * The property is written in grid LINES and the field used to take them raw. What goes
	 * out is unchanged — `3 / -1`, `span 2` — and what comes in is two answers: which
	 * column this block starts in, and how much of the row it takes.
	 */
	function GridColumnRow( given ) {
		var props = given.props;
		var where = given.where;
		var kind = given.kind;
		var widths = SETTINGS.gridWidths || {};
		var held = own( props, where, 'gcol' );
		var shown = inForce( props, where, 'gcol' );

		/* read the line syntax back into the two answers */
		var read = function ( value ) {
			var said = String( value || '' ).trim();

			if ( ! said ) {
				return { start: '', width: '' };
			}

			var halves = said.split( '/' ).map( function ( half ) {
				return half.trim();
			} );

			var start = /^-?\d+$/.test( halves[ 0 ] ) ? halves[ 0 ] : '';
			var end = halves.length > 1 ? halves[ 1 ] : ( /^span \d+$/.test( halves[ 0 ] ) ? halves[ 0 ] : '' );
			var width = '';

			if ( '-1' === end ) {
				width = '-1';
			} else if ( /^span \d+$/.test( end ) ) {
				width = end.replace( 'span ', '' );
			}

			return { start: start, width: width };
		};

		var mine = read( held );

		/* and write it back out */
		var say = function ( start, width ) {
			if ( ! start && ! width ) {
				return '';
			}

			if ( ! start ) {
				return 'span ' + ( width && '-1' !== width ? width : '1' );
			}

			if ( ! width ) {
				return start;
			}

			return start + ' / ' + ( '-1' === width ? '-1' : 'span ' + width );
		};

		return el(
			'div',
			{ className: 'xxp-dim-group' },
			el(
				'div',
				/* `is-asked` — these two labels are a question of ours, not the name of a
				   property, so they keep their capital letter where a CSS name does not */
				{ className: 'xxp-dim-fields is-asked' },
				el( wp.components.TextControl, {
					className: 'xxp-dim-count',
					label: __( 'Starts in column', 'theme-textdomain' ),
					value: mine.start,
					placeholder: __( 'where it falls', 'theme-textdomain' ),
					type: 'number',
					min: 1,
					step: 1,
					onChange: function ( value ) {
						write( props, 'xxpSize', where, 'gcol', say( undefined === value || null === value ? '' : String( value ), mine.width ) );
					},
				} ),
				el( wp.components.SelectControl, {
					className: 'xxp-dim-text',
					__next40pxDefaultSize: true,
					__nextHasNoMarginBottom: true,
					label: __( 'Takes', 'theme-textdomain' ),
					value: mine.width,
					options: Object.keys( widths ).map( function ( value ) {
						return { value: value, label: widths[ value ] };
					} ),
					onChange: function ( value ) {
						write( props, 'xxpSize', where, 'gcol', say( mine.start, value ) );
					},
				} )
			),
			/* what it writes, and what a wider screen already says — the property is still
			   the property, and somebody reading the CSS should find it here */
			el(
				'p',
				{ className: 'xxp-dim-sizing-line' },
				held
					? ( kind ? kind.label : 'grid-column' ) + ': ' + held
					: ( shown
						? /* translators: %s: the value a wider screen already sets. */
						  sprintf( __( 'As set wider: %s', 'theme-textdomain' ), shown )
						: __( 'Not set', 'theme-textdomain' ) )
			)
		);
	}

	/* ---- the border, per screen ---- */

	/* the four sides and the four corners, in the shape core's own controls speak */
	var SIDES = { top: 'bt', right: 'br', bottom: 'bb', left: 'bl' };
	var CORNERS = { topLeft: 'rtl', topRight: 'rtr', bottomRight: 'rbr', bottomLeft: 'rbl' };

	/**
	 * The border on THIS screen, read for core's BorderBoxControl.
	 *
	 * On the middle screen the value is core's own `style.border` — the same place the
	 * editor's Border panel wrote it, so a border set before any of this still shows and
	 * still edits. On the other six it is this panel's keys.
	 *
	 * @param {Object} props The block's props.
	 * @param {string} where Which screen.
	 * @return {Object} side → { color, style, width }.
	 */
	function borderValue( props, where ) {
		var out = {};

		if ( 'base' === where ) {
			var held = ( props.attributes.style || {} ).border || {};

			Object.keys( SIDES ).forEach( function ( side ) {
				var one = held[ side ] || {};

				out[ side ] = {
					color: one.color || held.color || undefined,
					style: one.style || held.style || undefined,
					width: one.width || held.width || undefined,
				};
			} );

			return out;
		}

		Object.keys( SIDES ).forEach( function ( side ) {
			out[ side ] = {
				color: own( props, where, SIDES[ side ] + 'c' ) || undefined,
				style: own( props, where, SIDES[ side ] + 's' ) || undefined,
				width: own( props, where, SIDES[ side ] + 'w' ) || undefined,
			};
		} );

		return out;
	}

	/**
	 * And written back where that screen keeps it.
	 *
	 * @param {Object} props The block's props.
	 * @param {string} where Which screen.
	 * @param {Object} next  Core's value: flat when the sides are linked, per side when not.
	 * @return {void}
	 */
	function writeBorder( props, where, next ) {
		var said = next || {};
		var flat = said.top || said.right || said.bottom || said.left ? null : said;

		var forSide = function ( side ) {
			return flat || said[ side ] || {};
		};

		if ( 'base' === where ) {
			var style = Object.assign( {}, props.attributes.style );
			var border = Object.assign( {}, style.border );

			/* core keeps the radius beside the sides, and it is not ours to touch here */
			Object.keys( SIDES ).forEach( function ( side ) {
				delete border[ side ];
			} );

			delete border.color;
			delete border.style;
			delete border.width;

			if ( flat ) {
				[ 'color', 'style', 'width' ].forEach( function ( part ) {
					if ( flat[ part ] ) {
						border[ part ] = flat[ part ];
					}
				} );
			} else {
				Object.keys( SIDES ).forEach( function ( side ) {
					var one = {};

					[ 'color', 'style', 'width' ].forEach( function ( part ) {
						if ( said[ side ] && said[ side ][ part ] ) {
							one[ part ] = said[ side ][ part ];
						}
					} );

					if ( Object.keys( one ).length ) {
						border[ side ] = one;
					}
				} );
			}

			if ( Object.keys( border ).length ) {
				style.border = border;
			} else {
				delete style.border;
			}

			props.setAttributes( { style: Object.keys( style ).length ? style : undefined } );

			return;
		}

		var values = {};

		Object.keys( SIDES ).forEach( function ( side ) {
			var one = forSide( side );

			values[ SIDES[ side ] + 'c' ] = one.color || '';
			/*
			 * A width with no style draws nothing: `border-style` begins at `none`, and
			 * core's own border support quietly writes `solid` beside a width for exactly
			 * this reason. The other six screens have to do it themselves, or a width typed
			 * at 1440 is a number that changes nothing on the page.
			 */
			values[ SIDES[ side ] + 's' ] = one.style || ( one.width ? 'solid' : '' );
			values[ SIDES[ side ] + 'w' ] = one.width || '';
		} );

		writeMany( props, 'xxpSize', where, values );
	}

	/**
	 * The corner radii on this screen, and back again. Same rule: core's on the middle
	 * screen, ours on the other six.
	 */
	function radiusValue( props, where ) {
		if ( 'base' === where ) {
			var held = ( ( props.attributes.style || {} ).border || {} ).radius;

			if ( ! held ) {
				return {};
			}

			if ( 'string' === typeof held ) {
				return { topLeft: held, topRight: held, bottomRight: held, bottomLeft: held };
			}

			return Object.assign( {}, held );
		}

		var out = {};

		Object.keys( CORNERS ).forEach( function ( corner ) {
			var one = own( props, where, CORNERS[ corner ] );

			if ( one ) {
				out[ corner ] = one;
			}
		} );

		return out;
	}

	function writeRadius( props, where, next ) {
		var said = next;

		if ( 'base' === where ) {
			var style = Object.assign( {}, props.attributes.style );
			var border = Object.assign( {}, style.border );

			if ( said && ( 'string' === typeof said ? said : Object.keys( said ).length ) ) {
				border.radius = said;
			} else {
				delete border.radius;
			}

			if ( Object.keys( border ).length ) {
				style.border = border;
			} else {
				delete style.border;
			}

			props.setAttributes( { style: Object.keys( style ).length ? style : undefined } );

			return;
		}

		var values = {};
		var all = 'string' === typeof said ? said : '';

		Object.keys( CORNERS ).forEach( function ( corner ) {
			values[ CORNERS[ corner ] ] = all || ( said && said[ corner ] ) || '';
		} );

		writeMany( props, 'xxpSize', where, values );
	}

	/**
	 * The editor's own border controls, pointed at whichever screen is chosen.
	 *
	 * Core's Border panel is hidden — see `editor-panels.css` — because it said one value
	 * for all seven screens and this says the same thing seven times. The components are
	 * core's, so it is the same control, not a copy of one.
	 */
	function BorderRow( given ) {
		var props = given.props;
		var where = given.where;
		var BorderBox = wp.components.__experimentalBorderBoxControl;
		var RadiusControl = wp.blockEditor.__experimentalBorderRadiusControl;
		var settings = wp.data.select( 'core/block-editor' ).getSettings() || {};

		return el(
			'div',
			{ className: 'xxp-dim-border' },
			! BorderBox
				? null
				: el( BorderBox, {
					label: __( 'Border', 'theme-textdomain' ),
					colors: settings.colors || [],
					enableAlpha: true,
					enableStyle: true,
					size: '__unstable-large',
					__experimentalIsRenderedInSidebar: true,
					value: borderValue( props, where ),
					onChange: function ( next ) {
						writeBorder( props, where, next );
					},
				} ),
			! RadiusControl
				? null
				: el(
					'div',
					/* no heading of ours: core's radius control draws its own, and two
					   said RADIUS twice down the same column */
					{ className: 'xxp-dim-radius' },
					el( RadiusControl, {
						values: radiusValue( props, where ),
						onChange: function ( next ) {
							writeRadius( props, where, next );
						},
					} )
				)
		);
	}

	/**
	 * One entry of a section: a whole group, named settings, or the sizing control.
	 *
	 * @param {Object}   props  Block props.
	 * @param {string}   where  Which screen.
	 * @param {Object}   index  From byKind().
	 * @param {Object[]} groups The groups offered on this block.
	 * @param {Object}   entry  What to draw.
	 * @return {Object|null} The control.
	 */
	function drawEntry( props, where, index, groups, entry, heading ) {
		if ( entry.sizing ) {
			return el( SizingRow, { props: props, where: where, index: index } );
		}

		if ( entry.gridcolumn ) {
			return el( GridColumnRow, {
				props: props,
				where: where,
				kind: index.gcol ? index.gcol.kind : null,
			} );
		}

		if ( entry.border ) {
			return el( BorderRow, { props: props, where: where } );
		}

		if ( entry.group ) {
			var one = groups.filter( function ( group ) {
				return group.key === entry.group;
			} )[ 0 ];

			/* a group narrowed to certain blocks is simply absent on the others */
			return one ? drawGroup( props, where, one ) : null;
		}

		return slices( index, entry.kinds, heading ).map( function ( group, i ) {
			return el( wp.element.Fragment, { key: i }, drawGroup( props, where, group ) );
		} );
	}

	/**
	 * The sections, with anything the plan does not mention added to the last one.
	 *
	 * A setting that nobody placed is still a setting, and a panel that silently stopped
	 * drawing it would be the worst of the three outcomes — worse than the old flat list.
	 *
	 * @param {Object[]} groups The groups offered on this block.
	 * @return {Object[]} Sections to draw.
	 */
	function sectionsFor( groups ) {
		var plan = ( SETTINGS.sections || [] ).map( function ( section ) {
			return Object.assign( {}, section, { draw: ( section.draw || [] ).slice() } );
		} );

		if ( ! plan.length ) {
			return [ { key: 'all', open: true, draw: groups.map( function ( group ) {
				return { group: group.key };
			} ) } ];
		}

		var placed = {};

		plan.forEach( function ( section ) {
			[].concat( section.draw, ( section.fold || {} ).draw || [] ).forEach( function ( entry ) {
				if ( entry.group ) {
					placed[ entry.group ] = true;
				}

				/* the sizing control draws three settings and names none of them, so it
				   has to say what it covers — or `flex-grow` is drawn twice, once by the
				   presets and again under More as something nobody placed */
				if ( entry.sizing ) {
					SIZED.forEach( function ( key ) {
						placed[ 'kind:' + key ] = true;
					} );
				}

				if ( entry.gridcolumn ) {
					placed[ 'kind:gcol' ] = true;
				}

				/* the border control draws sixteen settings and names none of them */
				if ( entry.border ) {
					placed.borderw = true;

					BORDERED.forEach( function ( key ) {
						placed[ 'kind:' + key ] = true;
					} );
				}

				( entry.kinds || [] ).forEach( function ( key ) {
					placed[ 'kind:' + key ] = true;
				} );
			} );
		} );

		var last = plan[ plan.length - 1 ];

		groups.forEach( function ( group ) {
			if ( placed[ group.key ] ) {
				return;
			}

			var loose = ( group.kinds || [] ).filter( function ( kind ) {
				return ! placed[ 'kind:' + kind.key ];
			} );

			if ( loose.length === ( group.kinds || [] ).length ) {
				last.draw.push( { group: group.key } );
			} else if ( loose.length ) {
				last.draw.push( { kinds: loose.map( function ( kind ) {
					return kind.key;
				} ) } );
			}
		} );

		return plan;
	}

	/* ---- the Dimensions panel ---- */

	function DimensionsPanel( given ) {
		var props = given.props;
		var held = props.attributes.xxpSize || {};
		var chosen = wp.element.useState( LAST_BAND );
		var where = chosen[ 0 ];
		var setWhere = function ( key ) {
			LAST_BAND = key;
			chosen[ 1 ]( key );
		};

		/* a group that names its blocks is offered on those and nowhere else */
		var groups = ( SETTINGS.groups || [] ).filter( function ( group ) {
			return ! group.steps && ( ! group.blocks || group.blocks.indexOf( props.name ) >= 0 );
		} );

		var index = byKind( groups );
		var sections = sectionsFor( groups );
		var grids = gridness( props );
		var current = band( where );
		var spacing = ( props.attributes.style || {} ).spacing;
		var hasAnything = !! Object.keys( held ).length || !! ( spacing && Object.keys( spacing ).length );

		return el(
			wp.components.PanelBody,
			{ title: __( 'UPQODE Dimensions', 'theme-textdomain' ), initialOpen: false, className: 'xxp-dim-panel' },
			el(
				'div',
				{ className: 'xxp-dim-row', 'data-xxp-screen': where },
				partsLine( props ),
				screenRow( where, setWhere, function ( key ) {
					return !! held[ key ] && !! Object.keys( held[ key ] ).length;
				} ),
				el(
					'p',
					{ className: 'xxp-dim-hint' },
					'base' === where
						? __( '992–1279px, and every screen that says nothing of its own.', 'theme-textdomain' )
						/* translators: the widths this screen covers */
						: wp.i18n.sprintf( __( '%s. Empty follows the screen before it.', 'theme-textdomain' ), current ? current.label : '' )
				),
				/*
				 * The sections, in the order the plan gives them. A section without a name
				 * is drawn open and bare — the box's own settings, which is what the panel
				 * is opened for; the rest carry a heading that folds.
				 */
				sections.map( function ( section ) {
					/* a section that only applies sometimes — the grid ones */
					if ( 'grid' === section.when && ! grids.isGrid ) {
						return null;
					}

					if ( 'in-grid' === section.when && ! grids.inGrid ) {
						return null;
					}

					var body = ( section.draw || [] ).map( function ( entry, i ) {
						return el( wp.element.Fragment, { key: i }, drawEntry( props, where, index, groups, entry, section.label ) );
					} );

					var fold = ! section.fold
						? null
						: el(
							wp.components.PanelBody,
							{
								title: section.fold.label,
								initialOpen: false,
								className: 'xxp-dim-fold',
							},
							( section.fold.draw || [] ).map( function ( entry, i ) {
								return el( wp.element.Fragment, { key: i }, drawEntry( props, where, index, groups, entry, section.fold.label ) );
							} )
						);

					if ( ! section.label ) {
						return el( wp.element.Fragment, { key: section.key }, body, fold );
					}

					return el(
						wp.components.PanelBody,
						{
							key: section.key,
							title: section.label,
							initialOpen: !! section.open,
							className: 'xxp-dim-section',
						},
						body,
						fold
					);
				} ),
				/* every screen and the middle one with it — a reset that left the
				   middle behind would leave the fields in front of you full */
				! hasAnything
					? null
					: el(
						wp.components.Button,
						{
							className: 'xxp-dim-reset',
							variant: 'tertiary',
							isDestructive: true,
							onClick: function () {
								var style = Object.assign( {}, props.attributes.style );

								delete style.spacing;

								props.setAttributes( {
									xxpSize: undefined,
									style: Object.keys( style ).length ? style : undefined,
								} );
							},
						},
						__( 'Reset all', 'theme-textdomain' )
					)
			)
		);
	}

	/* ---- the type size, per screen, in the block's Typography group ---- */

	function TypeRow( given ) {
		var props = given.props;
		var chosen = wp.element.useState( LAST_BAND );
		var where = chosen[ 0 ];
		var setWhere = function ( key ) {
			LAST_BAND = key;
			chosen[ 1 ]( key );
		};
		var base = 'base' === where;
		var type = ( props.attributes.style || {} ).typography || {};
		var current = band( where );

		/*
		 * On the middle screen this is core's own font size, so there is one
		 * value and not two; core's own picker is hidden beside it.
		 */
		var mine = base ? ( type.fontSize || '' ) : own( props, where, 'fs' );
		var shown = base ? '' : inForce( props, where, 'fs' );

		return el(
			'div',
			{ className: 'xxp-type-row' },
			screenRow( where, setWhere, function ( key ) {
				return '' !== own( props, key, 'fs' ) || ( 'base' === key && !! ( type.fontSize || props.attributes.fontSize ) );
			} ),
			el( UnitField, {
				__next40pxDefaultSize: true,
				label: __( 'Font size', 'theme-textdomain' ),
				value: mine,
				placeholder: shown || __( 'from the design', 'theme-textdomain' ),
				units: [ { value: 'px', label: 'px', default: 16 }, { value: 'rem', label: 'rem', default: 1 }, { value: 'em', label: 'em', default: 1 } ],
				onChange: function ( value ) {
					var said = undefined === value || null === value ? '' : String( value );

					if ( ! base ) {
						write( props, 'xxpSize', where, 'fs', said );
						return;
					}

					var style = Object.assign( {}, props.attributes.style );
					var heldType = Object.assign( {}, style.typography );

					if ( said ) {
						heldType.fontSize = said;
					} else {
						delete heldType.fontSize;
					}

					if ( Object.keys( heldType ).length ) {
						style.typography = heldType;
					} else {
						delete style.typography;
					}

					props.setAttributes( {
						style: Object.keys( style ).length ? style : undefined,
						fontSize: said ? undefined : props.attributes.fontSize,
					} );
				},
			} ),
			el( 'p', { className: 'xxp-dim-hint' }, current ? current.label : '' )
		);
	}

	function typeFill( props ) {
		var has = ( SETTINGS.groups || [] ).some( function ( group ) {
			return !! group.steps;
		} );
		var type = wp.blocks.getBlockType( props.name );
		var takes = type && type.supports && type.supports.typography;

		/* only where core itself offers a size */
		if ( ! has || ! takes || ! takes.fontSize ) {
			return null;
		}

		return el( TypeRow, { key: 'xxp-type', props: props } );
	}

	/* ---- the Animations panel ---- */

	var ARRIVALS = [
		{ value: '', label: __( 'None — it is simply there', 'theme-textdomain' ) },
		{ value: 'rise', label: __( 'Fade in on load', 'theme-textdomain' ) },
		{ value: 'reveal', label: __( 'Fade in on scroll', 'theme-textdomain' ) },
		{ value: 'line', label: __( 'Line draws itself', 'theme-textdomain' ) },
		{ value: 'zoom', label: __( 'Zoom in on load', 'theme-textdomain' ) },
	];

	function motionPanel( props ) {
		var kind = read( props.attributes, 'xxpMotion', null, 'kind' );

		return el(
			wp.components.PanelBody,
			{ title: __( 'UPQODE Animations', 'theme-textdomain' ), initialOpen: false },
			el( wp.components.SelectControl, {
				__nextHasNoMarginBottom: true,
				label: __( 'How it arrives', 'theme-textdomain' ),
				value: kind || '',
				options: ARRIVALS,
				onChange: function ( value ) {
					write( props, 'xxpMotion', null, 'kind', value );
				},
			} ),
			kind
				? el(
					wp.element.Fragment,
					null,
					el( NumberField, {
						__nextHasNoMarginBottom: true,
						label: __( 'Wait first (milliseconds)', 'theme-textdomain' ),
						help: __( 'Lets one thing arrive after another.', 'theme-textdomain' ),
						value: read( props.attributes, 'xxpMotion', null, 'delay' ) || '',
						min: 0,
						step: 10,
						onChange: function ( value ) {
							write( props, 'xxpMotion', null, 'delay', value ? parseInt( value, 10 ) : '' );
						},
					} ),
					el( NumberField, {
						__nextHasNoMarginBottom: true,
						label: __( 'Step between cards (milliseconds)', 'theme-textdomain' ),
						help: __( 'On a row of cards, each one waits this much longer than the one before it.', 'theme-textdomain' ),
						value: read( props.attributes, 'xxpMotion', null, 'stagger' ) || '',
						min: 0,
						step: 10,
						onChange: function ( value ) {
							write( props, 'xxpMotion', null, 'stagger', value ? parseInt( value, 10 ) : '' );
						},
					} )
				)
				: null
		);
	}

	/* ---- on every block ---- */

	wp.hooks.addFilter(
		'editor.BlockEdit',
		'xxp/panels',
		wp.compose.createHigherOrderComponent( function ( BlockEdit ) {
			return function ( props ) {
				if ( ! props.isSelected ) {
					return el( BlockEdit, props );
				}

				return el(
					wp.element.Fragment,
					null,
					el( BlockEdit, props ),
					el(
						wp.blockEditor.InspectorControls,
						null,
						motionPanel( props ),
						el( DimensionsPanel, { props: props } )
					),
					el( wp.blockEditor.InspectorControls, { group: 'typography' }, typeFill( props ) )
				);
			};
		}, 'withUpqodePanels' )
	);

	/**
	 * The values in the canvas, so what is typed is what is seen.
	 *
	 * Hiding is the exception: a block hidden on the screen the canvas is at
	 * would vanish from the editor and could not be selected again. It is marked
	 * instead (`--xxp-hidden-<screen>`), and panel.css fades and outlines it in
	 * that screen's window. The arrival is not played in the canvas at all.
	 */
	wp.hooks.addFilter(
		'editor.BlockListBlock',
		'xxp/canvas-size',
		wp.compose.createHigherOrderComponent( function ( BlockListBlock ) {
			return function ( props ) {
				var size = props.attributes && props.attributes.xxpSize;

				if ( ! size ) {
					return el( BlockListBlock, props );
				}

				var style = {};

				Object.keys( size ).forEach( function ( where ) {
					Object.keys( size[ where ] || {} ).forEach( function ( kind ) {
						var value = String( size[ where ][ kind ] || '' ).trim();
						var preset = /^var:preset\|(spacing|font-size)\|([a-z0-9-]+)$/.exec( value );

						if ( preset ) {
							value = 'var(--wp--preset--' + preset[ 1 ] + '--' + preset[ 2 ] + ')';
						}

						if ( ! value || /[<>{};]/.test( value ) ) {
							return;
						}

						if ( 'hide' === kind ) {
							style[ '--xxp-hidden-' + where ] = '1';
							return;
						}

						/*
						 * A bare number means pixels — EXCEPT for the settings that are not
						 * lengths, exactly as on the server.
						 *
						 * The server answers those before its own pixel line, with a comment
						 * on each saying why; this had the pixel line and none of the answers.
						 * So the canvas was writing `--xxp-cols-base: 3px`, which makes
						 * `repeat(3px, …)` — an invalid value, so grid-template-columns fell
						 * back to `none` and EVERY grid in the theme stood in one column while
						 * the page showed three. The same line made every `grow` in the canvas
						 * `1px`, which flex-grow ignores, and every `op` `0.8px`.
						 *
						 * Kept as a list beside `xxp_size_value()`'s branches: a kind added
						 * there that is not a length has to be added here too.
						 */
						if ( ! NOT_A_LENGTH[ kind ] && /^-?\d+(\.\d+)?$/.test( value ) ) {
							value += 'px';
						}

						style[ '--xxp-' + kind + '-' + where ] = value;
					} );
				} );

				var extra = Object.assign( {}, props.wrapperProps, {
					style: Object.assign( {}, props.wrapperProps && props.wrapperProps.style, style ),
				} );

				return el( BlockListBlock, Object.assign( {}, props, { wrapperProps: extra } ) );
			};
		}, 'withUpqodeCanvasSize' )
	);

	/**
	 * The three attributes exist on every block, so the editor keeps and saves
	 * them. And the class field is taken away from anyone who cannot edit the
	 * theme: a client picks a style by name; a class field is a place to make a
	 * typo, not a place to design.
	 */
	wp.hooks.addFilter( 'blocks.registerBlockType', 'xxp/panel-attributes', function ( settings ) {
		settings.attributes = Object.assign( {}, settings.attributes, {
			xxpMotion: { type: 'object' },
			xxpSize: { type: 'object' },
			xxpParts: { type: 'array' },
		} );

		if ( ! SETTINGS.canEditTheme ) {
			settings.supports = Object.assign( {}, settings.supports, { customClassName: false } );
		}

		return settings;
	} );

	/* the parts, as classes, in the markup a static block saves */
	wp.hooks.addFilter( 'blocks.getSaveContent.extraProps', 'xxp/parts-into-save', function ( extra, type, attrs ) {
		var held = attrs && attrs.xxpParts;

		if ( ! held || ! held.length ) {
			return extra;
		}

		return Object.assign( {}, extra, {
			className: [ extra.className || '' ].concat( held ).join( ' ' ).trim(),
		} );
	} );

	/* and in the canvas, with the word a picked style stands for */
	wp.hooks.addFilter(
		'editor.BlockListBlock',
		'xxp/parts-in-canvas',
		wp.compose.createHigherOrderComponent( function ( Block ) {
			return function ( props ) {
				var held = ( props.attributes && props.attributes.xxpParts ) || [];
				var said = String( ( props.attributes && props.attributes.className ) || '' ).split( /\s+/ );
				var more = [];

				( SETTINGS.styles || [] ).forEach( function ( one ) {
					if ( one.word && said.indexOf( 'is-style-' + one.name ) >= 0 ) {
						more.push( one.word );
					}
				} );

				if ( ! held.length && ! more.length ) {
					return el( Block, props );
				}

				return el( Block, Object.assign( {}, props, {
					className: [ props.className || '' ].concat( held, more ).join( ' ' ).trim(),
				} ) );
			};
		}, 'xxpPartsInCanvas' )
	);
}( window.wp ) );
