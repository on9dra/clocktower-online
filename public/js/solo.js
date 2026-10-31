// 單人試玩（?solo）的測試條：換角色重開、讓機器人提名、結束白天。普通房間不出現
import { h } from './ui.js';
import { ROLES } from './roles.js';
import { B } from './flow.js';

let role = '';
export function soloBar(ctx) {
  const s = ctx.state;
  if (!s.solo) return null;
  const day = s.phase === 'day' && !s.nomination;
  return h('div', { class: 'peekbar solobar', 'data-key': 'solo', 'data-exit': true },
    h('select', { 'data-key': 'solo-role', onchange: e => { role = e.target.value; } },
      h('option', { value: '', selected: !role }, '隨機'),
      s.solo.map(id => h('option', { value: id, selected: id === role }, ROLES[id]?.name || id))),
    B('重開', () => ctx.solo('restart', { role }), 'sm primary'),
    B('提名', () => ctx.solo('nominate'), 'sm' + (day ? '' : ' disabled')),
    B('天黑', () => ctx.solo('dusk'), 'sm' + (day ? '' : ' disabled')));
}
