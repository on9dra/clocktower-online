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

export function uploadScript(ctx) {
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
    const r = await ctx.st('upload', { entries });
    if (!r.ok) return;
    toast(`${r.name}：${r.roles} 個角色` + (r.skipped.length ? `，跳過 ${r.skipped.join('、').slice(0, 40)}` : ''), 4000);
  };
  input.click();
}

// 社區劇本：全是內置角色的放前面；有系統不認識的角色的，那幾個角色到時說書人自己處理
export function communityScripts(ctx) {
  const cur = ctx.state.scriptId === 'custom' && SCRIPTS.custom?.name;
  const row = c => h('button', { class: 'comm-row' + (c.name === cur ? ' on' : ''), onclick: async () => {
    closeModal();
    if (c.name === cur) return;
    await ctx.st('upload', { entries: [{ id: '_meta', name: c.name, author: c.author, small: c.small }, ...c.roles] });
  } }, h('b', {}, c.name), c.small && h('i', {}, '5-6人'), h('span', {}, `${c.en} · ${c.author}`));
  const part = (auto, title) => h('div', {}, h('h4', {}, title), COMMUNITY.filter(c => !!c.auto === auto).map(row));
  modal('社區劇本', h('div', { class: 'comm-list' }, part(true, '全自動'), part(false, '部分角色自己處理')), { wide: true });
}

// ───── 白天替玩家做事：圓桌中央一張小卡 ─────
// kind：nom 提名 / slay 宣稱獵手開槍 / juggle 雜耍藝人猜；from 是做事的人，to 是點到的人，guesses 是雜耍藝人猜的 [{ id, role }]
// 提名、開槍從圓桌中央的兩個按鈕開始（flow.js stCenter）：先點做事的人，再點對象，點齊了直接結算（提名進審判、開槍進裁定），不用再按一次
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
// 點齊了就發：提名 → 審判牌，開槍 → 裁定卡。服務器說不行（他今天提名過了……）就退回第二步，提示原因
function fire(ctx) {
  const { kind, from, to, guesses } = act, done = r => { if (r.ok) closeAct(ctx); else if (act) { act.to = null; ctx.render(); } };
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
  const others = s.seats.filter(x => x.id !== act.from).map(x => x.id);
  if (act.kind === 'juggle') return { can: new Set(others), on: new Set(act.guesses.map(g => g.id)), fixed: new Set([act.from]), why: () => '不能猜自己',
    pick: id => {
      const i = act.guesses.findIndex(g => g.id === id);
      if (i >= 0) { act.guesses.splice(i, 1); return ctx.render(); }
      if (act.guesses.length >= 5) return toast('最多猜五個');
      rolePicker(ctx, role => { act.guesses.push({ id, role }); ctx.render(); }, [mini('juggler'), seatBadge(s, id)]);
    } };
  // 第二步：對象。再點一下做事的人就退回第一步重選
  const can = act.kind === 'nom' ? s.seats.filter(x => !s.nominees.includes(x.id)).map(x => x.id) : others;
  return { can: new Set([...can, act.from]), on: new Set([act.from]), fixed: new Set(), why: () => '他今天被提名過了',
    pick: id => {
      if (id === act.from) { act.from = null; return ctx.render(); }
      act.to = id; ctx.render(); fire(ctx);
    } };
};
// 給 town.js：圓桌中央現在要放的代行卡，沒有就返回 null
export function actBubble(ctx) {
  if (act && !live(ctx.state)) act = null; // 白天結束了、有人搶先提名了：這張卡作廢
  return act && { id: 'act-' + act.kind, seatId: act.from, card: () => actCard(ctx) };
}
const VERB = { nom: ['提名', 'bad'], slay: ['開槍', 'bad'], juggle: ['猜', 'ink'] };
// 卡頂的索引籤：這一步點誰（給說書人看的）
const ASK = { nom: ['選擇提名的人', '選擇被提名的人'], slay: ['選擇開槍的人', '選擇他射向的人'] };
function actCard(ctx) {
  const s = ctx.state, { kind, from, to, guesses } = act, [verb, tone] = VERB[kind];
  const slot = id => (id ? seatBadge(s, id, 'lg') : h('span', { class: 'sb empty lg' }));
  const tagText = kind === 'juggle' ? null : ASK[kind][from ? 1 : 0];
  // 雜耍藝人猜的另起一塊、可以折行（最多五個，一行放不下）
  const list = kind === 'juggle' && guesses.length > 0 && h('div', { class: 'jg-list' }, guesses.map(g => h('span', { class: 'jg' }, seatBadge(s, g.id), mini(g.role))));
  const head = kind === 'juggle' ? [mini('juggler'), seatBadge(s, from, 'lg'), w(verb, tone), !guesses.length && h('i', { class: 'op-sep' })]
    : [kind === 'slay' && mini('slayer'), slot(from), w(verb, tone), slot(to)];
  // 手機上拆開（hud.css .spread）：誰對誰在圓桌中間，按鈕在下方
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, tagText && h('div', { class: 'ic-tag say', 'data-key': tagText }, tagText), h('div', { class: 'ic-head' }, head), list),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, B('取消', () => closeAct(ctx), 'ghost'),
      kind === 'juggle' && BW(guesses.length ? `${verb} ${guesses.length} 個` : verb, () => guesses.length && fire(ctx), '', guesses.length ? null : '先在桌上點他猜的人'))));
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
