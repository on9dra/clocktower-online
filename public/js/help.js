// 規則與流程：一本書，一章一頁。寬屏一頁兩欄（左邊插圖、右邊一步一行），手機一欄；
// 點頁面右半邊往後翻、左半邊往前翻，也可以按住左右拖；往後翻是當前頁從右邊書角掀起，往前翻是上一頁從書脊那邊書角先過來。
// 版式（css/help.css）：雙線版框；講「在哪」的章畫主桌面示意圖，要點的地方用朱筆圈出、蓋紅色圓印編號，右欄按編號一行一步；
// 補充說明撕成存根。書口貼索引籤，翻過去的章的籤在左邊
import { h, modal, closeModal, roleToken } from './ui.js';
import { icon, seatBadge, mini, tag, w, named, formula } from './glyph.js';
import { crownSvg } from './scores.js';
import { ROLES, TEAMS } from './roles.js';
import { EGG, MVP_WINDOW } from './score.js';
import { play } from './sfx.js';

// 插圖裏的座位：7 人局，只有號碼
const S = { seats: Array.from({ length: 7 }, (_, i) => ({ id: 'h' + (i + 1), name: '' })) };
const sb = (n, cls) => seatBadge(S, 'h' + n, cls);
// 式子：數字是座位號，字串是短詞，其他照 glyph 的格式
const frm = (...terms) => formula(S, terms.map(t => (typeof t === 'number' ? { s: 'h' + t } : typeof t === 'string' ? { w: t } : t)));
const tok = (id, size = 'sm') => roleToken(id, { size });
const blank = (n, cls = '') => h('div', { class: 'token sm blank solid ' + cls }, n);
const nth = (i, el) => { el.style.setProperty('--i', i); return el; };
const fake = (text, cls = '', ico) => h('span', { class: 'btn sm ' + cls }, ico && icon(ico), text);
const teamTag = (team, text) => h('span', { class: 'tag', style: { '--team': TEAMS[team].color } }, text);
const row = (...kids) => h('span', { class: 'hp-row' }, kids);
const b = text => h('b', {}, text);
const sm = text => h('small', {}, text);
const SVGNS = 'http://www.w3.org/2000/svg';
// 拉伸填滿：朱筆圈要貼著圈住的東西的長寬
const svg = (cls, box, inner) => {
  const el = document.createElementNS(SVGNS, 'svg');
  el.setAttribute('viewBox', box); el.setAttribute('preserveAspectRatio', 'none'); el.setAttribute('class', cls);
  el.innerHTML = inner;
  return el;
};

const NUM = '一二三四五六七八九';
const num = n => (n < 10 ? NUM[n - 1] : (n >= 20 ? NUM[Math.floor(n / 10) - 1] : '') + '十' + (n % 10 ? NUM[n % 10 - 1] : ''));
// 紅色圓印：步驟編號用阿拉伯數字（一二三在小字號下細得看不清）
const seal = (n, cls = '') => h('span', { class: 'hp-n ' + cls }, String(n));

// ———— 頁面上的零件 ————
// 一章的標題：圓章 + 大字，下面一粗一細兩道線
const title = (ico, text) => h('header', { class: 'pp-title' }, h('span', { class: 'hp-seal' }, icon(ico)), h('h2', {}, text));
// 一步一行：圓印編號 | 插圖 | 粗體短句 + 最多一行小字
const step = (n, p, label, note) => h('div', { class: 'rw' + (n ? '' : ' quiet') + (p ? '' : ' np') }, n ? seal(n) : h('i', { class: 'rw-dot' }),
  p && h('div', { class: 'rw-p' }, p), h('div', { class: 'rw-t' }, b(label), note && sm(note)));
const steps = (...kids) => h('div', { class: 'rws' }, kids);
// 次一級：圖標 + 粗體 + 小字
const line = (lead, t, ...more) => h('div', { class: 'hp-line' }, lead, h('div', { class: 'hp-say' }, b(t), more.map(x => (typeof x === 'string' ? sm(x) : x))));
const big = (x, cls = '') => h('span', { class: 'hp-big-ico ' + cls }, typeof x === 'string' ? icon(x) : x);
// 補充：頁底撕下來的存根
const stub = (...items) => h('footer', { class: 'hp-stub' }, seal('附', 'quiet'), h('div', { class: 'hp-memos' }, items));
const memo = (...kids) => h('span', { class: 'hp-memo' }, kids);
const block = (cls, ...kids) => h('div', { class: 'hp-blk ' + cls }, kids);
// 會動的插圖：翻到這頁播一遍
const scene = (cls, ...kids) => h('div', { class: 'hp-scene ' + cls }, kids);

// ———— 主桌面示意圖：只畫框架，要找的東西照原樣畫出來，朱筆圈住、蓋上編號 ————
// 朱筆圈：翻到這頁時一筆抹出來
// 從頂上起筆順時針繞一圈，收筆時越過起點一點；整圈都在外面，不會劃過圈住的東西
const LOOP = '<path d="M28 6C56 1 96 8 95 23C94 38 64 43 41 42C15 41 4 33 5 22C6 11 24 5 47 4"/>';
const mk = (n, el, cls = '') => h('span', { class: 'mk ' + cls }, el, svg('mk-o', '0 0 100 46', LOOP), n && seal(n, 'mk-n'));
// 已有的元素就地加朱筆圈（桌上的座位是絕對定位的，不能再包一層）
const mkOn = (el, n, cls = '') => { el.classList.add('mkd', ...cls.split(' ').filter(Boolean)); el.append(svg('mk-o', '0 0 100 46', LOOP), seal(n, 'mk-n')); return el; };
// 圓桌上的位置：dx、dy 是離圓桌中心多遠，單位是圓桌所在區域短邊的百分之一（cqmin）。
// 寬屏的桌面在左邊四分之三、手機的佔滿寬度，都按圓桌中心排，同一份座標兩種屏幕都對
const at = (dx, dy, ...kids) => h('div', { class: 'sk-at', style: { left: `calc(50% + ${dx}cqmin)`, top: `calc(50% + ${dy}cqmin)` } }, kids);
const atFoot = (...kids) => h('div', { class: 'sk-at foot' }, kids);
// 灰條：頂欄、側欄裏按屏幕寬（cqw），桌上按圓桌區域（cqmin）
const ph = (wd, cls = '') => h('i', { class: 'sk-ph ' + cls, style: { width: wd + 'cqw' } });
const tph = wd => h('i', { class: 'sk-ph', style: { width: wd + 'cqmin' } });
const skBtn = (text, cls = '') => h('span', { class: 'sk-btn ' + cls }, text);
// 座位：圍著圓桌一圈；lit 亮金圈（litMark：再圈上朱筆、編號），picked 是選中的
const skSeats = (lit, picked, litMark) => [1, 2, 3, 4, 5, 6, 7].map(n => {
  const el = h('i', { class: 'sk-seat' + (n === lit ? ' lit' : '') + (n === picked ? ' pick' : ''), style: { '--a': (n - 1) / 7 * 360 + 'deg' } }, String(n));
  return n === lit && litMark ? mkOn(el, litMark, 'tight r') : el;
});
// 寬屏、手機各一套的東西（頂欄的內容不一樣）
const pc = (...kids) => h('span', { class: 'sk-pc' }, kids);
const mo = (...kids) => h('span', { class: 'sk-mo' }, kids);
// 主桌面示意圖：寬屏橫着、手機豎着（help.css 按 .bk.one 換排法）。
// top：頂欄右邊 { pc, mo }；side：放進側欄的；hud：左上角「你的牌」；zoom：局部放大，虛線框（at: 'hud' 框「你的牌」，否則 box 是圓桌上的範圍）+ 下面放大畫出來
function sketch(kind, opts, ...kids) {
  const { lit, litMark, picked, top, side, hud, zoom } = opts;
  const box = zoom && (zoom.at === 'hud' ? h('i', { class: 'sk-box full' })
    : h('i', { class: 'sk-box', style: { left: `calc(50% + ${zoom.box[0]}cqmin)`, top: `calc(50% + ${zoom.box[1]}cqmin)`, width: zoom.box[2] + 'cqmin', height: zoom.box[3] + 'cqmin' } }));
  const scr = h('div', { class: 'sk-scr' + (hud ? ' has-hud' : '') },
    h('div', { class: 'sk-top' }, pc(ph(9, 'dark'), ph(5)), mo(ph(12, 'dark')), h('span', { class: 'grow' }),
      top ? [pc(top.pc), mo(top.mo)] : [pc(ph(3), ph(3), ph(6), ph(3)), mo(ph(8), ph(8), ph(8), ph(4))]),
    h('div', { class: 'sk-side' }, h('div', { class: 'sk-tabs' }, ph(4), ph(4), ph(4), ph(4)), ph(14), ph(11), ph(16), side),
    hud && h('div', { class: 'sk-hudz' }, hud, zoom?.at === 'hud' && box),
    h('div', { class: 'sk-table' }, h('i', { class: 'sk-ring' }), skSeats(lit, picked, litMark), kids, zoom?.at !== 'hud' && box));
  if (!zoom) return h('figure', { class: 'sk sk-' + kind }, scr);
  // 引線在翻到這頁時量出位置畫上（leads）
  return h('figure', { class: 'sk zoomed sk-' + kind }, scr, h('div', { class: 'sk-detail' }, zoom.detail), svg('sk-lead', '0 0 100 100', '<path/>'));
}
// 放大圖的引線：量出虛線框和放大圖的位置畫上去。
// 放大圖在下面（寬屏）：框離兩邊都有距離就兩條線連到放大圖上邊兩角，框靠邊就一條豎線；放大圖在右邊（手機）：連到左邊兩角
function leads(root) {
  root.querySelectorAll('.sk.zoomed').forEach(fig => {
    const fw = fig.offsetWidth, fh = fig.offsetHeight;
    if (!fw) return;
    const f = fig.getBoundingClientRect(), k = f.width / fw;
    const b = fig.querySelector('.sk-box').getBoundingClientRect(), d = fig.querySelector('.sk-detail').getBoundingClientRect();
    const X = v => (v - f.left) / k, Y = v => (v - f.top) / k;
    const bx0 = X(b.left), bx1 = X(b.right), by0 = Y(b.top), by1 = Y(b.bottom), dx0 = X(d.left) + 1, dx1 = X(d.right) - 1, dy0 = Y(d.top) + 1, dy1 = Y(d.bottom) - 1;
    const lead = fig.querySelector('.sk-lead');
    lead.setAttribute('viewBox', `0 0 ${fw} ${fh}`);
    lead.firstChild.setAttribute('d', dx0 >= bx1 - 2 ? `M${bx1} ${by0}L${dx0} ${dy0}M${bx1} ${by1}L${dx0} ${dy1}`
      : bx0 - dx0 > fw * 0.08 && dx1 - bx1 > fw * 0.08 ? `M${bx0} ${by1}L${dx0} ${dy0}M${bx1} ${by1}L${dx1} ${dy0}` : `M${(bx0 + bx1) / 2} ${by1}L${(bx0 + bx1) / 2} ${dy0}`);
  });
}
const skCard = (...kids) => h('div', { class: 'sk-card' }, kids);
// 放大圖裏不相干的東西：一道灰條
const gray = (wd, cls = '') => h('i', { class: 'skd-ph ' + cls, style: { width: wd + 'px' } });

// ———— 說書人指南 ————
const ruleBtn = (r, k, text) => h('span', { class: 'setup-role ' + k }, tok(r), h('span', {}, ROLES[r].name), h('i', {}, text));
const scripts = (cls = '') => h('span', { class: 'script-pick ' + cls }, h('span', { class: 'chip on' }, '暗流湧動'), h('span', { class: 'chip' }, '黯月初升'), h('span', { class: 'chip' }, '夢殞春宵'));
const PREP = {
  key: 'prep', nav: '開局', title: '開局前',
  ico: 'gear',
  a: () => [sketch('lobby', {
      zoom: { box: [-33, -30, 66, 63], detail: h('div', { class: 'skd-col' },
        mk(1, scripts(), 't-one'),
        gray(150),
        mk(2, fake('角色配置')),
        mk(3, h('span', { class: 'btn primary' }, '一鍵開局'))) },
    },
      at(0, -24, h('b', { class: 'sk-t' }, '準備')),
      at(0, -13, scripts()),
      at(0, -3, tph(24)), at(0, 4.5, tph(31)),
      at(0, 14, h('span', { class: 'sk-line' }, tph(12), skBtn('角色配置'), tph(16))),
      at(0, 26, skBtn('一鍵開局', 'pri')))],
  b: () => [
    steps(
      step(1, null, '選劇本', '換劇本會清掉角色配置'),
      step(2, scene('hp-rules', nth(0, ruleBtn('baron', 'rand', '隨機')), nth(1, ruleBtn('baron', 'lock', '必選')), nth(2, ruleBtn('baron', 'ban', '排除'))), '角色配置', '點角色切換'),
      step(3, [h('span', { class: 'btn primary' }, '一鍵開局'), row(w('或'), fake('先抽角色預覽', 'ghost'))], '開局')),
    stub(memo(fake('複製邀請鏈接', '', 'send'), sm('頂欄')),
      memo(icon('key', 'bad'), b('說書人鏈接'), sm('「⋯」裏，別發給玩家')),
      memo(fake('加入機器人'), sm('人不夠時')))],
};

const WAKE = ['poisoner', 'monk', 'imp', 'ravenkeeper', 'empath'];
const NIGHT = {
  key: 'night', nav: '夜晚', title: '夜晚',
  ico: 'moon',
  a: () => [sketch('night', {
      lit: 1, litMark: 2,
      zoom: { box: [-22, -28, 44, 56], detail: h('div', { class: 'skd-col' },
        h('b', { class: 'skd-t' }, '第 1 夜'),
        mk(1, h('div', { class: 'skd-card' }, row(tok('librarian'), sb(1)), gray(110), fake('發送', 'primary', 'send')))) },
    },
      at(0, -21, h('b', { class: 'sk-t' }, '第 1 夜')),
      at(0, 5, skCard(h('i', { class: 'sk-tok' }), tph(16), tph(21), skBtn('發送', 'pri'))),
      atFoot(mk(3, h('span', { class: 'sk-strip' }, [0, 1, 2, 3, 4, 5, 6, 7].map(i => h('i', { class: i === 2 ? 'on' : i === 5 ? 'fake' : '' }))))))],
  b: () => [
    steps(
      step(1, h('span', { class: 'hp-col2' }, fake('發送', 'primary', 'send'), fake('天亮，公佈死訊', 'primary', 'sun')), '中央的卡', '一步一張，最後一張是天亮'),
      step(2, h('span', { class: 'hp-wake' }, nth(0, h('span', { class: 'hp-w cur' }, tok('ravenkeeper')))), '被叫醒的座位', '外圈亮金線'),
      step(3, scene('hp-strip', WAKE.map((r, i) => nth(i, h('span', { class: 'hp-w' + (i < 2 ? ' done' : i === 2 ? ' cur' : '') + (i === 3 ? ' fake' : '') }, tok(r))))), '今晚的順序', '虛線的是假裝叫醒')),
    stub(memo(mini('ravenkeeper', 'ghost'), b('不在場的角色'), sm('也假裝叫醒，玩家看不出')),
      memo(b('玩家離線'), sm('你代為選擇或跳過')),
      memo(mini('imp'), b('小惡魔'), sm('替死、傳位由你選')))],
};

const opt = (n, on, truth) => h('span', { class: 'opt-tile' + (on ? ' on' : '') }, sb(n), truth && h('i', { class: 'tm' }, '真'));
const INFO = {
  key: 'info', nav: '信息', title: '給信息',
  ico: 'send',
  a: () => [h('div', { class: 'hp-ic' },
      h('div', { class: 'hp-ic-h' }, named('washerwoman')),
      h('div', { class: 'hp-ic-r' }, h('span', { class: 'hp-ic-k' }, icon('lock'), '真相'), mk(1, frm(3, { op: 'eq' }, { r: 'chef' }), 'r')),
      h('div', { class: 'hp-ic-r' }, h('span', { class: 'hp-ic-k' }, '干擾項'), mk(2, h('span', { class: 'opt-row' }, opt(1), opt(5, true), opt(6)), 'r')),
      h('div', { class: 'hp-ic-r see' }, h('span', { class: 'hp-ic-k' }, icon('eye'), '玩家看到'), mk(3, frm(3, '和', 5, '之中有', { r: 'chef', named: true }), 'r')),
      h('div', { class: 'hp-ic-f' }, fake('發送', 'primary', 'send'))),
    line(big('check'), '能力正常時', '只能給合規的信息')],
  b: () => [
    steps(
      step(1, null, '真相鎖定', '按規則算好，改不了'),
      step(2, null, '挑干擾項', '也可以直接點桌上的座位'),
      step(3, null, '玩家看到的', '發送後飛進他的信息欄')),
    block('poison', h('h4', {}, icon('drop', 'poison'), '中毒 / 酒鬼時'),
      h('span', { class: 'opt-row' }, opt(1), opt(3, false, true), opt(5), opt(6)), sm('全部選項解鎖，「真」是真實答案')),
    stub(memo(b('魔典記錯了'), sm('點座位「設為中毒」')),
      memo(h('span', { class: 'tags hp-tagrow' }, h('span', { class: 'tag bad' }, '中毒'), h('span', { class: 'tag' }, '紅鯡魚')), sm('座位下的小標籤')))],
};

const SDAY = {
  key: 'sday', nav: '白天', title: '白天',
  ico: 'sun',
  a: () => [sketch('day', {
      zoom: { box: [-41, -23, 82, 46], detail: h('div', { class: 'skd-trial' },
        h('span', { class: 'skd-row' }, sb(2, 'lg'), h('b', { class: 'hp-stamp sm' }, '提名'), sb(5, 'lg')),
        h('span', { class: 'skd-row' }, h('span', { class: 'hp-timer' }, icon('timer'), '4:52'), gray(70)),
        h('span', { class: 'skd-row foot' }, fake('取消提名', 'ghost'), fake('按當前舉手結算'), mk(1, fake('立即計票', 'primary'), 't'))) },
    },
      at(0, 0, h('div', { class: 'sk-trial' },
        h('span', { class: 'sk-line' }, h('i', { class: 'sk-tok' }), h('b', { class: 'sk-stamp' }, '提名'), h('i', { class: 'sk-tok bad' })),
        tph(28), h('span', { class: 'sk-line' }, tph(10), tph(14), skBtn('立即計票', 'pri')))))],
  b: () => [
    steps(
      step(0, frm(2, { op: 'to' }, 5), '玩家自己提名'),
      step(0, h('span', { class: 'hp-timer' }, icon('timer'), '5:00'), '倒數 5 分鐘', '到點按舉著的手結算'),
      step(1, fake('立即計票', 'primary'), '立即計票', '順時針數票，數完自動結算'),
      step(2, h('span', { class: 'hp-gal' }, icon('noose'), fake('處決5號，入夜', 'primary')), '結束白天', '掛在處決台下面')),
    stub(memo(fake('取消提名', 'ghost'), sm('雙方今天可以重新提名')),
      memo(fake('按當前舉手結算'), sm('不數票直接結算')))],
};

const AUTO = [['poisoner', '投毒'], ['monk', '保護'], ['soldier', '免疫'], ['imp', '殺人、傳位'], ['scarletwoman', '接任'], ['mayor', '替死、三人勝'],
  ['ravenkeeper', '死亡喚醒'], ['undertaker', '得知處決'], ['virgin', '反噬'], ['slayer', '開槍'], ['butler', '投票限制'], ['saint', '處決即敗']];
const AUTO_SEC = {
  key: 'auto', nav: '自動', title: '系統幫你做的',
  ico: 'check',
  a: () => [scene('hp-auto', h('div', { class: 'hp-tokgrid' },
      AUTO.map(([r, t], i) => nth(i, h('span', { class: 'hp-tk' }, tok(r), sm(t)))),
      nth(12, h('span', { class: 'hp-tk' }, h('span', { class: 'hp-icotok' }, icon('ticket')), sm('死亡票'))),
      nth(13, h('span', { class: 'hp-tk' }, h('span', { class: 'hp-icotok' }, icon('trophy')), sm('勝負判定')))),
      h('span', { class: 'hp-stamp brass' }, '自動'))],
  b: () => [
    block('rule', h('h4', {}, '要你裁定時'),
      h('div', { class: 'card infocard ruling' }, h('div', { class: 'rule-k' }, icon('timer'), '獵手開槍'),
        h('div', { class: 'frm-line' }, sb(3), mini('slayer'), w('射'), sb(5), mini('imp')),
        h('div', { class: 'row' }, h('span', { class: 'btn sm primary' }, icon('check'), '命中'))),
      sm('卡在圓桌中央；結果唯一時只有一個按鈕')),
    line(h('span', { class: 'hp-lit' }, blank(4)), '選項是座位時', '直接點桌上的座位；固定的目標亮金圈'),
    stub(memo(icon('quill'), b('黯月初升、夢殞春宵'), sm('大多也自動')),
      memo(b('補發信息'), sm('博學者、藝術家等：座位菜單裏')))],
};

// 座位菜單和頂欄「⋯」菜單：照遊戲裏的樣子畫，危險的項紅字
const popmenu = (head, items) => h('div', { class: 'popmenu hp-menu' }, head && h('div', { class: 'popmenu-title' }, head),
  items.map(l => (l === '-' ? h('hr') : h('button', { tabindex: -1, class: l.endsWith('!') ? 'danger' : '' }, l.replace('!', '')))));
const MENU_ST = ['代入他的視角', '私聊', '補發信息', '-', '更換角色', '設為中毒', '標記死亡（糾錯）', '立即處決（糾錯）!'];
const FIX = {
  key: 'fix', nav: '糾錯', title: '出錯了怎麼辦',
  ico: 'quill',
  a: () => [h('div', { class: 'hp-menus' },
      h('div', { class: 'hp-menuat' }, mk(1, h('span', { class: 'hp-tap' }, tok('imp', 'md'), icon('tap', 'hp-finger')), 'tight'), popmenu('3號 · 小惡魔', MENU_ST)),
      h('div', { class: 'hp-menuat' }, mk(2, fake('⋯', 'ghost'), 'tight'), popmenu(null, ['判定善良獲勝…', '判定邪惡獲勝…', '-', '放棄本局…!'])))],
  b: () => [
    steps(
      step(1, null, '點任意座位', '更換角色會私下通知他'),
      step(2, null, '頂欄「⋯」', '規則沒判到的勝負，例如呆瓜選中邪惡')),
    stub(memo(icon('eye'), b('代入他的視角'), sm('只讀，確認信息送到了')),
      memo(b('「流程」標籤'), sm('錯誤紅框，登記橙框')))],
};

// ———— 遊戲規則 ————
const team = (k, name, sub, roles, win) => h('div', { class: 'hp-team ' + k },
  h('div', { class: 'hp-team-h' }, b(name), sm(sub)),
  scene('hp-toks', roles.map((r, i) => nth(i, h('span', { class: 'hp-drop' }, tok(r, 'md'))))),
  h('div', { class: 'hp-win' }, h('span', { class: 'hp-win-k' }, '獲勝'), win));
// 邪惡的勝利：一排座位一個個倒下，只剩兩個
const dwindle = (n, left) => h('span', { class: 'hp-dots' }, Array.from({ length: n }, (_, i) =>
  i < n - left ? nth(i, h('i', { class: 'gone' }, icon('cross'))) : h('i', {})));
const GOAL = {
  key: 'goal', nav: '目標', title: '誰會贏？', vs: true,
  ico: 'trophy',
  a: () => [team('good', '善良', '鎮民和外來者', ['washerwoman', 'empath', 'chef', 'saint'], row(icon('noose'), mini('imp'), b('處決惡魔'))),
    line(big('mask'), '角色是秘密', '可以說真話，也可以說謊')],
  b: () => [team('evil', '邪惡', '爪牙和惡魔', ['poisoner', 'spy', 'imp'], row(dwindle(7, 2), b('只剩 2 人存活'))),
    stub(memo(b('7 人以上首夜'), row(tag('minion'), w('互認'), tag('demon'))),
      memo(row(tag('demon'), w('還得知'), mini('mayor'), mini('virgin'), mini('slayer')), sm('不在場，可偽裝')))],
};

// 一天：一條環線，四站，亮點沿線走一圈
const STOPS = [['night', 'moon', '夜晚', '依次醒來'], ['dawn', 'sun', '天亮', '公佈死訊'], ['talk', 'talk', '白天', '討論、提名'], ['exec', 'noose', '處決', '最多 1 人']];
const DAY = {
  key: 'day', nav: '一天', title: '一天怎麼過',
  ico: 'sun',
  a: () => [scene('hp-loopline',
      svg('hp-track', '0 0 100 100', '<circle cx="50" cy="50" r="38"/><circle class="run" pathLength="1" cx="50" cy="50" r="38"/>'),
      STOPS.map(([k, ico, name, sub], i) => nth(i, h('div', { class: 'hp-stop ' + k }, h('span', { class: 'hp-stop-seal' }, icon(ico)), b(name), sm(sub)))),
      h('div', { class: 'hp-loop-c' }, icon('reset'), b('再入夜'), sm('直到一方獲勝')))],
  b: () => [h('h4', { class: 'hp-h4' }, '死了還在局裏'),
    h('div', { class: 'hp-dead' },
      h('div', { class: 'hp-dead-r' }, h('span', { class: 'hp-yn yes' }, icon('check')), b('能說話')),
      h('div', { class: 'hp-dead-r' }, h('span', { class: 'hp-yn no' }, icon('cross')), b('不能提名')),
      h('div', { class: 'hp-dead-r' }, h('span', { class: 'hp-ticket' }, icon('ticket')), h('div', { class: 'hp-say' }, b('一張死亡票'), sm('投出去就沒了'))))],
};

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
      h('span', { class: 'hp-stamp' }, '上處決台')));
}
const hands = n => h('span', { class: 'hp-votes' }, icon('hand'), n);
const VOTE = {
  key: 'vote', nav: '處決', title: '怎麼處決人',
  ico: 'noose',
  a: () => [sketch('day', {
      zoom: { box: [-41, -23, 82, 46], detail: h('div', { class: 'skd-trial narrow' },
        mk(1, h('span', { class: 'skd-row' }, sb(2, 'lg'), h('b', { class: 'hp-stamp sm' }, '提名'), sb(5, 'lg')), 'r'),
        h('span', { class: 'skd-row' }, mk(2, h('span', { class: 'vbtn yes' }, icon('hand'), '贊成', h('i', {}, 3))),
          h('span', { class: 'vbtn no' }, icon('abstain'), '棄權', h('i', {}, 0)), h('span', { class: 'hp-timer' }, icon('timer'), '4:52')),
        h('span', { class: 'skd-row foot' }, gray(30), gray(30), gray(30), gray(30))) },
    },
      at(0, 0, h('div', { class: 'sk-trial' },
        h('span', { class: 'sk-line' }, h('i', { class: 'sk-tok' }), h('b', { class: 'sk-stamp' }, '提名'), h('i', { class: 'sk-tok bad' })),
        h('span', { class: 'sk-line' }, skBtn('贊成', 'yes'), tph(7), tph(10)), tph(28))))],
  b: () => [
    steps(
      step(1, null, '提名', '每天提名 1 次、被提名 1 次'),
      step(2, null, '舉手', '按「贊成」；倒數結束時舉著的才算'),
      step(3, tally(), '計票', '7 人存活要 4 票：一半，向上取整'),
      step(4, h('span', { class: 'hp-col2' }, row(sb(5), hands(4), w('比'), sb(2), hands(3)), row(sb(5), hands(4), w('和'), sb(2), hands(4))),
        '最高票上台', '白天結束時處決；平票就沒人處決')),
    stub(memo(icon('abstain'), b('棄權'), icon('hidden'), sm('只有你和說書人看得到')))],
};

const regAs = (roleId, tags) => block('reg', h('h4', {}, ROLES[roleId].name), scene('hp-reg', tok(roleId, 'md'),
  h('span', { class: 'hp-as' }, w('可能被當作'), h('span', { class: 'hp-tags' }, tags.map(([t, l], i) => nth(i, teamTag(t, l)))))));
const WINS = [['saint', '被處決：善良落敗'], ['mayor', '只剩 3 人且無人處決：善良獲勝'], ['scarletwoman', '5 人以上時惡魔死亡：她接任']];
const TRAP = {
  key: 'trap', nav: '陷阱', title: '小心陷阱',
  ico: 'drop',
  a: () => [block('big', h('h4', {}, '中毒 / 醉酒'), scene('hp-poison', h('span', { class: 'hp-drip' }, icon('drop')), tok('chef', 'md')), sm('能力失效，信息可能是錯的，他自己不知道')),
    block('big', h('h4', {}, '酒鬼'), scene('hp-flip', h('span', { class: 'hp-flip-in' }, h('span', { class: 'f' }, tok('washerwoman', 'md')), h('span', { class: 'b' }, tok('drunk', 'md'))),
      h('span', { class: 'hp-thinks' }, w('以為是'), mini('washerwoman'))), sm('以為自己是鎮民，能力無效'))],
  b: () => [
    regAs('recluse', [['demon', '邪惡'], ['minion', '爪牙'], ['demon', '惡魔']]),
    regAs('spy', [['townsfolk', '善良'], ['townsfolk', '鎮民'], ['outsider', '外來者']]),
    stub(WINS.map(([r, text]) => memo(mini(r), b(ROLES[r].name), sm(text))))],
};

const prize = (ico, n, label) => h('span', { class: 'hp-prize' }, icon(ico), b(n), sm(label));
const SPLAT = '<path d="M50 14c9 0 12 9 20 9s16 5 15 14-6 10-5 17 6 13-1 19-16 2-22 6-10 9-18 6-6-9-13-11-16 0-17-9 7-11 6-18-8-12-1-18 13-2 19-8 8-7 17-7z" fill="#fffdf3" stroke="#2a2622" stroke-width="2"/>'
  + '<circle cx="48" cy="47" r="14" fill="#f2b632" stroke="#2a2622" stroke-width="2"/><ellipse cx="43" cy="42" rx="4" ry="3" fill="#fbe2a0"/>';
const EGGS = {
  key: 'egg', nav: '獎勵', title: '贏了有什麼',
  ico: 'egg',
  a: () => [h('div', { class: 'hp-price' },
      h('div', {}, b('獲勝'), prize('trophy', '+1', '勝利積分'), prize('egg', '+' + EGG.win, '雞蛋')),
      h('div', {}, b('失敗'), h('i'), prize('egg', '+' + EGG.lose, '雞蛋')),
      h('div', {}, b('MVP'), prize('star', '+1', 'MVP 次數'), prize('egg', '+' + EGG.mvp, '雞蛋')),
      h('div', { class: 'quiet' }, b('第一次進房間'), h('i'), prize('egg', String(EGG.start), '雞蛋'))),
    line(h('span', { class: 'hp-crowns' }, crownSvg('good'), crownSvg('evil')), '贏家戴陣營皇冠', '戴到下一次分出勝負')],
  b: () => [
    block('big', h('h4', {}, '扔雞蛋'), scene('hp-throw', sb(1, 'lg'), h('span', { class: 'hp-egg' }, h('span', {}, icon('egg'))),
      h('span', { class: 'hp-target' }, blank(4), svg('hp-splat', '0 0 100 100', SPLAT))), sm('點別人的座位，扔一枚少一枚')),
    block('big', h('h4', {}, '選 MVP'), row(icon('star', 'brass'), w('投給'), sb(3)), sm(`終局後 ${MVP_WINDOW / 1000} 秒，點座位上的星星；平票一起當選`)),
    stub(memo(b('積分榜'), sm('點頂欄的雞蛋數')))],
};

const OPS = {
  key: 'ops', nav: '操作', title: '網頁怎麼用',
  ico: 'tap',
  a: () => [sketch('player', {
      picked: 3,
      // 寬屏：日誌那些在右側欄，規則和「⋯」在頂欄；手機：都在頂欄
      top: { pc: mk(4, h('span', { class: 'sk-line' }, ph(3), skBtn('規則'), skBtn('⋯')), 'tight'),
        mo: [mk(3, h('span', { class: 'sk-line' }, skBtn('日誌'), skBtn('說書人'), skBtn('角色')), 'tight'), mk(4, skBtn('⋯'), 'tight r')] },
      side: mk(3, h('i', { class: 'sk-sidebox' }), 'tight'),
      hud: h('span', { class: 'sk-hud' }, h('i', { class: 'sk-tok' }), h('span', { class: 'sk-bars' }, ph(6), ph(9))),
      zoom: { at: 'hud', detail: h('div', { class: 'skd-col' }, mk(1, h('div', { class: 'skd-hud' },
        h('div', { class: 'skd-row' }, tok('washerwoman'), h('div', { class: 'hp-say' }, b('洗衣婦'), gray(120), gray(90))),
        h('div', { class: 'skd-row info' }, h('b', {}, '第 1 夜'), frm(2, '和', 6, '之中有', { r: 'chef', named: true }))), 't big')) },
    },
      at(0, 10, mk(2, skBtn('確認', 'pri'))))],
  b: () => [
    steps(
      step(1, null, '你的牌', '角色、能力、每晚收到的信息'),
      step(2, scene('hp-pick', row(blank(2), blank(3, 'pick'), blank(4))), '輪到你', '點座位，再按圓桌中央的確認'),
      step(3, null, '日誌、私聊、角色表'),
      step(4, row(fake('規則與流程'), fake('⋯', 'ghost')), '頂欄', '「⋯」裏切繁簡、音效')),
    stub(memo(b('點別人的座位'), sm('扔雞蛋、私聊、標記猜測')),
      memo(h('span', { class: 'hp-skip' }, icon('skip'), '跳過'), sm('開局翻牌、第 N 夜')))],
};

const BOOKS = { st: ['說書人指南', [PREP, NIGHT, INFO, SDAY, AUTO_SEC, FIX]], rules: ['遊戲規則', [GOAL, DAY, VOTE, TRAP, EGGS, OPS]] };
const lastSec = { st: 0, rules: 0 }; // 再打開時翻回上次看的那節

// 一頁紙一章：頁眉（書名、章名）、雙線版框（章標題 + 兩欄：左邊插圖、右邊一步一行；手機上下排）、頁碼
const paper = (part, sec, n) => h('div', { class: 'pp', 'data-sec': sec.key },
  h('div', { class: 'pp-head' }, h('span', {}, part), h('span', {}, sec.title)),
  h('div', { class: 'pp-frame' }, h('div', { class: 'pp-body' }, title(sec.ico, sec.title),
    h('div', { class: 'pp-cols' + (sec.vs ? ' vs' : '') }, h('div', { class: 'pp-a' }, sec.a()), h('div', { class: 'pp-b' }, sec.b())))),
  h('span', { class: 'pp-folio' }, num(n)));

// ———— 翻頁 ————
// 把要翻的那頁沿摺線剪開：摺線是書角原位 C 和書角現位 P 的中垂線。剪下的部分換成翻起來那一面——
// 那一面先按書脊鏡像（它平放時的位置），再沿摺線反射，兩次反射合起來是一個旋轉；摺線兩邊各加一道陰影
const cut = (pts, f) => {
  const out = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  });
  return out;
};
const poly = (pts, ox) => (pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(([x, y]) => `${(x - ox).toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`);
const near = (P, O, r) => { const dx = P.x - O.x, dy = P.y - O.y, d = Math.hypot(dx, dy); return d <= r ? P : { x: O.x + dx * r / d, y: O.y + dy * r / d }; };
const slotOf = (el, x, cls) => h('div', { class: 'bk-slot ' + cls, style: { left: x + 'px' } }, el);

// tSlot：要翻的那一張（佔 x0..x1，書脊在 s；就地剪，不搬動），fSlot：翻起來露出的那一面；cy：捏下角（H）還是上角（0）
// 只加兩層（陰影、翻起來那面）；drop() 撤掉它們，tSlot 原樣還回去
function leaf(spread, { tSlot, fSlot, x0, x1, s, W, H, cy }) {
  const fx0 = 2 * s - x1, outer = s === x0 ? x1 : x0;
  const C = { x: outer, y: cy };
  const band = h('i'), shade = h('div', { class: 'bk-shade', style: { left: x0 + 'px' } }, band);
  const gloss = h('i', { class: 'bk-gloss' });
  fSlot.style.left = fx0 + 'px';
  fSlot.classList.add('flap');
  fSlot.append(gloss);
  const wrap = h('div', { class: 'bk-flapwrap' }, fSlot);
  tSlot.classList.add('turn');
  spread.append(shade, wrap);
  const rect = [[x0, 0], [x1, 0], [x1, H], [x0, H]];
  return {
    C,
    set(P) {
      // 書角離書脊兩端都不能超過紙的長寬：紙是釘在書脊上的
      P = near(near(P, { x: s, y: cy }, W), { x: s, y: H - cy }, Math.hypot(W, H));
      const dx = C.x - P.x, dy = C.y - P.y, d = Math.hypot(dx, dy);
      if (d < 0.5) { tSlot.style.clipPath = ''; shade.style.clipPath = fSlot.style.clipPath = 'polygon(0 0, 0 0, 0 0)'; return; }
      const nx = dx / d, ny = dy / d, Mx = (C.x + P.x) / 2, My = (C.y + P.y) / 2, nM = nx * Mx + ny * My;
      const F = cut(rect, p => nx * p[0] + ny * p[1] - nM);
      tSlot.style.clipPath = poly(cut(rect, p => nM - nx * p[0] - ny * p[1]), x0);
      shade.style.clipPath = poly(F, x0);
      // 翻起來那面：先鏡像過書脊，再沿摺線反射
      const a = 2 * nx * nx - 1, bb = 2 * nx * ny, c = -2 * nx * ny, dd = 1 - 2 * ny * ny;
      const tx = 2 * s * (1 - 2 * nx * nx) + 2 * nM * nx, ty = -4 * s * nx * ny + 2 * nM * ny;
      fSlot.style.transform = `matrix(${a},${bb},${c},${dd},${a * fx0 + tx - fx0},${bb * fx0 + ty})`;
      fSlot.style.clipPath = poly(F.map(([x, y]) => [2 * s - x, y]), fx0);
      // 陰影：底下那頁從摺線往外淡出；翻起來那面在摺線處暗一道、稍遠處亮一道（紙的弧度）
      const ang = Math.atan2(ny, nx) * 180 / Math.PI, len = Math.min(110, d * 0.45);
      Object.assign(band.style, { left: Mx - x0 + 'px', top: My + 'px', width: len + 'px', transform: `rotate(${ang}deg) translateY(-50%)` });
      Object.assign(gloss.style, { left: 2 * s - Mx - fx0 + 'px', top: My + 'px', width: Math.min(160, d * 0.6) + 'px', transform: `rotate(${180 - ang}deg) translateY(-50%)` });
    },
    drop() {
      shade.remove(); wrap.remove(); gloss.remove();
      tSlot.classList.remove('turn'); tSlot.style.clipPath = '';
      fSlot.classList.remove('flap'); fSlot.style.transform = fSlot.style.clipPath = '';
    },
  };
}

// 翻到的頁：要「蓋上去」的東西（印章、朱筆圈、插圖）先停在動畫開頭藏著，翻開落定再放開，
// 這樣翻頁途中露出來的是乾淨的紙，不會先看見、再消失、再蓋一遍
function prime(p) {
  const sc = p.querySelectorAll('.hp-scene');
  p.classList.remove('in'); sc.forEach(el => el.classList.remove('play'));
  void p.offsetWidth;
  p.classList.add('in', 'hold'); sc.forEach(el => el.classList.add('play'));
}

export function showHelp(isSt) {
  const parts = isSt ? ['st', 'rules'] : ['rules'], who = parts[0];
  const secs = parts.flatMap(k => BOOKS[k][1].map(sec => ({ part: BOOKS[k][0], k, sec })));
  const pages = secs.map(({ part, sec }, i) => paper(part, sec, i + 1));
  const ear = h('i', { class: 'bk-ear' });
  const spread = h('div', { class: 'bk-spread' }, ear);
  const tabs = h('nav', { class: 'bk-tabs' }, secs.map(({ k, sec }, i) => h('button', { class: 'bk-tab ' + k, style: { '--k': i }, title: sec.title, onclick: () => jump(i) }, h('span', {}, sec.nav))));
  tabs.style.setProperty('--n', secs.length);
  const stackL = h('i', { class: 'bk-stack l' }), stackR = h('i', { class: 'bk-stack r' });
  const book = h('div', { class: 'bk' }, h('div', { class: 'bk-block' }, stackL, stackR, spread), tabs,
    h('button', { class: 'bk-x', title: '關閉', onclick: closeModal }, icon('cross')));
  const box = modal('規則與流程', book, { cls: 'help' });
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // cur：當前那頁所在的格子。fl：正在翻的那頁（mode：peek 懸停掀起、drag 拖著、turn 翻過去、back 落回）
  let one = false, W = 960, H = 700, view = 0, cur = null, fl = null, raf = 0, timer = 0, g = null, queued = 0;
  const can = dir => view + dir >= 0 && view + dir < pages.length;

  // 寬屏一頁橫着兩欄，手機一頁豎着一欄；整本書按窗口大小縮放
  function fit() {
    one = innerWidth < 760;
    book.classList.toggle('one', one);
    W = one ? 400 : 960; H = one ? 740 : 700;
    book.style.zoom = Math.min(one ? 1 : 1.1, (innerWidth - (one ? 8 : 70)) / (W + (one ? 8 : 60)), (innerHeight - (one ? 8 : 40)) / (H + (one ? 48 : 40)));
  }
  // 當前頁定下來：只換掉當前頁那一格，別的不動；索引籤、書口厚度跟著變
  function settle(slot) {
    if (cur && cur !== slot) cur.remove();
    cur = slot;
    cur.className = 'bk-slot flat';
    cur.style.left = '0px';
    if (cur.parentNode !== spread) spread.prepend(cur);
    cur.firstChild.classList.remove('hold');
    leads(cur);
    ear.hidden = !can(1);
    tabs.querySelectorAll('.bk-tab').forEach((x, i) => { x.classList.toggle('on', i === view); x.classList.toggle('past', i < view); });
    const done = view / Math.max(1, pages.length - 1);
    stackL.style.setProperty('--n', done); stackR.style.setProperty('--n', 1 - done);
    lastSec[who] = view;
  }

  // 拿起一頁：dir 往後 1、往前 -1；to 翻到哪；cy 捏哪個角。
  // 往後：當前頁從右邊書角掀起翻到書脊後面，底下露出下一頁；往前：上一頁從書脊那邊書角先過來，蓋回當前頁上
  function begin(dir, to = view + dir, mode = 'drag', cy = H) {
    if (to < 0 || to >= pages.length || to === view) return null;
    const next = pages[to];
    prime(next);
    let lf, made;
    if (dir > 0) {
      const under = slotOf(next, 0, 'under');
      spread.insertBefore(under, cur);
      leads(under);
      lf = leaf(spread, { tSlot: cur, fSlot: slotOf(h('div', { class: 'pp back' }), 0, ''), x0: 0, x1: W, s: 0, W, H, cy });
      made = { under };
    } else {
      const back = slotOf(next, 0, 'flat');
      spread.append(back);
      leads(back);
      const verso = slotOf(h('div', { class: 'pp back' }), -W, '');
      spread.append(verso);
      lf = leaf(spread, { tSlot: verso, fSlot: back, x0: -W, x1: 0, s: 0, W, H, cy });
      made = { verso, back };
    }
    spread.classList.add('turning');
    // 書角走的路：往後從右邊書角到書脊左邊；往前從書脊到右邊書角
    const start = dir > 0 ? { x: W, y: cy } : { x: 0, y: cy }, end = dir > 0 ? { x: -W, y: cy } : { x: W, y: cy };
    const up = cy > 0 ? -1 : 1, lift = H * 0.12;
    fl = {
      dir, to, mode, t: 0,
      at(t) { fl.t = t; lf.set({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t + up * lift * Math.sin(Math.PI * t) }); },
      // 翻成了：新的一頁定下來，翻頁的層全部撤掉
      done() {
        lf.drop();
        spread.classList.remove('turning');
        view = to;
        settle(dir > 0 ? made.under : made.back);
        made.verso?.remove();
        fl = null;
      },
      // 沒翻成：撤掉翻頁的層，當前頁原封不動
      undo() {
        lf.drop();
        spread.classList.remove('turning');
        (made.under || made.back).remove();
        made.verso?.remove();
        fl = null;
      },
    };
    fl.at(0);
    return fl;
  }
  const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; };
  // 書角沿弧線走到 t1（0 平放，1 翻完）
  function tween(t1, ms, then) {
    stop();
    const f = fl, t0 = f.t, s0 = performance.now(), ease = k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    let fin = false;
    const finish = () => { if (fin) return; fin = true; stop(); f.at(t1); then?.(); };
    if (calm()) return finish();
    const frame = now => {
      const k = Math.min(1, (now - s0) / ms);
      f.at(t0 + (t1 - t0) * ease(k));
      if (k < 1) raf = requestAnimationFrame(frame); else finish();
    };
    raf = requestAnimationFrame(frame);
    timer = setTimeout(finish, ms + 300); // 後台標籤頁不出幀時直接到位
  }
  // 翻過去：剩下的路越短越快；落定後要是途中又點過，接著往同一邊翻
  function turnOver(ms = 560, then) {
    const f = fl;
    f.mode = 'turn';
    play(ms < 400 ? 'leaf' : 'pageturn', ms < 400 ? 0.6 : 1);
    tween(1, Math.max(150, ms * (1 - f.t)), () => {
      f.done();
      if (then) return then();
      if (queued && can(f.dir)) { queued--; if (begin(f.dir, view + f.dir, 'turn')) turnOver(360); } else queued = 0;
    });
  }
  const fallBack = (ms = 240) => { const f = fl; f.mode = 'back'; tween(0, ms * Math.max(0.4, f.t * 3), () => f.undo()); };
  // 還在動的那頁馬上到位
  const flush = () => {
    queued = 0;
    if (!fl) return;
    stop();
    if (fl.mode === 'turn') fl.done(); else fl.undo();
  };
  const go = dir => {
    if (fl?.mode === 'turn' && fl.dir === dir) { queued++; return; }
    if (fl?.mode === 'peek' && fl.dir === dir) return turnOver(); // 書角已經掀起：接著翻
    flush();
    if (begin(dir, view + dir, 'turn')) turnOver();
  };
  // 點索引籤：隔得遠就先快速掀過幾頁（最多三頁），最後一頁正常速度翻
  function jump(i) {
    flush();
    const n = Math.abs(i - view), dir = i > view ? 1 : -1;
    if (!n) return;
    const m = calm() ? 1 : Math.min(n, 4), hops = Array.from({ length: m }, (_, k) => view + dir * Math.round(n * (k + 1) / m));
    const step = () => { const t = hops.shift(); if (begin(dir, t, 'turn')) turnOver(hops.length ? 200 : 520, hops.length ? step : null); };
    step();
  }

  // 指針：點頁面右半邊往後翻、左半邊往前翻；按住左右拖，頁跟著走，拖過一小段或甩一下就翻過去，否則落回；
  // 上下拖是捲動（手機上一頁放不下時）。鼠標停在頁邊附近，那邊的書角掀起一點
  const xy = e => { const r = spread.getBoundingClientRect(), k = r.width / W; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k }; };
  const cornerAt = y => (y < H * 0.3 ? 0 : H);
  spread.onpointermove = e => {
    const P = xy(e);
    if (g) {
      const dx = (e.clientX - g.x) / P.k, dy = (e.clientY - g.y) / P.k, now = performance.now();
      g.vx = (e.clientX - g.lx) / P.k / Math.max(1, now - g.lt); g.lx = e.clientX; g.lt = now;
      if (!g.moved) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
        const dir = dx < 0 ? 1 : -1;
        if (fl && !(fl.mode === 'peek' && fl.dir === dir)) flush();
        if (!fl && !can(dir)) return;
        if (!fl) begin(dir, view + dir, 'drag', cornerAt(g.py));
        if (!fl) return;
        stop();
        g.moved = true; g.dir = dir; g.t0 = fl.t;
        fl.mode = 'drag';
        spread.classList.add('grab');
        try { spread.setPointerCapture(e.pointerId); } catch { /* 合成的指針事件沒有可捕獲的指針 */ }
      }
      if (fl) fl.at(Math.max(0, Math.min(1, g.t0 + -dx * g.dir / (W * 0.75))));
      return;
    }
    const side = P.x > W / 2 ? 1 : -1;
    spread.style.cursor = can(side) ? 'pointer' : '';
    if (e.pointerType !== 'mouse' || (fl && fl.mode !== 'peek')) return;
    const edge = side > 0 ? W - P.x < W * 0.14 : P.x < W * 0.14;
    const cy = edge && can(side) ? cornerAt(P.y) : null;
    // 已經掀起一個角：還在同一邊就留著，離開頁邊或換到另一邊就放下
    if (fl) { if (cy == null || fl.dir !== side) fallBack(180); return; }
    if (cy != null && begin(side, view + side, 'peek', cy)) tween(side > 0 ? 0.05 : 0.08, 220);
  };
  spread.onpointerleave = () => { if (!g) spread.style.cursor = ''; if (fl?.mode === 'peek') fallBack(180); };
  spread.onpointerdown = e => {
    if (e.button > 0) return;
    const P = xy(e);
    g = { x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), vx: 0, py: P.y, side: P.x > W / 2 ? 1 : -1, moved: false };
  };
  spread.onpointerup = () => {
    if (!g) return;
    const { moved, side, dir, vx } = g;
    g = null;
    spread.classList.remove('grab');
    if (!moved) { if (can(side)) go(side); return; }
    if (!fl) return;
    if (fl.t > 0.18 || -vx * dir > 0.35) turnOver(); else fallBack();
  };
  spread.onpointercancel = () => { const was = g?.moved; g = null; spread.classList.remove('grab'); if (was && fl) fallBack(); };

  // 鍵盤：左右方向鍵、上下翻頁鍵翻頁；Home / End 翻到頭、翻到尾
  const KEYS = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };
  const onKey = e => {
    if (!box.isConnected) return removeEventListener('keydown', onKey);
    if (KEYS[e.key]) { e.preventDefault(); go(KEYS[e.key]); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); jump(e.key === 'Home' ? 0 : pages.length - 1); }
  };
  // 窗口變了：重新縮放；寬屏和手機之間切換時版面換了，引線重量
  const onResize = () => {
    if (!box.isConnected) return removeEventListener('resize', onResize);
    const was = one;
    fit();
    if (was !== one) { flush(); leads(cur); }
  };
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);

  // 打開：翻回上次看的那章，章蓋下去
  fit();
  view = Math.min(lastSec[who], pages.length - 1);
  prime(pages[view]);
  settle(slotOf(pages[view], 0, 'flat'));
}
