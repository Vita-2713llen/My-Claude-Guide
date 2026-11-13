---
name: wp-setup
description: Refresh a developer's Local site from DEV and diagnose SSH access to Cloudways. Use for "refresh my local from dev", "update my local", "I have no access to dev", "Permission denied (publickey)". First-time setup / joining a project is the wp-init skill.
---

# wp-setup

`bin/setup.sh` does everything: checks Local/WP-CLI/PHP 8+ (and warns if local or DEV PHP is below `PHP_MIN`), creates `~/.ssh/id_ed25519` if missing,
tests SSH to DEV, and if access works pulls files + DB from DEV (asks y/N; `-y` skips the question).

Labels and messages below are written in English; show/send them in the user's language.

## Procedure
1. Check the repo exists: `git rev-parse --is-inside-work-tree` in `wp-content`. If not → skill `wp-init`.
2. Run `bash bin/setup.sh </dev/null`. It loads Local's environment itself and does the checks; if it reaches
   the y/N question, EOF cancels it safely before anything is pulled. "The Local site is not running" → the user
   presses Start site in Local.
   Read the output:
     - "No access to DEV yet" → show the public key line (`cat ~/.ssh/id_ed25519.pub`) and its path
       `~/.ssh/id_ed25519.pub` (README "SSH key: where to find it"), and give a ready
       message for the sysadmin (README "Cloudways is done by the sysadmin", sysadmin message #1 (access)): add it in Cloudways →
       Application Credentials → SSH Keys; SSH Shell Access on. Stop.
     - "The team lead has not filled in .deploy/environments.conf yet" → the lead must fill it and push; user runs `git pull`.
     - "DEV access OK" → explain what will be pulled (uploads, third-party plugins/themes, DB without DEV
       users/orders), ask for yes, then run `bash bin/setup.sh -y`.
3. After success: tell the user to open the site — admin bar must show the green **LOCAL** badge.

## SSH diagnostics (read only)
`ssh -v -o BatchMode=yes <DEV_SSH> true 2>&1 | tail -20`
- `Permission denied (publickey)` → key not added for this app's credentials, or SSH for the app is off
  (Application Settings → SSH Access), or the key has a passphrase not loaded (`ssh-add`).
- `Connection timed out/refused` → IP whitelist in Cloudways (Server → Security → Shell Access).
- `Host key verification failed` → server was rebuilt; after the user confirms, remove the old line with
  `ssh-keygen -R <ip>`.
Never create a new key if one exists; never print the private key.
