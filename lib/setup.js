// 開局配置：按人數和說書人的「必選 / 排除」規則抽角色，選酒鬼假身份、惡魔偽裝和占卜師紅鯡魚。
// 說書人可以先抽角色預覽（room.draft），在座位上逐個更換，滿意了再開局。
import { ROLES, TEAMS, teamCounts, skippedForNoOutsider } from '../public/js/roles.js';
import { newGame } from './store.js';
import { shuffle, pick, seatById, label, roleName, actingRole, scriptRoles, teamRoles, tell, stLog, fx, FAKE } from './util.js';

const isGood = id => !!ROLES[id] && TEAMS[ROLES[id].team].good;
const inPlay = room => new Set(room.seats.flatMap(s => [s.role, s.fakeRole]).filter(Boolean));
// 新的一局：座位上這局的狀態全部清空（陣營改變、僵怖假死、亡骨魔保留能力、哲學家原角色）
export const CLEAN = { fakeRole: null, dead: false, voteUsed: false, deathBy: null, align: null, undead: false, keep: false, was: null };
// 酒鬼以為自己是不在場的鎮民；瘋子以為自己是惡魔
const fakeFor = (room, role) => (role === 'drunk' ? pick(teamRoles(room, 'townsfolk').filter(id => !inPlay(room).has(id)))
  : role === 'lunatic' ? pick(teamRoles(room, 'demon')) : null);

export function drawRoles(room) {
  const n = room.seats.length;
  if (n < 5) return '至少需要 5 名玩家';
  if (n > 15) return '最多 15 名玩家';
  const rules = room.settings?.roleRules || {};
  const usable = scriptRoles(room).filter(id => rules[id] !== 'ban');
  const fill = (team, k, ok = () => true) => {
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
  const picks = {};
  for (const id of [...minions, ...demons]) {
    const x = ROLES[id].setup?.outsider;
    if (Array.isArray(x)) picks[id] = base.outsider > 0 ? pick(x) : Math.max(...x);
  }
  const c = teamCounts(n, [...minions, ...demons], picks);
  const picked = { minion: minions, demon: demons };
  for (const team of ['outsider', 'townsfolk']) {
    const r = fill(team, c[team], id => !skippedForNoOutsider(id, c));
    if (typeof r === 'string') return r;
    picked[team] = r;
  }
  const roles = shuffle([...picked.townsfolk, ...picked.outsider, ...picked.minion, ...picked.demon]);
  room.g = newGame();
  room.seats.forEach((s, i) => Object.assign(s, { ...CLEAN, role: roles[i] }));
  for (const s of room.seats) if (FAKE[s.role]) s.fakeRole = fakeFor(room, s.role);
  refreshHidden(room, true);
}

// 惡魔偽裝要是不在場的善良角色，紅鯡魚要是善良玩家；角色變化後保留仍然有效的，補齊失效的
export function refreshHidden(room, force) {
  const g = room.g, used = inPlay(room);
  const ok = id => id !== 'drunk' && !used.has(id) && isGood(id);
  const keep = force ? [] : g.bluffs.filter(ok);
  g.bluffs = [...keep, ...shuffle(scriptRoles(room).filter(id => ok(id) && !keep.includes(id)))].slice(0, 3);
  const rh = seatById(room, g.redHerring);
  if (force || !rh || !isGood(rh.role)) g.redHerring = pick(room.seats.filter(s => isGood(s.role)))?.id || null;
}

export function clearDraft(room) {
  if (!room.draft) return;
  room.draft = false;
  room.g = newGame();
  for (const s of room.seats) Object.assign(s, { ...CLEAN, role: null });
}

// 說書人更換某個座位的角色：預覽時直接改；遊戲中改完私下通知該玩家
export function setRole(room, seatId, roleId, fakeRole) {
  const s = seatById(room, seatId);
  if (!s || !scriptRoles(room).includes(roleId)) return '角色不存在';
  if (room.phase === 'lobby' && !room.draft) return '請先抽取角色';
  if (room.phase === 'ended') return '遊戲已經結束';
  if (FAKE[roleId]) {
    if (fakeRole && ROLES[fakeRole]?.team !== FAKE[roleId]) return `${roleName(roleId)}只能以為自己是${TEAMS[FAKE[roleId]].name}`;
    fakeRole ||= fakeFor(room, roleId);
  } else fakeRole = null;
  const before = s.role;
  Object.assign(s, { role: roleId, fakeRole, align: null });
  if (room.phase === 'lobby') return refreshHidden(room, false);
  const r = ROLES[actingRole(s)];
  tell(room, s.id, `說書人更正了你的角色：你是【${r.name}】（${TEAMS[r.team].name}）：${r.ability}`, [],
    { k: 'role', src: r.id, f: [{ op: 'become' }, { r: r.id }] });
  fx(room, { k: 'role', role: r.id }, s.id);
  stLog(room, `說書人把 ${label(room, s.id)} 從${roleName(before)}改為${roleName(roleId)}` + (fakeRole ? `（以為是${roleName(fakeRole)}）` : ''),
    { k: 'fix', what: 'role', seat: s.id, from: before, role: roleId, fake: fakeRole });
}

export function setRedHerring(room, seatId) {
  const s = seatById(room, seatId);
  if (!s || !isGood(s.role)) return '紅鯡魚必須是善良玩家';
  room.g.redHerring = s.id;
  if (room.phase !== 'lobby') stLog(room, `說書人把占卜師的紅鯡魚改為 ${label(room, s.id)}`, { k: 'fix', what: 'herring', seat: s.id });
}

export function logSetup(room) {
  const g = room.g;
  stLog(room, '角色分配：' + room.seats.map(s => `${label(room, s.id)}=${roleName(s.role)}` +
    (s.fakeRole ? `(以為是${roleName(s.fakeRole)})` : '')).join('，'),
    { k: 'setup', grim: room.seats.map(s => [s.id, s.role, { fake: s.fakeRole || null }]) });
  stLog(room, `惡魔偽裝：${g.bluffs.map(roleName).join('、')}；占卜師紅鯡魚：${label(room, g.redHerring)}`,
    { k: 'bluffs', bluffs: g.bluffs, herring: g.redHerring });
}
