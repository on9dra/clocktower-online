// 介紹第三頁的那段真實對局 public/img/shots/play.mp4：無頭 Chrome 打開演示頁，按步驟點，錄屏，ffmpeg 壓成一小段。
// 先起服務；用法：node tools/film.mjs [網址]（默認 http://localhost:3000）。需要 Chrome 和 ffmpeg
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, ''), PORT = 9371;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// 每段：演示場景、[第幾步, 點完等多久]
const CUTS = [
  { s: 'vote', steps: [[1, 3600], [2, 2800], [7, 7600], [10, 6500]] },
  { s: 'ability', steps: [[1, 5200]] },
  { s: 'end', steps: [[1, 5200]] },
];
// 錄下來的全程裏留哪幾段（秒）：提名、舉手、喊計票、數票、票數不足、無人處決、技能演出、勝利
const KEEP = [[0, 2.2], [5, 6.2], [7.8, 9.3], [11, 12.2], [15, 17], [18, 19.2], [22, 24.5], [28, 31]];
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const tmp = mkdtempSync(join(tmpdir(), 'film-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, 'prof')}`, '--no-proxy-server', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 40 && !page; i++) { await sleep(250); try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { /* 還沒起來 */ } }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(ok => { ws.onopen = ok; });
let id = 0, frames = [], rolling = false;
const wait = new Map();
const cmd = (method, params = {}) => new Promise(ok => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Page.screencastFrame') {
    if (rolling) frames.push({ t: m.params.metadata.timestamp, data: m.params.data });
    cmd('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  }
};
const run = expr => cmd('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cmd('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });

const dir = join(tmp, 'f');
mkdirSync(dir);
const list = [];
let n = 0;
for (const [k, cut] of CUTS.entries()) {
  await cmd('Page.navigate', { url: `${BASE}/demo.html?s=${cut.s}` });
  await sleep(2400);
  await run(`document.head.insertAdjacentHTML('beforeend','<style>.demo-bar{display:none!important}</style>'); return 1`);
  await sleep(300);
  frames = [];
  rolling = true;
  for (const [step, ms] of cut.steps) {
    await run(`document.querySelectorAll('.demo-step')[${step - 1}].click(); return 1`);
    await sleep(ms);
  }
  rolling = false;
  frames.forEach((f, i) => {
    const name = `${String(n++).padStart(6, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    list.push(`file '${join(dir, name).replace(/\\/g, '/')}'`, `duration ${Math.min(.5, (frames[i + 1]?.t ?? f.t + .04) - f.t).toFixed(4)}`);
  });
  console.log(`段 ${k + 1}: ${frames.length} 幀, ${(frames.at(-1).t - frames[0].t).toFixed(1)} 秒`);
}
ws.close();
proc.kill();
writeFileSync(join(tmp, 'list.txt'), list.join('\n') + '\n');
const out = 'public/img/shots/play';
const ff = args => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status) process.exit(r.status); };
// 裁掉側欄和頂欄，只留桌面；服務器帶寬小，壓狠一點
const pick = KEEP.map(([a, b]) => `between(t,${a},${b})`).join('+');
ff(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', `fps=24,select='${pick}',setpts=N/24/TB,crop=932:699:0:44,scale=720:540:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '32', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out + '.mp4']);
ff(['-ss', '6.6', '-i', out + '.mp4', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '68', out + '.webp']);
console.log('ok', out);
process.exit(0);
