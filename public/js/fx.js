// 氛圍與演出：常駐的背景場景（天空、星星、小鎮剪影）+ 按服務端演出事件（state.fx）排隊播放的演出。
// 公共演出擋住操作，不能跳過，播完為止（只有頁面切到後台時直接跳到結尾，免得堆積）；例外是開局翻角色牌和「第 N 夜」紙牌（skippable），
// 點一下（或按 Esc / 空格 / 回車）跳到結尾。說書人魔典上的夜晚結算和自己的行動不擋操作（各角色的技能演出在 fx-ab.js）。
// 演出還沒播到的死亡先讓座位顯示活著（held），播到那一下再蓋「亡」章。
// 風格：平塗壓暗的桌面上一張米白紙牌，墨線印章蓋在牌上；不漸變、不發光。衝擊感靠節奏（一拍一拍砸下來）、印章和音效。
// 震屏省著用：只給全桌一起看、一天最多幾次的定局時刻（上處決台、處決、反噬、射殺、天亮的死者、接任惡魔、邪惡獲勝），一個時刻只震一下；
// 提名、平票、聊天、投票、計票、夜晚行動這些高頻或不擋操作的場合一律不震（shake 本身也只在擋操作的演出裏生效）
import { h, roleToken } from './ui.js';
import { skyLife, townLife } from './ambient.js';
import { tactile } from './tactile.js';
import { icon, roleIcon, seatBadge, gallows, ACTS } from './glyph.js';
import { play } from './sfx.js';
import { ROLES, TEAMS } from './roles.js';
import { setBgm } from './bgm.js';
import { burst, setBusy, setFireworks } from './fireworks.js';
import { EGG } from './score.js';

const recent = { died: new Map(), voted: new Map(), lock: new Map(), shot: new Map(), nom: 0, hud: 0, blkin: new Map(), blkret: new Map(),
  crown: 0, mvp: 0, egg: { at: 0, n: 0 } };
const held = new Set();
export const heldAlive = id => held.has(id);
// 提名演出還沒播完：審判牌和提名箭頭先不出，播完再落到桌上
let nomHold = 0;
export const nomHeld = () => nomHold > 0;
// 射空的演出還沒播完：射手座位上「射 N 號失敗」的標籤先不出，等「未中」章飛過去
const shotHold = new Set();
export const shotHeld = x => shotHold.has(x.from + '>' + x.to);
// 技能演出還沒播完：這條信息 / 行動先不進左上角面板，座位上也先不標（演出的答案飛進面板的那一下才出現）。msgShownAt：放出來的時刻（面板按它閃一下）
const msgHold = new Set(), msgShown = new Map();
export const msgHeld = m => msgHold.has(m.seq);
export const msgShownAt = m => msgShown.get(m.seq) || 0;
// 翻角色牌的演出還沒播完：左上角面板空著（虛線圈），等中間的牌飛進去；落定後名字和能力淡入（hudFx）
let roleHold = 0;
export const roleHeld = () => roleHold > 0;
export function hudFx() {
  const el = Date.now() - recent.hud;
  return el < 600 ? { '--fx-delay': `-${el}ms` } : null;
}
// 終局演出還沒播完：贏家頭上的皇冠、MVP 投票先不出；MVP 演出還沒播完：座位上的 MVP 標記先不出。播完的那一下落下來
// 入夜演出還沒播完：說書人的操作卡、玩家的選人牌先不出，等「第 N 夜」收起再落到桌上
let nightHold = 0;
export const nightHeld = () => nightHold > 0;
let winHold = 0, mvpHold = 0;
export const winHeld = () => winHold > 0;
export const mvpHeld = () => mvpHold > 0;
const since = (t, ms, cls) => { const el = Date.now() - t; return el < ms ? { cls, style: { '--fx-delay': `-${el}ms` } } : null; };
export const crownFx = () => since(recent.crown, 900, 'fx-crown');
export const mvpFx = () => since(recent.mvp, 700, 'fx-mvp');
// 頂欄的雞蛋數：結算演出裏雞蛋飛進去之前先顯示舊數（eggPending 是還沒飛到的），飛到時跳一下「+N」
let eggPending = 0;
export const shownEggs = n => Math.max(0, n - eggPending);
export const eggGainFx = () => { const f = since(recent.egg.at, 1300, 'fx-egg'); return f && { ...f, n: recent.egg.n }; };
// 開新局拉幕：幕布合上之前，桌面和側欄都停在上一局（frozen，app.js / demo.js 渲染時用它），
// 合上的那一刻在幕後換成新的一局，天色也直接換成夜晚（第一夜不演日落）
let frozen = null;
export const heldView = () => frozen;
function thaw() {
  if (!frozen) return;
  frozen = null;
  rerender();
}
// 背景的日夜（body[data-phase]）：入夜 / 天亮的演出接管時先不跟著狀態變，演出按節拍切（黃昏 → 夜、黎明 → 白天），播完再對齊
let skyHold = 0;
const sky = v => { document.body.dataset.phase = v === 'lobby' ? 'night' : v; }; // 開局前的房間也是夜色，和大廳接得上
function instantSky(v) {
  document.body.classList.add('sky-instant');
  sky(v);
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('sky-instant')));
}

// 第一份狀態：直接是當前的天色。從大廳來的先接上大廳的夜色，再慢慢轉到房間現在的天色
function firstSky(v) {
  const dark = !!document.querySelector('.lobby');
  instantSky(dark ? 'night' : v);
  if (dark) setTimeout(() => { if (!skyHold && lastState) sky(lastState.phase); }, 320);
}

// 處決台：台上的人坐到圓桌中間掛上絞刑架。台上的人變了：舊的飛回座位、新的飛到中間。
// 計票結果 / 處決演出還在播的時候，桌上先保持原樣（blkOverride），播完再換；處決演出期間中間不畫、座位空著（execId）
let blkOverride, execId = null, lastState = null;
export const liveBlock = s => (s.phase === 'day' && !s.dayOver && s.block ? s.block.nomineeId : null);
export const shownBlock = s => (execId ? null : blkOverride !== undefined ? blkOverride : liveBlock(s));
export const seatAway = (s, id) => id === execId || id === shownBlock(s) || !!fxFor('blkret', id, BLK_MS);
export const BLK_MS = 650;
export const execActive = () => !!execId;
function moveBlock(from, to) {
  const now = Date.now();
  if (from && from !== to && from !== execId) recent.blkret.set(from, now);
  if (to && to !== from) recent.blkin.set(to, now);
  setTimeout(rerender, BLK_MS + 30);
}
let prev = null, seen = 0, who = null, rerender = () => {};
export const setRender = fn => { rerender = fn; };

export function ensureScene() {
  if (document.getElementById('scene')) return;
  const L = (cls, ...kids) => h('div', { class: 'layer ' + cls }, kids);
  document.body.prepend(h('div', { id: 'scene', 'aria-hidden': 'true' },
    L('sky'), L('stars'), L('moon'), L('sun'), L('sun-disk'), skyLife(),
    L('skyline skyline-day', townLife()), L('skyline skyline-night', townLife()), L('candle')));
  tactile();
}

// 讓座位上的動畫在重繪後接著播：返回 class 和負的 animation-delay
export function fxFor(kind, id, dur) {
  const t = recent[kind].get(id);
  if (!t) return null;
  const el = Date.now() - t;
  if (el > dur) { recent[kind].delete(id); return null; }
  return { cls: 'fx-' + kind, style: { '--fx-delay': `-${el}ms` } };
}
export function nomFx() {
  const el = Date.now() - recent.nom;
  return el < 700 ? { '--fx-delay': `-${el}ms` } : null;
}
export const syncDelay = period => ({ '--fx-delay': `-${Date.now() % period}ms` });

// 計票時鐘每數過一人（桌面重繪時調用）：滴答一聲；舉了手的人，座位上的手章按下去
let clockAt = 0, clockK = 0;
export function clockFx(s, ck) {
  const c = s.nomination?.clock;
  if (!c || !ck) return;
  // 中途進來（重連 / 換視角）不補播已經數過的
  if (c.at !== clockAt) { clockAt = c.at; clockK = ck.k > 1 ? ck.k : 0; }
  const k = Math.min(ck.k, c.order.length);
  let up = null;
  for (; clockK < k; clockK++) {
    const id = c.order[clockK];
    up = !!s.nomination.votes[id];
    if (up) recent.lock.set(id, Date.now());
  }
  if (up !== null && !document.hidden) play(up ? 'tock' : 'tick');
}

// ———— 演出隊列 ————
const queue = [];
let running = false, cur = null, skipping = false;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stage = null;
function getStage() {
  if (!stage || !stage.isConnected) {
    stage = h('div', { id: 'stage', onclick: skipScene });
    document.body.append(stage);
  }
  return stage;
}
// 可以跳過的演出（翻角色牌、「第 N 夜」）：點舞台或按 Esc / 空格 / 回車，直接跳到這一幕的結尾（後面排著的照常播）
function skipScene() {
  if (!cur?.skippable || cur.skip) return false;
  cur.skip = cur.cut = true;
  cur.waits.splice(0).forEach(f => f());
  getStage().querySelector('.skip-hint')?.remove();
  return true;
}
document.addEventListener('keydown', e => {
  if (['Escape', ' ', 'Enter'].includes(e.key) && skipScene()) { e.preventDefault(); e.stopImmediatePropagation(); }
});
function enqueue(sc) { queue.push(sc); if (!running) runQueue(); }
async function runQueue() {
  running = true;
  while (queue.length) {
    const sc = queue.shift();
    // 說書人魔典上的一拍（lite）：排著的超過 3 段就不演了，免得一夜十幾個結算越積越多
    cur = { skip: skipping || reduced() || document.hidden || (sc.lite && queue.length >= 3), waits: [], block: !!sc.block, skippable: !!sc.skippable };
    const st = getStage();
    st.className = sc.block ? 'block' + (sc.skippable ? ' skippable' : '') : '';
    if (sc.skippable && !cur.skip) st.append(h('div', { class: 'skip-hint' }, icon('skip'), '跳過'));
    try { await sc.run(); } catch (e) { console.error(e); }
    (sc.holds || []).forEach(release);
    sc.after?.();
    // 點了跳過：牌和底色淡掉，不是一下子沒了
    if (cur.cut && !reduced() && !document.hidden) {
      st.animate([{ opacity: getComputedStyle(st).opacity }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
      await new Promise(r => setTimeout(r, 220));
    }
    st.getAnimations().forEach(a => a.cancel()); // fill: forwards 的淡出會一直留在舞台上
    st.replaceChildren();
    st.className = '';
    st.style.background = '';
  }
  running = false; cur = null; skipping = false;
  rerender();
}
setBusy(() => running && !!cur?.block); // 煙花不在擋操作的演出上面放
function skipAll() {
  skipping = true;
  if (cur) { cur.skip = true; cur.waits.splice(0).forEach(f => f()); }
  getStage().replaceChildren();
}
// 切到別的標籤頁時計時器會被瀏覽器放慢，演出會堆起來：頁面隱藏就直接跳到結束畫面
document.addEventListener('visibilitychange', () => { if (document.hidden && running) skipAll(); });
const wait = ms => (cur.skip ? Promise.resolve() : new Promise(r => {
  const t = setTimeout(r, ms);
  cur.waits.push(() => { clearTimeout(t); r(); });
}));
const anim = (el, frames, opts) => (cur.skip || !el ? null : el.animate(frames, typeof opts === 'number' ? { duration: opts, fill: 'forwards', easing: 'ease-out' } : { fill: 'forwards', ...opts }));
const sfx = (name, k) => !cur.skip && play(name, k);

// 座位牌在屏幕上的中心
function seatAt(id) {
  const el = document.querySelector(`.seat[data-key="${id}"] .token`);
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2, el: null };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, el };
}
// 舞台上的一個元素，中心放在 (x, y)，size 是邊長
function sprite(content, x, y, size, cls = '') {
  const el = h('div', { class: 'sp ' + cls, style: { left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px' } }, content);
  getStage().append(el);
  return el;
}
const center = (kids, cls = '') => { const el = h('div', { class: 'sc-center ' + cls }, kids); getStage().append(el); return el; };
const veil = (bg, ms = 400) => { const st = getStage(); st.style.background = bg; anim(st, [{ opacity: 0 }, { opacity: 1 }], ms); };
const fadeOut = (el, ms = 400) => anim(el, [{ opacity: 1 }, { opacity: 0 }], ms);
// 先藏起來，節拍到了再砸下來
const hide = (...els) => els.forEach(el => { if (el) el.style.opacity = 0; });

// ———— 紙牌演出的零件 ————
// 壓暗桌面的平塗底色
// dim：在桌面上演的（反噬、射殺），座位還要看得清
// dusk / dawn：入夜、天亮時只淡淡壓一層，讓後面天色的變化看得見
const WASH = { ink: '#2a2622c4', night: '#141826e0', good: '#16283cee', evil: '#2e0b0bee', dim: '#2a262280', light: '#2a262240', dusk: '#14182640', dawn: '#2a262230' };
function paperCard(kids, cls) {
  const card = h('div', { class: 'pc ' + cls }, kids);
  center(card);
  return card;
}
// 紙牌從下面滑上來 / 滑下去；緊接著上一張牌的用 cardPop 原地彈出
const cardIn = (card, ms = 420) => anim(card, [{ transform: 'translateY(55vh) rotate(4deg)', opacity: 0 }, { transform: 'translateY(-8px) rotate(-1deg)', opacity: 1, offset: 0.75 },
  { transform: 'rotate(-1deg)', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' });
const cardPop = card => anim(card, [{ transform: 'scale(.92) rotate(1deg)', opacity: 0 }, { transform: 'rotate(-1deg)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
const cardOut = card => anim(card, [{ transform: 'rotate(-1deg)', opacity: 1 }, { transform: 'translateY(30vh) rotate(3deg)', opacity: 0 }], { duration: 300, easing: 'ease-in' });
async function closeCard(card) { cardOut(card); fadeOut(getStage(), 320); await wait(320); }

// 大牌：知道角色就亮角色，否則是座位號空牌，下面一塊名牌
function bigToken(s, id, cls) {
  const i = s.seats.findIndex(x => x.id === id), seat = s.seats[i], r = seat?.role;
  return h('div', { class: 'sc-who ' + cls }, r ? roleToken(r) : h('div', { class: 'token md blank' }, i + 1),
    h('b', {}, `${i + 1}號 ${seat?.name || ''}`));
}
// 圓形印記：月亮、太陽、陣營
const seal = (glyph, tone) => h('div', { class: 'pc-seal ' + tone }, glyph);
// 紙片圓牌：飛的棋子、落在座位上的標記
const chip = (glyph, tone = '') => h('div', { class: 'fx-chip ' + tone }, glyph);
// 一圈墨線從元素中心向外散開；color 給陣營色這種不在 class 裏的顏色
function ring(parent, tone = '', to = 2.4, color) {
  const el = h('i', { class: 'ink-ring ' + tone, style: color ? { borderColor: color } : null });
  parent.append(el);
  anim(el, [{ transform: 'scale(.5)', opacity: 0.7 }, { transform: `scale(${to})`, opacity: 0 }], { duration: 520, easing: 'ease-out' });
}
// 「噔」：元素從大砸下來落定，默認沒有聲音；power 帶震屏
function beat(el, { sound, power = 0 } = {}) {
  el.style.opacity = 1;
  if (sound) sfx(sound);
  anim(el, [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(.94)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }],
    { duration: 230, easing: 'cubic-bezier(.4,0,.6,1)' });
  if (power) shake(power);
}
// 蓋章：從大到小砸下來，落定時一圈墨線向外散開；soft 是票數不足那種慢慢落下、不震。card 是章落在的那個元素
async function slamStamp(card, text, tone, { power = 0, sound = 'stamp', soft = false, color } = {}) {
  const st = h('div', { class: 'ink-stamp ' + tone, style: color ? { color } : null }, text);
  card.append(st);
  sfx(sound, soft ? 0.6 : 1);
  anim(st, soft
    ? [{ transform: 'translate(-50%,-50%) scale(1.5) rotate(-4deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 }]
    : [{ transform: 'translate(-50%,-50%) scale(3) rotate(-18deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.94) rotate(-6deg)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 }],
    { duration: soft ? 420 : 260, easing: soft ? 'ease-out' : 'cubic-bezier(.5,0,.7,1)' });
  await wait(soft ? 300 : 190);
  if (!soft) {
    if (power) shake(power);
    ring(card, tone, 2.4, color);
  }
  await wait(120);
}

let shakeEnd = 0;
function shake(power = 10) {
  // 不擋操作的演出（自己的行動、說書人魔典）不震；上一下還沒停穩不疊著震
  if (cur.skip || !cur.block || Date.now() < shakeEnd + 400) return;
  // 震的時候頁面會左右晃出邊，暫時藏掉橫向滾動條
  const els = [document.documentElement, document.body], until = shakeEnd = Date.now() + 500;
  els.forEach(el => { el.style.overflowX = 'hidden'; });
  setTimeout(() => { if (shakeEnd === until) els.forEach(el => { el.style.overflowX = ''; }); }, 520);
  const f = [0, 1, 2, 3, 4, 5].map(i => ({ transform: `translate(${(Math.random() - 0.5) * power * (1 - i / 6)}px, ${(Math.random() - 0.5) * power * (1 - i / 6)}px)` }));
  ['app', 'scene'].forEach(id => anim(document.getElementById(id), [...f, { transform: 'none' }], { duration: 480, fill: 'none' }));
}
// 挨了一下：牌一縮一彈（delay：等砸下來的那一拍落定）
const squash = (el, delay = 0) => anim(el, [{ transform: 'none' }, { transform: 'scale(.84) rotate(-8deg)', offset: 0.25 },
  { transform: 'scale(1.05) rotate(4deg)', offset: 0.6 }, { transform: 'none' }], { duration: 480, delay, fill: 'none' });
// 桌上座位的落點：一圈墨線散開；hard 時牌還要挨一下
function mark(id, tone = '', hard = false) {
  const { el, x, y } = seatAt(id), d = (el?.getBoundingClientRect().width || 70) * 1.15;
  if (hard) squash(el);
  const r = h('i', { class: 'ink-ring at ' + tone, style: { left: x + 'px', top: y + 'px', width: d + 'px', height: d + 'px', margin: `${-d / 2}px 0 0 ${-d / 2}px` } });
  getStage().append(r);
  anim(r, [{ transform: 'scale(.7)', opacity: 0.8 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 560, easing: 'ease-out' });
}
const hit = (id, tone) => mark(id, tone, true);
function release(id) {
  if (!held.delete(id)) return;
  recent.died.set(id, Date.now());
  rerender();
}

// 技能演出連著信物圖形有 50KB，大廳用不到：收到第一份對局狀態時才拉，拉到之前走通用演出
let AB = { act: () => null, grim: () => null, hasInfo: () => false, demon: () => {}, saint: () => {}, mayor: () => {}, ststamp: () => {} }, abPull = null;
function pullAb() {
  abPull ||= import('./fx-ab.js').then(m => { AB = m.abilityFx({ wait, anim, sfx, getStage, seatAt, release, skipping: () => !cur || cur.skip, ACT_ICONS: ACTS }); }, () => { abPull = null; });
}
// 座位上砸一枚大章，停一下縮成座位上的小章：座位自己的死因章接著落下（release）
async function seatStamp(id, text, { power = 0, sound } = {}) {
  const p = seatAt(id), pad = h('div', { class: 'seat-pad', style: { left: p.x + 'px', top: p.y + 'px' } });
  getStage().append(pad);
  await slamStamp(pad, text, 'red', { power, sound });
  await wait(520);
  anim(pad.querySelector('.ink-stamp'), [{ transform: 'translate(-50%,-50%) rotate(-7deg)', opacity: 1 },
    { transform: 'translate(-50%,-50%) rotate(-12deg) scale(.4)', opacity: 0 }], { duration: 240, easing: 'ease-in' });
  await wait(150);
  release(id);
  await wait(250);
}
// 通用的死亡（天亮公佈夜裏死的人）：不透露死法，牌挨一下、震一下，蓋「死亡」章
async function perish(id) {
  hit(id);
  await seatStamp(id, '死亡', { power: 12, sound: 'thud' });
}
// 閃電：從 a 劈到 b 的一道折線（金色，外面一圈紙色邊，深淺桌布上都看得清）
async function bolt(a, b) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'fx-bolt');
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = 7;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const off = i % n ? (i % 2 ? 1 : -1) * (12 + Math.random() * 12) : 0;
    return `${Math.round(a.x + dx * i / n + nx * off)},${Math.round(a.y + dy * i / n + ny * off)}`;
  }).join(' ');
  svg.innerHTML = `<polyline class="b-paper" points="${pts}"/><polyline class="b-ink" points="${pts}"/>`;
  getStage().append(svg);
  sfx('zap');
  for (const l of svg.querySelectorAll('polyline')) {
    const L = l.getTotalLength();
    l.style.strokeDasharray = L;
    anim(l, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 180, easing: 'ease-in' });
  }
  await wait(190);
  return svg;
}
// 箭沿直線從 a 射向 b，箭頭停在 b 中心前 stop 像素處（正數扎在牌上，負數飛過頭）
async function shoot(a, b, stop) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, size = 76, k = (len - stop - size * 0.44) / len;
  const el = sprite(h('div', { class: 'fx-arrow', style: { transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)` } }, icon('arrow')), a.x, a.y, size, 'shot');
  const to = `translate(${dx * k}px, ${dy * k}px)`;
  anim(el, [{ transform: 'translate(0,0)', opacity: 0 }, { transform: `translate(${dx * k * 0.12}px, ${dy * k * 0.12}px)`, opacity: 1, offset: 0.12 },
    { transform: to, opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)' });
  await wait(240);
  return { el, to };
}

// 叉子從上方刺下（說書人魔典上的夜殺，叉子裝在紙片圓牌裏，夜晚桌布上看得清）
async function stab(id) {
  const p = seatAt(id), size = 64;
  const fork = sprite(chip(icon('pitchfork'), 'evil'), p.x, p.y - size * 0.7, size, 'fork');
  anim(fork, [{ transform: 'translateY(-240px) rotate(180deg) scale(1.3)', opacity: 0 },
    { transform: 'translateY(-80px) rotate(180deg) scale(1.15)', opacity: 1, offset: 0.65 },
    { transform: 'translateY(0) rotate(180deg) scale(1)', opacity: 1 }], { duration: 540, easing: 'cubic-bezier(.6,0,.9,.6)' });
  await wait(540);
  sfx('stab'); sfx('thud'); hit(id);
  release(id);
  anim(fork, [{ transform: 'rotate(180deg)', opacity: 1 }, { transform: 'rotate(186deg) translateY(4px)', opacity: 1, offset: 0.2 },
    { transform: 'rotate(180deg) translateY(-30px)', opacity: 0 }], { duration: 600, delay: 260 });
  await wait(700);
}
// 棋子沿弧線從 a 飛到 b，落下時壓一下；返回它和終點位移（接著彈開 / 落空用）
async function fly(glyph, a, b, { size = 52, ms = 620, tone = '' } = {}) {
  const el = sprite(chip(glyph, tone), a.x, a.y, size);
  const dx = b.x - a.x, dy = b.y - a.y, lift = Math.min(140, Math.hypot(dx, dy) * 0.4);
  const frames = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return { offset: t, opacity: t ? 1 : 0,
      transform: `translate(${dx * t}px, ${dy * t - lift * 4 * t * (1 - t)}px) scale(${0.6 + 0.4 * t + 0.25 * Math.sin(Math.PI * t)})` };
  });
  anim(el, frames, { duration: ms, easing: 'ease-in-out' });
  await wait(ms);
  anim(el.firstChild, [{ transform: 'scale(1.3)' }, { transform: 'scale(.9)', offset: 0.6 }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
  return { el, dx, dy };
}

// 刀光斬卡：一道刀光斜著劈過 src（審判牌的拷貝，或一張提名紙牌），牌沿刀口乾淨地分成兩半，
// 頓一下（hitstop）後兩半沿刀口兩側猛地甩出畫面。返回時兩半剛飛出去，後面的演出可以緊接著砸下來
async function slash(src, rect) {
  // 刀口：從左下斜向右上，在牌的左右兩邊各交在 a%、b% 高度
  const a = 64 + Math.random() * 8, b = 26 + Math.random() * 8;
  const piece = (clip) => {
    const el = h('div', { class: 'fx-torn', style: { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
      clipPath: `polygon(${clip})`, transformOrigin: '50% 50%' } }, src.cloneNode(true));
    getStage().append(el);
    return el;
  };
  const top = piece(`0 0, 100% 0, 100% ${b}%, 0 ${a}%`), bot = piece(`0 ${a}%, 100% ${b}%, 100% 100%, 0 100%`);
  src.remove();
  // 刀口在屏幕上的方向，兩頭各伸出牌外一截
  const x0 = rect.left, y0 = rect.top + rect.height * a / 100, x1 = rect.right, y1 = rect.top + rect.height * b / 100;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = uy, ny = -ux; // n：刀口法線，朝上半邊
  const ext = rect.width * 0.32, sx = x0 - ux * ext, sy = y0 - uy * ext, L = len + ext * 2, ang = Math.atan2(dy, dx) * 180 / Math.PI;
  // 刀光：紙白的細長刀影，墨線勾邊，中間最粗、兩頭收尖
  const blade = h('div', { class: 'fx-blade', style: { left: sx + 'px', top: sy + 'px', width: L + 'px', transform: `rotate(${ang}deg)` } });
  blade.innerHTML = `<svg viewBox="0 0 100 10" preserveAspectRatio="none"><polygon points="0,5 62,0.5 100,5 62,9.5"/><polygon class="core" points="2,5 62,3.3 98,5 62,6.7"/></svg>`;
  getStage().append(blade);
  sfx('slash');
  anim(blade.firstChild, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 70, easing: 'cubic-bezier(.2,.9,.3,1)' });
  await wait(70);
  // 砍中：兩半沿刀口錯開一點，頓住；桌面閃一下紙白，一圈墨線從刀口中間散開
  const cut = (el, d) => anim(el, [{ transform: 'none' }, { transform: `translate(${(ux * 10 + nx * 4) * d}px, ${(uy * 10 + ny * 4) * d}px)` }],
    { duration: 50, easing: 'ease-out' });
  cut(top, 1); cut(bot, -1);
  const flash = h('div', { class: 'fx-flash' });
  getStage().prepend(flash); // 閃在桌面上、牌和刀光底下
  anim(flash, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, d = rect.height * 1.3;
  const ring = h('i', { class: 'ink-ring at', style: { left: cx + 'px', top: cy + 'px', width: d + 'px', height: d + 'px', margin: `${-d / 2}px 0 0 ${-d / 2}px` } });
  getStage().append(ring);
  anim(ring, [{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
  anim(blade, [{ opacity: 1, transform: `rotate(${ang}deg) scaleY(1)` }, { opacity: 0, transform: `rotate(${ang}deg) translate(${ext * 0.4}px) scaleY(.2)` }],
    { duration: 220, delay: 60, easing: 'ease-in' });
  await wait(110); // hitstop
  // 甩飛：上半沿刀口往右上、下半往左下，越飛越快，轉著出畫面
  const far = Math.max(innerWidth, innerHeight);
  const toss = (el, d) => anim(el, [
    { transform: `translate(${(ux * 10 + nx * 4) * d}px, ${(uy * 10 + ny * 4) * d}px)`, opacity: 1 },
    { transform: `translate(${(ux * far * 0.5 + nx * far * 0.35) * d}px, ${(uy * far * 0.5 + ny * far * 0.35) * d}px) rotate(${d * -24}deg)`, opacity: 0.9 }],
    { duration: 380, easing: 'cubic-bezier(.55,0,.9,.4)' });
  toss(top, 1); toss(bot, -1);
}

// 結算演出裏要飛進頂欄的雞蛋：先記為「還沒到」，飛到時（或演出被跳過、播完時）才加上，頂欄跳一下「+N」
function pendingEggs(n) {
  eggPending += n;
  return () => {
    if (!n) return;
    eggPending -= n;
    recent.egg = { at: Date.now(), n };
    n = 0;
    rerender(); setTimeout(rerender, 1350);
  };
}
// 結算的一枚獎勵：圖標 + 「+N」
const gainChip = (ico, text) => h('span', { class: 'pc-gain ' + ico }, icon(ico), h('b', {}, text));
// 幾枚雞蛋從 from 沿弧線飛進頂欄的雞蛋數
async function flyEggs(from, n) {
  const pill = document.querySelector('.egg-pill');
  if (cur.skip || !from || !pill) return;
  const a = from.getBoundingClientRect(), b = pill.getBoundingClientRect();
  const A = { x: a.left + a.width / 2, y: a.top + a.height / 2 }, B = { x: b.left + 16, y: b.top + b.height / 2 }, flown = [];
  for (let i = 0; i < Math.min(n, 5); i++) { flown.push(fly(icon('egg'), A, B, { size: 30, ms: 620, tone: 'egg' })); await wait(80); }
  const done = await Promise.all(flown);
  done.forEach(f => fadeOut(f.el, 150));
  await wait(150);
}
// 帷幔：一條紅布，底邊一串圓弧垂下來，上面一道金線（弧的個數按寬度算，拉寬了也不變形）
// 一片幕布：裏面一層布（下擺擺動用），布切成豎條（褶子各自顛動用），每條的底紋按它在整片裏的位置對齊，拼起來看不出縫。
// 布往兩邊各多伸出 12%（下擺最大甩出約 2.6°），來回擺時合縫和屏幕邊上都不露出幕後
const FOLDS = 14, OVER = 0.12;
function drape(side, transform) {
  const w = innerWidth * 0.505, cw = w * (1 + 2 * OVER), x0 = -OVER * w;
  const folds = Array.from({ length: FOLDS }, (_, i) => h('i', { class: 'cur-fold', style: { left: `${(i * 100) / FOLDS}%`, backgroundPositionX: `${-(x0 + (i * cw) / FOLDS)}px` } }));
  return h('div', { class: `cur-drape ${side}`, style: { transform } }, h('div', { class: 'cur-cloth' }, folds));
}
// 合上：下擺先甩過合縫再擺回（擺幅一次比一次小），褶子從合縫往外依次顛一下。d：左片 -1、右片 1
function settle(el, d) {
  const cloth = el.firstChild;
  anim(cloth, [{ transform: 'none' }, { transform: `skewX(${-d * 2.6}deg)`, offset: 0.25 }, { transform: `skewX(${d * 1.2}deg)`, offset: 0.55 },
    { transform: `skewX(${-d * 0.4}deg)`, offset: 0.8 }, { transform: 'none' }], { duration: 1100, easing: 'ease-out' });
  // 先往下沉再回彈：往下沉的那截在屏幕外，回彈很小，下擺底下不露出幕後
  [...cloth.children].forEach((f, i, all) => anim(f, [{ transform: 'none' }, { transform: 'translateY(1.6%)', offset: 0.3 }, { transform: 'translateY(-.3%)', offset: 0.65 }, { transform: 'none' }],
    { duration: 640, delay: (d < 0 ? all.length - 1 - i : i) * 38, easing: 'ease-out' }));
}
// 拉開：下擺落在後面，被拖著走，停下時擺正
function trail(el, d) {
  anim(el.firstChild, [{ transform: 'none' }, { transform: `skewX(${d * 3}deg)`, offset: 0.45 }, { transform: `skewX(${-d * 0.8}deg)`, offset: 0.85 }, { transform: 'none' }], { duration: 1150, easing: 'ease-in-out' });
}
function valance(w) {
  const n = Math.max(5, Math.round(w / 70)), sw = 400 / n;
  let d = 'M0 0H400V24';
  for (let i = n; i > 0; i--) d += `Q${(i - 0.5) * sw} 44 ${(i - 1) * sw} 24`;
  return `<svg viewBox="0 0 400 46" preserveAspectRatio="none"><path class="cv-red" d="${d}Z"/><path class="cv-trim" d="M0 15H400"/></svg>`;
}

// ———— 各種演出 ————
const SCENES = {
  // 開局拉幕：頂上的帷幔先落下，兩片紅幕從左右拉過來，在整個頁面中間合上（側欄也蓋住）；
  // 合上時幕後換成新的一局、天色換成夜晚，合縫處一張紙牌「第 N 局」蓋「開局」章，
  // 然後幕布往兩邊收攏著拉開、帷幔升起（後面接著翻角色牌、入夜）。不震
  // 布有分量：合上那一下下擺順著慣性甩過去再擺回來，褶子從合縫處往外一條條顛一下，帷幔跟著一沉；拉開時下擺往後拖
  curtain: e => ({ block: true, run: async () => {
    const shut = d => `translateX(${d * 101}%) scaleX(.4)`;
    const L = drape('l', shut(-1)), R = drape('r', shut(1));
    const top = h('div', { class: 'cur-top', style: { transform: 'translateY(-105%)' } }), mid = h('div', { class: 'cur-mid' });
    top.innerHTML = valance(innerWidth);
    getStage().append(h('div', { class: 'curtain' }, L, R, mid, top));
    anim(top, [{ transform: 'translateY(-105%)' }, { transform: 'translateY(6%)', offset: 0.7 }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,.8,.4,1)' });
    await wait(240);
    const pull = (el, d, open) => anim(el, open ? [{ transform: 'none' }, { transform: shut(d) }]
      : [{ transform: shut(d) }, { transform: `translateX(${-d * 2}%) scaleX(1.03)`, offset: 0.8 }, { transform: 'none' }],
    { duration: open ? 1100 : 950, easing: open ? 'cubic-bezier(.6,0,.35,1)' : 'cubic-bezier(.35,.6,.3,1)' });
    sfx('swish');
    pull(L, -1); pull(R, 1);
    await wait(420); // 兩片在中間碰上的那一刻（拉幕的緩動在這裏衝過頭）
    settle(L, -1); settle(R, 1);
    anim(top, [{ transform: 'none' }, { transform: 'translateY(5%)', offset: 0.35 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
    await wait(480);
    instantSky('night');
    thaw();
    const title = h('div', { class: 'pc-title' }, `第 ${e.n || 1} 局`), slot = h('div', { class: 'pc-slot' });
    const card = h('div', { class: 'pc cal' }, title, slot);
    mid.append(card);
    hide(title);
    cardPop(card);
    await wait(220);
    beat(title);
    await wait(420);
    await slamStamp(slot, '開局', 'red');
    await wait(900);
    cardOut(card);
    await wait(260);
    pull(L, -1, true); pull(R, 1, true);
    trail(L, -1); trail(R, 1);
    await wait(950);
    anim(top, [{ transform: 'none' }, { transform: 'translateY(-105%)' }], { duration: 300, easing: 'ease-in' });
    await wait(320);
  } }),

  // 入夜：紙牌滑上來的同時背景演日落、天轉黃昏；月亮印記隨第一聲鐘落下，
  // 「第 N 夜」隨第二聲，這時天黑下來：星星出來、窗戶亮燈、桌布換成深藍。只淡淡壓暗，背景看得見。不震
  night: e => ({ block: true, skippable: true, run: async () => {
    const dark = document.body.dataset.phase === 'night'; // 開新局時幕後已經換成夜晚：不再演日落
    veil(dark ? WASH.night : WASH.dusk, 500);
    const em = seal(icon('moon'), 'night'), title = h('div', { class: 'pc-title' }, `第 ${e.n} 夜`);
    const card = paperCard([em, title], 'cal');
    hide(em, title);
    cardIn(card, 600);
    await wait(260);
    if (!dark) sky('dusk');
    await wait(300);
    sfx('night'); beat(em); ring(em, 'night', 2);
    await wait(900);
    sky('night');
    beat(title);
    await wait(1800);
    await closeCard(card);
  } }),

  // 天亮：太陽印記、「第 N 天」，再蓋「平安夜」或「N 人死亡」；有人死就讓出桌面，逐個在死者座位上蓋「死亡」（不透露死法）
  // 背景同時演日出：星星淡去、天邊泛紅，「第 N 天」落下時天大亮、桌布換回米白
  dawn: e => ({ block: true, holds: e.deaths, run: async () => {
    veil(WASH.dawn, 400);
    const em = seal(icon('sun'), 'sun'), title = h('div', { class: 'pc-title' }, `第 ${e.day} 天`), slot = h('div', { class: 'pc-slot' });
    const card = paperCard([em, title, slot], 'cal');
    hide(em, title);
    cardIn(card, 500);
    await wait(260);
    sky('dawn');
    await wait(220);
    sfx('dawn'); beat(em); ring(em, 'brass', 2);
    await wait(700);
    sky('day');
    beat(title);
    await wait(700);
    if (!e.deaths.length) {
      await slamStamp(slot, '平安夜', 'brass');
      await wait(1300);
      await closeCard(card);
      return;
    }
    await slamStamp(slot, `${e.deaths.length} 人死亡`, 'red'); // 震留給下面每一下叉子
    await wait(900);
    cardOut(card);
    anim(getStage(), [{ backgroundColor: WASH.dawn }, { backgroundColor: WASH.light }], { duration: 400 });
    await wait(420);
    for (const id of e.deaths) await perish(id);
    await wait(300);
    fadeOut(getStage(), 400); await wait(400);
  } }),

  // 提名：桌面壓暗，一張紙牌從下面滑上來（提名者 → 被提名者），一枚紅色「提名」印章砸在牌上。一天好幾次，不震
  nominate: (e, s) => ({ block: true, run: async () => {
    veil(WASH.ink, 200);
    const card = paperCard([bigToken(s, e.from, 'from'), h('div', { class: 'pc-arrow' }, icon('to')), bigToken(s, e.to, 'to')], 'face');
    cardIn(card);
    await wait(520);
    await slamStamp(card, '提名', 'red');
    await wait(1000);
    await closeCard(card);
  } }),

  // 說書人喊立即計票：所有人一張全屏紙牌「說書人提出 /［立即計票］紅章 / 請立即作出你的選擇」，播完時鐘開始數。不震
  callvote: (e, s) => ({ block: true, run: async () => {
    veil(WASH.ink, 200);
    const em = seal(icon('hand'), 'sun'), slot = h('div', { class: 'pc-slot' });
    const say = h('div', { class: 'pc-say' }, '說書人提出'), sub = h('div', { class: 'pc-sub' }, '請立即作出你的選擇');
    const card = paperCard([em, say, slot, sub], 'cal callvote');
    hide(em, say, sub);
    cardIn(card, 420);
    await wait(400);
    beat(em); ring(em, 'brass', 2);
    await wait(260);
    beat(say);
    await wait(260);
    await slamStamp(slot, '立即計票', 'red');
    beat(sub);
    await wait(1100);
    await closeCard(card);
  } }),

  // 計票結果「噔噔噔噔」：被提名者、票數、需要的票數一拍一拍落在紙牌上，第四拍蓋判決章。
  // 只有上處決台的判決章震一下；平票、票數不足不震，票數不足的章落得慢
  votes: (e, s, p) => ({ block: true, run: async () => {
    veil(WASH.ink, 220);
    const voters = e.voters || Object.entries(p?.nomination?.votes || {}).filter(([, v]) => v).map(([id]) => id);
    const hit = e.res === 'block';
    const tok = bigToken(s, e.to, 'to');
    const num = h('b', { class: 'pc-num' + (hit ? ' hit' : '') }, e.count), need = h('small', { class: 'pc-need' }, `/ ${e.need}`);
    const row = h('div', { class: 'pc-voters' }, voters.map((id, k) => h('span', { style: { '--i': k } }, seatBadge(s, id))));
    const slot = h('div', { class: 'pc-slot' }); // 判決章落在這一條上，不壓住票數
    const card = paperCard([h('div', { class: 'pc-row' }, tok, h('div', { class: 'pc-tally' }, h('div', { class: 'pc-count' }, icon('hand'), num, need), row)), slot], 'result');
    hide(tok, num, need);
    cardPop(card);
    await wait(220);
    beat(tok); await wait(380);
    beat(num); await wait(380);
    beat(need); row.classList.add('in'); await wait(440);
    await slamStamp(slot, { block: '上處決台', tie: '平票', fail: '票數不足' }[e.res], { block: 'red', tie: 'brass', fail: 'gray' }[e.res],
      hit ? { power: 14 } : { soft: e.res !== 'tie' });
    await wait(1300);
    fadeOut(getStage(), 380); await wait(380);
  } }),

  // 貞潔者反噬：一道刀光把提名卡（桌上的審判牌；萬一不在桌上就現拿一張提名紙牌）劈成兩半甩飛，
  // 兩半還在飛，她的角色牌就在座位上砸出來，緊接著閃電從她劈到提名者身上，蓋「反噬」章（不走處決的絞刑架）
  virgin: (e, s) => {
    // 審判牌下一次重繪就沒了：趁現在拷貝一份
    const trial = document.querySelector('.trial'), snap = trial && { node: trial.cloneNode(true), rect: trial.getBoundingClientRect() };
    return { block: true, holds: [e.from], run: async () => {
    // 只壓暗底色、不淡入整個舞台：拷貝的審判牌要原樣接住桌上那張，不能閃一下
    const st = getStage();
    st.style.background = WASH.dim;
    anim(st, [{ backgroundColor: 'transparent' }, { backgroundColor: WASH.dim }], 200);
    if (snap) {
      snap.node.classList.remove('fx-pop');
      Object.assign(snap.node.style, { position: 'static', margin: 0, width: '100%', height: '100%', maxHeight: 'none', overflow: 'hidden' });
      const holder = h('div', { class: 'fx-torn', style: { left: snap.rect.left + 'px', top: snap.rect.top + 'px', width: snap.rect.width + 'px', height: snap.rect.height + 'px' } }, snap.node);
      getStage().append(holder);
      await wait(160);
      await slash(snap.node, snap.rect);
      holder.remove();
    } else {
      const card = paperCard([bigToken(s, e.from, 'from'), h('div', { class: 'pc-arrow' }, icon('to')), bigToken(s, e.seat, 'to')], 'face');
      cardIn(card);
      await wait(520);
      await slash(card, card.parentElement.getBoundingClientRect()); // 量外框：牌自己還可能帶著滑入動畫的位移
    }
    const v = seatAt(e.seat), n = seatAt(e.from), size = v.el?.getBoundingClientRect().width || 80;
    const tok = sprite(roleToken('virgin'), v.x, v.y, size, 'land');
    beat(tok); mark(e.seat, 'brass');
    await wait(420);
    const zap = await bolt(v, n);
    hit(e.from);
    await seatStamp(e.from, '反噬', { power: 12 });
    fadeOut(zap, 300);
    await wait(450);
    fadeOut(getStage(), 380); await wait(380);
  } };
  },

  // 處決：頭像一直掛在絞刑架下（不在台上就先從座位飛到圓桌中間），整副絞刑架連人慢慢浮起，
  // 然後繩子和人一起往下墜、一頓、晃幾下、褪色，下面蓋「處決」章；最後頭像飛回座位。
  // survive：沒死（弄臣、水手、魔鬼代言人……）：不褪色，蓋「沒有死亡」章
  execute: (e, s) => ({ block: true, holds: [e.seat], run: async () => {
    const i = s.seats.findIndex(x => x.id === e.seat), seat = s.seats[i];
    const rr = document.querySelector('.ring')?.getBoundingClientRect();
    const mid = rr ? { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    const onBlk = document.querySelector(`.blk[data-key="blk-${e.seat}"] .blk-tok .token`)?.getBoundingClientRect();
    const home = seatAt(e.seat), homeSize = home.el?.getBoundingClientRect().width || 60;
    const size = onBlk?.width || Math.min(110, (rr?.width || 500) * 0.17), k = size / 84;
    const at = onBlk ? { x: onBlk.left + size / 2, y: onBlk.top + size / 2 } : { x: mid.x, y: mid.y + size * 0.3 };
    execId = e.seat; recent.blkret.delete(e.seat); rerender();
    veil('#2a262299', 250);
    const face = () => (seat?.role ? roleToken(seat.role) : h('div', { class: 'token md blank solid' }, i + 1));
    if (!onBlk) {
      const fly = sprite(face(), home.x, home.y, size, 'ex-tok');
      anim(fly, [{ transform: `scale(${homeSize / size})` }, { transform: `translate(${at.x - home.x}px, ${at.y - home.y}px)` }], { duration: 520, easing: 'cubic-bezier(.3,.8,.3,1)' });
      await wait(540); fly.remove();
    }
    // 絞刑架：木架 + 晃動層（以繩頭為軸）；晃動層裏繩子往下拉長、套索和頭像跟著往下
    const tok = h('div', { class: 'ex-face' }, face());
    const hanger = h('div', { class: 'ex-hanger' }, h('i', { class: 'ex-noose' }), tok);
    const rope = h('i', { class: 'ex-rope' });
    const swing = h('div', { class: 'ex-swing' }, rope, hanger);
    const wood = gallows('', false);
    const rig = h('div', { class: 'ex-rig', style: { '--k': k, left: at.x - 75 * k + 'px', top: at.y - 104 * k + 'px' } }, wood, swing);
    getStage().append(rig);
    if (!onBlk) {
      anim(wood, [{ transform: 'translateY(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.3,1.3,.5,1)' });
      anim(rope, [{ opacity: 0 }, { opacity: 1 }], 300);
      await wait(420);
    }
    // 浮起：整副絞刑架連人慢慢往上提
    const up = 22 * k;
    sfx('rope');
    anim(rig, [{ transform: 'none' }, { transform: `translateY(${-up}px)` }], { duration: 650, easing: 'cubic-bezier(.3,0,.2,1)' });
    await wait(800);
    // 墜下：架子落回原位，繩子和人一起再往下掉一截，到底一頓、回彈
    const D = 46 * k, L = 38 * k, fall = 'cubic-bezier(.55,0,1,.6)';
    anim(rig, [{ transform: `translateY(${-up}px)` }, { transform: 'none' }], { duration: 230, easing: fall });
    const drop = d => [{ offset: 0, easing: fall, v: 0 }, { offset: 0.5, easing: 'ease-out', v: d * 1.14 }, { offset: 0.72, easing: 'ease-in-out', v: d * 0.88 }, { offset: 1, v: d }];
    anim(hanger, drop(D).map(f => ({ offset: f.offset, easing: f.easing, transform: `translateY(${f.v}px)` })), { duration: 560 });
    anim(rope, drop(D).map(f => ({ offset: f.offset, easing: f.easing, transform: `scaleY(${(L + f.v) / L})` })), { duration: 560 });
    await wait(280);
    sfx('thud'); shake(10);
    if (!e.survive) anim(tok, [{ filter: 'none' }, { filter: 'grayscale(1) brightness(.75)' }], 500);
    anim(swing, [{ transform: 'rotate(0)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3.5deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(-1deg)' }, { transform: 'rotate(0)' }],
      { duration: 1500, easing: 'ease-out' });
    await wait(420);
    const pad = h('div', { class: 'ex-pad' }); getStage().append(pad);
    Object.assign(pad.style, { left: at.x + 'px', top: at.y + D + size * 0.5 + 46 * k + 'px' });
    await slamStamp(pad, e.survive ? '沒有死亡' : '處決', e.survive ? 'good' : 'red');
    await wait(900);
    // 頭像飛回座位，落定時座位上蓋章
    const r = tok.getBoundingClientRect(), from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const back = sprite(face(), from.x, from.y, r.width, e.survive ? 'ex-tok' : 'ex-tok gray');
    tok.style.visibility = 'hidden';
    fadeOut(rig, 250); fadeOut(pad, 250);
    anim(back, [{ transform: 'none' }, { transform: `translate(${home.x - from.x}px, ${home.y - from.y}px) scale(${homeSize / r.width})` }], { duration: 560, easing: 'cubic-bezier(.5,0,.3,1)' });
    await wait(580);
    execId = null; release(e.seat);
    fadeOut(back, 200); fadeOut(getStage(), 300); await wait(300);
  } }),

  // 白天結束沒人上處決台：空的絞刑架（套索輕輕晃），「無人處決」章慢慢落下
  noexec: () => ({ block: true, run: async () => {
    veil(WASH.ink, 200);
    const slot = h('div', { class: 'pc-slot' });
    const card = paperCard([h('div', { class: 'pc-gallows' }, gallows()), slot], 'cal');
    cardIn(card);
    await wait(520);
    await slamStamp(slot, '無人處決', 'gray', { soft: true });
    await wait(1200);
    await closeCard(card);
  } }),

  // 獵手開槍（說書人裁定之後）：準星落到目標身上，箭從射手座位直飛過去。
  // 射中：扎在牌上，蓋「射殺」章；射空：箭擦過去掉在地上，軟軟落下一枚灰色「未中」，章再飛到射手身上變成「射 N 號失敗」的標籤
  slay: e => ({ block: true, holds: e.hit ? [e.to] : [], run: async () => {
    veil(WASH.dim, 250);
    const a = seatAt(e.from), b = seatAt(e.to), r = (b.el?.getBoundingClientRect().width || 80) / 2;
    const aim = sprite(icon('aim'), b.x, b.y, r * 2.7, 'aim');
    mark(e.from, 'brass');
    anim(aim, [{ transform: 'scale(2.2) rotate(-60deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.8,.3,1)' });
    await wait(620);
    if (e.hit) {
      await shoot(a, b, r * 0.4);
      sfx('stab'); hit(e.to); fadeOut(aim, 200);
      await seatStamp(e.to, '射殺', { power: 12 });
      await wait(500);
    } else {
      const f = await shoot(a, b, -r * 0.5);
      fadeOut(aim, 300);
      anim(f.el, [{ transform: f.to, opacity: 1 }, { transform: `${f.to} translate(16px, 70px)`, opacity: 0 }], { duration: 560, easing: 'ease-in' });
      anim(f.el.firstChild, [{ rotate: '0deg' }, { rotate: '80deg' }], { duration: 560, easing: 'ease-in' });
      const pad = h('div', { class: 'seat-pad', style: { left: b.x + 'px', top: b.y + 'px' } });
      getStage().append(pad);
      await slamStamp(pad, '未中', 'gray', { soft: true });
      await wait(700);
      anim(pad, [{ transform: 'none', opacity: 1 }, { transform: `translate(${a.x - b.x}px, ${a.y - b.y + r * 1.6}px) scale(.3)`, opacity: 0.2 }],
        { duration: 480, easing: 'cubic-bezier(.5,0,.3,1)' });
      await wait(480);
    }
    fadeOut(getStage(), 380); await wait(380);
  } }),

  // 勝負：陣營色平塗，紙牌上「善良獲勝」四個字噔噔噔噔落下（第四下最重，邪惡獲勝時震一下），玩家再蓋「勝利 / 失敗」，
  // 贏了紙牌兩角炸開兩朵煙花；然後結算：勝利積分 +1、雞蛋 +10（輸了雞蛋 +1）一枚枚落下，雞蛋飛進頂欄的雞蛋數；
  // 最後是勝負原因和獲勝陣營的全員。播完贏家頭上落下皇冠、開始 MVP 投票（onState 裏的 winHold）
  win: (e, s) => {
    const good = e.team === 'good', team = r => (TEAMS[ROLES[r]?.team]?.good ? 'good' : 'evil');
    const me = s.seats.find(x => x.mine);
    const verdict = !s.isSt && me?.role ? (team(me.role) === e.team ? 'win' : 'lose') : null;
    const gain = verdict ? (verdict === 'win' ? EGG.win : EGG.lose) : 0, land = pendingEggs(gain);
    return { block: true, after: land, run: async () => {
      veil(good ? WASH.good : WASH.evil, 500);
      const chars = [...(good ? '善良獲勝' : '邪惡獲勝')].map(ch => h('span', {}, ch));
      const slot = verdict ? h('div', { class: 'pc-slot' }) : null;
      const reward = verdict ? h('div', { class: 'pc-reward' }, verdict === 'win' && gainChip('trophy', '+1'), gainChip('egg', `+${gain}`)) : null;
      const gains = reward ? [...reward.children] : [];
      const sub = s.winReason ? h('div', { class: 'pc-sub' }, s.winReason) : null;
      const winners = s.seats.map((x, k) => [x, k]).filter(([x]) => x.role && team(x.role) === e.team);
      const row = winners.length ? h('div', { class: 'pc-winners' }, winners.map(([x, k], n) => h('div', { class: 'pc-mini', style: { '--i': n } },
        roleToken(x.role, { size: 'sm' }), h('small', {}, `${k + 1} ${x.name}`)))) : null;
      const card = paperCard([seal(good ? icon('sun') : roleIcon('imp'), good ? 'sun' : 'demon'), h('div', { class: 'pc-title ' + e.team }, chars), slot, reward, sub, row], 'cal win');
      hide(...chars, ...gains, sub);
      cardIn(card, 520);
      await wait(560);
      for (const [k, ch] of chars.entries()) {
        const last = k === chars.length - 1;
        beat(ch, { power: last && !good ? 12 : 0 });
        await wait(last ? 560 : 340);
      }
      if (verdict) {
        await slamStamp(slot, verdict === 'win' ? '勝利' : '失敗', verdict === 'win' ? (good ? 'good' : 'red') : 'gray',
          { soft: verdict !== 'win' });
        if (verdict === 'win' && !cur.skip) {
          const r = card.getBoundingClientRect();
          sfx('fw');
          burst(r.left + 26, r.top + 34, e.team, 64, true, getStage());
          setTimeout(() => burst(r.right - 26, r.top + 46, e.team, 54, true, getStage()), 230);
        }
        await wait(300);
        for (const g of gains) { beat(g); await wait(280); }
      }
      sfx(good ? 'good' : 'evil');
      if (sub) { sub.style.opacity = 1; anim(sub, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 400); }
      row?.classList.add('in');
      if (reward) { await wait(300); await flyEggs(gains.at(-1), gain); land(); }
      await wait(reward ? 3000 : 4200);
      fadeOut(getStage(), 700); await wait(700);
    } };
  },

  // MVP 揭曉：星星印記、當選人的大牌一張張落下，金色「MVP」章，票數；自己當選的話再落一枚「雞蛋 +5」飛進頂欄。
  // 播完座位名牌上亮 MVP（onState 裏的 mvpHold）
  mvp: (e, s) => {
    const mine = !s.isSt && e.seats.includes(s.myId), land = pendingEggs(mine ? EGG.mvp : 0);
    return { block: true, after: land, run: async () => {
      veil(WASH.ink, 300);
      const em = seal(icon('star'), 'sun'), toks = e.seats.map(id => bigToken(s, id, 'mvp'));
      const slot = h('div', { class: 'pc-slot' }), sub = h('div', { class: 'pc-sub' }, `${e.n} 票`);
      const reward = mine ? h('div', { class: 'pc-reward' }, gainChip('egg', `+${EGG.mvp}`)) : null;
      const card = paperCard([em, h('div', { class: 'pc-row' }, toks), slot, sub, reward], 'cal mvp');
      hide(em, ...toks, sub, reward);
      cardIn(card, 480);
      await wait(500);
      beat(em); ring(em, 'brass', 2);
      await wait(360);
      for (const t of toks) { beat(t); await wait(320); }
      await slamStamp(slot, 'MVP', 'brass');
      sfx('crown');
      sub.style.opacity = 1; anim(sub, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 300);
      if (reward) { await wait(300); beat(reward); await wait(360); await flyEggs(reward, EGG.mvp); land(); }
      await wait(1700);
      await closeCard(card);
    } };
  },

  role: e => ({ block: true, skippable: true, run: () => revealRole(e.role, 'flip') }),
  // 接任惡魔：在桌上演（紅唇女郎的飛吻 / 傳過來的草叉），自己的牌翻成惡魔，不擋操作
  demon: (e, s) => ({ run: () => AB.demon(e, s.myId) }),
  // 聖徒被處決落敗、鎮長獲勝：全桌一起看，接著是勝負
  saint: e => ({ block: true, run: () => AB.saint(e) }),
  mayor: e => ({ block: true, run: () => AB.mayor(e) }),

  // 自己的夜晚行動：有專門演出的角色在桌上演（fx-ab.js），其餘棋子從自己座位飛到目標身上（不擋操作）
  act: (e, s) => ({ run: () => AB.act(e, s.myId) || actChips(e, s) }),
  // 自己收到信息：答案落在桌心再收進面板（不擋操作）；沒有專門演出的角色不演
  info: (e, s) => (AB.hasInfo(e.src) && !s.isSt ? { run: () => AB.info(e, s.myId) } : null),

  // 說書人魔典上的一枚章（不擋操作，排多了就跳過）
  ststamp: e => ({ lite: true, run: () => AB.ststamp(e) }),
  // 說書人魔典上的夜晚結算（不擋操作，排多了就跳過）
  grim: e => ({ lite: true, holds: e.res === 'kill' || e.res === 'starpass' ? e.to : [], run: () => AB.grim(e) || grimScene(e) }),
};

// 自己的夜晚行動（沒有專門演出的角色）：棋子從自己座位飛到目標身上
async function actChips(e, s) {
  const me = seatAt(s.myId), look = ACT[e.src] || ACT.default;
  const flown = await Promise.all(e.to.map(id => fly(look.ico(), me, seatAt(id), { tone: look.tone })));
  sfx(look.sfx);
  e.to.forEach(id => mark(id, look.tone, look.hard));
  await wait(700);
  flown.forEach(f => fadeOut(f.el, 300)); await wait(300);
}

// 各角色夜晚行動的棋子：圖標、顏色、落下的聲音；hard：落下時目標挨一下
const ACT = {
  poisoner: { ico: () => icon('drop'), tone: 'poison', sfx: 'drip', hard: true },
  monk: { ico: () => icon('shield'), tone: 'good', sfx: 'shimmer' },
  imp: { ico: () => icon('pitchfork'), tone: 'evil', sfx: 'whoosh', hard: true },
  butler: { ico: () => icon('key'), tone: 'brass', sfx: 'key' },
  fortuneteller: { ico: () => icon('eye'), tone: 'good', sfx: 'shimmer' },
  ravenkeeper: { ico: () => roleIcon('ravenkeeper'), tone: 'good', sfx: 'whoosh' },
  default: { ico: () => icon('to'), tone: '', sfx: 'pop' },
};

async function grimScene(e) {
  const a = seatAt(e.seat), t = e.to[0] && seatAt(e.to[0]);
  if (!t) return;
  // 新劇本的角色沒有專門的棋子：用選人提示裏的圖標和顏色
  const look = ACT[e.src] || (ACTS[e.src] && { ico: () => icon(ACTS[e.src].ico), tone: ACTS[e.src].tone, sfx: 'pop', hard: ACTS[e.src].tone === 'evil' }) || ACT.default;
  const land = async (f, ms = 600) => { await wait(ms); fadeOut(f.el, 300); await wait(300); };
  switch (e.res) {
    case 'poison': case 'protect': case 'master': {
      const f = await fly(look.ico(), a, t, { tone: look.tone });
      sfx(look.sfx); mark(e.to[0], look.tone, look.hard);
      await land(f, e.res === 'protect' ? 900 : 600); break;
    }
    case 'kill': await stab(e.to[0]); break;
    // 擋下：目標身上先亮盾，叉子飛過去撞上彈開
    case 'blocked': {
      const sh = e.why === 'protect' && sprite(chip(icon('shield'), 'good'), t.x, t.y, 64);
      if (sh) { beat(sh); await wait(320); }
      const f = await fly(icon('pitchfork'), a, t, { ms: 500, tone: 'evil' });
      sfx('clang'); mark(e.to[0], 'good');
      anim(f.el, [{ transform: `translate(${f.dx}px, ${f.dy}px)`, opacity: 1 }, { transform: `translate(${f.dx + 40}px, ${f.dy - 80}px) rotate(200deg) scale(.8)`, opacity: 0 }],
        { duration: 600, easing: 'ease-out' });
      await wait(700);
      if (sh) { fadeOut(sh, 300); await wait(300); }
      break;
    }
    // 能力失效（中毒 / 酒鬼）：虛線的棋子飛過去，落空沉下去
    case 'fail': {
      const f = await fly(look.ico(), a, t, { ms: 500, tone: 'dim' });
      anim(f.el, [{ transform: `translate(${f.dx}px, ${f.dy}px)`, opacity: 1 }, { transform: `translate(${f.dx}px, ${f.dy + 30}px) scale(.6)`, opacity: 0 }], { duration: 420, easing: 'ease-in' });
      await wait(420); break;
    }
    // 小惡魔自殺傳刀：轉換印記砸在自己身上
    case 'starpass': {
      const c = sprite(chip(icon('become'), 'evil'), a.x, a.y, 64);
      beat(c, { sound: 'demon' }); hit(e.seat, 'evil');
      await wait(1000); fadeOut(c, 300); await wait(300); break;
    }
    // 刺向鎮長：叉子飛過去，說書人再決定替死的人
    case 'mayor': {
      const f = await fly(icon('pitchfork'), a, t, { tone: 'evil' });
      mark(e.to[0], 'brass');
      await land(f, 500); break;
    }
    default: break;
  }
}

// 翻開角色牌（開局 / 接任惡魔 / 說書人更正）：牌在紙牌上翻面，蓋陣營章，亮出能力說明；
// 留夠讀的時間後紙牌和底色淡掉，只剩角色牌沿弧線飛進左上角面板的空位，落定的那一刻面板才亮出這張牌
async function revealRole(roleId, kind) {
  const demon = kind === 'demon', r = ROLES[roleId], team = TEAMS[r?.team], wash = demon ? WASH.evil : WASH.night;
  veil(wash, 400);
  const flip = h('div', { class: 'sc-card' }, h('div', { class: 'sc-back' }, icon('mask')), h('div', { class: 'sc-front' }, roleToken(roleId)));
  const slot = h('div', { class: 'pc-slot' }), ab = r ? h('p', { class: 'pc-ab' }, r.ability) : null;
  const card = paperCard([flip, slot, ab], 'cal reveal');
  hide(ab);
  cardIn(card, 480);
  await wait(560);
  if (demon) sfx('demon');
  anim(flip, [{ transform: 'rotateY(0) scale(.9)' }, { transform: 'rotateY(180deg)' }], { duration: 700, easing: 'cubic-bezier(.3,1.3,.5,1)' });
  await wait(760);
  if (team) await slamStamp(slot, team.name, '', { power: demon ? 12 : 0, color: team.color });
  if (ab) { ab.style.opacity = 1; anim(ab, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 360); }
  await wait(Math.min(5000, Math.max(2200, (r?.ability.length || 0) * 75)));
  const dest = document.querySelector('.hud-me .token')?.getBoundingClientRect();
  if (!dest?.width) { cardOut(card); fadeOut(getStage(), 400); await wait(400); return; }
  // 換成一張和面板上一樣大的牌，先放大到中間那張的大小，再一路縮回去落進空位
  const from = flip.getBoundingClientRect(), k = from.width / dest.width;
  const dx = dest.left + dest.width / 2 - (from.left + from.width / 2), dy = dest.top + dest.height / 2 - (from.top + from.height / 2);
  const tok = sprite(roleToken(roleId), from.left + from.width / 2, from.top + from.height / 2, dest.width, 'land');
  flip.style.visibility = 'hidden';
  anim(card, [{ transform: 'rotate(-1deg)', opacity: 1 }, { transform: 'translateY(16px) rotate(-1deg)', opacity: 0 }], { duration: 300, easing: 'ease-in' });
  anim(getStage(), [{ backgroundColor: wash }, { backgroundColor: '#0000' }], { duration: 650, easing: 'ease-in' });
  anim(tok, [{ transform: `scale(${k})` }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(k + 1) / 2})`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(1)` }], { duration: 650, easing: 'cubic-bezier(.45,0,.3,1)' });
  await wait(650);
  sfx('tag');
  anim(tok, [{ transform: `translate(${dx}px, ${dy}px) scale(1.1)` }, { transform: `translate(${dx}px, ${dy}px) scale(1)` }], { duration: 160, easing: 'ease-out' });
  await wait(180);
}

// 回到準備階段（下一局前、放棄本局）：牌一張張翻過去，翻到側面時桌面換成準備階段，再翻回來，牌面就空了。不是一下子全換掉
const resetScene = () => ({ block: true, run: async () => {
  const tokens = () => [...document.querySelectorAll('.ring > .seat .seat-token > .token')];
  const flip = (from, to, easing) => tokens().forEach((t, i) => anim(t, [{ transform: from }, { transform: to }], { duration: 180, delay: i * 24, easing, fill: 'both' }));
  const clear = () => tokens().forEach(t => t.getAnimations().forEach(a => a.cancel()));
  const ms = 180 + tokens().length * 24;
  flip('none', 'perspective(400px) rotateY(90deg)', 'ease-in');
  await wait(ms);
  thaw();
  clear();
  flip('perspective(400px) rotateY(-90deg)', 'none', 'ease-out');
  await wait(ms);
  clear();
} });

// 輪到自己行動：自己的牌落在紙牌上，蓋一枚金色「輪到你」
const turnScene = s => ({ block: true, run: async () => {
  veil(WASH.ink, 220);
  const slot = h('div', { class: 'pc-slot' });
  const card = paperCard([h('div', { class: 'sc-who' }, roleToken(s.myRole)), slot], 'cal turn');
  cardPop(card);
  await wait(240);
  await slamStamp(slot, '輪到你', 'brass', { sound: 'turn' });
  await wait(800);
  await closeCard(card);
} });

// 每次收到新狀態時調用：播放新的演出事件；首次載入 / 換視角不重播
// 演出播完後要做的事一個接一個掛上（場景自己的 after 先做）
const chain = (sc, fn) => { const a = sc.after; sc.after = () => { a?.(); fn(); }; };
export function onState(s) {
  pullAb();
  ensureScene();
  document.body.classList.toggle('my-turn', !!s.prompt);
  setFireworks(s.fireworks || null);
  setBgm(s.phase, !!s.nomination);
  const p = prev, id = `${s.code}:${s.isSt ? 'st' : s.myId}:${s.peek?.seatId || ''}`;
  prev = s;
  lastState = s;
  // 白天被動能力觸發、等說書人裁定：響一聲（裁定卡在圓桌中央）
  if (s.isSt && s.st?.ruling && p?.isSt && !p.st?.ruling) play('turn');
  const evs = s.fx || [], top = evs.length ? evs.at(-1).seq : 0;
  // 說書人代入視角、換回來：桌面內容整個換了，淡進來
  if (p && who !== id && !reduced()) requestAnimationFrame(() => document.querySelector('.town')?.animate({ opacity: [0, 1] }, 260));
  if (!p || who !== id) { who = id; seen = Math.max(seen, top); if (!skyHold) firstSky(s.phase); return; }
  const now = Date.now();
  const wasDead = new Set(p.seats.filter(x => x.dead).map(x => x.id));
  const newlyDead = new Set(s.seats.filter(x => x.dead && !wasDead.has(x.id)).map(x => x.id));
  // 斷線重連時只補播最近的
  const fresh = evs.filter(e => e.seq > seen && (!e.at || e.at > s.serverNow - 20000));
  seen = Math.max(seen, top);
  const shownBefore = blkOverride !== undefined ? blkOverride : liveBlock(p);
  let blkScene = null;
  for (const e of fresh) {
    const sc = SCENES[e.k]?.(e, s, p);
    if (!sc) continue;
    sc.holds = (sc.holds || []).filter(x => newlyDead.has(x));
    sc.holds.forEach(x => { held.add(x); newlyDead.delete(x); });
    if (e.k === 'nominate') { nomHold++; chain(sc, () => { nomHold--; recent.nom = Date.now(); rerender(); }); }
    if (e.k === 'slay' && !e.hit) {
      const key = e.from + '>' + e.to;
      shotHold.add(key);
      chain(sc, () => { shotHold.delete(key); recent.shot.set(e.from, Date.now()); rerender(); });
    }
    if (e.k === 'role' || e.k === 'demon') { roleHold++; chain(sc, () => { roleHold--; recent.hud = Date.now(); rerender(); }); }
    if (e.msg) {
      msgHold.add(e.msg);
      chain(sc, () => { msgHold.delete(e.msg); msgShown.set(e.msg, Date.now()); rerender(); setTimeout(rerender, 3300); });
    }
    if (e.k === 'curtain') { frozen ||= p; chain(sc, thaw); }
    if (e.k === 'night') { nightHold++; chain(sc, () => { nightHold--; rerender(); }); }
    if (e.k === 'night' || e.k === 'dawn') { skyHold++; chain(sc, () => { skyHold--; if (!skyHold) sky(lastState.phase); }); }
    if (e.k === 'win') {
      winHold++;
      chain(sc, () => { winHold--; recent.crown = Date.now(); if (!document.hidden) play('crown'); rerender(); setTimeout(rerender, 950); });
    }
    if (e.k === 'mvp') { mvpHold++; chain(sc, () => { mvpHold--; recent.mvp = Date.now(); rerender(); setTimeout(rerender, 750); }); }
    if (e.k === 'votes' || e.k === 'execute') blkScene = sc;
    enqueue(sc);
  }
  newlyDead.forEach(x => recent.died.set(x, now));
  if (p.phase !== 'lobby' && s.phase === 'lobby') { frozen ||= p; const sc = resetScene(); chain(sc, thaw); enqueue(sc); }
  if (!skyHold) sky(s.phase);
  if (shownBefore !== liveBlock(s)) {
    if (!blkScene) { blkOverride = undefined; moveBlock(shownBefore, liveBlock(s)); } else {
      blkOverride = shownBefore;
      const prevAfter = blkScene.after;
      blkScene.after = () => { prevAfter?.(); const cur = blkOverride; blkOverride = undefined; moveBlock(cur, liveBlock(lastState)); rerender(); };
    }
  }
  // 「輪到你」演完，選人牌才落到桌上
  if (s.prompt && !p.prompt && !s.peek) { const sc = turnScene(s); nightHold++; chain(sc, () => { nightHold--; rerender(); }); enqueue(sc); }

  const pv = p.nomination?.votes || {};
  for (const [k, up] of Object.entries(s.nomination?.votes || {})) if (up && !pv[k]) { recent.voted.set(k, now); }
  const pa = p.nomination?.abstain || {};
  for (const k of Object.keys(s.nomination?.abstain || {})) if (!pa[k]) { recent.voted.set(k, now); }
  if (s.nomination && s.nomination.at !== p.nomination?.at) recent.nom = now;
}

// ———— 大廳和房間換班 ————
// 兩邊是同一片夜空、同一個小鎮（#scene 和大廳的背景對得上），不換景，只換控件。
// 進房：大廳的控件倒回紙上，桌布鋪開，座位從桌心一張張發出去，頂欄、側欄從屏幕外滑進來，月亮升起來。離開反過來，大廳的控件再立起來
const calm = () => document.hidden || reduced();
const pause = ms => new Promise(r => setTimeout(r, ms));
const body = document.body;
// 各件東西進場時的樣子：[選擇器, 開頭, 延遲, 時長]。退場倒著放（K 倍速）
const PARTS = [
  ['.topbar', { translate: '0 -100%' }, 160, 440],
  ['.side', { translate: '100% 0' }, 220, 480],
  ['.town > :not(.ring), .board > :not(.town)', { opacity: 0, translate: '-28px 0' }, 640, 380],
  ['.center', { opacity: 0, translate: '0 10px' }, 760, 340],
  ['.prog', { opacity: 0, translate: '0 14px' }, 800, 340],
], MAT = { opacity: 0, scale: .72, rotate: '-24deg' }, K = .6;

function dealRoom(game, back = false) {
  const ring = game.querySelector('.ring'), box = ring.getBoundingClientRect(), seats = [...ring.querySelectorAll(':scope > .seat')];
  const step = Math.min(46, 460 / (seats.length || 1)), T = Math.max(460 + seats.length * step + 420, 1160);
  const go = (el, from, delay, ms, pseudoElement) => el.animate([{ ...from, offset: 0 }], { duration: back ? ms * K : ms, delay: back ? (T - delay - ms) * K : delay, pseudoElement,
    easing: 'cubic-bezier(.2, .8, .3, 1)', fill: back ? 'forwards' : 'backwards', direction: back ? 'reverse' : 'normal' });
  PARTS.forEach(([q, from, delay, ms]) => game.querySelectorAll(q).forEach(el => go(el, from, delay, ms)));
  ['::before', '::after'].forEach(p => go(ring, MAT, 280, 560, p));
  seats.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    go(el, { translate: `${box.left + box.width / 2 - r.left - r.width / 2}px ${box.top + box.height / 2 - r.top - r.height / 2}px`, scale: .45, rotate: (i % 2 ? 16 : -16) + 'deg', opacity: 0 },
      460 + i * step, 420);
  });
  return pause(back ? T * K : T);
}
// 把 to 裏的循環動畫（雲、烏鴉、窗燈、炊煙、鐘針）對齊到 from：兩邊是同一份 skyLife / townLife，節點一一對應，換層時看不出來
function align(from, to) {
  const A = [...from.querySelectorAll('*')], B = [...to.querySelectorAll('*')];
  A.forEach((el, i) => B[i]?.getAnimations().forEach(x => {
    const y = x.animationName && el.getAnimations().find(a => a.animationName === x.animationName);
    if (y) x.currentTime = y.currentTime;
  }));
}
const scenePair = page => {
  const scene = document.getElementById('scene');
  return [[page.querySelector(':scope > .sky-life'), scene.querySelector('.sky-life')], [page.querySelector('.lobby-town .town-life'), scene.querySelector('.skyline-night .town-life')]];
};
const moonDown = on => body.classList.toggle('moon-down', on);

// 第一次畫出房間。page：還在的大廳
export function intoRoom(app, game) {
  artWatch();
  app.querySelector(':scope > .game')?.remove(); // 剛離開又進來，上一個桌面還沒退完
  const page = app.querySelector(':scope > .lobby');
  if (!page) {
    app.replaceChildren(game);
    // 回房間（刷新）開屏不演，桌面直接淡進來，別耽誤對局；邀請鏈接第一次進來，開屏揭開時才發牌
    if (document.documentElement.dataset.boot || calm()) return Promise.resolve();
    return window.boot.out.then(() => dealRoom(game));
  }
  app.append(game);
  if (calm()) { page.remove(); return Promise.resolve(); }
  page.style.top = -scrollY + 'px';
  moonDown(true);
  page.classList.add('off', 'clear'); // 大廳變透明，露出底下對齊好的 #scene
  scenePair(page).forEach(([a, b]) => align(a, b));
  setTimeout(() => moonDown(false), 260); // 等天色定下來（instantSky）才升，不然看不到過渡
  setTimeout(() => page.remove(), 900);
  return dealRoom(game);
}

// 回大廳：桌面退掉，控件立起來；天色還沒黑的（白天離開）等黑下來，再換回大廳自己的背景
export function backToLobby(app, page, show) {
  const game = app.querySelector(':scope > .game');
  const swap = () => {
    game.remove();
    if (page.classList.contains('off')) return; // 又進了別的房間
    scenePair(page).forEach(([a, b]) => align(b, a));
    page.classList.remove('clear');
    moonDown(false);
    body.dataset.phase = 'lobby';
  };
  page.classList.add('clear');
  app.prepend(page);
  if (calm()) { swap(); return show(); }
  const dark = body.dataset.phase === 'night';
  sky('night');
  moonDown(true);
  game.classList.add('gone');
  game.inert = true;
  setTimeout(show, 340);
  Promise.all([dealRoom(game, true), pause(dark ? 500 : 1500)]).then(swap);
}

// 離開房間不刷新頁面：這一局記著的東西都清掉。排著的演出快進跑完（它們掛著的計數要對上），正在演的淡掉
export function resetFx() {
  const st = document.getElementById('stage');
  if (st?.childElementCount && !calm()) {
    const ghost = st.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'stage-ghost';
    body.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    setTimeout(() => ghost.remove(), 240);
  }
  if (running) skipAll();
  prev = who = null; seen = 0; frozen = null; blkOverride = undefined; execId = null;
  lastState = { phase: 'lobby' };
  setFireworks(null);
  setBgm(null);
  body.classList.remove('my-turn');
}

// 異步到達的圖：CSS 背景圖到了沒有事件。進房間時看一眼桌面要用的圖，還沒到的給 body 加 wait-名字（art.css 先藏著），解碼完摘掉，淡入
const ART = { 'table-day': ['table-day'], 'table-night': ['table-night'], 'seat-empty': ['seat-empty'], plate: ['plate'], moon: ['moon'], sun: ['sun'],
  'town-day': ['town-far-day', 'town-mid-day', 'town-near-day'] };
function artWatch() {
  for (const [k, names] of Object.entries(ART)) {
    const imgs = names.map(n => Object.assign(new Image(), { src: `img/art/${n}.webp` }));
    if (imgs.every(i => i.complete)) continue;
    body.classList.add('wait-' + k);
    Promise.all(imgs.map(i => i.decode().catch(() => {}))).then(() => body.classList.remove('wait-' + k));
  }
}
