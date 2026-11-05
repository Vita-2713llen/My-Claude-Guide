#!/usr/bin/env node
// RUN-01 · Step 1 of every run.
//  1. Opens the run (lib.startRun): qa-out/run.json. Whatever an earlier run left in the same --out folder moves to
//     qa-out/_prev/<runId>/ — nothing is deleted. A retry of step 1 before any other instrument wrote results joins
//     the same run; --same-run keeps the current run explicitly.
//  2. Fingerprints the site the same way on every platform and lists what changed since the previous run:
//       #chrome     everything outside <main> on "/" (header, nav, footer …): visible text + link and image paths
//       #assets     stylesheets and scripts of "/" (same-origin ones with their version query) + content hash of each
//                   same-origin stylesheet — catches theme / CSS deploys that change no text
//       /path       main content of each page: visible text + link and image paths. Attributes, comments, scripts,
//                   hidden inputs, nonces and email-protection hashes are left out, so a per-request token or a
//                   "last published" comment never reads as a change. Text that only moved → "reordered only".
//       rest:/path  WordPress only, extra evidence: public REST modified time of each item
//     A page that cannot be read (network error, timeout, host challenge, password or basic-auth gate) is listed as
//     unverified — never hashed, never reported as removed. An unreadable home page → RUN-01 NOT RUN, history untouched.
//  3. History: <project>/.qa-snapshots/<site>/<runId>.json (project = the folder of qa-target.json; keep the folder in
//     .gitignore). The previous snapshot is the newest one of ANOTHER run for the same site and format, so a retry
//     never becomes its own baseline and two sites never compare against each other.
// node snapshot.cjs --out qa-out [--base https://site | --local ./build] [--config qa-target.json] [--prev file.json]
//                   [--no-baseline] [--same-run]
//   --no-baseline  compare only (a quick "did the site change?" check before choosing a mode); writes no history
// Access: a basic-auth gate is passed only with QA_HTTP_USER / QA_HTTP_PASS exported by the person in their own
// terminal, a password page only with a session the person saved (lib GATE_ROUTE). Never typed, never printed.
const fs = require('fs'), path = require('path'); const L = require('./lib.cjs');
const a = L.args(process.argv.slice(2)); const cfg = L.loadConfig(a, { allowLocal: true }); const OUT = L.outDirFrom(a);
const ID = 'RUN-01', FORMAT = 2;
const PROJECT = cfg._configDir || process.cwd();
const byStr = L.byStr, sha = s => L.sha1(s).slice(0, 12), wait = ms => new Promise(r => setTimeout(r, ms));
const tryJson = f => { const r = L.tryReadJson(f, path.basename(f)); return r.ok ? r.data : null; };
// Extra artifacts of this skill version that an older lib.startRun does not move yet (moved into the same _prev folder).
const EXTRA = /^(manifest-meta\.json|grammar-candidates\.json|words-[\w-]+\.txt|cspell-[\w-]+\.json|spell-candidates-macos\.json|platform\.json|presence\.json)$/;
const ONLY_SNAPSHOT = /^(run\.json|snapshot\.json|results-snapshot\.json)$/;

(async () => {
  const srv = await L.resolveTarget(cfg); // --local: serve the build folder on 127.0.0.1
  const BASE = new URL(cfg.base + '/'); const BASE_PATH = BASE.pathname.replace(/\/$/, '');
  const siteKey = cfg.local ? 'local-' + path.basename(cfg.local).replace(/[^\w.-]+/g, '_') + '-' + sha(path.resolve(cfg.local)).slice(0, 6)
    : (L.hostKey(cfg.base) + BASE_PATH).toLowerCase().replace(/[^a-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '');
  L.acquireLock('snapshot', cfg, OUT);

  // ---- 1. open the run
  const cur = L.currentRun(OUT, cfg);
  const names = fs.existsSync(OUT) ? fs.readdirSync(OUT) : [];
  let run, note0 = null;
  if (cur && (a['same-run'] || names.filter(n => /\.json$|^shots$|^lighthouse$/.test(n) && !/^\./.test(n)).every(n => ONLY_SNAPSHOT.test(n) || EXTRA.test(n)))) run = cur;
  else {
    const old = (() => { const r = tryJson(path.join(OUT, 'run.json')); return r && r.runId ? r.runId : null; })();
    run = L.startRun(OUT, cfg, { tool: 'snapshot' });
    const leftovers = fs.readdirSync(OUT).filter(n => EXTRA.test(n));
    if (leftovers.length) {
      const dest = path.join(OUT, '_prev', old || 'legacy-' + run.runId); fs.mkdirSync(dest, { recursive: true });
      for (const n of leftovers) { try { fs.renameSync(path.join(OUT, n), path.join(dest, n)); } catch (e) { } }
    }
    if (old || names.some(n => /^results-/.test(n))) note0 = `earlier artifacts moved to _prev/${old || '…'}`;
  }
  const R = L.makeResults('snapshot', cfg, a); L.guard(R, OUT, [ID]);

  // ---- fetching: plain HTTP first (session cookies / basic auth from the person, pinned language); a real browser
  //      only when a host challenge stands on "/"
  let route = { cfg, fallbackToNode: true, timeoutMs: 30000 };
  const get = async u => { const r = await L.getUrl(u, route); const hdr = {}; for (const [k, v] of Object.entries(r.headers || {})) hdr[k.toLowerCase()] = v; return { status: r.status, ok: r.status >= 200 && r.status < 300, ct: hdr['content-type'] || '', url: r.url || u, text: r.text || '', hdr, blocked: r.blocked, err: r.error }; };
  async function viaBrowser() {
    let pw = null; for (const t of [process.env.PW_PATH, path.join(__dirname, 'node_modules', 'playwright-core')]) { if (!t) continue; try { pw = require(t); break; } catch (e) { } }
    if (!pw) return false;
    try {
      const b = await L.launchChromium(pw, cfg); const ctx = await b.newContext(L.contextOptions(cfg)); const page = await ctx.newPage();
      await L.gotoStable(page, cfg.base + '/', { noSettle: true }); // throws BlockedError when the challenge never clears
      route = { cfg, page, ctx, fallbackToNode: false, timeoutMs: 30000 }; return true;
    } catch (e) { await L.closeAllBrowsers(); return false; }
  }
  const CH = new RegExp(L.CHALLENGE.source, 'i');
  // Why a response is not the page itself (null = it is). HTTP error pages are page states, not failures.
  function unreadable(r) {
    if (r.status === -1) return 'network: ' + (r.err || 'error');
    if (r.status === 401 || r.status === 407 || r.hdr['www-authenticate']) return `access gate (HTTP ${r.status})`;
    const title = ((r.text.slice(0, 8000).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    if (r.blocked || (title && CH.test(title))) return 'host challenge' + (title ? ` ("${title.slice(0, 40)}")` : '');
    if (/action\s*=\s*["'][^"']*\/\.wf_auth|class\s*=\s*["'][^"']*\bw-password-page\b|id\s*=\s*["']password-protected-form|action\s*=\s*["'][^"']*password-protected=login|action\s*=\s*["'][^"']*\/password["'][^>]*>[\s\S]{0,400}type\s*=\s*["']password/i.test(r.text)) return 'password page';
    if (r.status === 429) return 'rate limited (HTTP 429)';
    if (r.status === 403) return 'forbidden (HTTP 403: WAF or IP block?)';
    return null;
  }

  // ---- normalised fingerprints
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™' };
  const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m; try { return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)); } catch (x) { return ' '; } });
  const strip = html => html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|object|canvas)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<input\b[^>]*\btype\s*=\s*["']?hidden\b[^>]*>/gi, ' ');
  function regions(html) {
    const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [null, html])[1];
    const m = body.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
    if (m) return { content: m[1], chrome: body.replace(m[0], ' ') };
    const blocks = body.match(/<(header|nav|footer)\b[\s\S]*?<\/\1\s*>/gi) || [];
    return { content: blocks.reduce((s, b) => s.replace(b, ' '), body), chrome: blocks.join('\n') };
  }
  const attrVals = (h, re) => [...h.matchAll(re)].map(m => decode(m[2] ?? m[3] ?? m[4] ?? '').trim());
  const sameHost = u => L.sameSite(u, cfg);
  function urlKey(v, pageUrl, keepQuery) {
    if (!v || v[0] === '#' || /^(javascript|data|blob|about):/i.test(v) || /\/cdn-cgi\/l\/email-protection/i.test(v)) return null;
    if (/^(mailto|tel|sms):/i.test(v)) return v.toLowerCase().replace(/\s+/g, '');
    let u; try { u = new URL(v, pageUrl); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const same = sameHost(u.href);
    return (same ? '' : u.host.toLowerCase().replace(/^www\./, '')) + u.pathname + (same && keepQuery ? u.search : '');
  }
  function fingerprint(regionHtml, pageUrl, title) {
    const links = new Set(), media = new Set();
    for (const v of attrVals(regionHtml, /<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) { const k = urlKey(v, pageUrl); if (k) links.add(k); }
    for (const v of attrVals(regionHtml, /\s(?:src|data-src|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) { const k = urlKey(v, pageUrl); if (k) media.add(k); }
    for (const v of attrVals(regionHtml, /\s(?:srcset|data-srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi)) for (const c of v.split(',')) { const k = urlKey(c.trim().split(/\s+/)[0], pageUrl); if (k) media.add(k); }
    const text = decode(regionHtml.replace(/<(br|hr)\b[^>]*>|<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|nav|aside|dt|dd|blockquote|figcaption|button|a|label|option|summary|span)\s*>/gi, '\n').replace(/<[^>]+>/g, ' '));
    const lines = text.split('\n').map(s => s.replace(/[\s\u00a0\u200b]+/g, ' ').trim()).filter(Boolean);
    const tail = ['--links', ...[...links].sort(byStr), '--media', ...[...media].sort(byStr)];
    return { t: sha([title || '', ...lines, ...tail].join('\n')), s: sha([title || '', ...[...lines].sort(byStr), ...tail].join('\n')), n: lines.length };
  }
  const titleOf = html => decode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim());
  const pathOf = u => L.pagePath(u, cfg, { search: true }) || String(u);

  try {
    const snap = { v: FORMAT, base: cfg.base, site: siteKey, runId: run.runId, at: new Date().toISOString(), kind: 'html-norm', items: {}, failed: {}, notes: [] };
    // ---- home page; a host challenge → one try through a real browser
    let home = await get(cfg.base + '/');
    let why = unreadable(home);
    if (why && /^host challenge/.test(why) && await viaBrowser()) { snap.via = 'browser (host challenge on plain HTTP)'; home = await get(cfg.base + '/'); why = unreadable(home); }
    if (why || home.status >= 400 || !/html/i.test(home.ct || 'text/html')) {
      const reason = why || `home page answered HTTP ${home.status}${home.ct ? ' ' + home.ct.split(';')[0] : ''}`;
      const rt = /access gate|password/.test(reason) ? L.GATE_ROUTE
        : /challenge|403|429/.test(reason) ? 'the host blocks this machine: set concurrency 1 and throttleMs ≥ 1500 in qa-target.json, ask the host to allowlist this IP, or rerun from an allowed network'
          : 'check "base" in qa-target.json (or --base) and the network, then rerun step 1';
      R.notRun(ID, `home page unreadable: ${reason} — route: ${rt}`);
      snap.failed['/'] = reason; L.writeJsonAtomic(path.join(OUT, 'snapshot.json'), snap);
      L.saveResults(R, OUT); await L.closeAllBrowsers(); await srv.stop();
      console.error(`snapshot: NOT RUN — ${reason}`); process.exit(L.EXIT_NOT_RUN);
    }
    if (!sameHost(home.url)) snap.notes.push(`"/" ends on ${home.url} — check "base"`);

    // ---- WordPress REST: extra evidence only when the endpoint really is the WordPress REST API (not a catch-all page)
    let wpItems = 0; const wpErrors = [];
    {
      const r = await get(cfg.base + '/wp-json/wp/v2/types');
      let types = null; if (r.ok && /json/i.test(r.ct)) { try { types = JSON.parse(r.text); } catch (e) { } }
      const list = types && typeof types === 'object' && !Array.isArray(types) ? Object.values(types).filter(t => t && typeof t.rest_base === 'string' && typeof t.slug === 'string') : [];
      const SKIP = /^(attachment|nav_menu_item|wp_block|wp_template|wp_template_part|wp_navigation|wp_global_styles|wp_font_family|wp_font_face)$/;
      for (const t of list.filter(t => !SKIP.test(t.slug)).sort((x, y) => byStr(x.slug, y.slug))) {
        for (let pg = 1; pg <= 20; pg++) {
          const rr = await get(`${cfg.base}/wp-json/${t.rest_namespace || 'wp/v2'}/${t.rest_base}?per_page=100&page=${pg}&_fields=id,link,modified_gmt`);
          if (!rr.ok) { if (pg === 1 && rr.status !== 400) wpErrors.push(`${t.slug}: HTTP ${rr.status}`); break; }
          let arr = null; try { arr = JSON.parse(rr.text); } catch (e) { wpErrors.push(`${t.slug}: not JSON`); break; }
          if (!Array.isArray(arr) || !arr.length) break;
          for (const x of arr) if (x && x.link) { snap.items['rest:' + pathOf(x.link)] = { t: String(x.modified_gmt || '') }; wpItems++; }
          if (arr.length < 100) break;
          await wait(250);
        }
      }
      if (list.length) snap.wordpress = true;
      if (wpErrors.length) snap.notes.push('WordPress REST partly closed: ' + wpErrors.join(', '));
    }

    // ---- page list: the shared discovery (qa-target pages / sitemap / link crawl) — the same list every instrument uses
    let info; try { info = await L.discoverPagesInfo(cfg, route.page ? { page: route.page, ctx: route.ctx } : {}); } catch (e) { info = { pages: ['/'], source: 'none', errors: [String(e.message || e)], warnings: [] }; }
    let pages = L.sortPages(info.pages.filter(p => !/^\/qa-404-/.test(p)));
    const MAX = +(cfg.snapshotMaxPages || 300);
    if (pages.length > MAX) { snap.notes.push(`page list capped at ${MAX} of ${pages.length} (snapshotMaxPages)`); pages = pages.slice(0, MAX); }
    snap.pagesSource = info.source; snap.pages = pages.length;
    if (info.source === 'none' && !cfg.decisions.singlePage) snap.notes.push('only "/" was found (no sitemap, no crawlable links) — changes on other pages are invisible to RUN-01; list them in qa-target.json → pages');
    (info.warnings || []).slice(0, 3).forEach(w => snap.notes.push(w));

    // ---- chrome + assets from "/"
    snap.items['#chrome'] = fingerprint(regions(strip(home.text)).chrome, home.url, '');
    const assetList = new Set();
    for (const tag of home.text.match(/<link\b[^>]*>/gi) || []) if (/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) { const k = urlKey(attrVals(tag, /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)[0], home.url, true); if (k) assetList.add(k); }
    for (const v of attrVals(home.text, /<script\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) { const k = urlKey(v, home.url, true); if (k) assetList.add(k); }
    const assets = { list: [...assetList].sort(byStr), css: {}, failed: [] };
    for (const k of assets.list.filter(k => k.startsWith('/') && /\.css(\?|$)/i.test(k)).slice(0, 20)) {
      const r = await get(new URL(k, BASE.origin).href); const w = unreadable(r);
      if (w || !r.ok) { assets.failed.push(`${k} (${w || 'HTTP ' + r.status})`); continue; }
      assets.css[k] = sha(r.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim());
      await wait(cfg.throttleMs);
    }
    snap.assets = assets;
    snap.items['#assets'] = { t: sha(assets.list.join('\n') + '\n--css\n' + Object.keys(assets.css).sort(byStr).map(k => k + ' ' + assets.css[k]).join('\n')) };

    // ---- every page's main content
    for (const p of pages) {
      const r = p === '/' ? home : await get(cfg.base + p);
      const w = unreadable(r);
      if (w) snap.failed[p] = w;
      else if (!sameHost(r.url)) snap.items[p] = { t: sha('redirect ' + r.url.split('?')[0]), redirect: r.url.split('?')[0] };
      else if (r.status >= 400) snap.items[p] = { t: 'HTTP ' + r.status };
      else if (!/html/i.test(r.ct || 'text/html')) snap.items[p] = { t: sha('non-html ' + r.ct.split(';')[0] + ' ' + r.text.length) };
      else snap.items[p] = Object.assign(fingerprint(regions(strip(r.text)).content, r.url, titleOf(r.text)), pathOf(r.url) !== p ? { final: pathOf(r.url) } : {});
      if (p !== '/') await wait(cfg.throttleMs);
    }
    await L.closeAllBrowsers();
    snap.digest = sha(Object.keys(snap.items).sort(byStr).map(k => k + ' ' + snap.items[k].t).join('\n'));

    // ---- previous snapshot: the newest of ANOTHER run, same site, same format
    const histDir = path.join(PROJECT, '.qa-snapshots', siteKey);
    let prev = null, prevSrc = '', reset = '';
    if (a.prev && a.prev !== true) { prev = tryJson(path.resolve(String(a.prev))); prevSrc = String(a.prev); if (!prev) reset = `cannot read --prev ${a.prev}`; }
    else {
      const cand = fs.existsSync(histDir) ? fs.readdirSync(histDir).filter(f => /\.json$/.test(f)).map(f => tryJson(path.join(histDir, f))).filter(s => s && s.at && s.runId !== run.runId) : [];
      const ok = cand.filter(s => s.v === FORMAT && s.site === siteKey).sort((x, y) => byStr(y.at, x.at));
      if (ok.length) { prev = ok[0]; prevSrc = `run ${prev.runId}`; }
      else if (cand.length || [path.join(PROJECT, '.qa-snapshot.json'), path.join(process.cwd(), '.qa-snapshot.json')].some(f => fs.existsSync(f))) reset = 'the previous snapshot uses an older format — baseline reset, no change list this time';
    }
    if (prev && !reset && !(prev.v === FORMAT && prev.site === siteKey)) reset = `the previous snapshot (${prevSrc}) is for ${prev.base || '?'} / format v${prev.v || 1} — baseline reset, no change list`;
    const parts = [`snapshot v${FORMAT} · ${pages.length} page(s) from ${info.source}${snap.via ? ' · via ' + snap.via : ''}${snap.wordpress ? ` · WordPress REST ${wpItems} item(s)` : ''} · digest ${snap.digest}`];
    if (prev && !reset) {
      const now = snap.items, pi = prev.items || {}, pf = prev.failed || {};
      const isPage = k => !k.startsWith('#') && !k.startsWith('rest:');
      const changed = [], reordered = [], added = [], removed = [], notCompared = [];
      for (const k of Object.keys(now).filter(isPage).sort(byStr)) {
        if (k in pi) { if (pi[k].t !== now[k].t) (pi[k].s && pi[k].s === now[k].s ? reordered : changed).push(k); }
        else if (k in pf) notCompared.push(k); else added.push(k);
      }
      for (const k of Object.keys(pi).filter(isPage).sort(byStr)) if (!(k in now) && !(k in snap.failed)) (prev.pagesSource === snap.pagesSource ? removed : notCompared).push(k);
      const restKeys = [...new Set([...Object.keys(now), ...Object.keys(pi)].filter(k => k.startsWith('rest:')))].sort(byStr);
      const restMod = restKeys.filter(k => k in now && k in pi && now[k].t !== pi[k].t), restAdd = restKeys.filter(k => k in now && !(k in pi)), restDel = restKeys.filter(k => !(k in now) && k in pi);
      const pa = (prev.assets && prev.assets.list) || [], aAdd = assets.list.filter(x => !pa.includes(x)), aDel = pa.filter(x => !assets.list.includes(x));
      const cssMod = Object.keys(assets.css).filter(k => prev.assets && prev.assets.css && k in prev.assets.css && prev.assets.css[k] !== assets.css[k]);
      const chromeChanged = !!(pi['#chrome'] && pi['#chrome'].t !== now['#chrome'].t), assetsChanged = !!(pi['#assets'] && pi['#assets'].t !== now['#assets'].t);
      const show = arr => arr.slice(0, 15).join(', ') + (arr.length > 15 ? ' …' : '');
      const seg = [`#chrome ${chromeChanged ? 'CHANGED' : 'same'}`, `#assets ${assetsChanged ? `CHANGED (+${aAdd.length} −${aDel.length} file(s), ${cssMod.length} stylesheet(s) edited)` : 'same'}`, `content changed ${changed.length}${changed.length ? ': ' + show(changed) : ''}`];
      if (reordered.length) seg.push(`reordered only ${reordered.length}: ${show(reordered)}`);
      if (added.length) seg.push(`added ${added.length}: ${show(added)}`);
      if (removed.length) seg.push(`removed ${removed.length}: ${show(removed)}`);
      if (notCompared.length) seg.push(`not compared ${notCompared.length}: ${show(notCompared)}`);
      if (restKeys.length) seg.push(`REST edited ${restMod.length}${restMod.length ? ': ' + show(restMod.map(k => k.slice(5))) : ''}, new ${restAdd.length}, gone ${restDel.length}`);
      parts.push(`since ${String(prev.at).slice(0, 16)} (${prevSrc}): ` + seg.join(' · '));
      snap.diff = { since: prev.at, prevRun: prev.runId || null, chrome: chromeChanged, assets: { added: aAdd, removed: aDel, cssEdited: cssMod }, changed, reordered, added, removed, notCompared, rest: { edited: restMod, added: restAdd, removed: restDel } };
    } else parts.push(reset || `first snapshot for ${siteKey}: ${Object.keys(snap.items).length} item(s)`);
    if (note0) parts.push(note0);
    snap.notes.forEach(n => parts.push(n));
    R.ran(ID); R.note(ID, parts.join(' · '));
    const failedKeys = Object.keys(snap.failed).sort(byStr);
    if (failedKeys.length || assets.failed.length) {
      const list = [...failedKeys.map(k => `${k} (${snap.failed[k]})`), ...assets.failed.map(x => '#assets ' + x)];
      const gate = failedKeys.some(k => /access gate|password/.test(snap.failed[k]));
      R.notRun(ID, `${failedKeys.length} of ${pages.length} page(s)${assets.failed.length ? ` and ${assets.failed.length} stylesheet(s)` : ''} unverified: ${list.slice(0, 12).join(', ')}${list.length > 12 ? ' …' : ''} — changes there are unknown; route: ${gate ? L.GATE_ROUTE : 'rerun step 1 when the host answers (concurrency 1, throttleMs ≥ 1500), or record the gap with record.cjs'}`);
    }
    L.writeJsonAtomic(path.join(OUT, 'snapshot.json'), snap);
    if (!a['no-baseline']) L.writeJsonAtomic(path.join(histDir, `${run.runId}.json`), JSON.stringify(snap));
    L.saveResults(R, OUT); await srv.stop();
    console.log(parts.join('\n') + (failedKeys.length ? `\nunverified: ${failedKeys.length}` : '') + `\nrun ${run.runId}`);
    process.exit(0); // do not wait for idle keep-alive sockets
  } catch (e) {
    await L.closeAllBrowsers();
    R.notRun(ID, 'snapshot crashed: ' + String(e && e.message || e).split('\n')[0].slice(0, 160));
    L.saveResults(R, OUT); console.error('snapshot: NOT RUN — ' + (e && e.stack || e)); process.exit(L.EXIT_NOT_RUN);
  }
})();
