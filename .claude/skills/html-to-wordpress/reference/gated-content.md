# Content that is not for everybody

Open this the moment anything on the site is for some readers and not others: a members'
area, one block shown to signed-in people, a staff-only page, a post type not meant to be
browsed yet, a PDF behind a form.

A port guards what it can see — the page template, the block's render. Both are
**renderings**, and the same records are handed out by machinery that calls neither. Every
rule here is one way that was found open after the gate was believed finished.

---

## The gate belongs where records are CHOSEN

| Surface | What it answers with |
|---|---|
| the search page | titles and excerpts |
| `/wp-json/wp/v2/<type>` | the **whole content**, formatted |
| `/wp-json/wp/v2/<type>/<id>` | the same, by id — and **no query runs**, so a `pre_get_posts` guard never sees it |
| `/wp-json/wp/v2/search` | titles and links |
| feeds | content |
| core sitemaps, and the SEO plugin's own | addresses |
| `/wp-json/wp/v2/users` | every account that has published, with the slug each signs in with |
| a non-public CPT left `show_in_rest` | everything, to anybody |

Three hooks cover it:

- **`pre_get_posts`** — exclude the hidden ids from every collection. Skip `is_singular()`:
  the render guard can send a reader to sign in, where an exclusion can only produce a 404.
- **`rest_pre_dispatch`** — a single item fetched by id, answered with the same 404 a
  stranger is entitled to. Nothing about the record is said: not its name, not its size,
  not whether it exists.
- **`rest_endpoints`** — remove routes the front end never calls, for readers who cannot
  edit. Check what the editor needs first; it is a different reader.

**Work the exclusion out once per request and keep it.** Cache it by the ANSWER — the levels
or capabilities the reader holds — never by the user: one stored entry then serves every
signed-out visitor, including crawlers, and another serves every member. Invalidate on the
meta that decides it. *One run: 137 ms per request before caching, 0.6 ms after, on a stack
with two PHP workers where that is a share of a queue.*

**Verify from outside, signed out, by address** — not by reading the hooks:

```
/?s=<a word only the restricted records carry>
/wp-json/wp/v2/<type>?search=<the same>
/wp-json/wp/v2/<type>/<a restricted id>
/feed/
```

---

## A file under `uploads/` is public whatever the page says

The page can be perfectly gated while every file on it answers 200. This is not only a
membership concern: it is any document behind a form, and above all anything inherited from
a **legacy import**, where the old folder tree arrives intact and nothing on the new site
links to most of it.

Two facts worth having once:

- **`.htaccess` does nothing on nginx**, and nobody can promise what the host runs. A rule
  that silently does not apply is worse than none: the link still works and the page still
  says "members only".
- So the file **leaves the web root** and comes back through an endpoint that asks the same
  question the page asks. Keep the identifier opaque — an address spelling out
  `/2024/BoardDocs/` tells a stranger what exists.

The endpoint is short and the shape matters:

1. look the file up in a registry of path and condition — never take a path from the address
2. ask the one access function
3. a reader who may not have it, and an address that does not exist, get the **same** answer
4. resolve the path and prove it is still inside the private directory before reading it
5. `nocache_headers()`, the real content type, `X-Content-Type-Options: nosniff`,
   `X-Robots-Tag: noindex`

**Before handover: take one file a restricted record links to and fetch it with no session.**
If it arrives, the restriction is decorative. *One run: 580 restricted documents served
straight out of `uploads/`, plus a second complete copy of the same tree in
`uploads/backup/` that nothing linked to.*

---

## Two answers to one question is the defect, whichever one is right

Where a plugin already decides visibility, the theme must not decide it again. They drift,
and the symptom is a person admitted by one and refused by the other depending on what they
clicked.

**Look for the plugin's own filter before writing a second opinion.** A well-made plugin
ends its decision with one; answer it from the theme and the plugin stays as shipped, so an
update cannot undo the work. If it has none, say so in the report rather than quietly
shadowing it.

Inside the theme the same rule holds: **one function answers "may this reader see this"**,
and every guard calls it — the page redirect, the block filter, the query exclusion, the
file endpoint. When a second vocabulary exists (a plugin's level names against the theme's),
translate in **one table**, and check that table against the data: a name no record carries
means the translation never fires and the guard is decorative.

---

## Identify a special page by its role, not by its slug

Any theme that sends a reader somewhere — a log-in page, an account page, a listing a guard
falls back to — ends up with that page's slug written into PHP. **Renaming the page then
removes the behaviour silently**, and nothing in the editor suggests the page ever had it.

Three ways of knowing, in order: an id the site has settled on, a `role` meta on the page
itself, the slug only the first time. Store both when you find it.

*One run: renaming a guarded page published its contents.*

---

## Structured data describes the page, not the reader

Schema built from rendered output inherits the current reader's view, so a signed-in reader's
page publishes what only they can see. It stays out of search engines only because crawlers
are signed out — luck, not a boundary: one cached render of a signed-in page makes it the
page's public description.

**Build it from what a stranger would get**, and skip any block carrying a visibility
condition. The test is one line: the markup is byte-identical for a signed-in reader and a
stranger.

---

## The account journey is part of the port

Only for sites where people sign in — and then all of it, because each piece is invisible
until a reader meets it.

- **Keep me signed in.** Without `rememberme` WordPress sets a session cookie and everyone
  is signed out when the browser closes.
- **A way out**, where a signed-in reader will look — and the sign-in link hidden from them.
- **Forgotten password**, the whole journey, or the reader lands on `wp-login.php` in the
  middle of your design. Hosting it yourself means: point `lostpassword_url` at your page,
  rewrite the address in the email **by finding it, not by rebuilding it** (core writes the
  parameters in its own order and adds `wp_lang`), then check the key with
  `check_password_reset_key()` and set the password with `reset_password()`. Posting to
  `wp-login.php?action=resetpass` will not work: it wants a cookie its own form sets.
- **wp-admin.** A reader with no editing capability goes to their own page, and the admin
  bar does not follow them around the site.

Three mechanics that are easy to get wrong and hard to notice:

- **`admin-post.php` and `admin-ajax.php` both fire `admin_init`**, and front-end forms post
  to the first. Exempt them, or a submitted form is redirected away with its contents.
- **Core refuses several admin screens before `admin_init`**, so a redirect hung there
  catches half the admin and leaves the rest showing WordPress's bare 403. Hook `init` with
  an `is_admin()` test.
- **A logout URL carries a nonce tied to the reader**, so it cannot sit in static template
  markup. A placeholder `href` filled at render keeps the header a block the designer can
  still move, reword and translate.

---

## The editor is a different reader

Every rule above has to let the editor work. Check, with the editor rather than with curl —
a REST request carrying cookies but no nonce is **unauthenticated**, so curl sees what a
stranger sees however good the cookie is:

- the canvas loads and its REST calls return 200, including the ones your guard touches
- a gated record can still be opened and saved by staff
- the routes you closed are open to anybody who may edit
