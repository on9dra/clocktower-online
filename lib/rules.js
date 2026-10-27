// 死亡、處決、惡魔傳位與勝負判定
import { ROLES } from '../public/js/roles.js';
import { alive, label, roleName, teamOf, impaired, actingRole, announce, tell, stLog, hasDemon, fx } from './util.js';
import { settleGame } from './score.js';

export function endGame(room, team, reason) {
  if (room.phase === 'ended') return;
  room.winner = team;
  room.winReason = reason;
  room.phase = 'ended';
  room.nomination = null;
  announce(room, `遊戲結束：${team === 'good' ? '善良' : '邪惡'}陣營獲勝（${reason}）`, { k: 'win', team, reason });
  settleGame(room, team);
  fx(room, { k: 'win', team });
}

// 白天、被動能力觸發時一律停下，由說書人裁定是否生效（day.js 的 resolveRuling 接著走）。
// 不管能力正常與否都停，玩家就沒法從「自動生效 / 停頓」看出誰中毒、信息真假。
// auto：按規則應有的結果（說書人卡片上的推薦項）；why：中毒 / 酒鬼（能力正常為 null）
// forced：結果只有一種（能力正常、也沒有隱士 / 間諜的登記可選）時，說書人只能確認 auto；
// 能力可能失效、或目標可以被登記成另一類時才二選一。reg：可以被登記成另一類的那個角色（隱士 / 間諜）
// 酒鬼沒有能力：以為自己是某角色的酒鬼也停下（不從停頓露餡），但只有「無效」一種結果
export function rulingOf(room, kind, seat, data = {}) {
  const bad = impaired(room, seat), drunk = seat.role === 'drunk';
  return { kind, seatId: seat.id, role: actingRole(seat), why: bad ? (drunk ? '酒鬼' : '中毒') : null,
    auto: !bad, forced: !bad || drunk, reg: null, ...data };
}
export function askRuling(room, kind, seat, data = {}) {
  room.g.ruling = rulingOf(room, kind, seat, data);
}

export function checkWin(room) {
  if (room.phase === 'ended' || room.phase === 'lobby') return true;
  if (room.g.ruling) return false; // 裁定完再判勝負
  if (!hasDemon(room)) { endGame(room, 'good', '惡魔死亡'); return true; }
  if (alive(room).length <= 2) { endGame(room, 'evil', '只剩兩名玩家存活'); return true; }
  return false;
}

export function becomeDemon(room, seat, demonRole, why) {
  if (seat.role === 'poisoner') room.g.poisoned = null; // 不再是投毒者，毒立即失效
  seat.role = demonRole;
  tell(room, seat.id, `${why}，你現在是【${roleName(demonRole)}】。`, [], { k: 'role', src: demonRole, f: [{ op: 'become' }, { r: demonRole }] });
  fx(room, { k: 'demon', role: demonRole }, seat.id);
  stLog(room, `${label(room, seat.id)} ${why}，變成${roleName(demonRole)}`,
    { k: 'demon', seat: seat.id, role: demonRole, why: why.includes('紅唇') ? 'scarletwoman' : 'starpass' });
}

// 死因 → 日誌裏畫的圖標
const CAUSE = { '夜裏被惡魔殺死': 'demon', '代替鎮長死亡': 'demon', '小惡魔自殺傳位': 'starpass', '被處決': 'execute', '被獵手擊殺': 'slayer', '被貞潔者反噬': 'virgin' };

// 統一的死亡入口：處理投毒者死亡解毒、紅唇女郎接任
export function killSeat(room, seat, cause) {
  if (seat.dead) return;
  const aliveBefore = alive(room).length;
  seat.dead = true;
  seat.deathBy = CAUSE[cause] || 'manual';
  if (room.phase === 'night') room.g.diedTonight.push(seat.id);
  if (seat.role === 'poisoner') room.g.poisoned = null; // 投毒者死亡，毒立即失效
  stLog(room, `${label(room, seat.id)}（${roleName(seat.role)}）死亡：${cause}`,
    { k: 'death', seat: seat.id, role: seat.role, cause: CAUSE[cause] || 'manual' });
  if (teamOf(seat) === 'demon') {
    const sw = room.seats.find(s => !s.dead && s.role === 'scarletwoman');
    if (sw && aliveBefore >= 5) {
      if (room.phase !== 'night') askRuling(room, 'scarletwoman', sw, { demonRole: seat.role });
      // 夜裏（小惡魔自殺）玩家看不到停頓：能力正常直接接任，中毒則由傳位裁定決定誰接任
      else if (!impaired(room, sw)) becomeDemon(room, sw, seat.role, '惡魔死亡，紅唇女郎接任');
    }
  }
}

// 說書人糾錯：復活一名玩家（夜裏復活的不再出現在天亮的死訊裏）
export function revive(room, seat) {
  seat.dead = false;
  seat.deathBy = null;
  seat.voteUsed = false;
  room.g.diedTonight = room.g.diedTonight.filter(id => id !== seat.id);
  stLog(room, `${label(room, seat.id)} 被說書人復活`, { k: 'fix', what: 'revive', seat: seat.id });
}

// cause：死因（貞潔者反噬的提名者也走處決流程，但死因單獨記）
export function execute(room, seat, cause = '被處決') {
  const g = room.g;
  g.executedToday = seat.id;
  g.lastExecutedRole = seat.role;
  g.lastExecutedId = seat.id;
  g.dayOver = true;
  announce(room, `${label(room, seat.id)} 被處決了`, { k: 'execute', seat: seat.id });
  // 貞潔者反噬有自己的演出（閃電劈向提名者），不再播絞刑架
  if (cause === '被處決') fx(room, { k: 'execute', seat: seat.id });
  if (seat.role === 'saint' && !seat.dead) askRuling(room, 'saint', seat);
  killSeat(room, seat, cause);
  checkWin(room);
}

// 白天結束時檢查鎮長勝利
export function mayorWin(room) {
  const m = room.seats.find(s => actingRole(s) === 'mayor' && !s.dead); // 含以為自己是鎮長的酒鬼
  if (m && !room.g.executedToday && alive(room).length === 3 && !room.g.mayorDeclined) {
    askRuling(room, 'mayor', m);
    return true;
  }
  return false;
}

export const isDemonRole = id => ROLES[id]?.team === 'demon';
