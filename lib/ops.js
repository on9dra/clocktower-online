// 說書人與玩家的操作入口。返回字符串表示錯誤。
import { newSeat, newGame } from './store.js';
import { seatById, label, pushChat, announce, stLog, shuffle, tell, scriptRoles } from './util.js';
import { startGame, submitPicks, confirmStep, skipStep, decideStep, finishNight, syncFree } from './engine.js';
import { startDay, nominate, vote, closeVote, cancelVote, startCount, pauseTimer, resetTimer, slayer, endDay, resolveRuling, resolveVirgin } from './day.js';
import { killSeat, revive, checkWin, execute } from './rules.js';
import { drawRoles, clearDraft, setRole, setRedHerring } from './setup.js';
import { addBots, removeBots } from './bots.js';
import { profile, voteMvp, closeMvp, throwEgg } from './score.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);
const inGame = r => r.phase !== 'lobby' && r.phase !== 'ended';

// 回到準備階段：清空角色和本局狀態，座位和玩家保留
function backToLobby(room, text) {
  room.phase = 'lobby';
  room.g = newGame();
  Object.assign(room, { nomination: null, history: [], winner: null, winReason: '', draft: false });
  for (const s of room.seats) Object.assign(s, { role: null, fakeRole: null, dead: false, voteUsed: false });
  room.fx = [];
  closeMvp(room); // MVP 還沒投完就按已投的票結算
  announce(room, text, { k: 'lobby' });
}

// 主按鈕：根據當前階段做“下一步”
function next(room) {
  switch (room.phase) {
    case 'lobby': return startGame(room);
    case 'dawn': return startDay(room);
    case 'day': return endDay(room);
    case 'ended': return backToLobby(room, '回到準備階段，可以開始新的一局。');
    default: return '夜晚會隨玩家行動自動推進';
  }
}

// 座位變化（加人、移人）會讓預覽好的角色作廢
const seatsChanged = (r, err) => { if (!err) clearDraft(r); return err; };

const stOps = {
  next,
  abandon: r => (r.phase === 'lobby' ? '還沒開局' : backToLobby(r, '說書人放棄了本局，回到準備階段。')),
  // 開局配置
  draft: r => (r.phase !== 'lobby' ? '遊戲已經開始' : drawRoles(r) || void (r.draft = true)),
  undraft: r => clearDraft(r),
  roleRule: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能改配置';
    if (!scriptRoles(r).includes(o.roleId)) return '角色不存在';
    const rules = (r.settings ||= {}).roleRules ||= {};
    if (o.rule === 'lock' || o.rule === 'ban') rules[o.roleId] = o.rule; else delete rules[o.roleId];
  },
  clearRules: r => { (r.settings ||= {}).roleRules = {}; },
  setRole: (r, o) => setRole(r, o.seatId, o.roleId, o.fakeRole) || void syncFree(r),
  setRedHerring: (r, o) => setRedHerring(r, o.seatId),
  // 夜晚
  pick: (r, o) => submitPicks(r, true, null, o.ids),
  confirm: (r, o) => confirmStep(r, o.fields),
  decide: (r, o) => decideStep(r, o.choice),
  skip: r => skipStep(r),
  dawn: r => finishNight(r),
  // 白天
  startCount: r => startCount(r),
  pauseTimer: r => pauseTimer(r),
  resetTimer: r => resetTimer(r),
  closeVote: r => closeVote(r),
  cancelVote: r => cancelVote(r),
  execute: (r, o) => {
    const s = seatById(r, o.seatId);
    if (r.phase !== 'day' || !s) return '只能在白天處決';
    if (r.g.dayOver) return '今天已經處決過了';
    r.nomination = null;
    stLog(r, `說書人直接處決了 ${label(r, s.id)}`, { k: 'fix', what: 'execute', seat: s.id });
    execute(r, s);
  },
  // 座位
  shuffleSeats: r => { if (r.phase !== 'lobby') return '遊戲中不能換座'; r.seats = shuffle(r.seats); },
  moveSeat: (r, o) => {
    const i = r.seats.findIndex(s => s.id === o.seatId), j = i + (o.dir > 0 ? 1 : -1);
    if (r.phase !== 'lobby' || i < 0 || j < 0 || j >= r.seats.length) return;
    [r.seats[i], r.seats[j]] = [r.seats[j], r.seats[i]];
  },
  addBots: (r, o) => seatsChanged(r, addBots(r, o.count)),
  removeBots: r => seatsChanged(r, removeBots(r)),
  kick: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能移除玩家';
    r.seats = r.seats.filter(s => s.id !== o.seatId);
    clearDraft(r);
  },
  // 手動糾錯：規則沒覆蓋到的情況由說書人直接改
  setDead: (r, o) => {
    const s = seatById(r, o.seatId);
    if (!s || !inGame(r)) return;
    if (o.dead) killSeat(r, s, '說書人手動標記');
    else revive(r, s);
    if (r.phase !== 'night') checkWin(r);
  },
  setPoison: (r, o) => {
    if (!inGame(r)) return '遊戲還沒開始';
    const s = o.seatId ? seatById(r, o.seatId) : null;
    r.g.poisoned = s ? s.id : null;
    stLog(r, s ? `說書人把 ${label(r, s.id)} 設為中毒` : '說書人解除了中毒', { k: 'fix', what: s ? 'poison' : 'unpoison', seat: s?.id });
    syncFree(r);
  },
  tellInfo: (r, o) => {
    const s = seatById(r, o.seatId), text = clip(o.text, 300);
    if (!s || !text) return '信息為空';
    tell(r, s.id, text);
    stLog(r, `補發信息給 ${label(r, s.id)}：「${text}」`, { k: 'fix', what: 'tell', seat: s.id, text });
  },
  rule: (r, o) => resolveRuling(r, !!o.work),
  mvp: (r, o) => voteMvp(r, 'st', o.seatId || null),
  virgin: (r, o) => resolveVirgin(r, !!o.work),
  chat: (r, o) => {
    const text = clip(o.text, 500);
    if (!text) return '消息為空';
    pushChat(r, { from: 'st', fromName: '說書人', to: o.to === 'all' ? 'all' : o.to, text });
  },
};

// 等說書人裁定時，推進遊戲的操作先停下
const HALT = new Set(['next', 'startCount', 'closeVote', 'cancelVote', 'execute', 'dawn']);
export function applyStOp(room, op) {
  if (room.g?.ruling && HALT.has(op.op)) return '請先裁定能力是否生效';
  // 貞潔者需要裁定時：結束白天 / 直接處決前要先裁定（必定反噬的，結束白天時會先反噬）
  const vc = room.g?.virginCheck;
  if (vc && (op.op === 'execute' || (op.op === 'next' && !vc.forced))) return '請先裁定貞潔者是否反噬';
  const fn = stOps[op.op];
  return fn ? fn(room, op) : '未知操作';
}

// 玩家加入：準備階段自動分配座位，遊戲中只能回到自己的座位
export function joinPlayer(room, pid, name) {
  const mine = room.seats.find(s => s.pid === pid);
  if (mine) { if (name) mine.name = clip(name, 12); return; }
  if (room.phase !== 'lobby') return '遊戲已經開始，無法加入';
  if (room.seats.length >= 15) return '房間已滿';
  room.seats.push(newSeat(pid, clip(name, 12) || `玩家${room.seats.length + 1}`));
  profile(room, pid); // 第一次進房間：送 3 枚雞蛋
  clearDraft(room);
}

export function applyPlayerAction(room, pid, act) {
  const me = room.seats.find(s => s.pid === pid);
  if (!me) return '你不在這局遊戲中';
  const target = act.targetId && seatById(room, act.targetId);
  if (room.g?.ruling && ['nominate', 'vote', 'slay'].includes(act.act)) return '請稍候，說書人正在處理';
  switch (act.act) {
    case 'pick': return submitPicks(room, false, me.id, act.ids);
    case 'nominate': return target ? nominate(room, me, target) : '目標不存在';
    case 'vote': return vote(room, me, act.v !== undefined ? act.v : !!act.up);
    case 'slay': return target ? slayer(room, me, target) : '目標不存在';
    case 'egg': return throwEgg(room, me, target);
    case 'mvp': return voteMvp(room, me.pid, act.targetId || null);
    case 'rename': me.name = clip(act.name, 12) || me.name; return;
    case 'leave':
      if (room.phase !== 'lobby') return '遊戲中不能離開座位';
      room.seats = room.seats.filter(s => s !== me);
      clearDraft(room);
      return;
    case 'chat': {
      const text = clip(act.text, 500);
      if (!text) return '消息為空';
      const to = act.to === 'all' || act.to === 'st' ? act.to : seatById(room, act.to) ? act.to : null;
      if (!to) return '收件人不存在';
      return pushChat(room, { from: me.id, fromName: label(room, me.id), to, text });
    }
    default: return '未知操作';
  }
}
