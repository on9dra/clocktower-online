// 繁簡切換：第一次進來默認繁體，頂欄可以切換（存在本機）。轉換表 t2s.js 由 tools/gen-t2s.py 從源碼生成。
// 簡體時換一套簡體字型（繁體字型裏沒有「说」「书」這類字，會混進別的字型、粗細不一）
import { T2S } from './t2s.js';

const KEY = 'botc.lang';
let lang = null;
try { lang = localStorage.getItem(KEY); } catch { /* 隱私模式 */ }
lang ||= 'tc';
document.documentElement.lang = lang === 'sc' ? 'zh-CN' : 'zh-HK';
document.documentElement.dataset.lang = lang;

export const getLang = () => lang;
export function setLang(v) {
  lang = v;
  try { localStorage.setItem(KEY, v); } catch { /* 隱私模式 */ }
}
export const tr = s => (lang === 'sc' ? s.replace(/[^\x00-\x7f]/g, c => T2S.get(c) || c) : s);
