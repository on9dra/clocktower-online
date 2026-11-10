// 數學家：說書人卡上的「從黎明起誰的能力成功了、誰的可能失效了」（infoform.js 的數學家信息卡用）。
// 返回一個節點，沒有可列的就返回 null。form 是數學家這一步的信息表（form.open 為真）
// 兩組，每組一枚小印章寫組名，後面是角色小牌 + 座位號（放得下並排一行，放不下折行，見 math.css）。可能失效裏算進數字的（n）座位號是紅底，和紅色的數字對得上；
// 其餘是說書人自己判斷的（中毒時用了能力卻沒後果、惡魔被擋下、酒鬼）。數據見 lib/night.js 的 mathematician.tally
import { h } from './ui.js';
import { tr } from './lang.js';
import { mini, seatBadge } from './glyph.js';

// 四個字的組名刻成兩行的方印；英文按單詞分行（Maybe / failed）
const seal = word => {
  const t = tr(word), lines = /[\u3400-\u9fff]/.test(t) ? (t.length > 2 ? [t.slice(0, 2), t.slice(2)] : [t]) : t.split(' ');
  return h('b', { class: 'mg-seal' }, lines.map(x => h('i', {}, x)));
};
const item = (s, x, i) => h('span', { class: 'mg-it' + (x.n ? ' n' : ''), 'data-key': x.s, style: { '--i': i } }, mini(x.r), seatBadge(s, x.s));
const row = (s, k, word, list, at) => list.length > 0
  && h('div', { class: 'mg-row ' + k, 'data-key': k }, seal(word), h('span', { class: 'mg-list' }, list.map((x, i) => item(s, x, at + i))));

export function mathGroups(s, form) {
  const role = id => { const x = s.seats.find(v => v.id === id); return x?.fakeRole || x?.role; };
  // 升級前就停在數學家這一步的信息表只有算入的座位
  const acted = form.acted || [], maybe = form.maybe || (form.ids || []).map(id => ({ s: id, r: role(id), n: true }));
  if (!acted.length && !maybe.length) return null;
  return h('div', { class: 'math-groups', 'data-key': 'math' },
    row(s, 'ok', '成功', acted, 0), row(s, 'bad', '可能失效', maybe, acted.length));
}
