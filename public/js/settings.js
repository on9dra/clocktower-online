// 設置（「⋯」菜單裏）：音效開關、音量、煙花、煙花聲、新美術，都記在本機
import { h, modal } from './ui.js';
import { icon } from './glyph.js';
import { muted, setMuted, prefs, setPref, play } from './sfx.js';

// 新美術（css/art.css 掛在 body.art 上）默認打開，關掉就是舊版
export const applyArt = () => document.body.classList.toggle('art', prefs().art);

export function openSettings(ctx) {
  const p = prefs();
  const row = (ico, label, input) => h('label', { class: 'set-row' }, icon(ico), h('span', {}, label), input);
  const sw = (on, fn) => h('input', { type: 'checkbox', class: 'switch', checked: on || null, onchange: e => fn(e.target.checked) });
  modal('設置', h('div', { class: 'settings' },
    row('sound', '音效', sw(!muted(), v => { setMuted(!v); ctx.render(); })),
    row('sound', '音量', h('input', { type: 'range', min: 0, max: 100, value: Math.round(p.vol * 100),
      oninput: e => setPref('vol', e.target.value / 100), onchange: () => play('pop') })),
    row('firework', '煙花', sw(p.fw, v => setPref('fw', v))),
    row('firework', '煙花聲', sw(p.fwSound, v => setPref('fwSound', v))),
    row('art', '新美術', sw(p.art, v => { setPref('art', v); applyArt(); }))));
}
