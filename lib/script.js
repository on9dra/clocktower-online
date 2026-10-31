// 上傳的劇本（社區通用的 Json：開頭一項 _meta，後面是角色 id 或完整的角色對象）。
// 內置角色、官方角色只認 id（或中文名），用自己的數據；不認識的是自製角色，按 Json 裏寫的名字和能力顯示。
// 能力只是一段文字，系統讀不懂：有內置表以外的角色時，這本劇本只能手動（auto 為 false）
import { ROLES, TEAMS, CORE } from '../public/js/roles.js';
import { T2S } from '../public/js/t2s.js';
import { OFFICIAL } from './official.js';
import { rid } from './store.js';

const BUILTIN = new Set(Object.keys(ROLES));
const MAX_ROLES = 120, MAX_TEXT = 300, MAX_MARKS = 20;

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const simplify = s => String(s).replace(/[^\x00-\x7f]/g, c => T2S.get(c) || c);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const list = (a, n) => (Array.isArray(a) ? [...new Set(a.map(x => clip(x, n)).filter(Boolean))].slice(0, MAX_MARKS) : []);

// 官方角色登記進共用的角色表，全服只有一份
for (const [id, r] of Object.entries(OFFICIAL)) ROLES[id] ||= { id, ...r };

// 中文名 → 角色：Json 裏只寫了中文名時靠它認，繁簡都算
const BY_NAME = new Map();
for (const [id, r] of Object.entries(ROLES)) BY_NAME.set(simplify(r.name), id);
for (const [id, r] of Object.entries(OFFICIAL)) BY_NAME.set(simplify(r.name), id);

const known = e => {
  const id = norm(typeof e === 'string' ? e : e?.id);
  if (Object.hasOwn(ROLES, id)) return id;
  const name = typeof e === 'string' ? e : e?.name;
  return BY_NAME.get(simplify(clip(name, 40))) || null;
};

// 自製角色：id 加上房間實例前綴，不同房間上傳的同名角色互不影響。夜晚順序沒寫時留空（參考表排在最後）
function homebrew(e, id) {
  const num = v => (Number.isFinite(v) ? v : undefined);
  return { id, name: clip(e.name, 30), team: e.team, ability: clip(e.ability, MAX_TEXT), first: num(e.firstNight), other: num(e.otherNight),
    firstTip: clip(e.firstNightReminder, MAX_TEXT) || undefined, otherTip: clip(e.otherNightReminder, MAX_TEXT) || undefined,
    reminders: list(e.reminders, 30), global: list(e.remindersGlobal, 30) };
}

// entries：Json 解析出來的數組。返回錯誤文字，或房間要存的 script
export function parseScript(entries, inst) {
  if (!Array.isArray(entries) || !entries.length) return '這不是劇本 Json';
  const meta = entries.find(e => e && typeof e === 'object' && e.id === '_meta') || {};
  const roles = [], defs = {}, skipped = [], byNorm = new Map(); // byNorm：Json 裏的 id → 這裏用的 id（夜晚順序要用）
  for (const e of entries) {
    if (e === meta || e == null || typeof e === 'number') continue;
    if (roles.length >= MAX_ROLES) return `角色太多了（最多 ${MAX_ROLES} 個）`;
    const raw = typeof e === 'string' ? e : e.id;
    const id = known(e);
    if (id) {
      if (!roles.includes(id)) roles.push(id);
      if (!BUILTIN.has(id)) defs[id] = ROLES[id];
      byNorm.set(norm(raw), id);
    } else if (typeof e === 'object' && Object.hasOwn(TEAMS, e.team) && clip(e.name, 30)) {
      const hid = `h${inst}_${Object.keys(defs).length}`; // 不用 Json 裏的 id：可能帶中文或特殊字符
      defs[hid] = homebrew(e, hid);
      roles.push(hid);
      byNorm.set(norm(raw), hid);
    } else skipped.push(clip(raw ?? e.name ?? '?', 30));
  }
  if (!roles.some(id => CORE.includes((defs[id] || ROLES[id]).team))) return '這本劇本裏沒有能發給玩家的角色';
  const order = key => {
    if (!Array.isArray(meta[key])) return null;
    const ids = meta[key].map(x => byNorm.get(norm(x))).filter(Boolean);
    return ids.length ? ids : null;
  };
  return {
    ver: rid(), name: clip(meta.name, 30) || '自製劇本', author: clip(meta.author, 30),
    roles, defs, skipped, first: order('firstNight'), other: order('otherNight'),
    auto: roles.every(id => BUILTIN.has(id)), // 全在內置表裏才能用智能推進
  };
}

// 自製角色掛進共用的角色表（剛上傳、或重啟時從存檔讀回來）；房間刪除、換上傳的劇本時摘掉
export function registerScript(room) {
  for (const [id, def] of Object.entries(room.script?.defs || {})) ROLES[id] = def;
}
export function dropScript(room) {
  for (const id of Object.keys(room.script?.defs || {})) if (!OFFICIAL[id]) delete ROLES[id];
}

// 給瀏覽器的那一份
export const scriptPayload = s => ({ ver: s.ver, name: s.name, author: s.author, roles: s.roles, defs: s.defs });

// 手動局貼標記用：角色自己的提醒標記
export const remindersOf = id => [...new Set([...(ROLES[id]?.reminders || OFFICIAL[id]?.reminders || []), ...(ROLES[id]?.global || OFFICIAL[id]?.global || [])])];
