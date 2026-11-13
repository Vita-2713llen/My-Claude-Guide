#!/usr/bin/env bash
# One command for a developer (from any terminal or Claude Code; the Local environment is picked up automatically):
#   cd "<site>/app/public/wp-content" && bash bin/setup.sh
#
# First run: checks the environment and creates an SSH key (if there is none),
#            copies the public key to the clipboard — send it to the team lead once.
# Next run (after the team lead added the key): pulls media, third-party plugins and the database from DEV.
# Running it again at any time = "refresh my local from DEV".

. "$(dirname "$0")/lib/common.sh"

KEY="${SETUP_KEY:-$HOME/.ssh/id_ed25519}"
YES=0; [[ "${1:-}" == "-y" ]] && YES=1

info "Checking the environment…"
command -v git   >/dev/null || die "git is missing. Install Xcode Command Line Tools: xcode-select --install"
command -v rsync >/dev/null || die "rsync is missing."
[[ "${LOCAL_SITE_STATUS:-running}" == running ]] || die "The Local site is not running: Local → ${LOCAL_SITE_NAME:-site} → Start site."
command -v wp    >/dev/null || die "WP-CLI is missing. Is Local installed in /Applications? Or run from Local → Open site shell."
(cd "$WP_ROOT" && wp option get home >/dev/null 2>&1) \
  || die "WP-CLI cannot see the local site. The site must be running in Local (Start site)."
php -r 'exit(PHP_VERSION_ID >= 80000 ? 0 : 1);' || die "PHP 8+ is required (Local → site → PHP version)."
ok "Local, WP-CLI and PHP $(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;') — OK."

check_env dev
[[ "$DEV_SSH" != "app_user@123.45.67.89" ]] \
  || die "The team lead has not filled in .deploy/environments.conf yet (DEV_SSH). Ask them, then run git pull."

# ── SSH key: once per computer ────────────────────────────────────────
if [[ ! -f "$KEY" ]]; then
  info "Creating SSH key $KEY (no passphrase)…"
  mkdir -p "$(dirname "$KEY")"; chmod 700 "$(dirname "$KEY")"
  ssh-keygen -q -t ed25519 -N "" -C "$(whoami)@$(hostname -s) wp-dev" -f "$KEY"
fi
[[ "$KEY" == "$HOME/.ssh/id_ed25519" ]] || SSH_OPTS="$SSH_OPTS -i $KEY -o IdentitiesOnly=yes"
export SSH_OPTS # for files-sync.sh / db-sync.sh below

info "Checking access to DEV ($DEV_SSH)…"
# shellcheck disable=SC2086
if ! ssh $SSH_OPTS -o BatchMode=yes -o ConnectTimeout=15 "$DEV_SSH" true </dev/null 2>/dev/null; then
  command -v pbcopy >/dev/null && pbcopy < "$KEY.pub" && copied=" (already copied to the clipboard)" || copied=""
  cat >&2 <<EOF

  No access to DEV yet. Send this public key to the team lead$copied.
  Key file: $KEY.pub (copy again: pbcopy < "$KEY.pub")

$(cat "$KEY.pub")

  It is not a secret — the private part stays on your computer.
  If the team lead already added the key and there is still no access: the key has a passphrase → run ssh-add;
  or Cloudways has an IP allowlist on (Server → Security → Shell Access) → send your IP to the team lead.
  When the team lead confirms the key is added, run again:  bash bin/setup.sh

EOF
  exit 0
fi
ok "DEV access OK."
php_check dev

# ── Data from DEV ─────────────────────────────────────────────────────
cat >&2 <<'EOF'

Now this will be pulled from DEV into your local site:
  • media (uploads), third-party plugins and themes — your custom ones from Git are not touched;
  • the database — your local admin (users) stays, orders/form entries from DEV are not copied.
The local database is backed up before the import.
EOF
if ((YES == 0)); then
  read -r -p "Continue? [y/N] " a || a=""
  [[ "$a" == [yY]* ]] || die "Cancelled. Nothing changed."
fi

bash "$BIN_DIR/files-sync.sh" dev local
bash "$BIN_DIR/db-sync.sh" dev local -y

ok "Done. Open the site in Local (Open site) — it should look like DEV."
