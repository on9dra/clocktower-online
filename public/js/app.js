// 入口：連接、身份持久化、大廳、整體渲染
import { h, toast, closeModal, morph, closeMenu, leaveDom } from './ui.js';
import { renderTown } from './town.js';
import { renderSide, sideCollapsed, closeSheet, resetSide } from './side.js';
import { syncPrompt, syncStPick } from './flow.js';
import { progressBar } from './progress.js';
import { sel, stopSelect, fitTableCard, arrowFit } from './town.js';
import { syncSetup, closePick } from './setup.js';
import { closeRolePanel } from './rolepick.js';
import { topbar } from './topbar.js';
import { onState, ensureScene, setRender, heldView, intoRoom, backToLobby, resetFx } from './fx.js';
import { renderHud, renderBluffs, onInfo } from './hud.js';
import { installScript } from './roles.js';
import { trimChat } from './infofmt.js';
import { closeAct } from './manual.js';
import { onEggs } from './egg.js';
import { renderLobby, recentList, recentRooms, rememberRoom, forgetRoom } from './lobby.js';
import { openInvite } from './invite.js';
import { showIntro, introSeen } from './intro.js';
import { openAbout } from './about.js';
import { heraldSync, resetHerald } from './herald.js';
import { askPass } from './roompass.js';
import { countPop } from './trial.js';
import { chime, locked, wake, loadSfx } from './sfx.js';
import { setBgm } from './bgm.js';
import { veiled, noteArrival } from './veil.js';
import { closePass } from './pass.js';
import { keepAwake } from './wake.js';

await window.boot.css; // 開屏（index.html）把樣式表掛上之後再開始畫
Object.assign(window.boot, { locked, chime: ms => chime('night', ms) }); // 開屏結束時鐘響兩下，和音波同拍
wake();

// 本機記錄。存不進去（Safari 無痕、關了存儲的 WebView）時記在內存裏：這一頁裏斷線重連，說書人密鑰、輸過的房間密碼都還在，刷新才丟。
// 存進去了就以 localStorage 為準（別的標籤頁刪掉的不會被內存裏的舊值頂回來）
const mem = new Map();
const LS = {
  get: k => { if (mem.has(k)) return mem.get(k); try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); mem.delete(k); } catch { mem.set(k, String(v)); } },
  del: k => { mem.delete(k); try { localStorage.removeItem(k); } catch { /* 隱私模式 */ } },
};
const params = new URLSearchParams(location.search);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let pid = LS.get('botc.pid');
if (!pid) { pid = newId(); LS.set('botc.pid', pid); }
// 說書人恢復鏈接（?room=1234&st=密鑰）：記下密鑰，再從地址欄去掉
if (params.get('room') && params.get('st')) { LS.set('botc.st.' + params.get('room'), params.get('st')); params.delete('st'); }
// 說書人發的換設備鏈接（?room=1234&r=…&seat=…）：連上後接過那個座位
let claimToken = params.get('seat');
params.delete('seat');

const sock = io();
let session = null, chat = [], fresh = false, dealt = null; // session：{ code, inst, st }；fresh：剛建好房間，桌面擺好（dealt）時彈邀請
let linked = false, everOn = false; // linked：這個連接已經（重新）進了房間；everOn：連上過服務器
const done = res => r => { if (!r.ok) toast(r.error); res(r); };
const OFF = '正在重連，請稍候', SLOW = '網絡不通，請稍後再試';
// 房間裏的操作。斷線、或者連回來還沒重新進房間時不發：socket.io 會先存著，連上後服務器還不認得這個連接，回「無權限」「未加入房間」，
// 點了等於白點。直接告訴他在重連。發出去 10 秒沒回音也算失敗，回調照樣回來，按鈕不會一直鎖著
const send = (ev, data) => new Promise(res => {
  if (!online()) { refuse(); return res({ ok: false, error: OFF }); }
  sock.timeout(10000).emit(ev, data, (err, r) => done(res)(err ? { ok: false, error: SLOW } : r));
});
export const ctx = {
  state: null, ls: LS, offset: 0,
  now: () => Date.now() + ctx.offset, // 與服務器對齊的時間（計票時鐘用）
  st: (op, args = {}) => send('st:op', { op, ...args }),
  act: (act, args = {}) => {
    // 說書人代入視角時只能看，不能替玩家操作
    if (ctx.state && ctx.state.peek) { toast('代入視角中只能查看'); return Promise.resolve({ ok: false }); }
    return send('pl:act', { act, ...args });
  },
  peek: seatId => send('st:peek', { seatId }),
  // 觀戰的人入座（準備階段有空位時）
  sit: () => session && joinPlayer(session.code, LS.get('botc.name') || '', session.inst, true),
  // 說書人解散房間
  close: () => ctx.st('close').then(r => r.ok && bye('closed')),
  // 意見反饋（關於面板）：斷線時不發（存著連上再發，人已經重寄過一封了），發出去等 8 秒
  feedback: d => new Promise(res => (sock.connected ? sock.timeout(8000).emit('feedback', d, (err, r) => res(err ? { ok: false, error: SLOW } : r)) : res({ ok: false, error: SLOW }))),
  render, leave,
};

function setUrl(code, inst) {
  const u = new URL(location.href);
  u.search = code ? `?room=${code}` + (inst ? `&r=${inst}` : '') : '';
  history.replaceState(null, '', u);
}
function enter(code, st, inst = '') {
  session = { code, st, inst };
  linked = true;
  syncNet();
  setUrl(code, inst);
  if (inst) rememberRoom(LS, { code, inst });
}

// 斷線：左上角從屏幕上沿垂下一張「重連中」紙條（壓在房間號上，斷線時它也用不著），連回來、重新進了房間才收回去。
// 一閃就連上的不出來；沒連上時點了房間裏的操作，紙條晃一下
let slip = null, slipT = null;
const online = () => sock.connected && (!session || linked);
// wait：等多久再掛出來；已經在等的不重新計時（剛連上、還沒回到房間時不會因此提前冒出來）
function syncNet(wait = 0) {
  if (online()) {
    clearTimeout(slipT); slipT = null;
    if (slip) { leaveDom(slip, 320); slip = null; }
    return;
  }
  if (slip || slipT) return;
  slipT = setTimeout(() => {
    slipT = null;
    if (online() || slip) return;
    slip = h('div', { class: 'net-off', role: 'status' }, everOn ? '重連中' : '連接中', h('i'), h('i'), h('i'));
    document.body.append(slip);
  }, wait);
}
function refuse() {
  toast(OFF);
  if (slip) slip.animate([{ rotate: '-1.5deg' }, { rotate: '4deg' }, { rotate: '-4deg' }, { rotate: '2deg' }, { rotate: '-1.5deg' }], { duration: 420, easing: 'ease-out' });
  else { clearTimeout(slipT); slipT = null; syncNet(); }
}

// 有密碼的房間：本機記著輸對過的，先用它試；不對再問。stay：觀戰的人入座，關掉密碼框還留在房間裏
const NEED_PASS = '請輸入房間密碼', BAD_PASS = '房間密碼不對';
async function joinPlayer(code, name, inst = '', stay = false) {
  window.boot.more(); // 要進房間了：對局的圖在後台補起來（開屏 index.html）
  if (name) LS.set('botc.name', name);
  const key = 'botc.pass.' + code;
  const go = pass => new Promise(res => sock.emit('pl:join', { code, inst, pid, name, pass }, res));
  const r = await go(LS.get(key) || '');
  if (r.ok) return enter(code, false, inst);
  if (r.error !== NEED_PASS && r.error !== BAD_PASS) return fail(r.error, code);
  LS.del(key);
  if (!stay) toLobby(code);
  await window.boot.out;
  askPass(async pass => {
    const t = await go(pass);
    if (t.ok) { LS.set(key, pass); enter(code, false, inst); }
    else if (t.error !== BAD_PASS) toast(t.error);
    return t.ok;
  });
}
// 進不去：回大廳，地址欄清掉（斷線重連時不再拿它重試），房間號留在輸入框裏
function toLobby(code = '') {
  session = null;
  syncNet();
  params.delete('room'); params.delete('r');
  setUrl('');
  lobby(code);
}
function fail(err, code = '') {
  toast(err);
  toLobby(code);
}
function resume() {
  const code = (session && session.code) || params.get('room');
  if (!code) return lobby();
  window.boot.more();
  const inst = (session && session.inst) || params.get('r') || '';
  if (claimToken) {
    const token = claimToken;
    claimToken = null;
    // 鏈接失效了也照常進房：有座位回座位，沒有就觀戰 / 入座
    return sock.emit('pl:claim', { code, inst, pid, token }, r => (r.ok ? enter(code, false, inst) : (toast(r.error), resume())));
  }
  const key = LS.get('botc.st.' + code);
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
  if (!session) return; // 說書人自己解散：回調和服務器的通知都會走到這裏
  forgetRoom(LS, session.code);
  if (why === 'closed') LS.del('botc.st.' + session.code);
  session = null;
  closeModal();
  params.delete('room'); params.delete('r');
  setUrl('');
  toast(BYE[why] || '已離開房間', 5000);
  lobby();
}

function lobby(code = params.get('room') || '') {
  const app = document.getElementById('app');
  // 已經在大廳（房間號不對、重新連上）：把房間號填回去就好，別的不動，不重播登場
  const here = app.querySelector(':scope > .lobby:not(.off)');
  if (here) {
    const input = here.querySelector('.lobby-forms input');
    if (code) { input.value = code; input.dispatchEvent(new Event('input')); }
    return;
  }
  const room = !!app.querySelector(':scope > .game');
  ctx.state = ctx.live = null;
  ensureScene();
  // 離開房間（解散、被移出、自己離開、進不去）：掛在 body 上、不跟著桌面走的東西也收掉——選角色的紙（收著的索引籤也算）、
  // 懸停的角色表、單設備的整屏卡、彈窗、菜單，屏幕常亮放開。不收的話它們留在大廳上面，開著的還壓暗、擋住整個大廳
  if (room) {
    resetFx(); resetSide(); resetHerald(); chat = []; sel.on = null; closeAct(ctx);
    closeMenu(); closeModal(); closeRolePanel(); closePick(); closePass(); keepAwake(false);
  }
  const create = () => {
    window.boot.more();
    sock.emit('st:create', {}, r => {
      if (!r.ok) return toast(r.error);
      LS.set('botc.st.' + r.code, r.stKey);
      fresh = true;
      enter(r.code, true, r.inst);
    });
  };
  const pick = r => { session = { code: r.code, inst: r.inst }; resume(); };
  const page = renderLobby({
    code, name: LS.get('botc.name') || '',
    // 從邀請鏈接來、第一次填暱稱：房間號沒改的話帶上鏈接裏的實例標識
    onJoin: (c, name) => joinPlayer(c, name, c === params.get('room') ? params.get('r') || '' : ''), onCreate: create,
    onPick: pick,
    onIntro: () => showIntro(LS),
    onAbout: () => openAbout(ctx),
  });
  // 控件等開屏揭開才出來；第一次來先看介紹，介紹收起才出來。
  // 從邀請鏈接來的（房間號已經填好）是來入座的，朋友在等：不先看介紹（介紹講的是給說書人的好處），也不記成看過，下次自己打開網站再看
  const show = () => page.classList.remove('pre');
  page.classList.add('pre');
  if (room) backToLobby(app, page, show);
  else {
    document.body.dataset.phase = 'lobby';
    app.replaceChildren(page);
    window.boot.out.then(() => setBgm('lobby')); // 鐘響完、小鎮揭開，大廳的音樂起來
    if (introSeen(LS) || code) window.boot.out.then(show);
    else showIntro(LS, { wait: window.boot.out, after: show });
  }
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
  if (ctx.live) ctx.state = veiled(ctx, heldView() || ctx.live); // 遮住身份時把自己的私密信息裁掉（veil.js）
  const s = ctx.state;
  if (!s) return;
  const app = document.getElementById('app');
  const atBottom = {};
  app.querySelectorAll('[data-scroll]').forEach(el => { atBottom[el.dataset.scroll] = el.scrollHeight - el.scrollTop - el.clientHeight < 30; });
  heraldSync(ctx); // 線下說書人：輪到新的一個人時先扣住這一步，整屏提示收起後桌上才出卡和選人（herald.js）
  if (!s.isSt) syncPrompt(ctx); else syncStPick(ctx); // 先建立選人狀態，桌面要用到
  const side = renderSide(ctx);
  const town = renderTown(ctx);
  const tree = h('div', { class: `game phase-${s.phase}` + (s.isSt ? ' is-st' : '') + (sideCollapsed(ctx) ? ' side-min' : '') },
    topbar(ctx),
    h('main', { class: 'board' }, s.peek && h('div', { class: 'peekbar', 'data-key': 'peek', 'data-exit': true }, `正在以 ${s.peek.label} 的視角查看（只讀）`,
      h('button', { class: 'btn sm', onclick: () => ctx.peek(null) }, '返回說書人視角')),
    renderHud(ctx), town, renderBluffs(ctx), countPop(ctx)), progressBar(ctx), side);
  const cur = app.querySelector(':scope > .game:not(.gone)');
  if (cur) morph(cur, tree); else dealt = intoRoom(app, tree);
  fitTableCard();
  if (arrowFit()) return render(); // 輪到誰的箭頭頭頂放不下：挪到頭像旁邊，趁還沒畫到屏幕上重畫一次
  syncSetup(ctx);
  // 聊天、日誌：原本停在底部的保持在底部，新打開的貼底列表直接滾到底
  app.querySelectorAll('[data-scroll]').forEach(el => {
    const b = atBottom[el.dataset.scroll];
    if (b || (b == null && el.dataset.stick)) el.scrollTop = el.scrollHeight;
  });
}

// 離開房間：斷開重連，服務器當作普通掉線（座位留著，之後可以用同一個鏈接回來）；頁面不刷新，桌面退掉，大廳接上
function leave() {
  session = null;
  params.delete('room'); params.delete('r');
  setUrl('');
  early = true;
  sock.disconnect().connect();
  lobby();
}

let stLog = [], heard = false; // heard：音效開始下了沒有
sock.on('state', s => {
  if (s.custom) installScript(s.custom); // 上傳的劇本：先把角色登記好，後面畫什麼都查得到
  chat = trimChat(s.chatReset ? s.chat : chat.concat(s.chat));
  s.chat = chat;
  if (s.st) { stLog = s.st.logFrom ? stLog.concat(s.st.log) : s.st.log; s.st.log = stLog; } // 流程日誌也是增量的
  ctx.offset = s.serverNow - Date.now();
  // 說書人用密鑰回來、舊鏈接沒帶 r 時：從狀態裏補上房間實例標識
  if (session && s.inst && session.inst !== s.inst) enter(session.code, session.st, s.inst);
  keepAwake(s.isSt && s.offline && s.phase !== 'lobby' && s.phase !== 'ended'); // 線下局說書人的設備一直擺在桌上：開局後不讓屏幕熄掉
  noteArrival(ctx, s);
  const shown = veiled(ctx, s, true); // 遮住時新信息不演出、不展開面板，按住看的時候才亮出來
  onInfo(ctx, shown, render); onState(shown); ctx.live = s; render();
  if (fresh) { fresh = false; dealt.then(() => { if (ctx.state?.venue === 'online') openInvite(ctx); }); } // 剛建好房間：先選線上 / 線下（flow.js venuePane），選了線上才亮出房間號、二維碼
  onEggs(s); // 桌面畫好之後再扔，按座位現在的位置飛
  window.boot.ready();
  // 第一次進房間：音效等桌面的圖到齊再下（開屏 boot.more），不和桌面搶帶寬
  if (!heard) { heard = true; window.boot.more().then(() => loadSfx()); }
});
// 大廳畫出來不用等連上服務器（連接要好幾個往返），點按鈕發的請求 socket.io 會存著，連上再發；邀請鏈接、回房間才要等
let early = !params.get('room');
if (early) lobby();
sock.on('connect', () => {
  everOn = true;
  syncNet(); // 在大廳的連上就算好了；在房間裏的要等重新進了房間（enter）
  if (early) { early = false; return; }
  (session || params.get('room') ? resume() : lobby());
});
// 斷線：服務器重啓、網絡斷了，socket.io 自己重連，連上後 resume() 回到房間。自己離開房間時的斷開不算
sock.on('disconnect', why => {
  linked = false;
  if (why !== 'io client disconnect') syncNet(800);
});
// 一直沒連上（服務器起不來、網絡不通）：開屏揭開幾秒後也掛出紙條，不然點什麼都沒反應
window.boot.out.then(() => syncNet(4000));
sock.on('bye', bye);
setRender(render);
// 計票倒數、投票倒數、MVP 倒數每秒重繪
let clockTick = null;
setInterval(() => {
  const n = ctx.state?.nomination, c = n?.clock, m = ctx.state?.mvpVote, f = ctx.state?.st?.step;
  const k = c ? `${c.k}:${Math.ceil((c.at + c.step - ctx.now()) / 1000)}` : n ? `t${n.paused ?? Math.ceil((n.deadline - ctx.now()) / 1000)}`
    : m && !m.done ? `m${Math.ceil((m.closesAt - ctx.now()) / 1000)}` : f?.status === 'fake' ? `f${Math.floor(ctx.now() / 500)}` : null;
  if (k !== clockTick) { clockTick = k; if (k) render(); }
}, 200);

// 快捷鍵：Esc 關閉菜單 / 彈窗 / 取消代選。回車不觸發任何操作，也不重複點焦點停著的按鈕；只有輸入框裏的回車算提交
document.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
  if (e.key === 'Enter' && !typing) { e.preventDefault(); return; }
  if (!ctx.state) { if (e.key === 'Escape') closeModal(); return; } // 大廳：Esc 關掉「關於」
  const open = document.querySelector('.backdrop:not(.leaving)'), popped = document.querySelector('.popmenu:not(.leaving)');
  if (e.key === 'Escape') {
    if (closePass()) return;
    if (popped) closeMenu();
    else if (open) closeModal();
    else if (closeSheet(ctx)) return;
    else if (closeAct(ctx)) return;
    else if (sel.on && ctx.state.isSt) stopSelect(ctx);
  }
});
