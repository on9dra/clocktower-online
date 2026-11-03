// 黯月初升 / 夢殞春宵的演出事件：誰看得到、順序、帶的數據。規則本身在 dlc.test.js。用法：node tests/dlcfx.test.js
import assert from 'assert';
import { applyStOp } from '../lib/ops.js';
import { startNight } from '../lib/engine.js';
import { startDay, nominate } from '../lib/day.js';
import { noExecutionEnds } from '../lib/rules.js';
import { infoMarks } from '../public/js/infofmt.js';
import { setup, S, act, st, ok, ack } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
const fxOf = (r, aud, k) => (r.fx || []).filter(e => e.aud === aud && (!k || e.k === k));
const pick = (r, role, ids, roleId) => ok(applyStOp(r, { op: 'pick', ids, role: roleId }));
const toStep = (r, role) => { for (let i = 0; i < 30 && r.g.step?.roleId !== role; i++) ok(applyStOp(r, r.g.step?.status === 'ack' ? { op: 'ack' } : { op: 'skip' })); };

// 只選角色的行動（侍臣）也演，帶上選的角色；沒用能力不演
{
  const r = mk(['courtier', 'chef', 'imp', 'poisoner', 'saint', 'empath'], 'bmr');
  startNight(r); toStep(r, 'courtier');
  const me = S(r, 'courtier').id;
  pick(r, 'courtier', [], 'fool');
  const e = fxOf(r, me, 'act').at(-1);
  assert.strictEqual(e.role, 'fool');
  assert.deepStrictEqual(e.to, []);
  assert.ok(e.msg, '行動那一行等演出播完才出現');
  assert.strictEqual(r.g.step.result.e.word, '醉三天', '結果卡畫成式子，不是一句話');
}

// 選人的結果都帶 e：結果卡上是式子
{
  const r = mk(['exorcist', 'chef', 'imp', 'poisoner', 'saint', 'empath'], 'bmr');
  startNight(r); toStep(r, 'exorcist');
  pick(r, 'exorcist', [S(r, 'chef').id]);
  const e = r.g.step.result.e;
  assert.strictEqual(e.res, 'noop');
  assert.strictEqual(e.why, 'notdemon');
}

// 被驅魔的惡魔才收到演出，驅魔人看到的和選中別人一樣
{
  const r = mk(['exorcist', 'chef', 'imp', 'poisoner', 'saint', 'empath'], 'bmr');
  startNight(r); toStep(r, 'exorcist');
  pick(r, 'exorcist', [S(r, 'imp').id]);
  const demon = fxOf(r, S(r, 'imp').id, 'info').at(-1);
  assert.strictEqual(demon.src, 'exorcised');
  assert.strictEqual(demon.from, S(r, 'exorcist').id);
  assert.ok(!Object.hasOwn(fxOf(r, S(r, 'exorcist').id, 'act').at(-1), 'why'), '驅魔人看不出選中的是不是惡魔');
}

// 舞蛇人選中惡魔：先演自己出手，再翻牌；序號一直遞增，客戶端才不會重播
{
  const r = mk(['snakecharmer', 'chef', 'vortox', 'witch', 'saint', 'empath'], 'snv');
  startNight(r); toStep(r, 'snakecharmer');
  const me = S(r, 'snakecharmer').id, demon = S(r, 'vortox').id;
  pick(r, 'snakecharmer', [demon]);
  assert.deepStrictEqual(fxOf(r, me).slice(-2).map(e => e.k), ['act', 'role'], '換牌在自己的演出裏，不再走桌心來的那段');
  assert.ok(r.fx.every((e, i) => !i || e.seq > r.fx[i - 1].seq), '序號遞增');
  assert.deepStrictEqual(fxOf(r, demon).slice(-2).map(e => e.k), ['changed', 'role'], '原惡魔只看到自己被換');
  assert.ok(!fxOf(r, demon, 'changed').at(-1).swap && !fxOf(r, demon, 'changed').at(-1).from, '原惡魔看不出是誰換的');
  const e = fxOf(r, me, 'act').at(-1);
  assert.strictEqual(e.to[0], demon);
  assert.deepStrictEqual(e.swap, { role: 'vortox', gave: 'snakecharmer' });
  assert.deepStrictEqual(r.chat.find(m => m.seq === e.msg).marks, [{ seatId: demon, r: 'snakecharmer' }], '對方現在是舞蛇人，記在他座位旁邊');
}

// 舞蛇人沒換到（選的不是惡魔、選中惡魔但中毒）：演出一模一樣，看不出區別
{
  const r = mk(['snakecharmer', 'chef', 'vortox', 'witch', 'saint', 'empath'], 'snv');
  startNight(r); toStep(r, 'snakecharmer');
  const me = S(r, 'snakecharmer').id;
  pick(r, 'snakecharmer', [S(r, 'chef').id]);
  assert.ok(!fxOf(r, me, 'act').at(-1).swap);
  assert.deepStrictEqual(fxOf(r, me).slice(-1).map(e => e.k), ['act']);
}

// 哲學家：書翻完才翻牌
{
  const r = mk(['philosopher', 'chef', 'imp', 'poisoner', 'saint', 'empath'], 'snv');
  startNight(r); toStep(r, 'philosopher');
  const me = S(r, 'philosopher').id;
  pick(r, 'philosopher', [], 'oracle');
  assert.deepStrictEqual(fxOf(r, me).slice(-2).map(e => e.k), ['act', 'role']);
  assert.strictEqual(fxOf(r, me, 'act').at(-1).role, 'oracle');
}

// 酒鬼被麻臉巫婆換了角色：演出裏是他以為的角色，看不出自己是酒鬼
{
  const r = mk(['pithag', 'drunk', 'imp', 'chef', 'saint', 'empath'], 'snv');
  S(r, 'drunk').fakeRole = 'oracle';
  r.phase = 'dawn'; startNight(r); toStep(r, 'pithag');
  const t = S(r, 'drunk').id;
  pick(r, 'pithag', [t], 'sage');
  const e = fxOf(r, t, 'changed').at(-1);
  assert.strictEqual(e.was, 'oracle');
  assert.strictEqual(e.src, 'pithag');
  assert.deepStrictEqual(fxOf(r, S(r, 'pithag').id, 'act').at(-1).to, [t]);
}

// 方古跳身：接任的人走接任演出，不是翻角色牌；原方古和魔典上同一拍倒下
{
  const r = mk(['chef', 'klutz', 'fanggu', 'witch', 'empath', 'saint'], 'snv');
  r.phase = 'dawn'; startNight(r); toStep(r, 'fanggu');
  const old = S(r, 'fanggu').id, t = S(r, 'klutz').id, from = r.fxSeq;
  pick(r, 'fanggu', [t]);
  const e = fxOf(r, t, 'demon').at(-1);
  assert.strictEqual(e.why, 'fanggu');
  assert.strictEqual(e.role, 'fanggu');
  assert.strictEqual(e.was, 'klutz');
  assert.strictEqual(e.from, old);
  assert.ok(!fxOf(r, t, 'role').some(x => x.seq > from), '不再翻一次角色牌');
  assert.deepStrictEqual(fxOf(r, 'st', 'grim').at(-1).dies, [old]);
}

// 沙巴洛斯：魔典上兩個人各演各的，被保護的那個是擋下
{
  const r = mk(['monk', 'chef', 'shabaloth', 'poisoner', 'saint', 'empath'], 'bmr');
  r.phase = 'dawn'; startNight(r); toStep(r, 'monk');
  pick(r, 'monk', [S(r, 'chef').id]); ack(r);
  toStep(r, 'shabaloth');
  pick(r, 'shabaloth', [S(r, 'chef').id, S(r, 'empath').id]);
  const e = fxOf(r, 'st', 'grim').at(-1);
  assert.deepStrictEqual(e.each.map(x => x.res), ['blocked', 'kill']);
}

// 茶藝師、弄臣、水手擋下時魔典知道是誰擋的
{
  const r = mk(['chef', 'fool', 'imp', 'poisoner', 'empath', 'saint'], 'bmr');
  r.phase = 'dawn'; startNight(r); toStep(r, 'imp');
  pick(r, 'imp', [S(r, 'fool').id]);
  assert.strictEqual(fxOf(r, 'st', 'grim').at(-1).why, 'fool');
}

// 珀不選人：蓄力也演
{
  const r = mk(['chef', 'empath', 'po', 'poisoner', 'saint', 'butler'], 'bmr');
  r.phase = 'dawn'; startNight(r); toStep(r, 'po');
  const me = S(r, 'po').id;
  pick(r, 'po', []);
  const e = fxOf(r, me, 'act').at(-1);
  assert.strictEqual(e.charge, true);
}

// 普卡：上一個中毒的人在同一拍倒下
{
  const r = mk(['chef', 'empath', 'pukka', 'poisoner', 'saint', 'butler'], 'bmr');
  r.g.pukka = S(r, 'saint').id;
  r.phase = 'dawn'; startNight(r); toStep(r, 'pukka');
  pick(r, 'pukka', [S(r, 'chef').id]);
  assert.deepStrictEqual(fxOf(r, 'st', 'grim').at(-1).dies, [S(r, 'saint').id]);
}

// 女巫的詛咒發動：全桌看到，夜裏只有選人的女巫知道
{
  const r = mk(['chef', 'empath', 'imp', 'witch', 'saint', 'butler'], 'snv');
  r.phase = 'dawn'; startNight(r); toStep(r, 'witch');
  pick(r, 'witch', [S(r, 'chef').id]);
  r.phase = 'night'; r.g.step = null;
  startDay(r);
  ok(nominate(r, S(r, 'chef'), S(r, 'empath')));
  assert.strictEqual(fxOf(r, 'all', 'curse').at(-1).seat, S(r, 'chef').id);
}

// 渦流：白天無人處決，全桌先看漩渦
{
  const r = mk(['chef', 'empath', 'vortox', 'witch', 'saint', 'butler'], 'snv');
  r.phase = 'dawn'; startNight(r);
  r.g.step = null; startDay(r);
  assert.ok(noExecutionEnds(r));
  const k = fxOf(r, 'all').map(e => e.k);
  assert.ok(k.indexOf('vortex') >= 0 && k.indexOf('vortex') < k.indexOf('win'));
}

// 座位標記：女裁縫的結果落在兩人身上；賢者不知道是哪個惡魔，標記不能露出角色
{
  const ms = infoMarks({ kind: 'yesno', roleId: 'seamstress', extra: { ids: ['a', 'b'] } }, { yes: false });
  assert.deepStrictEqual(ms.map(m => [m.seatId, m.text]), [['a', '不同陣營'], ['b', '不同陣營']]);
  const sg = infoMarks({ kind: 'two', plain: true, roles: ['vortox'] }, { a: 'a', b: 'b', role: 'vortox' });
  assert.ok(sg.every(m => m.demon === true && !m.r && !String(m.text).includes('渦流')));
}

console.log('dlcfx ok');
