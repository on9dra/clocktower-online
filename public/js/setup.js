// 說書人開局配置：角色「必選 / 排除」；給某個座位更換角色（預覽時和遊戲中都可以）
import { h, modal, closeModal, roleToken, seatLabel, leaveDom } from './ui.js';
import { ROLES, TEAMS, CORE, SCRIPTS, teamCounts, changesSetup } from './roles.js';
import { icon } from './glyph.js';
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
      h('button', { class: 'btn', onclick: closeModal }, '完成'))), { wide: true, cls: 'setup-modal' });
}

const roleGrid = (ids, onPick) => h('div', { class: 'guess-grid' }, ids.map(id =>
  h('div', { class: 'guess-pick', onclick: () => onPick(id) }, roleToken(id, { size: 'sm' }), ROLES[id].name)));
// 按陣營分好：鎮民在前，上傳劇本裏的旅行者、傳奇角色排在後面
const teamsOf = ids => Object.keys(TEAMS).map(t => [t, ids.filter(id => ROLES[id].team === t)]).filter(([, list]) => list.length);

// 開著的偽裝彈窗：服務器補了新的隨機格子時跟著換（syncSetup）
let bluffSheet = null;

// 指定惡魔偽裝：彈窗開著連選，選完跳到下一格，再點一次恢復隨機。
// 智能推進只能選不在場的善良角色，在場的置灰標出來；手動局都能選，只標出來
export function pickBluff(ctx, at) {
  const s = ctx.state, manual = s.mode === 'manual', used = new Set(s.seats.flatMap(x => [x.role, x.fakeRole]));
  const pins = [0, 1, 2].map(i => s.st.bluffPins?.[i] || null), shown = [], tiles = {};
  const ids = SCRIPTS[s.scriptId].roles.filter(id => manual || (['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk'));
  const row = h('div', { class: 'bp-slots' });
  const slots = [0, 1, 2].map(i => h('button', { class: 'bp-slot', onclick: () => { at = i; paint(); } }, h('i', { class: 'pin-mark' }, icon('quill'))));
  // 只動變了的東西：換掉那一格的牌，其餘加減 class
  const paint = () => slots.forEach((b, i) => {
    const id = pins[i] || ctx.state.st.bluffs[i];
    b.classList.toggle('at', i === at);
    b.classList.toggle('pinned', !!pins[i]);
    if (shown[i] !== id) {
      shown[i] = id;
      b.querySelector('.bp-role')?.remove();
      b.append(h('span', { class: 'bp-role' }, roleToken(id, { size: 'sm' }), h('b', {}, ROLES[id]?.name || '')));
    }
  });
  const toggle = id => {
    const was = pins.indexOf(id);
    if (was >= 0) {
      pins[was] = null;
      at = was;
      ctx.st('setBluff', { i: was, roleId: null });
    } else {
      pins[at] = id;
      ctx.st('setBluff', { i: at, roleId: id });
      at = [1, 2, 3].map(k => (at + k) % 3).find(i => !pins[i]) ?? (at + 1) % 3;
    }
    tiles[id].classList.toggle('on', was < 0);
    paint();
  };
  const tile = id => {
    const off = !manual && used.has(id);
    return (tiles[id] = h('div', { class: 'guess-pick' + (pins.includes(id) ? ' on' : '') + (off ? ' off' : ''), onclick: off ? null : () => toggle(id) },
      roleToken(id, { size: 'sm' }), ROLES[id].name, used.has(id) && h('small', { class: 'muted' }, '在場')));
  };
  row.append(...slots);
  const box = modal('惡魔偽裝', h('div', {}, row,
    teamsOf(ids).map(([t, list]) => [h('div', { class: 'sheet-team', style: { color: TEAMS[t].color } }, TEAMS[t].name), h('div', { class: 'guess-grid' }, list.map(tile))]),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: closeModal }, '完成'))), { wide: true, cls: 'bluff-modal' });
  paint();
  row.classList.add('live'); // 開彈窗時三張牌不演，之後選的才蓋章
  bluffSheet = () => {
    if (!box.isConnected || box.parentNode.classList.contains('leaving')) return void (bluffSheet = null);
    if (!ctx.state.st?.draft) { bluffSheet = null; return closeModal(); } // 有人進出，抽好的作廢
    paint();
  };
}

// 懸停座位頭像：旁邊出一張角色表，直接選（只有鼠標有懸停，觸屏還走座位菜單）。
// 掛在 body 上不跟著桌面重繪；換座位時同一張紙挪過去，只改標記，不重播
export const canHover = () => matchMedia('(hover: hover)').matches;
const pick = { el: null, seatId: null, anchor: null, title: null, body: null, sub: null, tiles: {}, timer: 0 };
export const pickingSeat = () => pick.seatId;

// 進頭像：停一下才開，鼠標路過不彈；紙已經開著時跟得快一點
export function hoverSeat(ctx, seatId, anchor) {
  clearTimeout(pick.timer);
  pick.timer = setTimeout(() => showPick(ctx, seatId, anchor), pick.el ? 70 : 150);
}
// 離開頭像或紙：留一點時間走過中間的縫
export function leaveSeat() {
  clearTimeout(pick.timer);
  pick.timer = setTimeout(closePick, 240);
}
export function closePick() {
  clearTimeout(pick.timer);
  if (!pick.el) return;
  pick.anchor.closest('.seat')?.classList.remove('aimed');
  leaveDom(pick.el, 130);
  pick.el = pick.seatId = pick.anchor = null;
}

function showPick(ctx, seatId, anchor) {
  if (document.querySelector('.popmenu:not(.leaving)') || !anchor.isConnected) return;
  if (!pick.el) buildPick(ctx);
  pick.anchor?.closest('.seat')?.classList.remove('aimed');
  pick.seatId = seatId;
  pick.anchor = anchor;
  anchor.closest('.seat').classList.add('aimed');
  pick.sub.hidden = true;
  pick.body.hidden = false;
  pick.el.style.height = '';
  paintPick(ctx);
  if (!pick.el.isConnected) document.body.append(pick.el);
  placePick();
}

function buildPick(ctx) {
  const s = ctx.state, roles = SCRIPTS[s.scriptId].roles;
  pick.tiles = {};
  const tile = (id, onPick) => h('button', { class: 'sp-role', onclick: () => onPick(id) }, roleToken(id, { size: 'sm' }), h('span', {}, ROLES[id].name), h('i', {}, '在場'));
  const set = (roleId, fakeRole) => { const seatId = pick.seatId; closePick(); ctx.st('setRole', { seatId, roleId, fakeRole }); };
  // 酒鬼、瘋子：同一張紙上接著選他以為自己是誰
  const choose = id => {
    const seat = ctx.state.seats.find(x => x.id === pick.seatId);
    if (id === seat?.role && seat.pinned) { closePick(); return ctx.st('unpin', { seatId: seat.id }); }
    if (!FAKE[id]) return set(id);
    const used = new Set(ctx.state.seats.map(x => x.role));
    pick.sub.replaceChildren(h('p', {}, `${ROLES[id].name}以為自己是哪個${TEAMS[FAKE[id]].name}？`),
      h('div', { class: 'sp-grid' }, roles.filter(r => ROLES[r].team === FAKE[id]).map(f => {
        const b = tile(f, () => set(id, f));
        b.classList.toggle('in', used.has(f));
        return b;
      })));
    pick.el.style.height = pick.el.offsetHeight + 'px'; // 紙不變大小：鼠標還停在紙上，也不用重新找
    pick.body.hidden = true;
    pick.sub.hidden = false;
  };
  pick.title = h('div', { class: 'sp-title' });
  pick.body = h('div', { class: 'sp-body' }, teamsOf(roles).map(([t, list]) => h('div', { class: 'sp-team', style: { '--team': TEAMS[t].color } },
    h('b', {}, TEAMS[t].name), h('div', { class: 'sp-grid' }, list.map(id => (pick.tiles[id] = tile(id, choose)))))));
  pick.sub = h('div', { class: 'sp-body sp-sub', hidden: true });
  pick.el = h('div', { class: 'seat-pick', onmouseenter: () => clearTimeout(pick.timer), onmouseleave: leaveSeat }, pick.title, pick.body, pick.sub);
}

function paintPick(ctx) {
  const s = ctx.state, seat = s.seats.find(x => x.id === pick.seatId);
  pick.title.textContent = tr(seatLabel(s, seat.id));
  const used = new Set(s.seats.filter(x => x !== seat).map(x => x.role));
  for (const [id, b] of Object.entries(pick.tiles)) {
    b.classList.toggle('on', id === seat.role);
    b.classList.toggle('in', used.has(id));
  }
}

// 往桌子外側放，放不下就放裏側；尾巴指著頭像
function placePick() {
  const el = pick.el, r = pick.anchor.getBoundingClientRect(), ring = pick.anchor.closest('.ring').getBoundingClientRect();
  const w = el.offsetWidth, ht = el.offsetHeight, gap = 12, outLeft = r.left + r.width / 2 < ring.left + ring.width / 2;
  const fits = outLeft ? r.left - gap - w >= 8 : r.right + gap + w <= innerWidth - 8;
  const left = fits ? outLeft : !outLeft, y = Math.max(8, Math.min(innerHeight - ht - 8, r.top + r.height / 2 - ht / 2));
  el.classList.toggle('l', left);
  el.classList.toggle('r', !left);
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, left ? r.left - gap - w : r.right + gap)) + 'px';
  el.style.top = y + 'px';
  el.style.setProperty('--ay', Math.max(14, Math.min(ht - 14, r.top + r.height / 2 - y)) + 'px');
}

// 每次重繪之後：開著的角色表和偽裝彈窗跟上最新狀態
export function syncSetup(ctx) {
  bluffSheet?.();
  if (!pick.el) return;
  const s = ctx.state;
  if (!s.isSt || s.peek || s.phase !== 'lobby' || !pick.anchor.isConnected || !s.seats.some(x => x.id === pick.seatId)) return closePick();
  paintPick(ctx);
  if (pick.sub.hidden) placePick();
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
