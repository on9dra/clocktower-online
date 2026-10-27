// 操作塢：桌面底部固定的一條，左邊階段狀態、中間現狀（座位號、角色牌、圖標）、右邊主按鈕。說書人和玩家各一套。
// 帶 data-hot 的按鈕是當前主操作，回車鍵觸發（見 app.js）
import { h, seatLabel, ask, prompt2, roleToken, modal, closeModal } from './ui.js';
import { ROLES, TEAMS, SCRIPTS, teamCounts, changesSetup, outsiderShift } from './roles.js';
import { sel, stopSelect } from './town.js';
import { openSetup } from './setup.js';
import { seatBadge, mini, icon, actIcon, tag, named, w, ACTS } from './glyph.js';

export const B = (label, onclick, cls = '', hot = false) => h('button', { class: 'btn ' + cls, onclick, 'data-hot': hot || null }, label);
export const voteCount = nom => Object.values(nom.votes).filter(Boolean).length;
export const needVotes = s => Math.max(s.required, (s.topCount || 0) + 1);

// 塢的三段：status = [小標題, 大字]，mid = 現狀，act = 按鈕（主按鈕放最右）
export const dock = (status, mid, act, lead) => h('div', { class: 'dock' },
  lead,
  h('div', { class: 'dock-status' }, h('div', { class: 'card-k' }, status[0]), h('div', { class: 'dock-big' }, status[1])),
  h('div', { class: 'dock-mid' }, mid),
  h('div', { class: 'dock-act' }, act));

// 計票時鐘：k 是已經數過的人數，current 是正在數的座位；pending：說書人剛喊立即計票、全屏提示還沒播完
export function clockState(ctx) {
  const c = ctx.state.nomination?.clock;
  if (!c) return null;
  if (ctx.now() < c.at) return { k: 0, current: null, done: false, pending: true, locked: () => false };
  const k = Math.max(0, Math.floor((ctx.now() - c.at) / c.step));
  return { k, current: c.order[k] || null, done: k >= c.order.length, locked: id => c.order.indexOf(id) > -1 && c.order.indexOf(id) < k };
}

const row = (...kids) => h('div', { class: 'dock-frm' }, kids);
const moon = n => `第 ${n} 夜`;
const sun = n => `第 ${n} 天`;
// 選人狀態：服務端的 choose（count / counts / notSelf / alive / dead / roles / roleOptional）→ 本地的 sel.on
export const selFrom = (key, c, selfId) => ({ key, ids: [], count: c.count, counts: c.counts || [c.count], notSelfId: c.notSelf ? selfId : null,
  alive: !!c.alive, dead: !!c.dead, roles: c.roles || null, roleOptional: !!c.roleOptional, role: null });
const pickOk = on => on.counts.includes(on.ids.length) && (!on.roles || !!on.role || (on.roleOptional && !on.ids.length));
// 要選幾個人：選中的座位號 + 還空著的虛線圈
const slots = ctx => {
  const ids = sel.on.ids, n = Math.max(...sel.on.counts);
  return n > 0 && h('span', { class: 'slots' }, ids.map(id => seatBadge(ctx.state, id)),
    Array.from({ length: Math.max(0, n - ids.length) }, () => h('span', { class: 'sb empty' + (sel.on.counts.includes(0) ? ' opt' : '') })));
};
// 要選角色的行動（賭徒、麻臉巫婆、侍臣、哲學家……）：選中的角色牌，點開角色表挑
const roleSlot = ctx => sel.on.roles && h('button', { class: 'role-slot' + (sel.on.role ? ' on' : ''), onclick: () => openRolePicker(ctx) },
  sel.on.role ? named(sel.on.role) : [h('span', { class: 'sb empty' + (sel.on.roleOptional ? ' opt' : '') }), w('角色', 'muted')]);
function openRolePicker(ctx) {
  const on = sel.on;
  const set = id => { on.role = on.role === id ? null : id; closeModal(); ctx.render(); };
  modal('選擇角色', h('div', {}, Object.keys(TEAMS).map(team => {
    const ids = on.roles.filter(id => ROLES[id].team === team);
    return ids.length > 0 && h('div', { class: 'guess-grid' }, ids.map(id =>
      h('div', { class: 'guess-pick' + (on.role === id ? ' on' : ''), onclick: () => set(id) }, roleToken(id, { size: 'sm' }), ROLES[id].name)));
  })), { wide: true });
}
// 不用能力（可以不選的行動）時按鈕寫「不使用」
const confirmPick = (onDone, cls = '') => {
  const on = sel.on, ok = pickOk(on), skip = ok && !on.ids.length && !on.role;
  return B(skip ? '不使用' : '確認', () => { if (!pickOk(on)) return; const v = [...on.ids], r = on.role; sel.on = null; onDone(v, r); },
    (ok ? (skip ? 'ghost ' : 'primary ') : 'disabled ') + cls, true);
};

// 選人模式下的確認卡（浮在座位旁的說書人代選卡用）：lead 是行動者的角色牌和座位號
export function selectBar(ctx, lead, onDone, canCancel) {
  return h('div', { class: 'card focus infocard' },
    h('div', { class: 'ic-head' }, lead),
    h('div', { class: 'opt-row' }, slots(ctx), roleSlot(ctx)),
    h('div', { class: 'row' }, confirmPick(onDone), canCancel && B('取消', () => stopSelect(ctx), 'ghost')));
}

// 處決台現狀（桌面中央也用）
export function blockLines(s) {
  const now = s.block ? `處決台：${seatLabel(s, s.block.nomineeId)}（${s.block.count} 票）`
    : s.tie ? `處決台：${s.topCount} 票平票，無人在台上` : '處決台：暫無';
  const need = `需要 ${needVotes(s)} 票才能上處決台` + (s.topCount ? `（${s.topCount} 票為平票）` : '');
  return [now, need];
}
// 處決台：座位號 + 票數；平票時台上沒人
const blockView = s => (s.block ? [w('處決台', 'bad'), seatBadge(s, s.block.nomineeId), h('b', { class: 'num' }, s.block.count), w('票')]
  : s.tie ? [w('處決台'), w(`${s.topCount} 票平票，無人`, 'ink')] : null);
// 昨晚的死者座位號（平安夜寫「無人死亡」）
const lastNight = s => s.lastNight && row(w('昨晚'), s.lastNight.length ? [s.lastNight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good'));
// 票數：當前 / 需要
const clockView = (s, ck) => ck && (ck.done ? w('計票完成', 'good') : ck.pending ? w('立即計票', 'bad')
  : [w('數到'), seatBadge(s, ck.current, ck.current === s.myId ? 'me-now' : '')]);
const stepToken = id => (ROLES[id] ? mini(id) : tag(id === 'demoninfo' ? 'demon' : 'minion'));
const nomRow = (s, nom) => row(seatBadge(s, nom.nominatorId), h('b', { class: 'nom-verb' }, '提名'), seatBadge(s, nom.nomineeId));
const masterRow = s => s.master && row(mini('butler'), w('主人'), seatBadge(s, s.master));

export function stFlow(ctx) {
  const s = ctx.state;
  const next = (label, cls = 'primary big') => B(label, () => ctx.st('next'), cls, true);
  switch (s.phase) {
    case 'lobby': return lobbyDock(ctx, next);
    case 'night': return nightDock(ctx);
    case 'dawn': return dock([moon(s.night), '天亮了'], lastNight(s), next('開始白天'));
    case 'day': {
      const nom = s.nomination, ck = clockState(ctx), r = s.st.ruling;
      if (r) return rulingDock(ctx, r);
      return dock([sun(s.day), nom ? nomRow(s, nom) : row(blockView(s) || '討論與提名')],
        [lastNight(s), nom && (ck || s.block) && row(clockView(s, ck), ck && s.block && h('i', { class: 'op-sep' }), s.block && blockView(s))],
        [nom && B('取消提名', () => ask('取消這次提名？雙方今天可以重新提名 / 被提名。', () => ctx.st('cancelVote'), '取消提名'), 'ghost'),
          nom && B(ck ? '立即結算' : '按當前舉手結算', () => ctx.st('closeVote')),
          endDayButton(ctx),
          nom && !ck && B('立即計票', () => ctx.st('startCount'), 'primary big', true)]);
    }
    case 'ended': {
      // MVP 投票還沒結束：塢上顯示已投人數，「再來一局」先問一句（會按已投的票結算）
      const m = s.mvpVote, open = m && !m.done;
      return dock(['遊戲結束', h('span', { class: s.winner }, s.winner === 'good' ? '善良陣營獲勝' : '邪惡陣營獲勝')],
        [h('p', { class: 'muted' }, s.winReason), open && row(icon('star', 'brass'), w('MVP 已投'), h('b', {}, `${m.n}/${m.total}`))],
        open ? B('再來一局', () => ask('MVP 投票還沒結束：按已投的票結算，然後回到準備？', () => ctx.st('next'), '再來一局'), 'primary big', true) : next('再來一局'));
    }
  }
}

// 白天、被動能力觸發：遊戲停下，說書人裁定是否生效；按規則應有的結果是主按鈕
const RULE_BTN = { slayer: ['命中', '未中'], virgin: ['處決提名者', '無事發生'], saint: ['邪惡獲勝', '繼續'],
  scarletwoman: ['接任惡魔', '不接任'], mayor: ['善良獲勝', '入夜'], pacifist: ['不死亡', '死亡'] };
const RULE_TITLE = { slayer: '獵手開槍', virgin: '貞潔者被提名', saint: '聖徒被處決', scarletwoman: '紅唇女郎接任', mayor: '鎮長勝利', pacifist: '和平主義者' };
const rulingWho = (s, r) => {
  const role = id => s.seats.find(x => x.id === id)?.role;
  return r.kind === 'slayer'
    ? row(seatBadge(s, r.seatId), r.real ? mini('slayer') : w('假獵手', 'muted'), w('射'), seatBadge(s, r.to), mini(role(r.to)))
    : r.kind === 'virgin' ? row(seatBadge(s, r.from), mini(role(r.from)), w('提名', 'bad'), seatBadge(s, r.seatId), r.real === false ? w('假貞潔者', 'muted') : named('virgin'))
      : r.kind === 'pacifist' ? row(seatBadge(s, r.to), mini(role(r.to)), w('被處決', 'bad'), named('pacifist'))
        : row(seatBadge(s, r.seatId), named(r.role));
};
// 裁定期間操作塢只說「等你裁定」，按鈕在座位旁的裁定卡上
const rulingDock = (ctx, r) => dock([sun(ctx.state.day), RULE_TITLE[r.kind] || '裁定'], rulingWho(ctx.state, r), null);
// 白天被動能力觸發、遊戲停下等說書人裁定：浮在觸發者座位旁的卡片。誰觸發了什麼；
// 結果只有一種（forced）時只有一個按鈕；能力可能無效（中毒 / 酒鬼）或目標可以被登記成另一類（隱士 / 間諜）時才二選一，
// 按規則應有的那個是主按鈕、帶 ✓（回車就是它）
// virgin：貞潔者被提名時的小窗（op 'virgin'），投票照常進行，不搶回車鍵。
// 必定反噬：只有倒數和「立即反噬」（延遲只為了不穿幫，不給不反噬的選項）；中毒 / 間諜提名：二選一
export function rulingCard(ctx, r = ctx.state.st.ruling, op = 'rule') {
  const s = ctx.state, side = op === 'virgin';
  const [yes, no] = RULE_BTN[r.kind] || ['生效', '無效'];
  const btn = (label, work) => (r.auto === work ? B([icon('check'), label], () => ctx.st(op, { work }), 'primary' + (side ? ' sm' : ''), !side)
    : B(label, () => ctx.st(op, { work }), 'ghost' + (side ? ' sm' : '')));
  const opts = r.forced ? [r.auto] : r.auto ? [false, true] : [true, false];
  const left = side && r.due ? Math.max(0, Math.ceil((r.due - ctx.now()) / 1000)) : null;
  return h('div', { class: 'card infocard ruling' + (side ? ' side' : ' focus') },
    h('div', { class: 'rule-k' }, !side && icon('timer'), RULE_TITLE[r.kind] || '裁定'),
    rulingWho(s, r),
    !r.forced && r.why && row(w(r.why, 'evil'), w('能力可能無效', 'muted')),
    !r.forced && r.reg && row(mini(r.reg), w(REG_AS[r.kind], 'muted')),
    h('div', { class: 'row' }, left != null
      ? [h('span', { class: 'v-left' }, icon('timer'), h('b', {}, left), w('秒後反噬', 'muted')), B('立即反噬', () => ctx.st(op, { work: true }), 'primary sm')]
      : opts.map(work => btn(work ? yes : no, work))));
}
// 可以被登記成另一類的角色在這次裁定裏可能被當作什麼
const REG_AS = { slayer: '可以被當作惡魔', virgin: '可以被當作鎮民' };

// 夜晚：今晚的喚醒順序排成一串角色牌（已過的變淡，當前的高亮），最後是天亮
function nightDock(ctx) {
  const s = ctx.state, st = s.st, step = st.step, review = step && step.status === 'review';
  const passed = st.passed || [], cur = step && !review ? passed.length - 1 : -1;
  const chips = h('div', { class: 'steps' },
    passed.map((id, i) => h('span', { class: 'step-tok' + (i === cur ? ' now' : ' done') }, stepToken(id))),
    st.queue.map(id => h('span', { class: 'step-tok' }, stepToken(id))),
    h('span', { class: 'step-tok' + (review ? ' now' : '') }, icon('sun')));
  if (review) return reviewDock(ctx, chips);
  return dock([moon(s.night), step && step.seatId ? row(mini(step.roleId), seatBadge(s, step.seatId)) : step ? row(stepToken(step.roleId)) : '…'], chips, null);
}

// 夜晚走完：核對今晚的死亡、中毒、保護（點座位糾錯），再公佈死訊
function reviewDock(ctx, chips) {
  const s = ctx.state, st = s.st;
  const seatsOr = ids => (ids?.length ? ids.map(id => seatBadge(s, id)) : w('無', 'ink'));
  const sep = h('i', { class: 'op-sep' });
  return dock([moon(s.night), row(w('今晚'), st.diedTonight.length ? [st.diedTonight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good'))],
    [chips, row(w('中毒', 'evil'), seatsOr(st.poisonList), st.drunkList?.length > 0 && [sep, w('醉酒', 'evil'), seatsOr(st.drunkList)],
      h('i', { class: 'op-sep' }), w('保護', 'good'), seatsOr(st.protectList))],
    B('天亮 · 公佈死訊', () => ctx.st('dawn'), 'primary big', true));
}

// 結束白天前說清楚會發生什麼，避免誤點直接入夜
function endDayButton(ctx) {
  const s = ctx.state, nom = s.nomination, block = s.block && seatLabel(s, s.block.nomineeId);
  const [label, msg] = nom ? ['結算並結束白天', '結算當前投票，然後結束白天？']
    : block && !s.dayOver ? [`結束白天 · 處決${block}`, `處決 ${block}，然後入夜？`]
      : ['結束白天 · 入夜', s.dayOver ? '結束白天並入夜？' : '今天沒有人被處決。確定結束白天、直接入夜？'];
  return B(label, () => ask(msg, () => ctx.st('next'), label), nom ? 'ghost' : 'primary big', !nom);
}

// 說書人準備階段：圓桌中央選劇本（換劇本會清掉角色配置和預覽）
export const scriptPick = ctx => h('div', { class: 'script-pick' }, Object.keys(SCRIPTS).map(id =>
  h('button', { class: 'chip' + (id === ctx.state.scriptId ? ' on' : ''), onclick: () => id !== ctx.state.scriptId && ctx.st('script', { scriptId: id }) }, SCRIPTS[id].name)));

// 準備：各陣營人數（陣營色圓牌 + 數字），必選 / 排除的角色牌，預覽時的惡魔偽裝
function lobbyDock(ctx, next) {
  const s = ctx.state, st = s.st, n = s.seats.length, rules = st.roleRules;
  const locked = Object.keys(rules).filter(id => rules[id] === 'lock'), banned = Object.keys(rules).filter(id => rules[id] === 'ban');
  // 預覽時按座位上實際的角色數，否則按人數和必選規則推算
  const drafted = st.draft && s.seats.reduce((c, x) => (x.role && c[ROLES[x.role].team]++, c), { townsfolk: 0, outsider: 0, minion: 0, demon: 0 });
  const c = drafted || (n >= 5 && teamCounts(n, locked.filter(changesSetup)));
  // 可能抽到、會改變外來者數量的角色（男爵 7 人以下隨機不出現）
  const shifts = !st.draft && SCRIPTS[s.scriptId].roles.filter(id => changesSetup(id) && !rules[id] && !(id === 'baron' && n < 7));
  const delta = id => { const x = ROLES[id].setup.outsider; return Array.isArray(x) ? '±1' : (x > 0 ? '+' : '') + x; };
  return dock(['準備', n >= 5 ? `${n} 人` : `${n} / 5 人`], [
    c && row(Object.keys(TEAMS).map(t => h('span', { class: 'team-n', style: { '--team': TEAMS[t].color } }, h('i'), c[t])),
      n >= 5 && shifts && shifts.map(id => h('span', { class: 'maybe' }, mini(id), delta(id)))),
    (locked.length > 0 || banned.length > 0) && row(locked.map(id => h('span', { class: 'rule lock' }, mini(id))), banned.map(id => h('span', { class: 'rule ban' }, mini(id), icon('cross', 'rule-x')))),
    st.draft && row(tag('bluff'), st.bluffs.map(id => named(id))),
    botConfig(ctx),
  ], st.draft ? [B('取消預覽', () => ctx.st('undraft'), 'ghost'), B('重新抽取', () => ctx.st('draft')), next('確認角色並開局')]
    : [n > 1 && B('打亂座位', () => ctx.st('shuffleSeats'), 'ghost'), B('角色配置', () => openSetup(ctx)),
      n >= 5 && B('先抽角色預覽', () => ctx.st('draft')), n >= 5 && next('一鍵開局')]);
}

// 測試用：加機器人補位。機器人夜晚自動選人、投票時隨機舉手
function botConfig(ctx) {
  const s = ctx.state;
  const bots = s.seats.filter(x => x.bot).length;
  const room = 15 - s.seats.length;
  const count = h('select', { 'data-keep': 'botCount' },
    [...Array(Math.max(room, 0)).keys()].map(i => h('option', { value: i + 1, selected: i + 1 === Math.min(Math.max(7 - s.seats.length, 1), room) || null }, `${i + 1} 個`)));
  // 讀頁面上的那個下拉框（差量更新會保留用戶選過的值）
  const add = () => ctx.st('addBots', { count: document.querySelector('[data-keep=botCount]')?.value || 1 });
  return h('div', { class: 'bots' },
    room > 0 && count,
    room > 0 && B('加入機器人', add, 'sm'),
    bots > 0 && B(`移除 ${bots} 個機器人`, () => ctx.st('removeBots'), 'sm ghost'));
}

export function playerFlow(ctx) {
  const s = ctx.state;
  if (s.prompt) {
    if (!sel.on || sel.on.key !== s.prompt.stepId) {
      sel.on = selFrom(s.prompt.stepId, s.prompt, s.myId);
    }
    return null;
  }
  if (sel.on) sel.on = null;
  return null; // 玩家沒有底部操作塢：要看的、要點的都在圓桌中央（playerCenter）和審判牌上
}

// 玩家：圓桌中央在「第 N 天」下面放的東西——輪到自己行動時的選人和確認、準備階段的離開 / 改名、昨晚死訊、管家的主人
export function playerCenter(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  if (s.isSt || s.peek || !me) return null;
  if (s.prompt && sel.on) return turnPane(ctx);
  if (s.phase === 'lobby') return h('div', { class: 'cx' }, h('div', { class: 'row' }, B('離開房間', () => ctx.act('leave').then(() => ctx.leave()), 'ghost sm'),
    B('改名', () => prompt2('你的暱稱', me.name, name => { if (name) { ctx.ls.set('botc.name', name); ctx.act('rename', { name }); } }, { max: 12 }), 'sm')));
  if (s.phase === 'dawn' || (s.phase === 'day' && !s.nomination)) return h('div', { class: 'cx' }, lastNight(s), masterRow(s));
  return null;
}

// 輪到自己行動：圓桌中央一張紙牌——大角色牌 + 行動圖標，一句話說清楚選誰、會怎樣（關鍵詞用語義色），下面是選中的座位和確認
function turnPane(ctx) {
  // 這一步的角色（理髮師死後惡魔替他選人時是理髮師）
  const s = ctx.state, rid = s.prompt.roleId || s.myRole, a = ACTS[rid];
  const say = a ? a.say : [s.prompt.prompt || `選擇 ${s.prompt.count} 名玩家`];
  return h('div', { class: 'cx turn-pane' + (a ? ' ' + a.tone : '') },
    h('div', { class: 'tp-head' }, rid && roleToken(rid), rid && h('span', { class: 'tp-ico' }, actIcon(rid))),
    h('div', { class: 'tp-say' }, say.map((t, i) => (i % 2 ? h('b', {}, `「${t}」`) : t))),
    h('div', { class: 'row tp-picks' }, slots(ctx), roleSlot(ctx)),
    confirmPick((ids, role) => ctx.act('pick', { ids, role }), 'big'));
}

// 投票按鈕（放在審判牌兩欄的頂上）：贊成計票、棄權不計票（只有自己和說書人看得到），再點一次取消。不是玩家時返回 null
export function voteButtons(ctx) {
  const s = ctx.state, nom = s.nomination, ck = clockState(ctx), me = s.seats.find(x => x.mine);
  if (!me || s.isSt || s.peek) return null;
  const up = !!nom.votes[s.myId], no = !!nom.abstain?.[s.myId];
  const locked = ck && ck.locked(s.myId), yesOff = (me.dead && me.voteUsed) || locked, noOff = locked && up;
  const btn = (k, on, off, ico, text, v, n) => h('button', {
    class: `vbtn ${k}` + (on ? ' on' : '') + (off ? ' disabled' : ''),
    onclick: () => !off && ctx.act('vote', { v: on ? null : v }) }, icon(ico), text, h('i', {}, n));
  return { yes: n => btn('yes', up, yesOff, 'hand', '贊成', 'yes', n), no: n => btn('no', no, noOff, 'abstain', '棄權', 'abstain', n) };
}
