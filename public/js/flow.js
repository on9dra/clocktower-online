// 流程操作：說書人和玩家都沒有底部操作塢，要看的、要點的都在圓桌中央「第 N 夜 / 天」下面（stCenter / playerCenter）和審判牌上。
import { h, seatLabel, ask, prompt2, roleToken, modal, closeModal } from './ui.js';
import { ROLES, TEAMS, CORE, SCRIPTS, teamCounts, changesSetup, outsiderShift } from './roles.js';
import { sel, stopSelect } from './town.js';
import { openSetup, pickBluff } from './setup.js';
import { uploadScript, communityScripts, startAct, mayNominate, needPass } from './manual.js';
import { seatBadge, mini, icon, actIcon, tag, named, w, ACTS, wakeMark } from './glyph.js';
import { nightHeld } from './fx.js';
import { openInvite } from './invite.js';
import { rolePanel, closeRolePanel } from './rolepick.js';
import { tr, getLang, trHas } from './lang.js';
import { heraldHeld } from './herald.js';
import { preDraft } from './infoform.js';
import { showPages, bigCore } from './pass.js';

// 角色那句話（glyph.js 的 say）：單數段是普通字，雙數段是關鍵詞（加粗）。中文用「」括起來直接接上；
// 英文整句查（en-fix.json 裏以「段|段」為鍵，關鍵詞用 *…* 標出）：關鍵詞和標籤共用一個詞（「死亡」→ Dead）時，逐段翻語法不通。
// 查不到再每段各自翻、用空格接，關鍵詞只加粗不加引號
const sayView = say => {
  if (getLang() !== 'en') return say.map((t, i) => (i % 2 ? h('b', {}, `「${t}」`) : t));
  if (trHas(say.join('|'))) return tr(say.join('|')).split('*').map((x, i) => (i % 2 ? h('b', {}, x) : x));
  return say.map((t, i) => { const x = tr(t).trim(), sp = i && x && !/^[,.;:!?)]/.test(x) ? ' ' : ''; return i % 2 ? [sp, h('b', {}, x)] : sp + x; });
};

export const B = (label, onclick, cls = '') => h('button', { class: 'btn ' + cls, onclick }, label);
// 現在點不了的按鈕：照樣灰著，但點了說為什麼（why 為空就是正常按鈕）。別讓說書人對著灰按鈕猜
export const BW = (label, onclick, cls = '', why = null) => B(label, why ? () => import('./ui.js').then(m => m.toast(why)) : onclick, cls + (why ? ' disabled why' : ''));
// 卡片的標題（爪牙信息、聖徒被處決……）：不和正文混在一起，做成卡片頂邊上的一張小索引籤（hud.css .ic-tag）
export const cardTag = (...kids) => h('div', { class: 'ic-tag' }, kids);

// 說書人夜晚操作卡的按鈕（確認、發送、跳過、繼續、裁定、代選、天亮）：手機上連點兩下，第二下會落到緊接著出現的下一張卡上
// （服務器先推新狀態、再回覆）。發出去到回覆前一律不再發，回覆後再擋一小會兒，這時候還來不及看清新卡，點到的只能是誤觸
let inFlight = false, coolUntil = 0;
export const stepLock = () => (inFlight ? ' disabled' : '');
export function stepOp(ctx, op, args) {
  if (inFlight || Date.now() < coolUntil) return Promise.resolve({ ok: false });
  inFlight = true;
  ctx.render();
  return ctx.st(op, args).then(r => {
    inFlight = false;
    coolUntil = Date.now() + 450;
    ctx.render();
    return r;
  });
}
export const voteCount = nom => Object.values(nom.votes).filter(Boolean).length;
export const needVotes = s => Math.max(s.required, (s.topCount || 0) + 1);

// 計票時鐘：k 是已經定下的人數，current 是正在選的座位，left 是這一位還剩的毫秒數；pending：說書人剛喊立即計票、全屏提示還沒播完
export function clockState(ctx) {
  const c = ctx.state.nomination?.clock;
  if (!c) return null;
  const pending = !c.k && ctx.now() < c.at;
  return { k: c.k, current: pending ? null : c.order[c.k] || null, done: c.k >= c.order.length, pending, left: pending ? c.step : Math.max(0, c.at + c.step - ctx.now()),
    locked: id => c.order.indexOf(id) > -1 && c.order.indexOf(id) < c.k };
}

const row = (...kids) => h('div', { class: 'frm-line' }, kids);
const btns = (...kids) => h('div', { class: 'row' }, kids);
// 選人狀態：服務端的 choose（count / counts / notSelf / alive / dead / roles / roleOptional）→ 本地的 sel.on
export const selFrom = (key, c, selfId) => ({ key, ids: [], count: c.count, counts: c.counts || [c.count], notSelfId: c.notSelf ? selfId : null, last: c.last || [],
  alive: !!c.alive, dead: !!c.dead, roles: c.roles || null, roleOptional: !!c.roleOptional, role: null, any: !!c.any });
const pickOk = on => on.counts.includes(on.ids.length) && (!on.roles || !!on.role || (on.roleOptional && !on.ids.length));
// 還差什麼：灰著的「確認」點了說這一句
const pickWhy = on => {
  const n = on.ids.length, more = on.counts.filter(c => c > n);
  if (!on.counts.includes(n)) return more.length ? `還要點 ${Math.min(...more) - n} 人` : `只能點 ${Math.max(...on.counts)} 人`;
  return on.roles && !on.role && !(on.roleOptional && !n) ? '還要選角色' : null;
};
// 只選角色、可以不用的能力（哲學家、侍臣）：卡上先問用不用，「使用」才翻開劇本單
const roleOnly = on => !!on.roles && on.roleOptional && Math.max(...on.counts) === 0;
const asking = on => roleOnly(on) && !on.use;
let cx = null; // 最近畫卡的 ctx：玩家的牌（turnPane）調 confirmPick 時不帶它
// 要選幾個人：選中的座位號 + 還空著的虛線圈
const slots = ctx => {
  cx = ctx;
  // any：選幾個都行（系統不認識的角色，能力寫著「任意數量」）：只多留一個空圈，不把一排人數全畫出來
  const ids = sel.on.ids, max = Math.max(...sel.on.counts), n = sel.on.any ? Math.min(max, ids.length + 1) : max;
  return n > 0 && h('span', { class: 'slots' }, ids.map(id => seatBadge(ctx.state, id)),
    Array.from({ length: Math.max(0, n - ids.length) }, () => h('span', { class: 'sb empty' + (sel.on.counts.includes(0) ? ' opt' : '') })));
};
// 要選角色的行動（賭徒、麻臉巫婆、洗腦師，「使用」之後的哲學家、侍臣）：選中的角色牌，點開整屏的劇本單挑
const roleSlot = ctx => {
  cx = ctx;
  const on = sel.on;
  return on.roles && !asking(on) && h('button', { class: 'role-slot' + (on.role ? ' on' : ''), onclick: () => openRolePicker(ctx) },
    on.role ? named(on.role) : [h('span', { class: 'sb empty' }), w('角色', 'muted')]);
};
const TONE = { poison: '#3d8b3d', good: 'var(--good)', evil: 'var(--evil)', brass: 'var(--brass)' };
// 整屏選角色（rolepick.js）：索引籤上是誰在選，紙頂一行是選了會怎樣；選好就收走，卡上的格子換成選中的角色。收起後桌面全看得到，座位照樣能點
function openRolePicker(ctx) {
  const on = sel.on, s = ctx.state;
  if (!on?.roles) return;
  const step = s.isSt && s.st?.step?.id === on.key ? s.st.step : null;
  const rid = s.isSt ? step?.roleId : s.prompt?.roleId || s.myRole, a = rid && ACTS[rid];
  const say = (typeof a?.say === 'function' ? a.say(on) : a?.say) || [step?.choose?.prompt || s.prompt?.prompt || '選擇角色'];
  rolePanel({
    key: 'pick-' + on.key, owned: true, roles: on.roles,
    tab: [rid && !s.veiled && mini(rid), step?.seatId && seatBadge(s, step.seatId), w('選角色')],
    lead: h('span', { class: 'rp-say', style: { '--tone': TONE[a?.tone] || 'var(--brass)' } }, sayView(say)),
    // 麻臉巫婆選在場的角色什麼都不會發生（官方）：說書人看得到誰在場，標「在場」
    state: id => ({ on: on.role === id, in: rid === 'pithag' && s.isSt && s.seats.some(x => x.role === id) }), picked: () => on.role,
    pick: id => { on.role = id; ctx.render(); },
    alive: () => sel.on === on,
  });
}
// 確認：還差人、差角色時灰著，點了說差什麼；什麼都不選也行的（教授、刺客）寫「不使用」。
// 只選角色、可以不用的：先是「不使用」「使用」兩個；「使用」以後右邊那個換成「確認」，左邊不動
const submit = (on, onDone) => { if (sel.on !== on) return; const v = [...on.ids], r = on.role; sel.on = null; closeRolePanel(); onDone(v, r); };
function pickBtns(onDone, cls, ctx) {
  const on = sel.on;
  if (roleOnly(on)) {
    const skip = B('不使用', () => { on.role = null; submit(on, onDone); }, cls);
    // 「使用」：劇本單先抽上來蓋住桌面，蓋好了卡才換成選項（換的那一下在紙底下，看不到）
    if (!on.use) return [skip, B('使用', () => { on.use = true; openRolePicker(ctx); setTimeout(() => ctx.render(), 380); }, cls)];
    return [skip, BW('確認', () => submit(on, onDone), cls, on.role ? null : '還要選角色')];
  }
  const ok = pickOk(on), none = ok && !on.ids.length && !on.role;
  return [BW(none ? '不使用' : '確認', () => submit(on, onDone), (none ? 'ghost ' : '') + cls, ok ? null : pickWhy(on))];
}
const confirmPick = (onDone, cls = '', ctx = cx) => { const b = pickBtns(onDone, cls, ctx); return b.length > 1 ? h('div', { class: 'row use-row' }, b) : b[0]; };

// 圓桌中間的牌可以收成一張小紙條，把桌面讓出來。只管這一步：下一步（或這一步換了狀態）的牌照常攤開
let foldedKey = null;
export const isFolded = key => foldedKey === key;
function setFold(ctx, key) {
  document.querySelector('.center > :is(.turn-pane, .st-card, .fold-stub), .town > .trial')?.setAttribute('data-exit', 'fold');
  foldedKey = key;
  ctx.render();
}
export const foldButton = (ctx, key) => h('button', { class: 'hud-x fold-x', onclick: () => setFold(ctx, key) }, '收起');
export const foldStub = (ctx, key, ...kids) => h('div', { class: 'cx fold-stub', 'data-key': 'fold-' + key, 'data-exit': true },
  h('div', { class: 'fs-lead' }, kids), B('展開', () => setFold(ctx, null), 'sm ghost'));

// 選人模式下的確認卡（說書人代選時的操作卡用）：lead 是行動者——卡角的小角標（glyph.js actorMark，線下輪到他時有箭頭就沒有），或者一行角色牌和座位號。
// 和信息卡同一個版式（手機上拆開，hud.css .spread）：上方是給說書人的一句（叫醒他/她指定一人［投毒］）和選角色的格子，
// 正中是選中的人（點桌上的頭像），取消、確認在下方（確認在右，和發送同一個位置）
// say：線下局說書人代點時，卡上寫這一步要叫他做什麼（和玩家手機上那句一樣）
export const actSay = (rid, c) => {
  const a = ACTS[rid], say = (typeof a?.say === 'function' ? a.say(c) : a?.say) || [`選擇 ${c.count} 名玩家`];
  return h('div', { class: 'tp-say ic-say' }, sayView(say));
};
export function selectBar(ctx, lead, onDone, canCancel, say) {
  const ask = asking(sel.on), roles = sel.on.roles && !ask && h('div', { class: 'opt-row' }, roleSlot(ctx));
  const who = lead instanceof Node && lead.classList.contains('ic-who') ? lead : lead && h('div', { class: 'ic-head' }, lead);
  // 「使用能力？」（哲學家、侍臣先問一句）時還沒有要點的人：問句就是正中的那件事
  return h('div', { class: 'card focus infocard spread pick' },
    !ask && (say || roles) && h('div', { class: 'ic-body' }, say, roles),
    h('div', { class: 'ic-top' }, who, ask ? h('div', { class: 'ic-say use-ask' }, w('使用能力？', 'ink')) : h('div', { class: 'opt-row' }, slots(ctx))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, canCancel && B('取消', () => stopSelect(ctx), 'ghost'), pickBtns(onDone, '', ctx))));
}

// 處決台現狀（桌面中央也用）
export function blockLines(s) {
  const now = s.block ? `處決台：${seatLabel(s, s.block.nomineeId)}（${s.block.count} 票）`
    : s.tie ? `處決台：${s.topCount} 票平票，無人在台上` : '處決台：暫無';
  const need = `需要 ${needVotes(s)} 票才能上處決台` + (s.topCount ? `（${s.topCount} 票為平票）` : '');
  return [now, need];
}
const masterRow = s => s.master && row(mini('butler'), w('主人'), seatBadge(s, s.master));

// 說書人：圓桌中央在「第 N 夜 / 天」下面放的東西——準備、天亮、白天沒有提名時。
// 夜晚的步驟卡、天亮前核對、白天的裁定卡是操作卡（town.js stBubble），提名期間的按鈕在審判牌上（trialButtons）
export function stCenter(ctx) {
  const s = ctx.state;
  if (!s.isSt || s.peek) return null;
  const next = label => B(label, () => ctx.st('next'), 'big');
  switch (s.phase) {
    case 'lobby': return lobbyPane(ctx);
    // 昨晚誰死了不寫在這裏：是桌子正上方的訃告（town.js obituary），圓桌中間只放要點的
    case 'dawn': return h('div', { class: 'cx' }, btns(next('開始白天')));
    case 'day': return !s.nomination && !s.st.ruling && h('div', { class: 'cx' }, dayDue(ctx), s.offline && dayActs(ctx), btns(endDayButton(ctx, s.offline)));
    case 'ended': {
      // MVP 投票還沒結束：「再來一局」先問一句（會按已投的票結算）；已投人數在 MVP 牌上
      const m = s.mvpVote, open = m && !m.done;
      return h('div', { class: 'cx' }, btns(open ? B('再來一局', () => ask('MVP 投票還沒結束：按已投的票結算，然後回到準備？', () => ctx.st('next'), '再來一局'), 'big') : next('再來一局')));
    }
  }
  return null;
}

// 線下白天：玩家當面提名、宣稱開槍，說書人點這兩個鍵，再在桌上先點做事的人、再點對象（可以是他自己），按卡上的確認才進審判 / 裁定（manual.js actPicking）。
// 提名是一天裏的正事（寬），開槍一局難得一次（窄）。沒人能提名了（處決過、都提名過）鍵照樣在，點了說原因
function dayActs(ctx) {
  const s = ctx.state, can = !s.dayOver && s.seats.some(x => mayNominate(s, x));
  // 開槍：誰都可以宣稱自己是獵手，所以不看場上有沒有；但劇本裏根本沒有獵手（黯月初升……）就沒人會這麼說，按鈕不放
  const gun = SCRIPTS[s.scriptId]?.roles.includes('slayer') || s.seats.some(x => x.role === 'slayer' || x.fakeRole === 'slayer');
  return h('div', { class: 'row r73 day-acts' },
    BW('提名', () => startAct(ctx, 'nom'), 'big', can ? null : s.dayOver ? '今天已經處決過，不能再提名' : '活著的人今天都提名過了'),
    gun && B([icon('aim'), '開槍'], () => startAct(ctx, 'slay'), 'big'));
}

// 白天要私下給信息的角色（博學者每天、藝術家一次）：小圓牌，點了直接補發，發過就收起
function dayDue(ctx) {
  const s = ctx.state, role = x => x.fakeRole || x.role;
  const told = (id, today) => s.st.log.some(l => l.e?.what === 'tell' && l.e.seat === id && (!today || l.day === s.day));
  const due = s.seats.filter(x => !x.dead && ((role(x) === 'savant' && !told(x.id, true)) || (role(x) === 'artist' && !told(x.id))));
  // 線下：說書人當面說，點一下記「已當面告知」就行，不用打字
  const tell = x => (s.offline ? ctx.st('tellInfo', { seatId: x.id, text: '當面告知' })
    : prompt2(`告訴 ${seatLabel(s, x.id)}`, '', text => text && ctx.st('tellInfo', { seatId: x.id, text }), { max: 300 }));
  // 能力失效（酒鬼、中毒、醉酒）或渦流在場：說書人要給假的，牌上直接標出來
  const vortox = s.seats.some(y => y.role === 'vortox' && !y.dead && !(y.tags || []).some(t => t === '中毒' || t === '醉酒'));
  const bent = x => (x.role === 'drunk' ? '酒鬼' : (x.tags || []).find(t => t === '中毒' || t === '醉酒') || (vortox && x.role !== 'drunk' ? '渦流' : null));
  return due.length > 0 && row(due.map(x => h('button', { class: 'chip due', title: s.offline ? '當面告知後點一下' : '補發信息', onclick: () => tell(x) },
    mini(role(x)), seatBadge(s, x.id), bent(x) && w(bent(x), 'evil'))));
}

// 審判牌最下面一行（說書人）：取消提名、提前結算、結束白天、立即計票（主按鈕放最右）
export function trialButtons(ctx) {
  const s = ctx.state, ck = clockState(ctx);
  if (!s.isSt || s.peek || s.st.ruling) return null;
  return h('div', { class: 'row tr-acts' },
    B('取消提名', () => ask('取消這次提名？雙方今天可以重新提名 / 被提名。', () => ctx.st('cancelVote'), '取消提名'), 'ghost'),
    B(ck ? '立即結算' : s.nomination.hand ? '結算' : '按當前舉手結算', () => ctx.st('closeVote'), s.nomination.hand ? 'big' : ''),
    !s.nomination.hand && endDayButton(ctx),
    !ck && !s.nomination.hand && B('立即計票', () => ctx.st('startCount'), 'big')); // 線下局當面數手，不用輪流倒數
}

// 白天、被動能力觸發：遊戲停下，說書人裁定是否生效。按鈕沒有主次，不替說書人推薦
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
// 結果只有一種（forced）時只有一個按鈕，中毒 / 酒鬼就是無效；目標可以被登記成另一類（隱士 / 間諜）時才二選一
// virgin：貞潔者被提名時的小窗（op 'virgin'），投票照常進行，不搶回車鍵。
// 必定反噬：只有倒數和「立即反噬」（延遲只為了不穿幫，不給不反噬的選項）；間諜提名：二選一
export function rulingCard(ctx, r = ctx.state.st.ruling, op = 'rule') {
  const s = ctx.state, side = op === 'virgin';
  const [yes, no] = RULE_BTN[r.kind] || ['生效', '無效'];
  const btn = (label, work) => B(label, () => ctx.st(op, { work }), side ? 'sm' : '');
  const opts = r.forced ? [r.auto] : [true, false];
  const left = side && r.due ? Math.max(0, Math.ceil((r.due - ctx.now()) / 1000)) : null;
  const say = [cardTag(!side && icon('timer'), RULE_TITLE[r.kind] || '裁定'),
    rulingWho(s, r),
    r.why && row(w(r.why, 'evil'), w('能力無效', 'muted')),
    !r.forced && r.reg && row(mini(r.reg), w(REG_AS[r.kind], 'muted'))];
  const acts = h('div', { class: 'row' }, left != null
    ? [h('span', { class: 'v-left' }, icon('timer'), h('b', {}, left), w('秒後反噬', 'muted')), B('立即反噬', () => ctx.st(op, { work: true }), 'sm')]
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
  const seatsOr = ids => (ids?.length ? ids.map(id => seatBadge(s, id)) : w('無', 'ink'));
  const sep = h('i', { class: 'op-sep' });
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-body' }, h('div', { class: 'ic-slip' },
      row(w('今晚'), st.diedTonight.length ? [st.diedTonight.map(id => seatBadge(s, id)), w('死亡', 'bad')] : w('無人死亡', 'good')),
      row(w('中毒', 'evil'), seatsOr(st.poisonList), st.drunkList?.length > 0 && [sep, w('醉酒', 'evil'), seatsOr(st.drunkList)],
        h('i', { class: 'op-sep' }), w('保護', 'good'), seatsOr(st.protectList)))),
    h('div', { class: 'ic-foot' }, B('天亮，公佈死訊', () => stepOp(ctx, 'dawn'), 'wide' + stepLock())));
}

// 結束白天前說清楚會發生什麼，避免誤點直接入夜
function endDayButton(ctx, small = false) {
  const s = ctx.state, nom = s.nomination, block = s.block && seatLabel(s, s.block.nomineeId);
  const [label, msg] = nom ? ['結算並結束白天', '結算當前投票，然後結束白天？']
    : block && !s.dayOver ? [`處決${block}，入夜`, `處決 ${block}，然後入夜？`]
      : ['結束白天，入夜', s.dayOver ? '結束白天並入夜？'
        // 渦流：白天沒人被處決，邪惡直接獲勝（中毒的渦流不算，服務端裁定；這裏只提醒）
        : s.seats.some(x => x.role === 'vortox' && !x.dead) ? '渦流在場：今天沒有人被處決，邪惡陣營會直接獲勝。確定結束白天？'
          : '今天沒有人被處決。確定結束白天、直接入夜？'];
  // 線下有撤銷，按鈕上已經寫明處決誰：直接做，不再問一遍同樣的話
  const sure = s.offline && block && !s.dayOver && !nom;
  return B(label, () => (sure ? ctx.st('next') : ask(msg, () => ctx.st('next'), label)), nom ? 'ghost' : small ? '' : 'big'); // 線下白天的正事是提名、開槍，入夜退一級
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
  const s = ctx.state, script = shown(s, 'scriptId'), ven = s.venue, one = s.oneDevice, seated = s.seats.length > 0;
  // 線上 / 線下、多設備 / 單設備：不能選的置灰不隱藏（自製劇本只能線下；座位上有人以後多設備、單設備不能互換）
  const venue = (v, d, text, off) => h('button', { class: 'chip' + (ven === v && (!d || one === (d === 'one')) ? ' on' : ''), disabled: off ? true : null,
    onclick: () => ctx.st('venue', { venue: v, devices: d }) }, text);
  return h('div', { class: 'script-card', 'data-key': 'script-card' },
    h('div', { class: 'sc-group' }, h('b', {}, '劇本'),
      Object.keys(SCRIPTS).map(id => h('button', { class: 'chip' + (id === script ? ' on' : ''), title: SCRIPTS[id].name,
        onclick: () => id !== script && pick(ctx, 'script', 'scriptId', id) }, SCRIPTS[id].name)),
      h('button', { class: 'chip up', onclick: () => communityScripts(ctx) }, '社區劇本'),
      h('button', { class: 'chip up', onclick: () => uploadScript(ctx) }, '上傳劇本'),
      h('button', { class: 'chip soon', disabled: true }, '敬請期待')),
    h('div', { class: 'sc-group sc-mode' }, venue('online', null, '線上', one && seated), venue('offline', null, '線下')),
    h('div', { class: 'sc-group sc-mode' }, venue('offline', 'many', '多設備', ven !== 'offline' || (one && seated)), venue('offline', 'one', '單設備', ven !== 'offline' || (!one && seated))));
}

// 準備（圓桌中央）：各陣營人數（陣營色圓牌 + 數字），必選 / 排除的角色牌，預覽時的惡魔偽裝，開局按鈕
// 剛建好的房間先選：線上（智能推進，系統當說書人）還是線下（說書人當面主持）；線下再選每人一台手機還是只用這一台
let venueStep = null; // 停在線下第二步的那個房間（實例標識）：解散了再建的新房間從第一步開始
function venuePane(ctx) {
  const go = (venue, devices) => { venueStep = null; ctx.st('venue', { venue, devices }).then(r => r.ok && ctx.state && (venue === 'online' || devices === 'many') && openInvite(ctx)); };
  const card = (key, ico, name, say, onclick) => h('button', { class: 'pc venue-pick', 'data-key': key, 'data-exit': true, onclick }, h('span', { class: 'vp-ico' }, icon(ico)), h('b', {}, name), h('small', {}, say));
  if (venueStep === ctx.state.inst) return h('div', { class: 'cx venue-pane', 'data-key': 'venue', 'data-exit': true },
    card('many', 'share', '多設備', '每人一台手機看身份', () => go('offline', 'many')),
    card('one', 'book', '單設備', '只用這一台，轉給玩家看', () => go('offline', 'one')),
    h('button', { class: 'venue-back', 'data-key': 'back', onclick: () => { venueStep = null; ctx.render(); } }, '← 線上 / 線下'));
  return h('div', { class: 'cx venue-pane', 'data-key': 'venue', 'data-exit': true },
    card('online', 'spark', '線上', '系統自動推進', () => go('online')),
    card('offline', 'talk', '線下', '說書人當面主持', () => { venueStep = ctx.state.inst; ctx.render(); }));
}

// 單設備定人數：空桌時圓桌中間一排人數，點一下坐滿；之後 − N 人 + 微調（和角色配置、隨機抽取同一排）。名字點座位下面的名牌改（town.js）
const countPick = ctx => h('div', { class: 'count-pick', 'data-key': 'count-pick', 'data-exit': true }, w('幾人', 'muted'),
  h('div', { class: 'cp-grid' }, Array.from({ length: maxOf(ctx.state) - 4 }, (_, i) => B(String(i + 5), () => ctx.st('seatCount', { n: i + 5 }), 'ghost'))));
// 劇本最多幾人：小劇本（社區劇本標 5-6人 的）6 人，其餘 15 人（服務端 lib/util.js maxSeats）
const maxOf = s => SCRIPTS[s.scriptId]?.max || 15;
function seatCounter(ctx) {
  const n = ctx.state.seats.length, set = k => ctx.st('seatCount', { n: k });
  return h('span', { class: 'add-seats' },
    BW('−', () => set(n - 1), 'ghost sq', n > 0 ? null : '已經沒有座位了'),
    h('span', { class: 'sc-n' }, h('b', {}, n), '人'),
    BW('+', () => set(n + 1), 'ghost sq', n < maxOf(ctx.state) ? null : maxOf(ctx.state) < 15 ? `這個劇本最多 ${maxOf(ctx.state)} 人` : '最多 15 人'));
}

// 開局前檢查：block 是開不了的（人不夠、有座位沒角色），warn 是提醒（沒有惡魔、配比不對、紅鯡魚、偽裝……），看過可以照樣開
function startChecks(s, due, off) {
  const st = s.st, n = s.seats.length, block = [], warn = [];
  const bare = s.seats.map((x, i) => !x.role && i + 1).filter(Boolean);
  if (n < 5) block.push(`至少要 5 人，現在 ${n} 人`);
  else if (n > maxOf(s)) block.push(`這個劇本只適合 5–${maxOf(s)} 人，現在 ${n} 人：減人或者換劇本`);
  else if (bare.length === n) block.push('還沒有角色：點「隨機抽取」，或者點座位指定');
  else if (bare.length) block.push(`${bare.join('、')} 號還沒有角色：點「隨機抽取」補上，或者點座位指定`);
  if (block.length) return { block, warn };
  const roles = s.seats.map(x => x.role);
  if (!roles.some(id => ROLES[id].team === 'demon')) warn.push('場上沒有惡魔');
  for (const t of CORE) if (off(t)) warn.push(`${TEAMS[t].name} ${roles.filter(id => ROLES[id].team === t).length} 個，按人數應該 ${due[t]} 個`);
  const twice = [...new Set(roles.filter((id, i) => roles.indexOf(id) !== i))];
  if (twice.length) warn.push(`重複的角色：${twice.map(id => ROLES[id].name).join('、')}`);
  if (s.seats.some(x => x.role === 'fortuneteller' || x.fakeRole === 'fortuneteller') && !st.redHerring) warn.push('占卜師的紅鯡魚還沒設（偽裝下面那一格）');
  // 偽裝只能是不在場的善良角色：小劇本人多時劇本裏的善良角色幾乎都上了場，說清楚為什麼不夠
  const spare = SCRIPTS[s.scriptId]?.roles.filter(id => ['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk' && !s.seats.some(x => x.role === id || x.fakeRole === id)).length;
  if ((st.bluffs || []).filter(Boolean).length < 3) warn.push(spare < 3 ? `惡魔的偽裝不夠 3 個：劇本裏不在場的善良角色只剩 ${spare} 個，人數超過劇本適合的人數了` : '惡魔的偽裝不夠 3 個');
  // 提線木偶要和惡魔鄰座（官方）：隨機抽取會排好，手動指定的沒挨著就提醒
  const demonAt = roles.flatMap((id, i) => (ROLES[id].team === 'demon' ? [i] : [])), near = (i, j) => (i - j + n) % n === 1 || (j - i + n) % n === 1;
  roles.forEach((id, i) => { if (id === 'marionette' && demonAt.length && !demonAt.some(j => near(i, j))) warn.push(`${i + 1} 號提線木偶要坐在惡魔旁邊`); });
  return { block, warn };
}
// 開始遊戲：一直在圓桌正中間（手機上底部會被 Safari 的地址欄擋住）。開不了時是灰的，點了說為什麼；只有提醒時列出來，可以照樣開
function startButton(ctx, due, off) {
  const s = ctx.state, { block, warn } = startChecks(s, due, off);
  const list = (lines, tone) => h('ul', { class: 'start-why ' + tone }, lines.map(x => h('li', {}, x)));
  const go = () => {
    if (block.length) return modal('還不能開局', h('div', {}, list(block, 'bad'), h('div', { class: 'row end' }, B('知道了', closeModal))));
    if (!warn.length) return ctx.st('next');
    modal('開局前看一下', h('div', {}, list(warn, 'warn'),
      h('div', { class: 'row end' }, B('返回', closeModal, 'ghost'), B('照樣開始', () => { closeModal(); ctx.st('next', { force: true }); }))));
  };
  return h('div', { class: 'start-row' }, B([icon('play'), '開始遊戲'], go, 'big start' + (block.length ? ' blocked' : '')));
}

function lobbyPane(ctx) {
  const s = ctx.state, st = s.st, n = s.seats.length, rules = st.roleRules;
  if (!s.venue && !n) return venuePane(ctx);
  const locked = Object.keys(rules).filter(id => rules[id] === 'lock'), banned = Object.keys(rules).filter(id => rules[id] === 'ban');
  // 預覽時按座位上實際的角色數，否則按人數和必選規則推算
  const drafted = st.draft && s.seats.reduce((c, x) => (x.role && CORE.includes(ROLES[x.role].team) && c[ROLES[x.role].team]++, c), { townsfolk: 0, outsider: 0, minion: 0, demon: 0 });
  const c = drafted || (n >= 5 && teamCounts(n, locked.filter(changesSetup)));
  // 配比對不上的陣營標出來，不攔（教父 ±1 時外來者和鎮民不比）
  const inPlay = drafted ? s.seats.map(x => x.role).filter(changesSetup) : [];
  const due = drafted && n >= 5 && teamCounts(n, inPlay), flex = inPlay.some(id => Array.isArray(ROLES[id].setup.outsider));
  const off = t => !!due && c[t] !== due[t] && !(flex && ['outsider', 'townsfolk'].includes(t));
  // 可能抽到、會改變外來者數量的角色（男爵 7 人以下隨機不出現）。抽完淡掉但位置還在，這一行的高度不變，圓桌中央的東西不動
  const shifts = SCRIPTS[s.scriptId].roles.filter(id => changesSetup(id) && !rules[id] && !(id === 'baron' && n < 7));
  // 劇本裏有這種角色，這一行就一直留著（暗流 7 人才出男爵）：加人、改必選時開始遊戲不會被往下擠
  const shiftLine = SCRIPTS[s.scriptId].roles.some(changesSetup);
  const delta = id => { const x = ROLES[id].setup.outsider; return Array.isArray(x) ? '±1' : (x > 0 ? '+' : '') + x; };
  // 寬屏兩塊連著放在圓桌中央；手機和窄桌面 lp-act 放到圓桌外面，其餘還在中央（board.css）
  // 帶 key：從選模式那一塊換過來時，選模式的牌整塊在原地淡掉，不拆開塞進這一塊（版式不一樣，會擠到中間）
  return h('div', { class: 'cx lobby-pane', 'data-key': 'lobby' },
    h('div', { class: 'lp-top' },
      // 單設備空桌：先點人數
      s.oneDevice && !n ? countPick(ctx) : [
        // 配比對不上的陣營：數字後面小字寫應該是幾（男爵、教父這些改外來者人數的也算進去了），點了不攔
        // 四個陣營單獨一行，對準圓心；可能改外來者人數的角色放下面一行，有幾個都不會把上面推歪
        c && row(CORE.map(t => h('span', { class: 'team-n' + (off(t) ? ' off' : ''), style: { '--team': TEAMS[t].color }, title: off(t) ? `應為 ${due[t]}` : null }, h('i'), c[t], off(t) && h('small', { class: 'team-due' }, `應${due[t]}`)))),
        c && shiftLine && h('div', { class: 'frm-line maybes' }, n >= 5 && shifts.map(id => h('span', { class: 'maybe' + (st.draft ? ' off' : '') }, mini(id), delta(id)))),
        (locked.length > 0 || banned.length > 0) && row(locked.map(id => h('span', { class: 'rule lock' }, mini(id))), banned.map(id => h('span', { class: 'rule ban' }, mini(id), icon('cross', 'rule-x')))),
        startButton(ctx, due, off)]),
    h('div', { class: 'lp-act' },
      // 這一排抽沒抽都在原位、不換字（人不夠時置灰不隱藏），說書人的手不用重新找按鈕；抽完只在下面多出來，位置預先留好，圓桌中央的居中不會把這排頂走。
      // 線下大家坐在哪就是哪，不打亂座位；單設備這一排開頭是人數
      btns(s.oneDevice && seatCounter(ctx), !s.offline && BW('打亂座位', () => ctx.st('shuffleSeats'), 'ghost', n > 1 ? null : '至少要兩個人才能換座'), B('角色配置', () => openSetup(ctx)),
        BW('隨機抽取', () => ctx.st('draft'), '', n < 5 ? `至少要 5 人才能抽，現在 ${n} 人` : n > maxOf(s) ? `這個劇本只適合 5–${maxOf(s)} 人，現在 ${n} 人` : null)),
      // 偽裝永遠三格：小劇本人多時不在場的善良角色不夠，抽不滿的格子留成「空」，照樣能點開選；「偽裝」兩個字也能點開
      h('div', { class: 'lobby-after' }, st.draft && row(
        h('button', { class: 'bluff-pick bluff-tag', title: '指定', onclick: () => pickBluff(ctx, Math.max(0, [0, 1, 2].findIndex(i => !st.bluffs[i]))) }, tag('bluff')),
        [0, 1, 2].map(i => { const id = st.bluffs[i];
          return h('button', { class: 'bluff-pick' + (st.bluffPins?.[i] ? ' pinned' : '') + (id ? '' : ' empty'), title: '指定', onclick: () => pickBluff(ctx, i) }, id ? named(id) : w('空', 'muted')); })),
        herringRow(ctx))));
}

// 開局前預選首夜要告訴誰什麼：紅鯡魚那一排一個通用的「預選」鍵——點了，桌上能預選的人亮起來，點誰就給誰預選：
// 洗衣婦、圖書管理員、調查員（以為自己是的酒鬼 / 提線木偶也算）是首夜那張卡（上方必選的、正中結論，infoform.js preCard）；
// 祖母像紅鯡魚一樣直接點桌上的孫子；系統不認識的角色（自製、沒收錄的）是一張通用的卡：點桌上的人、挑角色，就是首夜要給他看的。
// 已經預選了的排在鍵後面（角色小牌 + 選了誰），點一下再改。首夜那一步按這個預填 / 展示，到時候還能改（lib/night.js、stepcard.js preShow）
let preEdit = null; // { inst, seatId }：正在預選的那一格；seatId 為 null 是剛按了「預選」，等點桌上的人
let preFree = null; // 自製角色那張卡上正在改的 { seats, roles }
export function preEditing(ctx) {
  const s = ctx.state;
  if (!preEdit?.seatId || preEdit.inst !== s.inst || !s.isSt || s.peek) return null;
  if (s.phase === 'lobby') return s.st.preForms?.find(f => f.seatId === preEdit.seatId) || null;
  // 首夜自製角色標記卡上的「改」
  const seat = s.phase === 'night' && s.seats.find(x => x.id === preEdit.seatId);
  return seat && preFree ? { seatId: seat.id, roleId: seat.fakeRole || seat.role, kind: 'free' } : null;
}
const preChoosing = s => preEdit?.inst === s.inst && !preEdit.seatId && s.isSt && !s.peek && s.phase === 'lobby';
export function preDone(ctx, f, fields) {
  preEdit = null; preFree = null;
  ctx.st('setPre', { seatId: f.seatId, fields });
  ctx.render();
}
// 打開某個座位的預選（準備階段，或首夜自製角色標記卡上的「改」）
export function preOpen(ctx, seatId) {
  const s = ctx.state, v = s.st.pre?.[seatId];
  const f = s.phase === 'lobby' ? s.st.preForms?.find(x => x.seatId === seatId) : { seatId, kind: 'free' };
  if (!f) return;
  if (f.kind === 'two') preDraft(f, v);
  preFree = f.kind === 'free' ? { seats: [...(v?.seats || [])], roles: [...(v?.roles || [])] } : null;
  preEdit = { inst: s.inst, seatId };
  herringPick = null;
  ctx.render();
}
// 桌上點人：剛按了「預選」——能預選的人亮著，點誰開誰的；祖母——能當孫子的善良玩家亮著；自製角色——誰都能點，點了加進 / 拿出要給他看的人
export function prePickSeat(ctx) {
  const s = ctx.state;
  if (preChoosing(s)) {
    return { can: new Set((s.st.preForms || []).map(f => f.seatId)), on: new Set(), fixed: new Set(), why: () => '這個角色的信息系統會算，不用預選',
      pick: id => preOpen(ctx, id) };
  }
  const f = preEditing(ctx);
  if (f?.kind === 'grandchild') {
    return { can: new Set(f.options), on: new Set([s.st.pre?.[f.seatId]?.pick].filter(Boolean)), fixed: new Set(), why: () => '孫子要是善良玩家',
      pick: id => preDone(ctx, f, { pick: id }) };
  }
  if (f?.kind === 'free') {
    const d = preFree;
    return { can: new Set(s.seats.map(x => x.id)), on: new Set(d.seats), fixed: new Set(),
      pick: id => { d.seats = d.seats.includes(id) ? d.seats.filter(x => x !== id) : [...d.seats, id].slice(-8); ctx.render(); } };
  }
  return null;
}
// 自製角色的預選卡：上方引導 + 要給他看的角色（點一下拿掉，「角色」那一格開整本劇本連選）；正中是結論（座位號 + 角色牌）；下方清除 / 完成
export function freePreCard(ctx, f) {
  const s = ctx.state, d = preFree, ord = id => s.seats.findIndex(x => x.id === id);
  const toggle = id => { d.roles = d.roles.includes(id) ? d.roles.filter(x => x !== id) : [...d.roles, id].slice(-6); ctx.render(); };
  const open = () => rolePanel({ key: 'pre-free-' + f.seatId, tab: [mini(f.roleId), seatBadge(s, f.seatId)], roles: SCRIPTS[s.scriptId]?.roles || [], owned: true,
    state: id => ({ on: d.roles.includes(id) }), pick: id => { toggle(id); return 'stay'; }, done: '完成', alive: () => preFree === d });
  const seats = [...d.seats].sort((a, b) => ord(a) - ord(b));
  return h('div', { class: 'card focus infocard spread pre-free' },
    h('div', { class: 'ic-body' }, h('div', { class: 'ic-tag say' }, '首夜要給他看的人和角色'),
      h('div', { class: 'opt-row' }, d.roles.map(id => h('button', { class: 'opt-tile on', 'data-key': id, onclick: () => toggle(id) }, named(id))),
        h('button', { class: 'role-slot', onclick: open }, h('span', { class: 'sb empty' }), w('角色', 'muted')))),
    h('div', { class: 'ic-top' }, wakeMark(s, [f.seatId], mini(f.roleId)),
      h('div', { class: 'frm big pf-what' }, seats.length || d.roles.length ? [seats.map(id => seatBadge(s, id)), d.roles.map(id => mini(id))] : h('span', { class: 'sb empty' }))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, B('清除', () => preDone(ctx, f, null), 'ghost'),
      B('完成', () => preDone(ctx, f, seats.length || d.roles.length ? { seats, roles: d.roles } : null)))));
}
// 首夜自製角色的標記卡（stepcard.js markCard）正中：開局前預選的「要給他看的」——座位號 + 角色牌；
// 「展示」整屏給他看（只給卡上的這個人），「改」換成預選卡改完再回來
export function preShow(ctx, step) {
  const s = ctx.state, v = s.night === 1 && s.st.pre?.[step.seatId];
  if (!v?.seats && !v?.roles) return null;
  const ord = id => s.seats.findIndex(x => x.id === id), seats = [...(v.seats || [])].sort((a, b) => ord(a) - ord(b)), roles = v.roles || [];
  return h('div', { class: 'mk-pre', 'data-key': 'pre' }, h('span', { class: 'frm big' }, seats.map(id => seatBadge(s, id)), roles.map(id => mini(id))),
    h('div', { class: 'row' }, B([icon('eye'), '展示'], () => showPages(s, [{ to: step.seatId, body: bigCore(s, { seats, roles }) }]), 'sm'),
      B('改', () => preOpen(ctx, step.seatId), 'sm ghost')));
}
// 紅鯡魚那一排：「預選」鍵 + 已經預選了的
function preItems(ctx) {
  const s = ctx.state, forms = s.st.preForms || [];
  if (!forms.length) return [];
  const on = preChoosing(s);
  const done = forms.filter(f => s.st.pre?.[f.seatId]).map(f => {
    const v = s.st.pre[f.seatId], ord = id => s.seats.findIndex(q => q.id === id);
    const ids = (v.seats || [v.a, v.b, v.pick]).filter(Boolean).sort((x, y) => ord(x) - ord(y));
    return h('button', { class: 'bluff-pick pre', 'data-key': 'pre-' + f.seatId, title: '改', onclick: () => preOpen(ctx, f.seatId) },
      mini(f.roleId), v.none ? w('無', 'ink') : ids.map(id => seatBadge(s, id)), (v.roles || []).map(id => mini(id, 'pre-r')));
  });
  return [h('button', { class: 'bluff-pick pre-btn' + (on ? ' on' : ''), 'data-key': 'pre-btn', onclick: () => { preEdit = on ? null : { inst: s.inst, seatId: null }; herringPick = null; ctx.render(); } },
    icon('quill'), on ? w('點桌上的人', 'muted') : w('預選', 'ink')), done];
}

// 紅鯡魚：場上有占卜師（含以為自己是占卜師的酒鬼）才長出這一格，和偽裝一樣是單獨的設置，不藏在座位菜單裏。
// 系統先挑好一個；點這一格，桌上能當紅鯡魚的善良玩家亮起來，點誰就是誰（再點這一格收回）
let herringPick = null; // 正在桌上點紅鯡魚的那個房間（實例標識）
const hasFt = s => s.seats.some(x => x.role === 'fortuneteller' || x.fakeRole === 'fortuneteller');
export function herringPicking(ctx) {
  const s = ctx.state;
  if (herringPick !== s.inst || !s.isSt || s.peek || s.phase !== 'lobby' || !hasFt(s) || preEdit) return null;
  const good = s.seats.filter(x => x.role && TEAMS[ROLES[x.role].team]?.good).map(x => x.id); // 官方：占卜師本人也可以
  return { can: new Set(good), on: new Set([s.st.redHerring].filter(Boolean)), fixed: new Set(), why: () => '紅鯡魚只能是善良玩家',
    pick: id => { herringPick = null; ctx.st('setRedHerring', { seatId: id }); ctx.render(); } };
}
// 和開局前預選的首夜信息排在同一排（preItems）
function herringRow(ctx) {
  const s = ctx.state, on = herringPick === s.inst, id = s.st.redHerring, pre = preItems(ctx);
  if (!hasFt(s) && !pre.length) return null;
  return h('div', { class: 'row herring-row', 'data-key': 'herring' }, hasFt(s) && [mini('fortuneteller'), w('紅鯡魚', 'ink'),
    h('button', { class: 'bluff-pick herring' + (on ? ' on' : ''), title: on ? '收回' : '換一個', onclick: () => { herringPick = on ? null : s.inst; preEdit = null; ctx.render(); } },
      on ? [h('span', { class: 'sb empty' }), w('點桌上的善良玩家', 'muted')] : id ? seatBadge(s, id) : w('未設', 'muted'))], pre);
}

// 玩家：輪到自己行動時建立本地的選人狀態（桌面和圓桌中央的確認牌要用到），其他時候清掉
export function syncPrompt(ctx) {
  const s = ctx.state;
  if (s.prompt) {
    if (!sel.on || sel.on.key !== s.prompt.stepId) sel.on = selFrom(s.prompt.stepId, s.prompt, s.myId);
  } else if (sel.on) sel.on = null;
}
// 線下局的說書人：輪到誰選人，桌上直接進入選人（他當面指，說書人點），不用先點「代為選擇」。這一步過了就收起
export function syncStPick(ctx) {
  const s = ctx.state, step = s.st?.step;
  if (!s.isSt || s.peek || !s.offline) return;
  // 桌子中間先擺著別的卡（第 1 夜的傳閱身份、紅唇女郎接任的提示）、「輪到誰」的整屏牌還沒收起（herald.js）時還沒輪到這一步：
  // 不進選人，否則座位按這一步的規則變灰
  const ahead = needPass(ctx) || !!s.st?.notice || heraldHeld();
  if (s.phase === 'night' && step?.status === 'choose' && !ahead) {
    if (!sel.on || sel.on.key !== step.id) sel.on = { ...selFrom(step.id, step.choose, step.seatId), auto: true };
  } else if (sel.on?.auto) sel.on = null;
}

// 玩家：圓桌中央在「第 N 天」下面放的東西——輪到自己行動時的選人和確認、準備階段的離開 / 改名、昨晚死訊、管家的主人
export function playerCenter(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  if (s.isSt || s.peek) return null;
  // 觀戰的人：準備階段有空位就能入座
  if (!me) return s.phase === 'lobby' && s.seats.length < 15 ? h('div', { class: 'cx' }, h('div', { class: 'row' }, B('入座', () => ctx.sit()))) : null;
  if (s.prompt && sel.on && !nightHeld()) return turnPane(ctx);
  if (s.phase === 'lobby') return h('div', { class: 'cx' }, h('div', { class: 'row' }, B('離開房間', () => ctx.act('leave').then(() => ctx.leave()), 'ghost sm'),
    B('改名', () => prompt2('你的暱稱', me.name, name => { if (name) { ctx.ls.set('botc.name', name); ctx.act('rename', { name }); } }, { max: 12 }), 'sm')));
  if (s.phase === 'dawn' || (s.phase === 'day' && !s.nomination)) return masterRow(s) && h('div', { class: 'cx' }, masterRow(s));
  return null;
}

// 輪到自己行動：圓桌中央一張紙牌——大角色牌 + 行動圖標，一句話說清楚選誰、會怎樣（關鍵詞用語義色），下面是選中的座位和確認
function turnPane(ctx) {
  // 這一步的角色（理髮師死後惡魔替他選人時是理髮師）
  const s = ctx.state, rid = s.prompt.roleId || s.myRole, a = !s.prompt.manual && ACTS[rid]; // 手動局的牌是說書人寫的，不用角色自己的說法
  const say = (typeof a?.say === 'function' ? a.say(s.prompt) : a?.say) || [s.prompt.prompt || `選擇 ${s.prompt.count} 名玩家`];
  // wake：系統不認識的角色、不用選人（只得知信息）——只告訴他輪到了，沒有可按的，等說書人把信息發過來
  const wake = !!s.prompt.wake;
  const key = 'turn-' + s.prompt.stepId, send = cls => !wake && confirmPick((ids, role) => ctx.act('pick', { ids, role }), cls);
  // 收起時選好了也能直接確認，不用再展開一次
  if (isFolded(key)) return foldStub(ctx, key, rid && !s.veiled && mini(rid), slots(ctx), roleSlot(ctx), send('sm'));
  return h('div', { class: 'cx turn-pane' + (a ? ' ' + a.tone : '') + (wake ? ' wake' : ''), 'data-key': 'turn', 'data-exit': true },
    // 遮住身份時牌頭也蓋著（旁邊的人能看到這張牌）
    h('div', { class: 'tp-head' }, s.veiled ? h('div', { class: 'token back' }) : [rid && roleToken(rid), rid && ACTS[rid] && h('span', { class: 'tp-ico' }, actIcon(rid))]),
    h('div', { class: 'tp-say' }, sayView(say)),
    !wake && h('div', { class: 'row tp-picks' }, slots(ctx), roleSlot(ctx)),
    send('big'), foldButton(ctx, key));
}

// 投票按鈕（放在審判牌兩欄的頂上）：贊成計票、棄權不計票（只有自己和說書人看得到），再點一次取消。不是玩家時返回 null
export function voteButtons(ctx) {
  const s = ctx.state, nom = s.nomination, ck = clockState(ctx), me = s.seats.find(x => x.mine);
  if (!me || s.isSt || s.peek || nom.hand) return null; // 線下局當面舉手，說書人記
  const up = !!nom.votes[s.myId], no = !!nom.abstain?.[s.myId];
  const locked = ck && ck.locked(s.myId), yesOff = (me.dead && me.voteUsed) || locked, noOff = locked;
  const btn = (k, on, off, ico, text, v, n) => h('button', {
    class: `vbtn ${k}` + (on ? ' on' : '') + (off ? ' disabled' : ''),
    onclick: () => !off && ctx.act('vote', { v: on ? null : v }) }, icon(ico), text, h('i', {}, n));
  return { yes: n => btn('yes', up, yesOff, 'hand', '贊成', 'yes', n), no: n => btn('no', no, noOff, 'abstain', '棄權', 'abstain', n) };
}
