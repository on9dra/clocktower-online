// 測試服的調試工具：機器人玩家、說書人隨時換成任意一個座位的身份、說書人離席時機器人代為主持。
// 只有環境變量 BOTC_DEBUG=1 的服務器（測試服）有；房間要在大廳勾了「調試模式」再建 / 進才開（room.debug）。正式服沒有入口
import { newSeat, rid } from './store.js';
import { submitPicks, autoPicks, markPick, confirmStep, ackStep, decideStep, skipStep, endPretend, finishNight } from './engine.js';
import { vote, canVote, isLocked, answerLastWord, startCount, resolveRuling, resolveVirgin, handUp, closeVote } from './day.js';
import { voteMvp } from './score.js';
import { clearDraft } from './setup.js';
import { NIGHT } from './night.js';
import { shuffle, pick, seatById, offline, oneDevice, maxSeats, guard } from './util.js';
import { asking, askWait, takeAsk } from './asks.js';

export const DEBUG = process.env.BOTC_DEBUG === '1';
// 機器人的玩家標識帶冒號：真人的標識不許有冒號（server.js PID），拿不到機器人的座位
export const isBot = s => typeof s?.pid === 'string' && s.pid.startsWith('bot:');

// 機器人按座位號起名（3 號座位就叫「機器人3」）：準備階段加減、換座後跟著改。說書人換成它的身份改過名的不動（測長名字用）
const AUTO_NAME = /^機器人\d+$/;
export function renameBots(room) {
  room.seats.forEach((s, i) => { if (isBot(s) && (!s.name || AUTO_NAME.test(s.name))) s.name = `機器人${i + 1}`; });
}
export function addBots(room, n) {
  if (room.phase !== 'lobby') return '只能在準備階段加機器人';
  if (oneDevice(room)) return '單設備的座位直接定人數';
  const max = maxSeats(room), k = Math.min(Number(n) | 0, max - room.seats.length);
  if (k <= 0) return `這個劇本最多 ${max} 人`;
  for (let i = 0; i < k; i++) room.seats.push(newSeat('bot:' + rid(), ''));
  renameBots(room);
  clearDraft(room);
}
export function removeBots(room) {
  if (room.phase !== 'lobby') return '遊戲中不能移除機器人';
  if (!room.seats.some(isBot)) return '沒有機器人';
  room.seats = room.seats.filter(s => !isBot(s));
  renameBots(room);
  clearDraft(room);
}

// 說書人那台設備上的調試面板要的東西：現在是誰、每個座位是什麼角色（代入玩家視角時桌上看不到）、夜裏輪到誰
// info：發給他的私密信息的序號（菜單上和他本機記的「看過的最後一條」比，算出幾條沒看）；hand：線下舉手時 up 舉著 / can 還能舉；
// st：說書人那邊等著處理的（玩家的請求、裁定），代入座位時頂欄上提醒一下
export function debugInfo(room, as) {
  const g = room.g, step = g?.step, nom = room.nomination, inGame = room.phase !== 'lobby';
  const info = id => (inGame ? room.chat.filter(m => m.info && m.to === id).map(m => m.seq || 0) : []);
  const hand = s => (!nom?.hand ? null : nom.votes[s.id] ? 'up' : canVote(s) ? 'can' : null);
  return {
    as, auto: room.dbgAuto !== false, max: maxSeats(room),
    seats: room.seats.map(s => ({ id: s.id, role: s.role || null, fake: s.fakeRole || null, bot: isBot(s), dead: !!s.dead, info: info(s.id), hand: hand(s) })), // dead：真實的（代入的玩家夜裏還看不到今晚的死者）
    turn: room.phase === 'night' && (step?.status === 'choose' || step?.status === 'mark') ? step.seatId : null,
    st: inGame && room.phase !== 'ended' ? (g?.asks?.length || 0) + (g?.ruling ? 1 : 0) + (g?.virginCheck ? 1 : 0) : 0,
    // 夜裏輪到說書人點（線下局選人也是說書人點；線上只有輪到玩家自己選的不算）
    stNight: room.phase === 'night' && !!step && (offline(room) || !['choose', 'mark'].includes(step.status) || !step.seatId),
  };
}

// 每次推送前由 server.js 更新：說書人正在代入哪幾個座位（這些座位聽人的，機器人不動），還有沒有人留在說書人視角
// touch：線下舉手時說書人上一次換座位 / 有人改了舉手的時間。他一個個座位換過去舉手，每換一次都要幾秒，代班說書人等他停下來再結算
const here = new Map(); // 房間號 -> { drive: Set<seatId>, stHere, sig, touch }
export function setPresence(room, drive, stHere) {
  const was = here.get(room.code), nom = room.nomination;
  const sig = nom?.hand ? `${nom.at}|${[...drive].sort()}|${JSON.stringify(nom.votes)}` : '';
  here.set(room.code, { drive: new Set(drive), stHere, sig, touch: sig && sig !== was?.sig ? Date.now() : was?.touch || 0 });
}

const BOT_DELAY = 900, BOT_TURN = 700; // 機器人想多久；立即計票輪到它時再多想一會兒
const ST_DELAY = 1500, NOM_TALK = 8000, MVP_WAIT = 1500; // 代班說書人每一步的間隔；提名後讓大家說多久再計票；MVP 開票後多久投
const SEE_MS = 15000, MY_TURN = 3000; // 代班說書人夜裏：說書人代入的座位收到信息後至少等多久再天亮（演出 + 面板亮著的八秒）；輪到他自己的那一步多停多久
const HAND_WAIT = 4000, HAND_QUIET = 8000; // 線下當面舉手：說完以後再等多久結算；說書人換座位、改舉手以後至少再等多久
const timers = new Map(); // 房間號 -> 等著執行的動作
const failed = new Map(); // 房間號 -> 上次做不成的那件事：局面沒變就不再試

// 每次推送後調用：有機器人該動就隔一會兒動一下，然後通知刷新
export function botTick(room, onChange) {
  if (!DEBUG || timers.has(room.code)) return;
  const a = nextAction(room);
  if (!a) return;
  const at = Date.now() + Math.max(0, a.delay ?? BOT_DELAY);
  timers.set(room.code, setTimeout(guard(() => {
    timers.delete(room.code);
    // 等的這段時間裏要等到更晚了（說書人又換了座位、又有人改了舉手）：重新排
    const b = nextAction(room);
    if (b && b.key === a.key && b.until > Date.now() + 50) return botTick(room, onChange);
    if (botStep(room)) onChange(room);
  }), at - Date.now()));
}
// 馬上做下一件事（不等）：沒有要做的返回 false。測試裏一步步推
export function botStep(room) {
  const a = nextAction(room);
  if (!a) return false;
  if (typeof a.run() === 'string') failed.set(room.code, a.key);
  return true;
}

function nextAction(room) {
  if (!room.g) return null;
  const p = here.get(room.code) || { drive: new Set(), stHere: true };
  const free = s => !!s && isBot(s) && !p.drive.has(s.id);
  // 說書人在座位上（代入了別人）、沒有人留在說書人視角：機器人替他主持
  const host = room.debug && room.dbgAuto !== false && p.drive.size > 0 && !p.stHere;
  const skip = room.code && failed.get(room.code);
  for (const a of [botAction(room, free), host && hostAction(room, p, skip)]) if (a && a.key !== skip) return a;
  return null;
}

const others = (room, id) => room.seats.filter(s => !s.dead && s.id !== id);

// 線下多設備的投票：機器人在自己的手機上舉手（一半舉、死人只剩一票的少舉），每次提名想一次；說書人替它改過的不再動。
// 管家的主人沒舉手、舉不了的就放著
function handBots(room, free) {
  const nom = room.nomination;
  if (room.phase !== 'day' || !nom?.hand || oneDevice(room)) return null;
  const bots = room.seats.filter(s => free(s) && canVote(s) && nom.votes[s.id] === undefined);
  return bots.length ? { key: 'hand:' + nom.at, run: () => bots.forEach(s => {
    if (Math.random() >= (s.dead ? 0.25 : 0.5) || handUp(room, s, 'yes')) handUp(room, s, null);
  }) } : null;
}

// 機器人玩家：夜裏輪到就隨便選一組合規的，白天隨機舉手，死後的選擇、MVP 隨便選。線下局都是說書人代點，機器人只在多設備的投票裏自己舉手
function botAction(room, free) {
  if (offline(room)) return handBots(room, free);
  const g = room.g, step = g.step, nom = room.nomination;
  if (room.phase === 'night' && step) {
    const seat = seatById(room, step.seatId);
    if (step.status === 'choose' && free(seat)) return { key: step.id, run: () => {
      const { ids, role, stuck } = autoPicks(room, step);
      return stuck ? '選不出合規的人' : submitPicks(room, false, seat.id, ids, role);
    } };
    // 系統不認識的角色：能力寫著要選人的，選夠數就行
    if (step.status === 'mark' && step.ask && !step.sent && free(seat)) return { key: step.id, run: () => {
      const a = step.ask, n = a.any ? Math.floor(Math.random() * (room.seats.length + 1)) : a.opt ? Math.floor(Math.random() * (a.n + 1)) : a.n;
      return markPick(room, shuffle(room.seats).slice(0, n).map(s => s.id), seat.id);
    } };
  }
  if (room.phase === 'day') {
    const w = g.lastWords?.find(x => !x.st && free(seatById(room, x.seatId)));
    if (w) return { key: `word:${g.day}:${w.seatId}`, run: () => answerLastWord(room, w.seatId, pick(others(room, w.seatId))?.id || null) };
    if (nom && !nom.hand) {
      const voters = room.seats.filter(s => free(s) && canVote(s) && nom.votes[s.id] === undefined && !isLocked(room, s.id));
      if (voters.length) return { key: `vote:${nom.at}`, run: () => voters.forEach(s => { const r = Math.random(); vote(room, s, r < 0.45 ? 'yes' : r < 0.75 ? 'abstain' : null); }) };
      // 立即計票輪到機器人：按之前的選擇定下來，不用等到點（舉不了手的管家棄權）
      const c = nom.clock, cur = c && seatById(room, c.order[c.k]);
      if (free(cur)) return { key: `turn:${nom.at}:${c.k}`, delay: Math.max(0, c.at - Date.now()) + BOT_TURN + Math.random() * BOT_TURN,
        run: () => { if (Date.now() >= c.at && vote(room, cur, nom.votes[cur.id] ? 'yes' : 'abstain')) vote(room, cur, 'abstain'); } };
    }
  }
  const m = room.mvp;
  if (room.phase === 'ended' && m && !m.done && m.gameId === room.gameId) {
    const voters = room.seats.filter(s => free(s) && s.online && !m.votes[s.pid]);
    if (voters.length) return { key: `mvp:${m.gameId}`, delay: Math.max(0, m.opensAt - Date.now()) + MVP_WAIT,
      run: () => voters.forEach(s => voteMvp(room, s.pid, pick(room.seats).id)) };
  }
  return null;
}

// 代班說書人：能力正常時給真實信息，裁定都按「生效」（只有一種結果的照規則），提名後讓大家說一會兒再立即計票。
// 開局、結束白天、判勝負還是等說書人自己回來點
const ruled = c => (c.forced ? !!c.auto : true);
const paced = (key, run, delay = ST_DELAY) => ({ key: 'st:' + key, run, delay });
function hostAction(room, p, skip) {
  const g = room.g, step = g.step, nom = room.nomination;
  if (room.phase === 'night' && step) {
    const seat = seatById(room, step.seatId), id = step.id + ':' + step.status;
    // 說書人代入的座位剛收到信息：等他看完演出、亮著的面板再天亮（不然演出還沒播完天就亮了）；輪到他自己時也多停一會兒。
    // 別人的步驟照常走（他閉著眼，看不到）
    const look = Math.max(0, ...room.chat.filter(m => m.info && p.drive.has(m.to) && m.night === g.night).map(m => m.at || 0));
    const delay = Math.max(ST_DELAY, step.status === 'review' ? look + SEE_MS - Date.now() : 0, p.drive.has(step.seatId) ? MY_TURN : 0);
    const paced = (key, run) => ({ key: 'st:' + key, run, delay });
    if (step.status === 'review') return paced(id, () => finishNight(room));
    if (step.status === 'ack') return paced(id, () => ackStep(room));
    if (step.status === 'fake') return paced(id, () => endPretend(room));
    if (step.status === 'decide') return paced(id, () => decideStep(room, step.decide.options[0].id));
    // 真實信息；被規則擋下（渦流在場只能給錯誤信息）就換一個，都不行就跳過
    if (step.status === 'confirm') return paced(id, () => {
      const f = step.form, t = f.truth || {}, tries = [t, ...(f.kind === 'number' ? [{ n: t.n + 1 }, { n: Math.max(0, t.n - 1) }] : f.kind === 'yesno' ? [{ yes: !t.yes }] : [])];
      if (tries.every(x => confirmStep(room, x))) return skipStep(room);
    });
    // 說書人自己選的（沒有座位、只由說書人選）、線下局替玩家點（說書人代入的座位也是：線下玩家自己不選）、機器人選不出來的：隨便選一組，還不行就跳過。
    // 線上的真人和說書人代入的座位等他自己選
    const stuck = skip === step.id, off = offline(room);
    if (step.status === 'choose' && (!seat || NIGHT[step.roleId]?.stOnly || off || stuck) && (off || !p.drive.has(seat?.id))) return paced(id, () => {
      const { ids, role, stuck: no } = seat ? autoPicks(room, step) : { stuck: true };
      if (no || submitPicks(room, true, null, ids, role)) return skipStep(room);
    });
    // 系統不認識的角色：選完了（或者不用選）就記下、叫下一個；線下沒人替他點，直接過
    if (step.status === 'mark' && (!step.ask || step.sent || off || stuck)) return paced(id, () => ackStep(room));
  }
  if (room.phase === 'day') {
    if (g.notice?.length) return paced('notice:' + g.notice.length, () => void g.notice.shift());
    if (g.ruling) return paced('rule:' + g.ruling.seatId, () => resolveRuling(room, ruled(g.ruling)));
    if (g.virginCheck) return paced('virgin:' + g.virginCheck.seatId, () => resolveVirgin(room, ruled(g.virginCheck)));
    // 線下多設備：說書人代入的座位在手機上提出的請求（提名、開槍、雜耍藝人猜、死後選人），代班說書人照單受理；審判、裁定中的等它結束
    const a = g.asks?.find(x => !askWait(room, x));
    if (a) return paced('ask:' + a.id, () => takeAsk(room, a.id));
    // 心上人死後由說書人選；線下局月之子、呆瓜也是說書人代點（多設備裏說書人代入的那個座位等他自己在手機上選）
    const w = g.lastWords?.find(x => x.st || (offline(room) && !(asking(room) && p.drive.has(x.seatId))));
    if (w) return paced(`word:${g.day}:${w.seatId}`, () => answerLastWord(room, w.seatId, pick(others(room, w.seatId))?.id || null));
    if (nom && !nom.clock && !nom.hand) return paced('count:' + nom.at, () => startCount(room), Math.max(0, nom.at + NOM_TALK - Date.now()));
    // 線下當面舉手：讓大家說一會兒、舉完手，再結算
    if (nom?.hand) {
      const until = Math.max(nom.at + NOM_TALK + HAND_WAIT, (p.touch || 0) + HAND_QUIET);
      return { ...paced('close:' + nom.at, () => closeVote(room), Math.max(0, until - Date.now())), until };
    }
  }
  return null;
}
