// 寫給說書人看的能力：把角色能力裏的「你」換成這個角色，「你會得知」換成「告知他」，「你要選擇」換成「讓他選擇」。
// 系統不認識的角色（自製劇本）夜裏那張卡就念這一句：說書人要達成什麼，一看就懂；劇本作者寫的夜晚提示多是一串手勢
// （「喚醒他並指向一名邪惡玩家」），新手說書人看不出為什麼要指。
// 「秉笔」：如果你在白天死亡，當晚你會得知一名善良玩家 → 如果秉笔在白天死亡，當晚告知他一名善良玩家
import { ROLES } from './roles.js';
import { trHas } from './lang.js';

// 英文界面：能力原文有現成的譯文（官方角色，en.js），改寫過的句子就翻不出來了，照念原文；自製劇本的能力本來就沒有譯文，照樣改寫
const keepRaw = r => trHas(String(r?.ability || ''));

const VERB = /你(的)?((?:會|会|將|将)?(?:得知|知道)|(?:要|需要)(?:選擇|选择)|可以(?:選擇|选择)|(?:選擇|选择))?/g;
export function stAbility(roleId) {
  const r = ROLES[roleId];
  if (keepRaw(r)) return String(r.ability);
  // 「*」（首夜不醒）和方括號裏的配置（[+1 外來者]）是開局用的，夜裏用不上
  const text = String(r?.ability || '').replace(/\*/g, '').replace(/\s*[[［][^\]］]*[\]］]/g, '').trim();
  if (!r || !/你/.test(text)) return text;
  return text.split(/(?<=[。！？!?；;])/).map(sentence => {
    // 句子裏本來就有「他」（被選的那個人）：持有者寫角色名，兩個「他」不混在一起
    const other = /[他她]/.test(sentence);
    let first = true;
    return sentence.replace(VERB, (m, of, verb) => {
      const who = first || other ? r.name : '他';
      first = false;
      if (of) return who + '的';
      if (!verb) return who;
      if (/得知|知道/.test(verb)) return '告知' + who;
      const pick = verb.match(/選擇|选择/)[0];
      // 「讓」跟著原文的字形：簡體劇本寫「让」（英文界面不經繁轉簡，混著寫會很顯眼）
      return /要/.test(verb) ? (pick === '选择' ? '让' : '讓') + who + pick : /可以/.test(verb) ? who + '可以' + pick : who + pick;
    });
  }).join('');
}

// 劇本自己的提醒標記（「搗蛋」「熟客」）是什麼意思：說書人第一次看到這個詞時不知道貼它幹什麼。
// 常見的狀態詞照規則說；別的從能力裏找：能力原文裏有這個詞就取那半句，沒有就取「選擇……：」冒號後面被選的人會怎樣，再不行就念能力
// 繁簡兩種寫法都認（自製劇本多是簡體）
const KNOWN = {};
for (const [words, say] of [
  ['中毒', '能力失效，給他的信息可以是錯的。'], ['醉酒', '能力失效，給他的信息可以是錯的。'], ['死亡', '他今晚死亡。'], ['失去能力', '他的能力不再生效。'],
  ['能力已用', '每局一次的能力已經用掉了。'], ['瘋狂 疯狂', '他要「瘋狂」地證明自己是某個角色，否則可能被處決。'], ['被保護 被保护 保護 保护', '今晚惡魔殺不死他。'],
  ['詛咒 诅咒 被詛咒 被诅咒', '明天他只要提名，自己就會死。'], ['處決不死 处决不死', '他被處決也不會死。'], ['紅鯡魚 红鲱鱼 干擾項 干扰项', '占卜師查驗時，他會被當作惡魔。'],
]) for (const k of words.split(' ')) KNOWN[k] = say;
// alone：這個角色只有這一種提醒標記。只有這時才拿「選擇……：」後面那半句當它的意思（熊孩子的「搗蛋」）；
// 標記有好幾種的（珀的「死亡」「攻擊三次」）分不清哪半句說的是哪個，寧可念整句能力，不說錯
export function markMeaning(roleId, word, alone = false) {
  const t = String(word || '').replace(/^.*[·:：]/, '').trim(), known = KNOWN[t];
  if (known) return known;
  const ab = stAbility(roleId);
  if (!ab || keepRaw(ROLES[roleId])) return ab || '';
  const hit = t && ab.split(/[，,。；;：:]/).find(c => c.includes(t)); // 孟婆「保留能力」← 或死亡並保留能力直到下個黃昏
  if (hit) return hit.trim().replace(/^(?:或|並|并|且|而|那麼|那么)/, '') + '。';
  const after = alone && ab.match(/(?:選擇|选择)[^：:。]*[：:]([^。]+)/);
  if (after) return after[1].trim() + '。';
  return ab;
}
