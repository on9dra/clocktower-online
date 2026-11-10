// 說書人的夜晚操作卡：和玩家輪到自己時的牌一樣，在圓桌中央「第 N 夜」下面（town.js 放置）；天亮前核對是 flow.js reviewCard
import { h, ask, toast, prompt2, seatLabel } from './ui.js';
import { tr, getLang } from './lang.js';
import { sel, startSelect, seatMenu } from './town.js';
import { selectBar, selFrom, B, BW, PRETEND, stepOp, stepLock, cardTag } from './flow.js';
import { showPages, bigRoles, bigNum, bigCore, bigTeam, bigWord, bluffSay } from './pass.js';
import { ROLES } from './roles.js';
import { showRole, openReminders } from './manual.js';
import { infoForm } from './infoform.js';
import { seatBadge, mini, icon, named, w, tag, formula, ACTS } from './glyph.js';
import { actRow, goonLine } from './log.js';

const choices = {}; // stepId -> 說書人在裁定卡上選中的選項

// 給 town.js：選項是座位的裁定（誰醉酒、替死、傳位……）可以直接點桌上的座位，和卡上的選項同步
export function decidePicking(ctx, step) {
  const d = step.decide;
  if (!d || d.kind === 'ability') return null;
  const ids = d.options.map(o => o.id).filter(id => ctx.state.seats.some(x => x.id === id));
  if (!ids.length) return null;
  const key = step.id + (d.role || d.kind);
  return { can: new Set(ids), on: new Set(ids.includes(choices[key]) ? [choices[key]] : []), fixed: new Set(),
    pick: id => { choices[key] = id; ctx.render(); } };
}

const head = (s, step, extra) => h('div', { class: 'ic-head' }, mini(step.roleId), step.seatId && seatBadge(s, step.seatId, 'lg'), extra);

export function stepCard(ctx) {
  const s = ctx.state, step = s.st.step;
  // 線下：說書人當面叫醒他，他指給你看，你在桌上點（flow.js syncStPick 直接進入選人，不用先點「代為選擇」）
  if (sel.on && sel.on.key === step.id) {
    return selectBar(ctx, [mini(step.roleId), seatBadge(s, step.seatId, 'lg')], (ids, role) => stepOp(ctx, 'pick', { ids, role }), !s.offline,
      s.offline && stSay(s, step.choose, step.roleId));
  }
  if (step.status === 'mark') return markCard(ctx, step);
  if (step.status === 'choose') {
    const seat = s.seats.find(x => x.id === step.seatId), online = seat && seat.online;
    return h('div', { class: 'card infocard spread' },
      h('div', { class: 'ic-top' }, head(s, step, h('span', { class: 'waiting' + (online ? '' : ' off') }, online ? [h('i'), h('i'), h('i')] : icon('none')))),
      h('div', { class: 'row' },
        B('代為選擇', () => startSelect(ctx, selFrom(step.id, step.choose, step.seatId))),
        B('跳過', () => ask(`跳過 ${step.title} 的行動？`, () => stepOp(ctx, 'skip'), '跳過'), 'ghost' + stepLock())));
  }
  if (step.status === 'ack') return ackCard(ctx, step);
  if (step.status === 'decide') return decideCard(ctx, step);
  if (step.status === 'fake') return pretendCard(ctx, step);
  return infoForm(ctx, step);
}

// 死後的選擇：月之子、呆瓜自己公開選（等他，或者代選），心上人由說書人選誰醉酒。放在桌面左上角，不擋白天
export function lastWordCard(ctx, word) {
  const s = ctx.state, key = 'word-' + word.seatId, lead = [mini(word.role), seatBadge(s, word.seatId, 'lg')];
  const send = ids => ctx.st('word', { seatId: word.seatId, targetId: ids[0] || null });
  if (sel.on?.key === key) return selectBar(ctx, lead, send, true);
  const pick = () => startSelect(ctx, selFrom(key, { count: 1, alive: true, notSelf: true }, word.seatId));
  // 線下沒有手機可等：寫明叫他做什麼（月之子、呆瓜當眾指一個人），說書人照他指的在桌上點
  const off = s.offline && !word.st;
  return h('div', { class: 'card infocard ruling corner' },
    h('div', { class: 'frm-line' }, lead, word.st ? w('誰從此醉酒？', 'ink') : off ? w('請他公開選一人', 'ink') : h('span', { class: 'waiting' }, h('i'), h('i'), h('i'))),
    h('div', { class: 'row' }, B(word.st || off ? '選人' : '代選', pick, 'sm'),
      !word.st && B('不選', () => ask('就當他沒有選人？', () => send([]), '不選'), 'ghost sm')));
}

// 線下代點時卡上寫給說書人看的話：叫醒他，讓他指定幾個人（和一個角色）做什麼——「叫醒他/她指定一人［投毒］」。
// 動作詞是一枚小章（ACTS 的 verb，沒有就用 mark），不是對玩家說的「選擇……」。真惡魔：先指給他看瘋子今晚選了誰
const NUM = ['', '一', '兩', '三', '四', '五'];
export const stSay = (s, c, roleId) => {
  const n = Math.max(...(c.counts || [c.count])), a = ACTS[roleId] || {}, verb = a.verb || a.mark;
  // 兩段各自翻譯再拼（英文：1 player and a character）
  const what = [n > 0 && tr(`${NUM[n] || n}人`), c.roles && tr('一個角色')].filter(Boolean).join(getLang() === 'en' ? ' and ' : tr('和'));
  return [c.luna && h('div', { class: 'frm-line ic-line' }, seatBadge(s, c.luna.seatId), mini('lunatic'), w('選了', 'muted'), c.luna.ids.map(id => seatBadge(s, id))),
    h('div', { class: 'ic-say' }, w(`叫醒他/她指定${what}`, 'ink'), verb && h('b', { class: 'act-v ' + (a.tone || '') }, verb), c.counts?.includes(0) && w('（可以不指定）', 'muted'))];
};

// 單設備首夜（只有單設備停在這幾步，多設備的信息直接發到手機上），按官方順序各自單獨叫醒：
// 爪牙信息 = 只叫醒爪牙，指給他們看誰是惡魔（惡魔不睜眼：一起睜眼的話，瘋子會發現自己沒被叫起來）。
// 瘋子信息 = 桌上先提醒說書人「下面是假信息」，點了展示才整屏給瘋子看，和真惡魔那一頁一模一樣（假爪牙 + 假偽裝）。
// 惡魔信息 = 給惡魔看爪牙和偽裝，到這一步直接整屏彈出來，之後瘋子、提線木偶各多一頁。收起後桌上這張卡能再打開。
// 提線木偶不在爪牙裏：他不醒，別的爪牙也不知道他（官方）
// 展示完都回到桌上這張卡，說書人讓他閉眼後自己點「下一個」
const popped = new Set(); // 自動彈過整屏的步驟：收起之後不再自己彈出來
// 惡魔 / 瘋子看的那一頁：同一個版式，瘋子分不出真假
const demonPage = (s, l) => (l.minions?.length || l.bluffs?.length) && {
  to: l.seatId, say: l.minions?.length ? ['向惡魔', seatBadge(s, l.seatId), '展示爪牙和偽裝'] : bluffSay(s, l.seatId),
  body: [l.minions?.length > 0 && bigTeam(s, 'minion', l.minions), l.bluffs?.length > 0 && bigRoles(l.bluffs)] };
// 惡魔那一頁之後：誰是瘋子、誰是提線木偶，各一頁
const knows = l => [[l.luna, 'lunatic'], [l.pup, 'marionette']].filter(([id]) => id);
const groupPages = (s, step) => step.lines.flatMap(l => [demonPage(s, l), ...knows(l).map(([id, r]) => ({ to: l.seatId, body: bigCore(s, { seats: [id], roles: [r] }) }))]).filter(Boolean);
// 卡頂給說書人的一句（叫醒誰、做什麼）：和信息卡的引導同一個樣子（fx.css .ic-tag.say），比標題長，手機上居中不衝出卡
const sayTag = text => h('div', { class: 'ic-tag say' }, text);
// 桌上兩行：他看哪幾個爪牙、哪三張偽裝
const toldRow = (s, l) => [l.minions?.length > 0 && h('div', { class: 'frm-line ic-line' }, tag('minion'), l.minions.map(id => seatBadge(s, id))),
  l.bluffs?.length > 0 && h('div', { class: 'frm-line ic-line' }, tag('bluff'), l.bluffs.map(r => mini(r)))];
function groupCard(ctx, step) {
  const s = ctx.state, next = () => stepOp(ctx, 'ack'), eye = fn => B([icon('eye'), '展示'], fn);
  if (step.roleId === 'minioninfo') {
    const demon = step.lines.find(l => l.demon)?.demon, minions = step.lines.map(l => l.seatId);
    // 爪牙們一起看一頁：誰是惡魔、爪牙有誰
    const show = () => showPages(s, [{ to: minions[0], say: ['給', minions.map(id => seatBadge(s, id)), '看'],
      body: h('div', { class: 'big-stack' }, demon && bigTeam(s, 'demon', [demon]), bigTeam(s, 'minion', minions)) }]);
    return h('div', { class: 'card focus infocard spread group mutual' },
      h('div', { class: 'ic-top' }, sayTag('叫醒爪牙，指出惡魔'),
        h('div', { class: 'frm-line mu-line' }, minions.length > 0 && h('span', { class: 'mu-who' }, minions.map(id => seatBadge(s, id, 'lg')), tag('minion')),
          demon && h('span', { class: 'mu-who' }, seatBadge(s, demon, 'lg'), tag('demon')))),
      h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, eye(show), B('下一個', next, stepLock()))));
  }
  const pages = groupPages(s, step), show = () => showPages(s, groupPages(s, step));
  if (step.roleId === 'lunainfo') {
    const l = step.lines[0];
    return h('div', { class: 'card focus infocard spread group luna' },
      h('div', { class: 'ic-top' }, sayTag('叫醒瘋子，當他是惡魔展示'),
        h('div', { class: 'ic-head' }, mini('lunatic'), seatBadge(s, l.seatId, 'lg'), w('假信息', 'evil')), toldRow(s, l)),
      h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, pages.length > 0 && eye(show), B('下一個', next, stepLock()))));
  }
  if (pages.length && !popped.has(step.id)) { popped.add(step.id); queueMicrotask(show); }
  // 桌上：叫醒誰、給他看哪幾個爪牙和哪三張偽裝；有瘋子、提線木偶各再一行
  return h('div', { class: 'card focus infocard spread group' },
    h('div', { class: 'ic-top' }, sayTag(step.lines.some(l => l.minions?.length) ? '叫醒惡魔，展示爪牙和偽裝' : '叫醒惡魔，展示偽裝'),
      step.lines.map(l => [h('div', { class: 'ic-head' }, tag('demon'), seatBadge(s, l.seatId, 'lg')), toldRow(s, l),
        knows(l).map(([id, r]) => h('div', { class: 'frm-line ic-line' }, seatBadge(s, id), w('是', 'muted'), named(r)))])),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, pages.length > 0 && eye(show), B('下一個', next, stepLock()))));
}

// 系統不認識的角色（混合推進）：說書人自己叫醒他、處理。
// 能力裏寫著要他選人的（step.ask）：線下他當面指、說書人在桌上點；線上他在手機上選，說書人也能在桌上替他點。選了誰存在服務端（step.picks）。
// 不用選人的（只得知信息）：桌上不進入選人，座位照常開菜單
export function markPicking(ctx, step) {
  if (!step.ask) return null;
  const on = step.picks || [];
  return { can: new Set(ctx.state.seats.map(x => x.id)), on: new Set(on), fixed: new Set(on.includes(step.seatId) ? [] : [step.seatId]),
    pick: id => ctx.st('markPick', { ids: on.includes(id) ? on.filter(x => x !== id) : [...on, id] }) };
}
// 選了會怎樣：能力文字裏認得出來的後果（step.cons）各一枚墨章，按下就當場結算在被選的人身上，再按一次收回。
// 在這一步裏結算，後面的角色才接得上（惡魔殺了守鴉人，守鴉人今晚就醒）
const CONS = { kill: ['死亡', 'evil'], poison: ['中毒', 'poison'], drunk: ['醉酒', 'brass'] };
function markCons(ctx, step) {
  const s = ctx.state, picks = step.picks || [];
  const settle = async (what, on) => {
    const r = await ctx.st('markDo', { what, on });
    // 照規則擋住了（僧侶、士兵……）：告訴說書人為什麼沒死；這個能力擋不住的話由他決定照樣殺死
    if (r.ok && r.blocked?.length) {
      ask(r.blocked.map(b => tr(`${seatLabel(s, b.id)}${b.why}，沒有死亡`)).join('\n'), () => ctx.st('markDo', { what, force: true }), '照樣殺死');
    }
  };
  return h('div', { class: 'mk-cons' }, step.cons.map(what => {
    const [word, tone] = CONS[what], done = picks.length > 0 && picks.every(id => (step.did?.[what] || []).includes(id));
    return h('button', { class: `mk-do ${tone}` + (done ? ' on' : '') + (picks.length ? '' : ' off'), 'data-key': what,
      onclick: () => (picks.length ? settle(what, !done) : toast(s.offline ? '先在桌上點他指的人' : '等他選完，或者在桌上替他點')) }, word);
  }));
}
function markCard(ctx, step) {
  const s = ctx.state, seat = s.seats.find(x => x.id === step.seatId), picks = step.picks || [];
  // 標記貼在他選的人身上（沒選人就是他自己），這個角色自己的標記排最前
  const marked = picks.length ? picks.map(id => s.seats.find(x => x.id === id)).filter(Boolean) : seat ? [seat] : [];
  const tell = () => prompt2(`告訴 ${seatLabel(s, step.seatId)}`, '', text => text && ctx.st('tellInfo', { seatId: step.seatId, text }), { max: 300 });
  // 被選的座位號能點：開這個座位的菜單（更換角色、改陣營……卡上沒有的都在那裏）
  // 還沒選：線下是等說書人在桌上點的空圈（和代點卡一樣，要幾個人幾個圈）；線上是等他在手機上選的三個點（說書人照樣能在桌上替他點）
  const n = step.ask ? (step.ask.any ? 1 : step.ask.n) : 0;
  const pickRow = picks.length ? [w('選了', 'ink'), picks.map(id => h('button', { class: 'mk-seat', onclick: e => seatMenu(ctx, id, e.currentTarget) }, seatBadge(s, id)))]
    : step.sent ? w('沒有選人', 'muted') // 他在手機上確認了「不使用」
      : s.offline ? h('span', { class: 'slots' }, Array.from({ length: n }, () => h('span', { class: 'sb empty' + (step.ask.opt || step.ask.any ? ' opt' : '') })))
        : h('span', { class: 'waiting' + (seat?.online ? '' : ' off') }, seat?.online ? [h('i'), h('i'), h('i')] : icon('none'));
  // 他的能力現在不靈（酒鬼 / 瘋子、中毒、醉酒）：和內置角色的信息卡一樣標出來，說書人據此決定給真的還是假的
  const tags = seat?.tags || [];
  const why = !seat ? null : seat.role === 'drunk' ? '酒鬼' : seat.role === 'lunatic' ? '瘋子' : seat.role === 'marionette' ? '提線木偶' : tags.includes('中毒') ? '中毒' : tags.includes('醉酒') ? '醉酒' : null;
  // 手機上拆開（hud.css .spread）：圓桌中間只有一小張——誰、選了誰、會怎樣；提示詞是給說書人的引導，放圓桌上方；按鈕在下方。
  // 電腦上是一張卡：誰、提示詞、選了誰、按鈕（提示詞靠 order 排回第二行）
  return h('div', { class: 'card focus infocard spread mark' },
    h('div', { class: 'ic-top' }, head(s, step, why && w(why, 'evil')),
      // 一行讀下來：選了 ⑤ ［中毒］
      step.ask && h('div', { class: 'mk-line' }, h('div', { class: 'opt-row mk-picks' }, pickRow), step.cons?.length > 0 && markCons(ctx, step))),
    // 官方提示詞很長：只露幾行，點一下展開（只切這一個節點的 class，不重繪）
    h('div', { class: 'ic-body' }, h('div', { class: 'ic-say mk-tip', onclick: e => e.currentTarget.classList.toggle('open') }, step.tip || ROLES[step.roleId]?.ability),
      // 「告訴他」發出去之後：卡上留一行發了什麼，不用去看他的手機才知道發沒發
      typeof step.said === 'string' && h('div', { class: 'mk-said', 'data-key': 'said' }, icon('send'), h('span', {}, step.said))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' },
      // 線下當面說、比劃，比劃不出來的角色整屏給他看；線上打字發到他手機上
      s.offline ? B([icon('eye'), '展示'], () => showRole(ctx, step.seatId), 'sm ghost') : seat && B([icon('send'), '告訴他'], tell, 'sm ghost'),
      marked.length > 0 && B([icon('quill'), '標記'], () => openReminders(ctx, marked, step.roleId), 'sm ghost')),
      B('下一個', () => stepOp(ctx, 'ack'), 'wide' + stepLock())));
}

// 一條私下告訴的話的核心：帶顏色的短詞（瘋狂）、座位、角色牌，別的字不要
function toldCore(s, f) {
  if (!f) return null;
  const words = f.filter(t => t.w && t.k), seats = f.filter(t => t.s).map(t => t.s), roles = f.filter(t => t.r).map(t => t.r);
  return h('div', { class: 'big-stack' }, words.map(t => bigWord(t.w, t.k)), bigCore(s, { seats, roles }));
}
// 單設備：說書人接下來要私下告訴誰什麼，一人一句照著念——「叫醒 ⑤，讓他得知自己被洗腦為 賢者」。
// 卡上不擺式子：行動者是誰、他選了誰，說書人剛剛自己點的；這一句才是他現在要做的事。整屏給玩家看的在「展示」裏。
// 他還醒著（剛替他點完的行動者：舞蛇人換到惡魔、理髮師把自己換了）不用再叫醒：「告知 ②：他變成了 方古」
const TELL = { become: '自己變成了', mad: '自己被洗腦為', exorcist: '選中他的驅魔人是', twin: '鏡像雙子是', align: '自己的陣營變為',
  outsiders: '在場的外來者', noOutsider: '場上沒有外來者' };
const tellLine = (s, id, kind, obj, awake = false) => h('div', { class: 'ic-say tell' },
  awake ? [w('告知', 'ink'), seatBadge(s, id), w('：' + (TELL[kind] || '').replace(/^自己/, '他'), 'ink')]
    : [w('叫醒', 'ink'), seatBadge(s, id), w('，' + (kind ? '讓他得知' + TELL[kind] : '告訴他'), 'ink')], obj);
// 服務端 step.told 的一條是哪一種：換了角色（麻臉巫婆、理髮師、方古、傳位）、被洗腦、被驅魔、鏡像雙子、莽夫換陣營
const toldKind = t => (t.k === 'role' || t.f?.[0]?.op === 'become' ? 'become' : { cerenovus: 'mad', exorcist: 'exorcist', eviltwin: 'twin', goon: 'align' }[t.src] || null);
function toldObj(s, t) {
  const f = t.f || [], r = f.find(x => x.r)?.r, at = f.find(x => x.s)?.s;
  switch (toldKind(t)) {
    case 'become': case 'mad': return named(r);
    case 'exorcist': return seatBadge(s, at);
    case 'twin': return [seatBadge(s, at), named(r)];
    case 'align': { const a = f.at(-1); return w(a.w, a.k); }
    default: return h('span', { class: 'frm' }, formula(s, f.filter(x => !x.op)));
  }
}
// 單設備：這一步要私下告訴的人，一人一份 { to, line 卡上照著念的一句, body 整屏給他看的核心 }。
// 舞蛇人換到惡魔：兩人各自的新角色（先告知還睜著眼的舞蛇人，再叫醒原惡魔）；教父首夜：在場的外來者（沒有就是 0）；鏡像雙子：兩人各看對方是誰；
// 服務端 step.told（麻臉巫婆變了他的角色、小惡魔傳位、洗腦師讓他瘋狂、驅魔人選中了惡魔……）上面沒說到的人每人一份
function tells(s, step) {
  const { e, f } = step.result || {}, role = id => s.seats.find(x => x.id === id)?.role, out = [];
  const awake = id => id === step.seatId && (step.picks || []).length > 0; // 這一步替他點過人：他還睜著眼
  const add = (to, kind, obj, body) => { if (!out.some(p => p.to === to)) out.push({ to, line: tellLine(s, to, kind, obj, awake(to)), body }); };
  if (e?.swap && e.to?.[0]) { add(e.seat, 'become', named(e.swap.role), bigRoles([e.swap.role])); add(e.to[0], 'become', named(e.swap.gave), bigRoles([e.swap.gave])); }
  else if (step.roleId === 'godfather' && f) { const r = f.filter(t => t.r).map(t => t.r); add(step.seatId, r.length ? 'outsiders' : 'noOutsider', r.map(named), r.length ? bigRoles(r) : bigNum(0)); }
  else if (step.roleId === 'eviltwin' && e?.to?.[0]) {
    const [a, b] = [e.seat, e.to[0]];
    add(a, 'twin', [seatBadge(s, b), named(role(b))], bigCore(s, { seats: [b], roles: [role(b)] }));
    add(b, 'twin', [seatBadge(s, a), named(role(a))], bigCore(s, { seats: [a], roles: [role(a)] }));
  }
  for (const t of step.told || []) add(t.seatId, toldKind(t), toldObj(s, t), toldCore(s, t.f));
  return out;
}
// 要告訴兩個人以上的（舞蛇人換到惡魔、鏡像雙子、理髮師換了兩人……）拆成一人一張卡，和兩步一樣：
// 「告知 ⑨：他變成了 方古」展示完按「下一個」，才換成「叫醒 ③，讓他得知自己變成了 舞蛇人」，最後一個人的「下一個」才往下走。
// 到第幾個人記在本機（重新整理還停在這個人）；town.js 把它拼進卡的 id，換人和換一步一樣：舊卡退場、新卡進場
let part = (() => { try { return JSON.parse(sessionStorage.getItem('botc.part')) || {}; } catch { return {}; } })();
export const ackPart = step => (step && part.id === step.id ? part.i : 0);
function nextPart(ctx, step) {
  part = { id: step.id, i: ackPart(step) + 1 };
  try { sessionStorage.setItem('botc.part', JSON.stringify(part)); } catch { /* 無痕模式：只記在這一頁 */ }
  ctx.render();
}
// 玩家用完能力：這一步的結果，說書人確認了才叫下一位
function ackCard(ctx, step) {
  if (step.lines) return groupCard(ctx, step);
  const s = ctx.state, { note, e, f } = step.result || {}, picks = step.picks || [];
  const parts = s.oneDevice ? tells(s, step) : [], ids = new Set(parts.map(p => p.to));
  const i = Math.min(ackPart(step), parts.length - 1), last = i >= parts.length - 1;
  // 結果式子：沒有要說的話時它就是卡的內容；有的話只在它還說了別的事時留著（小惡魔自殺傳位、麻臉巫婆造惡魔後誰死）
  const keep = !parts.length || (e?.k === 'act' && !e.swap && !['eviltwin', 'godfather'].includes(step.roleId) && (e.to || []).some(id => !ids.has(id)));
  const what = !keep ? null : f ? formula(s, f) : e?.k === 'act' && (e.to?.length || e.role) ? actRow(s, e) : note ? w(note, 'ink')
    : picks.length ? [w('選了', 'ink'), picks.map(id => seatBadge(s, id))] : w('沒有使用能力', 'muted');
  const next = () => stepOp(ctx, 'ack');
  // 展示：只給這張卡上的這個人看（按的時候用最新的狀態）
  const show = () => { const p = tells(ctx.state, step)[i]; p && showPages(ctx.state, [{ to: p.to, body: p.body }]); };
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, head(s, step), what && h('div', { class: 'frm big' + (parts.length ? ' sub' : '') }, what), goonLine(s, step), parts[i]?.line),
    h('div', { class: 'ic-foot' }, parts.length ? h('div', { class: 'row' }, B([icon('eye'), '展示'], show), last ? B('下一個', next, stepLock()) : B('下一個', () => nextPart(ctx, step)))
      : B('確認', next, 'wide' + stepLock())));
}

// 線下：白天紅唇女郎接任惡魔，沒有夜晚步驟可停，說書人這邊彈一張：告訴誰、他變成了什麼。單設備整屏給她看；多設備她手機上已經有了。
// 一句話照著念：夜裏是「叫醒 ⑤，讓他得知自己變成了 小惡魔」，白天「私下告知 ⑤：他變成了 小惡魔」
export function noticeCard(ctx, n) {
  const s = ctx.state, done = () => ctx.st('notice'), r = n.f.find(t => t.r)?.r;
  const say = !s.oneDevice ? h('div', { class: 'ic-say tell' }, seatBadge(s, n.seatId), w('變成了', 'ink'), named(r))
    : s.phase === 'night' ? tellLine(s, n.seatId, 'become', named(r))
      : h('div', { class: 'ic-say tell' }, w('私下告知', 'ink'), seatBadge(s, n.seatId), w('：他變成了', 'ink'), named(r));
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, !s.oneDevice && cardTag(icon('send'), '已發到手機'), h('div', { class: 'ic-head' }, named(n.src)), say),
    h('div', { class: 'ic-foot' }, s.oneDevice
      ? h('div', { class: 'row' }, B([icon('eye'), '展示'], () => showPages(ctx.state, [{ to: n.seatId, body: toldCore(s, n.f) }])), B('知道了', done))
      : B('知道了', done, 'wide')));
}

// 假裝叫醒：沒有人醒（不在場 / 今晚不醒 / 已經做完），停一會兒再往下走，玩家看不出這一格是空的。
// 計時條走完自動繼續（服務端計時，app.js 每半秒重繪一次），說書人也可以直接繼續。
// 手機上和信息卡一樣拆開（hud.css .spread）：誰、計時條在圓桌中間，「本局不再假裝」和繼續在圓桌下方（代為選擇那張卡也是）
function pretendCard(ctx, step) {
  const left = Math.min(1, Math.max(0, (step.due - ctx.now()) / Math.max(1, step.due - step.at)));
  return h('div', { class: 'card infocard pretend spread' },
    h('div', { class: 'ic-top' }, h('div', { class: 'ic-head' }, step.roleId in GROUP ? w(GROUP[step.roleId], 'ink') : named(step.roleId), w(PRETEND[step.why], 'muted')),
      h('div', { class: 'pt-row' }, icon('moon', 'pt-moon'), w('假裝叫醒', 'ink'),
        h('i', { class: 'pt-bar' }, h('i', { style: { width: (left * 100).toFixed(1) + '%' } })))),
    h('div', { class: 'row' },
      h('label', { class: 'pt-off' }, h('input', { type: 'checkbox', class: 'switch', checked: ctx.state.st.noPretend || null, onchange: e => ctx.st('noPretend', { on: e.target.checked }) }), w('本局不再假裝', 'muted')),
      B('繼續', () => stepOp(ctx, 'pretend'), stepLock())));
}
const GROUP = { minioninfo: '爪牙信息', demoninfo: '惡魔信息' };

// 鎮長替死、小惡魔傳位、誰醉酒、造謠 / 月之子選中誰、反芻誰……：說書人從選項裏挑一個（座位號 + 角色牌，或短詞）
function decideCard(ctx, step) {
  const s = ctx.state, d = step.decide, key = step.id + (d.role || d.kind);
  const cur = d.options.some(o => o.id === choices[key]) ? choices[key] : null;
  if (d.kind === 'ability') return h('div', { class: 'card focus infocard free spread' },
    h('div', { class: 'ic-top' }, head(s, step),
      (step.picks || []).length > 0 && h('div', { class: 'frm big sub' }, w(ACTS[step.roleId]?.mark || '選了', 'ink'), step.picks.map(id => seatBadge(s, id))),
      // 為什麼停在這裏：誰的哪個能力因為什麼沒有用（「無效」是唯一的按鈕）——「⑤ 士兵 中毒，能力無效」
      h('div', { class: 'ic-say tell' }, seatBadge(s, d.targetId), named(d.role), w(d.why, 'evil'), w('，能力無效', 'ink')), goonLine(s, step)),
    // 沒有能力，只有「無效」：官方說書人不能讓它生效
    h('div', { class: 'ic-foot' }, B('無效', () => stepOp(ctx, 'decide', { choice: 'fail' }), 'wide' + stepLock())));
  const face = o => {
    const seat = s.seats.find(x => x.id === o.id);
    return seat ? [seatBadge(s, seat.id), mini(seat.role)] : o.id === 'none' ? icon('none') : w(o.label, 'ink');
  };
  const lead = d.kind === 'mayor' ? [w('惡魔殺', 'bad'), seatBadge(s, d.targetId), named('mayor'), w('換誰死？', 'ink')]
    : d.kind === 'starpass' ? [w('誰成為', 'ink'), named('imp'), w('？', 'ink')]
      : [(step.picks || []).map(id => seatBadge(s, id)), w(d.say || d.prompt, 'ink')];
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, head(s, step), h('div', { class: 'frm big' }, lead), goonLine(s, step)),
    h('div', { class: 'ic-body' }, h('div', { class: 'opt-row' }, d.options.map(o => h('button', {
      class: 'opt-tile' + (cur === o.id ? ' on' : ''), title: o.label, onclick: () => { choices[key] = o.id; ctx.render(); },
    }, face(o))))),
    h('div', { class: 'ic-foot' }, BW('確定', () => stepOp(ctx, 'decide', { choice: cur }), 'wide' + (cur ? stepLock() : ''), cur ? null : '先選一個')));
}
