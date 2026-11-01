// 說書人的夜晚操作卡：和玩家輪到自己時的牌一樣，在圓桌中央「第 N 夜」下面（town.js 放置）；天亮前核對是 flow.js reviewCard
import { h, ask } from './ui.js';
import { sel, startSelect } from './town.js';
import { selectBar, selFrom, B, PRETEND } from './flow.js';
import { infoForm } from './infoform.js';
import { seatBadge, mini, icon, named, w } from './glyph.js';
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
  if (sel.on && sel.on.key === step.id) {
    return selectBar(ctx, [mini(step.roleId), seatBadge(s, step.seatId, 'lg')], (ids, role) => ctx.st('pick', { ids, role }), true);
  }
  if (step.status === 'choose') {
    const seat = s.seats.find(x => x.id === step.seatId), online = seat && seat.online;
    return h('div', { class: 'card infocard' },
      head(s, step, h('span', { class: 'waiting' + (online ? '' : ' off') }, online ? [h('i'), h('i'), h('i')] : icon('none'))),
      h('div', { class: 'row' },
        B('代為選擇', () => startSelect(ctx, selFrom(step.id, step.choose, step.seatId)), online ? '' : 'primary', !online),
        B('跳過', () => ask(`跳過 ${step.title} 的行動？`, () => ctx.st('skip'), '跳過'), 'ghost')));
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
    h('div', { class: 'row' }, B(word.st ? '選人' : '代選', pick, (word.st ? 'primary ' : '') + 'sm'),
      !word.st && B('不選', () => ask('就當他沒有選人？', () => send([]), '不選'), 'ghost sm')));
}

// 玩家用完能力：這一步的結果，說書人確認了才叫下一位
function ackCard(ctx, step) {
  const s = ctx.state, { note, e } = step.result || {}, picks = step.picks || [];
  const what = e?.k === 'act' && e.to?.length ? actRow(s, e) : note ? w(note, 'ink')
    : picks.length ? [w('選了', 'ink'), picks.map(id => seatBadge(s, id))] : w('沒有使用能力', 'muted');
  return h('div', { class: 'card focus infocard spread' },
    h('div', { class: 'ic-top' }, head(s, step), h('div', { class: 'frm big' }, what), goonLine(s, step)),
    h('div', { class: 'ic-foot' }, B('確認', () => ctx.st('ack'), 'primary wide', true)));
}

// 假裝叫醒：沒有人醒（不在場 / 今晚不醒 / 已經做完），停一會兒再往下走，玩家看不出這一格是空的。
// 計時條走完自動繼續（服務端計時，app.js 每半秒重繪一次），說書人也可以直接繼續
function pretendCard(ctx, step) {
  const left = Math.min(1, Math.max(0, (step.due - ctx.now()) / Math.max(1, step.due - step.at)));
  return h('div', { class: 'card infocard pretend' },
    h('div', { class: 'ic-head' }, step.roleId in GROUP ? w(GROUP[step.roleId], 'ink') : named(step.roleId), w(PRETEND[step.why], 'muted')),
    h('div', { class: 'pt-row' }, icon('moon', 'pt-moon'), w('假裝叫醒', 'ink'),
      h('i', { class: 'pt-bar' }, h('i', { style: { width: (left * 100).toFixed(1) + '%' } }))),
    h('div', { class: 'row' },
      h('label', { class: 'pt-off' }, h('input', { type: 'checkbox', class: 'switch', checked: ctx.state.st.noPretend || null, onchange: e => ctx.st('noPretend', { on: e.target.checked }) }), w('本局不再假裝', 'muted')),
      B('繼續', () => ctx.st('pretend'), 'primary', true)));
}
const GROUP = { minioninfo: '爪牙信息', demoninfo: '惡魔信息' };

// 鎮長替死、小惡魔傳位、誰醉酒、造謠 / 月之子選中誰、反芻誰……：說書人從選項裏挑一個（座位號 + 角色牌，或短詞）
function decideCard(ctx, step) {
  const s = ctx.state, d = step.decide, key = step.id + (d.role || d.kind);
  const cur = d.options.some(o => o.id === choices[key]) ? choices[key] : null;
  if (d.kind === 'ability') return h('div', { class: 'card focus infocard free spread' },
    h('div', { class: 'ic-top' }, head(s, step),
      h('div', { class: 'frm big' }, (step.picks || []).length > 0 && [w({ imp: '想殺', monk: '保護' }[step.roleId] || '選了', 'ink'),
        step.picks.map(id => seatBadge(s, id)), h('i', { class: 'op-sep' })], seatBadge(s, d.targetId), named(d.role), w(d.why, 'evil')), goonLine(s, step)),
    // 酒鬼只有「無效」一個選項
    h('div', { class: 'ic-foot' }, h('div', { class: 'row' }, d.options.map((o, i) => B(o.label, () => ctx.st('decide', { choice: o.id }), i ? '' : 'primary', d.options.length === 1)))));
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
    h('div', { class: 'ic-foot' }, h('button', { class: 'btn primary wide' + (cur ? '' : ' disabled'), 'data-hot': '1', onclick: () => cur && ctx.st('decide', { choice: cur }) }, '確定')));
}
