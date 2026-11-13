#!/usr/bin/env bash
# Shared functions for bin/*.sh.
# Compatible with bash 3.2 (the macOS default), so no associative arrays and no mapfile.

set -Eeuo pipefail
set -f # no glob expansion: patterns like options_* are passed as is

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_DIR="$BIN_DIR/lib"
REPO_ROOT="$(cd "$BIN_DIR/.." && pwd)" # = wp-content (repo root)
WP_ROOT="$(cd "$REPO_ROOT/.." && pwd)" # = WordPress root (in Local: app/public)

PROFILES_DIR="$REPO_ROOT/.deploy/profiles"

# Local environment (the site's wp, mysql, php): scripts work from any terminal and from Claude Code,
# not only from Local → "Open site shell". Inside the site shell itself (MYSQL_HOME already set) nothing changes.
if [[ -z "${MYSQL_HOME:-}" && -f "$HOME/Library/Application Support/Local/sites.json" ]]; then
  eval "$(bash "$BIN_DIR/local-env.sh" "$WP_ROOT" 2>/dev/null)" || true
fi

# Post-import hooks: add_hook <env|*> '<wp command without "wp">'
HOOKS_LIST=""
add_hook() { HOOKS_LIST="${HOOKS_LIST}$1|$2"$'\n'; }

# Active plugins on the target (filled in by db-sync.sh before loading profiles)
DST_PLUGINS=""
dst_has() { [[ " $DST_PLUGINS " == *" $1 "* ]]; }

# Shared server addresses (in Git), then personal overrides (.env, not in Git)
if [[ -f "$REPO_ROOT/.deploy/environments.conf" ]]; then . "$REPO_ROOT/.deploy/environments.conf"; fi
if [[ -f "$REPO_ROOT/.env" ]]; then set -a; . "$REPO_ROOT/.env"; set +a; fi
if [[ -f "$REPO_ROOT/.deploy/sync.conf" ]]; then . "$REPO_ROOT/.deploy/sync.conf"; fi

SSH_OPTS="${SSH_OPTS:--o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new}"
SKIP=(--skip-plugins --skip-themes)

# ── Output ────────────────────────────────────────────────────────────
info() { printf '\033[36m→\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Environments ──────────────────────────────────────────────────────
upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# env_var dev SSH  →  the value of $DEV_SSH
env_var() { local n; n="$(upper "$1")_$2"; printf '%s' "${!n:-}"; }

is_local() { [[ "$1" == "local" ]]; }

check_env() {
  local e="$1"
  [[ "$e" =~ ^[a-z][a-z0-9]*$ ]] || die "Invalid environment name: '$e'"
  is_local "$e" && return 0
  [[ -n "$(env_var "$e" SSH)" && -n "$(env_var "$e" PATH)" ]] \
    || die "$(upper "$e")_SSH / $(upper "$e")_PATH for '$e' are not set in .deploy/environments.conf"
}

# Only local, dev and WRITABLE_ENVS (environments.conf, e.g. "staging") may be written to.
# prod: never by default; db-sync allows it only with ALLOW_PROD_WRITE=1 (never set it by Claude).
check_writable() {
  local e="$1"
  if [[ "$e" == "prod" ]]; then   # WRITABLE_ENVS never opens prod
    [[ "${ALLOW_PROD_WRITE:-0}" == "1" && "${2:-}" == "db" ]] && return 0
    die "Writing to 'prod' is blocked."
  fi
  [[ "$e" == "local" || "$e" == "dev" || " ${WRITABLE_ENVS:-} " == *" $e "* ]] && return 0
  die "Writing to '$e' is blocked: only local, dev and WRITABLE_ENVS in .deploy/environments.conf are writable."
}

# Run a shell string in the WordPress root of the given environment.
# STDIN is passed through (needed for `wp db import -`).
run_on() {
  local e="$1" cmd="$2"
  if is_local "$e"; then
    # A child bash, not a ( ) subshell: then an error reaches the caller's ERR trap (bash 3.2 loses it in a subshell)
    bash -c "set -o pipefail; cd $(printf '%q' "$WP_ROOT") && $cmd"
  else
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$(env_var "$e" SSH)" \
      "set -o pipefail; cd $(printf '%q' "$(env_var "$e" PATH)") && $cmd"
  fi
}

# wp_on dev option get home  — WP-CLI on the given environment, arguments are escaped.
wp_on() {
  local e="$1"; shift
  run_on "$e" "wp $(printf '%q ' "$@")"
}

# ── PHP ───────────────────────────────────────────────────────────────
# "8.2.29" → 802 (to compare major.minor versions); empty if not a version
php_num() { [[ "${1:-}" =~ ^([0-9]+)\.([0-9]+) ]] && echo $(( BASH_REMATCH[1] * 100 + BASH_REMATCH[2] )); }

# PHP on the environment (major.minor), empty on failure
php_on() { run_on "$1" 'php -r "echo PHP_MAJOR_VERSION, \".\", PHP_MINOR_VERSION;"' </dev/null 2>/dev/null || true; }

# Compares local and environment PHP with PHP_MIN. Only warns, never blocks.
php_check() {
  local e="$1" lv ev mv="${PHP_MIN:-8.2}" bad=0
  lv="$(php_on local)"; ev="$(php_on "$e")"
  [[ -n "$ev" ]] || { warn "Could not detect PHP on $e."; return 0; }
  if [[ -n "$(php_num "$lv")" && "$(php_num "$lv")" -lt "$(php_num "$mv")" ]]; then
    warn "Local PHP $lv is lower than PHP_MIN=$mv. Raise PHP in Local, or the team lead lowers PHP_MIN in .deploy/environments.conf."; bad=1
  fi
  if [[ "$(php_num "$ev")" -lt "$(php_num "$mv")" ]]; then
    warn "PHP on $e $ev is lower than PHP_MIN=$mv: code with newer syntax will break there. Team lead: set PHP_MIN=\"$ev\" in .deploy/environments.conf."; bad=1
  fi
  ((bad)) || ok "PHP: local ${lv:-?}, $e $ev; code is checked in CI on $mv — different versions from $mv up are compatible."
}

# ── Temporary files ───────────────────────────────────────────────────
LOCAL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/wpsync.XXXXXX")"
REMOTE_TMPS="" # "env|path" lines for cleanup

cleanup() {
  local line e d
  if [[ -n "$REMOTE_TMPS" ]]; then
    while IFS= read -r line <&3; do
      [[ -z "$line" ]] && continue
      e="${line%%|*}"; d="${line#*|}"
      # shellcheck disable=SC2086
      ssh $SSH_OPTS "$(env_var "$e" SSH)" "rm -rf $(printf '%q' "$d")" </dev/null >/dev/null 2>&1 || true
    done 3<<<"$REMOTE_TMPS"
  fi
  rm -rf "$LOCAL_TMP"
}
trap cleanup EXIT

# Creates a temp folder on the environment (do NOT call inside $(…): it keeps state).
ensure_tmp() {
  local e="$1" var d
  is_local "$e" && return 0
  var="TMP_$(upper "$e")"
  [[ -n "${!var:-}" ]] && return 0
  # Not /tmp: on Cloudways the application user is limited to its own folder, and private_html is not web-visible
  d="$(run_on "$e" 'mkdir -p ../private_html && mktemp -d "$(cd ../private_html && pwd)/.wpsync.XXXXXX"' </dev/null)"
  printf -v "$var" '%s' "$d"
  REMOTE_TMPS="${REMOTE_TMPS}${e}|${d}"$'\n'
}

# put_file dev ./file  → prints the path to the file's copy on the environment.
put_file() {
  local e="$1" f="$2" var
  if is_local "$e"; then printf '%s' "$f"; return 0; fi
  var="TMP_$(upper "$e")"
  [[ -n "${!var:-}" ]] || die "ensure_tmp $e was not called"
  # Through ssh, not scp: modern scp uses SFTP, and on Cloudways SFTP is locked into the app folder, so the
  # server's absolute paths (/home/…/private_html) do not exist for it.
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$(env_var "$e" SSH)" "cat > $(printf '%q' "${!var}/$(basename "$f")")" < "$f"
  printf '%s/%s' "${!var}" "$(basename "$f")"
}

# Lines of a list (file or variable) without comments and empty lines.
clean_lines() { sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^[[:space:]]*$/d'; }

confirm() {
  local expected="$1" answer
  read -r -p "To continue, type the target environment name ($expected): " answer
  [[ "$answer" == "$expected" ]] || die "Cancelled."
}
