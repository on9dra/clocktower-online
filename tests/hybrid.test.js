// 混合推進：系統不認識的角色（自製、官方但沒有內置規則）在夜晚順序裏排一步 mark，說書人自己處理。用法：node tests/hybrid.test.js
import assert from 'assert';
import { createRoom, remove } from '../lib/store.js';
import { applyStOp } from '../lib/ops.js';
import { autoPicks } from '../lib/engine.js';
import { OFFICIAL } from '../lib/official.js';
import { isBuiltin } from '../lib/script.js';
import { ROLES } from '../public/js/roles.js';
import { ok, st } from './helpers.js';

// 線下單設備開一局：名字座位，按給的角色指定
function game(entries, roles) {
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: roles.map((_, i) => '座' + i) }));
  const up = applyStOp(r, { op: 'upload', entries });
  assert.strictEqual(typeof up, 'object', up);
  const ids = r.script.roles;
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: ids.includes(roles[i]) ? roles[i] : ids.find(x => ROLES[x].name === roles[i]) })));
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  return r;
}
// 說書人把今晚走完，記下每一步（角色、狀態）
function walk(r) {
  const seen = [];
  for (let guard = 0; r.phase === 'night' && guard < 200; guard++) {
    const step = r.g.step;
    seen.push({ r: step.roleId, s: step.status, free: step.form?.free });
    if (step.status === 'choose') {
      const { ids, role } = autoPicks(r, step);
      ok(st(r, 'pick', { ids, role }));
      if (['poisoner', 'monk', 'imp'].includes(step.roleId)) assert.ok(!(r.g.step?.roleId === step.roleId && r.g.step.status === 'ack'), '線下代點完不用再確認一次');
    } else if (step.status === 'mark') {
      ok(st(r, 'markPick', { ids: [r.seats[0].id] }));
      assert.ok(r.g.marks[r.seats[0].id].some(t => t.endsWith('選')), '被指的人掛標記');
      ok(st(r, 'ack'));
    } else if (step.status === 'ack') ok(st(r, 'ack'));
    else if (step.status === 'decide') ok(st(r, 'decide', { choice: step.decide.options[0].id }));
    else if (step.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'confirm', { fields: step.form.truth }));
  }
  return seen;
}

// 自製角色按 Json 自己的順序排：排在投毒者後面、洗衣婦前面
{
  const entries = [{ id: '_meta', name: '混', firstNight: ['minioninfo', 'demoninfo', 'poisoner', 'hb', 'washerwoman', 'chef', 'empath'] },
    'imp', 'poisoner', 'washerwoman', 'chef', 'empath', 'monk', 'saint',
    { id: 'hb', name: '點燈人', team: 'townsfolk', ability: '首夜選一名玩家', firstNight: 30, firstNightReminder: '叫醒點燈人，讓他指一名玩家' }];
  const r = game(entries, ['imp', 'poisoner', 'washerwoman', 'chef', 'empath', 'monk', '點燈人']);
  const seen = walk(r);
  const order = seen.map(x => x.r);
  const hb = seen.find(x => x.s === 'mark');
  assert.ok(hb, '自製角色要有一步標記卡');
  assert.ok(order.indexOf(hb.r) > order.indexOf('poisoner') && order.indexOf(hb.r) < order.indexOf('washerwoman'), order.join(' '));
  assert.ok(seen.filter(x => x.s === 'ack' && (x.r === 'minioninfo' || x.r === 'demoninfo')).length === 2, '線下首夜爪牙 / 惡魔信息停下來等說書人');
  assert.ok(seen.filter(x => x.s === 'confirm').every(x => x.free), '場上有不認識的角色：信息表都放開');
  assert.ok(r.g.log.some(l => l.e?.k === 'card' && l.e.seat === r.seats[6].id), '標記卡上點的人記進日誌');
  assert.strictEqual(r.phase, 'day');
  remove(r.code);
  console.log('自製角色按 Json 順序排 ✔');
}

// 官方但沒有內置規則的角色：按官方順序表插在內置角色之間；只在其他夜晚行動的首夜不醒
{
  const entries = [{ id: '_meta', name: '官' }, 'imp', 'poisoner', 'washerwoman', 'chef', 'empath', 'fortuneteller', 'butler', 'noble', 'pixie', 'acrobat'];
  const r = game(entries, ['imp', 'poisoner', 'washerwoman', 'chef', 'noble', 'pixie', 'acrobat', 'fortuneteller']);
  const steps = walk(r).filter(x => x.r !== 'minioninfo' && x.r !== 'demoninfo' && x.s !== 'review');
  const num = id => OFFICIAL[id]?.first;
  const nums = [...new Set(steps.map(x => x.r))].map(num);
  assert.deepStrictEqual(nums, [...nums].sort((a, b) => a - b), '和官方首夜順序一致：' + steps.map(x => x.r).join(' '));
  assert.ok(steps.some(x => x.r === 'noble' && x.s === 'mark') && steps.some(x => x.r === 'pixie' && x.s === 'mark'));
  assert.ok(!steps.some(x => x.r === 'acrobat'), '雜技演員首夜不醒');
  assert.ok(!isBuiltin('noble') && isBuiltin('chef'));
  // 第二夜：雜技演員醒，排在官方順序裏的位置
  ok(st(r, 'next')); // 結束白天
  assert.strictEqual(r.phase, 'night');
  assert.ok(walk(r).some(x => x.r === 'acrobat' && x.s === 'mark'));
  remove(r.code);
  console.log('官方角色按官方順序排 ✔');
}

// 線下白天：替人開槍、雜耍藝人猜
{
  const r = game([{ id: '_meta', name: '白' }, 'imp', 'poisoner', 'slayer', 'juggler', 'chef', 'empath', 'monk', 'philosopher'],
    ['imp', 'poisoner', 'slayer', 'juggler', 'chef', 'empath', 'monk']);
  walk(r);
  assert.strictEqual(r.phase, 'day');
  const [imp, , slayer, juggler, chef] = r.seats;
  Object.assign(chef, { was: 'philosopher', role: 'clockmaker' }); // 獲得了鐘錶匠能力的哲學家還是哲學家
  ok(st(r, 'juggleFor', { seatId: juggler.id, guesses: [{ id: imp.id, role: 'imp' }, { id: chef.id, role: 'philosopher' }] }));
  assert.deepStrictEqual(r.g.juggle[juggler.id].map(x => x.hit), [true, true]);
  Object.assign(chef, { was: null, role: 'chef' });
  ok(st(r, 'setPoison', { seatId: null })); // 夜裏隨機選人可能毒到獵手，那一槍按規則只能無效
  ok(st(r, 'slayFor', { fromId: slayer.id, toId: imp.id }));
  assert.ok(r.g.ruling, '開槍要說書人裁定');
  ok(st(r, 'rule', { work: true }));
  assert.ok(imp.dead && r.phase === 'ended', '獵手打中惡魔，善良獲勝');
  remove(r.code);
  console.log('線下白天代行 ✔');
}
