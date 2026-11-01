// 手動指定角色和偽裝（兩種模式）、手動局流程、跨劇本相剋。用法：node tests/manual.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { ROLES } from '../public/js/roles.js';
import { setup, S, ok, act, st, pl, runOnly } from './helpers.js';

const room = (n = 7, mode) => {
  const r = createRoom();
  for (let i = 0; i < n; i++) joinPlayer(r, 'p' + i, 'x' + i);
  if (mode) ok(st(r, 'mode', { mode }));
  return r;
};
const bad = (r, op, args) => assert.strictEqual(typeof st(r, op, args), 'string', op + ' 應該被拒絕');

// ───── 先指定，其餘隨機 ─────
{
  const r = room();
  const [a, b] = r.seats;
  ok(st(r, 'setRole', { seatId: a.id, roleId: 'imp' }));
  ok(st(r, 'setRole', { seatId: b.id, roleId: 'chef' }));
  assert.ok(a.pinned && !r.draft, '抽之前就能指定');
  assert.strictEqual(viewFor(r, { st: true }).seats[0].role, 'imp');
  assert.strictEqual(viewFor(r, { pid: 'p1' }).seats[0].role, undefined, '玩家看不到');
  for (let k = 0; k < 20; k++) {
    ok(st(r, 'draft'));
    assert.strictEqual(a.role, 'imp');
    assert.strictEqual(b.role, 'chef');
    assert.ok(r.seats.every(s => s.role));
    assert.strictEqual(new Set(r.seats.map(s => s.role)).size, 7, '不重複');
    assert.strictEqual(r.seats.filter(s => ROLES[s.role].team === 'demon').length, 1, '指定的惡魔佔掉名額');
  }
  // 抽完改的座位也算指定
  const c = r.seats[2];
  ok(st(r, 'setRole', { seatId: c.id, roleId: 'monk' }));
  ok(st(r, 'draft'));
  assert.strictEqual(c.role, 'monk');
  // 恢復隨機：抽好時角色先留著，下次抽才換
  ok(st(r, 'unpin', { seatId: c.id }));
  assert.ok(!c.pinned && c.role === 'monk');
  // 有人加入：抽的作廢，指定的留著
  joinPlayer(r, 'p9', 'new');
  assert.ok(!r.draft);
  assert.strictEqual(a.role, 'imp');
  assert.strictEqual(c.role, null);
  // 沒抽時恢復隨機就是空座位
  ok(st(r, 'unpin', { seatId: b.id }));
  assert.strictEqual(b.role, null);
  // 換劇本：指定的也清掉
  ok(st(r, 'script', { scriptId: 'bmr' }));
  assert.ok(r.seats.every(s => !s.role && !s.pinned));
}
// 全部指定完不用再抽；指定的配比不對也能開
{
  const r = room(5);
  const list = ['imp', 'poisoner', 'spy', 'baron', 'scarletwoman'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: list[i] })));
  assert.ok(r.draft, '全部指定完直接可以確認開局');
  assert.strictEqual(r.g.bluffs.length, 3);
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  assert.ok(r.seats.every((s, i) => s.role === list[i]));
}
// 超額指定：空座位比名額少時不報錯，先留邪惡
{
  const r = room(7);
  ['chef', 'monk', 'empath', 'virgin', 'slayer', 'mayor'].forEach((id, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: id })));
  ok(st(r, 'draft'));
  assert.ok(['minion', 'demon'].includes(ROLES[r.seats[6].role].team));
}
// 智能推進必須有惡魔，手動局不用
{
  const list = ['chef', 'monk', 'empath', 'virgin', 'slayer'];
  const a = room(5), b = room(5, 'manual');
  for (const r of [a, b]) r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: list[i] })));
  assert.strictEqual(st(a, 'next'), '場上至少要有一名惡魔');
  ok(st(b, 'next'));
  assert.ok(b.g.manual);
}

// ───── 惡魔偽裝 ─────
{
  const r = room();
  ok(st(r, 'draft'));
  const inPlay = r.seats.map(s => s.role).find(id => ['townsfolk', 'outsider'].includes(ROLES[id].team) && id !== 'drunk');
  const free = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor'].filter(id => !r.seats.some(s => s.role === id || s.fakeRole === id));
  bad(r, 'setBluff', { i: 0, roleId: inPlay });
  bad(r, 'setBluff', { i: 0, roleId: 'imp' });
  bad(r, 'setBluff', { i: 3, roleId: free[0] });
  const pick = free.find(id => !r.g.bluffs.includes(id)) || free[0];
  const keep = r.g.bluffs.slice(1);
  ok(st(r, 'setBluff', { i: 0, roleId: pick }));
  assert.strictEqual(r.g.bluffs[0], pick);
  assert.deepStrictEqual(r.g.bluffs.slice(1), keep, '別的格子不換');
  // 撞上在場角色：智能推進自動換掉
  ok(st(r, 'setRole', { seatId: r.seats[0].id, roleId: pick }));
  assert.ok(!r.g.bluffs.includes(pick));
  assert.strictEqual(r.g.bluffs.length, 3);
  assert.ok(!r.bluffPins.includes(pick));
  // 手動局：什麼都能指定，也不換
  const m = room(7, 'manual');
  ok(st(m, 'draft'));
  const here = m.seats.find(x => x.role !== 'imp').role;
  ok(st(m, 'setBluff', { i: 1, roleId: here }));
  ok(st(m, 'setBluff', { i: 2, roleId: 'imp' }));
  assert.deepStrictEqual(m.g.bluffs.slice(1), [here, 'imp']);
  ok(st(m, 'setRole', { seatId: m.seats[1].id, roleId: 'imp' }));
  assert.strictEqual(m.g.bluffs[2], 'imp', '手動局不換');
  // 恢復隨機
  ok(st(m, 'setBluff', { i: 2 }));
  assert.notStrictEqual(m.bluffPins[2], 'imp');
  bad(room(), 'setBluff', { i: 0, roleId: 'chef' }); // 抽之前沒有偽裝
}

// ───── 手動局流程 ─────
function manualGame(roles = ['imp', 'poisoner', 'chef', 'monk', 'virgin', 'slayer', 'butler']) {
  const r = room(roles.length, 'manual');
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  ok(st(r, 'next'));
  return r;
}
{
  // 開局：沒有順序、沒有結算，整夜停在核對卡
  const r = manualGame(), [imp, poisoner, chef, monk, virgin, slayer, butler] = r.seats;
  assert.strictEqual(r.phase, 'night');
  assert.strictEqual(r.g.step.status, 'review');
  assert.deepStrictEqual(r.g.queue, []);
  assert.strictEqual(r.g.redHerring, null);
  const pv = viewFor(r, { pid: chef.pid }), sv = viewFor(r, { st: true });
  assert.ok(pv.manual && sv.manual);
  assert.strictEqual(pv.prog, null, '玩家看不到夜晚進度');
  assert.strictEqual(pv.myRole, 'chef');
  assert.ok(sv.st.hand.ref.some(x => x.r === 'chef' && x.seats.includes(chef.id)), '參考表有持有者');
  assert.ok(!sv.st.hand.ref.some(x => x.r === 'monk'), '僧侶首夜不醒，不在首夜表裏');
  const order = sv.st.hand.ref.map(x => x.r);
  assert.ok(order.indexOf('poisoner') < order.indexOf('chef'), '官方順序');
  ok(st(r, 'tick', { roleId: 'chef' }));
  assert.ok(viewFor(r, { st: true }).st.hand.ref.find(x => x.r === 'chef').done);
  ok(st(r, 'tick', { roleId: 'chef' }));

  // 選人牌：只有他看得到，答案只回給說書人，沒有任何效果
  ok(st(r, 'card', { seatId: poisoner.id, count: 1, text: '毒誰' }));
  const p = viewFor(r, { pid: poisoner.pid }).prompt;
  assert.ok(p.manual);
  assert.strictEqual(p.prompt, '毒誰');
  assert.strictEqual(p.count, 1);
  assert.strictEqual(viewFor(r, { pid: chef.pid }).prompt, null);
  assert.strictEqual(applyPlayerAction(r, chef.pid, { act: 'pick', ids: [imp.id] }), '現在不需要選擇');
  assert.ok(applyPlayerAction(r, poisoner.pid, { act: 'pick', ids: [] }), '人數不對');
  ok(applyPlayerAction(r, poisoner.pid, { act: 'pick', ids: [chef.id] }));
  assert.strictEqual(viewFor(r, { pid: poisoner.pid }).prompt, null);
  const c = viewFor(r, { st: true }).st.hand.cards[0];
  assert.ok(c.done);
  assert.deepStrictEqual(c.ids, [chef.id]);
  assert.strictEqual(r.g.poisoned, null, '不結算');
  assert.ok(r.chat.some(m => m.to === poisoner.id && m.k === 'act'), '玩家面板記一筆');
  assert.ok(!r.chat.some(m => m.to === chef.id && m.k === 'act'));
  // 帶角色、可不選的牌；說書人代選
  ok(st(r, 'card', { seatId: monk.id, count: 1, role: true, optional: true }));
  assert.deepStrictEqual(viewFor(r, { pid: monk.pid }).prompt.counts, [0, 1]);
  assert.ok(st(r, 'cardPick', { seatId: monk.id, ids: [chef.id], role: 'nosuch' }));
  ok(st(r, 'cardPick', { seatId: monk.id, ids: [], role: null }));
  bad(r, 'card', { seatId: monk.id, count: 0 });
  bad(r, 'card', { seatId: 'nosuch', count: 1 });
  bad(r, 'card', { seatId: monk.id, count: 9 });
  ok(st(r, 'card', { seatId: monk.id, count: 2 }));
  ok(st(r, 'cardDrop', { seatId: monk.id }));
  assert.strictEqual(viewFor(r, { pid: monk.pid }).prompt, null);

  // 拼信息：玩家面板是式子，座位上標角色；不認識的項丟掉
  ok(st(r, 'inform', { seatId: chef.id, terms: [{ s: imp.id }, { w: '或' }, { s: monk.id }, { w: '是' }, { r: 'imp' }, { n: 3 }, { x: 1 }, { s: 'nosuch' }] }));
  const m = r.chat.findLast(x => x.to === chef.id);
  assert.ok(m.info);
  assert.strictEqual(m.f.length, 6);
  assert.deepStrictEqual(m.marks.map(k => [k.seatId, k.r, k.q]), [[imp.id, 'imp', true], [monk.id, 'imp', true]]);
  ok(st(r, 'inform', { seatId: chef.id, terms: [{ s: monk.id }, { r: 'monk' }] }));
  assert.strictEqual(r.chat.findLast(x => x.to === chef.id).marks[0].q, false, '一個座位一個角色是確定的');
  bad(r, 'inform', { seatId: chef.id, terms: [] });
  bad(r, 'inform', { seatId: chef.id, terms: 'x' });

  // 首夜互認：按了才發，發過不再發
  assert.ok(!r.chat.some(x => x.to === imp.id && x.f?.some(t => t.tag)));
  ok(st(r, 'evilInfo'));
  assert.ok(r.chat.some(x => x.to === imp.id && x.f?.some(t => t.tag === 'bluff')));
  assert.ok(r.chat.some(x => x.to === poisoner.id && x.f?.some(t => t.s === imp.id)));
  assert.deepStrictEqual(viewFor(r, { pid: imp.pid }).bluffs, r.g.bluffs);
  bad(r, 'evilInfo');

  // 提醒標記：只有說書人看得到，點一下取下
  ok(st(r, 'remind', { seatId: chef.id, text: '中毒', on: true }));
  ok(st(r, 'remind', { seatId: chef.id, text: '中毒', on: true }));
  assert.deepStrictEqual(viewFor(r, { st: true }).seats[2].tags, ['中毒']);
  assert.strictEqual(viewFor(r, { pid: chef.pid }).seats[2].tags, undefined);
  ok(st(r, 'remind', { seatId: chef.id, text: '中毒', on: false }));
  assert.deepStrictEqual(viewFor(r, { st: true }).seats[2].tags, []);
  assert.ok(viewFor(r, { st: true }).st.hand.reminders.some(x => x.r === 'poisoner'), '在場角色的標記');

  // 玩家看到的角色
  ok(st(r, 'setShown', { seatId: butler.id, roleId: 'mayor' }));
  assert.strictEqual(viewFor(r, { pid: butler.pid }).myRole, 'mayor');
  assert.strictEqual(viewFor(r, { st: true }).seats[6].role, 'butler');
  assert.ok(r.chat.some(x => x.to === butler.id && x.text.includes('鎮長')), '私下通知');
  bad(r, 'setShown', { seatId: butler.id, roleId: 'nosuch' });

  // 夜裏點死人：天亮才公佈
  ok(st(r, 'setDead', { seatId: monk.id, dead: true }));
  assert.ok(!viewFor(r, { pid: chef.pid }).seats[3].dead);
  ok(st(r, 'dawn'));
  assert.strictEqual(r.phase, 'day', '手動局不判勝負，直接進白天');
  assert.ok(viewFor(r, { pid: chef.pid }).seats[3].dead);
  assert.ok(r.chat.some(x => x.e?.k === 'dawn' && x.e.deaths.includes(monk.id)));

  // 白天：沒有角色規則。貞潔者不反噬，獵手開不了槍
  assert.ok(applyPlayerAction(r, slayer.pid, { act: 'slay', targetId: imp.id }));
  ok(applyPlayerAction(r, chef.pid, { act: 'nominate', targetId: virgin.id }));
  assert.ok(!r.g.virginCheck);
  for (const s of r.seats) applyPlayerAction(r, s.pid, { act: 'vote', up: true });
  ok(st(r, 'closeVote'));
  assert.ok(!chef.dead);
  ok(st(r, 'next'));
  assert.ok(virgin.dead, '處決的人默認死亡');
  assert.strictEqual(r.phase, 'night');
  assert.deepStrictEqual(r.g.cards, []);
  bad(r, 'evilInfo'); // 第二夜沒有互認
  ok(st(r, 'dawn'));
  // 惡魔死了系統也不判
  ok(st(r, 'execute', { seatId: imp.id }));
  assert.ok(imp.dead);
  assert.strictEqual(r.phase, 'day');
  // 白天點死人當場公佈
  ok(st(r, 'setDead', { seatId: butler.id, dead: true }));
  assert.ok(r.chat.some(x => x.e?.k === 'slayhit' && x.e.seat === butler.id));
  // 改陣營影響誰贏，積分照常
  ok(st(r, 'setAlign', { seatId: chef.id, align: 'evil' }));
  bad(r, 'setAlign', { seatId: chef.id, align: 'x' });
  ok(st(r, 'win', { team: 'evil' }));
  assert.strictEqual(r.phase, 'ended');
  assert.ok(r.result.winners.includes(chef.pid));
  assert.ok(r.result.winners.includes(imp.pid));
  assert.ok(!r.result.winners.includes(monk.pid));
  assert.ok(r.players[chef.pid].wins === 1);
  assert.ok(r.mvp);
  // 再來一局：模式留著，指定的清掉
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'lobby');
  assert.strictEqual(viewFor(r, { st: true }).mode, 'manual');
  assert.ok(r.seats.every(s => !s.role && !s.pinned));
}
// 說書人替人提名：等於玩家自己提名，限制一樣
{
  const r = manualGame();
  const [a, b, c] = r.seats;
  bad(r, 'nominate', { fromId: a.id, toId: b.id }); // 夜裏不行
  ok(st(r, 'dawn'));
  bad(r, 'nominate', { fromId: a.id, toId: 'x' });
  ok(st(r, 'nominate', { fromId: a.id, toId: b.id }));
  assert.deepStrictEqual([r.nomination.nominatorId, r.nomination.nomineeId], [a.id, b.id]);
  bad(r, 'nominate', { fromId: c.id, toId: a.id }); // 投票中
  ok(st(r, 'cancelVote'));
  ok(st(r, 'nominate', { fromId: a.id, toId: b.id }));
  ok(st(r, 'closeVote'));
  bad(r, 'nominate', { fromId: a.id, toId: c.id }); // 今天提名過
  bad(r, 'nominate', { fromId: c.id, toId: b.id }); // 今天被提名過
  ok(st(r, 'setDead', { seatId: c.id, dead: true }));
  bad(r, 'nominate', { fromId: c.id, toId: a.id }); // 死人不能提名
}
// 智能推進局用不了手動局的操作；開局後不能換模式
{
  const r = room(7);
  ok(st(r, 'next'));
  bad(r, 'nominate', { fromId: r.seats[0].id, toId: r.seats[1].id });
  bad(r, 'card', { seatId: r.seats[0].id, count: 1 });
  bad(r, 'remind', { seatId: r.seats[0].id, text: 'x', on: true });
  bad(r, 'setShown', { seatId: r.seats[0].id, roleId: 'imp' });
  bad(r, 'mode', { mode: 'manual' });
  bad(room(7), 'setShown', { seatId: 'x', roleId: 'imp' });
}
// 切回智能推進：只有酒鬼、瘋子留著假身份
{
  const r = room(7, 'manual');
  ok(st(r, 'draft'));
  const s = r.seats.find(x => x.role !== 'drunk' && x.role !== 'imp');
  ok(st(r, 'setShown', { seatId: s.id, roleId: 'imp' }));
  assert.strictEqual(s.fakeRole, 'imp');
  assert.ok(s.pinned);
  ok(st(r, 'mode', { mode: 'auto' }));
  assert.strictEqual(s.fakeRole, null);
}

// ───── 跨劇本的相剋 ─────
{
  // 方古跳到外來者：已經有新惡魔，紅唇女郎不接任
  const r = setup(['fanggu', 'scarletwoman', 'saint', 'chef', 'monk', 'empath', 'mayor']);
  const old = S(r, 'fanggu'), saint = S(r, 'saint');
  await runOnly(r, 'fanggu', 2);
  act(r, 'fanggu', [saint.id]);
  assert.ok(old.dead);
  assert.strictEqual(saint.role, 'fanggu');
  assert.strictEqual(S(r, 'scarletwoman').role, 'scarletwoman');
}
{
  // 被麻臉巫婆變成莽夫的邪惡玩家：被善良玩家選中也不轉善
  const r = setup(['pithag', 'imp', 'poisoner', 'chef', 'monk', 'empath', 'mayor']);
  const t = S(r, 'poisoner');
  r.scriptId = 'custom'; r.script = { roles: [...r.seats.map(x => x.role), 'goon'] };
  await runOnly(r, 'pithag', 2);
  ok(applyPlayerAction(r, S(r, 'pithag').pid, { act: 'pick', ids: [t.id], role: 'goon' }));
  assert.strictEqual(t.role, 'goon');
  r.g.step = null;
  await runOnly(r, 'monk', 2);
  act(r, 'monk', [t.id]);
  assert.strictEqual(t.align, 'evil');
}
{
  // 侍女能得知數學家今晚會不會醒
  const r = setup(['imp', 'poisoner', 'chambermaid', 'mathematician', 'monk', 'empath', 'mayor']);
  r.g.woke = [];
  await runOnly(r, 'chambermaid', 2);
  act(r, 'chambermaid', [S(r, 'mathematician').id, S(r, 'monk').id]);
  assert.strictEqual(r.g.step.form.truth.n, 1);
}
{
  // 隱士可能被賢者當作惡魔
  const r = setup(['imp', 'poisoner', 'sage', 'recluse', 'monk', 'empath', 'mayor']);
  const sage = S(r, 'sage'), recluse = S(r, 'recluse');
  r.g.sageDue = { [sage.id]: S(r, 'imp').id };
  await runOnly(r, 'sage', 2);
  const f = r.g.step.form;
  assert.deepStrictEqual(f.mayBe[recluse.id], ['imp']);
  ok(st(r, 'confirm', { fields: { a: recluse.id, b: S(r, 'monk').id, role: 'imp' } }));
}
{
  // 被亡骨魔殺死、保留能力的主謀：亡骨魔被處決時仍然有效
  const r = setup(['vigormortis', 'mastermind', 'chef', 'monk', 'empath', 'mayor', 'soldier']);
  const mm = S(r, 'mastermind'), demon = S(r, 'vigormortis');
  await runOnly(r, 'vigormortis', 2);
  act(r, 'vigormortis', [mm.id]);
  assert.ok(mm.dead && mm.keep);
  r.g.step = null; r.g.queue = [];
  r.phase = 'day';
  ok(st(r, 'execute', { seatId: demon.id }));
  assert.notStrictEqual(r.phase, 'ended', '主謀讓遊戲再進行一夜一天');
  assert.ok(r.g.mastermindDay);
}
{
  // 只剩一個人活著的深夜：共情者不崩潰
  const r = setup(['imp', 'empath', 'chef', 'monk', 'mayor', 'soldier', 'saint']);
  for (const s of r.seats) if (s.role !== 'empath') s.dead = true;
  await runOnly(r, 'empath', 2);
  assert.strictEqual(r.g.step.form.truth.n, 0);
}
{
  // 祖母只在首夜得知孫子
  const r = setup(['imp', 'grandmother', 'chef', 'monk', 'mayor', 'soldier', 'saint']);
  assert.strictEqual(ROLES.grandmother.other, 0);
  assert.strictEqual(ROLES.grandmother.first, 40);
  void r;
}
{
  // 渦流 + 隱士：是非題兩個答案都合規時發得出去
  const r = setup(['vortox', 'poisoner', 'fortuneteller', 'recluse', 'monk', 'empath', 'mayor']);
  await runOnly(r, 'fortuneteller', 2);
  act(r, 'fortuneteller', [S(r, 'recluse').id, S(r, 'monk').id]);
  const f = r.g.step.form;
  assert.ok(f.vortox && f.alt);
  ok(st(r, 'confirm', { fields: { yes: true } }));
}
console.log('手動指定、手動局、相剋測試通過 ✔');
process.exit(0);
