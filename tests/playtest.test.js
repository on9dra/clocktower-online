// 全角色試玩找出來的規則問題：每條都按官方規則寫死，免得以後改回去。用法：node tests/playtest.test.js
import assert from 'assert';
import { applyPlayerAction, applyStOp } from '../lib/ops.js';
import { startNight } from '../lib/engine.js';
import { startDay, nominate, vote, closeVote } from '../lib/day.js';
import { execute, killSeat } from '../lib/rules.js';
import { impaired, hasEff, isGoodSeat } from '../lib/util.js';
import { viewFor } from '../lib/view.js';
import { setup, S, act, st, ok, atReview } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
const pick = (r, ids, role) => ok(applyStOp(r, { op: 'pick', ids, role }));
// 走完今晚：要選人的選第一個合規的，信息按真相給。until：停在這個角色的步驟上
function finish(r, until) {
  for (let i = 0; i < 60 && !atReview(r); i++) {
    const step = r.g.step;
    if (until && step.roleId === until) return;
    if (step.status === 'choose') {
      const c = step.choose, counts = c.counts || [c.count], last = c.last || [];
      const pool = r.seats.filter(s => !(c.notSelf && s.id === step.seatId) && !(c.alive && s.dead) && !(c.dead && !s.dead) && !last.includes(s.id));
      pick(r, pool.slice(0, Math.min(...counts)).map(s => s.id), c.roles && !c.roleOptional ? c.roles[0] : null);
    } else if (step.status === 'decide') ok(st(r, 'decide', { choice: step.decide.options.at(-1).id }));
    else {
      const f = step.form, t = f.truth;
      ok(st(r, 'confirm', { fields: !f.vortox ? t : f.kind === 'number' ? { n: (t.n + 1) % (f.max + 1) } : f.kind === 'yesno' ? { yes: !t.yes } : t }));
    }
  }
}
// 裁定卡上第一個善良的座位
const goodOpt = r => r.seats.find(s => r.g.step.decide.options.some(o => o.id === s.id) && isGoodSeat(s));
// 天亮、白天什麼也不做、入夜
const nextNight = r => { finish(r); ok(st(r, 'dawn')); r.g.dayOver = true; ok(st(r, 'next')); };

// 普卡：先結算死亡再解毒，中毒的弄臣 / 水手 / 士兵照死，弄臣的免死不用掉
for (const role of ['fool', 'sailor', 'soldier']) {
  const r = mk(['chef', 'pukka', 'godfather', role, 'tinker', 'saint'], 'bmr');
  startNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, role).id]);
  nextNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, 'saint').id]);
  assert.strictEqual(S(r, role).dead, true, `中毒的${role}被普卡殺死`);
  assert.ok(!r.g.used?.['fool:' + S(r, role).id], '弄臣的免死沒有用掉');
}
// 驅魔人選中普卡：上一個中毒的人照樣死亡並解毒，不下新毒
{
  const r = mk(['chef', 'pukka', 'godfather', 'exorcist', 'tinker', 'saint'], 'bmr');
  startNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, 'chef').id]);
  nextNight(r);
  finish(r, 'exorcist'); act(r, 'exorcist', [S(r, 'pukka').id]);
  finish(r);
  assert.strictEqual(S(r, 'chef').dead, true, '被驅魔的普卡，上一個中毒的人仍然死亡');
  assert.strictEqual(r.g.pukka, null);
  assert.ok(!r.seats.some(s => hasEff(r, s, 'poison')), '沒有新毒');
}
// 普卡死了，之後的新普卡不會殺掉已經解毒的人
{
  const r = mk(['chef', 'pukka', 'scarletwoman', 'saint', 'tinker', 'fool', 'minstrel'], 'bmr');
  startNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, 'chef').id]);
  finish(r); ok(st(r, 'dawn'));
  killSeat(r, S(r, 'pukka'), '說書人手動標記');
  assert.strictEqual(r.g.pukka, null);
}

// 瘋子：排在真惡魔前面；進度條不倒退，也看不出他以為自己是哪個惡魔
{
  const r = mk(['chef', 'lunatic', 'zombuul', 'godfather', 'saint', 'fool', 'gossip'], 'bmr');
  S(r, 'lunatic').fakeRole = 'po';
  r.g.night = 1;
  startNight(r);
  const order = [];
  let at = -1;
  for (let i = 0; i < 40 && !atReview(r); i++) {
    const step = r.g.step, v = viewFor(r, { pid: 'p0' }).prog.at;
    assert.ok(v >= at, '進度條不倒退'); at = v;
    if (step.status === 'choose') {
      order.push(step.seatId);
      if (step.seatId === S(r, 'zombuul').id) assert.ok(r.chat.some(m => m.to === step.seatId && m.text.includes('瘋子')), '真惡魔行動前已經知道瘋子選了誰');
      const c = step.choose;
      pick(r, r.seats.filter(x => x.id !== step.seatId && x.role !== 'lunatic').slice(0, Math.max(...(c.counts || [c.count]))).map(x => x.id), c.roles?.[0]);
    } else if (step.status === 'decide') ok(st(r, 'decide', { choice: step.decide.options[0].id }));
    else ok(st(r, 'confirm', { fields: step.form.truth }));
  }
  assert.ok(order.includes(S(r, 'lunatic').id) && order.indexOf(S(r, 'lunatic').id) < order.indexOf(S(r, 'zombuul').id), '瘋子先醒');
}

// 月之子：夜裏死的，當夜不結算，下一個夜晚才選；能力是否正常看結算那一夜
{
  const r = mk(['chef', 'imp', 'poisoner', 'moonchild', 'saint', 'fool', 'gossip'], 'bmr');
  startNight(r);
  finish(r, 'imp'); act(r, 'imp', [S(r, 'moonchild').id]);
  finish(r, 'moonchild');
  assert.notStrictEqual(r.g.step.roleId, 'moonchild', '夜裏死的月之子當夜不結算');
  nextNight(r);
  finish(r, 'moonchild');
  assert.strictEqual(r.g.step.roleId, 'moonchild', '下一個夜晚結算');
  const t = goodOpt(r);
  ok(st(r, 'decide', { choice: t.id }));
  assert.strictEqual(t.dead, true);
}
// 白天死的月之子當晚結算；死的時候中毒不影響，結算那夜中毒才無效
{
  const r = mk(['chef', 'imp', 'poisoner', 'moonchild', 'saint', 'fool', 'gossip'], 'bmr');
  startNight(r); finish(r); ok(st(r, 'dawn'));
  ok(st(r, 'setPoison', { seatId: S(r, 'moonchild').id }));
  execute(r, S(r, 'moonchild'));
  r.g.ending = true; ok(st(r, 'next'));
  finish(r, 'moonchild');
  const t = goodOpt(r);
  ok(st(r, 'decide', { choice: t.id }));
  assert.strictEqual(t.dead, true, '白天中毒，當晚已經健康：能力生效');
}
{
  const r = mk(['chef', 'imp', 'poisoner', 'moonchild', 'saint', 'fool', 'gossip'], 'bmr');
  startNight(r); finish(r); ok(st(r, 'dawn'));
  execute(r, S(r, 'moonchild'));
  r.g.ending = true; ok(st(r, 'next'));
  finish(r, 'poisoner'); act(r, 'poisoner', [S(r, 'moonchild').id]);
  finish(r, 'moonchild');
  const t = goodOpt(r);
  ok(st(r, 'decide', { choice: t.id }));
  assert.strictEqual(t.dead, false, '結算那夜中毒：沒有人死');
}

// 僵怖假死時看起來只剩兩人，遊戲繼續
{
  const r = mk(['zombuul', 'chef', 'saint', 'fool', 'gossip'], 'bmr');
  startDay(r);
  execute(r, S(r, 'zombuul'));
  assert.ok(S(r, 'zombuul').undead);
  ok(st(r, 'setDead', { seatId: S(r, 'chef').id, dead: true }));
  ok(st(r, 'setDead', { seatId: S(r, 'saint').id, dead: true }));
  assert.strictEqual(r.winner, null, '還有三人活著');
  ok(st(r, 'setDead', { seatId: S(r, 'fool').id, dead: true }));
  assert.strictEqual(r.winner, 'evil', '真的只剩兩人');
}

// 珀：能力失效時也按選擇記錄
{
  const r = mk(['chef', 'po', 'godfather', 'saint', 'fool', 'gossip', 'minstrel', 'tealady'], 'bmr');
  startNight(r);
  finish(r, 'po'); act(r, 'po', [S(r, 'chef').id]);
  nextNight(r);
  ok(st(r, 'setPoison', { seatId: S(r, 'po').id }));
  finish(r, 'po'); act(r, 'po', []);
  ok(st(r, 'decide', { choice: 'fail' }));
  assert.strictEqual(r.g.poCharged, true, '失效時不選人，下次仍然三殺');
  nextNight(r);
  ok(st(r, 'setPoison', { seatId: S(r, 'po').id }));
  finish(r, 'po');
  assert.strictEqual(r.g.step.choose.count, 3);
  act(r, 'po', [S(r, 'saint').id, S(r, 'fool').id, S(r, 'gossip').id]);
  ok(st(r, 'decide', { choice: 'fail' }));
  assert.strictEqual(r.g.poCharged, false, '三殺夜失效，之後不再被迫三殺');
}

// 哲學家死亡：被弄醉的人恢復清醒
{
  const r = mk(['philosopher', 'oracle', 'vortox', 'witch', 'klutz', 'saint', 'flowergirl'], 'snv');
  startNight(r);
  finish(r, 'philosopher');
  ok(applyPlayerAction(r, S(r, 'philosopher').pid, { act: 'pick', ids: [], role: 'oracle' }));
  const was = r.seats.find(s => s.was === 'philosopher'), held = r.seats.find(s => s !== was && s.role === 'oracle');
  assert.ok(impaired(r, held), '原持有者醉酒');
  killSeat(r, was, '說書人手動標記');
  assert.ok(!impaired(r, held), '哲學家死後恢復清醒');
}

// 女巫：只剩三人時詛咒立即移除
{
  const r = mk(['chef', 'imp', 'witch', 'saint', 'oracle', 'klutz'], 'snv');
  startNight(r);
  finish(r, 'witch'); act(r, 'witch', [S(r, 'chef').id]);
  finish(r, 'imp'); act(r, 'imp', [S(r, 'klutz').id]);
  finish(r); ok(st(r, 'dawn'));
  assert.ok(hasEff(r, S(r, 'chef'), 'curse'));
  ok(st(r, 'setDead', { seatId: S(r, 'oracle').id, dead: true }));
  assert.ok(hasEff(r, S(r, 'chef'), 'curse'), '還有四人');
  ok(st(r, 'setDead', { seatId: S(r, 'saint').id, dead: true }));
  assert.ok(!hasEff(r, S(r, 'chef'), 'curse'), '剩三人，詛咒移除');
  ok(nominate(r, S(r, 'chef'), S(r, 'imp')));
  assert.strictEqual(S(r, 'chef').dead, false);
}

// 麻臉巫婆變出鏡像雙子：配一名陣營相反的玩家，互認；善良雙子被處決邪惡勝
{
  const r = mk(['flowergirl', 'vortox', 'pithag', 'chef', 'klutz', 'saint'], 'snv');
  startNight(r);
  finish(r, 'pithag');
  ok(applyPlayerAction(r, S(r, 'pithag').pid, { act: 'pick', ids: [S(r, 'chef').id], role: 'eviltwin' }));
  const t = S(r, 'eviltwin');
  assert.strictEqual(r.g.twin.good, t.id, '善良玩家變的雙子，善良的就是他');
  assert.ok([S(r, 'vortox').id, S(r, 'pithag').id].includes(r.g.twin.evil), '對手是邪惡玩家');
  assert.ok(r.chat.some(m => m.to === t.id && m.text.includes('你的雙子')), '當晚互認');
  finish(r); ok(st(r, 'dawn'));
  execute(r, t);
  assert.strictEqual(r.winner, 'evil');
}
// 原鏡像雙子被變走：鎖定解除
{
  const r = mk(['flowergirl', 'vortox', 'eviltwin', 'chef', 'klutz', 'saint'], 'snv');
  r.g.twin = { evil: S(r, 'eviltwin').id, good: S(r, 'chef').id };
  startDay(r);
  S(r, 'eviltwin').role = 'cerenovus';
  execute(r, S(r, 'chef'));
  assert.strictEqual(r.winner, null, '雙子被變走，處決善良雙子不判負');
}

// 亡骨魔：鄰近的鎮民死活都算
{
  const r = mk(['chef', 'oracle', 'witch', 'flowergirl', 'vigormortis', 'saint', 'klutz'], 'snv');
  startNight(r);
  S(r, 'chef').dead = true; S(r, 'flowergirl').dead = true; S(r, 'oracle').dead = true;
  r.g.night = 2;
  finish(r, 'vigormortis'); act(r, 'vigormortis', [S(r, 'witch').id]);
  assert.ok([S(r, 'oracle').id, S(r, 'flowergirl').id].some(id => r.seats.find(s => s.id === id) && hasEff(r, r.seats.find(s => s.id === id), 'poison')), '毒落在死人身上');
}

// 死了的管家不受主人限制；主人放手時活管家的手也放下
{
  const r = mk(['chef', 'imp', 'butler', 'saint', 'fool'], 'tb');
  startNight(r); r.g.master = { [S(r, 'butler').id]: S(r, 'chef').id };
  startDay(r);
  ok(nominate(r, S(r, 'chef'), S(r, 'imp')));
  ok(vote(r, S(r, 'chef'), 'yes'));
  ok(vote(r, S(r, 'butler'), 'yes'));
  ok(vote(r, S(r, 'chef'), null));
  assert.strictEqual(r.nomination.votes[S(r, 'butler').id], false, '主人放手，管家的手放下');
  assert.ok(vote(r, S(r, 'butler'), 'yes'), '主人沒舉手，管家舉不了');
  S(r, 'butler').dead = true;
  ok(vote(r, S(r, 'butler'), 'yes'));
  closeVote(r);
  assert.strictEqual(r.history.at(-1).count, 1, '死了的管家能用死亡票');
}

// 廚師：隱士夾在兩名邪惡玩家中間時，可以一對算、一對不算
{
  const r = mk(['chef', 'imp', 'recluse', 'poisoner', 'saint', 'fool'], 'tb');
  r.phase = 'night'; r.g.night = 1;
  r.g.queue = [{ roleId: 'chef', seatId: S(r, 'chef').id, at: 1 }]; r.g.step = null;
  startNight(r); r.g.night = 1;
  const { NIGHT } = await import('../lib/night.js');
  assert.deepStrictEqual(NIGHT.chef.run(r).form.ok, [0, 1, 2]);
}

// 魔鬼代言人選人之後中毒 / 死亡：保護失效
{
  const r = mk(['chef', 'imp', 'devilsadvocate', 'saint', 'tinker', 'fool'], 'bmr');
  startNight(r);
  finish(r, 'devilsadvocate'); act(r, 'devilsadvocate', [S(r, 'tinker').id]);
  finish(r); ok(st(r, 'dawn'));
  ok(st(r, 'setPoison', { seatId: S(r, 'devilsadvocate').id }));
  execute(r, S(r, 'tinker'));
  assert.strictEqual(S(r, 'tinker').dead, true, '魔鬼代言人中毒，保護失效');
}

// 賢者：能力失效也會醒，說書人可以給假信息；普卡的毒死後才解，也算失效
{
  const r = mk(['sage', 'pukka', 'witch', 'oracle', 'saint', 'klutz'], 'snv');
  startNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, 'sage').id]);
  nextNight(r);
  finish(r, 'pukka'); act(r, 'pukka', [S(r, 'saint').id]);
  finish(r, 'sage');
  assert.strictEqual(r.g.step.roleId, 'sage', '中毒的賢者被殺也會醒');
  assert.ok(r.g.step.form.free, '可以給假信息');
}

// 渦流：中毒的鎮民也只能給錯誤信息；錯誤信息計入數學家
{
  const r = mk(['oracle', 'vortox', 'witch', 'saint', 'mathematician', 'klutz', 'flowergirl'], 'snv');
  startNight(r);
  finish(r, 'vortox'); act(r, 'vortox', [S(r, 'flowergirl').id]);
  finish(r); ok(st(r, 'dawn'));
  execute(r, S(r, 'klutz')); // 渦流在場，白天無人被處決邪惡直接獲勝
  ok(st(r, 'next'));
  r.g.poisoned = S(r, 'oracle').id;
  finish(r, 'vortox'); act(r, 'vortox', [S(r, 'saint').id]);
  finish(r, 'oracle');
  const f = r.g.step.form;
  assert.ok(f.free && f.vortox && f.why === 'vortox');
  assert.ok(st(r, 'confirm', { fields: f.truth }), '真話被拒');
  ok(st(r, 'confirm', { fields: { n: f.truth.n + 1 } }));
  assert.ok(r.g.abnormal.includes(S(r, 'oracle').id), '計入數學家');
  finish(r, 'mathematician');
  assert.strictEqual(r.g.step.form.why, 'vortox', '數學家卡片標出渦流');
}

// 非酒鬼的醉酒標「醉酒」，不是「中毒」
{
  const r = mk(['saint', 'imp', 'witch', 'fool', 'klutz', 'oracle'], 'snv');
  startNight(r);
  r.g.eff = [{ seat: S(r, 'oracle').id, kind: 'drunk', src: 'sailor', till: 1e9 }];
  nextNight(r);
  finish(r, 'oracle');
  assert.strictEqual(r.g.step.form.why, 'tipsy');
}

// 復活：天亮時公佈，半夜玩家看不到；只有今晚才死的人時教授不醒
{
  const r = mk(['professor', 'imp', 'godfather', 'chef', 'saint', 'fool', 'minstrel'], 'bmr');
  startNight(r);
  finish(r, 'imp'); act(r, 'imp', [S(r, 'chef').id]);
  finish(r, 'professor');
  assert.notStrictEqual(r.g.step.roleId, 'professor', '只有今晚的死者：教授不醒');
  nextNight(r);
  finish(r, 'imp'); act(r, 'imp', [S(r, 'fool').id]);
  finish(r, 'professor');
  act(r, 'professor', [S(r, 'chef').id]);
  assert.strictEqual(S(r, 'chef').dead, false);
  assert.strictEqual(viewFor(r, { pid: S(r, 'saint').pid }).seats.find(s => s.id === S(r, 'chef').id).dead, true, '半夜看不到復活');
  finish(r); ok(st(r, 'dawn'));
  assert.ok(r.chat.some(m => m.e?.k === 'revive' && m.e.seat === S(r, 'chef').id), '天亮公佈');
  assert.strictEqual(viewFor(r, { pid: S(r, 'saint').pid }).seats.find(s => s.id === S(r, 'chef').id).dead, false);
}

// 驅魔人、魔鬼代言人：上一晚選過的人，選人提示裏帶著
{
  const r = mk(['chef', 'imp', 'devilsadvocate', 'saint', 'tinker', 'fool'], 'bmr');
  startNight(r);
  finish(r, 'devilsadvocate'); act(r, 'devilsadvocate', [S(r, 'tinker').id]);
  nextNight(r);
  finish(r, 'devilsadvocate');
  assert.deepStrictEqual(viewFor(r, { pid: S(r, 'devilsadvocate').pid }).prompt.last, [S(r, 'tinker').id]);
}

console.log('全角色試玩規則測試通過 ✔');
