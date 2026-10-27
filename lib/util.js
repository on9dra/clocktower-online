// 引擎共用的小工具：座位查詢、隨機、消息
import { ROLES, TEAMS, SCRIPTS } from '../public/js/roles.js';
import { rid } from './store.js';

export const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const pick = a => a[Math.floor(Math.random() * a.length)];

export const seatById = (room, id) => room.seats.find(s => s.id === id);
export const label = (room, id) => {
  const i = room.seats.findIndex(s => s.id === id);
  return i < 0 ? '?' : `${i + 1}號${room.seats[i].name}`;
};
export const roleName = id => (ROLES[id] ? ROLES[id].name : '?');
export const teamOf = seat => ROLES[seat.role]?.team;
export const isEvil = seat => !!seat.role && !TEAMS[teamOf(seat)].good;
export const alive = room => room.seats.filter(s => !s.dead);
export const scriptRoles = room => SCRIPTS[room.scriptId].roles;
export const teamRoles = (room, team) => scriptRoles(room).filter(id => ROLES[id].team === team);
export const hasDemon = room => room.seats.some(s => !s.dead && teamOf(s) === 'demon');

// 酒鬼以為自己是 fakeRole，按那個角色的順序被喚醒
export const actingRole = seat => (seat.role === 'drunk' ? seat.fakeRole : seat.role);
// 能力失效：酒鬼或中毒
export const impaired = (room, seat) => seat.role === 'drunk' || room.g.poisoned === seat.id;

// 隱士、間諜的「登記」：能力正常時，說書人可以讓他們被當作另一類角色 / 另一陣營
export function teamsAs(room, s) {
  if (impaired(room, s)) return [teamOf(s)];
  if (s.role === 'recluse') return ['outsider', 'minion', 'demon'];
  if (s.role === 'spy') return ['minion', 'townsfolk', 'outsider'];
  return [teamOf(s)];
}
export const evilAs = (room, s) => [...new Set(teamsAs(room, s).map(t => !TEAMS[t].good))];
// 某名玩家可以被當作哪些角色（真實角色以外的合規答案）
export function rolesAs(room, s) {
  const teams = teamsAs(room, s).filter(t => t !== teamOf(s));
  return scriptRoles(room).filter(id => teams.includes(ROLES[id].team));
}

// 往左右各找最近的存活玩家
export function aliveNeighbors(room, seat) {
  const n = room.seats.length, i = room.seats.indexOf(seat), out = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const s = room.seats[(i + dir * k + n) % n];
      if (s === seat) break;
      if (!s.dead) { out.push(s); break; }
    }
  }
  return out[0] === out[1] ? [out[0]] : out;
}

// 說書人魔典上座位的狀態標籤（間諜看魔典時也用這一份）
export function seatTags(room, s) {
  const g = room.g, t = [];
  if (g.poisoned === s.id) t.push('中毒');
  if (room.phase === 'night' && g.protected === s.id) t.push('被保護');
  if (g.redHerring === s.id) t.push('紅鯡魚');
  if (actingRole(s) === 'virgin' && g.virginUsed) t.push('能力已用');
  if (s.role === 'slayer' && g.slayerUsed) t.push('能力已用');
  if (s.dead && s.voteUsed) t.push('死亡票已用');
  return t.concat(g.marks[s.id] || []);
}

export function pushChat(room, msg) {
  room.chatSeq = (room.chatSeq || 0) + 1;
  room.chat.push({ id: rid(), seq: room.chatSeq, at: Date.now(), ...msg });
  if (room.chat.length > 600) room.chat.splice(0, room.chat.length - 600);
}
// 清空聊天（新的一局）：chatEpoch 變化後，客戶端會整體重新拉取
export function resetChat(room) {
  room.chat = [];
  room.chatEpoch = rid();
}
// e：給遊戲日誌按輕重排版用的結構（k：start / night / dawn / day / nom / votes / count / cancel / slay / slayhit / slaymiss / virgin / execute / noexec / win / lobby）
export const announce = (room, text, e) => pushChat(room, { from: 'sys', fromName: '系統', to: 'all', text, ...(e && { e }) });
// 說書人私下告訴某位玩家的信息（玩家在左上角面板裏看到）
// marks：[{ seatId, r | t | demon, text }]，玩家端會把它們自動標在對應座位上
// extra：f 信息式子（見 infofmt.js）、src 來源角色、k 類型（role 發角色 / act 自己的行動）
export const tell = (room, seatId, text, marks, extra = {}) =>
  pushChat(room, { from: 'st', fromName: '說書人', to: seatId, text, info: true, night: room.g.night, marks: marks || [], ...extra });
// 說書人流程日誌：text 是文字版，e 是給日誌畫式子用的結構（k：setup / act / info / death / demon / nom / votes / slay / fix …）
export const stLog = (room, text, e) => {
  room.g.log.push({ at: Date.now(), text, e, phase: room.phase, night: room.g.night, day: room.g.day });
};
// 演出事件：客戶端按序號播放。aud：all 所有人、st 只給說書人、座位 id 只給該玩家
export function fx(room, ev, aud = 'all') {
  room.fxSeq = (room.fxSeq || 0) + 1;
  (room.fx ||= []).push({ ...ev, seq: room.fxSeq, at: Date.now(), aud });
  if (room.fx.length > 40) room.fx.splice(0, room.fx.length - 40);
}
export function mark(room, seatId, text) {
  (room.g.marks[seatId] ||= []).push(text);
}
