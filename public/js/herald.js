// 線下說書人：夜裏順序表輪到一個人自己的回合（服務端 step.turn），先整屏一張紙牌——「輪到 ③ 僧侶 行動了」+ 這個角色的能力，
// 讓說書人心裏有數要叫醒誰、這個角色做什麼。牌從進度條上這個角色的那一格升起來，確認後縮回那一格；
// 縮回去的同時桌上這一步的操作卡登場，行動的人頭頂掛一個慢慢跳的箭頭（town.js turnArrow）。
// 別人的能力臨時叫醒的（被洗腦、被換角色、理髮師死後的惡魔、心上人……）服務端不標 turn，不彈。
// 每個人每晚只彈一次：撤銷回去、重繪、這一步換了狀態都不再彈；刷新頁面時確認過的那一張也不再彈
import { h, roleToken } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { seatBadge, w } from './glyph.js';
import { nightHeld, sceneBusy, fxIdle } from './fx.js';
import { needPass } from './manual.js';
import { passOpen } from './pass.js';

let cur = null; // { key, ctx, phase: 'wait' | 'open' | 'leave', box, tok }
const seen = new Set();
const SS = 'botc.herald';
const stored = () => { try { return sessionStorage.getItem(SS); } catch { return null; } };
const store = key => { try { sessionStorage.setItem(SS, key); } catch { /* 隱私模式 */ } };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden;
const later = (ms, fn) => setTimeout(fn, calm() ? 0 : ms);
// 進度條的金線走到這一格、牌被拽一下之後，紙牌才從它身上升起來
const RISE_AFTER = 420;

// 現在是不是一個人自己的回合（線下說書人的夜晚）
function turnOf(s) {
  const step = s?.isSt && !s.peek && s.offline && s.phase === 'night' && s.st?.step;
  return step?.turn && step.seatId && ROLES[step.roleId] ? step : null;
}
const keyOf = (s, step) => `${s.code}:${s.gameId}:${s.night}:${step.roleId}:${step.seatId}`;

// 牌還沒收回去：桌上這一步的操作卡、選人、頭頂的箭頭都先不出（town.js、flow.js）
export const heraldHeld = () => !!cur && cur.phase !== 'leave';
// 先擺著的別的東西：入夜的「第 N 夜」、第 1 夜的傳閱身份、紅唇女郎接任的告知、整屏展示。它們收起後才輪到這一步
const ahead = ctx => nightHeld() || needPass(ctx) || !!ctx.state.st?.notice || passOpen();
// 頭頂掛箭頭的座位：和桌上這一步的操作卡同時出現
export const turnSeat = ctx => { const step = turnOf(ctx.state); return step && !heraldHeld() && !ahead(ctx) ? step.seatId : null; };

// 每次重繪前（app.js render）：輪到了新的一個人就扣住這一步，等一會兒再彈牌；這一步沒了（撤銷、天亮）就把牌收走
export function heraldSync(ctx) {
  const s = ctx.state, step = turnOf(s), key = step && keyOf(s, step);
  if (cur && cur.key !== key) drop();
  if (!step || cur || seen.has(key)) return;
  if (ahead(ctx)) return;
  seen.add(key);
  if (stored() === key) return; // 刷新之前已經確認過
  const mine = cur = { key, ctx, phase: 'wait' };
  // 擋操作的演出還在播（或排著）：播完再上。不等 requestAnimationFrame：頁面不出幀的時候（窗口被擋住）它不來，這一步就一直扣著
  later(RISE_AFTER, () => fxIdle().then(() => {
    const now = turnOf(ctx.state);
    if (cur === mine && now && keyOf(ctx.state, now) === key) open(mine, now);
  }));
}

// 一枚小印章：他真正的角色不是這個（酒鬼、瘋子、提線木偶、拿了能力的哲學家），或者今晚中毒 / 醉酒
function stamps(s, step) {
  const seat = s.seats.find(x => x.id === step.seatId), tags = seat?.tags || [], out = [];
  if (seat?.role && seat.role !== step.roleId && ROLES[seat.role]) out.push([ROLES[seat.role].name, ['drunk', 'lunatic', 'marionette'].includes(seat.role) ? '' : 'gray']);
  if (tags.includes('中毒')) out.push(['中毒', 'poison']);
  else if (tags.includes('醉酒')) out.push(['醉酒', 'brass']);
  return out.length > 0 && h('div', { class: 'hd-why' }, out.map(([t, k]) => h('span', { class: 'ink-stamp ' + k }, t)));
}

// 進度條上這個角色的那一格（瘋子以為自己是哪個惡魔，就是那個惡魔的格子）；滾出條外、條沒畫出來就沒有
function slotRect(rid) {
  const el = document.querySelector(`.prog .pg-it[data-key="r-${rid}"]`) || document.querySelector('.prog .pg-it.now');
  const roll = el?.closest('.pg-roll');
  if (!el || !roll) return null;
  const r = el.getBoundingClientRect(), v = roll.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  return r.width && x >= v.left && x <= v.right && y >= v.top && y <= v.bottom ? { el, r } : null;
}
// 一枚角色牌在紙牌上的位置（big）和進度條的格子（small）之間飛，中途往上拱一點。牌按紙牌上的大小畫（名字的字號一樣），縮放到格子那麼小
function fly(box, rid, big, small, out, ms, easing) {
  const el = h('div', { class: 'hd-fly', style: { left: big.left + 'px', top: big.top + 'px', width: big.width + 'px', height: big.height + 'px' } }, roleToken(rid));
  box.append(el);
  const dx = small.left + small.width / 2 - (big.left + big.width / 2), dy = small.top + small.height / 2 - (big.top + big.height / 2), k = small.width / big.width;
  const far = `translate(${dx}px, ${dy}px) scale(${k})`, mid = `translate(${dx * 0.5}px, ${dy * 0.5 - 46}px) scale(${(k + 1) / 2})`;
  const path = [{ transform: far }, { transform: mid, offset: 0.5 }, { transform: 'none' }];
  el.animate(out ? path.reverse() : path, { duration: ms, easing, fill: 'both' });
  return el;
}

function open(c, step) {
  const s = c.ctx.state, r = ROLES[step.roleId];
  const tok = h('div', { class: 'hd-tok' }, roleToken(step.roleId), stamps(s, step));
  const say = h('div', { class: 'hd-say' }, w('輪到'), seatBadge(s, step.seatId, 'lg'), h('b', { class: 'hd-role', style: { '--team': TEAMS[r.team]?.color } }, r.name), w('行動了'));
  const ab = h('p', { class: 'hd-ab' }, r.ability);
  const card = h('div', { class: 'pc cal hd-card' }, tok, say, ab);
  const go = h('button', { class: 'btn big hd-go', onclick: () => close(c) }, '確認');
  const wash = h('div', { class: 'hd-wash' });
  const box = h('div', { class: 'herald', role: 'dialog', 'aria-modal': 'true' }, wash, h('div', { class: 'hd-stage' }, card, go));
  document.body.append(box);
  Object.assign(c, { phase: 'open', box, tok, rid: step.roleId });
  if (calm()) return;
  const ease = 'cubic-bezier(.2, .8, .3, 1)';
  wash.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  // 字和按鈕等牌立住了再淡進來
  for (const [el, d] of [[say, 300], [ab, 380], [go, 440]]) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: d, easing: 'ease-out', fill: 'backwards' });
  const from = slotRect(step.roleId);
  if (!from) { // 沒有那一格：和別的紙牌一樣從下面滑上來
    card.animate([{ transform: 'translateY(55vh) rotate(4deg)', opacity: 0 }, { transform: 'translateY(-8px) rotate(-1deg)', opacity: 1, offset: 0.75 }, { transform: 'rotate(-1deg)', opacity: 1 }],
      { duration: 440, easing: ease });
    return;
  }
  // 從那一格升起來：角色牌從格子裏飛出來放大，紙牌在它身後跟著撐開
  const face = tok.firstElementChild, to = face.getBoundingClientRect(), cr = card.getBoundingClientRect();
  const dx = from.r.left + from.r.width / 2 - (cr.left + cr.width / 2), dy = from.r.top + from.r.height / 2 - (cr.top + cr.height / 2);
  face.style.visibility = 'hidden';
  const sp = fly(box, step.roleId, to, from.r, false, 520, ease);
  card.animate([{ transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scale(.55) rotate(3deg)`, opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: 'rotate(-1deg)', opacity: 1 }],
    { duration: 480, easing: ease });
  later(520, () => { face.style.visibility = ''; sp.remove(); });
}

// 確認：牌縮回進度條上那一格。縮到一半就把桌上這一步放出來（操作卡、箭頭各自登場），牌落進格子時那一格跳一下
function close(c) {
  if (c.phase !== 'open') return;
  c.phase = 'leave';
  store(c.key);
  const box = c.box, card = box.querySelector('.hd-card'), wash = box.querySelector('.hd-wash');
  box.style.pointerEvents = 'none';
  const done = () => { if (cur === c) cur = null; };
  const free = () => { done(); c.ctx.render(); };
  if (calm()) { box.remove(); free(); return; }
  const face = c.tok.firstElementChild, at = face.getBoundingClientRect(), to = slotRect(c.rid);
  box.querySelector('.hd-go').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
  wash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'ease-in', fill: 'forwards' });
  if (!to) {
    card.animate([{ transform: 'rotate(-1deg)', opacity: 1 }, { transform: 'translateY(30vh) rotate(3deg)', opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    later(240, free);
    later(480, () => box.remove());
    return;
  }
  const cr = card.getBoundingClientRect();
  const dx = to.r.left + to.r.width / 2 - (cr.left + cr.width / 2), dy = to.r.top + to.r.height / 2 - (cr.top + cr.height / 2);
  face.style.visibility = 'hidden';
  // 角色牌按格子的大小畫，從紙牌上的位置（放大著）一路縮進格子
  const sp = fly(box, c.rid, at, to.r, true, 560, 'cubic-bezier(.45, 0, .3, 1)');
  card.animate([{ transform: 'rotate(-1deg)', opacity: 1 }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scale(.55) rotate(3deg)`, opacity: 0 }],
    { duration: 340, easing: 'ease-in', fill: 'forwards' });
  later(260, free);
  later(560, () => {
    sp.remove();
    box.remove();
    // 落進格子：那一格輕輕跳一下（重繪過的話量的是新的那個節點）
    const el = slotRect(c.rid)?.el;
    el?.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
  });
}

// 這一步沒了（撤銷、別處推進、天亮）：牌直接淡掉，不往格子裏縮
function drop() {
  const c = cur;
  cur = null;
  if (!c?.box) return;
  const box = c.box;
  box.style.pointerEvents = 'none';
  if (calm()) return box.remove();
  box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
  setTimeout(() => box.remove(), 220);
}

// 離開房間、換局：什麼都不留
export function resetHerald() {
  if (cur?.box) cur.box.remove();
  cur = null;
}
