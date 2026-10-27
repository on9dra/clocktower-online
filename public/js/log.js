// 說書人流程日誌：按夜 / 天分組，每一步畫成一行式子（數據見 lib 裏 stLog 的 e）
import { h } from './ui.js';
import { formula, seatBadge, mini, icon, tag, named, w } from './glyph.js';

// 原則：座位號、角色牌是圖；動作和結果用短詞（投毒 / 殺死 / 提名…）
const RES = { poison: ['投毒'], protect: ['保護', 'good'], kill: ['殺死', 'bad'], blocked: ['想殺'], fail: ['失效', 'muted'],
  master: ['認主'], starpass: ['自殺傳位', 'bad'], mayor: ['想殺'] };
const WHY = { protect: '被保護', soldier: '士兵免疫', mayor: '鎮長替死', dead: '已死亡' };
const CAUSE = { demon: '被殺', execute: '被處決', slayer: '被射殺', virgin: '貞潔者反噬', starpass: '傳位', manual: '說書人判定' };
const VOTE = { block: ['上處決台', 'bad'], tie: ['平票'], fail: ['票數不足', 'muted'] };
const SRC_VERB = { poisoner: '投毒', monk: '保護', imp: '想殺', butler: '認主' };

function actRow(s, e) {
  const seats = (e.to || []).map(id => seatBadge(s, id));
  const [verb, k] = e.res === 'fail' ? [SRC_VERB[e.src] || '行動'] : RES[e.res] || ['行動'];
  return [w(verb, k), seats, e.res === 'fail' && w('失效', 'muted'), e.why && w(WHY[e.why] || '', 'good')];
}

function body(s, e) {
  switch (e.k) {
    case 'setup': return formula(s, [{ grim: e.grim }]);
    case 'bluffs': return [tag('bluff'), e.bluffs.map(r => named(r)), h('i', { class: 'op-br' }),
      named('fortuneteller'), w('紅鯡魚'), e.herring && seatBadge(s, e.herring)];
    case 'act': return [mini(e.src), seatBadge(s, e.seat), actRow(s, e)];
    case 'info': return [mini(e.src), seatBadge(s, e.seat), e.free && w('中毒/醉酒', 'evil'),
      h('span', { class: 'lv lv' + e.level }, formula(s, e.f))];
    case 'sent': return [tag(e.src === 'demoninfo' ? 'demon' : 'minion'), w('已告知')];
    case 'skip': return [mini(e.src), e.seat && seatBadge(s, e.seat), w('跳過', 'muted')];
    case 'death': return [seatBadge(s, e.seat), mini(e.role), w(CAUSE[e.cause] || '死亡', 'bad')];
    case 'demon': return [seatBadge(s, e.seat), w('成為', 'bad'), named(e.role), w(e.why === 'scarletwoman' ? '（紅唇女郎）' : '（傳位）', 'muted')];
    case 'nom': return [seatBadge(s, e.from), w('提名', 'bad'), seatBadge(s, e.to)];
    case 'votes': return [seatBadge(s, e.to), w('得票'), h('b', { class: 'num plain' }, e.voters.length), h('small', {}, '/', e.need),
      w(...VOTE[e.res]), h('span', { class: 'voters' }, e.voters.map(id => seatBadge(s, id, 'sm'))),
      (e.abstain || e.against)?.length > 0 && [w('棄權', 'muted'), h('span', { class: 'voters' }, (e.abstain || e.against).map(id => seatBadge(s, id, 'sm')))]];
    case 'slay': return [seatBadge(s, e.from), mini('slayer'), w('射'), seatBadge(s, e.to), w(e.hit ? '命中' : '未中', e.hit ? 'bad' : 'muted')];
    case 'fix': return [w('修正', 'ink'), fixBody(s, e)];
    case 'rule': return [seatBadge(s, e.seat), e.role && mini(e.role), e.why && w(e.why, 'evil'), w('裁定'), w(e.work ? '生效' : '無效', e.work ? 'good' : 'muted')];
    default: return null;
  }
}

function fixBody(s, e) {
  const seat = e.seat && seatBadge(s, e.seat);
  switch (e.what) {
    case 'poison': return [seat, w('設為中毒', 'evil')];
    case 'unpoison': return w('解除中毒');
    case 'revive': return [seat, w('復活', 'good')];
    case 'role': return [seat, e.from && mini(e.from), w('改為'), named(e.role), e.fake && [w('以為是'), named(e.fake)]];
    case 'herring': return [named('fortuneteller'), w('紅鯡魚'), seat];
    case 'execute': return [w('處決', 'bad'), seat];
    case 'tell': return [seat, h('span', { class: 'log-text' }, e.text)];
    default: return seat;
  }
}

const groupKey = l => (l.phase === 'night' ? `n${l.night}` : l.phase === 'lobby' ? 'setup' : `d${l.day}`);

export function renderLog(ctx) {
  const s = ctx.state, st = s.st;
  const groups = [];
  for (const l of st.log) {
    const k = groupKey(l);
    if (groups.at(-1)?.k !== k) groups.push({ k, l, rows: [] });
    groups.at(-1).rows.push(l);
  }
  const head = g => (g.k === 'setup' ? '開局' : g.l.phase === 'night' ? `第 ${g.l.night} 夜` : `第 ${g.l.day} 天`);
  return h('div', { class: 'tab-body log2', 'data-scroll': 'log', 'data-stick': '1' },
    groups.length ? groups.map(g => h('div', { class: 'log-group ' + (g.l.phase === 'night' ? 'night' : 'day') },
      h('div', { class: 'log-head' }, head(g)),
      g.rows.map(l => {
        const b = l.e && body(s, l.e);
        return h('div', { class: 'log-row' + (l.e ? ` k-${l.e.k}` : ''), title: l.text }, b || h('span', { class: 'log-text' }, l.text));
      })))
      : h('div', { class: 'log-empty' }, icon('quill')));
}
