#!/usr/bin/env bash
# Pack the kit from this project into an archive, to move it to another one:
#   bash bin/kit-pack.sh [folder for the archive]     → wp-dev-kit-<version>.zip
# The archive gets the kit files, and the project files as clean templates
# (this project's theme names and server addresses do not go into the archive).
set -Eeuo pipefail
set -f
SRC="$(cd "$(dirname "$0")/.." && pwd)"
. "$SRC/bin/lib/kit.conf"
OUT="${1:-$SRC/..}"; mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
VER="$(cat "$SRC/.deploy/KIT_VERSION")"
ZIP="$OUT/wp-dev-kit-$VER.zip"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wpkit.XXXXXX")"; trap 'rm -rf "$TMP"' EXIT
K="$TMP/wp-dev-kit"; mkdir -p "$K"
for p in $KIT_FILES; do
  [[ -e "$SRC/$p" ]] || continue
  mkdir -p "$K/$(dirname "$p")"
  if [[ -d "$SRC/$p" ]]; then rsync -a --exclude=.DS_Store "$SRC/$p/" "$K/$p/"; else cp -p "$SRC/$p" "$K/$p"; fi
done
for pair in $KIT_PROTECTED; do
  t="${pair%%:*}"; f="${pair#*:}"
  mkdir -p "$K/$(dirname "$f")"; cp -p "$SRC/.deploy/templates/$t" "$K/$f"
done
find "$K/bin" -name "*.sh" -exec chmod +x {} +
rm -f "$ZIP"
(cd "$TMP" && zip -qr -X "$ZIP" wp-dev-kit)
echo "✓ $ZIP"
