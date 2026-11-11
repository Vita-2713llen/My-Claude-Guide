// for texts that should be centred: find the ancestor box that is left-stuck inside its parent
const { chromium } = require('playwright');
const [W, pg, ...texts] = process.argv.slice(2);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: 900 } });
await p.goto('https://adaptable-event-041934.framer.app' + pg, { waitUntil: 'load' }); await p.waitForTimeout(2000);
console.log(JSON.stringify(await p.evaluate((texts) => texts.map((t) => { const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase(); const e = [...document.querySelectorAll('h1,h2,h3,h4,p')].find((x) => norm(x.textContent).startsWith(norm(t))); if (!e) return [t, 'nf']; for (let x = e; x && x.parentElement; x = x.parentElement) { const par = x.parentElement; const r = x.getBoundingClientRect(), pr = par.getBoundingClientRect(); const cs = getComputedStyle(par); const il = pr.left + parseFloat(cs.paddingLeft), ir = pr.right - parseFloat(cs.paddingRight); if (r.width < ir - il - 8 && Math.abs(r.left - il) < 2 && r.width > 40) return [t, x.getAttribute('data-framer-name'), par.getAttribute('data-framer-name'), cs.alignItems]; } return [t, 'none']; }), texts)));
await b.close(); })();
