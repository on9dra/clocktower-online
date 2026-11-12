// 說書人自己的記錄：提醒標記（只有說書人看得到，沒有效果）、和規則有關的狀態（貼上就生效，見 setStatus）、陣營糾錯。
// 系統不認識的角色（混合推進）也靠這些記：見 engine.js 的 mark 步驟
import { ROLES, TEAMS } from '../public/js/roles.js';
import { remindersOf } from './script.js';
import { seatById, label, scriptRoles, stLog, addEff, hasEff, isPoisoned, nodashiiVictims, actingRole, teamOf, once, useOnce, FOREVER } from './util.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);

// 提醒標記：只有說書人看得到，不產生任何效果
export function setReminder(room, seatId, text, on) {
  const seat = seatById(room, seatId), t = clip(text, 20), g = room.g;
  if (!seat || !t) return '標記為空';
  const list = g.marks[seat.id] ||= [];
  if (on && !list.includes(t) && list.length < 16) list.push(t);
  if (!on) g.marks[seat.id] = list.filter(x => x !== t);
}
// 標記面板（座位右下角的「+」）裏和規則有關的標記是真的狀態，不只是一枚記號：貼上就按規則生效，一直到說書人取下；
// 取下就解除，不管原來是投毒者、女巫、魔鬼代言人還是說書人自己貼的。和頭像上的圖章、信息卡的「可給錯誤信息」是同一件事。
//  poison 中毒、drunk 醉酒：能力失效 · protect 被保護：夜裏惡魔殺不死 · safe 處決不死 · curse 詛咒：提名就死 · mad 瘋狂
//  used 能力已用：獵手、貞潔者、每局一次的角色真的用掉了（不再被喚醒、不能再開槍）；系統不記這件事的角色只貼一枚記號
export const STATUS_WORD = { poison: '中毒', drunk: '醉酒', protect: '被保護', safe: '處決不死', curse: '詛咒', mad: '瘋狂', used: '能力已用' };
const statusOn = (room, s, what) => (what === 'poison' ? isPoisoned(room, s) : what === 'protect' ? room.g.protected === s.id || hasEff(room, s, 'protect')
  : what === 'used' ? usedOn(room, s) : hasEff(room, s, what));
// 系統記著「用掉了」的角色：獵手開過槍、貞潔者被提名過、每局一次的能力（侍臣、教授、刺客、女裁縫、弄臣……）
const usedKey = s => (s.role === 'slayer' ? 'slayer' : actingRole(s) === 'virgin' ? 'virgin' : ROLES[s.role]?.once ? 'once' : null);
const usedOn = (room, s) => ({ slayer: () => !!room.g.slayerUsed, virgin: () => !!room.g.virginUsed, once: () => once(room, s.role + ':' + s.id) })[usedKey(s)]?.() ?? (room.g.marks[s.id] || []).includes('能力已用');
export function setStatus(room, seatId, what, on) {
  const seat = seatById(room, seatId), g = room.g;
  if (!seat) return '座位不存在';
  const word = STATUS_WORD[what];
  if (!word) return '未知的狀態';
  if (what === 'used' && !usedKey(seat)) return setReminder(room, seat.id, word, on); // 系統不記的：只是一枚記號
  // 諾-達鯴的毒是算出來的（他活著、能力正常時鄰座的鎮民就中毒），沒有一枚可以取下的
  if (what === 'poison' && !on && nodashiiVictims(room).includes(seat.id)) return '他是諾-達鯴的鎮民鄰座：諾-達鯴活著、能力正常時他一直中毒，取不下來';
  const has = statusOn(room, seat, what);
  g.marks[seat.id] = (g.marks[seat.id] || []).filter(t => t !== word); // 舊存檔裏同名的手寫記號：一起收掉，不留兩枚
  if (on === has) return;
  if (what === 'used') {
    const k = usedKey(seat);
    if (k === 'slayer') g.slayerUsed = on;
    else if (k === 'virgin') g.virginUsed = on;
    else if (on) useOnce(room, seat.role + ':' + seat.id);
    else delete g.used[seat.role + ':' + seat.id];
  } else if (on) addEff(room, seat.id, what, null, FOREVER, null, { st: true, hand: true });
  else {
    if (what === 'poison' && g.poisoned === seat.id) g.poisoned = null;
    if (what === 'protect' && g.protected === seat.id) g.protected = null;
    g.eff = (g.eff || []).filter(e => !(e.seat === seat.id && e.kind === what));
  }
  const old = { poison: ['poison', 'unpoison'], drunk: ['drunk', 'sober'] }[what]; // 流程日誌裏原來就有的兩種寫法
  stLog(room, on ? `說書人讓 ${label(room, seat.id)} ${word}` : `說書人解除了 ${label(room, seat.id)} 的${word}`,
    { k: 'fix', what: old ? old[on ? 0 : 1] : 'status', word, on, seat: seat.id });
}
export function setAlign(room, seatId, align) {
  const seat = seatById(room, seatId);
  if (!seat) return '座位不存在';
  if (align !== 'good' && align !== 'evil') return '請選擇陣營';
  // 改回角色本來的陣營：不記成「被改過」，隱士、間諜照樣能被登記成另一陣營（記成被改過就只能是記下的那一個）
  seat.align = align === (TEAMS[teamOf(seat)]?.good ? 'good' : 'evil') ? null : align;
  stLog(room, `說書人把 ${label(room, seat.id)} 改為${align === 'good' ? '善良' : '邪惡'}`, { k: 'fix', what: 'align', seat: seat.id, align });
}
// 貼標記的列表：在場角色自己的標記，加上不在場也能用的（Json 的 remindersGlobal）
export function reminderList(room) {
  const inPlay = new Set(room.seats.flatMap(s => [s.role, s.fakeRole]));
  return scriptRoles(room).filter(r => inPlay.has(r) || (ROLES[r].global || []).length).flatMap(r => remindersOf(r).map(t => ({ r, t })));
}
