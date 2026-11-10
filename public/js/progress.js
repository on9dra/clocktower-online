// 進度條：一張紙卡上一串牌，用一根線串起來；窄屏是桌面底下的橫條，寬屏是桌面右邊的豎條（樣式見 board.css）。
// 夜晚：左端「第 N 夜」的章 → 今晚順序表上的角色（劇本上今晚行動的，不在場的也掛著，說書人到時假裝叫醒）→ 右端天亮的章。
// 白天：左端「第 N 天」的章（天亮）→ 今天的每次提名 → 討論 / 正在投票 → 處決台 → 右端入夜的章。
// 走過的線是金線（和座位上「被喚醒」的金圈一個意思），沒走到的是淡線；走到下一格時金線從左往右描過去，
// 線到了，那張牌被拽一下、蓋上金色的章。玩家的夜晚只有角色順序，沒有金線和章（服務器不發 at）；說書人每張牌還有座位號，假裝叫醒的是虛線牌
// 兩端的章釘在紙卡上，中間的牌放不下時在 .pg-roll 裏滾；點紙卡彈出完整的一張表（牌 + 名字）
import { h, seatLabel, modal, closeModal, modalOpen, morph } from './ui.js';
import { ROLES } from './roles.js';
import { icon, mini, seatBadge, w } from './glyph.js';

// 一段線：從第 i 張牌的頂上到第 i+1 張，二次曲線下垂；上面疊一層金線，整段走過了才描出來。
// 每根線底下墊一道紙色的邊（像剪紙的線），壓在熱鬧的小鎮剪影上也看得清
const CURVE = 'd="M0 1Q50 15 100 1" vector-effect="non-scaling-stroke"';
const THREAD = `<svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><path class="u" ${CURVE}/><path class="l" ${CURVE}/></svg>`;
function seg(i, done) {
  const loose = h('i', { class: 'pg-t0' }), gold = h('i', { class: 'pg-t1' });
  loose.innerHTML = gold.innerHTML = THREAD;
  return h('i', { class: 'pg-seg' + (done ? ' done' : ''), 'data-key': 'seg' + i, style: { '--i': i } }, loose, gold);
}
// 一張掛著的牌：k 是 done / now，key 讓同一張牌在重繪時保持不變（不重播動畫）；line 是它在彈窗表裏的一行
// tap：手動局說書人點一下就勾掉 / 取消（條上的牌和彈窗表裏的行都能點）
const item = (key, k, kids, title, extra = '', line = null, tap = null) => {
  const cls = `${k ? ' ' + k : ''}${extra ? ' ' + extra : ''}${tap ? ' tap' : ''}`;
  const on = tap && (e => { e.stopPropagation(); tap(); });
  return { k,
    el: i => h('div', { class: 'pg-it' + cls, 'data-key': key, style: { '--i': i }, title, onclick: on }, h('i', { class: 'pg-knot' }), kids),
    line: () => h('div', { class: 'pg-row' + cls, 'data-key': key, onclick: on }, line?.()) };
};
// 兩端的章：雙線圓章，夜晚是月亮、白天是太陽（第幾夜 / 天寫在圓桌中央，這裏不重複）
const seal = (key, k, ico, title) => item(key, k, h('span', { class: 'pg-seal ' + ico }, icon(ico)), title, 'seal');
// 牌下面掛的小名牌（和圓桌上座位的名牌一個樣子）：座位號、票數；red 是處決台
const tag = (kids, red) => h('b', { class: 'pg-tag' + (red ? ' red' : '') }, kids);

// 開著的完整表：進度變了跟著改，換了一夜 / 一天就收起來
let sheet = null;
function syncSheet(title, lines) {
  if (!sheet) return;
  if (!modalOpen(sheet.box)) sheet = null;
  else if (sheet.title !== title) { closeModal(); sheet = null; } else morph(sheet.box.querySelector('.pg-list'), lines());
}
// 從點到的那張牌（點在空白處就是頭上的章）裏彈出來，收回去也回到它
function openSheet(e, title, kind, lines) {
  const key = (e.target.closest('.pg-it') || e.currentTarget.querySelector('.pg-it.seal')).dataset.key;
  const at = () => document.querySelector(`.pg-it[data-key="${key}"]`), ico = kind === 'night' ? 'moon' : 'sun';
  sheet = { title, box: modal([h('span', { class: 'pg-seal ' + ico }, icon(ico)), title], lines(), { cls: 'pg-modal', from: at(), away: at }) };
}
// 橫條沒有豎向滾動，鼠標滾輪要換個方向
function wheel(e) {
  const r = e.currentTarget;
  if (r.scrollWidth > r.clientWidth && !e.deltaX) { r.scrollLeft += e.deltaY; e.preventDefault(); }
}
// 走到新的一格時把它滾到條中間。玩家的夜晚沒有當前格，停在開頭不動；用戶自己滑走了，走到下一格才滾回來
let followed = null;
function follow() {
  const pg = document.querySelector('.pg'), it = pg?.querySelector('.pg-it.now'), key = it?.dataset.key ?? null;
  if (key === followed) return;
  followed = key;
  if (!it) return;
  const r = pg.querySelector('.pg-roll'), f = it.style.getPropertyValue('--i') / (pg.style.getPropertyValue('--n') - 1);
  r.scrollTo({ left: f * r.scrollWidth - r.clientWidth / 2, top: f * r.scrollHeight - r.clientHeight / 2,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function garland(kind, items, title) {
  const cur = items.findIndex(x => x.k === 'now'), last = items.findLastIndex(x => x.k === 'done');
  const reach = Math.max(cur, last), end = items.length - 1; // 金線走到哪張牌
  const lines = () => h('div', { class: 'pg-list ' + kind }, items.slice(1, end).map(x => x.line()));
  syncSheet(title, lines);
  return h('div', { class: 'prog ' + kind, 'data-key': 'prog-' + kind },
    h('div', { class: 'pg', style: { '--n': items.length }, onclick: e => openSheet(e, title, kind, lines) },
      h('div', { class: 'pg-roll', onwheel: wheel }, h('div', { class: 'pg-track' },
        items.slice(1).map((_, i) => seg(i, i < reach)),
        items.slice(1, end).map((x, i) => x.el(i + 1)))),
      items[0].el(0), items[end].el(end)));
}

function nightBar(s) {
  const { order, at } = s.prog, st = s.isSt;
  const num = o => (o.seats || []).map(id => s.seats.findIndex(x => x.id === id) + 1);
  const slots = order.map((o, i) => {
    const ns = st ? num(o) : [], tok = mini(o.r), off = !st || !o.fake ? '' : ns.length ? '今晚不醒' : '不在場';
    tok.removeAttribute('title'); // 牌自己的 title 說得更準（座位號、不在場）
    const title = ROLES[o.r].name + (off ? '：' + (ns.length ? `${ns.join('、')}號 ` : '') + off : ns.length ? `：${ns.join('、')}號` : '');
    return item('r-' + o.r, i < at ? 'done' : i === at ? 'now' : '',
      [tok, st && !o.fake && ns.length > 0 && tag(ns.join('·'))], title, off ? 'ghost' : '',
      () => [mini(o.r), h('span', { class: 'pg-who' }, h('b', {}, ROLES[o.r].name), off && h('i', {}, off)), ns.length > 0 && tag(ns.join('·'))]);
  });
  const name = `第 ${s.night} 夜`;
  return garland('night', [seal('dusk', 'done', 'moon', name), ...slots,
    seal('dawn', at >= order.length ? 'now' : '', 'sun', '天亮')], name);
}

// 天亮（公佈死訊）時白天還沒開始：s.day 還是昨天，提名記錄也是昨天的，都不算
function dayBar(s) {
  const nom = s.nomination, dawn = s.phase === 'dawn', over = !dawn && s.dayOver, block = !dawn && s.block;
  const votes = nom ? Object.values(nom.votes).filter(Boolean).length : 0;
  const n = dawn ? s.day + 1 : s.day;
  const tally = (c, red) => tag([icon('hand'), c], red);
  const who = id => [seatBadge(s, id), h('span', { class: 'pg-who' }, s.seats.find(x => x.id === id)?.name)];
  const name = `第 ${n} 天`;
  return garland('day', [
    seal('dawn', dawn ? 'now' : 'done', 'sun', name),
    ...(dawn ? [] : s.history).map((x, i) => item('nom' + i, 'done', [seatBadge(s, x.nomineeId), tally(x.count, block?.nomineeId === x.nomineeId)],
      `${seatLabel(s, x.nominatorId)} 提名 ${seatLabel(s, x.nomineeId)}：${x.count} 票`, block?.nomineeId === x.nomineeId ? 'block' : '',
      () => [who(x.nominatorId), w('提名'), who(x.nomineeId), tally(x.count, block?.nomineeId === x.nomineeId)])),
    nom && item('live', 'now', [seatBadge(s, nom.nomineeId), tally(votes)], '正在投票', '',
      () => [who(nom.nominatorId), w('提名'), who(nom.nomineeId), tally(votes)]),
    !over && item('talk', !dawn && !nom ? 'now' : '', icon('talk'), '討論和提名', 'sym', () => [icon('talk'), h('b', {}, '討論和提名')]),
    item('exec', over ? 'now' : '', [icon('noose'), block && tag(s.seats.findIndex(x => x.id === block.nomineeId) + 1, true)],
      block ? `處決台：${seatLabel(s, block.nomineeId)}` : '處決', 'sym', () => [icon('noose'), h('b', {}, '處決'), block && who(block.nomineeId)]),
    seal('dusk', '', 'moon', '入夜'),
  ].filter(Boolean), name);
}

export function progressBar(ctx) {
  const s = ctx.state, bar = s.phase === 'night' && s.prog ? nightBar(s) : s.phase === 'day' || s.phase === 'dawn' ? dayBar(s) : null;
  if (!bar) syncSheet();
  queueMicrotask(follow); // 這一輪重繪做完才量得到
  return bar;
}
