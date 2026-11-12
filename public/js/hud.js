// 玩家左上角面板：大角色牌 + 能力 + 每晚的信息式子。可收成只剩角色牌（點牌或「收起」）。
// 懸停 / 點一條信息，桌上相關座位高亮；新信息到達時面板自動展開，新的一行飛入並閃一下。
// 中屏、手機上（面板佔著桌面）輪到自己選人時自動收起，免得蓋住要點的座位；這一步裏點牌可以再打開。
import { h, roleToken, modal, ask } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { formula, formulaSeats, mini, w, icon, tag, ACTS } from './glyph.js';
import { roleHeld, hudFx, msgHeld, msgShownAt, nightHeld } from './fx.js';
import { openTrial } from './trial.js';
import { veilOn, setVeil, isPeeking, isAutoOpen, startPeek } from './veil.js';

const ui = { hover: null, pin: null, fresh: new Map(), openFor: null }; // fresh：消息 id -> 到達時間；openFor：選人時手動展開的那一步
// 換了身份（調試房間換座位、說書人代入視角 / 換回）：上一個身份懸停、固定、剛到還閃著的信息行都作廢（app.js）
export function resetHud() { Object.assign(ui, { hover: null, pin: null, openFor: null }); ui.fresh.clear(); }
const SMALL = '(max-width: 1180px)'; // 和 hud.css 裏選人時收起的寬度一致
const LAND = '(max-width: 1180px) and (max-height: 500px) and (orientation: landscape)'; // 矮橫屏：面板和偽裝卡貼在圓桌兩邊（hud.css）
const FRESH_MS = 3200;

const collapsed = ctx => ctx.ls.get('botc.hud') === 'min';
const setCollapsed = (ctx, v) => { ctx.ls.set('botc.hud', v ? 'min' : ''); ctx.render(); };

// 面板裏列出的消息：說書人給的信息、自己的夜晚行動、角色變化（開局發角色那條不列，牌就在面板頂上）。
// 技能演出還沒播完的那條先不列（演出的答案飛進面板的那一下才出現）；all：連還沒放出來的也算
export const hudRows = (s, all) => s.chat.filter(m => m.info && m.to === s.myId && !(m.k === 'role' && !m.f) && (all || !msgHeld(m)));
// 剛到的信息：從到達（演出播完放出來）算起閃一會兒
const freshAt = m => Math.max(ui.fresh.get(m.id) || 0, msgShownAt(m));

// 當前要在桌上高亮的座位：懸停 > 固定 > 剛到的信息
export function hudLinked(s) {
  if (s.isSt) return new Set();
  const rows = hudRows(s), byId = id => rows.find(m => m.id === id);
  const now = Date.now();
  const ids = [ui.hover, ui.pin].map(byId).filter(Boolean);
  if (!ids.length) ids.push(...rows.filter(m => now - freshAt(m) < FRESH_MS));
  return new Set(ids.flatMap(m => (m.f ? formulaSeats(m.f) : (m.marks || []).map(k => k.seatId))));
}

// 線下遮著身份時，信息自己亮出來的那幾秒不算看過：手機可能扣在桌上、人閉著眼、屏幕鎖著。
// 按住看了、不遮了、亮著的時候碰過屏幕（拿在手裏看著）才算看過；沒看過的，牌背上一直亮著紅點（veilHud），睜眼拿起手機就知道有新的
const seenKey = (s, id = s.myId) => `botc.seen.${s.code}.${s.gameId}.${id}`;
// 某個座位還有幾條私密信息沒看過（調試房間的換身份菜單用：seqs 是發給他的信息的序號）
export const unseenOf = (ctx, s, id, seqs) => { const seen = Number(ctx.ls.get(seenKey(s, id)) || 0); return (seqs || []).filter(q => q > seen).length; };
const looking = (ctx, s) => !s.offline || !veilOn(ctx, s) || isPeeking() || !['night', 'day', 'dawn'].includes(s.phase);
function markSeen(ctx, s) {
  const all = s.chat.filter(m => m.info && m.to === s.myId);
  if (all.length) ctx.ls.set(seenKey(s), all.at(-1).seq);
}
let lastCtx = null;
addEventListener('pointerdown', () => {
  const s = lastCtx?.live;
  if (!s || s.isSt || !s.myId || !isAutoOpen() || Number(lastCtx.ls.get(seenKey(s)) || 0) >= Math.max(0, ...s.chat.filter(m => m.info && m.to === s.myId).map(m => m.seq))) return;
  markSeen(lastCtx, s);
  lastCtx.render();
}, true);

// 收到狀態時調用：找出新到的信息，展開面板並播放飛入（看過的最後一條記在本機，按局區分）
export function onInfo(ctx, s, render) {
  if (s.isSt || !s.myId) return;
  lastCtx = ctx;
  const seen = Number(ctx.ls.get(seenKey(s)) || 0), look = looking(ctx, s);
  const rows = hudRows(s, true).filter(m => m.seq > seen);
  if (look) markSeen(ctx, s);
  // 沒看過的那幾條每來一次狀態都還算新的：只在第一次到的時候閃；按住看的那一下再閃一遍，指給他哪幾條是新的
  const now = Date.now(), news = isPeeking() ? rows : rows.filter(m => !ui.fresh.has(m.id));
  if (!news.length || s.peek) return;
  news.forEach(m => ui.fresh.set(m.id, now));
  if (collapsed(ctx)) ctx.ls.set('botc.hud', '');
  // 列表是最新的一晚在最上：新信息到了滾回頂上（這次重繪之後），往下翻著看舊信息時也不會錯過
  requestAnimationFrame(() => document.querySelector('.hud-list')?.scrollTo({ top: 0, behavior: 'smooth' }));
  setTimeout(render, FRESH_MS + 50); // 高亮結束後重繪一次
}

function rowView(ctx, m) {
  const s = ctx.state, t = freshAt(m), el = t ? Date.now() - t : Infinity;
  const on = ui.pin === m.id || ui.hover === m.id;
  return h('div', {
    class: 'hud-row' + (on ? ' on' : '') + (el < FRESH_MS ? ' fresh' : '') + (m.k === 'act' ? ' act' : '') + (msgHeld(m) ? ' mk-held' : ''),
    'data-key': m.id, style: el < FRESH_MS ? { '--fx-delay': `-${el}ms` } : null,
    onmouseenter: () => { ui.hover = m.id; ctx.render(); },
    onmouseleave: () => { if (ui.hover === m.id) { ui.hover = null; ctx.render(); } },
    onclick: () => { ui.pin = ui.pin === m.id ? null : m.id; ctx.render(); },
  },
  ...rowBody(s, m));
}
// 自己的夜晚行動：行動圖標（毒滴、盾牌…）+ 動詞（投毒 / 認主，不是座位上的標記詞）+ 座位；信息：式子，來源是別的角色時（換過角色）前面帶那張牌，說書人手寫的帶「說書人」
function rowBody(s, m) {
  if (m.k === 'act') {
    const a = ACTS[m.src], picked = (m.f || []).some(t => t.s || t.r);
    return [a && h('span', { class: 'act-chip ' + a.tone }, icon(a.ico)), picked ? [a ? (a.verb || a.mark) && w(a.verb || a.mark, 'ink') : w('選了', 'ink'), formula(s, m.f.filter(t => t.op !== 'to'))] : w('沒有選人', 'muted')]; // 系統不認識的角色沒有自己的動作詞
  }
  return [!m.src ? w('說書人', 'src') : ROLES[m.src] && m.src !== s.myRole && mini(m.src, 'src'),
    m.f ? formula(s, m.f) : h('span', { class: 'hud-text' }, m.text)];
}

// 遮住身份時的面板：一張背面朝上的角色牌，按住翻開。角上的眼睛是不再遮；沒看過的新信息在另一角亮一個點
function veilHud(ctx) {
  const s = ctx.state, raw = ctx.live, seen = Number(ctx.ls.get(seenKey(s)) || 0);
  const unseen = raw.chat.filter(m => m.info && m.to === s.myId && m.seq > seen).length; // 開局發的角色也算：遮著開局，牌角亮著點
  return h('aside', { class: 'hud min veil', 'data-key': 'hud', 'data-exit': true, oncontextmenu: e => e.preventDefault() },
    h('button', { class: 'hud-me', 'aria-label': '按住看自己的角色', onpointerdown: e => startPeek(ctx, e, () => onInfo(ctx, ctx.live, ctx.render)) },
      // 紅點寫著幾條沒看的，慢慢跳著（扣在桌上的手機拿起來第一眼就看到）
      h('div', { class: 'token back' }), unseen > 0 && h('i', { class: 'veil-new', 'data-key': 'new' + unseen, 'data-exit': true }, unseen), // 多了一條就重新彈一下（白天大家睜著眼不演出，只有這一下）
      h('span', { class: 'veil-say' }, '按住看')), // 字也在按鈕裏：按字一樣能看
    // 眼睛緊挨著要按住的牌，手指一歪就會點到：點了先問一句，免得一下子把角色亮給旁邊的人、之後一直不遮
    h('button', { class: 'veil-off', title: '不再遮住', 'aria-label': '不再遮住', onclick: () => ask('之後角色牌一直翻開著，旁邊的人瞄一眼就能看到。', () => setVeil(ctx, false), '不再遮住') }, icon('eye')));
}

export function renderHud(ctx) {
  const s = ctx.state;
  if (s.veiled) return veilHud(ctx);
  if (s.isSt || !s.myRole || s.phase === 'lobby') return null;
  const veilable = !s.peek && ['night', 'day', 'dawn'].includes(s.phase);
  const peek = isPeeking(), float = peek || (isAutoOpen() && veilOn(ctx, s)), r = ROLES[s.myRole], min = collapsed(ctx) && !float;
  // 選人時自動收起（寬屏不生效，見 hud.css .hud.pick）。手機上收起會讓圓桌上移，所以和選人牌一起等前面的演出播完。
  // 矮橫屏上面板佔著左邊整條，攤開的審判牌被它蓋住半邊（贊成的人看不到），審判期間也收起。這一步 / 這張審判牌裏點牌可以再打開
  const why = s.prompt && !nightHeld() ? s.prompt.stepId : matchMedia(LAND).matches ? openTrial(s) : null;
  const pick = !min && !float && why != null && ui.openFor !== why; // 按住看、自己亮著時浮在桌上、不佔位：整張都給他看，不收成一張牌
  const toggle = () => {
    if (pick && matchMedia(SMALL).matches) { ui.openFor = why; ctx.render(); } else setCollapsed(ctx, !min);
  };
  // 演出還沒播完的那一行也排進去但看不見（mk-held）：演出把答案送到它的位置，落定時正好接上
  const rows = hudRows(s, true);
  // 按夜晚分組，最新的一晚在最上面
  const groups = [];
  for (const m of rows) {
    const g = groups.find(x => x.n === m.night) || (groups.push({ n: m.night, rows: [] }), groups.at(-1));
    g.rows.push(m);
  }
  groups.reverse();
  // 翻角色牌演出期間面板空著，等牌飛進來；落定後名字、能力、信息淡入
  const held = roleHeld(), fx = !held && hudFx();
  return h('aside', { class: 'hud' + (min ? ' min' : '') + (pick ? ' pick' : '') + (float ? ' peek' : '') + (peek ? ' hold' : '') + (held ? ' held' : '') + (fx ? ' fx-in' : ''), 'data-key': 'hud', 'data-exit': true, style: { '--team': TEAMS[r.team].color, ...fx } },
    h('button', { class: 'hud-me', title: min ? '展開' : '收起', 'aria-label': min ? '展開角色面板' : '收起角色面板', onclick: toggle }, roleToken(s.myRole)),
    !min && !peek && h('div', { class: 'hud-tools' },
      // 只有遊戲中能遮：終局全場都翻開了，沒有「遮住 / 蓋上」
      veilable && !veilOn(ctx, s) && h('button', { class: 'hud-x', onclick: () => setVeil(ctx, true) }, '遮住'),
      veilable && veilOn(ctx, s) && h('button', { class: 'hud-x', onclick: () => setVeil(ctx, true) }, '蓋上'),
      h('button', { class: 'hud-x', onclick: () => setCollapsed(ctx, true) }, '收起')),
    !min && h('div', { class: 'hud-body' },
      h('div', { class: 'hud-name' }, r.name, h('span', { class: 'hud-team' }, TEAMS[r.team].name, s.myWas && ` · 原${ROLES[s.myWas].name}`, s.myAlign && [' · ', w(s.myAlign === 'evil' ? '現為邪惡' : '現為善良', s.myAlign)])),
      h('div', { class: 'hud-ab' }, r.ability),
      // 不掛 data-scroll：那是聊天、日誌那種「貼底」列表，這裏最新的在最上，貼底就把剛到的信息滾出去了
      groups.length > 0 && h('div', { class: 'hud-list' }, groups.map(g => h('div', { class: 'hud-night' },
        h('div', { class: 'hud-n' }, g.n ? `第 ${g.n} 夜` : '開局'),
        h('div', { class: 'hud-rows' }, g.rows.slice().reverse().map(m => rowView(ctx, m))))))));
}

// 惡魔的偽裝卡（桌面左下角）：首夜得知的三個不在場角色，白天可以冒充。點牌看能力。
// 可以收成一條（偽裝 + 三張小牌）；中屏、手機上輪到自己選人時也收成一條，不蓋座位（hud.css .bluffs.pick）；手機上排在圓桌下面
export function renderBluffs(ctx) {
  const s = ctx.state;
  if (s.isSt || !s.bluffs?.length || s.phase === 'ended' || roleHeld()) return null;
  // 矮的豎屏手機（Safari 帶工具欄、小屏安卓）：整張偽裝卡排在圓桌下面會把圓桌擠得很小，沒表過態就先收成一條，點開才是整張
  const pref = ctx.ls.get('botc.bluffs'), short = matchMedia('(max-width: 860px) and (max-height: 600px) and (orientation: portrait)').matches;
  const min = (pref == null ? (short ? 'min' : '') : pref) === 'min', set = v => { ctx.ls.set('botc.bluffs', v ? 'min' : ''); ctx.render(); };
  const show = id => modal(ROLES[id].name, h('div', { class: 'bl-ab' }, roleToken(id), h('p', {}, ROLES[id].ability)));
  return h('aside', { class: 'bluffs' + (min ? ' min' : '') + (s.prompt && !nightHeld() ? ' pick' : ''), 'data-key': 'bluffs', 'data-exit': true, onclick: min ? () => set(false) : null },
    h('div', { class: 'bl-head' }, tag('bluff'), h('span', { class: 'bl-minis' }, s.bluffs.map(id => mini(id))),
      h('span', { class: 'bl-sub' }, '這些角色不在場，需要時可以偽裝成他們'),
      h('button', { class: 'hud-x bl-x', onclick: e => { e.stopPropagation(); set(true); } }, '收起')),
    h('div', { class: 'bl-row' }, s.bluffs.map(id => h('button', { class: 'bl-role', onclick: () => show(id) },
      roleToken(id, { size: 'sm' }), h('b', {}, ROLES[id].name)))));
}