// 側欄：標籤頁（流程日誌、遊戲日誌、說書人私聊 / 私聊收件箱、角色表）。流程操作在底部操作塢（flow.js）
import { h, roleToken, seatLabel, modal, closeModal, prompt2, toast } from './ui.js';
import { ROLES, TEAMS, SCRIPTS } from './roles.js';
import { renderLog } from './log.js';
import { renderGameLog } from './gamelog.js';
import { seatBadge, mini, tag, w, icon, ACTS } from './glyph.js';

// 聊天狀態按視角分開（自己 / 說書人代入的某個玩家），代入時不會串到說書人自己的浮窗和未讀。
// seen：每個頻道讀到的最後一條；base：進入這個視角時的最後一條（之前的舊消息不算未讀）
// wins：打開的私聊浮窗 [{ ch, min }]，按打開順序（順序不變，重繪時已有的浮窗不會重新彈一次）
// sheet：手機上側欄是底部抽屜，這裏記它開沒開（寬屏不用）
const newView = () => ({ tab: null, seen: {}, base: null, wins: [], focus: null, sheet: false });
const views = {};
let ui = newView();
const viewKey = s => (s.peek ? 'peek:' + s.peek.seatId : s.isSt ? 'st' : 'me');
const wide = () => window.matchMedia('(min-width: 861px)').matches;
const FULL = '聊天窗已滿，請關閉部分聊天窗後再試。';
// 浮窗放不放得下：桌面沿桌面寬度橫排；手機上展開的貼底佔滿寬，收起的小條每行並排三個
function fits(wins) {
  if (wide()) {
    const room = (document.querySelector('.board')?.clientWidth || 900) - 20;
    return wins.reduce((a, x) => a + (x.min ? 188 : 280), 0) <= room;
  }
  const mins = wins.filter(x => x.min).length;
  return Math.ceil(mins / 3) * 40 + (wins.length - mins) * (innerHeight * 0.46 + 8) <= innerHeight * 0.8;
}

// 打開頻道：遊戲日誌、玩家和說書人的私聊在側欄標籤裏，其他私聊打開浮窗；放不下就提示，不自動關掉別的
export function openChat(ctx, ch) {
  const tab = ch === 'all' ? 'log' : ch === 'st' ? 'st' : null;
  if (tab) {
    ui.tab = tab; ui.sheet = true; ctx.ls.set('botc.side', ''); ctx.render();
    return;
  }
  const x = ui.wins.find(y => y.ch === ch);
  if (!x || x.min) {
    // 手機一次只展開一個，別的收成小條
    const rest = wide() ? ui.wins : ui.wins.map(y => (y.min ? y : { ...y, min: true }));
    const next = x ? rest.map(y => (y.ch === ch ? { ch, min: false } : y)) : [...rest, { ch, min: false }];
    if (!fits(next)) return toast(FULL);
    ui.wins = next;
  }
  ui.focus = ch;
  if (!wide()) ui.sheet = false; // 手機：私聊浮窗貼底，先收起抽屜
  ctx.render();
}
const lastSeqOf = s => s.chat.at(-1)?.seq || 0;
function closeWin(ctx, ch) { ui.wins = ui.wins.filter(x => x.ch !== ch); ui.seen[ch] = lastSeqOf(ctx.state); ctx.render(); }
function toggleWin(ctx, ch) {
  const x = ui.wins.find(y => y.ch === ch);
  if (x.min) return openChat(ctx, ch);
  x.min = true;
  ctx.render();
}

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
export function infoMarksBySeat(s) {
  const out = {}, seen = new Set();
  for (const m of s.chat) {
    if (!m.info || m.to !== s.myId) continue;
    for (const k of m.marks || []) {
      const key = [k.seatId, k.r, k.q, k.demon, k.t, k.text].join('|');
      if (!seen.has(key)) { seen.add(key); (out[k.seatId] ||= []).push(k); }
    }
  }
  return out;
}

// 自己最近這一夜的行動落在誰身上（夜裏到第二天白天都標著，下一夜換新的）：{ seatId: [角色] }。只有自己看得到
export function actMarksBySeat(s) {
  const out = {};
  if (s.isSt || !s.myId) return out;
  for (const m of s.chat) {
    if (m.k !== 'act' || m.to !== s.myId || m.night !== s.night || !ACTS[m.src]) continue;
    for (const t of m.f || []) if (t.s && !(out[t.s] ||= []).includes(m.src)) out[t.s].push(m.src);
  }
  return out;
}
export const actMarkView = src => h('span', { class: 'pmark act ' + ACTS[src].tone, title: '你今晚的行動' }, icon(ACTS[src].ico), ACTS[src].mark);

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
const setCollapsed = (ctx, v) => { ctx.ls.set('botc.side', v ? 'min' : ''); ctx.render(); };

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
const tabsOf = s => (s.isSt ? [['flow', '流程', '流程'], ['log', '遊戲日誌', '日誌'], ['dm', '私聊', '私聊'], ['sheet', '角色表', '角色']]
  : s.myId ? [['log', '遊戲日誌', '日誌'], ['st', '說書人', '說書人'], ['sheet', '角色表', '角色']]
    : [['log', '遊戲日誌', '日誌'], ['sheet', '角色表', '角色']]); // 觀戰的人不能私聊
const unreadBadge = n => n > 0 && h('i', { class: 'count' }, n > 99 ? '99+' : n);
// 標籤上的未讀：日誌算公告，說書人標籤算和說書人的私聊，私聊收件箱算所有私聊
const tabUnread = (k, byCh) => (k === 'log' ? byCh.all?.n || 0 : k === 'st' ? byCh.st?.n || 0
  : k === 'dm' ? Object.entries(byCh).reduce((a, [ch, x]) => a + (ch === 'all' ? 0 : x.n), 0) : 0);

// 手機頂欄上的標籤：點開底部抽屜，再點一次（或點遮罩、✕）收起
export function sheetTabs(ctx) {
  const s = ctx.state;
  ui = views[viewKey(s)] ||= newView();
  const byCh = chatUnread(s);
  return h('nav', { class: 'm-tabs' }, tabsOf(s).map(([k, , short]) => h('button', {
    class: 'btn sm' + (ui.sheet && ui.tab === k ? ' primary' : ''),
    onclick: () => { const open = ui.sheet && ui.tab === k; ui.tab = k; ui.sheet = !open; ctx.render(); },
  }, short, !(ui.sheet && ui.tab === k) && unreadBadge(tabUnread(k, byCh)))));
}
export function closeSheet(ctx) { if (!ui.sheet) return false; ui.sheet = false; ctx.render(); return true; }

export function renderSide(ctx) {
  const s = ctx.state, min = sideCollapsed(ctx);
  ui = views[viewKey(s)] ||= newView();
  const tabs = tabsOf(s);
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = tabs[0][0];
  const lastSeq = lastSeqOf(s);
  if (ui.base == null) ui.base = lastSeq;
  // 新私聊：出現一個收起的浮窗慢慢閃（點開再看）；已經有浮窗的就在原處閃。
  // 放不下就不加，座位旁的氣泡和私聊條上的數字照樣提示。代入視角時不彈
  if (!s.peek) for (const ch of Object.keys(chatUnread(s))) {
    if (ch === 'all' || ch === 'whisper' || ch === 'st' || ui.wins.some(x => x.ch === ch)) continue;
    const next = [...ui.wins, { ch, min: true }];
    if (fits(next)) ui.wins = next;
  }
  ui.wins = ui.wins.filter(x => x.ch === 'whisper' || s.seats.some(y => y.id === x.ch));
  for (const x of ui.wins) if (!x.min) ui.seen[x.ch] = lastSeq;
  // 寬屏：收成豎條時不算已讀；手機：底部抽屜沒打開時不算已讀
  const hidden = wide() ? min : !ui.sheet;
  if (!hidden && (ui.tab === 'log' || ui.tab === 'st')) ui.seen[ui.tab === 'log' ? 'all' : 'st'] = lastSeq;
  const byCh = chatUnread(s);
  const label = (k, text) => [text, !(ui.tab === k && !hidden) && unreadBadge(tabUnread(k, byCh))];
  const go = k => { ui.tab = k; if (min) setCollapsed(ctx, false); else ctx.render(); };
  const body = { flow: renderLog, log: renderPublic, st: renderStChat, dm: renderInbox, sheet: renderSheet }[ui.tab](ctx, byCh);
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
// 輸入框：差量更新會保留頁面上已有的輸入框，所以發送時讀頁面上的那個
function composer(ctx, ch, btn = '發送', hint = '說點什麼，回車發送') {
  const s = ctx.state, key = 'chat-' + ch;
  const send = () => {
    const el = document.querySelector(`[data-keep="${key}"]`), text = el?.value.trim();
    if (!text) return;
    (s.isSt ? ctx.st('chat', { to: ch, text }) : ctx.act('chat', { to: ch, text }));
    el.value = '';
  };
  return h('div', { class: 'row composer' },
    h('input', { 'data-keep': key, maxlength: 500, placeholder: hint,
      onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) send(); } }),
    h('button', { class: 'btn', onclick: send }, btn));
}
// 私聊對象：說書人看所有座位和玩家之間的私聊記錄；玩家看說書人和其他座位
const privChans = s => (s.isSt ? [...s.seats.map(x => x.id), 'whisper'] : ['st', ...s.seats.filter(x => !x.mine).map(x => x.id)]);
const chanFace = (s, ch) => (ch === 'st' ? w('說書人', 'ink') : ch === 'whisper' ? w('私聊記錄', 'muted') : seatBadge(s, ch));
const chanTitle = (s, ch) => (ch === 'st' ? '說書人' : ch === 'whisper' ? '玩家之間的私聊' : s.seats.find(x => x.id === ch)?.name || '');

// 遊戲日誌：只讀；說書人底下多一個發公告的輸入框
const renderPublic = ctx => renderGameLog(ctx, msgsOf(ctx.state, 'all'),
  ctx.state.isSt && !ctx.state.peek && composer(ctx, 'all', '公告', '發給所有人的公告'));

// 玩家：和說書人的私聊直接在標籤裏
function renderStChat(ctx) {
  const s = ctx.state, msgs = msgsOf(s, 'st');
  return h('div', { class: 'tab-body chat' },
    h('div', { class: 'msgs', 'data-scroll': 'st', 'data-stick': '1' }, msgs.length ? msgs.map(m => msgView(s, m)) : h('div', { class: 'log-empty' }, icon('quill'))),
    !s.peek && composer(ctx, 'st'));
}

// 說書人：私聊收件箱，每個座位一行（最後一條 + 未讀），點開浮窗；有未讀的排前面，其次按最近
function renderInbox(ctx, byCh) {
  const s = ctx.state, last = {};
  for (const m of s.chat) if (m.to !== 'all' && !m.info && m.k !== 'act') last[channelOf(s, m)] = m;
  const order = privChans(s).sort((a, b) => (byCh[b] ? 1 : 0) - (byCh[a] ? 1 : 0) || (last[b]?.seq || 0) - (last[a]?.seq || 0));
  return h('div', { class: 'tab-body inbox', 'data-scroll': 'inbox' }, order.map(ch => {
    const m = last[ch], seat = s.seats.find(x => x.id === ch);
    return h('button', { class: 'ib-row' + (byCh[ch] ? ' unread' : '') + (ui.wins.some(x => x.ch === ch && !x.min) ? ' open' : ''),
      'data-key': 'ib-' + ch, onclick: () => openChat(ctx, ch) },
    chanFace(s, ch), h('span', { class: 'ib-name' }, seat?.name || chanTitle(s, ch)),
    h('span', { class: 'ib-last' }, !m ? '' : m.text == null ? `${m.fromName} → ${seatLabel(s, m.to)}` : (m.from === 'st' ? '你：' : '') + m.text),
    byCh[ch] && h('i', { class: 'count' }, byCh[ch].n));
  }));
}

// 私聊浮窗：桌面右下角並排（手機上貼底），標題欄點一下收起 / 展開
export function renderChatWins(ctx) {
  const s = ctx.state, byCh = chatUnread(s);
  if (ui.focus) {
    const key = 'chat-' + ui.focus; ui.focus = null;
    setTimeout(() => document.querySelector(`[data-keep="${key}"]`)?.focus(), 0);
  }
  return h('div', { class: 'chat-wins' }, ui.wins.map(({ ch, min }) => {
    const seat = s.seats.find(x => x.id === ch), msgs = !min && msgsOf(s, ch), marks = !min && seat ? seatMarks(ctx, ch) : [];
    return h('div', { class: 'cwin' + (min ? ' min' : '') + (byCh[ch] ? ' unread' : ''), 'data-key': 'cw-' + ch },
      h('div', { class: 'cwin-head', onclick: () => toggleWin(ctx, ch) },
        chanFace(s, ch), seat && h('span', { class: 'cwin-name' }, seat.name), s.isSt && seat?.role && mini(seat.role),
        byCh[ch] && h('i', { class: 'count' }, byCh[ch].n),
        h('button', { class: 'cwin-x', title: '關閉', onclick: e => { e.stopPropagation(); closeWin(ctx, ch); } }, '✕')),
      marks.length > 0 && h('div', { class: 'cwin-marks' }, marks),
      !min && h('div', { class: 'msgs', 'data-scroll': 'cw-' + ch, 'data-stick': '1' }, msgs.length ? msgs.map(m => msgView(s, m)) : h('p', { class: 'muted' }, '暫無消息')),
      !min && ch !== 'whisper' && !s.peek && composer(ctx, ch));
  }));
}

// 座位上的標記：說書人給的信息裏帶的（角色 / 是否惡魔 / 陣營），自己的角色猜測和備註
export const markView = k => (k.r ? h('span', { class: 'pm' + (k.q ? ' q' : '') }, mini(k.r))
  : k.demon != null ? h('span', { class: 'pmark auto' + (k.demon ? ' evil' : '') }, k.demon ? '有惡魔？' : '非惡魔')
    : k.t ? h('span', { class: 'pm' }, tag(k.t)) : h('span', { class: 'pmark auto' }, k.text));
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
    h('p', { class: 'muted' }, `${sc.name} · ${sc.en}`),
    Object.keys(TEAMS).map(team => [
      h('div', { class: 'sheet-team', style: { color: TEAMS[team].color } }, TEAMS[team].name),
      sc.roles.filter(id => ROLES[id].team === team).map(id => h('div', { class: 'sheet-row' },
        roleToken(id, { size: 'sm' }), h('div', {}, h('b', {}, ROLES[id].name), h('div', { class: 'ab' }, ROLES[id].ability)))),
    ]));
}
