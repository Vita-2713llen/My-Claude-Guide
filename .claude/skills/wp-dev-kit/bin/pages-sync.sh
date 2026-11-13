#!/usr/bin/env bash
# Move ONLY the chosen pages/posts/products with everything they show — images and files (incl. ACF, galleries,
# Gutenberg and Elementor data), reusable blocks, Elementor templates, categories/tags, product variations.
# Nothing else on the target changes: other pages, menus, settings, users and orders stay as they are.
#   bin/pages-sync.sh local dev about contacts 123 https://site.local/services/web/ --dry-run
#   bin/pages-sync.sh local dev --pages=about,contacts -y
#   bin/pages-sync.sh dev local about                       # pull one page from DEV
#   bin/pages-sync.sh --rollback dev <file> [--dry-run|-y]  # undo a push (the file is named after each run)

. "$(dirname "$0")/lib/common.sh"

usage() {
  cat >&2 <<'EOF'
Usage: bin/pages-sync.sh <from> <to> <page>... [--pages=a,b] [--no-media] [--dry-run] [-y]
       bin/pages-sync.sh --rollback <env> <file> [--dry-run] [-y]
  <page>: ID, slug, path (services/web) or URL of a page/post/product on <from>.
  Moved: the page, its meta (ACF, Elementor, SEO), categories/tags, and what it shows — images/files,
  reusable blocks, Elementor templates, product variations. Missing parent pages are created.
  NOT moved: menus, widgets, site settings, other pages (use db-sync.sh --mode=content for those).
  --no-media   only the database part, no files
  --dry-run    show what would change, change nothing
  -y           no confirmation
EOF
}

[[ $# -lt 2 || "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 1; }

TS="$(date +%Y%m%d%H%M%S)"
backup_dir() { if is_local "$1"; then echo "../db-backups"; else echo "../private_html/db-backups"; fi; }

# ── Rollback of an earlier push ───────────────────────────────────────
if [[ "$1" == "--rollback" ]]; then
  ENV="${2:-}"; FILE="${3:-}"; shift 3 || { usage; exit 1; }
  DRY=0; YES=0
  while (($#)); do case "$1" in --dry-run) DRY=1 ;; -y|--yes) YES=1 ;; *) die "Unknown option: $1" ;; esac; shift; done
  check_env "$ENV"; check_writable "$ENV"
  [[ "$FILE" == */* ]] || FILE="$(backup_dir "$ENV")/$FILE"
  ensure_tmp "$ENV"
  TOOL="$(put_file "$ENV" "$LIB_DIR/pages-tool.php")"
  info "Rollback on '$ENV' from $FILE:"
  wp_on "$ENV" eval-file "$TOOL" rollback "$FILE" dry "${SKIP[@]}" </dev/null | sed 's/^/  /' >&2
  if ((DRY)); then ok "Dry-run: nothing changed."; exit 0; fi
  ((YES)) || confirm "$ENV"
  wp_on "$ENV" eval-file "$TOOL" rollback "$FILE" "${SKIP[@]}" </dev/null >/dev/null
  wp_on "$ENV" cache flush "${SKIP[@]}" >/dev/null 2>&1 </dev/null || true
  ok "Rolled back on '$ENV'. Media files copied by that push stay (they harm nothing)."
  exit 0
fi

FROM="$1"; TO="$2"; shift 2
SELS=""; MEDIA=1; DRY=0; YES=0
while (($#)); do
  case "$1" in
    --pages=*)  SELS="$SELS $(printf '%s' "${1#*=}" | tr ',' ' ')" ;;
    --no-media) MEDIA=0 ;;
    --dry-run)  DRY=1 ;;
    -y|--yes)   YES=1 ;;
    -h|--help)  usage; exit 0 ;;
    -*)         die "Unknown option: $1 (pages-sync moves pages only; for the whole DB use db-sync.sh)" ;;
    *)          SELS="$SELS $1" ;;
  esac
  shift
done
[[ -n "${SELS// /}" ]] || die "Name the pages: ID, slug, path or URL (e.g. bin/pages-sync.sh local dev about 123)."
check_env "$FROM"; check_env "$TO"
[[ "$FROM" != "$TO" ]] || die "Source and target are the same."
is_local "$FROM" || is_local "$TO" || die "One side must be local."
check_writable "$TO"

info "Reading environment parameters…"
SRC_URL="$(env_var "$FROM" URL)"; [[ -n "$SRC_URL" ]] || SRC_URL="$(wp_on "$FROM" option get home "${SKIP[@]}" </dev/null)"
DST_URL="$(env_var "$TO" URL)";   [[ -n "$DST_URL" ]] || DST_URL="$(wp_on "$TO" option get home "${SKIP[@]}" </dev/null)"
SRC_URL="${SRC_URL%/}"; DST_URL="${DST_URL%/}"
[[ -n "$SRC_URL" && -n "$DST_URL" ]] || die "Could not determine the site URLs. Set $(upper "$FROM")_URL / $(upper "$TO")_URL in .env"

# Plugin profiles: orders/entries must never be moved as "pages"; hooks (Elementor CSS…) run after the move
SRC_PLUGINS="$(wp_on "$FROM" plugin list --status=active --field=name "${SKIP[@]}" </dev/null)" \
  || die "Could not list the active plugins on '$FROM' (see above). Nothing changed."
DST_PLUGINS="$(wp_on "$TO" plugin list --status=active --field=name "${SKIP[@]}" </dev/null)" \
  || die "Could not list the active plugins on '$TO' (see above). Nothing changed."
SRC_PLUGINS="$(printf '%s' "$SRC_PLUGINS" | tr '\n' ' ')"; DST_PLUGINS="$(printf '%s' "$DST_PLUGINS" | tr '\n' ' ')"
PROFILES=""
for slug in $SRC_PLUGINS $DST_PLUGINS; do
  if [[ -f "$PROFILES_DIR/$slug.conf" && " $PROFILES " != *" $slug "* ]]; then . "$PROFILES_DIR/$slug.conf"; PROFILES="$PROFILES $slug"; fi
done

# ── 1. What the pages consist of (source, read only) ──────────────────
ensure_tmp "$FROM"; ensure_tmp "$TO"
info "Collecting the pages and what they show on '$FROM'…"
# shellcheck disable=SC2086 # selectors are separate words (no globbing: set -f)
wp_on "$FROM" eval-file "$(put_file "$FROM" "$LIB_DIR/pages-tool.php")" export $SELS "${SKIP[@]}" </dev/null > "$LOCAL_TMP/export.out" \
  || die "Could not collect the pages on '$FROM' (the reason is above). Nothing changed."
sed -n '/^@@DATA@@$/,$p' "$LOCAL_TMP/export.out" | tail -n +2 > "$LOCAL_TMP/pages.payload"
[[ -s "$LOCAL_TMP/pages.payload" ]] || die "The source did not return the pages (see above). Nothing changed."
awk -F'\t' '$1=="FILE"{print $2}' "$LOCAL_TMP/export.out" > "$LOCAL_TMP/files.txt"
NOFILES="$(awk -F'\t' '$1=="NOFILE"{print "    " $2}' "$LOCAL_TMP/export.out")"
awk -F'\t' '$1=="NOTE"{print $2}' "$LOCAL_TMP/export.out" | while IFS= read -r n; do warn "$n"; done

bad=""
while IFS=$'\t' read -r tag id type rest; do
  [[ "$tag" == ITEM ]] || continue
  for t in $KEEP_POST_TYPES; do [[ "$type" == "$t" ]] && bad="$bad $id($type)"; done
done < "$LOCAL_TMP/export.out"
[[ -z "$bad" ]] || die "These are orders/entries (KEEP_POST_TYPES), not pages:$bad — they are never moved. Nothing changed."

# ── 2. What would change on the target ────────────────────────────────
TOOL_TO="$(put_file "$TO" "$LIB_DIR/pages-tool.php")"
PAYLOAD_TO="$(put_file "$TO" "$LOCAL_TMP/pages.payload")"
rc=0
wp_on "$TO" eval-file "$TOOL_TO" plan "$PAYLOAD_TO" "$SRC_URL" "$DST_URL" "${SKIP[@]}" </dev/null > "$LOCAL_TMP/plan.out" || rc=$?
((rc == 0 || rc == 3)) || die "Could not compare with '$TO' (WP-CLI failed, see above). Nothing changed."

NFILES="$(grep -c . "$LOCAL_TMP/files.txt" || true)"
spec() { # uploads folder for rsync
  if is_local "$1"; then printf '%s/uploads/' "$REPO_ROOT"
  else printf '%s:%s/wp-content/uploads/' "$(env_var "$1" SSH)" "$(env_var "$1" PATH)"; fi
}
RSYNC=(-ltz --files-from="$LOCAL_TMP/files.txt")
is_local "$TO" || RSYNC+=(--chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r)
TOSEND="-"
if ((MEDIA && NFILES > 0)); then
  # shellcheck disable=SC2086
  TOSEND="$(rsync "${RSYNC[@]}" -n --itemize-changes -e "ssh $SSH_OPTS" "$(spec "$FROM")" "$(spec "$TO")" 2>/dev/null | grep -c '^[<>]f' || true)"
fi

{
  echo
  echo "  From   : $FROM   $SRC_URL"
  echo "  To     : $TO   $DST_URL   (only the posts below change)"
  echo
  awk -F'\t' '{
    role = ($4 == "main") ? "" : " [" $4 "]";
    printf "  %-8s %-17s %8s  %s%s%s\n", $1, $3, $2, $5, role, ($6 != "" ? "  — " $6 : "")
  }' "$LOCAL_TMP/plan.out"
  echo
  if ((MEDIA && NFILES == 0)); then
    echo "  Media  : none used by these pages"
  elif ((MEDIA)); then
    echo "  Media  : $NFILES file(s) used by these pages, ${TOSEND:-?} of them new/changed for '$TO' (sent first)"
  else
    echo "  Media  : not moved (--no-media)"
  fi
  [[ -z "$NOFILES" ]] || printf '  Missing on %s (referenced, but no file — skipped):\n%s\n' "$FROM" "$NOFILES"
  echo "  Undo   : saved before writing; the command to roll back is printed at the end"
  echo "  Not moved: menus, widgets, site settings, other pages."
  echo
} >&2

if ((rc == 3)); then
  die "CONFLICT on '$TO' (lines above) — nothing changed. The ID or the address is taken by something else there:
  usually a page created directly on '$TO'. Delete/rename it there, or move all content once with db-sync.sh --mode=content."
fi
if ((DRY)); then ok "Dry-run: nothing changed."; exit 0; fi
((YES)) || confirm "$TO"

# ── 3. Files first (pages must not show empty images), then the DB in one transaction ──
if ((MEDIA && NFILES > 0)); then
  info "Media: $FROM → $TO ($NFILES file(s))"
  frc=0
  rsync "${RSYNC[@]}" -e "ssh $SSH_OPTS" "$(spec "$FROM")" "$(spec "$TO")" || frc=$?
  ((frc == 0)) || die "Media copy failed (rsync exit $frc) — the database was NOT changed. Run the same command again."
fi

ROLLBACK="$(backup_dir "$TO")/${TO}-pages-before-${FROM}-${TS}.bak"
run_on "$TO" "mkdir -p $(printf '%q' "$(backup_dir "$TO")")" </dev/null
info "Writing the pages on '$TO'…"
wp_on "$TO" eval-file "$TOOL_TO" apply "$PAYLOAD_TO" "$SRC_URL" "$DST_URL" "$ROLLBACK" "${SKIP[@]}" </dev/null > "$LOCAL_TMP/apply.out" \
  || die "Writing failed (see above) — the transaction was rolled back, '$TO' is unchanged. Run the same command again."
WRITTEN="$(grep -c '^DONE' "$LOCAL_TMP/apply.out" || true)"

# ── 4. Caches and plugin hooks (Elementor CSS…) ───────────────────────
info "Flushing caches…"
wp_on "$TO" cache flush "${SKIP[@]}" </dev/null >/dev/null 2>&1 || true
is_local "$TO" || wp_on "$TO" breeze purge --cache=all </dev/null >/dev/null 2>&1 || true
while IFS= read -r line <&3; do
  [[ -z "$line" ]] && continue
  env="${line%%|*}"; cmd="${line#*|}"
  [[ "$env" == "*" || "$env" == "$TO" ]] || continue
  run_on "$TO" "wp $cmd" </dev/null >/dev/null 2>&1 || warn "Failed: wp $cmd"
done 3<<<"$HOOKS_LIST"

ok "Done: $WRITTEN post(s) written on '$TO'$( ((MEDIA && NFILES > 0)) && echo ", $NFILES media file(s) in place" )."
ok "Undo: bin/pages-sync.sh --rollback $TO $(basename "$ROLLBACK") --dry-run"
exit 0
