// 開局配置：按人數和說書人的「必選 / 排除」規則抽角色，選酒鬼假身份、惡魔偽裝和占卜師紅鯡魚。
// 說書人可以先給座位指定角色（seat.pinned），隨機抽取（room.draft）只填沒指定的座位；抽完改過的座位也算指定，再抽不會動。
// 惡魔偽裝同樣可以指定（room.bluffPins，三格），沒指定的格子由系統補。全部指定完就不用再抽，直接可以確認開局。
import { ROLES, TEAMS, teamCounts, fakeOk, fakeKind } from '../public/js/roles.js';
import { newGame } from './store.js';
import { shuffle, pick, seatById, label, roleName, actingRole, scriptRoles, maxSeats, teamRoles, tell, stLog, fx, FAKE, hasFortuneTeller, ensureHerring, isGoodSeat, nextTo } from './util.js';
import { NIGHT, twoForm } from './night.js';

const isGood = id => !!ROLES[id] && TEAMS[ROLES[id].team].good;
const isBluff = id => ['townsfolk', 'outsider'].includes(ROLES[id]?.team) && id !== 'drunk';
const inPlay = room => new Set(room.seats.flatMap(s => [s.role, s.fakeRole]).filter(Boolean));
// 新的一局：座位上這局的狀態全部清空（陣營改變、僵怖假死、亡骨魔保留能力、哲學家原角色）
export const CLEAN = { fakeRole: null, dead: false, voteUsed: false, deathBy: null, align: null, undead: false, keep: false, was: null, goonEvil: false, pinned: false };
// 酒鬼、提線木偶以為自己是不在場的鎮民（全在場時隨便一個；提線木偶也可以由說書人改成外來者）；瘋子以為自己是惡魔
const fakeFor = (room, role) => (role === 'drunk' || role === 'marionette' ? pick(teamRoles(room, 'townsfolk').filter(id => !inPlay(room).has(id))) || pick(teamRoles(room, 'townsfolk'))
  : role === 'lunatic' ? pick(teamRoles(room, 'demon')) : null) || null;
// 提線木偶要和惡魔鄰座（官方）：抽完沒挨著，就把他換到惡魔旁邊沒指定的座位上（指定的座位不動，挪不了就留給開局檢查提醒）
const isDemon = s => ROLES[s.role]?.team === 'demon';
function seatMarionette(room) {
  const n = room.seats.length, side = s => [-1, 1].map(k => room.seats[(room.seats.indexOf(s) + k + n) % n]);
  for (const m of room.seats.filter(s => s.role === 'marionette')) {
    const d = room.seats.find(isDemon);
    if (!d || nextTo(room, m, d)) continue;
    const swap = (a, b) => { [a.role, a.fakeRole, b.role, b.fakeRole] = [b.role, b.fakeRole, a.role, a.fakeRole]; };
    // 先挪提線木偶到惡魔身邊，不行再挪惡魔到提線木偶身邊
    const spot = !m.pinned && shuffle(side(d)).find(s => !s.pinned && !isDemon(s) && s.role !== 'marionette');
    if (spot) { swap(m, spot); continue; }
    const near = !d.pinned && shuffle(side(m)).find(s => !s.pinned && s.role !== 'marionette');
    if (near) swap(d, near);
  }
}

export function drawRoles(room) {
  const n = room.seats.length;
  if (n < 5) return '至少需要 5 名玩家';
  if (n > maxSeats(room)) return `這個劇本只適合 5–${maxSeats(room)} 人，現在 ${n} 人`;
  if (n > 15) return '最多 15 名玩家';
  const rules = room.settings?.roleRules || {};
  const kept = room.seats.filter(s => s.pinned && s.role), held = kept.map(s => s.role);
  const usable = scriptRoles(room).filter(id => rules[id] !== 'ban' && !held.includes(id));
  // 指定的角色佔掉自己陣營的名額；超了也不攔（配比只在桌上標出來）
  const fill = (team, total, ok = () => true) => {
    const k = Math.max(0, total - held.filter(id => ROLES[id].team === team).length);
    const locked = usable.filter(id => rules[id] === 'lock' && ROLES[id].team === team);
    if (locked.length > k) return `必選的${TEAMS[team].name}有 ${locked.length} 個，超過了名額（${k} 個）`;
    const rest = shuffle(usable.filter(id => ROLES[id].team === team && !locked.includes(id) && ok(id)));
    if (locked.length + rest.length < k) return `可用的${TEAMS[team].name}不夠（需要 ${k} 個），請減少排除的角色`;
    return [...locked, ...rest.slice(0, k - locked.length)];
  };
  // 男爵（+2 外來者）在 7 人以下會把鎮民擠得太少：隨機時只在 7 人及以上出現，說書人可以手動設為必選
  const base = teamCounts(n);
  const minions = fill('minion', base.minion, id => !((ROLES[id].setup?.outsider || 0) >= 2 && n < 7));
  if (typeof minions === 'string') return minions;
  const demons = fill('demon', base.demon);
  if (typeof demons === 'string') return demons;
  // 改變外來者數量的爪牙 / 惡魔（男爵、教父、方古、亡骨魔）；教父 ±1 隨機，沒有外來者可減時 +1
  const evil = [...minions, ...demons, ...held.filter(id => ROLES[id].setup)];
  const picks = {};
  for (const id of evil) {
    const x = ROLES[id].setup?.outsider;
    if (Array.isArray(x)) picks[id] = base.outsider > 0 ? pick(x) : Math.max(...x);
  }
  const c = teamCounts(n, evil, picks);
  const picked = { minion: minions, demon: demons };
  for (const team of ['outsider', 'townsfolk']) {
    const r = fill(team, c[team]);
    if (typeof r === 'string') return r;
    picked[team] = r;
  }
  // 指定的超了名額時空座位比抽到的角色少：邪惡先留，多出來的善良角色不要
  const free = room.seats.filter(s => !kept.includes(s));
  const roles = shuffle([...picked.demon, ...picked.minion, ...picked.outsider, ...picked.townsfolk].slice(0, free.length));
  room.g = newGame();
  free.forEach((s, i) => Object.assign(s, { ...CLEAN, role: roles[i] }));
  for (const s of free) if (FAKE[s.role]) s.fakeRole = fakeFor(room, s.role);
  seatMarionette(room);
  refreshHidden(room, true);
}

// 惡魔偽裝要是不在場的善良角色，紅鯡魚要是善良玩家（沒有占卜師就不分配）；角色變化後保留仍然有效的，補齊失效的
// 指定的偽裝撞上在場角色就作廢，換成別的。沒指定的格子留著原來的，撞上了才補
export function refreshHidden(room, force) {
  const g = room.g, used = inPlay(room);
  const ok = id => !used.has(id) && isBluff(id);
  const pins = room.bluffPins = [0, 1, 2].map(i => { const id = room.bluffPins?.[i]; return id && ok(id) ? id : null; });
  const taken = id => pins.includes(id);
  const stay = [0, 1, 2].map(i => { const id = g.bluffs[i]; return !force && id && ok(id) && !taken(id) ? id : null; });
  const rest = shuffle(scriptRoles(room).filter(id => ok(id) && !taken(id) && !stay.includes(id)));
  g.bluffs = [0, 1, 2].map(i => pins[i] || stay[i] || rest.shift()).filter(Boolean);
  const rh = seatById(room, g.redHerring);
  if (force || !hasFortuneTeller(room) || !rh || !isGoodSeat(rh)) g.redHerring = null; // 官方：任何善良玩家，包括占卜師本人
  const pin = seatById(room, room.herringPin);
  if (!g.redHerring && pin && isGoodSeat(pin) && hasFortuneTeller(room)) g.redHerring = pin.id;
  ensureHerring(room);
}

// 抽好的角色作廢，指定的留著
export function clearDraft(room) {
  if (!room.draft) return;
  room.draft = false;
  room.g = newGame();
  for (const s of room.seats) if (!s.pinned) Object.assign(s, { ...CLEAN, role: null });
}
// 指定的角色和偽裝也清掉：換劇本、開新局
export function clearPins(room) {
  room.draft = false;
  room.bluffPins = [];
  room.herringPin = null;
  for (const s of room.seats) Object.assign(s, { ...CLEAN, role: null });
}
// 全部座位都有角色了：不用再抽，直接可以確認開局
function draftIfFull(room) {
  if (room.draft || !room.seats.every(s => s.role)) return false;
  room.g = newGame();
  room.draft = true;
  return true;
}

// 說書人更換某個座位的角色：預覽時直接改；遊戲中改完私下通知該玩家
export function setRole(room, seatId, roleId, fakeRole) {
  const s = seatById(room, seatId);
  if (!s || !scriptRoles(room).includes(roleId)) return '角色不存在';
  // 以為自己是的角色也得在劇本上：亂填的值寫進座位後，這個房間之後每次推送都會出錯
  if (fakeRole && !scriptRoles(room).includes(fakeRole)) return '角色不存在';
  if (room.phase === 'ended') return '遊戲已經結束';
  if (FAKE[roleId]) {
    if (fakeRole && !fakeOk(roleId, fakeRole)) return `${roleName(roleId)}只能以為自己是${fakeKind(roleId)}`;
    fakeRole ||= fakeFor(room, roleId);
  } else fakeRole = null;
  const before = s.role;
  Object.assign(s, { role: roleId, fakeRole, align: null });
  if (room.phase === 'lobby') {
    s.pinned = true;
    // 別的酒鬼 / 提線木偶正以為自己是這個角色：它現在在場了，給他換一個不在場的
    for (const o of room.seats) if (o !== s && FAKE[o.role] && FAKE[o.role] !== 'demon' && o.fakeRole === roleId) o.fakeRole = fakeFor(room, o.role);
    return room.draft ? refreshHidden(room, false) : draftIfFull(room) ? refreshHidden(room, true) : undefined;
  }
  ensureHerring(room);
  const r = ROLES[actingRole(s)];
  tell(room, s.id, `說書人更正了你的角色：你是【${r.name}】（${TEAMS[r.team].name}）：${r.ability}`, [],
    { k: 'role', src: r.id, f: [{ op: 'become' }, { r: r.id }] });
  fx(room, { k: 'role', role: r.id }, s.id);
  stLog(room, `說書人把 ${label(room, s.id)} 從${roleName(before)}改為${roleName(roleId)}` + (fakeRole ? `（以為是${roleName(fakeRole)}）` : ''),
    { k: 'fix', what: 'role', seat: s.id, from: before, role: roleId, fake: fakeRole });
}

// 座位恢復隨機：抽好的時候角色先留著，下次抽取才換；沒抽的時候回到空座位
export function unpin(room, seatId) {
  const s = seatById(room, seatId);
  if (!s || room.phase !== 'lobby') return '遊戲中不能改';
  s.pinned = false;
  if (!room.draft) Object.assign(s, { role: null, fakeRole: null });
}

// 指定一格惡魔偽裝；roleId 為空表示恢復隨機
export function setBluff(room, i, roleId) {
  if (room.phase !== 'lobby' || !room.draft) return '請先抽取角色';
  if (![0, 1, 2].includes(i)) return '偽裝只有三格';
  const pins = room.bluffPins ||= [];
  if (roleId) {
    if (!scriptRoles(room).includes(roleId)) return '角色不存在';
    if (inPlay(room).has(roleId) || !isBluff(roleId)) return '偽裝要是不在場的善良角色';
    if (pins.includes(roleId)) return '這個角色已經是偽裝了';
  }
  pins[i] = roleId || null;
  refreshHidden(room, false);
}

export function setRedHerring(room, seatId) {
  const s = seatById(room, seatId);
  if (!hasFortuneTeller(room)) return '這局沒有占卜師';
  if (!s || !isGoodSeat(s)) return '紅鯡魚必須是善良玩家';
  room.g.redHerring = s.id;
  room.herringPin = room.phase === 'lobby' ? s.id : room.herringPin; // 說書人指定的：重新抽角色時留著（像偽裝的 pin）
  refreshFortune(room);
  if (room.phase !== 'lobby') stLog(room, `說書人把占卜師的紅鯡魚改為 ${label(room, s.id)}`, { k: 'fix', what: 'herring', seat: s.id });
}

// 開局前預選首夜要告知的信息：洗衣婦、圖書管理員、調查員（兩名玩家之一是 X），祖母的孫子。
// 以為自己是這幾個角色的酒鬼 / 提線木偶也有（他們的信息可以是錯的：form.free）。首夜那一步按這個預填，說書人到時候還能改
const PRE_TEAM = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };
const WHY_FAKE = { drunk: 'drunk', marionette: 'puppet' };
export function preForms(room) {
  if (room.phase !== 'lobby' || !room.draft) return [];
  return room.seats.flatMap(s => {
    const r = actingRole(s);
    if (PRE_TEAM[r]) {
      const form = twoForm(room, s, PRE_TEAM[r]), fake = WHY_FAKE[s.role];
      return [{ seatId: s.id, roleId: r, kind: 'two', form: { ...form, roleId: r, free: !!fake, why: fake || null, truth: { none: !Object.keys(form.roleOf).length } } }];
    }
    if (r === 'grandmother') return [{ seatId: s.id, roleId: r, kind: 'grandchild', options: room.seats.filter(o => o !== s && isGoodSeat(o)).map(o => o.id) }];
    return [];
  });
}
// fields：{ a, b, role } / { none: true }（兩名玩家之一）、{ pick }（孫子）；null 清掉。沒選完的也記著（說書人分幾次點）
export function setPreInfo(room, seatId, fields) {
  if (room.phase !== 'lobby' || !room.draft) return '請先抽取角色';
  const f = preForms(room).find(x => x.seatId === seatId);
  if (!f) return '這個座位沒有要預選的信息';
  const pre = room.g.pre ||= {};
  if (!fields) { delete pre[seatId]; return; }
  const ok = id => id == null || (id !== seatId && !!seatById(room, id));
  if (f.kind === 'grandchild') {
    if (!f.options.includes(fields.pick)) return '孫子要是善良玩家';
    pre[seatId] = { pick: fields.pick };
    return;
  }
  if (fields.none) {
    if (!f.form.allowNone) return '這個角色不能選「沒有」';
    pre[seatId] = { none: true };
    return;
  }
  const { a = null, b = null, role = null } = fields;
  if (!ok(a) || !ok(b) || (a && a === b)) return '請選擇兩名不同的玩家';
  if (role && !f.form.roles.includes(role)) return '角色不存在';
  pre[seatId] = { a, b, role };
}

// 占卜師選完人、等說書人告知時改了紅鯡魚：答案跟著重算
function refreshFortune(room) {
  const step = room.g.step;
  if (room.phase !== 'night' || step?.roleId !== 'fortuneteller' || step.status !== 'confirm' || step.picks?.length !== 2) return;
  const f = NIGHT.fortuneteller.run(room, seatById(room, step.seatId), step.picks.map(id => seatById(room, id))).form;
  Object.assign(step.form, { truth: f.truth, ok: f.ok, alt: f.ok.some(v => v !== f.truth.yes) });
}

export function logSetup(room) {
  const g = room.g;
  stLog(room, '角色分配：' + room.seats.map(s => `${label(room, s.id)}=${roleName(s.role)}` +
    (s.fakeRole ? `(以為是${roleName(s.fakeRole)})` : '')).join('，'),
    { k: 'setup', grim: room.seats.map(s => [s.id, s.role, { fake: s.fakeRole || null }]) });
  stLog(room, `惡魔偽裝：${g.bluffs.map(roleName).join('、')}` + (g.redHerring ? `；占卜師紅鯡魚：${label(room, g.redHerring)}` : ''),
    { k: 'bluffs', bluffs: g.bluffs, herring: g.redHerring });
}
