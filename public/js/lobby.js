// 大廳：字標 + 一句話，一條加入房間的表單，說書人建房，底下是小鎮，最近去過的房間是插在屋頂上的旗子。app.js 和演示頁共用
import { h, toast } from './ui.js';
import { icon } from './glyph.js';
import { getLang, setLang } from './lang.js';
import { skyLife, townLife } from './ambient.js';

// 最近的房間記在本機（最多 5 個）：{ code, inst }
const KEY = 'botc.recent';
export function recentRooms(ls) {
  try { const v = JSON.parse(ls.get(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function rememberRoom(ls, room) {
  ls.set(KEY, JSON.stringify([room, ...recentRooms(ls).filter(x => x.code !== room.code)].slice(0, 5)));
}
export function forgetRoom(ls, code) {
  ls.set(KEY, JSON.stringify(recentRooms(ls).filter(x => x.code !== code)));
}

export const langButton = cls => h('button', { class: cls, title: '切換繁體 / 簡體',
  onclick: () => { setLang(getLang() === 'sc' ? 'tc' : 'sc'); location.reload(); } }, getLang() === 'sc' ? '繁體' : '简体');

// 房間現在走到哪：準備 / 夜 / 白天 / 已結束
const PHASE = { lobby: [null, '準備中'], night: ['moon', '夜晚'], dawn: ['sun', '白天'], day: ['sun', '白天'], ended: ['trophy', '已結束'] };
// 旗子沿小鎮均勻插開（--x）；手機上排成一行
export function recentList(rooms, onPick) {
  if (!rooms.length) return null;
  return h('div', { class: 'recent' },
    rooms.map((r, i) => {
      const [ico, text] = PHASE[r.phase] || PHASE.lobby;
      return h('button', { class: 'recent-room', title: `回到 ${r.code} 號房間`, style: { '--x': (i + 1) / (rooms.length + 1) * 100 + '%' }, onclick: () => onPick(r) },
        h('b', { class: 'rr-code' }, r.code),
        h('span', { class: 'rr-phase ph-' + r.phase }, ico && icon(ico), text),
        h('span', { class: 'rr-n' }, r.n, ' 人'),
        r.st ? h('span', { class: 'rr-st' }, icon('quill'), '說書人') : h('span', { class: 'rr-pl' }, '玩家'));
    }));
}

// 房間號：四個連成一排的小方格，上面疊一個看不見的真輸入框（粘貼、刪除照常），數字從左往右一格格填，下一格閃光標。
// 不設 maxlength：粘貼「房間 5179」這類帶別的字的也能留下 4 位數字
export function codeBox(input) {
  const cells = [0, 1, 2, 3].map(() => h('i'));
  const sync = () => {
    const v = input.value.replace(/\D/g, '').slice(0, 4);
    if (v !== input.value) input.value = v;
    const on = document.activeElement === input;
    cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('cur', on && i === v.length); });
  };
  ['input', 'focus', 'blur'].forEach(k => input.addEventListener(k, sync));
  sync();
  return h('label', { class: 'code-box' }, cells, input);
}

// recent：服務器確認還在的最近房間（帶 phase、n），onPick 回到它；onIntro 重新打開第一次來時的介紹；onAbout 打開關於（投喂、反饋、分享、說明）
export function renderLobby({ code = '', name = '', recent = [], onJoin, onCreate, onPick, onIntro, onAbout }) {
  const codeIn = h('input', { value: code, inputmode: 'numeric', autocomplete: 'off', 'aria-label': '房間號' });
  const nameIn = h('input', { value: name, maxlength: 12 });
  const join = () => {
    if (!/^\d{4}$/.test(codeIn.value.trim())) return toast('請輸入 4 位房間號');
    if (!nameIn.value.trim()) return toast('請輸入暱稱');
    onJoin(codeIn.value.trim(), nameIn.value.trim());
  };
  // 房間號裏回車：暱稱已填就直接加入，沒填就跳到暱稱
  codeIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) (nameIn.value.trim() ? join() : nameIn.focus()); };
  nameIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) join(); };
  return h('div', { class: 'lobby' },
    skyLife('night'),
    h('header', { class: 'lobby-head' },
      h('h1', { class: 'title' }, '血染鐘樓'), h('span', { class: 'lobby-seal' }, '線上魔典'),
      h('p', { class: 'lobby-tag' }, '快速、簡約、精美的線上魔典')),
    h('nav', { class: 'lang-lobby' }, onIntro && h('button', { class: 'btn sm ghost', onclick: onIntro }, '介紹'),
      onAbout && h('button', { class: 'btn sm ghost', onclick: onAbout }, '關於'), langButton('btn sm ghost')),
    h('div', { class: 'lobby-forms' },
      h('div', { class: 'join' }, h('div', { class: 'join-k' }, '我是玩家'),
        h('div', { class: 'field' }, h('span', { class: 'field-k' }, '房間號'), codeBox(codeIn)),
        h('label', { class: 'field' }, h('span', { class: 'field-k' }, '暱稱'), nameIn),
        h('button', { class: 'btn primary', onclick: join }, '加入房間')),
      h('div', { class: 'st-line' }, '我是說書人', h('button', { class: 'btn', onclick: onCreate }, '創建房間'))),
    recentList(recent, onPick),
    h('div', { class: 'lobby-town', 'aria-hidden': 'true' }, townLife()));
}
