// 死亡、處決、惡魔傳位與勝負判定
import { ROLES } from '../public/js/roles.js';
import {
  alive, label, roleName, teamOf, impaired, actingRole, announce, tell, stLog, hasDemon, fx, seatById, isGoodSeat, isEvil,
  reallyAlive, hasEff, effsOf, addEff, dropEff, once, useOnce, pick, FOREVER, tick, aliveNeighbors, ensureHerring, whyImpaired, abnormal, fires,
} from './util.js';
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
  return { kind, seatId: seat.id, role: actingRole(seat), why: bad ? whyImpaired(room, seat) : null,
    auto: !bad, forced: !bad || drunk, reg: null, ...data };
}
export function askRuling(room, kind, seat, data = {}) {
  room.g.ruling = rulingOf(room, kind, seat, data);
}

const healthy = (room, s) => !!s && reallyAlive(s) && !impaired(room, s);
const findRole = (room, role) => room.seats.find(s => s.role === role);

// 鏡像雙子的能力還在：持有者（首夜配對的邪惡雙子，或麻臉巫婆變出來的）還是這個角色且能力正常
function twinOn(room) {
  const t = room.g.twin, s = t && seatById(room, t.holder || t.evil);
  return s?.role === 'eviltwin' && healthy(room, s) ? t : null;
}
// 雙子都活著，善良陣營就贏不了
function twinsBlock(room) {
  const t = twinOn(room);
  return !!t && [t.evil, t.good].every(id => reallyAlive(seatById(room, id) || {}));
}

export function checkWin(room) {
  if (room.phase === 'ended' || room.phase === 'lobby') return true;
  if (room.g.manual) return false; // 手動局由說書人判
  if (room.g.ruling) return false; // 裁定完再判勝負
  if (!hasDemon(room)) {
    const g = room.g, mm = findRole(room, 'mastermind'), ex = seatById(room, g.executedToday);
    if (g.mastermindDay) return false; // 主謀的額外一天還沒過完
    // 主謀：惡魔死於處決、遊戲本該結束 → 再進行一夜一天。相剋：被亡骨魔殺死、保留能力的主謀，亡骨魔死後仍然有能力
    if ((healthy(room, mm) || (mm?.keep && !impaired(room, mm))) && room.phase === 'day' && ex && teamOf(ex) === 'demon') {
      g.mastermindDay = g.day + 1;
      stLog(room, `惡魔死於處決，主謀 ${label(room, mm.id)} 讓遊戲再進行一夜一天`, { k: 'rule', seat: mm.id, role: 'mastermind', work: true });
      return false;
    }
    if (!twinsBlock(room)) { endGame(room, 'good', '惡魔死亡'); return true; }
    if (!g.twinHeld) { g.twinHeld = true; stLog(room, '惡魔已死，但鏡像雙子都活著：善良陣營還不能獲勝', { k: 'rule', seat: g.twin.holder || g.twin.evil, role: 'eviltwin', work: true }); }
  }
  // 假死的僵怖還活著，看起來只剩兩人時遊戲繼續
  if (room.seats.filter(reallyAlive).length <= 2) { endGame(room, 'evil', '只剩兩名玩家存活'); return true; }
  return false;
}

// from：原來的惡魔（接任的演出從他的座位飛過來）
export function becomeDemon(room, seat, demonRole, why, from) {
  if (seat.role === 'poisoner') room.g.poisoned = null; // 不再是投毒者，毒立即失效
  const was = seat.role;
  seat.role = demonRole;
  tell(room, seat.id, `${why}，你現在是【${roleName(demonRole)}】。`, [], { k: 'role', src: demonRole, f: [{ op: 'become' }, { r: demonRole }] });
  fx(room, { k: 'demon', role: demonRole, was, from: from || null, why: why.includes('紅唇') ? 'scarletwoman' : 'starpass' }, seat.id);
  stLog(room, `${label(room, seat.id)} ${why}，變成${roleName(demonRole)}`,
    { k: 'demon', seat: seat.id, role: demonRole, why: why.includes('紅唇') ? 'scarletwoman' : 'starpass' });
}

// 換角色（麻臉巫婆、理髮師、舞蛇人、哲學家）：私下告訴他新角色。keepAlign：陣營不跟著角色變
export function changeRole(room, seat, role, why, keepAlign = true) {
  if (keepAlign) seat.align = seat.align || (isEvil(seat) ? 'evil' : 'good');
  if (seat.role === 'poisoner') room.g.poisoned = null;
  if (seat.was === 'philosopher') { soberPhilosopher(room, seat); seat.was = null; }
  seat.role = role;
  seat.fakeRole = null;
  ensureHerring(room); // 哲學家、麻臉巫婆變出占卜師
  tell(room, seat.id, `${why}，你現在是【${roleName(role)}】：${ROLES[role].ability}`, [], { k: 'role', src: role, f: [{ op: 'become' }, { r: role }] });
  fx(room, { k: 'role', role }, seat.id);
}

// 哲學家沒了能力（死亡、被換角色）：被他弄醉的人恢復清醒
const soberPhilosopher = (room, seat) => dropEff(room, e => e.src === 'philosopher' && e.by === seat.id);

// 死因 → 日誌裏畫的圖標
const CAUSE = { '夜裏被惡魔殺死': 'demon', '代替鎮長死亡': 'demon', '小惡魔自殺傳位': 'starpass', '被處決': 'execute', '被獵手擊殺': 'slayer', '被貞潔者反噬': 'virgin' };

// 統一的死亡入口（說書人手動標記也走這裏，不看任何保護）：處理各種「死亡時」的能力
export function killSeat(room, seat, cause) {
  if (seat.dead && !seat.undead) return;
  const g = room.g, aliveBefore = alive(room).length + (seat.undead ? 1 : 0);
  seat.dead = true;
  seat.undead = false;
  seat.deathBy = CAUSE[cause] || 'manual';
  if (room.phase === 'night') g.diedTonight.push(seat.id);
  if (room.phase === 'day') { g.diedToday = true; if (teamOf(seat) === 'outsider') g.outsiderDied = true; }
  if (seat.role === 'poisoner') g.poisoned = null; // 投毒者死亡，毒立即失效
  if (seat.role === 'pukka') { dropEff(room, e => e.src === 'pukka'); g.pukka = null; } // 普卡死了，中毒的人恢復健康
  if (seat.was === 'philosopher') soberPhilosopher(room, seat);
  if (alive(room).length <= 3) dropEff(room, e => e.kind === 'curse'); // 只剩三人：女巫失去能力，詛咒立即移除
  stLog(room, `${label(room, seat.id)}（${roleName(seat.role)}）死亡：${cause}`,
    { k: 'death', seat: seat.id, role: seat.role, cause: CAUSE[cause] || 'manual' });
  if (g.manual) return; // 手動局不處理任何「死亡時」的能力
  onDeath(room, seat);
  if (teamOf(seat) === 'demon') {
    const sw = room.seats.find(s => !s.dead && s.role === 'scarletwoman');
    if (sw && aliveBefore >= 5 && !hasDemon(room)) { // 相剋：方古跳到外來者時已經有新惡魔了，紅唇女郎不再接任
      if (room.phase !== 'night') askRuling(room, 'scarletwoman', sw, { demonRole: seat.role, from: seat.id });
      // 夜裏（小惡魔自殺）玩家看不到停頓：能力正常直接接任，中毒則由傳位裁定決定誰接任
      else if (fires(room, sw)) becomeDemon(room, sw, seat.role, '惡魔死亡，紅唇女郎接任', seat.id);
    }
  }
}

// 「死亡時」觸發的外來者：心上人、月之子、理髮師、呆瓜
function onDeath(room, seat) {
  const g = room.g;
  if (seat.role === 'sweetheart' && fires(room, seat)) {
    const t = pick(room.seats.filter(s => s !== seat && !s.dead));
    if (t) {
      addEff(room, t.id, 'drunk', 'sweetheart', FOREVER);
      stLog(room, `心上人死亡：${label(room, t.id)}（${roleName(t.role)}）從此醉酒`, { k: 'rule', seat: t.id, role: 'sweetheart', why: '醉酒', work: true });
    }
  }
  // 月之子得知死亡後公開選人，下一個夜晚結算（夜裏死的要等天亮才知道，所以不是當夜）；能力是否正常看結算那一夜
  if (seat.role === 'moonchild') {
    g.moonchildDue = seat.id;
    g.moonchildAt = g.night + 1;
    stLog(room, `月之子 ${label(room, seat.id)} 死亡：他公開選擇一名存活的玩家，下一個夜晚結算`, { k: 'note', seat: seat.id, role: 'moonchild' });
  }
  if (seat.role === 'barber' && fires(room, seat)) g.barberDue = true;
  if (seat.role === 'klutz' && fires(room, seat)) stLog(room, `呆瓜 ${label(room, seat.id)} 死亡：他公開選擇一名玩家，如果選中邪惡玩家，用「⋯ → 判定邪惡獲勝」結束遊戲`, { k: 'note', seat: seat.id, role: 'klutz' });
}

// 這次死亡能不能被擋下：返回原因（空 = 會死）。o.demon 惡魔造成、o.exec 處決、o.ignore 刺客（無視一切）
// 僧侶保護和士兵在惡魔的處理函數裏看（要考慮中毒裁定），這裏是對所有死因都有效的保護
export function shieldOf(room, t, o = {}) {
  if (t.dead && !t.undead) return 'dead';
  if (o.ignore) return '';
  if (room.phase === 'night' && !o.exec && hasEff(room, t, 'protect')) return 'protect'; // 旅店老闆
  // 魔鬼代言人：處決時他要還活著、能力正常
  if (o.exec && effsOf(room, t, 'safe').some(e => { const d = seatById(room, e.by); return !d || (reallyAlive(d) && !impaired(room, d)); })) return 'safe';
  if (t.role === 'sailor' && !impaired(room, t)) return 'sailor';
  const tea = room.seats.find(s => s.role === 'tealady' && reallyAlive(s) && !impaired(room, s));
  if (tea && aliveNeighbors(room, tea).includes(t) && aliveNeighbors(room, tea).every(isGoodSeat)) return 'tealady';
  if (t.role === 'fool' && !impaired(room, t) && !once(room, 'fool:' + t.id)) { useOnce(room, 'fool:' + t.id); return 'fool'; }
  return '';
}
// 數學家：shieldOf 沒擋住、真的要死了，本該擋下的人中毒 / 醉酒，算他的能力失常（能力正常的話 shieldOf 已經擋了）
export function shieldLost(room, t, o = {}) {
  if (o.ignore) return;
  if (o.exec) for (const e of effsOf(room, t, 'safe')) { const d = seatById(room, e.by); if (d && reallyAlive(d)) abnormal(room, d); }
  if (o.demon && room.g.monkFail?.to === t.id) abnormal(room, seatById(room, room.g.monkFail.by));
  if (t.role === 'sailor' || (o.demon && t.role === 'soldier') || (t.role === 'fool' && !once(room, 'fool:' + t.id))) abnormal(room, t);
  const tea = room.seats.find(s => s.role === 'tealady' && reallyAlive(s));
  if (tea && aliveNeighbors(room, tea).includes(t) && aliveNeighbors(room, tea).every(isGoodSeat)) abnormal(room, tea);
}
const SHIELD = { protect: '被保護', safe: '被魔鬼代言人保護', pacifist: '被和平主義者保護', sailor: '是水手', tealady: '被茶藝師保護', fool: '是弄臣（首次死亡不死）', dead: '已經死亡' };
export const shieldText = k => SHIELD[k] || k;

// 真的要死了：僵怖第一次死亡時活著但被當作死亡
export function die(room, seat, cause) {
  if (seat.role === 'zombuul' && !seat.undead && !once(room, 'zombuul:' + seat.id) && fires(room, seat)) {
    useOnce(room, 'zombuul:' + seat.id);
    killSeat(room, seat, cause);
    seat.undead = true; // 對所有人顯示死亡，但還活著
    stLog(room, `${label(room, seat.id)} 是僵怖：看起來死了，其實還活著`, { k: 'rule', seat: seat.id, role: 'zombuul', work: true });
    return;
  }
  killSeat(room, seat, cause);
}
// 能力造成的死亡（非惡魔、非處決）：先看保護
export function tryKill(room, seat, cause, o = {}) {
  const sh = shieldOf(room, seat, o);
  if (!sh) { shieldLost(room, seat, o); die(room, seat, cause); }
  return sh;
}

// 說書人糾錯：復活一名玩家（夜裏復活的不再出現在天亮的死訊裏）
export function revive(room, seat, why = '被說書人復活') {
  seat.dead = false;
  seat.undead = false;
  seat.deathBy = null;
  seat.voteUsed = false;
  room.g.diedTonight = room.g.diedTonight.filter(id => id !== seat.id);
  stLog(room, `${label(room, seat.id)} ${why}`, { k: 'fix', what: 'revive', seat: seat.id });
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
  if (g.manual) return killSeat(room, seat, cause);
  // 主謀的額外一天：被處決者的陣營落敗
  if (g.mastermindDay && g.day >= g.mastermindDay) {
    return endGame(room, isEvil(seat) ? 'good' : 'evil', `主謀的額外一天，${isEvil(seat) ? '邪惡' : '善良'}玩家被處決`);
  }
  // 鏡像雙子：善良雙子被處決，邪惡獲勝
  if (twinOn(room)?.good === seat.id) return endGame(room, 'evil', '善良的鏡像雙子被處決');
  const sh = shieldOf(room, seat, { exec: true });
  // 和平主義者：被處決的善良玩家可能不死，由說書人裁定
  const pac = room.seats.find(s => s.role === 'pacifist' && reallyAlive(s) && !impaired(room, s));
  if (!sh && pac && isGoodSeat(seat)) {
    askRuling(room, 'pacifist', pac, { to: seat.id, cause, auto: false, forced: false });
    return;
  }
  finishExecution(room, seat, cause, sh);
}
export function finishExecution(room, seat, cause, sh) {
  if (sh && sh !== 'dead') {
    stLog(room, `${label(room, seat.id)} 被處決，但他${shieldText(sh)}，沒有死亡`, { k: 'rule', seat: seat.id, role: seat.role, work: true });
    announce(room, `${label(room, seat.id)} 沒有死亡。`, { k: 'survive', seat: seat.id });
    return checkWin(room);
  }
  if (seat.role === 'saint' && !seat.dead) askRuling(room, 'saint', seat);
  const minion = teamOf(seat) === 'minion' && !seat.dead;
  if (!sh) shieldLost(room, seat, { exec: true });
  die(room, seat, cause);
  // 吟遊詩人：爪牙死於處決，其他所有人醉酒到明天黃昏
  const ms = room.seats.find(s => s.role === 'minstrel' && !s.dead);
  if (minion && seat.dead && ms && fires(room, ms)) {
    for (const s of room.seats) if (s !== ms) addEff(room, s.id, 'drunk', 'minstrel', tick(room) + 2);
    stLog(room, '爪牙死於處決：吟遊詩人讓其他所有人醉酒到明天黃昏', { k: 'rule', seat: ms.id, role: 'minstrel', work: true });
  }
  checkWin(room);
}

// 白天結束時檢查鎮長勝利
export function mayorWin(room) {
  const m = room.seats.find(s => actingRole(s) === 'mayor' && !s.dead); // 含以為自己是鎮長的酒鬼
  if (m && !room.g.executedToday && alive(room).length === 3 && !room.g.mayorDeclined && !twinsBlock(room)) {
    askRuling(room, 'mayor', m);
    return true;
  }
  return false;
}

// 白天結束、沒人被處決：涡流在場邪惡獲勝；主謀的額外一天沒人被處決善良獲勝
export function noExecutionEnds(room) {
  const g = room.g;
  if (g.executedToday) return false;
  if (g.mastermindDay && g.day >= g.mastermindDay) { endGame(room, 'good', '主謀的額外一天無人被處決'); return true; }
  if (healthy(room, findRole(room, 'vortox'))) { endGame(room, 'evil', '渦流在場，白天無人被處決'); return true; }
  return false;
}

export const isDemonRole = id => ROLES[id]?.team === 'demon';
