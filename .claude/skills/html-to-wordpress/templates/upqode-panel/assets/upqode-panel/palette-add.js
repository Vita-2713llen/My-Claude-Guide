/*
 * A new colour, made where the colour is chosen.
 *
 * WordPress picks from the palette in one place and builds the palette in
 * another (Styles → Colors → Edit palette). Every swatch popover gets a row of
 * its own underneath: a colour, a name, and a button that writes it into the
 * palette Styles keeps. From then on it is in every picker, and colors.php
 * gives it `--c-<slug>` so the stylesheets can use it by name.
 *
 * Nothing is saved until the editor's own Save; this edits the record Save
 * sends. Found in the page by the swatch grid's class; if that changes the row
 * stops appearing and the palette editor still works.
 */
( function ( wp ) {
	'use strict';

	if ( ! wp || ! wp.data || ! wp.element || ! wp.components ) {
		return;
	}

	var el = wp.element.createElement;
	var __ = wp.i18n.__;

	function stylesId() {
		var core = wp.data.select( 'core' );

		if ( ! core ) {
			return null;
		}

		if ( core.__experimentalGetCurrentGlobalStylesId ) {
			return core.__experimentalGetCurrentGlobalStylesId();
		}

		return core.getCurrentGlobalStylesId ? core.getCurrentGlobalStylesId() : null;
	}

	/**
	 * The slug the colour will be known by — `--c-<slug>` and `.has-<slug>-color`
	 * — kept to the letters those allow and never colliding with one already
	 * there, theme or custom.
	 */
	function slugFor( name, taken ) {
		var base = String( name ).toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-+|-+$/g, '' ) || 'colour';
		var used = {};

		taken.forEach( function ( entry ) {
			if ( entry && entry.slug ) {
				used[ entry.slug ] = true;
			}
		} );

		if ( ! used[ base ] ) {
			return base;
		}

		var n = 2;

		while ( used[ base + '-' + n ] ) {
			n++;
		}

		return base + '-' + n;
	}

	function addColour( name, color ) {
		var id = stylesId();

		if ( ! id ) {
			return;
		}

		var core = wp.data.select( 'core' );
		var record = core.getEditedEntityRecord( 'root', 'globalStyles', id );
		var settings = record && record.settings ? JSON.parse( JSON.stringify( record.settings ) ) : {};
		var base = core.__experimentalGetCurrentThemeBaseGlobalStyles ? ( core.__experimentalGetCurrentThemeBaseGlobalStyles() || {} ) : {};
		var themed = base.settings && base.settings.color && Array.isArray( base.settings.color.palette ) ? base.settings.color.palette : [];

		settings.color = settings.color || {};
		settings.color.palette = settings.color.palette || {};

		var custom = Array.isArray( settings.color.palette.custom ) ? settings.color.palette.custom.slice() : [];

		custom.push( {
			name: name,
			slug: slugFor( name, custom.concat( themed ) ),
			color: color,
		} );

		settings.color.palette.custom = custom;

		wp.data.dispatch( 'core' ).editEntityRecord( 'root', 'globalStyles', id, { settings: settings } );
	}

	function AddColour() {
		var open = wp.element.useState( false );
		var color = wp.element.useState( '#808080' );
		var name = wp.element.useState( '' );

		if ( ! open[ 0 ] ) {
			return el(
				'div',
				{ className: 'xxp-pal-add' },
				el(
					wp.components.Button,
					{
						variant: 'tertiary',
						size: 'small',
						icon: 'plus-alt2',
						onClick: function () {
							open[ 1 ]( true );
						},
					},
					__( 'New colour', 'theme-textdomain' )
				)
			);
		}

		return el(
			'div',
			{ className: 'xxp-pal-add is-open' },
			el( wp.components.ColorPicker, {
				color: color[ 0 ],
				enableAlpha: false,
				onChange: function ( next ) {
					color[ 1 ]( next );
				},
			} ),
			el( wp.components.TextControl, {
				label: __( 'Name', 'theme-textdomain' ),
				value: name[ 0 ],
				__next40pxDefaultSize: true,
				__nextHasNoMarginBottom: true,
				onChange: function ( next ) {
					name[ 1 ]( next );
				},
			} ),
			el(
				'div',
				{ className: 'xxp-pal-add-foot' },
				el(
					wp.components.Button,
					{
						variant: 'primary',
						size: 'small',
						disabled: '' === name[ 0 ].trim(),
						onClick: function () {
							addColour( name[ 0 ].trim(), color[ 0 ] );
							name[ 1 ]( '' );
							open[ 1 ]( false );
						},
					},
					__( 'Add to palette', 'theme-textdomain' )
				),
				el(
					wp.components.Button,
					{
						variant: 'tertiary',
						size: 'small',
						onClick: function () {
							open[ 1 ]( false );
						},
					},
					__( 'Cancel', 'theme-textdomain' )
				)
			)
		);
	}

	var roots = [];

	function sync() {
		/* a popover that has gone takes its root with it */
		roots = roots.filter( function ( kept ) {
			if ( document.body.contains( kept.node ) ) {
				return true;
			}

			kept.root.unmount();

			return false;
		} );

		/* inside a popover only: the palette editor has its own way to add one */
		[].slice.call( document.querySelectorAll( '.components-popover .components-circular-option-picker' ) ).forEach( function ( grid ) {
			var box = grid.parentNode;

			if ( ! box || box.querySelector( ':scope > .xxp-pal-mount' ) ) {
				return;
			}

			var node = document.createElement( 'div' );

			node.className = 'xxp-pal-mount';
			box.appendChild( node );

			var root = wp.element.createRoot( node );

			root.render( el( AddColour ) );
			roots.push( { node: node, root: root } );
		} );
	}

	new window.MutationObserver( sync ).observe( document.body, { childList: true, subtree: true } );
	sync();
}( window.wp ) );
