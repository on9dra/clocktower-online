// 英文版的角色文字：角色名、能力、夜晚提示、提醒標記，直接取官方英文原文（botc-release），按角色 id 對上
// public/js/roles.js 和 lib/official.js 裏的中文，寫成 tools/i18n/roles.json（繁體原文 → 英文）。
// 官方更新或新加角色後重新運行：node tools/i18n-roles.mjs && node tools/i18n-extract.mjs --build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../public/js/roles.js';
import { OFFICIAL } from '../lib/official.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json';
const en = Object.fromEntries((await (await fetch(URL_)).json()).map(r => [r.id, r]));

// 官方提示裏 *KNOW* 這種是提醒標記名、:reminder: 是圖標，界面上寫成普通字
const clean = s => String(s || '').replace(/:?reminder:/g, '').replace(/\*([^*]+)\*/g, (_, w) => w.charAt(0) + w.slice(1).toLowerCase()).trim();
const out = {}, clash = [];
const put = (zh, e) => {
  if (!zh || !e) return;
  if (out[zh] && out[zh] !== e) { clash.push(`${zh}: ${out[zh]} | ${e}`); return; }
  out[zh] = e;
};
for (const src of [ROLES, OFFICIAL]) {
  for (const [id, r] of Object.entries(src)) {
    const e = en[id];
    if (!e) continue;
    put(r.name, e.name);
    put(r.ability, e.ability);
    put(r.firstTip, clean(e.firstNightReminder));
    put(r.otherTip, clean(e.otherNightReminder));
    (r.reminders || []).forEach((m, i) => put(m, e.reminders?.[i]));
    (r.remindersGlobal || []).forEach((m, i) => put(m, e.remindersGlobal?.[i]));
  }
}
const missing = Object.keys(ROLES).filter(id => !en[id]);
fs.mkdirSync(path.join(root, 'tools/i18n'), { recursive: true });
fs.writeFileSync(path.join(root, 'tools/i18n/roles.json'), JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'role strings; no official English for:', missing.join(', ') || '-');
if (clash.length) console.log('same Chinese, different English (kept the first):\n ' + clash.join('\n '));
