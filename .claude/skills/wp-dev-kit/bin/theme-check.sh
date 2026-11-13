#!/usr/bin/env bash
# Check a ready-made theme/plugin before putting it in Git and deploying it (changes nothing without --detach-git -y).
#   bash bin/theme-check.sh                          # all paths from .deploy/targets
#   bash bin/theme-check.sh themes/my-theme [plugins/x]
#   bash bin/theme-check.sh --detach-git themes/my-theme [-y]
#       → moves the theme's nested .git to ../../git-backups/ (outside wp-content and the web root) so the theme
#         becomes a plain folder of this repository. History stays in the backup and in the old repository.
# Summary at the end: OK / WARN / BLOCK. BLOCK = the deploy will break or the theme will not get into Git.
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DETACH=0; YES=0; PATHS=""
while (($#)); do
  case "$1" in
    --detach-git) DETACH=1 ;;
    -y|--yes)     YES=1 ;;
    -h|--help)    sed -n '2,9p' "$0"; exit 0 ;;
    -*)           echo "Unknown option: $1" >&2; exit 1 ;;
    *)            PATHS="$PATHS ${1%/}" ;;
  esac
  shift
done
if [[ -z "${PATHS// /}" ]]; then
  PATHS="$(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' .deploy/targets 2>/dev/null | grep -E '^(themes|plugins)/' || true)"
fi
[[ -n "${PATHS//[[:space:]]/}" ]] || { echo "✗ Nothing to check: pass themes/<theme> or fill in .deploy/targets" >&2; exit 1; }

PHP_MIN="$( . .deploy/environments.conf >/dev/null 2>&1; echo "${PHP_MIN:-}" )"
TARGET_LIST="$(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' .deploy/targets 2>/dev/null || true)"

# Git ignore rules: from this repository, or — before `git init` — through an empty temporary Git folder over
# the same files, so the answers are the same as after `git init`. Without .gitignore there is nothing to check.
GI_DIR=""; GI_MODE=none
if [[ "$(git rev-parse --show-toplevel 2>/dev/null || true)" == "$REPO_ROOT" ]]; then GI_MODE=repo
elif [[ -f .gitignore ]]; then
  GI_DIR="$(mktemp -d "${TMPDIR:-/tmp}/themecheck.XXXXXX")"; trap 'rm -rf "$GI_DIR"' EXIT
  git init -q "$GI_DIR" && GI_MODE=temp
fi
ignored() { # ignored <path> → 0 ignored by Git, 1 not ignored, 2 cannot tell
  local rc=0
  case "$GI_MODE" in
    repo) git check-ignore -q "$1" 2>/dev/null || rc=$? ;;
    temp) GIT_DIR="$GI_DIR/.git" GIT_WORK_TREE="$REPO_ROOT" git check-ignore -q "$1" 2>/dev/null || rc=$? ;;
    *)    return 2 ;;
  esac
  ((rc <= 1)) || return 2
  return "$rc"
}

# Node for the CI build — chosen exactly like deploy.yml: the first target in .deploy/targets that has
# .nvmrc (or else .node-version); every target is built on that one version.
CI_NODE=""; CI_NODE_FROM=""
while IFS= read -r x; do
  for f in "$x/.nvmrc" "$x/.node-version"; do
    [[ -n "$x" && -f "$f" ]] || continue
    [[ -z "$CI_NODE" ]] && { CI_NODE="$(tr -d ' v\r\n' <"$f")"; CI_NODE_FROM="$f"; }
    break
  done
done <<<"$TARGET_LIST"

BLOCKS=0; WARNS=0
note()  { printf '  · %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m! %s\033[0m\n' "$*"; WARNS=$((WARNS+1)); }
block() { printf '  \033[31m✗ %s\033[0m\n' "$*"; BLOCKS=$((BLOCKS+1)); }
ver()   { [[ "${1:-}" =~ ^([0-9]+)\.([0-9]+) ]] && echo $(( BASH_REMATCH[1] * 100 + BASH_REMATCH[2] )); }

for t in $PATHS; do
  echo "→ $t"
  [[ "$t" =~ ^(themes|plugins)/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { block "expected themes/<name> or plugins/<name>"; continue; }
  [[ -d "$t" ]] || { block "folder does not exist"; continue; }

  # 0. Will it get into Git and into the deploy at all?
  GITCHK=1; r=0; ignored "$t/" || r=$?
  intargets=0; grep -qxF "$t" <<<"$TARGET_LIST" && intargets=1
  if ((r == 2)); then
    GITCHK=0; note "no .gitignore here yet (kit not installed) — Git checks skipped; run again after init-project.sh"
  elif ((r == 0)); then
    GITCHK=0
    if ((intargets)); then
      block "$t is in .deploy/targets, but .gitignore ignores it — it will not get into Git. Fix: bash bin/init-project.sh (rewrites the .gitignore list)"
    else
      note "not in .deploy/targets and .gitignore yet — init-project.sh adds it; dist/, vendor/, node_modules/ are checked after that"
    fi
  elif ((!intargets)); then
    warn "$t goes to Git, but it is not in .deploy/targets — CI will not deploy it. Add it: bash bin/init-project.sh --theme/--plugin …"
  fi

  # 1. Nested Git repository: the parent repo sees only a link (gitlink), not the files → empty on DEV.
  if [[ -e "$t/.git" ]]; then
    remote="$(git -C "$t" remote get-url origin 2>/dev/null || echo '-')"
    branch="$(git -C "$t" symbolic-ref --short -q HEAD 2>/dev/null || echo '-')"
    dirty="$(git -C "$t" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    if ((DETACH)); then
      ts="$(date +%Y%m%d%H%M%S)"; bk="$REPO_ROOT/../../git-backups/$(basename "$t")-$ts.git"
      echo "  Will move $t/.git → $bk (remote: $remote, branch: $branch, uncommitted changes: $dirty)"
      if ((!YES)); then echo "  Dry-run: nothing changed. Run again with -y."; BLOCKS=$((BLOCKS+1)); continue; fi
      mkdir -p "$(dirname "$bk")" && mv "$t/.git" "$bk" && ok "nested .git moved to $bk"
      git rm -q --cached "$t" 2>/dev/null || true   # if the theme was already added as a gitlink
    else
      block "the theme has its own .git (remote: $remote, branch: $branch, uncommitted changes: $dirty) — Git will get an empty link. Fix: bash bin/theme-check.sh --detach-git $t (first commit/push changes to the old repository if you need them)"
    fi
  else
    ok "plain folder (no own .git)"
  fi
  [[ -f "$t/.gitmodules" ]] && block "has .gitmodules (submodules) — CI does not fetch them; put the code into the theme or pull it in via composer/npm"

  # 2. What is in Git: the theme's own .gitignore may hide built files.
  has_build=0
  if [[ -f "$t/package.json" ]] && grep -q '"build"[[:space:]]*:' "$t/package.json"; then has_build=1; fi
  if [[ -f "$t/.gitignore" ]]; then
    for d in dist build assets/dist public/build; do
      if ((GITCHK)) && [[ -d "$t/$d" ]] && ignored "$t/$d/"; then
        if ((has_build)); then ok "$d/ is ignored by Git, but CI will build it (npm run build)"
        else block "$d/ is ignored by Git and package.json has no build script — these files will not be on DEV. Remove $d from $t/.gitignore or add a build"
        fi
      fi
    done
  fi

  # 3. npm build
  if [[ -f "$t/package.json" ]]; then
    if ((has_build)); then
      ok "npm build found — CI will run npm ci && npm run build"
      [[ -f "$t/package-lock.json" ]] || warn "no package-lock.json — CI will run npm install, package versions may drift. Commit the lock file"
      [[ -f "$t/yarn.lock" || -f "$t/pnpm-lock.yaml" ]] && warn "yarn/pnpm lock — CI uses npm; make sure npm run build works"
      nv=""; for f in "$t/.nvmrc" "$t/.node-version"; do [[ -z "$nv" && -f "$f" ]] && nv="$(tr -d ' v\r\n' <"$f")"; done
      if [[ -n "$nv" && -n "$CI_NODE" && "$nv" != "$CI_NODE" ]]; then
        warn "the theme wants Node $nv, but CI builds all themes/plugins on Node $CI_NODE (from $CI_NODE_FROM, the first in .deploy/targets). Use one Node version for all of them"
      elif [[ -n "$nv" ]]; then ok "Node for the build: $nv"
      elif [[ -n "$CI_NODE" ]]; then warn "no .nvmrc — CI builds it on Node $CI_NODE (from $CI_NODE_FROM). Make sure the theme builds on it"
      else warn "no .nvmrc — CI will build on Node 22. If the theme builds only on another version, add $t/.nvmrc"
      fi
    else
      ok "package.json without build — CI builds nothing, deployed as is"
    fi
  fi

  # 4. composer
  if [[ -f "$t/composer.json" ]]; then
    ok "composer.json — CI will run composer install --no-dev on PHP ${PHP_MIN:-?}"
    req="$(sed -n 's/.*"php"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$t/composer.json" | head -1)"
    if [[ -n "$req" && -n "$PHP_MIN" ]]; then
      lo="$(printf '%s' "$req" | grep -oE '[0-9]+\.[0-9]+' | head -1)"
      if [[ -n "$lo" ]] && (( $(ver "$lo") > $(ver "$PHP_MIN") )); then
        block "composer requires PHP $req but PHP_MIN=$PHP_MIN — CI will fail. Raise PHP_MIN (if all environments are newer) or lower the requirement"
      fi
    fi
    [[ -f "$t/composer.lock" ]] || warn "no composer.lock — commit it"
    if ((GITCHK)) && [[ -d "$t/vendor" ]] && ! ignored "$t/vendor/"; then
      warn "vendor/ will go into Git — it is usually ignored, CI installs it"
    fi
  fi

  # vendor/ without composer.json = bundled libraries (TGM etc.); the kit .gitignore ignores vendor/
  if ((GITCHK)) && [[ -d "$t/vendor" && ! -f "$t/composer.json" ]] && ignored "$t/vendor/"; then
    block "$t/vendor/ has bundled libraries (no composer.json) but Git ignores vendor/ — they will not be on DEV. Add !/$t/vendor/ at the end of .gitignore"
  fi

  # 5. Child theme: the parent is third-party, files-sync moves it, not Git.
  if [[ "$t" == themes/* && -f "$t/style.css" ]]; then
    parent="$(sed -n 's/^[[:space:]]*Template:[[:space:]]*\([A-Za-z0-9._-]*\).*/\1/p' "$t/style.css" | head -1)"
    if [[ -n "$parent" ]]; then
      if [[ -d "themes/$parent" ]]; then ok "child theme, parent: $parent — files-sync (themes) moves it to DEV"
      else block "child theme, parent themes/$parent is missing in Local"
      fi
    fi
    grep -qi '^[[:space:]]*Theme Name:' "$t/style.css" || block "style.css has no Theme Name"
  fi

  # 6. Size and large files (GitHub: >50 MB warning, >100 MB rejected)
  size="$(du -sh "$t" 2>/dev/null | cut -f1)"
  big="$(find "$t" -path "$t/node_modules" -prune -o -path "$t/.git" -prune -o -type f -size +20M -print 2>/dev/null | head -5)"
  ok "size: $size (ignoring .gitignore)"
  if [[ -n "$big" ]]; then
    while IFS= read -r f; do
      if find "$f" -size +95M | grep -q .; then block "file >95 MB, GitHub will reject it: $f"; else warn "large file (>20 MB): $f — better in uploads/CDN"; fi
    done <<<"$big"
  fi
  if ((GITCHK)) && [[ -d "$t/node_modules" ]] && ! ignored "$t/node_modules/"; then block "node_modules/ is not ignored by Git"; fi

  # 7. PHP syntax with the local version (CI checks again on PHP_MIN)
  if command -v php >/dev/null; then
    bad=0
    while IFS= read -r -d '' f; do php -l "$f" >/dev/null 2>&1 || { block "PHP syntax: $f"; bad=1; }; done \
      < <(find "$t" \( -path "$t/vendor" -o -path "$t/node_modules" -o -path "$t/.git" \) -prune -o -name '*.php' -print0)
    ((bad)) || ok "PHP syntax (local PHP $(php -r 'echo PHP_MAJOR_VERSION,".",PHP_MINOR_VERSION;'))"
  fi
done

echo
if ((BLOCKS)); then printf '\033[31mBLOCK: %s problem(s) will break Git or the deploy; warnings: %s\033[0m\n' "$BLOCKS" "$WARNS"; exit 2
elif ((WARNS)); then printf '\033[33mWARN: warnings: %s — you can go on\033[0m\n' "$WARNS"
else printf '\033[32mOK\033[0m\n'; fi
