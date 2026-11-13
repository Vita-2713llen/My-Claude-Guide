#!/usr/bin/env bash
# Builds custom themes/plugins before deploy (called in GitHub Actions).
# For each folder in .deploy/targets:
#   composer.json            → composer install --no-dev
#   package.json + "build"   → npm ci && npm run build
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^[[:space:]]*$/d' "$REPO_ROOT/.deploy/targets" | while IFS= read -r t; do
  dir="$REPO_ROOT/$t"
  [[ -d "$dir" ]] || continue
  if [[ -f "$dir/composer.json" ]]; then
    echo "→ composer: $t"
    composer install --working-dir="$dir" --no-dev --optimize-autoloader --no-interaction --no-progress
  fi
  if [[ -f "$dir/package.json" ]] && grep -q '"build"[[:space:]]*:' "$dir/package.json"; then
    echo "→ npm build: $t"
    if [[ -f "$dir/package-lock.json" ]]; then npm ci --prefix "$dir"; else npm install --prefix "$dir"; fi
    npm run build --prefix "$dir"
  fi
done
