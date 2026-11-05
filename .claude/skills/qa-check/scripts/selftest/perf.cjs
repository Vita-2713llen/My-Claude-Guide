#!/usr/bin/env node
// qa-check · selftest/perf.cjs — timing run on a generated, larger local site (not part of `npm test`).
//
//   cd <skill>/scripts && npm run perf -- [--engines chromium,webkit,firefox] [--items 33] [--keep] [--verbose] [--budget 30]
//
// Generates a typical small project into a scratch folder under the OS temp folder: 5 static pages (home, about,
// services, faq, contact) + N CMS-like items on 2 shared templates (/journal/<slug>/ and /work/<slug>/), each page with
// the same header, burger panel, footer, plus a slider, FAQ toggles and a form where the template has them. It reuses
// the self-test fixture's CSS, JS and images, serves the folder on 127.0.0.1, runs qa-run.cjs + manifest.cjs once and
// prints the manifest's time table. Nothing here touches a real website.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), cp = require('child_process');
const SCRIPTS = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixture');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const ITEMS = Math.max(2, +opt('items', 33));
const ENGINES = String(opt('engines', 'chromium,webkit,firefox')).split(',').map(s => s.trim()).filter(Boolean);
const BUDGET = +opt('budget', 30);
const KEEP = flag('keep'), VERBOSE = flag('verbose');

// ------------------------------------------------------------------------------------------------ site generator
const NAV = [['/about/', 'About'], ['/services/', 'Services'], ['/journal/', 'Journal'], ['/work/', 'Work'], ['/faq/', 'FAQ'], ['/contact/', 'Contact']];
const WORDS = ['calm', 'light', 'oak', 'linen', 'studio', 'garden', 'window', 'shelf', 'corner', 'table', 'chair', 'lamp', 'stone', 'wool', 'paper', 'clay'];
const word = i => WORDS[i % WORDS.length];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function page(title, desc, body) {
  const nav = NAV.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Brand</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title} — Brand">
<meta property="og:image" content="/img/og.png">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="site-header">
  <div class="container header-row">
    <a class="site-logo" href="/"><img src="/img/logo.svg" alt="Brand" width="120" height="32"></a>
    <nav class="site-nav" aria-label="Main"><ul>${nav}</ul></nav>
    <button class="site-burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu-panel"><span></span><span></span><span></span></button>
  </div>
</header>
<div id="menu-panel" class="menu-panel"><ul>${nav}</ul></div>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <address>Brand Studio<br>1 Example Street, Springfield</address>
    <p><a href="/contact/">Contact the studio</a> · <a href="/faq/">Questions</a></p>
  </div>
</footer>
<script src="/assets/site.js"></script>
</body>
</html>
`;
}
const slider = label => `<section class="testimonials"><div class="container"><h2>${label}</h2>
<div class="slider" aria-label="${label}" data-fixture-slider><div class="slider-track">
<div class="slide"><p>The room finally feels like ours.</p></div><div class="slide"><p>Calm, clear and on budget.</p></div><div class="slide"><p>We use every corner now.</p></div>
</div></div>
<div class="slider-nav"><button class="slider-prev" type="button" aria-label="Previous slide">&lsaquo;</button><button class="slider-next" type="button" aria-label="Next slide">&rsaquo;</button></div>
</div></section>`;
const faq = n => `<section><div class="container"><h2>Questions</h2>
${Array.from({ length: n }, (_, i) => `<details><summary>How does step ${i + 1} work?</summary><p>We agree the ${word(i)} details together before anything is ordered.</p></details>`).join('\n')}
</div></section>`;
const form = `<section><div class="container"><h2>Send a request</h2>
<form class="request-form" action="/thanks/" method="post">
<div class="field"><label for="f-name">Your name *</label><input id="f-name" name="full_name" type="text" autocomplete="name" maxlength="120" required></div>
<div class="field"><label for="f-email">Email *</label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
<div class="field"><label for="f-msg">Message</label><textarea id="f-msg" name="message" maxlength="2000"></textarea></div>
<input class="hp-field" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
<p>Fields marked * are required.</p>
<button class="btn" type="submit">Send Request</button>
</form></div></section>`;
const cards = (base, list) => `<section class="work"><div class="container"><div class="gallery">${list.map(([s, t]) => `<div class="card"><h3><a href="${base}${s}/">${t}</a></h3><p>A short note about ${t.toLowerCase()}.</p></div>`).join('')}</div></div></section>`;
function generate(dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(FIXTURE, 'assets'), path.join(dir, 'assets'), { recursive: true });
  fs.cpSync(path.join(FIXTURE, 'img'), path.join(dir, 'img'), { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, '404.html'), path.join(dir, '404.html'));
  const urls = [];
  const put = (p, html) => { const f = path.join(dir, p, 'index.html'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); urls.push(p); };
  const nJ = Math.ceil(ITEMS * 4 / 7), nW = ITEMS - nJ;
  const journal = Array.from({ length: nJ }, (_, i) => [`${word(i)}-${word(i + 5)}-${i + 1}`, `${cap(word(i))} and ${word(i + 5)}, note ${i + 1}`]);
  const work = Array.from({ length: nW }, (_, i) => [`${word(i + 3)}-room-${i + 1}`, `${cap(word(i + 3))} room ${i + 1}`]);
  const photo = `<div class="media-row"><img class="photo-ok" src="/img/photo-b.png" alt="Oak shelves in a studio kitchen" width="400" height="300"></div>`;
  put('/', page('Interior design for calm spaces', 'Brand designs calm, practical rooms for homes and small offices.', `<section class="hero"><div class="container"><h1>Interior design for calm spaces</h1><p class="lead">We design rooms that work and rest.</p><div class="btn-row"><a class="btn" href="/work/">View Our Work</a><a class="btn" href="/contact/">Get In Touch</a></div></div></section>${slider('Testimonials')}${cards('/work/', work.slice(0, 4))}`));
  put('/about/', page('About the studio', 'Who we are and how we work.', `<section class="hero"><div class="container"><h1>About the studio</h1><p>A small team that plans rooms around the people in them.</p>${photo}</div></section>`));
  put('/services/', page('Services', 'Room planning, sourcing and site visits.', `<section class="hero"><div class="container"><h1>Services</h1><p>Planning, sourcing and visits, priced per room.</p></div></section>${faq(3)}`));
  put('/faq/', page('Questions and answers', 'Answers to common questions about our process.', `<section class="hero"><div class="container"><h1>Questions and answers</h1></div></section>${faq(6)}`));
  put('/contact/', page('Contact', 'Send a request or visit the studio.', `<section class="hero"><div class="container"><h1>Contact</h1><p>We answer within two working days.</p></div></section>${form}`));
  put('/journal/', page('Journal', 'Notes from the studio.', `<section class="hero"><div class="container"><h1>Journal</h1></div></section>${cards('/journal/', journal)}`));
  put('/work/', page('Work', 'Rooms we have designed.', `<section class="hero"><div class="container"><h1>Work</h1></div></section>${cards('/work/', work)}`));
  // template A: journal entry (text, photo, FAQ toggles); template B: case study (slider, form)
  for (const [s, t] of journal) put(`/journal/${s}/`, page(t, `A studio note: ${t.toLowerCase()}.`, `<article class="hero"><div class="container"><h1>${t}</h1><p>We started with the ${s.split('-')[0]} and built the room around it.</p>${photo}<p>Read more in the <a href="/journal/">journal</a>.</p></div></article>${faq(2)}`));
  for (const [s, t] of work) put(`/work/${s}/`, page(t, `Case study: ${t.toLowerCase()}.`, `<article class="hero"><div class="container"><h1>${t}</h1><p>A ${s.split('-')[0]} room for a family of four.</p>${photo}</div></article>${slider('Project views')}${form}`));
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>__BASE__${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n\nSitemap: __BASE__/sitemap.xml\n');
  return urls;
}

// ------------------------------------------------------------------------------------------------ server + run
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function serve(root) {
  return new Promise((resolve, reject) => {
    let base = '';
    const srv = http.createServer((req, res) => {
      let p; try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch (e) { res.writeHead(400); return res.end(); }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      let f = path.normalize(path.join(root, p)); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (p.endsWith('/')) f = path.join(f, 'index.html');
      else if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      let status = 200; if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { status = 404; f = path.join(root, '404.html'); }
      const ext = path.extname(f).toLowerCase(); let body = fs.readFileSync(f);
      if (ext === '.xml' || ext === '.txt') body = Buffer.from(body.toString('utf8').split('__BASE__').join(base));
      res.writeHead(status, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${srv.address().port}`; resolve({ srv, base }); });
  });
}
function runNode(script, args, cwd) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = cp.spawn(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, env: Object.assign({}, process.env, { QA_SELFTEST: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; if (VERBOSE) process.stdout.write(d); });
    child.stderr.on('data', d => { err += d; if (VERBOSE) process.stderr.write(d); });
    child.on('close', code => resolve({ code, out, err, ms: Date.now() - t0 }));
  });
}
(async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-check-perf-'));
  const site = path.join(scratch, 'site'); const urls = generate(site);
  const { srv, base } = await serve(site);
  const cfg = { base, staging: true, platform: 'static', pages: [], engines: ENGINES, chromium: 'bundled', budgetMinutes: BUDGET, decisions: { projectType: 'client', englishVariant: 'US', donor: [], singlePage: false }, dictionary: ['Brand'] };
  const cfgFile = path.join(scratch, 'qa-target.json'); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  const out = path.join(scratch, 'out');
  process.stdout.write(`[perf] ${urls.length} pages at ${base} · engines ${ENGINES.join(', ')} · budget ${BUDGET} min · scratch ${scratch}\n`);
  let q, m;
  try {
    q = await runNode('qa-run.cjs', ['--config', cfgFile, '--out', out, '--no-edge'], scratch);
    m = await runNode('manifest.cjs', ['--config', cfgFile, '--out', out, '--platform', 'static', '--stage', '2'], scratch);
  } finally { srv.close(); }
  const md = fs.existsSync(path.join(out, 'manifest.md')) ? fs.readFileSync(path.join(out, 'manifest.md'), 'utf8') : '';
  const time = (md.match(/## Time\n[\s\S]*?(?=\n\| 🔴 fail)/) || [''])[0];
  process.stdout.write(`\n${time || '(no time table — qa-run exit ' + q.code + ': ' + q.err.trim().split('\n').slice(-3).join(' | ') + ')'}\n`);
  const last = (m.out.trim().split('\n').pop() || '');
  process.stdout.write(`[perf] qa-run exit ${q.code} in ${(q.ms / 60000).toFixed(1)} min · ${last}\n`);
  if (KEEP) process.stdout.write(`[perf] kept: ${scratch}\n`); else fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(q.code === 0 ? 0 : 1);
})().catch(e => { console.error('[perf] could not run: ' + (e && e.stack || e)); process.exit(2); });
