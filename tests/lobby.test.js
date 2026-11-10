// 準備階段：單設備直接定人數、名字可以不寫；開局時沒有惡魔這類提醒，說書人看過可以照樣開。用法：node tests/lobby.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { ok, st } from './helpers.js';
import { autoPicks } from '../lib/engine.js';

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

// 沒有惡魔照樣開的局（無神論者之類）：首夜不卡在爪牙 / 惡魔信息上，天亮不被判成「惡魔死亡，善良獲勝」，勝負由說書人宣佈
for (const venue of [['online', 'many'], ['offline', 'one'], ['offline', 'many']]) {
  for (const roles of [['chef', 'empath', 'monk', 'poisoner', 'saint'], ['chef', 'empath', 'monk', 'soldier', 'saint', 'poisoner', 'spy', 'butler'], ['chef', 'empath', 'monk', 'soldier', 'saint', 'washerwoman', 'butler']]) {
    const r = createRoom();
    r.settings.pretend = false; // 不等假裝叫醒
    ok(st(r, 'venue', { venue: venue[0], devices: venue[1] }));
    if (venue[1] === 'one') ok(st(r, 'seatCount', { n: roles.length })); else roles.forEach((_, i) => joinPlayer(r, 'p' + i, 'n' + i));
    roles.forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
    ok(applyStOp(r, { op: 'next', force: true }));
    assert(r.g.noDemon);
    for (let i = 0; i < 60 && r.phase === 'night'; i++) {
      const s = r.g.step;
      const res = s.status === 'choose' ? st(r, 'pick', autoPicks(r, s)) : s.status === 'confirm' ? st(r, 'confirm', { fields: s.form.truth })
        : s.status === 'review' ? st(r, 'dawn') : s.status === 'decide' ? st(r, 'decide', { choice: s.decide.options.at(-1).id }) : st(r, 'ack');
      assert.notStrictEqual(typeof res, 'string', `${venue} ${roles.length} 人，${s.roleId} ${s.status}：${res}`);
    }
    if (r.phase === 'dawn') ok(st(r, 'next'));
    assert.strictEqual(r.phase, 'day', `${venue} ${roles.length} 人：天亮後是白天，不是直接結束（${r.winReason}）`);
    // 兩個爪牙：互相認識，但沒有惡魔可告訴
    if (roles.length === 8 && venue[1] !== 'one') assert(r.chat.some(m => m.src === 'minioninfo' && /其他爪牙/.test(m.text) && !/惡魔是/.test(m.text)), '爪牙互認');
    // 處決一個人、再入夜：都不自動結束
    ok(st(r, 'execute', { seatId: r.seats[0].id }));
    assert.strictEqual(r.phase, 'day');
    // 中途換進一個惡魔：恢復正常判定，惡魔被處決善良獲勝
    ok(st(r, 'next'));
    ok(st(r, 'setRole', { seatId: r.seats[1].id, roleId: 'imp' }));
    for (let i = 0; i < 60 && r.phase === 'night'; i++) {
      const s = r.g.step;
      const res = s.status === 'choose' ? st(r, 'pick', autoPicks(r, s)) : s.status === 'confirm' ? st(r, 'confirm', { fields: s.form.truth })
        : s.status === 'review' ? st(r, 'dawn') : s.status === 'decide' ? st(r, 'decide', { choice: s.decide.options.at(-1).id }) : st(r, 'ack');
      assert.notStrictEqual(typeof res, 'string', `第二夜 ${s.roleId} ${s.status}：${res}`);
    }
    if (r.phase === 'dawn') ok(st(r, 'next'));
    if (r.phase === 'day' && !r.seats[1].dead) { ok(st(r, 'execute', { seatId: r.seats[1].id })); assert.strictEqual(r.winner, 'good', '有了惡魔之後照常判'); }
  }
}
console.log('沒有惡魔的局能走完首夜，不自動判勝負 ✔');
