#!/usr/bin/env bash
# Builds a release: only themes/plugins from .deploy/targets, already built (dist/, vendor/), without service files.
# GitHub Actions puts this content into branch deploy/<env>, which Cloudways pulls ("Deployment via Git").
#   bin/release.sh <dir>          # build the release into a folder (its content is replaced, except .git)
#   bin/release.sh <dir> --no-build   # without composer/npm (check what goes into the release)
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-}"; BUILD=1
[[ -n "$OUT" ]] || { echo "Usage: bin/release.sh <dir> [--no-build]" >&2; exit 1; }
[[ "${2:-}" == "--no-build" ]] && BUILD=0
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
[[ "$OUT" != "$REPO_ROOT" && "$OUT" != "$REPO_ROOT/"* ]] || { echo "The release folder must be outside the repository" >&2; exit 1; }
[[ "$REPO_ROOT" != "$OUT/"* && "$OUT" != "/" ]] || { echo "The release folder must not contain the repository: $OUT" >&2; exit 1; }
# Its content is deleted below: allow only an empty folder or a release checkout (has .git)
if [[ ! -e "$OUT/.git" ]] && [[ -n "$(ls -A "$OUT")" ]]; then
  echo "The release folder is not empty and is not a release checkout: $OUT" >&2; exit 1
fi

((BUILD)) && bash "$REPO_ROOT/bin/build.sh"

TARGETS="$(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^[[:space:]]*$/d' "$REPO_ROOT/.deploy/targets")"
[[ -n "$TARGETS" ]] || { echo ".deploy/targets is empty" >&2; exit 1; }

# Rebuild the content completely (except .git) so that what was deleted in the repo disappears from the release too
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

while IFS= read -r t; do
  src="$REPO_ROOT/$t"
  [[ -e "$src" ]] || { echo "$t is not in the repository (check .deploy/targets)" >&2; exit 1; }
  mkdir -p "$OUT/$(dirname "$t")"
  if [[ -d "$src" ]]; then
    rsync -rl --exclude-from="$REPO_ROOT/.deploy/rsync-exclude" "$src/" "$OUT/$t/"
  else
    cp -p "$src" "$OUT/$t"
  fi
  echo "→ $t"
done <<<"$TARGETS"

