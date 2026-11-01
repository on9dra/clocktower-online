// 單人試玩：每個角色都能由機器人說書人從開局一路推進到結束，不卡住
import assert from 'assert';
import { createSolo, soloOp, applyPlayerAction, applyStOp } from '../lib/ops.js';
import { nextAction } from '../lib/bots.js';
import { autoPicks, skipStep } from '../lib/engine.js';
import { SCRIPTS } from '../public/js/roles.js';
import { COMMUNITY } from '../public/js/community.js';
import { scriptRoles } from '../lib/util.js';
import { viewFor } from '../lib/view.js';

const PID = 'solo-tester';
const me = room => room.seats.find(s => s.pid === PID);

// 把機器人該做的都做完；輪到真人時隨機選
function settle(room) {
  for (let i = 0; i < 300; i++) {
    const g = room.g, step = g.step;
    if (room.nomination?.clock) { applyStOp(room, { op: 'closeVote' }); continue; }
    const act = nextAction(room);
    if (act) { act(); continue; }
    if (room.phase === 'night' && step?.status === 'choose' && step.seatId === me(room).id) {
      const { ids, role, stuck } = autoPicks(room, step);
      if (stuck || applyPlayerAction(room, PID, { act: 'pick', ids, role })) skipStep(room);
      continue;
    }
    return;
  }
  assert.fail(`卡住了：${room.phase} ${room.g.step?.roleId} ${room.g.step?.status}`);
}

// 能智能推進的社區劇本也跑一遍：跨劇本的角色湊在一起不能卡住
for (const c of COMMUNITY) if (c.auto) SCRIPTS['c' + c.id] = c;

for (const [script, def] of Object.entries(SCRIPTS)) {
  const probe = createSolo(PID, '測試', { script });
  if (typeof probe === 'string') assert.fail(probe);
  for (const role of scriptRoles(probe)) {
    const room = createSolo(PID, '測試', { script, role, count: def.small ? 7 : 8 });
    assert.notStrictEqual(typeof room, 'string', `${def.name} ${role}：${room}`);
    assert.strictEqual(me(room).role, role, `${role} 沒有發到手上`);
    assert.ok(viewFor(room, { pid: PID }).solo.includes(role));
    for (let day = 0; day < 12 && room.phase !== 'ended'; day++) {
      settle(room);
      if (room.phase !== 'day') continue;
      soloOp(room, PID, { op: 'nominate' });
      settle(room);
      if (room.phase === 'day') soloOp(room, PID, { op: 'dusk' });
    }
    settle(room);
    assert.ok(['ended', 'day', 'night'].includes(room.phase));
  }
}

// 普通房間不能用
const room = createSolo(PID, '測試', {});
room.solo = false;
assert.strictEqual(soloOp(room, PID, { op: 'dusk' }), '無權限');
console.log('solo ok');
process.exit(0); // store 有寫盤計時器
