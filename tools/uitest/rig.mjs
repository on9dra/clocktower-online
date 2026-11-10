// 真實界面試玩台：一個測試員一套——自己的服務（代碼快照）、自己的無頭 Chrome（靜音）、多台「設備」（各自獨立的瀏覽器上下文 = 各自的 localStorage / 身份）。
// 所有操作都是真的鼠標事件打在頁面上，點之前做命中測試（按鈕在屏幕外、被別的東西擋住就不點，報出來——這本身就是要找的問題）。
// 啓動：node tools/uitest/rig.mjs <名字> <基準端口> [代碼目錄]     服務 = 基準端口，Chrome 調試 = +1，控制 = +2
//       不給代碼目錄就把當前項目（public、lib、server.js）複製一份快照來跑：別的會話這時候改代碼，這一局不受影響
// 操作：node tools/uitest/ui.mjs <控制端口> <命令> ...（見 ui.mjs 開頭）。給測試員（子代理）的說明在 README.md
// 運行時的東西（快照、房間數據、瀏覽器資料、截圖）都在系統臨時目錄的 botc-uitest/ 下，不進項目
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const [name = 'rig', base = '3310', codeDir] = process.argv.slice(2);
const PORT = Number(base), DBG = PORT + 1, CTL = PORT + 2;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), dir = path.join(os.tmpdir(), 'botc-uitest', 'run-' + name);
// 上一次的快照裏有一個指向項目 node_modules 的目錄聯接：先只摘掉這個聯接本身，再清目錄，絕不順著它刪進項目裏
const link = path.join(dir, 'snap', 'node_modules');
try { fs.rmdirSync(link); } catch { try { fs.unlinkSync(link); } catch { /* 沒有上一次 */ } }
if (fs.existsSync(link)) { console.log('清不掉上一次的 node_modules 聯接，先手動刪掉：' + link); process.exit(1); }
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
// 快照：靜態文件是服務現讀現發的，直接跑項目目錄的話，別人中途改一個文件這一局就前後不一致
let SNAP = codeDir;
if (!SNAP) {
  SNAP = path.join(dir, 'snap');
  // 自己遞歸複製：Node 22 的 fs.cpSync 在 Windows 上遇到帶中文的路徑會直接崩掉（進程退出碼 0xC0000409，沒有任何報錯）
  const copy = (from, to) => {
    if (!fs.statSync(from).isDirectory()) return fs.copyFileSync(from, to);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) copy(path.join(from, f), path.join(to, f));
  };
  fs.mkdirSync(SNAP, { recursive: true });
  for (const f of ['public', 'lib', 'server.js', 'package.json']) copy(path.join(root, f), path.join(SNAP, f));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(SNAP, 'node_modules'), 'junction'); // Windows 上不用管理員權限
}
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(f => fs.existsSync(f));
if (!CHROME) { console.log('找不到 Chrome：用環境變量 CHROME 指定路徑'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───── 服務 ─────
const slog = fs.createWriteStream(path.join(dir, 'server.log'));
const server = spawn(process.execPath, ['server.js'], { cwd: SNAP, env: { ...process.env, PORT: String(PORT), RATE_LIMIT: '0', DATA_DIR: path.join(dir, 'data') } });
server.stdout.pipe(slog); server.stderr.pipe(slog);

// ───── Chrome ─────
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${path.join(dir, 'chrome')}`, '--no-proxy-server', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 80 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); } catch { /* 還沒起來 */ } }
if (!ver) { console.log('Chrome 沒起來'); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let seq = 0;
const pending = new Map(), devs = {}, bySession = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  const d = bySession.get(m.sessionId);
  if (!d) return;
  const p = m.params || {};
  if (m.method === 'Runtime.exceptionThrown') d.errors.push('異常：' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 400));
  else if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') d.errors.push('console.error：' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  else if (m.method === 'Log.entryAdded' && p.entry?.level === 'error' && !/ERR_CONNECTION|favicon/.test(p.entry.text + p.entry.url)) d.errors.push('日誌：' + `${p.entry.text} ${p.entry.url || ''}`.slice(0, 300));
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
  const d = devs[dev] = { dev, sessionId, errors: [], file: null, note: null, w, h };
  bySession.set(sessionId, d);
  d.S = (m, p) => send(m, p, sessionId);
  for (const m of ['Page.enable', 'Runtime.enable', 'Log.enable', 'DOM.enable']) await d.S(m);
  await size(d, w, h);
  await d.S('Emulation.setFocusEmulationEnabled', { enabled: true });
  // 開場的加載動畫和首次介紹不是這次要測的：當作來過的人
  await d.S('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('botc.boot','1');localStorage.setItem('botc.intro','1')}catch(e){}" });
  await d.S('Page.setInterceptFileChooserDialog', { enabled: true });
  return d;
}
async function size(d, w, h) {
  const mobile = w < 900;
  Object.assign(d, { w, h });
  await d.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await d.S('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
}
const ev = async (d, expression) => {
  const r = await d.S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('頁面腳本出錯：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const mouse = (d, type, x, y) => d.S('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
async function click(d, x, y) { await mouse(d, 'mouseMoved', x, y); await sleep(60); await mouse(d, 'mousePressed', x, y); await sleep(40); await mouse(d, 'mouseReleased', x, y); }

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

let shotN = 0;
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
    // 開場的加載畫面長短不一（第一次要拉素材）：等到屏幕上有能點的東西再交還，最多等 20 秒
    for (let i = 0; i < 23; i++) { const v = await ev(d, PAGE).catch(() => null); if (v?.items.some(x => x.state === 'ok')) break; await sleep(800); }
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
  async shot(dev, label = 'shot') {
    const d = need(dev), file = path.join(dir, 'shots', `${String(++shotN).padStart(3, '0')}-${dev}-${String(label).replace(/[^\w\u4e00-\u9fff-]/g, '_')}.png`);
    const r = await d.S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file.replace(/\\/g, '/');
  },
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
};

function shutdown() { try { chrome.kill(); } catch { /* 已經沒了 */ } try { server.kill(); } catch { /* 已經沒了 */ } process.exit(0); }
http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  try {
    const { cmd, args = [] } = JSON.parse(body);
    if (!CMD[cmd]) throw new Error('沒有這個命令：' + cmd + '。可用：' + Object.keys(CMD).join(' '));
    res.end(String(await CMD[cmd](...args)));
  } catch (e) { res.end('✗ ' + (e?.message || e)); }
}).listen(CTL, () => console.log(`RIG READY ${name} 服務=${PORT} 控制=${CTL} 目錄=${dir.replace(/\\/g, '/')}`));
setTimeout(shutdown, 150 * 60 * 1000);
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
