// 規則與流程：圖解說明書。玩家看「遊戲規則」，說書人多一份「說書人指南」
// 插圖用遊戲裏真實的角色牌、座位號圓章、式子、按鈕和菜單樣式（版式在 css/help.css）；
// 每節滾進視野時落下，會動的插圖（.hp-scene）播一遍，點插圖重播
import { h, modal, roleToken } from './ui.js';
import { icon, seatBadge, mini, tag, w, named, formula } from './glyph.js';
import { crownSvg } from './scores.js';
import { ROLES, TEAMS } from './roles.js';
import { EGG, MVP_WINDOW } from './score.js';

// 插圖裏的座位：7 人局，只有號碼
const S = { seats: Array.from({ length: 7 }, (_, i) => ({ id: 'h' + (i + 1), name: '' })) };
const sb = (n, cls) => seatBadge(S, 'h' + n, cls);
// 式子：數字是座位號，字串是短詞，其他照 glyph 的格式
const frm = (...terms) => formula(S, terms.map(t => (typeof t === 'number' ? { s: 'h' + t } : typeof t === 'string' ? { w: t } : t)));
const tok = (id, size = 'sm') => roleToken(id, { size });
const blank = (n, cls = '') => h('div', { class: 'token sm blank solid ' + cls }, n);
const nth = (i, el) => { el.style.setProperty('--i', i); return el; };
const can = (ok, text) => h('span', { class: 'hp-yn ' + (ok ? 'yes' : 'no') }, icon(ok ? 'check' : 'cross'), text);
const hands = n => h('span', { class: 'hp-votes' }, icon('hand'), n);
const fake = (text, cls = '', ico) => h('span', { class: 'btn sm ' + cls }, ico && icon(ico), text);
const teamTag = (team, text) => h('span', { class: 'tag', style: { '--team': TEAMS[team].color } }, text);

const sec = (key, ico, nav, title, ...kids) => h('section', { class: 'hp-sec', 'data-sec': key, 'data-ico': ico, 'data-nav': nav },
  h('header', { class: 'hp-h' }, h('span', { class: 'hp-seal' }, icon(ico)), h('h3', {}, title)), kids);
const card = (cls, ...kids) => h('div', { class: 'hp-card ' + cls }, kids);
const grid = (cls, ...kids) => h('div', { class: 'hp-grid ' + cls }, kids);
// 一句大字 + 一行小字
const say = (big, small) => h('div', { class: 'hp-say' }, h('b', {}, big), small && h('small', {}, small));
const big = (x, cls = '') => h('span', { class: 'hp-big-ico ' + cls }, typeof x === 'string' ? icon(x) : x);
// 插圖區：淺色紙底，裏面的東西居中
const pic = (...kids) => h('div', { class: 'hp-pic' }, kids);
const step = (n, p, text) => h('div', { class: 'hp-step' }, h('span', { class: 'hp-no' }, n), pic(p), text);
// 會動的插圖：滾進視野播一遍，點一下重播
const scene = (cls, ...kids) => h('div', { class: 'hp-scene ' + cls, onclick: e => replay(e.currentTarget) },
  kids, h('span', { class: 'hp-replay', title: '重播' }, icon('reset')));
function replay(el) { el.classList.remove('play'); void el.offsetWidth; el.classList.add('play'); }

// ———— 遊戲規則 ————
const team = (k, name, sub, roles, win) => h('div', { class: 'hp-team ' + k },
  h('div', { class: 'hp-team-h' }, h('b', {}, name), h('small', {}, sub)),
  h('div', { class: 'hp-toks' }, roles.map((r, i) => nth(i, h('span', { class: 'hp-drop' }, tok(r, 'md'))))),
  h('div', { class: 'hp-win' }, h('span', { class: 'hp-win-k' }, '獲勝'), win));
// 邪惡的勝利：一排座位一個個倒下，只剩兩個
const dwindle = (n, left) => h('span', { class: 'hp-dots' }, Array.from({ length: n }, (_, i) =>
  i < n - left ? nth(i, h('i', { class: 'gone' }, icon('cross'))) : h('i', {})));

const GOAL = () => sec('goal', 'trophy', '目標', '誰會贏？',
  scene('hp-vs',
    team('good', '善良', '鎮民和外來者', ['washerwoman', 'empath', 'chef', 'saint'],
      h('span', { class: 'hp-row' }, icon('noose'), mini('imp'), h('b', {}, '處決惡魔'))),
    h('span', { class: 'hp-vs-k' }, 'VS'),
    team('evil', '邪惡', '爪牙和惡魔', ['poisoner', 'spy', 'imp'],
      h('span', { class: 'hp-row' }, dwindle(7, 2), h('b', {}, '只剩 2 人存活')))),
  grid('two',
    card('fact', big('mask'), say('角色是秘密', '可以說真話，也可以說謊')),
    card('fact', big(h('b', {}, '7+')), h('div', { class: 'hp-say' },
      h('b', {}, '邪惡首夜互認'),
      h('span', { class: 'hp-row' }, tag('minion'), w('互認'), tag('demon')),
      h('span', { class: 'hp-row' }, tag('demon'), w('還得知'), mini('mayor'), mini('virgin'), mini('slayer'), w('不在場，可偽裝')),
      h('small', {}, '5–6 人局不互認')))));

const STOPS = [['night', 'moon', '夜晚', '閉眼，有能力的人依次醒來'], ['dawn', 'sun', '天亮', '公佈昨晚誰死了'],
  ['talk', 'talk', '白天', '討論、私聊、提名'], ['exec', 'noose', '處決', '投票，最多處決 1 人']];
const DAY = () => sec('day', 'sun', '一天', '一天怎麼過',
  scene('hp-cycle',
    h('div', { class: 'hp-stops' }, STOPS.map(([k, ico, name, sub], i) => [
      i > 0 && h('i', { class: 'hp-link' }),
      nth(i, h('div', { class: 'hp-stop ' + k }, h('span', { class: 'hp-stop-seal' }, icon(ico)), h('b', {}, name), h('small', {}, sub)))])),
    h('div', { class: 'hp-loop' }, h('span', {}, icon('reset'), '再入夜，直到一方獲勝'))));

// 計票時鐘：7 人圍一圈，5 號被提名；指針從 6 號順時針數到 5 號，數到舉手的人就按下一票，滿 4 票蓋章
const RING = [1, 2, 3, 4, 5, 6, 7], ORDER = [6, 7, 1, 2, 3, 4, 5], UP = new Set([6, 7, 1, 2]);
function tally() {
  const t = n => 0.6 + ORDER.indexOf(n) * 0.45;
  let k = 0;
  return scene('hp-tally',
    h('div', { class: 'hp-clock' },
      h('i', { class: 'hp-hand-line' }),
      RING.map(n => h('span', { class: 'hp-cs' + (n === 5 ? ' nominee' : ''), style: { '--a': (n - 1) / 7 * 360 + 'deg', '--t': t(n) + 's' } },
        blank(n), UP.has(n) && h('span', { class: 'hp-up' }, icon('hand'))))),
    h('div', { class: 'hp-need' },
      h('div', { class: 'hp-slots' }, ORDER.filter(n => UP.has(n)).map(n => h('i', { style: { '--t': t(n) + 's', '--k': k++ } }, icon('hand')))),
      h('b', {}, '7 人存活，需要 4 票'),
      h('small', {}, '存活人數的一半，向上取整'),
      h('span', { class: 'hp-stamp' }, '上處決台')));
}
const VOTE = () => sec('vote', 'noose', '處決', '怎麼處決人',
  grid('two',
    card('step', step(1, frm(2, { op: 'to' }, 5), say('提名', '每人每天提名 1 次、被提名 1 次'))),
    card('step', step(2, h('span', { class: 'hp-row' }, h('span', { class: 'vbtn yes on' }, icon('hand'), '贊成'), h('span', { class: 'hp-timer' }, icon('timer'), '5:00')),
      [say('舉手', '倒數結束，按當時舉著的手算'),
        h('span', { class: 'hp-row sm' }, icon('abstain'), w('棄權'), icon('hidden'), h('small', {}, '只有你和說書人看得到'))]))),
  card('step wide', step(3, tally(), say('計票', '說書人喊「立即計票」：從被提名者的下一位順時針數，數過就定下來'))),
  grid('two',
    card('rule', pic(h('span', { class: 'hp-row' }, sb(5), hands(4), w('比'), sb(2), hands(3), w('多'))), say('最高票上處決台', '白天結束時處決他')),
    card('rule', pic(h('span', { class: 'hp-row' }, sb(5), hands(4), w('和'), sb(2), hands(4), w('平票'))), say('同票：無人處決'))),
  card('fact dead', big('skull'), h('div', { class: 'hp-say' },
    h('b', {}, '死了還在局裏'),
    h('span', { class: 'hp-row' }, can(true, '能說話'), can(false, '不能提名'), h('span', { class: 'hp-yn' }, icon('ticket'), '一張死亡票')),
    h('small', {}, '死亡票用掉就沒了'))));

const WINS = [['saint', '死於處決：善良落敗'], ['mayor', '只剩 3 人且白天無人處決：善良獲勝'], ['scarletwoman', '5 人以上存活時惡魔死亡：她變成惡魔']];
const regAs = (roleId, tags, text) => card('trap', scene('hp-reg', tok(roleId, 'md'),
  h('span', { class: 'hp-as' }, w('可能被當作'), h('span', { class: 'hp-tags' }, tags.map(([t, l], i) => nth(i, teamTag(t, l)))))),
  say(ROLES[roleId].name, text));
const TRAP = () => sec('trap', 'drop', '陷阱', '小心陷阱',
  grid('two',
    card('trap', scene('hp-poison', h('span', { class: 'hp-drip' }, icon('drop')), tok('chef', 'md')),
      say('中毒 / 醉酒', '能力失效，得到的信息可能是錯的，他自己不知道')),
    card('trap', scene('hp-flip', h('span', { class: 'hp-flip-in' }, h('span', { class: 'f' }, tok('washerwoman', 'md')), h('span', { class: 'b' }, tok('drunk', 'md'))),
      h('span', { class: 'hp-thinks' }, w('以為是'), mini('washerwoman'))),
      say('酒鬼', '以為自己是鎮民，其實能力無效')),
    regAs('recluse', [['demon', '邪惡'], ['minion', '爪牙'], ['demon', '惡魔']], '別人可能查到他是邪惡'),
    regAs('spy', [['townsfolk', '善良'], ['townsfolk', '鎮民'], ['outsider', '外來者']], '別人可能查到他是善良')),
  card('wide', h('b', { class: 'hp-k' }, '改變勝負的角色'),
    grid('three', WINS.map(([r, text]) => h('div', { class: 'hp-who' }, tok(r), say(ROLES[r].name, text))))));

const prize = (ico, n, label) => h('span', { class: 'hp-prize' }, icon(ico), h('b', {}, n), h('small', {}, label));
const SPLAT = '<path d="M50 14c9 0 12 9 20 9s16 5 15 14-6 10-5 17 6 13-1 19-16 2-22 6-10 9-18 6-6-9-13-11-16 0-17-9 7-11 6-18-8-12-1-18 13-2 19-8 8-7 17-7z" fill="#fffdf3" stroke="#2a2622" stroke-width="2"/>'
  + '<circle cx="48" cy="47" r="14" fill="#f2b632" stroke="#2a2622" stroke-width="2"/><ellipse cx="43" cy="42" rx="4" ry="3" fill="#fbe2a0"/>';
function splat() {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  el.setAttribute('class', 'hp-splat');
  el.innerHTML = SPLAT;
  return el;
}
const EGGS = () => sec('egg', 'egg', '獎勵', '贏了有什麼',
  grid('four',
    card('award win', h('b', { class: 'hp-k' }, '獲勝'), prize('trophy', '+1', '勝利積分'), prize('egg', '+' + EGG.win, '雞蛋')),
    card('award', h('b', { class: 'hp-k' }, '失敗'), prize('egg', '+' + EGG.lose, '雞蛋')),
    card('award', h('b', { class: 'hp-k' }, 'MVP'), prize('star', '+1', 'MVP 次數'), prize('egg', '+' + EGG.mvp, '雞蛋')),
    card('award', h('b', { class: 'hp-k' }, '第一次進房間'), prize('egg', String(EGG.start), '雞蛋'))),
  grid('two',
    card('fact', h('span', { class: 'hp-crowns' }, crownSvg('good'), crownSvg('evil')), say('贏家戴陣營皇冠', '所有人都看得到，直到下一次分出勝負')),
    card('fact', big('star', 'brass'), say(`終局後 ${MVP_WINDOW / 1000} 秒選 MVP`, '點座位上的星星：每人一票，可以投自己，說書人也投；平票一起當選'))),
  grid('one',
    card('fact', scene('hp-throw', sb(1, 'lg'), h('span', { class: 'hp-egg' }, h('span', {}, icon('egg'))), h('span', { class: 'hp-target' }, blank(4), splat())),
      say('隨時扔雞蛋', '點別人的座位「扔雞蛋」，扔一枚少一枚；點頂欄的雞蛋數看積分榜'))));

// 一屏的地圖：各區域在哪（手機上側欄收進頂欄的標籤）
const ZONES = [['top', '頂欄', '雞蛋、靜音、規則、更多', '雞蛋、日誌、角色表、更多'], ['hud', '你的牌', '角色、能力、每晚的信息'],
  ['ring', '圓桌', '點座位'], ['side', '側欄', '日誌、說書人、角色表'], ['dock', '操作塢', '現在該做什麼']];
const MENU_P = [[icon('egg', 'menu-ico'), '扔雞蛋', h('b', { class: 'menu-n' }, 3)], '提名他', '宣稱獵手：向他開槍', '私聊', '標記角色猜測', '加備註'];
const OPS = () => sec('ops', 'tap', '操作', '網頁怎麼用',
  scene('hp-map', h('div', { class: 'hp-screen' }, ZONES.map(([k, name, sub, m], i) => nth(i, h('div', { class: 'z z-' + k },
    k === 'ring' && h('span', { class: 'hp-mini-ring' }, RING.map(n => { const a = (n - 1) / 7 * Math.PI * 2; return h('i', { style: { left: 50 + 50 * Math.sin(a) + '%', top: 50 - 50 * Math.cos(a) + '%' } }); })),
    h('b', {}, name), h('small', { class: m ? 'd' : '' }, sub), m && h('small', { class: 'm' }, m)))))),
  grid('two',
    card('how', scene('hp-pick', h('span', { class: 'hp-row' }, blank(2), blank(3, 'pick'), blank(4)), fake('確認', 'primary')),
      say('夜晚輪到你', '在桌上點選玩家，再按「確認」')),
    card('how', scene('hp-info', h('span', { class: 'hp-inforow' }, frm(2, '和', 6, '之中有', { r: 'chef', named: true }))),
      say('新信息飛進左上角', '點或懸停一條信息，桌上相關的座位會亮；座位旁的小牌是信息裏提到的角色')),
    card('how', pic(h('div', { class: 'popmenu hp-menu' }, h('div', { class: 'popmenu-title' }, '4號 老王'), MENU_P.map(l => h('button', { tabindex: -1 }, l)))),
      say('點別人的座位', '猜測和備註只有你看得到，新的一局自動清空')),
    card('how', pic(h('span', { class: 'hp-row' }, h('span', { class: 'vbtn yes' }, icon('hand'), '贊成', h('i', {}, 3)), h('span', { class: 'vbtn no' }, icon('abstain'), '棄權', h('i', {}, 1)))),
      say('有人被提名', '按「贊成」舉手；計票時鐘數到你之前，可以再按一次放下'),
      h('span', { class: 'hp-row sm' }, mini('butler'), h('small', {}, '管家能看到主人是誰'))),
    card('how', pic(h('span', { class: 'hp-row' }, fake('', 'ghost icon-only', 'sound'), fake('規則與流程'), fake('⋯', 'ghost'))),
      say('頂欄', '喇叭靜音；「⋯」裏切換繁體 / 簡體、設置音效和煙花；側欄「角色表」看本劇本所有角色')),
    card('how', pic(h('span', { class: 'hp-skip' }, icon('skip'), '跳過')),
      say('演出', '開局翻牌、「第 N 夜」卡可以點一下跳過；其他演出播完為止'))));

// ———— 說書人指南 ————
const ruleBtn = (r, k, text) => h('span', { class: 'setup-role ' + k }, tok(r), h('span', {}, ROLES[r].name), h('i', {}, text));
const PREP = () => sec('prep', 'gear', '開局', '開局前',
  h('div', { class: 'hp-chain' },
    step(1, fake('複製邀請鏈接', '', 'send'), say('邀請', '發給朋友；玩家加入自動入座，座位菜單裏調順序')),
    step(2, h('span', { class: 'chips' }, h('span', { class: 'chip on' }, '暗流湧動'), h('span', { class: 'chip' }, '黯月初升'), h('span', { class: 'chip' }, '夢殞春宵')),
      say('選劇本', '圓桌中央切換')),
    step(3, scene('hp-rules', nth(0, ruleBtn('baron', 'rand', '隨機')), nth(1, ruleBtn('baron', 'lock', '必選')), nth(2, ruleBtn('baron', 'ban', '排除'))),
      say('角色配置', '點角色切換；男爵隨機時只在 7 人以上出現')),
    step(4, h('span', { class: 'hp-row' }, fake('一鍵開局', 'primary'), fake('先抽角色預覽', 'ghost')),
      say('開局', '預覽：角色先擺到座位上（只有你看得到），可換角色、指定紅鯡魚，滿意再開局'))),
  grid('two',
    card('fact warn', big('key', 'bad'), say('說書人鏈接', '在別的設備上接管主持（換手機、電腦重啟時用）。不要發給玩家')),
    card('fact', big('play'), say('人不夠？加機器人', '準備卡片裏加入：夜裏自動選目標，投票隨機舉手'))));

const WAKE = ['poisoner', 'monk', 'imp', 'ravenkeeper', 'empath', 'fortuneteller', 'butler'];
const opt = (n, on, truth) => h('span', { class: 'opt-tile' + (on ? ' on' : '') }, sb(n), truth && h('i', { class: 'tm' }, '真'));
const NIGHT = () => sec('night', 'moon', '夜晚', '夜晚',
  scene('hp-wake', WAKE.map((r, i) => nth(i, h('span', { class: 'hp-w' + (i < 3 ? ' done' : i === 3 ? ' cur' : '') }, tok(r), i < 3 && icon('check', 'hp-ok'))))),
  h('p', { class: 'hp-lead' }, '按官方順序逐個喚醒，操作卡在右側欄頂上，被喚醒的座位外圈亮金線'),
  card('how', pic(h('span', { class: 'hp-row' }, mini('ravenkeeper', 'ghost'), w('不在場'), icon('moon', 'pt-moon'), w('假裝叫醒'), fake('繼續', 'primary'))),
    say('不在場的角色', '也輪一次：停幾秒自動繼續，玩家看不出誰不在場。底部進度條上是虛線')),
  grid('two',
    card('how', pic(h('span', { class: 'hp-row' }, mini('poisoner'), w('等玩家選')), h('span', { class: 'hp-row' }, fake('代為選擇', 'ghost'), fake('跳過', 'ghost'))),
      say('要選人的角色', '玩家在手機上選；離線時你代為選擇或跳過')),
    card('how', pic(h('span', { class: 'hp-row' }, mini('imp'), w('攻擊'), mini('mayor'), w('可讓別人替死')),
      h('span', { class: 'hp-row' }, mini('imp'), w('自殺，沒有紅唇女郎'), tag('minion'), w('你選誰接任'))),
      say('小惡魔', '這兩種情況由你決定'))),
  card('wide give', h('div', { class: 'hp-ic' },
    h('div', { class: 'hp-ic-h' }, named('washerwoman')),
    h('div', { class: 'hp-ic-r' }, h('span', { class: 'hp-ic-k' }, icon('lock'), '真相'), frm(3, { op: 'eq' }, { r: 'chef' })),
    h('div', { class: 'hp-ic-r' }, h('span', { class: 'hp-ic-k' }, '干擾項'), h('span', { class: 'opt-row' }, opt(1), opt(5, true), opt(6))),
    h('div', { class: 'hp-ic-r see' }, h('span', { class: 'hp-ic-k' }, icon('eye'), '玩家看到'), frm(3, '和', 5, '之中有', { r: 'chef', named: true }))),
    say('給信息', '真相鎖定，只挑干擾項（也可以直接點桌上的座位）。能力正常時只能給合規的信息')),
  grid('two',
    card('how', pic(h('span', { class: 'opt-row' }, opt(1), opt(3, false, true), opt(5), opt(6))),
      say('中毒 / 酒鬼時', '卡片解鎖全部選項，真實答案帶「真」。魔典記錯了，先點座位「設為中毒」')),
    card('how', pic(h('span', { class: 'tags hp-tagrow' }, ['中毒', '被保護', '酒鬼', '紅鯡魚', '能力已用'].map(t => h('span', { class: 'tag' + (t === '中毒' ? ' bad' : '') }, t)))),
      say('座位下的小標籤', '還有洗衣婦等角色得到的信息'))),
  card('wide dawn', pic(h('span', { class: 'hp-row' }, h('span', { class: 'hp-yn' }, icon('skull'), '死亡'), h('span', { class: 'hp-yn' }, icon('drop', 'poison'), '中毒'),
    h('span', { class: 'hp-yn' }, icon('shield', 'good'), '保護')), fake('天亮，公佈死訊', 'primary', 'sun')),
    say('天亮前確認', '夜晚最後停在這裏：核對、需要時糾錯，再按「天亮」')));

const SDAY = () => sec('sday', 'sun', '白天', '白天',
  h('ol', { class: 'hp-flow' },
    h('li', {}, h('span', { class: 'hp-pic' }, frm(2, { op: 'to' }, 5)), say('玩家自己提名')),
    h('li', {}, h('span', { class: 'hp-pic hp-row' }, h('span', { class: 'hp-timer' }, icon('timer'), '5:00'), fake('', 'ghost icon-only', 'pause'), fake('', 'ghost icon-only', 'reset')),
      say('倒數 5 分鐘', '到點按當前舉手結算；審判牌上可以暫停 / 重置')),
    h('li', {}, h('span', { class: 'hp-pic hp-row' }, fake('立即計票', 'primary'), fake('按當前舉手結算'), fake('取消提名', 'ghost')),
      say('也可以由你推進', '「立即計票」先給所有人彈提示，再順時針數票，走完自動結算；取消提名後雙方今天可以重新提名 / 被提名')),
    h('li', {}, h('span', { class: 'hp-pic' }, fake('處決5號，入夜', 'primary')),
      say('結束白天', '按鈕上寫清將處決誰 / 無人處決，確認後入夜'))));

const AUTO = [['poisoner', '投毒'], ['monk', '保護'], ['soldier', '免疫'], ['imp', '殺人、傳位'], ['scarletwoman', '接任'], ['mayor', '替死、三人勝'],
  ['ravenkeeper', '死亡喚醒'], ['undertaker', '得知處決'], ['virgin', '反噬'], ['slayer', '開槍'], ['butler', '投票限制'], ['saint', '處決即敗']];
const AUTO_SEC = () => sec('auto', 'check', '自動', '系統幫你做的',
  scene('hp-auto', h('div', { class: 'hp-tokgrid' },
    AUTO.map(([r, t], i) => nth(i, h('span', { class: 'hp-tk' }, tok(r), h('small', {}, t)))),
    nth(12, h('span', { class: 'hp-tk' }, h('span', { class: 'hp-icotok' }, icon('ticket')), h('small', {}, '死亡票'))),
    nth(13, h('span', { class: 'hp-tk' }, h('span', { class: 'hp-icotok' }, icon('trophy')), h('small', {}, '勝負判定')))),
    h('span', { class: 'hp-stamp brass' }, '自動')),
  card('fact', big('quill'), say('黯月初升、夢殞春宵', '大多也自動；要你裁定時會停下來問。博學者、藝術家的問答等少數情況，用座位菜單「補發信息」')));

const MENU_ST = ['代入他的視角', '私聊', '補發信息（彈窗告訴他）', '-', '更換角色', '設為中毒', '設為占卜師的紅鯡魚', '標記死亡（糾錯）', '立即處決（糾錯）'];
const FIX = () => sec('fix', 'quill', '糾錯', '出錯了怎麼辦',
  h('div', { class: 'hp-split' },
    h('div', { class: 'popmenu hp-menu' }, h('div', { class: 'popmenu-title' }, '3號 小紅 · 小惡魔'),
      MENU_ST.map((l, i) => (l === '-' ? h('hr') : h('button', { tabindex: -1, class: i === MENU_ST.length - 1 ? 'danger' : '' }, l)))),
    h('div', { class: 'hp-stack' },
      card('fact', big('tap'), say('點任意座位', '更換角色會私下通知該玩家')),
      card('fact', big(h('b', {}, '⋯')), say('規則沒判到的勝負', '「⋯」裏判定善良 / 邪惡獲勝（例如呆瓜選中邪惡）')),
      card('fact warn', big('reset', 'bad'), say('放棄本局', '「⋯」裏清空本局回到準備，玩家留在座位上')))));

const PEEK = () => sec('peek', 'eye', '代入', '看玩家看到的',
  h('div', { class: 'hp-peek' }, h('span', { class: 'peekbar' }, '正在以 3號 小紅 的視角查看（只讀）', fake('返回說書人視角', 'primary'))),
  h('p', { class: 'hp-lead' }, '座位菜單「代入他的視角」：畫面和他完全一樣，只能看，用來確認信息送到了'),
  card('wide', h('b', { class: 'hp-k' }, '「流程」標籤'),
    h('div', { class: 'hp-logs' },
      h('div', { class: 'log-row' }, mini('empath'), sb(4), h('span', { class: 'lv lv0' }, frm({ n: 2 })), w('錯誤信息', 'bad')),
      h('div', { class: 'log-row' }, mini('investigator'), sb(2), h('span', { class: 'lv lv1' }, frm(6, { op: 'or' }, 7, { op: 'eq' }, { r: 'poisoner' })), w('登記信息'))),
    h('small', { class: 'hp-note' }, '按夜 / 天記錄每一步結算和發出的每條信息：錯誤的紅框，登記的橙框')));

const PAGES = { rules: () => [GOAL(), DAY(), VOTE(), TRAP(), EGGS(), OPS()], st: () => [PREP(), NIGHT(), SDAY(), AUTO_SEC(), FIX(), PEEK()] };

export function showHelp(isSt) {
  const tabs = isSt ? [['st', '說書人指南', 'quill'], ['rules', '遊戲規則', 'book']] : [];
  const tabBar = tabs.length > 0 && h('span', { class: 'hp-tabs' }, tabs.map(([k, l, ico]) => h('button', { 'data-k': k, onclick: () => show(k) }, icon(ico), l)));
  const nav = h('nav', { class: 'hp-nav' }), page = h('div', { class: 'hp-page' });
  const box = modal(h('span', { class: 'hp-title' }, h('b', {}, '規則與流程'), tabBar), h('div', { class: 'hp' }, nav, page), { wide: true, cls: 'help' });
  const scroller = box.querySelector('.modal-body');
  let seen = [];
  const jump = s => scroller.scrollTo({ top: scroller.scrollTop + s.getBoundingClientRect().top - scroller.getBoundingClientRect().top - nav.offsetHeight - 12, behavior: 'smooth' });
  // 目錄高亮：頂上已經滾過的最後一節；滾到底就是最後一節
  const spy = () => {
    const secs = [...page.querySelectorAll('.hp-sec')], top = scroller.getBoundingClientRect().top + nav.offsetHeight + 40;
    let cur = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= top) cur = s;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) cur = secs.at(-1);
    const was = nav.querySelector('.on');
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === cur?.dataset.sec));
    // 手機上目錄橫向滾動：亮的那顆換了就滾到中間
    const on = nav.querySelector('.on');
    if (on && on !== was) nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  };
  scroller.onscroll = spy;
  function show(k) {
    tabBar && tabBar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const secs = PAGES[k]();
    page.replaceChildren(...secs.flatMap((s, i) => (i ? [h('div', { class: 'hp-div' }, icon('spark')), s] : [s])),
      h('p', { class: 'credit' }, '角色圖示來自 game-icons.net（CC BY 3.0）。'));
    nav.replaceChildren(...secs.map(s => h('button', { 'data-k': s.dataset.sec, onclick: () => jump(s) }, icon(s.dataset.ico), h('span', {}, s.dataset.nav))));
    scroller.scrollTop = 0;
    // 每節滾進來時落下；插圖露出一大半再播
    seen.forEach(o => o.disconnect());
    const watch = (sel, cls, opts) => {
      const o = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add(cls); o.unobserve(e.target); } }), { root: scroller, ...opts });
      page.querySelectorAll(sel).forEach(el => o.observe(el));
      return o;
    };
    seen = [watch('.hp-sec', 'in', { rootMargin: '0px 0px -8% 0px' }), watch('.hp-scene', 'play', { threshold: 0.5 })];
    spy();
  }
  show(isSt ? 'st' : 'rules');
}
