# Development process: Local → GitHub → Cloudways

```
 ┌──────────────── Local (all development happens here) ┐
 │  app/public/wp-content   ← Git repository            │
 │    themes/my-theme       (Git)                       │
 │    plugins/my-plugin     (Git)                       │
 │    plugins/woocommerce…  (not Git → files-sync)      │
 │    uploads/              (not Git → files-sync)      │
 │    DB                    (→ db-sync)                 │
 └──────┬──────────────────────┬────────────────────────┘
        │ code: git push        │ data: bin/files-sync.sh local dev
        ▼                       │       bin/db-sync.sh local dev
   GitHub Actions               ▼
   DEV_BRANCH  → build → deploy/dev  ─► webhook ─► Cloudways DEV  (Deployment via Git pulls deploy/dev)
   PROD_BRANCH → build → deploy/prod ─► webhook ─► Cloudways PROD
```

## Contents
1. [Principles](#1-principles)
2. [All files](#2-all-files)
3. [Project start: `/wp-init` in Claude](#3-project-start-wp-init-in-claude)
4. [Every developer: `/wp-init` → "Join a project"](#4-every-developer-wp-init--join-a-project)
5. [Daily work](#5-daily-work)
6. [Database: commands and what they do](#6-database-commands-and-what-they-do)
7. [WooCommerce, Contact Form 7, Gravity Forms and other plugins](#7-woocommerce-contact-form-7-gravity-forms-and-other-plugins)
8. [Security and rollback](#8-security-and-rollback)
9. [Problems and fixes](#9-problems-and-fixes)
10. [The wp-dev-kit: new project and updates](#10-the-wp-dev-kit-new-project-and-updates)

---

## 1. Principles

1. **Development happens locally.** Code, content and settings appear in Local first and then go to DEV.
2. **Code** reaches the server only through Git. The repository holds only your own themes and project-specific plugins (plus the process's service files). Deploy: GitHub Actions builds, Cloudways "Deployment via Git" pulls ([section 3](#3-project-start-wp-init-in-claude)).
3. **Data** (DB, media, third-party plugins) is moved by scripts `local → dev`. Scripts are blocked from writing to prod.
4. **Not moved by default — the target keeps its own:**

   | What | Examples | Force the move |
   |---|---|---|
   | **Users** | admins, customers, their passwords | `--with-users` |
   | **Transactional data** | WooCommerce orders, GF/CF7/WPForms entries, job queues | `--with-transactional` |
   | **Environment settings** | Stripe/PayPal keys, SMTP, licenses, reCAPTCHA, `blog_public` | manually only |

5. Every move automatically rewrites **URLs** (`mysite.local ↔ dev.site.com`, including inside Gutenberg/Elementor JSON) and the **table prefix** (local `wp_` ↔ DEV prefix), including `user_roles`.

---

## 2. All files

The repository root is the `wp-content` folder.

| File | Purpose | Change for the project |
|---|---|---|
| [.gitignore](.gitignore) | Allowlist: only your own themes/plugins/mu-plugin go into Git | **via `init-project.sh`** |
| [.deploy/environments.conf](.deploy/environments.conf) | DEV address and path for the data scripts (no passwords, committed) | **via `init-project.sh`** |
| [.deploy/targets](.deploy/targets) | What reaches the server (branch `deploy/*`) | **via `init-project.sh`** |
| [.deploy/templates/](.deploy/templates/), [.deploy/KIT_VERSION](.deploy/KIT_VERSION) | Clean templates of the project files and the kit version | — |
| [.env.example](.env.example) | Optional personal overrides (`.env` is not committed) | usually not needed |
| [.deploy/sync.conf](.deploy/sync.conf) | Content / transactional / settings, ID gap, server-only plugins | if needed |
| [.deploy/rsync-exclude](.deploy/rsync-exclude) | What is left out of the release | if needed |
| [.deploy/profiles/](.deploy/profiles/) | Rules for [WooCommerce](.deploy/profiles/woocommerce.conf), [Gravity Forms](.deploy/profiles/gravityforms.conf), [CF7](.deploy/profiles/contact-form-7.conf), [Flamingo](.deploy/profiles/flamingo.conf), [CFDB7](.deploy/profiles/contact-form-cfdb7.conf), [WPForms](.deploy/profiles/wpforms.conf), [Elementor](.deploy/profiles/elementor.conf), [Yoast](.deploy/profiles/wordpress-seo.conf), [Rank Math](.deploy/profiles/seo-by-rank-math.conf) + [template](.deploy/profiles/_TEMPLATE.conf.example) | — |
| [.github/workflows/deploy.yml](.github/workflows/deploy.yml) | Build → branch `deploy/dev` / `deploy/prod` (only the needed files) | — |
| [.deploy/server/gitautodeploy.php](.deploy/server/gitautodeploy.php) | Webhook template: a copy lives in `public_html` on Cloudways and runs a Pull only on a push to `deploy/dev` | filled in on the server |
| [bin/kit-install.sh](bin/kit-install.sh), [bin/kit-pack.sh](bin/kit-pack.sh), [bin/init-project.sh](bin/init-project.sh) | Install/update the kit in another project, pack the archive, configure for the project | — |
| [bin/gh-repo.sh](bin/gh-repo.sh) | Repository from a link: GitHub login, invitation (accept), access, empty or not, default branch | — |
| [bin/local-env.sh](bin/local-env.sh) | Local's environment (`wp`, `mysql`, the site's PHP) in any terminal; `--list` shows all Local sites | — |
| [bin/setup.sh](bin/setup.sh) | One command for a developer: check, SSH key, pull from DEV | — |
| [bin/db-sync.sh](bin/db-sync.sh) | Database moves | — |
| [bin/files-sync.sh](bin/files-sync.sh) | Media and third-party plugins/themes | — |
| [bin/pages-sync.sh](bin/pages-sync.sh) | Only chosen pages/posts with their images, blocks and templates; undo with `--rollback` | — |
| [bin/release.sh](bin/release.sh), [bin/build.sh](bin/build.sh) | Release build (called by CI) | — |
| [bin/theme-check.sh](bin/theme-check.sh) | Checks a ready-made theme/plugin before Git: its own `.git`, build, composer vs `PHP_MIN`, child theme, large files; `--detach-git` turns the theme into a plain repository folder | — |
| [bin/php-lint.sh](bin/php-lint.sh) | PHP syntax check of your own themes/plugins (on `PHP_MIN` in CI) | — |
| [bin/lib/common.sh](bin/lib/common.sh), [bin/lib/options-tool.php](bin/lib/options-tool.php) | Internal helpers | — |
| [mu-plugins/environment-guard.php](mu-plugins/environment-guard.php) | LOCAL/DEV/PROD badge, `noindex`, mail protection on DEV | — |
| [CLAUDE.md](CLAUDE.md), [.claude/](.claude/) | Rules and skills for Claude | — |

### Requirements

**On the developer's computer**
- macOS or Linux.
- [Local](https://localwp.com/) and Git (`xcode-select --install` if `git` is missing). `rsync`, `ssh` and `bash` are already in macOS. `bin/setup.sh` creates the SSH key.
- Commands can be run from any terminal, from Claude Code or from Local → Open site shell: the scripts pick up `wp`, `mysql` and the site's PHP from Local themselves ([bin/local-env.sh](bin/local-env.sh)). The site must be running in Local.

**On Cloudways**
- A WordPress application with SSH enabled for Application Credentials and the developers' keys added (only for the data scripts).
- **Deployment via Git** connected to branch `deploy/dev` + `public_html/gitautodeploy.php` with an API key (API Integration) — for code deploys via the webhook.
- WP-CLI, rsync and gzip are already installed on Cloudways servers.

**Cloudways limitations the kit accounts for**
- The **application user** sees only its own application. So the scripts write temp files and backups to `private_html` (outside the web root), not to `/tmp`.
- **Disk** space is limited: each target keeps only the last 10 DB backups (`BACKUP_KEEP` in [sync.conf](.deploy/sync.conf)).
- **MariaDB** on Cloudways and **MySQL 8** in Local: collations and the first line of a MariaDB dump are fixed automatically.
- **Breeze, Object Cache, MalCare** live only on the server: `files-sync` does not touch them, and they are re-activated after a DB import.
- **Varnish** caches pages — turn it off on DEV, otherwise you see old content after a deploy.
- **Deployment via Git** does not delete files that are not in the branch. That is why `deploy/dev` contains only your themes/plugins, and everything else in `wp-content` on the server is left alone.
- **SSH IP allowlist** (Server → Security → Shell Access): if enabled, add the developers' IPs. It does not affect code deploys — GitHub does not use SSH.

**On GitHub**
- A repository with admin rights (Deploy keys, Webhooks, Variables). The free plan is enough.
- Actions permissions do not need to be turned on separately: the workflow requests `contents: write` itself to push the `deploy/*` branches. Only if Actions fails with `push … denied` / 403: Settings → Actions → General → Workflow permissions → **Read and write** (in an organization this may be locked at the organization level).

**PHP**
- PHP versions in Local, on DEV and on PROD **may differ** — what matters is that all are 8.x. For example, Local Preferred (8.2) + Cloudways 8.4 is fine.
- Compatibility is held by `PHP_MIN` in [.deploy/environments.conf](.deploy/environments.conf) — the **lowest** version across all environments (usually the Local one). GitHub Actions checks the syntax of your own themes/plugins and installs composer dependencies on exactly `PHP_MIN`. Code that passed CI runs on any PHP from `PHP_MIN` up; if someone used newer PHP syntax, the deploy stops at the "PHP syntax check" step and nothing reaches the server.
- `bin/setup.sh` compares the local and DEV PHP with `PHP_MIN` and warns if either is lower.
- What CI does not catch: new **functions** (e.g. `array_find` from 8.4) on an older version. So write code for `PHP_MIN`, not for your local version.
- Composer: set the same version in the theme's/plugin's `composer.json` so that `composer update` on a newer PHP does not pick incompatible packages:
  ```json
  "config": { "platform": { "php": "8.2" } }
  ```

### Working with Claude
The first time: `/wp-init` ([section 3](#3-project-start-wp-init-in-claude)). After that, open a Claude Code session in the site's `wp-content` folder. Claude reads [CLAUDE.md](CLAUDE.md) (rules) and the skills in [.claude/skills/](.claude/skills/) on its own:

| Skill | When it triggers (examples) |
|---|---|
| [wp-init](.claude/skills/wp-init/SKILL.md) | `/wp-init` — new project or join one (with a questionnaire) |
| [wp-sync](.claude/skills/wp-sync/SKILL.md) | `push db to dev`, `push content to dev`, `push uploads to dev`, `pull from dev`, `rollback dev` |
| [wp-deploy](.claude/skills/wp-deploy/SKILL.md) | `what will deploy`, `did the deploy work`, `deploy failed` |
| [wp-setup](.claude/skills/wp-setup/SKILL.md) | `refresh my local from dev`, `update my local`, `I have no access to dev` |
| [wp-add-code](.claude/skills/wp-add-code/SKILL.md) | `add plugin my-forms to git`, `add my mu-plugin to git`, `add a sync profile for <plugin>` |

- Before any write, Claude runs `--dry-run`, shows the plan and waits for your "yes".
- Without a direct request, Claude does not use `--with-users`, `--with-transactional`, `--clean`, `--no-backup`, `files-sync --delete` and never writes to prod.
- `git commit` / `git push`: Claude asks every time who does it — **"Claude commits and pushes"** or **"I'll do it myself"** (then it gives you a ready command). Claude itself pushes only to `DEV_BRANCH`: never to `PROD_BRANCH` or `deploy/*`, never with `--force`; if a push is rejected, it stops and explains. [.claude/settings.json](.claude/settings.json) additionally asks for permission on every git write and blocks writes to prod.
- Claude will not do panel work for you: the site in Local, the application, keys and Deployment via Git in Cloudways, Deploy keys in GitHub. Everything in Cloudways is set up by the sysadmin — Claude writes a ready message for them ([section 3](#cloudways-is-done-by-the-sysadmin)).

---

## 3. Project start: `/wp-init` in Claude

**What must be done before this** (basics, not covered here):
- the site in **Local** is created and running (any PHP 8.x);
- an application on **Cloudways** (Basic WordPress, Hybrid Stack), domain and SSL, **Varnish off** on DEV, **SSH Access** on, and a user in Access Details → Application Credentials (`username@IP`);
- a GitHub repository (company account) — **empty** or with only a README/LICENSE created by GitHub; the person who will run `/wp-init` is invited with the **Write** role. Just send them the link, e.g. `https://github.com/<company>/site`;
- Cloudways **Deployment via Git** and the webhook are **not connected yet**: Cloudways needs the `deploy/dev` branch, and GitHub Actions creates it after the first push. `/wp-init` gets to the push, waits for `deploy/dev` and says "you can connect Cloudways now" — with a ready list of steps.

**Start**
1. Unpack `wp-dev-kit-<version>.zip` (e.g. into `~/Downloads`).
2. Open Claude Code in the `wp-dev-kit` folder — or in the site's `wp-content` if the kit is already there.
3. Type **`/wp-init`** → "New project (empty repository)".

**What Claude does:** asks for the Local site, your own themes/plugins, the branches (`DEV_BRANCH`/`PROD_BRANCH`), the repository link and `username@IP`. From the link it checks the GitHub login (installs `gh` if needed; logging in through the browser — `gh auth login` — you do once yourself), finds the invitation and accepts it after your "yes", and checks access; it detects the server path, PHP and `PHP_MIN` itself; shows a single plan and, after your "yes", installs the kit, configures `.gitignore` / `.deploy/*`, creates the repository and checks that it contains only the needed files. After the first push it waits for Actions to create `deploy/dev`, checks its contents and the default branch, gives you the list for connecting Cloudways, and after connection checks that DEV has only what it should and that `.git` is closed to the web. Then (after a dry-run and a "yes") it moves the files and the database to DEV.

**What you do:** everything in the Cloudways panel is done by the **sysadmin** — you only forward the ready message Claude writes ([below](#cloudways-is-done-by-the-sysadmin)): first access (your SSH key — [where to find it](#ssh-key-where-to-find-it) — and SSH Shell Access), after the first push Deployment via Git and the webhook; the first commit and push are your choice: Claude does it or gives you one command; when Claude says `deploy/dev` is ready, you forward the sysadmin message #2 (deploy) (Deployment via Git: Deploy key, branch `deploy/dev`, path `wp-content`, webhook).

<details><summary>The same without Claude</summary>

```bash
bash ~/Downloads/wp-dev-kit/bin/kit-install.sh "$HOME/Local Sites/<site>/app/public/wp-content"
cd "$HOME/Local Sites/<site>/app/public/wp-content"
bash bin/init-project.sh                      # themes, plugins, branches, DEV_SSH, DEV_PATH, PHP_MIN
git init -b <DEV_BRANCH> && git remote add origin https://github.com/OWNER/REPO.git
git add -- .gitignore .github .deploy bin .claude README.md CLAUDE.md .env.example $(grep -v "^#" .deploy/targets)
git status                                     # only your own themes/plugins and kit files
git commit -m "Initial commit" && git push -u origin <DEV_BRANCH>
# GitHub → Actions → Deploy green → branch deploy/dev exists → now connect Cloudways (below)
bin/files-sync.sh local dev --dry-run && bin/db-sync.sh local dev --dry-run   # then without --dry-run
```
</details>

### Ready-made theme or plugin
A ready-made theme (from an earlier project, from a freelancer, from an archive or from its own GitHub repository) is connected the same way as a new one: put it in `themes/<name>` (or in `/wp-init` choose "Ready-made theme from GitHub" — Claude clones it) and select it in the list of your themes. Before `git add`, Claude runs the check:
```bash
bash bin/theme-check.sh themes/<name>      # OK / WARN / BLOCK
```
| What it finds | Why it matters | What we do |
|---|---|---|
| The theme has **its own `.git`** | the project repository gets an empty reference, DEV gets an empty folder | `bash bin/theme-check.sh --detach-git themes/<name> -y` — the theme's `.git` moves to `app/git-backups/` (outside the web root) and the theme becomes a plain folder. The history stays there and in the old repository; push any unpushed changes there first |
| `dist/` in the theme's `.gitignore`, but no `build` in `package.json` | the built files will be neither in Git nor on DEV | remove `dist` from the theme's `.gitignore` or add a `build` script |
| `npm run build` exists | CI builds it (`npm ci`, Node from the theme's `.nvmrc`, otherwise 22) | do not commit `dist/`; commit `package-lock.json` |
| `composer.json` | CI installs `vendor/` on `PHP_MIN` | the PHP requirement in composer is not above `PHP_MIN`; commit `composer.lock` |
| Child theme (`Template:` in `style.css`) | the parent (Astra, GeneratePress…) is third-party | only the child goes into Git; the parent goes to DEV via `files-sync` |
| Files > 95 MB | GitHub will not accept them | move to `uploads`/CDN |

A plugin with blocks can be moved into the theme (or the other way round): add the new path, remove the old one (`/wp-add-code`). The old folder stays on DEV until someone deletes it there — Deployment via Git does not delete files.

### What goes to DEV, and how to add more
Only the paths in `.deploy/targets` reach `deploy/dev` (and DEV). Everything else in `wp-content` is ignored by Git (the `.gitignore` is a whitelist), so a **new theme or plugin folder does not deploy until it is added** — ask Claude "add theme X to git" (skill `wp-add-code`). New files inside an already added theme/plugin deploy automatically.

| Your code | Add with `wp-add-code` → it writes |
|---|---|
| theme `themes/<name>` | `!/themes/<name>/` in `.gitignore`, `themes/<name>` in `.deploy/targets` |
| plugin `plugins/<name>` | `!/plugins/<name>/` + `plugins/<name>` |
| mu-plugin, one file | `!/mu-plugins/<name>.php` + `mu-plugins/<name>.php` |
| mu-plugin in a folder | the folder **and** its loader file `mu-plugins/<name>.php` (WordPress loads only top-level files in `mu-plugins/`) |

Third-party plugins/themes never go to Git: they move with `bin/files-sync.sh`. A mu-plugin is always active and cannot be deactivated in wp-admin — a fatal error in it takes the site down, so test it locally first; removed from deploy, it keeps running on DEV until its file is deleted there.

### Project where DEV already has a site
If DEV is not empty (the site was built earlier, the client is filling in content), `/wp-init` first pulls DEV to local (`files-sync dev local`, `db-sync dev local`) and pushes nothing to DEV until you ask. Theme code still goes only through Git.

### Cloudways is done by the sysadmin
The developer configures nothing in the Cloudways panel — the system administrator does it. They are contacted **twice** per project, and each time `/wp-init` gives a ready text with all the values (application, IP, key, repository) — just forward it:

**Sysadmin message #1 (access) — at the start of `/wp-init`:**
1. Add the developer's SSH key (the `ssh-ed25519 …` line, see [SSH key](#ssh-key-where-to-find-it)): Application → Access Details → **Application Credentials** → SSH Keys.
2. Enable Application → Application Settings → **SSH Shell Access** (without it SSH prints `Shell access is disabled !`).
3. Turn off **Varnish** on DEV (Application Settings → Varnish).
4. If the IP allowlist is enabled (Server → Security → Shell Access), add the developer's IP.

**Sysadmin message #2 (deploy) — after the first push, once Actions has created the `deploy/dev` branch:** the steps from [Connecting Cloudways](#connecting-cloudways--after-the-first-push) and [Webhook](#webhook-and-gitautodeployphp): backup, Deployment via Git on `deploy/dev` → `wp-content`, Deploy key in GitHub, `gitautodeploy.php` with the keys, and the webhook. It cannot be done earlier: Cloudways connects only to a branch that already exists.

The Application Credentials password, the API key and the webhook secret are never written into the chat (or given to Claude).

### SSH key: where to find it
The public key is in the file **`~/.ssh/id_ed25519.pub`**; the full path on a Mac is `/Users/<your-macOS-username>/.ssh/id_ed25519.pub` (to check: `echo ~/.ssh/id_ed25519.pub`). The key is one line: `ssh-ed25519 AAAA… name@computer`.

- **Copy to the clipboard:** `pbcopy < ~/.ssh/id_ed25519.pub` — then paste it into Cloudways (Cmd+V).
- **View it:** `cat ~/.ssh/id_ed25519.pub`.
- **In Finder:** Cmd+Shift+G → `~/.ssh` (the folder is hidden; Cmd+Shift+. shows hidden files) → open `id_ed25519.pub` in TextEdit.
- **No such file** — create the key (once per computer): `ssh-keygen -t ed25519 -C "$(whoami)@$(hostname -s) wp-dev" -f ~/.ssh/id_ed25519`. `/wp-init` and `bin/setup.sh` do this themselves.

You add **only the `.pub`** — it is not a secret. The file `~/.ssh/id_ed25519` without `.pub` is the private key: never send it to anyone or paste it anywhere. The sysadmin adds the key in Cloudways ([message #1](#cloudways-is-done-by-the-sysadmin)): Application → Access Details → **Application Credentials** → SSH Keys (not Master Credentials); Application Settings → **SSH Shell Access** enabled. The kit does not need the Application Credentials password.

### Connecting Cloudways — after the first push
Once the `deploy/dev` branch exists in the repository:
1. Application → Backup and Restore → **Take Backup Now**.
2. Deployment via Git → **Generate SSH Keys** → copy → GitHub (company account) → Settings → **Deploy keys** → Add, "Allow write access" off.
3. Deployment via Git → `git@github.com:OWNER/REPO.git` → Authenticate → Branch **`deploy/dev`** → Path **`wp-content`** → **Start Deployment**.
4. The webhook for auto-deploy — below.

### Webhook and `gitautodeploy.php`
How code travels: push to `DEV_BRANCH` → GitHub Actions builds and puts **only** your themes/plugins into the `deploy/dev` branch → that push fires the webhook → `public_html/gitautodeploy.php` → Cloudways pulls `deploy/dev` into `public_html/wp-content`. Cloudways never pulls the working branch: it holds the kit's service files (`bin/`, `.deploy/`, `README.md`…) and no built `dist/`/`vendor/`.

1. Cloudways → account icon → **API Integration** → key. **Server ID** and **App ID** come from the application URL: `…/server/123456/application/7890123`.
2. Webhook secret: `openssl rand -hex 32`.
3. Put [.deploy/server/gitautodeploy.php](.deploy/server/gitautodeploy.php) into `public_html` on the server (`DEV_SSH`/`DEV_PATH` from [.deploy/environments.conf](.deploy/environments.conf)):
   ```bash
   scp .deploy/server/gitautodeploy.php username@IP:public_html/
   ```
   Then on the server (`ssh username@IP`, `nano public_html/gitautodeploy.php`) fill in the constants at the top: `CW_EMAIL`, `CW_API_KEY`, `SERVER_ID`, `APP_ID`, `GIT_URL`, `WEBHOOK_SECRET`. `BRANCH` = `deploy/dev` and `DEPLOY_PATH` = `wp-content` are already set. The keys exist only on the server, never in Git.
4. Under the company account: GitHub → repository → **Settings → Webhooks → Add webhook**:
   - **Payload URL:** `https://dev.site.com/gitautodeploy.php`;
   - **Content type:** `application/json`;
   - **Secret:** the string from step 2;
   - **Just the push event** → **Add webhook**.

   GitHub immediately sends a test `ping`: **Recent Deliveries** should show a `200` response with `pong`.

The webhook fires on every push, but the script runs a Pull only on a push to `deploy/dev`. A push to `DEV_BRANCH` gets the response `202 Skipped`, and that is normal: a minute later Actions pushes to `deploy/dev`, and that one triggers the Pull.

If you use your own old `gitautodeploy.php` from Cloudways (parameters in the URL): `branch_name=deploy/dev`, and uncomment the `deploy_path` line and add `&deploy_path=wp-content`. Without it Cloudways deploys the branch into `public_html`.

### New developer — what the team lead / sysadmin does
1. GitHub → Collaborators → add.
2. Send the developer the repository link and the kit archive.
3. The developer sends the line `ssh-ed25519 AAAA… name` (the contents of `~/.ssh/id_ed25519.pub`, see [SSH key: where to find it](#ssh-key-where-to-find-it); `/wp-init` shows it) → Cloudways → Application Credentials → SSH Keys → add → tell the developer.

### Later: PROD
A new application, set up like DEV, with these differences: branch **`deploy/prod`**; add the new application's Deployment via Git key to GitHub as a second Deploy key (`cloudways-prod`) if it differs from the first; a separate `gitautodeploy.php` in the PROD `public_html` with `BRANCH = 'deploy/prod'` and its own `SERVER_ID`/`APP_ID` + a second webhook on the PROD domain; `WP_ENVIRONMENT_TYPE production`. Set `PROD_BRANCH` in [.deploy/environments.conf](.deploy/environments.conf) (`bin/init-project.sh` or by hand) and commit. From then on, a merge into `PROD_BRANCH` = a code deploy to PROD. Data scripts never write to prod.

Who may deploy to PROD: Variables → `PROD_DEPLOYERS` = comma-separated GitHub logins (e.g. `company-account,teamlead`). A push or merge into `PROD_BRANCH` by anyone else stops the workflow before the build, and PROD stays unchanged. This guards against an accidental push, not against a deliberate bypass — only paid branch protection gives full protection. **If `PROD_DEPLOYERS` is not set, anyone with Write access can deploy to PROD** — set it before the first PROD deploy.

---

## 4. Every developer: `/wp-init` → "Join a project"

1. Create and start a site in **Local** (any PHP 8.x, not below the project's `PHP_MIN`).
2. Unpack the kit archive, open Claude Code in the `wp-dev-kit` folder → **`/wp-init`** → "Join a project (code already on GitHub)" → pick the site and paste the repository link from the team lead. Claude accepts the invitation itself (after your "yes"); GitHub login is `gh auth login`, once.

Claude connects Git to `wp-content` (the GitHub default branch; Local's standard files stay), sets `WP_ENVIRONMENT_TYPE=local`, creates an SSH key (`~/.ssh/id_ed25519.pub`, see [SSH key: where to find it](#ssh-key-where-to-find-it)) and copies it to the clipboard — send it to the team lead. Once the team lead has added the key, Claude (after your "yes") pulls media, third-party plugins and the database from DEV. Your local admin stays, DEV orders do not come over. Then: `/wp-admin` shows a green **LOCAL** badge, mail goes to Local → Tools → Mailpit.

From then on, open Claude Code in the site's `wp-content`. "Refresh my local from DEV" = `bash bin/setup.sh` (or the `wp-setup` skill).

<details><summary>The same without Claude</summary>

```bash
cd "$HOME/Local Sites/<site>/app/public/wp-content"
git init -q && git remote add origin https://github.com/OWNER/REPO.git
git fetch origin && git remote set-head origin -a
B="$(git rev-parse --abbrev-ref origin/HEAD)"; B="${B#origin/}"; git checkout -f -B "$B" "origin/$B"
bash bin/setup.sh            # first run shows the key for the team lead; after they say "added", run again
```
If `git fetch` prints `Repository not found`: the invitation is not accepted yet, or you need `gh auth login`.
</details>

**Why SSH:** code reaches the server only through Git. The SSH key is needed only by the data scripts (`setup.sh`, `db-sync.sh`, `files-sync.sh`). The key is created once per computer.

## 5. Daily work

**Code and data go to DEV separately:**

| What | How it reaches DEV | How often |
|---|---|---|
| **Code** (your theme, your plugins) | push to `DEV_BRANCH` → Actions → `deploy/dev` → webhook → DEV | automatically, on **every** push, 1–2 min. No separate command |
| **Data** (pages, settings, media, third-party plugins) | `/wp-sync` → "push everything to dev" (files, then DB) | when you need to show it — e.g. once a day |

```bash
git pull                                 # on DEV_BRANCH (e.g. main)
# … theme code, pages, settings locally …
# commit + push: ask Claude "commit and push" (it asks who does it) or do it yourself — same result
bin/files-sync.sh local dev              # media, third-party plugins/themes, translations, fonts
bin/db-sync.sh local dev                 # DB keeping DEV users (DEV users stay)
```
- **Commit and push:** you can ask Claude ("commit and push" — it shows the files and asks who does it) or do it yourself. The result is the same: code reaches DEV only through a push.
- **Database to DEV — two options** (Claude asks every time): **keep DEV users** (default: DEV admins and passwords stay) or **full, with users** (`--with-users`: before the move the script shows who will be admin afterwards and which DEV admins will disappear; passwords become the local ones — they must be strong locally).
- **Media before the database.** The database brings the media library records; the files themselves come only with `files-sync`. `db-sync` checks this and warns "Media: N file(s) … missing" — run `bin/files-sync.sh local dev uploads` first, otherwise the media library on DEV shows empty items.
- **Data goes only local → DEV.** Anything changed on DEV by hand (pages, settings) is wiped by the next database push. If a client or content manager edits DEV, run `bin/db-sync.sh dev local` first.
- Separate branches (`feature/…` + PR into `DEV_BRANCH`) are optional; only what is merged into `DEV_BRANCH` reaches DEV.
- If several developers work on the project, **one person pushes data to DEV** (or take turns). Otherwise one push wipes the other's content. Before your push, run `bin/db-sync.sh dev local` to pick up others' changes.
- **New/updated third-party plugin:** install or update it locally → `bin/files-sync.sh local dev plugins` → `bin/db-sync.sh local dev`.
- **New custom plugin:** add it to `.gitignore` (`!/plugins/new-plugin/`) and to `.deploy/targets`.
- **Release:** PR `DEV_BRANCH → PROD_BRANCH` → approve → code deploy to PROD. Data scripts never write to prod.

---

## 6. Database: commands and what they do

| Command | Moves | Leaves untouched on the target |
|---|---|---|
| `bin/db-sync.sh local dev` **(main)** | the whole DB: content, site settings, active plugins | users, orders, entries, queues, keys (`PRESERVE_OPTIONS`) |
| `bin/db-sync.sh local dev --mode=content` | content only: pages, posts, products, forms, menus, ACF Options | all of the above **+ site settings** |
| `… --with-users` ("full, with users") | + users from local: the dry-run shows admins after the move and DEV admins who will disappear; passwords come from local | — |
| `… --with-transactional` | + orders/entries from local | — |
| `… --clean` | + deletes DEV tables that do not exist locally | — |
| `bin/db-sync.sh dev local` | DEV's state to your machine | your users and orders |
| `bin/pages-sync.sh local dev about services/web 123` | **only these pages/posts/products** + what they show: images and files (Gutenberg, featured image, ACF, galleries, Elementor), reusable blocks, Elementor templates, categories/tags; missing parent pages | everything else: other pages, menus, widgets, site settings, users, orders |

**Only some pages** (`/wp-sync` → "push the About and Contacts pages to dev"): `bin/pages-sync.sh` takes an ID, slug,
path (`services/web`) or URL; the same works as `bin/db-sync.sh local dev --pages=about,contacts`. Media files are
copied first, then the pages are written in one transaction with the same IDs and the URLs replaced. If DEV has
something else under that ID or another page with the same address, the script stops and changes nothing
(`CONFLICT` — usually a page created directly on DEV). Before writing it saves the old state; undo:
`bin/pages-sync.sh --rollback dev <file> --dry-run`, then `-y` (the file name is printed at the end). Menus are not
moved: add a new page to the menu on DEV or push the content.

Before writing, the script shows where it moves from and to, which profiles are active and what stays on the target. To continue, you type the target's name (`dev`).

**What happens inside:**
1. Target backup: on the server in `../private_html/db-backups/` (not reachable from the web), in Local in `app/db-backups/`.
2. Data is imported into **staging tables** `wpsyncin_*`; the target is not changed yet.
3. The source's users and transactional data are removed from them.
4. **ID conflict check**: if a local page has the same ID as an order or entry on DEV, the script stops and DEV stays untouched.
5. Still in the staging tables: DEV's orders/entries (with meta and notes) and environment keys are added, the table prefix and URLs are rewritten, the ID counter is set.
6. One atomic `RENAME TABLE` swaps the tables in — **the only moment DEV changes**. Any error before it leaves DEV exactly as it was; running the same command again is always safe.
7. Caches are cleared (rewrite rules, transients, object cache, Breeze), plugin hooks run (Woo lookup tables, Elementor CSS, Yoast indexes), server-only plugins are re-activated, and the result is checked.
8. **ID gap:** new orders and entries on DEV get IDs starting at "largest content ID + 1,000,000". So pages you create locally later never collide with them. A pull to local sets local's counter back to "largest content ID + 1", so the next push has no conflicts either.
9. Plugin tables the target keeps for itself (orders, entries, queues) but does not have yet — e.g. the first push to a fresh DEV — are created **empty** (the dry-run lists them as "Empty tables").

**Files** (`bin/files-sync.sh`): `uploads`, third-party `plugins` and `themes`, plus `languages` (translations — needed when the site is not in English) and `fonts` (WP 6.5+ Font Library) when the source has them. Junk folders (`FILES_EXCLUDE`) are skipped only inside `uploads`; plugins and themes are copied whole.

**Limits to know:**
- Do not place test orders or send forms on DEV *during* a push: legacy (non-HPOS) orders and form messages stored as posts that are created in the seconds between step 5 and step 6 are lost. HPOS orders and entry tables are never touched.
- Create pages and forms on local, not on DEV: content created on DEV gets IDs in the gap range and can cause an `ID conflict` later.
- `PRESERVE_OPTIONS` is a list: keys of a payment/SMTP plugin that is not listed are copied from the source. Add its option names to `.deploy/sync.conf` or a profile.
- After a plugin update with a DB migration (WooCommerce, Gravity Forms…) run its updater on DEV too (e.g. `wp wc update`): kept order/entry tables on DEV are not migrated by the push.
- Kept post types (orders, messages) keep their own taxonomy terms only if those terms exist on the target.
- URL replacement is a plain text replace: `site.com` also changes inside `site.com.ua`. Use full URLs that are not a prefix of each other.
- Not supported: multisite (the script refuses), table names longer than ~54 characters (the staging prefix makes them too long).

---

## 7. WooCommerce, Contact Form 7, Gravity Forms and other plugins

A profile is applied automatically if the plugin is active locally or on DEV.

| Plugin | Moved (content) | Stays on DEV |
|---|---|---|
| **WooCommerce** | products, variations, categories, attributes, product lookup tables, shop pages | **orders** (HPOS and legacy), refunds, subscriptions, coupons, customers, analytics, sessions, card tokens, API keys, webhooks; Stripe/PayPal/Square/WooPayments keys |
| **Contact Form 7** | forms | Flamingo/CFDB7 messages; reCAPTCHA keys (`wpcf7`) |
| **Gravity Forms** | forms, feeds | entries, notes, drafts, payments; license, add-on keys |
| **WPForms** | forms | entries, payments, logs; license |
| **Elementor** | pages, templates, Kit | Pro form submissions; license |
| **Yoast** | SEO meta | — (indexes are rebuilt) |
| **Rank Math** | SEO meta (title, description, keywords, schema), settings, **redirects** | 404 logs, analytics (GSC/GA), Rank Math and Google account connections; DEV indexing is turned off by `blog_public` |
| **All** | — | Action Scheduler queues, SMTP, ACF Pro license |

**Details:**
- **Products** move together with their local prices and stock. Before the shop launches, that is fine. After launch, products are managed on the server, and local is only refreshed from it.
- **Post authors:** users are not moved, so `post_author` points to a local user ID. Usually that is ID 1, i.e. the first admin on both sides. If needed, assign the author on DEV by hand.
- **Forms and entries:** entries reference form IDs. Create and edit forms only locally.
- **Media:** entry files (`uploads/gravity_forms/`, `uploads/wpforms/`) and Elementor CSS are not uploaded to the server.
- **Mail on DEV** goes to `ENV_GUARD_MAIL_TO` or is blocked. Locally, all mail is caught by Local → Tools → **Mailpit**.
- **Another plugin with its own tables:** copy [_TEMPLATE.conf.example](.deploy/profiles/_TEMPLATE.conf.example) to `.deploy/profiles/<plugin-folder>.conf` and sort its tables into content and transactional. `wp db tables --all-tables-with-prefix` lists the tables.

---

## 8. Security and rollback

- Private SSH keys stay on the developers' computers. The Cloudways API key lives only in `public_html/gitautodeploy.php` on the server (not in Git). The webhook answers `403` without the correct Secret. Cloudways reads the repo through a Deploy key without write access.
- Scripts write only to `local` and `dev` (and environments listed in `WRITABLE_ENVS` in `.deploy/environments.conf`, e.g. `staging`). **prod** and any other name are blocked. Code reaches PROD only from `PROD_BRANCH`.
- A `deploy/*` branch contains only the paths from `.deploy/targets`, so a Pull does not touch third-party plugins or `uploads`. `files-sync` does not touch server-only plugins (Breeze etc.) either.
- Do not edit theme files on the server by hand: a Pull may stop on a conflict with local changes.
- Error before the table swap → DEV unchanged ("target 'dev' not changed"). The swap is atomic. After it only cache
  flush/hooks remain; if they fail, the script says "NOT finished", lists them, and prints two fixes: run the same
  command again (safe) or the rollback command. SSH failures are named as such ("The SSH connection failed").
- At the end `db-sync` checks the result (site URL on the target, leftover sync tables, missing media) and prints
  either "Done: … Checked: …" or "NOT everything is in place" with a fix for each item.
- `files-sync` re-checks after copying. If anything is still missing it prints "NOT everything was transferred",
  the folder and the reason, and exits with code 1 — run the same command again (only the missing files are sent).

**DB rollback on DEV:**
```bash
ssh app_user@IP
cd public_html
ls ../private_html/db-backups/
gunzip -c ../private_html/db-backups/dev-before-local-YYYYMMDDHHMMSS.sql.gz | wp db import -
wp cache flush
```
**Code rollback:** `git revert` → push to `DEV_BRANCH` (or `PROD_BRANCH`) → Actions builds and Cloudways pulls the previous state.
**Backup cleanup:** `find ../private_html/db-backups -mtime +30 -delete`.

---

## 9. Problems and fixes

| Symptom | Fix |
|---|---|
| `ID conflict: N records…` | DEV has orders/entries created before the first push with the ID gap, or pages were created directly on DEV. Test data → add `--with-transactional`. Real data → move the conflicting pages by hand. |
| `Writing to 'X' is blocked` | Only `local`, `dev` and `WRITABLE_ENVS` can be written to. prod is never a target (not even through `WRITABLE_ENVS`). |
| db-sync: `ERROR 1030 … Got error 23 "Too many open files in system"`, `MySQL server has gone away`, `Class "Phar" not found`, `PHP Startup: Unable to load dynamic library … cannot open shared object file`, `exec request failed on channel 0` | The server (not the script) ran out of resources for a moment. Before the table swap DEV is not changed, and db-sync waits and tries again by itself (3 attempts, 1 and 2 minutes apart, one backup). If all attempts fail, it prints the first and the last error and a ready message for the sysadmin with the server (SSH address, app folder, site). The open-file limit is server-wide, so the cause is often **another app on the same server** (e.g. stuck cron or queue workers): the sysadmin / Cloudways support checks `cat /proc/sys/fs/file-nr` (open / free / max), finds the process holding the files, stops it, and raises `fs.file-max` or restarts the services (Server → Manage Services). Until then, push the DB when the server is less busy. |
| files-sync: `Local wp-content/X is missing or empty — with --delete …` | Protection: `--delete` with an empty source would wipe the folder on the target. Pull the folder first or run without `--delete`. |
| A translated site shows English strings on DEV | Translations are files: `bin/files-sync.sh local dev languages`. |
| In `deploy/dev` or on DEV the theme folder is empty; `git status` shows `modified: themes/x (modified content)` | The theme has its own `.git` — the repository holds only a reference. `bash bin/theme-check.sh --detach-git themes/x -y` (it also removes the old reference), then `git add themes/x`, commit. |
| SSH: `Shell access is disabled !` | The key is accepted, but Application Settings → **SSH Shell Access** is off — ask the sysadmin to turn it on. |
| `bin/setup.sh`: "No access to DEV yet" / `Permission denied (publickey,password)` | The key `~/.ssh/id_ed25519.pub` ([where to find it](#ssh-key-where-to-find-it)) is not yet added to this application's Application Credentials, or SSH is off for the application (Application Settings → SSH Access). |
| On DEV "Sorry, you are not allowed…" | Check `wp config get table_prefix` on both sides and rerun the script. Rollback — from the backup. |
| A plugin does not work on DEV after a push | Its files are not on the server: `bin/files-sync.sh local dev plugins`. |
| Webhook: `403 Signature mismatch` | The Secret in GitHub (Webhooks) ≠ `WEBHOOK_SECRET` in `gitautodeploy.php`. |
| Webhook: `500 Not filled in …` | Fill in the constants in `public_html/gitautodeploy.php` on the server. |
| Webhook: `502 Cloudways API … HTTP 401/422` | 401 — `CW_EMAIL` / `CW_API_KEY`; 422 — `SERVER_ID` / `APP_ID` / `GIT_URL`, or Deployment via Git is not connected to `deploy/dev`. |
| Webhook: `202 Skipped: push to refs/heads/<DEV_BRANCH>` | Normal: the Pull comes with the next delivery, when Actions pushes `deploy/dev`. If there is none, check that Actions is green and that the release had changes. |
| Actions green, but DEV shows old content | GitHub → Webhooks → Recent Deliveries (the response to the push to `deploy/dev`), then Cloudways → Deployment via Git → log; often the cause is manual file edits on the server. Then Breeze/Varnish → Purge. |
| Actions: `push … denied` / 403 | Settings → Actions → General → Workflow permissions → Read and write → Save (in an organization, first in the organization settings), then Re-run. |
| Push done, but Actions → Deploy: job `deploy` **Skipped** | The branch does not match `DEV_BRANCH` / `PROD_BRANCH` in `.deploy/environments.conf` (the `route` job log says which one is expected). Fix it and commit. |
| Actions: `DEV_BRANCH and PROD_BRANCH are the same` | They must differ in `.deploy/environments.conf`; with no PROD use `PROD_BRANCH=""`. |
| Actions: "PHP syntax check" failed | The code uses newer PHP syntax than `PHP_MIN`. The log shows the file and line; rewrite for `PHP_MIN` (or raise `PHP_MIN` if every environment is already newer). |
| Actions: `… is not in PROD_DEPLOYERS` | Someone outside the list pushed to `PROD_BRANCH`. The PROD deploy is cancelled; the merge must be done by someone on the list. |
| GitHub: `Key is already in use` (Deploy key) | This Cloudways key is already a Deploy key in another company repository (one key = one repository across all of GitHub). Remove it there if that project is inactive; otherwise create a separate bot account in the organization with the Read role on the repositories and add the key to its SSH keys. |
| 403 / files not updated | Cloudways → Application Settings → **Reset Permission**, then Breeze → Purge. |
| Multisite | Not supported: `db-sync` stops with "Multisite is not supported". |

---

## 10. The wp-dev-kit: new project and updates

Everything in this README is one set of files, carried from project to project as the archive `wp-dev-kit-<version>.zip`.

| What | Behavior on install/update |
|---|---|
| **Kit files:** `bin/`, `.claude/skills/`, `.claude/settings.json`, `.github/workflows/deploy.yml`, `.deploy/profiles/`, `.deploy/rsync-exclude`, `.deploy/templates/`, `.deploy/server/`, `.deploy/KIT_VERSION`, `mu-plugins/environment-guard.php`, `README.md`, `CLAUDE.md`, `.env.example` | copied **with overwrite**; your own extra profiles/skills next to them are not deleted |
| **Project files:** `.gitignore`, `.deploy/targets`, `.deploy/environments.conf`, `.deploy/sync.conf` | created from templates **only if they do not exist yet**; never overwritten |

Do not put notes about a specific project into the kit's `README.md` / `CLAUDE.md` — they are overwritten on update. Use `PROJECT.md` for that (your own file; add `!/PROJECT.md` to `.gitignore`).

**New project:** unpack the archive → Claude Code in the `wp-dev-kit` folder → `/wp-init` ([section 3](#3-project-start-wp-init-in-claude)).

**Update the kit in an existing project** — the same `kit-install.sh` from a newer archive or straight from another project with a newer kit:
```bash
bash "$HOME/Local Sites/<newer-project>/app/public/wp-content/bin/kit-install.sh" "$HOME/Local Sites/<this-project>/app/public/wp-content"
```
Then `git diff` → review → commit. Developers get the update via `git pull`.

### What the kit does (1.0.0)
- **Sysadmin and Cloudways:** the developer does nothing in the panel — `/wp-init` writes two ready messages for the sysadmin (access; deploy after the first push). Section "SSH key: where to find it".
- **Commit and push:** Claude asks every time, "Claude commits and pushes" / "I'll do it myself"; it commits only the files it showed and pushes only to `DEV_BRANCH`.
- **Database to DEV:** a choice of "Keep DEV users (Recommended)" / "Full, with users" (`--with-users` shows admins after the move and those who will lose access) / "Content only".
- **Rank Math:** sync profile (redirects are moved; logs, analytics and the Google connection stay).
- **Ready-made themes:** `bin/theme-check.sh` (own `.git`, build, composer, child themes, large files), "Ready-made theme from GitHub" in `/wp-init`, Node for the build from `.nvmrc` (default 22). Projects where DEV already has a site.
- Documentation: daily work as "code separately, data separately"; `files-sync.sh` without `-y`.
- **Safe data moves:** the DB table swap is the only moment the target changes (everything is prepared in staging
  tables first); `files-sync` re-checks after copying; both name what did not finish and how to fix it.
- **Data correctness:** column/key names and text in posts are never renamed; case-sensitive columns keep their
  collation; missing plugin tables are created empty; the ID counter is reset on pull; `languages` and `fonts` move
  with files; WooCommerce order storage (HPOS) and cache plugin settings stay on DEV; multisite is refused.
- **Only chosen pages:** `bin/pages-sync.sh` (also `db-sync.sh --pages=…`) moves only the named pages/posts/products
  with everything they show — images and files, reusable blocks, Elementor templates, categories/tags, product
  variations, missing parent pages. Dry-run plan, conflicts stop everything, one transaction, undo with `--rollback`.
- **Busy servers:** db-sync keeps orders/entries/notes created on DEV during the move, stops if a plugin list cannot be
  read, and retries a short-lived server failure ("Too many open files", "MySQL server has gone away") by itself;
  helper files go to the server over `ssh` (Cloudways locks SFTP/`scp` into the app folder).
- **Guards:** `files-sync --delete` refuses an empty or missing local folder; `WRITABLE_ENVS` never opens `prod`;
  `init-project` refuses equal DEV/PROD branches; `theme-check` works before `git init`, blocks a theme that is in
  `.deploy/targets` but ignored by `.gitignore`, and picks Node like CI (CI warns when themes want different versions).

### Test run of all stages
To test the kit from scratch you need a **new site in Local**, an **empty repository** on GitHub (you invited with Write) and a **new Cloudways application** (sysadmin). Then, step by step, ticking off:
1. Archive: `bash bin/kit-pack.sh ~/Downloads` → unpack → Claude Code in `wp-dev-kit` → `/wp-init` → "New project (empty repository)".
2. GitHub: link → `gh` (install, `gh auth login`), Write access, repository empty.
3. Access: SSH key → **sysadmin message #1 (access)** → `Shell access` → Claude reads the path, PHP and DEV address.
4. Theme: starter **or ready-made** (own `.git`, `dist/`, `composer.json` — `theme-check.sh` must find and fix these).
5. Plan → "yes" → `init-project.sh`, `WP_ENVIRONMENT_TYPE`, `git init`, check of the staged files (only the kit and themes).
6. Commit and push: choice of "Claude commits and pushes" / "I'll do it myself" → Actions green → `deploy/dev` contains only themes/plugins.
7. **Sysadmin message #2 (deploy)** → Deployment via Git (`deploy/dev`, `wp-content`) → webhook (the kit's `gitautodeploy.php`, or `branch_name=deploy/dev&deploy_path=wp-content` for the old Cloudways script).
8. DEV check: the theme is there, no service files, `.git` returns 403.
9. Auto-deploy: change in the theme → push → on DEV within 1–2 min.
10. Data: files-sync (dry-run → yes) → db-sync with "Keep DEV users (Recommended)" → DEV opens, DEV admins are in place.
11. Optional: `--with-users` dry-run (list of admins), the Rank Math profile (`Profiles: seo-by-rank-math` in the dry-run), "Join a project (code already on GitHub)" from a second Local site.

**Pack the archive from your project** (if you improved the scripts and want to share them):
```bash
bash bin/kit-pack.sh ~/Desktop        # → ~/Desktop/wp-dev-kit-<version>.zip
```
Theme names and server addresses of the project do not go into the archive — clean templates are packed instead of the project files. Before packing, bump the version in [.deploy/KIT_VERSION](.deploy/KIT_VERSION).
