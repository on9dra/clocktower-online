// 每個角色的夜晚行動：choose 描述要選幾個人（可以是函數）；run 結算效果，信息類角色返回一張給說書人選擇的表單，
// 需要說書人裁定的（鎮長替死、小惡魔傳位、旅店老闆誰醉酒……）返回 decide，由 decide() 結算說書人的選擇
// choose：count 最多選幾人；counts 允許的人數（默認只能選 count 個）；notSelf 不能選自己；alive / dead 只能選存活 / 死亡的；
//   notLast 不能和上一晚選同一人；roles 還要選一個角色（列出可選的角色），roleOptional 可以不選角色（不使用能力）
// wakeDead：死了也會被喚醒（守鴉人、賢者、月之子……）；actor：替別人做選擇的座位（理髮師死後由惡魔選）；
// prep：叫醒之前說書人要先定的事，返回一張裁定（沙巴洛斯反芻）；
// skip：今晚不用喚醒；stOnly：只是說書人結算，玩家不會被喚醒（造謠者、月之子）
import { ROLES, TEAMS } from '../public/js/roles.js';
import {
  shuffle, pick, seatById, label, roleName, teamOf, isEvil, aliveNeighbors, scriptRoles, teamRoles, impaired, actingRole,
  teamsAs, evilAs, rolesAs, seatTags, hasDemon, alignOf, isGoodSeat, reallyAlive, addEff, dropEff, hasEff, tick, FOREVER,
  once, useOnce, whyImpaired, abnormal, fires, tell, stLog, alive, fx, jugglerDay,
} from './util.js';
import { killSeat, becomeDemon, changeRole, shieldOf, shieldLost, shieldText, die, tryKill, revive, restoreAbility } from './rules.js';

const inPlay = room => new Set(room.seats.map(s => s.role));
const goodRoles = room => scriptRoles(room).filter(id => TEAMS[ROLES[id].team].good);
const evilRoles = room => scriptRoles(room).filter(id => !TEAMS[ROLES[id].team].good);
const demonSeat = room => room.seats.find(s => reallyAlive(s) && teamOf(s) === 'demon');
const seatOpts = (room, seats) => seats.map(s => ({ id: s.id, label: `${label(room, s.id)}（${roleName(s.role)}）` }));
const NONE = { id: 'none', label: '無人' };

// “這兩名玩家之一是 X”：真實答案預先算好，說書人可改
function twoOf(room, self, team) {
  const others = room.seats.filter(s => s !== self);
  // roleOf：該類角色的實際持有者；mayBe：能被當作該類角色的隱士 / 間諜
  const roleOf = {}, mayBe = {};
  for (const s of others) {
    if (teamOf(s) === team) roleOf[s.id] = s.role;
    else if (teamsAs(room, s).includes(team)) mayBe[s.id] = teamRoles(room, team);
  }
  const holders = shuffle(Object.keys(roleOf));
  // 持有者全是能被當作別類角色的隱士 / 間諜時，「沒有」也是合規答案
  const noneOk = holders.every(id => teamsAs(room, seatById(room, id)).length > 1);
  const noneText = team === 'outsider' ? '場上沒有外來者' : `場上沒有其他${TEAMS[team].name}`;
  const form = { kind: 'two', team, roles: teamRoles(room, team), allowNone: team === 'outsider' || !holders.length, noneText, roleOf, mayBe, noneOk };
  if (!holders.length) return { form: { ...form, truth: { none: true } } };
  const x = seatById(room, holders[0]);
  const [a, b] = shuffle([x, pick(others.filter(s => s !== x))]);
  return { form: { ...form, truth: { a: a.id, b: b.id, role: x.role } } };
}

// 數字類信息：隱士 / 間諜可被當作另一陣營，列出所有組合下的答案，都算合規
function evilCounts(room, count) {
  const flex = room.seats.filter(s => evilAs(room, s).length > 1);
  const out = new Set();
  for (let m = 0; m < 1 << flex.length; m++) {
    out.add(count(s => { const i = flex.indexOf(s); return i < 0 ? isEvil(s) : !!((m >> i) & 1); }));
  }
  return [...out];
}
// 是否類信息：真實答案之外，登記帶來的另一個答案也合規
const yesno = (room, yes, alt, extra) => ({ form: { kind: 'yesno', truth: { yes }, ok: alt ? [!yes] : [], extra } });

function starpass(room, imp) {
  killSeat(room, imp, '小惡魔自殺傳位');
  const e = { k: 'act', src: 'imp', seat: imp.id, to: [imp.id], res: 'starpass' };
  const by = heir => ({ note: `自殺，${label(room, heir.id)} 接任`, e: { ...e, heir: heir.id } }); // heir：自動接任的人，結果卡上要看得到
  if (hasDemon(room)) return by(demonSeat(room));
  const minions = room.seats.filter(s => !s.dead && teamOf(s) === 'minion');
  if (!minions.length) return { note: '自殺，沒有存活的爪牙可以接任', e: { ...e, noHeir: true } };
  if (minions.length === 1) {
    becomeDemon(room, minions[0], imp.role, '小惡魔把惡魔身份傳給了你', imp.id);
    return by(minions[0]);
  }
  return {
    note: '自殺傳位，等待說書人選擇接任的爪牙', e,
    decide: { kind: 'starpass', prompt: '小惡魔自殺了：選擇一名存活的爪牙成為新的小惡魔', options: seatOpts(room, minions) },
  };
}

// 中毒 / 醉酒 / 酒鬼 / 瘋子沒有能力：官方說書人不能讓它生效，只有給信息時可以給假的。
// 這裏還是停一下，只有「無效」一個按鈕，讓說書人看清楚這一步為什麼沒有結果（o[role] 記下，再重跑一次）
const why = (room, s) => whyImpaired(room, s);
const askAbility = (room, role, s) => ({ decide: { kind: 'ability', role, targetId: s.id, why: why(room, s),
  prompt: `${roleName(role)}${why(room, s)}：能力無效`, options: [{ id: 'fail', label: '無效' }] } });
// 行動者能力失效時：先停一次；返回 decide 表示要等說書人看過，返回 true 表示已經看過
function gate(room, seat, role, o) {
  if (!impaired(room, seat)) return false;
  return o[role] === undefined ? askAbility(room, role, seat) : true;
}
const failed = (room, seat, role, to = []) => ({ note: `${why(room, seat)}，能力無效`, e: { k: 'act', src: role, seat: seat.id, to: to.map(t => t.id), res: 'fail' } });

// 惡魔攻擊一名玩家：僧侶、士兵、各種保護、鎮長替死都在這裏。multi：一晚殺多人的惡魔，不重算這一步，所以不問中毒士兵；
// askMayor：false 時也不問鎮長替死（普卡今晚沒醒，沒有步驟可以停）
function attack(room, seat, t, o, src, multi = false, askMayor = true) {
  const who = label(room, t.id);
  const e = (res, w) => ({ k: 'act', src, seat: seat.id, to: [t.id], res, ...(w && { why: w }) });
  if (t.dead && !t.undead) return { note: `攻擊 ${who}，但他已經死亡`, e: e('blocked', 'dead') };
  if (room.g.protected === t.id) return { note: `攻擊 ${who}，被僧侶保護`, e: e('blocked', 'protect') };
  if (t.role === 'soldier') {
    if (!impaired(room, t)) return { note: `攻擊 ${who}，但他是士兵`, e: e('blocked', 'soldier') };
    if (!multi && o.soldier === undefined) return askAbility(room, 'soldier', t);
  }
  const sh = shieldOf(room, t, { demon: true });
  if (sh) return { note: `攻擊 ${who}，但他${shieldText(sh)}`, e: e('blocked', sh) };
  // 能力正常的鎮長：說書人決定讓他死、換人死還是無人死亡。死人、士兵、被僧侶保護的人不能替死
  if (t.role === 'mayor' && !impaired(room, t) && askMayor) {
    const options = [{ id: t.id, label: `讓鎮長 ${who} 死亡` },
      ...room.seats.filter(s => !s.dead && s !== t && room.g.protected !== s.id && !(s.role === 'soldier' && !impaired(room, s)))
        .map(s => ({ id: s.id, label: `改為 ${label(room, s.id)}（${roleName(s.role)}）死亡` })),
      { id: 'none', label: '無人死亡' }];
    return { note: `攻擊鎮長 ${who}`, e: e('mayor'), decide: { kind: 'mayor', targetId: t.id, prompt: '惡魔攻擊了鎮長：你可以讓另一名玩家代替他死亡', options } };
  }
  shieldLost(room, t, { demon: true });
  die(room, t, '夜裏被惡魔殺死');
  afterDemonKill(room, seat, t);
  return { note: `殺死了 ${who}`, e: e('kill') };
}
// 惡魔殺人之後：祖母跟著孫子死，賢者當晚醒來（能力失效的賢者也醒，說書人可以給假信息）
function afterDemonKill(room, demon, t) {
  const g = room.g;
  for (const gm of room.seats.filter(s => s.role === 'grandmother' && !s.dead && g.grandchild?.[s.id] === t.id && fires(room, s))) {
    if (!tryKill(room, gm, '孫子被惡魔殺死')) stLog(room, `${label(room, gm.id)}（祖母）的孫子被惡魔殺死，祖母也死亡`, { k: 'rule', seat: gm.id, role: 'grandmother', work: true });
  }
  if (t.role === 'sage') {
    (g.sageDue ||= {})[t.id] = demon.id;
    if (impaired(room, t)) (g.sageBad ||= {})[t.id] = true; // 普卡的毒在他死後就解了，要記下死的時候失效
  }
}
// 多個攻擊結果合併成一條日誌；其中有要說書人裁定的（打到鎮長）帶上
const merge = (rs, seat, src, to) => ({ note: rs.map(r => r.note).filter(Boolean).join('；') || '沒有選人', decide: rs.find(r => r.decide)?.decide,
  e: { k: 'act', src, seat: seat.id, to: to.map(t => t.id), res: rs.some(r => r.e?.res === 'kill') ? 'kill' : 'blocked',
    ...(to.length > 1 && { each: to.map((t, i) => ({ id: t.id, res: rs[i].e?.res, why: rs[i].e?.why })) }) } });

// 鎮長替死、傳位：所有惡魔共用
function demonDecide(room, seat, step, choice) {
  const t = seatById(room, choice), src = step.roleId;
  if (step.decide.kind === 'starpass') {
    becomeDemon(room, t, 'imp', '小惡魔把惡魔身份傳給了你', seat.id);
    return { note: `${label(room, t.id)} 接任小惡魔` };
  }
  if (step.decide.kind === 'regurgitate') {
    if (t) rise(room, t, '被沙巴洛斯反芻（復活）');
    return { note: t ? `反芻了 ${label(room, t.id)}` : '沒有反芻', ...(t && { e: { k: 'act', src, seat: seat.id, to: [t.id], res: 'protect', word: '反芻' } }) };
  }
  const e = (res, to) => ({ k: 'act', src, seat: seat.id, to: to ? [to.id] : [], res });
  if (!t) return { note: '鎮長的能力：無人死亡', e: { ...e('blocked', seatById(room, step.decide.targetId)), why: 'mayor' } };
  if (t.id === step.decide.targetId) { shieldLost(room, t, { demon: true }); die(room, t, '夜裏被惡魔殺死'); afterDemonKill(room, seat, t); return { note: `鎮長 ${label(room, t.id)} 死亡`, e: e('kill', t) }; }
  const sh = room.g.protected === t.id ? 'protect' : t.role === 'soldier' && !impaired(room, t) ? '' : shieldOf(room, t, { demon: true });
  if (sh || (t.role === 'soldier' && !impaired(room, t))) return { note: `鎮長的能力轉移給 ${label(room, t.id)}，但他${sh ? shieldText(sh) : '是士兵'}，無人死亡`, e: { ...e('blocked', t), why: 'mayor' } };
  shieldLost(room, t, { demon: true });
  die(room, t, '代替鎮長死亡');
  afterDemonKill(room, seat, t); // 替死也是惡魔殺的：祖母、賢者照常
  return { note: `${label(room, t.id)} 代替鎮長死亡`, e: e('kill', t) };
}

// 只殺一人的惡魔：小惡魔以外的都一樣，after 處理各自的特殊效果（kill 可以返回一個要說書人選的 decide）
const killer = (src, after) => ({
  choose: { count: 1, prompt: '選擇一名玩家殺死' },
  run(room, seat, [t], o = {}) {
    const g = gate(room, seat, src, o);
    if (g) return g === true ? failed(room, seat, src, [t]) : g;
    const pre = after?.before?.(room, seat, t);
    if (pre) return pre;
    const r = attack(room, seat, t, o, src);
    if (!r.decide && r.e?.res === 'kill') r.decide = after?.kill?.(room, seat, t) || undefined;
    return r;
  },
  decide(room, seat, step, choice) {
    if (step.decide.kind === 'neighbor') return after.neighbor(room, seat, choice);
    const t = seatById(room, choice);
    // 鎮長把死亡轉給了外來者：方古照樣跳過去
    const pre = t && t.id !== step.decide.targetId && after?.before?.(room, seat, t);
    if (pre) return pre;
    const r = demonDecide(room, seat, step, choice);
    if (t && r.e?.res === 'kill') r.decide = after?.kill?.(room, seat, t) || undefined;
    return r;
  },
});

// 鄰近的鎮民：順時針、逆時針各找最近的一個
function townsfolkNeighbors(room, seat) {
  const n = room.seats.length, i = room.seats.indexOf(seat), out = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const s = room.seats[(i + dir * k + n) % n];
      if (s === seat) break;
      if (teamOf(s) === 'townsfolk') { out.push(s); break; } // 死活都算（和諾-達鯴一樣）
    }
  }
  return [...new Set(out)];
}

// 普卡：上一個中毒的人死亡，然後恢復健康。先結算死亡再解毒：他死的時候還在中毒，弄臣、水手、士兵的能力都沒用
function pukkaVictim(room, seat, next, askMayor = true) {
  const prev = seatById(room, room.g.pukka);
  if (!prev || prev === next) return null;
  const r = attack(room, seat, prev, {}, 'pukka', true, askMayor);
  dropEff(room, e => e.src === 'pukka' && e.seat === prev.id);
  room.g.pukka = null;
  return r;
}

// 夜裏復活：前幾天死的人天亮時公佈（今晚才死的，沒人知道他死過）
// 能力和一次性能力都回來；順序在後面的今晚照常醒（隊列裏本來就有他），只在首夜行動的馬上醒一次
function rise(room, t, why) {
  if (!room.g.diedTonight.includes(t.id)) (room.g.risen ||= []).push(t.id);
  revive(room, t, why);
  restoreAbility(room, t);
  const r = actingRole(t);
  if (NIGHT[r] && !ROLES[r].other && ROLES[r].first) room.g.queue.unshift({ roleId: r, seatId: t.id, at: 0, instant: true });
}

// 今晚才拿到的角色：順序排在 after 之後的今晚就行動；只在首夜行動的角色當晚用一次（哲學家、麻臉巫婆）
function actTonight(room, seat, role, after) {
  const r = ROLES[role], at = room.g.night === 1 ? r.first : r.other || r.first;
  if (NIGHT[role] && at > after) { room.g.queue.push({ roleId: role, seatId: seat.id, at, instant: room.g.night > 1 && !r.other }); room.g.queue.sort((a, b) => a.at - b.at); }
}

// 白天投過票 / 提名過的人當時的身份：舞蛇人、麻臉巫婆、理髮師在賣花女孩、城鎮公告員之前就可能換了他的角色（官方：算原來的惡魔）
const atDusk = (room, id) => {
  const s = seatById(room, id), was = room.g.dusk?.[id];
  return s && was && was !== s.role ? { ...s, role: was } : s;
};

// 月之子今晚結算：天亮前死的等到下一個夜晚
const moonDue = (room, seat) => room.g.moonchildDue === seat.id && !(room.g.night < room.g.moonchildAt);

// 交換兩名玩家的角色（理髮師）：陣營不變
function swapRoles(room, a, b, why) {
  const [ra, rb] = [a.role, b.role];
  // 跟著角色走的效果（亡骨魔的毒、女巫的詛咒……）換到新的持有者，和舞蛇人一樣
  const moving = (room.g.eff || []).filter(e => e.live && ((e.src === ra && e.by === a.id) || (e.src === rb && e.by === b.id)));
  changeRole(room, a, rb, why, true, 'barber');
  changeRole(room, b, ra, why, true, 'barber');
  for (const e of moving) e.by = e.by === a.id ? b.id : a.id;
}

export const NIGHT = {
  minioninfo: {
    name: '爪牙信息',
    group: room => {
      const demon = room.seats.find(s => teamOf(s) === 'demon');
      const minions = room.seats.filter(s => teamOf(s) === 'minion');
      const marks = [{ seatId: demon.id, t: 'demon', text: '惡魔' }, ...minions.map(x => ({ seatId: x.id, t: 'minion', text: '爪牙' }))];
      return minions.map(m => {
        const others = minions.filter(x => x !== m);
        return {
          seatId: m.id, marks,
          f: [{ tag: 'demon' }, { s: demon.id }, ...(others.length ? [{ op: 'br' }, { tag: 'minion' }, ...others.map(x => ({ s: x.id }))] : [])],
          text: `惡魔是 ${label(room, demon.id)}。` +
            (others.length ? `其他爪牙：${others.map(x => label(room, x.id)).join('、')}` : ''),
        };
      });
    },
  },
  demoninfo: {
    name: '惡魔信息',
    group: room => {
      const demon = room.seats.find(s => teamOf(s) === 'demon');
      const minions = room.seats.filter(s => teamOf(s) === 'minion');
      const lunatic = room.seats.find(s => s.role === 'lunatic');
      const out = [{ seatId: demon.id, bluffs: room.g.bluffs, marks: minions.map(x => ({ seatId: x.id, t: 'minion', text: '爪牙' })),
        f: [{ tag: 'minion' }, ...minions.map(x => ({ s: x.id })), { op: 'br' }, { tag: 'bluff' }, ...room.g.bluffs.map(r => ({ r, named: true })),
          ...(lunatic ? [{ op: 'br' }, { s: lunatic.id }, { w: '是' }, { r: 'lunatic', named: true }] : [])],
        text: `你的爪牙：${minions.map(x => label(room, x.id)).join('、')}。` +
        `三個不在場的善良角色（可用來偽裝）：${room.g.bluffs.map(roleName).join('、')}` + (lunatic ? `。${label(room, lunatic.id)} 是瘋子` : '') }];
      // 瘋子以為自己是惡魔：給他一份假的爪牙和偽裝
      if (lunatic) {
        const fake = shuffle(room.seats.filter(s => s !== lunatic)).slice(0, minions.length);
        const bluffs = shuffle(goodRoles(room)).slice(0, 3); // 官方：在場的也可以，都是假的
        out.push({ seatId: lunatic.id, lunatic: true, bluffs, marks: fake.map(x => ({ seatId: x.id, t: 'minion', text: '爪牙' })),
          f: [{ tag: 'minion' }, ...fake.map(x => ({ s: x.id })), { op: 'br' }, { tag: 'bluff' }, ...bluffs.map(r => ({ r, named: true }))],
          text: `你的爪牙：${fake.map(x => label(room, x.id)).join('、')}。三個不在場的善良角色（可用來偽裝）：${bluffs.map(roleName).join('、')}` });
      }
      return out;
    },
  },

  // ───── 暗流湧動 ─────
  poisoner: {
    choose: { count: 1, prompt: '選擇一名玩家下毒' },
    run(room, seat, [t]) {
      const bad = impaired(room, seat);
      if (!bad) room.g.poisoned = t.id;
      return { note: `毒了 ${label(room, t.id)}`, e: { k: 'act', src: 'poisoner', seat: seat.id, to: [t.id], res: bad ? 'fail' : 'poison' } };
    },
  },
  spy: {
    run(room) {
      const lines = room.seats.map(s => {
        const tags = seatTags(room, s).filter(t => t !== '酒鬼');
        return `${label(room, s.id)}：${roleName(s.role)}` + (s.fakeRole ? `（以為是${roleName(s.fakeRole)}）` : '') +
          (s.dead ? '（死亡）' : '') + (tags.length ? `［${tags.join('、')}］` : '');
      });
      const grim = Object.fromEntries(room.seats.map(s => [s.id, s.role]));
      const text = '魔典：\n' + lines.join('\n') + `\n惡魔偽裝：${room.g.bluffs.map(roleName).join('、')}`;
      // 式子：每個座位的角色（死亡 / 酒鬼以為的身份 / 魔典上的提示標記：中毒、被保護、紅鯡魚……），再加惡魔偽裝
      const f = [{ grim: room.seats.map(s => [s.id, s.role, { dead: s.dead, fake: s.fakeRole || null, tags: seatTags(room, s) }]) },
        { op: 'br' }, { tag: 'bluff' }, ...room.g.bluffs.map(r => ({ r, named: true }))];
      return { form: { kind: 'text', text, truth: {}, grim, f } };
    },
  },
  washerwoman: { run: (room, seat) => twoOf(room, seat, 'townsfolk') },
  librarian: { run: (room, seat) => twoOf(room, seat, 'outsider') },
  investigator: { run: (room, seat) => twoOf(room, seat, 'minion') },
  chef: {
    run(room) {
      const n = room.seats.length;
      const pairs = evil => room.seats.filter((s, i) => evil(s) && evil(room.seats[(i + 1) % n])).length;
      // 隱士 / 間諜每一對單獨登記：夾在兩名邪惡玩家中間時可以一對算、一對不算，最少到最多之間都合規
      const ok = evilCounts(room, pairs), lo = Math.min(...ok), hi = Math.max(...ok);
      return { form: { kind: 'number', max: Math.max(3, Math.ceil(n / 2)), truth: { n: pairs(isEvil) }, ok: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) } };
    },
  },
  empath: {
    run(room, seat) {
      const nb = aliveNeighbors(room, seat);
      const count = evil => nb.filter(evil).length;
      return { form: { kind: 'number', max: 2, truth: { n: count(isEvil) }, ok: evilCounts(room, count),
        extra: { nb: nb.map(s => label(room, s.id)).join('、'), nbIds: nb.map(s => s.id) } } };
    },
  },
  fortuneteller: {
    choose: { count: 2, prompt: '選擇兩名玩家，得知其中是否有惡魔' },
    run(room, seat, [a, b]) {
      const yes = [a, b].some(s => teamOf(s) === 'demon' || s.id === room.g.redHerring);
      const ok = [a, b].some(s => teamsAs(room, s).includes('demon')) ? [true] : []; // 隱士可被當作惡魔
      return { form: { kind: 'yesno', truth: { yes }, ok, extra: { pair: `${label(room, a.id)} 和 ${label(room, b.id)}`, ids: [a.id, b.id] } } };
    },
  },
  butler: {
    choose: { count: 1, notSelf: true, prompt: '選擇你的主人（明天只有他投票時你才能投票）' },
    run(room, seat, [t]) {
      (room.g.master ||= {})[seat.id] = t.id;
      (room.g.marks[t.id] ||= []).push('管家的主人');
      return { note: `主人是 ${label(room, t.id)}`, e: { k: 'act', src: 'butler', seat: seat.id, to: [t.id], res: 'master' } };
    },
  },
  monk: {
    choose: { count: 1, notSelf: true, prompt: '選擇一名玩家保護（今晚惡魔對他無效）' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'monk', o);
      if (g && g !== true) return g;
      if (!g) room.g.protected = t.id;
      else room.g.monkFail = { by: seat.id, to: t.id }; // 數學家：惡魔真的殺了這個人，才算僧侶失常
      return { note: g ? `想保護 ${label(room, t.id)}，${why(room, seat)}，能力無效` : `保護了 ${label(room, t.id)}`, e: { k: 'act', src: 'monk', seat: seat.id, to: [t.id], res: g ? 'fail' : 'protect' } };
    },
  },
  imp: {
    choose: { count: 1, prompt: '選擇一名玩家殺死（可以選自己）' },
    run(room, seat, [t], o = {}) {
      const who = label(room, t.id);
      const g = gate(room, seat, 'imp', o);
      if (g && g !== true) return g;
      const blocked = w => ({ k: 'act', src: 'imp', seat: seat.id, to: [t.id], res: 'blocked', why: w });
      if (g) return { note: `攻擊 ${who}，但${why(room, seat)}，能力無效`, e: { k: 'act', src: 'imp', seat: seat.id, to: [t.id], res: 'fail' } };
      if (room.g.protected === t.id) return { note: `攻擊 ${who}，被僧侶保護`, e: blocked('protect') };
      if (t === seat) {
        const sh = shieldOf(room, seat, { demon: true }); // 旅店老闆保護的小惡魔不死，也不傳位
        return sh ? { note: `攻擊 ${who}，但他${shieldText(sh)}`, e: blocked('protect') } : starpass(room, seat);
      }
      return attack(room, seat, t, o, 'imp');
    },
    decide: demonDecide,
  },
  ravenkeeper: {
    wakeDead: (room, seat) => room.g.diedTonight.includes(seat.id),
    onlyIfDiedTonight: true,
    choose: { count: 1, prompt: '你在夜裡死了。選擇一名玩家，得知他的角色' },
    run(room, seat, [t]) {
      return { form: { kind: 'role', roles: scriptRoles(room), truth: { role: t.role }, ok: rolesAs(room, t), extra: { target: label(room, t.id), targetId: t.id } } };
    },
  },
  undertaker: {
    skip: room => !room.g.lastExecutedRole,
    run(room) {
      const t = seatById(room, room.g.lastExecutedId);
      return { form: { kind: 'role', roles: scriptRoles(room), truth: { role: room.g.lastExecutedRole }, ok: t ? rolesAs(room, t) : [],
        extra: t ? { targetId: t.id } : null } };
    },
  },

  // ───── 黯月初升 ─────
  // 孫子由說書人選；只有一個善良玩家時不用選
  grandmother: {
    run(room, seat) {
      const set = seatById(room, room.g.grandchild?.[seat.id]), opts = room.seats.filter(s => s !== seat && isGoodSeat(s));
      if (set || opts.length === 1) return this.decide(room, seat, null, (set || opts[0]).id);
      if (!opts.length) return { note: '場上沒有其他善良玩家', ack: true };
      return { decide: { kind: 'grandchild', say: '誰是孫子？', prompt: '祖母：選擇她的孫子', options: seatOpts(room, opts) } };
    },
    decide(room, seat, step, choice) {
      const t = seatById(room, choice);
      (room.g.grandchild ||= {})[seat.id] = t.id;
      // 復活的祖母再看一次：孫子可能已經換過角色，不一定還在善良角色的名單裏
      return { form: { kind: 'role', roles: [...new Set([...goodRoles(room), t.role])], truth: { role: t.role }, ok: [], extra: { target: label(room, t.id), targetId: t.id } } };
    },
  },
  sailor: {
    choose: { count: 1, alive: true, prompt: '選擇一名存活的玩家：你或他之一會醉酒到下個黃昏' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'sailor', o);
      if (g) return g === true ? failed(room, seat, 'sailor', [t]) : g;
      if (t === seat) { addEff(room, seat.id, 'drunk', 'sailor', tick(room) + 1); return { note: '選了自己，自己醉酒', e: { k: 'act', src: 'sailor', seat: seat.id, to: [seat.id], res: 'poison', word: '醉酒' } }; }
      return { note: `選了 ${label(room, t.id)}`, decide: { kind: 'drunk', say: '誰醉酒？', prompt: '水手：選擇誰醉酒到下個黃昏', options: seatOpts(room, [seat, t]) } };
    },
    decide(room, seat, step, choice) {
      addEff(room, choice, 'drunk', 'sailor', tick(room) + 1);
      return { note: `${label(room, choice)} 醉酒到下個黃昏`, e: { k: 'act', src: 'sailor', seat: seat.id, to: [choice], res: 'poison', word: '醉酒' } };
    },
  },
  chambermaid: {
    choose: { count: 2, alive: true, notSelf: true, prompt: '選擇除你以外的兩名存活的玩家，得知他們今晚有幾人被喚醒' },
    run(room, seat, picks) {
      // 相剋：數學家排在侍女後面，但侍女能得知他今晚會不會醒
      const n = picks.filter(t => room.g.woke.includes(t.id) || (actingRole(t) === 'mathematician' && reallyAlive(t))).length;
      return { form: { kind: 'number', max: 2, truth: { n }, ok: [], extra: { nbIds: picks.map(t => t.id) } } };
    },
  },
  exorcist: {
    choose: { count: 1, notLast: true, prompt: '選擇一名玩家（不能和上一晚相同）：如果是惡魔，他今晚不會被喚醒' },
    run(room, seat, [t], o = {}) {
      const g = teamOf(t) === 'demon' && gate(room, seat, 'exorcist', o); // 選中的不是惡魔：本來就沒有效果，不用裁定
      if (g) return g === true ? failed(room, seat, 'exorcist', [t]) : g;
      if (teamOf(t) !== 'demon') return { note: `選了 ${label(room, t.id)}，不是惡魔`, e: { k: 'act', src: 'exorcist', seat: seat.id, to: [t.id], res: 'noop', why: 'notdemon' } };
      room.g.exorcised = t.id;
      tell(room, t.id, `驅魔人 ${label(room, seat.id)} 選中了你：今晚你不會被喚醒`, [{ seatId: seat.id, r: 'exorcist', text: '驅魔人' }],
        { src: 'exorcist', f: [{ s: seat.id }, { w: '是' }, { r: 'exorcist', named: true }] });
      fx(room, { k: 'info', src: 'exorcised', from: seat.id, msg: room.chatSeq }, t.id);
      return { note: `選中惡魔 ${label(room, t.id)}，惡魔今晚不行動`, e: { k: 'act', src: 'exorcist', seat: seat.id, to: [t.id], res: 'protect' } };
    },
  },
  innkeeper: {
    choose: { count: 2, prompt: '選擇兩名玩家：他們今晚不會死亡，但其中一人醉酒' },
    run(room, seat, picks, o = {}) {
      const g = gate(room, seat, 'innkeeper', o);
      if (g) return g === true ? failed(room, seat, 'innkeeper', picks) : g;
      for (const t of picks) addEff(room, t.id, 'protect', 'innkeeper', tick(room));
      return { note: `保護了 ${picks.map(t => label(room, t.id)).join('、')}`, e: { k: 'act', src: 'innkeeper', seat: seat.id, to: picks.map(t => t.id), res: 'protect' },
        decide: { kind: 'drunk', say: '誰醉酒？', prompt: '旅店老闆：選擇其中一人醉酒到下個黃昏', options: seatOpts(room, picks) } };
    },
    decide(room, seat, step, choice) {
      addEff(room, choice, 'drunk', 'innkeeper', tick(room) + 1);
      return { note: `${label(room, choice)} 醉酒到下個黃昏`, e: { k: 'act', src: 'innkeeper', seat: seat.id, to: [choice], res: 'poison', word: '醉酒' } };
    },
  },
  gambler: {
    choose: room => ({ count: 1, roles: scriptRoles(room), prompt: '選擇一名玩家並猜測他的角色：猜錯你會死亡' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'gambler', o);
      if (g) return g === true ? failed(room, seat, 'gambler', [t]) : g;
      const right = t.role === o.role, maybe = rolesAs(room, t).includes(o.role);
      const guess = (word, dies) => ({ k: 'act', src: 'gambler', seat: seat.id, to: [t.id], role: o.role, res: 'noop', word, ...(dies && { dies: [seat.id] }) });
      if (right) return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}，猜對了`, e: guess('猜對') };
      if (maybe && o.gamble === undefined) {
        return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}`, decide: { kind: 'gamble', say: '算猜對？', prompt: `${label(room, t.id)} 可以被當作${roleName(o.role)}：算不算猜對？`,
          options: [{ id: 'right', label: '算猜對' }, { id: 'wrong', label: '算猜錯（賭徒死亡）' }] } };
      }
      if (o.gamble === 'right') return { note: '說書人裁定猜對', e: guess('猜對') };
      const sh = tryKill(room, seat, '賭徒猜錯');
      return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}，猜錯了` + (sh ? `，但他${shieldText(sh)}` : '，賭徒死亡'), e: guess('猜錯', !sh) };
    },
    decide(room, seat, step, choice) {
      step.opts = { ...step.opts, gamble: choice };
      return this.run(room, seat, step.picks.map(id => seatById(room, id)), step.opts);
    },
  },
  gossip: {
    stOnly: true,
    run(room) {
      return { decide: { kind: 'gossip', say: '造謠成真，誰死？', prompt: '造謠者今天的聲明是真的嗎？是的話選一名玩家死亡',
        options: [NONE, ...seatOpts(room, room.seats.filter(s => !s.dead))] } };
    },
    decide(room, seat, step, choice) {
      const t = seatById(room, choice);
      if (!t) return { note: '聲明不成立，無人死亡' };
      if (!fires(room, seat)) return { note: `${why(room, seat)}，聲明無效` };
      const sh = tryKill(room, t, '造謠成真');
      return { note: sh ? `${label(room, t.id)} ${shieldText(sh)}，沒有死亡` : `造謠成真：${label(room, t.id)} 死亡`, e: { k: 'act', src: 'gossip', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  courtier: {
    skip: (room, seat) => once(room, 'courtier:' + seat.id),
    choose: room => ({ count: 0, roles: scriptRoles(room), roleOptional: true, prompt: '可以選擇一個角色：如果在場，他醉酒三天三夜（每局限一次）' }),
    run(room, seat, picks, o = {}) {
      if (!o.role) return { note: '沒有使用能力' };
      useOnce(room, 'courtier:' + seat.id);
      const g = gate(room, seat, 'courtier', o);
      if (g) return g === true ? failed(room, seat, 'courtier') : g;
      const hit = room.seats.filter(s => s.role === o.role);
      for (const s of hit) addEff(room, s.id, 'drunk', 'courtier', tick(room) + 5, seat.id, { live: true }); // 侍臣失去能力時他清醒，恢復後接著醉
      return { note: `選了${roleName(o.role)}` + (hit.length ? `：${hit.map(s => label(room, s.id)).join('、')} 醉酒三天三夜` : '，不在場'),
        e: { k: 'act', src: 'courtier', seat: seat.id, to: hit.map(s => s.id), role: o.role, res: hit.length ? 'poison' : 'noop', word: '醉三天', ...(!hit.length && { why: 'absent' }) } };
    },
  },
  professor: {
    // 今晚才死的人玩家看不到，只有他們時叫醒了也沒人可選
    skip: (room, seat) => once(room, 'professor:' + seat.id) || !room.seats.some(s => s.dead && !room.g.diedTonight.includes(s.id)),
    choose: { count: 1, counts: [0, 1], dead: true, prompt: '可以選擇一名死亡的玩家：如果他是鎮民，他復活（每局限一次）' },
    run(room, seat, [t], o = {}) {
      if (!t) return { note: '沒有使用能力' };
      useOnce(room, 'professor:' + seat.id);
      const g = gate(room, seat, 'professor', o);
      if (g) return g === true ? failed(room, seat, 'professor', [t]) : g;
      if (teamOf(t) !== 'townsfolk') return { note: `選了 ${label(room, t.id)}，不是鎮民`, e: { k: 'act', src: 'professor', seat: seat.id, to: [t.id], res: 'noop', why: 'nottown', word: '復活' } };
      rise(room, t, '被教授復活');
      return { note: `復活了 ${label(room, t.id)}`, e: { k: 'act', src: 'professor', seat: seat.id, to: [t.id], res: 'protect', word: '復活' } };
    },
  },
  // 月之子白天已經公開選好了（day.js answerLastWord），這裏結算，結果卡給說書人看一眼
  moonchild: {
    stOnly: true,
    wakeDead: moonDue,
    skip: (room, seat) => !moonDue(room, seat),
    run(room, seat) {
      const t = seatById(room, room.g.moonchildPick);
      room.g.moonchildDue = room.g.moonchildPick = null;
      if (!t) return { note: '月之子沒有選人', ack: true };
      // 隱士 / 間諜可以被當作另一陣營：說書人定
      if (!impaired(room, seat) && evilAs(room, t).length > 1) return { decide: { kind: 'moonreg', targetId: t.id, say: `${label(room, t.id)} 算善良？`, prompt: `${label(room, t.id)} 可以被當作另一陣營：算不算善良？`,
        options: [{ id: 'good', label: '算善良（他死亡）' }, { id: 'evil', label: '算邪惡（無事）' }] } };
      if (!isGoodSeat(t)) return { ack: true, ...(impaired(room, seat) ? failed(room, seat, 'moonchild', [t]) : { note: `選了 ${label(room, t.id)}，不是善良玩家`, e: { k: 'act', src: 'moonchild', seat: seat.id, to: [t.id], res: 'noop', why: 'notgood', word: '選中' } }) };
      if (!fires(room, seat)) return { ...failed(room, seat, 'moonchild', [t]), ack: true };
      return { ack: true, ...this.strike(room, seat, t) };
    },
    decide(room, seat, step, choice) {
      const t = seatById(room, step.decide.targetId);
      return choice === 'good' ? this.strike(room, seat, t) : { note: `選了 ${label(room, t.id)}，算邪惡，無事` };
    },
    strike(room, seat, t) {
      const sh = tryKill(room, t, '被月之子選中');
      return { note: sh ? `選了 ${label(room, t.id)}，但他${shieldText(sh)}` : `選了 ${label(room, t.id)}，他死亡`, e: { k: 'act', src: 'moonchild', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  // 心上人死了：說書人選誰從此醉酒（死的時候插進隊列，不佔進度條的格子）
  sweetheart: {
    instant: true,
    stOnly: true,
    wakeDead: () => true,
    run(room, seat) {
      const options = seatOpts(room, room.seats.filter(s => !s.dead && s !== seat));
      return options.length ? { decide: { kind: 'sweetheart', say: '誰從此醉酒？', prompt: '心上人死了：選擇一名玩家從此醉酒', options } } : { note: '沒有存活的玩家可以醉酒' };
    },
    decide(room, seat, step, choice) {
      sweetDrunk(room, seatById(room, choice));
      return { note: `${label(room, choice)} 從此醉酒`, e: { k: 'act', src: 'sweetheart', seat: seat.id, to: [choice], res: 'poison', word: '醉酒' } };
    },
  },
  // 教父：首夜得知在場的外來者；其他夜晚，今天白天有外來者死亡時殺一人
  godfather: {
    skip: room => room.g.night > 1 && !room.g.outsiderDied,
    choose: room => (room.g.night > 1 ? { count: 1, prompt: '今天有外來者死亡：選擇一名玩家殺死' } : null),
    run(room, seat, [t], o = {}) {
      if (room.g.night === 1) {
        const out = room.seats.filter(s => teamOf(s) === 'outsider').map(s => s.role), names = out.map(roleName).join('、');
        tell(room, seat.id, out.length ? `在場的外來者：${out.map(roleName).join('、')}` : '場上沒有外來者', [],
          { src: 'godfather', f: out.length ? [{ w: '外來者' }, ...out.map(r => ({ r, named: true }))] : [{ w: '沒有外來者' }] });
        fx(room, { k: 'info', src: 'godfather', kind: 'list', roles: out, msg: room.chatSeq }, seat.id);
        return { note: out.length ? `已告知在場的外來者：${names}` : '已告知場上沒有外來者', ack: true, f: [{ w: '告知' }, ...(out.length ? out.map(r => ({ r, named: true })) : [{ w: '沒有外來者' }])] };
      }
      const g = gate(room, seat, 'godfather', o);
      if (g) return g === true ? failed(room, seat, 'godfather', [t]) : g;
      const sh = tryKill(room, t, '被教父殺死');
      return { note: sh ? `攻擊 ${label(room, t.id)}，但他${shieldText(sh)}` : `殺死了 ${label(room, t.id)}`, e: { k: 'act', src: 'godfather', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  devilsadvocate: {
    choose: { count: 1, alive: true, notLast: true, prompt: '選擇一名存活的玩家（不能和上一晚相同）：如果他明天被處決，他不會死亡' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'devilsadvocate', o);
      if (g) return g === true ? failed(room, seat, 'devilsadvocate', [t]) : g;
      addEff(room, t.id, 'safe', 'devilsadvocate', tick(room) + 1, seat.id);
      return { note: `保護了 ${label(room, t.id)}（明天處決不死）`, e: { k: 'act', src: 'devilsadvocate', seat: seat.id, to: [t.id], res: 'protect' } };
    },
  },
  assassin: {
    skip: (room, seat) => once(room, 'assassin:' + seat.id),
    choose: { count: 1, counts: [0, 1], prompt: '可以選擇一名玩家：他死亡，無視任何保護（每局限一次）' },
    run(room, seat, [t], o = {}) {
      if (!t) return { note: '沒有使用能力' };
      useOnce(room, 'assassin:' + seat.id);
      const g = gate(room, seat, 'assassin', o);
      if (g) return g === true ? failed(room, seat, 'assassin', [t]) : g;
      if (t.dead && !t.undead) return { note: `選了 ${label(room, t.id)}，他已經死亡`, e: { k: 'act', src: 'assassin', seat: seat.id, to: [t.id], res: 'blocked', why: 'dead' } };
      die(room, t, '被刺客刺殺');
      return { note: `刺殺了 ${label(room, t.id)}`, e: { k: 'act', src: 'assassin', seat: seat.id, to: [t.id], res: 'kill' } };
    },
  },
  zombuul: { ...killer('zombuul'), skip: room => room.g.night > 1 && !!room.g.diedToday },
  pukka: {
    choose: { count: 1, prompt: '選擇一名玩家下毒（上一個中毒的人會死亡）' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'pukka', o);
      if (g) return g === true ? failed(room, seat, 'pukka', [t]) : g;
      const r = pukkaVictim(room, seat, t);
      // 僧侶保護的人、士兵：惡魔的負面能力對他無效，毒下不上
      const safe = room.g.protected === t.id ? 'protect' : t.role === 'soldier' && !impaired(room, t) ? 'soldier' : null;
      if (reallyAlive(seat)) { // 上次毒的是自己：普卡死了，毒也不下了
        dropEff(room, e => e.src === 'pukka');
        if (!safe) addEff(room, t.id, 'poison', 'pukka', FOREVER);
        room.g.pukka = safe ? null : t.id;
      }
      return { note: (safe ? `想毒 ${label(room, t.id)}，${safe === 'protect' ? '被僧侶保護' : '但他是士兵'}` : `毒了 ${label(room, t.id)}`) + (r ? `；${r.note}` : ''), decide: r?.decide,
        e: { k: 'act', src: 'pukka', seat: seat.id, to: [t.id], res: safe ? 'blocked' : 'poison', ...(safe && { why: safe }), ...(r?.e?.res === 'kill' && { dies: r.e.to }) } };
    },
    decide: demonDecide,
    // 被驅魔人選中、今晚不醒：不下新毒，上一個中毒的人照樣死亡
    asleep(room, seat) {
      if (!reallyAlive(seat) || impaired(room, seat)) return;
      const r = pukkaVictim(room, seat, null, false);
      if (r) stLog(room, `普卡（今晚沒有醒）：${r.note}`, r.e);
    },
  },
  shabaloth: {
    choose: { count: 2, prompt: '選擇兩名玩家殺死' },
    // 官方：喚醒沙巴洛斯之前，說書人可以讓他上一晚選中、現在已死的一人復活。他沒有能力時不反芻
    prep(room, seat) {
      const last = (room.g.shabaloth || []).map(id => seatById(room, id)).filter(s => s?.dead);
      return last.length && !impaired(room, seat) ? { kind: 'regurgitate', say: '反芻誰？', prompt: '沙巴洛斯可以讓上一晚選中的一名死者復活', options: [NONE, ...seatOpts(room, last)] } : null;
    },
    run(room, seat, picks, o = {}) {
      const g = gate(room, seat, 'shabaloth', o);
      if (g && g !== true) return g;
      // 中毒時也算選過。以為自己是沙巴洛斯的瘋子排在真惡魔前面，他的選擇不能蓋掉真沙巴洛斯上一晚選的人
      if (seat.role === 'shabaloth') room.g.shabaloth = picks.map(t => t.id);
      if (g) return failed(room, seat, 'shabaloth', picks);
      return merge(picks.map(t => attack(room, seat, t, o, 'shabaloth', true)), seat, 'shabaloth', picks);
    },
    decide(room, seat, step, choice) {
      // 反芻完才叫醒他。先排他，復活的首夜角色會插到他前面，當場用能力
      if (step.decide.kind === 'regurgitate') room.g.queue.unshift({ roleId: 'shabaloth', seatId: seat.id, at: 0, prepped: true });
      return demonDecide(room, seat, step, choice);
    },
  },
  po: {
    choose: (room, seat) => (room.g.poCharge?.[seat.id]
      ? { count: 3, prompt: '上次你沒有選人：今晚選擇三名玩家殺死' }
      : { count: 1, counts: [0, 1], prompt: '可以選擇一名玩家殺死（不選的話，下次可以殺三人）' }),
    run(room, seat, picks, o = {}) {
      const g = gate(room, seat, 'po', o);
      if (g && g !== true) return g;
      (room.g.poCharge ||= {})[seat.id] = picks.length === 0; // 能力失效時也算一次選擇：不選的話下次仍然三殺，三殺夜失效後不再蓄力。按座位記，瘋子以為自己是珀時不算真珀的
      if (!picks.length) tell(room, seat.id, '你今晚沒有選人：下一次可以選三人', [], { src: 'po', f: [{ r: 'po', named: true }, { w: '蓄力', k: 'evil' }] });
      if (g) return failed(room, seat, 'po', picks);
      if (!picks.length) return { note: '沒有選人，下次可以殺三人', e: { k: 'act', src: 'po', seat: seat.id, to: [], res: 'charge' } };
      return merge(picks.map(t => attack(room, seat, t, o, 'po', picks.length > 1)), seat, 'po', picks);
    },
    decide: demonDecide,
  },

  // ───── 夢殞春宵 ─────
  clockmaker: {
    run(room) {
      const n = room.seats.length, dist = (a, b) => { const d = Math.abs(room.seats.indexOf(a) - room.seats.indexOf(b)); return Math.min(d, n - d); };
      const steps = (isDemon, isMinion) => {
        const ds = room.seats.filter(isDemon), ms = room.seats.filter(isMinion);
        return Math.min(...ds.flatMap(d => ms.filter(m => m !== d).map(m => dist(d, m))), Infinity);
      };
      const real = steps(s => teamOf(s) === 'demon', s => teamOf(s) === 'minion');
      const ok = [steps(s => teamsAs(room, s).includes('demon'), s => teamOf(s) === 'minion'),
        steps(s => teamOf(s) === 'demon', s => teamsAs(room, s).includes('minion'))].filter(x => Number.isFinite(x) && x !== real);
      return { form: { kind: 'number', max: Math.floor(n / 2), truth: { n: Number.isFinite(real) ? real : 0 }, ok } };
    },
  },
  dreamer: {
    choose: { count: 1, notSelf: true, prompt: '選擇一名玩家：得知一個善良角色和一個邪惡角色，他是其中之一' },
    run(room, seat, [t]) {
      const good = TEAMS[ROLES[t.role].team].good;
      const truth = good ? { good: t.role, evil: pick(evilRoles(room)) } : { good: pick(goodRoles(room).filter(id => id !== t.role)), evil: t.role };
      return { form: { kind: 'dream', goods: goodRoles(room), evils: evilRoles(room), truth, role: t.role, ok: rolesAs(room, t),
        extra: { target: label(room, t.id), targetId: t.id } } };
    },
  },
  snakecharmer: {
    choose: { count: 1, alive: true, prompt: '選擇一名存活的玩家：如果他是惡魔，你們交換角色和陣營' },
    run(room, seat, [t], o = {}) {
      const g = teamOf(t) === 'demon' && gate(room, seat, 'snakecharmer', o); // 選中的不是惡魔：本來就沒有效果，不用裁定
      if (g) return g === true ? failed(room, seat, 'snakecharmer', [t]) : g;
      if (teamOf(t) !== 'demon') return { note: `選了 ${label(room, t.id)}，不是惡魔`, e: { k: 'act', src: 'snakecharmer', seat: seat.id, to: [t.id], res: 'noop', why: 'notdemon', word: '查驗' } };
      // 哲學家拿的舞蛇人能力：原惡魔變成哲學家（官方例子）。自己的換牌在 act 的 swap 裏演，原惡魔才走 changed
      const [ra, rb, aa, ab] = [seat.was === 'philosopher' ? 'philosopher' : seat.role, t.role, alignOf(seat), alignOf(t)];
      changeRole(room, seat, rb, '你用舞蛇人的能力選中了惡魔，你們交換了角色和陣營', false);
      changeRole(room, t, ra, '舞蛇人選中了你，你們交換了角色和陣營', false, 'snakecharmer');
      seat.align = ab; t.align = aa;
      addEff(room, t.id, 'poison', 'snakecharmer', FOREVER);
      for (const e of room.g.eff) if (e.live && e.src === rb && e.by === t.id) e.by = seat.id; // 亡骨魔的毒跟著角色走
      actTonight(room, seat, rb, ROLES.snakecharmer[room.g.night === 1 ? 'first' : 'other']); // 舞蛇人排在惡魔前面：新惡魔當晚就行動
      return { note: `選中惡魔 ${label(room, t.id)}：交換角色和陣營，原惡魔中毒`, e: { k: 'act', src: 'snakecharmer', seat: seat.id, to: [t.id], res: 'poison', word: '交換', swap: { role: rb, gave: ra } } };
    },
  },
  mathematician: {
    run(room, seat) {
      const ids = (room.g.abnormal || []).filter(id => id !== seat.id);
      return { form: { kind: 'number', max: room.seats.length, truth: { n: ids.length }, ok: [], open: true, ids } };
    },
  },
  flowergirl: {
    run(room) {
      const voted = (room.g.voted || []).map(id => atDusk(room, id)).filter(Boolean);
      const yes = voted.some(s => teamOf(s) === 'demon');
      return yesno(room, yes, voted.some(s => teamsAs(room, s).includes('demon') !== (teamOf(s) === 'demon')));
    },
  },
  towncrier: {
    run(room) {
      const noms = (room.g.nominators || []).map(id => atDusk(room, id)).filter(Boolean);
      const yes = noms.some(s => teamOf(s) === 'minion');
      const flex = noms.some(s => teamsAs(room, s).length > 1 && (teamsAs(room, s).includes('minion') || teamOf(s) === 'minion'));
      return yesno(room, yes, flex);
    },
  },
  oracle: {
    run(room) {
      const count = evil => room.seats.filter(s => s.dead && !s.undead && evil(s)).length;
      return { form: { kind: 'number', max: room.seats.length, truth: { n: count(isEvil) }, ok: evilCounts(room, count) } };
    },
  },
  seamstress: {
    skip: (room, seat) => once(room, 'seamstress:' + seat.id),
    choose: { count: 2, counts: [0, 2], notSelf: true, prompt: '可以選擇兩名玩家，得知他們是否同一陣營（每局限一次）' },
    run(room, seat, picks) {
      if (!picks.length) return { note: '沒有使用能力' };
      useOnce(room, 'seamstress:' + seat.id);
      const [a, b] = picks, same = isEvil(a) === isEvil(b);
      const alt = evilAs(room, a).length > 1 || evilAs(room, b).length > 1;
      return yesno(room, same, alt, { ids: [a.id, b.id] });
    },
  },
  philosopher: {
    skip: (room, seat) => once(room, 'philosopher:' + seat.id),
    choose: room => ({ count: 0, roles: goodRoles(room).filter(id => id !== 'philosopher'), roleOptional: true, prompt: '可以選擇一個善良角色，獲得他的能力（每局限一次）' }),
    run(room, seat, picks, o = {}) {
      if (!o.role) return { note: '沒有使用能力' };
      useOnce(room, 'philosopher:' + seat.id);
      const g = gate(room, seat, 'philosopher', o);
      if (g) return g === true ? failed(room, seat, 'philosopher') : g;
      const holders = room.seats.filter(s => s.role === o.role);
      // 官方：哲學家死亡、醉酒或中毒時，被他弄醉的人清醒；恢復後接著醉
      for (const s of holders) addEff(room, s.id, 'drunk', 'philosopher', FOREVER, seat.id, { live: true });
      changeRole(room, seat, o.role, '哲學家獲得了新的能力');
      seat.was = 'philosopher';
      actTonight(room, seat, o.role, ROLES.philosopher.first);
      return { note: `變成${roleName(o.role)}` + (holders.length ? `；${holders.map(s => label(room, s.id)).join('、')} 醉酒` : ''),
        e: { k: 'act', src: 'philosopher', seat: seat.id, to: holders.map(s => s.id), role: o.role, res: holders.length ? 'poison' : 'master', word: '獲得' } };
    },
  },
  // 白天點座位公開猜的（day.js juggle），算好對了幾個；隱士 / 間諜可以被算對。沒用系統猜的（口頭猜）說書人自己數
  juggler: {
    skip: (room, seat) => room.g.night !== jugglerDay(room, seat) + 1,
    run(room, seat) {
      const gs = room.g.juggle?.[seat.id] || [], n = gs.filter(x => x.hit).length, maybe = gs.filter(x => x.maybe).length;
      if (!gs.length) return { form: { kind: 'number', max: 5, truth: { n: 0 }, ok: [], unknown: true } };
      return { form: { kind: 'number', max: 5, truth: { n }, ok: Array.from({ length: maybe }, (_, i) => n + i + 1), extra: { guesses: gs } } };
    },
  },
  sage: {
    wakeDead: (room, seat) => !!room.g.sageDue?.[seat.id],
    skip: (room, seat) => !room.g.sageDue?.[seat.id],
    run(room, seat) {
      const d = seatById(room, room.g.sageDue[seat.id]);
      delete room.g.sageDue[seat.id];
      const other = pick(room.seats.filter(s => s !== d && s !== seat));
      const [a, b] = shuffle([d, other]);
      // 相剋：隱士可能被賢者當作惡魔
      const mayBe = Object.fromEntries(room.seats.filter(s => s.role === 'recluse' && !impaired(room, s)).map(s => [s.id, [d.role]]));
      return { form: { kind: 'two', team: 'demon', plain: true, roles: [d.role], allowNone: false, roleOf: { [d.id]: d.role }, mayBe, noneOk: false,
        truth: { a: a.id, b: b.id, role: d.role }, impaired: !!room.g.sageBad?.[seat.id] } };
    },
  },
  barber: {
    wakeDead: room => !!room.g.barberDue,
    skip: room => !room.g.barberDue || !demonSeat(room),
    actor: room => demonSeat(room),
    choose: { count: 2, counts: [0, 2], prompt: '理髮師死了：你可以選擇兩名玩家（不能選其他惡魔）交換角色' },
    run(room, seat, picks) {
      room.g.barberDue = false;
      if (!picks.length) return { note: '惡魔沒有交換角色' };
      const [a, b] = picks;
      if ([a, b].some(s => s !== seat && teamOf(s) === 'demon')) return { note: '不能選擇其他惡魔，交換無效' };
      swapRoles(room, a, b, '理髮師的能力讓你換了角色');
      // 換到的角色順序在理髮師後面的，今晚照常醒（和麻臉巫婆、舞蛇人一樣：說書人按魔典上現在的角色往下叫）
      for (const s of [a, b]) actTonight(room, s, s.role, ROLES.barber.other);
      return { note: `${label(room, a.id)} 和 ${label(room, b.id)} 交換了角色`, e: { k: 'act', src: 'barber', seat: seat.id, to: [a.id, b.id], res: 'master' } };
    },
  },
  // 對手是一名陣營相反的玩家（麻臉巫婆變出來的善良雙子配邪惡玩家）。holder：能力的持有者
  eviltwin: {
    run(room, seat) {
      const g = room.g, good = isGoodSeat(seat);
      const t = pick(room.seats.filter(s => s !== seat && reallyAlive(s) && isGoodSeat(s) !== good));
      if (!t) return { note: `場上沒有${good ? '邪惡' : '善良'}玩家`, ack: true };
      g.twin = { evil: good ? t.id : seat.id, good: good ? seat.id : t.id, holder: seat.id };
      const f = (s, r) => [{ w: '雙子' }, { s }, { w: '是' }, { r, named: true }];
      tell(room, seat.id, `你的雙子是 ${label(room, t.id)}【${roleName(t.role)}】`, [{ seatId: t.id, r: t.role, text: roleName(t.role) }], { src: 'eviltwin', f: f(t.id, t.role) });
      fx(room, { k: 'info', src: 'eviltwin', id: t.id, role: t.role, msg: room.chatSeq }, seat.id);
      tell(room, t.id, `你和 ${label(room, seat.id)}【${roleName(seat.role)}】是鏡像雙子`, [{ seatId: seat.id, r: seat.role, text: roleName(seat.role) }], { src: 'eviltwin', f: f(seat.id, seat.role) });
      fx(room, { k: 'info', src: 'eviltwin', id: seat.id, role: seat.role, msg: room.chatSeq }, t.id);
      return { note: `雙子是 ${label(room, t.id)}`, e: { k: 'act', src: 'eviltwin', seat: seat.id, to: [t.id], res: 'master' }, ack: true };
    },
  },
  witch: {
    skip: room => alive(room).length <= 3,
    choose: { count: 1, prompt: '選擇一名玩家詛咒：明天他發起提名就會死亡' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'witch', o);
      if (g) return g === true ? failed(room, seat, 'witch', [t]) : g;
      addEff(room, t.id, 'curse', 'witch', tick(room) + 1, seat.id, { live: true }); // 女巫沒了能力，詛咒跟著沒
      return { note: `詛咒了 ${label(room, t.id)}`, e: { k: 'act', src: 'witch', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  cerenovus: {
    choose: room => ({ count: 1, roles: goodRoles(room), prompt: '選擇一名玩家和一個善良角色：他明天要瘋狂地證明自己是這個角色' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'cerenovus', o);
      if (g) return g === true ? failed(room, seat, 'cerenovus', [t]) : g;
      addEff(room, t.id, 'mad', 'cerenovus', tick(room) + 2, seat.id, { madAs: o.role });
      tell(room, t.id, `洗腦師選中了你：明天白天和夜晚，你要「瘋狂」地證明自己是【${roleName(o.role)}】，否則可能被處決`, [],
        { src: 'cerenovus', f: [{ w: '瘋狂', k: 'evil' }, { r: o.role, named: true }] });
      fx(room, { k: 'info', src: 'mad', role: o.role, msg: room.chatSeq }, t.id);
      return { note: `讓 ${label(room, t.id)} 瘋狂證明自己是${roleName(o.role)}`, e: { k: 'act', src: 'cerenovus', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  pithag: {
    choose: room => ({ count: 1, roles: scriptRoles(room), prompt: '選擇一名玩家和一個角色：如果該角色不在場，他變成該角色' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'pithag', o);
      if (g) return g === true ? failed(room, seat, 'pithag', [t]) : g;
      if (inPlay(room).has(o.role)) return { note: `想把 ${label(room, t.id)} 變成${roleName(o.role)}，但這個角色已在場，無事發生`, e: { k: 'act', src: 'pithag', seat: seat.id, to: [t.id], role: o.role, res: 'noop', why: 'inplay' } };
      const before = t.role;
      changeRole(room, t, o.role, '麻臉巫婆把你變了', true, 'pithag');
      if (o.role === 'goon' && isEvil(t)) t.goonEvil = true;
      const twin = o.role === 'eviltwin' && NIGHT.eviltwin.run(room, t); // 新的雙子當晚就和對手互認
      const demon = ROLES[o.role].team === 'demon';
      if (!demon) actTonight(room, t, o.role, ROLES.pithag.other);
      return { note: `把 ${label(room, t.id)} 從${roleName(before)}變成${roleName(o.role)}` + (twin ? `。${twin.note}` : ''), decide: demon ? hagDeaths(room) : undefined,
        e: { k: 'act', src: 'pithag', seat: seat.id, to: [t.id], role: o.role, res: 'master' } };
    },
    // 創造了惡魔：今晚死誰由說書人定，可以連選幾個，選「沒有了」結束
    decide(room, seat, step, choice) {
      const t = seatById(room, choice);
      if (!t) return { note: '今晚不再有人死亡' };
      const sh = tryKill(room, t, '麻臉巫婆創造了惡魔');
      return { note: sh ? `${label(room, t.id)} ${shieldText(sh)}，沒有死亡` : `${label(room, t.id)} 死亡`, decide: hagDeaths(room),
        e: { k: 'act', src: 'pithag', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  fanggu: killer('fanggu', {
    // 第一次殺到外來者：他變成邪惡的方古，原方古代替他死亡
    before(room, seat, t) {
      if (teamOf(t) !== 'outsider' || room.g.fangguJumped || t.dead || room.g.protected === t.id || shieldOf(room, t, { demon: true })) return null;
      room.g.fangguJumped = true;
      changeRole(room, t, 'fanggu', '方古選中了你：你變成了邪惡的方古', false, { k: 'demon', from: seat.id, why: 'fanggu' });
      t.align = 'evil';
      die(room, seat, '方古跳到外來者身上');
      return { note: `選中外來者 ${label(room, t.id)}：他變成方古，原方古死亡`, e: { k: 'act', src: 'fanggu', seat: seat.id, to: [t.id], res: 'starpass', dies: [seat.id] } };
    },
  }),
  vigormortis: killer('vigormortis', {
    // 殺死的爪牙保留能力，鄰近的兩名鎮民之一中毒：說書人選（只有一個能選時不用問）。亡骨魔失去能力時解毒。
    // 士兵、被僧侶保護的鎮民不受惡魔的負面能力影響
    kill(room, seat, t) {
      if (teamOf(t) !== 'minion') return null;
      t.keep = true;
      stLog(room, `${label(room, t.id)} 是爪牙：死後保留能力`, { k: 'rule', seat: t.id, role: 'vigormortis', work: true });
      const vs = townsfolkNeighbors(room, t).filter(v => room.g.protected !== v.id && !(v.role === 'soldier' && !impaired(room, v)));
      if (vs.length === 1) { this.neighbor(room, seat, vs[0].id); return null; }
      return vs.length ? { kind: 'neighbor', say: '誰中毒？', prompt: '亡骨魔：選擇鄰近的一名鎮民中毒', options: seatOpts(room, vs) } : null;
    },
    neighbor(room, seat, id) {
      addEff(room, id, 'poison', 'vigormortis', FOREVER, seat.id, { live: true });
      stLog(room, `亡骨魔：${label(room, id)} 中毒`, { k: 'rule', seat: id, role: 'vigormortis', why: '中毒', work: true });
      fx(room, { k: 'grim', src: 'vigormortis', seat: seat.id, to: [id], res: 'poison', word: '中毒' }, 'st');
      return { note: `${label(room, id)} 中毒` };
    },
  }),
  nodashii: killer('nodashii'),
  vortox: killer('vortox'),
};
export const sweetDrunk = (room, t) => {
  addEff(room, t.id, 'drunk', 'sweetheart', FOREVER);
  stLog(room, `心上人：${label(room, t.id)}（${roleName(t.role)}）從此醉酒`, { k: 'rule', seat: t.id, role: 'sweetheart', why: '醉酒', work: true });
};
const hagDeaths = room => ({ kind: 'hagdeaths', say: '今晚誰死？', prompt: '麻臉巫婆創造了惡魔：今晚的死亡由你決定', options: [{ id: 'none', label: '沒有了' }, ...seatOpts(room, room.seats.filter(s => !s.dead))] });
// 渦流在場（活著且能力正常）：鎮民的信息必須是錯的
export const vortoxOn = room => room.seats.some(s => s.role === 'vortox' && reallyAlive(s) && !impaired(room, s));

export const describeStep = (room, step) =>
  step.seatId ? `${roleName(step.roleId)} · ${label(room, step.seatId)}` : NIGHT[step.roleId]?.name || '天亮前確認';
