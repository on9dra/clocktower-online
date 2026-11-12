// 線下局：把設備轉給玩家看的整屏紙牌。底是完全不透明的夜色，魔典一點都透不出來（不是模糊）。
// 每一頁同一個版式（show.css）：牌頂邊的小籤是給說書人的話（給 ③ 看、向惡魔展示可用的偽裝），
// 牌上只放玩家要看的東西：一個大數字、大大的「是 / 否」、大角色牌、大座位號，不寫句子和連接詞；按鈕在牌下面。
// 左上角「橫屏」把整屏內容轉 90°（iOS Safari 鎖不了屏幕方向），選了記在本機，之後的展示都這樣放；
// 右上角「收起」回到桌面，桌上那張卡還能再打開（傳閱身份時是「收回」）。
// 傳閱身份：交給 N 號 → 他點了翻開角色 → 看完蓋上 → 交給下一位 → 最後交還說書人
import { h, roleToken } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { seatBadge, icon, tag, formula } from './glyph.js';
import { tr } from './lang.js';

let box = null;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const anim = (el, frames, ms, easing = 'ease-out') => (calm() ? null : el.animate(frames, { duration: ms, easing, fill: 'both' }));
// 收尾用定時器：後台標籤頁不出幀時動畫的 finished 不會來
const later = (ms, fn) => setTimeout(fn, calm() ? 0 : ms);

// 橫著放：記在本機，之後每次打開都沿用（存不進去時這一頁裏記著）
const TURN = 'botc.turn';
let turned = null;
const isTurned = () => (turned ??= (() => { try { return localStorage.getItem(TURN) === '1'; } catch { return false; } })());
function keepTurn(on) {
  turned = on;
  try { if (on) localStorage.setItem(TURN, '1'); else localStorage.removeItem(TURN); } catch { /* 隱私模式 */ }
}
// 豎著的手機 + 往右轉的箭頭
function turnIco() {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico');
  el.innerHTML = '<rect x="3.5" y="7" width="9.5" height="14.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.9"/>'
    + '<path d="M13 3.2a7.6 7.6 0 0 1 7.6 7.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M17.8 8.6l2.8 2.6 2.4-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  return el;
}
const turnWord = () => tr(isTurned() ? '豎屏' : '橫屏');
// 轉 90°：牌轉著淡出，換成橫 / 豎的版式，再接著轉、淡進來。版式換的那一下正好是看不見的時候
function turn() {
  const b = box, stage = b?.querySelector('.pass-stage');
  if (!stage) return;
  const on = !isTurned(), dir = on ? 1 : -1;
  keepTurn(on);
  const swap = () => {
    if (box !== b) return;
    b.classList.toggle('turn', on);
    b.querySelector('.pass-turn span').textContent = turnWord();
  };
  if (calm()) return swap();
  stage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `rotate(${dir * 28}deg) scale(.88)` }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  later(150, () => {
    swap();
    stage.animate([{ opacity: 0, transform: `rotate(${dir * -62}deg) scale(.88)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  });
}

export const passOpen = () => !!box;
// 收起：牌往下沉，夜色淡掉
export function closePass() {
  const b = box;
  if (!b) return false;
  box = null;
  b.style.pointerEvents = 'none';
  const pg = b.querySelector('.pass-page:not(.leaving)');
  if (pg) anim(pg, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px) rotate(2deg)', opacity: 0 }], 200, 'ease-in');
  anim(b, [{ opacity: 1 }, { opacity: 0 }], 260);
  later(260, () => b.remove());
  return true;
}
// 已經開著（一頁換下一頁、別處又叫了一次）就接著用，不先關再開
function open() {
  if (box) return box;
  box = h('div', { class: 'pass' + (isTurned() ? ' turn' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'pass-stage' },
      h('div', { class: 'pass-top' }, h('button', { class: 'pass-turn', onclick: turn }, turnIco(), h('span', {}, turnWord())), h('div', { class: 'pass-end' })),
      h('div', { class: 'pass-at' })));
  document.body.append(box);
  anim(box, [{ opacity: 0 }, { opacity: 1 }], 220);
  return box;
}
// 右上角：收起（回到桌面）/ 收回（傳閱到一半）/ 沒有。換了才換，淡進淡出
function setEnd(b, end) {
  const slot = b.querySelector('.pass-end'), old = slot.querySelector(':scope > :not(.leaving)');
  if ((old?.dataset.k || null) === (end?.k || null)) { if (old) old.onclick = end.onclick; return; }
  if (old) { old.classList.add('leaving'); anim(old, [{ opacity: 1 }, { opacity: 0 }], 160); later(160, () => old.remove()); }
  if (end) { const x = h('button', { class: 'pass-x', 'data-k': end.k, onclick: end.onclick }, end.label); slot.append(x); anim(x, [{ opacity: 0 }, { opacity: 1 }], 220); }
}

const btn = (text, onclick, cls = '') => h('button', { class: 'btn big pass-go ' + cls, onclick }, text);
// 一頁：牌（頂邊小籤上是給說書人的話，牌上是給玩家看的東西），按鈕在牌下面
const page = (say, body, acts) => h('div', { class: 'pass-page' },
  h('div', { class: 'pc pass-card' }, say && h('div', { class: 'ic-tag pass-say' }, say), h('div', { class: 'pass-body' }, body)),
  h('div', { class: 'pass-acts' }, acts));
// 換一頁：way 'flip' 原地翻面（同一個人從「交給你」翻到角色），'next' 舊的往左滑走、新的從右邊進來；第一頁從下面升上來。
// 位移按頁自己的寬度算：橫屏時整屏轉過去了，滑的方向跟著轉
function put(pg, way, end) {
  const b = box, at = b.querySelector('.pass-at'), old = at.querySelector(':scope > .pass-page:not(.leaving)');
  setEnd(b, end);
  if (old) old.classList.add('leaving');
  if (old && way === 'flip') {
    anim(old.querySelector('.pass-card'), [{ transform: 'perspective(900px) rotateY(0)' }, { transform: 'perspective(900px) rotateY(90deg)' }], 160, 'ease-in');
    anim(old.querySelector('.pass-acts'), [{ opacity: 1 }, { opacity: 0 }], 140, 'ease-in');
    later(160, () => {
      if (box !== b) return;
      old.replaceWith(pg);
      anim(pg.querySelector('.pass-card'), [{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0)' }], 200);
      anim(pg.querySelector('.pass-acts'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 240);
    });
  } else if (old) {
    anim(old, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-75%) rotate(-8deg)', opacity: 0 }], 260, 'ease-in');
    later(260, () => old.remove());
    at.append(pg);
    anim(pg, [{ transform: 'translateX(75%) rotate(8deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320, 'cubic-bezier(.2,.8,.3,1)');
  } else {
    at.append(pg);
    anim(pg, [{ transform: 'translateY(30%) rotate(4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 360, 'cubic-bezier(.2,.8,.3,1)');
  }
}
const FOLD = { k: 'fold', label: '收起', onclick: () => closePass() };

// ───── 牌上的內容：只放核心，大 ─────
const order = (s, ids) => [...new Set(ids)].filter(Boolean).sort((a, b) => s.seats.findIndex(x => x.id === a) - s.seats.findIndex(x => x.id === b));
// 一個大數字（鐘錶匠的步數、共情者的邪惡人數……）
export const bigNum = n => h('div', { class: 'big-num', style: { '--d': String(n).length } }, n);
// 大大的「是 / 否」，tone 是語義色
export const bigWord = (text, tone = '') => h('div', { class: 'big-word ' + tone, style: { '--c': [...String(text)].length } }, text); // --c 字數：兩個字的（瘋狂）按字數縮，不衝出牌
// 大座位號：按座位順序排（兩名玩家之一是誰，不能從先後看出來）
export const bigSeats = (s, ids) => { const l = order(s, ids); return h('div', { class: 'big-seats', style: { '--n': l.length } }, l.map(id => seatBadge(s, id))); };
// 大角色牌：牌上印著名字，牌夠大，下面不再寫一遍
export const bigRoles = ids => h('div', { class: 'big-roles' + (ids.length > 2 ? ' many' : ''), style: { '--n': ids.length } },
  ids.map(id => h('div', { class: 'big-tok' }, roleToken(id))));
// 帶字的陣營標籤 + 座位（瘋子看到的爪牙：爪牙 ② ⑤）
export const bigTeam = (s, k, ids) => h('div', { class: 'big-team' }, tag(k), ids?.length > 0 && bigSeats(s, ids));
// 一句話的結論：「① 是 惡魔」「② ⑤ 是 爪牙」——大座位號在前，「是」，陣營標籤在後，照著念就是給他的信息
export const bigIs = (s, ids, k) => h('div', { class: 'big-team big-is' }, bigSeats(s, ids), h('span', { class: 'bi-what' }, h('span', { class: 'bi-is' }, '是'), tag(k)));
// 惡魔的偽裝：先一句話說清這三張是什麼（認不出圖標的人也看得懂），再三張大牌
export const bigBluffs = ids => h('div', { class: 'big-bluffs' },
  h('p', { class: 'big-say' }, h('span', {}, '以下是不在場的可偽裝身份：'), ids.map(id => h('b', {}, ROLES[id]?.name || id))), bigRoles(ids)); // 名字之間的頓號在 show.css（英文是逗號）
// 一條信息的核心：m { n } / { yes, tone } / { seats, roles, team } / { terms }（間諜看的整本魔典，原樣放大）。
// 洗衣婦「② 或 ⑨ 是 圖書管理員」= 大的 ② ⑨ + 角色牌
export function bigCore(s, m) {
  if (!m) return null;
  if (m.n != null) return bigNum(m.n);
  if (m.yes != null) return bigWord(m.yes ? '是' : '否', m.tone);
  if (m.terms) return h('div', { class: 'big-frm' }, formula(s, m.terms, 'big'));
  return h('div', { class: 'big-stack' }, m.seats?.length > 0 && bigSeats(s, m.seats), m.team && h('div', { class: 'big-team' }, tag(m.team)), m.roles?.length > 0 && bigRoles(m.roles));
}

// 給說書人的話：給 ③ 看；給惡魔看偽裝
export const giveTo = (s, id) => id && ['給', seatBadge(s, id), '看'];
export const bluffSay = (s, id) => ['向惡魔', id && seatBadge(s, id), '展示可用的偽裝'];

// 給人看一組頁：pages [{ to 座位, say 小籤上的字（默認「給 N 看」，null 不要）, body }]，一頁一個人，「下一個」翻到下一頁。
// 最後一頁「看完了」回到桌面，這一步由說書人在卡上自己按「下一個」（展示完不自動往下走）；多頁時右上角「收起」中途回去
export function showPages(s, pages) {
  const list = pages.filter(Boolean);
  if (!list.length) return;
  open();
  const go = (i, way) => {
    const p = list[i], last = i === list.length - 1;
    const act = last ? btn('看完了', () => closePass()) : btn('下一個', () => go(i + 1, 'next'));
    put(page(p.say !== undefined ? p.say : giveTo(s, p.to), p.body, act), way, last ? null : FOLD);
  };
  go(0);
}

// 展示角色牌：一張或幾張（說書人從「展示身份」挑的角色、系統不認識的角色要告訴他的）
export const showRoles = (s, seatId, roles) => showPages(s, [{ to: seatId, body: bigRoles(roles) }]);
// 給他看一樣東西
export const showThing = (s, seatId, kids) => showPages(s, [{ to: seatId, body: kids }]);
// 惡魔偽裝：一句話 + 三張不在場的角色牌（和首夜惡魔那一頁同一個樣子，瘋子分不出來）
export const showBluffs = (s, seatId, bluffs) => showPages(s, [{ to: seatId, say: bluffSay(s, seatId), body: bigBluffs(bluffs) }]);

// 一張張翻牌給人看（傳閱身份、頂欄「展示角色卡」）：先蓋著，「翻開」再確認一次才翻，看完蓋上，最後交還說書人也確認一次。
// items：[{ seatId, role }]。有 seatId 的蓋著時寫「交給 ③ 名字」；沒有的是說書人隨手亮的一張角色牌，蓋著時是一枚背面朝上的牌
const who = (s, id) => h('div', { class: 'pass-who' }, seatBadge(s, id), h('b', {}, s.seats.find(x => x.id === id)?.name));
function passCards(s, items, onDone) {
  if (!items.length) return;
  open();
  // 「是我，翻開」「我是說書人」的二次確認：下面預留的一行淡進來，上面的按鈕不挪不換字
  const ask = on => e => e.currentTarget.closest('.pass-page').classList.toggle('asking', on);
  const sure = (q, yes, onYes) => h('div', { class: 'pass-ask' }, h('span', {}, q),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: ask(false) }, '不是'), h('button', { class: 'btn', onclick: onYes }, yes)));
  // cut：傳到一半說書人收回（沒傳完不記「已傳閱」，第 1 夜的傳閱卡還在，沒看的人用座位菜單單獨給他看）
  const hand = (i, way, cut) => {
    // 最後交還說書人：也要再確認一次（還在玩家手裏時點了，魔典就亮在他面前）
    if (i >= items.length) return put(page('交還說書人', h('div', { class: 'pass-ico' }, icon('book')),
      [btn('我是說書人', ask(true), 'ghost'), sure('確定是說書人本人？', '回到魔典', () => { closePass(); if (!cut) onDone?.(); })]), way, null);
    // 翻開前再確認一次（設備傳錯人、手滑都會亮出別人的牌）
    const seat = items[i].seatId && s.seats.find(x => x.id === items[i].seatId);
    const name = seat && (seat.name || `${s.seats.indexOf(seat) + 1} 號`);
    put(seat ? page('交給', who(s, seat.id), [btn('是我，翻開', ask(true)), sure(`確定是 ${name} 本人？`, '確定翻開', () => face(i))])
      : page('展示角色卡', h('div', { class: 'pass-tok' }, h('div', { class: 'token back' })), [btn('翻開', ask(true)), sure('確定翻開？', '確定翻開', () => face(i))]),
    way, { k: 'cut', label: '收回', onclick: () => hand(items.length, 'next', true) });
  };
  const face = i => {
    const r = ROLES[items[i].role], team = TEAMS[r.team];
    put(page(null, [h('div', { class: 'pass-tok' }, roleToken(r.id)), h('div', { class: 'pass-name', style: { '--team': team.color } }, r.name, h('small', {}, team.name)),
      h('p', { class: 'pass-ab' }, r.ability)], btn('看完了，蓋上', () => hand(i + 1, 'next'))), 'flip', null);
  };
  hand(0);
}
// 傳閱身份：ids 是要看的座位（按座位順序）。玩家看到的是他以為的角色（酒鬼看到的是鎮民）
export function passRoles(s, ids, onDone) {
  const list = ids.map(id => s.seats.find(x => x.id === id)).filter(x => x?.role);
  passCards(s, list.map(x => ({ seatId: x.id, role: x.fakeRole || x.role })), onDone);
}
// 說書人挑好的一張角色牌（頂欄「展示角色卡」；給某人看就帶上 seatId）：和傳閱身份一樣先蓋著、確認了再翻
export const passRoleCard = (s, role, seatId = null) => ROLES[role] && passCards(s, [{ seatId, role }]);
