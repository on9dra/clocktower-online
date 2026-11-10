// 流程引擎：開局 → 夜晚按順序自動喚醒 → 天亮前確認 → 公佈死訊進入白天
import { ROLES, TEAMS } from '../public/js/roles.js';
import { rid } from './store.js';
import { seatById, label, roleName, actingRole, impaired, whyImpaired, abnormal, fires, tell, announce, stLog, resetChat, fx, teamOf, alignOf, isEvil, reallyAlive, keptAbility, addEff, tick, pick, shuffle, scriptRoles, maxSeats, offline, oneDevice, guard, FAKE } from './util.js';
import { NIGHT, describeStep, vortoxOn, afterDemonKill } from './night.js';
import { OFFICIAL } from './official.js';
import { isBuiltin } from './script.js';
import { checkWin, die, revive, shieldOf, shieldLost, shieldText } from './rules.js';
import { startDay } from './day.js';
import { drawRoles, logSetup } from './setup.js';
import { formatInfo, truthLevel, checkFields, infoMarks, infoFormula, infoAnswer, answerSeats } from '../public/js/infofmt.js';

// 混合推進：系統不認識的角色（自製、官方但沒有內置規則）。在場、有夜晚位置的到點排一步 mark，說書人自己處理，系統只記下他點了誰
const MARK = { mark: true };
const nightOf = r => NIGHT[r] || MARK;
export const foreign = r => !!r && !isBuiltin(r);
const foreignInPlay = room => room.seats.some(s => foreign(s.role) || foreign(s.fakeRole));
// 不認識的角色排在哪：按參考順序（Json 自己寫的順序，否則官方順序表），排在它前面所有內置角色的後面。
// 官方表和內置表的刻度不一樣，不能直接拿數字比。內置角色之間照內置表排；Json 把它們寫成別的先後時（僧侶寫在投毒者前面），
// 只認「最近的一個」會把惡魔排到僧侶前面——劇本寫的是先保護再殺人，所以取前面所有內置角色裏最晚的那個
function foreignAt(room, r, first) {
  const key = first ? 'first' : 'other', own = room.scriptId === 'custom' && room.script?.[key];
  const num = id => (isBuiltin(id) ? OFFICIAL[id]?.[key] : ROLES[id]?.[key]) || 0;
  const list = own || [...new Set([...scriptRoles(room), ...room.seats.map(actingRole)])].filter(id => num(id) > 0).sort((a, b) => num(a) - num(b));
  const i = list.indexOf(r);
  if (i < 0) return 0;
  return Math.max(0, ...list.slice(0, i).filter(b => NIGHT[b] && ROLES[b][key] > 0).map(b => ROLES[b][key])) + 0.5 + i / 1000;
}

export function startGame(room, force = false) {
  // 小劇本超了人數：善良角色不夠分、偽裝湊不齊，開不了
  if (room.seats.length > maxSeats(room)) return `這個劇本只適合 5–${maxSeats(room)} 人，現在 ${room.seats.length} 人`;
  // 說書人預覽過角色就直接用，否則現抽
  if (!(room.draft && room.seats.length >= 5 && room.seats.every(s => s.role))) {
    const err = drawRoles(room);
    if (err) return err;
  }
  if (!force && !room.seats.some(s => ROLES[s.role].team === 'demon')) return '場上至少要有一名惡魔';
  // 線下局說書人當面主持：不用假裝叫醒（他自己會裝），代玩家點完也不用再確認一次
  room.g.noPretend = offline(room);
  // 沒有惡魔照樣開的局（force）：系統不判勝負（rules.js checkWin），首夜的爪牙 / 惡魔信息沒人可告訴就跳過
  room.g.noDemon = !room.seats.some(s => ROLES[s.role].team === 'demon');
  room.draft = false;
  room.gameId = rid();
  resetChat(room); // 上一局的信息和私聊不帶進新的一局
  room.fx = [];
  room.games = (room.games || 0) + 1;
  fx(room, { k: 'curtain', n: room.games }); // 拉幕：幕布合上再拉開，然後才翻角色牌
  Object.assign(room, { history: [], nomination: null, winner: null, winReason: '' });
  logSetup(room);
  announce(room, `遊戲開始，共 ${room.seats.length} 名玩家。請查看你的角色。`, { k: 'start', n: room.seats.length });
  for (const s of room.seats) {
    const r = ROLES[actingRole(s)];
    tell(room, s.id, `你的角色是【${r.name}】（${TEAMS[r.team].name}）：${r.ability}`, [], { k: 'role', src: r.id });
    fx(room, { k: 'role', role: r.id }, s.id);
  }
  startNight(room);
}

export function startNight(room) {
  const g = room.g;
  g.night += 1;
  room.phase = 'night';
  room.nomination = null;
  Object.assign(g, { poisoned: null, protected: null, monkFail: null, diedTonight: [], risen: [], step: null, beat: null, passed: [], woke: [], exorcised: null, luna: null,
    dusk: Object.fromEntries(room.seats.map(s => [s.id, s.role])) }); // 黃昏時的角色：賣花女孩、城鎮公告員問的是白天投票 / 提名時的身份，夜裏換過角色不算
  g.eff = (g.eff || []).filter(e => e.till >= 2 * g.night); // 過期的狀態效果
  // 「某角色選」（系統不認識的角色昨晚選了誰）留到下一次入夜：「明天白天中毒」這種白天還要看，再往後就只是堆在桌上
  for (const k in g.marks) g.marks[k] = g.marks[k].filter(t => !t.includes('主人') && !(g.pickTags || []).includes(t));
  g.pickTags = [];
  const first = g.night === 1;
  const at = r => (r === 'minioninfo' ? 6 : r === 'demoninfo' ? 9 : foreign(r) ? foreignAt(room, r, first) : first ? ROLES[r].first : ROLES[r].other);
  // 今晚的夜晚順序表：劇本上（和場上）今晚會行動的角色（首夜不行動的不在首夜表裏，只在首夜行動的不在其他夜晚的表裏）。
  // 不在場的也佔一格，到時說書人假裝叫醒（pretend）
  g.order = [...new Set([...scriptRoles(room), ...room.seats.map(actingRole)])].filter(r => (NIGHT[r] ? !NIGHT[r].group : foreign(r)) && at(r) > 0)
    .sort((a, b) => at(a) - at(b));
  g.queue = g.order.flatMap(r => {
    const holders = room.seats.filter(s => actingRole(s) === r);
    return holders.length ? holders.map(s => ({ roleId: r, seatId: s.id, at: at(r) })) : [{ roleId: r, seatId: null, at: at(r), fake: true }];
  });
  // 瘋子比真惡魔先行動（官方順序表裏他有自己的位置），真惡魔看到他選了誰再決定。
  // 進度條停在下一格（slot），玩家看不出多了一個人，也看不出他以為自己是哪個惡魔
  const nap = ROLES.lunatic[first ? 'first' : 'other'];
  for (const q of g.queue) if (seatById(room, q.seatId)?.role === 'lunatic' && at(q.roleId) > nap) Object.assign(q, { at: nap, slot: g.order.find(r => at(r) > nap) });
  g.queue.sort((a, b) => a.at - b.at);
  // 7 人及以上，爪牙和惡魔首夜得知隊友（5–6 人局按官方規則不互認）：入夜時直接發出，不佔進度條的格子（每局都有，假裝也沒有意義）。
  // 爪牙、瘋子、惡魔各自單獨叫醒（官方順序）：一起睜眼互認的話，瘋子會發現自己沒被叫起來
  if (first && room.seats.length >= 7) {
    g.queue.unshift({ roleId: 'minioninfo', at: 6 }, ...(room.seats.some(s => s.role === 'lunatic') ? [{ roleId: 'lunainfo', at: 8 }] : []), { roleId: 'demoninfo', at: 9 });
  }
  announce(room, `第 ${g.night} 夜降臨，所有人閉眼。`, { k: 'night', n: g.night });
  fx(room, { k: 'night', n: g.night });
  run(room);
}

// 隊列裏的步驟還要不要執行（死亡、角色已變化、沒人被處決等情況跳過）。
// maybe：給「之後」預告用，守鴉人還活著時算作可能被喚醒
const slotOf = q => q?.slot || q?.roleId;
export function willRun(room, q, maybe = false) {
  if (!q.seatId) return true;
  const h = nightOf(q.roleId), seat = seatById(room, q.seatId);
  if (!seat || actingRole(seat) !== q.roleId) return false;
  if (h.skip && h.skip(room, seat)) return false;
  if (room.g.exorcised === seat.id && ROLES[q.roleId].team === 'demon') return false; // 被驅魔人選中的惡魔今晚不醒
  // 死了還會醒的：亡骨魔殺死的爪牙（亡骨魔有能力時）、守鴉人、賢者、月之子、理髮師
  if (!reallyAlive(seat)) return keptAbility(room, seat) || !!h.wakeDead?.(room, seat);
  if (h.onlyIfDiedTonight) return maybe;
  return true;
}

// 推進夜晚：能自動完成的步驟直接完成，遇到需要玩家選擇或說書人處理的步驟就停下；
// 隊列走完後停在「天亮前確認」，說書人確認後才公佈死訊
export function run(room) {
  const g = room.g;
  g.order ||= [];
  while (room.phase === 'night') {
    if (g.step && g.step.status !== 'done') { if (g.beat) g.beat.held = true; return; }
    // 插進來的（心上人、拿到或找回只在首夜行動的能力）不佔進度條的格子，玩家看不出多了一步
    const next = g.queue[0], inst = !!next && (next.instant || !!nightOf(next.roleId).instant);
    // 順序表上的一格走完了，卻沒有停下來等過誰（不在場、今晚不醒、一下子就做完）：說書人假裝叫醒一會兒，
    // 不讓玩家看出開頭那一格是空的。只有今晚第一格假裝，後面的空格直接跳過；說書人勾了「本局不再假裝」就都跳過
    if (g.beat && !inst && !g.beat.held && slotOf(next) !== g.beat.roleId && g.order[0] === g.beat.roleId
      && room.settings?.pretend !== false && !g.noPretend) { pretend(room); continue; }
    g.queue.shift();
    if (!next) {
      g.step = { id: rid(), roleId: 'dawn', seatId: null, status: 'review', title: '天亮前確認' };
      return;
    }
    // 順序表上的角色才算一格（爪牙 / 惡魔信息不算）；半夜才加進隊列、表上沒有的角色（哲學家剛獲得的能力）補進表裏
    if (!nightOf(next.roleId).group && !inst && !g.order.includes(next.roleId)) addSlot(room, next.roleId);
    if (!nightOf(next.roleId).group && !inst && g.beat?.roleId !== slotOf(next)) g.beat = { roleId: slotOf(next), held: false };
    if (next.fake || !willRun(room, next)) {
      const s0 = next.seatId && g.exorcised === next.seatId && seatById(room, next.seatId);
      // 被驅魔人選中、今晚不醒：惡魔的其他能力照常（官方例子：沙巴洛斯照樣反芻），反芻這種要說書人定的停一下
      const prep = s0 && reallyAlive(s0) && nightOf(next.roleId).prep?.(room, s0);
      if (prep) {
        const step = g.step = { id: rid(), roleId: next.roleId, seatId: s0.id, status: 'decide', decide: prep, asleep: true };
        step.title = describeStep(room, step);
        continue;
      }
      if (s0) nightOf(next.roleId).asleep?.(room, s0);
      continue;
    }
    (g.passed ||= []).push(next.roleId); // 今晚已喚醒過的步驟（給說書人的進度條）
    const h = nightOf(next.roleId);
    // actor：替別人做選擇的人（理髮師死後由惡魔選）
    const owner = seatById(room, next.seatId), actor = h.actor && owner ? h.actor(room, owner) : owner;
    const step = g.step = { id: rid(), roleId: next.roleId, seatId: actor?.id || null, status: 'choose' };
    step.title = describeStep(room, step);
    // turn：順序表上輪到他自己的回合（線下說書人先整屏提示「輪到 ③ 號 僧侶 行動了」+ 能力，桌上他頭頂一個箭頭，herald.js）。
    // 別人的能力臨時叫醒的不算：插進來的（心上人、被教授復活後補一次首夜能力）、只是說書人結算的（造謠者、月之子）、
    // 替別人選的（理髮師死後的惡魔）、爪牙 / 惡魔信息；這一步裏私下告訴別人的（被洗腦、被換角色）本來就不是新的一步
    step.turn = !!actor && actor === owner && !inst && !h.stOnly && !h.group;
    // 系統不認識的角色：停在說書人的標記卡上（他自己叫醒、處理），點下一個才往下走。
    // ask / cons：能力文字裏認得出來的「要他選幾個人」「選了會怎樣」，線上據此在他手機上彈選人牌，卡上給出當場結算的鍵
    if (h.mark) {
      const tip = ROLES[next.roleId][g.night === 1 ? 'firstTip' : 'otherTip'] || null, ask = markAsk(next.roleId, tip);
      Object.assign(step, { status: 'mark', tip, ask, cons: ask ? markCons(next.roleId) : [], picks: [], did: {} });
      if (actor) g.woke.push(actor.id); // 侍女：他今晚也因為自己的能力醒了
      continue;
    }
    // 叫醒之前說書人要先定的事（沙巴洛斯反芻）：定完由 decide 把這一步排回隊列
    const prep = !next.prepped && h.prep?.(room, actor);
    if (prep) { Object.assign(step, { status: 'decide', decide: prep }); continue; }
    if (actor && !h.stOnly) g.woke.push(actor.id); // 侍女：今晚因自己能力醒過的人
    const choose = typeof h.choose === 'function' ? h.choose(room, actor) : h.choose;
    if (h.group) {
      const members = h.group(room);
      if (!members.length) { step.status = 'done'; continue; } // 沒有人要告訴（沒有惡魔照樣開的局）：這一步直接過
      for (const m of members) {
        tell(room, m.seatId, m.text, m.marks, { f: m.f, src: m.src || next.roleId });
        if (m.bluffs) (g.bluffsOf ||= {})[m.seatId] = [...m.bluffs];
        if (m.lunatic) stLog(room, `瘋子看到的假信息：${m.text}`, { k: 'told', seat: m.seatId, f: m.f, fake: true });
      }
      if (!oneDevice(room)) stLog(room, `${step.title}：已發送`, { k: 'sent', src: next.roleId }); // 單設備等說書人點了「下一個」才算告知過
      // 單設備：說書人叫醒爪牙、指出惡魔（爪牙信息），再單獨叫醒瘋子、惡魔整屏給他看爪牙和偽裝，停下來等他做完。
      // 多設備和線上一樣直接過：信息已經發到各人的手機上了。
      // lines：每人一行，demon / minions 是他得知的隊友（瘋子的是假爪牙），bluffs 是偽裝，luna 是惡魔得知的瘋子
      const team = (m, t) => (m.marks || []).filter(x => x.t === t).map(x => x.seatId);
      if (oneDevice(room)) Object.assign(step, { status: 'ack', lines: members.map(m => ({ seatId: m.seatId, demon: team(m, 'demon')[0] || null, minions: team(m, 'minion'), f: m.f, bluffs: m.bluffs || null, lunatic: !!m.lunatic, luna: m.luna || null, pup: m.pup || null })) });
      else step.status = 'done';
    } else if (choose && !canPick(room, step.seatId, choose)) {
      stLog(room, `${step.title}：沒有可以選的玩家，跳過`, { k: 'skip', src: step.roleId, seat: step.seatId });
      step.status = 'done';
    } else if (choose) {
      step.choose = choose.notLast ? { ...choose, last: g.lastPick?.[step.seatId] || [] } : choose; // last：桌上把上一晚選過的人灰掉
      const me = seatById(room, step.seatId);
      if (g.luna && me && me.role !== 'lunatic' && teamOf(me) === 'demon') step.choose = { ...step.choose, luna: g.luna }; // 瘋子今晚選了誰
    } else {
      resolve(room, step, []);
    }
  }
}

const slotAt = (room, r) => (room.g.night === 1 ? ROLES[r].first : ROLES[r].other);
function addSlot(room, r) {
  const o = room.g.order;
  const i = o.findIndex(x => slotAt(room, x) > slotAt(room, r));
  o.splice(i < 0 ? o.length : i, 0, r);
}
// 假裝叫醒：停一分鐘，到點自動往下走，說書人也可以直接點繼續
export const PRETEND_MS = 60000;
function pretend(room) {
  const g = room.g, r = g.beat.roleId;
  // why：absent 不在場；idle 在場但今晚不醒（死了、沒到時候）；quick 已經做完了（沒人可選、一下子就結算完）
  const why = (g.passed || []).includes(r) ? 'quick' : room.seats.some(s => actingRole(s) === r) ? 'idle' : 'absent';
  const at = Date.now();
  g.step = { id: rid(), roleId: r, seatId: null, status: 'fake', why, title: ROLES[r] ? roleName(r) : NIGHT[r].name, at, due: at + PRETEND_MS };
}
export function endPretend(room) {
  const step = room.g.step;
  if (room.phase !== 'night' || step?.status !== 'fake') return '沒有在假裝叫醒';
  step.status = 'done';
  run(room);
}
// 假裝叫醒的時間到了：服務端每次推送狀態後調用
const pretendTimers = new Map(); // 房間號 -> { due, timer }
export function pretendTick(room, onChange) {
  const step = room.g?.step, due = room.phase === 'night' && step?.status === 'fake' ? step.due : null, cur = pretendTimers.get(room.code);
  if (cur && cur.due !== due) { clearTimeout(cur.timer); pretendTimers.delete(room.code); }
  if (!due || pretendTimers.has(room.code)) return;
  pretendTimers.set(room.code, { due, timer: setTimeout(guard(() => {
    pretendTimers.delete(room.code);
    if (room.g.step?.status === 'fake' && room.g.step.due === due) { endPretend(room); onChange(room); }
  }), Math.max(0, due - Date.now()) + 30) });
}

// 夜晚進度條：順序表上的每一格，at 是現在走到哪一格（天亮前確認時等於格數）。
// 玩家只拿到角色順序，沒有 at：走到哪一格只有說書人知道；說書人還有每格的持有者，以及這一格是不是假裝叫醒（已經過的看有沒有真醒過，沒到的看會不會醒）
export function nightProgress(room, isSt) {
  const g = room.g, order = g.order || [], step = g.step;
  if (!isSt) return { order: order.map(r => ({ r })) };
  const at = !step || step.status === 'review' ? order.length : order.indexOf(g.beat?.roleId ?? step.roleId);
  return {
    at,
    order: order.map((r, i) => {
      const seats = room.seats.filter(s => actingRole(s) === r).map(s => s.id);
      const real = i < at || (i === at && step?.status === 'fake') ? (g.passed || []).includes(r)
        : g.queue.some(q => q.roleId === r && !q.fake && willRun(room, q, true)) || (i === at && step?.status !== 'fake');
      return { r, seats, fake: !real };
    }),
  };
}

// 表單裏有沒有「隱士 / 間諜登記」帶來的其他合規答案
const ALT = {
  number: f => (f.ok || []).length > 1,
  yesno: f => (f.ok || []).some(v => v !== f.truth.yes),
  role: f => (f.ok || []).length > 0,
  two: f => Object.keys(f.mayBe || {}).length > 0 || (f.allowNone && f.noneOk && !f.truth.none),
  dream: f => (f.ok || []).length > 0,
};

function resolve(room, step, picks, from = room.chatSeq || 0) {
  const seat = seatById(room, step.seatId);
  const res = NIGHT[step.roleId].run(room, seat, picks.map(id => seatById(room, id)), { ...step.opts });
  step.picks = picks;
  settle(room, step, res);
  heldTells(room, step, from);
}
// 單設備：這一步私下告訴了別人什麼（被換了角色、成了惡魔、被洗腦、被驅魔人選中……）。玩家沒有手機收不到，
// 停下來（ack），說書人叫醒他、整屏給他看（stepcard.js ackPages）。行動者自己的（理髮師除外：惡魔替他選、把自己換了，新角色卡上沒有）、瘋子選了誰（惡魔醒的時候卡上寫著）不算
function heldTells(room, step, from) {
  if (!oneDevice(room) || room.phase !== 'night') return;
  const told = room.chat.filter(m => m.seq > from && m.info && m.to && (m.to !== step.seatId || step.roleId === 'barber') && m.k !== 'act' && m.src !== 'lunatic' && seatById(room, m.to))
    .map(m => ({ seatId: m.to, f: m.f || null, src: m.src || null, k: m.k || null })); // k：role 是換了角色（卡上寫「讓他得知自己變成了」）
  if (told.length) step.told = [...(step.told || []), ...told];
  // 之前的裁定裏攢下的也算（麻臉巫婆造了惡魔、再裁定今晚誰死，最後一步才結束）
  if (!step.told?.length) return;
  if (step.status === 'done') Object.assign(step, { id: rid(), status: 'ack' }); // 換 id：操作卡換一張
}
// 一步的結算結果：要裁定、要給信息、要說書人看一眼（ack）或者做完了
function settle(room, step, res) {
  step.result = { note: res.note, e: res.e, f: res.f };
  logAct(room, step, res);
  if (res.decide) { Object.assign(step, { status: 'decide', decide: res.decide }); return; }
  if (!res.form) { step.status = res.ack ? 'ack' : 'done'; return; }
  // 信息類角色：停下來讓說書人選擇要告訴他什麼（能力正常時預填真實答案，只能給合規信息）
  Object.assign(step, { status: 'confirm', form: { ...res.form, roleId: step.roleId, free: false, alt: !!ALT[res.form.kind]?.(res.form) } });
  syncFree(room);
}

// 夜晚行動的結果：寫日誌，並在說書人的魔典上播演出
function logAct(room, step, res) {
  if (res.note) stLog(room, `${step.title}：${res.note}`, res.e);
  if (res.e) fx(room, { ...res.e, k: 'grim' }, 'st');
}

const WHY = { 酒鬼: 'drunk', 瘋子: 'drunk', 提線木偶: 'puppet', 醉酒: 'tipsy', 中毒: 'poison' };
// 給信息的步驟：玩家中毒 / 是酒鬼時可以給錯誤信息。說書人中途改了中毒或角色，卡片跟著變
// 渦流在場時，真鎮民的信息必須是錯的（不知道真相的表單除外）；open：說書人隨時可以改（數學家）
export function syncFree(room) {
  const step = room.g.step, seat = step && seatById(room, step.seatId);
  if (step?.status === 'confirm' && seat) {
    // 中毒 / 醉酒的鎮民在渦流下也只能得到錯誤信息；不知道真相的表單（雜耍藝人）攔不了，只標出來
    const bad = impaired(room, seat) || !!step.form.impaired, spun = teamOf(seat) === 'townsfolk' && vortoxOn(room), vortox = spun && !step.form.unknown;
    // 場上有系統不認識的角色：它可能改變誰被當成什麼，真相照樣預選，但任何答案都能選
    step.form.free = bad || vortox || !!step.form.open || foreignInPlay(room);
    step.form.vortox = vortox;
    step.form.why = spun ? 'vortox' : bad ? WHY[whyImpaired(room, seat)] : null;
  }
}
// 數學家：裁定無效時先不算的能力。僧侶要看惡魔有沒有攻擊他保的人（rules.js shieldLost），女巫的詛咒沒人踩就沒有後果
const LATER = new Set(['monk', 'witch']);

// 玩家自己的夜晚行動：在他的面板上記一筆（沒有後續信息的角色），並播放落到目標上的演出。
// msg：面板上的那一筆，演出播完才出現；pick：信息類角色選完人、等說書人給信息（演一下輕的，答案到了再演整段）
function recordAct(room, step, ids, role) {
  let msg = null;
  const swap = step.result?.e?.swap; // 舞蛇人換到惡魔：牌在這段演出裏當場換，對方現在是什麼記在他座位旁邊
  // 選角色獲得能力的哲學家：面板上已經有「變成某角色」那一行，不再記一筆
  if (step.status !== 'confirm' && !(role && actingRole(seatById(room, step.seatId)) === role)) {
    const who = ids.map(id => label(room, id)).join('、') + (role ? `【${roleName(role)}】` : '');
    tell(room, step.seatId, who ? `你選擇了 ${who}` : '你沒有使用能力', swap ? [{ seatId: ids[0], r: swap.gave }] : [],
      { k: 'act', src: step.roleId, f: [{ op: 'to' }, ...ids.map(s => ({ s })), ...(role ? [{ r: role, named: true }] : [])] });
    msg = room.chatSeq;
  }
  // 珀不選人：蓄力也是一次出手。按選人卡認（這一晚可以不選），醉酒、中毒（結果是裁定卡）和以為自己是珀的瘋子看到的一樣
  const charge = !ids.length && step.roleId === 'po' && !!step.choose?.counts?.includes(0);
  if (ids.length || role || charge) fx(room, { k: 'act', src: step.roleId, to: ids, ...(role && { role }), ...(charge && { charge }), ...(swap && { swap }), ...(msg ? { msg } : { pick: true }) }, step.seatId);
}

// 這一步裏換了自己的角色（哲學家、舞蛇人選中惡魔、理髮師換到自己）：先演自己出手，再翻牌。序號跟著換，客戶端靠它認新事件
function actFirst(room, seatId, from) {
  const q = room.fx || [], act = q.at(-1), i = q.findIndex(e => e.seq > from && e.aud === seatId && ['role', 'demon', 'changed'].includes(e.k));
  if (act?.k !== 'act' || act.aud !== seatId || i < 0) return;
  const seqs = q.slice(i).map(e => e.seq);
  q.pop();
  q.splice(i, 0, act);
  q.slice(i).forEach((e, n) => { e.seq = seqs[n]; });
}

// 說書人給的是隱士 / 間諜「登記」帶來的合規信息時，是誰在登記、登記成了什麼
function registered(room, form, f, a) {
  const may = form.mayBe || {};
  const pickReg = ids => ids.map(id => seatById(room, id)).find(s => s && (s.role === 'recluse' || s.role === 'spy'));
  if (form.kind === 'two' && !f.none) {
    const s = [f.a, f.b].map(id => seatById(room, id)).find(x => (may[x?.id] || []).includes(f.role));
    return s && { reg: s.id, regRole: s.role, as: f.role };
  }
  const s = pickReg(answerSeats(a));
  return s && { reg: s.id, regRole: s.role, ...(form.kind === 'role' && { as: f.role }) };
}

// 選人是否合規：人數、自己、死活、和上一晚相同、角色
function checkPicks(room, step, ids, role) {
  const c = step.choose, counts = c.counts || [c.count];
  if (!counts.includes(ids.length)) return `請選擇 ${counts.join(' 或 ')} 名玩家`;
  const ts = ids.map(id => seatById(room, id));
  if (ts.some(t => !t)) return '玩家不存在';
  if (c.notSelf && ids.includes(step.seatId)) return '不能選擇自己';
  if (c.alive && ts.some(t => t.dead)) return '只能選擇存活的玩家';
  if (c.dead && ts.some(t => !t.dead)) return '只能選擇死亡的玩家';
  const last = room.g.lastPick?.[step.seatId];
  if (c.notLast && ids.length && last?.length && ids.every(id => last.includes(id))) return '不能和上一晚選同一名玩家';
  if (c.roles) {
    if (role && !c.roles.includes(role)) return '這個角色不能選';
    if (!role && !(c.roleOptional && !ids.length)) return '請選擇一個角色';
  }
  return null;
}

// 有沒有足夠的合規目標（比如侍女要兩名除自己以外的存活玩家）
const pool = (room, actorId, c) => room.seats.filter(s => !(c.notSelf && s.id === actorId) && !(c.alive && s.dead) && !(c.dead && !s.dead));
function canPick(room, actorId, c) {
  const counts = c.counts || [c.count], n = pool(room, actorId, c).length;
  const last = c.notLast && room.g.lastPick?.[actorId]?.length === 1 ? room.g.lastPick[actorId][0] : null;
  return counts.some(k => k === 0 || n - (last && k === 1 && pool(room, actorId, c).some(s => s.id === last) ? 1 : 0) >= k);
}

// 莽夫：今晚第一個用能力選中他的人醉酒到下個黃昏，莽夫轉為那人的陣營
function goonHit(room, chooser, ids) {
  const g = room.g;
  const goon = ids.map(id => seatById(room, id)).find(t => t.role === 'goon' && t !== chooser && reallyAlive(t));
  if (!goon || g.goonNight === g.night || !fires(room, goon)) return;
  g.goonNight = g.night;
  // 醉酒是立刻的，這次能力就受影響。官方：能力正常的刺客例外，莽夫照死，也轉為邪惡
  if (!(chooser.role === 'assassin' && !impaired(room, chooser))) addEff(room, chooser.id, 'drunk', 'goon', tick(room) + 1, goon.id, { live: true });
  const before = alignOf(goon);
  if (!(goon.goonEvil && !isEvil(chooser))) goon.align = alignOf(chooser); // 相剋：被麻臉巫婆變成莽夫的邪惡玩家不會因此轉善
  const align = alignOf(goon), changed = align !== before, name = align === 'evil' ? '邪惡' : '善良';
  // 陣營變了才告訴莽夫（官方：叫醒他比大拇指），不告訴他是誰選的
  if (changed) tell(room, goon.id, `你的陣營變為${name}`, [], { src: 'goon', f: [{ r: 'goon', named: true }, { op: 'become' }, { w: name, k: align === 'evil' ? 'evil' : 'good' }] });
  const e = { k: 'goon', seat: chooser.id, goon: goon.id, align, changed };
  g.step.goon = e; // 結果卡上給說書人看
  stLog(room, `${label(room, chooser.id)} 選中了莽夫 ${label(room, goon.id)}：醉酒到下個黃昏，莽夫${changed ? `變為${name}` : '陣營不變'}`, e);
}

export function submitPicks(room, bySt, who, ids, role) {
  const step = room.g.step;
  if (room.phase !== 'night' || !step || step.status !== 'choose') return '現在不需要選擇';
  if (!bySt && step.seatId !== who) return '還沒輪到你';
  ids = [...new Set(ids || [])];
  role = role || null;
  const err = checkPicks(room, step, ids, role);
  if (err) return err;
  const seat = seatById(room, step.seatId);
  (room.g.lastPick ||= {})[seat.id] = ids;
  const chatFrom = room.chatSeq || 0; // 莽夫轉陣營在結算之前就告訴了他：單設備也要停下給他看
  if (!FAKE[seat.role]) goonHit(room, seat, ids); // 酒鬼、瘋子沒有能力，選中莽夫不算
  // 瘋子：真正的惡魔知道他選了誰
  const demon = seat.role === 'lunatic' && room.seats.find(s => teamOf(s) === 'demon' && reallyAlive(s));
  if (demon && ids.length) {
    tell(room, demon.id, `瘋子 ${label(room, seat.id)} 選擇了 ${ids.map(id => label(room, id)).join('、')}`, [],
      { src: 'lunatic', f: [{ s: seat.id }, { r: 'lunatic', named: true }, { op: 'to' }, ...ids.map(s => ({ s }))] });
    room.g.luna = { seatId: seat.id, ids }; // 線下：說書人叫醒真惡魔時卡上寫著，好指給他看
  }
  step.opts = role ? { role } : {};
  const fxFrom = room.fxSeq || 0;
  resolve(room, step, ids, chatFrom);
  recordAct(room, step, ids, role);
  actFirst(room, step.seatId, fxFrom);
  // 選完人：停下來等說書人看過結果再叫下一位，免得漏看（代選的也一樣，結果要看了才知道）。後面還有裁定或給信息的不用多點一次。換 id：操作卡換一張
  // 線下局是說書人自己代點的，結果他已經看到了，不用再點一次確認（結果本身要確認的照舊停下）
  // 舞蛇人選中惡魔、兩人換了角色：線下也停下，說書人要叫醒兩人告訴他們新角色（單設備卡上有給他們看的按鈕）
  const swapped = !!step.result?.e?.swap;
  // 多設備時兩人手機上已經收到新角色，不用再停
  if (step.status === 'done' && room.phase === 'night' && (!(bySt && offline(room)) || (swapped && oneDevice(room)))) Object.assign(step, { id: rid(), status: 'ack' });
  // 單設備：查驗類（占卜師、守鴉人……）點完人停在信息卡上，同時整屏亮出該告訴他什麼（infoform.js 自動彈出），
  // 說書人當面點頭搖頭或者給他看，再點「下一個」。日誌記下給了什麼；桌上不掛「誰查過」——查過就是發生過的事，在日誌和座位的「記錄」裏
  if (bySt && oneDevice(room) && step.status === 'confirm' && room.phase === 'night') {
    // 中毒、醉酒、渦流時說書人自己挑一個（錯誤的）告訴他，系統記下他給了什麼
    syncFree(room);
  }
  run(room);
}

// ───── 系統不認識的角色（混合推進）─────
// 系統讀不懂能力，只從文字裏認幾個常見的詞：要不要他選人、選幾個，選了會怎樣（死亡 / 中毒 / 醉酒）。
// 認得出來的：線上在他手機上彈選人牌，說書人的卡上給出當場結算的鍵。認不出來的照舊由說書人自己處理（座位菜單、聊天）
const TOLD = /[讓让請请叫](?:他|她|其|玩家)[^。，,.；;]{0,8}[選选指]/; // 提示詞是寫給說書人的，「選擇」可能是說書人選：只認「讓他選」
const N_WORD = { 一: 1, 兩: 2, 两: 2, 二: 2, 三: 3, a: 1, an: 1, one: 1, two: 2, three: 3 };
const clauseAt = (text, i) => text.slice(i).split(/[：:。.；;]/)[0];
export function markAsk(roleId, tip) {
  const ab = String(ROLES[roleId]?.ability || '');
  let clause = null, lead = '';
  // 能力裏「選擇……玩家」那一句（選角色、選數字的不算：手機上只會點座位）
  for (const m of ab.matchAll(/選擇|选择|choose|pick/gi)) {
    const c = clauseAt(ab, m.index);
    if (/玩家|players?\b/i.test(c)) { clause = c; lead = ab.slice(Math.max(0, m.index - 6), m.index); break; }
  }
  const t = !clause && tip ? TOLD.exec(tip) : null;
  if (t) clause = clauseAt(tip, t.index);
  if (!clause) return null;
  const any = /任意|若干|any number/i.test(clause);
  const m = clause.match(/([一二兩两三1-5])\s*[名位個个]/) || clause.match(/\b(an?|one|two|three|[1-5])\b[^,]{0,24}?players?/i);
  const n = any ? 0 : Math.min(5, Number(m?.[1]) || N_WORD[m?.[1]?.toLowerCase()] || 1);
  return { n, any, opt: /可以|至多|最多|may|might|up to/i.test(lead + clause) };
}
// 後果要落在被選的人身上才算：「他死亡」「他明天白天中毒」「they die」。「你死亡」和帶條件的半句（「如果當晚他中毒」）不是
const THEM = /他|她|其|該玩家|该玩家|這名玩家|这名玩家|他們|他们|they|them|that player|those players/;
const onThem = kw => { const re = new RegExp(`(?:${THEM.source}).{0,12}?(?:${kw.source})`, 'i'); return text => text.split(/[，,。.；;：:！!（）()]/).some(p => !/如果|若|\bif\b/i.test(p) && re.test(p)); };
const CONS = { kill: onThem(/死亡|被殺|被杀|dies?\b|is killed|are killed/), poison: onThem(/中毒|poisoned/), drunk: onThem(/醉酒|喝醉|drunk/) };
export const markCons = roleId => Object.keys(CONS).filter(k => CONS[k](String(ROLES[roleId]?.ability || '')) || (k === 'kill' && ROLES[roleId]?.team === 'demon'));
// 玩家手機上能選幾個人
const askCounts = (room, a) => (a.any ? room.seats.map((_, i) => i).concat(room.seats.length) : a.opt ? Array.from({ length: a.n + 1 }, (_, i) => i) : [a.n]);
// 輪到他時手機上的牌：要選人的是選人牌（選完就收），不用選人的只告訴他輪到了（等說書人發信息）
export function markPrompt(room, step) {
  const a = step.ask, base = { mark: true, stepId: step.id, roleId: step.roleId };
  if (!a) return step.said ? null : { ...base, wake: true, count: 0, counts: [0], prompt: '輪到你了' }; // 信息發到了就收走，面板讓出來給他看
  if (step.sent) return null;
  const counts = askCounts(room, a);
  // 能力寫的是「任意數量」「可以」「至多」時照實說，不然他以為非選滿不可
  const prompt = a.any ? '選擇任意數量的玩家' : !a.opt ? `選擇 ${a.n} 名玩家` : a.n > 1 ? `選擇至多 ${a.n} 名玩家` : '可以選擇 1 名玩家';
  return { ...base, counts, count: Math.max(...counts), any: a.any, prompt };
}

// 他選了誰：線下當面指，說書人在桌上點；線上他在手機上點完確認（by 是他的座位），說書人也能替他點。
// 只記下來、在被選的人身上掛標記，後果由說書人在卡上結算（markDo）。「誰選了誰」那一行日誌到下一個時才寫，中途改主意不留痕
export function markPick(room, ids, by = null) {
  const step = room.g.step;
  if (room.phase !== 'night' || step?.status !== 'mark') return by ? '現在不需要選擇' : '現在沒有要記的';
  ids = [...new Set(ids || [])].filter(id => seatById(room, id));
  if (by) {
    if (step.seatId !== by) return '還沒輪到你';
    if (!step.ask || step.sent) return '現在不需要選擇';
    const counts = askCounts(room, step.ask);
    if (!counts.includes(ids.length)) return step.ask.any ? '請選擇玩家' : `請選擇 ${counts.join(' 或 ')} 名玩家`;
  }
  step.picks = ids;
  // 被他指到的人掛「某角色選」（只留最近一次，下一次入夜摘掉）：系統不認識這個角色，效果要說書人自己結算，白天還要看；之前選過誰在記錄裏
  const tag = `${roleName(step.roleId)}選`, g = room.g;
  for (const [id, list] of Object.entries(g.marks)) if (list.includes(tag)) g.marks[id] = list.filter(x => x !== tag);
  for (const id of ids) (g.marks[id] ||= []).push(tag);
  if (!(g.pickTags ||= []).includes(tag)) g.pickTags.push(tag);
  if (by) {
    step.sent = true;
    tell(room, by, ids.length ? `你選擇了 ${ids.map(id => label(room, id)).join('、')}` : '你沒有使用能力', [], { k: 'act', src: step.roleId, f: [{ op: 'to' }, ...ids.map(s => ({ s }))] });
  }
}

// 這次死亡擋不擋得住：惡魔的攻擊還要看僧侶和士兵（鎮長替死不問，說書人改點別人就行）
const markShield = (room, t, demon) => (demon && room.g.protected === t.id ? 'protect' : demon && t.role === 'soldier' && !impaired(room, t) ? 'soldier' : shieldOf(room, t, { demon }));
const shieldSay = k => (k === 'soldier' ? '是士兵' : shieldText(k));
// 當場結算：他選的人死亡 / 中毒 / 醉酒（on = false 是收回）。在這一步裏做，後面的角色才接得上：
// 守鴉人今晚醒、賢者得知惡魔、祖母跟著死，共情者按死後的鄰座算。
// 死亡照規則先看保護（僧侶、士兵、旅店老闆、水手、茶藝師、弄臣）：擋住了就不死，把原因回給說書人，他認為這個能力擋不住再 force。
// 中毒、醉酒和投毒者一樣到明天黃昏
export function markDo(room, what, on, force) {
  const g = room.g, step = g.step;
  if (room.phase !== 'night' || step?.status !== 'mark') return '現在沒有要結算的';
  if (!Object.hasOwn(CONS, what)) return '未知操作';
  const actor = seatById(room, step.seatId), ts = (step.picks || []).map(id => seatById(room, id)).filter(Boolean);
  if (!ts.length) return '先在桌上點他選的人';
  const did = step.did ||= {}, list = did[what] ||= [], who = `${label(room, step.seatId)}（${roleName(step.roleId)}）`;
  const keep = () => { did[what] = list.filter(id => !step.picks.includes(id)); };
  if (what === 'kill') {
    if (!on) {
      for (const t of ts) if (list.includes(t.id) && t.dead) revive(room, t, '的死亡被說書人收回');
      return keep();
    }
    const demon = ROLES[step.roleId]?.team === 'demon', blocked = [];
    for (const t of ts.filter(reallyAlive)) {
      const sh = force ? '' : markShield(room, t, demon);
      if (sh) {
        blocked.push({ id: t.id, why: shieldSay(sh) });
        stLog(room, `${who}攻擊 ${label(room, t.id)}，但他${shieldSay(sh)}`, { k: 'act', src: step.roleId, seat: step.seatId, to: [t.id], res: 'blocked', why: sh });
        continue;
      }
      shieldLost(room, t, { demon });
      die(room, t, demon ? '夜裏被惡魔殺死' : `被${roleName(step.roleId)}殺死`);
      if (demon && actor) afterDemonKill(room, actor, t);
      stLog(room, `${who}殺死了 ${label(room, t.id)}`, { k: 'act', src: step.roleId, seat: step.seatId, to: [t.id], res: 'kill' });
      if (!list.includes(t.id)) list.push(t.id);
    }
    return blocked.length ? { blocked } : undefined;
  }
  const word = what === 'poison' ? '中毒' : '醉酒';
  if (on) {
    for (const t of ts) if (!list.includes(t.id)) {
      addEff(room, t.id, what, step.roleId, 2 * g.night + 1, step.seatId, { st: true });
      list.push(t.id);
      stLog(room, `${who}讓 ${label(room, t.id)} ${word}`, { k: 'act', src: step.roleId, seat: step.seatId, to: [t.id], res: 'poison', word });
    }
  } else {
    const off = ts.filter(t => list.includes(t.id)).map(t => t.id);
    g.eff = (g.eff || []).filter(e => !(e.st && e.kind === what && e.src === step.roleId && off.includes(e.seat)));
    for (const id of off) stLog(room, `說書人收回了 ${label(room, id)} 的${word}`, { k: 'fix', what: what === 'poison' ? 'unpoison' : 'sober', seat: id });
    keep();
  }
  syncFree(room);
}

// 說書人看過玩家行動的結果，叫下一位
export function ackStep(room) {
  const step = room.g.step;
  if (room.phase !== 'night' || (step?.status !== 'ack' && step?.status !== 'mark')) return '沒有待確認的行動';
  if (step.lines) stLog(room, `${step.title}：已告知`, { k: 'sent', src: step.roleId });
  if (step.status === 'mark' && step.picks?.length) {
    stLog(room, `${label(room, step.seatId)}（${roleName(step.roleId)}）選了 ${step.picks.map(id => label(room, id)).join('、')}`,
      { k: 'card', seat: step.seatId, f: step.picks.map(s => ({ s })) });
  }
  step.status = 'done';
  run(room);
}

// 隨機對局測試用：按規則隨機選一組合規的人和角色
export function autoPicks(room, step) {
  const c = step.choose, counts = c.counts || [c.count];
  for (let k = 0; k < 50; k++) {
    const n = pick(counts);
    const ids = shuffle(pool(room, step.seatId, c)).slice(0, n).map(s => s.id);
    const role = c.roles && (ids.length || !c.roleOptional || Math.random() < 0.5) ? pick(c.roles) : null;
    if (ids.length === n && !checkPicks(room, step, ids, role)) return { ids, role };
  }
  return { ids: [], role: null, stuck: true };
}

export function confirmStep(room, fields) {
  const step = room.g.step;
  if (!step || step.status !== 'confirm') return '沒有待確認的信息';
  syncFree(room);
  const err = checkFields(step.form, fields, room.seats.map(x => x.id));
  if (err) return err;
  const form = step.form;
  if (!form.free && truthLevel(form, fields) === 0) return '能力正常時只能給合規信息';
  // 有隱士 / 間諜可以登記時，說書人選的答案總能在某種登記下是錯的，不攔（否則是非題兩個答案都發不出去）
  if (form.vortox && !form.alt && truthLevel(form, fields) > 0) return '渦流在場：鎮民只能得到錯誤信息';
  // 數學家：錯誤信息、靠隱士 / 間諜登記出來的信息都算失常；說書人自己調整數學家的數字不算
  if (truthLevel(form, fields) < 2 && (!form.open || form.why)) abnormal(room, seatById(room, step.seatId));
  // 兩名玩家的先後順序隨機，避免玩家從順序看出誰是真正的持有者
  if (form.kind === 'two' && !fields.none && Math.random() < 0.5) fields = { ...fields, a: fields.b, b: fields.a };
  const msg = formatInfo(form, fields, id => label(room, id));
  const f = infoFormula(form, fields);
  tell(room, step.seatId, msg, infoMarks(form, fields), { f, src: step.roleId });
  // 演出：自己看到答案落在桌上再收進面板（面板那一行等演出播完才出現）；說書人魔典上一拍
  const ans = infoAnswer(form, fields), lv = truthLevel(form, fields), reg = lv === 1 && registered(room, form, fields, ans);
  fx(room, { k: 'info', src: step.roleId, kind: form.kind, ...ans, msg: room.chatSeq }, step.seatId);
  fx(room, { k: 'grim', src: step.roleId, seat: step.seatId, to: answerSeats(ans), kind: form.kind, ...ans, grim: undefined,
    res: lv === 0 ? 'fail' : reg ? 'reg' : 'info', ...(reg || {}) }, 'st');
  // 給出的兩名玩家不掛到桌上：給的那一刻卡上已經標著，之後不再影響任何裁定，查的時候看日誌和座位的「記錄」
  const level = truthLevel(form, fields);
  stLog(room, `${step.title}：告知「${msg}」${['（錯誤信息）', '（隱士/間諜登記）', ''][level]}`,
    { k: 'info', src: step.roleId, seat: step.seatId, f, level, free: form.free, why: form.why || null });
  step.status = 'done';
  run(room);
}

// 說書人裁定：鎮長替死、小惡魔傳位給哪名爪牙
export function decideStep(room, choice) {
  const step = room.g.step;
  if (room.phase !== 'night' || !step || step.status !== 'decide') return '沒有待裁定的事項';
  if (!step.decide.options.some(o => o.id === choice)) return '請選擇一個選項';
  const seat = seatById(room, step.seatId), from = room.chatSeq || 0;
  let res;
  if (step.decide.kind === 'ability') {
    // 中毒 / 酒鬼的能力：說書人看過，帶著「無效」重跑這一步（之後可能還有下一個裁定）
    const d = step.decide;
    step.opts = { ...step.opts, [d.role]: false };
    if (!LATER.has(d.role)) abnormal(room, seatById(room, d.targetId));
    stLog(room, `${label(room, d.targetId)}（${roleName(d.role)}）${d.why}：能力無效`,
      { k: 'rule', seat: d.targetId, role: d.role, why: d.why, work: false });
    res = NIGHT[step.roleId].run(room, seat, (step.picks || []).map(id => seatById(room, id)), step.opts);
  } else res = NIGHT[step.roleId].decide(room, seat, step, choice);
  settle(room, step, res);
  heldTells(room, step, from);
  run(room);
}

export function skipStep(room) {
  const step = room.g.step;
  if (!step || step.status === 'done' || step.status === 'review') return '沒有可以跳過的步驟';
  if (step.status === 'decide') return '這一步需要你裁定，不能跳過';
  if (step.status === 'fake') return endPretend(room);
  if (step.status === 'ack') return ackStep(room);
  stLog(room, `${step.title}：說書人跳過`, { k: 'skip', src: step.roleId, seat: step.seatId });
  step.status = 'done';
  run(room);
}

// 天亮前確認完畢：公佈死訊，直接進入白天
export function finishNight(room) {
  const g = room.g;
  if (room.phase !== 'night' || g.step?.status !== 'review') return '夜晚還沒結束';
  g.step = null;
  g.abnormal = []; // 數學家從黎明重新數
  g.lastNight = [...g.diedTonight];
  room.phase = 'dawn';
  const dead = g.lastNight.map(id => label(room, id));
  announce(room, dead.length ? `天亮了。昨晚 ${dead.join('、')} 死亡。` : '天亮了。昨晚是平安夜。', { k: 'dawn', deaths: g.lastNight });
  fx(room, { k: 'dawn', day: g.day + 1, deaths: g.lastNight });
  for (const id of g.risen || []) if (!seatById(room, id)?.dead) { announce(room, `${label(room, id)} 復活了。`, { k: 'revive', seat: id }); fx(room, { k: 'revive', seat: id }); }
  g.risen = [];
  if (!checkWin(room)) startDay(room);
}
