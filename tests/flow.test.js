// 新規則測試：隱士/間諜登記、鎮長替死、傳位、計票時鐘、管家、糾錯操作。用法：node tests/flow.test.js
import assert from 'assert';
import { startNight } from '../lib/engine.js';
import { truthLevel } from '../public/js/infofmt.js';
import { setup, S, ok, act, st, pl, atReview, runOnly } from './helpers.js';

// A1 共情者鄰座是隱士：0 是真實答案，1 也合規
{
  const r = setup(['empath', 'recluse', 'imp', 'poisoner', 'chef', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  const f = r.g.step.form;
  assert.strictEqual(f.truth.n, 0);
  assert.deepStrictEqual([...f.ok].sort(), [0, 1]);
  assert.ok(f.alt, '有隱士時標出其他合規答案');
  assert.strictEqual(truthLevel(f, { n: 1 }), 1);
  assert.strictEqual(truthLevel(f, { n: 2 }), 0);
}
// A1 占卜師選到隱士：「有惡魔」合規
{
  const r = setup(['fortuneteller', 'recluse', 'imp', 'poisoner', 'chef', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'saint').id]);
  assert.strictEqual(truthLevel(r.g.step.form, { yes: true }), 1);
}
// A1 洗衣婦：間諜可被當作任意鎮民；調查員：隱士可被當作爪牙；圖書管理員：唯一外來者是隱士時「沒有」合規
{
  let r = setup(['washerwoman', 'spy', 'imp', 'chef', 'soldier', 'saint']);
  let step = await runOnly(r, 'washerwoman');
  assert.strictEqual(truthLevel(step.form, { a: S(r, 'spy').id, b: S(r, 'saint').id, role: 'monk' }), 1);
  assert.strictEqual(truthLevel(step.form, { a: S(r, 'imp').id, b: S(r, 'saint').id, role: 'monk' }), 0);
  r = setup(['investigator', 'recluse', 'imp', 'poisoner', 'chef', 'soldier']);
  step = await runOnly(r, 'investigator');
  assert.strictEqual(truthLevel(step.form, { a: S(r, 'recluse').id, b: S(r, 'chef').id, role: 'baron' }), 1);
  r = setup(['librarian', 'recluse', 'imp', 'poisoner', 'chef', 'soldier']);
  step = await runOnly(r, 'librarian');
  assert.strictEqual(truthLevel(step.form, { none: true }), 1);
}
// A1 送葬者：被處決的是隱士，報成小惡魔也合規
{
  const r = setup(['undertaker', 'recluse', 'imp', 'poisoner', 'chef', 'soldier']);
  st(r, 'next');
  st(r, 'execute', { seatId: S(r, 'recluse').id });
  st(r, 'next');
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(r.g.step.roleId, 'undertaker');
  assert.strictEqual(truthLevel(r.g.step.form, { role: 'imp' }), 1);
}
// A2 鎮長替死：說書人選另一名玩家代替；選士兵則無人死亡
{
  const r = setup(['mayor', 'imp', 'poisoner', 'chef', 'soldier', 'saint', 'monk']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'mayor').id]);
  assert.strictEqual(r.g.step.status, 'decide');
  assert.ok(st(r, 'skip'), '裁定不能跳過');
  ok(st(r, 'decide', { choice: S(r, 'saint').id }));
  assert.strictEqual(S(r, 'mayor').dead, false);
  assert.strictEqual(S(r, 'saint').dead, true);
  ok(st(r, 'dawn'));
  assert.deepStrictEqual(r.g.lastNight, [S(r, 'saint').id]);
  st(r, 'next');
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'mayor').id]);
  ok(st(r, 'decide', { choice: S(r, 'soldier').id }));
  assert.ok(!S(r, 'soldier').dead && !S(r, 'mayor').dead, '轉給士兵：無人死亡');
}
// A2 夜裏復活的玩家不出現在天亮的死訊裏
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  st(r, 'setDead', { seatId: S(r, 'chef').id, dead: false });
  st(r, 'dawn');
  assert.deepStrictEqual(r.g.lastNight, []);
}
// A3 已死亡的貞潔者不觸發
{
  const r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'virgin').dead = true;
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  assert.strictEqual(S(r, 'chef').dead, false);
  assert.ok(r.nomination);
}
// A7/A8 小惡魔自殺、沒有紅唇女郎：說書人選擇接任的爪牙；投毒者接任後毒失效
{
  const r = setup(['imp', 'poisoner', 'spy', 'chef', 'soldier', 'saint', 'monk']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  const imp = S(r, 'imp'), poisoner = S(r, 'poisoner');
  act(r, 'imp', [imp.id]);
  assert.strictEqual(r.g.step.decide.kind, 'starpass');
  ok(st(r, 'decide', { choice: poisoner.id }));
  assert.strictEqual(poisoner.role, 'imp');
  assert.strictEqual(r.g.poisoned, null);
}
// A9 僧侶保護了小惡魔，小惡魔自殺無效
{
  const r = setup(['imp', 'poisoner', 'chef', 'soldier', 'saint', 'monk']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'monk', [S(r, 'imp').id]);
  act(r, 'imp', [S(r, 'imp').id]);
  assert.strictEqual(S(r, 'imp').dead, false);
}
// A5 順時針計票：從被提名者的下一位開始；數過的人不能再改
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id });
  ok(st(r, 'startCount'));
  const c = r.nomination.clock;
  assert.strictEqual(c.order[0], S(r, 'soldier').id);
  assert.strictEqual(c.order.at(-1), S(r, 'monk').id);
  c.at = Date.now() - 2 * c.step - 10; // 時鐘已經過了前兩位（跳過立即計票的全屏提示）
  assert.ok(pl(r, 'soldier', 'vote', { up: true }), '數過的人不能改');
  ok(pl(r, 'chef', 'vote', { up: true }));
}
// A6 管家：主人沒舉手時不能舉手；主人最後放下手，管家的票不算
{
  const r = setup(['butler', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'saint').id]);
  act(r, 'butler', [S(r, 'chef').id]);
  st(r, 'dawn');
  pl(r, 'soldier', 'nominate', { targetId: S(r, 'imp').id });
  assert.ok(pl(r, 'butler', 'vote', { up: true }), '主人沒舉手');
  ok(pl(r, 'chef', 'vote', { up: true }));
  ok(pl(r, 'butler', 'vote', { up: true }));
  ok(pl(r, 'chef', 'vote', { up: false }));
  st(r, 'closeVote');
  assert.strictEqual(r.history.at(-1).count, 0);
}
// A13 間諜的魔典帶紅鯡魚等標記和惡魔偽裝
{
  const r = setup(['spy', 'imp', 'fortuneteller', 'chef', 'soldier', 'saint']);
  r.g.redHerring = S(r, 'chef').id;
  const step = await runOnly(r, 'spy');
  assert.ok(step.form.text.includes('紅鯡魚') && step.form.text.includes('惡魔偽裝'));
}
console.log('新規則測試通過 ✔');
