// 會結束遊戲的操作先問說書人（試一遍、退回去）；結束後能撤回（線上線下都行）。用法：node tests/endconfirm.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer, keepLive, undoOf } from '../lib/ops.js';
import { autoPicks } from '../lib/engine.js';
import { ROLES } from '../public/js/roles.js';
import { isBuiltin } from '../lib/script.js';

const st = (r, op, a = {}, ask = false) => { const x = applyStOp(r, { op, ...a }, ask); assert.strictEqual(typeof x === 'string' ? x : undefined, undefined, op); return x; };
function mk(venue, dev, roles) {
  const r = createRoom();
  st(r, 'venue', { venue, devices: dev });
  const all = Object.keys(ROLES).filter(k => isBuiltin(k) && ['townsfolk', 'outsider', 'minion', 'demon'].includes(ROLES[k].team));
  st(r, 'upload', { entries: [{ id: '_meta', name: 'all' }, ...all] });
  if (dev === 'one') st(r, 'addSeats', { names: roles.map((_, i) => 'n' + (i + 1)) });
  else roles.forEach((_, i) => joinPlayer(r, 'p' + i, 'n' + i));
  roles.forEach((x, i) => st(r, 'setRole', { seatId: r.seats[i].id, roleId: x }));
  st(r, 'next', { force: true });
  for (let k = 0; k < 80 && r.phase === 'night'; k++) {
    const s = r.g.step;
    if (!s) break;
    if (s.status === 'review') st(r, 'dawn');
    else if (s.status === 'choose' && venue === 'online') {
      const { ids, role } = autoPicks(r, s);
      assert.strictEqual(applyPlayerAction(r, r.seats.find(x => x.id === s.seatId).pid, { act: 'pick', ids, role }), undefined);
    } else if (s.status === 'choose') st(r, 'pick', autoPicks(r, s));
    else if (s.status === 'confirm') st(r, 'confirm', { fields: s.form.truth });
    else if (s.status === 'decide') st(r, 'decide', { choice: s.decide.options.at(-1).id });
    else if (s.status === 'fake') st(r, 'pretend'); // 線上首格假裝叫醒
    else st(r, 'ack');
  }
  if (r.phase === 'dawn') st(r, 'next');
  assert.strictEqual(r.phase, 'day');
  return r;
}

// 渦流：標記死亡不算處決，結束白天會直接判邪惡獲勝 → 先問，局面、聊天、日誌原樣不動
{
  const r = mk('offline', 'one', ['vortox', 'witch', 'sage', 'savant', 'artist', 'juggler', 'towncrier']);
  st(r, 'setDead', { seatId: r.seats[5].id, dead: true });
  assert.deepStrictEqual(r.g.markedToday, [r.seats[5].id], '白天標記的死亡記下來');
  keepLive(r);
  const chat = r.chat.length, log = r.g.log.length, seq = r.chatSeq;
  const x = st(r, 'next', {}, true);
  assert.deepStrictEqual(x, { confirmEnd: { team: 'evil', reason: '渦流在場，白天無人被處決' } });
  assert.strictEqual(r.phase, 'day', '沒確認：還是白天');
  assert.strictEqual(r.chat.length, chat, '公告退回去了');
  assert.strictEqual(r.chatSeq, seq);
  assert.strictEqual(r.g.log.length, log, '日誌退回去了');
  assert.strictEqual(undoOf(r), 'setDead', '試的那一步不進撤銷棧');
  // 確認後結束；撤回回到結束前，撤銷棧裏那一步一起拿掉
  st(r, 'next', { sure: true }, true);
  assert.strictEqual(r.phase, 'ended');
  assert.strictEqual(undoOf(r), 'end');
  st(r, 'undo');
  assert.strictEqual(r.phase, 'day');
  assert.strictEqual(r.winner, null);
  assert.strictEqual(undoOf(r), 'setDead', '結束那一步不留在撤銷棧');
  assert.ok(r.chat.some(m => m.e?.k === 'unend'), '公告撤回');
  // 改成處決他：不再問，照常入夜
  st(r, 'execute', { seatId: r.seats[5].id }, true);
  assert.strictEqual(st(r, 'next', {}, true), undefined);
  assert.strictEqual(r.phase, 'night');
  console.log('渦流：先問、撤回結束 ✔');
}

// 線上：處決惡魔 → 先問；確認後結束，撤回回到白天，積分、MVP 一起退
{
  const r = mk('online', 'many', ['imp', 'poisoner', 'chef', 'empath', 'monk', 'soldier', 'saint']);
  keepLive(r);
  const eggs = JSON.stringify(r.players);
  assert.deepStrictEqual(st(r, 'execute', { seatId: r.seats[0].id }, true), { confirmEnd: { team: 'good', reason: '惡魔死亡' } });
  assert.ok(!r.seats[0].dead, '沒確認：惡魔還活著');
  st(r, 'execute', { seatId: r.seats[0].id, sure: true }, true);
  assert.strictEqual(r.phase, 'ended');
  assert.ok(r.mvp, '線上開了 MVP 投票');
  st(r, 'undo');
  assert.strictEqual(r.phase, 'day');
  assert.ok(!r.seats[0].dead && !r.g.executedToday);
  assert.strictEqual(JSON.stringify(r.players), eggs, '積分退回去');
  assert.strictEqual(typeof applyStOp(r, { op: 'undo' }), 'string', '線上平時沒有撤銷');
  // 判勝負是說書人自己定的：不問
  assert.strictEqual(st(r, 'win', { team: 'evil' }, true), undefined);
  assert.strictEqual(r.phase, 'ended');
  console.log('線上：先問、撤回結束 ✔');
}
