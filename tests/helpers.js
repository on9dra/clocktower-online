// 測試共用：按給定角色建一局，跳過首夜，停在第二夜開始前
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';

export function setup(roles) {
  const room = createRoom();
  room.settings.pretend = false; // 規則測試不等假裝叫醒（engine.test.js 和 flow.test.js 裏另外測）
  roles.forEach((_, i) => joinPlayer(room, 'p' + i, 'n' + i));
  applyStOp(room, { op: 'next' });
  room.seats.forEach((s, i) => Object.assign(s, { role: roles[i], fakeRole: null }));
  room.g.redHerring = null;
  room.g.queue = []; room.g.step = null;
  room.phase = 'dawn';
  return room;
}
export const S = (room, role) => room.seats.find(s => s.role === role);
export const ok = r => assert.strictEqual(r, undefined, r);
// 玩家用完能力後說書人的確認
export const ack = room => { if (room.g.step?.status === 'ack') ok(applyStOp(room, { op: 'ack' })); };
export const act = (room, role, ids) => { ok(applyPlayerAction(room, S(room, role).pid, { act: 'pick', ids })); ack(room); };
export const st = (room, op, args = {}) => { const r = applyStOp(room, { op, ...args }); if (op === 'pick' && !r) ack(room); return r; };
// 月之子、呆瓜、心上人死後的選擇：都選第一個存活的其他玩家
export const words = room => {
  for (const w of [...(room.g.lastWords || [])]) {
    if (room.phase !== 'day') return;
    ok(applyStOp(room, { op: 'word', seatId: w.seatId, targetId: room.seats.find(s => !s.dead && s.id !== w.seatId)?.id || null }));
  }
};
export const pl = (room, role, act, args = {}) => { const r = applyPlayerAction(room, S(room, role).pid, { act, ...args }); if (!r) ack(room); return r; };
// 夜晚走完，停在「天亮前確認」
export const atReview = room => room.phase === 'night' && room.g.step?.status === 'review';
// 只執行一個夜晚步驟（用來單獨測試首夜信息類角色）
export async function runOnly(room, roleId, night = 1) {
  const { run } = await import('../lib/engine.js');
  room.phase = 'night'; room.g.night = night;
  room.g.queue = [{ roleId, seatId: S(room, roleId).id, at: 1 }];
  run(room);
  return room.g.step;
}
