// 混合推進：系統不認識的角色（自製、官方但沒有內置規則）在夜晚順序裏排一步 mark，說書人自己處理。用法：node tests/hybrid.test.js
import assert from 'assert';
import { createRoom, remove } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { autoPicks, markAsk, markCons } from '../lib/engine.js';
import { viewFor } from '../lib/view.js';
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

// ───── 標記卡上當場結算、線上手機選人 ─────
const HB = [{ id: '_meta', name: '自' }, 'washerwoman', 'empath', 'monk', 'soldier', 'ravenkeeper', 'sage', 'butler', 'noble',
  { id: 'd', name: '夜魘', team: 'demon', ability: '每個夜晚*，你要選擇一名玩家：他死亡。', otherNight: 30 },
  { id: 'a', name: '縱火犯', team: 'minion', ability: '每個夜晚，你要選擇一名玩家：他明天白天中毒。', firstNight: 22, otherNight: 9 },
  { id: 'l', name: '點燈人', team: 'townsfolk', ability: '在你的首個夜晚，你要選擇一名玩家：你會得知他是否為邪惡陣營。', firstNight: 38 },
  { id: 'g', name: '守墓人', team: 'townsfolk', ability: '每個夜晚*，你會得知今天死亡的玩家中有多少個邪惡玩家。', otherNight: 80 }];
const CAST = ['夜魘', '縱火犯', '點燈人', 'ravenkeeper', 'soldier', 'monk', 'empath', '守墓人', 'sage'];
// 線上：玩家各自有手機
function online(roles) {
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'online' }));
  roles.forEach((_, i) => joinPlayer(r, 'p' + i, 'n' + i));
  assert.strictEqual(typeof applyStOp(r, { op: 'upload', entries: HB }), 'object');
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: r.script.roles.find(x => x === roles[i] || ROLES[x].name === roles[i]) })));
  ok(st(r, 'next', { force: true }));
  return r;
}
const promptOf = (r, s) => viewFor(r, { pid: s.pid }).prompt;
const tagsOf = (r, s) => viewFor(r, { st: true }).seats.find(x => x.id === s.id).tags;
const nameOf = r => (r.g.step ? ROLES[r.g.step.roleId]?.name || r.g.step.roleId : null); // 天亮前確認是 dawn
// 走到某個角色的那一步：內置角色選人的都選 pick，信息按真相給
function until(r, name, pick) {
  for (let i = 0; i < 40 && r.phase === 'night' && nameOf(r) !== name; i++) {
    const s = r.g.step;
    if (s.status === 'choose') ok(applyPlayerAction(r, r.seats.find(x => x.id === s.seatId).pid, { act: 'pick', ids: [pick.id] }));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'fake') ok(st(r, 'pretend'));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'ack'));
  }
  assert.strictEqual(nameOf(r), name, '走到 ' + name);
}

// 能力文字裏認得出來的：選幾個人、選了會怎樣
{
  const r = online(CAST), id = n => r.script.roles.find(x => ROLES[x].name === n);
  assert.deepStrictEqual(markAsk(id('夜魘')), { n: 1, any: false, opt: false });
  assert.deepStrictEqual(markCons(id('夜魘')), ['kill']);
  assert.deepStrictEqual(markCons(id('縱火犯')), ['poison']);
  assert.deepStrictEqual(markCons(id('點燈人')), [], '只得知信息的沒有後果');
  assert.strictEqual(markAsk(id('守墓人')), null, '不用選人');
  assert.strictEqual(markAsk('noble'), null);
  assert.deepStrictEqual(markCons('acrobat'), [], '「如果當晚他醉酒或中毒，你死亡」不是讓他中毒');
  assert.deepStrictEqual(markCons('lycanthrope'), ['kill']);
  assert.deepStrictEqual(markAsk('alhadikhia'), { n: 3, any: false, opt: true });
  assert.strictEqual(markAsk('engineer'), null, '選角色的不彈選人牌');
  remove(r.code);
}

// 線上：輪到自製角色，他的手機上彈選人牌；選完記在說書人的卡上，說書人按「中毒」當場生效，到明天黃昏
{
  const r = online(CAST), [demon, arson, lamp, , , , empath, grave] = r.seats;
  until(r, '縱火犯');
  assert.deepStrictEqual(r.g.step.cons, ['poison']);
  assert.strictEqual(promptOf(r, lamp), null, '別人的手機沒有提示');
  const p = promptOf(r, arson);
  assert.ok(p?.mark && p.count === 1 && p.stepId === r.g.step.id, '縱火犯的手機彈選人牌');
  assert.strictEqual(applyPlayerAction(r, lamp.pid, { act: 'pick', ids: [demon.id] }), '還沒輪到你');
  assert.ok(applyPlayerAction(r, arson.pid, { act: 'pick', ids: [demon.id, lamp.id] }), '多選了不收');
  assert.strictEqual(st(r, 'markDo', { what: 'poison' }), '先在桌上點他選的人');
  ok(applyPlayerAction(r, arson.pid, { act: 'pick', ids: [empath.id] }));
  assert.deepStrictEqual(r.g.step.picks, [empath.id]);
  assert.strictEqual(promptOf(r, arson), null, '選完牌就收了');
  assert.ok(r.chat.some(m => m.to === arson.id && m.k === 'act'), '他的面板上記一筆');
  ok(st(r, 'markDo', { what: 'poison' }));
  assert.ok(tagsOf(r, empath).includes('中毒'));
  ok(st(r, 'markDo', { what: 'poison', on: false }));
  assert.ok(!tagsOf(r, empath).includes('中毒'), '再按一次收回');
  ok(st(r, 'markDo', { what: 'poison' }));
  ok(st(r, 'ack'));
  assert.ok(r.g.log.some(l => l.e?.k === 'card' && l.e.seat === arson.id), '下一個時才記「誰選了誰」');
  until(r, '共情者');
  assert.strictEqual(r.g.step.form.why, 'poison', '中毒的共情者：信息卡上寫著中毒');
  ok(st(r, 'confirm', { fields: r.g.step.form.truth }));
  until(r, 'dawn');
  ok(st(r, 'dawn'));
  assert.ok(tagsOf(r, empath).includes('中毒'), '白天還中毒');
  r.g.dayOver = true;
  ok(st(r, 'next'));
  assert.ok(!tagsOf(r, empath).includes('中毒'), '入夜就解了');
  // 不用選人的（只得知信息）：手機上只告訴他輪到了，說書人把信息發過去
  until(r, '夜魘', demon);
  ok(st(r, 'ack'));
  until(r, '守墓人', demon);
  assert.strictEqual(r.g.step.ask, null);
  assert.ok(promptOf(r, grave)?.wake, '守墓人的手機：輪到你了');
  assert.strictEqual(applyPlayerAction(r, grave.pid, { act: 'pick', ids: [demon.id] }), '現在不需要選擇');
  ok(st(r, 'tellInfo', { seatId: grave.id, text: '0' }));
  assert.strictEqual(promptOf(r, grave), null, '信息發到了，那張牌收走');
  remove(r.code);
  console.log('線上：自製角色手機選人、當場中毒 ✔');
}

// 自製惡魔殺人：照規則看保護；殺了守鴉人，守鴉人今晚就醒；殺了賢者，賢者得知惡魔
{
  const r = online(CAST), [demon, , , raven, soldier, monk, , , sage] = r.seats;
  until(r, 'dawn');
  ok(st(r, 'dawn'));
  r.g.dayOver = true;
  ok(st(r, 'next'));
  until(r, '夜魘', sage); // 僧侶保護賢者
  ok(st(r, 'markPick', { ids: [soldier.id] }));
  assert.deepStrictEqual(st(r, 'markDo', { what: 'kill' }).blocked?.map(b => b.id), [soldier.id], '士兵擋住了');
  assert.ok(!soldier.dead);
  ok(st(r, 'markPick', { ids: [sage.id] }));
  assert.strictEqual(st(r, 'markDo', { what: 'kill' }).blocked?.[0].why, '被保護', '僧侶保護的人不死，告訴說書人原因');
  assert.ok(!sage.dead);
  ok(st(r, 'markDo', { what: 'kill', force: true })); // 說書人認為這個能力擋不住
  assert.ok(sage.dead && r.g.sageDue?.[sage.id] === demon.id, '照樣殺死：賢者記下是誰殺的');
  ok(st(r, 'markDo', { what: 'kill', on: false }));
  assert.ok(!sage.dead && !r.g.diedTonight.includes(sage.id), '收回');
  ok(st(r, 'markPick', { ids: [raven.id] }));
  ok(st(r, 'markDo', { what: 'kill' }));
  assert.ok(raven.dead && raven.deathBy === 'demon' && r.g.diedTonight.includes(raven.id));
  ok(st(r, 'ack'));
  until(r, '守鴉人', demon);
  assert.strictEqual(r.g.step.status, 'choose', '守鴉人今晚醒來選人');
  assert.strictEqual(promptOf(r, raven)?.roleId, 'ravenkeeper');
  remove(r.code);
  console.log('自製惡魔殺人接上保護和死亡觸發 ✔');
}

// 劇本自己寫的夜晚順序：僧侶寫在投毒者前面（和內置表相反）時，排在他們後面的自製惡魔仍然在僧侶之後——先保護再殺人
// 選兩人、任意數量、至多兩人的選人牌；「某角色選」留到下一次入夜就清掉
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'online' }));
  const cast = ['潮', '渡', 'monk', 'poisoner', '鐘', 'empath', 'chef'];
  cast.forEach((_, i) => joinPlayer(r, 'q' + i, 'n' + i));
  const up = applyStOp(r, { op: 'upload', entries: [{ id: '_meta', name: '序', otherNight: ['dusk', 'bo', 'monk', 'poisoner', 'ti', 'be', 'empath', 'dawn'], firstNight: ['bo', 'poisoner', 'chef', 'empath'] },
    'monk', 'poisoner', 'empath', 'chef', 'butler',
    { id: 'ti', name: '潮', team: 'demon', ability: '每個夜晚*，你要選擇任意數量的玩家：他們死亡。' },
    { id: 'bo', name: '渡', team: 'minion', ability: '每個夜晚，你要選擇兩名玩家：他們今晚醉酒。' },
    { id: 'be', name: '鐘', team: 'townsfolk', ability: '每個夜晚*，你可以選擇至多兩名玩家：如果其中有惡魔，你會得知。' }] });
  assert.strictEqual(typeof up, 'object', up);
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: r.script.roles.find(x => x === cast[i] || ROLES[x].name === cast[i]) })));
  ok(st(r, 'next', { force: true }));
  const [tide, boat, monk, , bell, emp] = r.seats;
  until(r, '渡');
  assert.deepStrictEqual(promptOf(r, boat).counts, [2]);
  assert.ok(applyPlayerAction(r, boat.pid, { act: 'pick', ids: [emp.id] }), '只選一個不收');
  ok(applyPlayerAction(r, boat.pid, { act: 'pick', ids: [emp.id, monk.id] }));
  ok(st(r, 'markDo', { what: 'drunk' }));
  assert.ok(tagsOf(r, emp).includes('醉酒') && tagsOf(r, monk).includes('醉酒'));
  until(r, 'dawn', tide); ok(st(r, 'dawn'));
  assert.ok(tagsOf(r, emp).includes('渡選'), '白天還看得到昨晚誰被選了');
  r.g.dayOver = true; ok(st(r, 'next'));
  assert.ok(!tagsOf(r, emp).includes('渡選') && !tagsOf(r, emp).includes('醉酒'), '入夜：選人標記清掉，醉酒也過了');
  const order = r.g.order.map(id => ROLES[id].name);
  assert.ok(order.indexOf('潮') > order.indexOf('僧侶') && order.indexOf('潮') > order.indexOf('投毒者'), '自製惡魔在僧侶之後：' + order.join(' '));
  assert.ok(order.indexOf('鐘') > order.indexOf('潮'), order.join(' '));
  until(r, '潮', emp);
  assert.ok(promptOf(r, tide).any && promptOf(r, tide).prompt === '選擇任意數量的玩家');
  ok(applyPlayerAction(r, tide.pid, { act: 'pick', ids: [] }));
  assert.strictEqual(r.g.step.sent, true, '一個都不選也算選完了');
  ok(st(r, 'ack'));
  until(r, '鐘', emp);
  assert.deepStrictEqual(promptOf(r, bell).counts, [0, 1, 2]);
  assert.strictEqual(promptOf(r, bell).prompt, '選擇至多 2 名玩家');
  remove(r.code);
  console.log('劇本自帶順序、選人數的幾種寫法 ✔');
}

// 線下：手機不彈牌（說書人當面叫醒），其餘一樣
{
  const r = game(HB, CAST), arson = r.seats[1];
  for (let i = 0; i < 10 && nameOf(r) !== '縱火犯'; i++) ok(st(r, 'ack'));
  assert.strictEqual(r.g.step.status, 'mark');
  assert.strictEqual(viewFor(r, { st: true }).st.step.ask.n, 1);
  ok(st(r, 'markPick', { ids: [r.seats[6].id] }));
  ok(st(r, 'markDo', { what: 'poison' }));
  ok(st(r, 'undo'));
  assert.ok(!viewFor(r, { st: true }).seats[6].tags.includes('中毒'), '線下可以撤銷');
  assert.ok(arson.local);
  remove(r.code);
  console.log('線下標記卡結算 ✔');
}
