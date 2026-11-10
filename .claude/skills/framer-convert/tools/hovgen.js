// Generate hover CSS from measured live hover end-states (covers CSS :hover AND Webflow IX2 hovers).
// Input: hova/*.json (from hovaudit.js). Output: hover.css
const fs = require('fs');
const dir = __dirname + '/hova/';
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'opacity', 'transform', 'boxShadow', 'textDecorationLine', 'filter'];
const CSSP = { color: 'color', backgroundColor: 'background-color', borderTopColor: 'border-color', opacity: 'opacity', transform: 'transform', boxShadow: 'box-shadow', textDecorationLine: 'text-decoration-line', filter: 'filter' };
const sel = (k) => k.split(' ').filter((c) => c && !/^w-(?!slider-arrow)/.test(c)).map((c) => `[data-framer-name~="${c}"]`).join('');
const rules = new Map();
const trans = new Set();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const { live } = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
  for (const [k, ch] of Object.entries(live.res)) {
    if (!ch || typeof ch !== 'object') continue;
    const T = sel(k); if (!T) continue;
    for (const [key, val] of Object.entries(ch)) {
      const [descFull, prop] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
      const [desc, nth] = descFull.split('#');
      if (!CSSP[prop]) continue; if (/button-hero/.test(k)) continue; if (prop==='transform' && /^none -> matrix\(1, 0, 0, 1, 0, 0\)$/.test(val)) continue;
      const after = val.split(' -> ')[1];
      if (!after) continue;
      let target;
      if (desc === k) target = `${T}:hover`;
      else if (/^[a-z]+$/.test(desc)) { if (prop !== 'color') continue; target = `${T}:hover .framer-text`; }
      else { const D = sel(desc); if (!D) continue; target = `${T}:hover ${D}`; }
      const decl = prop === 'color' ? [`color:${after} !important`, `--framer-text-color:${after} !important`] : [`${CSSP[prop]}:${after} !important`];
      if (prop === 'borderTopColor') decl.push(`--border-color:${after} !important`);
      const r = rules.get(target) || new Set(); decl.forEach((d) => r.add(d)); rules.set(target, r);
      if (prop === 'color') { const t2 = target + ' .framer-text'; const r2 = rules.get(t2) || new Set(); decl.forEach((d) => r2.add(d)); rules.set(t2, r2); }
      const base = target.replace(':hover', '');
      trans.add(base);
    }
  }
}
let out = `/* generated from live hover end-states */\n`;
out += [...trans].map((b) => b).join(',\n') + `{transition:color .35s cubic-bezier(.2,.8,.2,1),background-color .35s cubic-bezier(.2,.8,.2,1),border-color .35s,box-shadow .35s,opacity .35s,transform .45s cubic-bezier(.2,.8,.2,1),filter .35s}\n`;
for (const [t, d] of rules) out += `@media (hover:hover){${t}{${[...d].join(';')}}}\n`;
fs.writeFileSync(__dirname + '/hover.css', out);
console.log('rules', rules.size, 'bytes', out.length);
console.log(out.slice(0, 2500));
