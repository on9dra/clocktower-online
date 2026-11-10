// 線下局：系統判規則，說書人當面主持、替玩家點。單設備的座位是名字，多設備的玩家手機只看身份和信息。用法：node tests/offline.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer, WATCH, undoOf } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { autoPicks } from '../lib/engine.js';
import { ok, st } from './helpers.js';

const bad = (r, op, args) => assert.strictEqual(typeof st(r, op, args), 'string', op + ' 應該被拒絕');

// 選線下單設備、加名字、手機只能觀戰
{
  const r = createRoom();
  bad(r, 'addSeats', { names: ['甲'] }); // 線上局不能直接加名字
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: ['甲', '乙', ' ', '丙'] }));
  assert.deepStrictEqual(r.seats.map(s => s.name), ['甲', '乙', '丙']);
  assert(r.seats.every(s => s.local && s.pid.startsWith('local:')));
  assert.strictEqual(joinPlayer(r, 'phone', '路人'), WATCH);
  bad(r, 'venue', { venue: 'online' }); // 座位上有人了
  bad(r, 'addSeats', { names: Array.from({ length: 13 }, (_, i) => 'x' + i) }); // 超過 15 人
  ok(st(r, 'renameSeat', { seatId: r.seats[0].id, name: '阿甲' }));
  assert.strictEqual(r.seats[0].name, '阿甲');
  ok(st(r, 'kick', { seatId: r.seats[2].id }));
  assert.strictEqual(r.banned?.length || 0, 0); // 線下座位移除不記黑名單
  const v = viewFor(r, { st: true });
  assert.strictEqual(v.venue, 'offline');
  assert(v.oneDevice && v.offline);
  assert(v.seats.every(s => s.local));
  console.log('單設備房間 ✔');
}

// 單設備開局：不假裝叫醒；首夜爪牙 / 惡魔信息停下來等說書人；代點不用再確認；舉手計票；撤銷
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: '一 二 三 四 五 六 七'.split(' ') }));
  const roles = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'soldier'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'night');
  assert(r.g.noPretend, '線下不假裝叫醒');
  const step = () => r.g.step;
  // 互認：卡上只寫誰是惡魔、誰是爪牙
  assert.deepStrictEqual([step().roleId, step().status], ['minioninfo', 'ack']);
  assert.deepStrictEqual(step().lines.map(l => [l.seatId, l.demon, l.minions]), [[r.seats[1].id, r.seats[0].id, [r.seats[1].id]]]);
  ok(st(r, 'ack'));
  // 偽裝：單獨一步，整屏給惡魔看
  assert.deepStrictEqual([step().roleId, step().status], ['demoninfo', 'ack']);
  assert.strictEqual(step().lines[0].seatId, r.seats[0].id);
  assert.strictEqual(step().lines[0].bluffs.length, 3, '惡魔信息帶偽裝');
  assert.deepStrictEqual(step().lines[0].minions, [r.seats[1].id]);
  ok(st(r, 'ack'));
  // 投毒者：說書人代點，點完直接到下一位
  assert.deepStrictEqual([step().roleId, step().status], ['poisoner', 'choose']);
  ok(st(r, 'pick', { ids: [r.seats[2].id] }));
  assert.notStrictEqual(step().roleId, 'poisoner', '代點完不用再確認');
  for (let k = 0; r.phase === 'night' && k < 30; k++) {
    const s = step();
    if (s.status === 'choose') ok(st(r, 'pick', autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'ack'));
  }
  if (r.phase === 'dawn') ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'day');
  ok(st(r, 'nominate', { fromId: r.seats[2].id, toId: r.seats[0].id }));
  assert(r.nomination.hand && r.nomination.paused != null, '線下沒有倒數');
  for (const s of r.seats.slice(2, 6)) ok(st(r, 'handVote', { seatId: s.id, v: 'yes' }));
  ok(st(r, 'handVote', { seatId: r.seats[5].id, v: null })); // 放下
  assert.strictEqual(Object.values(r.nomination.votes).filter(Boolean).length, 3);
  // 撤銷：剛才的放下撤掉，第 6 位的手又舉著
  assert.strictEqual(undoOf(r), 'handVote');
  ok(st(r, 'undo'));
  assert.strictEqual(Object.values(r.nomination.votes).filter(Boolean).length, 4);
  ok(st(r, 'closeVote'));
  assert.strictEqual(r.history.at(-1).count, 4);
  // 處決後撤銷：人回來，今天還能處決
  const imp = r.seats[0];
  ok(st(r, 'execute', { seatId: imp.id }));
  assert(imp.dead && r.phase === 'ended', '惡魔被處決，遊戲結束');
  ok(st(r, 'undo'));
  assert(!r.seats[0].dead && !r.g.dayOver && r.phase === 'day'); // 撤銷換回的是整份狀態，座位是新的對象
  console.log('單設備開局、代點、計票和撤銷 ✔');
}

// 單設備有瘋子：惡魔那一行之後是瘋子那一行（假爪牙、假偽裝），惡魔知道誰是瘋子
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'script', { scriptId: 'bmr' }));
  ok(st(r, 'addSeats', { names: '一 二 三 四 五 六 七'.split(' ') }));
  const roles = ['zombuul', 'godfather', 'lunatic', 'sailor', 'chambermaid', 'innkeeper', 'gambler'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  ok(st(r, 'next'));
  const [demon, minion, luna] = r.seats;
  assert.deepStrictEqual(r.g.step.lines.map(l => [l.seatId, l.demon]), [[minion.id, demon.id]], '瘋子不參加互認');
  ok(st(r, 'ack'));
  const [d, l] = r.g.step.lines;
  assert.deepStrictEqual([r.g.step.roleId, d.seatId, d.lunatic, l.seatId, l.lunatic], ['demoninfo', demon.id, false, luna.id, true]);
  assert.strictEqual(l.minions.length, 1, '瘋子看到的假爪牙和真爪牙一樣多');
  assert.ok(!l.minions.includes(luna.id));
  assert.strictEqual(l.bluffs.length, 3, '瘋子也有三個偽裝');
  assert.ok(d.f.some(t => t.s === luna.id) && d.f.some(t => t.r === 'lunatic'), '惡魔得知誰是瘋子');
  console.log('單設備首夜有瘋子 ✔');
}

// 單設備：占卜師這類查驗，點完人停在結果卡上（整屏提示該告訴他什麼），說書人點「下一個」才結束；被查的人掛「誰查過」的標記，日誌記下結果
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: '一 二 三 四 五'.split(' ') }));
  ['imp', 'fortuneteller', 'chef', 'empath', 'monk'].forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
  ok(st(r, 'next'));
  for (let k = 0; r.g.step.roleId !== 'fortuneteller' && k < 20; k++) {
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else ok(st(r, 'ack'));
  }
  const [imp, , chef] = r.seats;
  ok(st(r, 'pick', { ids: [imp.id, chef.id] }));
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status, r.g.step.form.truth.yes], ['fortuneteller', 'confirm', true], '點完停在結果卡上，答案預填好');
  assert.ok(r.g.marks[imp.id].includes('占卜師查') && r.g.marks[chef.id].includes('占卜師查'));
  ok(st(r, 'confirm', { fields: r.g.step.form.truth }));
  assert.notStrictEqual(r.g.step?.roleId, 'fortuneteller', '點了下一個才往下走');
  assert.ok(r.g.log.some(l => l.e?.k === 'info' && l.e.src === 'fortuneteller'), '日誌記下結果');
  // 第二晚再查：標記只掛在最近查的人身上
  const [, ft, , empath, monk] = r.seats;
  for (let k = 0; r.phase !== 'ended' && !(r.phase === 'night' && r.g.step?.roleId === 'fortuneteller') && k < 40; k++) {
    if (r.phase === 'day' || r.phase === 'dawn') { ok(st(r, 'next')); continue; }
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', s.roleId === 'imp' ? { ids: [monk.id] } : autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'ack'));
  }
  // 中毒（說書人改的）時停在信息卡上，說書人自己挑錯誤的比劃給他
  ok(st(r, 'setPoison', { seatId: ft.id, on: true }));
  ok(st(r, 'pick', { ids: [empath.id, chef.id] }));
  assert.strictEqual(r.g.step.roleId, 'fortuneteller', '中毒時停下來');
  assert.strictEqual(r.g.step.status, 'confirm');
  assert.ok(!r.g.marks[imp.id].includes('占卜師查'), '之前查過的人摘掉標記');
  assert.ok(r.g.marks[empath.id].includes('占卜師查'));
  ok(st(r, 'confirm', { fields: { yes: !r.g.step.form.truth.yes } }));
  console.log('單設備查驗點完停在結果卡 ✔');
}

// 單設備沒有 MVP 投票；雜耍藝人猜獲得能力的哲學家是哲學家才算對
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: '一 二 三 四 五'.split(' ') }));
  ['imp', 'fortuneteller', 'chef', 'empath', 'monk'].forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
  ok(st(r, 'next'));
  for (let k = 0; r.phase !== 'day' && k < 30; k++) {
    if (r.phase === 'dawn') { ok(st(r, 'next')); continue; }
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'ack'));
  }
  ok(st(r, 'execute', { seatId: r.seats[0].id }));
  assert.strictEqual(r.phase, 'ended');
  assert.strictEqual(r.mvp, null, '單設備不開 MVP 投票');
  console.log('單設備沒有 MVP ✔');
}

// 多設備：玩家手機看身份和信息，不彈選人牌、不能投票；說書人代點
{
  const r = createRoom();
  for (let i = 0; i < 7; i++) joinPlayer(r, 'p' + i, 'n' + i);
  ok(st(r, 'venue', { venue: 'offline', devices: 'many' }));
  const roles = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'soldier'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  ok(st(r, 'next'));
  const poisoner = r.seats[1];
  assert.ok(viewFor(r, { pid: 'p1' }).myRole === 'poisoner', '手機上看得到自己的角色');
  // 爪牙 / 惡魔信息發到手機上，和線上一樣不停下來：第一步就是投毒者
  assert.deepStrictEqual([r.g.step.roleId, r.g.step.status], ['poisoner', 'choose'], '多設備首夜互認不停');
  assert.ok(r.chat.some(m => m.to === poisoner.id && m.src === 'minioninfo'), '爪牙信息發到爪牙手機');
  assert.ok(r.chat.some(m => m.to === r.seats[0].id && m.src === 'demoninfo'), '惡魔信息（含偽裝）發到惡魔手機');
  assert.strictEqual(r.g.step.seatId, poisoner.id);
  assert.strictEqual(viewFor(r, { pid: 'p1' }).prompt, null, '手機不彈選人牌');
  assert.strictEqual(typeof applyPlayerAction(r, 'p1', { act: 'pick', ids: [r.seats[2].id] }), 'string', '線下夜裏手機不能自己選');
  ok(st(r, 'pick', { ids: [r.seats[2].id] }));
  // 共情者的信息確認後發到他手機
  for (let k = 0; r.g.step.roleId !== 'empath' && k < 20; k++) {
    const s = r.g.step;
    if (s.status === 'choose') ok(st(r, 'pick', autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else ok(st(r, 'ack'));
  }
  ok(st(r, 'confirm', { fields: r.g.step.form.truth }));
  assert.ok(r.chat.some(m => m.to === r.seats[3].id && m.info && m.src === 'empath'), '信息發到共情者手機');
  console.log('多設備 ✔');
}

// 線上局沒有撤銷，也不能替人舉手、代人開槍
{
  const r = createRoom();
  for (let i = 0; i < 5; i++) joinPlayer(r, 'p' + i, 'n' + i);
  bad(r, 'undo');
  assert.strictEqual(undoOf(r), null);
  bad(r, 'slayFor', { fromId: r.seats[0].id, toId: r.seats[1].id });
  console.log('線上局不受影響 ✔');
}

// 單設備：夜裏私下告訴別人的事（小惡魔傳位給爪牙）停下來，卡上列著要叫醒誰給他看
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'seatCount', { n: 7 }));
  ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint', 'soldier'].forEach((x, i) => ok(st(r, 'setRole', { seatId: r.seats[i].id, roleId: x })));
  ok(st(r, 'next'));
  const [imp, poisoner] = r.seats;
  for (let k = 0; !(r.phase === 'night' && r.g.night === 2 && r.g.step?.roleId === 'imp') && k < 60; k++) {
    if (r.phase === 'day' || r.phase === 'dawn') { ok(st(r, 'next')); continue; }
    const s = r.g.step;
    // 投毒、僧侶的目標定死：僧侶要是保護了小惡魔，他自殺就不成立
    if (s.status === 'choose') ok(st(r, 'pick', s.roleId === 'poisoner' ? { ids: [r.seats[2].id] } : s.roleId === 'monk' ? { ids: [r.seats[5].id] } : autoPicks(r, s)));
    else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth }));
    else if (s.status === 'review') ok(st(r, 'dawn'));
    else ok(st(r, 'ack'));
  }
  assert.strictEqual(r.g.step.roleId, 'imp');
  ok(applyStOp(r, { op: 'pick', ids: [imp.id] })); // 小惡魔殺自己，爪牙接任（helpers 的 st 選完人會順手確認，這裏不能用）
  assert.strictEqual(r.g.step.status, 'ack', '停下來讓說書人叫醒新惡魔');
  assert.deepStrictEqual(r.g.step.told.map(t => t.seatId), [poisoner.id]);
  assert.ok(r.g.step.told[0].f.some(t => t.r === 'imp'), '給他看小惡魔');
  ok(st(r, 'ack'));
  console.log('單設備私下告訴的事停下來給他看 ✔');
}

// 占卜師：紅鯡魚可以是占卜師本人；選完人等告知時改紅鯡魚，答案跟著重算；選了隱士時「是」也合規（alt）
{
  const r = createRoom();
  ok(st(r, 'venue', { venue: 'offline', devices: 'one' }));
  ok(st(r, 'addSeats', { names: '一 二 三 四 五 六 七'.split(' ') }));
  const roles = ['imp', 'poisoner', 'fortuneteller', 'recluse', 'monk', 'saint', 'soldier'];
  r.seats.forEach((s, i) => ok(st(r, 'setRole', { seatId: s.id, roleId: roles[i] })));
  const [, , ft, rec, , , sol] = r.seats;
  ok(st(r, 'setRedHerring', { seatId: ft.id }));
  ok(st(r, 'setRole', { seatId: sol.id, roleId: 'soldier' }));
  assert.strictEqual(r.g.redHerring, ft.id, '紅鯡魚可以是占卜師本人，改別的角色不會被換掉');
  ok(st(r, 'next'));
  for (let k = 0; r.phase === 'night' && k < 20; k++) {
    const s = r.g.step;
    if (s.roleId === 'fortuneteller' && s.status === 'choose') { ok(st(r, 'pick', { ids: [rec.id, sol.id] })); break; }
    if (s.roleId === 'poisoner' && s.status === 'choose') { ok(st(r, 'pick', { ids: [r.seats[5].id] })); continue; } // 毒聖徒：隱士中毒就不能登記
    if (s.status === 'choose') ok(st(r, 'pick', autoPicks(r, s))); else if (s.status === 'confirm') ok(st(r, 'confirm', { fields: s.form.truth })); else ok(st(r, 'ack'));
  }
  const f = r.g.step.form;
  assert.deepStrictEqual([f.truth.yes, f.alt], [false, true], '隱士可以登記成惡魔：兩個答案都合規');
  ok(st(r, 'setRedHerring', { seatId: sol.id }));
  assert.strictEqual(r.g.step.form.truth.yes, true, '改了紅鯡魚，答案重算');
  assert.strictEqual(st(r, 'setRedHerring', { seatId: r.seats[0].id }), '紅鯡魚必須是善良玩家');
  console.log('占卜師紅鯡魚 ✔');
}
