// 復現服務器出錯：node tools/replay.mjs <快照.json>
// 快照從 /admin「問題」→ 錯誤 → 展開 → 快照 下載（服務器上在 data/logs/crash/）。裏面是出錯那次操作之前的房間和那次操作：
// 讀進來、原樣再做一遍，打印報錯和調用棧；沒報錯就打印結果。用臨時目錄當 DATA_DIR，不碰 data/
import fs from 'fs';
import os from 'os';
import path from 'path';

const file = process.argv[2];
if (!file) { console.log('用法：node tools/replay.mjs <快照.json>'); process.exit(1); }
const { meta, room } = JSON.parse(fs.readFileSync(file, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-'));
process.env.DATA_DIR = tmp;
fs.mkdirSync(path.join(tmp, 'rooms'), { recursive: true });
room.updatedAt = Date.now(); // 舊房間讀的時候會被當成過期清掉
fs.writeFileSync(path.join(tmp, 'rooms', room.code + '.json'), JSON.stringify(room));
const store = await import('../lib/store.js');
const { applyStOp, applyPlayerAction } = await import('../lib/ops.js');
const { viewFor } = await import('../lib/view.js');
store.load(); // 和服務器重啓時一樣補齊字段、登記上傳的劇本
const r = store.get(room.code);
const seat = by => r.seats[Number(String(by).replace(/^st>/, '')) - 1];

console.log(`${new Date(meta.t).toLocaleString()}  房間 ${r.code}  ${meta.where}  ${meta.by ?? meta.viewer ?? ''}  版本 ${meta.build}`);
console.log('當時：', meta.msg);
console.log('操作：', JSON.stringify(meta.o));
try {
  let out;
  if (meta.where === 'op') out = applyStOp(r, meta.o, true);
  else if (meta.where === 'act') out = applyPlayerAction(r, seat(meta.by).pid, meta.o);
  else if (meta.where === 'view') out = viewFor(r, meta.viewer === 'st' ? { st: true } : { pid: seat(meta.viewer).pid }) && '（畫面數據生成成功）';
  else { console.log('這種快照（' + meta.where + '）只有當時的房間，沒有可以重放的操作；房間在', path.join(tmp, 'rooms')); process.exit(0); }
  console.log('\n沒有復現：', out === undefined ? '操作成功' : JSON.stringify(out));
} catch (e) {
  console.log('\n復現了：');
  console.log(e.stack);
  process.exitCode = 2;
}
