// 線下多設備：夜裏私密信息發到了手機上，說書人這邊也停一張卡叫他把人叫醒看手機（閉著眼的人不會自己去看）。
// 首夜爪牙 / 瘋子 / 惡魔各自一張；別人能力帶來的私下通知（傳位、麻臉巫婆、舞蛇人換到惡魔）停成 ack。線上照舊不停。用法：node tests/wakephone.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, joinPlayer, undoOf } from '../lib/ops.js';
import { autoPicks } from '../lib/engine.js';
import { ROLES } from '../public/js/roles.js';
import { isBuiltin } from '../lib/script.js';

const st = (r, op, a = {}) => { const x = applyStOp(r, { op, ...a }); assert.strictEqual(typeof x === 'string' ? x : undefined, undefined, op); return x; };
function mk(dev, roles, venue = 'offline') {
  const r = createRoom();
  r.settings.pretend = false;
  if (venue === 'offline') st(r, 'venue', { venue, devices: dev });
  const all = Object.keys(ROLES).filter(k => isBuiltin(k) && ['townsfolk', 'outsider', 'minion', 'demon'].includes(ROLES[k].team));
  st(r, 'upload', { entries: [{ id: '_meta', name: 'all' }, ...all] });
  roles.forEach((_, i) => joinPlayer(r, 'p' + i, 'n' + i));
  roles.forEach((x, i) => st(r, 'setRole', { seatId: r.seats[i].id, roleId: x }));
  st(r, 'next', { force: true });
  return r;
}
// 走夜晚：policy[roleId](step) 給要點的 { ids, role }；stop(step) 為真時停下
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
const sent = (r, to, src) => r.chat.some(m => m.to === to && m.info && m.src === src);

// 首夜：爪牙、惡魔各停一張；信息到這一步才發，撤銷退回上一張
{
  const r = mk('many', ['imp', 'poisoner', 'chef', 'empath', 'slayer', 'virgin', 'saint']);
  const [imp, poi] = r.seats;
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status], ['minioninfo', 'ack'], '叫醒爪牙');
  assert.deepStrictEqual(r.g.step.lines.map(l => [l.seatId, l.demon]), [[poi.id, imp.id]], '卡上寫爪牙會看到誰是惡魔');
  assert(sent(r, poi.id, 'minioninfo'), '爪牙信息已經在他手機上');
  assert(!sent(r, imp.id, 'demoninfo'), '惡魔信息還沒發：輪到他才亮');
  assert(!r.g.order.includes('minioninfo'), '不佔進度條的格子');
  st(r, 'ack');
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status], ['demoninfo', 'ack'], '叫醒惡魔');
  assert.deepStrictEqual(r.g.step.lines[0].bluffs?.length, 3, '卡上有偽裝');
  assert(sent(r, imp.id, 'demoninfo'));
  assert.strictEqual(undoOf(r), 'ack');
  st(r, 'undo');
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status], ['minioninfo', 'ack'], '撤銷退回爪牙那張');
  st(r, 'ack'); st(r, 'ack');
  assert.strictEqual(r.g.step.roleId, 'poisoner');
  assert(!r.g.log.some(e => /已告知/.test(e.text || '')), '多設備日誌只記「已發送」，不重複記「已告知」');
  console.log('多設備首夜：爪牙、惡魔各自叫醒看手機 ✔');
}

// 有瘋子：爪牙、瘋子、惡魔分開三張（和單設備一樣，瘋子看不出自己是假的）
{
  const r = mk('many', ['zombuul', 'godfather', 'devilsadvocate', 'lunatic', 'sailor', 'chambermaid', 'innkeeper', 'gambler', 'gossip', 'exorcist']);
  const seen = [];
  drive(r, {}, s => { if (['minioninfo', 'lunainfo', 'demoninfo'].includes(s.roleId)) seen.push(s.roleId + ':' + s.status); return !['minioninfo', 'lunainfo', 'demoninfo'].includes(s.roleId); });
  assert.deepStrictEqual(seen, ['minioninfo:ack', 'lunainfo:ack', 'demoninfo:ack']);
  console.log('多設備有瘋子：三張分開 ✔');
}

// 線上：照舊不停
{
  const r = mk(null, ['imp', 'poisoner', 'chef', 'empath', 'slayer', 'virgin', 'saint'], 'online');
  assert.notStrictEqual(r.g.step.roleId, 'minioninfo', '線上不停爪牙信息');
  assert(r.chat.some(m => m.src === 'demoninfo'));
  console.log('線上首夜不停 ✔');
}

// 小惡魔自殺傳位：爪牙手機上收到新角色，說書人停一張叫醒他
{
  const r = mk('many', ['imp', 'poisoner', 'chef', 'empath', 'slayer', 'virgin', 'saint']);
  const fixed = { imp: () => ({ ids: [id(r, 6)] }), poisoner: () => ({ ids: [id(r, 4)] }) };
  drive(r, fixed); passDay(r);
  drive(r, { ...fixed, imp: () => ({ ids: [id(r, 0)] }) }, s => s.roleId === 'imp' && s.status === 'ack');
  const s = r.g.step;
  assert.deepStrictEqual([s.roleId, s.status, s.told?.map(t => t.seatId)], ['imp', 'ack', [id(r, 1)]], '停下叫醒新惡魔');
  assert.strictEqual(r.seats[1].role, 'imp');
  st(r, 'ack');
  console.log('多設備小惡魔傳位：叫醒新惡魔看手機 ✔');
}

// 麻臉巫婆換了別人的角色
{
  const r = mk('many', ['pithag', 'imp', 'chef', 'empath', 'monk', 'saint', 'soldier', 'slayer']);
  drive(r); passDay(r);
  const s = drive(r, { pithag: () => ({ ids: [id(r, 2)], role: 'sage' }) }, s => s.roleId === 'pithag' && s.status === 'ack');
  assert.deepStrictEqual(s?.told?.map(t => [t.seatId, t.k]), [[id(r, 2), 'role']], '叫醒被換角色的人');
  console.log('多設備麻臉巫婆：叫醒被換的人看手機 ✔');
}

// 舞蛇人換到惡魔：兩人手機都收到了，原惡魔閉著眼，也要停
{
  const r = mk('many', ['snakecharmer', 'oracle', 'nodashii', 'witch', 'saint', 'empath', 'flowergirl']);
  const s = drive(r, { snakecharmer: () => ({ ids: [id(r, 2)] }) }, s => s.roleId === 'snakecharmer' && s.status === 'ack');
  assert(s?.result?.e?.swap, '換了');
  assert(s.told.some(t => t.seatId === id(r, 2)), '原惡魔在要叫醒的人裏');
  console.log('多設備舞蛇人換到惡魔：停下 ✔');
}
