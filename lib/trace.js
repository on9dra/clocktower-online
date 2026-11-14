// 後台日誌：拿數據直接找出玩家碰到的問題和 bug。一天一個文件 data/logs/2026-11-14.jsonl（UTC 日期），留 30 天。
// 一行一個事件，k 是種類：
//   op     說書人的操作 / 玩家的行動：誰、做了什麼（參數裏的座位換成座位號，文字只留長度）、成沒成、被拒的原因、用了多少毫秒
//   err    服務器出錯：哪裏、錯誤和調用棧；操作出錯時把操作前的房間存一份快照（logs/crash/），tools/replay.mjs 拿它復現
//   join   建房、進房、重連：失敗的原因（房號不對、鏈接過期、密碼錯）
//   disc   斷線：原因（關頁面、網絡卡住 ping timeout……）、連了多久、走的是 websocket 還是輪詢
//   phase  換階段（入夜、天亮、結束）和上一個階段用了多久
//   step   夜裏的一步走完：哪個角色、每個狀態（等玩家選 / 說書人裁定 / 確認）各停了多久
//   cold   一局半小時沒人操作（多半散了）：停在哪一步
//   slow   操作太頻繁被限流
//   c      瀏覽器報上來的：前端報錯、文件載入失敗、開屏失敗、斷線多久、操作來回耗時、提示語、連點、卡頓、這次訪問走到哪
//   fb     意見反饋
//   up     服務器啓動（帶版本號，看錯誤是不是部署之後就沒了）
// 玩家標識只留 8 位摘要；不記 IP、聊天內容、名字、密碼。/admin 的「問題」頁和房間時間線讀這些（lib/issues.js）
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { offline, oneDevice } from './util.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'logs');
export const CRASH = path.join(DIR, 'crash');
export const KEEP_DAYS = 30;
const CRASH_PER_DAY = 30; // 同一個 bug 一晚上能觸發幾百次，快照留夠復現的就行
export const day = t => new Date(t).toISOString().slice(0, 10);
export const fileOf = d => path.join(DIR, d + '.jsonl');
export const tag = pid => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 8);

// 版本號：啓動時把服務端和前端的代碼摘要一下。錯誤記錄帶著它，看得出是哪一版的問題、部署之後還有沒有
export const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const add = dir => { try { for (const f of fs.readdirSync(dir).filter(f => /\.(js|css|html)$/.test(f)).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f))); } catch { /* 沒有這個目錄 */ } };
  try { h.update(fs.readFileSync(path.join(ROOT, 'server.js'))); } catch { /* 測試裏 */ }
  for (const d of ['lib', 'public', 'public/js', 'public/css']) add(path.join(ROOT, d));
  return h.digest('hex').slice(0, 7);
})();

// 寫盤：攢一秒寫一次；退出前 flushSync 寫完
let buf = [], timer = null;
export function log(rec) {
  rec.t ||= Date.now();
  buf.push(rec);
  if (!timer) timer = setTimeout(flush, 1000);
}
function group() {
  const by = new Map();
  for (const r of buf) { const d = day(r.t); by.set(d, (by.get(d) || '') + JSON.stringify(r) + '\n'); }
  buf = [];
  return by;
}
function flush() {
  timer = null;
  const by = group();
  fs.mkdir(DIR, { recursive: true }, () => {
    for (const [d, text] of by) fs.appendFile(fileOf(d), text, e => e && console.error('日誌寫盤出錯', e.message));
  });
}
export function flushSync() {
  clearTimeout(timer); timer = null;
  try { fs.mkdirSync(DIR, { recursive: true }); for (const [d, text] of group()) fs.appendFileSync(fileOf(d), text); } catch (e) { console.error('日誌寫盤出錯', e.message); }
}

// 房間現在在哪：房號、這個房號的第幾個房間（inst）、哪一局、哪個階段、線上還是線下
export const atOf = room => room.phase === 'night' ? 'night' + room.g.night : room.phase === 'day' || room.phase === 'dawn' ? room.phase + room.g.day : room.phase;
export const modeOf = room => oneDevice(room) ? 'one' : offline(room) ? 'multi' : 'on';
export function where(room) {
  if (!room) return {};
  return { r: room.code, i: room.inst, g: room.gameId ? room.gameId.slice(0, 6) : undefined, at: atOf(room), md: modeOf(room) };
}
// 誰：說書人 st、座位號、觀眾 w、還沒坐下的 -
export function who(room, d) {
  if (!d) return '-';
  if (d.st) return d.as ? 'st>' + seatNo(room, d.as) : 'st';
  const i = room.seats.findIndex(s => s.pid === d.pid);
  return i >= 0 ? i + 1 : d.watch ? 'w' : '-';
}
const seatNo = (room, id) => { const i = room.seats.findIndex(s => s.id === id); return i < 0 ? '?' : i + 1; };

// 操作參數：座位 id 換成「#座位號」（時間線上看得懂），文字只留長度，長的截斷
const SECRET = /^(text|pass|password|token|stKey|key|name|contact|note|notes|msg|title|desc|entries|author|label|reason)$/i;
export function clean(room, v, k = '', depth = 0, seats = new Map(room?.seats?.map((s, i) => [s.id, '#' + (i + 1)]) || [])) {
  if (v == null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v === 'string') return seats.get(v) || (SECRET.test(k) ? `‹${v.length}›` : v.length > 32 ? v.slice(0, 32) + '…' : v);
  if (SECRET.test(k)) return Array.isArray(v) ? `‹${v.length}項›` : '‹…›';
  if (depth > 2) return '…';
  if (Array.isArray(v)) { const a = v.slice(0, 12).map(x => clean(room, x, '', depth + 1, seats)); if (v.length > 12) a.push(`+${v.length - 12}`); return a; }
  if (typeof v === 'object') {
    const o = {};
    for (const [kk, x] of Object.entries(v).slice(0, 14)) if (kk !== 'op' && kk !== 'act') o[kk] = clean(room, x, kk, depth + 1, seats);
    return o;
  }
  return String(v).slice(0, 32);
}
function args(room, o) {
  const a = clean(room, o);
  if (!a || !Object.keys(a).length) return undefined;
  const s = JSON.stringify(a);
  return s.length > 400 ? s.slice(0, 400) + '…' : a;
}

// 一次操作：before 是操作前 where(room)（記的是在哪一步點的，不是點完到了哪），r 是返回值（字符串 = 被拒的原因）
export function op(room, { by, kind, o, before, r, ms, extra }) {
  const name = String((kind === 'st' ? o.op : o.act) || '?').slice(0, 24);
  log({ k: 'op', ...before, by, op: name, a: name === 'chat' ? undefined : args(room, o), ok: typeof r !== 'string', e: typeof r === 'string' ? r.slice(0, 80) : undefined, ms: Math.round(ms), ...extra });
}

// 操作前房間的樣子：出錯時落盤，拿去復現。聊天不要（和規則無關，也是別人的話）
export const freeze = room => { try { return JSON.stringify({ ...room, chat: [] }); } catch { return null; } };
let crashDay = '', crashN = 0;
function snapshot(meta, before) {
  const d = day(Date.now());
  if (d !== crashDay) { crashDay = d; crashN = 0; }
  if (!before || ++crashN > CRASH_PER_DAY) return undefined;
  const name = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${meta.r || 'x'}-${crypto.randomBytes(2).toString('hex')}.json`;
  try {
    fs.mkdirSync(CRASH, { recursive: true });
    fs.writeFileSync(path.join(CRASH, name), `{"meta":${JSON.stringify(meta)},"room":${before}}`);
    return name;
  } catch (e) { console.error('快照寫盤出錯', e.message); return undefined; }
}
// 服務器出錯：where 哪裏（op 說書人操作 / act 玩家行動 / view 推送狀態 / guard 計時器和統計 / uncaught / reject / save 存檔）
// ctx：{ room, before（操作前的快照）, o（原始操作，復現要用）, by, viewer }
const stackOf = e => String(e?.stack || e).split('\n').slice(0, 12).map(l => l.replace(ROOT, '').replace(/\\/g, '/')).join('\n').slice(0, 2000);
// 同一處、同一個房間的同一個錯誤 5 秒內只記一條（推送出錯會每個連接、每次推送都來一遍，快照名額也別讓一個 bug 用光），跳過幾條記在下一條的 rep 裏
const errSeen = new Map();
export function fail(whereAt, e, ctx = {}) {
  if (e && typeof e === 'object') { if (e.traced) return; try { e.traced = true; } catch { /* 凍結的對象 */ } }
  const at = where(ctx.room), msg = String(e?.message || e).slice(0, 300), key = `${whereAt}|${at.r || ''}|${msg}`, now = Date.now(), seen = errSeen.get(key);
  if (seen && now - seen.t < 5000) { seen.n++; return; }
  errSeen.set(key, { t: now, n: 0 });
  console.error(whereAt, ctx.room?.code || '', e);
  const o = ctx.o && typeof ctx.o === 'object' ? { ...ctx.o, ...(ctx.o.text != null && { text: '‹' + String(ctx.o.text).length + '›' }) } : undefined;
  const snap = ctx.before !== undefined || ctx.room ? snapshot({ t: now, r: at.r, where: whereAt, msg, stack: stackOf(e), o, by: ctx.by, viewer: ctx.viewer, build: BUILD }, ctx.before ?? freeze(ctx.room)) : undefined;
  log({ k: 'err', ...at, w: whereAt, msg, stack: stackOf(e), op: o ? String(o.op || o.act || '').slice(0, 24) || undefined : undefined, by: ctx.by, snap, build: BUILD, rep: seen?.n || undefined });
}

// 同一個連接 / 房間的限流一直撞，十秒記一條（帶這段時間撞了幾次），別把日誌刷爆
const slowSeen = new Map();
export function slow(key, rec) {
  const now = Date.now(), s = slowSeen.get(key);
  if (s && now - s.t < 10000) { s.n++; return; }
  log({ k: 'slow', ...rec, n: (s?.n || 0) + 1 });
  slowSeen.set(key, { t: now, n: 0 });
}
setInterval(() => { const old = Date.now() - 60000; for (const m of [slowSeen, errSeen]) for (const [k, s] of m) if (s.t < old) m.delete(k); }, 60000).unref();

// 階段和夜裏的每一步：每次推送時比一比，變了就記上一段用了多久。
// 重啓後第一次看到的那一步是從半路算起的，記成 partial（不進平均）
const seen = new Map();
const stepOf = (room, now, partial) => {
  const s = room.phase === 'night' && room.g?.step;
  if (!s || s.status === 'done') return null;
  return { id: s.id, role: s.roleId, seat: s.seatId ? seatNo(room, s.seatId) : undefined, status: s.status, t0: now, ts: now, d: {}, partial };
};
function endStep(room, cur, now, where0) {
  const s = cur.step;
  s.d[s.status] = (s.d[s.status] || 0) + now - s.ts;
  log({ k: 'step', ...where0, role: s.role, seat: s.seat, d: Object.fromEntries(Object.entries(s.d).map(([k, v]) => [k, Math.round(v)])), dur: now - s.t0, partial: s.partial || undefined });
  cur.step = null;
}
export function track(room) {
  const now = Date.now(), cur = seen.get(room.code), at = atOf(room);
  if (!cur || cur.inst !== room.inst) { seen.set(room.code, { inst: room.inst, at, atT: now, w: where(room), step: stepOf(room, now, true) }); return; }
  const s = room.phase === 'night' && room.g?.step, id = s && s.status !== 'done' ? s.id : null;
  if (cur.step && id && cur.step.id !== id && cur.step.role === s.roleId && cur.step.seat === (s.seatId ? seatNo(room, s.seatId) : undefined) && cur.w.at === atOf(room)) cur.step.id = id;
  if (cur.step && cur.step.id !== id) endStep(room, cur, now, cur.w);
  else if (cur.step && cur.step.status !== s.status) { cur.step.d[cur.step.status] = (cur.step.d[cur.step.status] || 0) + now - cur.step.ts; cur.step.status = s.status; cur.step.ts = now; }
  if (cur.at !== at) {
    log({ k: 'phase', ...where(room), from: cur.at, dur: now - cur.atT, win: room.phase === 'ended' ? room.winner || undefined : undefined, n: room.phase === 'night' && room.g.night === 1 ? room.seats.filter(x => x.role).length : undefined });
    cur.at = at; cur.atT = now;
  }
  cur.w = where(room);
  if (id && !cur.step) cur.step = stepOf(room, now, false);
}
export const untrack = code => seen.delete(code);

// 冷了的局（半小時沒人真操作，lib/stats.js cold）：記一次停在哪
export function coldCheck(rooms, isCold) {
  for (const room of rooms) {
    if (!isCold(room) || room.g.coldLogged) continue;
    room.g.coldLogged = true;
    const s = room.phase === 'night' && room.g.step;
    log({ k: 'cold', ...where(room), role: s ? s.roleId : undefined, status: s ? s.status : undefined, n: room.seats.filter(x => x.role).length,
      idle: Math.round((Date.now() - (room.actedAt || room.createdAt)) / 6e4) });
  }
}

// 瀏覽器：從 UA 認出應用（微信、QQ、各家手機瀏覽器）和系統版本。按這個分組，看得出「只在 iOS 微信裏出錯」
const APPS = [['MicroMessenger', '微信'], ['DingTalk', '釘釘'], ['Weibo', '微博'], ['baiduboxapp', '百度'], ['MQQBrowser', 'QQ瀏覽器'], ['QQBrowser', 'QQ瀏覽器'], [' QQ/', 'QQ'],
  ['UCBrowser', 'UC'], ['Quark', '夸克'], ['HuaweiBrowser', '華為瀏覽器'], ['HeyTapBrowser', 'OPPO瀏覽器'], ['VivoBrowser', 'vivo瀏覽器'], ['MiuiBrowser', '小米瀏覽器'],
  ['SamsungBrowser', '三星瀏覽器'], ['2345Explorer', '2345'], ['SogouMobileBrowser', '搜狗'], ['MetaSr', '搜狗'], ['360SE', '360'], ['Edg', 'Edge'], ['EdgA', 'Edge'], ['EdgiOS', 'Edge'], ['OPR', 'Opera'],
  ['FxiOS', 'Firefox'], ['Firefox', 'Firefox'], ['CriOS', 'Chrome'], ['Chrome', 'Chrome'], ['Version/', 'Safari']];
export function browser(ua = '') {
  const v = re => (ua.match(re) || [])[1];
  const os = /HarmonyOS|OpenHarmony|ArkWeb/i.test(ua) ? 'HarmonyOS' : /iPhone|iPad|iPod/.test(ua) ? 'iOS ' + (v(/OS (\d+)_/) || '') : /Android/.test(ua) ? 'Android ' + (v(/Android (\d+)/) || '')
    : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '其他';
  const app = APPS.find(([k]) => ua.includes(k));
  let br = app ? app[1] : '其他';
  // 主流瀏覽器帶大版本；套殼的（微信、QQ……）在安卓上帶內核版本，iOS 上內核就是系統的 WebKit
  if (br === 'Chrome' || br === 'Edge' || br === 'Firefox') br += ' ' + (v(/(?:Chrome|CriOS|Edg[AiOS]*|Firefox|FxiOS)\/(\d+)/) || '');
  else if (br === 'Safari') br += ' ' + (v(/Version\/(\d+)/) || '');
  else if (/Android|HarmonyOS/i.test(os) && v(/Chrome\/(\d+)/)) br += ' · 內核' + v(/Chrome\/(\d+)/);
  return { br: br.trim(), os: os.trim() };
}

// 瀏覽器報上來的一批事件（public/js/diag.js）：只收認得的種類和字段，字符串截短；時間按服務器的鐘換算（手機的鐘可能不準）
const EV = new Set(['err', 'fx', 'res', 'boot', 'fail', 'net', 'rtt', 'toast', 'rage', 'jank', 'end', 'wake']);
const LEN = { msg: 300, stack: 2000, src: 160, url: 160, sel: 120, text: 120, ua: 220, why: 60, op: 24, at: 16, md: 8, tr: 12, net: 12, lang: 6, place: 16, kind: 16, r: 4, slow: 300, how: 8, err: 30 };
const NUM = new Set(['ms', 'n', 'max', 'sum', 'to', 'off', 'cnt', 'w', 'h', 'dpr', 'touch', 'pwa', 'mem', 'cpu', 'nav', 'dcl', 'css', 'ready', 'out', 'gate', 'go', 'conn', 'dur', 'vis', 'st', 'seat', 'room', 'game', 'done', 'dis', 'quiet', 'tries', 'final', 'res', 'slip', 'intro', 'bg', 'wl']);
const PIDRE = /^(?!(?:__proto__|constructor|prototype)$)[\w-]{1,64}$/;
export const CLIENT_PER_DAY = 20000;
let clientDay = '', clientN = 0;
export function ingest(text, ua, now = Date.now()) {
  let b;
  try { b = JSON.parse(text); } catch { return '格式不對'; }
  if (!b || typeof b !== 'object' || !Array.isArray(b.ev) || typeof b.sid !== 'string' || !/^[\w-]{6,32}$/.test(b.sid)) return '格式不對';
  const base = { k: 'c', sid: b.sid, u: typeof b.pid === 'string' && PIDRE.test(b.pid) ? tag(b.pid) : undefined, ...browser(ua) };
  const skew = Number.isFinite(b.now) ? now - b.now : 0;
  let n = 0;
  if (day(now) !== clientDay) { clientDay = day(now); clientN = 0; }
  for (const e of b.ev.slice(0, 40)) {
    if (!e || typeof e !== 'object' || !EV.has(e.e)) continue;
    if (++clientN > CLIENT_PER_DAY) break; // 有人拿接口刷：一天收夠了就不收，撐不滿磁盤（正常一天幾千條）
    const rec = { ...base, t: Math.min(now, Math.max(now - 86400e3, Number.isFinite(e.t) ? Math.round(e.t + skew) : now)), e: e.e };
    for (const [k, v] of Object.entries(e)) {
      if (k === 'e' || k === 't') continue;
      if (NUM.has(k) && typeof v === 'number' && Number.isFinite(v)) rec[k] = Math.round(v * 100) / 100;
      else if (NUM.has(k) && typeof v === 'boolean') rec[k] = v ? 1 : 0;
      else if (LEN[k] && typeof v === 'string') rec[k] = v.slice(0, LEN[k]);
      else if (k === 'hist' && Array.isArray(v)) rec.hist = v.slice(0, 9).map(x => (Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0));
    }
    if (rec.r && !/^\d{4}$/.test(rec.r)) delete rec.r;
    if (rec.e === 'boot' || rec.e === 'fail') rec.ua = String(ua).slice(0, 220); // 完整 UA 一次訪問只留一份（打開時那條）
    else delete rec.ua;
    log(rec);
    n++;
  }
  return n;
}

// 刪掉 30 天前的日誌和快照
export function prune(now = Date.now()) {
  const old = day(now - KEEP_DAYS * 86400e3);
  try { for (const f of fs.readdirSync(DIR)) if (/^\d{4}-\d\d-\d\d\.jsonl$/.test(f) && f.slice(0, 10) < old) fs.rmSync(path.join(DIR, f)); } catch { /* 還沒有 */ }
  const cut = old.replace(/-/g, '');
  try { for (const f of fs.readdirSync(CRASH)) if (f.slice(0, 8) < cut) fs.rmSync(path.join(CRASH, f)); } catch { /* 還沒有 */ }
}
