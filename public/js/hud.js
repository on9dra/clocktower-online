// 玩家左上角面板：大角色牌 + 能力 + 每晚的信息式子。可收成只剩角色牌。
// 懸停 / 點一條信息，桌上相關座位高亮；新信息到達時面板自動展開，新的一行飛入並閃一下。
import { h, roleToken } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { formula, formulaSeats, mini, w } from './glyph.js';
import { roleHeld, hudFx } from './fx.js';

const ui = { hover: null, pin: null, fresh: new Map() }; // fresh：消息 id -> 到達時間
const FRESH_MS = 3200;

const collapsed = ctx => ctx.ls.get('botc.hud') === 'min';
const setCollapsed = (ctx, v) => { ctx.ls.set('botc.hud', v ? 'min' : ''); ctx.render(); };

// 面板裏列出的消息：說書人給的信息、自己的夜晚行動、角色變化（開局發角色那條不列，牌就在面板頂上）
export const hudRows = s => s.chat.filter(m => m.info && m.to === s.myId && !(m.k === 'role' && !m.f));

// 當前要在桌上高亮的座位：懸停 > 固定 > 剛到的信息
export function hudLinked(s) {
  if (s.isSt) return new Set();
  const rows = hudRows(s), byId = id => rows.find(m => m.id === id);
  const now = Date.now();
  const ids = [ui.hover, ui.pin].map(byId).filter(Boolean);
  if (!ids.length) ids.push(...rows.filter(m => now - (ui.fresh.get(m.id) || 0) < FRESH_MS));
  return new Set(ids.flatMap(m => (m.f ? formulaSeats(m.f) : (m.marks || []).map(k => k.seatId))));
}

// 收到狀態時調用：找出新到的信息，展開面板並播放飛入（看過的最後一條記在本機，按局區分）
export function onInfo(ctx, s, render) {
  if (s.isSt || !s.myId) return;
  const key = `botc.seen.${s.code}.${s.gameId}.${s.myId}`;
  const seen = Number(ctx.ls.get(key) || 0);
  const rows = hudRows(s).filter(m => m.seq > seen);
  const all = s.chat.filter(m => m.info && m.to === s.myId);
  if (all.length) ctx.ls.set(key, all.at(-1).seq);
  if (!rows.length || s.peek) return;
  const now = Date.now();
  rows.forEach(m => ui.fresh.set(m.id, now));
  if (collapsed(ctx)) ctx.ls.set('botc.hud', '');
  setTimeout(render, FRESH_MS + 50); // 高亮結束後重繪一次
}

function rowView(ctx, m) {
  const s = ctx.state, t = ui.fresh.get(m.id), el = t ? Date.now() - t : Infinity;
  const on = ui.pin === m.id || ui.hover === m.id;
  return h('div', {
    class: 'hud-row' + (on ? ' on' : '') + (el < FRESH_MS ? ' fresh' : '') + (m.k === 'act' ? ' act' : ''),
    'data-key': m.id, style: el < FRESH_MS ? { '--fx-delay': `-${el}ms` } : null,
    onmouseenter: () => { ui.hover = m.id; ctx.render(); },
    onmouseleave: () => { if (ui.hover === m.id) { ui.hover = null; ctx.render(); } },
    onclick: () => { ui.pin = ui.pin === m.id ? null : m.id; ctx.render(); },
  },
  // 來源：給信息的角色；爪牙 / 惡魔互認用自己的牌；說書人手寫的補充信息用羽毛筆
  m.src ? mini(ROLES[m.src] ? m.src : s.myRole, 'src') : w('說書人', 'src'),
  m.f ? formula(s, m.f) : h('span', { class: 'hud-text' }, m.text));
}

export function renderHud(ctx) {
  const s = ctx.state;
  if (s.isSt || !s.myRole || s.phase === 'lobby') return null;
  const r = ROLES[s.myRole], min = collapsed(ctx);
  const rows = hudRows(s);
  // 按夜晚分組，最新的一晚在最上面
  const groups = [];
  for (const m of rows) {
    const g = groups.find(x => x.n === m.night) || (groups.push({ n: m.night, rows: [] }), groups.at(-1));
    g.rows.push(m);
  }
  groups.reverse();
  // 翻角色牌演出期間面板空著，等牌飛進來；落定後名字、能力、信息淡入
  const held = roleHeld(), fx = !held && hudFx();
  return h('aside', { class: 'hud' + (min ? ' min' : '') + (held ? ' held' : '') + (fx ? ' fx-in' : ''), style: { '--team': TEAMS[r.team].color, ...fx } },
    h('button', { class: 'hud-me', title: min ? '展開' : '收起', onclick: () => setCollapsed(ctx, !min) }, roleToken(s.myRole)),
    !min && h('div', { class: 'hud-body' },
      h('div', { class: 'hud-name' }, r.name, h('span', { class: 'hud-team' }, TEAMS[r.team].name)),
      h('div', { class: 'hud-ab' }, r.ability),
      groups.length > 0 && h('div', { class: 'hud-list', 'data-scroll': 'hud' }, groups.map(g => h('div', { class: 'hud-night' },
        h('div', { class: 'hud-n' }, g.n ? `第 ${g.n} 夜` : '開局'),
        h('div', { class: 'hud-rows' }, g.rows.slice().reverse().map(m => rowView(ctx, m))))))));
}
