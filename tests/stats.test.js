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
d.g.statAt = Date.now() - 200 * 6e4; d.updatedAt = Date.now() - 180 * 6e4;
stats.observe(d);
assert.strictEqual(stats.running()[0].last, d.updatedAt);
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
fs.rmSync(dir, { recursive: true, force: true });
console.log('stats tests ok');
