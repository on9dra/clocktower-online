// 說書人給信息的表單：服務端生成表單（含真實答案），說書人選擇後兩端用同一個函數拼出句子和式子。
// form.kind：two（兩名玩家+一個角色）、number（數字）、yesno（有/沒有）、role（一個角色）、text（間諜看魔典）
// form.ok / form.mayBe / form.noneOk：隱士、間諜「登記」為別的身份時也算合規的答案
import { ROLES, TEAMS } from './roles.js';

const name = id => (ROLES[id] ? ROLES[id].name : '?');

export function formatInfo(form, f, label) {
  switch (form.kind) {
    case 'two':
      return f.none ? form.noneText : `${label(f.a)} 和 ${label(f.b)} 之中有一位是【${name(f.role)}】`;
    case 'number':
      return form.roleId === 'chef' ? `場上鄰座的邪惡玩家有 ${f.n} 對`
        : `你存活的鄰座（${form.extra.nb}）中有 ${f.n} 名邪惡玩家`;
    case 'yesno':
      return `${form.extra.pair} 之中【${f.yes ? '有' : '沒有'}】惡魔`;
    case 'role':
      return form.roleId === 'ravenkeeper' ? `${form.extra.target} 的角色是【${name(f.role)}】`
        : `今天被處決的玩家是【${name(f.role)}】`;
    default:
      return form.text;
  }
}

// 信息式子：玩家面板、說書人日誌、給信息卡片、座位標記共用的一套 token 表達（畫法見 glyph.js）
// 項：{ s 座位 } { r 角色, named } { w 短詞, k } { tag 帶字陣營 } { t 陣營, none } { n 數字, evil } { demon 是否 } { op } { grim [[座位, 角色, 狀態]] }
// 原則：座位、角色、數字畫成圖；關係（或 / 是 / 中有）用字，不用符號
export function infoFormula(form, f) {
  const seats = ids => (ids || []).map(s => ({ s }));
  const role = r => ({ r, named: true });
  switch (form.kind) {
    case 'two':
      return f.none ? [{ w: `沒有${TEAMS[form.team]?.name || ''}` }]
        : [{ s: f.a }, { w: '或' }, { s: f.b }, { w: '是' }, role(f.role)];
    case 'number':
      return form.roleId === 'chef' ? [{ w: '鄰座的邪惡' }, { n: f.n, evil: true }, { w: '對' }]
        : [...seats(form.extra?.nbIds), { w: '中邪惡' }, { n: f.n, evil: true }, { w: '名' }];
    case 'yesno': return [...seats(form.extra.ids), f.yes ? { w: '中有惡魔', k: 'evil' } : { w: '中沒有惡魔', k: 'good' }];
    case 'role': return form.extra?.targetId ? [{ s: form.extra.targetId }, { w: '是' }, role(f.role)]
      : [{ w: '被處決者是' }, role(f.role)];
    default: return form.f || [];
  }
}

// 說書人當前的選擇屬於哪一種：2 真實信息、1 隱士/間諜登記帶來的合規信息、0 錯誤信息
export function truthLevel(form, f) {
  const t = form.truth, ok = form.ok || [];
  switch (form.kind) {
    case 'two': {
      if (f.none) return t.none ? 2 : form.noneOk ? 1 : 0;
      if (f.a === f.b) return 0;
      const of = form.roleOf || {}, may = form.mayBe || {};
      if (of[f.a] === f.role || of[f.b] === f.role) return 2;
      return (may[f.a] || []).includes(f.role) || (may[f.b] || []).includes(f.role) ? 1 : 0;
    }
    case 'number': return Number(f.n) === t.n ? 2 : ok.includes(Number(f.n)) ? 1 : 0;
    case 'yesno': return !!f.yes === t.yes ? 2 : ok.includes(!!f.yes) ? 1 : 0;
    case 'role': return f.role === t.role ? 2 : ok.includes(f.role) ? 1 : 0;
    default: return 2;
  }
}
export const isTruth = (form, f) => truthLevel(form, f) === 2;

// 校驗說書人提交的選擇，返回錯誤文字或 null
export function checkFields(form, f, seatIds) {
  if (!f || typeof f !== 'object') return '請先選擇';
  switch (form.kind) {
    case 'two':
      if (f.none) return form.allowNone ? null : '這個角色不能選「沒有」';
      if (!seatIds.includes(f.a) || !seatIds.includes(f.b) || f.a === f.b) return '請選擇兩名不同的玩家';
      return form.roles.includes(f.role) ? null : '請選擇角色';
    case 'number': return Number.isInteger(f.n) && f.n >= 0 && f.n <= form.max ? null : '請選擇數字';
    case 'yesno': return typeof f.yes === 'boolean' ? null : '請選擇有或沒有';
    case 'role': return form.roles.includes(f.role) ? null : '請選擇角色';
    default: return null;
  }
}

// 根據說書人發出的信息，算出要自動標在玩家座位上的標記：r 角色（q 表示二選一）、demon 是否惡魔、t 陣營
export function infoMarks(form, f) {
  switch (form.kind) {
    case 'two': return f.none ? [] : [f.a, f.b].map(seatId => ({ seatId, r: f.role, q: true, text: name(f.role) + '?' }));
    case 'yesno': return (form.extra.ids || []).map(seatId => ({ seatId, demon: !!f.yes, text: f.yes ? '可能是惡魔' : '不是惡魔' }));
    case 'role': return form.extra && form.extra.targetId ? [{ seatId: form.extra.targetId, r: f.role, text: name(f.role) }] : [];
    case 'text': return form.grim ? Object.entries(form.grim).map(([seatId, r]) => ({ seatId, r, text: name(r) })) : [];
    default: return [];
  }
}
