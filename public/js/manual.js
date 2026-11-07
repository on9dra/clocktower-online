// 手動局的說書人界面：系統不懂規則，這裏只有工具。叫醒（發選人牌）、拼信息、貼標記、夜晚順序參考、判勝負
import { h, modal, closeModal, ask, toast, seatLabel, roleToken } from './ui.js';
import { ROLES, TEAMS, SCRIPTS } from './roles.js';
import { COMMUNITY } from './community.js';
import { B, selFrom, selectBar } from './flow.js';
import { startSelect, sel } from './town.js';
import { formula, seatBadge, mini, named, icon, w } from './glyph.js';

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

// 社區劇本：能智能推進的放前面，其餘手動。選中就是上傳這本
export function communityScripts(ctx) {
  const cur = ctx.state.scriptId === 'custom' && SCRIPTS.custom?.name;
  const row = c => h('button', { class: 'comm-row' + (c.name === cur ? ' on' : ''), onclick: async () => {
    closeModal();
    if (c.name === cur) return;
    await ctx.st('upload', { entries: [{ id: '_meta', name: c.name, author: c.author }, ...c.roles] });
  } }, h('b', {}, c.name), c.small && h('i', {}, '5-6人'), h('span', {}, `${c.en} · ${c.author}`));
  const part = (auto, title) => h('div', {}, h('h4', {}, title), COMMUNITY.filter(c => !!c.auto === auto).map(row));
  modal('社區劇本', h('div', { class: 'comm-list' }, part(true, '智能推進'), part(false, '手動')), { wide: true });
}

// ───── 叫醒：選人牌 ─────
const lastCard = {}; // 角色 -> 上次給他的設置（下一夜同一個角色不用重新選）
export function openCard(ctx, seat) {
  const key = seat.fakeRole || seat.role, c = { count: 1, role: false, optional: false, ...lastCard[key] };
  const chip = (text, onclick) => h('button', { class: 'chip', onclick }, text);
  const paint = () => {
    nums.forEach((b, i) => b.classList.toggle('on', c.count === i));
    pick.classList.toggle('on', c.role);
    skip.classList.toggle('on', c.optional);
    send.classList.toggle('disabled', !c.count && !c.role);
  };
  const set = patch => { Object.assign(c, patch); paint(); };
  const nums = [0, 1, 2, 3].map(n => chip(n, () => set({ count: n })));
  const pick = chip('選角色', () => set({ role: !c.role })), skip = chip('可以不選', () => set({ optional: !c.optional }));
  const text = h('input', { maxlength: 60, placeholder: '對他說的話' });
  const go = () => {
    if (!c.count && !c.role) return;
    lastCard[key] = { ...c };
    closeModal();
    ctx.st('card', { seatId: seat.id, ...c, text: text.value });
  };
  const send = h('button', { class: 'btn wide', onclick: go }, icon('send'), '叫醒');
  modal(`叫醒 ${seatLabel(ctx.state, seat.id)}`, h('div', { class: 'hand-form' },
    h('div', { class: 'hand-row' }, w('選', 'ink'), nums, w('人', 'ink')),
    h('div', { class: 'hand-row' }, pick, skip),
    text, send));
  paint();
}

// 發出去的牌：等著的帶代選和收回，回來的是一行答案
export function cardRows(ctx) {
  const s = ctx.state, cards = s.st.hand.cards;
  return cards.length > 0 && h('div', { class: 'hand-cards' }, cards.map(c => h('div', { class: 'frm-line hand-card', 'data-key': c.id },
    seatBadge(s, c.seatId), c.done
      ? (c.ids.length || c.pick ? [w('選了'), c.ids.map(id => seatBadge(s, id)), c.pick && named(c.pick)] : w('沒有選', 'muted'))
      : [h('span', { class: 'waiting' }, h('i'), h('i'), h('i')),
        h('button', { class: 'btn sm', onclick: () => proxyPick(ctx, c) }, '代選'),
        h('button', { class: 'btn sm ghost', onclick: () => ctx.st('cardDrop', { seatId: c.seatId }) }, '收回')])));
}
// 代選：和說書人代選自動局的行動一樣，點桌上的座位，確認卡在圓桌中央
function proxyPick(ctx, c) {
  startSelect(ctx, { ...selFrom('card-' + c.id, { count: c.count, counts: c.optional ? [0, c.count] : [c.count],
    roles: c.role ? SCRIPTS[ctx.state.scriptId].roles : null, roleOptional: c.optional }, null), card: c });
}

// ───── 替人提名 ─────
let nom = null; // { from: 提名者, to: 被提名者 }
export const mayNominate = (s, seat) => s.phase === 'day' && !s.nomination && !s.dayOver && !seat.dead && !s.nominators.includes(seat.id);
const nomLive = s => { const from = nom && s.seats.find(x => x.id === nom.from); return !!from && mayNominate(s, from); };
export function startNominate(ctx, seat) { draft = null; nom = { from: seat.id, to: null }; ctx.render(); }
function nominateCard(ctx) {
  const s = ctx.state, { from, to } = nom;
  const send = () => to && ctx.st('nominate', { fromId: from, toId: to });
  // 手機上拆開（hud.css .spread）：誰提名誰在圓桌中間，按鈕在下方
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, h('div', { class: 'ic-head' }, seatBadge(s, from, 'lg'), w('提名', 'bad'), to ? seatBadge(s, to, 'lg') : h('i', { class: 'op-sep' }))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, B('取消', () => closeCompose(ctx), 'ghost'), B('提名', send, to ? '' : 'disabled'))));
}

// ───── 拼信息 ─────
let draft = null; // { to: 座位, terms: [] }
export function startCompose(ctx, seat) { nom = null; draft = { to: seat.id, terms: [] }; ctx.render(); }
export function closeCompose(ctx) { if (!draft && !nom) return false; draft = nom = null; ctx.render(); return true; }
// 給 town.js：拼信息時點桌上的座位，把這個座位加進句子；替人提名時點的是被提名者
export const composePicking = ctx => {
  const s = ctx.state;
  if (nomLive(s)) return { can: new Set(s.seats.filter(x => !s.nominees.includes(x.id)).map(x => x.id)), on: new Set([nom.to]), fixed: new Set([nom.from]),
    pick: id => { nom.to = id; ctx.render(); } };
  return draft && {
    can: new Set(s.seats.map(x => x.id)), on: new Set(draft.terms.filter(t => t.s).map(t => t.s)), fixed: new Set(),
    pick: id => { draft.terms.push({ s: id }); ctx.render(); },
  };
};
// 給 town.js：圓桌中央現在要放的手動局操作卡（替人提名、拼信息、代選），沒有就返回 null
export function handBubble(ctx) {
  if (nom && !nomLive(ctx.state)) nom = null; // 玩家自己先提名了、天黑了：這張卡作廢
  if (nom) return { id: 'nominate', seatId: nom.from, card: () => nominateCard(ctx) };
  if (draft) return { id: 'compose', seatId: draft.to, card: () => composeCard(ctx) };
  const c = sel.on?.card;
  return c ? { id: 'card-' + c.id, seatId: c.seatId, card: () => selectBar(ctx, seatBadge(ctx.state, c.seatId, 'lg'), (ids, role) => ctx.st('cardPick', { seatId: c.seatId, ids, role }), true) } : null;
}
function composeCard(ctx) {
  const s = ctx.state, d = draft, add = t => { d.terms.push(t); ctx.render(); };
  const field = () => document.querySelector('[data-keep=compose]');
  const addText = () => {
    const el = field(), v = el?.value.trim();
    if (!v) return;
    el.value = '';
    add(/^\d{1,3}$/.test(v) ? { n: Number(v) } : { w: v });
  };
  const send = () => {
    addText();
    if (!d.terms.length) return;
    ctx.st('inform', { seatId: d.to, terms: d.terms }).then(r => r.ok && closeCompose(ctx));
  };
  // 手機上拆開（hud.css .spread）：給誰在圓桌中間，拼好的句子和工具在上方，發送在下方
  return h('div', { class: 'card focus infocard compose spread' },
    h('div', { class: 'ic-top' }, h('div', { class: 'ic-head' }, seatBadge(s, d.to, 'lg'), w('給信息', 'ink'))),
    h('div', { class: 'ic-body' },
      h('div', { class: 'ic-preview' + (d.terms.length ? '' : ' empty') }, d.terms.length
        ? h('span', { class: 'frm big' }, d.terms.map((t, i) => h('button', { class: 'cp-term', 'data-key': i + (t.s || t.r || t.w || t.n), title: '移除',
          onclick: () => { d.terms.splice(i, 1); ctx.render(); } }, formula(s, [t]))))
        : h('span', { class: 'frm' }, h('i', { class: 'op-sep' }))),
      h('div', { class: 'opt-row cp-tools' },
        B('角色', () => rolePicker(ctx, r => add({ r, named: true })), 'sm'),
        ['是', '或'].map(t => B(t, () => add({ w: t }), 'sm ghost')),
        h('input', { 'data-keep': 'compose', maxlength: 40, placeholder: '數字或文字', onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addText(); } } }))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, B('取消', () => closeCompose(ctx), 'ghost'),
      B([icon('send'), '發送'], send, d.terms.length ? '' : 'disabled'))));
}
// 從劇本的角色裏挑一個：按陣營分行
function rolePicker(ctx, onPick) {
  const ids = SCRIPTS[ctx.state.scriptId].roles, pick = id => { closeModal(); onPick(id); };
  modal('選擇角色', h('div', {}, Object.keys(TEAMS).map(team => {
    const list = ids.filter(id => ROLES[id].team === team);
    return list.length > 0 && h('div', { class: 'guess-grid' }, list.map(id =>
      h('div', { class: 'guess-pick', onclick: () => pick(id) }, roleToken(id, { size: 'sm' }), ROLES[id].name)));
  })), { wide: true });
}

// ───── 貼標記 ─────
const COMMON = ['中毒', '醉酒', '被保護', '能力已用', '瘋狂'];
export function openReminders(ctx, seat) {
  const s = ctx.state, hand = s.st.hand, has = t => (hand.marks[seat.id] || []).includes(t);
  const toggle = (e, text) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    ctx.st('remind', { seatId: seat.id, text, on });
  };
  const chip = t => h('button', { class: 'chip' + (has(t) ? ' on' : ''), onclick: e => toggle(e, t) }, t);
  // 這個座位自己的角色排最前
  const groups = {};
  for (const { r, t } of hand.reminders) (groups[r] ||= []).push(t);
  const own = [seat.role, seat.fakeRole].filter(id => groups[id]);
  const order = [...own, ...Object.keys(groups).filter(id => !own.includes(id))];
  const extra = (hand.marks[seat.id] || []).filter(t => !COMMON.includes(t) && !Object.values(groups).flat().includes(t));
  const row = h('div', { class: 'hand-row' }, COMMON.map(chip), extra.map(chip));
  const text = h('input', { maxlength: 20, placeholder: '自己寫一個' });
  const add = () => {
    const t = text.value.trim();
    if (!t) return;
    text.value = '';
    row.append(h('button', { class: 'chip on', onclick: e => toggle(e, t) }, t));
    ctx.st('remind', { seatId: seat.id, text: t, on: true });
  };
  text.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) add(); };
  modal(`${seatLabel(s, seat.id)} 的標記`, h('div', { class: 'hand-form' }, row,
    order.map(id => h('div', { class: 'hand-row' }, mini(id), groups[id].map(chip))),
    h('div', { class: 'row' }, text, h('button', { class: 'btn', onclick: add }, '貼上'))));
}

// ───── 圓桌中央 ─────
export const winButtons = ctx => h('div', { class: 'row hand-win' }, [['good', '善良獲勝'], ['evil', '邪惡獲勝']].map(([team, text]) =>
  B(text, () => ask(`判定${text}，結束本局？`, () => ctx.st('win', { team }), text), 'sm ghost')));

// 手動局的夜晚：今晚的死者、發出去的牌、首夜互認，天亮。
// 互認發過以後按鈕置灰留在原處：不讓下面的「天亮」頂上來，連點兩下就天亮了。手機上拆開（hud.css .spread）：死者在圓桌中間，發出去的牌在上方，按鈕在下方
export function manualNight(ctx) {
  const s = ctx.state, st = s.st, hand = st.hand;
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, h('div', { class: 'frm-line' }, w('今晚'), st.diedTonight.length ? [st.diedTonight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good'))),
    hand.cards.length > 0 && h('div', { class: 'ic-body' }, cardRows(ctx)),
    h('div', { class: 'ic-foot hand-foot' },
      s.night === 1 && B('發送互認和偽裝', () => ctx.st('evilInfo'), 'wide' + (hand.evilSent ? ' disabled' : '')),
      B('天亮，公佈死訊', () => ctx.st('dawn'), 'wide'),
      winButtons(ctx)));
}

// ───── 側欄：夜晚順序參考 ─────
export function renderOrder(ctx) {
  const s = ctx.state, night = s.phase === 'night' ? s.night : s.night + 1;
  return h('div', { class: 'tab-body order', 'data-scroll': 'order' },
    h('div', { class: 'log-head' }, `第 ${night} 夜`),
    s.st.hand.ref.map(x => h('button', { class: 'ref-row' + (x.done ? ' done' : '') + (x.seats.length ? '' : ' absent'), 'data-key': x.r,
      onclick: () => ctx.st('tick', { roleId: x.r }) },
    h('i', { class: 'ref-box' }, x.done && icon('check')), mini(x.r), h('b', {}, ROLES[x.r].name), x.seats.map(id => seatBadge(s, id)),
    x.tip && x.seats.length > 0 && h('small', {}, x.tip))));
}
