// 房間系統測試：移出 / 房間密碼 / 換設備 / 觀戰 / 騰房（直接調用），限流、退回大廳、解散、存檔、二維碼（起一個真服務器）。
// 用法：node tests/room.test.js
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-room-'));
process.env.MAX_ROOMS = '3';
process.env.DATA_DIR = DATA;
const store = await import('../lib/store.js');
const { applyStOp, applyPlayerAction, joinPlayer, claimSeat, WATCH, NEED_PASS, BAD_PASS } = await import('../lib/ops.js');
const { viewFor } = await import('../lib/view.js');
const { EGG } = await import('../public/js/score.js');

const ok = r => assert.strictEqual(r, undefined, r);
const st = (r, op, args = {}) => applyStOp(r, { op, ...args });
const room = n => { const r = store.createRoom(); for (let i = 0; i < n; i++) ok(joinPlayer(r, 'p' + i, 'n' + i)); return r; };
const seatOf = (r, pid) => r.seats.find(s => s.pid === pid);

// 移出：記進名單，再加入被拒；說書人解除後能回來。沒動過的檔案一起刪掉
{
  const r = room(3);
  ok(st(r, 'kick', { seatId: seatOf(r, 'p1').id }));
  assert.deepStrictEqual(r.banned, ['p1']);
  assert.ok(!r.players.p1, '初始檔案刪掉');
  assert.ok(joinPlayer(r, 'p1', 'x'), '被移出的不能再加入');
  ok(st(r, 'unban'));
  ok(joinPlayer(r, 'p1', 'x'));
}
// 房間密碼：新來的要輸對（觀戰也一樣），已經在座的直接重連；密碼只有說書人看得到
{
  const r = room(3);
  ok(st(r, 'pass', { pass: '1234' }));
  assert.strictEqual(joinPlayer(r, 'new', 'x'), NEED_PASS);
  assert.strictEqual(joinPlayer(r, 'new', 'x', '0000'), BAD_PASS);
  ok(joinPlayer(r, 'p0', 'n0'));
  assert.strictEqual(viewFor(r, { pid: 'p0' }).pass, undefined);
  assert.strictEqual(viewFor(r, { pid: 'p0' }).locked, true);
  assert.strictEqual(viewFor(r, { st: true }).pass, '1234');
  ok(joinPlayer(r, 'new', 'x', '1234'));
  assert.ok(st(r, 'pass', { pass: '12' }), '不是 4 位數字');
  assert.strictEqual(r.pass, '1234');
  ok(st(r, 'pass', { pass: '' }));
  ok(joinPlayer(r, 'new2', 'x'));
  ok(st(r, 'next'));
  ok(st(r, 'pass', { pass: '1234' }));
  assert.strictEqual(joinPlayer(r, 'late', 'x'), NEED_PASS);
  assert.strictEqual(joinPlayer(r, 'late', 'x', '1234'), WATCH);
}
// 坐不下就觀戰：已開局、滿 15 人
{
  const r = room(5);
  ok(st(r, 'next'));
  assert.strictEqual(joinPlayer(r, 'late', 'x'), WATCH);
  const full = room(15);
  assert.strictEqual(joinPlayer(full, 'p15', 'x'), WATCH);
  // 觀戰的視角：沒有座位、看不到角色和私聊
  const v = viewFor(r, { pid: 'late' });
  assert.strictEqual(v.myId, null);
  assert.ok(v.seats.every(s => !('role' in s)));
  assert.ok(!v.chat.some(m => m.to !== 'all'));
  assert.strictEqual(v.inst, r.inst);
}
// 換設備：新設備接過座位，檔案、皇冠、MVP 票跟著走；鏈接只能用一次
{
  const r = room(5);
  const seat = seatOf(r, 'p2');
  r.players.p2.wins = 2;
  r.result = { winners: ['p2', 'p3'] };
  r.mvp = { votes: { p2: seat.id } };
  const { token } = st(r, 'seatLink', { seatId: seat.id });
  assert.match(token, /^[0-9a-f]{12}$/);
  assert.strictEqual(claimSeat(r, 'p3', token), '你在這個房間已經有座位了');
  ok(claimSeat(r, 'phone2', token));
  assert.strictEqual(seat.pid, 'phone2');
  assert.strictEqual(r.players.phone2.wins, 2);
  assert.ok(!r.players.p2);
  assert.deepStrictEqual(r.result.winners, ['phone2', 'p3']);
  assert.strictEqual(r.mvp.votes.phone2, seat.id);
  assert.ok(claimSeat(r, 'phone3', token), '用過的鏈接失效');
  // 再發一次，舊鏈接作廢；被移出的人拿到鏈接也能回來
  const t1 = st(r, 'seatLink', { seatId: seat.id }).token, t2 = st(r, 'seatLink', { seatId: seat.id }).token;
  r.banned = ['phone3'];
  assert.ok(claimSeat(r, 'phone3', t1));
  ok(claimSeat(r, 'phone3', t2));
  assert.deepStrictEqual(r.banned, []);
}
// 反覆進出不會堆檔案
{
  const r = room(0);
  for (let i = 0; i < 50; i++) { ok(joinPlayer(r, 'x' + i, 'x')); ok(applyPlayerAction(r, 'x' + i, { act: 'leave' })); }
  assert.strictEqual(Object.keys(r.players).length, 0);
}
// 騰房：只騰沒人連著的；空房 10 分鐘、有人的房 6 小時沒動靜才騰
{
  // 上面的測試建了好幾個房間，先清空
  for (let c = 1000; c <= 9999; c++) if (store.get(String(c))) store.remove(String(c));
  const a = room(0), b = room(2), c = room(2);
  const nobody = () => false;
  assert.strictEqual(store.makeSpace(nobody), false, '都是剛建的：騰不出');
  a.updatedAt = Date.now() - 11 * 60 * 1000;
  assert.strictEqual(store.makeSpace(code => code === a.code), false, '有人連著的不騰');
  assert.strictEqual(store.makeSpace(nobody), true, '10 分鐘沒動靜的空房騰掉');
  assert.ok(!store.get(a.code));
  const d = room(0);
  b.updatedAt = Date.now() - 7 * 3600 * 1000;
  c.updatedAt = Date.now() - 2 * 3600 * 1000;
  assert.strictEqual(store.makeSpace(nobody), true);
  assert.ok(!store.get(b.code) && store.get(c.code) && store.get(d.code), '騰 6 小時沒動靜的');
  [c, d].forEach(r => store.remove(r.code));
}
console.log('room unit tests ok');
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(700); // 等上面刪房間的寫盤做完，免得刪到服務器的文件

// ———— 起一個真服務器 ————
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 再往上 Windows 常常保留成系統端口，綁定會 EACCES；這一段裏的 4045、4190 在 fetch 的禁用端口名單上（報 bad port），跳過
const PORT = (p => (p === 4045 || p === 4190 ? p + 1 : p))(3900 + Math.floor(Math.random() * 300));
const URL = `http://127.0.0.1:${PORT}`;
// 舊版本的單文件存檔：啓動時拆成每房一個文件
fs.rmSync(path.join(DATA, 'rooms'), { recursive: true, force: true });
const old = store.createRoom();
fs.writeFileSync(path.join(DATA, 'rooms.json'), JSON.stringify([old]));

function start() {
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT, DATA_DIR: DATA, MAX_ROOMS: '99' } });
  return new Promise((res, rej) => {
    child.stdout.on('data', d => { if (String(d).includes('已啓動')) res(child); });
    child.stderr.on('data', d => process.stderr.write(d));
    child.on('exit', code => rej(new Error('服務器退出 ' + code)));
  });
}
const socks = [];
// 每個「用戶」一個 IP（服務器只在本機代理後面才認 X-Forwarded-For，測試從 127.0.0.1 連正好）
const conn = ip => { const s = io(URL, { forceNew: true, transports: ['websocket'], extraHeaders: { 'x-forwarded-for': ip } }); socks.push(s); return s; };
const call = (s, ev, data = {}) => new Promise(r => s.emit(ev, data, r));
const once = (s, ev) => new Promise(r => s.once(ev, r));
// 等到滿足條件的狀態（之前的推送可能還在路上）
const until = (s, pred, ms = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off('state', f); rej(new Error('等狀態超時')); }, ms);
  const f = v => { if (pred(v)) { clearTimeout(t); s.off('state', f); res(v); } };
  s.on('state', f);
});

let server = await start();
try {
  assert.ok(fs.existsSync(path.join(DATA, 'rooms', old.code + '.json')), '舊存檔拆成每房一個文件');
  assert.ok(fs.existsSync(path.join(DATA, 'rooms.json.migrated')));

  // 二維碼：只畫房間鏈接
  const q = await fetch(`${URL}/qr.svg?u=${encodeURIComponent('https://a.b/?room=1234&r=abcdef&seat=0123456789ab')}`);
  assert.strictEqual(q.status, 200);
  assert.match(await q.text(), /^<svg/);
  assert.strictEqual((await fetch(`${URL}/qr.svg?u=${encodeURIComponent('https://evil.com/x')}`)).status, 400);

  // 建房：同一個 IP 連建 5 個之後被限流，別的 IP 不受影響
  const host = conn('10.0.0.1');
  const made = [];
  for (let i = 0; i < 5; i++) made.push(await call(host, 'st:create'));
  assert.ok(made.every(r => r.ok && /^[0-9a-f]{6}$/.test(r.inst)));
  assert.match((await call(host, 'st:create')).error, /太頻繁/);
  const stS = conn('10.0.0.2');
  const R = await call(stS, 'st:create');
  assert.ok(R.ok);

  // 玩家標識：機器人前綴、超長的都不收；實例標識對不上（舊鏈接）不讓進
  const p1 = conn('10.0.1.1');
  assert.ok(!(await call(p1, 'pl:join', { code: R.code, pid: 'bot:abc', name: 'x' })).ok);
  assert.ok(!(await call(p1, 'pl:join', { code: R.code, pid: 'a'.repeat(65), name: 'x' })).ok);
  assert.match((await call(p1, 'pl:join', { code: R.code, inst: 'ffffff', pid: 'pid-1', name: 'x' })).error, /結束/);
  assert.ok((await call(p1, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-1', name: '甲' })).ok);
  const p2 = conn('10.0.1.2');
  assert.ok((await call(p2, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-2', name: '乙' })).ok);

  // 輸錯房號：每個 IP 連錯 10 次後被擋
  const guess = conn('10.0.9.9');
  let blocked = false;
  for (let i = 0; i < 12; i++) {
    const r = await call(guess, 'pl:join', { code: '0000', pid: 'g', name: 'g' });
    if (/太頻繁/.test(r.error)) blocked = true;
  }
  assert.ok(blocked, '猜房號被限流');

  // 房間密碼：沒帶密碼不算猜，輸錯算，連錯被擋；輸對能進
  assert.ok((await call(stS, 'st:op', { op: 'pass', pass: '4321' })).ok);
  const guessPass = conn('10.0.9.8');
  for (let i = 0; i < 12; i++) assert.match((await call(guessPass, 'pl:join', { code: R.code, pid: 'g2', name: 'g' })).error, /請輸入/);
  let passBlocked = false;
  for (let i = 0; i < 12; i++) {
    const r = await call(guessPass, 'pl:join', { code: R.code, pid: 'g2', name: 'g', pass: '0000' });
    if (/太頻繁/.test(r.error)) passBlocked = true;
  }
  assert.ok(passBlocked, '猜密碼被限流');
  const friend = conn('10.0.1.3');
  assert.ok((await call(friend, 'pl:join', { code: R.code, pid: 'pid-3', name: '丙', pass: '4321' })).ok);
  friend.emit('pl:act', { act: 'leave' });
  assert.ok((await call(stS, 'st:op', { op: 'pass', pass: '' })).ok);

  // 聊天：每個座位連發 6 條後被限流
  const sent = [];
  for (let i = 0; i < 8; i++) sent.push(await call(p1, 'pl:act', { act: 'chat', to: 'all', text: 'hi' + i }));
  assert.ok(sent.slice(0, 6).every(r => r.ok) && /太頻繁/.test(sent[7].error));

  // 移出：被移出的連接收到 bye，刷新再進被拒
  let v = until(stS, x => x.seats.length === 3);
  const extra = i => call(conn('10.0.3.' + i), 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-x' + i, name: 'x' + i });
  await extra(1);
  const seat2 = (await v).seats.find(s => s.name === '乙');
  const kicked = once(p2, 'bye');
  assert.ok((await call(stS, 'st:op', { op: 'kick', seatId: seat2.id })).ok);
  assert.strictEqual(await kicked, 'kicked');
  assert.match((await call(p2, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-2', name: '乙' })).error, /移出/);

  // 換設備：新設備接過座位，舊設備收到 bye
  v = until(stS, x => x.seats.length === 5);
  for (const i of [2, 3, 4]) await extra(i);
  const seat1 = (await v).seats.find(s => s.name === '甲');
  const link = await call(stS, 'st:op', { op: 'seatLink', seatId: seat1.id });
  assert.ok(link.ok && link.token);
  const moved = once(p1, 'bye');
  const p1b = conn('10.0.1.1');
  const mine = until(p1b, x => x.myId === seat1.id);
  assert.ok((await call(p1b, 'pl:claim', { code: R.code, inst: R.inst, pid: 'pid-1b', token: link.token })).ok);
  assert.strictEqual(await moved, 'moved');
  assert.strictEqual((await mine).myId, seat1.id);

  // 開局後加入：觀戰。說書人看到觀戰人數
  assert.ok((await call(stS, 'st:op', { op: 'next' })).ok);
  const w = conn('10.0.2.1');
  const watchView = until(w, x => x.phase === 'night');
  const stView = until(stS, x => x.watchers.length === 1);
  const jr = await call(w, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-w', name: '看' });
  assert.ok(jr.ok && jr.watch);
  assert.strictEqual((await watchView).myId, null);
  assert.deepStrictEqual((await stView).watchers, [{ name: '看', mine: false }], '觀眾席只有名字，不帶 pid');
  assert.ok(!(await call(w, 'pl:act', { act: 'chat', to: 'all', text: 'x' })).ok, '觀戰不能發言');

  // 加固：代入視角收到怪東西、原型鏈上的操作名、保留字當玩家標識，都不能讓服務器出事
  const callT = (s, ev, data) => Promise.race([call(s, ev, data), wait(3000).then(() => ({ ok: false, error: '超時' }))]);
  assert.ok((await callT(stS, 'st:peek', { seatId: { toString: 1 } })).ok);
  const probe = conn('10.0.5.1');
  assert.ok((await callT(probe, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-probe', name: '探' })).ok);
  probe.close(); // 斷線後延遲推送：以前在這裏拼字符串拋錯，沒人接住，整個進程退出
  await wait(300);
  assert.ok((await callT(conn('10.0.5.2'), 'rooms:info', { list: [] })).ok, '服務器還活著');
  const dump = await callT(stS, 'st:op', { op: 'constructor' });
  assert.ok(!dump.ok && !dump.stKey && !dump.seats, '原型鏈上的名字不是操作，不回傳房間');
  assert.match((await callT(conn('10.0.5.3'), 'pl:join', { code: R.code, inst: R.inst, pid: '__proto__', name: 'x' })).error, /標識/, '保留字不能當玩家標識');
  assert.ok((await callT(stS, 'st:peek', { seatId: null })).ok);

  // 最近的房間：實例標識對上的才回答
  const info = await call(conn('10.0.3.1'), 'rooms:info', { list: [{ code: R.code, inst: R.inst }, { code: made[0].code, inst: 'ffffff' }] });
  assert.deepStrictEqual(info.list.map(x => [x.code, x.phase]), [[R.code, 'night']]);

  // 存檔：每房一個文件
  await wait(900);
  const file = path.join(DATA, 'rooms', R.code + '.json');
  assert.ok(fs.existsSync(file));
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).inst, R.inst);

  // 重啓服務器：房間還在
  server.kill();
  await wait(300);
  server = await start();
  const back = conn('10.0.1.1');
  assert.ok((await call(back, 'pl:join', { code: R.code, inst: R.inst, pid: 'pid-1b', name: '甲' })).ok);

  // 解散：其他人收到 bye，存檔刪掉，房號不再能進
  const st2 = conn('10.0.0.2');
  assert.ok((await call(st2, 'st:join', { code: R.code, stKey: R.stKey })).ok);
  const closed = once(back, 'bye');
  assert.ok((await call(st2, 'st:op', { op: 'close' })).ok);
  assert.strictEqual(await closed, 'closed');
  assert.match((await call(conn('10.0.4.1'), 'pl:join', { code: R.code, pid: 'z', name: 'z' })).error, /不存在/);
  await wait(900);
  assert.ok(!fs.existsSync(file), '解散後存檔刪掉');
  console.log('room server tests ok');
} finally {
  socks.forEach(s => s.close());
  server.kill();
  await wait(200);
  fs.rmSync(DATA, { recursive: true, force: true });
}
