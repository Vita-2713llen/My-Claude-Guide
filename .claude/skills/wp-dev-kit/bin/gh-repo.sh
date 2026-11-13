#!/usr/bin/env bash
# The GitHub repository from the link the team lead sent (for /wp-init).
#   bash bin/gh-repo.sh check  <url>               # state: gh login, invitation, access, empty or not
#   bash bin/gh-repo.sh accept <url>               # accept the invitation to this repository
#   bash bin/gh-repo.sh set-default <url> <branch> # default branch (admin rights only)
# <url> in any form: https://github.com/OWNER/REPO, …/REPO.git, …/tree/main, git@github.com:OWNER/REPO.git, OWNER/REPO.
# check prints KEY=value lines (for Claude and humans), changes nothing.
set -Eeuo pipefail

die() { echo "✗ $*" >&2; exit 1; }

parse() { # → OWNER/REPO
  local u="${1:-}"
  u="${u#https://}"; u="${u#http://}"; u="${u#www.}"; u="${u#git@github.com:}"; u="${u#ssh://git@github.com/}"; u="${u#github.com/}"
  u="${u%%\?*}"; u="${u%%#*}"; u="${u%/}"
  local owner="${u%%/*}" rest="${u#*/}"
  [[ "$u" == */* ]] || return 1
  local repo="${rest%%/*}"; repo="${repo%.git}"
  [[ "$owner" =~ ^[A-Za-z0-9-]+$ && "$repo" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
  printf '%s/%s' "$owner" "$repo"
}

CMD="${1:-}"; RAW="${2:-}"
[[ -n "$CMD" && -n "$RAW" ]] || die "Usage: bash bin/gh-repo.sh check|accept|set-default <url> [branch]"
FULL="$(parse "$RAW")" || die "Does not look like a GitHub repository: $RAW (expected https://github.com/OWNER/REPO)"
URL="https://github.com/$FULL.git"

GH=missing; LOGIN=""
if command -v gh >/dev/null; then
  if LOGIN="$(gh api user --jq .login 2>/dev/null)"; then GH=ok; else GH=no-auth; LOGIN=""; fi
fi

invite_id() { gh api user/repository_invitations --paginate --jq ".[] | select(.repository.full_name | ascii_downcase == \"$(tr 'A-Z' 'a-z' <<<"$FULL")\") | .id" 2>/dev/null | head -1 || true; }

case "$CMD" in
  check)
    echo "REPO=$FULL"
    echo "URL=$URL"
    echo "GH=$GH"
    echo "LOGIN=${LOGIN:--}"
    INVITE="-"; ACCESS="unknown"; EMPTY="unknown"; DEF="-"; FILES="-"
    if [[ "$GH" == ok ]]; then
      INVITE="$(invite_id)"; INVITE="${INVITE:--}"
      if info="$(gh api "repos/$FULL" --jq '[(if .permissions.admin then "admin" elif .permissions.push then "write" elif .permissions.pull then "read" else "none" end), .default_branch] | join(" ")' 2>/dev/null)"; then
        ACCESS="${info%% *}"; DEF="${info#* }"
        if names="$(gh api "repos/$FULL/contents" --jq '[.[].name] | join(",")' 2>/dev/null)"; then
          EMPTY=no; FILES="${names:--}"
        else
          EMPTY=yes; DEF="-"
        fi
      else
        ACCESS=none
      fi
    else
      # Without gh: only what git can see (it may ask for a password — so no terminal prompt)
      if out="$(GIT_TERMINAL_PROMPT=0 git ls-remote "$URL" 2>/dev/null)"; then
        ACCESS=read-or-more
        if [[ -z "$out" ]]; then EMPTY=yes; else EMPTY=no; DEF="$(GIT_TERMINAL_PROMPT=0 git ls-remote --symref "$URL" HEAD 2>/dev/null | awk '$1=="ref:" && $NF=="HEAD" {sub("refs/heads/","",$2); print $2}')"; DEF="${DEF:--}"; fi
      else
        ACCESS=none
      fi
    fi
    echo "INVITE=$INVITE"            # id of an invitation not accepted yet, or -
    echo "ACCESS=$ACCESS"            # admin | write | read | none (none with an unaccepted invitation is normal)
    echo "EMPTY=$EMPTY"              # yes = no commits
    echo "DEFAULT_BRANCH=$DEF"
    echo "FILES=$FILES"              # files in the root of the default branch (if not empty)
    ;;
  accept)
    [[ "$GH" == ok ]] || die "Log in to GitHub first: gh auth login"
    id="$(invite_id)"
    [[ -n "$id" ]] || { echo "No invitation to $FULL for $LOGIN (already accepted or not sent)."; exit 0; }
    gh api -X PATCH "user/repository_invitations/$id" >/dev/null
    echo "✓ $LOGIN accepted the invitation to $FULL"
    ;;
  set-default)
    BR="${3:-}"; [[ -n "$BR" ]] || die "Specify the branch"
    [[ "$GH" == ok ]] || die "Log in to GitHub first: gh auth login"
    gh api -X PATCH "repos/$FULL" -f default_branch="$BR" --jq .default_branch >/dev/null \
      || die "Failed (admin rights are required and branch $BR must already be on GitHub). Change it under the company account: Settings → General → Default branch."
    echo "✓ Default branch in $FULL: $BR"
    ;;
  *) die "Unknown command: $CMD" ;;
esac
