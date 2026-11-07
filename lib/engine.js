// 流程引擎：開局 → 夜晚按順序自動喚醒 → 天亮前確認 → 公佈死訊進入白天
import { ROLES, TEAMS } from '../public/js/roles.js';
import { rid } from './store.js';
import { seatById, label, roleName, actingRole, impaired, whyImpaired, abnormal, fires, tell, announce, stLog, mark, resetChat, fx, teamOf, alignOf, isEvil, reallyAlive, addEff, tick, pick, shuffle, scriptRoles, modeOf, guard } from './util.js';
import { NIGHT, describeStep, vortoxOn } from './night.js';
import { checkWin } from './rules.js';
import { startDay } from './day.js';
import { drawRoles, logSetup } from './setup.js';
import { formatInfo, truthLevel, checkFields, infoMarks, infoFormula, infoAnswer, answerSeats } from '../public/js/infofmt.js';

export function startGame(room) {
  // 說書人預覽過角色就直接用，否則現抽
  if (!(room.draft && room.seats.length >= 5 && room.seats.every(s => s.role))) {
    const err = drawRoles(room);
    if (err) return err;
  }
  const manual = modeOf(room) === 'manual';
  if (!manual && !room.seats.some(s => ROLES[s.role].team === 'demon')) return '場上至少要有一名惡魔';
  room.g.manual = manual;
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
  Object.assign(g, { poisoned: null, protected: null, monkFail: null, diedTonight: [], risen: [], step: null, beat: null, passed: [], woke: [], exorcised: null,
    dusk: Object.fromEntries(room.seats.map(s => [s.id, s.role])) }); // 黃昏時的角色：賣花女孩、城鎮公告員問的是白天投票 / 提名時的身份，夜裏換過角色不算
  g.eff = (g.eff || []).filter(e => e.till >= 2 * g.night); // 過期的狀態效果
  for (const k in g.marks) g.marks[k] = g.marks[k].filter(t => !t.includes('主人'));
  // 手動局：沒有喚醒順序，整夜停在核對卡上，說書人按需叫人，按「天亮」結束
  if (g.manual) {
    Object.assign(g, { order: [], queue: [], cards: [], ticks: [] });
    g.step = { id: rid(), roleId: 'dawn', seatId: null, status: 'review', title: '天亮前確認' };
    announce(room, `第 ${g.night} 夜降臨，所有人閉眼。`, { k: 'night', n: g.night });
    fx(room, { k: 'night', n: g.night });
    return;
  }
  const first = g.night === 1;
  const at = r => (r === 'minioninfo' ? 6 : r === 'demoninfo' ? 9 : first ? ROLES[r].first : ROLES[r].other);
  // 今晚的夜晚順序表：劇本上（和場上）今晚會行動的角色（首夜不行動的不在首夜表裏，只在首夜行動的不在其他夜晚的表裏）。
  // 不在場的也佔一格，到時說書人假裝叫醒（pretend）
  g.order = [...new Set([...scriptRoles(room), ...room.seats.map(actingRole)])].filter(r => NIGHT[r] && !NIGHT[r].group && at(r) > 0)
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
  // 7 人及以上，爪牙和惡魔首夜互認（5–6 人局按官方規則不互認）：入夜時直接發出，不佔進度條的格子（每局都有，假裝也沒有意義）
  if (first && room.seats.length >= 7) g.queue.unshift({ roleId: 'minioninfo', at: 6 }, { roleId: 'demoninfo', at: 9 });
  announce(room, `第 ${g.night} 夜降臨，所有人閉眼。`, { k: 'night', n: g.night });
  fx(room, { k: 'night', n: g.night });
  run(room);
}

// 隊列裏的步驟還要不要執行（死亡、角色已變化、沒人被處決等情況跳過）。
// maybe：給「之後」預告用，守鴉人還活著時算作可能被喚醒
const slotOf = q => q?.slot || q?.roleId;
export function willRun(room, q, maybe = false) {
  if (!q.seatId) return true;
  const h = NIGHT[q.roleId], seat = seatById(room, q.seatId);
  if (!seat || actingRole(seat) !== q.roleId) return false;
  if (h.skip && h.skip(room, seat)) return false;
  if (room.g.exorcised === seat.id && ROLES[q.roleId].team === 'demon') return false; // 被驅魔人選中的惡魔今晚不醒
  // 死了還會醒的：亡骨魔殺死的爪牙（亡骨魔有能力時）、守鴉人、賢者、月之子、理髮師
  if (!reallyAlive(seat)) return (!!seat.keep && room.seats.some(s => s.role === 'vigormortis' && reallyAlive(s) && !impaired(room, s))) || !!h.wakeDead?.(room, seat);
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
    const next = g.queue[0], inst = !!next && (next.instant || !!NIGHT[next.roleId].instant);
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
    if (!NIGHT[next.roleId].group && !inst && !g.order.includes(next.roleId)) addSlot(room, next.roleId);
    if (!NIGHT[next.roleId].group && !inst && g.beat?.roleId !== slotOf(next)) g.beat = { roleId: slotOf(next), held: false };
    if (next.fake || !willRun(room, next)) {
      if (next.seatId && g.exorcised === next.seatId) NIGHT[next.roleId].asleep?.(room, seatById(room, next.seatId));
      continue;
    }
    (g.passed ||= []).push(next.roleId); // 今晚已喚醒過的步驟（給說書人的進度條）
    const h = NIGHT[next.roleId];
    // actor：替別人做選擇的人（理髮師死後由惡魔選）
    const owner = seatById(room, next.seatId), actor = h.actor && owner ? h.actor(room, owner) : owner;
    const step = g.step = { id: rid(), roleId: next.roleId, seatId: actor?.id || null, status: 'choose' };
    step.title = describeStep(room, step);
    // 叫醒之前說書人要先定的事（沙巴洛斯反芻）：定完由 decide 把這一步排回隊列
    const prep = !next.prepped && h.prep?.(room, actor);
    if (prep) { Object.assign(step, { status: 'decide', decide: prep }); continue; }
    if (actor && !h.stOnly) g.woke.push(actor.id); // 侍女：今晚因自己能力醒過的人
    const choose = typeof h.choose === 'function' ? h.choose(room, actor) : h.choose;
    if (h.group) {
      for (const m of h.group(room)) {
        tell(room, m.seatId, m.text, m.marks, { f: m.f, src: next.roleId });
        if (m.bluffs) (g.bluffsOf ||= {})[m.seatId] = [...m.bluffs];
        if (m.lunatic) stLog(room, `瘋子看到的假信息：${m.text}`, { k: 'told', seat: m.seatId, f: m.f });
      }
      stLog(room, `${step.title}：已發送`, { k: 'sent', src: next.roleId });
      step.status = 'done';
    } else if (choose && !canPick(room, step.seatId, choose)) {
      stLog(room, `${step.title}：沒有可以選的玩家，跳過`, { k: 'skip', src: step.roleId, seat: step.seatId });
      step.status = 'done';
    } else if (choose) {
      step.choose = choose.notLast ? { ...choose, last: g.lastPick?.[step.seatId] || [] } : choose; // last：桌上把上一晚選過的人灰掉
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

function resolve(room, step, picks) {
  const seat = seatById(room, step.seatId);
  const res = NIGHT[step.roleId].run(room, seat, picks.map(id => seatById(room, id)), { ...step.opts });
  step.picks = picks;
  settle(room, step, res);
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

const WHY = { 酒鬼: 'drunk', 瘋子: 'drunk', 醉酒: 'tipsy', 中毒: 'poison' };
// 給信息的步驟：玩家中毒 / 是酒鬼時可以給錯誤信息。說書人中途改了中毒或角色，卡片跟著變
// 渦流在場時，真鎮民的信息必須是錯的（不知道真相的表單除外）；open：說書人隨時可以改（數學家）
export function syncFree(room) {
  const step = room.g.step, seat = step && seatById(room, step.seatId);
  if (step?.status === 'confirm' && seat) {
    // 中毒 / 醉酒的鎮民在渦流下也只能得到錯誤信息；不知道真相的表單（雜耍藝人）攔不了，只標出來
    const bad = impaired(room, seat) || !!step.form.impaired, spun = teamOf(seat) === 'townsfolk' && vortoxOn(room), vortox = spun && !step.form.unknown;
    step.form.free = bad || vortox || !!step.form.open;
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
  const charge = !ids.length && step.result?.e?.res === 'charge'; // 珀不選人：蓄力也是一次出手
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
  goonHit(room, seat, ids);
  // 瘋子：真正的惡魔知道他選了誰
  const demon = seat.role === 'lunatic' && room.seats.find(s => teamOf(s) === 'demon' && reallyAlive(s));
  if (demon && ids.length) tell(room, demon.id, `瘋子 ${label(room, seat.id)} 選擇了 ${ids.map(id => label(room, id)).join('、')}`, [],
    { src: 'lunatic', f: [{ s: seat.id }, { r: 'lunatic', named: true }, { op: 'to' }, ...ids.map(s => ({ s }))] });
  step.opts = role ? { role } : {};
  const fxFrom = room.fxSeq || 0;
  resolve(room, step, ids);
  recordAct(room, step, ids, role);
  actFirst(room, step.seatId, fxFrom);
  // 選完人：停下來等說書人看過結果再叫下一位，免得漏看（代選的也一樣，結果要看了才知道）。後面還有裁定或給信息的不用多點一次。換 id：操作卡換一張
  if (step.status === 'done' && room.phase === 'night') Object.assign(step, { id: rid(), status: 'ack' });
  run(room);
}

// 說書人看過玩家行動的結果，叫下一位
export function ackStep(room) {
  const step = room.g.step;
  if (room.phase !== 'night' || step?.status !== 'ack') return '沒有待確認的行動';
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
  // 說書人自己的魔典上記下給出的兩名玩家（真正的持有者 / 登記 / 錯誤）
  if (form.kind === 'two' && !fields.none) {
    const of = form.roleOf || {}, may = form.mayBe || {}, rn = roleName(fields.role);
    for (const id of [fields.a, fields.b]) {
      mark(room, id, `${roleName(step.roleId)}:${of[id] === fields.role ? rn : (may[id] || []).includes(fields.role) ? rn + '(登記)' : '錯誤'}`);
    }
  }
  const level = truthLevel(form, fields);
  stLog(room, `${step.title}：告知「${msg}」${['（錯誤信息）', '（隱士/間諜登記）', ''][level]}`,
    { k: 'info', src: step.roleId, seat: step.seatId, f, level, free: form.free });
  step.status = 'done';
  run(room);
}

// 說書人裁定：鎮長替死、小惡魔傳位給哪名爪牙
export function decideStep(room, choice) {
  const step = room.g.step;
  if (room.phase !== 'night' || !step || step.status !== 'decide') return '沒有待裁定的事項';
  if (!step.decide.options.some(o => o.id === choice)) return '請選擇一個選項';
  const seat = seatById(room, step.seatId);
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
