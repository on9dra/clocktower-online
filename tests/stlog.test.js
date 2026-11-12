// 說書人流程日誌的數據（2026-11-13）：夜晚行動排在它造成的死亡前面；酒鬼的行動、信息記下真實角色。用法：node tests/stlog.test.js
import assert from 'assert';
import { startNight, run } from '../lib/engine.js';
import { setup, S, act, st, ok } from './helpers.js';

const log = r => r.g.log.map(l => l.e).filter(Boolean);

// 小惡魔殺人：「殺死 ③」在前，「③ 死亡」在後
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  const es = log(r), kill = es.findIndex(e => e.k === 'act' && e.src === 'imp' && e.res === 'kill'), died = es.findIndex(e => e.k === 'death' && e.seat === S(r, 'chef').id);
  assert.ok(kill >= 0 && died > kill, '殺死在前，死亡在後');
  console.log('行動排在死亡前面 ✔');
}

// 以為自己是僧侶的酒鬼：裁定和行動都記下真實角色 drunk
{
  const r = setup(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'drunk').fakeRole = 'monk';
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'drunk', [S(r, 'chef').id]);
  ok(st(r, 'decide', { choice: 'fail' }));
  const es = log(r).filter(e => e.seat === S(r, 'drunk').id);
  assert.ok(es.some(e => e.k === 'rule' && e.role === 'monk' && e.real === 'drunk'), '裁定記下真實角色');
  assert.ok(es.some(e => e.k === 'act' && e.src === 'monk' && e.res === 'fail' && e.real === 'drunk'), '行動記下真實角色');
  // 別人的行動不帶 real
  assert.ok(log(r).filter(e => e.k === 'act' && e.src === 'poisoner').every(e => !e.real), '投毒者不帶 real');
  console.log('酒鬼僧侶記下真實角色 ✔');
}

// 以為自己是圖書管理員的酒鬼：信息記下真實角色
{
  const r2 = setup(['drunk', 'imp', 'poisoner', 'chef', 'butler', 'saint']);
  S(r2, 'drunk').fakeRole = 'librarian';
  r2.phase = 'night'; r2.g.night = 1;
  r2.g.queue = [{ roleId: 'librarian', seatId: S(r2, 'drunk').id, at: 1 }];
  run(r2);
  assert.strictEqual(r2.g.step?.status, 'confirm', '停在給信息');
  ok(st(r2, 'confirm', { fields: { a: S(r2, 'chef').id, b: S(r2, 'saint').id, role: 'butler' } }));
  const info = log(r2).find(x => x.k === 'info');
  assert.ok(info && info.src === 'librarian' && info.real === 'drunk', '信息記下真實角色');
  console.log('酒鬼圖書管理員記下真實角色 ✔');
}
