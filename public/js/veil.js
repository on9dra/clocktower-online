// 遮住身份：面對面玩時，旁邊的人瞄一眼手機就能看到你的角色。遮住後角色牌翻成背面，按住才看，鬆手又蓋上。
// 只在本機裁掉自己的那層私密信息（角色、得知的信息、偽裝、猜測和備註），公開的照常畫。設置記在本機（'1' 遮 / '0' 不遮）。
// 線下局（多設備）默認遮住、看完自動蓋上：發角色、收到信息時照常演出、面板亮著，過一會兒自己翻成背面。
// 線上局要自己點「遮住」，遮住後新信息也不演出，按住看的時候才亮出來
import { fxIdle } from './fx.js';

const KEY = 'botc.veil', OPEN_MS = 8000;
let peeking = false, openUntil = 0, timer = 0;
const seenAt = new Map(); // 房間+座位 -> { game, msg, fx }：看過的最後一條私密消息、演出的序號

const pref = ctx => ctx.ls.get(KEY);
export const veilOn = (ctx, s) => (pref(ctx) == null ? !!s?.offline : pref(ctx) === '1');
export const isPeeking = () => peeking;
// 線下局新信息剛到、還亮著的那幾秒（hud.js 讓面板浮在桌面上，不把圓桌頂下去）
export const isAutoOpen = () => !peeking && Date.now() < openUntil;
export function setVeil(ctx, on) {
  ctx.ls.set(KEY, on ? '1' : '0');
  openUntil = 0;
  ctx.render();
}

// 只在遊戲中、自己有座位時遮：準備階段沒有角色，終局全場都翻開了
const applies = (ctx, s) => !!s && veilOn(ctx, s) && !s.isSt && !s.peek && !!s.myId && (s.phase === 'night' || s.phase === 'day' || s.phase === 'dawn');

// 線下局：新的私密東西到了（發角色、信息）就亮一會兒，到點自己蓋上。剛連上 / 刷新不算新的
export function noteArrival(ctx, s) {
  if (s.isSt || s.peek || !s.myId) return;
  const key = `${s.code}.${s.myId}`, last = (list, f) => Math.max(0, ...list.filter(f).map(x => x.seq));
  const now = { game: s.gameId, msg: last(s.chat, m => m.info && m.to === s.myId), fx: last(s.fx || [], e => e.aud === s.myId) };
  const was = seenAt.get(key);
  seenAt.set(key, now);
  // 剛打開頁面：當作都看過了；換了一局：新一局的角色就是新的
  if (!was || !applies(ctx, s) || !s.offline || (was.game === now.game && now.msg <= was.msg && now.fx <= was.fx)) return;
  // 這次狀態帶來的演出在這之後才排進隊列：等一拍，再等演出播完，面板才浮出來（不壓在落到座位上的答案上）
  const at = ++arrival;
  setTimeout(() => fxIdle().then(() => {
    if (at !== arrival) return; // 又來了新的：以最後一次為準
    openUntil = Date.now() + OPEN_MS;
    clearTimeout(timer);
    timer = setTimeout(() => ctx.render(), OPEN_MS + 30);
    ctx.render();
  }), 0);
}
let arrival = 0;

// 蓋住後的狀態。forFx：給演出用的那份——線下局的演出照常放（那一下就是看的時候），
// 線上局只發給自己的演出換成空事件：序號照走（打開時不會補播），但不演出來
export function veiled(ctx, s, forFx) {
  if (!applies(ctx, s)) return s;
  if (forFx ? s.offline : peeking || Date.now() < openUntil) return s;
  return {
    ...s, veiled: true, myRole: null, myWas: null, myAlign: null, master: null, bluffs: null,
    chat: s.chat.filter(m => !(m.info && m.to === s.myId)),
    fx: (s.fx || []).map(e => (e.aud === s.myId ? { seq: e.seq, aud: e.aud, k: 'veiled' } : e)),
  };
}

// 按住看：鬆手、手指滑走、切到別的應用都算放開
export function startPeek(ctx, e, onPeek) {
  if (peeking) return;
  e.preventDefault();
  peeking = true;
  onPeek?.();
  ctx.render();
  const end = () => {
    if (!peeking) return;
    peeking = false;
    for (const [t, f] of offs) t.removeEventListener(f[0], f[1]);
    ctx.render();
  };
  const offs = [[window, ['pointerup', end]], [window, ['pointercancel', end]], [window, ['blur', end]], [document, ['visibilitychange', end]]];
  for (const [t, f] of offs) t.addEventListener(f[0], f[1]);
}
