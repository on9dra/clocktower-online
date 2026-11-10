// 手動指定角色和偽裝、跨劇本相剋。用法：node tests/manual.test.js（以前的手動局已經併進線下局，見 offline.test.js、hybrid.test.js）
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { ROLES } from '../public/js/roles.js';
import { setup, S, ok, act, st, pl, runOnly } from './helpers.js';

const room = (n = 7) => {
  const r = createRoom();
  for (let i = 0; i < n; i++) joinPlayer(r, 'p' + i, 'x' + i);
  return r;
};
const bad = (r, op, args) => assert.strictEqual(typeof st(r, op, args), 'string', op + ' 應該被拒絕');

// ───── 先指定，其餘隨機 ─────
{
  const r = room();
  const [a, b] = r.seats;
  ok(st(r, 'setRole', { seatId: a.id, roleId: 'imp' }));
  ok(st(r, 'setRole', { seatId: b.id, roleId: 'chef' }));
  assert.ok(a.pinned && !r.draft, '抽之前就能指定');
  assert.strictEqual(viewFor(r, { st: true }).seats[0].role, 'imp');
  assert.strictEqual(viewFor(r, { pid: 'p1' }).seats[0].role, undefined, '玩家看不到');
  for (let k = 0; k < 20; k++) {
    ok(st(r, 'draft'));
    assert.strictEqual(a.role, 'imp');
    assert.strictEqual(b.role, 'chef');
    assert.ok(r.seats.every(s => s.role));
    assert.strictEqual(new Set(r.seats.map(s => s.role)).size, 7, '不重複');
    assert.strictEqual(r.seats.filter(s => ROLES[s.role].team === 'demon').length, 1, '指定的惡魔佔掉名額');
  }
  // 抽完改的座位也算指定
  const c = r.seats[2];
  ok(st(r, 'setRole', { seatId: c.id, roleId: 'monk' }));
  ok(st(r, 'draft'));
  assert.strictEqual(c.role, 'monk');
  // 恢復隨機：抽好時角色先留著，下次抽才換
  ok(st(r, 'unpin', { seatId: c.id }));
  assert.ok(!c.pinned && c.role === 'monk');
  // 有人加入：抽的作廢，指定的留著
  joinPlayer(r, 'p9', 'new');
  assert.ok(!r.draft);
  assert.strictEqual(a.role, 'imp');
  assert.strictEqual(c.role, null);
  // 沒抽時恢復隨機就是空座位
  ok(st(r, 'unpin', { seatId: b.id }));
  assert.strictEqual(b.role, null);
  // 換劇本：指定的也清掉
  ok(st(r, 'script', { scriptId: 'bmr' }));
  assert.ok(r.seats.every(s => !s.role && !s.pinned));
}
// 全部指定完不用再抽；指定的配比不對也能開
{
  const r = room(5);
  const list = ['imp', 'poisoner', 'spy', 'baron', 'scarletwoman'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: list[i] })));
  assert.ok(r.draft, '全部指定完直接可以確認開局');
  assert.strictEqual(r.g.bluffs.length, 3);
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  assert.ok(r.seats.every((s, i) => s.role === list[i]));
}
// 超額指定：空座位比名額少時不報錯，先留邪惡
{
  const r = room(7);
  ['chef', 'monk', 'empath', 'virgin', 'slayer', 'mayor'].forEach((id, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: id })));
  ok(st(r, 'draft'));
  assert.ok(['minion', 'demon'].includes(ROLES[r.seats[6].role].team));
}
// 必須有惡魔
{
  const list = ['chef', 'monk', 'empath', 'virgin', 'slayer'];
  const a = room(5);
  a.seats.forEach((s, i) => ok(st(a, 'setRole', { seatId: s.id, roleId: list[i] })));
  assert.strictEqual(st(a, 'next'), '場上至少要有一名惡魔');
}

// ───── 惡魔偽裝 ─────
{
  const r = room();
  ok(st(r, 'draft'));
  const inPlay = r.seats.map(s => s.role).find(id => ['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk');
  const free = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor'].filter(id => !r.seats.some(s => s.role === id || s.fakeRole === id));
  bad(r, 'setBluff', { i: 0, roleId: inPlay });
  bad(r, 'setBluff', { i: 0, roleId: 'imp' });
  bad(r, 'setBluff', { i: 3, roleId: free[0] });
  const pick = free.find(id => !r.g.bluffs.includes(id)) || free[0];
  const keep = r.g.bluffs.slice(1);
  ok(st(r, 'setBluff', { i: 0, roleId: pick }));
  assert.strictEqual(r.g.bluffs[0], pick);
  assert.deepStrictEqual(r.g.bluffs.slice(1), keep, '別的格子不換');
  // 撞上在場角色：智能推進自動換掉
  ok(st(r, 'setRole', { seatId: r.seats[0].id, roleId: pick }));
  assert.ok(!r.g.bluffs.includes(pick));
  assert.strictEqual(r.g.bluffs.length, 3);
  bad(room(), 'setBluff', { i: 0, roleId: 'chef' }); // 抽之前沒有偽裝
}

// ───── 跨劇本的相剋 ─────
{
  // 方古跳到外來者：已經有新惡魔，紅唇女郎不接任
  const r = setup(['fanggu', 'scarletwoman', 'saint', 'chef', 'monk', 'empath', 'mayor']);
  const old = S(r, 'fanggu'), saint = S(r, 'saint');
  await runOnly(r, 'fanggu', 2);
  act(r, 'fanggu', [saint.id]);
  assert.ok(old.dead);
  assert.strictEqual(saint.role, 'fanggu');
  assert.strictEqual(S(r, 'scarletwoman').role, 'scarletwoman');
}
{
  // 被麻臉巫婆變成莽夫的邪惡玩家：被善良玩家選中也不轉善
  const r = setup(['pithag', 'imp', 'poisoner', 'chef', 'monk', 'empath', 'mayor']);
  const t = S(r, 'poisoner');
  r.scriptId = 'custom'; r.script = { roles: [...r.seats.map(x => x.role), 'goon'] };
  await runOnly(r, 'pithag', 2);
  ok(applyPlayerAction(r, S(r, 'pithag').pid, { act: 'pick', ids: [t.id], role: 'goon' }));
  assert.strictEqual(t.role, 'goon');
  r.g.step = null;
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [t.id]);
  assert.strictEqual(t.align, 'evil');
}
{
  // 侍女能得知數學家今晚會不會醒
  const r = setup(['imp', 'poisoner', 'chambermaid', 'mathematician', 'monk', 'empath', 'mayor']);
  r.g.woke = [];
  await runOnly(r, 'chambermaid', 2);
  act(r, 'chambermaid', [S(r, 'mathematician').id, S(r, 'monk').id]);
  assert.strictEqual(r.g.step.form.truth.n, 1);
}
{
  // 隱士可能被賢者當作惡魔
  const r = setup(['imp', 'poisoner', 'sage', 'recluse', 'monk', 'empath', 'mayor']);
  const sage = S(r, 'sage'), recluse = S(r, 'recluse');
  r.g.sageDue = { [sage.id]: S(r, 'imp').id };
  await runOnly(r, 'sage', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(f.mayBe[recluse.id], ['imp']);
  ok(st(r, 'confirm', { fields: { a: recluse.id, b: S(r, 'monk').id, role: 'imp' } }));
}
{
  // 被亡骨魔殺死、保留能力的主謀：亡骨魔被處決時仍然有效
  const r = setup(['vigormortis', 'mastermind', 'chef', 'monk', 'empath', 'mayor', 'soldier']);
  const mm = S(r, 'mastermind'), demon = S(r, 'vigormortis');
  await runOnly(r, 'vigormortis', 2);
  act(r, 'vigormortis', [mm.id]);
  assert.ok(mm.dead && mm.keep);
  r.g.step = null; r.g.queue = [];
  r.phase = 'day';
  ok(st(r, 'execute', { seatId: demon.id }));
  assert.notStrictEqual(r.phase, 'ended', '主謀讓遊戲再進行一夜一天');
  assert.ok(r.g.mastermindDay);
}
{
  // 只剩一個人活著的深夜：共情者不崩潰
  const r = setup(['imp', 'empath', 'chef', 'monk', 'mayor', 'soldier', 'saint']);
  for (const s of r.seats) if (s.role !== 'empath') s.dead = true;
  await runOnly(r, 'empath', 2);
  assert.strictEqual(r.g.step.form.truth.n, 0);
}
{
  // 祖母只在首夜得知孫子
  const r = setup(['imp', 'grandmother', 'chef', 'monk', 'mayor', 'soldier', 'saint']);
  assert.strictEqual(ROLES.grandmother.other, 0);
  assert.strictEqual(ROLES.grandmother.first, 40);
  void r;
}
{
  // 渦流 + 隱士：是非題兩個答案都合規時發得出去
  const r = setup(['vortox', 'poisoner', 'fortuneteller', 'recluse', 'monk', 'empath', 'mayor']);
  await runOnly(r, 'fortuneteller', 2);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'monk').id]);
  const f = r.g.step.form;
  assert.ok(f.vortox && f.alt);
  ok(st(r, 'confirm', { fields: { yes: true } }));
}
console.log('手動指定、手動局、相剋測試通過 ✔');
process.exit(0);
