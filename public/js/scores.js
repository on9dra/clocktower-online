// 積分界面：贏家頭上的陣營皇冠、終局後的 MVP 投票（座位上的星星鈕 + 圓桌中間的倒數）、座位上的 MVP 標記、積分榜
import { h, modal } from './ui.js';
import { icon, seatBadge, w } from './glyph.js';
import { winHeld, mvpHeld, crownFx, mvpFx } from './fx.js';

// 皇冠：善良是圓頭帶寶珠的藍冠，邪惡是帶尖角的紅冠（平塗 + 墨線）
const CROWN = {
  good: '<path class="cr-body" d="M5 26L3 9.5l8.5 7L20 4.5l8.5 12L37 9.5 35 26z"/><rect class="cr-band" x="5" y="21.5" width="30" height="5" rx="1"/>'
    + '<circle class="cr-gem" cx="3" cy="9" r="2.7"/><circle class="cr-gem" cx="20" cy="4.2" r="3"/><circle class="cr-gem" cx="37" cy="9" r="2.7"/><circle class="cr-dot" cx="20" cy="24" r="1.7"/>',
  evil: '<path class="cr-body" d="M5 26L1.5 2.5 11 14.5l4-10 5 11 5-11 4 10 9.5-12L35 26z"/><rect class="cr-band" x="5" y="21.5" width="30" height="5" rx="1"/>'
    + '<circle class="cr-dot" cx="13" cy="24" r="1.4"/><circle class="cr-dot" cx="20" cy="24" r="1.7"/><circle class="cr-dot" cx="27" cy="24" r="1.4"/>',
};
export function crownSvg(team, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 40 30');
  el.setAttribute('class', `crown ${team} ${cls}`);
  el.innerHTML = CROWN[team] || '';
  return el;
}
// 座位頭像上的皇冠：終局演出播完才落到頭上
export function seatCrown(seat) {
  if (!seat.crown || winHeld()) return null;
  const fx = crownFx(), el = crownSvg(seat.crown, fx ? fx.cls : '');
  if (fx) el.style.setProperty('--fx-delay', fx.style['--fx-delay']);
  el.setAttribute('aria-label', seat.crown === 'good' ? '上一局善良獲勝' : '上一局邪惡獲勝');
  return el;
}

// MVP 投票進行中（終局演出播完以後；代入視角只看不投）
export const mvpVoting = s => s.phase === 'ended' && !!s.mvpVote && !s.mvpVote.done && !s.peek && !winHeld();
const voteMvp = (ctx, id) => (ctx.state.isSt ? ctx.st('mvp', { seatId: id }) : ctx.act('mvp', { targetId: id }));
// 座位右上角的星星：點一下投他，再點一下收回
export function mvpButton(ctx, seat) {
  const on = ctx.state.mvpVote.mine === seat.id;
  return h('button', { class: 'mvp-btn' + (on ? ' on' : ctx.state.mvpVote.mine ? ' quiet' : ''), title: on ? '收回' : '投 MVP',
    onclick: e => { e.stopPropagation(); voteMvp(ctx, on ? null : seat.id); } }, icon('star'));
}
// 座位名牌上的 MVP 標記：MVP 演出播完才亮
export function mvpTag(seat) {
  if (!seat.mvp || mvpHeld()) return null;
  const fx = mvpFx();
  return h('span', { class: 'mvp-tag' + (fx ? ' ' + fx.cls : ''), style: fx && fx.style }, icon('star'), 'MVP');
}

// 圓桌中間：投票中是倒數 + 已投人數 + 自己投給誰；結束後是 MVP 和票數
export function mvpPane(ctx) {
  const s = ctx.state, m = s.mvpVote;
  if (!m || s.phase !== 'ended' || winHeld() || mvpHeld()) return null;
  if (m.done) {
    if (!m.winners.length) return null;
    return h('div', { class: 'cx mvp-pane done' }, h('span', { class: 'mvp-k' }, icon('star'), 'MVP'),
      h('span', { class: 'dock-frm' }, m.winners.map(id => seatBadge(s, id)), w(`${m.tally?.[m.winners[0]] || 0} 票`)));
  }
  const left = Math.max(0, Math.ceil((m.closesAt - ctx.now()) / 1000));
  return h('div', { class: 'cx mvp-pane' + (left <= 10 ? ' low' : '') },
    h('span', { class: 'mvp-k' }, icon('star'), 'MVP', h('b', { class: 'mvp-left' }, left)),
    h('span', { class: 'dock-frm' }, w('已投'), h('b', { class: 'mvp-n' }, `${m.n}/${m.total}`),
      !s.peek && m.mine && [h('i', { class: 'op-sep' }), icon('star', 'brass'), seatBadge(s, m.mine)]));
}

// 準備階段座位下面：勝利積分、MVP 次數（有才顯示）
export function scoreRow(seat) {
  if (!seat.wins && !seat.mvps) return null;
  return h('div', { class: 'score' }, seat.wins > 0 && h('span', { title: '勝利積分' }, icon('trophy'), seat.wins),
    seat.mvps > 0 && h('span', { title: 'MVP 次數' }, icon('star'), seat.mvps));
}

// 積分榜：按勝利積分、MVP 次數排序
export function openBoard(ctx) {
  const s = ctx.state;
  const rows = s.seats.map((x, i) => ({ x, i })).sort((a, b) => b.x.wins - a.x.wins || b.x.mvps - a.x.mvps || a.i - b.i);
  modal('積分榜', h('table', { class: 'score-tbl' },
    h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, '玩家'), h('th', {}, icon('trophy'), '勝利'), h('th', {}, icon('star'), 'MVP'), h('th', {}, icon('egg'), '雞蛋'))),
    h('tbody', {}, rows.map(({ x }, k) => h('tr', { class: x.mine ? 'mine' : '' },
      h('td', { class: 'rank' }, k + 1),
      h('td', {}, h('span', { class: 'st-who' }, seatBadge(s, x.id), h('span', {}, x.name), x.crown && crownSvg(x.crown, 'xs'))),
      h('td', {}, x.wins), h('td', {}, x.mvps), h('td', {}, x.eggs))))));
}
