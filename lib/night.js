// 每個角色的夜晚行動：choose 描述要選幾個人（可以是函數）；run 結算效果，信息類角色返回一張給說書人選擇的表單，
// 需要說書人裁定的（鎮長替死、小惡魔傳位、旅店老闆誰醉酒……）返回 decide，由 decide() 結算說書人的選擇
// choose：count 最多選幾人；counts 允許的人數（默認只能選 count 個）；notSelf 不能選自己；alive / dead 只能選存活 / 死亡的；
//   notLast 不能和上一晚選同一人；roles 還要選一個角色（列出可選的角色），roleOptional 可以不選角色（不使用能力）
// wakeDead：死了也會被喚醒（守鴉人、賢者、月之子……）；actor：替別人做選擇的座位（理髮師死後由惡魔選）；
// skip：今晚不用喚醒；stOnly：只是說書人結算，玩家不會被喚醒（造謠者、月之子）
import { ROLES, TEAMS } from '../public/js/roles.js';
import {
  shuffle, pick, seatById, label, roleName, teamOf, isEvil, aliveNeighbors, scriptRoles, teamRoles, impaired,
  teamsAs, evilAs, rolesAs, seatTags, hasDemon, alignOf, isGoodSeat, reallyAlive, addEff, dropEff, hasEff, tick, FOREVER,
  once, useOnce, whyImpaired, tell, stLog, alive,
} from './util.js';
import { killSeat, becomeDemon, changeRole, shieldOf, shieldText, die, tryKill, revive } from './rules.js';

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
  if (hasDemon(room)) return { note: '自殺，紅唇女郎接任', e };
  const minions = room.seats.filter(s => !s.dead && teamOf(s) === 'minion');
  if (!minions.length) return { note: '自殺，沒有存活的爪牙可以接任', e };
  if (minions.length === 1) {
    becomeDemon(room, minions[0], imp.role, '小惡魔把惡魔身份傳給了你');
    return { note: `自殺，${label(room, minions[0].id)} 接任`, e };
  }
  return {
    note: '自殺傳位，等待說書人選擇接任的爪牙', e,
    decide: { kind: 'starpass', prompt: '小惡魔自殺了：選擇一名存活的爪牙成為新的小惡魔', options: seatOpts(room, minions) },
  };
}

// 中毒 / 酒鬼的能力：停下來讓說書人裁定是否生效（o[role] 記下裁定結果，再重跑一次）
// 沒有能力的（酒鬼、瘋子）同樣停下，但只有「無效」一個選項
const why = (room, s) => whyImpaired(room, s);
const noAbility = s => s.role === 'drunk' || s.role === 'lunatic';
const askAbility = (room, role, s) => ({ decide: { kind: 'ability', role, targetId: s.id, why: why(room, s),
  prompt: `${roleName(role)}${why(room, s)}：能力是否生效？`,
  options: [...(noAbility(s) ? [] : [{ id: 'work', label: '生效' }]), { id: 'fail', label: '無效' }] } });
// 行動者能力失效時：先問一次說書人；返回 decide 表示要等裁定，返回 true 表示裁定為無效
function gate(room, seat, role, o) {
  if (!impaired(room, seat)) return false;
  if (o[role] === undefined) return askAbility(room, role, seat);
  return !o[role];
}
const failed = (room, seat, role, to = []) => ({ note: `${why(room, seat)}，能力無效`, e: { k: 'act', src: role, seat: seat.id, to: to.map(t => t.id), res: 'fail' } });

// 惡魔攻擊一名玩家：僧侶、士兵、各種保護、鎮長替死都在這裏。multi：一晚殺多人的惡魔，不停下來問鎮長替死 / 中毒士兵
function attack(room, seat, t, o, src, multi = false) {
  const who = label(room, t.id);
  const e = (res, w) => ({ k: 'act', src, seat: seat.id, to: [t.id], res, ...(w && { why: w }) });
  if (t.dead && !t.undead) return { note: `想殺 ${who}，但他已經死亡`, e: e('blocked', 'dead') };
  if (room.g.protected === t.id) return { note: `想殺 ${who}，被僧侶保護`, e: e('blocked', 'protect') };
  if (t.role === 'soldier') {
    if (!impaired(room, t) || o.soldier) return { note: `想殺 ${who}，但他是士兵`, e: e('blocked', 'soldier') };
    if (!multi && o.soldier === undefined) return askAbility(room, 'soldier', t);
  }
  const sh = shieldOf(room, t, { demon: true });
  if (sh) return { note: `想殺 ${who}，但他${shieldText(sh)}`, e: e('blocked', sh === 'dead' ? 'dead' : 'protect') };
  // 鎮長（中毒時也一樣）：說書人決定讓他死、換人死還是無人死亡
  if (t.role === 'mayor' && !multi) {
    const options = [{ id: t.id, label: `讓鎮長 ${who} 死亡` },
      ...room.seats.filter(s => !s.dead && s !== t).map(s => ({ id: s.id, label: `改為 ${label(room, s.id)}（${roleName(s.role)}）死亡` })),
      { id: 'none', label: '無人死亡' }];
    return { note: `想殺鎮長 ${who}`, e: e('mayor'), decide: { kind: 'mayor', targetId: t.id, prompt: '惡魔攻擊了鎮長：你可以讓另一名玩家代替他死亡', options } };
  }
  die(room, t, '夜裏被惡魔殺死');
  afterDemonKill(room, seat, t);
  return { note: `殺死了 ${who}`, e: e('kill') };
}
// 惡魔殺人之後：祖母跟著孫子死，賢者當晚醒來
function afterDemonKill(room, demon, t) {
  const g = room.g;
  for (const gm of room.seats.filter(s => s.role === 'grandmother' && !s.dead && g.grandchild?.[s.id] === t.id && !impaired(room, s))) {
    if (!tryKill(room, gm, '孫子被惡魔殺死')) stLog(room, `${label(room, gm.id)}（祖母）的孫子被惡魔殺死，祖母也死亡`, { k: 'rule', seat: gm.id, role: 'grandmother', work: true });
  }
  if (t.role === 'sage' && !impaired(room, t)) (g.sageDue ||= {})[t.id] = demon.id;
}
// 多個攻擊結果合併成一條日誌
const merge = (rs, seat, src, to) => ({ note: rs.map(r => r.note).join('；') || '沒有選人', e: { k: 'act', src, seat: seat.id, to: to.map(t => t.id), res: rs.some(r => r.e?.res === 'kill') ? 'kill' : 'blocked' } });

// 鎮長替死、傳位：所有惡魔共用
function demonDecide(room, seat, step, choice) {
  const t = seatById(room, choice), src = step.roleId;
  if (step.decide.kind === 'starpass') {
    becomeDemon(room, t, 'imp', '小惡魔把惡魔身份傳給了你');
    return { note: `${label(room, t.id)} 接任小惡魔` };
  }
  if (step.decide.kind === 'regurgitate') {
    if (t) revive(room, t, '被沙巴洛斯反芻（復活）');
    return { note: t ? `反芻了 ${label(room, t.id)}` : '沒有反芻' };
  }
  const e = (res, to) => ({ k: 'act', src, seat: seat.id, to: to ? [to.id] : [], res });
  if (!t) return { note: '鎮長的能力：無人死亡', e: { ...e('blocked', seatById(room, step.decide.targetId)), why: 'mayor' } };
  if (t.id === step.decide.targetId) { die(room, t, '夜裏被惡魔殺死'); return { note: `鎮長 ${label(room, t.id)} 死亡`, e: e('kill', t) }; }
  const sh = room.g.protected === t.id ? 'protect' : t.role === 'soldier' && !impaired(room, t) ? '' : shieldOf(room, t, { demon: true });
  if (sh || (t.role === 'soldier' && !impaired(room, t))) return { note: `鎮長的能力轉移給 ${label(room, t.id)}，但他${sh ? shieldText(sh) : '是士兵'}，無人死亡`, e: { ...e('blocked', t), why: 'mayor' } };
  die(room, t, '代替鎮長死亡');
  return { note: `${label(room, t.id)} 代替鎮長死亡`, e: e('kill', t) };
}

// 只殺一人的惡魔：小惡魔以外的都一樣，after 處理各自的特殊效果
const killer = (src, after) => ({
  choose: { count: 1, prompt: '選擇一名玩家殺死' },
  run(room, seat, [t], o = {}) {
    const g = gate(room, seat, src, o);
    if (g) return g === true ? failed(room, seat, src, [t]) : g;
    const pre = after?.before?.(room, seat, t);
    if (pre) return pre;
    const r = attack(room, seat, t, o, src);
    if (!r.decide && r.e?.res === 'kill') after?.kill?.(room, seat, t);
    return r;
  },
  decide: demonDecide,
});

// 鄰近的鎮民：順時針、逆時針各找最近的一個
function townsfolkNeighbors(room, seat) {
  const n = room.seats.length, i = room.seats.indexOf(seat), out = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const s = room.seats[(i + dir * k + n) % n];
      if (s === seat) break;
      if (teamOf(s) === 'townsfolk' && !s.dead) { out.push(s); break; }
    }
  }
  return [...new Set(out)];
}

// 交換兩名玩家的角色（理髮師）：陣營不變
function swapRoles(room, a, b, why) {
  const [ra, rb] = [a.role, b.role];
  changeRole(room, a, rb, why);
  changeRole(room, b, ra, why);
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
        const bluffs = shuffle(goodRoles(room).filter(id => !inPlay(room).has(id))).slice(0, 3);
        out.push({ seatId: lunatic.id, bluffs, marks: fake.map(x => ({ seatId: x.id, t: 'minion', text: '爪牙' })),
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
      return { form: { kind: 'number', max: Math.max(3, Math.ceil(n / 2)), truth: { n: pairs(isEvil) }, ok: evilCounts(room, pairs) } };
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
      return { note: `保護了 ${label(room, t.id)}`, e: { k: 'act', src: 'monk', seat: seat.id, to: [t.id], res: g ? 'fail' : 'protect' } };
    },
  },
  imp: {
    choose: { count: 1, prompt: '選擇一名玩家殺死（可以選自己）' },
    run(room, seat, [t], o = {}) {
      const who = label(room, t.id);
      const g = gate(room, seat, 'imp', o);
      if (g && g !== true) return g;
      if (g) return { note: `想殺 ${who}，但${why(room, seat)}，說書人裁定無效`, e: { k: 'act', src: 'imp', seat: seat.id, to: [t.id], res: 'fail' } };
      if (room.g.protected === t.id) return { note: `想殺 ${who}，被僧侶保護`, e: { k: 'act', src: 'imp', seat: seat.id, to: [t.id], res: 'blocked', why: 'protect' } };
      if (t === seat) return starpass(room, seat);
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
  grandmother: {
    run(room, seat) {
      const g = room.g;
      const t = seatById(room, g.grandchild?.[seat.id]) || pick(room.seats.filter(s => s !== seat && isGoodSeat(s)));
      if (!t) return { note: '場上沒有其他善良玩家' };
      (g.grandchild ||= {})[seat.id] = t.id;
      return { form: { kind: 'role', roles: goodRoles(room), truth: { role: t.role }, ok: [], extra: { target: label(room, t.id), targetId: t.id } } };
    },
  },
  sailor: {
    choose: { count: 1, alive: true, prompt: '選擇一名存活的玩家：你或他之一會醉酒到下個黃昏' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'sailor', o);
      if (g) return g === true ? failed(room, seat, 'sailor', [t]) : g;
      if (t === seat) { addEff(room, seat.id, 'drunk', 'sailor', tick(room) + 1); return { note: '選了自己，自己醉酒' }; }
      return { note: `選了 ${label(room, t.id)}`, decide: { kind: 'drunk', say: '誰醉酒？', prompt: '水手：選擇誰醉酒到下個黃昏', options: seatOpts(room, [seat, t]) } };
    },
    decide(room, seat, step, choice) {
      addEff(room, choice, 'drunk', 'sailor', tick(room) + 1);
      return { note: `${label(room, choice)} 醉酒到下個黃昏` };
    },
  },
  chambermaid: {
    choose: { count: 2, alive: true, notSelf: true, prompt: '選擇除你以外的兩名存活的玩家，得知他們今晚有幾人被喚醒' },
    run(room, seat, picks) {
      const n = picks.filter(t => room.g.woke.includes(t.id)).length;
      return { form: { kind: 'number', max: 2, truth: { n }, ok: [], extra: { nbIds: picks.map(t => t.id) } } };
    },
  },
  exorcist: {
    choose: { count: 1, notLast: true, prompt: '選擇一名玩家（不能和上一晚相同）：如果是惡魔，他今晚不會被喚醒' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'exorcist', o);
      if (g) return g === true ? failed(room, seat, 'exorcist', [t]) : g;
      if (teamOf(t) !== 'demon') return { note: `選了 ${label(room, t.id)}，不是惡魔` };
      room.g.exorcised = t.id;
      tell(room, t.id, `驅魔人 ${label(room, seat.id)} 選中了你：今晚你不會被喚醒`, [{ seatId: seat.id, r: 'exorcist', text: '驅魔人' }],
        { src: 'exorcist', f: [{ s: seat.id }, { w: '是' }, { r: 'exorcist', named: true }] });
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
      return { note: `${label(room, choice)} 醉酒到下個黃昏` };
    },
  },
  gambler: {
    choose: room => ({ count: 1, roles: scriptRoles(room), prompt: '選擇一名玩家並猜測他的角色：猜錯你會死亡' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'gambler', o);
      if (g) return g === true ? failed(room, seat, 'gambler', [t]) : g;
      const right = t.role === o.role, maybe = rolesAs(room, t).includes(o.role);
      if (right) return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}，猜對了` };
      if (maybe && o.gamble === undefined) {
        return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}`, decide: { kind: 'gamble', say: '算猜對？', prompt: `${label(room, t.id)} 可以被當作${roleName(o.role)}：算不算猜對？`,
          options: [{ id: 'right', label: '算猜對' }, { id: 'wrong', label: '算猜錯（賭徒死亡）' }] } };
      }
      if (o.gamble === 'right') return { note: '說書人裁定猜對' };
      const sh = tryKill(room, seat, '賭徒猜錯');
      return { note: `猜 ${label(room, t.id)} 是${roleName(o.role)}，猜錯了` + (sh ? `，但他${shieldText(sh)}` : '，賭徒死亡') };
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
      if (impaired(room, seat)) return { note: `${why(room, seat)}，聲明無效` };
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
      for (const s of hit) addEff(room, s.id, 'drunk', 'courtier', tick(room) + 5);
      return { note: `選了${roleName(o.role)}` + (hit.length ? `：${hit.map(s => label(room, s.id)).join('、')} 醉酒三天三夜` : '，不在場') };
    },
  },
  professor: {
    skip: (room, seat) => once(room, 'professor:' + seat.id) || !room.seats.some(s => s.dead),
    choose: { count: 1, counts: [0, 1], dead: true, prompt: '可以選擇一名死亡的玩家：如果他是鎮民，他復活（每局限一次）' },
    run(room, seat, [t], o = {}) {
      if (!t) return { note: '沒有使用能力' };
      useOnce(room, 'professor:' + seat.id);
      const g = gate(room, seat, 'professor', o);
      if (g) return g === true ? failed(room, seat, 'professor', [t]) : g;
      if (teamOf(t) !== 'townsfolk') return { note: `選了 ${label(room, t.id)}，不是鎮民` };
      revive(room, t, '被教授復活');
      return { note: `復活了 ${label(room, t.id)}`, e: { k: 'act', src: 'professor', seat: seat.id, to: [t.id], res: 'protect' } };
    },
  },
  moonchild: {
    stOnly: true,
    wakeDead: (room, seat) => room.g.moonchildDue === seat.id,
    skip: (room, seat) => room.g.moonchildDue !== seat.id,
    run(room, seat) {
      return { decide: { kind: 'moonchild', say: '月之子選了誰？', prompt: '月之子公開選擇了誰？善良的話他今晚死亡',
        options: [NONE, ...seatOpts(room, room.seats.filter(s => !s.dead && s !== seat))] } };
    },
    decide(room, seat, step, choice) {
      room.g.moonchildDue = null;
      const t = seatById(room, choice);
      if (!t) return { note: '月之子沒有選人' };
      if (!isGoodSeat(t)) return { note: `選了 ${label(room, t.id)}，不是善良玩家` };
      const sh = tryKill(room, t, '被月之子選中');
      return { note: sh ? `選了 ${label(room, t.id)}，但他${shieldText(sh)}` : `選了 ${label(room, t.id)}，他死亡`, e: { k: 'act', src: 'moonchild', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  // 教父：首夜得知在場的外來者；其他夜晚，今天白天有外來者死亡時殺一人
  godfather: {
    skip: room => room.g.night > 1 && !room.g.outsiderDied,
    choose: room => (room.g.night > 1 ? { count: 1, prompt: '今天有外來者死亡：選擇一名玩家殺死' } : null),
    run(room, seat, [t], o = {}) {
      if (room.g.night === 1) {
        const out = room.seats.filter(s => teamOf(s) === 'outsider').map(s => s.role);
        tell(room, seat.id, out.length ? `在場的外來者：${out.map(roleName).join('、')}` : '場上沒有外來者', [],
          { src: 'godfather', f: out.length ? [{ w: '外來者' }, ...out.map(r => ({ r, named: true }))] : [{ w: '沒有外來者' }] });
        return { note: '已告知在場的外來者' };
      }
      const g = gate(room, seat, 'godfather', o);
      if (g) return g === true ? failed(room, seat, 'godfather', [t]) : g;
      const sh = tryKill(room, t, '被教父殺死');
      return { note: sh ? `想殺 ${label(room, t.id)}，但他${shieldText(sh)}` : `殺死了 ${label(room, t.id)}`, e: { k: 'act', src: 'godfather', seat: seat.id, to: [t.id], res: sh ? 'blocked' : 'kill' } };
    },
  },
  devilsadvocate: {
    choose: { count: 1, alive: true, notLast: true, prompt: '選擇一名存活的玩家（不能和上一晚相同）：如果他明天被處決，他不會死亡' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'devilsadvocate', o);
      if (g) return g === true ? failed(room, seat, 'devilsadvocate', [t]) : g;
      addEff(room, t.id, 'safe', 'devilsadvocate', tick(room) + 1);
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
      if (t.dead && !t.undead) return { note: `選了 ${label(room, t.id)}，他已經死亡` };
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
      const prev = seatById(room, room.g.pukka);
      dropEff(room, e => e.src === 'pukka');
      addEff(room, t.id, 'poison', 'pukka', FOREVER);
      room.g.pukka = t.id;
      const r = prev && prev !== t ? attack(room, seat, prev, o, 'pukka', true) : null;
      return { note: `毒了 ${label(room, t.id)}` + (r ? `；${r.note}` : ''), e: { k: 'act', src: 'pukka', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  shabaloth: {
    choose: { count: 2, prompt: '選擇兩名玩家殺死' },
    run(room, seat, picks, o = {}) {
      const g = gate(room, seat, 'shabaloth', o);
      if (g) return g === true ? failed(room, seat, 'shabaloth', picks) : g;
      const last = (room.g.shabaloth || []).map(id => seatById(room, id)).filter(s => s && s.dead);
      room.g.shabaloth = picks.map(t => t.id);
      const res = merge(picks.map(t => attack(room, seat, t, o, 'shabaloth', true)), seat, 'shabaloth', picks);
      // 上一晚選過、現在已死的人：說書人可以讓他復活（反芻）
      if (last.length) res.decide = { kind: 'regurgitate', say: '反芻誰？', prompt: '沙巴洛斯可以讓上一晚選中的一名死者復活', options: [NONE, ...seatOpts(room, last)] };
      return res;
    },
    decide: demonDecide,
  },
  po: {
    choose: (room, seat) => (room.g.poCharged
      ? { count: 3, prompt: '上次你沒有選人：今晚選擇三名玩家殺死' }
      : { count: 1, counts: [0, 1], prompt: '可以選擇一名玩家殺死（不選的話，下次可以殺三人）' }),
    run(room, seat, picks, o = {}) {
      const g = gate(room, seat, 'po', o);
      if (g) return g === true ? failed(room, seat, 'po', picks) : g;
      room.g.poCharged = picks.length === 0;
      if (!picks.length) return { note: '沒有選人，下次可以殺三人', e: { k: 'act', src: 'po', seat: seat.id, to: [], res: 'blocked' } };
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
      const g = gate(room, seat, 'snakecharmer', o);
      if (g) return g === true ? failed(room, seat, 'snakecharmer', [t]) : g;
      if (teamOf(t) !== 'demon') return { note: `選了 ${label(room, t.id)}，不是惡魔` };
      const [ra, rb, aa, ab] = [seat.role, t.role, alignOf(seat), alignOf(t)];
      changeRole(room, seat, rb, '你用舞蛇人的能力選中了惡魔，你們交換了角色和陣營', false);
      changeRole(room, t, ra, '舞蛇人選中了你，你們交換了角色和陣營', false);
      seat.align = ab; t.align = aa;
      addEff(room, t.id, 'poison', 'snakecharmer', FOREVER);
      return { note: `選中惡魔 ${label(room, t.id)}：交換角色和陣營，原惡魔中毒`, e: { k: 'act', src: 'snakecharmer', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  mathematician: {
    run(room, seat) {
      const n = (room.g.abnormal || []).filter(id => id !== seat.id).length;
      return { form: { kind: 'number', max: room.seats.length, truth: { n }, ok: [], unknown: true } };
    },
  },
  flowergirl: {
    run(room) {
      const voted = (room.g.voted || []).map(id => seatById(room, id)).filter(Boolean);
      const yes = voted.some(s => teamOf(s) === 'demon');
      return yesno(room, yes, voted.some(s => teamsAs(room, s).includes('demon') !== (teamOf(s) === 'demon')));
    },
  },
  towncrier: {
    run(room) {
      const noms = (room.g.nominators || []).map(id => seatById(room, id)).filter(Boolean);
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
      for (const s of holders) addEff(room, s.id, 'drunk', 'philosopher', FOREVER);
      changeRole(room, seat, o.role, '哲學家獲得了新的能力');
      seat.was = 'philosopher';
      // 這個角色今晚還沒輪到：排進今晚的隊列
      const at = room.g.night === 1 ? ROLES[o.role].first : ROLES[o.role].other;
      if (at > ROLES.philosopher.first && NIGHT[o.role]) { room.g.queue.push({ roleId: o.role, seatId: seat.id, at }); room.g.queue.sort((a, b) => a.at - b.at); }
      return { note: `變成${roleName(o.role)}` + (holders.length ? `；${holders.map(s => label(room, s.id)).join('、')} 醉酒` : '') };
    },
  },
  juggler: {
    skip: room => room.g.night !== 2,
    run(room) {
      return { form: { kind: 'number', max: 5, truth: { n: 0 }, ok: [], unknown: true } };
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
      return { form: { kind: 'two', team: 'demon', plain: true, roles: [d.role], allowNone: false, roleOf: { [d.id]: d.role }, mayBe: {}, noneOk: false,
        truth: { a: a.id, b: b.id, role: d.role } } };
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
      return { note: `${label(room, a.id)} 和 ${label(room, b.id)} 交換了角色` };
    },
  },
  eviltwin: {
    run(room, seat) {
      const g = room.g;
      const t = seatById(room, g.twin?.good) || pick(room.seats.filter(s => isGoodSeat(s)));
      if (!t) return { note: '場上沒有善良玩家' };
      g.twin = { evil: seat.id, good: t.id };
      const f = (s, r) => [{ w: '雙子' }, { s }, { w: '是' }, { r, named: true }];
      tell(room, seat.id, `你的雙子是 ${label(room, t.id)}【${roleName(t.role)}】`, [{ seatId: t.id, r: t.role, text: roleName(t.role) }], { src: 'eviltwin', f: f(t.id, t.role) });
      tell(room, t.id, `你和 ${label(room, seat.id)}【${roleName(seat.role)}】是鏡像雙子`, [{ seatId: seat.id, r: seat.role, text: roleName(seat.role) }], { src: 'eviltwin', f: f(seat.id, seat.role) });
      return { note: `雙子是 ${label(room, t.id)}`, e: { k: 'act', src: 'eviltwin', seat: seat.id, to: [t.id], res: 'master' } };
    },
  },
  witch: {
    skip: room => alive(room).length <= 3,
    choose: { count: 1, prompt: '選擇一名玩家詛咒：明天他發起提名就會死亡' },
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'witch', o);
      if (g) return g === true ? failed(room, seat, 'witch', [t]) : g;
      addEff(room, t.id, 'curse', 'witch', tick(room) + 1);
      return { note: `詛咒了 ${label(room, t.id)}`, e: { k: 'act', src: 'witch', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  cerenovus: {
    choose: room => ({ count: 1, roles: goodRoles(room), prompt: '選擇一名玩家和一個善良角色：他明天要瘋狂地證明自己是這個角色' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'cerenovus', o);
      if (g) return g === true ? failed(room, seat, 'cerenovus', [t]) : g;
      addEff(room, t.id, 'mad', 'cerenovus', tick(room) + 2);
      tell(room, t.id, `洗腦師選中了你：明天白天和夜晚，你要「瘋狂」地證明自己是【${roleName(o.role)}】，否則可能被處決`, [],
        { src: 'cerenovus', f: [{ w: '瘋狂', k: 'evil' }, { r: o.role, named: true }] });
      return { note: `讓 ${label(room, t.id)} 瘋狂證明自己是${roleName(o.role)}`, e: { k: 'act', src: 'cerenovus', seat: seat.id, to: [t.id], res: 'poison' } };
    },
  },
  pithag: {
    choose: room => ({ count: 1, roles: scriptRoles(room), prompt: '選擇一名玩家和一個角色：如果該角色不在場，他變成該角色' }),
    run(room, seat, [t], o = {}) {
      const g = gate(room, seat, 'pithag', o);
      if (g) return g === true ? failed(room, seat, 'pithag', [t]) : g;
      if (inPlay(room).has(o.role)) return { note: `想把 ${label(room, t.id)} 變成${roleName(o.role)}，但這個角色已在場，無事發生` };
      const before = t.role;
      changeRole(room, t, o.role, '麻臉巫婆把你變了');
      const demon = ROLES[o.role].team === 'demon';
      return { note: `把 ${label(room, t.id)} 從${roleName(before)}變成${roleName(o.role)}` + (demon ? '。創造了惡魔：今晚的死亡由你決定（點座位標記死亡）' : ''),
        e: { k: 'act', src: 'pithag', seat: seat.id, to: [t.id], res: 'master' } };
    },
  },
  fanggu: killer('fanggu', {
    // 第一次殺到外來者：他變成邪惡的方古，原方古代替他死亡
    before(room, seat, t) {
      if (teamOf(t) !== 'outsider' || room.g.fangguJumped || t.dead || room.g.protected === t.id || shieldOf(room, t, { demon: true })) return null;
      room.g.fangguJumped = true;
      changeRole(room, t, 'fanggu', '方古選中了你：你變成了邪惡的方古', false);
      t.align = 'evil';
      die(room, seat, '方古跳到外來者身上');
      return { note: `選中外來者 ${label(room, t.id)}：他變成方古，原方古死亡`, e: { k: 'act', src: 'fanggu', seat: seat.id, to: [t.id], res: 'starpass' } };
    },
  }),
  vigormortis: killer('vigormortis', {
    // 殺死的爪牙保留能力，鄰近的一名鎮民中毒
    kill(room, seat, t) {
      if (teamOf(t) !== 'minion') return;
      t.keep = true;
      const v = pick(townsfolkNeighbors(room, t));
      if (v) addEff(room, v.id, 'poison', 'vigormortis', FOREVER);
      stLog(room, `${label(room, t.id)} 是爪牙：死後保留能力` + (v ? `，鄰近的 ${label(room, v.id)} 中毒` : ''), { k: 'rule', seat: t.id, role: 'vigormortis', work: true });
    },
  }),
  nodashii: killer('nodashii'),
  vortox: killer('vortox'),
};
// 渦流在場（活著且能力正常）：鎮民的信息必須是錯的
export const vortoxOn = room => room.seats.some(s => s.role === 'vortox' && reallyAlive(s) && !impaired(room, s));

export const describeStep = (room, step) =>
  step.seatId ? `${roleName(step.roleId)} · ${label(room, step.seatId)}` : NIGHT[step.roleId]?.name || '天亮前確認';
