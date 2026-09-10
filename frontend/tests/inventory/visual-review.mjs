import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const directory = '/tmp/yeskira-inventory-visual-review';
await mkdir(directory, { recursive: true });
await build({ configFile: false, root: resolve('tests/inventory'), base: './', plugins: [react(), tailwindcss()], build: { outDir: `${directory}/dist`, emptyOutDir: true } });
const browser = process.env.MODAL_TEST_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(`${directory}/cdp-`);
const chrome = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--disable-background-networking', '--disable-extensions', '--disable-component-update', '--disable-sync', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank']);
try {
  const endpoint = await new Promise((resolve, reject) => { let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); }); chrome.on('error', reject); });
  const socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const msg = JSON.parse(event.data); const p = pending.get(msg.id); if (p) { pending.delete(msg.id); if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result); } });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
  const report = [];
  for (const view of ['empty', 'dashboard', 'no-lots', 'entry', 'multi-lots', 'consumption', 'waste', 'adjustment-in', 'adjustment-out', 'expired', 'product', 'suppliers', 'inactive', 'normal']) for (const [width, height] of [[1280, 960], [390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call('Page.navigate', { url: `file://${directory}/dist/index.html?review=${view}` }, sessionId);
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(`document.body?.dataset.review === '${view}'`)) { ready = true; break; }
      if (await evaluate("document.body?.dataset.inventoryTests === 'failed'")) throw new Error(await evaluate("document.getElementById('inventory-test-results').textContent"));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`View did not reach checkpoint: ${view}`);
    await new Promise(resolve => setTimeout(resolve, 900)); // Let navigation animations finish before capture.
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    if (overflow) throw new Error(`Horizontal overflow: ${view} ${width}`);
    // Reset scroll because browser interaction can scroll a control into view.
    await evaluate("window.scrollTo(0,0); document.querySelector('[role=dialog]')?.scrollTo(0,0)");
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(`${directory}/${view}-${width}.png`, Buffer.from(data, 'base64'));
    const hasModal = await evaluate("!!document.querySelector('[role=dialog]')");
    if (hasModal) {
      await evaluate("document.querySelector('[role=dialog]').scrollTo(0,10000)");
      const bottom = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      await writeFile(`${directory}/${view}-${width}-bottom.png`, Buffer.from(bottom.data, 'base64'));
    } else {
      const { cssContentSize } = await call('Page.getLayoutMetrics', {}, sessionId);
      const full = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: cssContentSize.height, scale: 1 } }, sessionId);
      await writeFile(`${directory}/${view}-${width}-full.png`, Buffer.from(full.data, 'base64'));
    }
    report.push({ view, width, height, overflow, modal: hasModal });
    console.log(`Rendered ${view} ${width}x${height}`);
  }
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  socket.close();
} finally { chrome.kill(); }
