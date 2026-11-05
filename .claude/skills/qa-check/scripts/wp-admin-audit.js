// wp-admin-audit.js · READ-ONLY audit of a WordPress admin, executed inside a logged-in wp-admin browser tab.
// Reports exactly these registry IDs, each as ran / n/a / not-run with a reason — never a silent pass:
//   WP-01…WP-12, WP-14, FORM-08, FORM-09, CMS-02        (WP-13 and WP-15 are route / person rows)
//
// HOW — the person logs in as an administrator; the agent never types a password.
//  1. Open a wp-admin screen that takes no post lock. Block theme: /wp-admin/site-editor.php. Otherwise the block
//     editor of a page nobody is editing: /wp-admin/post.php?post=<id>&action=edit (it loads wp.blocks for WP-01/07).
//     Any other wp-admin screen works as well; WP-01/07 then name the editor URL to open and rerun.
//     Click NOTHING in the editor: no "Take over", "Attempt block recovery", "Convert to HTML", Save or Update.
//     A "currently editing" dialog may stay open — the script works underneath it. Leave without saving.
//  2. Same tab, before step 3 (expected; without it every decision-dependent sub-check becomes ❓ and _cfgMissing is set):
//       node <skill>/scripts/wp-admin-cfg.cjs --out qa-out   (from the project folder, after qa-run) writes qa-out/wp-admin.cfg.js:
//       window.QA_WP_CFG = qa-target.json + "pages" (qa-out/pages.json → all) + "presence" (results-qa-run.json → _presence).
//       Execute that file's text in the tab as it is — never assemble QA_WP_CFG by hand.
//  3. Execute this file in the tab (browser tool javascript_exec). It returns 'started' and fills window.QA_WP.
//  4. Poll QA_WP.status() until "done":true (it also shows the current step and errors).
//     Transfer QA_WP.chunk(0) … QA_WP.chunk(parts-1) in order, unedited, into qa-out/wp-admin.raw.json, then
//       node <skill>/scripts/record.cjs --out qa-out --import qa-out/wp-admin.raw.json --tool wp-admin --len <QA_WP.len> --sum <QA_WP.sum>
//     (record.cjs refuses the file when its length or hash differs — a retyped or truncated copy never becomes evidence)
//     The file must equal QA_WP.json: same length (QA_WP.len, JS string length) and the same FNV-1a 32-bit hash over
//     UTF-16 code units (QA_WP.sum; per chunk QA_WP.sums[i]). Never retype or "repair" the JSON by hand.
//
// Read-only: GET requests only; nothing is saved, submitted or deleted. Opening update-core.php and plugins.php runs
// WordPress's normal update check (api.wordpress.org, update_* transients) — the same as a person opening them.
// Front-end pages are fetched without cookies (what a visitor gets); a gated staging falls back to this session.
//
// QA_WP_CFG keys this script reads — each looked up in .wp, then .decisions, then .mail, then the top level; all optional:
//   base, staging, pages, presence{}            site, staging flag, page list (array or pages.json plan), presence sweep
//   productionDomain                            launch domain, e.g. "example.com" (sender checks on a staging copy)
//   themeAuthor                                 expected theme author line (WP-04); unset → ❓
//   agencyEmailDomains[], testAddresses[]       addresses that must never receive the client's mail (FORM-08, WP-08)
//   clientRecipients[]                          free-mail addresses confirmed as the client's (FORM-08)
//   requiredPlugins[], cachePlugins[], imagePlugins[], devMuPlugins[]   plugin folder slugs (WP-03)
//   requireCachePlugin, requireImagePlugin      true → a missing plugin is 🔴 instead of ❓ (WP-03)
//   mailSubjectHasPage                          true → the page title must be in the mail subject (FORM-09)
//   autoReply                                   false → no auto-reply is wanted (FORM-08); default true
//   maxAdmins (2), maxRenderedPages (300), throttleMs (300)
// No project, client, agency or person value lives in this file: everything site-specific comes from QA_WP_CFG.
(() => {
  if (window.QA_WP && window.QA_WP.running) return 'already running — poll QA_WP.status()';
  const VERSION = 'wp-admin-audit 3';
  const IDS = ['WP-01', 'WP-02', 'WP-03', 'WP-04', 'WP-05', 'WP-06', 'WP-07', 'WP-08', 'WP-09', 'WP-10', 'WP-11', 'WP-12', 'WP-14', 'FORM-08', 'FORM-09', 'CMS-02'];
  const HOWTO = 'log in as an administrator, open a wp-admin screen in this tab and rerun scripts/wp-admin-audit.js';

  // ---------- config (from qa-target.json, set by the agent before running)
  const RAWCFG = window.QA_WP_CFG && typeof window.QA_WP_CFG === 'object' ? window.QA_WP_CFG : null;
  const CFG = RAWCFG || {};
  const SRC = [CFG.wp, CFG.decisions, CFG.mail, CFG].filter(o => o && typeof o === 'object');
  const cfg = (...names) => { for (const o of SRC) for (const n of names) { const v = o[n]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; };
  const arr = v => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map(x => String(x).trim()).filter(Boolean);
  const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

  // ---------- result container (same shape as lib.cjs makeResults)
  const QA = window.QA_WP = { running: true, done: false, step: 'start', log: '', json: '', len: 0, sum: '', size: 12000, parts: 0, sums: [] };
  const RES = QA.results = { _tool: 'wp-admin', _version: VERSION, _at: new Date().toISOString(), checks: {} };
  const C = RES.checks, ERR = RES._errors = [];
  QA.chunk = i => QA.json.slice(i * QA.size, (i + 1) * QA.size);
  QA.status = () => JSON.stringify({ done: QA.done, step: QA.step, log: QA.log, errors: ERR, len: QA.len, sum: QA.sum, parts: QA.parts, sums: QA.sums });
  const log = s => { QA.log += (QA.log ? '\n' : '') + s; };
  const closed = {}, deferred = new Set();
  const entry = id => (C[id] = C[id] || { items: [], notes: [] });
  const clip = it => { for (const k of Object.keys(it)) { const v = it[k]; if (typeof v === 'string' && v.length > 300) it[k] = v.slice(0, 299) + '…'; else if (Array.isArray(v) && v.length > 25) { it[k] = v.slice(0, 25); it[k + 'Total'] = v.length; } } return it; };
  // ran only when the check really executed on ≥1 subject; n/a and not-run always carry a reason.
  const ran = (id, tested) => { const c = entry(id); if (c.notRun || c.na) return; c.ran = true; if (typeof tested === 'number' && tested > 0) c.tested = tested; };
  const add = (id, it) => { entry(id).items.push(clip(it)); ran(id); };
  const ask = (id, it) => add(id, Object.assign(it, { ask: true }));
  const note = (id, n) => { entry(id).notes.push(String(n).slice(0, 700)); };
  const na = (id, why) => { const c = entry(id); delete c.ran; delete c.tested; c.na = why; };
  const notRun = (id, why) => { const c = entry(id); delete c.ran; delete c.tested; delete c.na; c.notRun = c.notRun ? c.notRun + '; ' + why : why; };
  const partial = (id, why) => { const c = entry(id); (c.partial = c.partial || []).push(why); }; // ran, but this part was not
  const section = async (name, ids, fn) => {
    QA.step = name;
    try { await fn(); } catch (e) {
      const msg = (e && e.message) || String(e); ERR.push(`${name}: ${msg}`);
      ids.forEach(id => { if (!entry(id).na) notRun(id, `${name} stopped: ${msg} — ${HOWTO}`); });
    }
    ids.forEach(id => { closed[id] = true; });
  };

  // ---------- text, hash, domain and address helpers
  const S_ = v => (v === undefined || v === null ? '' : String(v));
  const PARSER = new DOMParser();
  const textOf = html => { const s = S_(html); if (!/[<&]/.test(s)) return s.replace(/\s+/g, ' ').trim(); const d = PARSER.parseFromString('<!doctype html><body>' + s, 'text/html'); return S_(d.body && d.body.textContent).replace(/\s+/g, ' ').trim(); };
  const normT = s => S_(s).normalize('NFKC').toLowerCase().replace(/[‘’‚‛′`]/g, "'").replace(/[“”„‟″«»]/g, '"').replace(/[‐-―−]/g, '-').replace(/[\s ]+/g, ' ').trim();
  const decode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const esc = s => S_(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const host0 = h => S_(h).toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const regDomain = h => { h = host0(h); if (/^[\d.]+$|^\[|^localhost$/.test(h)) return h; const p = h.split('.'); return p.slice(p.length > 2 && /\.(co|com|org|net|ac|gov|edu|ltd|plc|me|nom|sch|or|ne|go|gen|biz|info|in)\.[a-z]{2}$/.test(h) ? -3 : -2).join('.'); };
  const onDomain = (h, d) => { h = host0(h); d = host0(d); return !!d && (h === d || h.endsWith('.' + d)); };
  const domainOf = v => { const s = S_(v).trim(); if (!s) return ''; try { return host0(new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s).hostname); } catch (e) { return host0(s); } };
  const looksStaging = h => /(^|[.-])(staging|stage|stg|dev|develop|test|testing|demo|preview|sandbox|uat|qa)([.-]|$)|\.(local|test|localhost|invalid)$|\.(wpengine|wpenginepowered|kinsta|pantheonsite|flywheelsites|flywheelstaging|cloudwaysapps|myftpupload|instawp)\.|\.(webflow\.io|netlify\.app|vercel\.app)$/i.test(S_(h));
  const emailsIn = s => [...S_(s).matchAll(/[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[a-z]{2,}/gi)].map(m => m[0].toLowerCase());
  const FREE = /^(gmail\.com|googlemail\.com|ymail\.com|rocketmail\.com|msn\.com|icloud\.com|me\.com|mac\.com|aol\.com|proton\.me|protonmail\.com|pm\.me|gmx\.[a-z]+|mail\.com|yandex\.[a-z]+|zoho\.com|ukr\.net|i\.ua|meta\.ua|web\.de|t-online\.de|orange\.fr|free\.fr|laposte\.net|libero\.it|seznam\.cz|wp\.pl|o2\.pl|interia\.pl|onet\.pl|qq\.com|163\.com|(yahoo|hotmail|outlook|live)\.[a-z.]+)$/;
  const TESTDOM = /(^|\.)(example\.[a-z.]+|[a-z0-9-]+\.(test|local|localhost|invalid|example)|localhost|mailinator\.com|yopmail\.[a-z]+|guerrillamail\.[a-z]+|sharklasers\.com|10minutemail\.[a-z]+|temp-?mail\.[a-z]+|maildrop\.cc|trashmail\.[a-z]+)$/;
  const TESTLOCAL = /^test|(^|[._+-])(test|testing|tester|qa|dev|demo|dummy|fake|sample|example)\d*([._+-]|$)/;
  const TESTADDR = arr(cfg('testAddresses')).map(x => x.toLowerCase());
  const AGENCY = arr(cfg('agencyEmailDomains', 'agencyDomains')).concat(arr(CFG.agency && CFG.agency.domains)).map(x => x.toLowerCase().replace(/^@/, ''));
  const CLIENT = arr(cfg('clientRecipients', 'allowedRecipients')).map(x => x.toLowerCase());
  const mailKind = e => {
    e = S_(e).toLowerCase(); const [l, d = ''] = e.split('@');
    if (AGENCY.some(a => (a.includes('@') ? a === e : onDomain(d, a)))) return 'agency';
    if (TESTADDR.includes(e) || TESTDOM.test(d) || TESTLOCAL.test(l)) return 'test';
    if (FREE.test(d) && !CLIENT.includes(e)) return 'free';
    return 'ok';
  };

  // ---------- plugin / theme knowledge (WordPress ecosystem slugs, no site-specific values)
  const dirOf = p => S_(p).split('/')[0].toLowerCase();
  const DEV_PLUGINS = /^(query-monitor|debug-bar(-.+)?|fakerpress|theme-check|wp-reset|user-switching|wp-crontrol|developer|log-deprecated-notices|show-current-template|what-the-file|rewrite-rules-inspector|transients-manager|hello-dolly|hello)$/;
  const MIGRATION_PLUGINS = /^(all-in-one-wp-migration(-.+)?|duplicator(-pro)?|wp-migrate-db(-pro)?(-.+)?|migrate-guru|wp-staging(-pro)?|prime-mover|wp-sync-db|local-sync)$/;
  const BACKUP_PLUGINS = /^(updraftplus|wpvivid-backuprestore|backwpup|blogvault-real-time-backup|backup-backup)$/;
  const CACHE_PLUGINS = ['wp-rocket', 'w3-total-cache', 'litespeed-cache', 'wp-super-cache', 'wp-fastest-cache', 'sg-cachepress', 'breeze', 'cache-enabler', 'nitropack', 'flying-press', 'flyingpress', 'hummingbird-performance', 'wp-hummingbird', 'wp-optimize', 'comet-cache', 'swift-performance', 'swift-performance-lite', 'powered-cache', 'wp-cloudflare-page-cache', 'cachify', 'borlabs-cache', 'speedycache'].concat(arr(cfg('cachePlugins')).map(x => x.toLowerCase()));
  const IMAGE_PLUGINS = ['imagify', 'shortpixel-image-optimiser', 'shortpixel-adaptive-images', 'ewww-image-optimizer', 'ewww-image-optimizer-cloud', 'wp-smushit', 'wp-smush-pro', 'optimole-wp', 'tiny-compress-images', 'webp-express', 'webp-converter-for-media', 'robin-image-optimizer', 'resmushit-image-optimizer', 'image-optimization', 'litespeed-cache', 'sg-cachepress', 'wp-optimize'].concat(arr(cfg('imagePlugins')).map(x => x.toLowerCase()));
  const HOST_CACHE_HEADER = /^(x-cache|x-cache-status|x-kinsta-cache|x-wpe-cached|wpe-backend|x-cacheable|x-litespeed-cache|x-proxy-cache|x-sg-cache|x-varnish|x-fastcgi-cache|x-nginx-cache|x-srcache-fetch-status|x-ac|x-batcache|x-nc|x-cache-enabled|x-hcdn-cache-status)$/i;
  const DEV_MU = new RegExp(['local-by-flywheel', 'flywheel-live-link', 'live-link', '^local-', 'localwp', 'devkinsta', 'lando', 'valet', 'mailhog', 'mailpit'].concat(arr(cfg('devMuPlugins')).map(esc)).join('|'), 'i');
  const HOST_MU = /wpengine|wpe-|kinsta|^sg-|siteground|flywheel|pantheon|wpcomsh|wpcom|godaddy|gd-system|pressable|cloudways|bluehost|endurance|dreamhost|liquidweb|nexcess|wpmudev|rocket-?net|hostinger|ionos/i;
  const BUILDERS = [[/^classic-editor$/, 'Classic Editor'], [/^disable-gutenberg$/, 'Disable Gutenberg'], [/^elementor(-pro)?$/, 'Elementor'], [/^js_composer/, 'WPBakery'], [/^divi-builder$/, 'Divi Builder'], [/^(bb-plugin|beaver-builder-lite-version)$/, 'Beaver Builder'], [/^oxygen/, 'Oxygen'], [/^fusion-builder$/, 'Avada Builder'], [/^siteorigin-panels$/, 'SiteOrigin'], [/^brizy/, 'Brizy'], [/^thrive-visual-editor$/, 'Thrive Architect'], [/^breakdance$/, 'Breakdance'], [/^zionbuilder/, 'Zion Builder'], [/^themify-builder$/, 'Themify Builder'], [/^live-composer/, 'Live Composer'], [/^kingcomposer$/, 'KingComposer']];
  const OPAQUE_FIELDS = /^(advanced-custom-fields(-pro)?|acf|secure-custom-fields|meta-box|pods|carbon-fields|jet-engine|types|custom-field-suite)$/;
  // optional: true → counted only when its form markup is seen on a crawled page (the plugin is often active without forms)
  const FORM_PROVIDERS = [
    { dir: /^contact-form-7$/, key: 'cf7', name: 'Contact Form 7', where: 'admin.php?page=wpcf7 → form → Mail / Mail (2)', marker: /\bwpcf7\b/ },
    { dir: /^gravityforms$/, key: 'gravity', name: 'Gravity Forms', where: 'admin.php?page=gf_edit_forms → form → Settings → Notifications', marker: /gform_wrapper|gform_fields/ },
    { dir: /^wpforms(-lite)?$/, key: 'wpforms', name: 'WPForms', where: 'admin.php?page=wpforms-overview → form → Settings → Notifications', marker: /wpforms-form|wpforms-container/ },
    { dir: /^fluentform$/, key: 'fluent', name: 'Fluent Forms', where: 'admin.php?page=fluent_forms → form → Settings & Integrations → Email Notifications', marker: /fluentform|frm-fluent-form/ },
    { dir: /^ninja-forms$/, key: 'ninja', name: 'Ninja Forms', where: 'admin.php?page=ninja-forms → form → Emails & Actions', marker: /nf-form-cont|ninja-forms-form/ },
    { dir: /^formidable$/, key: 'formidable', name: 'Formidable Forms', where: 'admin.php?page=formidable → form → Settings → Actions & Notifications', marker: /frm_forms|frm-show-form/ },
    { dir: /^forminator$/, key: 'forminator', name: 'Forminator', where: 'admin.php?page=forminator-cform → form → Email Notifications', marker: /forminator-custom-form|forminator-ui/ },
    { dir: /^everest-forms$/, key: 'everest', name: 'Everest Forms', where: 'admin.php?page=evf-builder → form → Settings → Email', marker: /evf-form|everest-form/ },
    { dir: /^ws-form(-pro)?$/, key: 'wsform', name: 'WS Form', where: 'admin.php?page=ws-form → form → Actions → Send Email', marker: /wsf-form/ },
    { dir: /^elementor-pro$/, key: 'elementor', name: 'Elementor Pro forms', where: 'the page in Elementor → Form widget → Actions After Submit → Email / Email 2', marker: /elementor-form\b/, optional: true },
    { dir: /^jetpack$/, key: 'jetpack', name: 'Jetpack forms', where: 'the page in the block editor → Form block → form settings → notifications', marker: /jetpack-contact-form|wp-block-jetpack-contact-form/, optional: true },
  ];
  const NONCONTENT = /^(attachment|nav_menu_item|wp_template|wp_template_part|wp_global_styles|wp_navigation|wp_font_family|wp_font_face)$/;
  const BUILTIN = /^(post|page|wp_block)$/;
  const UNCAT = /uncategori[sz]ed|sin-categoria|sem-categoria|non-classe|allgemein|senza-categoria|geen-categorie|bez-kategorii|bez-rubriki|без-рубрики|без-категорії|без-категории|okategoriserade|ukategoriseret|ukategorisert|luokittelematon|nezarazeno/i;
  const TESTSLUG = /(^|-)(test|testing|sandbox|dummy|lorem|lorem-ipsum|asdf|qwerty)\d*(-|$)/i;

  // ---------- media reference extraction (file names and attachment IDs)
  const FILE_RE = /[\w%.~+@-]+\.(?:jpe?g|png|gif|webp|avif|svg|bmp|tiff?|ico|heic|heif|pdf|mp4|m4v|webm|mov|ogv|mp3|m4a|wav|ogg|oga|zip|docx?|xlsx?|pptx?|csv|txt|json|vtt|srt|woff2?|ttf|otf|eps|psd|odt|ods|rtf)(?![\w])/gi;
  const stemOf = f => { let s = S_(f).toLowerCase().replace(/(\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?|heic|heif))+$/, '').replace(/\.[a-z0-9]+$/, ''), prev; do { prev = s; s = s.replace(/-\d+x\d+$/, '').replace(/-e\d{13}$/, '').replace(/-(scaled|rotated)$/, ''); } while (s !== prev); return s; };
  const ID_CONTENT = [/wp-image-(\d+)/g, /"(?:id|mediaId|mediaID|imageId|imageID|image_id|attachmentId|attachment_id|backgroundImageId|featuredImageId|logo|siteLogo|poster_id|video_id|audio_id|file_id)"\s*:\s*"?(\d+)/g, /data-(?:id|attachment-id|image-id|media-id)=["']?(\d+)/g, /\bids=["']([\d,\s]+)["']/g, /"ids"\s*:\s*\[([^\]]*)\]/g, /\battachment_(\d+)\b/g];
  const ID_RENDER = [/wp-image-(\d+)/g, /data-(?:attachment-id|image-id|media-id)=["']?(\d+)/g, /data-id=["']?(\d+)/g];
  const MEDIA_KEY = /(^|_)(featured_media|site_logo|site_icon|custom_logo|image|img|logo|icon|photo|picture|thumbnail|thumb|media|attachment|gallery|file|video|audio|poster|background|bg|avatar|banner|cover|hero)(_?ids?|s)?$/i;
  const newRefs = () => ({ tokens: new Set(), stems: new Set(), ids: new Set() });
  const scanText = (s, R, idRes) => {
    if (!s) return;
    for (const m of s.matchAll(FILE_RE)) { const t = decode(m[0]).toLowerCase(); R.tokens.add(t); R.tokens.add(t.replace(/\.(webp|avif)$/, '')); R.stems.add(stemOf(t)); }
    for (const re of idRes) for (const m of s.matchAll(re)) S_(m[1]).split(/[^\d]+/).filter(Boolean).forEach(n => R.ids.add(+n));
  };
  const walkRefs = (v, k, inFields, R) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') { scanText(v, R, ID_CONTENT); if (inFields && /^\d+$/.test(v)) R.ids.add(+v); return; }
    if (typeof v === 'number') { if (inFields || MEDIA_KEY.test(S_(k))) R.ids.add(v); return; }
    if (Array.isArray(v)) { v.forEach(x => walkRefs(x, k, inFields, R)); return; }
    if (typeof v === 'object') for (const kk of Object.keys(v)) { if (kk === '_links') continue; walkRefs(v[kk], kk, inFields || /^(acf|meta|fields|cmb2|metabox|carbon_fields)$/i.test(kk), R); }
  };

  // ---------- REST, admin screens and front end — every call is GET
  const ix = location.pathname.indexOf('/wp-admin/');
  const ADMIN = location.origin + (ix >= 0 ? location.pathname.slice(0, ix) : '') + '/wp-admin/';
  let ROOT = '', NONCE = '', HOME = '', FRONT_CRED = 'omit';
  const W = {};
  const fromScripts = re => { for (const s of document.scripts) { const m = (s.textContent || '').match(re); if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; } } } return ''; };
  const restUrl = p => (ROOT.includes('?') ? ROOT + p.replace(/^\//, '').replace('?', '&') : ROOT.replace(/\/$/, '') + p);
  const J = async p => {
    try {
      const r = await fetch(restUrl(p), { credentials: 'same-origin', cache: 'no-store', headers: NONCE ? { 'X-WP-Nonce': NONCE } : {} });
      const t = await r.text(); let j = null;
      try { j = JSON.parse(t); } catch (e) { const k = t.search(/[[{]/); if (k > 0) { try { j = JSON.parse(t.slice(k)); } catch (e2) { j = null; } } }
      if (r.ok && j !== null) return { s: r.status, j, total: r.headers.get('X-WP-Total'), pages: +(r.headers.get('X-WP-TotalPages') || 1) };
      return { s: r.status, j: null, err: 'HTTP ' + r.status + (j && j.code ? ' ' + j.code : '') + (r.ok ? ' (not JSON)' : '') };
    } catch (e) { return { s: 0, j: null, err: 'network: ' + e.message }; }
  };
  const tol = async (p, what) => { const r = await J(p); return r.err ? { err: `${what}: ${r.err}` } : { j: r.j, total: r.total }; };
  const use = (x, what) => { if (!x || x.err || x.j === undefined || x.j === null) throw new Error((x && x.err) || `${what} not loaded`); return x.j; };
  const all = async (base, q = '', ns = 'wp/v2', what) => {
    let out = [];
    for (let p = 1; p <= 100; p++) {
      const r = await J(`/${ns}/${base}?per_page=100&page=${p}${q}`);
      if (r.err) throw new Error(`${what || base}: ${r.err}`);
      if (!Array.isArray(r.j)) throw new Error(`${what || base}: not a list`);
      out = out.concat(r.j);
      if (p >= r.pages || r.j.length < 100) break;
      if (p === 100) out.capped = true;
    }
    return out;
  };
  const doc = async u => {
    const r = await fetch(u, { credentials: 'same-origin', cache: 'no-store' });
    const short = u.replace(location.origin, '');
    if (!r.ok) throw new Error(`${short}: HTTP ${r.status}`);
    if (/wp-login\.php/.test(r.url)) throw new Error(`${short}: redirected to the login screen`);
    return PARSER.parseFromString(await r.text(), 'text/html');
  };
  const fget = async (u, cred) => {
    const url = new URL(u, HOME || location.origin);
    if (url.origin !== location.origin) throw new Error(`front end on another origin (${url.origin}) than this wp-admin (${location.origin})`);
    const r = await fetch(url.href, { credentials: cred || FRONT_CRED, cache: 'no-store', redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    return { s: r.status, ok: r.ok, url: r.url, h: r.headers, ct, text: !ct || /html|xml|text|json/i.test(ct) ? await r.text() : '' };
  };
  const pageKey = (href, base) => { try { const x = new URL(href, base || HOME); if (x.origin !== new URL(HOME).origin) return ''; return (decode(x.pathname).replace(/\/+$/, '') || '/') + (x.search || ''); } catch (e) { return ''; } };
  const activeDirs = () => (W.plugins && W.plugins.j ? W.plugins.j.filter(p => p.status === 'active' || p.status === 'network-active').map(p => dirOf(p.plugin)) : []);
  const activeTheme = () => (W.themes && W.themes.j ? W.themes.j.find(t => t.status === 'active') || null : null);
  const builders = () => {
    const d = activeDirs(); const out = BUILDERS.filter(([re]) => d.some(x => re.test(x))).map(([, n]) => n);
    const t = activeTheme(); const tn = t ? S_(t.template || t.stylesheet) : '';
    if (/^(divi|extra|avada|bricks)$/i.test(tn)) out.push(tn + ' theme');
    return out;
  };
  const editorState = () => {
    try {
      const sel = n => { try { return window.wp && wp.data && wp.data.select(n); } catch (e) { return null; } };
      const ed = sel('core/editor'), core = sel('core');
      const dirtyEntities = core && core.__experimentalGetDirtyEntityRecords ? core.__experimentalGetDirtyEntityRecords().length : null;
      if (ed && ed.getCurrentPostId) return { postId: ed.getCurrentPostId(), dirty: !!ed.isEditedPostDirty(), lockedByOther: !!(ed.isPostLocked && ed.isPostLocked()), dirtyEntities };
      return dirtyEntities === null ? null : { dirtyEntities };
    } catch (e) { return null; }
  };
  const mkDoc = (t, o) => { const ti = o.title || {}; return { t, id: o.id, slug: S_(o.slug), status: S_(o.status) || 'publish', title: textOf(ti.raw !== undefined && ti.raw !== null ? ti.raw : ti.rendered), titleR: textOf(ti.rendered), link: S_(o.link), raw: o.content && typeof o.content.raw === 'string' ? o.content.raw : null, cs: o.comment_status, ps: o.ping_status, date: S_(o.date_gmt || o.date), o }; };
  const isMailForm = f => {
    if (f.matches('[role=search]') || f.querySelector('input[type=password]')) return false;
    if (/wp-login\.php|wp-comments-post\.php/.test(f.getAttribute('action') || '')) return false;
    const fields = [...f.querySelectorAll('input, textarea, select')].filter(x => !/^(hidden|submit|button|search|checkbox|radio|image|reset)$/i.test(x.getAttribute('type') || ''));
    return fields.length > 0 && !(fields.length === 1 && fields[0].getAttribute('name') === 's');
  };
  const CF7_ID = /name=["']_wpcf7["'][^>]*?value=["'](\d+)|value=["'](\d+)["'][^>]*?name=["']_wpcf7["']/g;
  const mkPage = (url, html) => {
    const d = PARSER.parseFromString(html, 'text/html');
    const links = new Set(); for (const a of d.querySelectorAll('a[href]')) { const k = pageKey(a.getAttribute('href'), url); if (k) links.add(k); }
    const next = []; for (const a of d.querySelectorAll('a[rel~=next], link[rel~=next], a.next.page-numbers, .wp-block-query-pagination-next, .nav-previous a, a.next')) { const h = a.getAttribute('href'); if (h) { try { next.push(new URL(h, url).href); } catch (e) { } } }
    const markers = new Set(FORM_PROVIDERS.filter(p => p.marker.test(html)).map(p => p.key));
    const cf7 = new Set([...html.matchAll(CF7_ID)].map(m => +(m[1] || m[2])));
    let mailForms = 0; const actions = new Set();
    for (const f of d.querySelectorAll('form')) if (isMailForm(f)) { mailForms++; const a = f.getAttribute('action'); if (a) { try { const x = new URL(a, url); actions.add(x.origin === location.origin ? x.pathname : x.host); } catch (e) { } } }
    d.querySelectorAll('script,style,noscript,template').forEach(x => x.remove());
    return { url, key: pageKey(url), links, next, text: normT(d.body ? d.body.textContent : '').slice(0, 400000), markers, cf7, mailForms, actions: [...actions] };
  };

  // ---------- rendered pages: QA_WP_CFG.pages + sitemap (robots.txt, then standard paths) + archive pagination
  let crawlP = null;
  const loadCrawl = () => crawlP || (crawlP = (async () => {
    const cr = W.crawl = { pages: [], source: [], sitemaps: [], tried: [], offsite: 0, total: 0, capped: false, failed: [], refs: newRefs(), complete: false };
    const max = num(cfg('maxRenderedPages'), 300), gap = num(cfg('throttleMs'), 300);
    const queue = new Map(); const enqueue = u => { const k = pageKey(u); if (k && !queue.has(k)) queue.set(k, new URL(u, HOME).href.split('#')[0]); };
    enqueue(HOME);
    // pages: a list of paths / URLs, or qa-run's page plan object (qa-out/pages.json: { all: [...], sampled: [...] })
    const pagesIn = CFG.pages && typeof CFG.pages === 'object' && !Array.isArray(CFG.pages) ? (CFG.pages.all || CFG.pages.sampled || CFG.pages.pages) : CFG.pages;
    const cfgPages = arr(pagesIn).filter(p => !/\/qa-404-/.test(p));
    if (cfgPages.length) { const b = S_(CFG.base || RES._base).replace(/\/+$/, ''); cfgPages.forEach(p => enqueue(/^https?:/i.test(p) ? p : b + (p.startsWith('/') ? p : '/' + p))); cr.source.push(`QA_WP_CFG.pages (${cfgPages.length})`); }
    const seen = new Set();
    const readSm = async (u, depth) => {
      if (depth > 2 || seen.has(u)) return 0; seen.add(u); cr.tried.push(u.replace(location.origin, ''));
      let f; try { f = await fget(u); } catch (e) { cr.offsite++; return 0; }
      if (!f.ok || !/<(urlset|sitemapindex)\b/i.test(f.text)) return 0;
      cr.sitemaps.push(u.replace(location.origin, ''));
      const locs = [...f.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map(m => m[1].replace(/&amp;/g, '&'));
      let n = 0;
      if (/<sitemapindex\b/i.test(f.text)) { for (const l of locs) { try { n += await readSm(new URL(l, u).href, depth + 1); } catch (e) { cr.offsite++; } } }
      else for (const l of locs) { if (pageKey(l)) { enqueue(l); n++; } else cr.offsite++; }
      return n;
    };
    let found = 0;
    try { const rb = await fget(location.origin + '/robots.txt'); if (rb.ok) for (const m of rb.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) { try { found += await readSm(new URL(m[1], location.origin).href, 0); } catch (e) { cr.offsite++; } } } catch (e) { }
    if (!found) for (const c of ['wp-sitemap.xml', 'sitemap_index.xml', 'sitemap.xml', 'sitemaps.xml', '?sitemap=index']) { found += await readSm(HOME + c, 0); if (found) break; }
    if (found) cr.source.push(`sitemap ${cr.sitemaps[0]} (${found} URLs)`);
    const done = new Set();
    for (const [k, u] of queue) {
      if (done.size >= max) { cr.capped = true; break; }
      done.add(k);
      try {
        let html;
        if (k === pageKey(HOME) && W.front && W.front.html) html = W.front.html;
        else { const f = await fget(u); await sleep(gap); if (!f.ok || !/html/i.test(f.ct)) { cr.failed.push(`${k} (HTTP ${f.s})`); continue; } html = f.text; }
        scanText(html, cr.refs, ID_RENDER);
        const p = mkPage(u, html); cr.pages.push(p);
        p.next.forEach(enqueue); // archive pagination is part of the site, not of the sitemap
      } catch (e) { cr.failed.push(`${k} (${e.message})`); }
    }
    cr.total = queue.size;
    cr.complete = cr.sitemaps.length > 0 && !cr.capped && cr.failed.length === 0;
    RES._crawl = { source: cr.source.join(' + ') || 'front page only', sitemaps: cr.sitemaps, tried: cr.tried.slice(0, 12), pages: cr.pages.length, queued: cr.total, capped: cr.capped, failed: cr.failed.slice(0, 20), offsite: cr.offsite, complete: cr.complete };
    return cr;
  })());

  // ======================================================================================= main
  const main = async () => {
    if (ix < 0) throw new Error(`this tab is not a wp-admin screen (${location.pathname})`);
    // REST root and nonce that work on subfolder installs, multisite sub-sites and plain permalinks
    ROOT = (window.wpApiSettings && wpApiSettings.root) || fromScripts(/createRootURLMiddleware\(\s*"((?:[^"\\]|\\.)*)"/) || '';
    NONCE = (window.wpApiSettings && wpApiSettings.nonce) || (window.wp && wp.apiFetch && wp.apiFetch.nonceMiddleware && wp.apiFetch.nonceMiddleware.nonce) || fromScripts(/createNonceMiddleware\(\s*"((?:[^"\\]|\\.)*)"/) || '';
    const ajaxNonce = async () => { try { const r = await fetch(ADMIN + 'admin-ajax.php?action=rest-nonce', { credentials: 'same-origin', cache: 'no-store' }); const t = (await r.text()).trim(); return r.ok && /^[a-f0-9]{6,20}$/i.test(t) ? t : ''; } catch (e) { return ''; } };
    if (!NONCE) NONCE = await ajaxNonce();
    let index = null; const tried = [];
    const probe = async root => { ROOT = root; tried.push(root); const r = await J('/'); return r.j && Array.isArray(r.j.namespaces) ? r.j : null; };
    if (ROOT) index = await probe(ROOT);
    if (!index) { const site = ADMIN.replace(/wp-admin\/$/, ''); for (const c of [site + 'wp-json/', location.origin + '/wp-json/', site + '?rest_route=/', site + 'index.php?rest_route=/']) { if (tried.includes(c)) continue; index = await probe(c); if (index) break; } }
    if (!index) throw new Error('REST API index not found (tried ' + tried.join(', ') + ')');
    W.index = index; RES._admin = ADMIN; RES._rest = ROOT; RES._nonce = !!NONCE;
    QA.step = 'access';
    let Sr = await J('/wp/v2/settings');
    if (Sr.err && /HTTP 40[13]/.test(Sr.err)) { const fresh = await ajaxNonce(); if (fresh && fresh !== NONCE) { NONCE = fresh; Sr = await J('/wp/v2/settings'); } } // a tab left open past the nonce lifetime
    if (Sr.err) {
      const me = await J('/wp/v2/users/me?context=edit');
      throw new Error(me.err ? `REST API not authenticated (${me.err}${NONCE ? '' : '; no REST nonce found on this screen'})` : `the logged-in user cannot read site settings (${Sr.err}; roles: ${(me.j.roles || []).join(', ') || 'none'}) — an administrator is needed`);
    }
    const S = W.S = Sr.j;
    const me = await J('/wp/v2/users/me?context=edit&_fields=id,roles'); RES._user = { roles: (me.j && me.j.roles) || [] };
    HOME = String(index.home || S.url || location.origin).replace(/\/+$/, '') + '/';
    RES._base = HOME.replace(/\/+$/, '');
    RES._platform = { name: 'wordpress', evidence: ['wp-admin REST API answered for an administrator'] };
    const homeHost = new URL(HOME).hostname;
    if (RAWCFG && CFG.base && domainOf(CFG.base) !== host0(homeHost)) throw new Error(`QA_WP_CFG.base (${CFG.base}) is not this site (${RES._base}) — build QA_WP_CFG from this site's qa-target.json`);
    RES._cfg = RAWCFG ? { staging: CFG.staging === undefined ? null : !!CFG.staging, productionDomain: domainOf(cfg('productionDomain')) || null, themeAuthor: cfg('themeAuthor') || null, agencyEmailDomains: AGENCY, testAddresses: TESTADDR.length, clientRecipients: CLIENT.length, requiredPlugins: arr(cfg('requiredPlugins')), requireCachePlugin: !!cfg('requireCachePlugin'), requireImagePlugin: !!cfg('requireImagePlugin'), mailSubjectHasPage: cfg('mailSubjectHasPage') === true, autoReply: cfg('autoReply') !== false, pages: arr(CFG.pages).length, presence: !!CFG.presence } : null;
    if (!RAWCFG) { RES._cfgMissing = true; log('QA_WP_CFG not set: qa-target.json decisions were not applied — decision-dependent sub-checks are ❓ (see the header)'); }

    // ---- shared reads (each failure is carried to the checks that need it)
    QA.step = 'loading';
    W.types = await tol('/wp/v2/types?context=edit', 'content types'); W.typesEdit = !W.types.err;
    if (W.types.err) W.types = await tol('/wp/v2/types', 'content types');
    W.plugins = await tol('/wp/v2/plugins', 'plugin list');
    W.themes = await tol('/wp/v2/themes', 'theme list');
    W.tpl = await tol('/wp/v2/templates?context=edit', 'templates');
    W.parts = await tol('/wp/v2/template-parts?context=edit', 'template parts');
    try { const menu = document.querySelector('#adminmenu') ? document : await doc(ADMIN + 'index.php'); W.menuTypes = [...new Set([...menu.querySelectorAll('#adminmenu a[href*="post_type="]')].map(a => (S_(a.getAttribute('href')).match(/[?&]post_type=([\w-]+)/) || [])[1]).filter(Boolean))]; } catch (e) { W.menuTypes = null; }
    W.hiddenTypes = W.menuTypes && W.types.j ? W.menuTypes.filter(s => !W.types.j[s] && !/^(acf-|wpcf7)/.test(s)) : [];
    // front page: anonymous first; a gated staging falls back to this session
    try {
      let f = await fget(HOME, 'omit'); let gate = ''; W.anonHeaders = f.ok ? f.h : null;
      if (!f.ok) { const g = await fget(HOME, 'same-origin'); if (g.ok) { gate = `HTTP ${f.s} for visitors`; f = g; FRONT_CRED = 'same-origin'; } }
      else if (/<input[^>]+type=["']?password/i.test(f.text)) { const g = await fget(HOME, 'same-origin'); if (g.ok && !/<input[^>]+type=["']?password/i.test(g.text)) { gate = 'password page for visitors'; f = g; FRONT_CRED = 'same-origin'; } }
      if (!f.ok) throw new Error(`front page ${HOME}: HTTP ${f.s}`);
      W.front = { html: f.text, doc: PARSER.parseFromString(f.text, 'text/html'), gate };
      if (gate) log(`front end gated (${gate}): rendered pages are read with this logged-in session`);
    } catch (e) { W.front = { err: e.message }; }
    // content of every REST-exposed content type, in every state — whatever its slug or namespace
    W.ct = []; W.docs = []; W.typeErr = {}; W.typeNote = {};
    if (W.types.j) {
      W.ct = Object.entries(W.types.j).filter(([k, t]) => t && typeof t === 'object' && t.rest_base && !NONCONTENT.test(k)).map(([k, t]) => ({ slug: k, base: t.rest_base, ns: t.rest_namespace || 'wp/v2', viewable: t.viewable, caps: t.capabilities || null, hasArchive: !!t.has_archive, builtin: BUILTIN.test(k) }));
      for (const t of W.ct) {
        QA.step = 'loading ' + t.slug;
        try {
          let list;
          try { list = await all(t.base, '&context=edit&status=publish,future,draft,pending,private,trash', t.ns, t.slug); }
          catch (e) {
            if (/HTTP 400/.test(e.message)) { list = await all(t.base, '&context=edit', t.ns, t.slug); W.typeNote[t.slug] = 'published entries only (status filter refused)'; }
            else if (/HTTP 40[13]/.test(e.message)) { t.forbidden = e.message.replace(/^[^:]+: /, ''); list = await all(t.base, '', t.ns, t.slug); W.typeNote[t.slug] = `published entries in view context only (${t.forbidden})`; }
            else throw e;
          }
          if (list.capped) W.typeNote[t.slug] = (W.typeNote[t.slug] ? W.typeNote[t.slug] + '; ' : '') + 'first 10000 entries only';
          t.n = list.length;
          for (const o of list) { delete o._links; W.docs.push(mkDoc(t, o)); }
        } catch (e) { W.typeErr[t.slug] = e.message; }
      }
    }
    const typeErrTxt = () => Object.entries(W.typeErr).map(([k, v]) => `${k} (${v.replace(/^[^:]+: /, '')})`).join(', ');
    const live = d => d.status !== 'trash';

    // ================================================================ WP-08 users
    await section('users', ['WP-08'], async () => {
      const users = await all('users', '&context=edit&_fields=id,username,email,roles', 'wp/v2', 'user list');
      if (!users.length) throw new Error('the user list came back empty');
      const roles = {}; users.forEach(u => (u.roles || []).forEach(r => { roles[r] = (roles[r] || 0) + 1; }));
      for (const u of users) {
        const e = S_(u.email).toLowerCase(), k = e ? mailKind(e) : 'ok', role = (u.roles || []).join(',');
        if (k === 'test') add('WP-08', { user: u.username, role, email: u.email, why: 'test / dev / example email' });
        else if (k === 'agency') ask('WP-08', { user: u.username, role, email: u.email, why: 'agency address — keep only if agreed for support after handover' });
        if (/^(admin|administrator|root|test|demo|user)$/i.test(S_(u.username))) ask('WP-08', { user: u.username, role, why: `username "${u.username}" is guessable` });
      }
      const admins = users.filter(u => (u.roles || []).includes('administrator')), maxA = num(cfg('maxAdmins'), 2);
      if (admins.length > maxA) ask('WP-08', { admins: admins.map(u => u.username), why: `${admins.length} administrators (decisions.maxAdmins ${maxA}) — confirm each one is needed` });
      const ae = S_(S.email).toLowerCase(); if (ae && mailKind(ae) === 'test') add('WP-08', { setting: 'Administration Email Address', email: S.email, why: 'test / dev / example address receives the site notices' });
      note('WP-08', `${users.length} users — ${Object.entries(roles).map(([r, n]) => `${r} ${n}`).join(' · ')} · administrators: ${admins.map(u => u.username).join(', ') || 'none'} · admin email ${S.email || '?'}`);
      ran('WP-08', users.length);
    });

    // ================================================================ WP-03 plugins, must-use plugins, page cache, updates
    await section('plugins', ['WP-03'], async () => {
      const plugins = use(W.plugins, 'plugin list'); const dirs = activeDirs();
      const has = list => dirs.find(d => list.some(s => d === s || d.startsWith(s + '-')));
      for (const p of plugins) {
        const d = dirOf(p.plugin);
        if (DEV_PLUGINS.test(d)) add('WP-03', { plugin: p.plugin, status: p.status, why: 'development / default plugin — delete before handover' });
        else if (MIGRATION_PLUGINS.test(d)) add('WP-03', { plugin: p.plugin, status: p.status, why: 'migration plugin left from the build — delete' });
        else if (BACKUP_PLUGINS.test(d)) ask('WP-03', { plugin: p.plugin, status: p.status, why: 'backup / migration plugin — keep only if it is the agreed backup' });
        if (p.status === 'inactive') ask('WP-03', { plugin: p.plugin, why: d === 'akismet' ? 'default plugin, inactive — delete' : 'installed but inactive — activate or delete' });
      }
      for (const r of arr(cfg('requiredPlugins')).map(x => x.toLowerCase())) if (!dirs.includes(dirOf(r))) add('WP-03', { plugin: r, why: 'required by decisions.requiredPlugins and not active' });
      // must-use plugins and drop-ins (data-plugin is the file name, so descriptions never match)
      let dropins = [];
      try {
        const mu = await doc(ADMIN + 'plugins.php?plugin_status=mustuse'); const prodDom = domainOf(cfg('productionDomain'));
        for (const tr of mu.querySelectorAll('#the-list tr[data-plugin]')) {
          const file = S_(tr.getAttribute('data-plugin')), title = S_((tr.querySelector('.plugin-title strong') || {}).textContent).trim(), id = `${title || file} (${file})`;
          if (DEV_MU.test(file) || DEV_MU.test(title)) add('WP-03', { mu: id, why: 'must-use plugin of a local development tool — delete' });
          else if (HOST_MU.test(file) || HOST_MU.test(title)) { if (prodDom && regDomain(homeHost) !== regDomain(prodDom)) ask('WP-03', { mu: id, why: `host must-use plugin of this build host — will ${prodDom} run on the same host?` }); else note('WP-03', `host must-use plugin: ${id}`); }
          else note('WP-03', `must-use plugin: ${id}`);
        }
        const di = await doc(ADMIN + 'plugins.php?plugin_status=dropins');
        dropins = [...di.querySelectorAll('#the-list tr')].map(tr => S_(tr.getAttribute('data-plugin') || (tr.querySelector('.plugin-title strong') || {}).textContent).trim()).filter(Boolean);
        if (dropins.length) note('WP-03', 'drop-ins: ' + dropins.join(', '));
      } catch (e) { partial('WP-03', 'must-use plugins / drop-ins not read: ' + e.message); }
      // page cache: a plugin, an advanced-cache.php drop-in, or host cache headers on the anonymous front page
      const cachePlugin = has(CACHE_PLUGINS);
      const hostHdr = W.anonHeaders ? [...W.anonHeaders.entries()].filter(([k, v]) => HOST_CACHE_HEADER.test(k) || (k === 'cf-cache-status' && !/DYNAMIC|BYPASS/i.test(v))).map(([k, v]) => `${k}: ${v}`) : [];
      if (cachePlugin) note('WP-03', `page cache plugin: ${cachePlugin}`);
      else if (dropins.some(x => /advanced-cache\.php/i.test(x)) || hostHdr.length) note('WP-03', `page cache without a plugin: ${dropins.filter(x => /advanced-cache/i.test(x)).concat(hostHdr).join(', ')}`);
      else (cfg('requireCachePlugin') ? add : ask)('WP-03', { why: `no page cache found: no caching plugin, no advanced-cache.php drop-in, no host cache header on the front page${W.anonHeaders ? '' : ' (front page not readable)'}` });
      const imgPlugin = has(IMAGE_PLUGINS);
      if (imgPlugin) note('WP-03', `image optimisation: ${imgPlugin}`);
      else if (W.front && W.front.html && /\.(webp|avif)\b|type=["']image\/(webp|avif)/i.test(W.front.html)) note('WP-03', 'no image plugin, but the front page already serves WebP/AVIF (host or CDN)');
      else (cfg('requireImagePlugin') ? add : ask)('WP-03', { why: 'no image optimisation plugin active and the front page serves no WebP/AVIF' });
      // pending updates (language-independent: form actions and checkbox values)
      try {
        const up = await doc(ADMIN + 'update-core.php');
        const pl = [...up.querySelectorAll('#update-plugins-table input[name="checked[]"]')].map(x => x.value), th = [...up.querySelectorAll('#update-themes-table input[name="checked[]"]')].map(x => x.value);
        if (up.querySelector('form[action*="do-core-upgrade"]')) add('WP-03', { why: 'WordPress core update pending' });
        if (pl.length) add('WP-03', { why: `plugin updates pending (${pl.length})`, items: pl });
        if (th.length) add('WP-03', { why: `theme updates pending (${th.length})`, items: th });
      } catch (e) { partial('WP-03', `updates not readable (${e.message}) — file changes may be disabled on this host: check updates with the host, then record.cjs`); }
      note('WP-03', `${plugins.length} plugins, ${dirs.length} active`);
      ran('WP-03', plugins.length || 1);
    });

    // ================================================================ WP-04 themes
    await section('themes', ['WP-04'], async () => {
      const themes = use(W.themes, 'theme list'); const act = activeTheme();
      if (!act) throw new Error('no active theme in the theme list');
      const parent = act.template && act.template !== act.stylesheet ? act.template : null;
      const stock = themes.filter(t => /^twenty/i.test(t.stylesheet));
      if (stock.length > 1) add('WP-04', { why: `${stock.length} stock themes — keep one as the fallback`, themes: stock.map(t => t.stylesheet) });
      if (!stock.length && !/^twenty/i.test(act.stylesheet)) ask('WP-04', { why: 'no stock fallback theme installed (keep the latest default theme)' });
      themes.filter(t => t.status !== 'active' && !/^twenty/i.test(t.stylesheet) && t.stylesheet !== parent).forEach(t => ask('WP-04', { theme: t.stylesheet, why: 'inactive custom theme — delete unless agreed' }));
      const author = textOf(act.author && (act.author.raw || act.author.rendered)), want = cfg('themeAuthor');
      if (want) { if (!author.includes(String(want))) add('WP-04', { theme: act.stylesheet, author, why: `author is not "${want}" (decisions.themeAuthor)` }); }
      else ask('WP-04', { theme: act.stylesheet, author, why: 'decisions.themeAuthor is not set — confirm the theme author line' });
      if (act.screenshot !== undefined) { if (!act.screenshot) add('WP-04', { theme: act.stylesheet, why: 'active theme without screenshot.png' }); }
      else { try { const th = await doc(ADMIN + 'themes.php'); if (!th.querySelector('.theme.active .theme-screenshot img')) add('WP-04', { theme: act.stylesheet, why: 'active theme without screenshot.png' }); } catch (e) { partial('WP-04', 'screenshot not checked: ' + e.message); } }
      note('WP-04', `active theme ${act.stylesheet}${parent ? ' (child of ' + parent + ')' : ''} by ${author || '?'} · ${themes.length} installed`);
      ran('WP-04', themes.length);
    });

    // ================================================================ templates: WP-06, WP-10, WP-11, WP-12
    const act = activeTheme();
    const tpls = W.tpl.j || [], parts = W.parts.j || [];
    const isBlock = act && typeof act.is_block_theme === 'boolean' ? act.is_block_theme : tpls.some(t => t.has_theme_file);
    const themeFiles = async () => {
      if (W.files !== undefined) return W.files; W.files = null;
      try {
        const out = new Set();
        for (const ss of [...new Set([act.stylesheet, act.template].filter(Boolean))]) {
          const d = await doc(ADMIN + 'theme-editor.php?theme=' + encodeURIComponent(ss));
          const links = [...d.querySelectorAll('#templateside a[href*="file="]')];
          if (!links.length) throw new Error('theme file list not found');
          links.forEach(a => { const m = S_(a.getAttribute('href')).match(/[?&]file=([^&]+)/); const f = m ? decode(m[1]) : ''; if (f && !f.includes('/')) out.add(f.toLowerCase()); });
        }
        W.files = out;
      } catch (e) { W.filesErr = e.message; }
      return W.files;
    };
    const searchOnSite = () => !!((W.front.doc && W.front.doc.querySelector('form[role=search], input[type=search], input[name="s"], .wp-block-search')) || tpls.concat(parts).some(t => /<!--\s+wp:search\b/.test(S_(t.content && t.content.raw))));

    await section('templates saved over files', ['WP-06'], async () => {
      use(W.tpl, 'templates'); if (!act) throw new Error(W.themes.err || 'active theme unknown');
      const fromFiles = tpls.concat(parts).filter(t => t.has_theme_file);
      if (!isBlock && !fromFiles.length) { na('WP-06', `classic theme (${act.stylesheet}): no block templates or template parts in its files`); return; }
      tpls.concat(parts).filter(t => t.source === 'custom' && t.has_theme_file).forEach(t => add('WP-06', { template: t.slug, type: t.type, modified: S_(t.modified).slice(0, 10), why: 'saved in the database over the theme file' }));
      const dbOnly = tpls.concat(parts).filter(t => t.source === 'custom' && !t.has_theme_file).map(t => t.slug);
      note('WP-06', `${tpls.length} templates, ${parts.length} template parts` + (dbOnly.length ? ` · created in the Site Editor only: ${dbOnly.join(', ')}` : ''));
      ran('WP-06', tpls.length + parts.length);
    });

    await section('404 template', ['WP-10'], async () => {
      use(W.tpl, 'templates'); if (!act) throw new Error(W.themes.err || 'active theme unknown');
      if (isBlock) {
        const t = tpls.find(x => x.slug === '404');
        if (!t) add('WP-10', { theme: act.stylesheet, why: 'block theme has no 404 template — WordPress serves the index template for missing pages' });
        else if (!t.has_theme_file) ask('WP-10', { theme: act.stylesheet, why: '404 template exists only in the database (Site Editor), not in the theme files' });
        else note('WP-10', `404 template from the theme files${t.source === 'custom' ? ' (customised in the database)' : ''}`);
        ran('WP-10', 1); return;
      }
      const files = await themeFiles();
      if (!files) { na('WP-10', `classic theme (${act.stylesheet}): the row covers block themes; theme files not listable (${W.filesErr}) — PAGE-02 checks the rendered 404`); return; }
      if (!files.has('404.php')) add('WP-10', { theme: act.stylesheet, why: 'classic theme without 404.php — WordPress serves index.php for missing pages' }); else note('WP-10', 'classic theme: 404.php present');
      ran('WP-10', 1);
    });

    await section('theme templates', ['WP-11'], async () => {
      use(W.tpl, 'templates'); use(W.types, 'content types'); if (!act) throw new Error(W.themes.err || 'active theme unknown');
      if (W.front.err) partial('WP-11', 'search presence read from templates only: ' + W.front.err);
      const pub = slug => W.docs.filter(d => d.t.slug === slug && d.status === 'publish').length;
      const bl = builders(); // a builder's theme templates may render these screens
      const flag = it => (bl.length ? ask('WP-11', Object.assign(it, { why: it.why + ` (a builder is active: ${bl.join(', ')} — confirm it supplies this template)` })) : add('WP-11', it));
      let have, files = null;
      if (isBlock) have = n => tpls.some(t => t.slug === n);
      else { files = await themeFiles(); if (!files) { notRun('WP-11', `classic theme (${act.stylesheet}): PHP templates are not listable here (${W.filesErr}) — list single.php / archive.php / search.php in the theme folder, then record.cjs`); return; } have = n => files.has(n + '.php'); }
      const kind = isBlock ? 'template' : 'file';
      let rules = 0;
      if (pub('post')) {
        rules++; if (!['single-post', 'single', 'singular'].some(have)) flag({ type: 'post', why: `${pub('post')} published posts and no single ${kind} — WordPress falls back to index` });
        rules++; if (!['home', 'archive', 'category'].some(have)) ask('WP-11', { type: 'post', why: `no home / archive ${kind} — the blog index and archives fall back to index` });
      }
      for (const t of W.ct.filter(x => !x.builtin && x.viewable !== false && pub(x.slug))) {
        rules++; if (![`single-${t.slug}`, 'single', 'singular'].some(have)) flag({ type: t.slug, why: `${pub(t.slug)} published entries and no single ${kind} for them` });
        if (t.hasArchive) { rules++; if (![`archive-${t.slug}`, 'archive'].some(have)) ask('WP-11', { type: t.slug, why: `has an archive and no archive ${kind}` }); }
      }
      if (searchOnSite()) { rules++; if (!have('search')) flag({ why: `the site has search and no search ${kind} — results use index` }); }
      if (!rules) { na('WP-11', 'no posts, no content type with published entries and no search: no template is owed beyond index'); return; }
      note('WP-11', `${rules} template rule(s) checked against ${isBlock ? tpls.length + ' block templates' : files.size + ' theme files'}`);
      ran('WP-11', rules);
    });

    await section('global stylesheet', ['WP-12'], async () => {
      if (!act) throw new Error(W.themes.err || 'active theme unknown');
      const custom = {}; const merge = (a, b) => { if (b && typeof b === 'object' && !Array.isArray(b)) for (const k of Object.keys(b)) a[k] = a[k] && typeof a[k] === 'object' && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k], b[k]) : b[k]; return a; };
      const g = await J('/wp/v2/global-styles/themes/' + encodeURIComponent(act.stylesheet).replace(/%2F/gi, '/') + '?context=edit');
      if (g.err) { if (!isBlock) { na('WP-12', `classic theme (${act.stylesheet}) without readable theme.json global styles (${g.err})`); return; } throw new Error('theme global styles: ' + g.err); }
      merge(custom, g.j.settings && g.j.settings.custom);
      const ta = await J('/wp/v2/themes?status=active');
      const lk = ta.j && ta.j[0] && ta.j[0]._links && ta.j[0]._links['wp:user-global-styles'];
      const uid = lk && lk[0] && (S_(lk[0].href).match(/global-styles\/(\d+)/) || [])[1];
      if (uid) { const u = await J('/wp/v2/global-styles/' + uid + '?context=edit'); if (u.j) { W.userGlobal = u.j; merge(custom, u.j.settings && u.j.settings.custom); } else partial('WP-12', 'user global styles not read: ' + u.err); }
      const leaves = []; const flat = (o, p) => { for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, p.concat(k)); else leaves.push(p.concat(k)); } }; flat(custom, []);
      if (W.front.err) throw new Error(W.front.err);
      const el = W.front.doc.getElementById('global-styles-inline-css');
      if (!el) { if (!leaves.length && !isBlock) { na('WP-12', 'classic theme: no settings.custom and no generated global stylesheet'); return; } notRun('WP-12', 'no #global-styles-inline-css on the front page (a CSS optimiser may have combined or moved it) — view the front page with optimisation off, then rerun'); return; }
      const css = S_(el.textContent), key = s => S_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;
      if (open !== close) add('WP-12', { why: `braces unbalanced in the generated global stylesheet ({ ${open} vs } ${close})` });
      const props = new Set();
      try { const sh = new CSSStyleSheet(); sh.replaceSync(css); const walk = rules => { for (const r of rules) { if (r.style) for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (n.startsWith('--wp--custom--')) props.add(key(n.slice(14))); } if (r.cssRules) walk(r.cssRules); } }; walk(sh.cssRules); }
      catch (e) { for (const m of css.matchAll(/--wp--custom--([\w-]+)\s*:/g)) props.add(key(m[1])); }
      const missing = leaves.filter(p => !props.has(key(p.join(''))));
      if (missing.length) add('WP-12', { missing: missing.map(p => p.join('.')), count: missing.length, why: 'settings.custom values absent from the generated stylesheet — a quote, brace or semicolon in a value truncates it from there on' });
      note('WP-12', `${leaves.length} settings.custom value(s), ${props.size} --wp--custom-- properties generated`);
      ran('WP-12', 1 + leaves.length);
    });

    // ================================================================ WP-02 content: trash, defaults, categories
    await section('content', ['WP-02'], async () => {
      use(W.types, 'content types'); if (!W.ct.length) throw new Error('no content type is exposed to the REST API');
      const trash = W.docs.filter(d => d.status === 'trash');
      if (trash.length) add('WP-02', { why: `trash not empty (${trash.length})`, items: trash.map(d => `${d.t.slug}:${d.slug || d.id}`) });
      for (const d of W.docs.filter(live)) {
        const s = decode(d.slug), tt = normT(d.title);
        if ((d.t.slug === 'post' && (/^hello-world(-\d+)?$/.test(s) || tt === 'hello world!')) || (d.t.slug === 'page' && /^sample-page(-\d+)?$/.test(s))) add('WP-02', { type: d.t.slug, slug: s, status: d.status, why: 'WordPress default content' });
        else if (d.t.slug === 'page' && s === 'privacy-policy' && d.status === 'draft') add('WP-02', { type: 'page', slug: s, status: d.status, why: 'default draft Privacy Policy page from the install' });
        else if (d.t.slug === 'page' && /^privacy-policy-\d+$/.test(s)) ask('WP-02', { type: 'page', slug: s, status: d.status, why: 'second Privacy Policy page' });
        else if (TESTSLUG.test(s) || /^(test|testing|sandbox|dummy|lorem ipsum)\b/.test(tt)) add('WP-02', { type: d.t.slug, slug: s, title: d.title, status: d.status, why: 'test / placeholder content' });
      }
      try {
        const cats = await all('categories', '&_fields=id,slug,name,count', 'wp/v2', 'categories');
        const def = cats.find(c => c.id === S.default_category);
        if (def && UNCAT.test(decode(def.slug))) add('WP-02', { category: textOf(def.name), why: 'the install default category is still the default category', count: def.count });
        cats.filter(c => c.count === 0 && c !== def).forEach(c => add('WP-02', { category: decode(c.slug), why: 'empty category' }));
      } catch (e) { partial('WP-02', 'categories not read: ' + e.message); }
      if (Object.keys(W.typeErr).length) partial('WP-02', 'content types not read: ' + typeErrTxt());
      note('WP-02', `${W.docs.length} entries in ${W.ct.length - Object.keys(W.typeErr).length} content types checked (${trash.length} in trash)`);
      ran('WP-02', W.docs.length || W.ct.length);
    });

    // ================================================================ WP-14 own capability_type editable by an administrator
    await section('capabilities', ['WP-14'], async () => {
      if (!W.typesEdit) throw new Error('content types not readable in the edit context, capabilities unknown');
      const own = W.ct.filter(t => !t.builtin && t.caps && t.caps.edit_post && !['edit_post', 'edit_page'].includes(t.caps.edit_post));
      if (!own.length) { na('WP-14', 'no content type has its own capability_type'); return; }
      for (const t of own) {
        if (W.typeErr[t.slug] && !t.forbidden) { partial('WP-14', `${t.slug} not read: ${W.typeErr[t.slug]}`); continue; }
        if (t.forbidden) { add('WP-14', { type: t.slug, capability: t.caps.edit_post, why: `an administrator cannot list entries for editing (${t.forbidden}) — capability_type without map_meta_cap?` }); continue; }
        const d = W.docs.find(x => x.t === t && live(x));
        if (!d) { ask('WP-14', { type: t.slug, capability: t.caps.edit_post, why: 'own capability_type and no entry to test — check map_meta_cap in the type registration' }); continue; }
        const r = await J(`/${t.ns}/${t.base}/${d.id}?context=edit&_fields=id`);
        if (r.err) add('WP-14', { type: t.slug, id: d.id, capability: t.caps.edit_post, why: `an administrator cannot open an entry for editing (${r.err}) — capability_type without map_meta_cap` });
        else note('WP-14', `${t.slug}: own capability_type (${t.caps.edit_post}), entry ${d.id} opens for editing`);
      }
      ran('WP-14', own.length);
    });

    // ================================================================ WP-01 / WP-07 block validity and section names
    await section('blocks', ['WP-01', 'WP-07'], async () => {
      use(W.types, 'content types');
      const bl = builders(), why = bl.length ? bl.join(', ') : 'classic / HTML content';
      const tdocs = tpls.concat(parts).map(t => ({ t: { slug: t.type || 'wp_template' }, id: t.id, slug: t.slug, status: 'publish', raw: S_(t.content && t.content.raw) }));
      const pool = W.docs.filter(d => live(d) && d.raw !== null && d.raw.trim()).concat(tdocs.filter(d => d.raw.trim()));
      const noRaw = W.docs.filter(d => live(d) && d.raw === null);
      const blockDocs = pool.filter(d => /<!--\s+wp:(?!divi\/)/.test(d.raw)), other = pool.length - blockDocs.length;
      if (!blockDocs.length) {
        if (!pool.length && noRaw.length) throw new Error(`raw content not readable for ${noRaw.length} entries (${[...new Set(noRaw.map(d => d.t.slug))].join(', ')})`);
        if (!pool.length) { na('WP-01', 'no content to parse'); na('WP-07', 'no content to parse'); return; }
        na('WP-01', `content is not block-based (${why}): 0 of ${other} documents hold block markup`); na('WP-07', `no page uses block content (${why})`); return;
      }
      const B = window.wp && wp.blocks;
      if (!(B && B.parse && B.getBlockTypes && B.getBlockType && B.getBlockType('core/paragraph'))) {
        const f = blockDocs.find(d => d.t.slug === 'page') || blockDocs.find(d => !/^wp_template/.test(d.t.slug));
        const off = bl.filter(b => /^(Classic Editor|Disable Gutenberg)$/.test(b));
        const url = f ? `${ADMIN}post.php?post=${f.id}&action=edit${off.length ? '&classic-editor__forget' : ''}` : `${ADMIN}site-editor.php`;
        const msg = `${blockDocs.length} documents hold block markup but the block library is not loaded on this screen — open ${url} (click nothing, do not save) and rerun` + (off.length ? `; ${off.join(', ')} may keep the block editor closed — if it cannot be opened, route WP-01/07 to a person (record.cjs)` : '');
        notRun('WP-01', msg); notRun('WP-07', msg); return;
      }
      const reg = new Set(B.getBlockTypes().map(b => b.name));
      const quiet = fn => { const keep = {}; for (const k of ['error', 'warn', 'info', 'log', 'debug', 'group', 'groupCollapsed', 'groupEnd']) { keep[k] = console[k]; console[k] = () => { }; } try { return fn(); } finally { Object.assign(console, keep); } };
      let n = 0, blocks = 0, pages = 0; const byType = {};
      for (const d of blockDocs) {
        const label = `${d.t.slug}/${d.slug || d.id}`;
        let parsed; try { parsed = quiet(() => B.parse(d.raw)); } catch (e) { add('WP-01', { doc: label, why: 'the block parser threw: ' + e.message }); continue; }
        n++; byType[d.t.slug] = (byType[d.t.slug] || 0) + 1;
        const flat = []; const walk = x => x.forEach(y => { flat.push(y); walk(y.innerBlocks || []); }); walk(parsed); blocks += flat.length;
        flat.filter(x => x.isValid === false && x.name).forEach(x => add('WP-01', { doc: label, block: x.name, why: 'invalid: ' + ((x.validationIssues || [])[0] && x.validationIssues[0].args || []).slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 120) }));
        flat.filter(x => x.name === 'core/html').forEach(x => add('WP-01', { doc: label, block: 'core/html', html: S_(x.attributes && x.attributes.content || x.originalContent).replace(/\s+/g, ' ').slice(0, 100) }));
        flat.filter(x => x.name === 'core/missing' || (x.name && !reg.has(x.name))).forEach(x => add('WP-01', { doc: label, block: x.name === 'core/missing' ? S_(x.attributes && x.attributes.originalName) : x.name, why: 'missing block type' }));
        if (d.t.slug === 'page') { pages++; const top = parsed.filter(x => x.name); if (top.length > 1) top.filter(x => !(x.attributes && x.attributes.metadata && x.attributes.metadata.name)).forEach(x => add('WP-07', { page: d.slug, block: x.name + (x.attributes && x.attributes.className ? '.' + S_(x.attributes.className).split(' ')[0] : ''), why: 'unnamed top-level section in List View' })); }
      }
      note('WP-01', `${n} block documents (${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}), ${blocks} blocks parsed, ${reg.size} block types registered; ${other} non-block documents skipped${bl.length ? ' (' + why + ')' : ''}`);
      ran('WP-01', n);
      if (noRaw.length) partial('WP-01', `${noRaw.length} entries not parsed: raw content not readable (${[...new Set(noRaw.map(d => d.t.slug))].join(', ')}) — see WP-14`);
      if (Object.keys(W.typeErr).length) partial('WP-01', 'content types not read: ' + typeErrTxt());
      if (pages) { note('WP-07', `${pages} pages with block content checked`); ran('WP-07', pages); } else na('WP-07', `no page uses block content (${why})`);
    });

    // ================================================================ WP-05 unused media
    await section('media', ['WP-05'], async () => {
      use(W.types, 'content types');
      const media = await all('media', '&context=edit&_fields=id,source_url,media_details,post,mime_type', 'wp/v2', 'media library');
      if (!media.length) { na('WP-05', 'the media library is empty'); return; }
      QA.step = 'media: content references';
      const liveR = newRefs(), trashR = newRefs(), gaps = [], searched = ['content of every REST content type (all fields)'];
      for (const d of W.docs) walkRefs(d.o, '', false, live(d) ? liveR : trashR);
      tpls.concat(parts).forEach(t => walkRefs(t, '', false, liveR)); searched.push('templates and template parts');
      walkRefs(S, '', false, liveR); searched.push('site settings (logo, icon)');
      if (W.userGlobal) { walkRefs(W.userGlobal, '', false, liveR); searched.push('user global styles'); }
      for (const [p, what] of [['/wp/v2/widgets?context=edit&per_page=100', 'widgets'], ['/wp/v2/menu-items?context=edit&per_page=100', 'menu items'], ['/wp/v2/navigation?context=edit&per_page=100', 'navigation menus']]) { const r = await J(p); if (r.j) { walkRefs(r.j, '', false, liveR); searched.push(what); } else if (!/HTTP 404/.test(r.err)) gaps.push(`${what} not read (${r.err})`); }
      if (Object.keys(W.typeErr).length) gaps.push('content types not read: ' + typeErrTxt());
      if (W.hiddenTypes.length) gaps.push('content types not exposed to the REST API: ' + W.hiddenTypes.join(', '));
      // builders keep layout data outside post_content; Classic Editor and Disable Gutenberg do not
      const opaque = activeDirs().filter(d => OPAQUE_FIELDS.test(d) || (BUILDERS.some(([re]) => re.test(d)) && !/^(classic-editor|disable-gutenberg)$/.test(d))).concat(builders().filter(b => / theme$/.test(b)));
      if (opaque.length) gaps.push('builder / custom-field data the REST API may not show: ' + [...new Set(opaque)].join(', '));
      QA.step = 'media: rendered pages';
      const cr = await loadCrawl();
      if (!cr.pages.length) gaps.push('no rendered page read');
      else if (!cr.complete) gaps.push(`rendered pages incomplete: ${cr.pages.length} read from ${cr.source.join(' + ') || 'the front page'}${cr.capped ? ', capped' : ''}${cr.failed.length ? `, ${cr.failed.length} failed` : ''}${cr.sitemaps.length ? '' : ', no sitemap found'}`);
      const names = m => { const n = new Set(); const put = f => { if (f) n.add(decode(S_(f).split('/').pop().split('?')[0]).toLowerCase()); }; put(m.source_url); const md = m.media_details || {}; put(md.file); put(md.original_image); Object.values(md.sizes || {}).forEach(s => { put(s.file); put(s.source_url); }); return [...n]; };
      const hit = (m, R, nm, st) => R.ids.has(m.id) || nm.some(x => R.tokens.has(x)) || (st.length >= 4 && R.stems.has(st));
      let unused = 0, onlyTrash = 0; const sev = gaps.length ? ask : add;
      for (const m of media) {
        const nm = names(m), st = stemOf(nm[0] || ''), file = nm[0] || S_(m.source_url);
        if (hit(m, liveR, nm, st) || hit(m, cr.refs, nm, st)) continue;
        const kb = Math.round(((m.media_details && m.media_details.filesize) || 0) / 1024);
        if (hit(m, trashR, nm, st)) { onlyTrash++; sev('WP-05', { id: m.id, file, kb, why: 'used only by trashed content — unused once the trash is emptied' }); }
        else { unused++; sev('WP-05', { id: m.id, file, kb, attachedTo: m.post || null, why: 'not referenced anywhere searched' }); }
      }
      const unattached = media.filter(m => !m.post).length;
      note('WP-05', `${media.length} media (${unattached} attached to nothing): ${unused} unused, ${onlyTrash} used only by trashed content — searched: ${searched.join(', ')}, ${cr.pages.length} rendered pages (${cr.source.join(' + ') || 'front page'})`);
      if (gaps.length) note('WP-05', 'reported as ❓, not 🔴 — verify before deleting anything: ' + gaps.join('; '));
      ran('WP-05', media.length);
    });

    // ================================================================ CMS-02 inventory: every object by state, published vs shown
    await section('CMS inventory', ['CMS-02'], async () => {
      use(W.types, 'content types'); if (!W.ct.length) throw new Error('no content type is exposed to the REST API');
      const types = W.ct.filter(t => t.slug !== 'wp_block'); const counts = [];
      for (const t of types) {
        if (W.typeErr[t.slug]) { partial('CMS-02', `${t.slug} not counted: ${W.typeErr[t.slug]}`); continue; }
        const ds = W.docs.filter(d => d.t === t); const by = {}; ds.forEach(d => { by[d.status] = (by[d.status] || 0) + 1; });
        counts.push(`${t.slug}: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ') || '0'}${W.typeNote[t.slug] ? ` (${W.typeNote[t.slug]})` : ''}`);
        ds.filter(d => /^(draft|pending|future|private)$/.test(d.status)).forEach(d => ask('CMS-02', { type: t.slug, title: d.title || '(no title)', status: d.status, id: d.id, why: d.status === 'future' ? 'scheduled — it publishes by itself' : 'not published — publish it or delete it before handover' }));
      }
      note('CMS-02', 'entries per type and state — ' + counts.join('; '));
      if (W.hiddenTypes.length) ask('CMS-02', { types: W.hiddenTypes, why: 'content types not exposed to the REST API — count their entries in wp-admin' });
      ran('CMS-02', W.docs.length || types.length);
      QA.step = 'CMS inventory: rendered pages';
      const cr = await loadCrawl();
      if (cr.pages.length < 2) partial('CMS-02', `published-vs-shown not checked: ${cr.pages.length} rendered page(s) — pass QA_WP_CFG.pages (qa-out/pages.json) or make the sitemap reachable`);
      else {
        const special = new Set([S.page_on_front, S.page_for_posts].filter(Boolean)), homeKey = pageKey(HOME); let checked = 0;
        for (const t of types.filter(x => x.viewable !== false)) {
          const pub = W.docs.filter(d => d.t === t && d.status === 'publish' && d.link); let shown = 0;
          for (const d of pub) {
            const k = pageKey(d.link); checked++;
            if (k === homeKey || (t.slug === 'page' && special.has(d.id))) { shown++; continue; }
            const a = normT(d.titleR || d.title), b = normT(d.title);
            if (cr.pages.some(p => p.key !== k && (p.links.has(k) || (a.length >= 4 && p.text.includes(a)) || (b.length >= 4 && p.text.includes(b))))) shown++;
            else ask('CMS-02', { type: t.slug, title: d.title, link: d.link, why: `published but not linked or named on any of the ${cr.pages.length} crawled pages` });
          }
          if (pub.length) note('CMS-02', `${t.slug}: ${pub.length} published, ${shown} shown on crawled pages`);
        }
        note('CMS-02', `published-vs-shown: ${checked} entries against ${cr.pages.length} rendered pages (${cr.source.join(' + ') || 'front page'}${cr.capped ? `, capped of ${cr.total}` : ''})`);
      }
      // terms and menus are counted too ("count the things"); notes only
      const tx = await J('/wp/v2/taxonomies?context=edit');
      if (tx.j) { const out = []; for (const [k, t] of Object.entries(tx.j)) { if (!t.rest_base || /^(nav_menu|wp_pattern_category|wp_theme|wp_template_part_area)$/.test(k)) continue; try { const terms = await all(t.rest_base, '&_fields=id,count', t.rest_namespace || 'wp/v2', k); out.push(`${k} ${terms.length} (${terms.filter(x => !x.count).length} empty)`); } catch (e) { out.push(`${k} not read`); } } note('CMS-02', 'terms per taxonomy — ' + (out.join(' · ') || 'none')); }
      const ml = await J('/wp/v2/menu-locations?context=edit');
      if (ml.j) { const out = []; for (const [loc, v] of Object.entries(ml.j)) { if (!v || !v.menu) { out.push(`${loc}: no menu`); continue; } const mi = await J(`/wp/v2/menu-items?menus=${v.menu}&per_page=1&_fields=id`); out.push(`${loc}: ${mi.err ? '?' : +(mi.total || 0)} items`); } note('CMS-02', 'menus per location — ' + (out.join(' · ') || 'no menu locations')); }
      const nv = await J('/wp/v2/navigation?per_page=1&_fields=id'); if (nv.j) note('CMS-02', `navigation menus (block themes): ${+(nv.total || 0)}`);
    });

    // ================================================================ WP-09 comments
    await section('comments', ['WP-09'], async () => {
      if (!('default_comment_status' in S)) throw new Error('discussion settings are not in /wp/v2/settings');
      const counts = {}; const unread = [];
      for (const st of ['approve', 'hold', 'spam', 'trash']) { const r = await J(`/wp/v2/comments?status=${st}&per_page=1&context=edit&_fields=id`); if (r.err) unread.push(`${st} (${r.err})`); else counts[st] = +(r.total || 0); }
      if (unread.length) partial('WP-09', 'comment queues not readable: ' + unread.join(', '));
      const cnt = k => (counts[k] === undefined ? '?' : counts[k]);
      note('WP-09', `comments: approved ${cnt('approve')} · awaiting moderation ${cnt('hold')} · spam ${cnt('spam')} · trash ${cnt('trash')}`);
      if (counts.hold) { const held = await all('comments', '&status=hold&context=edit&_fields=id,post,author_name,content,date', 'wp/v2', 'held comments'); held.slice(0, 20).forEach(c => ask('WP-09', { comment: c.id, post: c.post, author: c.author_name, date: S_(c.date).slice(0, 10), text: textOf(c.content && (c.content.rendered || c.content.raw)).slice(0, 120), why: 'awaiting moderation' })); }
      if ((counts.spam || 0) + (counts.trash || 0)) ask('WP-09', { why: `spam ${counts.spam || 0} · trash ${counts.trash || 0} — empty both before handover` });
      for (const st of ['approve', 'hold']) { const r = await J(`/wp/v2/comments?status=${st}&author_email=${encodeURIComponent('wapuu@wordpress.example')}&context=edit&_fields=id,post`); if (r.j && r.j.length) add('WP-02', { why: 'default WordPress comment ("A WordPress Commenter")', comments: r.j.map(c => c.id) }); }
      const posts = W.docs.filter(d => d.t.slug === 'post' && d.status === 'publish').sort((a, b) => (a.date < b.date ? 1 : -1));
      let hasSection = false, how = 'no published posts';
      if (posts.length) {
        try { const f = await fget(posts[0].link); const d = PARSER.parseFromString(f.text, 'text/html'); hasSection = !!d.querySelector('#respond, #commentform, .comment-respond, .wp-block-post-comments-form, .wp-block-comments, .comments-area'); how = hasSection ? 'the newest post renders a comment section' : 'the newest post renders no comment section'; }
        catch (e) { hasSection = null; how = 'the newest post is not readable: ' + e.message; }
      }
      if (hasSection === null) { ask('WP-09', { why: `cannot tell whether posts show comments (${how}) — check the discussion settings against the design by hand` }); ran('WP-09', 1); return; }
      if (!hasSection) {
        if (S.default_comment_status === 'open') add('WP-09', { setting: 'Allow people to submit comments on new posts', why: `comments open by default — ${how}` });
        if (S.default_ping_status === 'open') add('WP-09', { setting: 'Allow link notifications (pingbacks / trackbacks)', why: `pings open by default — ${how}` });
        const open = {}; W.docs.filter(d => live(d) && (d.cs === 'open' || d.ps === 'open')).forEach(d => { (open[d.t.slug] = open[d.t.slug] || []).push(d.slug || String(d.id)); });
        Object.entries(open).forEach(([type, list]) => add('WP-09', { type, open: list.length, items: list, why: 'comments or pings open on existing entries — spam bots post to wp-comments-post.php without any form' }));
        note('WP-09', `closed mode: ${how}`); ran('WP-09', W.docs.length || 1); return;
      }
      const d = await doc(ADMIN + 'options-discussion.php'); const cb = id => { const el = d.getElementById(id); return el ? !!el.checked : null; };
      if (cb('comment_moderation') === null && cb('require_name_email') === null) { partial('WP-09', 'options-discussion.php fields not found — check moderation, name/email and link limit by hand'); ran('WP-09', 1); return; }
      if (!(cb('comment_moderation') || cb('comment_previously_approved'))) add('WP-09', { setting: 'Comment moderation', why: 'comments appear without moderation' });
      if (cb('require_name_email') === false) add('WP-09', { setting: 'Comment author must fill out name and email', why: 'anonymous comments allowed' });
      const mlEl = d.getElementById('comment_max_links'), links = mlEl ? parseInt(mlEl.value, 10) : NaN;
      if (!(links >= 1 && links <= 2)) ask('WP-09', { setting: 'Hold a comment if it contains N links', value: mlEl ? mlEl.value : '?', why: 'link limit off or above 2' });
      try { const g = await doc(ADMIN + 'options-general.php'); const reg = g.getElementById('users_can_register'); if (reg && reg.checked && cb('comment_registration') === false) ask('WP-09', { why: 'registration is open but comments do not require a login' }); } catch (e) { partial('WP-09', 'registration setting not read: ' + e.message); }
      note('WP-09', `blog with a comment section: ${how}`); ran('WP-09', 1);
    });

    // ================================================================ FORM-08 / FORM-09 mail settings of the form plugins
    await section('mail settings', ['FORM-08', 'FORM-09'], async () => {
      const cr = await loadCrawl(); QA.step = 'mail settings';
      const markers = new Set(cr.pages.flatMap(p => [...p.markers])), placed = new Set(cr.pages.flatMap(p => [...p.cf7]));
      const formsOnPages = cr.pages.reduce((n, p) => n + p.mailForms, 0), actions = [...new Set(cr.pages.flatMap(p => p.actions))];
      const nsList = W.index.namespaces || [], gapsF = [];
      const dirs = W.plugins.j ? activeDirs() : null;
      if (!dirs) gapsF.push(`plugin list not readable (${W.plugins.err}): only form plugins visible in the REST index were checked`);
      const active = FORM_PROVIDERS.filter(p => (dirs ? dirs.some(d => p.dir.test(d)) : (p.key === 'cf7' && nsList.includes('contact-form-7/v1')) || (p.key === 'gravity' && nsList.includes('gf/v2'))));
      const whereOf = p => (/^admin\.php/.test(p.where) ? ADMIN + p.where : p.where);
      const siteDom = regDomain(homeHost), prod = domainOf(cfg('productionDomain'));
      const stagingState = CFG.staging === true ? 'yes' : CFG.staging === false ? 'no' : looksStaging(homeHost) ? 'yes' : 'unknown';
      const autoReplyWanted = cfg('autoReply') !== false;
      const resolve = s => S_(s).replace(/\[_site_admin_email\]|\{admin_email\}/g, S.email || '').replace(/\[_site_domain\]/g, host0(homeHost)).replace(/\[_site_url\]/g, HOME).replace(/\[_site_title\]/g, S.title || '');
      const fieldTag = s => /\[(?!_)[\w-]+\]|\{(?!admin_email)[^}]*:\d+[^}]*\}/.test(S_(s));
      const checkAddr = (form, mail, role, e, raw) => {
        const k = mailKind(e), via = /\[_site_admin_email\]|\{admin_email\}/.test(raw) ? ' (the site admin email, via the admin-email tag)' : '';
        if (k === 'test') add('FORM-08', { form, mail, [role]: e, why: 'test / example address' + via });
        else if (k === 'agency') add('FORM-08', { form, mail, [role]: e, why: 'agency address — must not receive the client\'s mail' + via });
        else if (k === 'free') ask('FORM-08', { form, mail, [role]: e, why: 'free-mail address: confirm it is the client\'s mailbox, then list it in decisions.clientRecipients' + via });
      };
      const headersCheck = (form, mail, headers) => { for (const m of S_(headers).matchAll(/^\s*(cc|bcc)\s*:(.*)$/gim)) emailsIn(resolve(m[2])).forEach(e => checkAddr(form, mail, m[1].toLowerCase(), e, m[2])); };
      const senderCheck = (form, mail, raw) => {
        const addrPart = (S_(raw).match(/<([^>]*)>/) || [null, S_(raw)])[1];
        if (fieldTag(addrPart)) return add('FORM-08', { form, mail, from: raw, why: 'sender is the visitor\'s address — send from an address on the site domain and put the visitor in Reply-To' });
        const resolved = resolve(addrPart), addr = emailsIn(resolved)[0];
        if (!addr && /\{[^}]+\}|\[_[\w-]+\]/.test(resolved)) return ask('FORM-08', { form, mail, from: raw, why: 'sender uses a tag this script cannot resolve — check the real sender address on a test mail' });
        if (!addr) return add('FORM-08', { form, mail, from: raw, why: 'no valid sender address' });
        const sd = addr.split('@')[1];
        if (/\.(local|test|localhost|invalid)$|^localhost$/.test(sd)) return add('FORM-08', { form, mail, from: addr, why: 'sender on a local / test domain' });
        if (prod) {
          // a staging host may itself be a subdomain of the production domain: its own addresses still change at launch
          const atHome = onDomain(sd, homeHost) && host0(homeHost) !== prod;
          if (atHome || (!onDomain(sd, prod) && onDomain(sd, siteDom))) return ask('FORM-08', { form, mail, from: addr, why: `sender is on this staging domain — change it to an address @${prod} at launch` });
          if (onDomain(sd, prod)) return;
          return add('FORM-08', { form, mail, from: addr, why: `sender is not on the production domain ${prod}` });
        }
        if (stagingState === 'yes') return ask('FORM-08', { form, mail, from: addr, why: 'staging site and no productionDomain in qa-target.json — the sender must be on the production domain at launch: set productionDomain' });
        if (!onDomain(sd, siteDom)) return add('FORM-08', { form, mail, from: addr, why: `sender is not on the site domain ${siteDom}` });
        if (stagingState === 'unknown') return ask('FORM-08', { form, mail, from: addr, why: 'staging or production unknown (set "staging" / productionDomain in qa-target.json) — confirm this sender domain is the production one' });
      };
      const unlabelled = (body, names) => {
        const lines = S_(body).replace(/<\/(p|div|tr|li|h\d|table)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').split('\n');
        return names.filter(n => { const re = new RegExp('\\[(?:_raw_|_format_)?' + esc(n) + '\\]'); const i = lines.findIndex(l => re.test(l)); if (i < 0) return false; if (/\p{L}{2}/u.test(lines[i].replace(/\[[^\]]*\]/g, ''))) return false; const prev = lines.slice(0, i).reverse().find(l => l.trim()) || ''; return !(/\p{L}{2}/u.test(prev) && !/\[[^\]]*\]/.test(prev)); });
      };
      // ---- Contact Form 7: REST first (config_errors included), the admin screens as the fallback
      const readCF7 = async () => {
        let forms = null, how = 'REST';
        const lr = await J('/contact-form-7/v1/contact-forms?per_page=100');
        if (!lr.err && Array.isArray(lr.j)) { forms = []; for (const f of lr.j) { const r = await J(`/contact-form-7/v1/contact-forms/${f.id}`); if (r.err || !r.j || !r.j.properties) { forms = null; break; } const ce = r.j.config_errors && typeof r.j.config_errors === 'object' ? r.j.config_errors : {}; forms.push({ id: r.j.id, title: S_(r.j.title), props: r.j.properties, errors: Object.entries(ce).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => `${k}: ${S_(x && x.message || x)}`)) }); } }
        if (!forms) {
          how = 'admin screens';
          try {
            const d = await doc(ADMIN + 'admin.php?page=wpcf7'); forms = [];
            for (const tr of d.querySelectorAll('#the-list tr')) {
              const a = tr.querySelector('a.row-title, .title a'); if (!a) continue;
              const href = new URL(a.getAttribute('href'), ADMIN).href, e = await doc(href);
              const v = s => S_((e.querySelector(s) || {}).value), c = s => !!(e.querySelector(s) || {}).checked;
              const errs = [...e.querySelectorAll('.config-error li, ul.config-error li')].map(x => S_(x.textContent).trim()).filter(Boolean);
              const mail = p => ({ active: p === 'mail' ? true : c('#wpcf7-mail-2-active'), recipient: v(`#wpcf7-${p}-recipient`), sender: v(`#wpcf7-${p}-sender`), subject: v(`#wpcf7-${p}-subject`), body: v(`#wpcf7-${p}-body`), additional_headers: v(`#wpcf7-${p}-additional-headers`), use_html: c(`#wpcf7-${p}-use-html`) });
              forms.push({ id: +((href.match(/[?&]post=(\d+)/) || [])[1]) || null, title: S_(a.textContent).trim(), props: { form: v('#wpcf7-form'), mail: mail('mail'), mail_2: mail('mail-2') }, errors: errs.length ? errs : /configuration error/i.test(tr.textContent) ? ['configuration errors flagged in the form list'] : [] });
            }
            if (d.querySelector('.tablenav-pages .next-page:not(.disabled), .tablenav-pages a.next-page')) gapsF.push('Contact Form 7 list has more pages — only the first page was read');
          } catch (e) { return { err: e.message }; }
        }
        for (const f of forms) {
          const lbl = `${f.title}${f.id ? ' #' + f.id : ''}`, P = f.props || {}, m1 = P.mail || {}, m2 = P.mail_2 || {};
          const names = new Set([...S_(P.form).matchAll(/\[([a-z_]+)\*?\s+([\w-]+)/gi)].map(x => x[2]));
          const fields = [...S_(P.form).matchAll(/\[(text|email|tel|url|textarea|select|checkbox|radio|date|number|range|file)\*?\s+([\w-]+)/gi)].map(x => x[2]).filter(n => !/honey|^hp$|^hp[-_]|trap/i.test(n));
          if (cr.complete && f.id && !placed.has(+f.id)) ask('FORM-08', { form: lbl, why: `not on any of the ${cr.pages.length} crawled pages — a leftover form? (its settings are still checked)` });
          // FORM-08: recipients, sender, auto-reply, configuration errors
          if (fieldTag(m1.recipient)) ask('FORM-08', { form: lbl, mail: 'Mail', to: m1.recipient, why: 'the admin mail goes to an address typed by the visitor' });
          else { const list = emailsIn(resolve(m1.recipient)); if (!list.length) add('FORM-08', { form: lbl, mail: 'Mail', to: m1.recipient, why: 'no valid recipient address' }); list.forEach(e => checkAddr(lbl, 'Mail', 'to', e, S_(m1.recipient))); }
          headersCheck(lbl, 'Mail', m1.additional_headers); senderCheck(lbl, 'Mail', m1.sender);
          if (m2.active) { if (!fieldTag(m2.recipient)) ask('FORM-08', { form: lbl, mail: 'Mail (2)', to: m2.recipient, why: 'the auto-reply goes to a fixed address, not to the visitor' }); headersCheck(lbl, 'Mail (2)', m2.additional_headers); senderCheck(lbl, 'Mail (2)', m2.sender); }
          else if (autoReplyWanted) add('FORM-08', { form: lbl, mail: 'Mail (2)', why: 'auto-reply to the visitor is off (set decisions.autoReply false if that is agreed)' });
          const errs = f.errors || [];
          if (errs.length) add('FORM-08', { form: lbl, errors: errs.slice(0, 4).join(' | '), why: 'Contact Form 7 reports configuration errors' });
          // FORM-09: mail content
          const b1 = S_(m1.body), s1 = S_(m1.subject), both = b1 + '\n' + s1;
          const missing = fields.filter(n => !new RegExp('\\[(?:_raw_|_format_)?' + esc(n) + '\\]').test(b1));
          if (missing.length) add('FORM-09', { form: lbl, fields: missing, why: 'fields missing from the admin email' });
          const unl = unlabelled(b1, fields.filter(n => !missing.includes(n)));
          if (unl.length) ask('FORM-09', { form: lbl, fields: unl, why: 'value without a label in the admin email' });
          if (!/\[(_url|_post_url)\]/.test(both)) add('FORM-09', { form: lbl, why: 'admin email has no page URL ([_url] or [_post_url])' });
          if (!/\[(_post_title|_post_name)\]/.test(both)) add('FORM-09', { form: lbl, why: 'admin email has no page title ([_post_title])' });
          if (cfg('mailSubjectHasPage') === true && !/\[(_post_title|_post_name)\]/.test(s1)) add('FORM-09', { form: lbl, subject: s1, why: 'page title not in the subject (decisions.mailSubjectHasPage)' });
          for (const [mail, m] of [['Mail', m1], ['Mail (2)', m2.active ? m2 : null]]) if (m) { const unknown = [...new Set([...(S_(m.subject) + '\n' + S_(m.body)).matchAll(/\[([\w-]+)\]/g)].map(x => x[1]).filter(n => !n.startsWith('_') && !names.has(n)))]; unknown.forEach(n => add('FORM-09', { form: lbl, mail, tag: `[${n}]`, why: 'unknown mail tag — it prints literally (no such field in the form)' })); }
          if (!m1.use_html && (/\n\s*\n\s*\n/.test(b1) || !/\n/.test(b1.trim()))) ask('FORM-09', { form: lbl, why: 'admin email layout — check the spacing (several blank lines, or a one-line body)' });
          if (m2.active) { const b2 = S_(m2.body); if (!b2.trim()) add('FORM-09', { form: lbl, mail: 'Mail (2)', why: 'auto-reply body is empty' }); else { if (!/\[_site_url\]|\[_url\]|\[_post_url\]|href=|https?:\/\//.test(b2)) ask('FORM-09', { form: lbl, mail: 'Mail (2)', why: 'auto-reply has no link back to the site' }); if (m2.use_html && /max-width:\s*([1-4]\d{2}|[1-9]\d)px/.test(b2)) ask('FORM-09', { form: lbl, mail: 'Mail (2)', why: 'auto-reply HTML has a narrow fixed max-width — check the column width on a phone' }); } }
          note('FORM-08', `${lbl}: to ${S_(m1.recipient)} · from ${S_(m1.sender)} · auto-reply ${m2.active ? 'on' : 'off'}`);
        }
        note('FORM-08', `Contact Form 7: ${forms.length} form(s) read via ${how}`);
        return { n: forms.length };
      };
      // ---- Gravity Forms: only through its REST API (when enabled); otherwise routed to its screens
      const readGF = async () => {
        const lr = await J('/gf/v2/forms'); if (lr.err || !lr.j || typeof lr.j !== 'object') return { err: lr.err || 'no form list' };
        const ids = Array.isArray(lr.j) ? lr.j.map(f => f.id) : Object.keys(lr.j); let n = 0;
        for (const id of ids) {
          const r = await J(`/gf/v2/forms/${id}`); if (r.err || !r.j) return n ? { n, err: r.err } : { err: r.err || 'form not readable' };
          const f = r.j, lbl = `${S_(f.title)} #${f.id}`, list = Object.values(f.notifications || {}).filter(x => x && x.isActive !== false && (!x.event || x.event === 'form_submission'));
          const admin = list.filter(x => (x.toType || 'email') === 'email'), user = list.filter(x => x.toType === 'field');
          if (!admin.length) add('FORM-08', { form: lbl, why: 'no active admin notification' });
          if (!user.length && autoReplyWanted) add('FORM-08', { form: lbl, why: 'no auto-reply notification to the visitor' });
          const fids = (f.fields || []).filter(x => !/^(html|section|page|captcha|honeypot|hidden)$/.test(S_(x.type))).map(x => ({ id: x.id, label: textOf(x.label) }));
          for (const x of list) {
            const mail = S_(x.name) || 'notification';
            if ((x.toType || 'email') === 'email') { const to = emailsIn(resolve(x.to)); if (!to.length) add('FORM-08', { form: lbl, mail, to: x.to, why: 'no valid recipient address' }); to.forEach(e => checkAddr(lbl, mail, 'to', e, S_(x.to))); }
            emailsIn(resolve(S_(x.bcc) + ' ' + S_(x.cc))).forEach(e => checkAddr(lbl, mail, 'cc/bcc', e, S_(x.bcc)));
            senderCheck(lbl, mail, resolve(x.from));
          }
          for (const x of admin) {
            const msg = S_(x.message), subj = S_(x.subject), mail = S_(x.name) || 'admin notification';
            if (!/\{all_fields/.test(msg)) { const miss = fids.filter(fl => !new RegExp('\\{[^}]*:' + fl.id + '(\\.\\d+)?(:[^}]*)?\\}').test(msg)).map(fl => fl.label || '#' + fl.id); if (miss.length) add('FORM-09', { form: lbl, mail, fields: miss, why: 'fields missing from the admin email' }); }
            if (!/\{embed_url\}|\{entry_url\}/.test(msg + subj)) add('FORM-09', { form: lbl, mail, why: 'admin email has no page URL ({embed_url})' });
            if (!/\{embed_post:post_title\}/.test(msg + subj)) add('FORM-09', { form: lbl, mail, why: 'admin email has no page title ({embed_post:post_title})' });
            if (cfg('mailSubjectHasPage') === true && !/\{embed_post:post_title\}/.test(subj)) add('FORM-09', { form: lbl, mail, subject: subj, why: 'page title not in the subject (decisions.mailSubjectHasPage)' });
          }
          note('FORM-08', `${lbl}: ${admin.length} admin and ${user.length} visitor notification(s)`); n++;
        }
        note('FORM-08', `Gravity Forms: ${n} form(s) read via REST`);
        return { n };
      };
      let read = 0; const pending = [];
      for (const p of active) {
        if (p.optional && cr.pages.length && !markers.has(p.key)) { note('FORM-08', `${p.name}: plugin active, no such form on the ${cr.pages.length} crawled pages`); continue; }
        if (p.optional && !cr.pages.length) { gapsF.push(`${p.name}: plugin active, no rendered page read to tell whether it holds forms`); continue; }
        const res = p.key === 'cf7' ? await readCF7() : p.key === 'gravity' ? await readGF() : { err: 'no reader' };
        if (typeof res.n === 'number') read += res.n;
        if (res.err && !res.n) pending.push(p);
        else if (res.err) gapsF.push(`${p.name}: stopped after ${res.n} form(s) (${res.err})`);
      }
      const route = pending.map(p => `${p.name} (${whereOf(p)})`).join(' · ');
      if (read) {
        pending.forEach(p => { ask('FORM-08', { plugin: p.name, where: whereOf(p), why: 'also active: its notification settings are not read by this script — check recipients, sender and auto-reply there' }); ask('FORM-09', { plugin: p.name, where: whereOf(p), why: 'its mail content is not read by this script — check field labels, page URL and page title there' }); });
        gapsF.forEach(g => { partial('FORM-08', g); partial('FORM-09', g); });
        ran('FORM-08', read); ran('FORM-09', read); return;
      }
      const gapTxt = gapsF.length ? ' (' + gapsF.join('; ') + ')' : '';
      if (pending.length) { notRun('FORM-08', `mail settings live in ${route} — not read by this script: check recipients, sender and auto-reply there, then record.cjs --id FORM-08${gapTxt}`); notRun('FORM-09', `mail content lives in ${route} — check field labels, page URL and page title there, then record.cjs --id FORM-09${gapTxt}`); return; }
      const which = active.length ? `${active.map(p => p.name).join(', ')} holds no form` : 'no WordPress form plugin is active';
      const pres = CFG.presence && typeof CFG.presence === 'object' ? CFG.presence.mailForms : undefined;
      const presAbsent = pres === false || pres === 0 || (Array.isArray(pres) && !pres.length) || (!!pres && typeof pres === 'object' && !Array.isArray(pres) && (pres.found === false || pres.found === 0 || pres.count === 0 || pres.present === false));
      if (presAbsent || (cr.complete && !formsOnPages)) { const why = `no mail form on the site (${presAbsent ? 'presence sweep' : `${cr.pages.length} crawled pages, sitemap complete`}) and ${which}`; na('FORM-08', why); na('FORM-09', why); return; }
      if (formsOnPages) { const why = `${formsOnPages} mail form(s) on the crawled pages post to ${actions.join(', ') || 'a script handler'} and ${which} — find that backend's notification settings (owner of the form handler), then record.cjs${gapTxt}`; notRun('FORM-08', why); notRun('FORM-09', why); return; }
      // Whether the site has mail forms is unknown here: leave the row to the presence gate (a not-run here would block its n/a).
      ['FORM-08', 'FORM-09'].forEach(id => { note(id, `${which}; whether the site has mail forms is unknown here (${cr.pages.length} rendered pages, sitemap ${cr.sitemaps.length ? 'found' : 'not found'})${gapTxt} — the presence sweep (RUN-02) decides`); deferred.add(id); });
      log(`FORM-08/09: ${which}; left to the presence sweep (pass QA_WP_CFG.presence to settle it here)`);
    });
  };

  // ---------- finish: no ID without a status, bounded size, transfer API
  const finish = t0 => {
    QA.step = 'finishing';
    IDS.forEach(id => {
      const c = C[id];
      if (deferred.has(id)) return;
      if (!c || (!c.ran && !c.na && !c.notRun && !(c.items && c.items.length))) notRun(id, closed[id] ? 'the audit found no subject and no n/a rule matched — report this as an instrument gap' : `not reached${ERR.length ? ' (' + ERR[ERR.length - 1] + ')' : ''} — ${HOWTO}`);
    });
    const MAXI = 300;
    for (const [id, c] of Object.entries(C)) if (c.items.length > MAXI) { c.total = c.items.length; note(id, `${c.items.length} items, first ${MAXI} kept`); c.items = c.items.slice(0, MAXI); }
    RES._editor.after = editorState();
    const a = RES._editor.after; if (a && (a.dirty || a.dirtyEntities)) log('WARNING: the editor has unsaved changes — leave it WITHOUT saving');
    RES._finishedAt = new Date().toISOString(); RES._seconds = Math.round((Date.now() - t0) / 1000);
    if (!QA.log.includes('ERROR')) log(ERR.length ? `done with ${ERR.length} stopped section(s) — see errors` : 'ok');
    QA.json = JSON.stringify(RES); QA.len = QA.json.length; QA.sum = fnv(QA.json);
    QA.parts = Math.ceil(QA.len / QA.size); QA.sums = Array.from({ length: QA.parts }, (_, i) => fnv(QA.chunk(i)));
    QA.done = true; QA.running = false; QA.step = 'done';
  };
  (async () => {
    const t0 = Date.now(); RES._editor = { before: editorState() };
    try { await main(); }
    catch (e) {
      const msg = (e && e.message) || String(e); ERR.push('stopped: ' + msg); log('ERROR ' + msg);
      IDS.forEach(id => { const c = C[id]; if (!closed[id] && !(c && c.na)) notRun(id, `wp-admin-audit stopped: ${msg} — ${HOWTO}`); });
    } finally { finish(t0); }
  })();
  return 'started';
})();
