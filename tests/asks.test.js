// 線下多設備：玩家在手機上發起提名 / 開槍 / 雜耍藝人猜 / 死後選人，變成給說書人的請求（lib/asks.js）。用法：node tests/asks.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer, undoOf } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { ok, st } from './helpers.js';

process.env.BOTC_DEBUG = '1';
const { botStep, setPresence } = await import('../lib/debug.js');

const ROLES = ['imp', 'poisoner', 'chef', 'empath', 'slayer', 'juggler', 'saint'];
// 多設備線下局，按座位發角色，跳過首夜，停在第一個白天
function game(roles = ROLES, devices = 'many') {
  const r = createRoom();
  r.settings.pretend = false;
  if (devices === 'many') for (let i = 0; i < roles.length; i++) joinPlayer(r, 'p' + i, 'n' + i);
  ok(st(r, 'venue', { venue: 'offline', devices }));
  if (devices === 'one') ok(st(r, 'seatCount', { n: roles.length }));
  ok(st(r, 'next'));
  r.seats.forEach((s, i) => Object.assign(s, { role: roles[i], fakeRole: null }));
  Object.assign(r.g, { redHerring: null, queue: [], step: null });
  r.phase = 'dawn';
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'day');
  return r;
}
const P = (r, i, act, args = {}) => applyPlayerAction(r, 'p' + i, { act, ...args });
const id = (r, i) => r.seats[i].id;
const asks = r => r.g.asks || [];
const done = (r, askId) => r.g.askDone?.find(d => d.id === askId);

// 提名：變成請求，不直接進審判；同一人同一類只留一條，改了對象排隊位置不變；說書人受理才進審判
{
  const r = game();
  ok(P(r, 2, 'nominate', { targetId: id(r, 0) }));
  assert.strictEqual(r.nomination, null, '玩家的提名不直接生效');
  assert.strictEqual(asks(r).length, 1);
  const a = asks(r)[0];
  assert.deepStrictEqual([a.kind, a.from, a.to], ['nom', id(r, 2), id(r, 0)]);
  ok(P(r, 3, 'nominate', { targetId: id(r, 1) }));
  ok(P(r, 2, 'nominate', { targetId: id(r, 1) })); // 改主意：換成提名 2 號
  assert.strictEqual(asks(r).length, 2);
  const b = asks(r)[0];
  assert.notStrictEqual(b.id, a.id, '改了對象是新的一條（說書人開著的舊卡會收起）');
  assert.deepStrictEqual([b.from, b.to, b.at], [id(r, 2), id(r, 1), a.at], '排隊的位置不變');
  ok(P(r, 2, 'nominate', { targetId: id(r, 1) }));
  assert.strictEqual(asks(r)[0].id, b.id, '一樣的請求不重複');
  // 只有自己和說書人看得到
  assert.deepStrictEqual(viewFor(r, { pid: 'p2' }).asks.list.map(x => x.id), [b.id]);
  assert.deepStrictEqual(viewFor(r, { pid: 'p4' }).asks.list, []);
  assert.deepStrictEqual(viewFor(r, { st: true }).st.asks.list.map(x => x.from), [id(r, 2), id(r, 3)], '說書人按先後看到全部');
  // 說書人受理：照常提名，同時 3 號提名 2 號的那條作廢（2 號今天被提名過了）
  ok(st(r, 'nominate', { ask: b.id, toId: b.to }));
  assert.deepStrictEqual([r.nomination.nominatorId, r.nomination.nomineeId], [id(r, 2), id(r, 1)]);
  assert.strictEqual(done(r, b.id).res, 'ok');
  assert.strictEqual(asks(r).length, 0);
  const v = r.g.askDone.find(d => d.from === id(r, 3));
  assert.deepStrictEqual([v.res, v.why], ['void', '他今天已經被提名過了']);
  assert.deepStrictEqual(viewFor(r, { pid: 'p2' }).asks.done.map(d => d.res), ['ok'], '手機上看得到結果');
  assert.strictEqual(viewFor(r, { pid: 'p2' }).asks.done[0].why, null);
  console.log('提名請求 ✔');
}

// 審判中、裁定中：照樣可以提出，排著；說書人那邊受理不了（說原因）；說書人改對象、駁回、玩家撤回
{
  const r = game();
  ok(st(r, 'nominate', { fromId: id(r, 6), toId: id(r, 0) })); // 說書人替 7 號提名 1 號（老入口還在）
  ok(P(r, 2, 'nominate', { targetId: id(r, 3) }));
  const a = asks(r)[0];
  assert.match(st(r, 'nominate', { ask: a.id, toId: a.to }), /投票/, '審判中受理不了');
  assert.strictEqual(asks(r).length, 1, '還排著');
  assert.strictEqual(typeof P(r, 2, 'nominate', { targetId: id(r, 0) }), 'string', '1 號今天被提名過了：不能提');
  assert.strictEqual(typeof P(r, 6, 'nominate', { targetId: id(r, 3) }), 'string', '7 號今天提名過了：不能提');
  ok(st(r, 'cancelVote'));
  // 說書人改對象：提名 5 號
  ok(st(r, 'nominate', { ask: a.id, toId: id(r, 4) }));
  assert.strictEqual(r.nomination.nomineeId, id(r, 4));
  ok(st(r, 'cancelVote'));
  // 駁回
  ok(P(r, 3, 'nominate', { targetId: id(r, 5) }));
  const b = asks(r).at(-1);
  ok(st(r, 'askNo', { ask: b.id }));
  assert.strictEqual(done(r, b.id).res, 'no');
  assert.strictEqual(r.nomination, null);
  // 撤回
  ok(P(r, 3, 'nominate', { targetId: id(r, 5) }));
  const c = asks(r).at(-1);
  assert.strictEqual(typeof P(r, 2, 'unask', { id: c.id }), 'string', '別人的請求撤不了');
  ok(P(r, 3, 'unask', { id: c.id }));
  assert.strictEqual(done(r, c.id).res, 'drop');
  assert.match(st(r, 'nominate', { ask: c.id, toId: c.to }), /不在/, '撤回了的受理不了');
  // 說書人自己從桌心替他提名了同一件事：他的請求算受理
  ok(P(r, 3, 'nominate', { targetId: id(r, 5) }));
  const d = asks(r).at(-1);
  ok(st(r, 'nominate', { fromId: id(r, 3), toId: id(r, 5) }));
  assert.strictEqual(done(r, d.id).res, 'ok');
  console.log('審判中排隊、改對象、駁回、撤回 ✔');
}

// 自己提名自己；死了不能提；天黑全部作廢
{
  const r = game();
  ok(P(r, 1, 'nominate', { targetId: id(r, 1) }));
  ok(P(r, 2, 'nominate', { targetId: id(r, 1) }));
  ok(st(r, 'nominate', { ask: asks(r)[1].id, toId: id(r, 1) }));
  assert.strictEqual(r.g.askDone.find(x => x.from === id(r, 1)).why, '你今天已經被提名過了', '提名自己的那條：原因寫「你」');
  ok(st(r, 'cancelVote'));
  ok(st(r, 'setDead', { seatId: id(r, 3), dead: true }));
  assert.strictEqual(P(r, 3, 'nominate', { targetId: id(r, 0) }), '死亡玩家不能提名');
  ok(P(r, 4, 'nominate', { targetId: id(r, 0) }));
  ok(P(r, 4, 'slay', { targetId: id(r, 0) }));
  ok(st(r, 'next')); // 結束白天
  assert.notStrictEqual(r.phase, 'day');
  assert.strictEqual(asks(r).length, 0);
  assert.ok(r.g.askDone.filter(x => x.from === id(r, 4)).every(x => x.res === 'void' && x.why === '白天結束了'));
  console.log('自己提名、死人、天黑作廢 ✔');
}

// 開槍：請求；受理進裁定；裁定中排著；誰都可以宣稱；今天開過槍不能再提
{
  const r = game();
  ok(P(r, 2, 'slay', { targetId: id(r, 0) })); // 廚師也可以宣稱
  ok(P(r, 4, 'slay', { targetId: id(r, 0) }));
  assert.strictEqual(r.g.ruling, null, '玩家的開槍不直接生效');
  const [a, b] = asks(r);
  ok(st(r, 'slayFor', { ask: b.id, toId: b.to }));
  assert.deepStrictEqual([r.g.ruling.kind, r.g.ruling.seatId, r.g.ruling.to], ['slayer', id(r, 4), id(r, 0)]);
  ok(P(r, 3, 'nominate', { targetId: id(r, 0) })); // 裁定中也能提
  assert.match(st(r, 'slayFor', { ask: a.id, toId: a.to }), /裁定/);
  ok(st(r, 'rule', { work: true }));
  assert.ok(r.phase === 'ended' || r.seats[0].dead, '真獵手打中小惡魔');
  console.log('開槍請求 ✔');
}
{
  const r = game();
  ok(P(r, 2, 'slay', { targetId: id(r, 1) }));
  ok(st(r, 'slayFor', { ask: asks(r)[0].id, toId: id(r, 1) }));
  ok(st(r, 'rule', { work: false }));
  assert.strictEqual(P(r, 2, 'slay', { targetId: id(r, 3) }), '你今天已經開過槍了');
  console.log('一天一槍 ✔');
}

// 雜耍藝人：一個個加猜測，合成一條；同一個人再猜換掉；連受理前的一起最多五個；說書人可以改；一口氣記上
{
  const r = game();
  const J = 5;
  assert.strictEqual(viewFor(r, { pid: 'p5' }).juggleLeft, 5, '線下多設備的雜耍藝人也有「還能猜幾次」');
  ok(P(r, J, 'juggle', { targetId: id(r, 0), role: 'imp' }));
  ok(P(r, J, 'juggle', { targetId: id(r, 1), role: 'spy' }));
  ok(P(r, J, 'juggle', { targetId: id(r, 1), role: 'poisoner' })); // 換掉
  assert.strictEqual(asks(r).length, 1);
  assert.deepStrictEqual(asks(r)[0].guesses.map(g => g.role), ['imp', 'poisoner']);
  assert.strictEqual(viewFor(r, { pid: 'p5' }).juggleLeft, 3, '排著的也算用掉');
  for (const i of [2, 3, 4]) ok(P(r, J, 'juggle', { targetId: id(r, i), role: 'chef' }));
  assert.strictEqual(P(r, J, 'juggle', { targetId: id(r, 6), role: 'saint' }), '最多猜五次');
  assert.strictEqual(typeof P(r, 2, 'juggle', { targetId: id(r, 6), role: 'saint' }), 'string', '不是雜耍藝人不能猜');
  // 撤回其中一個
  ok(P(r, J, 'unask', { id: asks(r)[0].id, seatId: id(r, 4) }));
  assert.strictEqual(asks(r)[0].guesses.length, 4);
  const a = asks(r)[0];
  // 說書人改：只認前三個
  ok(st(r, 'juggleFor', { ask: a.id, guesses: a.guesses.slice(0, 3) }));
  assert.strictEqual(r.g.juggle[id(r, J)].length, 3);
  assert.strictEqual(done(r, a.id).res, 'ok');
  assert.strictEqual(viewFor(r, { pid: 'p5' }).juggleLeft, 2);
  // 再提兩個可以，三個不行
  ok(P(r, J, 'juggle', { targetId: id(r, 2), role: 'chef' }));
  ok(P(r, J, 'juggle', { targetId: id(r, 3), role: 'empath' }));
  assert.strictEqual(P(r, J, 'juggle', { targetId: id(r, 4), role: 'chef' }), '最多猜五次');
  console.log('雜耍藝人請求 ✔');
}

// 月之子 / 呆瓜：死後手機上彈選人牌，選了是請求；說書人照著確認，也可以改
{
  const r = game(['imp', 'poisoner', 'chef', 'empath', 'slayer', 'moonchild', 'saint']);
  const M = 5;
  ok(st(r, 'nominate', { fromId: id(r, 2), toId: id(r, M) }));
  for (const s of r.seats) ok(st(r, 'handVote', { seatId: s.id, v: 'yes' }));
  ok(st(r, 'next')); // 結束白天：月之子被處決，等他選
  assert.strictEqual(r.phase, 'day');
  const pr = viewFor(r, { pid: 'p5' }).prompt;
  assert.ok(pr && pr.ask && pr.roleId === 'moonchild', '手機上有選人牌，選了是請求');
  assert.strictEqual(typeof P(r, M, 'pick', { ids: [id(r, M)] }), 'string', '不能選自己');
  ok(P(r, M, 'pick', { ids: [id(r, 3)] }));
  assert.strictEqual(viewFor(r, { pid: 'p5' }).prompt, null, '提出以後選人牌收起');
  assert.strictEqual(r.phase, 'day', '說書人確認前不會入夜');
  const a = asks(r)[0];
  assert.deepStrictEqual([a.kind, a.to], ['word', id(r, 3)]);
  ok(st(r, 'word', { ask: a.id, seatId: id(r, M), targetId: id(r, 3) }));
  assert.strictEqual(r.g.moonchildPick, id(r, 3));
  assert.strictEqual(done(r, a.id).res, 'ok');
  assert.strictEqual(r.phase, 'night', '選完入夜');
  console.log('月之子請求 ✔');
}

// 撤銷：受理以後撤銷，請求回到排隊；別的操作之後玩家新提的、撤回的，撤銷那一步時不跟著退
{
  const r = game();
  ok(P(r, 2, 'nominate', { targetId: id(r, 0) }));
  const a = asks(r)[0];
  ok(st(r, 'nominate', { ask: a.id, toId: a.to }));
  assert.strictEqual(undoOf(r), 'nominate');
  ok(st(r, 'undo'));
  assert.strictEqual(r.nomination, null);
  assert.deepStrictEqual(asks(r).map(x => x.id), [a.id], '受理撤銷了：請求回到排隊');
  assert.ok(!done(r, a.id), '結果也退掉了');
  // 說書人做了一步，之後 4 號提出、3 號撤回；撤銷那一步：4 號的還在，3 號的不復活
  ok(st(r, 'setDead', { seatId: id(r, 6), dead: true }));
  ok(P(r, 3, 'slay', { targetId: id(r, 1) }));
  ok(P(r, 2, 'unask', { id: a.id }));
  ok(st(r, 'undo'));
  assert.ok(!r.seats[6].dead);
  assert.deepStrictEqual(asks(r).map(x => [x.from, x.kind]), [[id(r, 3), 'slay']]);
  assert.strictEqual(done(r, a.id)?.res, 'drop');
  // 駁回也能撤銷
  const b = asks(r)[0];
  ok(st(r, 'askNo', { ask: b.id }));
  ok(st(r, 'undo'));
  assert.deepStrictEqual(asks(r).map(x => x.id), [b.id]);
  // 撤銷一步讓請求重新成立 / 不成立：當場重新驗
  ok(P(r, 4, 'nominate', { targetId: id(r, 6) }));
  ok(st(r, 'nominate', { fromId: id(r, 0), toId: id(r, 6) }));
  assert.strictEqual(r.g.askDone.at(-1).res, 'void');
  ok(st(r, 'undo'));
  assert.ok(asks(r).some(x => x.from === id(r, 4) && x.kind === 'nom'), '撤銷了那次提名：被它作廢的請求回來了');
  console.log('撤銷 ✔');
}

// 線上、單設備不受影響
{
  const r = createRoom();
  for (let i = 0; i < 7; i++) joinPlayer(r, 'p' + i, 'n' + i);
  ok(st(r, 'next'));
  r.seats.forEach((s, i) => Object.assign(s, { role: ROLES[i], fakeRole: null }));
  Object.assign(r.g, { redHerring: null, queue: [], step: null });
  r.phase = 'dawn';
  ok(st(r, 'next'));
  ok(P(r, 2, 'nominate', { targetId: id(r, 0) }));
  assert.ok(r.nomination, '線上直接提名');
  assert.ok(!r.g.asks?.length);
  assert.strictEqual(viewFor(r, { pid: 'p2' }).asks, null);
  assert.strictEqual(viewFor(r, { st: true }).st.asks, null);
  assert.strictEqual(P(r, 2, 'unask', { id: 'x' }), '未知操作');
  const one = game(ROLES, 'one');
  assert.strictEqual(viewFor(one, { st: true }).st.asks, null);
  console.log('線上、單設備不受影響 ✔');
}

// 調試：說書人代入一個座位、代班說書人主持——座位上提出的請求照單受理，審判中等它結束；月之子等他自己在手機上選
{
  const r = game();
  r.debug = true;
  const me = r.seats[2];
  setPresence(r, [me.id], false);
  ok(applyPlayerAction(r, me.pid, { act: 'nominate', targetId: id(r, 0) }));
  assert.ok(botStep(r));
  assert.strictEqual(r.nomination?.nominatorId, me.id, '代班說書人受理了提名');
  ok(applyPlayerAction(r, me.pid, { act: 'slay', targetId: id(r, 1) }));
  for (let k = 0; k < 10 && r.nomination; k++) botStep(r) || (r.nomination.at -= 60000);
  assert.strictEqual(r.nomination, null, '投票結束了');
  assert.ok(botStep(r));
  assert.ok(r.g.ruling || r.g.shotLog?.length, '審判結束後受理了開槍');
  console.log('調試代班說書人 ✔');
}
