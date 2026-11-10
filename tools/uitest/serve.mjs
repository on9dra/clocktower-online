// rig.mjs 用它來跑快照裏的 server.js：多一條 IPC 通道，好讓 rig 先把房間寫盤再停服務（Windows 上 kill 是硬殺，server.js 自己的 SIGINT 存盤走不到）。
// 用法（rig.mjs 內部）：在快照目錄裏 spawn node tools/uitest/serve.mjs，stdio 帶 'ipc'。消息：
//   'flush' 寫盤後回 'flushed'；'reload' 把房間目錄裏的存檔讀進內存（同號的換成磁盤上的，preset / load 不用重啓服務）後回 'reloaded'；'stop' 寫盤並退出
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const at = p => pathToFileURL(path.resolve(p)).href;
const store = await import(at('lib/store.js')); // 和 server.js 裏 import 的是同一個模塊實例（同一個網址）
process.on('message', m => {
  if (m === 'flush') { store.flushSync(); process.send('flushed'); }
  if (m === 'reload') { store.load(); process.send('reloaded'); }
  if (m === 'stop') process.emit('SIGINT'); // server.js 的 SIGINT：flushSync 再退出
});
await import(at('server.js'));
