// 按身份裁剪房間狀態：說書人看全部，玩家只看公開信息 + 自己的角色和信息
import { actingRole, alive, alignOf, seatTags, tagWhy, isPoisoned, hasEff, scriptRoles, offline, oneDevice, jugglerDay } from './util.js';
import { ROLES, TEAMS } from '../public/js/roles.js';
import { onTheBlock } from './day.js';
import { nightProgress, markPrompt } from './engine.js';
import { mvpVoters } from './score.js';
import { EGG } from '../public/js/score.js';
import { reminderList } from './manual.js';
import { undoOf } from './ops.js';
import { preForms } from './setup.js';
import { asking, askView } from './asks.js';

// 玩家只該知道公開的死法，其他（惡魔、刺客、造謠……）一律不發
const PUBLIC_DEATH = new Set(['execute', 'slayer', 'virgin']);
const LAST_SAY = { moonchild: '你死了：公開選擇一名存活的玩家，他是善良的話，今晚死亡', klutz: '你死了：公開選擇一名存活的玩家，他是邪惡的話，你的陣營落敗' };

// since：只帶上序號大於它的聊天消息（客戶端增量拼接）；logFrom：說書人流程日誌從第幾條開始
export function viewFor(room, who, since = 0, logFrom = 0) {
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
    const hiddenRise = !isSt && room.phase === 'night' && !!g.risen?.includes(s.id); // 夜裏復活的人同樣等天亮
    const base = { id: s.id, name: s.name, online: s.online, dead: (s.dead && !hiddenDeath) || hiddenRise, deathBy: s.dead && !hiddenDeath && (isSt || ended || PUBLIC_DEATH.has(s.deathBy)) ? s.deathBy || null : null,
      voteUsed: s.voteUsed, mine: s.id === myId, local: !!s.local, ...score(s) };
    if (isSt || ended) return { ...base, role: s.role, fakeRole: s.fakeRole, pinned: isSt && !!s.pinned, align: s.align || null, tags: isSt && s.role ? seatTags(room, s) : [] };
    return base;
  });

  const step = g.step;
  // 月之子、呆瓜：知道自己死了就要選
  const word = !isSt && myId && room.phase === 'day' ? g.lastWords?.find(w => w.seatId === myId && !w.st) : null;
  // 線下局：夜裏說書人當面叫醒、替他點，手機不彈選人牌；死後的公開選擇也由說書人代點
  const off = offline(room);
  // 線下多設備：月之子、呆瓜在自己手機上選，選了是給說書人的請求（lib/asks.js ask: true），提出以後收起選人牌
  const askWord = !!word && asking(room) && !g.asks?.some(a => a.kind === 'word' && a.from === myId);
  const prompt = off && !askWord ? null : word ? { count: 1, alive: true, notSelf: true, prompt: LAST_SAY[word.role], stepId: 'word-' + myId, roleId: word.role, manual: true, ask: off }
    : !isSt && room.phase === 'night' && step && step.status === 'choose' && step.seatId === myId
      ? { ...step.choose, stepId: step.id, roleId: step.roleId }
      // 系統不認識的角色輪到他：能力裏寫著要選人的彈選人牌，別的只告訴他輪到了
      : !isSt && room.phase === 'night' && step?.status === 'mark' && step.seatId === myId ? markPrompt(room, step) : null;

  const chat = room.chat.filter(m => (m.seq || 0) > since).flatMap(m => {
    if (m.to === 'all') return [m];
    if (isSt) return m.from === 'st' || m.to === 'st' ? [m] : [{ ...m, text: null }];
    return m.from === myId || m.to === myId ? [m] : [];
  });

  const block = onTheBlock(room);
  const myRole = me && me.role && room.phase !== 'lobby' ? actingRole(me) : null;
  return {
    code: room.code, inst: room.inst, isSt, myId, gameId: room.gameId || '',
    locked: !!room.pass, pass: isSt ? room.pass || '' : undefined, // 有沒有密碼（密碼只給說書人）
    // 觀眾席：只給名字，pid 是別人的身份，不能發出去
    watchers: (room.watchers || []).map(x => ({ name: x.name, mine: x.pid === who.pid })),
    serverNow: Date.now(),
    stOnline: room.stOnline,
    scriptId: room.scriptId,
    offline: off, oneDevice: oneDevice(room),
    // 線上 / 線下：剛建好的房間還沒選時是空的（說書人先選）
    venue: room.settings?.chosen || room.seats.length || room.phase !== 'lobby' ? (off ? 'offline' : 'online') : null,
    phase: room.phase,
    night: g.night, day: g.day,
    seats,
    myRole,
    // 哲學家變成新角色後，面板上寫原來是誰
    myWas: (myRole && me.was) || null,
    // 陣營和角色牌對不上（莽夫、換過角色的人）：面板上寫出來
    myAlign: myRole && (alignOf(me) === 'evil') === !!TEAMS[ROLES[me.role]?.team]?.good ? alignOf(me) : null,
    // 雜耍藝人還能猜幾次（第一個白天）
    // 線下多設備：猜測先是給說書人的請求，還在排隊的也算用掉（受理前可以撤回）
    juggleLeft: myRole === 'juggler' && !me.dead && room.phase === 'day' && g.day === jugglerDay(room, me) && (!off || asking(room))
      ? 5 - (g.juggle?.[myId]?.length || 0) - (g.asks?.find(a => a.kind === 'juggle' && a.from === myId)?.guesses.length || 0) : 0,
    // 線下多設備：自己在手機上提出、還沒處理的請求，和剛處理完的結果（受理 / 駁回 / 作廢）
    asks: me && asking(room) && room.phase !== 'lobby' ? askView(room, myId) : null,
    // 管家自己能看到今天的主人
    master: myRole === 'butler' ? g.master?.[myId] || null : null,
    // 惡魔（含以為自己是惡魔的瘋子）得知的三個不在場角色：左下角單獨一張偽裝卡。換成別的陣營後收起
    bluffs: ROLES[myRole]?.team === 'demon' ? g.bluffsOf?.[myId] || null : null,
    // 自己這局開過槍沒有（以為自己是獵手的人據此收起瞄準鈕）
    slayerUsed: !!myId && (g.shotEver || []).includes(myId),
    prompt,
    // 夜晚進度條（玩家只有角色順序，看不到走到哪；說書人還有當前位置、持有者和哪些是假裝叫醒）
    prog: room.phase === 'night' ? nightProgress(room, isSt) : null,
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
    // 公開的死後選人（月之子、呆瓜）：選的人座位上標「選 N 號」
    words: (g.wordLog || []).map(({ from, to, role }) => ({ from, to, role })),
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
      noPretend: !!g.noPretend,
      log: g.log.slice(logFrom), logFrom,
      lastWord: room.phase === 'day' ? g.lastWords?.[0] || null : null,
      bluffs: g.bluffs, bluffPins: room.bluffPins || [],
      bluffsOf: g.bluffsOf || {}, // 首夜給每個惡魔看過的偽裝（瘋子的是假的一份）：座位菜單再給他看一次用
      draft: !!room.draft,
      undo: undoOf(room), // 線下局：能撤銷的上一步是什麼操作
      // 手動局：發出去的選人牌、夜晚順序參考、提醒標記
      // 說書人自己貼的標記，和能貼的標記（劇本上在場角色的提醒詞）
      marks: g.marks, reminders: room.phase === 'lobby' ? [] : reminderList(room),
      banned: (room.banned || []).length,
      roleRules: room.settings?.roleRules || {},
      redHerring: g.redHerring, poisoned: g.poisoned,
      // 開局前預選的首夜信息：能預選的座位和選項、已經選了什麼（setup.js preForms）
      preForms: preForms(room), pre: g.pre || {}, // 自製角色的那份首夜標記卡上要用
      // 座位標記的來源和期限（點標記看的解釋卡）：只帶有來源的座位
      why: Object.fromEntries(room.seats.filter(x => x.role).map(x => [x.id, tagWhy(room, x)]).filter(([, w]) => Object.keys(w).length)),
      // 天亮前確認：所有中毒 / 醉酒 / 今晚受保護的座位
      poisonList: room.phase === 'night' ? room.seats.filter(s => isPoisoned(room, s)).map(s => s.id) : [],
      drunkList: room.phase === 'night' ? room.seats.filter(s => hasEff(room, s, 'drunk')).map(s => s.id) : [],
      protectList: room.phase === 'night' ? room.seats.filter(s => g.protected === s.id || hasEff(room, s, 'protect')).map(s => s.id) : [],
      diedTonight: room.phase === 'night' ? g.diedTonight : [],
      protected: room.phase === 'night' ? g.protected : null,
      ruling: g.ruling || null,
      notice: g.notice?.[0] || null,
      virginCheck: g.virginCheck || null,
      // 線下多設備：玩家在手機上提出的請求（排隊順序）和剛處理完的（說書人開著的卡據此收起、說原因）
      asks: asking(room) && room.phase !== 'lobby' ? askView(room, null) : null,
    } : null,
  };
}
