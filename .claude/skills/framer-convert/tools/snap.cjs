// Saves a live page's server-rendered HTML with JavaScript disabled (nothing from the page is executed).
// Usage: node snap.cjs <url> <out.html>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 90000 });
  fs.writeFileSync(process.argv[3], await p.content());
  console.log('saved', process.argv[3]);
  await b.close();
})();
