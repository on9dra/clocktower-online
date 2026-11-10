// 說書人開局配置：角色「必選 / 排除」；給某個座位更換角色（預覽時和遊戲中都可以）
import { h, modal, closeModal, roleToken, seatLabel, leaveDom } from './ui.js';
import { ROLES, TEAMS, CORE, SCRIPTS, teamCounts, changesSetup, FAKE, fakeOk, fakeKind } from './roles.js';
import { icon, seatBadge, tag, w } from './glyph.js';
import { tr } from './lang.js';
import { rolePanel, syncRolePanel, closeRolePanel } from './rolepick.js';

const RULE_TEXT = { lock: '必選', ban: '排除' };
const nextRule = r => (r === 'lock' ? 'ban' : r === 'ban' ? null : 'lock');

const countsOf = (n, rules) => teamCounts(n, Object.keys(rules).filter(id => rules[id] === 'lock' && changesSetup(id)));

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

// 按陣營分好：鎮民在前，上傳劇本裏的旅行者、傳奇角色排在後面
const teamsOf = ids => Object.keys(TEAMS).map(t => [t, ids.filter(id => ROLES[id].team === t)]).filter(([, list]) => list.length);
const stOk = ctx => !!ctx.state?.isSt && !ctx.state.peek;

// 指定惡魔偽裝：整屏的劇本單（rolepick.js），頂上三格，開著連選，選完跳到下一格，再點一次恢復隨機。
// 只能選不在場的善良角色，在場的置灰標出來（點了說為什麼）；服務器補了新的隨機格子時三格跟著換（onPaint）
export function pickBluff(ctx, at) {
  const s = ctx.state, used = () => new Set(ctx.state.seats.flatMap(x => [x.role, x.fakeRole]));
  const pins = [0, 1, 2].map(i => s.st.bluffPins?.[i] || null), shown = [];
  const ids = SCRIPTS[s.scriptId].roles.filter(id => ['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk');
  const row = h('div', { class: 'bp-slots' });
  const slots = [0, 1, 2].map(i => h('button', { class: 'bp-slot', onclick: () => { at = i; paint(); } }, h('i', { class: 'pin-mark' }, icon('quill'))));
  // 只動變了的東西：換掉那一格的牌，其餘加減 class
  const paint = () => slots.forEach((b, i) => {
    const id = pins[i] || ctx.state.st.bluffs[i];
    b.classList.toggle('at', i === at);
    b.classList.toggle('pinned', !!pins[i]);
    if (!(i in shown) || shown[i] !== id) {
      shown[i] = id;
      b.querySelector('.bp-role')?.remove();
      // 抽不滿的格子（小劇本人多時善良角色都在場）：空著，照樣能選中這一格
      b.append(id ? h('span', { class: 'bp-role' }, roleToken(id, { size: 'sm' }), h('b', {}, ROLES[id]?.name || ''))
        : h('span', { class: 'bp-role empty' }, h('b', {}, '空')));
    }
  });
  // 連選：面板不收，選中的那張蓋「選」字印（這一格原來指定的那張讓出來），再點一次那張恢復隨機
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
    panel.paint();
    return 'stay';
  };
  row.append(...slots);
  // 有人進出（座位變了）抽好的就作廢：面板跟著收走
  const panel = rolePanel({ key: 'bluff', tab: tag('bluff'), top: row, roles: ids, done: '完成', pick: toggle,
    state: id => ({ on: pins.includes(id), off: used().has(id), why: '在場的角色不能當偽裝' }),
    onPaint: () => paint(), alive: () => stOk(ctx) && ctx.state.phase === 'lobby' && !!ctx.state.st?.draft });
  row.classList.add('live'); // 開的時候三張牌不演，之後選的才蓋章
}

// 懸停座位頭像：旁邊出一張角色表，直接選（只有鼠標有懸停，觸屏還走座位菜單）。
// 掛在 body 上不跟著桌面重繪；換座位時同一張紙挪過去，只改標記，不重播
export const canHover = () => matchMedia('(hover: hover)').matches;
const pick = { el: null, seatId: null, anchor: null, title: null, body: null, sub: null, foot: null, acts: null, tiles: {}, timer: 0 };
export const pickingSeat = () => pick.seatId;

// 進頭像：停一下才開，鼠標路過不彈；紙已經開著時跟得快一點
export function hoverSeat(ctx, seatId, anchor, acts) {
  clearTimeout(pick.timer);
  pick.timer = setTimeout(() => showPick(ctx, seatId, anchor, acts), pick.el ? 70 : 150);
}
// 點座位（準備階段）：不等懸停的那一下，馬上開；已經開著這個座位的就不動
export function openPick(ctx, seatId, anchor, acts) {
  clearTimeout(pick.timer);
  if (pick.el && pick.seatId === seatId) return;
  showPick(ctx, seatId, anchor, acts);
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

// acts：紙底下的小按鈕（線上 / 多設備的真人座位：換設備、移出房間）。名字座位沒有：改名點名牌，加減人數在左下角
function showPick(ctx, seatId, anchor, acts) {
  if (document.querySelector('.popmenu:not(.leaving)') || !anchor.isConnected) return;
  if (!pick.el) buildPick(ctx);
  pick.anchor?.closest('.seat')?.classList.remove('aimed');
  pick.seatId = seatId;
  pick.anchor = anchor;
  anchor.closest('.seat').classList.add('aimed');
  pick.sub.hidden = true;
  pick.body.hidden = false;
  pick.el.style.height = '';
  pick.foot.replaceChildren(...(acts || []).map(a => h('button', { class: 'sp-act' + (a.danger ? ' danger' : ''), onclick: () => { closePick(); a.onclick(); } }, a.label)));
  pick.foot.hidden = !acts?.length;
  paintPick(ctx);
  if (!pick.el.isConnected) document.body.append(pick.el);
  placePick();
}

// 紙底下一條能力：指著哪個角色就印哪個的能力全文，沒指著時是這個座位現在的角色。字換的時候淡一下，不跳
function showAb(id) {
  if (!pick.ab || pick.abId === id) return;
  pick.abId = id;
  const r = id && ROLES[id];
  pick.ab.replaceChildren(...(r ? [h('b', { style: { color: TEAMS[r.team]?.color } }, r.name), h('span', {}, r.ability)] : []));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) pick.ab.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
}
const seatRole = ctx => ctx.state.seats.find(x => x.id === pick.seatId)?.role || null;

function buildPick(ctx) {
  const s = ctx.state, roles = SCRIPTS[s.scriptId].roles;
  pick.tiles = {};
  pick.abId = undefined;
  const tile = (id, onPick) => h('button', { class: 'sp-role', onclick: () => onPick(id), onmouseenter: () => showAb(id) }, roleToken(id, { size: 'sm' }), h('span', {}, ROLES[id].name), h('i', {}, '在場'));
  const set = (roleId, fakeRole) => { const seatId = pick.seatId; closePick(); ctx.st('setRole', { seatId, roleId, fakeRole }); };
  // 酒鬼、瘋子、提線木偶：同一張紙上接著選他以為自己是誰
  const choose = id => {
    const seat = ctx.state.seats.find(x => x.id === pick.seatId);
    if (id === seat?.role && seat.pinned) { closePick(); return ctx.st('unpin', { seatId: seat.id }); }
    if (!FAKE[id]) return set(id);
    const used = new Set(ctx.state.seats.map(x => x.role));
    pick.sub.replaceChildren(h('p', {}, `${ROLES[id].name}以為自己是哪個${fakeKind(id)}？`),
      h('div', { class: 'sp-grid' }, roles.filter(r => fakeOk(id, r)).map(f => {
        const b = tile(f, () => set(id, f));
        b.classList.toggle('in', used.has(f));
        return b;
      })));
    pick.el.style.height = pick.el.offsetHeight + 'px'; // 紙不變大小：鼠標還停在紙上，也不用重新找
    pick.body.hidden = true;
    pick.sub.hidden = false;
  };
  pick.title = h('div', { class: 'sp-title' });
  const back = () => showAb(seatRole(ctx)); // 指針離開角色格：換回這個座位現在的角色
  pick.body = h('div', { class: 'sp-body', onmouseleave: back }, teamsOf(roles).map(([t, list]) => h('div', { class: 'sp-team', style: { '--team': TEAMS[t].color } },
    h('b', {}, TEAMS[t].name), h('div', { class: 'sp-grid' }, list.map(id => (pick.tiles[id] = tile(id, choose)))))));
  pick.sub = h('div', { class: 'sp-body sp-sub', hidden: true, onmouseleave: back });
  pick.ab = h('div', { class: 'sp-ab' });
  pick.foot = h('div', { class: 'sp-foot', hidden: true });
  pick.el = h('div', { class: 'seat-pick', onmouseenter: () => clearTimeout(pick.timer), onmouseleave: leaveSeat }, pick.title, pick.body, pick.sub, pick.ab, pick.foot);
}

function paintPick(ctx) {
  const s = ctx.state, seat = s.seats.find(x => x.id === pick.seatId);
  pick.title.textContent = tr(seatLabel(s, seat.id));
  const used = new Set(s.seats.filter(x => x !== seat).map(x => x.role));
  for (const [id, b] of Object.entries(pick.tiles)) {
    b.classList.toggle('on', id === seat.role);
    b.classList.toggle('in', used.has(id));
  }
  if (!pick.el?.matches(':hover')) showAb(seat.role || null); // 換座位、角色變了：底下換成他現在的角色（指針正停在某個角色上時不搶）
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

// 每次重繪之後：開著的角色表、整屏的選角色（偽裝、夜晚行動……）跟上最新狀態，這一步過了就收走
export function syncSetup(ctx) {
  syncRolePanel();
  if (!pick.el) return;
  const s = ctx.state;
  if (!s.isSt || s.peek || s.phase !== 'lobby' || !pick.anchor.isConnected || !s.seats.some(x => x.id === pick.seatId)) return closePick();
  paintPick(ctx);
  if (pick.sub.hidden) placePick();
}

// 指定角色（準備階段，觸屏）、更換角色（遊戲中）：整屏的劇本單（rolepick.js），現在的角色蓋著「選」，別的座位上有的標「在場」。
// 選酒鬼 / 瘋子 / 提線木偶時同一張紙翻到下一頁，再選他以為自己是哪個鎮民 / 惡魔 / 善良角色。準備階段點他已經指定的那張：恢復隨機（和懸停的角色表一樣）
export function pickRole(ctx, seat, acts) {
  const s = ctx.state, roles = SCRIPTS[s.scriptId].roles, id0 = seat.id, lobby = s.phase === 'lobby';
  const now = () => ctx.state.seats.find(x => x.id === id0);
  const used = () => new Set(ctx.state.seats.filter(x => x.id !== id0).map(x => x.role));
  const set = (roleId, fakeRole) => ctx.st('setRole', { seatId: id0, roleId, fakeRole });
  const panel = rolePanel({
    key: 'role-' + id0, roles,
    tab: [seatBadge(s, id0), w(lobby ? '角色' : '更換角色')],
    // 遊戲中換：今晚已經排好的喚醒順序不變；線上 / 多設備時他的手機會收到通知
    lead: !lobby ? [icon('moon', 'rp-ico'), w('今晚順序不變', 'muted'), !s.oneDevice && [icon('letter', 'rp-ico'), w('私下通知他', 'muted')]]
      : acts?.length > 0 && acts.map(a => h('button', { class: 'btn sm ghost' + (a.danger ? ' danger' : ''), onclick: () => { closeRolePanel(); a.onclick(); } }, a.label)),
    state: id => ({ on: now()?.role === id, in: used().has(id) }), picked: () => now()?.role,
    pick: id => {
      const x = now();
      if (lobby && x?.pinned && id === x.role) return void ctx.st('unpin', { seatId: id0 });
      if (!FAKE[id]) return void set(id);
      return panel.sub(`${ROLES[id].name}以為自己是哪個${fakeKind(id)}？`, roles.filter(r => fakeOk(id, r)),
        f => ({ in: used().has(f) }), f => set(id, f));
    },
    alive: () => stOk(ctx) && !!now() && (lobby ? ctx.state.phase === 'lobby' : !['lobby', 'ended'].includes(ctx.state.phase)),
  });
}
