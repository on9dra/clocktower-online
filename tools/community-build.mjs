// 社區劇本庫：把「鐘樓劇本博物館」整理的 Json 合集（百度網盤「劇本JSON（SE整理版）」）轉成遊戲裏的社區劇本。
// 用法：node tools/community-build.mjs "<下載下來的 劇本JSON（SE整理版） 目錄>"
// 每一本：用遊戲自己的解析器解析，5–15 人各試開 3 次記下開得了的人數；去重（同名同作者、角色組合一樣、和內置 / 海外熱門重複的）；
// 輸出 public/community/index.json（目錄，打開社區劇本時才下載）和 public/community/s/<k>.json（選中哪本才下載哪本，只留遊戲用得到的字段）
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'commbuild-')); // 試開局用的房間不落到真數據裏
const { createRoom, remove } = await import('../lib/store.js');
const { applyStOp, joinPlayer } = await import('../lib/ops.js');
const { parseScript } = await import('../lib/script.js');
const { OFFICIAL } = await import('../lib/official.js');
const { SCRIPTS } = await import('../public/js/roles.js');
const { COMMUNITY } = await import('../public/js/community.js');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('用法：node tools/community-build.mjs <劇本JSON 目錄>'); process.exit(1); }

// 博物館的文件夾 → 遊戲裏的分類（key 和 public/js/manual.js 的 CATS 對應，名字以那邊為準）（順序就是去重時的優先順序：同一本出現在幾個文件夾裏，歸到靠前的那類）
const CATS = [
  ['official', '官方推薦', ['官方已发行剧本', '经典混合剧本', '海外社区推荐剧本', '海外综艺《No Rolls Barred》剧本']],
  ['learn', '快速上手', ['旋转木马快速上手剧本', '快速上手与角色主题竞赛剧本', '角色主题竞赛剧本']],
  ['small', '小型劇本', ['汀西维尔剧本', '脏镇7-9人中型剧本']],
  ['match', '賽事劇本', ['BOTC世界杯优选剧本', 'BWG·剧本大乱斗', '城市赛专属剧本', '华灯初上剧本创作大赛', '华灯初上角色设计大赛', 'SUI染钟楼投稿&火乐杯剧本']],
  ['fun', '主題玩法', ['特别的玩法', '节日&活动主题剧本']],
  ['original', '原創角色', ['全原创角色剧本', '部分原创角色剧本', '万象星启体验剧本', '山雨欲来体验剧本', '']],
  ['folk', '民間創意', ['民间创意剧本']],
  ['more', '未分類', ['待整理json']],
];
const catOf = folder => CATS.findIndex(c => c[2].includes(folder));

const KEEP = ['id', 'name', 'author', 'team', 'ability', 'firstNight', 'otherNight', 'firstNightReminder', 'otherNightReminder', 'reminders', 'remindersGlobal', 'small'];
const slim = e => (e && typeof e === 'object' ? Object.fromEntries(KEEP.filter(k => k in e).map(k => [k, e[k]])) : e);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(x => (x.isDirectory() ? walk(path.join(d, x.name)) : /\.json$/i.test(x.name) ? [path.join(d, x.name)] : []));
const norm = s => String(s || '').toLowerCase().replace(/\s+|v\d+(\.\d+)*$/g, '').replace(/[（(]\d+[)）]$/, '');
const isHome = (s, id) => !!s.defs[id] && !OFFICIAL[id]; // 自製角色（官方角色但沒有內置規則的也在 defs 裏，不算）
const sig = s => s.roles.map(id => (isHome(s, id) ? s.defs[id].name + s.defs[id].team : id)).sort().join(',');

// 不收：內置的三本官方劇本、已經在海外熱門裏的
const known = new Set([...Object.values(SCRIPTS).map(s => [...s.roles].sort().join(',')), ...COMMUNITY.map(c => [...c.roles].sort().join(','))]);

function trial(entries) {
  const ok = [];
  for (let n = 5; n <= 15; n++) {
    for (let t = 0; t < 3; t++) {
      const room = createRoom();
      try {
        for (let p = 0; p < n; p++) joinPlayer(room, 'p' + p, 'x' + p);
        if (typeof applyStOp(room, { op: 'upload', entries }) === 'string') break;
        if (room.script?.max && n > room.script.max) break;
        if (applyStOp(room, { op: 'next' }) === undefined && room.phase === 'night') { ok.push(n); break; }
      } catch { /* 開不了 */ } finally { remove(room.code); }
    }
  }
  return ok;
}

const files = walk(SRC);
const found = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep), folder = rel.length > 1 ? rel[0] : '';
  const cat = catOf(folder);
  if (cat < 0) { console.warn('沒分類的文件夾，跳過：', folder); continue; }
  let raw;
  try { raw = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { continue; }
  if (!Array.isArray(raw)) continue;
  let entries = raw.map(slim);
  const s = parseScript(entries, 'b');
  if (typeof s === 'string' || s.skipped.length > 3) continue;
  // 名字、作者：Json 裏沒寫的從文件名「#名字-作者.json」裏拿
  const stem = path.basename(f).replace(/\.json$/i, '').replace(/[（(]\d+[)）]$/, '').replace(/^\d*#/, '');
  const [fn, fa] = stem.includes('-') ? [stem.slice(0, stem.lastIndexOf('-')), stem.slice(stem.lastIndexOf('-') + 1)] : [stem, ''];
  const name = (s.name && s.name !== '自製劇本' ? s.name : fn).trim(), author = (s.author || fa || '').trim();
  if (!s.roles.some(id => isHome(s, id)) && known.has([...s.roles].sort().join(','))) continue;
  found.push({ f, cat, name, author, entries, s, sig: sig(s) });
}
// 去重：同名同作者 → 留分類靠前的；角色組合一模一樣 → 只留一本
found.sort((a, b) => a.cat - b.cat || a.f.localeCompare(b.f));
const seen = new Set(), out = [];
for (const x of found) {
  const k1 = norm(x.name) + '|' + norm(x.author), k2 = x.sig;
  if (seen.has(k1) || seen.has(k2)) continue;
  seen.add(k1); seen.add(k2);
  out.push(x);
}
console.log(`讀了 ${files.length} 個 Json，去重後 ${out.length} 本，開始試開局……`);

const dir = path.join(ROOT, 'public', 'community'), sdir = path.join(dir, 's');
fs.rmSync(sdir, { recursive: true, force: true });
fs.mkdirSync(sdir, { recursive: true });
const index = [];
for (const x of out) {
  const ok = trial(x.entries);
  if (!ok.length) continue;
  const lo = ok[0], hi = ok.at(-1);
  // _meta：名字、作者照博物館的；只能 5–6 人玩的標 small，服務端按這個限人數
  const meta = { id: '_meta', name: x.name.slice(0, 30), author: x.author.slice(0, 30), ...(hi <= 6 ? { small: true } : {}) };
  const entries = [meta, ...x.entries.filter(e => !(e && e.id === '_meta'))];
  const k = crypto.createHash('sha1').update(x.name + '|' + x.author).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(sdir, k + '.json'), JSON.stringify(entries));
  const home = x.s.roles.filter(id => isHome(x.s, id)).length;
  index.push({ k, name: meta.name, author: meta.author, cat: CATS[x.cat][0], kind: x.s.auto ? 'auto' : home ? 'home' : 'off', lo, hi, n: x.s.roles.length });
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ list: index })); // 分類的名字和順序在 public/js/manual.js 的 CATS
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
const by = k => CATS.map(c => `${c[1]} ${index.filter(i => i.cat === c[0] && (!k || i.kind === k)).length}`).join('、');
console.log(`寫入 ${index.length} 本：${by()}`);
console.log(`全自動 ${index.filter(i => i.kind === 'auto').length}，只用官方角色 ${index.filter(i => i.kind === 'off').length}，含原創角色 ${index.filter(i => i.kind === 'home').length}`);
