// 桌面：座位圍成一圈。支持“選人模式”（夜晚行動 / 說書人代選）
import { h, menu, roleToken, toast, seatLabel, ask, prompt2, modal, closeModal } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { openChat, chatUnread, pickGuess, guesses, notes, addNote, clearNotes, infoMarksBySeat, markView, actMarksBySeat, actMarkView } from './side.js';
import { fxFor, syncDelay, heldAlive, nomHeld, shownBlock, liveBlock, seatAway, execActive, clockFx, shotHeld, BLK_MS, shownEggs, nightHeld } from './fx.js';
import { seatCrown, mvpVoting, mvpButton, mvpTag, mvpPane, scoreRow } from './scores.js';
import { mini, tag, icon, roleIcon, gallows, demonMark, w } from './glyph.js';
import { hudLinked } from './hud.js';
import { trialPanel } from './trial.js';
import { seatPicking } from './infoform.js';
import { stepCard, decidePicking } from './stepcard.js';
import { clockState, blockLines, playerCenter, stCenter, rulingCard, reviewCard, scriptPick } from './flow.js';
import { pickRole, pickShown } from './setup.js';
import { handBubble, composePicking, startCompose, openCard, openReminders } from './manual.js';
import { openSeatLink } from './invite.js';

// 當前的選人狀態：{ count, notSelfId, ids, key }
export const sel = { on: null };
let lastBubble = null;
export function startSelect(ctx, opts) { sel.on = { ids: [], ...opts }; ctx.render(); }
export function stopSelect(ctx) { sel.on = null; ctx.render(); }

// 圓桌中間的小字：說書人在桌邊說話的口吻（玩家和說書人各一句；觀戰的人沒有座位，不叫他閉眼、提名）
const PHASE = s => ({
  lobby: ['準備', s.seats.length < 5 ? `來了 ${s.seats.length} 位，至少要 5 位` : `來了 ${s.seats.length} 位，人齊就開局`],
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
  const ring = h('div', { class: 'ring' + (n > 10 ? ' crowded' : ''), style: { '--n': n } }); // --n：按人數縮放頭像（board.css）
  const pk = pickingNow(ctx), linked = hudLinked(s), voting = mvpVoting(s), aimed = stepTargets(s);
  const unread = chatUnread(s);
  // 私聊未讀：發送者身旁冒聊天氣泡，點開直接進那個頻道
  const pop = (ch, who) => unread[ch] && h('div', {
    class: 'chat-pop', 'data-key': 'pop-' + ch, title: '私聊',
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
    } else if (aimed.has(seat.id)) cls.push('aimed');
    if (seat.mine) cls.push('mine');
    if (s.st?.hand?.cards.some(c => c.seatId === seat.id && !c.done)) cls.push('acting');
    if (nom && nom.nomineeId === seat.id) cls.push('nominee');
    if (nom && nom.nominatorId === seat.id) cls.push('nominator');
    if (liveBlock(s) === seat.id) cls.push('onblock');
    if (ck && !ck.done && ck.current === seat.id) cls.push('clock');
    if (ck && ck.locked(seat.id)) cls.push('counted');
    if (sel.on) {
      cls.push(sel.on.notSelfId === seat.id || (sel.on.alive && seat.dead) || (sel.on.dead && !seat.dead) ? 'unselectable' : 'selectable');
      if (sel.on.ids.includes(seat.id)) cls.push('selected');
    }
    // 坐上處決台的人：座位上只留一個虛線空位，頭像在圓桌中間
    const token = seatAway(s, seat.id) ? h('div', { class: 'token md blank away' }, i + 1)
      : seat.role ? roleToken(seat.role)
        : seat.mine && s.myRole ? roleToken(s.myRole)
          : team[seat.id] ? teamToken(team[seat.id])
            : g[seat.id] ? h('div', { class: 'guess' }, roleToken(g[seat.id]))
              : h('div', { class: 'token md blank' }, i + 1);
    const died = fxFor('died', seat.id, 1400), voted = fxFor('lock', seat.id, 400) || fxFor('voted', seat.id, 600);
    if (died) cls.push(died.cls);
    // 今天的提名情況：誰已經提名過、誰已經被提名過（每人每天各一次）
    const nominated = s.phase === 'day' && s.nominators.includes(seat.id), nominee = s.phase === 'day' && s.nominees.includes(seat.id);
    ring.append(h('div', {
      class: cls.join(' '), 'data-key': seat.id,
      style: { left: 50 + 41 * Math.cos(ang) + '%', top: 50 + 41 * Math.sin(ang) + '%', ...(died && died.style), ...(nom && nom.nomineeId === seat.id ? syncDelay(1600) : {}) },
      onclick: e => onSeat(ctx, seat, e.currentTarget),
    },
    h('div', { class: 'seat-token' }, token,
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
      voting && mvpButton(ctx, seat)),
    h('div', { class: 'plate' },
      h('b', {}, i + 1), h('span', { class: 'pname' }, seat.name),
      !seat.online && h('i', { class: 'off', title: '離線' }), mvpTag(seat)),
    s.phase === 'lobby' && scoreRow(seat),
    (nominated || nominee) && h('div', { class: 'daytags' },
      nominated && h('span', { title: '今天已經提名過' }, '已提名'), nominee && h('span', { title: '今天已經被提名過' }, '已被提名')),
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
      (mine[seat.id] || []).map(t => h('span', { class: 'pmark note', title: '你的備註' }, t)))));
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
    !blk && !mid && h('div', { class: 'phase-sub' }, sub),
    !s.isSt && (pop('st', '說書人') || pub('st', '公告')),
    s.phase === 'day' && !nom && !blk && s.tie && h('div', { class: 'center-block' }, blockLines(s)[0]),
    mid ? cardEl(b) : s.isSt ? stCenter(ctx) : !blk && playerCenter(ctx),
    s.phase === 'ended' && mvpPane(ctx),
  ));
  if (b && b.side) ring.append(cardEl(b));
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
  return h('div', { class: 'town' + (picking ? ' picking' : '') }, ring, picking && scriptPick(ctx), showNom && trialPanel(ctx), showNom && b && !b.side && h('div', { class: 'st-over' }, cardEl(b)));
}

// 說書人：當前夜晚步驟的操作卡（走完是天亮前核對）/ 白天的裁定卡。貞潔者小窗（side）不擋投票，有別的裁定時讓位
function stBubble(ctx) {
  const s = ctx.state;
  if (s.manual && s.isSt && !s.peek) { const hand = handBubble(ctx); if (hand) return hand; }
  const step = s.isSt && !s.peek && s.phase === 'night' && !nightHeld() && s.st.step;
  const ruling = s.isSt && !s.peek && s.phase === 'day' && (s.st.ruling || s.st.virginCheck);
  const side = !!ruling && !s.st.ruling;
  return step ? { id: step.id, seatId: step.seatId, card: () => (step.status === 'review' ? reviewCard(ctx) : stepCard(ctx)) }
    : ruling ? { id: `rule-${ruling.kind}-${ruling.seatId}`, seatId: ruling.seatId, ruling, side, card: () => (side ? rulingCard(ctx, ruling, 'virgin') : rulingCard(ctx)) } : null;
}
// 圓桌中間放不下的卡（築夢師這種一整排角色牌）：整張縮小到放得下（最小 60%），再不行才滾動。畫完後調用
export function fitTableCard() {
  const el = document.querySelector('.st-card:not(.side)'), card = el && el.firstElementChild;
  if (!card) return;
  card.style.zoom = '';
  if (getComputedStyle(el).overflowY === 'visible') return; // 手機上角色牌和紙條在圓桌外面（hud.css），不用縮
  const k = Math.min(el.clientHeight / el.scrollHeight, el.clientWidth / el.scrollWidth);
  if (k < 1) card.style.zoom = Math.max(0.6, k * 0.98).toFixed(3);
}
function cardEl(b) {
  const fresh = lastBubble !== b.id; // 只在新步驟出現時播放展開動畫，重繪不重播
  lastBubble = b.id;
  return h('section', { class: 'st-card' + (b.side ? ' side' : '') + (fresh ? ' fresh' : ''), 'data-key': 'bubble-' + b.id }, b.card());
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
    const ids = sel.on.ids, max = Math.max(...(sel.on.counts || [sel.on.count]));
    if (ids.includes(seat.id)) ids.splice(ids.indexOf(seat.id), 1);
    else if (sel.on.alive && seat.dead) return toast('只能選擇存活的玩家');
    else if (sel.on.dead && !seat.dead) return toast('只能選擇死亡的玩家');
    else { ids.push(seat.id); if (ids.length > max) ids.shift(); }
    return ctx.render();
  }
  const title = seatLabel(s, seat.id);
  if (s.isSt) return menu(anchor, title + (seat.role ? ' · ' + ROLES[seat.role].name : ''), stMenu(ctx, seat, title));
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
    me && s.phase !== 'lobby' && !seat.mine && { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && !seat.mine && { label: '標記角色猜測', onclick: () => pickGuess(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && { label: '加備註', onclick: () => addNote(ctx, seat.id) },
    !s.peek && notes(ctx)[seat.id] && { label: '清除我的備註', onclick: () => clearNotes(ctx, seat.id) },
  ]);
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
    { label: '指定角色', onclick: () => pickRole(ctx, seat) },
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
