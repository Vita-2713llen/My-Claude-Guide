# Moving the site somewhere else

Open this when a finished port has to leave the machine it was built on — to a
development server, to a staging domain, or to the client's hosting.

Everything here is about the crossing itself. What to delete, rename and
configure before the client logs in is "Hand the site over clean" in `SKILL.md`.

---

## Ask which way it travels. Do not pick one.

**This is the first question, and it is asked, not assumed.** Two routes are in
common use, they fail differently, and half the rules below apply to only one of
them. Put it in the options dialog:

> **Чим переносимо сайт?**
> · **All-in-One WP Migration** (або інший плагін експорту) — сайт стає файлом
> · **Мігратор хостингу** (Cloudways та подібні) — забирає сайт по адресі
> · **Вручну** — файли плюс дамп бази

| | Export plugin | Host's migrator |
|---|---|---|
| What it needs | somewhere to click Export, and the file | a **public address** it can reach |
| A local site therefore needs | nothing | a **tunnel**, and `siteurl`/`home` pointed at it |
| Who rewrites the address | the plugin, on import | the migrator, from what it was given |
| The address it rewrites | the one in the archive | **the tunnel's**, not the site's own |
| Usual failure | the upload limit | the tunnel trap, below |
| Basic auth on the source | not involved | needs the migrator's own field for it |

**The answer changes the plan, so get it before planning.** A run that assumes a
tunnel on a project using an export file wastes the tunnel work; a run that
assumes an export file on a hosting migrator walks straight into the trap that
has its own section below.

**Ask once per project and write it down** — the next move will use the same
route, and so will the one after the client asks for a staging copy.

---

## What is true on every route

### The theme travels as files

Check on the far side that the theme folder has contents, and separately that it
is the **active** one. The two fail separately, and a site that looks unstyled
says nothing about which of them went wrong.

Scaffolding into `wp-content` keeps this uneventful: there is nothing to detach
and nothing to put back, and the export copies real files because real files are
all there are.

**It is only a trap where the theme is a link** — an older project, or one set up
before that rule. The export walks the link, finds a folder, copies nothing, and
the theme arrives **empty**: WordPress finds no templates and serves a white page,
with nothing in any log to say why. Replace the link with the real folder before
exporting, and put it back afterwards. On Windows `mklink /J` restores it without
administrator rights; the PowerShell symbolic-link form needs them.

### The old address is in the database hundreds of times, and some of those rows are serialised

A serialised value records the **byte length of every string inside it**. Replace
`http://project.local` with `https://project.com` as plain text and every length
in that row is now wrong, so WordPress cannot unserialise it and the whole option
is dropped — silently. A plugin's settings, a social profile, a slider's slides,
gone with no error anywhere.

So the replacement is made by something that understands serialisation:

```
wp search-replace 'http://project.local' 'https://project.com' --all-tables --precise
```

or by a script that unserialises, replaces, serialises again. **Never by SQL**,
and never by a text editor over a dump.

Count the occurrences before and after, and **search again afterwards to prove it
is zero**. A replacement that reports success is not a replacement that happened.

### Anything that records where the site *was* is excluded from the replacement

If the move keeps a copy of the original address so it can be undone, that copy
is itself a row holding the old address. A replacement across all options
overwrites it, and the restore then puts the tunnel back as the tunnel.

Worse, a bootstrap guard that checks "is this the site I think it is" stops
recognising its own site and refuses to run anything — including the script that
would undo the damage. Exclude every such row by name, and keep the escape route
outside the database if the project has one.

### Check the deepest page, never the front page

A page built by the theme addresses its media by attachment id, and the theme
prints the current site's URL at render time. It looks perfect on any domain.

A post written in the editor is `core/image` and `core/video` blocks, and those
keep an **absolute URL in `post_content`**. On one port every page was clean and
every one of the six posts carried seven stale URLs, so three clips and six
photographs on each post simply did not load — `error: 4`,
`MEDIA_ELEMENT_ERROR`, and a front page that looked flawless.

So: open a post, not the home page. Open the one with the most media in it.

### One false alarm not to spend time on

Images below the fold report `naturalWidth === 0` because they are lazy and have
not arrived yet. Fetch the file and read the status instead — a 200 means the
image is fine and the measurement was wrong.

---

## The tunnel trap — host migrators only

🔴 **A migration replaces the address the site really carries in its database,
not the one it was opened at.**

A hosting migrator needs to reach the source over the public internet. A local
site has no public address, so it is exposed through a tunnel and `siteurl` and
`home` point at the tunnel for the duration.

**The migrator therefore sees the source as the tunnel address and replaces
that one.** Every link, image and video an editor typed into a post still holds
the original development host — which was never the tunnel address, which the
migrator has no reason to touch, and which is left exactly as it was.

The pages come out clean and the posts come out broken, for the reason in "Check
the deepest page" above.

### So the order has three steps, not two

1. point `siteurl` and `home` at the tunnel;
2. **replace the development address with the tunnel address inside the
   content**, serialisation-safe — this is the step that gets skipped;
3. put the theme in as files.

Then migrate. Afterwards, reverse all three.

**Both of the first two have to be repeated on every new attempt.** A failed
transfer usually gets rolled back, and the rollback puts the development address
back where it was.

### If it was migrated without step 2

Run one more serialisation-safe pass on the far side, against the **development**
address this time:

```
wp search-replace 'http://project.local' 'https://project.com' --all-tables --precise
```

### Two habits that make this cheap

**Count the development host's occurrences in `post_content` before migrating**,
and know that the migrator will not touch them. A number printed by the
preparation script is only useful if somebody reads it.

**A tunnel with its own basic auth needs the migrator's field for it** — usually
labelled "HTTP authentication". Without it the transfer fails with an error that
names something else entirely, and the time goes into the wrong question.

---

## Verify after the move, deliberately

Not by looking at the front page. Each of these has failed on its own:

- [ ] the theme folder is not empty **and** that theme is active
- [ ] the database holds **zero** occurrences of the development host — searched,
      not assumed
- [ ] a post with media in it renders, every file 200
- [ ] uploads are served, including anything the theme prints from its own folder
- [ ] the forms send to the client's addresses, not to whatever was used for
      testing — and nothing is sent while proving it
- [ ] `siteurl` and `home` are the real domain, not the tunnel
- [ ] on the development machine: the theme link is back, and the address is back

---

## Redirects from the old site, and the three ways they go wrong

**The old addresses outlive the old site.** They are in bookmarks, in emails, on
other people's pages and, above all, in the search index — and every one of them
starts hitting the NEW site the moment it takes the domain. Without redirects
they 404, and whatever the old page had earned in search goes with it. This is
launch work, and it is cheap if it is not left to the day itself.

**The client decides where each one lands; you supply the addresses.** Ask for
their list — most organisations have one, as a spreadsheet of old URL against the
name of a page. Names are what they think in, and a redirect needs a path, and
that translation is the whole job.

Three rules beat the list, and each is a measurement rather than a reading:

- **A file is still a file.** An importer that kept the old tree means
  `/images/x.pdf` is now `/wp-content/uploads/<prefix>-images/x.pdf`. Look the
  attachment up before promising it; the ones that did not come across fall back
  to the page the client named.
- **An address ending `<id>-<slug>` names one record.** Joomla and its kin put the
  id in the URL, and a decent importer remembers it on the record. Then a webinar
  address lands on that webinar rather than on a listing. **Check which key
  actually holds it** — on one site the obvious one sat on 520 *trashed* rows and
  resolved nothing, while the live records carried the ids in a different field
  entirely. One lookup tells you; guessing costs a day.
- **The old site still answers**, so ask it instead of guessing. Fetching its own
  form URLs returned their real destinations and corrected a guess of mine that
  was pointing at a different form on a different host.

🔴 **A redirect whose target carries the development host is worse than none.**
Rank Math's panel expands `/about-us/` into `https://dev.example.com/about-us/`
as you save it — so every redirect made by hand on staging points at staging for
ever. Write paths, and check the table afterwards for the host.

**Its CSV import is a PRO feature**, so for anything above a handful the route is
a script writing to the plugin's own table. Insert `sources` as the serialized
array it uses, read one row the panel made to learn the exact shape rather than
guessing it, and empty the plugin's match cache when you are done.

**Redirects live in the database.** They do not travel with a git deploy. If the
production site is a fresh install rather than a copy of staging, the same import
has to run there — which is reason enough to keep the CSVs.

---

## A hand-upload can stop the deploy for ever

**Before putting a file on a server by hand, find out how that server receives
code.** Two mechanisms look identical from outside and behave in opposite ways:

- **a checkout in place** — `.git` inside the site, and a pull updates the files
  where they are. A changed tracked file, or an **untracked** one however
  identical its content, aborts the merge. Permanently: every later push is
  refused too, silently, and the site simply stops updating;
- **a clone plus a copy** — the host pulls into a folder of its own and copies
  the files in. A copy cannot be blocked by anything lying in the site.

🔴 **Do not assume the repository is rooted where yours is.** A whole evening went
into a theory built on that assumption; the server had no `.git` anywhere near the
site, and the real clone sat beside it in a folder nobody had mentioned.

**Date the last successful deploy from inside.** Whole groups of files sharing one
exact second are a copy running; a lone file between them is somebody's upload.
That dates the breakage better than any header. And `.git/logs/HEAD` — git's own
diary, one line per move with a timestamp — is the thing that finally settles it.

**Give any commit whose arrival matters a version bump** in the theme header. It
costs nothing and turns "did it deploy?" into one request from outside.

---

## Your own one-off admin scripts get cached

**A page cache does not know your diagnostic script is a diagnostic script.** A
read-only tool opened at the site root was served from Varnish half an hour later,
unchanged, and a theory was built on its stale numbers before anybody noticed.

🔴 **Print the current time at the top of every one of these, and read that line
first.** If it is not now, nothing below it is now. Open them with a fresh
`?nc=<number>` every time, and keep the number different before and after
`&apply=1`.

---

## Related

- The `<head>`, canonical and Open Graph work belongs to Step 11 of `SKILL.md`;
  a move changes every absolute URL in it.
- Redirects from an old indexed site belong to launch, not after it — "Hand the
  site over clean".
- `templates/bootstrap.php` carries the database-identity guard mentioned above.
  It is what refuses to run against the wrong site, and what has to be told the
  site legitimately moved.

## The ordinary case: a change that is only partly code

This file is about moving a whole site. The frequent case is smaller and has the same
failure mode — **naming only the part that happens to be in the repository**.

Say which of the three a change touches, in the handover note, every time:

| | travels by |
|---|---|
| theme and plugin code | `git pull` |
| options, post meta, rewritten content | nothing |
| anything under `uploads/` | nothing |

For the parts that are not code, the convention that works is a **self-deleting script**
placed beside `wp-load.php` and opened in a browser as an administrator. It:

- **recomputes its plan from the target's own database** rather than carrying a list — the
  target has its own ids, its own content and its own uploads, so a list made elsewhere is
  a list of the wrong records
- **refuses to run** when the code half has not arrived, and says which is missing
- is **safe to run twice**: work already done is skipped, not repeated
- **re-checks its preconditions at the moment of acting**, because a live database moves
  between the looking and the doing
- shows its plan with no arguments, and acts only with `?go=1`

Then give the person the verification as **addresses to open**, not as a description of
what should be true.

### The caching layer is part of the deliverable

Where "remove unused CSS" is switched on, the stylesheet a visitor gets was compiled from
the markup **as it was when the cache was built**. Any change to markup invalidates it, and
the result does not look like a stale cache — it looks like a site with no CSS at all.

Two things to know before anyone starts reading code:

- **Clearing the cache and clearing the used CSS are different actions.** Clearing the cache
  rebuilds the HTML and re-inlines the same stale CSS, so the obvious button appears to do
  nothing and the designer presses it twice.
- **The one-command diagnosis:** request the page, then request it again with a meaningless
  query string appended — a URL the cache will not serve. If the second is correct and the
  first is not, nothing is broken and a stored copy is stale. Compare the two for stylesheet
  links, for an inlined `<style>`, and for `X-Cache` / `Age` in the headers.

Put the cache purge in the deploy note itself, both actions, in order — it is needed after
**every** deploy that changes markup, not once.
