---
name: wp-add-code
description: Add a custom theme, plugin or must-use plugin (mu-plugin) to Git and to deployment, or remove one; and create a data-sync profile for a third-party plugin that has its own DB tables. Use for "add plugin X to git", "deploy my new theme", "add my mu-plugin", "stop deploying X", "add a sync profile for <plugin>", "which tables does <plugin> have".
---

# wp-add-code

## Add a custom theme/plugin (code that the team writes)
1. Confirm the folder exists: `themes/<name>` or `plugins/<name>`. Ready theme from GitHub →
   `git clone --depth 1 <link> themes/<name>` first. Then `bash bin/theme-check.sh themes/<name>` and handle
   BLOCK lines exactly as in wp-init "Ready (existing) theme or plugin" (own `.git` → `--detach-git … -y` after a
   yes; dist ignored without build; composer PHP > PHP_MIN; child theme without parent; files >95 MB).
2. `.gitignore`: add `!/plugins/<name>/` (or `!/themes/<name>/`) **between** the `# @custom-plugins` (or
   `# @custom-themes`) marker and its `# @end` line — `bin/init-project.sh` rewrites only that block.
3. `.deploy/targets`: add `plugins/<name>` (same path).
   Alternative for both steps: rerun `bin/init-project.sh` with the full list of `--theme`/`--plugin` and `-y`.
4. Verify: `git status --short` and `git check-ignore -v plugins/<name>/<some file>` (must print nothing).
   Also `bin/release.sh "$(mktemp -d)" --no-build` must list the new path.
5. If it has `package.json` with a `build` script or `composer.json`, CI builds it (Node from its `.nvmrc`, else
   22); ensure `dist/`/`vendor/` are not required in Git. Re-run `bin/theme-check.sh` — no BLOCK.
6. Report changed files. Commit/push only via the "Claude commits and pushes" choice (CLAUDE.md rule 4);
   stage the listed paths explicitly (`git add -- <paths>`), never `git add -A` when committing yourself.
7. Moving code between a plugin and a theme (e.g. blocks): add the new path, remove the old one (below), and say
   that the old folder stays on DEV until deleted there.

Third-party plugins from wordpress.org or vendors are NOT added to Git — they move with
`bin/files-sync.sh local dev plugins`.

## Add a custom mu-plugin (must-use plugin)
mu-plugins are always active (no "Deactivate" in wp-admin) and WordPress loads **only the `.php` files directly
in `mu-plugins/`** — files in a subfolder run only if a top-level loader file `require`s them.
1. Shape — confirm with the user which one it is:
   - one file: `mu-plugins/<name>.php`;
   - a folder: `mu-plugins/<name>/` **plus** the loader `mu-plugins/<name>.php`
     (`<?php require __DIR__ . '/<name>/<main-file>.php';`). Both go to Git and to deploy, or DEV loads nothing.
   - Never use the name `environment-guard` (kit file, overwritten on kit update).
2. `.gitignore`: add `!/mu-plugins/<name>.php` (and `!/mu-plugins/<name>/` for a folder) on the lines right after
   `!/mu-plugins/environment-guard.php`. This block is outside the `@custom-*` markers — `bin/init-project.sh`
   keeps it as it is.
3. `.deploy/targets`: add `mu-plugins/<name>.php` (and `mu-plugins/<name>`). `bin/init-project.sh` keeps
   non-theme/plugin lines when it rewrites the file.
4. Verify: `git check-ignore -v mu-plugins/<name>.php` prints nothing; `git status --short` shows the new
   paths; `bin/release.sh "$(mktemp -d)" --no-build` lists them; `bash bin/php-lint.sh` passes. A folder with
   `composer.json`/`package.json` is built by CI like a plugin.
5. Warn the user: a mu-plugin runs on every request of every environment as soon as it is deployed — a fatal
   error in it takes DEV down (no deactivation from wp-admin). Test it locally first.
6. Report changed files; commit/push only via the choice (step 6 above).

## Remove from deploy

## Remove from deploy
Remove the lines from `.gitignore` and `.deploy/targets`. Tell the user: Cloudways does not delete files
that disappear from the branch — the old folder stays on DEV until removed manually (or the plugin is
deleted in wp-admin). For a **mu-plugin** this matters most: it stays active on DEV until its file is deleted
there (SFTP or the sysadmin) — Claude does not delete files on servers.

## Sync profile for a plugin with its own tables
1. Find the slug (folder name) and tables: `wp db tables --all-tables-with-prefix` (from `..`) and look for
   the plugin's prefix.
2. Classify each table:
   - content (forms, settings the team builds locally) → `CONTENT_EXTRA_TABLES`;
   - transactional (entries, orders, logs, sessions, queues) → `KEEP_TABLES`;
   - custom post types that are transactional → `KEEP_POST_TYPES`;
   - options with licenses/API keys/environment settings → `PRESERVE_OPTIONS`.
3. Copy `.deploy/profiles/_TEMPLATE.conf.example` to `.deploy/profiles/<slug>.conf` and fill it using `+=`
   style like the existing profiles (see `woocommerce.conf`, `gravityforms.conf`).
4. Test: `bin/db-sync.sh local dev --dry-run` must show the profile in "Profiles" and the tables in
   "Untouched". Show the user the classification and ask them to confirm it.
