// 英文版：掃描前後端源碼裏所有帶中文的字符串字面量，寫進 tools/i18n/keys.json（只是清單，翻譯在 tools/i18n/en-*.json）。
// 模板字符串裏的 ${…} 換成 {0} {1}…：運行時整句按模式匹配，佔位符裏的內容再單獨翻譯（人名原樣保留）。
// 角色名、能力、提示、提醒標記不在這裏：tools/i18n-roles.py 直接用官方英文原文生成。
// 用法：node tools/i18n-extract.mjs        生成清單，並列出還沒翻譯的
//      node tools/i18n-extract.mjs --build 再把 tools/i18n/en-*.json 合成 public/js/en.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, TEAMS } from '../public/js/roles.js';
import { OFFICIAL } from '../lib/official.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = /(?:t2s|en|lang|demo|official|admin)\.js$/; // demo.js 是開發用的演示頁；admin.js 是站長看的後台；official.js 由角色腳本處理
const files = [
  ...fs.readdirSync(path.join(root, 'public/js')).map(f => 'public/js/' + f),
  ...fs.readdirSync(path.join(root, 'lib')).map(f => 'lib/' + f),
  'server.js',
].filter(f => f.endsWith('.js') && !SKIP.test(f));

const CJK = /[㐀-鿿]/;
const keys = new Map(); // key → Set(file)
const add = (k, f) => { k = k.trim(); if (CJK.test(k)) (keys.get(k) || keys.set(k, new Set()).get(k)).add(f); };

// 掃一段源碼：跳過註釋和正則，取出字符串；模板字符串的 ${} 裏面遞歸掃（裏面還有字面量）
function scan(s, f) {
  let i = 0;
  const tpl = () => { // s[i] 是開頭的 `
    let out = '', n = 0; i++;
    while (i < s.length && s[i] !== '`') {
      if (s[i] === '\\') { out += s[i + 1] === 'n' ? '\n' : s[i + 1]; i += 2; continue; }
      if (s[i] === '$' && s[i + 1] === '{') {
        i += 2; let depth = 1; const st = i;
        while (i < s.length && depth) {
          const c = s[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '`') { tpl(); continue; }
          else if (c === '"' || c === "'") { str(c); continue; }
          if (depth) i++;
        }
        scan(s.slice(st, i), f);
        out += `{${n++}}`; i++; continue;
      }
      out += s[i++];
    }
    i++;
    add(out, f);
  };
  const str = q => {
    let out = ''; i++;
    while (i < s.length && s[i] !== q && s[i] !== '\n') {
      if (s[i] === '\\') { const c = s[i + 1]; out += c === 'n' ? '\n' : c === 'u' ? String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)) : c; i += c === 'u' ? 6 : 2; continue; }
      out += s[i++];
    }
    i++;
    add(out, f);
  };
  let prev = ''; // 上一個非空白字符，判斷 / 是除號還是正則
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (c === '/' && !/[\w)\]$]/.test(prev)) { // 正則字面量
      i++; let cls = false;
      while (i < s.length && s[i] !== '\n' && (cls || s[i] !== '/')) { if (s[i] === '\\') i++; else if (s[i] === '[') cls = true; else if (s[i] === ']') cls = false; i++; }
      i++; prev = 'x'; continue;
    }
    if (c === '`') { tpl(); prev = 'x'; continue; }
    if (c === '"' || c === "'") { str(c); prev = 'x'; continue; }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
}

for (const f of files) scan(fs.readFileSync(path.join(root, f), 'utf8'), f);
// index.html 的內嵌腳本另有一份簡體 / 英文，不在這裏

// 角色腳本生成的條目（角色名、能力等）不用再翻
const dir = path.join(root, 'tools/i18n');
fs.mkdirSync(dir, { recursive: true });
const load = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return {}; } };
const roles = load('roles.json');
const done = {};
for (const f of fs.readdirSync(dir).filter(f => /^en-.*\.json$/.test(f))) Object.assign(done, load(f));

const list = [...keys].filter(([k]) => !(k in roles)).sort(([a], [b]) => a.localeCompare(b));
fs.writeFileSync(path.join(dir, 'keys.json'), JSON.stringify(Object.fromEntries(list.map(([k, fs_]) => [k, [...fs_].sort()])), null, 1));
const todo = list.filter(([k]) => !(k in done));
console.log(`${list.length} keys, ${todo.length} untranslated`);

if (process.argv.includes('--build')) {
  const all = { ...done, ...roles };
  const exact = {}, pats = [];
  for (const [k, v] of Object.entries(all)) {
    if (v == null) continue; // 空串是故意的：這個片段在英文語序裏不用出現
    if (/\{\d+\}/.test(k)) pats.push([k, v]); else exact[k] = v;
  }
  // 「，猜錯了」「：選了…」這種帶開頭標點的片段：句子在標點處被切開後查的是沒有標點的那半，也收一份
  for (const [k, v] of Object.entries(exact)) {
    const m = k.match(/^[，：；、。](.+)$/);
    if (m && !(m[1] in exact)) exact[m[1]] = v.replace(/^[,:;.]?\s*/, '');
  }
  // 字面部分越長越先試，免得短模式先吞掉長句
  const lit = k => k.replace(/\{\d+\}/g, '').length;
  pats.sort((a, b) => lit(b[0]) - lit(a[0]));
  const out = '// 由 tools/i18n-extract.mjs --build 生成，請勿手改：繁體原文 → 英文。翻譯改 tools/i18n/en-*.json\n'
    + `export const EXACT = ${JSON.stringify(exact)};\nexport const PATTERNS = ${JSON.stringify(pats)};\n`
    // 角色名、陣營名：句子對不上時，lang.js 把句中出現的這些詞換成英文
    + `export const NAMES = ${JSON.stringify([...new Set([...Object.values(ROLES), ...Object.values(OFFICIAL), ...Object.values(TEAMS)].map(r => r.name))].filter(n => exact[n]))};
`;
  fs.writeFileSync(path.join(root, 'public/js/en.js'), out);
  console.log('built public/js/en.js:', Object.keys(exact).length, 'exact,', pats.length, 'patterns');
}
