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
  return el;
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
  for (const n of [...a.childNodes]) if (n.nodeType === 1 && n.hasAttribute('data-key') && !keys.has(n.getAttribute('data-key'))) n.remove();
  // 新樹在中間插進一個帶 key 的節點：直接插進去，後面已有的節點不重建（不重播入場動畫）
  kids.forEach((k, i) => {
    const old = a.childNodes[i], ok = old?.nodeType === 1 && old.getAttribute('data-key');
    if (old && ok && k.nodeType === 1 && k.getAttribute('data-key') !== ok && keys.has(ok)) a.insertBefore(k, old);
    else if (old) morph(old, k);
    else a.append(k);
  });
  while (a.childNodes.length > kids.length) a.lastChild.remove();
}

export function toast(msg, ms = 2200) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

let openModal = null;
export function modal(title, body, { wide = false } = {}) {
  closeModal();
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') },
    h('div', { class: 'modal-head' }, h('span', {}, title),
      h('button', { class: 'icon-btn', onclick: closeModal, title: '關閉' }, '✕')),
    h('div', { class: 'modal-body' }, body));
  const back = h('div', { class: 'backdrop', onclick: e => { if (e.target === back) closeModal(); } }, box);
  document.body.append(back);
  openModal = back;
  return box;
}
export function closeModal() { if (openModal) { openModal.remove(); openModal = null; } }

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
      class: it.danger ? 'danger' : '',
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
  if (openMenu) { openMenu.remove(); openMenu = null; }
}

// 角色圓形標記（不使用官方圖片，按陣營配色）
export function roleToken(roleId, { size = 'md', onclick } = {}) {
  const role = ROLES[roleId];
  if (!role) return h('div', { class: `token ${size} empty`, onclick });
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', ICON_VIEWBOX);
  icon.setAttribute('class', 'token-icon');
  icon.innerHTML = ICONS[roleId] || '';
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
