// 線下多設備的投票：玩家在自己手機上舉手 / 放下，說書人也能替他點，說書人結算。用法：node tests/handvote.test.js
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-hand-'));
process.env.BOTC_DEBUG = '1'; // 機器人舉手那一段要用
const { applyStOp, applyPlayerAction, undoOf } = await import('../lib/ops.js');
const { viewFor } = await import('../lib/view.js');
const { botStep, setPresence } = await import('../lib/debug.js');
const store = await import('../lib/store.js');
const { setup, ok, S } = await import('./helpers.js');

const st = (r, op, args = {}) => applyStOp(r, { op, ...args });
const pl = (r, seat, v) => applyPlayerAction(r, seat.pid, { act: 'vote', v });
const up = r => r.seats.filter(s => r.nomination.votes[s.id]).map(s => s.role);
const seen = r => Math.max(0, ...Object.values(viewFor(r, { st: true }).nomination.own || {})); // 說書人屏幕上最後看到的改手時刻
// 線下多設備的一局，停在第一個白天
function day(roles, devices = 'many') {
  const r = setup(roles);
  Object.assign(r.settings, { venue: 'offline', devices, chosen: true });
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'day');
  return r;
}
const nom = (r, from, to) => ok(st(r, 'nominate', { fromId: S(r, from).id, toId: S(r, to).id }));

// 玩家自己舉手 / 放下，可以反覆改；沒有棄權；被提名者自己也能舉；舉手是公開的
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  nom(r, 'chef', 'imp');
  assert(r.nomination.hand, '線下：舉手計票');
  ok(pl(r, S(r, 'chef'), 'yes'));
  ok(pl(r, S(r, 'empath'), 'yes'));
  ok(pl(r, S(r, 'imp'), 'yes')); // 被提名者
  ok(pl(r, S(r, 'empath'), null)); // 放下
  ok(pl(r, S(r, 'monk'), 'abstain')); // 舊客戶端的棄權：當作放下，沒有棄權這一欄
  assert.deepStrictEqual(up(r), ['imp', 'chef']);
  assert.deepStrictEqual(r.nomination.abstain, {}, '線下沒有棄權');
  assert(r.nomination.own[S(r, 'chef').id] && r.nomination.own[S(r, 'monk').id], '記下是自己點的');
  // 別的玩家看得到誰舉了手
  const v = viewFor(r, { pid: S(r, 'saint').pid });
  assert.strictEqual(v.nomination.votes[S(r, 'chef').id], true);
  ok(pl(r, S(r, 'empath'), 'yes'));
  ok(st(r, 'closeVote', { seen: seen(r) }));
  assert.strictEqual(r.history.at(-1).count, 3);
  // 結算後再點：說清楚已經結束
  assert.strictEqual(pl(r, S(r, 'monk'), 'yes'), '這次投票已經結束了');
  console.log('玩家自己舉手、放下、結算 ✔');
}

// 說書人替他點、玩家自己點，誰後點算誰的；說書人點的不算「自己點的」
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  nom(r, 'chef', 'imp');
  const chef = S(r, 'chef');
  ok(pl(r, chef, 'yes'));
  ok(st(r, 'handVote', { seatId: chef.id, v: null }));
  assert(!r.nomination.votes[chef.id] && !r.nomination.own[chef.id], '說書人放下了他的手');
  ok(pl(r, chef, 'yes'));
  assert(r.nomination.votes[chef.id], '玩家又舉起來');
  ok(st(r, 'handVote', { seatId: S(r, 'monk').id, v: 'yes' }));
  assert(r.nomination.votes[S(r, 'monk').id] && !r.nomination.own[S(r, 'monk').id]);
  console.log('說書人代點和玩家互相覆蓋 ✔');
}

// 結算那一下有人剛在手機上改了手（說書人屏幕上還沒刷新到）：先不結算；說書人自己的點不算
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  nom(r, 'chef', 'imp');
  ok(pl(r, S(r, 'chef'), 'yes'));
  const was = seen(r);
  ok(pl(r, S(r, 'monk'), 'yes')); // 說書人那邊還沒看到這一下
  assert.strictEqual(st(r, 'closeVote', { seen: was }), '剛才有人改了舉手，看一眼再結算');
  assert(r.nomination, '沒有結算');
  ok(st(r, 'handVote', { seatId: S(r, 'saint').id, v: 'yes' })); // 說書人自己點的不擋
  ok(st(r, 'closeVote', { seen: seen(r) }));
  assert.strictEqual(r.history.at(-1).count, 3);
  // 不帶 seen（舊客戶端）照常結算
  nom(r, 'empath', 'poisoner');
  ok(pl(r, S(r, 'monk'), 'yes'));
  ok(st(r, 'closeVote'));
  console.log('結算時剛有人改手 ✔');
}

// 死人：還有一票的舉著結算就用掉；舉了又放下不算用；用過了不能再舉
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  const chef = S(r, 'chef'), monk = S(r, 'monk');
  chef.dead = true; monk.dead = true;
  nom(r, 'empath', 'imp');
  ok(pl(r, chef, 'yes'));
  ok(pl(r, monk, 'yes'));
  ok(pl(r, monk, null));
  ok(st(r, 'closeVote', { seen: seen(r) }));
  assert(chef.voteUsed && !monk.voteUsed, '舉著結算的用掉死亡票，放下了的沒用');
  nom(r, 'soldier', 'poisoner');
  assert.strictEqual(pl(r, chef, 'yes'), '你的死亡票已經用過了');
  assert.match(st(r, 'handVote', { seatId: chef.id, v: 'yes' }), /他的死亡票已經用過了/);
  console.log('死亡票 ✔');
}

// 管家：主人沒舉手不能舉，主人放下他也放下。多設備照他以為的來：中毒的管家、以為自己是管家的酒鬼一樣守規矩（不露出誰是真管家）；死了的管家不受限
{
  for (const kind of ['real', 'poisoned', 'drunk']) {
    const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', kind === 'drunk' ? 'drunk' : 'butler', 'saint']);
    const b = r.seats[5], chef = S(r, 'chef');
    if (kind === 'drunk') b.fakeRole = 'butler';
    if (kind === 'poisoned') r.g.poisoned = b.id;
    r.g.master = { [b.id]: chef.id };
    nom(r, 'empath', 'imp');
    assert.strictEqual(pl(r, b, 'yes'), '你是管家：主人舉手時你才能舉手', kind);
    assert.strictEqual(st(r, 'handVote', { seatId: b.id, v: 'yes' }), '他是管家：主人舉手時他才能舉手', kind);
    ok(pl(r, chef, 'yes'));
    ok(pl(r, b, 'yes'));
    ok(pl(r, chef, null));
    assert(!r.nomination.votes[b.id], kind + '：主人放下，管家也放下');
    ok(pl(r, chef, 'yes'));
    ok(pl(r, b, 'yes'));
    ok(st(r, 'closeVote', { seen: seen(r) }));
    assert.strictEqual(r.history.at(-1).count, 2, kind);
    if (kind !== 'real') continue;
    b.dead = true;
    nom(r, 'monk', 'poisoner');
    ok(pl(r, b, 'yes')); // 死了沒有能力
    ok(st(r, 'closeVote'));
    assert.strictEqual(r.history.at(-1).count, 1);
  }
  // 線上也照他以為的來：中毒的管家一樣要等主人（不然他一舉就知道自己中毒了）
  const r = setup(['imp', 'poisoner', 'chef', 'empath', 'monk', 'butler', 'saint']);
  ok(st(r, 'next'));
  r.g.master = { [S(r, 'butler').id]: S(r, 'chef').id };
  r.g.poisoned = S(r, 'butler').id;
  ok(applyPlayerAction(r, S(r, 'chef').pid, { act: 'nominate', targetId: S(r, 'imp').id }));
  assert.strictEqual(pl(r, S(r, 'butler'), 'yes'), '你是管家：主人舉手時你才能舉手');
  ok(pl(r, S(r, 'chef'), 'yes'));
  ok(pl(r, S(r, 'butler'), 'yes'));
  ok(pl(r, S(r, 'monk'), 'abstain'));
  assert(r.nomination.abstain[S(r, 'monk').id], '線上還有棄權');
  console.log('管家（真的、中毒、酒鬼、死了）和線上的中毒管家 ✔');
}

// 單設備不變：手機只能看，玩家不能自己點（座位上都是名字，這裏直接調玩家入口驗）
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint'], 'one');
  nom(r, 'chef', 'imp');
  assert.strictEqual(pl(r, S(r, 'chef'), 'yes'), '線下局當面舉手，說書人會記下');
  ok(st(r, 'handVote', { seatId: S(r, 'chef').id, v: 'yes' }));
  console.log('單設備還是說書人點 ✔');
}

// 說書人撤銷自己的一步：玩家之後自己在手機上舉 / 放的手照舊，說書人點的退回去
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  nom(r, 'chef', 'imp');
  const [chef, empath, monk, saint] = ['chef', 'empath', 'monk', 'saint'].map(x => S(r, x));
  ok(pl(r, chef, 'yes'));
  ok(st(r, 'handVote', { seatId: saint.id, v: 'yes' })); // 說書人點錯了
  ok(pl(r, empath, 'yes')); // 這之後玩家自己舉的
  ok(pl(r, chef, null)); // 這之後玩家自己放的
  assert.strictEqual(undoOf(r), 'handVote');
  ok(st(r, 'undo'));
  assert.deepStrictEqual(up(r), ['empath'], '說書人的那一下退了，玩家的照舊');
  // 說書人放下了玩家自己舉的手，撤銷：手回到玩家自己舉的樣子
  ok(pl(r, monk, 'yes'));
  ok(st(r, 'handVote', { seatId: monk.id, v: null }));
  ok(st(r, 'undo'));
  assert(r.nomination.votes[monk.id] && r.nomination.own[monk.id]);
  // 撤銷一件無關的事（說書人貼標記），投票照舊
  ok(st(r, 'remind', { seatId: monk.id, text: '備忘', on: true }));
  ok(pl(r, saint, 'yes'));
  ok(st(r, 'undo'));
  assert.deepStrictEqual(up(r), ['empath', 'monk', 'saint']);
  // 撤銷結算：回到結算前，還能接著改
  ok(st(r, 'closeVote', { seen: seen(r) }));
  ok(st(r, 'undo'));
  assert.deepStrictEqual(up(r), ['empath', 'monk', 'saint']);
  ok(pl(r, saint, null));
  // 撤銷提名：投票沒了，不會留下別的
  ok(st(r, 'cancelVote'));
  ok(st(r, 'undo'));
  assert(r.nomination && r.nomination.votes[monk.id]);
  console.log('撤銷不打亂玩家的手 ✔');
}

// 撤銷時管家：主人在那之後自己放下了手，撤銷後管家的手不會單獨舉著
{
  const r = day(['imp', 'poisoner', 'chef', 'empath', 'monk', 'butler', 'saint']);
  const b = S(r, 'butler'), chef = S(r, 'chef');
  r.g.master = { [b.id]: chef.id };
  nom(r, 'empath', 'imp');
  ok(pl(r, chef, 'yes'));
  ok(pl(r, b, 'yes'));
  ok(st(r, 'remind', { seatId: chef.id, text: '備忘', on: true }));
  ok(pl(r, chef, null));
  ok(st(r, 'undo'));
  assert(!r.nomination.votes[chef.id] && !r.nomination.votes[b.id], '主人放下了，管家也是放下的');
  console.log('撤銷後管家跟著主人 ✔');
}

// 調試模式：多設備的機器人自己舉手，代班說書人過一會兒結算，不卡住
{
  const r = store.createRoom();
  Object.assign(r, { debug: true });
  Object.assign(r.settings, { venue: 'offline', devices: 'many', chosen: true, pretend: false });
  ok(st(r, 'addBots', { n: 6 }));
  ok(st(r, 'next'));
  const roles = ['imp', 'poisoner', 'chef', 'empath', 'monk', 'saint'];
  r.seats.forEach((s, i) => Object.assign(s, { role: roles[i], fakeRole: null }));
  Object.assign(r.g, { redHerring: null, queue: [], step: null });
  r.phase = 'dawn';
  ok(st(r, 'next'));
  ok(st(r, 'nominate', { fromId: r.seats[2].id, toId: r.seats[0].id }));
  assert(botStep(r), '機器人舉手');
  assert(r.seats.every(s => r.nomination.votes[s.id] !== undefined), '每個機器人都表了態');
  ok(st(r, 'handVote', { seatId: r.seats[3].id, v: r.nomination.votes[r.seats[3].id] ? null : 'yes' }));
  const before = { ...r.nomination.votes };
  assert(!botStep(r), '表過態的不再動，說書人沒走開就不代班');
  assert.deepStrictEqual(r.nomination.votes, before);
  // 說書人代入一個座位、沒人留在說書人視角：代班說書人等一會兒結算
  setPresence(r, [r.seats[1].id], false);
  r.nomination.at -= 60000; // 當作已經說了很久
  assert(botStep(r));
  assert(!r.nomination && r.history.length === 1, '代班說書人結算了');
  console.log('調試：機器人舉手、代班結算 ✔');
}
