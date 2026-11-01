// 設置（「⋯」菜單裏）：音效、音樂各一條音量，點喇叭靜音；煙花、煙花聲。都記在本機
import { h, modal } from './ui.js';
import { icon } from './glyph.js';
import { prefs, setPref, play } from './sfx.js';

export function openSettings(ctx) {
  const p = prefs();
  const row = (ico, label, input) => h('label', { class: 'set-row' }, icon(ico), h('span', {}, label), input);
  const sw = (on, fn) => h('input', { type: 'checkbox', class: 'switch', checked: on || null, onchange: e => fn(e.target.checked) });
  // 一條音量：點喇叭靜音，拖滑塊順手打開
  const volume = (label, on, key, preview) => {
    const mute = h('button', { class: 'btn sm ghost icon-only', onclick: () => turn(!prefs()[on]) });
    const bar = h('input', { type: 'range', min: 0, max: 100, value: Math.round(p[key] * 100), 'aria-label': label,
      oninput: e => { setPref(key, e.target.value / 100); turn(true); }, onchange: preview });
    const paint = () => { mute.replaceChildren(icon(prefs()[on] ? 'sound' : 'mute')); mute.title = prefs()[on] ? '靜音' : '打開'; bar.classList.toggle('off', !prefs()[on]); };
    const turn = v => { if (prefs()[on] === v) return; setPref(on, v); paint(); ctx.render(); };
    paint();
    return h('div', { class: 'set-row' }, mute, h('span', {}, label), bar);
  };
  modal('設置', h('div', { class: 'settings' },
    volume('音效音量', 'sfx', 'vol', () => play('stamp')),
    volume('音樂音量', 'music', 'musicVol'),
    row('firework', '煙花', sw(p.fw, v => setPref('fw', v))),
    row('firework', '煙花聲', sw(p.fwSound, v => setPref('fwSound', v)))));
}
