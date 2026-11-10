// 2026-11-10 線下角色審驗發現的問題：每條一個最小場景。用法：node tests/audit.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { autoPicks } from '../lib/engine.js';
import { teamOf } from '../lib/util.js';
import { ROLES } from '../public/js/roles.js';
import { isBuiltin } from '../lib/script.js';

const st = (r, op, a = {}) => { const x = applyStOp(r, { op, ...a }); assert.strictEqual(typeof x === 'string' ? x : undefined, undefined, op); return x; };
function mk(dev, roles) {
  const r = createRoom();
  st(r, 'venue', { venue: 'offline', devices: dev });
  const all = Object.keys(ROLES).filter(k => isBuiltin(k) && ['townsfolk', 'outsider', 'minion', 'demon'].includes(ROLES[k].team));
  st(r, 'upload', { entries: [{ id: '_meta', name: 'all' }, ...all] });
  if (dev === 'one') st(r, 'addSeats', { names: roles.map((_, i) => 'n' + (i + 1)) });
  else roles.forEach((_, i) => joinPlayer(r, 'p' + i, 'n' + i));
  roles.forEach((x, i) => st(r, 'setRole', { seatId: r.seats[i].id, roleId: x }));
  st(r, 'next', { force: true });
  return r;
}
// 走夜晚：policy[roleId](step) 返回要點的 { ids, role }，裁定選最後一項；stop(step) 為真時停下
function drive(r, policy = {}, stop = () => false) {
  for (let k = 0; k < 80 && r.phase === 'night'; k++) {
    const s = r.g.step;
    if (stop(s)) return s;
    const p = s.status === 'choose' ? policy[s.roleId]?.(s, r) : undefined;
    if (s.status === 'review') st(r, 'dawn');
    else if (s.status === 'choose') st(r, 'pick', p || autoPicks(r, s));
    else if (s.status === 'confirm') st(r, 'confirm', { fields: s.form.truth });
    else if (s.status === 'decide') st(r, 'decide', { choice: s.decide.options.at(-1).id });
    else st(r, 'ack');
  }
}
function passDay(r) {
  if (r.phase === 'dawn') st(r, 'next');
  for (const w of [...(r.g.lastWords || [])]) st(r, 'word', { seatId: w.seatId, targetId: null });
  if (r.phase === 'day') st(r, 'next');
}
const id = (r, i) => r.seats[i].id;

// 莽夫被選中轉陣營：單設備停下給莽夫看
{
  const r = mk('one', ['imp', 'poisoner', 'goon', 'chef', 'chef', 'librarian', 'chef', 'chef']);
  const s = drive(r, { poisoner: () => ({ ids: [id(r, 2)] }) }, s => s.roleId === 'poisoner' && s.status === 'ack');
  assert(s, '投毒者選了莽夫之後停下');
  assert.deepStrictEqual(s.told.map(t => t.seatId), [id(r, 2)]);
  console.log('莽夫轉陣營停下 ✔');
}
// 瘋子沒有能力：選中莽夫不佔掉今晚的觸發
{
  const r = mk('many', ['po', 'lunatic', 'goon', 'chef', 'chef', 'chef', 'librarian', 'chef']);
  drive(r, {}, s => s.roleId === 'lunatic'); // 首夜瘋子不醒；走到白天
  passDay(r);
  drive(r, { lunatic: () => ({ ids: [id(r, 2)] }), po: () => ({ ids: [id(r, 2)] }) });
  assert.strictEqual(r.seats[2].align, 'evil', '真珀第一個用能力選中莽夫');
  console.log('瘋子不觸發莽夫 ✔');
}
// 被驅魔的沙巴洛斯照樣反芻
{
  const r = mk('one', ['shabaloth', 'exorcist', 'soldier', 'chef', 'chef', 'chef', 'librarian', 'chef']);
  drive(r); passDay(r);
  drive(r, { shabaloth: () => ({ ids: [id(r, 3), id(r, 4)] }), exorcist: () => ({ ids: [id(r, 5)] }) }); passDay(r);
  const s = drive(r, { exorcist: () => ({ ids: [id(r, 0)] }) }, s => s.roleId === 'shabaloth');
  assert.deepStrictEqual([s?.status, s?.decide?.kind], ['decide', 'regurgitate']);
  st(r, 'decide', { choice: id(r, 3) });
  assert(!r.seats[3].dead, '反芻復活');
  assert.notStrictEqual(r.g.step.roleId, 'shabaloth', '被驅魔：反芻完不叫醒他');
  console.log('驅魔人與沙巴洛斯反芻 ✔');
}
// 獲得外來者能力的哲學家還是鎮民：方古選他不跳身
{
  const r = mk('one', ['fanggu', 'witch', 'philosopher', 'clockmaker', 'dreamer', 'mutant', 'oracle', 'seamstress', 'artist']);
  drive(r, { philosopher: () => ({ ids: [], role: 'sweetheart' }) });
  assert.strictEqual(teamOf(r.seats[2]), 'townsfolk');
  passDay(r);
  drive(r, { fanggu: () => ({ ids: [id(r, 2)] }) });
  assert.strictEqual(r.seats[0].role, 'fanggu', '方古沒有跳到哲學家身上');
  console.log('哲學家仍是鎮民 ✔');
}
// 獵手打已經死了的舊惡魔：沒有效果
{
  const r = mk('many', ['imp', 'scarletwoman', 'slayer', 'chef', 'chef', 'chef', 'librarian', 'chef']);
  drive(r); passDay(r);
  drive(r, { imp: () => ({ ids: [id(r, 0)] }) }); // 自殺傳位
  assert.strictEqual(r.seats[1].role, 'imp');
  if (r.phase === 'dawn') st(r, 'next');
  st(r, 'slayFor', { fromId: id(r, 2), toId: id(r, 0) });
  assert(r.g.ruling?.forced && !r.g.ruling.auto, '必定未中');
  console.log('獵手打死人 ✔');
}
// 白天處決惡魔、紅唇女郎接任：線下說書人那邊留一條提示，點了才消失（處決後直接入夜，提示帶進夜裏）
{
  const r = mk('one', ['imp', 'scarletwoman', 'chef', 'empath', 'monk', 'saint', 'soldier', 'slayer']);
  const fixed = { imp: () => ({ ids: [id(r, 7)] }), poisoner: () => ({ ids: [id(r, 5)] }), monk: () => ({ ids: [id(r, 2)] }) }; // 不讓小惡魔隨機自殺傳位
  drive(r, fixed); passDay(r); // 第一天不處決
  drive(r, fixed); if (r.phase === 'dawn') st(r, 'next');
  for (const w of [...(r.g.lastWords || [])]) st(r, 'word', { seatId: w.seatId, targetId: null });
  st(r, 'nominate', { fromId: id(r, 2), toId: id(r, 0) });
  for (const x of r.seats.filter(x => !x.dead)) st(r, 'handVote', { seatId: x.id, v: true });
  st(r, 'closeVote');
  st(r, 'next');
  st(r, 'rule', { work: true });
  assert.strictEqual(r.seats[1].role, 'imp');
  assert.deepStrictEqual(r.g.notice?.map(n => n.seatId), [id(r, 1)]);
  st(r, 'notice');
  assert.strictEqual(r.g.notice.length, 0);
  console.log('紅唇女郎白天接任提示 ✔');
}
// 麻臉巫婆把人變成瘋子：他以為自己是場上的惡魔（有 fakeRole，夜裏按惡魔喚醒）
{
  const r = mk('many', ['pithag', 'imp', 'chef', 'empath', 'monk', 'saint', 'soldier', 'slayer']);
  drive(r); passDay(r);
  drive(r, { pithag: () => ({ ids: [id(r, 2)], role: 'lunatic' }) }, s => s.roleId === 'imp');
  assert.deepStrictEqual([r.seats[2].role, r.seats[2].fakeRole], ['lunatic', 'imp']);
  console.log('麻臉巫婆造瘋子 ✔');
}
// 線下的酒鬼：說書人替他點了，不再停一張只有「無效」的裁定卡
{
  const r = mk('one', ['imp', 'poisoner', 'drunk', 'chef', 'empath', 'saint', 'soldier', 'slayer']);
  r.seats[2].fakeRole = 'monk';
  drive(r); passDay(r);
  const seen = [];
  drive(r, {}, s => { seen.push(`${s.roleId}:${s.status}`); return false; });
  assert(!seen.includes('monk:decide'), seen.join(' '));
  console.log('線下酒鬼不停無效卡 ✔');
}
