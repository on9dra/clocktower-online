// 說書人開局配置：角色「必選 / 排除」；給某個座位更換角色（預覽時和遊戲中都可以）
import { h, modal, closeModal, roleToken, seatLabel } from './ui.js';
import { ROLES, TEAMS, CORE, SCRIPTS, teamCounts, changesSetup } from './roles.js';
import { tr } from './lang.js';

const RULE_TEXT = { lock: '必選', ban: '排除' };
const nextRule = r => (r === 'lock' ? 'ban' : r === 'ban' ? null : 'lock');

const countsOf = (n, rules) => teamCounts(n, Object.keys(rules).filter(id => rules[id] === 'lock' && changesSetup(id)));
// 以為自己是別的角色：酒鬼以為是鎮民，瘋子以為是惡魔
const FAKE = { drunk: 'townsfolk', lunatic: 'demon' };

// 人數一行 + 超額警告：行高固定，滾動時吸在頂上；警告是蓋在這一行右邊的印章，彈窗不會變長
function statusLine(n, rules) {
  const text = h('span', {}), warn = h('b', { class: 'setup-warn', role: 'alert' });
  const update = () => {
    if (n < 5) return void (text.textContent = tr(`現在 ${n} 人，至少需要 5 人才能開局。`));
    const c = countsOf(n, rules);
    text.textContent = tr(`${n} 人：鎮民 ${c.townsfolk}、外來者 ${c.outsider}、爪牙 ${c.minion}、惡魔 ${c.demon}`);
    const count = t => Object.keys(rules).filter(id => rules[id] === 'lock' && ROLES[id].team === t).length;
    const over = CORE.filter(t => count(t) > c[t]).map(t => `${TEAMS[t].name} ${count(t)}/${c[t]}`).join('、');
    const was = warn.textContent;
    if (over) warn.textContent = tr(`必選超額 ${over}`); // 沒超額時字留著，淡出時不會一下子空掉
    warn.classList.toggle('on', !!over);
    if (over && was && warn.textContent !== was) warn.animate({ rotate: ['-5deg', '1deg', '-2deg'], scale: [1.18, 1] }, { duration: 240, easing: 'ease-out' });
  };
  update();
  return [h('div', { class: 'setup-status' }, text, warn), update];
}

export function openSetup(ctx) {
  const s = ctx.state, rules = { ...s.st.roleRules };
  const roles = SCRIPTS[s.scriptId].roles;
  const [status, update] = statusLine(s.seats.length, rules);
  const tiles = {};
  // 只改點到的那一格：整塊重畫會丟滾動位置，也會讓別的格子閃一下
  const paint = id => {
    const b = tiles[id];
    b.classList.remove('rand', 'lock', 'ban');
    b.classList.add(rules[id] || 'rand');
    b.querySelector('i').textContent = tr(RULE_TEXT[rules[id]] || '隨機');
  };
  const toggle = id => {
    const r = nextRule(rules[id]);
    if (r) rules[id] = r; else delete rules[id];
    ctx.st('roleRule', { roleId: id, rule: r });
    paint(id);
    update();
  };
  const reset = () => { for (const k in rules) delete rules[k]; ctx.st('clearRules'); roles.forEach(paint); update(); };
  const tile = id => (tiles[id] = h('button', { class: 'setup-role ' + (rules[id] || 'rand'), onclick: () => toggle(id) },
    roleToken(id, { size: 'sm' }), h('span', {}, ROLES[id].name), h('i', {}, RULE_TEXT[rules[id]] || '隨機')));
  modal('角色配置', h('div', {},
    h('p', { class: 'muted', style: { marginTop: 0 } }, '點角色切換：隨機（默認）→ 必選 → 排除。' + (s.scriptId === 'tb' ? '男爵隨機時只在 7 人及以上出現。' : '')),
    status,
    CORE.map(team => [
      h('div', { class: 'sheet-team', style: { color: TEAMS[team].color } }, TEAMS[team].name),
      h('div', { class: 'setup-grid' }, roles.filter(id => ROLES[id].team === team).map(tile)),
    ]),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('button', { class: 'btn ghost', onclick: reset }, '全部恢復隨機'),
      h('button', { class: 'btn primary', onclick: closeModal }, '完成'))), { wide: true, cls: 'setup-modal' });
}

const roleGrid = (ids, onPick) => h('div', { class: 'guess-grid' }, ids.map(id =>
  h('div', { class: 'guess-pick', onclick: () => onPick(id) }, roleToken(id, { size: 'sm' }), ROLES[id].name)));

// 指定一格惡魔偽裝：智能推進只列不在場的善良角色，手動局列全部
export function pickBluff(ctx, i) {
  const s = ctx.state, pins = s.st.bluffPins, manual = s.mode === 'manual', used = new Set(s.seats.flatMap(x => [x.role, x.fakeRole]));
  const ok = id => !pins.includes(id) && (manual || (['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk' && !used.has(id)));
  const set = roleId => { closeModal(); ctx.st('setBluff', { i, roleId }); };
  modal('惡魔偽裝', h('div', {}, roleGrid(SCRIPTS[s.scriptId].roles.filter(ok), set),
    pins[i] && h('button', { class: 'btn ghost', onclick: () => set(null) }, '恢復隨機')), { wide: true });
}

// 手動局：玩家看到的角色，可以和魔典上的不一樣
export function pickShown(ctx, seat) {
  const s = ctx.state, set = roleId => { closeModal(); ctx.st('setShown', { seatId: seat.id, roleId }); };
  modal(`${seatLabel(s, seat.id)} 看到的角色`, h('div', {}, roleGrid(SCRIPTS[s.scriptId].roles, set),
    seat.fakeRole && h('button', { class: 'btn ghost', onclick: () => set(null) }, '和魔典一樣')), { wide: true });
}

// 選一個新角色；選酒鬼 / 瘋子時再選他以為自己是哪個鎮民 / 惡魔
export function pickRole(ctx, seat) {
  const s = ctx.state, roles = SCRIPTS[s.scriptId].roles;
  const used = new Set(s.seats.map(x => x.role));
  const grid = (ids, onPick, mark) => h('div', { class: 'guess-grid' }, ids.map(id =>
    h('div', { class: 'guess-pick' + (id === seat.role ? ' on' : ''), onclick: () => onPick(id) },
      roleToken(id, { size: 'sm' }), ROLES[id].name, mark && used.has(id) && h('small', { class: 'muted' }, '在場'))));
  const set = (roleId, fakeRole) => { closeModal(); ctx.st('setRole', { seatId: seat.id, roleId, fakeRole }); };
  const body = h('div', {});
  const choose = id => {
    if (!FAKE[id]) return set(id);
    body.replaceChildren(h('p', { style: { marginTop: 0 } }, `${ROLES[id].name}以為自己是哪個${TEAMS[FAKE[id]].name}？`),
      grid(roles.filter(r => ROLES[r].team === FAKE[id]), f => set(id, f), true));
  };
  body.append(h('div', {},
    s.phase !== 'lobby' && h('p', { class: 'warn small', style: { marginTop: 0 } }, '遊戲中更換角色會私下通知該玩家；今晚已經排好的喚醒順序不變。'),
    grid(roles, choose, true)));
  modal(`${seatLabel(s, seat.id)} 的角色`, body, { wide: true });
}
