// 手動局：系統不懂規則，只傳話、記狀態。說書人按需發選人牌、拼信息、貼提醒標記，勝負也由說書人判
import { ROLES, TEAMS } from '../public/js/roles.js';
import { OFFICIAL } from './official.js';
import { remindersOf } from './script.js';
import { rid } from './store.js';
import { seatById, label, roleName, scriptRoles, teamOf, actingRole, tell, stLog, fx, shuffle, pick } from './util.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);
const seatTerms = ids => ids.map(s => ({ s }));

// ───── 選人牌 ─────
const pending = (room, seatId) => room.g.cards.find(c => c.seatId === seatId && !c.done);
export const cardFor = pending;

// 叫醒一名玩家：他手機上彈出和自動局一樣的選人牌，選完結果只回給說書人。同一個座位新牌換掉舊牌
export function sendCard(room, o) {
  const seat = seatById(room, o.seatId), count = Number(o.count), role = !!o.role;
  if (!seat) return '座位不存在';
  if (!Number.isInteger(count) || count < 0 || count > 5) return '人數不對';
  if (!count && !role) return '至少要選一個人或一個角色';
  const what = count && role ? `選擇 ${count} 名玩家和一個角色` : count ? `選擇 ${count} 名玩家` : '選擇一個角色';
  const g = room.g;
  g.cards = g.cards.filter(c => c.seatId !== seat.id);
  g.cards.push({ id: rid(), seatId: seat.id, count, role, optional: !!o.optional, text: clip(o.text, 60) || what, done: false, ids: [], pick: null });
}
export function dropCard(room, seatId) {
  room.g.cards = room.g.cards.filter(c => c.seatId !== seatId);
}

// 玩家選完（或說書人代選）：記在他自己的面板和說書人的日誌裏，沒有任何效果
export function answerCard(room, seatId, ids, role) {
  const card = pending(room, seatId);
  if (!card) return '現在不需要選擇';
  ids = [...new Set(ids || [])];
  role = (card.role && role) || null;
  const counts = card.optional ? [0, card.count] : [card.count];
  if (!counts.includes(ids.length)) return `請選擇 ${counts.join(' 或 ')} 名玩家`;
  if (ids.some(id => !seatById(room, id))) return '玩家不存在';
  if (role && !scriptRoles(room).includes(role)) return '這個角色不能選';
  if (card.role && !role && !card.optional) return '請選擇一個角色';
  Object.assign(card, { done: true, ids, pick: role });
  const who = [...ids.map(id => label(room, id)), ...(role ? [`【${roleName(role)}】`] : [])].join('、');
  const f = [...seatTerms(ids), ...(role ? [{ r: role, named: true }] : [])];
  tell(room, seatId, who ? `你選擇了 ${who}` : '你沒有使用能力', [], { k: 'act', f: [{ op: 'to' }, ...f] });
  stLog(room, `${label(room, seatId)} 選了 ${who || '（沒有選）'}`, { k: 'card', seat: seatId, f });
}

// 機器人：隨便選一組
export function autoCard(room, card) {
  const n = card.optional && Math.random() < 0.3 ? 0 : card.count;
  return { ids: shuffle(room.seats).slice(0, n).map(s => s.id), role: card.role ? pick(scriptRoles(room)) : null };
}

// ───── 信息 ─────
// 一條信息是一串項：座位 s、角色 r、數字 n、短詞 w。客戶端拼好發來，這裏只留認識的項
function cleanTerm(room, t) {
  if (t?.s) return seatById(room, t.s) ? { s: t.s } : null;
  if (t?.r) return Object.hasOwn(ROLES, t.r) ? { r: t.r, named: true } : null;
  if (Number.isInteger(t?.n)) return { n: Math.max(0, Math.min(t.n, 999)) };
  const text = clip(t?.w, 40);
  return text ? { w: text } : null;
}
export function sendInfo(room, seatId, terms) {
  const seat = seatById(room, seatId);
  if (!seat) return '座位不存在';
  const f = (Array.isArray(terms) ? terms.slice(0, 24) : []).map(t => cleanTerm(room, t)).filter(Boolean);
  if (!f.length) return '信息為空';
  const text = f.map(t => (t.s ? label(room, t.s) : t.r ? `【${roleName(t.r)}】` : t.n ?? t.w)).join(' ');
  // 提到的座位標上提到的角色：一個座位一個角色是確定的，其餘都帶問號
  const seats = f.filter(t => t.s), roles = f.filter(t => t.r), sure = seats.length === 1 && roles.length === 1;
  const marks = seats.flatMap(a => roles.map(b => ({ seatId: a.s, r: b.r, q: !sure, text: roleName(b.r) + (sure ? '' : '?') })));
  tell(room, seat.id, text, marks, { f });
  stLog(room, `告知 ${label(room, seat.id)}：${text}`, { k: 'told', seat: seat.id, f });
}

// 首夜互認：按魔典上的陣營拼好爪牙和惡魔的信息，再加惡魔偽裝。說書人按了才發
export function sendEvilInfo(room) {
  const g = room.g;
  if (g.night !== 1 || room.phase !== 'night') return '只有首夜需要互認';
  if (g.evilSent) return '已經發過了';
  const demons = room.seats.filter(s => teamOf(s) === 'demon'), minions = room.seats.filter(s => teamOf(s) === 'minion');
  const marks = list => list.map(x => ({ seatId: x.id, t: teamOf(x), text: TEAMS[teamOf(x)].name }));
  for (const m of minions) {
    const others = minions.filter(x => x !== m);
    tell(room, m.id, `惡魔是 ${demons.map(x => label(room, x.id)).join('、') || '（沒有）'}` + (others.length ? `。其他爪牙：${others.map(x => label(room, x.id)).join('、')}` : ''),
      marks([...demons, ...minions]), { f: [{ tag: 'demon' }, ...seatTerms(demons.map(x => x.id)), ...(others.length ? [{ op: 'br' }, { tag: 'minion' }, ...seatTerms(others.map(x => x.id))] : [])] });
  }
  for (const d of demons) {
    tell(room, d.id, `你的爪牙：${minions.map(x => label(room, x.id)).join('、') || '（沒有）'}。偽裝：${g.bluffs.map(roleName).join('、')}`, marks(minions),
      { f: [{ tag: 'minion' }, ...seatTerms(minions.map(x => x.id)), { op: 'br' }, { tag: 'bluff' }, ...g.bluffs.map(r => ({ r, named: true }))] });
    g.bluffsOf[d.id] = [...g.bluffs];
  }
  g.evilSent = true;
  stLog(room, '爪牙和惡魔互認：已發送', { k: 'sent', src: 'demoninfo' });
}

// ───── 魔典上的記錄 ─────
// 提醒標記：只有說書人看得到，不產生任何效果
export function setReminder(room, seatId, text, on) {
  const seat = seatById(room, seatId), t = clip(text, 20), g = room.g;
  if (!seat || !t) return '標記為空';
  const list = g.marks[seat.id] ||= [];
  if (on && !list.includes(t) && list.length < 16) list.push(t);
  if (!on) g.marks[seat.id] = list.filter(x => x !== t);
}
export function setAlign(room, seatId, align) {
  const seat = seatById(room, seatId);
  if (!seat) return '座位不存在';
  if (align !== 'good' && align !== 'evil') return '請選擇陣營';
  seat.align = align;
  stLog(room, `說書人把 ${label(room, seat.id)} 改為${align === 'good' ? '善良' : '邪惡'}`, { k: 'fix', what: 'align', seat: seat.id, align });
}
// 玩家看到的角色：和魔典上的不同時他以為自己是這個角色（酒鬼、瘋子和自製的同類角色）
export function setShown(room, seatId, roleId) {
  const seat = seatById(room, seatId);
  if (!seat?.role) return '請先指定角色';
  if (roleId && !scriptRoles(room).includes(roleId)) return '角色不存在';
  const was = actingRole(seat);
  seat.fakeRole = roleId && roleId !== seat.role ? roleId : null;
  const now = actingRole(seat), r = ROLES[now];
  if (room.phase === 'lobby') { seat.pinned = true; return; }
  if (now === was) return;
  tell(room, seat.id, `說書人更正了你的角色：你是【${r.name}】（${TEAMS[r.team].name}）：${r.ability}`, [], { k: 'role', src: now, f: [{ op: 'become' }, { r: now }] });
  fx(room, { k: 'role', role: now }, seat.id);
  stLog(room, `${label(room, seat.id)} 看到的角色改為${r.name}`, { k: 'fix', what: 'role', seat: seat.id, role: seat.role, fake: seat.fakeRole });
}
export function toggleTick(room, roleId) {
  const g = room.g;
  g.ticks = g.ticks.includes(roleId) ? g.ticks.filter(x => x !== roleId) : [...g.ticks, roleId];
}

// ───── 給說書人看的 ─────
// 夜晚順序參考：Json 自己排了順序就用 Json 的，否則是官方順序。0 不醒，undefined 是 Json 沒寫（排在最後由說書人看著辦）
const atOf = (room, id, first) => {
  const own = room.scriptId === 'custom' && room.script[first ? 'first' : 'other'];
  if (own) return own.indexOf(id) + 1;
  const r = OFFICIAL[id] || ROLES[id];
  return first ? r.first : r.other;
};
export function nightRef(room) {
  const g = room.g, first = (room.phase === 'night' ? g.night : g.night + 1) === 1;
  return scriptRoles(room).map(r => ({ r, at: atOf(room, r, first) })).filter(x => x.at !== 0)
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
    .map(({ r }) => ({ r, seats: room.seats.filter(s => s.role === r || s.fakeRole === r).map(s => s.id),
      tip: (OFFICIAL[r] || ROLES[r])[first ? 'firstTip' : 'otherTip'] || null, done: g.ticks.includes(r) }));
}
// 貼標記的列表：在場角色自己的標記，加上不在場也能用的（Json 的 remindersGlobal）
export function reminderList(room) {
  const inPlay = new Set(room.seats.flatMap(s => [s.role, s.fakeRole]));
  return scriptRoles(room).filter(r => inPlay.has(r) || (ROLES[r].global || []).length).flatMap(r => remindersOf(r).map(t => ({ r, t })));
}
