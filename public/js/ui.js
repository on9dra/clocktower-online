// 小型 DOM 工具：元素構造、差量更新、彈窗、浮動菜單、提示
import { ROLES, TEAMS } from './roles.js';
import { ICONS, ICON_VIEWBOX } from './icons.js';
import { tr } from './lang.js';

// 事件用屬性掛載（el.onclick = fn），差量更新時可以直接換成最新的處理函數
const EVENTS = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onmouseenter', 'onmouseleave', 'oncontextmenu'];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el[k] = v;
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, x] of Object.entries(v)) if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x;
    } else el.setAttribute(k, v === true ? '' : k === 'placeholder' || k === 'title' ? tr(String(v)) : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(tr(String(kid))));
  }
  if (tag === 'button') label(el);
  return el;
}
// 按鈕的提示和讀屏名字：主操作（data-hot，回車觸發，見 app.js）懸停寫快捷鍵；只有圖標 / 符號的按鈕把 title 當作讀屏名字
function label(el) {
  if (el.hasAttribute('data-hot') && !el.title) el.title = tr('快捷鍵：回車');
  if (!el.hasAttribute('aria-label') && el.title && !/[\p{L}\p{N}]/u.test(el.textContent)) el.setAttribute('aria-label', el.title);
}

// 把頁面上已有的節點 a 更新成新構造的 b：盡量複用節點，保留焦點、滾動、輸入內容和正在播放的動畫
export function morph(a, b) {
  const same = a.nodeType === b.nodeType && a.nodeName === b.nodeName &&
    (a.nodeType !== 1 || a.getAttribute('data-key') === b.getAttribute('data-key'));
  if (!same) { a.replaceWith(b); return; }
  if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.nodeType !== 1) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const k of EVENTS) if (a[k] !== b[k]) a[k] = b[k];
  const kids = [...b.childNodes];
  // 帶 data-key 的子節點先刪掉新樹裏已經沒有的，後面的才能對上號（中間關掉一個浮窗，其他的不重建、不重播動畫）
  const keys = new Set(kids.map(k => k.nodeType === 1 && k.getAttribute('data-key')).filter(Boolean));
  // 正在退場的不參加比對，比完放回去
  const out = [...a.children].filter(n => n.classList.contains('leaving'));
  for (const n of [...a.childNodes]) if (n.nodeType === 1 && n.hasAttribute('data-key') && !keys.has(n.getAttribute('data-key'))) { if (exit(n)) out.push(n); n.remove(); }
  out.forEach(n => n.remove());
  // 新樹在中間插進一個帶 key 的節點：直接插進去，後面已有的節點不重建（不重播入場動畫）
  kids.forEach((k, i) => {
    const old = a.childNodes[i], ok = old?.nodeType === 1 && old.getAttribute('data-key');
    if (old && ok && k.nodeType === 1 && k.getAttribute('data-key') !== ok && keys.has(ok)) a.insertBefore(k, old);
    else if (old) morph(old, k);
    else a.append(k);
  });
  while (a.childNodes.length > kids.length) a.lastChild.remove();
  a.append(...out);
  // 父元素按內容居中的話（圓桌中央），少了這張牌它會挪位：把牌擺回屏幕上原來的地方
  for (const n of out) if (n.was) {
    const r = n.getBoundingClientRect();
    n.style.left = parseFloat(n.style.left) + n.was.left - r.left + 'px';
    n.style.top = parseFloat(n.style.top) + n.was.top - r.top + 'px';
    n.was = null;
  }
}
// 帶 data-exit 的牌、面板從桌上拿掉時不是一下子沒了：原地定住、不再佔位，淡掉再摘
function exit(n) {
  if (!n.hasAttribute('data-exit') || still() || document.hidden) return false;
  const { offsetLeft: l, offsetTop: t, offsetWidth: w, offsetHeight: ht } = n;
  n.was = n.getBoundingClientRect();
  Object.assign(n.style, { position: 'absolute', inset: 'auto', left: l + 'px', top: t + 'px', width: w + 'px', height: ht + 'px', margin: 0, pointerEvents: 'none' });
  n.classList.add('leaving');
  n.animate([{ opacity: 1 }, { opacity: 0, translate: '0 12px' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => n.remove(), 200);
  return true;
}

export function toast(msg, ms = 2200) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => leaveDom(el, 200), ms);
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 退場：加 .leaving 交給樣式演完再摘掉。用定時器收尾：後台標籤頁不出幀時動畫的 finish 不會來
export function leaveDom(el, ms) {
  if (still() || document.hidden) return el.remove();
  el.classList.add('leaving');
  setTimeout(() => el.remove(), ms);
}

let openModal = null;
// 彈窗中心飛到按鈕中心要走的位移和縮放
const toward = (box, el) => {
  const a = box.getBoundingClientRect(), b = el.getBoundingClientRect();
  return `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(${Math.max(b.width / a.width, 0.04)})`;
};
// from：從這個按鈕裏彈出來；away()：關掉時收進它返回的按鈕（讓人知道下次去哪裏打開）
export function modal(title, body, { wide = false, cls = '', from = null, away = null } = {}) {
  dropModal();
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') },
    h('div', { class: 'modal-head' }, h('span', {}, title),
      h('button', { class: 'icon-btn', onclick: closeModal, title: '關閉' }, '✕')),
    h('div', { class: 'modal-body' }, body));
  const back = h('div', { class: 'backdrop', onclick: e => { if (e.target === back) closeModal(); } }, box);
  back.away = away;
  document.body.append(back);
  openModal = back;
  if (from?.isConnected && !still()) box.animate([{ transform: toward(box, from) + ' rotate(-8deg)', opacity: .3 }, { transform: 'none', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(.2, .8, .3, 1)' });
  return box;
}
// 紙抬起來淡掉，遮罩跟著退（fx.css）。換一張彈窗時舊的照樣這麼走，新的同時落下來
const dropModal = () => { if (openModal) { leaveDom(openModal, 220); openModal = null; } };
export function closeModal() {
  const back = openModal, to = back?.away?.();
  if (!to?.isConnected || !to.offsetParent || still()) return dropModal();
  openModal = null;
  intoButton(back, to);
}
// 收進按鈕：彈窗縮小、斜著飛進按鈕，遮罩同時淡掉；落進去時按鈕彈一下、冒一圈黃銅線
function intoButton(back, to) {
  const box = back.firstElementChild, ms = 480;
  back.style.pointerEvents = 'none';
  box.animate([{ transform: 'none', opacity: 1 }, { transform: toward(box, to) + ' rotate(-10deg)', opacity: .35 }],
    { duration: ms, easing: 'cubic-bezier(.55, 0, .8, .25)', fill: 'forwards' });
  back.animate([{ backgroundColor: getComputedStyle(back).backgroundColor }, { backgroundColor: 'transparent' }], { duration: ms, fill: 'forwards' });
  // 用定時器收尾：後台標籤頁不出幀時動畫的 finish 不會來
  setTimeout(() => {
    back.remove();
    if (!to.isConnected) return;
    to.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 360, easing: 'ease-out' });
    const r = to.getBoundingClientRect();
    const ring = h('i', { class: 'land-ring', style: { left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px' } });
    document.body.append(ring);
    setTimeout(() => ring.remove(), 700);
  }, ms);
}

let openMenu = null;
// items: [{label, onclick, danger}]，'-' 為分隔線，假值會被忽略
export function menu(anchor, title, items) {
  closeMenu();
  items = items.filter(Boolean);
  if (!items.some(it => it !== '-')) return;
  const r = anchor.getBoundingClientRect();
  const el = h('div', { class: 'popmenu' },
    title && h('div', { class: 'popmenu-title' }, title),
    items.map(it => it === '-' ? h('hr') : h('button', {
      class: it.danger ? 'danger' : it.off ? 'off' : '',
      disabled: !!it.off,
      onclick: () => { closeMenu(); it.onclick(); },
    }, it.label)));
  document.body.append(el);
  const w = el.offsetWidth, ht = el.offsetHeight;
  el.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
  el.style.top = Math.max(8, Math.min(window.innerHeight - ht - 8, r.bottom + 4)) + 'px';
  openMenu = el;
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
}
function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
export function closeMenu() {
  document.removeEventListener('pointerdown', outside);
  if (openMenu) { leaveDom(openMenu, 130); openMenu = null; }
}

// 畫角色圖標：內置角色是圖，上傳的劇本裏的角色取名字的第一個字，和角色牌一樣的印章（名字是別人寫的，不能進 innerHTML）
export function fillIcon(el, roleId) {
  if (ICONS[roleId]) { el.innerHTML = ICONS[roleId]; return; }
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.textContent = tr(Array.from(ROLES[roleId]?.name || '')[0] || '');
  t.setAttribute('x', 256); t.setAttribute('y', 256);
  t.setAttribute('class', 'token-char');
  el.append(t);
}

// 角色圓形標記（不使用官方圖片，按陣營配色）
export function roleToken(roleId, { size = 'md', onclick } = {}) {
  const role = ROLES[roleId];
  if (!role) return h('div', { class: `token ${size} empty`, onclick });
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', ICON_VIEWBOX);
  icon.setAttribute('class', 'token-icon');
  fillIcon(icon, roleId);
  return h('div', {
    class: `token ${size} team-${role.team}`, onclick, title: `${role.name}：${role.ability}`,
    style: { '--team': TEAMS[role.team].color },
  }, icon, h('span', { class: 'token-name' }, role.name));
}

// 頁內確認框：ask('確定？', () => 執行)
export function ask(msg, onYes, yes = '確定') {
  modal('請確認', h('div', {},
    h('p', { style: { whiteSpace: 'pre-wrap', marginTop: 0 } }, msg),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn ghost', onclick: closeModal }, '取消'),
      h('button', { class: 'btn primary', onclick: () => { closeModal(); onYes(); } }, yes))));
}

export function prompt2(title, value, cb, { max = 16, placeholder = '' } = {}) {
  const input = h('input', { value: value || '', maxlength: max, placeholder });
  const go = () => { cb(input.value.trim()); closeModal(); };
  input.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
  modal(title, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: go }, '確定')));
  input.focus();
  input.select();
}

export const seatLabel = (state, id) => {
  const i = state.seats.findIndex(s => s.id === id);
  return i < 0 ? '?' : `${i + 1}號 ${state.seats[i].name || '空座位'}`;
};
