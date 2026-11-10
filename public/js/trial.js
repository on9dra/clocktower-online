// 提名期間蓋在桌面上的「審判牌」（提名演出播完才出現）：
// 上面是提名者 → 被提名者兩張大牌，中間一枚紅色「提名」印章；
// 下面三欄：贊成的人在左、票數和需要的票格在中、棄權的人在右（只有自己和說書人看得到）；
// 再下面是投票倒數（說書人可暫停 / 重置）、未表態的人和計票進度；說書人最下面一行是取消、結算、計票按鈕。
// 說書人喊立即計票後：審判牌換成計票倒數，輪到自己時彈一張選票（countPop），選了立刻輪到下一位
import { h, roleToken, seatLabel } from './ui.js';
import { seatBadge, icon } from './glyph.js';
import { clockState, needVotes, voteButtons, trialButtons, isFolded, foldButton, foldStub } from './flow.js';
import { nomFx, nomHeld, callHeld } from './fx.js';
import { play } from './sfx.js';

// 計票開始是新的一步：收起的審判牌重新攤開
const foldKey = nom => 'trial-' + nom.nominatorId + nom.nomineeId + (nom.clock ? '-count' : '');
const seconds = ck => Math.ceil(ck.left / 1000);
// 審判牌攤在桌上時是哪一張（收起、演出還沒播完、沒有提名時為空）：矮橫屏上玩家的角色面板要給它讓位（hud.js）
export const openTrial = s => (s.nomination && !nomHeld() && !isFolded(foldKey(s.nomination)) ? foldKey(s.nomination) : null);

// 審判牌收起來時桌心一張紙條：誰提名誰、票數，玩家還能接著投票
export function trialStub(ctx) {
  const s = ctx.state, nom = s.nomination, key = foldKey(nom), ck = clockState(ctx);
  if (!isFolded(key)) return null;
  const count = o => Object.values(o || {}).filter(Boolean).length, vb = voteButtons(ctx);
  return foldStub(ctx, key, seatBadge(s, nom.nominatorId), icon('to'), seatBadge(s, nom.nomineeId), h('b', { class: 'fs-n' }, `${count(nom.votes)}/${needVotes(s)}`),
    ck && h('b', { class: 'fs-n tr-sec' }, seconds(ck)),
    vb && h('div', { class: 'tr-k' }, vb.yes(count(nom.votes)), vb.no(count(nom.abstain))));
}

// 線下局的審判牌：大家當面舉手，說書人點名字記下。只留誰提名誰、票數和一排能投票的人（舉手的亮著），沒有棄權、倒數
function handTrial(ctx) {
  const s = ctx.state, nom = s.nomination, need = needVotes(s), tap = s.isSt && !s.peek;
  const num = id => s.seats.findIndex(x => x.id === id) + 1, up = s.seats.filter(x => nom.votes[x.id]).length;
  const who = id => { const seat = s.seats.find(x => x.id === id), r = seat.role || (seat.mine && s.myRole);
    return h('div', { class: 'tr-who' }, r ? roleToken(r) : h('div', { class: 'token md blank' }, num(id)), h('div', { class: 'tr-plate' }, h('b', {}, num(id)), h('span', {}, seat.name))); };
  // 死了、死亡票也用了的人不能投，淡著不能點
  const hand = seat => {
    const on = !!nom.votes[seat.id], spent = seat.dead && seat.voteUsed && !on;
    return h(tap ? 'button' : 'span', { class: 'hv' + (on ? ' on' : '') + (spent ? ' spent' : '') + (seat.dead ? ' dead' : ''), 'data-key': 'hv-' + seat.id, title: seat.name,
      onclick: tap && !spent ? () => ctx.st('handVote', { seatId: seat.id, v: on ? null : 'yes' }) : null },
    h('b', {}, num(seat.id)), h('span', {}, seat.name), icon('hand', 'hv-ico')); // 手的位置一直留著（沒舉時看不見），點了名字不變寬、不擠動別的名字
  };
  return h('div', { class: 'trial hand-trial' + (nomFx() ? ' fx-pop' : ''), style: nomFx(), 'data-key': 'trial', 'data-exit': true },
    h('div', { class: 'tr-head' }, who(nom.nominatorId),
      h('div', { class: 'tr-verb' }, h('span', { class: 'tr-stamp', 'data-key': 'nom' }, '提名'), icon('to')), who(nom.nomineeId)),
    h('div', { class: 'tr-mid' + (up >= need ? ' enough' : '') },
      h('b', { class: 'tr-num', 'data-key': 'n' + up }, up),
      h('div', { class: 'tr-slots', title: `需 ${need} 票` }, Array.from({ length: Math.max(need, up) }, (_, i) => h('i', { class: i < up ? 'on' : '' })))),
    h('div', { class: 'hv-row' }, s.seats.map(hand)),
    trialButtons(ctx), foldButton(ctx, foldKey(nom)));
}

export function trialPanel(ctx) {
  const s = ctx.state, nom = s.nomination, ck = clockState(ctx), need = needVotes(s);
  if (isFolded(foldKey(nom))) return null;
  if (nom.hand) return handTrial(ctx);
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
    k === 'no' && (s.isSt || s.myId) && h('div', { class: 'tr-priv' }, icon('hidden'), s.isSt ? '僅本人與說書人可見' : '僅你與說書人可見'), // 觀戰的人不投票，不用跟他說
    h('div', { class: 'tr-chips' }, list.map(chip)));
  return h('div', { class: 'trial' + (nomFx() ? ' fx-pop' : '') + (ck ? ' counting' : ''), style: nomFx(), 'data-key': 'trial', 'data-exit': true },
    h('div', { class: 'tr-head' }, who(nom.nominatorId, 'from'),
      h('div', { class: 'tr-verb' }, h('span', { class: 'tr-stamp', 'data-key': ck ? 'count' : 'nom' }, ck ? '計票' : '提名'), icon('to')), who(nom.nomineeId, 'to')),
    h('div', { class: 'tr-body' },
      side('yes', '贊成', 'hand', yes),
      h('div', { class: 'tr-mid' + (yes.length >= need ? ' enough' : '') },
        h('b', { class: 'tr-num', 'data-key': 'n' + yes.length }, yes.length),
        h('div', { class: 'tr-slots', title: `需 ${need} 票` }, Array.from({ length: Math.max(need, yes.length) }, (_, i) => h('i', { class: i < yes.length ? 'on' : '' })))),
      side('no', '棄權', 'abstain', no)),
    ck ? countBar(ctx, nom, ck) : timerBar(ctx, nom),
    (idle.length > 0 || ck) && h('div', { class: 'tr-foot' },
      !ck && h('div', { class: 'tr-idle', title: '未表態' }, idle.map(chip)),
      ck && h('div', { class: 'tr-clock', title: '計票' }, icon('hand', 'tr-k-ico'),
        nom.clock.order.map((id, i) => h('span', {
          class: 'sb' + (i < ck.k ? ' past' : '') + (!ck.done && !ck.pending && i === ck.k ? ' now' : '') + (nom.votes[id] ? ' up' : '') + (id === s.myId ? ' mine' : ''), title: seatBadge(s, id).title,
        }, num(id))))),
    trialButtons(ctx), foldButton(ctx, foldKey(nom)));
}

// 導火索的動畫一個人只起一次：每次重繪都改 delay 會讓它抖。slot 是哪一根，at 變了就是新的一位
const lit = {};
function fuse(ctx, slot, c) {
  if (lit[slot]?.at !== c.at) lit[slot] = { at: c.at, delay: c.at - ctx.now() };
  return h('i', { class: 'fuse', 'data-key': 'fuse-' + c.k, style: { '--burn': c.step + 'ms', '--lit': lit[slot].delay + 'ms' } }, h('b'));
}

// 計票倒數（所有人都看得到）：正在選的人、大數字、一根燒著的導火索。選了就換下一位，最後兩秒變紅
function countBar(ctx, nom, ck) {
  const s = ctx.state, id = nom.clock.order[ck.k], sec = seconds(ck);
  return h('div', { class: 'tr-count' + (sec <= 2 && !ck.pending ? ' low' : '') },
    h('div', { class: 'tr-turn', 'data-key': 'turn-' + id }, seatBadge(s, id), h('span', {}, seatLabel(s, id).replace(/^\d+號\s*/, ''))),
    h('b', { class: 'tr-sec', 'data-key': `s${ck.k}-${sec}` }, sec),
    fuse(ctx, 'bar', nom.clock));
}

// 輪到自己：桌心彈一張選票。大數字倒數，兩枚大章二選一，點了立刻定下；預選過的那枚先亮著，到點就按它，什麼都沒選是棄權。
// turn：這一輪的記錄。輪過了（點了、到點、說書人提前結算）選票上蓋個章再收，不是一下子沒了
const STAMP_MS = 640, FADE_MS = 220;
const CHOICE = { yes: ['贊成', 'brass', 'hand'], abstain: ['棄權', 'gray', 'abstain'] };
let turn = null, beat = 0;
export function countPop(ctx) {
  const s = ctx.state, nom = s.nomination, ck = nom && clockState(ctx);
  const live = !!ck && !!s.myId && !s.isSt && !s.peek && ck.current === s.myId && !nomHeld() && !callHeld();
  if (live && turn?.at !== nom.at) {
    clearTimeout(turn?.gone);
    turn = { at: nom.at, nomineeId: nom.nomineeId, clock: nom.clock };
    play('turn');
  }
  if (!turn) return null;
  if (live) { turn.was = nom.votes[s.myId] ? 'yes' : nom.abstain?.[s.myId] ? 'abstain' : null; turn.clock = nom.clock; turn.nom = nom; }
  const settled = !live || turn.pick, v = turn.pick || turn.was || 'abstain';
  // 什麼時候算定下來：點的那一下，或者輪過去的那一下
  if (settled && !turn.stamped) { turn.stamped = true; play('stamp'); }
  // 自己淡出，不走 data-exit：那邊會把節點摘下再放回去，入場動畫和導火索都要重來一遍
  if (!live && !turn.gone) {
    const t = turn;
    t.gone = setTimeout(() => {
      t.out = true;
      ctx.render();
      t.gone = setTimeout(() => { if (turn === t) turn = null; ctx.render(); }, FADE_MS);
    }, STAMP_MS);
  }
  // 等服務器回話的那一下還顯示 1；定下來後數字留著，淡在章下面
  const sec = live ? Math.max(1, seconds(ck)) : turn.sec, low = live && sec <= 2;
  if (live && !settled) {
    if (sec !== turn.sec) { if (turn.sec) play(low ? 'tock' : 'tick'); turn.sec = sec; }
    clearTimeout(beat);
    beat = setTimeout(ctx.render, (ck.left % 1000 || 1000) + 10); // 數字踩著整秒換，音效才齊
  }
  const send = k => {
    if (settled) return;
    turn.pick = k;
    ctx.render();
    const t = turn;
    ctx.act('vote', { v: k }).then(r => { if (!r.ok && turn === t) { t.pick = null; t.stamped = false; ctx.render(); } });
  };
  // 死人投贊成用掉死亡票：章上帶一張票
  const btn = k => {
    const [text, tone, ico] = CHOICE[k];
    return h('button', { class: `vt-btn ${tone}` + (turn.was === k ? ' on' : ''), onclick: () => send(k) },
      icon(ico), text, k === 'yes' && s.seats.find(x => x.mine)?.dead && icon('ticket'), turn.was === k && h('small', {}, '已選'));
  };
  const n = turn.nom || nom, yes = Object.values(n?.votes || {}).filter(Boolean).length;
  const seat = s.seats.find(x => x.id === turn.nomineeId), i = s.seats.indexOf(seat), r = seat?.role || (seat?.mine && s.myRole);
  return h('div', { class: 'vt-pop' + (low ? ' low' : '') + (settled ? ' settled' : '') + (turn.out ? ' out' : ''), 'data-key': 'vt-' + turn.at },
    h('div', { class: 'pc vt-card' },
      h('div', { class: 'vt-top' }, h('h2', {}, '輪到你'), h('span', { class: 'vt-n' }, icon('hand'), yes, h('i', {}, '/', needVotes(s)))),
      fuse(ctx, 'pop', turn.clock),
      h('div', { class: 'vt-mid' },
        h('b', { class: 'vt-sec', 'data-key': 'sec' + sec }, sec),
        h('div', { class: 'vt-who' }, r ? roleToken(r) : h('div', { class: 'token md blank' }, i + 1), h('span', {}, seat && `${i + 1}號 ${seat.name}`))),
      h('div', { class: 'vt-btns' }, btn('yes'), btn('abstain')),
      settled && h('div', { class: 'ink-stamp vt-stamp ' + CHOICE[v][1], 'data-key': 'stamp' }, CHOICE[v][0])));
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
