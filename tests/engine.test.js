// 引擎測試：隨機跑很多完整對局，確認流程總能走到結局、規則約束成立。用法：node tests/engine.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';

const rnd = a => a[Math.floor(Math.random() * a.length)];
// 構造一份錯誤答案，模擬說書人給假信息
export function lie(form) {
  const t = form.truth;
  if (form.kind === 'number') return { n: (t.n + 1) % (form.max + 1) };
  if (form.kind === 'yesno') return { yes: !t.yes };
  if (form.kind === 'role') return { role: form.roles.find(r => r !== t.role) };
  if (form.kind === 'two') return t.none ? t : { ...t, role: form.roles.find(r => r !== t.role) || t.role };
  return {};
}
const ok = r => assert.strictEqual(r, undefined, r);

function playGame(n) {
  const room = createRoom();
  for (let i = 0; i < n; i++) ok(joinPlayer(room, 'p' + i, '玩家' + i));
  ok(applyStOp(room, { op: 'next' }));
  const pidOf = s => s.pid;
  let guard = 0;
  while (room.phase !== 'ended' && guard++ < 400) {
    if (room.phase === 'night') {
      const step = room.g.step;
      assert.ok(step && step.status !== 'done', '夜晚必須停在待處理步驟上');
      if (step.status === 'choose') {
        const pool = room.seats.filter(s => !(step.choose.notSelf && s.id === step.seatId));
        const ids = [];
        while (ids.length < step.choose.count) { const s = rnd(pool); if (!ids.includes(s.id)) ids.push(s.id); }
        const seat = room.seats.find(s => s.id === step.seatId);
        // 玩家自己的視圖裏要能看到選擇提示，別人看不到
        assert.ok(viewFor(room, { pid: seat.pid }).prompt);
        const other = room.seats.find(s => s !== seat);
        assert.strictEqual(viewFor(room, { pid: other.pid }).prompt, null);
        ok(applyPlayerAction(room, pidOf(seat), { act: 'pick', ids }));
      } else if (step.status === 'decide') {
        ok(applyStOp(room, { op: 'decide', choice: rnd(step.decide.options).id }));
      } else if (step.status === 'review') {
        // 天亮前確認：玩家這時還看不到今晚的死亡
        for (const id of room.g.diedTonight) assert.ok(!viewFor(room, { pid: 'p0' }).seats.find(s => s.id === id).dead || room.seats.find(s => s.pid === 'p0').id === id);
        ok(applyStOp(room, { op: 'dawn' }));
      } else {
        ok(applyStOp(room, { op: 'confirm', fields: step.form.free && Math.random() < 0.3 ? lie(step.form) : step.form.truth }));
      }
    } else if (room.phase === 'dawn') {
      ok(applyStOp(room, { op: 'next' }));
    } else if (room.phase === 'day' && room.g.ruling) {
      // 能力裁定：多數按規則結果，偶爾反著判
      ok(applyStOp(room, { op: 'rule', work: room.g.ruling.forced || Math.random() < 0.8 ? room.g.ruling.auto : !room.g.ruling.auto }));
    } else if (room.phase === 'day' && room.g.virginCheck && Math.random() < 0.5) {
      const v = room.g.virginCheck;
      ok(applyStOp(room, { op: 'virgin', work: v.forced || Math.random() < 0.8 ? v.auto : !v.auto }));
    } else if (room.phase === 'day') {
      const alive = room.seats.filter(s => !s.dead);
      if (Math.random() < 0.15) applyPlayerAction(room, rnd(alive).pid, { act: 'slay', targetId: rnd(room.seats).id });
      if (room.phase === 'day' && !room.g.ruling && Math.random() < 0.8) {
        const from = rnd(alive), to = rnd(room.seats);
        if (!applyPlayerAction(room, from.pid, { act: 'nominate', targetId: to.id }) && room.nomination) {
          for (const s of room.seats) applyPlayerAction(room, s.pid, { act: 'vote', up: Math.random() < 0.7 });
          // 需要說書人裁定的貞潔者先裁定；必定反噬的在計票 / 結算前自動反噬，投票隨之中止
          const vc = room.g.virginCheck;
          if (vc && !vc.forced) ok(applyStOp(room, { op: 'virgin', work: Math.random() < 0.5 }));
          if (room.nomination && Math.random() < 0.5) ok(applyStOp(room, { op: 'startCount' }));
          if (room.nomination) ok(applyStOp(room, { op: Math.random() < 0.1 ? 'cancelVote' : 'closeVote' }));
        }
      }
      if (room.phase === 'day' && !room.g.ruling && !(room.g.virginCheck && !room.g.virginCheck.forced)) ok(applyStOp(room, { op: 'next' }));
    }
  }
  assert.strictEqual(room.phase, 'ended', '對局應該結束');
  assert.ok(['good', 'evil'].includes(room.winner));
  // 結束後所有人可看到全部角色
  assert.ok(viewFor(room, { pid: 'p0' }).seats.every(s => s.role));
  return room;
}

// 隱私：遊戲中玩家只看得到自己的角色
{
  const room = createRoom();
  for (let i = 0; i < 7; i++) joinPlayer(room, 'p' + i, 'x' + i);
  applyStOp(room, { op: 'next' });
  const v = viewFor(room, { pid: 'p0' });
  assert.ok(v.myRole);
  assert.ok(v.seats.every(s => s.role === undefined), '玩家視圖不含任何真實角色');
  assert.strictEqual(v.st, null);
  // 首夜 7 人局：爪牙和惡魔收到了彼此信息
  const demon = room.seats.find(s => s.role === 'imp');
  assert.ok(room.chat.some(m => m.to === demon.id && m.text.includes('你的爪牙')));
  assert.ok(room.chat.some(m => m.to === demon.id && m.text.includes('偽裝')));
  // 遊戲開始後不能再加入
  assert.ok(joinPlayer(room, 'late', 'late'));
}

const stats = { good: 0, evil: 0 };
for (let i = 0; i < 300; i++) stats[playGame(5 + (i % 11)).winner]++;
console.log('300 局隨機對局全部正常結束 ✔', stats);
