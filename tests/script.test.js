// 上傳的劇本：Json 解析、模式鎖定、自製角色的登記和清理。用法：node tests/script.test.js
import assert from 'assert';
import { createRoom, remove } from '../lib/store.js';
import { applyStOp, joinPlayer } from '../lib/ops.js';
import { viewFor } from '../lib/view.js';
import { parseScript, registerScript, scriptPayload } from '../lib/script.js';
import { ROLES, SCRIPTS } from '../public/js/roles.js';
import { COMMUNITY } from '../public/js/community.js';

const parse = e => parseScript(e, 'abc');

// 內置角色：id 寬鬆匹配（大小寫、下劃線），只有這些角色時可以用智能推進
{
  const s = parse([{ id: '_meta', name: '測試', author: '某人' }, 'washerwoman', 'Fortune_Teller', { id: 'scarlet_woman' }, 'imp']);
  assert.deepStrictEqual(s.roles, ['washerwoman', 'fortuneteller', 'scarletwoman', 'imp']);
  assert.strictEqual(s.name, '測試');
  assert.strictEqual(s.author, '某人');
  assert.ok(s.auto, '全是內置角色');
  assert.deepStrictEqual(s.defs, {}, '內置角色不用另發數據');
}
// 官方但不在內置表裏的角色：只寫 id 也有中文名、能力、陣營，但只能手動
{
  const s = parse(['knight', 'imp']);
  assert.ok(!s.auto);
  assert.strictEqual(s.defs.knight.team, 'townsfolk');
  assert.strictEqual(s.defs.knight.name, '騎士');
  assert.ok(s.defs.knight.ability);
}
// 只寫了中文名的官方角色：繁簡都認
{
  assert.deepStrictEqual(parse([{ id: '某某', name: '洗衣妇' }, 'imp']).roles, ['washerwoman', 'imp']);
  assert.deepStrictEqual(parse([{ id: '某某', name: '洗衣婦' }, 'imp']).roles, ['washerwoman', 'imp']);
}
// 自製角色：按 Json 寫的顯示，id 帶房間前綴，能力太長的截斷
{
  const s = parse(['imp', { id: 'zhang_san', name: '張三', team: 'minion', ability: 'x'.repeat(999), firstNight: 12.5, otherNight: 0, reminders: ['中招', '中招'], remindersGlobal: ['全局'], image: 'http://evil.example/a.png' }]);
  const id = s.roles[1], d = s.defs[id];
  assert.ok(id.startsWith('habc_'));
  assert.ok(!s.auto);
  assert.strictEqual(d.name, '張三');
  assert.strictEqual(d.team, 'minion');
  assert.strictEqual(d.ability.length, 300);
  assert.strictEqual(d.first, 12.5);
  assert.strictEqual(d.other, 0);
  assert.deepStrictEqual(d.reminders, ['中招']);
  assert.ok(!('image' in d), '圖片鏈接不存');
  // 夜晚順序：Json 自己排的，用 Json 裏的 id
  const o = parse([{ id: '_meta', firstNight: ['dusk', 'zhang_san', 'imp', 'dawn'] }, 'imp', { id: 'zhang_san', name: '張三', team: 'minion', ability: '' }]);
  assert.deepStrictEqual(o.first, [o.roles[1], 'imp']);
}
// 認不出來的跳過並報出來；對象原型上的名字不能當角色；沒有可發的角色不算劇本
{
  const s = parse(['imp', 'nosuchrole', 'constructor', { id: '__proto__' }, { id: 'x', name: 'x', team: 'constructor', ability: '' }, 42, null]);
  assert.deepStrictEqual(s.roles, ['imp']);
  assert.strictEqual(s.skipped.length, 4);
  assert.strictEqual(typeof parse([]), 'string');
  assert.strictEqual(typeof parse('[]'), 'string');
  assert.strictEqual(typeof parse([{ id: '_meta' }]), 'string');
  assert.strictEqual(typeof parse(['nosuchrole']), 'string');
  assert.strictEqual(typeof parse([{ id: 'f', name: '傳奇', team: 'fabled', ability: '' }]), 'string', '只有傳奇角色發不了');
  assert.strictEqual(typeof parse(Array.from({ length: 200 }, (_, i) => ({ id: 'r' + i, name: 'r' + i, team: 'townsfolk', ability: '' }))), 'string', '角色太多');
}

// 上傳：換劇本、鎖模式、自製角色進角色表；刪房間時摘掉
{
  const r = createRoom();
  for (let i = 0; i < 7; i++) joinPlayer(r, 'p' + i, 'x' + i);
  assert.strictEqual(typeof applyStOp(r, { op: 'upload', entries: 'x' }), 'string');
  assert.strictEqual(r.scriptId, 'tb', '解析不了什麼都不變');
  const res = applyStOp(r, { op: 'upload', entries: [{ id: '_meta', name: '自製' }, 'chef', 'empath', 'monk', 'virgin', 'slayer', 'mayor', 'butler', 'saint', 'poisoner', 'spy', 'imp', { id: 'hb', name: '張三', team: 'townsfolk', ability: '能力' }] });
  assert.strictEqual(res.name, '自製');
  assert.ok(!res.auto);
  assert.strictEqual(r.scriptId, 'custom');
  const hb = r.script.roles.at(-1);
  assert.strictEqual(ROLES[hb].name, '張三');
  const v = viewFor(r, { st: true });
  assert.strictEqual(v.mode, 'manual');
  assert.ok(v.st.modeLocked);
  assert.ok(applyStOp(r, { op: 'mode', mode: 'auto' }), '有不認識的角色時不能選智能推進');
  // 可以切回內置劇本，再切回來
  assert.strictEqual(applyStOp(r, { op: 'script', scriptId: 'bmr' }), undefined);
  assert.strictEqual(viewFor(r, { st: true }).mode, 'auto');
  assert.strictEqual(applyStOp(r, { op: 'script', scriptId: 'custom' }), undefined);
  assert.strictEqual(viewFor(r, { st: true }).mode, 'manual');
  // 瀏覽器收到的那一份足夠登記角色
  const p = scriptPayload(r.script);
  assert.strictEqual(p.defs[hb].ability, '能力');
  assert.ok(JSON.stringify(p).length < 64 * 1024);
  // 重啟：存檔讀回來重新登記
  const saved = JSON.parse(JSON.stringify(r.script));
  delete ROLES[hb];
  r.script = saved; registerScript(r);
  assert.strictEqual(ROLES[hb].name, '張三');
  remove(r.code);
  assert.ok(!ROLES[hb], '房間刪除後自製角色摘掉');
}
// 全是內置角色的 Json 可以選智能推進，開得了局
{
  const r = createRoom();
  for (let i = 0; i < 7; i++) joinPlayer(r, 'p' + i, 'x' + i);
  applyStOp(r, { op: 'upload', entries: SCRIPTS.tb.roles });
  assert.strictEqual(viewFor(r, { st: true }).mode, 'auto');
  assert.strictEqual(applyStOp(r, { op: 'next' }), undefined);
  assert.strictEqual(r.phase, 'night');
  assert.ok(!r.g.manual);
}
// 社區劇本：每個角色都認得，auto 標記和解析結果一致，標準劇本 5 到 15 人都抽得出、開得了局
for (const c of COMMUNITY) {
  const s = parse([{ id: '_meta', name: c.name, author: c.author }, ...c.roles]);
  assert.strictEqual(typeof s, 'object', c.name);
  assert.deepStrictEqual(s.skipped, [], c.name);
  assert.strictEqual(s.roles.length, c.roles.length, c.name);
  assert.strictEqual(s.auto, !!c.auto, c.name);
  const sizes = c.small ? [5, 6] : [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (const n of sizes) for (let i = 0; i < 20; i++) {
    const r = createRoom();
    for (let p = 0; p < n; p++) joinPlayer(r, 'p' + p, 'x' + p);
    applyStOp(r, { op: 'upload', entries: [{ id: '_meta', name: c.name, author: c.author }, ...c.roles] });
    assert.strictEqual(viewFor(r, { st: true }).mode, c.auto ? 'auto' : 'manual', c.name);
    assert.strictEqual(applyStOp(r, { op: 'next' }), undefined, `${c.name} ${n} 人`);
    assert.strictEqual(r.phase, 'night');
    remove(r.code);
  }
}
console.log('上傳劇本測試通過 ✔');
process.exit(0);
