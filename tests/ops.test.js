// 操作與缺陷修復測試：新局清空信息、標記時機、取消提名、角色配置與預覽、說書人糾錯。用法：node tests/ops.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { setup, S, ok, st, pl, runOnly } from './helpers.js';

const room = n => { const r = createRoom(); for (let i = 0; i < n; i++) joinPlayer(r, 'p' + i, 'n' + i); return r; };

// B1 新的一局清空上一局的信息和私聊，gameId 變化
{
  const r = setup(['chef', 'imp', 'poisoner', 'washerwoman', 'soldier', 'saint', 'monk']);
  const before = r.gameId, oldIds = new Set(r.chat.map(m => m.id));
  st(r, 'abandon');
  st(r, 'next');
  assert.notStrictEqual(r.gameId, before);
  assert.ok(!r.chat.some(m => oldIds.has(m.id)), '上一局的消息不帶進新局');
  assert.strictEqual(r.chat.filter(m => m.text?.startsWith('你的角色')).length, r.seats.length);
}
// B2 洗衣婦的魔典標記在說書人確認後才寫上，標在實際給出的兩人身上
{
  const r = setup(['washerwoman', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  await runOnly(r, 'washerwoman');
  assert.ok(!Object.values(r.g.marks).flat().some(t => t.startsWith('洗衣婦')), '確認前沒有標記');
  st(r, 'confirm', { fields: { a: S(r, 'chef').id, b: S(r, 'saint').id, role: 'chef' } });
  assert.deepStrictEqual(r.g.marks[S(r, 'chef').id], ['洗衣婦:廚師']);
  assert.deepStrictEqual(r.g.marks[S(r, 'saint').id], ['洗衣婦:錯誤']);
}
// B5 取消提名後，雙方今天可以重新提名 / 被提名
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
  ok(st(r, 'cancelVote'));
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
}
// C1 角色配置：必選男爵（5 人也行）、排除角色、必選超額報錯
{
  const r = room(5);
  ok(st(r, 'roleRule', { roleId: 'baron', rule: 'lock' }));
  ok(st(r, 'roleRule', { roleId: 'chef', rule: 'ban' }));
  ok(st(r, 'next'));
  assert.ok(S(r, 'baron'), '必選的男爵在場');
  assert.ok(!S(r, 'chef'), '排除的廚師不在場');
  assert.strictEqual(r.seats.filter(s => ['butler', 'drunk', 'recluse', 'saint'].includes(s.role)).length, 2, '男爵 +2 外來者');
  const r2 = room(5);
  st(r2, 'roleRule', { roleId: 'poisoner', rule: 'lock' });
  st(r2, 'roleRule', { roleId: 'spy', rule: 'lock' });
  assert.ok(st(r2, 'next'), '5 人局只有 1 個爪牙名額');
  assert.strictEqual(r2.phase, 'lobby');
}
// C1 先抽角色預覽：玩家看不到，說書人可換角色，開局沿用；有人加入則作廢
{
  const r = room(6);
  ok(st(r, 'draft'));
  assert.ok(r.draft && r.seats.every(s => s.role));
  assert.strictEqual(viewFor(r, { pid: 'p0' }).myRole, null, '預覽時玩家看不到角色');
  const target = r.seats.find(s => s.role !== 'imp' && !['minion', 'demon'].includes(s.role));
  ok(st(r, 'setRole', { seatId: target.id, roleId: 'drunk', fakeRole: 'chef' }));
  const snapshot = r.seats.map(s => s.role);
  ok(st(r, 'next'));
  assert.deepStrictEqual(r.seats.map(s => s.role), snapshot);
  assert.strictEqual(target.fakeRole, 'chef');
  assert.ok(!r.g.bluffs.includes('chef'), '酒鬼的假身份不能當偽裝');
  const r3 = room(6);
  st(r3, 'draft');
  joinPlayer(r3, 'late', 'late');
  assert.ok(!r3.draft && r3.seats.every(s => !s.role), '加人後預覽作廢');
  const r4 = room(6);
  st(r4, 'draft');
  ok(st(r4, 'roleRule', { roleId: 'baron', rule: 'lock' }));
  assert.ok(!r4.draft && r4.seats.every(s => !s.role), '改角色配置後預覽作廢');
  st(r4, 'draft');
  ok(st(r4, 'clearRules'));
  assert.ok(!r4.draft, '清空角色配置後預覽作廢');
  const r5 = room(6);
  st(r5, 'draft');
  const roles5 = new Map(r5.seats.map(s => [s.id, s.role]));
  ok(st(r5, 'shuffleSeats'));
  assert.ok(r5.draft && r5.seats.every(s => s.role === roles5.get(s.id)), '打亂座位不影響抽好的角色');
}
// C3 說書人糾錯：設中毒、補發信息、直接處決、更換角色會通知玩家
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(st(r, 'setPoison', { seatId: S(r, 'chef').id }));
  assert.strictEqual(r.g.poisoned, S(r, 'chef').id);
  ok(st(r, 'tellInfo', { seatId: S(r, 'chef').id, text: '補充信息' }));
  assert.ok(r.chat.some(m => m.info && m.to === S(r, 'chef').id && m.text === '補充信息'));
  const monk = S(r, 'monk');
  ok(st(r, 'setRole', { seatId: monk.id, roleId: 'slayer' }));
  assert.ok(r.chat.at(-1).text.includes('獵手'));
  ok(st(r, 'execute', { seatId: S(r, 'saint').id }));
  assert.strictEqual(r.g.ruling?.kind, 'saint', '處決聖徒先等說書人裁定');
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(r.winner, 'evil', '直接處決聖徒同樣判負');
}
// F1 增量推送：只帶上序號更大的消息
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  const seq = r.chatSeq;
  st(r, 'chat', { to: 'all', text: 'hi' });
  const v = viewFor(r, { pid: 'p0' }, seq);
  assert.deepStrictEqual(v.chat.map(m => m.text), ['hi']);
}
console.log('操作與缺陷修復測試通過 ✔');
