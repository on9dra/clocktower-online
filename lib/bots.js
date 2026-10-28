// 機器人玩家：說書人測試用。夜晚輪到它時隨機選人，投票時隨機舉手。
import { newSeat } from './store.js';
import { submitPicks, autoPicks } from './engine.js';
import { vote, canVote } from './day.js';

const BOT_DELAY = 900;
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
  const act = nextBotAction(room);
  if (!act) return;
  timers.set(room.code, setTimeout(() => {
    timers.delete(room.code);
    nextBotAction(room)?.();
    onChange(room);
  }, BOT_DELAY));
}

function nextBotAction(room) {
  const step = room.g.step;
  if (room.phase === 'night' && step && step.status === 'choose') {
    const seat = room.seats.find(s => s.id === step.seatId);
    if (seat && isBot(seat)) {
      const { ids, role } = autoPicks(room, step);
      return () => submitPicks(room, true, null, ids, role);
    }
  }
  const nom = room.nomination;
  if (room.phase === 'day' && nom) {
    const voters = room.seats.filter(s => isBot(s) && canVote(s) && nom.votes[s.id] === undefined);
    if (voters.length) return () => voters.forEach(s => { const r = Math.random(); vote(room, s, r < 0.45 ? 'yes' : r < 0.75 ? 'abstain' : null); });
  }
  return null;
}
