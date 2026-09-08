import { spawn } from 'node:child_process';
const browser = process.env.MODAL_TEST_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const directory = '/tmp/yeskira-budget-print-review';
const run = (args) => new Promise((resolve,reject) => { const p=spawn(browser,['--dump-dom', '--virtual-time-budget=3000', ...args],{stdio:'ignore',timeout:30000});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`Chrome exit ${code}`))); });
for (const count of [1,40]) {
 await Promise.all(['0.00','40.05','100.05'].map(paid => run(['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-component-update','--disable-sync',`--user-data-dir=${directory}/profile-${count}-${paid}`,'--window-size=1000,1400',`--screenshot=${directory}/${count}-${paid}.png`,`--print-to-pdf=${directory}/${count}-${paid}.pdf`,'--no-pdf-header-footer',`file://${directory}/${count}-${paid}.html`])));
 console.log(`Rendered ${count} rows: unpaid, partial, paid (PNG + PDF)`);
}
await run(['--headless','--disable-gpu','--no-first-run','--disable-background-networking',`--user-data-dir=${directory}/mobile-profile`,'--window-size=500,900',`--screenshot=${directory}/mobile.png`,`file://${directory}/40-40.05.html`]);
console.log('Rendered mobile document');
