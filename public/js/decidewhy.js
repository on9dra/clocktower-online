// 說書人要做決定的卡（夜裏的裁定 stepcard.js decideCard、白天的裁定 flow.js rulingCard）：
// 主句說清楚「為什麼現在問你、要你定什麼」，角落的小字說明寫規則的意思和每個選項的後果。給新手說書人看，
// 不套固定句式；符號只替名詞（座位、角色），因果和連接詞都留著
import { h, modal, closeModal } from './ui.js';
import { seatBadge, named, icon, w } from './glyph.js';

// 一句說明：文字排版（不是 flex），座位號、角色跟著字一起換行，不會單獨落一行
const line = (...kids) => h('div', { class: 'why-line' }, kids);
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
        note: [rule, '選他選的人：照惡魔殺人結算。選別人：那人直接死亡。選「無人死亡」：今晚沒人死。', habit] };
      if (d.round === 'first') return {
        say: [line(d.made && S(d.made), w('被變成了'), d.madeRole && h('span', { class: 'nw' }, named(d.madeRole), w('（惡魔）'))),
          line(w('所以今晚誰死由你決定：選的人直接死亡'))],
        note: [rule, '在這裏選的人直接死亡，可以連選幾人；選「沒有了」繼續。',
          d.later && '之後醒來的惡魔選了人，還會再問你一次，也可以等那時再定。', habit] };
      return { say: [line(w('今晚變出了新惡魔，誰死由你決定')), line(w('還要讓誰死？選「沒有了」結束'))], note: [rule] };
    }
    case 'starpass': return {
      say: [line(actor('imp'), w('殺了自己，要由一名爪牙接任小惡魔'))],
      note: ['小惡魔可以殺死自己，把惡魔身份傳給一名存活的爪牙。', '你選的爪牙變成新的小惡魔，之後會被叫醒告知。'] };
    case 'regurgitate': return {
      say: [line(actor('shabaloth'), w('上一晚殺死的人，你可以讓其中一人復活'))],
      note: ['沙巴洛斯的能力：每晚叫醒他之前，說書人可以讓他上一晚殺死的一人復活，那人恢復能力。', '不想讓人復活就選「無人」。'] };
    case 'mayor': return {
      say: [line(w('惡魔攻擊了'), S(d.targetId), named('mayor'), w('，你可以改由別人代他死'))],
      note: ['鎮長的能力：夜裏被惡魔攻擊時，可能由另一名玩家代替他死亡，由你決定。',
        '選鎮長：他自己死。選別人：那人代他死（算被惡魔殺死）。選「無人死亡」：今晚沒人死。'] };
    case 'grandchild': return {
      say: [line(actor('grandmother'), w('首夜要得知她的孫子：選一名善良玩家'))],
      note: ['祖母首夜得知一名善良玩家和他的角色，這人就是她的孫子。', '之後惡魔殺死孫子時，祖母也會跟著死。'] };
    case 'drunk': return step.roleId === 'innkeeper' ? {
      say: [line(actor('innkeeper'), w('保護了'), picks.map(S), w('：其中一人醉酒到明天黃昏，由你選'))],
      note: ['旅店老闆選的兩人今晚不會死，但其中一人醉酒到明天黃昏。', '醉酒的人能力無效，他自己不知道。'] } : {
      say: [line(actor('sailor'), w('選了'), picks.map(S), w('：他們兩人之一醉酒到明天黃昏，由你選'))],
      note: ['水手每晚選一名存活玩家，他和水手之一醉酒到明天黃昏。', '醉酒的人能力無效，他自己不知道；水手醉酒時，今晚就可能被殺死。'] };
    case 'gamble': return {
      say: [line(actor('gambler'), w('猜'), S(d.targetId), w('是'), d.guess && named(d.guess)),
        line(S(d.targetId), w('其實是'), named(roleOf(s, d.targetId)), w('，可以被當作他猜的角色'))],
      note: ['賭徒猜錯就死。', '他猜的人能被當作別的角色（隱士、間諜這類），所以算不算猜對由你決定：算對，賭徒沒事；算錯，賭徒死亡。'] };
    case 'gossip': return {
      say: [line(actor('gossip'), w('今天的聲明如果是真的，今晚要死一人'))],
      note: ['造謠者白天公開說一句話；如果那句話是真的，當晚由你選一名玩家死亡。', '聲明是假的就選「無人」。'] };
    case 'moonreg': return {
      say: [line(actor('moonchild'), w('死前選了'), S(d.targetId), named(roleOf(s, d.targetId)), w('，他可以被當作另一陣營'))],
      note: ['月之子死時選一名玩家：選中善良玩家，那人當晚死亡。', '他選的人能被當作另一陣營（隱士、間諜這類），所以由你決定：算善良，那人死亡；算邪惡，無事發生。'] };
    case 'sweetheart': return {
      say: [line(actor('sweetheart'), w('死了，要有一名玩家從此醉酒，由你選'))],
      note: ['心上人死亡時，由說書人選一名玩家從此醉酒：他的能力一直無效，自己不知道。'] };
    case 'neighbor': return {
      say: [line(named('vigormortis'), w('殺死了爪牙'), picks.map(S), w('：他保留能力，兩邊最近的鎮民之一中毒，由你選'))],
      note: ['亡骨魔殺死的爪牙死後仍保有能力；同時這名爪牙兩邊最近的鎮民之一中毒，直到亡骨魔失去能力。'] };
    case 'ability': return {
      note: ['中毒、醉酒的人（還有酒鬼、瘋子）沒有真正的能力，但他自己不知道。', '所以照常讓他行動，只是這一步不產生效果。'] };
    default: return null;
  }
}

// 白天的裁定（ctx.state.st.ruling）。say：接在「誰做了什麼」那一行後面的因果；note：小字說明
export function rulingWhy(s, r) {
  const S = id => seatBadge(s, id), off = !!r.why;
  switch (r.kind) {
    case 'slayer': return {
      say: off ? null : !r.real ? line(S(r.seatId), w('不是獵手（或能力已經用過），所以無事發生'))
        : r.demon ? line(S(r.to), w('是惡魔，所以他死亡'))
          : r.reg ? line(S(r.to), named(roleOf(s, r.to)), w('可以被當作惡魔：算命中，他死亡；算未中，無事發生'))
            : r.tgtWhy ? line(S(r.to), named(roleOf(s, r.to)), w(r.tgtWhy, 'evil'), w('，不能被當作惡魔，所以無事發生'))
              : line(S(r.to), w('不是惡魔，所以無事發生')),
      note: ['獵手每局一次，白天公開選一名玩家：選中惡魔，惡魔死亡；否則什麼都不發生。', off && '中毒、醉酒的獵手開槍無效，他自己不知道。'] };
    case 'virgin': return {
      say: !r.forced ? line(S(r.from), named(roleOf(s, r.from)), w('可以被當作鎮民：算鎮民，提名者被處決；不算，無事發生'))
        : r.auto ? line(S(r.from), w('是鎮民，所以提名者會被處決')) : null,
      note: [] };
    case 'saint': return {
      say: off ? line(w('聖徒沒有能力，所以被處決也不會輸')) : line(S(r.seatId), named('saint'), w('被處決，所以邪惡獲勝')),
      note: ['聖徒被處決時，善良陣營落敗；聖徒中毒或醉酒時不會。'] };
    case 'scarletwoman': return {
      say: off ? line(w('紅唇女郎沒有能力，所以不接任')) : line(w('惡魔死了，存活玩家還有 5 人或以上，所以'), S(r.seatId), w('變成新的惡魔')),
      note: ['紅唇女郎：惡魔死亡時，如果還有 5 名或以上存活玩家，她變成那個惡魔。'] };
    case 'mayor': return {
      say: off ? line(w('鎮長沒有能力，所以遊戲繼續')) : line(w('只剩 3 名存活玩家，今天沒有人被處決，所以善良獲勝')),
      note: ['鎮長：只剩 3 名存活玩家且當天沒有處決時，善良陣營獲勝。', off && '鎮長中毒、醉酒時沒有這個能力。'] };
    case 'pacifist': return {
      say: line(S(r.to), w('是善良玩家，被處決了；和平主義者在場，所以他可能不死，由你決定')),
      note: ['和平主義者：被處決的善良玩家可能不死亡，由說書人決定。', '選「不死亡」：處決不生效，他活著；選「死亡」：照常死亡。'] };
    case 'klutz': return {
      say: off ? null : r.reg ? line(S(r.to), named(roleOf(s, r.to)), w('可以被當作另一陣營：算邪惡，呆瓜的陣營落敗；算善良，無事發生'))
        : r.tgtWhy ? line(S(r.to), named(roleOf(s, r.to)), w(r.tgtWhy, 'evil'), w(r.auto ? '，不能被當作善良，所以呆瓜的陣營落敗' : '，不能被當作邪惡，所以無事發生'))
          : r.auto ? line(S(r.to), w('是邪惡玩家，所以呆瓜的陣營落敗')) : line(S(r.to), w('是善良玩家，所以無事發生')),
      note: ['呆瓜得知自己死亡時，要公開選一名存活玩家：選中邪惡玩家，他的陣營落敗。', off && '中毒、醉酒的呆瓜選人沒有效果。'] };
    default: return null;
  }
}

// 角落的規則說明：卡片角落一枚「說明」小籤，點開是一張從它飛出來的說明紙（看完了飛回去）。
// 全文放進卡裏會把卡撐大：要麼被縮小看不清，要麼壓到座位、把「確定」擠出視野，所以另開一張，卡片本身一點不動
export function whyNote(lines, title = '規則說明') {
  const list = (lines || []).filter(Boolean);
  if (!list.length) return null;
  const btn = h('button', { class: 'in-tab', type: 'button', title: '規則說明', onclick: () => modal(title, h('div', { class: 'why-sheet' },
    list.map(t => h('p', {}, t)),
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '看完了'))), { from: btn, away: () => btn, cls: 'why-modal' }) },
  icon('book'), h('span', {}, '說明'));
  return h('div', { class: 'ic-note' }, btn);
}

// 「說明」籤跟在主句最後一行的句尾（不另佔一行：手機上卡片在畫面頂上的橫條裏，多一行就要捲動才看得到）。
// 電腦、橫屏另由 fx.css 掛到卡片角上。主句不是 why-line（沒寫到的裁定）就放不進去，回 false 讓呼叫方另放
export function tagLast(say, note) {
  const last = [say].flat(Infinity).filter(Boolean).at(-1);
  if (!note || !last?.classList?.contains('why-line')) return false;
  last.append(note);
  return true;
}
