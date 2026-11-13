const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1750, height: 870 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { const T0 = performance.now(); window.__l = []; const last = new Map(); const ids = new WeakMap(); let n = 0;
    const tick = () => { [...document.querySelectorAll('img')].filter(i => { const r = i.getBoundingClientRect(); return r.width > 600 && r.top < 870 && r.bottom > 0; }).forEach(im => {
        if (!ids.has(im)) ids.set(im, 'img' + (++n)); const id = ids.get(im); const r = im.getBoundingClientRect();
        let op = 1, tf = [], clip = []; for (let e = im; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); op *= +cs.opacity; if (cs.transform !== 'none') tf.push(cs.transform.replace(/matrix\(|\)/g, '').split(',').map(x => Math.round(+x * 100) / 100).join(',')); if (cs.clipPath !== 'none') clip.push(cs.clipPath.slice(0, 30)); if (cs.visibility === 'hidden' || cs.display === 'none') op = 0; }
        const k = (im.currentSrc || '').split('?')[1].slice(0, 22) + ' top' + Math.round(r.top) + ' h' + Math.round(r.height) + ' op' + Math.round(op * 10) / 10 + ' tf[' + tf.join(' ; ') + '] clip[' + clip.join(';') + '] nw' + im.naturalWidth;
        if (last.get(id) !== k) { last.set(id, k); window.__l.push(Math.round(performance.now() - T0) + 'ms ' + id + ' ' + k); } });
      if (performance.now() - T0 < 3500) requestAnimationFrame(tick); };
    const go = () => document.body ? tick() : setTimeout(go, 2); go(); });
  await p.goto('https://adaptable-event-041934.framer.app/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3600);
  const l = await p.evaluate(() => window.__l); console.log(l.filter((x, i) => i < 8 || !/op(0\.[1-8])/.test(x)).join('\n')); await b.close(); })();
