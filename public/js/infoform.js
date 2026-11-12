// 說書人給信息的卡片。能力正常：只出現合規答案，唯一的答案直接鎖定，只有干擾項可選；
// 中毒 / 酒鬼：同一張卡解鎖，所有選項放開（預填真實答案，真實項角上打藍勾）。
// 版式（手機上拆開擺在圓桌上下，電腦上一張卡從上往下讀）：上方是給說書人的一句引導 + 要選的東西，正中是結論（玩家將看到的式子，
// 邊框 / 印章表示真實 / 登記 / 錯誤），下方是按鈕。行動者不寫：線下他頭頂有箭頭、進度條上那一格亮著，線上在卡角掛個小角標。
// ON_TABLE 裏的角色（洗衣婦、圖書管理員、調查員）：上方列出必選的那一個——在場的外來者（座位號 + 角色），點它或桌上他的座位都行；
// 另一名玩家直接點桌上的頭像。中毒 / 酒鬼時上方列出這一類的全部角色，兩名玩家隨便點。
import { showPages, bigCore } from './pass.js';
import { h } from './ui.js';
import { tr, getLang } from './lang.js';
import { ROLES, TEAMS, CORE } from './roles.js';
import { infoFormula, truthLevel, checkFields, YES } from './infofmt.js';
import { formula, seatBadge, mini, named, evilNum, icon, w, trueMark, actorMark } from './glyph.js';

// 鎖定（洗衣婦這類，能力正常時）：選定了「真的那一個」——點上方的選項或桌上他的座位——他的頭像套上一圈綠色的光圈，
// 上方那一格也是綠的（town.js lockMark、show.css .lock-on），和另一名玩家的普通金色選中分開。換人時舊的光圈散開，新的收攏上去
import { goonLine } from './log.js';
import { B, BW, stepOp, stepLock } from './flow.js';
import { mathGroups } from './mathcard.js';
import { rolePanel } from './rolepick.js';

const drafts = {}; // stepId -> 說書人當前的選擇
const others = (s, step) => s.seats.filter(x => x.id !== step.seatId).map(x => x.id);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const ON_TABLE = new Set(['washerwoman', 'librarian', 'investigator']);

// 這名玩家撐不撐得起「是 role」：2 真的是、1 能被當作、0 不能
const fit = (form, id, role) => (form.roleOf?.[id] === role ? 2 : (form.mayBe?.[id] || []).includes(role) ? 1 : 0);
const picked = d => [d.a, d.b].filter(Boolean);
const setPair = (d, ids) => Object.assign(d, { a: ids[0] || null, b: ids[1] || null });

// 能力正常時誰能當「真的那一個」：該類角色的持有者，或者能被當作該類角色的隱士 / 間諜
const canHold = (form, id) => !!(form.roleOf?.[id] || form.mayBe?.[id]?.length);
const roleFor = (form, id, cur) => form.roleOf?.[id] || ((form.mayBe?.[id] || []).includes(cur) ? cur : form.mayBe?.[id]?.[0] || null);
// 選定真的那一個（上方的選項，或者桌上點了他的座位）：角色跟著他走；他原來是另一名玩家的話，那一格空出來
function pickHolder(form, d, id) {
  Object.assign(d, { none: false, a: id, role: roleFor(form, id, d.role), b: d.b === id ? null : d.b });
}
// 點頭像：再點一次取消。能力正常時：還沒有真的那一個、或兩人都選了，點到持有者就換成他；其餘點的是另一名玩家。
// 中毒 / 酒鬼：隨便兩個人，多點的頂掉先點的
function toggleSeat(form, d, id) {
  d.none = false;
  const ids = picked(d);
  if (form.free) return setPair(d, ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-2));
  if (d.a === id) return Object.assign(d, { a: null, role: null });
  if (d.b === id) return Object.assign(d, { b: null });
  if (canHold(form, id) && (!d.a || d.b)) return pickHolder(form, d, id);
  d.b = id;
}

// 「兩名玩家之一是 X」：真相 = 持有者 + 角色；隱士 / 間諜可以被當作的身份也算
function truths(s, form) {
  const of = form.roleOf || {}, may = form.mayBe || {}, t = form.truth, out = [];
  for (const [seat, role] of Object.entries(of)) out.push({ seat, role });
  for (const [seat, roles] of Object.entries(may)) out.push({ seat, roles, via: s.seats.find(x => x.id === seat)?.role });
  if (form.allowNone && (t.none || form.noneOk)) out.push({ none: true });
  return out;
}

// 首次打開時的預填：真實答案，a 是持有者、b 是干擾項（渦流在場時不預填，說書人自己挑錯的；雜耍藝人攔不了，也不預填）。
// 說書人開局前預選過的（form.pre，lib/setup.js）優先：能力正常時要還合規，中毒 / 酒鬼時照用
function initial(form) {
  const t = form.truth, pre = form.pre;
  if (pre && form.kind === 'two' && (form.free || truthLevel(form, pre) > 0) && (pre.none || (pre.a && pre.b))) {
    if (pre.none) return { none: true };
    const a = form.free || canHold(form, pre.a) && truthLevel(form, { ...pre, b: null }) > 0 ? pre.a : pre.b;
    return { a, b: a === pre.a ? pre.b : pre.a, role: pre.role };
  }
  // 渦流下是非題只剩一個錯誤答案：直接選上，不用先點一下才能展示
  if (form.why === 'vortox') return form.kind === 'yesno' && !form.alt ? { yes: !form.truth.yes } : {};
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
    // 座位上的勾：能力正常時標出所有能當真的那一個的人（藍勾持有者、橙勾能登記成的），和上方的選項一一對應；
    // 中毒 / 酒鬼時只標真的持有上方選中那個角色的人
    const mark = id => (form.free ? (d.role ? fit(form, id, d.role) : 0) : form.roleOf?.[id] ? 2 : form.mayBe?.[id]?.length ? 1 : 0);
    const pick = id => { toggleSeat(form, d, id); ctx.render(); };
    return { can: new Set(ids), on: new Set(picked(d)), fixed: new Set(), pick, marks: Object.fromEntries(ids.map(id => [id, mark(id)]).filter(x => x[1])),
      lock: !form.free && !d.none && d.a ? d.a : null };
  }
  if (form.free) {
    return { can: new Set(others(s, step)), on: new Set([d.a, d.b].filter(Boolean)), fixed: new Set(),
      pick: id => { const ids = [d.a, d.b].filter(Boolean); const n = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-2); set({ a: n[0] || null, b: n[1] || null }); } };
  }
  return { can: new Set(others(s, step).filter(id => id !== d.a)), on: new Set([d.b].filter(Boolean)), fixed: new Set([d.a]),
    pick: id => id !== d.a && set({ b: id }) };
}

const Tm = () => trueMark();
// 可點的選項；level：2 真實（角上藍勾）、1 登記（橙色圈）
function opt(content, { on, level = 0, onclick, cls = '', lock = false }) {
  return h('button', { class: `opt-tile ${cls}` + (on ? ' on' : '') + (lock ? ' lock' : '') + (level === 1 ? ' alt' : ''), onclick }, content, level === 2 && Tm());
}
const row = (...kids) => h('div', { class: 'opt-row' }, kids);
const seatRow = kids => h('div', { class: 'opt-row seat-row' }, kids); // 手機上不顯示：座位直接點桌上的頭像（seatPicking）

// 角色答案多（中毒、酒鬼時整本劇本都能選）：不在圓桌上方擺一大片小牌，放一格「角色」，點開整屏劇本單（rolepick.js）。
// 藍勾、橙勾照樣標在牌上；渦流在場時真的那些灰著，點了說原因。少的時候照舊一排小牌
const MANY = 8;
function roleSlot(ctx, step, key, list, cur, level, onPick) {
  const s = ctx.state, form = step.form;
  const open = () => rolePanel({ key: `info-${step.id}-${key}`, tab: [mini(step.roleId), seatBadge(s, step.seatId)], roles: list, owned: true,
    state: id => {
      const lv = level(id), off = !!form.vortox && !form.alt && lv > 0;
      return { on: id === cur(), in: lv > 0, tag: lv === 2 ? 'yes' : lv === 1 ? 'reg' : '', off, why: off ? '渦流在場：只能給錯誤信息' : null };
    },
    pick: id => onPick(id), picked: cur, alive: () => ctx.state?.st?.step?.id === step.id });
  return h('button', { class: 'role-slot' + (cur() ? ' on' : ''), onclick: open }, cur() ? named(cur()) : [h('span', { class: 'sb empty' }), w('角色', 'muted')]);
}

function twoBody(ctx, s, step, d, set) {
  const form = step.form, of = form.roleOf || {}, may = form.mayBe || {}, t = form.truth;
  if (form.free) {
    const inPlay = new Set(Object.values(of)), maybe = new Set(Object.values(may).flat());
    const picked = [d.a, d.b].filter(Boolean);
    const lvSeat = id => (d.role && of[id] === d.role ? 2 : d.role && (may[id] || []).includes(d.role) ? 1 : 0);
    const lvRole = id => (inPlay.has(id) ? 2 : maybe.has(id) ? 1 : 0), setRole = id => set({ none: false, role: id, a: d.a || null, b: d.b || null });
    return [
      row(form.roles.length > MANY ? roleSlot(ctx, step, 'two', form.roles, () => (d.none ? null : d.role), lvRole, setRole)
        : form.roles.map(id => opt(mini(id), { on: !d.none && d.role === id, level: lvRole(id), onclick: () => setRole(id) })),
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
function choiceBody(ctx, s, step, d, set) {
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
  // 角色多（中毒時整本劇本）：一格，點開整屏劇本單；少的照舊一排
  if (form.kind === 'role' && values.length > MANY) return row(roleSlot(ctx, step, 'role', values, () => d.role, level, id => set({ role: id })));
  return tiles(values);
}

// 築夢師：一個善良角色 + 一個邪惡角色，其中一個是他的真角色（能力正常時必須包含）
function dreamBody(ctx, s, step, d, set) {
  const form = step.form, ok = form.ok || [];
  const level = id => (id === form.role ? 2 : ok.includes(id) ? 1 : 0);
  const tiles = (ids, key) => (ids.length > MANY ? row(roleSlot(ctx, step, key, ids, () => d[key], level, id => set({ [key]: id })))
    : row(ids.map(id => opt(mini(id), { on: d[key] === id, level: level(id), cls: form.vortox && !form.alt && level(id) ? 'off' : '', onclick: () => set({ [key]: id }) }))));
  return [tiles(form.goods, 'good'), tiles(form.evils, 'evil')];
}

// 當前選擇的狀態：level -1 沒選完、0 錯誤、1 登記、2 真實；err 不能發（能力正常卻不合規、渦流在場卻是真的）
function verdict(s, form, d) {
  const level = checkFields(form, d, s.seats.map(x => x.id)) ? -1 : truthLevel(form, d);
  return { level, err: level < 0 || (!form.free && level === 0) || (form.vortox && !form.alt && level > 0) };
}
// 卡頂的索引籤：給說書人的一句，這一步他要做什麼（玩家看的是下面的大字和整屏展示）。
// 「選擇……」是說書人自己挑人；其餘是系統算好的，照著告訴他。中毒 / 醉酒 / 渦流時答案由說書人挑
const TELL = { number: '把這個數字告訴他', yesno: '把結果告訴他', role: '把這個角色告訴他', dream: '把這兩個角色告訴他', text: '給他看魔典' };
export function guide(form) {
  if (form.kind === 'two') return form.plain ? '選擇惡魔和另一名玩家，並告知他' : `選擇一個${TEAMS[form.team]?.name || '角色'}和另一名玩家，並告知他`;
  if (form.open) return '核對失效的能力，把數字告訴他';
  if (form.extra?.guesses || form.unknown) return '核對他猜對幾個，把數字告訴他';
  if (form.why && form.kind !== 'text') return '挑一個答案告訴他（可以是錯的）';
  return TELL[form.kind] || '告知他';
}
// 整屏展示頁頂上的小籤：把什麼告訴誰（「把結果告訴 ③」）。「兩名玩家之一」已經選好了，只寫「告知 ③」。
// 這行字拿著設備的玩家也看得到：只按信息種類寫，不管他是不是中毒 / 醉酒 / 酒鬼（寫法不一樣他就知道自己的信息可能是假的）
const tellSay = (s, step) => {
  // 先整句翻譯再切：英文的「他」是 them，位置也不同（Tell them this number）
  const t = tr(step.form.kind === 'two' ? '告知他' : TELL[step.form.kind] || '告知他'), [a, b] = t.split(getLang() === 'en' ? 'them' : tr('他'));
  return [a, seatBadge(s, step.seatId), b];
};
// 引導籤：這一步說書人要做什麼；他的能力現在不靈（中毒、酒鬼……）時，籤尾一枚紅字，說明為什麼答案可以是錯的
const WHY = { poison: '中毒', tipsy: '醉酒', drunk: '酒鬼', puppet: '提線木偶', vortox: '渦流' };
const guideTag = step => h('div', { class: 'ic-tag say' }, guide(step.form), step.form.why && h('b', { class: 'tag-why' }, WHY[step.form.why]));
// 「展示」整屏只放核心：數字 → 一個大數字；是否 → 大大的「是 / 否」；兩名玩家之一 → 兩個大座位號 + 角色牌；
// 某人是什麼角色 → 他的座位號 + 角色牌；間諜 → 整本魔典。不寫句子，不寫「或」「是」，他們看得懂
export function infoCore(form, f) {
  const x = form.extra || {};
  switch (form.kind) {
    case 'number': return { n: f.n };
    case 'yesno': { const y = YES[form.roleId] || YES.fortuneteller; return { yes: !!f.yes, tone: y.k[f.yes ? 0 : 1] }; }
    case 'two': return f.none ? { n: 0 } : { seats: [f.a, f.b], ...(form.plain ? { team: 'demon' } : { roles: [f.role] }) };
    case 'role': return { seats: [x.targetId], roles: [f.role] };
    case 'dream': return { seats: [x.targetId], roles: [f.good, f.evil] };
    default: return { terms: infoFormula(form, f) };
  }
}
// 單設備「展示」：整屏一頁，頂上小籤「給 N 看」；「看完了」回到這張卡，下一步說書人自己按
const showInfo = (ctx, step, fields) => showPages(ctx.state, [{ to: step.seatId, say: tellSay(ctx.state, step), body: bigCore(ctx.state, infoCore(step.form, fields)) }]);
// 單設備：占卜師這類點完人才有結果的，結果一出來就整屏亮給說書人（該告訴他什麼），每一步只自己彈一次，收起後卡上的「展示」能再打開。
// 中毒、醉酒、渦流時答案要說書人自己挑，不彈
const popped = new Set();
function popResult(ctx, step) {
  const s = ctx.state;
  if (!s.oneDevice || s.peek || !step.picks?.length || step.form.why || popped.has(step.id)) return; // 沒選人的（廚師、共情者）是空數組，不算
  popped.add(step.id);
  requestAnimationFrame(() => ctx.state?.st?.step?.id === step.id && showInfo(ctx, step, step.form.truth));
}
// 發不出去的原因：按鈕照樣灰著，點了說為什麼
function whyNot(s, form, d, level) {
  if (level < 0) return checkFields(form, d, s.seats.map(x => x.id)) || '先選一個答案';
  if (form.vortox && !form.alt && level > 0) return '渦流在場：只能給錯誤信息';
  return '能力正常：只能給合規的信息';
}
// 發出去：線上、線下多設備發到他手機；單設備沒有手機，說書人當面比給他，或者「展示」整屏給他看
// pre：選著的正是開局前預選的那一組——按鈕寫明「使用預選選項」（按鈕還在原位，只換字）
const sendBtn = (ctx, d, { level, err }, step, pre = false) => {
  const why = err ? whyNot(ctx.state, step.form, d, level) : null, cls = (level === 0 ? 'red' : '') + stepLock(), go = () => stepOp(ctx, 'confirm', { fields: d });
  if (!ctx.state.oneDevice) return BW([icon('send'), pre ? '使用預選選項，發送' : '發送'], go, 'wide ' + cls + (pre ? ' use-pre' : ''), why);
  return h('div', { class: 'row ic-send' }, BW([icon('eye'), '展示'], () => showInfo(ctx, step, { ...d }), '', why),
    BW(pre ? '使用預選選項，下一個' : '下一個', go, cls + (pre ? ' use-pre' : ''), why));
};
// 現在選著的是不是開局前預選的那一組（兩名玩家不分先後）
const samePre = (form, d) => {
  const p = form.pre;
  if (!p) return false;
  if (p.none || d.none) return !!p.none && !!d.none;
  const pair = x => [x.a, x.b].filter(Boolean).sort().join();
  return !!(p.role && d.a && d.b) && p.role === d.role && pair(p) === pair(d);
};

// ON_TABLE（洗衣婦、圖書管理員、調查員）。上方：引導 + 必選的那一個；正中：這個組合的後果（「④ 或 ⑦ 是 管家」+ 真實 / 錯誤章）；下方：展示、下一個。
// 能力正常：上方一格一個能當真的人（座位號 + 角色），隱士 / 間諜選中後在下面一排挑他被當作哪個角色；另一名玩家點桌上的頭像。
// 中毒 / 酒鬼 / 渦流：上方是這一類的全部角色（在場的打藍勾），兩名玩家隨便點
function tableForm(ctx, step, d, foot) {
  const s = ctx.state, form = step.form, v = verdict(s, form, d), { level } = v, team = TEAMS[form.team]?.name || '';
  const pick = fn => () => { fn(); ctx.render(); };
  const none = form.allowNone && (form.free || form.truth.none || form.noneOk) && opt(w(`沒有${team}`, 'ink'),
    { on: d.none, level: form.truth.none ? 2 : form.noneOk ? 1 : 0, cls: 'tb-none', onclick: pick(() => { d.none = true; }) });
  let opts, sub = null;
  if (form.free) {
    const inPlay = new Set(Object.values(form.roleOf || {})), maybe = new Set(Object.values(form.mayBe || {}).flat());
    const roles = [...form.roles.filter(id => inPlay.has(id)), ...form.roles.filter(id => !inPlay.has(id))];
    opts = roles.map(id => opt(roles.length > 6 ? mini(id) : named(id), { on: !d.none && d.role === id, level: inPlay.has(id) ? 2 : maybe.has(id) ? 1 : 0,
      onclick: pick(() => Object.assign(d, { none: false, role: id })) }));
  } else {
    const list = truths(s, form).filter(x => !x.none), many = list.length > 4;
    opts = list.map(x => {
      const on = !d.none && d.a === x.seat, r = x.role || (on ? d.role : null);
      // 選中的那一格也是綠的：和桌上鎖住的座位是一對
      return opt([seatBadge(s, x.seat), x.via && mini(x.via, 'via'), r ? (many ? mini(r) : named(r)) : h('span', { class: 'tt q' }, '?')],
        { on, level: x.via ? 1 : 2, cls: 'tb-who', lock: on, onclick: () => { pickHolder(form, d, x.seat); ctx.render(); } });
    });
    // 隱士 / 間諜：選中後挑他被當作哪個角色
    const cur = list.find(x => !d.none && d.a === x.seat);
    if (cur?.roles?.length > 1) sub = row(cur.roles.map(id => opt(mini(id), { on: d.role === id, level: 1, onclick: pick(() => { d.role = id; }) })));
  }
  const slot = id => (id ? seatBadge(s, id) : h('span', { class: 'sb empty' }));
  // 按座位順序寫（和整屏展示一樣），看不出哪個是真的
  const pair = picked(d).sort((x, y) => s.seats.findIndex(q => q.id === x) - s.seats.findIndex(q => q.id === y));
  // 能力正常時對不上的組合發不出去，寫「不合規」；中毒 / 酒鬼時發得出去，是一條錯誤信息
  const verdictWord = level < 0 ? null : level === 0 && !form.free ? '不合規' : ['錯誤', '登記', '真實'][level];
  return h('div', { class: 'card focus infocard spread tb' + (form.free ? ' free' : '') },
    h('div', { class: 'ic-body tb-pick' }, guideTag(step), row(opts, none), sub),
    h('div', { class: 'ic-top' }, actorMark(s, step), goonLine(s, step),
      // 印章在紙條外面一層：手機上蓋在紙條右上角（紙條就不用給它留位置），電腦上在紙條右邊
      h('div', { class: 'tb-res' },
        h('div', { class: 'tb-slip' },
          d.none ? formula(s, infoFormula(form, d), 'big')
            : h('span', { class: 'frm big' }, slot(pair[0]), w('或'), slot(pair[1]), w('是'), d.role ? named(d.role) : h('span', { class: 'sb empty' }))),
        verdictWord && h('span', { class: 'tb-stamp t' + level, 'data-key': verdictWord }, verdictWord))),
    h('div', { class: 'ic-foot' }, foot || sendBtn(ctx, d, v, step, samePre(form, d))));
}

// 開局前預選（flow.js preRow）：和首夜那一步同一張卡，同樣的點法；下方是「清除」「完成」。f 是服務端 st.preForms 的一項
const preStep = f => ({ id: 'pre-' + f.seatId, roleId: f.roleId, seatId: f.seatId, form: f.form, turn: false });
export const preDraft = (f, fields) => { drafts['pre-' + f.seatId] = { a: null, b: null, role: null, ...(fields || {}) }; };
export const prePicking = (ctx, f) => seatPicking(ctx, preStep(f));
export function preCard(ctx, f, done) {
  const step = preStep(f), d = draftOf(step);
  const blank = !d.none && !d.a && !d.b && !d.role; // 什麼都沒選就按完成：等於沒預選
  return tableForm(ctx, step, d, h('div', { class: 'row' }, B('清除', () => done(null), 'ghost'), B('完成', () => done(blank ? null : { ...d }))));
}

// 雜耍藝人：白天公開猜過的，對不對系統算好了
const guessList = (s, list) => h('div', { class: 'ic-events' }, list.map(x => h('div', { class: 'log-row' },
  seatBadge(s, x.seat), named(x.role), x.hit ? w(getLang() === 'en' ? 'right' : '對', 'good') : x.maybe ? w('可算對', 'ink') : w('錯', 'muted'))));

// 單設備、能力正常：系統算好的信息就是答案，不用改、不用發。說書人當面比給他，或者「展示」整屏給他看
function plainInfo(ctx, step) {
  const s = ctx.state, form = step.form, terms = infoFormula(form, form.truth);
  popResult(ctx, step);
  // 沒有要選的：引導籤掛在正中那張上，正中只有要告訴他的結論
  return h('div', { class: 'card focus infocard spread' + (form.free ? ' free' : '') },
    h('div', { class: 'ic-top' }, guideTag(step), actorMark(s, step), goonLine(s, step), h('div', { class: 'ic-preview good' }, formula(s, terms, 'big'))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row ic-send' },
      B([icon('eye'), '展示'], () => showInfo(ctx, step, form.truth)),
      B('下一個', () => stepOp(ctx, 'confirm', { fields: form.truth }), stepLock()))));
}

export function infoForm(ctx, step) {
  const s = ctx.state, form = step.form;
  // 單設備：能力正常時系統算好的信息就是答案；中毒、醉酒、渦流時說書人自己挑一個（錯誤的）告訴他，才用下面的選項。
  // 數學家也用選項：數字算好了、預選、打藍勾，但哪些失常算數由說書人定，要能改；雜耍藝人口頭猜的系統不知道對錯，也是說書人挑
  // 「兩名玩家之一是 X」：持有者和另一名玩家由說書人挑（系統預選了一組），也走下面的選項
  // 隱士 / 間諜可以登記成別的（alt）、場上有系統不認識的角色（free）：答案不止一個，也要讓說書人挑
  if (s.oneDevice && form.truth && form.kind !== 'text' && form.kind !== 'two' && !form.free && !form.alt && !form.open && !form.unknown) return plainInfo(ctx, step);
  const d = draftOf(step);
  if (ON_TABLE.has(step.roleId) && form.kind === 'two') return tableForm(ctx, step, d);
  const set = patch => { Object.assign(d, patch); ctx.render(); };
  const body = form.kind === 'two' ? twoBody(ctx, s, step, d, set) : form.kind === 'dream' ? dreamBody(ctx, s, step, d, set)
    : form.kind === 'text' ? null : choiceBody(ctx, s, step, d, set);
  const v = verdict(s, form, d), { level } = v, terms = level < 0 ? null : infoFormula(form, d);
  const slip = t => h('div', { class: 'ic-preview ' + (level < 0 ? 'empty' : ['bad', 'alt', 'good'][level]) },
    t ? formula(s, t, 'big') : h('span', { class: 'frm' }, h('i', { class: 'op-sep' })));
  // 間諜的魔典沒有選項、又高：手機上擺在圓桌上方（拆開時 ic-body 的位置）；換行後面的惡魔偽裝是短短一行，和發送並排在下方，
  // 發送和別的信息卡在同一個地方，上方也少佔一行
  const br = form.kind === 'text' && terms ? terms.findIndex(t => t.op === 'br') : -1;
  const top = form.kind === 'text' && slip(br < 0 ? terms : terms.slice(0, br)), bottom = form.kind !== 'text' ? slip(terms) : br >= 0 && slip(terms.slice(br + 1));
  // 上方：引導 + 要選的（數學家：成功 / 可能失效兩組和數字放在一起；間諜：整本魔典）；正中：結論；下方：按鈕。
  // 什麼都不用選（唯一答案）：引導籤掛在正中那張上
  const pickArea = body || form.open || top;
  return h('div', { class: 'card focus infocard spread' + (form.free ? ' free' : '') },
    pickArea && h('div', { class: 'ic-body' }, guideTag(step), form.open && mathGroups(s, form), body, top),
    h('div', { class: 'ic-top' }, !pickArea && guideTag(step), actorMark(s, step), goonLine(s, step), bottom),
    form.extra?.guesses && guessList(s, form.extra.guesses),
    h('div', { class: 'ic-foot' }, sendBtn(ctx, d, v, step)));
}
