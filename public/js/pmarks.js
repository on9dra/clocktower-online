// 玩家的推理筆記：線下面對面玩時大家邊聽邊記，手機就是那張筆記紙。每個座位可以記
//   自稱：他說他是什麼角色（自己的座位：我對外說我是什麼）；我猜：我覺得他其實是什麼（最多三個）；陣營：善良 / 邪惡；備註：隨手寫的字。
// 只存在本機，不上傳，別人看不到。按房間 + 局 + 自己的座位存（新的一局自動換一本；調試時說書人換到別的座位，各記各的）。
// 遮住身份（veil.js）時照樣畫：這是他自己寫的，不是系統發給他的私密信息。
// 入口只有一個：座位頭像右下角的「+」（和說書人的一樣），點座位上自己記的標記、「+N」也打開同一張。
import { h, roleToken, modal, closeModal, seatLabel, toast } from './ui.js';
import { ROLES, SCRIPTS } from './roles.js';
import { tr, getLang } from './lang.js';
import { icon, mini, seatBadge } from './glyph.js';
import { rolePanel } from './rolepick.js';

const PRE = 'botc.pm.', MAX_GUESS = 3, MAX_NOTE = 20, KEEP_MS = 3 * 864e5;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 誰有這本筆記：玩家、觀眾（線下單設備的手機都是觀眾）、調試時換成某個座位的說書人。說書人自己、代入視角（只讀）沒有；準備階段、終局不用記
export const marksOn = s => !!s && !s.isSt && !s.peek && ['night', 'dawn', 'day'].includes(s.phase);
const keyOf = s => `${PRE}${s.code}.${s.gameId}.${s.myId || 'watch'}`;

// ───── 存取 ─────
// { t: 最後寫的時間, seats: { 座位: { say: 角色, guess: [角色], team: 'good' | 'evil', notes: [字] } } }
let memo = { key: null, raw: null, data: null };
function read(ctx) {
  const s = ctx.state, k = keyOf(s), raw = ctx.ls.get(k);
  if (memo.key === k && memo.raw === raw && raw != null) return memo.data;
  let data = null;
  try { data = raw && JSON.parse(raw); } catch { /* 壞了就當沒有 */ }
  if (!data?.seats) data = raw == null ? legacy(ctx) : { seats: {} };
  memo = { key: k, raw, data };
  return data;
}
// 舊版本：猜測、備註分兩份存（botc.guess / botc.note，按房間 + 局）。更新上線時正在打的這一局接著用
function legacy(ctx) {
  const s = ctx.state, out = { seats: {} }, base = `${s.code}.${s.gameId}`;
  const old = kind => { try { return JSON.parse(ctx.ls.get(`botc.${kind}.${base}`) || '{}'); } catch { return {}; } };
  for (const [id, r] of Object.entries(old('guess'))) if (ROLES[r]) (out.seats[id] ||= {}).guess = [r];
  for (const [id, list] of Object.entries(old('note'))) if (Array.isArray(list) && list.length) (out.seats[id] ||= {}).notes = list.map(String).slice(0, 12);
  return out;
}
let pruned = false;
function write(ctx, data) {
  const k = keyOf(ctx.state);
  for (const [id, m] of Object.entries(data.seats)) if (!m.say && !m.guess?.length && !m.team && !m.notes?.length) delete data.seats[id];
  data.t = Date.now();
  const raw = JSON.stringify(data);
  ctx.ls.set(k, raw);
  memo = { key: k, raw, data };
  if (!pruned) { pruned = true; prune(k); }
}
// 舊局的筆記：三天沒動過的扔掉；舊格式的（botc.guess / botc.note）只留這一局的已經搬過來了，全扔
function prune(cur) {
  try {
    for (let i = localStorage.length; i--;) {
      const k = localStorage.key(i);
      if (!k || k === cur) continue;
      if (/^botc\.(guess|note)\./.test(k)) { localStorage.removeItem(k); continue; }
      if (!k.startsWith(PRE)) continue;
      let t = 0;
      try { t = JSON.parse(localStorage.getItem(k))?.t || 0; } catch { /* 壞的一起扔 */ }
      if (Date.now() - t > KEEP_MS) localStorage.removeItem(k);
    }
  } catch { /* 隱私模式 */ }
}

// ───── 座位上的樣子 ─────
// 寫字的標記在手機上截短：中文留兩個字；英文翻不了別人寫的字，按詞截（和說書人的字籤一樣）
const cut = t => (getLang() === 'en' && !/[㐀-鿿]/.test(t) ? t.split(/\s+/)[0] : [...t].slice(0, 2).join(''));
const nm = id => ROLES[id]?.name || '';
const txt = t => document.createTextNode(t); // 自己寫的字：原樣顯示，不過翻譯
const nth = list => { const seen = {}; return list.map(t => [t, (seen[t] = (seen[t] || 0) + 1)]); }; // [字, 這是第幾條同樣的字]
// 角色小牌 + 角上一枚符號：自稱是說話的氣泡，猜的是問號（和說書人信息裏「可能是」的問號同一枚）
function roleMark(id, kind, onclick) {
  const tok = mini(id);
  tok.removeAttribute('title');
  return h('span', { class: 'pm mine ' + kind, 'data-key': `pm-${kind}-${id}`, title: (kind === 'say' ? '自稱：' : '你猜：') + nm(id), onclick },
    tok, kind === 'say' && h('i', { class: 'pm-b' }, icon('talk')));
}
// 頭像圈裏：他自稱的角色。實線牌是系統給的真身份，這裏是虛線圈、半透明，一眼分得出是自己記的。
// 猜的不進圈：圈裏是他對大家說的身份，自己的懷疑掛在旁邊（帶問號，和說書人信息裏「可能是」一樣）
function faceView(id) {
  const tok = roleToken(id);
  tok.removeAttribute('title');
  // 帶 key：換了角色是新的一張，按下來；取下時淡掉（ui.js morph 的 data-exit）
  return h('div', { class: 'pm-face', 'data-key': 'pmf-' + id, 'data-exit': true, title: '自稱：' + nm(id) }, tok);
}
// 陣營：頭像外面用筆圈一圈，藍色善良、紅色邪惡。圈是畫上去的（筆跡從頭描到尾），不是一下子冒出來
const RING = 'M71 13C90 22 99 44 93 66 86 89 60 99 37 93 13 86 2 62 7 39 12 17 35 4 57 5 72 6 84 13 91 22';
function ringView(team) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.innerHTML = `<path d="${RING}" pathLength="100"/>`;
  return h('i', { class: 'pm-ring ' + team, 'data-key': 'pm-ring-' + team, 'data-exit': 'grow', title: team === 'good' ? '你標記為善良' : '你標記為邪惡' }, svg);
}

// 這一次畫桌面用的筆記本（null：這個視角沒有筆記）。tap(seat)：點座位上的標記時是不是該打開筆記（正在桌上選人時那一下歸座位）
export function notebook(ctx, tap = () => true) {
  const s = ctx.state;
  if (!marksOn(s)) return null;
  const data = read(ctx);
  return {
    // free：頭像圈裏空著（不是自己的角色、不是邪惡隊友的陣營牌、沒坐上處決台），自稱的角色畫進圈裏；不空就掛在旁邊
    seat(seat, free) {
      const m = data.seats[seat.id];
      if (!m) return { face: null, ring: null, lane: [] };
      const open = e => { if (!tap(seat)) return; e.stopPropagation(); openMarks(ctx, seat.id); };
      const say = ROLES[m.say] ? m.say : null, gs = (m.guess || []).filter(id => ROLES[id] && id !== say);
      const lane = [
        say && !free && roleMark(say, 'say', open),
        ...gs.map(id => roleMark(id, 'q', open)),
        ...nth(m.notes || []).map(([t, k]) => {
          const el = h('span', { class: 'pmark note', 'data-key': `pm-n-${k}-${t}`, onclick: open }, h('b', { class: 't-s' }, txt(cut(t))), h('i', { class: 't-l' }, txt(t)));
          el.title = t;
          return el;
        }),
      ].filter(Boolean);
      return { face: say && free && faceView(say), ring: m.team && ringView(m.team), lane };
    },
    // 聊天頁頭（side.js）：這個座位記了什麼，一排小的
    brief(id) {
      const m = data.seats[id];
      if (!m) return [];
      return [ROLES[m.say] && roleMark(m.say, 'say'), ...(m.guess || []).filter(r => r !== m.say && ROLES[r]).map(r => roleMark(r, 'q')),
        m.team && h('span', { class: 'pm-dot ' + m.team, title: m.team === 'good' ? '你標記為善良' : '你標記為邪惡' }),
        ...(m.notes || []).map(t => { const el = h('span', { class: 'pmark note' }, txt(t)); el.title = t; return el; })].filter(Boolean);
    },
  };
}

// 從標記紙上抽出來的角色單蓋在標記紙上面：Esc 先收角色單，再關標記紙（rolepick.js 見到底下有彈窗就不管 Esc，app.js 會先關掉底下的標記紙）
let sheet = null;
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !sheet || sheet.gone || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  sheet.close();
}, true);

// ───── 標記紙：一張彈窗，四行 ─────
// 自稱 / 我猜：點亮的是已經記下的，點一下取下；虛線的「+」抽出整屏角色單挑一個（角色單上標著別的座位記成這個角色的座位號，撞了一眼看得出）。
// 陣營：善良 / 邪惡二選一，再點一下取下。備註：寫一句回車記下，點一下取下。每一下只動那一枚，不重畫整張紙
export function openMarks(ctx, seatId, from) {
  const s = ctx.state;
  if (!marksOn(s) || !s.seats.some(x => x.id === seatId)) return;
  const k = keyOf(s), self = s.seats.find(x => x.id === seatId).mine;
  const live = () => !!ctx.state && marksOn(ctx.state) && keyOf(ctx.state) === k; // 換了一局、離開房間、調試換了座位：這張紙作廢
  const cur = () => (live() ? read(ctx).seats[seatId] || {} : {});
  const edit = f => {
    if (!live()) { closeModal(); return false; }
    const d = read(ctx), next = { ...d, seats: { ...d.seats, [seatId]: { ...(d.seats[seatId] || {}) } } };
    f(next.seats[seatId]);
    write(ctx, next);
    ctx.render();
    sync();
    return true;
  };
  const anchor = () => document.querySelector(`.ring > .seat[data-key="${seatId}"] .seat-add`);

  // 一行裏的一串籤：按 key 增減，留著的不動，新的蓋下來，取下的淡掉
  const strip = (cls, items) => {
    const box = h('span', { class: 'pm-strip ' + cls });
    box.sync = () => {
      const want = items(), keys = new Set(want.map(x => x.key)), have = new Map([...box.children].filter(el => !el.classList.contains('gone')).map(el => [el.dataset.k, el]));
      for (const [key, el] of have) if (!keys.has(key)) drop(el);
      let prev = null;
      for (const x of want) {
        let el = have.get(x.key);
        if (!el) { el = x.make(); el.dataset.k = x.key; (prev ? prev.after(el) : box.prepend(el)); land(el); }
        prev = el;
      }
    };
    box.sync();
    return box;
  };
  const drop = el => {
    el.classList.add('gone');
    if (calm()) return el.remove();
    el.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: .6 }], { duration: 160, easing: 'ease-in' });
    setTimeout(() => el.remove(), 150);
  };
  const land = el => { if (built && !calm()) el.animate([{ scale: 1.6, opacity: 0 }, { scale: .94, opacity: 1, offset: .6 }, { scale: 1, opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.4, 0, .6, 1)' }); };
  let built = false;

  // 別的座位記成這個角色的：角色單的牌角上寫他們的座位號（①③）
  const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const others = id => {
    const d = live() ? read(ctx) : { seats: {} };
    return s.seats.map((x, i) => [x.id, i]).filter(([x]) => x !== seatId && (d.seats[x]?.say === id || d.seats[x]?.guess?.includes(id))).map(([, i]) => NUM[i] || i + 1).join('');
  };
  const pick = kind => {
    const has = id => (kind === 'say' ? cur().say === id : (cur().guess || []).includes(id));
    const p = rolePanel({ key: `pm-${kind}-${seatId}`, tab: [seatBadge(s, seatId), h('span', {}, kind === 'say' ? '自稱' : '我猜')], roles: SCRIPTS[s.scriptId]?.roles || [],
      state: id => { const o = others(id); return { on: has(id), in: !!o, tag: o }; },
      picked: () => (kind === 'say' ? cur().say : null), alive: live, onClose: () => { if (sheet === p) sheet = null; },
      // 點已經記下的：取下，紙不收（可以接著挑別的）；點新的：蓋章記下，紙收走
      pick: id => {
        if (has(id)) { edit(m => { if (kind === 'say') delete m.say; else m.guess = (m.guess || []).filter(x => x !== id); }); return 'stay'; }
        if (kind === 'guess' && (cur().guess || []).length >= MAX_GUESS) { toast(`最多記 ${MAX_GUESS} 個，先取下一個`); return 'stay'; }
        edit(m => { if (kind === 'say') m.say = id; else m.guess = [...(m.guess || []), id]; });
      } });
    p.el.classList.add('pm-sheet');
    sheet = p;
  };
  const roleChip = (id, kind) => h('button', { class: 'chip on pm-role', title: '取下', onclick: () => edit(m => {
    if (kind === 'say') delete m.say; else m.guess = (m.guess || []).filter(x => x !== id);
  }) }, mini(id), h('span', {}, nm(id)));
  const addChip = kind => h('button', { class: 'chip pm-add', title: kind === 'say' ? '自稱' : '我猜', onclick: () => pick(kind) }, icon('plus'));
  // 自稱只有一個：記下了就不再有「+」，要改先點掉
  const sayRow = strip('say', () => (cur().say && ROLES[cur().say] ? [{ key: 'r' + cur().say, make: () => roleChip(cur().say, 'say') }] : [{ key: '+', make: () => addChip('say') }]));
  const guessRow = strip('guess', () => [...(cur().guess || []).filter(id => ROLES[id]).map(id => ({ key: 'r' + id, make: () => roleChip(id, 'guess') })),
    ...((cur().guess || []).length < MAX_GUESS ? [{ key: '+', make: () => addChip('guess') }] : [])]);
  // 陣營：兩枚互斥的籤，只換 class
  const teamBtn = team => h('button', { class: 'chip pm-team ' + team, 'data-team': team, onclick: () => edit(m => { if (m.team === team) delete m.team; else m.team = team; }) },
    team === 'good' ? '善良' : '邪惡');
  const teams = h('span', { class: 'pm-strip team' }, teamBtn('good'), teamBtn('evil'));
  // 備註按「第幾條同樣的字」認：取下前面一條，後面的不跟著重新蓋一遍
  const noteRow = strip('notes', () => nth(cur().notes || []).map(([t, k]) => ({ key: k + '|' + t, make: () =>
    h('button', { class: 'chip on pm-note', title: '取下', onclick: () => edit(m => { m.notes = nth(m.notes || []).filter(x => !(x[0] === t && x[1] === k)).map(x => x[0]); }) }, txt(t)) })));
  const input = h('input', { maxlength: MAX_NOTE, placeholder: '記一筆', enterkeyhint: 'done' });
  const addNote = () => {
    const t = input.value.trim();
    if (!t) return input.focus();
    if (edit(m => { m.notes = [...(m.notes || []), t].slice(-12); })) { input.value = ''; input.focus(); }
  };
  input.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); addNote(); } };
  const clear = h('button', { class: 'btn sm ghost pm-clear', onclick: () => {
    if (clear.classList.contains('dim')) return toast('這個座位還沒有標記');
    edit(m => { for (const x of Object.keys(m)) delete m[x]; });
  } }, '清除');
  function sync() {
    if (!built) return;
    sayRow.sync(); guessRow.sync(); noteRow.sync();
    const m = cur();
    for (const b of teams.children) b.classList.toggle('on', m.team === b.dataset.team);
    clear.classList.toggle('dim', !(m.say || m.guess?.length || m.team || m.notes?.length));
  }
  const row = (label, ...kids) => h('div', { class: 'hand-row pm-row' }, h('b', { class: 'pm-k' }, label), kids);
  const body = h('div', { class: 'hand-form pm-form' },
    row('自稱', sayRow),
    !self && row('我猜', guessRow),
    !self && row('陣營', teams),
    row('備註', h('div', { class: 'pm-col' }, noteRow, h('div', { class: 'row rm-add pm-add-note' }, input, h('button', { class: 'btn', onclick: addNote }, icon('quill'), '記下')))),
    h('div', { class: 'pm-foot' }, clear));
  modal(`${seatLabel(s, seatId)} 的標記`, body, { cls: 'pm-modal', from: from || anchor(), away: anchor });
  built = true;
  sync();
}
