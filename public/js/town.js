// 桌面：座位圍成一圈。支持“選人模式”（夜晚行動 / 說書人代選）
import { h, menu, roleToken, toast, seatLabel, ask, prompt2, modal, closeModal } from './ui.js';
import { ROLES, TEAMS, SCRIPTS } from './roles.js';
import { openChat, chatUnread, pickGuess, guesses, notes, addNote, clearNotes, infoMarksBySeat, markView, actMarksBySeat, actMarkView } from './side.js';
import { fxFor, syncDelay, heldAlive, nomHeld, shownBlock, liveBlock, seatAway, execActive, clockFx, shotHeld, BLK_MS, shownEggs, nightHeld, dawnHeld, heldFace } from './fx.js';
import { seatCrown, mvpVoting, mvpButton, mvpTag, mvpPane, scoreRow } from './scores.js';
import { mini, tag, icon, roleIcon, gallows, demonMark, w, seatBadge } from './glyph.js';
import { hudLinked } from './hud.js';
import { trialPanel, trialStub } from './trial.js';
import { seatPicking } from './infoform.js';
import { stepCard, decidePicking, markPicking, lastWordCard, noticeCard } from './stepcard.js';
import { clockState, blockLines, playerCenter, stCenter, herringPicking, rulingCard, reviewCard, scriptPick, isFolded, foldButton, foldStub } from './flow.js';
import { pickRole, canHover, hoverSeat, openPick, leaveSeat, closePick, pickingSeat } from './setup.js';
import { actBubble, actPicking, startAct, openReminders, passFrom, needPass, passCard, rolePicker } from './manual.js';
import { seatLogView } from './log.js';
import { showBluffs } from './pass.js';
import { openSeatLink } from './invite.js';
import { tr, getLang } from './lang.js';
import { heraldHeld, turnSeat } from './herald.js';

// 當前的選人狀態：{ count, notSelfId, ids, key }
export const sel = { on: null };
let lastBubble = null;
// 死後選人的標籤第一次出現時蓋章蓋下來（重畫時接著同一個動畫，不重播）
const wordSeen = new Map();
const wordFresh = x => {
  const k = x.from + '>' + x.to, t = wordSeen.get(k) ?? (wordSeen.set(k, Date.now()), Date.now()), el = Date.now() - t;
  return el < 400 ? `-${el}ms` : null;
};

export function startSelect(ctx, opts) { sel.on = { ids: [], ...opts }; ctx.render(); }
// 這一步要不要在桌上點人（哲學家、侍臣只選角色，座位不畫成可選）
const seatsWanted = on => Math.max(...(on.counts || [on.count])) > 0;
export function stopSelect(ctx) { sel.on = null; ctx.render(); }

// 圓桌中間的小字：說書人在桌邊說話的口吻（玩家和說書人各一句；觀戰的人沒有座位，不叫他閉眼、提名）
const PHASE = s => ({
  lobby: ['準備', s.isSt ? null : '等說書人開局'],
  night: [`第 ${s.night} 夜`, !s.isSt ? (s.myId ? '閉上眼，輪到你時我會叫你' : '大家都閉上了眼') : s.st?.step?.status === 'review' ? '天快亮了，核對一下今晚' : '按順序叫醒他們'],
  dawn: ['天亮了', s.isSt ? '準備好就開始白天' : '睜開眼，聽聽昨晚發生了什麼'],
  day: [`第 ${s.day} 天`, s.dayOver ? '今天已經處決過人了' : '討論時間'],
  ended: [s.winner === 'good' ? '善良獲勝' : '邪惡獲勝', s.winReason],
}[s.phase]);

// 「第 N 夜 / 天」不重要，不佔圓桌中間：換階段時在中間亮 ANNOUNCE 毫秒（入夜演出還在播時一直亮著），
// 之後、或者中間要放操作卡了，就飛到桌面左上角變成一行小字。勝負一直在中間；準備階段說書人的中間放開始遊戲，不寫標題
const ANNOUNCE = 2200;
let seen = { key: null, at: 0, spot: null };
function titleSpot(ctx, s, mid) {
  if (s.phase === 'ended' || (s.phase === 'lobby' && !s.isSt)) return 'mid';
  if (s.phase === 'lobby') return null;
  const key = `${s.gameId}:${s.phase}:${s.night}:${s.day}`;
  if (seen.key !== key) seen = { key, at: 0, spot: null };
  let spot;
  if (mid) spot = 'corner';
  else if (s.phase === 'night' && nightHeld()) spot = 'mid';
  else {
    if (!seen.at) { seen.at = Date.now(); setTimeout(() => seen.key === key && ctx.render(), ANNOUNCE + 30); }
    spot = Date.now() - seen.at < ANNOUNCE ? 'mid' : 'corner';
  }
  if (spot === 'corner' && seen.spot === 'mid') flyTitle();
  if (spot === 'mid' || !seen.spot) seen.spot = spot; // 到了角上就留在角上，同一階段不再回中間
  return seen.spot === 'corner' ? 'corner' : spot;
}
// 中間的標題換成角上的小字：小字從標題原來的位置、原來的大小飛過去（不是這邊消失那邊冒出來）
function flyTitle() {
  const from = document.querySelector('.ring .center > .phase-title')?.getBoundingClientRect();
  if (!from?.width) return;
  requestAnimationFrame(() => {
    const el = document.querySelector('.town > .phase-tag');
    if (!el) return;
    const to = el.getBoundingClientRect(), k = from.height / Math.max(1, to.height);
    el.getAnimations().forEach(a => a.cancel());
    el.animate([{ translate: `${from.left + from.width / 2 - to.left - to.width / 2}px ${from.top + from.height / 2 - to.top - to.height / 2}px`, scale: k, opacity: 1 },
      { translate: '0 0', scale: 1, opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.3, .7, .2, 1)' });
  });
}

export function renderTown(ctx) {
  const s = ctx.state;
  const n = s.seats.length;
  const nom = s.nomination, ck = clockState(ctx);
  clockFx(s, ck);
  // 猜測和備註存在本機：說書人代入時不畫（那是說書人自己的，不是這位玩家的）；遮住身份時也不畫（猜誰是隊友就露了自己的陣營）
  const own = s.isSt || s.peek || s.veiled;
  const g = own ? {} : guesses(ctx);
  const auto = s.isSt ? {} : infoMarksBySeat(s), mine = own ? {} : notes(ctx), acts = actMarksBySeat(s), aim = canAim(s);
  // 爪牙 / 惡魔信息裏得知的邪惡隊友：頭像直接換成陣營牌（座位下面就不再重複標）
  const team = Object.fromEntries(Object.entries(auto).flatMap(([id, ks]) => ks.filter(k => k.t).slice(0, 1).map(k => [id, k.t])));
  const missed = (s.shots || []).filter(x => !x.hit && !shotHeld(x)), picks = s.words || [], num = id => s.seats.findIndex(x => x.id === id) + 1;
  const ring = h('div', { class: 'ring' + (n > 10 ? ' crowded' : ''), style: { '--s': Math.sin(Math.PI / Math.max(n, 2)).toFixed(4), ...(s.isSt ? fitStyle() : {}) } }); // --s：按相鄰座位的距離定大小（board.css）
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

  arriveSeats(s);
  // DOM 裏的座位按 id 排，不按座次：準備階段對調兩個座位時，只有這兩個的 left / top 變了，順著 transition 滑到對方的位置（board.css），
  // 別的座位不挪、不重播動畫。要按座次的地方用 data-i
  const domOrder = [...s.seats].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const markStep = s.isSt && s.phase === 'night' && s.st?.step?.status === 'mark' ? s.st.step : null;
  const turnAt = turnSeat(ctx); // 線下說書人：輪到誰行動，他頭頂掛箭頭（herald.js）
  const ownPick = markStep && ROLES[markStep.roleId] ? ROLES[markStep.roleId].name + '選' : null;
  domOrder.forEach(seat => {
    const i = s.seats.indexOf(seat);
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
    if (turnAt === seat.id) cls.push('turn');
    if (nom && nom.nomineeId === seat.id) cls.push('nominee');
    if (nom && nom.nominatorId === seat.id) cls.push('nominator');
    if (liveBlock(s) === seat.id) cls.push('onblock');
    if (ck && !ck.done && ck.current === seat.id) cls.push('clock');
    if (ck && ck.locked(seat.id)) cls.push('counted');
    if (sel.on && seatsWanted(sel.on)) {
      cls.push(sel.on.notSelfId === seat.id || sel.on.last?.includes(seat.id) || (sel.on.alive && seat.dead) || (sel.on.dead && !seat.dead) ? 'unselectable' : 'selectable');
      if (sel.on.ids.includes(seat.id)) cls.push('selected');
    }
    // 坐上處決台的人：座位上只留一個虛線空位，頭像在圓桌中間
    const token = seatAway(s, seat.id) ? h('div', { class: 'token md blank away' }, i + 1)
      : seat.role ? dealt(seat.role)
        : seat.mine && s.myRole ? roleToken(heldFace() || s.myRole)
          : seat.mine && s.veiled ? h('div', { class: 'token md back' })
          : team[seat.id] ? teamToken(team[seat.id])
            : g[seat.id] ? h('div', { class: 'guess' }, roleToken(g[seat.id]))
              // 空座位：圈裏寫名字，號碼在下面的名牌上。單設備還沒起名字的空座位畫一支筆（點名牌寫名字）
              : h('div', { class: 'token md blank named' }, seat.name ? h('span', { class: 'tk-name' }, seat.name) : seat.local && icon('quill', 'tk-q'));
    const died = fxFor('died', seat.id, 1400), voted = fxFor('lock', seat.id, 400) || fxFor('voted', seat.id, 600);
    if (died) cls.push(died.cls);
    // 今天的提名情況：誰已經提名過、誰已經被提名過（每人每天各一次）
    const nominated = s.phase === 'day' && s.nominators.includes(seat.id), nominee = s.phase === 'day' && s.nominees.includes(seat.id);
    // 說書人：常見狀態畫在頭像上（statusView），其餘的標記照舊是頭像下面的字籤
    // 正在處理的這一步自己的「某角色選」先不掛：卡上寫著選了誰，座位也圈著金圈，再掛一枚只會把桌心的卡擠小（下一步起照常顯示）
    const status = s.isSt ? seatStatus(seat) : [], words = s.isSt ? (seat.tags || []).filter(t => !statusOf(t) && t !== ownPick) : [];
    ring.append(h('div', {
      class: cls.join(' '), 'data-key': seat.id, 'data-i': i, 'data-exit': s.phase === 'lobby' || null, // 準備階段拿掉的座位淡出去，不是一下子沒了
      // --ux、--uy：座位在圓桌上的方向，標記朝圓心掛（board.css .seat-more）
      style: { left: 50 + 41 * Math.cos(ang) + '%', top: 50 + 41 * Math.sin(ang) + '%', '--ux': Math.cos(ang).toFixed(3), '--uy': Math.sin(ang).toFixed(3), ...(died && died.style), ...(nom && nom.nomineeId === seat.id ? syncDelay(1600) : {}) },
      onclick: e => onSeat(ctx, seat, e.currentTarget),
      // 準備階段說書人可以拖座位：拖到另一個座位上就交換
      onpointerdown: s.isSt && !s.peek && s.phase === 'lobby' ? e => dragSeat(ctx, seat, e) : null,
    },
    h('div', { class: 'seat-token' + status.map(x => ' is-' + x.k).join(''), onmouseenter: hoverPick ? e => hoverSeat(ctx, seat.id, e.currentTarget, seatActs(ctx, seat)) : null, onmouseleave: hoverPick ? leaveSeat : null }, token,
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
      // 上一局的贏家頭上戴陣營皇冠；終局後的 MVP 投票：右上角的星星；當選的 MVP 章蓋在頭像左下角（放名牌裏會把名字擠沒）
      seatCrown(seat),
      voting && mvpButton(ctx, seat),
      mvpTag(seat),
      (nominated || nominee) && h('div', { class: 'daytags' },
        nominated && h('span', { title: '今天已經提名過' }, '已提'), nominee && h('span', { title: '今天已經被提名過' }, '被提')),
      statusView(ctx, seat, status)),
    // 單設備準備階段：點名牌就地改名字，回車跳到下一位（nameInput）
    h('div', { class: 'plate' + (canName(s, seat) ? ' nameable' : ''), onclick: canName(s, seat) ? e => { e.stopPropagation(); editName(ctx, seat.id); } : null },
      h('b', {}, i + 1), naming === seat.id && canName(s, seat) ? nameInput(ctx, seat) : token.classList.contains('named') ? null : h('span', { class: 'pname' }, seat.name),
      !seat.online && h('i', { class: 'off', title: '離線' })),
    h('div', { class: 'seat-more' }, s.phase === 'lobby' && !s.oneDevice && scoreRow(seat), // 單設備的座位只是名字，不記積分
    s.isSt && words.length > 0 && h('div', { class: 'tags' + (words.length > 3 ? ' many' : ''), 'data-more': `+${words.length - 3}` },
      words.map(t => {
        // 說書人自己貼的標記：點一下取下
        const mine = s.st?.marks?.[seat.id]?.includes(t);
        // 「某角色選 / 查」：電腦上也畫成角色小牌 + 一個字（寫全名一行就佔半個桌心，三枚疊起來把中間的操作卡擠沒了）
        return h('span', { class: 'tag' + (t === '中毒' ? ' bad' : '') + (mine ? ' pick' : '') + (pickTag(t) ? ' by-role' : ''), title: t,
          onclick: mine ? e => { e.stopPropagation(); ctx.st('remind', { seatId: seat.id, text: t, on: false }); } : null }, h('b', { class: 't-s' }, tagShort(t)), h('i', { class: 't-l' }, t));
      })),
    (missed.some(x => x.from === seat.id) || picks.some(x => x.from === seat.id) || (!s.isSt && (acts[seat.id] || auto[seat.id]?.some(k => !k.t) || (team[seat.id] && g[seat.id]) || mine[seat.id]))) && h('div', { class: 'pmarks' },
      missed.filter(x => x.from === seat.id).map(x => h('span', { class: 'pmark shot' + (fxFor('shot', seat.id, 600) ? ' fx-shot' : ''), title: '宣稱獵手開槍，沒有打中' },
        icon('aim'), `射${num(x.to)}號失敗`)),
      picks.filter(x => x.from === seat.id).map(x => h('span', { class: 'pmark shot word' + (wordFresh(x) ? ' fx-shot' : ''), style: { animationDelay: wordFresh(x) || null }, title: `${ROLES[x.role]?.name || ''}死後公開選人` },
        icon(x.role === 'moonchild' ? 'moon' : 'aim'), `選${num(x.to)}號`)),
      !s.isSt && (acts[seat.id] || []).map(actMarkView),
      team[seat.id] && g[seat.id] && h('span', { class: 'pm q', title: '你的猜測' }, mini(g[seat.id])),
      (auto[seat.id] || []).filter(k => !k.t).map(markView),
      (mine[seat.id] || []).map(t => h('span', { class: 'pmark note', title: '你的備註' }, t)))),
    turnAt === seat.id && turnArrow(seat.id)));
  });

  // 說書人的操作卡和玩家輪到自己時的牌一樣，放在圓桌中央「第 N 夜 / 天」下面；貞潔者小窗貼桌面左上角，不擋計票；
  // 提名期間的裁定卡蓋在審判牌上。桌上圈出行動者，裁定的另一方（開槍的目標、提名貞潔者的人）紅虛線圈
  const b = stBubble(ctx), ruling = b && b.ruling, showNom = nom && !nomHeld();
  if (!b) lastBubble = null;
  const mid = b && !b.side && !showNom;
  const seatEl = id => id && [...ring.children].find(c => c.getAttribute('data-key') === id);
  if (b) seatEl(b.seatId)?.classList.add('acting');
  const other = ruling && (ruling.to || ruling.from);
  if (other) seatEl(other)?.classList.add('ruled');

  const [title, sub] = PHASE(s);
  const blk = shownBlock(s);
  // 台上有人、或正在演處決：中間讓給頭像，不寫「第 N 天」；說書人的按鈕挪到絞刑架下面（有操作卡時卡片照常蓋在中間）
  const hang = (blk || execActive()) && !mid;
  // 「第 N 夜 / 天」換階段時在中間亮一下，之後飛到左上角（spot：mid 中間 / corner 角上 / null 不寫）
  const spot = titleSpot(ctx, s, mid || (s.isSt && heraldHeld())); // 「輪到誰」的整屏牌扣著這一步時，桌心空著也不把標題請回來
  ring.append(h('div', { class: 'center' + (nom ? ' has-nom' : '') + (hang ? ' has-blk' : '') },
    !blk && spot === 'mid' && h('div', { class: 'phase-title' }, title),
    // 玩家的那句（閉上眼、討論時間）是說給他的，標題走了也留著；說書人的那句只陪標題亮一下
    !blk && !mid && sub && (spot === 'mid' || !s.isSt) && h('div', { class: 'phase-sub' }, sub),
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
  return h('div', { class: 'town' + (picking ? ' picking' : ''), 'data-key': 'town' }, ring, stand(s), picking && scriptPick(ctx),
    spot === 'corner' && h('div', { class: 'phase-tag', 'data-key': 'phase-tag', 'data-exit': true }, title), obituary(s), showNom && trialPanel(ctx), showNom && b && !b.side && h('div', { class: 'st-over' }, cardEl(ctx, b)), b && b.side && cardEl(ctx, b));
}

// 訃告：天亮後掛在桌子正上方（昨晚誰死了不再擠在圓桌中間）。兩根繩吊著從上面晃下來，入夜時收走。
// 有人死：黑框「訃告」，紙頂上停著一隻烏鴉，隔一會兒歪一下頭；平安夜：銅框「告示」，昨夜平安，沒有烏鴉
const CROW = '<path d="M9 19 2 23l2-6z"/><ellipse cx="16" cy="17" rx="9" ry="6.2" transform="rotate(-14 16 17)"/>'
  + '<g class="ob-head"><circle cx="25" cy="9.5" r="4.6"/><path d="m28.8 8.2 6.6 2.3-6.4 1.4z"/><circle cx="26.4" cy="8.6" r=".9" fill="#efe4c8"/></g>'
  + '<path d="M14.5 22.5v4.5M18.5 22v5" stroke="currentColor" stroke-width="1.3" fill="none"/>';
function crow() {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 36 28');
  el.setAttribute('class', 'ob-crow');
  el.innerHTML = CROW;
  return el;
}
// 訃告擺在哪：哪裏不壓東西掛哪裏。電腦上先試左上角「第 N 天」下面；手機上先試正上方（壓到就往上提一點），再試左上角、右上角。
// 整塊都放不下就換成一行的小條（.slim：只留「昨夜 ⑥ 離世」，沒有標題和烏鴉），左上、右上、「第 N 天」右邊挨個試；
// 小條也放不下（人多、屏矮、死了好幾個）再縮成骷髏加座位號（.mini）。
// 「東西」＝座位的頭像、名牌、標記、皇冠，「第 N 天」，圓桌中間的牌和按鈕，浮在小鎮上的角色牌、觀眾席。量好的位置記在 obitAt，重繪時跟著帶上；第一次量好之前不掛下來
const obitAt = { key: null, l: null, t: null, form: 0, placed: false, fade: false }; // form：0 整塊、1 小條、2 骷髏加座位號
let obitWait = 0, obitTown = null;
const obitRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(obitWait); obitWait = setTimeout(placeObit, 120); }) : null;
function placeObit() {
  const ob = document.querySelector('.town > .obit:not(.leaving)'), town = ob?.parentElement, ring = town?.querySelector(':scope > .ring');
  if (!ob || !ring) return;
  clearTimeout(obitWait);
  // 角色牌收起 / 展開、轉屏、處決台出現都會讓桌子換位置：跟著重新量
  if (obitRO && obitTown !== town) { obitRO.disconnect(); obitRO.observe(town); obitRO.observe(ring); obitTown = town; }
  // 桌子、座位還在動（發牌、入場、拖動、給處決台讓位）時量到的不是最後的位置：等動完再量。一直循環的動畫不算
  const moving = el => el.getAnimations().some(x => x.playState === 'running' && x.effect?.getComputedTiming().iterations !== Infinity);
  if ([ring, ...ring.querySelectorAll(':scope > .seat')].some(moving)) { obitWait = setTimeout(placeObit, 300); return; }
  const t = town.getBoundingClientRect(), paper = ob.querySelector('.ob-paper'), tag = town.querySelector(':scope > .phase-tag')?.getBoundingClientRect();
  const rect = el => el.getBoundingClientRect(), seen = r => r.width && r.height;
  // 頭像是圓的，按圓算（按方框算會把四個角上的空地也當成壓到）；名牌、標記、皇冠、圓桌中間的東西按方框
  const tokens = [...ring.querySelectorAll(':scope > .seat > .seat-token')].map(rect).filter(seen).map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }));
  const parts = [...ring.querySelectorAll(':scope > .seat > :is(.plate, .seat-more), :scope > .seat .crown, :scope > .center > *')].map(rect).filter(seen);
  // 「第 N 天」、觀眾席，還有橫屏時浮在小鎮左上角的角色牌（.board 裏和 .town 並排的那幾個）：紙不能掛到它們底下，繩子可以從角色牌底下垂出來
  const around = [...town.querySelectorAll(':scope > :not(.ring, .obit)'), ...[...town.parentElement.children].filter(el => el !== town)].map(rect).filter(seen);
  const mourn = ob.classList.contains('mourn'), wide = town.offsetWidth > 640, pad = wide ? 14 : 10;
  const tagB = tag ? tag.bottom - t.top : 26;
  const lap = (r, L, T, R, B) => Math.max(0, Math.min(r.right, R) - Math.max(r.left, L)) * Math.max(0, Math.min(r.bottom, B) - Math.max(r.top, T));
  // 一個候選位置壓到別的東西多少（0 = 不壓）。over：紙上面還有繩子、烏鴉
  const cover = (l, top, w, h, over) => {
    if (l < 2 || l + w > t.width - 2 || top - over < -8) return Infinity;
    const L = t.left + l - 4, R = t.left + l + w + 4, T = t.top + top, B = T + h + 4, up = T - over - 2;
    let n = 0;
    for (const r of parts) n += lap(r, L, up, R, B);
    for (const r of around) n += lap(r, L, T - 2, R, B);
    for (const c of tokens) { const d = Math.hypot(c.x - Math.min(Math.max(c.x, L), R), c.y - Math.min(Math.max(c.y, up), B)); if (d < c.r) n += (c.r - d) ** 2; }
    return n;
  };
  const tries = [];
  const shape = form => { ob.classList.toggle('slim', form > 0); ob.classList.toggle('mini', form > 1); };
  for (const form of mourn ? [0, 1, 2] : [0, 1]) {
    const slim = form > 0;
    shape(form);
    const w = paper.offsetWidth, h = paper.offsetHeight, over = slim ? 10 : mourn ? 22 : 15;
    const spots = [[pad, tagB + over + 4], [t.width - w - pad, over + 8], [t.width - w - pad, over - 6]]; // 左上角「第 N 天」下面、右上角（再不行貼著上沿，繩子從上面的牌底下垂下來）
    if (!slim && !wide) spots.unshift([(t.width - w) / 2, 40], [(t.width - w) / 2, 16]);
    if (slim && tag) spots.push([tag.right - t.left + 12, tag.top - t.top + over - 4], [tag.right - t.left + 12, over - 6]); // 「第 N 天」右邊同一行
    for (const [l, top] of spots) tries.push({ l: Math.round(l), t: Math.round(top), form, n: cover(l, top, w, h, over) });
  }
  shape(obitAt.form);
  const least = tries.at(-1).form, pick = tries.find(x => x.n === 0) || tries.filter(x => x.form === least).sort((x, y) => x.n - y.n)[0];
  const set = () => {
    Object.assign(obitAt, { l: pick.l, t: pick.t, form: pick.form, placed: true });
    ob.style.setProperty('--ol', pick.l + 'px');
    ob.style.setProperty('--ot', pick.t + 'px');
    shape(pick.form);
    void ob.offsetWidth; // 第一次：先到位再掛下來，不從別處滑過來
    ob.classList.remove('unplaced', 'fade');
    obitAt.fade = false;
  };
  if (obitAt.placed && obitAt.form === pick.form && obitAt.l === pick.l && obitAt.t === pick.t) return;
  // 已經掛著、要換大小：先淡掉再換，不在眼前變形（只挪位置的由 left / top 的過渡帶過去）
  // fade 記在 obitAt 上、重繪時帶著：淡掉的這一會兒有別的重繪也不會先亮回來
  if (obitAt.placed && obitAt.form !== pick.form) { obitAt.fade = true; ob.classList.add('fade'); obitWait = setTimeout(set, 280); } else set();
}
function obituary(s) {
  if ((s.phase !== 'dawn' && s.phase !== 'day') || !s.lastNight || dawnHeld()) return null;
  const dead = s.lastNight, any = dead.length > 0, key = `obit-${s.day}`, at = obitAt;
  if (at.key !== key) Object.assign(at, { key, l: null, t: null, form: 0, placed: false, fade: false });
  return h('div', { class: 'obit ' + (any ? 'mourn' : 'calm') + (at.form > 0 ? ' slim' : '') + (at.form > 1 ? ' mini' : '') + (at.fade ? ' fade' : '') + (at.placed ? '' : ' unplaced'), 'data-key': key, 'data-exit': true,
    style: at.placed ? { '--ol': at.l + 'px', '--ot': at.t + 'px' } : {} },
    h('i', { class: 'ob-str l' }), h('i', { class: 'ob-str r' }),
    h('div', { class: 'ob-paper' }, any && crow(),
      h('b', { class: 'ob-h' }, any ? '訃告' : '告示'),
      h('div', { class: 'ob-line' }, any ? [icon('skull', 'ob-ico'), w('昨夜', 'ink'), dead.map(id => seatBadge(s, id)), w('離世', 'ink')] : w('昨夜平安', 'ink'))));
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

// 線下說書人：輪到誰行動，他頭頂一個慢慢跳的箭頭（紙邊、墨線、銅色；board.css .turn-arrow）。
// 換人時舊的沉下去淡掉（data-exit），新的從上面落下來再接著跳
// 頭頂放不下（橫著的手機上最上面那個座位頭頂就是頂欄；手機豎屏洗衣婦那種卡把選項排在圓桌上方）：箭頭挪到頭像外側橫著指過去（.ta-l / .ta-r）。
// 畫好以後量（arrowFit），擋住了就在同一幀重畫一次（還沒畫到屏幕上，看不到挪的那一下）；挪過去之後這一輪就一直在旁邊，不來回跳
const ARROW = '<path class="e" d="M8 2.5h8v12h5.5L12 27.5 2.5 14.5H8z"/><path d="M8 2.5h8v12h5.5L12 27.5 2.5 14.5H8z"/>';
const arrowAt = { id: null, side: '' }; // side：'' 頭頂，'l' / 'r' 頭像左 / 右邊（朝圓桌外的那一邊）
function turnArrow(id) {
  if (arrowAt.id !== id) Object.assign(arrowAt, { id, side: '' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 30');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ARROW;
  return h('i', { class: 'turn-arrow' + (arrowAt.side ? ' ta-' + arrowAt.side : ''), 'data-key': 'turn-arrow', 'data-exit': true }, svg);
}
const hits = (a, b) => a.width > 0 && a.left < b.r && a.right > b.l && a.top < b.b && a.bottom > b.t;
// 返回 true：箭頭要挪到旁邊，app.js 馬上再畫一次
export function arrowFit() {
  const a = document.querySelector('.ring > .seat > .turn-arrow:not(.leaving)'), seat = a?.parentElement;
  if (!a || arrowAt.id !== seat.dataset.key || arrowAt.side) return false;
  // 按頭像算箭頭的位置（箭頭自己正在落下來、在跳，量它本身不準），往上多留跳起來的那一截
  const t = seat.querySelector(':scope > .seat-token').getBoundingClientRect(), aw = a.offsetWidth, ah = a.offsetHeight;
  const box = { l: t.left + t.width / 2 - aw / 2, r: t.left + t.width / 2 + aw / 2, t: t.top - 3 - ah - aw * .28, b: t.top - 3 };
  const top = document.querySelector('.board')?.getBoundingClientRect().top ?? 0;
  const blocked = box.t < top || [...document.querySelectorAll('.st-card :is(.ic-body, .tb-roles, .ic-foot, .tb-foot), .town > .phase-tag')].some(el => hits(el.getBoundingClientRect(), box));
  if (!blocked) return false;
  arrowAt.side = parseFloat(seat.style.getPropertyValue('--ux')) > 0 ? 'r' : 'l';
  return true;
}

// 說書人：當前夜晚步驟的操作卡（走完是天亮前核對）/ 白天的裁定卡。貞潔者小窗（side）不擋投票，有別的裁定時讓位
function stBubble(ctx) {
  const s = ctx.state;
  if (s.isSt && !s.peek && s.offline) { const act = actBubble(ctx); if (act) return act; } // 線下：替玩家提名、開槍、猜
  if (needPass(ctx) && !nightHeld()) return { id: 'pass', seatId: null, card: () => passCard(ctx) };
  // 白天接任的惡魔（紅唇女郎）：處決之後直接入夜，提示壓在今晚第一步前面，點了「知道了」再往下
  const notice = s.isSt && !s.peek && !s.st?.ruling && s.st?.notice;
  if (notice) return { id: `notice-${notice.seatId}-${notice.f[1]?.r}`, seatId: notice.seatId, card: () => noticeCard(ctx, notice) };
  const step = s.isSt && !s.peek && s.phase === 'night' && !nightHeld() && !heraldHeld() && s.st.step; // 「輪到誰」的整屏牌收起後才出
  const ruling = s.isSt && !s.peek && s.phase === 'day' && (s.st.ruling || s.st.virginCheck);
  const side = !!ruling && !s.st.ruling;
  const word = s.isSt && !s.peek && s.phase === 'day' && !ruling && s.st.lastWord; // 月之子、呆瓜、心上人死後的選擇
  return step ? { id: step.id, seatId: step.seatId, roleId: step.roleId, stage: step.status, card: () => (step.status === 'review' ? reviewCard(ctx) : stepCard(ctx)) }
    : ruling ? { id: `rule-${ruling.kind}-${ruling.seatId}`, seatId: ruling.seatId, ruling, side, card: () => (side ? rulingCard(ctx, ruling, 'virgin') : rulingCard(ctx)) }
      // 代選時這張卡換成選人條，進圓桌中間（手機上角落的小窗是頂上一整條，會壓住上方的座位，點不到）
      : word ? { id: 'word-' + word.seatId, seatId: word.seatId, side: sel.on?.key !== 'word-' + word.seatId, card: () => lastWordCard(ctx, word) } : null;
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
  placeObit();
  const turn = document.querySelector('.center > .turn-pane:not(.leaving)'), st = document.querySelector('.st-card:not(.corner):not(.leaving)');
  const middle = document.querySelector('.center:not(.has-blk)'); // 沒有牌：準備、天亮、白天的按鈕，連標題一起算
  const el = turn || st || middle, card = turn || st?.firstElementChild || middle;
  if (!card) return;
  const center = el.closest('.center'), ring = center?.parentElement;
  card.style.zoom = card.style.width = el.style.maxHeight = el.style.overflowY = '';
  turn?.classList.remove('flat');
  if (center) { center.classList.remove('tight'); center.style.translate = ''; }
  const css = getComputedStyle(el);
  if (el === st && css.position === 'absolute') return fitBeside(st, ring); // 橫屏卡在圓桌旁邊（hud.css）
  if (el === st && css.overflowY === 'visible') { fitAround(st, ring); return fitHole(st, ring); } // 手機上卡拆開在圓桌上下
  if (el !== middle && css.position === 'absolute') return; // 玩家的牌在圓桌下面 / 旁邊，不用縮
  const width = () => (el === st ? Math.max(card.offsetWidth, card.scrollWidth) : card.offsetWidth); // 一排角色牌可能比卡寬
  let room = center ? seatRoom(ring, width(), center.offsetHeight) : { k: 1 };
  // 終局的「善良 / 邪惡獲勝」就是要看的東西：不藏標題，放不下就縮
  if (center && room.k < 1 && !center.closest('.phase-ended')) {
    center.classList.add('tight');
    room = seatRoom(ring, width(), card.offsetHeight);
    if (turn && room.k < .85) { // 縮一點還好看，縮多了不如橫過來
      turn.classList.add('flat');
      room = seatRoom(ring, width(), card.offsetHeight);
    }
  }
  // 說書人的卡外面還有一圈內邊距：縮放後的牌要放進的是內邊距裏面那塊，不然寬出幾像素，冒出橫向滾動條
  const pad = (a, b) => parseFloat(css[a]) + parseFloat(css[b]);
  const k = el === st ? Math.min(room.k, (el.clientHeight - pad('paddingTop', 'paddingBottom')) / card.offsetHeight, (el.clientWidth - pad('paddingLeft', 'paddingRight')) / width()) : room.k;
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

// 圓桌為說書人的卡讓位：量到的數記在這裏，畫圓桌時一起帶上（renderTown），重繪時不會先丟掉再補回來，圓桌不閃
const fit = { bh: 0, fh: 0, rk: 1, key: '' };
const fitStyle = () => ({ '--bh': fit.bh + 'px', '--fh': fit.fh + 'px', '--rk': fit.rk });
// 手機豎屏：卡拆成圓桌上方（選項）、下方（預覽和按鈕）兩塊，量出兩塊各要多高，圓桌該縮多少、往哪邊挪在 CSS 裏算（hud.css --bh、--fh）
function fitAround(st, ring) {
  const up = st.querySelector('.ic-body, .tb-roles'), dn = st.querySelector('.ic-foot, .tb-foot, .spread > .row');
  if (!ring || !dn || getComputedStyle(dn).position !== 'absolute') return;
  const bh = up ? Math.ceil(up.scrollHeight) : 0, fh = Math.ceil(dn.offsetHeight);
  if (bh === fit.bh && fh === fit.fh) return;
  Object.assign(fit, { bh, fh });
  for (const [k, v] of Object.entries(fitStyle())) ring.style.setProperty(k, v);
}
// 手機豎屏留在圓心的那一小張（.ic-top，連同冒出去的標題籤）：座位朝圓心掛的標記不能壓住它。
// 跟大屏一樣用 seatRoom 找最寬敞的位置，放不下再縮（最小六成）。卡剛發出來還在彈的時候量到的是縮放過的框，按 offsetWidth 換算回佈局尺寸
function fitHole(st, ring) {
  const top = st.querySelector(':scope > .card > .ic-top'), center = st.closest('.center');
  if (!top || !center || !ring) return;
  const tag = top.querySelector(':scope > .ic-tag');
  top.style.zoom = '';
  if (tag) tag.style.maxWidth = tag.style.display = '';
  const measure = () => {
    const t = top.getBoundingClientRect(), f = t.width ? top.offsetWidth / t.width : 1;
    let l = 0, u = 0, r = top.offsetWidth, b = top.offsetHeight;
    for (const e of top.querySelectorAll('*')) {
      if (!e.offsetWidth) continue;
      const a = e.getBoundingClientRect();
      l = Math.min(l, (a.left - t.left) * f); u = Math.min(u, (a.top - t.top) * f);
      r = Math.max(r, (a.right - t.left) * f); b = Math.max(b, (a.bottom - t.top) * f);
    }
    return { u, b, w: r - l, room: seatRoom(ring, r - l, b - u) };
  };
  let best = { m: measure(), px: '' };
  // 標題籤比小卡寬得多：先讓它多折一行，比整張縮小好認
  const natural = tag?.offsetWidth || 0;
  for (const px of [170, 140, 115]) {
    if (best.m.room.k >= 1 || natural <= px) continue;
    tag.style.maxWidth = px + 'px';
    const n = measure();
    if (n.room.k > best.m.room.k + 0.01) best = { m: n, px: px + 'px' };
  }
  if (tag) tag.style.maxWidth = best.px;
  // 縮到頭（六成）還放不下：讓掉標題籤，留下要告訴玩家的東西（同大屏先讓掉「第 N 夜」）
  if (tag && best.m.room.k < 0.6) {
    tag.style.display = 'none';
    const n = measure();
    if (n.room.k > best.m.room.k) best = { m: n }; else tag.style.display = '';
  }
  let { u, b, room } = best.m, r = best.m.w, l = 0, z = 1;
  if (room.k < 1) {
    z = Math.max(0.6, room.k * 0.98);
    top.style.zoom = z.toFixed(3);
    room = seatRoom(ring, (r - l) * z, (b - u) * z);
  }
  // 小卡在圓桌裏的位置：.center 自己有居中的位移，縮放後高度變了位移也跟著變，所以縮完再量；
  // .center 往裏順著 offsetParent 加，不受牌彈出動畫的影響
  let y = center.getBoundingClientRect().top - ring.getBoundingClientRect().top;
  for (let e = top; e && e !== center; e = e.offsetParent) y += e.offsetTop;
  const mid = y + (u + (b - u) / 2) * z;
  center.style.translate = `0 ${Math.round(room.shift + ring.offsetWidth / 2 - mid)}px`;
}
// 手機橫屏：卡在圓桌右邊。選項多得卡裏放不下時圓桌一點點縮小（--rk，最小六成），卡跟著變寬、一行多放幾個，不用在卡裏滾。
// 縮了也不見矮的內容（間諜的魔典）不白縮：取放得下的最大一檔，都放不下就取最矮的那檔裏最大的。
// 換了一步、換了屏幕大小才從原大小重新算；同一步裏只會再縮，不來回跳
function fitBeside(st, ring) {
  const card = st.firstElementChild, key = st.dataset.key + card?.className + innerWidth + 'x' + innerHeight;
  if (!ring || !card) return;
  const set = k => { fit.rk = k; ring.style.setProperty('--rk', k); };
  // 卡裏要滾的地方：卡本身上下滾，或者裏面某一塊橫著滾（手動局發出去的牌一行擺不下）
  const wide = e => e.scrollWidth - e.clientWidth > 1 && /auto|scroll/.test(getComputedStyle(e).overflowX) ? e.scrollWidth - e.clientWidth : 0;
  const over = () => Math.max(card.scrollHeight - card.clientHeight, ...[...card.querySelectorAll('*')].map(wide));
  if (fit.key !== key) { fit.key = key; set(1); }
  if (over() <= 1) return;
  let best = { k: fit.rk, o: over() };
  for (let k = Math.round(fit.rk * 100 - 4) / 100; k >= .6 && best.o > 1; k = Math.round(k * 100 - 4) / 100) {
    set(k);
    const o = over();
    if (o < best.o - 1) best = { k, o };
  }
  set(best.k);
}

function cardEl(ctx, b, foldable) {
  const key = b.id + (b.stage || '');
  if (foldable && isFolded(key)) {
    lastBubble = null; // 展開時照常播放出現的動畫
    return foldStub(ctx, key, b.roleId && mini(b.roleId), b.seatId && seatBadge(ctx.state, b.seatId));
  }
  const fresh = lastBubble !== b.id; // 只在新步驟出現時播放展開動畫，重繪不重播
  lastBubble = b.id;
  const card = b.card();
  if (b.side) card.classList.remove('spread'); // 角上的小窗（代選月之子的目標等）不拆開：拆開是圍著圓桌擺的
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
  const act = s.isSt && !s.peek && s.offline && actPicking(ctx);
  if (act) return act;
  if (s.phase === 'lobby') return herringPicking(ctx); // 準備階段：點了紅鯡魚那一格，在桌上點人
  if (!step || sel.on) return null;
  return step.status === 'confirm' ? seatPicking(ctx, step) : step.status === 'decide' ? decidePicking(ctx, step) : step.status === 'mark' ? markPicking(ctx, step) : null;
}

// ───── 座位狀態：常見的狀態不寫成字籤，畫在頭像上 ─────
// 影響整個頭像的效果（中毒：綠墨從底下滲上來、冒泡；醉酒：頭像晃、一塊酒漬；被保護：一圈藍墨環……），
// 加一枚沿頭像邊掛的小圖章（說書人自己貼的，點圖章取下）。誰查過誰、紅鯡魚、說書人寫的備註這些照舊是字籤
const STATUS = { 中毒: ['poison', 'drop'], 醉酒: ['drunk', 'cup'], 被保護: ['protect', 'shield'], 處決不死: ['safe', 'shield'], 詛咒: ['curse', 'bolt'],
  瘋狂: ['mad', 'mask'], 蓄力: ['charge', 'pitchfork'], 假死: ['undead', 'skull'], 能力已用: ['used', 'check'] };
const statusOf = t => STATUS[t] || (t.startsWith('瘋狂：') ? STATUS.瘋狂 : null);
// 圖章沿頭像邊掛的角度：左上、右上、左、右（正上方是死亡票，右下是假身份副牌）
const RIM = [-140, -40, 180, 0];
function seatStatus(seat) {
  const seen = new Set(), out = [];
  for (const t of seat.tags || []) {
    const st = statusOf(t);
    if (st && !seen.has(st[0])) { seen.add(st[0]); out.push({ t, k: st[0], ico: st[1] }); }
  }
  return out;
}
function statusView(ctx, seat, list) {
  const s = ctx.state, mine = t => s.st?.marks?.[seat.id]?.includes(t);
  return [list.map(x => h('i', { class: 'st-fx ' + x.k, 'data-key': 'fx-' + x.k, 'data-exit': true })),
    list.map((x, n) => {
      const as = x.t.startsWith('瘋狂：') && roleNamed(x.t.slice(3)); // 瘋狂成哪個角色：圖章上是那個角色的小牌
      return h('i', { class: 'st-ico ' + x.k + (mine(x.t) ? ' pick' : ''), 'data-key': 'st-' + x.k, 'data-exit': true, title: x.t, style: { '--a': RIM[n % RIM.length] + 'deg' },
        onclick: mine(x.t) ? e => { e.stopPropagation(); ctx.st('remind', { seatId: seat.id, text: x.t, on: false }); } : null }, as ? mini(as) : icon(x.ico));
    })];
}

// 手機上頭像小，說書人的標記縮成兩個字的小籤（完整的在 title 裏）：被保護→保護、占卜師查→被查……
const TAG_SHORT = { 被保護: '保護', 能力已用: '已用', 死亡票已用: '票用', 額外一天: '多天', 處決不死: '免死' };
// 信息標記「洗衣婦:士兵」「調查員:錯誤」「占卜師查」、系統不認識的角色「某某選」：那個角色的小牌 + 一個字（真 / 錯 / 查），截成兩個字反而看不懂
let byName = null;
const roleNamed = n => (byName ||= new Map(Object.entries(ROLES).map(([id, r]) => [r.name, id]))).get(n);
const pickTag = t => { const q = t.match(/^(.+)[查選]$/); return !!q && !!roleNamed(q[1]); };
const tagShort = t => {
  const m = t.match(/^(.+?)[:：](.+)$/), q = t.match(/^(.+)([查選])$/), r = roleNamed((m || q)?.[1]);
  if (r) return [mini(r, 'tag-ico'), m ? (m[2] === '錯誤' ? '錯' : '真') : q[2]];
  const d = t.match(/^(.+?)·(.+)$/), dr = d && roleNamed(d[1]); // 兩個角色同名的標記：「寡婦·得知」
  if (dr) return [mini(dr, 'tag-ico'), cut(d[2])];
  if (t === '紅鯡魚') return [mini('fortuneteller', 'tag-ico'), '鯡']; // 和「占卜師查」一樣：小牌 + 一個字
  return TAG_SHORT[t] || (t.startsWith('瘋狂') ? '瘋狂' : cut(t));
};
// 截短：中文留兩個字；英文不能按字截（「失去」翻不出來），翻好整句取第一個詞
const cut = t => (getLang() === 'en' ? tr(t).split(/[\s:]/)[0] : [...t].slice(0, 2).join(''));

// 準備階段新坐下的座位（定人數、新玩家進房）從原地長出來，不是一下子冒出來。換房間、換局時不算
let knownSeats = { code: null, ids: new Set() };
function arriveSeats(s) {
  const ids = s.seats.map(x => x.id), fresh = knownSeats.code === s.code && s.phase === 'lobby' ? ids.filter(id => !knownSeats.ids.has(id)) : [];
  knownSeats = { code: s.code, ids: new Set(ids) };
  if (fresh.length) requestAnimationFrame(() => fresh.forEach((id, k) => document.querySelector(`.ring > .seat[data-key="${id}"]`)
    ?.animate([{ opacity: 0, scale: .4 }, { opacity: 1, scale: 1 }], { duration: 340, delay: k * 35, easing: 'cubic-bezier(.2, .8, .3, 1.25)', fill: 'backwards' })));
}

// ───── 單設備準備階段：名牌就地改名 ─────
let naming = null; // 正在改名字的座位
const canName = (s, seat) => s.isSt && !s.peek && s.phase === 'lobby' && !!seat.local;
// 點名牌（或座位菜單的「改名」）：名牌裏換成輸入框，當場聚焦。iOS 只有在點擊的當下聚焦才彈鍵盤，不能等重繪
export function editName(ctx, id) {
  const seat = ctx.state.seats.find(x => x.id === id);
  if (!seat) return;
  naming = id;
  const plate = document.querySelector(`.ring > .seat[data-key="${id}"] .plate`);
  if (!plate) return ctx.render();
  let input = plate.querySelector('input');
  if (!input) { input = nameInput(ctx, seat); plate.querySelector('.pname')?.remove(); plate.querySelector('b').after(input); }
  delete input.dataset.done; // 存過還沒等到重繪的框又被點開：重新算數，不然失焦時不存
  input.focus();
  input.select();
}
function nameInput(ctx, seat) {
  return h('input', { class: 'pl-in', 'data-key': 'name-' + seat.id, value: seat.name || '', maxlength: 12, enterkeyhint: 'next', 'aria-label': '名字',
    onclick: e => e.stopPropagation(), onpointerdown: e => e.stopPropagation(),
    onkeydown: e => {
      if (e.isComposing || e.keyCode === 229) return; // Safari 用回車確認拼音時，keydown 晚於 compositionend，isComposing 已經是 false，只能看 229
      // 回車：存好，接著寫下一位。按鍵一定生效：焦點沒能挪到下一位（還停在存過的這個框裏）時，再按回車照樣往下走，不會按了沒反應
      if (e.key === 'Enter') { e.preventDefault(); delete e.currentTarget.dataset.done; saveName(ctx, seat.id, e.currentTarget, 1); }
      else if (e.key === 'Escape') { e.preventDefault(); delete e.currentTarget.dataset.done; saveName(ctx, seat.id, e.currentTarget, 0); }
    },
    onblur: e => saveName(ctx, seat.id, e.currentTarget, 0) });
}
function saveName(ctx, id, el, step) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const s = ctx.state, i = s.seats.findIndex(x => x.id === id), seat = s.seats[i], name = el.value.trim();
  if (seat && name !== (seat.name || '')) { seat.name = name; ctx.st('renameSeat', { seatId: id, name }); } // 先在本地改上，服務器回來之前圈裏不閃回舊名字
  const nxt = step && s.seats[i + 1];
  // 接著寫下一位，同時把寫完的這個框收掉：不等服務器回音（網慢、正在重連時，寫完的框會一直留著，點回去像是卡住）
  if (nxt) { editName(ctx, nxt.id); return ctx.render(); }
  if (naming === id) naming = null;
  el.blur();
  ctx.render();
}

// 拖座位換位置（準備階段，說書人）：按住移動超過一點才算拖，影子跟著手指，鬆在另一個座位上就交換；拖過的這一下不算點擊
function dragSeat(ctx, seat, e) {
  if (e.button > 0) return;
  const el = e.currentTarget, x0 = e.clientX, y0 = e.clientY;
  let ghost = null, over = null;
  const target = ev => document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.ring > .seat');
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) return;
    if (!ghost) {
      const src = el.querySelector('.seat-token'), cs = getComputedStyle(src);
      ghost = src.cloneNode(true);
      ghost.classList.add('drag-ghost');
      for (const v of ['--tk', '--c', '--ph']) ghost.style.setProperty(v, cs.getPropertyValue(v)); // 圓桌外面沒有這些尺寸變量
      // 頭像的大小規則只在圓桌裏生效：影子照原頭像的實際大小，不然拖起來大一倍
      const tk = src.querySelector('.token'), gt = ghost.querySelector('.token');
      if (tk && gt) Object.assign(gt.style, { width: tk.offsetWidth + 'px', height: tk.offsetHeight + 'px', fontSize: getComputedStyle(tk).fontSize });
      document.body.append(ghost);
      el.classList.add('dragging');
      closePick();
    }
    Object.assign(ghost.style, { left: ev.clientX + 'px', top: ev.clientY + 'px' });
    const t = target(ev);
    if (t !== over) { over?.classList.remove('drop'); over = t && t !== el ? t : null; over?.classList.add('drop'); }
  };
  const up = () => {
    // 三個監聽一起摘：只摘一個的話，剩下的會在之後隨便哪一下點擊時再跑一遍（又換一次座位）
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!ghost) return;
    // 拖完緊跟著的那一下點擊不算（鬆手時瀏覽器會補一個 click）。只攔這一瞬間：觸屏拖完不補 click，
    // 一直等著攔的話，之後真正點這個座位（點名牌改名、開菜單）會被吞掉，像是卡住
    const eat = ev => ev.stopPropagation();
    window.addEventListener('click', eat, { capture: true });
    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 300);
    el.classList.remove('dragging');
    over?.classList.remove('drop');
    if (over) ctx.st('swapSeats', { a: seat.id, b: over.dataset.key });
    // 影子落回去：有交換就飛到新位置附近，沒有就回原位，淡掉
    const to = (over || el).getBoundingClientRect(), g = ghost;
    ghost = null;
    g.animate([{ left: g.style.left, top: g.style.top, opacity: 1 }, { left: to.left + to.width / 2 + 'px', top: to.top + to.height / 2 + 'px', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => g.remove(), () => g.remove());
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// 說書人的座位菜單，從桌面以外的地方開（標記卡上被選的座位號：這時候點桌上的座位是選人）
export function seatMenu(ctx, seatId, anchor) {
  const s = ctx.state, seat = s.seats.find(x => x.id === seatId);
  if (!seat || !s.isSt || s.peek) return;
  const title = seatLabel(s, seat.id);
  menu(anchor, title + (seat.role ? ' · ' + ROLES[seat.role].name : ''), stMenu(ctx, seat, title));
}

function onSeat(ctx, seat, anchor) {
  const s = ctx.state;
  const pk = pickingNow(ctx);
  if (pk && pk.can.has(seat.id)) return pk.pick(seat.id);
  // 正在桌上選人、點到不能選的：有原因就說原因（提名過的、死了的……），不彈座位菜單
  const no = pk?.why?.(seat.id);
  if (no) return toast(no);
  // 只選角色、不選人的行動（哲學家、侍臣）：座位不是選項，點座位照常開菜單
  if (sel.on && seatsWanted(sel.on)) {
    // 說書人代點時「自己」指的是行動的那位玩家，不是說書人：點名是誰
    if (sel.on.notSelfId === seat.id) return toast(s.isSt ? `${ROLES[seat.fakeRole || seat.role]?.name || seatLabel(s, seat.id)}不能選擇自己` : '不能選擇自己');
    if (sel.on.last?.includes(seat.id)) return toast('不能和上一晚選同一名玩家');
    const ids = sel.on.ids, max = Math.max(...(sel.on.counts || [sel.on.count]));
    if (ids.includes(seat.id)) ids.splice(ids.indexOf(seat.id), 1);
    else if (sel.on.alive && seat.dead) return toast('只能選擇存活的玩家');
    else if (sel.on.dead && !seat.dead) return toast('只能選擇死亡的玩家');
    else { ids.push(seat.id); if (ids.length > max) ids.shift(); }
    return ctx.render();
  }
  const title = seatLabel(s, seat.id);
  // 線下局投票：說書人看誰舉了手就點誰，再點一下放下
  if (s.isSt && !s.peek && s.nomination?.hand && !s.st.ruling) {
    return ctx.st('handVote', { seatId: seat.id, v: s.nomination.votes[seat.id] ? null : 'yes' });
  }
  // 準備階段點座位就是選角色（鼠標：旁邊那張角色表馬上開；觸屏：整屏劇本單），沒有二級菜單：
  // 改名點名牌，換座位拖頭像，加減座位在人數那一格，紅鯡魚在偽裝下面。真人座位的換設備、移出房間在角色表底下
  if (s.isSt && !s.peek && s.phase === 'lobby') {
    const acts = seatActs(ctx, seat);
    return canHover() ? openPick(ctx, seat.id, anchor.querySelector('.seat-token') || anchor, acts) : pickRole(ctx, seat, acts);
  }
  if (s.isSt) { closePick(); return menu(anchor, title + (seat.role ? ' · ' + ROLES[seat.role].name : ''), stMenu(ctx, seat, title)); }
  const me = s.seats.find(x => x.mine);
  if (!me && s.phase === 'lobby') return; // 觀戰的人準備階段沒什麼可做
  const day = s.phase === 'day' && me && !me.dead;
  const canNominate = day && !s.nomination && !s.dayOver && !s.nominators.includes(me.id) && !s.nominees.includes(seat.id);
  const nomWhy = day && !s.offline && !s.nomination && !s.dayOver && !seat.mine ? (s.nominators.includes(me.id) ? '你今天提名過了' : s.nominees.includes(seat.id) ? '他今天被提名過了' : null) : null;
  // 扔雞蛋：任何時候都能扔，後面是自己還剩幾枚
  const eggs = me ? shownEggs(me.eggs) : 0;
  menu(anchor, title, [
    me && !seat.mine && { label: [icon('egg', 'menu-ico'), '扔雞蛋', h('b', { class: 'menu-n' + (eggs ? '' : ' none') }, eggs)],
      onclick: () => (eggs ? ctx.act('egg', { targetId: seat.id }) : toast('雞蛋用完了')) },
    canNominate && !s.offline && { label: '提名他', onclick: () => ctx.act('nominate', { targetId: seat.id }) }, // 線下當面說，說書人替他提名
    day && s.dayOver && { label: [h('s', {}, '提名他'), h('small', {}, '今日已執行處決')], off: true },
    // 每人每天只能提名一次、被提名一次：照樣列出來，寫明為什麼現在不行
    nomWhy && { label: [h('s', {}, '提名他'), h('small', {}, nomWhy)], off: true },
    day && !seat.mine && !s.offline && { label: '宣稱獵手：向他開槍', onclick: () => (s.myRole === 'slayer' ? aimAsk(ctx, seat)
      : ask(`公開宣稱自己是獵手，向 ${title} 開槍？`, () => ctx.act('slay', { targetId: seat.id }), '開槍')) },
    day && s.juggleLeft > 0 && !seat.mine && { label: `公開猜他的角色（還有 ${s.juggleLeft} 次）`, onclick: () => pickJuggle(ctx, seat, title) },
    me && s.phase !== 'lobby' && !seat.mine && { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && !seat.mine && { label: '標記角色猜測', onclick: () => pickGuess(ctx, seat.id) },
    !s.peek && s.phase !== 'lobby' && { label: '加備註', onclick: () => addNote(ctx, seat.id) },
    !s.peek && notes(ctx)[seat.id] && { label: '清除我的備註', onclick: () => clearNotes(ctx, seat.id) },
  ]);
}

// 雜耍藝人：第一個白天公開猜，所有人都看得到
// 線上雜耍藝人公開猜：和別處一樣的整屏角色單（manual.js rolePicker），籤上寫猜的是誰
function pickJuggle(ctx, seat) {
  rolePicker(ctx, id => ctx.act('juggle', { targetId: seat.id, role: id }), [mini('juggler'), seatBadge(ctx.state, seat.id)]);
}

// 自己是獵手（含以為自己是獵手的酒鬼）、活著、白天、還沒開過槍、沒在投票：其他活著的人頭上有瞄準鈕
function canAim(s) {
  const me = s.seats.find(x => x.mine);
  return !s.isSt && !s.peek && !s.offline && !!me && !me.dead && s.myRole === 'slayer' && s.phase === 'day' && !s.slayerUsed && !s.nomination;
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
// 準備階段真人座位（線上、線下多設備）的兩件事：掛在角色表底下（setup.js）。名字座位沒有
function seatActs(ctx, seat) {
  if (seat.local) return [];
  const title = seatLabel(ctx.state, seat.id);
  return [{ label: [icon('key', 'menu-ico'), '換設備'], onclick: () => ctx.st('seatLink', { seatId: seat.id }).then(r => r.ok && openSeatLink(ctx, seat, title, r.token)) },
    { label: '移出房間', danger: true, onclick: () => ask(`把 ${title} 移出房間？他不能再進來。`, () => ctx.st('kick', { seatId: seat.id }), '移出') }];
}
function stMenu(ctx, seat, title) {
  const s = ctx.state, st = s.st;
  const good = seat.role && TEAMS[ROLES[seat.role].team].good;
  // 紅鯡魚只在有占卜師（含以為自己是占卜師的酒鬼）時才有
  const ft = s.seats.some(x => x.role === 'fortuneteller' || x.fakeRole === 'fortuneteller');
  const herring = ft && good && st.redHerring !== seat.id && { label: '設為占卜師的紅鯡魚', onclick: () => ctx.st('setRedHerring', { seatId: seat.id }) };
  // 換設備 / 換人頂替：新設備打開鏈接就接過這個座位
  const relink = { label: [icon('key', 'menu-ico'), '換設備'],
    onclick: () => ctx.st('seatLink', { seatId: seat.id }).then(r => r.ok && openSeatLink(ctx, seat, title, r.token)) };
  const local = !!seat.local;
  const live = s.phase !== 'ended', poisoned = st.poisoned === seat.id;
  // 線下：雜耍藝人白天公開猜從他的座位開始；提名、開槍是圓桌中央的兩個鍵（flow.js dayActs），夜裏系統叫到誰就在桌上替他點（stepcard.js）
  const off = s.offline, day = live && s.phase === 'day' && !s.nomination && !st.ruling;
  const juggler = [seat.role, seat.fakeRole].includes('juggler') && s.day === 1;
  const evil = seat.align ? seat.align === 'evil' : !good;
  // 再給惡魔看一次偽裝：瘋子也有（看的是首夜給他的那份假偽裝），他要求再看時說書人照樣拿得出來，不穿幫
  const bluffs = !local || !seat.role ? null : seat.role === 'lunatic' ? st.bluffsOf?.[seat.id] : ROLES[seat.role].team === 'demon' ? st.bluffs : null;
  return [
    off && day && juggler && { label: [icon('eye', 'menu-ico'), '雜耍藝人公開猜'], onclick: () => startAct(ctx, 'juggle', seat) },
    live && local && { label: [icon('eye', 'menu-ico'), '給他看身份'], onclick: () => passFrom(ctx, seat.id) },
    live && bluffs?.length > 0 && { label: [icon('eye', 'menu-ico'), '給他看偽裝'], onclick: () => showBluffs(s, seat.id, bluffs) },
    { label: [icon('book', 'menu-ico'), '記錄'], onclick: () => modal(`${title} 的記錄`, seatLogView(s, seat.id), { wide: true }) },
    live && { label: [icon('quill', 'menu-ico'), '貼標記'], onclick: () => openReminders(ctx, seat) },
    '-',
    !local && { label: '代入他的視角', onclick: () => ctx.peek(seat.id) },
    !local && { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    !local && relink,
    live && !off && { label: '補發信息（彈窗告訴他）', onclick: () => prompt2(`告訴 ${title}`, '', text => text && ctx.st('tellInfo', { seatId: seat.id, text }), { max: 300, placeholder: '例如：你得知 3 號是廚師' }) },
    live && '-',
    live && { label: '更換角色', onclick: () => pickRole(ctx, seat) },
    live && { label: poisoned ? '解除中毒' : '設為中毒', onclick: () => ctx.st('setPoison', { seatId: poisoned ? null : seat.id }) },
    live && herring,
    live && { label: evil ? '改為善良' : '改為邪惡', onclick: () => ctx.st('setAlign', { seatId: seat.id, align: evil ? 'good' : 'evil' }) },
    live && { label: seat.dead ? '復活' : '標記死亡', onclick: () => ctx.st('setDead', { seatId: seat.id, dead: !seat.dead }) },
    live && s.phase === 'day' && !s.dayOver && { label: '立即處決', danger: true,
      onclick: () => ask(`立即處決 ${title}？按處決結算（聖徒、送葬者等），今天不能再處決別人。`, () => ctx.st('execute', { seatId: seat.id }), '處決') },
  ];
}
