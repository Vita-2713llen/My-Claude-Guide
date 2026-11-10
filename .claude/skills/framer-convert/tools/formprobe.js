const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const pg of ['about-us', 'contact-us', '']) {
    await p.goto('https://noverde-128.webflow.io/' + pg, { waitUntil: 'load', timeout: 60000 });
    const r = await p.evaluate(() => [...document.querySelectorAll('form')].map((f) => ({
      form: f.className + ' name=' + f.getAttribute('data-name'),
      fields: [...f.querySelectorAll('input,textarea,select,button')].map((e) => ({ tag: e.tagName, cls: e.className, type: e.type, name: e.name, ph: e.placeholder, req: e.required, val: e.tagName === 'INPUT' && (e.type === 'submit') ? e.value : '', opts: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value + '|' + o.text) : undefined, fs: getComputedStyle(e).fontSize, col: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, pad: getComputedStyle(e).padding, bd: getComputedStyle(e).borderColor, fw: getComputedStyle(e).fontWeight })),
      success: (f.parentElement.querySelector('.w-form-done') || {}).innerText,
    })));
    for (const f of r) { console.log(pg, '|', f.form, '| success:', f.success); for (const x of f.fields) console.log('   ', x.tag, x.type, x.name, 'ph=' + x.ph, 'req=' + x.req, x.val ? 'val=' + x.val : '', x.opts ? 'opts=' + x.opts.join(' ; ') : '', 'bg=' + x.bg, 'col=' + x.col, 'pad=' + x.pad); }
  }
  await b.close();
})();
