// 按身份裁剪房間狀態：說書人看全部，玩家只看公開信息 + 自己的角色和信息
import { actingRole, alive, seatTags, isPoisoned, hasEff } from './util.js';
import { onTheBlock } from './day.js';
import { willRun } from './engine.js';
import { isBot } from './bots.js';
import { mvpVoters } from './score.js';
import { EGG } from '../public/js/score.js';

// since：只帶上序號大於它的聊天消息（客戶端增量拼接）
export function viewFor(room, who, since = 0) {
  const isSt = !!who.st;
  const me = isSt ? null : room.seats.find(s => s.pid === who.pid);
  const myId = me ? me.id : null;
  const g = room.g;
  const ended = room.phase === 'ended';

  // 積分：上一局的贏家頭上戴皇冠（到下一次分出勝負），本局 MVP 在開新局前一直標著
  const res = room.result, m = room.mvp, sameGame = x => !!x && x.gameId === room.gameId;
  const score = s => {
    const p = room.players?.[s.pid] || {};
    return { crown: res?.winners.includes(s.pid) ? res.team : null, mvp: !!(sameGame(m) && m.done && m.winners.includes(s.id)),
      wins: p.wins || 0, mvps: p.mvp || 0, eggs: p.eggs ?? EGG.start };
  };
  const seats = room.seats.map(s => {
    // 夜裏死的人要等天亮才公佈：玩家視角在夜晚看不到今晚的死亡
    const hiddenDeath = !isSt && room.phase === 'night' && g.diedTonight.includes(s.id);
    const base = { id: s.id, name: s.name, online: s.online, dead: s.dead && !hiddenDeath, deathBy: s.dead && !hiddenDeath ? s.deathBy || null : null,
      voteUsed: s.voteUsed, mine: s.id === myId, bot: isBot(s), ...score(s) };
    if (isSt || ended) return { ...base, role: s.role, fakeRole: s.fakeRole, tags: isSt && s.role ? seatTags(room, s) : [] };
    return base;
  });

  const step = g.step;
  const prompt = !isSt && room.phase === 'night' && step && step.status === 'choose' && step.seatId === myId
    ? { ...step.choose, stepId: step.id, roleId: step.roleId } : null;

  const chat = room.chat.filter(m => (m.seq || 0) > since).flatMap(m => {
    if (m.to === 'all') return [m];
    if (isSt) return m.from === 'st' || m.to === 'st' ? [m] : [{ ...m, text: null }];
    return m.from === myId || m.to === myId ? [m] : [];
  });

  const block = onTheBlock(room);
  const myRole = me && me.role && room.phase !== 'lobby' ? actingRole(me) : null;
  return {
    code: room.code, isSt, myId, gameId: room.gameId || '',
    serverNow: Date.now(),
    stOnline: room.stOnline,
    scriptId: room.scriptId,
    phase: room.phase,
    night: g.night, day: g.day,
    seats,
    myRole,
    // 管家自己能看到今天的主人
    master: myRole === 'butler' ? g.master?.[myId] || null : null,
    // 自己這局開過槍沒有（以為自己是獵手的人據此收起瞄準鈕）
    slayerUsed: !!myId && (g.shotEver || []).includes(myId),
    prompt,
    // 棄權只有自己和說書人看得到
    nomination: room.nomination && !isSt
      ? { ...room.nomination, abstain: myId && room.nomination.abstain?.[myId] ? { [myId]: true } : {} } : room.nomination,
    required: Math.ceil(alive(room).length / 2),
    lastNight: room.phase === 'day' || room.phase === 'dawn' ? g.lastNight || [] : null,
    history: room.history.filter(h => h.day === g.day),
    block: block.block ? { nomineeId: block.block.nomineeId, count: block.block.count } : null,
    tie: block.tie, topCount: block.count,
    nominators: g.nominators, nominees: g.nominees, dayOver: g.dayOver,
    // 公開的開槍記錄：射空的人座位上標「射 N 號失敗」
    shots: (g.shotLog || []).map(({ from, to, hit }) => ({ from, to, hit })),
    chat,
    // 演出事件：公共的 + 只給自己的（說書人另有魔典上的）
    fx: (room.fx || []).filter(e => e.aud === 'all' || (isSt ? e.aud === 'st' : e.aud === myId)),
    winner: room.winner, winReason: room.winReason,
    // MVP 投票：只告訴已投人數和自己投給誰，結束後才公佈票數
    mvpVote: ended && sameGame(m) ? { opensAt: m.opensAt, closesAt: m.closesAt, done: m.done, n: Object.keys(m.votes).length,
      total: Math.max(mvpVoters(room).length, Object.keys(m.votes).length), mine: m.votes[isSt ? 'st' : me?.pid] || null,
      winners: m.winners, tally: m.done ? m.tally : null } : null,
    // 煙花：上一局贏了、還沒開新局的玩家自己的桌面上放
    fireworks: !!me && sameGame(res) && (ended || room.phase === 'lobby') && res.winners.includes(me.pid) ? res.team : null,
    eggs: room.eggs || [],
    st: isSt ? {
      step: step && step.status !== 'done' ? step : null,
      log: g.log.slice(-120),
      bluffs: g.bluffs,
      queue: g.queue.filter(q => willRun(room, q, true)).map(q => q.roleId),
      passed: room.phase === 'night' ? g.passed || [] : [],
      draft: !!room.draft,
      roleRules: room.settings?.roleRules || {},
      redHerring: g.redHerring, poisoned: g.poisoned,
      // 天亮前確認：所有中毒 / 醉酒 / 今晚受保護的座位
      poisonList: room.phase === 'night' ? room.seats.filter(s => isPoisoned(room, s)).map(s => s.id) : [],
      drunkList: room.phase === 'night' ? room.seats.filter(s => hasEff(room, s, 'drunk')).map(s => s.id) : [],
      protectList: room.phase === 'night' ? room.seats.filter(s => g.protected === s.id || hasEff(room, s, 'protect')).map(s => s.id) : [],
      diedTonight: room.phase === 'night' ? g.diedTonight : [],
      protected: room.phase === 'night' ? g.protected : null,
      ruling: g.ruling || null,
      virginCheck: g.virginCheck || null,
    } : null,
  };
}
