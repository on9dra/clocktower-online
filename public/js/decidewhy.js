// 說書人要做決定的卡（夜裏的裁定 stepcard.js decideCard、白天的裁定 flow.js rulingCard）：
// 卡上一句話說清楚「為什麼現在問你、要你定什麼」（有簡略版就用簡略版：一行，前因 + 要定什麼）；
// 卡片右上角一枚小問號，點開是一張說明卡：把前因後果講全的句子，再加規則的意思和每個選項的後果。給新手說書人看，
// 不套固定句式；符號只替名詞（座位、角色），因果和連接詞都留著
import { h, modal, closeModal } from './ui.js';
import { seatBadge, named, w } from './glyph.js';

// 一句說明：文字排版（不是 flex），座位號、角色跟著字一起換行，不會單獨落一行。
// 座位號、角色牌後面緊跟著標點開頭的話（「⑤ 渦流：今晚誰死？」）：標點黏在牌上，不會折到下一行開頭
const PUNCT = /^[，、：；。？！）」』,.:;?!)]/;
const line = (...kids) => h('div', { class: 'why-line' }, kids.flat(Infinity).filter(Boolean).reduce((out, k) => {
  const prev = out.at(-1);
  if (prev?.nodeType === 1 && !prev.classList.contains('w') && k.classList?.contains('w') && PUNCT.test(k.textContent)) out[out.length - 1] = h('span', { class: 'nw' }, prev, k);
  else out.push(k);
  // 標點開頭的一段緊跟前一個詞（英文 Poisoned, so…），不空出兩邊的字距
  if (prev?.classList?.contains('w') && k.classList?.contains('w') && PUNCT.test(k.textContent)) k.classList.add('pl');
  return out;
}, []));
const roleOf = (s, id) => s.seats.find(x => x.id === id)?.role;

// 說明紙的標題
const TITLE = { hagdeaths: '麻臉巫婆變出了惡魔', starpass: '小惡魔傳位', regurgitate: '沙巴洛斯反芻', mayor: '鎮長替死', grandchild: '祖母的孫子',
  gamble: '賭徒', gossip: '造謠者', moonreg: '月之子', sweetheart: '心上人', neighbor: '亡骨魔殺死爪牙', ability: '能力無效' };
export const decideTitle = step => step.decide.kind === 'drunk' ? (step.roleId === 'innkeeper' ? '旅店老闆' : '水手') : TITLE[step.decide.kind];

// 夜裏的裁定（step.decide）。say：主句（一行或幾行）；note：說明紙上的話，一條一段
export function decideWhy(s, step) {
  const d = step.decide, S = id => seatBadge(s, id), me = step.seatId, picks = step.picks || [];
  const actor = role => me ? [S(me), named(role)] : named(role);
  switch (d.kind) {
    case 'hagdeaths': {
      const rule = '麻臉巫婆變出了惡魔：這一晚誰死全由你決定，惡魔選的人不會自動死。';
      const habit = '常見做法：讓原來的惡魔死，提示大家惡魔換了人；或者讓今晚無人死亡。';
      if (d.round === 'demon') return {
        say: [line(actor(step.roleId), w('選了'), S(d.targetId)), line(w('但今晚變出了新惡魔，誰死由你決定'))],
        brief: line(actor(step.roleId), w('選了'), S(d.targetId), w('，但誰死由你定')),
        note: [rule, '選他選的人：照惡魔殺人結算。選別人：那人直接死亡。選「無人死亡」：今晚沒人死。', habit] };
      if (d.round === 'first') return {
        say: [line(d.made && S(d.made), w('被變成了'), d.madeRole && h('span', { class: 'nw' }, named(d.madeRole), w('（惡魔）'))),
          line(w('所以今晚誰死由你決定：選的人直接死亡'))],
        brief: line(d.made && S(d.made), w('變成'), d.madeRole && named(d.madeRole), w('：今晚誰死？')),
        note: [rule, '在這裏選的人直接死亡，可以連選幾人；選「沒有了」繼續。',
          d.later && '之後醒來的惡魔選了人，還會再問你一次，也可以等那時再定。', habit] };
      return { say: [line(w('今晚變出了新惡魔，誰死由你決定')), line(w('還要讓誰死？選「沒有了」結束'))], brief: line(w('新惡魔之夜：還有誰死？')), note: [rule] };
    }
    case 'starpass': return {
      say: [line(actor('imp'), w('殺了自己，要由一名爪牙接任小惡魔'))],
      brief: line(actor('imp'), w('自殺：哪名爪牙接任？')),
      note: ['小惡魔可以殺死自己，把惡魔身份傳給一名存活的爪牙。', '你選的爪牙變成新的小惡魔，之後會被叫醒告知。'] };
    case 'regurgitate': return {
      say: [line(actor('shabaloth'), w('上一晚殺死的人，你可以讓其中一人復活'))],
      brief: line(actor('shabaloth'), w('：復活誰？')),
      note: ['沙巴洛斯的能力：每晚叫醒他之前，說書人可以讓他上一晚殺死的一人復活，那人恢復能力。', '不想讓人復活就選「無人」。'] };
    case 'mayor': return {
      say: [line(w('惡魔攻擊了'), S(d.targetId), named('mayor'), w('，你可以改由別人代他死'))],
      brief: line(w('惡魔攻擊'), S(d.targetId), named('mayor'), w('：誰死？')),
      note: ['鎮長的能力：夜裏被惡魔攻擊時，可能由另一名玩家代替他死亡，由你決定。',
        '選鎮長：他自己死。選別人：那人代他死（算被惡魔殺死）。選「無人死亡」：今晚沒人死。'] };
    case 'grandchild': return {
      say: [line(actor('grandmother'), w('首夜要得知她的孫子：選一名善良玩家'))],
      brief: line(actor('grandmother'), w('：誰是孫子？')),
      note: ['祖母首夜得知一名善良玩家和他的角色，這人就是她的孫子。', '之後惡魔殺死孫子時，祖母也會跟著死。'] };
    case 'drunk': return step.roleId === 'innkeeper' ? {
      say: [line(actor('innkeeper'), w('保護了'), picks.map(S), w('：其中一人醉酒到明天黃昏，由你選'))],
      brief: line(actor('innkeeper'), w('保護了'), picks.map(S), w('：誰醉酒？')),
      note: ['旅店老闆選的兩人今晚不會死，但其中一人醉酒到明天黃昏。', '醉酒的人能力無效，他自己不知道。'] } : {
      say: [line(actor('sailor'), w('選了'), picks.map(S), w('：他們兩人之一醉酒到明天黃昏，由你選'))],
      brief: line(actor('sailor'), w('選了'), picks.map(S), w('：誰醉酒？')),
      note: ['水手每晚選一名存活玩家，他和水手之一醉酒到明天黃昏。', '醉酒的人能力無效，他自己不知道；水手醉酒時，今晚就可能被殺死。'] };
    case 'gamble': return {
      say: [line(actor('gambler'), w('猜'), S(d.targetId), w('是'), d.guess && named(d.guess)),
        line(S(d.targetId), w('其實是'), named(roleOf(s, d.targetId)), w('，可以被當作他猜的角色'))],
      brief: line(actor('gambler'), w('猜'), S(d.targetId), w('是'), d.guess && named(d.guess), w('，其實是'), named(roleOf(s, d.targetId)), w('：算猜對？')),
      note: ['賭徒猜錯就死。', '他猜的人能被當作別的角色（隱士、間諜這類），所以算不算猜對由你決定：算對，賭徒沒事；算錯，賭徒死亡。'] };
    case 'gossip': return {
      say: [line(actor('gossip'), w('今天的聲明如果是真的，今晚要死一人'))],
      brief: line(actor('gossip'), w('：聲明成真就選一人死')),
      note: ['造謠者白天公開說一句話；如果那句話是真的，當晚由你選一名玩家死亡。', '聲明是假的就選「無人」。'] };
    case 'moonreg': return {
      say: [line(actor('moonchild'), w('死前選了'), S(d.targetId), named(roleOf(s, d.targetId)), w('，他可以被當作另一陣營'))],
      brief: line(actor('moonchild'), w('選了'), S(d.targetId), named(roleOf(s, d.targetId)), w('：算善良？')),
      note: ['月之子死時選一名玩家：選中善良玩家，那人當晚死亡。', '他選的人能被當作另一陣營（隱士、間諜這類），所以由你決定：算善良，那人死亡；算邪惡，無事發生。'] };
    case 'sweetheart': return {
      say: [line(actor('sweetheart'), w('死了，要有一名玩家從此醉酒，由你選'))],
      brief: line(actor('sweetheart'), w('死了：誰從此醉酒？')),
      note: ['心上人死亡時，由說書人選一名玩家從此醉酒：他的能力一直無效，自己不知道。'] };
    case 'neighbor': return {
      say: [line(named('vigormortis'), w('殺死了爪牙'), picks.map(S), w('：他保留能力，兩邊最近的鎮民之一中毒，由你選'))],
      brief: line(named('vigormortis'), w('殺了爪牙'), picks.map(S), w('：哪位鄰近鎮民中毒？')),
      note: ['亡骨魔殺死的爪牙死後仍保有能力；同時這名爪牙兩邊最近的鎮民之一中毒，直到亡骨魔失去能力。'] };
    case 'ability': return {
      note: ['中毒、醉酒的人（還有酒鬼、瘋子）沒有真正的能力，但他自己不知道。', '所以照常讓他行動，只是這一步不產生效果。'] };
    default: return null;
  }
}

// 白天的裁定（ctx.state.st.ruling）。say：接在「誰做了什麼」那一行後面的因果；brief：同一件事的一行版；note：小字說明
export function rulingWhy(s, r) {
  const S = id => seatBadge(s, id), off = !!r.why, R = id => [S(id), named(roleOf(s, id))];
  const two = (say, short) => ({ say, brief: short }); // 詳細、簡略
  switch (r.kind) {
    case 'slayer': return {
      ...(off ? {} : !r.real ? two(line(S(r.seatId), w('不是獵手（或能力已經用過），所以無事發生')), line(S(r.seatId), w('不是獵手：無事')))
        : r.demon ? two(line(S(r.to), w('是惡魔，所以他死亡')), line(S(r.to), w('是惡魔：死亡')))
          : r.reg ? two(line(R(r.to), w('可以被當作惡魔：算命中，他死亡；算未中，無事發生')), line(R(r.to), w('可以被當作惡魔：算命中？')))
            : r.tgtWhy ? two(line(R(r.to), w(r.tgtWhy, 'evil'), w('，不能被當作惡魔，所以無事發生')), line(R(r.to), w(r.tgtWhy, 'evil'), w('：不算惡魔')))
              : two(line(S(r.to), w('不是惡魔，所以無事發生')), line(S(r.to), w('不是惡魔：無事')))),
      note: ['獵手每局一次，白天公開選一名玩家：選中惡魔，惡魔死亡；否則什麼都不發生。', off && '中毒、醉酒的獵手開槍無效，他自己不知道。'] };
    case 'virgin': return {
      ...(!r.forced ? two(line(R(r.from), w('可以被當作鎮民：算鎮民，提名者被處決；不算，無事發生')), line(R(r.from), w('可以被當作鎮民：算不算？')))
        : r.auto ? two(line(S(r.from), w('是鎮民，所以提名者會被處決')), line(S(r.from), w('是鎮民：提名者被處決'))) : {}),
      note: [] };
    case 'saint': return {
      ...(off ? two(line(w('聖徒沒有能力，所以被處決也不會輸')), line(w('聖徒沒有能力：不會輸')))
        : two(line(S(r.seatId), named('saint'), w('被處決，所以邪惡獲勝')), line(S(r.seatId), named('saint'), w('被處決：邪惡獲勝')))),
      note: ['聖徒被處決時，善良陣營落敗；聖徒中毒或醉酒時不會。'] };
    case 'scarletwoman': return {
      ...(off ? two(line(w('紅唇女郎沒有能力，所以不接任')), line(w('紅唇女郎沒有能力：不接任')))
        : two(line(w('惡魔死了，存活玩家還有 5 人或以上，所以'), S(r.seatId), w('變成新的惡魔')), line(w('存活 5 人以上：'), S(r.seatId), w('變成新的惡魔')))),
      note: ['紅唇女郎：惡魔死亡時，如果還有 5 名或以上存活玩家，她變成那個惡魔。'] };
    case 'mayor': return {
      ...(off ? two(line(w('鎮長沒有能力，所以遊戲繼續')), line(w('鎮長沒有能力：繼續')))
        : two(line(w('只剩 3 名存活玩家，今天沒有人被處決，所以善良獲勝')), line(w('剩 3 人、沒有處決：善良獲勝')))),
      note: ['鎮長：只剩 3 名存活玩家且當天沒有處決時，善良陣營獲勝。', off && '鎮長中毒、醉酒時沒有這個能力。'] };
    case 'pacifist': return {
      ...two(line(S(r.to), w('是善良玩家，被處決了；和平主義者在場，所以他可能不死，由你決定')), line(S(r.to), w('善良被處決，和平主義者在場：死不死？'))),
      note: ['和平主義者：被處決的善良玩家可能不死亡，由說書人決定。', '選「不死亡」：處決不生效，他活著；選「死亡」：照常死亡。'] };
    case 'klutz': return {
      ...(off ? {} : r.reg ? two(line(R(r.to), w('可以被當作另一陣營：算邪惡，呆瓜的陣營落敗；算善良，無事發生')), line(R(r.to), w('可以被當作另一陣營：算邪惡？')))
        : r.tgtWhy ? two(line(R(r.to), w(r.tgtWhy, 'evil'), w(r.auto ? '，不能被當作善良，所以呆瓜的陣營落敗' : '，不能被當作邪惡，所以無事發生')),
          line(R(r.to), w(r.tgtWhy, 'evil'), w(r.auto ? '：呆瓜的陣營落敗' : '：無事')))
          : r.auto ? two(line(S(r.to), w('是邪惡玩家，所以呆瓜的陣營落敗')), line(S(r.to), w('是邪惡：呆瓜的陣營落敗')))
            : two(line(S(r.to), w('是善良玩家，所以無事發生')), line(S(r.to), w('是善良：無事')))),
      note: ['呆瓜得知自己死亡時，要公開選一名存活玩家：選中邪惡玩家，他的陣營落敗。', off && '中毒、醉酒的呆瓜選人沒有效果。'] };
    default: return null;
  }
}

// 卡片右上角的小問號：點開是一張從它飛出來的說明卡（看完了飛回去）。上面是把前因後果講全的句子（卡上是簡略版時），
// 下面是規則的意思、每個選項的後果。全文放進卡裏會把卡撐大：要麼被縮小看不清，要麼壓到座位、把「確定」擠出視野，
// 所以另開一張，卡片本身一點不動。問號絕對定位在卡（手機上是頂上的紙條、圓桌中間的小卡）的右上角，放在哪一塊裏都行
export function whyNote(lines, title = '規則說明', full = []) {
  const list = (lines || []).filter(Boolean);
  if (!list.length && !full.length) return null;
  const btn = h('button', { class: 'why-q', type: 'button', title: '規則說明', 'aria-label': '規則說明', onclick: () => modal(title, h('div', { class: 'why-sheet' },
    full.length > 0 && h('div', { class: 'why-full' }, full.map(n => n.cloneNode(true))),
    list.map(t => h('p', {}, t)),
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '看完了'))), { from: btn, away: () => btn, cls: 'why-modal' }) }, '?');
  return btn;
}

// 卡上的主句：有簡略版用簡略版，詳細的句子收進問號裏。沒寫主句的裁定回 lines: null。
// note 是右上角的問號，由呼叫方放進卡裏；bare：只要主句（角落小窗，沒有問號）
export function whyLead(why, title, bare = false) {
  const full = [why?.say].flat(Infinity).filter(Boolean), short = [why?.brief].flat(Infinity).filter(Boolean);
  const note = bare ? null : whyNote(why?.note, title, short.length ? full : []);
  const lines = short.length ? short : full;
  if (!lines.length) return { lines: null, note };
  return { lines: [h('div', { class: 'why-lines' + (short.length ? ' brief' : '') }, lines)], note };
}
