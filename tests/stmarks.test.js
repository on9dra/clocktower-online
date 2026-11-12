// 說書人的標記面板（座位右下角的「+」）和系統不認識的角色。用法：node tests/stmarks.test.js
//  · 中毒 / 醉酒是真的狀態：貼上就按規則失效，取下就解除（投毒者毒的也能在這裏取下）
//  · 系統不認識的角色死了也照樣停一步，交給說書人；死了的不在他手機上彈選人
//  · 寫給說書人看的能力：「你會得知」→「告知他」，「你要選擇」→「讓某角色選擇」
import assert from 'assert';
import { createRoom, remove } from '../lib/store.js';
import { applyStOp } from '../lib/ops.js';
import { markPrompt } from '../lib/engine.js';
import { isPoisoned, hasEff, seatTags } from '../lib/util.js';
import { ROLES } from '../public/js/roles.js';
import { ok, st } from './helpers.js';

globalThis.document ??= { documentElement: { dataset: {} } }; // lang.js 開頭要設 <html lang>
const { stAbility, markMeaning } = await import('../public/js/stside.js');

function game(entries, roles) {
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: roles.map((_, i) => '座' + i) }));
  const up = applyStOp(r, { op: 'upload', entries });
  assert.strictEqual(typeof up, 'object', up);
  const ids = r.script.roles;
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: ids.includes(roles[i]) ? roles[i] : ids.find(x => ROLES[x].name === roles[i]) })));
  ok(st(r, 'next'));
  return r;
}

// 中毒 / 醉酒：貼上、取下都是真的
{
  const r = game([{ id: '_meta', name: '標' }, 'imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'washerwoman'], ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'washerwoman']);
  const chef = r.seats[2], monk = r.seats[4];
  ok(st(r, 'setStatus', { seatId: chef.id, what: 'poison', on: true }));
  assert.ok(isPoisoned(r, chef), '貼上中毒就真的中毒');
  assert.ok(seatTags(r, chef).includes('中毒'));
  assert.strictEqual(seatTags(r, chef).filter(t => t === '中毒').length, 1, '只掛一枚');
  ok(st(r, 'setStatus', { seatId: chef.id, what: 'poison', on: false }));
  assert.ok(!isPoisoned(r, chef), '取下就解毒');
  // 投毒者毒的，在標記面板裏取下也是解毒（原來座位菜單的「解除中毒」）
  r.g.poisoned = monk.id;
  ok(st(r, 'setStatus', { seatId: monk.id, what: 'poison', on: false }));
  assert.ok(!isPoisoned(r, monk) && r.g.poisoned === null);
  ok(st(r, 'setStatus', { seatId: monk.id, what: 'drunk', on: true }));
  assert.ok(hasEff(r, monk, 'drunk'));
  ok(st(r, 'setStatus', { seatId: monk.id, what: 'drunk', on: false }));
  assert.ok(!hasEff(r, monk, 'drunk'));
  assert.ok(r.g.log.some(l => l.e?.k === 'fix' && l.e.what === 'drunk' && l.e.seat === monk.id), '記進流程');
  assert.strictEqual(typeof applyStOp(r, { op: 'setStatus', seatId: monk.id, what: 'fly', on: true }), 'string', '不認識的狀態拒絕');
  remove(r.code);
  console.log('標記面板裏的中毒 / 醉酒是真的 ✔');
}

// 系統不認識的角色：死了也停一步；死了的不在手機上彈選人
{
  const entries = [{ id: '_meta', name: '秉', otherNight: ['bb'] }, 'imp', 'poisoner', 'chef', 'empath', 'monk', 'saint',
    { id: 'bb', name: '秉笔', team: 'townsfolk', ability: '如果你在白天死亡，当晚你会得知一名善良玩家。如果你在夜晚死亡，当晚你会得知一名邪恶玩家。', otherNight: 50 }];
  const r = game(entries, ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', '秉笔']);
  const bb = r.seats[6];
  // 走完第一夜和第一天
  for (let guard = 0; r.phase === 'night' && guard < 50; guard++) {
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', { ids: [r.seats.find(x => x.id !== s.seatId).id] }));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'decide') ok(st(r, 'decide', { choice: s.decide.options[0].id }));
    else ok(st(r, 'ack'));
  }
  ok(st(r, 'setDead', { seatId: bb.id, dead: true }));
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  let met = null;
  for (let guard = 0; r.phase === 'night' && guard < 50; guard++) {
    const s = r.g.step;
    if (s.status === 'mark' && ROLES[s.roleId].name === '秉笔') { met = s; break; }
    if (s.status === 'choose') ok(st(r, 'pick', { ids: [r.seats.find(x => x.id !== s.seatId && !x.dead).id] }));
    else if (s.status === 'review') break;
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'decide') ok(st(r, 'decide', { choice: s.decide.options[0].id }));
    else ok(st(r, 'ack'));
  }
  assert.ok(met, '死了的秉笔照樣有一步標記卡，不默認跳過');
  assert.strictEqual(met.seatId, bb.id);
  assert.strictEqual(markPrompt(r, met), null, '死了的不在手機上彈選人');
  // 說書人的說法
  assert.strictEqual(stAbility(met.roleId), '如果秉笔在白天死亡，当晚告知他一名善良玩家。如果秉笔在夜晚死亡，当晚告知他一名邪恶玩家。');
  remove(r.code);
  console.log('不認識的角色死了也停一步 ✔');
}

// 能力換成說書人的說法、劇本自己的提醒標記是什麼意思
{
  const r = createRoom();
  const up = applyStOp(r, { op: 'upload', entries: [{ id: '_meta', name: '詞' }, 'imp',
    { id: 'xh', name: '熊孩子', team: 'townsfolk', ability: '每个夜晚，你要选择一个镇民角色：他的能力会产生错误信息，直到下个黄昏。', reminders: ['捣蛋'] },
    { id: 'mp', name: '孟婆', team: 'minion', ability: '每个夜晚*，你要选择一名玩家：如果他存活，那么他要选择让自己失去能力，或死亡并保留能力直到下个黄昏。', reminders: ['保留能力', '失去能力'] },
    { id: 'po2', name: '珀珀', team: 'demon', ability: '每个夜晚*，你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。', reminders: ['死亡', '攻击三次'] },
    { id: 'cun', name: '村汉', team: 'townsfolk', ability: '每个夜晚，你要选择一名玩家：你会得知他的阵营。[+0~2村汉]' }] });
  assert.strictEqual(typeof up, 'object', up);
  const id = name => r.script.roles.find(x => ROLES[x].name === name);
  assert.strictEqual(stAbility(id('熊孩子')), '每个夜晚，让熊孩子选择一个镇民角色：他的能力会产生错误信息，直到下个黄昏。');
  assert.strictEqual(stAbility(id('孟婆')), '每个夜晚，让孟婆选择一名玩家：如果他存活，那么他要选择让自己失去能力，或死亡并保留能力直到下个黄昏。');
  assert.strictEqual(stAbility(id('村汉')), '每个夜晚，让村汉选择一名玩家：告知村汉他的阵营。', '開局配置的方括號不念');
  assert.strictEqual(markMeaning(id('熊孩子'), '捣蛋', true), '他的能力会产生错误信息，直到下个黄昏。');
  assert.strictEqual(markMeaning(id('孟婆'), '保留能力'), '死亡并保留能力直到下个黄昏。');
  assert.strictEqual(markMeaning(id('孟婆'), '失去能力'), '他的能力不再生效。');
  assert.ok(markMeaning(id('珀珀'), '攻击三次').startsWith('每个夜晚'), '標記有好幾種時不猜是哪半句');
  assert.strictEqual(stAbility('imp'), '每個夜晚，讓小惡魔選擇一名玩家：他死亡。如果小惡魔以這種方式自殺，一名爪牙會變成小惡魔。');
  remove(r.code);
  console.log('說書人的說法、標記的意思 ✔');
}

// 「+」面板裏其他和規則有關的標記：被保護、處決不死、詛咒、瘋狂、能力已用都是真的；改回原陣營不擋隱士登記；諾-達鯴的毒取不下來
{
  const { evilAs, shieldOf } = await import('../lib/util.js').then(async u => ({ ...u, ...(await import('../lib/rules.js')) }));
  const r = game([{ id: '_meta', name: '態' }, 'imp', 'poisoner', 'slayer', 'virgin', 'courtier', 'recluse', 'chef'], ['imp', 'poisoner', 'slayer', 'virgin', 'courtier', 'recluse', 'chef']);
  const [, , slayer, virgin, courtier, recluse, chef] = r.seats;
  for (const what of ['protect', 'safe', 'curse', 'mad']) {
    ok(st(r, 'setStatus', { seatId: chef.id, what, on: true }));
    assert.ok(hasEff(r, chef, what), what + ' 貼上就生效');
  }
  assert.ok(seatTags(r, chef).includes('被保護') && seatTags(r, chef).includes('詛咒') && seatTags(r, chef).includes('處決不死') && seatTags(r, chef).includes('瘋狂'));
  assert.strictEqual(shieldOf(r, chef, { demon: true }), r.phase === 'night' ? 'protect' : shieldOf(r, chef, { demon: true }), '夜裏惡魔殺不死');
  assert.strictEqual(shieldOf(r, chef, { exec: true }), 'safe', '處決不死');
  for (const what of ['protect', 'safe', 'curse', 'mad']) ok(st(r, 'setStatus', { seatId: chef.id, what, on: false }));
  assert.ok(!['protect', 'safe', 'curse', 'mad'].some(k => hasEff(r, chef, k)), '取下就解除');
  // 能力已用：獵手、貞潔者、每局一次的角色是真的用掉了；廚師這種系統不記的只貼記號
  ok(st(r, 'setStatus', { seatId: slayer.id, what: 'used', on: true }));
  ok(st(r, 'setStatus', { seatId: virgin.id, what: 'used', on: true }));
  ok(st(r, 'setStatus', { seatId: courtier.id, what: 'used', on: true }));
  assert.ok(r.g.slayerUsed && r.g.virginUsed && r.g.used['courtier:' + courtier.id]);
  for (const s of [slayer, virgin, courtier]) assert.ok(seatTags(r, s).includes('能力已用'));
  ok(st(r, 'setStatus', { seatId: courtier.id, what: 'used', on: false }));
  assert.ok(!r.g.used['courtier:' + courtier.id], '取下能力已用：侍臣今晚照樣醒');
  ok(st(r, 'setStatus', { seatId: chef.id, what: 'used', on: true }));
  assert.ok(r.g.marks[chef.id].includes('能力已用'));
  // 陣營改過去再改回來：不記成被改過，隱士照樣能被當作邪惡
  ok(st(r, 'setAlign', { seatId: recluse.id, align: 'evil' }));
  assert.deepStrictEqual(evilAs(r, recluse), [true]);
  ok(st(r, 'setAlign', { seatId: recluse.id, align: 'good' }));
  assert.ok(!recluse.align && evilAs(r, recluse).includes(true), '改回原陣營後隱士照樣可以登記成邪惡');
  remove(r.code);
  // 諾-達鯴鄰座的鎮民：毒是算出來的，取下時說清楚為什麼取不下
  const r2 = game([{ id: '_meta', name: '諾' }, 'nodashii', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'washerwoman'], ['chef', 'nodashii', 'empath', 'poisoner', 'monk', 'saint', 'washerwoman']);
  const nb = r2.seats[0];
  assert.ok(isPoisoned(r2, nb));
  const err = applyStOp(r2, { op: 'setStatus', seatId: nb.id, what: 'poison', on: false });
  assert.ok(typeof err === 'string' && err.includes('諾-達鯴'), err);
  remove(r2.code);
  console.log('其他規則標記也是真的、陣營改回不擋登記 ✔');
}
