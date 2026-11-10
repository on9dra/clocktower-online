// 邀請和換設備：大號房間號 + 二維碼（面殺時對著屏幕掃）+ 複製鏈接
import { h, modal } from './ui.js';
import { icon } from './glyph.js';
import { copy } from './topbar.js';

// 鏈接帶上房間實例標識（r）：房號回收給新房間後，舊鏈接不會進錯房間
export const inviteUrl = s => `${location.origin}/?room=${s.code}&r=${s.inst}`;
export const hostUrl = (s, key) => `${inviteUrl(s)}&st=${key}`;
const qr = url => h('img', { class: 'inv-qr', src: 'qr.svg?u=' + encodeURIComponent(url), alt: '二維碼', width: 200, height: 200, onload: e => e.target.classList.add('in') });

// 分享房間：建好房間時自動彈一次，之後點頂欄的房間號再打開；關掉時收進房間號
export function openInvite(ctx) {
  const s = ctx.state, key = s.isSt && ctx.ls.get('botc.st.' + s.code);
  const off = s.oneDevice; // 線下局沒有玩家要進來，只留房間號和說書人換設備的鏈接
  modal(off ? '房間' : '分享房間', h('div', { class: 'invite' },
    h('div', { class: 'inv-code' }, s.code.split('').map(c => h('b', {}, c))),
    s.pass && h('div', { class: 'inv-pass', title: '房間密碼' }, icon('lock'), s.pass),
    !off && qr(inviteUrl(s)),
    !off && h('button', { class: 'btn', onclick: () => copy(inviteUrl(s), '邀請鏈接已複製') }, icon('send'), '複製邀請鏈接'),
    // 說書人自己換設備繼續主持用；帶著密鑰，不能發給玩家
    key && h('div', { class: 'inv-host' }, icon('key'), h('span', { class: 'grow' }, '換設備主持'),
      h('button', { class: 'btn sm', onclick: () => copy(hostUrl(s, key), '說書人鏈接已複製：換設備時打開它即可繼續主持，不要發給玩家') }, '複製'))),
  { cls: 'invite-modal', away: () => document.querySelector('.topbar .room') });
}

// 說書人給某個座位發的鏈接：新設備打開（或掃碼）就接過這個座位，原設備退出
export function openSeatLink(ctx, seat, title, token) {
  const url = `${inviteUrl(ctx.state)}&seat=${token}`;
  modal(`${title} 換設備`, h('div', { class: 'invite' },
    qr(url),
    h('button', { class: 'btn', onclick: () => copy(url, `已複製，發給 ${title}`) }, icon('send'), '複製鏈接')),
  { cls: 'invite-modal' });
}
