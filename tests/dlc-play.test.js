// 黯月初升 / 夢殞春宵逐個角色試玩時找到的問題（試玩本身走真服務器和 socket，這裏只把修好的規則釘住）。
// 用法：node tests/dlc-play.test.js
import assert from 'assert';
import { applyStOp, applyPlayerAction } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { startNight } from '../lib/engine.js';
import { startDay, nominate, vote, closeVote } from '../lib/day.js';
import { impaired, seatTags } from '../lib/util.js';
import { setup, S, ok, ack } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
const pick = (r, ids, role) => { ok(applyStOp(r, { op: 'pick', ids, role })); ack(r); };
// 往下走到 role 的步驟（不是假裝叫醒、不是結果卡）：別人的選人跳過，信息按真相給（渦流在場給錯的），裁定選最後一項
const answer = f => (!f.vortox ? f.truth : f.kind === 'number' ? { n: (f.truth.n + 1) % (f.max + 1) } : { yes: !f.truth.yes });
function toStep(r, role, seat) {
  for (let k = 0; k < 60; k++) {
    const s = r.g.step;
    if (!s || s.status === 'review' || r.phase !== 'night') return null;
    if (s.roleId === role && !['fake', 'ack'].includes(s.status) && (!seat || s.seatId === seat.id)) return s;
    ok(applyStOp(r, s.status === 'ack' ? { op: 'ack' } : s.status === 'decide' ? { op: 'decide', choice: s.decide.options.at(-1).id }
      : s.status === 'confirm' ? { op: 'confirm', fields: answer(s.form) } : s.status === 'fake' ? { op: 'pretend' } : { op: 'skip' }));
  }
  return null;
}
// 白天：from 提名 to，voters 舉手，結算；不處決，直接入夜
function dayVote(r, from, to, voters) {
  startDay(r);
  ok(nominate(r, from, to));
  for (const v of voters) ok(vote(r, v, 'yes'));
  closeVote(r);
  r.g.dayOver = true; r.g.executedToday = 'x'; // 當作今天處決過了，渦流之類不會因此結束遊戲
  ok(applyStOp(r, { op: 'next' }));
  assert.strictEqual(r.phase, 'night');
}

// 哲學家中毒時，被他弄醉的原角色清醒；他恢復後接著醉（官方：哲學家死亡、醉酒或中毒時，那名玩家恢復清醒）
{
  const r = mk(['philosopher', 'chef', 'oracle', 'witch', 'saint', 'vortox', 'empath'], 'snv');
  const ph = r.seats[0], or = S(r, 'oracle');
  startNight(r);
  toStep(r, 'philosopher');
  pick(r, [], 'oracle');
  assert.strictEqual(ph.role, 'oracle');
  assert.ok(impaired(r, or), '原神諭者醉酒');
  ok(applyStOp(r, { op: 'setPoison', seatId: ph.id }));
  assert.ok(!impaired(r, or) && !seatTags(r, or).includes('醉酒'), '哲學家中毒：原神諭者清醒');
  ok(applyStOp(r, { op: 'setPoison', seatId: null }));
  assert.ok(impaired(r, or), '哲學家恢復：原神諭者接著醉');
  ok(applyStOp(r, { op: 'setDead', seatId: ph.id, dead: true }));
  assert.ok(!impaired(r, or), '哲學家死亡：清醒');
}

// 賣花女孩：惡魔白天投過票，夜裏舞蛇人在她醒來之前換走了他的角色，她得知的還是「惡魔投過票」（官方：算原來的惡魔）
{
  const r = mk(['snakecharmer', 'oracle', 'nodashii', 'witch', 'saint', 'empath', 'flowergirl'], 'snv');
  const nd = S(r, 'nodashii');
  dayVote(r, S(r, 'witch'), S(r, 'saint'), [nd]);
  toStep(r, 'snakecharmer');
  pick(r, [nd.id]);
  assert.strictEqual(nd.role, 'snakecharmer');
  assert.strictEqual(toStep(r, 'flowergirl').form.truth.yes, true, '投票的是當時的惡魔');
}
// 反過來：投票的人夜裏被麻臉巫婆變成惡魔，他投票時不是惡魔
{
  const r = mk(['flowergirl', 'oracle', 'pithag', 'nodashii', 'saint', 'empath', 'chef'], 'snv');
  dayVote(r, S(r, 'oracle'), S(r, 'saint'), [S(r, 'chef')]);
  const chef = S(r, 'chef');
  toStep(r, 'pithag');
  pick(r, [chef.id], 'vortox');
  ok(applyStOp(r, { op: 'decide', choice: 'none' }));
  assert.strictEqual(chef.role, 'vortox');
  assert.strictEqual(toStep(r, 'flowergirl').form.truth.yes, false, '他投票時還不是惡魔');
}
// 城鎮公告員：提名的爪牙夜裏被理髮師（惡魔）換成了鎮民，提名時他是爪牙
{
  const r = mk(['towncrier', 'barber', 'witch', 'nodashii', 'saint', 'empath', 'chef'], 'snv');
  const w = S(r, 'witch');
  r.seats[1].dead = true; r.g.barberDue = true; // 理髮師今天死了
  dayVote(r, w, S(r, 'saint'), []);
  const b = toStep(r, 'barber');
  assert.strictEqual(b.seatId, S(r, 'nodashii').id, '惡魔替理髮師選');
  assert.strictEqual(b.turn, false, '理髮師的能力臨時叫醒惡魔：不算惡魔自己的回合，不彈「輪到誰」');
  pick(r, [w.id, S(r, 'chef').id]);
  assert.strictEqual(w.role, 'chef');
  const tc = toStep(r, 'towncrier');
  assert.strictEqual(tc.form.truth.yes, true, '提名時他是爪牙');
  assert.strictEqual(tc.turn, true, '城鎮公告員自己的回合');
}

// 理髮師：亡骨魔把自己換給別人，爪牙鄰居的毒跟著亡骨魔這個角色走（和舞蛇人換到亡骨魔一樣），不會因為原座位沒了角色就解開
{
  const r = mk(['oracle', 'cerenovus', 'dreamer', 'vigormortis', 'barber', 'clockmaker', 'seamstress'], 'snv');
  const vg = S(r, 'vigormortis'), cm = S(r, 'clockmaker'), dr = S(r, 'dreamer'), ce = S(r, 'cerenovus');
  startNight(r);
  toStep(r, 'vigormortis');
  pick(r, [ce.id]);
  ok(applyStOp(r, { op: 'decide', choice: dr.id }));
  assert.ok(impaired(r, dr), '鄰居中毒');
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  ok(applyStOp(r, { op: 'execute', seatId: S(r, 'barber').id }));
  ok(applyStOp(r, { op: 'next' }));
  assert.strictEqual(toStep(r, 'barber').seatId, vg.id);
  pick(r, [vg.id, cm.id]);
  assert.deepStrictEqual([vg.role, cm.role], ['clockmaker', 'vigormortis']);
  assert.ok(impaired(r, dr), '新的亡骨魔能力正常，毒還在');
  ok(applyStOp(r, { op: 'setDead', seatId: cm.id, dead: true }));
  assert.ok(!impaired(r, dr), '新的亡骨魔死了才解毒');
}

// 瘋子以為自己是沙巴洛斯：他每晚在真惡魔之前醒，他選的人不能蓋掉真沙巴洛斯上一晚選的人（反芻的候選）
{
  const r = mk(['professor', 'lunatic', 'shabaloth', 'godfather', 'tinker', 'sailor', 'chambermaid'], 'bmr');
  const lu = S(r, 'lunatic'), sh = S(r, 'shabaloth'), [prof, cm, gf, sailor] = ['professor', 'chambermaid', 'godfather', 'sailor'].map(x => S(r, x));
  lu.fakeRole = 'shabaloth';
  startNight(r);
  toStep(r, 'shabaloth', lu);
  ok(applyStOp(r, { op: 'pick', ids: [gf.id, sailor.id] }));
  ok(applyStOp(r, { op: 'decide', choice: 'fail' }));
  toStep(r, 'shabaloth', sh);
  pick(r, [prof.id, cm.id]);
  assert.ok(prof.dead && cm.dead);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  sailor.dead = true; // 白天別的原因死了，瘋子今晚又選他
  ok(applyStOp(r, { op: 'next' }));
  toStep(r, 'shabaloth', lu);
  ok(applyStOp(r, { op: 'pick', ids: [gf.id, sailor.id] }));
  ok(applyStOp(r, { op: 'decide', choice: 'fail' }));
  const prep = toStep(r, 'shabaloth', sh);
  assert.strictEqual(prep.decide?.kind, 'regurgitate');
  assert.deepStrictEqual(prep.decide.options.map(o => o.id), ['none', prof.id, cm.id], '候選是真沙巴洛斯上一晚選中的人');
}

// 亡骨魔殺死鏡像雙子：雙子保留能力，善良雙子之後被處決照樣邪惡獲勝（官方：死雙子沒有能力，亡骨魔讓爪牙保留能力）
const vigorKill = (r, t) => {
  toStep(r, 'vigormortis');
  pick(r, [t.id]);
  if (r.g.step?.decide?.kind === 'neighbor') ok(applyStOp(r, { op: 'decide', choice: r.g.step.decide.options.at(-1).id }));
  assert.ok(t.dead && t.keep);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
};
{
  const r = mk(['eviltwin', 'oracle', 'dreamer', 'vigormortis', 'sage', 'clockmaker', 'seamstress'], 'snv');
  const et = S(r, 'eviltwin');
  r.g.night = 0; r.g.day = 0;
  startNight(r);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  const good = r.seats.find(s => s.id === r.g.twin.good);
  ok(applyStOp(r, { op: 'next' }));
  vigorKill(r, et);
  ok(applyStOp(r, { op: 'execute', seatId: good.id }));
  assert.deepStrictEqual([r.phase, r.winner], ['ended', 'evil'], '善良雙子被處決，邪惡獲勝');
}
// 亡骨魔失去能力，死雙子保留的能力跟著沒了：善良雙子被處決，遊戲繼續
{
  const r = mk(['eviltwin', 'oracle', 'dreamer', 'vigormortis', 'sage', 'clockmaker', 'seamstress'], 'snv');
  const et = S(r, 'eviltwin'), vg = S(r, 'vigormortis');
  r.g.night = 0; r.g.day = 0;
  startNight(r);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  const good = r.seats.find(s => s.id === r.g.twin.good);
  ok(applyStOp(r, { op: 'next' }));
  vigorKill(r, et);
  ok(applyStOp(r, { op: 'setPoison', seatId: vg.id }));
  ok(applyStOp(r, { op: 'execute', seatId: good.id }));
  assert.strictEqual(r.phase, 'day', '亡骨魔中毒：雙子沒有能力');
}
// 麻臉巫婆把亡骨魔保留能力的死女巫變成神諭者：換了角色就沒有能力，不會再醒（官方麻臉巫婆例子）
{
  const r = mk(['witch', 'pithag', 'dreamer', 'vigormortis', 'sage', 'clockmaker', 'seamstress'], 'snv');
  const wi = S(r, 'witch');
  startNight(r);
  vigorKill(r, wi);
  ok(applyStOp(r, { op: 'next' }));
  toStep(r, 'pithag');
  pick(r, [wi.id], 'oracle');
  assert.strictEqual(wi.role, 'oracle');
  assert.strictEqual(toStep(r, 'oracle', wi), null, '死掉的前女巫不會以神諭者身份醒來');
}

// 理髮師：惡魔把築夢師和神諭者換了，兩人換到的角色順序在理髮師後面，今晚按新角色醒（以前兩個都不醒）
{
  const r = mk(['dreamer', 'barber', 'witch', 'nodashii', 'oracle', 'clockmaker', 'seamstress'], 'snv');
  const dr = S(r, 'dreamer'), or = S(r, 'oracle');
  startNight(r);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  ok(applyStOp(r, { op: 'execute', seatId: S(r, 'barber').id }));
  ok(applyStOp(r, { op: 'next' }));
  toStep(r, 'barber');
  pick(r, [dr.id, or.id]);
  assert.deepStrictEqual([dr.role, or.role], ['oracle', 'dreamer']);
  assert.ok(toStep(r, 'dreamer', or), '新的築夢師今晚醒');
  ok(applyStOp(r, { op: 'pick', ids: [S(r, 'nodashii').id] }));
  ok(applyStOp(r, { op: 'confirm', fields: r.g.step.form.truth }));
  assert.ok(toStep(r, 'oracle', dr), '新的神諭者今晚醒');
}

// 哲學家第 2 夜才拿雜耍藝人的能力：他的第一個白天是第 2 天，第 3 夜得知猜對幾個（以前只認第 1 天、第 2 夜，永遠猜不了）
{
  const r = mk(['philosopher', 'oracle', 'dreamer', 'nodashii', 'witch', 'clockmaker', 'seamstress'], 'snv');
  const ph = S(r, 'philosopher'), nd = S(r, 'nodashii');
  r.g.day = 1; // 真實對局裏第 2 夜之前過了第 1 天
  startNight(r);
  toStep(r, 'philosopher');
  pick(r, [], 'juggler');
  assert.strictEqual(toStep(r, 'juggler', ph), null, '今晚不醒：還沒有猜過');
  ok(applyStOp(r, { op: 'dawn' }));
  assert.strictEqual(viewFor(r, { pid: ph.pid }).juggleLeft, 5);
  ok(applyPlayerAction(r, ph.pid, { act: 'juggle', targetId: nd.id, role: 'nodashii' }));
  ok(applyPlayerAction(r, ph.pid, { act: 'juggle', targetId: S(r, 'oracle').id, role: 'witch' }));
  ok(applyStOp(r, { op: 'execute', seatId: S(r, 'clockmaker').id }));
  ok(applyStOp(r, { op: 'next' }));
  assert.strictEqual(viewFor(r, { pid: ph.pid }).juggleLeft, 0);
  const s = toStep(r, 'juggler', ph);
  assert.ok(s, '第 3 夜醒來');
  assert.strictEqual(s.form.truth.n, 1);
}
// 開局就是雜耍藝人的照舊：只在第 1 天猜，第 2 夜得知
{
  const r = mk(['juggler', 'oracle', 'dreamer', 'nodashii', 'witch', 'clockmaker', 'seamstress'], 'snv');
  const j = S(r, 'juggler');
  r.g.day = 1;
  startNight(r);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  assert.strictEqual(r.g.day, 2);
  assert.strictEqual(applyPlayerAction(r, j.pid, { act: 'juggle', targetId: S(r, 'nodashii').id, role: 'nodashii' }), '只能在第一個白天猜');
}
// 死了的雜耍藝人不再顯示「公開猜」（服務端本來就不收）
{
  const r = mk(['juggler', 'oracle', 'dreamer', 'nodashii', 'witch', 'clockmaker', 'seamstress'], 'snv');
  const j = S(r, 'juggler');
  r.g.night = 0; r.g.day = 0;
  startNight(r);
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  assert.strictEqual(viewFor(r, { pid: j.pid }).juggleLeft, 5);
  ok(applyStOp(r, { op: 'execute', seatId: j.id }));
  assert.strictEqual(viewFor(r, { pid: j.pid }).juggleLeft, 0);
}

// 麻臉巫婆變出鏡像雙子：當場互認一次。以前還會在雙子的首夜位置再配一次，對手可能換人，兩名邪惡玩家都以為自己是雙子
{
  const r = mk(['pithag', 'oracle', 'dreamer', 'nodashii', 'flowergirl', 'clockmaker', 'seamstress', 'savant'], 'snv');
  const fg = S(r, 'flowergirl');
  startNight(r);
  toStep(r, 'pithag');
  pick(r, [fg.id], 'eviltwin');
  toStep(r, 'none');
  const told = r.chat.filter(m => m.src === 'eviltwin' && m.night === 2 && /雙子是|是鏡像雙子/.test(m.text));
  assert.strictEqual(told.length, 2, '雙子和對手各收到一次');
  assert.ok(told.some(m => m.to === r.g.twin.evil), '收到的對手就是記錄的那一位');
}

// 哲學家拿了不在場的賢者：他還是哲學家，賢者不算在場。麻臉巫婆之後變出賢者能成功，新賢者醉酒；變出哲學家則無事發生
{
  const r = mk(['philosopher', 'oracle', 'dreamer', 'nodashii', 'pithag', 'clockmaker', 'seamstress', 'savant'], 'snv');
  const ph = S(r, 'philosopher'), or = S(r, 'oracle'), sv = S(r, 'savant');
  r.g.night = 0; r.g.day = 0;
  startNight(r);
  toStep(r, 'philosopher');
  pick(r, [], 'sage');
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  ok(applyStOp(r, { op: 'next' }));
  toStep(r, 'pithag');
  pick(r, [or.id], 'sage');
  assert.strictEqual(or.role, 'sage', '賢者不在場，變得出來');
  assert.ok(impaired(r, or), '新賢者醉酒');
  ok(applyStOp(r, { op: 'setPoison', seatId: ph.id }));
  assert.ok(!impaired(r, or), '哲學家中毒時清醒');
  ok(applyStOp(r, { op: 'setPoison', seatId: null }));
  toStep(r, 'none');
  ok(applyStOp(r, { op: 'dawn' }));
  ok(applyStOp(r, { op: 'next' }));
  toStep(r, 'pithag');
  pick(r, [sv.id], 'philosopher');
  assert.strictEqual(sv.role, 'savant', '哲學家在場：無事發生');
}

// 珀醉酒時不選人（蓄力）：自己看到的蓄力演出和健康時一樣，以為自己是珀的瘋子也一樣（以前只有健康的珀有，等於告訴他中毒了）
{
  const r = mk(['po', 'lunatic', 'gossip', 'moonchild', 'tealady', 'fool', 'assassin', 'minstrel', 'sailor'], 'bmr');
  const po = S(r, 'po'), lu = S(r, 'lunatic');
  lu.fakeRole = 'po';
  ok(applyStOp(r, { op: 'setPoison', seatId: po.id }));
  startNight(r);
  const charged = seat => r.fx.some(e => e.aud === seat.id && e.k === 'act' && e.charge);
  toStep(r, 'po', lu);
  ok(applyStOp(r, { op: 'pick', ids: [] }));
  ok(applyStOp(r, { op: 'decide', choice: 'fail' }));
  assert.ok(charged(lu), '瘋子蓄力有演出');
  r.g.poisoned = po.id;
  toStep(r, 'po', po);
  ok(applyStOp(r, { op: 'pick', ids: [] }));
  assert.strictEqual(r.g.step.decide?.kind, 'ability');
  ok(applyStOp(r, { op: 'decide', choice: 'fail' }));
  assert.ok(charged(po), '中毒的珀蓄力有演出');
}

console.log('dlc play regressions ok');
