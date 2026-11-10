// 說書人流程日誌：按夜 / 天分組，每一步畫成一行式子（數據見 lib 裏 stLog 的 e）
import { h } from './ui.js';
import { formula, seatBadge, mini, icon, tag, named, w, ACTS } from './glyph.js';

// 原則：座位號、角色牌是圖；動作和結果用短詞（投毒 / 殺死 / 提名…）
const RES = { poison: ['投毒'], protect: ['保護', 'good'], kill: ['殺死', 'bad'], blocked: ['攻擊'], fail: ['失效', 'muted'],
  master: ['認主'], starpass: ['自殺傳位', 'bad'], mayor: ['攻擊'], charge: ['蓄力', 'bad'], noop: ['行動'] };
const WHY = { protect: '被保護', soldier: '士兵免疫', mayor: '鎮長替死', dead: '已死亡', tealady: '茶藝師', fool: '弄臣', sailor: '水手', safe: '被保護',
  notdemon: '不是惡魔', nottown: '不是鎮民', notgood: '不是善良', inplay: '已在場', absent: '不在場' };
const BENT = { poison: '中毒', drunk: '醉酒', tipsy: '醉酒', puppet: '提線木偶', vortox: '渦流' }; // 信息可以給錯的原因
const CAUSE = { demon: '被殺', execute: '被處決', slayer: '被射殺', virgin: '貞潔者反噬', starpass: '傳位', manual: '說書人判定' };
const VOTE = { block: ['上處決台', 'bad'], tie: ['平票'], fail: ['票數不足', 'muted'] };
const SRC_VERB = { poisoner: '投毒', monk: '保護', imp: '攻擊', butler: '認主' };

// 新劇本的角色：投毒 / 保護 / 認主這類「落到目標上」的結果，按角色換成它自己的動作詞（詛咒、瘋狂、變身、驅魔……）
const OWN_VERB = { snakecharmer: '交換', eviltwin: '雙子', fanggu: '跳身' };
export function actRow(s, e) {
  const seats = (e.to || []).map(id => seatBadge(s, id));
  const own = ['poison', 'protect', 'master', 'starpass', 'noop'].includes(e.res) && !SRC_VERB[e.src] && (e.word || OWN_VERB[e.src] || ACTS[e.src]?.mark);
  const [verb, k] = e.res === 'fail' ? [SRC_VERB[e.src] || ACTS[e.src]?.mark || '行動'] : own ? [own, ACTS[e.src]?.tone === 'evil' ? 'bad' : ''] : RES[e.res] || ['行動'];
  return [w(verb, k), seats, e.role && named(e.role), e.res === 'fail' && w('失效', 'muted'), e.why && w(WHY[e.why] || '', ['notdemon', 'nottown', 'notgood', 'inplay', 'absent'].includes(e.why) ? 'muted' : 'good'),
    e.heir ? [w('接任', 'bad'), seatBadge(s, e.heir)] : e.noHeir && w('沒有人接任', 'muted')];
}

// 莽夫：誰選中他醉酒，他的陣營變沒變
export const goonRow = (s, e) => [seatBadge(s, e.seat), w('醉酒', 'evil'), seatBadge(s, e.goon), mini('goon'),
  e.changed ? [w('變成'), w(e.align === 'evil' ? '邪惡' : '善良', e.align === 'evil' ? 'evil' : 'good')] : w('陣營不變', 'muted')];

// 操作卡上的一行：這一步選中了莽夫
export const goonLine = (s, step) => step.goon && h('div', { class: 'frm' }, goonRow(s, step.goon));

function body(s, e) {
  switch (e.k) {
    case 'goon': return goonRow(s, e);
    case 'word': return [mini(e.role), seatBadge(s, e.seat), e.to ? [w('選'), seatBadge(s, e.to)] : w('沒有選', 'muted')];
    case 'juggle': return [mini('juggler'), seatBadge(s, e.seat), w('猜'), seatBadge(s, e.to), named(e.role)];
    case 'setup': return formula(s, [{ grim: e.grim }]);
    case 'bluffs': return [tag('bluff'), e.bluffs.map(r => named(r)),
      e.herring && [h('i', { class: 'op-br' }), named('fortuneteller'), w('紅鯡魚'), seatBadge(s, e.herring)]];
    case 'act': return [mini(e.src), seatBadge(s, e.seat), actRow(s, e)];
    // why：為什麼能給錯誤信息（中毒、醉酒、渦流）。舊日誌只有 free，那時 free 就是這個意思
    case 'info': return [mini(e.src), seatBadge(s, e.seat), (e.why || (e.free && !('why' in e))) && w(BENT[e.why] || '中毒/醉酒', 'evil'),
      h('span', { class: 'lv lv' + e.level }, formula(s, e.f))];
    case 'sent': return [e.src === 'lunainfo' ? mini('lunatic') : tag(e.src === 'demoninfo' ? 'demon' : 'minion'), w('已告知')];
    case 'card': return [seatBadge(s, e.seat), e.f.length ? [w('選了'), formula(s, e.f)] : w('沒有選', 'muted')];
    case 'told': return [w('告知'), seatBadge(s, e.seat), e.fake && w('假信息', 'evil'), formula(s, e.f)];
    case 'skip': return [mini(e.src), e.seat && seatBadge(s, e.seat), w('跳過', 'muted')];
    case 'death': return [seatBadge(s, e.seat), mini(e.role), w(CAUSE[e.cause] || '死亡', 'bad')];
    case 'demon': return [seatBadge(s, e.seat), w('成為', 'bad'), named(e.role), w(e.why === 'scarletwoman' ? '（紅唇女郎）' : '（傳位）', 'muted')];
    case 'nom': return [seatBadge(s, e.from), w('提名', 'bad'), seatBadge(s, e.to)];
    case 'votes': return [seatBadge(s, e.to), w('得票'), h('b', { class: 'num plain' }, e.voters.length), h('small', {}, '/', e.need),
      w(...VOTE[e.res]), h('span', { class: 'voters' }, e.voters.map(id => seatBadge(s, id, 'sm'))),
      (e.abstain || e.against)?.length > 0 && [w('棄權', 'muted'), h('span', { class: 'voters' }, (e.abstain || e.against).map(id => seatBadge(s, id, 'sm')))]];
    case 'slay': return [seatBadge(s, e.from), mini('slayer'), w('射'), seatBadge(s, e.to), w(e.hit ? '命中' : '未中', e.hit ? 'bad' : 'muted')];
    case 'fix': return e.what === 'tell' ? [w('告知', 'ink'), seatBadge(s, e.seat), h('span', { class: 'log-text' }, e.text)] : [w('修正', 'ink'), fixBody(s, e)];
    case 'rule': return [seatBadge(s, e.seat), e.role && mini(e.role), e.why && w(e.why, 'evil'), w('裁定'), w(e.work ? '生效' : '無效', e.work ? 'good' : 'muted')];
    default: return null;
  }
}

function fixBody(s, e) {
  const seat = e.seat && seatBadge(s, e.seat);
  switch (e.what) {
    case 'poison': return [seat, w('設為中毒', 'evil')];
    case 'unpoison': return [seat, w('解除中毒')];
    case 'sober': return [seat, w('解除醉酒')];
    case 'revive': return [seat, w('復活', 'good')];
    case 'role': return [seat, e.from && mini(e.from), w('改為'), named(e.role), e.fake && [w('以為是'), named(e.fake)]];
    case 'herring': return [named('fortuneteller'), w('紅鯡魚'), seat];
    case 'align': return [seat, w('改為'), w(e.align === 'good' ? '善良' : '邪惡', e.align === 'good' ? 'good' : 'evil')];
    case 'execute': return [w('處決', 'bad'), seat];
    default: return seat;
  }
}

const groupKey = l => (l.phase === 'night' ? `n${l.night}` : l.phase === 'lobby' ? 'setup' : `d${l.day}`);
const logRow = (s, l) => {
  const b = l.e && body(s, l.e);
  return h('div', { class: 'log-row' + (l.e ? ` k-${l.e.k}` : ''), title: l.text }, b || h('span', { class: 'log-text' }, l.text));
};

// 按夜晚 / 白天分組的日誌
function logGroups(s, list) {
  const groups = [];
  for (const l of list) {
    const k = groupKey(l);
    if (groups.at(-1)?.k !== k) groups.push({ k, l, rows: [] });
    groups.at(-1).rows.push(l);
  }
  const head = g => (g.k === 'setup' ? '開局' : g.l.phase === 'night' ? `第 ${g.l.night} 夜` : `第 ${g.l.day} 天`);
  return groups.length ? groups.map(g => h('div', { class: 'log-group ' + (g.l.phase === 'night' ? 'night' : 'day') },
    h('div', { class: 'log-head' }, head(g)),
    g.rows.map(l => logRow(s, l))))
    : h('div', { class: 'log-empty' }, icon('quill'));
}
export function renderLog(ctx) {
  return h('div', { class: 'tab-body log2', 'data-scroll': 'log', 'data-stick': '1' }, logGroups(ctx.state, ctx.state.st.log));
}
// 一個座位的記錄：他做過什麼、得知了什麼、被誰選過 / 查過（線下說書人記不住誰查過誰時翻）
const touches = (e, id) => !!e && e.k !== 'setup' && e.k !== 'bluffs' && (e.seat === id || e.from === id || e.goon === id
  || (Array.isArray(e.to) ? e.to.includes(id) : e.to === id) || (e.f || []).some(t => t.s === id));
// 分兩塊：他自己做的、得知的；別人選了他、查到他的（不然點祖母會混進「侍女查到他」這種，看起來像他做的）
const own = (e, id) => e.seat === id || e.from === id;
export const seatLogView = (s, id) => {
  const list = s.st.log.filter(l => touches(l.e, id)), mine = list.filter(l => own(l.e, id)), others = list.filter(l => !own(l.e, id));
  if (!list.length) return h('div', { class: 'log2 seat-log' }, h('div', { class: 'log-empty' }, icon('quill'), h('span', {}, '暫無記錄')));
  return h('div', { class: 'log2 seat-log' },
    mine.length > 0 && [h('h4', { class: 'sl-h' }, '他做的'), logGroups(s, mine)],
    others.length > 0 && [h('h4', { class: 'sl-h' }, '別人對他'), logGroups(s, others)]);
};
