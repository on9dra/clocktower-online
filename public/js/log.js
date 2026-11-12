// 說書人流程日誌：按開局 / 夜 / 天分組（數據見 lib 裏 stLog 的 e）。
// 開局畫成一張小圓桌：座位排法和桌面一樣（1 號在正上方，順時針），中間是惡魔的偽裝和紅鯡魚。
// 之後每一行是「誰 | 做了什麼」兩欄：左欄座位 + 角色牌 + 角色名，夜裏一列下來就是喚醒順序；
// 右欄是一句話：動詞 + 對象 + 結果。座位、角色畫成圖，關係詞（以為是 / 得知 / 但 / 接任）照寫，不省
import { h, roleToken } from './ui.js';
import { ROLES, FAKE } from './roles.js';
import { getLang } from './lang.js';
import { formula, seatBadge, mini, icon, tag, named, w, ACTS } from './glyph.js';

const RES = { poison: ['投毒'], protect: ['保護', 'good'], kill: ['殺死', 'bad'], blocked: ['攻擊'], fail: ['失效', 'muted'],
  master: ['認主'], starpass: ['自殺傳位', 'bad'], mayor: ['攻擊'], charge: ['蓄力', 'bad'], noop: ['行動'] };
const WHY = { protect: '被保護', soldier: '士兵免疫', mayor: '鎮長替死', dead: '已死亡', tealady: '茶藝師保護', fool: '弄臣免死', sailor: '水手免死', safe: '被保護',
  notdemon: '不是惡魔', nottown: '不是鎮民', notgood: '不是善良', inplay: '已在場', absent: '不在場' };
const BENT = { poison: '中毒', drunk: '醉酒', tipsy: '醉酒', puppet: '提線木偶', vortox: '渦流在場' }; // 信息可以給錯的原因
const DIED = { demon: '被惡魔殺死', execute: '被處決', slayer: '被獵手射殺', virgin: '提名貞潔者，被處決', starpass: '自殺傳位', manual: '說書人判定死亡' };
const VOTE = { block: ['上處決台', 'bad'], tie: ['平票'], fail: ['票數不足', 'muted'] };
const SRC_VERB = { poisoner: '投毒', monk: '保護', imp: '攻擊', butler: '認主' };
const SENT = { minioninfo: ['minion', '得知惡魔和其他爪牙'], demoninfo: ['demon', '得知爪牙和三個偽裝'] };
const FAKE_WHY = new Set(['酒鬼', '瘋子', '提線木偶']); // 左欄已經畫著真實角色，不再寫一遍

// 句子裏接下一段：一個逗號 + 下一段。逗號黏在前一項的後面（glue），換行時不會落到下一行的開頭
const comma = () => h('i', { class: 'lg-cm' }, getLang() === 'en' ? ',' : '，');
const then = (text, k = '') => [comma(), text && w(text, k)];
function glue(parts) {
  const out = [];
  for (const p of [parts].flat(Infinity)) {
    if (p == null || p === false || p === '') continue;
    if (p.classList?.contains('lg-cm') && out.length) {
      let t = out.at(-1);
      while (t.classList?.contains('frm') && t.lastElementChild) t = t.lastElementChild; // 式子是 display: contents，黏在它的最後一項上
      if (t.classList?.contains('w')) { t.append(p); continue; } // 一段字：逗號接在字後面，字本身還能折行
      const nb = h('span', { class: 'lg-nb' });
      if (t === out.at(-1)) out[out.length - 1] = nb; else t.replaceWith(nb);
      nb.append(t, p);
    } else out.push(p);
  }
  return out;
}
const roleName = r => ROLES[r]?.name || r;

// 左欄：座位號 + 角色牌 + 角色名。沒有角色的（提名、投票）只有座位號；說書人自己改的寫「說書人」
const who = (s, id, role) => h('span', { class: 'lg-who' }, id && seatBadge(s, id), role && [mini(role), h('b', {}, roleName(role))]);
const stWho = () => h('span', { class: 'lg-who st' }, icon('quill'), h('b', {}, '說書人'));

// 行動者真正的角色：新日誌記在 e.real；舊日誌按座位現在的角色找（酒鬼 / 瘋子 / 提線木偶以為自己是 src）
function realOf(s, e) {
  if (e.real) return e.real;
  const as = e.src || e.role, seat = e.seat && s.seats.find(x => x.id === e.seat);
  return seat?.role && FAKE[seat.role] && seat.role !== as && seat.fakeRole === as ? seat.role : null;
}

// 新劇本的角色：投毒 / 保護 / 認主這類「落到目標上」的結果，按角色換成它自己的動作詞（詛咒、瘋狂、變身、驅魔……）
const OWN_VERB = { snakecharmer: '交換', eviltwin: '雙子', fanggu: '跳身' };
// 夜晚行動的句子：動詞 + 對象（+ 選的角色），然後是結果：無效、被誰擋下、誰接任。操作卡上的結果也用它
export function actRow(s, e) {
  const seats = (e.to || []).map(id => seatBadge(s, id));
  const own = ['poison', 'protect', 'master', 'starpass', 'noop'].includes(e.res) && !SRC_VERB[e.src] && (e.word || OWN_VERB[e.src] || ACTS[e.src]?.mark);
  const [verb, k] = e.res === 'fail' ? [SRC_VERB[e.src] || ACTS[e.src]?.verb || ACTS[e.src]?.mark || '行動'] : own ? [own, ACTS[e.src]?.tone === 'evil' ? 'bad' : ''] : RES[e.res] || ['行動'];
  const why = e.why && WHY[e.why];
  return glue([w(verb, k), seats, e.role && named(e.role),
    e.res === 'fail' ? then('無效', 'muted')
      : why && (e.res === 'blocked' ? then(`但${why}`, 'good') : then(why, ['notdemon', 'nottown', 'notgood', 'inplay', 'absent'].includes(e.why) ? 'muted' : 'good')),
    e.heir ? [then(''), seatBadge(s, e.heir), w('接任', 'bad')] : e.noHeir && then('沒有人接任', 'muted')]);
}

// 莽夫：誰選中了他，選的人醉酒，莽夫的陣營變沒變。log：日誌左欄已經是選的人，句子從「選中」開始
export const goonRow = (s, e, log = false) => glue([!log && seatBadge(s, e.seat), w('選中莽夫'), seatBadge(s, e.goon),
  !log ? [then(''), seatBadge(s, e.seat)] : then(''), w(log ? '自己醉酒' : '醉酒', 'evil'),
  e.changed ? [then('莽夫變成'), w(e.align === 'evil' ? '邪惡' : '善良', e.align === 'evil' ? 'evil' : 'good')] : then('莽夫陣營不變', 'muted')]);

// 操作卡上的一行：這一步選中了莽夫
export const goonLine = (s, step) => step.goon && h('div', { class: 'frm' }, goonRow(s, step.goon));

// 裁定：大多是「能力生效 / 無效」；寫在受影響的人身上的（女巫、心上人、亡骨魔）左欄只有座位，句子裏說是誰的能力
const BY_SRC = {
  witch: e => [named('witch'), w('詛咒了他'), then(e.work ? '提名後死亡' : '提名後沒死', e.work ? 'bad' : 'muted')],
  sweetheart: () => [named('sweetheart'), w('死亡'), then('他從此醉酒', 'evil')],
  vigormortis: e => [named('vigormortis'), e.why ? [w('殺死了他鄰座的爪牙'), then('他中毒', 'evil')] : [w('殺死了他'), then('他保留能力', 'evil')]],
};
const RULE_SAY = {
  grandmother: '孫子被惡魔殺死，她也死亡',
  mastermind: '惡魔被處決，遊戲再進行一夜一天',
  eviltwin: '惡魔死了，但雙子都活著：善良還不能獲勝',
};
function ruleRow(s, e) {
  if (BY_SRC[e.role]) return [who(s, e.seat), BY_SRC[e.role](e)];
  // 沒有角色的裁定：以為自己是獵手 / 貞潔者的酒鬼（別人只是喊喊，沒有 why）
  if (!e.role) {
    const seat = s.seats.find(x => x.id === e.seat);
    if (e.why && seat && FAKE[seat.role] && seat.fakeRole) e = { ...e, role: seat.fakeRole, real: seat.role };
  }
  const real = realOf(s, e), why = e.why && !(real && FAKE_WHY.has(e.why)) && w(e.why, 'evil');
  const say = e.work && RULE_SAY[e.role] ? w(RULE_SAY[e.role], 'ink') : w(e.work ? '能力生效' : '能力無效', e.work ? 'good' : 'muted');
  return [who(s, e.seat, real || e.role), [real && [w('以為是'), named(e.role), then('')], why, why && then(''), say]];
}

function body(s, e) {
  switch (e.k) {
    case 'act': {
      const real = realOf(s, e), bent = e.failWhy && !(real && FAKE_WHY.has(e.failWhy)) && e.failWhy;
      return [who(s, e.seat, real || e.src), [real && [w('以為是'), named(e.src), then('')], bent && [w(bent, 'evil'), then('')], actRow(s, e)]];
    }
    // 得知的信息：假身份寫「以為是 X，得知……」，中毒 / 醉酒寫「中毒，得知……」；說書人給了錯的、靠登記成立的在句末標出來
    case 'info': {
      const real = realOf(s, e), bent = !real && (e.why || (e.free && !('why' in e) && 'poison')); // 舊日誌只有 free，那時 free 就是中毒 / 醉酒
      return [who(s, e.seat, real || e.src), [real ? [w('以為是'), named(e.src), then('得知：')] : bent ? [w(BENT[bent] || '中毒', 'evil'), then('得知：')] : w('得知：'),
        formula(s, e.f), e.level === 0 ? then('錯誤信息', 'evil') : e.level === 1 && then('靠登記成立', 'brass')]];
    }
    case 'sent': {
      if (e.src === 'lunainfo') return [who(s, null, 'lunatic'), [w('以為是'), tag('demon'), then('得知假的爪牙和偽裝'), then('已告知', 'muted')]];
      const [team, say] = SENT[e.src] || ['minion', '已告知'];
      return [h('span', { class: 'lg-who' }, tag(team)), [w(say), then('已告知', 'muted')]];
    }
    case 'told': { // 瘋子看到的假信息
      const seat = s.seats.find(x => x.id === e.seat), real = e.fake && seat?.role === 'lunatic' ? 'lunatic' : null;
      return [who(s, e.seat, real), [real ? [w('以為是'), tag('demon'), then('得知：')] : w('得知：'), formula(s, e.f), e.fake && !real && then('假信息', 'evil')]];
    }
    case 'card': {
      const real = e.src && realOf(s, e);
      return [who(s, e.seat, real || e.src), [real && [w('以為是'), named(e.src), then('')], e.f.length ? [w('選了'), formula(s, e.f)] : w('沒有選人', 'muted')]];
    }
    case 'skip': return [who(s, e.seat, e.src), w('跳過', 'muted')];
    case 'note': { const real = realOf(s, e); return [who(s, e.seat, real || e.src), [real && [w('以為是'), named(e.src), then('')], h('span', { class: 'lg-say' }, e.say)]]; }
    case 'goon': return [who(s, e.seat), goonRow(s, e, true)];
    case 'word': return [who(s, e.seat, e.role), e.to ? [w('選了'), seatBadge(s, e.to)] : w('沒有選人', 'muted')];
    case 'juggle': return [who(s, e.seat, 'juggler'), [w('猜'), seatBadge(s, e.to), w('是'), named(e.role)]];
    case 'rule': return ruleRow(s, e);
    case 'death': return [who(s, e.seat, e.role), [icon('skull', 'lg-skull'), w(DIED[e.cause] || '死亡', 'bad')]];
    case 'demon': return [who(s, e.seat), [w('成為', 'bad'), named(e.role), then(e.why === 'scarletwoman' ? '紅唇女郎接任' : '惡魔傳位給他', 'muted')]];
    case 'nom': return [who(s, e.from), [w('提名', 'bad'), seatBadge(s, e.to)]];
    case 'votes': return [who(s, e.to), [w('得票'), h('b', { class: 'lg-n' }, e.voters.length, h('small', {}, '/', e.need)), then(...VOTE[e.res]),
      e.voters.length > 0 && h('span', { class: 'lg-voters' }, icon('hand'), e.voters.map(id => seatBadge(s, id, 'sm'))),
      (e.abstain || e.against)?.length > 0 && h('span', { class: 'lg-voters off' }, w('棄權', 'muted'), (e.abstain || e.against).map(id => seatBadge(s, id, 'sm')))]];
    case 'slay': return [who(s, e.from), [w('開槍', 'bad'), seatBadge(s, e.to), then(e.hit ? '命中' : '沒有命中', e.hit ? 'bad' : 'muted')]];
    case 'fix': return [stWho(), fixBody(s, e)];
    case 'bluffs': return [h('span', { class: 'lg-who' }, tag('bluff')), [e.bluffs.map(r => named(r)), e.herring && [then(''), named('fortuneteller'), w('的紅鯡魚'), seatBadge(s, e.herring)]]];
    default: return null;
  }
}

function fixBody(s, e) {
  const seat = e.seat && seatBadge(s, e.seat);
  switch (e.what) {
    case 'poison': return [seat, w('設為中毒', 'evil')];
    case 'drunk': return [seat, w('設為醉酒', 'evil')];
    case 'unpoison': return [seat, w('解除中毒')];
    case 'sober': return [seat, w('解除醉酒')];
    case 'revive': return [seat, w('復活', 'good')];
    case 'role': return [seat, e.from && mini(e.from), w('改為'), named(e.role), e.fake && [then('他以為是'), named(e.fake)]];
    case 'herring': return [named('fortuneteller'), w('紅鯡魚'), seat];
    case 'align': return [seat, w('改為'), w(e.align === 'good' ? '善良' : '邪惡', e.align === 'good' ? 'good' : 'evil')];
    case 'execute': return [w('處決', 'bad'), seat];
    case 'tell': return [w('告知'), seat, h('span', { class: 'log-text' }, e.text)];
    case 'win': return [w('判定'), w(e.team === 'good' ? '善良獲勝' : '邪惡獲勝', e.team === 'good' ? 'good' : 'evil')];
    default: return seat;
  }
}

// 開局的小圓桌：角色牌按桌上的位置圍一圈，座位號在牌的內側；酒鬼 / 瘋子 / 提線木偶的牌邊上騎一枚虛線小牌（他以為的角色）
function setupTable(s, e, bl) {
  const n = e.grim.length;
  const seats = e.grim.map(([id, r, st = {}], i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a);
    return h('span', { class: 'lt-seat', style: { left: 50 + 38 * ux + '%', top: 50 + 38 * uy + '%', '--ux': ux.toFixed(3), '--uy': uy.toFixed(3) } },
      roleToken(r), st.fake && h('span', { class: 'lt-fake', title: `以為是${roleName(st.fake)}` }, roleToken(st.fake, { size: 'xs' })),
      seatBadge(s, id, 'lt-no'));
  });
  return h('div', { class: 'lt', style: { '--s': Math.sin(Math.PI / Math.max(n, 3)).toFixed(4) } },
    h('i', { class: 'lt-ring' }), seats,
    bl && h('div', { class: 'lt-mid' },
      bl.bluffs?.length > 0 && [tag('bluff'), h('span', { class: 'lt-bluffs' }, bl.bluffs.map(r => roleToken(r)))],
      bl.herring && h('span', { class: 'lt-herring' }, icon('fish'), w('紅鯡魚', 'evil'), seatBadge(s, bl.herring))));
}

// 中毒 / 醉酒的裁定緊跟著那一步「無效」的行動：合成一行（「中毒，投毒 ④，無效」），不然同一件事寫兩遍
function fold(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i], nx = list[i + 1];
    if (l.e?.k === 'rule' && !l.e.work && nx?.e?.k === 'act' && nx.e.res === 'fail' && nx.e.seat === l.e.seat && !nx.e.failWhy) {
      out.push({ ...nx, e: { ...nx.e, failWhy: l.e.why } });
      i++;
    } else out.push(l);
  }
  return out;
}

const groupKey = l => (l.phase === 'night' ? `n${l.night}` : l.phase === 'lobby' ? 'setup' : `d${l.day}`);
function logRow(s, l) {
  const b = l.e && body(s, l.e);
  if (!b) return h('div', { class: 'log-row wide', title: l.text }, h('span', { class: 'log-text' }, l.text));
  const [left, right] = b;
  return h('div', { class: 'log-row k-' + l.e.k, title: l.text }, left, h('span', { class: 'lg-what' }, glue(right)));
}
function groupRows(s, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i].e;
    if (e?.k === 'setup') {
      const bl = rows[i + 1]?.e?.k === 'bluffs' ? rows[++i].e : null;
      out.push(setupTable(s, e, bl));
    } else out.push(logRow(s, rows[i]));
  }
  return out;
}

// 按夜晚 / 白天分組的日誌
function logGroups(s, list) {
  const groups = [];
  for (const l of fold(list)) {
    const k = groupKey(l);
    if (groups.at(-1)?.k !== k) groups.push({ k, l, rows: [] });
    groups.at(-1).rows.push(l);
  }
  const head = g => (g.k === 'setup' ? [icon('quill'), '開局'] : g.l.phase === 'night' ? [icon('moon'), `第 ${g.l.night} 夜`] : [icon('sun'), `第 ${g.l.day} 天`]);
  return groups.length ? groups.map(g => h('div', { class: 'log-group ' + (g.k === 'setup' ? 'setup' : g.l.phase === 'night' ? 'night' : 'day') },
    h('div', { class: 'log-head' }, head(g)),
    groupRows(s, g.rows)))
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
