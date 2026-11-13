# CLAUDE.md — WordPress project (Local → GitHub → Cloudways)

This folder is `wp-content` of a WordPress site running in **Local** and is the Git repository root.
Human docs: `README.md`. Task procedures: `.claude/skills/*/SKILL.md`. The user may write in English, Ukrainian
or another language; answer in the user's language.

**If `../wp-config.php` does not exist, this folder is the unpacked kit archive (`wp-dev-kit`), not a site.**
The only task here is the skill `wp-init` (install the kit into a Local site, or join a project). Do not run
data scripts from here.

## How the system works
- Development happens locally. Data flows **local → dev**. `prod` is read-only for scripts.
- **Code** = only paths in `.deploy/targets` (custom themes/plugins + `mu-plugins/environment-guard.php`).
  push to `DEV_BRANCH` (set once in `.deploy/environments.conf`: `main`, `master`, `dev`, `develop`…; never assume
  a name — read the file) → GitHub Actions (`.github/workflows/deploy.yml`) builds (`bin/build.sh`, `bin/release.sh`),
  commits the release to branch `deploy/dev`. That push fires a GitHub webhook → `public_html/gitautodeploy.php`
  on the server (template: `.deploy/server/gitautodeploy.php`, filled in on the server, never in Git) → Cloudways
  API `git/pull` → "Deployment via Git" pulls `deploy/dev` into `public_html/wp-content`. The script ignores
  pushes to other branches. `PROD_BRANCH` (empty = no PROD yet) → `deploy/prod` the same way (separate
  script on the PROD app). Other branches deploy nothing. Cloudways must always pull `deploy/*`, never the
  working branches (those contain kit files and no build output). Change branches: `bin/init-project.sh
  --dev-branch X [--prod-branch Y|none]`, then the user commits; GitHub default branch must equal `DEV_BRANCH`.
- **Data** (DB, uploads, third-party plugins/themes) moves only with `bin/db-sync.sh`, `bin/pages-sync.sh` (only
  chosen pages with their media) and `bin/files-sync.sh`
  over SSH. Server address/path: committed `.deploy/environments.conf`; personal overrides: `.env` (optional).
- What is content / transactional / environment settings: `.deploy/sync.conf` + `.deploy/profiles/<plugin>.conf`.
- **PHP**: environments may run different PHP 8.x versions. `PHP_MIN` in `.deploy/environments.conf` is the
  lowest one; CI lints custom code (`bin/php-lint.sh`) and runs composer on it. Write code that works on
  `PHP_MIN` (no newer syntax or functions) even if the local PHP is newer. Run locally, `bin/php-lint.sh` only
  checks syntax for the local PHP version; the CI check on `PHP_MIN` is the one that counts.
- **GitHub**: the repo belongs to a company account; developers are collaborators. Private repos on GitHub Free
  have no branch protection, so `PROD_DEPLOYERS` (repo variable, comma-separated logins) gates PROD deploys.

## Skills (use them)
| Task | Skill |
|---|---|
| first start of a project, join a project, `/wp-init` | `wp-init` |
| push/pull DB, content, only chosen pages, uploads, plugins; rollback a DB or a pages push | `wp-sync` |
| what will deploy, did the deploy work, deploy failed | `wp-deploy` |
| developer setup, refresh local from dev, no SSH access | `wp-setup` |
| add a custom theme/plugin/mu-plugin to Git (new or ready-made), add a plugin sync profile | `wp-add-code` |
| set up the kit in a new project, update the kit, pack the kit | see "The kit" below |

## Hard rules
1. Any command that writes data: run it with `--dry-run` first, show the plan, wait for an explicit "yes" in
   chat, then run it (`db-sync.sh` / `pages-sync.sh` with `-y`). One "yes" covers one command. Exception: `bin/setup.sh` (pulls
   DEV → local only) has no dry-run — describe what it pulls, get a "yes", then run `bin/setup.sh -y`.
2. Never add `--with-users`, `--with-transactional`, `--clean`, `--no-backup` or `files-sync --delete` unless the user asked for that
   exact thing in the current message (for `--with-users`: or picked "Full, with users" in the wp-sync choice).
   Say what it overwrites before running. A DB push without it must be described as "Keep DEV users".
   `files-sync.sh` has no `-y`: after the "yes" run it without `--dry-run`.
3. Never write to `prod`. Never set `ALLOW_PROD_WRITE`. Never add an environment to `WRITABLE_ENVS` unless asked.
4. By default the user commits: leave changes in the working tree and list the changed files. Commit + push to
   `DEV_BRANCH` only when the user picked "Claude commits and pushes" in an `AskUserQuestion` choice, or asked for
   it in the current message — one choice = one commit + one push. Before it: show the staged file list and the
   commit message. Never: push to `PROD_BRANCH` or `deploy/*`, `--force`, `--no-verify`, amend/rebase pushed
   commits, create PRs. If the push is rejected (remote ahead) → stop and explain; do not pull/merge on your own.
   Stage only the paths you showed (`git add -- <paths>`); re-check `git status -s` right before the commit —
   other people/sessions may be editing the same checkout. Never `git add -A` for your own commits.
5. Never deploy code by rsync/scp/SSH. Code reaches servers only via `DEV_BRANCH`/`PROD_BRANCH` → Actions → Cloudways.
6. Do not edit `.env`, `.deploy/environments.conf`, `wp-config.php` or anything in `~/.ssh` without being asked.
   Never print secrets or private keys; only `*.pub` may be shown.
7. If `db-sync.sh` stops with an ID conflict, do not retry with extra flags. Explain and ask.
8. Order for "everything": files first (`files-sync.sh`), then DB (`db-sync.sh`).
9. Things only the user can do (do not pretend otherwise): Local site creation, anything in the Cloudways panel
   (apps, SSH keys, SSH Shell Access, Deployment via Git, API key — done by the **sysadmin**: give the user one
   ready-to-forward message for them, see README "Cloudways is done by the sysadmin"), `gitautodeploy.php` on the server, GitHub Deploy keys and
   Webhooks. GitHub secrets/variables only via `gh`
   with the user's explicit permission.

## Ready-made themes/plugins
Before a theme/plugin goes into Git run `bash bin/theme-check.sh themes/<t>` (read-only). BLOCK = its own `.git`
(→ `--detach-git … -y` after a yes), ignored `dist/` without a build script, composer PHP above `PHP_MIN`, child
theme without its parent, files >95 MB. Details: wp-init "Ready (existing) theme or plugin".

## The kit (wp-dev-kit)
This tooling is a reusable kit, version in `.deploy/KIT_VERSION`. List of kit files: `bin/lib/kit.conf`.
- Kit files (`bin/`, `.claude/`, workflow, profiles, `README.md`, this file…) are overwritten on kit update.
  Put project-specific notes in `PROJECT.md`, never in kit files.
- Project files (`.gitignore`, `.deploy/targets`, `.deploy/environments.conf`, `.deploy/sync.conf`) are never
  overwritten by the installer. Clean copies live in `.deploy/templates/`.
- First configuration: `bin/init-project.sh --theme <t> [--plugin <p>]… [--dev-ssh u@ip --dev-path /abs] -y`
  (show the values and get a yes first). Install/update into another project:
  `bash bin/kit-install.sh <other wp-content> -y` (after a yes). Pack: `bash bin/kit-pack.sh <dir>`.

## Cloudways specifics
- SSH user = Application Credentials user, limited to its app. Temp files and DB backups live in
  `../private_html/` (not `/tmp`). Backups: `../private_html/db-backups/`, last `BACKUP_KEEP` kept.
- Server DB is usually MariaDB, Local is MySQL 8; `db-sync.sh` rewrites collations — do not import raw dumps
  between them by hand without the same fixes.
- Server-only plugins (`SERVER_ONLY_PLUGINS`: Breeze, Object Cache Pro, MalCare…) are never copied and are
  re-activated after a DB push. Cache: `wp breeze purge --cache=all`; Varnish should be off on DEV.
- "Deployment via Git" does not delete files that are not in the branch; that is why `deploy/*` contains only
  `.deploy/targets`. Manual edits of theme files on the server break the next Pull.

## Running WP-CLI from Claude's shell
Claude's shell is not Local's "Open site shell", but the kit recreates that environment from Local's own files:
- `bin/*.sh` load it automatically (`bin/lib/common.sh` → `bin/local-env.sh`).
- For a raw command: `cd .. && eval "$(bash wp-content/bin/local-env.sh)" && wp option get home`.
- `bash bin/gh-repo.sh check <github link>` — repo state for a link the team lead sent (gh login, pending
  invitation, access, empty or not, default branch); `accept` accepts the invitation (ask first).
- `bash bin/local-env.sh --list` lists Local sites (name, wp-content, running or not, PHP, kit version, git remote).
If `wp` still cannot connect: the site is not started in Local (`LOCAL_SITE_STATUS`) — ask the user to press
Start site. Do not edit `wp-config.php` to fix connections.
