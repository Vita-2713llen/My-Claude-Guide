---
name: wp-deploy
description: Explain and check code deployment (GitHub Actions → branch deploy/dev → webhook → Cloudways Deployment via Git). Use for "what will deploy", "did the deploy work", "deploy failed", "why is dev not updated", "webhook returns 403/500/502". Never deploys by itself.
---

# wp-deploy

Code reaches Cloudways only this way: push to `DEV_BRANCH` (or `PROD_BRANCH` for prod; both in
`.deploy/environments.conf` — read them, names differ per project) → workflow `Deploy` (job `route` maps the
branch, job `deploy` builds) →
`bin/release.sh` builds the release → commit to `deploy/dev` → GitHub webhook → `public_html/gitautodeploy.php`
(template `.deploy/server/gitautodeploy.php`) → Cloudways API `git/pull` of `deploy/dev` into `wp-content`.
You never run rsync/SSH deploys. You inspect and explain; a commit + push of a fix only via the
"Claude commits and pushes" choice (CLAUDE.md rule 4), never to `PROD_BRANCH` or `deploy/*`.

## "What will deploy"
1. `tmp=$(mktemp -d)` and `bin/release.sh "$tmp" --no-build`.
2. `find "$tmp" -type f | sed "s#^$tmp/##" | sort` → show the list (group by theme/plugin, count files).
3. Point out: anything unexpected (big files, `.map`, `node_modules` should be absent), and that `dist/` /
   `vendor/` will be built in CI (not present with `--no-build`).
4. To compare with what is on DEV now: `git fetch origin deploy/dev` and
   `git ls-tree -r --name-only origin/deploy/dev` (the last deployed release), then diff the two file lists.

## "Did the deploy work" / "deploy failed"
With `gh` (ask the user to run `gh auth login` if needed):
1. `gh run list --workflow=Deploy --limit 5`
2. `gh run view <id> --log-failed` (or `--log` for the last one).
Map the result:
| Log says | Meaning / fix (user does it) |
|---|---|
| no new commit on `deploy/dev` ("No changes in the release") | nothing to pull; the change is outside `.deploy/targets` |
| `push … denied` / 403 | Settings → Actions → General → Workflow permissions → Read and write |
| `<path> is not in the repository` | `.deploy/targets` lists a path that is not in Git |
| step "PHP syntax check" failed | code uses syntax newer than `PHP_MIN`; the log shows file:line — rewrite for `PHP_MIN` |
| job `deploy` Skipped | the pushed branch is neither `DEV_BRANCH` nor `PROD_BRANCH` (see job `route` log) |
| `… is not in PROD_DEPLOYERS` | a `PROD_BRANCH` push by someone not in the `PROD_DEPLOYERS` variable; PROD untouched |
| composer: lock file not compatible | `composer.lock` needs a newer PHP than `PHP_MIN`; set `config.platform.php` to `PHP_MIN`, `composer update` |
| npm/composer errors | build problem in that theme/plugin — debug it locally |
| green, but DEV shows old code | check the webhook (below), then Cloudways → Deployment via Git log; manual edits on server; Breeze purge; Varnish off |

Without `gh`: ask the user to open GitHub → Actions → Deploy → last run, and paste the failing step log.

## Webhook
The user checks GitHub → Settings → Webhooks → the hook → Recent Deliveries → Response of the delivery for the
`deploy/dev` push (or `gh api repos/{owner}/{repo}/hooks` then `.../hooks/<id>/deliveries` with permission).
| Response | Meaning / fix (user does it on the server or in GitHub) |
|---|---|
| `200 pong` / `200 Pull … started` | OK |
| `202 Skipped: push to refs/heads/<working branch>` | normal; the Pull comes with the next delivery (`deploy/dev` push by Actions) |
| `403 Signature mismatch` | webhook Secret ≠ `WEBHOOK_SECRET` in the server copy |
| `500 Not filled in: …` | constants in `public_html/gitautodeploy.php` not filled |
| `502 … HTTP 401` | `CW_EMAIL` / `CW_API_KEY` wrong |
| `502 … HTTP 422` | `SERVER_ID` / `APP_ID` / `GIT_URL` wrong, or Deployment via Git not set to `deploy/dev` |
| 404 / timeout | file not in `public_html`, wrong domain in Payload URL, or app password protection on |

Never ask for or print the API key or webhook secret; never edit the server copy yourself.
