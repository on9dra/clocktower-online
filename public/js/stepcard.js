// 說書人的夜晚操作卡：和玩家輪到自己時的牌一樣，在圓桌中央「第 N 夜」下面（town.js 放置）；天亮前核對是 flow.js reviewCard
import { h, ask } from './ui.js';
import { tr, getLang } from './lang.js';
import { sel, startSelect } from './town.js';
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
  return h('div', { class: 'card infocard ruling corner' },
    h('div', { class: 'frm-line' }, lead, word.st ? w('誰從此醉酒？', 'ink') : h('span', { class: 'waiting' }, h('i'), h('i'), h('i'))),
    h('div', { class: 'row' }, B(word.st ? '選人' : '代選', pick, 'sm'),
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

// 單設備首夜（只有單設備停在這兩步，多設備的信息直接發到手機上）：
// 爪牙信息 = 叫醒惡魔和爪牙互認。玩家睜眼就看到了，卡上只有給說書人的一句：標題「請指示互認」，正文是誰是惡魔、誰是爪牙
// 惡魔信息 = 給惡魔看偽裝，到這一步直接整屏彈出來（標題給說書人，三張大角色牌給惡魔）；收起後桌上這張卡能再打開。
// 有瘋子：瘋子不參加互認，偽裝那一步惡魔的那頁帶著誰是瘋子，下一頁給瘋子（他以為自己是惡魔：假爪牙 + 假偽裝）
const popped = new Set(); // 自動彈過整屏的步驟：收起之後不再自己彈出來
function bluffPages(s, step) {
  const demon = step.lines.find(l => !l.lunatic), luna = step.lines.find(l => l.lunatic);
  const roles = l => l.bluffs?.length > 0 && bigRoles(l.bluffs);
  return [
    demon && (demon.bluffs?.length || luna) && { to: demon.seatId, say: bluffSay(s, demon.seatId), body: [roles(demon), luna && bigCore(s, { seats: [luna.seatId], roles: ['lunatic'] })] },
    luna && { to: luna.seatId, say: bluffSay(s, luna.seatId), body: [luna.minions?.length > 0 && bigTeam(s, 'minion', luna.minions), roles(luna)] },
  ].filter(Boolean);
}
function groupCard(ctx, step) {
  const s = ctx.state, next = () => stepOp(ctx, 'ack');
  if (step.roleId === 'minioninfo') {
    const demon = step.lines.find(l => l.demon)?.demon, minions = step.lines.map(l => l.seatId);
    return h('div', { class: 'card focus infocard spread group mutual' },
      h('div', { class: 'ic-top' }, cardTag('請指示互認'),
        h('div', { class: 'frm-line mu-line' }, demon && h('span', { class: 'mu-who' }, seatBadge(s, demon, 'lg'), tag('demon')),
          minions.length > 0 && h('span', { class: 'mu-who' }, minions.map(id => seatBadge(s, id, 'lg')), tag('minion')))),
      h('div', { class: 'ic-foot' }, B('下一個', next, 'wide' + stepLock())));
  }
  const pages = bluffPages(s, step), show = () => showPages(s, bluffPages(s, step), next);
  if (pages.length && !popped.has(step.id)) { popped.add(step.id); queueMicrotask(show); }
  // 桌上：誰看哪三張（瘋子那一行帶他的牌，說書人知道哪一頁是給誰的）
  return h('div', { class: 'card focus infocard spread group' },
    h('div', { class: 'ic-top' }, cardTag('向惡魔展示可用的偽裝'),
      step.lines.map(l => h('div', { class: 'frm-line ic-line' }, seatBadge(s, l.seatId, 'lg'), l.lunatic && mini('lunatic'), (l.bluffs || []).map(r => mini(r))))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, pages.length > 0 && B([icon('eye'), '展示'], show), B('下一個', next, stepLock()))));
}

// 系統不認識的角色（混合推進）：說書人自己叫醒他、處理。他指了誰就點桌上的座位記下來，要告訴他什麼可以整屏給他看
const markSel = {}; // stepId -> 點了的座位
export function markPicking(ctx, step) {
  const on = markSel[step.id] ||= [];
  return { can: new Set(ctx.state.seats.map(x => x.id)), on: new Set(on), fixed: new Set([step.seatId]),
    pick: id => { const i = on.indexOf(id); if (i >= 0) on.splice(i, 1); else on.push(id); ctx.render(); } };
}
function markCard(ctx, step) {
  const s = ctx.state, seat = s.seats.find(x => x.id === step.seatId), on = markSel[step.id] || [];
  const next = async () => {
    if (on.length) { const r = await ctx.st('markPick', { ids: on }); if (!r.ok) return; }
    stepOp(ctx, 'ack');
  };
  return h('div', { class: 'card focus infocard spread mark' },
    h('div', { class: 'ic-top' }, head(s, step),
      // 官方提示詞很長：只露三行，點一下展開（只切這一個節點的 class，不重繪）
      h('div', { class: 'ic-say mk-tip', onclick: e => e.currentTarget.classList.toggle('open') }, step.tip || ROLES[step.roleId]?.ability),
      h('div', { class: 'opt-row' }, on.length ? [w('選了', 'ink'), on.map(id => seatBadge(s, id))] : w('他指了誰就點誰', 'muted'))),
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' },
      B([icon('eye'), '展示'], () => showRole(ctx, step.seatId), 'sm ghost'),
      seat && B([icon('quill'), '標記'], () => openReminders(ctx, seat), 'sm ghost')),
      B('下一個', next, 'wide' + stepLock())));
}

// 單設備：結果裏有玩家要知道的，整屏一人一頁給他們看。
// 舞蛇人換到惡魔：兩人各看自己的新角色；教父首夜：在場的外來者（沒有就是 0）；鏡像雙子：兩人各看對方是誰
function ackPages(s, step) {
  const { e, f } = step.result || {}, role = id => s.seats.find(x => x.id === id)?.role;
  let pages = [];
  if (e?.swap && e.to?.[0]) pages = [{ to: e.seat, body: bigRoles([e.swap.role]) }, { to: e.to[0], body: bigRoles([e.swap.gave]) }];
  else if (step.roleId === 'godfather' && f) { const out = f.filter(t => t.r).map(t => t.r); pages = [{ to: step.seatId, body: out.length ? bigRoles(out) : bigNum(0) }]; }
  else if (step.roleId === 'eviltwin' && e?.to?.[0]) {
    const [a, b] = [e.seat, e.to[0]];
    pages = [{ to: a, body: bigCore(s, { seats: [b], roles: [role(b)] }) }, { to: b, body: bigCore(s, { seats: [a], roles: [role(a)] }) }];
  }
  // 這一步私下告訴了別人的（服務端 step.told：麻臉巫婆變了他的角色、小惡魔傳位、洗腦師讓他瘋狂、驅魔人選中了惡魔……），上面沒給過的每人一頁
  const done = new Set(pages.map(p => p.to));
  for (const t of step.told || []) if (!done.has(t.seatId)) { done.add(t.seatId); pages.push({ to: t.seatId, body: toldCore(s, t.f) }); }
  return pages;
}
// 一條私下告訴的話的核心：帶顏色的短詞（瘋狂）、座位、角色牌，別的字不要
function toldCore(s, f) {
  if (!f) return null;
  const words = f.filter(t => t.w && t.k), seats = f.filter(t => t.s).map(t => t.s), roles = f.filter(t => t.r).map(t => t.r);
  return h('div', { class: 'big-stack' }, words.map(t => bigWord(t.w, t.k)), bigCore(s, { seats, roles }));
}
// 卡上一人一行：要叫醒誰、告訴他什麼（說書人看的小字），整屏的在「展示」裏
const toldLines = (s, step) => (step.told || []).map(t => h('div', { class: 'frm-line ic-line' }, seatBadge(s, t.seatId, 'lg'), t.f && formula(s, t.f.filter(x => !x.op))));
// 玩家用完能力：這一步的結果，說書人確認了才叫下一位
function ackCard(ctx, step) {
  if (step.lines) return groupCard(ctx, step);
  const s = ctx.state, { note, e, f } = step.result || {}, picks = step.picks || [];
  const what = f ? formula(s, f) : e?.k === 'act' && (e.to?.length || e.role) ? actRow(s, e) : note ? w(note, 'ink')
    : picks.length ? [w('選了', 'ink'), picks.map(id => seatBadge(s, id))] : w('沒有使用能力', 'muted');
  const pages = s.oneDevice ? ackPages(s, step) : [], next = () => stepOp(ctx, 'ack');
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, head(s, step), h('div', { class: 'frm big' }, what), goonLine(s, step), s.oneDevice && toldLines(s, step)),
    h('div', { class: 'ic-foot' }, pages.length ? h('div', { class: 'row' }, B([icon('eye'), '展示'], () => showPages(ctx.state, ackPages(ctx.state, step), next)), B('下一個', next, stepLock()))
      : B('確認', next, 'wide' + stepLock())));
}

// 線下：白天紅唇女郎接任惡魔，沒有夜晚步驟可停，說書人這邊彈一張：告訴誰、他變成了什麼。單設備整屏給她看；多設備她手機上已經有了
export function noticeCard(ctx, n) {
  const s = ctx.state, done = () => ctx.st('notice');
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, cardTag(icon('eye'), s.oneDevice ? '告知' : '已發到手機'),
      h('div', { class: 'ic-head' }, mini(n.src), seatBadge(s, n.seatId, 'lg')), h('div', { class: 'frm big' }, formula(s, n.f))),
    h('div', { class: 'ic-foot' }, s.oneDevice
      ? h('div', { class: 'row' }, B([icon('eye'), '展示'], () => showPages(ctx.state, [{ to: n.seatId, body: toldCore(s, n.f) }], done)), B('知道了', done))
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
      h('div', { class: 'frm big' }, (step.picks || []).length > 0 && [w(ACTS[step.roleId]?.mark || '選了', 'ink'),
        step.picks.map(id => seatBadge(s, id)), h('i', { class: 'op-sep' })], seatBadge(s, d.targetId), named(d.role), w(d.why, 'evil')), goonLine(s, step)),
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
