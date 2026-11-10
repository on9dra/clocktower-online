// 準備階段：單設備直接定人數、名字可以不寫；開局時沒有惡魔這類提醒，說書人看過可以照樣開。用法：node tests/lobby.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { ok, st } from './helpers.js';

const bad = (r, op, args) => assert.strictEqual(typeof st(r, op, args), 'string', op + ' 應該被拒絕');

// 單設備定人數：多了在後面補空座位，少了從最後拿掉；線上局不行
{
  const r = createRoom();
  bad(r, 'seatCount', { n: 7 });
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'seatCount', { n: 7 }));
  assert.strictEqual(r.seats.length, 7);
  assert(r.seats.every(s => s.local && s.name === ''), '空座位，沒有名字');
  const first = r.seats.map(s => s.id);
  ok(st(r, 'seatCount', { n: 9 }));
  assert.deepStrictEqual(r.seats.slice(0, 7).map(s => s.id), first, '加人不動原來的座位');
  ok(st(r, 'seatCount', { n: 5 }));
  assert.deepStrictEqual(r.seats.map(s => s.id), first.slice(0, 5), '減人從最後拿掉');
  ok(st(r, 'seatCount', { n: 99 }));
  assert.strictEqual(r.seats.length, 15, '最多 15 人');
  ok(st(r, 'seatCount', { n: 5 }));
  // 名字：寫上、清空都行
  ok(st(r, 'renameSeat', { seatId: r.seats[0].id, name: '阿文' }));
  assert.strictEqual(r.seats[0].name, '阿文');
  ok(st(r, 'renameSeat', { seatId: r.seats[0].id, name: '' }));
  assert.strictEqual(r.seats[0].name, '');
  // 抽過角色再改人數：抽的作廢
  ok(st(r, 'draft'));
  assert(r.draft);
  ok(st(r, 'seatCount', { n: 6 }));
  assert(!r.draft, '人數變了，抽好的角色作廢');
  console.log('單設備定人數、改名 ✔');
}

// 沒有惡魔：默認攔住，force（說書人看過提醒照樣開）可以開
{
  const r = createRoom();
  for (let i = 0; i < 5; i++) joinPlayer(r, 'p' + i, 'n' + i);
  ['chef', 'empath', 'monk', 'poisoner', 'saint'].forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
  bad(r, 'next');
  assert.strictEqual(r.phase, 'lobby');
  ok(applyStOp(r, { op: 'next', force: true }));
  assert.strictEqual(r.phase, 'night');
  console.log('沒有惡魔的提醒可以照樣開局 ✔');
}
