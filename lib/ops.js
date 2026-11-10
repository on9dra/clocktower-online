// 說書人與玩家的操作入口。返回字符串表示錯誤。
import { newSeat, newGame, rid } from './store.js';
import { seatById, label, pushChat, announce, stLog, shuffle, tell, scriptRoles, offline, oneDevice } from './util.js';
import { SCRIPTS } from '../public/js/roles.js';
import { startGame, submitPicks, confirmStep, ackStep, skipStep, decideStep, finishNight, syncFree, endPretend, markPick } from './engine.js';
import { startDay, nominate, vote, closeVote, cancelVote, startCount, pauseTimer, resetTimer, slayer, endDay, resolveRuling, resolveVirgin, answerLastWord, juggle } from './day.js';
import { killSeat, revive, checkWin, execute, endGame } from './rules.js';
import { drawRoles, clearDraft, clearPins, refreshHidden, setRole, unpin, setBluff, setRedHerring } from './setup.js';
import { parseScript, registerScript, dropScript } from './script.js';
import { setReminder, setAlign } from './manual.js';
import { profile, forget, movePlayer, voteMvp, closeMvp, throwEgg } from './score.js';

const clip = (t, n) => String(t ?? '').trim().slice(0, n);
const inGame = r => r.phase !== 'lobby' && r.phase !== 'ended';

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
function next(room, o = {}) {
  switch (room.phase) {
    case 'lobby': return startGame(room, !!o.force); // force：說書人看過提醒（沒有惡魔等）仍然要開
    case 'dawn': return startDay(room);
    case 'day': return endDay(room);
    case 'ended': return backToLobby(room, '回到準備階段，可以開始新的一局。');
    default: return '夜晚會隨玩家行動自動推進';
  }
}

// 只有手動局能用的操作
const inOffline = fn => (r, o) => (offline(r) && inGame(r) ? fn(r, o) : '只有線下局可以這樣操作');

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
  setRole: (r, o) => setRole(r, o.seatId, o.roleId, o.fakeRole) || void syncFree(r),
  unpin: (r, o) => unpin(r, o.seatId),
  setBluff: (r, o) => setBluff(r, o.i, o.roleId),
  setRedHerring: (r, o) => setRedHerring(r, o.seatId),
  // 夜晚
  pick: (r, o) => submitPicks(r, true, null, o.ids, o.role),
  confirm: (r, o) => confirmStep(r, o.fields),
  ack: r => ackStep(r),
  markPick: (r, o) => markPick(r, o.ids),
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
  // 線上 / 線下 + 多設備 / 單設備：建房後先選。單設備的座位是名字、別的是手機，座位上有人以後這兩種不能互換
  venue: (r, o) => {
    if (r.phase !== 'lobby') return '遊戲中不能換';
    const v = o.venue, d = v === 'online' ? 'many' : o.devices || r.settings.devices || 'many';
    if (!['online', 'offline'].includes(v) || !['many', 'one'].includes(d)) return '模式不存在';
    if ((v === 'offline' && d === 'one') !== oneDevice(r) && r.seats.length) return '座位上已經有人了';
    Object.assign(r.settings, { chosen: true, venue: v, devices: d });
  },
  // 線下局加座位：一次可以加好幾個名字（空格、逗號、換行隔開都行），按順時針排在後面
  addSeats: (r, o) => {
    if (!oneDevice(r)) return '只有單設備的線下局可以直接加座位';
    if (r.phase !== 'lobby') return '遊戲中不能加座位';
    const names = (Array.isArray(o.names) ? o.names : [o.names]).map(x => clip(x, 12)).filter(Boolean);
    if (!names.length) return '請輸入名字';
    if (r.seats.length + names.length > 15) return `最多 15 人，還能加 ${15 - r.seats.length} 人`;
    for (const name of names) r.seats.push(Object.assign(newSeat('local:' + rid(), name), { local: true }));
    clearDraft(r);
  },
  // 單設備直接定人數：多了在後面補空座位（名字之後點名牌改），少了從最後一個往前拿掉
  seatCount: (r, o) => {
    if (!oneDevice(r)) return '只有單設備的線下局可以直接加座位';
    if (r.phase !== 'lobby') return '遊戲中不能加減座位';
    const n = Math.max(0, Math.min(15, Number(o.n) | 0));
    if (n === r.seats.length) return;
    while (r.seats.length < n) r.seats.push(Object.assign(newSeat('local:' + rid(), ''), { local: true }));
    for (const s of r.seats.splice(n)) forget(r, s.pid);
    clearDraft(r);
  },
  // 名字可以清空：座位上只剩號碼
  renameSeat: (r, o) => {
    const s = seatById(r, o.seatId), name = clip(o.name || '', 12);
    if (!s?.local) return '只能改線下座位的名字';
    s.name = name;
  },
  // 線下局計票：大家當面舉手，說書人看誰舉了就點誰（v：'yes' 舉手 / null 放下）
  handVote: inOffline((r, o) => {
    const s = seatById(r, o.seatId);
    if (!s) return '座位不存在';
    return vote(r, s, o.v)?.replaceAll('你', '他'); // 提示是寫給玩家的（「你是管家…」），說書人替他點時換成「他」
  }),
  // 座位
  shuffleSeats: r => { if (r.phase !== 'lobby') return '遊戲中不能換座'; r.seats = shuffle(r.seats); },
  // 拖座位：兩個座位對調（準備階段）
  swapSeats: (r, o) => {
    const i = r.seats.findIndex(s => s.id === o.a), j = r.seats.findIndex(s => s.id === o.b);
    if (r.phase !== 'lobby' || i < 0 || j < 0 || i === j) return '換不了';
    [r.seats[i], r.seats[j]] = [r.seats[j], r.seats[i]];
  },
  moveSeat: (r, o) => {
    const i = r.seats.findIndex(s => s.id === o.seatId), j = i + (o.dir > 0 ? 1 : -1);
    if (r.phase !== 'lobby' || i < 0 || j < 0 || j >= r.seats.length) return;
    [r.seats[i], r.seats[j]] = [r.seats[j], r.seats[i]];
  },
  // 移出的人記進名單，刷新也回不來；說書人可以整單解除
  kick: (r, o) => {
    const s = seatById(r, o.seatId);
    if (r.phase !== 'lobby') return '遊戲中不能移除玩家';
    if (!s) return;
    r.seats = r.seats.filter(x => x !== s);
    if (!s.local) r.banned = [...(r.banned || []), s.pid].slice(-200); // 名單有個上限，反覆移出不會讓存檔越來越大。線下座位沒有手機，不用記
    forget(r, s.pid);
    clearDraft(r);
  },
  unban: r => { r.banned = []; },
  // 房間密碼：4 位數字，空的是取消
  pass: (r, o) => {
    const pass = String(o.pass || '');
    if (pass && !/^\d{4}$/.test(pass)) return '密碼是 4 位數字';
    r.pass = pass;
  },
  // 給座位發一條重連鏈接（換設備、換人頂替）：打開鏈接的設備接過這個座位，原設備退出。再發一次舊鏈接作廢
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
  // 說書人看過白天的私下告知（紅唇女郎接任）
  notice: r => { if (!r.g.notice?.length) return '沒有要告知的'; r.g.notice.shift(); },
  // 說書人自己記的標記（系統不認識的角色、備忘），沒有效果；陣營糾錯
  remind: (r, o) => (inGame(r) ? setReminder(r, o.seatId, o.text, !!o.on) : '遊戲還沒開始'),
  setAlign: (r, o) => (inGame(r) ? setAlign(r, o.seatId, o.align) : '遊戲還沒開始'),
  // 線下：玩家當面說，說書人替他點。限制和玩家自己做一樣
  nominate: inOffline((r, o) => {
    const from = seatById(r, o.fromId), to = seatById(r, o.toId);
    return from && to ? nominate(r, from, to) : '目標不存在';
  }),
  slayFor: inOffline((r, o) => {
    const from = seatById(r, o.fromId), to = seatById(r, o.toId);
    if (r.g.ruling) return '請先處理裁定';
    return from && to ? slayer(r, from, to) : '目標不存在';
  }),
  // 雜耍藝人一口氣猜完：[{ id, role }]，最多五個
  juggleFor: inOffline((r, o) => {
    const seat = seatById(r, o.seatId), list = Array.isArray(o.guesses) ? o.guesses.slice(0, 5) : [];
    if (!seat) return '座位不存在';
    for (const x of list) {
      const t = seatById(r, x?.id), err = t ? juggle(r, seat, t, x.role) : '目標不存在';
      if (err) return err;
    }
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
    // 收件人只能是所有人或某個座位：別的值（null、對象）會被觀眾、甚至所有人當成發給自己的
    const to = o.to === 'all' ? 'all' : seatById(r, o.to) ? o.to : null;
    if (!to) return '收件人不存在';
    pushChat(r, { from: 'st', fromName: '說書人', to, text });
  },
};

// 線下局的撤銷：說書人一個人在觸屏上點，點錯是常事。每次改動前把這局的狀態拍一張快照（只在內存裏，重啓就沒了），撤銷就整張換回去。
// 聊天、演出的序號不回退（客戶端靠它們判斷新舊），只換遊戲本身的狀態
const UNDO = new WeakMap(), UNDO_MAX = 30;
const SNAP = ['phase', 'seats', 'g', 'nomination', 'history', 'winner', 'winReason', 'result', 'mvp', 'draft', 'bluffPins', 'herringPin', 'games', 'gameId', 'players'];
const NO_UNDO = new Set(['undo', 'close', 'pass', 'seatLink', 'chat', 'mvp', 'unban', 'upload', 'script', 'venue', 'mode', 'roleRule', 'clearRules']);
export const undoOf = room => UNDO.get(room)?.at(-1)?.op || null;
function undo(room) {
  const last = UNDO.get(room)?.pop();
  if (!last) return '沒有可以撤銷的操作';
  const was = JSON.parse(last.snap);
  for (const k of SNAP) room[k] = was[k];
}

// 等說書人裁定時，推進遊戲的操作先停下
const HALT = new Set(['next', 'startCount', 'closeVote', 'cancelVote', 'execute', 'dawn']);
export function applyStOp(room, op) {
  if (op?.op === 'undo') return offline(room) ? undo(room) : '只有線下局可以撤銷';
  if (room.g?.ruling && HALT.has(op.op)) return '請先裁定能力是否生效';
  // 貞潔者需要裁定時：結束白天 / 直接處決前要先裁定（必定反噬的，結束白天時會先反噬）
  const vc = room.g?.virginCheck;
  if (vc && (op.op === 'execute' || (op.op === 'next' && !vc.forced))) return '請先裁定貞潔者是否反噬';
  // 只認表裏自己的操作：constructor、toString 這些名字會查到原型上的函數，constructor 會把整個房間（密鑰、所有人的 pid、私聊）原樣回給調用方
  const fn = typeof op.op === 'string' && Object.hasOwn(stOps, op.op) ? stOps[op.op] : null;
  if (!fn) return '未知操作';
  const snap = offline(room) && !NO_UNDO.has(op.op) && JSON.stringify(Object.fromEntries(SNAP.map(k => [k, room[k]])));
  const r = fn(room, op);
  if (snap && typeof r !== 'string') {
    const list = UNDO.get(room) || [];
    list.push({ snap, op: op.op });
    if (list.length > UNDO_MAX) list.shift();
    UNDO.set(room, list);
  }
  return r;
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
  if (oneDevice(room) || room.phase !== 'lobby' || room.seats.length >= 15) return WATCH; // 單設備的座位只有說書人能加，打開鏈接的人只能觀戰
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
  if (!seat || seat.local) return '鏈接已失效，請找說書人重新發';
  const mine = room.seats.find(s => s.pid === pid);
  if (mine && mine !== seat) return '你在這個房間已經有座位了';
  delete seat.claim;
  room.banned = (room.banned || []).filter(p => p !== pid);
  if (seat.pid === pid) return;
  movePlayer(room, seat.pid, pid);
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
      if (offline(room)) return '線下局由說書人替你點'; // 當面指給說書人看
      return room.phase === 'day' && room.g?.lastWords?.some(w => w.seatId === me.id && !w.st) ? answerLastWord(room, me.id, act.ids?.[0]) : submitPicks(room, false, me.id, act.ids, act.role);
    case 'nominate': return offline(room) ? '線下局當面提名，說書人會替你點' : target ? nominate(room, me, target) : '目標不存在';
    case 'vote': return room.nomination?.hand ? '線下局當面舉手，說書人會記下' : vote(room, me, act.v !== undefined ? act.v : !!act.up);
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
