// 說書人給信息的表單：服務端生成表單（含真實答案），說書人選擇後兩端用同一個函數拼出句子和式子。
// form.kind：two（兩名玩家+一個角色）、number（數字）、yesno（是/否）、role（一個角色）、dream（一善一惡兩個角色）、text（間諜看魔典）
// form.ok / form.mayBe / form.noneOk：隱士、間諜「登記」為別的身份時也算合規的答案；form.unknown：系統不知道真相（雜耍藝人）；
// form.open：真相算得出來，但哪些失常算數由說書人定，所有答案都能選（數學家）
import { ROLES, TEAMS } from './roles.js';

const name = id => (ROLES[id] ? ROLES[id].name : '?');
const seats = ids => (ids || []).map(s => ({ s }));

// 數字類信息：一句話 + 式子
const NUM = {
  chef: { text: n => `場上鄰座的邪惡玩家有 ${n} 對`, f: (form, n) => [{ w: '鄰座的邪惡' }, { n, evil: true }, { w: '對' }] },
  empath: { text: (n, form) => `你存活的鄰座（${form.extra.nb}）中有 ${n} 名邪惡玩家`, f: (form, n) => [...seats(form.extra?.nbIds), { w: '中邪惡' }, { n, evil: true }, { w: '名' }] },
  chambermaid: { text: n => `你選的玩家中今晚有 ${n} 人被喚醒`, f: (form, n) => [...seats(form.extra?.nbIds), { w: '中被喚醒' }, { n }, { w: '人' }] },
  clockmaker: { text: n => `惡魔與最近的爪牙相距 ${n} 步`, f: (form, n) => [{ tag: 'demon' }, { w: '與' }, { tag: 'minion' }, { w: '相距' }, { n }, { w: '步' }] },
  oracle: { text: n => `死亡的玩家中有 ${n} 名邪惡玩家`, f: (form, n) => [{ w: '死者中邪惡' }, { n, evil: true }, { w: '名' }] },
  mathematician: { text: n => `有 ${n} 名玩家的能力失常`, f: (form, n) => [{ w: '能力失常' }, { n }, { w: '人' }] },
  juggler: { text: n => `你猜對了 ${n} 個角色`, f: (form, n) => [{ w: '猜對' }, { n }, { w: '個' }] },
};
// 是否類信息：兩個答案各自的短詞
export const YES = {
  fortuneteller: { yes: '中有惡魔', no: '中沒有惡魔', k: ['evil', 'good'] },
  flowergirl: { yes: '惡魔今天投過票', no: '惡魔今天沒投票', k: ['evil', 'good'] },
  towncrier: { yes: '爪牙今天提名過', no: '爪牙今天沒提名', k: ['evil', 'good'] },
  seamstress: { yes: '陣營相同', no: '陣營不同', k: ['good', 'evil'] },
};
const yesOf = form => YES[form.roleId] || YES.fortuneteller;

export function formatInfo(form, f, label) {
  switch (form.kind) {
    case 'two':
      if (f.none) return form.noneText;
      return `${label(f.a)} 和 ${label(f.b)} 之中有一位是` + (form.plain ? '惡魔' : `【${name(f.role)}】`);
    case 'number':
      return (NUM[form.roleId] || NUM.chef).text(f.n, form);
    case 'yesno': {
      const y = yesOf(form), ids = form.extra?.ids;
      return (ids ? `${ids.map(label).join(' 和 ')} ` : '') + `【${f.yes ? y.yes : y.no}】`;
    }
    case 'role':
      return form.extra?.target ? `${form.extra.target} 的角色是【${name(f.role)}】`
        : `今天被處決的玩家是【${name(f.role)}】`;
    case 'dream':
      return `${form.extra.target} 是【${name(f.good)}】或【${name(f.evil)}】`;
    default:
      return form.text;
  }
}

// 信息式子：玩家面板、說書人日誌、給信息卡片、座位標記共用的一套 token 表達（畫法見 glyph.js）
// 項：{ s 座位 } { r 角色, named } { w 短詞, k } { tag 帶字陣營 } { t 陣營, none } { n 數字, evil } { demon 是否 } { op } { grim [[座位, 角色, 狀態]] }
// 原則：座位、角色、數字畫成圖；關係（或 / 是 / 中有）用字，不用符號
export function infoFormula(form, f) {
  const role = r => ({ r, named: true });
  switch (form.kind) {
    case 'two':
      return f.none ? [{ w: `沒有${TEAMS[form.team]?.name || ''}` }]
        : [{ s: f.a }, { w: '或' }, { s: f.b }, { w: '是' }, form.plain ? { tag: 'demon' } : role(f.role)];
    case 'number': return (NUM[form.roleId] || NUM.chef).f(form, f.n);
    case 'yesno': { const y = yesOf(form); return [...seats(form.extra?.ids), { w: f.yes ? y.yes : y.no, k: y.k[f.yes ? 0 : 1] }]; }
    case 'role': return form.extra?.targetId ? [{ s: form.extra.targetId }, { w: '是' }, role(f.role)]
      : [{ w: '被處決者是' }, role(f.role)];
    case 'dream': return [{ s: form.extra.targetId }, { w: '是' }, role(f.good), { w: '或' }, role(f.evil)];
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
    case 'number': return form.unknown || Number(f.n) === t.n ? 2 : ok.includes(Number(f.n)) ? 1 : 0;
    case 'yesno': return !!f.yes === t.yes ? 2 : ok.includes(!!f.yes) ? 1 : 0;
    case 'role': return f.role === t.role ? 2 : ok.includes(f.role) ? 1 : 0;
    case 'dream': return [f.good, f.evil].includes(form.role) ? 2 : ok.some(r => r === f.good || r === f.evil) ? 1 : 0;
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
    case 'dream': return form.goods.includes(f.good) && form.evils.includes(f.evil) ? null : '請選擇一個善良角色和一個邪惡角色';
    default: return null;
  }
}

// 根據說書人發出的信息，算出要自動標在玩家座位上的標記：r 角色（q 表示二選一）、demon 是否惡魔、t 陣營、same 女裁縫的是否同陣營
export function infoMarks(form, f) {
  switch (form.kind) {
    // 賢者：只知道其一是惡魔，不知道是哪個惡魔，標記不能露出角色
    case 'two': return f.none ? [] : [f.a, f.b].map(seatId => (form.plain ? { seatId, demon: true, text: '可能是惡魔' } : { seatId, r: f.role, q: true, text: name(f.role) + '?' }));
    case 'yesno': return form.roleId === 'fortuneteller' ? (form.extra.ids || []).map(seatId => ({ seatId, demon: !!f.yes, text: f.yes ? '可能是惡魔' : '不是惡魔' }))
      : form.roleId === 'seamstress' ? (form.extra?.ids || []).map(seatId => ({ seatId, same: !!f.yes, text: f.yes ? '同陣營' : '不同陣營' })) : [];
    case 'dream': return [f.good, f.evil].map(r => ({ seatId: form.extra.targetId, r, q: true, text: name(r) + '?' }));
    case 'role': return form.extra && form.extra.targetId ? [{ seatId: form.extra.targetId, r: f.role, text: name(f.role) }] : [];
    case 'text': return form.grim ? Object.entries(form.grim).map(([seatId, r]) => ({ seatId, r, text: name(r) })) : [];
    default: return [];
  }
}

// 信息的答案（給技能演出用，見 fx-ab.js）：兩名玩家 + 角色、數字、是否、一個角色、間諜看到的魔典
export function infoAnswer(form, f) {
  const x = form.extra || {};
  switch (form.kind) {
    case 'two': return f.none ? { none: true } : { a: f.a, b: f.b, role: f.role };
    case 'number': return { n: f.n, ...(x.nbIds && { ids: x.nbIds }) };
    case 'yesno': return { yes: !!f.yes, ...(x.ids && { ids: x.ids }) };
    case 'role': return { role: f.role, ...(x.targetId && { id: x.targetId }) };
    case 'dream': return { good: f.good, evil: f.evil, id: x.targetId };
    case 'text': return form.grim ? { grim: Object.entries(form.grim) } : {};
    default: return {};
  }
}
// 答案牽涉到的座位
export const answerSeats = a => [...new Set([a.a, a.b, ...(a.ids || []), a.id].filter(Boolean))];

// 聊天記錄上限：先丟玩家閒聊，再丟系統公告，說書人給的信息和角色變化留到最後
export function trimChat(list, max = 600) {
  let over = list.length - max;
  if (over <= 0) return list;
  for (const keep of [m => m.info || m.from === 'sys', m => m.info]) {
    list = list.filter(m => keep(m) || over-- <= 0);
    if (over <= 0) return list;
  }
  return list.slice(-max);
}
