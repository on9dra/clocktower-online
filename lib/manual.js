// 說書人自己的記錄：提醒標記（只有說書人看得到，沒有效果）、陣營糾錯。
// 系統不認識的角色（混合推進）也靠這些記：見 engine.js 的 mark 步驟
import { ROLES } from '../public/js/roles.js';
import { remindersOf } from './script.js';
import { seatById, label, scriptRoles, stLog } from './util.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);

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
// 貼標記的列表：在場角色自己的標記，加上不在場也能用的（Json 的 remindersGlobal）
export function reminderList(room) {
  const inPlay = new Set(room.seats.flatMap(s => [s.role, s.fakeRole]));
  return scriptRoles(room).filter(r => inPlay.has(r) || (ROLES[r].global || []).length).flatMap(r => remindersOf(r).map(t => ({ r, t })));
}
