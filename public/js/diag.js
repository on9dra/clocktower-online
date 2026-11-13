// 診斷上報：玩家碰到的問題報給服務器（POST /api/diag → lib/trace.js），後台 /admin「問題」頁和房間時間線上看。
// 報：前端報錯、演出出錯、文件沒載入、開屏多久能用、斷線多久回來、操作來回耗時、彈出的提示、連點、卡頓、這次訪問走到哪。
// 不報：聊天、名字、輸入的內容。攢一批再發（出錯的兩秒內發），切後台、關頁面時用 sendBeacon 發掉。
// 沒調 start() 的頁面（演示頁）只收不發
const URL_ = '/api/diag';
const ORIGIN = location.origin;
// 這次訪問的標識：開屏的守門（index.html）先起好，打不開時它自己報；連服務器時也帶上（server.js 把斷線、進房和這裏連起來）
export const sid = window.bootSid || (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 14);
let on = false, ctxOf = () => ({}), pidOf = () => null, timer = null;
const q = [];
const T = {}; // 開屏各個時刻（performance.now）

// 一條事件：帶上當時在哪（房號、第幾夜、說書人還是幾號）
export function note(e, data = {}) {
  if (q.length >= 80) return; // 沒開始發（演示頁）或者發不出去：別一直攢
  let c = {};
  try { c = ctxOf() || {}; } catch { /* 狀態還沒好 */ }
  if (c.r) seenRoom = true;
  if (/^(night|day|dawn)/.test(c.at || '')) seenGame = true;
  if (c.at === 'ended') seenEnd = true;
  q.push({ e, t: Date.now(), ...c, ...data });
  if (on && (e === 'err' || e === 'fx' || e === 'fail')) soon(2000);
  else if (on && q.length >= 20) soon(500);
}
const soon = ms => { if (!timer) timer = setTimeout(flush, ms); };
const strip = s => String(s || '').split(ORIGIN).join('').slice(0, 1500);

// 前端報錯：同一個錯誤一次訪問只報三次
const seen = new Map();
export function report(e, kind = 'err', src = '') {
  const msg = String(e?.message || e || '').slice(0, 300), sig = kind + msg + src, n = (seen.get(sig) || 0) + 1;
  seen.set(sig, n);
  if (n <= 3) note(kind, { msg, src, stack: strip(e?.stack) });
}
addEventListener('error', ev => {
  const t = ev.target;
  if (t && t !== window && t.tagName) { // 圖片、腳本、樣式表、音頻沒下下來
    const url = t.currentSrc || t.src || t.href || '';
    if (url.startsWith(ORIGIN)) note('res', { url: strip(url).slice(0, 160), kind: t.tagName.toLowerCase() });
    return;
  }
  if (!ev.filename || !ev.filename.startsWith(ORIGIN)) return; // 瀏覽器插件、別家的腳本
  report(ev.error || ev.message, 'err', strip(ev.filename) + ':' + ev.lineno + ':' + ev.colno);
}, true);
addEventListener('unhandledrejection', ev => {
  const r = ev.reason;
  if (r instanceof Error && r.stack && !r.stack.includes(ORIGIN)) return;
  report(r, 'err');
});
// 自己下載的文件沒下下來（音效用 fetch，不走上面的 error 事件）
export const missing = (url, why) => note('res', { url: String(url).slice(0, 160), why: String(why || '').slice(0, 60) });

// 彈出的提示：同一句三秒內只記一次
let lastToast = '', lastToastAt = 0;
export function toastSeen(text) {
  const now = Date.now();
  if (text === lastToast && now - lastToastAt < 3000) return;
  lastToast = text; lastToastAt = now;
  note('toast', { text: String(text).slice(0, 120) });
}

// 連點：700 毫秒內在差不多同一處點了三下以上，多半是「點了沒反應」。輸入框裏的不算
let taps = [], rage = null;
const describe = t => {
  const el = t.closest?.('button,a,[role=button],input,select,label,[data-key]') || t;
  const cls = [...(el.classList || [])].filter(c => !/^is-/.test(c)).slice(0, 3).join('.');
  const key = el.getAttribute?.('data-key');
  // 只給按鈕帶上字（界面上的字）；座位、聊天裏的是玩家的名字和話，不帶
  const btn = el.matches?.('button,a,[role=button],label') && !el.closest('.seat,.chat,[data-scroll]');
  const txt = btn ? (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16) : '';
  return ((el.tagName || '').toLowerCase() + (cls ? '.' + cls : '') + (key && !/^[0-9a-f]{6,}$/.test(key) ? `[${key}]` : '') + (txt ? ` "${txt}"` : '')).slice(0, 120);
};
addEventListener('pointerdown', e => {
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  const now = performance.now();
  taps = taps.filter(p => now - p.t < 700 && Math.hypot(p.x - e.clientX, p.y - e.clientY) < 30);
  taps.push({ t: now, x: e.clientX, y: e.clientY });
  if (rage) { rage.cnt = Math.max(rage.cnt, taps.length); return; }
  if (taps.length < 3) return;
  const el = e.target.closest?.('button,a,[role=button]') || e.target;
  rage = { sel: describe(e.target), cnt: taps.length, dis: !!(el.disabled || el.getAttribute?.('aria-disabled') === 'true' || el.classList?.contains('off') || el.classList?.contains('disabled')) };
  setTimeout(() => { note('rage', rage); rage = null; taps = []; }, 900);
}, true);

// 卡頓：開屏之後主線程一次卡住 200 毫秒以上（只有 Chrome 系的瀏覽器報得出來）
let jank = { n: 0, max: 0 };
try {
  new PerformanceObserver(list => {
    if (!T.out) return; // 開屏時解析腳本、解碼圖片本來就卡
    for (const x of list.getEntries()) if (x.duration >= 200) { jank.n++; jank.max = Math.max(jank.max, Math.round(x.duration)); }
  }).observe({ type: 'longtask', buffered: false });
} catch { /* 不支持 */ }

// 操作來回耗時：按 lib/issues.js 的分桶攢著，每次發的時候帶一份
const EDGES = [50, 100, 200, 400, 800, 1600, 3200, 6400];
let hist = Array(EDGES.length + 1).fill(0), rttN = 0, timeouts = 0, slowOps = [];
function rtt(name, ms, timedOut) {
  rttN++;
  if (timedOut) { timeouts++; slowOps.push(name + ':超時'); return; }
  const i = EDGES.findIndex(x => ms <= x);
  hist[i < 0 ? EDGES.length : i]++;
  if (ms > 2000) slowOps.push(name + ':' + Math.round(ms));
}

// 盯著連接：哪些請求計時、斷線多久回來、一直連不上
const TIMED = new Set(['st:op', 'pl:act', 'st:peek', 'dbg:as', 'st:create', 'st:join', 'pl:join', 'pl:claim', 'feedback']);
let downAt = null, downWhy = '', tries = 0, everUp = false;
export function watchSocket(sock) {
  const emit = sock.emit.bind(sock);
  sock.emit = (ev, ...args) => {
    const cb = args[args.length - 1];
    if (typeof cb !== 'function' || !TIMED.has(ev)) return emit(ev, ...args);
    const t0 = performance.now(), timed = sock.flags?.timeout !== undefined, name = String(args[0]?.op || args[0]?.act || ev).slice(0, 24);
    args[args.length - 1] = function (...r) { rtt(name, performance.now() - t0, timed && r[0] instanceof Error); return cb.apply(this, r); };
    return emit(ev, ...args);
  };
  sock.on('connect', () => {
    if (!everUp) { everUp = true; T.conn = performance.now(); T.tr = sock.io?.engine?.transport?.name; }
    if (downAt != null) {
      note('net', { why: downWhy, off: Math.round(performance.now() - downAt), slip: !!document.querySelector('.net-off') });
      downAt = null;
    }
  });
  sock.on('disconnect', why => { if (why !== 'io client disconnect' && downAt == null) { downAt = performance.now(); downWhy = why; } });
  sock.on('connect_error', e => {
    tries++;
    if (!everUp && tries === 3) note('net', { why: 'connect_error ' + String(e?.message || '').slice(0, 40), off: Math.round(performance.now()), tries });
  });
}

// 開屏：從打開到能用要多久、要不要點「點擊進入」、連上服務器用了多久、設備什麼樣。開屏揭開後（最多等 20 秒）報一次
let bootSent = false;
function sendBoot() {
  if (bootSent) return;
  bootSent = true;
  const nav = performance.getEntriesByType?.('navigation')?.[0], b = window.bootT || {}, c = navigator.connection;
  note('boot', {
    nav: nav ? Math.round(nav.responseStart) : undefined, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : undefined,
    css: T.css, ready: T.ready, out: T.out, conn: T.conn, tr: T.tr, gate: b.gate, go: b.go, quiet: document.documentElement.dataset.boot === 'quiet' || undefined,
    w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0, pwa: matchMedia('(display-mode: standalone)').matches,
    lang: document.documentElement.dataset.lang, net: c?.effectiveType, mem: navigator.deviceMemory, cpu: navigator.hardwareConcurrency,
  });
}

// 這次訪問走到哪：進過房間、開過局、看到結局（關頁面時報）
let seenRoom = false, seenGame = false, seenEnd = false, visible = 0, visAt = document.hidden ? null : performance.now();
const visMs = () => visible + (visAt != null ? performance.now() - visAt : 0);

function flush(beacon) {
  clearTimeout(timer); timer = null;
  if (!on) return;
  if (rttN) { note('rtt', { n: rttN, hist, to: timeouts || undefined, slow: slowOps.slice(0, 8).join(' ') || undefined }); hist = Array(EDGES.length + 1).fill(0); rttN = timeouts = 0; slowOps = []; }
  if (jank.n) { note('jank', jank); jank = { n: 0, max: 0 }; }
  if (!q.length) return;
  // 一批別超過服務器收的大小（24KB）
  const ev = [];
  let size = 0;
  while (q.length && (size += JSON.stringify(q[0]).length) < 18000) ev.push(q.shift());
  if (!ev.length) ev.push(q.shift());
  const body = JSON.stringify({ sid, pid: pidOf(), now: Date.now(), ev });
  let sent = false;
  if (beacon && navigator.sendBeacon) { try { sent = navigator.sendBeacon(URL_, new Blob([body], { type: 'text/plain' })); } catch { /* 太大、不支持 */ } }
  if (!sent) fetch(URL_, { method: 'POST', body, keepalive: body.length < 60000, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  if (q.length) soon(beacon ? 0 : 3000);
}

// app.js 調：ctx() 給出當下在哪，pid() 本機玩家標識（服務器只存摘要）
export function start({ ctx, pid }) {
  if (on) return;
  on = true; ctxOf = ctx; pidOf = pid;
  T.css = Math.round(performance.now()); // app.js 等樣式表到齊才開始
  const boot = window.boot;
  if (boot?.ready) { const ready = boot.ready; boot.ready = function (...a) { T.ready ??= Math.round(performance.now()); return ready.apply(this, a); }; }
  boot?.out?.then(() => { T.out = Math.round(performance.now()); setTimeout(sendBoot, 1500); });
  setTimeout(sendBoot, 20000); // 開屏一直沒揭開：照樣報，慢在哪看得出
  setInterval(flush, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (visAt != null) { visible += performance.now() - visAt; visAt = null; } sendBoot(); flush(true); }
    else visAt = performance.now();
  });
  addEventListener('pagehide', () => {
    sendBoot();
    note('end', { final: 1, dur: Math.round(performance.now()), vis: Math.round(visMs()), room: seenRoom, game: seenGame, done: seenEnd });
    flush(true);
  });
  if (q.length) soon(2000); // 開始前就出的錯
}
