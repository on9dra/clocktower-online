// 積分、MVP、雞蛋測試。用法：node tests/score.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { endGame } from '../lib/rules.js';
import { closeMvp } from '../lib/score.js';
import { EGG } from '../public/js/score.js';
import { setup, S, ok, st, pl } from './helpers.js';

const prof = (r, role) => r.players[S(r, role).pid];
const online = r => { r.seats.forEach(s => { s.online = true; }); r.stOnline = true; };

// 第一次進房間送 3 枚雞蛋；離座再回來不會再送
{
  const r = createRoom();
  ok(joinPlayer(r, 'a', 'A'));
  assert.deepStrictEqual(r.players.a, { eggs: EGG.start, wins: 0, mvp: 0 });
  r.players.a.eggs = 1;
  ok(applyPlayerAction(r, 'a', { act: 'leave' }));
  ok(joinPlayer(r, 'a', 'A'));
  assert.strictEqual(r.players.a.eggs, 1, '回來不重新送雞蛋');
}
// 終局：贏的一方勝利積分 +1、雞蛋 +10，輸的一方雞蛋 +1；酒鬼算善良
{
  const r = setup(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  endGame(r, 'good', '測試');
  assert.deepStrictEqual(prof(r, 'drunk'), { eggs: EGG.start + EGG.win, wins: 1, mvp: 0 });
  assert.deepStrictEqual(prof(r, 'imp'), { eggs: EGG.start + EGG.lose, wins: 0, mvp: 0 });
  // 贏家頭上有皇冠、自己的桌面放煙花；輸家和說書人沒有
  const v = viewFor(r, { pid: S(r, 'chef').pid });
  assert.strictEqual(v.seats.find(x => x.id === S(r, 'chef').id).crown, 'good');
  assert.strictEqual(v.seats.find(x => x.id === S(r, 'imp').id).crown, null);
  assert.strictEqual(v.fireworks, 'good');
  assert.strictEqual(viewFor(r, { pid: S(r, 'imp').pid }).fireworks, null);
  assert.strictEqual(viewFor(r, { st: true }).fireworks, null);
}
// MVP：可以投自己、說書人也投；得票最多的當選，MVP 次數 +1、雞蛋 +5；票數到結束才公佈
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  online(r);
  endGame(r, 'evil', '測試');
  const imp = S(r, 'imp').id, chef = S(r, 'chef').id;
  ok(pl(r, 'imp', 'mvp', { targetId: imp }));
  ok(pl(r, 'poisoner', 'mvp', { targetId: imp }));
  ok(pl(r, 'chef', 'mvp', { targetId: chef }));
  ok(st(r, 'mvp', { seatId: imp }));
  const v = viewFor(r, { pid: S(r, 'chef').pid });
  assert.strictEqual(v.mvpVote.n, 4);
  assert.strictEqual(v.mvpVote.mine, chef);
  assert.strictEqual(v.mvpVote.tally, null, '投票中不公佈票數');
  assert.strictEqual(r.mvp.done, false, '還有人沒投');
  const before = prof(r, 'imp').eggs;
  closeMvp(r);
  assert.deepStrictEqual(r.mvp.winners, [imp]);
  assert.strictEqual(prof(r, 'imp').mvp, 1);
  assert.strictEqual(prof(r, 'imp').eggs, before + EGG.mvp);
  assert.ok(r.fx.some(e => e.k === 'mvp' && e.seats[0] === imp));
  assert.strictEqual(viewFor(r, { st: true }).seats.find(x => x.id === imp).mvp, true);
  assert.ok(pl(r, 'chef', 'mvp', { targetId: chef }), '結束後不能再投');
}
// 平票一起當選；所有人投完立即結束；沒人投就沒有 MVP
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  online(r);
  endGame(r, 'good', '測試');
  const a = S(r, 'chef').id, b = S(r, 'monk').id;
  for (const role of ['chef', 'imp']) ok(pl(r, role, 'mvp', { targetId: a }));
  for (const role of ['poisoner', 'monk']) ok(pl(r, role, 'mvp', { targetId: b }));
  ok(pl(r, 'soldier', 'mvp', { targetId: a }));
  ok(pl(r, 'soldier', 'mvp', { targetId: null }));
  ok(pl(r, 'soldier', 'mvp', { targetId: S(r, 'soldier').id }));
  assert.strictEqual(r.mvp.done, false);
  ok(st(r, 'mvp', { seatId: b }));
  assert.strictEqual(r.mvp.done, true, '都投完了立即結束');
  assert.deepStrictEqual(r.mvp.winners, [b]);

  const r2 = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  online(r2);
  endGame(r2, 'good', '測試');
  ok(pl(r2, 'chef', 'mvp', { targetId: S(r2, 'monk').id }));
  ok(pl(r2, 'imp', 'mvp', { targetId: S(r2, 'chef').id }));
  closeMvp(r2);
  assert.strictEqual(r2.mvp.winners.length, 2, '平票一起當選');

  const r3 = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  endGame(r3, 'good', '測試');
  closeMvp(r3);
  assert.deepStrictEqual(r3.mvp.winners, []);
  assert.ok(!r3.fx.some(e => e.k === 'mvp'));
}
// 回到準備階段：MVP 按已投的票結算；皇冠、煙花保留到開新局，皇冠再保留到下一次分出勝負
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  online(r);
  endGame(r, 'good', '測試');
  const chefId = S(r, 'chef').id, chefPid = S(r, 'chef').pid;
  ok(pl(r, 'imp', 'mvp', { targetId: chefId }));
  ok(st(r, 'next'));
  assert.strictEqual(r.phase, 'lobby');
  assert.deepStrictEqual(r.mvp.winners, [chefId]);
  assert.ok(r.fx.some(e => e.k === 'mvp'), '回到準備時 MVP 演出照樣播');
  assert.strictEqual(viewFor(r, { pid: chefPid }).fireworks, 'good');
  ok(st(r, 'next')); // 開新局
  assert.ok(r.fx[0].k === 'curtain' && r.fx[0].n === 2, '開局先拉幕');
  const v = viewFor(r, { pid: chefPid });
  assert.strictEqual(v.fireworks, null, '開新局後煙花停');
  assert.strictEqual(v.seats.find(x => x.mine).crown, 'good', '皇冠留到下一次分出勝負');
  assert.strictEqual(v.seats.find(x => x.mine).mvp, false);
  ok(st(r, 'abandon'));
  assert.strictEqual(viewFor(r, { pid: chefPid }).seats.find(x => x.mine).crown, 'good', '放棄的局不算分出勝負');
}
// 扔雞蛋：少一枚、不能扔自己、用完不能扔、連點太快忽略；任何階段都能扔
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
  const chef = S(r, 'chef'), imp = S(r, 'imp');
  ok(pl(r, 'chef', 'egg', { targetId: imp.id }));
  assert.strictEqual(r.players[chef.pid].eggs, EGG.start - 1);
  assert.deepStrictEqual(r.eggs.map(e => [e.from, e.to]), [[chef.id, imp.id]]);
  ok(pl(r, 'chef', 'egg', { targetId: imp.id }));
  assert.strictEqual(r.eggs.length, 1, '連點太快的忽略');
  assert.ok(pl(r, 'chef', 'egg', { targetId: chef.id }), '不能扔自己');
  r.players[chef.pid].eggs = 0;
  r.players[chef.pid].lastEgg = 0;
  assert.ok(pl(r, 'chef', 'egg', { targetId: imp.id }), '用完了');
  assert.strictEqual(viewFor(r, { pid: imp.pid }).eggs.length, 1, '所有人都看得到');
}
console.log('score tests ok');
