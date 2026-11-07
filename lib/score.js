// 積分與雞蛋：每名玩家（按 pid，存在房間裏）有勝利積分、MVP 次數、雞蛋。
// 終局結算勝利積分和雞蛋，之後 30 秒 MVP 投票；玩家隨時可以向別人扔雞蛋
import { EGG, EGG_GAP, MVP_DELAY, MVP_WINDOW } from '../public/js/score.js';
import { announce, fx, label, seatById, alignOf } from './util.js';


// 玩家檔案：第一次進這個房間時建立（帶 3 枚雞蛋），之後離座再回來也還是同一份
export function profile(room, pid) {
  return (room.players ||= {})[pid] ||= { eggs: EGG.start, wins: 0, mvp: 0 };
}
// 離座 / 被移出：檔案還是初始的就刪掉（回來會重建一份一樣的），免得反覆進出把檔案越堆越多
export function forget(room, pid) {
  const p = room.players?.[pid];
  if (p && p.eggs === EGG.start && !p.wins && !p.mvp && !p.lastEgg) delete room.players[pid];
}
// 座位換了設備：檔案、上一局的皇冠、MVP 投票跟著人走
export function movePlayer(room, from, to) {
  const ps = room.players ||= {};
  if (ps[from]) { ps[to] = ps[from]; delete ps[from]; }
  if (room.result) room.result.winners = room.result.winners.map(p => (p === from ? to : p));
  const votes = room.mvp?.votes;
  if (votes && from in votes) { votes[to] = votes[from]; delete votes[from]; }
}

// 終局：所在陣營獲勝的人勝利積分 +1、雞蛋 +10，輸的人雞蛋 +1；記下這局的贏家（頭上的皇冠、煙花），開始 MVP 投票
export function settleGame(room, team) {
  const winners = [];
  for (const s of room.seats) {
    if (!s.role) continue;
    const p = profile(room, s.pid), won = (alignOf(s) === 'good') === (team === 'good');
    if (won) { p.wins += 1; p.eggs += EGG.win; winners.push(s.pid); } else p.eggs += EGG.lose;
  }
  const now = Date.now();
  room.result = { gameId: room.gameId, team, winners, at: now };
  room.mvp = { gameId: room.gameId, opensAt: now + MVP_DELAY, closesAt: now + MVP_DELAY + MVP_WINDOW, votes: {}, done: false, winners: [], tally: {} };
}

// 有投票權的人：在線的玩家 + 在線的說書人
export function mvpVoters(room) {
  return [...room.seats.filter(s => s.online).map(s => s.pid), ...(room.stOnline ? ['st'] : [])];
}
const mvpOpen = room => room.phase === 'ended' && room.mvp && !room.mvp.done && room.mvp.gameId === room.gameId;

// 投 MVP：voter 是玩家的 pid 或 'st'；seatId 為空表示收回。可以投自己，不能投說書人（說書人沒有座位）
export function voteMvp(room, voter, seatId) {
  if (!mvpOpen(room)) return 'MVP 投票已結束';
  const m = room.mvp;
  if (!seatId) { delete m.votes[voter]; return; }
  if (!seatById(room, seatId)) return '玩家不存在';
  m.votes[voter] = seatId;
  if (mvpVoters(room).every(v => m.votes[v])) closeMvp(room); // 人都投完了就不用等到點
}

// 結束 MVP 投票：得票最多的當選（平票就一起當選），MVP 次數 +1、雞蛋 +5
export function closeMvp(room) {
  const m = room.mvp;
  if (!m || m.done) return;
  m.done = true;
  const tally = {};
  for (const id of Object.values(m.votes)) if (seatById(room, id)) tally[id] = (tally[id] || 0) + 1;
  const top = Math.max(0, ...Object.values(tally));
  m.tally = tally;
  m.winners = top ? room.seats.map(s => s.id).filter(id => tally[id] === top) : [];
  for (const id of m.winners) { const p = profile(room, seatById(room, id).pid); p.mvp += 1; p.eggs += EGG.mvp; }
  if (!m.winners.length) return announce(room, '本局沒有人得到 MVP 票。', { k: 'mvp', seats: [], n: 0 });
  announce(room, `本局 MVP：${m.winners.map(id => label(room, id)).join('、')}（${top} 票）`, { k: 'mvp', seats: m.winners, n: top });
  fx(room, { k: 'mvp', seats: m.winners, n: top });
}

// 扔雞蛋：每扔一枚少一枚；不能扔自己；連點太快的忽略。事件單獨一列（不進演出隊列，客戶端立即播）
export function throwEgg(room, from, target) {
  if (!target) return '目標不存在';
  if (target.id === from.id) return '不能扔自己';
  const p = profile(room, from.pid), now = Date.now();
  if (p.eggs <= 0) return '雞蛋用完了';
  if (now - (p.lastEgg || 0) < EGG_GAP) return;
  p.eggs -= 1;
  p.lastEgg = now;
  room.eggSeq = (room.eggSeq || 0) + 1;
  (room.eggs ||= []).push({ seq: room.eggSeq, from: from.id, to: target.id, at: now });
  if (room.eggs.length > 30) room.eggs.splice(0, room.eggs.length - 30);
}

// MVP 投票到點自動結束：服務端每次推送狀態後調用
const mvpTimers = new Map(); // 房間號 -> { due, timer }
export function mvpTick(room, onChange) {
  const due = mvpOpen(room) ? room.mvp.closesAt : null, cur = mvpTimers.get(room.code);
  if (cur && cur.due !== due) { clearTimeout(cur.timer); mvpTimers.delete(room.code); }
  if (!due || mvpTimers.has(room.code)) return;
  mvpTimers.set(room.code, { due, timer: setTimeout(() => {
    mvpTimers.delete(room.code);
    if (mvpOpen(room) && room.mvp.closesAt === due) { closeMvp(room); onChange(room); }
  }, Math.max(0, due - Date.now()) + 30) });
}
