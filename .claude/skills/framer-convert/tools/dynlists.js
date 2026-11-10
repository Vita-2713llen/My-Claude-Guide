// Count live collection lists per page (class of list + first item) — parse-free, rendered in Chromium
const { chromium } = require('playwright');
const pages = ['', 'about-us', 'services', 'our-team', 'pricing', 'our-impact', 'contact-us', 'blog', 'services/esg-strategy', 'team/aidan-clery', 'our-impact/reforestation', 'blog/the-emission-factor-you-cite'];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const pg of pages) {
    await p.goto('https://noverde-128.webflow.io/' + pg, { waitUntil: 'load', timeout: 60000 });
    const r = await p.evaluate(() => [...document.querySelectorAll('.w-dyn-list')].map((l) => {
      const items = l.querySelectorAll('.w-dyn-item');
      const sec = l.closest('section, .section, [class*=section]');
      return `${l.className} > items=${items.length} item=${items[0] ? items[0].className : '-'} | in ${sec ? sec.className : '?'} | text: ${(items[0] ? items[0].innerText : '').replace(/\s+/g, ' ').slice(0, 50)}`;
    }));
    console.log('== /' + pg + '  lists=' + r.length + '\n  ' + r.join('\n  '));
  }
  await b.close();
})();
