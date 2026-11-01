// 流程操作：說書人和玩家都沒有底部操作塢，要看的、要點的都在圓桌中央「第 N 夜 / 天」下面（stCenter / playerCenter）和審判牌上。
// 帶 data-hot 的按鈕是當前主操作，回車鍵觸發（見 app.js）
import { h, seatLabel, ask, prompt2, roleToken, modal, closeModal } from './ui.js';
import { ROLES, TEAMS, CORE, SCRIPTS, teamCounts, changesSetup, outsiderShift } from './roles.js';
import { sel, stopSelect } from './town.js';
import { openSetup, pickBluff } from './setup.js';
import { uploadScript, manualNight, cardRows, winButtons } from './manual.js';
import { seatBadge, mini, icon, actIcon, tag, named, w, ACTS } from './glyph.js';
import { nightHeld } from './fx.js';

export const B = (label, onclick, cls = '', hot = false) => h('button', { class: 'btn ' + cls, onclick, 'data-hot': hot || null }, label);
export const voteCount = nom => Object.values(nom.votes).filter(Boolean).length;
export const needVotes = s => Math.max(s.required, (s.topCount || 0) + 1);

// 計票時鐘：k 是已經數過的人數，current 是正在數的座位；pending：說書人剛喊立即計票、全屏提示還沒播完
export function clockState(ctx) {
  const c = ctx.state.nomination?.clock;
  if (!c) return null;
  if (ctx.now() < c.at) return { k: 0, current: null, done: false, pending: true, locked: () => false };
  const k = Math.max(0, Math.floor((ctx.now() - c.at) / c.step));
  return { k, current: c.order[k] || null, done: k >= c.order.length, locked: id => c.order.indexOf(id) > -1 && c.order.indexOf(id) < k };
}

const row = (...kids) => h('div', { class: 'frm-line' }, kids);
const btns = (...kids) => h('div', { class: 'row' }, kids);
// 選人狀態：服務端的 choose（count / counts / notSelf / alive / dead / roles / roleOptional）→ 本地的 sel.on
export const selFrom = (key, c, selfId) => ({ key, ids: [], count: c.count, counts: c.counts || [c.count], notSelfId: c.notSelf ? selfId : null, last: c.last || [],
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

// 選人模式下的確認卡（說書人代選時的操作卡用）：lead 是行動者的角色牌和座位號
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
// 昨晚的死者座位號（平安夜寫「無人死亡」）
const lastNight = s => s.lastNight && row(w('昨晚'), s.lastNight.length ? [s.lastNight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good'));
const masterRow = s => s.master && row(mini('butler'), w('主人'), seatBadge(s, s.master));

// 說書人：圓桌中央在「第 N 夜 / 天」下面放的東西——準備、天亮、白天沒有提名時。
// 夜晚的步驟卡、天亮前核對、白天的裁定卡是操作卡（town.js stBubble），提名期間的按鈕在審判牌上（trialButtons）
export function stCenter(ctx) {
  const s = ctx.state;
  if (!s.isSt || s.peek) return null;
  const next = label => B(label, () => ctx.st('next'), 'primary big', true);
  switch (s.phase) {
    case 'lobby': return lobbyPane(ctx, next);
    case 'dawn': return h('div', { class: 'cx' }, lastNight(s), btns(next('開始白天')));
    // 處決台上有人時絞刑架就在上面，不再寫昨晚和處決台
    case 'day': return !s.nomination && !s.st.ruling && h('div', { class: 'cx' }, !s.block && lastNight(s), s.manual && cardRows(ctx), !s.manual && dayDue(ctx), btns(endDayButton(ctx)), s.manual && winButtons(ctx));
    case 'ended': {
      // MVP 投票還沒結束：「再來一局」先問一句（會按已投的票結算）；已投人數在 MVP 牌上
      const m = s.mvpVote, open = m && !m.done;
      return h('div', { class: 'cx' }, btns(open ? B('再來一局', () => ask('MVP 投票還沒結束：按已投的票結算，然後回到準備？', () => ctx.st('next'), '再來一局'), 'primary big', true) : next('再來一局')));
    }
  }
  return null;
}

// 白天要私下給信息的角色（博學者每天、藝術家一次）：小圓牌，點了直接補發，發過就收起
function dayDue(ctx) {
  const s = ctx.state, role = x => x.fakeRole || x.role;
  const told = (id, today) => s.st.log.some(l => l.e?.what === 'tell' && l.e.seat === id && (!today || l.day === s.day));
  const due = s.seats.filter(x => !x.dead && ((role(x) === 'savant' && !told(x.id, true)) || (role(x) === 'artist' && !told(x.id))));
  return due.length > 0 && row(due.map(x => h('button', { class: 'chip due', title: '補發信息',
    onclick: () => prompt2(`告訴 ${seatLabel(s, x.id)}`, '', text => text && ctx.st('tellInfo', { seatId: x.id, text }), { max: 300 }) }, mini(role(x)), seatBadge(s, x.id))));
}

// 審判牌最下面一行（說書人）：取消提名、提前結算、結束白天、立即計票（主按鈕放最右）
export function trialButtons(ctx) {
  const s = ctx.state, ck = clockState(ctx);
  if (!s.isSt || s.peek || s.st.ruling) return null;
  return h('div', { class: 'row tr-acts' },
    B('取消提名', () => ask('取消這次提名？雙方今天可以重新提名 / 被提名。', () => ctx.st('cancelVote'), '取消提名'), 'ghost'),
    B(ck ? '立即結算' : '按當前舉手結算', () => ctx.st('closeVote')),
    endDayButton(ctx),
    !ck && B('立即計票', () => ctx.st('startCount'), 'primary big', true));
}

// 白天、被動能力觸發：遊戲停下，說書人裁定是否生效；按規則應有的結果是主按鈕
const RULE_BTN = { slayer: ['命中', '未中'], virgin: ['處決提名者', '無事發生'], saint: ['邪惡獲勝', '繼續'],
  scarletwoman: ['接任惡魔', '不接任'], mayor: ['善良獲勝', '入夜'], pacifist: ['不死亡', '死亡'], klutz: ['他的陣營落敗', '無事發生'] };
const RULE_TITLE = { slayer: '獵手開槍', virgin: '貞潔者被提名', saint: '聖徒被處決', scarletwoman: '紅唇女郎接任', mayor: '鎮長勝利', pacifist: '和平主義者', klutz: '呆瓜選人' };
const rulingWho = (s, r) => {
  const role = id => s.seats.find(x => x.id === id)?.role;
  return r.kind === 'slayer'
    ? row(seatBadge(s, r.seatId), r.real ? mini('slayer') : w('假獵手', 'muted'), w('射'), seatBadge(s, r.to), mini(role(r.to)))
    : r.kind === 'virgin' ? row(seatBadge(s, r.from), mini(role(r.from)), w('提名', 'bad'), seatBadge(s, r.seatId), r.real === false ? w('假貞潔者', 'muted') : named('virgin'))
      : r.kind === 'pacifist' ? row(seatBadge(s, r.to), mini(role(r.to)), w('被處決', 'bad'), named('pacifist'))
        : r.kind === 'klutz' ? row(seatBadge(s, r.seatId), mini('klutz'), w('選'), seatBadge(s, r.to), mini(role(r.to)))
        : row(seatBadge(s, r.seatId), named(r.role));
};
// 白天被動能力觸發、遊戲停下等說書人裁定：圓桌中央的裁定卡。誰觸發了什麼；
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
  const say = [h('div', { class: 'rule-k' }, !side && icon('timer'), RULE_TITLE[r.kind] || '裁定'),
    rulingWho(s, r),
    !r.forced && r.why && row(w(r.why, 'evil'), w('能力可能無效', 'muted')),
    !r.forced && r.reg && row(mini(r.reg), w(REG_AS[r.kind], 'muted'))];
  const acts = h('div', { class: 'row' }, left != null
    ? [h('span', { class: 'v-left' }, icon('timer'), h('b', {}, left), w('秒後反噬', 'muted')), B('立即反噬', () => ctx.st(op, { work: true }), 'primary sm')]
    : opts.map(work => btn(work ? yes : no, work)));
  return h('div', { class: 'card infocard ruling' + (side ? ' corner' : ' focus spread') },
    side ? [say, acts] : [h('div', { class: 'ic-top' }, say), h('div', { class: 'ic-foot' }, acts)]);
}
// 可以被登記成另一類的角色在這次裁定裏可能被當作什麼
const REG_AS = { slayer: '可以被當作惡魔', virgin: '可以被當作鎮民', klutz: '可以被當作另一陣營' };

// 假裝叫醒的原因（stepcard.js 也用）
export const PRETEND = { absent: '不在場', idle: '今晚不醒', quick: '已完成' };

// 夜晚走完：核對今晚的死亡、中毒、保護（點座位糾錯），再公佈死訊
export function reviewCard(ctx) {
  const s = ctx.state, st = s.st;
  if (s.manual) return manualNight(ctx);
  const seatsOr = ids => (ids?.length ? ids.map(id => seatBadge(s, id)) : w('無', 'ink'));
  const sep = h('i', { class: 'op-sep' });
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-body' }, h('div', { class: 'ic-slip' },
      row(w('今晚'), st.diedTonight.length ? [st.diedTonight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good')),
      row(w('中毒', 'evil'), seatsOr(st.poisonList), st.drunkList?.length > 0 && [sep, w('醉酒', 'evil'), seatsOr(st.drunkList)],
        h('i', { class: 'op-sep' }), w('保護', 'good'), seatsOr(st.protectList)))),
    h('div', { class: 'ic-foot' }, B('天亮，公佈死訊', () => ctx.st('dawn'), 'primary wide', true)));
}

// 結束白天前說清楚會發生什麼，避免誤點直接入夜
function endDayButton(ctx) {
  const s = ctx.state, nom = s.nomination, block = s.block && seatLabel(s, s.block.nomineeId);
  const [label, msg] = nom ? ['結算並結束白天', '結算當前投票，然後結束白天？']
    : block && !s.dayOver ? [`處決${block}，入夜`, `處決 ${block}，然後入夜？`]
      : ['結束白天，入夜', s.dayOver ? '結束白天並入夜？' : '今天沒有人被處決。確定結束白天、直接入夜？'];
  return B(label, () => ask(msg, () => ctx.st('next'), label), nom ? 'ghost' : 'primary big', !nom);
}

// 劇本卡的選中態不等服務器：點了就亮（到香港來回要 0.3 秒），被拒絕就退回。left 是還沒回覆的操作數：連點時中間幾步的狀態不把高亮拉回去
const wanted = new Map();
function shown(s, key) {
  const w = wanted.get(key);
  if (w && (w.code !== s.code || (!w.left && w.value === s[key]))) wanted.delete(key);
  return wanted.has(key) ? wanted.get(key).value : s[key];
}
function pick(ctx, op, key, value) {
  const w = { code: ctx.state.code, value, left: (wanted.get(key)?.left || 0) + 1 };
  wanted.set(key, w);
  ctx.render();
  setTimeout(() => { if (wanted.get(key) === w) { wanted.delete(key); ctx.render(); } }, 8000); // 斷線丟了回覆：不能一直亮著沒生效的那個
  ctx.st(op, { [key]: value }).then(r => {
    const cur = wanted.get(key);
    if (cur) cur.left--;
    if (!r.ok && cur?.value === value) { wanted.delete(key); ctx.render(); }
  });
}

// 說書人準備階段：桌面左上角的劇本卡（換劇本會清掉角色配置和預覽），虛線格是以後的 DLC
export function scriptPick(ctx) {
  const s = ctx.state, locked = s.st.modeLocked, script = shown(s, 'scriptId'), now = shown(s, 'mode');
  const mode = (m, text) => h('button', { class: 'chip' + (now === m ? ' on' : ''), disabled: locked && m === 'auto' ? true : null,
    onclick: () => now !== m && pick(ctx, 'mode', 'mode', m) }, text);
  return h('div', { class: 'script-card', 'data-key': 'script-card' },
    h('div', { class: 'sc-group' }, h('b', {}, '劇本'),
      Object.keys(SCRIPTS).map(id => h('button', { class: 'chip' + (id === script ? ' on' : ''), title: SCRIPTS[id].name,
        onclick: () => id !== script && pick(ctx, 'script', 'scriptId', id) }, SCRIPTS[id].name)),
      h('button', { class: 'chip up', onclick: () => uploadScript(ctx) }, '上傳劇本'),
      h('button', { class: 'chip soon', disabled: true }, '敬請期待')),
    h('div', { class: 'sc-group sc-mode' }, mode('auto', '智能推進'), mode('manual', '手動')));
}

// 準備（圓桌中央）：各陣營人數（陣營色圓牌 + 數字），必選 / 排除的角色牌，預覽時的惡魔偽裝，機器人，開局按鈕
function lobbyPane(ctx, next) {
  const s = ctx.state, st = s.st, n = s.seats.length, rules = st.roleRules;
  const locked = Object.keys(rules).filter(id => rules[id] === 'lock'), banned = Object.keys(rules).filter(id => rules[id] === 'ban');
  // 預覽時按座位上實際的角色數，否則按人數和必選規則推算
  const drafted = st.draft && s.seats.reduce((c, x) => (x.role && CORE.includes(ROLES[x.role].team) && c[ROLES[x.role].team]++, c), { townsfolk: 0, outsider: 0, minion: 0, demon: 0 });
  const c = drafted || (n >= 5 && teamCounts(n, locked.filter(changesSetup)));
  // 配比對不上的陣營標出來，不攔（教父 ±1 時外來者和鎮民不比）
  const inPlay = drafted ? s.seats.map(x => x.role).filter(changesSetup) : [];
  const due = drafted && n >= 5 && teamCounts(n, inPlay), flex = inPlay.some(id => Array.isArray(ROLES[id].setup.outsider));
  const off = t => !!due && c[t] !== due[t] && !(flex && ['outsider', 'townsfolk'].includes(t));
  // 可能抽到、會改變外來者數量的角色（男爵 7 人以下隨機不出現）
  const shifts = !st.draft && SCRIPTS[s.scriptId].roles.filter(id => changesSetup(id) && !rules[id] && !(id === 'baron' && n < 7));
  const delta = id => { const x = ROLES[id].setup.outsider; return Array.isArray(x) ? '±1' : (x > 0 ? '+' : '') + x; };
  // 桌面上兩塊連著放在圓桌中央；手機上圓桌裏放不下，lp-top 放圓桌上方，lp-act 放圓桌下方（board.css）
  return h('div', { class: 'cx lobby-pane' },
    h('div', { class: 'lp-top' },
      c && row(CORE.map(t => h('span', { class: 'team-n' + (off(t) ? ' off' : ''), style: { '--team': TEAMS[t].color } }, h('i'), c[t])),
        n >= 5 && shifts && shifts.map(id => h('span', { class: 'maybe' }, mini(id), delta(id)))),
      (locked.length > 0 || banned.length > 0) && row(locked.map(id => h('span', { class: 'rule lock' }, mini(id))), banned.map(id => h('span', { class: 'rule ban' }, mini(id), icon('cross', 'rule-x')))),
      botConfig(ctx)),
    h('div', { class: 'lp-act' },
      // 這一排抽沒抽都在原位、不換字（人不夠時置灰不隱藏），說書人的手不用重新找按鈕；抽完只在下面多出來，位置預先留好，圓桌中央的居中不會把這排頂走
      btns(B('打亂座位', () => ctx.st('shuffleSeats'), 'ghost' + (n > 1 ? '' : ' disabled')), B('角色配置', () => openSetup(ctx)),
        B('隨機抽取', () => ctx.st('draft'), 'primary' + (n >= 5 ? '' : ' disabled'))),
      h('div', { class: 'lobby-after' }, st.draft && [row(tag('bluff'), st.bluffs.map((id, i) => h('button', { class: 'bluff-pick' + (st.bluffPins?.[i] ? ' pinned' : ''), title: '指定', onclick: () => pickBluff(ctx, i) }, named(id)))),
        btns(B('取消', () => ctx.st('undraft'), 'ghost'), next('確認開局'))])));
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

// 玩家：輪到自己行動時建立本地的選人狀態（桌面和圓桌中央的確認牌要用到），其他時候清掉
export function syncPrompt(ctx) {
  const s = ctx.state;
  if (s.prompt) {
    if (!sel.on || sel.on.key !== s.prompt.stepId) sel.on = selFrom(s.prompt.stepId, s.prompt, s.myId);
  } else if (sel.on) sel.on = null;
}

// 玩家：圓桌中央在「第 N 天」下面放的東西——輪到自己行動時的選人和確認、準備階段的離開 / 改名、昨晚死訊、管家的主人
export function playerCenter(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  if (s.isSt || s.peek) return null;
  // 觀戰的人：準備階段有空位就能入座
  if (!me) return s.phase === 'lobby' && s.seats.length < 15 ? h('div', { class: 'cx' }, h('div', { class: 'row' }, B('入座', () => ctx.sit(), 'primary'))) : null;
  if (s.prompt && sel.on && !nightHeld()) return turnPane(ctx);
  if (s.phase === 'lobby') return h('div', { class: 'cx' }, h('div', { class: 'row' }, B('離開房間', () => ctx.act('leave').then(() => ctx.leave()), 'ghost sm'),
    B('改名', () => prompt2('你的暱稱', me.name, name => { if (name) { ctx.ls.set('botc.name', name); ctx.act('rename', { name }); } }, { max: 12 }), 'sm')));
  if (s.phase === 'dawn' || (s.phase === 'day' && !s.nomination)) return h('div', { class: 'cx' }, lastNight(s), masterRow(s));
  return null;
}

// 輪到自己行動：圓桌中央一張紙牌——大角色牌 + 行動圖標，一句話說清楚選誰、會怎樣（關鍵詞用語義色），下面是選中的座位和確認
function turnPane(ctx) {
  // 這一步的角色（理髮師死後惡魔替他選人時是理髮師）
  const s = ctx.state, rid = s.prompt.roleId || s.myRole, a = !s.prompt.manual && ACTS[rid]; // 手動局的牌是說書人寫的，不用角色自己的說法
  const say = a?.say || [s.prompt.prompt || `選擇 ${s.prompt.count} 名玩家`];
  return h('div', { class: 'cx turn-pane' + (a ? ' ' + a.tone : ''), 'data-key': 'turn', 'data-exit': true },
    h('div', { class: 'tp-head' }, rid && roleToken(rid), rid && ACTS[rid] && h('span', { class: 'tp-ico' }, actIcon(rid))),
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
