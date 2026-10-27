// 流程引擎：開局 → 夜晚按順序自動喚醒 → 天亮前確認 → 公佈死訊進入白天
import { ROLES, TEAMS } from '../public/js/roles.js';
import { rid } from './store.js';
import { seatById, label, roleName, actingRole, impaired, tell, announce, stLog, mark, resetChat, fx } from './util.js';
import { NIGHT, describeStep } from './night.js';
import { checkWin } from './rules.js';
import { startDay } from './day.js';
import { drawRoles, logSetup } from './setup.js';
import { formatInfo, truthLevel, checkFields, infoMarks, infoFormula } from '../public/js/infofmt.js';

export function startGame(room) {
  // 說書人預覽過角色就直接用，否則現抽
  if (!(room.draft && room.seats.length >= 5 && room.seats.every(s => s.role))) {
    const err = drawRoles(room);
    if (err) return err;
  }
  if (!room.seats.some(s => ROLES[s.role].team === 'demon')) return '場上至少要有一名惡魔';
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
  Object.assign(g, { poisoned: null, protected: null, diedTonight: [], step: null, passed: [] });
  for (const k in g.marks) g.marks[k] = g.marks[k].filter(t => !t.includes('主人'));
  const first = g.night === 1;
  const q = [];
  // 7 人及以上，爪牙和惡魔首夜互認（5–6 人局按官方規則不互認）
  if (first && room.seats.length >= 7) q.push({ roleId: 'minioninfo', at: 1 }, { roleId: 'demoninfo', at: 2 });
  for (const s of room.seats) {
    const r = actingRole(s);
    const at = first ? ROLES[r].first : ROLES[r].other;
    if (at > 0 && NIGHT[r]) q.push({ roleId: r, seatId: s.id, at });
  }
  g.queue = q.sort((a, b) => a.at - b.at);
  announce(room, `第 ${g.night} 夜降臨，所有人閉眼。`, { k: 'night', n: g.night });
  fx(room, { k: 'night', n: g.night });
  run(room);
}

// 隊列裏的步驟還要不要執行（死亡、角色已變化、沒人被處決等情況跳過）。
// maybe：給「之後」預告用，守鴉人還活著時算作可能被喚醒
export function willRun(room, q, maybe = false) {
  if (!q.seatId) return true;
  const h = NIGHT[q.roleId], seat = seatById(room, q.seatId);
  if (!seat || actingRole(seat) !== q.roleId) return false;
  if (h.skip && h.skip(room)) return false;
  if (h.onlyIfDiedTonight) return room.g.diedTonight.includes(seat.id) || (maybe && !seat.dead);
  return !seat.dead;
}

// 推進夜晚：能自動完成的步驟直接完成，遇到需要玩家選擇或說書人處理的步驟就停下；
// 隊列走完後停在「天亮前確認」，說書人確認後才公佈死訊
export function run(room) {
  const g = room.g;
  while (room.phase === 'night') {
    if (g.step && g.step.status !== 'done') return;
    const next = g.queue.shift();
    if (!next) {
      g.step = { id: rid(), roleId: 'dawn', seatId: null, status: 'review', title: '天亮前確認' };
      return;
    }
    if (!willRun(room, next)) continue;
    (g.passed ||= []).push(next.roleId); // 今晚已喚醒過的步驟（給說書人的進度條）
    const h = NIGHT[next.roleId];
    const step = g.step = { id: rid(), roleId: next.roleId, seatId: next.seatId || null, status: 'choose' };
    step.title = describeStep(room, step);
    if (h.group) {
      for (const m of h.group(room)) tell(room, m.seatId, m.text, m.marks, { f: m.f, src: next.roleId });
      stLog(room, `${step.title}：已發送`, { k: 'sent', src: next.roleId });
      step.status = 'done';
    } else if (h.choose) {
      step.choose = h.choose;
    } else {
      resolve(room, step, []);
    }
  }
}

// 表單裏有沒有「隱士 / 間諜登記」帶來的其他合規答案
const ALT = {
  number: f => (f.ok || []).length > 1,
  yesno: f => (f.ok || []).some(v => v !== f.truth.yes),
  role: f => (f.ok || []).length > 0,
  two: f => Object.keys(f.mayBe || {}).length > 0 || (f.allowNone && f.noneOk && !f.truth.none),
};

function resolve(room, step, picks) {
  const seat = seatById(room, step.seatId);
  const res = NIGHT[step.roleId].run(room, seat, picks.map(id => seatById(room, id)));
  step.picks = picks;
  logAct(room, step, res);
  if (res.decide) { Object.assign(step, { status: 'decide', decide: res.decide }); return; }
  if (!res.form) { step.status = 'done'; return; }
  // 信息類角色：停下來讓說書人選擇要告訴他什麼（能力正常時預填真實答案，只能給合規信息）
  Object.assign(step, { status: 'confirm', form: { ...res.form, roleId: step.roleId, free: false, alt: !!ALT[res.form.kind]?.(res.form) } });
  syncFree(room);
}

// 夜晚行動的結果：寫日誌，並在說書人的魔典上播演出
function logAct(room, step, res) {
  if (res.note) stLog(room, `${step.title}：${res.note}`, res.e);
  if (res.e) fx(room, { ...res.e, k: 'grim' }, 'st');
}

// 給信息的步驟：玩家中毒 / 是酒鬼時可以給錯誤信息。說書人中途改了中毒或角色，卡片跟著變
export function syncFree(room) {
  const step = room.g.step, seat = step && seatById(room, step.seatId);
  if (step?.status === 'confirm' && seat) {
    step.form.free = impaired(room, seat);
    step.form.why = step.form.free ? (seat.role === 'drunk' ? 'drunk' : 'poison') : null;
  }
}

// 玩家自己的夜晚行動：在他的面板上記一筆（沒有後續信息的角色），並播放落到目標上的演出
const SELF_LOG = ['poisoner', 'monk', 'imp', 'butler'];
function recordAct(room, step, ids) {
  if (SELF_LOG.includes(step.roleId)) {
    tell(room, step.seatId, `你選擇了 ${ids.map(id => label(room, id)).join('、')}`, [],
      { k: 'act', src: step.roleId, f: [{ op: 'to' }, ...ids.map(s => ({ s }))] });
  }
  fx(room, { k: 'act', src: step.roleId, to: ids }, step.seatId);
}

export function submitPicks(room, bySt, who, ids) {
  const step = room.g.step;
  if (room.phase !== 'night' || !step || step.status !== 'choose') return '現在不需要選擇';
  if (!bySt && step.seatId !== who) return '還沒輪到你';
  const c = step.choose;
  ids = [...new Set(ids || [])];
  if (ids.length !== c.count) return `請選擇 ${c.count} 名玩家`;
  if (ids.some(id => !seatById(room, id))) return '玩家不存在';
  if (c.notSelf && ids.includes(step.seatId)) return '不能選擇自己';
  recordAct(room, step, ids);
  resolve(room, step, ids);
  run(room);
}

export function confirmStep(room, fields) {
  const step = room.g.step;
  if (!step || step.status !== 'confirm') return '沒有待確認的信息';
  syncFree(room);
  const err = checkFields(step.form, fields, room.seats.map(x => x.id));
  if (err) return err;
  const form = step.form;
  if (!form.free && truthLevel(form, fields) === 0) return '能力正常時只能給合規信息';
  // 兩名玩家的先後順序隨機，避免玩家從順序看出誰是真正的持有者
  if (form.kind === 'two' && !fields.none && Math.random() < 0.5) fields = { ...fields, a: fields.b, b: fields.a };
  const msg = formatInfo(form, fields, id => label(room, id));
  const f = infoFormula(form, fields);
  tell(room, step.seatId, msg, infoMarks(form, fields), { f, src: step.roleId });
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
    // 中毒 / 酒鬼能力的裁定：記下結果，帶著它重跑這一步（之後可能還有下一個裁定）
    const d = step.decide, work = choice === 'work';
    step.opts = { ...step.opts, [d.role]: work };
    stLog(room, `${label(room, d.targetId)}（${roleName(d.role)}）${d.why}：說書人裁定能力${work ? '生效' : '無效'}`,
      { k: 'rule', seat: d.targetId, role: d.role, why: d.why, work });
    res = NIGHT[step.roleId].run(room, seat, (step.picks || []).map(id => seatById(room, id)), step.opts);
  } else res = NIGHT[step.roleId].decide(room, seat, step, choice);
  logAct(room, step, res);
  if (res.decide) { step.decide = res.decide; return; }
  step.status = 'done';
  run(room);
}

export function skipStep(room) {
  const step = room.g.step;
  if (!step || step.status === 'done' || step.status === 'review') return '沒有可以跳過的步驟';
  if (step.status === 'decide') return '這一步需要你裁定，不能跳過';
  stLog(room, `${step.title}：說書人跳過`, { k: 'skip', src: step.roleId, seat: step.seatId });
  step.status = 'done';
  run(room);
}

// 天亮前確認完畢：公佈死訊，直接進入白天
export function finishNight(room) {
  const g = room.g;
  if (room.phase !== 'night' || g.step?.status !== 'review') return '夜晚還沒結束';
  g.step = null;
  g.lastNight = [...g.diedTonight];
  room.phase = 'dawn';
  const dead = g.lastNight.map(id => label(room, id));
  announce(room, dead.length ? `天亮了。昨晚 ${dead.join('、')} 死亡。` : '天亮了。昨晚是平安夜。', { k: 'dawn', deaths: g.lastNight });
  fx(room, { k: 'dawn', day: g.day + 1, deaths: g.lastNight });
  if (!checkWin(room)) startDay(room);
}
