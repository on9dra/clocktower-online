// 桌面：座位圍成一圈。支持“選人模式”（夜晚行動 / 說書人代選）
import { h, menu, roleToken, toast, seatLabel, ask, prompt2, modal, closeModal } from './ui.js';
import { ROLES, TEAMS } from './roles.js';
import { openChat, chatUnread, pickGuess, guesses, notes, addNote, clearNotes, infoMarksBySeat, markView, actMarksBySeat, actMarkView } from './side.js';
import { fxFor, syncDelay, heldAlive, nomHeld, shownBlock, liveBlock, seatAway, execActive, clockFx, shotHeld, BLK_MS, shownEggs } from './fx.js';
import { seatCrown, mvpVoting, mvpButton, mvpTag, mvpPane, scoreRow } from './scores.js';
import { mini, tag, icon, gallows, demonMark, w } from './glyph.js';
import { hudLinked } from './hud.js';
import { trialPanel } from './trial.js';
import { seatPicking } from './infoform.js';
import { stepCard } from './stepcard.js';
import { clockState, blockLines, playerCenter, rulingCard, scriptPick } from './flow.js';
import { pickRole } from './setup.js';

// 當前的選人狀態：{ count, notSelfId, ids, key }
export const sel = { on: null };
let lastBubble = null;
export function startSelect(ctx, opts) { sel.on = { ids: [], ...opts }; ctx.render(); }
export function stopSelect(ctx) { sel.on = null; ctx.render(); }

const PHASE = s => ({
  lobby: ['準備', `${s.seats.length} 名玩家已入座`],
  night: [`第 ${s.night} 夜`, s.st?.step?.status === 'review' ? '天亮前確認' : '夜晚行動進行中'],
  dawn: ['天亮了', '等待說書人開始白天'],
  day: [`第 ${s.day} 天`, s.dayOver ? '今天已處決' : '討論 · 提名 · 投票'],
  ended: [s.winner === 'good' ? '善良獲勝' : '邪惡獲勝', s.winReason],
}[s.phase]);

export function renderTown(ctx) {
  const s = ctx.state;
  const n = s.seats.length;
  const nom = s.nomination, ck = clockState(ctx);
  clockFx(s, ck);
  const g = s.isSt ? {} : guesses(ctx);
  const auto = s.isSt ? {} : infoMarksBySeat(s), mine = s.isSt ? {} : notes(ctx), acts = actMarksBySeat(s), aim = canAim(s);
  const missed = (s.shots || []).filter(x => !x.hit && !shotHeld(x)), num = id => s.seats.findIndex(x => x.id === id) + 1;
  const ring = h('div', { class: 'ring' + (n > 10 ? ' crowded' : '') });
  const pk = pickingNow(ctx), linked = hudLinked(s), voting = mvpVoting(s);
  const unread = chatUnread(s);
  // 私聊未讀：發送者身旁冒聊天氣泡，點開直接進那個頻道
  const pop = (ch, who) => unread[ch] && h('div', {
    class: 'chat-pop', 'data-key': 'pop-' + ch, title: '私聊',
    onclick: e => { e.stopPropagation(); openChat(ctx, ch); },
  }, who && h('b', {}, who), h('span', {}, unread[ch].last.text ?? '…'), unread[ch].n > 1 && h('i', { class: 'count' }, unread[ch].n));

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
    }
    if (seat.mine) cls.push('mine');
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
      dead && h('span', { class: 'dead-stamp' }, DEATH[seat.deathBy] || '死亡'),
      dead && !seat.voteUsed && h('span', { class: 'ghost-vote', title: '還有一張死亡票' }, icon('ticket')),
      nom && (nom.votes[seat.id] || nom.abstain?.[seat.id]) && h('span', {
        class: 'vmark ' + (nom.votes[seat.id] ? 'yes' : 'no') + (voted ? ' ' + voted.cls : ''), style: voted && voted.style,
        title: nom.votes[seat.id] ? '贊成' : '棄權' }, icon(nom.votes[seat.id] ? 'hand' : 'abstain')),
      !seat.mine && pop(seat.id),
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
      seat.tags.map(t => h('span', { class: 'tag' + (t === '中毒' ? ' bad' : '') }, t))),
    (missed.some(x => x.from === seat.id) || (!s.isSt && (acts[seat.id] || auto[seat.id] || mine[seat.id]))) && h('div', { class: 'pmarks' },
      missed.filter(x => x.from === seat.id).map(x => h('span', { class: 'pmark shot' + (fxFor('shot', seat.id, 600) ? ' fx-shot' : ''), title: '宣稱獵手開槍，沒有打中' },
        icon('aim'), `射${num(x.to)}號失敗`)),
      !s.isSt && (acts[seat.id] || []).map(actMarkView),
      (auto[seat.id] || []).map(markView),
      (mine[seat.id] || []).map(t => h('span', { class: 'pmark note', title: '你的備註' }, t)))));
  });

  // 說書人：當前夜晚步驟的操作卡 / 白天的裁定卡，放在行動者座位和桌面中心之間
  const step = s.isSt && s.phase === 'night' && s.st.step;
  // 貞潔者小窗：不擋投票，有別的裁定時讓位
  const ruling = s.isSt && s.phase === 'day' && (s.st.ruling || s.st.virginCheck);
  const side = ruling && !s.st.ruling;
  const bubble = step ? { id: step.id, seatId: step.seatId, card: () => stepCard(ctx) }
    : ruling ? { id: `rule-${ruling.kind}-${ruling.seatId}`, seatId: ruling.seatId, card: () => (side ? rulingCard(ctx, ruling, 'virgin') : rulingCard(ctx)) } : null;
  const actIdx = bubble ? s.seats.findIndex(x => x.id === bubble.seatId) : -1;
  // 裁定的另一方（開槍的目標、提名貞潔者的人）也圈出來
  const other = ruling && (ruling.to || ruling.from);
  if (other) ring.children[s.seats.findIndex(x => x.id === other)]?.classList.add('ruled');
  if (actIdx >= 0) {
    const ang = (actIdx / n) * Math.PI * 2 - Math.PI / 2;
    ring.children[actIdx].classList.add('acting');
    const fresh = lastBubble !== bubble.id; // 只在新步驟出現時播放展開動畫，重繪不重播
    lastBubble = bubble.id;
    // 貞潔者小窗貼在桌面左上角，浮在審判牌之上，不擋投票
    ring.append(h('div', {
      class: 'step-bubble' + (side ? ' side' : '') + (fresh ? ' fresh' : ''), 'data-key': 'bubble-' + bubble.id,
      style: side ? null : {
        left: 50 + 31 * Math.cos(ang) + '%', top: 50 + 31 * Math.sin(ang) + '%',
        transform: `translate(${-50 - 50 * Math.cos(ang)}%, ${-50 - 50 * Math.sin(ang)}%)`,
      },
    }, bubble.card()));
  }

  const [title, sub] = PHASE(s);
  const blk = shownBlock(s);
  // 台上有人、或正在演處決：中間讓給頭像，不寫「第 N 天」
  if (actIdx < 0 || side) ring.append(h('div', { class: 'center' + (nom ? ' has-nom' : '') + (blk || execActive() ? ' has-blk' : '') },
    !blk && h('div', { class: 'phase-title' }, title),
    !blk && h('div', { class: 'phase-sub' }, sub),
    !s.isSt && pop('st', '說書人'),
    s.phase === 'day' && !nom && !blk && s.tie && h('div', { class: 'center-block' }, blockLines(s)[0]),
    !blk && playerCenter(ctx),
    s.isSt && !s.peek && s.phase === 'lobby' && scriptPick(ctx),
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
  const showNom = nom && !nomHeld();
  if (showNom) ring.append(nomLine(s, nom));
  ring.append(feltSky());
  return h('div', { class: 'town' }, ring, showNom && trialPanel(ctx));
}

// 桌布上的天：夜裏桌布上留幾顆星，白天淡去
const STARS = [[30, 22], [62, 15], [78, 30], [18, 44], [84, 52], [26, 70], [70, 74], [44, 84], [55, 32], [36, 34], [74, 60], [16, 58], [60, 88], [40, 12]];
const feltSky = () => h('div', { class: 'felt-sky', 'data-key': 'felt-sky', 'aria-hidden': 'true' },
  h('div', { class: 'fs-stars' }, STARS.map(([x, y], i) => h('i', { style: { left: x + '%', top: y + '%', '--i': i } }))));

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
  return step && step.status === 'confirm' && !sel.on ? seatPicking(ctx, step) : null;
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
  const day = s.phase === 'day' && me && !me.dead;
  const canNominate = day && !s.nomination && !s.dayOver && !s.nominators.includes(me.id) && !s.nominees.includes(seat.id);
  // 扔雞蛋：任何時候都能扔，後面是自己還剩幾枚
  const eggs = me ? shownEggs(me.eggs) : 0;
  menu(anchor, title, [
    me && !seat.mine && { label: [icon('egg', 'menu-ico'), '扔雞蛋', h('b', { class: 'menu-n' + (eggs ? '' : ' none') }, eggs)],
      onclick: () => (eggs ? ctx.act('egg', { targetId: seat.id }) : toast('雞蛋用完了')) },
    canNominate && { label: '提名他', onclick: () => ctx.act('nominate', { targetId: seat.id }) },
    day && !seat.mine && { label: '宣稱獵手：向他開槍', onclick: () => (s.myRole === 'slayer' ? aimAsk(ctx, seat)
      : ask(`公開宣稱自己是獵手，向 ${title} 開槍？`, () => ctx.act('slay', { targetId: seat.id }), '開槍')) },
    s.phase !== 'lobby' && !seat.mine && { label: '私聊', onclick: () => openChat(ctx, seat.id) },
    s.phase !== 'lobby' && !seat.mine && { label: '標記角色猜測', onclick: () => pickGuess(ctx, seat.id) },
    s.phase !== 'lobby' && { label: '加備註', onclick: () => addNote(ctx, seat.id) },
    notes(ctx)[seat.id] && { label: '清除我的備註', onclick: () => clearNotes(ctx, seat.id) },
  ]);
}

// 自己是獵手（含以為自己是獵手的酒鬼）、活著、白天、還沒開過槍、沒在投票：其他活著的人頭上有瞄準鈕
function canAim(s) {
  const me = s.seats.find(x => x.mine);
  return !s.isSt && !s.peek && !!me && !me.dead && s.myRole === 'slayer' && s.phase === 'day' && !s.slayerUsed && !s.nomination;
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
  const herring = good && st.redHerring !== seat.id && { label: '設為占卜師的紅鯡魚', onclick: () => ctx.st('setRedHerring', { seatId: seat.id }) };
  if (s.phase === 'lobby') return [
    st.draft && { label: '更換角色', onclick: () => pickRole(ctx, seat) },
    st.draft && herring,
    st.draft && '-',
    { label: '← 前移', onclick: () => ctx.st('moveSeat', { seatId: seat.id, dir: -1 }) },
    { label: '後移 →', onclick: () => ctx.st('moveSeat', { seatId: seat.id, dir: 1 }) },
    { label: '移出房間', danger: true, onclick: () => ask(`把 ${title} 移出房間？`, () => ctx.st('kick', { seatId: seat.id }), '移出') },
  ];
  const live = s.phase !== 'ended', poisoned = st.poisoned === seat.id;
  return [
    { label: '代入他的視角', onclick: () => ctx.peek(seat.id) },
    { label: '私聊', onclick: () => openChat(ctx, seat.id) },
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
