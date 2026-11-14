// 隱士 / 間諜「上次被當作什麼」（room.g.regLog，說書人卡上的提示）：只是記下來，不鎖定下一次。用法：node tests/regs.test.js
import assert from 'assert';
import { setup, S, st, ok, pl, act, runOnly } from './helpers.js';
import { noteReg } from '../lib/util.js';

const mk = roles => { const r = setup(roles); r.scriptId = 'tb'; return r; };
const last = (r, role) => r.g.regLog?.[S(r, role).id]?.at(-1);
const day = r => st(r, 'next');

// 調查員：隱士被當作投毒者；卡上帶著能登記的座位
{
  const r = mk(['investigator', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'investigator', 1);
  const f = r.g.step.form;
  assert.ok(f.alt && f.regIds.includes(S(r, 'recluse').id), '卡上列出能登記的隱士');
  ok(st(r, 'confirm', { fields: { a: S(r, 'recluse').id, b: S(r, 'monk').id, role: 'poisoner' } }));
  assert.deepStrictEqual(last(r, 'recluse'), { as: 'poisoner', src: 'investigator', day: false, n: 1 });
}
// 調查員給真的投毒者，隱士只是另一名玩家：不算查過隱士
{
  const r = mk(['investigator', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'investigator', 1);
  ok(st(r, 'confirm', { fields: { a: S(r, 'poisoner').id, b: S(r, 'recluse').id, role: 'poisoner' } }));
  assert.ok(!last(r, 'recluse'));
}
// 圖書管理員：給隱士本人 = 按真實身份；說「沒有外來者」= 不算外來者
{
  const r = mk(['librarian', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'librarian', 1);
  ok(st(r, 'confirm', { fields: { a: S(r, 'recluse').id, b: S(r, 'monk').id, role: 'recluse' } }));
  assert.strictEqual(last(r, 'recluse').as, null);
}
{
  const r = mk(['librarian', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'soldier']);
  await runOnly(r, 'librarian', 1);
  ok(st(r, 'confirm', { fields: { none: true } }));
  assert.deepStrictEqual([last(r, 'recluse').as, last(r, 'recluse').not], ['outsider', true]);
}
// 共情者：隱士在旁邊，數字只在一種算法下成立
{
  const r = mk(['empath', 'recluse', 'imp', 'poisoner', 'chef', 'monk', 'saint']);
  // 共情者兩邊：隱士、聖徒（都善良）
  await runOnly(r, 'empath', 1);
  const f = r.g.step.form;
  assert.deepStrictEqual([f.truth.n, f.ok.includes(1)], [0, true]);
  ok(st(r, 'confirm', { fields: { n: 1 } }));
  assert.strictEqual(last(r, 'recluse').as, 'evil');
}
{
  const r = mk(['empath', 'recluse', 'imp', 'poisoner', 'chef', 'monk', 'saint']);
  await runOnly(r, 'empath', 1);
  ok(st(r, 'confirm', { fields: { n: 0 } }));
  assert.strictEqual(last(r, 'recluse').as, null, '真話：按真實身份');
}
// 中毒的共情者隨便給：不記
{
  const r = mk(['empath', 'recluse', 'imp', 'poisoner', 'chef', 'monk', 'saint']);
  r.g.poisoned = S(r, 'empath').id;
  await runOnly(r, 'empath', 1);
  assert.ok(r.g.step.form.free || r.g.step.form.why);
  ok(st(r, 'confirm', { fields: { n: 1 } }));
  assert.ok(!last(r, 'recluse'));
}
// 占卜師：隱士和一名善良玩家，「是」= 被當作惡魔，「否」= 不算惡魔
{
  const r = mk(['fortuneteller', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'fortuneteller', 2);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'monk').id]);
  ok(st(r, 'confirm', { fields: { yes: true } }));
  assert.deepStrictEqual([last(r, 'recluse').as, last(r, 'recluse').not, last(r, 'recluse').n], ['demon', undefined, 2]);
}
{
  const r = mk(['fortuneteller', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'fortuneteller', 2);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'monk').id]);
  ok(st(r, 'confirm', { fields: { yes: false } }));
  assert.deepStrictEqual([last(r, 'recluse').as, last(r, 'recluse').not], ['demon', true]);
}
// 送葬者：處決的隱士被當作小惡魔
{
  const r = mk(['undertaker', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  r.g.lastExecutedId = S(r, 'recluse').id; r.g.lastExecutedRole = 'recluse';
  await runOnly(r, 'undertaker', 2);
  ok(st(r, 'confirm', { fields: { role: 'imp' } }));
  assert.strictEqual(last(r, 'recluse').as, 'imp');
}
// 白天：獵手打中隱士 = 被當作惡魔；沒打中 = 不算惡魔
{
  const r = mk(['slayer', 'imp', 'poisoner', 'recluse', 'empath', 'monk', 'saint']);
  day(r);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id });
  ok(st(r, 'rule', { work: false }));
  assert.deepStrictEqual(last(r, 'recluse'), { as: 'demon', src: 'slayer', day: true, n: r.g.day, not: true });
}
{
  const r = mk(['slayer', 'imp', 'poisoner', 'recluse', 'empath', 'monk', 'saint']);
  day(r);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id });
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(last(r, 'recluse').as, 'demon');
  assert.ok(!last(r, 'recluse').not);
}
// 貞潔者：間諜提名，反噬 = 被當作鎮民
{
  const r = mk(['virgin', 'imp', 'spy', 'poisoner', 'empath', 'monk', 'saint']);
  day(r);
  pl(r, 'spy', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(r.g.virginCheck && !r.g.virginCheck.forced);
  ok(st(r, 'virgin', { work: true }));
  assert.strictEqual(last(r, 'spy').as, 'townsfolk');
}
// 獵手打的不是隱士 / 間諜：不記
{
  const r = mk(['slayer', 'imp', 'poisoner', 'recluse', 'empath', 'monk', 'saint']);
  day(r);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'empath').id });
  ok(st(r, 'rule', { work: false }));
  assert.ok(!r.g.regLog || !Object.keys(r.g.regLog).length);
}
// 不鎖定：上次被當作投毒者，這次照樣能給真實身份，記錄跟著換
{
  const r = mk(['investigator', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  r.g.regLog = { [S(r, 'recluse').id]: [{ as: 'poisoner', src: 'investigator', day: false, n: 1 }] };
  r.seats.find(s => s.role === 'empath').role = 'fortuneteller';
  await runOnly(r, 'fortuneteller', 2);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'monk').id]);
  ok(st(r, 'confirm', { fields: { yes: false } }));
  assert.deepStrictEqual([last(r, 'recluse').src, last(r, 'recluse').not], ['fortuneteller', true]);
  assert.strictEqual(r.g.regLog[S(r, 'recluse').id].length, 2, '之前那次還留著');
}
// 同一個角色連著得到一樣的說法只記一行；最多留 4 行
{
  const r = mk(['fortuneteller', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']), id = S(r, 'recluse').id;
  r.phase = 'night';
  r.g.night = 2; noteReg(r, id, 'demon', 'fortuneteller', true);
  r.g.night = 3; noteReg(r, id, 'demon', 'fortuneteller', true);
  assert.deepStrictEqual([r.g.regLog[id].length, r.g.regLog[id][0].n], [1, 3], '占卜師兩晚都說否：一行，記最近那晚');
  for (const n of [4, 5, 6, 7, 8]) { r.g.night = n; noteReg(r, id, 'demon', 'fortuneteller', n % 2 === 1); }
  assert.deepStrictEqual(r.g.regLog[id].map(x => x.n), [5, 6, 7, 8]);
}
console.log('regs ok');
