// 頂欄：房間號、規則、身份；其餘收進 ⋯ 菜單（放棄本局放最後並標紅）。手機上側欄的標籤也放在這裏（點開底部抽屜）
import { h, toast, ask, menu } from './ui.js';
import { showHelp } from './help.js';
import { muted, setMuted } from './sfx.js';
import { icon } from './glyph.js';
import { getLang, setLang } from './lang.js';
import { sheetTabs } from './side.js';
import { shownEggs, eggGainFx } from './fx.js';
import { openBoard } from './scores.js';
import { openSettings } from './settings.js';
import { SCRIPTS } from './roles.js';

export const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => toast(msg, 3500), () => toast(text, 8000));

function eggPill(ctx, me) {
  const gain = eggGainFx();
  return h('button', { class: 'btn sm ghost egg-pill' + (gain ? ' ' + gain.cls : ''), title: '積分榜', style: gain && gain.style, onclick: () => openBoard(ctx) },
    icon('egg'), h('b', {}, shownEggs(me.eggs)), gain && h('i', { class: 'egg-gain' }, '+' + gain.n));
}

export function topbar(ctx) {
  const s = ctx.state, me = s.seats.find(x => x.mine);
  const stKey = s.isSt && ctx.ls.get('botc.st.' + s.code);
  const invite = () => copy(`${location.origin}/?room=${s.code}`, '邀請鏈接已複製');
  const inGame = s.phase !== 'lobby' && s.phase !== 'ended';
  const more = e => menu(e.currentTarget, null, [
    { label: '複製邀請鏈接', onclick: invite },
    stKey && { label: '複製說書人鏈接（換設備主持用）',
      onclick: () => copy(`${location.origin}/?room=${s.code}&st=${stKey}`, '說書人鏈接已複製：換設備時打開它即可繼續主持，不要發給玩家') },
    { label: getLang() === 'sc' ? '切換到繁體' : '切换到简体', onclick: () => { setLang(getLang() === 'sc' ? 'tc' : 'sc'); location.reload(); } },
    { label: [icon('gear', 'menu-ico'), '設置'], onclick: () => openSettings(ctx) },
    '-',
    { label: '離開房間', onclick: () => ask('離開房間？之後可以用同一個鏈接回來。', ctx.leave, '離開') },
    // 規則沒自動判到的勝負（呆瓜選中邪惡等）
    s.isSt && inGame && { label: '判定善良獲勝…', onclick: () => ask('直接判定善良陣營獲勝，結束本局？', () => ctx.st('win', { team: 'good' }), '善良獲勝') },
    s.isSt && inGame && { label: '判定邪惡獲勝…', onclick: () => ask('直接判定邪惡陣營獲勝，結束本局？', () => ctx.st('win', { team: 'evil' }), '邪惡獲勝') },
    s.isSt && s.phase !== 'lobby' && { label: '放棄本局…', danger: true, onclick: () => ask('放棄本局？所有角色和進度會清空，玩家留在座位上。', () => ctx.st('abandon'), '放棄本局') },
  ]);
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, '血染鐘樓'),
    h('span', { class: 'room' }, h('i', {}, '房間 '), h('b', {}, s.code)),
    h('span', { class: 'script-name' }, SCRIPTS[s.scriptId]?.name),
    s.phase === 'lobby' && h('button', { class: 'btn sm invite', onclick: invite }, h('span', { class: 'long' }, '複製邀請鏈接'), h('span', { class: 'short' }, '邀請')),
    h('span', { class: 'grow' }),
    !s.isSt && !s.peek && !s.stOnline && h('span', { class: 'warn' }, '說書人離線'),
    s.isSt || s.peek ? h('span', { class: 'who' }, '說書人') : me && h('span', { class: 'who' }, me.name),
    // 自己的雞蛋數（點開積分榜）；結算時雞蛋飛進來跳一下「+N」。說書人是獎盃
    me ? eggPill(ctx, me) : h('button', { class: 'btn sm ghost icon-only', title: '積分榜', onclick: () => openBoard(ctx) }, icon('trophy')),
    h('button', { class: 'btn sm ghost icon-only', title: muted() ? '打開音效' : '靜音', onclick: () => { setMuted(!muted()); ctx.render(); } }, icon(muted() ? 'mute' : 'sound')),
    h('button', { class: 'btn sm help', onclick: () => showHelp(s.isSt || !!s.peek) }, h('span', { class: 'long' }, '規則與流程'), h('span', { class: 'short' }, '規則')),
    sheetTabs(ctx),
    h('button', { class: 'btn sm ghost more', title: '更多', onclick: more }, '⋯'));
}
