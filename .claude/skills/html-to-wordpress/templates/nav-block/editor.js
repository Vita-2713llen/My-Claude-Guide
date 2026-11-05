/**
 * Editor registration for the theme's navigation block.
 *
 * No build step on purpose: plain JS with wp.element.createElement, enqueued
 * straight from block.json. A dynamic block MUST also be registered on the
 * client or the editor calls it unknown — "your site doesn't include support
 * for the … block" — while the front end renders perfectly.
 *
 * ServerSideRender means the canvas shows the same markup the front end does,
 * which is the whole point: the designer checks the header where they work.
 */
( function ( blocks, element, blockEditor, components, serverSideRender, coreData, i18n ) {
	const el = element.createElement;
	const { InspectorControls, useBlockProps } = blockEditor;
	const { PanelBody, SelectControl, RangeControl, TextControl, Notice } = components;
	const { __ } = i18n;

	blocks.registerBlockType( 'theme-textdomain/nav', {
		edit: function ( props ) {
			const { attributes, setAttributes } = props;

			// Menus come from core data; no extra endpoint needed.
			const menus = coreData.useSelect( function ( select ) {
				return select( 'core' ).getEntityRecords( 'root', 'menu', { per_page: -1 } );
			}, [] );

			const options = [ { label: __( 'Primary location', 'theme-textdomain' ), value: 0 } ].concat(
				( menus || [] ).map( function ( m ) {
					return { label: m.name, value: m.id };
				} )
			);

			return el(
				element.Fragment,
				null,
				el(
					InspectorControls,
					null,
					el(
						PanelBody,
						{ title: __( 'Menu', 'theme-textdomain' ), initialOpen: true },
						el( SelectControl, {
							label: __( 'Menu', 'theme-textdomain' ),
							value: attributes.menuId,
							options: options,
							onChange: function ( v ) {
								setAttributes( { menuId: parseInt( v, 10 ) || 0 } );
							},
							help: __( 'Items, order and nesting are edited in Appearance → Menus.', 'theme-textdomain' ),
						} ),
						el( RangeControl, {
							label: __( 'Mega panel columns', 'theme-textdomain' ),
							value: attributes.megaColumns,
							min: 1,
							max: 6,
							onChange: function ( v ) {
								setAttributes( { megaColumns: v } );
							},
						} ),
						el( TextControl, {
							label: __( 'Mega panel width', 'theme-textdomain' ),
							value: attributes.megaWidth,
							placeholder: '650px',
							onChange: function ( v ) {
								setAttributes( { megaWidth: v } );
							},
						} ),
						el(
							Notice,
							{ status: 'info', isDismissible: false },
							__( 'Add the CSS class "mega" to a top-level menu item to give it the panel layout.', 'theme-textdomain' )
						)
					)
				),
				el(
					'div',
					useBlockProps(),
					el( serverSideRender, {
						block: 'theme-textdomain/nav',
						attributes: attributes,
					} )
				)
			);
		},
		save: function () {
			return null; // Dynamic: never validated, so the markup can be anything.
		},
	} );
} )(
	window.wp.blocks,
	window.wp.element,
	window.wp.blockEditor,
	window.wp.components,
	window.wp.serverSideRender,
	window.wp.data,
	window.wp.i18n
);
