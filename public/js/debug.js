// 測試服的調試工具（服務器開了 BOTC_DEBUG 才有）：大廳左上角的「調試模式」勾選；勾上以後建的房間、回到的自己主持的房間裏，
// 頂欄的身份換成一個按鈕——換成任意座位的身份（看到的、能做的都和那位玩家一樣）、自己在座位上時機器人代為主持。
// 勾了調試模式，下面再出來一個「機器人不自動選」：機器人不替人選、不投票，要換成那個座位的身份自己選了才往下走。
// 加減機器人不在這裏：準備階段圓桌中央（flow.js botConfig），正式服也有
import { h, menu } from './ui.js';
import { icon, mini } from './glyph.js';
import { ROLES } from './roles.js';
import { unseenOf } from './hud.js';

const KEY = 'botc.debug', MANUAL = 'botc.debug.manual';
export const debugWanted = ls => ls.get(KEY) === '1';
export const manualWanted = ls => debugWanted(ls) && ls.get(MANUAL) === '1';
export const asKey = code => 'botc.dbg.as.' + code; // 刷新、斷線重連後回到原來那個座位的身份

// 大廳：服務器說了是測試服才插進來（大廳畫出來時還沒連上），從紙上蓋下來
export function debugBox(ls) {
  const tick = (key, text, cls = '') => {
    const box = h('input', { type: 'checkbox', checked: ls.get(key) === '1', onchange: () => ls.set(key, box.checked ? '1' : '0') });
    return h('label', { class: 'dbg-box' + cls }, box, h('i', { class: 'dbg-tick' }, icon('check')), h('span', {}, text));
  };
  return h('div', { class: 'dbg-boxes' }, tick(KEY, '調試模式'), tick(MANUAL, '機器人不自動選', ' sub'));
}

const who = (s, id) => {
  const i = s.seats.findIndex(x => x.id === id);
  return i < 0 ? [icon('quill', 'dbg-ico'), h('span', { class: 'dbg-name' }, '說書人')] : [h('b', { class: 'sb' }, i + 1), h('span', { class: 'dbg-name' }, s.seats[i].name)];
};
// 說書人那邊在等人處理（玩家的請求、裁定，夜裏輪到說書人點），又沒有機器人代班：代入座位時頂欄上亮一個點，提醒換回去
const stWaits = d => !!d.as && !d.auto && (d.st > 0 || d.stNight);
export function debugWho(ctx) {
  const s = ctx.state, d = s.debug;
  // data-key 跟著身份：換了身份，按鈕當作新的登場一次（hud.css dbg-swap），一眼看到「現在是誰」換了
  return h('button', { class: 'btn sm ghost dbg-who', 'data-key': 'dbg-' + (d.as || 'st'), title: '切換身份', onclick: e => debugMenu(ctx, e.currentTarget) },
    h('i', { class: 'dbg-tag' }, '調試'), who(s, d.as), stWaits(d) && h('i', { class: 'dbg-ping', 'data-key': 'ping' }));
}

// 菜單：說書人、每個座位（角色，夜裏輪到誰），最後是代為主持的開關
function debugMenu(ctx, anchor) {
  const s = ctx.state, d = s.debug;
  // 死了的座位：骷髏、淡一點（代入的玩家夜裏還看不到今晚的死者，這裏是真實的）
  const dead = id => !!id && !!d.seats.find(y => y.id === id)?.dead;
  // 每個座位的狀態：死了、夜裏輪到他、舉手（亮的舉著，淡的還能舉）、幾條私密信息沒看過；說書人那行：等著處理的請求、裁定
  const info = id => d.seats.find(y => y.id === id);
  const row = (id, extra) => {
    const x = id && info(id), n = x ? unseenOf(ctx, s, id, x.info) : d.st, hand = x?.hand;
    return h('span', { class: 'dbg-row' + ((d.as || null) === id ? ' cur' : '') + (dead(id) ? ' dead' : '') }, who(s, id), extra,
      h('span', { class: 'dbg-marks' },
        dead(id) && h('i', { class: 'dbg-turn dbg-dead' }, icon('skull')),
        ((d.turn && d.turn === id) || (!id && d.stNight)) && h('i', { class: 'dbg-turn' }, icon('moon')),
        hand && h('i', { class: 'dbg-turn dbg-hand ' + hand }, icon('hand')),
        n > 0 && h('i', { class: 'dbg-new' }, n)));
  };
  const role = x => {
    const r = d.seats.find(y => y.id === x.id);
    return r?.role && h('span', { class: 'dbg-role' }, mini(r.role), r.fake && mini(r.fake, 'fake'), h('small', {}, ROLES[r.role]?.name));
  };
  menu(anchor, '切換身份', [
    { label: row(null), onclick: () => ctx.dbgAs(null) },
    ...s.seats.map(x => ({ label: row(x.id, role(x)), onclick: () => ctx.dbgAs(x.id) })),
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
