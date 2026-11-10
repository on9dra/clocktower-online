// 整屏選角色：哲學家、侍臣、賭徒、麻臉巫婆、洗腦師的夜晚行動，展示身份，雜耍藝人公開猜，指定 / 更換角色，惡魔偽裝都用這一張。
// 一張從桌下抽出來的劇本單：按陣營分段，角色牌 + 名字；「詳細」時每個角色下面印著能力全文（記在本機）。
// 收起：紙推回桌下，只露出頂邊那張索引籤，點一下再抽出來；桌面整個看得見，座位照樣能點。
// 只改變了的地方：選中、在場這些狀態加減 class，換模式時角色牌從原位滑到新位置，不重建
import { h, roleToken, toast } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { tr } from './lang.js';

const MODE = 'botc.rp.detail';
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隱私模式 */ } },
};
let detail = store.get(MODE) === '1';
let cur = null; // 開著（或收著）的那一張
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 小箭頭：收起朝下，抽出來朝上
const chev = up => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico rp-chev');
  el.innerHTML = `<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/>`;
  return el;
};
const cross = () => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico');
  el.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>';
  return el;
};

export const rolePanelOpen = () => !!cur && !cur.gone;

// 開一張選角色的紙。opts：
//   key       同一個 key 再開：把收著的那張抽出來，不重建
//   tab       索引籤上的字（誰、做什麼），nodes
//   lead      紙頂上一行（這一步要選什麼），nodes，可以不給
//   roles     列出的角色
//   state     id => { on, in, off, why }：選中 / 在場 / 不能選（點了說 why）
//   pick      點了一個角色。返回 'stay' 時紙不收（偽裝連選）；sub(...) 換到第二頁
//   picked    () => id：索引籤上帶著已經選中的角色（收起時看得到選了什麼）
//   top       紙頂上額外的一排（偽裝的三個格子）
//   done      有這個就在底下放「完成」（連選的）
//   owned     卡片上的格子開的（夜晚行動）：沒有 ✕，關掉也不丟選擇
//   alive     () => bool：每次重繪後檢查，不成立就收走（這一步過了、換了房間）
//   onPaint   每次跟上狀態時順便調（偽裝的三格要跟著服務器補的隨機格子換）
export function rolePanel(opts) {
  if (cur && !cur.gone && cur.key === opts.key) { cur.opts = opts; cur.paint(); cur.expand(); return cur; }
  cur?.close();
  cur = build(opts);
  return cur;
}
// 每次重繪之後：這一步過了就收走，沒過就跟上最新狀態（只動 class）
export function syncRolePanel() {
  if (!cur || cur.gone) return;
  if (cur.opts.alive && !cur.opts.alive()) cur.close();
  else cur.paint();
}
export const closeRolePanel = () => { if (!cur || cur.gone) return false; cur.close(); return true; };

function build(opts) {
  const p = { key: opts.key, opts, gone: false, tiles: new Map(), subTiles: new Map() };
  const tile = (id, onPick, map) => {
    const r = ROLES[id];
    const b = h('button', { class: 'rp-role', 'data-id': id, style: { '--team': TEAMS[r.team]?.color }, onclick: () => onPick(id, b) },
      h('span', { class: 'rp-tk' }, roleToken(id, { size: 'sm' }), h('i', { class: 'rp-seal' }, '選')), h('b', { class: 'rp-name' }, r.name), h('span', { class: 'rp-ab' }, r.ability),
      h('i', { class: 'rp-tag' }));
    map.set(id, b);
    return b;
  };
  // 按陣營分段：段名豎著印在左邊的頁邊上，段與段之間一道細線
  const sheet = (roles, onPick, map) => Object.keys(TEAMS).map(t => [t, roles.filter(id => ROLES[id]?.team === t)]).filter(([, l]) => l.length)
    .map(([t, list]) => h('div', { class: 'rp-team', style: { '--team': TEAMS[t].color } }, h('b', { class: 'rp-tn' }, TEAMS[t].name),
      h('div', { class: 'rp-grid' }, list.map(id => tile(id, onPick, map)))));
  const choose = (id, b) => {
    const st = p.opts.state?.(id) || {};
    if (st.off) return toast(st.why || '這個角色不能選');
    const r = p.opts.pick(id);
    if (r === 'sub' || p.gone) return;
    if (r === 'stay') return void (b.classList.contains('on') && stamp(b)); // 連選：選上的蓋印，取消的淡掉
    stamp(b);
    setTimeout(() => p.close(), calm() ? 0 : 230); // 墨印落下再收走
  };
  p.main = h('div', { class: 'rp-page' }, sheet(opts.roles, choose, p.tiles));
  p.body = h('div', { class: 'rp-body' }, p.main);
  p.tabPick = h('span', { class: 'rp-tab-pick' });
  p.tab = h('button', { class: 'rp-tab', onclick: () => (p.tucked ? p.expand() : p.tuck()) },
    h('span', { class: 'rp-tab-t' }, opts.tab), p.tabPick, chev(false)); // 箭頭：開著朝下（收起），收著時轉過來朝上
  const modeTab = on => h('button', { class: 'rp-mode' + (detail === on ? ' on' : ''), 'data-on': on ? 1 : 0, onclick: () => setDetail(on) }, on ? '詳細' : '簡略');
  p.modes = [modeTab(false), modeTab(true)];
  p.head = h('div', { class: 'rp-head' }, h('div', { class: 'rp-lead' }, opts.lead),
    h('button', { class: 'btn sm ghost rp-fold', onclick: () => p.tuck() }, chev(false), '收起'),
    !opts.owned && h('button', { class: 'rp-x', title: '關閉', onclick: () => p.close() }, cross()));
  p.sheet = h('section', { class: 'rp-sheet', tabindex: -1 },
    h('div', { class: 'rp-tabs' }, p.tab, !opts.owned && h('button', { class: 'rp-tab rp-tab-x', title: '關閉', onclick: () => p.close() }, cross()),
      h('span', { class: 'rp-gap' }), p.modes),
    p.head, opts.top, p.body,
    opts.done && h('div', { class: 'rp-foot' }, h('button', { class: 'btn', onclick: () => p.close() }, opts.done)));
  p.el = h('div', { class: 'rp' + (detail ? ' detail' : '') + (opts.owned ? ' owned' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'rp-wash', onclick: () => p.tuck() }), p.sheet);

  p.paint = () => {
    const o = p.opts;
    for (const map of [p.tiles, p.subTiles]) for (const [id, b] of map) {
      const st = (map === p.subTiles ? p.subState : o.state)?.(id) || {};
      b.classList.toggle('on', !!st.on);
      b.classList.toggle('in', !!st.in);
      b.classList.toggle('off', !!st.off);
      const tag = st.off || st.in ? (st.tag || '在場') : '';
      const t = b.querySelector('.rp-tag');
      if (t.textContent !== tr(tag)) t.textContent = tr(tag);
    }
    const id = o.picked?.() || null;
    if (p.shownPick !== id) {
      p.shownPick = id;
      p.tabPick.replaceChildren(...(id ? [roleToken(id, { size: 'xs' })] : []));
    }
    o.onPaint?.();
  };
  p.tuck = () => {
    if (p.gone || p.tucked) return;
    p.tucked = true;
    p.el.classList.add('tucked');
    p.el.removeAttribute('aria-modal');
  };
  p.expand = () => {
    if (p.gone || !p.tucked) return;
    p.tucked = false;
    p.el.classList.remove('tucked');
    p.el.setAttribute('aria-modal', 'true');
    p.sheet.focus({ preventScroll: true });
  };
  p.close = () => {
    if (p.gone) return;
    p.gone = true;
    p.el.classList.add('gone');
    p.el.classList.remove('open');
    if (cur === p) cur = null;
    p.opts.onClose?.();
    setTimeout(() => p.el.remove(), calm() || document.hidden ? 0 : 320);
  };
  // 第二個問題（酒鬼以為自己是哪個鎮民……）：同一張紙翻到下一頁，←回來
  p.sub = (title, roles, state, onPick) => {
    p.subTiles = new Map();
    p.subState = state;
    const back = h('button', { class: 'btn sm ghost rp-back', onclick: () => turn(p.main, page, -1) }, '←');
    const page = h('div', { class: 'rp-page rp-sub' }, h('div', { class: 'rp-q' }, back, h('b', {}, title)),
      sheet(roles, (id, b) => { if (state?.(id)?.off) return toast(state(id).why || '這個角色不能選'); stamp(b); onPick(id); setTimeout(() => p.close(), calm() ? 0 : 230); }, p.subTiles));
    p.body.append(page);
    p.paint();
    turn(page, p.main, 1);
    return 'sub';
  };
  // 翻頁：舊的一頁往外滑走，新的一頁從另一邊進來（dir 1：往前翻）
  function turn(show, hide, dir) {
    show.getAnimations().forEach(a => a.cancel()); // 上次翻走時停在透明的那一幀，先放開
    show.hidden = false;
    show.classList.remove('out');
    hide.classList.add('out');
    const done = () => { hide.hidden = true; if (dir < 0) hide.remove(); };
    if (!calm()) {
      show.animate([{ translate: `${dir * 40}px 0`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
      hide.animate([{ translate: '0 0', opacity: 1 }, { translate: `${-dir * 40}px 0`, opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      setTimeout(done, 190); // 用定時器收尾：後台標籤頁不出幀時動畫的 finish 不會來
    } else done();
    p.body.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
    if (dir < 0) p.subTiles = new Map();
  }

  p.paint();
  document.body.append(p.el);
  // 已經選了的：紙抽出來時那個角色就在眼前（詳細時一屏放不下全部）
  const chosen = [...p.tiles.values()].find(b => b.classList.contains('on'));
  if (chosen) {
    const y = chosen.getBoundingClientRect().top - p.body.getBoundingClientRect().top + p.body.scrollTop;
    p.body.scrollTop = Math.max(0, y - p.body.clientHeight / 2 + chosen.offsetHeight / 2);
  }
  p.el.getBoundingClientRect(); // 先在桌下排好再抽出來，才有過渡
  p.el.classList.add('open');
  p.sheet.focus({ preventScroll: true });
  return p;
}

// 選中：墨印蓋下來
function stamp(b) {
  b.classList.add('on');
  if (calm()) return;
  b.querySelector('.rp-seal').animate([{ scale: 2.4, opacity: 0, rotate: '-18deg' }, { scale: 1, opacity: 1, rotate: '-8deg' }], { duration: 220, easing: 'cubic-bezier(.3,1.4,.5,1)' });
}

// 簡略 / 詳細：記在本機。換的時候先把能力那幾行淡掉，再讓角色牌從原位滑到新位置；看著的那個角色留在原處
function setDetail(on) {
  if (on === detail || !cur) return;
  detail = on;
  store.set(MODE, on ? '1' : '0');
  const p = cur;
  for (const b of p.modes) b.classList.toggle('on', !!+b.dataset.on === on);
  const page = [p.main, ...p.body.querySelectorAll('.rp-sub')].find(x => !x.hidden) || p.main;
  const tiles = [...page.querySelectorAll('.rp-role')], body = p.body;
  const go = () => {
    const top = body.getBoundingClientRect().top;
    const anchor = tiles.find(t => t.getBoundingClientRect().bottom > top + 6);
    const off = anchor ? anchor.getBoundingClientRect().top - top : 0;
    const parts = t => [t.querySelector('.rp-tk'), t.querySelector('.rp-name')];
    const was = new Map([...tiles.flatMap(parts), ...page.querySelectorAll('.rp-tn')].map(el => [el, el.getBoundingClientRect()]));
    p.el.classList.add('reflow'); // 段間細線先淡掉，牌落定了再出來
    clearTimeout(p.reflow);
    p.reflow = setTimeout(() => p.el.classList.remove('reflow'), calm() ? 0 : 320);
    p.el.classList.toggle('detail', on);
    p.el.classList.add('moded'); // 第一次打開時能力字是印在紙上的，不演；換模式時才淡進來
    if (anchor) body.scrollTop += anchor.getBoundingClientRect().top - top - off;
    if (calm()) return;
    const view = body.getBoundingClientRect();
    for (const [el, a] of was) {
      const b = el.getBoundingClientRect();
      if ((a.bottom < view.top && b.bottom < view.top) || (a.top > view.bottom && b.top > view.bottom)) continue; // 前後都在視口外的不演
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  };
  if (on || calm()) return go();
  // 回到簡略：能力字和行間虛線先淡掉（.unmode），再挪牌
  p.el.classList.add('unmode', 'reflow');
  setTimeout(() => { p.el.classList.remove('unmode'); if (detail === on && !p.gone) go(); }, 120);
}

// Esc：先回到上一頁；卡片上開的收起來（選擇還在），單獨開的直接關
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !cur || cur.gone || cur.tucked || e.isComposing || e.keyCode === 229) return;
  if (document.querySelector('.pass, .backdrop:not(.leaving), .popmenu:not(.leaving)')) return; // 上面還蓋著別的，先關那個
  e.preventDefault();
  e.stopImmediatePropagation();
  const sub = cur.body.querySelector('.rp-sub:not([hidden])');
  if (sub) return sub.querySelector('.rp-back').click();
  if (cur.opts.owned) cur.tuck(); else cur.close();
}, true);
