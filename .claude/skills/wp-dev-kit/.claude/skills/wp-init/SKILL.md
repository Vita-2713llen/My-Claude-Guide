---
name: wp-init
description: One-command project start with a short questionnaire. Installs or updates this kit in a Local WordPress site, configures custom themes/plugins, deploy branches and the Cloudways DEV server, sets up SSH, the Git repo, checks the first deploy and moves data. Also connects a developer to an existing project. Use for /wp-init, "set up the project", "install the kit", "connect my Local site", "join the project" (or the same in any language).
---

# wp-init — start a project or join one

Assumed done by people, do not explain or re-check in detail: the Local site exists, the Cloudways app exists,
the GitHub repo exists (empty for a new project), SSH Access is on for the app. Cloudways "Deployment via Git"
and the webhook are connected only AFTER the first push (Cloudways needs the branch `deploy/dev`, which GitHub
Actions creates from that push) — step 6 tells the user when. Your job is everything else. Talk to the user in the user's language, short. Hard rules from `CLAUDE.md` apply:
commit/push only after the user picks "Claude commits and pushes" (step 4), never write to prod, dry-run + "yes" before
any data command, never print secrets.

Labels and messages below are written in English; show/send them in the user's language.

## How to ask
- Choices → the `AskUserQuestion` tool (up to 4 questions per call, 2–4 options each; put the recommended
  option first). Free text (repo URL, `user@IP`) → ask in chat, one message with all of them.
- Before anything that writes, show ONE plan (what will change, where) and get a "yes". Then run it all.
- Collect answers first, then act. Do not ask what you can detect.
- **Cloudways is done by the sysadmin, not the developer.** Never send the user clicking through the Cloudways
  panel. Whenever something there is needed, write ONE ready-to-forward message for the sysadmin (in the user's language, a
  ```text block) with the real values filled in: app/domain, `user@IP`, the developer's `.pub` line (or, if you
  cannot read `~/.ssh`, tell the user to paste the output of `pbcopy < ~/.ssh/id_ed25519.pub`), repo, branch.
  Two messages per project: **sysadmin message #1 (access)** (step 2) and **sysadmin message #2 (deploy)** (step 6.3). Put everything that can be done
  at that moment into one message — do not drip-feed items. Never ask for passwords/API keys/secrets in chat.

## 0. Where am I
```bash
pwd; ls -A; cat .deploy/KIT_VERSION; test -f ../wp-config.php && echo IN_SITE || echo KIT_SOURCE
bash bin/local-env.sh --list      # Local sites: name, wp-content, status, PHP, kit version, git remote
```
- `IN_SITE` → this folder is the project `wp-content`: `T=$PWD`, `KIT=$PWD`.
- `KIT_SOURCE` → this is the unpacked archive: `KIT=$PWD`; the target `T` is a site's `wp-content` from the list.
In every later command use absolute paths: `cd "$T" && …`. Every `bin/*.sh` in `$T` loads Local's
environment itself; for a raw `wp`/`mysql` call use `cd "$T/.." && eval "$(bash "$T/bin/local-env.sh")" && wp …`
(before the kit is in `$T`: `eval "$(bash "$KIT/bin/local-env.sh" "$T/..")"`).

## 1. Questionnaire — round 1 (AskUserQuestion)
1. **What are we doing?** — "New project (empty repository)" / "Join a project (code already on GitHub)".
   If `$T` already has a git remote and the kit: offer instead "Update the kit" / "Check the deploy" /
   "Refresh local from DEV" and hand off (`kit-install.sh`, skill `wp-deploy`, skill `wp-setup`).
2. **Which Local site?** — sites from `--list` (skip if `IN_SITE`). The site must be `running`; if not, ask the
   user to press Start site in Local and wait.

Then ask in chat (one message): the GitHub repo link the team lead sent — any form works
(`https://github.com/OWNER/REPO`, `…/REPO.git`, `…/tree/main`, `git@github.com:OWNER/REPO.git`, `OWNER/REPO`) —
and for a new project DEV SSH `username@IP` (Cloudways → Application → Access Details → Application
Credentials). For join mode only the link.

## 2. GitHub repo from the link (the team lead created it and invited this user)
```bash
bash "$KIT/bin/gh-repo.sh" check "<link>"     # KEY=value: REPO, URL, GH, LOGIN, INVITE, ACCESS, EMPTY, DEFAULT_BRANCH, FILES
```
Use `URL` from the output as the git remote from now on. Handle the state in this order, re-running `check`
after each fix:
| State | What to do |
|---|---|
| `GH=missing` | Ask, then `brew install gh` (no brew → the user installs from https://cli.github.com). |
| `GH=no-auth` | The user signs in once, interactively, in a terminal (CLI: `! gh auth login`): GitHub.com → HTTPS → "Authenticate Git" Yes → browser. Then you run `gh auth setup-git`. |
| `INVITE=<id>` | "There is an invitation to REPO for LOGIN — accept it?" → on yes `bash "$KIT/bin/gh-repo.sh" accept "<link>"`. |
| `ACCESS=none`, no invite | Wrong account (`LOGIN`) or not invited yet → the team lead invites `LOGIN` with role Write. Wait. |
| `ACCESS=read` | The team lead changes the role to Write. |
| `ACCESS=write`/`admin` | OK. |

Then by mode:
- **New project, `EMPTY=yes`** → OK (the first push makes `DEV_BRANCH` the default branch).
- **New project, `EMPTY=no`, `FILES` only from `README.md, LICENSE, .gitignore, .gitattributes`** (repo created
  with "Add a README") → OK, mark `BASE=<DEFAULT_BRANCH>`: in step 4 the history is kept and the kit's
  `README.md`/`.gitignore` replace GitHub's. Anything else in `FILES` → stop; ask whether they meant "Join a project (code already on GitHub)".
- **Join, `EMPTY=yes`** → stop: the team lead has not pushed yet.
- **Join, `EMPTY=no`** → OK; the code comes from `DEFAULT_BRANCH`. If `.deploy/environments.conf` there (after
  checkout) has another `DEV_BRANCH`, tell the user the default branch on GitHub is wrong (see step 6).

### SSH to DEV (new project; join mode does this in step 5)
```bash
ls ~/.ssh/id_ed25519.pub 2>/dev/null || echo NO_KEY
ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new <user@IP> 'cd public_html && pwd && php -r "echo PHP_MAJOR_VERSION,\".\",PHP_MINOR_VERSION;" && echo && wp option get home && wp config get WP_ENVIRONMENT_TYPE 2>/dev/null'
```
- `NO_KEY` → ask, then `ssh-keygen -q -t ed25519 -N "" -C "$(whoami)@$(hostname -s) wp-dev" -f ~/.ssh/id_ed25519`.
- Access denied → `pbcopy < ~/.ssh/id_ed25519.pub`, show the `.pub` line AND always the key's path: `~/.ssh/id_ed25519.pub`
  (full: `$HOME/.ssh/id_ed25519.pub`). If reading `~/.ssh` is blocked for you, do not retry — give the user
  `pbcopy < ~/.ssh/id_ed25519.pub` to run and point to README "SSH key: where to find it". Give the sysadmin **sysadmin message #1 (access)**
  (README "Cloudways is done by the sysadmin"): add the `.pub` in Application Credentials → SSH Keys; Application Settings →
  **SSH Shell Access** on; Varnish off on DEV; IP whitelist if used. Only the `.pub`; the password is not needed.
  `Shell access is disabled !` = the key works, SSH Shell Access is off → sysadmin; Application Settings → SSH Access must be on. Wait for
  "added", retry. If still denied: IP whitelist (Server → Security → Shell Access).
- From the output take: `DEV_PATH` (pwd), DEV PHP, DEV URL, `WP_ENVIRONMENT_TYPE`.

## 3. Questionnaire — round 2 (new project, AskUserQuestion)
Detect first: `ls "$T/themes"` (skip `twenty*`), `ls "$T/plugins"`, existing `.deploy/environments.conf`.
1. **Custom themes (go to Git)** — multiSelect from detected themes. If none: options "Create a starter theme"
   (then ask the slug in chat) / "Ready-made theme from GitHub" (ask the link in chat) / "I'll add the theme myself and rerun".
2. **Custom plugins (go to Git)** — multiSelect from `plugins/`, first option "None".
3. **Branch for DEV** — `main` / `master` / `dev` / `develop` (Other = custom).
4. **Branch for PROD** — "No PROD yet" / `main` / `master` (must differ from DEV).
5. **Data on DEV** — "DEV is empty — push from local" / "DEV already has a site — pull DEV to local first".
   Ask only if DEV has content (`ssh <user@IP> 'cd public_html && wp post list --post_type=page,post --format=count'`
   > a fresh install's 2–3). "DEV already has a site" → in step 7 the direction is DEV → local first (`files-sync dev local`,
   `db-sync dev local`), and nothing is pushed to DEV until the user asks.
`PHP_MIN` = the lower of Local PHP and DEV PHP (major.minor) — do not ask, just show it in the plan.

### Ready (existing) theme or plugin
A theme that already exists — from a previous project, a freelancer, a zip, its own GitHub repo — is added the
same way as a new one, after a check (read-only):
```bash
cd "$T" && bash bin/theme-check.sh themes/<t> [plugins/<p>]     # OK / WARN / BLOCK, exit 2 on BLOCK
```
- "Ready-made theme from GitHub": `git clone --depth 1 <link> "$T/themes/<slug>"` (ask the slug; private repo → `gh`
  login covers it), then the check. The theme's own `.git` comes with the clone.
- **Own `.git` in the theme (BLOCK)** — the project repo would get an empty gitlink. Explain: the theme becomes a
  normal folder of this repo; its old history stays in the backup and in the old repo. If the old repo has
  uncommitted/unpushed work the user needs, they push it there first. On "yes":
  `bash bin/theme-check.sh --detach-git themes/<t> -y` (moves it to `../../git-backups/`, outside the web root).
- **dist/ ignored without a build script**, **composer PHP above PHP_MIN**, **child theme without its parent**,
  **files >95 MB** (BLOCK) — show the line, propose the fix, fix only on "yes". A parent theme is third-party:
  it reaches DEV with `files-sync`, not Git.
- WARN (no lock file, no `.nvmrc`, big files) — mention in the plan, do not stop.
- Build: CI runs `composer install --no-dev` and `npm ci && npm run build` (Node from the theme's `.nvmrc`,
  else 22) — the user does not commit `dist/`/`vendor/` unless the theme has no build script.
Run the check again right before `git add`; it must not print BLOCK.

## 4. New project — plan, then run
Show the plan as a short list: kit install/update into `$T` (if `$KIT != $T`), starter theme (if chosen),
ready theme fixes from `theme-check.sh` (if any),
themes/plugins in Git, branches, `DEV_SSH`/`DEV_PATH`/`PHP_MIN`, `WP_ENVIRONMENT_TYPE` on DEV and in Local
(only if not set), `git init` + remote. One "yes", then:
```bash
# kit (only when running from the archive or the kit in $T is older)
bash "$KIT/bin/kit-install.sh" "$T" -y
# starter theme (only if chosen)
mkdir -p "$T/themes/<slug>" && printf '/*\nTheme Name: <Name>\nVersion: 0.1.0\n*/\n' > "$T/themes/<slug>/style.css" \
  && printf '<?php\n// <Name>\n' > "$T/themes/<slug>/functions.php" \
  && printf '<?php get_header(); ?>\n<main><?php while ( have_posts() ) : the_post(); the_content(); endwhile; ?></main>\n<?php get_footer(); ?>\n' > "$T/themes/<slug>/index.php"
cd "$T" && bash bin/init-project.sh --theme <t> [--theme …] [--plugin <p> …] \
  --dev-branch <dev> --prod-branch <prod|none> --dev-ssh <user@IP> --dev-path <DEV_PATH> --php-min <x.y> -y
# environment types (only if not set yet)
cd "$T/.." && eval "$(bash "$T/bin/local-env.sh")" && wp config set WP_ENVIRONMENT_TYPE local --type=constant
ssh <user@IP> 'cd public_html && wp config set WP_ENVIRONMENT_TYPE development --type=constant'
# repo
cd "$T" && git init -q -b <dev> && git remote add origin "<URL>"
# only if BASE is set (repo was created with a README): keep its history, our files go on top
cd "$T" && git fetch -q origin "<BASE>" && git reset -q "origin/<BASE>" \
  && for f in LICENSE .gitattributes; do git cat-file -e "origin/<BASE>:$f" 2>/dev/null && git checkout -q "origin/<BASE>" -- "$f"; done; true
cd "$T" && bash bin/theme-check.sh          # all targets; must not print BLOCK
cd "$T" && git add -- .gitignore .github .deploy bin .claude README.md CLAUDE.md .env.example \
  $(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' .deploy/targets)
```
Verify the staged list — it must contain ONLY kit files and the chosen themes/plugins:
```bash
cd "$T" && git diff --cached --name-only | grep -vE '^(themes/(<t1>|<t2>)/|plugins/(<p1>)/|mu-plugins/environment-guard\.php$|bin/|\.deploy/|\.github/|\.claude/(skills/|settings\.json$)|\.gitignore$|\.gitattributes$|LICENSE$|\.env\.example$|README\.md$|CLAUDE\.md$|PROJECT\.md$)' || echo CLEAN
git diff --cached --name-only | wc -l; du -sh $(git diff --cached --name-only | cut -d/ -f1-2 | sort -u) 2>/dev/null | sort -h | tail -5
```
Anything besides `CLEAN` → show it and fix (`.gitignore`/`init-project.sh`) before going on. Then ask with
`AskUserQuestion` — **"First commit and push to `<dev>`: who does it?"** (show the file count and the message
`Initial commit` in the question):
- "Claude commits and pushes" → run it yourself (`.claude/settings.json` asks the user to allow each git command
  once more — that is expected), then go straight to 6.1:
  ```bash
  cd "$T" && git commit -q -m "Initial commit" && git push -u origin <dev>
  ```
  Push rejected / auth error → stop, show the error, do not retry with other flags (CLAUDE.md rule 4).
- "I'll do it myself" → give ONE single-line command in a ```bash block to run in a terminal (in the Claude Code CLI
  they can prefix it with `!`), wait for "pushed":
  ```bash
  cd "<T>" && git commit -m "Initial commit" && git push -u origin <dev>
  ```
The same choice applies later to every "commit and push" (e.g. 6.5, a fix after a failed deploy): ask, never assume.

## 5. Join mode — plan, then run
Plan: Git into `$T` from the repo's default branch (local stock files stay), `WP_ENVIRONMENT_TYPE=local`,
then SSH key and data from DEV. One "yes", then:
```bash
cd "$T" && git init -q && git remote add origin "<URL>" && git fetch -q origin && git remote set-head origin -a
B="$(git -C "$T" rev-parse --abbrev-ref origin/HEAD)"; B="${B#origin/}"; git -C "$T" checkout -q -f -B "$B" "origin/$B"
cd "$T/.." && eval "$(bash "$T/bin/local-env.sh")" && wp config set WP_ENVIRONMENT_TYPE local --type=constant
cd "$T" && bash bin/setup.sh </dev/null      # checks, creates the key; without access prints the .pub and exits 0
```
No access → the developer sends the `.pub` line to the team lead (it is already in the clipboard; always also name
the file: `~/.ssh/id_ed25519.pub`), you wait for
"added", run `bash bin/setup.sh </dev/null` again. With access it stops at the confirmation (stdin closed):
tell what will happen (uploads, third-party plugins/themes and DB from DEV; local admin kept; DEV orders not
copied; local DB backup first), get a "yes", run `cd "$T" && bash bin/setup.sh -y`. Then step 8.

## 6. New project — first push → `deploy/dev` → connect Cloudways
Cloudways can be connected only to a branch that exists. The first push (step 4) makes GitHub Actions build and
push `deploy/dev`; only then the sysadmin connects Cloudways (sysadmin message #2 (deploy)). Do the stages in order.

**6.1 Wait for `deploy/dev`.** After your push, or after the user says the push is done:
```bash
cd "$T" && gh run list --workflow=Deploy --limit 3                       # newest run for <dev>
cd "$T" && gh run watch <id> --exit-status                               # waits until it finishes
git -C "$T" ls-remote origin refs/heads/deploy/dev
git -C "$T" fetch -q origin deploy/dev && git -C "$T" ls-tree -r --name-only FETCH_HEAD | cut -d/ -f1-2 | sort -u
```
`deploy/dev` must contain only the chosen themes/plugins and `mu-plugins/environment-guard.php` (+ build output).
Failed run → skill `wp-deploy`, fix, then the same "who commits and pushes" choice. No run at all → Actions are disabled for the repo
(company account: Settings → Actions → General → Allow all actions). No `gh` → ask the user to open
GitHub → Actions and say when it is green.

**6.2 Default branch** on GitHub must be `<dev>` (joining developers get that branch):
```bash
bash "$T/bin/gh-repo.sh" check "<URL>" | grep -E 'DEFAULT_BRANCH|ACCESS'
```
Different → `ACCESS=admin`: ask, then `bash "$T/bin/gh-repo.sh" set-default "<URL>" <dev>`; otherwise the company
account changes it: GitHub → Settings → General → Default branch.

**6.3 Now the sysadmin connects Cloudways.** Say "Branch deploy/dev is ready — forward sysadmin message #2 (deploy) to the sysadmin" and give
**sysadmin message #2 (deploy)** with this checklist, real values filled in (`OWNER/REPO`, domain, app):
1. Cloudways → Application → Backup and Restore → **Take Backup Now**.
2. Deployment via Git → **Generate SSH Keys** → View → copy → GitHub (company account) → repo → Settings →
   **Deploy keys** → Add, "Allow write access" OFF.
3. Deployment via Git → Remote `git@github.com:OWNER/REPO.git` → Authenticate → Branch **`deploy/dev`** →
   Path **`wp-content`** → **Start Deployment**.
4. Auto-deploy webhook: `public_html/gitautodeploy.php` with branch `deploy/dev` + GitHub → Settings → Webhooks
   (README "Webhook and gitautodeploy.php"). If the file is not on DEV yet, offer to upload the template (on yes:
   `scp "$T/.deploy/server/gitautodeploy.php" <user@IP>:public_html/`); the user fills in the keys on the server
   — never ask for them in chat. Old Cloudways script: `branch_name=deploy/dev&deploy_path=wp-content` in the URL. Full URL for the old script:
   `https://<DEV domain>/gitautodeploy.php?server_id=<S>&app_id=<A>&git_url=git@github.com:OWNER/REPO.git&branch_name=deploy/dev&deploy_path=wp-content`
   (`server_id`/`app_id` = the numbers in the default domain `wordpress-<S>-<A>.cloudwaysapps.com`). The old script
   reads the branch from the URL: `branch_name=main` (or any working branch) would pull kit files into
   `wp-content` — if the user shows such a URL, stop and give the corrected one.
Ask "Is Cloudways connected and did Start Deployment succeed?". Check what you can without secrets:
```bash
ssh <user@IP> 'test -f public_html/gitautodeploy.php && grep -nE "^const (BRANCH|DEPLOY_PATH|GIT_URL) " public_html/gitautodeploy.php'
```

**6.4 Verify DEV:**
```bash
ssh <user@IP> 'cd public_html/wp-content && ls themes plugins mu-plugins && ls -A | grep -E "^(bin|\.deploy|\.github|\.claude|README\.md|CLAUDE\.md)$" || true'
curl -s -o /dev/null -w '%{http_code}\n' <DEV_URL>/wp-content/.git/config      # must be 403/404
```
Kit files (`bin`, `.deploy`, `README.md`…) inside DEV `wp-content` mean a working branch was pulled; Pull never
deletes them → list them and offer to delete them on DEV (ask first). `200` for `.git/config` → the user asks
Cloudways support to block `/.git` or enables password protection on DEV.

**6.5 Auto-deploy test (optional, tell the user):** change anything in the theme → commit → push to `<dev>` → in
1–2 min it is on DEV; GitHub → Settings → Webhooks → Recent Deliveries shows `200 Pull deploy/dev …`.

## 7. New project — data to DEV (ask: "Move the data from local to DEV now?")
Files first, then DB; each one dry-run → show the plan → "yes" → real run (skill `wp-sync` rules, incl. the
"Keep DEV users (Recommended)" / "Full, with users" choice for the DB):
```bash
cd "$T" && bash bin/files-sync.sh local dev --dry-run      # then without --dry-run (there is no -y)
cd "$T" && bash bin/db-sync.sh local dev --dry-run         # then -y
```
Then: DEV shows the site with the DEV badge; Settings → Permalinks → Save on DEV.

## 8. Finish
Summarize in 4–6 lines: what is configured (branches, DEV, PHP_MIN, which themes/plugins are in Git and whether
any came with fixes from `theme-check.sh`), what the user still has to do (panels, the
commit/push if not done), how to work next: "push to <dev> → DEV", `/wp-sync` for data, `/wp-setup` to refresh
local. If `$KIT != $T`, say: next time open Claude Code in `$T` (the skills now live there).

## Re-run safety
Everything is re-runnable: `kit-install.sh` never overwrites project files, `init-project.sh` rewrites only its
blocks, `git init` on an existing repo is skipped by you (check `git -C "$T" rev-parse` first).
