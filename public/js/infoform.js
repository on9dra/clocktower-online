// 說書人給信息的卡片。能力正常：只出現合規答案，唯一的答案直接鎖定，只有干擾項可選；
// 中毒 / 酒鬼：同一張卡解鎖，所有選項放開（預填真實答案，真實項帶「真」角標）。
// 下方是玩家將看到的式子，邊框顏色表示真實 / 登記 / 錯誤。
// ON_TABLE 裏的角色（洗衣婦先試）：號碼直接點桌上的頭像，桌心只擺角色牌，中下方的紙條是這個組合的後果。
import { h, roleToken } from './ui.js';
import { ROLES, TEAMS, CORE } from './roles.js';
import { infoFormula, truthLevel, checkFields, YES } from './infofmt.js';
import { formula, seatBadge, mini, named, evilNum, icon, w } from './glyph.js';
import { sinceDawn, goonLine } from './log.js';

const drafts = {}; // stepId -> 說書人當前的選擇
const others = (s, step) => s.seats.filter(x => x.id !== step.seatId).map(x => x.id);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const ON_TABLE = new Set(['washerwoman']);

// 這名玩家撐不撐得起「是 role」：2 真的是、1 能被當作、0 不能
const fit = (form, id, role) => (form.roleOf?.[id] === role ? 2 : (form.mayBe?.[id] || []).includes(role) ? 1 : 0);
const picked = d => [d.a, d.b].filter(Boolean);
const setPair = (d, ids) => Object.assign(d, { a: ids[0] || null, b: ids[1] || null });

// 點頭像：再點一次取消；兩人都選了時換掉沒撐起信息的那個。
// 能力正常時選齊的兩人對不上角色：角色跟著換成剛點的人撐得起的
function toggleSeat(form, d, id) {
  const ids = picked(d);
  if (ids.includes(id)) return setPair(d, ids.filter(x => x !== id));
  const keep = ids.length < 2 ? ids : [(!form.free && ids.find(x => fit(form, x, d.role))) || ids[1]];
  setPair(d, [...keep, id]);
  const now = picked(d).reverse();
  if (form.free || now.length < 2 || now.some(x => fit(form, x, d.role))) return;
  const roles = now.flatMap(x => [form.roleOf?.[x], ...(form.mayBe?.[x] || [])]).filter(Boolean);
  if (roles.length) d.role = roles[0];
}
// 點角色：能力正常時兩人裏沒人撐得起，把持有者換上去（替掉先點的那個），座位跟著亮
function chooseRole(form, d, role) {
  Object.assign(d, { none: false, role });
  const ids = picked(d);
  if (form.free || ids.some(x => fit(form, x, role))) return;
  const seats = Object.keys({ ...form.roleOf, ...form.mayBe }).filter(x => fit(form, x, role)).sort((x, y) => fit(form, y, role) - fit(form, x, role));
  setPair(d, [ids.at(-1), seats[0]].filter(Boolean));
}

// 「兩名玩家之一是 X」：真相 = 持有者 + 角色；隱士 / 間諜可以被當作的身份也算
function truths(s, form) {
  const of = form.roleOf || {}, may = form.mayBe || {}, t = form.truth, out = [];
  for (const [seat, role] of Object.entries(of)) out.push({ seat, role });
  for (const [seat, roles] of Object.entries(may)) out.push({ seat, roles, via: s.seats.find(x => x.id === seat)?.role });
  if (form.allowNone && (t.none || form.noneOk)) out.push({ none: true });
  return out;
}

// 首次打開時的預填：真實答案，a 是持有者、b 是干擾項（渦流在場時不預填，說書人自己挑錯的；雜耍藝人攔不了，也不預填）
function initial(form) {
  const t = form.truth;
  if (form.why === 'vortox') return {};
  if (form.kind !== 'two') return form.kind === 'text' ? {} : { ...t };
  if (t.none) return { none: true };
  const of = form.roleOf || {};
  return of[t.a] === t.role ? { a: t.a, b: t.b, role: t.role } : { a: t.b, b: t.a, role: t.role };
}

const draftOf = step => (drafts[step.id] ||= initial(step.form));

// 給 town.js：「兩名玩家」類信息可以直接點桌上的座位選
export function seatPicking(ctx, step) {
  const s = ctx.state, form = step.form;
  if (form.kind !== 'two') return null;
  const d = draftOf(step);
  if (d.none) return null;
  const set = patch => { Object.assign(d, patch); ctx.render(); };
  if (ON_TABLE.has(step.roleId)) {
    const ids = others(s, step);
    return { can: new Set(ids), on: new Set(picked(d)), fixed: new Set(), pick: id => { toggleSeat(form, d, id); ctx.render(); },
      marks: Object.fromEntries(ids.map(id => [id, d.role ? fit(form, id, d.role) : 0]).filter(x => x[1])) };
  }
  if (form.free) {
    return { can: new Set(others(s, step)), on: new Set([d.a, d.b].filter(Boolean)), fixed: new Set(),
      pick: id => { const ids = [d.a, d.b].filter(Boolean); const n = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-2); set({ a: n[0] || null, b: n[1] || null }); } };
  }
  return { can: new Set(others(s, step).filter(id => id !== d.a)), on: new Set([d.b].filter(Boolean)), fixed: new Set([d.a]),
    pick: id => id !== d.a && set({ b: id }) };
}

const Tm = () => h('i', { class: 'tm' }, '真');
// 可點的選項；level：2 真實（帶「真」）、1 登記（橙色圈）
function opt(content, { on, level = 0, onclick, cls = '' }) {
  return h('button', { class: `opt-tile ${cls}` + (on ? ' on' : '') + (level === 1 ? ' alt' : ''), onclick }, content, level === 2 && Tm());
}
const row = (...kids) => h('div', { class: 'opt-row' }, kids);
const seatRow = kids => h('div', { class: 'opt-row seat-row' }, kids); // 手機上不顯示：座位直接點桌上的頭像（seatPicking）

function twoBody(s, step, d, set) {
  const form = step.form, of = form.roleOf || {}, may = form.mayBe || {}, t = form.truth;
  if (form.free) {
    const inPlay = new Set(Object.values(of)), maybe = new Set(Object.values(may).flat());
    const picked = [d.a, d.b].filter(Boolean);
    const lvSeat = id => (d.role && of[id] === d.role ? 2 : d.role && (may[id] || []).includes(d.role) ? 1 : 0);
    return [
      row(form.roles.map(id => opt(mini(id), { on: !d.none && d.role === id, level: inPlay.has(id) ? 2 : maybe.has(id) ? 1 : 0,
        onclick: () => set({ none: false, role: id, a: d.a || null, b: d.b || null }) })),
      form.allowNone && opt(w(`沒有${TEAMS[form.team]?.name || ''}`, 'ink'), { on: d.none, level: t.none ? 2 : form.noneOk ? 1 : 0, onclick: () => set({ none: true }) })),
      !d.none && seatRow(others(s, step).map(id => opt(seatBadge(s, id), { on: picked.includes(id), level: lvSeat(id),
        onclick: () => { const n = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(-2); set({ a: n[0] || null, b: n[1] || null }); } }))),
    ];
  }
  // 能力正常：真相一行（唯一時鎖定），干擾項一行
  const list = truths(s, form);
  const isOn = x => (x.none ? !!d.none : !d.none && d.a === x.seat && (x.role ? d.role === x.role : (x.roles || []).includes(d.role)));
  const choose = x => {
    if (x.none) return set({ none: true });
    const role = x.role || ((x.roles || []).includes(d.role) ? d.role : x.roles[0]);
    const b = d.b && d.b !== x.seat ? d.b : pickOne(others(s, step).filter(id => id !== x.seat));
    set({ none: false, a: x.seat, role, b });
  };
  // 隱士 / 間諜：座位旁掛他的真實角色小牌，選中後才定下被當作哪個角色
  const face = x => (x.none ? w(`沒有${TEAMS[form.team]?.name || ''}`, 'ink')
    : [seatBadge(s, x.seat), x.via && mini(x.via, 'via'), w('是'), x.role ? mini(x.role) : isOn(x) ? mini(d.role) : h('span', { class: 'tt q' }, '?')]);
  const cur = list.find(isOn);
  return [
    list.length === 1 ? h('div', { class: 'opt-row' }, h('div', { class: 'opt-tile fixed' }, face(list[0])))
      : row(list.map(x => opt(face(x), { on: isOn(x), level: x.via ? 1 : 2, onclick: () => choose(x) }))),
    cur && cur.roles && cur.roles.length > 1 && row(cur.roles.map(id => opt(mini(id), { on: d.role === id, level: 1, onclick: () => set({ role: id }) }))),
    !d.none && seatRow(others(s, step).filter(id => id !== d.a).map(id => opt(seatBadge(s, id), { on: d.b === id, onclick: () => set({ b: id }) }))),
  ];
}

// 數字 / 有沒有惡魔 / 角色：能力正常時只列合規答案（唯一時鎖定）
function choiceBody(s, step, d, set) {
  const form = step.form, t = form.truth, key = { number: 'n', yesno: 'yes', role: 'role' }[form.kind];
  const ok = [...new Set([t[key], ...(form.ok || [])])];
  const all = form.kind === 'number' ? [...Array(form.max + 1).keys()] : form.kind === 'yesno' ? [true, false] : form.roles;
  // unknown：系統不知道真相（雜耍藝人），全部列出、不標真假
  const values = form.free || form.unknown ? all : ok;
  const y = YES[form.roleId] || YES.fortuneteller;
  const face = v => (form.kind === 'number' ? evilNum(v) : form.kind === 'yesno' ? w(v ? y.yes : y.no, y.k[v ? 0 : 1]) : mini(v));
  const level = v => (form.unknown ? 0 : v === t[key] ? 2 : ok.includes(v) ? 1 : 0);
  if (values.length === 1) return null; // 唯一答案：卡片只留下面的式子和發送
  // 渦流在場：真實 / 登記的答案不能選
  const tiles = vs => row(vs.map(v => opt(face(v), { on: d[key] === v, level: level(v), cls: form.vortox && !form.alt && level(v) ? 'off' : '', onclick: () => set({ [key]: v }) })));
  // 全部角色時按陣營分行
  if (form.kind === 'role' && form.free) return CORE.map(team => tiles(values.filter(id => ROLES[id].team === team)));
  return tiles(values);
}

// 築夢師：一個善良角色 + 一個邪惡角色，其中一個是他的真角色（能力正常時必須包含）
function dreamBody(s, step, d, set) {
  const form = step.form, ok = form.ok || [];
  const level = id => (id === form.role ? 2 : ok.includes(id) ? 1 : 0);
  const tiles = (ids, key) => row(ids.map(id => opt(mini(id), { on: d[key] === id, level: level(id), cls: form.vortox && !form.alt && level(id) ? 'off' : '', onclick: () => set({ [key]: id }) })));
  return [tiles(form.goods, 'good'), tiles(form.evils, 'evil')];
}

// 當前選擇的狀態：level -1 沒選完、0 錯誤、1 登記、2 真實；err 不能發（能力正常卻不合規、渦流在場卻是真的）
function verdict(s, form, d) {
  const level = checkFields(form, d, s.seats.map(x => x.id)) ? -1 : truthLevel(form, d);
  return { level, err: level < 0 || (!form.free && level === 0) || (form.vortox && !form.alt && level > 0) };
}
const icHead = (s, step) => h('div', { class: 'ic-head' },
  h('span', { class: 'ic-actor' }, mini(step.roleId)),
  s.seats.some(x => x.id === step.seatId) && seatBadge(s, step.seatId, 'lg'),
  step.form.why && w({ poison: '中毒', tipsy: '醉酒', drunk: '酒鬼', vortox: '渦流' }[step.form.why], 'evil'));
const sendBtn = (ctx, d, { level, err }) => h('button', {
  class: 'btn wide ' + (err ? 'disabled' : level === 0 ? 'red' : ''),
  onclick: () => !err && ctx.st('confirm', { fields: d }),
}, icon('send'), '發送');

// 桌心的角色牌 + 中下方的紙條（ON_TABLE）。在場的角色排前面；能力正常只列合規的，中毒 / 酒鬼全部列出
function tableForm(ctx, step, d) {
  const s = ctx.state, form = step.form, v = verdict(s, form, d), { level } = v;
  const inPlay = new Set(Object.values(form.roleOf || {})), maybe = new Set(Object.values(form.mayBe || {}).flat());
  const roles = [...inPlay, ...form.roles.filter(id => !inPlay.has(id) && (form.free || maybe.has(id)))];
  const pick = fn => () => { fn(); ctx.render(); };
  const tile = id => h('button', { class: 'tb-role' + (!d.none && d.role === id ? ' on' : '') + (!inPlay.has(id) && maybe.has(id) ? ' alt' : ''), 'data-key': id,
    onclick: pick(() => chooseRole(form, d, id)) }, roleToken(id), inPlay.has(id) && Tm());
  const none = form.allowNone && (form.free || form.truth.none || form.noneOk) && h('button', { class: 'tb-role none' + (d.none ? ' on' : ''), 'data-key': 'none',
    onclick: pick(() => { d.none = true; }) }, `沒有${TEAMS[form.team]?.name || ''}`);
  const slot = id => (id ? seatBadge(s, id) : h('span', { class: 'sb empty' }));
  // 能力正常時對不上的組合發不出去，寫「不合規」；中毒 / 酒鬼時發得出去，是一條錯誤信息
  const verdictWord = level < 0 ? null : level === 0 && !form.free ? '不合規' : ['錯誤', '登記', '真實'][level];
  return h('div', { class: 'card infocard on-table' + (form.free ? ' free' : '') },
    icHead(s, step),
    goonLine(s, step),
    h('div', { class: 'tb-roles' }, roles.map(tile), none),
    h('div', { class: 'tb-foot' },
      h('div', { class: 'tb-slip' },
        d.none ? formula(s, infoFormula(form, d), 'big')
          : h('span', { class: 'frm big' }, slot(d.a), w('或'), slot(d.b), w('是'), d.role ? named(d.role) : h('span', { class: 'sb empty' })),
        verdictWord && h('span', { class: 'tb-stamp t' + level, 'data-key': verdictWord }, verdictWord)),
      sendBtn(ctx, d, v)));
}

// 雜耍藝人：白天公開猜過的，對不對系統算好了
const guessList = (s, list) => h('div', { class: 'ic-events' }, list.map(x => h('div', { class: 'log-row' },
  seatBadge(s, x.seat), named(x.role), x.hit ? w('對', 'good') : x.maybe ? w('可算對', 'ink') : w('錯', 'muted'))));

// 數學家：系統算入的座位，下面是從黎明起大家做過的事，說書人自己判斷數字
function eventList(s, form) {
  const rows = sinceDawn(s), ids = form.ids || [];
  return (rows.length > 0 || ids.length > 0) && h('div', { class: 'ic-events', 'data-scroll': 'events' },
    ids.length > 0 && h('div', { class: 'ic-count' }, w('算入'), ids.map(id => seatBadge(s, id))), rows);
}

export function infoForm(ctx, step) {
  const s = ctx.state, form = step.form;
  const d = draftOf(step);
  if (ON_TABLE.has(step.roleId) && form.kind === 'two') return tableForm(ctx, step, d);
  const set = patch => { Object.assign(d, patch); ctx.render(); };
  const body = form.kind === 'two' ? twoBody(s, step, d, set) : form.kind === 'dream' ? dreamBody(s, step, d, set)
    : form.kind === 'text' ? null : choiceBody(s, step, d, set);
  const v = verdict(s, form, d), { level } = v;
  return h('div', { class: 'card focus infocard spread' + (form.free ? ' free' : '') },
    icHead(s, step),
    goonLine(s, step),
    form.open && eventList(s, form),
    form.extra?.guesses && guessList(s, form.extra.guesses),
    body && h('div', { class: 'ic-body' }, body),
    h('div', { class: 'ic-foot' },
      h('div', { class: 'ic-preview ' + (level < 0 ? 'empty' : ['bad', 'alt', 'good'][level]) },
        level < 0 ? h('span', { class: 'frm' }, h('i', { class: 'op-sep' })) : formula(s, infoFormula(form, d), 'big')),
      sendBtn(ctx, d, v)));
}
