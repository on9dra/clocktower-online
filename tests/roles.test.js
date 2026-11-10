// 角色清單（docs/role-behaviors.md）查出來的問題：每條按官方規則寫死。用法：node tests/roles.test.js
import assert from 'assert';
import { applyPlayerAction, applyStOp } from '../lib/ops.js';
import { startNight, run } from '../lib/engine.js';
import { startDay, nominate } from '../lib/day.js';
import { execute, killSeat } from '../lib/rules.js';
import { impaired, isPoisoned, isEvil, seatTags, hasEff } from '../lib/util.js';
import { viewFor } from '../lib/view.js';
import { trimChat } from '../public/js/infofmt.js';
import { readFileSync } from 'fs';
import { setup, S, ok, st, act, pl, ack } from './helpers.js';

const mk = (roles, sid) => { const r = setup(roles); r.scriptId = sid; return r; };
// 直接走到第 N 夜，今晚只排這幾個角色
const go = (r, roles, night = 2) => {
  r.g.night = night - 1;
  startNight(r);
  r.g.queue = roles.map(x => ({ roleId: x, seatId: S(r, x).id, at: 1 }));
  r.g.step = null; r.g.beat = null;
  run(r);
};
const raw = (r, role, ids, roleId) => applyPlayerAction(r, S(r, role).pid, { act: 'pick', ids, role: roleId });

// 鎮長把死亡轉給孫子：祖母跟著死；轉給賢者：賢者當晚醒
{
  const r = mk(['mayor', 'grandmother', 'imp', 'chef', 'saint', 'monk'], 'bmr');
  r.g.grandchild = { [S(r, 'grandmother').id]: S(r, 'chef').id };
  go(r, ['imp']);
  act(r, 'imp', [S(r, 'mayor').id]);
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  assert.ok(S(r, 'chef').dead && S(r, 'grandmother').dead, '孫子替死，祖母也死');
}
{
  const r = mk(['mayor', 'sage', 'imp', 'chef', 'saint', 'monk'], 'bmr');
  go(r, ['imp', 'sage']);
  act(r, 'imp', [S(r, 'mayor').id]);
  ok(st(r, 'decide', { choice: S(r, 'sage').id }));
  assert.strictEqual(r.g.step.roleId, 'sage', '賢者替死也算惡魔殺的');
}
// 鎮長替死：亡骨魔殺爪牙的效果照常；方古轉給外來者照樣跳
{
  const r = mk(['mayor', 'vigormortis', 'witch', 'chef', 'saint', 'oracle'], 'snv');
  go(r, ['vigormortis']);
  act(r, 'vigormortis', [S(r, 'mayor').id]);
  ok(st(r, 'decide', { choice: S(r, 'witch').id }));
  assert.ok(S(r, 'witch').keep, '替死的爪牙保留能力');
}
{
  const r = mk(['mayor', 'fanggu', 'witch', 'saint', 'chef', 'oracle'], 'snv');
  go(r, ['fanggu']);
  act(r, 'fanggu', [S(r, 'mayor').id]);
  const old = S(r, 'fanggu'), saint = S(r, 'saint');
  ok(st(r, 'decide', { choice: saint.id }));
  assert.ok(saint.role === 'fanggu' && !saint.dead && old.dead, '方古跳到替死的外來者身上');
}
// 中毒的鎮長不能替死，卡片不出；能力正常時士兵、被僧侶保護的人不在替死名單裏
{
  const r = mk(['mayor', 'imp', 'poisoner', 'chef', 'saint', 'monk'], 'tb');
  go(r, ['poisoner', 'imp']);
  act(r, 'poisoner', [S(r, 'mayor').id]);
  act(r, 'imp', [S(r, 'mayor').id]);
  assert.ok(S(r, 'mayor').dead, '中毒的鎮長直接死');
}
{
  const r = mk(['mayor', 'imp', 'monk', 'soldier', 'saint', 'chef'], 'tb');
  go(r, ['monk', 'imp']);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'mayor').id]);
  const ids = r.g.step.decide.options.map(o => o.id);
  assert.ok(!ids.includes(S(r, 'soldier').id) && !ids.includes(S(r, 'chef').id) && ids.includes(S(r, 'saint').id));
}
// 沙巴洛斯：官方在喚醒他之前反芻，他醒來時已經復活了；多殺的惡魔打到鎮長也問替死
{
  const r = mk(['mayor', 'shabaloth', 'chef', 'saint', 'monk', 'fool'], 'bmr');
  r.g.shabaloth = [S(r, 'monk').id]; S(r, 'monk').dead = true;
  go(r, ['shabaloth']);
  assert.strictEqual(r.g.step.decide.kind, 'regurgitate', '先反芻');
  assert.strictEqual(viewFor(r, { pid: S(r, 'shabaloth').pid }).prompt, null, '他還沒醒');
  ok(st(r, 'decide', { choice: S(r, 'monk').id }));
  assert.ok(!S(r, 'monk').dead);
  assert.strictEqual(r.g.step.status, 'choose', '反芻完才叫醒他');
  assert.ok(viewFor(r, { pid: S(r, 'shabaloth').pid }).prompt);
  act(r, 'shabaloth', [S(r, 'mayor').id, S(r, 'saint').id]);
  assert.strictEqual(r.g.step.decide.kind, 'mayor');
  ok(st(r, 'decide', { choice: 'none' }));
  assert.ok(!S(r, 'mayor').dead && S(r, 'saint').dead);
}
// 反芻的人當晚又被選中：又死了
{
  const r = mk(['chef', 'shabaloth', 'saint', 'monk', 'fool', 'gossip'], 'bmr');
  r.g.shabaloth = [S(r, 'monk').id]; S(r, 'monk').dead = true;
  go(r, ['shabaloth']);
  ok(st(r, 'decide', { choice: S(r, 'monk').id }));
  act(r, 'shabaloth', [S(r, 'monk').id, S(r, 'saint').id]);
  assert.ok(S(r, 'monk').dead && r.g.diedTonight.includes(S(r, 'monk').id));
}
// 反芻的首夜角色馬上用能力，然後才叫醒沙巴洛斯
{
  const r = mk(['chef', 'shabaloth', 'saint', 'monk', 'fool', 'gossip'], 'bmr');
  r.g.shabaloth = [S(r, 'chef').id]; S(r, 'chef').dead = true;
  go(r, ['shabaloth']);
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  assert.strictEqual(r.g.step.roleId, 'chef');
  ok(st(r, 'confirm', { fields: r.g.step.form.truth }));
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status], ['shabaloth', 'choose']);
}
// 沒有能力不反芻；不反芻時也照常叫醒；上一晚選的人沒死不問
{
  const r = mk(['chef', 'shabaloth', 'saint', 'monk', 'fool', 'gossip'], 'bmr');
  r.g.shabaloth = [S(r, 'monk').id]; S(r, 'monk').dead = true;
  r.g.poisoned = S(r, 'shabaloth').id;
  go(r, ['shabaloth']);
  r.g.poisoned = S(r, 'shabaloth').id;
  r.g.step = null; r.g.queue = [{ roleId: 'shabaloth', seatId: S(r, 'shabaloth').id, at: 1 }]; run(r);
  assert.strictEqual(r.g.step.status, 'choose', '中毒不反芻');
}
{
  const r = mk(['chef', 'shabaloth', 'saint', 'monk', 'fool', 'gossip'], 'bmr');
  r.g.shabaloth = [S(r, 'monk').id]; S(r, 'monk').dead = true;
  go(r, ['shabaloth']);
  ok(st(r, 'decide', { choice: 'none' }));
  assert.strictEqual(r.g.step.status, 'choose');
  assert.ok(S(r, 'monk').dead);
}
{
  const r = mk(['chef', 'shabaloth', 'saint', 'monk', 'fool', 'gossip'], 'bmr');
  r.g.shabaloth = [S(r, 'monk').id];
  go(r, ['shabaloth']);
  assert.strictEqual(r.g.step.status, 'choose', '上一晚選的人沒死');
}
// 珀只殺一人時不會把鎮長漏掉
{
  const r = mk(['mayor', 'po', 'chef', 'saint', 'monk', 'fool'], 'bmr');
  go(r, ['po']);
  assert.strictEqual(raw(r, 'po', [S(r, 'mayor').id]), undefined);
  assert.strictEqual(r.g.step.decide?.kind, 'mayor', '珀打鎮長要問替死');
}
// 哲學家第二夜起選首夜角色：當晚用一次
{
  const r = mk(['philosopher', 'imp', 'poisoner', 'chef', 'saint', 'monk'], 'snv');
  go(r, ['philosopher']);
  ok(raw(r, 'philosopher', [], 'clockmaker'));
  ack(r);
  assert.strictEqual(r.g.step.roleId, 'clockmaker');
  assert.strictEqual(r.g.step.status, 'confirm');
}
// 亡骨魔：鄰居由說書人選；亡骨魔沒了能力就解毒，死爪牙也不再醒
{
  const r = mk(['chef', 'witch', 'oracle', 'vigormortis', 'saint', 'monk', 'clockmaker'], 'snv');
  go(r, ['vigormortis', 'witch']);
  act(r, 'vigormortis', [S(r, 'witch').id]);
  assert.strictEqual(r.g.step.decide.kind, 'neighbor', '兩邊都有鎮民時說書人選');
  const v = S(r, 'oracle');
  ok(st(r, 'decide', { choice: v.id }));
  assert.ok(isPoisoned(r, v) && S(r, 'witch').keep);
  assert.strictEqual(r.g.step.roleId, 'witch', '亡骨魔活著：死爪牙照常醒');
  ok(raw(r, 'witch', [S(r, 'chef').id])); ack(r);
  killSeat(r, S(r, 'vigormortis'), '說書人手動標記');
  assert.ok(!isPoisoned(r, v), '亡骨魔死後解毒');
}
// 瘋子以為自己是珀：空選不算真珀的蓄力
{
  const r = mk(['lunatic', 'po', 'poisoner', 'chef', 'saint', 'monk'], 'bmr');
  S(r, 'lunatic').fakeRole = 'po';
  go(r, []);
  r.g.queue = ['lunatic', 'po'].map(x => ({ roleId: 'po', seatId: S(r, x).id, at: 1 }));
  r.g.step = null;
  run(r);
  assert.strictEqual(r.g.step.seatId, S(r, 'lunatic').id);
  assert.strictEqual(r.g.step.turn, true, '瘋子以為自己是珀：輪到他自己（線下彈「輪到 ① 珀 行動了」，卡上蓋「瘋子」章）');
  assert.strictEqual(raw(r, 'lunatic', []), undefined);
  ok(st(r, 'decide', { choice: 'fail' })); ack(r);
  assert.strictEqual(r.g.step.choose.count, 1, '真珀不蓄力');
  assert.ok(seatTags(r, S(r, 'lunatic')).includes('蓄力'), '瘋子自己蓄力');
}
// 珀空選：說書人座位標「蓄力」，玩家面板有一行，下一次三殺
{
  const r = mk(['chef', 'po', 'poisoner', 'saint', 'monk', 'fool'], 'bmr');
  go(r, ['po']);
  ok(raw(r, 'po', []));
  assert.strictEqual(r.g.step.result.e.res, 'charge');
  assert.ok(seatTags(r, S(r, 'po')).includes('蓄力'));
  assert.ok(r.chat.some(m => m.to === S(r, 'po').id && m.src === 'po'));
}
// 送葬者：處決沒死、處決死人都得不到信息
{
  const r = mk(['undertaker', 'imp', 'poisoner', 'fool', 'saint', 'chef'], 'bmr');
  startDay(r);
  execute(r, S(r, 'fool'));
  assert.ok(!S(r, 'fool').dead && !r.g.lastExecutedRole, '弄臣沒死，送葬者沒有信息');
}
{
  const r = mk(['undertaker', 'imp', 'poisoner', 'chef', 'saint', 'monk'], 'tb');
  startDay(r);
  execute(r, S(r, 'chef'));
  assert.strictEqual(r.g.lastExecutedRole, 'chef');
}
// 處決沒死：絞刑架演出帶 survive，說書人有章
{
  const r = mk(['chef', 'imp', 'poisoner', 'fool', 'saint', 'monk'], 'bmr');
  startDay(r);
  execute(r, S(r, 'fool'));
  assert.ok(r.fx.some(e => e.k === 'execute' && e.survive));
  assert.ok(r.fx.some(e => e.k === 'ststamp' && e.aud === 'st'));
}
// 教授：復活後一次性能力回來；只在首夜行動的馬上再用一次；順序在後面的今晚照常醒
{
  const r = mk(['professor', 'imp', 'poisoner', 'slayer', 'chef', 'empath'], 'bmr');
  r.g.slayerUsed = true; r.g.shotEver = [S(r, 'slayer').id]; S(r, 'slayer').dead = true;
  go(r, ['professor']);
  ok(raw(r, 'professor', [S(r, 'slayer').id]));
  assert.ok(!S(r, 'slayer').dead && !r.g.slayerUsed && !r.g.shotEver.length, '獵手的子彈回來了');
}
{
  const r = mk(['professor', 'imp', 'poisoner', 'chef', 'saint', 'empath'], 'bmr');
  S(r, 'chef').dead = true;
  go(r, ['professor']);
  ok(raw(r, 'professor', [S(r, 'chef').id])); ack(r);
  assert.strictEqual(r.g.step.roleId, 'chef', '廚師馬上再用一次');
}
// 僧侶保護的人、士兵：普卡的毒下不上
{
  const r = mk(['chef', 'pukka', 'monk', 'soldier', 'saint', 'fool'], 'bmr');
  go(r, ['monk', 'pukka']);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'pukka', [S(r, 'chef').id]);
  assert.ok(!isPoisoned(r, S(r, 'chef')));
  r.g.pukka = null;
  go(r, ['pukka'], 3);
  act(r, 'pukka', [S(r, 'soldier').id]);
  assert.ok(!isPoisoned(r, S(r, 'soldier')));
}
// 侍臣失去能力時被灌醉的人清醒，恢復後接著醉
{
  const r = mk(['courtier', 'imp', 'poisoner', 'fool', 'saint', 'monk'], 'bmr');
  go(r, ['courtier']);
  ok(raw(r, 'courtier', [], 'fool')); ack(r);
  const fool = S(r, 'fool');
  assert.ok(impaired(r, fool));
  r.g.poisoned = S(r, 'courtier').id;
  assert.ok(!impaired(r, fool), '侍臣中毒，弄臣清醒');
  r.g.poisoned = null;
  assert.ok(impaired(r, fool), '侍臣恢復，弄臣又醉');
}
// 女巫死了詛咒就沒了
{
  const r = mk(['chef', 'imp', 'witch', 'saint', 'monk', 'oracle'], 'snv');
  go(r, ['witch']);
  act(r, 'witch', [S(r, 'chef').id]);
  ok(st(r, 'dawn'));
  r.seats.forEach(s => { if (s.role === 'witch') killSeat(r, s, '說書人手動標記'); });
  assert.ok(!hasEff(r, S(r, 'chef'), 'curse'));
}
// 月之子：白天公開選人，選完才能入夜；當晚結算停在結果卡
{
  const r = mk(['chef', 'imp', 'poisoner', 'moonchild', 'saint', 'fool'], 'bmr');
  startDay(r);
  execute(r, S(r, 'moonchild'));
  const v = viewFor(r, { pid: S(r, 'moonchild').pid });
  assert.strictEqual(v.prompt.roleId, 'moonchild', '玩家有提示');
  assert.ok(viewFor(r, { st: true }).st.lastWord, '說書人有卡');
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'day', '沒選完不入夜');
  assert.ok(st(r, 'next'), '重複結束白天被攔下');
  const t = S(r, 'saint');
  ok(pl(r, 'moonchild', 'pick', { ids: [t.id] }));
  assert.strictEqual(r.phase, 'night', '選完自動入夜');
  assert.ok(r.chat.some(m => m.from === 'sys' && m.text.includes('月之子')), '公開');
}
// 呆瓜：選中邪惡玩家他的陣營落敗；選中善良無事；隱士 / 間諜兩個按鈕
{
  const r = mk(['chef', 'imp', 'witch', 'klutz', 'saint', 'oracle'], 'snv');
  startDay(r);
  execute(r, S(r, 'klutz'));
  ok(pl(r, 'klutz', 'pick', { ids: [S(r, 'imp').id] }));
  assert.deepStrictEqual([r.g.ruling.kind, r.g.ruling.auto, r.g.ruling.forced], ['klutz', true, true]);
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(r.winner, 'evil');
}
{
  const r = mk(['chef', 'imp', 'witch', 'klutz', 'saint', 'oracle'], 'snv');
  startDay(r);
  execute(r, S(r, 'klutz'));
  ok(pl(r, 'klutz', 'pick', { ids: [S(r, 'chef').id] }));
  ok(st(r, 'rule', { work: false }));
  assert.strictEqual(r.winner, null);
}
// 心上人：夜裏死說書人當場選；白天死放在左上角的卡上
{
  const r = mk(['chef', 'imp', 'witch', 'sweetheart', 'saint', 'oracle'], 'snv');
  go(r, ['imp']);
  act(r, 'imp', [S(r, 'sweetheart').id]);
  assert.strictEqual(r.g.step.decide.kind, 'sweetheart');
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  assert.ok(impaired(r, S(r, 'chef')));
  assert.ok(!(r.g.order || []).includes('sweetheart'), '不佔進度條的格子');
}
// 麻臉巫婆：變出來的角色順序在後面的今晚就行動；創造惡魔時說書人連選死者
{
  const r = mk(['pithag', 'imp', 'chef', 'saint', 'oracle', 'flowergirl'], 'snv');
  go(r, ['pithag']);
  assert.strictEqual(raw(r, 'pithag', [S(r, 'chef').id], 'dreamer'), undefined); ack(r);
  assert.strictEqual(r.g.step.roleId, 'dreamer', '今晚就行動');
}
{
  const r = mk(['pithag', 'imp', 'chef', 'saint', 'oracle', 'flowergirl'], 'snv');
  go(r, ['pithag']);
  assert.strictEqual(raw(r, 'pithag', [S(r, 'chef').id], 'vortox'), undefined);
  assert.strictEqual(r.g.step.decide.kind, 'hagdeaths');
  ok(st(r, 'decide', { choice: S(r, 'saint').id }));
  assert.ok(S(r, 'saint').dead);
  ok(st(r, 'decide', { choice: 'none' }));
}
// 雜耍藝人：白天猜的系統記下，當晚算好數字
{
  const r = mk(['juggler', 'imp', 'witch', 'flowergirl', 'saint', 'oracle'], 'snv');
  startDay(r);
  ok(pl(r, 'juggler', 'juggle', { targetId: S(r, 'oracle').id, role: 'oracle' }));
  ok(pl(r, 'juggler', 'juggle', { targetId: S(r, 'saint').id, role: 'flowergirl' }));
  assert.strictEqual(viewFor(r, { pid: S(r, 'juggler').pid }).juggleLeft, 3);
  r.phase = 'dawn';
  go(r, ['juggler']);
  assert.strictEqual(r.g.step.form.truth.n, 1);
  assert.strictEqual(r.g.step.form.extra.guesses.length, 2);
}
// 洗腦師：座位標記寫上要證明的角色
{
  const r = mk(['chef', 'imp', 'cerenovus', 'saint', 'oracle', 'flowergirl'], 'snv');
  go(r, ['cerenovus']);
  ok(raw(r, 'cerenovus', [S(r, 'chef').id], 'oracle')); ack(r);
  assert.ok(seatTags(r, S(r, 'chef')).some(t => t.startsWith('瘋狂') && t.includes('神諭者')));
}
// 莽夫：陣營變了面板上寫出來
{
  const r = mk(['chef', 'imp', 'poisoner', 'goon', 'saint', 'fool'], 'bmr');
  go(r, ['poisoner']);
  act(r, 'poisoner', [S(r, 'goon').id]);
  assert.strictEqual(viewFor(r, { pid: S(r, 'goon').pid }).myAlign, 'evil');
  assert.strictEqual(viewFor(r, { pid: S(r, 'chef').pid }).myAlign, null);
}
// 刺客打莽夫：莽夫照死、轉邪惡；酒醉的刺客打不死，莽夫也轉邪惡
{
  const r = mk(['chef', 'imp', 'assassin', 'goon', 'saint', 'fool'], 'bmr');
  go(r, ['assassin']);
  act(r, 'assassin', [S(r, 'goon').id]);
  assert.ok(S(r, 'goon').dead && isEvil(S(r, 'goon')));
}
// 祖母：孫子由說書人選；首夜沒有卡片的步驟也停一下
{
  const r = mk(['grandmother', 'imp', 'poisoner', 'chef', 'saint', 'fool'], 'bmr');
  go(r, ['grandmother'], 1);
  assert.strictEqual(r.g.step.decide.kind, 'grandchild');
  ok(st(r, 'decide', { choice: S(r, 'saint').id }));
  assert.strictEqual(r.g.step.status, 'confirm');
  assert.strictEqual(r.g.step.form.truth.role, 'saint');
}
{
  const r = mk(['eviltwin', 'imp', 'chef', 'saint', 'oracle', 'flowergirl'], 'snv');
  go(r, ['eviltwin'], 1);
  assert.strictEqual(r.g.step.status, 'ack', '雙子配對給說書人看一眼');
}
// 代選也看結果
{
  const r = mk(['monk', 'imp', 'poisoner', 'chef', 'saint', 'fool'], 'bmr');
  go(r, ['monk', 'imp']);
  ok(applyStOp(r, { op: 'pick', ids: [S(r, 'chef').id] }));
  assert.strictEqual(r.g.step.status, 'ack');
}
// 夜裏的死法不發給玩家
{
  const r = mk(['chef', 'imp', 'poisoner', 'saint', 'monk', 'fool'], 'bmr');
  go(r, ['imp']);
  act(r, 'imp', [S(r, 'chef').id]);
  ok(st(r, 'dawn'));
  const seat = id => viewFor(r, { pid: 'p0' }).seats.find(s => s.id === id);
  assert.strictEqual(seat(S(r, 'chef').id).deathBy, null, '不告訴玩家是惡魔殺的');
  assert.strictEqual(viewFor(r, { st: true }).seats.find(s => s.id === S(r, 'chef').id).deathBy, 'demon');
}
// 留存：閒聊把記錄擠滿時，私密信息不丟；流程日誌增量發
{
  const list = [{ id: 'a', info: true, seq: 1 }, ...Array.from({ length: 700 }, (_, i) => ({ id: 'c' + i, from: 'x', seq: i + 2 }))];
  const out = trimChat(list);
  assert.strictEqual(out.length, 600);
  assert.ok(out.some(m => m.id === 'a'));
  const r = mk(['chef', 'imp', 'poisoner', 'saint', 'monk', 'fool'], 'bmr');
  for (let i = 0; i < 300; i++) r.g.log.push({ text: 'x', phase: 'day', night: 1, day: 1 });
  assert.strictEqual(viewFor(r, { st: true }).st.log.length, r.g.log.length, '全部都在');
  assert.strictEqual(viewFor(r, { st: true }, 0, 5).st.log.length, r.g.log.length - 5, '只發新增的');
}

// 中毒、醉酒、酒鬼沒有能力：夜晚行動只有「無效」，白天被動一個按鈕；隱士 / 間諜的登記才有兩個
for (const [role, target, pre] of [['monk', 'chef'], ['imp', 'chef'], ['imp', 'imp'], ['innkeeper', 'chef'], ['witch', 'chef'], ['pithag', 'chef']]) {
  const r = mk([role === 'imp' ? 'poisoner' : 'imp', role, 'chef', 'saint', 'fool', 'oracle'], 'snv');
  go(r, [role]);
  r.g.poisoned = S(r, role).id;
  const ids = role === 'innkeeper' ? [S(r, 'chef').id, S(r, 'saint').id] : [S(r, target).id];
  assert.strictEqual(applyPlayerAction(r, S(r, role).pid, { act: 'pick', ids, role: role === 'pithag' ? 'oracle' : undefined }), undefined);
  assert.deepStrictEqual(r.g.step.decide.options.map(o => o.id), ['fail'], role);
  assert.ok(st(r, 'decide', { choice: 'work' }), '不能判生效');
}
{
  const day = roles => { const r = mk(roles, 'tb'); startDay(r); return r; };
  let r = day(['saint', 'imp', 'poisoner', 'chef', 'monk', 'empath']);
  r.g.poisoned = S(r, 'saint').id;
  execute(r, S(r, 'saint'));
  assert.ok(r.g.ruling.forced && !r.g.ruling.auto, '中毒聖徒只有繼續');
  r = day(['scarletwoman', 'imp', 'poisoner', 'chef', 'monk', 'empath']);
  r.g.poisoned = S(r, 'scarletwoman').id;
  execute(r, S(r, 'imp'));
  assert.ok(r.g.ruling.forced && !r.g.ruling.auto, '中毒紅唇女郎只有不接任');
  r = day(['virgin', 'imp', 'poisoner', 'chef', 'monk', 'empath']);
  r.g.poisoned = S(r, 'virgin').id;
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id }));
  assert.ok(!r.g.virginCheck, '中毒貞潔者不開小窗');
  r = day(['virgin', 'imp', 'spy', 'chef', 'monk', 'empath']);
  r.g.poisoned = S(r, 'virgin').id;
  ok(pl(r, 'spy', 'nominate', { targetId: S(r, 'virgin').id }));
  assert.ok(!r.g.virginCheck, '貞潔者中毒時，間諜也不用裁定');
  r = day(['slayer', 'imp', 'poisoner', 'recluse', 'monk', 'empath']);
  r.g.poisoned = S(r, 'slayer').id;
  ok(pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id }));
  assert.ok(r.g.ruling.forced && !r.g.ruling.reg, '中毒獵手打隱士：沒有登記的選擇');
  r = day(['slayer', 'imp', 'poisoner', 'recluse', 'monk', 'empath']);
  ok(pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id }));
  assert.ok(!r.g.ruling.forced && r.g.ruling.reg === 'recluse', '健康獵手打隱士：兩個按鈕');
}
// 呆瓜：中毒時一個按鈕；選中間諜 / 隱士時兩個
{
  const r = mk(['chef', 'imp', 'witch', 'klutz', 'saint', 'oracle'], 'snv');
  startDay(r);
  r.g.poisoned = S(r, 'klutz').id;
  execute(r, S(r, 'klutz'));
  ok(pl(r, 'klutz', 'pick', { ids: [S(r, 'imp').id] }));
  assert.ok(r.g.ruling.forced && !r.g.ruling.auto);
}
{
  const r = mk(['chef', 'imp', 'spy', 'klutz', 'saint', 'oracle'], 'snv');
  startDay(r);
  execute(r, S(r, 'klutz'));
  ok(pl(r, 'klutz', 'pick', { ids: [S(r, 'spy').id] }));
  assert.ok(!r.g.ruling.forced && r.g.ruling.reg === 'spy');
}
// 月之子選中隱士 / 間諜：說書人定算不算善良
{
  const r = mk(['chef', 'imp', 'poisoner', 'moonchild', 'recluse', 'fool'], 'bmr');
  startDay(r);
  execute(r, S(r, 'moonchild'));
  const t = S(r, 'recluse');
  r.g.ending = true; ok(pl(r, 'moonchild', 'pick', { ids: [t.id] }));
  r.g.queue = [{ roleId: 'moonchild', seatId: S(r, 'moonchild').id, at: 1 }]; r.g.step = null; r.g.beat = null;
  run(r);
  assert.strictEqual(r.g.step.decide.kind, 'moonreg');
  ok(st(r, 'decide', { choice: 'evil' }));
  assert.ok(!t.dead);
}
// 小惡魔選自己：自動接任時結果裏有接任者；沒有爪牙時寫明；旅店老闆保護時不死不傳位；標記寫「攻擊」
{
  const r = mk(['imp', 'baron', 'chef', 'saint', 'monk'], 'tb');
  go(r, ['imp']);
  ok(raw(r, 'imp', [S(r, 'imp').id]));
  assert.strictEqual(r.g.step.result.e.heir, S(r, 'baron')?.id ?? r.seats[1].id);
}
{
  const r = mk(['imp', 'scarletwoman', 'poisoner', 'chef', 'saint'], 'tb');
  go(r, ['imp']);
  const sw = S(r, 'scarletwoman');
  ok(raw(r, 'imp', [S(r, 'imp').id]));
  assert.strictEqual(r.g.step.result.e.heir, sw.id);
  assert.strictEqual(sw.role, 'imp');
}
{
  const r = mk(['imp', 'chef', 'saint', 'monk', 'empath'], 'tb');
  go(r, ['imp']);
  ok(raw(r, 'imp', [S(r, 'imp').id]));
  assert.ok(r.g.step.result.e.noHeir);
}
{
  const r = mk(['imp', 'baron', 'chef', 'saint', 'innkeeper'], 'bmr');
  go(r, ['innkeeper', 'imp']);
  const imp = S(r, 'imp');
  ok(raw(r, 'innkeeper', [imp.id, S(r, 'chef').id]));
  ok(st(r, 'decide', { choice: S(r, 'chef').id }));
  ok(raw(r, 'imp', [imp.id]));
  assert.ok(!imp.dead && imp.role === 'imp' && S(r, 'baron'), '不死不傳位');
}
for (const f of ['glyph', 'log', 'stepcard', 'fx-ab']) assert.ok(!readFileSync(new URL(`../public/js/${f}.js`, import.meta.url), 'utf8').includes('想殺'), f);

console.log('角色清單測試通過 ✔');
