// 引擎測試：隨機跑很多完整對局，確認流程總能走到結局、規則約束成立。用法：node tests/engine.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { autoPicks } from '../lib/engine.js';
import { truthLevel } from '../public/js/infofmt.js';

const rnd = a => a[Math.floor(Math.random() * a.length)];
// 構造一份錯誤答案，模擬說書人給假信息
export function lie(form) {
  const t = form.truth;
  if (form.kind === 'number') return { n: (t.n + 1) % (form.max + 1) };
  if (form.kind === 'yesno') return { yes: !t.yes };
  if (form.kind === 'role') return { role: form.roles.find(r => r !== t.role) };
  if (form.kind === 'two') {
    if (t.none) return t;
    const role = form.roles.find(r => r !== t.role);
    if (role) return { ...t, role };
    const of = form.roleOf || {}, ids = Object.keys(form._seats || {}).filter(id => !of[id]);
    return { a: ids[0], b: ids[1], role: t.role };
  }
  if (form.kind === 'dream') return { good: form.goods.find(r => r !== t.good && r !== form.role), evil: form.evils.find(r => r !== t.evil && r !== form.role) };
  return {};
}
const ok = r => assert.strictEqual(r, undefined, r);
// 劇本的夜晚順序表（不看場上有誰）
import { NIGHT } from '../lib/night.js';
import { ROLES, SCRIPTS } from '../public/js/roles.js';
// 首夜表只有首夜行動的角色，其他夜晚的表只有其他夜晚行動的；爪牙 / 惡魔信息不佔格
function expectOrder(room) {
  const at = r => (room.g.night === 1 ? ROLES[r].first : ROLES[r].other);
  return SCRIPTS[room.scriptId].roles.filter(r => NIGHT[r] && at(r) > 0).sort((a, b) => at(a) - at(b));
}
const wake = room => { while (room.g.step?.status === 'fake') ok(applyStOp(room, { op: 'pretend' })); };

function playGame(n, scriptId = 'tb') {
  const room = createRoom();
  room.scriptId = scriptId;
  for (let i = 0; i < n; i++) ok(joinPlayer(room, 'p' + i, '玩家' + i));
  ok(applyStOp(room, { op: 'next' }));
  const pidOf = s => s.pid;
  let guard = 0, seen = new Set(), order = null;
  while (room.phase !== 'ended' && guard++ < 1500) {
    if (room.phase === 'night') {
      const step = room.g.step;
      assert.ok(step && step.status !== 'done', '夜晚必須停在待處理步驟上');
      // 進度條：玩家只拿到角色順序（只取決於劇本、第幾夜和人數），順序表上每一格都要停下來過，不在場的也一樣
      const pv = viewFor(room, { pid: 'p0' }).prog, sv = viewFor(room, { st: true }).prog;
      assert.ok(pv.order.every(o => Object.keys(o).length === 1), '玩家的進度條不帶持有者');
      assert.deepStrictEqual(pv.order.map(o => o.r), expectOrder(room), '玩家的進度條只取決於劇本');
      assert.strictEqual(pv.at, sv.at);
      if (order !== room.g.night) { order = room.g.night; seen = new Set(); }
      seen.add(pv.at);
      if (step.status === 'fake') {
        assert.ok(step.due > Date.now() && !step.seatId, '假裝叫醒：沒有人醒，到點自動往下走');
        ok(applyStOp(room, { op: 'pretend' }));
      } else if (step.status === 'choose') {
        const { ids, role, stuck } = autoPicks(room, step);
        assert.ok(!stuck, `${step.roleId} 找不到合規的選擇`);
        const seat = room.seats.find(s => s.id === step.seatId);
        // 玩家自己的視圖裏要能看到選擇提示，別人看不到
        assert.ok(viewFor(room, { pid: seat.pid }).prompt);
        const other = room.seats.find(s => s !== seat);
        assert.strictEqual(viewFor(room, { pid: other.pid }).prompt, null);
        ok(applyPlayerAction(room, pidOf(seat), { act: 'pick', ids, role }));
      } else if (step.status === 'decide') {
        ok(applyStOp(room, { op: 'decide', choice: rnd(step.decide.options).id }));
      } else if (step.status === 'review') {
        assert.strictEqual(seen.size, pv.order.length + 1, `第 ${room.g.night} 夜：順序表上每一格都停過`);
        // 天亮前確認：玩家這時還看不到今晚的死亡
        for (const id of room.g.diedTonight) assert.ok(!viewFor(room, { pid: 'p0' }).seats.find(s => s.id === id).dead || room.seats.find(s => s.pid === 'p0').id === id);
        ok(applyStOp(room, { op: 'dawn' }));
      } else {
        const form = step.form;
        form._seats = Object.fromEntries(room.seats.map(s => [s.id, 1]));
        const fields = form.vortox || (form.free && Math.random() < 0.3) ? lie(form) : form.truth;
        if (form.vortox) assert.strictEqual(truthLevel(form, fields), 0, `${step.roleId} 渦流下要能給出錯誤信息`);
        ok(applyStOp(room, { op: 'confirm', fields }));
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
  wake(room);
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

for (const id of ['tb', 'bmr', 'snv']) {
  const stats = { good: 0, evil: 0 };
  for (let i = 0; i < 300; i++) stats[playGame(5 + (i % 11), id).winner]++;
  console.log(`${id}：300 局隨機對局全部正常結束 ✔`, stats);
}
