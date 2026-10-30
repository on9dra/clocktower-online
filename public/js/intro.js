// 第一次打開：全屏介紹三頁（這本魔典和別家的不同 → 遊戲是什麼 → 一天怎麼過），疊成三張牌：下一頁把牌往左丟，上一頁拿回來，最後一頁進大廳。
// 看過就記在本機不再自動彈；大廳右上角「介紹」可以再打開
import { h, roleToken } from './ui.js';
import { icon } from './glyph.js';
import { tr, getLang } from './lang.js';
import { skyLife, townLife } from './ambient.js';
import { inkFilters } from './press.js';

const KEY = 'botc.intro';
export const introSeen = ls => !!ls.get(KEY);

const NUM = '一二三', BIG = '壹貳參';
const seal = n => h('span', { class: 'it-n' }, BIG[n]);
const head = (n, text) => h('header', { class: 'it-h' }, seal(n), h('h2', {}, text));
const tok = id => roleToken(id, { size: 'md' });
const sm = text => h('small', {}, text);
// 牌的四個角：左上、右下是角標（第幾張 + 這一張的花色），右上是打號機打的編號，一位一位高低不齊，左下是牌組名
const PIP = ['mask', 'skull', 'moon'];
const corner = (n, cls = '') => h('span', { class: 'it-corner ' + cls }, h('b', {}, BIG[n]), icon(PIP[n]));
const serial = n => h('span', { class: 'it-serial' }, 'Nº', [...`073${n + 1}`].map((c, i) => h('i', { style: { '--d': [0, 1, -1, .5][(i + n) % 4] + 'px' } }, c)));
// 一張牌：紙板本身是 it-page（厚度、陰影、光都在它身上），字印在 it-face 上，版痕蓋在上面
const card = (n, ...kids) => h('section', { class: 'it-page' },
  h('div', { class: 'it-face' }, h('div', { class: 'it-body' }, kids)),
  h('i', { class: 'it-plate' }),
  corner(n), corner(n, 'r'), serial(n), h('span', { class: 'it-imprint' }, '血染鐘樓 · 線上魔典'));

// 一 這本魔典：一行一件事，左邊是說書人自己做，右邊是這裏自動做的
const DIFF = [
  ['mask', '發角色', '手動擺牌', '一鍵按配比發好'],
  ['moon', '夜晚', '照清單逐個叫醒', '按順序自動叫醒'],
  ['send', '給信息', '自己算，容易給錯', '只列合規答案'],
  ['spark', '能力結算', '自己記、自己判', '自動判定'],
  ['hand', '數票', '說書人數', '時鐘自動數'],
  ['tap', '玩家', '等說書人轉告', '手機上自己選人、收信息'],
];
const cmpPage = () => card(0,
  head(0, '說書人只管講故事'),
  h('div', { class: 'it-cmp' },
    h('span', { class: 'it-th' }), h('span', { class: 'it-th o' }, '別的線上魔典'),
    h('span', { class: 'it-th y' }, '這本魔典', h('b', { class: 'ink-stamp brass it-stamp' }, '自動')),
    DIFF.map(([ico, k, o, y], i) => [
      h('span', { class: 'it-k', style: { '--i': i } }, icon(ico), k),
      h('span', { class: 'it-o', style: { '--i': i } }, o),
      h('span', { class: 'it-y', style: { '--i': i } }, icon('check'), y)])),
  h('footer', { class: 'it-stub' }, h('span', {}, icon('tap'), '掃碼入座'), h('span', {}, icon('unlock'), '免註冊'), h('span', {}, icon('book'), '免費開源')));

// 二 遊戲：兩個陣營、各自怎麼贏
const team = (k, name, sub, roles, win) => h('div', { class: 'it-team ' + k },
  h('h3', {}, name), sm(sub),
  h('div', { class: 'it-toks' }, roles.map((r, i) => h('span', { style: { '--i': i } }, tok(r)))),
  h('div', { class: 'it-win' }, h('span', { class: 'it-win-k' }, '獲勝'), win));
const gamePage = () => card(1,
  head(1, '誰是惡魔？'),
  h('div', { class: 'it-facts' },
    h('span', {}, h('b', {}, '5–15'), '人'), h('span', {}, icon('quill'), '1 位說書人主持'), h('span', {}, icon('mask'), '角色保密，可以說謊')),
  h('div', { class: 'it-teams' },
    team('good', '善良', '鎮民、外來者', ['washerwoman', 'empath', 'monk', 'saint'], [icon('noose'), h('b', {}, '處決惡魔')]),
    h('span', { class: 'it-vs' }, 'VS'),
    team('evil', '邪惡', '爪牙、惡魔', ['poisoner', 'imp'], [icon('skull'), h('b', {}, '只剩 2 人存活')])));

// 三 一天：四站一圈
const STOPS = [['moon', 'night', '夜晚', '依次醒來行動'], ['sun', 'sun', '天亮', '公佈昨夜死訊'], ['talk', '', '白天', '討論、提名'], ['noose', 'demon', '處決', '舉手投票，最多一人']];
const dayPage = () => card(2,
  head(2, '一天怎麼過'),
  h('div', { class: 'it-loop' },
    STOPS.map(([ico, cls, name, sub], i) => h('div', { class: 'it-stop', style: { '--i': i } },
      h('span', { class: 'pc-seal ' + cls }, icon(ico)), h('b', {}, name), sm(sub))),
    h('div', { class: 'it-back' }, icon('reset'), h('b', {}, '再入夜'), sm('直到一方獲勝'))),
  h('footer', { class: 'it-stub' }, h('span', {}, icon('skull'), '死了還能說話'), h('span', {}, icon('ticket'), '留一張死亡票')));

// 壓在底下時的散亂：轉角、橫移、豎移。翻到最上面收成一點點，字才好讀
const MESS = [[-.5, -3, -1], [1.7, 10, 4], [-2.4, -9, 8]];
// 丟到左邊的那一摞：轉角、豎移。橫向只露出右邊一條
const PILE = [[-8, 16], [-4.5, -10]];
const PILE_X = 'calc(-50vw - 50% + min(27vw - 27%, 90px))';
const TILT = 3; // 懸停按壓的最大傾角
const INK = ['paper', 'frame', 'block', 'rule-wenwu', 'rule-thin', 'rule-mid', 'perf']; // 牌面的印刷件
const THROW = 520, BACK = 500; // 丟出去、拿回來的時長
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pose = (s, rx = 0, ry = 0) => `translate(${s.x}, ${s.y}) rotate(${s.r}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;

// wait：等它兌現才開始發牌（第一次來要等開屏揭開）；after：收起時調（大廳的控件接著出來）
export function showIntro(ls, { wait, after } = {}) {
  if (document.querySelector('.intro')) return;
  inkFilters();
  const pages = [cmpPage(), gamePage(), dayPage()];
  let at = 0, busy = false, want = null, x0 = null, slid = false, rx = 0, ry = 0;
  const stage = h('div', { class: 'it-stage' });
  const dots = pages.map((_, i) => h('button', { class: 'it-dot', title: `第 ${NUM[i]} 頁`, onclick: () => go(i) }, NUM[i]));
  const prev = h('button', { class: 'btn ghost it-prev', onclick: () => go(at - 1) }, '‹ 上一頁');
  // 下一張；最後一張進大廳。牌還在飛時不算：連點兩下翻到最後一張，不能連最後一張都沒看到就關掉
  const ahead = () => { if (at < pages.length - 1) go(at + 1); else if (!busy) close(); };
  const next = h('button', { class: 'btn primary it-next', onclick: ahead });
  const root = h('div', { class: 'intro hold', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('介紹') },
    skyLife('night'),
    h('div', { class: 'lobby-town', 'aria-hidden': 'true' }, townLife()), // 和大廳同一個小鎮：開屏接過來、收起時交回去都不換景
    h('button', { class: 'it-skip', onclick: close }, '跳過'),
    stage,
    h('nav', { class: 'it-nav' }, prev, h('span', { class: 'it-dots' }, dots), next));

  // 這張牌現在該在桌上哪裏：丟掉的在左邊那摞，最上面的擺正，底下的散著
  function spot(i) {
    if (i < at) return { x: PILE_X, y: PILE[i][1] + 'px', r: PILE[i][0] };
    const [r, x, y] = MESS[i], k = i === at ? .3 : 1;
    return { x: x * k + 'px', y: y * k + 'px', r: r * k };
  }
  function lay(p, i) {
    const s = spot(i);
    p.style.setProperty('--x', s.x);
    p.style.setProperty('--y', s.y);
    p.style.setProperty('--r', s.r + 'deg');
    p.style.setProperty('--z', i < at ? 1 + i : 10 + at - i);
    p.classList.toggle('gone', i < at);
    p.setAttribute('aria-hidden', i !== at);
  }
  function nav(i) {
    prev.classList.toggle('disabled', i === 0);
    next.textContent = tr(i < pages.length - 1 ? '下一頁 ›' : '進入大廳');
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }
  // 懸停：鼠標按在哪，哪邊就往下陷。量未變形的盒子，牌傾斜時邊緣不會在鼠標底下進進出出
  function press(e) {
    if (e.pointerType !== 'mouse' || busy || calm()) return;
    const c = pages[at], box = stage.getBoundingClientRect();
    const nx = (e.clientX - box.left - c.offsetLeft) / c.offsetWidth * 2 - 1, ny = (e.clientY - box.top - c.offsetTop) / c.offsetHeight * 2 - 1;
    if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return ease();
    rx = -ny * TILT; ry = nx * TILT;
    c.style.setProperty('--rx', rx + 'deg');
    c.style.setProperty('--ry', ry + 'deg');
    c.style.setProperty('--nx', nx);
    c.style.setProperty('--ny', ny);
    c.classList.add('press');
  }
  function ease() {
    const c = pages[at];
    rx = ry = 0;
    ['--rx', '--ry', '--nx', '--ny'].forEach(k => c.style.removeProperty(k));
    c.classList.remove('press');
  }
  // 一張牌離開桌面飛過去：往後先往右蓄一下再甩到左邊，往前從左邊拿起來落到牌堆上。飛的時候略放大、影子拉開
  function fly(k, n, from, to, fwd, tilt) {
    const p = pages[k], ms = calm() ? 1 : fwd ? THROW : BACK, delay = n * 130;
    p.style.setProperty('--z', fwd ? 30 - n : 20 + n);
    const path = fwd ? [
      { transform: pose(from, ...tilt), easing: 'ease-out' },
      { transform: pose({ x: `calc(${from.x} + 18px)`, y: from.y, r: from.r + 1.6 }), offset: .18, easing: 'cubic-bezier(.3,.6,.15,1)' },
      { transform: pose(to) },
    ] : [
      { transform: pose(from), easing: 'cubic-bezier(.35,0,.25,1)' },
      { transform: pose({ x: `calc(${to.x} + 12px)`, y: to.y, r: to.r + 1 }), offset: .76, easing: 'ease-out' },
      { transform: pose(to) },
    ];
    const a = p.animate(path, { duration: ms, delay, fill: 'both' });
    const air = p.animate({ scale: [1, 1.035, 1], boxShadow: ['var(--lie)', 'var(--air)', 'var(--lie)'] }, { duration: ms, delay, easing: 'ease-in-out' });
    return new Promise(ok => {
      // 後台標籤頁不出幀時直接落定
      const end = () => { clearTimeout(t); a.cancel(); air.cancel(); p.classList.remove('fly'); lay(p, k); ok(); };
      const t = setTimeout(end, ms + delay + 300);
      a.onfinish = end;
    });
  }
  // 往後：牌堆頂的牌丟到左邊，底下那張擺正；往前：左邊那摞最上面的拿回來蓋住牌堆。點頁碼跳兩頁時連丟兩張
  function go(i) {
    if (i === at || i < 0 || i >= pages.length) return;
    if (busy) { want = i; return; } // 牌還在飛：記下最後一次操作，落定了接著做
    const fwd = i > at, was = at, from = pages.map((_, k) => spot(k)), tilt = [rx, ry];
    const moved = pages.map((_, k) => k).filter(k => k >= Math.min(i, was) && k < Math.max(i, was));
    if (!fwd) moved.reverse();
    busy = true;
    ease();
    moved.forEach(k => pages[k].classList.add('fly'));
    at = i;
    pages.forEach(lay);
    pages[i].classList.add('in');
    stage.classList.toggle('back', !fwd);
    nav(i);
    Promise.all(moved.map((k, n) => fly(k, n, from[k], spot(k), fwd, tilt))).then(() => {
      busy = false;
      stage.classList.remove('back');
      if (want != null) { const w = want; want = null; go(w); }
    });
  }
  function close() {
    ls.set(KEY, '1');
    document.removeEventListener('keydown', key, true);
    root.classList.add('out');
    after?.();
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
  stage.onpointerdown = e => { x0 = e.clientX; slid = false; };
  stage.onpointerup = e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; slid = Math.abs(dx) > 8; if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1)); };
  stage.onpointermove = press;
  stage.onpointerleave = ease;

  // 點牌堆翻下一張，點左邊那摞拿回來；滑動結束時瀏覽器也會補一次 click，不算。
  // 還在飛的牌不算那摞：連點兩下時第二下正好點在飛走的牌上，不能把它拉回來
  pages.forEach((p, i) => { lay(p, i); p.onclick = () => { if (slid) return; if (i < at && !p.classList.contains('fly')) go(at - 1); else ahead(); }; });
  stage.append(...pages);
  document.addEventListener('keydown', key, true);
  document.body.append(root);
  pages[0].classList.add('in');
  nav(0);
  next.focus();
  // 印刷件和字體到了才發牌，不然版框會在牌落定之後才冒出來；網絡慢時最多等 1.5 秒
  const printed = Promise.all([document.fonts.load(`900 1em "Press ${getLang().toUpperCase()}"`), ...INK.map(n => { const i = new Image(); i.src = `img/print/${n}.webp`; return i.decode(); })]).catch(() => {});
  Promise.all([wait, Promise.race([printed, new Promise(ok => setTimeout(ok, 1500))])]).then(() => root.classList.remove('hold'));
}
