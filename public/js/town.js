// 桌面：座位圍成一圈。支持“選人模式”（夜晚行動 / 說書人代選）
import { h, menu, roleToken, toast, seatLabel, ask, prompt2, modal, closeModal } from './ui.js';
import { ROLES, TEAMS, SCRIPTS } from './roles.js';
import { openChat, chatUnread, pickGuess, guesses, notes, addNote, clearNotes, infoMarksBySeat, markView, actMarksBySeat, actMarkView } from './side.js';
import { fxFor, syncDelay, heldAlive, nomHeld, shownBlock, liveBlock, seatAway, execActive, clockFx, shotHeld, BLK_MS, shownEggs, nightHeld, heldFace } from './fx.js';
import { seatCrown, mvpVoting, mvpButton, mvpTag, mvpPane, scoreRow } from './scores.js';
import { mini, tag, icon, roleIcon, gallows, demonMark, w, seatBadge } from './glyph.js';
import { hudLinked } from './hud.js';
import { trialPanel, trialStub } from './trial.js';
import { seatPicking } from './infoform.js';
import { stepCard, decidePicking, lastWordCard } from './stepcard.js';
import { clockState, blockLines, playerCenter, stCenter, rulingCard, reviewCard, scriptPick, isFolded, foldButton, foldStub } from './flow.js';
import { pickRole, pickShown, canHover, hoverSeat, leaveSeat, closePick, pickingSeat } from './setup.js';
import { handBubble, composePicking, startCompose, startNominate, mayNominate, openCard, openReminders } from './manual.js';
import { openSeatLink } from './invite.js';

// 當前的選人狀態：{ count, notSelfId, ids, key }
export const sel = { on: null };
let lastBubble = null;
export function startSelect(ctx, opts) { sel.on = { ids: [], ...opts }; ctx.render(); }
export function stopSelect(ctx) { sel.on = null; ctx.render(); }

// 圓桌中間的小字：說書人在桌邊說話的口吻（玩家和說書人各一句；觀戰的人沒有座位，不叫他閉眼、提名）
const PHASE = s => ({
  lobby: ['準備'],
  night: [`第 ${s.night} 夜`, !s.isSt ? (s.myId ? '閉上眼，輪到你時我會叫你' : '大家都閉上了眼') : s.st?.step?.status === 'review' ? '天快亮了，核對一下今晚' : '按順序叫醒他們'],
  dawn: ['天亮了', s.isSt ? '準備好就開始白天' : '睜開眼，聽聽昨晚發生了什麼'],
  day: [`第 ${s.day} 天`, s.dayOver ? '今天已經處決過人了' : '討論時間'],
  ended: [s.winner === 'good' ? '善良獲勝' : '邪惡獲勝', s.winReason],
}[s.phase]);

export function renderTown(ctx) {
  const s = ctx.state;
  const n = s.seats.length;
  const nom = s.nomination, ck = clockState(ctx);
  clockFx(s, ck);
  const g = s.isSt || s.peek ? {} : guesses(ctx); // 猜測和備註存在本機：說書人代入時不畫（那是說書人自己的，不是這位玩家的）
  const auto = s.isSt ? {} : infoMarksBySeat(s), mine = s.isSt || s.peek ? {} : notes(ctx), acts = actMarksBySeat(s), aim = canAim(s);
  // 爪牙 / 惡魔信息裏得知的邪惡隊友：頭像直接換成陣營牌（座位下面就不再重複標）
  const team = Object.fromEntries(Object.entries(auto).flatMap(([id, ks]) => ks.filter(k => k.t).slice(0, 1).map(k => [id, k.t])));
  const missed = (s.shots || []).filter(x => !x.hit && !shotHeld(x)), num = id => s.seats.findIndex(x => x.id === id) + 1;
  const ring = h('div', { class: 'ring' + (n > 10 ? ' crowded' : ''), style: { '--s': Math.sin(Math.PI / Math.max(n, 2)).toFixed(4) } }); // --s：按相鄰座位的距離定大小（board.css）
  const pk = pickingNow(ctx), linked = hudLinked(s), voting = mvpVoting(s), aimed = stepTargets(s);
  const hoverPick = s.isSt && !s.peek && s.phase === 'lobby' && canHover(); // 準備階段：懸停頭像就能選角色（setup.js）
  // 準備階段說書人桌上的牌：帶 key，換了角色是一張新牌，蓋下來（hud.css）
  const dealt = id => { const t = roleToken(id); if (s.phase === 'lobby') t.setAttribute('data-key', id); return t; };
  const unread = chatUnread(s);
  // 私聊未讀：發送者身旁冒聊天氣泡，點開直接進那個頻道
  const pop = (ch, who) => unread[ch] && h('div', {
    class: 'chat-pop', 'data-key': 'pop-' + ch, 'data-exit': true, title: '私聊',
    onclick: e => { e.stopPropagation(); openChat(ctx, ch); },
  }, who && h('b', {}, who), h('span', {}, unread[ch].last.text ?? '…'), unread[ch].n > 1 && h('i', { class: 'count' }, unread[ch].n));
  // 公共頻道：最新一條未讀在說話的人身旁冒幾秒（說書人的在圓桌中央），淡掉之後紅點還在
  const said = unread.all?.last;
  const pub = (id, who) => said?.from === id && h('div', {
    class: 'chat-pop pub', 'data-key': 'pub-' + said.seq, title: '公共',
    onclick: e => { e.stopPropagation(); openChat(ctx, 'all'); },
  }, h('b', {}, who), h('span', {}, said.text));

  s.seats.forEach((seat, i) => {
    const ang = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const cls = ['seat'];
    const dead = seat.dead && !heldAlive(seat.id); // 演出還沒播到這個座位時先顯示活著
    if (dead) cls.push('dead');
    if (linked.has(seat.id)) cls.push('linked');
    if (pk) {
      if (pk.fixed.has(seat.id)) cls.push('fixed-pick');
      else if (pk.on.has(seat.id)) cls.push('selected');
      else if (pk.can.has(seat.id)) cls.push('selectable');
    } else if (aimed.has(seat.id) || pickingSeat() === seat.id) cls.push('aimed');
    if (seat.mine) cls.push('mine');
    if (s.st?.hand?.cards.some(c => c.seatId === seat.id && !c.done)) cls.push('acting');
    if (nom && nom.nomineeId === seat.id) cls.push('nominee');
    if (nom && nom.nominatorId === seat.id) cls.push('nominator');
    if (liveBlock(s) === seat.id) cls.push('onblock');
    if (ck && !ck.done && ck.current === seat.id) cls.push('clock');
    if (ck && ck.locked(seat.id)) cls.push('counted');
    if (sel.on) {
      cls.push(sel.on.notSelfId === seat.id || sel.on.last?.includes(seat.id) || (sel.on.alive && seat.dead) || (sel.on.dead && !seat.dead) ? 'unselectable' : 'selectable');
      if (sel.on.ids.includes(seat.id)) cls.push('selected');
    }
    // 坐上處決台的人：座位上只留一個虛線空位，頭像在圓桌中間
    const token = seatAway(s, seat.id) ? h('div', { class: 'token md blank away' }, i + 1)
      : seat.role ? dealt(seat.role)
        : seat.mine && s.myRole ? roleToken(heldFace() || s.myRole)
          : team[seat.id] ? teamToken(team[seat.id])
            : g[seat.id] ? h('div', { class: 'guess' }, roleToken(g[seat.id]))
              : h('div', { class: 'token md blank' }, i + 1);
    const died = fxFor('died', seat.id, 1400), voted = fxFor('lock', seat.id, 400) || fxFor('voted', seat.id, 600);
    if (died) cls.push(died.cls);
    // 今天的提名情況：誰已經提名過、誰已經被提名過（每人每天各一次）
    const nominated = s.phase === 'day' && s.nominators.includes(seat.id), nominee = s.phase === 'day' && s.nominees.includes(seat.id);
    ring.append(h('div', {
      class: cls.join(' '), 'data-key': seat.id,
      // --ux、--uy：座位在圓桌上的方向，標記朝圓心掛（board.css .seat-more）
      style: { left: 50 + 41 * Math.cos(ang) + '%', top: 50 + 41 * Math.sin(ang) + '%', '--ux': Math.cos(ang).toFixed(3), '--uy': Math.sin(ang).toFixed(3), ...(died && died.style), ...(nom && nom.nomineeId === seat.id ? syncDelay(1600) : {}) },
      onclick: e => onSeat(ctx, seat, e.currentTarget),
    },
    h('div', { class: 'seat-token', onmouseenter: hoverPick ? e => hoverSeat(ctx, seat.id, e.currentTarget) : null, onmouseleave: hoverPick ? leaveSeat : null }, token,
      // 說書人：假身份（酒鬼以為的鎮民等）做成頭像右下角的小副牌
      s.isSt && seat.fakeRole && fakeBadge(seat.fakeRole),
      s.phase === 'lobby' && seat.pinned && h('i', { class: 'pin-mark', title: '指定' }, icon('quill')),
      // 說書人給信息：當前角色真正的持有者「真」，能被當作這個角色的「登」
      pk?.marks?.[seat.id] && h('i', { class: 'tm' + (pk.marks[seat.id] === 1 ? ' alt' : '') }, pk.marks[seat.id] === 1 ? '登' : '真'),
      dead && h('span', { class: 'dead-stamp' }, DEATH[seat.deathBy] || '死亡'),
      dead && !seat.voteUsed && h('span', { class: 'ghost-vote', title: '還有一張死亡票' }, icon('ticket')),
      nom && (nom.votes[seat.id] || nom.abstain?.[seat.id]) && h('span', {
        class: 'vmark ' + (nom.votes[seat.id] ? 'yes' : 'no') + (voted ? ' ' + voted.cls : ''), style: voted && voted.style,
        title: nom.votes[seat.id] ? '贊成' : '棄權' }, icon(nom.votes[seat.id] ? 'hand' : 'abstain')),
      !seat.mine && (pop(seat.id) || pub(seat.id, '公共')),
      aim && !seat.mine && !dead && h('button', { class: 'aim-btn', title: '開槍', onclick: e => { e.stopPropagation(); aimAsk(ctx, seat); } }, icon('aim')),
      // 上一局的贏家頭上戴陣營皇冠；終局後的 MVP 投票：右上角的星星
      seatCrown(seat),
      voting && mvpButton(ctx, seat),
      (nominated || nominee) && h('div', { class: 'daytags' },
        nominated && h('span', { title: '今天已經提名過' }, '已提'), nominee && h('span', { title: '今天已經被提名過' }, '被提'))),
    h('div', { class: 'plate' },
      h('b', {}, i + 1), h('span', { class: 'pname' }, seat.name),
      !seat.online && h('i', { class: 'off', title: '離線' }), mvpTag(seat)),
    h('div', { class: 'seat-more' }, s.phase === 'lobby' && scoreRow(seat),
    s.isSt && seat.tags && seat.tags.length > 0 && h('div', { class: 'tags' },
      seat.tags.map(t => {
        // 手動局自己貼的標記：點一下取下
        const mine = s.st?.hand?.marks[seat.id]?.includes(t);
        return h('span', { class: 'tag' + (t === '中毒' ? ' bad' : '') + (mine ? ' pick' : ''), onclick: mine ? e => { e.stopPropagation(); ctx.st('remind', { seatId: seat.id, text: t, on: false }); } : null }, t);
      })),
    (missed.some(x => x.from === seat.id) || (!s.isSt && (acts[seat.id] || auto[seat.id]?.some(k => !k.t) || (team[seat.id] && g[seat.id]) || mine[seat.id]))) && h('div', { class: 'pmarks' },
      missed.filter(x => x.from === seat.id).map(x => h('span', { class: 'pmark shot' + (fxFor('shot', seat.id, 600) ? ' fx-shot' : ''), title: '宣稱獵手開槍，沒有打中' },
        icon('aim'), `射${num(x.to)}號失敗`)),
      !s.isSt && (acts[seat.id] || []).map(actMarkView),
      team[seat.id] && g[seat.id] && h('span', { class: 'pm q', title: '你的猜測' }, mini(g[seat.id])),
      (auto[seat.id] || []).filter(k => !k.t).map(markView),
      (mine[seat.id] || []).map(t => h('span', { class: 'pmark note', title: '你的備註' }, t))))));
  });

  // 說書人的操作卡和玩家輪到自己時的牌一樣，放在圓桌中央「第 N 夜 / 天」下面；貞潔者小窗貼桌面左上角，不擋計票；
  // 提名期間的裁定卡蓋在審判牌上。桌上圈出行動者，裁定的另一方（開槍的目標、提名貞潔者的人）紅虛線圈
  const b = stBubble(ctx), ruling = b && b.ruling, showNom = nom && !nomHeld();
  if (!b) lastBubble = null;
  const mid = b && !b.side && !showNom;
  if (b) ring.children[s.seats.findIndex(x => x.id === b.seatId)]?.classList.add('acting');
  const other = ruling && (ruling.to || ruling.from);
  if (other) ring.children[s.seats.findIndex(x => x.id === other)]?.classList.add('ruled');

  const [title, sub] = PHASE(s);
  const blk = shownBlock(s);
  // 台上有人、或正在演處決：中間讓給頭像，不寫「第 N 天」；說書人的按鈕挪到絞刑架下面（有操作卡時卡片照常蓋在中間）
  const hang = (blk || execActive()) && !mid;
  ring.append(h('div', { class: 'center' + (nom ? ' has-nom' : '') + (hang ? ' has-blk' : '') },
    !blk && h('div', { class: 'phase-title' }, title),
    !blk && !mid && sub && h('div', { class: 'phase-sub' }, sub),
    !s.isSt && (pop('st', '說書人') || pub('st', '公告')),
    s.phase === 'day' && !nom && !blk && s.tie && h('div', { class: 'center-block' }, blockLines(s)[0]),
    mid ? cardEl(ctx, b, true) : s.isSt ? stCenter(ctx) : (!blk || s.prompt) && playerCenter(ctx),
    showNom && trialStub(ctx),
    s.phase === 'ended' && mvpPane(ctx),
  ));
  if (blk) ring.append(blockSeat(ctx, blk));
  // 被擠下台 / 被平票擠下的人：從圓桌中間飛回自己的座位
  for (const seat of s.seats) {
    const ret = fxFor('blkret', seat.id, BLK_MS);
    if (!ret || seat.id === blk) continue;
    const { x, y } = seatPos(s, seat.id);
    ring.append(h('div', { class: 'blk-ret ' + ret.cls, 'data-key': 'ret-' + seat.id, style: { left: x + '%', top: y + '%', ...ret.style } }, seatToken(ctx, seat)));
  }
  if (showNom) ring.append(nomLine(s, nom));
  const picking = s.isSt && !s.peek && s.phase === 'lobby';
  return h('div', { class: 'town' + (picking ? ' picking' : ''), 'data-key': 'town' }, ring, stand(s), picking && scriptPick(ctx), showNom && trialPanel(ctx), showNom && b && !b.side && h('div', { class: 'st-over' }, cardEl(ctx, b)), b && b.side && cardEl(ctx, b));
}

// 觀眾席：桌子右下角一張小紙條，寫前幾個名字，點開看全部。手機上只剩眼睛和人數（board.css）
const STAND_NAMES = 3;
function stand(s) {
  const all = s.watchers;
  if (!all.length) return null;
  const open = e => menu(e.currentTarget, `觀眾席 ${all.length} 人`, all.map(x => ({ label: x.name, off: true })));
  return h('button', { class: 'stand', 'data-key': 'stand', 'data-exit': true, title: '觀眾席', 'aria-label': `觀眾席 ${all.length} 人`, onclick: open },
    h('span', { class: 'stand-h' }, icon('eye'), h('i', {}, '觀眾席'), h('b', {}, all.length)),
    all.slice(0, STAND_NAMES).map(x => h('span', { class: 'stand-n' + (x.mine ? ' mine' : ''), 'data-key': 'w-' + x.name, 'data-exit': true }, x.name)),
    all.length > STAND_NAMES && h('span', { class: 'stand-more', 'data-key': 'more' }, '⋯'));
}

// 說書人：當前夜晚步驟的操作卡（走完是天亮前核對）/ 白天的裁定卡。貞潔者小窗（side）不擋投票，有別的裁定時讓位
function stBubble(ctx) {
  const s = ctx.state;
  if (s.manual && s.isSt && !s.peek) { const hand = handBubble(ctx); if (hand) return hand; }
  const step = s.isSt && !s.peek && s.phase === 'night' && !nightHeld() && s.st.step;
  const ruling = s.isSt && !s.peek && s.phase === 'day' && (s.st.ruling || s.st.virginCheck);
  const side = !!ruling && !s.st.ruling;
  const word = s.isSt && !s.peek && s.phase === 'day' && !ruling && s.st.lastWord; // 月之子、呆瓜、心上人死後的選擇
  return step ? { id: step.id, seatId: step.seatId, roleId: step.roleId, stage: step.status, card: () => (step.status === 'review' ? reviewCard(ctx) : stepCard(ctx)) }
    : ruling ? { id: `rule-${ruling.kind}-${ruling.seatId}`, seatId: ruling.seatId, ruling, side, card: () => (side ? rulingCard(ctx, ruling, 'virgin') : rulingCard(ctx)) }
      : word ? { id: 'word-' + word.seatId, seatId: word.seatId, side: true, card: () => lastWordCard(ctx, word) } : null;
}

// 座位讓出來的地方：一張 w × h 的牌最大能放到幾倍還碰不到任何座位（頭像、名牌、標記），放在圓心上下哪裏最大。
// 人數是單數時上下不對稱，往空的那邊挪一點能放大不少。按佈局位置算，發牌、死亡這些演出的位移不影響；留的 16px 是選中時的金圈
function seatRoom(ring, w, h) {
  const c = ring.offsetWidth / 2, parts = [], o = ring.getBoundingClientRect();
  for (const seat of ring.querySelectorAll('.seat')) for (const el of seat.children) {
    if (!el.offsetWidth) continue;
    const more = el.classList.contains('seat-more') && el.getBoundingClientRect(); // 標記靠 translate 擺位，offsetLeft 量不到
    const x = more ? more.left - o.left : seat.offsetLeft - seat.offsetWidth / 2 + el.offsetLeft, y = more ? more.top - o.top : seat.offsetTop - seat.offsetHeight / 2 + el.offsetTop;
    parts.push({ dx: Math.max(x - c, c - x - el.offsetWidth), y: y - c, b: y + el.offsetHeight - c });
  }
  let best = { k: -Infinity, shift: 0 };
  for (const i of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8]) { // 從圓心往外試，一樣大時不挪
    const shift = Math.round(c * i * .02);
    const k = Math.min(1, ...parts.map(p => Math.max((p.dx * 2 - 16) / w, (Math.max(p.y - shift, shift - p.b) * 2 - 16) / h)));
    if (k > best.k + .001) best = { k, shift };
  }
  return best;
}
// 圓桌中間的東西不壓座位：放得下就原樣；放不下先讓掉「第 N 夜」，玩家的牌再換成橫版（圓心左右比上下寬），還不夠才整張縮小（最小 60%）。
// 再不行牌就在留出來的高度裏滾動，座位也在牌上面（board.css），並且可以收起。審判牌上的裁定卡只管別超出框。畫完後調用
export function fitTableCard() {
  const turn = document.querySelector('.center > .turn-pane:not(.leaving)'), st = document.querySelector('.st-card:not(.corner):not(.leaving)');
  const middle = document.querySelector('.center:not(.has-blk)'); // 沒有牌：準備、天亮、白天的按鈕，連標題一起算
  const el = turn || st || middle, card = turn || st?.firstElementChild || middle;
  if (!card) return;
  const center = el.closest('.center'), ring = center?.parentElement;
  card.style.zoom = card.style.width = el.style.maxHeight = el.style.overflowY = '';
  turn?.classList.remove('flat');
  if (center) { center.classList.remove('tight'); center.style.translate = ''; }
  const css = getComputedStyle(el);
  if (el !== middle && css.position === 'absolute' || (el === st && css.overflowY === 'visible')) return; // 手機上卡拆開在圓桌上下、橫屏在圓桌旁邊（hud.css），不用縮
  const width = () => (el === st ? Math.max(card.offsetWidth, card.scrollWidth) : card.offsetWidth); // 一排角色牌可能比卡寬
  let room = center ? seatRoom(ring, width(), center.offsetHeight) : { k: 1 };
  if (center && room.k < 1) {
    center.classList.add('tight');
    room = seatRoom(ring, width(), card.offsetHeight);
    if (turn && room.k < .85) { // 縮一點還好看，縮多了不如橫過來
      turn.classList.add('flat');
      room = seatRoom(ring, width(), card.offsetHeight);
    }
  }
  const k = el === st ? Math.min(room.k, el.clientHeight / el.scrollHeight, el.clientWidth / el.scrollWidth) : room.k;
  if (k < 1) {
    const w = width(), z = Math.max(el === middle ? 0.72 : 0.6, k * 0.98); // 準備、白天的按鈕縮多了不好點，讓一點座位
    card.style.width = w + 'px'; // 定住版面：不然縮小之後寬度又撐回去，裏面重新排
    card.style.zoom = z.toFixed(3);
    if (center && el !== center && k * .98 < .6) { // 縮到頭還放不下：在座位留出來的高度裏滾動
      let h = card.offsetHeight * z;
      while ((room = seatRoom(ring, w * z, h)).k < 1 && h > 80) h -= 8;
      el.style.maxHeight = h + 'px';
      el.style.overflowY = 'auto';
    }
  }
  if (!center) return;
  // 把牌的中心擺到算好的位置（.center 裏還有標題，卡有外邊距）
  const box = center.classList.contains('tight') ? (el.style.maxHeight ? el : card) : center;
  const a = box.getBoundingClientRect(), r = ring.getBoundingClientRect();
  center.style.translate = `0 ${Math.round(room.shift + r.top + r.height / 2 - a.top - a.height / 2)}px`;
}
addEventListener('resize', fitTableCard);

function cardEl(ctx, b, foldable) {
  const key = b.id + (b.stage || '');
  if (foldable && isFolded(key)) {
    lastBubble = null; // 展開時照常播放出現的動畫
    return foldStub(ctx, key, b.roleId && mini(b.roleId), b.seatId && seatBadge(ctx.state, b.seatId));
  }
  const fresh = lastBubble !== b.id; // 只在新步驟出現時播放展開動畫，重繪不重播
  lastBubble = b.id;
  const card = b.card();
  if (foldable) card.append(foldButton(ctx, key));
  return h('section', { class: 'st-card' + (b.side ? ' corner' : '') + (fresh ? ' fresh' : ''), 'data-key': 'bubble-' + b.id, 'data-exit': true }, card);
}
// 當前步驟已經定下的目標（旅店老闆選的兩人、築夢師查的人……）：桌上金圈標出來
function stepTargets(s) {
  const step = s.isSt && s.phase === 'night' && s.st.step;
  if (!step) return new Set();
  return new Set([...(step.picks || []), step.form?.extra?.targetId, step.decide?.targetId].filter(Boolean));
}

// 死人頭像上的章：大家都看得到的死法有專門的字，其他（夜裏死的等）一律「死亡」
const DEATH = { execute: '處決', slayer: '射殺', virgin: '反噬' };

// 座位在桌上的位置（百分比，和上面畫座位用的一致）
function seatPos(s, id) {
  const a = (s.seats.findIndex(x => x.id === id) / s.seats.length) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + 41 * Math.cos(a), y: 50 + 41 * Math.sin(a) };
}
// 說書人看到的假身份副牌：小角色牌 + 名字，懸停看「以為是 X：能力」
function fakeBadge(id) {
  const r = ROLES[id], tok = roleToken(id, { size: 'xs' });
  tok.removeAttribute('title');
  return h('span', { class: 'fake-badge', title: `以為是${r.name}：${r.ability}` }, tok, h('b', { class: 'fake-name' }, r.name));
}
// 邪惡隊友的陣營牌：惡魔 / 爪牙（不知道具體角色），和角色牌一樣的雙圈印章
function teamToken(team) {
  const ico = team === 'demon' ? roleIcon('imp') : icon('dagger');
  ico.setAttribute('class', 'token-icon');
  return h('div', { class: `token md team-${team} team-known`, style: { '--team': TEAMS[team].color }, title: `${TEAMS[team].name}（邪惡隊友）` },
    ico, h('span', { class: 'token-name' }, TEAMS[team].name));
}
// 頭像：知道角色就亮角色，否則是實線的座位號牌
function seatToken(ctx, seat) {
  const s = ctx.state, r = seat.role || (seat.mine && s.myRole);
  return r ? roleToken(r) : h('div', { class: 'token md blank solid' }, s.seats.indexOf(seat) + 1);
}
// 處決台：頭像坐到圓桌中間，掛在絞刑架下，旁邊是贊成票數；剛上台時從自己的座位飛過來
function blockSeat(ctx, id) {
  const s = ctx.state, seat = s.seats.find(x => x.id === id), { x, y } = seatPos(s, id);
  const fx = fxFor('blkin', id, BLK_MS);
  return h('div', { class: 'blk' + (fx ? ' ' + fx.cls : ''), 'data-key': 'blk-' + id, style: { '--sx': x + '%', '--sy': y + '%', ...(fx && fx.style) } },
    gallows(), h('div', { class: 'blk-tok' }, seatToken(ctx, seat)),
    s.block && h('span', { class: 'blk-n', title: '贊成票' }, icon('hand'), s.block.nomineeId === id ? s.block.count : ''),
    h('div', { class: 'blk-plate' }, h('b', {}, s.seats.indexOf(seat) + 1), h('span', {}, seat.name)));
}

// 提名期間：提名者指向被提名者的紅色箭頭（座位座標和上面一致，桌面是正方形）
function nomLine(s, nom) {
  const n = s.seats.length;
  const at = id => { const a = (s.seats.findIndex(x => x.id === id) / n) * Math.PI * 2 - Math.PI / 2; return [50 + 41 * Math.cos(a), 50 + 41 * Math.sin(a)]; };
  const [x1, y1] = at(nom.nominatorId), [x2, y2] = at(nom.nomineeId), d = Math.hypot(x2 - x1, y2 - y1);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'nom-line'); svg.setAttribute('data-key', 'nomline');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
  if (d < 1) return svg;
  const ux = (x2 - x1) / d, uy = (y2 - y1) / d, r = 8.5;
  svg.innerHTML = '<defs><marker id="nomhead" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="4.5" markerHeight="4.5" orient="auto">'
    + '<path d="M0 0L10 5L0 10z" fill="#b3261e"/></marker></defs>'
    + `<line x1="${x1 + ux * r}" y1="${y1 + uy * r}" x2="${x2 - ux * (r + 1)}" y2="${y2 - uy * (r + 1)}" marker-end="url(#nomhead)"/>`;
  return svg;
}

// 說書人信息在座位上的標記：角色小牌（二選一帶問號）、惡魔是否、陣營牌

// 說書人給信息時可以直接點桌上的座位選人
function pickingNow(ctx) {
  const s = ctx.state, step = s.isSt && s.phase === 'night' && s.st.step;
  if (s.manual && s.isSt && !s.peek) return composePicking(ctx);
  if (!step || sel.on) return null;
  return step.status === 'confirm' ? seatPicking(ctx, step) : step.status === 'decide' ? decidePicking(ctx, step) : null;
}

function onSeat(ctx, seat, anchor) {
  const s = ctx.state;
  const pk = pickingNow(ctx);
  if (pk && pk.can.has(seat.id)) return pk.pick(seat.id);
  if (sel.on) {
    if (sel.on.notSelfId === seat.id) return toast('不能選擇自己');
    if (sel.on.last?.includes(seat.id)) return toast('不能和上一晚選同一名玩家');
    const ids = sel.on.ids, max = Math.max(...(sel.on.counts || [sel.on.count]));
    if (ids.includes(seat.id)) ids.splice(ids.indexOf(seat.id), 1);
    else if (sel.on.alive && seat.dead) return toast('只能選擇存活的玩家');
    else if (sel.on.dead && !seat.dead) return toast('只能選擇死亡的玩家');
    else { ids.push(seat.id); if (ids.length > max) ids.shift(); }
    return ctx.render();
  }
  const title = seatLabel(s, seat.id);
  if (s.isSt) { closePick(); return menu(anchor, title + (seat.role ? ' · ' + ROLES[seat.role].name : ''), stMenu(ctx, seat, title)); }
  const me = s.seats.find(x => x.mine);
  if (!me && s.phase === 'lobby') return; // 觀戰的人準備階段沒什麼可做
  const day = s.phase === 'day' && me && !me.dead;
  const canNominate = day && !s.nomination && !s.dayOver && !s.nominators.includes(me.id) && !s.nominees.includes(seat.id);
  // 扔雞蛋：任何時候都能扔，後面是自己還剩幾枚
  const eggs = me ? shownEggs(me.eggs) : 0;
  menu(anchor, title, [
    me && !seat.mine && { label: [icon('egg', 'menu-ico'), '扔雞蛋', h('b', { class: 'menu-n' + (eggs ? '' : ' none') }, eggs)],
      onclick: () => (eggs ? ctx.act('egg', { targetId: seat.id }) : toast('雞蛋用完了')) },
    canNominate && { label: '提名他', onclick: () => ctx.act('nominate', { targetId: seat.id }) },
    day && s.dayOver && { label: [h('s', {}, '提名他'), h('small', {}, '今日已執行處決')], off: true },
    day && !seat.mine && !s.manual && { label: '宣稱獵手：向他開槍', onclick: () => (s.myRole === 'slayer' ? aimAsk(ctx, seat)
      : ask(`公開宣稱自己是獵手，向 ${title} 開槍？`, () => ctx.act('slay', { targetId: seat.id }), '開槍')) },
    day && s.juggleLeft > 0 && !seat.mine && { label: `公開猜他的角色（還有 ${s.juggleLeft} 次）`, onclick: () => pickJuggle(ctx, seat, title) },
    me && s.phase !== 'lobby' && !seat.mine && { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && !seat.mine && { label: '標記角色猜測', onclick: () => pickGuess(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && { label: '加備註', onclick: () => addNote(ctx, seat.id) },
    !s.peek && notes(ctx)[seat.id] && { label: '清除我的備註', onclick: () => clearNotes(ctx, seat.id) },
  ]);
}

// 雜耍藝人：第一個白天公開猜，所有人都看得到
function pickJuggle(ctx, seat, title) {
  modal(`公開猜 ${title} 的角色`, h('div', { class: 'guess-grid' }, SCRIPTS[ctx.state.scriptId].roles.map(id =>
    h('div', { class: 'guess-pick', onclick: () => { closeModal(); ctx.act('juggle', { targetId: seat.id, role: id }); } }, roleToken(id, { size: 'sm' }), ROLES[id].name))), { wide: true });
}

// 自己是獵手（含以為自己是獵手的酒鬼）、活著、白天、還沒開過槍、沒在投票：其他活著的人頭上有瞄準鈕
function canAim(s) {
  const me = s.seats.find(x => x.mine);
  return !s.isSt && !s.peek && !s.manual && !!me && !me.dead && s.myRole === 'slayer' && s.phase === 'day' && !s.slayerUsed && !s.nomination;
}
// 瞄準鈕：先講清楚獵手的規則再開槍
function aimAsk(ctx, seat) {
  const title = seatLabel(ctx.state, seat.id);
  modal(`向 ${title} 開槍`, h('div', { class: 'aim-rule' },
    h('div', { class: 'aim-row' }, mini('slayer'), h('span', {}, '整局只有一發，白天公開開槍，所有人都會看到')),
    h('div', { class: 'aim-row' }, demonMark(true), h('span', {}, '他是惡魔'), w('→'), w('他立即死亡', 'evil')),
    h('div', { class: 'aim-row' }, demonMark(false), h('span', {}, '不是惡魔'), w('→'), w('什麼也不會發生', 'ink')),
    h('p', { class: 'muted small' }, '你中毒或其實是酒鬼時，這一槍可能會被說書人判定無效。'),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { class: 'btn ghost', onclick: closeModal }, '取消'),
      h('button', { class: 'btn red', onclick: () => { closeModal(); ctx.act('slay', { targetId: seat.id }); } }, icon('aim'), '開槍'))));
}

// 說書人的座位菜單：準備階段調座位 / 改預覽角色；遊戲中查看、私聊和各種糾錯
function stMenu(ctx, seat, title) {
  const s = ctx.state, st = s.st;
  const good = seat.role && TEAMS[ROLES[seat.role].team].good;
  // 紅鯡魚只在有占卜師（含以為自己是占卜師的酒鬼）時才有
  const ft = s.seats.some(x => x.role === 'fortuneteller' || x.fakeRole === 'fortuneteller');
  const herring = ft && good && st.redHerring !== seat.id && { label: '設為占卜師的紅鯡魚', onclick: () => ctx.st('setRedHerring', { seatId: seat.id }) };
  // 換設備 / 換人頂替 / 真人接手機器人：新設備打開鏈接就接過這個座位
  const relink = { label: [icon('key', 'menu-ico'), seat.bot ? '真人頂替' : '換設備'],
    onclick: () => ctx.st('seatLink', { seatId: seat.id }).then(r => r.ok && openSeatLink(ctx, seat, title, r.token)) };
  const shown = seat.role && s.mode === 'manual' && { label: '玩家看到的角色', onclick: () => pickShown(ctx, seat) };
  if (s.phase === 'lobby') return [
    !canHover() && { label: '指定角色', onclick: () => pickRole(ctx, seat) },
    seat.pinned && { label: '恢復隨機', onclick: () => ctx.st('unpin', { seatId: seat.id }) },
    shown,
    st.draft && s.mode !== 'manual' && herring,
    '-',
    { label: '← 前移', onclick: () => ctx.st('moveSeat', { seatId: seat.id, dir: -1 }) },
    { label: '後移 →', onclick: () => ctx.st('moveSeat', { seatId: seat.id, dir: 1 }) },
    relink,
    { label: '移出房間', danger: true, onclick: () => ask(seat.bot ? `把 ${title} 移出房間？` : `把 ${title} 移出房間？他不能再進來。`, () => ctx.st('kick', { seatId: seat.id }), '移出') },
  ];
  const live = s.phase !== 'ended', poisoned = st.poisoned === seat.id;
  if (s.manual) {
    const evil = seat.align ? seat.align === 'evil' : !good;
    return [
      live && mayNominate(s, seat) && { label: '替他提名', onclick: () => startNominate(ctx, seat) },
      live && { label: '叫醒', onclick: () => openCard(ctx, seat) },
      live && { label: '給信息', onclick: () => startCompose(ctx, seat) },
      live && { label: '貼標記', onclick: () => openReminders(ctx, seat) },
      live && '-',
      { label: '代入他的視角', onclick: () => ctx.peek(seat.id) },
      { label: '私聊', onclick: () => openChat(ctx, seat.id) },
      relink,
      live && '-',
      live && { label: '更換角色', onclick: () => pickRole(ctx, seat) },
      live && shown,
      live && { label: evil ? '改為善良' : '改為邪惡', onclick: () => ctx.st('setAlign', { seatId: seat.id, align: evil ? 'good' : 'evil' }) },
      live && { label: seat.dead ? '復活' : '標記死亡', onclick: () => ctx.st('setDead', { seatId: seat.id, dead: !seat.dead }) },
      live && s.phase === 'day' && !s.dayOver && { label: '立即處決', danger: true, onclick: () => ask(`立即處決 ${title}？今天不能再處決別人。`, () => ctx.st('execute', { seatId: seat.id }), '處決') },
    ];
  }
  return [
    { label: '代入他的視角', onclick: () => ctx.peek(seat.id) },
    { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    relink,
    live && { label: '補發信息（彈窗告訴他）', onclick: () => prompt2(`告訴 ${title}`, '', text => text && ctx.st('tellInfo', { seatId: seat.id, text }), { max: 300, placeholder: '例如：你得知 3 號是廚師' }) },
    live && '-',
    live && { label: '更換角色', onclick: () => pickRole(ctx, seat) },
    live && { label: poisoned ? '解除中毒' : '設為中毒', onclick: () => ctx.st('setPoison', { seatId: poisoned ? null : seat.id }) },
    live && herring,
    live && { label: seat.dead ? '復活（糾錯）' : '標記死亡（糾錯）', onclick: () => ctx.st('setDead', { seatId: seat.id, dead: !seat.dead }) },
    live && s.phase === 'day' && !s.dayOver && { label: '立即處決（糾錯）', danger: true,
      onclick: () => ask(`立即處決 ${title}？按處決結算（聖徒、送葬者等），今天不能再處決別人。`, () => ctx.st('execute', { seatId: seat.id }), '處決') },
  ];
}
