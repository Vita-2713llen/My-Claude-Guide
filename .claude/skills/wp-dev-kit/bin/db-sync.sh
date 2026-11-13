#!/usr/bin/env bash
# Move a database between environments with WP-CLI.
# Run from Local's "Open site shell" (or any terminal):  wp-content/bin/db-sync.sh <from> <to> [options]
#
# How it works (short):
#   1. back up the target;
#   2. the source dump is imported into STAGING tables wpsyncin_* — the target is not changed yet;
#   3. in the staging tables: source transactional data is removed (ID conflicts checked), the target's own
#      orders/entries and settings are added, the table prefix, URLs and the ID counter are fixed;
#   4. one atomic RENAME TABLE swaps them in — the only moment the target changes (an error before it = no change);
#   5. caches are flushed and the result is checked (site URL, leftover tables, media).

. "$(dirname "$0")/lib/common.sh"

usage() {
  cat >&2 <<'EOF'
Usage: bin/db-sync.sh <from> <to> [options]
  <from>/<to>: local | dev | prod   (prod — source only)

Modes:
  --mode=full      (default) the whole DB
  --mode=content   content only: posts/pages/products/forms + meta, terms,
                   CONTENT_EXTRA_TABLES and CONTENT_OPTIONS. Target users and settings are untouched.
  --pages=a,b      ONLY these pages (ID, slug, path, URL) with their images/files — bin/pages-sync.sh

NOT MOVED BY DEFAULT (the target keeps its own):
  • users (users, usermeta)
  • transactional data: WooCommerce orders, form entries, job queues (KEEP_TABLES / KEEP_POST_TYPES)
  • environment settings (PRESERVE_OPTIONS: payment keys, SMTP, licences…)

  --with-users          OVERWRITE target users with source users (full only; admin passwords will change!)
  --with-transactional  OVERWRITE target orders/entries with source data

Other:
  --clean          drop target tables that do not exist in the source (full only)
  --no-backup      no backup (not recommended)
  --dry-run        only show the plan (what moves, what stays) and exit
  -y, --yes        no confirmation

Examples:
  bin/db-sync.sh local dev                    # main case: whole DB from local to DEV (DEV users/orders/keys stay)
  bin/db-sync.sh local dev --mode=content     # content only (DEV site settings stay too)
  bin/db-sync.sh local dev --with-users       # same + users from local
  bin/db-sync.sh dev local                    # pull the DB from DEV to local (without DEV orders and users)
EOF
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]] && { usage; exit 1; }
# --pages=a,b = only the chosen pages with their media (bin/pages-sync.sh), not the whole DB
for a in "$@"; do [[ "$a" == --pages=* ]] && exec bash "$(dirname "$0")/pages-sync.sh" "$@"; done

ALL_ARGS=("$@")   # for the automatic retry
FROM="$1"; TO="$2"; shift 2
MODE="full"; KEEP_USERS=1; CLEAN=0; YES=0; BACKUP=1; KEEP_TX=1; DRY=0
while (($#)); do
  case "$1" in
    --mode=*)                  MODE="${1#*=}" ;;
    --with-users)              KEEP_USERS=0 ;;
    --with-transactional)      KEEP_TX=0 ;;
    --clean)                   CLEAN=1 ;;
    --no-backup)               BACKUP=0 ;;
    --dry-run)                 DRY=1 ;;
    -y|--yes)                  YES=1 ;;
    -h|--help)                 usage; exit 0 ;;
    *)                         die "Unknown option: $1" ;;
  esac
  shift
done

[[ "$MODE" == "full" || "$MODE" == "content" ]] || die "Unknown mode: $MODE"
[[ "$FROM" != "$TO" ]] || die "Source and target are the same."
check_env "$FROM"; check_env "$TO"
check_writable "$TO" db
if [[ "$MODE" == "content" ]] && ((!KEEP_USERS || CLEAN || !KEEP_TX)); then
  die "--with-users / --with-transactional / --clean are for --mode=full only (content moves pages/posts only)."
fi

STAGE="wpsyncin_"   # staging tables (import)
OLD="wpsyncold_"    # old target tables during the swap

# ── Automatic retry after a short-lived server failure ────────────────
# A busy shared server sometimes runs out of open files or connections for a moment (MariaDB "ERROR 1030 …
# Too many open files", "MySQL server has gone away", a dropped SSH connection). Before the table swap the
# target is untouched, so the script waits and starts again by itself: DBSYNC_RETRIES attempts in total
# (default 3), 1 and then 2 minutes apart; the backup of the first attempt is reused.
ATTEMPT="${DBSYNC_ATTEMPT:-1}"; RETRIES="${DBSYNC_RETRIES:-3}"
[[ "$ATTEMPT" =~ ^[1-9]$ && "$RETRIES" =~ ^[1-9]$ ]] || { ATTEMPT=1; RETRIES=3; }
if [[ -z "${DBSYNC_ERRLOG:-}" ]]; then
  # A copy of everything printed to stderr: the retry decision reads the error text from it
  DBSYNC_ERRLOG="$(mktemp "${TMPDIR:-/tmp}/dbsync-err.XXXXXX")"; export DBSYNC_ERRLOG
  # On screen, a server short of files prints dozens of identical "PHP Startup: Unable to load dynamic
  # library" lines: show the first one only (the log keeps all of them).
  exec 2> >(tee -a "$DBSYNC_ERRLOG" | awk '/^[[:space:]]*(PHP )?Warning:[[:space:]]+PHP Startup: Unable to load dynamic library/ { if (n++) { if (n == 2) print "  (more of the same PHP Startup lines hidden)"; fflush(); next } } { print; fflush() }' >&2)
else
  : > "$DBSYNC_ERRLOG"
fi
trap 'cleanup; rm -f "$DBSYNC_ERRLOG"' EXIT
TRANSIENT_RE='Too many open files|[Ee]rror:? 2[34] |Errcode: 2[34]|server has gone away|Lost connection to|Can.t connect to (local )?(MySQL|MariaDB|server)|Deadlock found|Lock wait timeout|Cannot allocate memory|Resource temporarily unavailable|Class "?Phar"? not found|Unable to load dynamic library|cannot open shared object file|exec request failed|Connection (closed|reset|timed out)|Broken pipe|kex_exchange_identification'
FIRST_WHY="${DBSYNC_FIRST_WHY:-}"   # the cause seen on the first failed attempt (later ones may only see SSH drop)
CONFIRMED=0; BACKUP_DONE=""
((ATTEMPT > 1)) && warn "Attempt $ATTEMPT of $RETRIES."

# ── Helpers ───────────────────────────────────────────────────────────
words() { printf '%s' "$1" | tr -s ' \n\t' ' ' | sed -e 's/^ //' -e 's/ $//'; }      # list → "a b c"
in_list() { [[ " $(printf '%s' "$2" | tr '\n' ' ') " == *" $1 "* ]]; }  # in_list word "list"
has_tbl() { [[ ",$1," == *",$2,"* ]]; }                                  # has_tbl csv table
q() { wp_on "$TO" db query "$1" --skip-column-names "${SKIP[@]}"; }      # SQL on the target

# (option_name LIKE 'a\_%' OR …) from space-separated patterns; * → %
like_or() {
  local col="$1" out="" p; shift
  for p in "$@"; do
    p="$(printf '%s' "$p" | sed -e 's/\\/\\\\/g' -e "s/'/''/g" -e 's/_/\\_/g' -e 's/%/\\%/g' -e 's/\*/%/g')"
    out="${out:+$out OR }$col LIKE '$p'"
  done
  printf '(%s)' "${out:-0}"
}

# Lists sync tables on the target with the given prefixes (wpsyncin_ / wpsyncold_) as `a`,`b`,… or nothing.
sync_tables_where() {
  local w="" p
  for p in "$@"; do w="${w:+$w OR }table_name LIKE '${p//_/\\_}%'"; done
  printf 'table_schema = DATABASE() AND (%s)' "$w"
}
drop_sync_tables() { # drop_sync_tables <prefix>…
  local list
  list="$(q "SET SESSION group_concat_max_len = 1000000;
    SELECT GROUP_CONCAT(CONCAT('\`', table_name, '\`')) FROM information_schema.tables WHERE $(sync_tables_where "$@");" \
    | grep -v "^[[:space:]]*$" | tail -n 1)"
  if [[ -n "$list" && "$list" != "NULL" ]]; then
    q "SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS $list;" >/dev/null
  fi
}
# How many sync tables with these prefixes are on the target (empty = could not ask).
count_sync_tables() {
  q "SELECT COUNT(*) FROM information_schema.tables WHERE $(sync_tables_where "$@");" 2>/dev/null \
    | grep -v "^[[:space:]]*$" | tail -n 1 | tr -dc '0-9' || true
}

PHASE="prepare"
# Steps after the table swap (shown if the run stops halfway)
FINISH_STEPS=("orders/entries created on '$TO' during the move (they are in its ${OLD}posts table — do not drop it by hand)"
  "drop old sync tables" "content options (content mode)" "server-only plugins" "cache flush and hooks")
STEP=0
# The target is unchanged: if the error looks like a short-lived server failure, wait and start again
# (the process is replaced, so this returns only when there is nothing to retry).
retry_if_transient() {
  local code="$1" why wait all srv e
  sleep 1   # let tee write the last error lines
  # Only lines from the server/WP-CLI: the script's own messages start with a color code and must not count
  why="$(grep -v $'^\033\\[' "$DBSYNC_ERRLOG" 2>/dev/null | grep -E "$TRANSIENT_RE" | head -n 1 \
    | sed -e 's/^[[:space:]]*//' | cut -c1-160 || true)"
  if [[ -z "$why" ]] && ((code == 255)); then why="SSH connection dropped"; fi
  [[ -n "$why" ]] || return 0
  [[ -n "$FIRST_WHY" ]] || FIRST_WHY="$why"
  if ((ATTEMPT >= RETRIES)); then
    warn "The server failed $ATTEMPT time(s) in a row — this is a server problem, not a script one."
    warn "  first error: \"$FIRST_WHY\""
    [[ "$why" == "$FIRST_WHY" ]] || warn "  last error:  \"$why\""
    all="$FIRST_WHY $why"
    if [[ "$all" == *"open files"* || "$all" =~ (rror:? |rrcode: )2[34] || "$all" == *"shared object"* \
          || "$all" == *"exec request failed"* || "$all" == *"Phar"* ]]; then
      # Which server and app: whoever gets the message has many of them
      for e in "$FROM" "$TO"; do
        is_local "$e" && continue
        srv="${srv:+$srv; }$(upper "$e"): SSH $(env_var "$e" SSH), folder $(env_var "$e" PATH)"
        [[ -n "$(env_var "$e" URL)" ]] && srv="$srv, site $(env_var "$e" URL)"
      done
      warn "The server runs out of open files or processes. Message for the sysadmin / Cloudways support:"
      warn "  \"Server ${srv:-?}: MariaDB, PHP (WP-CLI) and SSH fail with errors like:"
      warn "   $FIRST_WHY"
      warn "   The limit is server-wide, so the cause may be another application on the same server."
      warn "   Please check cat /proc/sys/fs/file-nr (open / free / max), find the process or app holding the files"
      warn "   (often stuck cron or queue workers), stop it, and raise fs.file-max or restart the services.\""
    else
      warn "Run the same command again later; if it repeats, ask the sysadmin to check the server (load, disk, MySQL)."
    fi
    return 0
  fi
  wait=$((ATTEMPT * ${DBSYNC_RETRY_WAIT:-60}))
  warn "Short-lived server failure (\"$why\"). Target '$TO' not changed. Trying again in ${wait}s (attempt $((ATTEMPT + 1)) of $RETRIES)…"
  sleep "$wait"
  cleanup
  export DBSYNC_ATTEMPT=$((ATTEMPT + 1)) DBSYNC_BACKUP_FILE="$BACKUP_DONE" DBSYNC_FIRST_WHY="$FIRST_WHY"
  if ((CONFIRMED)); then exec bash "$0" "${ALL_ARGS[@]}" -y; else exec bash "$0" "${ALL_ARGS[@]}"; fi
}

on_error() {
  local code=$?
  trap - ERR
  # Inside $(…) only pass the code up: the main script reports the error once
  if ((BASH_SUBSHELL > 0)); then exit "$code"; fi
  ((code == 255)) && warn "The SSH connection failed (see the line above: \"exec request failed\", \"Connection closed\", \"Permission denied\")."
  case "$PHASE" in
    prepare) warn "Error before import — target '$TO' not changed."
             retry_if_transient "$code"
             ((code == 255)) && warn "Run the same command again in a minute. If it repeats: SSH diagnostics (wp-setup skill) or ask the sysadmin to check the server." ;;
    staged)  warn "Error while preparing the staging tables — target '$TO' not changed."
             drop_sync_tables "$STAGE" 2>/dev/null || true
             retry_if_transient "$code"
             warn "Run the same command again — it starts from scratch." ;;
    swapping) if ((code == 255)); then
               warn "The connection broke during the table swap. The swap is atomic: it happened completely or not at all."
               warn "Open the site on '$TO': new content = moved, but the final steps (orders created meanwhile, server-only"
               warn "plugins, caches) did not run; old content = nothing changed. In both cases running the same command again is safe."
             else
               warn "The table swap failed — target '$TO' not changed (the swap is atomic)."
               drop_sync_tables "$STAGE" 2>/dev/null || true
               retry_if_transient "$code"
               warn "Run the same command again."
             fi ;;
    swapped) warn "NOT finished: the data from '$FROM' is on '$TO' (URLs and IDs are already fixed),"
             warn "but these final steps did NOT run:"
             local i
             for ((i = STEP; i < ${#FINISH_STEPS[@]}; i++)); do warn "  - ${FINISH_STEPS[$i]}"; done
             warn "Fix: run the same command again (it re-imports from '$FROM', safe to repeat)."
             if ((BACKUP)); then warn "Or roll back: gunzip -c $BACKUP_FILE | wp db import -   (in the WP root on '$TO')"; fi
             warn "If WP-CLI on '$TO' fails again (\"Too many open files\", \"Class Phar not found\") — the server is short of resources: ask the sysadmin." ;;
    done)    warn "Data moved, but cache flush/hooks failed on '$TO'. Run there: wp cache flush && wp rewrite flush" ;;
  esac
  exit "$code"
}
trap on_error ERR

# ── 1. Environment parameters and plugin profiles ─────────────────────
info "Reading environment parameters…"
SP="$(wp_on "$FROM" config get table_prefix)"
DP="$(wp_on "$TO" config get table_prefix)"
[[ "$SP" =~ ^[A-Za-z0-9_]+$ && "$DP" =~ ^[A-Za-z0-9_]+$ ]] || die "Odd table prefix: '$SP' / '$DP'"

SRC_URL="$(env_var "$FROM" URL)"; [[ -n "$SRC_URL" ]] || SRC_URL="$(wp_on "$FROM" option get home "${SKIP[@]}")"
DST_URL="$(env_var "$TO" URL)";   [[ -n "$DST_URL" ]] || DST_URL="$(wp_on "$TO" option get home "${SKIP[@]}")"
SRC_URL="${SRC_URL%/}"; DST_URL="${DST_URL%/}"
[[ -n "$SRC_URL" && -n "$DST_URL" ]] || die "Could not determine the URL. Set $(upper "$FROM")_URL / $(upper "$TO")_URL in .env"

SRC_TABLES="$(wp_on "$FROM" db tables --all-tables-with-prefix --format=csv "${SKIP[@]}")"
DST_TABLES="$(wp_on "$TO" db tables --all-tables-with-prefix --format=csv "${SKIP[@]}" </dev/null)" \
  || die "Could not list the tables on '$TO' — is WordPress installed there and is the site running? Target not changed."
has_tbl "$DST_TABLES" "${DP}options" || die "'$TO' has no ${DP}options table — install WordPress there first. Target not changed."
if has_tbl "$SRC_TABLES" "${SP}blogs" || has_tbl "$DST_TABLES" "${DP}blogs"; then
  die "Multisite is not supported by db-sync (found ${SP}blogs / ${DP}blogs). Nothing changed."
fi

# Both lists are required: without them plugin profiles (which tables are orders/entries) would not load and
# server-only/security plugins would not be re-activated after the push.
fail_prepare() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; retry_if_transient 1; exit 1; }
SRC_PLUGINS="$(wp_on "$FROM" plugin list --status=active --field=name "${SKIP[@]}" </dev/null)" \
  || fail_prepare "Could not list the active plugins on '$FROM' (WP-CLI failed, see above). Nothing changed."
DST_PLUGINS="$(wp_on "$TO" plugin list --status=active --field=name "${SKIP[@]}" </dev/null)" \
  || fail_prepare "Could not list the active plugins on '$TO' (WP-CLI failed, see above). Target not changed."
SRC_PLUGINS="$(printf '%s' "$SRC_PLUGINS" | tr '\n' ' ')"; DST_PLUGINS="$(printf '%s' "$DST_PLUGINS" | tr '\n' ' ')"
PROFILES=""
for slug in $SRC_PLUGINS $DST_PLUGINS; do
  if [[ -f "$PROFILES_DIR/$slug.conf" ]] && ! in_list "$slug" "$PROFILES"; then
    . "$PROFILES_DIR/$slug.conf"
    PROFILES="$PROFILES $slug"
  fi
done

for t in $KEEP_POST_TYPES; do [[ "$t" =~ ^[A-Za-z0-9_-]+$ ]] || die "Invalid post type in KEEP_POST_TYPES: $t"; done
TYPES_SQL=""
for t in $KEEP_POST_TYPES; do TYPES_SQL="${TYPES_SQL:+$TYPES_SQL,}'$t'"; done

# ── 2. Which tables to move (suffixes without the prefix) ─────────────
IMPORT=""; SKIPPED_TX=""; STRUCT_ONLY=""
if [[ "$MODE" == "full" ]]; then
  for t in ${SRC_TABLES//,/ }; do
    s="${t#"$SP"}"
    if ((KEEP_TX)) && in_list "$s" "$KEEP_TABLES"; then
      # The target keeps its own rows; if it has no such table yet, it gets an empty one (the plugin needs it)
      if has_tbl "$DST_TABLES" "$DP$s"; then SKIPPED_TX="$SKIPPED_TX $s"; else STRUCT_ONLY="$STRUCT_ONLY $s"; IMPORT="$IMPORT $s"; fi
      continue
    fi
    if ((KEEP_USERS)) && [[ "$s" == "users" || "$s" == "usermeta" ]]; then SKIPPED_TX="$SKIPPED_TX $s"; continue; fi
    IMPORT="$IMPORT $s"
  done
else
  for s in $CONTENT_TABLES $CONTENT_EXTRA_TABLES; do
    if has_tbl "$SRC_TABLES" "$SP$s"; then
      in_list "$s" "$IMPORT" || IMPORT="$IMPORT $s"
    elif in_list "$s" "$CONTENT_TABLES"; then
      warn "Table $SP$s does not exist in '$FROM' — skipping"
    fi
  done
fi
IMPORT="${IMPORT# }"
[[ -n "$IMPORT" ]] || die "No tables to move."
IMPORT_CSV=""
for s in $IMPORT; do IMPORT_CSV="${IMPORT_CSV:+$IMPORT_CSV,}$SP$s"; done

imported()   { in_list "$1" "$IMPORT"; }
dst_had()    { has_tbl "$DST_TABLES" "$DP$1"; }
swapped()    { imported "$1" && dst_had "$1"; }   # after the swap the old version is in wpsyncold_<s>

KEEP_POSTS=0
if ((KEEP_TX)) && [[ -n "$TYPES_SQL" ]] && swapped posts; then KEEP_POSTS=1; fi

# ── 3. Summary and confirmation ───────────────────────────────────────
if [[ "$MODE" == "full" ]]; then
  ((KEEP_USERS)) && USERS_NOTE="kept from '$TO'" || USERS_NOTE="OVERWRITTEN from '$FROM'"
else
  USERS_NOTE="untouched"
fi
if ((KEEP_TX)); then TX_NOTE="kept from '$TO'"; else TX_NOTE="come from '$FROM'"; fi

cat >&2 <<EOF

  From         : $FROM   $SRC_URL   (prefix $SP)
  To           : $TO   $DST_URL   (prefix $DP)
  Mode         : $MODE, tables: $(printf '%s\n' $IMPORT | wc -l | tr -d ' ')
  Profiles     : $(words "${PROFILES:-none}")
  Users        : $USERS_NOTE
  Transactional: $TX_NOTE${KEEP_POST_TYPES:+
                 post types: $(words "$KEEP_POST_TYPES")}
  Backup       : $( ((BACKUP)) && echo "yes" || echo "NO" )
  Tables       : $(printf '%s' "$IMPORT" | tr -s ' ' ',')${STRUCT_ONLY:+
  Empty tables : $(words "$STRUCT_ONLY") (missing on '$TO': structure only, no rows from '$FROM')}${SKIPPED_TX:+
  Untouched    : $(words "$SKIPPED_TX")}

EOF
if ((!KEEP_USERS)); then
  warn "--with-users: ALL users on '$TO' (admins, customers, their passwords) will be replaced with users from '$FROM'."
  ((KEEP_TX)) && warn "Orders/entries on '$TO' stay, but may lose their link to customers."
  # Who can log in to '$TO' after the move: source admins, and target admins that will disappear (logins only, no passwords).
  SRC_ADMINS="$(wp_on "$FROM" user list --role=administrator --field=user_login "${SKIP[@]}" </dev/null 2>/dev/null | tr '\n' ' ' || true)"
  DST_ADMINS="$(wp_on "$TO" user list --role=administrator --field=user_login "${SKIP[@]}" </dev/null 2>/dev/null | tr '\n' ' ' || true)"
  [[ -n "${SRC_ADMINS// /}" ]] || die "'$FROM' has no administrators — after --with-users nobody could log in to '$TO'. Cancelled."
  LOST_ADMINS=""
  for a in $DST_ADMINS; do in_list "$a" "$SRC_ADMINS" || LOST_ADMINS="$LOST_ADMINS $a"; done
  cat >&2 <<EOF
  Admins after the move (from '$FROM'): ${SRC_ADMINS% }
  Admin passwords on '$TO' will become the ones from '$FROM' — '$FROM' must have strong passwords (DEV is open to the internet).
EOF
  [[ -n "$LOST_ADMINS" ]] && warn "These admins on '$TO' will disappear and cannot log in:${LOST_ADMINS} — warn them or add them to '$FROM' before the move."
fi
if ((!KEEP_TX)); then
  warn "--with-transactional: orders/entries on '$TO' will be replaced with data from '$FROM'."
fi
# Media check: the DB brings attachment records; their files come only with files-sync.
# If uploads on '$FROM' still have files missing on '$TO', the media library there shows empty thumbnails.
if imported posts; then
  MEDIA_MISSING="$(bash "$REPO_ROOT/bin/files-sync.sh" "$FROM" "$TO" uploads --dry-run </dev/null 2>/dev/null \
    | sed -n 's/^Number of \(regular \)\{0,1\}files transferred: *\([0-9,]*\).*/\2/p' | tr -d ',' | tail -n 1 || true)"
  if [[ ! "${MEDIA_MISSING:-}" =~ ^[0-9]+$ ]]; then
    warn "Media: could not compare uploads on '$FROM' and '$TO' — run bin/files-sync.sh $FROM $TO uploads --dry-run before this."
  elif ((MEDIA_MISSING > 0)); then
    warn "Media: $MEDIA_MISSING file(s) in uploads on '$FROM' are missing or different on '$TO'."
    warn "Run first: bin/files-sync.sh $FROM $TO uploads   (otherwise the media library on '$TO' shows empty items)"
  fi
fi
if ((DRY)); then ok "Dry-run: nothing changed."; exit 0; fi
((YES)) || confirm "$TO"
CONFIRMED=1

# ── 4. Target backup ──────────────────────────────────────────────────
TS="$(date +%Y%m%d%H%M%S)"
if is_local "$TO"; then BACKUP_DIR="../db-backups"; else BACKUP_DIR="../private_html/db-backups"; fi
BACKUP_FILE="$BACKUP_DIR/${TO}-before-${FROM}-${TS}.sql.gz"
if ((BACKUP)) && [[ -n "${DBSYNC_BACKUP_FILE:-}" ]]; then
  # A retry: the target has not changed since the first attempt, its backup is still valid
  BACKUP_FILE="$DBSYNC_BACKUP_FILE"; BACKUP_DONE="$BACKUP_FILE"
  ok "Backup from the first attempt is still valid (target not changed since): $BACKUP_FILE"
elif ((BACKUP)); then
  info "Backup '$TO' → $BACKUP_FILE"
  run_on "$TO" "mkdir -p $(printf '%q' "$BACKUP_DIR") && wp db export - --skip-plugins --skip-themes | gzip > $(printf '%q' "$BACKUP_FILE")"
  BACKUP_DONE="$BACKUP_FILE"
  # Disk on Cloudways is limited: keep the last BACKUP_KEEP backups of this target
  run_on "$TO" "ls -1t $(printf '%q' "$BACKUP_DIR")/${TO}-before-*.sql.gz 2>/dev/null | tail -n +$(( ${BACKUP_KEEP:-10} + 1 )) | while IFS= read -r f; do rm -f \"\$f\"; done" </dev/null || true
fi
ensure_tmp "$FROM"; ensure_tmp "$TO"

# ── 5. Import into staging tables ─────────────────────────────────────
# Everything up to the swap (step 9) happens in the staging tables wpsyncin_*: the target's live tables are only
# read. The swap is the single moment the target changes; whatever fails before it leaves the target untouched.
transform_dump() {
  # 1) Newer MariaDB mysqldump (Cloudways) writes a "sandbox mode" first line — MySQL 8 (Local) does not understand it.
  # 2) Collations: MySQL 8 ones (utf8mb4_0900_*) do not exist in MariaDB, MariaDB 11 ones (uca1400_*) not in MySQL.
  #    Only in table definitions, never in data rows (INSERT lines): serialized values must keep their length.
  #    Binary / case-sensitive → utf8mb4_bin (UNIQUE keys stay case-sensitive), the rest → utf8mb4_unicode_ci.
  # 3) Tables `<prefix>X` → `wpsyncin_X`: only where a statement names its table — never columns, keys or data
  #    (a column like `wp_user_id` or text in a post stays as it is).
  # 4) FOREIGN KEY names must be unique in the DB — add a sync tag (WooCommerce wc_download_log).
  LC_ALL=C sed -E \
    -e '1{/enable the sandbox mode/d;}' \
    -e '/^INSERT INTO /!s/utf8mb4_(0900|uca1400)_([a-z0-9]+_)*(bin|cs)([^a-z0-9_]|$)/utf8mb4_bin\4/g' \
    -e '/^INSERT INTO /!s/utf8mb4_(0900|uca1400)_[a-z0-9_]+/utf8mb4_unicode_ci/g' \
    -e '/^INSERT INTO /!s/COLLATE=uca1400_[a-z0-9_]+/COLLATE=utf8mb4_unicode_ci/g' \
    -e "s/^(DROP TABLE IF EXISTS|CREATE TABLE|LOCK TABLES|INSERT INTO|\/\*!40000 ALTER TABLE) \`${SP}/\1 \`${STAGE}/" \
    -e "/^[[:space:]]+CONSTRAINT /s/REFERENCES \`${SP}/REFERENCES \`${STAGE}/" \
    -e "/^[[:space:]]+CONSTRAINT /s/CONSTRAINT \`(s[0-9]{14}_)?([^\`]+)\`/CONSTRAINT \`s${TS}_\2\`/"
}

# Leftovers of an earlier run: wpsyncin_* (never swapped in) and wpsyncold_* (the target before that run's swap,
# also in its backup) — both are safe to drop, the live tables already hold everything the target keeps.
drop_sync_tables "$STAGE" "$OLD"
left="$(count_sync_tables "$STAGE" "$OLD")"
if [[ "${left:-1}" != "0" ]]; then
  die "'$TO' still has ${left:-?} sync tables from an interrupted run (${OLD}*, ${STAGE}*) and they could not be dropped.
  Target NOT changed. Usually the server was short of resources (WP-CLI errors such as \"Too many open files\").
  Run the same command again; if it repeats, ask the sysadmin to check the server, or drop those tables by hand."
fi
info "Importing $FROM → staging tables on '$TO'…"
PHASE="staged"
wp_on "$FROM" db export - --tables="$IMPORT_CSV" --single-transaction --quick "${SKIP[@]}" \
  | transform_dump \
  | wp_on "$TO" db import - "${SKIP[@]}"

# One query for all staging tables (not one SSH + WP-CLI call per table: a busy server does not need 60 of them)
want=0; names=""
for s in $IMPORT; do want=$((want + 1)); names="${names:+$names,}'$STAGE$s'"; done
have="$(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ($names)")"
if [[ "$have" != "$want" ]]; then
  drop_sync_tables "$STAGE" || true
  die "Only ${have:-?} of $want staging tables were created on '$TO' — stopping, target not changed. Run the same command again."
fi
ok "Source data is in the staging tables"

# Tables the target keeps for itself but does not have yet (first push to a fresh site): structure only, no rows
if [[ -n "$STRUCT_ONLY" ]]; then
  info "Creating empty tables on '$TO' (structure only):$STRUCT_ONLY"
  t=""; for s in $STRUCT_ONLY; do t="$t TRUNCATE TABLE \`$STAGE$s\`;"; done
  q "SET FOREIGN_KEY_CHECKS = 0;$t" >/dev/null
fi

# ── 6. Transactional data: remove the source's, check ID conflicts ────
if ((KEEP_TX)) && [[ -n "$TYPES_SQL" ]] && imported posts; then
  info "Removing transactional data from '$FROM' (types: $TYPES_SQL)…"
  sql="DELETE FROM ${STAGE}posts WHERE post_type IN ($TYPES_SQL);"
  imported postmeta && sql="$sql DELETE m FROM ${STAGE}postmeta m LEFT JOIN ${STAGE}posts p ON p.ID = m.post_id WHERE p.ID IS NULL;"
  imported term_relationships && sql="$sql DELETE r FROM ${STAGE}term_relationships r LEFT JOIN ${STAGE}posts p ON p.ID = r.object_id WHERE p.ID IS NULL;"
  if imported comments; then
    sql="$sql DELETE c FROM ${STAGE}comments c LEFT JOIN ${STAGE}posts p ON p.ID = c.comment_post_ID WHERE c.comment_post_ID <> 0 AND p.ID IS NULL;"
    imported commentmeta && sql="$sql DELETE cm FROM ${STAGE}commentmeta cm LEFT JOIN ${STAGE}comments c ON c.comment_ID = cm.comment_id WHERE c.comment_ID IS NULL;"
  fi
  q "$sql" >/dev/null
fi

if ((KEEP_POSTS)); then
  info "Checking ID conflicts with transactional data on '$TO'…"
  clash="$(q "SELECT COUNT(*) FROM ${STAGE}posts i JOIN \`${DP}posts\` d ON d.ID = i.ID WHERE d.post_type IN ($TYPES_SQL)")"
  for pair in ${KEEP_ID_TABLES:-}; do        # e.g. wc_orders:id (HPOS takes IDs from placeholder posts)
    t="${pair%%:*}"; c="${pair#*:}"
    if dst_had "$t" && in_list "$t" "$KEEP_TABLES" && ! imported "$t"; then
      c3="$(q "SELECT COUNT(*) FROM ${STAGE}posts i JOIN \`${DP}${t}\` d ON d.${c} = i.ID")"
      clash=$((clash + c3))
    fi
  done
  if swapped comments; then
    c2="$(q "SELECT COUNT(*) FROM ${STAGE}comments i JOIN \`${DP}comments\` d ON d.comment_ID = i.comment_ID
             JOIN \`${DP}posts\` p ON p.ID = d.comment_post_ID WHERE p.post_type IN ($TYPES_SQL)")"
    clash=$((clash + c2))
  fi
  if ((clash > 0)); then
    drop_sync_tables "$STAGE"
    die "ID conflict: $clash records from '$FROM' have the same IDs as orders/entries on '$TO'. Target NOT changed.
   Why: '$TO' has orders/entries created before the script set the ID gap (POST_ID_GAP),
   or content was created directly on '$TO' (create pages on local, not on the server).
   Options: if this is test data — add --with-transactional (it will be replaced);
   if it is needed — move the conflicting pages by hand. After the first
   successful push the gap is in place and conflicts no longer happen."
  fi
fi

# ── 7. Add what belongs to the target (into the staging tables) ───────
if ((KEEP_POSTS)); then
  info "Adding '$TO' transactional data (posts, meta, notes)…"
  sql="INSERT INTO ${STAGE}posts SELECT * FROM \`${DP}posts\` WHERE post_type IN ($TYPES_SQL);"
  swapped postmeta && sql="$sql INSERT INTO ${STAGE}postmeta (post_id, meta_key, meta_value)
      SELECT m.post_id, m.meta_key, m.meta_value FROM \`${DP}postmeta\` m JOIN \`${DP}posts\` p ON p.ID = m.post_id WHERE p.post_type IN ($TYPES_SQL);"
  if swapped comments; then
    sql="$sql INSERT INTO ${STAGE}comments SELECT c.* FROM \`${DP}comments\` c JOIN \`${DP}posts\` p ON p.ID = c.comment_post_ID WHERE p.post_type IN ($TYPES_SQL);"
    swapped commentmeta && sql="$sql INSERT INTO ${STAGE}commentmeta (comment_id, meta_key, meta_value)
      SELECT cm.comment_id, cm.meta_key, cm.meta_value FROM \`${DP}commentmeta\` cm
      JOIN \`${DP}comments\` c ON c.comment_ID = cm.comment_id JOIN \`${DP}posts\` p ON p.ID = c.comment_post_ID
      WHERE p.post_type IN ($TYPES_SQL);"
  fi
  q "$sql" >/dev/null
fi

# shellcheck disable=SC2086
if [[ "$MODE" == "full" ]] && swapped options && [[ -n "${PRESERVE_OPTIONS// /}" ]]; then
  info "Keeping environment settings of '$TO' (PRESERVE_OPTIONS)…"
  W="$(like_or option_name $PRESERVE_OPTIONS)"
  q "DELETE FROM ${STAGE}options WHERE $W;
     INSERT INTO ${STAGE}options (option_name, option_value, autoload)
       SELECT option_name, option_value, autoload FROM \`${DP}options\` WHERE $W;" >/dev/null
fi

# The prefix is also baked into data: <prefix>user_roles, <prefix>capabilities, <prefix>user_level…
if [[ "$SP" != "$DP" ]]; then
  if imported options; then
    info "Prefix in data: $SP → $DP (options)"
    q "UPDATE IGNORE ${STAGE}options SET option_name = '${DP}user_roles' WHERE option_name = '${SP}user_roles';" >/dev/null
  fi
  if imported usermeta; then
    info "Prefix in data: $SP → $DP (usermeta)"
    q "UPDATE IGNORE ${STAGE}usermeta SET meta_key = CONCAT('${DP}', SUBSTRING(meta_key, $(( ${#SP} + 1 ))))
       WHERE LEFT(meta_key, ${#SP}) = '${SP}';" >/dev/null
  fi
fi

# ── 8. URLs and IDs (still in the staging tables) ─────────────────────
replace() { # replace <old> <new> <table pattern> [extra flags]
  info "search-replace: $1 → $2"
  wp_on "$TO" search-replace "$1" "$2" "$3" "${@:4}" --skip-columns=guid --report-changed-only "${SKIP[@]}"
}
replace_urls() { # replace_urls <table pattern> [extra flags]
  [[ "$SRC_URL" != "$DST_URL" ]] || return 0
  replace "$SRC_URL" "$DST_URL" "$@"                          # https://dev.site.com → http://site.local
  replace "${SRC_URL//\//\\/}" "${DST_URL//\//\\/}" "$@"      # the same in JSON (Gutenberg, Elementor): https:\/\/…
  SRC_HOST="${SRC_URL#*://}"; DST_HOST="${DST_URL#*://}"
  if [[ "$SRC_HOST" != "$DST_HOST" ]]; then replace "//$SRC_HOST" "//$DST_HOST" "$@"; fi  # links with another protocol
  return 0
}
replace_urls "${STAGE}*" --all-tables

# New IDs after the move. Server: largest content ID + POST_ID_GAP, so orders/entries created there never take
# IDs that pages created later on local will use (the formula is stable: repeated pushes do not inflate IDs).
# Local: largest content ID + 1 — the dump brings the server's counter, and local pages must stay below the gap.
if imported posts; then
  notkept="1=1"; pnotkept="1=1"
  if [[ -n "$TYPES_SQL" ]]; then notkept="post_type NOT IN ($TYPES_SQL)"; pnotkept="p.post_type NOT IN ($TYPES_SQL)"; fi
  if is_local "$TO"; then GAP=1; else GAP="${POST_ID_GAP:-0}"; fi
  if ((GAP > 0)); then
    max="$(q "SELECT COALESCE(MAX(ID), 0) FROM ${STAGE}posts WHERE $notkept")"
    q "ALTER TABLE ${STAGE}posts AUTO_INCREMENT = $((max + GAP));" >/dev/null
    if imported comments; then
      cmax="$(q "SELECT COALESCE(MAX(c.comment_ID), 0) FROM ${STAGE}comments c LEFT JOIN ${STAGE}posts p ON p.ID = c.comment_post_ID WHERE p.ID IS NULL OR $pnotkept")"
      q "ALTER TABLE ${STAGE}comments AUTO_INCREMENT = $((cmax + GAP));" >/dev/null
    fi
    if ((GAP > 1)); then
      next="$(q "SELECT GREATEST($((max + GAP)), COALESCE(MAX(ID), 0) + 1) FROM ${STAGE}posts")"
      ok "New orders/entries on '$TO' will get IDs from $next"
    fi
  fi
fi

# ── 9. Atomic table swap — the only moment the target changes ─────────
pairs=""
for s in $IMPORT; do
  dst_had "$s" && pairs="$pairs\`$DP$s\` TO \`$OLD$s\`, "
  pairs="$pairs\`$STAGE$s\` TO \`$DP$s\`, "
done
info "Swapping tables (RENAME TABLE)…"
PHASE="swapping"
q "RENAME TABLE ${pairs%, };" >/dev/null
PHASE="swapped"; STEP=0
ok "Tables on '$TO' replaced"

# Orders/entries/notes created on the target while this script ran (after step 7 copied them) are only in the
# old tables now: add the missing ones before those tables are dropped. One transaction; meta before rows.
if ((KEEP_POSTS)); then
  newp="$(q "SELECT COUNT(*) FROM ${OLD}posts o LEFT JOIN \`${DP}posts\` n ON n.ID = o.ID
             WHERE o.post_type IN ($TYPES_SQL) AND n.ID IS NULL")"
  newc=0
  if swapped comments; then
    newc="$(q "SELECT COUNT(*) FROM ${OLD}comments c JOIN ${OLD}posts o ON o.ID = c.comment_post_ID
               LEFT JOIN \`${DP}comments\` n ON n.comment_ID = c.comment_ID WHERE o.post_type IN ($TYPES_SQL) AND n.comment_ID IS NULL")"
  fi
  if ((newp > 0 || newc > 0)); then
    sql="START TRANSACTION;"
    swapped postmeta && sql="$sql INSERT INTO \`${DP}postmeta\` (post_id, meta_key, meta_value)
      SELECT m.post_id, m.meta_key, m.meta_value FROM ${OLD}postmeta m JOIN ${OLD}posts o ON o.ID = m.post_id
      LEFT JOIN \`${DP}posts\` n ON n.ID = o.ID WHERE o.post_type IN ($TYPES_SQL) AND n.ID IS NULL;"
    sql="$sql INSERT INTO \`${DP}posts\` SELECT o.* FROM ${OLD}posts o LEFT JOIN \`${DP}posts\` n ON n.ID = o.ID
      WHERE o.post_type IN ($TYPES_SQL) AND n.ID IS NULL;"
    if swapped comments; then
      swapped commentmeta && sql="$sql INSERT INTO \`${DP}commentmeta\` (comment_id, meta_key, meta_value)
        SELECT cm.comment_id, cm.meta_key, cm.meta_value FROM ${OLD}commentmeta cm
        JOIN ${OLD}comments c ON c.comment_ID = cm.comment_id JOIN ${OLD}posts o ON o.ID = c.comment_post_ID
        LEFT JOIN \`${DP}comments\` n ON n.comment_ID = c.comment_ID WHERE o.post_type IN ($TYPES_SQL) AND n.comment_ID IS NULL;"
      sql="$sql INSERT INTO \`${DP}comments\` SELECT c.* FROM ${OLD}comments c JOIN ${OLD}posts o ON o.ID = c.comment_post_ID
        LEFT JOIN \`${DP}comments\` n ON n.comment_ID = c.comment_ID WHERE o.post_type IN ($TYPES_SQL) AND n.comment_ID IS NULL;"
    fi
    q "$sql COMMIT;" >/dev/null
    ok "Added what was created on '$TO' during the move: $newp order(s)/entr(ies), $newc note(s)"
  fi
fi

STEP=1
info "Dropping old tables…"
drop_sync_tables "$OLD" || true
left="$(count_sync_tables "$STAGE" "$OLD")"
if [[ "${left:-1}" != "0" ]]; then
  warn "Could not drop the old sync tables (${OLD}*) on '$TO' — the site itself is fine; the next db-sync run drops them."
fi

if ((CLEAN)); then
  extra=""
  for t in ${DST_TABLES//,/ }; do
    s="${t#"$DP"}"
    imported "$s" && continue
    ((KEEP_TX)) && in_list "$s" "$KEEP_TABLES" && continue
    ((KEEP_USERS)) && [[ "$s" == "users" || "$s" == "usermeta" ]] && continue
    extra="${extra:+$extra, }\`$t\`"
  done
  if [[ -n "$extra" ]]; then
    info "--clean: dropping tables on '$TO' that do not exist in '$FROM': $extra"
    q "SET FOREIGN_KEY_CHECKS = 0; DROP TABLE $extra;" >/dev/null
  fi
fi

# ── 10. Content options (content mode only) ───────────────────────────
STEP=2
if [[ "$MODE" == "content" && -n "${CONTENT_OPTIONS// /}" ]]; then
  info "Moving content options (CONTENT_OPTIONS)…"
  # shellcheck disable=SC2086
  wp_on "$FROM" eval-file "$(put_file "$FROM" "$LIB_DIR/options-tool.php")" export $CONTENT_OPTIONS "${SKIP[@]}" \
    > "$LOCAL_TMP/content-options.json"
  wp_on "$TO" eval-file "$(put_file "$TO" "$LIB_DIR/options-tool.php")" import \
    "$(put_file "$TO" "$LOCAL_TMP/content-options.json")" "${SKIP[@]}"
  replace_urls "${DP}options"
fi

# ── 11. Server-only plugins (cache, security) ─────────────────────────
STEP=3
# Deactivated on local; on the server, the ones that were active before the import are re-activated.
for plugin in ${SERVER_ONLY_PLUGINS:-}; do
  if is_local "$TO"; then
    wp_on "$TO" plugin deactivate "$plugin" --quiet </dev/null >/dev/null 2>&1 || true
  elif dst_has "$plugin"; then
    info "Re-activating server-only plugin $plugin"
    wp_on "$TO" plugin activate "$plugin" --quiet </dev/null >/dev/null 2>&1 || warn "Could not activate $plugin"
  fi
done

# ── 12. Caches and hooks ──────────────────────────────────────────────
STEP=4
PHASE="done"
info "Flushing caches…"
wp_on "$TO" option delete rewrite_rules "${SKIP[@]}" >/dev/null 2>&1 || true
wp_on "$TO" transient delete --all "${SKIP[@]}" >/dev/null 2>&1 || true
wp_on "$TO" cache flush "${SKIP[@]}" >/dev/null 2>&1 || true
is_local "$TO" || wp_on "$TO" breeze purge --cache=all >/dev/null 2>&1 || true

while IFS= read -r line <&3; do
  [[ -z "$line" ]] && continue
  env="${line%%|*}"; cmd="${line#*|}"
  [[ "$env" == "*" || "$env" == "$TO" ]] || continue
  info "Hook: wp $cmd"
  run_on "$TO" "wp $cmd" </dev/null || warn "Failed: wp $cmd"
done 3<<<"$HOOKS_LIST"

# ── 13. Final check: is everything really in place? ───────────────────
info "Checking the result on '$TO'…"
PROBLEMS=""
home="$(wp_on "$TO" option get home "${SKIP[@]}" 2>/dev/null </dev/null || true)"
home="${home%/}"
if [[ -z "$home" ]]; then
  PROBLEMS="$PROBLEMS
  - could not read the site URL on '$TO' (WP-CLI did not answer) — open the site and check it"
elif [[ "$home" != "$DST_URL" ]]; then
  PROBLEMS="$PROBLEMS
  - site URL on '$TO' is $home, expected $DST_URL — URL replacement did not finish; run the same command again"
fi
left="$(count_sync_tables "$STAGE" "$OLD")"
if [[ "${left:-}" =~ ^[1-9] ]]; then
  PROBLEMS="$PROBLEMS
  - $left old sync table(s) left on '$TO' (the site works; the next run drops them)"
fi
if [[ "${MEDIA_MISSING:-0}" =~ ^[1-9] ]]; then
  PROBLEMS="$PROBLEMS
  - media: $MEDIA_MISSING file(s) from '$FROM' uploads are not on '$TO' — run: bin/files-sync.sh $FROM $TO uploads"
fi

if [[ -n "$PROBLEMS" ]]; then
  warn "Database moved ($FROM → $TO, $MODE), but NOT everything is in place:$PROBLEMS"
else
  ok "Done: $FROM → $TO ($MODE). Checked: site URL $home, no leftover sync tables${MEDIA_MISSING:+, media in place}."
fi
if ((BACKUP)); then ok "Backup before import: $BACKUP_FILE (on '$TO')"; fi
if [[ "$MODE" == "content" && -z "${MEDIA_MISSING:-}" ]]; then warn "Don't forget the media files: bin/files-sync.sh $FROM $TO uploads"; fi
exit 0
