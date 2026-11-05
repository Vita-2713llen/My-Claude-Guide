# qa-check · installation (v2.2)

The skill is generic: it carries no site, client, project or person. Everything project-specific lives in
the project's own `qa-target.json`. The same skill version measures the same way on macOS, Windows and Linux.

`<skill>` below is the folder that holds this file (Claude Code prints it as the skill's base directory):
macOS / Linux `~/.claude/skills/qa-check`, Windows `%USERPROFILE%\.claude\skills\qa-check`
(PowerShell: `$HOME\.claude\skills\qa-check`).

## 1. Copy the skill

Distribute only `SKILL.md`, `INSTALL.md`, `references/` and `scripts/` **without** `scripts/node_modules/`.
Never ship `*.bak*` files, dot-folders (tool caches), `.qa-state.json`, `qa-target.json`, `qa-out/` or
`results-*.json` — those are per-project or obsolete. Replace an older copy completely.

Before packing, the person who distributes the skill runs the release check. It fails on backups, caches,
per-project files, an invalid or over-long SKILL.md frontmatter (YAML; description ≤ 1024 characters), real
home-folder paths, e-mail addresses and URLs outside the example domains — and on
every word of a private deny list (client, project, brand and person names) that is kept **outside** the
skill, so the names themselves never ship:

```
cd ~/.claude/skills/qa-check/scripts
node release-check.cjs --deny ~/qa-check-deny.txt        # one name per line; without --deny the generic checks only
cd ~/.claude/skills
tar --exclude='node_modules' --exclude='*.bak*' --exclude='.*' -czf qa-check.tgz qa-check
```

(Windows 10+ has the same `tar` in PowerShell: run it in `$HOME\.claude\skills` with the same flags.)

Keep backups of `SKILL.md` **outside** the skill folder (for example `~/.claude/skills-archive/qa-check/`),
so no agent ever greps an old rule set from inside the skill.

## 2. Requirements

- Node `^20.19` or `>=22.12` (`node -v`; the current LTS 22 or 24 is recommended), npm `>=10` (`npm -v`).
- About 1 GB of free disk for the browser builds.

## 3. Install the instruments — once per machine, no global packages

`npm ci` installs exactly the versions in `package-lock.json` (Playwright, cspell, Lighthouse, the iOS
inspector), so every machine runs the same builds. Never copy `node_modules` from another machine, and
never run `npm install <package>` here — the only exception is the person who distributes the skill adding a
cspell dictionary for the whole team (`references/instruments.md` → NOT RUN → TEXT-02).
npm 11 may print `allow-scripts … appium-ios-tuntap` — harmless: that native part is only for physical
iOS devices, which the skill does not drive.

### macOS

```
cd ~/.claude/skills/qa-check/scripts
npm ci
npm run browsers
```

A person (not the agent) does these once, for the macOS-only rows:
- Safari → Settings → Advanced → Show Develop menu → Develop → **Allow Remote Automation** (XB-02, `safari-real.cjs`).
- Xcode from the App Store, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`,
  `sudo xcodebuild -runFirstLaunch`, `xcodebuild -downloadPlatform iOS` (XB-03 / LAY-09, `ios.cjs`).
- Microsoft Edge (XB-04, a HARD row) — `qa-run` uses it automatically when it is installed; without it the row is
  NOT RUN and is routed to a machine that has Edge (e.g. any Windows laptop).

### Windows (PowerShell)

```
Set-Location "$HOME\.claude\skills\qa-check\scripts"
npm.cmd ci
npm.cmd run browsers
```

`npm.cmd` / `npx.cmd` avoid the PowerShell execution-policy block on `npm.ps1`. Edge is preinstalled, so
XB-04 runs. Real Safari and the iOS Simulator do not exist on Windows: `safari-real.cjs` and `ios.cjs` still
run (in seconds) and write XB-02, XB-03 and LAY-09 as NOT RUN with a route (a Mac in the team, a rented Mac,
a real-device cloud), never as passed.

Claude Code on Windows runs its Bash tool in **Git Bash**, so the agent uses the bash form of every command
with `S="$(cygpath -m "$HOME/.claude/skills/qa-check/scripts")"` (a `C:/Users/…` path that Node reads
either way). Put `MSYS_NO_PATHCONV=1` before any command that takes `--pages "/,/about/"`, or list the
pages in `qa-target.json` instead.

### Linux

```
cd ~/.claude/skills/qa-check/scripts
npm ci
npm run browsers
sudo env "PATH=$PATH" npm run browsers-deps   # a person runs this once: system libraries for WebKit and Firefox
                                              # (env PATH keeps nvm's node visible to sudo)
```

Without `browsers-deps` WebKit and Firefox do not start; XB-01, XB-08 and FORM-07 then show NOT RUN with
the reason. Safari and the iOS Simulator are macOS-only (routed, as on Windows).

## 4. Check the install

```
cd <skill>/scripts
npm test               # self-test of the instruments on local fixtures (127.0.0.1 only, no internet site)
npm run registry       # the check registry loads and is consistent
```

`npm test` takes about 5 minutes per run (two runs, Chromium only); `node selftest/run.cjs --all` adds
WebKit and Firefox. It ends with `SELFTEST PASS` — anything else means the install is not usable yet.

## 5. Per project

Everything runs from the **project folder** (the folder that holds `.qa-state.json`), never from the skill
folder; the scripts are called by their full path.

```
cp <skill>/scripts/qa-target.example.json qa-target.json          # Windows: copy …\qa-target.example.json qa-target.json
```

Fill `base`, `staging`, `decisions.projectType` and `decisions.englishVariant` before the first run — the
instruments refuse to guess them. Every key is described in `references/instruments.md`. Share
`qa-target.json` with the colleague who runs the same project, so both runs use the same rules. Add
`qa-out/`, `.qa-snapshots/` and `.qa-state.json` to the project's `.gitignore`.

Then, in Claude Code: `/qa-check` (the menu) or `/qa-check 2`. The agent follows the protocol at the top of
`SKILL.md`: snapshot → qa-run → spell → lighthouse → safari-real → ios → platform admin audit
(WordPress: `wp-admin-cfg.cjs` + `wp-admin-audit.js`) → person rows (record) → manifest → report from
`manifest.json`, and for the QA handoff `handoff.cjs`. Stage 1 (the local HTML build) adds
`--local <build folder>` to snapshot, qa-run, safari-real and ios, and skips Lighthouse and the admin audit.

## 6. Environment variables (all optional)

| Variable | Effect |
|---|---|
| `CHROME_PATH` | use this Chrome binary (only when the file exists) |
| `QA_USE_SYSTEM_CHROME=1` | measure with installed Google Chrome instead of the pinned bundled Chromium |
| `EDGE_PATH` | Microsoft Edge at a non-standard path (XB-04) |
| `QA_HTTP_USER` / `QA_HTTP_PASS` | basic-auth of a gated staging — **set by a person in their own terminal**, never typed by the agent |
| `QA_NO_LOCK=1` | disable the one-heavy-tool-at-a-time lock (the override is recorded in the results) |
| `QA_ALLOW_SKILL_OUT=1` | allow an output folder inside the skill (tests only) |
| `PW_PATH` | use another Playwright install |
| `QA_RELEASE_DENY` | path of the private deny list for `release-check.cjs` (instead of `--deny`) |

Same site + same `qa-target.json` + same skill version → the same manifest. If two manifests differ, compare
their headers: RUN-01 (snapshot) says what changed on the site, RUN-07 (run conditions) says what differed on
the machine or in the flags, and the status column shows which check one run did not execute.
