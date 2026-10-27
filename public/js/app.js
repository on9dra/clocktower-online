// 入口：連接、身份持久化、大廳、整體渲染
import { h, toast, closeModal, morph, closeMenu } from './ui.js';
import { renderTown } from './town.js';
import { renderSide, sideCollapsed, renderChatWins, closeSheet } from './side.js';
import { stFlow, playerFlow } from './flow.js';
import { sel, stopSelect } from './town.js';
import { topbar } from './topbar.js';
import { onState, ensureScene, setRender, heldView } from './fx.js';
import { renderHud, onInfo } from './hud.js';
import { getLang, setLang, tr } from './lang.js';
import { onEggs } from './egg.js';

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隱私模式 */ } },
};
const params = new URLSearchParams(location.search);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let pid = LS.get('botc.pid');
if (!pid) { pid = newId(); LS.set('botc.pid', pid); }
// ?as=player：每個標籤頁一個獨立玩家（方便一個人在同一瀏覽器裏測試）
if (params.get('as') === 'player') {
  try { pid = sessionStorage.getItem('botc.pid') || newId(); sessionStorage.setItem('botc.pid', pid); } catch { /* 忽略 */ }
}
// 說書人恢復鏈接（?room=1234&st=密鑰）：記下密鑰，再從地址欄去掉
if (params.get('room') && params.get('st')) { LS.set('botc.st.' + params.get('room'), params.get('st')); params.delete('st'); }
document.title = tr(document.title);

const sock = io();
let session = null, chat = [];
const done = res => r => { if (!r.ok) toast(r.error); res(r); };
export const ctx = {
  state: null, ls: LS, offset: 0,
  now: () => Date.now() + ctx.offset, // 與服務器對齊的時間（計票時鐘用）
  st: (op, args = {}) => new Promise(res => sock.emit('st:op', { op, ...args }, done(res))),
  act: (act, args = {}) => {
    // 說書人代入視角時只能看，不能替玩家操作
    if (ctx.state && ctx.state.peek) { toast('代入視角中只能查看'); return Promise.resolve({ ok: false }); }
    return new Promise(res => sock.emit('pl:act', { act, ...args }, done(res)));
  },
  peek: seatId => new Promise(res => sock.emit('st:peek', { seatId }, done(res))),
  render, leave,
};

function setUrl(code) {
  const u = new URL(location.href);
  u.search = code ? `?room=${code}` + (params.get('as') ? `&as=${params.get('as')}` : '') : '';
  history.replaceState(null, '', u);
}
function enter(code, st) { session = { code, st }; setUrl(code); }

function joinPlayer(code, name) {
  LS.set('botc.name', name);
  sock.emit('pl:join', { code, pid, name }, r => (r.ok ? enter(code, false) : (toast(r.error), lobby(code))));
}
function resume() {
  const code = (session && session.code) || params.get('room');
  if (!code) return lobby();
  const key = params.get('as') === 'player' ? null : LS.get('botc.st.' + code);
  if (key) return sock.emit('st:join', { code, stKey: key }, r => (r.ok ? enter(code, true) : (toast(r.error), lobby())));
  const name = LS.get('botc.name');
  return name ? joinPlayer(code, name) : lobby(code);
}

function lobby(code = params.get('room') || '') {
  ctx.state = ctx.live = null;
  ensureScene();
  document.body.dataset.phase = 'lobby';
  const codeIn = h('input', { placeholder: '房間號', value: code, maxlength: 4, inputmode: 'numeric' });
  const nameIn = h('input', { placeholder: '你的暱稱', value: LS.get('botc.name') || '', maxlength: 12 });
  const join = () => {
    if (!/^\d{4}$/.test(codeIn.value.trim())) return toast('請輸入 4 位房間號');
    if (!nameIn.value.trim()) return toast('請輸入暱稱');
    joinPlayer(codeIn.value.trim(), nameIn.value.trim());
  };
  const create = () => sock.emit('st:create', {}, r => { LS.set('botc.st.' + r.code, r.stKey); enter(r.code, true); });
  nameIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) join(); };
  document.getElementById('app').replaceChildren(h('div', { class: 'lobby' },
    h('div', { class: 'title' }, '血染鐘樓'),
    h('div', { class: 'muted' }, '線上魔典 · 自動推進流程'),
    h('div', { class: 'card' }, h('div', { class: 'card-k' }, '我是玩家'), codeIn, nameIn,
      h('button', { class: 'btn primary wide', onclick: join }, '加入房間')),
    h('div', { class: 'card' }, h('div', { class: 'card-k' }, '我是說書人'),
      h('p', { class: 'muted' }, '創建房間後把房間號發給朋友，人齊了一鍵開局。'),
      h('button', { class: 'btn wide', onclick: create }, '創建房間')),
    langButton('btn sm ghost lang-lobby')));
}

const langButton = cls => h('button', { class: cls, title: '切換繁體 / 簡體',
  onclick: () => { setLang(getLang() === 'sc' ? 'tc' : 'sc'); location.reload(); } }, getLang() === 'sc' ? '繁體' : '简体');

function render() {
  // 開新局拉幕時，幕布合上之前畫的還是上一局（fx.js heldView）
  if (ctx.live) ctx.state = heldView() || ctx.live;
  const s = ctx.state;
  if (!s) return;
  const app = document.getElementById('app');
  const atBottom = {};
  app.querySelectorAll('[data-scroll]').forEach(el => { atBottom[el.dataset.scroll] = el.scrollHeight - el.scrollTop - el.clientHeight < 30; });
  const dock = s.isSt ? stFlow(ctx) : playerFlow(ctx); // 先算操作塢：玩家的選人狀態在這裏建立，桌面要用到
  const side = renderSide(ctx);
  const tree = h('div', { class: `game phase-${s.phase}` + (s.isSt ? ' is-st' : '') + (sideCollapsed(ctx) ? ' side-min' : '') },
    topbar(ctx),
    h('main', { class: 'board' }, s.peek && h('div', { class: 'peekbar' }, `正在以 ${s.peek.label} 的視角查看（只讀）`,
      h('button', { class: 'btn sm primary', onclick: () => ctx.peek(null) }, '返回說書人視角')),
    renderHud(ctx), renderTown(ctx), renderChatWins(ctx)), dock, side);
  const cur = app.firstElementChild;
  if (cur && cur.classList.contains('game')) morph(cur, tree); else app.replaceChildren(tree);
  // 聊天、日誌：原本停在底部的保持在底部，新打開的貼底列表直接滾到底
  app.querySelectorAll('[data-scroll]').forEach(el => {
    const b = atBottom[el.dataset.scroll];
    if (b || (b == null && el.dataset.stick)) el.scrollTop = el.scrollHeight;
  });
}

function leave() { session = null; params.delete('room'); setUrl(''); location.reload(); }

sock.on('state', s => {
  chat = s.chatReset ? s.chat : chat.concat(s.chat);
  if (chat.length > 600) chat = chat.slice(-600);
  s.chat = chat;
  ctx.offset = s.serverNow - Date.now();
  onInfo(ctx, s, render); onState(s); ctx.live = s; render();
  onEggs(s); // 桌面畫好之後再扔，按座位現在的位置飛
});
sock.on('connect', () => (session || params.get('room') ? resume() : lobby()));
sock.on('disconnect', () => toast('連接斷開，正在重連…'));
setRender(render);
// 計票時鐘走到下一位時重繪（數到誰、誰的手已經定下）；投票倒數、MVP 倒數每秒重繪
let clockTick = null;
setInterval(() => {
  const n = ctx.state?.nomination, c = n?.clock, m = ctx.state?.mvpVote;
  const k = c ? `${c.at}:${Math.floor((ctx.now() - c.at) / c.step)}` : n ? `t${n.paused ?? Math.ceil((n.deadline - ctx.now()) / 1000)}`
    : m && !m.done ? `m${Math.ceil((m.closesAt - ctx.now()) / 1000)}` : null;
  if (k !== clockTick) { clockTick = k; if (k) render(); }
}, 200);

// 快捷鍵：回車 = 當前主操作（帶 data-hot 的按鈕，座位旁的操作卡優先），確認框裏回車 = 確認；Esc 關閉菜單 / 彈窗 / 取消代選
document.addEventListener('keydown', e => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || !ctx.state) return;
  const t = e.target, typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
  const open = document.querySelector('.backdrop');
  if (e.key === 'Escape') {
    if (document.querySelector('.popmenu')) closeMenu();
    else if (open) closeModal();
    else if (closeSheet(ctx)) return;
    else if (sel.on && ctx.state.isSt) stopSelect(ctx);
    return;
  }
  if (e.key !== 'Enter' || typing || document.querySelector('.popmenu')) return;
  const hot = open ? open.querySelector('.btn.primary:not(.disabled)')
    : document.querySelector('.step-bubble [data-hot]:not(.disabled)') || document.querySelector('.dock [data-hot]:not(.disabled)');
  // 焦點停在別的按鈕上時也走主操作，避免回車重複點到剛剛用鼠標點過的按鈕
  e.preventDefault();
  if (hot) hot.click();
});
