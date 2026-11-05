/**
 * Export and Import for the whole of Styles, on a screen of their own.
 *
 * Five sections travel in one file — Colors, Typography, Background, Shadows
 * and Form fields — reached by one row in the Styles list, under Blocks.
 *
 * The screen exists because the shape before it did not read as anything. The
 * row used to export on the first press and import by having a file dropped on
 * it: one control, which was what was asked for, and nobody could see that the
 * second half was there. A screen with two named buttons and a visible field
 * for the file says what it does without being explained, and that is worth
 * more than the press it costs.
 *
 * **Nothing here keeps a copy of anything.** Colors, Background and Shadows are
 * read from and written back to WordPress's own global styles record — the one
 * the five screens edit — and Typography and Form fields add the two theme
 * options that hold the per-width scale and the field skin.
 *
 * **Export carries the design, import writes only the overrides.** The user
 * record alone is a list of overrides and on an untouched site it is empty, so
 * the file would be too; `theme.json` is merged under it on the way out. On the
 * way back only what the file says is written, or importing anything would copy
 * the whole of this site's theme.json into the database and every later change
 * to the theme would stop reaching the site.
 *
 * **An import is an unsaved change.** It lands exactly as if the screens had
 * been filled in by hand, so the editor shows Save and a file read by mistake
 * is undone by not pressing it. A transfer that wrote straight to the database
 * would be the one action in Styles with no way back.
 *
 * There is no slot, filter or hook anywhere in Global Styles, so the row is
 * cloned from one WordPress drew and the list steps aside when it is pressed —
 * see `editor-field-styles.js`, which puts its own row in the same list the
 * same way. It fails quietly: if the card stops matching, nothing is mounted
 * and every screen still works.
 *
 * @package theme-textdomain
 */
( function ( wp ) {
	var config = window.xxpStylesTransfer;

	if ( ! config || ! wp.data || ! wp.element || ! wp.components ) {
		return;
	}

	var el = wp.element.createElement;
	/* ---- reading and writing a dotted path ---- */

	/**
	 * What sits at a dotted path, or nothing.
	 *
	 * @param {Object} object The record.
	 * @param {string} path   Dotted.
	 * @return {*} The value, or undefined.
	 */
	function at( object, path ) {
		return path.split( '.' ).reduce( function ( held, key ) {
			return held && 'object' === typeof held ? held[ key ] : undefined;
		}, object );
	}

	/**
	 * The same object with one path set, copied the whole way down.
	 *
	 * Copied rather than written into, because the record belongs to the data
	 * store: changing it in place changes what every other screen is looking at
	 * without telling any of them, and the editor would show the old values
	 * until something else happened to redraw them.
	 *
	 * @param {Object} object The record.
	 * @param {string} path   Dotted.
	 * @param {*}      value  What to put there; undefined removes the key.
	 * @return {Object} A new record.
	 */
	function put( object, path, value ) {
		var keys = path.split( '.' );
		var key = keys[ 0 ];
		var next = Object.assign( {}, object || {} );

		if ( 1 === keys.length ) {
			if ( undefined === value ) {
				delete next[ key ];
			} else {
				next[ key ] = value;
			}

			return next;
		}

		next[ key ] = put( next[ key ], keys.slice( 1 ).join( '.' ), value );

		return next;
	}

	/**
	 * Whether a value holds anything worth carrying.
	 *
	 * @param {*} value Anything.
	 * @return {boolean} Whether it is worth a line in the file.
	 */
	function has( value ) {
		if ( null === value || undefined === value ) {
			return false;
		}

		if ( Array.isArray( value ) ) {
			return value.length > 0;
		}

		if ( 'object' === typeof value ) {
			return Object.keys( value ).length > 0;
		}

		return '' !== String( value ).trim();
	}

	/**
	 * How many settings a section's contents amount to.
	 *
	 * Counted one level in, which is what a person reads it as: four colours and
	 * a background is five, not the thirty keys they are made of.
	 *
	 * @param {Object} part One section of the file.
	 * @return {number} The count.
	 */
	function count( part ) {
		var n = 0;

		Object.keys( part || {} ).forEach( function ( key ) {
			var value = part[ key ];

			if ( ! has( value ) ) {
				return;
			}

			n += 'object' === typeof value && ! Array.isArray( value )
				? Object.keys( value ).length
				: 1;
		} );

		return n;
	}

	/**
	 * Two records, the second winning wherever it speaks.
	 *
	 * Objects are merged key by key; an array is a whole answer and replaces
	 * the one under it, because half a palette is not a palette.
	 *
	 * @param {*} base  What the design says.
	 * @param {*} over  What has been decided on top of it.
	 * @return {*} The two, resolved.
	 */
	function merge( base, over ) {
		if ( undefined === over ) {
			return base;
		}

		if ( ! base || ! over || Array.isArray( base ) || Array.isArray( over ) ||
			'object' !== typeof base || 'object' !== typeof over ) {
			return over;
		}

		var out = Object.assign( {}, base );

		Object.keys( over ).forEach( function ( key ) {
			out[ key ] = merge( base[ key ], over[ key ] );
		} );

		return out;
	}

	/* ---- where the five sections live ---- */

	/**
	 * The option a section is kept in, by the section's name.
	 *
	 * @param {string} key The section.
	 * @return {string} The option name, or ''.
	 */
	function optionName( key ) {
		return ( config.sections[ key ] && config.sections[ key ].option ) || '';
	}

	/**
	 * The global styles record this site is editing, and its id.
	 *
	 * @return {{id: ?number, record: Object}} Both, or an empty record.
	 */
	function globalStyles() {
		var core = wp.data.select( 'core' );
		var id = core && core.__experimentalGetCurrentGlobalStylesId
			? core.__experimentalGetCurrentGlobalStylesId()
			: null;

		/*
		 * The user record alone is a list of overrides, and on a site nobody
		 * has touched it is empty — which is an honest answer to the wrong
		 * question. What a person pressing this wants is the look, so the
		 * theme's own `theme.json` is read first and the overrides laid on
		 * top. Writing is still only ever the overrides; see apply().
		 */
		var base = core && core.__experimentalGetCurrentThemeBaseGlobalStyles
			? ( core.__experimentalGetCurrentThemeBaseGlobalStyles() || {} )
			: {};
		var user = id ? ( core.getEditedEntityRecord( 'root', 'globalStyles', id ) || {} ) : {};

		return {
			id: id,
			user: user,
			record: merge(
				{ settings: base.settings || {}, styles: base.styles || {} },
				{ settings: user.settings || {}, styles: user.styles || {} }
			),
		};
	}

	/**
	 * The two theme options, as the editor currently holds them.
	 *
	 * @return {Object} Option name to value.
	 */
	function options() {
		var site = wp.data.select( 'core' ).getEditedEntityRecord( 'root', 'site' ) || {};
		var out = {};

		/*
		 * The design first, the decisions on top.
		 *
		 * An option nobody has written to comes back from the REST API as an
		 * empty **array**, not an empty object, and an array is a whole answer
		 * to merge() — so the design was replaced by nothing and typography and
		 * the form fields went into the file empty while every other section
		 * was full. Anything that is not a plain object means "nothing set".
		 */
		out[ optionName( 'typography' ) ] = merge( config.typeDefaults || {}, asObject( site[ optionName( 'typography' ) ] ) );
		out[ optionName( 'fields' ) ] = merge( config.fieldDefaults || {}, asObject( site[ optionName( 'fields' ) ] ) );

		return out;
	}

	/**
	 * A value when it is a plain object, and an empty one when it is anything else.
	 *
	 * @param {*} value Anything.
	 * @return {Object} The object, or {}.
	 */
	function asObject( value ) {
		return value && 'object' === typeof value && ! Array.isArray( value ) ? value : {};
	}

	/**
	 * Say what happened, where there is room to say it.
	 *
	 * Twice, on purpose: in the snackbar, which is where the editor says
	 * things, and on the screen itself, which is where the person is looking.
	 *
	 * @param {string}    text The sentence.
	 * @param {string}    kind 'info' or 'error'.
	 * @param {?Function} tell The screen's own setter, when a screen is open.
	 * @return {void}
	 */
	function say( text, kind, tell ) {
		if ( tell ) {
			tell( text );
		}

		var notices = wp.data.dispatch( 'core/notices' );

		if ( notices && notices.createNotice ) {
			notices.createNotice( kind || 'info', text, {
				type: 'snackbar',
				isDismissible: true,
			} );

			return;
		}

		/* an editor without the notices store is not one this theme has met,
		   but silence would be worse than the browser's own box */
		window.alert( text ); // eslint-disable-line no-alert
	}

	/* ---- the file ---- */

	/**
	 * Everything the five sections hold, as the object the file carries.
	 *
	 * @param {Object} record The global styles record.
	 * @param {Object} held   The two theme options, by name.
	 * @return {Object} The file's contents.
	 */
	function asFile( record, held ) {
		var sections = {};

		Object.keys( config.sections ).forEach( function ( key ) {
			var spec = config.sections[ key ];
			var part = {};

			( spec.paths || [] ).forEach( function ( path ) {
				var value = at( record, path );

				if ( has( value ) ) {
					part[ path ] = value;
				}
			} );

			/* Text, Link, Heading and the rest keep their colour and their type
			   in one place each, so the section takes only its own key out of
			   them and leaves the other sections theirs. */
			if ( spec.elements ) {
				var elements = at( record, 'styles.elements' ) || {};
				var kept = {};

				Object.keys( elements ).forEach( function ( name ) {
					var value = elements[ name ] && elements[ name ][ spec.elements ];

					if ( has( value ) ) {
						kept[ name ] = value;
					}
				} );

				if ( has( kept ) ) {
					part.elements = kept;
				}
			}

			if ( spec.option && has( held[ spec.option ] ) ) {
				part.option = held[ spec.option ];
			}

			/* all five, always. A section left out of the file is a section the
			   other site has to be told about separately, and the whole point
			   of one button is that there is nothing else to tell. */
			sections[ key ] = part;
		} );

		return {
			marker: config.mark,
			version: 1,
			site: config.site,
			taken: new Date().toISOString().slice( 0, 10 ),
			sections: sections,
		};
	}

	/**
	 * And back: what of a file this site is willing to believe.
	 *
	 * Everything is checked rather than trusted. The file came off somebody's
	 * disk, and the only thing worse than refusing it is writing nonsense into
	 * the site's colours — so a section this theme does not have, a type token
	 * it has never heard of, a value that is not a plain one, are all dropped
	 * and the rest is kept.
	 *
	 * @param {Object} file What was read.
	 * @return {Object|null} Sections, or nothing if it is not one of ours.
	 */
	function fromFile( file ) {
		if ( ! file || config.mark !== file.marker || ! file.sections || 'object' !== typeof file.sections ) {
			return null;
		}

		var out = {};

		Object.keys( file.sections ).forEach( function ( key ) {
			var spec = config.sections[ key ];
			var given = file.sections[ key ];

			if ( ! spec || ! given || 'object' !== typeof given ) {
				return;
			}

			var part = {};

			( spec.paths || [] ).forEach( function ( path ) {
				if ( has( given[ path ] ) && 'object' === typeof given[ path ] ) {
					part[ path ] = given[ path ];
				}
			} );

			if ( spec.elements && given.elements && 'object' === typeof given.elements ) {
				part.elements = given.elements;
			}

			if ( spec.option && has( given.option ) ) {
				var value = 'typography' === key
					? cleanScale( given.option )
					: cleanFields( given.option );

				if ( has( value ) ) {
					part.option = value;
				}
			}

			if ( has( part ) ) {
				out[ key ] = part;
			}
		} );

		return out;
	}

	/**
	 * Whether a value is the kind of thing one of these options holds.
	 *
	 * A length, a number or a weight — never markup, never a url. The length cap
	 * and the punctuation are what stop a file turning into a stylesheet.
	 *
	 * @param {*} value Anything.
	 * @return {boolean} Whether to keep it.
	 */
	function plain( value ) {
		if ( 'string' !== typeof value && 'number' !== typeof value ) {
			return false;
		}

		value = String( value ).trim();

		return '' !== value && value.length <= 60 && ! /[<>{};]/.test( value );
	}

	/**
	 * The type scale, reduced to bands and tokens this site actually has.
	 *
	 * @param {Object} given What the file held.
	 * @return {Object} Bands to tokens.
	 */
	function cleanScale( given ) {
		var out = {};

		Object.keys( given || {} ).forEach( function ( band ) {
			if ( ! config.bands[ band ] || ! given[ band ] || 'object' !== typeof given[ band ] ) {
				return;
			}

			var kept = {};

			Object.keys( given[ band ] ).forEach( function ( token ) {
				if ( config.tokens[ token ] && plain( given[ band ][ token ] ) ) {
					kept[ token ] = String( given[ band ][ token ] ).trim();
				}
			} );

			if ( Object.keys( kept ).length ) {
				out[ band ] = kept;
			}
		} );

		return out;
	}

	/**
	 * The field skin, reduced to the states and tokens this site has.
	 *
	 * @param {Object} given What the file held.
	 * @return {Object} States to tokens, or tokens.
	 */
	function cleanFields( given ) {
		var out = {};

		Object.keys( given || {} ).forEach( function ( key ) {
			var value = given[ key ];

			/* kept in one shape or in two, depending on how many states the
			   skin was given; both are read */
			if ( value && 'object' === typeof value ) {
				if ( ! config.states || ! config.states[ key ] ) {
					return;
				}

				var kept = {};

				Object.keys( value ).forEach( function ( token ) {
					if ( config.fields[ token ] && plain( value[ token ] ) ) {
						kept[ token ] = String( value[ token ] ).trim();
					}
				} );

				if ( Object.keys( kept ).length ) {
					out[ key ] = kept;
				}

				return;
			}

			if ( config.fields[ key ] && plain( value ) ) {
				out[ key ] = String( value ).trim();
			}
		} );

		return out;
	}

	/* ---- the two things the row does ---- */

	/**
	 * Take it away as a file.
	 *
	 * @return {void}
	 */
	function save() {
		var state = globalStyles();
		var file = asFile( state.record, options() );
		var totals = Object.keys( file.sections ).map( function ( key ) {
			return config.sections[ key ].label.toLowerCase() + ' ' + count( file.sections[ key ] );
		} );
		var mine = Object.keys( file.sections ).reduce( function ( n, key ) {
			return n + count( file.sections[ key ] );
		}, 0 );

		var text = JSON.stringify( file, null, '\t' );
		var url = window.URL.createObjectURL( new window.Blob( [ text ], { type: 'application/json' } ) );
		var a = document.createElement( 'a' );

		a.href = url;
		a.download = ( config.name || 'site' ) + '-styles-' + new Date().toISOString().slice( 0, 10 ) + '.json';
		document.body.appendChild( a );
		a.click();
		a.remove();
		window.URL.revokeObjectURL( url );

		say( mine + ' setting' + ( 1 === mine ? '' : 's' ) + ' saved to a file — ' + totals.join( ', ' ) + '.' );
	}

	/**
	 * Read a file and put the sections back where they came from.
	 *
	 * @param {File} picked What was dropped or chosen.
	 * @return {void}
	 */
	function load( picked, tell ) {
		var reader = new window.FileReader();

		reader.onload = function () {
			var parsed;

			try {
				parsed = JSON.parse( String( reader.result ) );
			} catch ( e ) {
				say( 'That file is not readable as JSON — nothing was changed.', 'error', tell );

				return;
			}

			var next = fromFile( parsed );

			if ( null === next ) {
				say( 'That is not a Styles file from this theme — nothing was changed.', 'error', tell );

				return;
			}

			apply( next, tell );
		};

		reader.readAsText( picked );
	}

	/**
	 * Put the sections back.
	 *
	 * One edit to the record for everything that lives in it, because five
	 * separate edits are five redraws and four chances for the fourth to be
	 * built on the first's stale copy.
	 *
	 * @param {Object} next The sections.
	 * @return {void}
	 */
	function apply( next, tell ) {
		var state = globalStyles();

		/*
		 * The overrides, not the resolved record.
		 *
		 * Export reads the design and the overrides together, so that a file is
		 * always a whole look; writing back must not do the same, or importing
		 * anything would copy the whole of this site's theme.json into the
		 * database as user settings, and every later change to the theme would
		 * stop reaching the site. Only what the file says is written.
		 */
		var changed = Object.assign( {}, state.user );
		var done = [];
		var touched = 0;
		var site = {};

		Object.keys( next ).forEach( function ( key ) {
			var spec = config.sections[ key ];
			var part = next[ key ];
			var n = 0;

			( spec.paths || [] ).forEach( function ( path ) {
				if ( undefined !== part[ path ] ) {
					changed = put( changed, path, part[ path ] );
					n += Object.keys( part[ path ] ).length;
				}
			} );

			if ( spec.elements && part.elements ) {
				Object.keys( part.elements ).forEach( function ( name ) {
					changed = put( changed, 'styles.elements.' + name + '.' + spec.elements, part.elements[ name ] );
					n++;
				} );
			}

			if ( spec.option && undefined !== part.option ) {
				site[ spec.option ] = part.option;
				n += Object.keys( part.option ).length;
			}

			if ( n ) {
				done.push( spec.label.toLowerCase() + ' ' + n );
				touched += n;
			}
		} );

		if ( ! touched ) {
			say( 'Nothing in that file applies to this site — nothing was changed.', 'error', tell );

			return;
		}

		if ( state.id ) {
			wp.data.dispatch( 'core' ).editEntityRecord( 'root', 'globalStyles', state.id, {
				settings: changed.settings || {},
				styles: changed.styles || {},
			} );
		}

		if ( Object.keys( site ).length ) {
			wp.data.dispatch( 'core' ).editEntityRecord( 'root', 'site', undefined, site );
		}

		say( touched + ' setting' + ( 1 === touched ? '' : 's' ) + ' read in — ' + done.join( ', ' ) + '. Press Save to keep them.', 'info', tell );
	}

	/* ---- the screen ---- */

	/**
	 * What is in the file right now, section by section.
	 *
	 * Shown before anything is pressed, because the first question anybody has
	 * about a transfer is "what is actually in it".
	 *
	 * @return {Array} One row per section.
	 */
	function totals() {
		var file = asFile( globalStyles().record, options() );

		return Object.keys( config.sections ).map( function ( key ) {
			return {
				key: key,
				label: config.sections[ key ].label,
				n: count( file.sections[ key ] ),
			};
		} );
	}

	/**
	 * The arrow back to the list, drawn the way Styles draws its own.
	 *
	 * @return {Object} The icon.
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

	/**
	 * The screen itself.
	 *
	 * Two halves with a line between them, because they are two different acts:
	 * above, what is here and a button that writes it out; below, a file to
	 * choose and a button that reads it in. The reading button stays disabled
	 * until a file has been chosen, so the order is never in doubt.
	 *
	 * @return {Object} The screen.
	 */
	function Screen() {
		var picked = wp.element.useState( null );
		var said = wp.element.useState( '' );
		var input = wp.element.useRef( null );
		var rows = totals();

		var mine = rows.reduce( function ( n, one ) {
			return n + one.n;
		}, 0 );

		return el(
			'div',
			{ className: 'xxp-gx-screen' },
			el(
				'div',
				{ className: 'xxp-gx-head' },
				el( wp.components.Button, {
					className: 'xxp-gx-back',
					icon: backArrow(),
					label: 'Back',
					size: 'small',
					onClick: close,
				} ),
				el( 'h2', { className: 'xxp-gx-title' }, 'Export / Import' )
			),
			el(
				'p',
				{ className: 'xxp-gx-lead' },
				'One file holds all five sections below. Take it to another site, or keep it.'
			),
			el(
				'ul',
				{ className: 'xxp-gx-list' },
				rows.map( function ( one ) {
					return el(
						'li',
						{ key: one.key, className: one.n ? 'is-set' : '' },
						el( 'span', null, one.label ),
						el( 'em', null, one.n ? String( one.n ) : '—' )
					);
				} )
			),

			el(
				'div',
				{ className: 'xxp-gx-act' },
				el(
					wp.components.Button,
					{
						variant: 'primary',
						onClick: function () {
							save();
							said[ 1 ]( mine + ' setting' + ( 1 === mine ? '' : 's' ) + ' downloaded as a file.' );
						},
					},
					'Export'
				)
			),

			el( 'hr', { className: 'xxp-gx-rule' } ),

			el( 'p', { className: 'xxp-gx-sub' }, 'Import' ),
			el(
				'p',
				{ className: 'xxp-gx-lead' },
				'Choose a file and press Import. It replaces those five sections and leaves everything else; nothing is written until you press Save.'
			),
			el( 'input', {
				className: 'xxp-gx-file',
				type: 'file',
				accept: 'application/json,.json',
				ref: input,
				onChange: function ( event ) {
					picked[ 1 ]( event.target.files && event.target.files[ 0 ] ? event.target.files[ 0 ] : null );
					said[ 1 ]( '' );
				},
			} ),
			el(
				'div',
				{ className: 'xxp-gx-act' },
				el(
					wp.components.Button,
					{
						variant: 'primary',
						disabled: ! picked[ 0 ],
						onClick: function () {
							if ( picked[ 0 ] ) {
								load( picked[ 0 ], said[ 1 ] );
							}
						},
					},
					'Import'
				)
			),
			said[ 0 ] ? el( 'p', { className: 'xxp-gx-said' }, said[ 0 ] ) : null
		);
	}

	/* ---- the row, and the screen it swaps in ----

	   Cloned from one WordPress drew, because Global Styles has no slot, no
	   filter and no hook. It is put under Blocks, the last row on the screen,
	   because the transfer is about all of it rather than one section — while
	   the shape it is cut from is one of the section rows, which is the one that
	   carries an icon on the left. Those are two different questions. */

	/** A tray with an arrow coming out of it: the thing it does, drawn. */
	var ICON = [
		'M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14',
		'M12 4v9',
		'M8.5 9.5 12 13l3.5-3.5',
	];

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
	 * The row this one goes after: Blocks, the last on the screen.
	 *
	 * @return {Element|null} The row's wrapper.
	 */
	function after() {
		var card = rootCard();

		if ( ! card ) {
			return null;
		}

		var blocks = card.querySelector( '.components-navigator-button[id="/blocks"]' );

		if ( blocks ) {
			return blocks.parentNode;
		}

		return template();
	}

	/**
	 * The row this one is cut from.
	 *
	 * Not the same question as where it goes, and conflating the two is what
	 * broke it first: the Blocks row is the right place to stand but the wrong
	 * shape to copy — it carries a chevron on the right and no icon on the left,
	 * so the clone came out with its icon in the wrong half of the row.
	 *
	 * @return {Element|null} A row with an icon and a label.
	 */
	function template() {
		var card = rootCard();

		if ( ! card ) {
			return null;
		}

		var fields = card.querySelector( '.xxp-fs-row' );

		if ( fields ) {
			return fields;
		}

		var layout = card.querySelector( '.components-navigator-button[id="/layout"]' );

		return layout ? layout.parentNode : null;
	}

	/**
	 * Open the screen: the list steps aside and this takes its place.
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
		mount.className = 'xxp-gx-mount';
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
	 * Put the row in, once, and let it go with the list it belongs to.
	 *
	 * @return {void}
	 */
	function sync() {
		var card = rootCard();
		var anchor = after();

		if ( ! anchor ) {
			if ( open ) {
				open = false;
				root = null;
				mount = null;
			}

			row = null;

			return;
		}

		if ( row && row.parentNode ) {
			if ( row.previousElementSibling !== anchor ) {
				anchor.parentNode.insertBefore( row, anchor.nextSibling );
			}

			return;
		}

		var shape = template();

		if ( ! shape ) {
			return;
		}

		row = shape.cloneNode( true );
		row.classList.add( 'xxp-gx-row' );
		row.classList.remove( 'xxp-fs-row' );

		var button = row.querySelector( 'button' ) || row;

		button.removeAttribute( 'id' );
		button.removeAttribute( 'data-wp-component' );
		button.removeAttribute( 'data-wp-c16t' );

		var icons = button.querySelectorAll( 'svg' );

		if ( icons[ 0 ] ) {
			icons[ 0 ].innerHTML = ICON.map( function ( d ) {
				return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>';
			} ).join( '' );
			icons[ 0 ].setAttribute( 'fill', 'none' );
		}

		var label = button.querySelector( '.components-flex-item' );

		if ( label ) {
			label.textContent = 'Export / Import';
		}

		/*
		 * The arrow on the right, borrowed from Blocks.
		 *
		 * It is the one mark in this list that means "this opens a screen" — the
		 * five section rows have none, and Blocks, which is the only other row
		 * that opens one, has it. Cloned rather than drawn so it is the same
		 * glyph at the same size, dressed by whatever class core gives it.
		 */
		var chevron = card ? card.querySelector( '.components-navigator-button[id="/blocks"] .components-h-stack > svg' ) : null;
		var stack = button.querySelector( '.components-h-stack' );

		if ( chevron && stack ) {
			var copy = chevron.cloneNode( true );

			copy.classList.add( 'xxp-gx-chev' );
			stack.appendChild( copy );
		}

		button.addEventListener( 'click', function ( event ) {
			event.preventDefault();
			event.stopPropagation();
			openScreen();
		} );

		anchor.parentNode.insertBefore( row, anchor.nextSibling );
	}

	new window.MutationObserver( sync ).observe( document.body, { childList: true, subtree: true } );
	sync();
} )( window.wp );
