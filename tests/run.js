// npm test：依次跑 tests/*.test.js，有一個失敗就以非零退出
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  console.log(`${r.status === 0 ? '✓' : '✗'} ${f}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
