// What the site gives to a stranger — the stage-2 sweep for any site with restricted content.
//
// Signed out, by address. It never reads the theme: a gate is proved by what the server answers,
// not by the code that was meant to produce it. Every row prints its address and its status, so
// the report can quote a fact instead of a claim.
//
//   node leaks.cjs                        base and targets from qa-target.json
//   node leaks.cjs https://example.com    base from the command line
//   COOKIE="name=value; other=value" node leaks.cjs      second pass as a signed-in reader
//
// Project-neutral: nothing here carries a site address, a slug or an id. They come from
// qa-target.json → "restricted":
//
//   "restricted": {
//     "word":       "a word that ONLY restricted records carry",
//     "publicWord": "a word that only PUBLIC records carry — the control",
//     "pages":      ["/board-documents/"],
//     "types":      ["posts", "pages", "resource"],   // REST route names — plural for core types
//     "ids":        [{ "type": "resource", "id": 4120 }],
//     "files":      ["/wp-content/uploads/2024/BoardDocs/minutes.pdf"]
//   }
//
// Exit codes: 0 nothing leaked · 1 at least one LEAK · 64 nothing to check.
const { loadBase, readConfig } = require('./qa-target.cjs');

const UA = { 'user-agent': 'Mozilla/5.0 qa-check leaks' };
const base = loadBase(process.argv[2], 'node leaks.cjs [https://example.com]');
const cfg = readConfig();
const R = cfg.restricted || {};
const COOKIE = process.env.COOKIE || '';

const rows = [];
const add = (check, where, status, note) => rows.push({ check, where, status, note: note || '' });
const notRun = (check, why) => add(check, '—', 'NOT RUN', why);

async function get(url, cookie) {
  const headers = Object.assign({}, UA, cookie ? { cookie } : {});
  try {
    const r = await fetch(url, { headers, redirect: 'manual' });
    const body = r.status >= 200 && r.status < 300 ? await r.text() : '';
    return { status: r.status, location: r.headers.get('location') || '', body, type: r.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, location: '', body: '', type: '', error: e.message };
  }
}

// Any restricted page's slug appearing in a listing is the leak — a title can be reworded,
// a slug is what the link carries.
const slugs = (R.pages || []).map((p) => String(p).replace(/^\/+|\/+$/g, '').split('/').pop()).filter(Boolean);
const slugsIn = (text) => slugs.filter((s) => text.includes(s));

async function restAlive() {
  const r = await get(base + '/wp-json/');
  return r.status === 200 && r.body.includes('"routes"');
}

(async () => {
  if (!R.word && !slugs.length && !(R.files || []).length && !(R.ids || []).length) {
    console.error(
      'Nothing to check. Add to qa-target.json:\n' +
      '  "restricted": { "word": "...", "publicWord": "...", "pages": ["/..."], "types": ["post"], "ids": [{"type":"post","id":1}], "files": ["/wp-content/uploads/..."] }\n' +
      'A site with no restricted content does not need this script — say so in the report instead of running it.'
    );
    process.exit(64);
  }

  /* ---------------------------------------------------- 0. the control: can it say "one"? */
  // A sweep that reports "nothing found" has to prove it would have found something. If the
  // search page cannot find a word that IS public, every clean search row below is worthless.
  if (R.publicWord) {
    const c = await get(base + '/?s=' + encodeURIComponent(R.publicWord));
    const works = c.status === 200 && c.body.length > 0 && !/no results|nothing found/i.test(c.body);
    add('control — search finds a public word', '/?s=' + R.publicWord, works ? 'ok' : 'BROKEN',
      works ? 'the search rows below mean something' : 'search returns nothing even for public content — the search rows below prove nothing');
  } else {
    notRun('control — search finds a public word', 'no restricted.publicWord in qa-target.json; the search rows below are unproven');
  }

  /* ----------------------------------------------------------- 1. the pages themselves */
  for (const p of R.pages || []) {
    const url = base + (p.startsWith('/') ? p : '/' + p);
    const r = await get(url);
    const open = r.status === 200 && r.body.length > 4000; // a gated page may still render a shell
    add('restricted page, signed out', p,
      open ? 'LEAK' : 'ok',
      'HTTP ' + r.status + (r.location ? ' → ' + r.location : '') + ', ' + r.body.length + ' bytes');
  }

  /* ------------------------------------------------------------------ 2. the search page */
  if (R.word) {
    // A search page carries the whole header and footer, so a restricted slug sitting in the
    // navigation looks exactly like a result. The baseline is the same page searched for a word
    // nothing can match: whatever appears in BOTH is chrome, not a finding.
    const chrome = await get(base + '/?s=' + encodeURIComponent('zzqq' + Date.now()));
    const inChrome = new Set(slugsIn(chrome.body));
    const r = await get(base + '/?s=' + encodeURIComponent(R.word));
    const hits = slugsIn(r.body).filter((s) => !inChrome.has(s));
    const blind = slugs.filter((s) => inChrome.has(s));
    add('site search', '/?s=' + R.word, hits.length ? 'LEAK' : 'ok',
      hits.length
        ? 'returns ' + hits.join(', ')
        : 'HTTP ' + r.status + ', no restricted slug in the results');
    // A slug the header links to anyway cannot be told from a result. That is not a pass for
    // that slug — it is a surface this script cannot see, and it goes in the report as one.
    if (blind.length) notRun('site search — these slugs', 'the header or footer links to ' + blind.join(', ') + ' on every page, so a result for them is indistinguishable; open /?s=… and read the results by eye');
  } else {
    notRun('site search', 'no restricted.word in qa-target.json');
  }

  /* -------------------------------------------------------------------------- 3. REST */
  if (await restAlive()) {
    if (R.word) {
      for (const t of R.types || ['posts', 'pages']) {
        const u = base + '/wp-json/wp/v2/' + t + '?per_page=100&search=' + encodeURIComponent(R.word);
        const r = await get(u);
        let n = 0, ids = [];
        if (r.status === 200) {
          try { const j = JSON.parse(r.body); if (Array.isArray(j)) { n = j.length; ids = j.slice(0, 5).map((x) => x.id); } } catch (e) { /* not JSON */ }
        }
        // 404 on a route while /wp-json/ itself answers means the ROUTE NAME is wrong — a
        // misspelt type reports a perfect gate. It is NOT RUN, never ok.
        if (r.status === 404) {
          notRun('REST collection', 'no route /wp/v2/' + t + ' — "types" takes REST route names (posts, pages, …), and a CPT\'s own rest_base');
          continue;
        }
        add('REST collection', '/wp-json/wp/v2/' + t + '?search=…', n ? 'LEAK' : 'ok',
          n ? n + ' item(s), ids ' + ids.join(',') : 'HTTP ' + r.status + ', 0 items');
      }

      const s = await get(base + '/wp-json/wp/v2/search?per_page=100&search=' + encodeURIComponent(R.word));
      let hits = [];
      if (s.status === 200) {
        try {
          const j = JSON.parse(s.body);
          if (Array.isArray(j)) hits = j.filter((x) => slugsIn(String(x.url || ''))).map((x) => x.url);
        } catch (e) { /* not JSON */ }
      }
      add('REST search', '/wp-json/wp/v2/search?search=…', hits.length ? 'LEAK' : 'ok',
        hits.length ? hits.slice(0, 3).join(' ') : 'HTTP ' + s.status + ', no restricted url');
    }

    // By id, and this is the one a pre_get_posts guard never sees: no query runs.
    for (const it of R.ids || []) {
      const u = base + '/wp-json/wp/v2/' + it.type + '/' + it.id;
      const r = await get(u);
      add('REST by id', '/wp-json/wp/v2/' + it.type + '/' + it.id, r.status === 200 ? 'LEAK' : 'ok',
        'HTTP ' + r.status + (r.status === 200
          ? ', ' + r.body.length + ' bytes of content'
          : ' — right answer, and the same one a nonexistent id gets' + (COOKIE ? '' : '; without COOKIE= this row cannot tell the two apart')));
    }
    if (!(R.ids || []).length) notRun('REST by id', 'no restricted.ids in qa-target.json — and this is the surface a query filter never covers');

    const us = await get(base + '/wp-json/wp/v2/users');
    let nu = 0;
    if (us.status === 200) { try { const j = JSON.parse(us.body); if (Array.isArray(j)) nu = j.length; } catch (e) { /* */ } }
    add('account list', '/wp-json/wp/v2/users', nu ? 'LEAK' : 'ok',
      nu ? nu + ' account(s) with the slug each signs in with' : 'HTTP ' + us.status);
  } else {
    for (const c of ['REST collection', 'REST search', 'REST by id', 'account list']) notRun(c, 'no /wp-json/ on this host — not a WordPress REST surface');
  }

  /* --------------------------------------------------------------- 4. feeds and sitemaps */
  {
    const r = await get(base + '/feed/');
    const hits = slugsIn(r.body);
    add('feed', '/feed/', hits.length ? 'LEAK' : 'ok', hits.length ? hits.join(', ') : 'HTTP ' + r.status);
  }

  for (const sm of ['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml']) {
    const r = await get(base + sm);
    if (r.status !== 200) continue;
    let text = r.body;
    // one level of index → children, so a slug inside a sub-sitemap is still found
    for (const m of [...r.body.matchAll(/<loc>([^<]+\.xml)<\/loc>/g)].slice(0, 20)) {
      const c = await get(m[1]);
      if (c.status === 200) text += c.body;
    }
    const hits = slugsIn(text);
    add('sitemap', sm, hits.length ? 'LEAK' : 'ok', hits.length ? hits.join(', ') : 'listed, no restricted slug');
  }

  /* ------------------------------------------------------- 5. the files — the big one */
  for (const f of R.files || []) {
    const url = f.startsWith('http') ? f : base + (f.startsWith('/') ? f : '/' + f);
    const r = await get(url);
    add('restricted file, signed out', f, r.status === 200 ? 'LEAK' : 'ok',
      'HTTP ' + r.status + (r.status === 200 ? ', ' + r.body.length + ' bytes, ' + r.type : ''));
  }
  if (!(R.files || []).length) notRun('restricted file, signed out', 'no restricted.files in qa-target.json — a gated page whose files answer 200 is the most common form of this defect');

  /* ----------------------------------- 6. and the other direction: does it let them in? */
  // A gate that refuses everybody is also broken, and it reports as a perfect sweep above.
  if (COOKIE) {
    for (const p of R.pages || []) {
      const r = await get(base + (p.startsWith('/') ? p : '/' + p), COOKIE);
      add('signed in CAN see the page', p, r.status === 200 ? 'ok' : 'BROKEN', 'HTTP ' + r.status + (r.location ? ' → ' + r.location : ''));
    }
    for (const f of R.files || []) {
      const url = f.startsWith('http') ? f : base + (f.startsWith('/') ? f : '/' + f);
      const r = await get(url, COOKIE);
      add('signed in CAN open the file', f, r.status === 200 ? 'ok' : 'BROKEN', 'HTTP ' + r.status);
    }
    // And this is what makes the 404 above mean something: the record exists, and the only
    // reason a stranger got nothing is the gate.
    for (const it of R.ids || []) {
      const r = await get(base + '/wp-json/wp/v2/' + it.type + '/' + it.id, COOKIE);
      add('the id really exists', '/wp-json/wp/v2/' + it.type + '/' + it.id, r.status === 200 ? 'ok' : 'BROKEN',
        'HTTP ' + r.status + (r.status === 200 ? ' signed in — so the 404 signed out is the gate, not an empty id' : ' signed in too — this id proves nothing; pick one that exists'));
    }
  } else {
    notRun('signed in CAN still see it', 'no COOKIE= given; a gate that refuses everybody passes every row above');
  }

  /* ------------------------------------------------------------------------- the report */
  const w = (s, n) => String(s).padEnd(n);
  console.log('\n' + base + '  — signed out' + (COOKIE ? ', plus one signed-in pass' : '') + '\n');
  console.log(w('status', 9) + w('check', 32) + w('where', 46) + 'note');
  console.log('-'.repeat(120));
  for (const r of rows) console.log(w(r.status, 9) + w(r.check, 32) + w(r.where, 46) + r.note);

  const leaks = rows.filter((r) => r.status === 'LEAK').length;
  const broken = rows.filter((r) => r.status === 'BROKEN').length;
  const skipped = rows.filter((r) => r.status === 'NOT RUN').length;
  console.log('\n' + leaks + ' LEAK, ' + broken + ' BROKEN, ' + skipped + ' NOT RUN, ' + rows.filter((r) => r.status === 'ok').length + ' ok');
  if (skipped) console.log('NOT RUN is never a pass: every row above goes in the report with its reason.');
  process.exit(leaks ? 1 : 0);
})();
