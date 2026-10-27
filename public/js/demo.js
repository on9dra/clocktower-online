// 演示頁：用真實的界面模塊（桌面、側欄、私聊浮窗、操作塢、演出）渲染一份模擬對局，頂欄按步驟觸發場景。
// 不連服務器：world 是整局的真實數據，按當前視角（玩家 / 說書人 / 代入某個玩家）裁剪成和服務端一樣的狀態。
// 新功能加演示：往 SCENES 裏加一項，打開 /demo.html?s=場景名
import { h, toast, morph, ask, roleToken } from './ui.js';
import { renderTown } from './town.js';
import { renderSide, sideCollapsed, renderChatWins } from './side.js';
import { stFlow, playerFlow } from './flow.js';
import { onState, ensureScene, setRender, heldView } from './fx.js';
import { renderHud, onInfo } from './hud.js';
import { topbar } from './topbar.js';
import { ROLES, TEAMS } from './roles.js';
import { onEggs } from './egg.js';
import { openBoard } from './scores.js';
import { openSettings } from './settings.js';
import { EGG, MVP_DELAY, MVP_WINDOW } from './score.js';
import { tr } from './lang.js';

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隱私模式 */ } },
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROSTER = [['小明', 'washerwoman'], ['阿強', 'chef'], ['小紅', 'imp'], ['老王', 'empath'], ['Lily', 'poisoner'], ['大偉', 'monk'], ['阿杰', 'saint']];
const ME = 's1';

let world, who, done;
function fresh() {
  // 消息和演出的序號重置後接著往上數：頁面記著播過 / 讀過的最大序號，歸零的話新事件會被當成舊的
  world = {
    phase: 'day', day: 1, night: 1, seq: world?.seq || 0, fxSeq: world?.fxSeq || 0, fx: [], eggSeq: world?.eggSeq || 0, eggs: [],
    seats: ROSTER.map(([name, role], i) => ({ id: 's' + (i + 1), name, role, dead: false, voteUsed: false })),
    // 積分（演示裏座位 id 就當玩家標識）、上一局的勝負、MVP 投票、開過幾局
    players: Object.fromEntries(ROSTER.map((_, i) => ['s' + (i + 1), { eggs: EGG.start, wins: 0, mvp: 0 }])), result: null, mvp: null, games: 1,
    chat: [], nomination: null, nominators: [], nominees: [], history: [], dayOver: false,
    diedTonight: [], lastNight: [], prompt: null, winner: null, winReason: '', shotEver: [], ruling: null, virginCheck: null, step: null, slayerUsed: false, shots: [], poisoned: null,
  };
  who = { me: ME };
  done = new Set();
  for (const k of ['guess', 'note']) LS.set(`botc.${k}.DEMO.demo`, '{}');
  sys('遊戲開始，共 7 名玩家。請查看你的角色。', { k: 'start', n: 7 });
  sys('第 1 夜降臨，所有人閉眼。', { k: 'night', n: 1 });
  say('st', ME, '2號阿強 和 6號大偉 之中有一位是【廚師】', { info: true, night: 1,
    marks: [{ seatId: 's2', r: 'chef', q: true }, { seatId: 's6', r: 'chef', q: true }],
    f: [{ s: 's2' }, { w: '和' }, { s: 's6' }, { w: '之中有' }, { r: 'chef', named: true }] });
  sys('天亮了。昨晚是平安夜。', { k: 'dawn', deaths: [] });
  sys('第 1 天。自由討論後，存活玩家可以點擊他人座位發起提名。', { k: 'day', n: 1 });
}
const label = id => { const i = world.seats.findIndex(x => x.id === id); return `${i + 1}號${world.seats[i].name}`; };
function say(from, to, text, extra = {}) {
  world.chat.push({ id: 'm' + ++world.seq, seq: world.seq, at: Date.now(), from, fromName: from === 'st' ? '說書人' : from === 'sys' ? '' : label(from), to, text, ...extra });
}
const sys = (text, e) => say('sys', 'all', text, e ? { e } : {});
const fx = (ev, aud = 'all') => world.fx.push({ ...ev, seq: ++world.fxSeq, at: Date.now(), aud });
const seatOf = id => world.seats.find(x => x.id === id);
const setRoles = roles => world.seats.forEach((x, i) => { x.role = roles[i]; });

// 按視角裁剪（和 lib/view.js 一致）：說書人看全部角色、玩家之間的私聊只看到「誰私聊了誰」、夜裏的死亡天亮才公佈、演出按觀眾分發
function viewOf() {
  const isSt = !!who.st, myId = isSt ? null : who.me || who.peek;
  const alive = world.seats.filter(x => !x.dead).length;
  const me = world.seats.find(x => x.id === myId);
  const shown = x => x.dead && !(!isSt && world.phase === 'night' && world.diedTonight.includes(x.id));
  const res = world.result, m = world.mvp, sameGame = res && res.game === world.games;
  const score = x => { const p = world.players[x.id]; return { crown: res?.winners.includes(x.id) ? res.team : null,
    mvp: !!(sameGame && m?.done && m.winners.includes(x.id)), wins: p.wins, mvps: p.mvp, eggs: p.eggs }; };
  return {
    code: 'DEMO', gameId: 'demo', isSt, myId, serverNow: Date.now(), stOnline: true, scriptId: 'tb',
    phase: world.phase, night: world.night, day: world.day,
    seats: world.seats.map(x => ({ id: x.id, name: x.name, online: true, dead: shown(x), deathBy: shown(x) ? x.deathBy || null : null, voteUsed: x.voteUsed, mine: x.id === myId, bot: false, ...score(x),
      ...(isSt || world.phase === 'ended' ? { role: x.role, fakeRole: x.fakeRole || null, tags: [] } : {}) })),
    myRole: me ? (me.role === 'drunk' ? me.fakeRole : me.role) : null, master: null, slayerUsed: world.shotEver.includes(myId),
    prompt: !isSt && world.prompt && world.prompt.seatId === myId ? world.prompt : null,
    nomination: world.nomination && !isSt ? { ...world.nomination, abstain: world.nomination.abstain[myId] ? { [myId]: true } : {} } : world.nomination,
    required: Math.ceil(alive / 2),
    lastNight: world.lastNight, history: world.history, ...blockOf(),
    nominators: world.nominators, nominees: world.nominees, dayOver: world.dayOver, shots: world.shots,
    chat: world.chat.flatMap(m => (m.to === 'all' ? [m] : isSt ? (m.from === 'st' || m.to === 'st' ? [m] : [{ ...m, text: null }])
      : m.from === myId || m.to === myId ? [m] : [])),
    fx: world.fx.filter(e => e.aud === 'all' || (isSt ? e.aud === 'st' : e.aud === myId)), winner: world.winner, winReason: world.winReason,
    mvpVote: world.phase === 'ended' && m ? { opensAt: m.opensAt, closesAt: m.closesAt, done: m.done, n: Object.keys(m.votes).length, total: 8,
      mine: m.votes[isSt ? 'st' : myId] || null, winners: m.winners, tally: m.done ? m.tally : null } : null,
    fireworks: myId && sameGame && (world.phase === 'ended' || world.phase === 'lobby') && res.winners.includes(myId) ? res.team : null,
    eggs: world.eggs,
    st: isSt ? { step: world.step, log: [], bluffs: ['mayor', 'virgin', 'slayer'], queue: [], passed: [], draft: false, roleRules: {},
      redHerring: null, poisoned: null, diedTonight: [], protected: null, ruling: world.ruling, virginCheck: world.virginCheck } : null,
    peek: who.peek ? { seatId: who.peek, label: label(who.peek) } : undefined,
  };
}

const ok = () => Promise.resolve({ ok: true });
const ctx = {
  state: null, ls: LS, offset: 0, now: () => Date.now(), leave() {},
  render: () => render(),
  act(act, args = {}) {
    if (ctx.state.peek) { toast('代入視角中只能查看'); return Promise.resolve({ ok: false }); }
    const myId = ctx.state.myId;
    if (act === 'chat') say(myId, args.to, args.text);
    else if (act === 'vote') setVote(myId, args.v !== undefined ? args.v : args.up ? 'yes' : null);
    else if (act === 'pick') pick(myId, args.ids);
    else if (act === 'egg') throwEgg(myId, args.targetId);
    else if (act === 'mvp') voteMvp(myId, args.targetId);
    else if (act === 'slay') {
      // 演示：玩家開槍後切到說書人視角去裁定，裁定完再切回開槍的人，看他眼裏的結果
      slay(myId, args.targetId);
      world.returnTo = { ...who };
      setTimeout(() => view({ st: true }), 900);
    }
    else toast('演示裏沒有這個操作');
    refresh(); return ok();
  },
  st(op, args = {}) {
    if (op === 'chat') say('st', args.to, args.text);
    else if (op === 'startCount') startCount();
    else if (op === 'closeVote') closeVote();
    else if (op === 'rule') {
      if (world.returnTo) { const w = world.returnTo; world.returnTo = null; view(w); }
      resolveRuling(args.work);
    }
    else if (op === 'virgin') resolveVirgin(args.work);
    else if (op === 'decide') { const st = world.step; world.step = null; grim(st.roleId, st.seatId, st.picks[0], args.choice === 'work' ? 'protect' : 'fail'); }
    else if (op === 'mvp') voteMvp('st', args.seatId);
    else if (op === 'next' && world.phase === 'ended') lobby();
    else if (op === 'next' && world.phase === 'lobby') startGame();
    else if (op === 'pauseTimer') pauseTimer();
    else if (op === 'resetTimer') resetTimer();
    else toast('演示裏沒有這個操作');
    refresh(); return ok();
  },
  peek(id) { who = id ? { peek: id } : { st: true }; refresh(); return ok(); },
};

// ———— 投票（規則和 lib/day.js 一致）————
const VOTE_WINDOW = 5 * 60 * 1000, CALL_MS = 3200;
function setVote(id, v) {
  const n = world.nomination;
  if (!n) return;
  n.votes[id] = v === 'yes';
  if (v === 'abstain') n.abstain[id] = true; else delete n.abstain[id];
}
function pauseTimer() {
  const n = world.nomination;
  if (!n || n.clock) return;
  if (n.paused == null) n.paused = Math.max(0, n.deadline - Date.now());
  else { n.deadline = Date.now() + n.paused; n.paused = null; }
}
function resetTimer() {
  const n = world.nomination;
  if (!n || n.clock) return;
  if (n.paused != null) n.paused = VOTE_WINDOW; else n.deadline = Date.now() + VOTE_WINDOW;
}
// 處決台：今天票數最高、達到門檻的人；最高票平票則無人
function blockOf() {
  let top = null, tie = false;
  for (const v of world.history) {
    if (v.count < v.required) continue;
    if (!top || v.count > top.count) { top = v; tie = false; } else if (v.count === top.count) tie = true;
  }
  return { block: top && !tie ? { nomineeId: top.nomineeId, count: top.count } : null, tie, topCount: top ? top.count : 0 };
}
function endDay() {
  if (world.nomination) closeVote();
  const b = blockOf().block;
  world.dayOver = true;
  if (!b) { sys('今天沒有人被處決。', { k: 'noexec' }); fx({ k: 'noexec' }); return; }
  execute(b.nomineeId);
}
function execute(id) {
  const seat = seatOf(id);
  seat.dead = true; seat.deathBy = 'execute';
  world.dayOver = true;
  fx({ k: 'execute', seat: seat.id });
  sys(`${label(seat.id)} 被處決了`, { k: 'execute', seat: seat.id });
}
function nominate(from, to) {
  world.nomination = { nominatorId: from, nomineeId: to, votes: {}, abstain: {}, at: Date.now(), clock: null, deadline: Date.now() + VOTE_WINDOW, paused: null };
  world.nominators.push(from); world.nominees.push(to);
  fx({ k: 'nominate', from, to });
  sys(`${label(from)} 提名了 ${label(to)}。`, { k: 'nom', from, to });
}
// 計票 / 結算前先處理必定反噬的貞潔者（和 lib/day.js virginFirst 一致）
const virginFirst = () => { if (!world.virginCheck?.forced) return false; resolveVirgin(true); return true; };
function startCount() {
  if (world.virginCheck && !world.virginCheck.forced) return toast('請先裁定貞潔者是否反噬');
  if (virginFirst()) return;
  const n = world.nomination, s = world.seats, i = s.findIndex(x => x.id === n.nomineeId);
  n.clock = { order: s.map((_, k) => s[(i + 1 + k) % s.length]).filter(x => !x.dead || !x.voteUsed).map(x => x.id), at: Date.now() + CALL_MS, step: 1200 };
  fx({ k: 'callvote', to: n.nomineeId });
  sys('說書人提出立即計票。', { k: 'count' });
}
function closeVote() {
  const n = world.nomination;
  if (!n || virginFirst()) return;
  const count = Object.values(n.votes).filter(Boolean).length, need = Math.ceil(world.seats.filter(x => !x.dead).length / 2);
  world.history.push({ nomineeId: n.nomineeId, count, required: need });
  world.nomination = null;
  const b = blockOf(), voters = Object.keys(n.votes).filter(id => n.votes[id]);
  const res = b.block?.nomineeId === n.nomineeId ? 'block' : b.tie && count === b.topCount ? 'tie' : 'fail';
  fx({ k: 'votes', to: n.nomineeId, count, need, voters, res });
  sys(`${label(n.nomineeId)} 得到 ${count} 票（至少需要 ${need} 票）。`, { k: 'votes', to: n.nomineeId, n: count, need, res, voters });
}
// 計票時鐘走完 / 投票倒數到點（暫停時不算）自動結算
setInterval(() => {
  if (world?.virginCheck?.due && Date.now() > world.virginCheck.due) { resolveVirgin(true); refresh(); return; }
  if (world?.phase === 'ended' && world.mvp && !world.mvp.done) { if (Date.now() > world.mvp.closesAt) { closeMvp(); refresh(); } else render(); return; }
  const n = world?.nomination;
  if (!n) return;
  const due = Math.min(n.clock ? n.clock.at + n.clock.order.length * n.clock.step + 400 : Infinity, n.paused == null ? n.deadline : Infinity);
  if (Date.now() > due) { closeVote(); refresh(); } else render();
}, 200);

// ———— 夜晚、勝負 ————
// 玩家選完人：自己的行動演出 + 面板裏記一條
function pick(id, ids) {
  world.prompt = null;
  const role = seatOf(id).role;
  fx({ k: 'act', src: role, to: ids }, id);
  say('st', id, '你選擇了 ' + ids.map(label).join('、'), { info: true, night: world.night, k: 'act', src: role, f: [{ op: 'to' }, ...ids.map(x => ({ s: x }))] });
}
// 開槍（規則和 lib/day.js 一致）：真獵手打中惡魔才死人；射空只有一支箭
function slay(from, to) {
  world.shotEver.push(from);
  sys(`${label(from)} 宣稱自己是獵手，向 ${label(to)} 開槍……`, { k: 'slay', from, to });
  // 每一槍都停下等說書人裁定（真假獵手、中不中都一樣停），推薦結果：健康的真獵手打中惡魔。
  // 結果只有一種時說書人只能確認；真獵手中毒時二選一（演示裏沒有隱士）
  const real = seatOf(from).role === 'slayer' && !world.slayerUsed, demon = seatOf(to).role === 'imp', bad = world.poisoned === from;
  if (seatOf(from).role === 'slayer') world.slayerUsed = true;
  world.ruling = { kind: 'slayer', seatId: from, role: seatOf(from).role, why: bad ? '中毒' : null, to, real, demon,
    auto: real && demon && !bad, forced: !real || !demon || !bad, reg: null };
}
// 說書人裁定（和 lib/day.js resolveRuling 一致）
function resolveRuling(work) {
  const r = world.ruling;
  world.ruling = null;
  if (r.kind === 'slayer') {
    world.shots.push({ from: r.seatId, to: r.to, hit: work });
    if (work) Object.assign(seatOf(r.to), { dead: true, deathBy: 'slayer' });
    fx({ k: 'slay', from: r.seatId, to: r.to, hit: work });
    sys(work ? `${label(r.to)} 倒下了！` : '什麼也沒有發生。', work ? { k: 'slayhit', seat: r.to } : { k: 'slaymiss' });
  } else if (r.kind === 'mayor') {
    if (work) win('good', '僅剩三人且無人被處決，鎮長獲勝');
    else { Object.assign(world, { phase: 'night', night: world.night + 1 }); fx({ k: 'night', n: world.night }); }
  }
}
// 貞潔者小窗（和 lib/day.js resolveVirgin 一致）：反噬時中止投票、處決提名者；無事則投票繼續
function resolveVirgin(work) {
  const r = world.virginCheck;
  world.virginCheck = null;
  if (!work) return;
  world.nomination = null;
  fx({ k: 'virgin', seat: r.seatId, from: r.from });
  sys(`${label(r.seatId)} 是貞潔者！提名者立即被處決。`, { k: 'virgin', seat: r.seatId, from: r.from });
  Object.assign(seatOf(r.from), { dead: true, deathBy: 'virgin' }); world.dayOver = true; // 反噬不走處決演出
}
// 說書人魔典上的夜晚結算
const grim = (src, seat, to, res, extra = {}) => fx({ k: 'grim', src, seat, to: [to], res, ...extra }, 'st');
function nightKill(id) { Object.assign(seatOf(id), { dead: true, deathBy: null }); world.diedTonight.push(id); }
function dawn() {
  world.phase = 'day'; world.day++;
  world.lastNight = world.diedTonight; world.diedTonight = [];
  fx({ k: 'dawn', day: world.day, deaths: world.lastNight });
  sys(world.lastNight.length ? `天亮了。昨晚 ${world.lastNight.map(label).join('、')} 死亡。` : '天亮了。昨晚是平安夜。', { k: 'dawn', deaths: world.lastNight });
  sys(`第 ${world.day} 天。`, { k: 'day', n: world.day });
}
function win(team, reason) {
  Object.assign(world, { phase: 'ended', winner: team, winReason: reason });
  sys(`遊戲結束：${team === 'good' ? '善良' : '邪惡'}陣營獲勝（${reason}）`, { k: 'win', team, reason });
  settle(team);
  fx({ k: 'win', team });
}
// ———— 積分（規則和 lib/score.js 一致）————
function settle(team) {
  const winners = [];
  for (const x of world.seats) {
    const p = world.players[x.id];
    if (TEAMS[ROLES[x.role].team].good === (team === 'good')) { p.wins++; p.eggs += EGG.win; winners.push(x.id); } else p.eggs += EGG.lose;
  }
  world.result = { team, winners, game: world.games };
  world.mvp = { opensAt: Date.now() + MVP_DELAY, closesAt: Date.now() + MVP_DELAY + MVP_WINDOW, votes: {}, done: false, winners: [], tally: {} };
}
function voteMvp(voter, id) {
  const m = world.mvp;
  if (!m || m.done) return;
  if (id) m.votes[voter] = id; else delete m.votes[voter];
}
function closeMvp() {
  const m = world.mvp;
  if (!m || m.done) return;
  m.done = true;
  for (const id of Object.values(m.votes)) m.tally[id] = (m.tally[id] || 0) + 1;
  const top = Math.max(0, ...Object.values(m.tally));
  m.winners = top ? world.seats.map(x => x.id).filter(id => m.tally[id] === top) : [];
  for (const id of m.winners) { world.players[id].mvp++; world.players[id].eggs += EGG.mvp; }
  if (!m.winners.length) return sys('本局沒有人得到 MVP 票。', { k: 'mvp', seats: [], n: 0 });
  sys(`本局 MVP：${m.winners.map(label).join('、')}（${top} 票）`, { k: 'mvp', seats: m.winners, n: top });
  fx({ k: 'mvp', seats: m.winners, n: top });
}
function throwEgg(from, to) {
  const p = world.players[from];
  if (!p || from === to) return;
  if (p.eggs <= 0) return toast('雞蛋用完了');
  p.eggs--;
  world.eggs.push({ seq: ++world.eggSeq, from, to, at: Date.now() });
}
// 回到準備（MVP 沒投完按已投的結算）/ 開新局（先拉幕，再翻角色牌、入夜）
function lobby() {
  closeMvp();
  Object.assign(world, { phase: 'lobby', winner: null, winReason: '', nomination: null, history: [], dayOver: false, day: 0, night: 0, lastNight: [] });
  world.seats.forEach(x => Object.assign(x, { role: null, fakeRole: null, dead: false, deathBy: null, voteUsed: false }));
  sys('回到準備階段，可以開始新的一局。', { k: 'lobby' });
}
function startGame() {
  world.games++;
  setRoles(['washerwoman', 'chef', 'imp', 'empath', 'poisoner', 'monk', 'saint']);
  world.seats.forEach(x => Object.assign(x, { dead: false, deathBy: null, voteUsed: false }));
  Object.assign(world, { phase: 'night', night: 1, day: 0, winner: null, winReason: '', nomination: null, history: [], dayOver: false, diedTonight: [], lastNight: [],
    chat: world.chat.filter(m => !m.info) });
  fx({ k: 'curtain', n: world.games });
  fx({ k: 'role', role: seatOf(ME).role }, ME);
  sys('遊戲開始，共 7 名玩家。請查看你的角色。', { k: 'start', n: 7 });
  toNight(1);
}
function toNight(n = world.night + 1) {
  Object.assign(world, { phase: 'night', night: n });
  fx({ k: 'night', n });
  sys(`第 ${n} 夜降臨，所有人閉眼。`, { k: 'night', n });
}
// 切換視角：先刷新一次，切換前的演出不重播
function view(w) {
  if (JSON.stringify(w) === JSON.stringify(who)) return;
  who = w; refresh();
}
const resetDay = () => Object.assign(world, { nomination: null, history: [], dayOver: false });

// ———— 場景：每步一個按鈕，按順序點 ————
const SCENES = {
  log: {
    title: '日誌',
    steps: [
      ['公告', () => say('st', 'all', '大家先別急著提名，每人輪流說一句')],
      ['提名·得票', async () => {
        nominate('s2', 's4'); refresh(); await wait(2600);
        for (const id of ['s3', 's5', 's2', 's1']) { setVote(id, 'yes'); refresh(); await wait(250); }
        await wait(400); closeVote();
      }],
      ['票不夠', async () => { nominate('s6', 's7'); refresh(); await wait(2600); setVote('s3', 'yes'); closeVote(); }],
      ['處決', () => endDay()],
      ['入夜', () => { Object.assign(world, { phase: 'night', night: world.night + 1 }); fx({ k: 'night', n: world.night }); sys(`第 ${world.night} 夜降臨，所有人閉眼。`, { k: 'night', n: world.night }); }],
      ['天亮死人', () => { nightKill('s5'); dawn(); resetDay(); }],
      ['開槍', () => { sys(`${label('s6')} 宣稱自己是獵手，向 ${label('s3')} 開槍……`, { k: 'slay', from: 's6', to: 's3' }); sys('什麼也沒有發生。', { k: 'slaymiss' }); }],
      ['說書人私聊', () => say('st', ME, '你今晚想好選誰了嗎')],
      ['善良勝', () => win('good', '惡魔被處決')],
    ],
  },
  chat: {
    title: '私聊',
    steps: [
      ['2號私聊', () => say('s2', ME, '今晚我們對一下信息？')],
      ['說書人私聊', () => say('st', ME, '記得明天公佈你的信息')],
      ['標註2號', () => {
        LS.set('botc.guess.DEMO.demo', JSON.stringify({ s2: 'chef' }));
        LS.set('botc.note.DEMO.demo', JSON.stringify({ s2: ['自稱廚師'] }));
      }],
      ['再來4人私聊', async () => {
        for (const [id, t] of [['s3', '你是誰？'], ['s4', '我是共情者'], ['s5', '投他嗎？'], ['s6', '今晚保護誰']]) { say(id, ME, t); refresh(); await wait(500); }
      }],
      ['說書人收私聊', async () => {
        who = { st: true }; refresh(); await wait(400);
        say('s2', 'st', '我想問一下規則'); refresh(); await wait(500);
        say('s4', 'st', '我能私聊你嗎');
      }],
      ['代入1號', async () => { who = { st: true }; say('st', ME, '代入前剛發的'); refresh(); await wait(500); who = { peek: ME }; }],
    ],
  },
  vote: {
    title: '提名與投票',
    steps: [
      ['2號提名4號', () => nominate('s2', 's4')],
      ['大家表態', async () => {
        view({ me: ME });
        for (const [id, v] of [['s3', 'yes'], ['s6', 'abstain'], ['s5', 'yes'], ['s7', 'abstain'], ['s2', 'yes']]) { setVote(id, v); refresh(); await wait(450); }
      }],
      ['我棄權', () => { view({ me: ME }); setVote(ME, 'abstain'); }],
      ['說書人看', () => view({ st: true })],
      ['暫停', () => { view({ st: true }); pauseTimer(); }],
      ['剩 20 秒', () => { const n = world.nomination; if (n) { n.paused = null; n.deadline = Date.now() + 20000; } }],
      ['立即計票', async () => { view({ me: ME }); refresh(); await wait(50); startCount(); }],
      ['3號提名5號（更高票）', async () => {
        nominate('s3', 's5'); refresh(); await wait(2600);
        for (const [id, v] of [['s1', 'yes'], ['s2', 'yes'], ['s3', 'yes'], ['s4', 'yes'], ['s6', 'yes'], ['s7', 'yes'], ['s5', 'abstain']]) { setVote(id, v); refresh(); await wait(300); }
        await wait(600); closeVote();
      }],
      ['6號提名7號（票不夠）', async () => {
        nominate('s6', 's7'); refresh(); await wait(2600);
        for (const [id, v] of [['s3', 'yes'], ['s4', 'abstain'], ['s1', 'abstain']]) { setVote(id, v); refresh(); await wait(350); }
        await wait(500); closeVote();
      }],
      ['結束白天', () => endDay()],
    ],
  },
  night: {
    title: '夜晚',
    init() {
      setRoles(['poisoner', 'chef', 'imp', 'empath', 'fortuneteller', 'monk', 'saint']);
      Object.assign(world, { phase: 'night', day: 0, night: 1, chat: world.chat.filter(m => !m.info) });
    },
    steps: [
      ['開局', () => { fx({ k: 'role', role: 'poisoner' }, ME); fx({ k: 'night', n: 1 }); }],
      ['輪到你', () => { world.prompt = { seatId: ME, stepId: 'p' + Date.now(), count: 1, notSelf: false }; }],
      ['選人', () => pick(ME, ['s4'])],
      ['毒·護', async () => {
        view({ st: true });
        grim('poisoner', 's1', 's4', 'poison'); refresh(); await wait(1600);
        grim('monk', 's6', 's2', 'protect');
      }],
      ['擋刀', () => { view({ st: true }); grim('imp', 's3', 's2', 'blocked', { why: 'protect' }); }],
      ['殺人', () => { view({ st: true }); nightKill('s4'); grim('imp', 's3', 's4', 'kill'); }],
      ['失效', () => { view({ st: true }); grim('monk', 's6', 's7', 'fail'); }],
      // 以為自己是僧侶的酒鬼：說書人卡片上只有「無效」
      ['酒鬼僧侶', () => {
        view({ st: true }); Object.assign(seatOf('s6'), { role: 'drunk', fakeRole: 'monk' });
        world.step = { id: 'dm' + Date.now(), roleId: 'monk', seatId: 's6', status: 'decide', title: '僧侶', picks: ['s2'],
          decide: { kind: 'ability', role: 'monk', targetId: 's6', why: '酒鬼', options: [{ id: 'fail', label: '無效' }] } };
      }],
      ['傳刀', async () => {
        view({ st: true }); nightKill('s3'); grim('imp', 's3', 's3', 'starpass'); refresh(); await wait(1800);
        view({ me: ME }); seatOf(ME).role = 'imp';
        fx({ k: 'demon', role: 'imp' }, ME);
        say('st', ME, '惡魔死亡，你現在是【小惡魔】。', { info: true, night: world.night, k: 'role', src: 'imp', f: [{ op: 'become' }, { r: 'imp' }] });
      }],
      ['天亮', () => { view({ me: ME }); dawn(); }],
      ['平安夜', () => {
        view({ me: ME });
        world.diedTonight.forEach(id => { seatOf(id).dead = false; });
        world.diedTonight = [];
        dawn();
      }],
    ],
  },
  day: {
    title: '白天',
    init() { setRoles(['washerwoman', 'chef', 'imp', 'slayer', 'poisoner', 'virgin', 'saint']); },
    steps: [
      ['我是獵手', () => { resetDay(); Object.assign(world, { shotEver: [], slayerUsed: false, ruling: null, poisoned: null }); view({ me: ME }); setRoles(['slayer', 'chef', 'imp', 'empath', 'poisoner', 'virgin', 'saint']); }],
      // 自己是中毒的真獵手（自己不知道中毒）：射 3 號惡魔時說書人有兩個選項
      ['我是中毒獵手', () => { resetDay(); Object.assign(world, { shotEver: [], slayerUsed: false, ruling: null, poisoned: ME }); view({ me: ME }); setRoles(['slayer', 'chef', 'imp', 'empath', 'poisoner', 'virgin', 'saint']); }],
      // 貞潔者被提名：投票照常開始；健康貞潔者遇上真鎮民 30 秒後（或喊計票前）自動反噬，說書人小窗裏可以提前
      ['貞潔者', () => {
        resetDay(); Object.assign(seatOf('s6'), { role: 'virgin', fakeRole: null }); Object.assign(world, { ruling: null, poisoned: null }); view({ st: true }); nominate('s2', 's6');
        world.virginCheck = { kind: 'virgin', seatId: 's6', role: 'virgin', real: true, why: null, from: 's2', auto: true, forced: true, reg: null, due: Date.now() + 30000 };
      }],
      // 中毒的貞潔者：說書人二選一，裁定前不能計票
      ['中毒貞潔者', () => {
        resetDay(); Object.assign(seatOf('s6'), { role: 'virgin', fakeRole: null }); Object.assign(world, { ruling: null, poisoned: 's6' }); view({ st: true }); nominate('s2', 's6');
        world.virginCheck = { kind: 'virgin', seatId: 's6', role: 'virgin', real: true, why: '中毒', from: 's2', auto: false, forced: false, reg: null, due: null };
      }],
      ['酒鬼鎮長', () => {
        resetDay(); Object.assign(world, { virginCheck: null, poisoned: null });
        setRoles(['washerwoman', 'chef', 'imp', 'slayer', 'poisoner', 'drunk', 'saint']); seatOf('s6').fakeRole = 'mayor';
        for (const id of ['s1', 's2', 's4', 's7']) Object.assign(seatOf(id), { dead: true, deathBy: 'execute' });
        view({ st: true });
        world.ruling = { kind: 'mayor', seatId: 's6', role: 'mayor', why: '酒鬼', auto: false, forced: true, reg: null };
      }],
      // 只有一個結果：健康的真獵手射平民 / 射惡魔、假獵手開槍；二選一：真獵手中毒
      ['獵手·空', () => { Object.assign(world, { ruling: null, slayerUsed: false, poisoned: null }); view({ st: true }); slay('s4', 's5'); }],
      ['獵手·中', () => { Object.assign(world, { ruling: null, slayerUsed: false, poisoned: null }); view({ st: true }); slay('s4', 's3'); }],
      ['獵手中毒', () => { Object.assign(world, { ruling: null, slayerUsed: false, poisoned: 's4' }); view({ st: true }); slay('s4', 's3'); }],
      ['假獵手', () => { Object.assign(world, { ruling: null, poisoned: null }); view({ st: true }); slay('s5', 's3'); }],
      ['計票時鐘', async () => {
        resetDay(); nominate('s5', 's7'); refresh(); await wait(2600);
        for (const [id, v] of [['s1', 'yes'], ['s2', 'abstain'], ['s3', 'yes'], ['s4', 'yes'], ['s6', 'abstain'], ['s5', 'yes'], ['s7', 'abstain']]) { setVote(id, v); refresh(); await wait(250); }
        await wait(500); startCount();
      }],
      ['無人處決', () => { resetDay(); endDay(); }],
    ],
  },
  // 開局拉幕；入夜、天亮時背景演日落 / 日出
  start: {
    title: '開局·日夜',
    init() { lobby(); world.chat = world.chat.filter(m => m.e?.k === 'lobby'); },
    steps: [
      ['拉幕開局', () => { view({ me: ME }); startGame(); }],
      ['天亮', () => { view({ me: ME }); dawn(); }],
      ['入夜', () => { view({ me: ME }); toNight(); }],
      ['天亮死人', () => { view({ me: ME }); nightKill('s5'); dawn(); resetDay(); }],
      ['說書人開局', () => { lobby(); view({ st: true }); startGame(); }],
    ],
  },
  // 終局結算（勝利積分、雞蛋）→ 贏家戴皇冠、自己桌上放煙花 → 30 秒 MVP 投票 → MVP 揭曉 → 回準備（煙花、皇冠還在）→ 開新局（煙花停，皇冠留到下一次分出勝負）
  end: {
    title: '終局',
    steps: [
      ['善良勝', () => { view({ me: ME }); win('good', '惡魔被處決'); }],
      ['別人投 MVP', async () => {
        for (const [v, id] of [['s2', ME], ['s3', 's3'], ['st', ME], ['s4', ME], ['s6', 's2']]) { voteMvp(v, id); refresh(); await wait(450); }
      }],
      ['MVP 揭曉', () => closeMvp()],
      ['回準備', () => lobby()],
      ['開新局', () => { view({ me: ME }); startGame(); }],
      ['邪惡勝', () => { view({ me: ME }); setRoles(ROSTER.map(r => r[1])); win('evil', '只剩兩名玩家存活'); }],
      ['說書人看', () => { view({ st: true }); setRoles(ROSTER.map(r => r[1])); win('evil', '只剩兩名玩家存活'); }],
    ],
  },
  // 扔雞蛋（點別人的座位 →「扔雞蛋」）、積分榜（點頂欄的雞蛋數）、設置（⋯ 菜單）
  egg: {
    title: '雞蛋',
    steps: [
      ['被扔', () => throwEgg('s3', ME)],
      ['我扔3號', () => throwEgg(ME, 's3')],
      ['亂扔一通', async () => {
        for (const [a, b] of [['s2', 's5'], ['s4', 's3'], ['s6', 's3'], ['s7', ME], ['s5', 's3'], ['s3', 's2'], ['s6', 's7']]) { throwEgg(a, b); refresh(); await wait(280); }
      }],
      ['積分榜', () => { world.players.s2.wins = 3; world.players.s2.mvp = 1; world.players[ME].wins = 2; refresh(); openBoard(ctx); }],
      ['準備階段', () => { world.result = { team: 'good', winners: ['s1', 's2', 's4'], game: 0 }; lobby(); }],
      ['設置', () => openSettings(ctx)],
    ],
  },
  ui: {
    title: '界面',
    steps: [
      ['新信息', () => say('st', ME, '4號老王 和 7號阿杰 之中有一位是【共情者】', { info: true, night: 1,
        marks: [{ seatId: 's4', r: 'empath', q: true }, { seatId: 's7', r: 'empath', q: true }],
        f: [{ s: 's4' }, { w: '和' }, { s: 's7' }, { w: '之中有' }, { r: 'empath', named: true }] })],
      ['彈窗', () => ask('結束白天？今天沒有人上處決台。', () => {}, '結束白天')],
      ['提示', () => toast('已發送')],
    ],
  },
  // 新美術資源包（img/kit/）的角色牌和現在的對比：左舊右新；「換上桌」把桌上所有角色牌換成新圖
  tokens: {
    title: '角色牌',
    init: () => { cmp = 'grid'; kitTable = false; },
    steps: [
      ['並排', () => { cmp = 'grid'; }],
      ['小尺寸', () => { cmp = 'size'; }],
      ['易混', () => { cmp = 'confuse'; }],
      ['換上桌', () => { cmp = null; kitTable = !kitTable; view({ st: true }); }],
    ],
  },
  // GPT 生成的新美術（img/art/ + css/art.css）：body.art 打開；每一步走到一處換了圖的地方
  art: {
    title: '美術',
    init: () => { document.body.classList.add('art'); gallery = false; },
    steps: [
      ['舊/新', () => document.body.classList.toggle('art')],
      ['拉幕開局', () => { lobby(); view({ me: ME }); startGame(); }],
      ['入夜', () => { view({ me: ME }); toNight(); }],
      ['天亮', () => { view({ me: ME }); dawn(); resetDay(); }],
      ['處決', async () => {
        nominate('s2', 's4'); refresh(); await wait(2600);
        for (const id of ['s3', 's5', 's2', 's1']) { setVote(id, 'yes'); refresh(); await wait(250); }
        await wait(400); closeVote(); refresh(); await wait(2400); endDay();
      }],
      ['善良勝', () => { view({ me: ME }); win('good', '惡魔被處決'); }],
      ['扔雞蛋', async () => { for (const [a, b] of [['s3', ME], ['s2', 's5'], ['s4', 's3']]) { throwEgg(a, b); refresh(); await wait(320); } }],
      ['素材', () => { gallery = !gallery; }],
    ],
  },
};
let cmp = null, kitTable = false, gallery = false;
// 對局裏看不到的素材：大廳（字標 + 主視覺，疊上真實的 .card / .btn）和其餘單件
const ART = n => h('img', { src: `img/art/${n}.webp`, alt: n });
function artGallery() {
  const title = tr('鐘') === '鐘' ? 'title-tc' : 'title-sc';
  return h('div', { class: 'art-gallery', 'data-scroll': 'art' },
    h('div', { class: 'lobby-mock' }, ART(title),
      h('div', { class: 'card' }, h('input', { placeholder: '房間號' }), h('input', { placeholder: '你的暱稱' }), h('button', { class: 'btn primary' }, '加入房間'))),
    h('div', { class: 'row-art' }, ['card-back', 'seat-empty', 'crown-good', 'crown-evil', 'mvp-medal', 'trophy', 'sun', 'moon', 'gallows-noose', 'egg', 'egg-splat-1', 'egg-splat-2', 'egg-splat-3'].map(ART)),
    h('div', { class: 'row-art' }, ['plate', 'plate-evil'].map(ART)),
    // 幕布紅色：原色和壓柔和後並排
    h('div', { class: 'curtain-cmp' }, ['curtain-drape-vivid', 'curtain-drape'].map(n => h('div', { style: { '--drape': `url(img/art/${n}.webp)`, '--val': `url(img/art/${n.replace('drape', 'valance')}.webp)` } }))));
}
const kitToken = (id, size = 'md') => h('div', { class: `token ${size} kit`, style: { '--kit': `url(img/kit/${id}-token.svg)` } },
  h('span', { class: 'token-name' }, ROLES[id].name));
const pair = (id, size) => h('div', { class: 'cmp-pair' }, roleToken(id, { size }), kitToken(id, size));
const CONFUSE = [['monk', 'recluse'], ['investigator', 'fortuneteller', 'spy']];
function cmpPanel() {
  const ids = Object.keys(ROLES).filter(id => KIT.has(id));
  const body = cmp === 'grid' ? Object.keys(TEAMS).map(t => h('div', { class: 'cmp-row' },
    h('b', { style: { color: TEAMS[t].color } }, TEAMS[t].name), ids.filter(id => ROLES[id].team === t).map(id => pair(id))))
    : cmp === 'size' ? ['sm', 'xs'].map(s => h('div', { class: 'cmp-row' }, h('b', {}, s === 'sm' ? '48px' : '座位角標'),
      ids.map(id => pair(id, s))))
    : CONFUSE.map(g => h('div', { class: 'cmp-row' }, g.map(id => pair(id))));
  return h('div', { class: 'cmp', 'data-scroll': 'cmp' },
    h('div', { class: 'cmp-head' }, h('span', {}, '舊'), h('span', {}, '新')), body);
}
// 資源包只畫了暗流湧動的 22 個角色
const KIT = new Set(['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper',
  'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint', 'poisoner', 'spy', 'scarletwoman', 'baron', 'imp']);
const NAME2ID = Object.fromEntries(Object.entries(ROLES).flatMap(([id, r]) => [[r.name, id], [tr(r.name), id]]));
function kitifyTable(app) {
  app.querySelectorAll('.board .token:not(.blank):not(.empty):not(.kit)').forEach(el => {
    const id = NAME2ID[(el.title || '').split('：')[0]];
    if (!KIT.has(id)) return;
    el.classList.add('kit');
    el.style.setProperty('--kit', `url(img/kit/${id}-token.svg)`);
  });
}
const params = new URLSearchParams(location.search);
let scene = SCENES[params.get('s')] ? params.get('s') : 'log';

function demoBar() {
  const sc = SCENES[scene];
  const view = (text, w, on) => h('button', { class: 'btn sm demo-view' + (on ? ' on' : ''), onclick: () => { who = w; refresh(); } }, text);
  return h('nav', { class: 'demo-bar' },
    h('span', { class: 'demo-tag' }, '演示'),
    Object.entries(SCENES).map(([k, x]) => h('button', { class: 'btn sm' + (k === scene ? ' primary' : ' ghost'), onclick: () => go(k) }, x.title)),
    h('i', { class: 'op-sep' }),
    sc.steps.map(([text, fn], i) => h('button', { class: 'btn sm demo-step' + (done.has(i) ? ' done' : ''),
      onclick: async () => { done.add(i); const r = fn(); refresh(); await r; refresh(); } }, h('i', {}, i + 1), text)),
    h('span', { class: 'grow' }),
    view('玩家', { me: ME }, !!who.me), view('說書人', { st: true }, !!who.st),
    h('button', { class: 'btn sm ghost', onclick: () => go(scene) }, '重置'));
}
function go(k) {
  scene = k;
  history.replaceState(null, '', `?s=${k}`);
  document.getElementById('app').replaceChildren();
  document.body.classList.remove('art');
  fresh();
  SCENES[k].init?.();
  refresh();
}

function refresh() {
  ctx.live = viewOf();
  onInfo(ctx, ctx.live, render);
  onState(ctx.live);
  render();
  onEggs(ctx.live);
}
function render() {
  if (ctx.live) ctx.state = heldView() || ctx.live; // 開新局拉幕時，幕布合上之前畫的還是上一局
  const s = ctx.state;
  if (!s) return;
  const app = document.getElementById('app');
  const atBottom = {};
  app.querySelectorAll('[data-scroll]').forEach(el => { atBottom[el.dataset.scroll] = el.scrollHeight - el.scrollTop - el.clientHeight < 30; });
  const dock = s.isSt ? stFlow(ctx) : playerFlow(ctx);
  const side = renderSide(ctx);
  const tree = h('div', { class: `game phase-${s.phase}` + (s.isSt ? ' is-st' : '') + (sideCollapsed(ctx) ? ' side-min' : '') },
    h('div', { class: 'demo-top' }, demoBar(), topbar(ctx)),
    h('main', { class: 'board' }, s.peek && h('div', { class: 'peekbar' }, `正在以 ${s.peek.label} 的視角查看（只讀）`,
      h('button', { class: 'btn sm primary', onclick: () => ctx.peek(null) }, '返回說書人視角')),
    renderHud(ctx), renderTown(ctx), renderChatWins(ctx), scene === 'tokens' && cmp && cmpPanel(), scene === 'art' && gallery && artGallery()), dock, side);
  const cur = app.firstElementChild;
  if (cur && cur.classList.contains('game')) morph(cur, tree); else app.replaceChildren(tree);
  if (scene === 'tokens' && kitTable) kitifyTable(app);
  app.querySelectorAll('[data-scroll]').forEach(el => {
    const b = atBottom[el.dataset.scroll];
    if (b || (b == null && el.dataset.stick)) el.scrollTop = el.scrollHeight;
  });
}

ensureScene();
setRender(render);
go(scene);
