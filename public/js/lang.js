// 界面語言：簡體 / 繁體 / 英文。第一次進來默認簡體，大廳和頂欄菜單可以切換（存在本機）。
// 界面文字統一寫繁體，渲染時（ui.js 的 h()）經 tr() 轉換：簡體逐字換（t2s.js，tools/gen-t2s.py 生成）；
// 英文整句查表（en.js，tools/i18n-extract.mjs 生成），模板句按模式匹配，佔位符裏的內容再單獨翻譯（人名原樣）。
// 簡體時換一套簡體字型（繁體字型裏沒有「说」「书」這類字，會混進別的字型、粗細不一）
import { T2S } from './t2s.js';

const KEY = 'botc.lang';
export const LANGS = { sc: '简体', tc: '繁體', en: 'English' };
let lang = null;
try { lang = localStorage.getItem(KEY); } catch { /* 隱私模式 */ }
if (!LANGS[lang]) lang = 'sc';

// 英文表只在選了英文時下載；下不來就退回繁體，不卡住整個 app
let EN = null;
if (lang === 'en') {
  try { EN = await import('./en.js'); } catch { lang = 'tc'; }
}
document.documentElement.lang = { sc: 'zh-CN', tc: 'zh-HK', en: 'en' }[lang];
document.documentElement.dataset.lang = lang;

export const getLang = () => lang;
// 英文表裏有沒有這一整句（拼起來的句子先查整句、沒有再逐段翻時用，不記漏翻）
export const trHas = s => lang === 'en' && Object.hasOwn(EN.EXACT, s);
export function setLang(v) {
  lang = v;
  try { localStorage.setItem(KEY, v); } catch { /* 隱私模式 */ }
}
// 菜單裏的另外兩種語言（ui.js 的 menu 項）。語言名用原文、不經 tr()：簡體界面裏「繁體」不能被轉成「繁体」
export const langItems = () => Object.entries(LANGS).filter(([k]) => k !== lang)
  .map(([k, v]) => ({ label: document.createTextNode(v), onclick: () => { setLang(k); location.reload(); } }));

const CJK = /\p{Script=Han}/u;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 模板編譯成正則：佔位符一般匹配任意內容；緊跟「號」的只能是座位號數字（不然「調查員 · 5號」會整段被當成號碼）
const PATS = EN ? EN.PATTERNS.map(([k, v]) => {
  // 弱模板：字面只有一兩個字（「{0} 和 {1}」「{0}號{1}」）。佔位符裏只能是一個詞（座位、名字），帶空格、標點、括號的不用它，交給分段兜底
  const weak = k.replace(/\{\d+\}|\s/g, '').length <= 2;
  // 一般的佔位符可以是空的（「{0}：告知「{1}」{2}」末尾那段常常沒有）；弱模板的至少一個字
  const re = '^' + k.split(/\{\d+\}/).map((l, i) => (i ? (l.startsWith('號') ? '([0-9]+)' : weak ? '(.+?)' : '(.*?)') : '') + esc(l)).join('') + '$';
  return [new RegExp(re, 's'), [...k.matchAll(/\{(\d+)\}/g)].map(m => +m[1]), v, weak];
}) : [];
// 沒翻到的句子記下來，開發時在控制台看 window.__trMiss；__trFrom 記著它是從哪整句裏切出來的
const miss = typeof window !== 'undefined' ? (window.__trMiss = new Set()) : new Set();
const from = typeof window !== 'undefined' ? (window.__trFrom = new Map()) : new Map();
let top = '';
const memo = new Map();

// 整句沒有時的兜底：從粗到細按分隔符切開，每段再整句翻（「角色名：能力」這種拼起來的提示也能翻）；
// 括號在空格之前切（「告知「場上…有 1 對」」裏面那句要整句翻）；切到底還有中文，就把裏面的角色名換成英文（「1=僧侶 2=廚師」）
const SEPS = [['\n', '\n'], ['：', ': '], [':', ':'], ['；', '; '], ['。', '. '], ['！', '! '], ['？', '? '], ['，', ', '], ['、', ', '],
  ['()'], [' · ', ' · '], ['=', '='], [' ', ' ']];
const BRACKETS = /([（）「」【】()])/;
const BR = { '（': ' (', '）': ') ', '(': ' (', ')': ') ', '「': ' "', '」': '" ', '【': ' ', '】': ' ' };
const NAMES = EN ? EN.NAMES.slice().sort((a, b) => b.length - a.length) : [];
function split(t) {
  for (const [sep, to] of SEPS) {
    if (sep === '()') {
      if (!BRACKETS.test(t)) continue;
      // 「1號Alice 被沙巴洛斯反芻（復活）」：空格兩邊括號都成對、有一邊能整句翻，就先在空格處切
      for (let i = t.indexOf(' '); i > 0; i = t.indexOf(' ', i + 1)) {
        const a = t.slice(0, i), b = t.slice(i + 1);
        if (balanced(a) && balanced(b) && (whole(a.trim()) != null || whole(b.trim()) != null)) return en(a) + ' ' + en(b);
      }
      return t.split(BRACKETS).map(p => BR[p] ?? (p && en(p))).join('');
    }
    if (!t.includes(sep)) continue;
    // 句子本身也可能帶這個分隔符（能力原文裏的「：」）：從左往右試，挑左半或右半能整句翻的那一刀
    const at = [];
    for (let i = t.indexOf(sep); i >= 0; i = t.indexOf(sep, i + 1)) at.push(i);
    const i = at.find(i => whole(t.slice(0, i).trim()) != null || whole(t.slice(i + sep.length).trim()) != null) ?? at[0];
    const a = t.slice(0, i), b = t.slice(i + sep.length);
    return (a ? en(a) : a) + to + (b ? en(b) : b);
  }
  let r = t;
  for (const n of NAMES) if (r.includes(n)) r = r.split(n).join(EN.EXACT[n]);
  if (CJK.test(r) && !quiet) { miss.add(t); from.set(t, top); }
  return r;
}

// 佔位符抓到的內容括號要成對：「{0} 和 {1}」這種寬模板不能從「告知「3號 和 1號…」」的括號中間切開
const OPEN = '「【（(', CLOSE = '」】）)';
function balanced(s) {
  const st = [];
  for (const c of s) {
    if (OPEN.includes(c)) st.push(CLOSE[OPEN.indexOf(c)]);
    else if (CLOSE.includes(c) && st.pop() !== c) return false;
  }
  return !st.length;
}
// 弱模板的佔位符：一個詞；帶中文的話必須整個是能翻的詞（角色名之類），不然「{0}人」會把「魔鬼代言人」的「人」吃掉
const WORD = /^[^\s「」【】（）()：；。，、=]*$/;
let quiet = 0; // 試翻佔位符時不記漏翻
const word = x => {
  if (!WORD.test(x) || !CJK.test(x)) return WORD.test(x);
  quiet++;
  try { return !CJK.test(en(x)); } finally { quiet--; }
};
// 佔位符跨了句號、分號、換行（「攻擊 {0}，但他{1}」抓走了後面一整句）：除非抓到的本身是整句能翻的（能力原文），不用這個模板
const clause = x => !/[；。\n]/.test(x) || whole(x.trim()) != null;
function whole(t) {
  if (Object.hasOwn(EN.EXACT, t)) return EN.EXACT[t];
  for (const [re, order, out, weak] of PATS) {
    const m = re.exec(t);
    if (!m || !m.slice(1).every(balanced) || (weak && !m.slice(1).every(word)) || !m.slice(1).every(clause)) continue;
    const got = {};
    order.forEach((n, i) => { got[n] = m[i + 1]; });
    // 句中的佔位符：翻出來的普通詞改小寫（「but they're Already dead」）；角色名、人名不動
    return out.replace(/\{(\d+)\}/g, (_, n, at) => {
      const x = got[n] ?? '', y = en(x);
      return CJK.test(x) && !NAMES.includes(x.trim()) && /[a-z,] $/i.test(out.slice(0, at).replace(/\{\d+\}/g, 'x')) && /^[A-Z][a-z]/.test(y) ? y[0].toLowerCase() + y.slice(1) : y;
    });
  }
  return null;
}
function en(s) {
  if (!CJK.test(s)) return s;
  const hit = memo.get(s);
  if (hit !== undefined) return hit;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], t = s.trim();
  let r = (whole(t) ?? split(t)).replace(/ {2,}/g, ' ').replace(/ ([,.;:!?)])/g, '$1').trim();
  r = lead + r + tail;
  if (memo.size > 4000) memo.clear();
  memo.set(s, r);
  return r;
}

export const tr = s => (lang === 'sc' ? s.replace(/[^\x00-\x7f]/g, c => T2S.get(c) || c) : lang === 'en' ? (top = s, en(s)) : s);
