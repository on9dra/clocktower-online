// 單人試玩（?solo）的測試條：換劇本、角色重開，讓機器人提名、結束白天。普通房間不出現
import { h } from './ui.js';
import { ROLES, SCRIPTS } from './roles.js';
import { COMMUNITY } from './community.js';
import { B } from './flow.js';

// 能選的劇本：內置的，加上能智能推進的社區劇本。手動局機器人說書人跑不了
const scripts = () => [...Object.keys(SCRIPTS).filter(id => id !== 'custom').map(id => ({ id, ...SCRIPTS[id] })),
  ...COMMUNITY.filter(c => c.auto).map(c => ({ ...c, id: 'c' + c.id }))];
const roomScript = s => (s.scriptId === 'custom' ? 'c' + COMMUNITY.find(c => c.name === SCRIPTS.custom?.name)?.id : s.scriptId);

let role = '', picked = null; // picked：測試條上選的劇本（只算這個房間）
export function soloBar(ctx) {
  const s = ctx.state;
  if (!s.solo) return null;
  const day = s.phase === 'day' && !s.nomination, list = scripts();
  const script = picked?.code === s.code ? picked.id : roomScript(s), roles = list.find(x => x.id === script)?.roles || s.solo;
  return h('div', { class: 'peekbar solobar', 'data-key': 'solo', 'data-exit': true },
    h('select', { 'data-key': 'solo-script', title: '劇本', onchange: e => { picked = { code: s.code, id: e.target.value }; role = ''; ctx.render(); } },
      list.map(x => h('option', { value: x.id, selected: x.id === script }, x.name))),
    // 換了劇本是另一張角色表：整個換掉，不留上一本選中的那一項
    h('select', { 'data-key': 'solo-role-' + script, title: '角色', onchange: e => { role = e.target.value; } },
      h('option', { value: '', selected: !role }, '隨機'),
      roles.map(id => h('option', { value: id, selected: id === role }, ROLES[id]?.name || id))),
    B('重開', () => ctx.solo('restart', { role, script }), 'sm'),
    B('提名', () => ctx.solo('nominate'), 'sm' + (day ? '' : ' disabled')),
    B('天黑', () => ctx.solo('dusk'), 'sm' + (day ? '' : ' disabled')));
}
