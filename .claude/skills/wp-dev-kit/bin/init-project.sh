#!/usr/bin/env bash
# Configure the kit for a project (once; safe to run again).
#   bash bin/init-project.sh                         # asks
#   bash bin/init-project.sh --theme my-theme --plugin my-forms \
#        --dev-branch main [--prod-branch master|none] \
#        --dev-ssh user@1.2.3.4 --dev-path /home/…/public_html --php-min 8.2 -y
# Updates: .gitignore (custom themes/plugins), .deploy/targets, .deploy/environments.conf.
set -Eeuo pipefail
set -f
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# The site's PHP from Local (for the PHP_MIN hint) if the script is not run from the site shell
if [[ -z "${MYSQL_HOME:-}" && -f bin/local-env.sh ]]; then eval "$(bash bin/local-env.sh 2>/dev/null)" || true; fi

THEMES=""; PLUGINS=""; DEV_SSH_IN=""; DEV_PATH_IN=""; PHP_MIN_IN=""; DEV_BR_IN=""; PROD_BR_IN=""; YES=0; GIVEN=0
while (($#)); do
  case "$1" in
    --theme)    THEMES="$THEMES ${2:?"$1 needs a value"}"; GIVEN=1; shift ;;
    --plugin)   PLUGINS="$PLUGINS ${2:?"$1 needs a value"}"; GIVEN=1; shift ;;
    --dev-ssh)  DEV_SSH_IN="${2:?"$1 needs a value"}"; shift ;;
    --dev-path) DEV_PATH_IN="${2:?"$1 needs a value"}"; shift ;;
    --php-min)  PHP_MIN_IN="${2:?"$1 needs a value"}"; shift ;;
    --dev-branch)  DEV_BR_IN="${2:?"$1 needs a value"}"; shift ;;
    --prod-branch) PROD_BR_IN="${2:?"$1 needs a value"}"; shift ;;   # none = no PROD yet
    -y|--yes)   YES=1 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# Current values (from .deploy/targets) — as a hint
cur_list() { sed -e 's/#.*$//' -e 's/[[:space:]]*$//' .deploy/targets 2>/dev/null | sed -n "s#^$1/\([^/]*\)\$#\1#p" | tr '\n' ' '; }
CUR_T="$(cur_list themes)"; CUR_P="$(cur_list plugins)"
[[ " $CUR_T " == *" my-theme "* ]] && CUR_T=""     # do not suggest the template placeholders
[[ " $CUR_P " == *" my-plugin "* ]] && CUR_P=""

if ((GIVEN == 0)); then
  found=""
  if [[ -d themes ]]; then
    set +f
    for d in themes/*/; do
      n="$(basename "$d")"; [[ "$n" == twenty* || "$n" == "*" ]] && continue; found="$found $n"
    done
    set -f
  fi
  def_t="${CUR_T:-${found# }}"
  echo "Themes in themes/: ${found:- none (besides the default ones)}"
  read -r -p "Custom themes (space-separated) [${def_t}]: " THEMES; THEMES="${THEMES:-$def_t}"
  echo "Plugins in plugins/: $(ls plugins 2>/dev/null | tr '\n' ' ')"
  read -r -p "Custom plugins that go through Git (space-separated) [${CUR_P}]: " PLUGINS; PLUGINS="${PLUGINS:-$CUR_P}"
  conf_get() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\).*/\1/p" .deploy/environments.conf 2>/dev/null | head -1; }
  git_br="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  def_dev="$(conf_get DEV_BRANCH)"; def_dev="${def_dev:-${git_br:-main}}"
  def_prod="$(conf_get PROD_BRANCH)"
  echo "Branches: push to DEV_BRANCH → code on DEV, to PROD_BRANCH → on PROD (e.g. main, master, develop, dev)."
  read -r -p "DEV_BRANCH [${def_dev}]: " DEV_BR_IN; DEV_BR_IN="${DEV_BR_IN:-$def_dev}"
  read -r -p "PROD_BRANCH (Enter — ${def_prod:-no PROD yet}; none — remove): " PROD_BR_IN; PROD_BR_IN="${PROD_BR_IN:-${def_prod:-none}}"
  read -r -p "DEV_SSH (user@IP from Cloudways → Application Credentials; Enter — skip): " DEV_SSH_IN
  read -r -p "DEV_PATH (path to public_html, the pwd command on the server; Enter — skip): " DEV_PATH_IN
  cur_php="$(sed -n 's/^PHP_MIN="\{0,1\}\([0-9.]*\).*/\1/p' .deploy/environments.conf 2>/dev/null)"
  loc_php="$(php -r 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;' 2>/dev/null || true)"
  def_php="${cur_php:-${loc_php:-8.2}}"
  echo "PHP_MIN — the lowest PHP among developers' Local, DEV and PROD (Local now has ${loc_php:-?}). CI checks the code on it."
  read -r -p "PHP_MIN [${def_php}]: " PHP_MIN_IN; PHP_MIN_IN="${PHP_MIN_IN:-$def_php}"
fi

for n in $THEMES $PLUGINS; do
  [[ "$n" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "✗ Invalid name: $n" >&2; exit 1; }
done
[[ -n "${THEMES// /}" ]] || { echo "✗ At least one custom theme is required." >&2; exit 1; }
for n in $THEMES;  do [[ -d "themes/$n"  ]] || echo "! Folder themes/$n does not exist yet"; done
for n in $PLUGINS; do [[ -d "plugins/$n" ]] || echo "! Folder plugins/$n does not exist yet"; done
[[ -z "$DEV_SSH_IN" || "$DEV_SSH_IN" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+$ ]] || { echo "✗ DEV_SSH must be user@host" >&2; exit 1; }
[[ -z "$DEV_PATH_IN" || "$DEV_PATH_IN" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "✗ DEV_PATH must be an absolute path (letters, digits, . _ - /)" >&2; exit 1; }
for b in $DEV_BR_IN $PROD_BR_IN; do
  [[ "$b" =~ ^[A-Za-z0-9._/-]+$ && "$b" != deploy/* ]] || { echo "✗ Invalid branch: $b (and not deploy/*)" >&2; exit 1; }
done
# Compare the branches as they will be in the file: a flag, or else the value already there
conf_val() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\).*/\1/p" .deploy/environments.conf 2>/dev/null | head -1; }
DEV_EFF="${DEV_BR_IN:-$(conf_val DEV_BRANCH)}"
if [[ "$PROD_BR_IN" == none ]]; then PROD_EFF=""; else PROD_EFF="${PROD_BR_IN:-$(conf_val PROD_BRANCH)}"; fi
[[ -z "$DEV_EFF" || "$DEV_EFF" != "$PROD_EFF" ]] || {
  echo "✗ DEV_BRANCH and PROD_BRANCH would both be '$DEV_EFF' (.deploy/environments.conf) — they must differ. Pass --prod-branch <other|none>." >&2; exit 1; }
[[ -z "$PHP_MIN_IN" || "$PHP_MIN_IN" =~ ^8\.[0-9]+$ ]] || { echo "✗ PHP_MIN must be 8.x (e.g. 8.2)" >&2; exit 1; }

echo
echo "  Themes:  $THEMES"
echo "  Plugins: ${PLUGINS:- none}"
echo "  DEV:     ${DEV_SSH_IN:-unchanged} ${DEV_PATH_IN}"
echo "  PHP_MIN: ${PHP_MIN_IN:-unchanged}"
echo "  Branches: DEV ← ${DEV_BR_IN:-unchanged}, PROD ← $( [[ "$PROD_BR_IN" == none ]] && echo 'none' || echo "${PROD_BR_IN:-unchanged}")"
if ((YES == 0)); then
  read -r -p "Write? [y/N] " a; [[ "$a" == [yY]* ]] || { echo "Cancelled."; exit 1; }
fi

# .gitignore: replace the blocks between the markers @custom-themes / @custom-plugins … @end
lines() { local kind="$1"; shift; for n in "$@"; do printf '!/%s/%s/\n' "$kind" "$n"; done; }
# shellcheck disable=SC2086
TL="$(lines themes $THEMES)"; PL="$(lines plugins $PLUGINS)"
grep -q '^# @custom-themes' .gitignore && grep -q '^# @custom-plugins' .gitignore \
  || { echo "✗ .gitignore has no @custom-themes/@custom-plugins markers (old format) — add them by hand." >&2; exit 1; }
TL="$TL" PL="$PL" awk '
  /^# @custom-themes/  { print; if (ENVIRON["TL"] != "") print ENVIRON["TL"]; skip=1; next }
  /^# @custom-plugins/ { print; if (ENVIRON["PL"] != "") print ENVIRON["PL"]; skip=1; next }
  /^# @end/            { skip=0 }
  !skip                { print }
' .gitignore > .gitignore.tmp && mv .gitignore.tmp .gitignore

# .deploy/targets: custom themes/plugins + everything else already there (e.g. mu-plugins)
{
  sed -n '/^#/p' .deploy/targets
  for n in $THEMES;  do echo "themes/$n";  done
  for n in $PLUGINS; do echo "plugins/$n"; done
  sed -e '/^#/d' -e '/^[[:space:]]*$/d' -e '/^themes\//d' -e '/^plugins\//d' .deploy/targets
} > .deploy/targets.tmp && mv .deploy/targets.tmp .deploy/targets

# KEY="value" in .deploy/environments.conf: replace the line or append it
set_conf() {
  local k="$1" v="$2" f=.deploy/environments.conf
  if grep -q "^$k=" "$f"; then
    sed -i.bak "s#^$k=.*#$k=\"$v\"#" "$f" && rm -f "$f.bak"
  else
    printf '%s="%s"\n' "$k" "$v" >> "$f"
  fi
}
[[ -n "$DEV_SSH_IN"  ]] && set_conf DEV_SSH "$DEV_SSH_IN"
[[ -n "$DEV_PATH_IN" ]] && set_conf DEV_PATH "$DEV_PATH_IN"
[[ -n "$PHP_MIN_IN"  ]] && set_conf PHP_MIN "$PHP_MIN_IN"
[[ -n "$DEV_BR_IN"   ]] && set_conf DEV_BRANCH "$DEV_BR_IN"
if [[ "$PROD_BR_IN" == none ]]; then set_conf PROD_BRANCH ""; elif [[ -n "$PROD_BR_IN" ]]; then set_conf PROD_BRANCH "$PROD_BR_IN"; fi
CHANGED_CONF="$DEV_SSH_IN$DEV_PATH_IN$PHP_MIN_IN$DEV_BR_IN$PROD_BR_IN"

echo "✓ Written: .gitignore, .deploy/targets$( [[ -n "$CHANGED_CONF" ]] && echo ', .deploy/environments.conf')"
BR="$(sed -n 's/^DEV_BRANCH="\{0,1\}\([^"]*\).*/\1/p' .deploy/environments.conf | head -1)"; BR="${BR:-main}"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Check: git add -A && git status"
else
  echo "Next: git init -b $BR && git add -A && git status   (the list should show only custom themes/plugins and kit files)"
fi
