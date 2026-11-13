#!/usr/bin/env bash
# The Local environment (the site's wp, mysql, php, composer) in any terminal — not only in "Open site shell".
#   eval "$(bash bin/local-env.sh)"     # for the site this wp-content belongs to
#   bash bin/local-env.sh --list        # all Local sites: name, wp-content, status, PHP, kit version, git
# Changes nothing. bin/*.sh pick up this environment by themselves (bin/lib/common.sh).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$HOME/Library/Application Support/Local"
LP="$(ls -d "$BASE"/lightning-services/php-*/bin/*/bin/php 2>/dev/null | tail -1 || true)"
[[ -n "$LP" ]] || { echo "# Local not found ($BASE)"; exit 0; }
exec "$LP" "$ROOT/bin/lib/local-env.php" "${1:-$(cd "$ROOT/.." && pwd)}"
