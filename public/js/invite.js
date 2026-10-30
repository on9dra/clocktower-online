// 邀請和換設備：大號房間號 + 二維碼（面殺時對著屏幕掃）+ 複製鏈接
import { h, modal } from './ui.js';
import { icon } from './glyph.js';
import { copy } from './topbar.js';

// 鏈接帶上房間實例標識（r）：房號回收給新房間後，舊鏈接不會進錯房間
export const inviteUrl = s => `${location.origin}/?room=${s.code}&r=${s.inst}`;
export const hostUrl = (s, key) => `${inviteUrl(s)}&st=${key}`;
const qr = url => h('img', { class: 'inv-qr', src: 'qr.svg?u=' + encodeURIComponent(url), alt: '二維碼', width: 200, height: 200 });

// 分享房間：建好房間時自動彈一次，之後在「⋯」裏（或點頂欄的房間號）再打開；關掉時收進「⋯」。from：從哪個按鈕彈出來
export function openInvite(ctx, from = null) {
  const s = ctx.state, key = s.isSt && ctx.ls.get('botc.st.' + s.code);
  modal('分享房間', h('div', { class: 'invite' },
    h('div', { class: 'inv-code' }, s.code.split('').map(c => h('b', {}, c))),
    qr(inviteUrl(s)),
    h('button', { class: 'btn primary', onclick: () => copy(inviteUrl(s), '邀請鏈接已複製') }, icon('send'), '複製邀請鏈接'),
    // 說書人自己換設備繼續主持用；帶著密鑰，不能發給玩家
    key && h('div', { class: 'inv-host' }, icon('key'), h('span', { class: 'grow' }, '換設備主持'),
      h('button', { class: 'btn sm', onclick: () => copy(hostUrl(s, key), '說書人鏈接已複製：換設備時打開它即可繼續主持，不要發給玩家') }, '複製'))),
  { cls: 'invite-modal', from, away: () => document.querySelector('.topbar .more') });
}

// 說書人給某個座位發的鏈接：新設備打開（或掃碼）就接過這個座位，原設備退出
export function openSeatLink(ctx, seat, title, token) {
  const url = `${inviteUrl(ctx.state)}&seat=${token}`;
  modal(seat.bot ? `真人頂替 ${title}` : `${title} 換設備`, h('div', { class: 'invite' },
    qr(url),
    h('button', { class: 'btn primary', onclick: () => copy(url, `已複製，發給 ${title}`) }, icon('send'), '複製鏈接')),
  { cls: 'invite-modal' });
}
