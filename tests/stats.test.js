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
await wait(200);

const games = stats.read('games', 1);
assert.strictEqual(games.length, 3, JSON.stringify(games));
const [g1, g2, g3] = [6, 5, 7].map(n => games.find(g => g.n === n));
assert.deepStrictEqual([g1.winner, g1.n, g1.mins], ['good', 6, 30]);
assert.deepStrictEqual([g2.winner, g2.n], [null, 5]);
assert.deepStrictEqual([g3.winner, g3.n], [null, 7]);
assert.ok(g1.who.every(x => /^[0-9a-f]{8}$/.test(x)) && !JSON.stringify(games).includes('"p0"'), '玩家標識只留摘要');
assert.strictEqual(stats.read('samples', 1).length, 1);
fs.rmSync(dir, { recursive: true, force: true });
console.log('stats tests ok');
