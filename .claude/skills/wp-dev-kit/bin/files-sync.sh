#!/usr/bin/env bash
# Sync files that are not in Git: media (uploads), third-party plugins/themes, translations, fonts.
#   bin/files-sync.sh local dev            # push all of them to DEV
#   bin/files-sync.sh local dev uploads    # media only
#   bin/files-sync.sh dev local            # pull from DEV (e.g. for a new developer)

. "$(dirname "$0")/lib/common.sh"

usage() {
  cat >&2 <<'EOF'
Usage: bin/files-sync.sh <from> <to> [uploads|plugins|themes|languages|fonts|all] [--delete] [--dry-run]
  One side must be local. Only local, dev (and WRITABLE_ENVS) can be written to; prod is blocked.
  all = uploads, plugins, themes + languages (translations) and fonts (WP 6.5+ Font Library) if the source has them.
  plugins/themes — third-party only: custom ones from .deploy/targets are skipped (they go through Git).
  --delete   delete files on the target that are not in the source (careful!)
  --dry-run  show what would be copied, change nothing
EOF
}

[[ $# -lt 2 || "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 1; }
FROM="$1"; TO="$2"; shift 2
WHAT="all"; DELETE=0; DRY=0
while (($#)); do
  case "$1" in
    uploads|plugins|themes|languages|fonts|all) WHAT="$1" ;;
    --delete)  DELETE=1 ;;
    --dry-run) DRY=1 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

check_env "$FROM"; check_env "$TO"
[[ "$FROM" != "$TO" ]] || die "Source and target are the same."
is_local "$FROM" || is_local "$TO" || die "One side must be local."
check_writable "$TO"

spec() { # path to wp-content/<dir>/ for rsync
  if is_local "$1"; then printf '%s/%s/' "$REPO_ROOT" "$2"
  else printf '%s:%s/wp-content/%s/' "$(env_var "$1" SSH)" "$(env_var "$1" PATH)" "$2"; fi
}

# rsync options shared by the run and the check after it
base_args() {
  local dir="$1"
  ARGS=(-rltz)
  ((DELETE)) && ARGS+=(--delete)
  # On the server files must be accessible to the web server group
  is_local "$TO" || ARGS+=(--chmod=Du=rwx,Dg=rwx,Do=rx,Fu=rw,Fg=rw,Fo=r)
  ARGS+=(--exclude=.DS_Store)
  # Junk/cache/backup folders — only in uploads: in plugins the same names are real code (vendor/psr/cache/,
  # plugins/wpforms/), so these patterns never touch plugins or themes.
  if [[ "$dir" == "uploads" ]]; then
    for p in ${FILES_EXCLUDE:-}; do ARGS+=("--exclude=$p"); done
    # Private form-entry files (Gravity Forms, WPForms) and generated CSS are not pushed to the server
    if ! is_local "$TO"; then
      for p in ${FILES_PUSH_EXCLUDE:-}; do ARGS+=("--exclude=$p"); done
    fi
  fi
  # Server-only plugins (Cloudways' Breeze etc.) are not touched in either direction
  if [[ "$dir" == "plugins" ]]; then
    for p in ${SERVER_ONLY_PLUGINS:-}; do ARGS+=("--exclude=/$p"); done
  fi
  # Custom themes/plugins from Git are not overwritten (nor deleted by --delete)
  while IFS= read -r t <&3; do
    [[ "$t" == "$dir/"* ]] && ARGS+=("--exclude=/${t#"$dir"/}")
  done 3< <(clean_lines < "$REPO_ROOT/.deploy/targets")
  return 0
}

# How many files in <dir> still differ between source and target ("" = could not check)
left_to_send() {
  local dir="$1" out
  base_args "$dir"
  local rc=0
  out="$(rsync "${ARGS[@]}" -n --itemize-changes -e "ssh $SSH_OPTS" "$(spec "$FROM" "$dir")" "$(spec "$TO" "$dir")" 2>/dev/null)" || rc=$?
  # 23/24 = some files unreadable/vanished: the list is still valid; anything else = no connection
  [[ $rc == 0 || $rc == 23 || $rc == 24 ]] || return 0
  printf '%s\n' "$out" | grep -c '^[<>]f' || true
}

# rsync exit code → plain words
why() {
  case "$1" in
    255) echo "SSH connection failed" ;;
    23)  echo "some files could not be read or written (permissions, disk full)" ;;
    24)  echo "some files disappeared while copying" ;;
    11)  echo "write error on the target (disk full?)" ;;
    12|13|14) echo "connection broken during transfer" ;;
    30|35) echo "timeout" ;;
    *)   echo "rsync exit $1" ;;
  esac
}

NOT_DONE=""
sync_dir() {
  local dir="$1" rc=0 left
  if is_local "$TO"; then
    [[ -d "$REPO_ROOT/$dir" ]] || mkdir -p "$REPO_ROOT/$dir"
  elif [[ ! -d "$REPO_ROOT/$dir" ]] || { ((DELETE)) && [[ -z "$(find "$REPO_ROOT/$dir" -type f ! -name .DS_Store -print 2>/dev/null | head -n 1)" ]]; }; then
    # Never create or "sync" an empty local source: with --delete it would wipe the folder on the target
    ((DELETE)) && die "Local wp-content/$dir is missing or empty — with --delete this would delete everything in $dir on '$TO'. Nothing changed."
    warn "$dir: there is no local wp-content/$dir — nothing to send"
    return 0
  fi
  base_args "$dir"
  if ((DRY)); then ARGS+=(-n --itemize-changes --stats); else ARGS+=(--stats); fi
  info "$dir: $FROM → $TO"
  rsync "${ARGS[@]}" -e "ssh $SSH_OPTS" "$(spec "$FROM" "$dir")" "$(spec "$TO" "$dir")" || rc=$?
  ((DRY)) && { ((rc == 0)) || NOT_DONE="$NOT_DONE
  $dir: could not compare — $(why "$rc")"; return 0; }
  # After a real run, check that everything really arrived
  left="$(left_to_send "$dir")"
  if ((rc != 0)); then
    NOT_DONE="$NOT_DONE
  $dir: NOT all files were sent — $(why "$rc")"
    if [[ "${left:-0}" =~ ^[1-9] ]]; then NOT_DONE="$NOT_DONE, $left file(s) still differ"; fi
  elif [[ -z "$left" ]]; then
    NOT_DONE="$NOT_DONE
  $dir: transferred, but the check afterwards failed (connection) — run the same command again to verify"
  elif ((left > 0)); then
    NOT_DONE="$NOT_DONE
  $dir: $left file(s) still differ after the transfer"
  else
    ok "$dir: all files are in place (checked)"
  fi
}

# Does wp-content/<dir> exist on the environment?
has_dir() {
  if is_local "$1"; then [[ -d "$REPO_ROOT/$2" ]]
  else run_on "$1" "test -d wp-content/$2" </dev/null 2>/dev/null; fi
}

case "$WHAT" in
  all)
    sync_dir uploads; sync_dir plugins; sync_dir themes
    for d in languages fonts; do
      if has_dir "$FROM" "$d"; then sync_dir "$d"; fi
    done ;;
  languages|fonts)
    has_dir "$FROM" "$WHAT" || die "'$FROM' has no wp-content/$WHAT — nothing to move."
    sync_dir "$WHAT" ;;
  *) sync_dir "$WHAT" ;;
esac

if [[ -n "$NOT_DONE" ]]; then
  if ((DRY)); then
    warn "Dry-run did not finish — the plan is incomplete:$NOT_DONE"
    warn "Nothing was changed. Run the same command again in a minute; if it repeats, check SSH access (wp-setup skill)."
  else
    warn "NOT everything was transferred:$NOT_DONE"
    warn "Run the same command again — rsync only sends what is still missing. If it repeats, check the connection/server (disk space, \"Too many open files\")."
  fi
  exit 1
fi
if ((DRY)); then ok "Dry-run: nothing changed."; else ok "Done: everything transferred and checked."; fi
