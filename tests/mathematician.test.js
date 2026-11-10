// 數學家：從黎明起能力因別人而失常的人數。該算的、不該算的都寫死。用法：node tests/mathematician.test.js
import assert from 'assert';
import { execute, killSeat, die } from '../lib/rules.js';
import { addEff, abnormal } from '../lib/util.js';
import { setup, S, act, st, ok, pl, runOnly } from './helpers.js';

const mk = (roles, sid = 'tb') => { const r = setup(roles); r.scriptId = sid; return r; };
const off = (r, role) => (r.g.abnormal || []).includes(S(r, role).id);
const poison = (r, role) => addEff(r, S(r, role).id, 'poison', 'poisoner', 1e9);
const decide = (r, choice) => ok(st(r, 'decide', { choice }));
const day = r => st(r, 'next');

// 卡片：算出來的數字是真相，能力正常也能改，改了不算失常
{
  const r = mk(['mathematician', 'imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
  r.g.abnormal = [S(r, 'chef').id, S(r, 'empath').id];
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.strictEqual(f.truth.n, 2);
  assert.deepStrictEqual(f.ids, [S(r, 'chef').id, S(r, 'empath').id], '卡片上列出算入的座位');
  assert.ok(f.free && f.open && !f.unknown && !f.why, '系統知道答案，所有數字可選');
  ok(st(r, 'confirm', { fields: { n: 3 } }));
  assert.ok(!off(r, 'mathematician'), '說書人調整數字不算失常');
}
// 自己失常數不到自己
{
  const r = mk(['mathematician', 'imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
  r.g.abnormal = [S(r, 'mathematician').id];
  await runOnly(r, 'mathematician', 2);
  assert.strictEqual(r.g.step.form.truth.n, 0);
}
// 中毒的數學家：給錯才算失常
{
  const r = mk(['mathematician', 'imp', 'poisoner', 'chef', 'empath', 'monk', 'saint']);
  poison(r, 'mathematician');
  await runOnly(r, 'mathematician', 2);
  assert.strictEqual(r.g.step.form.why, 'poison');
  ok(st(r, 'confirm', { fields: { n: 1 } }));
  assert.ok(off(r, 'mathematician'));
}
// 渦流：數學家也只能得到錯誤的數字
{
  const r = mk(['mathematician', 'vortox', 'witch', 'saint', 'oracle', 'klutz', 'flowergirl'], 'snv');
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.ok(f.vortox && f.free && f.why === 'vortox');
  assert.ok(st(r, 'confirm', { fields: { n: f.truth.n } }), '真話被拒');
  ok(st(r, 'confirm', { fields: { n: f.truth.n + 1 } }));
}
// 雜耍藝人的猜測沒有錄入：系統還是不知道
{
  const r = mk(['juggler', 'vortox', 'witch', 'saint', 'oracle', 'klutz', 'flowergirl'], 'snv');
  await runOnly(r, 'juggler', 2);
  assert.ok(r.g.step.form.unknown && !r.g.step.form.vortox);
}
// 信息：錯誤信息算；靠隱士登記的信息也算（官方例子：隱士被廚師當成邪惡）；真話不算
{
  const r = mk(['chef', 'imp', 'recluse', 'poisoner', 'empath', 'monk', 'saint']);
  await runOnly(r, 'chef', 1);
  const f = r.g.step.form, alt = f.ok.find(n => n !== f.truth.n);
  assert.ok(alt !== undefined, '隱士可以被當作邪惡');
  ok(st(r, 'confirm', { fields: { n: alt } }));
  assert.ok(off(r, 'chef'));
}
{
  const r = mk(['chef', 'imp', 'poisoner', 'empath', 'monk', 'saint', 'butler']);
  poison(r, 'chef');
  await runOnly(r, 'chef', 1);
  ok(st(r, 'confirm', { fields: r.g.step.form.truth }));
  assert.ok(!off(r, 'chef'), '中毒但恰好給了真話：不算');
}
// 酒鬼本來就沒有能力
{
  const r = mk(['chef', 'imp', 'poisoner', 'empath', 'monk', 'saint', 'drunk']);
  abnormal(r, S(r, 'drunk'));
  assert.ok(!off(r, 'drunk'));
}
// 白天：中毒的獵手打中真惡魔沒生效
{
  const r = mk(['slayer', 'imp', 'poisoner', 'mathematician', 'empath', 'monk', 'saint']);
  day(r); poison(r, 'slayer');
  pl(r, 'slayer', 'slay', { targetId: S(r, 'imp').id });
  ok(st(r, 'rule', { work: false }));
  assert.ok(off(r, 'slayer'));
}
// 中毒的獵手打的不是惡魔：本來就打不中，不算
{
  const r = mk(['slayer', 'imp', 'poisoner', 'mathematician', 'empath', 'monk', 'saint']);
  day(r); poison(r, 'slayer');
  pl(r, 'slayer', 'slay', { targetId: S(r, 'empath').id });
  ok(st(r, 'rule', { work: false }));
  assert.ok(!off(r, 'slayer'));
}
// 獵手靠隱士登記打中：算
{
  const r = mk(['slayer', 'imp', 'poisoner', 'mathematician', 'recluse', 'monk', 'saint']);
  day(r);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id });
  ok(st(r, 'rule', { work: true }));
  assert.ok(off(r, 'slayer'));
}
// 中毒的貞潔者被鎮民提名沒反噬：算；被爪牙提名：本來就不會反噬，不算
{
  const r = mk(['virgin', 'imp', 'poisoner', 'mathematician', 'empath', 'monk', 'saint']);
  day(r); poison(r, 'virgin');
  pl(r, 'empath', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(!r.g.virginCheck && off(r, 'virgin'), '中毒的貞潔者直接無事，不開小窗');
}
{
  const r = mk(['virgin', 'imp', 'poisoner', 'mathematician', 'empath', 'monk', 'saint']);
  day(r); poison(r, 'virgin');
  pl(r, 'poisoner', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(!r.g.virginCheck && !off(r, 'virgin'));
}
// 中毒的聖徒被處決、裁定不算數：算
{
  const r = mk(['saint', 'imp', 'poisoner', 'mathematician', 'empath', 'monk', 'chef']);
  day(r); poison(r, 'saint');
  execute(r, S(r, 'saint'));
  ok(st(r, 'rule', { work: false }));
  assert.ok(off(r, 'saint'));
}
// 被動保護：中毒的水手被惡魔殺死
{
  const r = mk(['imp', 'sailor', 'poisoner', 'mathematician', 'empath', 'chef', 'monk'], 'bmr');
  poison(r, 'sailor');
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'sailor').id]);
  assert.ok(S(r, 'sailor').dead && off(r, 'sailor'));
}
// 中毒的茶藝師沒保住善良的鄰座；保護範圍外的人死了不算
{
  const r = mk(['imp', 'poisoner', 'chef', 'tealady', 'empath', 'monk', 'saint'], 'bmr');
  poison(r, 'tealady');
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'empath').id]);
  assert.ok(S(r, 'empath').dead && off(r, 'tealady'));
}
{
  const r = mk(['imp', 'poisoner', 'chef', 'tealady', 'empath', 'monk', 'saint'], 'bmr');
  poison(r, 'tealady');
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'monk').id]);
  assert.ok(S(r, 'monk').dead && !off(r, 'tealady'));
}
// 中毒的僧侶：惡魔真的殺了他保的人才算；保的人沒被攻擊不算（裁定無效那一刻先不算）
{
  const r = mk(['imp', 'poisoner', 'monk', 'mathematician', 'empath', 'chef', 'saint']);
  poison(r, 'monk');
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [S(r, 'chef').id]);
  decide(r, 'fail');
  assert.ok(!off(r, 'monk'), '還沒有後果');
  r.g.step = null;
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.ok(S(r, 'chef').dead && off(r, 'monk'));
}
{
  const r = mk(['imp', 'poisoner', 'monk', 'mathematician', 'empath', 'chef', 'saint']);
  poison(r, 'monk');
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [S(r, 'chef').id]);
  decide(r, 'fail');
  r.g.step = null;
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'empath').id]);
  assert.ok(!off(r, 'monk'));
}
// 中毒的祖母：孫子被殺，她本該跟著死
{
  const r = mk(['imp', 'poisoner', 'grandmother', 'mathematician', 'empath', 'chef', 'monk'], 'bmr');
  r.g.grandchild = { [S(r, 'grandmother').id]: S(r, 'chef').id };
  poison(r, 'grandmother');
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.ok(!S(r, 'grandmother').dead && off(r, 'grandmother'));
}
// 死亡時的能力：中毒的心上人、僵怖
{
  const r = mk(['sweetheart', 'imp', 'poisoner', 'mathematician', 'empath', 'chef', 'monk'], 'snv');
  poison(r, 'sweetheart');
  killSeat(r, S(r, 'sweetheart'), '被處決');
  assert.ok(off(r, 'sweetheart'));
}
{
  const r = mk(['zombuul', 'poisoner', 'empath', 'mathematician', 'chef', 'monk', 'saint'], 'bmr');
  poison(r, 'zombuul');
  die(r, S(r, 'zombuul'), '夜裏被惡魔殺死');
  assert.ok(off(r, 'zombuul') && !S(r, 'zombuul').undead);
}
// 吟遊詩人中毒：爪牙死於處決，本該讓所有人醉酒
{
  const r = mk(['minstrel', 'imp', 'poisoner', 'mathematician', 'empath', 'chef', 'monk'], 'bmr');
  day(r); poison(r, 'minstrel');
  execute(r, S(r, 'poisoner'));
  assert.ok(off(r, 'minstrel'));
}
// 舞蛇人、驅魔人選的不是惡魔：本來就沒有效果，不用裁定也不算（官方例子）
{
  const r = mk(['snakecharmer', 'vortox', 'witch', 'mathematician', 'oracle', 'klutz', 'flowergirl'], 'snv');
  poison(r, 'snakecharmer');
  await runOnly(r, 'snakecharmer', 2);
  act(r, 'snakecharmer', [S(r, 'oracle').id]);
  assert.ok(r.g.step?.status !== 'decide' && !off(r, 'snakecharmer'));
}
{
  const r = mk(['snakecharmer', 'vortox', 'witch', 'mathematician', 'oracle', 'klutz', 'flowergirl'], 'snv');
  poison(r, 'snakecharmer');
  await runOnly(r, 'snakecharmer', 2);
  act(r, 'snakecharmer', [S(r, 'vortox').id]);
  decide(r, 'fail');
  assert.ok(off(r, 'snakecharmer'), '選中惡魔卻沒換：算');
}
// 女巫的詛咒沒有後果就不算（官方例子）
{
  const r = mk(['witch', 'vortox', 'snakecharmer', 'mathematician', 'oracle', 'klutz', 'flowergirl'], 'snv');
  poison(r, 'witch');
  await runOnly(r, 'witch', 2);
  act(r, 'witch', [S(r, 'oracle').id]);
  decide(r, 'fail');
  assert.ok(!off(r, 'witch'));
}
// 中毒的士兵死了：單殺走裁定，算
{
  const r = mk(['imp', 'poisoner', 'soldier', 'mathematician', 'empath', 'chef', 'monk']);
  poison(r, 'soldier');
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'soldier').id]);
  decide(r, 'fail');
  assert.ok(S(r, 'soldier').dead && off(r, 'soldier'));
}
// 僧侶擋下惡魔：官方沒說算不算，留給說書人改數字
{
  const r = mk(['imp', 'poisoner', 'monk', 'mathematician', 'empath', 'chef', 'saint']);
  await runOnly(r, 'imp', 2);
  r.g.protected = S(r, 'chef').id;
  act(r, 'imp', [S(r, 'chef').id]);
  assert.ok(!S(r, 'chef').dead && !(r.g.abnormal || []).length);
}

// 說書人卡片的兩組（form.acted 成功 / form.maybe 可能失效）：從黎明起用過能力的人，按座位排，一人一項 { s, r }；
// 算進數字的帶 n、排在可能失效的前面
const it = (r, role, as = role, n) => ({ s: S(r, role).id, r: as, ...(n && { n: true }) });
const seen = (f, r, role) => [...f.acted, ...f.maybe].some(x => x.s === S(r, role).id);
// 走到數學家：每一步按 plan 替玩家點（說書人代點）
function walk(r, plan) {
  for (let k = 0; k < 40; k++) {
    const s = r.g.step, p = plan[s?.roleId];
    if (s?.roleId === 'mathematician') return s.form;
    assert.ok(p, `沒想到的步驟：${s?.roleId} ${s?.status}`);
    if (s.status === 'choose') ok(st(r, 'pick', { ids: p.pick() }));
    else if (s.status === 'decide') ok(st(r, 'decide', { choice: p.decide() }));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: p.fields ? p.fields(s.form) : s.form.truth }));
    else ok(st(r, 'ack'));
  }
  assert.fail('走不到數學家');
}
{
  const r = mk(['mathematician', 'poisoner', 'imp', 'drunk', 'sailor', 'empath', 'fortuneteller', 'slayer', 'recluse', 'soldier']);
  S(r, 'drunk').fakeRole = 'monk';
  // 白天：中毒的獵手打中真惡魔，沒生效（算）
  day(r); poison(r, 'slayer');
  pl(r, 'slayer', 'slay', { targetId: S(r, 'imp').id });
  ok(st(r, 'rule', { work: false }));
  ok(day(r)); // 沒人被處決，入夜
  const id = role => S(r, role).id;
  const f = walk(r, {
    sailor: { pick: () => [id('fortuneteller')], decide: () => id('fortuneteller') }, // 占卜師醉酒
    poisoner: { pick: () => [id('empath')] },
    monk: { pick: () => [id('empath')], decide: () => 'fail' }, // 以為自己是僧侶的酒鬼
    imp: { pick: () => [id('soldier')] }, // 士兵擋下
    empath: { fields: form => ({ n: (form.truth.n + 1) % 3 }) }, // 中毒，給錯（算）
    fortuneteller: { pick: () => [id('recluse'), id('poisoner')] }, // 醉酒，恰好給了真話（不算）
  });
  assert.deepStrictEqual(f.ids, [id('slayer'), id('empath')]);
  assert.deepStrictEqual(f.acted, [it(r, 'poisoner'), it(r, 'sailor'), it(r, 'soldier')], '投毒、水手、擋下惡魔的士兵都生效了');
  assert.deepStrictEqual(f.maybe, [it(r, 'empath', 'empath', true), it(r, 'slayer', 'slayer', true),
    it(r, 'imp'), it(r, 'drunk', 'monk'), it(r, 'fortuneteller')], '算入的在前；被士兵擋下的惡魔、酒鬼、醉酒卻給了真話的占卜師留給說書人');
  assert.ok(!seen(f, r, 'mathematician') && !seen(f, r, 'recluse'), '數學家自己、沒用過能力的人都不列');
}
// 上一個黎明之前的不算：第一夜投過毒的投毒者，第二夜的數學家看不到
{
  const r = mk(['mathematician', 'poisoner', 'imp', 'chef', 'empath', 'monk', 'saint']);
  await runOnly(r, 'poisoner', 1);
  act(r, 'poisoner', [S(r, 'chef').id]);
  r.g.step = null;
  await runOnly(r, 'mathematician', 2);
  assert.ok(!seen(r.g.step.form, r, 'poisoner'));
}
// 中毒的僧侶：保的人沒被殺是「可能失效」（不算），被殺了才算
{
  const r = mk(['imp', 'poisoner', 'monk', 'mathematician', 'empath', 'chef', 'saint']);
  poison(r, 'monk');
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [S(r, 'chef').id]);
  decide(r, 'fail');
  r.g.step = null;
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'empath').id]);
  r.g.step = null;
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(f.maybe, [it(r, 'monk')]);
  assert.deepStrictEqual(f.acted, [it(r, 'imp')]);
}
{
  const r = mk(['imp', 'poisoner', 'monk', 'mathematician', 'empath', 'chef', 'saint']);
  poison(r, 'monk');
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [S(r, 'chef').id]);
  decide(r, 'fail');
  r.g.step = null;
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'chef').id]);
  r.g.step = null;
  await runOnly(r, 'mathematician', 2);
  assert.deepStrictEqual(r.g.step.form.maybe, [it(r, 'monk', 'monk', true)]);
}
// 驅魔人選的不是惡魔：日誌看不出中沒中毒，按現在算。健康的是成功，中毒的留給說書人
for (const bad of [false, true]) {
  const r = mk(['exorcist', 'imp', 'poisoner', 'mathematician', 'empath', 'chef', 'saint'], 'bmr');
  if (bad) poison(r, 'exorcist');
  await runOnly(r, 'exorcist', 2);
  act(r, 'exorcist', [S(r, 'chef').id]);
  r.g.step = null;
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(bad ? f.maybe : f.acted, [it(r, 'exorcist')]);
}
// 投毒者當晚被殺、毒解了，現在看不出來：中著毒用過能力的驅魔人還是可能失效；毒解了以後才醒的管家是成功
for (const role of ['exorcist', 'butler']) {
  const r = mk([role, 'imp', 'poisoner', 'mathematician', 'empath', 'chef', 'saint'], 'bmr');
  const use = async () => { await runOnly(r, role, 2); act(r, role, [S(r, 'chef').id]); r.g.step = null; };
  await runOnly(r, 'poisoner', 2);
  act(r, 'poisoner', [S(r, role).id]);
  r.g.step = null;
  if (role === 'exorcist') await use(); // 驅魔人在惡魔前面醒，管家在後面
  await runOnly(r, 'imp', 2);
  act(r, 'imp', [S(r, 'poisoner').id]);
  r.g.step = null;
  if (role === 'butler') await use();
  assert.ok(S(r, 'poisoner').dead && !r.g.poisoned);
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(role === 'exorcist' ? f.maybe : f.acted.filter(x => x.r === role), [it(r, role)], role);
}
// 白天的能力：女巫的詛咒（裁定記在提名的人身上）算女巫成功；雜耍藝人猜過也算用了能力
{
  const r = mk(['witch', 'vortox', 'mathematician', 'oracle', 'juggler', 'flowergirl', 'saint'], 'snv');
  addEff(r, S(r, 'oracle').id, 'curse', 'witch', 4, S(r, 'witch').id, { live: true });
  day(r);
  ok(pl(r, 'juggler', 'juggle', { targetId: S(r, 'flowergirl').id, role: 'flowergirl' }));
  ok(pl(r, 'oracle', 'nominate', { targetId: S(r, 'saint').id }));
  assert.ok(S(r, 'oracle').dead);
  await runOnly(r, 'mathematician', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(f.acted, [it(r, 'witch'), it(r, 'juggler')]);
  assert.ok(!seen(f, r, 'oracle'), '被詛咒死的人沒有用能力');
}
// 被魔鬼代言人保住、處決沒死：裁定記的是被處決者自己的角色，不算他用了能力
{
  const r = mk(['devilsadvocate', 'imp', 'mathematician', 'chef', 'empath', 'monk', 'saint'], 'bmr');
  addEff(r, S(r, 'chef').id, 'safe', 'devilsadvocate', 4, S(r, 'devilsadvocate').id);
  day(r);
  execute(r, S(r, 'chef'));
  assert.ok(!S(r, 'chef').dead);
  await runOnly(r, 'mathematician', 2);
  assert.ok(!seen(r.g.step.form, r, 'chef'));
}
console.log('數學家統計通過 ✔');
