// 真實界面試玩台：一個測試員一套——自己的服務（代碼快照）、自己的無頭 Chrome（靜音）、多台「設備」（各自獨立的瀏覽器上下文 = 各自的 localStorage / 身份）。
// 所有操作都是真的鼠標事件打在頁面上，點之前做命中測試（按鈕在屏幕外、被別的東西擋住就不點，報出來——這本身就是要找的問題）。
// 啓動：node tools/uitest/rig.mjs <名字> <基準端口> [代碼目錄] [預設參數…]     服務 = 基準端口，Chrome 調試 = +1，控制 = +2
//       不給代碼目錄就把當前項目（public、lib、server.js）複製一份快照來跑：別的會話這時候改代碼，這一局不受影響
//       帶了預設參數（鍵=值，見 preset.mjs）就先擺好那個局面再打印 RIG READY
// 操作：node tools/uitest/ui.mjs <控制端口> <命令> ...（見 ui.mjs 開頭）。給測試員（子代理）的說明在 README.md
// 運行時的東西（快照、房間數據、瀏覽器資料、截圖）都在系統臨時目錄的 botc-uitest/ 下，不進項目。存檔在 botc-uitest/saves/，各台 rig 共用
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const [name = 'rig', base = '3310'] = argv;
// src=<目錄>：快照和 sync 從這個目錄取（比如 git archive 導出的某個提交），不給就是項目本身
const codeDir = argv.slice(2).find(a => !a.includes('=')), src = argv.find(a => a.startsWith('src='))?.slice(4);
const bootPreset = argv.slice(2).filter(a => a.includes('=') && !a.startsWith('src='));
const PORT = Number(base), DBG = PORT + 1, CTL = PORT + 2;
const HERE = path.dirname(fileURLToPath(import.meta.url)), project = path.join(HERE, '..', '..'), root = src ? path.resolve(src) : project;
const TOP = path.join(os.tmpdir(), 'botc-uitest'), dir = path.join(TOP, 'run-' + name), SAVES = path.join(TOP, 'saves');
const DATA = path.join(dir, 'data'), ROOMS = path.join(DATA, 'rooms');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();

// ───── 清掉上一次 ─────
// 舊版 rig 在快照裏放過一個指向項目 node_modules 的目錄聯接：只摘掉聯接本身（rmdir 不跟進去），確認沒了再刪目錄，絕不順著它刪進項目裏
function dropLink(p) {
  try { if (!fs.lstatSync(p).isSymbolicLink()) return; } catch { return; }
  try { fs.rmdirSync(p); } catch { try { fs.unlinkSync(p); } catch { /* 下面會檢查 */ } }
}
function removeRun(d) {
  const link = path.join(d, 'snap', 'node_modules');
  dropLink(link);
  if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) throw new Error('清不掉 node_modules 聯接，先手動刪掉：' + link);
  fs.rmSync(d, { recursive: true, force: true });
}
try { removeRun(dir); } catch (e) { console.log(e.message); process.exit(1); }
// 別的、早就不用的 rig 目錄（6 小時沒動過）順手清掉：舊版的聯接留著是個隱患
for (const f of fs.existsSync(TOP) ? fs.readdirSync(TOP) : []) {
  const d = path.join(TOP, f);
  if (!f.startsWith('run-') || d === dir) continue;
  try { const log = path.join(d, 'server.log'); if (Date.now() - fs.statSync(fs.existsSync(log) ? log : d).mtimeMs > 6 * 3600e3) removeRun(d); } catch { /* 正在用或刪不掉：不管 */ }
}
fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });

// ───── 快照 ─────
// 靜態文件是服務現讀現發的，直接跑項目目錄的話，別人中途改一個文件這一局就前後不一致。
// 自己遞歸複製：Node 22 的 fs.cpSync 在 Windows 上遇到帶中文的路徑會直接崩掉（進程退出碼 0xC0000409，沒有任何報錯）。保留修改時間，sync 靠它比對
const SNAP_PARTS = ['public', 'lib', 'server.js', 'package.json'];
function copy(from, to) {
  const s = fs.statSync(from);
  if (!s.isDirectory()) { fs.copyFileSync(from, to); fs.utimesSync(to, s.atime, s.mtime); return; }
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) copy(path.join(from, f), path.join(to, f));
}
let SNAP = codeDir && path.resolve(codeDir);
if (!SNAP) {
  SNAP = path.join(dir, 'snap');
  fs.mkdirSync(SNAP, { recursive: true });
  for (const f of SNAP_PARTS) copy(path.join(root, f), path.join(SNAP, f));
  ensureModules();
}
// 依賴：botc-uitest/node_modules 放一份真的拷貝，所有 rig 共用（Node 找包會一層層往上找到它）。不用聯接；package-lock 變了才重拷
function ensureModules() {
  const lock = ['package-lock.json', 'package.json'].map(f => path.join(project, f)).find(f => fs.existsSync(f));
  const stamp = crypto.createHash('md5').update(fs.readFileSync(lock)).digest('hex'), mods = path.join(TOP, 'node_modules'), mark = path.join(mods, '.rig-stamp');
  if (fs.existsSync(mark) && fs.readFileSync(mark, 'utf8') === stamp) return;
  const tmp = path.join(TOP, 'node_modules.tmp-' + process.pid);
  copy(path.join(project, 'node_modules'), tmp);
  fs.writeFileSync(path.join(tmp, '.rig-stamp'), stamp);
  dropLink(mods);
  try { fs.rmSync(mods, { recursive: true, force: true }); fs.renameSync(tmp, mods); } catch { fs.rmSync(tmp, { recursive: true, force: true }); } // 別的 rig 同時在換：用它的
}
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(f => fs.existsSync(f));
if (!CHROME) { console.log('找不到 Chrome：用環境變量 CHROME 指定路徑'); process.exit(1); }

// ───── 服務 ─────
// 經 serve.mjs 跑：停之前讓它先把房間寫盤（Windows 上 kill 是硬殺）。重啓服務時瀏覽器不動，頁面自己重連
const slog = fs.createWriteStream(path.join(dir, 'server.log'), { flags: 'a' });
let server = null;
async function startServer() {
  server = spawn(process.execPath, [path.join(HERE, 'serve.mjs')], { cwd: SNAP, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: String(PORT), RATE_LIMIT: '0', DATA_DIR: DATA } });
  server.stdout.pipe(slog, { end: false }); server.stderr.pipe(slog, { end: false });
  const me = server;
  for (let i = 0; i < 150; i++) {
    if (me.exitCode !== null) throw new Error('服務起不來，看 serverlog');
    try { if ((await fetch(`http://127.0.0.1:${PORT}/favicon.ico`)).ok) return; } catch { /* 還沒起來 */ }
    await sleep(100);
  }
  throw new Error('服務 15 秒沒起來');
}
async function stopServer() {
  const s = server;
  if (!s || s.exitCode !== null) return;
  server = null;
  const gone = new Promise(r => s.once('exit', r));
  try { s.send('stop'); } catch { s.kill(); }
  if (await Promise.race([gone.then(() => true), sleep(4000)]) !== true) { s.kill(); await gone; }
}
const ask = (msg, ms = 3000) => (server && server.exitCode === null ? Promise.race([new Promise(r => { server.once('message', r); server.send(msg); }), sleep(ms).then(() => null)]) : Promise.resolve(null));
const flushServer = () => ask('flush');
// 房間目錄裏放好了新存檔：讓服務直接讀進內存（同號的房間換掉），不用重啓；沒回音才重啓
async function reloadRooms() { if (await ask('reload') !== 'reloaded') { await stopServer(); await startServer(); } }
await startServer();

// ───── Chrome ─────
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${path.join(dir, 'chrome')}`, '--no-proxy-server', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 80 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); } catch { /* 還沒起來 */ } }
if (!ver) { console.log('Chrome 沒起來'); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let seq = 0, fast = false;
const pending = new Map(), devs = {}, bySession = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  const d = bySession.get(m.sessionId);
  if (!d) return;
  const p = m.params || {};
  if (m.method === 'Runtime.exceptionThrown') d.errors.push('異常：' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 400));
  else if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') d.errors.push('console.error：' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  else if (m.method === 'Log.entryAdded' && p.entry?.level === 'error' && !/ERR_CONNECTION|favicon|rig-blank/.test(p.entry.text + p.entry.url)) d.errors.push('日誌：' + `${p.entry.text} ${p.entry.url || ''}`.slice(0, 300));
  else if (m.method === 'Page.javascriptDialogOpening') { d.errors.push('瀏覽器原生對話框：' + p.message); send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {}); }
  else if (m.method === 'Page.fileChooserOpened') {
    if (d.file) send('DOM.setFileInputFiles', { files: [d.file], backendNodeId: p.backendNodeId }, m.sessionId).then(() => { d.note = '文件已選：' + d.file; d.file = null; }, err => { d.note = '選文件失敗：' + err.message; });
    else d.note = '頁面打開了文件選擇框，但沒有用 upload 指定文件';
  }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++seq;
  pending.set(i, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId && { sessionId }) }));
});

async function device(dev, w, h) {
  if (devs[dev]) return devs[dev];
  const st = dev === 'st';
  w = Number(w) || (st ? 1280 : 375); h = Number(h) || (st ? 800 : 664);
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const d = devs[dev] = { dev, sessionId, browserContextId, errors: [], file: null, note: null, w, h };
  bySession.set(sessionId, d);
  d.S = (m, p) => send(m, p, sessionId);
  for (const m of ['Page.enable', 'Runtime.enable', 'Log.enable', 'DOM.enable']) await d.S(m);
  await size(d, w, h);
  await d.S('Emulation.setFocusEmulationEnabled', { enabled: true });
  // 開場的加載動畫和首次介紹不是這次要測的：當作來過的人
  await d.S('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('botc.boot','1');localStorage.setItem('botc.intro','1')}catch(e){}" });
  await d.S('Page.setInterceptFileChooserDialog', { enabled: true });
  await speed(d);
  return d;
}
// 收掉一台設備（連同它的 localStorage）
async function drop(dev) {
  const d = devs[dev];
  if (!d) return;
  delete devs[dev]; bySession.delete(d.sessionId);
  await send('Target.disposeBrowserContext', { browserContextId: d.browserContextId }).catch(() => {});
}
async function size(d, w, h) {
  const mobile = w < 900;
  Object.assign(d, { w, h });
  await d.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await d.S('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
}
// 加速：頁面當作用戶開了「減少動態效果」（應用自己的開關：演出直接跳到結尾），剩下的 CSS / Web 動畫 8 倍速。只在測試台裏，產品代碼不知道
// Animation 域只在加速時開著：開著的時候每個動畫都會發一條事件過來
async function speed(d) {
  await d.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: fast ? 'reduce' : 'no-preference' }] });
  if (!fast && !d.anim) return;
  if (fast) await d.S('Animation.enable');
  await d.S('Animation.setPlaybackRate', { playbackRate: fast ? 8 : 1 });
  if (!fast) await d.S('Animation.disable');
  d.anim = fast;
}
const ev = async (d, expression) => {
  const r = await d.S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('頁面腳本出錯：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const mouse = (d, type, x, y) => d.S('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
async function click(d, x, y) { await mouse(d, 'mouseMoved', x, y); await sleep(60); await mouse(d, 'mousePressed', x, y); await sleep(40); await mouse(d, 'mouseReleased', x, y); }
// 頁面打開以後：開場的加載畫面長短不一（第一次要拉素材），等到屏幕上有能點的東西再交還，最多等 20 秒
async function settle(d, max = 23) {
  for (let i = 0; i < max; i++) { const v = await ev(d, PAGE).catch(() => null); if (v?.items.some(x => x.state === 'ok') && !v.busy) return; await sleep(i < 5 ? 300 : 800); }
}
// 先到同一個網站上的空白頁寫好 localStorage / sessionStorage，再打開真正的網址：頁面一加載就是那個人
async function boot(d, url, ls = {}, ss = {}) {
  await d.S('Page.navigate', { url: `http://localhost:${PORT}/rig-blank` });
  for (let i = 0; i < 40 && await ev(d, 'location.origin').catch(() => '') !== `http://localhost:${PORT}`; i++) await sleep(50);
  await ev(d, `(() => { const ls = ${JSON.stringify(ls)}, ss = ${JSON.stringify(ss)}; for (const k in ls) localStorage.setItem(k, ls[k]); for (const k in ss) sessionStorage.setItem(k, ss[k]); })()`);
  await d.S('Page.navigate', { url: new URL(url, `http://localhost:${PORT}/`).href });
  await sleep(600);
  await settle(d);
}

// ───── 在頁面裏跑的：看一眼現在屏幕上有什麼 ─────
const PAGE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const cn = el => String(el.className?.baseVal ?? el.className ?? '');
  const rect = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null; return r; };
  const txt = (el, n = 70) => (el.innerText || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const tagOf = el => '<' + el.tagName.toLowerCase() + (cn(el) ? '.' + cn(el).split(/\\s+/).slice(0, 2).join('.') : '') + '>';
  const label = el => txt(el) || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || tagOf(el);
  const clickable = el => el.matches('button, a[href], input, textarea, select, [role=button]') || typeof el.onclick === 'function';
  // 浮層：彈窗、菜單、選角面板、整屏劇本單、整屏展示
  const LAYER = /(^|\\s)(backdrop|popmenu|pass|rp|rp-[a-z-]+|sp-[a-z-]+|boot|loader|block)(\\s|$)/;
  const layer = el => { for (let c = el; c && c !== document.body; c = c.parentElement) if (LAYER.test(cn(c))) return true; return false; };
  // 這個點上最上面的是不是它；不是的話是誰
  const probe = (el, r) => {
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x >= vw || y >= vh) return { x, y, state: 'off' };
    const top = document.elementFromPoint(x, y);
    if (top && (el === top || el.contains(top))) return { x, y, state: 'ok' };
    let c = top; while (c && c !== document.body && !clickable(c)) c = c.parentElement;
    const by = top ? (c && c !== document.body ? '「' + label(c) + '」' : tagOf(top)) : '?';
    return { x, y, state: 'covered', by, soft: !!top && layer(top) };
  };
  const items = [];
  for (const el of document.querySelectorAll('*')) {
    if (!clickable(el) || el.closest('.seat') || el.classList.contains('backdrop') || getComputedStyle(el).pointerEvents === 'none') continue;
    const r = rect(el); if (!r) continue;
    const p = probe(el, r), l = label(el);
    if (items.some(o => o.label === l && Math.abs(o.x - p.x) < 4 && Math.abs(o.y - p.y) < 4)) continue;
    items.push({ label: l, ...p, layer: layer(el), w: Math.round(r.width), h: Math.round(r.height), grey: el.disabled || /\\bdisabled\\b|\\boff\\b/.test(cn(el)), on: /\\bon\\b|\\bselected\\b|\\bactive\\b/.test(cn(el)), input: el.matches('input, textarea') ? (el.value || '') : undefined });
  }
  const seats = [...document.querySelectorAll('.ring > .seat')].sort((a, b) => a.dataset.i - b.dataset.i).map(el => {
    const tk = el.querySelector('.seat-token') || el, r = rect(tk);
    const p = r ? probe(tk, r) : { state: 'hidden' };
    const flags = ['dead', 'mine', 'selected', 'selectable', 'unselectable', 'fixed-pick', 'aimed', 'nominee', 'nominator', 'onblock'].filter(k => el.classList.contains(k));
    const plate = txt(el.querySelector('.plate') || { innerText: '' }, 20).replace(/^\\d+\\s*/, ''), tok = txt(el.querySelector('.token-name') || tk, 12);
    return { n: +el.dataset.i + 1, name: plate, role: tok && tok !== plate ? tok : '', flags, tags: txt(el.querySelector('.seat-more') || { innerText: '' }, 60), ...p };
  });
  const REG = ['.toast', '.backdrop .modal', '.popmenu', '.phase-title', '.phase-tag', '.phase-sub', '.st-card', '.turn-pane', '.fold-stub', '.trial', '.hud', '.bluffs', '.obit', '.pass', '.rp-panel', '.pc', '.center > .cx', '.script-card'];
  const regions = [];
  for (const q of REG) for (const el of document.querySelectorAll(q)) { const r = rect(el); if (!r) continue; const t = txt(el, 260); if (t) regions.push({ q, t, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }); }
  const mid = document.elementFromPoint(vw / 2, vh / 2);
  const chain = []; for (let c = mid; c && c !== document.body && chain.length < 4; c = c.parentElement) chain.push(tagOf(c));
  // 輪到我：選人牌、投票鍵
  const turn = document.querySelector('.turn-pane, .fold-stub'), vote = document.querySelector('.vbtn');
  return { url: location.href, vw, vh, phase: document.body.dataset.phase || '', top: chain.join(' < '), items, seats, regions,
    busy: !!document.querySelector('body > .block'),
    turn: turn && rect(turn) ? txt(turn, 80) : null, vote: !!(vote && rect(vote)), modal: !!document.querySelector('.backdrop .modal'),
    scroll: document.documentElement.scrollHeight > vh + 4 ? '頁面可以上下滾動（' + document.documentElement.scrollHeight + ' > ' + vh + '）' : null };
})()`;

function fmt(d, v, full) {
  const out = [`【${d.dev} ${v.vw}x${v.vh}】最上層：${v.top}`];
  if (d.note) { out.push('※ ' + d.note); d.note = null; }
  if (v.busy) out.push('⏳ 正在播放演出（整屏蓋著，這時候點不到是正常的：wait 幾秒再 look，或者點屏幕上的「跳过」）');
  for (const r of v.regions) out.push(`  ${r.q}：${r.t}`);
  if (v.seats.length) {
    out.push('座位：' + v.seats.map(s => `${s.n}號${s.name || s.role || ''}${s.name && s.role ? '(' + s.role + ')' : ''}${s.flags.length ? '[' + s.flags.join(',') + ']' : ''}${s.tags ? '{' + s.tags + '}' : ''}${s.state === 'ok' ? '' : s.state === 'covered' ? '⚠被' + s.by + '擋住' : s.state === 'off' ? '⚠在屏幕外' : ''}`).join('  '));
  }
  const ok = v.items.filter(i => i.state === 'ok').sort((a, b) => b.layer - a.layer), bad = v.items.filter(i => i.state !== 'ok' && !(i.state === 'covered' && i.soft));
  const line = i => `「${i.label}」${i.input !== undefined ? '(輸入框:' + i.input + ')' : ''}${i.grey ? '(灰)' : ''}${i.on ? '(選中)' : ''}@${i.x},${i.y}`;
  const cap = full ? 200 : 48;
  out.push('能點的：' + (ok.slice(0, cap).map(line).join('  ') || '（沒有）') + (ok.length > cap ? `  …還有 ${ok.length - cap} 個（look ${d.dev} all）` : ''));
  if (bad.length) out.push('⚠ 點不到的：' + bad.slice(0, 20).map(i => `${line(i)} ${i.state === 'off' ? '在屏幕外' : '被' + i.by + '擋住'}`).join('  '));
  if (v.scroll) out.push(v.scroll);
  if (d.errors.length) out.push(`⚠ 這台設備有 ${d.errors.length} 條頁面錯誤（errors ${d.dev} 查看）`);
  return out.join('\n');
}
const look = async (d, full) => fmt(d, await ev(d, PAGE), full);
const need = dev => { const d = devs[dev]; if (!d) throw new Error(`沒有設備 ${dev}，先 open`); return d; };
const secs = from => ((Date.now() - from) / 1000).toFixed(1) + ' 秒';
const WH = s => { const m = /^(\d+)x(\d+)$/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };

// 截圖前等一等：有限時長的動畫（淡入、轉場）都播完；循環的氛圍動畫不算。最多等 4 秒
const CALM = `document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity).length`;
async function calm(d) { for (let i = 0; i < 20 && await ev(d, CALM).catch(() => 0) > 0; i++) await sleep(200); }
let shotN = 0;
async function shoot(d, label, settled = true) {
  if (settled) await calm(d);
  const file = path.join(dir, 'shots', `${String(++shotN).padStart(3, '0')}-${d.dev}-${String(label).replace(/[^\w\u4e00-\u9fff-]/g, '_')}.png`);
  const r = await d.S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file.replace(/\\/g, '/');
}
// 每台設備的身份和網址：存檔、恢復都用它
const storageOf = d => ev(d, `(() => { const dump = s => Object.fromEntries(Object.keys(s).map(k => [k, s.getItem(k)])); return { url: location.pathname + location.search, ls: dump(localStorage), ss: dump(sessionStorage) }; })()`);
// 換一批設備：先全部收掉（舊身份不帶進新局面），再並排打開
async function openAll(list) {
  for (const dev of Object.keys(devs)) await drop(dev);
  await Promise.all(list.map(async x => { const d = await device(x.dev, x.w, x.h); await boot(d, x.url, x.ls, x.ss); }));
}
// 存檔裏的時間戳（假裝叫醒、投票倒數、最後活動時間）整體挪到現在：讀回來的局面和存的時候一樣，不會一打開就到點
function shiftTimes(o, from, delta) {
  if (Array.isArray(o)) return o.map(x => shiftTimes(x, from, delta));
  if (o && typeof o === 'object') { for (const k in o) o[k] = shiftTimes(o[k], from, delta); return o; }
  return typeof o === 'number' && Math.abs(o - from) < 12 * 3600e3 ? o + delta : o;
}
const saveDir = n => { if (!/^[\w\u4e00-\u9fff-]{1,40}$/.test(n || '')) throw new Error('存檔名只用字母、數字、中文、- 和 _'); return path.join(SAVES, n); };

// 只在動一動 lib / server.js 時才要重啓服務；public 的改動刷新頁面就有
function diffTree(rel, out) {
  const a = path.join(root, rel), b = path.join(SNAP, rel);
  const sa = fs.existsSync(a) && fs.statSync(a), sb = fs.existsSync(b) && fs.statSync(b);
  if (sa && sa.isDirectory()) {
    const names = new Set([...fs.readdirSync(a), ...(sb && sb.isDirectory() ? fs.readdirSync(b) : [])]);
    for (const f of names) diffTree(path.join(rel, f), out);
  } else if (sa && (!sb || sa.size !== sb.size || Math.abs(sa.mtimeMs - sb.mtimeMs) > 1)) out.push({ rel, gone: false });
  else if (!sa && sb) out.push({ rel, gone: true });
  return out;
}

const CMD = {
  async open(dev, url = 'home', w, h) {
    const d = await device(dev, w, h);
    if (url === 'home') url = `http://localhost:${PORT}/`;
    else if (url === 'room') {
      const st = devs.st && await ev(devs.st, 'location.href');
      if (!st || !/room=/.test(st)) throw new Error('說書人（st）還沒有建好房間，拿不到房間鏈接');
      url = st.replace(/[?&]st=[^&]*/, '');
    }
    await d.S('Page.navigate', { url });
    await sleep(1500);
    await settle(d);
    return `打開了 ${url}\n` + await look(d);
  },
  look: (dev, all) => look(need(dev), all === 'all'),
  // 一台玩家手機進房間：打開分享鏈接 → 點暱稱框 → 輸入名字 → 點「加入房间」（都是真的點和輸入，只是省得每台敲四條命令）
  async join(dev, nick, w, h) {
    await CMD.open(dev, 'room', w, h);
    const d = need(dev);
    for (let i = 0; i < 10; i++) { const v = await ev(d, PAGE); if (v.items.some(x => x.input !== undefined && x.state === 'ok')) break; await sleep(800); }
    const v = await ev(d, PAGE), box = v.items.find(x => x.input !== undefined && x.state === 'ok');
    if (!box) return '✗ 進房間的頁面上找不到暱稱輸入框\n' + fmt(d, v);
    await click(d, box.x, box.y);
    await d.S('Input.insertText', { text: nick });
    return CMD.tap(dev, '加入房间');
  },
  async tap(dev, text, nth) {
    const d = need(dev), v = await ev(d, PAGE);
    let c = v.items.filter(i => i.label === text);
    if (!c.length) c = v.items.filter(i => i.label.includes(text));
    if (!c.length) return `✗ 屏幕上找不到「${text}」\n` + fmt(d, v);
    const ok = c.filter(i => i.state === 'ok');
    if (!ok.length) return `✗「${text}」點不到：` + c.map(i => (i.state === 'off' ? `在屏幕外 @${i.x},${i.y}（屏幕 ${v.vw}x${v.vh}）` : `被 ${i.by} 擋住 @${i.x},${i.y}`)).join('；') + '\n' + fmt(d, v);
    if (ok.length > 1 && !nth) return `✗ 有 ${ok.length} 個「${text}」：` + ok.map((i, k) => `第${k + 1}個「${i.label}」@${i.x},${i.y}`).join('  ') + `\n用 tap ${dev} "${text}" <第幾個>，或 tapxy`;
    const t = ok[(Number(nth) || 1) - 1];
    if (!t) return `✗ 沒有第 ${nth} 個`;
    await click(d, t.x, t.y);
    await sleep(750);
    return `✓ 點了「${t.label}」${t.grey ? '（它是灰的）' : ''}@${t.x},${t.y}\n` + await look(d);
  },
  async tapxy(dev, x, y) {
    const d = need(dev);
    const what = await ev(d, `(() => { const e = document.elementFromPoint(${+x}, ${+y}); return e ? '<' + e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ').slice(0,2).join('.') + '> ' + (e.innerText || '').replace(/\\s+/g,' ').slice(0, 30) : '空白'; })()`);
    await click(d, +x, +y);
    await sleep(750);
    return `✓ 點了 @${x},${y}（那裏是 ${what}）\n` + await look(d);
  },
  async seat(dev, n) {
    const d = need(dev), v = await ev(d, PAGE), s = v.seats.find(x => x.n === Number(n));
    if (!s) return `✗ 沒有 ${n} 號座位\n` + fmt(d, v);
    if (s.state !== 'ok') return `✗ ${n} 號座位點不到：${s.state === 'off' ? '在屏幕外' : s.state === 'covered' ? '被 ' + s.by + ' 擋住' : '看不見'} @${s.x},${s.y}\n` + fmt(d, v);
    await click(d, s.x, s.y);
    await sleep(750);
    return `✓ 點了 ${n} 號座位 @${s.x},${s.y}\n` + await look(d);
  },
  async hover(dev, x, y) { const d = need(dev); await mouse(d, 'mouseMoved', +x, +y); await sleep(500); return look(d); },
  async type(dev, ...text) { const d = need(dev); await d.S('Input.insertText', { text: text.join(' ') }); await sleep(200); return '✓ 輸入了：' + text.join(' '); },
  async key(dev, k) {
    const d = need(dev), code = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9 }[k];
    await d.S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, ...(k === 'Enter' && { text: '\r' }) });
    await d.S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
    await sleep(600);
    return `✓ 按了 ${k}\n` + await look(d);
  },
  async scroll(dev, dy, x, y) { const d = need(dev); await d.S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +(x ?? d.w / 2), y: +(y ?? d.h / 2), deltaX: 0, deltaY: +dy }); await sleep(500); return look(d); },
  shot: (dev, label = 'shot') => shoot(need(dev), label, false), // 測試員的截圖：當下這一幀
  // 下一次頁面打開文件選擇框時選這個文件（先 upload，再點「上傳劇本」）
  upload(dev, file) { const d = need(dev); if (!fs.existsSync(file)) throw new Error('文件不存在：' + file); d.file = path.resolve(file); return '✓ 下次打開文件選擇框時選 ' + d.file; },
  async text(dev, sel = 'body') { const d = need(dev); return ev(d, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (e.innerText || '').replace(/[ \\t]+/g, ' ').replace(/\\n{2,}/g, '\\n').trim().slice(0, 3500) : '找不到 ' + ${JSON.stringify(sel)}; })()`); },
  async resize(dev, w, h) { const d = need(dev); await size(d, +w, +h); await sleep(900); return look(d); },
  errors(dev) {
    const list = dev ? [need(dev)] : Object.values(devs);
    const out = list.flatMap(d => d.errors.splice(0).map(e => `${d.dev}：${e}`));
    return out.join('\n') || '沒有頁面錯誤';
  },
  // 每台設備一行：誰的屏幕上有要他做的事
  async who() {
    const out = [];
    for (const d of Object.values(devs)) {
      const v = await ev(d, PAGE).catch(e => ({ err: e.message }));
      if (v.err) { out.push(`${d.dev}：${v.err}`); continue; }
      const me = v.seats.find(s => s.flags.includes('mine'));
      const hud = v.regions.find(r => r.q === '.hud')?.t.slice(0, 40) || '';
      out.push(`${d.dev}${me ? `（${me.n}號${me.flags.includes('dead') ? '·死' : ''}）` : ''}${v.busy ? ' ⏳演出中' : ''}${v.turn ? ' ★輪到他：' + v.turn : ''}${v.vote ? ' ★有投票鍵' : ''}${v.modal ? ' ·有彈窗' : ''}${v.regions.some(r => r.q === '.toast') ? ' ·提示：' + v.regions.find(r => r.q === '.toast').t : ''}${hud ? ' ·面板：' + hud : ''}${d.errors.length ? ` ⚠${d.errors.length}條錯誤` : ''}`);
    }
    return out.join('\n');
  },
  async wait(ms) { await sleep(Math.min(Number(ms) || 1000, 70000)); return 'ok'; },
  serverlog() { const t = fs.readFileSync(path.join(dir, 'server.log'), 'utf8'); return t.split('\n').slice(-30).join('\n') || '（空）'; },
  close() { setTimeout(shutdown, 200); return '收攤了'; },

  // ───── 以下是給開發者的（測試員須知裏不給）─────
  // 擺局面：引擎造好房間 → 服務讀進內存（不重啓）→ 打開設備、寫好身份 → 截圖。參數見 preset.mjs，另外：
  //   phones=all|none|1,3（線上 / 多設備開哪幾台手機；默認：夜裏輪到的那個人，沒有就不開）  stsize=375x664  phonesize=844x390  shot=0（不截圖）
  async preset(...args) {
    const from = Date.now();
    const own = Object.fromEntries(args.map(a => [a.split('=')[0], a.slice(a.indexOf('=') + 1)]));
    const pass = args.filter(a => !['phones', 'stsize', 'phonesize', 'shot'].includes(a.split('=')[0]));
    for (const dev of Object.keys(devs)) await drop(dev); // 舊設備先斷開，舊房間沒人連著
    const out = await new Promise(res => execFile(process.execPath, [path.join(HERE, 'preset.mjs'), SNAP, DATA, ...pass], { cwd: project, maxBuffer: 1 << 22 },
      (err, so, se) => res(err && !so ? { error: (se || err.message).slice(0, 1500) } : JSON.parse(so))));
    if (out.error) return '✗ ' + out.error;
    await reloadRooms();
    const built = secs(from);
    const phones = own.phones === 'none' ? [] : own.phones === 'all' ? Object.keys(out.devices).filter(k => k !== 'st')
      : own.phones ? own.phones.split(',').map(x => 'p' + x.replace(/^p/, '')) : out.actor && out.devices['p' + out.actor] ? ['p' + out.actor] : [];
    const [sw, sh] = WH(own.stsize) || [], [pw, ph] = WH(own.phonesize) || [];
    await openAll([{ dev: 'st', w: sw, h: sh, ...out.devices.st }, ...phones.filter(p => out.devices[p]).map(p => ({ dev: p, w: pw, h: ph, ...out.devices[p] }))]);
    const lines = [`✓ 局面就緒（造局 ${built}，連設備一共 ${secs(from)}）　房間 ${out.code}　${out.script} · ${{ online: '線上', many: '線下多設備', one: '線下單設備' }[out.mode]}`,
      `停在：${out.phase === 'night' ? `第 ${out.night} 夜 ${out.step}` : out.phase === 'day' ? `第 ${out.day} 天` + (out.nomination ? `，${out.nomination}` : '') + (out.ruling ? `，等裁定（${out.ruling}）` : '') : out.phase === 'ended' ? `結束（${out.winner} 獲勝）` : out.phase}`,
      '座位：' + out.seats.join('　'), '設備：' + Object.keys(devs).join(' ')];
    if (own.shot !== '0') for (const d of Object.values(devs)) lines.push(`截圖 ${d.dev}：${await shoot(d, 'preset')}`);
    return lines.join('\n');
  },
  // 存檔：房間（服務先寫盤）+ 每台設備的身份、網址、尺寸。存在 botc-uitest/saves/<名字>，別的 rig 也能讀
  async save(n) {
    const to = saveDir(n);
    await flushServer();
    fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(path.join(to, 'rooms'), { recursive: true });
    for (const f of fs.existsSync(ROOMS) ? fs.readdirSync(ROOMS).filter(f => f.endsWith('.json')) : []) fs.copyFileSync(path.join(ROOMS, f), path.join(to, 'rooms', f));
    const list = [];
    for (const d of Object.values(devs)) list.push({ dev: d.dev, w: d.w, h: d.h, ...await storageOf(d) });
    fs.writeFileSync(path.join(to, 'save.json'), JSON.stringify({ savedAt: Date.now(), rig: name, devices: list }, null, 1));
    return `✓ 存好了：${n}（${fs.readdirSync(path.join(to, 'rooms')).length} 個房間，設備 ${list.map(x => x.dev).join(' ')}）→ ${to.replace(/\\/g, '/')}`;
  },
  async load(n, shot) {
    const from = Date.now(), at = saveDir(n);
    if (!fs.existsSync(path.join(at, 'save.json'))) return `✗ 沒有存檔 ${n}。有的：${CMD.saves()}`;
    const meta = JSON.parse(fs.readFileSync(path.join(at, 'save.json'), 'utf8')), delta = Date.now() - meta.savedAt;
    for (const dev of Object.keys(devs)) await drop(dev);
    fs.rmSync(ROOMS, { recursive: true, force: true });
    fs.mkdirSync(ROOMS, { recursive: true });
    for (const f of fs.readdirSync(path.join(at, 'rooms'))) {
      const r = shiftTimes(JSON.parse(fs.readFileSync(path.join(at, 'rooms', f), 'utf8')), meta.savedAt, delta);
      fs.writeFileSync(path.join(ROOMS, f), JSON.stringify(r));
    }
    await reloadRooms();
    await openAll(meta.devices);
    const lines = [`✓ 讀回了 ${n}（${secs(from)}）　設備：${Object.keys(devs).join(' ')}`];
    if (shot !== 'shot=0') for (const d of Object.values(devs)) lines.push(`截圖 ${d.dev}：${await shoot(d, 'load')}`);
    return lines.join('\n');
  },
  saves() {
    const list = fs.existsSync(SAVES) ? fs.readdirSync(SAVES).filter(f => fs.existsSync(path.join(SAVES, f, 'save.json'))) : [];
    return list.map(f => { const m = JSON.parse(fs.readFileSync(path.join(SAVES, f, 'save.json'), 'utf8')); return `${f}（${new Date(m.savedAt).toLocaleString('zh-CN')}，${m.devices.map(x => x.dev).join(' ')}）`; }).join('\n') || '（還沒有存檔）';
  },
  // 熱更新：把項目裏改過的文件同步進快照（不給文件就是 public、lib、server.js、package.json 下所有改過的；給了就只同步這幾個，別人改了一半的不帶進來）。
  // 動到 lib / server.js 就重啓服務（房間先寫盤，不丟）；然後刷新所有頁面
  async sync(...files) {
    if (codeDir) return '✗ 這台 rig 直接跑的是 ' + codeDir + '，沒有快照可同步';
    const from = Date.now();
    const list = files.length ? files.map(f => ({ rel: path.relative(root, path.resolve(root, f)), gone: !fs.existsSync(path.resolve(root, f)) }))
      : SNAP_PARTS.flatMap(p => diffTree(p, []));
    if (list.some(x => !SNAP_PARTS.some(p => x.rel === p || x.rel.startsWith(p + path.sep)))) return '✗ 只能同步 ' + SNAP_PARTS.join('、') + ' 下的文件';
    if (!list.length) return '快照和項目一樣，沒有要同步的';
    for (const x of list) {
      const to = path.join(SNAP, x.rel);
      if (x.gone) fs.rmSync(to, { force: true, recursive: true });
      else { fs.mkdirSync(path.dirname(to), { recursive: true }); copy(path.join(root, x.rel), to); }
    }
    const restart = list.some(x => !x.rel.startsWith('public'));
    if (restart) { await stopServer(); await startServer(); }
    await Promise.all(Object.values(devs).map(async d => { await d.S('Page.reload', { ignoreCache: true }); await sleep(600); await settle(d); }));
    return `✓ 同步了 ${list.length} 個文件${restart ? '，重啓了服務' : ''}，刷新了 ${Object.keys(devs).join(' ') || '（沒有設備）'}（${secs(from)}）：\n` + list.map(x => (x.gone ? '  刪 ' : '  ') + x.rel.replace(/\\/g, '/')).join('\n');
  },
  async restart() { const from = Date.now(); await stopServer(); await startServer(); return `✓ 服務重啓了（房間先寫了盤，${secs(from)}）`; },
  async reload(dev) {
    const list = dev ? [need(dev)] : Object.values(devs);
    await Promise.all(list.map(async d => { await d.S('Page.reload', { ignoreCache: true }); await sleep(600); await settle(d); }));
    return '✓ 刷新了 ' + list.map(d => d.dev).join(' ');
  },
  async fast(on = 'on') {
    fast = on !== 'off';
    for (const d of Object.values(devs)) await speed(d);
    return fast ? '✓ 加速：演出直接跳到結尾（頁面當作開了「減少動態效果」），其餘動畫 8 倍速。看動畫效果前 fast off' : '✓ 恢復正常速度';
  },
  // 在頁面裏跑一段 JS，返回結果（JSON）
  async eval(dev, ...js) { const v = await ev(need(dev), js.join(' ')); return typeof v === 'string' ? v : JSON.stringify(v, null, 1); },
  // 量元素：位置尺寸（頁面座標）+ 指定的計算樣式 / CSS 變量。例：measure st .center --hole-y top  （最多 10 個匹配）
  async measure(dev, sel, ...props) {
    const v = await ev(need(dev), `(() => { const out = []; for (const el of [...document.querySelectorAll(${JSON.stringify(sel)})].slice(0, 10)) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el), p = {};
      for (const k of ${JSON.stringify(props)}) p[k] = (k.startsWith('--') ? cs.getPropertyValue(k) : cs[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())])?.toString().trim();
      out.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), ...p });
    } return { viewport: innerWidth + 'x' + innerHeight, n: document.querySelectorAll(${JSON.stringify(sel)}).length, out }; })()`);
    return `${v.viewport}，匹配 ${v.n} 個${v.n > 10 ? '（列前 10 個）' : ''}\n` + v.out.map(o => JSON.stringify(o)).join('\n');
  },
  // 一次截幾種屏幕：說書人默認 電腦 1280x800、手機 375x664、橫屏 844x390；玩家手機默認 375x664、360x640、橫屏 844x390。截完回到原來的尺寸。
  // all：手機規矩裏要查的全套（iPhone Safari、矮屏、安卓、小屏、橫屏），說書人再加電腦
  async views(dev, ...sizes) {
    const d = need(dev), was = [d.w, d.h];
    const ALL = [[375, 664], [375, 553], [360, 640], [320, 568], [844, 390]];
    const list = sizes[0] === 'all' ? (dev === 'st' ? [[1280, 800], ...ALL] : ALL)
      : sizes.length ? sizes.map(WH).filter(Boolean) : dev === 'st' ? [[1280, 800], [375, 664], [844, 390]] : [[375, 664], [360, 640], [844, 390]];
    const out = [];
    for (const [w, h] of list) { await size(d, w, h); await sleep(1000); out.push(`${w}x${h}：${await shoot(d, `${w}x${h}`)}`); }
    await size(d, ...was);
    return out.join('\n');
  },
  // 讓別的瀏覽器（比如 Claude 的內置瀏覽器面板，preview_start {url}）變成這台設備。說書人：帶密鑰的網址直接打開就是；
  // 玩家手機：先在這個網站上跑一行 JS 寫好身份再進房（那邊連上以後，rig 裏這台會被頂掉——一個座位只認一台設備）。都順手關掉聲音
  async link(dev) {
    const d = need(dev), s = await storageOf(d), mute = { 'botc.sfx': JSON.stringify({ sfx: false, music: false }), 'botc.boot': '1', 'botc.intro': '1' };
    const room = /room=(\d+)/.exec(s.url)?.[1], key = room && s.ls['botc.st.' + room];
    const set = o => `Object.entries(${JSON.stringify(o)}).forEach(([k,v])=>localStorage.setItem(k,v))`;
    if (dev === 'st') {
      if (!key) return '✗ 這台說書人還沒在房間裏';
      const url = `http://localhost:${PORT}${s.url}&st=${key}`;
      return `網址（打開就是說書人）：${url}
關聲音（在那個頁面上跑一次，再刷新）：${set(mute)};location.reload()`;
    }
    const keep = Object.fromEntries(Object.entries(s.ls).filter(([k]) => /^botc\.(pid|name)$/.test(k))), url = `http://localhost:${PORT}${s.url}`;
    return `先打開 http://localhost:${PORT}/ ，在上面跑：
${set({ ...keep, ...mute })};location.href=${JSON.stringify(url)}
（之後 rig 裏的 ${dev} 會被頂掉：同一個座位只認一台設備）`;
  },
  devices() { return Object.values(devs).map(d => `${d.dev} ${d.w}x${d.h}`).join('\n') || '（沒有設備）'; },
  async drop(dev) { await drop(dev); return '✓ 收掉了 ' + dev; },
  status() { return `rig ${name}：${src ? '來源 ' + root.replace(/\\/g, '/') + '　' : ''}服務 http://localhost:${PORT}（${server ? '在跑' : '停了'}）控制 ${CTL}　代碼 ${SNAP.replace(/\\/g, '/')}　數據 ${DATA.replace(/\\/g, '/')}　加速 ${fast ? '開' : '關'}　設備 ${Object.keys(devs).join(' ') || '無'}`; },
};

let idle = null;
function shutdown() { try { chrome.kill(); } catch { /* 已經沒了 */ } stopServer().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); }
const poke = () => { clearTimeout(idle); idle = setTimeout(shutdown, 90 * 60 * 1000); }; // 一個半小時沒人用就自己收攤
http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  poke();
  try {
    const { cmd, args = [] } = JSON.parse(body);
    if (!Object.hasOwn(CMD, cmd)) throw new Error('沒有這個命令：' + cmd + '。可用：' + Object.keys(CMD).join(' '));
    res.end(String(await CMD[cmd](...args)));
  } catch (e) { res.end('✗ ' + (e?.message || e)); }
}).listen(CTL, async () => {
  poke();
  if (bootPreset.length) console.log(await CMD.preset(...bootPreset).catch(e => '✗ ' + e.message));
  console.log(`RIG READY ${name} 服務=${PORT} 控制=${CTL} 目錄=${dir.replace(/\\/g, '/')}（啓動 ${secs(t0)}）`);
});
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
