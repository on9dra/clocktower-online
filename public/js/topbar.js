// 頂欄：房間號、規則、身份；其餘收進 ⋯ 菜單（放棄本局放最後並標紅）。手機上側欄的標籤也放在這裏（點開底部抽屜），
// 劇本名、音效、規則收進 ⋯，⋯ 永遠在屏幕裏
import { h, toast, ask, menu, leaveDom } from './ui.js';
import { muted, setMuted } from './sfx.js';
import { icon } from './glyph.js';
import { langItems } from './lang.js';
import { sheetTabs } from './side.js';
import { shownEggs, eggGainFx } from './fx.js';
import { openBoard } from './scores.js';
import { openSettings } from './settings.js';
import { SCRIPTS } from './roles.js';
import { openInvite, hostUrl } from './invite.js';
import { showRole } from './manual.js';
import { openAbout } from './about.js';
import { openPass } from './roompass.js';

// 複製：navigator.clipboard 只在 https（和 localhost）裏有，深圳那台用 IP 走 http 就沒有——退回藏起來的文本框 + execCommand。
// 還是不行就把文字選好擺在底下一張紙上，自己長按複製；點別處收起
export function copy(text, msg) {
  const ok = () => toast(msg, 3500);
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, () => copyBy(text, ok));
  copyBy(text, ok);
  return Promise.resolve();
}
let hand = null;
function copyBy(text, ok) {
  const ta = h('textarea', { class: 'copy-src', readonly: true, 'aria-hidden': 'true' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* 不支持 */ }
  ta.remove();
  if (copied) return ok();
  if (hand) leaveDom(hand, 200);
  const box = h('textarea', { readonly: true, rows: Math.min(4, Math.ceil(text.length / 40)), 'aria-label': '複製' });
  box.value = text;
  const el = hand = h('div', { class: 'copy-hand' }, box);
  const off = e => { if (el.contains(e.target)) return; document.removeEventListener('pointerdown', off, true); if (hand === el) hand = null; leaveDom(el, 200); };
  document.body.append(el);
  box.focus();
  box.select();
  box.setSelectionRange(0, text.length);
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
}

function eggPill(ctx, me) {
  const gain = eggGainFx();
  return h('button', { class: 'btn sm ghost egg-pill' + (gain ? ' ' + gain.cls : ''), title: '積分榜', 'aria-label': `積分榜，雞蛋 ${shownEggs(me.eggs)} 枚`, style: gain && gain.style, onclick: () => openBoard(ctx) },
    icon('egg'), h('b', {}, shownEggs(me.eggs)), gain && h('i', { class: 'egg-gain' }, '+' + gain.n));
}

// 線下局撤銷：按鈕上寫著要撤的是哪一步
const UNDO_NAME = { setDead: '死亡 / 復活', execute: '處決', nominate: '提名', handVote: '舉手', closeVote: '結算投票', cancelVote: '取消提名', next: '推進',
  dawn: '天亮', setRole: '換角色', setShown: '玩家看到的角色', setAlign: '改陣營', remind: '標記', inform: '信息', tick: '勾選順序', card: '選人', cardPick: '記下選擇',
  cardDrop: '收回', win: '判定勝負', addSeats: '加座位', renameSeat: '改名', kick: '移除座位', moveSeat: '挪座位', shuffleSeats: '打亂座位', draft: '抽取',
  undraft: '取消抽取', setBluff: '偽裝', abandon: '放棄本局', evilInfo: '互認', unpin: '恢復隨機', setRedHerring: '紅鯡魚', setPoison: '中毒', markPick: '選人', markDo: '能力結果' };
function undoButton(ctx) {
  const u = ctx.state.st?.undo, name = u && (UNDO_NAME[u] || '上一步');
  return h('button', { class: 'btn sm ghost undo' + (u ? '' : ' disabled') + (ctx.state.oneDevice ? ' one' : ''), title: u ? `撤銷：${name}` : '沒有可以撤銷的',
    onclick: () => (u ? ctx.st('undo').then(r => r.ok && toast(`已撤銷：${name}`)) : toast('現在沒有可以撤銷的')) }, icon('reset'), h('span', { class: 'undo-k' }, '撤銷'), u && h('small', { class: 'undo-k' }, name));
}

// 頂欄放不下時一級一級收（每次重畫、改窗口大小後量一次）：先收遊戲名和「說書人」，再收撤銷後面的那一步、「撤銷」兩個字，
// 「展示角色卡」的字最後收（線下說書人隨時要用，只剩一隻眼睛認不出來）。手機上的標籤（流程 / 角色）會自己縮起來橫滑，也算放不下
const FIT = ['fit1', 'fit2', 'fit3', 'fit4'];
export function fitTopbar() {
  const bar = document.querySelector('.game:not(.gone) > .topbar');
  if (!bar) return;
  const over = () => bar.scrollWidth > bar.clientWidth + 1 || [...bar.querySelectorAll(':scope > .m-tabs')].some(t => t.scrollWidth > t.clientWidth + 1);
  bar.classList.remove(...FIT);
  for (const c of FIT) { if (!over()) break; bar.classList.add(c); }
}

export function topbar(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  const stKey = s.isSt && ctx.ls.get('botc.st.' + s.code);
  const inGame = s.phase !== 'lobby' && s.phase !== 'ended';
  const help = () => import('./help.js').then(m => m.showHelp(s.isSt || !!s.peek)), sound = () => { setMuted(!muted()); ctx.render(); };
  const narrow = () => matchMedia('(max-width: 860px)').matches;
  // 手機上多設備線下局的說書人頂欄放不下（撤銷、四個標籤都得留）：展示角色卡、積分榜收進「⋯」（hud.css 同一個寬度把按鈕藏掉）
  const tucked = () => s.isSt && !s.peek && s.offline && !s.oneDevice && matchMedia('(max-width: 600px)').matches;
  const more = e => menu(e.currentTarget, narrow() ? SCRIPTS[s.scriptId]?.name + (s.offline ? ' · 線下' : '') : null, [
    narrow() && { label: '規則與流程', onclick: help },
    narrow() && { label: [icon(muted() ? 'sound' : 'mute', 'menu-ico'), muted() ? '打開聲音' : '全部靜音'], onclick: sound },
    tucked() && { label: [icon('eye', 'menu-ico'), '展示角色卡'], onclick: () => showRole(ctx, null) },
    tucked() && { label: [icon('trophy', 'menu-ico'), '積分榜'], onclick: () => openBoard(ctx) },
    // 很窄的手機上觀戰的頂欄放不下獎盃（hud.css），積分榜收到這裏
    !me && !s.isSt && matchMedia('(max-width: 374px)').matches && { label: [icon('trophy', 'menu-ico'), '積分榜'], onclick: () => openBoard(ctx) },
    stKey && { label: '複製說書人鏈接（換設備主持用）',
      onclick: () => copy(hostUrl(s, stKey), '說書人鏈接已複製：換設備時打開它即可繼續主持，不要發給玩家') },
    ...langItems(),
    { label: [icon('gear', 'menu-ico'), '設置'], onclick: () => openSettings(ctx) },
    { label: [icon('letter', 'menu-ico'), '反饋 · 關於'], onclick: () => openAbout(ctx, 'fb') },
    '-',
    { label: '離開房間', onclick: () => ask('離開房間？之後可以用同一個鏈接回來。', ctx.leave, '離開') },
    // 規則沒自動判到的勝負（呆瓜選中邪惡等）
    s.isSt && inGame && { label: '判定善良獲勝…', onclick: () => ask('直接判定善良陣營獲勝，結束本局？', () => ctx.st('win', { team: 'good' }), '善良獲勝') },
    s.isSt && inGame && { label: '判定邪惡獲勝…', onclick: () => ask('直接判定邪惡陣營獲勝，結束本局？', () => ctx.st('win', { team: 'evil' }), '邪惡獲勝') },
    s.isSt && s.st?.banned > 0 && { label: `讓移出的人回來（${s.st.banned}）`, onclick: () => ctx.st('unban') },
    s.isSt && s.phase !== 'lobby' && { label: '放棄本局…', danger: true, onclick: () => ask('放棄本局？所有角色和進度會清空，玩家留在座位上。', () => ctx.st('abandon'), '放棄本局') },
    s.isSt && { label: '解散房間…', danger: true, onclick: () => ask('解散房間？所有人退回大廳，房間和聊天記錄都會刪掉。', ctx.close, '解散') },
  ]);
  // 房間密碼：說書人點開設定，玩家只看到一把鎖
  // 單設備沒有人要進房間，不需要密碼
  const lock = s.oneDevice ? null : s.isSt && !s.peek
    ? h('button', { class: 'btn sm ghost icon-only lock' + (s.locked ? ' on' : ''), title: '房間密碼', 'aria-pressed': s.locked ? 'true' : 'false',
      onclick: e => openPass(ctx, e.currentTarget) }, icon(s.locked ? 'lock' : 'unlock'))
    : s.locked && h('span', { class: 'lock-tag', title: '房間密碼' }, icon('lock'));
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, '血染鐘樓'),
    // 分享房間的唯一入口；準備階段 PC 上帶字，手機只有房間號
    // 單設備沒有人要進房間：房間號只是個記號，不分享
    s.oneDevice ? h('span', { class: 'room' }, h('i', {}, '房間 '), h('b', {}, s.code))
      : h('button', { class: 'room', title: '分享房間', onclick: () => openInvite(ctx) }, h('i', {}, '房間 '), h('b', {}, s.code),
        s.phase === 'lobby' && h('span', { class: 'btn sm long' }, '分享房間')),
    lock,
    h('span', { class: 'script-name' }, SCRIPTS[s.scriptId]?.name),
    s.offline && h('span', { class: 'mode-tag' }, s.oneDevice ? '線下 · 單設備' : '線下'),
    h('span', { class: 'grow' }),
    s.isSt && !s.peek && s.offline && undoButton(ctx),
    // 線下：隨時亮一張角色牌給玩家看（比劃不出來的只有角色）。挑好之後先蓋著，確認了才翻（manual.js showRole）
    s.isSt && !s.peek && s.offline && h('button', { class: 'btn sm ghost show-role' + (s.oneDevice ? '' : ' many'), title: '展示角色卡', onclick: () => showRole(ctx, null) }, icon('eye'), h('span', {}, '展示角色卡')),
    !s.isSt && !s.peek && !s.stOnline && h('span', { class: 'warn' }, '說書人離線'),
    s.isSt || s.peek ? h('span', { class: 'who' }, '說書人') : me ? h('span', { class: 'who' }, me.name)
      : h('span', { class: 'watch-tag' }, icon('eye'), '觀戰'),
    // 自己的雞蛋數（點開積分榜）；結算時雞蛋飛進來跳一下「+N」。說書人是獎盃
    me ? eggPill(ctx, me) : !s.oneDevice && h('button', { class: 'btn sm ghost icon-only board-btn' + (s.isSt && s.offline ? ' st-off' : ''), title: '積分榜', onclick: () => openBoard(ctx) }, icon('trophy')), // 單設備的座位只是名字，沒有積分榜
    h('button', { class: 'btn sm ghost icon-only sound', title: muted() ? '打開聲音' : '全部靜音', onclick: sound }, icon(muted() ? 'mute' : 'sound')),
    h('button', { class: 'btn sm help', onclick: help }, '規則與流程'),
    sheetTabs(ctx),
    h('button', { class: 'btn sm ghost more', title: '更多', 'aria-label': '更多', onclick: more }, '⋯'));
}
