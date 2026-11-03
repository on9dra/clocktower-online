// 白天：提名（含貞潔者）、投票（順時針計票、管家）、獵手開槍、結束白天處決
import { alive, label, roleName, teamOf, impaired, abnormal, actingRole, announce, seatById, fx, stLog, teamsAs, evilAs, rolesAs, hasEff, isEvil, scriptRoles } from './util.js';
import { sweetDrunk } from './night.js';
import { execute, finishExecution, tryKill, shieldText, checkWin, mayorWin, noExecutionEnds, askRuling, rulingOf, becomeDemon, endGame } from './rules.js';
import { startNight } from './engine.js';

export const VOTE_STEP = 5000; // 立即計票時每個人有多久選擇；選了就輪到下一位
export const VOTE_WINDOW = 5 * 60 * 1000; // 提名後的投票倒數：到點按當前舉手結算；說書人可以暫停 / 重置
export const CALL_MS = 3200; // 說書人喊「立即計票」：全屏提示播完後時鐘才開始數
export const VIRGIN_DELAY = 30 * 1000; // 貞潔者必定反噬時，等這麼久（或說書人喊計票前）再反噬：只為了不從立即反噬看出誰是真鎮民

export function startDay(room) {
  const g = room.g;
  room.phase = 'day';
  g.day += 1;
  Object.assign(g, { nominators: [], nominees: [], dayOver: false, executedToday: null, lastExecutedRole: null, lastExecutedId: null, shot: [],
    ruling: null, virginCheck: null, ending: false, mayorDeclined: false, voted: [], diedToday: false, outsiderDied: false, cards: [] });
  announce(room, `第 ${g.day} 天。自由討論後，存活玩家可以點擊他人座位發起提名。`, { k: 'day', n: g.day });
}

export function nominate(room, from, target) {
  const g = room.g;
  if (room.phase !== 'day') return '只能在白天提名';
  if (g.dayOver) return '今天已經處決過，不能再提名';
  if (room.nomination) return '正在投票中';
  if (from.dead) return '死亡玩家不能提名';
  if (g.nominators.includes(from.id)) return '你今天已經提名過了';
  if (g.nominees.includes(target.id)) return '他今天已經被提名過了';
  g.nominators.push(from.id);
  g.nominees.push(target.id);
  announce(room, `${label(room, from.id)} 提名了 ${label(room, target.id)}。提名者陳述、被提名者辯護後，說書人開始計票。`, { k: 'nom', from: from.id, to: target.id });
  fx(room, { k: 'nominate', from: from.id, to: target.id });
  stLog(room, `${label(room, from.id)} 提名 ${label(room, target.id)}`, { k: 'nom', from: from.id, to: target.id });
  openNomination(room, from, target);
  // 女巫的詛咒：被詛咒的人發起提名就死亡（提名照常進行）
  if (hasEff(room, from, 'curse')) {
    const sh = tryKill(room, from, '被女巫詛咒');
    stLog(room, `${label(room, from.id)} 被女巫詛咒後發起提名` + (sh ? `，但他${shieldText(sh)}` : '，死亡'), { k: 'rule', seat: from.id, role: 'witch', work: !sh });
    if (!sh) { fx(room, { k: 'curse', seat: from.id }); announce(room, `${label(room, from.id)} 死亡。`, { k: 'slayhit', seat: from.id }); if (checkWin(room)) return; }
  }
  // 貞潔者（含以為自己是貞潔者的酒鬼）第一次被提名：投票照常開始，不停頓。能力用掉
  // - 必定無事（提名者不可能被當作鎮民、貞潔者中毒 / 醉酒、或是酒鬼）：什麼都不發生，只記日誌
  // - 必定反噬（健康貞潔者遇上真鎮民）：30 秒後、或說書人喊計票 / 結算前自動反噬（說書人可以提前）
  // - 提名者是可以被當作鎮民的間諜：說書人在小窗裏裁定，裁定前不能計票
  if (!g.manual && actingRole(target) === 'virgin' && !g.virginUsed && !target.dead) {
    g.virginUsed = true;
    const bad = impaired(room, target), townsfolk = teamOf(from) === 'townsfolk', mayBe = teamsAs(room, from).includes('townsfolk');
    const real = target.role === 'virgin';
    const c = rulingOf(room, 'virgin', target, { from: from.id, real, auto: real && !bad && townsfolk,
      forced: !real || bad || !mayBe || townsfolk, reg: real && !bad && mayBe && !townsfolk ? from.role : null });
    if (c.forced && !c.auto) {
      if (real && bad && townsfolk) abnormal(room, target); // 數學家：本該反噬，因為中毒 / 醉酒沒有
      stLog(room, `${label(room, target.id)}（${roleName(c.role)}${c.why ? '，' + c.why : ''}）被提名：無事`,
        { k: 'rule', seat: target.id, role: real ? c.role : null, why: c.why, work: false });
    } else g.virginCheck = { ...c, due: c.forced ? Date.now() + VIRGIN_DELAY : null };
  }
}
function virginFires(room, virgin, from) {
  announce(room, `${label(room, virgin.id)} 是貞潔者！提名者立即被處決。`, { k: 'virgin', seat: virgin.id, from: from.id });
  fx(room, { k: 'virgin', seat: virgin.id, from: from.id });
  execute(room, from, '被貞潔者反噬');
}
const openNomination = (room, from, target) => {
  const at = Date.now();
  // deadline：倒數到點的時刻；paused：暫停時剩下的毫秒數（暫停中 deadline 不算數）
  room.nomination = { nominatorId: from.id, nomineeId: target.id, votes: {}, abstain: {}, at, clock: null, deadline: at + VOTE_WINDOW, paused: null };
};

// 說書人裁定中毒 / 酒鬼的能力是否生效，然後接著走被打斷的流程
export function resolveRuling(room, work) {
  const r = room.g.ruling;
  if (!r) return '沒有待裁定的事項';
  if (r.forced && !!work !== !!r.auto) return '按規則這次只有一種結果';
  room.g.ruling = null;
  const seat = seatById(room, r.seatId);
  // 數學家：中毒 / 醉酒時本該生效卻沒有（獵手要打中真惡魔、呆瓜要選中邪惡才算本該生效），或靠隱士登記打中了
  if (work ? r.reg : r.why && r.would !== false) abnormal(room, seat);
  stLog(room, `${label(room, r.seatId)}（${roleName(r.role)}${r.why ? '，' + r.why : ''}）：${work ? '生效' : '無效'}`,
    { k: 'rule', seat: r.seatId, role: r.kind === 'slayer' && !r.real ? null : r.role, why: r.why, work });
  switch (r.kind) {
    case 'slayer': finishSlay(room, seat, seatById(room, r.to), work); break;
    // 聖徒落敗、鎮長獲勝：全桌先看一段桌上的演出，再接勝負
    case 'saint': if (work) { fx(room, { k: 'saint', seat: seat.id }); endGame(room, 'evil', '聖徒被處決'); } else checkWin(room); break;
    case 'scarletwoman': if (work && !seat.dead) becomeDemon(room, seat, r.demonRole, '惡魔死亡，紅唇女郎接任', r.from); checkWin(room); break;
    case 'mayor': if (work) { fx(room, { k: 'mayor', seat: seat.id }); endGame(room, 'good', '僅剩三人且無人被處決，鎮長獲勝'); } else room.g.mayorDeclined = true; break;
    // 和平主義者：生效 = 被處決的善良玩家不死
    case 'pacifist': finishExecution(room, seatById(room, r.to), r.cause, work ? 'pacifist' : ''); break;
    case 'klutz': if (work) endGame(room, isEvil(seat) ? 'good' : 'evil', '呆瓜選中了邪惡玩家'); break;
    default: break;
  }
  if (room.g.ending && room.phase === 'day') finishDay(room);
}

// 計票 / 結算前先處理貞潔者：必定反噬的立即反噬（返回 true，這次投票隨之中止），需要裁定的擋住（返回錯誤）
function virginFirst(room) {
  const v = room.g.virginCheck;
  if (!v) return false;
  if (!v.forced) return '請先裁定貞潔者是否反噬';
  resolveVirgin(room, true);
  return true;
}
// 說書人在貞潔者小窗裏裁定（必定反噬時只能提前觸發）：反噬時中止這次投票，處決提名者
export function resolveVirgin(room, work) {
  const g = room.g, r = g.virginCheck;
  if (!r) return '沒有待裁定的貞潔者';
  if (r.forced && !!work !== !!r.auto) return '按規則這次只有一種結果';
  g.virginCheck = null;
  stLog(room, `${label(room, r.seatId)}（${roleName(r.role)}${r.why ? '，' + r.why : ''}）被提名：說書人裁定${work ? '反噬' : '無事'}`,
    { k: 'rule', seat: r.seatId, role: r.real ? r.role : null, why: r.why, work });
  // 數學家：中毒的貞潔者被鎮民提名卻沒反噬，或靠間諜登記反噬了
  if (r.real && (work ? r.reg : r.why && !r.reg)) abnormal(room, seatById(room, r.seatId));
  if (!work) return;
  const from = seatById(room, r.from), virgin = seatById(room, r.seatId);
  room.nomination = null;
  room.history = room.history.filter(h => !(h.day === g.day && h.nominatorId === r.from && h.nomineeId === r.seatId));
  virginFires(room, virgin, from);
}

export const canVote = s => !s.dead || !s.voteUsed;
// 能力正常、還活著的管家：返回主人的座位 id（死人沒有能力，死亡票隨時可投）
const masterOf = (room, s) => (s.role === 'butler' && !s.dead && !impaired(room, s) ? room.g.master?.[s.id] || null : null);

// 計票順序：從被提名者順時針的下一位開始，最後是被提名者（跳過已用掉死亡票的人）
export function voteOrder(room, nom) {
  const n = room.seats.length, i = room.seats.findIndex(s => s.id === nom.nomineeId);
  return Array.from({ length: n }, (_, k) => room.seats[(i + 1 + k) % n]).filter(canVote).map(s => s.id);
}
// 時鐘已經數過的座位，選擇鎖定
export function isLocked(room, seatId) {
  const c = room.nomination?.clock;
  if (!c) return false;
  const k = c.order.indexOf(seatId);
  return k >= 0 && k < c.k;
}
// 下一個到點的時刻：計票中是當前這一位，否則是投票倒數（暫停時不算）
export const countDue = room => {
  const n = room.nomination, c = n?.clock;
  return c ? c.at + c.step : n && n.paused == null ? n.deadline : null;
};
// 這一位定下來，輪到下一位：之前沒表態的算棄權，走完自動結算
function nextTurn(room) {
  const nom = room.nomination, c = nom.clock, id = c.order[c.k];
  if (!nom.votes[id] && !nom.abstain[id]) { nom.votes[id] = false; nom.abstain[id] = true; }
  c.k += 1;
  c.at = Date.now();
  if (c.k >= c.order.length) closeVote(room);
}

// 說書人暫停 / 繼續投票倒數
export function pauseTimer(room) {
  const n = room.nomination;
  if (!n) return '當前沒有投票';
  if (n.clock) return '已經在計票了';
  if (n.paused == null) n.paused = Math.max(0, n.deadline - Date.now());
  else { n.deadline = Date.now() + n.paused; n.paused = null; }
}
// 說書人把倒數重置回 5 分鐘（暫停中的保持暫停）
export function resetTimer(room) {
  const n = room.nomination;
  if (!n) return '當前沒有投票';
  if (n.clock) return '已經在計票了';
  if (n.paused != null) n.paused = VOTE_WINDOW; else n.deadline = Date.now() + VOTE_WINDOW;
}

export function startCount(room) {
  const nom = room.nomination;
  if (!nom) return '當前沒有投票';
  if (nom.clock) return '已經在計票了';
  const v = virginFirst(room);
  if (v) return v === true ? undefined : v;
  // 先給所有人彈全屏提示，播完時鐘才從第一位開始。k：輪到第幾位；at：這一位開始的時刻
  nom.clock = { order: voteOrder(room, nom), k: 0, at: Date.now() + CALL_MS, step: VOTE_STEP };
  fx(room, { k: 'callvote', to: nom.nomineeId });
  announce(room, `說書人提出立即計票：從 ${label(room, nom.clock.order[0])} 開始順時針輪流選擇，到點沒有表態的算棄權。`, { k: 'count' });
}

// v：'yes' 舉手贊成；'abstain' 棄權（不計票，只有自己和說書人看得到）；null 不表態。兼容舊的 true / false / 'no'
export function vote(room, seat, v) {
  const nom = room.nomination;
  if (!nom) return '當前沒有投票';
  if (v === true) v = 'yes'; else if (v === 'no') v = 'abstain'; else if (v !== 'yes' && v !== 'abstain') v = null;
  if (isLocked(room, seat.id)) return '已經數過你了，不能再改';
  if (v === 'yes') {
    if (!canVote(seat)) return '你的死亡票已經用過了';
    const m = masterOf(room, seat);
    if (m && !nom.votes[m]) return '你是管家：主人舉手時你才能舉手';
  }
  nom.votes[seat.id] = v === 'yes';
  nom.abstain ||= {};
  if (v === 'abstain') nom.abstain[seat.id] = true; else delete nom.abstain[seat.id];
  // 主人放手，管家的手也要放下（已經數過的不動）
  if (v !== 'yes') for (const b of room.seats) if (masterOf(room, b) === seat.id && !isLocked(room, b.id)) nom.votes[b.id] = false;
  // 輪到自己時選了：立刻定下，輪到下一位。取消不算選了
  const c = nom.clock;
  if (v && c?.order[c.k] === seat.id && Date.now() >= c.at) nextTurn(room);
}

export function closeVote(room) {
  const nom = room.nomination;
  if (!nom) return '沒有進行中的投票';
  const v = virginFirst(room);
  if (v) return v === true ? undefined : v;
  const counted = s => !!s && nom.votes[s.id] && canVote(s);
  // 管家：主人最終沒有投票，管家的票不算
  const voters = room.seats.filter(s => counted(s) && (!masterOf(room, s) || counted(seatById(room, masterOf(room, s)))));
  const abstain = room.seats.filter(s => nom.abstain?.[s.id]);
  for (const v of voters) if (v.dead) v.voteUsed = true; // 死人投票消耗唯一一次死亡票
  room.g.voted = [...new Set([...(room.g.voted || []), ...voters.map(v => v.id)])]; // 賣花女孩：今天誰投過票
  const required = Math.ceil(alive(room).length / 2);
  room.history.push({
    day: room.g.day, nominatorId: nom.nominatorId, nomineeId: nom.nomineeId,
    nominee: label(room, nom.nomineeId), nominator: label(room, nom.nominatorId),
    voters: voters.map(v => label(room, v.id)), count: voters.length, required,
  });
  room.nomination = null;
  const b = onTheBlock(room);
  const res = b.block?.nomineeId === nom.nomineeId ? 'block' : b.tie && voters.length === b.count ? 'tie' : 'fail';
  fx(room, { k: 'votes', to: nom.nomineeId, count: voters.length, need: required, res, voters: voters.map(v => v.id) });
  stLog(room, `${label(room, nom.nomineeId)} 得到 ${voters.length} 票`, { k: 'votes', to: nom.nomineeId, voters: voters.map(v => v.id), abstain: abstain.map(v => v.id), need: required, res });
  announce(room, `${label(room, nom.nomineeId)} 得到 ${voters.length} 票（至少需要 ${required} 票）` +
    (voters.length ? `：${voters.map(v => label(room, v.id)).join('、')}。` : '。') +
    (b.block ? `目前將被處決的是 ${b.block.nominee}。` : b.tie ? '目前平票，無人將被處決。' : '目前無人將被處決。'),
    { k: 'votes', to: nom.nomineeId, n: voters.length, need: required, res, voters: voters.map(v => v.id) });
}

// 說書人取消提名（糾錯）：雙方今天的提名 / 被提名次數退回
export function cancelVote(room) {
  const nom = room.nomination, g = room.g;
  if (!nom) return '沒有進行中的投票';
  room.nomination = null;
  // 取消的是觸發貞潔者的那次提名：能力退回
  if (g.virginCheck?.from === nom.nominatorId && g.virginCheck.seatId === nom.nomineeId) { g.virginCheck = null; g.virginUsed = false; }
  g.nominators = g.nominators.filter(id => id !== nom.nominatorId);
  g.nominees = g.nominees.filter(id => id !== nom.nomineeId);
  announce(room, '說書人取消了本次提名，雙方今天可以重新提名 / 被提名。', { k: 'cancel' });
}

// 今日處決台：票數達標且最高的唯一一人；count 是今天達標的最高票數（平票時也有）
export function onTheBlock(room) {
  let block = null, tie = false;
  for (const v of room.history.filter(x => x.day === room.g.day)) {
    if (v.count < v.required) continue;
    if (!block || v.count > block.count) { block = v; tie = false; } else if (v.count === block.count) tie = true;
  }
  return { block: tie ? null : block, tie, count: block ? block.count : 0 };
}

export function slayer(room, from, target) {
  const g = room.g;
  if (g.manual) return '手動局由說書人處理';
  if (room.phase !== 'day') return '只能在白天開槍';
  if (from.dead) return '死亡玩家不能開槍';
  if (g.shot.includes(from.id)) return '你今天已經開過槍了';
  g.shot.push(from.id);
  (g.shotEver ||= []).push(from.id); // 整局開過槍的人：獵手頭上的瞄準鈕據此收起
  announce(room, `${label(room, from.id)} 宣稱自己是獵手，向 ${label(room, target.id)} 開槍……`, { k: 'slay', from: from.id, to: target.id });
  const real = from.role === 'slayer' && !g.slayerUsed;
  if (from.role === 'slayer') g.slayerUsed = true;
  // 每一槍都停下讓說書人裁定，真假獵手、中不中都不會從停頓上露出來
  // 假獵手（含酒鬼）、能力已用、中毒 / 醉酒、目標不可能被當作惡魔：必定未中；健康的真獵手打中真惡魔：必定命中；
  // 健康的真獵手打可以被當作惡魔的隱士：說書人定
  const demon = teamOf(target) === 'demon', bad = impaired(room, from), mayBe = teamsAs(room, target).includes('demon');
  askRuling(room, 'slayer', from, { to: target.id, real, demon, auto: real && demon && !bad, would: real && demon,
    forced: !real || bad || !mayBe || demon, reg: real && !bad && mayBe && !demon ? target.role : null });
}
function finishSlay(room, from, target, hit) {
  (room.g.shotLog ||= []).push({ from: from.id, to: target.id, hit, day: room.g.day }); // 公開：座位上標「射 N 號失敗」
  fx(room, { k: 'slay', from: from.id, to: target.id, hit });
  stLog(room, `${label(room, from.id)} 向 ${label(room, target.id)} 開槍`, { k: 'slay', from: from.id, to: target.id, hit });
  if (hit) {
    announce(room, `${label(room, target.id)} 倒下了！`, { k: 'slayhit', seat: target.id });
    const sh = tryKill(room, target, '被獵手擊殺');
    if (sh) {
      stLog(room, `${label(room, target.id)} 被擊中，但他${shieldText(sh)}`, { k: 'rule', seat: target.id, role: target.role, work: true });
      fx(room, { k: 'ststamp', seat: target.id, word: '沒有死亡', tone: 'good' }, 'st');
    }
    checkWin(room);
  } else {
    announce(room, '什麼也沒有發生。', { k: 'slaymiss' });
  }
}

// 死後要做的選擇：月之子、呆瓜公開選人，心上人由說書人選（st）。知道自己死了才問（夜裏死的天亮後），天黑前要答完
export function answerLastWord(room, seatId, targetId) {
  const g = room.g, w = g.lastWords?.find(x => x.seatId === seatId), seat = seatById(room, seatId), t = targetId ? seatById(room, targetId) : null;
  if (room.phase !== 'day' || !w) return '現在不需要選擇';
  if (targetId && (!t || t.dead || t === seat)) return '請選擇一名存活的其他玩家';
  g.lastWords = g.lastWords.filter(x => x !== w);
  if (w.role === 'sweetheart') { if (t) sweetDrunk(room, t); } else {
    const say = t ? `${label(room, seatId)} 是${roleName(w.role)}，他選擇了 ${label(room, t.id)}。` : `${label(room, seatId)} 沒有選人。`;
    announce(room, say);
    stLog(room, say, { k: 'word', seat: seatId, role: w.role, to: t?.id || null });
    if (w.role === 'moonchild') g.moonchildPick = t?.id || null;
    // 呆瓜選中邪惡玩家，他的陣營落敗；隱士 / 間諜可以被當作另一陣營，中毒的呆瓜沒有能力
    if (w.role === 'klutz' && t) {
      const bad = impaired(room, seat), flex = evilAs(room, t).length > 1;
      askRuling(room, 'klutz', seat, { to: t.id, auto: isEvil(t) && !bad, would: isEvil(t), forced: !flex || bad, reg: flex && !bad ? t.role : null });
    }
  }
  if (g.ending && room.phase === 'day') finishDay(room);
}

// 雜耍藝人：第一個白天公開猜最多五次，當晚按猜的時候對不對算數字
export function juggle(room, seat, target, role) {
  const g = room.g;
  if (g.manual || room.phase !== 'day' || g.day !== 1) return '只能在第一個白天猜';
  if (actingRole(seat) !== 'juggler' || seat.dead) return '你不能猜';
  if (!scriptRoles(room).includes(role)) return '角色不存在';
  const list = (g.juggle ||= {})[seat.id] ||= [];
  if (list.length >= 5) return '最多猜五次';
  list.push({ seat: target.id, role, hit: target.role === role, maybe: rolesAs(room, target).includes(role) });
  const say = `${label(room, seat.id)} 猜 ${label(room, target.id)} 是【${roleName(role)}】`;
  announce(room, say);
  stLog(room, say, { k: 'juggle', seat: seat.id, to: target.id, role });
}

export function endDay(room) {
  if (room.phase !== 'day') return '現在不是白天';
  if (room.g.ending && room.g.lastWords?.length) return '還有人沒做完死後的選擇';
  if (room.nomination) closeVote(room);
  const { block } = onTheBlock(room);
  room.g.ending = true;
  if (block && !room.g.dayOver) execute(room, room.seats.find(s => s.id === block.nomineeId));
  else if (!room.g.executedToday) { announce(room, '今天沒有人被處決。', { k: 'noexec' }); fx(room, { k: 'noexec' }); }
  finishDay(room);
}
function finishDay(room) {
  if (room.phase === 'ended') return;
  if (room.g.manual) return startNight(room);
  if (room.g.ruling || room.g.lastWords?.length || noExecutionEnds(room) || mayorWin(room)) return;
  startNight(room);
}

// 計票時這一位到點就輪到下一位，投票倒數到點就結算：服務端每次推送狀態後調用
const countTimers = new Map(); // 房間號 -> { due: 預定到點時刻, timer }
export function countTick(room, onChange) {
  const due = countDue(room), cur = countTimers.get(room.code);
  if (cur && cur.due !== due) { clearTimeout(cur.timer); countTimers.delete(room.code); }
  if (!due || countTimers.has(room.code)) return;
  countTimers.set(room.code, { due, timer: setTimeout(() => {
    countTimers.delete(room.code);
    if (!room.nomination || countDue(room) !== due) return;
    // 等說書人裁定時玩家點不了選擇：這一位重新計時，不能白白算棄權
    if (!room.nomination.clock) closeVote(room); else if (room.g.ruling) room.nomination.clock.at = Date.now(); else nextTurn(room);
    onChange(room);
  }, Math.max(0, due - Date.now()) + 60) });
}

// 貞潔者必定反噬的 30 秒到點：服務端每次推送狀態後調用。有別的裁定在等時先不動，裁定完下一次推送再觸發
const virginTimers = new Map(); // 房間號 -> { due, timer }
export function virginTick(room, onChange) {
  const due = room.g?.virginCheck?.due || null, cur = virginTimers.get(room.code);
  if (cur && cur.due !== due) { clearTimeout(cur.timer); virginTimers.delete(room.code); }
  if (!due || virginTimers.has(room.code)) return;
  virginTimers.set(room.code, { due, timer: setTimeout(() => {
    virginTimers.delete(room.code);
    if (room.phase === 'day' && room.g.virginCheck?.due === due && !room.g.ruling) { resolveVirgin(room, true); onChange(room); }
  }, Math.max(0, due - Date.now()) + 30) });
}
