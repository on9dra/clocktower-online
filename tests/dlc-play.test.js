// 黯月初升 / 夢殞春宵逐個角色試玩時找到的問題（試玩本身走真服務器和 socket，這裏只把修好的規則釘住）。
// 用法：node tests/dlc-play.test.js
import assert from 'assert';
import { applyStOp } from '../lib/ops.js';
import { startNight } from '../lib/engine.js';
import { startDay, nominate, vote, closeVote } from '../lib/day.js';
import { impaired, seatTags } from '../lib/util.js';
import { setup, S, ok, ack } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
const pick = (r, ids, role) => { ok(applyStOp(r, { op: 'pick', ids, role })); ack(r); };
// 往下走到 role 的步驟（不是假裝叫醒、不是結果卡）：別人的選人跳過，信息按真相給（渦流在場給錯的），裁定選最後一項
const answer = f => (!f.vortox ? f.truth : f.kind === 'number' ? { n: (f.truth.n + 1) % (f.max + 1) } : { yes: !f.truth.yes });
function toStep(r, role) {
  for (let k = 0; k < 60; k++) {
    const s = r.g.step;
    if (!s || s.status === 'review' || r.phase !== 'night') return null;
    if (s.roleId === role && !['fake', 'ack'].includes(s.status)) return s;
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
  pick(r, [w.id, S(r, 'chef').id]);
  assert.strictEqual(w.role, 'chef');
  assert.strictEqual(toStep(r, 'towncrier').form.truth.yes, true, '提名時他是爪牙');
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

console.log('dlc play regressions ok');
