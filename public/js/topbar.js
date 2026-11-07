// 頂欄：房間號、規則、身份；其餘收進 ⋯ 菜單（放棄本局放最後並標紅）。手機上側欄的標籤也放在這裏（點開底部抽屜），
// 劇本名、音效、規則收進 ⋯，⋯ 永遠在屏幕裏
import { h, toast, ask, menu } from './ui.js';
import { muted, setMuted } from './sfx.js';
import { icon } from './glyph.js';
import { getLang, setLang } from './lang.js';
import { sheetTabs } from './side.js';
import { shownEggs, eggGainFx } from './fx.js';
import { openBoard } from './scores.js';
import { openSettings } from './settings.js';
import { SCRIPTS } from './roles.js';
import { openInvite, hostUrl } from './invite.js';
import { openAbout } from './about.js';
import { openPass } from './roompass.js';

export const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => toast(msg, 3500), () => toast(text, 8000));

function eggPill(ctx, me) {
  const gain = eggGainFx();
  return h('button', { class: 'btn sm ghost egg-pill' + (gain ? ' ' + gain.cls : ''), title: '積分榜', 'aria-label': `積分榜，雞蛋 ${shownEggs(me.eggs)} 枚`, style: gain && gain.style, onclick: () => openBoard(ctx) },
    icon('egg'), h('b', {}, shownEggs(me.eggs)), gain && h('i', { class: 'egg-gain' }, '+' + gain.n));
}

export function topbar(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  const stKey = s.isSt && ctx.ls.get('botc.st.' + s.code);
  const inGame = s.phase !== 'lobby' && s.phase !== 'ended';
  const help = () => import('./help.js').then(m => m.showHelp(s.isSt || !!s.peek)), sound = () => { setMuted(!muted()); ctx.render(); };
  const narrow = () => matchMedia('(max-width: 860px)').matches;
  const more = e => menu(e.currentTarget, narrow() ? SCRIPTS[s.scriptId]?.name + (s.mode === 'manual' ? ' · 手動' : '') : null, [
    narrow() && { label: '規則與流程', onclick: help },
    narrow() && { label: [icon(muted() ? 'sound' : 'mute', 'menu-ico'), muted() ? '打開聲音' : '全部靜音'], onclick: sound },
    stKey && { label: '複製說書人鏈接（換設備主持用）',
      onclick: () => copy(hostUrl(s, stKey), '說書人鏈接已複製：換設備時打開它即可繼續主持，不要發給玩家') },
    { label: getLang() === 'sc' ? '切換到繁體' : '切换到简体', onclick: () => { setLang(getLang() === 'sc' ? 'tc' : 'sc'); location.reload(); } },
    { label: [icon('gear', 'menu-ico'), '設置'], onclick: () => openSettings(ctx) },
    { label: [icon('letter', 'menu-ico'), '反饋 · 關於'], onclick: () => openAbout(ctx, 'fb') },
    '-',
    { label: '離開房間', onclick: () => ask('離開房間？之後可以用同一個鏈接回來。', ctx.leave, '離開') },
    // 規則沒自動判到的勝負（呆瓜選中邪惡等）
    s.isSt && inGame && !s.manual && { label: '判定善良獲勝…', onclick: () => ask('直接判定善良陣營獲勝，結束本局？', () => ctx.st('win', { team: 'good' }), '善良獲勝') },
    s.isSt && inGame && !s.manual && { label: '判定邪惡獲勝…', onclick: () => ask('直接判定邪惡陣營獲勝，結束本局？', () => ctx.st('win', { team: 'evil' }), '邪惡獲勝') },
    s.isSt && s.st?.banned > 0 && { label: `讓移出的人回來（${s.st.banned}）`, onclick: () => ctx.st('unban') },
    s.isSt && s.phase !== 'lobby' && { label: '放棄本局…', danger: true, onclick: () => ask('放棄本局？所有角色和進度會清空，玩家留在座位上。', () => ctx.st('abandon'), '放棄本局') },
    s.isSt && { label: '解散房間…', danger: true, onclick: () => ask('解散房間？所有人退回大廳，房間和聊天記錄都會刪掉。', ctx.close, '解散') },
  ]);
  // 房間密碼：說書人點開設定，玩家只看到一把鎖
  const lock = s.isSt && !s.peek
    ? h('button', { class: 'btn sm ghost icon-only lock' + (s.locked ? ' on' : ''), title: '房間密碼', 'aria-pressed': s.locked ? 'true' : 'false',
      onclick: e => openPass(ctx, e.currentTarget) }, icon(s.locked ? 'lock' : 'unlock'))
    : s.locked && h('span', { class: 'lock-tag', title: '房間密碼' }, icon('lock'));
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, '血染鐘樓'),
    // 分享房間的唯一入口；準備階段 PC 上帶字，手機只有房間號
    h('button', { class: 'room', title: '分享房間', onclick: () => openInvite(ctx) }, h('i', {}, '房間 '), h('b', {}, s.code),
      s.phase === 'lobby' && h('span', { class: 'btn sm long' }, '分享房間')),
    lock,
    h('span', { class: 'script-name' }, SCRIPTS[s.scriptId]?.name),
    s.mode === 'manual' && h('span', { class: 'mode-tag' }, '手動'),
    h('span', { class: 'grow' }),
    !s.isSt && !s.peek && !s.stOnline && h('span', { class: 'warn' }, '說書人離線'),
    s.isSt || s.peek ? h('span', { class: 'who' }, '說書人') : me ? h('span', { class: 'who' }, me.name)
      : h('span', { class: 'watch-tag' }, icon('eye'), '觀戰'),
    // 自己的雞蛋數（點開積分榜）；結算時雞蛋飛進來跳一下「+N」。說書人是獎盃
    me ? eggPill(ctx, me) : h('button', { class: 'btn sm ghost icon-only', title: '積分榜', onclick: () => openBoard(ctx) }, icon('trophy')),
    h('button', { class: 'btn sm ghost icon-only sound', title: muted() ? '打開聲音' : '全部靜音', onclick: sound }, icon(muted() ? 'mute' : 'sound')),
    h('button', { class: 'btn sm help', onclick: help }, '規則與流程'),
    sheetTabs(ctx),
    h('button', { class: 'btn sm ghost more', title: '更多', 'aria-label': '更多', onclick: more }, '⋯'));
}
