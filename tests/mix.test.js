// 跨劇本：用內置角色隨機拼上傳的劇本，隨機跑完整對局，確認智能推進不會卡住或崩潰。用法：node tests/mix.test.js [局數]
// 只保證走得到結局，不保證每個裁定都對
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { autoPicks } from '../lib/engine.js';
import { truthLevel, checkFields } from '../public/js/infofmt.js';
import { ROLES, SCRIPTS } from '../public/js/roles.js';

const rnd = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ok = (r, where) => assert.strictEqual(r, undefined, `${where}: ${r}`);

const ALL = [...new Set(Object.values(SCRIPTS).flatMap(s => s.roles))];
const byTeam = t => ALL.filter(id => ROLES[id].team === t);
const mix = () => [...shuffle(byTeam('townsfolk')).slice(0, 13), ...shuffle(byTeam('outsider')).slice(0, 4),
  ...shuffle(byTeam('minion')).slice(0, 4), ...shuffle(byTeam('demon')).slice(0, 3)];

// 枚舉表單的所有答案，找一個算「錯誤信息」的
function lie(form, ids) {
  const out = [];
  if (form.kind === 'number') for (let n = 0; n <= form.max; n++) out.push({ n });
  if (form.kind === 'yesno') out.push({ yes: true }, { yes: false });
  if (form.kind === 'role') for (const role of form.roles) out.push({ role });
  if (form.kind === 'two') for (const a of ids) for (const b of ids) if (a !== b) for (const role of form.roles) out.push({ a, b, role });
  if (form.kind === 'dream') for (const good of form.goods) for (const evil of form.evils) out.push({ good, evil });
  return shuffle(out).find(f => !checkFields(form, f, ids) && truthLevel(form, f) === 0);
}

function play(n) {
  const room = createRoom();
  room.settings.pretend = false;
  for (let i = 0; i < n; i++) ok(joinPlayer(room, 'p' + i, '玩家' + i), 'join');
  const up = applyStOp(room, { op: 'upload', entries: [{ id: '_meta', name: '混' }, ...mix()] });
  assert.ok(up.auto, '全是內置角色的劇本可以用智能推進');
  const start = applyStOp(room, { op: 'next' });
  if (start) return assert.match(start, /可用的/); // 這本劇本在這個人數下湊不齊角色：開局時有提示
  let guard = 0;
  while (room.phase !== 'ended' && guard++ < 1500) {
    if (room.phase === 'night') {
      const step = room.g.step;
      assert.ok(step && step.status !== 'done', '夜晚必須停在待處理步驟上');
      if (step.status === 'choose') {
        const { ids, role, stuck } = autoPicks(room, step);
        assert.ok(!stuck, `${step.roleId} 找不到合規的選擇`);
        ok(applyPlayerAction(room, room.seats.find(s => s.id === step.seatId).pid, { act: 'pick', ids, role }), 'pick ' + step.roleId);
      } else if (step.status === 'decide') ok(applyStOp(room, { op: 'decide', choice: rnd(step.decide.options).id }), 'decide ' + step.roleId);
      else if (step.status === 'review') ok(applyStOp(room, { op: 'dawn' }), 'dawn');
      else {
        const form = step.form, ids = room.seats.map(s => s.id);
        const fake = (form.vortox || (form.free && Math.random() < 0.3)) && form.kind !== 'text' ? lie(form, ids) : null;
        // 渦流在場、又沒有隱士 / 間諜可以登記時，一定要給得出錯誤信息；有登記時隨便給都合規
        if (form.vortox && !form.alt && form.kind !== 'text') assert.ok(fake, `渦流下 ${step.roleId} 給不出錯誤信息`);
        ok(applyStOp(room, { op: 'confirm', fields: fake || form.truth }), 'confirm ' + step.roleId);
      }
    } else if (room.phase === 'dawn') ok(applyStOp(room, { op: 'next' }), 'dawn next');
    else if (room.phase === 'day' && room.g.ruling) {
      const r = room.g.ruling;
      ok(applyStOp(room, { op: 'rule', work: r.forced || Math.random() < 0.8 ? r.auto : !r.auto }), 'rule ' + r.kind);
    } else if (room.phase === 'day' && room.g.virginCheck && Math.random() < 0.5) {
      const v = room.g.virginCheck;
      ok(applyStOp(room, { op: 'virgin', work: v.forced || Math.random() < 0.8 ? v.auto : !v.auto }), 'virgin');
    } else if (room.phase === 'day') {
      const alive = room.seats.filter(s => !s.dead);
      if (Math.random() < 0.15) applyPlayerAction(room, rnd(alive).pid, { act: 'slay', targetId: rnd(room.seats).id });
      if (room.phase === 'day' && !room.g.ruling && Math.random() < 0.8) {
        if (!applyPlayerAction(room, rnd(alive).pid, { act: 'nominate', targetId: rnd(room.seats).id }) && room.nomination) {
          for (const s of room.seats) applyPlayerAction(room, s.pid, { act: 'vote', up: Math.random() < 0.7 });
          const vc = room.g.virginCheck;
          if (vc && !vc.forced) ok(applyStOp(room, { op: 'virgin', work: Math.random() < 0.5 }), 'virgin2');
          if (room.nomination && !room.g.ruling && Math.random() < 0.5) ok(applyStOp(room, { op: 'startCount' }), 'count');
          if (room.nomination && !room.g.ruling) ok(applyStOp(room, { op: Math.random() < 0.1 ? 'cancelVote' : 'closeVote' }), 'close');
        }
      }
      if (room.phase === 'day' && !room.g.ruling && !(room.g.virginCheck && !room.g.virginCheck.forced)) ok(applyStOp(room, { op: 'next' }), 'endday');
    }
  }
  assert.strictEqual(room.phase, 'ended', `對局應該結束（停在 ${room.phase}，${room.g.step?.roleId}/${room.g.step?.status}）`);
}

const N = Number(process.argv[2]) || 600;
for (let i = 0; i < N; i++) play(5 + (i % 11));
console.log(`跨劇本：${N} 局隨機對局全部正常結束 ✔`);
process.exit(0);
