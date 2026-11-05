<?php
/**
 * SVG uploads.
 *
 * WordPress refuses SVG by default because the format is XML that can carry
 * scripts, and an SVG served from this domain runs with the site's own origin.
 * Uploads are allowed here — but only for users who can manage the site, and
 * every file is parsed and rebuilt against an allow-list before it is stored.
 *
 * Matching tags with regular expressions cannot be made reliable on XML: the
 * same handler can be written as `onload`, `ONLOAD`, split across newlines or
 * spelled with character entities, and each variant needs its own pattern. The
 * parser sees one node either way, so the allow-list runs on the parsed tree.
 *
 * @package ThemeName
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Elements an illustration may contain. Anything else is dropped whole.
 *
 * @return string[]
 */
function theme_prefix_svg_allowed_elements() {
	return array(
		'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata', 'style',
		'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
		'text', 'tspan', 'textPath',
		'linearGradient', 'radialGradient', 'stop', 'pattern', 'image',
		'clipPath', 'mask', 'marker',
		'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
		'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDropShadow',
		'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur',
		'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
		'feSpecularLighting', 'feTile', 'feTurbulence',
	);
}

/**
 * Attributes that carry geometry or paint. Presentation attributes are listed
 * explicitly rather than allowed by prefix, so nothing executable slips in.
 *
 * @return string[]
 */
function theme_prefix_svg_allowed_attributes() {
	return array(
		'id', 'class', 'style', 'transform', 'viewbox', 'xmlns', 'xmlns:xlink',
		'version', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
		'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'dx', 'dy', 'rotate',
		'preserveaspectratio', 'patternunits', 'patterncontentunits',
		'gradientunits', 'gradienttransform', 'spreadmethod', 'offset',
		'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
		'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
		'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit',
		'opacity', 'color', 'display', 'visibility', 'overflow',
		'clip-path', 'clip-rule', 'mask', 'filter', 'vector-effect',
		'font-family', 'font-size', 'font-weight', 'font-style',
		'text-anchor', 'letter-spacing', 'word-spacing', 'dominant-baseline',
		'stop-color', 'stop-opacity', 'marker-start', 'marker-mid', 'marker-end',
		'markerwidth', 'markerheight', 'refx', 'refy', 'orient',
		'maskunits', 'maskcontentunits', 'clippathunits', 'filterunits',
		'primitiveunits', 'result', 'in', 'in2', 'stddeviation', 'values',
		'type', 'mode', 'operator', 'flood-color', 'flood-opacity',
		'role', 'aria-label', 'aria-labelledby', 'aria-hidden', 'focusable',
		'href', 'xlink:href',
	);
}

/**
 * Strip every element and attribute that is not on the allow-list.
 *
 * @param DOMNode $node    Node to clean.
 * @param bool    $removed Set to true when something was dropped.
 * @return void
 */
function theme_prefix_svg_clean_node( DOMNode $node, &$removed ) {
	$elements   = array_map( 'strtolower', theme_prefix_svg_allowed_elements() );
	$attributes = theme_prefix_svg_allowed_attributes();

	// Walk backwards: removing a child renumbers the live NodeList.
	for ( $i = $node->childNodes->length - 1; $i >= 0; $i-- ) {
		$child = $node->childNodes->item( $i );

		if ( XML_ELEMENT_NODE !== $child->nodeType ) {
			// Comments can hide markup that some parsers later resurrect.
			if ( XML_COMMENT_NODE === $child->nodeType || XML_PI_NODE === $child->nodeType ) {
				$node->removeChild( $child );
				$removed = true;
			}
			continue;
		}

		if ( ! in_array( strtolower( $child->localName ), $elements, true ) ) {
			/*
			 * A wrapper that merely groups artwork — a link, a <switch> — is
			 * unwrapped rather than deleted, or a legitimate drawing would
			 * silently lose every shape nested inside it. Anything that can
			 * execute is deleted outright, children and all.
			 */
			if ( in_array( strtolower( $child->localName ), array( 'a', 'switch' ), true ) ) {
				while ( $child->firstChild ) {
					$node->insertBefore( $child->firstChild, $child );
				}
			}
			$node->removeChild( $child );
			$removed = true;
			continue;
		}

		for ( $j = $child->attributes->length - 1; $j >= 0; $j-- ) {
			$attr = $child->attributes->item( $j );
			$name = strtolower( $attr->nodeName );

			if ( ! in_array( $name, $attributes, true ) ) {
				$child->removeAttribute( $attr->nodeName );
				$removed = true;
				continue;
			}

			// A reference may only point inside this same file.
			if ( 'href' === $name || 'xlink:href' === $name ) {
				if ( ! preg_match( '/^#[A-Za-z0-9_.:-]+$/', trim( $attr->nodeValue ) ) ) {
					$child->removeAttribute( $attr->nodeName );
					$removed = true;
				}
				continue;
			}

			// url(...) in a paint or style value must stay internal too.
			if ( preg_match( '#(javascript|data|vbscript)\s*:#i', $attr->nodeValue )
				|| preg_match( '#url\(\s*[\'"]?\s*(?!\#)#i', $attr->nodeValue ) ) {
				$child->removeAttribute( $attr->nodeName );
				$removed = true;
			}
		}

		if ( $child->hasChildNodes() ) {
			theme_prefix_svg_clean_node( $child, $removed );
		}
	}
}

/**
 * Let administrators upload SVG.
 *
 * @param array $mimes Allowed mime types.
 * @return array
 */
function theme_prefix_allow_svg_uploads( $mimes ) {
	if ( current_user_can( 'manage_options' ) ) {
		$mimes['svg'] = 'image/svg+xml';
	}
	return $mimes;
}
add_filter( 'upload_mimes', 'theme_prefix_allow_svg_uploads' );

/**
 * WordPress guesses the type from the file contents and rejects SVG; tell it
 * what an .svg is.
 *
 * @param array  $data     File data.
 * @param string $file     Full path.
 * @param string $filename File name.
 * @return array
 */
function theme_prefix_svg_filetype( $data, $file, $filename ) {
	if ( ! $data['type'] && preg_match( '/\.svg$/i', $filename ) && current_user_can( 'manage_options' ) ) {
		$data['ext']  = 'svg';
		$data['type'] = 'image/svg+xml';
	}
	return $data;
}
add_filter( 'wp_check_filetype_and_ext', 'theme_prefix_svg_filetype', 10, 3 );

/**
 * Parse an uploaded SVG and write back only what the allow-list permits.
 *
 * @param array $file Upload array.
 * @return array
 */
function theme_prefix_sanitize_svg_upload( $file ) {
	if ( empty( $file['tmp_name'] ) || 'image/svg+xml' !== $file['type'] ) {
		return $file;
	}

	$svg = file_get_contents( $file['tmp_name'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions

	if ( false === $svg || '' === trim( $svg ) ) {
		$file['error'] = __( 'The SVG could not be read.', 'theme-textdomain' );
		return $file;
	}

	// A document type declaration is the vehicle for entity attacks and an
	// illustration never needs one, so refuse the file rather than repair it.
	if ( preg_match( '/<!DOCTYPE|<!ENTITY/i', $svg ) ) {
		$file['error'] = __( 'This SVG contains a document type declaration and was not accepted. Re-export it from your drawing tool without one.', 'theme-textdomain' );
		return $file;
	}

	$doc                      = new DOMDocument();
	$doc->preserveWhiteSpace  = false;
	$doc->strictErrorChecking = false;

	$previous = libxml_use_internal_errors( true );
	// LIBXML_NONET refuses any network fetch while parsing.
	$loaded = $doc->loadXML( $svg, LIBXML_NONET );
	libxml_clear_errors();
	libxml_use_internal_errors( $previous );

	if ( ! $loaded || ! $doc->documentElement || 'svg' !== strtolower( $doc->documentElement->localName ) ) {
		$file['error'] = __( 'This file is not a valid SVG image.', 'theme-textdomain' );
		return $file;
	}

	$removed = false;
	theme_prefix_svg_clean_node( $doc->documentElement, $removed );

	// The root's own attributes are not covered by the child walk.
	$root       = $doc->documentElement;
	$attributes = theme_prefix_svg_allowed_attributes();
	for ( $i = $root->attributes->length - 1; $i >= 0; $i-- ) {
		$attr = $root->attributes->item( $i );
		if ( ! in_array( strtolower( $attr->nodeName ), $attributes, true ) ) {
			$root->removeAttribute( $attr->nodeName );
			$removed = true;
		}
	}

	$clean = $doc->saveXML( $root );

	if ( false === $clean || false === file_put_contents( $file['tmp_name'], $clean ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
		$file['error'] = __( 'The SVG could not be sanitised.', 'theme-textdomain' );
	}

	return $file;
}
add_filter( 'wp_handle_upload_prefilter', 'theme_prefix_sanitize_svg_upload' );

/**
 * An SVG has no intrinsic pixel size, so WordPress stores no dimensions and
 * the editor lays the image out at zero. Read them off the root element.
 *
 * @param int $attachment_id Attachment.
 * @return int[]|false width/height, or false when they cannot be read.
 */
function theme_prefix_svg_dimensions( $attachment_id ) {
	$path = get_attached_file( $attachment_id );

	if ( ! $path || ! file_exists( $path ) ) {
		return false;
	}

	$previous = libxml_use_internal_errors( true );
	$xml      = simplexml_load_file( $path, 'SimpleXMLElement', LIBXML_NONET );
	libxml_clear_errors();
	libxml_use_internal_errors( $previous );

	if ( false === $xml ) {
		return false;
	}

	$attr = $xml->attributes();

	if ( isset( $attr->viewBox ) ) {
		$box = preg_split( '/[\s,]+/', trim( (string) $attr->viewBox ) );
		if ( 4 === count( $box ) && (float) $box[2] > 0 && (float) $box[3] > 0 ) {
			return array( (int) round( (float) $box[2] ), (int) round( (float) $box[3] ) );
		}
	}

	if ( isset( $attr->width, $attr->height ) ) {
		$w = (int) (float) $attr->width;
		$h = (int) (float) $attr->height;
		if ( $w > 0 && $h > 0 ) {
			return array( $w, $h );
		}
	}

	return false;
}

/**
 * Hand the editor a size for SVG attachments so the Image block can lay one out.
 *
 * @param array   $response   Attachment data for JS.
 * @param WP_Post $attachment Attachment post.
 * @return array
 */
function theme_prefix_svg_attachment_for_js( $response, $attachment ) {
	if ( 'image/svg+xml' !== $response['mime'] ) {
		return $response;
	}

	$size = theme_prefix_svg_dimensions( $attachment->ID );

	if ( ! $size ) {
		return $response;
	}

	list( $width, $height ) = $size;

	$response['width']  = $width;
	$response['height'] = $height;
	$response['sizes']  = array(
		'full' => array(
			'url'         => $response['url'],
			'width'       => $width,
			'height'      => $height,
			'orientation' => $height > $width ? 'portrait' : 'landscape',
		),
	);

	return $response;
}
add_filter( 'wp_prepare_attachment_for_js', 'theme_prefix_svg_attachment_for_js', 10, 2 );

/**
 * SVG has no intrinsic pixel size, so the media library renders a blank tile.
 * Give the admin just enough CSS to show the artwork.
 */
function theme_prefix_svg_admin_thumbnails() {
	echo '<style>.media-icon img[src$=".svg"],.attachment-preview img[src$=".svg"],td.media-icon img[src$=".svg"]{width:100%;height:auto;}</style>' . "\n";
}
add_action( 'admin_head', 'theme_prefix_svg_admin_thumbnails' );
