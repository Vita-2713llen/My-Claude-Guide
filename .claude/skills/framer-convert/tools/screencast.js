// CDP screencast of a reload: every painted frame saved with timestamp, for blink analysis
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [base, tag, thr] = [process.argv[2], process.argv[3], +(process.argv[4] || 1)];
  const dir = process.argv[5] + '/' + tag; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1750, height: 870 } }); const p = await ctx.newPage();
  await p.goto(base + '/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
  let t0 = 0, n = 0;
  cdp.on('Page.screencastFrame', async (f) => { const t = f.metadata.timestamp * 1000; if (!t0) t0 = t; fs.writeFileSync(`${dir}/${String(Math.round(t - t0)).padStart(5, '0')}_${n++}.jpg`, Buffer.from(f.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 875, maxHeight: 435, everyNthFrame: 1 });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3500);
  await cdp.send('Page.stopScreencast'); console.log(tag, n, 'frames'); await b.close(); })();
