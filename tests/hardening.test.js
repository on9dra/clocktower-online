// 加固：陌生人能利用、能拖垮服務器的幾處——原型鏈上的操作名、說書人私聊亂填收件人、無上限的名單和日誌、
// 手動局亂填的角色、貞潔者等裁定時投票倒數到點、計時器回調拋錯。用法：node tests/hardening.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { countTick } from '../lib/day.js';
import { stLog, LOG_MAX, guard } from '../lib/util.js';
import { viewFor } from '../lib/view.js';
import { setup, S, ok, st, pl } from './helpers.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const room = (n = 7, mode) => {
  const r = createRoom();
  for (let i = 0; i < n; i++) joinPlayer(r, 'p' + i, 'x' + i);
  if (mode) ok(st(r, 'mode', { mode }));
  return r;
};

// 原型鏈上的名字不是操作：constructor 以前會把整個房間（說書人密鑰、所有人的 pid、私聊原文）原樣回給說書人
{
  const r = room();
  for (const op of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', '__defineGetter__']) {
    assert.strictEqual(st(r, op), '未知操作', op);
  }
  assert.strictEqual(applyStOp(r, { op: { toString: 1 } }), '未知操作', '操作名不是字符串');
}

// 說書人私聊只能發給所有人或某個座位：收件人是 null 時，觀眾和沒座位的人都會把它當成發給自己的
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  assert.strictEqual(st(r, 'chat', { to: null, text: '悄悄話' }), '收件人不存在');
  assert.strictEqual(st(r, 'chat', { to: { a: 1 }, text: '悄悄話' }), '收件人不存在');
  ok(st(r, 'chat', { to: S(r, 'chef').id, text: '給廚師' }));
  ok(st(r, 'chat', { to: 'all', text: '公告' }));
  const watcher = viewFor(r, { pid: 'nobody', watch: true });
  assert.ok(!watcher.chat.some(m => m.text === '悄悄話' || m.text === '給廚師'), '觀眾看不到私信');
  assert.ok(watcher.chat.some(m => m.text === '公告'));
}

// 移出名單有上限：反覆移出不會讓存檔越來越大
{
  const r = room(3);
  r.banned = Array.from({ length: 250 }, (_, i) => 'b' + i);
  ok(st(r, 'kick', { seatId: r.seats[0].id }));
  assert.strictEqual(r.banned.length, 200);
  assert.strictEqual(r.banned.at(-1), 'p0', '剛移出的人在名單裏');
}

// 亂填的「以為自己是」不寫進座位；以前的手動局操作已經沒有了
{
  const roles = ['imp', 'poisoner', 'chef', 'monk', 'virgin', 'slayer', 'drunk'];
  const r = room(roles.length);
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  for (const op of ['tick', 'card', 'inform', 'evilInfo', 'mode']) assert.strictEqual(st(r, op, { roleId: 'chef' }), '未知操作', op);

  const drunk = r.seats[6], was = drunk.fakeRole;
  for (const fakeRole of [{ x: 1 }, 'nobody', ['chef']]) {
    assert.strictEqual(st(r, 'setRole', { seatId: drunk.id, roleId: 'drunk', fakeRole }), '角色不存在');
  }
  assert.strictEqual(drunk.fakeRole, was, '座位沒被改動');
  viewFor(r, { st: true });
  viewFor(r, { pid: drunk.pid });
  ok(st(r, 'setRole', { seatId: drunk.id, roleId: 'drunk', fakeRole: 'monk' }));
  assert.strictEqual(drunk.fakeRole, 'monk', '劇本上的角色照常能選');
}

// 說書人流程日誌一局有上限：寫滿就不再記（不從前面刪，客戶端按條數增量拉取）
{
  const r = room();
  r.g.log = [];
  for (let i = 0; i < LOG_MAX + 50; i++) stLog(r, '第' + i + '條');
  assert.strictEqual(r.g.log.length, LOG_MAX);
  assert.strictEqual(r.g.log[0].text, '第0條', '前面的沒被刪');
}

// 貞潔者等說書人裁定時投票倒數到點：結算不了就不推送。以前每次推送又掛上 60 毫秒後到點的計時器，每 60 毫秒給全房間推一次全量狀態
{
  const r = setup(['virgin', 'imp', 'spy', 'chef', 'soldier', 'saint', 'monk']);
  st(r, 'next');
  assert.strictEqual(r.phase, 'day');
  ok(pl(r, 'spy', 'nominate', { targetId: S(r, 'virgin').id }));
  assert.ok(r.g.virginCheck && !r.g.virginCheck.forced, '間諜提名健康貞潔者：要說書人裁定');
  r.nomination.deadline = Date.now() + 20;
  let pushes = 0;
  const push = room => { pushes++; countTick(room, push); }; // 和服務端一樣：每次推送後重新掛計時器
  countTick(r, push);
  await wait(500);
  assert.strictEqual(pushes, 0, '等裁定時不推送');
  assert.ok(r.nomination, '投票還在');
  ok(st(r, 'virgin', { work: false }));
  countTick(r, push); // 裁定完的那次推送
  await wait(200);
  assert.strictEqual(r.nomination, null, '裁定完照常結算');
  assert.strictEqual(pushes, 1);
}

// 計時器回調拋錯：記下來，不往外拋（拋出去沒人接得住，整個進程退出）
{
  const logged = [], keep = console.error;
  console.error = e => logged.push(e);
  try {
    assert.strictEqual(guard(() => { throw new Error('壞了'); })(), undefined);
  } finally {
    console.error = keep;
  }
  assert.strictEqual(logged[0]?.message, '壞了');
  assert.strictEqual(guard((a, b) => a + b)(2, 3), 5, '沒出錯時照常返回');
}

console.log('加固測試通過 ✔');
