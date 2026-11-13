---
name: wp-dev-kit
description: WordPress development process Local → GitHub → Cloudways (wp-dev-kit 1.0.0). Installs the kit into a Local WordPress site's wp-content, starts a new project or joins an existing one, then moves data (DB, pages, uploads, plugins) between Local and the Cloudways DEV server, explains/checks the GitHub Actions deploy, refreshes a local site from DEV and adds custom themes/plugins to Git and deployment. Use for /wp-init, /wp-dev-kit, "set up the project", "install the kit", "connect my Local site", "join the project", "push db/content/pages/uploads to dev", "pull from dev", "rollback dev", "did the deploy work", "add plugin to git", "add a sync profile", or the same in Ukrainian: «підключи проєкт», «встанови кіт», «залий базу на дев», «стягни з деву», «перевір деплой», «додай плагін у гіт».
---

# wp-dev-kit

This folder **is the unpacked kit** (`KIT_SOURCE`): `bin/`, `.deploy/`, `mu-plugins/`, `.github/workflows/deploy.yml`,
`README.md`, `CLAUDE.md` and five sub-skills in `.claude/skills/`. Set `KIT` to the absolute path of this folder
(the directory that holds this `SKILL.md`) and use absolute paths everywhere.

## Route the request
| Request | Read and follow |
|---|---|
| Start a new project, join a project, install/update the kit in a Local site | `$KIT/.claude/skills/wp-init/SKILL.md` — step 0 → `KIT_SOURCE` branch, `KIT=$KIT` |
| Move DB / content / chosen pages / uploads / plugins, pull from DEV, roll back | `$KIT/.claude/skills/wp-sync/SKILL.md` |
| What will deploy, did the deploy work, webhook errors | `$KIT/.claude/skills/wp-deploy/SKILL.md` |
| Refresh local from DEV, SSH "Permission denied" | `$KIT/.claude/skills/wp-setup/SKILL.md` |
| Add/remove a custom theme, plugin or mu-plugin; sync profile for a plugin | `$KIT/.claude/skills/wp-add-code/SKILL.md` |

Before acting, read `$KIT/CLAUDE.md` — its hard rules apply (commit/push only after the user picks
"Claude commits and pushes", never write to prod, dry-run + "yes" before any data command, never print secrets).
Full process documentation: `$KIT/README.md`.

## Where the commands run
- The sub-skills' commands (`bin/db-sync.sh …`, `bin/files-sync.sh …`) run **from the project's `wp-content`**
  (`T`), where the kit is installed — not from this folder.
- Kit not yet in the project (`$T/bin/` missing) → install it first:
  `bash "$KIT/bin/kit-install.sh" "$T"` (shows the plan, asks y/N). Project settings files are never overwritten.
- After the kit is installed, the project carries its own copies of these skills in `$T/.claude/skills/`; running
  Claude Code from `$T` picks them up directly.

Talk to the user in the user's language, short.
