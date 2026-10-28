// 說書人開局配置：角色「必選 / 排除」；給某個座位更換角色（預覽時和遊戲中都可以）
import { h, modal, closeModal, roleToken, seatLabel } from './ui.js';
import { ROLES, TEAMS, SCRIPTS, teamCounts, changesSetup } from './roles.js';

const RULE_TEXT = { lock: '必選', ban: '排除' };
const nextRule = r => (r === 'lock' ? 'ban' : r === 'ban' ? null : 'lock');

const countsOf = (n, rules) => teamCounts(n, Object.keys(rules).filter(id => rules[id] === 'lock' && changesSetup(id)));
// 以為自己是別的角色：酒鬼以為是鎮民，瘋子以為是惡魔
const FAKE = { drunk: 'townsfolk', lunatic: 'demon' };

function countsLine(n, rules) {
  if (n < 5) return h('p', { class: 'muted' }, `現在 ${n} 人，至少需要 5 人才能開局。`);
  const locked = Object.keys(rules).filter(id => rules[id] === 'lock');
  const c = countsOf(n, rules);
  const over = Object.keys(TEAMS).filter(t => locked.filter(id => ROLES[id].team === t).length > c[t]);
  return [h('p', { class: 'small' }, `${n} 人：鎮民 ${c.townsfolk} · 外來者 ${c.outsider} · 爪牙 ${c.minion} · 惡魔 ${c.demon}`),
    over.length > 0 && h('p', { class: 'warn small' }, `必選的${over.map(t => TEAMS[t].name).join('、')}超過了名額，開局時會報錯。`)];
}

export function openSetup(ctx) {
  const s = ctx.state, rules = { ...s.st.roleRules };
  const roles = SCRIPTS[s.scriptId].roles;
  const body = h('div', {});
  const toggle = id => {
    const r = nextRule(rules[id]);
    if (r) rules[id] = r; else delete rules[id];
    ctx.st('roleRule', { roleId: id, rule: r });
    draw();
  };
  const reset = () => { for (const k in rules) delete rules[k]; ctx.st('clearRules'); draw(); };
  const draw = () => body.replaceChildren(h('div', {},
    h('p', { class: 'muted', style: { marginTop: 0 } }, '點角色切換：隨機（默認）→ 必選 → 排除。' + (s.scriptId === 'tb' ? '男爵隨機時只在 7 人及以上出現。' : '')),
    countsLine(s.seats.length, rules),
    Object.keys(TEAMS).map(team => [
      h('div', { class: 'sheet-team', style: { color: TEAMS[team].color } }, TEAMS[team].name),
      h('div', { class: 'setup-grid' }, roles.filter(id => ROLES[id].team === team).map(id =>
        h('button', { class: 'setup-role ' + (rules[id] || 'rand'), onclick: () => toggle(id) },
          roleToken(id, { size: 'sm' }), h('span', {}, ROLES[id].name), h('i', {}, RULE_TEXT[rules[id]] || '隨機')))),
    ]),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('button', { class: 'btn ghost', onclick: reset }, '全部恢復隨機'),
      h('button', { class: 'btn primary', onclick: closeModal }, '完成'))));
  draw();
  modal('角色配置', body, { wide: true });
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
