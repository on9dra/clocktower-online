// 關於：頂上是作者的名帖（紅名章、署名、社交賬號），下面三頁——說明、反饋、分享，換頁沿左邊翻（同介紹）。
// 大廳右上角「關於」打開在說明頁、對局裏「⋯ → 反饋 · 關於」打開在反饋頁；署名、賬號在 author.js 填，空著的是虛線佔位。
// 不收打賞：官方的社區內容政策不許拿粉絲作品賺錢，投喂頁拿掉了
import { h, modal, toast } from './ui.js';
import { icon } from './glyph.js';
import { tr, getLang } from './lang.js';
import { play } from './sfx.js';
import { copy } from './topbar.js';
import { AUTHOR } from './author.js';

const ext = (cls, href, ...kids) => h('a', { class: cls, href, target: '_blank', rel: 'noopener' }, ...kids);

// 名帖：署名第一個字（或 seal）蓋成名章；賬號有鏈接的打開，只有號碼的點了複製
function card() {
  const a = AUTHOR, seal = a.seal || Array.from(a.name)[0] || '';
  const link = l => l.url ? ext('ab-link', l.url, l.name, l.handle && h('i', {}, l.handle))
    : l.handle ? h('button', { class: 'ab-link', onclick: () => copy(l.handle, `已複製 ${l.name}：${l.handle}`) }, l.name, h('i', {}, l.handle))
    : h('span', { class: 'ab-link empty' }, l.name);
  return h('div', { class: 'ab-card' },
    h('span', { class: 'ab-seal' + (seal ? '' : ' empty') }, seal || '印'),
    h('div', {},
      h('div', { class: 'ab-by' }, getLang() === 'en' && h('small', {}, 'by'), h('b', { class: 'ab-name' + (a.name ? '' : ' empty') }, a.name || '署名'), getLang() !== 'en' && h('small', {}, '製')),
      h('div', { class: 'ab-links' }, a.links.map(link))));
}

// 反饋：一頁信紙，寄出後蓋「已寄出」；切到別的頁再回來，沒寄的字還在
function fbPage(ctx) {
  const text = h('textarea', { maxlength: 1000, 'aria-label': '反饋內容' });
  const contact = h('input', { maxlength: 60, placeholder: '選填' });
  const letter = h('div', { class: 'ab-letter' }, h('div', { class: 'ab-to' }, '致作者：'), text,
    h('label', { class: 'ab-from' }, h('span', {}, '聯繫方式'), contact),
    h('b', { class: 'ink-stamp ab-stamp', 'aria-hidden': 'true' }, '已寄出'));
  const send = h('button', { class: 'btn' }, icon('send'), '寄出');
  const again = h('button', { class: 'btn' }, '再寫一封');
  send.onclick = async () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return toast('寫點什麼再寄出'); }
    if (!ctx.feedback) return toast('演示頁不能寄出');
    send.classList.add('disabled');
    const r = await ctx.feedback({ text: t, contact: contact.value.trim(), room: ctx.state?.code || '', lang: getLang() });
    send.classList.remove('disabled');
    if (!r.ok) return toast(r.error);
    letter.classList.add('sent');
    text.readOnly = contact.readOnly = true;
    play('stamp');
    send.replaceWith(again);
  };
  again.onclick = () => {
    letter.classList.remove('sent');
    text.readOnly = contact.readOnly = false;
    text.value = '';
    again.replaceWith(send);
    text.focus();
  };
  return h('div', { class: 'ab-fb' }, letter,
    h('div', { class: 'ab-act' }, send, ext('ab-gh', AUTHOR.repo + '/issues', 'GitHub', icon('out'))));
}

// 分享：本站二維碼 + 網址；手機上多一個系統分享
function sharePage() {
  const url = location.origin + '/', tag = tr('快速、簡約、精美的線上魔典');
  return h('div', { class: 'ab-share' },
    h('img', { class: 'inv-qr', src: 'qr.svg?u=' + encodeURIComponent(url), alt: '二維碼', width: 168, height: 168, onload: e => e.target.classList.add('in') }),
    h('b', { class: 'ab-url' }, location.host),
    h('div', { class: 'ab-act' },
      h('button', { class: 'btn', onclick: () => copy(`${tr('血染鐘樓')} · ${tag} ${url}`, '鏈接已複製') }, icon('send'), '複製鏈接'),
      navigator.share && h('button', { class: 'btn', onclick: () => navigator.share({ title: document.title, text: tag, url }).catch(() => {}) }, icon('share'), '分享到…')));
}

// 說明：本站是什麼、不是什麼。第一行直說：免費、不商用、粉絲做的，不是官方
const NOTES = [
  ['mask', '粉絲自製', '免費、非商業的社區工具，不是官方產品。與 The Pandemonium Institute 無關，也未獲其認可；遊戲名、角色名和能力文字歸其所有。'],
  ['book', '開源', ['代碼和原創美術以 MIT 許可發布，', ext('', AUTHOR.repo, 'GitHub')]],
  ['unlock', '免註冊', '房間三天沒有動靜自動刪除，聊天記錄一起刪掉。'],
  ['talk', '沒有語音', '請配合騰訊會議、微信語音等。'],
];
const notePage = () => h('div', { class: 'ab-notes' }, NOTES.map(([ico, k, v], i) => [
  h('b', { class: 'ab-nk', style: { '--i': i } }, icon(ico), k),
  h('span', { class: 'ab-nv', style: { '--i': i } }, v)]));

const PAGES = [['note', 'book', '說明', notePage], ['fb', 'letter', '反饋', fbPage], ['share', 'share', '分享', sharePage]];

// start：先翻到哪一頁（note / fb / share）
export function openAbout(ctx, start = 'note') {
  const pages = PAGES.map(([k, , , make]) => h('section', { class: 'ab-page ab-p-' + k }, make(ctx)));
  let at = Math.max(0, PAGES.findIndex(p => p[0] === start)), land = null, x0 = null; // land：讓正在翻的那頁立刻落地
  const stage = h('div', { class: 'ab-stage' });
  const tabs = PAGES.map(([, ico, name], i) => h('button', { class: 'ab-tab', onclick: () => go(i) }, icon(ico), name));
  const mark = i => tabs.forEach((t, k) => t.classList.toggle('on', k === i));
  // 往後翻：當前頁沿左邊翻走，露出底下的；往前翻：那頁從左邊翻回來蓋上。連著點時上一頁先落地，每一下都有反應
  // 只把新頁放進來、舊頁拿掉，不動留在台上的節點：一動它的入場動畫就重播。上下靠 .leaf 的 z-index
  function go(i) {
    if (i === at) return;
    land?.();
    const fwd = i > at, cur = pages[at], nxt = pages[i], leaf = fwd ? cur : nxt;
    at = i;
    mark(i);
    stage.append(nxt);
    leaf.classList.add('leaf');
    const open = { transform: 'rotateY(0deg)', filter: 'brightness(1)' }, gone = { transform: 'rotateY(-96deg)', filter: 'brightness(.82)' };
    const a = leaf.animate(fwd ? [open, gone] : [gone, open], { duration: 520, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' });
    const done = () => { if (land !== done) return; land = null; clearTimeout(late); a.cancel(); leaf.classList.remove('leaf'); cur.remove(); };
    const late = setTimeout(done, 800); // 後台標籤頁不出幀時直接翻完
    land = a.onfinish = done;
  }
  // 手機左右滑（在信紙裏劃字不算）
  stage.onpointerdown = e => { x0 = e.target.closest('textarea, input') ? null : e.clientX; };
  stage.onpointerup = e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(Math.min(pages.length - 1, Math.max(0, at + (dx < 0 ? 1 : -1)))); };

  modal(card(), h('div', { class: 'about' }, h('nav', { class: 'ab-tabs' }, tabs), stage), { cls: 'about-modal' });
  stage.append(pages[at]);
  mark(at);
}
