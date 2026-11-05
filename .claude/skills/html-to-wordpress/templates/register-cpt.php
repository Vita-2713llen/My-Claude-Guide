<?php
/**
 * Collection template — a custom post type, its grouping, and its fields.
 *
 * This is Webflow's Collection. Copy this file per collection, then replace:
 *
 *   theme_prefix_  → the theme's function prefix
 *   THEME_PREFIX_  → the same, upper case
 *   xx_thing       → the post type key, singular, max 20 characters
 *   xx_thing_group → the grouping taxonomy key (delete the taxonomy if none)
 *   Things / Thing → the labels, in the client's words (see the field rules)
 *   xx_thing_field → each meta key — never starting with "_", core/post-meta
 *                    refuses a protected key and prints the key instead
 *
 * **First decide one thing: does an entry have a page of its own?**
 *
 *   No  (team, FAQ, testimonials, logos, events shown only as cards — most
 *       collections): THEME_PREFIX_THING_HAS_PAGE = false. Entries exist as data
 *       for Query Loops; no address of theirs answers anything but 404.
 *   Yes (services, programmes, posts): true. Then the entry is built from blocks,
 *       not fields — "Defects, not trade-offs" in the skill's SKILL.md.
 *
 * Decide it at registration. Patching it later with noindex leaves the pages
 * reachable, in the sitemap, in the site search and in every "View" link.
 *
 * Marked LOAD-BEARING below: settings whose absence breaks something silently.
 *
 * @package ThemeName
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Whether an entry has a page of its own. Most collections: false. */
const THEME_PREFIX_THING_HAS_PAGE = false;

/* ------------------------------------------------------------- registration */

/**
 * Register the post type and its grouping.
 */
function theme_prefix_register_thing() {
	$page = THEME_PREFIX_THING_HAS_PAGE;

	register_post_type(
		'xx_thing',
		array(
			/*
			 * Every label the admin shows, in the client's words. Left to
			 * WordPress, half of them read "Add New Post" and "Post updated".
			 */
			'labels'              => array(
				'name'                  => __( 'Things', 'theme-textdomain' ),
				'singular_name'         => __( 'Thing', 'theme-textdomain' ),
				'menu_name'             => __( 'Things', 'theme-textdomain' ),
				'all_items'             => __( 'All things', 'theme-textdomain' ),
				'add_new'               => __( 'Add thing', 'theme-textdomain' ),
				'add_new_item'          => __( 'Add a thing', 'theme-textdomain' ),
				'edit_item'             => __( 'Edit thing', 'theme-textdomain' ),
				'new_item'              => __( 'New thing', 'theme-textdomain' ),
				'view_item'             => __( 'View thing', 'theme-textdomain' ),
				'search_items'          => __( 'Search things', 'theme-textdomain' ),
				'not_found'             => __( 'No things yet', 'theme-textdomain' ),
				'not_found_in_trash'    => __( 'No things in the bin', 'theme-textdomain' ),
				'featured_image'        => __( 'Photo', 'theme-textdomain' ),
				'set_featured_image'    => __( 'Choose a photo', 'theme-textdomain' ),
				'remove_featured_image' => __( 'Remove the photo', 'theme-textdomain' ),
				'item_published'        => __( 'Thing published.', 'theme-textdomain' ),
				'item_updated'          => __( 'Thing updated.', 'theme-textdomain' ),
			),
			/*
			 * LOAD-BEARING, both of them, even for a collection with no pages: a
			 * Query Loop silently falls back to `post` for a type that fails
			 * is_post_type_viewable(), which is exactly `publicly_queryable`.
			 * Turning this off to "hide the pages" turns every list of these on
			 * the site into the blog. The pages are closed below instead.
			 */
			'public'              => true,
			'publicly_queryable'  => true,

			/* no address, no menu entry, no search result — when there is no page */
			'rewrite'             => $page ? array(
				// singular, so /things/ stays free for the page that lists them
				'slug'       => 'thing',
				'with_front' => false,
			) : false,
			'query_var'           => $page ? 'xx_thing' : false,
			'exclude_from_search' => ! $page,
			'show_in_nav_menus'   => $page,
			'has_archive'         => false,

			'show_in_rest'        => true,
			'show_in_menu'        => true,
			'menu_icon'           => 'dashicons-screenoptions',
			'menu_position'       => 25,
			'supports'            => array(
				'title',
				'thumbnail',
				// the client drags entries into the order the site shows them
				'page-attributes',
				// LOAD-BEARING: without it the REST record has no `meta` object,
				// `show_in_rest` on the fields is ignored, bound blocks print the
				// key, and nothing errors anywhere.
				'custom-fields',
				// LOAD-BEARING even without a page: no 'editor' support means the
				// classic screen, where the block-editor field panel never loads
				'editor',
			),
		)
	);

	/*
	 * The grouping — categories of things. Never a page of its own: nothing
	 * links to "Things in Group A", and WordPress would otherwise serve the blog
	 * archive wearing a heading at /xx_thing_group/group-a/.
	 */
	register_taxonomy(
		'xx_thing_group',
		'xx_thing',
		array(
			'labels'             => array(
				'name'          => __( 'Groups', 'theme-textdomain' ),
				'singular_name' => __( 'Group', 'theme-textdomain' ),
				'menu_name'     => __( 'Groups', 'theme-textdomain' ),
				'all_items'     => __( 'All groups', 'theme-textdomain' ),
				'add_new_item'  => __( 'Add a group', 'theme-textdomain' ),
				'edit_item'     => __( 'Edit group', 'theme-textdomain' ),
				'not_found'     => __( 'No groups yet', 'theme-textdomain' ),
			),
			'public'             => false,
			/*
			 * LOAD-BEARING. A Query Loop filtering by this taxonomy is built by
			 * build_query_vars_from_query_block(), which silently drops any
			 * taxonomy that fails is_taxonomy_viewable() — `publicly_queryable`.
			 * Off, every filtered loop returns everything: one site showed each
			 * service three times and all sixteen questions in both FAQs.
			 */
			'publicly_queryable' => true,
			'rewrite'            => false,
			'query_var'          => false,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_nav_menus'  => false,
			'show_tagcloud'      => false,
			// LOAD-BEARING: the editor's panel beside an entry talks REST
			'show_in_rest'       => true,
			'show_admin_column'  => true,
			'hierarchical'       => true,
		)
	);
}
add_action( 'init', 'theme_prefix_register_thing' );

/* ------------------------------------------- the doors a pageless type keeps */

/**
 * The single entry, by any address that still reaches it.
 *
 * `rewrite` is off, so there is no pretty URL — but `?xx_thing=…`, `?p=123` and
 * `?post_type=xx_thing&p=123` need no rewrite rule. Refused here, not at
 * registration, because the registration has to stay queryable for the loops.
 */
function theme_prefix_thing_refuse_doors() {
	if ( is_admin() ) {
		return;
	}

	global $wp_query;

	$refuse = is_tax( 'xx_thing_group' );

	if ( ! THEME_PREFIX_THING_HAS_PAGE ) {
		/*
		 * What the ADDRESS asked for — $wp_query->query — not query_vars, which
		 * is the request after every pre_get_posts. A theme that puts a list of
		 * types into the site search would otherwise 404 every search.
		 */
		$asked = isset( $wp_query->query['post_type'] ) ? (array) $wp_query->query['post_type'] : array();

		$refuse = $refuse || is_singular( 'xx_thing' ) || in_array( 'xx_thing', $asked, true );
	}

	if ( ! $refuse ) {
		return;
	}

	$wp_query->set_404();
	status_header( 404 );
	nocache_headers();
}
add_action( 'template_redirect', 'theme_prefix_thing_refuse_doors' );

/**
 * No "View" and no "Preview" for something that has nowhere to be viewed —
 * in the list's row actions, the admin bar, and the editor's preview.
 */
function theme_prefix_thing_no_view( $actions, $post ) {
	if ( ! THEME_PREFIX_THING_HAS_PAGE && 'xx_thing' === $post->post_type ) {
		unset( $actions['view'], $actions['preview'] );
	}

	return $actions;
}
add_filter( 'post_row_actions', 'theme_prefix_thing_no_view', 10, 2 );

function theme_prefix_thing_no_view_bar( $bar ) {
	if ( ! THEME_PREFIX_THING_HAS_PAGE && is_admin() && 'xx_thing' === get_post_type() ) {
		$bar->remove_node( 'view' );
		$bar->remove_node( 'preview' );
	}
}
add_action( 'admin_bar_menu', 'theme_prefix_thing_no_view_bar', 100 );

function theme_prefix_thing_no_preview( $link, $post ) {
	return ! THEME_PREFIX_THING_HAS_PAGE && 'xx_thing' === $post->post_type ? '' : $link;
}
add_filter( 'preview_post_link', 'theme_prefix_thing_no_preview', 10, 2 );

/**
 * Out of the sitemaps — WordPress's own and Yoast's — so nothing invites a
 * crawler to addresses that answer 404. Yoast publishes an empty sitemap file
 * for a type it was not told to leave out.
 */
function theme_prefix_thing_core_sitemap( $types ) {
	if ( ! THEME_PREFIX_THING_HAS_PAGE ) {
		unset( $types['xx_thing'] );
	}

	return $types;
}
add_filter( 'wp_sitemaps_post_types', 'theme_prefix_thing_core_sitemap' );

function theme_prefix_thing_core_tax_sitemap( $taxonomies ) {
	unset( $taxonomies['xx_thing_group'] );

	return $taxonomies;
}
add_filter( 'wp_sitemaps_taxonomies', 'theme_prefix_thing_core_tax_sitemap' );

function theme_prefix_thing_yoast_sitemap( $excluded, $type ) {
	return ( ! THEME_PREFIX_THING_HAS_PAGE && 'xx_thing' === $type ) ? true : $excluded;
}
add_filter( 'wpseo_sitemap_exclude_post_type', 'theme_prefix_thing_yoast_sitemap', 10, 2 );

function theme_prefix_thing_yoast_tax_sitemap( $excluded, $taxonomy ) {
	return 'xx_thing_group' === $taxonomy ? true : $excluded;
}
add_filter( 'wpseo_sitemap_exclude_taxonomy', 'theme_prefix_thing_yoast_tax_sitemap', 10, 2 );

/* ------------------------------------------------------------------- fields */

/**
 * The collection's fields — the one list every screen reads.
 *
 * The entry form, the list's columns, the "Needs" column and any block sidebar
 * all take their labels from here, so a field is called the same thing
 * everywhere and renaming it is one edit.
 *
 * Every label is the client's word for the thing, in the site's language, as
 * the client would say it out loud: "Job title", not "role" or "Subtitle".
 * `help` says where it shows on the site and what happens when it is empty.
 * `optional` means empty is a choice, not a gap: the Needs column leaves it.
 *
 * @return array<string, array{label:string,help:string,type:string,optional?:bool,section?:string}>
 */
function theme_prefix_thing_fields() {
	return array(
		'xx_thing_field' => array(
			'label'    => __( 'Job title', 'theme-textdomain' ),
			'help'     => __( 'Shown under the name on the team card.', 'theme-textdomain' ),
			'type'     => 'text',
		),
		'xx_thing_link'  => array(
			'label'    => __( 'LinkedIn profile', 'theme-textdomain' ),
			'help'     => __( 'Leave empty and the card shows no LinkedIn icon.', 'theme-textdomain' ),
			'type'     => 'url',
			'optional' => true,
		),
	);
}

/**
 * Register the fields so blocks and the REST API can read them.
 */
function theme_prefix_register_thing_meta() {
	foreach ( theme_prefix_thing_fields() as $key => $field ) {
		register_post_meta(
			'xx_thing',
			$key,
			array(
				'type'          => 'boolean' === $field['type'] ? 'boolean' : 'string',
				// LOAD-BEARING: bindings and the editor read the value over REST
				'single'        => true,
				'show_in_rest'  => true,
				'default'       => 'boolean' === $field['type'] ? false : '',
				'auth_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}
}
add_action( 'init', 'theme_prefix_register_thing_meta' );

/**
 * Hide the raw "Custom Fields" table. The support must stay — REST returns no
 * `meta` without it — but a name/value table where the client types a key is
 * not an interface, and a mistyped key reads as "the field stopped working".
 */
function theme_prefix_hide_raw_custom_fields() {
	remove_meta_box( 'postcustom', 'xx_thing', 'normal' );
}
add_action( 'admin_menu', 'theme_prefix_hide_raw_custom_fields' );

function theme_prefix_hide_custom_fields_panel( $settings ) {
	if ( 'xx_thing' === get_post_type() ) {
		$settings['enableCustomFields'] = false;
	}

	return $settings;
}
add_filter( 'block_editor_settings_all', 'theme_prefix_hide_custom_fields_panel' );

/**
 * The labelled fields, as the editing screen.
 *
 * Plain JS on purpose — no build step. It writes the same meta the bindings
 * read. For a collection without pages the fields ARE the entry: give them the
 * full width under the title (a meta box at `normal`/`high`), not the 265px
 * sidebar, and group a long list under headings in the client's words.
 */
function theme_prefix_enqueue_thing_panel() {
	if ( 'xx_thing' !== get_post_type() ) {
		return;
	}

	wp_enqueue_script(
		'theme-prefix-thing-panel',
		get_theme_file_uri( 'assets/js/editor-thing-panel.js' ),
		array( 'wp-plugins', 'wp-edit-post', 'wp-element', 'wp-components', 'wp-data', 'wp-dom-ready' ),
		wp_get_theme()->get( 'Version' ),
		true
	);

	wp_localize_script(
		'theme-prefix-thing-panel',
		'themePrefixThingFields',
		theme_prefix_thing_fields()
	);
}
add_action( 'enqueue_block_editor_assets', 'theme_prefix_enqueue_thing_panel' );

/* --------------------------------------------------------------- the checks */

/**
 * Verify after registering and after importing — from a build script, never
 * on every request. Prints problems; empty means the collection is sound.
 *
 * Settings are not proof. This asks the site: a REST record with a `meta`
 * object, a viewable type, and — for a pageless collection — every door
 * answering 404 while a search still answers 200.
 *
 * @return string[]
 */
function theme_prefix_check_thing() {
	$problems = array();

	if ( ! post_type_supports( 'xx_thing', 'custom-fields' ) ) {
		$problems[] = 'xx_thing does not support custom-fields — REST will return no meta at all.';
	}

	if ( ! is_post_type_viewable( 'xx_thing' ) ) {
		$problems[] = 'xx_thing is not viewable — every Query Loop of it will silently show posts.';
	}

	if ( taxonomy_exists( 'xx_thing_group' ) && ! is_taxonomy_viewable( 'xx_thing_group' ) ) {
		$problems[] = 'xx_thing_group is not publicly_queryable — every loop filtered by it returns everything.';
	}

	foreach ( theme_prefix_thing_fields() as $key => $field ) {
		if ( 0 === strpos( $key, '_' ) ) {
			$problems[] = sprintf( '%s starts with "_" — a protected key, core/post-meta will print the key.', $key );
		}

		if ( '' === trim( (string) ( $field['label'] ?? '' ) ) || false !== strpos( $field['label'], '_' ) ) {
			$problems[] = sprintf( '%s has no label, or a label that is a key.', $key );
		}
	}

	$posts = get_posts( array( 'post_type' => 'xx_thing', 'posts_per_page' => -1, 'post_status' => 'publish' ) );

	foreach ( $posts as $post ) {
		foreach ( theme_prefix_thing_fields() as $key => $field ) {
			if ( empty( $field['optional'] ) && 'boolean' !== $field['type'] && '' === trim( (string) get_post_meta( $post->ID, $key, true ) ) ) {
				$problems[] = sprintf( '"%s" (%d) has no %s.', $post->post_title, $post->ID, $field['label'] );
			}
		}
	}

	if ( ! THEME_PREFIX_THING_HAS_PAGE ) {
		$doors = array( add_query_arg( 'post_type', 'xx_thing', home_url( '/' ) ) );

		if ( $posts ) {
			$doors[] = add_query_arg( 'p', $posts[0]->ID, home_url( '/' ) );
			$doors[] = add_query_arg( array( 'post_type' => 'xx_thing', 'p' => $posts[0]->ID ), home_url( '/' ) );
		}

		$terms = get_terms( array( 'taxonomy' => 'xx_thing_group', 'hide_empty' => false, 'number' => 1 ) );

		if ( $terms && ! is_wp_error( $terms ) ) {
			// the form that needs no rewrite and no query_var
			$doors[] = add_query_arg( array( 'taxonomy' => 'xx_thing_group', 'term' => $terms[0]->slug ), home_url( '/' ) );
		}

		foreach ( $doors as $url ) {
			$code = wp_remote_retrieve_response_code( wp_remote_get( $url, array( 'sslverify' => false, 'redirection' => 0 ) ) );

			if ( 404 !== (int) $code ) {
				$problems[] = sprintf( '%s answers %s, not 404.', $url, $code );
			}
		}

		$search = wp_remote_retrieve_response_code( wp_remote_get( add_query_arg( 's', 'a', home_url( '/' ) ), array( 'sslverify' => false ) ) );

		if ( 200 !== (int) $search ) {
			$problems[] = sprintf( 'The site search answers %s — the guard is reading query_vars, not the address.', $search );
		}
	}

	return $problems;
}
