// 新規則測試：隱士/間諜登記、鎮長替死、傳位、計票時鐘、管家、糾錯操作。用法：node tests/flow.test.js
import assert from 'assert';
import { startNight } from '../lib/engine.js';
import { truthLevel } from '../public/js/infofmt.js';
import { setup, S, ok, act, st, pl, atReview, runOnly } from './helpers.js';
import { applyPlayerAction, applyStOp } from '../lib/ops.js';

const pl2 = (r, role, ids) => applyPlayerAction(r, S(r, role).pid, { act: 'pick', ids });

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
  assert.ok(!r.g.step.decide.options.some(o => o.id === S(r, 'soldier').id), '士兵不能替死');
  ok(st(r, 'decide', { choice: 'none' }));
  assert.ok(!S(r, 'mayor').dead, '無人死亡');
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
// A5 順時針計票：從被提名者的下一位開始；輪到誰誰選，選了立刻輪到下一位；定下的人不能再改；還沒輪到的可以預選
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id });
  ok(st(r, 'startCount'));
  const c = r.nomination.clock;
  assert.strictEqual(c.order[0], S(r, 'soldier').id);
  assert.strictEqual(c.order.at(-1), S(r, 'monk').id);
  ok(pl(r, 'saint', 'vote', { v: 'yes' }));
  ok(pl(r, 'soldier', 'vote', { v: 'yes' }));
  assert.strictEqual(c.k, 0, '全屏提示還沒播完：只是預選，不算輪過');
  c.at = Date.now() - 10; // 跳過全屏提示
  const at = c.at;
  ok(pl(r, 'soldier', 'vote', { v: null }));
  assert.strictEqual(c.k, 0, '取消不算選了');
  ok(pl(r, 'soldier', 'vote', { v: 'yes' }));
  assert.strictEqual(c.k, 1, '輪到自己時點了：立刻輪到下一位');
  assert.ok(c.at > at, '下一位的倒數從現在開始');
  assert.ok(pl(r, 'soldier', 'vote', { v: 'abstain' }), '定下的人不能改');
  ok(pl(r, 'chef', 'vote', { v: 'yes' }));
  assert.strictEqual(c.k, 1, '沒輪到的人只是預選');
  for (const id of c.order.slice(1)) {
    const seat = r.seats.find(s => s.id === id);
    ok(pl(r, seat.role, 'vote', { v: seat.role === 'saint' ? 'abstain' : 'yes' }));
  }
  assert.strictEqual(r.nomination, null, '最後一位選完自動結算');
  assert.strictEqual(r.history.at(-1).count, 5, '聖徒改成棄權，其餘五票');
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
  // 式子裏每個座位帶完整的提示標記（不只中毒）
  const grim = step.form.f[0].grim, chef = grim.find(x => x[0] === S(r, 'chef').id);
  assert.ok(chef[2].tags.includes('紅鯡魚'), '間諜的魔典式子帶紅鯡魚');
}
// A14 沒有占卜師就不分配紅鯡魚；局中途出現占卜師時補一個
{
  const { drawRoles } = await import('../lib/setup.js');
  const { createRoom } = await import('../lib/store.js');
  const { joinPlayer } = await import('../lib/ops.js');
  for (let k = 0; k < 30; k++) {
    const room = createRoom();
    for (let i = 0; i < 8; i++) joinPlayer(room, 'q' + i, 'n' + i);
    assert.strictEqual(drawRoles(room), undefined);
    const ft = room.seats.some(s => s.role === 'fortuneteller' || s.fakeRole === 'fortuneteller');
    assert.strictEqual(!!room.g.redHerring, ft, '紅鯡魚只在有占卜師時分配');
  }
  const r = setup(['washerwoman', 'imp', 'chef', 'soldier', 'saint', 'monk']);
  r.phase = 'day';
  ok(st(r, 'setRole', { seatId: S(r, 'chef').id, roleId: 'fortuneteller' }));
  const rh = r.seats.find(s => s.id === r.g.redHerring);
  assert.ok(rh && rh.role !== 'imp' && rh.role !== 'fortuneteller', '換出占卜師後補紅鯡魚');
}
// A16 夜晚順序表：只有今晚第一格空著時假裝叫醒一分鐘，後面的空格直接跳過；勾了「本局不再假裝」之後都不假裝；玩家的進度條只有劇本順序
{
  const { nightProgress, pretendTick, PRETEND_MS } = await import('../lib/engine.js');
  const { viewFor } = await import('../lib/view.js');
  const r = setup(['empath', 'monk', 'imp', 'poisoner', 'chef', 'saint', 'butler']);
  r.settings.pretend = true;
  r.seats[3].dead = true; // 投毒者死了，今晚不醒：第一格空著
  startNight(r); // 第 2 夜（setup 跳過了首夜）
  const order = r.g.order, step = () => r.g.step;
  assert.deepStrictEqual(order.slice(0, 4), ['poisoner', 'monk', 'imp', 'ravenkeeper'], '按官方順序，不在場的守鴉人也佔一格');
  assert.ok(!order.includes('washerwoman') && !order.includes('chef'), '只在首夜行動的不在第二夜的表裏');
  assert.strictEqual(step().status, 'fake');
  assert.strictEqual(step().roleId, 'poisoner');
  assert.strictEqual(step().why, 'idle');
  const d = step().due - Date.now();
  assert.ok(d > PRETEND_MS - 100 && d <= PRETEND_MS, '停一分鐘');
  assert.ok(pl(r, 'monk', 'pick', { ids: [S(r, 'chef').id] }), '假裝期間誰也不能行動');
  // 玩家：只有角色順序，看不出投毒者不醒；說書人：這一格標成假的
  const pv = viewFor(r, { pid: S(r, 'chef').pid }).prog, sv = viewFor(r, { st: true }).prog;
  assert.deepStrictEqual(pv.order[0], { r: 'poisoner' });
  assert.strictEqual(pv.at, undefined);
  assert.strictEqual(sv.at, 0);
  assert.ok(sv.order[0].fake && !sv.order[1].fake && sv.order[1].seats[0] === S(r, 'monk').id);
  assert.ok(sv.order[3].fake, '不在場的守鴉人');
  // 到點自動往下走
  step().due = Date.now() + 5;
  await new Promise(res => pretendTick(r, () => res()));
  assert.strictEqual(step().roleId, 'monk', '到點自動繼續');
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'saint').id]);
  // 後面的空格（守鴉人、死了的共情者……）不再假裝
  for (let i = 0; i < 40 && !atReview(r); i++) {
    assert.notStrictEqual(step().status, 'fake', '只有第一格假裝');
    if (step().status === 'choose') act(r, r.seats.find(s => s.id === step().seatId).role, [S(r, 'monk').id]);
    else ok(st(r, 'confirm', { fields: step().form.truth }));
  }
  assert.ok(atReview(r));
  assert.strictEqual(nightProgress(r, true).at, order.length);
  // 「本局不再假裝」只是開關：這次的假裝照走（可以關回去），點繼續才往下；之後的夜晚第一格空著也不假裝
  ok(st(r, 'dawn'));
  startNight(r);
  assert.strictEqual(step().status, 'fake');
  ok(st(r, 'noPretend', { on: true }));
  assert.strictEqual(step().status, 'fake', '開關不結束這一次的假裝');
  assert.strictEqual(viewFor(r, { st: true }).st.noPretend, true);
  ok(st(r, 'noPretend', { on: false }));
  assert.strictEqual(viewFor(r, { st: true }).st.noPretend, false);
  ok(st(r, 'noPretend', { on: true }));
  ok(st(r, 'pretend'));
  assert.notStrictEqual(step().status, 'fake');
  for (let i = 0; i < 40 && !atReview(r); i++) {
    const me = step().seatId, other = r.seats.find(s => s.id !== me && !s.dead);
    if (step().status === 'choose') act(r, r.seats.find(s => s.id === me).role, [other.id]);
    else if (step().status === 'decide') ok(st(r, 'decide', { choice: step().decide.options[0].id }));
    else ok(st(r, 'confirm', { fields: step().form.truth }));
  }
  assert.ok(atReview(r));
  ok(st(r, 'dawn'));
  startNight(r);
  assert.notStrictEqual(step().status, 'fake', '本局不再假裝');
}
// A17 首夜表：首夜不行動的角色（小惡魔、僧侶）不出現；爪牙 / 惡魔信息照發，但不佔格
{
  const { createRoom } = await import('../lib/store.js');
  const { joinPlayer } = await import('../lib/ops.js');
  const room = createRoom();
  for (let i = 0; i < 8; i++) joinPlayer(room, 'f' + i, 'n' + i);
  ok(st(room, 'next'));
  const o = room.g.order;
  assert.ok(!o.includes('imp') && !o.includes('monk') && !o.includes('minioninfo') && !o.includes('demoninfo'), o.join());
  assert.ok(o.includes('washerwoman') && o.indexOf('poisoner') === 0, '首夜從投毒者開始');
  const demon = room.seats.find(s => s.role === 'imp');
  assert.ok(room.chat.some(m => m.to === demon.id && m.text.includes('你的爪牙')), '惡魔信息照常發出');
}
// 玩家用完能力：停在結果卡上，說書人確認了才叫下一位；能力已經結算，下一位還沒輪到
{
  const r = setup(['poisoner', 'monk', 'imp', 'chef', 'soldier', 'saint']);
  startNight(r);
  const before = r.g.step.id, target = S(r, 'chef').id;
  assert.strictEqual(r.g.step.roleId, 'poisoner');
  assert.strictEqual(pl2(r, 'poisoner', [target]), undefined);
  assert.strictEqual(r.g.step.status, 'ack');
  assert.strictEqual(r.g.step.result.e.res, 'poison');
  assert.notStrictEqual(r.g.step.id, before, '換一張操作卡');
  assert.strictEqual(r.g.poisoned, target);
  assert.ok(pl2(r, 'monk', [target]), '下一位還沒輪到');
  assert.ok(st(r, 'confirm', { fields: {} }), '只有確認能往下走');
  ok(st(r, 'ack'));
  assert.strictEqual(r.g.step.roleId, 'monk');
  assert.ok(st(r, 'ack'), '不能重複確認');
  // 說書人代選：結果也要看一眼
  ok(applyStOp(r, { op: 'pick', ids: [target] }));
  assert.strictEqual(r.g.step.status, 'ack');
  ok(st(r, 'ack'));
  assert.strictEqual(r.g.step.roleId, 'imp');
}
// 裁定也算說書人看過：小惡魔打鎮長，裁定之後不再確認
{
  const r = setup(['mayor', 'imp', 'chef', 'soldier', 'saint', 'recluse']);
  startNight(r);
  assert.strictEqual(pl2(r, 'imp', [S(r, 'mayor').id]), undefined);
  assert.strictEqual(r.g.step.status, 'decide');
  ok(st(r, 'decide', { choice: S(r, 'saint').id }));
  assert.notStrictEqual(r.g.step.status, 'ack');
}
console.log('新規則測試通過 ✔');
