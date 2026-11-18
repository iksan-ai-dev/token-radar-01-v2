// capture.mjs — drives the dashboard in Chrome via CDP-free headless screenshot
// usage: node capture.mjs <url> <outdir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const CHROME = '/home/agentuser/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const args = [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--remote-debugging-port=9222',
  '--window-size=1440,1440',
  'about:blank',
];
const proc = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', (d) => (stderr += d.toString()));

async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await fn(); if (v) return v; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timeout waiting');
}

const list = await waitFor(async () => {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  const j = await r.json();
  return j.find((t) => t.type === 'page') ? j : null;
});
const page = list.find((t) => t.type === 'page');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) {
  const i = ++id;
  return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1440, deviceScaleFactor: 1, mobile: false });

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function goto(url) {
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1500));
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete');
  await new Promise((r) => setTimeout(r, 900));
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(name, buf.length, 'bytes');
}

// ---- 1. board -------------------------------------------------------------
await goto(URL);
console.log('title:', await evalJs('document.title'));
console.log('rows rendered:', await evalJs("document.querySelectorAll('#board tbody tr').length"));
console.log('count line:', await evalJs("document.getElementById('count').textContent"));
await shot('1-board.png');

// ---- 2. detail drawer on rank 1 -------------------------------------------
await evalJs("document.querySelector('#board tbody tr').click()");
await new Promise((r) => setTimeout(r, 700));
console.log('drawer open:', await evalJs("!document.getElementById('drawer').hidden"));
console.log('headline:', await evalJs("document.querySelector('.bigval')?.textContent"));
await shot('2-detail.png');

// ---- 3. filtered view: category Dexs --------------------------------------
await evalJs("document.getElementById('closeDrawer').click()");
await new Promise((r) => setTimeout(r, 400));
await evalJs(`(() => {
  const s = document.getElementById('fCat');
  const opt = [...s.options].find(o => o.text.trim() === 'Dexs');
  s.value = opt.value;
  s.dispatchEvent(new Event('input', {bubbles:true}));
  s.dispatchEvent(new Event('change', {bubbles:true}));
  window.scrollTo(0, 0);
  return s.value;
})()`);
await new Promise((r) => setTimeout(r, 700));
console.log('filtered count:', await evalJs("document.getElementById('count').textContent"));
await shot('3-filtered.png');

// sanity: console errors
console.log('errors:', await evalJs("window.__errs ? window.__errs.length : 0"));

ws.close();
proc.kill('SIGKILL');
console.log('done');
