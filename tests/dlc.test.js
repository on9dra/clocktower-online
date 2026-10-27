// 黯月初升 / 夢殞春宵的關鍵規則。用法：node tests/dlc.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { startNight, run } from '../lib/engine.js';
import { startDay, nominate } from '../lib/day.js';
import { execute } from '../lib/rules.js';
import { impaired, isEvil, alignOf } from '../lib/util.js';
import { teamCounts } from '../public/js/roles.js';
import { truthLevel } from '../public/js/infofmt.js';
import { setup, S, act, st, ok, atReview } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
const pick = (r, role, ids, roleId) => ok(applyStOp(r, { op: 'pick', ids, role: roleId }));
// 走完夜晚剩下的步驟：要選人的隨便選第一個合規的，信息按真相給
// until：停在這個角色的步驟上（不替他選）
function finish(r, until) {
  for (let i = 0; i < 40 && !atReview(r); i++) {
    const step = r.g.step;
    if (until && step.roleId === until) return;
    if (step.status === 'choose') {
      const c = step.choose, counts = c.counts || [c.count];
      const pool = r.seats.filter(s => !(c.notSelf && s.id === step.seatId) && !(c.alive && s.dead) && !(c.dead && !s.dead));
      ok(applyStOp(r, { op: 'pick', ids: pool.slice(0, Math.min(...counts)).map(s => s.id), role: c.roles && !c.roleOptional ? c.roles[0] : null }));
    } else if (step.status === 'decide') ok(applyStOp(r, { op: 'decide', choice: step.decide.options.at(-1).id }));
    else {
      const f = step.form, t = f.truth; // 渦流在場給錯的
      ok(applyStOp(r, { op: 'confirm', fields: !f.vortox ? t : f.kind === 'number' ? { n: (t.n + 1) % (f.max + 1) } : { yes: !t.yes } }));
    }
  }
}

// 劇本切換、外來者增減
{
  const r = createRoom();
  for (let i = 0; i < 8; i++) joinPlayer(r, 'p' + i, 'n' + i);
  ok(st(r, 'script', { scriptId: 'snv' }));
  assert.strictEqual(r.scriptId, 'snv');
  assert.deepStrictEqual(teamCounts(8, ['fanggu']), { townsfolk: 4, outsider: 2, minion: 1, demon: 1 });
  assert.deepStrictEqual(teamCounts(8, ['vigormortis']), { townsfolk: 6, outsider: 0, minion: 1, demon: 1 });
  assert.deepStrictEqual(teamCounts(7, ['godfather'], { godfather: -1 }), { townsfolk: 5, outsider: 0, minion: 1, demon: 1 }, '外來者不減成負數');
  ok(st(r, 'roleRule', { roleId: 'fanggu', rule: 'lock' }));
  ok(st(r, 'draft'));
  const c = r.seats.reduce((m, s) => (m[s.role] = 1, m), {});
  assert.ok(c.fanggu, '必選的方古在場');
  assert.strictEqual(r.seats.filter(s => ['mutant', 'sweetheart', 'barber', 'klutz'].includes(s.role)).length, 2, '方古 +1 外來者');
  ok(st(r, 'next'));
  assert.ok(st(r, 'script', { scriptId: 'bmr' }), '遊戲中不能換劇本');
}

// 茶藝師：兩邊鄰座都善良時，鄰座不會被惡魔殺死；弄臣首次不死；水手不死
{
  const r = mk(['chef', 'tealady', 'fool', 'imp', 'poisoner', 'sailor'], 'bmr');
  startNight(r);
  pick(r, 'sailor', [S(r, 'sailor').id]);
  act(r, 'poisoner', [S(r, 'imp').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(S(r, 'chef').dead, false, '茶藝師保護鄰座');
}
{
  const r = mk(['chef', 'fool', 'imp', 'poisoner', 'sailor', 'saint'], 'bmr');
  startNight(r);
  pick(r, 'sailor', [S(r, 'chef').id]);
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'fool').id]);
  assert.strictEqual(S(r, 'fool').dead, false, '弄臣第一次不死');
  r.phase = 'dawn'; startNight(r);
  pick(r, 'sailor', [S(r, 'chef').id]);
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'sailor').id]);
  assert.strictEqual(S(r, 'sailor').dead, false, '清醒的水手不死');
  r.phase = 'dawn'; startNight(r);
  pick(r, 'sailor', [S(r, 'chef').id]);
  ok(st(r, 'decide', { choice: S(r, 'sailor').id }));
  act(r, 'poisoner', [S(r, 'saint').id]);
  assert.ok(impaired(r, S(r, 'sailor')), '水手選擇自己醉酒');
  act(r, 'imp', [S(r, 'sailor').id]);
  assert.strictEqual(S(r, 'sailor').dead, true, '醉酒的水手會死');
}

// 旅店老闆：保護兩人，說書人選一人醉酒
{
  const r = mk(['innkeeper', 'chef', 'imp', 'godfather', 'saint', 'tinker'], 'bmr');
  startNight(r);
  pick(r, 'innkeeper', [S(r, 'chef').id, S(r, 'saint').id]);
  assert.strictEqual(r.g.step.decide.kind, 'drunk');
  ok(st(r, 'decide', { choice: S(r, 'saint').id }));
  assert.ok(impaired(r, S(r, 'saint')), '被選中的人醉酒');
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(S(r, 'chef').dead, false, '被旅店老闆保護');
}

// 僵怖：第一次被處決看起來死了但還活著，遊戲繼續；今天有人死，僵怖今晚不醒
{
  const r = mk(['chef', 'zombuul', 'godfather', 'saint', 'tinker', 'fool'], 'bmr');
  startDay(r);
  execute(r, S(r, 'zombuul'));
  assert.strictEqual(r.phase, 'day', '遊戲沒有結束');
  assert.ok(S(r, 'zombuul').dead && S(r, 'zombuul').undead, '假死');
  r.phase = 'dawn'; startNight(r);
  assert.ok(!r.g.queue.some(q => q.roleId === 'zombuul') && r.g.step?.roleId !== 'zombuul', '今天有人死，僵怖不醒');
  r.phase = 'dawn'; startDay(r);
  execute(r, S(r, 'zombuul'));
  assert.strictEqual(r.winner, 'good', '第二次死亡才真的死');
}

// 普卡：今晚中毒，下一晚死亡
{
  const r = mk(['chef', 'pukka', 'godfather', 'saint', 'tinker', 'fool'], 'bmr');
  startNight(r);
  act(r, 'pukka', [S(r, 'chef').id]);
  assert.ok(impaired(r, S(r, 'chef')));
  finish(r);
  r.phase = 'dawn'; startNight(r);
  act(r, 'pukka', [S(r, 'saint').id]);
  assert.strictEqual(S(r, 'chef').dead, true, '上一個中毒的人死亡');
  assert.ok(!impaired(r, S(r, 'chef')) && impaired(r, S(r, 'saint')));
}

// 珀：不選人蓄力，下次殺三人
{
  const r = mk(['chef', 'po', 'godfather', 'saint', 'tinker', 'fool', 'gossip', 'minstrel'], 'bmr');
  startNight(r);
  act(r, 'po', []);
  finish(r);
  r.phase = 'dawn'; startNight(r);
  finish(r, 'po');
  assert.strictEqual(r.g.step.choose.count, 3);
  act(r, 'po', [S(r, 'chef').id, S(r, 'saint').id, S(r, 'gossip').id]);
  assert.ok(['chef', 'saint', 'gossip'].every(x => S(r, x).dead), '殺三人');
}

// 驅魔人：選中惡魔，惡魔今晚不醒並得知驅魔人
{
  const r = mk(['exorcist', 'imp', 'godfather', 'saint', 'chef', 'fool'], 'bmr');
  startNight(r);
  pick(r, 'exorcist', [S(r, 'imp').id]);
  assert.ok(r.chat.some(m => m.to === S(r, 'imp').id && m.text.includes('驅魔人')));
  finish(r);
  assert.ok(!r.g.log.some(l => l.e?.src === 'imp' && l.night === r.g.night && l.e.k === 'act'), '惡魔沒有行動');
  assert.ok(r.seats.every(s => !s.dead));
}

// 莽夫：第一個選中他的人醉酒，莽夫轉為那人的陣營
{
  const r = mk(['chef', 'imp', 'poisoner', 'goon', 'saint', 'fool'], 'bmr');
  startNight(r);
  act(r, 'poisoner', [S(r, 'goon').id]);
  assert.ok(impaired(r, S(r, 'poisoner')), '投毒者醉酒');
  assert.ok(!impaired(r, S(r, 'goon')), '毒沒有生效');
  assert.ok(isEvil(S(r, 'goon')), '莽夫變邪惡');
}

// 方古：殺外來者時他變成方古，原方古死亡
{
  const r = mk(['chef', 'fanggu', 'witch', 'klutz', 'saint', 'oracle'], 'snv');
  startNight(r);
  act(r, 'witch', [S(r, 'chef').id]);
  const klutz = S(r, 'klutz'), fg = S(r, 'fanggu');
  act(r, 'fanggu', [klutz.id]);
  assert.strictEqual(klutz.role, 'fanggu');
  assert.ok(isEvil(klutz) && fg.dead && !klutz.dead);
}

// 渦流：鎮民信息必須是錯的；白天沒人被處決邪惡獲勝
{
  const r = mk(['oracle', 'vortox', 'witch', 'klutz', 'saint', 'flowergirl'], 'snv');
  startNight(r);
  act(r, 'witch', [S(r, 'saint').id]);
  act(r, 'vortox', [S(r, 'saint').id]);
  finish(r, 'oracle');
  const form = r.g.step.form;
  assert.ok(form.vortox && form.free);
  assert.ok(st(r, 'confirm', { fields: form.truth }), '真相被拒絕');
  r.phase = 'dawn'; r.g.step = null; startDay(r);
  ok(st(r, 'next'));
  assert.strictEqual(r.winner, 'evil');
}

// 女巫：被詛咒的人發起提名就死
{
  const r = mk(['oracle', 'vortox', 'witch', 'klutz', 'saint', 'flowergirl'], 'snv');
  startNight(r);
  act(r, 'witch', [S(r, 'oracle').id]);
  finish(r);
  ok(st(r, 'dawn'));
  assert.strictEqual(r.phase, 'day');
  nominate(r, S(r, 'oracle'), S(r, 'witch'));
  assert.strictEqual(S(r, 'oracle').dead, true);
}

// 主謀：惡魔被處決後再進行一天，那天處決善良玩家則善良落敗
{
  const r = mk(['chef', 'imp', 'mastermind', 'saint', 'tinker', 'fool', 'gossip'], 'bmr');
  startDay(r);
  execute(r, S(r, 'imp'));
  assert.strictEqual(r.phase, 'day', '主謀讓遊戲繼續');
  assert.strictEqual(r.g.mastermindDay, r.g.day + 1);
  ok(st(r, 'next'));
  finish(r); ok(st(r, 'dawn'));
  execute(r, S(r, 'chef'));
  assert.strictEqual(r.winner, 'evil');
}

// 鏡像雙子：善良雙子被處決，邪惡獲勝；雙子都活著時善良贏不了
{
  const r = mk(['oracle', 'vortox', 'eviltwin', 'klutz', 'saint', 'flowergirl'], 'snv');
  startNight(r); r.g.night = 1;
  r.g.queue = []; r.g.step = null;
  r.g.queue = [{ roleId: 'eviltwin', seatId: S(r, 'eviltwin').id, at: 1 }]; run(r);
  const good = r.seats.find(s => s.id === r.g.twin.good);
  assert.ok(!isEvil(good));
  r.phase = 'dawn'; startDay(r);
  execute(r, good);
  assert.strictEqual(r.winner, 'evil');
}

// 舞蛇人：選中惡魔，交換角色和陣營，原惡魔中毒
{
  const r = mk(['oracle', 'nodashii', 'saint', 'flowergirl', 'witch', 'snakecharmer', 'klutz'], 'snv'); // 舞蛇人不在諾-達鯴旁邊（否則中毒）
  const sc = S(r, 'snakecharmer'), nd = S(r, 'nodashii');
  startNight(r);
  pick(r, 'snakecharmer', [nd.id]);
  assert.strictEqual(sc.role, 'nodashii');
  assert.strictEqual(nd.role, 'snakecharmer');
  assert.ok(isEvil(sc) && !isEvil(nd) && impaired(r, nd));
}

// 哲學家：選在場的角色，原持有者醉酒；麻臉巫婆變人不改陣營
{
  const r = mk(['philosopher', 'oracle', 'vortox', 'pithag', 'klutz', 'saint'], 'snv');
  startNight(r);
  pick(r, 'philosopher', [], 'oracle');
  assert.strictEqual(S(r, 'philosopher'), undefined);
  assert.strictEqual(r.seats[0].role, 'oracle');
  assert.ok(impaired(r, r.seats[1]), '原神諭者醉酒');
  const t = S(r, 'saint');
  finish(r, 'pithag');
  pick(r, 'pithag', [t.id], 'witch');
  assert.strictEqual(t.role, 'witch');
  assert.strictEqual(alignOf(t), 'good', '陣營不變');
}

// 築夢師：一善一惡，其中一個是真角色
{
  const r = mk(['dreamer', 'oracle', 'vortox', 'pithag', 'klutz', 'saint'], 'snv');
  r.g.night = 1;
  r.phase = 'night';
  r.g.queue = [{ roleId: 'dreamer', seatId: S(r, 'dreamer').id, at: 1 }]; r.g.step = null; run(r);
  pick(r, 'dreamer', [S(r, 'pithag').id]);
  const form = r.g.step.form;
  assert.strictEqual(form.kind, 'dream');
  assert.strictEqual(truthLevel(form, form.truth), 2);
  assert.strictEqual(form.truth.evil, 'pithag');
  assert.strictEqual(truthLevel(form, { good: 'oracle', evil: 'witch' }), 0);
}

// 瘋子：殺人無效，真惡魔得知他選了誰
{
  const r = mk(['chef', 'lunatic', 'imp', 'godfather', 'saint', 'fool'], 'bmr');
  const lu = S(r, 'lunatic'); lu.fakeRole = 'imp';
  startNight(r);
  finish(r, 'imp');
  pick(r, 'lunatic', [S(r, 'chef').id]);
  assert.strictEqual(r.g.step.decide?.options.length, 1, '瘋子只有「無效」');
  ok(st(r, 'decide', { choice: 'fail' }));
  assert.strictEqual(S(r, 'chef').dead, false);
  assert.ok(r.chat.some(m => m.to === S(r, 'imp').id && m.text.includes('瘋子')));
}

// 魔鬼代言人：被保護的人明天被處決不死
{
  const r = mk(['chef', 'imp', 'devilsadvocate', 'saint', 'tinker', 'fool'], 'bmr');
  startNight(r);
  pick(r, 'devilsadvocate', [S(r, 'tinker').id]);
  finish(r); ok(st(r, 'dawn'));
  execute(r, S(r, 'tinker'));
  assert.strictEqual(S(r, 'tinker').dead, false);
}

// 教父：今天有外來者死亡，今晚殺一人
{
  const r = mk(['chef', 'imp', 'godfather', 'saint', 'tinker', 'fool', 'gossip'], 'bmr');
  startDay(r);
  ok(st(r, 'setDead', { seatId: S(r, 'tinker').id, dead: true }));
  r.g.dayOver = true; ok(st(r, 'next'));
  finish(r, 'godfather');
  pick(r, 'godfather', [S(r, 'gossip').id]);
  assert.strictEqual(S(r, 'gossip').dead, true);
}

// 心上人死亡：有人從此醉酒
{
  const r = mk(['chef', 'imp', 'witch', 'sweetheart', 'saint', 'oracle'], 'snv');
  startDay(r);
  execute(r, S(r, 'sweetheart'));
  assert.ok(r.seats.some(s => s.role !== 'sweetheart' && impaired(r, s)));
}

// 手動判勝負
{
  const r = mk(['chef', 'imp', 'witch', 'klutz', 'saint', 'oracle'], 'snv');
  startDay(r);
  ok(st(r, 'win', { team: 'evil' }));
  assert.strictEqual(r.winner, 'evil');
}

console.log('黯月初升 / 夢殞春宵規則測試通過 ✔');
