// 線下多設備：玩家在自己手機上發起的公開行動（提名、宣稱獵手開槍、雜耍藝人公開猜、月之子 / 呆瓜死後選人）先交給說書人（服務端 lib/asks.js）。
// 嘴上照樣說，手機上落實，說書人掌控節奏：
// - 玩家：座位菜單裏的這幾項（askItems，不能做的照樣列出、變暗、寫原因）；交出去以後桌邊一張小紙條（askNote）：等說書人、撤回，
//   處理完蓋一枚章（受理 / 駁回 / 作廢 + 原因），過幾秒收走
// - 說書人：桌邊一疊請求（askTray），每一條從發起人的座位飛過來，按先後排；點一條就是桌心那張行動卡（manual.js），誰對誰已經填好。
//   審判、裁定進行中的照樣排著，變暗，點了說為什麼現在不能處理。死後選人不在這裏：在那個人的死後選擇卡上（stepcard.js lastWordCard）
// 兩張紙都擺在離圓桌中心最近、又不壓任何東西（座位、桌心的牌和按鈕、訃告、展示牌堆、審判牌……）的地方（placeAsks），放得下就不挪
import { h, toast, menu } from './ui.js';
import { SCRIPTS } from './roles.js';
import { seatBadge, mini, icon, w } from './glyph.js';
import { rolePicker, openAsk, openAskId } from './manual.js';
import { sceneBusy } from './fx.js';

// 劇本裏有沒有獵手：誰都可以宣稱自己是獵手，但劇本裏根本沒有（黯月初升……）就沒人會這麼說，不放（flow.js dayActs 也用這一條）
export const hasGun = s => !!SCRIPTS[s.scriptId]?.roles.includes('slayer') || s.seats.some(x => x.role === 'slayer' || x.fakeRole === 'slayer');

// ───── 玩家：座位菜單 ─────
// 規則和線上同一套（服務端 lib/day.js nomRule / slayRule / juggleRule 再驗一次）；線上局返回空，照舊走 town.js 原來那幾項
export function askItems(ctx, seat) {
  const s = ctx.state, me = s.seats.find(x => x.mine), a = s.asks;
  if (!a || !me || s.phase !== 'day') return [];
  const self = !!seat.mine, mine = k => a.list.find(x => x.kind === k);
  const go = (act, args) => () => ctx.act(act, { targetId: seat.id, ...args });
  const item = (label, why, fn) => (why ? { label: [h('s', {}, label), h('small', {}, why)], off: true } : { label, onclick: fn });
  // 已經交給說書人、還在等的同一件事：不再重複提，灰著寫明
  const sent = label => ({ label: [label, h('small', {}, '已交給說書人')], off: true });
  const nomL = self ? '提名自己' : '提名他', slayL = self ? '宣稱獵手：向自己開槍' : '宣稱獵手：向他開槍';
  const nomNo = me.dead ? '你已死亡' : s.dayOver ? '今日已執行處決' : s.nominators.includes(me.id) ? '你今天提名過了'
    : s.nominees.includes(seat.id) ? (self ? '你今天被提名過了' : '他今天被提名過了') : null;
  const slayNo = me.dead ? '你已死亡' : a.shot ? '你今天開過槍了' : null;
  const jg = mine('juggle')?.guesses.find(x => x.id === seat.id); // 雜耍藝人：這個人已經猜過（還在排隊）的，再猜就是改
  const juggle = () => rolePicker(ctx, id => ctx.act('juggle', { targetId: seat.id, role: id }), [mini('juggler'), seatBadge(s, seat.id)]);
  // 雜耍藝人的「公開猜」只有雜耍藝人有：遮住身份時不列（旁邊的人瞄一眼菜單就知道他是雜耍藝人）。
  // 要猜時當面說出來、說書人在桌心替他記（manual.js），或者「不再遮住」以後自己在手機上提；已經交出去的（桌邊紙條上也看得到）照常能改
  const canJuggle = s.juggleLeft > 0 && !s.veiled;
  return [
    mine('nom')?.to === seat.id ? sent(nomL) : item(nomL, nomNo, go('nominate')),
    hasGun(s) && (mine('slay')?.to === seat.id ? sent(slayL) : item(slayL, slayNo, go('slay'))),
    jg ? { label: [self ? '改猜自己的角色' : '改猜他的角色', mini(jg.role, 'menu-ico')], onclick: juggle }
      : canJuggle && { label: self ? `公開猜自己的角色（還有 ${s.juggleLeft} 次）` : `公開猜他的角色（還有 ${s.juggleLeft} 次）`, onclick: juggle },
  ];
}

// 一條請求的內容：誰（說書人那邊才寫）+ 動作詞 + 對象。不寫成句子，座位號圓章和動作詞一眼看懂
const VERB = { nom: ['提名', 'bad'], slay: ['開槍', 'bad'], juggle: ['猜', 'ink'], word: ['選', 'ink'] };
function what(s, a, who) {
  const [verb, tone] = VERB[a.kind] || ['?', ''];
  return h('span', { class: 'ak-what' }, who && seatBadge(s, a.from), a.kind === 'slay' && icon('aim', 'ak-ico'), a.kind === 'juggle' && mini('juggler'),
    w(verb, tone), a.kind === 'juggle' ? (a.guesses || []).map(g => h('span', { class: 'ak-g', 'data-key': 'g-' + g.id }, seatBadge(s, g.id), mini(g.role))) : seatBadge(s, a.to));
}

// ───── 玩家：交給說書人的小紙條 ─────
// 結果留多久（毫秒）：受理之後全桌就在演提名 / 開槍，章一閃就收；駁回、作廢要讓他看清楚（作廢還有原因）
const SHOW = { ok: 4000, no: 5000, void: 7000 };
const RES = { ok: ['受理', 'good'], no: ['駁回', 'evil'], void: ['作廢', 'muted'] };
// 結果是在擋全屏的演出（提名、開槍、處決、入夜……）底下到的：章等演出播完再蓋，從那一刻起算留多久，不在演出背後就過完了
const landed = new Map(); // 請求 id → 章蓋下的時刻
let wakeAt = 0, wakeT = 0;
// 最早到點的那一條收走時再畫一次（狀態不一定會再推過來）
function wakeUp(ctx, left) {
  const at = Date.now() + left;
  if (wakeT && wakeAt <= at && wakeAt > Date.now()) return;
  clearTimeout(wakeT);
  wakeAt = at;
  wakeT = setTimeout(() => { wakeT = 0; ctx.render(); }, left + 30);
}
function askNote(ctx) {
  const s = ctx.state, a = s.asks;
  if (!a) return null;
  const now = ctx.now(), rows = [];
  for (const x of a.list) {
    rows.push({ at: x.at, el: h('div', { class: 'ak-row', 'data-key': x.id, 'data-id': x.id, 'data-from': x.from, 'data-exit': true }, what(s, x),
      h('span', { class: 'waiting' }, h('i'), h('i'), h('i')),
      // 雜耍藝人：猜了好幾個時，每個猜測可以單獨拿掉（點那個猜測）
      h('button', { class: 'btn sm ghost ak-x', onclick: () => ctx.act('unask', { id: x.id }) }, '撤回')) });
  }
  const busy = sceneBusy();
  let last = null; // 最近蓋的一枚章：紙條只剩籤頭時蓋在籤頭上，結果照樣看得到
  for (const d of a.done) {
    const show = SHOW[d.res];
    if (!show || a.list.some(x => x.id === d.id)) continue; // 自己撤回的不蓋章；撤銷以後又排回去的照排隊畫
    // 演出還在播：這條先照原樣排著（不能再撤回），播完再蓋章
    if (busy && !landed.has(d.id)) {
      if (now - d.done > 60000) continue;
      wakeUp(ctx, 300);
      rows.push({ at: d.at, el: h('div', { class: 'ak-row done', 'data-key': d.id, 'data-id': d.id, 'data-exit': true }, what(s, d)) });
      continue;
    }
    if (!landed.has(d.id)) landed.set(d.id, Math.max(d.done, now));
    const left = landed.get(d.id) + show - now;
    if (left <= 0) continue;
    wakeUp(ctx, left);
    const [word, tone] = RES[d.res];
    if (!last || landed.get(d.id) >= last.t) last = { t: landed.get(d.id), word, tone };
    rows.push({ at: d.at, el: h('div', { class: 'ak-row done ' + d.res, 'data-key': d.id, 'data-id': d.id, 'data-exit': true }, what(s, d),
      h('b', { class: 'ak-stamp ' + tone }, word), d.why && h('small', { class: 'ak-why' }, d.why)) });
  }
  if (!rows.length) return null;
  rows.sort((x, y) => x.at - y.at);
  const waiting = a.list.length > 0;
  return h('div', { class: 'ask-dock ak-note' + (waiting ? '' : ' settled'), 'data-key': 'ask-note', 'data-exit': true },
    h('button', { class: 'ak-tag', type: 'button' }, icon('send', 'ak-tico'), '交給說書人', last && h('b', { class: 'ak-stamp ak-tstamp ' + last.tone, 'data-key': 'ts-' + last.t }, last.word)),
    rows.map(r => r.el));
}
// 雜耍藝人的紙條上點某一個猜測：只撤回這一個。紙條只剩籤頭（.mini，桌上沒地方攤開）時點它：列出交出去的每一條，點了撤回
function noteClick(ctx, e) {
  const note = e.currentTarget;
  if (note.classList.contains('mini')) {
    const s = ctx.state, list = s.asks?.list || [];
    if (!list.length) return;
    const un = (id, seatId) => () => ctx.act('unask', { id, seatId });
    return menu(note, '交給說書人', list.flatMap(x => (x.kind === 'juggle' && x.guesses.length > 1
      ? x.guesses.map(g => ({ label: [h('span', { class: 'ak-what' }, mini('juggler'), w('猜', 'ink'), seatBadge(s, g.id), mini(g.role)), h('i', { class: 'ak-go ak-un' }, '撤回')], onclick: un(x.id, g.id) }))
      : [{ label: [what(s, x), h('i', { class: 'ak-go ak-un' }, '撤回')], onclick: un(x.id) }])));
  }
  const g = e.target.closest('.ak-g'), row = g?.closest('.ak-row:not(.done)');
  if (!g || !row || row.querySelectorAll('.ak-g').length < 2) return;
  ctx.act('unask', { id: row.dataset.id, seatId: g.dataset.key.slice(2) });
}

// ───── 說書人：一疊請求 ─────
// 此刻處理不了的原因（和服務端 lib/asks.js askWait 一樣）
export const askWait = s => (s.st?.ruling ? '先處理完裁定' : s.nomination ? '審判結束後再處理' : null);
const trayList = s => (s.isSt && !s.peek && s.st?.asks?.list.filter(a => a.kind !== 'word')) || [];
function askTray(ctx) {
  const s = ctx.state, list = trayList(s);
  if (!list.length) return null;
  const wait = askWait(s), open = openAskId();
  const tap = a => (wait ? toast(wait) : openAsk(ctx, a));
  const row = a => h('button', { class: 'ak-row' + (open === a.id ? ' on' : '') + (wait ? ' wait' : ''), 'data-key': a.id, 'data-id': a.id, 'data-from': a.from, 'data-exit': true,
    title: wait || null, onclick: () => tap(a) }, what(s, a, true), h('i', { class: 'ak-go' }, '›'));
  // 籤頭點開看全部（橫排時超過三條的收在這裏，.more）
  const all = e => menu(e.currentTarget, `請求 ${list.length}` + (wait ? (s.st?.ruling ? ' · 裁定中' : ' · 審判中') : ''),
    list.map(a => ({ label: [what(s, a, true), h('i', { class: 'ak-go' }, '›')], onclick: () => tap(a) })));
  return h('div', { class: 'ask-dock ak-tray' + (wait ? ' waits' : '') + (list.length > 3 ? ' more' : ''), 'data-key': 'ask-tray', 'data-exit': true },
    h('button', { class: 'ak-tag', onclick: all }, '請求', h('i', { class: 'ak-n' }, list.length), wait && h('small', { class: 'ak-wait' }, s.st?.ruling ? '裁定中' : '審判中')),
    list.map(row));
}

// 圓桌外層（town.js）放的那一張：說書人是請求疊，玩家是自己的紙條
export function askDock(ctx) {
  const s = ctx.state;
  if (s.phase !== 'day' && s.phase !== 'dawn' && s.phase !== 'night') return null;
  // 剛進房間 / 刷新 / 換了視角時已經在的請求：直接擺著，不從座位飛過來
  const who = `${s.code}:${s.gameId}:${s.isSt ? 'st' : s.myId}`;
  if (primed !== who) { primed = who; for (const a of (s.isSt ? s.st?.asks : s.asks)?.list || []) seenRows.add(a.id); }
  const el = s.isSt ? askTray(ctx) : askNote(ctx);
  if (!el) return null;
  if (!s.isSt) el.onclick = e => noteClick(ctx, e);
  if (place.key !== el.dataset.key) Object.assign(place, { key: el.dataset.key, l: null, t: null, mode: '' });
  if (place.mode) el.classList.add(place.mode);
  if (place.l == null) el.classList.add('unplaced');
  else { el.style.setProperty('--al', place.l + 'px'); el.style.setProperty('--at', place.t + 'px'); }
  return el;
}

// ───── 擺位 ─────
// 離圓桌中心（注意力在那裏）最近、又不壓任何東西的一處。已經擺好的、還放得下的不挪（不在說書人眼前換位置）；
// 豎著一疊放不下就橫過來排成一行（.slim）；哪兒都放不下（說書人點開了一條，桌心的卡和按鈕佔滿了）就只剩籤頭（.mini，點開看全部），
// 絕不壓座位和按鈕。量好的位置記在 place，重繪時帶上；第一次量好之前不顯示，量好了才出來
const MODES = ['', 'slim', 'mini'];
const place = { key: null, l: null, t: null, mode: '' };
const seenRows = new Set(); // 已經飛過的請求：重繪、換位置不再飛；剛打開頁面時已經在的直接擺著
let primed = null; // 哪個房間、哪一局、誰的視角（換了就當剛打開）
export function placeAsks() {
  const d = document.querySelector('.town > .ask-dock:not(.leaving)'), town = d?.parentElement, ring = town?.querySelector(':scope > .ring');
  if (!d || !ring) return;
  // 桌心的牌、座位還在動（發牌、入場、審判牌落下）時量到的不是最後的位置：等動完再量
  const moving = el => el.getAnimations().some(x => x.playState === 'running' && x.effect?.getComputedTiming().iterations !== Infinity);
  // 換階段時「第 N 天」在桌心亮一下就飛到角上：等它走了再擺，不然紙條被擠到角落裏、之後也不回來
  if ([...ring.querySelectorAll(':scope > .center > *, :scope > .seat'), ...town.querySelectorAll(':scope > .trial')].some(moving)
    || (place.l == null && ring.querySelector(':scope > .center > .phase-title'))) { setTimeout(placeAsks, 250); return; }
  const t = town.getBoundingClientRect(), rect = el => el.getBoundingClientRect(), seen = r => r.width && r.height;
  const tokens = [...ring.querySelectorAll(':scope > .seat > .seat-token')].map(rect).filter(seen).map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + 4 }));
  const parts = [...ring.querySelectorAll(':scope > .seat > :is(.plate, .seat-more), :scope > .seat .mk.at, :scope > .seat .crown, :scope > .center > *, :scope > .center :is(.card, .ic-top, .ic-tag, .ic-head, .ic-body, .ic-foot, .row, .btn, .tb-roles, .tb-foot), :scope > .blk')].map(rect).filter(seen);
  // 圓桌外面的：「第 N 天」、訃告、展示牌堆、觀眾席、審判牌，還有浮在小鎮上的角色牌（.board 裏和 .town 並排的）
  const around = [...town.querySelectorAll(':scope > :not(.ring, .ask-dock)'), ...[...town.parentElement.children].filter(el => el !== town)].map(rect).filter(seen);
  const r0 = ring.getBoundingClientRect(), cx = r0.left + r0.width / 2 - t.left, cy = r0.top + r0.height / 2 - t.top;
  const pad = town.offsetWidth > 640 ? 10 : 6;
  const lap = (r, L, T, R, Bt) => Math.max(0, Math.min(r.right, R) - Math.max(r.left, L)) * Math.max(0, Math.min(r.bottom, Bt) - Math.max(r.top, T));
  const fit = (l, top, w, ht) => {
    if (l < pad || top < pad || l + w > t.width - pad || top + ht > t.height - pad) return Infinity;
    const L = t.left + l - 3, R = L + w + 6, T = t.top + top - 3, Bt = T + ht + 6;
    let n = 0;
    for (const r of parts) n += lap(r, L, T, R, Bt);
    for (const r of around) n += lap(r, L, T, R, Bt);
    for (const c of tokens) { const dd = Math.hypot(c.x - Math.min(Math.max(c.x, L), R), c.y - Math.min(Math.max(c.y, T), Bt)); if (dd < c.r) n += (c.r - dd) ** 2; }
    return n;
  };
  const size = mode => { d.classList.remove('slim', 'mini'); if (mode) d.classList.add(mode); return [d.offsetWidth, d.offsetHeight]; };
  let pick = null;
  // 原來的位置還放得下（大小沒變、或者變了還不壓東西）：不挪。收起來的（橫排、只剩籤頭），在原處能攤得更開就攤開
  if (place.l != null) {
    for (const mode of MODES.slice(0, MODES.indexOf(place.mode) + 1)) {
      const [w, ht] = size(mode);
      if (fit(place.l, place.t, w, ht) === 0) { pick = { l: place.l, t: place.t, mode }; break; }
    }
  }
  if (!pick) {
    const step = 8, best = { n: Infinity, dist: Infinity };
    for (const mode of MODES) {
      const [w, ht] = size(mode);
      for (let top = pad; top + ht <= t.height - pad; top += step) {
        for (let l = pad; l + w <= t.width - pad; l += step) {
          const n = fit(l, top, w, ht);
          if (n > best.n) continue;
          const dist = Math.hypot(l + w / 2 - cx, top + ht / 2 - cy);
          if (n < best.n || dist < best.dist) Object.assign(best, { n, dist, l, t: top, mode });
        }
      }
      if (best.n === 0) break;
    }
    if (best.n === Infinity) return;
    pick = { l: Math.round(best.l), t: Math.round(best.t), mode: best.mode };
  }
  size(place.mode);
  const first = place.l == null;
  if (first || pick.l !== place.l || pick.t !== place.t || pick.mode !== place.mode) {
    // 攤開 / 收成一行 / 只剩籤頭：換的那一下紙條從原處重新展開，不是一下子變了個樣
    const morph = !first && pick.mode !== place.mode && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    Object.assign(place, pick);
    if (morph) d.animate([{ opacity: .3, scale: .9 }, { opacity: 1, scale: 1 }], { duration: 240, easing: 'cubic-bezier(.2, .8, .3, 1)' });
    size(pick.mode);
    d.style.setProperty('--al', pick.l + 'px');
    d.style.setProperty('--at', pick.t + 'px');
    if (first) { void d.offsetWidth; d.classList.remove('unplaced'); } // 第一次：先到位再出來，不從別處滑過來
  }
  flyRows(d, ring);
}
// 新到的一條從發起人的座位飛過來（說書人那邊；玩家那邊從自己的座位飛出去）：紙條先折得很小、斜著，落到疊上展開
function flyRows(d, ring) {
  const rows = [...d.querySelectorAll(':scope > .ak-row:not(.leaving)')];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const r of rows) {
    if (seenRows.has(r.dataset.id)) continue;
    seenRows.add(r.dataset.id);
    if (r.classList.contains('done')) continue;
    // 落下後亮一會兒：金色的光暈慢慢退掉（說書人那邊是「來了一條新的」，玩家那邊是「交出去了」）
    r.animate([{ boxShadow: '0 0 0 2px #e3b33b, 0 0 14px 4px #f6cf55b3' }, { boxShadow: '0 0 0 2px #e3b33b00, 0 0 14px 4px #f6cf5500' }], { duration: 2200, delay: still ? 0 : 560, easing: 'ease-in', fill: 'backwards' });
    if (still) continue;
    const seat = r.dataset.from && ring.querySelector(`:scope > .seat[data-key="${r.dataset.from}"] > .seat-token`);
    const a = seat?.getBoundingClientRect(), b = r.getBoundingClientRect();
    if (!a?.width || !b.width) continue;
    const dx = a.left + a.width / 2 - b.left - b.width / 2, dy = a.top + a.height / 2 - b.top - b.height / 2;
    r.animate([{ translate: `${dx}px ${dy}px`, scale: .3, rotate: '-14deg', opacity: .2 }, { translate: `${dx * .35}px ${dy * .35 - 18}px`, scale: .7, rotate: '6deg', opacity: 1, offset: .55 },
      { translate: '0 0', scale: 1, rotate: '0deg', opacity: 1 }], { duration: 620, easing: 'cubic-bezier(.3, .7, .3, 1)' });
  }
}
