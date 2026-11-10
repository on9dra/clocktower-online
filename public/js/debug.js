// 測試服的調試工具（服務器開了 BOTC_DEBUG 才有）：大廳左上角的「調試模式」勾選；勾上以後建的房間、回到的自己主持的房間裏，
// 頂欄的身份換成一個按鈕——換成任意座位的身份（看到的、能做的都和那位玩家一樣）、加減機器人、自己在座位上時機器人代為主持
import { h, menu } from './ui.js';
import { icon, mini } from './glyph.js';
import { ROLES } from './roles.js';

const KEY = 'botc.debug';
export const debugWanted = ls => ls.get(KEY) === '1';
export const asKey = code => 'botc.dbg.as.' + code; // 刷新、斷線重連後回到原來那個座位的身份

// 大廳：服務器說了是測試服才插進來（大廳畫出來時還沒連上），從紙上蓋下來
export function debugBox(ls) {
  const box = h('input', { type: 'checkbox', checked: debugWanted(ls), onchange: () => ls.set(KEY, box.checked ? '1' : '0') });
  return h('label', { class: 'dbg-box' }, box, h('i', { class: 'dbg-tick' }, icon('check')), h('span', {}, '調試模式'));
}

const who = (s, id) => {
  const i = s.seats.findIndex(x => x.id === id);
  return i < 0 ? [icon('quill', 'dbg-ico'), h('span', { class: 'dbg-name' }, '說書人')] : [h('b', { class: 'sb' }, i + 1), h('span', { class: 'dbg-name' }, s.seats[i].name)];
};
export function debugWho(ctx) {
  const s = ctx.state;
  return h('button', { class: 'btn sm ghost dbg-who', title: '切換身份', onclick: e => debugMenu(ctx, e.currentTarget) },
    h('i', { class: 'dbg-tag' }, '調試'), who(s, s.debug.as));
}

// 菜單：說書人、每個座位（角色，夜裏輪到誰），準備階段加減機器人，最後是代為主持的開關
function debugMenu(ctx, anchor) {
  const s = ctx.state, d = s.debug, n = s.seats.length, lobby = s.phase === 'lobby';
  const bots = d.seats.filter(x => x.bot).length, add = lobby && !s.oneDevice && n < d.max;
  const row = (id, extra) => h('span', { class: 'dbg-row' + ((d.as || null) === id ? ' cur' : '') }, who(s, id), extra,
    d.turn && d.turn === id && h('i', { class: 'dbg-turn' }, icon('moon')));
  const role = x => {
    const r = d.seats.find(y => y.id === x.id);
    return r?.role && h('span', { class: 'dbg-role' }, mini(r.role), r.fake && mini(r.fake, 'fake'), h('small', {}, ROLES[r.role]?.name));
  };
  menu(anchor, '切換身份', [
    { label: row(null), onclick: () => ctx.dbgAs(null) },
    ...s.seats.map(x => ({ label: row(x.id, role(x)), onclick: () => ctx.dbgAs(x.id) })),
    '-',
    add && { label: '加 1 個機器人', onclick: () => ctx.st('addBots', { n: 1 }) },
    ...(add ? [5, 7, 10, 15].filter(k => k > n + 1 && k <= d.max).map(k => ({ label: `機器人坐滿 ${k} 人`, onclick: () => ctx.st('addBots', { n: k - n }) })) : []),
    lobby && bots > 0 && { label: `移除 ${bots} 個機器人`, onclick: () => ctx.st('removeBots') },
    '-',
    { label: h('span', { class: 'dbg-row' + (d.auto ? ' on' : '') }, h('i', { class: 'dbg-tick' }, icon('check')), '離席時自動主持'),
      onclick: () => ctx.st('dbgAuto', { on: !d.auto }) },
  ]);
}

// 鍵盤：數字鍵換座位，0 換回說書人。10 號以上的連按兩位（1 → 2 就是 12 號）
let buf = '', bufT = null;
export function debugKey(ctx, key) {
  const s = ctx.state;
  if (!s?.debug || !/^[0-9]$/.test(key)) return false;
  clearTimeout(bufT);
  buf += key;
  const go = () => {
    const k = Number(buf);
    buf = '';
    if (k === 0) ctx.dbgAs(null);
    else if (s.seats[k - 1]) ctx.dbgAs(s.seats[k - 1].id);
  };
  if (buf === '0' || buf.length > 1 || Number(buf) * 10 > s.seats.length) go();
  else bufT = setTimeout(go, 450);
  return true;
}
