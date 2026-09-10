import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Uses an installed browser; no test dependency, API, account or clinical data required.
const browser = process.env.MODAL_TEST_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const temporary = await mkdtemp(join(tmpdir(), 'yeskira-inventory-tests-'));
try {
  await build({
    configFile: false, root: resolve('tests/inventory'), base: './',
    plugins: [react(), tailwindcss()],
    build: { outDir: join(temporary, 'dist'), emptyOutDir: true },
  });
  // Verify the fixture was built before launching a browser.
  await readFile(join(temporary, 'dist/index.html'));
  for (const size of ['1280,800', '390,844']) {
    const result = spawnSync(browser, [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files', '--disable-background-networking', '--disable-extensions', '--disable-component-update', '--disable-sync',
      `--user-data-dir=${join(temporary, `profile-${size}`)}`, `--window-size=${size}`,
      '--virtual-time-budget=15000', '--dump-dom', `file://${join(temporary, 'dist/index.html')}`,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const output = result.stdout || '';
    const checks = output.match(/<pre id="inventory-test-results">([\s\S]*?)<\/pre>/)?.[1];
    if (result.status !== 0 || !output.includes('data-inventory-tests="passed"')) {
      throw new Error(`Viewport ${size}: ${checks || output} ${result.error || ''} ${result.stderr || ''}`);
    }
    console.log(`PASS ${size}\n${checks}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
