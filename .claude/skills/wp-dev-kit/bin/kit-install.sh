#!/usr/bin/env bash
# Install or update the kit (wp-dev-kit) in another project's wp-content.
#   bash bin/kit-install.sh <path to the project's wp-content> [-y]
# Source = the folder this script is in: an unpacked archive or any project with the kit.
#
# • Kit files (bin/, .claude/, workflow, profiles, README, CLAUDE.md…) are copied, overwriting.
# • Project files (.gitignore, .deploy/targets, environments.conf, sync.conf) are created from templates
#   only if they do not exist yet — project settings are never overwritten.
# • Nothing is deleted: the project's own profiles/skills stay.
set -Eeuo pipefail
set -f
SRC="$(cd "$(dirname "$0")/.." && pwd)"
. "$SRC/bin/lib/kit.conf"

DST="${1:-}"; YES=0; [[ "${2:-}" == "-y" || "${2:-}" == "--yes" ]] && YES=1
[[ -n "$DST" ]] || { echo "Usage: bash bin/kit-install.sh <path to wp-content> [-y]" >&2; exit 1; }
[[ -d "$DST" ]] || { echo "✗ No such folder: $DST" >&2; exit 1; }
DST="$(cd "$DST" && pwd)"
[[ "$DST" != "$SRC" ]] || { echo "✗ Source and target are the same." >&2; exit 1; }
if [[ ! -f "$DST/../wp-config.php" && ! -d "$DST/themes" ]]; then
  echo "✗ $DST does not look like wp-content (no wp-config.php next to it and no themes/ inside)." >&2; exit 1
fi

NEW_VER="$(cat "$SRC/.deploy/KIT_VERSION" 2>/dev/null || echo '?')"
OLD_VER="$(cat "$DST/.deploy/KIT_VERSION" 2>/dev/null || echo 'none')"

echo "Kit wp-dev-kit $NEW_VER → $DST (now: $OLD_VER)"
echo "Will be copied, overwriting:"
for p in $KIT_FILES; do [[ -e "$SRC/$p" ]] && echo "  $p"; done
echo "Project files:"
for pair in $KIT_PROTECTED; do
  f="${pair#*:}"
  if [[ -e "$DST/$f" ]]; then echo "  $f — stays as is"; else echo "  $f — will be created from the template"; fi
done
if ((YES == 0)); then
  read -r -p "Continue? [y/N] " a
  [[ "$a" == [yY]* ]] || { echo "Cancelled."; exit 1; }
fi

for p in $KIT_FILES; do
  [[ -e "$SRC/$p" ]] || continue
  mkdir -p "$DST/$(dirname "$p")"
  if [[ -d "$SRC/$p" ]]; then
    rsync -a --exclude=.DS_Store "$SRC/$p/" "$DST/$p/"
  else
    cp -p "$SRC/$p" "$DST/$p"
  fi
done
created=0
for pair in $KIT_PROTECTED; do
  t="${pair%%:*}"; f="${pair#*:}"
  if [[ ! -e "$DST/$f" ]]; then
    mkdir -p "$DST/$(dirname "$f")"; cp -p "$SRC/.deploy/templates/$t" "$DST/$f"; created=1
  fi
done
find "$DST/bin" -name "*.sh" -exec chmod +x {} +

echo "✓ Done: wp-dev-kit $NEW_VER in $DST"
if ((created)); then
  echo "Next (new project): /wp-init in Claude Code, or by hand:"
  echo "  cd \"$DST\" && bash bin/init-project.sh"
else
  echo "Next: review the changes (git diff) and commit the kit update."
fi
