// 說書人自己的記錄：提醒標記（只有說書人看得到，沒有效果）、陣營糾錯。
// 系統不認識的角色（混合推進）也靠這些記：見 engine.js 的 mark 步驟
import { ROLES } from '../public/js/roles.js';
import { remindersOf } from './script.js';
import { seatById, label, scriptRoles, stLog, addEff, hasEff, isPoisoned, FOREVER } from './util.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);

// 提醒標記：只有說書人看得到，不產生任何效果
export function setReminder(room, seatId, text, on) {
  const seat = seatById(room, seatId), t = clip(text, 20), g = room.g;
  if (!seat || !t) return '標記為空';
  const list = g.marks[seat.id] ||= [];
  if (on && !list.includes(t) && list.length < 16) list.push(t);
  if (!on) g.marks[seat.id] = list.filter(x => x !== t);
}
// 標記面板裏的「中毒」「醉酒」是真的狀態，不只是一枚記號：貼上就按規則中毒 / 醉酒（直到取下），取下就解除，
// 不管原來是投毒者、普卡還是說書人自己貼的。和頭像上的圖章、信息卡的「可給錯誤信息」是同一件事
export function setStatus(room, seatId, what, on) {
  const seat = seatById(room, seatId), g = room.g;
  if (!seat) return '座位不存在';
  if (what !== 'poison' && what !== 'drunk') return '未知的狀態';
  const word = what === 'poison' ? '中毒' : '醉酒', has = what === 'poison' ? isPoisoned(room, seat) : hasEff(room, seat, 'drunk');
  g.marks[seat.id] = (g.marks[seat.id] || []).filter(t => t !== word); // 舊存檔裏同名的手寫記號：一起收掉，不留兩枚
  if (on) {
    if (has) return;
    addEff(room, seat.id, what, null, FOREVER, null, { st: true, hand: true });
    stLog(room, `說書人讓 ${label(room, seat.id)} ${word}`, { k: 'fix', what, seat: seat.id });
    return;
  }
  if (what === 'poison' && g.poisoned === seat.id) g.poisoned = null;
  g.eff = (g.eff || []).filter(e => !(e.seat === seat.id && e.kind === what && !e.live));
  if (has) stLog(room, `說書人解除了 ${label(room, seat.id)} 的${word}`, { k: 'fix', what: what === 'poison' ? 'unpoison' : 'sober', seat: seat.id });
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
