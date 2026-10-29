// 第一次打開：全屏介紹三頁（這本魔典和別家的不同 → 遊戲是什麼 → 一天怎麼過），像書一樣沿左邊翻頁，最後一頁進大廳。
// 看過就記在本機不再自動彈；大廳右上角「介紹」可以再打開
import { h, roleToken } from './ui.js';
import { icon } from './glyph.js';
import { tr } from './lang.js';

const KEY = 'botc.intro';
export const introSeen = ls => !!ls.get(KEY);

const NUM = '一二三';
const seal = n => h('span', { class: 'it-n' }, NUM[n]);
const head = (n, text) => h('header', { class: 'it-h' }, seal(n), h('h2', {}, text));
const tok = id => roleToken(id, { size: 'md' });
const sm = text => h('small', {}, text);

// 一 這本魔典：一行一件事，左邊是說書人自己做，右邊是這裏自動做的
const DIFF = [
  ['mask', '發角色', '手動擺牌', '一鍵按配比發好'],
  ['moon', '夜晚', '照清單逐個叫醒', '按順序自動叫醒'],
  ['send', '給信息', '自己算，容易給錯', '只列合規答案'],
  ['spark', '能力結算', '自己記、自己判', '自動判定'],
  ['hand', '數票', '說書人數', '時鐘自動數'],
  ['tap', '玩家', '等說書人轉告', '手機上自己選人、收信息'],
];
const cmpPage = () => h('section', { class: 'it-page' }, h('div', { class: 'it-body' },
  head(0, '說書人只管講故事'),
  h('div', { class: 'it-cmp' },
    h('span', { class: 'it-th' }), h('span', { class: 'it-th o' }, '別的線上魔典'),
    h('span', { class: 'it-th y' }, '這本魔典', h('b', { class: 'ink-stamp brass it-stamp' }, '自動')),
    DIFF.map(([ico, k, o, y], i) => [
      h('span', { class: 'it-k', style: { '--i': i } }, icon(ico), k),
      h('span', { class: 'it-o', style: { '--i': i } }, o),
      h('span', { class: 'it-y', style: { '--i': i } }, icon('check'), y)])),
  h('footer', { class: 'it-stub' }, h('span', {}, icon('tap'), '掃碼入座'), h('span', {}, icon('unlock'), '免註冊'), h('span', {}, icon('book'), '免費開源'))));

// 二 遊戲：兩個陣營、各自怎麼贏
const team = (k, name, sub, roles, win) => h('div', { class: 'it-team ' + k },
  h('h3', {}, name), sm(sub),
  h('div', { class: 'it-toks' }, roles.map((r, i) => h('span', { style: { '--i': i } }, tok(r)))),
  h('div', { class: 'it-win' }, h('span', { class: 'it-win-k' }, '獲勝'), win));
const gamePage = () => h('section', { class: 'it-page' }, h('div', { class: 'it-body' },
  head(1, '誰是惡魔？'),
  h('div', { class: 'it-facts' },
    h('span', {}, h('b', {}, '5–15'), '人'), h('span', {}, icon('quill'), '1 位說書人主持'), h('span', {}, icon('mask'), '角色保密，可以說謊')),
  h('div', { class: 'it-teams' },
    team('good', '善良', '鎮民、外來者', ['washerwoman', 'empath', 'monk', 'saint'], [icon('noose'), h('b', {}, '處決惡魔')]),
    h('span', { class: 'it-vs' }, 'VS'),
    team('evil', '邪惡', '爪牙、惡魔', ['poisoner', 'imp'], [icon('skull'), h('b', {}, '只剩 2 人存活')]))));

// 三 一天：四站一圈
const STOPS = [['moon', 'night', '夜晚', '依次醒來行動'], ['sun', 'sun', '天亮', '公佈昨夜死訊'], ['talk', '', '白天', '討論、提名'], ['noose', 'demon', '處決', '舉手投票，最多一人']];
const dayPage = () => h('section', { class: 'it-page' }, h('div', { class: 'it-body' },
  head(2, '一天怎麼過'),
  h('div', { class: 'it-loop' },
    STOPS.map(([ico, cls, name, sub], i) => h('div', { class: 'it-stop', style: { '--i': i } },
      h('span', { class: 'pc-seal ' + cls }, icon(ico)), h('b', {}, name), sm(sub))),
    h('div', { class: 'it-back' }, icon('reset'), h('b', {}, '再入夜'), sm('直到一方獲勝'))),
  h('footer', { class: 'it-stub' }, h('span', {}, icon('skull'), '死了還能說話'), h('span', {}, icon('ticket'), '留一張死亡票'))));

export function showIntro(ls) {
  if (document.querySelector('.intro')) return;
  const pages = [cmpPage(), gamePage(), dayPage()];
  let at = 0, busy = false, x0 = null;
  const stage = h('div', { class: 'it-stage' });
  const dots = pages.map((_, i) => h('button', { class: 'it-dot', title: `第 ${NUM[i]} 頁`, onclick: () => go(i) }, NUM[i]));
  const prev = h('button', { class: 'btn ghost it-prev', onclick: () => go(at - 1) }, '‹ 上一頁');
  const next = h('button', { class: 'btn primary it-next', onclick: () => (at < pages.length - 1 ? go(at + 1) : close()) });
  const root = h('div', { class: 'intro', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('介紹') },
    h('button', { class: 'it-skip', onclick: close }, '跳過'),
    stage,
    h('nav', { class: 'it-nav' }, prev, h('span', { class: 'it-dots' }, dots), next));

  // 翻到這頁：標題、印章、各行依次落下
  function show(i) {
    const p = pages[i];
    stage.replaceChildren(p);
    p.classList.remove('in'); void p.offsetWidth; p.classList.add('in');
    prev.classList.toggle('disabled', i === 0);
    next.textContent = tr(i < pages.length - 1 ? '下一頁 ›' : '進入大廳');
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }
  // 往後翻：當前頁沿左邊翻走，露出底下的下一頁；往前翻：上一頁從左邊翻回來蓋住當前頁
  function go(i) {
    if (busy || i === at || i < 0 || i >= pages.length) return;
    const fwd = i > at, cur = pages[at], nxt = pages[i], leaf = fwd ? cur : nxt;
    busy = true;
    nxt.classList.add('in');
    stage.replaceChildren(...(fwd ? [nxt, cur] : [cur, nxt]));
    leaf.classList.add('leaf');
    const open = { transform: 'rotateY(0deg)', filter: 'brightness(1)' }, gone = { transform: 'rotateY(-96deg)', filter: 'brightness(.82)' };
    const a = leaf.animate(fwd ? [open, gone] : [gone, open], { duration: 640, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' });
    const done = () => { if (!busy) return; busy = false; a.cancel(); leaf.classList.remove('leaf'); at = i; show(i); };
    a.onfinish = done;
    setTimeout(done, 900); // 後台標籤頁不出幀時直接翻完
  }
  function close() {
    ls.set(KEY, '1');
    document.removeEventListener('keydown', key, true);
    root.classList.add('out');
    setTimeout(() => root.remove(), 260);
  }
  function key(e) {
    if (e.isComposing) return;
    const k = { ArrowRight: 1, Enter: 1, ArrowLeft: -1, Escape: 0 }[e.key];
    if (k === undefined) return;
    e.preventDefault(); e.stopPropagation();
    if (k === 0) close(); else if (k > 0) next.click(); else go(at - 1);
  }
  // 手機左右滑
  stage.onpointerdown = e => { x0 = e.clientX; };
  stage.onpointerup = e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1)); };

  document.addEventListener('keydown', key, true);
  document.body.append(root);
  show(0);
  next.focus();
}
