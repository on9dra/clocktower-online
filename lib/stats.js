// 運營統計：每 5 分鐘記一次在線人數，每局記開局、結束（或中止）、人數、劇本、勝負。
// 按月一個文件，寫在 data/stats/ 下：samples-2026-11.jsonl、games-2026-11.jsonl。只給 /admin 看
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SCRIPTS } from '../public/js/roles.js';
import { offline, oneDevice } from './util.js';

const DIR = path.join(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'stats');
export const SAMPLE_EVERY = 5 * 60 * 1000;
const month = t => new Date(t).toISOString().slice(0, 7);
const file = (kind, t) => path.join(DIR, `${kind}-${month(t)}.jsonl`);
// 玩家標識不原樣落盤：只留 8 位摘要，夠數「多少個不同的人」
const tag = pid => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 8);

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
export const away = (room, p) => playing(room) && room.phase !== 'ended' && offline(room) && Date.now() - actedAt(room) < AWAY_IDLE
  ? Math.max(0, room.seats.filter(s => s.role).length - p.on) : 0;

// 正在進行的對局：房號 -> 記錄。重啓後由房間存檔裏的 g.statAt 接上
const open = new Map();

function close(rec, end, winner) {
  end = Math.max(rec.t, end || Date.now());
  open.delete(rec.code);
  append('games', { t: rec.t, end, mins: Math.round((end - rec.t) / 6e4), n: rec.n, script: rec.script, mode: rec.mode, winner: winner || null, who: rec.who });
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
  const seated = room.seats.filter(s => s.role);
  rec.mode = mode(room);
  rec.last = Math.max(actedAt(room), rec.t);
  rec.n = seated.length;
  rec.who = seated.filter(s => !s.local).map(s => tag(s.pid)); // 線下座位每局一個新標識，認不出是誰，不算進「不同玩家」
  if (room.phase === 'ended') { room.g.statDone = true; close(rec, Date.now(), room.winner); }
}

// 訪問：每打開一次首頁記一筆。訪客 = IP + 瀏覽器的摘要；同一個訪客 30 分鐘內刷新、重開不重記。爬蟲、預覽、curl 不算
const VISIT_GAP = 30 * 6e4, seen = new Map();
export function visit(ip, ua) {
  if (!/Mozilla/.test(ua) || /bot|spider|crawl|preview|headless|lighthouse/i.test(ua)) return;
  const v = tag(ip + '|' + ua), t = Date.now(), last = seen.get(v);
  seen.set(v, t);
  if (!last || t - last >= VISIT_GAP) append('visits', { t, v });
}

// 定時調用：記一個在線人數的點；順便收掉已經被解散的房間裏沒結束的局
export function sample(rooms, socks, get) {
  let people = 0, inGame = 0, live = 0, games = 0, off = 0;
  for (const r of rooms) {
    const p = presence(r, socks), n = p.st + p.on + p.watch;
    people += n;
    off += away(r, p);
    if (n) live++;
    if (playing(r) && r.phase !== 'ended') { games++; inGame += n; }
  }
  const lobby = socks.filter(s => !s.data.code).length;
  // people / inGame 只數連着的；off 是線下桌邊沒連上的玩家，圖上加進在線和遊戲中
  append('samples', { t: Date.now(), people: people + lobby, inGame, live, games, off });
  for (const [v, t] of seen) if (Date.now() - t >= VISIT_GAP) seen.delete(v);
  for (const rec of [...open.values()]) {
    const r = get(rec.code);
    if (!r || r.inst !== rec.inst) close(rec, rec.last, null);
  }
}

// 還沒結束的局（給 /admin 列在最上面）
export const running = () => [...open.values()].map(({ t, n, script, mode, last }) => ({ t, n, script, mode, last }));

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
      try { const x = JSON.parse(line); if (x.t >= from) out.push(upgrade(x)); } catch { /* 寫到一半的行 */ }
    }
    if (month(t) === month(Date.now())) break;
  }
  return out.sort((a, b) => a.t - b.t); // 寫盤是異步的，同一時刻的幾條可能前後顛倒
}
