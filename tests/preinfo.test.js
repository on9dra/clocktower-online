// 開局前預選首夜信息：洗衣婦 / 圖書管理員 / 調查員（兩名玩家之一是 X）、祖母的孫子。用法：node tests/preinfo.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp } from '../lib/ops.js';
import { ok, st } from './helpers.js';
import { autoPicks } from '../lib/engine.js';
import { preForms } from '../lib/setup.js';
import { ROLES } from '../public/js/roles.js';

const bad = (r, op, args) => assert.strictEqual(typeof st(r, op, args), 'string', op + ' 應該被拒絕');
function lobby(roles, script = 'tb') {
  const r = createRoom();
  r.settings.pretend = false;
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  if (script !== 'tb') ok(st(r, 'script', { scriptId: script }));
  ok(st(r, 'seatCount', { n: roles.length }));
  roles.forEach((x, i) => { const [role, fake] = x.split('>'); ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: role, fakeRole: fake })); });
  return r;
}
// 走到某個角色的首夜那一步（前面的一律按系統預選的走）
function upTo(r, roleId) {
  ok(applyStOp(r, { op: 'next', force: true }));
  for (let i = 0; i < 60 && r.phase === 'night'; i++) {
    const s = r.g.step;
    if (s.roleId === roleId && s.status !== 'fake') return s;
    const res = s.status === 'choose' ? st(r, 'pick', autoPicks(r, s)) : s.status === 'confirm' ? st(r, 'confirm', { fields: s.form.truth })
      : s.status === 'decide' ? st(r, 'decide', { choice: s.decide.options[0].id }) : s.status === 'fake' ? st(r, 'pretend') : st(r, 'ack');
    assert.notStrictEqual(typeof res, 'string', `${s.roleId} ${s.status}：${res}`);
  }
  assert.fail(`沒走到 ${roleId}`);
}

// 能預選的座位：洗衣婦、圖書管理員、以為自己是調查員的酒鬼（信息可以是錯的）
{
  const r = lobby(['imp', 'poisoner', 'librarian', 'butler', 'washerwoman', 'drunk>investigator', 'monk', 'chef']);
  const f = Object.fromEntries(preForms(r).map(x => [x.roleId, x]));
  assert.deepStrictEqual(Object.keys(f).sort(), ['investigator', 'librarian', 'washerwoman']);
  assert(!f.librarian.form.free && f.investigator.form.free && f.investigator.form.why === 'drunk', '酒鬼的那份可以給錯的');
  assert.deepStrictEqual(Object.keys(f.librarian.form.roleOf).map(id => r.seats.findIndex(s => s.id === id) + 1).sort(), [4, 6], '管家和酒鬼是外來者');
  const lib = r.seats[2], [a, b] = [r.seats[3].id, r.seats[0].id];
  bad(r, 'setPre', { seatId: r.seats[7].id, fields: { a, b, role: 'butler' } }); // 廚師沒有要預選的
  bad(r, 'setPre', { seatId: lib.id, fields: { a: lib.id, b, role: 'butler' } }); // 不能選他自己
  bad(r, 'setPre', { seatId: lib.id, fields: { a, b: a, role: 'butler' } });
  ok(st(r, 'setPre', { seatId: lib.id, fields: { a: null, b, role: null } })); // 沒選完的也記著
  ok(st(r, 'setPre', { seatId: lib.id, fields: { a, b, role: 'butler' } }));
  // 首夜那一步：卡片按預選預填（form.pre），真相照樣是系統算的
  const step = upTo(r, 'librarian');
  assert.deepStrictEqual(step.form.pre, { a, b, role: 'butler' });
  ok(st(r, 'confirm', { fields: step.form.pre }));
  console.log('預選兩名玩家之一的信息 ✔');
}

// 重新抽角色：預選作廢；清掉：null
{
  const r = lobby(['imp', 'poisoner', 'librarian', 'butler', 'washerwoman', 'saint', 'monk', 'chef']);
  const lib = r.seats[2];
  ok(st(r, 'setPre', { seatId: lib.id, fields: { none: true } }));
  assert.deepStrictEqual(r.g.pre[lib.id], { none: true });
  ok(st(r, 'setPre', { seatId: lib.id, fields: null }));
  assert(!r.g.pre[lib.id]);
  ok(st(r, 'setPre', { seatId: r.seats[4].id, fields: { a: r.seats[6].id, b: r.seats[7].id, role: 'monk' } }));
  ok(st(r, 'draft'));
  assert(!r.g.pre?.[r.seats[4].id], '重新抽角色，預選作廢');
  console.log('預選清除、重抽作廢 ✔');
}

// 祖母：預選的孫子在首夜的裁定卡上先選好（decide.pick），說書人照樣能換
{
  const r = lobby(['po', 'godfather', 'grandmother', 'sailor', 'chambermaid', 'exorcist', 'innkeeper'], 'bmr');
  const gm = r.seats[2], kid = r.seats[5];
  bad(r, 'setPre', { seatId: gm.id, fields: { pick: r.seats[1].id } }); // 教父是邪惡的
  ok(st(r, 'setPre', { seatId: gm.id, fields: { pick: kid.id } }));
  const step = upTo(r, 'grandmother');
  assert.strictEqual(step.status, 'decide');
  assert.strictEqual(step.decide.pick, kid.id);
  ok(st(r, 'decide', { choice: r.seats[4].id })); // 換成別人
  assert.strictEqual(r.g.grandchild[gm.id], r.seats[4].id);
  console.log('預選祖母的孫子 ✔');
}

// 系統不認識的角色（自製、沒收錄的官方角色）：通用的預選——要給他看的人和角色；首夜標記卡上照著展示，首夜還能改。系統自己算的（廚師）沒有預選
{
  const r = createRoom();
  r.settings.pretend = false;
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'seatCount', { n: 7 }));
  const up = applyStOp(r, { op: 'upload', entries: [{ id: '_meta', name: '混', firstNight: ['minioninfo', 'demoninfo', 'poisoner', 'hb', 'chef'] },
    'imp', 'poisoner', 'washerwoman', 'chef', 'empath', 'monk', 'saint',
    { id: 'hb', name: '點燈人', team: 'townsfolk', ability: '首夜得知兩名玩家和一個角色', firstNight: 30 }] });
  assert.strictEqual(typeof up, 'object', up);
  const hb = r.script.roles.find(id => ROLES[id]?.name === '點燈人');
  ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', hb].forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
  const kinds = Object.fromEntries(preForms(r).map(f => [f.roleId, f.kind]));
  assert.deepStrictEqual(kinds, { [hb]: 'free' }, '只有自製角色能預選，廚師這種系統算的沒有');
  const me = r.seats[6], [a, b] = [r.seats[2].id, r.seats[4].id];
  bad(r, 'setPre', { seatId: r.seats[2].id, fields: { seats: [a] } });
  bad(r, 'setPre', { seatId: me.id, fields: { seats: [a], roles: ['nope'] } });
  ok(st(r, 'setPre', { seatId: me.id, fields: { seats: [a, b], roles: ['washerwoman'] } }));
  const step = upTo(r, hb);
  assert.strictEqual(step.status, 'mark');
  assert.deepStrictEqual(r.g.pre[me.id], { seats: [a, b], roles: ['washerwoman'] });
  ok(st(r, 'setPre', { seatId: me.id, fields: { seats: [a], roles: ['chef'] } })); // 首夜還能改
  assert.deepStrictEqual(r.g.pre[me.id], { seats: [a], roles: ['chef'] });
  console.log('通用預選（自製角色） ✔');
}
