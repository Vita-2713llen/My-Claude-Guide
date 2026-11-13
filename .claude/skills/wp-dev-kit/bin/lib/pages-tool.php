<?php
/**
 * Helper for bin/pages-sync.sh: moves chosen pages/posts and everything they show. Runs only through WP-CLI,
 * works with --skip-plugins --skip-themes (plain $wpdb, no plugin code is needed or run).
 *
 *   wp eval-file pages-tool.php export   <selector>...                        → list + payload to STDOUT
 *   wp eval-file pages-tool.php plan     <payload> <from-url> <to-url>        → what would change (exit 3 = conflict)
 *   wp eval-file pages-tool.php apply    <payload> <from-url> <to-url> <rollback-file>
 *   wp eval-file pages-tool.php rollback <rollback-file> [dry]
 *
 * Selector: post ID, slug or path (about, services/web) or the page URL.
 * Moved with each page: its meta (ACF, Elementor, SEO…), categories/tags (matched by slug), and what it shows —
 * images and files (also inside ACF fields, galleries, Gutenberg and Elementor data), reusable blocks, Elementor
 * templates, product variations; parent pages are created only if the target does not have them yet.
 * IDs are kept: the kit's ID gap (POST_ID_GAP) keeps content IDs the same on local and DEV. If the target has
 * something else under the same ID or another page with the same address, nothing is changed (conflict).
 * The payload is base64(serialize()) — PHP to PHP, so serialized meta moves unchanged.
 *
 * @var array $args Positional arguments from `wp eval-file`.
 */

if ( ! defined( 'ABSPATH' ) || ! class_exists( 'WP_CLI' ) ) {
	exit( 1 );
}

if ( ! class_exists( 'WPKit_Pages_Tool' ) ) {
	// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.PHP.DiscouragedPHPFunctions

	/**
	 * Export/plan/apply/rollback of chosen posts.
	 */
	class WPKit_Pages_Tool {

		/** Post types that are pulled in when content references them. */
		const DEP_TYPES = array( 'attachment', 'wp_block', 'elementor_library' );

		/** Post types that are never moved as a "page". */
		const NEVER = array( 'revision', 'nav_menu_item', 'attachment', 'customize_changeset', 'oembed_cache', 'user_request', 'auto-draft' );

		/** Meta that belongs to the environment, not to the content. */
		const SKIP_META = array( '_edit_lock', '_edit_last', '_elementor_css', '_wp_old_slug', '_wp_old_date', '_encloseme', '_pingme' );

		/** @var array<int, array> Items by ID. */
		private $items = array();

		/** @var array<string, bool> Upload paths (relative to uploads). */
		private $files = array();

		/** @var array<string, bool> Referenced upload paths that do not exist on the source. */
		private $missing = array();

		/** @var string */
		private $basedir = '';

		/**
		 * Rows of a post.
		 *
		 * @param int $id Post ID.
		 * @return array|null
		 */
		private static function row( $id ) {
			global $wpdb;
			return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id ), ARRAY_A );
		}

		/**
		 * All meta of a post as [key, value] pairs, in their order.
		 *
		 * @param int $id Post ID.
		 * @return array
		 */
		private static function meta( $id ) {
			global $wpdb;
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d ORDER BY meta_id", $id ), ARRAY_N );
			return $rows ? $rows : array();
		}

		/**
		 * Terms of a post (taxonomy, slug, name, description).
		 *
		 * @param int $id Post ID.
		 * @return array
		 */
		private static function terms( $id ) {
			global $wpdb;
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT tt.taxonomy, t.slug, t.name, tt.description FROM {$wpdb->term_relationships} tr
					 JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
					 JOIN {$wpdb->terms} t ON t.term_id = tt.term_id WHERE tr.object_id = %d",
					$id
				),
				ARRAY_A
			);
			return $rows ? $rows : array();
		}

		/**
		 * Finds a post by a selector.
		 *
		 * @param string $sel ID, slug, path or URL.
		 * @return int
		 */
		private static function resolve( $sel ) {
			global $wpdb;
			$orig = $sel;
			$sel  = trim( $sel );
			if ( preg_match( '#^https?://#i', $sel ) ) {
				$query = (string) wp_parse_url( $sel, PHP_URL_QUERY );
				parse_str( $query, $q );
				foreach ( array( 'p', 'page_id', 'post' ) as $k ) {
					if ( isset( $q[ $k ] ) && ctype_digit( (string) $q[ $k ] ) ) {
						$sel = (string) $q[ $k ];
						break;
					}
				}
				if ( ! ctype_digit( $sel ) ) {
					$sel = trim( rawurldecode( (string) wp_parse_url( $sel, PHP_URL_PATH ) ), '/' );
					if ( '' === $sel ) {
						$front = (int) get_option( 'page_on_front' );
						if ( ! $front ) {
							WP_CLI::error( "{$orig}: the home page here is the list of posts, not a page." );
						}
						return $front;
					}
				}
			}
			if ( ctype_digit( $sel ) ) {
				if ( ! self::row( (int) $sel ) ) {
					WP_CLI::error( "{$orig}: there is no post with ID {$sel}." );
				}
				return (int) $sel;
			}
			$segments = array_values( array_filter( explode( '/', trim( $sel, '/' ) ), 'strlen' ) );
			if ( ! $segments ) {
				WP_CLI::error( "Empty selector: '{$orig}'." );
			}
			$never = "'" . implode( "','", self::NEVER ) . "'";
			$cands = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT ID, post_type, post_parent, post_title FROM {$wpdb->posts}
					 WHERE post_name = %s AND post_type NOT IN ($never) AND post_status IN ('publish','private','draft','pending','future')",
					sanitize_title( end( $segments ) )
				),
				ARRAY_A
			);
			// Full path through parent pages (services/web), else a single match among posts without a parent (/blog/x, /product/x)
			$exact = array();
			foreach ( $cands as $c ) {
				$parent = (int) $c['post_parent'];
				$ok     = true;
				for ( $i = count( $segments ) - 2; $i >= 0; $i-- ) {
					$p = $parent ? self::row( $parent ) : null;
					if ( ! $p || $p['post_name'] !== sanitize_title( $segments[ $i ] ) ) {
						$ok = false;
						break;
					}
					$parent = (int) $p['post_parent'];
				}
				if ( $ok && 0 === $parent ) {
					$exact[] = $c;
				}
			}
			if ( ! $exact && count( $segments ) > 1 ) {
				$exact = array_values( array_filter( $cands, static function ( $c ) { return 0 === (int) $c['post_parent']; } ) );
			}
			if ( 1 === count( $exact ) ) {
				return (int) $exact[0]['ID'];
			}
			$list = $exact ? $exact : $cands;
			if ( ! $list ) {
				WP_CLI::error( "'{$orig}': nothing found (use the ID, the slug, the path like services/web, or the page URL)." );
			}
			$names = array();
			foreach ( $list as $c ) {
				$names[] = "{$c['ID']} ({$c['post_type']}: {$c['post_title']})";
			}
			WP_CLI::error( "'{$orig}' matches several posts: " . implode( ', ', $names ) . ' — use the ID.' );
			return 0;
		}

		/**
		 * IDs and upload paths a post refers to.
		 *
		 * @param array $row  Post row.
		 * @param array $meta Meta pairs.
		 * @return array [ids, paths]
		 */
		private static function refs( $row, $meta ) {
			$ids   = array();
			$texts = array( (string) $row['post_content'], (string) $row['post_excerpt'] );
			foreach ( $meta as $m ) {
				list( $k, $v ) = $m;
				if ( in_array( $k, self::SKIP_META, true ) || null === $v ) {
					continue;
				}
				$t = trim( (string) $v );
				if ( preg_match( '/^\d+(\s*,\s*\d+)*$/', $t ) ) { // ACF image/file, _thumbnail_id, Woo gallery "1,2,3"
					foreach ( explode( ',', $t ) as $x ) {
						$ids[] = (int) $x;
					}
					continue;
				}
				if ( is_serialized( $t ) ) { // ACF gallery/repeater stored as an array
					$u = @unserialize( $t, array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
					if ( is_array( $u ) ) {
						array_walk_recursive(
							$u,
							static function ( $x ) use ( &$ids, &$texts ) {
								if ( is_int( $x ) || ( is_string( $x ) && ctype_digit( $x ) ) ) {
									$ids[] = (int) $x;
								} elseif ( is_string( $x ) ) {
									$texts[] = $x;
								}
							}
						);
					}
					continue;
				}
				$texts[] = (string) $v;
			}
			$paths = array();
			foreach ( $texts as $t ) {
				if ( '' === $t ) {
					continue;
				}
				$t = str_replace( '\\/', '/', $t ); // JSON (Elementor, Gutenberg) escapes slashes
				$m = array();
				preg_match_all( '/\bwp-image-(\d+)/', $t, $m );
				$ids = array_merge( $ids, $m[1] );
				preg_match_all( '/"(?:id|mediaId|ref|imageId|image_id|attachment_id|template_id|background_image_id|logo_id|video_id)"\s*:\s*"?(\d+)/i', $t, $m );
				$ids = array_merge( $ids, $m[1] );
				preg_match_all( '/"ids"\s*:\s*\[([0-9,\s"]+)\]/', $t, $m );
				foreach ( $m[1] as $list ) {
					$ids = array_merge( $ids, preg_split( '/[^0-9]+/', $list, -1, PREG_SPLIT_NO_EMPTY ) );
				}
				preg_match_all( '/\bids=["\']([0-9,\s]+)["\']/', $t, $m );
				foreach ( $m[1] as $list ) {
					$ids = array_merge( $ids, preg_split( '/[^0-9]+/', $list, -1, PREG_SPLIT_NO_EMPTY ) );
				}
				preg_match_all( '/\[elementor-template[^\]]*\bid=["\']?(\d+)/', $t, $m );
				$ids = array_merge( $ids, $m[1] );
				preg_match_all( '#/wp-content/uploads/([^\s"\'()<>\\\\?\#]+?\.[A-Za-z0-9]{2,5})(?=[\s"\'()<>\\\\?\#,;]|$)#', $t, $m );
				foreach ( $m[1] as $p ) {
					$paths[] = rawurldecode( $p );
				}
			}
			$ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
			return array( $ids, array_values( array_unique( $paths ) ) );
		}

		/**
		 * Adds a post (and what it refers to) to the export.
		 *
		 * @param int    $id   Post ID.
		 * @param string $role main | parent | child | media | block.
		 * @param string $mode upsert | ensure (ensure = only if the target does not have it).
		 */
		private function add( $id, $role, $mode ) {
			global $wpdb;
			if ( isset( $this->items[ $id ] ) ) {
				if ( 'upsert' === $mode && 'ensure' === $this->items[ $id ]['mode'] ) {
					$this->items[ $id ]['mode'] = 'upsert';
					$this->items[ $id ]['role'] = $role;
				} else {
					return;
				}
			}
			$row = self::row( $id );
			if ( ! $row ) {
				return;
			}
			$meta = self::meta( $id );
			if ( ! isset( $this->items[ $id ] ) ) {
				$login               = $wpdb->get_var( $wpdb->prepare( "SELECT user_login FROM {$wpdb->users} WHERE ID = %d", $row['post_author'] ) );
				$this->items[ $id ] = array(
					'role'   => $role,
					'mode'   => $mode,
					'row'    => $row,
					'meta'   => $meta,
					'terms'  => self::terms( $id ),
					'author' => (string) $login,
				);
			}

			if ( 'attachment' === $row['post_type'] ) {
				$this->attachment_files( $meta );
				return;
			}

			// What this post shows
			list( $ids, $paths ) = self::refs( $row, $meta );
			$found = array();
			foreach ( $paths as $p ) {
				$this->file( $p );
				$base    = preg_replace( '/-\d+x\d+(?=\.[A-Za-z0-9]+$)/', '', $p );
				$found[] = $p;
				$found[] = $base;
				$found[] = preg_replace( '/(\.[A-Za-z0-9]+)$/', '-scaled$1', $base );
			}
			if ( $found ) {
				$in  = implode( ',', array_fill( 0, count( $found ), '%s' ) );
				$ids = array_merge( $ids, $wpdb->get_col( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value IN ($in)", $found ) ) ); // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders
			}
			$ids = array_values( array_unique( array_map( 'intval', $ids ) ) );
			$ids = array_diff( $ids, array( (int) $id ) );
			if ( $ids ) {
				$types = "'" . implode( "','", self::DEP_TYPES ) . "'";
				$deps  = $wpdb->get_results( 'SELECT ID, post_type FROM ' . $wpdb->posts . ' WHERE ID IN (' . implode( ',', $ids ) . ") AND post_type IN ($types)", ARRAY_A );
				foreach ( $deps as $d ) {
					$this->add( (int) $d['ID'], 'attachment' === $d['post_type'] ? 'media' : 'block', $mode );
				}
			}
			// WooCommerce variable product: its variations are child posts
			foreach ( $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'product_variation'", $id ) ) as $child ) {
				$this->add( (int) $child, 'child', $mode );
			}
			// Parent pages: created on the target only if it does not have them
			if ( in_array( $role, array( 'main', 'parent' ), true ) && (int) $row['post_parent'] > 0 ) {
				$this->add( (int) $row['post_parent'], 'parent', 'ensure' );
			}
		}

		/**
		 * Files of an attachment: the original, the -scaled copy, every size.
		 *
		 * @param array $meta Meta pairs.
		 */
		private function attachment_files( $meta ) {
			$file = '';
			$data = array();
			foreach ( $meta as $m ) {
				if ( '_wp_attached_file' === $m[0] ) {
					$file = (string) $m[1];
				} elseif ( '_wp_attachment_metadata' === $m[0] ) {
					$data = @unserialize( (string) $m[1], array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
				}
			}
			if ( '' === $file || '/' === $file[0] ) {
				return;
			}
			$this->file( $file );
			$dir = dirname( $file );
			$dir = '.' === $dir ? '' : $dir . '/';
			if ( is_array( $data ) ) {
				if ( ! empty( $data['original_image'] ) ) {
					$this->file( $dir . $data['original_image'] );
				}
				foreach ( isset( $data['sizes'] ) && is_array( $data['sizes'] ) ? $data['sizes'] : array() as $s ) {
					if ( ! empty( $s['file'] ) ) {
						$this->file( $dir . $s['file'] );
					}
				}
			}
		}

		/**
		 * Registers an upload path (relative to uploads).
		 *
		 * @param string $p Path.
		 */
		private function file( $p ) {
			$p = ltrim( str_replace( '\\', '/', $p ), '/' );
			if ( '' === $p || false !== strpos( $p, '..' ) ) {
				return;
			}
			if ( is_file( $this->basedir . '/' . $p ) ) {
				$this->files[ $p ] = true;
			} else {
				$this->missing[ $p ] = true;
			}
		}

		/**
		 * `export`: prints ITEM/FILE/NOFILE lines, then @@DATA@@ and the payload.
		 *
		 * @param array $selectors Selectors.
		 */
		public function export( $selectors ) {
			$up            = wp_upload_dir( null, false );
			$this->basedir = rtrim( $up['basedir'], '/' );
			if ( ! $selectors ) {
				WP_CLI::error( 'Name at least one page (ID, slug, path or URL).' );
			}
			$main = array();
			foreach ( $selectors as $sel ) {
				$id  = self::resolve( $sel );
				$row = self::row( $id );
				if ( in_array( $row['post_type'], self::NEVER, true ) || 'auto-draft' === $row['post_status'] || 'trash' === $row['post_status'] ) {
					WP_CLI::error( "{$sel}: ID {$id} is a {$row['post_type']} ({$row['post_status']}) — only pages/posts/products can be moved." );
				}
				$main[] = $id;
			}
			foreach ( $main as $id ) {
				$this->add( $id, 'main', 'upsert' );
			}
			foreach ( $this->items as $id => $it ) {
				printf( "ITEM\t%d\t%s\t%s\t%s\t%s\n", $id, $it['row']['post_type'], $it['role'], $it['mode'], str_replace( array( "\t", "\n" ), ' ', $it['row']['post_title'] ) );
			}
			if ( ! preg_match( '#/wp-content/uploads$#', $this->basedir ) ) {
				printf( "NOTE\tuploads are not in wp-content/uploads here (%s) — files are not moved\n", $this->basedir );
				$this->files = array();
			}
			foreach ( array_keys( $this->files ) as $p ) {
				echo "FILE\t{$p}\n";
			}
			foreach ( array_keys( $this->missing ) as $p ) {
				echo "NOFILE\t{$p}\n";
			}
			echo "@@DATA@@\n", base64_encode( serialize( array( 'v' => 1, 'items' => $this->items ) ) ), "\n";
		}

		/**
		 * Reads a payload file.
		 *
		 * @param string $file Path.
		 * @return array
		 */
		private static function load( $file ) {
			$raw  = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions
			$data = @unserialize( (string) base64_decode( trim( $raw ) ), array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			if ( ! is_array( $data ) || ! isset( $data['items'] ) ) {
				WP_CLI::error( "Not a pages-sync file: {$file}" );
			}
			return $data;
		}

		/**
		 * What would happen on this site: one line per item, conflicts stop everything.
		 *
		 * @param array $data Payload.
		 * @return array [lines, writes (IDs to write), conflicts]
		 */
		private static function decide( $data ) {
			global $wpdb;
			$lines     = array();
			$writes    = array();
			$conflicts = 0;
			foreach ( $data['items'] as $id => $it ) {
				$row  = $it['row'];
				$cur  = self::row( $id );
				$note = '';
				if ( $cur && $cur['post_type'] !== $row['post_type'] ) {
					$action = 'CONFLICT';
					$note   = "ID {$id} here is a {$cur['post_type']} '{$cur['post_title']}', not a {$row['post_type']}";
					++$conflicts;
				} elseif ( $cur && 'ensure' === $it['mode'] ) {
					$action = 'KEEP';
					$note   = 'already here, not changed';
				} else {
					$action = $cur ? 'UPDATE' : 'NEW';
					if ( 'attachment' !== $row['post_type'] && '' !== $row['post_name'] ) {
						$dup = $wpdb->get_row(
							$wpdb->prepare(
								"SELECT ID, post_title FROM {$wpdb->posts} WHERE post_name = %s AND post_type = %s AND post_parent = %d AND ID <> %d
								 AND post_status IN ('publish','private','draft','pending','future') LIMIT 1",
								$row['post_name'],
								$row['post_type'],
								$row['post_parent'],
								$id
							),
							ARRAY_A
						);
						if ( $dup ) {
							$action = 'CONFLICT';
							$note   = "this site has another {$row['post_type']} with the same address '{$row['post_name']}': ID {$dup['ID']} '{$dup['post_title']}'";
							++$conflicts;
						}
					}
					if ( 'UPDATE' === $action && $cur['post_title'] !== $row['post_title'] ) {
						$note = "title here: '{$cur['post_title']}'";
					}
					if ( 'CONFLICT' !== $action ) {
						$writes[] = (int) $id;
					}
				}
				$lines[] = implode( "\t", array( $action, $id, $row['post_type'], $it['role'], str_replace( array( "\t", "\n" ), ' ', $row['post_title'] ), $note ) );
			}
			return array( $lines, $writes, $conflicts );
		}

		/**
		 * `plan`.
		 *
		 * @param string $file Payload.
		 */
		public static function plan( $file ) {
			list( $lines, , $conflicts ) = self::decide( self::load( $file ) );
			echo implode( "\n", $lines ), "\n";
			if ( $conflicts ) {
				WP_CLI::halt( 3 );
			}
		}

		/**
		 * URL replacement inside a value: serialized data is unserialized and serialized again (lengths stay right),
		 * JSON-escaped URLs (Elementor, Gutenberg) are replaced as well.
		 *
		 * @param mixed $v     Value.
		 * @param array $pairs from => to.
		 * @return mixed
		 */
		private static function rep( $v, $pairs ) {
			if ( ! $pairs ) {
				return $v;
			}
			if ( is_array( $v ) ) {
				foreach ( $v as $k => $x ) {
					$v[ $k ] = self::rep( $x, $pairs );
				}
				return $v;
			}
			if ( ! is_string( $v ) ) {
				return $v;
			}
			if ( is_serialized( $v ) ) {
				$u = @unserialize( $v, array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
				if ( false === $u && 'b:0;' !== $v ) {
					return $v; // cannot be read safely — left as is
				}
				return is_object( $u ) ? $v : serialize( self::rep( $u, $pairs ) );
			}
			return strtr( $v, $pairs );
		}

		/**
		 * from → to pairs for two site URLs.
		 *
		 * @param string $from Source URL.
		 * @param string $to   Target URL.
		 * @return array
		 */
		private static function pairs( $from, $to ) {
			$from = rtrim( $from, '/' );
			$to   = rtrim( $to, '/' );
			if ( '' === $from || $from === $to ) {
				return array();
			}
			$p    = array( $from => $to );
			$p[ str_replace( '/', '\\/', $from ) ] = str_replace( '/', '\\/', $to );
			$fh   = preg_replace( '#^https?:#', '', $from );
			$th   = preg_replace( '#^https?:#', '', $to );
			if ( $fh !== $th ) {
				$p[ $fh ]                           = $th;
				$p[ str_replace( '/', '\\/', $fh ) ] = str_replace( '/', '\\/', $th );
			}
			return $p;
		}

		/**
		 * Current state of the posts that will be written (for the rollback file).
		 *
		 * @param int[] $ids IDs.
		 * @return array
		 */
		private static function snapshot( $ids ) {
			global $wpdb;
			$out = array();
			foreach ( $ids as $id ) {
				$out[ $id ] = array(
					'row'  => self::row( $id ),
					'meta' => self::meta( $id ),
					'tt'   => $wpdb->get_col( $wpdb->prepare( "SELECT term_taxonomy_id FROM {$wpdb->term_relationships} WHERE object_id = %d", $id ) ),
				);
			}
			return $out;
		}

		/**
		 * Fails the open transaction.
		 *
		 * @param string $what What failed.
		 */
		private static function fail( $what ) {
			global $wpdb;
			$err = $wpdb->last_error;
			$wpdb->query( 'ROLLBACK' );
			WP_CLI::error( "{$what}: {$err} — nothing changed (transaction rolled back)." );
		}

		/**
		 * Writes one post: row, meta and term relationships.
		 *
		 * @param int        $id    ID.
		 * @param array|null $row   Row (null = delete the post).
		 * @param array      $meta  Meta pairs.
		 * @param int[]      $tt    term_taxonomy_ids to link.
		 * @param array      $touched term_taxonomy_ids whose counts must be refreshed (in/out).
		 */
		private static function write( $id, $row, $meta, $tt, &$touched ) {
			global $wpdb;
			$touched = array_merge( $touched, $wpdb->get_col( $wpdb->prepare( "SELECT term_taxonomy_id FROM {$wpdb->term_relationships} WHERE object_id = %d", $id ) ) );
			foreach ( array( $wpdb->postmeta => 'post_id', $wpdb->term_relationships => 'object_id' ) as $table => $col ) {
				if ( false === $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE {$col} = %d", $id ) ) ) {
					self::fail( "Cleaning {$table} for {$id}" );
				}
			}
			if ( null === $row ) {
				if ( false === $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->posts} WHERE ID = %d", $id ) ) ) {
					self::fail( "Deleting {$id}" );
				}
				return;
			}
			static $cols = null;
			if ( null === $cols ) {
				$cols = array_flip( $wpdb->get_col( "DESCRIBE {$wpdb->posts}", 0 ) );
			}
			if ( false === $wpdb->replace( $wpdb->posts, array_intersect_key( $row, $cols ) ) ) {
				self::fail( "Writing post {$id}" );
			}
			foreach ( $meta as $m ) {
				if ( false === $wpdb->insert( $wpdb->postmeta, array( 'post_id' => $id, 'meta_key' => $m[0], 'meta_value' => $m[1] ) ) ) { // phpcs:ignore WordPress.DB.SlowDBQuery
					self::fail( "Writing meta {$m[0]} of {$id}" );
				}
			}
			foreach ( array_unique( $tt ) as $t ) {
				if ( false === $wpdb->insert( $wpdb->term_relationships, array( 'object_id' => $id, 'term_taxonomy_id' => (int) $t, 'term_order' => 0 ) ) ) {
					self::fail( "Linking term {$t} to {$id}" );
				}
				$touched[] = $t;
			}
		}

		/**
		 * Recounts terms after the move.
		 *
		 * @param array $tt term_taxonomy_ids.
		 */
		private static function recount( $tt ) {
			global $wpdb;
			foreach ( array_unique( array_map( 'intval', $tt ) ) as $t ) {
				$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->term_taxonomy} SET count = (SELECT COUNT(*) FROM {$wpdb->term_relationships} WHERE term_taxonomy_id = %d) WHERE term_taxonomy_id = %d", $t, $t ) );
			}
		}

		/**
		 * term_taxonomy_id for taxonomy + slug on this site; created if missing.
		 *
		 * @param array $t Term (taxonomy, slug, name, description).
		 * @return int
		 */
		private static function term_id_here( $t ) {
			global $wpdb;
			$tt = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT tt.term_taxonomy_id FROM {$wpdb->term_taxonomy} tt JOIN {$wpdb->terms} t ON t.term_id = tt.term_id WHERE tt.taxonomy = %s AND t.slug = %s",
					$t['taxonomy'],
					$t['slug']
				)
			);
			if ( $tt ) {
				return (int) $tt;
			}
			if ( false === $wpdb->insert( $wpdb->terms, array( 'name' => $t['name'], 'slug' => $t['slug'], 'term_group' => 0 ) ) ) {
				self::fail( "Creating term {$t['taxonomy']}/{$t['slug']}" );
			}
			$term_id = (int) $wpdb->insert_id;
			if ( false === $wpdb->insert( $wpdb->term_taxonomy, array( 'term_id' => $term_id, 'taxonomy' => $t['taxonomy'], 'description' => (string) $t['description'], 'parent' => 0, 'count' => 0 ) ) ) {
				self::fail( "Creating term {$t['taxonomy']}/{$t['slug']}" );
			}
			return (int) $wpdb->insert_id;
		}

		/**
		 * `apply`.
		 *
		 * @param string $file     Payload.
		 * @param string $from     Source site URL.
		 * @param string $to       Target site URL.
		 * @param string $rollback Rollback file to write first.
		 */
		public static function apply( $file, $from, $to, $rollback ) {
			global $wpdb;
			$data                            = self::load( $file );
			list( $lines, $writes, $conflicts ) = self::decide( $data );
			if ( $conflicts ) {
				echo implode( "\n", $lines ), "\n";
				WP_CLI::halt( 3 );
			}
			if ( ! $writes ) {
				WP_CLI::success( 'Nothing to write.' );
				return;
			}
			$snap = serialize( array( 'v' => 1, 'posts' => self::snapshot( $writes ) ) );
			if ( false === file_put_contents( $rollback, base64_encode( $snap ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
				WP_CLI::error( "Cannot write the rollback file {$rollback} — nothing changed." );
			}

			$pairs = self::pairs( $from, $to );
			$admin = (int) $wpdb->get_var( $wpdb->prepare( "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s AND meta_value LIKE %s ORDER BY user_id LIMIT 1", $wpdb->get_blog_prefix() . 'capabilities', '%administrator%' ) );
			$touched = array();
			$wpdb->query( 'START TRANSACTION' );
			foreach ( $writes as $id ) {
				$it  = $data['items'][ $id ];
				$row = $it['row'];
				foreach ( array( 'post_content', 'post_excerpt', 'post_content_filtered' ) as $c ) { // never guid
					if ( isset( $row[ $c ] ) ) {
						$row[ $c ] = self::rep( $row[ $c ], $pairs );
					}
				}
				$author = $it['author'] ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT ID FROM {$wpdb->users} WHERE user_login = %s", $it['author'] ) ) : 0;
				if ( ! $author ) {
					$cur    = self::row( $id );
					$author = $cur ? (int) $cur['post_author'] : $admin;
				}
				$row['post_author'] = $author;
				$meta               = array();
				foreach ( $it['meta'] as $m ) {
					if ( ! in_array( $m[0], self::SKIP_META, true ) ) {
						$meta[] = array( $m[0], self::rep( $m[1], $pairs ) );
					}
				}
				$tt = array();
				foreach ( $it['terms'] as $t ) {
					$tt[] = self::term_id_here( $t );
				}
				self::write( $id, $row, $meta, $tt, $touched );
			}
			self::recount( $touched );
			if ( false === $wpdb->query( 'COMMIT' ) ) {
				self::fail( 'Commit' );
			}
			foreach ( $writes as $id ) {
				clean_post_cache( $id );
			}
			foreach ( $lines as $l ) {
				$f = explode( "\t", $l );
				if ( in_array( $f[0], array( 'NEW', 'UPDATE' ), true ) ) {
					echo "DONE\t", $l, "\n";
				}
			}
			WP_CLI::success( count( $writes ) . ' post(s) written.' );
		}

		/**
		 * `rollback`: puts back the posts saved before `apply` (new ones are deleted).
		 *
		 * @param string $file Rollback file.
		 * @param bool   $dry  Only list.
		 */
		public static function rollback( $file, $dry ) {
			global $wpdb;
			$raw  = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions
			$data = @unserialize( (string) base64_decode( trim( $raw ) ), array( 'allowed_classes' => false ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			if ( ! is_array( $data ) || ! isset( $data['posts'] ) ) {
				WP_CLI::error( "Not a pages-sync rollback file: {$file}" );
			}
			foreach ( $data['posts'] as $id => $p ) {
				echo $p['row'] ? "RESTORE\t{$id}\t{$p['row']['post_type']}\t{$p['row']['post_title']}\n" : "DELETE\t{$id}\t(created by that push)\n";
			}
			if ( $dry ) {
				return;
			}
			$touched = array();
			$wpdb->query( 'START TRANSACTION' );
			foreach ( $data['posts'] as $id => $p ) {
				self::write( (int) $id, $p['row'], $p['meta'], $p['tt'], $touched );
			}
			self::recount( $touched );
			if ( false === $wpdb->query( 'COMMIT' ) ) {
				self::fail( 'Commit' );
			}
			foreach ( array_keys( $data['posts'] ) as $id ) {
				clean_post_cache( (int) $id );
			}
			WP_CLI::success( count( $data['posts'] ) . ' post(s) restored.' );
		}
	}
	// phpcs:enable
}

$wpkit_mode = isset( $args[0] ) ? $args[0] : '';
switch ( $wpkit_mode ) {
	case 'export':
		( new WPKit_Pages_Tool() )->export( array_slice( $args, 1 ) );
		break;
	case 'plan':
		WPKit_Pages_Tool::plan( (string) ( $args[1] ?? '' ) );
		break;
	case 'apply':
		WPKit_Pages_Tool::apply( (string) ( $args[1] ?? '' ), (string) ( $args[2] ?? '' ), (string) ( $args[3] ?? '' ), (string) ( $args[4] ?? '' ) );
		break;
	case 'rollback':
		WPKit_Pages_Tool::rollback( (string) ( $args[1] ?? '' ), 'dry' === ( $args[2] ?? '' ) );
		break;
	default:
		WP_CLI::error( 'Usage: wp eval-file pages-tool.php export|plan|apply|rollback …' );
}
