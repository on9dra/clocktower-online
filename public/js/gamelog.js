// 遊戲日誌：公開發生的事，按輕重排版。階段是分割線；死亡 / 處決是重的一行；提名、得票是普通一行；
// 計票、取消、無事發生是淡的小字；終局是一塊橫幅。說書人的公告是一張便條。數據見 lib/util.js announce 的 e
import { h } from './ui.js';
import { seatBadge, mini, icon, w, named } from './glyph.js';

// 座位號 + 名字（日誌是給人讀的，光有號碼不好認）
const who = (s, id) => h('span', { class: 'gl-who' }, seatBadge(s, id), h('span', { class: 'gl-name' }, s.seats.find(x => x.id === id)?.name || ''));
const VOTE = { block: ['上處決台', 'bad'], tie: ['平票'], fail: ['票數不足', 'muted'] };

// [輕重, 內容]：0 淡、1 普通、2 重；'div' 分割線、'win' 橫幅
function entry(s, e) {
  switch (e.k) {
    case 'start': return ['div', [icon('quill'), '開局', h('small', {}, e.n, ' 人')]];
    case 'lobby': return ['div', ['回到準備']];
    case 'night': return ['div', [icon('moon'), `第 ${e.n} 夜`], 'night'];
    case 'day': return ['div', [icon('sun'), `第 ${e.n} 天`], 'day'];
    case 'dawn': return e.deaths?.length ? [2, [icon('skull'), e.deaths.map(id => who(s, id)), w('死亡', 'bad')]] : [0, [w('平安夜')]];
    case 'revive': return [2, [who(s, e.seat), w('復活', 'good')]];
    case 'nom': return [1, [who(s, e.from), w('提名', 'bad'), who(s, e.to)]];
    case 'votes': return [e.res === 'block' ? 1.5 : 1, [who(s, e.to), w('得票'), h('b', { class: 'gl-num' }, e.n, h('small', {}, '/', e.need)), w(...VOTE[e.res]),
      e.voters?.length > 0 && h('span', { class: 'gl-voters' }, icon('hand'), e.voters.map(id => seatBadge(s, id, 'sm')))]];
    case 'count': return [0, [icon('timer'), w('立即計票')]];
    case 'cancel': return [0, [w('提名取消')]];
    case 'slay': return [1, [who(s, e.from), icon('aim', 'gl-aim'), w('開槍', 'bad'), who(s, e.to)]];
    case 'slayhit': return [2, [icon('skull'), who(s, e.seat), w('倒下', 'bad')]];
    case 'slaymiss': return [0, [w('無事發生')]];
    case 'virgin': return [2, [icon('bolt'), who(s, e.seat), mini('virgin'), w('反噬', 'bad'), who(s, e.from), w('處決', 'bad')]];
    case 'execute': return [2, [icon('noose'), who(s, e.seat), w('被處決', 'bad')]];
    case 'survive': return [2, [who(s, e.seat), w('沒有死亡', 'good')]];
    case 'noexec': return [0, [w('今天無人被處決')]];
    // 雜耍藝人公開猜、月之子 / 呆瓜死後公開選人：誰（帶他公開的角色）猜 / 選了誰
    case 'juggle': return [1, [who(s, e.seat), mini('juggler'), w('猜'), who(s, e.to), w('是'), named(e.role)]];
    case 'word': return [1, [who(s, e.seat), mini(e.role), e.to ? [w('選了'), who(s, e.to)] : w('沒有選人', 'muted')]];
    case 'win': return ['win', [h('b', {}, e.team === 'good' ? '善良獲勝' : '邪惡獲勝'), h('small', {}, e.reason)], e.team];
    case 'mvp': return e.seats?.length ? [1, [icon('star', 'gl-mvp'), w('MVP', 'brass'), e.seats.map(id => who(s, id)), w(`${e.n} 票`)]] : [0, [w('沒有人得到 MVP 票')]];
    default: return null;
  }
}

function row(s, m) {
  if (m.from === 'sys') {
    const [lv, body, tone] = (m.e && entry(s, m.e)) || [1, [m.text]];
    if (lv === 'div') return h('div', { class: 'gl-div ' + (tone || ''), title: m.text }, h('span', {}, body));
    if (lv === 'win') return h('div', { class: 'gl-win ' + tone, title: m.text }, body);
    return h('div', { class: 'gl-row gl-' + String(lv).replace('.', ''), title: m.text }, body);
  }
  // 說書人對所有人的公告：便條
  return h('div', { class: 'gl-st' }, h('div', { class: 'gl-st-k' }, icon('sound'), '說書人'), h('div', { class: 'pre' }, m.text));
}

export function renderGameLog(ctx, msgs, composer) {
  const s = ctx.state;
  return h('div', { class: 'tab-body chat' },
    h('div', { class: 'glog', 'data-scroll': 'glog', 'data-stick': '1' },
      msgs.length ? msgs.map(m => row(s, m)) : h('div', { class: 'log-empty' }, icon('quill'))),
    composer);
}
