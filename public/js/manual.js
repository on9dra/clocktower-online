// 說書人的手邊工具：上傳 / 社區劇本、貼標記（只有說書人看得到）、線下局替玩家做白天的事（提名、開槍、雜耍藝人猜：
// 圓桌中央一張小卡，點桌上的座位）、傳閱身份、整屏「給他看」（系統不認識的角色要告訴他什麼時用）
import { h, modal, closeModal, toast, seatLabel } from './ui.js';
import { ROLES, SCRIPTS } from './roles.js';
import { COMMUNITY } from './community.js';
import { B, BW } from './flow.js';
import { seatBadge, mini, icon, w } from './glyph.js';
import { passRoles, passRoleCard } from './pass.js';
import { rolePanel } from './rolepick.js';

export const isOne = s => !!s.oneDevice;
// 傳閱身份：從 from 那個座位開始的名字座位（不給就是全部）
export const passFrom = (ctx, from, onDone) => { const s = ctx.state, l = s.seats.filter(x => x.local && x.role).map(x => x.id); passRoles(s, from ? [from] : l, onDone); };
// 單設備第 1 夜：先讓每個人看自己的身份（傳閱，或者已經用實體牌發好了），做完記在本機，才出夜晚的第一張卡
const passKey = s => `botc.passed.${s.code}.${s.gameId}`;
export const needPass = ctx => { const s = ctx.state; return s.isSt && !s.peek && s.oneDevice && s.phase === 'night' && s.night === 1 && !ctx.ls.get(passKey(s)); };
export function passCard(ctx) {
  const s = ctx.state, done = () => { ctx.ls.set(passKey(s), '1'); ctx.render(); };
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, h('div', { class: 'ic-head' }, icon('book'), w('每人看自己的身份', 'ink'))),
    // 主次分開：傳閱是正事（寬，左），用實體牌發過了就是跳過這一步（窄，右）
    h('div', { class: 'ic-foot' }, h('div', { class: 'row r73' }, B([icon('eye'), '傳閱身份'], () => passFrom(ctx, null, done)), B('跳過', done, 'ghost'))));
}
export const demonsOf = s => s.seats.filter(x => x.role && ROLES[x.role].team === 'demon' && !x.dead);

// ───── 上傳劇本 ─────
const KEEP = ['id', 'name', 'author', 'team', 'ability', 'firstNight', 'otherNight', 'firstNightReminder', 'otherNightReminder', 'reminders', 'remindersGlobal'];
const MAX_FILE = 4 * 1024 * 1024, MAX_SEND = 60 * 1024; // 服務端單條消息最多 64KB
// 圖片（可能內嵌得很大）、風味文字不用，發之前去掉
const slim = e => (e && typeof e === 'object' ? Object.fromEntries(KEEP.filter(k => k in e).map(k => [k, e[k]])) : e);

// 本機記住導入過的劇本（每台設備自己的，最近用的在前），下次點「上傳劇本」直接從列表裏選，不用再找文件
const MINE = 'botc.myScripts', MINE_MAX = 12;
const mine = ctx => { try { const a = JSON.parse(ctx.ls.get(MINE) || '[]'); return Array.isArray(a) ? a.filter(x => x && Array.isArray(x.entries)) : []; } catch { return []; } };
const keepMine = (ctx, list) => {
  // 存不下（瀏覽器空間滿了）就丟掉最舊的再試
  for (let l = list.slice(0, MINE_MAX); l.length; l = l.slice(0, -1)) {
    try { localStorage.setItem(MINE, JSON.stringify(l)); return; } catch { /* 太大 */ }
  }
};
const remember = (ctx, r, entries) => {
  const meta = entries.find(e => e && typeof e === 'object' && e.id === '_meta') || {};
  const one = { name: r.name, author: String(meta.author || '').slice(0, 40), roles: r.roles, entries };
  keepMine(ctx, [one, ...mine(ctx).filter(x => !(x.name === one.name && x.author === one.author))]);
};
async function send(ctx, entries, fresh) {
  const r = await ctx.st('upload', { entries });
  if (!r.ok) return;
  remember(ctx, r, entries);
  if (fresh) toast(`${r.name}：${r.roles} 個角色` + (r.skipped.length ? `，跳過 ${r.skipped.join('、').slice(0, 40)}` : ''), 4000);
}
function pickFile(ctx) {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_FILE) return toast('文件太大了');
    let entries;
    try { entries = JSON.parse(await file.text()); } catch { return toast('這不是劇本 Json'); }
    if (!Array.isArray(entries)) return toast('這不是劇本 Json');
    entries = entries.map(slim);
    if (JSON.stringify(entries).length > MAX_SEND) return toast('這本劇本太大了');
    send(ctx, entries, true);
  };
  input.click();
}
// 沒導入過：直接開文件框。導入過：先列出這台設備上導入過的，下面是導入新的
export function uploadScript(ctx) {
  const list = mine(ctx);
  if (!list.length) return pickFile(ctx);
  const cur = ctx.state.scriptId === 'custom' && SCRIPTS.custom?.name;
  const row = x => {
    const el = h('div', { class: 'comm-row mine' + (x.name === cur ? ' on' : '') },
      h('button', { class: 'mine-use', onclick: () => { closeModal(); if (x.name !== cur) send(ctx, x.entries); } },
        h('b', {}, x.name), h('span', {}, [x.roles + ' 個角色', x.author].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn mine-x', title: '從這台設備上刪掉', onclick: () => {
        keepMine(ctx, mine(ctx).filter(y => !(y.name === x.name && y.author === x.author)));
        el.style.pointerEvents = 'none';
        el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
      } }, '✕'));
    return el;
  };
  modal('上傳劇本', h('div', { class: 'mine-box' }, h('div', { class: 'mine-list' }, list.map(row)),
    h('button', { class: 'btn ghost mine-new', onclick: () => { closeModal(); pickFile(ctx); } }, '導入新的 Json')));
}

// 社區劇本：海外熱門（community.js，botcscripts 收藏榜）+ 鐘樓劇本博物館整理的（tools/community-build.mjs 生成的 public/community/）
// 博物館的目錄打開列表時才下載，某一本選中時才下載那一本。左邊分類，上面搜索和「全自動 / 官方角色 / 含原創」篩選；
// 現在的人數開不了的變暗，點了說原因。換分類只換列表那一頁；篩選、搜索只藏 / 露行，不重畫
let museum = null; // 目錄的 Promise：{ list: [{ k, name, author, cat, kind, lo, hi, n }] }
const loadMuseum = () => (museum ||= fetch('/community/index.json').then(r => (r.ok ? r.json() : Promise.reject())).catch(() => { museum = null; return null; }));
// 博物館的分類（順序、名字在這裏定，index.json 裏只是 key）
const CATS = [['official', '官方推薦'], ['learn', '快速上手'], ['small', '小型劇本'], ['match', '賽事劇本'], ['fun', '主題玩法'], ['original', '原創角色'], ['folk', '民間創意'], ['more', '未分類']];
const KINDS = [['all', '全部'], ['auto', '全自動'], ['off', '官方角色'], ['home', '含原創']];
const raw = s => document.createTextNode(s); // 博物館的劇本名、作者照原樣顯示，不過翻譯（海外熱門的名字是自己譯的繁體，照常走 tr）
export function communityScripts(ctx) {
  const s = ctx.state, cur = s.scriptId === 'custom' && SCRIPTS.custom?.name, seats = s.seats.length;
  const botc = COMMUNITY.map(c => ({ name: c.name, author: c.author, en: c.en, cat: 'botc', kind: c.auto ? 'auto' : 'off', lo: 5, hi: c.small ? 6 : 15, c }));
  const view = { cat: 'botc', kind: 'all', q: '' };
  const range = x => (x.lo === 5 && x.hi === 15 ? null : x.lo === x.hi ? `${x.lo}人` : `${x.lo}-${x.hi}人`);
  const fits = x => seats < 5 || (seats >= x.lo && seats <= x.hi);
  const use = async (x, el) => {
    if (x.name === cur) return closeModal();
    if (!fits(x)) return toast(`這本只能 ${x.lo}-${x.hi} 人玩，現在是 ${seats} 人`);
    if (x.c) { closeModal(); return ctx.st('upload', { entries: [{ id: '_meta', name: x.c.name, author: x.c.author, small: x.c.small }, ...x.c.roles] }); }
    if (el.classList.contains('busy')) return;
    el.classList.add('busy');
    const entries = await fetch(`/community/s/${x.k}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    el.classList.remove('busy');
    if (!entries) return toast('劇本下載失敗，再試一次');
    closeModal();
    ctx.st('upload', { entries });
  };
  const row = x => {
    const tag = x.kind === 'auto' ? '全自動' : null; // 只標少見的；含原創角色的太多了，標了每行都有，交給上面的篩選
    const el = h('button', { class: 'comm-row' + (x.name === cur ? ' on' : '') + (fits(x) ? '' : ' off') },
      h('b', {}, x.c ? x.name : raw(x.name)), h('i', {}, [range(x), tag].filter(Boolean).join(' · ')),
      h('span', {}, x.c ? `${x.en} · ${x.author}` : raw(x.author || '佚名')));
    el.onclick = () => use(x, el);
    el.x = x;
    return el;
  };
  // 每個分類的列表第一次打開時才建；篩選、搜索只改 hidden
  const all = [...botc], lists = new Map(), navBtn = new Map();
  const listOf = cat => {
    if (!lists.has(cat)) lists.set(cat, h('div', { class: 'comm-list' }, all.filter(x => cat === '*' || x.cat === cat).map(row)));
    return lists.get(cat);
  };
  const match = x => (view.kind === 'all' || x.kind === view.kind) && (!view.q || [x.name, x.author, x.en].some(t => t && t.toLowerCase().includes(view.q)));
  const empty = h('p', { class: 'comm-empty', hidden: true }, '沒有符合的劇本');
  const pane = h('div', { class: 'comm-view' });
  function apply() {
    const cat = view.q ? '*' : view.cat, list = listOf(cat);
    for (const el of list.children) el.hidden = !match(el.x);
    empty.hidden = [...list.children].some(el => !el.hidden);
    for (const [k, b] of navBtn) {
      b.classList.toggle('on', !view.q && k === view.cat);
      b.lastChild.textContent = all.filter(x => x.cat === k && match(x)).length;
    }
    return list;
  }
  // 手機上分類是一排橫滑的：選中的那個不在視野裏就滑過去
  const reveal = (smooth = true) => {
    const on = !view.q && navBtn.get(view.cat), nav = on?.parentElement;
    if (!on || nav.scrollWidth <= nav.clientWidth) return;
    const r = on.getBoundingClientRect(), n = nav.getBoundingClientRect();
    if (r.left < n.left || r.right > n.right) nav.scrollBy({ left: r.left - n.left - 24, behavior: smooth ? 'smooth' : 'auto' });
  };
  function show(dir = 0) {
    const list = apply();
    reveal(dir !== 0); // 點分類時滑過去；剛打開、搜索時直接停好
    if (pane.firstChild === list) return;
    pane.replaceChildren(list, empty);
    pane.scrollTop = 0;
    if (dir) list.animate([{ transform: `translateY(${dir * 18}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2, .8, .3, 1)' });
  }
  const order = () => [...navBtn.keys()];
  const go = k => {
    if (k === view.cat && !view.q) return;
    const dir = Math.sign(order().indexOf(k) - order().indexOf(view.cat)) || 1;
    view.cat = k; ctx.ls.set('botc.commCat', k);
    if (view.q) { view.q = ''; search.value = ''; }
    show(dir);
  };
  const navItem = (k, name) => {
    const b = h('button', { class: 'comm-cat' }, name, h('i', {}, '0'));
    b.onclick = () => go(k);
    navBtn.set(k, b);
    return b;
  };
  const nav = h('nav', { class: 'comm-cats' }, navItem('botc', '海外熱門'));
  const search = h('input', { class: 'comm-q', type: 'search', placeholder: '搜索劇本名、作者' });
  search.oninput = () => { view.q = search.value.trim().toLowerCase(); show(); };
  const kinds = KINDS.map(([k, t]) => h('button', { class: 'comm-kind' + (k === 'all' ? ' on' : ''), onclick: e => {
    view.kind = k;
    for (const b of kinds) b.classList.toggle('on', b === e.currentTarget);
    show();
  } }, t));
  modal('社區劇本', h('div', { class: 'comm' }, h('div', { class: 'comm-top' }, search, h('div', { class: 'comm-kinds' }, kinds)), h('div', { class: 'comm-body' }, nav, pane)),
    { wide: true, cls: 'comm-modal' });
  const saved = ctx.ls.get('botc.commCat');
  show();
  // 博物館的分類到了再一個個加進左邊（淡入），之前選過的分類到了就翻過去
  loadMuseum().then(m => {
    if (!m || !nav.isConnected) return;
    all.push(...m.list);
    lists.delete('*');
    CATS.forEach(([k, name], i) => {
      if (!m.list.some(x => x.cat === k)) return;
      const b = navItem(k, name);
      nav.append(b);
      b.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: i * 30, easing: 'ease-out', fill: 'backwards' });
    });
    nav.append(h('small', { class: 'comm-src' }, '整理：鐘樓劇本博物館'));
    const mine = cur && all.find(x => x.name === cur); // 先翻到現在用的那本所在的分類，沒有就是上次看的
    view.cat = mine ? mine.cat : saved && navBtn.has(saved) ? saved : view.cat;
    pane.replaceChildren();
    show();
  });
}

// ───── 白天替玩家做事：圓桌中央一張小卡 ─────
// kind：nom 提名 / slay 宣稱獵手開槍 / juggle 雜耍藝人猜；from 是做事的人，to 是點到的人，guesses 是雜耍藝人猜的 [{ id, role }]
// 提名、開槍從圓桌中央的兩個按鈕開始（flow.js stCenter）：先點做事的人，再點對象（可以是他自己），點齊了按卡上的「確認」才結算（提名進審判、開槍進裁定）
let act = null;
export const mayNominate = (s, seat) => s.phase === 'day' && !s.nomination && !s.dayOver && !seat.dead && !s.nominators.includes(seat.id);
const free = s => s.phase === 'day' && !s.nomination && !s.st?.ruling;
const live = s => {
  if (!act) return false;
  const from = act.from && s.seats.find(x => x.id === act.from);
  if (!act.from) return free(s) && !(act.kind === 'nom' && s.dayOver);
  return !!from && (act.kind === 'nom' ? mayNominate(s, from) : free(s) && !from.dead);
};
export function startAct(ctx, kind, seat = null) { act = { kind, from: seat?.id || null, to: null, guesses: [] }; ctx.render(); }
export function closeAct(ctx) { if (!act) return false; act = null; ctx.render(); return true; }
// 按了確認才發：提名 → 審判牌，開槍 → 裁定卡。服務器說不行（他今天提名過了……）就退回第二步，提示原因
function fire(ctx) {
  if (act.busy) return; // 連點兩下確認：只發一次
  act.busy = true;
  const mine = act, { kind, from, to, guesses } = act, done = r => { if (act !== mine) return; act.busy = false; if (r.ok) closeAct(ctx); else if (kind !== 'juggle') { act.to = null; ctx.render(); } };
  if (kind === 'nom') ctx.st('nominate', { fromId: from, toId: to }).then(done);
  if (kind === 'slay') ctx.st('slayFor', { fromId: from, toId: to }).then(done);
  if (kind === 'juggle') ctx.st('juggleFor', { seatId: from, guesses: guesses.map(g => ({ id: g.id, role: g.role })) }).then(done);
}
// 給 town.js：卡開著時點桌上的座位
export const actPicking = ctx => {
  const s = ctx.state;
  if (!live(s)) return null;
  // 第一步：誰提名 / 誰開槍（提名過的、死了的點不了）
  if (!act.from) {
    const can = s.seats.filter(x => (act.kind === 'nom' ? mayNominate(s, x) : !x.dead)).map(x => x.id);
    const dead = id => s.seats.find(x => x.id === id)?.dead;
    // 點了不能選的人：說原因，不開座位菜單
    const why = id => (dead(id) ? (act.kind === 'nom' ? '死去的玩家不能提名' : '死去的玩家不能開槍') : act.kind === 'nom' && s.nominators.includes(id) ? '他今天提名過了' : null);
    return { can: new Set(can), on: new Set(), fixed: new Set(), why, pick: id => { act.from = id; ctx.render(); } };
  }
  // 做事的人金圈、點到的人亮起（是同一個人時亮起）
  const me = on => new Set(on.includes(act.from) ? [] : [act.from]);
  // 雜耍藝人可以猜自己：點過的人亮著，再點一下撤回
  if (act.kind === 'juggle') return { can: new Set(s.seats.map(x => x.id)), on: new Set(act.guesses.map(g => g.id)), fixed: me(act.guesses.map(g => g.id)),
    pick: id => {
      const i = act.guesses.findIndex(g => g.id === id);
      if (i >= 0) { act.guesses.splice(i, 1); return ctx.render(); }
      if (act.guesses.length >= 5) return toast('最多猜五個');
      rolePicker(ctx, role => { act.guesses.push({ id, role }); ctx.render(); }, [mini('juggler'), seatBadge(s, id)]);
    } };
  // 第二步：對象，可以是他自己（自己提名自己、向自己開槍）。點別人就換成別人，再點一下對象收回；要換做事的人，點卡上他的頭像
  const can = act.kind === 'nom' ? s.seats.filter(x => !s.nominees.includes(x.id)).map(x => x.id) : s.seats.map(x => x.id);
  return { can: new Set(can), on: new Set([act.to].filter(Boolean)), fixed: me([act.to]), why: () => '他今天被提名過了',
    pick: id => { act.to = act.to === id ? null : id; ctx.render(); } };
};
// 給 town.js：圓桌中央現在要放的代行卡，沒有就返回 null
export function actBubble(ctx) {
  if (act && !live(ctx.state)) act = null; // 白天結束了、有人搶先提名了：這張卡作廢
  return act && { id: 'act-' + act.kind, seatId: act.from, card: () => actCard(ctx) };
}
const VERB = { nom: ['提名', 'bad'], slay: ['開槍', 'bad'], juggle: ['猜', 'ink'] };
// 卡頂的索引籤：這一步點誰（給說書人看的）
const ASK = { nom: ['選擇提名的人', '選擇被提名的人'], slay: ['選擇開槍的人', '選擇他射向的人'] };
const CONFIRM = { nom: '確認提名', slay: '確認開槍' };
const WANT = { nom: ['先在桌上點提名的人', '再點被提名的人'], slay: ['先在桌上點開槍的人', '再點他射向的人'] };
function actCard(ctx) {
  const s = ctx.state, { kind, from, to, guesses } = act, [verb, tone] = VERB[kind];
  // 點好的人可以點掉重選：點做事的人回到第一步，點對象只收回對象
  const slot = (id, undo) => (id ? h('button', { class: 'act-slot', onclick: () => { undo(); ctx.render(); } }, seatBadge(s, id, 'lg')) : h('span', { class: 'sb empty lg' }));
  const tagText = kind === 'juggle' ? null : ASK[kind][from ? 1 : 0];
  // 雜耍藝人猜的另起一塊、可以折行（最多五個，一行放不下）
  const list = kind === 'juggle' && guesses.length > 0 && h('div', { class: 'jg-list' }, guesses.map(g => h('span', { class: 'jg' }, seatBadge(s, g.id), mini(g.role))));
  const head = kind === 'juggle' ? [mini('juggler'), seatBadge(s, from, 'lg'), w(verb, tone), !guesses.length && h('i', { class: 'op-sep' })]
    : [kind === 'slay' && mini('slayer'), slot(from, () => { act.from = act.to = null; }), w(verb, tone), slot(to, () => { act.to = null; })];
  // 手機上拆開（hud.css .spread）：誰對誰在圓桌中間，按鈕在下方
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, tagText && h('div', { class: 'ic-tag say', 'data-key': tagText }, tagText), h('div', { class: 'ic-head' }, head), list),
    // 結算只在按下這個鍵時發生（點齊人不算）：鍵一開始就在，人沒點齊時變暗，點了說還差什麼
    h('div', { class: 'ic-foot' }, h('div', { class: 'row r73' }, B('取消', () => closeAct(ctx), 'ghost'),
      kind === 'juggle' ? BW(guesses.length ? `${verb} ${guesses.length} 個` : verb, () => guesses.length && fire(ctx), '', guesses.length ? null : '先在桌上點他猜的人')
        : BW(CONFIRM[kind], () => from && to && fire(ctx), '', !from ? WANT[kind][0] : !to ? WANT[kind][1] : null))));
}

// 從劇本的角色裏挑一個（雜耍藝人公開猜、展示身份）：整屏的劇本單（rolepick.js），點一個就收走。
// title 是紙頂索引籤上的字；opts 可以帶 key（再開同一個 key 時把收著的那張抽出來）、alive
export function rolePicker(ctx, onPick, title = '選角色', opts = {}) {
  const code = ctx.state.code, owner = act; // 從代行卡上開的（雜耍藝人猜）：卡作廢了，面板跟著收走
  rolePanel({ key: 'pick-' + Date.now(), tab: title, roles: SCRIPTS[ctx.state.scriptId].roles, pick: id => void onPick(id),
    alive: () => ctx.state?.code === code && (!owner || (act === owner && live(ctx.state))), ...opts });
}

// 展示身份：線下比劃不出來的只有角色，挑一張整屏亮給他看（數字、是否當面比手勢就行）。頂欄（隨時）、標記卡（帶上行動者）都從這裏進。
// 紙頂（「給誰看」下面）一排座位挑給誰看（可以不挑），再從劇本單挑一張；和傳閱身份一樣蓋著交出去：「交給 ③ 名字」，他確認是本人才翻（pass.js passRoleCard）。
// 挑了誰寫在索引籤上；只換這幾個按鈕的 class，不重畫
export function showRole(ctx, seatId = null) {
  const s = ctx.state, who = h('span', { class: 'rp-to-who' });
  let to = seatId;
  const seats = h('div', { class: 'rp-to' }, s.seats.map(x => h('button', { class: 'rp-to-seat', 'data-id': x.id, title: x.name || null,
    onclick: () => { to = to === x.id ? null : x.id; mark(); } }, seatBadge(s, x.id))));
  const mark = () => {
    who.replaceChildren(...(to ? [seatBadge(ctx.state, to)] : []));
    for (const b of seats.children) b.classList.toggle('on', b.dataset.id === String(to));
  };
  mark();
  rolePicker(ctx, id => passRoleCard(ctx.state, id, to), [icon('eye'), who, w('展示角色卡')],
    { key: 'show-' + Date.now(), lead: w('給誰看', 'ink'), top: seats, alive: () => !!ctx.state?.isSt && ctx.state.phase !== 'lobby' });
}

// ───── 貼標記 ─────
const COMMON = ['中毒', '醉酒', '被保護', '能力已用', '瘋狂', '查驗過'];
// seat 可以是幾個座位（標記卡上他一次選了幾個人）：一起貼、一起取；lead 是排最前的角色（正在行動的那個角色自己的標記）
export function openReminders(ctx, seat, lead) {
  const seats = [].concat(seat);
  seat = seats[0];
  const s = ctx.state, st = s.st, has = t => seats.every(x => (st.marks?.[x.id] || []).includes(t));
  const remind = (text, on) => { for (const x of seats) ctx.st('remind', { seatId: x.id, text, on }); };
  const toggle = (e, text) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    remind(text, on);
  };
  // key：存進標記的字；兩個角色有同名的標記（氣球駕駛員和寡婦都有「得知」）時帶上角色名，不然點一個兩個一起亮
  const chip = (t, key = t) => h('button', { class: 'chip' + (has(key) ? ' on' : ''), onclick: e => toggle(e, key) }, t);
  // 這個座位自己的角色排最前
  const groups = {}, count = {};
  for (const { r, t } of st.reminders || []) { (groups[r] ||= []).push(t); count[t] = (count[t] || 0) + 1; }
  const keyOf = (r, t) => (count[t] > 1 ? `${ROLES[r]?.name || r}·${t}` : t);
  const own = [...new Set([lead, seat.role, seat.fakeRole])].filter(id => groups[id]);
  const order = [...own, ...Object.keys(groups).filter(id => !own.includes(id))];
  const known = new Set(Object.entries(groups).flatMap(([r, ts]) => ts.map(t => keyOf(r, t))));
  const extra = (st.marks?.[seat.id] || []).filter(t => !COMMON.includes(t) && !known.has(t));
  const row = h('div', { class: 'hand-row' }, COMMON.map(t => chip(t)), extra.map(t => chip(t)));
  const text = h('input', { maxlength: 20, placeholder: '自己寫一個' });
  const add = () => {
    const t = text.value.trim();
    if (!t) return;
    text.value = '';
    row.append(h('button', { class: 'chip on', onclick: e => toggle(e, t) }, t));
    remind(t, true);
  };
  text.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) add(); };
  modal(`${seats.map(x => seatLabel(s, x.id)).join('、')} 的標記`, h('div', { class: 'hand-form' }, row,
    order.map(id => h('div', { class: 'hand-row' }, mini(id), groups[id].map(t => chip(t, keyOf(id, t))))),
    h('div', { class: 'row rm-add' }, text, h('button', { class: 'btn', onclick: add }, icon('quill'), '貼上'))));
}

// ───── 這個座位的記錄：他查驗過誰、得知了什麼、被誰選過（說書人線下好記） ─────
export const seatLog = (s, id) => (s.st?.log || []).filter(l => l.e && (l.e.seat === id || (l.e.to || []).includes?.(id) || l.e.goon === id));
