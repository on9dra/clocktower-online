// 側欄：標籤頁（流程日誌、遊戲日誌、聊天、角色表）。流程操作在圓桌中央和審判牌上（flow.js）
import { h, roleToken, seatLabel, modal, closeModal, prompt2 } from './ui.js';
import { ROLES, TEAMS, SCRIPTS } from './roles.js';
import { renderLog } from './log.js';
import { renderOrder } from './manual.js';
import { renderGameLog } from './gamelog.js';
import { seatBadge, mini, tag, icon, ACTS } from './glyph.js';
import { msgHeld } from './fx.js';

// 聊天狀態按視角分開（自己 / 說書人代入的某個玩家），代入時不會串到說書人自己的未讀。
// seen：每個頻道讀到的最後一條；base：進入這個視角時的最後一條（之前的舊消息不算未讀）
// chat：聊天標籤翻到的那一頁（頻道）；focus：畫完把光標放進輸入框；drafts：每一頁沒發出去的字
// sheet：手機上側欄是底部抽屜，這裏記它開沒開（寬屏不用）
const newView = () => ({ tab: null, chat: 'all', seen: {}, base: null, focus: false, drafts: {}, sheet: false });
const views = {};
let ui = newView();
// 離開房間不刷新頁面：換一個房間，已讀、草稿都從頭算
export function resetSide() { Object.keys(views).forEach(k => delete views[k]); ui = newView(); }
const viewKey = s => (s.peek ? 'peek:' + s.peek.seatId : s.isSt ? 'st' : 'me');
const wide = () => window.matchMedia('(min-width: 861px)').matches;
// 換標籤、換頻道：新的內容淡進來
const tabIn = sel => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector(sel)?.animate({ opacity: [0, 1] }, 180); };

// 打開頻道：側欄翻到聊天標籤的那一頁（座位菜單、桌上的氣泡走這裏）
export function openChat(ctx, ch) {
  ui.tab = 'chat'; ui.chat = ch; ui.focus = wide(); ui.sheet = true;
  ctx.ls.set('botc.side', ''); ctx.render();
}
const lastSeqOf = s => s.chat.at(-1)?.seq || 0;

// 玩家自己的猜測和備註只存在本機，按房間 + 局區分（新的一局自動清空）
const key = (ctx, kind) => `botc.${kind}.${ctx.state.code}.${ctx.state.gameId}`;
const readJson = (ctx, kind) => { try { return JSON.parse(ctx.ls.get(key(ctx, kind)) || '{}'); } catch { return {}; } };
// 角色猜測：{ seatId: roleId }
export const guesses = ctx => readJson(ctx, 'guess');
// 座位備註：{ seatId: [文字] }
export const notes = ctx => readJson(ctx, 'note');
function saveNotes(ctx, n) { ctx.ls.set(key(ctx, 'note'), JSON.stringify(n)); ctx.render(); }
export function addNote(ctx, seatId) {
  prompt2(`給 ${seatLabel(ctx.state, seatId)} 加備註`, '', text => {
    if (!text) return;
    const n = notes(ctx);
    (n[seatId] ||= []).push(text);
    saveNotes(ctx, n);
  }, { max: 12, placeholder: '最多 12 個字，只有你看得到' });
}
export function clearNotes(ctx, seatId) { const n = notes(ctx); delete n[seatId]; saveNotes(ctx, n); }
// 說書人給我的信息裏帶的座位標記：{ seatId: [{ r, q, demon, t, text }] }（同樣的只留一個）
// 技能演出還沒播完的那條：標記先畫出來但看不見（held），演出量著它的位置把答案送過去，落定時正好接上
// 間諜每晚看一次魔典：只標最後一次看到的，之前的標記（含更早的信息）作廢
export function infoMarksBySeat(s) {
  let out = {}, seen = new Set();
  for (const m of s.chat) {
    if (!m.info || m.to !== s.myId) continue;
    const held = msgHeld(m);
    if ((m.f || []).some(t => t.grim)) { out = {}; seen = new Set(); }
    for (const k of m.marks || []) {
      if (held && k.t) continue; // 陣營標記會把頭像換成陣營牌，等放出來再畫
      const key = [k.seatId, k.r, k.q, k.demon, k.t, k.text].join('|');
      if (!seen.has(key)) { seen.add(key); (out[k.seatId] ||= []).push(held ? { ...k, held } : k); }
    }
  }
  return out;
}

// 自己最近這一夜的行動落在誰身上（夜裏到第二天白天都標著，下一夜換新的）：{ seatId: [角色] }。只有自己看得到
// 演出還沒播完的那條記成「~角色」：先畫出來但看不見，演出的章縮到它的位置上
export function actMarksBySeat(s) {
  const out = {};
  if (s.isSt || !s.myId) return out;
  for (const m of s.chat) {
    if (m.k !== 'act' || m.to !== s.myId || m.night !== s.night || !ACTS[m.src]) continue;
    const v = msgHeld(m) ? '~' + m.src : m.src;
    for (const t of m.f || []) {
      const list = t.s && (out[t.s] ||= []);
      if (list && !list.includes(m.src) && !list.includes('~' + m.src)) list.push(v);
    }
  }
  return out;
}
export const actMarkView = v => {
  const held = v[0] === '~', src = held ? v.slice(1) : v;
  return h('span', { class: 'pmark act ' + ACTS[src].tone + (held ? ' mk-held' : ''), 'data-act': src, title: '你今晚的行動' }, icon(ACTS[src].ico), ACTS[src].mark);
};

export function pickGuess(ctx, seatId) {
  const roles = SCRIPTS[ctx.state.scriptId].roles;
  const set = id => {
    const g = guesses(ctx);
    if (id) g[seatId] = id; else delete g[seatId];
    ctx.ls.set(key(ctx, 'guess'), JSON.stringify(g));
    closeModal(); ctx.render();
  };
  modal(`${seatLabel(ctx.state, seatId)} 可能是…（僅自己可見）`, h('div', {},
    h('div', { class: 'guess-grid' }, roles.map(id => h('div', { class: 'guess-pick', onclick: () => set(id) },
      roleToken(id, { size: 'sm' }), ROLES[id].name))),
    h('button', { class: 'btn ghost', onclick: () => set(null) }, '清除標記')), { wide: true });
}

// 側欄只放記錄類內容；可以收成一條豎排標籤軌（桌面寬屏），收起狀態記在本機
export const sideCollapsed = ctx => ctx.ls.get('botc.side') === 'min';
// 欄寬過渡的這一會兒（side-moving，board.css）面板和豎條都留著，一個淡出一個淡入；過渡完再畫一次，圓桌中間的卡按新寬度量
let moving = 0;
const setCollapsed = (ctx, v) => {
  ctx.ls.set('botc.side', v ? 'min' : '');
  document.body.classList.add('side-moving');
  ctx.render();
  clearTimeout(moving);
  moving = setTimeout(() => { document.body.classList.remove('side-moving'); ctx.render(); }, 340);
};

// 未讀：別人發的聊天（不算系統公告；玩家的說書人信息另有彈窗），按頻道統計 { 頻道: { n, last } }
export function chatUnread(s) {
  const out = {};
  for (const m of s.chat) {
    if (m.from === 'sys' || (m.info && !s.isSt) || m.k === 'act' || (s.isSt ? m.from === 'st' : m.from === s.myId)) continue;
    const ch = channelOf(s, m);
    if (m.seq <= (ui.seen[ch] ?? ui.base ?? Infinity)) continue;
    (out[ch] ||= { n: 0 }).n++;
    out[ch].last = m;
  }
  return out;
}

// [鍵, 側欄標籤, 手機短標籤]
const tabsOf = s => [...(s.st?.hand ? [['order', '順序', '順序']] : []), ...(s.isSt ? [['flow', '流程', '流程']] : []), ['log', s.st?.hand ? '日誌' : '遊戲日誌', '日誌'], ['chat', '聊天', '聊天'], ['sheet', '角色表', '角色']];
// 紅點：數字一變就換一個節點，重新蓋章、慢慢閃
const unreadBadge = n => n > 0 && h('i', { class: 'count', 'data-key': 'n' + n }, n > 99 ? '99+' : n);
// 聊天標籤上的未讀：公共和私聊。玩家之間的私聊記錄只標在它自己的頁籤上，說書人不用回
const tabUnread = (k, byCh) => (k === 'chat' ? Object.entries(byCh).reduce((a, [ch, x]) => a + (ch === 'whisper' ? 0 : x.n), 0) : 0);
// 從別處點開聊天：翻到最新一條未讀的那一頁，沒有未讀就停在上次那頁
function pickTab(s, k, showing) {
  if (k === 'chat' && !showing) {
    const [ch] = Object.entries(chatUnread(s)).filter(x => x[0] !== 'whisper').sort((a, b) => b[1].last.seq - a[1].last.seq)[0] || [];
    if (ch) ui.chat = ch;
  }
  ui.tab = k;
}

// 手機頂欄上的標籤：點開底部抽屜，再點一次（或點遮罩、✕）收起
export function sheetTabs(ctx) {
  const s = ctx.state;
  ui = views[viewKey(s)] ||= newView();
  const byCh = chatUnread(s);
  return h('nav', { class: 'm-tabs' }, tabsOf(s).map(([k, , short]) => h('button', {
    class: 'btn sm' + (ui.sheet && ui.tab === k ? ' primary' : ''),
    onclick: () => { const open = ui.sheet && ui.tab === k; pickTab(s, k, open); setSheet(ctx, !open); tabIn('.tab-body'); },
  }, short, !(ui.sheet && ui.tab === k) && unreadBadge(tabUnread(k, byCh)))));
}
// 抽屜收起：sheet-out 這一會兒抽屜還在，滑下去、遮罩淡掉（board.css）
function setSheet(ctx, on) {
  if (ui.sheet && !on) {
    document.body.classList.add('sheet-out');
    setTimeout(() => document.body.classList.remove('sheet-out'), 200);
  }
  ui.sheet = on;
  ctx.render();
}
export function closeSheet(ctx) { if (!ui.sheet) return false; setSheet(ctx, false); return true; }

export function renderSide(ctx) {
  const s = ctx.state, min = sideCollapsed(ctx);
  ui = views[viewKey(s)] ||= newView();
  const tabs = tabsOf(s);
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = tabs[0][0];
  if (!chatChans(s).includes(ui.chat)) ui.chat = 'all';
  const lastSeq = lastSeqOf(s);
  if (ui.base == null) ui.base = lastSeq;
  // 寬屏：收成豎條時不算已讀；手機：底部抽屜沒打開時不算已讀
  const hidden = wide() ? min : !ui.sheet;
  if (!hidden && ui.tab === 'chat') ui.seen[ui.chat] = lastSeq;
  const byCh = chatUnread(s);
  const label = (k, text) => [text, !(ui.tab === k && !hidden) && unreadBadge(tabUnread(k, byCh))];
  const go = k => { pickTab(s, k, ui.tab === k && !hidden); if (min) setCollapsed(ctx, false); else ctx.render(); tabIn('.tab-body'); };
  const body = { order: renderOrder, flow: renderLog, log: renderPublic, chat: renderChat, sheet: renderSheet }[ui.tab](ctx, byCh);
  return h('aside', { class: 'side' + (ui.sheet ? ' open' : '') },
    h('div', { class: 'side-mask', onclick: () => closeSheet(ctx) }),
    h('nav', { class: 'side-rail' }, h('button', { class: 'rail-btn', title: '展開側欄', onclick: () => setCollapsed(ctx, false) }, '⇤'),
      tabs.map(([k, text]) => h('button', { class: 'rail-tab', onclick: () => go(k) }, label(k, text)))),
    h('div', { class: 'side-panel' },
      h('nav', { class: 'tabs' }, tabs.map(([k, text]) => h('button', {
        class: 'tab' + (ui.tab === k ? ' on' : ''), onclick: () => go(k),
      }, label(k, text))), h('button', { class: 'tab-min', title: '收起側欄', onclick: () => setCollapsed(ctx, true) }, '⇥'),
      h('button', { class: 'sheet-x', title: '收起', onclick: () => closeSheet(ctx) }, '✕')),
      body));
}

function channelOf(s, m) {
  if (m.to === 'all') return 'all';
  if (s.isSt) return m.from === 'st' ? m.to : m.to === 'st' ? m.from : 'whisper';
  if (m.from === 'st' || m.to === 'st') return 'st';
  return m.from === s.myId ? m.to : m.from;
}

const msgView = (s, m) => {
  if (m.from === 'sys') return h('div', { class: 'msg sys' }, m.text);
  if (m.text == null) return h('div', { class: 'msg sys' }, `${m.fromName} 私聊了 ${seatLabel(s, m.to)}`);
  const mine = s.isSt ? m.from === 'st' : m.from === s.myId;
  return h('div', { class: 'msg' + (mine ? ' mine' : '') },
    h('div', { class: 'msg-k' }, m.fromName, ' · ', new Date(m.at).toTimeString().slice(0, 5)),
    h('div', { class: 'pre' }, m.text));
};
const msgsOf = (s, ch) => s.chat.filter(m => channelOf(s, m) === ch && !(m.info && !s.isSt) && m.k !== 'act');
// 輸入框：差量更新會保留頁面上已有的輸入框，所以發送時讀頁面上的那個。每一頁一個節點，翻頁時字不會帶到別的頻道
function composer(ctx, ch, btn, hint) {
  const s = ctx.state, key = 'chat-' + ch;
  const send = () => {
    const el = document.querySelector(`[data-keep="${key}"]`), text = el?.value.trim();
    if (!text) return;
    (s.isSt ? ctx.st('chat', { to: ch, text }) : ctx.act('chat', { to: ch, text }));
    el.value = ''; ui.drafts[ch] = '';
  };
  return h('div', { class: 'row composer', 'data-key': key },
    h('input', { 'data-keep': key, maxlength: 500, placeholder: hint, value: ui.drafts[ch] || '',
      oninput: e => { ui.drafts[ch] = e.target.value; },
      onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) send(); } }),
    h('button', { class: 'btn', onclick: send }, btn));
}

// 遊戲日誌：只讀，公開發生的事和說書人的公告；說書人底下多一個發公告的輸入框
const renderPublic = ctx => renderGameLog(ctx, msgsOf(ctx.state, 'all').filter(m => m.from === 'sys' || m.from === 'st'),
  ctx.state.isSt && !ctx.state.peek && composer(ctx, 'all', '公告', '發給所有人的公告'));

// 聊天的頁籤：公共在最前；說書人看每個座位和玩家之間的私聊記錄，玩家看說書人和其他座位，觀戰的人只有公共
const chatChans = s => ['all', ...(s.isSt ? [...s.seats.map(x => x.id), 'whisper'] : s.myId ? ['st', ...s.seats.filter(x => !x.mine).map(x => x.id)] : [])];
const CHAN = { all: '公共', st: '說書人', whisper: '私聊記錄' };
const chanHint = (s, ch) => (ch === 'all' ? '對所有人說' : ch === 'st' ? '對說書人說' : `對 ${seatLabel(s, ch)} 說`);

// 聊天：左邊一列頁籤，選中哪頁就和誰聊；翻到座位那頁，頁頭帶上自己標的和說書人給的信息，免得認錯人
function renderChat(ctx, byCh) {
  const s = ctx.state, ch = ui.chat, chans = chatChans(s), seat = s.seats.find(x => x.id === ch);
  const msgs = msgsOf(s, ch).filter(m => m.from !== 'sys');
  if (ui.focus) {
    ui.focus = false;
    setTimeout(() => document.querySelector(`[data-keep="chat-${ch}"]`)?.focus(), 0);
  }
  const flip = c => { ui.chat = c; ui.focus = wide(); ctx.render(); tabIn('.chan-page'); };
  const tab = c => {
    const i = s.seats.findIndex(x => x.id === c);
    return h('button', { class: 'chan-tab' + (c === ch ? ' on' : ''), 'data-key': 'tab-' + c, title: s.seats[i]?.name, onclick: () => flip(c) },
      i >= 0 && h('b', {}, i + 1), h('span', {}, s.seats[i]?.name ?? CHAN[c]), unreadBadge(byCh[c]?.n || 0));
  };
  return h('div', { class: 'tab-body chat chan' + (chans.length > 1 ? '' : ' solo') },
    chans.length > 1 && h('nav', { class: 'chan-rail' }, chans.map(tab)),
    h('div', { class: 'chan-page' },
      seat && h('div', { class: 'chan-head', 'data-key': 'head-' + ch },
        seatBadge(s, ch), h('b', {}, seat.name), s.isSt && seat.role && mini(seat.role), seatMarks(ctx, ch)),
      h('div', { class: 'msgs', 'data-key': 'msgs', 'data-scroll': 'chan-' + ch, 'data-stick': '1' },
        msgs.length ? msgs.map(m => msgView(s, m)) : h('div', { class: 'log-empty' }, icon('quill'))),
      ch !== 'whisper' && !s.peek && (s.isSt || s.myId) && composer(ctx, ch, '發送', chanHint(s, ch))));
}

// 座位上的標記：說書人給的信息裏帶的（角色 / 是否惡魔 / 陣營），自己的角色猜測和備註
// held：演出還沒播完，先佔位不顯示（技能演出按它的位置落點）
const heldCls = k => (k.held ? ' mk-held' : '');
export const markView = k => (k.r ? h('span', { class: 'pm' + (k.q ? ' q' : '') + heldCls(k), 'data-r': k.r }, mini(k.r))
  : k.demon != null ? h('span', { class: 'pmark auto' + (k.demon ? ' evil' : '') + heldCls(k), 'data-demon': k.demon ? 1 : 0 }, k.demon ? '有惡魔？' : '非惡魔')
    : k.t ? h('span', { class: 'pm' + heldCls(k) }, tag(k.t)) : h('span', { class: 'pmark auto' + heldCls(k) }, k.text));
function seatMarks(ctx, id) {
  const s = ctx.state;
  if (s.isSt) return [];
  const own = !s.peek, g = own && guesses(ctx)[id]; // 代入視角不帶說書人本機的猜測和備註
  return [g && h('span', { class: 'pm q', title: '你的猜測' }, mini(g)),
    ...(infoMarksBySeat(s)[id] || []).map(markView),
    ...(own && notes(ctx)[id] || []).map(t => h('span', { class: 'pmark note', title: '你的備註' }, t))].filter(Boolean);
}

function renderSheet(ctx) {
  const sc = SCRIPTS[ctx.state.scriptId];
  return h('div', { class: 'tab-body', 'data-scroll': 'sheet' },
    h('p', { class: 'muted' }, [sc.name, sc.en].filter(Boolean).join(' · ')),
    Object.keys(TEAMS).filter(team => sc.roles.some(id => ROLES[id].team === team)).map(team => [
      h('div', { class: 'sheet-team', style: { color: TEAMS[team].color } }, TEAMS[team].name),
      sc.roles.filter(id => ROLES[id].team === team).map(id => h('div', { class: 'sheet-row' },
        roleToken(id, { size: 'sm' }), h('div', {}, h('b', {}, ROLES[id].name), h('div', { class: 'ab' }, ROLES[id].ability)))),
    ]));
}
