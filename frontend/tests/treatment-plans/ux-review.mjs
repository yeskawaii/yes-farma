import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const directory = '/tmp/yeskira-treatment-ux-review';
await mkdir(directory, {recursive:true});
await build({configFile:false,root:resolve('tests/treatment-plans'),base:'./',plugins:[react(),tailwindcss()],build:{outDir:`${directory}/dist`,emptyOutDir:true}});
const browser=process.env.MODAL_TEST_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(`${directory}/cdp-`);
const chrome = spawn(browser,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--allow-file-access-from-files','--disable-background-networking','--disable-extensions','--disable-component-update','--disable-sync',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank']);
try {
  const endpoint = await new Promise((resolve,reject) => { let output=''; chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)resolve(match[1]);});chrome.on('error',reject); });
  const socket=new WebSocket(endpoint); await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  let id=0; const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}});
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  for (const view of ['empty','plan','treatment','create','discount','edit','accepted','partial','paid']) for (const [width,height] of [[1280,1000],[390,844]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await call('Page.navigate',{url:`file://${directory}/dist/index.html?review=${view}`},sessionId);
    let ready=false;
    for(let attempt=0;attempt<100;attempt++) {
      const result=await call('Runtime.evaluate',{expression:`document.body?.dataset.review === '${view}'`,returnByValue:true},sessionId);
      if(result.result.value){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready) throw new Error(`View did not reach checkpoint: ${view}`);
    const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
    await writeFile(`${directory}/${view}-${width},${height}-viewport.png`,Buffer.from(data,'base64'));
    console.log(`Rendered ${view} ${width}x${height}`);
  }
  socket.close();
} finally { chrome.kill(); }
