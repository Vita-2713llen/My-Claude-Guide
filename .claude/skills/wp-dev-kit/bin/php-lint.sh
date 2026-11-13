#!/usr/bin/env bash
# PHP syntax check of our own themes/plugins (paths from .deploy/targets, without vendor/ and node_modules/).
#   bash bin/php-lint.sh
# Checks with the `php` in PATH. In GitHub Actions that is PHP_MIN from .deploy/environments.conf — the lowest version
# across environments, so newer PHP syntax (e.g. 8.4 on local) never reaches a server running 8.2.
set -Eeuo pipefail
set -f
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v php >/dev/null || { echo "✗ No php in PATH" >&2; exit 1; }

V="$(php -r 'echo PHP_VERSION;')"
n=0; bad=0
while IFS= read -r t; do
  p="$REPO_ROOT/$t"
  [[ -e "$p" ]] || continue
  while IFS= read -r -d '' f; do
    n=$((n + 1))
    if ! out="$(php -d display_errors=1 -d error_reporting=E_ALL -l "$f" 2>&1)"; then
      bad=$((bad + 1))
      printf '%s\n' "$out" | grep -v '^No syntax errors' >&2 || true
    fi
  done < <(find "$p" \( -name vendor -o -name node_modules \) -prune -o -type f -name '*.php' -print0)
done < <(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^[[:space:]]*$/d' "$REPO_ROOT/.deploy/targets")

if ((bad > 0)); then
  echo "✗ PHP $V: errors in $bad of $n files. Code must work on PHP_MIN — do not use features of newer versions." >&2
  exit 1
fi
echo "✓ PHP $V: $n files without syntax errors."
