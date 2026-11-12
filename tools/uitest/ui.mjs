// 操作 rig.mjs 起的設備。用法：node tools/uitest/ui.mjs <控制端口> <命令> [參數…]
//   open <設備> home|room|<網址> [寬 高]   開一台設備並打開頁面。設備名：st（說書人，默認 1280x800）、p1 p2…（玩家手機，默認 375x664）
//                                         home = 首頁；room = 說書人當前房間的分享鏈接（說書人建好房間後才有）
//   join <設備> <暱稱> [寬 高]   玩家手機進房間（打開分享鏈接、輸入暱稱、點「加入房间」，一步做完）
//   look <設備> [all]    現在屏幕上有什麼：各區域的文字、座位、能點的東西（帶座標）、點不到的東西
//   tap <設備> <按鈕文字> [第幾個]   像人一樣點那個按鈕（先做命中測試；在屏幕外 / 被擋住就不點並報告）
//   seat <設備> <座位號>    點圓桌上的座位
//   tapxy <設備> <x> <y>    點一個座標（看了截圖才用）
//   press <設備> <按鈕文字>|<x y> [touch]  按住不放（按住看身份）；release <設備> [x y] 鬆手（給了座標 = 滑到那裏再鬆）
//   type <設備> <文字>      往當前焦點輸入（先 tap 輸入框）      key <設備> Enter|Escape|Backspace
//   scroll <設備> <dy>      滾輪      hover <設備> <x> <y>      resize <設備> <寬> <高>
//   shot <設備> [名字]      截圖，返回 PNG 路徑（用 Read 看）
//   upload <設備> <文件>    指定下一次文件選擇框要選的文件（先 upload，再 tap「上传剧本」）
//   text <設備> [css選擇器]  讀頁面上的文字（默認整頁，最多 3500 字）
//   who                    每台設備一行：輪到誰了、誰有投票鍵、誰有彈窗
//   errors [設備]          頁面報錯（讀完清空）      serverlog   服務端最後 30 行輸出
//   wait <毫秒>            等一會兒（最多 70 秒）      close   全部關掉
//
// 開發者用（測試員須知裏不給；README 前半有例子）：
//   preset 鍵=值…          直接擺出一個局面並打開設備、截圖（參數見 preset.mjs 開頭；另有 phones= stsize= phonesize= shot=0）
//   save <名字> / load <名字> / saves    存檔、讀檔、列出存檔（房間 + 每台設備的身份和網址）
//   sync [文件…]           把改過的代碼同步進快照：public 的刷新頁面，lib / server.js 的重啓服務（房間不丟）
//   restart / reload [設備] / fast on|off / devices / drop <設備> / status
//   views <設備> [all|寬x高…]   一次截幾種屏幕（默認 說書人：電腦、手機、橫屏；all = 再加矮屏和小屏）      link <設備>   給內置瀏覽器面板用的網址
//   eval <設備> <JS>        在頁面裏跑一段 JS      measure <設備> <選擇器> [樣式 / --變量…]   量位置尺寸和樣式
// preset、load 時 rig 沒在跑，就自動在後台起一台（名字 auto<端口>，服務 = 控制端口 - 2），一個半小時沒人用自己收攤
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ctl, cmd, ...args] = process.argv.slice(2);
const call = () => fetch(`http://127.0.0.1:${ctl}/`, { method: 'POST', body: JSON.stringify({ cmd, args }) }).then(r => r.text());
let out;
try { out = await call(); } catch (e) {
  if (!['preset', 'load'].includes(cmd)) out = `✗ 連不上 rig（${e.cause?.code || e.message}）：先在後台跑 node tools/uitest/rig.mjs <名字> ${ctl - 2}，或者直接 preset / load（會自動起一台）`;
  else {
    const name = 'auto' + (ctl - 2), log = path.join(os.tmpdir(), 'botc-uitest', name + '.log');
    fs.mkdirSync(path.dirname(log), { recursive: true });
    const fd = fs.openSync(log, 'w');
    spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'rig.mjs'), name, String(ctl - 2)], { detached: true, stdio: ['ignore', fd, fd], windowsHide: true }).unref();
    for (let i = 0; i < 120 && !/RIG READY|^✗|找不到|沒起來/m.test(fs.readFileSync(log, 'utf8')); i++) await new Promise(r => setTimeout(r, 500));
    const boot = fs.readFileSync(log, 'utf8').trim();
    out = /RIG READY/.test(boot) ? `（rig 沒在跑，已在後台起了一台：${boot.split('\n').at(-1)}）\n` + await call() : '✗ rig 起不來：\n' + boot;
  }
}
console.log(out);
