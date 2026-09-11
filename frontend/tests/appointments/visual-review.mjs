import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const directory = '/tmp/yeskira-appointment-visual-review';
await mkdir(directory, { recursive: true });
await build({ configFile: false, root: resolve('tests/appointments'), base: './', plugins: [react(), tailwindcss()], build: { outDir: `${directory}/dist`, emptyOutDir: true } });
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
  const cases = [['month', 1440, 1000], ['day', 1440, 900], ['form', 1280, 900], ['form', 390, 844], ['detail', 1280, 900]];
  const selected = process.argv.includes('--test') ? [['test', 1280, 900]] : process.argv.includes('--remaining') ? [cases[0], cases[4]] : cases;
  for (const [view, width, height] of selected) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call('Page.navigate', { url: `file://${directory}/dist/index.html?review=${view}` }, sessionId);
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(view === 'test' ? "document.body?.dataset.appointmentTests === 'passed'" : `document.body?.dataset.review === '${view}'`)) { ready = true; break; }
      if (await evaluate("document.body?.dataset.appointmentTests === 'failed'")) throw new Error(await evaluate("document.getElementById('appointment-test-results').textContent"));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`View did not reach checkpoint: ${view}`);
    if (view === 'test') { console.log(await evaluate("document.getElementById('appointment-test-results').textContent")); continue; }
    await new Promise(resolve => setTimeout(resolve, 900)); // Let navigation animations finish before capture.
    const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
    if (overflow) throw new Error(`Horizontal overflow: ${view} ${width}`);
    // Reset scroll because browser interaction can scroll a control into view.
    await evaluate("window.scrollTo(0,0); document.querySelector('[role=dialog]')?.scrollTo(0,0)");
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(`${directory}/${view}-${width}.png`, Buffer.from(data, 'base64'));
    const hasModal = await evaluate("!!document.querySelector('[role=dialog]')");
    report.push({ view, width, height, overflow, modal: hasModal });
    console.log(`Rendered ${view} ${width}x${height}`);
  }
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  socket.close();
} finally { chrome.kill(); }
