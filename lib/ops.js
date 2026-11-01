// 說書人與玩家的操作入口。返回字符串表示錯誤。
import { newSeat, newGame, rid, createRoom } from './store.js';
import { seatById, label, pushChat, announce, stLog, shuffle, tell, scriptRoles, modeOf, modeLocked, FAKE } from './util.js';
import { SCRIPTS } from '../public/js/roles.js';
import { startGame, submitPicks, confirmStep, ackStep, skipStep, decideStep, finishNight, syncFree, endPretend } from './engine.js';
import { startDay, nominate, vote, closeVote, cancelVote, startCount, pauseTimer, resetTimer, slayer, endDay, resolveRuling, resolveVirgin, answerLastWord, juggle } from './day.js';
import { killSeat, revive, checkWin, execute, endGame } from './rules.js';
import { drawRoles, clearDraft, clearPins, refreshHidden, setRole, unpin, setBluff, setRedHerring } from './setup.js';
import { parseScript, registerScript, dropScript } from './script.js';
import { sendCard, dropCard, answerCard, sendInfo, sendEvilInfo, setReminder, setAlign, setShown, toggleTick } from './manual.js';
import { addBots, removeBots, renameBots, isBot } from './bots.js';
import { profile, forget, movePlayer, voteMvp, closeMvp, throwEgg } from './score.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);
const inGame = r => r.phase !== 'lobby' && r.phase !== 'ended';
const manualNow = r => (r.phase === 'lobby' ? modeOf(r) === 'manual' : !!r.g?.manual && inGame(r));

// 換劇本：角色配置、預覽和指定的角色都作廢
function useScript(room, id) {
  clearPins(room);
  room.g = newGame();
  room.scriptId = id;
  (room.settings ||= {}).roleRules = {};
  const name = id === 'custom' ? room.script.name : SCRIPTS[id].name;
  announce(room, `說書人選擇了劇本：${name}`, { k: 'script', id });
}

// 回到準備階段：清空角色和本局狀態，座位和玩家保留
function backToLobby(room, text) {
  room.phase = 'lobby';
  room.g = newGame();
  Object.assign(room, { nomination: null, history: [], winner: null, winReason: '' });
  clearPins(room);
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
const seatsChanged = (r, err) => { if (!err) { clearDraft(r); renameBots(r); } return err; };
// 只有手動局能用的操作
const inManual = fn => (r, o) => (r.g?.manual && inGame(r) ? fn(r, o) : '只有手動局可以這樣操作');

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
    clearDraft(r); // 抽好的角色是按舊配置抽的，留著就會按舊配置開局
  },
  clearRules: r => { (r.settings ||= {}).roleRules = {}; clearDraft(r); },
  // 換劇本：角色配置和預覽作廢
  script: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能換劇本';
    if (!Object.hasOwn(SCRIPTS, o.scriptId) && !(o.scriptId === 'custom' && r.script)) return '劇本不存在';
    if (r.scriptId === o.scriptId) return;
    useScript(r, o.scriptId);
  },
  // 上傳劇本：entries 是 Json 解析出來的數組。解析不了就什麼都不變
  upload: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能換劇本';
    const script = parseScript(o.entries, r.inst);
    if (typeof script === 'string') return script;
    dropScript(r);
    r.script = script;
    registerScript(r);
    useScript(r, 'custom');
    return { name: script.name, roles: script.roles.length, skipped: script.skipped, auto: script.auto };
  },
  // 開局模式：準備階段切換，開局就定下
  mode: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能換模式';
    if (o.mode !== 'auto' && o.mode !== 'manual') return '模式不存在';
    if (modeLocked(r)) return '這本劇本只能手動';
    (r.settings ||= {}).mode = o.mode;
    if (o.mode === 'auto') for (const s of r.seats) if (!FAKE[s.role]) s.fakeRole = null; // 智能推進裏只有酒鬼、瘋子有假身份
    if (r.draft) refreshHidden(r, false);
  },
  setRole: (r, o) => setRole(r, o.seatId, o.roleId, o.fakeRole) || void syncFree(r),
  unpin: (r, o) => unpin(r, o.seatId),
  setBluff: (r, o) => setBluff(r, o.i, o.roleId),
  setRedHerring: (r, o) => setRedHerring(r, o.seatId),
  // 夜晚
  pick: (r, o) => submitPicks(r, true, null, o.ids, o.role),
  confirm: (r, o) => confirmStep(r, o.fields),
  ack: r => ackStep(r),
  word: (r, o) => answerLastWord(r, o.seatId, o.targetId || null),
  decide: (r, o) => decideStep(r, o.choice),
  skip: r => skipStep(r),
  pretend: r => endPretend(r),
  noPretend: (r, o) => { r.g.noPretend = !!o?.on; }, // 開關：這一次的假裝照走，之後的夜晚才不假裝
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
  shuffleSeats: r => { if (r.phase !== 'lobby') return '遊戲中不能換座'; r.seats = shuffle(r.seats); renameBots(r); },
  moveSeat: (r, o) => {
    const i = r.seats.findIndex(s => s.id === o.seatId), j = i + (o.dir > 0 ? 1 : -1);
    if (r.phase !== 'lobby' || i < 0 || j < 0 || j >= r.seats.length) return;
    [r.seats[i], r.seats[j]] = [r.seats[j], r.seats[i]];
    renameBots(r);
  },
  addBots: (r, o) => seatsChanged(r, addBots(r, o.count)),
  removeBots: r => seatsChanged(r, removeBots(r)),
  // 移出的人記進名單，刷新也回不來；說書人可以整單解除
  kick: (r, o) => {
    const s = seatById(r, o.seatId);
    if (r.phase !== 'lobby') return '遊戲中不能移除玩家';
    if (!s) return;
    r.seats = r.seats.filter(x => x !== s);
    if (!isBot(s)) { (r.banned ||= []).push(s.pid); forget(r, s.pid); }
    clearDraft(r);
    renameBots(r);
  },
  unban: r => { r.banned = []; },
  // 房間密碼：4 位數字，空的是取消
  pass: (r, o) => {
    const pass = String(o.pass || '');
    if (pass && !/^\d{4}$/.test(pass)) return '密碼是 4 位數字';
    r.pass = pass;
  },
  // 給座位發一條重連鏈接（換設備、換人頂替、真人接手機器人）：打開鏈接的設備接過這個座位，原設備退出。再發一次舊鏈接作廢
  seatLink: (r, o) => {
    const s = seatById(r, o.seatId);
    if (!s) return '座位不存在';
    s.claim = rid(6);
    return { token: s.claim };
  },
  // 手動糾錯：規則沒覆蓋到的情況由說書人直接改
  setDead: (r, o) => {
    const s = seatById(r, o.seatId);
    if (!s || !inGame(r)) return;
    if (o.dead) killSeat(r, s, '說書人手動標記');
    else revive(r, s);
    if (r.phase !== 'night') checkWin(r);
    // 手動局白天點死人就是公佈（夜裏的死訊天亮才公佈）
    if (r.g.manual && r.phase === 'day' && o.dead) announce(r, `${label(r, s.id)} 死亡。`, { k: 'slayhit', seat: s.id });
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
  // 手動局
  card: inManual((r, o) => sendCard(r, o)),
  cardDrop: inManual((r, o) => dropCard(r, o.seatId)),
  cardPick: inManual((r, o) => answerCard(r, o.seatId, o.ids, o.role)),
  inform: inManual((r, o) => sendInfo(r, o.seatId, o.terms)),
  evilInfo: inManual(r => sendEvilInfo(r)),
  remind: inManual((r, o) => setReminder(r, o.seatId, o.text, !!o.on)),
  setAlign: inManual((r, o) => setAlign(r, o.seatId, o.align)),
  setShown: (r, o) => (manualNow(r) ? setShown(r, o.seatId, o.roleId) || void (r.draft && refreshHidden(r, false)) : '只有手動局可以這樣操作'),
  tick: inManual((r, o) => toggleTick(r, o.roleId)),
  // 線下玩家口頭提名，說書人替他點。限制和玩家自己提名一樣
  nominate: inManual((r, o) => {
    const from = seatById(r, o.fromId), to = seatById(r, o.toId);
    return from && to ? nominate(r, from, to) : '目標不存在';
  }),
  // 規則沒自動判到的勝負（呆瓜選中邪惡、說書人裁定等）：說書人直接判
  win: (r, o) => {
    if (!inGame(r)) return '遊戲還沒開始';
    if (o.team !== 'good' && o.team !== 'evil') return '請選擇獲勝陣營';
    stLog(r, `說書人判定${o.team === 'good' ? '善良' : '邪惡'}陣營獲勝`, { k: 'fix', what: 'win', team: o.team });
    endGame(r, o.team, '說書人判定');
  },
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

// 單人試玩（?solo）：一個真人 + 機器人 + 機器人說書人，開好局。只給開發測試，界面上沒有入口
export function createSolo(pid, name, { count, role, script } = {}) {
  const room = createRoom();
  room.solo = true;
  room.settings.pretend = false;
  joinPlayer(room, pid, name);
  if (script && Object.hasOwn(SCRIPTS, script)) stOps.script(room, { scriptId: script });
  addBots(room, Math.max(5, Math.min(Number(count) || 7, 15)) - 1);
  room.seats = shuffle(room.seats);
  renameBots(room);
  return soloOps.restart(room, room.seats.find(s => s.pid === pid), { role }) || room;
}

const soloOps = {
  // 換個角色重開：沒給或不在這本劇本裏就隨機
  restart: (r, me, o) => {
    if (r.phase !== 'lobby') backToLobby(r, '重開一局。');
    if (o.role) setRole(r, me.id, o.role);
    return applyStOp(r, { op: 'next' });
  },
  dusk: r => (r.phase === 'day' ? applyStOp(r, { op: 'next' }) : '現在不是白天'),
  // 隨機一個機器人提名，一半的機會提名真人
  nominate: (r, me) => {
    const free = r.seats.filter(s => !r.g.nominees.includes(s.id));
    const from = shuffle(r.seats.filter(s => isBot(s) && !s.dead && !r.g.nominators.includes(s.id)))[0];
    const target = free.includes(me) && Math.random() < 0.5 ? me : shuffle(free.filter(s => s !== from))[0];
    return from && target ? nominate(r, from, target) : '沒有人可以提名了';
  },
};
export function soloOp(room, pid, o) {
  const me = room.seats.find(s => s.pid === pid), fn = Object.hasOwn(soloOps, o.op) && soloOps[o.op];
  if (!room.solo || !me || !fn) return '無權限';
  return fn(room, me, o);
}

// 玩家加入：準備階段自動分配座位，遊戲中只能回到自己的座位。
// 坐不下（已經開局、滿 15 人）返回 WATCH：調用方讓他觀戰
export const WATCH = '只能觀戰';
export const NEED_PASS = '請輸入房間密碼', BAD_PASS = '房間密碼不對';
export function joinPlayer(room, pid, name, pass) {
  const mine = room.seats.find(s => s.pid === pid);
  if (mine) { if (name) mine.name = clip(name, 12); return; }
  const shut = mayEnter(room, pid, pass);
  if (shut) return shut;
  if (room.phase !== 'lobby' || room.seats.length >= 15) return WATCH;
  room.seats.push(newSeat(pid, clip(name, 12) || `玩家${room.seats.length + 1}`));
  profile(room, pid); // 第一次進房間：送 3 枚雞蛋
  clearDraft(room);
}

// 新來的人（玩家、觀戰）能不能進：被移出的不行；有密碼的房間要輸對，已經在座的不用
export function mayEnter(room, pid, pass) {
  if (room.banned?.includes(pid)) return '你已被說書人移出這個房間';
  if (!room.pass || room.seats.some(s => s.pid === pid)) return;
  if (!pass) return NEED_PASS;
  if (pass !== room.pass) return BAD_PASS;
}

// 用說書人發的重連鏈接接過座位
export function claimSeat(room, pid, token) {
  const seat = token && room.seats.find(s => s.claim === token);
  if (!seat) return '鏈接已失效，請找說書人重新發';
  const mine = room.seats.find(s => s.pid === pid);
  if (mine && mine !== seat) return '你在這個房間已經有座位了';
  delete seat.claim;
  room.banned = (room.banned || []).filter(p => p !== pid);
  if (seat.pid === pid) return;
  if (!isBot(seat)) movePlayer(room, seat.pid, pid);
  seat.pid = pid;
  profile(room, pid);
}

export function applyPlayerAction(room, pid, act) {
  const me = room.seats.find(s => s.pid === pid);
  if (!me) return '你不在這局遊戲中';
  const target = act.targetId && seatById(room, act.targetId);
  if (room.g?.ruling && ['nominate', 'vote', 'slay'].includes(act.act)) return '請稍候，說書人正在處理';
  switch (act.act) {
    case 'pick':
      if (room.g?.manual) return answerCard(room, me.id, act.ids, act.role);
      return room.phase === 'day' && room.g?.lastWords?.some(w => w.seatId === me.id && !w.st) ? answerLastWord(room, me.id, act.ids?.[0]) : submitPicks(room, false, me.id, act.ids, act.role);
    case 'nominate': return target ? nominate(room, me, target) : '目標不存在';
    case 'vote': return vote(room, me, act.v !== undefined ? act.v : !!act.up);
    case 'slay': return target ? slayer(room, me, target) : '目標不存在';
    case 'juggle': return target ? juggle(room, me, target, act.role) : '目標不存在';
    case 'egg': return throwEgg(room, me, target);
    case 'mvp': return voteMvp(room, me.pid, act.targetId || null);
    case 'rename': me.name = clip(act.name, 12) || me.name; return;
    case 'leave':
      if (room.phase !== 'lobby') return '遊戲中不能離開座位';
      room.seats = room.seats.filter(s => s !== me);
      forget(room, pid);
      clearDraft(room);
      renameBots(room);
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
