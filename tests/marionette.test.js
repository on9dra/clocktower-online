// 提線木偶（2026-11-10）：以為自己是善良角色的爪牙，和惡魔鄰座；爪牙不認他，惡魔得知他；能力和酒鬼一樣失效。用法：node tests/marionette.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { nextTo, abnormal } from '../lib/util.js';
import { ROLES } from '../public/js/roles.js';
import { isBuiltin } from '../lib/script.js';
import { ok, st } from './helpers.js';

const SCRIPT = [{ id: '_meta', name: '木偶' }, 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker',
  'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint', 'lunatic',
  'poisoner', 'spy', 'scarletwoman', 'baron', 'marionette', 'imp'];
function room(n, venue) {
  const r = createRoom();
  if (venue) ok(st(r, 'venue', venue));
  assert.strictEqual(typeof st(r, 'upload', { entries: SCRIPT }), 'object'); // 上傳返回劇本摘要
  if (venue?.devices === 'one') ok(st(r, 'addSeats', { names: Array.from({ length: n }, (_, i) => 'n' + i) }));
  else for (let i = 0; i < n; i++) joinPlayer(r, 'p' + i, 'n' + i);
  return r;
}
const set = (r, roles, fakes = {}) => roles.forEach((roleId, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId, fakeRole: fakes[i] })));
const S = (r, role) => r.seats.find(s => s.role === role);

assert.ok(isBuiltin('marionette'), '提線木偶是內置角色（不再走混合推進）');

// 隨機抽取：抽到提線木偶就和惡魔鄰座；他以為自己是不在場的鎮民，惡魔的偽裝不和他撞
for (let k = 0; k < 40; k++) {
  const r = room(9);
  ok(st(r, 'roleRule', { roleId: 'marionette', rule: 'lock' }));
  if (k % 2) ok(st(r, 'setRole', { seatId: r.seats[4].id, roleId: 'imp' })); // 惡魔指定在 5 號：只能挪提線木偶
  ok(st(r, 'draft'));
  const m = S(r, 'marionette'), d = r.seats.find(s => ROLES[s.role].team === 'demon');
  assert.ok(m && d && nextTo(r, m, d), '提線木偶和惡魔鄰座');
  assert.strictEqual(ROLES[m.fakeRole].team, 'townsfolk');
  assert.ok(!r.seats.some(s => s.role === m.fakeRole), '以為的角色不在場');
  assert.ok(!r.g.bluffs.includes(m.fakeRole), '惡魔偽裝不是他以為的角色');
}
console.log('隨機抽取：提線木偶坐在惡魔旁邊 ✔');

// 指定：可以以為自己是鎮民或外來者，不能是邪惡角色，也不能是酒鬼、瘋子這種本身也是「以為」的
{
  const r = room(8);
  const seat = r.seats[1].id;
  ok(st(r, 'setRole', { seatId: seat, roleId: 'marionette', fakeRole: 'saint' }));
  assert.strictEqual(r.seats[1].fakeRole, 'saint');
  for (const bad of ['imp', 'poisoner', 'drunk', 'lunatic']) assert.strictEqual(typeof st(r, 'setRole', { seatId: seat, roleId: 'marionette', fakeRole: bad }), 'string', bad);
  ok(st(r, 'setRole', { seatId: seat, roleId: 'marionette' }));
  assert.strictEqual(ROLES[r.seats[1].fakeRole].team, 'townsfolk', '沒指定時以為是鎮民');
  console.log('提線木偶以為的角色：鎮民或外來者 ✔');
}

// 線上首夜：爪牙不認他，他什麼都不知道；惡魔得知他。他的手機和真圖書管理員一樣，能力失效（說書人卡上寫提線木偶，數學家算他）
{
  const r = room(8);
  set(r, ['imp', 'marionette', 'poisoner', 'empath', 'chef', 'washerwoman', 'monk', 'soldier'], { 1: 'librarian' });
  ok(st(r, 'next', { force: true }));
  const [imp, pup, poi] = r.seats;
  const msg = (to, src) => r.chat.find(m => m.to === to.id && m.info && m.src === src);
  const mi = msg(poi, 'minioninfo');
  assert.ok(mi && !mi.marks.some(k => k.seatId === pup.id) && !mi.f.some(t => t.s === pup.id), '爪牙不知道提線木偶');
  assert.ok(!msg(pup, 'minioninfo') && !msg(pup, 'demoninfo'), '提線木偶不醒');
  const di = msg(imp, 'demoninfo'), br = di.f.findIndex(t => t.op === 'br');
  assert.deepStrictEqual(di.f.slice(0, br).filter(t => t.s).map(t => t.s), [poi.id], '惡魔的爪牙一行不帶提線木偶');
  assert.ok(di.f.some(t => t.r === 'marionette') && di.marks.some(k => k.seatId === pup.id && k.r === 'marionette'), '惡魔得知誰是提線木偶');
  const v = viewFor(r, { pid: pup.pid });
  assert.deepStrictEqual([v.myRole, v.myAlign, v.bluffs], ['librarian', null, null], '他的手機上是圖書管理員，看不出陣營');
  const role = r.chat.find(m => m.to === pup.id && m.k === 'role');
  assert.ok(role && role.src === 'librarian', '發給他的角色是圖書管理員');
  for (let k = 0; k < 40 && !(r.g.step?.roleId === 'librarian'); k++) {
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', { ids: [r.seats.find(x => x.id !== s.seatId).id] }));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'decide') ok(st(r, 'decide', { choice: s.decide.options.at(-1).id }));
    else ok(st(r, 'ack'));
  }
  const s = r.g.step;
  assert.deepStrictEqual([s.roleId, s.seatId, s.form.why, s.form.free], ['librarian', pup.id, 'puppet', true], '按圖書管理員叫醒，信息可以給假的');
  abnormal(r, pup);
  assert.ok(r.g.abnormal.includes(pup.id), '數學家算提線木偶（官方相剋）');
  console.log('線上首夜：爪牙不認、惡魔得知、手機上看不出 ✔');
}

// 單設備：爪牙那一步沒有他；瘋子看到的假爪牙和真惡魔看到的一樣多；惡魔那一步多一行提線木偶
{
  const r = room(8, { venue: 'offline', devices: 'one' });
  set(r, ['imp', 'marionette', 'poisoner', 'lunatic', 'chef', 'washerwoman', 'monk', 'soldier'], { 1: 'empath', 3: 'imp' });
  ok(st(r, 'next', { force: true }));
  const [imp, pup, poi, luna] = r.seats;
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.lines.map(l => l.seatId)], ['minioninfo', [poi.id]]);
  ok(st(r, 'ack'));
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.lines[0].minions.length], ['lunainfo', 1], '瘋子的假爪牙一個（提線木偶不算）');
  ok(st(r, 'ack'));
  const d = r.g.step.lines[0];
  assert.deepStrictEqual([r.g.step.roleId, d.seatId, d.minions, d.luna, d.pup], ['demoninfo', imp.id, [poi.id], luna.id, pup.id]);
  console.log('單設備首夜：提線木偶只在惡魔那一步 ✔');
}
