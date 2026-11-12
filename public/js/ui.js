// 小型 DOM 工具：元素構造、差量更新、彈窗、浮動菜單、提示
import { ROLES, TEAMS } from './roles.js';
import { ICONS, ICON_VIEWBOX } from './icons.js';
import { tr } from './lang.js';

// 事件用屬性掛載（el.onclick = fn），差量更新時可以直接換成最新的處理函數
const EVENTS = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onmouseenter', 'onmouseleave', 'oncontextmenu', 'onpointerdown', 'onwheel', 'onfocus', 'onblur'];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el[k] = v;
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, x] of Object.entries(v)) if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x;
    } else el.setAttribute(k, v === true ? '' : k === 'placeholder' || k === 'title' || k === 'aria-label' ? tr(String(v)) : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(tr(String(kid))));
  }
  if (tag === 'button') label(el);
  return el;
}
// 按鈕的讀屏名字：只有圖標 / 符號的按鈕把 title 當作讀屏名字
function label(el) {
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
  // 要拿掉的先一起量好位置再拿：一張張量的話，前一張一離開排版，後一張已經挪了位（兩張並排的牌，右邊那張會擠到中間）
  const gone = [...a.childNodes].filter(n => n.nodeType === 1 && n.hasAttribute('data-key') && !keys.has(n.getAttribute('data-key')));
  const at = gone.map(n => n.hasAttribute('data-exit') && { l: n.offsetLeft, t: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight, was: n.getBoundingClientRect() });
  gone.forEach((n, i) => { if (at[i] && exit(n, at[i])) out.push(n); n.remove(); });
  out.forEach(n => n.remove());
  // 帶 key 的節點換了順序（兩個座位對調、列表重排）：把原來的節點挪過來，不重建（重建會重播入場動畫、丟掉輸入框裏的字）；
  // 新樹在中間插進一個新 key 的節點：直接插進去，後面已有的節點不動
  const byKey = new Map([...a.children].filter(n => n.hasAttribute('data-key')).map(n => [n.getAttribute('data-key'), n]));
  const moved = [];
  kids.forEach((k, i) => {
    const old = a.childNodes[i], ok = old?.nodeType === 1 && old.getAttribute('data-key'), kk = k.nodeType === 1 && k.getAttribute('data-key');
    const cur = kk && kk !== ok && byKey.get(kk);
    if (old && cur) { moved.push(keepAnims(cur)); a.insertBefore(cur, old); morph(cur, k); }
    else if (old && ok && kk !== ok && keys.has(ok)) a.insertBefore(k, old);
    else if (old) morph(old, k);
    else a.append(k);
  });
  while (a.childNodes.length > kids.length) a.lastChild.remove();
  moved.forEach(back => back());
  a.append(...out);
  // 父元素按內容居中的話（圓桌中央），少了這張牌它會挪位：把牌擺回屏幕上原來的地方。
  // 重繪之後外面還會再排一次版（fitTableCard 按新內容重新居中圓桌中央），畫出來之前再擺一次
  for (const n of out) if (n.was) {
    const was = n.was;
    n.was = null;
    pin(n, was);
    requestAnimationFrame(() => n.isConnected && pin(n, was));
  }
}
// 節點在 DOM 裏挪了位置，瀏覽器會把它身上（和裏面）的 CSS 動畫從頭再播一遍：挪之前記下進度，挪完接著原來的進度
function keepAnims(n) {
  const was = n.getAnimations ? n.getAnimations({ subtree: true }).filter(an => an.animationName).map(an => ({ el: an.effect?.target, name: an.animationName, t: an.currentTime })) : [];
  return () => {
    if (!was.length || !n.isConnected) return;
    for (const an of n.getAnimations({ subtree: true })) {
      const w = an.animationName && was.find(x => x.el === an.effect?.target && x.name === an.animationName);
      if (w && w.t != null) an.currentTime = w.t;
    }
  };
}
function pin(n, was) {
  const r = n.getBoundingClientRect();
  n.style.left = parseFloat(n.style.left) + was.left - r.left + 'px';
  n.style.top = parseFloat(n.style.top) + was.top - r.top + 'px';
}
// 帶 data-exit 的牌、面板從桌上拿掉時不是一下子沒了：原地定住、不再佔位，淡掉再摘
function exit(n, { l, t, w, h: ht, was }) {
  if (still() || document.hidden) return false;
  n.was = was;
  // animation: none：節點摘下再放回去會從頭重播樣式裏的入場動畫（牌又從下面斜著飛進來），量位置時就量歪了，牌往中間擠一下
  Object.assign(n.style, { position: 'absolute', inset: 'auto', left: l + 'px', top: t + 'px', width: w + 'px', height: ht + 'px', margin: 0, pointerEvents: 'none', animation: 'none' });
  for (const c of n.querySelectorAll('[class]')) c.style.animation = 'none'; // 裏面的牌也一樣，放回去時不重播入場
  n.classList.add('leaving');
  // 圓桌中間的牌收起 / 展開時（flow.js setFold）：牌縮進小紙條，小紙條撐開成牌
  // grow：往外散開淡掉（座位上的鎖定框換人時）
  const how = n.getAttribute('data-exit'), to = how === 'grow' ? { scale: 1.5 } : how !== 'fold' ? { translate: '0 12px' } : { scale: n.classList.contains('fold-stub') ? 1.4 : .25 };
  n.animate([{ opacity: 1 }, { opacity: 0, ...to }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
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
export const modalOpen = box => openModal === box.parentElement; // 這張彈窗還是開著的那張（沒關、沒被換掉）
// 紙抬起來淡掉，遮罩跟著退（fx.css）。換一張彈窗時舊的照樣這麼走，新的同時落下來
const dropModal =() => { if (openModal) { leaveDom(openModal, 220); openModal = null; } };
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
  // 分隔線：開頭、結尾和連在一起的只留一條（中間的項按條件沒出現時）
  items = items.filter(Boolean).filter((it, i, a) => it !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  if (!items.some(it => it !== '-')) return;
  const r = anchor.getBoundingClientRect();
  const el = h('div', { class: 'popmenu' },
    title && h('div', { class: 'popmenu-title' }, title),
    items.map(it => it === '-' ? h('hr') : h('button', {
      class: it.danger ? 'danger' : it.off ? 'off' : '',
      disabled: !!it.off,
      onclick: () => { closeMenu(); it.onclick(); },
    }, it.label)));
  // 比屏幕高的菜單（手機橫屏、矮窗口裏的說書人菜單）在菜單裏滾，最底下的「解散房間…」不會掉到屏幕外面點不到
  el.style.maxHeight = window.innerHeight - 16 + 'px';
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
  t.textContent = Array.from(tr(ROLES[roleId]?.name || ''))[0] || '';
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
  }, icon, h('span', { class: 'token-name' + nameFit(role.name), style: { zoom: enZoom(role.name) } }, role.name));
}
// 名字太長就縮小，不衝出圓圈：中文五個字以上（氣球駕駛員、魔鬼代言人）小一號；
// 英文按最長的單詞算（Fortune Teller 會在空格處折行，Investigator 這種長單詞折不了）
const isEn = (name, t) => t !== name && !/[\u3400-\u9fff]/.test(t);
function nameFit(name) {
  const t = tr(name);
  return !isEn(name, t) && [...t].length >= 5 ? ' long' : '';
}
// 英文按比例縮：最長的單詞 7 個字母以內不縮，再長按字母數反比縮小（各處字號不同，比例一樣）
function enZoom(name) {
  const t = tr(name);
  if (!isEn(name, t)) return null;
  const words = t.split(/\s+/), w = Math.max(...words.map(x => x.length));
  const z = Math.min(w > 7 ? 7 / w : 1, words.length > 1 ? 0.8 : 1); // 兩個詞會折成兩行，再小一點才不衝出圓圈底
  return z < 1 ? String(Math.round(z * 100) / 100) : null;
}

// 頁內確認框：ask('確定？', () => 執行)
export function ask(msg, onYes, yes = '確定') {
  modal('請確認', h('div', {},
    h('p', { style: { whiteSpace: 'pre-wrap', marginTop: 0 } }, msg),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn ghost', onclick: closeModal }, '取消'),
      h('button', { class: 'btn', onclick: () => { closeModal(); onYes(); } }, yes))));
}

export function prompt2(title, value, cb, { max = 16, placeholder = '' } = {}) {
  const input = h('input', { value: value || '', maxlength: max, placeholder });
  const go = () => { cb(input.value.trim()); closeModal(); };
  input.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) go(); };
  modal(title, h('div', { class: 'row' }, input, h('button', { class: 'btn', onclick: go }, '確定')));
  input.focus();
  input.select();
}

export const seatLabel = (state, id) => {
  const i = state.seats.findIndex(s => s.id === id);
  const x = state.seats[i];
  return i < 0 ? '?' : x.name ? `${i + 1}號 ${x.name}` : x.local ? `${i + 1}號` : `${i + 1}號 空座位`; // 單設備的座位可以不寫名字
};
