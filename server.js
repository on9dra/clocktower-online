// 血染鐘樓線上魔典 —— 服務端：房間管理 + 按身份過濾後的狀態同步
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import compression from 'compression';
import qrcode from 'qrcode-generator';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import * as store from './lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer, claimSeat, WATCH, BAD_PASS } from './lib/ops.js';
import { scriptPayload } from './lib/script.js';
import { viewFor } from './lib/view.js';
import { isBot, botTick } from './lib/bots.js';
import { countTick, virginTick } from './lib/day.js';
import { mvpTick } from './lib/score.js';
import { pretendTick } from './lib/engine.js';
import { allow } from './lib/limit.js';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
// 意見反饋（關於面板）：一條一行追加在這裏，服務器上 tail 著看
const FEEDBACK = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'feedback.jsonl');
// 頻率限制：[連續最多幾次, 之後每多少毫秒回一次]
const LIMIT = {
  create: [5, 60 * 1000], // 每個 IP 建房：連建 5 個，之後每分鐘 1 個
  miss: [10, 3000], // 每個 IP 輸錯房號 / 密鑰 / 房間密碼 / 重連鏈接：連錯 10 次，之後每 3 秒 1 次（9000 個房號猜一遍要七八個小時）
  op: [40, 50], // 每個連接的操作：連發 40 個，之後每秒 20 個
  chat: [6, 2000], // 每個座位的聊天：連發 6 條，之後每 2 秒 1 條
  feedback: [3, 10 * 60 * 1000], // 每個 IP 的反饋：連寄 3 封，之後每 10 分鐘 1 封
};
const SLOW = '操作太頻繁，請稍後再試';
const PID = /^[\w-]{1,64}$/;

const app = express();
app.use(compression()); // 服務器帶寬只有 2Mbps 上下，JS、CSS 壓縮後剩四分之一
// 二維碼：只畫本站首頁（分享）和房間鏈接（邀請、換設備）這兩種形狀，不當通用二維碼服務
app.get('/qr.svg', (req, res) => {
  const u = String(req.query.u || '');
  if (!/^https?:\/\/[^\s/?#]+\/(\?room=\d{4}&r=[0-9a-f]{6}(&seat=[0-9a-f]{12})?)?$/.test(u)) return res.status(400).end();
  const qr = qrcode(0, 'M');
  qr.addData(u);
  qr.make();
  const n = qr.getModuleCount(), m = n + 6;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 ${m} ${m}" shape-rendering="crispEdges">`
    + `<rect x="-3" y="-3" width="${m}" height="${m}" fill="#fffdf3"/><path fill="#2a2622" d="${d}"/></svg>`);
});
// 圖片、音效一天內不再問服務器，過期後先用舊的、後台更新；HTML、JS、CSS 每次都驗證，一部署就是新版
const IMG = /\.(webp|svg|m4a)$/;
app.use(express.static(path.join(ROOT, 'public'), { setHeaders: (res, file) => {
  if (IMG.test(file)) res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=2592000');
} }));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 64 * 1024 }); // 單條消息最多 64KB

// 客戶端 IP：直連的就是對端地址；經本機 / 內網的反向代理（Caddy、nginx、Docker）時，取代理追加在 X-Forwarded-For 最後的那個
const PRIVATE = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd]|fe80:)/i;
function ipOf(socket) {
  const addr = socket.handshake.address.replace(/^::ffff:/, '');
  const fwd = socket.handshake.headers['x-forwarded-for'];
  return fwd && PRIVATE.test(addr) ? String(fwd).split(',').pop().trim() : addr;
}

// 說書人可以「代入」某位玩家的視角：拿到的就是那位玩家看到的狀態（只讀）
function viewOf(room, who, since) {
  const seat = who.st && who.peek && room.seats.find(x => x.id === who.peek);
  if (!seat) return viewFor(room, who, since);
  const i = room.seats.indexOf(seat);
  return { ...viewFor(room, { pid: seat.pid }, since), peek: { seatId: seat.id, label: `${i + 1}號 ${seat.name}` } };
}

// 聊天只推新增的部分；新的一局、切換代入視角或剛連上時整體重發
function emitState(socket, room) {
  const d = socket.data, key = `${room.chatEpoch}|${d.peek || ''}`;
  const reset = d.chatKey !== key;
  const v = viewOf(room, d, reset ? 0 : d.chatSeq || 0);
  v.chatReset = reset;
  // 上傳的劇本只發一次：剛連上、或換了一本
  if (room.script && d.scriptVer !== room.script.ver) { v.custom = scriptPayload(room.script); d.scriptVer = room.script.ver; }
  d.chatKey = key;
  d.chatSeq = room.chatSeq || 0;
  socket.emit('state', v);
}

const socketsOf = code => [...io.sockets.sockets.values()].filter(s => s.data.code === code);

// 座位沒了的玩家連接（被移出、座位被別的設備接走）退回大廳
function dropOrphans(room, list) {
  return list.filter(s => {
    const d = s.data;
    if (d.st || d.watch || room.seats.some(x => x.pid === d.pid)) return true;
    s.emit('bye', room.banned?.includes(d.pid) ? 'kicked' : 'moved');
    s.data = {};
    return false;
  });
}

// 刷新在線狀態後，把每個人各自能看到的狀態推過去
function broadcast(room) {
  if (store.get(room.code) !== room) return; // 房間已解散 / 被騰掉：延遲觸發的計時器不再推送
  const list = dropOrphans(room, socketsOf(room.code));
  const online = new Set(list.map(s => s.data.pid).filter(Boolean));
  room.stOnline = list.some(s => s.data.st);
  // 觀眾席：同一個人開了幾個標籤頁只坐一個位置
  room.watchers = [...new Map(list.filter(s => s.data.watch).map(s => [s.data.pid, { pid: s.data.pid, name: s.data.name }])).values()];
  for (const seat of room.seats) seat.online = isBot(seat) || online.has(seat.pid);
  for (const s of list) emitState(s, room);
  store.save(room);
  botTick(room, broadcast);
  countTick(room, broadcast);
  virginTick(room, broadcast);
  mvpTick(room, broadcast);
  pretendTick(room, broadcast);
}

io.on('connection', socket => {
  const ip = ipOf(socket);
  // 回覆：字符串是錯誤，對象是附帶的數據
  const reply = (cb, r) => cb && cb(typeof r === 'string' ? { ok: false, error: r } : { ok: true, ...r });
  const handle = (fn) => (data = {}, cb) => {
    if (typeof cb !== 'function') cb = null;
    if (!allow('op:' + socket.id, LIMIT.op)) return reply(cb, SLOW);
    try { fn(data || {}, cb); } catch (e) { console.error(e); reply(cb, '服務器出錯：' + e.message); }
  };
  // 有改動的操作：記下活躍時間、回覆、推送
  const done = (room, cb, r) => { store.touch(room); reply(cb, r); broadcast(room); };
  const miss = () => allow('miss:' + ip, LIMIT.miss);
  // 找房間：找不到、或鏈接裏的實例標識對不上（房號已經給了新房間）都算輸錯一次
  const find = (code, inst, cb) => {
    if (!allow('miss:' + ip, LIMIT.miss, 0)) return reply(cb, SLOW);
    const room = store.get(code);
    if (room && (!inst || inst === room.inst)) return room;
    miss();
    reply(cb, room ? '這個鏈接的那一局已經結束了' : '房間不存在');
  };
  const badPid = pid => typeof pid !== 'string' || !PID.test(pid);

  socket.on('st:create', handle((_, cb) => {
    if (!allow('create:' + ip, LIMIT.create)) return reply(cb, '建房太頻繁，請稍後再試');
    if (!store.makeSpace(code => socketsOf(code).length > 0)) return reply(cb, '房間已滿，請稍後再試');
    const room = store.createRoom();
    socket.data = { code: room.code, st: true };
    reply(cb, { code: room.code, stKey: room.stKey, inst: room.inst });
    broadcast(room);
  }));

  socket.on('st:join', handle(({ code, stKey }, cb) => {
    const room = find(code, null, cb);
    if (!room) return;
    if (room.stKey !== stKey) { miss(); return reply(cb, '說書人密鑰錯誤'); }
    socket.data = { code: room.code, st: true };
    done(room, cb);
  }));

  // 坐不下（已開局、滿員）就觀戰
  socket.on('pl:join', handle(({ code, inst, pid, name, pass }, cb) => {
    if (badPid(pid)) return reply(cb, '缺少玩家標識');
    const room = find(code, inst, cb);
    if (!room) return;
    const err = joinPlayer(room, pid, name, String(pass || ''));
    if (err === BAD_PASS) miss();
    if (err && err !== WATCH) return reply(cb, err);
    socket.data = { code: room.code, pid, watch: err === WATCH, name: String(name ?? '').trim().slice(0, 12) || '路人' };
    done(room, cb, { watch: err === WATCH });
  }));

  // 說書人發的重連鏈接：接過座位，原來的設備退出
  socket.on('pl:claim', handle(({ code, inst, pid, token }, cb) => {
    if (badPid(pid)) return reply(cb, '缺少玩家標識');
    const room = find(code, inst, cb);
    if (!room) return;
    const err = claimSeat(room, pid, String(token || ''));
    if (err) { miss(); return reply(cb, err); }
    socket.data = { code: room.code, pid };
    done(room, cb);
  }));

  // 大廳的「最近的房間」：只回答實例標識對得上的（拿這個猜不出別人的房間）
  socket.on('rooms:info', handle(({ list }, cb) => {
    const out = (Array.isArray(list) ? list.slice(0, 8) : []).map(x => {
      const r = x && store.get(x.code);
      return r && r.inst === x.inst ? { code: r.code, inst: r.inst, phase: r.phase, n: r.seats.length, scriptId: r.scriptId } : null;
    });
    reply(cb, { list: out.filter(Boolean) });
  }));

  // 意見反饋：不和房間綁定，大廳裏也能寄；帶上房號、繁簡、瀏覽器，方便對著查
  socket.on('feedback', handle(({ text, contact, room, lang }, cb) => {
    text = String(text || '').trim().slice(0, 1000);
    if (!text) return reply(cb, '寫點什麼再寄出');
    if (!allow('feedback:' + ip, LIMIT.feedback)) return reply(cb, '寄得太頻繁，請過一會兒再寄');
    const line = JSON.stringify({ at: new Date().toISOString(), text, contact: String(contact || '').trim().slice(0, 60),
      room: /^\d{4}$/.test(room) ? room : '', lang: lang === 'sc' ? 'sc' : 'tc', ua: String(socket.handshake.headers['user-agent'] || '').slice(0, 160) });
    fs.mkdir(path.dirname(FEEDBACK), { recursive: true }, () =>
      fs.appendFile(FEEDBACK, line + '\n', e => { if (e) console.error(e); reply(cb, e ? '寄出失敗，請稍後再試' : {}); }));
  }));

  socket.on('st:op', handle((op, cb) => {
    const room = store.get(socket.data.code);
    if (!room || !socket.data.st) return reply(cb, '無權限');
    if (op.op === 'close') return close(room, cb);
    done(room, cb, applyStOp(room, op));
  }));

  // 解散房間：其他人退回大廳，存檔刪掉
  function close(room, cb) {
    store.remove(room.code);
    reply(cb);
    for (const s of socketsOf(room.code)) { if (s !== socket) s.emit('bye', 'closed'); s.data = {}; }
  }

  socket.on('st:peek', handle(({ seatId }, cb) => {
    const room = store.get(socket.data.code);
    if (!room || !socket.data.st) return reply(cb, '無權限');
    socket.data.peek = seatId || null;
    reply(cb);
    emitState(socket, room);
  }));

  socket.on('pl:act', handle((act, cb) => {
    const room = store.get(socket.data.code);
    if (!room || !socket.data.pid) return reply(cb, '未加入房間');
    if (act.act === 'chat' && !allow(`chat:${room.code}:${socket.data.pid}`, LIMIT.chat)) return reply(cb, SLOW);
    const err = applyPlayerAction(room, socket.data.pid, act);
    if (act.act === 'leave' && !err) socket.data = {}; // 自己離座：不用再通知他「座位沒了」
    done(room, cb, err);
  }));

  socket.on('disconnect', () => {
    const room = store.get(socket.data && socket.data.code);
    if (room) setTimeout(() => broadcast(room), 50);
  });
});

store.load();
// 每小時清理一次長時間沒人用、也沒人連著的房間
setInterval(() => store.sweep(code => socketsOf(code).length > 0), 3600 * 1000).unref();
// 退出前把還沒寫盤的房間寫完
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flushSync(); process.exit(0); });
server.listen(PORT, () => console.log(`血染鐘樓魔典已啓動: http://localhost:${PORT}`));
