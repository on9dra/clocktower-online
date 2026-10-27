// 每個角色的夜晚行動：choose 描述要選幾個人；run 結算效果，信息類角色返回一張給說書人選擇的表單，
// 需要說書人裁定的（鎮長替死、小惡魔傳位）返回 decide，由 decide() 結算說書人的選擇
import { TEAMS } from '../public/js/roles.js';
import {
  shuffle, pick, seatById, label, roleName, teamOf, isEvil, aliveNeighbors, scriptRoles, teamRoles, impaired,
  teamsAs, evilAs, rolesAs, seatTags, hasDemon,
} from './util.js';
import { killSeat, becomeDemon } from './rules.js';

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
    decide: { kind: 'starpass', prompt: '小惡魔自殺了：選擇一名存活的爪牙成為新的小惡魔', options: minions.map(s => ({ id: s.id, label: `${label(room, s.id)}（${roleName(s.role)}）` })) },
  };
}

// 這名玩家今晚不會被惡魔殺死的原因（沒有則返回空）
function safeFromDemon(room, t, o = {}) {
  if (t.dead) return '已經死亡';
  if (room.g.protected === t.id) return '被僧侶保護';
  if (t.role === 'soldier' && (!impaired(room, t) || o.soldier)) return '士兵免疫';
  return '';
}
// 中毒 / 酒鬼的能力：停下來讓說書人裁定是否生效（o[role] 記下裁定結果，再重跑一次）
const why = (room, s) => (s.role === 'drunk' ? '酒鬼' : '中毒');
// 酒鬼沒有能力：同樣停下，但只有「無效」一個選項
const askAbility = (room, role, s) => ({ decide: { kind: 'ability', role, targetId: s.id, why: why(room, s),
  prompt: `${roleName(role)}${why(room, s)}：能力是否生效？`,
  options: [...(s.role === 'drunk' ? [] : [{ id: 'work', label: '生效' }]), { id: 'fail', label: '無效' }] } });

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
      return [{ seatId: demon.id, marks: minions.map(x => ({ seatId: x.id, t: 'minion', text: '爪牙' })),
        f: [{ tag: 'minion' }, ...minions.map(x => ({ s: x.id })), { op: 'br' }, { tag: 'bluff' }, ...room.g.bluffs.map(r => ({ r, named: true }))],
        text: `你的爪牙：${minions.map(x => label(room, x.id)).join('、')}。` +
        `三個不在場的善良角色（可用來偽裝）：${room.g.bluffs.map(roleName).join('、')}` }];
    },
  },
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
        return `${label(room, s.id)}：${roleName(s.role)}` + (s.role === 'drunk' ? `（以為是${roleName(s.fakeRole)}）` : '') +
          (s.dead ? '（死亡）' : '') + (tags.length ? `［${tags.join('、')}］` : '');
      });
      const grim = Object.fromEntries(room.seats.map(s => [s.id, s.role]));
      const text = '魔典：\n' + lines.join('\n') + `\n惡魔偽裝：${room.g.bluffs.map(roleName).join('、')}`;
      // 式子：每個座位的角色（死亡 / 中毒 / 酒鬼以為的身份），再加惡魔偽裝
      const f = [{ grim: room.seats.map(s => [s.id, s.role, { dead: s.dead, poison: room.g.poisoned === s.id, fake: s.fakeRole || null }]) },
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
      if (impaired(room, seat) && o.monk === undefined) return askAbility(room, 'monk', seat);
      const bad = impaired(room, seat) && !o.monk;
      if (!bad) room.g.protected = t.id;
      return { note: `保護了 ${label(room, t.id)}`, e: { k: 'act', src: 'monk', seat: seat.id, to: [t.id], res: bad ? 'fail' : 'protect' } };
    },
  },
  imp: {
    choose: { count: 1, prompt: '選擇一名玩家殺死（可以選自己）' },
    run(room, seat, [t], o = {}) {
      const who = label(room, t.id);
      const e = res => ({ k: 'act', src: 'imp', seat: seat.id, to: [t.id], res });
      if (impaired(room, seat) && o.imp === undefined) return askAbility(room, 'imp', seat);
      if (impaired(room, seat) && !o.imp) return { note: `想殺 ${who}，但${why(room, seat)}，說書人裁定無效`, e: e('fail') };
      if (room.g.protected === t.id) return { note: `想殺 ${who}，被僧侶保護`, e: { ...e('blocked'), why: 'protect' } };
      if (t === seat) return starpass(room, seat);
      if (!t.dead && room.g.protected !== t.id && t.role === 'soldier' && impaired(room, t) && o.soldier === undefined) return askAbility(room, 'soldier', t);
      const safe = safeFromDemon(room, t, o);
      if (safe) return { note: `想殺 ${who}，但他${safe}`, e: { ...e('blocked'), why: t.dead ? 'dead' : 'soldier' } };
      // 鎮長（中毒時也一樣）：說書人決定讓他死、換人死還是無人死亡
      if (t.role === 'mayor') {
        const options = [{ id: t.id, label: `讓鎮長 ${who} 死亡` },
          ...room.seats.filter(s => !s.dead && s !== t).map(s => ({ id: s.id, label: `改為 ${label(room, s.id)}（${roleName(s.role)}）死亡` })),
          { id: 'none', label: '無人死亡' }];
        return { note: `想殺鎮長 ${who}`, e: e('mayor'), decide: { kind: 'mayor', targetId: t.id, prompt: '小惡魔攻擊了鎮長：你可以讓另一名玩家代替他死亡', options } };
      }
      killSeat(room, t, '夜裏被惡魔殺死');
      return { note: `殺死了 ${who}`, e: e('kill') };
    },
    decide(room, seat, step, choice) {
      const t = seatById(room, choice);
      if (step.decide.kind === 'starpass') {
        becomeDemon(room, t, 'imp', '小惡魔把惡魔身份傳給了你');
        return { note: `${label(room, t.id)} 接任小惡魔` };
      }
      const e = (res, to) => ({ k: 'act', src: 'imp', seat: seat.id, to: to ? [to.id] : [], res });
      if (!t) return { note: '鎮長的能力：無人死亡', e: { ...e('blocked', seatById(room, step.decide.targetId)), why: 'mayor' } };
      if (t.id === step.decide.targetId) { killSeat(room, t, '夜裏被惡魔殺死'); return { note: `鎮長 ${label(room, t.id)} 死亡`, e: e('kill', t) }; }
      const safe = safeFromDemon(room, t);
      if (safe) return { note: `鎮長的能力轉移給 ${label(room, t.id)}，但他${safe}，無人死亡`, e: { ...e('blocked', t), why: 'mayor' } };
      killSeat(room, t, '代替鎮長死亡');
      return { note: `${label(room, t.id)} 代替鎮長死亡`, e: e('kill', t) };
    },
  },
  ravenkeeper: {
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
};

export const describeStep = (room, step) =>
  step.seatId ? `${roleName(step.roleId)} · ${label(room, step.seatId)}` : NIGHT[step.roleId]?.name || '天亮前確認';
