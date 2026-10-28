// 大廳：加入 / 創建房間、最近去過的房間、對局截圖輪播。app.js 和演示頁共用
import { h, toast } from './ui.js';
import { icon } from './glyph.js';
import { getLang, setLang } from './lang.js';

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
function recentList(rooms, onPick) {
  if (!rooms.length) return null;
  return h('div', { class: 'card recent' }, h('div', { class: 'card-k' }, '最近的房間'),
    rooms.map(r => {
      const [ico, text] = PHASE[r.phase] || PHASE.lobby;
      return h('button', { class: 'recent-room', onclick: () => onPick(r) },
        h('b', { class: 'rr-code' }, r.code),
        h('span', { class: 'rr-phase ph-' + r.phase }, ico && icon(ico), text),
        h('span', { class: 'rr-n' }, r.n, ' 人'),
        h('span', { class: 'grow' }),
        r.st ? h('span', { class: 'rr-st' }, icon('quill'), '說書人') : h('span', { class: 'rr-pl' }, '玩家'));
    }));
}

// recent：服務器確認還在的最近房間（帶 phase、n），onPick 回到它
export function renderLobby({ code = '', name = '', recent = [], onJoin, onCreate, onPick }) {
  const codeIn = h('input', { placeholder: '房間號', value: code, maxlength: 4, inputmode: 'numeric' });
  const nameIn = h('input', { placeholder: '你的暱稱', value: name, maxlength: 12 });
  const join = () => {
    if (!/^\d{4}$/.test(codeIn.value.trim())) return toast('請輸入 4 位房間號');
    if (!nameIn.value.trim()) return toast('請輸入暱稱');
    onJoin(codeIn.value.trim(), nameIn.value.trim());
  };
  nameIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) join(); };
  return h('div', { class: 'lobby' },
    h('header', { class: 'lobby-head' },
      h('h1', { class: 'title' }, '血染鐘樓'), h('span', { class: 'lobby-seal' }, '線上魔典'),
      h('div', { class: 'muted' }, '開局、發信息、數票，交給魔典')),
    h('div', { class: 'lobby-forms' },
      recentList(recent, onPick),
      h('div', { class: 'card' }, h('div', { class: 'card-k' }, '我是玩家'), codeIn, nameIn,
        h('button', { class: 'btn primary wide', onclick: join }, '加入房間')),
      h('div', { class: 'card' }, h('div', { class: 'card-k' }, '我是說書人'),
        h('p', { class: 'muted' }, '建好房間，把房間號發給朋友，人齊了一鍵開局。'),
        h('button', { class: 'btn wide', onclick: onCreate }, '創建房間')),
      langButton('btn sm ghost lang-lobby')),
    shots());
}

// 大廳的對局截圖（演示頁截的真實界面，tools/shots.sh 重出）：三張輪播，點標籤直接看那一張
const SHOTS = [['start', '一鍵開局'], ['info', '自動發信息'], ['vote', '投票數票']];
function shots() {
  let at = 0, timer = null;
  const imgs = SHOTS.map(([k, t], i) => h('img', { src: `img/shots/${k}.webp`, alt: t, width: 1000, height: 625, class: i ? '' : 'on' }));
  const tabs = SHOTS.map(([, t], i) => h('button', { class: 'shot-tab' + (i ? '' : ' on'), onclick: () => { show(i); play(); } }, t));
  const show = i => { at = i; imgs.forEach((el, k) => el.classList.toggle('on', k === i)); tabs.forEach((el, k) => el.classList.toggle('on', k === i)); };
  const fig = h('figure', { class: 'shots' }, h('div', { class: 'shot-imgs' }, imgs), h('nav', { class: 'shot-tabs' }, tabs));
  const play = () => { clearInterval(timer); timer = setInterval(() => (fig.isConnected ? show((at + 1) % SHOTS.length) : clearInterval(timer)), 4500); };
  play();
  return fig;
}
