// 遮住身份：面對面玩時，旁邊的人瞄一眼手機就能看到你的角色。遮住後角色牌翻成背面，按住才看，鬆手又蓋上。
// 只在本機裁掉自己的那層私密信息（角色、得知的信息、偽裝、主人），公開的照常畫。設置記在本機（'1' 遮 / '0' 不遮）。
// 線下局（多設備）默認遮住、看完自動蓋上：夜裏發角色、收到信息時照常演出、面板亮著，過一會兒自己翻成背面。
// 白天、天亮時大家都睜著眼：新的私密東西不演出、不自己亮，只在牌背上亮一個紅點，按住才看。
// 線上局要自己點「遮住」，遮住後新信息也不演出，按住看的時候才亮出來。
// 亮著 / 按著都只屬於當時那個身份：換了身份（調試房間換座位、說書人代入視角）就全部作廢
import { fxIdle } from './fx.js';

const KEY = 'botc.veil', OPEN_MS = 8000;
let peeking = null; // 按著的那一次：{ end }
let open = null; // 自動亮著的那一段：{ until, who, night }。天亮了、換了身份就不算了
let timer = 0, arrival = 0, who = null, shown = null, last = null; // shown：上一次畫的是翻開的面板（按著或亮著）時，是哪個身份的
const seenAt = new Map(); // 房間+座位 -> { game, msg }：看過的最後一條私密消息的序號

const pref = ctx => ctx.ls.get(KEY);
export const veilOn = (ctx, s) => (pref(ctx) == null ? !!s?.offline : pref(ctx) === '1');
export const isPeeking = () => !!peeking;
// 這個身份是誰：房間 + 說書人 / 座位 + 代入的座位
const idOf = s => `${s.code}|${s.isSt ? 'st' : s.myId || ''}|${s.peek?.seatId || ''}`;
// 自動亮著：同一個身份、還是那一夜、沒到點
const autoOpen = s => !peeking && !!open && !!s && Date.now() < open.until && open.who === idOf(s) && s.phase === 'night' && s.night === open.night;
// 線下局新信息剛到、還亮著的那幾秒（hud.js 讓面板浮在桌面上，不把圓桌頂下去）
export const isAutoOpen = () => autoOpen(last);
export function setVeil(ctx, on) {
  ctx.ls.set(KEY, on ? '1' : '0');
  open = null;
  ctx.render();
}

// 只在遊戲中、自己有座位時遮：準備階段沒有角色，終局全場都翻開了
const applies = (ctx, s) => !!s && veilOn(ctx, s) && !s.isSt && !s.peek && !!s.myId && (s.phase === 'night' || s.phase === 'day' || s.phase === 'dawn');

// 換了身份：上一個身份亮著的、排著要亮的、按著的都收掉（按著的當作鬆手，不另外重畫：新狀態馬上就畫）
function forget() {
  arrival++;
  open = null;
  clearTimeout(timer);
  peeking?.end(false);
}

// 線下局：夜裏新的私密東西到了（發角色、信息）就亮一會兒，到點自己蓋上。剛連上 / 刷新 / 剛換過來的身份不算新的
export function noteArrival(ctx, s) {
  const id = idOf(s), came = id !== who;
  if (came && who) forget();
  who = id;
  if (s.isSt || s.peek || !s.myId) return;
  const key = `${s.code}.${s.myId}`, top = (list, f) => Math.max(0, ...list.filter(f).map(x => x.seq));
  const now = { game: s.gameId, msg: top(s.chat, m => m.info && m.to === s.myId) };
  const was = seenAt.get(key);
  seenAt.set(key, now);
  // 剛打開頁面、剛換成這個身份：當作都看過了；換了一局：新一局的角色就是新的。白天、天亮不自己亮（大家都睜著眼）
  // 只有新的信息（發角色、得知的信息）才亮：說書人替他選人的那一下演出沒帶來新東西，亮出來的面板上什麼新的都沒有
  if (came || !was || !applies(ctx, s) || !s.offline || s.phase !== 'night' || (was.game === now.game && now.msg <= was.msg)) return;
  // 這次狀態帶來的演出在這之後才排進隊列：等一拍，再等演出播完，面板才浮出來（不壓在落到座位上的答案上）
  const at = ++arrival;
  setTimeout(() => fxIdle().then(() => {
    const cur = ctx.live;
    // 又來了新的（以最後一次為準）、換了身份、演出播完時已經天亮：不亮
    if (at !== arrival || !cur || idOf(cur) !== id || cur.phase !== 'night') return;
    open = { until: Date.now() + OPEN_MS, who: id, night: cur.night };
    clearTimeout(timer);
    timer = setTimeout(() => ctx.render(), OPEN_MS + 30);
    ctx.render();
  }), 0);
}

// 蓋住後的狀態。forFx：給演出用的那份——線下局夜裏的演出照常放（叫醒他的那一下就是看的時候），
// 線上局、線下的白天只發給自己的演出換成空事件：序號照走（打開時不會補播），但不演出來
export function veiled(ctx, s, forFx) {
  if (forFx) { if (!applies(ctx, s) || (s.offline && s.phase === 'night')) return s; } else {
    last = s;
    const out = !applies(ctx, s), up = !out && (!!peeking || autoOpen(s)), id = idOf(s);
    if (shown === id && !up && !out) fold(); // 換了身份的不合（上一個人的面板連影子也不留），直接換成這個人的
    shown = up ? id : null;
    if (out || up) return s;
  }
  return {
    ...s, veiled: true, myRole: null, myWas: null, myAlign: null, master: null, bluffs: null,
    chat: s.chat.filter(m => !(m.info && m.to === s.myId)),
    fx: (s.fx || []).map(e => (e.aud === s.myId ? { seq: e.seq, aud: e.aud, k: 'veiled' } : e)),
  };
}

// 面板合上：翻開的那張（按住看 / 自動亮著）不是一下子沒了，原地縮回角色牌裏淡掉，同時牌背翻回來（hud.css veil-flip）。
// 在重畫之前留一份影子：影子是退場中的節點（leaving），差量更新不碰它
function fold() {
  const el = document.querySelector('#app > .game:not(.gone) .hud.peek:not(.leaving)');
  if (!el || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = el.cloneNode(true);
  g.removeAttribute('data-key');
  g.removeAttribute('data-exit');
  Object.assign(g.style, { position: 'absolute', inset: 'auto', left: el.offsetLeft + 'px', top: el.offsetTop + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px',
    margin: 0, pointerEvents: 'none', animation: 'none' });
  for (const c of g.querySelectorAll('[class]')) c.style.animation = 'none';
  g.classList.add('leaving');
  g.setAttribute('aria-hidden', 'true');
  el.after(g);
  // 播完再摘（第一幀晚到時不在半透明的時候一下子沒了）；後台標籤頁不出幀，定時器兜底
  g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.55)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
  setTimeout(() => g.remove(), 600);
}

// 按住看：鬆手、手指滑走、切到別的應用、換了身份都算放開。只認主鍵 / 第一根手指；按著時不彈長按菜單
export function startPeek(ctx, e, onPeek) {
  if (peeking || e.button > 0 || e.isPrimary === false) return;
  e.preventDefault();
  const end = (draw = true) => {
    if (peeking !== me) return;
    peeking = null;
    for (const [t, [k, f]] of offs) t.removeEventListener(k, f);
    if (draw) ctx.render();
  };
  const me = peeking = { end };
  // 夜數多了信息列表比屏幕長：按著往下拖（手指不用鬆開）、或者滾輪，翻到舊的幾夜
  const list = () => document.querySelector('#app > .game:not(.gone) .hud.peek:not(.leaving) .hud-list');
  let y = e.clientY;
  const offs = [[window, ['pointerup', () => end()]], [window, ['pointercancel', () => end()]], [window, ['blur', () => end()]], [document, ['visibilitychange', () => end()]],
    [window, ['pointermove', ev => {
      if (ev.pointerType === 'mouse' && !ev.buttons) return end(); // 鼠標在窗口外鬆開、鬆手的事件丟了：再動一下時已經沒按著，也算放開
      if (ev.pointerId !== e.pointerId) return;
      list()?.scrollBy(0, (ev.clientY - y) * 2);
      y = ev.clientY;
    }]],
    [window, ['wheel', ev => { const l = list(); if (l) { ev.preventDefault(); l.scrollBy(0, ev.deltaY); } }, { passive: false }]],
    [window, ['contextmenu', ev => ev.preventDefault()]]];
  for (const [t, [k, f, o]] of offs) t.addEventListener(k, f, o);
  onPeek?.();
  ctx.render();
}
