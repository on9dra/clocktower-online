// 運營統計：每 5 分鐘記一次在線人數，每局記開局、結束（或中止）、人數、劇本、勝負。
// 按月一個文件，寫在 data/stats/ 下：samples-2026-11.jsonl、games-2026-11.jsonl。只給 /admin 看
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SCRIPTS } from '../public/js/roles.js';
import { offline, oneDevice, isBot } from './util.js';

const DIR = path.join(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'stats');
export const SAMPLE_EVERY = 5 * 60 * 1000;
const month = t => new Date(t).toISOString().slice(0, 7);
const file = (kind, t) => path.join(DIR, `${kind}-${month(t)}.jsonl`);
// 玩家標識不原樣落盤：只留 8 位摘要，夠數「多少個不同的人」
const tag = pid => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 8);

// 說書人是哪台設備、從哪個網絡連上來的：用來看出哪些局是同一夥人開的（單設備的線下局裏玩家沒有標識，只能靠說書人）。
// 設備標識和玩家一樣只留摘要；網絡地址加鹽再摘要（鹽每台服務器自己生成，在 data/stats/salt），IP 本身不落盤、也推不回去。
// 記在房間上：說書人換了網絡（WiFi 換流量）就多一個，最多留 6 個
let salt;
function netTag(ip) {
  if (!salt) {
    const f = path.join(DIR, 'salt');
    try { salt = fs.readFileSync(f, 'utf8'); } catch { /* 第一次 */ }
    if (!salt) { salt = crypto.randomBytes(16).toString('hex'); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, salt, { mode: 0o600 }); }
  }
  return tag(salt + '|' + ip);
}
export function host(room, pid, ip) {
  const h = room.host ||= { nets: [] };
  if (pid) h.dev = tag(pid);
  const n = ip && netTag(ip);
  if (n && !h.nets.includes(n)) { h.nets.push(n); if (h.nets.length > 6) h.nets.shift(); }
}

function append(kind, rec) {
  fs.mkdir(DIR, { recursive: true }, () => fs.appendFile(file(kind, rec.t), JSON.stringify(rec) + '\n', e => e && console.error('統計寫盤出錯', e)));
}

// 一個房間裏真人在線的情況：說書人、在座玩家、觀眾（同一個人開幾個標籤頁算一個）
export function presence(room, socks) {
  const list = socks.filter(s => s.data.code === room.code);
  const pids = new Set(list.map(s => s.data.pid));
  return {
    st: list.some(s => s.data.st) ? 1 : 0,
    on: room.seats.filter(x => pids.has(x.pid)).length,
    watch: new Set(list.filter(s => s.data.watch).map(s => s.data.pid)).size,
  };
}
const playing = room => !!room.gameId && room.phase !== 'lobby';
// 模式：線上 on / 線下多設備 multi / 線下單設備 one；大廳裏還沒選的是 null
export const mode = room => !room.settings?.chosen && room.phase === 'lobby' && !room.seats.length ? null : oneDevice(room) ? 'one' : offline(room) ? 'multi' : 'on';
// 線下的局，坐在桌邊卻沒連上的人（單設備的全部玩家、多設備裏手機熄屏的）也是在玩的人。
// 30 分鐘沒人操作的線下局多半散了，不算；說書人頁面還開着也一樣（單設備局最常這樣掛着）
// 最後一次真有人操作的時間：進房、重連不算（說書人頁面斷線重連會刷新 updatedAt）
const actedAt = room => room.actedAt || room.createdAt || 0;
export const AWAY_IDLE = 30 * 6e4;
// 冷了：開着局、半小時沒人真操作。說書人頁面還開着（斷線重連刷新 updatedAt）也算冷，不算在玩
export const cold = room => playing(room) && room.phase !== 'ended' && Date.now() - actedAt(room) >= AWAY_IDLE;
// 「上次動靜」：局裏看真操作；大廳裏進房、坐下也算動靜
export const lastSeen = room => playing(room) ? Math.max(actedAt(room), room.g.statAt || 0) : room.updatedAt || room.createdAt;
export const away = (room, p) => playing(room) && room.phase !== 'ended' && offline(room) && !cold(room)
  ? Math.max(0, room.seats.filter(s => s.role && !isBot(s)).length - p.on) : 0;

// 正在進行的對局：房號 -> 記錄。重啓後由房間存檔裏的 g.statAt 接上
const open = new Map();

function close(rec, end, winner) {
  end = Math.max(rec.t, end || Date.now());
  open.delete(rec.code);
  append('games', { t: rec.t, end, mins: Math.round((end - rec.t) / 6e4), n: rec.n, script: rec.script, mode: rec.mode, winner: winner || null, who: rec.who, dev: rec.dev, net: rec.net, r: rec.code, i: rec.inst }); // r、i：/admin 點進這局的時間線
}

// 每次推送狀態時調用：開局、終局、半路回大廳都在這裏看出來。
// 沒打完的局（回大廳、換局、房間被清掉）時長只算到這局最後一次有人操作，不把棄置後空掛的時間算進去
export function observe(room) {
  const cur = open.get(room.code);
  if (cur && (cur.inst !== room.inst || cur.gameId !== room.gameId || !playing(room))) close(cur, cur.last, null);
  if (!playing(room) || room.g.statDone) return;
  room.g.statAt ||= Date.now();
  let rec = open.get(room.code);
  if (!rec) {
    const id = room.scriptId;
    open.set(room.code, rec = { code: room.code, inst: room.inst, gameId: room.gameId, t: room.g.statAt,
      script: id === 'custom' ? room.script?.name || '自定義' : SCRIPTS[id]?.name || id });
  }
  const seated = room.seats.filter(s => s.role && !isBot(s)); // 機器人不算玩家
  rec.mode = mode(room);
  rec.last = Math.max(actedAt(room), rec.t);
  rec.n = seated.length;
  rec.who = seated.filter(s => !s.local).map(s => tag(s.pid)); // 線下座位每局一個新標識，認不出是誰，不算進「不同玩家」
  rec.dev = room.host?.dev;
  rec.net = room.host?.nets.length ? [...room.host.nets] : undefined;
  if (room.phase === 'ended') { room.g.statDone = true; close(rec, Date.now(), room.winner); }
}

// 說書人撤回了遊戲結束：t 是那局開局的時刻（g.statAt）。記一行作廢標記，讀的時候把前面那條結束記錄去掉；
// 局面退回去以後 g.statDone 也退回了 false，下一次推送重新開始記這一局，真正打完再記一條
export function unend(t) {
  if (t) append('games', { t, undo: true, at: Date.now() });
}

// 訪問：每打開一次首頁記一筆。訪客 = IP + 瀏覽器的摘要；同一個訪客 30 分鐘內刷新、重開不重記。爬蟲、預覽、curl 不算
const VISIT_GAP = 30 * 6e4, seen = new Map();
export function visit(ip, ua) {
  if (!/Mozilla/.test(ua) || /bot|spider|crawl|preview|headless|lighthouse/i.test(ua)) return;
  const v = tag(ip + '|' + ua), t = Date.now(), last = seen.get(v);
  seen.set(v, t);
  if (!last || t - last >= VISIT_GAP) append('visits', { t, v });
}

// 留存：每台設備（瀏覽器裏的隨機標識，只留摘要）走到了哪一步——打開頁面 open、建房 create、進別人的房 join 各記一筆，
// 寫在 steps-YYYY-MM.jsonl；同一台設備同一件事 30 分鐘內不重記（斷線重連不算又來一次）。開沒開局、打沒打完看 games 裏的 dev / who
const did = new Map();
export function step(pid, k) {
  if (!pid) return;
  const d = tag(pid), key = d + k, t = Date.now(), last = did.get(key);
  did.set(key, t);
  if (!last || t - last >= VISIT_GAP) append('steps', { t, d, k });
}

// 定時調用：記一個在線人數的點；順便收掉已經被解散的房間裏沒結束的局
export function sample(rooms, socks, get) {
  let people = 0, inGame = 0, live = 0, games = 0, off = 0;
  for (const r of rooms) {
    const p = presence(r, socks), n = p.st + p.on + p.watch;
    people += n;
    off += away(r, p);
    if (n) live++;
    if (playing(r) && r.phase !== 'ended' && !cold(r)) { games++; inGame += n; } // 冷掉的局開着頁面的人算在線，不算在玩
  }
  const lobby = socks.filter(s => !s.data.code).length;
  // people / inGame 只數連着的；off 是線下桌邊沒連上的玩家，圖上加進在線和遊戲中
  append('samples', { t: Date.now(), people: people + lobby, inGame, live, games, off });
  for (const m of [seen, did]) for (const [v, t] of m) if (Date.now() - t >= VISIT_GAP) m.delete(v);
  for (const rec of [...open.values()]) {
    const r = get(rec.code);
    if (!r || r.inst !== rec.inst) close(rec, rec.last, null);
  }
}

// 還沒結束的局（給 /admin 列在最上面）
export const running = () => [...open.values()].map(({ t, n, script, mode, last, who, dev, net }) => ({ t, n, script, mode, last, who, dev, net }));

// 舊記錄（2026-11-10 前）只有 manual：記成線下，分不出幾台設備
const upgrade = x => x.mode || !('manual' in x) ? x : (({ manual, ...y }) => ({ ...y, mode: manual ? 'off' : 'on' }))(x);

// 讀最近 days 天的記錄
export function read(kind, days) {
  const from = Date.now() - days * 86400e3, out = [];
  for (let t = from; ; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) {
    let text = '';
    try { text = fs.readFileSync(file(kind, t), 'utf8'); } catch { /* 這個月沒有 */ }
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const x = JSON.parse(line);
        if (x.undo) { const i = out.findLastIndex(o => o.t === x.t); if (i > -1) out.splice(i, 1); continue; } // 說書人撤回了結束：那條作廢
        if (x.t >= from) out.push(upgrade(x));
      } catch { /* 寫到一半的行 */ }
    }
    if (month(t) === month(Date.now())) break;
  }
  return out.sort((a, b) => a.t - b.t); // 寫盤是異步的，同一時刻的幾條可能前後顛倒
}
