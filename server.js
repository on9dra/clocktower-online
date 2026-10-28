// 血染鐘樓線上魔典 —— 服務端：房間管理 + 按身份過濾後的狀態同步
import path from 'path';
import http from 'http';
import express from 'express';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import * as store from './lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from './lib/ops.js';
import { viewFor } from './lib/view.js';
import { isBot, botTick } from './lib/bots.js';
import { countTick, virginTick } from './lib/day.js';
import { mvpTick } from './lib/score.js';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 64 * 1024 }); // 單條消息最多 64KB

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
  d.chatKey = key;
  d.chatSeq = room.chatSeq || 0;
  socket.emit('state', v);
}

const socketsOf = code => [...io.sockets.sockets.values()].filter(s => s.data.code === code);

// 刷新在線狀態後，把每個人各自能看到的狀態推過去
function broadcast(room) {
  const list = socketsOf(room.code);
  const online = new Set(list.map(s => s.data.pid).filter(Boolean));
  room.stOnline = list.some(s => s.data.st);
  for (const seat of room.seats) seat.online = isBot(seat) || online.has(seat.pid);
  for (const s of list) emitState(s, room);
  store.save();
  botTick(room, broadcast);
  countTick(room, broadcast);
  virginTick(room, broadcast);
  mvpTick(room, broadcast);
}

io.on('connection', socket => {
  const reply = (cb, err) => cb && cb(err ? { ok: false, error: err } : { ok: true });
  const handle = (fn) => (data = {}, cb) => {
    try { fn(data || {}, cb); } catch (e) { console.error(e); reply(cb, '服務器出錯：' + e.message); }
  };
  // 有改動的操作：記下活躍時間、回覆、推送
  const done = (room, cb, err) => { store.touch(room); reply(cb, err); broadcast(room); };

  socket.on('st:create', handle((_, cb) => {
    const room = store.createRoom(code => socketsOf(code).length > 0);
    if (!room) return reply(cb, '房間已滿，請稍後再試');
    socket.data = { code: room.code, st: true };
    cb && cb({ ok: true, code: room.code, stKey: room.stKey });
    broadcast(room);
  }));

  socket.on('st:join', handle(({ code, stKey }, cb) => {
    const room = store.get(code);
    if (!room) return reply(cb, '房間不存在');
    if (room.stKey !== stKey) return reply(cb, '說書人密鑰錯誤');
    socket.data = { code: room.code, st: true };
    done(room, cb);
  }));

  socket.on('pl:join', handle(({ code, pid, name }, cb) => {
    const room = store.get(code);
    if (!room) return reply(cb, '房間不存在');
    if (!pid || typeof pid !== 'string') return reply(cb, '缺少玩家標識');
    const err = joinPlayer(room, pid, name);
    if (err) return reply(cb, err);
    socket.data = { code: room.code, pid };
    done(room, cb);
  }));

  socket.on('st:op', handle((op, cb) => {
    const room = store.get(socket.data.code);
    if (!room || !socket.data.st) return reply(cb, '無權限');
    done(room, cb, applyStOp(room, op));
  }));

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
    done(room, cb, applyPlayerAction(room, socket.data.pid, act));
  }));

  socket.on('disconnect', () => {
    const room = store.get(socket.data && socket.data.code);
    if (room) setTimeout(() => broadcast(room), 50);
  });
});

store.load();
// 每小時清理一次長時間沒人用、也沒人連著的房間
setInterval(() => store.sweep(code => socketsOf(code).length > 0), 3600 * 1000).unref();
server.listen(PORT, () => console.log(`血染鐘樓魔典已啓動: http://localhost:${PORT}`));
