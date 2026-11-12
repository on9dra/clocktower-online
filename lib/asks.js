// 線下多設備：玩家在自己手機上發起的公開行動先變成一條「請求」，說書人收到後決定。
// 嘴上照樣說，手機上落實：提名、宣稱獵手開槍、雜耍藝人第一個白天公開猜、月之子 / 呆瓜死後公開選人。
// 說書人受理就照常走引擎（提名進審判、開槍進裁定、呆瓜選人照常裁定），也可以改對象、駁回；局面變了（他今天被提名過了、天黑了、
// 自己死了……）請求自動作廢。請求只有發起人和說書人看得到，受理以後才是全桌都看得到的提名、開槍。
//
// g.asks：[{ id, kind, from, to, guesses, at }]，按 at 排隊
//   kind：nom 提名 / slay 宣稱獵手開槍 / juggle 雜耍藝人公開猜（guesses：[{ id, role }]，一個座位猜一次）/ word 月之子、呆瓜死後選人
//   同一個人同一類只留一條：改了對象換成新的一條（新 id，說書人開著的舊卡隨之收起），排隊的位置不變
// g.askDone：處理完的，res：ok 受理 / no 駁回 / void 作廢（why 原因）/ drop 自己撤回。發起人手機上蓋個章再收走；只留最近的幾條
import { rid } from './store.js';
import { offline, oneDevice, seatById, scriptRoles } from './util.js';
import { nomRule, slayRule, juggleRule, nominate, slayer, juggle, answerLastWord } from './day.js';

export const asking = room => offline(room) && !oneDevice(room);
const DONE_MAX = 30;
export const SHOW_MS = 20000; // 處理結果發給手機多久（手機自己蓋章、幾秒後收走；過了這麼久重連的不再補）

const wordOf = (room, id) => room.g.lastWords?.find(x => x.seatId === id && !x.st);
// 這條請求按現在的局面還成不成立：成立返回空，不成立返回原因（寫給發起人看的）
function check(room, a) {
  const g = room.g, from = seatById(room, a.from), to = a.to ? seatById(room, a.to) : null;
  if (!from) return '座位不存在';
  if (room.phase !== 'day') return room.phase === 'ended' ? '遊戲結束了' : '白天結束了';
  switch (a.kind) {
    case 'nom': {
      const err = to ? nomRule(room, from, to) : '目標不存在';
      return err && a.to === a.from ? err.replace('他今天', '你今天') : err;
    }
    case 'slay': return to ? slayRule(room, from) : '目標不存在';
    case 'juggle': return juggleRule(room, from, a.guesses.length) || (a.guesses.every(x => seatById(room, x.id) && scriptRoles(room).includes(x.role)) ? null : '目標不存在');
    case 'word':
      if (!wordOf(room, from.id)) return g.lastWords?.some(x => x.seatId === from.id) ? '說書人來選' : '說書人已經記下了';
      return !to || to.dead || to === from ? '請選擇一名存活的其他玩家' : null;
    default: return '未知請求';
  }
}

function close(room, a, res, why = null) {
  const g = room.g;
  g.asks = (g.asks || []).filter(x => x !== a);
  (g.askDone ||= []).push({ ...a, res, why, done: Date.now() });
  if (g.askDone.length > DONE_MAX) g.askDone.splice(0, g.askDone.length - DONE_MAX);
}

// 玩家提出（或改掉自己同一類的那條）。o：targetId，雜耍藝人再帶 role（一次加一個猜測，同一個人再猜就換掉）
export function makeAsk(room, me, kind, o = {}) {
  if (!asking(room)) return '只有線下多設備的局才這樣提出';
  const g = room.g, list = (g.asks ||= []);
  const old = list.find(a => a.from === me.id && a.kind === kind);
  const t = o.targetId ? seatById(room, o.targetId) : null;
  if (!t) return '目標不存在';
  let a;
  if (kind === 'juggle') {
    if (!scriptRoles(room).includes(o.role)) return '角色不存在';
    const guesses = (old?.guesses || []).filter(x => x.id !== t.id).concat({ id: t.id, role: o.role });
    if (old && old.guesses.some(x => x.id === t.id && x.role === o.role)) return;
    a = { kind, from: me.id, guesses };
  } else if (['nom', 'slay', 'word'].includes(kind)) {
    if (old?.to === t.id) return; // 一樣的請求：不重複
    a = { kind, from: me.id, to: t.id };
  } else return '未知請求';
  const err = check(room, a);
  if (err) return err;
  a.id = rid(6);
  a.at = old ? old.at : Date.now();
  if (old) list.splice(list.indexOf(old), 1, a); else list.push(a);
}

// 玩家撤回：整條，或者雜耍藝人只拿掉其中一個猜測（seatId）
export function dropAsk(room, me, id, seatId) {
  const a = room.g.asks?.find(x => x.id === id && x.from === me.id);
  if (!a) return '這條請求已經不在了';
  if (a.kind === 'juggle' && seatId && a.guesses.length > 1) {
    if (!a.guesses.some(x => x.id === seatId)) return '沒有猜這個人';
    const b = { ...a, id: rid(6), guesses: a.guesses.filter(x => x.id !== seatId) };
    room.g.asks.splice(room.g.asks.indexOf(a), 1, b);
    return;
  }
  close(room, a, 'drop');
}

// 說書人駁回
export function rejectAsk(room, id) {
  const a = room.g.asks?.find(x => x.id === id);
  if (!a) return '這條請求已經不在了';
  close(room, a, 'no');
}

// 說書人受理：照常走引擎。over：說書人在卡上改過的對象（toId）/ 猜測（guesses），發起人不能改
export function takeAsk(room, id, over = {}) {
  const g = room.g, a = g.asks?.find(x => x.id === id);
  if (!a) return '這條請求已經不在了（撤回了或者改了）';
  const from = seatById(room, a.from), to = seatById(room, over.toId || a.to);
  let err;
  if (a.kind === 'nom') err = to ? nominate(room, from, to) : '目標不存在';
  else if (a.kind === 'slay') err = g.ruling ? '請先處理裁定' : to ? slayer(room, from, to) : '目標不存在';
  else if (a.kind === 'word') err = to ? answerLastWord(room, from.id, to.id) : '目標不存在';
  else if (a.kind === 'juggle') {
    // 先全部驗過再記：半路有一個不行，前面的不能已經記上
    const list = (Array.isArray(over.guesses) ? over.guesses : a.guesses).slice(0, 5).filter(x => seatById(room, x?.id));
    err = !list.length ? '至少要猜一個' : juggleRule(room, from, list.length) || (list.every(x => scriptRoles(room).includes(x.role)) ? null : '角色不存在');
    if (!err) for (const x of list) err ||= juggle(room, from, seatById(room, x.id), x.role);
  }
  if (err) return err;
  if (g.asks?.includes(a)) close(room, a, 'ok');
}

// 說書人沒點請求、自己從桌心「提名 / 開槍」或座位菜單替他做了同一件事：他手機上的那條算受理，不算作廢
export function settleAsk(room, kind, fromId, to) {
  const a = room.g.asks?.find(x => x.kind === kind && x.from === fromId);
  if (!a) return;
  const same = kind === 'juggle' ? a.guesses.every(x => to.some(y => y.id === x.id && y.role === x.role)) : a.to === to;
  if (same) close(room, a, 'ok');
}

// 局面變了：不再成立的請求作廢（寫明原因）。每次改動之後調（ops.js、server.js 推送前）
export function sweepAsks(room) {
  const list = room.g?.asks;
  if (!list?.length) return;
  for (const a of [...list]) {
    const why = check(room, a);
    if (why) close(room, a, 'void', why);
  }
}

// 說書人此刻能不能處理請求：審判、裁定進行中的排著（返回原因）
export function askWait(room, a) {
  const g = room.g;
  if (g.ruling) return '先處理完裁定';
  if (a.kind !== 'word' && room.nomination) return '審判結束後再處理';
  return null;
}

// 視圖：說書人看全部排隊的；玩家只看自己的，加上最近處理完的結果
export function askView(room, myId) {
  const g = room.g, now = Date.now(), recent = d => now - d.done < SHOW_MS;
  if (!myId) return { list: g.asks || [], done: (g.askDone || []).filter(recent).map(({ id, kind, from, res, why, done }) => ({ id, kind, from, res, why, done })) };
  return { list: (g.asks || []).filter(a => a.from === myId), done: (g.askDone || []).filter(d => d.from === myId && recent(d)), shot: !!g.shot?.includes(myId) };
}

// 撤銷（ops.js）：遊戲狀態整張換回去以後，這一步之後玩家自己做的事不跟著退——之後新提出的留著，之後撤回 / 作廢的不復活。
// after：那一步剛做完時的請求；now：撤銷前的請求。g 已經是換回去的那一份
export const askState = room => JSON.stringify({ asks: room.g?.asks || [], done: room.g?.askDone || [] });
export function undoAsks(room, after, now) {
  const g = room.g;
  if (!g || !after) return;
  const a = JSON.parse(after), n = JSON.parse(now);
  const had = new Set(a.asks.map(x => x.id)), has = new Set(n.asks.map(x => x.id));
  let list = (g.asks || []).filter(x => !had.has(x.id) || has.has(x.id));
  for (const x of n.asks.filter(y => !had.has(y.id))) list = list.filter(y => !(y.from === x.from && y.kind === x.kind)).concat(x);
  g.asks = list.sort((x, y) => x.at - y.at);
  const key = d => d.id + ':' + d.done, seen = new Set(a.done.map(key));
  g.askDone = [...(g.askDone || []), ...n.done.filter(d => !seen.has(key(d)))].slice(-DONE_MAX);
}
