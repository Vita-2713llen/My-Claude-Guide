---
name: wp-sync
description: Move WordPress data between Local and the Cloudways DEV server — database, content only, only chosen pages with their images, uploads/media, third-party plugins and themes — and roll back a DEV database or a pages push. Use for "push db to dev", "push content to dev", "push this page / these pages (with media) to dev", "pull this page from dev", "push uploads/media/plugins to dev", "push everything to dev", "pull from dev", "update my local from dev", "rollback dev", "restore dev db", "undo the page push".
---

# wp-sync

All commands run from the repo root (`wp-content`). Environments: `local`, `dev`, `prod` (prod = source only).

Labels and messages below are written in English; show/send them in the user's language.

## Pick the command
| Request | Command |
|---|---|
| push db / database to dev | `bin/db-sync.sh local dev` |
| push content (pages, posts, products, forms, menus) to dev | `bin/db-sync.sh local dev --mode=content` |
| push ONLY some pages/posts/products (with their images/files) to dev | `bin/pages-sync.sh local dev <page>…` — see "Only chosen pages" |
| pull one page from dev | `bin/pages-sync.sh dev local <page>` |
| undo a pages push | `bin/pages-sync.sh --rollback dev <file> --dry-run`, then the same with `-y` |
| push uploads / media | `bin/files-sync.sh local dev uploads` |
| push translations (site not in English) | `bin/files-sync.sh local dev languages` |
| push plugins (third-party) | `bin/files-sync.sh local dev plugins`, then usually `bin/db-sync.sh local dev` (activation lives in the DB) |
| push everything | `bin/files-sync.sh local dev`, then `bin/db-sync.sh local dev` |
| pull from dev / refresh local | `bin/files-sync.sh dev local`, then `bin/db-sync.sh dev local` |
| pull from prod (read only) | same with `prod` as source |

## Only chosen pages (pages-sync)
Moves the named pages/posts/products and everything they show: images and files (Gutenberg, featured image, ACF
fields and galleries, Elementor data), reusable blocks, Elementor templates, categories/tags (by slug), product
variations; parent pages are created only if DEV lacks them. Everything else on DEV stays: other pages, menus,
widgets, site settings, users, orders. IDs are kept (the ID gap makes them the same on local and DEV).
- `<page>` = ID, slug, path (`services/web`) or URL. If the user says "the pages I changed", list them (read only):
  `cd .. && eval "$(bash wp-content/bin/local-env.sh)" && wp post list --post_type=page,post --orderby=modified --order=DESC --posts_per_page=10 --fields=ID,post_title,post_name,post_modified`
  and ask which (AskUserQuestion multiSelect, or in chat when more than 4). Never guess the list.
- Procedure as below: `--dry-run` → summary (NEW/UPDATE/KEEP per post, media count) → "yes" → same command with `-y`.
  Media files go first, then the DB in one transaction; a rollback file is written before (`*-pages-before-*.bak`).
- `CONFLICT` → nothing changed. The ID or the address (slug) is taken on DEV by something else — usually a page
  created directly on DEV. Explain the line; never delete/rename on DEV without asking; an alternative is a full
  content push (`--mode=content`).
- "matches several posts" → ask which ID. Orders/entries (KEEP_POST_TYPES) are refused by the script.
- After the push: if a NEW page must appear in a menu, the menu is not moved — the user adds it on DEV or pushes content.
- Undo: newest push first — `bin/pages-sync.sh --rollback dev <file> --dry-run`, "yes", then `-y`. Files list:
  `ssh <DEV_SSH> 'ls -1t <DEV_PATH>/../private_html/db-backups/ | grep pages'`.

## Database push to dev — always offer the choice
For any DB push to `dev` (incl. "push everything") ask with `AskUserQuestion` before the dry-run:
**"How do we push the database to DEV?"**
1. "Keep DEV users (Recommended)" → `bin/db-sync.sh local dev` — content + settings; DEV users, admins and
   their passwords stay. Say it in words every time: "DEV users are not touched".
2. "Full, with users" → `bin/db-sync.sh local dev --with-users` — users/usermeta come from local too. Its dry-run
   lists the admins after the push and the DEV admins who will lose access; repeat that list to the user and
   remind: local admin passwords become the DEV passwords (DEV is public → strong passwords), DEV-only users
   (client, sysadmin) disappear unless they exist locally. Get a separate explicit "yes" for this run.
3. "Content only" → `--mode=content` (DEV site settings stay too) — offer when the user only changed pages/posts.
Picking option 2 counts as asking for `--with-users` (CLAUDE.md rule 2). Never pick it yourself.

Other extra flags only when the user literally asks in the current message: `--with-transactional` (replaces orders/form
entries), `--clean` (drops target tables missing in source), `--no-backup`, `files-sync --delete`.

## Procedure (mandatory)
1. Run the command with `--dry-run`.
2. Summarize for the user: source → target, mode, number of tables, plugin profiles, what stays on target —
   always name users explicitly ("DEV users stay" / "users are replaced, admins after: …") — orders, entries,
   keys, backup yes/no. For files: number of files to transfer.
3. Ask: "Run it? (yes/no)". Wait for an explicit yes.
4. Run the same command: db-sync with `-y`; files-sync has no `-y` and no prompt — run it as is (`</dev/null`).
   "Push everything": never skip the files step because an earlier dry-run showed 0 files — media may have been
   added since. Right before the DB run, run `files-sync … uploads --dry-run` again (db-sync also checks and
   prints "Media: N file(s) … missing"); if it is not 0, run files-sync first.
5. Report: result line, backup path printed by the script, and follow-ups:
   - after DB push with `--mode=content`: remind to sync uploads;
   - after any push to dev: "check https://<dev>/wp-admin, Settings → Permalinks → Save if links 404".

## Errors
- "Writing to 'X' is blocked" / "Multisite is not supported" → explain; never work around it (no `WRITABLE_ENVS`,
  no `ALLOW_PROD_WRITE` unless the user asked for exactly that).
- `ID conflict` → nothing changed on target. Explain: DEV has orders/entries with the same IDs as local
  content. Ask whether DEV orders are test data (then `--with-transactional` is an option) — never decide alone.
- `Permission denied (publickey)` / no access → switch to the `wp-setup` skill.
- "target '…' not changed" → nothing happened; if the line before names an SSH failure, offer to run the same command
  again in a minute.
- "NOT finished: the data from … is on …" → the move is done, only the listed final steps (cache, hooks…) did not
  run. Show the list. Offer: run the same command again (safe, re-imports from the source) or the rollback below.
- "Short-lived server failure (…). Trying again in 60s (attempt 2 of 3)" → db-sync retries by itself (target not changed,
  the first backup is reused); wait for it, do not start another run in parallel. "The server failed 3 time(s) in a row" with
  "Too many open files" → the DEV server runs out of open files system-wide: forward the sysadmin message the script printed
  (README "Problems and fixes"), offer to try again later; never work around it.
- "Local wp-content/X is missing or empty — with --delete …" → protection, nothing changed; never retry without asking.
- "The connection broke during the table swap" → the swap is atomic; offer to run the same command again (safe). If WP-CLI on the server keeps failing ("Too many open files", "Class Phar not found") → give the
  user a message for the sysadmin; do not finish the steps by hand without asking.
- "Database moved …, but NOT everything is in place" → read out each listed item and its fix (usually: media →
  `files-sync … uploads`, wrong site URL → run again).
- files-sync "NOT everything was transferred" (exit 1) → show the list; offer to run the same command again (rsync
  sends only what is missing). Never report a sync as done unless the script ended with "Done: everything
  transferred and checked" / "Done: … Checked: …".
- `wp` not found / DB connection error in Claude's shell → see CLAUDE.md "Running WP-CLI from Claude's shell".

## Rollback DEV database
1. List backups (read only):
   `ssh <DEV_SSH> 'ls -1t <DEV_PATH>/../private_html/db-backups/'` (values from `.deploy/environments.conf`).
2. Show the list, ask which one, and get a yes.
3. Restore:
   `ssh <DEV_SSH> 'cd <DEV_PATH> && gunzip -c ../private_html/db-backups/<file> | wp db import - && wp cache flush'`
4. Local backups are in `../../db-backups/` relative to `wp-content` (Local `app/db-backups`).
