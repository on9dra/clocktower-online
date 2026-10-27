// 提名期間蓋在桌面上的「審判牌」（提名演出播完才出現）：
// 上面是提名者 → 被提名者兩張大牌，中間一枚紅色「提名」印章；
// 下面三欄：贊成的人在左、票數和需要的票格在中、棄權的人在右（只有自己和說書人看得到）；
// 再下面是投票倒數（說書人可暫停 / 重置），最下面是未表態的人和計票進度。
import { h, roleToken } from './ui.js';
import { seatBadge, icon } from './glyph.js';
import { clockState, needVotes, voteButtons } from './flow.js';
import { nomFx } from './fx.js';

export function trialPanel(ctx) {
  const s = ctx.state, nom = s.nomination, ck = clockState(ctx), need = needVotes(s);
  const yes = [], no = [], idle = [];
  for (const seat of s.seats) (nom.votes[seat.id] ? yes : nom.abstain?.[seat.id] ? no : idle).push(seat);
  const num = id => s.seats.findIndex(x => x.id === id) + 1;
  const chip = seat => h('span', {
    class: 'tr-chip' + (seat.mine ? ' mine' : '') + (seat.dead && seat.voteUsed ? ' spent' : ''), 'data-key': 'tc-' + seat.id, title: seat.name,
  }, h('b', {}, num(seat.id)), h('span', {}, seat.name));
  // 大牌：說書人、遊戲結束、自己的座位能看到角色，其餘是座位號空牌
  const token = seat => {
    const r = seat.role || (seat.mine && s.myRole);
    return r ? roleToken(r) : h('div', { class: 'token md blank' }, num(seat.id));
  };
  const who = (id, cls) => {
    const seat = s.seats.find(x => x.id === id);
    return h('div', { class: 'tr-who ' + cls }, token(seat), h('div', { class: 'tr-plate' }, h('b', {}, num(id)), h('span', {}, seat.name)));
  };
  // 玩家：每欄的頂上就是投這一邊的按鈕；說書人和代入視角只顯示欄名
  const vb = voteButtons(ctx);
  // 棄權欄頂下一行小字：別人看不到
  const side = (k, label, ico, list) => h('div', { class: 'tr-side ' + k },
    vb ? h('div', { class: 'tr-k' }, vb[k](list.length)) : h('div', { class: 'tr-k' }, icon(ico), label, h('i', {}, list.length)),
    k === 'no' && h('div', { class: 'tr-priv' }, icon('hidden'), s.isSt ? '僅本人與說書人可見' : '僅你與說書人可見'),
    h('div', { class: 'tr-chips' }, list.map(chip)));
  return h('div', { class: 'trial' + (nomFx() ? ' fx-pop' : ''), style: nomFx(), 'data-key': 'trial' },
    h('div', { class: 'tr-head' }, who(nom.nominatorId, 'from'),
      h('div', { class: 'tr-verb' }, h('span', { class: 'tr-stamp' }, '提名'), icon('to')), who(nom.nomineeId, 'to')),
    h('div', { class: 'tr-body' },
      side('yes', '贊成', 'hand', yes),
      h('div', { class: 'tr-mid' + (yes.length >= need ? ' enough' : '') },
        h('b', { class: 'tr-num', 'data-key': 'n' + yes.length }, yes.length),
        h('div', { class: 'tr-slots', title: `需 ${need} 票` }, Array.from({ length: Math.max(need, yes.length) }, (_, i) => h('i', { class: i < yes.length ? 'on' : '' })))),
      side('no', '棄權', 'abstain', no)),
    !ck && timerBar(ctx, nom),
    (idle.length > 0 || ck) && h('div', { class: 'tr-foot' },
      idle.length > 0 && h('div', { class: 'tr-idle', title: '未表態' }, idle.map(chip)),
      ck && h('div', { class: 'tr-clock', title: '計票' }, icon('hand', 'tr-k-ico'),
        nom.clock.order.map((id, i) => h('span', {
          class: 'sb' + (i < ck.k ? ' past' : '') + (!ck.done && !ck.pending && i === ck.k ? ' now' : '') + (nom.votes[id] ? ' up' : ''), title: seatBadge(s, id).title,
        }, num(id))))));
}

// 投票倒數：提名後 5 分鐘，到點按當前舉手結算。說書人可以暫停 / 繼續、重置；最後 30 秒變紅
const WINDOW = 5 * 60 * 1000;
function timerBar(ctx, nom) {
  const paused = nom.paused != null, left = Math.max(0, paused ? nom.paused : nom.deadline - ctx.now());
  const sec = Math.ceil(left / 1000), mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const tb = (ico, op, title) => h('button', { class: 'tr-tbtn', title, onclick: () => ctx.st(op) }, icon(ico));
  return h('div', { class: 'tr-auto' + (paused ? ' paused' : sec <= 30 ? ' low' : '') }, icon(paused ? 'pause' : 'timer'), h('b', {}, mmss),
    ctx.state.isSt && [tb(paused ? 'play' : 'pause', 'pauseTimer', paused ? '繼續' : '暫停'), tb('reset', 'resetTimer', '重置為 5 分鐘')],
    h('i', { class: 'tr-bar', style: { transform: `scaleX(${Math.min(1, left / WINDOW)})` } }));
}
