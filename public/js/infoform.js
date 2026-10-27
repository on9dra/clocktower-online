// 說書人給信息的卡片。能力正常：只出現合規答案，唯一的答案直接鎖定，只有干擾項可選；
// 中毒 / 酒鬼：同一張卡解鎖，所有選項放開（預填真實答案，真實項帶「真」角標）。
// 下方是玩家將看到的式子，邊框顏色表示真實 / 登記 / 錯誤。
import { h } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { infoFormula, truthLevel, checkFields } from './infofmt.js';
import { formula, seatBadge, mini, evilNum, icon, w } from './glyph.js';

const drafts = {}; // stepId -> 說書人當前的選擇
const others = (s, step) => s.seats.filter(x => x.id !== step.seatId).map(x => x.id);
const pickOne = a => a[Math.floor(Math.random() * a.length)];

// 「兩名玩家之一是 X」：真相 = 持有者 + 角色；隱士 / 間諜可以被當作的身份也算
function truths(s, form) {
  const of = form.roleOf || {}, may = form.mayBe || {}, t = form.truth, out = [];
  for (const [seat, role] of Object.entries(of)) out.push({ seat, role });
  for (const [seat, roles] of Object.entries(may)) out.push({ seat, roles, via: s.seats.find(x => x.id === seat)?.role });
  if (form.allowNone && (t.none || form.noneOk)) out.push({ none: true });
  return out;
}

// 首次打開時的預填：真實答案，a 是持有者、b 是干擾項
function initial(form) {
  const t = form.truth;
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
      !d.none && row(others(s, step).map(id => opt(seatBadge(s, id), { on: picked.includes(id), level: lvSeat(id),
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
    !d.none && row(others(s, step).filter(id => id !== d.a).map(id => opt(seatBadge(s, id), { on: d.b === id, onclick: () => set({ b: id }) }))),
  ];
}

// 數字 / 有沒有惡魔 / 角色：能力正常時只列合規答案（唯一時鎖定）
function choiceBody(s, step, d, set) {
  const form = step.form, t = form.truth, key = { number: 'n', yesno: 'yes', role: 'role' }[form.kind];
  const ok = [...new Set([t[key], ...(form.ok || [])])];
  const all = form.kind === 'number' ? [...Array(form.max + 1).keys()] : form.kind === 'yesno' ? [true, false] : form.roles;
  const values = form.free ? all : ok;
  const face = v => (form.kind === 'number' ? evilNum(v) : form.kind === 'yesno' ? w(v ? '有惡魔' : '沒有惡魔', v ? 'evil' : 'good') : mini(v));
  const level = v => (v === t[key] ? 2 : ok.includes(v) ? 1 : 0);
  if (values.length === 1) return null; // 唯一答案：卡片只留下面的式子和發送
  const tiles = vs => row(vs.map(v => opt(face(v), { on: d[key] === v, level: level(v), onclick: () => set({ [key]: v }) })));
  // 全部角色時按陣營分行
  if (form.kind === 'role' && form.free) return Object.keys(TEAMS).map(team => tiles(values.filter(id => ROLES[id].team === team)));
  return tiles(values);
}

export function infoForm(ctx, step) {
  const s = ctx.state, form = step.form;
  const d = draftOf(step);
  const set = patch => { Object.assign(d, patch); ctx.render(); };
  const body = form.kind === 'two' ? twoBody(s, step, d, set) : form.kind === 'text' ? null : choiceBody(s, step, d, set);
  const err = checkFields(form, d, s.seats.map(x => x.id));
  const level = err ? -1 : truthLevel(form, d);
  const actor = s.seats.find(x => x.id === step.seatId);
  return h('div', { class: 'card focus infocard' + (form.free ? ' free' : '') },
    h('div', { class: 'ic-head' },
      h('span', { class: 'ic-actor' }, mini(step.roleId)),
      actor && seatBadge(s, actor.id, 'lg'),
      form.why && w(form.why === 'poison' ? '中毒' : '酒鬼', 'evil')),
    body,
    h('div', { class: 'ic-preview ' + (err ? 'empty' : ['bad', 'alt', 'good'][level]) },
      err ? h('span', { class: 'frm' }, h('i', { class: 'op-sep' })) : formula(s, infoFormula(form, d), 'big')),
    h('button', {
      class: 'btn wide ' + (err ? 'disabled' : level === 0 ? 'red' : 'primary'), 'data-hot': '1',
      onclick: () => !err && ctx.st('confirm', { fields: d }),
    }, icon('send'), '發送'));
}
