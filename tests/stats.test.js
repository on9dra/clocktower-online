// 運營統計：開局、終局、半路回大廳、房間被解散都記成一局；玩家標識不原樣落盤。用法：node tests/stats.test.js
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'));
process.env.DATA_DIR = dir;
const stats = await import('../lib/stats.js');
const { setup } = await import('./helpers.js');
const { endGame } = await import('../lib/rules.js');
const wait = ms => new Promise(r => setTimeout(r, ms));

// 打完一局：記一條，帶勝負和人數；終局後再推送不重複記
const a = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint']);
a.g.statAt = Date.now() - 30 * 6e4;
stats.observe(a);
assert.strictEqual(stats.running().length, 1);
endGame(a, 'good', '測試');
stats.observe(a); stats.observe(a);
assert.strictEqual(stats.running().length, 0);

// 半路回大廳：記成中止
const b = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
stats.observe(b);
b.phase = 'lobby';
stats.observe(b);

// 房間被解散：下一次取樣時收掉
const c = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint', 'virgin']);
stats.observe(c);
stats.sample([], [], () => undefined);

// 棄局：大家走了 3 小時後房間才被清掉，時長只算到最後一次操作（開局後 20 分鐘）
const d = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint', 'virgin', 'empath']);
d.g.statAt = Date.now() - 200 * 6e4; d.updatedAt = Date.now(); d.actedAt = Date.now() - 180 * 6e4;
stats.observe(d);
assert.strictEqual(stats.running()[0].last, d.actedAt, '重連刷新的 updatedAt 不算最後操作');
stats.sample([], [], () => undefined);
await wait(200);

const games = stats.read('games', 1);
assert.strictEqual(games.length, 4, JSON.stringify(games));
const [g1, g2, g3] = [6, 5, 7].map(n => games.find(g => g.n === n));
assert.deepStrictEqual([g1.winner, g1.n, g1.mins], ['good', 6, 30]);
assert.deepStrictEqual([g2.winner, g2.n], [null, 5]);
assert.deepStrictEqual([g3.winner, g3.n], [null, 7]);
assert.deepStrictEqual([games.find(g => g.n === 8).winner, games.find(g => g.n === 8).mins], [null, 20]);
assert.ok(g1.who.every(x => /^[0-9a-f]{8}$/.test(x)) && !JSON.stringify(games).includes('"p0"'), '玩家標識只留摘要');
assert.strictEqual(stats.read('samples', 1).length, 2);

// 訪問：同一個瀏覽器刷新不重記，換個人記；爬蟲、curl 不算
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
stats.visit('1.2.3.4', UA); stats.visit('1.2.3.4', UA); stats.visit('5.6.7.8', UA);
stats.visit('9.9.9.9', 'curl/8.0'); stats.visit('9.9.9.9', 'Mozilla/5.0 (compatible; Googlebot/2.1)');
await wait(200);
const visits = stats.read('visits', 1);
assert.strictEqual(visits.length, 2, JSON.stringify(visits));
assert.ok(visits.every(v => /^[0-9a-f]{8}$/.test(v.v)) && !JSON.stringify(visits).includes('1.2.3.4'), 'IP 只留摘要');

// 模式：線上 / 線下多設備 / 線下單設備分開記；單設備座位認不出是誰，不進 who；桌邊沒連上的線下玩家記進樣本的 off
const e = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier']);
Object.assign(e.settings, { chosen: true, venue: 'offline', devices: 'one' });
e.seats.forEach(s => s.local = true);
e.updatedAt = e.actedAt = Date.now();
assert.strictEqual(stats.mode(e), 'one');
assert.strictEqual(stats.away(e, stats.presence(e, [])), 5);
assert.strictEqual(stats.away({ ...e, actedAt: Date.now() - 3600e3 }, stats.presence(e, [])), 0, '散了的線下局不算');
assert.strictEqual(stats.away({ ...e, actedAt: Date.now() - 20 * 6e4 }, { st: 1, on: 0, watch: 0 }), 5, '30 分鐘內還算在玩');
assert.strictEqual(stats.away({ ...e, actedAt: Date.now() - 31 * 6e4 }, { st: 1, on: 0, watch: 0 }), 0, '說書人頁面開着但半小時沒操作，不算');
assert.strictEqual(stats.away({ ...e, actedAt: Date.now() - 31 * 6e4, updatedAt: Date.now() }, { st: 1, on: 0, watch: 0 }), 0, '說書人重連不算操作');
stats.observe(e);
assert.strictEqual(stats.running()[0].mode, 'one');
stats.sample([e], [], () => e);
endGame(e, 'evil', '測試');
stats.observe(e);
e.settings.devices = 'many';
assert.strictEqual(stats.mode(e), 'multi');
e.settings.venue = 'online';
assert.strictEqual(stats.mode(e), 'on');
// 舊記錄只有 manual：讀出來換成 mode
fs.appendFileSync(path.join(dir, 'stats', `games-${new Date().toISOString().slice(0, 7)}.jsonl`), JSON.stringify({ t: Date.now(), n: 9, manual: true }) + '\n' + JSON.stringify({ t: Date.now(), n: 10, manual: false }) + '\n');
await wait(200);
const g2s = stats.read('games', 1), one = g2s.find(g => g.n === 5 && g.winner === 'evil');
assert.deepStrictEqual([one.mode, one.who], ['one', []]);
assert.deepStrictEqual([g2s.find(g => g.n === 9).mode, g2s.find(g => g.n === 10).mode], ['off', 'on']);
assert.ok(g2s.every(g => !('manual' in g)));
assert.strictEqual(stats.read('samples', 1).at(-1).off, 5);

// 說書人的設備和網絡：只留摘要（網絡地址加鹽），跟著對局記錄走；換網絡多記一個；同一台設備當玩家時是同一個標識
const f = setup(['chef', 'imp', 'poisoner', 'monk', 'soldier', 'saint', 'virgin', 'empath', 'mayor']);
stats.host(f, 'host-device', '11.22.33.44'); stats.host(f, 'host-device', '11.22.33.44'); stats.host(f, null, '55.66.77.88');
assert.ok(/^[0-9a-f]{8}$/.test(f.host.dev) && f.host.nets.length === 2);
stats.observe(f);
assert.strictEqual(stats.running().at(-1).dev, f.host.dev);
endGame(f, 'good', '測試');
stats.observe(f);
// 留存：打開、建房、進房各記一筆，30 分鐘內同一件事不重記；沒有標識的不記
stats.step('host-device', 'open'); stats.step('host-device', 'open'); stats.step('host-device', 'create'); stats.step('guest', 'open'); stats.step(null, 'open');
await wait(200);
const g9 = stats.read('games', 1).find(g => g.n === 9 && g.winner === 'good'), steps = stats.read('steps', 1);
assert.deepStrictEqual([g9.dev, g9.net], [f.host.dev, f.host.nets]);
assert.deepStrictEqual(steps.map(s => s.k).sort(), ['create', 'open', 'open']);
assert.strictEqual(steps.find(s => s.k === 'create').d, g9.dev, '建房的設備和對局記錄裏的說書人對得上');
const disk = fs.readdirSync(path.join(dir, 'stats')).filter(n => n !== 'salt').map(n => fs.readFileSync(path.join(dir, 'stats', n), 'utf8')).join('');
assert.ok(!/11\.22\.33\.44|host-device/.test(disk + JSON.stringify(f.host)), 'IP 和設備標識不原樣落盤');
fs.rmSync(dir, { recursive: true, force: true });
console.log('stats tests ok');
