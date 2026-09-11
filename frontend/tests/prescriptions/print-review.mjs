import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
const browser = process.env.MODAL_TEST_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const directory = '/tmp/yeskira-prescription-print-review';
for (const count of [1, 3, 30]) for (const status of ['ISSUED', 'CANCELLED']) {
  const name = `${count}-${status}`;
  for (const ext of ['png', 'pdf']) rmSync(`${directory}/${name}.${ext}`, { force: true });
  const result = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-component-update', '--disable-sync', `--user-data-dir=${directory}/profile-${name}`, '--window-size=850,1100', '--virtual-time-budget=2000', '--dump-dom', `--screenshot=${directory}/${name}.png`, `--print-to-pdf=${directory}/${name}.pdf`, '--no-pdf-header-footer', `file://${directory}/${name}.html`], { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  if (result.status !== 0 && result.error?.code !== 'ETIMEDOUT') throw new Error(`${name}: ${result.error || result.stderr}`);
  // Some macOS Chrome builds finish artifacts but delay process shutdown.
  // Artifact assertions remain mandatory even when the process needs termination.
  const png = readFileSync(`${directory}/${name}.png`);
  if (!png.subarray(1,4).equals(Buffer.from('PNG'))) throw new Error(`Invalid PNG: ${name}`);
  const pdf = readFileSync(`${directory}/${name}.pdf`);
  if (!pdf.subarray(0, 4).equals(Buffer.from('%PDF'))) throw new Error(`Invalid PDF: ${name}`);
  console.log(`PASS PDF + PNG: ${name}`);
}
