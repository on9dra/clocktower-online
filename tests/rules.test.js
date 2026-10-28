// 規則測試：固定角色，驗證關鍵規則。用法：node tests/rules.test.js
import assert from 'assert';
import { createRoom } from '../lib/store.js';
import { applyStOp, applyPlayerAction, joinPlayer } from '../lib/ops.js';
import { startNight } from '../lib/engine.js';
import { viewFor } from '../lib/view.js';
import { setup, S, act, st, pl, ok, atReview, runOnly } from './helpers.js';

// 僧侶保護成功
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.ok(atReview(r), '夜晚走完停在天亮前確認');
  assert.strictEqual(S(r, 'chef').dead, false, '被保護的廚師不死');
}
// 僧侶中毒 → 保護無效；士兵免疫
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'monk').id]);
  act(r, 'monk', [S(r, 'chef').id]);
  assert.strictEqual(r.g.step.decide?.kind, 'ability', '中毒僧侶：說書人裁定');
  ok(st(r, 'decide', { choice: 'fail' }));
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(S(r, 'chef').dead, true, '中毒僧侶保護無效');
  r.phase = 'dawn';
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'soldier').id]);
  assert.strictEqual(S(r, 'soldier').dead, false, '士兵免疫惡魔');
}
// 小惡魔自殺，紅唇女郎接任
{
  const r = setup(['monk', 'imp', 'scarletwoman', 'chef', 'soldier', 'saint']);
  const sw = S(r, 'scarletwoman');
  startNight(r);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'imp').id]);
  assert.strictEqual(sw.role, 'imp', '紅唇女郎變成小惡魔');
  assert.notStrictEqual(r.phase, 'ended');
}
// 貞潔者：鎮民提名 → 提名者被處決
{
  const r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  assert.strictEqual(r.phase, 'day');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(!r.g.ruling && r.nomination, '貞潔者：投票照常開始，不停頓');
  assert.ok(r.g.virginCheck?.auto && r.g.virginCheck.forced && r.g.virginCheck.due > Date.now() + 25000, '必定反噬：30 秒後自動');
  ok(pl(r, 'imp', 'vote', { v: 'yes' }));
  assert.ok(st(r, 'virgin', { work: false }), '健康貞潔者：沒有不反噬的選項');
  ok(st(r, 'startCount'));
  assert.ok(!r.nomination?.clock, '喊計票前先反噬');
  assert.strictEqual(S(r, 'chef').dead, true);
  assert.strictEqual(r.g.dayOver, true);
  assert.strictEqual(r.nomination, null, '反噬中止投票');
  assert.strictEqual(r.history.length, 0);
}
// 聖徒被處決 → 邪惡獲勝
{
  const r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'saint').id });
  for (const s of r.seats) applyPlayerAction(r, s.pid, { act: 'vote', up: true });
  st(r, 'next');
  assert.strictEqual(r.g.ruling?.kind, 'saint');
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(r.winner, 'evil');
}
// 中毒聖徒被處決：說書人裁定無效 → 遊戲繼續、入夜
{
  const r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  r.g.poisoned = S(r, 'saint').id;
  pl(r, 'chef', 'nominate', { targetId: S(r, 'saint').id });
  for (const s of r.seats) applyPlayerAction(r, s.pid, { act: 'vote', up: true });
  st(r, 'next');
  assert.strictEqual(r.g.ruling?.auto, false, '中毒聖徒：推薦無效');
  ok(st(r, 'rule', { work: false }));
  assert.strictEqual(r.winner, null);
  assert.strictEqual(r.phase, 'night');
}
// 獵手射中惡魔 → 善良獲勝
{
  const r = setup(['slayer', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'slayer', 'slay', { targetId: S(r, 'imp').id });
  assert.ok(r.g.ruling?.auto && r.g.ruling.real, '獵手開槍：等說書人裁定');
  assert.ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'saint').id }), '裁定前不能提名');
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(r.winner, 'good');
}
// 中毒獵手：說書人也可以裁定命中
{
  const r = setup(['slayer', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  r.g.poisoned = S(r, 'slayer').id;
  pl(r, 'slayer', 'slay', { targetId: S(r, 'imp').id });
  assert.strictEqual(r.g.ruling?.auto, false);
  ok(st(r, 'rule', { work: true }));
  assert.strictEqual(r.winner, 'good');
}
// 中毒士兵被惡魔攻擊：說書人裁定免疫生效
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'soldier').id]);
  act(r, 'monk', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'soldier').id]);
  assert.strictEqual(r.g.step.decide?.role, 'soldier');
  ok(st(r, 'decide', { choice: 'work' }));
  assert.strictEqual(S(r, 'soldier').dead, false);
}
// 中毒的共情者需要說書人確認（可給假信息）
{
  const r = setup(['empath', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'empath').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(r.g.step.status, 'confirm');
  assert.ok(r.g.step.form.free && r.g.step.form.why === 'poison', '中毒時可以給錯誤信息');
  assert.ok(st(r, 'confirm', { fields: { n: 9 } }), '超出範圍的數字要被拒絕');
  assert.strictEqual(st(r, 'confirm', { fields: { n: (r.g.step.form.truth.n + 1) % 3 } }), undefined);
  assert.ok(r.chat.some(m => m.to === S(r, 'empath').id && m.text.includes('名邪惡玩家')));
  assert.ok(atReview(r));
}
// 能力正常時只能給合規信息；說書人改成中毒後放開
{
  const r = setup(['empath', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'chef').id]);
  act(r, 'imp', [S(r, 'soldier').id]);
  const lie = { n: (r.g.step.form.truth.n + 1) % 3 };
  assert.ok(st(r, 'confirm', { fields: lie }), '健康時錯誤信息要被拒絕');
  ok(st(r, 'setPoison', { seatId: S(r, 'empath').id }));
  assert.ok(r.g.step.form.free);
  ok(st(r, 'confirm', { fields: lie }));
}
// 演出事件：提名的目標不會把事件的接收範圍蓋掉，私人事件只給本人
{
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
  const fxOf = role => viewFor(r, { pid: S(r, role).pid }).fx.map(e => e.k);
  assert.ok(fxOf('saint').includes('nominate'), '所有人都收到提名演出');
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  assert.ok(fxOf('poisoner').includes('act') && !fxOf('chef').includes('act'), '自己的行動只給自己');
  assert.ok(viewFor(r, { st: true }).fx.some(e => e.k === 'grim'), '說書人魔典演出');
}
// 天亮前確認：確認後公佈死訊並直接進入白天
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  assert.ok(st(r, 'next'), '夜晚不能用主按鈕跳過');
  assert.strictEqual(st(r, 'dawn'), undefined);
  assert.strictEqual(r.phase, 'day');
  assert.deepStrictEqual(r.g.lastNight, [S(r, 'chef').id]);
  assert.ok(r.chat.some(m => m.text?.includes('昨晚') && m.text.includes('死亡')));
}
console.log('規則測試全部通過 ✔');
// 洗衣婦：只要選中的兩人裏有一人真是該角色，就算真實信息
{
  const { isTruth } = await import('../public/js/infofmt.js');
  const form = { kind: 'two', truth: { a: 'x', b: 'y', role: 'chef' }, roleOf: { x: 'chef', z: 'monk' } };
  assert.ok(isTruth(form, { a: 'q', b: 'x', role: 'chef' }));
  assert.ok(!isTruth(form, { a: 'y', b: 'q', role: 'chef' }), '兩人都不是廚師就是錯誤信息');
  assert.ok(isTruth(form, { a: 'z', b: 'q', role: 'monk' }));
  console.log('信息真假判定通過 ✔');
}
// 7 人以下隨機時不會抽到男爵
{
  for (let i = 0; i < 200; i++) {
    const room = createRoom();
    for (let k = 0; k < 5 + (i % 2); k++) joinPlayer(room, 'p' + k, 'n' + k);
    applyStOp(room, { op: 'next' });
    assert.ok(!room.seats.some(s => s.role === 'baron'), '5-6 人局不應出現男爵');
  }
  console.log('小人數局不抽男爵 ✔');
}
// 夜裏的死亡在天亮前不對玩家公開
{
  const { viewFor } = await import('../lib/view.js');
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'monk', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'monk').id]);
  assert.ok(atReview(r));
  assert.strictEqual(viewFor(r, { pid: S(r, 'chef').pid }).seats.find(x => x.id === S(r, 'monk').id).dead, false, '玩家夜裏看不到死亡');
  assert.strictEqual(viewFor(r, { st: true }).seats.find(x => x.id === S(r, 'monk').id).dead, true, '說書人看得到');
  console.log('夜間死亡隱藏 ✔');
}
// 信息自動帶座位標記：占卜師的兩個目標都被標上
{
  const r = setup(['fortuneteller', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'imp', [S(r, 'chef').id]);
  act(r, 'fortuneteller', [S(r, 'imp').id, S(r, 'soldier').id]);
  st(r, 'confirm', { fields: { yes: true } });
  const msg = r.chat.find(m => m.to === S(r, 'fortuneteller').id && m.marks && m.marks.length);
  assert.deepStrictEqual(msg.marks.map(m => m.seatId).sort(), [S(r, 'imp').id, S(r, 'soldier').id].sort());
  console.log('信息座位標記 ✔');
}
// 惡魔信息裏的三個偽裝：只有惡魔的視角帶著（左下角偽裝卡），爪牙和善良玩家沒有；換成善良角色後收起
{
  const { viewFor } = await import('../lib/view.js');
  const r = setup(['imp', 'poisoner', 'chef', 'soldier', 'saint', 'monk', 'empath']);
  r.g.bluffs = ['mayor', 'virgin', 'slayer'];
  const { run } = await import('../lib/engine.js');
  r.phase = 'night'; r.g.night = 1; r.g.queue = [{ roleId: 'demoninfo', at: 9 }];
  run(r);
  const v = role => viewFor(r, { pid: S(r, role).pid }).bluffs;
  assert.deepStrictEqual(v('imp'), ['mayor', 'virgin', 'slayer']);
  assert.strictEqual(v('poisoner'), null);
  assert.strictEqual(v('chef'), null);
  r.g.bluffs = ['ravenkeeper', 'undertaker', 'recluse'];
  assert.deepStrictEqual(v('imp'), ['mayor', 'virgin', 'slayer'], '說書人改了偽裝，惡魔看到的還是當時告訴他的');
  S(r, 'imp').role = 'snakecharmer';
  assert.strictEqual(v('snakecharmer'), null);
  console.log('惡魔偽裝卡 ✔');
}
// 放棄本局：回到準備階段，玩家保留
{
  const r = setup(['monk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  assert.strictEqual(st(r, 'abandon'), undefined);
  assert.strictEqual(r.phase, 'lobby');
  assert.strictEqual(r.seats.length, 6);
  assert.ok(r.seats.every(s => !s.role && !s.dead));
  console.log('放棄本局 ✔');
}
// 洗衣婦信息裏兩名玩家的順序是隨機的
{
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const r = setup(['washerwoman', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
    await runOnly(r, 'washerwoman');
    st(r, 'confirm', { fields: { a: S(r, 'chef').id, b: S(r, 'saint').id, role: 'chef' } });
    seen.add(r.chat.filter(m => m.to === S(r, 'washerwoman').id).at(-1).text.slice(0, 2));
  }
  assert.strictEqual(seen.size, 2, '兩種順序都應該出現');
  console.log('信息玩家順序隨機 ✔');
}
// 棄權：不計票；只有自己和說書人看得到；死亡票用過的人也能棄權；被數過的贊成不能改
{
  const { viewFor } = await import('../lib/view.js');
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
  ok(pl(r, 'soldier', 'vote', { v: 'abstain' }));
  ok(pl(r, 'saint', 'vote', { v: 'yes' }));
  ok(pl(r, 'saint', 'vote', { v: 'abstain' }));
  assert.strictEqual(r.nomination.votes[S(r, 'saint').id], false, '改成棄權時放下手');
  ok(pl(r, 'chef', 'vote', { up: true }));
  S(r, 'monk').dead = true; S(r, 'monk').voteUsed = true;
  assert.ok(pl(r, 'monk', 'vote', { v: 'yes' }), '死亡票用過不能贊成');
  ok(pl(r, 'monk', 'vote', { v: 'abstain' }));
  const sv = viewFor(r, { pid: S(r, 'soldier').pid }).nomination.abstain;
  assert.deepStrictEqual(Object.keys(sv), [S(r, 'soldier').id], '玩家只看到自己的棄權');
  assert.deepStrictEqual(viewFor(r, { pid: S(r, 'chef').pid }).nomination.abstain, {}, '別人看不到棄權');
  assert.strictEqual(Object.keys(viewFor(r, { st: true }).nomination.abstain).length, 3, '說書人看到全部棄權');
  st(r, 'closeVote');
  const h = r.history.at(-1);
  assert.strictEqual(h.count, 1, '棄權不計入票數');
  assert.ok(!r.chat.at(-1).text.includes('棄權'), '公告裏不列棄權的人');
  assert.strictEqual(r.g.log.at(-1).e.abstain.length, 3, '說書人日誌記下棄權');
  console.log('棄權票 ✔');
}
// 投票倒數：提名後 5 分鐘；說書人可以暫停 / 繼續 / 重置；計票開始後不能再動
{
  const { VOTE_WINDOW, CALL_MS, countDue } = await import('../lib/day.js');
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
  const n = r.nomination;
  assert.strictEqual(n.deadline - n.at, VOTE_WINDOW, '提名後倒數 5 分鐘');
  assert.strictEqual(countDue(r), n.deadline);
  n.deadline -= 60000;
  ok(st(r, 'pauseTimer'));
  assert.ok(n.paused > VOTE_WINDOW - 61000 && n.paused <= VOTE_WINDOW - 60000, '暫停時記下剩餘時間');
  assert.strictEqual(countDue(r), null, '暫停中不自動結算');
  ok(st(r, 'resetTimer'));
  assert.strictEqual(n.paused, VOTE_WINDOW, '暫停中重置：保持暫停、剩餘回到 5 分鐘');
  ok(st(r, 'pauseTimer'));
  assert.strictEqual(n.paused, null);
  assert.ok(Math.abs(n.deadline - Date.now() - VOTE_WINDOW) < 50, '繼續後從剩餘時間接著數');
  ok(st(r, 'startCount'));
  assert.ok(n.clock.at >= Date.now() + CALL_MS - 50, '立即計票：先播全屏提示，時鐘稍後才開始');
  assert.strictEqual(r.fx.at(-1).k, 'callvote', '給所有人推全屏提示');
  assert.ok(st(r, 'pauseTimer'), '計票開始後不能暫停');
  console.log('投票倒數 ✔');
}
// 自動結算的計時器：到點結算；倒數被重置會換一個新的到點時刻
{
  const { countTick } = await import('../lib/day.js');
  const r = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
  st(r, 'next');
  ok(pl(r, 'chef', 'nominate', { targetId: S(r, 'monk').id }));
  let changed = 0;
  r.nomination.deadline = Date.now() + 40;
  countTick(r, () => changed++);
  r.nomination.deadline = Date.now() + 120; // 重置：舊的到點不再結算
  countTick(r, () => changed++);
  await new Promise(res => setTimeout(res, 80));
  assert.ok(r.nomination, '舊的到點不結算');
  await new Promise(res => setTimeout(res, 160));
  assert.strictEqual(r.nomination, null, '到點自動結算');
  assert.strictEqual(changed, 1);
  console.log('自動結算計時器 ✔');
}
// 死因：處決、獵手、夜殺分別記下（座位上蓋對應的章）；玩家視角夜裏看不到今晚的死因
{
  const r = setup(['slayer', 'imp', 'poisoner', 'chef', 'soldier', 'saint', 'monk']);
  st(r, 'next');
  ok(st(r, 'execute', { seatId: S(r, 'chef').id }));
  assert.strictEqual(S(r, 'chef').deathBy, 'execute');
  const v = viewFor(r, { pid: S(r, 'monk').pid });
  assert.strictEqual(v.seats.find(x => x.id === S(r, 'chef').id).deathBy, 'execute');
  assert.strictEqual(v.seats.find(x => x.id === S(r, 'monk').id).deathBy, null);
  console.log('死因 ✔');
}
// 貞潔者反噬的提名者：死因單獨記
{
  const r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  ok(st(r, 'closeVote'));
  assert.strictEqual(S(r, 'chef').deathBy, 'virgin', '結算前先反噬');
  assert.strictEqual(r.history.length, 0, '不存在結算後反噬：這次投票沒有結算');
  console.log('反噬死因 ✔');
}
// 貞潔者 30 秒到點自動反噬；結束白天時也先反噬
{
  const { virginTick } = await import('../lib/day.js');
  let r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  r.code = 'T30';
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  r.g.virginCheck.due = Date.now() + 5;
  let changed = 0;
  virginTick(r, () => changed++);
  await new Promise(res => setTimeout(res, 120));
  assert.ok(changed === 1 && S(r, 'chef').dead && !r.nomination, '到點自動反噬');
  r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  ok(st(r, 'next'));
  assert.ok(S(r, 'chef').dead && r.phase === 'night', '結束白天：先反噬再入夜');
  // 取消觸發貞潔者的提名：能力退回
  r = setup(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  st(r, 'next');
  pl(r, 'chef', 'nominate', { targetId: S(r, 'virgin').id });
  ok(st(r, 'cancelVote'));
  assert.ok(!r.g.virginCheck && !r.g.virginUsed);
  console.log('貞潔者自動反噬 ✔');
}
// 只有一種結果的裁定：說書人只能確認，反著選會被拒絕；能力可能失效 / 有登記可選時才二選一
{
  const day = roles => { const r = setup(roles); st(r, 'next'); return r; };
  // 以為自己是獵手的酒鬼：必定未中
  let r = day(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'drunk').fakeRole = 'slayer';
  pl(r, 'drunk', 'slay', { targetId: S(r, 'imp').id });
  assert.ok(r.g.ruling.forced && r.g.ruling.auto === false, '酒鬼開槍：只有未中');
  assert.ok(st(r, 'rule', { work: true }), '不能裁定命中');
  ok(st(r, 'rule', { work: false }));
  assert.deepStrictEqual(viewFor(r, { pid: S(r, 'chef').pid }).shots, [{ from: S(r, 'drunk').id, to: S(r, 'imp').id, hit: false }], '射空公開記錄');
  // 健康的真獵手射非惡魔：必定未中；射惡魔：必定命中
  r = day(['slayer', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'chef').id });
  assert.ok(r.g.ruling.forced && !r.g.ruling.auto);
  // 中毒的真獵手射惡魔：二選一，推薦未中
  r = day(['slayer', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  r.g.poisoned = S(r, 'slayer').id;
  pl(r, 'slayer', 'slay', { targetId: S(r, 'imp').id });
  assert.ok(!r.g.ruling.forced && !r.g.ruling.auto, '中毒獵手：說書人定');
  // 健康的真獵手射隱士：隱士可以被當作惡魔，二選一
  r = day(['slayer', 'imp', 'poisoner', 'recluse', 'soldier', 'saint']);
  pl(r, 'slayer', 'slay', { targetId: S(r, 'recluse').id });
  assert.ok(!r.g.ruling.forced && r.g.ruling.reg === 'recluse');
  // 貞潔者：小惡魔提名必定無事，間諜提名二選一
  r = day(['virgin', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  pl(r, 'imp', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(r.nomination && !r.g.virginCheck && r.g.virginUsed, '惡魔提名貞潔者：必定無事，不開小窗');
  r = day(['virgin', 'imp', 'spy', 'chef', 'soldier', 'saint']);
  pl(r, 'spy', 'nominate', { targetId: S(r, 'virgin').id });
  assert.ok(!r.g.virginCheck.forced && r.g.virginCheck.reg === 'spy' && !r.g.virginCheck.due, '間諜提名貞潔者：說書人定');
  assert.ok(st(r, 'startCount'), '需要裁定時不能計票');
  ok(st(r, 'virgin', { work: false }));
  ok(st(r, 'startCount'));
  // 以為自己是貞潔者的酒鬼：必定無事
  r = day(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'drunk').fakeRole = 'virgin';
  pl(r, 'chef', 'nominate', { targetId: S(r, 'drunk').id });
  assert.ok(r.nomination && !r.g.virginCheck && r.g.virginUsed, '酒鬼貞潔者：無事');
  // 以為自己是鎮長的酒鬼：剩三人無人處決也停下，只有入夜
  r = day(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'drunk').fakeRole = 'mayor';
  for (const x of ['poisoner', 'chef', 'soldier']) S(r, x).dead = true;
  ok(st(r, 'next'));
  assert.ok(r.g.ruling?.kind === 'mayor' && r.g.ruling.forced && !r.g.ruling.auto, '酒鬼鎮長：停下，只有入夜');
  assert.ok(st(r, 'rule', { work: true }), '不能判善良獲勝');
  ok(st(r, 'rule', { work: false }));
  assert.strictEqual(r.phase, 'night');
  console.log('裁定選項 ✔');
}
// 以為自己是僧侶的酒鬼：停下裁定，只有「無效」
{
  const r = setup(['drunk', 'imp', 'poisoner', 'chef', 'soldier', 'saint']);
  S(r, 'drunk').fakeRole = 'monk';
  startNight(r);
  act(r, 'poisoner', [S(r, 'saint').id]);
  act(r, 'drunk', [S(r, 'chef').id]);
  assert.deepStrictEqual(r.g.step.decide.options.map(o => o.id), ['fail'], '酒鬼僧侶只有無效');
  assert.ok(st(r, 'decide', { choice: 'work' }), '不能判生效');
  ok(st(r, 'decide', { choice: 'fail' }));
  act(r, 'imp', [S(r, 'chef').id]);
  assert.strictEqual(S(r, 'chef').dead, true);
  console.log('酒鬼僧侶 ✔');
}
