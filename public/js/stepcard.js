// 說書人的夜晚操作卡（浮在行動者座位旁）；天亮前確認在操作塢裏（flow.js）
import { h, ask } from './ui.js';
import { sel, startSelect } from './town.js';
import { selectBar, B } from './flow.js';
import { infoForm } from './infoform.js';
import { seatBadge, mini, icon, named, w } from './glyph.js';

const choices = {}; // stepId -> 說書人在裁定卡上選中的選項

const head = (s, step, extra) => h('div', { class: 'ic-head' }, mini(step.roleId), step.seatId && seatBadge(s, step.seatId, 'lg'), extra);

export function stepCard(ctx) {
  const s = ctx.state, step = s.st.step;
  if (sel.on && sel.on.key === step.id) {
    return selectBar(ctx, [mini(step.roleId), seatBadge(s, step.seatId, 'lg')], ids => ctx.st('pick', { ids }), true);
  }
  if (step.status === 'choose') {
    const seat = s.seats.find(x => x.id === step.seatId), online = seat && seat.online;
    return h('div', { class: 'card infocard' },
      head(s, step, h('span', { class: 'waiting' + (online ? '' : ' off') }, online ? [h('i'), h('i'), h('i')] : icon('none'))),
      h('div', { class: 'row' },
        B('代為選擇', () => startSelect(ctx, { key: step.id, count: step.choose.count, notSelfId: step.choose.notSelf ? step.seatId : null }), online ? '' : 'primary', !online),
        B('跳過', () => ask(`跳過 ${step.title} 的行動？`, () => ctx.st('skip'), '跳過'), 'ghost')));
  }
  if (step.status === 'decide') return decideCard(ctx, step);
  return infoForm(ctx, step);
}

// 鎮長替死、小惡魔傳位：說書人從選項裏挑一個（座位號 + 角色牌）
function decideCard(ctx, step) {
  const s = ctx.state, d = step.decide, key = step.id + (d.role || d.kind);
  const cur = d.options.some(o => o.id === choices[key]) ? choices[key] : null;
  if (d.kind === 'ability') return h('div', { class: 'card focus infocard free' },
    head(s, step),
    h('div', { class: 'frm big' }, (step.picks || []).length > 0 && [w({ imp: '想殺', monk: '保護' }[step.roleId] || '選了', 'ink'),
      step.picks.map(id => seatBadge(s, id)), h('i', { class: 'op-sep' })], seatBadge(s, d.targetId), named(d.role), w(d.why, 'evil')),
    // 酒鬼只有「無效」一個選項
    h('div', { class: 'row' }, d.options.map((o, i) => B(o.label, () => ctx.st('decide', { choice: o.id }), i ? '' : 'primary', d.options.length === 1))));
  const face = o => {
    const seat = s.seats.find(x => x.id === o.id);
    return seat ? [seatBadge(s, seat.id), mini(seat.role)] : icon('none');
  };
  const lead = d.kind === 'mayor' ? [w('惡魔殺', 'bad'), seatBadge(s, d.targetId), named('mayor'), w('換誰死？', 'ink')]
    : [w('誰成為', 'ink'), named('imp'), w('？', 'ink')];
  return h('div', { class: 'card focus infocard' },
    head(s, step),
    h('div', { class: 'frm big' }, lead),
    h('div', { class: 'opt-row' }, d.options.map(o => h('button', {
      class: 'opt-tile' + (cur === o.id ? ' on' : ''), title: o.label, onclick: () => { choices[key] = o.id; ctx.render(); },
    }, face(o)))),
    h('button', { class: 'btn primary wide' + (cur ? '' : ' disabled'), 'data-hot': '1', onclick: () => cur && ctx.st('decide', { choice: cur }) }, '確定'));
}
