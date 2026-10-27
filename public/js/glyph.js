// 信息式子的畫法：座位號圓章、角色小牌、陣營牌、數字、惡魔是否、符號。
// 玩家面板、說書人日誌、給信息卡片、演出共用（式子的數據格式見 infofmt.js infoFormula）
import { h, roleToken } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { ICONS, ICON_VIEWBOX } from './icons.js';

// 自繪小圖標（24×24，描邊 / 填充都用 currentColor）
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
export const PATHS = {
  to: `<path ${S} d="M4 12h15M13 6l6 6-6 6"/>`,
  eq: `<path ${S} d="M5 9h14M5 15h14"/>`,
  become: `<path ${S} d="M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M20 12a8 8 0 0 1-14 5.3M6 21v-4h4"/>`,
  pairs: `<circle ${S} cx="6" cy="12" r="3.5"/><circle ${S} cx="18" cy="12" r="3.5"/><path ${S} d="M9.5 12h5"/>`,
  mask: `<path ${F} fill-rule="evenodd" d="M2 8.5c3.2-2 6.8-2 10 0 3.2-2 6.8-2 10 0 0 5.5-2.6 8.5-5.8 8.5-2 0-3-1.6-4.2-3-1.2 1.4-2.2 3-4.2 3C4.6 17 2 14 2 8.5zm4.2 2.3a2 1.4 0 1 0 4 0 2 1.4 0 1 0-4 0zm7.6 0a2 1.4 0 1 0 4 0 2 1.4 0 1 0-4 0z"/>`,
  noose: `<path ${S} d="M12 2v7"/><ellipse ${S} cx="12" cy="15" rx="4.2" ry="5.5"/><path ${F} d="M10.5 8h3v3h-3z"/>`,
  pitchfork: `<path ${S} d="M12 22V10M6 3v4.5a6 6 0 0 0 12 0V3M12 3v7"/>`,
  drop: `<path ${F} d="M12 2.5c-3.3 5-6.5 8.6-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 11.1 15.3 7.5 12 2.5z"/>`,
  shield: `<path ${F} d="M12 2l8 3v6.2c0 5-3.4 9-8 10.8-4.6-1.8-8-5.8-8-10.8V5z"/>`,
  key: `<circle ${S} cx="7.5" cy="16.5" r="3.5"/><path ${S} d="M10 14l10-10M16.5 7.5l3 3M14 10l2 2"/>`,
  eye: `<path ${S} d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle ${F} cx="12" cy="12" r="3"/>`,
  bolt: `<path ${F} d="M13.5 2L4 13.5h7L9.8 22 20 9.8h-7z"/>`,
  // 箭：橫向，右邊箭頭、左邊兩道尾羽
  arrow: `<path ${S} d="M3 12h15M7 12L4 8.5M7 12L4 15.5M10.5 12L7.5 8.5M10.5 12L7.5 15.5"/><path ${F} d="M22.5 12L16 8v8z"/>`,
  moon: `<path ${F} d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1z"/>`,
  sun: `<circle ${F} cx="12" cy="12" r="4.5"/><path ${S} d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/>`,
  skull: `<path ${F} fill-rule="evenodd" d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5c0 3 1.4 4.8 3 5.9V20h9v-4.1c1.6-1.1 3-2.9 3-5.9A7.5 7.5 0 0 0 12 2.5zM8 10.5a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0zm4.2 0a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0z"/>`,
  dagger: `<path ${F} d="M12 1.5l2 11h-4z"/><path ${S} d="M7.5 13.5h9M12 13.5V19"/><circle ${F} cx="12" cy="21" r="1.6"/>`,
  check: `<path ${S} stroke-width="3" d="M4.5 12.5l5 5 10-11"/>`,
  cross: `<path ${S} stroke-width="3" d="M6 6l12 12M18 6L6 18"/>`,
  none: `<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M6.5 17.5l11-11"/>`,
  quill: `<path ${F} d="M4 20l1.2-4.6L16.4 4.2a2.2 2.2 0 0 1 3.1 3.1L8.4 18.6z"/>`,
  skip: `<path ${F} d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>`,
  // 棄權：圓圈裏一條橫線（不舉手、也不算票）
  abstain: `<circle ${S} cx="12" cy="12" r="8.5"/><path ${S} stroke-width="2.6" d="M7.5 12h9"/>`,
  // 只有自己和說書人看得到：閉著的眼睛
  hidden: `<path ${S} d="M2.5 10.5s3.6 5 9.5 5 9.5-5 9.5-5M6 13.8l-1.8 2.4M12 15.5v3M18 13.8l1.8 2.4"/>`,
  pause: `<path ${F} d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/>`,
  play: `<path ${F} d="M7 4.5v15l12.5-7.5z"/>`,
  reset: `<path ${S} d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 3.5v4h4"/>`,
  // 死亡票：一張帶齒孔的票
  ticket: `<path ${F} d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z"/><path fill="none" stroke="#fbf8f0" stroke-width="1.6" stroke-dasharray="1.6 1.6" d="M15.5 7v10"/>`,
  // 準星：獵手開槍
  aim: `<circle ${S} cx="12" cy="12" r="7"/><path ${S} d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/><circle ${F} cx="12" cy="12" r="1.7"/>`,
  timer: `<circle ${S} cx="12" cy="13.5" r="7.5"/><path ${S} d="M12 13.5V9.5M9.5 3h5M18.5 6.5l1.5-1.5"/>`,
  hand: `<path ${F} d="M8 11V5.2a1.5 1.5 0 0 1 3 0V10V3.7a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v8.5c0 4.6-2.6 8-6.6 8-3 0-4.4-1.6-6-4.4L3 13.4a1.5 1.5 0 0 1 2.4-1.7L8 14.3z"/>`,
  sound: `<path ${F} d="M3 9h4l5-4.5v15L7 15H3z"/><path ${S} d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>`,
  mute: `<path ${F} d="M3 9h4l5-4.5v15L7 15H3z"/><path ${S} d="M16 9l6 6M22 9l-6 6"/>`,
  send: `<path ${F} d="M3 20.5l18-8.5L3 3.5l2.2 7L14 12l-8.8 1.5z"/>`,
  egg: `<path fill="#fffdf3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 2.5C8.2 2.5 5 8.6 5 13.4 5 17.6 8.1 21 12 21s7-3.4 7-7.6C19 8.6 15.8 2.5 12 2.5z"/>`,
  star: `<path ${F} d="M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.3l-6 3.3 1.3-6.7-5-4.7 6.8-.8z"/>`,
  trophy: `<path ${F} fill-rule="evenodd" d="M7 3h10v2h3.5v2.2c0 2.9-2.1 5.1-4.9 5.5A5.5 5.5 0 0 1 13 15.6V18h3.2v3H7.8v-3H11v-2.4a5.5 5.5 0 0 1-2.6-2.9C5.6 12.3 3.5 10.1 3.5 7.2V5H7zM5.4 7v.2c0 1.6 1 2.9 2.2 3.4A12 12 0 0 1 7 7zm11.2 0a12 12 0 0 1-.6 3.6c1.3-.5 2.2-1.8 2.2-3.4V7z"/>`,
  gear: `<path ${F} fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>`,
  firework: `<path ${S} d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle ${F} cx="12" cy="12" r="1.8"/>`,
};

// 絞刑架：左邊立柱 + 橫梁 + 斜撐，繩子和套索垂在正中（x=75），台上的頭像掛在套索下面
// rope：false 時只畫木架（處決演出裏繩子要單獨往下拉）
export function gallows(cls = '', rope = true) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 150 170');
  el.setAttribute('class', 'gallows ' + cls);
  el.innerHTML = '<path class="g-wood" d="M22 166V6H80M22 38L54 6M6 166H58"/>'
    + (rope ? '<path class="g-rope" d="M75 6V44"/><ellipse class="g-rope" cx="75" cy="56" rx="10" ry="13"/>' : '');
  return el;
}

export function icon(name, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico ' + cls);
  el.innerHTML = PATHS[name] || '';
  return el;
}
// 角色圖標本身（不帶圓牌），演出裏飛的「小惡魔」等用
export function roleIcon(roleId, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', ICON_VIEWBOX);
  el.setAttribute('class', 'ico ' + cls);
  el.innerHTML = ICONS[roleId] || '';
  return el;
}

// 座位號圓章（日誌和信息是歷史記錄，不跟著當前的死亡狀態變）
export function seatBadge(s, id, cls = '') {
  const i = s.seats.findIndex(x => x.id === id), seat = s.seats[i];
  if (!seat) return h('span', { class: 'sb ' + cls }, '?');
  return h('span', { class: 'sb ' + cls + (seat.mine ? ' mine' : ''), title: seat.name, 'data-seat': id }, i + 1);
}
export const mini = (roleId, cls = '') => {
  const t = roleToken(roleId, { size: 'xs' });
  if (cls) t.classList.add(...cls.split(' '));
  return t;
};
// 陣營牌：惡魔 / 爪牙；none 表示「沒有」
export function teamToken(team, none) {
  const color = TEAMS[team]?.color || 'var(--ink)';
  return h('span', { class: 'tt' + (none ? ' none' : ''), style: { '--team': color }, title: TEAMS[team]?.name },
    none ? icon('none') : team === 'demon' ? roleIcon('imp') : icon('dagger'));
}
// 惡魔：是 / 否
export const demonMark = yes => h('span', { class: 'dm ' + (yes ? 'yes' : 'no') }, roleIcon('imp'), icon(yes ? 'check' : 'cross', 'dm-k'));
export const evilNum = n => h('b', { class: 'num' }, n);

// 帶字的標籤：給新手看的「爪牙 / 惡魔 / 偽裝」，後面直接跟座位或角色
const TAGS = { demon: ['demon', '惡魔'], minion: ['minion', '爪牙'], bluff: [null, '偽裝'] };
export function tag(k) {
  const [team, name] = TAGS[k];
  return h('span', { class: 'tag', style: { '--team': team ? TEAMS[team].color : 'var(--ink)' } },
    team === 'demon' ? roleIcon('imp') : icon(team ? 'dagger' : 'mask'), name);
}
// 短詞：關係和動作用字說（或 / 是 / 提名 / 殺死…），k 是語義色 bad / good / evil / muted
export const w = (text, k = '') => h('span', { class: 'w' + (k ? ' ' + k : '') }, text);
// 角色小牌 + 名字
export const named = roleId => h('span', { class: 'rn' }, mini(roleId), h('b', {}, ROLES[roleId]?.name || roleId));

const OPS = { to: 'to', eq: 'eq', become: 'become', pairs: 'pairs', mask: 'mask', exec: 'noose' };
function term(s, t) {
  if (t.s) return seatBadge(s, t.s);
  if (t.w) return w(t.w, t.k);
  if (t.tag) return tag(t.tag);
  if (t.r) return t.named ? named(t.r) : mini(t.r);
  if (t.t) return teamToken(t.t, t.none);
  if (t.n != null) return evilNum(t.n);
  if (t.demon != null) return demonMark(t.demon);
  if (t.grim) return grimGrid(s, t.grim);
  if (t.op === 'or') return w('或');
  if (t.op === 'eq') return w('是');
  if (t.op === 'sep') return h('i', { class: 'op-sep' });
  if (t.op === 'br') return h('i', { class: 'op-br' });
  return icon(OPS[t.op] || 'to', 'op');
}
// 間諜看到的魔典：座位號 + 角色小牌（死亡變灰、中毒帶毒滴、酒鬼帶他以為的角色）
function grimGrid(s, rows) {
  return h('span', { class: 'grim' }, rows.map(([id, r, st = {}]) => h('span', { class: 'grim-cell' + (st.dead ? ' dead' : '') },
    seatBadge(s, id), mini(r), st.fake && mini(st.fake, 'fake'), st.poison && icon('drop', 'poison'))));
}

export const formula = (s, terms, cls = '') => h('span', { class: 'frm ' + cls }, (terms || []).map(t => term(s, t)));
// 式子裏涉及的座位（面板聯動高亮用）
export const formulaSeats = terms => (terms || []).flatMap(t => (t.s ? [t.s] : t.grim ? t.grim.map(g => g[0]) : []));

// 夜晚行動的圖標（選人提示、演出共用）
// 夜晚要選人的角色：圖標、語義色（poison 毒綠 / good 藍 / evil 紅 / brass 金）、
// 自己視角裏目標座位上的標記、選人時的一句話（單數項是關鍵詞，用語義色加「」）
export const ACTS = {
  poisoner: { ico: 'drop', tone: 'poison', mark: '中毒', say: ['選擇一名玩家，使其', '中毒'] },
  monk: { ico: 'shield', tone: 'good', mark: '保護', say: ['選擇一名其他玩家，使其今晚', '受保護'] },
  imp: { ico: 'pitchfork', tone: 'evil', mark: '擊殺', say: ['選擇一名玩家，使其', '死亡'] },
  butler: { ico: 'key', tone: 'brass', mark: '主人', say: ['選擇一名其他玩家作為你的', '主人'] },
  fortuneteller: { ico: 'eye', tone: 'good', mark: '查驗', say: ['選擇兩名玩家，查驗其中有沒有', '惡魔'] },
  ravenkeeper: { ico: 'eye', tone: 'good', mark: '查驗', say: ['選擇一名玩家，得知他的', '角色'] },
};
export const actIcon = (roleId, cls = '') => (ACTS[roleId] ? icon(ACTS[roleId].ico, cls) : roleIcon(roleId, cls));
