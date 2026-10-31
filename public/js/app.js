// 入口：連接、身份持久化、大廳、整體渲染
import { h, toast, closeModal, morph, closeMenu } from './ui.js';
import { renderTown } from './town.js';
import { renderSide, sideCollapsed, closeSheet } from './side.js';
import { syncPrompt } from './flow.js';
import { progressBar } from './progress.js';
import { sel, stopSelect, fitTableCard } from './town.js';
import { topbar } from './topbar.js';
import { onState, ensureScene, setRender, heldView } from './fx.js';
import { renderHud, renderBluffs, onInfo } from './hud.js';
import { installScript } from './roles.js';
import { closeCompose } from './manual.js';
import { onEggs } from './egg.js';
import { renderLobby, recentList, recentRooms, rememberRoom, forgetRoom } from './lobby.js';
import { openInvite } from './invite.js';
import { showIntro, introSeen } from './intro.js';
import { openAbout } from './about.js';

await window.boot.css; // 開屏（index.html）把樣式表掛上之後再開始畫

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隱私模式 */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* 隱私模式 */ } },
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
// 說書人發的換設備鏈接（?room=1234&r=…&seat=…）：連上後接過那個座位
let claimToken = params.get('seat');
params.delete('seat');

const sock = io();
let session = null, chat = [], fresh = false; // session：{ code, inst, st }；fresh：剛建好房間，第一次收到狀態時彈邀請
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
  // 觀戰的人入座（準備階段有空位時）
  sit: () => session && joinPlayer(session.code, LS.get('botc.name') || '', session.inst),
  // 說書人解散房間
  close: () => ctx.st('close').then(r => r.ok && bye('closed')),
  // 意見反饋（關於面板）：斷線時等 8 秒
  feedback: d => new Promise(res => sock.timeout(8000).emit('feedback', d, (err, r) => res(err ? { ok: false, error: '網絡不通，請稍後再試' } : r))),
  render, leave,
};

function setUrl(code, inst) {
  const u = new URL(location.href);
  u.search = code ? `?room=${code}` + (inst ? `&r=${inst}` : '') + (params.get('as') ? `&as=${params.get('as')}` : '') : '';
  history.replaceState(null, '', u);
}
function enter(code, st, inst = '') {
  session = { code, st, inst };
  setUrl(code, inst);
  if (inst) rememberRoom(LS, { code, inst });
}

function joinPlayer(code, name, inst = '') {
  if (name) LS.set('botc.name', name);
  sock.emit('pl:join', { code, inst, pid, name }, r => (r.ok ? enter(code, false, inst) : fail(r.error, code)));
}
// 進不去：回大廳，地址欄清掉（斷線重連時不再拿它重試），房間號留在輸入框裏
function fail(err, code = '') {
  toast(err);
  session = null;
  params.delete('room'); params.delete('r');
  setUrl('');
  lobby(code);
}
function resume() {
  const code = (session && session.code) || params.get('room');
  if (!code) return lobby();
  const inst = (session && session.inst) || params.get('r') || '';
  if (claimToken) {
    const token = claimToken;
    claimToken = null;
    // 鏈接失效了也照常進房：有座位回座位，沒有就觀戰 / 入座
    return sock.emit('pl:claim', { code, inst, pid, token }, r => (r.ok ? enter(code, false, inst) : (toast(r.error), resume())));
  }
  const key = params.get('as') === 'player' ? null : LS.get('botc.st.' + code);
  if (key) return sock.emit('st:join', { code, stKey: key }, r => {
    if (r.ok) return enter(code, true, inst);
    // 房號換了一個房間，本機記著的是舊房間的密鑰：丟掉，當玩家進
    if (r.error === '說書人密鑰錯誤') { LS.del('botc.st.' + code); return resume(); }
    fail(r.error);
  });
  const name = LS.get('botc.name');
  return name ? joinPlayer(code, name, inst) : lobby(code);
}

// 被移出、座位在別的設備上打開、房間解散：退回大廳
const BYE = { kicked: '你已被說書人移出房間', moved: '這個座位已在別的設備上打開', closed: '房間已解散' };
function bye(why) {
  if (session) { forgetRoom(LS, session.code); if (why === 'closed') LS.del('botc.st.' + session.code); }
  session = null;
  closeModal();
  params.delete('room'); params.delete('r');
  setUrl('');
  toast(BYE[why] || '已離開房間', 5000);
  lobby();
}

function lobby(code = params.get('room') || '') {
  ctx.state = ctx.live = null;
  ensureScene();
  document.body.dataset.phase = 'lobby';
  const create = () => sock.emit('st:create', {}, r => {
    if (!r.ok) return toast(r.error);
    LS.set('botc.st.' + r.code, r.stKey);
    fresh = true;
    enter(r.code, true, r.inst);
  });
  const pick = r => { session = { code: r.code, inst: r.inst }; resume(); };
  // 重畫時保留已經填了的房間號、暱稱
  const typed = i => document.querySelectorAll('.lobby-forms input')[i]?.value;
  document.getElementById('app').replaceChildren(renderLobby({
    code: typed(0) ?? code, name: typed(1) ?? (LS.get('botc.name') || ''),
    // 從邀請鏈接來、第一次填暱稱：房間號沒改的話帶上鏈接裏的實例標識
    onJoin: (c, name) => joinPlayer(c, name, c === params.get('room') ? params.get('r') || '' : ''), onCreate: create,
    onPick: pick,
    onIntro: () => showIntro(LS),
    onAbout: () => openAbout(ctx),
  }));
  // 控件等開屏揭開才出來；第一次來先看介紹，介紹收起才出來
  const page = document.querySelector('.lobby'), show = () => page.classList.remove('pre');
  page.classList.add('pre');
  if (introSeen(LS)) window.boot.out.then(show);
  else showIntro(LS, { wait: window.boot.out, after: show });
  // 最近的房間：問服務器哪些還在、走到哪了；不在的從本機記錄裏去掉
  const mine = recentRooms(LS);
  if (mine.length) sock.emit('rooms:info', { list: mine }, r => {
    if (!r.ok || ctx.state) return;
    const alive = new Map(r.list.map(x => [x.code, x]));
    for (const x of mine) if (!alive.has(x.code)) forgetRoom(LS, x.code);
    // 是不是說書人看本機有沒有這個房間的密鑰
    const list = mine.filter(x => alive.has(x.code)).map(x => ({ ...x, ...alive.get(x.code), st: !!LS.get('botc.st.' + x.code) }));
    // 只把旗子插上去，別的不動：重畫整個大廳會打斷登場、重置雲和輸入框
    if (list.length && page.isConnected) page.querySelector('.lobby-town').before(recentList(list, pick));
  });
  window.boot.ready();
}

function render() {
  // 開新局拉幕時，幕布合上之前畫的還是上一局（fx.js heldView）
  if (ctx.live) ctx.state = heldView() || ctx.live;
  const s = ctx.state;
  if (!s) return;
  const app = document.getElementById('app');
  const atBottom = {};
  app.querySelectorAll('[data-scroll]').forEach(el => { atBottom[el.dataset.scroll] = el.scrollHeight - el.scrollTop - el.clientHeight < 30; });
  if (!s.isSt) syncPrompt(ctx); // 先建立玩家的選人狀態，桌面要用到
  const side = renderSide(ctx);
  const town = renderTown(ctx);
  const tree = h('div', { class: `game phase-${s.phase}` + (s.isSt ? ' is-st' : '') + (sideCollapsed(ctx) ? ' side-min' : '') },
    topbar(ctx),
    h('main', { class: 'board' }, s.peek && h('div', { class: 'peekbar' }, `正在以 ${s.peek.label} 的視角查看（只讀）`,
      h('button', { class: 'btn sm primary', onclick: () => ctx.peek(null) }, '返回說書人視角')),
    renderHud(ctx), town, renderBluffs(ctx)), progressBar(ctx), side);
  const cur = app.firstElementChild;
  if (cur && cur.classList.contains('game')) morph(cur, tree); else app.replaceChildren(tree);
  fitTableCard();
  // 聊天、日誌：原本停在底部的保持在底部，新打開的貼底列表直接滾到底
  app.querySelectorAll('[data-scroll]').forEach(el => {
    const b = atBottom[el.dataset.scroll];
    if (b || (b == null && el.dataset.stick)) el.scrollTop = el.scrollHeight;
  });
}

function leave() { session = null; params.delete('room'); params.delete('r'); setUrl(''); location.reload(); }

sock.on('state', s => {
  if (s.custom) installScript(s.custom); // 上傳的劇本：先把角色登記好，後面畫什麼都查得到
  chat = s.chatReset ? s.chat : chat.concat(s.chat);
  if (chat.length > 600) chat = chat.slice(-600);
  s.chat = chat;
  ctx.offset = s.serverNow - Date.now();
  // 說書人用密鑰回來、舊鏈接沒帶 r 時：從狀態裏補上房間實例標識
  if (session && s.inst && session.inst !== s.inst) enter(session.code, session.st, s.inst);
  onInfo(ctx, s, render); onState(s); ctx.live = s; render();
  if (fresh) { fresh = false; openInvite(ctx); } // 剛建好房間：先把房間號、二維碼亮出來
  onEggs(s); // 桌面畫好之後再扔，按座位現在的位置飛
  window.boot.ready();
});
// 大廳畫出來不用等連上服務器（連接要好幾個往返），點按鈕發的請求 socket.io 會存著，連上再發；邀請鏈接、回房間才要等
let early = !params.get('room');
if (early) lobby();
sock.on('connect', () => {
  if (early) { early = false; return; }
  (session || params.get('room') ? resume() : lobby());
});
sock.on('disconnect', () => toast('連接斷開，正在重連…'));
sock.on('bye', bye);
setRender(render);
// 計票時鐘走到下一位時重繪（數到誰、誰的手已經定下）；投票倒數、MVP 倒數每秒重繪
let clockTick = null;
setInterval(() => {
  const n = ctx.state?.nomination, c = n?.clock, m = ctx.state?.mvpVote, f = ctx.state?.st?.step;
  const k = c ? `${c.at}:${Math.floor((ctx.now() - c.at) / c.step)}` : n ? `t${n.paused ?? Math.ceil((n.deadline - ctx.now()) / 1000)}`
    : m && !m.done ? `m${Math.ceil((m.closesAt - ctx.now()) / 1000)}` : f?.status === 'fake' ? `f${Math.floor(ctx.now() / 500)}` : null;
  if (k !== clockTick) { clockTick = k; if (k) render(); }
}, 200);

// 快捷鍵：回車 = 當前主操作（帶 data-hot 的按鈕：說書人的操作卡優先，再是圓桌中央、審判牌），確認框裏回車 = 確認；Esc 關閉菜單 / 彈窗 / 取消代選
document.addEventListener('keydown', e => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!ctx.state) { if (e.key === 'Escape') closeModal(); return; } // 大廳：Esc 關掉「關於」
  const t = e.target, typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
  const open = document.querySelector('.backdrop');
  if (e.key === 'Escape') {
    if (document.querySelector('.popmenu')) closeMenu();
    else if (open) closeModal();
    else if (closeSheet(ctx)) return;
    else if (closeCompose(ctx)) return;
    else if (sel.on && ctx.state.isSt) stopSelect(ctx);
    return;
  }
  if (e.key !== 'Enter' || typing || document.querySelector('.popmenu')) return;
  const hot = open ? open.querySelector('.btn.primary:not(.disabled)')
    : ['.st-card:not(.corner)', '.center', '.trial'].map(k => document.querySelector(k + ' [data-hot]:not(.disabled)')).find(Boolean);
  // 焦點停在別的按鈕上時也走主操作，避免回車重複點到剛剛用鼠標點過的按鈕
  e.preventDefault();
  if (hot) hot.click();
});
