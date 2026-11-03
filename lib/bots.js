// 機器人玩家：說書人測試用。夜晚輪到它時隨機選人，投票時隨機舉手。
import { newSeat } from './store.js';
import { submitPicks, autoPicks, confirmStep, ackStep, decideStep, skipStep, endPretend, finishNight } from './engine.js';
import { vote, canVote, answerLastWord, startCount, resolveRuling, resolveVirgin } from './day.js';
import { answerCard, autoCard } from './manual.js';
import { NIGHT } from './night.js';

const BOT_DELAY = 900, BOT_TURN = 700; // 立即計票輪到機器人時想多久
const ST_DELAY = 1500, NOM_TALK = 8000; // 單人試玩：機器人說書人每一步的間隔；提名後等多久開始計票
const timers = new Map(); // 房間號 -> 待執行的機器人動作

export const isBot = seat => typeof seat.pid === 'string' && seat.pid.startsWith('bot:');

export function addBots(room, count) {
  if (room.phase !== 'lobby') return '只能在準備階段加機器人';
  const n = Math.max(1, Math.min(Number(count) || 1, 15 - room.seats.length));
  if (room.seats.length >= 15) return '房間已滿';
  for (let i = 0; i < n; i++) room.seats.push(newSeat('bot:' + Math.random().toString(36).slice(2, 10), ''));
  renameBots(room);
}

export function removeBots(room) {
  if (room.phase !== 'lobby') return '遊戲中不能移除機器人';
  room.seats = room.seats.filter(s => !isBot(s));
}

// 機器人按座位號起名（3 號座位就叫「機器人3」）；準備階段座位有增減、換位後重排
export function renameBots(room) {
  room.seats.forEach((s, i) => { if (isBot(s)) s.name = `機器人${i + 1}`; });
}

// 每次狀態變化後調用：如果有機器人該行動，延遲一下再行動，然後通知刷新
export function botTick(room, onChange) {
  if (timers.has(room.code)) return;
  const act = nextAction(room);
  if (!act) return;
  timers.set(room.code, setTimeout(() => {
    timers.delete(room.code);
    nextAction(room)?.();
    onChange(room);
  }, act.delay ?? BOT_DELAY));
}

export const nextAction = room => nextBotAction(room) || (room.solo ? nextStAction(room) : null);

// 單人試玩（room.solo）：機器人當說書人，能力正常時給真實信息，能給裁定的都讓能力生效。白天什麼時候結束由真人按（soloOp）
const ruled = c => (c.forced ? !!c.auto : true);
const paced = (fn, delay = ST_DELAY) => Object.assign(fn, { delay });
function nextStAction(room) {
  const g = room.g, step = g.step, nom = room.nomination;
  if (room.phase === 'night' && step) {
    const seat = room.seats.find(s => s.id === step.seatId);
    if (step.status === 'review') return paced(() => finishNight(room));
    if (step.status === 'ack') return paced(() => ackStep(room));
    if (step.status === 'fake') return paced(() => endPretend(room));
    // 真實信息；被規則擋下（渦流在場只能給錯誤信息）就換一個
    if (step.status === 'confirm') return paced(() => {
      const f = step.form, t = f.truth, tries = [t, ...(f.kind === 'number' ? [{ n: t.n + 1 }, { n: t.n - 1 }] : f.kind === 'yesno' ? [{ yes: !t.yes }] : [])];
      if (tries.every(x => confirmStep(room, x))) skipStep(room);
    });
    if (step.status === 'decide') return paced(() => decideStep(room, step.decide.options[0].id));
    if (step.status === 'choose' && (!seat || NIGHT[step.roleId].stOnly)) return paced(() => {
      const { ids, role, stuck } = seat ? autoPicks(room, step) : { stuck: true };
      if (stuck || submitPicks(room, true, null, ids, role)) skipStep(room);
    });
  }
  if (room.phase === 'day') {
    if (g.ruling) return paced(() => resolveRuling(room, ruled(g.ruling)));
    if (g.virginCheck) return paced(() => resolveVirgin(room, ruled(g.virginCheck)));
    if (nom && !nom.clock) return paced(() => startCount(room), Math.max(0, nom.at + NOM_TALK - Date.now()));
  }
  return null;
}

function nextBotAction(room) {
  const step = room.g.step;
  const card = room.g.manual && room.g.cards.find(c => !c.done && isBot(room.seats.find(s => s.id === c.seatId) || {}));
  if (card) return () => { const { ids, role } = autoCard(room, card); answerCard(room, card.seatId, ids, role); };
  const word = room.phase === 'day' && room.g.lastWords?.find(w => !w.st && isBot(room.seats.find(s => s.id === w.seatId) || {}));
  if (word) return () => answerLastWord(room, word.seatId, room.seats.filter(s => !s.dead && s.id !== word.seatId)[0]?.id || null);
  if (room.phase === 'night' && step && step.status === 'choose') {
    const seat = room.seats.find(s => s.id === step.seatId);
    if (seat && isBot(seat)) {
      const { ids, role } = autoPicks(room, step);
      return () => submitPicks(room, false, seat.id, ids, role);
    }
  }
  const nom = room.nomination;
  if (room.phase === 'day' && nom) {
    const voters = room.seats.filter(s => isBot(s) && canVote(s) && nom.votes[s.id] === undefined);
    if (voters.length) return () => voters.forEach(s => { const r = Math.random(); vote(room, s, r < 0.45 ? 'yes' : r < 0.75 ? 'abstain' : null); });
    // 立即計票輪到機器人：按之前的選擇定下來，不等到點（舉不了手的管家棄權）
    const c = nom.clock, cur = c && room.seats.find(s => s.id === c.order[c.k]);
    if (cur && isBot(cur)) return paced(() => { if (Date.now() >= c.at && vote(room, cur, nom.votes[cur.id] ? 'yes' : 'abstain')) vote(room, cur, 'abstain'); },
      Math.max(0, c.at - Date.now()) + BOT_TURN + Math.random() * BOT_TURN);
  }
  return null;
}
